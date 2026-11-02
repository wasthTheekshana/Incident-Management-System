#  Backend docker file Stage 1: production dependencies only. Installed fresh instead of `npm prune`, which re-resolves the whole tree
# against the registry and stalls for many minutes with this lockfile.
# npm ci rejects lockfiles written on another OS (npm/cli#4828: missing optional wasm packages pulled in by jest);
# npm install still honours the pinned versions in package-lock.json and just fills in those optionals.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate

# Stage 2: compile TypeScript (needs the dev dependencies, which never reach the final image).
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
# Run as the image's unprivileged `node` user (uid 1000). The uploads folder on the host must be owned by 1000:1000.
RUN mkdir -p /data/uploads && chown -R node:node /data
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
# Migrations run as a separate step (see docker-compose.prod.yml), never implicitly on boot.
CMD ["node", "dist/main"]
