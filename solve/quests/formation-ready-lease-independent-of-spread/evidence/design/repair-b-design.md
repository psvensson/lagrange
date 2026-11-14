# Repair B: design for sealing a Quest

**Rule being implemented:**
- A node's READY lease states only that the node can serve.
- "Formation complete" is one cluster-level fact.
- That fact is consumed only where it protects something.

**Base:**
- GitHub `main` at `232082669eddebe4c9fd98d3e07c11fc91ffb781`.
- Clean checkout at `/mnt/data/peter/projects/lagrange-landing-20261114`.
- Paths below are relative to that checkout unless they are absolute.

**Method:** This work was read-only. I made no repository edits, ran no tests and started no lab jobs. The census used five independent read-only sub-readings of main. Their citations were spot-checked against main, and conflicts were resolved against the code.

**Markers:**
- **[V]** verified in code at the cited file:line on main.
- **[V-log]** verified in a run log.
- **[I]** inferred.

**Companion document:** `deadlock-decision-packet.md`, in this directory. It covers the cycle, the history, and the choice of B.

---

## 0. Summary and two corrections to the packet

**One unit, not two.** The seed-side handoff machinery is not inert when nothing on the joiner consumes it (§4.5):
- It writes durable `control_plane_publications` rows.
- It re-arms readiness planning.
- It overwrites `ready`/`state` on the seed's own startup-authority reads, which the rebalancer consumes.
- It drives the cure-target exemption.

So B1 must already unwire it. Once it is unwired, the leftover files have no production importer and are kept alive only by about 8,000 lines of tests asserting dead code. The owner's no-legacy rule forbids that half-state. I recommend **one Quest that lands as two commits**:
1. **Behaviour and unwiring.**
2. **Mechanical deletion** of files, tests, scripts, models and registries.

The repository's exact-count fallback census (`check-repository-legacy-fallback-closure`) would otherwise have to be re-sealed twice.

**Falsifier 1 found no consumer that becomes unsafe.** Details are in §1. What it did find:
- The cluster-protecting consumers already read their own spread fact. These are user-table routing, CREATE TABLE replica targets, the admin load lane, `/readyz`, ordinary placement, and the ledger quorum-spread hold.
- Three liveness changes need witnesses (§1.3).

**Correction 1 to the packet (§5 there).** The packet said the cluster opened ACTIVE before the ledger spread in passing runs. More precisely:
- What opened early was the **test harness's node-level ACTIVE**: `/bootstrap/ready` 2xx plus admin `/health`.
- The pg-wire listener also came up, but **system-table** routing is never gated [V `query-executor-partition-service-resolution.js:359-365`].
- **Client-visible user-table serving** was still refused by `serveEligible` with `PRIORITY_SPREAD_PENDING` [V `serve-eligibility-record-decision.js:122-130, 174-183`]. So was `/readyz` [V `bootstrap-readiness-snapshot-evaluator.js:220-229`].

So the barrier was never the only guard of the cluster property. That strengthens B.

**Correction 2 to the packet (§1(c) there).** In the failed run the topology-settling gate on the priority partitions logged `topology_operations_in_flight`, not `node_ready_lease_incomplete` [V-log]. That correction was already folded into the packet.

**Main against the read line.** Every owner file the packet cites is byte-identical between `232082669` and `551bf2643`. The full list is in §0.1. The 35 src files that differ are all in the CDC propagation and obligation path. The only one of them in the joiner path is `node-joining-publication-activation.js`, which changes only the CDC event vector signature. **None matters to this design.** [V `git diff 232082669 551bf2643`]

### 0.1 Owner-file diff, main against 551bf2643 (all 0 lines)

The following files show 0 lines of diff.

**src/control-plane:**
- `formation-release-handoff-closure-owner.js`, `-contract.js`, `-evidence.js`, `-identity.js`, `-publication.js`, `-publication-coordinator.js`
- `control-plane-readiness-formation-release-methods.js`
- `control-plane-readiness-startup-authority-health.js`
- `startup-authority-snapshot-owner.js`
- `publication-recovery-gate.js`
- `membership-publication-priority-partition-summary.js`, `membership-publication-priority-partition-readiness-data.js`
- `startup-authority-placement-eligibility.js`
- `control-plane-readiness-participation-base.js`
- `membership-publication-coordinator-reconcile.js`, `-reconcile-helpers.js`, `membership-publication-candidate-derivation.js`
- `node-liveness-semantic-projection.js`

**src/bootstrap:**
- `node-joining-operation-ledger-formation-readiness.js`
- `node-joining-ready-signal-readiness.js`
- `node-joining-constants.js`

**src/rebalancer:**
- `unified-rebalancer-available-nodes.js`
- `unified-rebalancer-critical-topology-methods.js`
- `priority-publication-safety-topology.js`
- `operation-workflow-remove-safety-evaluator.js`
- `rebalance-coordinator-ledger-interlock-admission.js`
- `operation-workflow-dispatch-epoch-gate.js`

---

## 1. Falsifier 1: the consumer census

**Facts searched:**
- the node READY lease: `ready_lease_expires_at`, `READY_LEASE_EXPIRES_AT`, `readyNow`, `isNodeRecordReady`, `isCurrentReadyMember`, `isCandidateActiveLeasedNode`, `isNodeActiveWithCurrentLease`;
- lifecycle status: `NodeStatus.ACTIVE/JOINING`, `NODE_STATE.ACTIVE/JOINING`, `'joining'`;
- `startupAuthorityReady`;
- barrier states: `OPERATION_LEDGER_FORMATION_BARRIER*`, `ledger_spread_satisfied`, `bypassed_insufficient_formation_cohort`, `waiting_for_startup_authority`;
- handoff states: `formationReleaseHandoff`, `releaseAuthorized`;
- placement carve-outs: `isFormationCohortSpreadCureTarget`, `classifyFormationCohortSpreadCureNode`, `isStartupAuthorityControlPlanePlacementEligibleNode`;
- serve eligibility: `answerCommittedNodes`, `serveEligible`, `SERVE_ELIGIBILITY_STATE`, `committedNodeFloor`;
- schema and formation names: "schema admission", `schemaAdmission`, `admitSchema`, `DDL_ADMISSION`, `formationComplete`, `prioritySpreadSatisfied`.

**Paths searched:**
- `src/{rebalancer,control-plane,partition,raft,topology,cdc,node,bootstrap,query,sql*,admin,api,runtime(pgwire-*),live-query,service,function,wasm-service,workflow}`
- `test/distributed/` (harness and scenarios)
- `charts/`, `examples/`, `docs/`, `architecture/`, `README.md`

**Hit counts in the core paths [V]:**

| Term | Lines/files |
|---|---|
| `readyNow` | 20/13 |
| `ready_lease_expires_at` | 23/12 |
| `isNodeRecordReady` | 11/5 |
| `NODE_STATE.JOINING` | 15/11 |
| `formationReleaseHandoff` | 24/7 |
| `serveEligible` | 36/13 |
| `committedNodeFloor` | 9/4 |
| `startupAuthorityReady`, `isNodeActiveWithCurrentLease`, `OPERATION_LEDGER_FORMATION_BARRIER` | 0 in those paths |

### 1.1 Consumers by category

N means the decision is about the node: can it serve. C means the decision is about the cluster: is formation complete. "Unsafe under B" asks whether a joiner holding a READY lease before the priority partitions and the ledger are spread makes the decision unsafe, not merely different.

