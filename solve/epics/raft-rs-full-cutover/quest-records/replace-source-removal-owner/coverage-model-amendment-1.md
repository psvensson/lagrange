# Coverage model amendment 1: completing the REPLACE design (2026-09-25)

This is the completion plan for the approved REPLACE source-removal design. Inputs:
- the owner directive (`owner-directive-complete-replace-2026-09-25.md`, binding: the full design is completed in this quest);
- challengers A (A1-A17) and B (BR1-BR17);
- the lease-verdict scope record, its verification round 1, and the A2 result;
- the design `design-replace-source-removal-owner-2026-09-25.md`, including §8 (owner decisions S1, S2, S5.2, S9; lead decisions S10, S4);
- the owner constraints.

**Conditions**
- Worktree `replace-owner` at head 70d8e3fcb. This record is read-only for `src/`.
- Line numbers are at HEAD. The R-2 implementer's uncommitted edits shift `operation-workflow-dispatch-response-reconcile.js` by about 7-12 lines. R-2's new module is `src/rebalancer/operation-workflow-remove-safety-readiness-wake.js`, uncommitted and in progress.
- R-2 is not re-planned here. It appears only where it composes with the checklist items (§2.0).

**Contents**
- §0 the owner decisions this record asks for.
- §1 the disposition of every finding.
- §2 the implementation order.
- §3 the evidence plan.
- §4 which approved evidence is touched.

---

## 0. The (d) list: true contract decisions for the owner

Two items. Everything else resolves at lead level or under an existing decision (§1).

### D1. The REPLACE target starts with a ConfState that is a prediction excluding the source (A2)

**Fact**
- A REPLACE's target replica t is created with `excludeReplicaIds: [sourceReplicaId]` (`rebalance-coordinator-operation-creation.js:748-760`).
- That list becomes t's raft bootstrap voters (`raft-rs-operation-port.js:138-140`; `createNodeArguments`, `raft-rs-runtime-owner.js:403-423`), persisted as the applied state at index 0 (`:433-443`).
- rs-raft has no snapshot catch-up (census-snapshot-catchup-ownership §0 item 5). So t replays the log on top of that bootstrap. A founding source has no AddNode entry in the log.
- **Result:** t's ConfState never contains s. It is the "locally predicted ConfChange result" that owner constraint 1 forbids as evidence, and it diverges from the other members' configurations (for example, t holds {r1, t} while r1 holds {r1, s, t}).

**Consequences for this quest**
1. t can never witness C1. Its local ConfState says "s is not a voter" from birth.
2. Removing s never changes t's ConfState, because raft-rs treats removing a non-member as a no-op (`confchange/changer.rs:237-240`). So the S5.2 membership event on the target node (the owner node for system and priority REPLACEs) never fires for the removal it exists to report. Checklist item (ii) would be vacuous on the owner's own node.
3. For RF = 1 there is no other witness at all, so a REPLACE could never complete under C1.
4. t's bootstrap is then {t}, a sole voter, which self-elects (`isSoleVoter`, `raft-rs-runtime-owner.js:456-478`). That is a split group. It is pre-existing, and its reachability is *unverified*.

**Options**
- **(A), recommended.** t is created with the membership that is committed when the REPLACE is created, **including** s: drop the REPLACE exclusion at `rebalance-coordinator-operation-creation.js:752-757`.
  - s ∈ t's ConfState from creation, and only an applied committed RemoveNode(s) takes it out. So t becomes a sound local witness: absence proves removal.
  - The S5.2 event fires on O.
  - S2's "re-propose REMOVE_PEER through its own target replica" works as written, because s is reserved in t's registry at bootstrap (`raft-rs-operation-port.js:138-140`), which also resolves A10's reservation half.
  - It changes the membership bootstrap of every REPLACE target: t's quorum is 2 of {r1, s, t} while s is present, the same as every other member's. This is the R2 membership owner's boundary, hence (d).
- **(B), lead fallback if (A) is refused.** The witness is another voter w ∉ {s, t} whose ConfState contained s when the removal intent was recorded. It is read through the S5.1 message seam (§1, A1), and w's node wakes the owner through the existing remote-owner wake ingress.
  - This works for RF ≥ 2.
  - For RF = 1 the owner must accept that a REPLACE cannot complete under C1: it waits observably (S9) and never completes.
  - t's divergent configuration stays as it is, recorded for R2.

### D2. The outcome of a REPLACE after its source-removal effect (A7, BR7, BR5's post-effect half, A11 items 2 and 3)

