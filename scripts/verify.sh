#!/bin/bash
set -e
echo "=== Polyphonic-Anima Verification ==="
echo "[1/6] Linting..."           && npm run lint
echo "[2/6] Type checking..."     && npx tsc --noEmit
echo "[3/6] Unit tests..."        && npx vitest run --reporter=verbose
echo "[4/6] Integration tests..." && npx vitest run src/test/integration/ --reporter=verbose --passWithNoTests
echo "[5/6] Building..."          && npm run build
echo "[6/6] Launch payload..."    && node scripts/check-launch-payload.mjs
echo "=== All checks passed ==="
