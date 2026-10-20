"""Settings read from the environment. See .env.example."""
import os
from pathlib import Path


def _load_env() -> None:
    """Read KEY=VALUE lines from api/.env or the project root .env. Real environment values win."""
    here = Path(__file__).resolve().parent
    for path in (here / ".env", here.parent / ".env"):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            val = val.strip().strip('"').strip("'")
            if val:
                os.environ.setdefault(key.strip(), val)


_load_env()

NEBIUS_BASE_URL = os.getenv("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/")
NEBIUS_API_KEY = os.getenv("NEBIUS_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# Leave empty to auto-pick from the Token Factory model list (any id containing "nemotron").
WRITER_MODEL = os.getenv("NEBIUS_WRITER_MODEL", "")
FIXER_MODEL = os.getenv("NEBIUS_FIXER_MODEL", "")

# "local" runs tests and the server on this machine (dev only, code is not sandboxed).
# "nebius" runs tests in a Nebius Serverless Job and deploys a Serverless Endpoint.
RUNNER = os.getenv("FORGE_RUNNER", "local")

NEBIUS_PROJECT_ID = os.getenv("NEBIUS_PROJECT_ID", "")
NEBIUS_JOB_PLATFORM = os.getenv("NEBIUS_JOB_PLATFORM", "")  # example: cpu-d3 (check your region)
NEBIUS_JOB_PRESET = os.getenv("NEBIUS_JOB_PRESET", "")      # example: 4vcpu-16gb
NEBIUS_BASE_IMAGE = os.getenv("NEBIUS_BASE_IMAGE", "python:3.12-slim")

MAX_DOC_CHARS = int(os.getenv("FORGE_MAX_DOC_CHARS", "14000"))
TEST_TIMEOUT_S = int(os.getenv("FORGE_TEST_TIMEOUT", "120"))
