  var V2 = [
    'from mcp.server.fastmcp import FastMCP', 'import httpx', '', 'mcp = FastMCP("open-meteo")',
    'GEO = "https://geocoding-api.open-meteo.com/v1/search"', 'API = "https://api.open-meteo.com/v1/forecast"', '', '',
    'async def _locate(city: str) -> tuple[float, float]:', '    async with httpx.AsyncClient(timeout=10) as http:',
    '        r = await http.get(GEO, params={"name": city, "count": 1})', '        r.raise_for_status()',
    '        hits = r.json().get("results") or []', '    if not hits:', '        raise ValueError(f"No place found for {city!r}")',
    '    return hits[0]["latitude"], hits[0]["longitude"]', '', '', '@mcp.tool()', 'async def current_weather(city: str) -> dict:',
    '    """Current temperature and wind for a city."""', '    lat, lon = await _locate(city)', '    async with httpx.AsyncClient(timeout=10) as http:',
    '        r = await http.get(API, params={', '            "latitude": lat, "longitude": lon,', '            "current": "temperature_2m,wind_speed_10m"})',
    '        r.raise_for_status()', '    now = r.json()["current"]', '    return {"city": city, "temp_c": now["temperature_2m"],', '            "wind_kmh": now["wind_speed_10m"]}', '', '',
    '@mcp.tool()', 'async def forecast_7_day(city: str) -> list[dict]:', '    """High, low and rain for the next seven days."""', '    lat, lon = await _locate(city)',
    '    async with httpx.AsyncClient(timeout=10) as http:', '        r = await http.get(API, params={', '            "latitude": lat, "longitude": lon, "forecast_days": 7,',
    '            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum"})', '        r.raise_for_status()', '    d = r.json()["daily"]',
    '    return [{"date": d["time"][i],', '             "high_c": d["temperature_2m_max"][i],', '             "low_c": d["temperature_2m_min"][i],',
    '             "rain_mm": d["precipitation_sum"][i]}', '            for i in range(len(d["time"]))]', '', '',
    'if __name__ == "__main__":', '    mcp.run(transport="streamable-http")'
  ];
  var V1 = V2.filter(function (l) { return l !== "    if not hits:" && l.indexOf("No place found") < 0; }).map(function (l) { return l.replace('d["precipitation_sum"][i]}', 'd["rain_sum"][i]}'); });
  var TPY = 'import httpx, pytest, respx\nfrom server import current_weather, forecast_7_day, mcp\n\n\nasync def test_server_lists_both_tools():\n    names = sorted(t.name for t in await mcp.list_tools())\n    assert names == ["current_weather", "forecast_7_day"]\n\n\n@respx.mock\nasync def test_current_weather_unknown_city_has_clear_error():\n    respx.get(GEO).mock(return_value=httpx.Response(200, json={}))\n    with pytest.raises(ValueError, match="No place found"):\n        await current_weather("Nowhere")\n';
  function T(n, ok, d) { return { name: n, outcome: ok ? "passed" : "failed", detail: d || "", secs: 0.1 }; }
  var T1 = [T("test_server_lists_both_tools", 1), T("test_current_weather_returns_temperature", 1), T("test_current_weather_unknown_city_has_clear_error", 0, "KeyError: 'results'"), T("test_forecast_returns_seven_days", 1), T("test_forecast_has_high_low_and_rain", 0, "KeyError: 'rain_sum'"), T("test_slow_call_times_out_cleanly", 1)];
  var T2 = T1.map(function (t) { return T(t.name, 1); });
  function st(k, n, tool, s, d, sec) { return { type: "step", key: k, name: n, tool: tool, state: s, detail: d, secs: sec }; }
  function lg(t, l) { return { type: "log", text: t, level: l || "" }; }
  var SAMPLE = [
    [200, lg("Brief received: Open-Meteo weather")],
    [100, st("docs", "Read the docs", "Tavily", "run")], [800, st("docs", "Read the docs", "Tavily", "done", "3 pages on open-meteo.com", 4.1)], [0, lg("tavily  3 pages read, 11 endpoints found", "ok")],
    [100, st("plan", "Plan the tools", "Nemotron 3 Super", "run")], [700, st("plan", "Plan the tools", "Nemotron 3 Super", "done", "current_weather and forecast_7_day", 3.2)],
    [100, st("write", "Write the server", "Nemotron 3 Super", "run")], [1000, st("write", "Write the server", "Nemotron 3 Super", "done", V1.length + " lines of Python and 6 tests", 9.8)],
    [0, { type: "code", files: { "server.py": V1.join("\n") + "\n", "test_server.py": TPY }, changed: [] }], [0, lg("write  server.py " + V1.length + " lines", "ok")],
    [100, st("test1", "Run tests, round 1", "Serverless Job", "run")], [1200, st("test1", "Run tests, round 1", "Serverless Job", "warn", "4 of 6 passed", 11.5)],
    [0, { type: "tests", round: 1, tests: T1 }], [0, lg("tests  round 1: 4 of 6 passed", "wn")], [0, lg("FAIL test_current_weather_unknown_city_has_clear_error  KeyError: 'results'", "bad")], [0, lg("FAIL test_forecast_has_high_low_and_rain  KeyError: 'rain_sum'", "bad")],
    [100, st("fix1", "Fix the failures", "Nemotron 3 Nano", "run")], [1200, st("fix1", "Fix the failures", "Nemotron 3 Nano", "done", "Patched server.py", 14.2)],
    [0, { type: "code", files: { "server.py": V2.join("\n") + "\n", "test_server.py": TPY }, changed: ["server.py"] }], [0, lg("fix  patched server.py")],
    [100, st("test2", "Run tests, round 2", "Serverless Job", "run")], [1000, st("test2", "Run tests, round 2", "Serverless Job", "done", "6 of 6 passed", 9.4)],
    [0, { type: "tests", round: 2, tests: T2 }], [0, lg("tests  round 2: 6 of 6 passed", "ok")],
    [100, st("deploy", "Deploy", "Serverless Endpoint", "run")], [800, st("deploy", "Deploy", "Serverless Endpoint", "done", "Live and answering tool calls", 5.6)],
    [0, lg("deploy  https://open-meteo.endpoints.example/mcp", "ok")],
    [100, { type: "done", ok: true, url: "https://open-meteo.endpoints.example/mcp", token: null, server_name: "open-meteo", summary: { passed: 6, total: 6, rounds: 2, secs: 48 } }]
  ];