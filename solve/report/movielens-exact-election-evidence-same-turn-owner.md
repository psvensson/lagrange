# Solve report: movielens-exact-election-evidence-same-turn-owner

**Goal:** When a priority REPLACE target-election handoff returns COMPLETED for the exact replacement, the operation workflow immediately routes the recorded evidence back through the canonical remove-safety owner in the same turn, before retry expiry can retarget it, while all voter, quorum, membership, leadership, and serialized-ledger guards remain unchanged and the production MovieLens Wave-4 milestone completes.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 2

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: movielens-incremental-replace-spread-nonregression
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 4
- Change bytes: 19728
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Split plan:
  - src/rebalancer: 2 file(s)
  - test/rebalancer: 2 file(s)
- Signals: none

## Frontiers
- **movielens-exact-election-evidence-same-turn-owner-main** [parked {exhausted}] rung 2, attempts 2, metric 1 -> 1 — The verified same-turn election-evidence fix engaged live; the surviving failure is premature ledger self-move serialization release owned by formation-ledger-self-move-blocks-cluster-ops

## Findings
- **movielens-exact-election-evidence-same-turn-owner-main**: On current HEAD aead52ac the archived live failure still binds: exact replacement election COMPLETED evidence is recorded, but continuation waits when the target is routing-ready and another retarget voter exists; after the 5s suppression window candidate retargeting prevents the remove-safety owner from consuming the exact ACK in time. [data/examples/service-data-affinity-demo-archive/wave4-live-incremental-replace-spread-nonregression-2026-07-16T10-00-24-317Z.tar.gz]
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T10-00-24-317Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: DT red-on-revert proven for test/rebalancer/quorum-conditioned-remove-safety.test.js [dt:solve/changes/dt-prove/quorum-conditioned-remove-safety.test.js-2026-07-16T11-17-52-139Z.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Independent verification rejected attempt 1 solely because the newly edited test title used the forbidden word terminalizes instead of terminates under STYLE-0012; functional owner-boundary, transport, focused-suite, DT red-on-revert, lint, and unchanged-contract checks otherwise passed. [subagent:verify_exact_election_same_turn_attempt1]
- **movielens-exact-election-evidence-same-turn-owner-main**: Independent exact-source verification passed: the four-path delta records exact COMPLETED evidence before data-driven same-turn continuation, re-enters canonical remove safety without authorizing removal, preserves every safety/interlock guard and NOT_FOUND retargeting, passes 211 focused assertions plus 16 transport assertions, ESLint, diff integrity, and the green/red-on-revert/green DT proof. [subagent:verify_exact_election_same_turn_attempt1]
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T11-45-37-305Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Changed live run 2026-07-16T11:41Z engaged the exact-election same-turn fix: replace-op-b0b98821c956268ed7774ca615a1662a recorded the target leader-election ACK at 11:44:37.620 and dispatched/completed source REMOVE by 11:44:41.948, before evidence expiry. Wave4 still failed later on stale_replica_operations_in_flight after five other partitions created replacement operations without workflow dispatch. Immutable archive data/examples/service-data-affinity-demo-archive/wave4-live-exact-election-same-turn-2026-07-16T11-45-37-305Z.tar.gz sha256 65b98a3f92c3216a7f782b09acc7ff1e0eb060408facc31bec307b7a9f03c3e5; report sha256 bd79ff4228a9a15214631966b3d38cd909e7e404cbf87adc708960385e24c4fe.
- **movielens-exact-election-evidence-same-turn-owner-main**: Correction after immutable full-log inspection: the five post-hold operations did dispatch between 11:44:48 and 11:44:57 and all created target replicas by 11:45:20. The earlier no-dispatch summary was based on creator-side lines only. The stronger root is premature self-move serialization release: dependent creation began 11:44:43 while replica_operations self-move b0b... remained nonterminal until 11:44:51, then every dependent workflow-step write failed against replica_operations. Treat the preceding no-dispatch wording as superseded.
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Ingested evidence from movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Changed Wave4 engaged the terminal-hold repair twice: ledger self-move replace-op-691efb46c505c2053b80785456cab438 reached authoritative Operation completed at 12:20:58.605, the next ledger self-move replace-op-e1ef0ada4127812f28bfef5a314c48df reached authoritative Operation completed at 12:21:53.865, and the first dependent batch operation was created only at 12:21:54.081 (216ms later). The sealed run failed earlier than preload on a distinct cache_stale_watermark snapshot-observation blocker with totalSpreadGap=0, so the ledger lifecycle defect did not recur. Report sha256=2f3a3a7faff6afa97d1988b2961e3c4eea0e36383279cde3541bfd5ce95b51fd; immutable archive sha256=7f27943debfd6b59eaa919d35165d7c0ff37c32f4e113dbd8b577cbd1d11d74c. (rules out: Rules out premature terminal-hold release as the blocker in this run; do not widen timeouts or alter the live scenario.) [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-16T12-23-19-124Z.report.json]
- **movielens-exact-election-evidence-same-turn-owner-main**: Fresh post-change evidence constrains the exact-election continuation premise: the replacement reached target-side physical leadership while source safety remained replacement_leader_pending, and dispatch errors currently collapse to a null response, so the already-proven same-turn continuation covers observed COMPLETED responses but does not establish continuity when that response is lost or late. Treat response-loss, pre-hydration leader observation, and ledger self-persistence as competing deterministic theories before another runtime attempt. (rules out: Do not duplicate exact-ACK logic or infer completion from transport acknowledgement alone.) [data/examples/service-data-affinity-demo-archive/wave4-live-nodes-priority-recovery-escape-2026-07-16T16-08-27-003Z.tar.gz]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-16T11:18:59.575Z | movielens-exact-election-evidence-same-turn-owner-main | observe | 1 -> 1 | flat | no_previous |  | diff:solve/changes/movielens-exact-election-evidence-same-turn-owner/attempt-1.diff |
| 2026-07-16T11:25:45.890Z | movielens-exact-election-evidence-same-turn-owner-main | local-fix | 1 -> 1 | flat | no_previous |  | diff:solve/changes/movielens-exact-election-evidence-same-turn-owner/attempt-2.diff |
