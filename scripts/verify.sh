#!/bin/bash
set -e
echo "=== Polyphonic-Anima Verification ==="
echo "[1/5] Type checking..."    && npx tsc --noEmit
echo "[2/5] Unit tests..."       && npx vitest run --reporter=verbose
echo "[3/5] Integration tests..." && npx vitest run src/test/integration/ --reporter=verbose --passWithNoTests
echo "[4/5] Building..."          && npm run build
echo "[5/5] Launch payload..."    && node scripts/check-launch-payload.mjs
echo "=== All checks passed ==="
