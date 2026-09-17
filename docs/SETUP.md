# Setup

Requires Node.js 18+ (developed/tested on Node 22).

```bash
git clone <this local repo>   # or just cd into it — it's a local git repo, no remote
cd automation-platform
cp .env.example .env          # optional — defaults work with zero config
npm install                   # installs all workspaces (apps/web, apps/server, packages/core)
```

## Run the backend

```bash
npm run dev:server            # http://localhost:4000, SQLite db at apps/server/data/app.db
```

On first boot it prints which AI provider it selected — with no API keys
set, it's `local-heuristic` (zero cost, zero network calls; see
`docs/COSTS.md`).

## Run the frontend

```bash
npm run dev:web               # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` if the backend isn't on the default
`http://localhost:4000`.

## Run tests

```bash
npm run test:server
```

## Using a real LLM provider (optional)

Set one of `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` in
`.env` (or `AI_PROVIDER=openai|anthropic|gemini|local` to force a choice).
This only changes the human-facing plan rationale and the quality of
`summarize_text` — it does not change which tools a plan runs (see
`docs/AGENTS.md`).

## Playwright / browser tool

The `browser_snapshot` tool needs a Chromium binary. `npx playwright
install chromium` if you don't already have one on your machine (the dev
sandbox this was built in had one pre-installed).

## Files sandbox

The `file_organize` tool only ever touches paths under
`apps/server/data/files/` (configurable via `FILE_TOOL_ROOT`) — put files
you want it to organize inside a subfolder there.
