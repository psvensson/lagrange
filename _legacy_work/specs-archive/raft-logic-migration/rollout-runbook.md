# Raft Logic Migration Rollout Runbook

This runbook executes staged rollout for `raft_logic` with explicit promotion
gates and auditable artifacts.

## Preconditions

1. Provider selection remains single-provider per process lifetime.
2. No in-process fallback path is enabled.
3. Baseline benchmark reports are available in
   `.kiro/specs/raft-logic-migration/reports/benchmarks/`.

## Stage Order

1. `dev`
2. `canary`
3. `limited-production`

## Commands

1. Run standardized benchmark pipeline:
`npm run migration:raft:benchmarks`

2. Evaluate stage gates:
`npm run migration:raft:stage:dev`
`npm run migration:raft:stage:canary`
`npm run migration:raft:stage:limited`

3. Run rollback drill before canary->limited promotion:
`npm run migration:raft:rollback-drill`

## Promotion Criteria

## Dev

1. Benchmark pipeline passes for both `benchmark-3node` and `benchmark-5node`.
2. No benchmark command failures.

## Canary

1. Dev criteria pass.
2. No high-severity incidents in generated stage report.
3. Benchmark regression gate does not fail.

## Limited Production

1. Canary criteria pass.
2. Rollback drill summary exists and passes.
3. Recovery timing is within operator SLO for restart/redeploy rollback.

## Abort Criteria

1. Benchmark regression gate fails without approved mitigation.
2. Any high-severity stage incident (command failures, gate failures).
3. Rollback drill fails for canary or limited-production profile.

## Incident Summary Location

- Stage reports: `.kiro/specs/raft-logic-migration/reports/stages/`
- Rollback drill reports: `.kiro/specs/raft-logic-migration/reports/rollback/`