**Fact**
- Once `REMOVE_REPLICA` has reached the source, s's lifecycle retires and its row goes REMOVING or is deleted (design H5).
- Several timers can still end the REPLACE FAILED after that point:
  - the 60 000 ms STOPPING step budget (`status-reconcile.js:456-481, 611-685`);
  - the 300 000 ms operation budget from `createdAt` (`control-plane/timeout-budget.js:17`; `status-reconcile.js:611-647`);
  - STOPPING starvation (`operation-workflow-stopping-starvation.js:120-135`);
  - the two STOPPING FAIL edges (`recovery-observation.js:655-662, 710-716`).
- The planner then removes the target of every FAILED REPLACE, B3 (`unified-rebalancer-replica-state.js:626-651` → `move-planner-move-calculation-methods.js:236-252`).
- **Result:** a partition with a live target can drop to one live voter. That is the T-7 quorum hazard, reached by a timer.
- S9 covers ACTIVE only. S2 says "until the committed ConfState no longer holds the source", which implies, but does not state, that no timer ends STOPPING.

**Options**
- **(A), recommended: extend S9 to post-effect.**
  - Once the REPLACE has durably recorded its removal intent (STOPPING, persisted **before** `REMOVE_REPLICA`, §2 step 3), no step budget, operation budget or starvation escalation ends it FAILED **while its target is live**. It waits observably while R-1f re-drives.
  - FAILED after the effect is allowed only when the target is dead by the failure detector's verdict. B3 removing a dead target is then correct.
  - This changes the timeout-budget contract for one operation type in one phase: `REMOVING_TIMEOUT_MS`, the `REBALANCE_OPERATION_BUDGET_MS` anchor, and the starvation escalation.
- **(B): B3 exemption.** The timers stay. A FAILED REPLACE whose history contains STOPPING never has its target removed by B3, and the planner re-plans from committed membership.
  - This changes the planner's FAILED-REPLACE cleanup contract (CL-025 lineage).
  - It leaves a FAILED row whose source may still be leaving, so the planner sees a transient surplus. That surplus is unrelated and belongs to the planner, per the split.

### Considered and not escalated (resolved at lead level; §1 has the detail)

| Candidate | Why it is not (d) |
|---|---|
| A1: ordinary-partition REPLACEs are owned by the source node | The completion read and R-1f go through the S5.1/S2 replica-operation message seam. It is location-transparent: the router's local short-circuit, and the same seam that STEP_DOWN, CREATE and REMOVE already use to reach a node's replica handler. The wake comes through the existing remote-owner wake ingress. It needs no new product contract; the ownership rule is unchanged. |
| A5/BR4: under S1 + S9 a waiting owner's lease expires after 30 s | Renewing the lease while waiting **would** change the sealed contract (anchored at `updated_at`, `replica-operation-owner-lease.js:36-41`), so it is avoided. Instead R-1c (the REPLACE-specific remote FAIL) gets a caller-side precondition: the failure detector marked the owner's hosted target replica FAILED (`node/failure-detector-replica-failures.js:20-60`). An expired lease plus a flaky readiness heuristic can then never FAIL a live owner. The verdict and L2 are unchanged. |
| A3/BR13: dead source | The failure detector's FAILED source row is the source-liveness authority. The REPLACE skips the undeliverable `REMOVE_REPLICA`, records its removal intent, and removes s through R-1f. This is S2's re-drive authority, entered from ACTIVE. Row re-admission skips FAILED rows (`partition-service-raft-peer-cache-reconciliation.js:92-102`). |
| BR5, pre-effect half: the 300 s budget consumed by an ACTIVE wait | Covered by S9: a timer measured across the ACTIVE wait forces an outcome that S9 forbids. The budget for a REPLACE is measured from its removal intent, not from `createdAt`. |
| A7/BR7: the planner removes the target of a FAILED REPLACE after the source removal was sent | This is D2. |
| A4/BR16: the leader re-adds a removed source | During the REPLACE: lead level (R-1f preconditions, and a reappearing admissible source row returns the REPLACE to its normal `REMOVE_REPLICA` path). After completion: out of scope, because C1 holds at the write instant and a later re-admission is new, unrelated surplus owned by the planner, as it is today. |
| BR6: epoch-gate lane dependence | The gate's own contract is PENDING dispatch ("a queued ADD/REPLACE can sit PENDING across a membership epoch advance", `operation-workflow-dispatch-epoch-gate.js:1-9`). The implementation fences by type only (`:31, :81-117`). Scoping it to pre-dispatch steps brings the implementation into line with its stated contract. |
| BR9: transfer answer shape for handoff attempts | Avoided. REPLACE handoffs become **named-target-only** (always t). All attempts share one transferee, so a retarget is structurally impossible: raft-rs ignores a same-transferee repeat without reset (`raft.rs:1889-1898`). A late effect of attempt A is the same transfer, and forwarded requests are term-fenced by raft-rs (`raft.rs:646-663`). The attempt identity is `{operationId, attemptSeq}`, echoed by the handler (the owner-accepted S5 item 3). No port answer change. |
| A8: a remote FAIL without a fence | After R-1b and R-1c, the only non-owner REPLACE FAIL is R-1c, gated on a failure-detector-dead target, and removal intent is persisted before the effect. A remote FAIL landing on a STOPPING row therefore lands exactly when D2 permits FAILED after the effect (target dead). The terminal CAS (audit finding 6) is unchanged. The residual is a failure-detector false positive, the nondeterminism every FAILED-row decision already has. |

