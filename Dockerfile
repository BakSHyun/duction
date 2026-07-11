# 덕션 web/worker 공용 이미지 — ARCHITECTURE.md §4
# web:    기본 CMD (next standalone 서버)
# worker: command: node worker.js
# migrate: builder 타깃에서 npx prisma migrate deploy (compose 참조)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
# postinstall(prisma generate)이 schema를 필요로 함
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate \
  && npm run build \
  # 워커는 단일 JS로 번들 (@prisma/client는 standalone node_modules에서 해석)
  && npx esbuild src/worker/index.ts --bundle --platform=node --format=cjs \
     --outfile=worker.js --external:@prisma/client --external:.prisma

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/assets ./src/assets
COPY --from=builder /app/worker.js ./worker.js
USER app
EXPOSE 3000
ENV HOSTNAME=0.0.0.0 PORT=3000
CMD ["node", "server.js"]
