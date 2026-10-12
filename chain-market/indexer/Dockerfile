# ── AIRcoin Event Indexer & C4 API Dockerfile ──
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Production Image ──
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Directory for indexer local sqlite/json cache
RUN mkdir -p /app/data

EXPOSE 3002

CMD ["node", "dist/server.js"]
