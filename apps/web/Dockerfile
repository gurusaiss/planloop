# Build context must be the repo root (npm workspaces): docker build -f apps/web/Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /repo

COPY . .
RUN npm ci
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build --workspace apps/web

FROM node:22-bookworm-slim
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/apps/web apps/web
COPY --from=build /repo/package.json package.json

WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
