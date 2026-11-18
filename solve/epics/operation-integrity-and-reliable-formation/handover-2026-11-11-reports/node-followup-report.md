## Follow-up report: four open items, plus the two raft reds

Three of the four items are done, each with a test that failed before the change and passes after. Item 1 is half done: (a), the raft-side refusal, is implemented; (b), the coordinator-to-node cancellation, is designed below but not implemented. Item 2 (the M1 witness on real participant debt) was not started. The log-level change and the root cause of the two raft reds are done. Git state is unchanged. Every test command ran after the thermal wait, niced, one file at a time.

### 1. REPLACE target-death hazard

**(a) Leader-side live-quorum refusal: done.**
- New owner `src/raft/raft-rs-voter-liveness.js`. The leader records, per voter, the tick at which it last saw raft-rs `recentActive` set; it samples after every drain of its group, only while it leads. A voter is live while that tick is within 2 election timeouts of the group's own tick count; the leader itself is always live. Only the core's progress and the group's ticks are read, never a row, cache or projection. The window exists because raft-rs check-quorum clears the flag once per election timeout, so the flag alone flaps. The live set's key is announced as a new event, `RAFT_EVENT.VOTER_LIVENESS_CHANGED`, on every change and on the first sample of each leadership.
- Admission, `src/raft/raft-rs-conf-change-admission.js` `removesLiveQuorum`: a change that takes voters out (REMOVE_NODE or ADD_LEARNER_NODE) is folded over the core's voters, and refused with `REMOVES_LIVE_QUORUM` (CORE_REFUSED, retryable, core never entered) when the live members of the *resulting* voter set are fewer than its majority. Only resulting voters are counted, so removing a dead voter from a group whose survivors are a live quorum passes; the witness checks this. `confChangeProposalRefusal` now takes `liveVoters`; both callers pass it: `raft-rs-runtime-owner.js` (new `groupLiveVoters`, plus a tick count on every tick command) and `raft-rs-membership-transition-runtime.js`.
- Proposer side: `raft-rs-group-membership-admission.js` maps `REMOVES_LIVE_QUORUM` to DEFERRED (re-driven). The row-driven re-drive in `partition-service-raft-peer-cache-reconciliation.js` also wakes on `VOTER_LIVENESS_CHANGED`. The event is added to `raft-rs-operation-port.js` and `raft-rs-runtime-owner-constants.js`.
- Dropping a stale deferral: a peer whose row serves again now has its deferred row-driven retirement dropped (`forgetDeferredRetirement` in `partition-service-raft-membership-administration.js`). Before, a REMOVE_PEER deferred from an earlier REMOVING row was re-proposed by any later settlement even after the row reverted; the witness hit exactly this.
- Limit: liveness depends on the window, not instantly on death. A removal committed within about 2 election timeouts of a voter's death can still pass; that case needs (b).
- Witness `test/partition/partition-removal-live-quorum.test.js` (real group {x, s, t}, real release owners), 1/1 after the fix:

  | Step | Before the fix | After the fix |
  |---|---|---|
  | t dies, then s's REMOVING row reaches x | s removed (`sourceStillVoter: false`) | s stays a voter |
  | x afterwards | pre-candidate, no quorum | still leader |
  | write at x | `partition_write_cutover_paused`, cohort broken | succeeds |
  | the dead t is then removed | `deadRemoved: false` | removed, 2 survivors |
  | write after re-release | none | succeeds |

- Tests adjusted for the new rule: a freshly elected leader has not yet heard its voters, so an immediate removal now defers until the first sample (production re-drives on that sample). Three tests that proposed a removal right after the election now let the leader hear its voters first (3 rounds): `replica-membership-witness.test.js` 2/2, `transfer-leadership-drop-classification.test.js` 2/2, `test/node/replica-handler-membership-relay.test.js` 2/2. `partition-admission-redrive-wakes.test.js` classifies the new event as a re-drive wake: 33/33.
- Removal-related files re-run, all green: conf-change-pending-deferral 5, evidence-o1-real-chain 7, conf-change-leader-only 1, bootstrap-committed-membership 4, evidence-o1-proposal-ingress 6, membership-changed-event 3, drain-order 7, runtime-captured-inbound-service-native 4, removed-leader-step-down 2, decision-inputs 4, attack-matrix 17, evidence-o1-admission-liveness 3, runtime-turn-integrity 5, drain-oracle 138, size-split-transport 80, group-retirement-fences 59, consensus-exit 17, replace-owner-recovery-equivalence 264, retiring-row 3, leader-source 18, deferred-row-write 12, reasked-after-completion 16.

**(b) Cancelling the node-side removal: not implemented. Proposed contract:**
- Request: a new replica operation `CANCEL_REPLICA_REMOVAL {operationId, partitionId, replicaId}`, sent by `handleReplaceTargetDeath` before it records TARGET_DEAD_SOURCE_RETAINED; idempotent per (operationId, replicaId).
- Node: the removal owner (`replica-handler-remove-execution-methods.js`) reads its own committed membership. Still a voter: release this removal's consensus-exit wait with a new exit reason CANCELLED (the backstop never retires the port), restore the row from REMOVING to its serving status through the removal owner's durable row write, and lift the serving-admission fence; the survivors' `forgetDeferredRetirement` then drops their re-drive. Not a voter: the RemoveNode already committed.
- Typed answers: `CANCELLED` (source retained), `ALREADY_REMOVED` (the removal happened), `NOT_IN_PROGRESS` (no removal under that operation), `UNAVAILABLE` (membership unreadable; retried).
- Coordinator outcome: on `ALREADY_REMOVED` the operation must not report "retained"; it needs a new failure reason, e.g. TARGET_DEAD_SOURCE_REMOVED.
- Separate defect: today a BACKSTOP exit retires the port of a replica that is still a voter. With cancellation in place, that exit should become a typed wait instead of a retirement.