---

## 1. Disposition of every challenger finding

Key: **a** = resolved by a lead-level design choice; **b** = covered by an existing owner decision; **c** = out of scope, with a justification the directive allows; **d** = §0.

### Challenger A

| # | Finding | Disp. | Resolution |
|---|---|---|---|
| A1 | The owner is the source node on ordinary partitions; adopters act as concurrent owners | **a** (+ b: S5.1) | **Completion read.** The witness's ConfState, read through a new replica-operation message `READ_REPLICA_MEMBERSHIP`. It sits next to STEP_DOWN, CREATE and REMOVE in `replica-operation-constants.js:7-11`, and is handled by the node's replica handler through `getTrackedService` (`replica-handler-status-methods.js:95`), then `readStatus().confState` and `commitIndex` (`raft-rs-status-observation.js:113-129`). The same seam serves local and remote witnesses, so a remote read is a new message type on an existing owner interaction (rebalancer → replica handler). It needs S5's coupledPairs entry and witness, not a new product contract. **Wake:** the witness node's workflow owner, on its local membership event for P, wakes each non-local owner of a non-terminal REPLACE on P through the existing `wakeCoordinatorCreatedRemoteOwner` (`operation-workflow-owner-handoff-state.js:229-300`). **Adopters:** they run the same lifecycle. Every success edge passes R-1a (P1), and every FAIL edge passes D2's rule, so an adopter can only wake or re-drive. Ownership is unchanged |
| A2 | The target's ConfState is a prediction that excludes s | **d** | D1 |
| A3 | Dead source: nobody proposes its removal | **a** (under S2) | New edge T5″: at ACTIVE, source row FAILED (failure detector) and SAFE (FAILED s already counts as not voter-ready), then persist the removal intent (STOPPING with metadata `sourceUnreachable`), then R-1f without `REMOVE_REPLICA`. Anchor AN10 |
| A4 | The leader's row-driven ADD_PEER re-adds s | **a** during / **c** after | During: T7 (R-1f) and the T5″ precondition read s's row **authoritatively**, requiring absent or {FAILED, REMOVING, REMOVED}. A reappearing admissible row (a dead node returns) sends R back to B1 (`REMOVE_REPLICA` to the now-live source). After REMOVED: C1 held at the write instant, and a re-admission is new surplus the planner owns, as today. Recorded for R2 (R17) |
| A5 | The lease is not liveness; with S9 a waiting owner reads "unavailable" at 30 s | **a** | §0 table: R-1c requires the failure-detector FAILED target, at the release decision (`…-reconcile-shared.js:634-645`) and its evidence (`recovery-timeout.js:874-903`). The same precondition applies to the REPLACE arm of stale-FAIL (`recovery-drain.js:385-397`). The re-entry wake is harmless (a wake). The lease contract is untouched |
| A6 | Abandonment inferred from age | **b** (S9) | Callers of `isReplicaOperationStale`, `isPriorityRecoveryOperationDrainStepStale` and `isOperationStepTimedOut` are imported mechanically. For a REPLACE at ACTIVE or STOPPING, "stale" derives from the owner-liveness rule of A5 (failure-detector-dead target), never from step age. That covers CL-043/CL-044 (`remove-safety-evaluator.js:465-507`; `recovery-timeout.js:657-692`), the topology-settling view (`unified-rebalancer-replica-state.js:679-693`), follow-up contexts, and the coordinator-created wake stop (`coordinator-created-handoff-scheduling.js:192-240`). Admin views only label; S9 diagnostics report the classification |
| A7 | FAILED after the effect; B3 removes t | **d** | D2 |
| A8 | Cached re-read at the effect; remote FAIL not step-CAS'd | **a** | Persist the removal intent **before** `REMOVE_REPLICA`: the STOPPING CAS (expected ACTIVE) is the last await, and §3.2's synchronous checks follow. The remote FAIL is confined to R-1c with a dead target (§0). Composition with D2 makes the race benign |
| A9 | The lost-wakeup recheck compares the wrong version | **a** | Resolved inside R-2 by BR1/BR2: level compare (`operation-workflow-remove-safety-readiness-wake.js:14-30`) |
| A10 | R-1f stranded by pending_conf or a missing reservation | **a** | Re-drive on **every** membership, leader and term event while s ∈ committed voters, plus a W_max-derived backstop timer. No per-term limit (BR8). Duplicates are no-ops (`changer.rs:237-240`; `raft.rs:2062-2090`). Reservation: s is reserved on t from bootstrap under D1(A); otherwise R-1f reserves first through the port's reservation owner (`registerPeerIdentityReservationOwner`, `raft-rs-operation-port.js:145-150`). The identity is a pure derivation (`raft-rs-peer-identity.js:58`) |
| A11 | Missing terminal and step edges | **a** (items 2, 3 → D2; item 8 **c**) | (1) Terminal-transition repair (`operation-workflow-terminal-transition-repair.js:110-192`) re-runs R-1a before re-asserting REMOVED for a REPLACE. (4) T5′, the re-send at STOPPING: §3.2 generalised to "the same step it started in". (5) T1+T5 in one call (`priority-recovery-superseded-target.js:584-634`) is a named edge. (6) Handoff continuation (`dispatch-response-reconcile.js:274-289`): becomes wait-for-attempt-resolution (§2 step 2). (7) Adopters: see A1. (9) The divergence re-insert (`mutation-update-methods.js:355-387`) passes through R-1e on its next entry. (8) Operator raw SQL on `replica_operations` (`admin-meta-command-handlers.js:61-79`) bypasses every owner by definition. The system writes no false completion; R-1e keeps membership idempotent. Out of scope |
| A12 | Revalidation gaps: concurrent operations and the full floor | **a** | Check 5: a synchronous cache read of the entity's non-terminal operations, with A6's rule. Check 4 generalised to every replica the floor counted |
| A13 | Attempt identity: most-caught-up has no transferee; the ROLE_NO_OP answer | **a** | Named-target-only (§0, BR9). ROLE_NO_OP (`replica-handler-leader-handoff-methods.js:100-104, 128-134`) resolves the attempt as "no effect" with a fresh re-read. The answer universe is imported from `RAFT_LEADERSHIP_TRANSFER_REASON` (`raft-operation-port-constants.js:75-88`) plus the handler branches |
| A14 | Planner split gaps | **a** | §3.7 as **set exclusion** of an active REPLACE's source from the counted replicas (idempotent against row state). Input I13 (planner observation deferred or cache lag) enters the X2 cells. Tied to A6 |
| A15 | Missing outputs | **a** | Added to the §3 result set: B3 target removals; planner-created operations for P; the interlock hold across a restart; which wakes fired and on which node; S9 diagnostics; membership-event emission |
| A16 | Three restart classes | **a** | P3 ranges over process restart, coordinator re-init, and rs-raft group/runtime rebuild |
| A17 | Leadership authorities: cold loss, the cure may pick s, STEP_DOWN sender unchecked | **b** (S4) / **c** | The cure on ordinary partitions is S4 (recorded for its owner). Cold leader loss (retire, shutdown, rebuild) is a liveness input only: R-1f re-drives at the new leader, and completion never depends on who leads. The unchecked STEP_DOWN sender is not a checklist item and cannot cause a false completion. R17 finding |

