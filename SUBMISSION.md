# MCP Forge submission notes

## 1. Turn on Nebius Serverless Jobs (do this on your laptop)

The code already uses the documented flow: `nebius ai create --type job`, then `nebius ai job get-by-name`, `get` and `logs`.

1. Install the Nebius CLI: https://docs.nebius.com/cli/install
2. Log in and make a profile: `nebius profile create` and follow the browser prompt.
3. Find your project ID: `nebius iam project list`. Put it in `.env` as `NEBIUS_PROJECT_ID`.
4. Pick a platform and preset that your project has quota for. Jobs default to GPU platforms, so for cheap CPU tests check the console under Compute, then set `NEBIUS_JOB_PLATFORM` and `NEBIUS_JOB_PRESET` in `.env`.
5. Check the flags on your region: `nebius ai create --help` and `nebius ai endpoint create --help`.
6. Restart the server. In MCP Forge open Edit setup and choose "Nebius Serverless Jobs". Forge one server.
7. If a command fails, copy the error text into the chat and it gets fixed.

Not checked live: the `--since` flag on `job logs` and the endpoint flags (`--auth`, `--token`).

## 2. Three minute demo video script

0:00 Say the problem: every API needs a hand written MCP server, and the first draft always breaks.
0:15 Show the landing page. Scroll the story once: read, write, test, ship.
0:35 Sign in, finish setup, open the dashboard.
0:50 Type "Open-Meteo weather" and press Forge server.
1:00 Point at each step as it turns green. Say: Tavily reads the docs, Nemotron 3 Super plans and writes the server, tests run, Nemotron 3 Nano repairs failures.
1:45 Open the Code tab, then the Tests tab. Show the pass count.
2:10 If a round fails, show the yellow row and the fix in the next round. This is the best moment, so try an API that fails once.
2:30 Open the Connect tab and paste the config into an MCP client. Ask it for the weather in Paris.
2:50 Close with the tools used: Nebius Token Factory, Nemotron, Tavily, Nebius Serverless.

Record the run on the Nebius runner so the sponsor tools show up on screen.

## 3. Draft feedback for Most Valuable Feedback

Only keep lines that match what you saw. Add your own.

Nebius Token Factory
- Getting the first API key needed billing details with a card before anything else. A trial banner ($1, 29 days) shows in the header, but it was not clear that a card was needed first.
- The promo codes arrived by email with no link to where to apply them. I had to find the docs page. A link in the email would help.
- The model list endpoint returns mixed case ids, for example `nvidia/nemotron-3-super-120b-a12b` and `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`. Matching by name needs a case insensitive search.
- Nemotron 3 Super planned two tools and wrote a 57 line MCP server with 10 tests in about 21 seconds, and the tests passed in the first round.

NVIDIA tools
- Nemotron 3 Super was strong at following a strict output format (one file per fenced block).
- Add your notes on Nano as the fixer after you see it repair a real failure.

Nebius Serverless
- Add your notes after the first real job run: how long the job took to start, what the logs looked like, and anything that was unclear in the CLI.
