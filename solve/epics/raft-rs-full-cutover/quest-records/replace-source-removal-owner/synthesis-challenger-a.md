# Challenger A: state, event and authority dimensions of the REPLACE source-removal model

Read-only challenge of `design-replace-source-removal-owner-2026-09-25.md` §0-§8 (worktree `replace-owner`, head fbbf2d7a2; production is identical to 57cf259e8, so the line numbers below hold for both). Rules applied: protocol v2 Phase 3 and no filesystem-wide scans.

**Method**
- Enumerations were taken from the code, not from the model:
  - `WORKFLOW_STEP` (`src/constants/workflow.js:1-10`);
  - `WORKFLOW_STEP_TO_STATUS`, the semantic phases and the REPLACE phase rules (`replica-operation-progress.js:67-89, 179-187, 273-343`);
  - `OPERATION_LIFECYCLE_ACTION` (`operation-workflow-owner-shared.js:279-291`);
  - `REPLICA_OPERATION_UPDATE_DISPOSITION` (`replica-operation-update-disposition.js`);
  - every caller of `completeOperation` and `failOperation`, every SQL write statement on `replica_operations`, every `STEP_DOWN` issuer and every conf-change proposer.
- Three read-only sub-censuses were run inside the worktree: handoff issuers, membership proposers and services-row writers, and non-owner writers of `replica_operations` rows.
- Two pure facts were checked against the crate source: `raft.rs:1227-1232` and `:2062-2090`.
- No tests were run and nothing was edited.

**Classification key**
- **NEW**: a semantic dimension the model lacks. Per protocol v2 it justifies amending the model.
- **INSTANCE of X**: a new shape of a dimension the model already has. It is fixed in the generic evidence, not by adding a case.
- **OWNER DECISION**: satisfying the finding needs a different product-contract change.

---

## 0. Summary

| # | Finding | Class | Severity |
|---|---|---|---|
| A1 | The owner node is the **source** node on ordinary partitions. R-1a and R-1f assume O hosts the target t. Orphan adoption is a second, concurrent owner. | NEW (ownership topology and adoption) | Blocking for ordinary partitions |
| A2 | A REPLACE target's local ConfState is a **row-derived prediction that excludes s**, persisted as "applied" at index 0. "Absent on any replica proves committed" is false, and the P1 oracle shares the mistake. | NEW (ConfState provenance) | Blocking: P1 can pass on a live voter |
| A3 | A **dead-source REPLACE** (source row FAILED, source executor unreachable) completes today only through A6's FAILED-row edge. Under R-1a nobody ever proposes its removal, so it waits forever. | NEW (source liveness / unilateral removal) | Blocking: a regression of the main recovery case |
| A4 | The **leader's row-driven ADD_PEER** re-admits any present, non-retired services row. A reappearing source row re-adds s with the same peer id. Committed removal is therefore not monotone at the system level. | NEW (a re-adding authority) | High |
| A5 | The owner lease is `updatedAt + 30 s`, renewed only on committed transitions. It is not liveness. With S9 (unbounded ACTIVE), a healthy deferring owner reads "unavailable" at 30 s, which drives R-1c FAIL, A4 stale-FAIL and ordinary-partition adoption. | NEW (what the lease measures) | High; **OWNER DECISION-adjacent** |
| A6 | **Age-based staleness** is a family of competing authorities. At least six consumers treat a REPLACE older than its 30 s step budget as abandoned. S9 invalidates that premise. | NEW (abandonment by age, X9) | High |
| A7 | **FAILED after the effect.** B3 unconditionally removes the target of every FAILED REPLACE. Several FAILED edges fire after `REMOVE_REPLICA` was sent, including R-1c itself at STOPPING and a remote FAIL racing the send. A property for FAILED is missing. | NEW (failure implication, P1′) | High |
| A8 | The §3.2 revalidation reads R from the **cache**, and remote terminal writes carry **no step CAS**. No in-process check fences a remote FAIL. | INSTANCE of I3 (cached row) plus a missing durable fence | High |
| A9 | The lost-wakeup recheck compares the **input** identity. A build completing for the same identity (the F-d case) does not change it. Publications are per variant, but the event names only the node. | INSTANCE of I1, with the wrong version chosen | High: AN5 would pass while the real race stays open |
| A10 | R-1f can be stranded. raft-rs silently drops a conf change while one is pending, and a new leader treats everything up to its last index as pending. "One attempt per term" can then miss for a whole term. The port also refuses REMOVE_PEER for a peer identity that is not reserved locally. | NEW input (leader conf-change admissibility) | High |
| A11 | Terminal writers missing from A1-A12: terminal-transition repair, the 300 s operation budget, two STOPPING FAIL edges, adopters, raw admin SQL. There is also a STOPPING re-dispatch edge and a handoff-continuation edge. | INSTANCE (state-machine completeness) | Medium-high |
| A12 | Revalidation set gaps: the concurrent-operation serialization set, and the voter-ready floor over **all** counted replicas. | INSTANCE of constraint 6 | Medium |
| A13 | Handoff attempt identity. The most-caught-up kind has no transferee at issue. A COMPLETED role no-op neither resolves nor transfers. | INSTANCE of I6 | Medium |
| A14 | Planner split (§3.7) gaps: double deduction at STOPPING, creation guards that fail open under deferred visibility, and CL-043/CL-044 not addressed. | INSTANCE of X2 | Medium |
| A15 | Missing outputs: FAILED consequences, planner decisions, interlock hold across restart, events emitted only on the writer's node, S9 diagnostics, and emission of the new membership event. | INSTANCE (P1-P3 output set) | Medium |
| A16 | Restart has three classes, not one: process restart, coordinator re-initialization, and rs-raft runtime or group rebuild. | INSTANCE of E5 / P3 | Medium |
| A17 | Leadership-authority completeness: handoff exists only on five `-p1` partitions; cold leader loss happens everywhere; the cure can pick s as the new leader on ordinary partitions; the `STEP_DOWN` endpoint does not check its sender. | INSTANCE of X5 and scenario "leadership changes without R" | Medium |

