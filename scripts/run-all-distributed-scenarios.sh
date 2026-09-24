#!/usr/bin/env bash
# Compatibility entry point for the canonical local distributed matrix.
# Matrix ownership lives in test/distributed/harness/scenario-registry.js;
# execution-target orchestration lives in scripts/run-distributed-matrix.js.

set -euo pipefail

exec node scripts/run-distributed-matrix.js \
  --target local \
  --profile canonical \
  -- "$@"
