PLAN_SYSTEM = """You design MCP servers. Read the API docs and plan the smallest useful set of tools.
Return ONLY a JSON object:
{"server_name": "kebab-case", "auth": "none" | "api_key" | "bearer",
 "env_vars": ["NAME"],
 "tools": [{"name": "snake_case", "description": "one sentence",
            "method": "GET", "url": "https://...", "params": {"name": "type and meaning"},
            "returns": "short description"}]}
Rules: use only endpoints that appear in the docs. 2 to 6 tools. Names must be valid Python identifiers."""

WRITE_SYSTEM = """You write a Python MCP server and its tests.
Return exactly two files, each as a fenced block whose first line is ```file:NAME

```file:server.py
...
```
```file:test_server.py
...
```

server.py rules:
- from mcp.server.fastmcp import FastMCP ; mcp = FastMCP("<server_name>")
- Each planned tool is an `async def` decorated with @mcp.tool(), with type hints and a docstring.
- Use httpx.AsyncClient(timeout=10). Call raise_for_status(). Raise ValueError with a clear message for bad input or empty results.
- Read secrets only from os.environ. Never hard code keys.
- End with: if __name__ == "__main__": mcp.run(transport="streamable-http")

test_server.py rules:
- pytest with async tests (asyncio_mode is auto). Import tools from server.
- Mock every HTTP call with respx so tests need no network. Shape mock payloads exactly like the docs.
- Tests: tool list matches the plan (use `await mcp.list_tools()`), each tool returns the expected shape, and bad input gives a clear error.
- Keep it under 12 tests. One assert idea per test. Test names start with test_.
Do not add any text outside the two blocks."""

FIX_SYSTEM = """You repair an MCP server. You get the current files and the failing test output.
Decide whether the bug is in server.py or in the test (for example a wrong mock). Fix the real cause.
Never delete a test just to make it pass. Never weaken an assert unless the assert is plainly wrong.
Return ONLY the files you changed, each as a fenced block whose first line is ```file:NAME, with the full new content."""