---

## 1. State-machine completeness

### A11. Terminal and step edges the model does not list

**Dimension.** The authoritative set of writers of REMOVED, FAILED and STOPPING for a REPLACE row.

**Evidence: imported writers of a terminal status**
- `completeOperation` callers (grep):
  - `executor-outcome-reconcile-methods.js:564` (A9);
  - `recovery-drain.js:656` (A1/A2);
  - `recovery-observation.js:693` (A7) and `:759` (A6);
  - `priority-publication-safety-topology.js:65` (A8);
  - `status-reconcile.js:126` and `:241` (A10, plus non-REPLACE);
  - `dispatch-response-reconcile.js:566` and `:590`: unreachable for REPLACE, because every REPLACE branch returns earlier (`:549-586`);
  - facade `rebalance-coordinator-owner-facade.js:281`.
- The only durable writes are the five statements at `replica-operation-repository.js:186-214`. A terminal write has **no expected-step CAS**, only `completed_at IS NULL` (`:200-211`; `mutation-update-methods.js:78-107`).

**Edges missing from A1-A12 and T1-T10**

1. **Terminal-transition repair: a deferred writer of a stale decision.**
   - A not-committed or unconfirmed REMOVED or FAILED write is retained as a projection and re-persisted with backoff from 0.5 s up to 30 s. The decision is never re-run. See `transition-persistence.js:232-271` (`resolveNotCommittedTerminalTransition` → `armTerminalTransitionRepair`) and `operation-workflow-terminal-transition-repair.js:103-160` and `:205-290`. The UPDATE carries no step CAS.
   - So a REMOVED decided at t0 can land at t0 + 30 s. P1 is stated "at the write instant". It holds only if s cannot re-enter committed membership in between, which A4 shows is false.
2. **Operation-level budget.** `reconcileTimeoutOperation` fails on `stepExceeded || budgetExhausted`. `budgetExhausted` is a **300 000 ms budget from `createdAt`** (`status-reconcile.js:611-690`; `control-plane/timeout-budget.js:17`). After a long ACTIVE wait (S9), the first STOPPING timeout reconcile that does not progress FAILs the operation immediately, not after 60 000 ms. K11 and T-7 do not model this.
3. **STOPPING FAIL edges.**
   - `REPLICA_MISSING_DURING_STOPPING_RECONCILIATION` (`recovery-observation.js:655-662`).
   - `REPLICA_FAILED_DURING_REMOVE_RECONCILIATION` (`:710-716`). For a REPLACE this is reached only by runtime-service entities, because a non-runtime FAILED source completes at `:672-686`.
4. **STOPPING re-dispatch (an effect edge).** `reconcileStoppingOperationProgress` replays `executeOperationFromReconcilePath` (`recovery-observation.js:718-724`). `isReplaceRemoveDispatchPhase` covers ACTIVE **and** STOPPING (`replica-operation-progress.js:281-283, 725-730`), so remove safety runs again and `REMOVE_REPLICA` is **re-sent** from STOPPING.
   - §3.2 check 1 requires "still at ACTIVE". Taken literally it would forbid this re-drive. Taken loosely, T5 has a second source state the model does not list.
5. **T1 immediately followed by the effect.** `reconcileReplaceActualActive` commits ACTIVE and then runs `executeOperationFromReconcilePath` in the same call (`priority-recovery-superseded-target.js:584-634`). It is one of E1-E10's callers but is not named.
6. **Handoff continuation inside one lane run.**
   - After a COMPLETED answer to a target-leg handoff, the same run re-evaluates remove safety and can proceed straight to `REMOVE_REPLICA` (`dispatch-response-reconcile.js:273-289`; `priority-publication-handoff.js:286-330`).
   - That is a T3→T5 edge with no resolution in between. Under §3.4 it must either be deleted or become "wait for resolution".
7. **Adopters** (A1 below) run `reconcileOperationLifecycle` for operations they do not own (`recovery-timeout.js:24-46, 404-426`). Its A6 and A7 completion paths and its STOPPING FAIL paths have no ownership check. `executeOperationInternal` does check ownership (`dispatch-response-reconcile.js:210-215`).
8. **Operator raw SQL.** `EXECUTE_QUERY` passes arbitrary SQL, including `UPDATE`/`DELETE replica_operations` (`admin-meta-command-handlers.js:61-79`; guard `admin-mutation-guard.js:58-60`). Constraint 3 names "operator intervention". X8 covers only membership.
9. **Divergence re-insert.** A zero-change update against a missing row re-INSERTs the owner's copy (`mutation-update-methods.js:355-387`). This is a durable state appearing from memory.

**Class.** INSTANCE (state-machine completeness). Items 1 and 2 carry new temporal inputs; challenger B should own their arithmetic.

