# L3 triage — formation sequencing for operation-ledger spread

Quest: `formation-ledger-self-move-blocks-cluster-ops`.

Scope: triage only. I did not modify source or tests.

## Bottom line

- **L3a (avoid the self-move by initial multi-node placement): NEEDS-PREREQ.** It is the clean etcd-shaped design, but this repo currently has no product-level `expected_cluster_size` / static bootstrap contract. Bootstrap explicitly creates **three replicas of every initial system partition on the seed**, and the product must still form as a genuine single-node cluster.
- **L3b (sequence + accelerate the existing self-move): NEEDS-PREREQ.** It reuses the most existing machinery, but **L3 alone does not move [2/4] in the current artifact**: the ledger self-move operation rows complete before ratings `CREATE TABLE`, yet ratings still fails because the control plane never reaches a settled/writable state and `replica_operations` progress writes keep failing.
- Strongest path is **L3b composed with L2 and/or L1**: make the ledger spread actually clean/fast, then use formation/admission sequencing so foreground provisioning never races it. A demo-side wait is legitimate only if it waits for a real control-plane-settled predicate; in these logs that predicate never becomes true.

## Evidence inputs

The quest statement says the doneWhen is not just a delayed demo phase: cold 5-node formation must **settle** and ratings load must complete, with the problem framed around the operation ledger self-move blocking cluster-wide operations (`solve/quests/formation-ledger-self-move-blocks-cluster-ops.json:3`, `solve/quests/formation-ledger-self-move-blocks-cluster-ops.json:13`). The 3-run live validation says all runs fail at `[2/4]`, with 21-55 replica_operations self-move execs and 318 `operation_ledger_self_move_in_flight` in run 3 (`solve/changes/formation-ledger-self-move-blocks-cluster-ops/live-validation-LEG1-is-wrong-leg.md:7`, `solve/changes/formation-ledger-self-move-blocks-cluster-ops/live-validation-LEG1-is-wrong-leg.md:14`, `solve/changes/formation-ledger-self-move-blocks-cluster-ops/live-validation-LEG1-is-wrong-leg.md:34`). It also identifies progress-write failures into `replica_operations` as the self-referential amplifier (`solve/changes/formation-ledger-self-move-blocks-cluster-ops/live-validation-LEG1-is-wrong-leg.md:39`).

External-practice context supports explicit formation sequencing: Elasticsearch waits for a strict majority of configured initial masters before bootstrap (`research-external-systems-selfmove-interlock.md:255`-`research-external-systems-selfmove-interlock.md:268`), etcd static bootstrap forms on all specified members with no single-node-then-self-move sequence (`research-external-systems-selfmove-interlock.md:274`-`research-external-systems-selfmove-interlock.md:280`), and Consul stages servers as non-voters until healthy (`research-external-systems-selfmove-interlock.md:286`-`research-external-systems-selfmove-interlock.md:297`). Principle C maps that to this system as `formation -> ledger spread -> admission open` (`research-external-systems-selfmove-interlock.md:351`).

## T1 — live formation timeline from `data/examples/service-data-affinity-demo/node-{0..4}.log`

### Nodes join after seed bootstrap has already formed system partitions

| Node | Join / start evidence | `join_ready` evidence |
| --- | --- | --- |
| node-0 seed | starts as seed at `2026-07-06T15:22:45.962Z` (`data/examples/service-data-affinity-demo/node-0.log:6`) | `join_ready` at `15:22:56.206Z` (`data/examples/service-data-affinity-demo/node-0.log:271`) |
| node-1 | starts joining at `15:23:19.950Z` (`data/examples/service-data-affinity-demo/node-1.log:8`) | `join_ready` at `15:23:32.399Z` (`data/examples/service-data-affinity-demo/node-1.log:216`) |
| node-2 | starts joining at `15:23:19.956Z` (`data/examples/service-data-affinity-demo/node-2.log:8`) | `join_ready` at `15:23:50.771Z` (`data/examples/service-data-affinity-demo/node-2.log:331`) |
| node-3 | starts joining at `15:23:19.955Z` (`data/examples/service-data-affinity-demo/node-3.log:8`) | `join_ready` at `15:24:09.128Z` (`data/examples/service-data-affinity-demo/node-3.log:322`) |
| node-4 | starts joining at `15:23:19.954Z` (`data/examples/service-data-affinity-demo/node-4.log:8`) | `join_ready` at `15:23:40.342Z` (`data/examples/service-data-affinity-demo/node-4.log:284`) |

