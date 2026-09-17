# Costs

Everything below is what's actually wired up in the codebase today, not an
aspirational list.

| Service | Purpose | Free tier | Current limits (as used here) | What happens at the limit | Paid alternative | Replacement option |
|---|---|---|---|---|---|---|
| Local heuristic provider (`providers/local.ts`) | Default AI provider — extractive summarization, no network call | Unlimited, $0, forever | CPU/RAM of the host machine only | N/A — never blocked | N/A | Swap in any real LLM provider via `AI_PROVIDER` |
| SQLite via `better-sqlite3` | Primary datastore | Unlimited, $0, forever | Disk space of the host machine; single-writer (fine for MVP's single process) | Disk full → writes fail with a normal filesystem error | N/A | Postgres/Supabase (schema already carries `workspace_id` for this) |
| Playwright + Chromium | Real browser automation (`browser_snapshot` tool) | Free, open source | Local CPU/RAM per headless browser instance | N/A | N/A (self-hosted only) | N/A |
| Node.js / npm ecosystem | Runtime + all libraries used (Express, cheerio, node-cron, etc.) | Free, open source | N/A | N/A | N/A | N/A |
| OpenAI API (optional, `providers/openai.ts`) | Real LLM planning-rationale text + summarization, only if `OPENAI_API_KEY` is set | Account-dependent; not assumed present | Whatever the user's own account allows | API returns 429/insufficient_quota → the call throws, caught by planner's try/catch which falls back to a template-based rationale string | N/A — user brings their own key | Use `AI_PROVIDER=local` (default) instead |
| Anthropic API (optional, `providers/anthropic.ts`) | Same, if `ANTHROPIC_API_KEY` is set | Account-dependent | Same as above | Same fallback behavior | User's own key | `AI_PROVIDER=local` |
| Google Gemini API (optional, `providers/gemini.ts`) | Same, if `GEMINI_API_KEY` is set | Account-dependent | Same as above | Same fallback behavior | User's own key | `AI_PROVIDER=local` |
| SMTP (optional, for real email notifications) | Not wired up yet — `notify` tool always writes to the local `notifications` table; it only *checks* whether SMTP env vars are present to decide what to report, it never sends | N/A | N/A | N/A | Any SMTP provider once real sending is implemented | Read notifications via `/api/notifications` |

## Total cost to build and run this MVP: $0

No paid account, no cloud subscription, and no API key was required at any
point in development. The entire stack — Node, npm packages, SQLite,
Playwright/Chromium — runs on the local machine.

## What changes at real usage scale

- **SQLite → Postgres**: needed once more than one process needs to write
  concurrently, or true multi-tenant RLS is required. The schema already
  has `workspace_id` everywhere specifically to make this swap mechanical.
- **Local provider → paid LLM provider**: needed once actual natural-language
  understanding (beyond template/keyword matching) is required for a wider
  range of requests. Token costs then apply per the chosen provider's
  pricing — not tracked by this MVP yet (see `docs/ROADMAP.md` for the
  planned usage-tracking abstraction, Section 33 of the brief).
- **Playwright**: remains free regardless of scale; the cost that grows is
  compute (concurrent headless browser instances), not licensing.