### Challenger B

| # | Finding | Disp. | Resolution |
|---|---|---|---|
| BR1 | Lost-wakeup recheck blind (the identity does not change on publication) | **a** | R-2 in progress: level recheck |
| BR2 | Coalescing loses edges (lane join, tokenKey dedupe) | **a** | R-2 in progress: redrive loop, no token dedupe. §2.0 generalises it to one REPLACE-owner redrive over all level sources |
| BR3 | The leader-ownership wait reads rows but is woken by a core event | **a** | Under the attempt design, ownership is the local core fact on O: `lead === peerId(t)` from t's port through the S5.1 seam. Rows corroborate only. R09 supersession of the row-based `WAIT_REPLACEMENT_LEADER_OWNERSHIP` input (`priority-publication-leader-safety.js:645-670`) for REPLACE |
| BR4 | S1 × S9: a live waiting owner looks dead after 30 s | **a** | As A5 |
| BR5 | The 300 s budget | **b** (S9), pre-effect / **d** (D2), post-effect | §0 |
| BR6 | The DISPATCH entry applies the epoch fence at ACTIVE | **a** | `ensureDispatchMembershipEpochOrSkip` (`operation-workflow-dispatch-epoch-gate.js:81-117`) applies only to pre-dispatch steps (PENDING, SENDING) per its own header `:1-9`. Every entry route (EXECUTE, DISPATCH, timeout, orphan, remote wake) then converges on R-1e plus the phase decision. P3 is crossed with the entry route |
| BR7 | No safe FAIL after the effect; missing durable phase | **d** (D2) + **a** | The durable phase "removal intent persisted, effect maybe taken" exists by construction (A8: intent before effect). The FAIL question is D2 |
| BR8 | R-1f "once per term" is unsound | **a** | As A10 |
| BR9 | The transfer answer carries no term or transferee | **a** | Named-target-only; `attemptSeq` echo (§0) |
| BR10 | W-elapsed resolution on the wrong clock; restart latency | **a** | Resolution by W_max only **permits T5**; it never authorizes a different successor (there is none). The restart pseudo-attempt resolves at once on a fresh `lead === peerId(t)`, and otherwise blocks new issuance only, never T5. The window is measured from answer arrival. Phase 6 adds W_wall ≥ W_nominal |
| BR11 | CL-043 authorizes removal on accepted-but-unwon evidence | **a** | R09 record: COMPLETED election evidence (`priority-publication-leader-safety.js:670`) no longer authorizes removal. A fresh `lead === t` does. Witnessed |
| BR12 | The effect-boundary re-read can be the captured snapshot | **a** | I3 = {authoritative, cache, deferred → snapshot}. The deferred class means **WAIT** at the effect boundary and at handoff issue (`resolveDeferredRetryVisibleOperation`, `dispatch-rearm-evidence.js:456-468`) |
| BR13 | Dead source during ACTIVE | **a** | As A3 |
| BR14 | K1 is not 1000 ms | **a** | Phase 6 uses K1_eff = max(1000, Σ serial remote wakes + max lane hold). The backstop proof holds under K1_eff. R-1b's hand-back fires only on a drain-verdict change per operation, which bounds the seed's wake traffic (R12) |
| BR15 | Commit → event lag | **a** | Latency is split into "applied on the witness → completion = 0 owner-clock ms" and "leader commit → applied on the witness ≤ Σ sends + admission" |
| BR16 | Cache lag: the leader re-admits s | **a** / **c** | As A4. A re-admission as a learner does not violate C1 (voters only), and the existing row-delete retire path removes it |
| BR17 | Smaller items | **a** | The identity read's side effects: moot under the level recheck. Waiter cleanup on any terminal observation, including a remote one. E1c (the second evaluation at `DRR:284`) is a named resume edge. ROLE_NO_OP as in A13. The subscription is re-established on re-init of either side and fails visibly when the readiness owner is absent |

