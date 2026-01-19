#!/bin/sh
set -e

echo "Generating Prisma client..."
node node_modules/prisma/build/index.js generate

echo "Syncing database schema..."
node node_modules/prisma/build/index.js db push --accept-data-loss --skip-generate

echo "Starting application..."
exec node server.js
