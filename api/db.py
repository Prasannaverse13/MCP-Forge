"""Accounts, sessions and saved runs in one SQLite file (api/forge.db by default)."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import threading
import time
import uuid
from pathlib import Path

DB_PATH = Path(os.getenv("FORGE_DB", str(Path(__file__).resolve().parent / "forge.db")))
SESSION_DAYS = 30
_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  salt BLOB NOT NULL, pw BLOB NOT NULL, prefs TEXT NOT NULL DEFAULT '{}', created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, api_name TEXT NOT NULL, created REAL NOT NULL,
  status TEXT NOT NULL, passed INTEGER DEFAULT 0, total INTEGER DEFAULT 0, secs INTEGER DEFAULT 0,
  url TEXT, token TEXT, files TEXT NOT NULL DEFAULT '{}', events TEXT NOT NULL DEFAULT '[]', brief TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS runs_user ON runs(user_id, created DESC);
"""


def conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.executescript(SCHEMA)
    return _conn


def _q(sql: str, args: tuple = (), one: bool = False):
    with _lock:
        c = conn()
        cur = c.execute(sql, args)
        rows = cur.fetchall()
        c.commit()
    return (rows[0] if rows else None) if one else rows


# ---------- passwords and sessions

def _hash_pw(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)


def _th(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _user_out(row) -> dict:
    return {"id": row["id"], "email": row["email"], "name": row["name"], "prefs": json.loads(row["prefs"] or "{}")}


def create_user(email: str, password: str, name: str) -> dict:
    email = email.strip().lower()
    if _q("SELECT 1 FROM users WHERE email=?", (email,), one=True):
        raise ValueError("An account with this email already exists. Sign in instead.")
    salt = secrets.token_bytes(16)
    uid = uuid.uuid4().hex
    _q("INSERT INTO users (id,email,name,salt,pw,created) VALUES (?,?,?,?,?,?)",
       (uid, email, name.strip() or email.split("@")[0], salt, _hash_pw(password, salt), time.time()))
    return _user_out(_q("SELECT * FROM users WHERE id=?", (uid,), one=True))


def check_user(email: str, password: str) -> dict | None:
    row = _q("SELECT * FROM users WHERE email=?", (email.strip().lower(),), one=True)
    if not row:
        _hash_pw(password, b"0" * 16)  # same work either way
        return None
    return _user_out(row) if hmac.compare_digest(_hash_pw(password, row["salt"]), row["pw"]) else None


def new_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    _q("INSERT INTO sessions VALUES (?,?,?)", (_th(token), user_id, time.time() + SESSION_DAYS * 86400))
    return token


def session_user(token: str | None) -> dict | None:
    if not token:
        return None
    row = _q("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?",
             (_th(token), time.time()), one=True)
    return _user_out(row) if row else None


def end_session(token: str | None) -> None:
    if token:
        _q("DELETE FROM sessions WHERE token_hash=?", (_th(token),))


def update_user(user_id: str, name: str | None, prefs: dict | None) -> dict:
    if name is not None:
        _q("UPDATE users SET name=? WHERE id=?", (name.strip()[:60], user_id))
    if prefs is not None:
        _q("UPDATE users SET prefs=? WHERE id=?", (json.dumps(prefs)[:4000], user_id))
    return _user_out(_q("SELECT * FROM users WHERE id=?", (user_id,), one=True))


# ---------- runs

def run_start(user_id: str, api_name: str, brief: dict) -> str:
    rid = uuid.uuid4().hex[:12]
    _q("INSERT INTO runs (id,user_id,api_name,created,status,brief) VALUES (?,?,?,?,?,?)",
       (rid, user_id, api_name, time.time(), "running", json.dumps(brief)))
    return rid


def run_finish(rid: str, events: list[dict], files: dict, status: str, done: dict | None) -> None:
    s = (done or {}).get("summary") or {}
    _q("UPDATE runs SET status=?, passed=?, total=?, secs=?, url=?, token=?, files=?, events=? WHERE id=?",
       (status, s.get("passed", 0), s.get("total", 0), s.get("secs", 0), (done or {}).get("url"),
        (done or {}).get("token"), json.dumps(files), json.dumps(events), rid))


def _run_row(r, full: bool) -> dict:
    out = {"id": r["id"], "api_name": r["api_name"], "created": r["created"], "status": r["status"],
           "passed": r["passed"], "total": r["total"], "secs": r["secs"], "url": r["url"]}
    if full:
        out.update(files=json.loads(r["files"]), events=json.loads(r["events"]), brief=json.loads(r["brief"]),
                   token=r["token"])
    return out


def runs_list(user_id: str, limit: int = 50) -> list[dict]:
    return [_run_row(r, False) for r in _q("SELECT * FROM runs WHERE user_id=? ORDER BY created DESC LIMIT ?",
                                            (user_id, limit))]


def run_get(user_id: str, rid: str) -> dict | None:
    r = _q("SELECT * FROM runs WHERE id=? AND user_id=?", (rid, user_id), one=True)
    return _run_row(r, True) if r else None


def run_delete(user_id: str, rid: str) -> bool:
    return bool(_q("DELETE FROM runs WHERE id=? AND user_id=? RETURNING id", (rid, user_id)))
