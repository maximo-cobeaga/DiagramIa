#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
npm ci
npm run check
npm run dev
