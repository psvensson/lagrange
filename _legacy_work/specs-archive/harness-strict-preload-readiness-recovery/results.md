# Harness Strict Preload Readiness Recovery Results

## Spec Status

- `PARTIAL` (all planned tasks executed; strict baseline recovery gates still failing)

## Execution Summary (2026-02-27)

Completed implementation through tasks 34, including:

1. Atomic `MOVE_REPLICA` reservations and assignment-token handshake.
2. Single-owner replica invariant on registration/startup paths.
3. Join canonical readiness convergence gate with deterministic reason precedence.
4. Integration regression for strict pre-load convergence diagnostics after concurrent joins.
5. Baseline compare-script run with latest-vs-prior deltas for `3node` and `7node`.

## Baseline Runs

Latest runs executed:

1. `test-output/reports/postgres-baseline-3node-20260227T105400Z.report.json`
2. `test-output/reports/postgres-baseline-7node-20260227T105550Z.report.json`

Observed result:

1. Both runs failed in `pre_load_gate` with `strict_preload_readiness_failed`.
2. Dominant reasons remained discovery/readiness blockers:
   `schema_version_unknown`, `routing_not_ready`, and (7-node) `topology_not_ready`.
3. Load phase did not start (`ops_per_sec=0`).

## Compare Output Highlights

Command executed:

`scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports`

Key deltas:

1. `3node`: still failing pre-load; lagging nodes unchanged at 2/3.
2. `7node`: still failing pre-load; lagging nodes unchanged at 6/7.
3. Saturation counters reported `0` deltas in compare output for both profiles.
4. Throughput/p99 parity remained unavailable because strict gate failed before load.

## Residual Risks

1. Join/discovery readiness still frequently reports null observed schema on joiners.
2. Routing/topology readiness remains unstable in larger fanout runs.
3. CDC retry/out-of-order churn persists during strict pre-load windows.
