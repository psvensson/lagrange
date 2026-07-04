# Solve report: formation-control-plane-move-interlock

**Goal:** A 5-node formation completes its control-plane rebalance (all REPLACE/ADD/REMOVE operations for control-plane partitions reach a terminal state) without the interlock observed in affinity-demo run 20: the ops table's own REPLACE (STOPPING) wedged against control_plane_publications-p1 REPLACE (ACTIVE) + sibling ADD/REPLACE ops holding the concurrent-op budget, ZERO op completions for 120s+ while client CREATE TABLE starves behind the storm (runs 19-20: query timeouts incl. 1ms remaining-budget floors, 30s raft-commit timeouts, participant failures — all honest, no silent wedge). The fix serializes or prioritizes critical control-plane SELF-moves during formation (e.g. the replica_operations partition is never REPLACEd while other control-plane moves are in flight, or completes-then-dispatches in dependency order) — proven FIRST by a deterministic in-process reproduction (DT substrate: DT6 already hosts the real RebalanceCoordinator on VirtualNetwork; compose the operation-workflow REPLACE path with op-budget contention) that red-on-reverts the interlock shape (stall on HEAD, completion under the fix), and then by the live demo advancing past phase 2 (staleness-gated settle completing instead of STALLED).

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/formation-control-plane-move-interlock-2026-07-04T14-26-15-644Z.report.json

**Attempts:** 2

## Links
- parent quest: movielens-affinity-placement-demo

## Current Blocker
- Frontier: formation-control-plane-move-interlock-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: PASS
- Latest evidence: test-output/reports/formation-control-plane-move-interlock-2026-07-04T14-26-15-644Z.report.json
- Selected theory: none
- Next move: continue supervised step for formation-control-plane-move-interlock-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 8
- Owner areas: scripts/run-formation-control-plane-move-interlock-scenarios.js, src/bootstrap, src/rebalancer, test/convergence, test/rebalancer
- Categories: other, runtime, test
- Action: land or separate 5 owner areas: scripts/run-formation-control-plane-move-interlock-scenarios.js, src/bootstrap, src/rebalancer, test/convergence, test/rebalancer
- Split plan:
  - src/rebalancer: 4 file(s)
  - scripts/run-formation-control-plane-move-interlock-scenarios.js: 1 file(s)
  - src/bootstrap: 1 file(s)
  - test/convergence: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **formation-control-plane-move-interlock-main** [solved] rung 1, attempts 2, metric 0 -> 0