Important ordering: the seed is ready at `15:22:56`, while the four joiners do not even start joining until `15:23:19.95x`. So an etcd-shaped L3a would need to delay current seed bootstrap by about **24 seconds just to see joiners start**, and by about **73 seconds** to wait for the slowest joiner to become `join_ready`.

### Five priority system partitions bootstrap seed-local

First replica `starting` timestamps for the five quest-named system partitions:

| Partition | First bootstrap line | Last of three seed replicas ready |
| --- | --- | --- |
| `control_plane_publications-p1` | `15:22:47.333Z` (`node-0.log:79`) | `15:22:52.439Z` (`node-0.log:200`) |
| `replica_operations-p1` | `15:22:58.333Z` (`node-0.log:311`) | `15:23:05.077Z` (`node-0.log:443`) |
| `sql_transaction_participants-p1` | `15:23:04.275Z` (`node-0.log:432`) | `15:23:10.683Z` (`node-0.log:550`-`node-0.log:551`) |
| `sql_transactions-p1` | `15:23:05.077Z` (`node-0.log:447`) | `15:23:10.860Z` (`node-0.log:554`) |
| `sql_write_operations-p1` | `15:23:06.011Z` (`node-0.log:462`) | `15:23:11.931Z` (`node-0.log:579`) |

This confirms the initial problem shape: the priority control-plane partitions are formed before joiners are available, then rebalancer spread starts after joiners appear.

### Ledger self-move / spread timeline

Operation-row creates on `replica_operations-p1` in this artifact:

| Operation | Create | Complete | Duration | Notes |
| --- | --- | --- | ---: | --- |
| `ba10ff21...` `REPLACE` to node-1 | `15:23:21.157Z` (`node-0.log:1517`) | `15:23:38.465Z` (`node-1.log:311`) | 17.308s | First disruptive ledger self-move; dependent moves immediately defer on `operation_ledger_self_move_in_flight` (`node-0.log:1503`). |
| `7260bd21...` `ADD` to node-4 | `15:23:39.378Z` (`node-1.log:335`) | `15:23:42.823Z` (`node-1.log:383`) | 3.445s | Emergency/prioritized surplus/spread ADD after first REPLACE. |
| `70a35257...` `REPLACE` to node-2 | `15:23:42.917Z` (`node-1.log:397`) | `15:23:59.601Z` (`node-4.log:418`) | 16.684s | Second successful disruptive ledger self-move; last successful ledger self-move row in this artifact. |

Counts from a full scan of the five node logs:

- `operation_ledger_self_move_in_flight`: **159** (`node-0`:149, `node-1`:10), first at `15:23:21.100Z` (`node-0.log:1503`), last at `15:23:58.952Z` (`node-1.log:589`).
- `operation_ledger_quorum_concentrated`: **34** (`node-0`:32, `node-1`:2), first warning/skip at `15:23:39.031Z` (`node-0.log:2187`-`node-0.log:2188`), last at `15:23:42.909Z` (`node-1.log:394`).
- `operation_ledger_self_move_waiting_for_idle_ledger`: **2**, both on node-1: `15:24:00.824Z` (`node-1.log:614`) and `15:25:11.378Z` (`node-1.log:1088`). These were **attempted self-REPLACE executions that did not create operation rows**.
- Ledger self-move execution attempts: **4** self-`REPLACE` executions (`node-0.log:1499`, `node-1.log:395`, `node-1.log:613`, `node-1.log:1087`), of which only the first two created `REPLACE` operation rows. The later two were skipped by `waiting_for_idle_ledger`.

So in this artifact, the successful `replica_operations-p1` spread operations occupy `15:23:21.157Z` through `15:23:59.601Z` (**38.444s first-create to last-complete**), with some surplus/cleanup self-move attempts still blocked later.

### Ratings `[2/4]` timing

The node logs do not contain a literal `[2/4]` marker, but they do contain the ratings DDL. The admin/demo tries to clean up ratings at `15:29:32.422Z`, but `DROP TABLE` is unsupported (`node-0.log:9214`). It starts `CREATE TABLE ratings` at `15:29:32.424Z` (`node-0.log:9215`) and fails provisioning at `15:30:03.867Z` (`node-0.log:9509`-`node-0.log:9510`). That is **31.443s** after table creation starts, matching the 30s table-create provisioning budget (`src/query/query-constants.js:427`).

