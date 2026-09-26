# Implementer report (reconstructed): amendment-1 steps 0-3 + D2 (a157574bd)

Reconstructed by a read-only analyst from the code at HEAD `fa555bdcf` (`a157574bd` -> `e7aaeea9d` -> `fa555bdcf`). The parent of the WIP is `527771405`. `fa555bdcf` only fixed gate hits: named constants, a typed `ReplaceWitnessDeliveryOutcome`, the `CONF_STATE_NOT_ANNOUNCED` sentinel, and `failOperation` split into `isReplaceFailureRefused` + `applyFailureStepMetadata`. All line numbers are at `fa555bdcf`. The commit message was not trusted; every claim below comes from the code. No tests were run. "Red on 527771405" is reasoned from the old code (`git show 527771405:<path>`).

Every new witness file imports a module or export that does not exist at `527771405`: `replace-witness-fixture.js`, `operation-workflow-replace-*.js`, `readPartitionReplicaMembership`, `TrackedServiceRegistry`, `RAFT_EVENT.MEMBERSHIP_CHANGED`. So every one is **trivially red** there. Where it matters, this report also says whether the witness would be red *by mechanism*.

Scope note: steps 4 (planner exclusion, S10, A6 staleness consumers) and 5 (BR6 epoch gate, orphan sweep, restart rebuild, S9 diagnostics surface) were **not** in this commit. D1 is **not** on this branch (see §5).

---

## 1. R-2 composition (§2.0): the single REPLACE-owner wake

**What it is now.** `src/rebalancer/operation-workflow-replace-owner-wake.js` replaces `operation-workflow-remove-safety-readiness-wake.js` (renamed; the test was renamed to `test/rebalancer/replace-owner-wake.test.js` with about 10 changed lines).
- One per-owner state: `WAKE_STATE_BY_OWNER` (`:72-90`).
- One redrive loop: `redriveReplaceOwnerWake` (`:353-373`), bounded at `REPLACE_OWNER_WAKE_MAX_RUNS = 16` (`:62`). No token dedupe.
- Each run takes the owner's retained turn: `runDeferredSafetyReentryTurn` -> `runDeferredSafetyRetryInLane` -> EXECUTE (`:332-343`).
- Subscribe, register, then recheck: `registerReplaceOwnerWaiter` (`:303-322`).
- The two waits that register with it:
  - the remove-safety DEFER in `operation-workflow-dispatch-response-reconcile.js:308` (capture) and `:370` (register);
  - `armReplaceOwnerWait` in `operation-workflow-recovery-reconcile.js:418-421`, which also arms the 1 s fallback (`scheduleDeferredSafetyRetry`). The STOPPING owner (`waitForReplaceOwner`, `operation-workflow-replace-owner.js:512-517`) and the effect-boundary wait (`waitReplaceSourceRemovalEffect`, `recovery-reconcile.js:476-490`) both use it.

**The level actually captured** (`readReplaceOwnerLevel`, `:121-135`) is a string made of three parts:
1. **Readiness**, per node: `isNodeReadyForRouting` with the remove-safety dimension and owner participation kind, plus `isEvidenceAbsentReadinessDenial`. The nodes are the source, the target, and every node in `getCachedCriticalReplicaRows(partitionId)` (`:98-119`).
2. **Consensus**, per partition: `{confKey (voters, votersOutgoing), leaderReplicaId, term}` as last relayed on **this** node (`consensusLevelOf`, `:204-218`).
3. **Concurrency**: the ids of the other non-terminal cached operations on the partition (`:140-151`).

Missing from the tuple against §2.0 "(readiness, witness-membership, attempt state, source-row class)":
- **attempt state**: neither the handoff attempt nor the R-1f attempt is in the level;
- **source-row class**: not in the level.

The "witness-membership" part is only the *local* node's relayed ConfState. It is not the witness's ConfState unless the witness replica t is on this node.

**Wake sources: wired or missing**