| Category | Consumer (file:line) | Decides | N/C | Unsafe under B? |
|---|---|---|---|---|
| Client query routing (user tables) | `query-executor-partition-service-resolution.js:375-410` → `serve-eligibility-record-decision.js:142-184` | Whether a replica may serve | N + C (status, lease, published, ack, **priority spread**) | **No.** `PRIORITY_SPREAD_PENDING` still refuses until the published spread is satisfied [V :122-130, 174-183] |
| Client query routing (system tables) | `query-executor-partition-service-resolution.js:359-365` | Always routable | none | Unchanged [V] |
| Group / coordinator selection | `group-selection-service.js:265-268` | Status ACTIVE picks the group representative | N | No [V; I safe]: a serving node is a legitimate representative |
| CDC group routing | `cdc-group-propagation-routing.js:498-502` | A JOINING coordinator means the group is pending | N | No [V]: falls through to the service-row check |
| Leadership transfer | `raft-rs-leadership-transfer.js`, `replica-handler-leader-handoff-methods.js`, `user-table-leader-placement-cure.js:177-182, 456-464, 549-561` | Picks targets from replica rows; the user-table cure sits behind the priority-spread gate | N | **None found** that reads node readiness [V] |
| Transaction coordination / 2PC | `src/query/distributed/*transaction*` | Transaction recovery is armed at background-writer activation (`startup-runtime-handoff-owner.js:184-188`) | N (lifecycle) | **None found** [V: terms ready_lease, isNodeRecordReady, startupAuthority, STATUS_ACTIVE, serveEligib, formation] |
| Schema admission / DDL | `sql-query-engine-provision-target-methods.js:135-163` (CREATE TABLE targets = `answerServeCohort`) | Replica targets for a new table | N + C (through serveEligible) | **No**: the cohort excludes nodes while spread is pending [V]. No gate named schema admission exists [V] |
| User-table replica placement | `unified-rebalancer-available-nodes.js:264-290` (`isCandidateActiveLeasedNode`), gated by `resolvePrioritySpreadPlanningGateDecision` (`rebalancer-priority-recovery-planning-gate-methods.js:287-337`), log `WAIT_CONTROL_PLANE_PRIORITY` (`rebalancer-constants.js:190-191`), blocker `getControlPlanePrioritySpreadBlocker` (`unified-rebalancer-priority-readiness.js:470-563`) | Ordinary candidates; non-priority entities wait for spread | N candidates, C gate | **No**: READY joiners only raise `required = min(3, max(ready, cohort))` (:511-514) [V]. Runtime-service under-replicated carve-out (:170-183, 299): it can place onto a READY joiner sooner, but such operations are DEPENDENT under the ledger quorum hold (below) [V/I] |
| Operation-ledger quorum hold | `operation-ledger-quorum-concentration.js:86-112, 159-216, 231-279`; `rebalance-coordinator-ledger-interlock-admission.js:286-307, 459-488`; `operation-ledger-hold-policy.js:236-302` | Defers DEPENDENT creation while the ledger quorum is concentrated **and** the spread is actionable (a ready node exists) | C | **No. It becomes stricter.** Today no "ready" target exists during formation, so the hold never engages. Under B, READY joiners make the spread actionable and the hold engages [V] |
| Remove safety / quorum floor | `priority-publication-safety-topology.js:121-140` (`isVoterReadyFloorCountableReplica`: voter, address, ACTIVE or SYNCING row, committed `readyNow`); evaluator `operation-workflow-remove-safety-evaluator.js:534-552, 598-604, 643-655, 676-743`; universal tier `operation-workflow-remove-safety-universal-tier.js:46-77, 178-194` | Whether a source replica may be removed | N facts, C purpose | **No, with one check.** A READY joiner's voter now counts. That is the edge that closes the deadlock, so counting it is the repair. A SYNCING voter counts, which is already the rule for every ACTIVE node (open question Q3). For a REPLACE, the replacement must also be voter-ready and routable (:643-655) [V] |
| Lease-based fencing | `lease-service.js:139-151`; `lease-service-constants.js:66-79`; `node-ready-lease-authority.js:59-74` | Reaps stranded JOINING nodes; pure expiry | N | No. Liveness change: a post-READY crash is no longer reaped as stranded JOINING (§1.3) [V] |
| Learner promotion | `learner-promotion-progress.js`, `learner-catch-up-acknowledgement.js`, `replica-voter-readiness.js`, `partition-service-learner-promotion-methods.js:419-526` | Replica progress plus a leader-signed proof | replica | **None found** that reads node readiness [V] |
| Membership publication | `membership-publication-candidate-derivation.js:233-256, 296-332, 516-520`; `active-node-projection.js:393-410` | Published active and required-ack sets | N | No. Liveness change: a READY joiner enters as a serving node and becomes ack-required (§1.3) [V] |
| Critical-topology settling gate | `unified-rebalancer-critical-topology-methods.js:83-104, 142-171` | Membership settled for critical system partitions | N | No. It clears sooner, and formation completeness is the later spread gate in the same list (`rebalancer-planning-gate-methods.js:577-592`) [V] |
| Priority-recovery eligible set | `membership-publication-priority-partition-readiness-data.js:182-237` | Spread target set | C | No. It only grows, so the target gets stricter [V] |
| Readiness endpoints | `/readyz`: `bootstrap-readiness-owner.js:108-118`, `bootstrap-readiness-snapshot-evaluator.js:220-229` (HARD `priority_control_plane_recovery` = startup authority READY, with no handoff applied) | Chart readiness probe (`charts/lagrange-node/values.yaml:58-68`, `templates/_helpers.tpl:138-151`) | **C** | No [V] |
| | `/bootstrap/ready`: `bootstrap-readiness-owner.js:119-137`, `bootstrap-join-projection-policy.js:24-29, 158-266` (priority recovery is non-blocking) | Join and harness probe | N | No [V] |
| | `/health` (SQL engine exists), `/livez` (unconditional), admin `/health` (`admin-websocket-api-base.js:404-410`) | Liveness | N | No [V] |
| Admin API | `admin-websocket-load-lane-admission.js:72-120` | Load-lane admission through serveEligible | N + C | No [V] |
| pg-wire startup | `src/runtime/pgwire-*.js` | Listener starts after the SQL runtime attaches | N | **None found** [V: terms ready, readiness, admission, ACTIVE, lease, formation] |
| Live queries, services, functions, workflow | `src/live-query`, `src/service`, `src/function`, `src/wasm-service`, `src/workflow` | n/a | n/a | **None found** [V] |
| Node-ready rebalance edge | `bootstrap-node-ready-rebalance-owner.js:204-205, 286-287`; `rebalancer-node-event-methods.js:128-152` | Not-ready to ready edge schedules a rebalance | N edge | No. The spread cure starts sooner [V/I] |
| Other lease readers | `move-replica-assignment-visibility-policy.js:106, 146`; `bootstrap-join-admission-owner.js:404-417`; `message-group-target-resolver.js:40-64`; `unified-rebalancer-follow-up-move.js:43-45, 455-482`; `rebalance-coordinator-priority-budget-admission.js:254-266`; `operation-workflow-recovery-timeout.js:926-940`; `replica-recovery-service.js:660-711`; `storage-admission-service.js:572`; `replica-dispatch-replay-health-readiness.js:160-170` | Liveness of a target, owner or drain | N | No [V/I] |
| Dead code | `cluster-readiness-signal.js:111-120` (never constructed in src; `unified-rebalancer-lifecycle-base.js:294-296` defaults to true) | n/a | C | Inert [V] |
| Test harness ACTIVE | `test/distributed/harness/cluster-class-publication-evidence.js:307-629` (`/bootstrap/ready` plus admin `/health`; `admitsPublicationConvergence` is vacuous in startup mode, `publication-convergence-claim.js:23-29`) | Harness "all nodes ACTIVE" | N | Not a safety consumer. It never read spread [V] |
| Formation scenario | `test/distributed/scenarios/fresh-formation-user-table-routability.js:11-18, 299, 514`; `fresh-formation-routability-predicate.js` | Its own spread and quiet-ledger predicate before CREATE TABLE | C | Unaffected. It asks for formation explicitly [V] |

### 1.2 Docs that state behaviour and must be reconciled [V]

- **`docs/bootstrap-readiness-probes.md:29-36`** says `/readyz` means "node is safe to serve". It needs one stated meaning under B.
- **`docs/kubernetes-and-cloud-benchmarks.md:130`, `README.md:139` and `architecture/system-model.md:471`** say `/readyz` means "cluster has formed voter quorums". This is the correct cluster meaning under B.
- **`charts/lagrange-node/templates/service-headless.yaml:14`** sets `publishNotReadyAddresses: true`, so the chart does not route peers by `/readyz`. Unaffected.

### 1.3 Liveness changes under B that need witnesses (not safety findings)

1. **A READY joiner becomes ack-required for membership publication.** A joiner that crashes after READY stalls publication completion until failure handling removes it [V/I]. `FailureDetector` is not constructed anywhere in `src` [V grep `new FailureDetector`], so failure handling must be identified (open question Q4).
2. **The stranded-JOINING reaper no longer applies to a joiner that crashes after READY.** The node stays ACTIVE with an expired lease. Placement and the floor drop it at lease expiry (15 s) [V `node-readiness-policy.js:169-172`; `src/constants/time.js:5`].
3. **The ledger quorum hold engages during formation.** It defers dependent and user operations until the ledger spreads. That is the intended "consumed where it protects" behaviour, but it is a new wait.

**Verdict: no consumer becomes unsafe.** Everything that decides "the cluster may open" already reads a cluster-level spread fact. Everything that reads the READY lease is node-scoped, or counts nodes in a quorum-sound way.

---

## 2. The formation fact

### 2.1 Where it is computed today

There is one holder-and-count primitive, `buildDerivedPriorityPartitionSummary` (`membership-publication-priority-partition-summary.js:449-630`) [V]. It has five callers, and they compute it differently [V]:

| # | Caller | Node set | Rows | When the answer is unknown |
|---|---|---|---|---|
| A | Publication candidate derivation (`membership-publication-candidate-derivation.js:612-628`). Writes the summary into the durable `control_plane_publications.priority_partition_summary` | locallyEligible ∪ projectedServing ∪ publishedActive | planning snapshot rows | Uses the embedded summary (:627) |
| B | Current placement observation (`current-priority-placement-observation.js:469-533`, memo `priority-placement-observation-memo.js:109-176`). Adds **leader coverage** | ready ∪ cohort ∪ projectedServing ∪ publishedActive | system-table **cache** | `unavailable`, read as not pending |
| C | Rebalancer spread fence `getControlPlanePrioritySpreadBlocker` (`unified-rebalancer-priority-readiness.js:470-563`). Source of "Deferring non-system rebalancing…" | its own `min(3, max(ready, cohort))` | A or B (blocked if either is pending) | `null`, read as **not blocked (fails open)** |
| D | Membership coordinator catch-up (`membership-publication-coordinator-reconcile-helpers.js:184-213`) | ACTIVE ∪ cached published | cache | false |
| E | `observeCriticalPlacement` → `critical-placement-convergence.js:398-447`. Consumed only by the barrier as a diagnostic. A **different definition**: every system table's p1, target = `replica_count`, no eligibility check | none | cache | `UNKNOWN` (fails closed) |

**Views of A that are not separate computations [V]:**
- `durablePriorityPartitionSummary` (`publication-recovery-priority-spread.js:151`).
- `prioritySpreadPending` (:104-115). A null summary reads as not pending.
- The startup authority's spread input (`startup-authority-snapshot-owner.js:523`). There a null summary means RECOVERY_PENDING or UNAVAILABLE, which **fails closed**.
- serveEligible's `PRIORITY_SPREAD_UNSTATED/PENDING`. This **fails closed** on unstated.

### 2.2 Definition (as built, which is the one B keeps)

- **Partitions.** Every partition of the six `PRIORITY_CONTROL_PLANE_TABLE_ID_LIST` tables (`src/bootstrap/system-partition-classification.js:50-60`):
  - `control_plane_publications`
  - `replica_operations` (the operation ledger)
  - `sql_transactions`
  - `sql_transaction_participants`
  - `sql_write_operations`
  - `schema_operations`

  Each table's p1 is included even when it has no rows (`resolveCensusPriorityPartitionIds`) [V]. **The ledger is inside the fact, so "ledger spread" needs no separate fact.**