### 2. M1 witness on real participant debt: not done
Not started. Still open: the paired witness (a durable PREPARED participant plus a closed connection must not permit retirement, deletion or completion, built with the real asynchronous removal start), and rebuilding `test/node/replica-handler-remove-closed-service.test.js` on a non-empty store. The current code satisfies the rule: at `replica-handler-remove-execution-methods.js` ~:276-290 `execution.retiringRowDurable` is false at that check on every path, so CLOSED always defers before a durable row and is never treated as DRAINED. The witness on real debt is what is missing.

### 3. REPLACE variant of the B2 real-group witness: done
`test/partition/partition-removal-subject-leadership.test.js` is now parameterised by subject and adds a REPLACE-source case: a founding replica whose target (admitted last) is already a voter, on an ordinary partition and on partitions-p1. Before (old self-proposal restored): both new cases failed (`removedBySurvivor: false`, `selfRemovals: 2`). After: the file passes 4/4; the subject hands off, a survivor removes it, writes land without restart, and on partitions-p1 the leader-clear UPDATE lands.

### 4. STOPPING re-send of a plain REMOVE: done
`src/rebalancer/operation-workflow-remove-safety-evaluator.js` `classifyStoppingRemoveResend`: a plain REMOVE at STOPPING observes its subject's row through `observeStoppingReplicaProgress`. Retiring or absent: the effect already took, the re-send is SAFE. Still serving: the first delivery never took effect, the full evaluation runs. Unreadable: a named DEFER (`REMOVE_SAFETY_BLOCKED`). Test appended to `test/rebalancer/operation-workflow-remove-safety-universal-floor.test.js`: 10/11 before, 11/11 after. Neighbours green: committed-node-remove-safety 94, concurrent-down-target 4, spread-nonregression 70, removal-leadership-gate.property 37.

### Log level for the other-operation REMOVE: done
`src/node/replica-handler-remove-request-methods.js`: `REPLICA_ABSENT_NOT_BY_OPERATION` is now logged at info (`REMOVE_ALREADY_REMOVED` with the code); the error-level log is kept for every other failure. `replica-handler-remove-closed-service` 5/5.

### The two raft reds (participation-gate B12, evidence-o1-anchors 7/8)
- Green at HEAD 103f132c1, checked in a `git archive HEAD` extract with node_modules symlinked: 5/5 and 8/8.
- Cause: the earlier gate writer changed `memberRouteOf` in `src/rebalancer/operation-workflow-replace-surviving-membership.js`. At HEAD a REPLACE source with no `sourceNodeId` was routed to an undefined node and still got an answer; now it is routed through `removalSubjectNodeIdOf`, which returns null when the node is absent, so R-1a answers `completion_authority_leader_unreachable` when the source is the leader.
- Fix: the new behaviour is correct (a route is never invented from an absent field). The fault was in the two tests, whose hand-built REPLACE operations omitted the `sourceNodeId` every production REPLACE carries. I added it in both, with a comment; now 5/5 and 8/8. `operation-workflow-*` is in my set.

### Gates
- eslint clean on every file I changed.
- Navigability and fallback closure: nothing in my files. The six remaining navigability violations belong to others: `partition-cdc-propagation-subscriber.js:408` and `:481`, `partition-cdc-delivery.js:587` (CDC writer); `replica-dispatch-service.js:57` and `:79` (`authorizeLegacyRuntimeRemoval`, `readLegacyRemovalObservation`; another writer is editing this file); `live-query-startup-wiring.js:351`.
- The fallback-closure inventory pins are still not moved; they mix every writer's sites.
- I stayed out of `operation-workflow-transition-retry.js` and `replica-operation-repository-*`.
- Two rebalancer reds not mine, likely that writer's area: `replace-replica-workflow.test.js` (6 failing; messages mention the transition retry and the repository-owned visibility contract) and `replace-source-removal-owner.test.js` W13 (deferred-visibility snapshot waiting at the removal effect boundary).

### For the lab, please run
- `test:complexity`, `test:complexity:cognitive` and the duplication ratchet.
- `npm run audit:file-size` (`raft-rs-runtime-owner.js` grew by about 15 lines; the new files are all under 120 lines).
- Full `test/raft`, `test/node`, `test/partition`, `test/rebalancer` and `test/message-group`. The new liveness rule makes a removal proposed right after an election wait for one heartbeat sample, so any other test that does that will show up here.

### Supersession text (pinned decision changed)
> R09 supersession, 2026-11-11: a leader's conf-change admission refuses a removal whose resulting voters hold no live quorum by its own check-quorum activity (REMOVES_LIVE_QUORUM, retryable, re-driven on VOTER_LIVENESS_CHANGED). The previous reading "the crate's drop rules plus REMOVES_LAST_VOTER and REMOVES_LEADER are the only admission refusals" is superseded. The legitimate removal of a dead voter from a group whose survivors are a live quorum is unaffected. A removal deferred by a peer's REMOVING row is dropped when that row serves again.

### Still open
1. Item 1(b): the cancellation contract above.
2. Item 2: the M1 paired witness on real PREPARED debt.
3. A BACKSTOP exit must not retire a replica that is still a voter (part of 1(b)).
