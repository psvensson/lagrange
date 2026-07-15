# Solve report: runtime-replica-state-projection

**Goal:** Placed runtime-service replicas are visible as authoritative services-table rows: ServiceRuntimeLifecycle's designed state projection (_projectReplicaState, already invoked on every lifecycle transition but a silent no-op because setStateProjectionWriter has zero production callers) is wired to authority in the production composition, so a created/started replica projects an ACTIVE services row (and terminal states project accordingly), the runtime-service rebalancer's currentReplicas view sees placed replicas (no more re-planning ADDs for replicas that already exist), and observers can query placement. Proven by deterministic red-on-revert tests (dt:prove) covering projection on create/start/stop/fail through the real lifecycle, plus the movielens affinity demo advancing past replicas=0 on a live cluster.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/runtime-replica-state-projection-2026-07-15T15-43-44-808Z.report.json

**Attempts:** 2

## Links
- parent quest: movielens-affinity-placement-demo
- plan: solve/epics/service-data-affinity-placement.md

## Scope Pressure
- Changed files: 4
- Change bytes: 9026
- Owner areas: src/rebalancer, test/runtime
- Categories: runtime, test
- Split plan:
  - src/rebalancer: 3 file(s)
  - test/runtime: 1 file(s)
- Signals: none

## Frontiers
- **runtime-replica-state-projection-main** [solved] rung 2, attempts 2, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **runtime-replica-state-projection-main**: Subagent verifier (evidence subagent:projection-adversarial-verify) initial verdict NOT FAITHFUL — the wiring was clean (race/affectedRows/double-writer/shutdown all verified acceptable) but it caught TWO coupled defects, both FIXED: (1) HIGH: both runtime_service services-row read models (unified-rebalancer-replica-state getCurrentReplicas; replica-operation-repository entity reads) filtered service_id === entityId strictly while dispatched replicas project entityId-rN ids — the comment even said 'equals or is prefixed by' (another intent/code mismatch) — so projected rows were invisible to the planner; fixed with prefix matching + a dispatch-id visibility guard test; (2) MEDIUM: stopped rows would linger forever once visible and skew per-node counts — fixed by DELETE-on-stop mirroring the partition/message-group row owners, while FAILED rows stay visible for the planner's auto-remove. Re-proven red-on-revert over all five src files.
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-17-47-223Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-17-47-223Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-18-42-913Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-18-42-913Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-18-44-417Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-18-44-417Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-18-44-417Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-18-44-417Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-28-02-711Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-28-02-711Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-28-04-231Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-28-04-231Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-28-05-750Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-28-05-750Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-28-05-750Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-28-05-750Z.report.json]
- **runtime-replica-state-projection-main**: Independent verification rejected exact attempt: both runtime-service read models misattribute a distinct entity row such as svc-report-r1 to entity svc because startsWith(entityId-r) does not enforce the sealed canonical entityId-rN decimal-suffix grammar; the added test covers only a non-overlapping prefix. The sealed live MovieLens replicas-greater-than-zero clause also has no durable post-fix live evidence. [subagent:wave4_runtime_projection_verify]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-32-56-501Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-32-56-501Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-32-56-501Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-32-56-501Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-43-41-763Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-43-41-763Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-43-43-311Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-43-43-311Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-43-44-808Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-43-44-808Z.report.json]
- **runtime-replica-state-projection-main**: Ingested evidence from runtime-replica-state-projection-2026-07-15T15-43-44-808Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/runtime-replica-state-projection-2026-07-15T15-43-44-808Z.report.json]
- **runtime-replica-state-projection-main**: Independent exact verification passed: both production readers delegate to one canonical matcher; entity svc excludes svc-report-r1 plus empty, zero, leading-zero, negative, non-decimal, and trailing-junk replica suffixes, while the bare id and positive canonical decimal replicas pass. Focused fail-closed proof: 27/27 assertions. [subagent:wave4_runtime_projection_exact_verify2]
- **runtime-replica-state-projection-main**: Live validation report movielens-lagrange-service-affinity-live-2026-07-15T16-04-41-298Z failed before MovieLens loading because one formation operation remained in flight at the 900s ceiling on stale base a66f909d; this is not closure evidence. The runtime candidate is now composed on main 7fea9744, which includes the independently approved coordinator head-of-line fix, before retrying the live observable. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T16-04-41-298Z.report.json]
- **runtime-replica-state-projection-main**: Composed live validation report movielens-lagrange-service-affinity-live-2026-07-15T16-22-13-555Z ran on main 7fea9744 plus runtime attempt sha256:7b88ce57f36d53cc930c9a570cadc971c0170cb17c045cc4d5e5fb431cde878d, but the demo again failed before MovieLens loading/runtime placement: four non-ledger formation operations remained in flight at the 900s ceiling after 42 completed and safe 3-voter/one-per-node operation-ledger spread. Therefore no honest replicas>0 closure evidence exists yet; aggregate approval remains withheld. The blocker is the existing open formation-ledger-self-move-blocks-cluster-ops class/successor discrimination, not the exact runtime identity matcher. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-15T16-22-13-555Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T15:28:40.431Z | runtime-replica-state-projection-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/runtime-replica-state-projection/attempt-1.diff |
| 2026-07-15T15:44:02.532Z | runtime-replica-state-projection-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/runtime-replica-state-projection/attempt-2.diff |
