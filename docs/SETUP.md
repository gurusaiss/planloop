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
`docs/COSTS.md`). It also prints a generated bearer token if you haven't
set `ADMIN_TOKEN` — every API route except `/api/health` requires it (see
`docs/SECURITY.md`).

## Run the frontend

```bash
npm run dev:web               # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` if the backend isn't on the default
`http://localhost:4000`. On first load the app asks for the bearer token
from the server's log/`.env` — paste it in, it's stored in your browser's
local storage.

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

## Production build

```bash
npm run build:server                  # apps/server/dist/index.js
NODE_ENV=production ADMIN_TOKEN=... node apps/server/dist/index.js
npm run build --workspace apps/web    # apps/web/.next
NODE_ENV=production npx next start --prefix apps/web -p 3000
```

`NODE_ENV=production` makes the server refuse to start without a real
`ADMIN_TOKEN` (no silently-rotating generated token in production — see
`docs/SECURITY.md`).

## Docker

`Dockerfile`s for both apps and a `docker-compose.yml` are included. They
are written and reviewed for correctness but **not build-verified** in the
environment this was developed in (no Docker daemon available there) — run
`docker compose build && docker compose up` yourself before relying on
them; see `MANUAL_STEPS.md`.