- **Distinct holders.** `requiredDistinctNodeCount = min(3, |eligible|)` (:45, 560-563). A partition is blocked when `required > 1` and `distinctHolderNodes < required`. `satisfied` means no partition is blocked (:575-578, 621) [V].
- **Eligible node set.** The union of locally eligible, projected serving and published active (`…readiness-data.js:182-217`). If that is empty, the promotable nodes are used. If that is still empty, the **nodes that already hold replicas** are used (summary :549-558). With only the seed holding replicas, that last fallback makes the seed alone read as satisfied [V].
- **Holder.** A partition service row with ACTIVE status, a voter raft role, an address and a node id, on an eligible node (`resolvePrioritySpreadReplicaExclusionReason` :411-433; exported `isPrioritySpreadHolderServiceRow` :443) [V]. There is **no catch-up test and no node-READY test**. A holder on a pre-READY joiner counted in the failed run [V-log, 12:32:17.975 summary].
- **Input authority.** A reads the planning snapshot's rows, and the result is written durably and acknowledged. B, C and D read the system-table cache [V].

### 2.3 Owner under B

**The owner should be the membership-publication candidate derivation (A).** It is the only computation whose result is durable, has an epoch and is acknowledged. The fail-closed consumers already read it: serveEligible and the startup authority, and so `/readyz`.

**What B1 must do: nothing.** Its protecting consumers already read A (§3). Unifying B, C and D onto A, retiring or redefining E, and removing the "nodes that already hold replicas" fallback are **recorded follow-ups** with owner question Q2. They are not part of B. Changing them would enlarge a bounded repair.

**What B2 must do.** E's only production consumer is the barrier. With the barrier gone, `src/bootstrap/critical-placement-formation-observer.js` (231 lines) and `critical-placement-convergence.js`, if it has no other importer, have no production consumer. Delete them, or keep E as a diagnostic only with an explicit consumer (owner question Q2).

**While unknown, under B:**
- serveEligible and `/readyz` fail closed (formation not complete) [V].
- The rebalancer fence C fails open (not blocked) [V]. That is pre-existing, and it governs only non-priority planning, which the ledger hold also guards.

---

## 3. Who owns "cluster ACTIVE" and schema admission

| Audience | Owner today (file:line) | Reads now | Under B |
|---|---|---|---|
| Clients: user-table queries, CREATE TABLE targets, admin load lane | `serve-eligibility-owner.js:1-15`, decision `serve-eligibility-record-decision.js:142-184` | Node (status, lease, load) and cluster (published, acknowledged, **priority spread A**) | Unchanged. It already refuses while the ledger is concentrated |
| Clients: Kubernetes readiness | `/readyz`, `bootstrap-readiness-owner.js:108-118`, HARD `priority_control_plane_recovery` = startup authority READY from the planning answer (`control-plane-readiness-startup-authority-health.js:264-298`) | Cluster spread through A | Unchanged. Docs reconciled (§1.2) |
| Clients: pg-wire | No cluster fact; the listener is up once the SQL runtime attaches (`lagrange-runtime-startup.js:285-309`) | none | Unchanged. Per-statement routing is serveEligible |
| Clients: system-table statements | Always routable (`query-executor-partition-service-resolution.js:359-365`) | none | Unchanged. Pre-existing, and not a formation property |
| Test harness "all ACTIVE" | `_probeClusterActiveState` (`cluster-class-publication-evidence.js:307-629`) | Node: `/bootstrap/ready` plus admin `/health` | Unchanged. Scenarios that need formation complete must ask for it, as `fresh-formation-user-table-routability` does |
| Admin API | No startup gate; load lane through serveEligible | as above | Unchanged |

**Which observable opened early in passing runs, and through which path [V path; I timing correlation]:**

1. The barrier released, because the handoff forced `ready = true` (`formation-release-handoff-contract.js:561-574`).
2. The joiner sent its READY heartbeat (`node-joining-ready-signal-readiness.js:487`).
3. `completeSuccessfulJoin` ran (`node-joining-admission-readiness.js:245-275`).
4. `startJoinNode` then called `bootstrapAPI.setSqlQueryEngine` (`lagrange-runtime-startup.js:309`). SQL_ENGINE_READY made `/bootstrap/ready` return 2xx, and the admin runtime started (:310-326).
5. The harness counted the node ACTIVE at about 12:12:58.
6. The ledger left the seed at 12:14:04.

So the observable that opened early was the **harness's node-level ACTIVE** and the pg-wire listener. **No client-facing cluster gate opened early.**

**Under B, nothing has to change for the cluster to stay closed while the ledger is concentrated.** The two cluster-protecting gates already read A. B1 changes only what the READY lease waits for.

---

## 4. B1 change set (behaviour and unwiring)

These are edits by file and function, with no code given.

### 4.1 Joiner READY

**`src/bootstrap/node-joining-ready-signal-readiness.js`**
- In `signalReadyForReplicas` (:372-529), remove the `OPERATION_LEDGER_FORMATION` progress record and the `awaitOperationLedgerFormationBarrier()` call (:443-447).
- After the change it awaits, in order:
  1. CDC subscriptions (:379);
  2. the local query transport (:403);
  3. metadata publication readiness (:424);
  4. node stats (:454);
  5. the durable READY heartbeat (:481-516).