**Amendment**
- Model each success edge as **decision D, then write W**, where W may be deferred by the repair. P1 ranges over every W, including repaired ones. The repair must re-run R-1a before re-asserting REMOVED (or R-1c before FAILED), or be forbidden for REPLACE.
- Add T5′ (STOPPING → re-send `REMOVE_REPLICA`), with §3.2 generalised to "the same step it started in".
- Add T1+T5 as a pair.
- Add E11 (handoff continuation) and E12 (the ReplicaDispatchService enqueue of ACTIVE REPLACE rows, `replica-dispatch-replay-health-readiness.js:76-82`, a second trigger into the owner).
- Add the operation budget as input I12.
- List the two STOPPING FAIL edges under T9.
- Treat operator edits of the operation row as X8′ (R-1e must hold after any manual row edit).

### A7. FAILED after the effect: the missing failure implication

**Dimension.** What a FAILED REPLACE asserts, and who acts on it.

**Evidence**
- B3 turns **every** FAILED REPLACE row's target into a planner cleanup REMOVE. There is no source-state or ConfState check, and the set covers all history (`unified-rebalancer-replica-state.js:626-651`, consumed at `move-planner-move-calculation-methods.js:236-252`).
- FAILED edges that can fire after `REMOVE_REPLICA` was sent:
  - STOPPING step budget;
  - the operation budget (A11.2);
  - STOPPING starvation;
  - A4 stale-FAIL;
  - the two STOPPING FAILs (A11.3);
  - a remote FAIL racing the owner's send (A8);
  - **R-1c itself.** The release is eligible at `STOPPING` (`replica-operation-step-policy.js:212-218`) with source state `REMOVAL_IN_FLIGHT` (`…-reconcile-shared.js:440-445`). The reason name `replace_owner_unavailable_source_retained` is false there: the source row is REMOVING.
- T9's postcondition "never REMOVED; at ACTIVE, s is untouched" says nothing about STOPPING.
- Result: s is retiring or retired, and B3 removes t. That leaves two replicas below target, or with a quorum hazard when either survivor is down (the T-7 class, reached by a route other than the step budget).

**Class.** NEW: a property on the FAILED outcome. P1 only constrains REMOVED.

**Amendment**
- Add **P1′ (failure implication)**: for every write of FAILED on a REPLACE, either (a) no `REMOVE_REPLICA` or `REMOVE_PEER` for s was issued by R and s ∈ committed voters, or (b) the FAILED reason is typed `source_removal_issued` and B3 does not remove t while s ∉ committed voters.
- Restrict R-1c to the pre-effect state (ACTIVE, no removal issued). At STOPPING with a truly dead owner the outcome must be decided on committed membership.
- Mutation family **M15**: "FAIL after the effect with the source-retained semantics". Anchor **AN9**: R-1c at STOPPING with the source REMOVING must not lead to a B3 removal of t.

---

## 2. Competing authorities

### A1. Owner topology: O is the source node on ordinary partitions, and adoption adds concurrent owners

**Dimension.** Which node owns R, which replica that node hosts, and how ownership changes.

**Evidence: ownership**
- `resolveOperationOwnerNodeId` (`replica-operation-repository-row-methods.js:172-211`): **target** node only for an unsettled REPLACE on a system or priority partition; **source** node for every other REPLACE.
- R-1a reads "`readStatus().confState` of P's replica on O. At ACTIVE and STOPPING, O hosts the target t". R-1f proposes "through its own replica t's port". For ordinary partitions O hosts s, which is retired and its service gone once removal runs (`replica-handler-remove-execution-methods.js:189-310`). So R-1a answers `MEMBERSHIP_UNAVAILABLE` forever and R-1f has no port.

**Evidence: adoption**
- Fenced orphan adoption adds every node whose lease view says "expired" as a concurrent reconciler of an ordinary-partition operation (`recovery-timeout.js:16-46`; `replica-operation-repository-incomplete-read-methods.js:204-231`).
- The adopter's lease touch is anchored at the row's old `updatedAt` (`replica-operation-owner-lease.js:196-203`), so it does not fence a second adopter. Several nodes can adopt at once.
- Combined with A5, this happens to **healthy** owners after 30 s at ACTIVE.

**Class.** NEW (owner-topology × adoption). It is also the "duplicate reconciliation" scenario across nodes.

**Amendment**
- Add a state axis "owner kind": {target-owned (system and priority), source-owned (ordinary), adopted (ordinary, lease expired)}.
- R-1a needs a membership read on the node that hosts a **live voter other than s**, which for ordinary partitions is not O. Or the completion decision moves to a node that hosts t. Either way it is a new owner interaction under S5.
- Adoption becomes X10. An adopter may wake the owner, but must never write REMOVED; FAILED only per A7.
- If the design keeps ordinary REPLACEs out of R-1a, that is a scope exclusion that needs a record. It conflicts with constraint 1, which has no partition-class carve-out: **OWNER DECISION if excluded**.

### A3. A dead source: nothing proposes its removal any more

**Dimension.** Source liveness: whether the source executor can answer `REMOVE_REPLICA`.

**Evidence**
- The failure detector marks a dead node's replica rows FAILED (`node/failure-detector-replica-failures.js:20-60`).
- Row-driven REMOVE_PEER fires only on DELETE or REMOVED, never on FAILED (`partition-service-raft-peer-cache-reconciliation.js:149-154, 202-247`).
- Today A6 completes an ACTIVE REPLACE whose source row reads FAILED (`status-reconcile.js:131-150`). That is exactly how the "replace a dead replica" case settles, and it is a C1 violation, because s stays in ConfState.
- Under R-1a, A6 waits for ConfState. STOPPING is written only on the source executor's INITIATED or IN_PROGRESS (`dispatch-response-reconcile.js:519-545`), so R never reaches R-1f either.
- The dead source stays a voter, and R waits at ACTIVE unboundedly (S9), holding the REMOVE and add-like lanes and the ledger interlock.

