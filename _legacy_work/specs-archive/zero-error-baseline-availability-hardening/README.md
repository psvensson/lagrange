# Zero-Error Baseline Availability Hardening

This spec package defines how to eliminate real baseline harness failures in
3-node and 7-node distributed runs.

Documents:

1. `failure-analysis-2026-02-23.md` - evidence and diagnosis
2. `requirements.md` - mandatory behavior and acceptance criteria
3. `design.md` - architecture and contract changes
4. `tasks.md` - test-first implementation plan
5. `rollout-and-rollback-notes.md` - staged rollout and fallback strategy
6. `architecture-phased-plan.md` - phased architecture hardening plan for
   startup, join, and readiness

## Canonical Acceptance Profiles

1. 3-node: `test/distributed/config/local-benchmark-3node.json`
2. 7-node: `test/distributed/config/local-benchmark-7node.json`

## Acceptance Commands

1. `node test/distributed/run.js --config test/distributed/config/local-benchmark-3node.json --scenario postgres-baseline-comparison --output test-output/reports/postgres-baseline-3node-acceptance.report.json`
2. `node test/distributed/run.js --config test/distributed/config/local-benchmark-7node.json --scenario postgres-baseline-comparison --output test-output/reports/postgres-baseline-7node-acceptance.report.json`
