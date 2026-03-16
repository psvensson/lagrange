#!/bin/bash
# Re-run distributed harness scenarios affected by Fixes 12-15
# Outputs reports to .playback/ for comparison

set -e
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUTDIR="test-output/reports/fix12-15-rerun-${TS}"
mkdir -p "$OUTDIR"

echo "=== Fix 12-15 Rerun: ${TS} ==="
echo ""

# 1. seed-restart-under-load (5-node) — Fix 15
echo "[1/6] seed-restart-under-load (5-node)..."
node test/distributed/run.js \
  --config test/distributed/config/local.json \
  --scenario seed-restart-under-load \
  --output "${OUTDIR}/seed-restart-5n.report.json" \
  --verbose 2>&1 | tee "${OUTDIR}/seed-restart-5n.log"
echo ""

# 2. rolling-restart (5-node) — Fix 13
echo "[2/6] rolling-restart (5-node)..."
node test/distributed/run.js \
  --config test/distributed/config/local.json \
  --scenario rolling-restart \
  --output "${OUTDIR}/rolling-restart-5n.report.json" \
  --verbose 2>&1 | tee "${OUTDIR}/rolling-restart-5n.log"
echo ""

# 3. rolling-restart (3-node) — memory leak
echo "[3/6] rolling-restart (3-node)..."
node test/distributed/run.js \
  --config test/distributed/config/local-three-node.json \
  --scenario rolling-restart \
  --output "${OUTDIR}/rolling-restart-3n.report.json" \
  --verbose 2>&1 | tee "${OUTDIR}/rolling-restart-3n.log"
echo ""

# 4. seven-node-rw-txn-recovery — Fix 15
echo "[4/6] seven-node-read-write-load-transaction-recovery (7-node)..."
node test/distributed/run.js \
  --config test/distributed/config/local-benchmark-7node.json \
  --scenario seven-node-read-write-load-transaction-recovery \
  --output "${OUTDIR}/seven-node-rw-txn-recovery.report.json" \
  --verbose 2>&1 | tee "${OUTDIR}/seven-node-rw-txn-recovery.log"
echo ""

# 5. seven-node-postgres-baseline-partition-split — Fixes 12/14
echo "[5/6] seven-node-postgres-baseline-partition-split (7-node)..."
node test/distributed/run.js \
  --config test/distributed/config/local-benchmark-7node-partition-split.json \
  --scenario seven-node-postgres-baseline-partition-split \
  --output "${OUTDIR}/seven-node-partition-split.report.json" \
  --verbose 2>&1 | tee "${OUTDIR}/seven-node-partition-split.log"
echo ""

# 6. seven-node-table-partition-distribution — Fix 12
echo "[6/6] seven-node-table-partition-distribution (7-node)..."
node test/distributed/run.js \
  --config test/distributed/config/local-benchmark-7node.json \
  --scenario seven-node-table-partition-distribution \
  --output "${OUTDIR}/seven-node-table-partition-dist.report.json" \
  --verbose 2>&1 | tee "${OUTDIR}/seven-node-table-partition-dist.log"
echo ""

echo "=== All scenarios complete ==="
echo "Reports in: ${OUTDIR}"
echo ""

# Quick summary
echo "=== Results Summary ==="
for f in "${OUTDIR}"/*.report.json; do
  name=$(basename "$f" .report.json)
  passed=$(node -e "const r=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log(r.summary.passed === r.summary.total ? 'PASS' : 'FAIL')")
  echo "  ${name}: ${passed}"
done
