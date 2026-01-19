#!/bin/sh
set -e

echo "Syncing database schema..."
node node_modules/.bin/prisma db push --accept-data-loss --skip-generate

echo "Starting application..."
exec node server.js
