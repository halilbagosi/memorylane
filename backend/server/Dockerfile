# Build from repo root:
#   docker build -t memorylane-api -f backend/server/Dockerfile backend/server
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

ENV NODE_ENV=production \
  HOST=0.0.0.0 \
  PORT=8080 \
  MEDIA_STORAGE_LOCAL_PATH=/app/uploads/media

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev \
  && npx prisma generate

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/uploads/media \
  && chown -R node:node /app

USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=5 \
  CMD node -e "require('net').connect(Number(process.env.PORT)||8080,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
