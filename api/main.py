"""MCP Forge API.  Run:  python -m uvicorn main:app --port 8000"""
from __future__ import annotations

import io
import json
import re
import shutil
import zipfile
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import config
import db
import llm
import tools
from forge import Brief, forge

app = FastAPI(title="MCP Forge")
app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

COOKIE = "forge_session"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------------- auth helpers

def current_user(forge_session: str | None = Cookie(None)) -> dict:
    user = db.session_user(forge_session)
    if not user:
        raise HTTPException(401, "Sign in to continue.")
    return user


def _set_cookie(resp: Response, req: Request, token: str) -> None:
    resp.set_cookie(COOKIE, token, max_age=db.SESSION_DAYS * 86400, httponly=True, samesite="lax",
                    secure=req.url.scheme == "https", path="/")


class SignUp(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)
    name: str = Field("", max_length=60)


class SignIn(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class MePatch(BaseModel):
    name: str | None = Field(None, max_length=60)
    prefs: dict | None = None


@app.post("/api/auth/signup")
def signup(body: SignUp, req: Request, resp: Response):
    if not EMAIL_RE.match(body.email.strip()):
        raise HTTPException(400, "Enter a valid email address.")
    if len(body.password) < 8:
        raise HTTPException(400, "Use at least 8 characters for your password.")
    try:
        user = db.create_user(body.email, body.password, body.name)
    except ValueError as e:
        raise HTTPException(409, str(e))
    _set_cookie(resp, req, db.new_session(user["id"]))
    return user


@app.post("/api/auth/signin")
def signin(body: SignIn, req: Request, resp: Response):
    user = db.check_user(body.email, body.password)
    if not user:
        raise HTTPException(401, "Email or password is wrong.")
    _set_cookie(resp, req, db.new_session(user["id"]))
    return user


@app.post("/api/auth/signout")
def signout(resp: Response, forge_session: str | None = Cookie(None)):
    db.end_session(forge_session)
    resp.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/me")
def me(user: dict = Depends(current_user)):
    return user


@app.patch("/api/me")
def me_patch(body: MePatch, user: dict = Depends(current_user)):
    return db.update_user(user["id"], body.name, body.prefs)


# ---------------- health

@app.get("/api/health")
async def health():
    models, err = {}, ""
    if config.NEBIUS_API_KEY:
        try:
            models = llm.pick_models(await llm.list_model_ids())
        except Exception as e:  # bad key, network
            err = str(e)[:200]
    return {
        "ok": True,
        "auth": True,
        "runner": config.RUNNER,
        "runners": ["local"] + (["nebius"] if shutil.which("nebius") else []),
        "nebius_key": bool(config.NEBIUS_API_KEY),
        "tavily_key": bool(config.TAVILY_API_KEY),
        "models": models,
        "error": err,
    }


# ---------------- forge

class ForgeBody(BaseModel):
    api_name: str = Field(min_length=2, max_length=80)
    docs_url: str = Field("", max_length=400)
    tools: str = Field("", max_length=600)
    writer_hint: str = Field("", max_length=10)  # super, ultra or nano
    max_rounds: int = Field(3, ge=1, le=5)
    runner: str = ""  # "local" or "nebius". Empty uses FORGE_RUNNER.


@app.post("/api/forge")
async def run_forge(body: ForgeBody, user: dict = Depends(current_user)):
    brief = Brief(api_name=body.api_name, docs_url=body.docs_url, tools=body.tools,
                  writer_hint=body.writer_hint.lower(), max_rounds=body.max_rounds, runner=body.runner)
    rid = db.run_start(user["id"], body.api_name, body.model_dump())

    async def stream():
        events: list[dict] = []
        files: dict = {}
        status, done = "stopped", None
        try:
            yield f"data: {json.dumps({'type': 'run', 'id': rid})}\n\n"
            async for ev in forge(brief):
                events.append(ev)
                if ev["type"] == "code":
                    files = ev["files"]
                elif ev["type"] == "done":
                    done, status = ev, ("live" if ev.get("ok") else "failed")
                elif ev["type"] == "error":
                    status = "failed"
                yield f"data: {json.dumps(ev)}\n\n"
        finally:  # also runs when the user presses Stop and the stream closes
            db.run_finish(rid, events, files, status, done)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------------- history

def _run_or_404(user: dict, rid: str) -> dict:
    run = db.run_get(user["id"], rid)
    if not run:
        raise HTTPException(404, "That server was not found.")
    return run


@app.get("/api/runs")
def runs(user: dict = Depends(current_user)):
    return db.runs_list(user["id"])


@app.get("/api/runs/{rid}")
def run_get(rid: str, user: dict = Depends(current_user)):
    return _run_or_404(user, rid)


@app.delete("/api/runs/{rid}")
def run_delete(rid: str, user: dict = Depends(current_user)):
    if not db.run_delete(user["id"], rid):
        raise HTTPException(404, "That server was not found.")
    return {"ok": True}


@app.get("/api/runs/{rid}/zip")
def run_zip(rid: str, user: dict = Depends(current_user)):
    run = _run_or_404(user, rid)
    if not run["files"]:
        raise HTTPException(400, "This run has no code yet.")
    slug = re.sub(r"[^a-z0-9]+", "-", run["api_name"].lower()).strip("-") or "mcp-server"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, body in run["files"].items():
            z.writestr(f"{slug}/{name}", body)
        z.writestr(f"{slug}/requirements.txt", "mcp>=1.2,<2\nhttpx\npytest\npytest-asyncio\nrespx\n")
        z.writestr(f"{slug}/README.md", f"# {run['api_name']} MCP server\n\nMade with MCP Forge.\n\n"
                   "```\npip install -r requirements.txt\npytest -q\npython server.py\n```\n")
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{slug}.zip"'})


class CallBody(BaseModel):
    tool: str = Field(min_length=1, max_length=120)
    args: dict = {}


@app.get("/api/runs/{rid}/tools")
async def run_tools(rid: str, user: dict = Depends(current_user)):
    run = _run_or_404(user, rid)
    if not run["url"]:
        raise HTTPException(400, "This server is not live.")
    try:
        return await tools.list_tools(run["url"], run["token"])
    except Exception as e:
        raise HTTPException(502, f"Could not reach the server. It may have stopped. ({str(e)[:160]})")


@app.post("/api/runs/{rid}/call")
async def run_call(rid: str, body: CallBody, user: dict = Depends(current_user)):
    run = _run_or_404(user, rid)
    if not run["url"]:
        raise HTTPException(400, "This server is not live.")
    try:
        return await tools.call_tool(run["url"], body.tool, body.args, run["token"])
    except Exception as e:
        raise HTTPException(502, f"The call failed. ({str(e)[:200]})")


web = Path(__file__).resolve().parent.parent / "web"
if web.exists():
    app.mount("/", StaticFiles(directory=web, html=True), name="web")