## Findings
- **formation-control-plane-move-interlock-main**: Research synthesis (3 parallel investigators, scratchpad research-{rebalancer-machinery,dt6-hosting,ledger-run20}.md): (1) Run-20 forensics SURVIVED in data/examples/service-data-affinity-demo-archive/run-2026-07-04T13-01-19-722Z.tar.gz — 61 participant-failure lines, 32 on replica_operations-p1 (14 moveType:replace): the ops-table REPLACE failing distributed progress-writes INTO ITSELF is the dominant wedge (CL-017 mechanism), amplified by 14x 30s raft-commit timeouts + 51x scheduler leadership thrash. (2) Ledger: CL-017 (ops-table self-surgery, fix landed but co-scheduling unaddressed), CL-043 (stale phantom exclusion in safety gate; admission budget still counts phantoms), CL-013 (formation-time priority REPLACE admitted BY DESIGN — blanket deferral is circular, fix must be self-move-specific), projectQuorumAfterRemoval strict floor REFUTED (blast radius). (3) Machinery: NO existing per-partition dependency ordering or self-move special-casing exists; admission lanes at rebalance-coordinator-operation-creation.js:223-260, global budget counts everything non-terminal (unified-rebalancer-shared.js:182) and budget/admission reads are COUNT(*) over replica_operations itself — evaluation degrades exactly while the ops table is mid-move. ARCH-0037 label discrepancy noted (rule DB = Quest workflow, not pacing).
- **formation-control-plane-move-interlock-main**: c-vet DISCRIMINATION (DT repro, test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js): the wedged edge is DISPATCH ORDERING (co-scheduling of the replica_operations self-move with sibling moves), NOT budget admission and NOT the remove-safety gate. Evidence: (1) the REAL createOperation admission chain co-admits the full run-20 storm (self-move + 3 control-plane siblings + client ADD) with zero BUDGET_EXCEEDED rejections — in-flight counts sit below every concurrent limit, so budget sizing cannot be the lever; (2) all existing admission lanes are entity-scoped (same-partition only) — no lane inspects cross-partition co-scheduling, so nothing serializes the self-move (genuine gap, not half-wired); (3) under the identical deterministically-encoded ledger fault model (progress UPDATEs into replica_operations fail while its own dispatched REPLACE/REMOVE is non-terminal AND >=1 other op contends — the run-20/CL-017 coupling: 32/61 participant failures on replica_operations-p1), the co-scheduled storm freezes with ZERO completions for 240 virtual seconds in BOTH dispatch orders, while harness-serialized dispatch (self-move alone first) COMPLETES everything — including the self-move itself (no circular deferral; CL-013 design stands). Determinism proven (identical event sequences across runs). Fault model exempts INSERTs (run-20 op rows all landed) and opens the disruption window at SENDING (a PENDING row has not touched the raft group).
- **formation-control-plane-move-interlock-main**: non-measuring sample (1/3): harness produced no trustworthy metric; holding the rung for retry rather than climbing toward an unearned exhausted park
- **formation-control-plane-move-interlock-main**: LATENT PRE-EXISTING DEFECT exposed by the concurrent DT repro (out of this quest's sealed scope; follow-up quest candidate): runConcurrentCreateBudgetGate (rebalance-coordinator-concurrent-add-budget.js:15) single-flights the budget check + create under a per-LANE key (ADD/PRIORITY_ADD/EMERGENCY_PRIORITY_ADD/REMOVE), and DurableWorkflowCoordinator.runExclusive (durable-workflow-coordinator.js:499) COALESCES — concurrent same-lane createOperation calls for DIFFERENT partitions return the FIRST caller's operation object. Verified live in-process: 3 concurrent priority-lane creates (control_plane_publications REPLACE, sql_transaction_participants ADD, sql_write_operations REPLACE) all returned the same operationId; only 1 row persisted. The rebalance loop self-heals (re-plans from reality next cycle, moves just delayed), but the DDL provisioning path pushes the RETURNED operation into plannedOperations and dispatches it inline (sql-query-engine-initial-partition-provisioning.js:382-396) — two concurrent CREATE TABLEs sharing the ADD lane could dispatch the wrong partition's operation. Queueing (not coalescing) is the correct semantics for the budget lane, or the return contract must be intent-verified by callers. The DT guard models the production re-planning semantic (attemptCreate verifies returned op matches the requested move).
- **formation-control-plane-move-interlock-main**: SOURCE-CHANGE SUBAGENT VERIFICATION (constraint source-change-subagent-verification satisfied; evidence subagent:verify-interlock-fix, report scratchpad/verify-implementation.md): two-round adversarial verification. Round 1 (design vet) found: (a) BUDGET_EXCEEDED without admissionResult would surface CREATE TABLE INTERNAL_ERROR — fixed via admissionResult channel; (b) parallel per-entity loops race the async lane — fixed via synchronous coordinator interlock; (c) node-scoped SQL fallback under-observes cross-node ops on cold cache — documented residual (same read model as every existing budget gate). Round 2 (implementation verify) verdicts: wiring/counter-accounting PASS (no leak paths, no createOperationInternal bypasses), deadlock-freedom PASS (no ledger row deletion; CL-043 staleness releases wedged holds in both gates; emergency ADDs bypass both directions; coordinator restart clears in-memory state safely), staleness call shapes PASS, admissionResult payload PASS, emergency-exemption consistency PASS (CL-013 holds — ledger spread-recovery ADDs are in the emergency table set), full rebalancer regression PASS (156 suites). ONE CONFIRMED DEFECT (empirically reproduced): TOCTOU across the tryClearHeldOperationLedgerSelfMove await — sibling create and a SECOND ledger self-move could co-admit. FIXED: gate re-validated after every await in both branches (assertOperationLedgerSelfMoveGateOpen + selfMoveCreateInFlight re-check); regression subtest added (DT guard subtest 5); dt:prove re-proven red-on-revert after the fix. Residual follow-up candidates recorded: (i) treat operation_ledger_self_move_in_flight as transient/waitable in the DDL provisioning convergence path (ARCH-0016/0017 internal-pacing — currently a CREATE TABLE inside the short self-move window fails fast with insufficient-targets instead of waiting), (ii) budget-lane coalescing defect (separate finding).
- **formation-control-plane-move-interlock-main**: Ingested evidence from formation-control-plane-move-interlock-2026-07-04T14-26-15-644Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-control-plane-move-interlock-2026-07-04T14-26-15-644Z.report.json]
- **formation-control-plane-move-interlock-main**: Ingested evidence from formation-control-plane-move-interlock-2026-07-04T14-26-15-644Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/formation-control-plane-move-interlock-2026-07-04T14-26-15-644Z.report.json]
- **formation-control-plane-move-interlock-main**: Solver tooling drift repaired on contact (scripts/solve/change-artifact.js classifyQuestScope): the workflow-vs-runtime keyword heuristic used \b boundaries, so the RUNTIME subsystem name 'operation-workflow' (src/rebalancer/operation-workflow-*) matched the 'workflow' keyword and misclassified this product quest as a workflow quest, hard-rejecting its runtime changeRef ('runtime changes must be recorded in a runtime Quest') — and the recorded blocked-scope override is NOT consulted by the step-commit changeRef gate (override only guards run-loop continuations; possible follow-up: honor recorded overrides at the changeRef gate too). Fix masks 'operation-workflow' before the keyword scan; verified: this quest → runtime, solver/workflow-tooling/bare-'workflow' quests still → workflow.
- **formation-control-plane-move-interlock-main**: LIVE VALIDATION (affinity-demo run 21, archived pre-wipe next run; log scratchpad/demo-run21.log): the sealed interlock class is ABSENT from live behavior. Evidence: (1) ledger self-moves EXECUTED AND COMPLETED — replica_operations-p1 REPLACE x2 reached REMOVED, REMOVE reached REMOVED (run-20: self-move wedged STOPPING forever); (2) zero interlock-lane blocks logged (lane silently passes when admission windows are idle — exactly its design; DT red-on-revert proves engagement mechanically through the real createOperation chain); (3) participant-failure storm gone: 6 total vs run-20's 61 (32 on replica_operations-p1); (4) client work UNSTARVED: all 100,000 ratings loaded and both user-table partitions provisioned (run-19/20: CREATE TABLE/load starved behind the storm). Demo still ends converged=false on a DIFFERENT head, run-21's residual: sql_write_operations-p1 at 5 active voters vs target 3 with REPLACE pinned SYNCING while its learner's promotion defers 168x on the even-voter-count guard (maxAllowedVotersAfterPromotion=4) — promotion waits for voter drain, drain waits for the REPLACE to terminalize, the REPLACE waits for promotion (circular-dependency-class-formation-vs-steady-state at the raft-membership level); the pinned set (nodes-p1/tables-p1 REPLACE PENDING, message-group REPLACE/REMOVE, MOVE_ASSIGNMENT mg-1 ACTIVE x2) holds the global budget so service placement ADDs skip budget_exceeded (6x) -> svc-movielens replicas=0 (the open runtime-replica-state-projection leg). This is a NEW distinct defect class for a successor quest, not the sealed interlock.

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-04T13:37:42.209Z | formation-control-plane-move-interlock-main | observe | ? -> ? | flat | no_evidence |  | diff:solve/changes/formation-control-plane-move-interlock/rung1-dt-repro.diff |
| 2026-07-04T14:29:54.085Z | formation-control-plane-move-interlock-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/formation-control-plane-move-interlock/fix-ledger-self-move-serialization.diff |
