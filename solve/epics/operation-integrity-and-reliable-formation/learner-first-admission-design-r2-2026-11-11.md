# Learner-first replica admission through one membership port: design, Revision 2 (2026-11-11)

This is a read-only design unit over HEAD 103f132c1 plus the uncommitted tree. Nothing is built and nothing in the repository was edited.

**Status:** proposed Revision 2. It answers the independent vet's REVISE and is awaiting re-vet and the owner's decisions (listed at the end).

**Markers:**
- [inferred] means reasoned, not read.
- [read at line] means only the cited lines were read, not the whole module.

**Enumeration scripts** (in-memory only; no cluster was started):
- `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/a72adb86-b330-4c2f-8a5a-17ddde9202f7/scratchpad/learner-design-r2/enum.mjs`
- `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/a72adb86-b330-4c2f-8a5a-17ddde9202f7/scratchpad/learner-design-r2/enum2.mjs`
- `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/a72adb86-b330-4c2f-8a5a-17ddde9202f7/scratchpad/learner-design-r2/enum3.mjs`

**Crate:** raft-rs 0.7 was read from `scratchpad/raftcrate/raft-0.7.0`. The cargo-cache crate's sha256 is `f12688b2…5bae`, which equals `vendor/raft-rs-wasm/BUILD.md:45`.

## Bottom line (what changed from Revision 1)

1. **REPLACE is not joint in this epic.**
   - The recommendation is simple changes only: AddLearner, then a port-checked promotion, then an operation-bound RemoveNode.
   - When the source is dead, the dead source is removed first (an explicit R09 supersession of the contract sentence at `authority-and-recovery.md:212-213`, for the dead-source case only).
   - The exhaustive enumeration shows this reaches exactly the same targets as joint REPLACE, with no wedge and with equal exposure in the dead-source case. It also keeps every joint refusal site in the read path unreachable.
   - Joint REPLACE is fully specified as a deferred, separately sealed unit (U6). The decision rules that would bring it forward are stated.
