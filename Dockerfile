FROM node:22-alpine AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ARG NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL
ARG NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID=default
ENV NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL=$NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL
ENV NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID=$NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV COZE_PROJECT_ENV=PROD
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ARG NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL
ARG NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID=default
ENV NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL=$NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_PUBLIC_KEY_B64URL
ENV NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID=$NEXT_PUBLIC_STYX_REQUEST_ENCRYPTION_KEY_ID
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY package.json pnpm-lock.yaml .npmrc ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/server/db ./src/server/db
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 5000
CMD ["pnpm", "start"]
