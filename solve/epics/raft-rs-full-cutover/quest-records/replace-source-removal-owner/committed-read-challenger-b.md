# Challenger B: temporal relations, timing, interleavings, the participation gate and the replay hazard

Subject: `solve/epics/raft-rs-full-cutover/design-committed-membership-bootstrap-read-2026-09-25.md`, sections 3.5, 3.6, 4.3, 4.4. Read-only on worktree `replace-d1` at 4d9c2a790; raft-rs crate `raft-0.7.0` (`~/.cargo/registry/src/*/raft-0.7.0/src`); binding `vendor/raft-rs-wasm/src/lib.rs`; sibling branch `quest/replace-source-removal-owner` (worktree `replace-owner`, e7aaeea9d) read for the interlocks. No src or test changed. One raw-core probe run (`scratchpad/replay-boundary-probe.mjs`, output reproduced in section C).

Owner adoptions received mid-task and applied throughout: O1 (read + gate now; until committed membership is resolved and the role is established the replica may not campaign, vote as a member, lead, commit or claim quorum), O2 unchanged (the joiner keeps itself in its bootstrap this release), O4 (rejoin without a durable record is a typed refusal). State/event census and oracle independence are challenger A's and are named, not re-done.

Conventions: G = genesis set, C_j = the answer (committed configuration applied at leader index j), B = the target's bootstrap ConfState (C_j plus self under O2-unchanged), a = index of the entry that names the target (its AddNode), D = G minus C_j (founders removed by j and not re-added by j), P = C_j minus G. "replayed(i)" is the target's local ConfState after applying entries 1..i over B; "true(i)" the committed configuration at i.

---

## A. Findings

### 1. MsgTimeoutNow is a fourth campaign path the gate does not name
- Classification: NEW SHAPE (existing mechanism, unmodelled cell).
- Evidence: a leadership transfer sends MsgTimeoutNow as soon as the transferee's `matched == last_index` (`raft.rs:1869-1932`, send at `:1928`); the transferee runs `hup(true)` when `promotable` (`raft.rs:2351-2366`), bypassing the runtime's `campaign` refusal (`raft-rs-runtime-owner.js:1093-1111`) and the tick driver. The successor is chosen by `matched`, never by applied (`raft-rs-leadership-transfer.js:106-131`). Under O2-unchanged the target is promotable from creation (probe, section C: `p=1` on every self-included row; `raft.rs:2667-2673`). The REPLACE RF = 1 path transfers to the target (design section 3.7 step 3).
- What the crate does for free: `hup` refuses when a committed-but-unapplied conf entry exists in `[applied+1, committed]` (`raft.rs:1530-1560`, `num_pending_conf` `:1248`); `matched == last_index` implies the target's `committed >= j`, so the scan covers `(applied, j]`.
- Missing cell: section 4.3 row "Leader change" has no "transfer to the target" column; W5 has no transfer during the window.
- Evidence to cover it: W5 variant - transfer to a target with `applied < a <= committed`; expect the `hup` refusal (no candidate role, term unchanged) and, after `applied >= a`, a successful transfer on the retry.

### 2. In-window campaign safety depends on the target's commit knowledge, not on applied alone
- Classification: NEW MECHANISM (a cell the model cannot express with "applied < j / = j / > j").
- Evidence: the `hup` guard above sees only entries the target holds and knows committed. A follower's `committed = min(leader commit, last index it received)` (`raft_log.rs:249-285`); the leader replicates in batches of `max_size_per_msg` = 1 MB (`lib.rs:465-470`). A target whose log ends at n < k, k a conf entry <= j, has `committed = n`, no pending conf visible, and `replayed(n) != true(n)` (probe H6: two committed founders missing at every intermediate index, no error, no transient). Vote requests from such a target are rejected by up-to-date members (`raft.rs:1467`), but a lagging real member grants (`:1462-1466`), and its view's majority does not intersect a real majority (D1 case D arithmetic).
- Missing cell: section 4.3 "During replay" must split into (a) log complete to >= j, applied < j (crate-guarded) and (b) log incomplete (< j) (the gate is the only guard).
- Inequality: the gate holds for `applied < gate_index` regardless of `committed`; it is never replaced by the `hup` check.
- Evidence to cover it: W3 drives the initial replication with an append boundary before a conf entry (two appends, or a reduced per-message size in the raw core) and asserts no candidate role at the boundary; mutation "gate removed" must go red on an H6 history (nothing errors there), not only on H1.

### 3. The retried (already committed) target can also hit the replay error
- Classification: NEW SHAPE.
- Evidence: probe H9 (genesis {1}; +9, -1, -9, +9; C_j = {9}; self 9 as its own bootstrap) errors `removed all voters` at the transient removal of self (`changer.rs:162-186`, `:182`). Section 3.5 models the retried target only as "promotable from creation"; section 4.3 has one hazard cell (fresh target, H1).
- Missing cell: "retried target, own identity transiently removed" -> replay error -> RECOVERY_REQUIRED on an already-committed voter; at RF = 1 that is the group's only member.
- Evidence to cover it: W5 with H9; expect the typed replay error and, separately, that the group is not lost when the target is the sole committed voter (that is an owner question, not a witness).

