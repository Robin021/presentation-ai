# Dependencies image
FROM public.ecr.aws/docker/library/node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Configure npm registry to China mirror
RUN pnpm config set registry https://registry.npmmirror.com

# Install dependencies and generate Prisma client
RUN pnpm install --frozen-lockfile && pnpm prisma generate

# Builder image
FROM public.ecr.aws/docker/library/node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1
RUN pnpm build

# Production image
FROM public.ecr.aws/docker/library/node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Automatically leverage output traces to reduce image size
# This includes a minimal node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma needs to be copied separately because standalone doesn't include it
# Use cp -rL to follow symlinks (pnpm uses symlinks to .pnpm store)
COPY --from=deps /app/node_modules/.pnpm /tmp/.pnpm
RUN mkdir -p node_modules/@prisma node_modules/prisma && \
    cp -rL /tmp/.pnpm/@prisma+client*/node_modules/@prisma/client node_modules/@prisma/ 2>/dev/null || true && \
    cp -rL /tmp/.pnpm/@prisma+engines*/node_modules/@prisma/engines node_modules/@prisma/ 2>/dev/null || true && \
    cp -rL /tmp/.pnpm/prisma*/node_modules/prisma/* node_modules/prisma/ 2>/dev/null || true && \
    rm -rf /tmp/.pnpm

# Copy entrypoint script and set permissions
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && \
    chown nextjs:nodejs docker-entrypoint.sh

USER nextjs

EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["./docker-entrypoint.sh"]