**Counts** (34 findings):
- **a:** 28 as primary. Some of these also carry a b or c part: A1 (b, S5.1), A4 and BR16 (c after completion), A11 (item 8 c, items 2-3 into D2).
- **b:** 3 as primary (A6, A17, BR5 pre-effect).
- **c:** 5 partial (A4 after, A11 item 8, A17 part, BR16 after, plus the RF = 1 split group recorded under D1).
- **d:** 3 findings (A2, A7, BR7), gathered into **two decisions** (D1, D2). BR5's post-effect half and A11 items 2 and 3 fold into D2.

---

## 2. Implementation order: one implementer, one semantic owner

Each step keeps the tree green. Steps 3-5 land as one unit, because S2 says R-1a must not land without R-1f. D1 changes step 3 only as noted.

### 2.0 Composition with R-2 (in progress)

R-2's redrive loop (`operation-workflow-remove-safety-readiness-wake.js`) compares a captured **level** and re-runs `runDeferredSafetyRetryInLane` until the level is stable.
- It is generalised once, after R-2 lands, into the single REPLACE-owner wake. A second loop would be a second owner (R01).
- The level becomes the tuple (readiness level, witness-membership level, attempt state, source-row class).
- Every new wake feeds this one entry: the membership event, attempt resolution, remote wakes, the R-1f backstop timer.
- It keeps R-2's rules: subscribe/register before recheck, no token dedupe, bounded runs, and the timer as fallback.