- Delete the gate constant `OPERATION_LEDGER_FORMATION` (:57) and the imports (:2-4, :19-21).
- Delete the four `getPriorityPlacementFormation*` methods (:238-325), whose only callers are in the barrier.
- **Re-parent the class.** `NodeJoiningReadySignalReadiness` currently extends `NodeJoiningOperationLedgerFormationReadiness` (:85-86). It must extend `NodeJoiningOwnerConstruction` (the barrier class's parent, barrier :248-249).
- About 100 lines are removed [I].

**The barrier's CONNECTED heartbeat** (`publishOperationLedgerFormationLiveness`, barrier :322-344):
- **It goes away.** It existed only to keep a lease-less engaged joiner visible while READY was withheld.
- Its consumers were the handoff cohort (`isConnectedFormationMember`), the barrier's pre-ready count, and the startup-authority placement eligibility. All three are deleted [V].
- Under B, the joiner's READY heartbeat renews through the ordinary `heartbeatService.start()` (`startup-runtime-handoff-owner.js:168-182`).

**`src/bootstrap/node-joining-constants.js`** loses:
- `priorityPlacementFormationDiscoveryMs`, `PollMs` and `TimeoutMs` (:35-37);
- `JOINING_LOG_MSG.PRIORITY_PLACEMENT_FORMATION_BARRIER*` (:154-160);
- `JOINING_ERROR_MSG.OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT` (:306-308).

Test configs that set these keys need the dead key dropped:
- `three-node-seed-rebalance.integration.test.js:324, 340`;
- `critical-replica-placement-causal-trace.integration.test.js:363`;
- `formation-barrier-test-fixture.js:167-169`.

### 4.2 The startup authority without the handoff

**`src/control-plane/control-plane-readiness-startup-authority-health.js`**
- `getStartupAuthoritySnapshotSync` (:127-152) and `resolveStartupAuthoritySnapshotFromPlanningRead` (:180-230, used by `getStartupAuthoritySnapshot` :248-261) must return the plain `buildStartupAuthoritySnapshotFromPlanningAnswer(...)` result.
  - They must perform no `applyFormationReleaseHandoff` and no durable handoff read.
  - Today **every** startup-authority read applies the handoff, not only the `FormationRelease*` variants [V].
- Delete `getFormationReleaseStartupAuthoritySnapshotSync` (:154-178) and `getFormationReleaseStartupAuthoritySnapshot` (:232-246), and their exports (:649, :651).

**`src/control-plane/control-plane-readiness-service.js`:** remove:
- the import (:34-35);
- the log signature field (:45);
- `setFormationReleaseAuthorityNodeId` (:73-74);
- the wrappers (:618-631);
- `installControlPlaneReadinessFormationReleaseMethods` (:787).

**`src/control-plane/control-plane-readiness-participation-base.js`:** remove:
- the imports (:11-12);
- `formationReleaseAuthorityNodeId` (:86-89, 315-319, 585);
- the closure owner and publication coordinator construction (:232-233, 239-251).

**`src/control-plane/control-plane-readiness-planning-owner-delegate-methods.js:65`:** remove the coordinator `shutdown()`.

**Plumbing for `formationReleaseAuthorityNodeId`:** remove it from:
- `src/bootstrap/shared/control-plane-setup.js:200, 311, 323-325`;
- `bootstrap-service-control-plane-runtime-methods.js:133`;
- `node-joining-publication-activation.js:427`.

### 4.3 Priority placement node set once joiners are READY early

**Today [V]:**
- For system partitions, `getAvailableNodesConstrainedToNodeIds` (`unified-rebalancer-available-nodes.js:195-251`) first intersects the candidates with the startup-authority node set (:198-213, 305-319).
- It then tries the **startup-authority predicate** (:232-242, 321-363). That predicate admits ACTIVE **or JOINING**, CONNECTED, with live transport, using `isStartupAuthorityPlacementDispatchReady` (`unified-rebalancer-control-plane-readiness-methods.js:70-90`: dimension satisfied **or** the priority-recovery dispatch bootstrap).
- Only otherwise does it fall back to `isCandidateActiveLeasedNode` (:264-290: `readyNow` plus the decision dimension).
- **The pre-READY path stays reachable after formation**, whenever a planning snapshot exists. The same split exists in `unified-rebalancer-replica-state.js:105-125, 153-170` [V].

**Under B (B1 edits):**
- Delete the startup-authority branch (:232-242) and the methods `isStartupAuthorityControlPlanePlacementEligibleNode` (:321-363) and `isFormationCohortSpreadCureTarget` (:365-384).
- Priority placement then uses the **leased path for every partition**: `readyNow` plus the CONTROL_PLANE_RECOVERY_ELIGIBLE dimension.
- **Keep** the startup-cohort membership constraint (`getStartupAuthorityNodeIdSet` :198-213, 305-319). Move its helper `resolveStartupAuthorityNodeIdSet` out of the deleted `startup-authority-placement-eligibility.js` into `startup-authority-snapshot-owner.js` (568 lines, enough headroom) [V size].
- Delete the pre-READY carve-out in `unified-rebalancer-replica-state.js:105-125, 153-170`.
- Delete the cure exemption in `unified-rebalancer-critical-topology-methods.js:88`.
- Delete `cohortCureInFlight` in `rebalancer-priority-recovery-planning-gate-methods.js:135-138`.
- `rebalance-coordinator-topology-guard-methods.js:22-23, 92-117` (`getTopologyGuardStartupAuthorityPlacementEligibleNodeIds`) feeds `isEngagedLedgerQuorumSpreadCureMove` (:215-221) and `rebalance-coordinator-replica-identity-methods.js:316-321`. Its `placementEligibleNodeIds` must become the leased READY node set of the startup cohort.
- **`isStartupAuthorityPlacementDispatchReady`** becomes dead and is deleted.
- **Liveness witness required.** A just-READY joiner must satisfy the CONTROL_PLANE_RECOVERY_ELIGIBLE dimension without the dispatch-bootstrap carve-out. Otherwise priority placement onto it stalls. The failed seed shows readiness-planning admissions `deferred` with `completed_record_absent` for a fresh joiner for about 1 s [V-log], so the dimension can lag the lease. Whether it ever stays unsatisfied for a READY joiner was not determined (open question Q1).

### 4.4 The consumers from §3

**No edits.** serveEligible and `/readyz` already read A. Only the docs in §1.2 are reconciled.

### 4.5 Seed-side handoff left running with no consumer: not inert, so it must be unwired in B1

If the joiner stopped awaiting the barrier but the seed machinery stayed wired, it would still do the following [V]:

1. **Write.** Every observe that yields a generation offers a durable `control_plane_publications` upsert, with kind `formation_release_handoff` and id `formation-release-handoff:<seed>:<bootIncarnation>` (`formation-release-handoff-publication.js:23, 27, 427`; coordinator :65-138). Joiners are JOINING and CONNECTED for a few seconds before READY, and capture admits on a READY+spread authority (closure owner :46-89, 205-209). So captures, completions and revokes would still happen and still be written.
2. **Re-arm planning.** `onRearm` calls `recordReadinessPlanningRecoveryEpochChange` (`participation-base.js:248-249`) on every durable write.
3. **Override readiness.** When a generation is `releaseAuthorized`, every seed startup-authority read returns `ready = true` and `state = READY` (`formation-release-handoff-contract.js:561-574`). Those reads come from the rebalancer (`unified-rebalancer-priority-readiness.js:687`), the topology guard (`rebalance-coordinator-topology-guard-methods.js:103`), node reintegration, bootstrap API readiness and the cluster view.
4. **Exempt.** `formationReleaseHandoff.active` drives `isFormationCohortSpreadCureTarget` (`unified-rebalancer-available-nodes.js:381-382`).
5. **Log.** It emits "Formation release handoff authority transition" and "…publication deferred".

So leaving it running has effects, and **B1 and B2 must be one unit**, or B1 must do all the unwiring in §4.2. The second option leaves 3,259 src lines and about 8,000 test lines asserting a mechanism production no longer uses. That is exactly the no-legacy finding.

**Recommendation:** one Quest, one landing, two commits:
- **commit 1:** §4.1 to §4.3 plus the unwiring;
- **commit 2:** the §5 deletions.

### 4.6 Static-gate risks for B1 and B2 [V rule; I for each risk]

- **Decision boundaries** (`scripts/check-guideline-decision-boundaries.js:393-428`; baseline identity is (file, function, kind), `:1083-1091`).
  - Rule: any runtime function that holds an identifier containing `cache` together with one containing `sql`, `db`, `query` or `execute` is a violation. Substring match: `observedBy`, `publishedBy` and `acknowledgedBy` contain `db`.
  - **Risk 1:** moving `resolveStartupAuthorityNodeIdSet` into the snapshot owner. It is cache-free, so it is safe if moved as-is.
  - **Risk 2:** rewriting `getStartupAuthoritySnapshotSync` and the planning-read function. Keep their identifiers free of `cache` (`readFormationReleaseHandoffFromCache` goes away, which helps).
  - **Risk 3:** any new helper in `unified-rebalancer-available-nodes.js` or `rebalance-coordinator-topology-guard-methods.js` that touches `systemTableCache` and a `…By`/query name in one function. Keep cache reads in existing functions.
- **File size** (800 lines for src, 1500 for tests; `scripts/check-file-size-thresholds.js:22-25`). Current sizes of the edited files:

  | File | Lines |
  |---|---|
  | `control-plane-readiness-service.js` | 791 |
  | `rebalance-coordinator-topology-guard-methods.js` | 787 |
  | `unified-rebalancer-replica-state.js` | 775 |
  | `rebalancer-priority-recovery-planning-gate-methods.js` | 723 |
  | `node-joining-ready-signal-readiness.js` | 709 |

  All of these edits remove lines. **Nothing may move into the first three files.**
- **Complexity** (cyclomatic 12, baseline 1698; cognitive 20, baseline 145), **duplication** and **unused exports** (knip baseline 1321).
  - Deletions only lower these counts. Tighten each baseline when its checker prints the hint (one-way ratchet).
  - knip treats `test/**/*.test.js` and `scripts/**` as entry points. A src export left with test-only importers is **not caught**. Examples: `isStartupAuthorityPlacementDispatchReady`, and the critical-placement observer if it is kept. Delete them explicitly.
- **Navigability baselines.** Stale entries never fail; the checker prints a tightening hint.
  - Entries naming deleted files: `catch_returns_default` 3, `identity_keyed_module_state` 1, `legacy_term_identifiers` 10, `owner_port_feature_detection` 14, `row_field_alias_reads` 2, `two_source_fallback_reads` 1, `typeof_dual_paths` 5.
  - Entries naming deleted functions in edited files: `getPriorityPlacementFormationStartupAuthority`, `getPriorityPlacementFormationPreReadyNodeIds`, `isStartupAuthorityControlPlanePlacementEligibleNode`, `getTopologyGuardStartupAuthorityPlacementEligibleNodeIds`.
  - `inheritance_depth_over_two` on ready-signal is likely stale after the re-parent.
  - Tighten all of them. `scripts/check-guideline-literals-baseline.json:9970` (`'operation_ledger_formation'`) is stale.
- **Highest-risk gate: the exact-count fallback census** (`scripts/checks/check-repository-legacy-fallback-closure.js:23-25`, asserted again in `test/scripts/repository-legacy-fallback-closure.test.js:16-18`).
  - It pins **2685 census sites, 2682 active, 9 retired**. Site identity includes a hash.
  - Sites in deleted files: barrier 2, publication 1, coordinator 3, observer 3.
  - Edited functions carrying sites: ready-signal 9, startup-authority-health 4, available-nodes 2, critical-topology 2, topology-guard 6, replica-state 7.
  - A re-hashed site counts as retired plus new-unclassified, and fails classification closure. So `code-navigability-fallback-classification.json` (27 entries name deleted files), `data/fallback-census/census.json`, the constants and the test asserts must be updated **together**.
  - This is the strongest reason for one landing.
- **`scripts/check-guideline-boundary-mode-contracts.js:45-54`** has a hotspot entry for the barrier file. Remove it, together with its test (`check-guideline-boundary-mode-contracts.test.js:12, 210`).
- **Generated `--check` audits** must be regenerated:
  - source-owner `INDEX.md` (`src/control-plane/INDEX.md:38, 93-98, 267`; `src/bootstrap/INDEX.md:75`, and :49 if the observer is deleted);
  - the shard manifests (`test:metadata:refresh`);
  - the tools index (`steering:generate`).

---

## 5. B2 deletion census (commit 2 of the same landing)

### 5.1 src: whole files, 3,259 lines (3,490 with the observer) [V `wc -l`]

| File | Lines |
|---|---|
| `src/bootstrap/node-joining-operation-ledger-formation-readiness.js` | 479 |
| `src/control-plane/control-plane-readiness-formation-release-methods.js` | 340 |
| `src/control-plane/formation-release-handoff-closure-owner.js` | 492 |
| `src/control-plane/formation-release-handoff-contract.js` | 608 |
| `src/control-plane/formation-release-handoff-evidence.js` | 389 |
| `src/control-plane/formation-release-handoff-identity.js` | 134 |
| `src/control-plane/formation-release-handoff-publication-coordinator.js` | 184 |
| `src/control-plane/formation-release-handoff-publication.js` | 444 |
| `src/control-plane/startup-authority-placement-eligibility.js` (helper moved first, §4.3) | 189 |
| `src/bootstrap/critical-placement-formation-observer.js` (owner question Q2) | 231 |

**Exports removed:**
- `OPERATION_LEDGER_FORMATION_BARRIER_STATE`, `resolveOperationLedgerFormationBarrierState`, `buildOperationLedgerFormationBarrierLogFields`;
- `FORMATION_RELEASE_HANDOFF_STATE`/`_REASON`, `FormationReleaseHandoffClosureOwner`, `FormationReleaseHandoffPublicationCoordinator`, `attachFormationReleaseHandoffToStartupAuthority`, the contract's 13 exports, the evidence module's 12, identity's 3 and publication's 10;
- `FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION`, `classifyFormationCohortSpreadCureNode`, `getStartupAuthorityControlPlanePlacementEligibleNodeIds`, `isStartupAuthorityControlPlanePlacementEligibleNode`.

**Publication kind:** `formation_release_handoff` rows are no longer written.
- Existing durable rows from older clusters are keyed by an old boot incarnation and are never read.
- Whether they need a cleanup is open question Q5. I recommend none: the rows are inert data.

**Literals and log ids:**
- `'operation_ledger_formation'` (barrier :339);
- "Formation release handoff authority transition";
- "Formation release handoff publication deferred";
- "Join priority-placement formation barrier…";
- `OPERATION_LEDGER_FORMATION_BARRIER_TIMEOUT`.

Their only non-deleted readers are `scripts/checks/formation-release-handoff-gcp-analysis.js:15-17` (deleted) and tests (deleted) [V].

### 5.2 Scripts, docs, models and registries: 2,904 lines (3,058 with CL-044) [V]

**Whole files:**

| File | Lines |
|---|---|
| `scripts/checks/run-formation-release-handoff-gcp.js` | 634 |
| `scripts/checks/run-formation-release-handoff-gcp-streak.js` | 352 |
| `scripts/checks/formation-release-handoff-gcp-analysis.js` | 799 |
| `scripts/checks/analyze-formation-release-phases.js` | 296 |
| `docs/specs/decision-tables/formation-release-handoff-closure.json` | 252 |
| `docs/specs/decision-tables/formation-cohort-spread-cure.json` | 166 |
| `models/formation-release-handoff-closure/*` | 405 |
| `models/formation-barrier-spread-cure-liveness/*` (CL-044) | 154 |

**Line edits:**
- `package.json:157` (`analyze:formation-release-phases`);
- `docs/steering/tool-descriptions.json:5`, then regenerate `docs/steering/generated/tools-index.md`;
- `models/CL-INDEX.md:32`;
- `scripts/check-guideline-boundary-mode-contracts.js:45-54`;
- `scripts/quest-evidence/formation-spread-progress-at-cause.js` (64 lines; its witness test is deleted);
- `test/distributed/harness/README.md:35`.

**Impact-contract registry** (`test/shards/impact-contracts.json`, hand-maintained):
- Delete contract `formation-release-handoff` (:388-402).
- Delete coupled pair `formation-release-seed-contract-joiner-consumer` (:2583-2608).
- The audit fails on dead owner paths (`scripts/checks/impact-contract-registry.js:336`).

**Left alone:** quest history under `solve/` (about 90 files) and `architecture/` [V: no module names there].

### 5.3 Tests

**Deleted whole: 7,890 lines, plus most of `dt-formation-priority-placement-before-active.test.js` (722).**

| Test (lines) | Protects | Verdict |
|---|---|---|
| `test/control-plane/formation-release-handoff-closure.test.js` (1496), `-consumer-parity` (858), `-interaction-registry` (206), `-post-reopen-capture` (521), `-witness-fixture.js` (561) | Generation capture, retain, revoke, successor and consumer parity | Delete: mechanism only |
| `test/scripts/` handoff GCP runner, streak, analysis and phase analyzer, and fixtures: `analyze-formation-release-phases` (240), `…gcp-analysis-retained-uncompleted-teardown` (175), `…gcp-run-fixture` (350), `run-…-gcp-negative-control` (335), `-reverted-control` (80), `-streak` (335), `run-…-gcp` (777) | Tooling for the handoff | Delete |
| `test/bootstrap/node-joining-formation-barrier-waiting-liveness-log.test.js` (384) | Barrier log cadence | Delete |
| `test/bootstrap/join-formation-discovery-window-budget.test.js` (297) | Barrier discovery window | Delete |
| `test/bootstrap/formation-readiness-owner-single-form.test.js` (169) | The barrier consumes one authority form | Delete. Trivially true once the barrier is gone |
| `test/convergence/dt-formation-barrier-spread-release-oscillation.test.js` (604) | Barrier release within budget under spread-operation faults | Delete. The surviving property, "the ledger spread operation completes under formation-shaped faults", is restated in §9 against the rebalancer |
| `test/rebalancer/formation-spread-progress-at-cause.test.js` (502) | Cure-target and handoff families | Delete. The survivor is restated in §9: "no READY joiner stalls on `node_ready_lease_incomplete`; priority placement reaches READY joiners" |

**Partly edited:**

| Test | Survives as / delete |
|---|---|
| `test/convergence/dt-formation-priority-placement-before-active.test.js` (722) | **Survives:** "real placement uses one ledger REPLACE then expand-drain", restated as "the priority partitions and the ledger spread before user-table placement", owned by the rebalancer and spread gate. **Inverted:** "pre-lease targetability closed for ordinary partitions" (:700-720) becomes "no pre-READY node is a placement target for any partition". **Delete:** "ready lease closed until barrier releases", the two-node and third-node bypasses, the durable-rejoin bypass, and "renews CONNECTED liveness" |
| `test/rebalancer/startup-authority-available-node-contract.test.js` | **Survives:** the startup-cohort constraint (:110), the ready-lease read (:720), and no cache fallback (:807). **Delete or invert:** :190-530 (remote startup-authority JOINING targets) and :616-718 (live-transport veto at the deleted predicate) |
| `test/bootstrap/critical-placement-authoritative-evidence.test.js` | **Delete:** the barrier-state cases (:19-22, 465-480, `barrier-release-is-unchanged-by-the-observation`). The observer cases go with the observer (Q2) |
| `node-joining-infrastructure-join-progress-witness.test.js` | **Survives:** the ordered ready-signal gates. Drop `operation_ledger_formation` (:62, 81, 314) |
| `no-inline-live-transport-copy.guard.test.js` | **Survives.** Drop the deleted file from `SCAN_SET` and the allowlist (:88, 168-185, 374, 397); retarget the synthetic cases |
| `node-liveness-semantic-projection-owner.test.js:747-749`; `membership-publication-first-epoch-members.test.js:708-709`; `check-guideline-boundary-mode-contracts.test.js:12, 210` | **Survive.** Drop the deleted-file rows |
| `scenario-certification-consumers.test.js:520-526` | Delete that case (it reads the deleted streak script) |
| `formation-barrier-test-fixture.js` | **Keep.** dt6 uses `buildFormationCache` and `buildRealLedgerPlanner`. Drop `buildFormationBarrierOwner` and the barrier config |
| dt6 suite (`hold-engagement`, `hold-fairness`, `holder-release`, `add-dispatch-cadence`, `drain-parked-self-move`) | **Survive unchanged.** They measure from the plain `STARTUP_AUTHORITY_STATE.READY` projection, not the handoff [V fixture :789-795] |
| `test/scripts/repository-legacy-fallback-closure.test.js:16-18` | Survives with the new exact counts (§4.6) |

### 5.4 Totals [V `wc -l`; edits I]

| Area | Deleted | Edited |
|---|---|---|
| src | 3,259 lines (3,490 with the observer) | about 300 lines across 14 files |
| tests | about 7,900 to 8,600 lines | about 15 files |
| scripts, docs, models | about 2,900 to 3,060 lines | registry and baseline JSON |
| **Total** | **about 14,000 to 15,000 lines** | |

---

## 6. Other paths through the same code

| Path | Today | Under B | Must be witnessed |
|---|---|---|---|
| **Durable rejoin of a joiner** | Bypasses the barrier (`…formation-readiness.js:398-400`). Publishes READY after the CDC, transport and metadata gates (`node-joining-ready-signal-readiness.js:447-490`). Local partition runtimes are restored first (`node-joining-publication-activation.js:68-79`) [V] | Identical: the barrier is gone for everyone. `rolling-restart-durable-rejoin-formation-barrier` becomes vacuous | The rolling-restart gate path: a durable rejoin still reaches READY, and the spread then cures |
| **Joiner restart during formation** (with data dir) | Rejoin hints give `JOIN_PROBED/RECOVERED_PEER`, then `DURABLE_REJOIN` (`rejoin-hints.js:457-463, 554-587`), so the barrier is skipped [V/I]. Its incarnation changes, so a captured generation is revoked (`closure-owner :91-110`), and recapture needs a READY authority | READY on rejoin. No generation exists to revoke | A restarted joiner that held priority replicas: the floor drops it while its lease is lapsed and counts it again on READY |
| **Joiner restart with a wiped data dir** | `FRESH_JOIN`, re-enters the barrier; with two pre-READY joiners it can deadlock | Fresh join, then READY | Same as a fresh join |
| **Seed restart during formation** | `DURABLE_SEED` only with a peer proof (`seed-recovery-proof.js:37-49`), else `SEED_RECOVERY_PROOF_MISSING`. Closure state is lost: the row is keyed by the old incarnation (`formation-release-handoff-publication.js:65-79`), and joiners revoke (`closure-owner :393-406`) [V] | No handoff state exists to lose. Joiners that were READY stay READY. Their leases lapse if the seed is unreachable, which is a node-local fact | Seed restart mid-spread: the spread resumes from durable replica rows; no joiner is stuck |
| **Joiner dies between READY and receiving a replica** | Not reachable today, because READY comes after the spread completes | ACTIVE with an expired lease after 15 s (`node-readiness-policy.js:169-172`). Placement and the floor drop it [V]. It stays published and ack-required until failure handling, and `FailureDetector` is not constructed in src [V]. A dead READY node is not reaped as stranded JOINING (`lease-service.js:139-151`) | **New witness (Q4):** a three-node formation where j2 dies after READY. Required: no unsafe removal (the floor excludes j2); spread to the remaining eligible nodes satisfies `min(3, eligible)`, or formation reports not complete; publication does not wedge. Name the owner that removes j2 from published membership |
| **Five-node formation** | Barrier engages with at least 2 pre-READY joiners; successor chain one cohort at a time; a revoke can deadlock | Requirement stays `min(3, eligible) = 3`, so the first two READY joiners can complete the spread. The settling gate holds non-priority system rebalancing until all startup nodes are READY [V/I] | Five-node formation with joiners arriving in one derivation and in sequence |
| **Single node** | No barrier on the seed. A single joiner bypasses after 5 s (`…formation-readiness.js:238-241`) | The seed alone: `min(3, 1) = 1`, satisfied | Unchanged; existing single-node tests |
| **Node added to a formed cluster** | Bypasses after 5 s (preReady 1 < 2). **Two nodes added at once engage the barrier, and the deadlock is reachable** [I] | READY on its own gates. The requirement stays 3, already satisfied. The settling gate clears at READY. The epoch advance fences pending ADD/REPLACE dispatch (`operation-workflow-dispatch-epoch-gate.js:91-152`) | Two nodes added at once to a formed three-node cluster |

---

## 7. Remove-safety floor and ledger interlock under B: the walk

### 7.1 The passing run as the empirical sequence

This is the passing seed log, where joiners were READY at 12:12:51.3 and 12:12:57.0 [V-log]. J1 = 96203c04 and J2 = 84ee7b06; which joiner was READY first is [I].

1. **12:12:55, `control_plane_publications` ADD → J1.** An emergency partition, exempt from the ledger holds. Completed 12:13:07.
2. **12:12:55, ledger REPLACE seed → J1, refused `operation_ledger_self_move_waiting_for_idle_ledger`.** A ledger REMOVE or REPLACE is idle-only (`operation-ledger-hold-policy.js:245-265`; `rebalance-coordinator-ledger-interlock-admission.js:173-319`). The planner then emitted a plain ledger ADD → J1 at 12:13:02, completed 12:13:13.
3. **12:13:02 to 12:13:26, dependent ADDs deferred with `operation_ledger_quorum_concentrated`.** The hold is engaged because a ready, unoccupied node exists (`operation-ledger-quorum-concentration.js:159-216`).
4. **12:13:14, cpp ADD → J2.** An over-target spread-cure exemption (`rebalance-coordinator-priority-budget-admission.js:221-305`). Completed 12:13:21.
5. **12:13:23, ledger REMOVE of a seed replica.** The replica was removed at 12:13:24.1, but the operation failed with "Message not acknowledged" and was re-planned.
6. **12:13:26, ledger ADD → J2.** Completed 12:13:35. The ledger then held 3 voters on 3 nodes, so the concentration hold released.
7. **12:13:30 to 12:13:45, dependent ADDs → J2.** Completed 12:13:46 to 12:14:04.
8. **12:13:36 to 12:13:52, the second seed ledger REMOVE was refused 13 times `waiting_for_idle_ledger`.** It was registered at 12:13:52 and removed at 12:14:00. This is a fairness inversion of about 28 s, not a deadlock.
9. **12:14:05 to 12:14:30, second-hop ADDs → J1.** Each was capped as over target and then exempted as a spread cure.
10. **12:14:33 to 12:14:52, seed REMOVEs per partition.** Two seed-local REMOVEs failed "Message not acknowledged" and were re-planned 4 to 10 s later.

### 7.2 Under B (joiners READY on their own gates)

**Every wait is on a fact produced by something other than its own completion:**

| Wait | What it waits on | Who produces that |
|---|---|---|
| ADDs onto a READY joiner | The joiner's lease and dimension | The joiner itself |
| Ledger REMOVE or REPLACE | Ledger idle | Dependent operations, a finite set, terminate |
| Dependent ADDs | Ledger not concentrated, or spread not actionable | The ledger ADD and REMOVE |
| REMOVE of a seed replica | Floor ≥ 3 voter-ready replicas | The joiner's ADD reached voter status. The learner promotes itself with a leader-signed proof (`partition-service-learner-promotion-methods.js:419-526`), not gated on node READY [V] |
| REPLACE source removal | The replacement is voter-ready and routable (`remove-safety-evaluator.js:643-655`) | Same as above |

None of these depends on spread; the dependency order is joiner READY → spread operations → spread satisfied.

**Two joiners in one derivation:**
- There is one epoch advance, so at most one dispatch-epoch fencing pass. ADDs bound to the old epoch fail terminally and are re-planned (`operation-workflow-dispatch-epoch-gate.js:127-151`).
- The steps above are otherwise the same, interleaved over two targets.
- **No step waits on a fact that only its own completion can produce.**

**Waits that remain and are broken by retry cadence, not by a fact.** These are pre-existing and not created by B:

| # | Wait | Broken by |
|---|---|---|
| (a) | Stale-dispatch terminal failure, then re-plan | The 5 s priority planning cadence |
| (b) | "Message not acknowledged" on seed-local REMOVEs after the removal took effect | The same re-plan. Cause not established |
| (c) | Idle-only ledger self-move behind dependents (fairness, about 28 s) | Dependents completing |

None of them is a timer that must expire to break a cycle; each is a retry of an operation whose preconditions already hold. **No wait needs a timer to break.**

**The 76 s figure** in the failed run is the backoff of the non-system spread fence (`nodes-p1`), with an event wake as the primary release [V-log, V gate-methods :145-160]. It is not on the priority path.

---

## 8. Transition record draft

The required shape is the contract-first transition record checklist in `docs/steering/workflow-guidelines/solver-quests.md:58-105`:
- trigger;
- authoritative facts;
- permitted action;
- durable commit point;
- restart and lost-answer behaviour;
- remaining obligations' owners;
- eight items: producer and consumer symbols, shape, identity and generation, ordering, absent versus unavailable, commit point, retained obligations, wake and cleanup.

The form follows `solve/quests/required-entity-operation-observation/evidence/transition.md` and `docs/evidence/peer-and-leader-address-from-committed-configuration-2026-11/transition.md`. The draft is below.

```markdown
---
audience: evidence
quest: formation-ready-lease-independent-of-spread
recorded: <date>
---
# Transition: a node's READY lease no longer waits for cluster formation

## 1. Current chain (main 232082669)
| Decision | Site | Inputs today |
|---|---|---|
| Joiner publishes READY lease | node-joining-ready-signal-readiness.js:372-516 | CDC, transport, metadata gates; operation-ledger formation barrier (:447) |
| Barrier release | node-joining-operation-ledger-formation-readiness.js:233-245, 352-362, 397-471 | startupAuthorityReady (raw READY incl. priority spread, or release-authorised handoff) |
| Handoff capture/retain/revoke/successor | formation-release-handoff-closure-owner.js:205-421 | seed startup authority READY+spread, canonical JOINING cohort, connections, terminal generation |
| Seed authority READY override | formation-release-handoff-contract.js:561-574 | releaseAuthorized handoff |
| Pre-READY priority placement | unified-rebalancer-available-nodes.js:232-242, 321-384; startup-authority-placement-eligibility.js; unified-rebalancer-replica-state.js:105-170; critical-topology :88; planning-gate :135-138; topology-guard :92-117 | startup cohort, JOINING|ACTIVE, CONNECTED, live transport |
| Remove-safety floor | priority-publication-safety-topology.js:121-140 | committed readyNow |
| Cluster open (clients) | serve-eligibility-record-decision.js:142-184; /readyz (bootstrap-readiness-snapshot-evaluator.js:220-229) | published priority spread (membership-publication-candidate-derivation.js:612-628) |

## 2. Committed facts available
The node row (status, ready_lease_expires_at, boot_incarnation) owned by the NODES lifecycle boundary;
the published membership row with its priority_partition_summary (control_plane_publications), owned by
membership publication; replica service rows owned by the replica lifecycle.

## 3. Transition
Trigger: the joiner's node-local readiness gates pass. Permitted action: publish the READY lease (durable
heartbeat, requireDurableVisibility). Durable commit point: the NODES row write (unchanged). Formation
complete = published priority_partition_summary.satisfied (unchanged owner, unchanged consumers).
Absent vs unavailable: unchanged — serveEligible PRIORITY_SPREAD_UNSTATED and the startup authority fail
closed on an absent summary.
Restart/lost answer: a lost READY write is retried by the existing heartbeat retry loop and periodic
heartbeat; no formation state is held in process memory any more (the handoff generation, terminal
generation and successor admission are deleted).
Retained obligations: priority spread remains owned by the rebalancer (spread_replicas, ledger interlock,
remove safety) and is observed only through the published summary.
Wake: the existing not-ready→ready rebalance edge (bootstrap-node-ready-rebalance-owner.js:204-205, 286-287).

## 4. One shape
READY = node can serve. Formation complete = one published fact. No third form.

## 5. Deletions
(the §5 census of repair-b-design.md, by file with line counts)

## 6. Supersessions (sealed claims this contradicts)
(the §8 table below)

## 7. Blast radius
(src files of §4, tests of §5.3)

## 8. Counterexamples and discriminating witnesses
(the §9 coverage rows marked W1–W12)
```

### Supersessions

Each row quotes the sentence that the sealed quest or decision recorded and that B contradicts.

| Sealed quest / decision | Quoted sealed sentence (source) | How B supersedes it |
|---|---|---|
| `formation-priority-spread-without-exclusive-self-move-cost` (July barrier origin; log L40, 2026-07-17) | "publish an owner-authored priority-placement-ready lease …; allow only startup-authority priority control-plane placement to target that live-transport cohort; keep ordinary placement ACTIVE-only; delay final ACTIVE until the replica_operations quorum is no longer concentrated." | READY is no longer delayed. The pre-READY placement lane is deleted. The ledger-concentration protection stays in the quorum hold and the spread gates |
| `formation-joining-ready-phase-fence` (statement) | "every JOINING node, including READY with fresh liveness, remains absent from generic serving, locally eligible, published-active, required-ack, and remove-safety membership, while an explicitly recovery-eligible reachable JOINING node can receive only priority control-plane formation placement until activation." | The second clause is deleted: no JOINING node receives placement. The first clause still holds, but the JOINING phase ends at the node's own readiness |
| `formation-release-handoff-closure-v3` and `-v4` (statement) | "Five-node startup keeps one versioned, incarnation-bound formation-release handoff authority from the first whole-plane priority-spread-satisfied observation until every captured JOINING cohort member has published a current READY lease, so non-monotone spread-gap reopening cannot strand joiners…" | The handoff authority is deleted. Joiners cannot be stranded because READY no longer depends on spread |
| `formation-release-handoff-post-reopen-capture` (commit 64befd994; constraint `typed-bounded-admission`) | "closed by the successor capture, by any revocation, and by the first incompatible or absent authority observation; it never reopens without a new completion." | The successor admission is deleted with the closure owner |
| `formation-release-handoff-consumer-parity` (statement; decision-table invariant `durable-consumer-parity`) | "…so the operation-ledger formation barrier resolves ledger_spread_satisfied from the whole-plane authority answer instead of the raw non-monotone spread predicate" / "a joiner cannot locally mint, promote, or rotate formation-release authority" | The barrier and the consumer projection are deleted |
| Decision table `formation-release-handoff-closure.json` (invariant `non-monotone-spread-safe`) | "A compatible priority-spread reopening cannot withdraw release before every captured JOINING incarnation publishes a current READY lease." | The table is deleted; release is no longer a formation concept |
| Decision table `formation-cohort-spread-cure.json` | (owner: `startup-authority-placement-eligibility.js`) | Deleted with its owner |
| `formation-spread-progress-at-cause` (Q8, 0efda9137; log L3, 2026-11-10) | "isFormationCohortSpreadCureTarget … checked formationReleaseHandoff?.releaseAuthorized === true … creating a circular wait where joining nodes stalled on NODE_READY_LEASE_INCOMPLETE without ever receiving priority spread replicas" (fixed by keying on `formationReleaseHandoffActive`) | The cure-target exemption is deleted. Its stated goal, no stall on `node_ready_lease_incomplete`, now holds because joiners are READY |
| `formation-barrier-spread-release-oscillation` (c002553ae; statement) | "An engaged operation-ledger formation barrier releases within its budget when ledger spread is achievable…" | The barrier is deleted. The surviving property is restated (§5.3) |
| `rolling-restart-durable-rejoin-formation-barrier` (463c59169; statement) | "A durable restarted node … does not enter the cold-formation operation-ledger barrier solely because previously restarted members are temporarily pre-ready…" | Vacuous: no node enters a barrier |
| `operation-ledger-quorum-authoritative-release` (1a6fcc539) | Added the barrier's `bypassed_insufficient_formation_cohort` and timeout paths (per history reading) | The barrier paths are deleted. Its quorum-hold release rule (statement) is unaffected and kept |
| Model CL-044 `formation-barrier-spread-cure-liveness` | (model of the barrier/cure liveness) | Deleted |

**Not superseded, still binding:**
- `ready-owner-at-durable-nodes-boundary` (BINDING 2026-09-28): "one semantic READY owner at the durable NODES lifecycle boundary". B implements it.
- The remove-safety committed-node authority (`ab55403b6`): kept unchanged.

---

## 9. Coverage model draft

The shape follows `solve/epics/raft-rs-full-cutover/quest-records/f1-step-down-port/coverage-model.md`.

### 9.1 Frozen claim

**For every arrival order of the joiners of a formation, and with no timer expiring:**
- every joiner whose node-local gates pass publishes its READY lease;
- the priority partitions, including the operation ledger, reach `min(3, eligible)` distinct voter holders;
- no client-facing cluster gate (serveEligible, `/readyz`) opens before that spread is published;
- no remove ever drops a priority partition below 3 voter-ready replicas on READY nodes.

**Semantic owners:**
- the joiner's ready-signal path;
- membership publication (the formation fact);
- the rebalancer (spread operations, ledger interlock, remove safety).

**Oracle:** durable rows (nodes, services, control_plane_publications), read through owner reads.

### 9.2 Decisions

| Id | Decision | Site | Inputs | Outcomes |
|---|---|---|---|---|
| D1 | Publish READY | `signalReadyForReplicas` | CDC, transport, metadata gates | published / retried / failed |
| D2 | Formation complete | candidate derivation summary (A) | service rows, eligible set | satisfied / pending / unstated |
| D3 | Serve eligible | `decideServeEligibility` | node status and lease, published, ack, D2 | eligible / refused with reason |
| D4 | `/readyz` | readiness evaluator | startup authority (D2) | 200 / 503 |
| D5 | Priority placement target | available-nodes leased path | `readyNow`, CONTROL_PLANE_RECOVERY_ELIGIBLE, startup cohort | target / not |
| D6 | Ledger hold | concentration and hold policy | ledger voters, ready unoccupied nodes | engaged / released |
| D7 | Remove safety | floor and REPLACE replacement guard | voter-ready rows on `readyNow` nodes | safe / deferred |
| D8 | Dispatch epoch fence | dispatch epoch gate | bound epoch, current published epoch | dispatch / terminal-fail |
| D9 | Settling gate (non-priority system partitions) | critical-topology | transitional or unready nodes | blocked / clear |

### 9.3 State dimensions

| Dimension | Values |
|---|---|
| Per joiner, lifecycle | JOINING, ACTIVE |
| Per joiner, lease | none / valid / expired |
| Per joiner, incarnation | 1, 2 |
| Per joiner, CONTROL_PLANE_RECOVERY_ELIGIBLE | false / true |
| Per joiner, process | alive / dead |
| Published membership | epoch; set ⊆ {seed, j1, j2}; ack pending / closed |
| Per priority partition | holders per node (0 to 3), voter / learner, ACTIVE / SYNCING |
| Ledger | concentrated / not; self-move in flight / idle |
| Operations | per partition, ADD / REPLACE / REMOVE step |
| Seed | incarnation 1 / 2 |
| Cluster size | 1, 3, 5, formed+1, formed+2 |

### 9.4 Events

- Joiner registers;
- joiner node-local gates pass;
- READY written;
- READY renewal lost;
- membership derivation adds {j1}, {j2} or {j1, j2};
- publication acknowledged;
- ADD completes;
- learner promotes;
- REMOVE completes;
- "Message not acknowledged" failure;
- joiner crash (before or after READY);
- joiner restart (durable or fresh);
- seed restart;
- lease expiry.

### 9.5 Temporal windows

| Id | Window |
|---|---|
| T1 | READY before any priority replica on the joiner |
| T2 | Both joiners in one derivation versus two derivations |
| T3 | Derivation before or after the first READY |
| T4 | Crash inside T1 |
| T5 | Seed restart between ADD and REMOVE |
| T6 | Epoch advance while an ADD is pending dispatch |
| T7 | Ledger self-move behind dependents |

### 9.6 Witnesses (W) and mutants (M)

**Witnesses**, each to be written by the verifier:

| Id | Witness |
|---|---|
| W1 | Losing order of the packet (one derivation adds both). Red on main, green under B (§10) |
| W2 | Every interleaving of {derivation(j1), derivation(j2), derivation(j1, j2), j1 READY, j2 READY, rebalancer pass} to depth N: all joiners READY and the spread satisfied at the fixpoint |
| W3 | serveEligible refuses user-table serving and CREATE TABLE targets while D2 is pending, with joiners READY |
| W4 | `/readyz` returns 503 while D2 is pending, with joiners READY |
| W5 | No REMOVE completes with fewer than 3 voter-ready replicas on READY nodes, in every interleaving including a crash in T1 |
| W6 | Ledger hold engages while the ledger is concentrated and a READY joiner exists; dependent ADDs are deferred; ledger ADD/REMOVE proceed |
| W7 | Joiner dies after READY: no unsafe removal; formation either completes over the remaining nodes or reports pending; publication does not wedge (Q4) |
| W8 | Durable rejoin during formation reaches READY |
| W9 | Seed restart mid-spread: the spread resumes |
| W10 | Five-node formation, in one derivation and in sequence |
| W11 | Two nodes added to a formed cluster |
| W12 | No pre-READY node is ever a placement target, for any partition |

**Mutants**, one per decision:

| Id | Mutant | Killed by |
|---|---|---|
| M1 | Re-add a wait on D2 in D1 | W1, W2 |
| M2 | serveEligible ignores D2 | W3 |
| M3 | `/readyz` drops the priority dependency | W4 |
| M4 | The floor counts non-voters, or nodes without `readyNow` | W5 |
| M5 | The ledger hold never engages | W6 |
| M6 | Re-admit JOINING in D5 | W12 |
| M7 | The dispatch epoch fence skipped | stale-dispatch witness |
| M8 | The spread requirement drops to `min(3, holders)` | W3, W4 |

---

## 10. The red probe (concrete for main)

### 10.1 Location, base and registration

**File:** `test/convergence/dt-formation-joint-admission-release-liveness.test.js`. This follows the `dt-formation-*` naming. It is placed beside `formation-barrier-test-fixture.js`.

**Base harness:** extend `test/control-plane/formation-release-handoff-witness-fixture.js` (real closure owner, real readiness service via `createReadinessServiceForTest`, real barrier loop via `buildBarrierOwner`, router with boot incarnations). **Do not use** `formation-barrier-test-fixture.js`'s `isStartupAuthorityReady` predicate or `buildAuthority()` objects. Those replace the readiness verdict, and the probe would then test the fakes [V `formation-barrier-test-fixture.js:189-200`, witness fixture :149-169, 358-365].

**Under B,** the witness fixture is deleted. The probe must therefore depend on it only through a **new formation-world helper** in `test/convergence/`, so that the probe survives B:
- the world is built from real `deriveMembershipPublicationCandidate` + `buildStartupAuthoritySnapshotFromPlanningAnswer` over shared rows;
- the barrier owner is only an adapter that disappears under B. Under B the same script asserts that `signalReadyForReplicas` publishes.

**Registration:** run `npm run test:metadata:refresh`, then check with `npm run audit:shards`. Sibling classes are `unit / ordinary / convergence-topology` [V `test/shards/*-classes.json`]. Add the file to the impact contracts that own the ready-signal path and the rebalancer spread. Under B, the `formation-release-handoff` contract is deleted.

### 10.2 Composition

All components are real.
- **World:** one shared `SystemTableCache`: node, service and partition rows, plus a `control_plane_publications` store with durable read-back.
- **Seed readiness:** `createReadinessServiceForTest({nodeId: 'seed', …})`. Its `getPriorityRecoveryPlanningAnswerSync` must be the real derivation over the world's current rows. Never `buildAuthority`.
- **Joiners:** j1 and j2, each a real `NodeJoiningReadySignalReadiness` instance (on main, via `buildBarrierOwner`), with `seedNodeId = 'seed'`. A real `heartbeat.sendHeartbeat` adapter writes the READY row into the world.
- **Seed rebalancer:** `createTestCoordinator` against the world, for the `replica_operations-p1` REPLACE `executeOperation`. The floor comes from `readServeEligibility` / `readCommittedNodeFloor` [V `operation-workflow-committed-node-floor.js:78-103`]. Real ledger-interlock admission handles the other priority ADDs.

### 10.3 Time and fixpoint

**Time is frozen.** `now` is constant for the whole test. Each joiner's `sleep(pollMs)` does **not** advance `now`. Instead it runs one evaluation round:
1. a seed membership drive (derivation plus publication write, through the coordinator's real `deriveClusterMembershipCandidate`, `test/control-plane/membership-publication-coordinator-candidate-convergence.js:~381-388` pattern);
2. a seed startup-authority read (on main this is the closure `observe`);
3. `whenIdle()` on the handoff publication coordinator (main only);
4. one rebalancer and coordinator step for p1 and the at-target SQL partition;
5. each joiner's barrier or ready-signal step.

The 120 s barrier timeout (`…formation-readiness.js:453`) and every other deadline therefore cannot trip.

**Fixpoint:** two consecutive rounds with identical digests. The digest covers:
- each node's status and `ready_lease_expires_at`;
- the publication epoch, set and acks;
- the closure `lastContract` (state, reason, generation, `releaseAuthorized`) on main;
- each barrier's last state on main;
- tracked operations (type, step, `deferReason`);
- admission refusal codes.

There is a round cap of 200. Hitting the cap is reported separately; it is not a fixpoint.

### 10.4 Losing-order script

1. Seed READY, epoch 1 published `[seed]`. Rows for j1 and j2: `joining`, `connected`, boot incarnation 1. The seed holds r1 to r3 of every priority partition.
2. Round. **Assert** closure ACTIVE for cohort [j1], then `releaseAuthorized` after `whenIdle`. This reproduces the "seed READY at epoch 1" capture.
3. Make j1 recovery-active but unpublished (`missingPublishedCount = 1`). Round. **Assert** REVOKED `startup_authority_incompatible`. **Record which of the three revoke paths fired.** This pins the open item from the packet.
4. One derivation adds both j1 and j2. Publish epoch 2 with summary `satisfied = false`. **Assert** the authority reads `recovery_pending` with `['priority_partitions_not_spread']`.
5. Start both joiners' ready-signal paths. **Assert** both barriers are engaged (candidates ≥ 3, preReady ≥ 2) and `waiting_for_startup_authority`.
6. Rounds:
   - **Assert** ADDs onto j1 are admitted.
   - **Assert** the p1 REPLACE `deferReason` is `REPLACE_REMOVE_SAFETY_BLOCKED`.
   - **Assert** the other priority ADDs are refused with `operation_ledger_self_move_in_flight`.
7. Iterate to the fixpoint.
8. **Liveness assertion:** at the fixpoint, every admitted joiner (in the canonical cohort and published) has `isNodeRecordReady` true.

**Expected result:** red on main, green under B.

### 10.5 Negative control (same file)

1. After step 2, publish j1 alone (epoch 2).
2. Let j1 publish READY, so the generation completes.
3. Then add j2 (epoch 3), so the successor or recapture releases j2.

**Expected result:** all joiners READY at the fixpoint on main. This proves the probe discriminates on order.

### 10.6 Output when red

- The fixpoint round number.
- Per joiner: barrier state, candidate count, preReady count, `startupAuthorityState`, reason codes, `authorityAvailable`, and handoff state, reason, generation and `releaseAuthorized`.
- The closure `lastContract`, including the terminal generation's cohort signature and epoch, and the successor admission state.
- The p1 REPLACE step, `deferReason`, and the committed-floor `readyNow` map.
- The ADD refusal codes.
- The publication row.
- **The cycle witness:** the list of guards that are false, each with file:line:
  - barrier `:243-245`;
  - closure `:205-209`;
  - floor `priority-publication-safety-topology.js:136-140`;
  - interlock `rebalance-coordinator-ledger-interlock-admission.js:77-78`.

### 10.7 Red for the right reason

Each round asserts:
- the joiner's authority snapshot is non-null with `authorityAvailable === true`. `getPriorityPlacementFormationStartupAuthority` swallows exceptions into `null` (`node-joining-ready-signal-readiness.js:288-290`), which would mimic the deadlock;
- `readServeEligibility` / `answerCommittedNodes` are not the fixture's neutral `null` (`readiness-service-fixture.js:74, 313-327`);
- barrier engagement is explicit. With no snapshot method the barrier returns immediately (`…formation-readiness.js:401-414`), and fewer than 3 candidates bypass it (:238-241);
- connection evidence carries the right boot incarnations, because a mismatch makes capture return `null` (closure :59-64, 233).

**Helpers that do not exist yet and must be written:**
- the formation world;
- the frozen-time round driver with digest;
- the p1 operation-step adapter over `createTestCoordinator`;
- the "recovery-active but unpublished" event.

### 10.8 Quest probe and journey receipt

**The Quest's `doneWhen` probe:** a `scripts/checks/` script that runs this test and prints the number of admitted joiners without a READY lease at the fixpoint (target 0) [V `scripts/solve/probes.js:429-457`]. A `test-receipt` probe could be used instead.

**Journey receipt.** The term "journey receipt" does not exist on main [V `git grep -i "journey receipt|journeyReceipt"` empty]. The applicable rules are:
- **R19:** a major feature proves a user journey (`docs/steering/rules.md:146-150`).
- **`test/guidelines/release-gate.md:212-214`:** "a semantic, packaging, startup or owner-interaction change reruns the affected journey or establishes applicable evidence through the current proof owner". This change is startup plus owner-interaction.

The affected journey is `fresh-formation-user-table-routability`:
- defined in `test/distributed/scenarios/fresh-formation-user-table-routability.js`;
- registered for `local-three-node.json` in `scenario-registry.js:34-37`;
- quest `solve/quests/fresh-formation-user-table-routability`, with `doneWhen` `test-receipt`: `reproducer-red-on-current-product`, `first-divergence-repaired-at-cause`, `scenario-green-three-consecutive`, `independent-verification`. The current receipt status is `fail`.

**The receipt this unit needs:** that scenario green three consecutive times on lab hosts, on the landed candidate, with unchanged bounds.

The acceptance quest `canonical-authority-formation-acceptance` consumes that receipt (`original-formation-receipt-admitted`). Per the owner's bounded-repair rule, this unit's own `doneWhen` is the probe above. The scenario streak is recorded as the remaining milestone claim.

---

## 11. Open questions for the repository owner

| # | Question | Recommendation |
|---|---|---|
| Q1 | Must a just-READY joiner satisfy CONTROL_PLANE_RECOVERY_ELIGIBLE before it can receive priority replicas, or does the deleted dispatch-bootstrap carve-out (`isStartupAuthorityPlacementDispatchReady`) cover a real lag? | Keep the dimension as the only test (no carve-out). Witness that it holds within one readiness evaluation of READY. If it does not, the dimension's owner is the repair site, not a placement carve-out |
| Q2 | The formation fact has five computations (§2.1). Unify B, C and D onto the published A, retire or redefine E (the observer), and drop the "nodes that already hold replicas" eligible fallback, which lets a lone seed read as satisfied? | Out of scope for B. Seal a follow-up Quest "one formation fact". In B2, delete the observer (its only production consumer is the barrier) unless the owner wants it kept as a diagnostic |
| Q3 | Should the remove-safety floor count SYNCING voters (`priority-publication-safety-shared.js:48-53`), now that joiner voters become countable early in formation? | Keep it unchanged in B, since it is already the rule for every ACTIVE node. Ask a verifier to try the counterexample (remove a seed replica while the only other voters are SYNCING), backstopped by Raft conf-change commit |
| Q4 | Who removes a node that dies after READY from published and ack-required membership? `FailureDetector` is not constructed in src | Name the owner before sealing. Witness W7 must show publication does not wedge. If no owner exists, that is a pre-existing gap (it applies to any ACTIVE node today) and should be its own Quest, not part of B |
| Q5 | Existing durable `formation_release_handoff` publication rows in running clusters | Leave them. They are keyed by old boot incarnations and never read. No migration and no compatibility reader (no-legacy rule) |
| Q6 | `/readyz` documentation conflict (§1.2) | Adopt the cluster meaning ("cluster has formed voter quorums") and fix `docs/bootstrap-readiness-probes.md:29-36` in B |
| Q7 | One unit or two? | One Quest, one landing, two commits (§4.5). The coordinator's rule requires it, because the seed machinery has effects when left running |
| Q8 | "Journey receipt": the term is not on main; it may exist only in the primary tree's uncommitted steering | Confirm the receipt name. The evidence named in §10.8 is what main's rules require |