The failure is not an interlock defer at the final DDL edge. It is a progress/persistence failure:

```text
2026-07-06T15:30:03.867Z table-creation-service ratings Initial table partition provisioning failed: Distributed operation failed due to participant failures
```

with the preceding `replica_operations` write failing against `replica_operations-p1-r4` (`node-0.log:9507`-`node-0.log:9508`). Earlier, the same class starts at `15:24:46.606Z`: `Failed to insert system table row` / `Failed to persist operation` for `replica_operations`, first failed participant `replica_operations-p1-r4` (`node-0.log:3704`-`node-0.log:3705`). A full scan counted **553** `Transient CDC SQL ... retrying` log lines from `15:24:36.526Z` (`node-0.log:3512`) through `15:30:07.092Z` (`node-4.log:2562`), and **94** failed `UPDATE` + **69** failed persist + **23** failed insert events on `replica_operations` rows.

### Does the control plane ever settle?

No. The logs repeatedly report `contractState:"degraded"` / `contractReason:"published_active_coverage_incomplete"`. It is still degraded with `prioritySpreadPending:true` at `15:30:00.455Z` (`node-3.log:2579`) and again at `15:30:07.119Z` (`node-3.log:2722`). Node shutdown starts at `15:30:02.423Z` (`node-0.log:9427`-`node-0.log:9429`) while the DDL is still in flight.

### T1 sufficiency answer

**Sequencing behind only the successful ledger self-move rows is not sufficient.** In this artifact, those rows complete at `15:23:59.601Z`; ratings `CREATE TABLE` starts at `15:29:32.424Z`, more than five minutes later, and still fails. The missing property is not merely “no live self-move row”; it is “ledger spread and control-plane writes are clean/settled.” Therefore L3 must be paired with a mechanism that prevents the post-spread `replica_operations` write failures and residual priority-spread/control-plane-write-unhealthy state.

## T2 — L3a feasibility: form the ledger spread from the start

### Current initial placement is seed-concentrated by construction

`SeedPartitionsPhase.phasePartitions()` iterates every `SYSTEM_TABLE_SCHEMAS` entry, resolves the initial partition ID and initial replica IDs, then constructs **all peer addresses with the local seed `nodeId`** (`src/bootstrap/phases/seed-partitions-phase.js:79`-`src/bootstrap/phases/seed-partitions-phase.js:95`). The schema constants are explicit: “Each partition has 3 replicas on the seed node” (`src/bootstrap/system-table-schemas-constants.js:152`-`src/bootstrap/system-table-schemas-constants.js:155`), and `replica_operations-p1` has `r1/r2/r3` fixed (`src/bootstrap/system-table-schemas-constants.js:177`-`src/bootstrap/system-table-schemas-constants.js:179`). The five partitions in this quest are marked priority control-plane tables (`src/bootstrap/system-partition-classification.js:17`-`src/bootstrap/system-partition-classification.js:23`).

This is not an accidental target selection bug; it is the bootstrap contract.

### Can bootstrap wait for / target N joined nodes?

Not with the current product surface. I found only a deployment-level default: the Helm chart says total cluster size is `1 + joiners.replicas` and defaults to 2 joiners / 3 total nodes (`charts/lagrange-node/values.yaml:3`-`charts/lagrange-node/values.yaml:16`, `charts/lagrange-node/README.md:41`-`charts/lagrange-node/README.md:43`). That is not a runtime bootstrap quorum contract, and the local demo runs 5 nodes while Helm defaults to 3.

Existing join gates are readiness/metadata gates, not an “expected member set” gate:

- Seed bootstrap rejects joiners if leader metadata is incomplete (`src/bootstrap/owners/bootstrap-request-owner-handler.js:430`-`src/bootstrap/owners/bootstrap-request-owner-handler.js:443`).
- Bootstrap readiness has a `LEADER_METADATA_READY` dependency (`src/bootstrap/owners/bootstrap-readiness-snapshot-evaluator.js:178`-`src/bootstrap/owners/bootstrap-readiness-snapshot-evaluator.js:185`).
- Join readiness reasons are `routing_not_ready`, `topology_not_ready`, `schema_version_unknown`, and `schema_version_lag` (`src/bootstrap/node-joining-constants.js:43`-`src/bootstrap/node-joining-constants.js:48`), with evaluator precedence over those reasons (`src/bootstrap/join-readiness-evaluator.js:28`-`src/bootstrap/join-readiness-evaluator.js:33`).
- The `seed-join-gate-authoritative-refresh` quest is about a stale leader-metadata miss doing a bounded authoritative re-read; it is not an initial static member-set gate (`solve/quests/seed-join-gate-authoritative-refresh.json:2`-`solve/quests/seed-join-gate-authoritative-refresh.json:4`).

