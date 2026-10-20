"""Where tests run and where the finished server lives.

LocalRunner  - dev mode. Runs generated code on this machine with a trimmed environment.
               It is NOT a sandbox. Use it only on your own laptop.
NebiusRunner - runs tests in a Nebius Serverless Job and deploys a Serverless Endpoint
               through the `nebius` CLI. Flags follow docs.nebius.com. Check them against
               `nebius ai job create --help` in your region before the demo.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import secrets
import shlex
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

import config

HARNESS = Path(__file__).parent / "harness"
PIP_DEPS = ["mcp>=1.2,<2", "httpx", "pytest", "pytest-asyncio", "respx"]
PYTEST_INI = "[pytest]\nasyncio_mode = auto\naddopts = -p no:cacheprovider\n"
# Launcher: sets host and port on the settings object, because env var names differ across mcp releases.
RUN_PY = (
    "import os\n"
    "import server\n"
    "server.mcp.settings.host = os.environ.get('FORGE_HOST', '127.0.0.1')\n"
    "server.mcp.settings.port = int(os.environ.get('FORGE_PORT', '8000'))\n"
    "server.mcp.run(transport='streamable-http')\n"
)


@dataclass
class TestRun:
    tests: list[dict] = field(default_factory=list)
    raw: str = ""
    error: str = ""

    @property
    def passed(self) -> int:
        return sum(1 for t in self.tests if t["outcome"] == "passed")

    @property
    def total(self) -> int:
        return len(self.tests)

    @property
    def ok(self) -> bool:
        return not self.error and self.total > 0 and self.passed == self.total


def _with_harness(files: dict[str, str]) -> dict[str, str]:
    out = dict(files)
    out["conftest.py"] = (HARNESS / "conftest.py").read_text(encoding="utf-8")
    out["pytest.ini"] = PYTEST_INI
    return out


def _parse(raw: str) -> TestRun:
    for line in reversed(raw.splitlines()):
        if line.startswith("FORGE_RESULT "):
            data = json.loads(line[len("FORGE_RESULT "):])
            return TestRun(tests=data["tests"], raw=raw)
    return TestRun(raw=raw, error="Tests produced no result. Output tail:\n" + raw[-1500:])


class LocalRunner:
    name = "local"

    def __init__(self) -> None:
        self._servers: list[subprocess.Popen] = []

    async def run_tests(self, files: dict[str, str]) -> TestRun:
        with tempfile.TemporaryDirectory(prefix="forge-") as d:
            for name, body in _with_harness(files).items():
                (Path(d) / name).write_text(body, encoding="utf-8")
            # Keep the normal environment (Windows needs SYSTEMROOT and the user folders to start Python)
            # but never hand the API keys to generated code.
            env = {k: v for k, v in os.environ.items() if not k.startswith(("NEBIUS_", "TAVILY_"))}
            env.update({"PYTHONPATH": d, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1"})
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "pytest", "-q", "--tb=short", cwd=d, env=env,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
            try:
                out, _ = await asyncio.wait_for(proc.communicate(), config.TEST_TIMEOUT_S)
            except asyncio.TimeoutError:
                proc.kill()
                return TestRun(error=f"Tests timed out after {config.TEST_TIMEOUT_S} s")
            return _parse(out.decode("utf-8", "replace"))

    async def deploy(self, files: dict[str, str], name: str) -> dict:
        d = tempfile.mkdtemp(prefix=f"forge-live-{name}-")
        for fname, body in {**files, "run.py": RUN_PY}.items():
            (Path(d) / fname).write_text(body, encoding="utf-8")
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        env = {**os.environ, "PYTHONUTF8": "1", "FORGE_HOST": "127.0.0.1", "FORGE_PORT": str(port)}
        for k in ("NEBIUS_API_KEY", "TAVILY_API_KEY"):
            env.pop(k, None)
        proc = subprocess.Popen([sys.executable, "run.py"], cwd=d, env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self._servers.append(proc)
        for _ in range(60):
            if proc.poll() is not None:
                raise RuntimeError("Server exited right after start")
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                    return {"url": f"http://127.0.0.1:{port}/mcp", "token": None}
            except OSError:
                await asyncio.sleep(0.25)
        proc.kill()
        raise RuntimeError("Server did not open its port in 15 s")


def _bundle(files: dict[str, str]) -> str:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, body in files.items():
            data = body.encode()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return base64.b64encode(buf.getvalue()).decode()


async def _cli(*args: str, timeout: int = 120) -> str:
    proc = await asyncio.create_subprocess_exec("nebius", *args, stdout=asyncio.subprocess.PIPE,
                                                stderr=asyncio.subprocess.PIPE)
    try:
        out, err = await asyncio.wait_for(proc.communicate(), timeout)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError(f"nebius {' '.join(args[:3])} timed out")
    if proc.returncode != 0:
        raise RuntimeError(f"nebius {' '.join(args[:3])} failed: {err.decode()[-600:]}")
    return out.decode()


def _compute_flags() -> list[str]:
    flags: list[str] = []
    if config.NEBIUS_JOB_PLATFORM:
        flags += ["--platform", config.NEBIUS_JOB_PLATFORM]
    if config.NEBIUS_JOB_PRESET:
        flags += ["--preset", config.NEBIUS_JOB_PRESET]
    return flags


class NebiusRunner:
    name = "nebius"

    async def run_tests(self, files: dict[str, str]) -> TestRun:
        bundle = _bundle(_with_harness(files))
        if len(bundle) > 120_000:
            return TestRun(error="Code bundle is too large for an env var. Shorten the server or mount storage.")
        job = f"forge-{secrets.token_hex(3)}"
        script = (f"pip install -q {' '.join(shlex.quote(p) for p in PIP_DEPS)} 2>&1 | tail -n 2 && "
                  "mkdir /w && cd /w && echo \"$FORGE_BUNDLE\" | base64 -d | tar xz && "
                  "python -m pytest -q --tb=short")
        await _cli("ai", "create", "--type", "job", "--name", job, "--image", config.NEBIUS_BASE_IMAGE,
                   "--container-command", "bash", "--args", "-c " + shlex.quote(script),
                   "--env", f"FORGE_BUNDLE={bundle}", "--timeout", "1h", *_compute_flags())
        job_id = (await _cli("ai", "job", "get-by-name", "--name", job, "--format", "jsonpath={.metadata.id}")).strip()
        try:
            deadline = time.time() + config.TEST_TIMEOUT_S + 240  # image pull and pip take a while
            while time.time() < deadline:
                info = json.loads(await _cli("ai", "job", "get", job_id, "--format", "json"))
                state = str(info.get("status", {}).get("state", "")).upper()
                if any(s in state for s in ("COMPLETED", "SUCCEEDED", "FAILED", "ERROR", "CANCEL")):
                    break
                await asyncio.sleep(4)
            else:
                return TestRun(error="Job did not finish in time")
            logs = await _cli("ai", "job", "logs", job_id, "--since", "1h")
            return _parse(logs)
        finally:
            try:
                await _cli("ai", "job", "delete", job_id)
            except Exception:
                pass

    async def deploy(self, files: dict[str, str], name: str) -> dict:
        if not config.NEBIUS_PROJECT_ID:
            raise RuntimeError("NEBIUS_PROJECT_ID is not set")
        bundle = _bundle({**files, "run.py": RUN_PY})
        token = secrets.token_urlsafe(24)
        script = (f"pip install -q {' '.join(shlex.quote(p) for p in PIP_DEPS[:2])} && "
                  "mkdir /app && cd /app && echo \"$FORGE_BUNDLE\" | base64 -d | tar xz && python run.py")
        ep_name = f"forge-{name}-{secrets.token_hex(2)}"[:40]
        out = await _cli("ai", "endpoint", "create", "--name", ep_name, "--image", config.NEBIUS_BASE_IMAGE,
                         "--parent-id", config.NEBIUS_PROJECT_ID, "--container-command", "bash",
                         "--args", "-c " + shlex.quote(script),
                         "--env", f"FORGE_BUNDLE={bundle}", "--env", "FORGE_HOST=0.0.0.0", "--env", "FORGE_PORT=8080",
                         "--container-port", "8080", "--auth", "token", "--token", token,
                         "--format", "jsonpath={.resource_id}", *_compute_flags(), timeout=300)
        ep_id = out.strip()
        for _ in range(60):
            info = json.loads(await _cli("ai", "endpoint", "get", ep_id, "--format", "json"))
            pub = info.get("status", {}).get("public_endpoints") or []
            if pub:
                first = pub[0] if isinstance(pub[0], str) else (pub[0].get("url") or pub[0].get("address") or "")
                host = first if first.startswith("http") else f"https://{first}"
                return {"url": host.rstrip("/") + "/mcp", "token": token, "endpoint_id": ep_id}
            await asyncio.sleep(5)
        raise RuntimeError("Endpoint did not publish an address in 5 minutes")


def get_runner(name: str | None = None):
    return NebiusRunner() if (name or config.RUNNER) == "nebius" else LocalRunner()
