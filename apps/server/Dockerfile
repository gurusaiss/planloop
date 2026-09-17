# Build context must be the repo root (npm workspaces): docker build -f apps/server/Dockerfile .
FROM node:22-bookworm-slim
WORKDIR /repo

# better-sqlite3 needs to compile a native addon; Playwright needs its own
# system deps for headless Chromium.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy the whole repo (not a selective subset) so npm workspace resolution
# always matches what package-lock.json was generated against — a
# selectively-copied build context risks a workspace glob finding a
# different set of packages than the lockfile expects.
COPY . .
RUN npm ci
RUN npx --workspace apps/server playwright install --with-deps chromium
RUN npm run build --workspace apps/server

ENV NODE_ENV=production
EXPOSE 4000
WORKDIR /repo/apps/server

# SQLite + the sandboxed files root both live here; mount this as a volume
# in production so a redeploy doesn't wipe your data — see docker-compose.yml.
VOLUME ["/repo/apps/server/data"]

CMD ["node", "dist/index.js"]