There is also a deliberate small-cluster safety posture in the ledger concentration predicate: the hold engages only when spread is actionable, and “clusters too small to spread must not deadlock” (`src/rebalancer/operation-ledger-quorum-concentration.js:158`-`src/rebalancer/operation-ledger-quorum-concentration.js:166`). L3a would need an equivalent formation-mode escape hatch.

### Single-node and slow-join breakage

A genuine single-node cluster cannot wait forever for N>1. If L3a requires N=3 or N=5 before `replica_operations-p1` exists, a single-node cluster never forms. If it dynamically uses N=1 when only one node is present, it reproduces today’s seed concentration and still needs a later self-move. If it prewrites peer addresses for not-yet-joined nodes, initial quorum is unreachable.

The demo’s own timeline shows why this matters: system partitions finish seed-local bootstrap before joiners start. An L3a implementation would be a new runtime bootstrap mode with an explicit expected-member set, timeout/fallback semantics, and split-brain protection. That is larger than this lever and touches bootstrap, membership, partition creation, and deployment contracts.

### L3a verdict

**NEEDS-PREREQ.** Prerequisites:

1. Runtime `expected_cluster_size` / static bootstrap member-set contract with one-shot semantics (etcd/Elasticsearch-shaped).
2. Explicit single-node fallback semantics.
3. A deterministic formation test for slow/missing joiners proving no infinite wait and no unreachable initial quorum.

Reuse level: low-to-medium. It reuses seed partition creation but changes its owner contract.

Blast radius: high. It changes how all initial system partitions are formed, not just `replica_operations-p1`.

Run-20/run-22 safety risk: high if it bypasses self-move interlocks without proving the initial quorum is real and writable.

Does L3a alone move `[2/4]`? **Not proven; likely no in this artifact.** Avoiding the self-move would remove one formation hazard, but ratings failed after successful ledger self-move rows because the control plane never settled and progress writes still failed.

Falsifier: a runtime-supported expected-member formation mode that forms `replica_operations-p1` across the final voters, proves single-node fallback, and makes the current `[2/4]` artifact pass without L1/L2 changes.

## T3 — L3b feasibility: sequence + accelerate the existing self-move

### Existing machinery already gives ledger spread priority

The prior spread-first machinery is real and wired:

