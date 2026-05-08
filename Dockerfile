# Dependencies image - Use Debian slim for Puppeteer/Chromium support
FROM public.ecr.aws/docker/library/node:20-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*
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

# Download Chrome for Testing from npmmirror mirror (used by Puppeteer for PPTX image export)
# Chrome for Testing has a working crashpad_handler, unlike Debian's system chromium
RUN npx @puppeteer/browsers install chrome@stable \
    --base-url https://registry.npmmirror.com/-/binary/chrome-for-testing/ \
    --path /opt/chrome

# Builder image
FROM public.ecr.aws/docker/library/node:20-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
ENV SKIP_ENV_VALIDATION=1
RUN pnpm build

# Production image with Chrome for Testing for Puppeteer
FROM public.ecr.aws/docker/library/node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install shared libraries needed by Chrome for Testing (not chromium itself —
# we download Chrome for Testing from npmmirror mirror in the deps stage)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    fonts-noto-cjk \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libu2f-udev \
    libvulkan1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    openssl \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Use Chrome for Testing downloaded in the deps stage (has working crashpad_handler)
ENV PUPPETEER_EXECUTABLE_PATH=/opt/chrome/chrome-linux64/chrome

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Copy Chrome for Testing from deps stage (downloaded from npmmirror mirror)
COPY --from=deps /opt/chrome /opt/chrome

# Automatically leverage output traces to reduce image size
# This includes a minimal node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy entrypoint script and set permissions
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && \
    chown nextjs:nodejs docker-entrypoint.sh

USER nextjs

EXPOSE 3001

ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["./docker-entrypoint.sh"]
