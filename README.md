# MCP Forge

Paste an API. Get a tested MCP server.

MCP Forge reads an API's docs, writes an MCP server with NVIDIA Nemotron, runs real tests, fixes its own failures, and deploys the server as a live endpoint. Built for the Nebius x NVIDIA Global AI Hackathon (Coding and Agentic Engineering track).

## How it works

1. **Find docs.** Tavily search and extract pull the current API pages (`api/search.py`).
2. **Plan.** A Nemotron model on Nebius Token Factory picks 2 to 6 tools from the docs.
3. **Write.** The same model writes `server.py` (FastMCP) and `test_server.py` (pytest, HTTP mocked with respx).
4. **Test.** Tests run in a Nebius Serverless Job. A small pytest plugin prints one `FORGE_RESULT` JSON line that the API reads.
5. **Fix.** Failing output goes to a smaller Nemotron model, which patches the files. Repeat up to N rounds.
6. **Deploy.** When every test passes, the server ships as a Nebius Serverless Endpoint with token auth.

The API streams each step to the web app over server sent events.

## Where each sponsor tool is used

| Tool | Use | File |
| --- | --- | --- |
| Nebius Token Factory | All model calls through the OpenAI compatible API at `https://api.tokenfactory.nebius.com/v1/` | `api/llm.py` |
| NVIDIA Nemotron | Writer model (Super, else Ultra) and fixer model (Nano). IDs are discovered from `/v1/models`, any ID containing `nemotron` | `api/llm.py` |
| Nebius Serverless Jobs | Isolated test runs through `nebius ai create --type job` | `api/runners.py` |
| Nebius Serverless Endpoints | Live MCP server through `nebius ai endpoint create` | `api/runners.py` |
| Tavily | Docs search and extract | `api/search.py` |

## Run it

```bash
cd api
pip install -r requirements.txt
cp .env.example .env        # add NEBIUS_API_KEY and TAVILY_API_KEY
export $(grep -v '^#' .env | xargs)
uvicorn main:app --port 8000
```

Open http://127.0.0.1:8000. The API serves the web app from `web/`. Sign in with any email, finish the three onboarding steps, then forge a server from the dashboard.

Two runners:

- `FORGE_RUNNER=local` (default). Tests and the server run on your machine. Development only. Generated code is not sandboxed.
- `FORGE_RUNNER=nebius`. Needs the `nebius` CLI logged in plus `NEBIUS_PROJECT_ID`. Optionally set `NEBIUS_JOB_PLATFORM` and `NEBIUS_JOB_PRESET`.

Try the whole UI with no keys (fake model and fake search, real test loop and real deploy):

```bash
cd api && python tests/serve_fake.py     # then open http://127.0.0.1:8000
python tests/e2e_fake.py                 # command line check of the loop
```

Edit the UI in `web/src.html`, then run `python web/build.py` to write `web/index.html`.

## Status and honest notes

- The loop, SSE stream, local runner and local deploy are tested end to end with a fake model (`tests/e2e_fake.py`).
- The Nebius runner follows the CLI flags in the Nebius docs, but it has not been run against a live account. Check `nebius ai create --help` and `nebius ai endpoint create --help` for your region first. The code bundle travels as a base64 env var, so very large servers are refused.
- Nemotron model IDs are not hard coded. Set `NEBIUS_WRITER_MODEL` and `NEBIUS_FIXER_MODEL` if auto pick chooses the wrong ones.
- Generated servers pin `mcp<2`. MCP SDK 2.x renamed `FastMCP`, which breaks generated code.
- Accounts are real: sign up and sign in use a local SQLite file (api/forge.db) with scrypt password hashes and an HttpOnly session cookie. API keys are never typed in the browser. They live only in the server .env file.
- Each user sees only their own saved servers. The dashboard can reopen a server, call its tools (Try it) and download a zip.

## License

MIT. See `LICENSE`.

## Status of the Nebius runner

Tests and deploy run on the local runner by default (the same machine as the API). The Nebius runner (Serverless Job for tests and Serverless Endpoint for deploy, through the `nebius` CLI) is written but has not been run end to end yet. The Nebius CLI supports Ubuntu and macOS only, so it was not tested from Windows. Models and docs search already run on Nebius Token Factory and Tavily.

## Public demo on Render

`render.yaml` deploys the API and the web app as one service. Steps: push to GitHub, then in Render choose New, Blueprint, pick this repo, and add `NEBIUS_API_KEY` and `TAVILY_API_KEY` in the dashboard. The blueprint turns on limits (3 servers per account per day, 40 per day in total, 2 at a time) so a public link cannot drain your credits.

Notes for the hosted demo:
- The test runner is the local runner. It runs the generated code on the Render machine. Keep the limits on, and use a Nebius or Tavily key that has a spending cap.
- The free plan sleeps after idle time (first load can take about a minute) and its disk is cleared on each deploy, so accounts and saved servers reset.
- Deployed endpoints listen inside the Render machine. The Try it tab works. To use a generated server from your own MCP client, download the zip and run it locally.