**Class.** NEW: a state (ACTIVE / SOURCE_UNREACHABLE) and an edge (unilateral source removal).

**Amendment**
- Add a state ACTIVE/SOURCE_UNREACHABLE and an edge T5″: remove safety evaluated **without** s's vote, then `REMOVE_PEER{s}` through a live voter's port, then STOPPING/AWAITING_COMMITTED_MEMBERSHIP.
- Anchor **AN10**: a dead source, a REPLACE to a live target, and completion only after s ∉ committed voters.
- This interacts with A4: the dead node's return re-upserts its row, and the leader re-adds s. So T5″ needs A4's guard.

### A4. The row-driven ADD_PEER can re-add a removed source

**Dimension.** A second membership authority that **adds** voters. B5r in §2(b) describes this path only as "an address change".

**Evidence**
- On every services cache change, the leader proposes ADD_PEER for any row of P whose status is not FAILED, REMOVING or REMOVED and whose identity is not in the config (`partition-service-raft-peer-cache-reconciliation.js:91-102, 272-292`; `partition-service-raft-membership-administration.js:120-135`). Partition init does the same (`partition-service-raft-init-base.js:553-585`).
- The peer id is a pure derivation of the replica id (`raft-rs-peer-identity.js:58-69, 111-116`), so a re-add restores the **same** voter.
- A source row can reappear through:
  - the heal upsert (`partition-service-row-owner.js:229-252`, reached through `activateReplica` on seed registration and join);
  - the state-machine upserts;
  - registration handoff upserts (sub-census rows).
- Consequences:
  - R-1e's "s already out of committed membership, so complete" can be followed by a re-add. This is the operator scenario of constraint 3 whenever s's row is still ACTIVE.
  - Any REPLACE-originated `REMOVE_PEER` issued while s's row is in an admissible status oscillates against the leader's re-add. That covers T5″ above, and R-1f if the source executor's REMOVING write is lost.
  - The design assumes "a committed removal is never rolled back" (§2(f)). That holds for one log entry, not for the system.

**Class.** NEW (a re-adding authority, X11).

**Amendment**
- Add X11: "the leader re-admits a present services row".
- Precondition for T7, T5″ and R-1e completion: s's services row is absent or in {FAILED, REMOVING, REMOVED}. Otherwise R deletes or marks the row first, or waits.
- P1 becomes "at W, and s stays out while R is the last writer of intent for s". P3 must include "the source row reappears after completion".
- The re-admission path is shared with CA3 and R2, so the fix may belong to R2's single membership request owner. Sequencing of that is a lead or owner call.

### A6. Abandonment inferred from age: a family of authorities

**Dimension.** Consumers that treat a REPLACE older than its step budget (ACTIVE 30 000 ms) as "not really in flight".

**Evidence (each consumer lets another authority act as if R were gone)**

| Consumer | Where | What it lets happen |
|---|---|---|
| Concurrent-operation gate, CL-043 | `operation-workflow-remove-safety-evaluator.js:470-485` → `recovery-timeout.js:657-668` | Other REMOVE/REPLACE on the entity proceed. This is also **R's own** gate against theirs |
| CL-044 ping | `remove-safety-evaluator.js:486-495`; `recovery-timeout.js:670-692` | A transient ping failure to R's target releases the lock |
| Priority follow-up operation contexts | `priority-recovery-follow-up-operation-context-view.js:58-70`, stale with infinite lookback | R disappears from follow-up planning |
| Topology-settling in-flight view | `unified-rebalancer-replica-state.js:679-693`, used by `unified-rebalancer-critical-topology-methods.js:296` and `rebalancer-priority-recovery-planning-gate-methods.js:211` | R stops counting as topology-settling |
| Coordinator-created remote wake | `coordinator-created-handoff-scheduling.js:192-240`: stops when the step timed out and the 300 s budget is spent | R-1b's `WAKE_REMOTE_OWNER` loop ends |
| Admin views | `admin-service-discovery*.js`, `admin-control-snapshot-leadership-summary.js:265` | Admin reports R as stale |

- S9 (no ACTIVE bound, "no timer may force an outcome") makes a live REPLACE older than 30 s normal. Each consumer above is a timer that forces **other** authorities' outcomes.

**Class.** NEW (X9, abandonment by age).

**Amendment**
- Import the consumer list mechanically from the callers of `isReplicaOperationStale`, `isPriorityRecoveryOperationDrainStepStale` and `isOperationStepTimedOut`.
- For a REPLACE at ACTIVE or STOPPING, "stale" must derive from the corrected owner-availability verdict (A5), never from step age.
- Add pair **X9 × T2** (a long deferral) to §4.6.
- The S9 diagnostics must report every consumer that currently classifies R as stale.

### A17. Leadership authorities (X5 completeness)

**Evidence (handoff sub-census)**
- Only two `STEP_DOWN` issuers exist: remove safety and the user-table cure.
- Remove safety issues handoffs only for the five `-p1` partitions (`operation-workflow-owner-shared.js:364-370`). Every other priority or system partition (`-p2+`, schema_operations) retires a leader source **cold**: `replica-handler-remove-execution-methods.js:189-206` has no handoff. Node shutdown, group host failure and core-trap rebuild (`raft-rs-runtime-owner.js:189-202, 502-533, 606-630`) also drop leaders without a transfer.
- On ordinary partitions the cure's named leg picks "a follower on a host with zero leaders of the table" (`user-table-leader-placement-cure.js:240-252, 336-347`). It never reads `replica_operations`, and its `:753` path skips `evaluateState`, so it can make **s** the leader during R's ACTIVE or STOPPING.
- `handleStepDownReplica` does not check its sender (`replica-handler-remove-request-methods.js:339-372`).
- Handoff decisions use the handler's tracked role, not a fresh core read (`replica-handler-leader-handoff-methods.js:126`).