2. **Voter-add rule (c) gains the |V| = 1 exception** (etcd's 1 -> 2).
   - Re-running the reviewer's enumeration with the revised rule gives 0 "stuck although a live quorum exists" states and 0 admitted wedging transitions.
   - The only exposure is the recorded RF=1 window.
   - RF=1 is production-reachable, opt-in only (user tables with `PARTITION_DEFAULT_REPLICA_COUNT=1`).
3. **The cancel race is removed, not fenced.**
   - CANCEL_REPLICA_REMOVAL is deleted.
   - Once a removal is decided it rolls forward, gated only by the leader's live-quorum ingress.
   - A REPLACE source removal additionally requires the target to be a live committed voter in the same port turn.
   - No revocation therefore exists to race. If the owner keeps cancellation, the mechanism is (b), a revocation in the partition's own log, with the interleavings in §C7. Option (a) is rejected: it needs a quorum-confirmed (ReadIndex) cancel turn, which the port does not have.
4. **The 2026-09-25 replay statement is settled.** O1's genesis-in-log model was never built: the owner deferred it on 2026-09-26 ("later R2 target, not this release"). The hazard F4 named is nevertheless closed by the 2026-10-05 fold, which skips configuration entries at or below the bootstrap index j (`raft-rs-runtime-owner.js:1140-1153, 1163-1167`). What remains is a joint C_j at bootstrap, already refused by the read and the stamp.
5. **The first unit is not "the voter-add check alone".**
   - Alone, that check would refuse every failure-recovery REPLACE whose source is dead, for ever.
   - The first unit is the check together with dead-source-first REPLACE and a bounded refusal. It closes the traced wedge without any learner change.

## A. Current state

Revision 1 §A is unchanged and still holds. It is supplemented with these facts, read for this revision.

**Raft core**
- A1. raft-rs 0.7 `Changer::simple` refuses more than one voter changed (`changer.rs:144-153`). Promote-plus-remove in one change is therefore only possible as a joint entry.
- A1. A simple AddNode of a learner is one voter change and is accepted. AddNode of a non-member adds a voter directly (`changer.rs:188-196`).

**Leader-side mechanisms that exist today**
- A2. The leader's port already holds a current-tenure liveness record built from `Progress.recent_active` (`raft-rs-voter-liveness.js`).
  - It covers learners too, since it iterates `status.progress`.
  - It is cleared on a term or role change (`:96-104`).
  - It counts only the leader live until sampled (`:73-77`).
  - It announces VOTER_LIVENESS_CHANGED (`raft-rs-runtime-owner.js:1446-1451`).
- A3. A leader that its applied configuration no longer names already steps down by a transfer (`raft-rs-leadership-transfer.js:191-200`; `raft-rs-runtime-owner.js:1453, 1492-1505`). The witness is `test/raft/raft-rs-backend/removed-leader-step-down.test.js`.
- A3, finding routed to the raft owner (R17) [inferred, not run]. raft-rs `maybe_commit` unwraps the leader's own progress (`raft.rs:937-946`). A removed leader that still has entries after its removal index (proposed while the removal was pending) and then receives an append response that advances commit would panic. In WASM that is an abort (`vendor/raft-rs-wasm/src/lib.rs:917-918`, no unwinding). This exists today for a replica elected while holding the entry that removes it, so it is not introduced here. It is folded into experiment (ii).
- A4. The admission ingress (`raft-rs-conf-change-admission.js:167-219`) refuses NOT_LEADER, REMOVES_LAST_VOTER, REMOVES_LEADER and REMOVES_LIVE_QUORUM, and defers on a pending change or a joint configuration. It checks nothing for a voter add.
- A4. The port still passes a raw `{changes}` array straight through (`raft-rs-operation-port.js:174-177`).

**Proposers of RemoveNode today** (from the census)
- A5, path 1: the row-driven retirement. It fires on a services row DELETE, REMOVING or REMOVED, or a claimed `failed-create:` FAILED row (`partition-service-raft-peer-cache-reconciliation.js:118-147, 171-222`). It is re-driven on CONF_CHANGE_APPLIED, LEADER and VOTER_LIVENESS_CHANGED (`:234-250`).
- A5, path 2: the coordinator's RETIRE_REPLICA_PEER (`operation-workflow-replace-source-retirement.js:105-132`). Its handler checks no row, generation or cancellation (`replica-handler-membership-methods.js:49-72, 105-120`; `partition-service-raft-membership-administration.js:306-330`).
- A5: failed-target cleanup goes through path 1 only (`replica-handler-failed-create-publication.js:257-303`).

**CANCEL_REPLICA_REMOVAL today**
- A6. It is answered by the source replica, not the leader. It performs a compare-and-set of the services row from the exact REMOVING generation to ACTIVE before answering (`replica-removal-cancellation.js:1-56`; `replica-state-machine-removal-cancellation.js:31-44`).
- A6. It documents its own residual: a RemoveNode held in another survivor's log can still commit, and that is settled afterwards as REMOVED_OUTSIDE_REMOVAL (`replica-removal-cancellation.js:41-48`; `replica-removal-settlement.js`).

**How the coordinator learns of leader changes**
- A7. There is no partitions-table leader wake for operation workflows. The coordinator's cache listener ignores every table except SERVICES and REPLICA_OPERATIONS (`operation-workflow-recovery-reconcile-shared.js:80-91`).
- A7. The only leader wake is the REPLACE owner's level-triggered wake (`operation-workflow-replace-owner-wake.js:1-60`):
  - the local consensus relay of LEADER_CHANGE, TERM_CHANGE, MEMBERSHIP_CHANGED and CONF_CHANGE_APPLIED for replicas this node tracks (`partition-service-raft-lifecycle-wiring.js:138-157`; `replica-handler-membership-relay.js:76-113`);
  - a forward from the node hosting a REPLACE target to a remote owner (`:384-402`);
  - readiness publications;
  - a 1 s fallback timer.
- A7. The confKey it compares includes `votersOutgoing` (`:365-372`).

**Managed split and merge**
- A8. Neither checks for unresolved replica operations, learners or SYNCING rows (`managed-split-workflow.js:190-330`; `managed-merge-workflow.js:257-330`).

**RF=1** (census report)
- A9. Production-reachable for user tables when the operator sets `PARTITION_DEFAULT_REPLICA_COUNT=1`. The schema allows exactly 1, or 3 and above (`src/config/config-schema-constants.js:87-89`; commit 1bbbe17dc, 2026-11-05). The default is 3 (`config-definitions.js:78`).
- A9. System partitions are always founded as three voters (`system-table-schemas-constants.js:186-190`; `seed-partitions-phase.js:129-170`).
- A9. The production planner can pair ADD with a NODE_NOT_IN_TARGET REMOVE into a REPLACE for an RF=1 partition (`move-planner-move-calculation-methods.js:748-800`). No planner guard refuses it. Whether real scoring flips to a new node is [inferred].
- A9. The test `replace-real-group-handoff.test.js` builds its REPLACE directly, not through the planner (`replace-real-group-harness.js:988-1012`).

## B. History and supersessions

The Revision 1 table stands, with these additions:

| Date | Record | What it says |
|---|---|---|
| 2026-09-21 | `formation-seed-decoupling/evidence/raft-backend-evaluation-verification-2026-09-21/round-2.md:179` | Measured on a raw core: "the new leader does leave" after a leader change while joint with auto-leave, at 4 stops. The same record flags the TODO at `raft.rs:962` ("it may never auto_leave if leader steps down before enter joint is applied"). |
| 2026-09-25 | `raft-rs-full-cutover/design-committed-membership-bootstrap-read-2026-09-25.md` F4 (`:40-43`), `:351` | **Omitted from Revision 1.** "raft-rs only accepts simple changes outside a joint configuration … Replaying a joint enter/leave over a later bootstrap would fail"; "Enabling joint changes later invalidates replay over a later bootstrap and requires O1's genesis model." O1 (`:329-335`) = the R2 model: founders committed into the log, joiners open with an empty configuration. |
| 2026-09-26 | Owner decision O1/O2/O4 (`quest-records/replace-source-removal-owner/owner-decision-o1-o2-o4-committed-read-2026-09-26.md`) | One committed-membership read plus a participation gate **now**. "Genesis-in-log = later R2 target, not this release." **O1's genesis model was not built.** GENESIS stamps (`raft-committed-membership-stamp.js:8-11, 409-430`) are the founding provisioner's stamp kind. They are not founders in the log. |
| 2026-10-05 | `raft-rs-full-cutover.md:908-920` (identity-open-refusal) | A COMMITTED joiner opens as a learner of C_j. "Configuration entries at or below j are folded into C_j and not applied to the core again." Implemented at `raft-rs-runtime-owner.js:1140-1153, 1163-1167`. |
| 2026-11-05 | commit 1bbbe17dc | RF=1 admitted as an explicit configuration. |
| 2026-11-11 | CANCEL_REPLICA_REMOVAL (D2) | Built, with the residual stated in §A6. |

**How the replay statement is settled.**

- What "replay over a later bootstrap" breaks: without the fold, a joiner bootstrapped at C_j re-applied the whole log from index 1 over C_j (F1).
  - A joint enter at index e ≤ j applied over the already-later C_j walks it through configurations the group never held, the F3 class ("removed all voters").
  - If C_j is itself joint, replaying any earlier enter refuses with `config is already joint` (`changer.rs:71-73`), and a simple change refuses with `can't apply simple config change in joint config` (`changer.rs:136-139`). A refused committed entry becomes a group host failure on every replay (`raft-rs-runtime-owner.js:1185-1191`).
- The fold removes the first class entirely. No entry at index ≤ j reaches `apply_conf_change`.
- Entries above j apply over C_j, which is the true configuration at j, so a joint pair above j applies exactly as it did at the leader.
- The second class needs C_j to be joint. Both the read (`raft-rs-committed-membership-read.js:96-98`) and the stamp (`raft-committed-membership-stamp.js:376-377`) refuse that.
- Therefore: F4's sentence is superseded by the 2026-10-05 fold, not by O1. That supersession needs its own R09 record and the witness W-FOLD-JOINT (§E), which is owed only if joint is adopted (U6).
- Snapshots: a snapshot's ConfState, joint included, is restored natively (`confchange/restore.rs`). The checkpoint format already carries `votersOutgoing` and `autoLeave` (`snapshot-checkpoint-format.js:83-121`).

**Supersessions this revision requires** (each an explicit R09 record):
- **R09-a**, `authority-and-recovery.md:212-213`, for the dead-source case only (§C4).
- **R09-b**, semantics: SYNCING = ConfState learner; ACTIVE = committed voter; "admitted" = admitted as a learner. This covers the `replica-admission-from-committed-operation` statement and the `raft-rs-full-cutover.md:953-972` "a target becomes a voter on the row change that records its fact" sentence.
- **R09-c**, the D2 CANCEL_REPLICA_REMOVAL contract is deleted (roll-forward instead).
- **R09-d**, the FreshMG quest statement and receipts, if its permit layer is deleted (owner decision).
- **R09-e**, F4/`:351` of the 2026-09-25 design, only if U6 (joint) is ever sealed.
- `design-replace-source-removal-owner-2026-09-25.md:568-569` ("production is simple-only") is **kept** under the recommendation.

## C. Target design (restated in full)

### C1. ADMIT adds a Raft learner

- The request is the same and the committed-operation read is the same.
- The leader's port, in one core turn, acts on its own applied ConfState for the target's peer id:
  - **absent** -> propose ADD_LEARNER_NODE with the existing three-key admission context (an already accepted shape, `raft-rs-committed-membership-context.js:146-191`); answer `LEARNER_PROPOSED`;
  - **learner** -> register promotion interest (C2); answer `LEARNER_ADMITTED`;
  - **voter** -> answer `ALREADY_VOTER`.
- The admitting step narrows to SYNCING. The header and code mismatch at `partition-replica-admission.js:127-132` is removed.
- A learner holds Progress, so log and snapshot catch-up run before it counts. Snapshot receiver admission already accepts learners (`snapshot-receiver-admission.js:20-22`).

### C2. Promotion: one leader-side decision, triggered by the leader's own progress

**Trigger**
- The target re-sends the idempotent ADMIT_REPLICA every 1 s (the existing cadence).
- On the leader, a re-send while the target is a learner records `{peerId, operationId}` in the port's volatile promotion-interest set. This is volatile execution state, rebuilt by the next re-send after a leader change, and never authority.
- The decision is evaluated after **every drain** of the leader's group, in the turn where `sampleVoterLiveness` already runs (`raft-rs-runtime-owner.js:1446-1451`). It is not evaluated only on the 1 s re-send. A learner that catches up is promoted within one drain.

**Predicate P_time.** All of the following, read in one core turn:
- role LEADER;
- an entry of this term applied;
- no pending conf change;
- the target is a ConfState learner;
- `progress[t].state == Replicate`;
- `progress[t].matched >= c_prev`. Here c_prev is the leader's commit index recorded at its sample taken at least one heartbeat interval earlier in the **same tenure**, cleared with the liveness tenure. Until a second sample exists the answer is `PROMOTION_PROGRESS_UNSAMPLED`.
- Rule (c) (C3) holds.

P_time bounds lag in time, not in entries. Under steady load, commit moves on, but a learner in Replicate with pipelined appends passes once it has caught up to where the group was one heartbeat ago. That does not depend on the write rate, provided the learner applies at least as fast as the group commits. A learner that cannot keep up is never promoted, which is correct: it is backpressure (R12), recorded as a finding, not a promotion.

**Safety: why promoting a learner k entries behind cannot lose a committed entry or wedge the group.**
- *No committed entry can be lost.* An entry e committed under V is on at least maj(|V|) members of V. In V' = V ∪ {t}, the members that can lack e number at most |V| − maj(|V|) + 1.
  - |V| = 2m+1: m+1 lacking, against maj(2m+2) = m+2 needed.
  - |V| = 2m: m lacking, against maj(2m+1) = m+1 needed.
  - So no candidate lacking e can collect a V' quorum. This is the single-server-change intersection argument, and it does not depend on t's log.
- *No wedge.* Rule (c) guarantees maj(|V'|) live pre-existing voters, so commit never waits on t. The lag only lengthens the time during which t is a voter that does not acknowledge new entries. That is exposure (a further failure among V would then wait on t's catch-up), not a correctness or liveness defect. k or c_prev bounds that exposure window.

**Decision rule for experiment (iii)** (remote learner, steady seed-local write load, sampled per drain). Let F be the longest run of consecutive failing samples before the first pass, and L the time from learner ACTIVE-in-Replicate to the first pass:
- If, in every run, the max L ≤ 5 s, then use **P_time** as specified.
- If any run has L > 5 s but every run passes within 30 s, use P_time and record the measured worst L against the 60 s node sync bound (`replica-handler-constants.js:19-20`). Formation slack is computed below.
- If any run fails to pass P_time within 30 s while `matched` keeps advancing (the gap is bounded but larger than one heartbeat's commits), use **P_k**: `state == Replicate ∧ commit − matched ≤ k`, with k = 2 × the 99th-percentile per-sample gap measured over the passing interval of the worst run. Its safety is the same argument as above.
- If `commit − matched` grows without bound in any run, neither predicate applies. The learner cannot keep up. Record a backpressure finding against the write path (R12), and do not promote.
- "Promote on the leader's progress event" is the trigger in every case. The 1 s re-send is only interest registration.

**Formation timing.**
- Promotion adds at most one drain plus one commit round per voter added, and every step stays inside the 420 000 ms sealed formation bound (`fresh-formation-user-table-routability/quest.json` constraint 1).
- The node-side 60 s sync bound is consumed by catch-up, not by promotion.
- Nothing is widened.
- If experiment (iii) shows the worst L exceeds what the formation's per-step budget allows, that is a stop condition for the owner: no bound is widened.

**Named refusals:** `PROMOTION_PROGRESS_BEHIND`, `PROMOTION_PROGRESS_UNSAMPLED`, `LEADER_TERM_UNAPPLIED`, `NOT_LEARNER`, `CONF_CHANGE_PENDING`, `VOTER_ADD_LACKS_LIVE_QUORUM`, `LIVENESS_UNSAMPLED`. There is no proof RPC, and the learner never self-reports.

### C3. The voter-add rule at the one ingress (`confChangeProposalRefusal`)

For a change that adds peer x to the incoming voters, with V the current voters and V' = V ∪ {x}:
- **(a)** x is a ConfState learner. An AddNode of a non-member is refused `ADD_VOTER_NOT_LEARNER`. Until U2 lands, the rule applies to today's ADD_NODE of a non-member with (a) suspended (§F U1).
- **(b)** The promotion predicate holds (C2). This is from U2 on.
- **(c)** `|live(V') \ {x}| >= floor(|V'|/2) + 1`.
- **(c-1)**, the one-voter exception: if |V| = 1, V = {leader}, the leader is live (always true for itself), and x is live in the leader's current-tenure record, then the promotion of x is admitted with exposure `ONE_VOTER_GROWTH` recorded on the operation row's step history. This is the only voter-add that may produce a configuration whose quorum needs the added member. etcd makes the same exception, and no rule can avoid it: 1 -> 1 replacement has no intermediate state that needs only one member.
- **(d)** Liveness is the leader's current-tenure record (§A2), and `LIVENESS_UNSAMPLED` is answered until the first sample in this tenure.
- A refusal is a typed wait, woken by CONF_CHANGE_APPLIED, LEADER or VOTER_LIVENESS_CHANGED. There is no "add as voter" path.

**Bounded refusal (no "refused for ever").**
- `VOTER_ADD_LACKS_LIVE_QUORUM` persisting past the operation's existing SYNCING budget (300 s, `rebalancer-constants.js:88`) fails the operation, typed as `VOTER_ADD_LACKS_LIVE_QUORUM`, and nothing is promoted.
- The planner then re-plans from the committed configuration.
- Repair-first planning (C9) guarantees the re-plan is a reachable path.

**Recorded exposure in {A, D} for RF=1**
- Between promotion of D and removal of A, both A and D are needed for quorum.
- If D dies in that window, the group cannot commit until D returns. D's disk is durable, so a restart restores it. If D is permanently lost, A holds the data but no automatic path exists; the exits are rebuilding or dump and restore (owner ruling B).
- The window is: one commit round (promotion), plus a hand-off, plus one commit round (removal).

**RF=1 REPLACE A -> D, the steps**
1. AddLearner D.
2. Catch up; P_time holds.
3. Promote D under (c-1).
4. Named leadership transfer A -> D through the partition's one transfer issuer (D is now a voter).
5. The coordinator's RETIRE for A at D. The ingress passes: REMOVES_LEADER does not apply since D leads, and the live quorum of {D} holds.
6. {D}.

The enumeration found exactly this path (`addLearner, promote, remove`).

**Re-run of the reviewer's enumeration** (voters 1-5; every live subset; fresh nodes live; actions addLearner, promote, simple remove under today's REMOVES_LIVE_QUORUM and REMOVES_LAST_VOTER, joint replace; breadth-first search toward the target).

*Wedge definition:* an admitted change whose result has no live quorum when the members it adds are counted dead.

| Variant | Cases | Reached | Stuck with a live quorum | Admitted wedging transitions | Recorded exposures |
|---|---|---|---|---|---|
| Today (unchecked ADD_NODE, no joint) | 137 | 137 | 0 | **110** (incl. `{A,B,C} --addVoter(N1)` with C dead: the traced wedge) | – |
| Vet's original (c), joint, no exception | 137 | 100 | **37** (incl. RF=1 `move(A)`) | 0 | 0 |
| **Revised (c)+(c-1), joint** | 137 | 101 | 36* | 0 | 10 (RF=1 only) |
| **Revised, no joint, dead-source-first (R09-a)** | 137 | 101 | 36* | 0 | 10 (RF=1 only) |
| Revised, no joint, contract read literally (no dead removal before target voter) | 137 | 65 | 72 | 0 | 0 |
| Revised, joint, contract literal | 69 | 69 | 0 | – | – |

\* The 36 residual cases are all one class: "move a **live** member while **keeping** a dead member" (for example {A,B,C}, C dead, move A -> N1 keeping C). `enum2.mjs` shows two things about this class:
- All 36 are exactly the cases where the move's result has no live quorum without the joiner (`|live(V\{m})| < maj(|V|)`). Any rule that does not count the unproven joiner must refuse them. They are correct refusals, not stuck states.
- Every one of the 68 combined "move + repair the dead member" targets is reached, under both joint and no-joint.

So, with repair-first planning (C9): every reachable configuration with a live quorum has a path to its target, no admitted change can wedge, and the only exposure is the RF=1 window.

The literal-contract no-joint row (72 stuck) is why the no-joint design needs R09-a.

**Sample paths:**
- {A,B,C-dead} repair: `addLearner(N1), remove(C), promote(N1)`.
- {A,B,C} live move of C: `addLearner(N1), promote(N1), remove(C)`.

### C4. REPLACE without joint (recommended)

**Live source S**
1. ADD part: C1 and C2 for target T.
2. On ACTIVE (T is a committed voter by the owner's committed read), the owner hands leadership off S if S leads. The removal leadership gate and subject hand-off already exist (`partition-service-removal-subject-handoff.js`).
3. The owner sends RETIRE `{operationId, replicaGeneration, kind: SOURCE}`.

The leader's port takes the RemoveNode(S) only if, in one turn:
- it is the leader, has applied an own-term entry, and has nothing pending;
- **T is a live committed voter** of its ConfState (`REPLACE_TARGET_NOT_LIVE_VOTER` otherwise; retryable, bounded by the STOPPING budget, then the operation fails and the planner removes the dead T by an ordinary REMOVE);
- REMOVES_LIVE_QUORUM, REMOVES_LEADER and REMOVES_LAST_VOTER pass.

This keeps "target died -> keep the live source" without any cancellation (C7).

**Dead source S.** S is dead when the leader's current-tenure liveness record, read in the port turn of a RETIRE `{kind: DEAD_SOURCE_FIRST}`, does not hold S, and removing S leaves a live quorum.
1. RemoveNode(S) first, under the unchanged REMOVES_LIVE_QUORUM.
2. AddLearner T, catch-up, promote under (c).

Is R09-a sound? Removing a voter the leader has not heard for ≥ 2 election timeouts (`LIVE_WINDOW_ELECTION_TIMEOUTS`, `raft-rs-voter-liveness.js:36`), when the survivors hold a live quorum:
- loses no committed entry: the survivors are a quorum of the old configuration, by the same intersection argument;
- does not reduce fault tolerance: {A,B} and {A,B,S-dead} both tolerate zero further failures;
- makes the promotion of T admissible under (c), whereas promoting T into {A,B,S-dead} is exactly the traced wedge.

If S was only partitioned rather than dead, removing it costs a re-replication, never safety. The supersession is stated as: "a source the leader's current-tenure liveness record shows dead, whose removal leaves a live quorum, may be removed before its target is a voter; a live source is retired only after the target-voter and hand-off evidence." The failure-handling sentence (`:213-216`) is unchanged.

**Plain REMOVE:** RETIRE `{kind: REMOVE}` under the same ingress.

**Failed target (a learner):** RETIRE `{kind: FAILED_LEARNER, operationId, targetReplicaGeneration}`.
- The ingress takes RemoveNode(t) only if t is a **learner** of its ConfState. Removing a learner changes no voter, so the live-quorum rules are vacuous.
- The generation binding prevents removing a re-created learner of a later operation. Replica ids are allocated per operation (`rebalance-coordinator-operation-creation.js:690-705`) [inferred: distinct per operation].
- This is the R1 route the vet found missing. The operation row is terminal FAILED with the claimed `failed-create:` token (`replica-handler-failed-create-publication.js:257-303`). The leader reads it through the existing committed read; it is not REMOVING, and that is no longer required.

### C5. One meaning of "learner"

- The application role is a projection of the replica's own applied ConfState: VOTER, LEARNER or ABSENT.
- It is written by the replica and announced on every applied conf entry **and on snapshot restore**. The restore applies a ConfState and must emit MEMBERSHIP_CHANGED and the ACTIVE-wait event; this is witnessed.
- Deleted:
  - `becomeFollower` as promotion (`partition-service-learner-promotion-methods.js:526`);
  - the count-check owner;
  - the proof RPC;
  - the publication-epoch proof.
- The membership read gains LEARNER.
- ACTIVE means "the target's own applied ConfState names it a voter" for every partition class, as an event wait.
- REPLACE remove safety reads committed membership. Its committed-voter credit already exists (`operation-workflow-committed-voter-floor.js`).

**Remaining row `raft_role` readers**
- `priority-publication-safety-topology.js:137-148, 212-237` (voter-ready, leader and source-role states feeding remove safety and publication leader safety).
- `move-planner-placement-tail-methods.js:143-175` (removal-source leader classifier, after the planner's live leadership).

They stay readers of the services-row projection, which from U2 on is written only from applied ConfState. They are therefore never ahead of committed membership.

Every safety decision among them that gates a removal (`isVoterReadyReplicaTopology` used by `remove-safety-*` and the voter floor) is already backed by the committed-voter credit, which runs when a row is not credited. From U2 on, the row voter test stops being a credit at all: it becomes a routing hint, and the floor credits only from the committed read. The leader-role reads stay hints: leadership is rechecked by the port's REMOVES_LEADER refusal.

### C6. A failed target never counted

- It stays a learner. It is removed by the FAILED_LEARNER RETIRE (C4), which is always committable.
- The row-driven retirement (`partition-service-raft-peer-cache-reconciliation.js:118-147, 171-250`) is deleted.

### C7. The cancel race: deleted by roll-forward

**Rule.** There is no cancellation of a decided removal.
- A RemoveNode enters a log only through the leader's ingress on an operation-bound RETIRE (C4). Once in any log it either commits or is overwritten. The operation records what committed.
- A FAILED operation that races a committed removal is settled by the committed effect: REMOVED_OUTSIDE_REMOVAL (`replica-removal-settlement.js`, existing owner). The planner re-plans from the committed configuration.
- Fault tolerance is never worse than with cancellation. In the live-source case the ingress refuses the source removal while the target is not a live voter. If the target dies after the RemoveNode entered the log, {A,B,T-dead} tolerates zero failures, the same as {A,B,S,T-dead}, and the planner repairs T.
- CANCEL_REPLICA_REMOVAL, its handler, the state-machine compare-and-set and `operation-workflow-replace-source-cancellation.js` are deleted (R09-c).

**Interleavings under roll-forward**
- *Leader change, then re-drive.* RETIRE goes to the new leader (NOT_LEADER answers name it). The new leader takes RemoveNode only after an own-term entry is applied with nothing pending, and only with T a live voter. An inherited RemoveNode in its log commits as part of its first own-term commit, and the settlement owner records it.
- *Coordinator re-drives RETIRE after the operation FAILED.* RETIRE carries `{operationId, replicaGeneration}`. The leader's committed read of the operation row (begun after it gained leadership, the existing R-1f read) refuses a terminal operation with `OPERATION_TERMINAL`. A RETIRE whose read linearized before the FAILED write can still commit a removal. That is roll-forward: settled, never unsafe, because the ingress live-quorum check ran in the proposing turn.
- *Inherited RemoveNode in a follower's log.* It commits only if the new leader's log holds it (log matching). Then it is a committed effect and is settled. Otherwise it is overwritten.

**If the owner keeps cancellation**, use (b), a revocation in the partition's own log:
- Mechanism:
  - REVOKE_REMOVAL `{subject, operationId, generation}` is a normal partition command, proposed by the leader.
  - CANCELLED is answered only by the leader, after that entry at index r is **applied locally** with the subject still a voter of the ConfState at r. ALREADY_REMOVED is answered otherwise.
  - The ingress refuses RemoveNode(subject, generation) when its applied state holds a revocation of that generation, or when its own tenure has one pending.
- Interleavings:
  - *Revoke, then leader change, then re-drive.* r is committed, so every later leader holds r (Leader Completeness) and applies it before any own-term proposal (the own-term-applied gate). It refuses with `REMOVAL_REVOKED`.
  - *Read before, completion after.* There is no cross-group read: the ingress reads its own applied state in the proposing turn.
  - *Inherited RemoveNode.* At an index below r it commits before r, so at r the subject is absent and the answer is ALREADY_REMOVED. Above r it is impossible: any leader that proposes above a committed r has applied r first.
  - *Coordinator re-drive after CANCELLED.* Refused, terminal for that generation.
- Cost: a new committed command, an applied-state record carried by snapshots, and a durable shape change.

**(a) is rejected.** The row lives in the services partition, a different Raft group. A deposed leader that does not yet know it is deposed can pass its own-term check and answer CANCELLED while the real leader's read (begun after it gained leadership, before the compare-and-set) mints a permit after it. Closing that needs a quorum-confirmed (ReadIndex) cancel turn, and none exists: it is "the recorded R5 follow-up" (`operation-workflow-replace-surviving-membership.js:44-48`).

**What remains of CANCEL_REPLICA_REMOVAL if REPLACE becomes joint (U6):** nothing for REPLACE, since there is no separate source RemoveNode. The same roll-forward rule applies to plain REMOVE.

### C8. Message groups

- Delete the cache-row admission (`reconcileRaftPeersFromCache`).
- Delete the FreshMG permit layer (`proposeAuthorizedGroup{Learner,Promotion,Removal}`, the repository permit methods, `raft-rs-membership-transition*.js`); this is the owner's decision. Its in-turn promotion check is subsumed by C2 and C3.
- Message-group REMOVE gets a RemoveNode through the C4 route.
- Message groups never go joint.
- Moving mg-1 off the seed and unparking message-group placement remain separate owner items.

### C9. Planner

- **One unresolved membership operation per partition.** A non-terminal ADD, REPLACE or REMOVE row blocks a further one for the same partition, enforced in the planner. It is witnessed against the existing `replace-in-flight-blocks-planning.test.js`.
- **Repair before move.** When the partition's committed configuration holds a voter the leader's liveness record shows dead, the only membership operation planned is the repair of that voter (dead-source-first REPLACE or REMOVE). It is not a live-member move. Whether today's planner orders it this way is [inferred: not established].
- **Split and merge** are refused while the partition has a non-terminal membership operation, or a committed ConfState with learners or outgoing voters. The topology adapters already read voters and learners (`managed-split-topology-adapter.js:164-174`). The refusal is typed and retried on the partition's membership wake.

### C10. Formation

- **Priority partitions:** +L(J1), promote (4V), +L(J2), promote (5V), then remove the seed replicas one at a time (3V on 3 nodes). Rule (c) holds at each promotion: 3 live seed voters ≥ maj(4); 4 live ≥ maj(5).
- **Ledger:** +L(J1), promote (4V), hand off, remove a seed replica (3V); then +L(J2), promote, remove.
- **Default system partitions:** serialized per C9.
- At no step does a slow or failed joiner count for quorum.
- Unchanged: while every voter is on the seed, seed loss is total loss.

### C11. The version switch

- Old-style in-flight operations (voter-first ADD, row-driven retirement, CANCEL) are **drain-required, not supported across the switch**.
- Enforcement: the coordinator at start reads non-terminal `replica_operations` that lack the new `membershipProtocol` version in `stepsHistory[0]`. It refuses to drive them, failing them typed as `MEMBERSHIP_PROTOCOL_UNSUPPORTED` after one committed read of their effects. A committed effect (voter added, source removed) is kept and the planner re-plans from it.
- The upgrade note says to quiesce membership operations before a rolling upgrade, as the epic already requires for split and merge (`raft-rs-full-cutover.md:893-895`).

## D. Durable state, wire and pins

**No accepted bytes change.**
- The raw `{changes}` passthrough is deleted (`raft-rs-operation-port.js:174-177`). Every proposal goes through the normaliser.
- No joint shape is introduced; the decoder stays single-change, and U6 widens it only if adopted.
- `replica_operations` gains no column and no step. `stepsHistory[0]` gains `membershipProtocol: 2`, and `ONE_VOTER_GROWTH` exposure records in step history.
- Services `raft_role` is projected from applied ConfState.

**Wire**
- ADMIT_REPLICA answers gain LEARNER_PROPOSED, LEARNER_ADMITTED, ALREADY_VOTER and the C2/C3 named refusals.
- The promotion-proof request and response are deleted.
- RETIRE_REPLICA_PEER gains `{operationId, replicaGeneration, kind ∈ {SOURCE, DEAD_SOURCE_FIRST, REMOVE, FAILED_LEARNER}}`.
- CANCEL_REPLICA_REMOVAL is deleted.

**Pins**
- `test/shards/impact-contracts.json` references CANCEL and RETIRE (grep hit).
- Whether a transport schema pin covers these shapes was again not determined [open: a grep of `test/shards/impact-contracts.json` and transport schema tests is owed in U0].

## E. Invariants and witnesses

Every witness runs on real rs-raft groups from the production entry.

| ID | Invariant | Witness |
|---|---|---|
| I1 | No voter set contains a replica that has not passed C2 in the current leader term, except (c-1). | Drop appends to T: it stays a learner and writes commit. |
| I2 | No voter-adding change is proposed without (c) or (c-1). | {A,B,C-dead}: promote D refused; the dead-source-first REPLACE then completes. RF=1 A->D completes with ONE_VOTER_GROWTH recorded. |
| I3 | No pending conf change is ever uncommittable while a live quorum of its pre-change configuration exists. | Kill T at each stage of the REPLACE; a write and a later RemoveNode commit after each. |
| I4 | A failed target never counted. | – |
| I5' | Every RemoveNode commits only through an operation-bound RETIRE at the leader's ingress. A FAILED operation racing a committed removal ends REMOVED_OUTSIDE_REMOVAL with a live quorum. | Inherited entry; RETIRE re-driven after FAILED; target death after the source RemoveNode was proposed. |
| I6 | `raft_role`, ADMIT answers and ACTIVE agree with the replica's own applied ConfState, **including after snapshot restore**. | A learner caught up by snapshot after compaction. |
| I8 | Lab three-node formation: no control-plane voter set contains an unproven replica, and a joiner stopped mid-catch-up never stalls system-table writes. | – |
| I9 (static) | Exactly one src module proposes conf changes; no AddNode of a non-learner after U2; no row-driven RemoveNode; no raw `{changes}`; no producer of a joint entry. | Census test in the style of `production-raft-call-census.js`. |
| I10 | The promotion bound: promotion within L_max of P_time under steady load. | Experiment (iii) promoted to a witness. |
| I11 | No split or merge starts while a learner, a joint configuration or an unresolved membership operation exists. | – |

**Owed only for U6 (joint):**
- I7: joint always leaves across leader death (experiment (i)).
- W-FOLD-JOINT: joiners bootstrapped before, inside (bounded wait) and after a joint pair equal the leader's ConfState at every applied index, across restart.
- I12: an outgoing-only source elected inside the joint appends the leave, then steps down by transfer, **with data proposals in flight** (experiment (ii) plus the §A3 panic check).

## F. Staging

Every intermediate tree is safe, and no supported operation is refused for ever. The reviewer's order was checked against the code and adjusted, because the decoder widening and joint units are deferred and the first unit needs dead-source-first.

| # | Unit | Files (principal) | Pins today's behaviour | Witnesses | Size | Join-coupled (full lab formation) |
|---|---|---|---|---|---|---|
| U0 | Seal the quest; R09-a/b/c (and d if decided); pin grep; owner decisions | records only | – | – | S | no |
| **U1 (first)** | (c)+(c-1)+(d) at the ingress for **today's ADD_NODE** ((a)/(b) suspended); bounded refusal -> FAILED; dead-source-first REPLACE ordering (RETIRE DEAD_SOURCE_FIRST); repair-before-move planner rule | `raft-rs-conf-change-admission.js`, `raft-rs-voter-liveness.js` (read), `raft-rs-group-membership-admission.js`, `operation-workflow-replace-owner.js`, `-replace-source-retirement.js`, `replica-handler-membership-methods.js`, planner move-calculation | `conf-change-leader-only`, `conf-change-pending-deferral`, `partition-peer-admission`, `admission-redrive*`, `evidence-o1-admission-liveness` (test/raft/raft-rs-backend); `replace-real-group-handoff` (RF=1 B13/V2); `replace-real-group-target-death-cancel` | I2, I3 (voter-first form), RF=1 | M | **yes** |
| U4 | One unresolved membership operation per partition; split/merge exclusion | planner, `managed-split-workflow.js`, `managed-merge-workflow*.js` | `replace-in-flight-blocks-planning`, `managed-split-admission-reliability.integration` | I11 | S-M | **yes** (serializes formation) |
| U2 | Learner-first ADD + C2 predicate + role projection (old U2+U4 merged): ADD_LEARNER at ADMIT, promotion at the leader drain, LEARNER membership state, ACTIVE = committed voter, delete `becomeFollower` promotion, the count-check owner, the proof RPC and the publication-epoch proof; (a)/(b) enabled | `partition-replica-admission.js`, `raft-rs-group-membership-admission.js`, `raft-rs-operation-port.js` (raw passthrough deleted), `raft-rs-runtime-owner.js` (drain hook), `partition-service-learner-promotion-*`, `learner-promotion-progress.js`, `raft-rs-committed-membership-read.js` | `learner-promotion-count-check-inputs`, spread-cure-transition-authorization pair, `bootstrap-committed-membership`, `committed-membership-*`, formation-release pair | I1, I4, I6, I8, I10 | L (net deletion) | **yes** |
| U3 | Operation-bound RETIRE (all kinds); delete row-driven retirement; FAILED_LEARNER route; delete CANCEL (roll-forward); generalise the consensus-relay forward to every remotely owned non-terminal membership operation whose subject or target this node hosts | `partition-service-raft-peer-cache-reconciliation.js`, `partition-service-raft-membership-administration.js`, `replica-removal-cancellation.js` (+ state-machine, contract), `operation-workflow-replace-source-cancellation.js`, `operation-workflow-replace-owner-wake.js`, `replica-handler-failed-create-publication.js` | `replica-removal-settlement`, `removal-leadership-effect-race`, `replace-real-group-target-death-cancel` (rewritten to roll-forward), `fresh-create-claimed-cleanup-never-admitted` | I5', I9 | M-L | **yes** |
| U5 | Message groups: delete the cache admission (+ FreshMG layer if decided); message-group REMOVE through U3 | `message-group-*`, `raft-rs-membership-transition*.js`, `replica-operation-message-group-membership-authorization.js` | `message-group-learner-promotion*.integration`, `message-group-fresh-identity-replacement.integration`, `message-group-membership-semantic-port` | I9 | L (deletion) | no for the FreshMG deletion (no production caller); yes for the message-group REMOVE route [inferred: message groups never change membership in production today] |
| U6 (deferred; separately sealed) | Joint REPLACE: U6a decoder widening (decode only) + every §C12 site to its joint behaviour + I7/I12/W-FOLD-JOINT; U6b proposer | §C12 table | – | I7, I12, W-FOLD-JOINT | L | yes |

**Order:** U0 -> U1 -> U4 -> U2 -> U3 -> U5 -> (U6 only by owner decision).

**Why U4 precedes U2:** U2 deletes the count-check owner, and the planner's per-partition bound must already exist. This answers the vet's staging objection.

**Parallel work** (separate worktrees, one per quest):
- U1 and U4 touch disjoint files and can be built in parallel. They land serially, each with its own lab formation proof.
- The FreshMG deletion half of U5 can be built at any time after the owner's decision.
- U2 and U3 are serial: U3's FAILED_LEARNER route assumes learners exist.

**Safety of each intermediate tree:**
- After U1: voter-first ADD still exists, but the traced wedge cannot be entered. A dead-source REPLACE completes by remove-first. A live move into a group holding a dead member fails bounded and is re-planned as a repair. RF=1 still works.
- After U4: serialized operations only.
- After U2: learners exist. Removal is still the old row-driven path, which works and is unchanged. The cancel residual is unchanged and stays recorded.
- After U3: one removal path.

**First-unit analysis** (the vet's candidate "voter-add live-quorum check alone"). Alone it starts refusing:
1. Every failure-recovery REPLACE whose source is dead: {A,B,S-dead} + T voter-first, live 2 < maj(4). The target ADD runs before the source removal, so this is refused **for ever**, because S never returns. That breaks recovery, so the check cannot ship alone.
2. Every live move or REPLACE into a group holding a dead non-source member: these are the 36 correct refusals. They wait until the bound fails them.
3. Nothing in formation, where every voter is live, beyond up to two election timeouts of LIVENESS_UNSAMPLED after a leader change.

Hence U1 = the check + dead-source-first + bounded failure + repair-before-move. It needs R09-a in U0.

### C12. Joint census (every site that refuses or mis-handles a joint configuration)

**Under the recommendation:** every row below is unreachable. There is no producer, guaranteed by I9 and by deleting the raw passthrough. The sites stay as typed refusals, and the witness is the static census.

**Under U6:** the right-hand column applies.

| Site | Protects | Required joint behaviour (U6) |
|---|---|---|
| `raft-rs-committed-membership-read.js:96-98` (bootstrap/retirement read JOINT) | A joiner's C_j must be non-joint (§B replay) | Answering half waits, bounded by the dispatch timeout (5 s, `operation-workflow-owner-shared.js:347`), for CONF_CHANGE_APPLIED (the leave), then answers. On bound spent: typed JOINT. The creator re-plans on the partition's MEMBERSHIP_CHANGED relay. |
| `raft-committed-membership-stamp.js:376-377` (JOINT defect) | Same | Unchanged; never produced, because the read waits. |
| `raft-rs-committed-membership-read.js:252-260` (promotion view: joint -> neither) | FreshMG promotion receipt | Deleted with FreshMG (U5). |
| `raft-rs-committed-membership-read.js:300-313` (removal action: joint -> unresolved) | "Removal applied" evidence | Correct as written: an outgoing-only subject is not yet removed. Woken by MEMBERSHIP_CHANGED. |
| `operation-workflow-committed-voter-floor.js:45-84` (JOINT -> UNAVAILABLE) | Remaining-voter credit | Bounded wait; already woken by the REPLACE owner wake (confKey includes outgoing, `replace-owner-wake.js:365-372`) and the 1 s fallback. |
| `partition-service-removal-subject-handoff.js:22-26` (NO_TRANSFEREE in joint) | A subject never removes itself | Hand-off precondition before the joint. Inside the joint, an elected outgoing-only source does not transfer; it appends the auto-leave (`raft.rs:957-983`), then the removed-leader step-down transfers (§A3). Woken by MEMBERSHIP_CHANGED (exists). |
| `raft-removal-transferee-rule.js:102` (JOINT_CONFIGURATION) | Transferee choice | Same as above. |
| `raft-rs-leadership-transfer.js:58-63` (named transfer accepts outgoing voters) | – | **Mis-handles joint:** a named transfer to an outgoing-only voter is accepted. U6 must exclude outgoing-only ids. |
| `replica-operation-message-group-membership-authorization.js:428`; `message-group-learner-join.js:7`; `message-group-consensus-port.js:196` | Message-group membership | Message groups never go joint; deleted or unchanged. |
| `group-retirement-members.js:138` (retirement read refused while joint; "re-runs on the group's row events") | Frozen member set | **Mis-wakes:** row events do not fire on the leave. Unreachable under I11 (split/merge excluded while joint). U6 adds a MEMBERSHIP_CHANGED wake. |
| `partition-participant-release-contract.js:87-90, 129, 160, 183` (null members when joint) | TX1 participant release | Bounded wait on MEMBERSHIP_CHANGED. Witness: a pause engaged during a joint releases after the leave (sealed constraint owner (c)). [The release's current wake was not read.] |
| `raft-rs-conf-change-admission.js:207-218` (joint: only the leave) | raft-rs drop rules | Correct; deferral woken by CONF_CHANGE_APPLIED. |
| `operation-workflow-replace-handoff-attempt.js:460-468` | Hand-off in joint | Wait; woken by the owner wake. |
| `partition-replica-admission.js:351`; `partition-service-raft-membership-administration.js:221`; `replica-removal-group-verdict.js:58`; `raft-rs-membership-transition-runtime.js:46` (outgoing counted as voter) | Conservative membership | Correct for "not yet removed". ADMIT's PROMOTED must read **incoming** only (an "await joint" state, §G). |
| `raft-rs-committed-membership-context.js:110-118, 180-184` (one change only) | Committed context decode | **Widen before any producer**: a joint entry carrying context would make every replica's apply throw, becoming a group host failure (`raft-rs-runtime-owner.js:1155-1191`). |
| `raft-rs-operation-port.js:174-177` (raw passthrough) | – | Deleted in U2 under every option. |
| `snapshot-receiver-admission.js:20-22`; `snapshot-checkpoint-format.js:83-121`; `raft-rs-durable-store.js:130-163`; `raft-rs-runtime-owner.js:589-593`; `raft-rs-original-allocation-preparation.js:120`; `wasm-creation-genesis.js:33` | Persistence, sole-voter and genesis checks | Already joint-capable or genesis-only; no change. |

## G. Risks and the joint alternative

**Joint versus no-joint**

| | No-joint (recommended) | Joint (U6) |
|---|---|---|
| Reachability (enumeration) | 101/137, equal; 0 wedges | 101/137, equal; 0 wedges |
| Dead-source exposure | {A,B}: tolerance 0 until T promoted | {A,B,T}/{A,B,S-dead}: tolerance 0 until the leave. **Equal.** |
| Live-move exposure (vet's finding 8) | 4 voters for one hand-off plus one commit round. Tolerates 1 failure; loss of {S,T} together stalls until T returns. | Tolerates any single failure and also {S,T} together. **Joint is strictly better, for one short window.** It gives up "target died, keep the live source" once the joint commits (the planner re-REPLACEs). |
| Read-path change | none (all §C12 sites unreachable) | ~14 sites, decoder widening, a transfer-rule fix, two new wakes |
| Formation time | one extra commit round per ledger move | one round fewer |
| Untested core paths | none new (simple changes are production-proven) | auto-leave across leader death (`raft.rs:962` TODO), the removed-leader branch "untested at the time of writing" (`raft.rs:2677-2689`), the §A3 panic class under load |
| Contract | R09-a (dead source only) | none needed (atomic) |

**Recommendation: no-joint now.** Equal reachability and equal dead-source exposure. The live-move gain is one short window. It brings no read-path change and no untested core path, which fits the 2026-10-09 safety-first mandate ("keep the healthy path small").

**Evidence that would change it:**
- the owner rejects R09-a (then joint is required: the literal-contract no-joint row has 72 stuck cases);
- experiment (iii) shows the 4-voter live-move window regularly exceeds one election timeout under load, so the double-failure exposure becomes material;
- experiments (i) and (ii) are green, including in-flight writes on the outgoing-only leader, and the owner wants the live-move window closed.

**Experiment results that block joint outright (U6 never sealed until they are fixed):**
- (i) red: no leave within 2 election timeouts after the leader is killed between enter-commit and leave;
- (ii) red: the outgoing-only leader does not step down, or the §A3 panic reproduces.

**Joint REPLACE terms, if U6 is adopted** (vet finding 4a):
- *Authorization.* The proposal is made by the partition leader's port on an ADMIT re-send from T, only when T's committed operation row is REPLACE at step **SYNCING** with T as target and S as source. The leader reads the row through the existing committed-operation read used by ADMIT (`partition-replica-admission.js:499-575`).
- *Port-turn checks:* T is a learner and P_time holds; S ∈ voters; **S is not the leader** (precondition: the owner's hand-off, otherwise `REMOVES_LEADER`); (c) holds on incoming V\{S}∪{T} without T, and a live quorum of outgoing V; no pending change; an own-term entry applied.
- *Terminal rule.* Once the joint is committed, the operation rolls forward. A FAILED decision racing a committed joint is overwritten by reconcile to COMPLETED with `completedBy: COMMITTED_JOINT`, the committed effect. The row records the entry index.
- *ADMIT for a REPLACE target* answers `AWAIT_JOINT` while T is a learner whose operation is REPLACE (never a simple promote). The N+1 shape cannot return.
- *Outgoing-only source elected inside the joint:* raft-rs appends the leave (`raft.rs:963-981`); after it applies, the removed-leader step-down transfers (§A3). The witness is I12.

**Other risks**
- **RF=1 exposure:** permanent loss of D inside the {A,D} window has no automatic exit (owner decision).
- **Repair-before-move** is [inferred] absent from today's planner. If the planner cannot be made to prefer repair, the 36 refused moves fail bounded and are re-planned in a loop: liveness only, recorded as a stop condition for U1.
- **LIVENESS_UNSAMPLED** after every leader change delays voter-adds by up to two election timeouts. During formation it is inside the bound [inferred: one leader change per partition during formation].
- **The A3 panic class** exists today independently: routed to the raft owner (R17).

---

## Vet finding -> resolution

| Vet finding | Resolution |
|---|---|
| B1: one-voter groups | **Accepted.**<br>- (c-1) 1 -> 2 exception with ONE_VOTER_GROWTH recorded.<br>- RF=1 REPLACE path: learner, promote, hand-off, remove.<br>- Enumeration re-run: 0 stuck with a live quorum (36 correct refusals, all repairable), 0 admitted wedges, 10 exposures, all RF=1.<br>- RF=1 is production-reachable only by explicit operator configuration of user tables. |
| B2: joint across the read path | **Resolved by not producing joint** (I9 static census, raw passthrough deleted). The full census of 14+ sites with each U6 behaviour is in §C12. The replay statement is settled: O1 was not built, but the 2026-10-05 fold supersedes F4; R09-e and W-FOLD-JOINT are owed only for U6. |
| M3: cancel race | **Resolved by deleting cancellation** (roll-forward plus the "target is a live voter" ingress check). (b) is specified as the fallback design if the owner keeps cancel. (a) is rejected for want of ReadIndex. The interleavings are in §C7. |
| M4: joint authorization and terminal rules | (a) is specified for U6: SYNCING-row authorization at ADMIT, roll-forward reconcile, AWAIT_JOINT, the hand-off precondition, I12. (b) no-joint with dead-source-first under R09-a is recommended, with the comparison in §G. |
| M5: staging | **Accepted and adjusted:** U0, U1 (check + dead-source-first), U4, U2 (old U2+U4), U3, U5, U6 deferred. The first-unit analysis shows the check alone would break dead-source recovery. |
| M6: promotion starvation | **Accepted.** P_time (catch up to the commit of one heartbeat earlier), evaluated on every leader drain. Safety argument given. Decision rule for experiment (iii) given; no bound widened. |
| M9: re-drive and failed-learner route | **Accepted.** The coordinator's leader wake is the REPLACE owner's consensus relay plus target-host forward plus the 1 s fallback, generalised in U3 to every remotely owned membership operation's subject or target host. The FAILED_LEARNER RETIRE route is bound to the operation and generation. |
| Notes | Role projection and ACTIVE on snapshot restore (I6); split/merge exclusion (C9, I11); version switch = drain-required, enforced at coordinator start (C11); raw passthrough deleted (U2); `raft_role` readers become hints, with removal safety credited only from the committed read (C5); liveness already cleared on a term change (acknowledged, §A2). |

## Decisions that are the owner's to take

1. Joint now, or later (recommendation: later, U6, gated on experiments (i) and (ii)).
2. **R09-a:** dead-source-first REPLACE, superseding `authority-and-recovery.md:212-213` for the dead-source case only.
3. **R09-c:** delete CANCEL_REPLICA_REMOVAL (roll-forward), or keep it as the (b) log revocation.
4. Delete the FreshMG permit layer (R09-d), discarding the reviewed 8/8 work that has no production caller.
5. Accept the RF=1 ONE_VOTER_GROWTH exposure. There is no automatic exit when D is lost inside the window.
6. Old-style in-flight operations at the version switch are drain-required and unsupported, enforced at coordinator start.
7. If experiment (iii) shows promotion cannot fit the sealed formation bounds: escalate, never widen.
8. The A3 removed-leader panic class: route it to the raft owner as a separate finding.

## Experiment-dependent decision rules

- **(i)** Joint leave across leader death. No leave within 2 election timeouts in any run means U6 is blocked.
- **(ii)** Outgoing-only leader, with in-flight writes. No step-down, or a WASM abort, means U6 is blocked and the A3 finding is confirmed.
- **(iii)** Promotion lag, as in C2:
  - P_time if L ≤ 5 s;
  - P_time, recorded, if L ≤ 30 s;
  - P_k with k = 2 × p99 gap if P_time fails within 30 s but the gap is bounded;
  - no promotion plus a backpressure finding if the gap is unbounded.
- **One-voter growth.** If the measured {A,D} window (promote, then transfer, then remove) exceeds 3 election timeouts, record it as the exposure value in ONE_VOTER_GROWTH and present it to the owner (decision 5).
- **Snapshot-carried promotion.** If a learner caught up by snapshot does not satisfy P_time from its post-install acknowledgements within one heartbeat, or the role projection or ACTIVE event does not fire on restore, then U2 must add the restore announcement before landing (I6 red blocks U2).

---

## Independent vet of Revision 2, 2026-11-11: REVISE (overall) and REVISE (first unit U1 as written)

The reviewer re-ran the designer's enumeration (output matches) and added its own U1
model with deaths after each admitted change: rule (c) alone admits no wedge and leaves
no live-quorum state without a path back. The safety argument for the promotion
predicate holds. The replay statement is correct for simple changes. Not approved.

Blockers for U1 as written:

1. The one-voter exception requires the new member to be "live in the leader's record",
   but in U1 the target is a non-member with no Progress, so it can never be live: U1 as
   written refuses every RF=1 move for ever. Dropping the condition is today's unchecked
   growth by an unproven voter (an experiment shows {A} promoting an isolated D commits on
   A alone, then A steps down by check-quorum and nothing can be removed). RF=1 in U1 must
   be decided: unchanged with the exposure recorded, or refused until learners exist.
2. "Dead" is unsound early in a tenure: the record is cleared on election and the first
   sample is immediate, so a member whose first heartbeat response has not arrived reads
   dead and could be removed while alive. Absence may count as dead only once the tenure
   is at least the liveness window old. Conversely raft-rs marks a newly added Progress
   `recent_active = true` (`tracker.rs:375-379`), so a member that never spoke reads live
   for up to about three election timeouts: count a peer live only after its first
   message.
3. Dead-source-first is not an ordering change inside today's REPLACE owner, which is
   built on the target as witness, RETIRE delivered through the target, the STOPPING
   intent after ACTIVE, and "no elapsed-time budget fails a REPLACE after its intent".
   Either write those supersessions and the terminal state "source removed, target never
   admitted", or leave the REPLACE owner alone in U1 and have the planner repair a dead
   member with two existing operations (REMOVE, then ADD).

Must-fix: the planner has no input for "a voter the leader's record shows dead" (that
record is volatile state in another node's port; use the node-failure verdict the
planner already has, with the ingress as arbiter); the new refusal must map to DEFERRED
and a bounded failure must read committed membership first; with learners the dead-source
order must be learner first, wait for the promotion predicate, then remove, then promote
(two commit rounds at two voters instead of the whole catch-up, and the REPLACE can be
abandoned if the source returns); live-source and dead-source rules need a per-turn
decision, never sticky on the operation row; deleting cancel removes the only way back
from a REMOVING row (write the REMOVING row and fence only after the port accepted the
RemoveNode, or keep a row restore after a committed read); the generalised relay forward
is new machinery and must land with the deletion it replaces; promotion interest must be
registered on the first ADMIT; the participation gate must open on snapshot install; the
formation-time claim has no arithmetic (about 100 membership operations at a concurrency
of 4 need about 16 s each to fit 420 s: take per-operation times from a lab formation
log before building).

Narrowed first unit the reviewer would approve: rule (c) at the ingress for today's
ADD_NODE, answered DEFERRED; the two liveness fixes; RF=1 explicitly unchanged with the
exposure recorded; the planner never targets a partition holding a member on a failed
node and repairs that member first by REMOVE then ADD; the bounded failure reads
committed membership first; witnesses on real groups (the traced wedge refused; a
dead-member repair completes; the target killed at each stage; a source alive in a
young tenure is not removed).

A present-day defect to reproduce or refute before relying on formation proofs (by
reading, not reproduced): a replica that wins an election while holding its own
uncommitted RemoveNode, takes a proposal before that entry applies and then receives
the acknowledgement makes raft-rs unwrap a missing Progress (`raft.rs:937-946, 1794,
2676-2687`): a host abort. Formation performs about 90 hand-off-then-remove sequences.

Experiments so far (scratch directory learner-spike): joint leave across leader death
and the outgoing-only leader step-down both pass without writes in flight; one-voter
growth behaves as above; promotion lag and snapshot-carried promotion have no result
yet.

---

## Experiments on real rs-raft groups, 2026-11-11 (scratch directory learner-spike; nothing in the repository edited)

All groups were real operation ports through the production runtime host; time is driver
rounds or simulated time, not wall clock on lab hosts.

- **Joint entry and today's host.** A joint entry WITHOUT context is applied by every
  replica; the leader's core proposes the leave itself. A joint entry WITH an admission
  context fails every replica permanently (`HOST_FAILURE`, "committed membership context
  contradicts native change", `raft-rs-committed-membership-context.js:181-184`), survives
  reconstruction, leaves no leader and no write ever commits: one such entry wedges the
  group. While a joint is held open, `readCommittedMembership` is refused
  `membership-in-joint-transition` at the leader.
- **(i) Joint leave across leader death: holds.** Seven runs per variant: a new leader
  commits the leave with no external action in 1.0-1.8 election timeouts; a restart inside
  the joint restores voters, outgoing voters and auto-leave; writes commit afterwards.
- **(ii) Outgoing-only source as leader: handled.** The ingress refuses a joint that
  removes the leader. When the outgoing-only source wins an election inside the joint it
  applies its own removal, drops proposals for 1-3 rounds, and the existing removed-leader
  step-down hands leadership to a live voter of the new configuration; no writable leader
  for 1.07-1.93 election timeouts in total. (No writes were in flight; the suspected
  missing-Progress abort was not exercised.)
- **(iii) Promotion predicate.** The exact predicate `matched >= commit` starves once
  write rate x round-trip reaches a few entries: at 100 writes/s and 20 ms link delay it
  held in 3 % of 1 s samples (22 of 30 consecutive failures); at 500/s and 5 ms or more,
  never. The Progress state was Replicate in every sample. Two predicates held in 100 % of
  samples in every combination: matched >= the commit index one round trip earlier, and
  matched >= the commit index at the previous 1 s sample. Decision: "Replicate state and
  matched >= the commit index recorded at the previous re-send" (no tuning). Catch-up
  from empty: 5 ms of simulated time at 1 ms delay, 81 ms at 20 ms delay, for 1,000 and
  10,000 entries; applying 10,000 entries on the learner took about 0.3 s wall.
- **(iv) One-voter growth.** {A} promoting an isolated D commits on A alone; the group
  then needs both. If D dies right after its promotion, A loses leadership by
  check-quorum and no removal can be proposed: a total stall until D returns.
- **(v) Snapshot-carried promotion.** A learner promoted while isolated and caught up by
  snapshot install reopens as a voter with its gate open, but a subscriber sees only
  `MEMBERSHIP_CHANGED`: no `CONF_CHANGE_APPLIED` and no `GATE_OPENED` (the gate settles
  inside port construction before any listener can subscribe). An event wait on
  `GATE_OPENED` would miss it.
- **Present-day finding outside the design.** In the fixture the checkpoint path rejected
  its own checkpoint: `createSqliteStateMachineCheckpoint` returned `created` with
  `membershipEpoch` 0 (from the identity's publication rows) and
  `raftRs.membershipGenerationIndex` 6, and `requestSnapshotInstall` rejected it as
  `corrupt_descriptor` (`snapshot-checkpoint-format.js:160-167` requires the two to be
  equal). In production the cadence takes the identity from cached publications
  (`partition-snapshot-cadence.js:250`), so a group with any committed conf change may
  produce checkpoints that cannot be installed. Not verified in production; under
  investigation.
