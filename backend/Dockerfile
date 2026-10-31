FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm ci rejects lockfiles written on another OS (npm/cli#4828: missing optional wasm packages pulled in by jest).
# npm install still honours the pinned versions in package-lock.json and just fills in those optionals.
RUN npm install --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
# Run as an unprivileged user; uploads live on a mounted volume owned by it.
RUN addgroup -S cims && adduser -S cims -G cims && mkdir -p /data/uploads && chown -R cims:cims /data
COPY --from=build --chown=cims:cims /app/node_modules ./node_modules
COPY --from=build --chown=cims:cims /app/dist ./dist
COPY --from=build --chown=cims:cims /app/prisma ./prisma
COPY --chown=cims:cims package.json ./
USER cims
EXPOSE 3000
# Migrations run as a separate step (see docker-compose.prod.yml), never implicitly on boot.
CMD ["node", "dist/main"]

