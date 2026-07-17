# Solve report: formation-priority-spread-without-exclusive-self-move-cost

**Goal:** Cold five-node formation reaches schema-admission quiescence within the unchanged 180000ms budget and 60000ms stability window because the priority control-plane partitions (including the replica_operations ledger) reach their spread targets without paying the serialized exclusive ledger self-move cost class measured at 85-110s: replicas of priority partitions are placed or cured such that no schema-admission-blocking window carries back-to-back exclusive ledger self-moves, while the ledger interlock's exclusivity during any live self-move, quorum and voter safety, remove-safety authorities, and the sealed live scenario semantics all remain byte-unchanged.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: formation-ledger-self-move-blocks-cluster-ops
- plan: solve/epics/topology-convergence-hardening.md

## Current Blocker
- Frontier: formation-priority-spread-without-exclusive-self-move-cost-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: theory-20260717-inherited-self-move-takeover-latency (stale: selected theory status is falsified)
- Next move: record or select a fresh frontier theory for formation-priority-spread-without-exclusive-self-move-cost-main

## Continuation
- Status: blocked-theory
- Next action: record or select a fresh frontier theory for formation-priority-spread-without-exclusive-self-move-cost-main
- Blocker: selected theory stale: selected theory status is falsified

## Scope Pressure
- Changed files: 2
- Change bytes: 8445
- Owner areas: src/rebalancer, test/convergence
- Categories: runtime, test
- Split plan:
  - src/rebalancer: 1 file(s)
  - test/convergence: 1 file(s)
- Signals: none

## Frontiers
- **formation-priority-spread-without-exclusive-self-move-cost-main** [open] rung 1, attempts 1, metric 1 -> 1

## Findings
- **formation-priority-spread-without-exclusive-self-move-cost-main**: Research-first triangulation (literature, in-repo survey, exhaustive TLC feasibility model) before any attempt. (1) MODEL: models/formation-schedule-feasibility proves the measured profile infeasible exhaustively (~12.5M states, durations rounded in its favor) and produces feasibility witnesses for join-time placement (0 self-moves), single self-move, ~40s pre-gate headroom, and ~20s self-moves. (2) LITERATURE: industry either places control-plane quorum replicas eagerly at join (Elasticsearch voting auto-reconfiguration, Kafka KRaft controller.quorum.auto.join with observer-catchup-then-AddVoter one-at-a-time) or pins the control plane off the data plane (PD/etcd-embedded, YB masters, Mongo CSRS, FDB coordinators); the universal reconfiguration discipline keeps only a sub-second promote/transfer/remove flip inside any exclusive section (Ongaro 4.2.1 catch-up-before-config-change, etcd learners, Spanner movedir background-copy-plus-tiny-cutover); Delos virtual consensus (seal-and-supersede) and KIP-853 (carry voter changes as records in the meta log itself) dissolve the self-hosting circularity structurally; scheduling framing: exclusive-class serialization lower bound (Blazewicz/Lenstra/Rinnooy Kan 1983) - sum of exclusive job lengths (110s) exceeds budget-minus-stable-window (120s) minus everything else. (3) IN-REPO: no join-time placement hook exists (bootstrap-node-ready-rebalance-owner only triggers later planning ticks; node-joining creates no system-partition replicas); the interlock legally blocks ALL dependent creation during a self-move and widening EXEMPT re-opens the run-20 storm; sync is already cheap (3-12s) - the window is held open by TERMINALIZATION latency and replacement_leader_pending visibility; and the highest-leverage existing-but-deleted mechanism is LAGRANGE_PR_DRAIN_LOCAL_PROGRESS (bb2a6ca2, owner-local durable progress for ACTIVE/STOPPING/REMOVED, subagent-verified to drain, flag-swept in dfde5bf2 on a 0-engagements measurement taken in the wrong vehicle while the formation vehicle fires its precondition constantly; attempt-5-outcome-deferred-local-progress.diff preserved in the parent quest's changes). [models/formation-schedule-feasibility/abstract-protocol.md]
- **formation-priority-spread-without-exclusive-self-move-cost-main**: DT red-on-revert proven for test/convergence/dt-local-leader-seed-safety-merge.test.js [dt:solve/changes/dt-prove/dt-local-leader-seed-safety-merge.test.js-2026-07-17T08-42-33-748Z.json]
- **formation-priority-spread-without-exclusive-self-move-cost-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json]

