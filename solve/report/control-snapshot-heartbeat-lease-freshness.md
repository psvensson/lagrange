# Solve report: control-snapshot-heartbeat-lease-freshness

**Goal:** ControlPlaneSnapshotOwner uses owner-authored ready-lease bounds, not heartbeat-cadence age, for cache freshness: staggered active-node heartbeats within unexpired leases yield fresh snapshots, while expired or missing lease evidence remains stale and schedules bounded repair. Red-on-revert producer-owner-consumer tests and one production MovieLens run prove preload admission observes the fresh outcome without accepting stale or blind snapshots.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 2

## Links
- spec: solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-022.md
- parent quest: movielens-preload-admission-gate-cutover

## Current Blocker
- Frontier: control-snapshot-heartbeat-lease-freshness-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: solved: FAIL -> PASS
- Latest evidence: test-output/reports/control-snapshot-heartbeat-lease-freshness-2026-07-15T18-01-20-601Z.report.json
- Selected theory: none
- Next move: continue supervised step for control-snapshot-heartbeat-lease-freshness-main
- No longer current: FAIL

## Continuation
- Status: blocked-unrecorded-evidence
- Next action: No open frontier remains; inspect solve report.
- Blocker: fresh frontier evidence is not recorded; run node scripts/solve.js ingest-evidence --id control-snapshot-heartbeat-lease-freshness --frontier control-snapshot-heartbeat-lease-freshness-main --evidence test-output/reports/control-snapshot-heartbeat-lease-freshness-2026-07-15T18-04-57-177Z.report.json

## Scope Pressure
- Changed files: 5
- Change bytes: 12705
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/admin, test/admin
- Categories: other, runtime, test
- Action: land or separate 3 owner areas: scripts/run-placement-affinity-scenarios.js, src/admin, test/admin
- Split plan:
  - src/admin: 3 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - test/admin: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **control-snapshot-heartbeat-lease-freshness-main** [solved] rung 1, attempts 2, metric 1 -> 0 — exact terminal source attempt was rejected

## Findings
- **control-snapshot-heartbeat-lease-freshness-main**: At main c02885ca the five-node MovieLens run reached the production snapshot lane 52 times over about 180 seconds but never reached the load lane: every observation was stale_usable/cache_stale_watermark. The 5s admin max-heartbeat threshold equals the heartbeat tick, while owner rows intentionally coalesce writes around 10s and carry 15s ready leases; final-poll CDC ages were 2.3-12.6s. This reproduces a permanent false-stale owner outcome rather than genuine load pressure. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T17-46-37-270Z.report.json]
- **control-snapshot-heartbeat-lease-freshness-main**: Architectural owner trace: HeartbeatService produces last_heartbeat plus ready_lease_expires_at; ControlPlaneSnapshotOwner owns freshness/repair vocabulary; MovieLens and other consumers must consume that outcome. A local 5s max-age heuristic ignores the producer's lease handoff and violates bounded stale-heartbeat tolerance. The fix boundary is the snapshot repair evaluation, preserving consumer fail-closed behavior rather than adding a demo exception or timeout. [architecture/readiness-and-owner-contracts.md]
- **control-snapshot-heartbeat-lease-freshness-main**: Ingested evidence from control-snapshot-heartbeat-lease-freshness-2026-07-15T18-00-31-916Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/control-snapshot-heartbeat-lease-freshness-2026-07-15T18-00-31-916Z.report.json]
- **control-snapshot-heartbeat-lease-freshness-main**: Ingested evidence from control-snapshot-heartbeat-lease-freshness-2026-07-15T18-01-20-601Z.report.json. Metric: 1 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/control-snapshot-heartbeat-lease-freshness-2026-07-15T18-01-20-601Z.report.json]
- **control-snapshot-heartbeat-lease-freshness-main**: Exact attempt excludes the untracked regression test required by its scenario registration and red-on-revert evidence; the four-path fingerprint cannot bind the producer-owner-consumer proof. [subagent:wave4_preload_gate_verify]
- **control-snapshot-heartbeat-lease-freshness-main**: Ingested evidence from control-snapshot-heartbeat-lease-freshness-2026-07-15T18-04-57-177Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/control-snapshot-heartbeat-lease-freshness-2026-07-15T18-04-57-177Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T18:01:27.540Z | control-snapshot-heartbeat-lease-freshness-main | observe | 1 -> 0 | progress | solved |  | diff:solve/changes/control-snapshot-heartbeat-lease-freshness/attempt-2.diff |
| 2026-07-15T18:04:41.198Z | control-snapshot-heartbeat-lease-freshness-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/control-snapshot-heartbeat-lease-freshness/attempt-3.diff |
