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

# Install shared libraries needed by Chrome for Testing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
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
    unzip \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Download Chrome for Testing from npmmirror mirror — it has a working crashpad_handler,
# unlike Debian's system chromium package.
# Version is resolved from Google's API with a hardcoded fallback (update periodically).
RUN CHROME_VERSION=$(curl -sL --max-time 10 "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions.json" | \
    node -p "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).channels.Stable.version" 2>/dev/null || \
    echo "148.0.7778.97") \
    && echo "Chrome for Testing version: $CHROME_VERSION" \
    && curl -sL "https://registry.npmmirror.com/-/binary/chrome-for-testing/${CHROME_VERSION}/linux64/chrome-linux64.zip" -o /tmp/chrome.zip \
    && unzip /tmp/chrome.zip -d /opt/chrome \
    && rm /tmp/chrome.zip

ENV PUPPETEER_EXECUTABLE_PATH=/opt/chrome/chrome-linux64/chrome

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 --gid nodejs nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

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
