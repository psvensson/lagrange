# Design: a REPLACE is the single owner of removing its own source (2026-09-25)

Design investigation for the quest that follows F1 (`quest/replace-source-removal-owner`). It covers protocol v2 Phase 0 (the frozen claim) and Phase 2 (the coverage model), plus the census, the proposed design, the Phase 6 timing arithmetic, and the stop conditions.

**Conditions of this record**
- Worktree `.claude/worktrees/replace-owner`, branch `quest/replace-source-removal-owner` at 57cf259e8. Production is the F1 head's.
- Read-only: no `src/` edits and no git writes. One pure-function probe was run (§0, H2). No test suites were run.
- Inputs:
  - `quest-records/f1-step-down-port/finding-slo-residual-remove-safety.md` (the mechanism, R-1/R-2, F-a..F-d; its per-run data is in the session scratchpad `slo-residual/`);
  - `a2-gate-slo-red-classification.md`;
  - `synthesis-challenger-b.md` B5;
  - `synthesis-static-investigation.md` §3.
- The owner's decision (2026-09-25, binding): a REPLACE may not count as complete while its source replica is still a voter, and the REPLACE is the single owner of removing its own source. In scope: R-1, R-2 and B5. Recorded only: F-d, the CA3 lost conf change, and the pre-turn projection readers.
- The owner's binding constraints for this quest (`scratchpad/replace/owner-constraints-2026-09-25.md`) are folded in throughout. §7 traces each of them to its place in this record.
- Line numbers are at 57cf259e8. Where the census used a read-only sub-investigator, its claims were spot-checked; anything not re-read is marked *unverified*.

---

## 0. Headline results of the census (read these first)

These change the picture in the finding, so they come before the claim.

**H1. The drain completes a REPLACE with its source present by one route only: the owner-unavailable release.**
- At ACTIVE or STOPPING, a present source is mapped PRESENT → `REMOVAL_REQUIRED` → drain state `IN_FLIGHT` → `NOOP`:
  - `operation-workflow-recovery-reconcile-shared.js:414-438` (PRESENT → REMOVAL_REQUIRED at `:429-432`);
  - `:554-581` (source state → drain state);
  - `:323-360` (drain state → action).
- An ABSENT source counts as retirement only at STOPPING (`:399-412`, CL-023). At ACTIVE it is `EVIDENCE_UNAVAILABLE`.
- The one exit to `COMPLETE_PRIORITY_RECOVERY_DRAIN` with the source still present is the release decision. It is checked before the source-state map (`operation-workflow-recovery-timeout.js:694-724`, release at `:712-720`). It needs all four of the following (`…-reconcile-shared.js:634-645`; evidence built at `operation-workflow-recovery-timeout.js:874-903`):
  - `releaseEligibleReplace`: a REPLACE at ACTIVE or STOPPING (`replica-operation-step-policy.js:212-218`), or at SYNCING with its target observed ACTIVE (`recovery-timeout.js:844-871`);
  - `completionAccepted`: completion CONVERGED or SPREAD_SATISFIED_IN_FLIGHT, taken from the **AVAILABLE** planning snapshot (`operation-workflow-recovery-drain.js:499-512`);
  - `sourceRemovalPending`: source state `REMOVAL_REQUIRED` or `REMOVAL_IN_FLIGHT` (`…-reconcile-shared.js:440-445`). **The source is still present by construction.**
  - `remoteOwnerUnavailable` (`recovery-timeout.js:824-842`).