### Step 1. Checklist (ii): the port membership event (S5.2)

- `src/raft/raft-operation-port-constants.js:1-10`: add `RAFT_EVENT.MEMBERSHIP_CHANGED`.
- `src/raft/raft-rs-runtime-owner.js`:
  - `announce` (`:979-1000`) compares the recorded ConfState with the new one and emits `{confState, commitIndex}` as data.
  - It also emits on the first observation after (re)construction and on snapshot restore. The `before === null` guard at `:988` drops those today (BR §2.1).
- `src/raft/raft-rs-operation-port.js:35-46, 225-239`: the event list, plus the literal method and event witnesses.
- Partition service: relay to a `PARTITION_SERVICE_EVENT.MEMBERSHIP_CHANGED` (`partition-service-constants.js:245-256`), in the raft lifecycle wiring. The relay survives a service swap (`partition-service-lifecycle-methods.js:83-97`).
- Node wiring: the coordinator subscribes through the replica handler's tracked services. This is a new handle passed at `bootstrap/shared/control-plane-setup.js:337-352`, and needs a coupledPairs entry and witness.
- The owner does not subscribe the readiness planner, the publication coordinator, the planner or the peer-cache reconciliation (A §5).

### Step 2. Checklist (v): a handoff attempt that cannot be retargeted

- `priority-publication-leader-safety.js`:
  - For REPLACE, remove the most-caught-up source leg (`REQUEST_SOURCE_LEADER_HANDOFF`, `:496-525`) and the H-B′ retarget (`operation-workflow-replacement-leader-resolution.js:97-257`; states `operation-workflow-replacement-leader-state.js:53-98`).
  - The only kind is the named target leg (`:559-592`).
  - Record the R09 supersessions: BR11 (CL-043 authorization at `:670`) and BR3 (the row-based ownership wait).