**Class.** INSTANCE of X5, plus the constraint 10 scenario "leadership changes without R initiating it".

**Amendment**
- X5's claim "R's snapshot is the only issuer on P" holds only on the five `-p1` partitions. Add rows for cold leader loss (all classes) and for the cure on ordinary partitions, with the effect "s becomes leader just before removal".
- Constraint 11's split applies to leadership as well: the cure should exclude an active REPLACE's source as a named target. Otherwise record it under S4.

---

## 3. Inputs, including cached and derived ones

### A2. ConfState provenance: the target's local configuration is a prediction that excludes s

**Dimension.** Whether the ConfState read on O came from committed log or snapshot application, or from bootstrap.

**Evidence: how t is created**
- For a REPLACE, the creation-time bootstrap topology **excludes the source**: `excludeReplicaIds: [sourceReplicaId]` (`rebalance-coordinator-operation-creation.js:748-760`). It is stored as `REPLICA_IDS` and sent in CREATE (`dispatch-response-reconcile.js:417-423`).
- It becomes the partition's `replicaIds` and `BOOTSTRAP_PEER_IDS` (`partition-service-raft-init-base.js:456`; `raft-rs-operation-port.js:138-140`).
- A fresh group is created with `peers: group.voters` (`raft-rs-runtime-owner.js:403-423`). That ConfState is **persisted as the applied state at index 0** (`:433-443`, `putAppliedState(groupId, RAFT_RS_INITIAL_APPLIED, confState)`), and a restart restores it (`:417-419`).

