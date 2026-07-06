# Solve report: formation-ledger-self-move-blocks-cluster-ops

**Goal:** The replica_operations ledger self-move (spreading its own quorum/leadership off the seed during cold formation) does NOT indefinitely block other partitions' operations cluster-wide, so a cold 5-node MovieLens demo control plane SETTLES (no 120s no-completion stall) and [2/4] ratings load completes. ROOT (run-4/run-3 forensics, after poison fix 56ebbedb + create-lane fix ab15e03e let earlier phases pass): during cold formation all 5 control-plane system partitions (control_plane_publications-p1, sql_transactions-p1, sql_write_operations-p1, sql_transaction_participants-p1, replica_operations-p1) bootstrap concentrated on the seed and must spread; every non-ledger operation must record a replica_operations row, but while the ledger is doing its OWN self-move the interlock rejects them operation_ledger_self_move_in_flight (330x run-4) + operation_ledger_quorum_concentrated (288x) — a retry-storm that never drains within the settle window, so the control plane never settles and the load times out. The interlock (rebalance-coordinator-ledger-interlock-admission.js, from SOLVED quest formation-control-plane-move-interlock) serializes disruptive self-moves into an idle ledger; the deadlock quest (c7a3bf19) fixed a cache-first stale-ghost read but the SERIALIZATION itself still stalls cold formation. SCOPE: let non-conflicting other-partition operations make progress while the ledger spreads (buffer/pipeline the ledger write, or narrow the interlock so it blocks only genuinely-conflicting ledger-self-move ops, not all ledger writes), and/or make the ledger quorum spread complete faster during formation, so formation settles. NOT weakening run-20/run-22 serialization safety; NOT the create-lane budget starvation (ab15e03e, downstream [4/4]); NOT the poison. doneWhen = the cold-formation control plane settles and load completes, reproduced by scenario-harness 3x consecutive.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Current Blocker
- Frontier: formation-ledger-self-move-blocks-cluster-ops-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for formation-ledger-self-move-blocks-cluster-ops-main

## Continuation
- Status: allowed
- Next action: continue supervised step for formation-ledger-self-move-blocks-cluster-ops-main
- Blocker: none

## Scope Pressure
- Changed files: 3
- Owner areas: src/partition, test/convergence
- Categories: runtime, test
- Split plan:
  - src/partition: 2 file(s)
  - test/convergence: 1 file(s)
- Signals: none

## Frontiers
- **formation-ledger-self-move-blocks-cluster-ops-main** [open] rung 0, attempts 1, metric ? -> ?