- The result is drain state `OWNER_UNAVAILABLE_RELEASED` → `completeOperation` (`operation-workflow-recovery-drain.js:647-657`) → step and status REMOVED (`operation-workflow-transition-persistence.js:319-324`).
- The recorded stack (F1 scratch2 #7, node 201, the seed, where the REPLACE's owner is 202) is `reconcileTimeoutOperation` → `reconcileOperationLifecycle` (`operation-workflow-recovery-status-reconcile.js:347-356`) → `operation-workflow-recovery-drain.js:656`.

**H2. The owner-availability verdict reports a live-leased owner as *unavailable*.**
- `buildLiveLeaseVerdict` returns `unavailable: true` (`operation-owner-availability-policy.js:91-102`, selected at `:109-114`).
- The module's own contract says the opposite: "A LIVE lease held by the recorded owner FENCES remote settlement" (`:7-15`). So does the caller's comment (`recovery-timeout.js:825-829`).
- All three consumers read `unavailable === true` as "the owner is gone":
  - the release above;
  - the stale-FAIL remote settle, "settles remotely only against an unavailable owner" (`operation-workflow-recovery-drain.js:385-397`);
  - the re-entry wake, which skips owners that are "no longer repair-eligible" (`operation-workflow-owner-priority-recovery-reentry.js:326-340`).
- Probe on the pure function (node, read-only):

  | owner lease | routing heuristic | state | `unavailable` |
  |---|---|---|---|
  | live | ready | `fenced_by_live_lease` | **true** |
  | live | unready | `fenced_by_live_lease` | true |
  | expired | ready | `heuristic_available` | false |
  | expired | unready | `heuristic_unavailable` | true |
  | none | ready | `heuristic_available` | false |

- Every owner-persisted transition stamps a lease of `updatedAt + 30000` (`replica-operation-owner-lease.js:41, 138-144`; row decode `replica-operation-repository-row-methods.js:108-114`). A REPLACE that reached ACTIVE less than 30 s ago therefore always looks unavailable to a remote drain.
- **Consequence:** on a remote node (the seed), Path 2 is gated only by the AVAILABLE completion verdict and the sweep timing. A live, healthy owner does not stop it.
- History:
  - The value was introduced in `c0c73cb06` (operation-ownership-lease-fencing, 2026-08-07). `1f6abb6adc` refactored it and kept it.
  - It is locked by `test/rebalancer/operation-ownership-lease-fencing.test.js:318-323` and `:371-380`.
  - Before `c0c73cb06` the probe was the routing heuristic alone (`!isNodeReadyForRouting`), which the refresh-pending placeholder (F-d) makes false about 60% of the time in this flow.
- So Path 2 was reachable either way. H2 makes it near-unconditional.

**H3. Why early close exists, and who depends on it.**
- A priority REPLACE is owned by its *target* node from dispatch through source removal (`replica-operation-repository-row-methods.js:173-199`).
- Priority and system partitions are excluded from fenced orphan adoption (`replica-operation-repository-incomplete-read-methods.js:213-231`).
- So if the owner is gone, no node can run that REPLACE's STOPPING. The release exists to un-wedge the priority drain: it declares the operation settled so that quiesce and planning can proceed, and it leaves the surplus to the planner.
- It predates the quest system. `OWNER_UNAVAILABLE_RELEASED` is in `b1acc899f` (2026-04-30) and `d943df3bf`.
- The planner then grew a compensator for the resulting state:
  - `restoreLedgerSurplusDrainActiveVoters` (`unified-rebalancer-ledger-surplus-drain-replica-state.js:22-60`, called at `unified-rebalancer-rebalance-loop.js:224-230`);
  - and the branch commented "During serial formation a completed REPLACE can leave a 3-1 ledger actual" (`unified-rebalancer-rebalance-loop.js:45-49`).
  - Both come from `a8f546c34` (quest `red-main-multi-join-formation-convergence`, 2026-09-10). Its log records the reason on 2026-09-09: "terminal REPLACE history retires one still-live source from getCurrentReplicas and rebalance returns no_changes_needed with zero moves".
- That is a second authority built to live with the early close (R01/R04).
- See §2(c) for the rest of the dependents.

**H4. The drain and remove safety read different evidence classes.**
- The drain reads the AVAILABLE (best-effort) planning snapshot (`operation-workflow-recovery-drain.js:499-500` → `priority-recovery-planning-read.js:112-127`).
- Remove safety reads the AUTHORITATIVE owner-read with no fallback: null means defer (`priority-recovery-planning-read.js:129-153`, used at `operation-workflow-remove-safety-evaluator.js:295`).
- While the readiness owner refreshes, the drain can answer "spread met" while remove safety answers "floor 2/3" (finding §2a). R-1 must not let the drain's AVAILABLE verdict stand in for remove safety (R10).

**H5. How the source actually leaves the voter set.**
- The REPLACE's SAFE verdict sends REMOVE_REPLICA to the source node (`operation-workflow-dispatch-response-reconcile.js:352-360`).
- STOPPING is written once the executor answers INITIATED or IN_PROGRESS (`:535-545`).
- The source's executor retires its local rs-raft lifecycle, persists REMOVING, and deletes the services row (`replica-handler-remove-execution-methods.js:189-310`).
- **Every** peer's partition service then reacts to that row change by proposing `REMOVE_PEER`:
  - `partition-service-core-base.js:824-841`;
  - → `partition-service-raft-peer-cache-reconciliation.js:202-247`;
  - → `:160-185`.
- So the conf change follows the durable retirement asynchronously. Its loss is the CA3 quest (excluded).

---

## 1. Phase 0: the frozen claim

### 1.1 Claim, stated as behaviour

For every REPLACE operation R on partition P, with source replica s, target replica t and owner node O (the target node for system and priority partitions):

- **C1. No terminal success with a live source.** R reaches terminal success (step REMOVED) only after R's own source retirement has been issued and confirmed. Confirmed means s's durable services row reads REMOVED or FAILED, or is absent after R's STOPPING removal was dispatched: the removal-confirmed evidence the drain and the observation owner already name.
  - A REPLACE that cannot retire its source ends FAILED, with a named reason. It never ends REMOVED.
  - This holds whichever node writes the terminal row, and whether or not the recorded owner is available.
- **C2. One removal authority, and no unrelated cadence.**
  - While R is non-terminal, s, and the surplus voter R created, are removed only by R's own STOPPING step: `REMOVE_REPLICA` to s's node.
  - Once R's remove-safety evaluation answers SAFE on the readiness owner's published evidence, R issues that removal in the same owner reaction. It does not wait for `checkRebalance`, the periodic check, or the drain sweep.
  - A remove-safety deferral whose failing input was stale readiness evidence (a `planning_snapshot_refresh_pending` participation read) is re-evaluated when the readiness owner publishes a current snapshot for that node. The 1 s timer remains only as the fallback.
- **C3. No retarget while a transfer is in progress, and no handoff after terminal.**
  - While a leadership transfer requested for P is in progress, meaning P's leader core has `lead_transferee = Some(x)`, no handoff that would make the core transfer to a successor y ≠ x is issued.
  - No handoff is issued on behalf of R once R is terminal.

What the claim does **not** say:
- It says nothing about how fast readiness becomes current (F-d).
- It says nothing about whether the peers' `REMOVE_PEER` conf change commits (CA3).
- It does not require that removal happen at all. Removal waits for SAFE, and SAFE is the remove-safety owner's decision, unchanged.

### 1.2 Record

| Item | Value |
|---|---|
| Semantic owner | The REPLACE's operation workflow on its owner node. Source retirement specifically: remove safety (`operation-workflow-remove-safety-evaluator.js`), then the STOPPING dispatch (`operation-workflow-dispatch-response-reconcile.js:205-360`). For C3's authority: the raft-rs leader core (`lead_transferee`, raft-0.7.0 `raft.rs:203, :1885-1925`), reached through the port's transfer decision (`raft-rs-leadership-transfer.js:87-150`; `raft-rs-runtime-owner.js:1199-1219`). |
| Authoritative oracle | **C1:** the pair (terminal row of R, s's durable services row) at the terminal write, plus R's own step history showing its STOPPING dispatch. The raft ConfState is corroborating only, because the conf change follows the row change asynchronously (H5). **C2:** production `evaluateRemoveSafety`'s classification. The claim is relational: issuance of the removal versus the SAFE verdict, and re-evaluation versus publication. There is no literal. **C3:** the raft-rs rule that a different transferee aborts and restarts the window (raft.rs:1899-1906, :1923-1925), and the terminal state of R's row at the point of effect. |
| Externally relevant outputs | R's terminal step and outcome (REMOVED or FAILED, with the reason); the voter set of P over time (services rows with voter `raft_role`, plus ConfState); over-target duration, meaning voters above target; every issued removal (`REMOVE_REPLICA` sends and REMOVE operation rows, each attributed to its issuing authority); every handoff request (STEP_DOWN: reason, named or most-caught-up successor, time, the operation it serves); every retarget observed at the core (window resets). |
| Allowed nondeterminism | Which node's readiness snapshot becomes current first. Raft's randomized follower timeout (raft.rs:2800-2819). Replication order of operation and services rows across nodes. Whether the drain sweep sees a completion verdict before or after R's SAFE (after the fix, both orders must give the same outputs). A transfer landing anywhere in [0, W]. Delivery latency of the remote-owner wake. **Not allowed:** the terminal outcome (REMOVED vs FAILED) given the source state; which authority issued a removal; retarget versus no retarget. |
| Exclusions | F-d, the rate of refresh-pending reads. CA3, a lost conf change. The pre-turn projection readers (K8/K9 in the F1 records). The raft-level transfer semantics themselves. REPLACEs of runtime services and message groups, beyond C1's terminal rule (their removal safety has separate owners, `remove-safety-evaluator.js:509-514`). Managed split/merge dissolution (a separate workflow). |
| Timing contracts | **TC1:** SAFE, then `REMOVE_REPLICA` dispatch in the same owner lane run, with no timer in between. **TC2:** a readiness publication for a deferred dependency, then re-evaluation enqueued at the publication (0 ms of owner clock). Fallback `SAFETY_DEFERRED_RETRY_DELAY_MS` = 1000. **TC3:** a deferral at ACTIVE never yields REMOVED. It ends only through SAFE → STOPPING, R-1c (owner unavailable), or a named FAIL classification. No step budget is enforced at ACTIVE today (§2(h), S9). At STOPPING the 60000 ms budget applies only after R-1e and R-1f (§3.1). **TC4:** no retarget inside [accepted, landed or aborted], with aborted ≤ W_leader. **TC5:** handoff effect only after an operation re-read at the point of effect shows R non-terminal. |

---

## 2. Census

### 2(a) Every path that moves a REPLACE to a terminal state

Terminal steps come from `WORKFLOW_STEP` (`src/constants/workflow.js:1-10`): REMOVED and FAILED. `completeOperation` writes REMOVED for every non-ADD operation (`operation-workflow-transition-persistence.js:319-324`).
- There is no cancellation or supersession verb for replica operations. A grep of `src/rebalancer` for CANCELLED, `cancelOperation` and `supersedeOperation` finds nothing.
- "Supersession" exists only as the superseded-target FAIL (rows A3 and A11).

| # | Path | file:line | Condition | Terminal | Source still a voter at that point? | Why it exists |
|---|---|---|---|---|---|---|
| A1 | Drain, CONVERGED | `operation-workflow-recovery-drain.js:647-657`, via `…-reconcile-shared.js:554-561` | Completion accepted, **and** the source row is REMOVED or FAILED (any step), or ABSENT at STOPPING (`:399-438`) | REMOVED | No, except a FAILED services row counts as REMOVAL_CONFIRMED (`:421-424`) while ConfState may still hold it | Settles an operation remotely once source retirement is **observed**, so priority quiesce does not wait on a slow owner |
| **A2** | **Drain, OWNER_UNAVAILABLE_RELEASED** | H1: `recovery-timeout.js:712-720`, `…-reconcile-shared.js:634-645`, `recovery-timeout.js:874-903`, completion at `recovery-drain.js:656` | REPLACE at ACTIVE or STOPPING (or at SYNCING with the target ACTIVE); completion accepted on AVAILABLE evidence; source removal pending; owner "unavailable" | **REMOVED** | **Yes, by construction** | A dead owner cannot run its STOPPING, and priority partitions have no fenced adoption (H3). Since `c0c73cb06` it also fires for live-leased, healthy owners (H2). **This is the Path 2 red.** |
| A3 | Drain, superseded target | `recovery-drain.js:604-620`; decision at `:88-150` | A remote-owned pre-sync priority REPLACE whose target has left the recovery-eligible set and is not materialized | FAILED | Yes (never at the removal step) | Re-plannable failure instead of a wedged pre-sync operation |
| A4 | Drain, stale | `recovery-drain.js:621-643`; state at `recovery-timeout.js:759-795` | CONVERGED, and either a stale STOPPING REMOVE or EVIDENCE_UNAVAILABLE past the step budget. Remote only when the owner is "unavailable" (`recovery-drain.js:385-397`, affected by H2) | FAILED | Possibly | "Without this escape a remote-owned op … would hold quiesce forever" (`recovery-timeout.js:771-775`) |
| A5 | Timeout reaper | `operation-workflow-recovery-status-reconcile.js:604-685` (fail at `:671`) | Step budget exhausted (`getTimeoutForStep`, `:456-481`). **Unreachable at ACTIVE:** `EXECUTE_ACTIVE_REPLACE` always answers "progressed" (`:398-407`), so the function returns at `:604-609`. Reachable at STOPPING: 60000 from the durable step entry | FAILED | At STOPPING, possibly: the source row may be gone while the conf change is uncommitted (T-7). The REPLICA_FAILED planner branch then removes the **target** (see 2(b)) | Bounded step budgets |
| A6 | Own ACTIVE step, retirement observed | `operation-workflow-recovery-observation.js:730-760`, entered through `EXECUTE_ACTIVE_REPLACE` (`status-reconcile.js:398-407`) | `isActiveReplaceSourceRetirementObserved` (`status-reconcile.js:131-150`): source FAILED (non-runtime), or ABSENT and not visible in the cache. REMOVING moves the operation to STOPPING instead (`:762-765`) | REMOVED | No (the same FAILED-row caveat) | The owner observing that its own removal landed |
| A7 | Own STOPPING, retirement observed | `recovery-observation.js:648-694` | Source ABSENT, or FAILED for a non-runtime REPLACE | REMOVED | No | As A6 |
| A8 | Stop phase satisfied by the response | `priority-publication-safety-topology.js:50-72` | `REMOVE_REPLICA` answered NOT_FOUND (`priority-publication-safety-shared.js:43-47`). Only reachable after SAFE | REMOVED | The handler no longer tracks it; the row and ConfState may lag (*unverified*) | Idempotent re-drive of a removal that already happened |
| A9 | Executor completion outcome | `operation-workflow-executor-outcome-reconcile-methods.js:505-565` | The source executor's completion, after its services-row DELETE (`replica-handler-remove-execution-methods.js:245-251, 303-308`) | REMOVED | No: the row is gone, and the conf change follows (H5) | Normal Path 1 settle |
| **A10** | **Replica-status reconcile, target REMOVED** | `status-reconcile.js:239-247`; lifecycle `RECONCILE_REPLICA_STATUS` only for PENDING, SENDING, CREATING and SYNCING (`recovery-timeout.js:549-553`; `replica-operation-step-policy.js:411-418`) | Reads the **target** replica (`status-reconcile.js:422-440`). A non-ADD operation whose target reads REMOVED is **completed** | **REMOVED** | **Yes: the source was never touched** | Written for REMOVE, where `replicaId` is the replica being removed. For a REPLACE it misreads the target's disappearance as success. Reachability not shown in the recorded runs (*unverified*). A second C1 violation class |
| A11 | Dispatch-time failures | superseded `dispatch-response-reconcile.js:224-239`; handoff NOT_FOUND policy `:291-306`; remove-safety FAIL `:324-335`; source missing `:383-392`; dispatch error `:607-617`; epoch gate `operation-workflow-dispatch-epoch-gate.js:117`; executor failure `executor-outcome-reconcile-methods.js:723`; STOPPING starvation `operation-workflow-stopping-starvation.js:120-135`; SQL provisioning `sql-query-engine-provisioning-admission-methods.js:352` | Named failures | FAILED | Yes (no removal was issued) or unknown (starvation) | Explicit failure outcomes |
| A12 | Recovery-cause FAIL | `status-reconcile.js:370-395` | Node restart recovery: pre-sync, or STOPPING | FAILED | Unknown at STOPPING | Destructive restart semantics |

**Who depends on early close (A2), from the code.** The rest is in 2(c).
1. **Priority drain quiesce.**
   - `checkTimeouts` skips every operation whose drain snapshot is not ALLOW_RECONCILE (`recovery-timeout.js:233-254`).
   - A remote REPLACE whose owner is gone would otherwise hold the priority drain open until A4's stale escape. A4 does not apply to a present source, because REMOVAL_REQUIRED maps to IN_FLIGHT, not EVIDENCE_UNAVAILABLE.
   - **So without A2, a dead-owner REPLACE with a present source has no remote terminal path at all.** A5 never fails an ACTIVE REPLACE (§2(h)), and it runs remotely only when the drain allows reconcile. That is the liveness gap R-1 must close explicitly (§3.1, case R-1c).
2. **The planner's surplus-drain lane** (H3 and 2(b)). It was built on 2026-09-09/10 for the state A2 produces.
3. **The planner's retirement view.** `getTerminalRetiredReplicaIds` treats every REMOVED REPLACE's source as retired (`unified-rebalancer-replica-state.js:584-616`). After A2 the planner removes the source from its replica view while the source is still an ACTIVE voter. The removal census found that r2 stays "retired" after the planner removes r1 instead (*unverified follow-on*: a later pass may see 2 of 3 and plan an ADD).
4. **Prior records already named A2 and A10 as the same ghost-retirement class.**
   - CL-023 (`6a7ad7400`, 2026-06-12) fixed only the pre-sync paths.
   - `solve/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-025.md:295-306` names `OWNER_UNAVAILABLE_RELEASED` and the ACTIVE ABSENT-complete (A6) as "same ghost class in principle … look HERE first".
   - `:378-384` names A10: "target-removed is not source-retired".
   - `test/rebalancer/formation-ledger-spread-voter-ready-readiness.test.js:44-54` documents a live formation wedge caused by A2 (`sourceState: removal_required`, `drainState: owner_unavailable_released`). The leftover surplus REMOVE "has no completion lane and dies at the floor".

### 2(b) Every path that can remove a replica a REPLACE sourced, or the surplus a REPLACE created

| # | Authority | file:line | Trigger | What it reads | REPLACE-aware? | Under "never REMOVED while the source is a voter" |
|---|---|---|---|---|---|---|
| B1 | **The REPLACE's own retirement** | ACTIVE → `EXECUTE_ACTIVE_REPLACE` (`recovery-timeout.js:533-537`) → `executeOperationInternal` (`dispatch-response-reconcile.js:205`) → `evaluateRemoveSafety` (`:261`) → SAFE → `REMOVE_REPLICA` to `sourceNodeId` (`:352-360`, reason `replace_source_removal`) → STOPPING on INITIATED or IN_PROGRESS (`:535-545`) → the source executor deletes the services row (`replica-handler-remove-execution-methods.js:189-310`) → every peer proposes `REMOVE_PEER` (`partition-service-core-base.js:824-841` → `partition-service-raft-peer-cache-reconciliation.js:202-247` → `:160-185`) | SAFE | Authoritative readiness evidence, replica rows, leader safety | It is the REPLACE | **The single owner.** Kept; this design completes it |
| B2 | **The planner's ledger-surplus-drain lane (the duplicate)** | Capability `rebalancer-priority-recovery-planning-gate-methods.js:478-501` / `rebalancer-planning-gate-methods.js:64-79`, fed by `operation-ledger-quorum-concentration.js:159-218, 231-285` (services rows only); the retired view `unified-rebalancer-replica-state.js:584-616, 658-672`; the restore `unified-rebalancer-ledger-surplus-drain-replica-state.js:22-60` (called at `unified-rebalancer-rebalance-loop.js:224-230`, and the "completed REPLACE can leave a 3-1" branch at `:45-49`); selection `move-planner-move-calculation-methods.js:317-323, 505-509`; creation fence `rebalance-coordinator-topology-guard-methods.js:369-455` | `checkRebalance` (1000 ms minimum on a priority partition) after the terminal wake | Services rows, plus terminal operation history | **No.** It removes whichever replica sorts first: r1 in every recorded case, not the REPLACE's source r2. The terminal REPLACE row then keeps r2 "retired" in the planner's view (the follow-on hazard is *unverified*) | Its REPLACE duty disappears. It **stays** for its other inputs (2(b) verdict below) |
| B3 | Failed-replica / failed-REPLACE-target REMOVE (REPLICA_FAILED) | `move-planner-move-calculation-methods.js:174, 220-252`; `unified-rebalancer-replica-state.js:626-651` | A FAILED services row, or the target of a FAILED REPLACE | Rows and FAILED operations | Removes the failed REPLACE's **target**, never its source | Stays. Covers A5, A11 and the owner-unavailable FAIL of §3.1 |
| B4 | Paired-relocation REPLACE (the "surplus-drain REPLACE") | `move-planner-move-calculation-methods.js:650-710` | Surplus source paired with an ADD | Rows | It *is* a REPLACE (the operation this design fixes) | Unchanged |
| B5r | Membership reconciliation from rows | `partition-service-raft-peer-cache-reconciliation.js:249-293, 295-356`; `partition-service-raft-init-base.js:152-159` | An address change | Rows | No | Never removes a voter for lacking a row. Unaffected |
| B6 | Explicit retirement from a row change | `partition-service-raft-peer-cache-reconciliation.js:202-247` | Services DELETE or REMOVED | Rows | Mechanism only | Shared mechanism for B1 and every REMOVE. Stays |
| B7 | Node restart recovery | `src/node/replica-lifecycle-recovery.js:54-66, 106-176` | Local rows at STOPPING or STARTING | Local rows | No | Stays. Never acts on an ACTIVE source |
| B8 | Managed split/merge dissolution | `managed-split-workflow-dissolution-methods.js:509-521`; `managed-merge-workflow-dissolution-methods.js:447-450` | Its workflow | Its own | Separate workflow | Excluded |
| B9 | Node removal | `node-lifecycle-service.js:238-266` → NODE_NOT_IN_TARGET (`move-planner-move-calculation-methods.js:525-529`) | A nodes-row DELETE | Rows | No | Stays |

**Structural guards that already keep the planner off an active REPLACE's source.** All are enforced before the terminal:
- The serial goal-state planner (priority and formation-liveness partitions) plans nothing while any unresolved operation exists and there is no deficit (`effective-placement-serial-priority-planner.js:78-81, 199-205, 299-308`, applied at `move-planner-move-calculation-methods.js:133-141`; inputs at `move-planner-state-methods.js:306-309, 360-368`).
- `hasPendingMove` skips replicas with any in-flight operation, including a REPLACE source (`unified-rebalancer-move-execution.js:325-341`), and STOPPING sources (`move-planner-state-methods.js:61-79`).
- At creation, `ensureNoConflictingInFlightReplaceForRemove` refuses a REMOVE of a non-terminal REPLACE's source or target (`rebalance-coordinator-priority-budget-admission.js:505-574`, wired at `rebalance-coordinator-operation-creation.js:394`).
- `ensurePriorityControlPlaneRemoveLaneAvailable` refuses any priority REMOVE on a partition with a non-terminal REPLACE in ACTIVE or STOPPING (`…priority-budget-admission.js:579-679`; steps at `replica-operation-step-policy.js:317-343`).
- At execution, the concurrent-operation gate defers any REMOVE while another non-terminal operation shares the entity (`operation-workflow-remove-safety-evaluator.js:465-507`).
- **Verdict:** while a REPLACE is non-terminal, the planner already neither removes its source nor plans the surplus on priority partitions. B2 exists only because A2 made the REPLACE terminal.
- For ordinary (non-serial) partitions, the planner's view of an in-flight REPLACE is in §2(f).

**B2's legitimate duties outside REPLACE source retirement** (from the removal census). These keep B2 alive:
- operator replication-factor decrease (OVER_REPRESENTATION);
- node removal;
- ADD overshoot and over-creation pile-up (`move-planner-move-calculation-methods.js:414-444`);
- bootstrap ledger concentration (2/3 on the seed, `operation-ledger-quorum-concentration.js:12-26`);
- a leader source that falls past `replaceCount` into a plain REMOVE (`:651-655`).

**The restore helper's remaining input.** `restoreLedgerSurplusDrainActiveVoters` re-admits "retired by terminal history but still an ACTIVE voter". After this design, that state can only come from:
- a REPLACE made REMOVED **before** the repair: pre-repair durable rows, which constraint 3 requires us to handle;
- possibly a REMOVED REMOVE whose services row lags (*unverified*, §2(f)).

So the helper is **not deleted** in this quest. Its REPLACE-sourced input becomes unreachable for new operations, and a record states its remaining duty.

### 2(c) Consumers of a REPLACE's terminal state

The full table is in the consumer census. Rows that matter for the design:

| Consumer | file:line | Reliance on early close | Effect of this design |
|---|---|---|---|
| Planner retirement view | `unified-rebalancer-replica-state.js:584-616, 658-672` (used by `getCurrentReplicas` `:274, 291, 310`; follow-up decision `unified-rebalancer-follow-up-decision.js:705`) | **Inverse hazard.** A REMOVED REPLACE hides its live source (ghost) | Becomes truthful: REMOVED implies the source is out of committed membership (P1) |
| Ledger-surplus restore | `unified-rebalancer-ledger-surplus-drain-replica-state.js:22-60` | A workaround for A2 | REPLACE input unreachable for new operations; kept for pre-repair rows (2(b)) |
| Terminal target projection | `unified-rebalancer-replica-state.js:334-420`; `replica-operation-progress.js:604-618` | Mild: the target is projected ACTIVE only after the terminal | Unchanged. The target's row is present at ACTIVE (*unverified* for lagging caches) |
| FAILED-REPLACE target cleanup | `unified-rebalancer-replica-state.js:626-650` → `move-planner-move-calculation-methods.js:236-252` | None today | **Risk:** a REPLACE whose STOPPING budget (60000) expires while s is still a committed voter FAILs, and the planner then removes the **healthy target** (T-7). ACTIVE never times out (§2(h)) |
| Serial planner hold | `effective-placement-serial-priority-planner.js:199-205` | This is why B2 only appears after A2 | The planner waits. Consistent |
| Critical REPLACE serialization | `move-planner-move-calculation-methods.js:430-442` (`inFlightReplaceCount`) | An early close frees the slot sooner | The slot is held through STOPPING (intended) |
| Add-like and REMOVE lanes | `rebalance-coordinator-priority-budget-admission.js:95-160, 323-335, 360-420, 505-574, 579-679` | An early close reopens the lanes (the overflow audit infers REPLACE #2 dispatched 2.4 s after an `owner_unavailable_released` release while the source was present) | Lanes reopen only after the source has left committed membership |
| Same-intent successor | `rebalance-coordinator-operation-persistence-collision.js:41-60` | A terminal row lets an identical intent spawn a successor REPLACE | The existing operation is reused or rearmed |
| **Ledger self-move interlock** | `rebalance-coordinator-ledger-interlock-admission.js:173-215`; `operation-ledger-hold-policy.js:242-270`; `operation-workflow-dispatch-ledger-self-move-gate.js:148-172, 301-317`; hold released at `operation-workflow-transition-persistence.js:411` | **Strong.** A REPLACE on `replica_operations-*` holds the interlock while non-terminal, with **no staleness exclusion** | Held through STOPPING. A REPLACE that nobody finishes holds it indefinitely, so the liveness backstop (§3.5) is mandatory, not optional |
| Topology drain watermark | `unified-rebalancer-topology-drain-methods.js:43-54`; `replica-operation-topology-drain.js:10-33`; `rebalancer-priority-recovery-planning-gate-methods.js:203-230` | Minor | A later `completedAt` moves the non-priority spread window |
| Spread completion | `control-plane/priority-recovery-snapshot-ingress.js:130-226`; `priority-recovery-completion.js:160-185` | **None:** an ACTIVE or STOPPING REPLACE already counts as SPREAD_SATISFIED_IN_FLIGHT | Unchanged |
| Readiness recovery-pending | `control-plane-readiness-evidence-reasons.js:272-286`; `control-plane-readiness-startup-authority-health.js:65, 265-290` | Indirect via the spread summary (*unverified* whether it counts over-target voters) | To be checked by the challengers |
| Membership publication dispatch retry | `control-plane/membership-publication-row-helpers.js:143-172, 239-251`; `membership-publication-coordinator-reads.js:451, 495` | **Helps:** it keeps re-driving an ACTIVE REPLACE's owner while non-terminal | An existing owner wake. Reused (§3.5) |
| Terminal wakes | `unified-rebalancer-priority-recovery-coordination.js:37-80, 144-212`; `priority-recovery-visibility-decision.js:230-275` | B2 depends on them (and is throttled by `checkRebalance`) | Source removal no longer depends on them |
| Reservations, lease, interlock release | `operation-workflow-terminal-reservation-release.js:22-66`; `transition-persistence.js:292, 411-413` | Released at the terminal | Released later (through STOPPING) |
| Created-handoff retry loop | `operation-workflow-coordinator-created-handoff-scheduling.js:426-440`; `recovery-drain.js:444-477` | An early close stops the seed's remote-owner wake loop | Continues, bounded by `buildCoordinatorCreatedRemoteHandoffTimeoutDecision` |
| Distributed-harness quiescence | `diagnostics/control-plane-quiescence-snapshot.js:549-570`; `test/distributed/harness/cluster-class-quiescence.js` | Counts in-flight operations | Quiescence waits through STOPPING |

**Tests that pin the early close.** These must be superseded under R09, not weakened:
- `test/rebalancer/rebalance-coordinator-stopping-reconcile-cache-visibility.test.js:243-364`: "releases remote-owned ACTIVE priority REPLACE when the canonical owner is no longer repair-eligible and spread is satisfied". It expects a source that is an ACTIVE voter to end REMOVED (`:357-360`).
- The same file, `:366-488`: SYNCING with the target ACTIVE, same expectation.
- The same file, `:490-612`: STOPPING with a REMOVING source ends REMOVED. This conflicts only if REMOVING is still in committed membership, which C1 now decides (§3.1).
- `test/rebalancer/operation-ownership-lease-fencing.test.js:318-323, 371-380`: pins H2's `unavailable: true` for a live lease (see S1).
- `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js:2550-2620`: SENDING with a hand-built COMPLETE snapshot calls `completeOperation`. It is affected only if the guard is placed inside `reconcilePriorityRecoveryOperationDrain` rather than at the decision.
- Consistent with the design, not affected: `rebalance-coordinator-stopping-reconcile-stale-priority.test.js:401` ("a REPLACE with a live ACTIVE source must never terminalize as REMOVED"), and `rebalance-coordinator-stopping-reconcile-terminal-visibility.test.js`.

### 2(d) The remove-safety deferral: wake paths, the readiness owner's publication, and its generation

**How a deferred REPLACE is re-entered today**

| Wake | file:line | Cadence | Notes |
|---|---|---|---|
| Deferred-safety timer | `scheduleDeferredSafetyRetry`, `operation-workflow-dispatch-rearm-evidence.js:494-590`, armed at `dispatch-response-reconcile.js:312-322` | `SAFETY_DEFERRED_RETRY_DELAY_MS` = 1000 (`operation-workflow-owner-shared.js:339`) | One timer per operation; an armed timer is reused (`:499-501`). It re-reads the operation, checks it is non-terminal, locally owned and retryable (`:535-547`), then runs `EXECUTE` in the operation's single-flight lane. Fired in 1 of 52 recorded episodes (finding §2c) |
| Cleared on | `clearDeferredSafetyBlockState`, `operation-workflow-recovery-reconcile.js:379-388`; also inside `completeOperation` and `failOperation` (`transition-persistence.js:414, 568`) and the not-committed terminal path (`:310`) | – | A transition or SAFE |
| Priority active-REPLACE resume | `ensurePriorityActiveReplaceRetryArmed`, `dispatch-response-reconcile.js:663-700` | `DISPATCH_RETRY_DELAY_MS` = 250 (`owner-shared.js:341`) | **Suppressed while a safety timer is armed** (`:671`). Effectively 1000 ms while deferring |
| Incidental re-entries | operation-row progress (`execute_reconcile`), observed-progress retries (`OBSERVED_PROGRESS_RETRY_DELAY_MS` = 250, `owner-shared.js:340`), membership-publication dispatch retry (`membership-publication-row-helpers.js:143-172`) | event or 250 ms | Why Path 1's SAFE usually arrived before the timer (finding §2c) |
| Orphan sweep | `reconcileOrphanedOperations`, `recovery-timeout.js:365-460` | The timeout interval with an empty-scan backoff; acts only on "actionable truth" or ops past their step budget | A backstop, not a fast path (§2(h)) |

**The readiness owner's publication (existing, R-2's event)**
- `ReadinessPlanningSnapshotOwner.subscribe` and `notifySnapshotPublished` (`readiness-planning-snapshot-owner.js:211-228`). The event is `{ownerKey (= nodeId), snapshot, capturedToken}`.
- It is emitted only when a **current** completed build is admitted (`readiness-planning-completion-admission-methods.js:636-657`). A stale completion re-queues instead (`:640-650`).
- It is exposed as `subscribeReadinessPlanningSnapshots` (`control-plane-readiness-planning-owner-delegate-methods.js:53-56`). The workflow owner already holds `controlPlaneReadinessService` (`operation-workflow-owner-retry-registry.js:58`).
- **Every refresh-pending read enqueues the build whose completion publishes:**
  - `readSync` enqueues on an absent record (`readiness-planning-snapshot-owner.js:565-572`), a live veto (`:595-600`), and behind the barrier (`:624-632`);
  - it serves the deferred placeholder meanwhile.
  - So a deferral caused by a refresh-pending read has a publication coming, unless the readiness owner is stopped or saturated.
- Precedent for the same wake: `ReplicaDispatchService`.
  - It subscribes once at start (`replica-dispatch-service-lifecycle.js:244-255`).
  - It dedupes per `ownerKey` by `capturedToken.tokenKey`, against the applied and pending token maps (`:257-273`).
  - It enqueues its owner-keyed reconcile queue with `RECONCILE_REASON.READINESS_PLANNING_SNAPSHOT_PUBLISHED` (`:274-290`; reason at `src/workflow/reconcile-queue-constants.js:26`).

**Existing generations/revisions (for the lost-wakeup rule, constraint 4)**
- **Per-node planning identity** `{globalPlanningGeneration, nodePlanningGeneration, saturated}`:
  - read with `readPlanningProjectionIdentity(nodeId)` (`readiness-planning-semantic-currency-methods.js:319`; delegate `control-plane-readiness-planning-owner-delegate-methods.js:30-37`);
  - compared with `planningIdentitiesEqual` and checked with `isPlanningIdentityCurrent` (`readiness-planning-semantic-generation.js:88-107`);
  - captured into each completed record (`readiness-planning-completion-admission-methods.js:614`).
- **Global planning token** `tokenKey`: built by `freezeToken` (`readiness-planning-version-contract.js:228-260`), captured by `captureToken` (`readiness-planning-snapshot-owner.js:187`), compared by `tokensEqual` (`:207-209`), and carried on every publication event.
- These two are sufficient. No new event ledger is needed (§3.3).

### 2(e) Handoff issuers, successor choice, and cadence

Every path reaches the core the same way:
- STEP_DOWN_REPLICA → `replica-handler-lifecycle-methods.js:65-66`;
- → `handleStepDownReplica` (`replica-handler-remove-request-methods.js:339-372`);
- → `requestTrackedPartitionLeaderHandoff` (`replica-handler-leader-handoff-methods.js:117-147`);
- → `PartitionService.requestLeadershipTransfer` (`partition-service-leadership-transfer.js:39-44`);
- → port `transferLeadership` (`raft-rs-operation-port.js:259-265`);
- → runtime `transferLeadership` (`raft-rs-runtime-owner.js:1199-1219`), which decides on `decideLeadershipTransfer` (`raft-rs-leadership-transfer.js:143-150`).

| # | Issuer | Trigger | Successor | Dedupe / cadence key | Re-checks the operation at the point of effect? | Can alternate successors within W? |
|---|---|---|---|---|---|---|
| H-A | Remove safety, **source leg** (`REQUEST_SOURCE_LEADER_HANDOFF`, `priority-publication-leader-safety.js:496-525`; request `priority-publication-handoff.js:207-222`, reason `REPLACE_SOURCE_LEADER_HANDOFF`) | A REPLACE on a handoff-required system partition (`operation-workflow-owner-shared.js:364-370`) whose source is not a follower, with no escalation | **most-caught-up**, chosen by the leader at effect (`raft-rs-leadership-transfer.js:118-131`; ranking by `matched` then lowest id, `:106-113`) | `priorityPublicationLeaderHandoffEvidenceByOperationId`, keyed by operationId, recorded only after a COMPLETED or NOT_FOUND answer (`priority-publication-safety-topology.js:273-312, 487-522`); suppressed for 5000 ms (`:590-597`; `REQUEST_RETRY_AFTER_MS` `owner-shared.js:388`); stale after 60 s (`:389`). ERROR or timeout records nothing, so the next evaluation re-issues | **No** (`dispatch-response-reconcile.js:261-272`; `priority-publication-handoff.js:225-285`) | **Yes:** X (most-caught-up), then T (the next row), 0-1 s apart |
| H-B | Remove safety, **target leg / Lever A** (`REQUEST_REPLACEMENT_LEADER_ELECTION`, `priority-publication-leader-safety.js:559-592`; request `priority-publication-handoff.js:145-177`, reason `REPLACE_TARGET_LEADER_ELECTION`, sent to the replacement node) | Source handoff satisfied, or escalated (`:361-365`); the replacement is a follower; retry not suppressed | **named T**, self on the replacement node, so the follower **forwards** it to the leader (`raft-rs-leadership-transfer.js:98-101`; raft.rs:2339-2347) | `priorityPublicationReplacementLeaderElectionEvidenceByOperationId` (`priority-publication-safety-topology.js:524-588`). Suppression holds only while the evidence names the current candidate (`:355-376`), so **the successor is effectively part of the key** | No | **Yes:** T, then Y (next row) |
| H-B′ | Replacement retarget (`resolvePriorityPublicationReplacementLeaderCandidateRow`, `operation-workflow-replacement-leader-resolution.js:97-257`; states `operation-workflow-replacement-leader-state.js:53-98`) | `RETARGET_AFTER_NOT_FOUND` (whatever the suppression); `RETARGET_AFTER_COMPLETED_WITHOUT_OWNERSHIP` after 5 s with ownership still not visible in rows | named Y = the first eligible voter-ready row not on the source node (`resolution.js:183-198, 241-256`) | As H-B | No | **Yes, by design:** T, then Y at 5000 ms or later, which is less than W(2) = 6000 and W(3) = 8500 |
| H-C | User-table leader-placement cure (`dispatchLeaderHandoff`, `user-table-leader-placement-cure.js:423-451`) | Quiescent periodic branch (`rebalancer-planning-gate-methods.js:696`) or behind the priority-spread gate (`:753`); ordinary user tables only (`:453-461, 489`) | Leg 1 most-caught-up X (its own replica, local); leg 2 named T on a zero-leader host (`:240-251, 336-347`), forwarded | `lastDispatchAtMs` per partition, set **before** the awaits (`:325-334, 425`), 5000 ms (`:78-79`) | No. Leg 2 follows leg 1's await with no re-check (`:426-434`) | **Yes, within milliseconds:** X, then T, whenever X ≠ T |

- **Receiver.** `transferRequestOf` (`replica-handler-leader-handoff-methods.js:84-98`) turns the target reason into `{named, self}` only when the tracked role is FOLLOWER. Any other reason becomes `{most-caught-up}` only when LEADER. Otherwise it is a COMPLETED role no-op (`:100-104, 128-134`).
  - The tracked role is a projection, not the core.
  - A no-op still answers COMPLETED, so the issuer records evidence and starts its 5 s suppression although nothing moved.
- **Transfer in progress.** No issuer can see it.
  - The binding's `status` omits `lead_transferee` (`vendor/raft-rs-wasm/src/lib.rs:684-716`). Status already reads `pending_conf_index` straight from `n.rn.raft` (`:686`).
  - The port answers `transfer-requested` whether raft-rs ignored the request (same transferee, raft.rs:1889-1898) or aborted and restarted (different transferee, `:1899-1906, 1923-1925`).
  - The only transfer-in-progress signal is indirect: a dropped proposal classified `TRANSFER_IN_PROGRESS` (`raft-rs-leadership-transfer.js:173-188`).
- **Issuers of the same partition.** The cure and remove safety cover disjoint partitions (the cure is `systemTable === false` only). Within one REPLACE, H-A → H-B and H-B → H-B′ alternate. Two REPLACEs on one partition would not see each other's keys, but serial planning prevents that on priority partitions (2(b)).
- **Post-terminal handoff (F-b).** Between `evaluateRemoveSafety` (`dispatch-response-reconcile.js:261`, which awaits rows, the candidate row, completion, the minimum count, published membership and leader safety) and `deliver` (`priority-publication-handoff.js:266`), nothing re-reads the operation.
  - The per-operation single-flight lane (`operation-workflow-owner-execution-lane.js:230-250`) serializes only same-node work.
  - Scratch2 #5's terminal write came from the seed's drain.

### 2(g) The planner against an active REPLACE's source: the structural split (owner constraints 2 and 11)

**Priority and formation-liveness partitions** use the serial goal-state planner (`move-planner-state-methods.js:305-308`).
- Its unresolved set is every non-terminal operation on the entity (`move-planner-move-calculation-methods.js:125-141`; `move-planner-state-methods.js:357-364`).
- It returns PROGRESS_EXISTING_TRANSITION with no move when any operation is a REMOVE or at STOPPING, or when a transition exists and the deficit is 0 (`effective-placement-serial-priority-planner.js:25-28, 78-81, 199-205, 299-307`).
- With a deficit it may still emit FAILED_REPLICA_REMOVE or TRUE_DEFICIT_ADD (`:207-236`). Neither can touch R's source or target, because `hasPendingMove` skips them (`move-planner-move-calculation-methods.js:226`; `unified-rebalancer-move-execution.js:325-341`).
- At creation, priority partitions also refuse **any** REMOVE while a REPLACE is in PENDING..STOPPING (`rebalance-coordinator-priority-budget-admission.js:607-680`).
- **Split: clean.** B2 was reachable only after A2.

**Ordinary (non-serial) partitions: an overlap exists.**
- Inventory and `pendingCount` come from `getEntityTopologyBlockingInFlightOperations` (`move-planner-state-methods.js:442-477`), which **excludes** REPLACEs in the remove-dispatch phase (`unified-rebalancer-topology-drain-methods.js:43-54`).
- `activeCount` counts both s and t, with no "source leaving" deduction (`replica-inventory.js:417-438, 515-527`).
- Per-node excess is computed from ACTIVE rows (`move-planner-move-calculation-methods.js:505-620`). `hasPendingMove` protects only R's own source and target.
- So a REMOVE of a **different** replica of P (NODE_NOT_IN_TARGET or SPREAD) can be planned for the surplus that R itself created.
- Creation refuses only a REMOVE of R's own source or target on non-priority partitions (`…priority-budget-admission.js:505-567`).
- At execution, the concurrent-operation gate defers such a REMOVE (`operation-workflow-remove-safety-evaluator.js:465-507`). It stops treating R as active once R is past its 30 000 ms step budget (CL-043, `recovery-timeout.js:663-692`). After that both proceed, and the surplus is removed **twice**.
- This is structural, not observed live. It is the **uncovered case** constraint 11 asks for.

**Split table**

| Surplus voter on P | Authority today | Under this design |
|---|---|---|
| Source of a non-terminal REPLACE | R (B1). The planner protects s through `hasPendingMove` and creation refusal. **Overlaps:** A2 (priority); a different-replica REMOVE for the same surplus (ordinary, above) | **R only.** A2 is removed. On ordinary partitions the planner's excess counts an active REPLACE's source as leaving (scoped: only the unit of surplus R created) (§3.7) |
| Target of a FAILED REPLACE | B3 (serial precedence 0) | Unchanged |
| Source of a FAILED REPLACE after the target became a voter | Nobody. B3 removes the target, so placement reverts | Unchanged (a FAILED REPLACE asserts nothing) |
| ADD overshoot, RF decrease, node removal | Planner per-node excess (B2 or B9); on priority partitions serialized by the REMOVE lane and the serial hold | Unchanged |
| Bootstrap ledger concentration | B2 capability plus restore | Unchanged |
| Source of a **REMOVED** REPLACE that is still a voter (pre-repair ghost) | Ledger partitions over target only (restore, then REMOVE). **Uncovered elsewhere:** `getCurrentReplicas` filters it out (`unified-rebalancer-replica-state.js:272-320`) | No new ones can be created (P1). The legacy rows are a scope question for the lead (S10) |

### 2(h) Restart, the re-drive paths, and the durable identity (owner constraints 5 and 6)

**The RECOVERY cause is not invoked in production.**
- `handleRecovery` (`rebalance-coordinator-recovery-helper.js:51`, bound at `rebalance-coordinator-recovery-budget-bindings.js:88-89`; `operation-workflow-recovery-reconcile.js:191`) has no src caller. The only callers are tests (for example `test/rebalancer/no-orphaned-replicas-after-recovery.property.test.js:293`).
- So `FAIL_PRE_SYNC_RECOVERY` and `FAIL_STOPPING_RECOVERY` (`recovery-timeout.js:523-529`) are unreachable in production (dynamic dispatch not excluded).
- An owner restart is healed by the periodic paths. Ownership is a pure function of the row (the target node, `replica-operation-repository-row-methods.js:173-215`), so the same node owns R again.

| Path | Cadence | Gate | Same owner lifecycle? |
|---|---|---|---|
| `checkTimeouts` (`recovery-timeout.js:174-320`) | 1000 ms (K1) | Drain owner action ALLOW_RECONCILE, meaning the local owner | Yes: `reconcileTimeoutOperation` → `reconcileOperationProgress` → `EXECUTE_ACTIVE_REPLACE` → `executeOperationFromReconcilePath` → `executeOperationInternal`, which re-evaluates remove safety (`dispatch-response-reconcile.js:129-139, 212-331`). **`EXECUTE_ACTIVE_REPLACE` always answers "progressed" (`status-reconcile.js:398-407`), so `reconcileTimeoutOperation` returns before its budget check (`:604-609`). An ACTIVE REPLACE never times out on this path.** At STOPPING, `RECONCILE_STOPPING` returns false while the source is in progress, and the operation is FAILED after `removingTimeoutMs` 60000 from the durable step entry (`status-reconcile.js:647-685`) |
| `reconcileOrphanedOperations` (`recovery-timeout.js:365-432`) | 5000 ms throttle (K12) | `shouldReconcileOrphanedOperation` (`:448-475`): past the step budget, **or** the operation's `replicaId` reads ACTIVE, REMOVED or FAILED. For a REPLACE that `replicaId` is the target, which is ACTIVE at ACTIVE and STOPPING, so **a deferring REPLACE qualifies immediately** | Yes, cause PROGRESS (`:417-426`) |
| `ensurePriorityActiveReplaceRetryArmed` | 250 ms one-shot, only when an execute came back skipped | – | Yes |
| Observed progress | Edge-triggered, 250 ms retry | – | Yes (the adapter routing is *unverified*) |

**Node side.**
- `runReplicaLifecycleRecovery` (`src/node/replica-lifecycle-recovery.js:313-341`) handles STARTING and SYNCING by moving them to FAILED, and STOPPING by moving it to STOPPED and deleting it (`:54-150`). REMOVING is not in its vocabulary (`replica-lifecycle-constants.js:6-13`).
- A re-dispatched remove to a source already REMOVING restarts the removal (`replica-handler-remove-request-methods.js:184-200`).

**Durable identity for the effect boundary (constraint 6) and for attempts (constraint 7).**
- The CAS where-clause is `operation_id`, plus `workflow_step = expected` on step transitions, plus `completed_at IS NULL` on terminal writes (`replica-operation-repository-mutation-row-methods.js:79-101`; `replica-operation-repository.js:192-211`; `operation-workflow-transition-orchestration.js:288-296, 562-577`).
- `updated_at`, the length of `steps_history`, and `membership_publication_epoch` are **not** compared.
- The durable within-step revision is the current step entry's timestamp in `steps_history` (`resolveOperationCurrentStepEntry`, `operation-step-age.js`; used by the drain's step age, `recovery-timeout.js:577-612`).
- **There is no durable per-attempt epoch:**
  - `membership_publication_epoch` is stamped once at creation (`rebalance-coordinator-operation-creation.js:724`);
  - the row carries no raft term;
  - the lease is a TTL;
  - the ownership fence epoch is in memory (`operation-workflow-owner-retry-registry.js:169-183`);
  - the `operation_progress` version and term are in memory (`operation-progress-store.js:85-86`).
  - The attempt identity therefore reuses `operationId` plus the core's raft term, both existing namespaces (§3.4).

---

## 3. Proposed design at the single owner

**Principle.** One REPLACE, one owner (its workflow on node O), one causal chain:
1. add the target;
2. establish target safety (remove safety, on authoritative readiness);
3. hand off leadership if required (one attempt at a time);
4. remove the source (`REMOVE_REPLICA`, then the peers' `REMOVE_PEER`);
5. observe the committed membership;
6. complete.

Everything else becomes either a **wake** of that owner or a **refusal** to act on its source:
- the drain;
- readiness publications;
- the timers and the orphan sweep;
- the planner;
- the terminal listeners.

None of them may decide completion or removal. Nothing global is suppressed.

### 3.1 R-1: completion is decided only against committed membership; the drain hands back instead of closing

**R-1a. One completion decision** (the owner of P1).
- `decideReplaceCompletion(R)` returns a named state (R07):
  - `SOURCE_RETIRED`: complete;
  - `SOURCE_STILL_VOTER`: continue the chain;
  - `MEMBERSHIP_UNAVAILABLE`: wait.
- It decides on the **committed** ConfState of P, read from `readStatus().confState` of P's replica on O. At ACTIVE and STOPPING, O hosts the target t, a voter.
  - The read goes through a **new named seam**: rebalancer → local replica handler (`getTrackedService`, `replica-handler-status-methods.js:95`) → `service.raft.readStatus().confState`. That is gap 1 in §2(f).
  - The test is `deriveRaftRsPeerId(s) ∈ voters ∪ votersOutgoing`.
- raft-rs changes `prs().conf()` **only** in `apply_conf_change`, which the application calls for a committed entry (raft-0.7.0 `raw_node.rs:394-399`, `raft.rs:2757-2769`). The runtime calls it only while applying committed entries (`raft-rs-runtime-owner.js:824-845`, from `applyEntries` `:847-866`). An applied ConfState is therefore committed membership.
  - A lagging follower can only show s still present: a safe WAIT, never an unsafe COMPLETE.
- The effective voter set is `voters ∪ voters_outgoing`. In a joint configuration the outgoing voters still vote, and `learners_next` are outgoing voters awaiting demotion (raft-0.7.0 `tracker.rs:40-88`). `learners` and non-members are not voters. `auto_leave` does not change who votes.
  - The binding exposes all five fields (`vendor/raft-rs-wasm/src/lib.rs:264-270, 1070-1086`).
- Every REPLACE terminal-success write goes through this decision:
  - A1 (the drain's CONVERGED);
  - A6 and A7 (retirement observed);
  - A8 (NOT_FOUND response);
  - A9 (executor outcome).
  - **A2 and A10 stop being success paths** (R-1c, R-1d).
- `completeOperation` keeps no hidden guard. The decision is the one path (R11). A REPLACE completion that arrives without a `SOURCE_RETIRED` verdict is a typed refusal, so a future bypass fails visibly.
- Only O decides a REPLACE's success. A remote drain that sees removal-confirmed evidence **wakes O** (the existing coordinator-created remote wake, `operation-workflow-owner-handoff-state.js:229-300`) instead of writing REMOVED.

**R-1b. The drain's "spread met" verdict becomes a hand-back.**
- New named drain state `SOURCE_RETIREMENT_OWNED`: completion accepted, REPLACE, source state REMOVAL_REQUIRED or REMOVAL_IN_FLIGHT. Its action is `NOOP` at the drain. Its owner action depends on the owner:
  - local owner: `ALLOW_RECONCILE` into `EXECUTE_ACTIVE_REPLACE` or `RECONCILE_STOPPING`, the owner's own path;
  - remote owner available: `WAKE_REMOTE_OWNER`;
  - remote owner unavailable: R-1c.
- The AVAILABLE completion verdict is only the **reason for the wake**. Remove safety still decides on AUTHORITATIVE evidence (H4, R10).

**R-1c. Owner unavailable: FAIL with the source retained, never COMPLETE.**
- The release row (`…-reconcile-shared.js:634-645`) maps to a failure with a named reason, `replace_owner_unavailable_source_retained`, instead of `COMPLETE_PRIORITY_RECOVERY_DRAIN`.
- The owner of an unsettled priority REPLACE is its target node (`replica-operation-repository-row-methods.js:173-199`). A dead owner therefore means the replacement voter is on a dead node too, so success would be doubly false.
- After FAILED, the REPLICA_FAILED branch (B3) removes the failed REPLACE's target and the planner re-plans. That is the existing contract for a failed REPLACE.
- **Precondition: H2's polarity** (S1). With `unavailable: true` for a live lease, R-1c would FAIL healthy, leased owners. The verdict must mean what its contract says:
  - a live lease means the owner is available and fenced, so it is woken;
  - a lease that is expired *and* a heuristic that says unready means unavailable, so R-1c applies.
- The other two consumers flip in the documented direction:
  - stale-FAIL (`recovery-drain.js:385-397`) no longer kills a leased owner's work;
  - re-entry (`operation-workflow-owner-priority-recovery-reentry.js:326-340`) wakes a leased owner.

**R-1d. A10: a REPLACE whose target reads REMOVED before ACTIVE fails. It never completes.**
- `status-reconcile.js:239-247` keeps completing a REMOVE. For a REPLACE it fails with a named reason, `replace_target_removed_before_active`. This closes CL-025 residual (g).

**R-1f. The REPLACE re-drives its own removal at STOPPING until committed.**
- At STOPPING the source's retirement has been issued: `REMOVE_REPLICA` was sent, and the source's row is REMOVING or gone. If `decideReplaceCompletion` still answers `SOURCE_STILL_VOTER`, the owner proposes `REMOVE_PEER{replicaIdentity: s}` through **its own** replica t's port.
  - t is a voter. A follower forwards the proposal to its known leader (raft.rs:2312-2322).
  - The proposal is re-issued level-triggered on the membership, leader and term events, and never faster than one attempt per leader term, until s leaves committed membership or the STOPPING budget ends.
- This makes the chain REPLACE-owned end to end, as constraint 2 requires, while the peers' row-driven proposals (H5) remain a harmless duplicate: raft-rs turns a second pending conf change into an empty entry (`raft.rs:2062-2090`).
- It overlaps with CA3 (the lost conf change) and with R2's future "one membership request owner" (`design-r2-committed-membership-2026-09-23.md`). **S2 decides the sequencing.**

**R-1e. Idempotence** (constraint 3).
- Every owner entry evaluates `decideReplaceCompletion` **first**:
  - `EXECUTE_ACTIVE_REPLACE`;
  - `RECONCILE_STOPPING`;
  - recovery;
  - the readiness, membership and remote wakes;
  - the timer;
  - the orphan sweep.
- If s is already out of committed membership, whether through an operator, a restart, a pre-repair state or a late commit, the owner neither evaluates removal nor issues it again. It goes straight to completion, after the existing target hand-off confirmation (`confirmActiveReplicaTerminalHandoff`, `status-reconcile.js:63-111`).
- This also covers A6's "ABSENT at ACTIVE". Row absence no longer decides; membership does.

### 3.2 R-1 continued: the source-removal effect and its revalidation (constraint 6)

- **The effect boundary is the `REMOVE_REPLICA` send** (`dispatch-response-reconcile.js:352-420`). The last await before it is `evaluateRemoveSafety` (`:261`), whose sub-reads each await.
- After that last await, and with **no await before `deliver`**, the owner re-checks synchronously:
  1. **REPLACE identity and revision.** A cache re-read of R (`getOperationByIdVisibilityObservation`, used the same way by the safety retry, `dispatch-rearm-evidence.js:525-547`) shows R non-terminal (`completedAt` null), still at ACTIVE, still locally owned, and with the same current step-entry timestamp the evaluation started from. That is the durable within-step revision; the CAS itself compares only `operation_id`, `workflow_step` and `completed_at` (§2(h)).
  2. **Committed membership** (`readStatus().confState` through the §2(f) seam. `readStatus` can wait on a drain, `raft-rs-runtime-owner.js:1041-1051`, so it is taken **first**, and items 1, 3 and 4 follow it with no further await). t ∈ `voters` and t ∉ `learners`. s ∈ `voters ∪ votersOutgoing`; otherwise go to R-1e.
  3. **Leader and transfer.** The local core's `term` equals the term the leader-safety evaluation observed. No unresolved handoff attempt exists for R (§3.4). The leader-safety verdict still holds for the current `lead`.
  4. **Target readiness and liveness.** The readiness owner's synchronous participation read for the target node is eligible (`getControlPlaneParticipationSync`, the one remove safety uses, `priority-publication-safety-rows.js:318-332`). A refresh-pending answer means **WAIT**, never permit (P2).
- Any mismatch leads to re-evaluation, not failure.
- The `REMOVE_REPLICA` request already carries `OPERATION_ID` (`dispatch-response-reconcile.js:407-420`). It should also carry the revision, so the source executor can refuse a request from a superseded evaluation. Whether the executor has any such check today is *unverified*; the challengers must confirm.
- Downstream of the send there is no further decision. The executor deletes the row, and the peers' `REMOVE_PEER` follows from that durable fact (H5). The REPLACE observes the result through R-1a.

### 3.3 R-2: level-triggered readiness wake, with no lost wake-up (constraint 4)

- **Subscription.** One subscription per workflow owner, installed at owner initialization and removed at shutdown (R13). It uses `controlPlaneReadinessService.subscribeReadinessPlanningSnapshots`, like `replica-dispatch-service-lifecycle.js:244-255`. It is permanent, so there is **no per-waiter subscribe race**.
- **Registration.** When remove safety answers DEFER, the owner records `waiters[operationId] = {nodes, observedIdentity}`:
  - `nodes` is every node whose participation read in this evaluation was ineligible. The evaluation context collects them. The conservative fallback is every node of P's critical replica rows.
  - `observedIdentity[node] = readPlanningProjectionIdentity(node)` (§2(d)), read **before** that node's participation read.
- **Recheck after registration.** Immediately after registering, re-read each node's identity. If any is `isPlanningIdentityCurrent` and not `planningIdentitiesEqual` to the observed one, the change happened between the read and the registration, so wake now.
  - This closes the "read not-ready → change → event → register → lost" race using the readiness owner's **existing** generation. There is no new event ledger.
- **Handler.** On a publication for `ownerKey ∈ nodes`, enqueue one coalesced `EXECUTE` for R in its single-flight lane, as the timer does (`dispatch-rearm-evidence.js:528-557`).
  - The event's snapshot is never read. The evaluation re-reads everything, so the event is a wake, never authority.
  - Dedupe per (operation, node) on `capturedToken.tokenKey`, as the dispatch service does (`replica-dispatch-service-lifecycle.js:257-273`).
- **Fallbacks, all unchanged.**
  - The 1000 ms timer (`scheduleDeferredSafetyRetry`).
  - The orphan backstop (§3.5).
  - A deferral whose cause is **not** readiness (a concurrent operation, a published-membership wait, a leader-ownership wait) is not registered with the readiness wake. It keeps its existing wakes: operation-row progress, the handoff attempt's resolution (§3.4), and the timer.

### 3.4 B5: handoff attempts with immutable identity, and no retarget while one is unresolved (constraint 7)

- **Identity, reusing existing namespaces:** `{operationId, attemptTerm, transfereeReplicaId}`.
  - `attemptTerm` is the raft term O's local core reports when the attempt is created (the port `status.term`, `vendor/raft-rs-wasm/src/lib.rs:703-707`).
  - The initiating configuration is the committed ConfState read in the same port call.
  - No new ID namespace.
- **One attempt record per REPLACE, not per leg.** Today there are two per-leg maps, `priorityPublicationLeaderHandoffEvidenceByOperationId` and `…ReplacementLeaderElectionEvidenceByOperationId` (`priority-publication-safety-topology.js:273-312, 524-588`). They collapse into one attempt record keyed by `operationId`, and the successor becomes a **field**, not part of the key.
  - H-A (most-caught-up), H-B (named T) and H-B′ (retarget Y) all become *kinds of attempt* chosen by the leader-safety snapshot. The snapshot remains the one decider (`priority-publication-leader-safety.js:136-619`).
- **Rule.** While R's attempt is unresolved, the leader-safety snapshot issues **no** handoff: not to the same successor, and not to a different one.
- **Resolution comes only from authoritative observations**, re-read level-triggered:
  1. O's local core reports `term > attemptTerm` (any new leader; success iff `lead` is the transferee);
  2. the attempt's own answer is a refusal (`not-leader`, `target-not-voter`, `no-known-leader`, `already-leader`);
  3. the transfer bound has elapsed with no term change. raft-rs aborts a transfer after the leader's `election_timeout` ticks (raft.rs:1097-1109), so the bound is the group's maximum window over its replica indices, taken from the timing authority (`recoveryRetryWindowMsOf`, `raft-rs-runtime-tuning.js:52-54`, applied per index by `replica-election-timeouts.js:22-49`).
- After resolution, the owner re-reads leader, membership and readiness, and only then decides whether to create a new attempt, possibly to a different successor.
- **Restart.** The attempt record is in memory, and the row carries no term (§2(h)). After an owner (re)start, the first attempt waits until a term change is observed or W_max has passed since the lane started. A transfer from before the restart therefore cannot be retargeted. The cost is latency after a restart only.
- **Late results.** A STEP_DOWN answer is applied only if its `{operationId, attemptTerm, transferee}` equals the current attempt. Otherwise it is dropped and counted. This needs the answer to carry the attempt identity: the request carries it, and the handler echoes it. An answer from attempt A therefore cannot complete or mutate attempt B.
- **Scope.** On system and priority partitions the REPLACE's leader-safety snapshot is the only handoff issuer while R is non-terminal:
  - the cure is `systemTable === false` only;
  - two REPLACEs on one priority partition are serialized (2(b)).
  - So the rule is complete for the REPLACE without touching the port.
  - The cure's X→T legs (H-C) are the same mechanism in a different owner. That is a finding for the cure's owner (R17), not absorbed here.
- **Rejected alternative, recorded.** Enforce "no retarget" at the leader's runtime turn by exposing raft-rs `lead_transferee` in the binding's `status` (one field, like `pending_conf_index` at `lib.rs:686`) and dropping any local or forwarded type-13 message whose transferee differs.
  - It is authoritative, and it covers every issuer.
  - But it changes the transfer semantics F1's oracle compares against raft-rs (retarget aborts and restarts), it needs a WASM fork rebuild, and it reaches beyond the owner's decision.
  - It is kept as S4, for the owner only if the challengers find a second issuer on priority partitions.

### 3.5 Liveness backstop that invokes the same owner (constraint 5)

| Wake | Fast or backstop | Invokes |
|---|---|---|
| Readiness publication (§3.3) | fast | `EXECUTE` in R's lane, then `EXECUTE_ACTIVE_REPLACE` |
| Membership change: the committed conf change applied on O. **Requires the new emit in `announce`** (§2(f) gap 2) | fast | R's lane, then `RECONCILE_STOPPING` (R-1a, R-1f) |
| Handoff attempt resolution (a leader or term event on O) | fast | R's lane, then the leader-safety re-decision |
| Existing row-progress re-entries (observed progress, executor outcome, membership-publication dispatch retry) | fast | same owner lifecycle |
| `scheduleDeferredSafetyRetry` 1000 ms | fallback | same |
| `checkTimeouts` on O (K1, 1000 ms) | backstop | Already re-enters `EXECUTE_ACTIVE_REPLACE` or `RECONCILE_STOPPING` for a local owner (§2(h)). Gains R-1e at entry |
| `reconcileOrphanedOperations` (`recovery-timeout.js:365-432`, K12 5000 ms) | backstop | `reconcileOperationLifecycle` in the op lane. Its gate **already admits** a deferring REPLACE, because its target reads ACTIVE (`:448-475`). No gate change is needed |
| Restart | backstop | The RECOVERY cause has no production caller (§2(h)), so a restart is healed by the two rows above. **Required change:** the STOPPING budget failure (`status-reconcile.js:647-685`) evaluates R-1e and R-1f first. A REPLACE whose source has left committed membership completes instead of failing, and one whose removal was lost is re-driven (S2) |
| Drain on a remote node | wake only | `WAKE_REMOTE_OWNER` (R-1b); R-1c only when the owner is truly unavailable |

What must be proved:
- **(a) Normal progress is not bounded by the 1000 ms cadence.** With controlled clocks:
  - a publication at t0 leads to evaluation at t0 (0 owner-clock ms);
  - SAFE leads to `REMOVE_REPLICA` in the same lane run;
  - the applied conf change leads to completion in the same wake.
- **(b) A missed event or a restart cannot strand R.**
  - Drop every event: R progresses at the fallback timer or the orphan pass.
  - Destroy the runtime at each durable phase (§4.4), then recover: R converges (P3).

### 3.6 F-b: no handoff after terminal (TC5)

- `dispatchRemoveSafetyHandoffRequest` (`priority-publication-handoff.js:225-285`) performs the same synchronous re-read as §3.2 item 1 **after** its last await and **before** `deliver`. If R is terminal, or its revision changed, the attempt is not created and nothing is sent.
- Together with R-1 (the remote drain no longer writes REMOVED), the only remaining cross-node terminal writers during an attempt are the FAIL paths (A3, A4, R-1c). This re-read covers them.

### 3.7 The planner and its scope (constraints 2 and 11)

- **Active REPLACE source → REPLACE owner. There is no planner change for this case.**
  - The structural guards in 2(b) already stop the planner planning the source, or the surplus, while R is non-terminal on priority partitions.
  - R-1 removes the only thing that let B2 act: a REMOVED REPLACE with a live source.
  - The planner may *wake* O through the existing membership-publication dispatch retry, but it never creates a REMOVE for the source.
- **Unrelated surplus → planner (B2, B3, B9), unchanged.** The split table and the ordinary-partition case are in §2(f).
- **Ordinary partitions: one scoped planner change** (§2(g), the uncovered case).
  - In the per-node excess computation (`move-planner-move-calculation-methods.js:505-620`), each non-terminal REPLACE on P in the remove-dispatch phase counts its **own source** as leaving.
  - The planner then sees no surplus attributable to R, and unrelated surplus still counts.
  - The input is the existing in-flight set (`getInFlightOperations`, `unified-rebalancer-replica-state.js:701-712`), not the topology-blocking set that excludes drain-phase REPLACEs.
  - It does not touch priority partitions, which are already held by the serial planner and the REMOVE lane.
- **Pre-repair terminal rows** (a REMOVED REPLACE whose source is still a voter) are not "active". They stay B2's (the restore helper) until they are gone. That is recorded; nothing is deleted in this quest.

### 3.8 Deletions and supersessions

- **Deleted:**
  - the `OWNER_UNAVAILABLE_RELEASED → COMPLETE_PRIORITY_RECOVERY_DRAIN` mapping (`…-reconcile-shared.js:336-339`), which becomes R-1c;
  - REPLACE completion at A10;
  - REPLACE completion on row evidence alone at A1, A6, A7, A8 and A9, which now go through R-1a;
  - the two per-leg handoff evidence maps, merged into one attempt record.
- **Superseded tests** (R09 record, never weakened):
  - `rebalance-coordinator-stopping-reconcile-cache-visibility.test.js:243-364, 366-488` (ACTIVE and SYNCING release to REMOVED). They become "the remote owner is woken; with an unavailable owner, FAILED, source retained".
  - `:490-612`: completion only once s leaves committed membership.
  - `operation-ownership-lease-fencing.test.js:318-323, 371-380` (S1).
- **Kept, with a recorded narrower duty:** `restoreLedgerSurplusDrainActiveVoters` and the "completed REPLACE can leave a 3-1" branch. Their only remaining REPLACE input is pre-repair rows.

### 2(f) The completion authority: committed Raft membership (owner constraint 1)

**raft-rs 0.7.0.** The crate is at `~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/raft-0.7.0`.

| Fact | Citation |
|---|---|
| ConfState has five fields: `voters`, `learners`, `voters_outgoing` (not empty means joint), `learners_next` (become learners on leaving joint), `auto_leave` | raft-proto `proto/eraftpb.proto:124-137`; tracker `tracker.rs:34-88`, `to_conf_state` `:159-167` |
| **The effective voter set is `voters ∪ voters_outgoing`.** `contains` checks both halves, commit is the minimum of both majorities, and a vote must win both | `quorum/joint.rs:47-51, 56-68, 82-90` |
| `learners_next` ⊆ `voters_outgoing`: still a voter until the joint config is left | `tracker.rs:40-81` |
| Proposing does not change the config. It only sets `pending_conf_index`; a second conf change while one is unapplied becomes an empty entry | `raft.rs:2062-2090, 205-216, 2742-2744` |
| Committing does not change it either. **Only `apply_conf_change`** (Changer → `prs.apply_conf` → `post_conf_change`) does, and the application calls it for committed entries | `raw_node.rs:394-399`; `raft.rs:2758-2770`; entries handed only up to `min(committed, persisted)`: `raft_log.rs:423-438`, `raw_node.rs:448-461` |
| The only other change is snapshot restore, using the snapshot's ConfState. An older snapshot is refused | `raft.rs:2564-2566, 2626-2633` |
| A committed removal is never rolled back. An uncommitted conf entry can be truncated, but it was never applied | Raft prefix property; application as above |
| A leader that removes itself does not step down | `raft.rs:2672-2684` |

**The binding and the runtime**
- `conf_state(handle)` returns `raft.prs().conf().to_conf_state()`, the **applied** config, with all five fields (`vendor/raft-rs-wasm/src/lib.rs:801-807, 1070-1086`).
- `status` carries no ConfState (`:683-724`).
- The runtime applies conf changes only for committed entries:
  - `resolveCommittedEntryConfState` (`raft-rs-runtime-owner.js:824-846`) runs `decode_conf_change_entry`, `apply_conf_change` and `set_conf_state`;
  - it is called from `applyEntries` (`:848-872`), which persists `putAppliedState(groupId, index, confState)` in the application transaction (`raft-rs-application-transaction-owner.js:39-65`).
- `readGroupObservation` (`:1004-1017`) reads `status` plus `conf_state`. `announce` records it on every completed drain (`:979-1000`, `:985-987`).
- The port's `readStatus()` (`raft-rs-operation-port.js:271`) returns `confState: {voters, learners, votersOutgoing, learnersNext, autoLeave}` (`raft-rs-status-observation.js:104-133`, `:127`).
  - Its `peers` list is built from `voters + learners` and **ignores `votersOutgoing`** (`:45-54`), so it is **not** the authority. Use `confState`.
- **Joint consensus.** The binding supports ConfChangeV2 with enter and leave joint (`lib.rs:272-308, 1045-1051, 769-774`).
  - Production builds `{transition: 0, changes: [one]}` (`raft-rs-operation-port.js:118-124`), which raft-proto treats as simple, not joint (`confchange.rs:134-141`). So `votersOutgoing` is empty in production.
  - The completion predicate must still use `voters ∪ votersOutgoing`, so that it stays right if joint changes appear.
- **Naming the source needs no reservation.** A raft peer id is a pure derivation of the replica identity: `deriveRaftRsPeerId(replicaIdentity)`, a sha256 digest (`src/raft/raft-rs-peer-identity.js:58`, properties at `:1-36`). The owner can therefore test `deriveRaftRsPeerId(s) ∈ voters ∪ votersOutgoing` even after s's reservation or row is gone.

**The completion authority, precisely.**
- s is still a voter iff `deriveRaftRsPeerId(s) ∈ confState.voters ∪ confState.votersOutgoing` in the applied ConfState of a live replica of P.
- The test is one-sided:
  - "absent" on any replica proves the removal committed (prefix property);
  - "present" on a lagging replica proves nothing, and means WAIT.
- It does **not** mean the rows, the cache, placement intent, readiness, the row's desired state, or a predicted ConfChange result. Today's completion evidence is none of these either: it is services rows only (`observeStoppingReplicaProgress`, `operation-workflow-recovery-observation.js:573-610`).
- The contract is **not** strengthened to "the source must not exist". A source replica whose lifecycle is still running but which is out of committed membership satisfies C1.

**Gaps that R-1a must close. These are new owner interactions (§6).**
1. **No read path.**
   - `src/rebalancer` reads no ConfState anywhere, and has no access to local partition services (grep: no `readStatus`, `confState`, `getTrackedService`).
   - The accessor exists on the replica handler (`src/node/replica-handler-status-methods.js:95`).
   - A named read seam is needed: rebalancer → local replica handler → `service.raft.readStatus().confState`, for P's local replica on O.
   - This is the authority named by the R2 design (`design-r2-committed-membership-2026-09-23.md:192-195`). R2's generation, conf index and request owner are **not** in src at this head.
2. **No membership event.**
   - The port events are LEADER, FOLLOWER, CANDIDATE, COMMIT, LEADER_CHANGE, TERM_CHANGE and COMMITTED_PREFIX_DIVERGENCE (`raft-rs-operation-port.js:35-46, 225-239`).
   - The runtime emits only role, term and leader changes from `announce` (`raft-rs-runtime-owner.js:988-999`). COMMIT is never emitted on rs-raft.
   - `announce` already has the old and new observation in hand, so a membership-changed emit belongs there: compare ConfStates, and emit through the same port seam.
3. **Removal commit is not signalled, and can be lost.**
   - Every peer proposes `REMOVE_PEER` on the row delete and discards the result (`partition-service-raft-peer-cache-reconciliation.js:175-184`). The source never proposes its own (`:208-210`).
   - If the source is leader when its executor retires its lifecycle, which happens before the row delete (`replica-handler-remove-execution-methods.js:201-206`), the forwarded proposals reach a refused core and nothing re-proposes. The source can then stay in committed `voters` indefinitely.
   - That is the CA3 lost-conf-change class (excluded). But under C1 the REPLACE would then wait at STOPPING until its 60 000 ms budget, and fail. See S2.

---

## 4. Phase 2: the coverage model, as the REPLACE state machine (owner constraint 8)

The owner asked for a state machine, not a Cartesian product. Pairs are added only where two dimensions interact semantically (§4.6).

### 4.1 Authoritative enumerations the evidence imports (Phase 5)

Never copy these as literals. A test fails when a member appears that is not classified.

| Universe | Authority |
|---|---|
| Workflow steps | `WORKFLOW_STEP`, `src/constants/workflow.js:1-10` |
| Lifecycle actions | `OPERATION_LIFECYCLE_ACTION`, `operation-workflow-owner-shared.js:279-290` |
| Drain states (plus the new `SOURCE_RETIREMENT_OWNED`) | `PRIORITY_RECOVERY_OPERATION_DRAIN_STATE`, `…-reconcile-shared.js:261-276` |
| Drain owner states and actions | `…-reconcile-shared.js:589-626` |
| Remove-safety classification | `REMOVE_SAFETY_EVALUATION_CLASSIFICATION`, `owner-shared.js:293-297` |
| Leader-safety states | `PRIORITY_PUBLICATION_LEADER_REMOVE_SAFETY_STATE`, `owner-shared.js:371-381` |
| STEP_DOWN and REMOVE answers | `ReplicaOperationResponseStatus`, `replica-operation-constants.js:37` |
| Transfer answers | `RAFT_LEADERSHIP_TRANSFER_REASON`, `raft-operation-port-constants.js:75-88` |
| Port events (plus the new membership event) | `RAFT_EVENT`, `raft-operation-port-constants.js:1-10` |
| Owner-availability verdicts | `OPERATION_DRAIN_OWNER_AVAILABILITY`, `operation-owner-availability-policy.js:28-33` |
| ConfState fields | binding `JsConfStateOut`, `lib.rs:264-270` |

### 4.2 States

| State | Durable? | Meaning |
|---|---|---|
| PENDING … SYNCING | row step | Target being created and synced. Out of scope except A10 |
| ACTIVE / TARGET_SAFETY_PENDING | row ACTIVE; sub-state in memory | Remove safety DEFER; at least one wake armed |
| ACTIVE / HANDOFF_ATTEMPT_UNRESOLVED | row ACTIVE; attempt in memory | An attempt `{opId, attemptTerm, transferee}` has been sent and is not resolved |
| ACTIVE / SAFE_REVALIDATING | transient in the lane | Between SAFE and the `REMOVE_REPLICA` send. No await after the revalidation |
| STOPPING / REMOVAL_ISSUED | row STOPPING | `REMOVE_REPLICA` accepted; the source row is REMOVING |
| STOPPING / AWAITING_COMMITTED_MEMBERSHIP | row STOPPING | The source row is gone; s ∈ committed voters; R-1f re-drive armed |
| REMOVED | terminal | Success. **Only through edges T6 and T8** |
| FAILED(reason) | terminal | Failure; reason from the named set |

### 4.3 Legal transitions: preconditions and postconditions

| Edge | From → to | Precondition (authoritative) | Postcondition |
|---|---|---|---|
| T1 | SYNCING → ACTIVE | Target observed ACTIVE (existing `reconcileReplaceActualActive`) | t is in placement; no removal issued |
| T2 | ACTIVE → TARGET_SAFETY_PENDING | Remove safety DEFER on AUTHORITATIVE evidence | No removal and no completion. At least one wake armed (readiness waiter with recheck, timer, orphan backstop) |
| T3 | ACTIVE → HANDOFF_ATTEMPT_UNRESOLVED | Leader safety asks for a handoff, **and no unresolved attempt exists** | Exactly one STEP_DOWN sent, with an immutable identity; R re-read at effect (TC5) |
| T4 | HANDOFF_ATTEMPT_UNRESOLVED → ACTIVE | Resolution: term > attemptTerm, a refusal, or the bound W elapsed | Attempt terminal; the next decision re-reads leader, membership and readiness |
| T5 | SAFE_REVALIDATING → STOPPING / REMOVAL_ISSUED | SAFE, and all four revalidations of §3.2 pass after the last await | One `REMOVE_REPLICA` for s, issued by R |
| T6 | ACTIVE → REMOVED | s ∉ committed voters at entry (R-1e); target hand-off confirmed | **P1** |
| T7 | AWAITING_COMMITTED_MEMBERSHIP → itself | s ∈ committed voters; the source row is gone; no proposal yet in this leader term | One `REMOVE_PEER{s}` through t's port (R-1f) |
| T8 | STOPPING → REMOVED | s ∉ committed voters | **P1** |
| T9 | ACTIVE or STOPPING → FAILED | Step budget (A5), **with R-1e evaluated first**; R-1c; remove-safety FAIL; handoff NOT_FOUND policy; STOPPING starvation | Never REMOVED. At ACTIVE, s is untouched |
| T10 | pre-ACTIVE → FAILED | Superseded target (A3, A11); **target REMOVED (R-1d)** | Never REMOVED |

**Complete edges:** T6 and T8 only. Every other route to REMOVED is deleted (§3.8).

### 4.4 Async resume edges

Each must decide on the current authoritative state.

| Resume | Where it lands | What it must re-read first |
|---|---|---|
| E1: after each await inside `evaluateRemoveSafety` | T5 revalidation | R's row revision, ConfState, term and attempt, and target participation (§3.2) |
| E2: readiness publication | Waiter, then `EXECUTE` | Everything (the event carries no authority) |
| E3: safety timer (1000) | `EXECUTE` | R non-terminal, owned, retryable (existing), then R-1e |
| E4: orphan sweep | `reconcileOperationLifecycle` | R-1e, then the phase |
| E5: restart, healed by `checkTimeouts` and the orphan sweep (the RECOVERY cause is not wired, §2(h)) | `EXECUTE_ACTIVE_REPLACE` / `RECONCILE_STOPPING` | R-1e, then the phase. The in-memory attempt record is empty (§3.4 restart rule) |
| E6: remote wake (drain hand-back, membership-publication dispatch retry, coordinator-created retry) | The owner's dispatch ingress | Same as E4 |
| E7: late STEP_DOWN answer | Attempt record | Identity equality, otherwise dropped |
| E8: membership, leader or term event on O | T4, T7, T8 | ConfState and status |
| E9: executor outcome `REPLICA_REMOVE_COMPLETED` | R-1a (no longer completes on its own) | ConfState |
| E10: `REMOVE_REPLICA` answer (INITIATED, IN_PROGRESS, NOT_FOUND, COMPLETED) | STOPPING / R-1a | ConfState (NOT_FOUND no longer completes on its own) |

### 4.5 Competing-authority edges

Each must converge on the same owner.

| Competitor | Today | Required |
|---|---|---|
| X1: remote drain sweep | A2 COMPLETE | Wake the owner (R-1b), or R-1c FAIL. Never REMOVED |
| X2: planner check during every phase | Serial hold, `hasPendingMove`, creation refusals (2(b)); B2 after A2 | Plans nothing on s while R is non-terminal. Unrelated surplus stays its own |
| X3: peers' row-driven `REMOVE_PEER` | Fire-and-forget duplicates | Harmless duplicate of T7; convergence is observed through ConfState |
| X4: readiness rebuild and publication | Placeholder answers | A wake only (E2) |
| X5: other handoff issuers | None on priority partitions; the cure on user tables | Structural: R's snapshot is the only issuer on P while R is non-terminal |
| X6: timeout reaper | A5 FAIL | R-1e first |
| X7: source-node restart recovery (B7) | Completes local STOPPING row deletes | Unchanged; observed through ConfState |
| X8: operator or out-of-band membership change | – | R-1e |

### 4.6 Inputs (state, including cached) and the pairwise interactions kept

**Inputs**
- I1: readiness participation per node. Current, or the refresh-pending placeholder. Carries a per-node identity.
- I2: committed ConfState on O. Applied; may lag; may be the recorded observation.
- I3: R's row. Cache or authoritative; carries a revision.
- I4: source and target services rows. The authoritative-over-cache merge (F-c).
- I5: leader and term from O's core, plus the partition row's `leader_node_id` projection.
- I6: the attempt record. In memory, lost on restart; bounded by W.
- I7: the owner lease and the routing heuristic (S1).
- I8: AVAILABLE versus AUTHORITATIVE planning snapshots.
- I9: armed timers and waiters.
- I10: the core's `lead_transferee`. Hidden; bounded through W.

**Pairs kept (semantic interaction only)**

| Pair | Why it interacts |
|---|---|
| E2 × E1 | Publication while the evaluation is mid-await: the lost wake-up (§3.3) |
| X1 × T2 | The Path 2 race: drain sweep against the owner's deferral |
| E8 (commit) × X6 (STOPPING budget) | Complete against fail at the budget edge |
| T3/T4 × a leader change not initiated by R | Attempt resolution by a foreign election |
| E7 × T3 | A late answer from attempt A arriving after attempt B started |
| E5 × every durable phase | P3 |
| I7: lease expiry × heuristic unready | R-1c versus a wake |
| X2 × every phase | Planner interference |
| E9/E10 × T7 | An executor or answer claims done while ConfState still holds s (R-1f) |

**Temporal classes** (as F1):
1. pending before the decision;
2. processed just before it;
3. arriving mid-decision (during `evaluateRemoveSafety`'s awaits; none can arrive inside the revalidation, by construction);
4. a timeout crossed (§5 boundaries).

### 4.7 Class-level properties, relational oracle and anchors (owner constraint 9)

**P1: completion implication.**
- For every write of REMOVED on a REPLACE, at the write instant, `deriveRaftRsPeerId(s) ∉ voters ∪ votersOutgoing` in the applied ConfState of a live replica of P.
- The oracle is the raft-rs ConfState, never rows.
- Ranges over T6, T8, and every deleted edge (A1, A2, A6-A10), where it is expected red on the old code.

**P2: scheduling equivalence, as a refinement.**
- For each relevant pending event — a readiness publication, a conf change applied, a leader or term change, a STEP_DOWN answer, a source row delete — compare "decide with the event pending" against "process the event, then decide".
- Compared over the full output: terminal outcome, issued removals and their authority, handoff attempts and their identities.
- The two are equal, or "decide first" is **WAIT** and "process first" is a safe progress. Stale input may defer; it never permits a removal or a completion that "process first" would refuse.

**P3: recovery equivalence.**
- For each durable phase — ACTIVE deferring; ACTIVE with an attempt unresolved; STOPPING before the row delete; STOPPING with the row gone and the conf change uncommitted; STOPPING with the conf change committed but the terminal unwritten — compare "continue" against "persist, destroy the runtime, recreate, recover, continue".
- Both must reach the same final committed ConfState and the same terminal outcome. That needs the §3.5 restart change (R-1e and R-1f before the STOPPING budget) and R-1f (S2).

**Latency at the causal boundary.** With injected owner clocks and controlled events, measure owner-clock ms from "all prerequisites true" to the effect:
- publication to evaluation;
- SAFE to `REMOVE_REPLICA`;
- commit to completion.

All must be 0 ms (the same lane run). The SLO test is end-to-end confirmation only.

**Direct anchors** (against a bug common to both sides of P2):
- AN1: the finding's W1 fixture (Path 2). R is never REMOVED while s is in ConfState, and there is no B2 REMOVE for that surplus.
- AN2: the owner-availability truth table (§0 H2) under the corrected contract.
- AN3: A10. The target reads REMOVED before ACTIVE, and R ends FAILED.
- AN4: an attempt-A answer that arrives after attempt B has no effect on B.
- AN5: the lost wake-up. The publication lands between the read and the registration, and R wakes at registration.
- AN6: a leader source whose peers' `REMOVE_PEER` is lost. R-1f re-drives it and R completes.
- AN7: a restart at "STOPPING, row gone, uncommitted". R completes (§3.5, R-1e and R-1f).
- AN8: the handoff effect re-read (F-b). The drain makes R terminal mid-evaluation, and no STEP_DOWN is sent.

### 4.8 Mutation families, one per semantic dimension (Phase 7)

| Family | Mutation | Expected red |
|---|---|---|
| M1 | Close before removal: complete on row evidence, on the AVAILABLE verdict, or on release → COMPLETE | P1, AN1 |
| M2 | Membership predicate ignores `votersOutgoing`, or uses `peers` or rows | P1 (joint fixture), AN6 |
| M3 | A stale readiness placeholder is treated as eligible | P2 |
| M4 | Lost wake-up: registration without a recheck, or the identity read after the value | AN5, latency |
| M5 | An await between revalidation and send, or revalidation skipped | P2 (E1 pairs) |
| M6 | Retarget allowed: per-leg keys, successor in the key | T3 precondition, B5 cells |
| M7 | A late answer applied to the current attempt | AN4 |
| M8 | Handoff sent after terminal | AN8 |
| M9 | Lease polarity reinverted | AN2, X1 × T2 |
| M10 | The planner removes an active REPLACE's source, or plans the surplus while R is non-terminal | X2 × phase |
| M11 | Destructive STOPPING recovery, or recovery skipping R-1e | P3, AN7 |
| M12 | Timer-only progress (the subscription or the membership event absent) | Latency boundary |
| M13 | No removal re-drive (R-1f absent) under a lost conf change | AN6 |
| M14 | A non-owner node writes REMOVED | P1 ranging over X1 |

---

## 5. Phase 6: timing arithmetic

### 5.1 Constants

| # | Constant | Value | file:line |
|---|---|---|---|
| K1 | Drain sweep (`checkTimeouts`), then the orphan pass | 1000 ms interval, skipped while one is in flight, so the effective period is max(1000, sweep duration) | `rebalancer-constants.js:97`; `rebalance-coordinator-lifecycle.js:657-680` (in-flight skip at `:663-664`) |
| K2 | Remove-safety fallback retry | 1000 ms; one timer per operation, reused | `operation-workflow-owner-shared.js:339`; `operation-workflow-dispatch-rearm-evidence.js:494-590` (`:499-501`) |
| K3 | Priority active-REPLACE resume | 250 ms, suppressed while K2 is armed | `owner-shared.js:341`; `dispatch-response-reconcile.js:663-700` (`:671`) |
| K4 | Observed-progress retry | 250 ms | `owner-shared.js:340` |
| K5 | `checkRebalance` minimum interval | 1000 ms priority, 5000 ms other. A refused wake reschedules at `max(1000, remaining)` | `rebalancer-planning-gate-methods.js:716-734` (`:722-724`), `scheduleNextCheck` `:42-66` (floor `:52-57`) |
| K5′ | Periodic check | 60000 ± 10000 by default; the SLO test uses 4000 ± 500. `setLeader(true)` enqueues an immediate check on a priority partition | `rebalancer-constants.js:100-101`; `node-join-convergence-slo.integration.test.js:449-453`; `unified-rebalancer-lifecycle-base.js:599-607` |
| K6 | Handoff re-request suppression; evidence staleness | 5000 ms; 60000 ms | `owner-shared.js:388-389`; the cure's own 5000 at `user-table-leader-placement-cure.js:78-79` |
| K7 | Transfer window W = electionTick × tickMs | Production 1000/3500/6000/8500 at leader index 0/1/2/3; SLO test 300/2800/5300/7800; hash-fallback index up to about 31000 | `raft-rs-runtime-tuning.js:14-54`; `replica-election-timeouts.js:22-49`; static investigation §3.1 |
| K8 | STEP_DOWN deliver timeout | 5000 ms (`messageTimeoutMs`) | `src/constants/transport.js:74`; static investigation §3.6 |
| K9 | Readiness refresh | A macrotask build drain (`setImmediate`); build-failure retry 1000 ms. Measured per-node return to current: 100-300 ms (finding §2c) | `readiness-planning-version-contract.js:123, 173-175`; `readiness-planning-snapshot-owner.js:134-135` |
| K9′ | Ready lease and heartbeat | 15000 ms / 5000 ms | `src/constants/time.js:5-6` |
| K10 | Owner lease TTL | 30000 ms after the row's `updatedAt` | `replica-operation-owner-lease.js:41, 138-144` |
| K11 | Step budgets | ACTIVE → `pendingTimeoutMs` 30000; STOPPING → `removingTimeoutMs` 60000 | `rebalancer-constants.js:86, 89`; `status-reconcile.js:456-481` |
| K12 | Orphan backstop throttle | 5000 ms; acts only on actionable truth or past the step budget | `rebalance-coordinator-shared.js:179`; `recovery-timeout.js:365-377, 435-475` |
| K13 | SLO acceptance (external) | 2000 ms over-target | `node-join-convergence-slo.integration.test.js:48` |

### 5.2 Relationships and statically derived boundary cases

| # | Relationship | Today | Under this design |
|---|---|---|---|
| T-1 | K1 (drain, ≥ 1000) against the first SAFE on Path 1 (F1: 202-1097 ms after ACTIVE, median 596) | Same order of magnitude, so they race. The drain wins 3/39 on F1 (Path 2, all red) | The drain can only wake (R-1b). The race no longer changes the outcome (P2 pair X1 × T2) |
| T-2 | Publication spacing (per node about 100-300 ms) against K2 = 1000 against evaluation duration (measured up to 856-999 ms, finding §2b) | Re-evaluation roughly every 1000 ms, or on incidental row progress. The two-node conjunction is sampled rarely | Re-evaluation at each publication for a dependency node. **Coalesced**: at most one evaluation in flight plus one queued per operation, so the load is bounded (R12) even when the evaluation is slower than the publications |
| T-3 | K5 (1000 floor after the F1-moved leader's start check) | The whole Path 2 regression: 733-1118 ms (finding §2b table) | Off the critical path: the planner never removes an active REPLACE's source |
| T-4 | K6 = 5000 against W(2) = 6000 and W(3) = 8500 | A re-request lands inside the window; alternating successors reset it (B5, X5) | No new attempt until resolution (term change, refusal, or W_max). No crossing |
| T-5 | K8 = 5000 against a queue wait of up to 120000 (persistence admission) | A timed-out STEP_DOWN records nothing, so it is re-issued at the next evaluation (≤ 1000 ms), possibly to another successor | A timeout does **not** resolve the attempt. It stays unresolved until term change or W_max; no retarget |
| T-6 | Deferral duration against K11 ACTIVE = 30000 | ACTIVE never reaches its budget check (§2(h)). In practice A2 was the only bound | **No bound at ACTIVE** once A2 is gone. A legitimate wait for safety can last indefinitely while holding the ledger interlock. The drain's CL-043 exclusion treats R as "stale" after 30000 for other operations' concurrency gate. S9 |
| T-7 | Conf-change commit against K11 STOPPING = 60000 | Completion on row absence (A7) ignores the commit | Without R-1f, a lost conf change (CA3) ends FAILED at 60000, and B3 removes the target while s may still be a committed voter. **Quorum hazard:** {r1, s (lifecycle retired), t} minus t leaves one live voter of two. R-1a must not land without R-1f, or S2's alternative |
| T-8 | K10 = 30000 against K11 ACTIVE = 30000 (both anchored at the last persist or the step entry) | – | Live owner: its own T9 at 30000. Dead owner: lease expiry at ≥ 30000 after its last persist, then R-1c at the next K1. Equal constants; the order depends on re-persists (CL-044 notes the dispatch retry re-persists `updatedAt`) |
| T-9 | W(0) = 1000 against K2 = 1000 and K5 = 1000 (production index 0) | The fallback evaluation lands inside the transfer window; a removal proposed then is dropped (F1 D4) | The revalidation's "no unresolved attempt" check blocks T5 inside the window. The peers' `REMOVE_PEER` dropped by a foreign window is re-driven by R-1f |
| T-10 | K9 build failure → no publication | – | K2 fallback covers it |
| T-11 | K1 = 1000 and K12 = 5000 backstops against a lost wake after restart | Both already re-enter a deferring REPLACE on its owner (§2(h)) | Worst case after a total loss of events and timers: ≤ K1 (plus sweep duration), and ≤ K12 if `checkTimeouts` is deferred on visibility |
| T-12 | K13 = 2000 against Path 1 on F1 (766-1361 ms, median 1059) | Path 2 is 2353-2719 ms, red | Path 2 no longer exists. The over-target window closes at the source's row delete after T5 (the test counts rows, `node-join-convergence-slo.integration.test.js:203-241`). This is confirmation only, not the proof |

---

## 6. Risks and stop conditions

Items that need the owner are marked **DECISION**. Everything else is autonomous under the 2026-09-25 decision.

- **S1. DECISION: owner-availability polarity** (`operation-owner-availability-policy.js:91-102`).
  - R-1c needs "a live lease means available (fenced)". The sealed quest `operation-ownership-lease-fencing` (`c0c73cb06`) ships `unavailable: true` and pins it in `operation-ownership-lease-fencing.test.js:318-323, 371-380`. The module's own contract (`:7-15`) and all three consumers' comments say the opposite.
  - Fixing it is an R09 supersession of a sealed record. It changes three consumers (release, stale-FAIL, re-entry) in the documented direction.
  - Without it, R-1c would FAIL healthy leased owners.
- **S2. DECISION: who re-drives an uncommitted source removal** (R-1f versus CA3 versus R2).
  - C1, measured against committed membership, turns a lost `REMOVE_PEER` (fire-and-forget, `partition-service-raft-peer-cache-reconciliation.js:175-184`; lost when the source leads) into a STOPPING wait.
  - Without a re-driver, T-7 is a quorum hazard.
  - The options:
    - (a) R-1f in this quest: the REPLACE proposes through its own target replica;
    - (b) land CA3's fix first;
    - (c) the STOPPING budget for a REPLACE holds instead of failing until membership resolves.
  - The design recommends (a). It overlaps R2's planned single membership request owner (`design-r2-committed-membership-2026-09-23.md`), which does not exist in src.
- **S3. Restart semantics: not a decision, but recorded.**
  - The destructive `FAIL_STOPPING_RECOVERY` / `FAIL_PRE_SYNC_RECOVERY` mapping (`recovery-timeout.js:523-529`) belongs to a RECOVERY cause with **no production caller** (§2(h)).
  - The live restart path is `checkTimeouts` plus the orphan sweep. The STOPPING-budget change of §3.5 lives inside the REPLACE's own chain (R-1e first), so it is within the owner's decision.
  - If the lead wants `handleRecovery` wired, that is a separate contract, and then a DECISION.
- **S4. Scope only (not blocking): B5 beyond the REPLACE.**
  - The issuer-side attempt rule (§3.4) is complete for REPLACE handoffs on priority and system partitions.
  - The cure's X→T legs (H-C, user tables) keep their behaviour and are recorded as a finding for the cure's owner.
  - The port-level alternative (expose `lead_transferee`, refuse or drop a retarget at the leader) changes the transfer semantics F1's oracle compares against raft-rs, and needs a WASM fork rebuild. It needs the owner only if the owner wants B5 cluster-wide.
- **S5. New owner interactions** (R02: each needs a `coupledPairs` entry and witness, `test/shards/impact-contracts.json`):
  1. rebalancer → local replica handler → `readStatus().confState` (§2(f) gap 1);
  2. a membership-changed event from `announce` through the port seam (§2(f) gap 2). This **extends the PR #46 operation port's event set**, and the owner should confirm it keeps the seam authoritative;
  3. the STEP_DOWN request and answer carry the attempt identity;
  4. `REMOVE_REPLICA` carries the operation revision.
  - None changes a product contract. Item 2 touches the port contract, so it is **DECISION-adjacent**: confirm it.
- **S6. Visible behaviour consequences** (not contract changes; the wide net must cover them):
  - the ledger self-move interlock is held through STOPPING (2(c));
  - the add-like and REMOVE lanes reopen later;
  - distributed-harness quiescence waits longer;
  - an ACTIVE REPLACE is no longer closed early by the drain, so it waits for remove safety (T-6, S9);
  - on ordinary partitions the planner's excess no longer counts an active REPLACE's surplus (§3.7);
  - the planner's formation-convergence fix `a8f546c34` loses its REPLACE input.
  - Per the join-core coupling directive, the formation lanes (multi-join, seven-node) and the pair witnesses belong in the wide net.
- **S7. Superseded tests (R09, within the owner's decision; not a stop):**
  - `rebalance-coordinator-stopping-reconcile-cache-visibility.test.js:243-364, 366-488, 490-612`;
  - `operation-workflow-progress-event-driven-reentry.test.js:2550-2620`, only if the guard lands inside the drain function.
- **S8. Entity types.**
  - C1's committed-membership authority exists only for raft-backed entities (partitions).
  - Runtime-service and message-group REPLACEs have separate safety owners (`remove-safety-evaluator.js:508-514`). They keep their row-based completion. That is an explicit exclusion, not a silent one.
- **S9. DECISION: an ACTIVE REPLACE is unbounded once A2 is gone.**
  - `EXECUTE_ACTIVE_REPLACE` answers "progressed", so the 30000 ms ACTIVE budget is never enforced (§2(h)). The drain's A2 release was the de facto bound.
  - Under this design a REPLACE may wait for remove safety indefinitely. That is safe, but it holds the ledger self-move interlock and the REMOVE and add-like lanes.
  - The options:
    - (a) accept it, and make it observable;
    - (b) enforce an ACTIVE budget as FAILED(source retained), after which B3 removes the target and the planner re-plans. That is new terminal behaviour at ACTIVE.
- **S10. Scope question for the lead: pre-repair ghost rows.**
  - A REMOVED REPLACE whose source is still a voter can no longer be created (P1).
  - Existing rows remain uncovered outside the ledger partitions: `getCurrentReplicas` hides the source (§2(g)).
  - The systemic fix is for the planner's retirement projection (`unified-rebalancer-replica-state.js:584-616`) to retire a replica only when it is also out of committed membership: consume the authority rather than terminal history (R03). That uses the same read seam, from the partition leader where the planner runs.
  - That widens scope into the planner's replica view.
- **Stop.** If the challengers find a second handoff issuer on priority partitions, or a planner path other than the per-node excess of §2(g) that plans against an active REPLACE's surplus, the model is missing a dimension. Amend it before the evidence author starts.
- **Out of scope, recorded (R17):**
  - F-c (the authoritative-over-cache merge, `priority-publication-safety-rows.js:30-66`);
  - F-d (the readiness refresh-pending rate);
  - CA3 (except as S2);
  - the pre-turn projection readers;
  - the cure's retarget (H-C);
  - the follow-on hazard that r2 stays "retired" in the planner view after a pre-repair A2 (*unverified*).
- **Nothing here** justifies raising the 2000 ms budget, retrying the SLO test, or adding waits.

---

## 7. Trace of the owner's binding constraints (2026-09-25)

| # | Constraint | Where it is met |
|---|---|---|
| 1 | Completion against committed Raft membership, including joint parts; exact ConfState fields | §2(f) (raft-rs semantics, binding fields, `deriveRaftRsPeerId`), R-1a, P1. The contract is not strengthened to "the source must not exist" |
| 2 | The REPLACE owns the whole causal chain; the planner never creates a REMOVE for an active REPLACE's source | §3 principle, R-1b, R-1f, §2(g) split, §3.7 |
| 3 | Idempotent if reality gets there first | R-1e, applied at every owner entry (§4.4) |
| 4 | Readiness events are level-triggered wakes, with no lost wake-up and an existing generation | §2(d) generations, §3.3 (permanent subscription, identity read before the value, recheck after registration) |
| 5 | Survive restart and missed events; a low-frequency backstop invoking the same owner | §2(h), §3.5, T-11, P3 |
| 6 | Revalidate at the effect boundary | §3.2 (four checks after the last await), TC5, E1, M5 |
| 7 | A handoff is an attempt with immutable identity; no retarget; late results isolated | §3.4 (identity `{operationId, attemptTerm, transferee}`, one record per REPLACE, the resolution sources, the restart rule, late-result drop) |
| 8 | A state machine, not a Cartesian product | §4.2-§4.6 |
| 9 | P1, P2 and P3 plus anchors | §4.7 |
| 10 | Challenger scenarios | Each maps to a model cell. Target ready before registration: E2 × E1. Target unready after SAFE: §3.2 check 4. Source, target or third-party leader: T3/T4 and leader safety. A foreign leader change: T4 resolution (1). Delayed transfer callback: E7. A failed transfer with a new leader: T4 (1) and (2). Commit with delayed delivery: E8/E9 × T7. Source already removed: R-1e. Restart before or after the removal proposal: P3 phases. Planner sweep in each phase: X2 × phase. Stale readiness: I1 and P2. Joint configuration: the predicate uses `voters ∪ votersOutgoing` (production is simple-only, §2(f)). Duplicate wakes: coalescing (§3.3) and single-flight lanes |
| 11 | Planner suppression scoped to an active REPLACE's source | §2(g) (the ordinary-partition overlap found), §3.7 (only R's own unit of surplus) |
| 12 | Latency measured at the causal boundary | §4.7 latency, K/T tables in §5, M12 |
| 13 | The acceptance gate runs once | Process note: the evidence and verifier findings close before one A2 run on seed parity + F1 + REPLACE. An A2 failure is classified before acting (mechanism, known, newly exposed, or infrastructure with evidence) |
| 14 | Completion criteria | Every COMPLETE edge: T6/T8 and P1. One remover: B1 and §2(g). No planner race: §3.7 and M10. Effect-boundary revalidation: §3.2. Readiness never the sole cause: §3.3 and §3.5. Restart recovers a pending removal: §3.5 and P3. No mid-attempt retarget: §3.4 and M6. A stale answer cannot affect a later attempt: AN4 and M7. An already-removed source: R-1e. Event-driven removal: the latency proof. Generic planner intact: §2(b) verdict |

**Items that go back to the owner** (§6):
- S1: the lease polarity; a sealed contract.
- S2: who re-drives an uncommitted removal (R-1f versus CA3/R2).
- S5 item 2: extending the port's event set.
- S9: whether an ACTIVE REPLACE gets a bound.
- S10 (scope, for the lead): pre-repair ghost rows.

Everything else proceeds under the 2026-09-25 decision.