- `priority-publication-safety-topology.js:273-312, 524-588`: the two per-leg evidence maps become one attempt record, keyed by operationId: `{attemptSeq, issuedAt, answerClass}`.
- `priority-publication-handoff.js:225-285`:
  - the request carries `attemptSeq`;
  - the answer is applied only when its seq matches;
  - a synchronous re-read of R before `deliver` (F-b / TC5; BR12's deferred class means WAIT).
- `src/node/replica-handler-leader-handoff-methods.js` and `replica-handler-remove-request-methods.js:339-372`: echo `attemptSeq`.
- Resolution:
  - a fresh `lead === peerId(t)` on O (S5.1 read);
  - a refusal;
  - ROLE_NO_OP;
  - W_max since answer arrival.
  - Each resolution is a wake (§2.0).
- `dispatch-response-reconcile.js:274-289`: the continuation waits for resolution; E11.

### Step 3. Checklist (iii) + (i) + the read and propose seams, as one unit

**Seams**
- `replica-operation-constants.js:7-11`: new message types `READ_REPLICA_MEMBERSHIP` and `RETIRE_REPLICA_PEER`.
- Node handlers:
  - read: `readStatus().confState`, `commitIndex`;
  - retire: reserve s, then port `proposeConfChange(REMOVE_PEER{replicaIdentity: s})` through the tracked service.

**Removal intent before the effect** (A8, BR7). In `dispatch-response-reconcile.js:455-545`:
- the STOPPING CAS (expected ACTIVE) is written **before** `REMOVE_REPLICA`;
- it records the witness `{replicaId, nodeId, commitIndex C0}` in the step metadata: t under D1(A), or w under D1(B);
- the §3.2 checks run synchronously after that last await (checks 1-5, A12);
- the INITIATED answer no longer writes STOPPING.
- Dead source (A3): the same intent write with `sourceUnreachable`, and no `REMOVE_REPLICA`.

**R-1a (`decideReplaceCompletion`, new, in the recovery-observation owner).** It returns:
- SOURCE_RETIRED iff peerId(s) ∉ voters ∪ votersOutgoing on the recorded witness, **and** the observation's commitIndex ≥ C0;
- otherwise STILL_VOTER or UNAVAILABLE.

Every REPLACE success edge routes through it:
- `recovery-observation.js:693, 759`;
- `priority-publication-safety-topology.js:65`;
- `executor-outcome-reconcile-methods.js:564`;
- `recovery-drain.js:656` (A1 CONVERGED);
- the terminal-transition repair (A11.1).

`completeOperation` refuses a REPLACE without the verdict: a typed refusal, R11 (`operation-workflow-transition-persistence.js:319`).

**Drain** (`…-reconcile-shared.js:318-352, 554-581, 634-645`; `recovery-timeout.js:694-724, 874-903`; `recovery-drain.js:385-397, 595-658`):
- R-1b: the `SOURCE_RETIREMENT_OWNED` hand-back state;
- R-1c: FAIL `replace_owner_unavailable_source_retained`, only pre-effect and only with a failure-detector-dead target (A5).
- A10's success edge becomes FAIL `replace_target_removed_before_active` (`status-reconcile.js:239-247`).

**R-1f (checklist i).** At STOPPING with STILL_VOTER:
- `RETIRE_REPLICA_PEER` through t (S2), re-driven on every membership, leader and term wake plus the W_max backstop;
- preconditions: s's authoritative row is absent or in {FAILED, REMOVING, REMOVED}.

**R-1e.** At every owner entry: SOURCE_RETIRED goes straight to completion; a REMOVING or absent source row at ACTIVE routes to the STOPPING owner (BR7).

**Budgets per D2**
- (A): STOPPING and operation-budget FAIL for a REPLACE only when the target is dead (`status-reconcile.js:604-685`; starvation `:120-135`).
- (B): B3 exemption in `unified-rebalancer-replica-state.js:626-651`.
- Either way, the pre-effect budget is anchored at the removal intent (BR5 under S9).

### Step 4. Checklist (iv): the planner cannot independently remove an active REPLACE's source

- `move-planner-move-calculation-methods.js:505-620`: set-exclude each non-terminal REPLACE's source from the counted replicas. The input is `getInFlightOperations` (`unified-rebalancer-replica-state.js:701-712`), not the topology-blocking set.
- S10: delete `restoreLedgerSurplusDrainActiveVoters` (`unified-rebalancer-ledger-surplus-drain-replica-state.js:22-60`) and the "completed REPLACE can leave a 3-1" branch (`unified-rebalancer-rebalance-loop.js:40-60, 224-230`), after the dependents census. Any other dependent is reported, not kept.
- A6: the staleness consumers treat a REPLACE per A5's rule. The creation guards that fail open under deferred observation (A14b, `rebalance-coordinator-priority-budget-admission.js:635-660`) fail closed for a REMOVE on a partition with a cached non-terminal REPLACE.

### Step 5. Checklist (vi): missed notifications and restarts through the same owner

- BR6: epoch gate scoped to pre-dispatch.
- `checkTimeouts` (K1) and the orphan sweep enter through R-1e (`recovery-timeout.js:174-320, 365-475`).
- The R-1f and handoff attempt state is in memory. After a restart it is rebuilt from the durable intent and a fresh read (BR10's restart rule).
- The waiter is dropped on any terminal observation (BR17).
- S9 diagnostics report the wait reason, since when, the staleness classification, and R-1f admissibility.

---

## 3. Evidence plan (finite over the state machine)

**The state machine** (design §4.2-§4.5, amended):
- **Durable phases:**
  - Φ1: ACTIVE, deferring;
  - Φ2: ACTIVE, attempt unresolved;
  - Φ3: STOPPING, intent persisted, effect not sent;
  - Φ4: STOPPING, source row REMOVING;
  - Φ5: STOPPING, row gone, removal uncommitted;
  - Φ6: STOPPING, committed, terminal unwritten.
- **Edges:** T1-T10 plus T5′ (the re-send), T5″ (dead source), and E1a-E1d, E3b, E3c, E11 and E12.
- **Entry routes:** EXECUTE, DISPATCH, timeout, orphan, remote wake.
- **Restart classes:** process restart, coordinator re-init, runtime/group rebuild.

**P1: completion implication.**
- Every write of REMOVED on a REPLACE, over every success edge and the repair W, implies peerId(s) ∉ voters ∪ votersOutgoing in the committed configuration.
- **Oracle:** computed in the harness from a real multi-replica rs-raft group (`test/partition/partition-admitted-group-fixture.js` / `partition-node-cluster.js`) as the applied ConfState of a founding member caught up to the leader's commit. It is never the implementation's own witness choice (A2: the oracle must not share the mistake).
- **P1′ (failure implication):** every FAILED after Φ3 happens only with a dead target (D2 A), or leaves t unremoved by B3 (D2 B).

**P2: scheduling equivalence, with the safe refinement.**
- Events: a readiness publication, a membership change, a leader or term change, a STEP_DOWN answer, a source-row delete, a remote terminal write, a planner check.
- Each is crossed only with the decisions that read the input it moves: remove safety, §3.2, R-1a, R-1f, attempt resolution, planner excess.
- Compare decide-first against process-first over the full output: terminal outcome, removals and their authority, attempts, B3 removals, planner-created operations.
- The outputs are equal, or decide-first answers WAIT.

**P3: recovery equivalence.**
- Each of Φ1-Φ6 × the 3 restart classes: 18 cells.
- The DISPATCH entry route is crossed only with Φ1-Φ3, where the epoch gate could apply: 3 further cells.
- Continue versus destroy-recreate-recover must converge to the same committed ConfState and the same outcome.

**Causal latency.**
- With the fallback clock frozen:
  - publication → evaluation;
  - SAFE → intent → `REMOVE_REPLICA`;
  - applied on the witness → completion;
  - attempt resolution → next decision.
  - Each takes 0 owner-clock ms.
- With the events suppressed, advancing the fallback (K2, K1_eff, the R-1f W_max backstop) recovers progress.

**Anchors**
- AN1: Path 2 (no early close, no planner REMOVE).
- AN2: owner availability with S1, plus the failure-detector gate. A healthy owner waiting 31 s is not FAILED.
- AN3: target REMOVED before ACTIVE ends FAILED.
- AN4: a late `attemptSeq` has no effect.
- AN5: an identity-preserving publication between read and registration (R-2's).
- AN6: REMOVE_PEER lost at the leader (leader source), and R-1f completes.
- AN7: restart in Φ5.
- AN8: no handoff after terminal.
- AN9: FAILED after the effect per D2.
- AN10: a dead source completes only after committed removal.
- AN11: a fresh witness that has not caught up (commitIndex < C0) answers WAIT.
- AN12: an epoch advance during ACTIVE does not FAIL through DISPATCH.

**Mutation families** (one per checklist item, each by mechanism):

| Item | Family | Expected red |
|---|---|---|
| (i) | No re-drive, or a per-term rate limit, or a swallowed proposal counted as issued | AN6, P3 Φ5 |
| (ii) | Event not emitted on restore/rebuild or first observation, or not relayed to the owner, or relayed only from t under D1(B) | Latency (applied → completion), AN7 |
| (iii) | Complete on row absence, on the AVAILABLE verdict, on the release, on the target's bootstrap ConfState, or ignoring `votersOutgoing` or C0 | P1, AN1, AN11 |
| (iv) | Planner excess counts an active REPLACE's surplus; the restore helper resurrected; a creation guard fails open | P2 planner-output cells |
| (v) | Most-caught-up leg or H-B′ retarget re-enabled; answer applied without the seq match; handoff sent after terminal | AN4, AN8, attempt cells |
| (vi) | Backstop removed (events only); DISPATCH epoch gate at ACTIVE; R-1e skipped on re-entry; waiter leaked | P3 cells, AN12, fallback-recovery cells |
| Cross-cutting | FAIL after the effect with a live target; R-1c on lease expiry alone | AN9, AN2 |

**Runs**
- Every suite and batch runs on lab hosts first (lab-first rule), one test process per host, under thermal gating.
- The join SLO runs on the reference performance host only, in the single A2.

---

## 4. Approved evidence touched by this plan

- **Lease verdict** (bfbf7692e, verified). R-1c changes the release caller, and the stale-FAIL REPLACE arm gains the failure-detector precondition. The lease-verdict causal witnesses (K1/K2) and caller cells C1/C2 are re-run and their release expectations superseded under R09. The verdict itself (L1/L2) is untouched.
- **F1.** Step 1 changes the port's event set: the literal method and event witnesses are updated. Step 2 removes the most-caught-up leg for REPLACE, whose F1 transfer semantics are unchanged at the port. F1's oracle and its evidence are not reopened.
- **Superseded tests** (R09, as in design §3.8 and S7):
  - `rebalance-coordinator-stopping-reconcile-cache-visibility.test.js:243-612`;
  - the CL-043 authorization witness (BR11);
  - the H-B′ retarget tests (to be listed by the implementer's census).
