#!/bin/bash
set -e
echo "=== Polyphonic-Anima Verification ==="
echo "[1/4] Type checking..."    && npx tsc --noEmit
echo "[2/4] Unit tests..."       && npx vitest run --reporter=verbose
echo "[3/4] Integration tests..." && npx vitest run src/test/integration/ --reporter=verbose --passWithNoTests
echo "[4/4] Building..."          && npm run build
echo "=== All checks passed ==="
