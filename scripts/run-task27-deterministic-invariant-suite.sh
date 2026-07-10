#!/usr/bin/env bash
# Deterministic task-27 invariant suite.
# This gate avoids elapsed-time assertions and validates owner-path invariants.

set -euo pipefail

TEST_FILES=(
  "test/admin/admin-control-snapshot.test.js"
  "test/control-plane/membership-publication-coordinator.test.js"
  "test/control-plane/task27-membership-publication-interleavings.property.test.js"
  "test/distributed/harness/__tests__/assertion-policy.test.js"
  "test/distributed/harness/__tests__/cluster.test.js"
  "test/distributed/harness/__tests__/failure-bundle.test.js"
  "test/distributed/harness/__tests__/root-cause-invariants.test.js"
)

echo "========================================"
echo "Task-27 deterministic invariant suite"
echo "========================================"
printf ' - %s\n' "${TEST_FILES[@]}"
echo ""

node scripts/run-test-files.js --jobs=1 "${TEST_FILES[@]}"
