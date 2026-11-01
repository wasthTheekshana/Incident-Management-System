FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
# npm ci rejects lockfiles written on another OS (npm/cli#4828); npm install still honours the pinned versions.
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# Unprivileged nginx (runs as a non-root user, listens on 8080).
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
