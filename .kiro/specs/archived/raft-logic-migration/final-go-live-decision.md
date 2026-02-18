# Raft Logic Migration Final Go-Live Decision

Status: `blocked`

Date: `2026-02-18`

## Decision Inputs

1. Requirements 1-11 completion status
2. Benchmark gate results (`3-node`, `5-node`, Postgres baseline comparisons)
3. Stage gate reports (`dev`, `canary`, `limited-production`)
4. Rollback drill summary and recovery timing
5. Open incident count and severity

## Required Pass Conditions

1. Benchmark regression gate is `passed` or mitigated with approved ID.
2. Stage gate reports for `dev`, `canary`, and `limited-production` are `passed`.
3. Rollback drill summary `overall.passed = true`.
4. No unresolved high-severity migration incidents.
5. Runbooks and docs are current in:
   - `.kiro/specs/raft-logic-migration/`
   - `docs/` for end-user-visible behavior

## Current Snapshot

1. Benchmark summary: `.kiro/specs/raft-logic-migration/reports/benchmarks/latest-summary.json`
2. Stage summary: `.kiro/specs/raft-logic-migration/reports/stages/latest.json`
3. Rollback summary: `.kiro/specs/raft-logic-migration/reports/rollback/latest-summary.json`
4. Snapshot outcomes (2026-02-18 run):
   - Benchmark: `overall.passed = false`
   - Benchmark gate: `failed` on `benchmark-5node` (`throughput-regression`)
   - Rollback drill: `overall.passed = false` (2/2 profiles failed with post-restart reachability collapse)
   - Stage gates: `dev = failed`, `canary = failed`, `limited-production = failed`

## Final Decision Record

- Default provider after decision: `liferaft` (unchanged)
- Approved by: `TBD`
- Approved mitigation IDs (if any): `none`
- Follow-up actions:
  1. Resolve rolling-restart reachability failures (`EHOSTUNREACH`) in both 3-node and 5-node rollback drills.
  2. Remove 5-node throughput regression relative to baseline gate threshold.
  3. Re-run benchmark + rollback pipelines and regenerate stage-gate reports.