## Theories
- **theory-20260717-owner-local-terminal-progress-restores-short-self-moves** [falsified] frontier, frontier formation-priority-spread-without-exclusive-self-move-cost-main, layer ownership, mechanism The exclusive ledger self-move window is held open by terminalization latency, not replica sync: ACTIVE/STOPPING/REMOVED workflow-step persists write through the very ledger partition under surgery, fail into retry lanes, and keep the interlock engaged for tens of seconds per move. The owner-local durable progress lane already exists for step=CREATING (applyLocalPriorityOperationProgressRow via shouldUsePriorityDispatchDeferredLocalProgress); its ACTIVE/STOPPING/REMOVED coverage (LAGRANGE_PR_DRAIN_LOCAL_PROGRESS, bb2a6ca2, subagent-verified to drain) was deleted in the dfde5bf2 flag sweep on a 0-engagements measurement taken in the rolling-restart vehicle where a mask blocked its precondition; the formation vehicle fires the precondition constantly. Restoring that coverage lets priority self-moves terminalize within seconds of the executor outcome, shrinking each exclusive window toward the ~20s the feasibility model proves sufficient, owner operation workflow owner transition orchestration (local-progress lane predicate + step coverage); ledger interlock, remove-safety authorities, and admission gate byte-unchanged, modelGate npm run model:contracts
- **theory-20260717-event-driven-settled-leadership-recognition** [superseded] frontier, frontier formation-priority-spread-without-exclusive-self-move-cost-main, layer scheduling, mechanism Each exclusive self-move loses 5.5-7.2s per election round to recognition latency: the replacement's leadership settles (directed handoff completes, raft leader elected, services row flips) but the deferred remove-safety continuation only learns of it at the next unsuppressed election re-ask (REQUEST_RETRY_AFTER_MS 5s suppression + 1s safety poll), because recordPriorityPublicationReplacementLeaderElectionEvidence is a plain Map.set with no wake and the existing cache-change hook (handleObservedReplicaStateChange) does not release the suppression or re-run the deferred safety lane on a leadership-row flip. With leadership flaps this repeats per round. Waking the deferred safety retry and releasing the re-ask suppression on observed settled leadership of the exact target collapses the recognition tax to near-zero without touching the evidence contract (the continuation still requires the recorded exact-target election evidence via the handoff response - the wake only re-asks at the right moment), owner operation workflow owner deferred-safety scheduling (safetyDeferredRetryTimerByOperationId, isPriorityPublicationLeaderHandoffRetrySuppressed) fed by the existing system-table cache-change hook; evidence contract, remove-safety predicates, and interlock byte-unchanged, modelGate npm run model:contracts
- **theory-20260717-inherited-self-move-takeover-latency** [falsified] frontier, frontier formation-priority-spread-without-exclusive-self-move-cost-main, layer scheduling, mechanism A ledger self-move necessarily hands the rebalance coordinator to the replacement mid-operation (the coordinator runs on the ledger leader), and the incoming leader continues its inherited in-flight self-move only after rebalancer cold-start plus roughly one 5s evaluation cycle (measured: node-2 became leader 21:53:39.6 and dispatched the inherited STOPPING at 21:53:45.5; node-4 became leader 21:54:28.8 and first evaluated at 21:54:35.4). Together with the pre-handoff election-request latency (~6s from ACTIVE to STEP_DOWN) this taxes each self-move 10-14s beyond physical work, twice per formation, plus flap repeats. An immediate inherited-operation takeover reconcile on leadership acquisition (the Became-leader hook already exists and starts the scheduler; it does not promptly reconcile inherited in-flight priority operations) collapses the takeover tax to sub-second without touching safety predicates, the interlock, or the evidence contract, owner rebalance coordinator leadership-acquisition startup (became-leader hook, checkTimeouts/planning first-cycle scheduling, incompleteOperationQueryEmptyBackoffMs) - remove-safety, interlock, and admission byte-unchanged, modelGate npm run model:contracts

## Selected Theories
- **formation-priority-spread-without-exclusive-self-move-cost-main**: theory-20260717-inherited-self-move-takeover-latency

## Theory Results
- **theory-20260717-owner-local-terminal-progress-restores-short-self-moves**: falsified (theory=Falsified by source inspection before any change: the flag-swept mechanism is already restored on HEAD, broader than the preserved attempt-5 diff - PRIORITY_OUTCOME_DEFERRED_LOCAL_PROGRESS_TYPES_BY_STEP covers ACTIVE(REPLACE) and STOPPING(REPLACE, REMOVE) and isPriorityOutcomeDeferredLocalProgressStep consumes it in the orchestration predicate. Terminalization was accordingly NOT the measured cost in the 21:52 run (REMOVED persists took 0.5s and 6.8s). Live-log decomposition of the real waits: for self-move-1 the directed election handoff completed at 21:53:39.3 yet STOPPING dispatched only at 21:53:46.6 - 7.2s of pure recognition latency after leadership settled (the 5s REQUEST_RETRY_AFTER_MS re-ask suppression plus 1s poll); self-move-2 shows the same 5.5s recognition gap plus a leadership flap (node-4 won 21:54:28.8, lost to node-2 at 21:54:40.8). Wait-1 (PENDING-to-SENDING 22.4s/13.0s) decomposes into ~11s owner-side arming before the first dispatch attempt plus transport-side deferred retries while the control-plane path recovers, and needs deterministic attribution.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json]
- **theory-20260717-event-driven-settled-leadership-recognition**: superseded (theory=Superseded by deeper log decomposition: the snapshot builder already treats observed replacement leadership rows as SAFE directly (replacementLeaderOwnershipObserved feeds sourceRemovalLeadershipSafe), so re-ask suppression is not the recognition path. The measured gap is coordinator handoff cold-start: the ledger self-move necessarily moves the rebalance coordinator itself (it runs on the ledger leader), and the NEW leader continued the inherited in-flight self-move only after its rebalancer cold-start plus one ~5s cycle (node-2: Became leader 21:53:39.6, planning-gate diagnostic 21:53:39.63, then nothing until Critical rebalancing state detected 21:53:45.06 and Sending replica operation 21:53:45.49 - the STOPPING dispatch came from the new leader, while node-0 logged Lost leadership at 21:53:39.34). Self-move-2 repeated the shape with a flap (node-4 leader 21:54:28.8 evaluated at 21:54:35.4 deferred by safety policy, lost to node-2 at 21:54:40.8 which dispatched at 21:54:46.3).) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json]
- **theory-20260717-inherited-self-move-takeover-latency**: falsified (scenario=failed, theory=falsified, movement=no_evidence) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T21-56-33-815Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-17T08:45:57.733Z | formation-priority-spread-without-exclusive-self-move-cost-main | observe | 1 -> 1 | flat | no_evidence | theory-20260717-inherited-self-move-takeover-latency | diff:solve/changes/formation-priority-spread-without-exclusive-self-move-cost/attempt-1.diff |