**Consequences**
- Until t has applied a leader snapshot or the log's conf entries, and again after any restart before that, t's local ConfState says **s ∉ voters with no commit at all**.
- §2(f)'s "absent on any replica proves the removal committed" and "a lagging follower can only show s still present" are both false for exactly the replica R-1a reads. This is the "locally predicted ConfChange result" that constraint 1 forbids.
- The P1 oracle (the applied ConfState of O's replica) shares the implementation's mistake, which protocol v2 Phase 3 asks us to check.

**Class.** NEW (input provenance).

**Amendment**
- I2 gets a provenance attribute. `SOURCE_RETIRED` requires the read ConfState to be committed-derived: the local applied index is past the initial index, and the configuration came from `resolveCommittedEntryConfState` (`raft-rs-runtime-owner.js:824-846`) or a snapshot restore. Alternatively, read on a replica whose ConfState includes s at some applied index, then later excludes it.
- **M2** gains "bootstrap ConfState accepted as committed".
- New anchor **AN11**: a fresh target that has not caught up, and a completion attempt, must answer WAIT.
- The same caveat applies to §3.2 check 2 ("t ∈ voters"): the bootstrap already lists t.

### A10. R-1f: leader conf-change admissibility and local peer reservation

**Dimension.** Whether a proposed `REMOVE_PEER` can take effect: the leader's `pending_conf_index` against `applied`, and the proposer's local reservation of s.

**Evidence: conf-change admission in raft-rs**
- raft-rs replaces a conf change with an empty normal entry, and still returns Ok, when `has_pending_conf()` (`raft-0.7.0/src/raft.rs:2062-2090`).
- `become_leader` sets `pending_conf_index = last_index` (`:1227-1232`). A new leader therefore drops every conf change until it has applied up to its election-time last index.
- R-1f's rule "re-issued on leader and term events, never faster than one attempt per leader term" fires exactly in that window. The attempt is swallowed and reported as accepted. No second attempt comes until the next term, which on a stable leader may never happen.

**Evidence: local reservation**
- The port's `REMOVE_PEER` maps the identity through the **local** reservation registry and refuses `PEER_UNRESERVED` if absent (`raft-rs-operation-port.js:117-120`; `raft-rs-peer-identity.js:131-134`).
- t's bootstrap excluded s (A2). Whether t ever reserved s through row reconciliation is *unverified*.
- The row-driven proposals on peers also usually do not fire on DELETE, because address resolution fails after the cache has removed the row (sub-census A1 caveat, `partition-service-raft-peer-cache-reconciliation.js:169-174`). Those proposals are the H5 mechanism, so R-1f is carrying more weight than §2(f) assumes.

**Class.** NEW input I11 (conf-change admissibility at the leader, and the proposer's reservation).

**Amendment**
- T7's precondition becomes "the leader's `pending_conf_index ≤ applied`" (the binding already exposes `pending_conf_index`, `vendor/raft-rs-wasm/src/lib.rs:686`) and "s reserved on the proposer, or reserved first".
- The rate key becomes (term, applied index), not term alone. Re-drive also on `membership-changed` and on the leader's applied index crossing its pending conf index.
- **M13** gains "a swallowed proposal counted as issued".

### A5. The owner lease measures row freshness, not owner liveness (S1 corrected)

**Dimension.** What the input I7 actually measures.

**Evidence**
- The lease expiry is `row.updatedAt + 30 000` (`replica-operation-owner-lease.js:36-41, 196-203`).
- It is renewed only after a committed non-terminal transition (`operation-workflow-owner-execution-lane.js:555-571`; `mutation-update-methods.js:225-239`) and on an adopter's touch, which is anchored at the same old `updatedAt`.
- A deferring ACTIVE REPLACE or a STOPPING R awaiting commit persists no transition, so its lease expires 30 s after the step entry however healthy O is.
- After S1, the verdict then falls to the routing heuristic `isNodeReadyForRouting(owner, remove-safety participation)` (`recovery-timeout.js:824-842`). The refresh-pending placeholder (F-d) makes that heuristic false about 60 % of the time.

**Consequences**
- R-1c FAILs a live owner.
- A4's stale-FAIL settles against a live owner (`recovery-drain.js:385-397`).
- Ordinary partitions adopt a live owner's operation (A1).
- All of these are timers that force outcomes, contrary to S9.

**Class.** NEW: the semantics of I7. The model treats the lease as liveness.

**Amendment**
- A live-owner lease needs a heartbeat, not a transition stamp: O renews the lease of every locally owned non-terminal REPLACE on its lane cadence, anchored at *now*.
- **OWNER DECISION-adjacent.** This changes the sealed lease contract ("anchors to the ROW's own updated_at so a successor … evaluates the same expiry instant deterministically", `replica-operation-owner-lease.js:36-41`), the same sealed record S1 superseded.
- The alternative is for R-1c to require an independent node-liveness signal (the failure detector's node DOWN), not the routing heuristic. That changes what "owner unavailable" means in the drain.
- Either is a contract choice. Without one of them, S1's premise ("a live lease means the owner is available") does not hold for REPLACE waits longer than 30 s.

### A9. The lost-wakeup guard compares the wrong version

**Dimension.** The version that changes when the *answer* to the participation read changes.

**Evidence: what the identity versions**
- `readPlanningProjectionIdentity` is the semantic **input** generation (`readiness-planning-semantic-currency-methods.js:319-343`; `readiness-planning-semantic-generation.js:85-107`).
- A refresh-pending read with an absent or non-reusable completed record enqueues the build **under the current identity** and serves the placeholder (`readiness-planning-snapshot-owner.js:565-632`).
- The build's completion is published under that same captured identity (`:674-700` → `readiness-planning-completion-admission-methods.js:606-657`).
- So read(identity I, refresh-pending) → the build completes → the event → registration → the recheck sees I == I, and **the wake is lost**. This is the dominant F-d shape: the identity has not moved, only the build is late.

**Evidence: variants**
- Builds and records are per (`ownerKey`, `buildOptionsKey`) variant.
- The event is `{ownerKey, snapshot, capturedToken}`, with a global `tokenKey` (`readiness-planning-snapshot-owner.js:219-228`).
- Deduping per (operation, node) on `tokenKey`, as §3.3 copies from the dispatch service, can drop the remove-safety variant's publication after another variant of the same node published under the same token.

**Evidence: records that become current with no publication**
- The initial bootstrap build publishes with `notifyListeners=false` (`completion-admission-methods.js:343-348`).
- The routed-read bridge (`snapshot-owner.js:596-631`) is the other case. Whether it can reach remove-safety reads is *unverified*.

**Class.** INSTANCE of I1 (the version chosen is not the one the value depends on). AN5 as written would pass while the race stays open.

**Amendment**
- The recheck after registration re-reads the **participation value** synchronously, as a level-triggered subscribe-then-recheck on the value; identity comparison stays an optimisation only.
- Dedupe on (node, variant, tokenKey), or coalesce in the lane with no token dedupe.
- Split I1 into I1a (input identity) and I1b (completed record per variant).
- **AN5** must place the publication between the read and the registration **with the identity unchanged**.

### A8. The effect boundary reads R from the cache, and remote terminal writes are not step-CAS'd

**Dimension.** The freshness of I3 at the effect, and the durable fence against non-owner terminal writers.

**Evidence**
- §3.2 check 1 uses a cache re-read. Remote terminal writes (A3/A4/R-1c from the seed) reach O's cache only after replication.
- A terminal UPDATE has no `workflow_step` guard (`replica-operation-repository.js:200-211`), so a remote FAIL overwrites ACTIVE or STOPPING.
- The owner's later `updateStep(STOPPING)` CAS fails (`transition-orchestration.js:288-296`), but only after the `REMOVE_REPLICA` has left.
- §3.6 claims the re-read "covers" A3, A4 and R-1c. It covers only the ones already visible in O's cache.

**Class.** INSTANCE of I3 (cached where fresh is needed), plus a missing durable fence.

**Amendment**
- A durable fence ordered before the send. Either:
  - persist the removal intent (ACTIVE → STOPPING by CAS, or a sub-step) **before** `REMOVE_REPLICA`, with every non-owner terminal writer using an expected-step CAS on the step it decided from; or
  - forbid non-owner FAIL at ACTIVE entirely (wake only), and decide STOPPING on committed membership.
- Add the pair **X1 (remote FAIL) × T5 (send)**.

### A12. The §3.2 revalidation set misses two inputs

**Evidence**
- (a) The concurrent-operation set for the entity (`remove-safety-evaluator.js:465-507`) is read at the start of an evaluation that awaits for up to about 1 s (finding §2b). A REMOVE created or dispatched in between, which is possible on ordinary partitions, is not rechecked.
- (b) Remove safety decides on a voter-ready **floor** over the counted replicas (the "2/3 floor" deferrals of the finding). §3.2 check 4 rechecks only the target's participation. A third replica turning unready after SAFE is the same hazard as the target turning unready.

**Class.** INSTANCE of constraint 6.

**Amendment**
- Add check 5: a synchronous cache read of the entity's concurrent non-terminal operations, with the §A6 staleness rule.
- Generalise check 4 to "every replica the floor counted".

### A13. Handoff attempt identity (I6)

**Evidence**
- For H-A (most caught up), the leader picks the successor at effect (`raft-rs-leadership-transfer.js:118-131`), so `transfereeReplicaId` is unknown when the attempt is created.
- The handler answers COMPLETED as a **role no-op** when its tracked role does not match (`replica-handler-leader-handoff-methods.js:100-104, 128-134`). That is neither a refusal nor a transfer, so under §3.4 the attempt stays unresolved until W.

**Amendment**
- The identity becomes `{operationId, attemptTerm, kind, namedTransferee | null}`. The chosen transferee is an **output** echoed by the handler.
- Import the answer universe (`RAFT_LEADERSHIP_TRANSFER_REASON` plus the handler's no-op) and classify each member as "resolves / does not resolve".

### A14. Planner split (§3.7, constraint 11)

**Evidence**
- (a) "Counts its own source as leaving" over the in-flight set includes STOPPING REPLACEs whose source row is already REMOVING or deleted, which the per-node excess already omits. A subtraction would double-deduct and plan an ADD.
- (b) The creation guards fail open under a deferred authoritative observation with zero visible operations and contained pressure (`rebalance-coordinator-priority-budget-admission.js:635-660`; `rebalance-coordinator-pressure-helper.js:98-117`). The REMOVE lane first falls back to the cache, but a lagging planner cache is a cached input to X2.
- (c) §3.7 does not touch CL-043/CL-044 (A6), which is how the ordinary-partition double removal happens (§2(g)'s own mechanism).

**Amendment**
- Phrase §3.7 as **set exclusion** of s from the counted replicas, which is idempotent against row state.
- Add I13, "planner observation deferred or cache lag", to the X2 × phase cells.
- Tie §3.7 to A6.

---

## 4. Outputs missing from P1-P3 (A15)

| Output | Why it is externally relevant | Evidence | Amendment |
|---|---|---|---|
| FAILED consequences (B3 target removal) | P1′ above | `unified-rebalancer-replica-state.js:626-651` | Add to P2 and P3 comparisons |
| Planner decisions for P (the operations it creates) | X2 × phase is only checkable if the planner's output is compared; P2 compares R's own outputs only | §3.7 | Add "operations created for P" to the P2/P3 result |
| Ledger interlock hold phase | For a `replica_operations-*` REPLACE the hold is in memory on the creator and re-learned by reads (`rebalance-coordinator-ledger-interlock-hold-state.js:22-53`). A restart of the creator mid-REPLACE is an interlock state change | – | P3 compares "dependents refused while R non-terminal", including across creator restart. Note also that R's own row lives in P (self-hosted ledger), so R's terminal write needs P's quorum after s leaves |
| Events are emitted only on the writing node | `OPERATION_COMPLETED`/`FAILED` go out on the local emitter. Listeners: intent pruning (`rebalance-coordinator-lifecycle.js:538-551`); rebalance check plus membership-publication reconcile (`unified-rebalancer-priority-recovery-coordination.js:144-212`). A remote-written terminal emits nothing on O | – | P2's output includes "which wakes fired, where"; the S9 diagnostics name the missing emitter |
| Membership-publication reconcile trigger | It is enqueued on terminal progress (`coordination.js:208`), and it moves later under C1 | – | Record as an output that changes timing only |
| S9 diagnostics | "Why and since when" must include the staleness classifications (A6), the lease verdict (A5) and the R-1f admissibility (A10) | – | Enumerate the defer-reason universe from the code |
| The membership-changed event itself (S5.2) | It must fire on every ConfState change: conf entry, snapshot restore, and runtime or group rebuild. `announce` only emits against a baseline (`raft-rs-runtime-owner.js:978-1000`; the baseline is kept across rebuild at `:194`) | – | An output of the port in P2; see §5 |

---

## 5. Consequences of the owner decisions

### S1: callers and behaviours that depended on the inverted value

1. **Release (A2 → R-1c), stale-FAIL (A4), re-entry wake** (`operation-workflow-owner-priority-recovery-reentry.js:326-340`). These are the three known callers. After the flip, each keys on "row written less than 30 s ago" (A5), not liveness.
2. **Priority drain quiesce scope.**
   - Today a live-leased remote REPLACE is released or stale-failed promptly. After the flip, a remote node's drain holds (`checkTimeouts` skips while the snapshot is not `ALLOW_RECONCILE`, `recovery-timeout.js:233-254`) for the entire REPLACE, including the unbounded ACTIVE (S9).
   - The model must state which planning waits on that drain: the topology drain watermark (`rebalancer-priority-recovery-planning-gate-methods.js:203-230`) and priority spread. That determines whether one waiting REPLACE blocks other priority partitions.
3. **Remote wake traffic.** The re-entry wake now wakes leased owners during their first 30 s. Before, it woke them only after the lease had expired and the heuristic read ready. That is more cross-node wakes, bounded by the coordinator-created wake stop (A6 row 5).
4. **Tests.** Beyond `operation-ownership-lease-fencing.test.js:318-323` and `:371-380`, the evidence author should grep `test/` for `FENCED_BY_LIVE_LEASE`, `isPriorityRecoveryDrainOwnerUnavailable` and `owner_unavailable_released` (not done here, read-only budget).
5. **Formation lanes.** `formation-ledger-spread-voter-ready-readiness.test.js:44-54` documents an A2-produced state. Formations that relied on the prompt release now wait for the owner.

### S5.2: who subscribes to the membership-changed event

- **Should subscribe:**
  - the REPLACE owner on O, for R-1a, R-1f and R-1e;
  - handoff attempt resolution, only if term and leader events are not enough.
- **Must not subscribe:**
  - The readiness planning owner. It would add a source-change class to the planning identity and change readiness semantics.
  - The membership-publication coordinator. The publication epoch contract is "blind to replica changes"; changing that is R2's scope.
  - The planner, which would make a second planning authority on ConfState (R2).
  - The peer-cache reconciliation. That would close a row → conf → row loop with A4's re-admission.
- **Emission requirements:**
  - fire on snapshot restore and after a group or runtime rebuild (`raft-rs-runtime-owner.js:502-533, 606-630`), since the baseline must be level-correct;
  - the subscription must survive re-creation of P's service on O, including the partition-service-owned coordinator swap (`partition-service-split-accessor-base.js:744`; `partition-service-lifecycle-methods.js:83-97`).

---

## 6. Restart classes (A16)

P3 names one restart. The code has three, each losing different state:

1. **Process restart.** Everything in memory is lost: the attempt record, waiters, timers, the interlock hold, the repair projections (A11.1) and the planning memo.
2. **Coordinator or workflow-owner re-initialization in process.** Shutdown bumps the ownership fence and clears registries (`rebalance-coordinator.js:205-240`). Partition services can own and swap coordinators (`partition-service-lifecycle-methods.js:83-97`; `partition-service-split-accessor-base.js:744`). Attempts and waiters are lost, but the rs-raft runtime and its terms continue. This is the only class where §3.4's restart rule ("wait for a term change or W_max") protects against an in-flight transfer.
3. **rs-raft group or runtime rebuild** (a core trap or group host failure). The core restarts as a follower with the persisted term, and `lead_transferee` is lost, but the rebalancer's in-memory attempt survives. The `announce` baseline is kept (`:194`), so the first post-rebuild change may or may not be emitted.

**Amendment.** Add E5a, E5b and E5c, and range P3 over all three.

---

## 7. Constraint 10 scenarios: is the governing dimension modelled?

| Scenario | Governing dimension | Modelled? | Gap |
|---|---|---|---|
| Target ready just before waiter registration | I1 version | Partly | Wrong version (A9) |
| Target unready after remove safety passes | I1 at the effect | Target only | Also the floor over the other replicas (A12b) |
| Source, target or third replica is leader | I5 | Yes, on the five `-p1` partitions | Cold retire elsewhere; the cure on ordinary partitions (A17) |
| **Leadership changes without R initiating it** | I5 × T4 | Partly | Cold loss via retire, shutdown or rebuild; the cure choosing s; the endpoint does not check its sender (A17); the rebuild restart class (A16.3) |
| Transfer succeeds, callback delayed | E7 | Yes | Most-caught-up has no transferee to match (A13) |
| **Transfer fails after another leader exists** | T4 resolution (1) | Yes | A COMPLETED no-op neither resolves nor transfers (A13); the continuation edge E11 (A11.6) bypasses resolution |
| Source removal commits, delivery delayed | E8/E9 × T7 | Yes | The commit may be a **bootstrap prediction** (A2) |
| **Source already removed when the owner resumes** | R-1e | Partly | ConfState provenance (A2); re-add by X11 (A4); on ordinary partitions O cannot read the membership at all (A1) |
| Restart after the target add, before source removal | P3 | Partly | Three restart classes (A16); the lease expires across the restart and R-1c fires (A5) |
| **Restart after the removal proposal, before the commit is observed** | P3 + R-1f | Partly | The attempt is swallowed after the new leader (A10); the port refuses an unreserved peer (A10); the repair re-asserts a stale decision (A11.1); the operation budget FAILs immediately (A11.2) |
| **Planner sweep in every phase** | X2 × phase | Partly | Staleness family (A6); deferred-visibility fail-open and double deduction (A14); B3 after FAILED (A7) |
| Stale or recomputing readiness answer | I1/P2 | Yes | Variant dedupe (A9) |
| Joint configuration | ConfState fields | Yes | – |
| **Duplicate wake-ups and duplicate reconciliation** | Coalescing, single-flight | Same-node only | Cross-node duplicates: adopters (A1), several remote drains, ReplicaDispatchService (E12), the terminal-transition repair (A11.1). The single-flight lane serializes only one node's work (`operation-workflow-owner-execution-lane.js:230-250`) |

---

## 8. Items flagged OWNER DECISION

1. **A5, lease semantics.** Either O heartbeats the lease (changing the sealed "anchored at `updated_at`" contract), or R-1c keys on independent node liveness. Without one of them, S1 plus S9 still let a timer (lease expiry plus a flaky heuristic) fail or adopt a live REPLACE.
2. **A1, ordinary-partition REPLACEs.** Either R-1a gets a membership read on a node other than O (a new owner interaction), or ordinary partitions are excluded from C1. Constraint 1 has no partition-class carve-out, so exclusion is an owner decision.
3. **A4 × R2 sequencing (scope, possibly OWNER).** Guarding the leader's row-driven re-admission is the membership owner's concern (R2). The REPLACE can only precondition on the row state. Whether that is enough for C1 "after completion" is a guarantee question.
4. **A7, the outcome at STOPPING with a truly dead owner.** "Only O decides success" (R-1a) together with R-1c restricted to pre-effect leaves a STOPPING REPLACE whose owner is dead with no terminal path; it holds the priority drain. The choice is between a non-owner completion on committed membership and a held drain. Each changes an established contract (R-1a's single decider, or priority drain liveness).

Everything else is a model amendment within the existing decisions.