| Source | Status | Where |
|---|---|---|
| Readiness publication | Wired | `ensureWakeSubscriptions` -> `subscribeReadinessPlanningSnapshots` (`:258-266`); wakes waiters whose node set contains `event.ownerKey` (`:185-192`) |
| Membership / leader / term event | Wired (local node) | `attachReplicaConsensusEvents` (`:278-292`), `handleConsensusObservation` (`:243-256`); wakes every waiter on the partition |
| Remote wake (t's node -> the owner on another node) | Wired | `wakeRemoteReplaceOwners` (`:223-241`), through the existing `wakeCoordinatorCreatedRemoteOwner` (`operation-workflow-owner-handoff-state.js:229`), which sends a REPLICA_OPERATION_DISPATCH INITIAL_DISPATCH carrying the cached row. It fires on *every* consensus event for every non-local non-terminal REPLACE whose target is that replica |
| Attempt resolution (handoff answer) | **Partial** | No wake. The E11 continuation returns `true` for a REPLACE attempt (`priority-publication-handoff.js:426-428`), which gives one fresh decision after the answer. The window-elapsed resolution (`isAttemptUnresolved`, `operation-workflow-replace-handoff-attempt.js:142-159`) is noticed only by the 1 s fallback |
| R-1f attempt resolution | **Missing as a wake** | `redriveReplaceSourceRetirement` records the answer in memory (`operation-workflow-replace-owner.js:448-473`) and the owner then just waits |
| R-1f W_max backstop | **No dedicated timer** | The backstop is the generic 1 s fallback: each wait re-arms `scheduleDeferredSafetyRetry`, and each fire runs EXECUTE -> `runReplaceStoppingOwner`. `shouldIssueRetirementAttempt` (`:421-436`) re-issues after `transferWindowMaxMs`, or 60 s, *since the answer*, but only when the owner is re-entered. The fallback is effectively a **1 Hz poll**: a `READ_REPLICA_MEMBERSHIP` RPC plus a source-row read per waiting REPLACE, indefinitely |
| Source-row change (REMOVING, deleted) | **Missing** | Not in the level and not subscribed. After REMOVE_REPLICA the owner waits `SOURCE_REMOVAL_EFFECT_PENDING` until the fallback or another wake notices the row retire |
| Timeout sweep (K1) | Wired | `routeTimeoutSweepToReplaceOwner` (`recovery-timeout.js:188-196`, called at `:262`) for **locally owned** post-intent REPLACEs only |

**Witnesses**
- `test/rebalancer/replace-owner-wake.test.js`: R-2's readiness witnesses (a)-(f), renamed. They exercise the readiness part only. Red on `527771405`: no by mechanism, only by rename (the same code was there).
- `replace-source-removal-owner.test.js` "W7: a committed membership change relayed by the node wakes the waiting owner, which completes with no timer firing" (`:325-361`) drives the consensus part through a **fake relay object**, not the real registry or bootstrap wiring. Red on `527771405` by mechanism: `attachReplicaConsensusEvents` did not exist.
- The independent R-2 evidence (`replace-remove-safety-wake-property.test.js` plus its harness, added in `e7aaeea9d`) was written against `527771405`. It has **not** been run on this state (the commit message says so too).

---

## 2. Checklist (ii): membership event (Step 1)

**Emit points** (`src/raft/raft-rs-runtime-owner.js`):
- `announce()` now calls `announceMembership` whenever `recordStatusObservation` succeeds (`:1004-1006`).
- `announceMembership` (`:1024-1034`) emits `RUNTIME_EVENT.MEMBERSHIP_CHANGED` with `{confState, commitIndex}` when `confStateKeyOf(...)` differs from `group.announcedConfStateKey`. The key is voters, votersOutgoing, learners, learnersNext and autoLeave (`:1010-1020`).
- **First observation after (re)construction and restore.** `openGroupInCurrentRuntime` resets `group.announcedConfStateKey = CONF_STATE_NOT_ANNOUNCED` before the `!opening.restore` branch, so it covers both (`:437`). The dispatcher initialises it too (`:1431`). The old `before === null` guard for role and leader is untouched, but membership sits outside it.
- `RAFT_EVENT.MEMBERSHIP_CHANGED` is added in `raft-operation-port-constants.js`, in the port's EVENTS set (`raft-rs-operation-port.js`), and as `RUNTIME_EVENT` in `raft-rs-runtime-owner-constants.js`.

**Relay path**
1. **Port -> partition service.** `relayPartitionConsensusObservations` (`partition-service-raft-lifecycle-wiring.js:128-140`) re-emits MEMBERSHIP_CHANGED, LEADER_CHANGE and TERM_CHANGE as `PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED` (new constant). It is called once in `initialize()` (`partition-service-raft-init-base.js:491`), after an `await refuseConsensusHeldAtOpen()`, so an announcement made before that point could be missed; the event is wake-only. It was also pasted between a comment and the `COMMITTED_PREFIX_DIVERGENCE` subscription that comment describes (cosmetic).
2. **Partition service -> replica handler.** `localServices` becomes `TrackedServiceRegistry` (`replica-handler-class.js:134`; `replica-handler-membership-relay.js:35-99`). Every `set`, `delete` and `clear` attaches or detaches the relay, so a swapped service is followed. `replicaHandler.consensusEvents.subscribe` is at `replica-handler-class.js:135-139`.
3. **Replica handler -> coordinator.** `replicaConsensusEventsOf(replicaHandler)` is passed from `bootstrap-service-control-plane-runtime-methods.js:76` and `node-joining-publication-activation.js:421` into `control-plane-setup.js:199`, which calls `rebalanceCoordinator.attachReplicaConsensusEvents(...)` (`:378-379`). That goes through the facade (`rebalance-coordinator-owner-facade.js:278`) to `recovery-reconcile.js:501` and the wake module.
4. The readiness planner, publication coordinator, planner and peer-cache reconciliation do not subscribe (only the wake module calls `subscribe`).

**coupledPairs.** `test/shards/impact-contracts.json` has both a contract and a coupledPair `replace-owner-membership-observation`, with endpoints `replica-consensus-observation` (runtime owner, lifecycle wiring, membership administration, relay, membership methods) and `replace-owner` (four rebalancer modules), plus seven witness tests. **`src/bootstrap/shared/control-plane-setup.js` and the two bootstrap callers (the handle that step 1 names) are not endpoints, and no test covers that wiring.**

**Witnesses**
- `test/raft/raft-rs-backend/membership-changed-event.test.js`, three tests on a real rs-raft `PartitionNodeCluster`:
  - "the first observation after construction is announced with the core's own configuration";
  - "a committed RemoveNode is announced once on every remaining replica; a round without a change announces nothing";
  - "a restart announces its first observation again, from the durable committed configuration".
  - Red on `527771405` by mechanism: no event.
  - Snapshot restore is not separately covered; rs-raft has no snapshot catch-up.
- `test/node/replica-handler-membership-relay.test.js`: "consensus relay: a committed RemoveNode reaches the registry's ..." and "the registry follows a swapped service and stops at delete". Real port, service faked as an EventEmitter. Red by mechanism.
- W7 above (the owner end, fake relay).
- No test drives port -> service -> registry -> coordinator end to end.

---

## 3. Checklist (v): named-target-only handoff attempt (Step 2)

**Module.** `src/rebalancer/operation-workflow-replace-handoff-attempt.js`.
- `decideReplaceNamedHandoff` (`:169-194`) returns one of:
  - `LEADERSHIP_SAFE` when the witness's leader is non-null and ≠ source;
  - `TARGET_NOT_FOUND`;
  - `WAIT_ATTEMPT_UNRESOLVED`;
  - `WAIT_NO_LEADER`;
  - `WAIT_WITNESS_UNAVAILABLE`;
  - `ISSUE`.
- **Deviation from BR11.** The amendment says "a fresh `lead === t` does [authorize]". The code accepts **any non-source leader** (its header says "or another replica leading"). It is safe for "the source is not leader", but it is not the amended rule, and no test probes a third leader.

**attemptSeq**
- `beginReplaceHandoffAttempt` (`:104-115`) allocates a global per-owner `nextSeq`.
- The request carries `ATTEMPT_SEQ` (`priority-publication-handoff.js:330-355`).
- The handler echoes it generically for **every** replica-operation message (`replica-handler-lifecycle-methods.js:84-89`), not only in the leader-handoff and remove-request handlers.
- `recordReplaceHandoffAnswer` (`:127-140`) applies an answer only when the echoed seq (else the request seq) equals the current attempt's seq and the attempt is still unanswered; otherwise it counts `lateAnswers`.

**Resolution kinds** (`classifyReplaceHandoffAnswer`, `:85-95`; `isAttemptUnresolved`, `:142-159`):
- `NOT_FOUND`;
- `REFUSED`: any non-COMPLETED answer, including a delivery failure (`response=null`);
- `NO_EFFECT`: the ROLE_NO_OP branches;
- `ACCEPTED`: resolves only after `transferWindowMaxMs` since the answer arrived. Without a window it waits for a fresh leader.

A fresh non-source leader short-circuits all of these (`LEADERSHIP_SAFE`). `transferWindowMaxMs` comes from `leadershipTransferWindowMaxMsOf` (`partition-service-raft-membership-administration.js:155-178`).

**The gate** (`priority-publication-handoff.js:107-115`)
- For `isPartitionReplace` it bypasses the old snapshot decision unless the state is a publication wait. It then calls `evaluateReplaceNamedHandoffSafety` (`:260-300`), which always names `targetReplicaId` with reason `REPLACE_TARGET_LEADER_ELECTION`, sent to `targetNodeId`.
- The gate is reached only where the leader-safety snapshot applies (`isReplaceSourceLeaderHandoffRequiredPartition`, `priority-publication-leader-safety.js:395-398`). **Ordinary (non-priority) partitions have no handoff attempt at all**; this is consistent with A17 (S4 cure), but checklist (v) is priority-only.
- **Publication-wait path.** When a REPLACE is in a publication wait state it falls through to the old code. That includes `isCompletedReplacementElectionSafeForPriorityRecovery` (CL-043) at `:124-137`. The evidence maps are no longer fed for REPLACE, so this is probably inert, but CL-043 is **not structurally excluded** for REPLACE.

**Removed most-caught-up leg and H-B' retarget**
- `operation-workflow-replacement-leader-resolution.js` and `operation-workflow-replacement-leader-state.js` are deleted.
- `priority-recovery-superseded-target.js:390` stubs `hasPriorityPublicationReplacementLeaderRetargetCandidateAfterNotFound()` to `false`, and `:406` makes the candidate row the replacement row. The methods are left as vestigial stubs, not deleted.
- The `REQUEST_SOURCE_LEADER_HANDOFF` leg in `priority-publication-leader-safety.js:503` still exists for non-REPLACE callers; for a partition REPLACE it is bypassed by the gate above.
- The "two per-leg evidence maps become one attempt record" (`priority-publication-safety-topology.js`) was **not done**. The maps remain; REPLACE simply stops feeding them, because `dispatchRemoveSafetyHandoffRequest` returns at `:383-386` before the R3 anchor.

**R09 records.**
- Present in:
  - the header of `operation-workflow-replace-handoff-attempt.js:28-30` (BR11, BR3);
  - `priority-publication-handoff.js:250-256`;
  - `priority-recovery-superseded-target.js:387-389`;
  - "SUPERSEDED (R09)" blocks in the two gutted fixture files: `quorum-conditioned-remove-safety-tail-election-retargeting.js:9` (-925 lines) and `...-replacement-election.js:17` (-419 lines).
  - 10 test files carry "SUPERSEDED (R09)" in total.
- There is **no R09 note at the CL-043 site** itself (`priority-publication-leader-safety.js` around `:670`).

**F-b / TC5.**
- `isReplaceHandoffStillOwned` (`:310-322`) checks live and cached terminal state plus `isReplaceRemoveDispatchPhase` before the attempt opens.
- The BR12 "deferred visibility class means WAIT" check is **not implemented**, neither here nor at the removal-effect boundary.

**E11.** `priority-publication-handoff.js:426-428` returns `true` (continue) for a REPLACE attempt. That gives one fresh decision, which then waits while the attempt is unresolved.

**Restart (BR10).** Attempt state is an in-memory WeakMap. After a restart there is no pseudo-attempt, so the first entry ISSUEs at once. That is a duplicate same-transferee request, which is harmless by raft-rs semantics, but it diverges from BR10's restart rule.

**Witnesses** (`test/rebalancer/replace-named-handoff-attempt.test.js`, 5 tests)

| Test | What it proves | Red on `527771405` by mechanism? |
|---|---|---|
| "named-target only: while the source leads, the only handoff names the REPLACE's own target, and removal waits for the witness to see it lead" | 7 assertions, the strongest of the five | Yes: the most-caught-up leg existed |
| "one attempt: an unresolved attempt blocks a second handoff; a refused attempt resolves and the next one names the same target" | One attempt at a time; same transferee | Yes |
| "attemptSeq echo: a late answer of an earlier attempt is dropped" | AN4 | Thin (2 assertions); calls `recordReplaceHandoffAnswer` directly (unit level, no routed late answer) |
| "F-b: no handoff leaves for an operation that became terminal" | AN8 | 3 assertions |
| "no retarget: a target that reports its replica missing fails the REPLACE before its removal intent" | No retarget | Yes: H-B' retargeted |

All five use the witness double.

---

## 4. Checklist (iii) + (i) and the seams (Step 3)

**READ_REPLICA_MEMBERSHIP / RETIRE_REPLICA_PEER.**
- Message types are added in `src/constants/messages.js` and `replica-operation-constants.js:15-16`.
- They are dispatched in `replica-handler-lifecycle-methods.js:67-72` to `replica-handler-membership-methods.js`:
  - `handleReadReplicaMembership` (`:82-97`);
  - `handleRetireReplicaPeer` (`:105-120`), which answers `INITIATED` with the port proposal.
- They are served by `readPartitionReplicaMembership` and `retirePartitionRaftPeer` (`partition-service-raft-membership-administration.js:211-265`):
  - The read reports VOTER, ABSENT, UNRESOLVED or UNAVAILABLE from `readStatus().confState` over voters ∪ votersOutgoing, mapping peerIds through `status.peers`. See `voterMembershipStateOf` at `:180-203`.
  - The retire reserves s first, then calls `proposeConfChange(REMOVE_PEER)`.
- **Subtlety.** `status.peers` covers voters + learners only (`raft-rs-status-observation.js:45-53`). An outgoing-only voter in a joint configuration therefore reads UNRESOLVED, which fails closed (UNAVAILABLE). No test covers votersOutgoing.
- The owner's transport is `operation-workflow-replace-witness.js`: it always addresses t on `targetNodeId` (`:289-319`).

**Removal intent before effect.**
- `holdReplaceSourceRemovalEffect` (`dispatch-response-reconcile.js:129-142`, called at `:398` after SAFE) leads to `admitReplaceSourceRemovalEffect` (`operation-workflow-replace-owner.js:637-671`). At ACTIVE it:
  1. reads the witness (VOTER or ABSENT accepted; anything else waits);
  2. reads the source row;
  3. calls `persistReplaceRemovalIntent` (`recovery-reconcile.js:436-448`), which is `updateStep(STOPPING, …, {stepMetadata, requireDurable: true})`. That is a step CAS: `expectedWorkflowStep` comes from the in-memory previous step, and `requireDurable` blocks the deferred-local-progress fallback (`transition-orchestration.js:379-450, 614-622`).
- Metadata (`buildReplaceRemovalIntentMetadata`, `:278-289`): `replaceRemovalIntent`, `replaceWitnessReplicaId`, `replaceWitnessNodeId` (= `targetNodeId`), `replaceWitnessCommitIndex` (C0) and `replaceSourceUnreachable`.
- Then `revalidateReplaceSourceRemovalEffect` (`:607-623`) runs synchronously: live or cached terminal, step = STOPPING, target not failure-detector-dead, and the level key is unchanged since the entry level.
- The INITIATED answer no longer writes STOPPING for a post-intent REPLACE (`dispatch-response-reconcile.js:595-599`, which runs the STOPPING owner).
- **Caveats:**
  - If the row is already STOPPING (the idempotent transition), no intent entry is written, and `witnessCommitIndexAtIntent` falls back to 0 (`:197-202`). The AN11 guard is then vacuous.
  - `isReplaceRemovalIntentDurable` is `workflowStep === STOPPING` alone (`:180-183`). It does not require the intent metadata.
- **Witness:** "W1: the removal intent is durable before REMOVE_REPLICA is sent" (`replace-source-removal-owner.test.js:148-168`, 5 assertions). Red by mechanism on `527771405` (STOPPING was written after INITIATED).

**R-1a `decideReplaceCompletion`** (`operation-workflow-replace-owner.js:217-229`).
- SOURCE_RETIRED iff the witness state is ABSENT and `commitIndex ≥ C0`; VOTER gives STILL_VOTER; anything else gives UNAVAILABLE.
- **`completeOperation` refusal.** `transition-persistence.js:352-360` runs R-1a for every `isPartitionReplace` and returns the typed `buildReplaceCompletionRefusal` (REFUSED, `replace_completion_refused_source_not_retired`). This is a **catch-all**: every success edge that ends in `completeOperation` is gated.

Edges from amendment §2 Step 3:

| Edge | Status at HEAD |
|---|---|
| `recovery-observation.js` STOPPING completion (old `:693`) | **Routed**: `reconcileStoppingOperationProgress` returns early into `runReplaceStoppingOwner` (`:654-657`) |
| `recovery-observation.js` ACTIVE "source already retired" (old `:759`) | **Routed**: `:776-779` leads to `adoptActiveReplaceSourceRetirement` (`:741-747`, BR7: intent then owner) |
| `priority-publication-safety-topology.js:65` (stop-phase satisfied) | **Routed**: `:56-58` leads to `runReplaceStoppingOwner` |
| `executor-outcome-reconcile-methods.js:564` | **Gated only** through `completeOperation` (`operation-workflow-executor-outcome-reconcile-methods.js:564`); not re-routed to the owner |
| `recovery-drain.js` CONVERGED (A1) | Local owner: gated through `completeOperation`. Remote: not settleable (`isRemoteSettleDrainAction`, `recovery-drain.js:48-56`) |
| Terminal-transition repair (A11.1) | **NOT routed.** `operation-workflow-terminal-transition-repair.js` re-persists the retained projection without re-running R-1a. The projection can only exist after R-1a passed once, so this is safe by origin but not as specified |
| status-reconcile REMOVED target (A10) | Now FAIL `replace_target_removed_before_active` pre-intent (`recovery-status-reconcile.js:55-67`, `:264`). It fires at **any** pre-intent step, ACTIVE included, despite the name |

**Witnesses for R-1a**
- "W2 (C1): completion is refused while the witness counts the source as a voter, and granted once its removal is committed" (`:170-186`, 2 assertions, thin).
- "W3 (AN11): an absence read below the intent's commit index is not a retirement" (`:188-207`, 2 assertions, thin).
- Both call `completeOperation` directly against a **test double** witness.
- Both are red by mechanism on `527771405`: no gate.
- No P1 oracle from a real rs-raft group: the amendment's §3 oracle requirement is unmet.

**R-1b / R-1c drain edges**
- **R-1b.** `releaseEligibleReplace` is false for every partition REPLACE (`recovery-timeout.js:944-946`), and COMPLETE is not remote-settleable for it (`recovery-drain.js:48-56`, `:392`). There is **no** named `SOURCE_RETIREMENT_OWNED` hand-back state: a remote REPLACE falls to the existing `REMOTE_REARM_REQUIRED` or `REMOTE_OWNER_REQUIRED` (skip). "Hand-back fires only on a drain-verdict change per operation" (BR14/R12) is not implemented.
- **R-1c.** `isReplaceDrainOwnerUnavailableWithDeadTarget` (`recovery-timeout.js:779-785`, used at `:728`) requires pre-intent, `remoteOwnerUnavailable`, and a target row FAILED (`isTargetFailureDetectorDead` reads the cached services-row status, `operation-workflow-replace-owner.js:291-304`). The result is STALE, then drain FAIL with `replace_owner_unavailable_source_retained` (`recovery-drain.js:649-660`). Step-age staleness is disabled for ACTIVE and STOPPING (`recovery-timeout.js:795-797`).
- **Witnesses** (both rewritten under R09 in `test/rebalancer/operation-ownership-lease-fencing.test.js`): "live-lease verdict polarity, caller 1 (drain release): R-1b – the drain never releases a partition REPLACE in any lease or routing cell" and "... caller 2 (stale-FAIL remote settle): R-1c – ...". There `failOperation` is **stubbed**, so D2's refusal is not exercised. Also "RebalanceCoordinator hands back (never releases) ..." ×3 in `rebalance-coordinator-stopping-reconcile-cache-visibility.test.js`.

**A10 FAIL.** "RebalanceCoordinator fails a REPLACE whose target is REMOVED before its removal intent during reconciliation" (`rebalance-coordinator-stopping-reconcile-source-removal.test.js`, superseded under R09). Red by mechanism: it completed before.

**R-1f** (`reconcileReplaceStoppingOwner`, `operation-workflow-replace-owner.js:547-588`; `redriveReplaceSourceRetirement`, `:448-473`).
- **Preconditions.** STILL_VOTER, target not dead, the source row readable, and the row absent or in {FAILED, REMOVING, REMOVED} (`isSourceRowRetiring`, `:507-510`), or intent `sourceUnreachable`. Otherwise it goes to T5' (the re-send via `executeReplaceSourceRemovalEffect` if no effect is recorded or 60 s passed, `:491-496`, `:571-583`) or waits `SOURCE_REMOVAL_EFFECT_PENDING`.
- **Re-drive.** At most one uncertain attempt. It re-issues when the witness's (leader, term, membership) level changed, or after `transferWindowMaxMs` (else 60 s) since the answer (`:421-436`). Attempt state is in memory and rebuilt empty after a restart (it issues at once).
- **Witness:** "W4 (R-1f): a retired source still in the configuration is re-driven once per changed level, never on an unchanged wake" (`:209-236`, 6 assertions, double witness, starts directly at STOPPING). Red by mechanism: no R-1f.
- AN6 (REMOVE_PEER lost at the leader) is not witnessed. The real rs-raft retire path is witnessed separately: `replica-membership-witness.test.js` "witness retire: a follower's REMOVE_PEER commits through the leader; …", on a **founding** member, not a REPLACE target.

**R-1e entry.**
- Owner entries that route a STOPPING partition REPLACE to the owner:
  - DISPATCH/EXECUTE (`dispatch-response-reconcile.js:258`);
  - STOPPING reconcile (`recovery-observation.js:654`);
  - stop-phase response (`safety-topology.js:56`);
  - `FAIL_STOPPING_RECOVERY` (`recovery-status-reconcile.js:413-419`);
  - target REMOVED or FAILED (`:58-61`);
  - locally owned timeout sweep (`recovery-timeout.js:262`).
- At ACTIVE, a REMOVING or retired source row triggers intent adoption (BR7, `recovery-observation.js:776-779`).
- The orphan sweep and the BR6 epoch gate are **not** touched (step 5).
- A remote-owned post-intent REPLACE in `checkTimeouts` still runs the generic path. It is protected only by the exemption in `failOperation` and the budget.

**Dead source, T5''.**
- ACTIVE with a FAILED source row: intent with `sourceUnreachable`, no REMOVE_REPLICA, straight to the STOPPING owner (`:649-668`).
- A REMOVING or REMOVED row also skips the effect.
- An *absent* row still gets the effect (the comment explains why: visibility lag).
- **No witness drives T5'' from ACTIVE.** W4 starts at STOPPING with a FAILED row, so AN10 is only partially covered.

**Named in §2 Step 3 but not done.**
- The §3.2 checks are a level-key compare, not the enumerated checks 1-5. A12 "every replica the floor counted" is approximated by the node set in the level.
- The BR12 deferred-visibility WAIT at the effect boundary is not done.

---

## 5. D1

**D1 is not implemented on this branch, and the witness t is valid only under D1.**
- `rebalance-coordinator-operation-creation.js:748-760` (HEAD `:752`) still passes `excludeReplicaIds: [sourceReplicaId]` into `buildOperationBootstrapTopology` for a REPLACE. `dispatch-response-reconcile.js:425-432` also still excludes the source when allocating the target id.
- The D1 fix lives on the sibling branch `quest/replace-d1-bootstrap-membership`: `a13bb03cd`, not an ancestor of HEAD. That branch's own later records (`d6a5b941e`, `ce0dbe4f9`, `a78b0c06b`) show D1 is itself blocked on a committed-membership read, because a services-row bootstrap skew is a safety violation (owner decisions O1-O4 of 2026-09-26). So even the sibling's row-stamped D1 is not the final contract.

**Consequence on this branch (fail-open).**
1. t's ConfState never contains s.
2. `voterMembershipStateOf` resolves every voter and reports **ABSENT**.
3. `admitReplaceSourceRemovalEffect` accepts ABSENT at ACTIVE (`:640-643`) and records C0 = t's commitIndex.
4. It sends REMOVE_REPLICA. The INITIATED answer runs `runReplaceStoppingOwner` (`dispatch-response-reconcile.js:595-599`), and `decideReplaceCompletion` returns ABSENT with `commitIndex ≥ C0`, so **SOURCE_RETIRED, and `completeOperation` writes REMOVED at once**. The source removal has not committed.
5. R-1f never runs (never STILL_VOTER).
6. The AN11 guard does not help, because C0 was read from the same never-containing configuration.

This is exactly A2 consequence 1 ("t can never witness C1"). It turns R-1a into a no-op, while the code comments claim "under D1 it bootstraps from the committed configuration" (`operation-workflow-replace-owner.js:5-10`) as if D1 were in place. **No guard fails closed without D1.** For example, the owner does not require the witness to read s as VOTER at the intent, which was the D1(B) precondition "w whose ConfState contained s when the removal intent was recorded".

**Why the tests are green anyway.**
- `replace-witness-fixture.js` defaults to `sourceVoter: true`, a D1-shaped world.
- The default `createTestCoordinator` now wraps every router in `withFixtureReplaceWitness` (`test/rebalancer/test-helpers.js`, `+131` lines). It derives the witness's "committed" membership **from services rows** (the source is a voter until its row is REMOVED or deleted) and the leader from the partition row (defaulting to the target).
- This is a row-as-membership double across the whole rebalancer suite. The mutation family (iii) "complete on row absence" would not turn those tests red. The oracle "shares the mistake", which §3 P1 forbids.
- `replica-membership-witness.test.js` even asserts that an identity never in the configuration reads ABSENT ("an unknown identity is absent"), which is precisely the non-D1 t's view of s.

**Contradiction to flag.** The witness is t, but on this branch t's bootstrap excludes the source. The branch must not be landed or A2-gated without D1 first, or without a fail-closed guard.

---

## 6. D2

**Mechanism.**
- The boundary is `isReplaceRemovalIntentDurable` = partition REPLACE at STOPPING (`operation-workflow-replace-owner.js:180-183`).
- `failOperation` refuses (typed, `replace_post_intent_failure_refused`) every post-intent failure except `options.replacePostIntentFailure === TARGET_DEAD_SOURCE_RETAINED`. See `isReplaceTerminalFailureAdmitted` (`:255-261`), `isReplaceFailureRefused` (`transition-persistence.js:480-497`), and the check at `:514`.
- `failOperation` is the only FAILED writer in `src/`: the only `workflowStep: WORKFLOW_STEP.FAILED` projection is at `transition-persistence.js:544`.
- **Hole:** the refusal reads the **in-memory** `operation.workflowStep`, and the terminal persist has no step CAS. A stale ACTIVE copy (for example a remote or drain caller holding an older snapshot) bypasses the refusal and writes FAILED over a durable STOPPING row.
- Budgets become diagnostics:
  - `recordReplaceBudgetDiagnostic`, `recordReplaceWaitDiagnostic` (`:318-343`, `:715-719`);
  - severity rises at 60 s and 300 s (`:131-132`, `:358-366`);
  - one log line per change of reason or severity.
  - The diagnostic is in-memory and in the log only. There is **no operator or admin surface** (`readReplaceOwnerDiagnostic` is used only by a test).

**Every terminal FAILED route after durable intent**

| Route | HEAD location | Classification |
|---|---|---|
| status-reconcile step and operation budgets (60 s / 300 s) | `recovery-status-reconcile.js:684-690` | **Removed**: exempt at ACTIVE and STOPPING; diagnostic only |
| STOPPING starvation escalation | `operation-workflow-stopping-starvation.js:129` | **Bypassed and refused**: the early return at `recovery-observation.js:654`, backstopped by `failOperation` |
| recovery-observation STOPPING FAIL edges (old `:655-662`, `:710-716`) | inside `reconcileStoppingOperationProgress` | **Bypassed** by the early return at `:654` |
| `FAIL_STOPPING_RECOVERY` (node recovery, incomplete removal) | `recovery-status-reconcile.js:413-419` | **Removed**: resumes the owner |
| Timeout sweep, local owner | `recovery-timeout.js:188-196, 262` | **Removed**: routed to the owner |
| Timeout sweep, remote-owned post-intent | `checkTimeouts` generic path | Budget-exempt, plus the `failOperation` refusal. **Refused only if the in-memory copy says STOPPING** |
| Drain stale-FAIL (step age) | `recovery-timeout.js:795-797` | **Removed** for ACTIVE and STOPPING |
| Drain R-1c (owner unavailable + dead target) | `recovery-timeout.js:779-785` | Pre-intent only. **Kept as semantic** |
| Drain superseded-target FAIL (remote settle) | `recovery-drain.js:48-56, 611-627` | Still reachable remotely. **Refused by `failOperation`** post-intent (same stale-copy caveat) |
| Target REMOVED or FAILED row, post-intent | `recovery-status-reconcile.js:55-61` | Routed to the owner. Target death FAILs only via `handleReplaceTargetDeath` (below) |
| Dispatch errors (REMOVE_REPLICA send failed, bad answer, missing source) | `dispatch-response-reconcile.js:537, 559, 677, 451-460` | **Refused by `failOperation`**, but the caller still returns `buildFailedOperationResult`. The result misreports "failed" while the row stays STOPPING; no wait is armed on that path, so recovery relies on the fallback or the sweep |
| Executor outcome FAILED | `operation-workflow-executor-outcome-reconcile-methods.js` | **Refused by `failOperation`** |
| Post-intent target death | `operation-workflow-replace-owner.js:519-535` | **Kept as semantic**: FAILED `replace_target_dead_source_retained` only when the target row is FAILED **and** the witness (t itself) still answers STILL_VOTER |
| Remote-owned `checkTimeouts` or orphan sweep | step 5 | Not re-routed. Protected only by the rows above |

**No time-based FAILED route remains after STOPPING**, given `failOperation` sees the current step. I found no route that bypasses `failOperation`.

**Liveness defects in the D2 semantics**
1. **P6 case 2 ("target dead, source still a voter") is effectively unreachable in reality.** The only witness is t, and a dead t cannot answer READ_REPLICA_MEMBERSHIP. So `decideReplaceCompletion` returns UNAVAILABLE, and `handleReplaceTargetDeath` waits `TARGET_DEAD_WITNESS_UNAVAILABLE` **forever** (`:530-534`). The REPLACE then stays non-terminal indefinitely, and the planner stays out. D2 says "fail safely and retain the source". This needs a second witness, or failing from "target dead AND the intent recorded the source as a voter AND no committed removal is observable", and it is an owner-level question.
2. **Target row REMOVED (not FAILED) post-intent** routes to the owner (`recovery-status-reconcile.js:58-61`). `isTargetFailureDetectorDead` is false, the witness is gone, so the REPLACE waits `WITNESS_UNAVAILABLE` forever.
3. **The 1 s fallback polls indefinitely**, with one RPC per REPLACE per second, and `isOperationWithinRetryBudget` drops the uninitialized re-arm past 300 s.

**P4 / P5 / P6 witnesses**

| Property | Witness | Assessment |
|---|---|---|
| P4 | "W5 (D2/P4): time past the former budgets fails nothing after the removal intent" (`:238-258`) | One state only (Φ3/Φ4), only `checkTimeouts` ×2 with a +1 h clock. Green **because** `routeTimeoutSweepToReplaceOwner` short-circuits: it does not exercise the budget exemption or the `failOperation` refusal. No "planted old timeout transition" mutation. Probably red on `527771405` (timeout FAIL) |
| P5 | none | No test compares an immediate removal with a removal after all budgets passed |
| P6 | "W6 (P6): target death after the intent", three subtests (`:260-314`) | Case (a) uses a dead target that **still answers** VOTER, unrealistic per defect 1. Case (b) waits. Case (c) completes. "Alive with slow membership" is W5 |
| D2 restart points 1-5 / P3 (18+3 cells) | none | Not done |

---

## 7. Deferred / looks wrong / contradicts D1, D2 or directive point 6

1. **D1 contradiction (blocker).** R-1a's witness is t, but t's bootstrap still excludes s on this branch (`rebalance-coordinator-operation-creation.js:752`). R-1a is then fail-open (§5): the REPLACE completes right after REMOVE_REPLICA is dispatched, with no committed removal. Nothing fails closed without D1. The rebalancer suite's default fixture witness derives "committed membership" from services rows, which masks this.
2. **The P1 oracle is absent.** Every completion witness uses a double (`replace-witness-fixture.js`) or the row-derived default. None uses a real multi-replica rs-raft REPLACE target. §3's "the oracle must not share the mistake" is unmet.
3. **D2 target-death FAIL is unreachable in practice** (§6 defects 1 and 2). This contradicts D2's "fail safely and retain the source" and leaves non-terminal zombies.
4. **The `failOperation` refusal keys on in-memory `workflowStep`** with no terminal step CAS, so a stale ACTIVE copy can FAIL a durable STOPPING row.
5. **The wake tuple is incomplete** (§1): no attempt state, no source-row class, no dedicated R-1f/W_max backstop. Attempt resolution and source-row retirement rely on the 1 Hz fallback. That meets "backstop recovers" but not "each resolution is a wake" (step 2) or causal latency "attempt resolution -> next decision in 0 owner-clock ms".
6. **BR11 deviation.** Handoff safety accepts any non-source leader, not `lead === t`.
7. **Step 2 residue.**
   - The per-leg evidence maps are not unified into one attempt record.
   - The H-B' methods are stubbed, not deleted.
   - CL-043 can still be reached for a REPLACE on the publication-wait path, and has no R09 note at its site.
   - BR12's deferred-visibility WAIT is not implemented at handoff issue or at the effect boundary.
   - The restart pseudo-attempt (BR10) is not implemented.
8. **Named Step 3 items not done.**
   - The terminal-transition repair does not re-run R-1a (A11.1).
   - There is no `SOURCE_RETIREMENT_OWNED` hand-back state (R-1b), and no per-verdict-change bound on hand-back or wake traffic.
   - The §3.2 checks are a level compare, not checks 1-5.
   - The intent metadata is absent on an idempotent STOPPING transition, which makes C0 = 0.
9. **Directive point 6 status**
   - (i) re-drive: implemented, but only against a D1 witness.
   - (ii) membership wakes the owner: implemented and witnessed piecewise; bootstrap wiring untested.
   - (iii) completion rereads committed membership: implemented but fail-open without D1.
   - (iv) planner cannot remove an active REPLACE's source: **not done** (step 4). `isConcurrentOperationStalePastStepTimeout` (CL-043, `recovery-timeout.js` around `:690`) still treats a STOPPING REPLACE past its step timeout as inactive, so a concurrent REMOVE may be admitted on the partition.
   - (v) no retarget: implemented for priority partitions only.
   - (vi) missed notifications and restarts through the same owner: partial. The timeout sweep is local-only; BR6 epoch gate, orphan sweep and restart tests are not done.
10. **Thin witnesses** (≤3 assertions): W2 (2), W3 (2), "attemptSeq echo" (2, unit-level), "F-b" (3), and "READ_REPLICA_MEMBERSHIP" (one test; no RETIRE_REPLICA_PEER handler test).
11. **Missing anchors:** AN1, AN6 (leader-side loss), AN7 (restart in Φ5), AN10 (T5'' from ACTIVE), AN12. P3 and P5 are absent too. No mutation evidence exists for any family.
12. **Comments claiming more than the code does.**
    - The `operation-workflow-replace-owner.js` header says "under D1 it bootstraps from the committed configuration"; not true on this branch.
    - The wake header lists attempt and membership as waited-on levels; the attempt is absent.
    - BR17 "fails visibly when the readiness owner is absent": `ensureWakeSubscriptions` silently skips.
    - `REPLACE_TARGET_REMOVED_BEFORE_ACTIVE` also fires at ACTIVE.
13. **Open WIP state** (from `e7aaeea9d` artifacts; not reclassified here):
    - 7 convergence reds: dt6 ×5, `dt-formation-barrier-spread-release-oscillation`, `dt-formation-priority-placement-before-active`;
    - a 15-file rebalancer failing list, whose current state is unknown;
    - the "decision boundaries (2)" hook hit named in `a157574bd` is not mentioned as fixed by `fa555bdcf`;
    - the independent R-2 evidence has not been applied to this state.

---

## 8. Addendum by the session-2 implementer (2026-09-26)

Status corrections and cross-checks against the sections above:

- §5 / §7.1 (D1 fail-open) **re-verified first-hand**: `rebalance-coordinator-operation-creation.js:752-757` still passes `excludeReplicaIds: [sourceReplicaId]` for a REPLACE, and `admitReplaceSourceRemovalEffect` (`operation-workflow-replace-owner.js:637-671`) accepts an ABSENT witness at ACTIVE and records C0 from that same view. On this branch alone the REPLACE can therefore complete right after the REMOVE_REPLICA dispatch with no committed removal. This branch must not be A2-gated or landed without the D1 bootstrap owner (sibling branch) - and D1 itself now waits on the committed-membership read (O1). No REPLACE-only guard was added here: D1 constraint 8 forbids working around the R2 boundary.
- §7.13: the 7 convergence reds were re-run by the lead on a quiet machine: 7/7 green at e7aaeea9d and at 527771405 (load-time flakes, not regressions). The independent R-2 evidence (`replace-remove-safety-wake-property.test.js`) runs green on this state (176 assertions; re-run by me after fa555bdcf). Both decision-boundary hits were fixed in fa555bdcf.
- §7.9 (iv) and the CL-043 staleness hole are addressed since: a023223ba (planner set exclusion), 62b256181 (S10 deletions after the census in `s10-dependents-census.md`), 82d594e91 (A6: owner-phase REPLACE never stale by age; CL-043/CL-044 concurrent predicates honour only a failure-detector-dead target).
- Items 3-8, 10-12 of §7 stand as written; they are open work for the quest, not fixed in this session unless the session report says so.