## Findings
- **formation-ledger-self-move-blocks-cluster-ops-main**: RULED OUT: stranded ACTIVE participant BEGIN across step-down as the [2/4] blocker. Live validation 3x at fixed HEAD (solve/changes/formation-ledger-self-move-blocks-cluster-ops/live-validation-LEG1-is-wrong-leg.md): zero ACTIVE participant BEGINs on the ledger path — demo ledger writes are writeMode=sql-routed single writes, not client-held participant transactions; the rollback-on-step-down fix (a9344058) fired 0 times and was reverted (066bf78d). CONFIRMED binding blocker: the ledger self-move interlock defers ratings provisioning (318x operation_ledger_self_move_in_flight + 68x operation_ledger_quorum_concentrated in run 3) while self-move sql-routed progress writes fail on the self-degraded quorum (~175 sql-routed failures, ~508 transient CDC retries), so self-moves thrash 21-55 execs and [2/4] times out every run. Forward levers: narrow the interlock to genuinely-conflicting ops, and/or make self-move progress writes survive the spread (off-partition/buffered persistence, research-lever-a).
- **formation-ledger-self-move-blocks-cluster-ops-main**: TRIAGE (3 subagents, live-artifact-grounded): L1 interlock-narrowing DROP — the 318/68 rejection counts are early (15:23-15:25) double-counted rebalancer MOVE_SKIPPED records; ratings CREATE TABLE (15:29:32) starts after all interlock records end, is ADMITTED, and fails inserting its replica_operations row. L2 self-move-progress-writes DROP — all 3 ledger spread ops complete cleanly in 38s with zero own-row write failures. L3a bootstrap pre-placement NEEDS-PREREQ (no expected-cluster-size contract; single-node breakage; high blast radius). L3b spread-then-admit sequencing NEEDS-PREREQ (does not move [2/4] alone: spread rows complete 15:23:59, ratings fails 5.5min later). TRUE HEAD (all three agents converge): from 15:24:36 to 15:30:07 writes through replica_operations-p1 fail continuously (553 CDC retries, 117 failed row writes, 22 rows, 16 re-armed ops) with firstFailedParticipant replica_operations-p1-r4 'Pending response timeout'; control plane never settles (published_active_coverage_incomplete, prioritySpreadPending:true); no healing path engages. Evidence: triage-lever-L{1,2,3}-*.md. Diagnosis leg dispatched for the r4/write-path mechanism.
- **formation-ledger-self-move-blocks-cluster-ops-main**: DIAGNOSED ROOT (diagnose-post-spread-ledger-write-timeouts.md + triage-SYNTHESIS-forward-path.md): self-sustaining unfit-leader deadlock on post-spread ledger leader r4 (node-1). Chain: r4 develops a stuck ACTIVE transaction (heldMs 62s, node-1.log:2770) -> heal role-gated off leaders (partition-service-transaction-base.js:317-341) -> demotion successor-gated and successorViable:false (partition-service-durability-fitness.js:274-321) because the 10s follower-ack viability probe (:89-103) is starved BY the wedged leader itself, despite two active voters (r5,r6) in membership -> r4 holds the seat unfit forever -> all replica_operations writes route to it and hit Pending response timeout; retries never quarantine the route -> priority spread never completes -> active-gate snapshot coverage unavailable (published_active_coverage_incomplete) -> never settles -> [2/4] CREATE admitted but its ledger INSERT times out at the 30s budget. This is the exact R1-liveness-deadlock FINAL-vetted-verdict.md predicted; its 4x-vetted C3 guard (bounded demote-when-no-viable-successor, membership-based viability when the leader starves ack evidence) is the root leg. Legs: 1) C3 bounded demotion fallback (EXTENDED, dt6-ledger-leader-durability-fitness DT-first, real-mechanism repro not injected probe); 2) pending-response-timeout route quarantine; 3) surplus-drain evidence to the over-target sibling quest (its self-clearing-transient premise is FALSIFIED at 4/3 for 6min); 4) L3b sequencing wrapper last.
- **formation-ledger-self-move-blocks-cluster-ops-main**: DT red-on-revert proven for test/convergence/dt6-ledger-leader-durability-fitness.test.js [dt:solve/changes/dt-prove/dt6-ledger-leader-durability-fitness.test.js-2026-07-06T17-28-13-045Z.json]
- **formation-ledger-self-move-blocks-cluster-ops-main**: Subagent verification of the C3 bounded-demotion-fallback source change: verdict SHIP (evidence subagent:verify-c3-demotion-fallback, code-review agent). Independently ran 63/63 tests green + eslint clean. Raft-safety attacks held: all-followers-dead case not-strictly-worse (wedged leader could not commit anyway; healed node can re-elect; deferCandidacy only inflates timeout draws, liferaft.js:472-475); no mid-hold bare-rollback risk (heal runs the tick AFTER demotion, role already FOLLOWER; C4 gate untouched); solo predicate fails safe (mixin-absent -> treated solo -> no fallback). DT honesty confirmed: real beginTransaction seam, real default ack-window probe (no injected probe in the fallback subtest), real enforcePreparedStateHoldTimeouts heal, red assertion genuinely red on unfixed head. Pre-existing (unchanged) edges noted: a CANDIDATE-cycling wedge keeps the heal blocked (pre-existing hole), and replicaIds/raft.nodes are never pruned on scale-down so a 3->1 group is classified multi-member (pre-existing membership non-pruning; fallback still not-strictly-worse there since the zombie tx at least heals).
- **formation-ledger-self-move-blocks-cluster-ops-main**: non-measuring sample (1/3): harness produced no trustworthy metric; holding the rung for retry rather than climbing toward an unearned exhausted park
- **formation-ledger-self-move-blocks-cluster-ops-main**: Subagent verifier (code-review agent verify-c3-demotion-fallback) verdict SHIP on the C3 bounded-demotion-fallback source change (c3-bounded-demotion-fallback.diff): independently ran 63/63 tests green + eslint clean; raft-safety attacks held (all-followers-dead not-strictly-worse; heal fires only the tick after demotion with role already FOLLOWER, C4 untouched; solo predicate fails safe); DT honesty confirmed (real beginTransaction seam, real default ack-window probe, red genuinely red on unfixed head). Pre-existing unchanged edges noted for future legs: CANDIDATE-cycling wedge keeps heal blocked; replicaIds/raft.nodes never pruned on scale-down. [subagent:verify-c3-demotion-fallback]
- **formation-ledger-self-move-blocks-cluster-ops-main**: LIVE RUN 1 at fixed HEAD 5a163029: the unfit-leader deadlock class is CLOSED live — r4 again wedged on a stuck ACTIVE tx (heldMs 62s), detector fired 17:48:32 (successorViable:true this run, normal path), demotion immediate, role-gated heal rolled the zombie back at 17:48:33 ('Active transaction held beyond its legal window; rolled back'), durability recovered — the prior artifact's 5.5-minute wedge is now a ~1s blip and zero 'demoted WITHOUT provable successor' fallback firings were needed (the C3 fallback remains the vetted guard for the successorViable:false shape proven in the prior artifact). BUT the quest doneWhen is NOT satisfied: [2/4] still fails — settle STALLED (no completion 17:51:15->17:53:15) with 366 operation_ledger_quorum_concentrated + 346 operation_ledger_self_move_in_flight holds and 63 failed ledger row writes (vs 117). The binding blocker has moved up a layer; the fresh run-artifact needs its own diagnosis leg before the next fix. [diff:solve/changes/formation-ledger-self-move-blocks-cluster-ops/c3-bounded-demotion-fallback.diff]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-06T17:36:08.165Z | formation-ledger-self-move-blocks-cluster-ops-main | observe | ? -> ? | flat | no_evidence |  | diff:solve/changes/formation-ledger-self-move-blocks-cluster-ops/c3-bounded-demotion-fallback.diff |