- Planning-gate bypass forces a concentrated operation-ledger quorum cure to be planned immediately (`src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js:124`-`src/rebalancer/rebalancer-priority-recovery-planning-gate-methods.js:138`). This is the commit `e633ad76 fix(rebalancer): ledger quorum spread outranks dependent moves`.
- Priority create-budget scopes include `PRIORITY_ADD` and `EMERGENCY_PRIORITY_ADD` (`src/rebalancer/rebalance-coordinator-concurrent-add-budget.js:7`-`src/rebalancer/rebalance-coordinator-concurrent-add-budget.js:14`, `src/rebalancer/rebalance-coordinator-concurrent-add-budget.js:71`-`src/rebalancer/rebalance-coordinator-concurrent-add-budget.js:98`). Priority routing applies to ADD/REPLACE on priority control-plane partitions (`src/rebalancer/rebalance-coordinator-concurrent-add-budget.js:146`-`src/rebalancer/rebalance-coordinator-concurrent-add-budget.js:162`).
- `control_plane_publications` and `replica_operations` are emergency-priority partitions (`src/control-plane/priority-recovery-admission-constants.js:43`-`src/control-plane/priority-recovery-admission-constants.js:52`).
- The interlock serializes disruptive `REPLACE`/`REMOVE` self-moves and defers all other operations while one is live (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:18`-`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:42`, `src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:129`-`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:223`).
- The quorum-concentration hold defers non-exempt operations while an actionable concentrated ledger exists (`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:305`-`src/rebalancer/rebalance-coordinator-ledger-interlock-admission.js:337`).

### Why spread / formation still takes too long

Breakdown against the requested buckets:

1. **Progress-write failures (L2 amplifier): dominant after the successful spread rows.** In this artifact, the first durable `replica_operations` write failure is after the last successful ledger self-move row: last ledger `REPLACE` completes at `15:23:59.601Z` (`node-4.log:418`), while `Failed to insert system table row` into `replica_operations` starts at `15:24:46.606Z` (`node-0.log:3704`-`node-0.log:3705`). These failures then continue into the ratings failure (`node-0.log:9507`-`node-0.log:9510`). So they are not the cause of the first 38s successful ledger spread in this artifact, but they are the cause of “spread did not leave a clean control plane.”
2. **Serialization one self-move at a time: real and intended.** The code requires disruptive ledger self-moves to admit only into an idle ledger (`rebalance-coordinator-ledger-interlock-admission.js:100`-`rebalance-coordinator-ledger-interlock-admission.js:117`). The live logs show 159 `operation_ledger_self_move_in_flight` dependent deferrals during the first/second successful spread window.
3. **Planner re-minting/churn: present but not enough as an L3-only root.** The artifact has 16 `Starting rebalancing` cycles for `replica_operations-p1`, 9 “Deferring spread-driven count-increasing ADD” logs, 4 self-REPLACE executions, and 2 self-REPLACE skips. The priority planning-gate bypass fires while the coordinator still sees operation creation required (`node-1.log:1078`, `node-1.log:1084`-`node-1.log:1088`). Existing priority lanes reduce but do not eliminate churn because admission can still defer the cure when the ledger is not idle.
4. **`waiting_for_idle_ledger` backpressure: small count, high leverage.** Two count-neutral spread attempts at `15:24:00.824Z` and `15:25:11.378Z` are rejected by `operation_ledger_self_move_waiting_for_idle_ledger` (`node-1.log:614`, `node-1.log:1088`). The existing run-28 DT documents the same class: a stale same-ledger self-move ghost can block subsequent spread REPLACE past the 30s CREATE TABLE budget (`test/convergence/dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js:8`-`test/convergence/dt6-formation-ledger-spread-completion-self-move-interlock-deadlock.test.js:25`).

### Sequencing options

#### (a) Demo-side wait for control-plane settle

Legitimate only if it waits for the quest’s real predicate: formation settles, then load runs. But the live artifact never settles: late traces remain degraded with `prioritySpreadPending:true` (`node-3.log:2579`, `node-3.log:2722`). A demo wait would therefore expose the same failure as a settle timeout, not fix `[2/4]`. It is not “cheating” if used as an ordering guard after the control plane truly settles; it is cheating if it merely sleeps or ignores degraded control-plane state.

#### (b) Admission-side wait instead of fail

The current table-create provisioning budget is 30s (`src/query/query-constants.js:427`), installed as `tablePartitionProvisioningTimeoutMs` by default (`src/query/sql-query-engine-instance-initializer.js:99`-`src/query/sql-query-engine-instance-initializer.js:103`). There is already a full-budget wait for whole-cluster transient provisioning holds, explicitly including ledger interlock reasons (`src/query/sql-query-engine-initial-partition-provisioning.js:673`-`src/query/sql-query-engine-initial-partition-provisioning.js:727`; transient reasons at `src/query/sql-query-engine-provisioning-admission-methods.js:7`-`src/query/sql-query-engine-provisioning-admission-methods.js:24`).

But in this artifact ratings does not fail with a final typed admission hold; it fails on a participant/progress write failure after 31.443s (`node-0.log:9507`-`node-0.log:9510`). Therefore “make provisioning wait on interlock reason” is not enough unless the spread/control-plane-write path also becomes clean. Raising the 30s timeout is not a principled L3 fix; it would mask the fact that control-plane settlement never happens.

#### (c) Accelerate via priority lanes

Priority lanes are already in use. Further acceleration must change one of the binding causes: reduce self-move progress writes (L2), narrow the interlock (L1), or fix the stale/ghost/surplus path that makes the later cleanup self-moves wait. Merely assigning a higher lane to work that still cannot write durable progress or still sees a live-operation blocker does not close `[2/4]`.

### L3b verdict

**NEEDS-PREREQ**, not standalone SHIP-CANDIDATE.

Reuse level: high. It reuses the existing interlock, quorum-concentration predicate, priority lanes, provisioning transient-hold wait, and dt6 harnesses.

Blast radius: medium if implemented as an actual formation/admission phase gate; high if it changes ledger self-move admission semantics.

Run-20/run-22 safety risk: moderate. The pinned tests explicitly protect the real hazards: run-20 co-scheduling progress-write storm (`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:13`-`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:40`, `test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:105`-`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:111`) and run-22 release-too-early quorum concentration (`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:13`-`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:46`, `test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:149`-`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:167`). L3b must not let dependent provisioning co-admit into either unsafe window.

Does L3b alone move `[2/4]`? **No, not against this artifact.** It needs L2/L1 or an equivalent progress-cleanliness prerequisite so “spread complete” also means “operation ledger writable and control plane settled.”

Falsifier: a DT/live run where the only failing observable is a typed ledger-interlock admission hold during ratings provisioning, the ledger spread completes cleanly within 30s under existing write semantics, and a pure formation/admission wait makes `[2/4]` pass 3x with no L1/L2 change.

## T4 — deterministic testability for the strongest sub-lever

The strongest L3 sub-lever is **L3b as an actual formation/admission phase gate**, because it reuses existing safety machinery instead of inventing static bootstrap membership.

Sketch a deterministic RED test, reusing dt6 pieces and avoiding the prior wrong-leg trap of injecting a non-live precondition:

1. Use `VirtualTimeSource` and `createTimeoutTestCoordinator`, as existing dt6 tests do (`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:1`-`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:11`).
2. Initialize actual `services`/`nodes` cache rows with `replica_operations-p1-r1/r2/r3` on seed, using the same bootstrap truth as `buildBootstrapLedgerRows()` (`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:89`). Do not inject an artificial transaction; the race is created by normal formation placement plus a client CREATE.
3. Drive the real coordinator create/admission path for:
   - first ledger spread `REPLACE`,
   - dependent priority control-plane moves,
   - a client/table provisioning `ADD` for a new table partition.
4. Use the existing deterministic fault model: ledger progress writes fail while the ledger is concentrated and there is more than one live operation contending (`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:33`-`test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:40`; run-20 model at `test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:105`-`test/convergence/dt6-rebalancer-formation-self-move-interlock.test.js:111`).
5. Wrap a real or minimally-real `SQLQueryEngineInitialPartitionProvisioning.provisionInitialTablePartition()` call with `tablePartitionProvisioningTimeoutMs = 30_000` virtual ms. Expected RED today: the CREATE races the ledger spread/control-plane recovery window and exits with the same binding observable class: no routable ratings partition before the provisioning budget, with typed `operation_ledger_self_move_in_flight` / `operation_ledger_quorum_concentrated` and/or progress-write failure evidence.
6. Expected GREEN for a valid L3b+prereq fix: the CREATE is not admitted until both `ensureOperationLedgerQuorumSpreadFirst` would not hold and there is no live disruptive ledger self-move; then the DDL completes before its own 30s budget. Red-on-revert should fail because the DDL starts during the concentrated/self-move window.

This test should assert the user-visible observable (CREATE/provisioning timeout) rather than only an injected interlock branch.

## T5 — verdict matrix

| Sub-lever | Verdict | Reuse | Blast radius | Safety interaction | L1/L2 composition | What falsifies verdict |
| --- | --- | --- | --- | --- | --- | --- |
| L3a: pre-place ledger across joined nodes | **NEEDS-PREREQ** | Low/medium | High: bootstrap + membership + partition creation | High risk to single-node and slow-join clusters; could create unreachable quorum | Would reduce need for L1/L2 only under a real static bootstrap mode; otherwise still needs them | A runtime expected-member bootstrap contract proves single-node fallback and 5-node direct placement, and `[2/4]` passes without progress-write/interlock changes |
| L3b: phased self-move before foreground provisioning | **NEEDS-PREREQ** | High | Medium | Must preserve run-20 serialization and run-22 quorum-spread-first holds | Needs L2 progress-write reduction and/or L1 interlock narrowing so “spread done” means control plane writable | A pure L3b gate makes the binding CREATE TABLE DT and 3x live scenario pass while logs show no residual progress-write/control-plane-write failure |

Adversarial conclusion: **do not ship L3 as a standalone fix.** Use L3b as the sequencing wrapper after the ledger spread can actually complete cleanly; treat L3a as a larger static-bootstrap feature, not a tactical quest lever.