### 4. The skew shape exists inside the window with no replay signal
- Classification: NEW SHAPE.
- Evidence: probe H6 (genesis {1,2,3}; +4, -2, +5, -1; C_j = {3,4,5}): replay over C_j is a no-op at every step; the target's view omits committed voters 1 and 2 throughout `[1, k)`. `remove` of an absent id is a no-op (`changer.rs:237-247`), `make_voter` of a present voter is idempotent (`:188-196`); only an empty incoming set errors (`:182`). So the model's F3 signal ("replay error, fail-closed") is absent exactly in the split-brain shape; the gate is the only protection.
- Missing cell: section 4.3 "Identity re-added (A4)" is the wrong trigger; the trigger is `D != {}` (any founder removed by j), and error is the special case where a prefix empties C_j's side.
- Evidence to cover it: W3's generated histories must include founder removals after the joiner's genesis with |D| in {1, 2}; the "gate removed" mutation must turn red on |D| = 2, odd n.

### 5. Under O2-unchanged the gate index j does not establish the role; the target can lead before admission
- Classification: NEW MECHANISM (for O1's stated property).
- Evidence: self in the bootstrap (`replica-handler-runtime-metadata-methods.js:278-289`) makes `promotable = true` at construction (`raft.rs:2667-2673`; probe `p=1`). Between `applied >= j` and its own AddNode a > j the target ticks (F6 below) and campaigns (`tick_election` `raft.rs:1081-1091`; `campaign` `:1261-1300` sends to its view's voters). A real voter receiving the higher-term request first steps down (`raft.rs:1328-1372`, `become_follower(term, INVALID_ID)`), then `can_vote` holds (`:1462-1466`, vote and leader both INVALID) and grants when the target's log is up to date (`:1467`). A caught-up unadmitted target therefore wins and leads (`poll` `:2219-2242`). Quorum intersection still holds (self is a phantom only in its own view), so this is O1's letter ("may not become leader"), not a divergence.
- Missing cell: the gate index must be `max(j, a_self)` where `a_self` is the index of the applied entry that names self, or "self named by an applied log entry, not by the bootstrap". Section 3.5's "unconditional" gate at j is conditional on O2's rejected half.
- Inequality: `gate_open_index >= index(AddNode(self))`.
- Evidence to cover it: a caught-up target (`matched == last_index`) with ticks running between j and a; expect no candidate role and no term change; mutation "gate at j only" -> the target leads.

### 6. Whether ticks start at creation is decided by rows, not by the stamp
- Classification: NEW SHAPE.
- Evidence: `deferElection = options.deferElection || isJoiningExistingGroup` (`partition-service-core-base.js:305`); `isJoiningExistingGroup = existingReplicaCount > 0` (`replica-handler-create-methods.js:443`); `existingReplicaCount` is 0 in the fresh window (`replica-handler-transition-policy.js:75-84`: no `leader_node_id` and `created_at === updated_at`) or when no viable leader row exists (`runtime-metadata-methods.js:296-305, 326-328, 367-374`; viability = connected + ACTIVE + ready lease not lapsed, `transition-policy.js:107-139`, lease 15 s `src/constants/time.js:5`). Without deferral the port starts ticks at creation (`raft-rs-operation-port.js:304-306`, `:216-225`); with deferral it stops them (`partition-service-raft-init-base.js:503-510`).
- Missing cell: section 4.2 lists rows as "routing only"; they also decide when the tick driver starts. Section 4.3 needs an input row "join mode from rows (viable leader / fresh window / lapsed lease)" crossed with "target below gate".
- Evidence to cover it: COMMITTED stamp plus a leader row whose ready lease has lapsed; expect ticks at creation and the gate still holding; mutation "gate removed" -> campaign after one election timeout (1.0-2.0 s plus 2.5 s per replica index).

### 7. Tick suppression below the gate has no re-arm event
- Classification: NEW MECHANISM (liveness).
- Evidence: section 3.5 "does not start election ticks while applied < bootstrapIndex". `startElection` is a one-shot latch (`partition-service-raft-init-base.js:654-670`); `startScheduling` is a port command (`raft-rs-operation-port.js:221-225`). Nothing observes the applied index crossing j: `announce` emits role, term and leader only (`raft-rs-runtime-owner.js:979-1000`). A leader needs ticks to heartbeat (`tick_heartbeat` `raft.rs:1095-1123`); a target that becomes leader by transfer (F1) with ticks still suppressed never heartbeats, and its followers time out after 1.0-2.0 s (K7 tiering) and depose it.
- Missing cell: "gate opens" -> tick re-arm, with latency `< electionMin` of the fastest follower (1.0 s at replica index 0).
- Evidence to cover it: W5 asserts a heartbeat within `HEARTBEAT_TICK x tick` (60 ms) of a leader whose gate opened after promotion.

### 8. Sole-voter resume at a transient index with an incomplete log
- Classification: NEW SHAPE of the design's own cell (section 4.3 "Runtime reconstruction").
- Evidence: `resumeAfterReconstruction` campaigns at once when the durable applied ConfState names self as sole voter (`raft-rs-runtime-owner.js:456-478`); restore passes `applied`, `entries`, `hardState` (`:404-424`), so `hup` scans `(applied, committed]`. Probe H1 + self passes through `{9}`; if the log ends there (F2 batch boundary) `committed == applied`, nothing is pending, the campaign wins 1-of-1 (`majority.rs:130-152`), the target leads and commits its own entry at `committed + 1` with a new term - a second committed entry at the index of the group's re-add.
- Missing cell: the reconstruction must be pinned AT the transient sole-voter applied index with the log ending there; the gate must be evaluated inside `resumeAfterReconstruction` from the durable bootstrap index, before `isSoleVoter`.
- Evidence to cover it: W5 with the reconstruction at that index; mutation "resume unsuppressed" -> leader role.

### 9. The (confState, j) pair must come from one durable observation; the core's `applied` is the wrong j
- Classification: NEW SHAPE.
- Evidence: `readStatus` on a busy group answers the last recorded observation (`raft-rs-runtime-owner.js:1040-1046, 1073-1085`, recorded at `announce` `:979-987` and `readGroupStatus` `:1025-1030`), which pairs status and ConfState from one core read (`readGroupObservation` `:1004-1017`). The durable applied index is written per entry inside the drain (`raft-rs-application-transaction-owner.js:45-54`), while the core's `raft_log.applied` moves only at `advance_apply` after all entries of a light ready (`runtime-owner.js:908-917`; `raw_node.rs:703-711`, `commit_since_index` `:311`). Labelling with a j smaller than the index the answered ConfState was applied at opens the gate while the view is replayed over a later configuration.
- Inequality: `j_label >= index of the last conf entry reflected in the answered confState`. The busy path (older observation, newer durable j) satisfies it; a j taken from core `status.applied` (`lib.rs:709`) does not.
- Evidence to cover it: W3 issues the read during a drain that applied a conf entry; mutation "j from core applied" -> a red gate.

### 10. A dropped AddNode(t) is silent and re-driven only by a cache change
- Classification: NEW SHAPE (D1 case-2 mechanism, absent from sections 4.3-4.4).
- Evidence: a conf change proposed while another is unapplied, or while joint, is replaced by an empty normal entry and `propose_conf_change` still returns Ok (`raft.rs:2062-2090`); the port answers CORE_OK and the admission records PROPOSED (`partition-service-raft-membership-administration.js:77-110, 120-134`). Admission runs at initialize and on cache changes only (`partition-service-raft-peer-cache-reconciliation.js:249-293`; D1 classification, case 2). A target that keeps self in its bootstrap and waits for a is then unadmitted until the next row change; the only bound is SYNCING 300 s (`rebalancer-constants.js:88`).
- Missing cell: "AddNode(t) dropped" x "target waiting for a" (and its two-joins instance: t2's AddNode dropped behind t1's pending one).
- Evidence to cover it: two joins with interleaved reads where the second AddNode lands while the first is unapplied; the design must name the re-drive (it says "no new poll").

### 11. Election-timeout tiers depend on the order of the new REPLICA_IDS list
- Classification: NEW SHAPE.
- Evidence: `electionMinMs = base + replicaIndex x 2500` with `replicaIndex = replicaIds.indexOf(self)` and a hash fallback (`replica-election-timeouts.js:34-46`; jitter `src/raft/constants.js:58`, whose comment requires disjoint tiers); the tick count is `ceil(electionMinMs / tickMs)` (`raft-rs-runtime-tuning.js:26-40`). Section 3.3 derives REPLICA_IDS "from identities plus the target" with no order; `identities` is a map keyed by peer id.
- Missing cell: two members computing the same tier from differently ordered lists -> split votes on every election (liveness).
- Evidence to cover it: a static assertion that the stamp's list order is deterministic (identity or admission-index order), and W3 asserting distinct `electionMinMs` per member.

### 12. Interlock: the REPLACE owner's R-1a witness reads a below-gate target as authoritative
- Classification: NEW MECHANISM (cross-branch).
- Evidence (sibling): `SOURCE_RETIRED iff peerId(s) not in voters u votersOutgoing on the witness AND observation.commitIndex >= C0` (`operation-workflow-replace-owner.js:211-226`; amendment-1 `:200-206`); the witness carries commitIndex, term, leader, transfer window - no applied or bootstrap index (`operation-workflow-replace-witness.js:98`); MEMBERSHIP_CHANGED is emitted on every ConfState key change with `commitIndex` (`replace-owner` `raft-rs-runtime-owner.js:1010-1033`). The sibling's premise "a lagging follower can only show s still present" (design 3.1 R-1a) is false under bootstrap-from-C_j: the H1 + self and H9 shapes show s absent transiently, and commit runs ahead of apply: the commit index is persisted at the light ready (`runtime-owner.js:896-905`) before apply admission (`:908-917`), which can wait 120 s (`raft-rs-runtime-owner-constants.js:143-146`); `MsgAppendResponse` leaves in `persistedMessages` before `applyEntries` (`:874-925`). So `commitIndex >= C0` holds while `applied < j`.
- Also: each replayed conf entry that changes the key emits a wake (one per drain), so a replaying target wakes R's lane repeatedly with a below-gate ConfState.
- Missing cell: R-1a x target below gate. The witness must carry `appliedIndex` and the gate state, and R-1a must WAIT while `applied < gate_index`.
- Evidence to cover it: the sibling's AN11 ("commitIndex < C0 -> WAIT") extended to "commitIndex >= C0 and applied < gate -> WAIT"; mutation "R-1a ignores the gate" -> false SOURCE_RETIRED on H1 + self.

### 13. RF = 1: a refused MsgTimeoutNow leaves the sole-voter source in a transfer it cannot abort
- Classification: NEW SHAPE (RF = 1 only).
- Evidence: the transfer's abort runs on the leader's election tick (`raft.rs:1095-1108`); a sole-voter partition never starts ticks (`partition-service-raft-init-base.js:657-660`, `replicaIds.length === 1`). While `lead_transferee` is set every proposal on s is dropped (`raft.rs:2029-2037`). The target refuses `hup` while AddNode(t) is committed-unapplied (F1), so a transfer issued before `applied >= a` leaves s with proposals dropped until the next transfer attempt completes (sibling H-A retry 5000 ms, `operation-workflow-owner-shared.js:388`). Replication to t continues (`handle_transfer_leader` sends the append when not matched, `raft.rs:1935`), so it is bounded, not stuck.
- Inequality: transfer retry interval (5 s) is added to the RF = 1 REPLACE once per premature attempt; the REMOVE_PEER(s) proposal (R-1f) is dropped in that window.
- Evidence to cover it: the RF = 1 witness issues the transfer while t is below a; expect one refusal, no dropped removal counted as issued, completion on the retry.

### 14. The durable record has no bootstrap-index column
- Classification: NEW MECHANISM (schema).
- Evidence: `_raft_rs_applied_state` holds `applied_index` and the five ConfState columns only (`raft-rs-durable-store-constants.js:53-63`); `putAppliedState(groupId, appliedIndex, confState)` (`raft-rs-durable-store.js:303-311`); restore reads `record.appliedIndex` and `record.confState` (`runtime-owner.js:404-424`); `hasDurableRecord` is true on hard state, entries or a non-empty voter list (`:467-471`). Section 3.5's "bootstrapIndex is durable in the same transaction as the index-0 applied state" needs a column (or a row) plus readers on restore, on reconstruction (`replaceRuntime` `:502-533`) and in `resumeAfterReconstruction`.
- Missing cells: "Target restart" (section 4.3) must split into restart before the index-0 transaction (no record; under O4 the E path refuses, and the coordinator re-creates from the persisted stamp `stepsHistory[0]`, `rebalance-coordinator-operation-creation.js:760-771`, within the 60 s creating budget) and restart after it (record with applied 0 and the bootstrap index; restore with the gate).
- Evidence to cover it: restart at applied 0 with no entries -> restore, gate held; mutation "bootstrap index not persisted" -> F8's resume campaign.

### 15. A busy leader makes the read fail closed by timing, not by health
- Classification: NEW SHAPE.
- Evidence: the read bound is the dispatch timeout, 5 s per hop (`operation-workflow-owner-shared.js:347`); the answering `readStatus` on a group with inbound pending is queued behind the drain (`runtime-owner.js:1073-1085`), and a drain waits for persistence admission up to 120 s while a user transaction holds the connection (`runtime-owner-constants.js:143-146`, `whenPersistenceAdmitted` in `finishReady` `:874-925`). So a healthy leader under a long user transaction answers nothing within 5 s; the creation is refused (MEMBERSHIP_UNREADABLE) and re-planned.
- Inequality: `2 x 5 s < 120 s`; the model's "answerer failure" row must add "answerer busy (admission wait)".
- Evidence to cover it: read while the leader's store is inside an open user transaction; expect the typed timeout and the named re-plan wake.

### 16. Snapshot install crosses the gate by an index jump (future, recorded)
- Classification: NEW SHAPE (excluded scope).
- Evidence: `restore` drops a snapshot whose ConfState does not name self (`raft.rs:2585-2597`); a Ready with a snapshot carries no committed entries and moves `commit_since_index` to the snapshot index (`raw_node.rs:517-530`); `putSnapshot` writes the snapshot ConfState (`raft-rs-durable-store.js:319-337`). A snapshot at index s > j opens the gate by the jump and its ConfState supersedes the stamp (correct); the gate must therefore compare against `max(applied, snapshot index)`. No consumer of `snapshotThreshold` (10000, `config-definitions.js:59`) exists under `src/raft` or `src/partition`, so no rs-raft snapshot is produced today.

### 17. Restart classes against the read / stamp / gate sequence (summary)
- Coordinator crash after the read, before `persistNewOperation`: no row, re-plan (modelled).
- Coordinator crash after persist: the stamp is durable and re-dispatched (`operation-workflow-dispatch-response-reconcile.js:417-430`) with unbounded age within the 30 s pending and 60 s creating budgets (`rebalancer-constants.js:86-87`); safe by F1 (no compaction), modelled as "stamp age".
- Target process restart before the index-0 transaction: F14 (no record).
- Target process restart during replay: restore from the applied ConfState and durable applied index (`runtime-owner.js:404-424`); raft-rs re-delivers entries above `applied` (`raft_log.rs:423-440`); exact by induction, provided the bootstrap index is persisted (F14).
- Runtime reconstruction: F8.
- Coordinator re-init on a target node (owner handoff): unchanged for the gate; R-1a interlock is F12.

---

## B. Timing arithmetic (production defaults; every value at the cited line)

| Constant | Value | Where |
|---|---|---|
| raft tick | 20 ms | `config-definitions.js:40` |
| heartbeat | 50 ms -> HEARTBEAT_TICK 3 -> 60 ms effective | `config-definitions.js:39`, `raft-rs-group-constants.js:15`, `raft-rs-runtime-tuning.js:14-24` |
| election min | 1000 ms -> electionTick 50; raft-rs randomizes [50, 99] ticks = 1.0-1.98 s | `config-definitions.js:37`, `runtime-tuning.js:26-40`, `raft.rs:2802-2818` |
| election max (config) | 3000 ms, unused by the rs-raft tuning | `config-definitions.js:38`, `runtime-tuning.js:26-40` |
| per-replica jitter | 2500 ms x replicaIndex (list order) | `src/raft/constants.js:58`, `replica-election-timeouts.js:34-46` |
| recovery retry window | electionTick x tick = 1.0 s (+ jitter) | `runtime-tuning.js:52-54` |
| inbound drain delay | 0 ms; persistence admission wait up to 120 s (poll 10 ms) | `raft-rs-runtime-owner-constants.js:142-146` |
| ready drain bound | 64 cycles | `raft-rs-group-constants.js:26` |
| dispatch timeout (the read bound) | 5000 ms per hop; retry-after 1000; retry 250 -> 8000 ms backoff | `operation-workflow-owner-shared.js:341-348` |
| creation budgets | pending 30 s, creating 60 s, syncing 300 s, removing 60 s | `rebalancer-constants.js:86-89` |
| rebalance cadence | periodic 60 s (+10 s jitter unified), timeout check 1 s, critical delay 5 s | `rebalancer-constants.js:97-102` |
| checkRebalance floor | 1 s priority, 5 s other | sibling K5, `rebalancer-planning-gate-methods.js:716-734` |
| node ready lease | 15 s | `src/constants/time.js:5`, `control-plane-constants.js:146` |
| node heartbeat timeout | 5 s | `config-definitions.js:28` |
| membership publication driver | 5 s | `membership-publication-coordinator-reconcile.js:56` |
| learner promotion proof cadence | 1 s | `partition-service-constants.js:33` |
| voter ready check | 250 ms | `replica-handler-transition-policy.js:26` |
| REPLACE safety fallback / handoff retry / STOPPING budget | 1000 ms / 5000 ms / 60000 ms | sibling design K2, H-A, T-7 |
| formation join budget | 90 s | memory failed-add-retry-latency |
| message groups | out of scope (liferaft); delivery timeout 5 s | `message-group/constants.js:65` |

Inequalities the read + gate need (those the design does not relate are marked NEW):

- I1 (gate window, section 4.4): `T_catchup(applied -> gate_index) <= SYNCING 300 s`. Catch-up is bounded by 1 MB appends x 256 in flight and by apply admission; one 120 s admission stall fits, two do not. NEW: the design bounds the window by "catch-up time" only.
- I2 (formation): `2 x 5 s (read) + T_replan + T_create + T_catchup <= 90 s`. With the 60 s periodic re-plan exactly one refusal fits (design says so); with the 1 s priority floor several fit. The design must name the wake (it says so); NEW is that a busy leader (F15) is a refusal class too.
- I3 (tick re-arm, F7): `T_rearm(gate open -> ticks) < electionMin(fastest follower) = 1.0 s`.
- I4 (transfer, F13): each premature transfer costs one handoff retry (5 s); `T_catchup(applied -> a) < 5 s` keeps it to one.
- I5 (routing hint staleness): `leader_node_id` row lags a leader change by up to the publication driver (5 s) plus lease semantics (15 s); one redirect (design) covers one hop; NEW: a second leader change inside 10 s is MEMBERSHIP_UNREADABLE.
- I6 (F15): `PERSISTENCE_ADMISSION_WAIT 120 s > 2 x DISPATCH 5 s` -> a leader under a user transaction is unreadable by construction; NEW.
- I7 (F12): commit index persisted before apply admission -> `commitIndex >= C0` can hold for up to 120 s while `applied < j`; NEW (cross-branch).
- I8 (F5/F6): with ticks at creation, first campaign at `1.0-2.0 s + 2.5 s x replicaIndex` after create; the gate must be in force from the port's construction, before `startScheduling` at `operation-port.js:304-306`.
- I9 (F10): admission re-drive is event-driven by rows only; `T_admission` is unbounded below SYNCING 300 s; NEW.

---

## C. Replay boundary cases (protocol phase 6, derived statically and confirmed on the raw core)

Semantics (`confchange/changer.rs`): `simple` refuses while joint (`:136-140`) and more than one voter change (`:146-156`); `apply` errors only when the incoming voter set empties (`:182`); `make_voter` of a present id is idempotent (`:188-196`); `remove` of an absent id is a no-op (`:237-247`); `enter_joint` refuses an already-joint config (`:66-75`); `leave_joint` refuses a non-joint one (`:104-110`). `promotable` follows self in voters at each apply (`raft.rs:2667-2673`). `create_node` seeds a full ConfState when `bootstrap.confState` is supplied (`lib.rs:392-401`), voters only from `peers` otherwise (`:374-390`).

Raw-core probe output (`scratchpad/replay-boundary-probe.mjs`, same loader as the design's probe; `p` = promotable after the step):

```
H3 gen{1,2,3} -1,+1 | C_j={1,2,3} self 9 excluded    [1,2,3] -> {2,3}p=0 {1,2,3}p=0
H4 gen{1,2,3} +4,-1,+1,-4 | C_j={1,2,3} self 9 excl  [1,2,3] -> {1,2,3,4}p=0 {2,3,4}p=0 {1,2,3,4}p=0 {1,2,3}p=0
H5 gen{1} +2,-1,+1,-2 | C_j={1} self 9 excluded      [1] -> {1,2}p=0 {2}p=0 {1,2}p=0 {1}p=0
H5 | C_j={1} + self 9                                [1,9] -> {1,2,9}p=1 {2,9}p=1 {1,2,9}p=1 {1,9}p=1
H6 gen{1,2,3} +4,-2,+5,-1 | C_j={3,4,5} self 9 excl  [3,4,5] -> {3,4,5}p=0 {3,4,5}p=0 {3,4,5}p=0 {3,4,5}p=0
H6 | C_j={3,4,5} + self 9                            [3,4,5,9] -> {3,4,5,9}p=1 x4
H1 gen{1} +2,-2,+2,-1 | C_j={2} + self 9             [2,9] -> {2,9}p=1 {9}p=1 {2,9}p=1 {2,9}p=1
H7 gen{1,2,3} joint(+4,-1),leave | genesis {1,2,3}   [1,2,3] -> {2,3,4|1,2,3}p=0 {2,3,4}p=0
H7 | C_j={2,3,4} self 9 excluded                     [2,3,4] -> {2,3,4|2,3,4}p=0 {2,3,4}p=0
H8 gen{1,2,3} joint(+4,-1) only | C_j={2,3,4}        [2,3,4] -> {2,3,4|2,3,4}p=0
H9 gen{1} +9,-1,-9,+9 | C_j={9} self 9 (retry)       [9] -> {9}p=1 {9}p=1 ERROR removed all voters
```

Boundary cases and what the evidence must hit:

- B1. `D = {}` (no founder removed by j): replay is exact at every index (H2 from the design, H3, H4, H5). Evidence: one founder removed and re-added (H3) and a REPLACE cycle (H4) in W3's generator.
- B2. `D != {}` and no prefix empties C_j's side: `replayed(i) = true(i) minus D plus (P not yet added at i)` - the D1 missing-voter shape with k = |D intersect true(i)| inside the window, phantoms only stricter; no error, no transient (H6). Evidence: |D| = 2 with odd n; the "gate removed" mutation must go red HERE.
- B3. `D != {}` and some prefix empties C_j's side: `removed all voters` (H1 self excluded; H9 self included but transiently removed). Evidence: both, as typed RECOVERY_REQUIRED; H9 is the retried target, not the fresh one.
- B4. Self in B and every other member of C_j transiently removed: transient `{self}` (H1 + self, H5 + self at step 2 is `{2,9}` not sole; H1 + self is sole). Evidence: F8's pinned reconstruction and a tick-driven campaign attempt at that index.
- B5. Joint history replayed over the final simple configuration: no error (H7); a bootstrap taken while joint is refused by the design (JOINT), and that is the only reachable joint error class (simple over joint `:136-140`, leave over non-joint `:104-110`). The design's F4 sentence "replaying a joint enter/leave over a later bootstrap would fail" is wrong for H7; it holds only for a joint B. H8 shows a transient joint view with identical incoming and outgoing sets (harmless). Evidence: none needed while production emits single changes (`raft-rs-operation-port.js:103-123`); W3's generator must include enter/leave the day it does.
- B6. Label consistency (F9): `j_label >= index of the last conf entry reflected in confState`; the busy read satisfies it, core `applied` does not.
- B7. Gate index under O2-unchanged (F5): `gate_index = max(j, a_self)`; for B1-B5 with self in B the window `[j, a_self)` is where the target is promotable with a phantom self.

---

## D. Owner questions (temporal and ingress perspective)

Q2. Earliest points at which a new replica can act.
- Vote: on the first inbound MsgRequestVote after `create_node`; the voter side has no membership check (`raft.rs:1460-1494`), the ingress admits any well-formed envelope for the group and peer (`raft-rs-ingress.js:57-74`). The vote counts only if the candidate's own configuration names the voter (`tracker.rs:303-323`).
- Term increase: the first inbound message with a higher term (`raft.rs:1328-1372`), or its own `become_candidate` (`:1145-1160`).
- Campaign, by path: (a) tick driver - the port starts ticks at construction unless DEFER_ELECTION (`raft-rs-operation-port.js:304-306`), deferral is row-derived (F6), first `tick_election` after 50-99 ticks (1.0-2.0 s) plus 2.5 s x replicaIndex, if `promotable` (true with self in B) and `hup` finds no pending conf; (b) `PartitionService.initialize` campaigns at once when `replicaIds.length === 1` (`partition-service-raft-init-base.js:587-603`); (c) learner promotion - the leader's proof is granted on `learnerMatchIndex` vs commit (`partition-service-learner-promotion-proof-methods.js:95-110`; it needs the leader's progress entry, so after AddNode(t) applied on the leader) -> `becomeFollower` -> `startElection` -> ticks (`partition-service-learner-promotion-methods.js:416-422`); (d) MsgTimeoutNow from a transfer, immediately when `matched == last_index` (`raft.rs:1925-1932`, `:2351-2366`); (e) runtime reconstruction sole-voter resume (`runtime-owner.js:456-478`); (f) rejoin restore = (a) with rows deciding deferral.
- Become leader: on a won poll (`raft.rs:2219-2242`) - one election timeout after ticks start, or at once by (b), (d), (e).
- Accept a proposal: as leader (`raft.rs:2021-2100`); as follower it forwards to `leader_id` once any MsgAppend/heartbeat set it (`:2312-2322`, `:2324-2330`), dropping before that.

Q3. Before committed membership is known / resolved for self.
- With the read at creation, C_j is known before the port opens (design 3.4). "Resolved for self" is later: the AddNode(t) at a. Before a, under O2-unchanged, all of these can happen: vote (yes), term bump (yes), campaign via (a), (b), (d), (e) (not (c): promotion needs the leader's progress entry), lead (yes, F5 when caught up), forward proposals (yes), lead-and-commit (yes if elected). Only self-exclusion (the rejected O2 half) closes (a), (d), (e) at the crate (`promotable = false`: `tick_election` `:1083`, TimeoutNow `:2360-2365`) and the runtime closes the explicit campaign (`runtime-owner.js:1103-1111`).

Q4. Can a nonmember depose a legitimate leader?
- Yes, today. A higher-term MsgRequestVote makes the leader and every follower step down before any membership check (`raft.rs:1328-1372`, `become_follower(term, INVALID_ID)`); pre-vote and check-quorum are off (`raft-rs-group-constants.js:13-18`). This is the D1 case-2 measurement (term 1 -> 15 in 3 s, five re-elections). Response-class messages from an id without a Progress entry are refused at `raw_node.rs:402-411` (`is_response_msg` `:68-77`) and recorded as inbound refusals (`runtime-owner.js:1284-1291`, `:736-753`) - harmless. Higher-term MsgAppend/heartbeat from a nonmember would also depose, but a nonmember can only send those as leader of its own view.
- With `check_quorum` on, a vote request within one election timeout of leader contact is ignored (`raft.rs:1333-1360`, `in_lease`) - closes tick-driven disruption while the leader heartbeats. With `pre_vote` on, a pre-vote never bumps terms (`:1374-1385`) and an empty-log nonmember is rejected (`:1467`), but a caught-up nonmember's pre-vote is granted for a future term (`:1462-1466`) unless in lease - so pre-vote alone is not enough; both together are, while the leader is live.

Q5. Does raft-rs reject such traffic, or must the runtime gate it?
- raft-rs rejects only responses from unknown ids (`raw_node.rs:407-410`); request-class traffic (vote, pre-vote, append, heartbeat, snapshot, transfer, timeout-now) reaches `raft.step`, whose term handling runs first. So the crate does not gate vote requests from nonmembers.
- The runtime's single ingress is `enqueueStep` -> `admitRaftRsMessage` (`raft-rs-runtime-owner.js:1425-1431`; `raft-rs-ingress.js:171-183`), reached from the transport through `handleTransportMessage` -> `port.step` (`partition-service-entry-apply-base.js`, `raft-rs-operation-port.js:240`). It checks envelope routing and schema only (`ingress.js:57-74, 102-123`) and is, by the section 6 binding direction, handed no core and no handle so that it cannot read the receiver's configuration (`ingress.js:9-13`).
- If the owner wants filtering by committed membership, that is the one point, and it is a change to that section 6 contract: feed `admitRaftRsMessage` the receiver's last observed ConfState as data (`group.statusObservation.confState`, recorded at `announce` `:979-987`) and the message type. The crate imposes the shape of the rule: refuse MsgRequestVote / MsgRequestPreVote whose `from` is not in `voters u votersOutgoing` of the receiver, and only when the receiver's own gate is open; never refuse MsgAppend / MsgHeartbeat / MsgSnapshot / MsgTimeoutNow / MsgTransferLeader on membership, because a below-gate target's view can lack the current leader (a leader added after the target's replayed index, and H6's view lacks founders that may lead) - a filter there deadlocks the catch-up that the read exists to enable. The alternative that needs no runtime rule is `check_quorum` (the crate's own lease), which the group constants deliberately leave to the election-safety re-measurement (`raft-rs-group-constants.js:4-11`, `raft-rs-election-safety.js:41-56`).

Q7. Joint configurations.
- The read refuses a joint answer (design 3.1). `create_node` could seed a joint ConfState (`lib.rs:392-401`), but a simple change replayed over a joint view is refused (`changer.rs:136-140`), so the refusal is right. A joint history replayed over the final simple configuration is fine (H7); a bootstrap mid-joint is the only reachable error class (B5).
- The gate in joint: a quorum is both majorities (`quorum/joint.rs:56-70`); `votersOutgoing` are voters for the gate's "may not claim quorum membership", and for R-1a's absence test (sibling, correct).
- A target added while a joint change is in flight: the leader drops the simple AddNode ("must transition out of joint config first", `raft.rs:2064-2069`) silently (F10); auto-leave is appended at `commit_apply` when applied reaches `pending_conf_index` (`raft.rs:957-985`), so a read in that window answers JOINT and the creation re-plans.

Q8. Can the read fail or be stale, and how does it fail closed?
- Leader change mid-read: NOT_LEADER (role checked at the answer), or a stale-but-committed answer from a deposed leader that has not yet seen a higher term (a leader steps down only on a higher-term message, `raft.rs:1328-1372`); stale is safe (applied is a subset of committed; replay from 1 applies the rest, F1/F2), at the cost of a longer window. A conf change committed after the answer: replayed (F1). An answer computed before a commit that removes a voter: the target's B still names it; correct until the removal replays.
- Fail-closed timing: 5 s per hop, two hops (`operation-workflow-owner-shared.js:347`), typed MEMBERSHIP_UNREADABLE, nothing persisted (the read precedes `persistNewOperation`), re-plan at the next wake: 1 s floor on priority partitions, 5 s otherwise, 60 s periodic; formation margin per I2. A busy leader (F15) is a further refusal class the design does not list.

Q9. The cycle "membership to communicate, communication to read membership".
- The read is not a raft message. It is a node-level replica-handler RPC over the message router (`user-table-leader-placement-cure.js:89, 395-400`; dispatch `replica-handler-lifecycle-methods.js:51-79`) that needs only a node address (the row's `leader_node_id` as a routing hint). Raft transport addresses are formatted from `(node_id, service type, replica_id)` (`runtime-metadata-methods.js:279-285`), so the target can receive raft traffic as soon as its address is registered (`partition-service-raft-init-base.js:404-407`).
- Receiving grants no authority: the ingress admits by group and recipient only (`ingress.js:57-74`); `handle_append_entries` has no membership check (`raft.rs:2452-2513`); `leader_id` is set from any MsgAppend (`:2324-2330`). Authority comes only from (i) the leader's configuration naming the target, so that its acks count (`handle_append_response` needs a Progress entry, `raft.rs:1608-1625`; `tally_votes` over `conf.voters`, `tracker.rs:303-323`) and (ii) the target's own campaign ability (`promotable` plus the gate). The demux already separates the two; the read closes the cycle at the node level.

Q10. The minimal discovery channel.
- READ_COMMITTED_MEMBERSHIP itself: one RPC to the row's leader node, one redirect on NOT_LEADER using `leaderAddress` from the answering replica's status (`raft-rs-status-observation.js:58-70, 104-108`). It grants nothing: admission is only ever the leader's own AddNode proposal, driven by rows (`membership-administration.js:120-134`, `peer-cache-reconciliation.js:249-293`). No new raft message type, no transport change, no poll.

M5. Property: an unadmitted replica that appears in projected topology and knows peer addresses must not repeatedly disrupt the legitimate group.
- What makes it hold: (1) self excluded from B -> `promotable = false` (`raft.rs:2667-2673`, probe `p=0`) -> no tick election (`:1083`), no TimeoutNow (`:2360-2365`), runtime campaign refused (`runtime-owner.js:1103-1111`) -> it sends no vote requests at all. O2-unchanged forgoes this. (2) With self in B the gate must suppress ticks, explicit campaign and the resume campaign until admitted (gate index `max(j, a_self)`, F5), and re-arm ticks after (F7). (3) Residual: a lost admission (F10) leaves a promotable, gated target that never opens - it does not disrupt, it stalls until SYNCING. (4) The crate's own tools for the residual window are `check_quorum` (lease, `:1333-1360`) and `pre_vote` (`:1374-1385`, `:1467`), both off in production (`group-constants.js:13-18`); an ingress filter is possible only for vote requests at an open-gate receiver (Q5).
- Evidence that proves it: the D1 case-2 diagnostic re-run on the fix (100 ms samples over 3 s: the members' term constant, zero step-downs, leader unchanged) with the target's row never reaching the members; mutation "gate at j only, admission dropped" -> the term rises at the 1.0-2.0 s cadence; and the leader's `inboundStepRefusals` (`raft-rs-status-observation.js:128`) showing only response-class refusals from the target. Which mechanism: raft-rs (`promotable`) if self is excluded; the runtime's gate (tick driver, `campaignGroup`, `resumeAfterReconstruction`) if self stays in B - no third place.

---

## E. Verdict on model completeness

The model is complete for the steady-state cells it names (a conf change before, during or after the read; a leader change during the read; the fresh-target H1 error) and its two structural claims survive: any committed C_j is a safe bootstrap because replay from index 1 is exact from j onward (B1-B3), and the leader is the right answerer. It is incomplete on the axis it was asked to cover: the window is described by applied alone, but campaign safety inside it depends on the target's commit knowledge (F2), the window does not end at j under O2-unchanged but at the target's own admission entry (F5), and four campaign paths exist where the design lists three (F1, F8). The replay-error cell is the wrong signal - the split-brain shape replays silently (F4, H6) and the retried target can error (F3, H9). The gate has no schema (F14), no re-arm (F7) and no event pairing with its own label (F9). Two timing rows are missing (busy leader F15, dropped admission F10), one liveness pair is unrelated (transfer retry vs RF = 1 no-tick source, F13), and the sibling's completion verdict reads a below-gate target as authoritative (F12). None of these needs a new concept; each is a cell, an inequality or a pinned history to add before evidence is written.
