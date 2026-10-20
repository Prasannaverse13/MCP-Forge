"""Talk to a deployed MCP server: list its tools and call one. Powers the Try it panel."""
from __future__ import annotations

import asyncio
import json

from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


def _headers(token: str | None) -> dict:
    return {"Authorization": f"Bearer {token}"} if token else {}


async def list_tools(url: str, token: str | None = None) -> list[dict]:
    async def go():
        async with streamablehttp_client(url, headers=_headers(token)) as (r, w, _):
            async with ClientSession(r, w) as s:
                await s.initialize()
                res = await s.list_tools()
                return [{"name": t.name, "description": t.description or "", "schema": t.inputSchema or {}}
                        for t in res.tools]
    return await asyncio.wait_for(go(), 20)


async def call_tool(url: str, name: str, args: dict, token: str | None = None) -> dict:
    async def go():
        async with streamablehttp_client(url, headers=_headers(token)) as (r, w, _):
            async with ClientSession(r, w) as s:
                await s.initialize()
                res = await s.call_tool(name, args)
                parts = []
                for c in res.content:
                    text = getattr(c, "text", None)
                    parts.append(text if text is not None else json.dumps(c.model_dump(), default=str))
                out = "\n".join(parts)
                try:  # pretty print JSON results
                    out = json.dumps(json.loads(out), indent=2)
                except Exception:
                    pass
                return {"ok": not res.isError, "text": out[:20000]}
    return await asyncio.wait_for(go(), 45)
