# Solve report: provisioning-admission-ledger-hold-transient-wait

**Goal:** The MovieLens affinity demo (5-node local formation) survives a CREATE TABLE that arrives while the run-20 operation-ledger self-move hold (or the run-22 quorum-spread hold) is engaged: provisioning admission absorbs the transient internally with a bounded wait-and-reevaluate loop while every cohort-blocking reason is a transient ledger-interlock reason, and the client receives the provisioned table instead of 'Unable to satisfy minimum routable provisioning cohort ... operation_ledger_self_move_in_flight' (run-24 head: the demo died at its first CREATE TABLE ~6s after formation, provisionable=0/required=2, all three targets deferred). Proven by a deterministic DT reproduction (guard-test scenario-harness, consecutive 3) and the interlock error message embedding the HELD ledger operation's partition id instead of the admitted operation's.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/provisioning-admission-ledger-hold-transient-wait-2026-07-05T11-48-29-322Z.report.json

**Attempts:** 1

## Links
- parent quest: movielens-affinity-placement-demo

## Current Blocker
- Frontier: provisioning-admission-ledger-hold-transient-wait-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for provisioning-admission-ledger-hold-transient-wait-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 5
- Owner areas: scripts/run-provisioning-admission-ledger-hold-transient-wait-scenarios.js, src/query, src/rebalancer, test/query
- Categories: other, runtime
- Action: land or separate 4 owner areas: scripts/run-provisioning-admission-ledger-hold-transient-wait-scenarios.js, src/query, src/rebalancer, test/query
- Split plan:
  - src/query: 2 file(s)
  - scripts/run-provisioning-admission-ledger-hold-transient-wait-scenarios.js: 1 file(s)
  - src/rebalancer: 1 file(s)
  - test/query: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **provisioning-admission-ledger-hold-transient-wait-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **provisioning-admission-ledger-hold-transient-wait-main**: RESEARCH + IMPLEMENTATION + SOURCE-CHANGE SUBAGENT VERIFICATION (verifier verdict FIX-FIRST on 2 lint errors + a coverage gap, all fixed, then SHIP; report verify-ledger-hold-transient-wait.md in the quest changes dir). ROOT (two-layer): (1) the CREATE TABLE path passes a defaulted QUORUM minimum (2 < target 3, table-creation-service resolveDefaultMinimumRoutableReplicaCount) which made enforceEveryProvisioningOperation false — the convergence-wait block in sql-query-engine-initial-partition-provisioning.js was GATED on that flag and never ran (run-24: one admission pass, 3ms rejection cluster, verbatim client error reproduced in the DT); (2) even where the wait runs, its window (1s default/10s adaptive) is dwarfed by ledger-hold windows while TABLE_CREATE_PROVISION_TIMEOUT_MS=30s had headroom — the run-22 OWNED RESIDUAL comment in TRANSIENT_PROVISIONING_SHORTFALL_REASONS named exactly this. REUSED vs EXTENDED vs NEW: REUSED — waitForProvisionTargetNodeIds (sleep-based polling + admission probe), hasOnlyTransientProvisioningShortfall, the child timeout-budget machinery (granted=min(requested, parent remaining) — the re-wait CANNOT overrun the caller's budget, verifier-proven at timeout-budget.js:129); EXTENDED — the gate condition (also runs for quorum-minimum creates), requiredReplicaCount formula (quorum satisfaction: partial-admission creates return on the FIRST probe — verifier confirmed zero added waiting and probe-count PARITY via precheckedTargetNodeIds), one-shot budget-bounded re-wait wrapper (isWholeClusterTransientProvisioningHold + waitOutWholeClusterTransientProvisioningHold, loud WARN); NEW — only the heldSelfMovePartitionId state field and the log constant. NO TIMEOUT RAISED: the fix re-attributes which EXISTING budget governs (verifier-verified constants untouched). MISLABEL FIX: the interlock blocking messages embed the HELD ledger partition (state actually examined) instead of the admitted operation's partition — run-24 forensics confusion; pinned by a fixture-level subtest. VERIFIER RULINGS: dead-cluster UX — a permanently-unhealthy cluster now fails in ~30s instead of ~1s, ACCEPTED (the 30s budget was always the client contract; one-shot; canonical typed error; ARCH-0016 favors late-but-correct) — noted as a diagnosability tradeoff; TOCTOU re-engagement between re-wait and planning throws bounded-honestly with NO second re-wait (ruled leave-as-is — a retry loop is what the one-shot design avoids); accepted latency adds: under-populated cluster +<=1s before the same fallback, partial hard-rejection waits the 10s adaptive window before the same throw (both bounded, both the pre-existing enforceEvery machinery extended); residual minor: the selfMoveCreateInFlight blocking branch still names the admitted partition (held state definitionally null mid-create). PROOF: DT 7/7 (verbatim run-24 error red-on-head; never-clears bounded at the provisioning budget; hard-rejection fail-fast without the extended wait; interlock message pin); dt:prove red-on-revert across 3 src files (artifact ...11-48-04-819Z.json); regressions query+rebalancer 9396 and convergence+partition 2599 green real-exit-0 (verifier independently: full test/query 4050/4050, test/rebalancer 5232/5232, sibling waits suite 41/41); complexity ratchet + lint green; scenario-harness 3x PASS.

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-05T11:49:24.189Z | provisioning-admission-ledger-hold-transient-wait-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/provisioning-admission-ledger-hold-transient-wait/fix-transient-hold-wait.diff |
