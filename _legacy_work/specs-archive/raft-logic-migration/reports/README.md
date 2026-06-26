# Raft Logic Migration Reports

This directory stores execution artifacts for tasks 9-12 of the raft-logic
migration spec.

## Structure

- `benchmarks/`
  - `latest-summary.json`: most recent standardized 3-node + 5-node benchmark summary.
  - `<timestamp>/benchmark-3node.report.json`: 3-node report from harness runner.
  - `<timestamp>/benchmark-5node.report.json`: 5-node report from harness runner.
  - `<timestamp>/benchmark-summary.json`: per-run rollup with gate status.
- `stages/`
  - `latest.json`: latest stage gate result (any stage).
  - `latest-dev.json`, `latest-canary.json`, `latest-limited-production.json`.
  - `<stage>-<timestamp>.json`: immutable stage gate reports.
- `rollback/`
  - `latest-summary.json`: latest rollback drill summary.
  - `<timestamp>/rollback-*.report.json`: raw harness reports per profile.
  - `<timestamp>/rollback-summary.json`: drill rollup.

## Generation Commands

1. Standard benchmarks:
`npm run migration:raft:benchmarks`

2. Stage gate evaluation:
`npm run migration:raft:stage:dev`
`npm run migration:raft:stage:canary`
`npm run migration:raft:stage:limited`

3. Rollback drill:
`npm run migration:raft:rollback-drill`
