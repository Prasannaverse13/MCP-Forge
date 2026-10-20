"""The forge loop: docs -> plan -> write -> test -> fix -> deploy. Yields UI events."""
from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import AsyncIterator

import config
import llm
import prompts
import search
from runners import get_runner


@dataclass
class Brief:
    api_name: str
    docs_url: str = ""
    tools: str = ""
    writer_model: str = ""
    fixer_model: str = ""
    writer_hint: str = ""
    max_rounds: int = 3
    runner: str = ""
    nebius_key: str | None = None
    tavily_key: str | None = None


def _step(key, name, tool, state, detail="", secs=None):
    return {"type": "step", "key": key, "name": name, "tool": tool, "state": state, "detail": detail,
            "secs": None if secs is None else round(secs, 1)}


def _log(text, level=""):
    return {"type": "log", "level": level, "text": text, "t": round(time.time(), 1)}


def _failure_report(run) -> str:
    if run.error:
        return run.error
    bad = [t for t in run.tests if t["outcome"] != "passed"]
    return "\n\n".join(f"FAILED {t['name']}\n{t['detail']}" for t in bad)[:6000]


async def forge(b: Brief) -> AsyncIterator[dict]:
    t_all = time.time()
    runner = get_runner(b.runner or None)
    files: dict[str, str] = {}
    try:
        # ---- models
        writer, fixer = b.writer_model, b.fixer_model
        if not (writer and fixer):
            picked = llm.pick_models(await llm.list_model_ids(b.nebius_key), b.writer_hint)
            writer, fixer = writer or picked["writer"], fixer or picked["fixer"]
        if not writer:
            raise RuntimeError("No Nemotron model found on Token Factory. Set NEBIUS_WRITER_MODEL.")
        yield _log(f"models  writer={writer}  fixer={fixer}  runner={runner.name}")

        # ---- 1 docs
        t = time.time()
        yield _step("docs", "Find the docs", "Tavily search", "run")
        docs, pages = await search.find_docs(b.api_name, b.docs_url, b.tavily_key)
        if not docs:
            raise RuntimeError("Tavily returned no readable pages. Add a docs URL and try again.")
        yield _step("docs", "Find the docs", "Tavily search", "done", f"Read {len(pages)} pages", time.time() - t)
        yield _log(f"tavily  {len(pages)} pages, {len(docs)} chars", "ok")
        yield {"type": "sources", "pages": pages}

        # ---- 2 plan
        t = time.time()
        yield _step("plan", "Plan the tools", writer, "run")
        want = f"\nThe user wants these tools: {b.tools}" if b.tools.strip() else ""
        plan_raw = await llm.chat(writer, prompts.PLAN_SYSTEM, f"API: {b.api_name}{want}\n\nDOCS:\n{docs}", api_key=b.nebius_key)
        plan = llm.parse_json(plan_raw)
        names = [x["name"] for x in plan.get("tools", [])]
        if not names:
            raise RuntimeError("The plan has no tools")
        yield _step("plan", "Plan the tools", writer, "done", f"{len(names)} tools: {', '.join(names)}", time.time() - t)
        yield _log(f"plan  {', '.join(names)}")

        # ---- 3 write
        t = time.time()
        yield _step("write", "Write the server", writer, "run")
        out = await llm.chat(writer, prompts.WRITE_SYSTEM,
                             f"PLAN:\n{json.dumps(plan, indent=2)}\n\nDOCS:\n{docs}", api_key=b.nebius_key)
        files = llm.parse_files(out)
        if "server.py" not in files or "test_server.py" not in files:
            yield _log("write  the model skipped a file, asking once more", "wn")
            out = await llm.chat(writer, prompts.WRITE_SYSTEM,
                                 f"PLAN:\n{json.dumps(plan, indent=2)}\n\nDOCS:\n{docs[:12000]}\n\n"
                                 "Return BOTH files, each in its own ```file:NAME fence: server.py and test_server.py. "
                                 "Keep the code short. No text outside the fences.", api_key=b.nebius_key)
            files = llm.parse_files(out)
        if "server.py" not in files or "test_server.py" not in files:
            raise RuntimeError("Model did not return server.py and test_server.py")
        lines = files["server.py"].count("\n")
        yield _step("write", "Write the server", writer, "done", f"{lines} lines of Python", time.time() - t)
        yield {"type": "code", "files": files, "changed": []}
        yield _log(f"write  server.py {lines} lines", "ok")

        # ---- 4+ test and fix rounds
        final_run = None
        for rnd in range(1, b.max_rounds + 1):
            t = time.time()
            key = f"test{rnd}"
            yield _step(key, f"Run tests, round {rnd}", f"{runner.name} runner", "run")
            run = await runner.run_tests(files)
            final_run = run
            yield {"type": "tests", "round": rnd, "tests": run.tests, "error": run.error}
            summary = run.error.splitlines()[0] if run.error else f"{run.passed} of {run.total} passed"
            if run.ok:
                yield _step(key, f"Run tests, round {rnd}", f"{runner.name} runner", "done", summary, time.time() - t)
                yield _log(f"tests  round {rnd}: {summary}", "ok")
                break
            yield _step(key, f"Run tests, round {rnd}", f"{runner.name} runner", "warn", summary, time.time() - t)
            yield _log(f"tests  round {rnd}: {summary}", "wn")
            for tr in run.tests:
                if tr["outcome"] != "passed":
                    yield _log(f"FAIL {tr['name']}  {tr['detail'].strip().splitlines()[-1] if tr['detail'].strip() else ''}", "bad")
            if rnd == b.max_rounds:
                break
            # fix
            t = time.time()
            fkey = f"fix{rnd}"
            yield _step(fkey, f"Fix and rerun, round {rnd + 1}", fixer, "run")
            current = "\n\n".join(f"```file:{n}\n{body}```" for n, body in files.items())
            out = await llm.chat(fixer, prompts.FIX_SYSTEM,
                                 f"FILES:\n{current}\n\nFAILURES:\n{_failure_report(run)}\n\nDOCS:\n{docs[:6000]}",
                                 api_key=b.nebius_key)
            patch = {k: v for k, v in llm.parse_files(out).items() if k in ("server.py", "test_server.py")}
            if not patch and fixer != writer:
                yield _log("fix  the small model gave no files, trying the writer model", "wn")
                out = await llm.chat(writer, prompts.FIX_SYSTEM,
                                     f"FILES:\n{current}\n\nFAILURES:\n{_failure_report(run)}\n\nDOCS:\n{docs[:6000]}",
                                     api_key=b.nebius_key)
                patch = {k: v for k, v in llm.parse_files(out).items() if k in ("server.py", "test_server.py")}
            if not patch:
                raise RuntimeError("Fixer returned no files")
            files.update(patch)
            yield _step(fkey, f"Fix and rerun, round {rnd + 1}", fixer, "done", f"Patched {', '.join(patch)}", time.time() - t)
            yield {"type": "code", "files": files, "changed": list(patch)}
            yield _log(f"fix  patched {', '.join(patch)}")

        if not (final_run and final_run.ok):
            yield _log("Stopped. Tests still failing after the allowed rounds.", "bad")
            yield {"type": "done", "ok": False, "summary": {"passed": final_run.passed if final_run else 0,
                   "total": final_run.total if final_run else 0, "secs": round(time.time() - t_all)}}
            return

        # ---- deploy
        t = time.time()
        yield _step("deploy", "Deploy", f"{runner.name} endpoint", "run")
        dep = await runner.deploy(files, plan.get("server_name", "mcp-server"))
        yield _step("deploy", "Deploy", f"{runner.name} endpoint", "done", "Live and answering", time.time() - t)
        yield _log(f"deploy  {dep['url']}", "ok")
        yield {"type": "done", "ok": True, "url": dep["url"], "token": dep.get("token"),
               "server_name": plan.get("server_name", "mcp-server"),
               "summary": {"passed": final_run.passed, "total": final_run.total, "secs": round(time.time() - t_all),
                           "rounds": rnd}}
    except Exception as e:  # surface every failure to the UI in plain words
        yield _log(f"error  {e}", "bad")
        yield {"type": "error", "message": str(e)}
