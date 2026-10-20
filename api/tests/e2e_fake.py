"""End to end check of the forge loop with a fake model and fake search.
Run:  python tests/e2e_fake.py
Round 1 ships a bug on purpose. The fixer repairs it. Then the server is deployed locally."""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import llm, search  # noqa: E402
from forge import Brief, forge  # noqa: E402

PLAN = {"server_name": "echo-geo", "auth": "none", "env_vars": [],
        "tools": [{"name": "lookup_city", "description": "Find a city", "method": "GET",
                   "url": "https://geo.example/v1/search", "params": {"name": "city"}, "returns": "lat and lon"}]}

BAD_SERVER = '''import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("echo-geo")


@mcp.tool()
async def lookup_city(name: str) -> dict:
    """Find a city."""
    async with httpx.AsyncClient(timeout=10) as http:
        r = await http.get("https://geo.example/v1/search", params={"name": name})
        r.raise_for_status()
    hit = r.json()["results"][0]
    return {"lat": hit["latitude"], "lon": hit["longitude"]}


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
'''

GOOD_SERVER = BAD_SERVER.replace(
    '    hit = r.json()["results"][0]\n',
    '    results = r.json().get("results") or []\n    if not results:\n        raise ValueError(f"No place found for {name!r}")\n    hit = results[0]\n')

TESTS = '''import httpx, pytest, respx
from server import lookup_city, mcp


async def test_tool_listed():
    names = [t.name for t in await mcp.list_tools()]
    assert names == ["lookup_city"]


@respx.mock
async def test_returns_coordinates():
    respx.get("https://geo.example/v1/search").mock(return_value=httpx.Response(
        200, json={"results": [{"latitude": 48.85, "longitude": 2.35}]}))
    assert await lookup_city("Paris") == {"lat": 48.85, "lon": 2.35}


@respx.mock
async def test_unknown_city_has_clear_error():
    respx.get("https://geo.example/v1/search").mock(return_value=httpx.Response(200, json={}))
    with pytest.raises(ValueError, match="No place found"):
        await lookup_city("Nowhere")
'''


async def fake_chat(model, system, user, **kw):
    if "design MCP servers" in system:
        return "```json\n" + json.dumps(PLAN) + "\n```"
    if "write a Python MCP server" in system:
        return f"```file:server.py\n{BAD_SERVER}```\n```file:test_server.py\n{TESTS}```"
    if "repair an MCP server" in system:
        return f"```file:server.py\n{GOOD_SERVER}```"
    raise AssertionError("unexpected prompt")


async def fake_ids(key=None):
    return ["meta/llama", "nvidia/nemotron-3-super", "nvidia/nemotron-3-nano"]


async def fake_docs(api_name, docs_url="", api_key=None):
    return "### Geo docs\nGET /v1/search?name=", [{"url": "https://geo.example/docs", "title": "Geo docs"}]


llm.chat, llm.list_model_ids, search.find_docs = fake_chat, fake_ids, fake_docs


async def main():
    events = [e async for e in forge(Brief(api_name="Echo Geo", max_rounds=3, runner="local"))]
    for e in events:
        if e["type"] in ("step", "done", "error"):
            print(e["type"], {k: v for k, v in e.items() if k in ("key", "state", "detail", "ok", "url", "message", "summary")})
    done = events[-1]
    assert done["type"] == "done" and done["ok"], done
    rounds = [e for e in events if e["type"] == "tests"]
    assert len(rounds) == 2, f"expected 2 test rounds, got {len(rounds)}"
    assert sum(t["outcome"] != "passed" for t in rounds[0]["tests"]) == 1, "round 1 should fail exactly one test"
    assert all(t["outcome"] == "passed" for t in rounds[1]["tests"])
    # the deployed server must answer on its port
    import httpx
    url = done["url"]
    async with httpx.AsyncClient() as http:
        r = await http.post(url, json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "t", "version": "0"}}},
            headers={"Accept": "application/json, text/event-stream"})
    print("deployed server replied", r.status_code)
    assert r.status_code == 200
    print("E2E OK")


if __name__ == "__main__":
    asyncio.run(main())
