# Build from repo root: docker build -t memorylane-api -f backend/server/Dockerfile backend/server
FROM node:22-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate \
  && npm run build

FROM node:22-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev \
  && npx prisma generate

COPY --from=builder /app/dist ./dist

RUN chown -R node:node /app

USER node

EXPOSE 8080

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
