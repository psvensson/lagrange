---
audience: evidence
recorded: 2026-11-18
---

# Founding membership: one founding voter, learner ADD, odd voter growth (design and Quest proposal, 2026-11-17)

**Owner decision being implemented (2026-11-17):** "Separate founding Quest: found system partitions with one voter and up-replicate by ADD, handling the two-node window without an even voter set; the 3-in-a-row lab journey and the GCP campaign wait for both quests; bounds and lab CPU unchanged."

**Inputs:**
- Rule-set revision 5 (`docs/steering/rules.md`, last reviewed 2026-11-13).
- Code: read-only worktree `/mnt/data/peter/projects/lagrange-gcp-takeover-20261117` at `19a2134c5`. Every `path:line` is at that HEAD unless marked. `raft.rs`, `changer.rs`, `tracker.rs` and `quorum/joint.rs` are the raft-rs 0.7.0 crate in the cargo cache (`~/.cargo/registry/src/index.crates.io-*/raft-0.7.0/src/`), whose checksum the vendored build pins (`vendor/raft-rs-wasm/BUILD.md`).
- Sibling designs: `placement-owner-design.md` (§2.2, §2.10, §2.11, §3, §6 D1), `pregate-219c27bfe-summary.md`, `audit-candidate-4b0c8ec1d.md` (all in this directory).
- History: `solve/epics/operation-integrity-and-reliable-formation/learner-first-admission-design-2026-11-11.md` and `-r2-2026-11-11.md` (with both REVISE verdicts and the real-group experiments appended), `formation-membership-arithmetic-2026-11-11.md` and `system-partitions-stay-on-seed-2026-11-11.md`. These exist in the primary checkout's uncommitted tree (`/mnt/data/peter/projects/lagrange/solve/epics/operation-integrity-and-reliable-formation/`), not at `19a2134c5`. Also the routability quest log (`solve/quests/fresh-formation-user-table-routability/log.ndjson`, primary checkout, entries 168-184).
- Three read-only census subagents (founding path, Raft port capability, consumers) and one web research subagent (comparable systems, sources downloaded from pinned branches). Every claim they returned that this document relies on carries its `path:line`; inferences are marked.

**Labels:** **C** = CONFIRMED by reading the cited lines (by me or a census agent that read them). **P** = PLAUSIBLE (inferred, or measured only in a scratch experiment outside the repository).

Nothing in this document has been built in the repository. It proposes a Quest; it seals nothing. **(rev. 1)** Scratch probes were run against the vendored raft-rs WASM binding (read-only use): the reviewer's `scratchpad/founding-vet/probe.cjs` and mine, `scratchpad/founding-rev1/probe-rev1.cjs`, with results in `scratchpad/founding-rev1/probe-rev1-results.txt`. Both are under `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9c1d1357-e0ff-45b9-900a-54a2055bdf9c/`.

---

## Revision 2 (2026-11-18): re-vet APPROVE-WITH-CHANGES; owner decisions D1 and D3; folded in

**Re-vet result.** APPROVE-WITH-CHANGES. Nine of the eleven rev. 1 findings are closed. WP-0, WP-M and WP-B may start. WP-P and WP-F1 wait for the items below; they are addressed in this revision and await the lead's confirmation.

The reviewer's new probe is `scratchpad/founding-vet/probe2.cjs`, with results in `probe2-results.txt`:
- **RL:** a live learner removed from `{1} L{2,3}` applies its own removal: node 3 ends at applied 6 with `{1} L{2}`.
- **RLEADER:** a simple `RemoveNode(leader)` from `{1,2,3}` gives `{2,3}`. The removed leader keeps leading and drops every proposal for 200 rounds. **The J1 wedge also hits simple changes.**
- **J1LONG:** the J1 wedge persists.

**Owner decisions (2026-11-18, recorded):**
- **D1 = (a), the named REPLACE window.**
  - Growth and formation commit only odd voter sets.
  - REPLACE keeps a named N+1 window: 4 voters for RF3, `{s,t}` for RF=1.
  - The port refuses `REMOVES_LEADER`: hand off first, decided in one core turn.
  - The REPLACE rule is roll-forward only.
  - A joint REPLACE that never commits an even set is a follow-up, and needs a removed-leader step-down first.
- **D3 = (a), separate ADD and PROMOTE.** Revisit only if WP-M shows PROMOTE's fixed cost dominating.

| # | Finding | Verified | Resolution (rev. 2) |
| --- | --- | --- | --- |
| 1 HIGH | Removing a live learner ends only by the timeout backstop | C. `consensusExitOf` keeps participating while `gateOpen !== true` (`src/node/replica-removal-consensus-exit.js:66-73`), called with `REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS` (`replica-handler-remove-execution-methods.js:627-630`). A learner's gate never opens. | **Learner exit (§2.4, WP-F1).** For a subject that is a learner in its own applied `ConfState`, the exit is decided independently of the gate: when its applied `ConfState` no longer names it (probe RL), or when the executor relays the leader's committed `REMOVE_LEARNER` answer. Witness W15; negative control N10. |
| 2 HIGH | The removed-leader wedge hits simple changes | C: probe RLEADER on the binding | **A port refusal `REMOVES_LEADER` in WP-P (§2.4).** Every conf change, simple or joint, whose resulting incoming or outgoing set excludes the proposing leader is refused in the same core turn. Hand off first (the existing removal-subject hand-off), then remove. In scope, removed from R9. Where the fix lives is coordinated with the investigation agent checking whether today's REPLACE/REMOVE already hit the wedge. If they do, the refusal lands as its own bounded repair before WP-P, and this Quest consumes it. Witness W16; negative control N11. |
| 3 MEDIUM | REPLACE must roll forward only | C: `operation-workflow-recovery-status-reconcile.js:73-75` fails a REPLACE `REPLACE_TARGET_DEAD_BEFORE_INTENT` / `REPLACE_TARGET_REMOVED_BEFORE_ACTIVE` | **Roll-forward only (§2.4).** Once the port has answered `PROMOTION_PROPOSED` or `PROMOTION_IN_LOG` for a `REPLACE_PROMOTE`, the REPLACE has no FAILED exit. It ends in a removal within the same operation: the source (normal), or its own target if the target died (`COMPLETED`, outcome `TARGET_REMOVED`). The reconcile's two FAILED arms remain only before that point, behind the port's `WITHDRAWN`. The port also pins `REPLACE_PROMOTE` to `\|V\| == V(r, H)` (`REPLACE_PROMOTE_NOT_AT_TARGET`). Witness W17. |
| 4 MEDIUM | R10 was a retry loop | C. NO_CONNECTION returns at once with `retryAfterMs: router.reconnectIntervalMs` (`message-router-delivery-behaviors.js:361-378`); noHandler answers fast (`message-router-inbound-dispatch.js:502`). | **Real events only (§2.4).** The requester re-sends on: a change of the partition's leader pointer; the router's `TRANSPORT_EVENT.CONNECTION_ESTABLISHED` / `NODE_CONNECTED` for the leader's node (`message-router-connection-lifecycle-methods.js:452, 566`; `message-router-inbound-dispatch.js:369`); and the leader's existing re-drive of accepted requests on gaining leadership or a settled configuration (`redriveAcceptedAdmissionRequests`, `partition-replica-admission.js:23, 320`). A delivery failure is not a trigger. R10 is closed. The alternative, the leader driving admission from the committed ADD row and the target's SYNCING row, is recorded and not chosen: it would need the partition leader to read the ledger. |
| 5 LOW-MED | No committed-effect settlement owner exists | agreed | **Withdrawal protocol (§2.4).** The executor commits a non-terminal `WITHDRAWING` step first, then asks the port. The port keeps a per-operation tombstone for the rest of its tenure, so `WITHDRAWN` is final at that leader. Promotion requests are honoured only for an operation whose committed step is `PROMOTION_PENDING` or `PROMOTION_PROPOSED`. A FAILED terminal row is never rewritten. The rev. 1 sentence on `PROMOTED_AFTER_WITHDRAWAL` and a settlement owner is withdrawn. The residual is recorded as R12. |
| 6 LOW | Per-drain `CATCH_UP_PENDING` | agreed | Stated: re-evaluation per drain emits nothing, by intent. The only emission is the `CAUGHT_UP` answer to an outstanding request. |
| 7 | Wording; `c0` key | agreed | The constraint text is fixed: a voter-count increase **outside a REPLACE** is a `GROWTH_PROMOTE`. `c0` is keyed per `(operationId, peerId, requestKind)`, so a promotion never inherits a `c0` recorded at ADD time. |
| 8 | Placement alignment (rev. 3 §2.13) | agreed | `isPartitionFounded` counts only founder rows that are in progress or ACTIVE. When every founder row is FAILED, a new founding set is admitted (§2.12 (a)). Placement adopted `SYSTEM_PARTITION_SEED_FOUNDED` and `(workflowId, childPartitionId)`. |
| 9 | P6: the release fence must land early | agreed | **New early work package WP-V (§5)**, with witness W-FENCE. It must land before placement WP-F and before WP-D's `host_id`. The fence is release-keyed: a cluster format revision owned by the support-envelope owner, not founding's layout. WP-F2 consumes it and no longer owns it. |

---

## Revision 1 (2026-11-17, night): independent review REJECT as written, core KEPT; folded in

**Review result.** REJECT as written (revise and re-vet), but KEEP the core mechanism. The core was confirmed against the real raft-rs WASM binding by the reviewer's probe `scratchpad/founding-vet/probe.cjs` (results in `probe-results.txt`):
- S1, happy path: `{1}` → `{1} L{2}` → `{1} L{2,3}` → `{1,2,3}&&{1} auto` → `{1,2,3}`;
- S2, a joiner dies inside the joint;
- S3, both joiners die and one returns (recovers in 11 rounds);
- S4 and S4b, the leader crashes after or before applying the enter (the core leaves with no re-driver);
- S5, the seed is lost inside the joint (no election, ever);
- S6, the core accepts 1 → 2;
- S7, the core accepts 3 → 4.

**Additional evidence I produced for this revision.** `scratchpad/founding-rev1/probe-rev1.cjs`, the same harness and binding, read-only use of the vendored WASM:
- **J1, RF=1 as one Auto joint `{AddNode t, RemoveNode s}`.** Accepted. `s` auto-leaves to `{t}` and **keeps leading a configuration it is not in**. Every later proposal is dropped (`raft: proposal dropped`) for 12+ rounds, and `t` never campaigns while `s` heartbeats. **That is a wedge.**
- **J2, RF=1 as a simple promote.** Gives `{1,2}`.
- **J3, RF=1 as an Explicit joint, `MsgTransferLeader` to `t` inside the joint, then `t` proposes the empty leave.** Sound: final `{2}`, writes commit, and no 2-voter set is ever committed.
- **C1, the cancel race.** A `RemoveNode(3)` proposed while the PROMOTE is pending is dropped by raft. The same `RemoveNode(3)` issued after the leave removes a **voter** and leaves `{1,2}`.

Inline changes are marked **(rev. 1)**. Sections §2.4, §2.6, §2.9-§2.12, §4, §5 and §6 are rewritten. §2.12 is new: the P5 interface.

| # | Finding | Verified | Resolution |
| --- | --- | --- | --- |
| 1 HIGH | The even-count rule contradicts REPLACE, and 1 → 2 returns | C. Rev. 0's §2.4 refused an even `\|V∪P\|` while D2(a) promoted REPLACE 3 → 4 by the same predicate. RF=1 REPLACE (owned root `test/rebalancer/replace-real-group-handoff.test.js:8-12, 88-90, 184-189`) commits `{s,t}`. In WP-F1 founding is still co-located, so every REPLACE would stop at `PROMOTION_WOULD_BE_EVEN`. | **Two named transitions, one port decision (§2.4).** `GROWTH_PROMOTE` follows the parity rule. `REPLACE_PROMOTE` promotes only the REPLACE's own caught-up target, only while its source is still a voter, committing N+1 before the source removal. A dead source at N+1 is `{A,B,S-dead,T}`: 3 of 4 live with one dead member, so no further failure is tolerated until the removal commits. RF=1: J1 wedges; J3 is sound but availability-identical to `{s,t}` (both need `s` and `t` for every commit and election) and needs Explicit-joint machinery. Owner ruling D1; recommendation: the named `{s,t}` window. Constraint text fixed (`odd-growth-and-named-replace-promotion`). |
| 2 HIGH | Seed founders never start tick timers | C (lines below). With `deferElection` and `replicaIds.length === 1`: `initialize()` campaigns without scheduling (`partition-service-raft-init-base.js:445-460`); `startElection` returns early (`:525-528`); the rearm needs length > 1 (`:589-590`); the port ticks at open only when `deferElection !== true` (`raft-rs-operation-port.js:251-253`); `configureTick` only restarts a running timer (`:538-546`). | **Every sole-voter branch is decided from the applied `ConfState`, never from the founding hint list (§2.2).** `startElection` always starts scheduling. Sites covered: `partition-service-leader-activation-methods.js:117`, `partition-service-durability-fitness.js:96-100`, `partition-write-kernel.js:338`. Witness W9 (seed restart after PROMOTE) and negative control N5. |
| 3 HIGH | Catch-up predicate starvation | C. Rev. 0 said "commit index at its previous sample", evaluated after every drain, which tracks the current commit. `Progress::reset` sets `matched = 0`, Probe, `recent_active = false` (`tracker/progress.rs:82-91`). | **Fixed reference (§2.4):** `c0` = the leader's commit index when this tenure first evaluates the request. Pass when `state == Replicate ∧ matched ≥ c0`. Because of the reset, this implies an acknowledgement in the tenure. It converges for any learner whose `matched` advances. Witness W7; negative control N8 (per-drain reference) must starve. |
| 4 HIGH | The cancel race returns | C by probe C1. | **The port decides.** A promotion fails only on the leader port's `WITHDRAWN` answer: leader, own-term entry applied, no pending conf change, every subject still a learner, with the pending record deleted in the same turn. Otherwise `PROMOTION_IN_LOG`, and the operation rolls forward. Learner removal is a typed port change, `REMOVE_LEARNER`: refused `NOT_LEARNER` if the subject is a voter (incoming or outgoing), deferred while any conf change is pending. The floor's learner domain is that typed answer. Witness W10; negative control N9. |
| 5 MED-HIGH | The ADMIT re-send loses its only driver | C. `drivePendingReplicaAdmission` (`partition-replica-admission.js:356-369`) is called only from the learner cadence (`partition-service-learner-promotion-methods.js:428`, armed `partition-service-raft-init-base.js:401`). `isOwnCommittedVoter` (`:343-354`) never sees a learner admission. | **One level-triggered requester (§2.4).** Events: the durable SYNCING acknowledgement; a typed answer naming its next step; the message router's delivery answer; a change of the partition's leader pointer. It settles on `isOwnCommittedMember` (learner or voter). The learner cadence is deleted. The no-timer constraint now states this deletion. Witness W11. |
| 6 MEDIUM | Interface drift | C. `formation-latch-design.md` §3.3, §6.3; `placement-owner-design.md` §2.5, §2.13. | **Formation fact:** this Quest no longer edits it (latch Quest; D4 moot). **P5 (a)-(e):** answered in §2.12. **Ledger rule:** founding consumes placement's `LEDGER_TRANSITION_UNRESOLVED` unchanged. Rev. 0's "ledger learner ADDs are not self-moves" is kept as a safety fact but withdrawn as an exemption argument (§2.6). **Operation ids:** follow placement's `pl-<partitionId>-<applyIndex>-<n>`; the hash id is dropped. "Conditional ledger insert" and "lane" are replaced throughout. |
| 7 MEDIUM | TX1 release requires voters and learners; the split/merge retirement read | C. `releaseMemberIds` = voters ∪ learners, `null` while joint (`partition-participant-release-contract.js:87-96`); used at `replica-handler-participant-cutover.js:48, 282`. | **TX1 (§1.4 (i)):** the cohort keeps learners, because a learner applies the same log and may be promoted. A refusal for an unreachable learner is typed, and its clearing event is that learner's removal or return. The placement owner repairs dead learners in the repair class. **Split/merge:** refused typed while the partition is busy or joint, and woken by `MEMBERSHIP_CHANGED` / the terminal ledger commit. The retirement read's joint refusal gains the `MEMBERSHIP_CHANGED` wake. All in WP-F1, not deferred. Witnesses W12 and W13. |
| 8 MEDIUM | The leave re-driver is redundant | C (S3, S4, S4b). The production host applies committed entries and then calls `advance_apply` (`raft-rs-runtime-owner.js:1272-1303`). | **Dropped.** W5 witnesses the core on the production host. Only Auto joints with outgoing ⊂ incoming are produced; the port refuses every other multi-change V2 (the J1 wedge). |
| 9 MEDIUM | Copy-load arithmetic | agreed | §2.9 rewritten: 103 → 138 operations, three serial per partition. The lab data is supportive, not proof. WP-M measures the reviewer's list and reports **before WP-F1**. |
| 10 LOW-MED | The 2026-09-25 record, and the restated DT assertions | agreed (`raft-rs-runtime-owner.js:1135-1141`; BOOTSTRAP read JOINT refusal `raft-rs-committed-membership-read.js:96-104`) | R09 records for both (constraint `supersessions-recorded-first`). Witness W-FOLD-JOINT. |
| 11 LOW-MED | D7 needs a real version fence | C: the compatibility owner is `src/bootstrap/owners/support-envelope-owner.js`. `validateVersionPairAdmission` (`:132-157`) is used by the rolling-upgrade owner; `resolveJoinSupportEnvelopeConflict` by `bootstrap-join-admission-owner.js:38`. A retained pre-change declaration fails today only as a generic CONTRARY/IDENTITY (`seed-retained-effects.js:59-65`). | Constraint `upgrade-fence`: the certified pair excludes pre-change sources; join admission refuses `OUTSIDE_SUPPORT_ENVELOPE`; the seed refuses the new typed `ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED` before any founder opens. |

**Correction found during the revision (C).** Rev. 0's §2.10 said the participation gate must open on `AddLearnerNode`. That is wrong.
- The gate governs campaigning. It opens when the applied index reaches the entry that made the replica a **voter** (`raft-rs-participation-gate.js:1-22, 138-143`), and a learner never campaigns (`raft.rs:2672-2673`).
- With learner admission the gate opens at the promotion's `AddNode`, including inside the joint entry, since `admitsReplica` uses `.some`.
- **No change to the gate.** The snapshot-restore event obligation (experiment 5) stays.

**D-positions after this revision:**
- D1: two named transitions; RF=1's `{s,t}` needs an owner ruling. I recommend the named window over J3, on availability equivalence.
- D2: (a), with `REPLACE_PROMOTE` named.
- D3: **kept as separate ADD and PROMOTE**; disagreement below.
- D4: moot (latch).
- D5: (a), plus per-node message groups in the follow-up.
- D6: (a), with the minimum-routable consequence stated and split/merge children covered.
- D7: (a), with the named fence.
- D8: (b), with WP-M before WP-F1.

**Disagreements, with evidence:**
1. **D3: ADD and PROMOTE stay separate operations; I do not merge them into one GROW operation.**
   - Placement rev. 2 §2.13 items 1-3 already define `moveType ADD | PROMOTE` on single-target rows, with copy capacity counted per row by `copy_source_node_id` and target over `COPY_PHASE_STEPS`. A two-learner GROW needs either a two-target row or a target that changes between phases. Both change placement's applier and capacity rule.
   - A GROW that fails after its first learner leaves a learner owned by no operation. The "caught-up learner, no operation" state must exist under GROW too.
   - The binding direction allows phases inside one operation (§6), but describes bootstrap as sequential ordinary operations (§11).
   - CockroachDB's queue and PD's checker each add **one** voter per automatic operation (§3). Neither grows by two in one automatic operation; the multi-learner joint exists only in CockroachDB's admin API and PD's builder.
   - This is the owner's call. GROW is workable if placement accepts the applier change.
2. **RF=1 as joint `{s}` → `{t}`.**
   - It is sound only as J3: Explicit, transfer inside the joint, leave by the new leader. The Auto form J1 wedges.
   - J3's window has exactly `{s,t}`'s availability: every commit and every election needs both `s` and `t`.
   - It adds Explicit transitions, an operation-owned leave proposer that must survive leader changes, and transfer to an incoming-only voter inside a joint. That is the joint-REPLACE family deferred under D1.
   - I recommend not adopting it in this Quest, but the owner rules.

---

## 0. Summary (rev. 1)

**The problem (C).** Every system partition (46) and the initial message group `mg-1` are founded as three Raft voters on the seed, with three separate replicas, ports, SQLite files and tick timers on one node (§1.1). The seed therefore runs 141 Raft groups at formation, applies every system-table write three times, and every formation move is a REPLACE. The three co-located voters add no fault tolerance: they share one process, one disk and one host.

**Key choices.**
1. **One founding rule for partitions.** A new partition Raft group is founded with `V(r, H)` voters, one per distinct eligible host. `V(r, H)` is the largest odd number ≤ min(r, H), and at least 1.
   - At seed bootstrap H = 1, so every system partition, the ledger and the priority partitions included, is founded with **exactly one voter, `r1` on the seed**.
   - Declared policy stays RF 3 (binding direction 2026-09-20 §11).
   - One definition, `resolveVoterTarget(r, H)` in `src/bootstrap/replication-target-authority.js`, shared with the formation-latch Quest.
2. **Every new replica enters as a Raft learner** (`AddLearnerNode`), never as a voter. ADD means "add a learner and catch it up". Today's ADD proposes `AddNode`, a voter, directly (C, §1.3). **(rev. 1)** The target's admission request is driven by events, not by the learner cadence.
3. **(rev. 1) Two named promotion transitions, one decision at the leader's port:**
   - **`GROWTH_PROMOTE`**, a PROMOTE operation admitted by the placement owner. It promotes a set of caught-up learners so that the committed voter count is odd. For 1 → 3 that is one Auto joint `ConfChangeV2 {AddNode j1, AddNode j2}`. Its outgoing set `{s}` is contained in its incoming set: no outgoing-only voter, no leader removal and no transfer, the shape the probe confirmed (S1-S5).
   - **`REPLACE_PROMOTE`**, inside a REPLACE. It promotes only that REPLACE's own caught-up target, only while its source is still a voter. It commits N+1 transiently: 4 for RF3, `{s,t}` for RF1.
   - **(rev. 2)** Owner decision D1 = (a). `REPLACE_PROMOTE` requires `|V| == V(r, H)`. Once it is in the log, the REPLACE rolls forward only. The port refuses `REMOVES_LEADER` for every change that removes the proposing leader (probe RLEADER).
4. **The two-node window is never committed by growth or formation.** One voter plus one learner is a stable state. A partition with two eligible hosts stays at one voter and one learner (CockroachDB's `CheckAvoidsFragileQuorum`, §3).
5. **(rev. 1) The joint leave is the raft-rs core's:** `become_leader` plus `commit_apply`, confirmed on the binding across leader crash before and after apply (S3, S4, S4b). There is no re-driver. The port refuses any multi-change V2 other than AddNode of current learners, because an Auto joint with an outgoing-only leader wedges (probe J1).
6. **One meaning of "learner".** The role is a projection of the applied `ConfState`. The application promotion (proof RPC, `becomeFollower`, the row count check, the learner cadence) is deleted. **(rev. 1)** A promotion fails only on the port's `WITHDRAWN` answer, and a learner is removed only by a typed `REMOVE_LEARNER` that refuses a voter (probe C1).
7. **(rev. 1) Sole-voter behaviour is decided from the applied `ConfState`, never from the founding hint list.** Otherwise one-voter founders never tick (§2.2).
8. **(rev. 1) The formation fact is not changed by this Quest.** It is the declared-size latch's (`formation-latch-design.md`); D4 is moot.
9. **Message-group founding is not changed (D5).** A lone message-group replica applies CDC locally without Raft (`message-group-service-cdc-replication-runtime-methods.js:212-218`, C).
10. **The voter floor's learner domain.** A removal whose subject the port answers is a learner removes no voter and is outside the floor (§1.4 (b)).

**What changes at formation (3 hosts).**
- Per system partition: ADD learner `j1`, ADD learner `j2`, PROMOTE both.
- **(rev. 1)** That is 92 learner ADDs and 46 PROMOTEs: **138 operations instead of about 103**, three serial per partition, with no REPLACE and no REMOVE.
- **The number of copies sourced from the seed is unchanged (92 both ways).**
- What falls is the work per copy (no promote/hand-off/remove/cleanup on the seed) and the seed's baseline load: 141 → 49 Raft groups at founding, and one apply per system-table write instead of three.
- Whether that brings the drain inside 420 s on `cpus: 1.0` is **P**. **(rev. 1)** WP-M measures it **before WP-F1** (§2.9).

**Quest id:** `single-voter-founding-and-odd-growth`, epic `operation-integrity-and-reliable-formation`. It is downstream of the placement Quest's WP-F and consumes the latch Quest's formation fact (§5).

**Open decisions (§6, rev. 1; rev. 2: D1 and D3 decided by the owner on 2026-11-18):**
- D1: **decided (a)**, the named REPLACE window;
- D2: one learner admission for REPLACE targets;
- D3: **decided (a)**, separate ADD and PROMOTE;
- D4: moot;
- D5: message groups;
- D6: user-table and split/merge-child founding, and the minimum-routable count;
- D7: the upgrade fence;
- D8: the physical receipt.

---

## 1. Census: how partitions are founded today

### 1.1 Seed bootstrap

**The lists (C).**
- `SYSTEM_TABLE_SCHEMAS` has 46 entries (`src/bootstrap/system-table-schemas-constants.js:76-123`).
- `INITIAL_PARTITION_IDS` maps each to `<table>-p1` (:129-184).
- `PRIORITY_CONTROL_PLANE_PARTITION_IDS` names 6 (:186-193).
- `INITIAL_REPLICA_IDS` holds 46 × 3 = 138 replica-id literals (:195-378), under the comment "Each partition has 3 replicas on the seed node" (:197). `getInitialReplicaIds` returns a copy (:409-419).
- `INITIAL_MESSAGE_GROUP_ID = 'mg-1'` and `INITIAL_MESSAGE_GROUP_REPLICA_IDS = ['mg-1-r1','mg-1-r2','mg-1-r3']` (:383, :388).

**Declaration of the founders (C).**
- `originalSeedMemberDescriptors` builds the three `mg-1` members, then one member per (schema × replica id). Each member carries all three `replicaIds` and its own `dbPath` (`src/bootstrap/seed-original-allocation-declaration.js:43-62`).
- Each member's membership is `genesisStamp(member.replicaIds, every replica → seed node)` (`:64-73`). The comment reads: "every seed founder, partition and message group, is placed on the seed node, and the stamp commits that placement".
- `validateMember` refuses any member whose membership differs from that stamp (`:206-216`). This is the only place co-location is enforced.

**Creation (C).**
- `SeedPartitionsPhase.phasePartitions` loops schemas × `replicaIds`. It queues each replica with `{replicaIds, replicaIndex, dbPath, deferElection: true, createDelayMs: index*replicaStaggerDelayMs}` (`src/bootstrap/phases/seed-partitions-phase.js:115-158`), then constructs one `PartitionService` per replica (`:229-274`).
- `RaftRsOriginalAllocationPreparation.admitReplica` injects the GENESIS stamp as `bootstrapMembership` (`src/raft/raft-rs-original-allocation-preparation.js:576-610`). Its open check requires peers equal to `member.replicaIds` (`:632-646`).
- Each replica opens its own port: `GROUP_ID = partitionId`, `PEER_ID = replicaId`, `BOOTSTRAP_PEER_IDS = replicaIds` (`src/partition/partition-service-raft-init-base.js:305-323`).

**Founding voter set (C).**
- GENESIS yields `voters = founders`, `learners = []`, `bootstrapIndex '0'` (`src/raft/raft-rs-bootstrap-membership.js:142-154`). That flows to `create_node` `peers` (`src/raft/raft-rs-runtime-owner.js:439-446`) and into `conf_state.mut_voters()` (`vendor/raft-rs-wasm/src/lib.rs:373-390`).
- Result: every system group is `{X-p1-r1, X-p1-r2, X-p1-r3}`, three voters on the seed.
- The participation gate admits a GENESIS founder at index 0 (`src/raft/raft-rs-participation-gate.js:61-67`).

**Where "RF 3 on one node" comes from (C).** It has two independent sources that happen to agree:
- **Identities and voter set:** only the `INITIAL_REPLICA_IDS` literal (its array length). The loops use `replicaIds.length` (`seed-partitions-phase.js:126, 130, 224`).
- **Policy:** `PARTITIONS_SCHEMA` `replica_count` default 3 (`src/bootstrap/system-table-core-schema-definitions.js:71`) → `DECLARED_REPLICA_COUNT_DEFAULT` (`src/bootstrap/replication-target-authority.js:21-26`) → the seed partition row (`src/bootstrap/seed-foundation-rows.js:43-58`).

`resolveDesiredReplicationFactor` (`replication-target-authority.js:93-113`) only decodes the persisted row; the founding modules do not import it.

The genesis stamp validator accepts 1 to 1,024 founders, with no odd-count or co-location check (`src/raft/raft-committed-membership-stamp.js:409-429`; `MAX_PEERS` at `raft-committed-membership-constants.js:119`). **A one-founder genesis is already a valid stamp.**

**Priority, default and `nodes-p1` are founded identically (C).**
- `phasePartitions` never consults classification (`seed-partitions-phase.js:115-158`). Founding-time differences are election order only: the registration-required cohort campaigns first (`:412-454`), and `mg-1`'s leadership is awaited before any partition (`:374-403`).
- Classification (`src/bootstrap/system-partition-classification.js:41-69`) gives every seed partition `BOOTSTRAP_CRITICAL`, with separate flags `priorityControlPlane`, `operationLedger` and `formationLivenessDependency` (`nodes-p1` only).

**GENESIS stamp semantics (C).**
- Shape `{kind:'genesis', founders, founderNodeIds}` (`raft-committed-membership-stamp.js:10-13`).
- A founder or joiner is decided by stamp kind, never by a row count. `resolveStampedBootstrapMembership` refuses a GENESIS stamp with `GENESIS_REFUSED_GROUP_EXISTS` when services exist outside the founders (`src/node/replica-handler-committed-membership-methods.js:127-161`).
- A COMMITTED stamp (a join) opens with the leader's voters plus itself as a local learner (`raft-rs-bootstrap-membership.js:73-107`).
- The open-time refusal (prior existence + no durable record ⇒ `reseed-required`, `raft-rs-participation-gate.js:338-350`) is unchanged by this design.

**Rows (C).**
- SERVICES rows for founders are registered STOPPED, then ACTIVE (`src/bootstrap/phases/seed-registration-phase.js:201-313`). `raft_role` is follower, with the leader collapsed to follower (`src/partition/partition-service-row-owner.js:87-103`).
- PARTITIONS `replica_count = 3`, `leader_node_id = seed` (`seed-foundation-rows.js:43-58`).
- MESSAGE_GROUPS `replica_count = 3` (`:14-24`).

**`mg-1` and per-node message groups (C).**
- `phaseMessageGroups` creates three `mg-1` replicas, all on the seed (`src/bootstrap/phases/seed-message-groups-phase.js:65-121`). The consensus port's membership is the injected stamp, else `genesisStamp(replicaIds, founderNodeIds)` (`src/message-group/message-group-consensus-port.js:89-104`).
- **Each joiner also founds its own message group with three co-located founders** (`src/bootstrap/phases/create-message-group-phase.js:246-331`; `src/bootstrap/message-group-assignment.js:105-118`).
- Message-group replica-count constants are hard-coded to 3: `REPLICA_COUNT`, `RAFT_MIN_REPLICA_COUNT`, `DISTRIBUTION_NODES_PER_GROUP` (`src/message-group/message-group-assignment-constants.js:14-17`; path per census, **P** for the directory).

**Seed load (C inputs, P arithmetic).** 46 × 3 + 3 = 141 Raft replicas, each with its own `PartitionService`, SQLite file and raft-rs port. Each port arms `setInterval(tick, tickIntervalMs)` (`src/raft/raft-rs-operation-port.js:436-441`), with a default of 20 ms (`src/config/config-definitions.js:40`). That is about 7,050 tick turns per second on the seed. The 2026-09-24 measurement on 135 groups found about 6,400 timer fires per second idle (memory `rs-raft-per-group-tick-timers-cost`).

### 1.2 How a joiner gets replicas today

**Why it must be REPLACE (C code, P interpretation).** Each system partition already holds 3 voters, which equals its `replica_count`.
- The planner builds `targetCounts` from target nodes (`src/rebalancer/move-planner-move-calculation-methods.js:276-283`). It defers a count-increasing ADD at or over target (`:871-904`). It turns an under-represented node's ADD and the over-represented seed's REMOVE into one `PAIRED_RELOCATION` REPLACE (`:731-812`).
- The cure-table principle reads "a REPLACE cannot cure a count deficit, an ADD cannot cure skew" (`src/rebalancer/replica-placement-cure-policy.js:101-104`).
- The force behind REPLACE is the count invariant applied to a co-located voter set, not Raft itself.

**Per class:**
| Class | Sequence today | Source |
| --- | --- | --- |
| Five priority partitions | ADD j1 (4 voters), ADD j2 (5 voters), REMOVE, REMOVE. The exception rows `PRIORITY_EXPAND_FOR_SPREAD` and `PRIORITY_OVER_TARGET_SPREAD_CURE` re-type the first ADD and clear the removes. | `move-planner-priority-spread-cure.js:268-336`; `replica-placement-cure-policy.js:270-297, 357-381` (C); the sequence is P, measured in 18 local runs (`formation-membership-arithmetic-2026-11-11.md`) |
| Ledger `replica_operations-p1` | REPLACE, then `LEDGER_EXPAND_FOR_SPREAD` ADD, then `LEDGER_DRAIN_SPREAD_SURPLUS` REMOVE | `move-planner-priority-spread-cure.js:212-262`; `operation-ledger-hold-policy.js:226-234` (C) |
| `nodes-p1` | REPLACE, REPLACE, after the formation fact | `system-spread-transition-policy.js:127-187` (C) |
| 39 default system partitions | REPLACE, REPLACE (`PAIRED_RELOCATION`) | P (pre-gate: 26 REPLACEs completed, 55+ still needed) |
| `mg-1` | never moves: `MESSAGE_GROUP_MEMBERSHIP_CHANGE_UNSUPPORTED` | `unified-rebalancer-rebalance-loop.js:403-442` (C) |

**Even voter sets committed during today's formation (C from the sequences above).**
- Every priority partition passes through 4 voters, twice.
- Every REPLACE passes through N+1 = 4 voters.
- RF=1 REPLACE commits a two-voter `{s, t}` window (`test/rebalancer/replace-real-group-handoff.test.js:8-12, 88-90, 184-189`).

### 1.3 The ADD execution path today: voter-first

**Target side (C).**
- A joiner's COMMITTED stamp opens it with the leader's voters plus itself as a learner of its own opening configuration (`raft-rs-bootstrap-membership.js:73-107`). This is the owner's O2 "role establishment" (ruling 2026-10-05).
- After SYNCING is committed it sends `ADMIT_REPLICA` (`src/node/replica-handler-create-methods.js:486-494`; `src/partition/partition-replica-admission.js:499-575`). It re-sends on the learner-promotion cadence (`partition-service-learner-promotion-methods.js:419-428`).

**Leader side (C).**
1. `admitFromCommittedOperation` (`partition-replica-admission.js:294-312`)
2. → `admitPartitionRaftPeer` (`:253-263`)
3. → `port.proposeConfChange({type: ADD_PEER})` (`src/raft/raft-rs-group-membership-admission.js:123-129`)
4. → `ADD_PEER` maps to `AddNode` (`raft-rs-operation-port.js:176-182`; changeType 0 = AddNode, 2 = AddLearnerNode at `lib.rs:1036-1043`).

**So today's partition ADD makes the target a Raft voter immediately.** The comment says it plainly: "the group's applied AddNode that opens the participation gate is the same entry that makes it a voter" (`raft-rs-bootstrap-membership.js:89-96`). "Learner" exists only as:
- the joiner's local view;
- an application role that a proof RPC plus `becomeFollower` ends (`partition-service-learner-promotion-methods.js:378-526`);
- a row-based count check, `src/partition/learner-promotion-count-check.js`, with refusal `WOULD_CAUSE_EVEN_VOTER_COUNT`, a `singleVoterExpansion` allowance that permits 1 → 2 (`:57-60`), and an "all learners fit odd" escape (`:68-77`).

The count check is already an even-count rule, but it acts after Raft has counted the voter.

**No production path proposes `AddLearnerNode` for a partition (C).**
- `ADD_LEARNER` is used only by the message-group membership-transition layer (`raft-rs-group-membership-admission.js:381-461`), whose only importers are tests.
- `admitGroupPeer`'s `ALREADY_MEMBER` check reads `status.peers`, which includes learners (`raft-rs-group-membership-admission.js:212-215`), so `ADD_PEER` on a leader-side learner proposes nothing.
- The participation gate opens only on an `AddNode` of this replica (`raft-rs-participation-gate.js:138-143`). An `AddLearnerNode` would not open it.

### 1.4 Consumers that assume a founding count of 3 or co-located voters

**Main finding (C).** Every readiness and spread gate counts **distinct nodes** holding voters, so one voter and three co-located voters read the same there (one distinct node). What reads the two shapes differently counts **voter rows** or `replicaIds.length`:
- the remove-safety SIMPLE_FLOOR;
- the ledger quorum-concentration hold;
- the spread-cure classifiers and the over-creation cap;
- the lone-replica shortcuts;
- the original-allocation declaration;
- the tests.

**Classes:**
- **DELETE:** exists only because founding is co-located.
- **RESTATE:** the property survives; the assertion or code must change.
- **KEEP:** independent of founding count.
- **RISK:** behaviour changes under one-voter founding and needs a decision or witness.

**(a) Founding constants and bootstrap (C).**
| path:line | Assumption | Class |
| --- | --- | --- |
| `src/bootstrap/system-table-schemas-constants.js:195-378`, `:197` comment | 138 literals; "3 replicas on the seed node" | RESTATE (derive `r1` per partition) |
| `src/bootstrap/seed-original-allocation-declaration.js:35-41, 43-62, 191-197` | catalog digest over the founder lists; member count; `validateAllocation` refuses INCOMPLETE on a count mismatch | RESTATE. A declaration retained from an earlier build becomes refused, through `seed-retained-effects.js:59` and `seed-original-allocation-startup.js:108`. That is the existing typed refusal and is consistent with D7. |
| `src/bootstrap/phases/seed-partitions-phase.js:121-156` | per-index stagger | KEEP (one founder: nothing to stagger) |
| `seed-partitions-phase.js:370-454` | deferred elections, ordered: `mg-1` leadership first, then the registration-required cohort, then the rest | **RISK.** `src/partition/partition-service-raft-init-base.js:442-460, 525-528`: **a lone partition campaigns during `initialize()` even with `deferElection`**, and `startElection` then does nothing. One-voter founding therefore bypasses the seed's election ordering. RESTATE: the seed phase must keep deciding when a founder campaigns, so `deferElection` is honoured for a sole founder. One rule, the phase's. |
| `src/bootstrap/rejoin-hints-durable-evidence.js:472-506`; `seed-registration-runtime-owner.js:20`; `seed-cache-hydration-phase.js:550, 649` | iterate founders | KEEP (list shrinks) |
| `src/bootstrap/seed-foundation-rows.js:18, 52` | `replica_count` 3 = target | KEEP |
| `src/bootstrap/critical-placement-convergence.js:67-71` | comment "3 replicas on the seed node"; logic counts distinct nodes | RESTATE comment |
| `src/bootstrap/owners/partition-quorum-authority.js:331-345, 582` | two voter rows of one partition on one node are "corruption" | KEEP. **Today's co-located founding already reads as corrupt there**; one-voter founding removes the contradiction. |

**(b) Remove-safety floor (C).**
| path:line | Assumption | Class |
| --- | --- | --- |
| `src/rebalancer/operation-workflow-remove-safety-evaluator.js:39-48, 116-133` | SIMPLE_FLOOR = projected voter-ready **rows** after removal ≥ `minReplicaCount` (3, `src/policy/policy-constants.js:103`, read at `priority-publication-safety-rows.js:310-324`), whatever the subject's role | **RISK.** With one voter the floor is unsatisfied before any removal, so **a REMOVE of a dead learner would be refused and would park and keep the partition busy (placement's busy rule), blocking growth for ever.** Today no learner removal exists, because every target is a voter from admission. The floor's predicate stays unchanged for voter removals. A removal whose subject is a committed **learner** removes no voter and is outside the floor's domain, classified from the committed `ConfState`. This needs an explicit R09 record against the sealed `remove-safety-unchanged` clauses (sibling and placement; §4.1). The property those clauses protect, "no removal drops a partition below its voter-ready floor", is preserved: a learner removal drops nothing. |
| same file `:577-605` | system partitions apply SIMPLE_FLOOR to REPLACE too | KEEP. A REPLACE below 3 voters defers, so growth must be by ADD, which is this design. |
| same file `:56-105` | PUBLISHED_SPREAD relief for a cold-formation REPLACE from 1 node to 2 | DELETE candidate (exists for REPLACE-based formation; confirm no other caller) |
| `operation-workflow-remove-safety-universal-tier.js:158-174`; `-entity-tier.js:123-138`; `operation-workflow-committed-node-floor.js:92-95` | user-partition same-node move; message-group minimum; REMOVE initiator not counted | KEEP |
| `src/rebalancer/priority-publication-leader-safety.js:22-55, 141-147`; `priority-publication-safety-shared.js:66-79` | `coLocatedLeaderSiblingObserved`: a follower source sharing the leader's node | DELETE (partitions only) |

**(c) Spread, planner and ledger hold (C, reachability P).**
| path:line | Assumption | Class |
| --- | --- | --- |
| `src/rebalancer/replica-placement-cure-policy.js:212-381`; `move-planner-priority-spread-cure.js:128-336` | `LEDGER_EXPAND`, `PRIORITY_EXPAND`, `PRIORITY_DRAIN`, `OVER_TARGET`: voters ≥ target while distinct nodes < required, reachable only from co-located founding | DELETE (or already deleted by placement WP-G) |
| `src/rebalancer/operation-ledger-quorum-concentration.js:147-153`; `rebalance-coordinator-ledger-interlock-admission.js:82, 502-536`; `operation-ledger-hold-policy.js` | the concentration hold needs `maxVotersOnOneNode` > 1, so it never engages after one-voter founding | DELETE (placement WP-G deletes the interlock; confirm the set) |
| `src/rebalancer/move-planner-move-calculation-methods.js:386-401` | node-level leader fallback, "during seed formation several replicas can share that node" | DELETE for partitions; KEEP while message groups are founded co-located (D5) |
| same file `:403-421, 582-705, 736-812`; `move-planner-state-methods.js:218-226, 568-598`; `system-spread-transition-policy.js:81-125` | generic over-representation, `hasMultipleReplicasOnSameNode`, distinct-node counting | KEEP (generic; message groups) |
| `effective-placement-serial-priority-planner.js:19-25, 190-215`; `replica-status.js:30-50` | TRUE_DEFICIT_ADD precedence; ledger self-move interlock covers REPLACE/REMOVE only | KEEP (consumed by the placement owner) |

**(d) Readiness and formation fact (C).** These count distinct nodes and read one voter the same as three co-located voters: KEEP.
- `serve-eligibility-record-decision.js:122-130` → `priority-recovery-planning-intent.js:219-232`
- `membership-publication-priority-partition-summary.js:560-613`
- `unified-rebalancer-priority-readiness.js:470-553`
- `unified-rebalancer-control-plane-readiness-methods.js:280-295`
- `critical-placement-convergence.js`

The required count `min(3, n)` changes per §2.6 (D4). The row-absent diagnostic (`membership-publication-priority-partition-summary.js:579-601`) reports 2 absent rows instead of 0: diagnostic only.

**(e) CDC (C, consequence P).**
- **RISK, message groups:** `src/message-group/message-group-service-cdc-replication-runtime-methods.js:212-218, 302-319`. **A lone message-group replica (`replicaIds.length <= 1`) applies CDC to its cache locally and proposes nothing to Raft.** A one-voter message group would run a second data path, and events applied before its hint list grows would exist only in the local cache. This decides D5: message-group founding is not changed by this Quest.
- No CDC sender slot keyed by replica index exists. `partition-cdc-obligation-ledger.js` has no per-replica founding logic. `cdc-bootstrap-direct-sql.js:60-80` uses the leader, else the first initialized replica. Seed hydration subscribes on every local founder (`seed-cache-hydration-phase.js:540-575`). All KEEP.

**(f) Raft configuration from replica index (C).**
- New replica ids are the highest observed index + 1 (`rebalance-coordinator-replica-identity-methods.js:476-490`). After one-voter founding, joiners get `r2` and `r3`, not today's `r4` and `r5`.
- The election window derives from the position in the replica's hint list (`src/raft/replica-election-timeouts.js:34-47`; base 1,000/3,000 ms at `config-definitions.js:37-38`; jitter 2,500 ms at `src/raft/constants.js:37-47`). Joiner timeouts therefore shrink from today's r4/r5 windows (P for the exact windows). That affects only who wins after a seed failure. KEEP, observed in WP-F2.
- Peer id is a digest of the name (`raft-rs-peer-identity.js:120-135`).
- Solo-group special cases are KEEP: `partition-service-durability-fitness.js:96-100`; `partition-write-kernel.js:338`; immediate activation when `length === 1` at `partition-service-leader-activation-methods.js:117` (P).

**(g) Tests (C counts).**
- 26 test files import the founding constants; 15 hard-code 3 or an index above 0.
- 152 test or script files mention `-p1-r2`, `-p1-r3`, `mg-1-r2` or `mg-1-r3`; most are fixtures with replicas on distinct nodes (KEEP).
- About 16 describe co-located seed replicas.
- 21 reference the ledger concentration hold; 10 reference the spread-cure rows.

Notable:
| path:line | Asserts | Class |
| --- | --- | --- |
| `test/raft/raft-rs-backend/committed-membership-census.test.js:121-160, 320-391` | structural genesis-stamp and construction-site census; no founding count | KEEP |
| `test/simulation/formation-sim-production-partitions.test.js:41-43, 90-108`; `formation-sim-production-message-groups.test.js:42-164` | 46 × 3 runtimes; `mg-1` × 3 | RESTATE (partitions) / KEEP (message groups, D5) |
| `test/simulation/formation-sim-runner.js:123, 205-233` | **already seeds one `-r1` per priority partition** | KEEP |
| `test/convergence/formation-joint-admission-world.js:715-748` | derived from the constants | KEEP (follows) |
| `test/convergence/dt-formation-joint-admission-release-liveness.test.js:188-195, 300-303`; `:256, 308, 321, 344, 360, 460, 502, 534` | hold engaged, `admittedRemovals > 0`, `lowestFloor == 3`, seed holds 2 ledger voters | DELETE/RESTATE (owned root: restated, never weakened) |
| `test/convergence/dt6-formation-ledger-quorum-spread-first.test.js:93-103`; `dt-formation-priority-placement-before-active.test.js:213-235`; `formation-barrier-test-fixture.js`; `operation-ledger-self-move-hold-engagement-witness-fixture.js` | co-located ledger, "3/0/0 uses REPLACE, ADD, REMOVE" | DELETE |
| `test/rebalancer/ledger-quorum-spread-hold-cure-drain-admission.test.js`; `formation-ledger-spread-voter-ready-readiness.test.js`; `critical-spread-terminal-stall-repro.test.js:246, 351-357`; `surplus-drain-prefers-non-leader-source.test.js:113-116` | co-located priority fixtures | DELETE or KEEP as generic |
| `test/bootstrap/retained-seed-original-handoff.integration.test.js:55-56, 310-397`; `odd-replica-count-invariant.property.test.js:52-77`; `seed-restart-recovery-gate.test.js:608`; `seed-registration-election-scheduling.test.js:20, 118`; `critical-placement-*.test.js` | 141 founders; ≥ 3 founders; `getInitialReplicaIds(TABLES)[1]`; `REQUIRED_REPLICA_COUNT = 3` | RESTATE |
| ten schema tests asserting `length == 3` (e.g. `test/bootstrap/schema-operations-table-schema.test.js:27`, `service-instance-table-schema.test.js:43-45`, `wasm-meta-table-schemas.test.js:114, 159`) | founder count | RESTATE |
| `test/distributed/harness/fresh-formation-routability-predicate.js:276-288`; `test/integration/helpers/embedded-cluster-harness.js:123-132` | target `replica_count` and distinct nodes | KEEP (the journey's predicates are unchanged) |
| `scripts/check-hold-engagement-owner.js:68, 175`; `scripts/check-cure-typing-owner.js:71` | name the concentration and cure owners | RESTATE with their deletion |

**(h) Docs (C).** `architecture/bootstrap.md:71, 80` ("Each partition is a 3-replica Raft group") and `architecture/process-partitioning.md:57-58`: RESTATE.

**The highest-risk consumers, in order:**
1. The voter floor refusing a learner removal (b). This is a liveness defect if missed.
2. The lone-partition campaign bypassing the seed's election order (a).
3. The lone message-group CDC path (e), which settles D5.
4. The original-allocation digest and member count (a), consistent with D7.
5. The sealed DT witness's hold and floor assertions (g).
6. Over-deleting co-location handling that message groups still need (c).

**(rev. 1) Four consumer classes added by the review.**

**(i) TX1 participant release (C).**
- `releaseMemberIds` returns voters ∪ learners, and `null` while joint (`src/partition/partition-participant-release-contract.js:87-96`).
- The cutover reads every member of that cohort (`cohortOf` and `readCohort`, `src/node/replica-handler-participant-cutover.js:48`). Fresh-create release decides from the same member set (`:282`).
- Today learners are never standing members, because every target is a voter from admission. Under learner-first, a dead or lagging learner would hold the release, and the joint window answers `null`.

Class: **RESTATE**.
- The cohort keeps learners. A learner applies the same log and may be promoted, so excluding it would let a promoted member skip the cutover.
- A member that does not answer refuses typed, `RELEASE_COHORT_MEMBER_UNREACHABLE{replicaId, role}`. For a learner, the clearing event is its removal (`MEMBERSHIP_CHANGED`) or its return.
- The placement owner plans the dead learner's removal in the repair class (`DEAD_LEARNER`, a `FAILED_OR_DEAD` kind).
- The joint `null` is woken by `MEMBERSHIP_CHANGED` after the leave, one commit round on the healthy path.
- WP-F1 owns this. Witness W12.

**(j) Managed split/merge and group retirement (C).**
- Neither workflow checks for unresolved replica operations, learners or a joint configuration before starting (`managed-split-workflow.js:190-330`; `managed-merge-workflow.js:257-330`, cited by the 2026-11-11 r2 census, **P** at this HEAD).
- The retirement read refuses joint and re-runs on row events, which do not fire on the leave (`group-retirement-members.js:136-143`, C).

Class: **RESTATE in WP-F1, not deferred**.
- A split or merge is refused typed, `MEMBERSHIP_TRANSITION_IN_PROGRESS`, while the partition is busy (placement's busy rule) or its applied configuration is joint. It is woken by the terminal ledger commit or `MEMBERSHIP_CHANGED`.
- The retirement read's joint refusal is woken by `MEMBERSHIP_CHANGED`.
- Standing learners are members of the frozen set. A dead one is cleared by the same `DEAD_LEARNER` repair.
- Witness W13.

**(k) The admission request driver (C).**
- `drivePendingReplicaAdmission` (`partition-replica-admission.js:356-369`) is the request's only re-send. Its only caller is the learner-promotion cadence (`partition-service-learner-promotion-methods.js:428`), armed at `partition-service-raft-init-base.js:401`.
- The request settles on `isOwnCommittedVoter` (`:343-354`), which reads voters and outgoing voters only.

Class: **RESTATE**. One event-driven requester, settling on "member" (learner or voter) (§2.4).

**(l) Sole-voter branches decided by the founding hint list (C).** They act differently on a one-voter founder:
- `partition-service-raft-init-base.js:442-460`: `initialize()` campaigns a lone replica without scheduling ticks;
- `:525-528`: `startElection` returns early when `replicaIds.length === 1`;
- `:589-590`: the timing rearm needs `replicaIds.length > 1`;
- `raft-rs-operation-port.js:251-253`: the port schedules ticks at open only when `deferElection !== true`;
- `:538-546`: `configureTick` restarts only a running timer;
- `partition-service-leader-activation-methods.js:117`: immediate activation when `length === 1`;
- `partition-service-durability-fitness.js:96-100`: `isSoloReplicaGroup`;
- `partition-write-kernel.js:338`: self-only refusal.

Class: **RESTATE**. Every branch is decided from the applied `ConfState` (§2.2).

**The highest-risk consumer of all (rev. 1):** (l). Missed, the seed would lead every three-voter system group with no heartbeat, check-quorum or election timer after PROMOTE, and again after every seed restart.


### 1.5 What the Raft binding and the port support (C unless marked)

**WASM binding (`vendor/raft-rs-wasm/src/lib.rs`).**
- `create_node` takes voters, learners and an optional bootstrap `confState` that can carry `votersOutgoing`, `learnersNext` and `autoLeave` (`:367-401`, `json_to_conf_state` `:1088-1120`). A joint configuration therefore restores on restart.
- `propose_conf_change_v2(handle, {transition, changes[{changeType, nodeId}], context?})` (`:727-737`, shape `:280-289`) places no limit on the number of changes, and accepts any transition (0 Auto, 1 Implicit, 2 Explicit, `:1045-1052`).
- `apply_conf_change` returns the full `ConfState` (`:739-751`).
- `decode_conf_change_entry` maps empty data to the leave change (`:756-799`).
- `status` returns `pendingConfIndex` and per-peer progress `{id, matched, nextIdx, state, paused, recentActive}` for every tracked peer, learners included, on the leader (`:683-716`; upstream `status.rs:48-49`, `tracker.rs:370-380`).
- The binding deliberately has no add/promote helpers: "the policy of adding a learner, waiting for it to catch up, promoting it and removing the old voter is Lagrange's" (`:718-725`).

**raft-rs 0.7 core (crate paths).**
- A `ConfChangeV2` goes joint when `transition != Auto` or it has more than one change. Auto and Implicit set `auto_leave = true` (`raft-proto confchange.rs:127-142`).
- `Changer::enter_joint` copies incoming into outgoing, applies the changes and refuses only "config is already joint" and "can't make a zero-voter config joint" (`changer.rs:66-89`). So `{s}` → joint(`{s,j1,j2}`, `{s}`) is permitted.
- `make_voter` moves an existing learner into the incoming voters (`changer.rs:188-197`).
- `Changer::simple` refuses "more than one voter changed without entering joint config" (`:135-158`).
- Upstream test data walks exactly this path: `voters=(1)` → enter-joint `v2 v3` → `(1 2 3)&&(1) autoleave` → leave → `(1 2 3)` (`confchange/testdata/joint_autoleave.txt:4-29`, per census).
- **Joint quorum:** commit is the minimum over the incoming and outgoing majorities, and a vote must win both (`quorum/joint.rs:47-67`).
- **Leave:** only a leader, in `commit_apply`, appends the empty leave entry when `auto_leave` is set and applied crosses `pending_conf_index` (`raft.rs:957-984`). The upstream TODO at `:962` reads "it may never auto_leave if leader steps down before enter joint is applied".
  - `become_leader` sets `pending_conf_index = last_index` (`:1227-1232`). A new leader therefore leaves once it applies past that index. **(rev. 1) C on the vendored binding:** the reviewer's probe S3, S4 and S4b (check-quorum step-down and return; leader crash after and before applying the enter) all left the joint with no host action.
  - Measured on real groups through the production runtime host on 2026-11-11, 7 runs per variant: a new leader committed the leave in 1.0-1.8 election timeouts. That was a scratch experiment, not in the repository (r2 note, "Experiments").
- **One change at a time:** a conf change is dropped to an empty normal entry if one is pending, or if it is not the leave while joint (`raft.rs:2062-2091`).
- **Learners:** they never campaign (`promotable = is_voter`, `:2672-2673`; `tick_election` `:1083`). A learner grants a vote if asked, but only voters are tallied (`tracker.rs:308-322`).
- **check_quorum** steps a leader down unless a quorum of the joint voter sets was recently active (`raft.rs:2011-2019`; `tracker.rs:336-363`). Lagrange enables `CHECK_QUORUM` and `PRE_VOTE` (`src/raft/raft-rs-group-constants.js:21-22`).
- A single voter commits on its own (`raft.rs:1054-1058, 1271-1275`).

**JS port and ingress.**
- `normalizedConfChange` passes any `{changes}` array straight through, unchecked (`raft-rs-operation-port.js:171-175`). Typed kinds `ADD_PEER`/`REMOVE_PEER`/`ADD_LEARNER` build one change with `transition: 0` and an admission context `{replicaIdentity, peerId, nodeId}` (`:176-205`).
- The admission ingress `confChangeProposalRefusal` has exactly three refusals: `NOT_LEADER`, `REMOVES_LAST_VOTER` (folding every step), and a pending or joint deferral (`raft-rs-conf-change-admission.js:104-137`).
  - It has no rule for a voter add, no count or parity rule, and no liveness rule.
  - The `REMOVES_LEADER` and `REMOVES_LIVE_QUORUM` refusals, `raft-rs-voter-liveness.js` and `operation-workflow-committed-voter-floor.js`, which the 2026-11-11 designs cite, **do not exist at this HEAD**. They live only on the unmerged `origin/wip/preserve-20261112T120432Z/lagrange` (commits e05d4040f, 5a08f9449, 7a75f52e2).
- **Context decoder.** An admission context requires exactly one change (`raft-rs-committed-membership-context.js:109-120, 178-191`). The runtime decodes before `apply_conf_change` (`raft-rs-runtime-owner.js:1148`) and turns a throw into a group host failure (`:1172-1178`).
  - So a joint entry **carrying** a context fails every replica, a wedge that the 2026-11-11 experiment reproduced.
  - A joint entry **without** a context applies normally (C code; P measured in the same experiment).
  - Node ids are recorded only from a context (`raft-rs-operation-port.js:358-366`). A promote-only joint therefore needs none: each learner's node id was committed by its own `AddLearnerNode` context.
- **Sites that refuse or wait on a joint configuration:**
  - BOOTSTRAP and RETIREMENT reads refuse JOINT, retryable (`raft-rs-committed-membership-read.js:96-104, 129-143`).
  - The promotion view and the removal action stay unresolved while joint (`:253-260, 299-314`).
  - A stamp with outgoing voters is a JOINT defect, so nothing opens from a joint stamp (`raft-committed-membership-stamp.js:376-377`).
  - Message-group authorization (`replica-operation-message-group-membership-authorization.js:426-429`).
  - TX1 participant release returns null members (`partition-participant-release-contract.js:87-90`).
  - The group-retirement read refuses (`group-retirement-members.js:136-143`).
  - Original allocation expects no joint and no learners (`raft-rs-original-allocation-preparation.js:118-123`).
- **Joint-tolerant sites:** leadership transfer, the local log guard, the durable store, the checkpoint format and the conf-state key (`raft-rs-leadership-transfer.js:48-55`; `raft-rs-local-log-guard.js:74-91`; `snapshot-checkpoint-format.js:115-121`; `raft-rs-conf-state-key.js:8-11`).
- **One-voter groups are fully supported.**
  - RF=1 is a valid configuration and RF=2 is excluded: `anyOf [{const:1},{minimum:3}]`, "Preserve the existing exclusion of a two-replica target" (`src/config/config-schema-constants.js:79-81`).
  - `isSoleVoter` re-campaigns after reconstruction (`raft-rs-runtime-owner.js:581-606`).
  - A `PartitionService` with one replica id campaigns at init (`partition-service-raft-init-base.js:439-463`).
- **Real-group harnesses a witness can build on:**
  - `test/raft/raft-rs-backend/partition-node-cluster.js`: `proposeConfigurationChange(changes, transition, leader)` `:414-417`, `coreConfState` `:403-405`, `settle` `:358`.
  - `committed-membership-harness.js`: `formGroup` `:306`, `createJoinOperation` `:337`, `admitThroughRequest` `:432`.
  - `committed-membership-read.test.js:138-164` and `evidence-o1-anchors.test.js:188-245` are the only joint tests. Both use Explicit RemoveNode and commit two voters.
  - Nothing tests a multi-change V2, Auto/Implicit transitions, or the auto-leave path.

### 1.6 History: the 2026-11-11 learner-first design and why it was sent back twice

**What was proposed.** Revision 1 (`learner-first-admission-design-2026-11-11.md`) proposed:
- ADD = AddLearner plus a port-checked promotion;
- a voter-add live-quorum rule at the ingress;
- REPLACE as one joint `{promote target, remove source}`;
- an operation-bound RemoveNode with cancellation;
- message groups on the same path.

**Vet 1: REVISE** (routability quest log entry 171; appended to the design).
- Rule (c) refused every change to a one-voter group for ever, although RF=1 REPLACE is supported.
- Joint configurations are refused across the committed-membership read path. A standing 2026-09-25 record ties enabling joint to O1's genesis model.
- The cancel rules let a RemoveNode commit after CANCELLED.
- Joint REPLACE lacked an authorization and terminal rule.
- The staging left unsafe intermediate trees ("two notions of learner coexist").
- `matched >= commit` starves a remote learner under seed-local load.

**Revision 2** made REPLACE non-joint, added a 1 → 2 exception, deleted cancellation and proposed a first unit of "voter-add check + dead-source-first REPLACE".

**Vet 2: REVISE** (entry 177).
- The one-voter exception was unsatisfiable in the first unit.
- "Dead" was unsound early in a leader tenure, and a new Progress reads live before it has spoken (`tracker.rs:375-379`).
- Dead-source-first is not an ordering change inside today's REPLACE owner.
- The planner has no access to the leader's liveness record.
- Deleting cancel removes the only way back from a REMOVING row.
- The formation-time claim had no arithmetic.

**Experiments run afterwards** (entry 181, scratch only):
1. The joint leave across leader death holds.
2. An outgoing-only leader is stepped down by the existing removed-leader path. That path does not exist at this HEAD (§1.5).
3. The predicate "Replicate state and `matched` ≥ the commit index recorded at the previous sample" held in 100 % of samples, while `matched >= commit` starved.
4. One-voter growth stalls if the new member dies right after promotion.
5. A learner promoted while caught up by snapshot emits no `CONF_CHANGE_APPLIED`/`GATE_OPENED` to subscribers.

**What this design takes from that history, and what it avoids:**
- **Taken:** learner-first admission; the measured promotion predicate (experiment 3; **rev. 1:** its reference is fixed per request and tenure, §2.4); the snapshot event obligation (experiment 5); the joint-leave liveness evidence (experiment 1); one unresolved operation per partition (now the placement owner's lane).
- **Avoided by construction:**
  - (a) No live-quorum or liveness rule is introduced. Founding growth never promotes into a group with a dead member: the voter set before a promotion is `{s}`, the leader itself. The 1 → 2 exception that broke both revisions does not arise for growth, because growth never proposes 1 → 2. **(rev. 1)** RF=1 REPLACE does commit `{s,t}`, as it does today; it is now the named `REPLACE_PROMOTE` window, under owner ruling D1.
  - (b) No joint change with an outgoing-only member. The joint is promote-only, so the removal-subject hand-off, transferee rule, outgoing-only leader step-down and missing-Progress abort class (`raft.rs:937-946`) are all out of reach.
  - (c) No cancellation and no RemoveNode change. REMOVE and REPLACE source removal are untouched.
  - (d) No dead-source-first ordering.
  - (e) No "two notions of learner": D2 puts every target, REPLACE included, on one admission.
- **The vet's "formation-time arithmetic" objection** is answered by §2.9 and WP-M, a measurement before cutover.

The design is still a membership-protocol change. The independent design vet that both revisions received is required again before any unit starts (§5, WP-0).

**Binding precedent for one-voter founding (C):** `solve/epics/formation-seed-decoupling/binding-direction-replica-membership-model-reduction-2026-09-20.md`.
- §11: "Test `current membership = {seed}`, `policy = RF3`: the placement owner issues one ordinary membership-changing ReplicaOperation, completes it, re-evaluates, and issues another until policy is satisfied. Bootstrap-specific membership machinery only if production evidence proves formation requires different consensus semantics."
- §6: an operation "may internally perform multiple execution phases, such as `ADD_LEARNER` -> catch up -> `PROMOTE`".
- §10: ADD and REPLACE are execution mechanisms, not authority kinds.

---

## 2. The design

### 2.1 Facts and owners

| Fact | Owner after this Quest | Today |
| --- | --- | --- |
| Declared replication factor `r` | `resolveDesiredReplicationFactor` / `DECLARED_REPLICA_COUNT_DEFAULT` (`replication-target-authority.js:21-26, 93-113`), unchanged | same |
| **Voter target `V(r, H)`** = largest odd ≤ min(r, H), ≥ 1; H = distinct eligible declared hosts | new pure function `resolveVoterTarget(r, hosts)` in `replication-target-authority.js`, the only definition | five-plus re-derivations of `min(3, n)` (`membership-publication-priority-partition-summary.js:560-563`; `unified-rebalancer-priority-readiness.js:517-520`; `effective-placement-serial-priority-planner.js:253`; `replica-placement-cure-policy.js:247, 279, 322, 366`; `system-spread-transition-policy.js:155, 183`) |
| Founding voter set of a partition group | the founding owner (seed original-allocation declaration; provisioning for user tables, D6), consuming `V(r, H)`. At the seed H = 1, so `{r1}`. Message groups are unchanged (D5). | the 138-literal `INITIAL_REPLICA_IDS` |
| Committed membership (voters, learners, outgoing) | the raft-rs runtime owner's applied `ConfState` (unchanged) | same |
| Replica role (VOTER / LEARNER / ABSENT) | a projection of the replica's own applied `ConfState`, written by that replica | application role ended by a proof RPC + `becomeFollower`; row-based count check |
| Which ADD or PROMOTE is admitted next | `ReplicaPlacementOwner` (placement Quest), via `PLACEMENT_ADMIT` and its busy rule (rev. 1) | per-partition rebalancers |
| Whether a promotion may be proposed now, or withdrawn | the leader's port, in one core turn, for both named transitions `GROWTH_PROMOTE` and `REPLACE_PROMOTE` (§2.4, rev. 1) | the joiner's count check, after Raft already counted it |
| Whether a replica is removed as a learner | the leader's port: typed `REMOVE_LEARNER`, refused `NOT_LEARNER` for a voter (rev. 1) | no learner removals exist |
| Whether a replica is a sole voter (campaign, ticks, activation, write-kernel refusal) | the replica's applied `ConfState` (rev. 1) | `replicaIds.length`, the founding hint list |
| Leaving a joint configuration | the raft-rs core's auto-leave; no host re-driver (rev. 1) | nobody (no joint in production) |
| Formation complete | the declared-size latch Quest (rev. 1): unchanged by this Quest, consuming `V(r_p, D)` from the shared `resolveVoterTarget` | `min(3, eligible)` live summary |
| REMOVE safety floor | `evaluateRemoveSafety` (fix A), predicate unchanged for voter removals. A subject the port answers is a learner (`REMOVE_LEARNER`) is outside its domain, typed `NOT_A_VOTER_REMOVAL` (rev. 1: decided at proposal, not at planning). | applies to every removal; no learner subjects exist |

### 2.2 Founding

**System partitions (all 46: priority, ledger, `nodes-p1`, defaults).**
- `INITIAL_REPLICA_IDS` becomes one replica id per partition, `<table>-p1-r1`, derived from `INITIAL_PARTITION_IDS`, not 46 hand literals.
- The original-allocation declaration builds one member per partition with `genesisStamp([r1], {r1: seed})`. `validateMember` is unchanged in shape (it compares against the declaration's own expected member).
- PARTITIONS keeps `replica_count = 3`: policy, not membership.
- Each group is `ConfState {voters: [r1]}`.
- **Election order is kept, and ticks start (rev. 1, finding 2).**
  - Today a lone partition behaves differently from a three-replica one:
    - with `deferElection` it campaigns inside `initialize()` but never schedules ticks (`partition-service-raft-init-base.js:442-460`);
    - `startElection` returns early when `replicaIds.length === 1` (`:525-528`);
    - the timing rearm needs `replicaIds.length > 1` (`:589-590`);
    - the port schedules ticks at open only when `deferElection !== true` (`raft-rs-operation-port.js:251-253`);
    - `configureTick` restarts only a running timer (`:538-546`).
  - Unchanged, one-voter founders would lead before `mg-1`, out of the seed phase's cohort order (`seed-partitions-phase.js:370-454`), and would **never tick**. After PROMOTE the seed would lead 46 three-voter groups with no heartbeat, no check-quorum and no election timer, and the same again after every seed restart.
  - **Rule: the founding hint list `replicaIds` never decides; every sole-voter branch reads the applied `ConfState`** (voters `= {self}`, no outgoing set):
    - `startElection` always calls `startScheduling()`, and campaigns only when the replica is the sole voter;
    - `initialize()` with `deferElection` does nothing, because the seed phase decides when a founder campaigns. Without `deferElection` it campaigns only as sole voter, the port already scheduling;
    - the timing rearm follows the port's scheduling state;
    - immediate leader activation (`partition-service-leader-activation-methods.js:117`), `isSoloReplicaGroup` (`partition-service-durability-fitness.js:96-100`) and the write kernel's self-only refusal (`partition-write-kernel.js:338`) read `ConfState`.
  - A restored lone replica below its participation gate keeps its existing gate-armed path (`:442-444`).
  - Witnesses: W9 (seed restart after PROMOTE), and R1(d) and R1(e) (founder order and scheduling).
- Partition writes have no lone-replica shortcut. The write kernel commits through Raft only, and refuses a self-only list when a remote leader is known (`partition-write-kernel.js:327-344`, C).

**Effects (C for the mechanism, P for magnitudes):**
- The seed opens 46 partition groups instead of 138.
- One apply per system-table write instead of three.
- One tick timer per partition instead of three.
- Commits on the seed need no peer round trip until promotion. Before any joiner exists, the seed was already its own quorum (3 of 3 local), so no availability is lost.

**Message groups** (D5, recommended: unchanged in this Quest).
- `mg-1` and each joiner's own group keep three co-located founders.
- The reason is the lone-replica CDC branch. With `replicaIds.length <= 1`, `requiresRaftReplication` is false and the event is applied locally with no proposal (`message-group-service-cdc-replication-runtime-methods.js:212-218`, C). One-voter founding would move every message group onto that second data path.
- The follow-up removes the branch, so a lone group proposes like any other, then founds message groups by `V(r, H)`. It is recorded as a finding (R17).
- Until then, the co-location handling message groups need stays: `move-planner-move-calculation-methods.js:386-401`, `hasMultipleReplicasOnSameNode` (§1.4 (c)).

**User tables** (D6): the provisioning owner already founds one founder per distinct node with a GENESIS stamp (`sql-query-engine-provision-target-methods.js:311-557`). It would consume `V(r, H)` for the founder count. **(rev. 1)** With the minimum-routable count left at `quorum(r)`, a two-host RF3 CREATE TABLE then refuses `PROVISIONING_UNAVAILABLE` instead of founding two voters (`sql-query-engine-initial-partition-provisioning.js:207-228`). Split/merge children found through the same path (P). This is an owner decision because it amends F10 (D6).

### 2.3 The voter target and the two-node rule

`V(r, H)` for r = 3: H = 1 → 1; H = 2 → **1**; H = 3, 4 → 3; for r = 5, H ≥ 5 → 5.

A partition whose eligible hosts number two holds one voter and one learner. That state is stable and safe:
- the learner holds a full, continuously replicated copy;
- it never counts for quorum;
- the voter set never becomes `{s, j1}`, where losing either node stops writes.

| 2-host cluster | Today (after formation) | This design |
| --- | --- | --- |
| Voters per priority partition | 3 on 2 nodes, e.g. `{s, s, j1}` (co-located, P) | `{s}` + learner `j1` |
| Seed loss | unavailable (seed holds the majority) | unavailable |
| Joiner loss | tolerated | tolerated |
| Even voter set committed | yes, on the way (4 voters) | never |

Availability is equal. The design only removes the even and co-located shapes.

**(rev. 1) When this applies.** The declared-size latch refuses `D = 2`, so no cluster *forms* on two hosts. The two-host state now arises only in two cases:
- a `D ≥ 3` cluster still forming, with one joiner not yet READY;
- a formed cluster that has lost a host.

In both, the partitions not yet promoted stay at one voter plus one learner.

CockroachDB has the same rule: "up-replicating from 1 to 2 replicas only makes sense if it is possible to be able to go to 3 replicas" (`CheckAvoidsFragileQuorum`, §3).

### 2.4 Up-replication: learner ADD, GROWTH_PROMOTE, and REPLACE's promotion (rev. 1)

All requests below reach the partition leader's port and are decided there in one core turn. That is one decision algorithm with named transitions (R11).

**The catch-up predicate (rev. 1, finding 3).** It is used by ADD completion and by both promotions.
- When a request, keyed **(rev. 2)** by `(operationId, peerId, requestKind)` with `requestKind` ∈ {`LEARNER_CAUGHT_UP`, `GROWTH_PROMOTE`, `REPLACE_PROMOTE`}, is **first evaluated at this leader in tenure T**, the port records `c0` = the leader's commit index at that moment, in the request's volatile record. The record is cleared on step-down.
- The predicate passes when `Progress[peer].state == Replicate` and `Progress[peer].matched ≥ c0`. It is evaluated after every drain of the group, always against the same `c0`. A promotion therefore never inherits the `c0` its learner's ADD recorded. **(rev. 2)** A per-drain evaluation that still fails emits nothing, by intent. The only emission is the answer to the outstanding request when the predicate first holds.
- `Progress::reset` sets `matched = 0`, Probe and `recent_active = false` on every new leadership (`tracker/progress.rs:82-91`, C). So `matched ≥ c0 ≥ 1` implies the peer acknowledged an append in tenure T. That replaces rev. 0's separate "acknowledged in this tenure" clause and the vet's objection that a new Progress reads live before it has spoken.
- The target is fixed, so any learner whose `matched` advances passes, whatever the write rate. A learner that never advances never passes; that is a backpressure finding (R12), not a promotion.
- **Rev. 0's predicate is withdrawn.** "The commit index at the previous sample, evaluated after every drain" tracks the current commit and reproduces `matched >= commit`, which held in 3 % and 0 % of samples in the 2026-11-11 experiment.
- **Exposure, not safety.** At promotion a learner may trail the current commit by the entries committed since `c0`. Until it catches up, commits that need its acknowledgement wait. WP-M measures write latency after promotion.

**ADD (one target; `PLACEMENT_ADMIT`, `moveType ADD`, placement §2.13).**
1. **Create.** CREATE_REPLICA with a COMMITTED stamp. The joiner opens as a learner of its opening configuration and writes SYNCING. The durable acknowledgement releases its identity gate (existing).
2. **Admission at the leader's port** (`admitFromCommittedOperation` → port, one core turn, on its own applied `ConfState` for the target's peer id):
   - absent → propose `AddLearnerNode` with the existing three-key admission context, answer `LEARNER_PROPOSED`;
   - learner → `LEARNER_ADMITTED`;
   - voter → `ALREADY_VOTER`.

   `admitGroupPeer`'s `ALREADY_MEMBER` short-cut on `status.peers` (`raft-rs-group-membership-admission.js:212-215`) is replaced by this typed decision.
3. **(rev. 1, finding 5) The admission request driver.** The target's `partition-replica-admission.js` requester is the one owner. It sends on events only:
   - the durable SYNCING acknowledgement (the first send);
   - a typed answer that names its next step (`NOT_LEADER{hint}` → send to the hint);
   - a change of the partition's leader pointer (the PARTITIONS-row cache notification, used as a trigger only, R05);
   - **(rev. 2)** the router's `TRANSPORT_EVENT.CONNECTION_ESTABLISHED` / `NODE_CONNECTED` for the current leader's node (`message-router-connection-lifecycle-methods.js:452, 566`; `message-router-inbound-dispatch.js:369`);
   - **(rev. 2)** the leader's existing re-drive of accepted requests on gaining leadership or on a settled configuration change (`redriveAcceptedAdmissionRequests`, `partition-replica-admission.js:23, 320`). That one is leader-side and needs no target action.

   **(rev. 2) A delivery failure is not a trigger.** NO_CONNECTION returns at once with `retryAfterMs` (`message-router-delivery-behaviors.js:361-378`), and a missing handler answers fast (`message-router-inbound-dispatch.js:502`). Re-sending on those answers would be a retry loop at the router's reconnect cadence. After such an answer the request waits for the next real event above.

   It settles when the target's own applied `ConfState` names it a learner or a voter (`isOwnCommittedMember` replaces `isOwnCommittedVoter`, `:343-354`), observed on its `CONF_CHANGE_APPLIED` / `MEMBERSHIP_CHANGED`.

   The learner-promotion cadence (`partition-service-learner-promotion-methods.js:419-428`, armed at `partition-service-raft-init-base.js:401`) is deleted with the application promotion. It was this request's only driver (C).
4. **Completion.** The ADD's executor asks the leader's port `LEARNER_CAUGHT_UP{operationId, peer}`. The port answers `CAUGHT_UP` once the catch-up predicate holds, or `CATCH_UP_PENDING` (re-evaluated per drain, silently, finding 6), or `NOT_LEARNER` / `NOT_LEADER`. The executor's re-ask uses the workflow owner's existing wakes, unchanged.

   On `CAUGHT_UP` the ADD is `COMPLETED`, outcome `LEARNER_READY`. Its copy phase, and so its copy capacity in placement, ends there.

**GROWTH_PROMOTE (a PROMOTE operation; `PLACEMENT_ADMIT`, `moveType PROMOTE`).**
- **Row** (placement's rules):
  - `operation_id = pl-<partitionId>-<applyIndex>-<n>` (placement §2.5 step 8; rev. 0's hash id is dropped);
  - `promote_peer_ids` (the set P);
  - `base_configuration_digest`;
  - `copy_source_node_id = null`;
  - steps `PROMOTION_PENDING` → `PROMOTION_PROPOSED` → `COMPLETED`, or → `WITHDRAWING` → `FAILED` **(rev. 2)**, declared in `replica-operation-step-policy.js`, counted by `isIncompleteOperationRowStep` (busy) and disjoint from `COPY_PHASE_STEPS` (§2.12 (c)).
- **Admission (placement owner).** All of these must hold:
  - the committed voters `V` plus `P` reach exactly the next odd count ≤ `V(r, H)`;
  - every `p ∈ P` is a committed learner whose ADD completed `LEARNER_READY`;
  - every `p` is on a READY-lease node;
  - every `p` is on a distinct declared host that holds no voter.
- **Execution (port, one core turn).** The port checks:
  - role LEADER;
  - an entry of its own term applied;
  - no pending conf change and not joint (`raft.rs:2062-2091` would otherwise drop it);
  - the applied voters equal the operation's base;
  - every `p` is a learner passing the catch-up predicate;
  - `|V ∪ P|` is odd.

  It then proposes **one** `ConfChangeV2 {transition: Auto, changes: [AddNode p …]}` with **no context**.
  - With `|P| = 2` this enters joint with `auto_leave` (`confchange.rs:127-142`), and the outgoing set `V` is contained in the incoming set `V ∪ P`.
  - With `|P| = 1` (e.g. user-table 2 → 3) it is a simple change.
- **Refusals (typed):**
  - `PROMOTION_PROGRESS_BEHIND` (re-evaluated per drain);
  - `LEADER_TERM_UNAPPLIED`;
  - `CONF_CHANGE_PENDING`;
  - `BASE_CONFIGURATION_CHANGED` (terminal for this operation);
  - `PROMOTION_WOULD_BE_EVEN` (never produced by the owner; the static census pins that);
  - `NOT_LEARNER`;
  - `NOT_LEADER{hint}`.
- **Completion.** The applied `ConfState` is non-joint and contains `V ∪ P` as voters. This is read through the committed membership read, woken by `CONF_CHANGE_APPLIED` / `MEMBERSHIP_CHANGED`.
- **(rev. 1, finding 4; rev. 2, finding 5) Failure is decided only at the port, behind a committed `WITHDRAWING` step.**
  1. The executor first commits the non-terminal step `WITHDRAWING` on the operation row: a compare-and-set from `PROMOTION_PENDING` or `PROMOTION_PROPOSED`, still busy.
  2. Then it sends `WITHDRAW_PROMOTION{operationId}`. The port answers **`WITHDRAWN`** only if all of these hold, and in the same turn it deletes the pending promotion record and **records a per-operation tombstone for the rest of its tenure**:
     - it is leader;
     - it has applied an entry of its own term;
     - `has_pending_conf()` is false;
     - every `p` is still a learner in its applied `ConfState`.
  3. Otherwise it answers `PROMOTION_IN_LOG`, and the operation rolls forward to completion (`WITHDRAWING` → `PROMOTION_PROPOSED` → `COMPLETED`), or `NOT_LEADER{hint}`.
  4. `FAILED` is written only after `WITHDRAWN`. **A FAILED terminal row is never rewritten.**
  - **Why this is sound:**
    - A leader that has applied an entry of its own term holds every entry that can still commit. Entries of earlier terms that are absent from its log can never commit (Leader Completeness, log matching).
    - With no pending conf change, its log holds no enter beyond what it has applied.
    - The tombstone makes `WITHDRAWN` final at that leader.
    - Any port, in any tenure, honours a promotion request only for an operation whose committed step it reads as `PROMOTION_PENDING` or `PROMOTION_PROPOSED` (the existing committed-operation read of ADMIT). The `WITHDRAWING` commit precedes the withdrawal request, so a later leader reading it refuses `OPERATION_WITHDRAWING`.
    - Executor step writes are compare-and-sets from the exact step, so a stale executor's `PROMOTION_PROPOSED` write after `WITHDRAWING` fails.
  - **Residual (R12).** A promotion can still commit after `WITHDRAWN` only if both of these happen together:
    - a later leader's committed read of the ledger is stale (raft-rs has no ReadIndex, so the read is leader-local at the ledger leader);
    - a stale executor sends after its compare-and-set failed.

    This is a double fault. Its effect is a committed three-voter configuration under a FAILED row. The deficit model reads `ConfState`, so nothing re-plans wrongly, and no learner removal can touch the new voters (below). The inaccurate history is recorded as a finding; no settlement owner is invented. If the verifier finds this reachable, the fallback is the 2026-11-11 r2 option (b): a withdrawal command in the partition's own log, which survives leader change.
  - Witness W10. Probe C1 is the paired red on today's raw port.

**REPLACE_PROMOTE (inside a REPLACE; rev. 1, finding 1).**
- **Sequence.** The REPLACE's target is admitted exactly as an ADD (learner, catch-up). Then the REPLACE's own step `TARGET_PROMOTING`, outside `COPY_PHASE_STEPS`, asks the port for `REPLACE_PROMOTE{operationId, target, source}`:
  - the same fences and catch-up predicate as above;
  - additionally, `source` must be a voter in the applied `ConfState`;
  - `P = {target}` exactly;
  - **(rev. 2)** the group is at its voter target, `|V| == V(r, H)`; otherwise it is refused `REPLACE_PROMOTE_NOT_AT_TARGET`, so N+1 is always a transient above target and never a growth path;
  - a simple `AddNode`.

  Then the existing hand-off (if the source leads) and the source RemoveNode, a voter removal under the unchanged floor.
- **Named and separate from growth.** It is the only promotion that may commit an even count, and only N+1, with the paired source removal pending in the same operation. `PROMOTION_WOULD_BE_EVEN` does not apply to it. So in WP-F1, where founding is still co-located and formation still REPLACEs, nothing stops.
- **RF3, live source:** 3 → 4 → 3, as today, but the new voter is proven before it counts. Today it is an unproven `AddNode`, the traced wedge of 2026-11-11.
- **RF3, dead source:** `{A,B,S-dead}` + T → `{A,B,S-dead,T}`. That is **3 of 4 live with one dead member**: quorum 3 is met by A, B and T, and no further failure is tolerated until the source removal commits; then `{A,B,T}`. The 2026-11-11 alternative, dead-source-first (`{A,B}`, then promote), has the same zero-tolerance window and an even set too. It is not adopted.
- **RF=1:** `{s}` + L`{t}` → `{s,t}` → transfer → `{t}`. This is a committed 2-voter window, the existing behaviour of the owned root `replace-real-group-handoff.test.js:8-12, 88-90, 184-189`. **Owner ruling D1.**
- **The RF=1 alternatives, measured** (probe-rev1, the real binding):
  - **J1, Auto joint `{AddNode t, RemoveNode s}`:** accepted. `s` leaves to `{t}`, keeps leading, and drops every proposal. `t` never campaigns. This is a wedge: raft-rs does not step a removed leader down (`raft.rs:2674-2686`), and no removed-leader step-down exists at this HEAD (§1.5).
  - **J3, Explicit joint + `MsgTransferLeader` to `t` inside the joint + `t` proposes the leave:** ends `{t}` and commits writes, never committing a 2-voter set.

    In J3's window every commit and every election needs both `s` and `t`, exactly as in `{s,t}`; probe S5 shows that a joint without its outgoing member elects nobody. J3 also needs Explicit transitions, an operation-owned leave proposer across leader changes, and transfer to an incoming-only voter inside a joint.
- **Failure (rev. 2, finding 3): roll-forward only.**
  - **Before the promotion is proposed:** a REPLACE may fail only behind the same `WITHDRAWING` → port `WITHDRAWN` protocol (the target is still a learner, nothing is pending).
  - **Once the port has answered `PROMOTION_PROPOSED` or `PROMOTION_IN_LOG`,** the REPLACE has **no FAILED exit**. It rolls forward to a removal inside the same operation:
    - normally the source, after hand-off (`COMPLETED`);
    - if the target died, its own target (`COMPLETED`, outcome `TARGET_REMOVED`, the count back to N), a voter removal under the unchanged floor.
  - Today's `REPLACE_TARGET_DEAD_BEFORE_INTENT` and `REPLACE_TARGET_REMOVED_BEFORE_ACTIVE` fail arms (`operation-workflow-recovery-status-reconcile.js:73-75`) apply only before that point. After it they become the target-removal roll-forward.
  - Witness W17.

**Learner removal (rev. 1, finding 4).** `REMOVE_LEARNER{operationId, subject}` is a typed port change.
- Refused **`NOT_LEARNER`** when the subject is a voter, in the incoming or outgoing applied set.
- Deferred `CONF_CHANGE_PENDING` while any conf change is pending (raft would drop it anyway; probe C1).
- Otherwise it proposes `RemoveNode(subject)`, which changes no voter.
- **The voter floor's learner domain (§1.4 (b)) is this typed answer at proposal time, never a planning-time classification.** Probe C1 is the hazard: a `RemoveNode` meant as a learner removal, issued after the enter applied, removed a voter and left `{1,2}`.

**Leaving the joint (rev. 1, finding 8).** The raft-rs core leaves on its own:
- `become_leader` sets `pending_conf_index = last_index` (`raft.rs:1227-1232`);
- `commit_apply` appends the empty leave when `applied` crosses it on a leader with `auto_leave` (`:957-984`);
- the production host applies committed entries and then calls `advance_apply`, in that order (`raft-rs-runtime-owner.js:1272-1303`).

Probes S3, S4 and S4b show the leave committed after a check-quorum step-down and return, and after a leader crash after or before applying the enter. **No re-driver.** W5 witnesses the core on the production host.

**The port refuses every multi-change `ConfChangeV2` that is not `AddNode` of current learners** (`MULTI_CHANGE_SHAPE_REFUSED`). The J1 shape therefore cannot be produced.

**(rev. 2, finding 2) `REMOVES_LEADER`.**
- Every conf change, simple or joint, whose resulting incoming or outgoing voter set no longer names the proposing leader is refused `REMOVES_LEADER` in the same core turn.
- Probe RLEADER shows why: a simple `RemoveNode(leader)` from `{1,2,3}` leaves a leader that keeps leading `{2,3}` and drops every proposal.
- The removal path hands off first (the existing removal-subject hand-off), then proposes from the new leader.
- This also fences the REPLACE source removal and any plain REMOVE of a leader replica.
- Where it lives is coordinated with the investigation agent checking whether today's REPLACE/REMOVE already reach the wedge. If they do, it lands as its own bounded repair before WP-P, and this Quest consumes it.

**(rev. 2, finding 1) Exit of a removed learner.**
- `consensusExitOf` keeps a retiring replica participating while `gateOpen !== true` (`src/node/replica-removal-consensus-exit.js:66-73`; awaited with `REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS` at `replica-handler-remove-execution-methods.js:627-630`). A learner's gate never opens, so a learner removal would end only by the backstop.
- For a subject that is a learner in its own applied `ConfState`, the exit is decided independently of the gate:
  - when its applied `ConfState` no longer names it (probe RL: the live learner applied its own removal);
  - or when the executor relays the leader's committed `REMOVE_LEARNER` answer (a removed peer may never learn its removal's commit).
- The voter path is unchanged.
- Witness W15.

### 2.5 The two-node window, step by step

Seed `s`, joiners `j1` and `j2`, three hosts. Safety is Raft's joint-consensus argument (Ongaro §4.3; `quorum/joint.rs:47-67`). It holds regardless of how far behind a learner is. Catch-up affects only how long the joint window lasts.

| # | Committed configuration | A commit needs | Tolerates | Durability (copies off the seed) |
| --- | --- | --- | --- | --- |
| 0 | founding: voters `{s}` | `s` | nothing (`s` is a single point of failure, **as today**: 3 of 3 voters on `s`) | none, **as today** |
| 1 | ADD `j1` committed: `{s}`, learner `j1` | `s` | loss of `j1` | 1 copy (learner, lagging ≤ one sample) |
| 2 | ADD `j2` committed: `{s}`, learners `j1`, `j2` | `s` | loss of `j1` or `j2`, or both | 2 copies |
| 3 | PROMOTE enter committed (under `{s}`, by `s` alone): joint `{s,j1,j2} && {s}` | `s` **and** one of `j1`/`j2` | loss of one joiner | 2 copies, now voting |
| 4 | leave committed (under the joint quorum): `{s,j1,j2}` | any 2 of 3 | any one node | 3 voters |

No even voter set is committed at any step. Step 3 lasts one commit round on the healthy path: the leader appends the leave when it applies the enter.

**A joiner dies mid-transition:**

| When | Effect | Resolution |
| --- | --- | --- |
| During ADD `j1` (copy) | No voter change; `{s}` keeps committing. | The ADD fails typed (existing workflow failure owner). The placement owner sees the lease lapse (`NODES_OR_FORMATION`) and plans a learner REMOVE. Removing a learner changes no voter, so it is always committable in Raft and outside the voter floor's domain (§1.4 (b); without that change the floor would refuse it and the parked REMOVE would keep the partition busy). Then it re-ADDs on a READY node. |
| After ADD `j2`, before the PROMOTE is proposed | The port refuses `PROMOTION_PROGRESS_BEHIND`: `j2`'s `matched` stays below `c0`. | Typed wait. When `j2`'s READY lease lapses, the executor asks `WITHDRAW_PROMOTION`. **(rev. 1)** Only on the port's `WITHDRAWN` (no pending conf change, both still learners) is the PROMOTE written FAILED. Then the busy rule frees; `REMOVE_LEARNER` `j2`; ADD on `j3`, or on the restarted `j2` with a fresh replica identity; PROMOTE. A 1-voter + 1-learner state can persist safely. |
| **(rev. 1)** The PROMOTE is withdrawn while its enter is already in the leader's log | The port answers `PROMOTION_IN_LOG`, never `WITHDRAWN` | The operation rolls forward to the committed effect. A `REMOVE_LEARNER` planned against the old configuration is deferred while the change is pending, then refused `NOT_LEARNER` (probe C1 shows the `{1,2}` result this prevents). |
| `j2` dies after the PROMOTE is proposed, before the enter commits | The enter commits on `s` alone. Joint; the leave needs `s` + `j1`. | The leave commits; PROMOTE completes with `{s, j1, j2-dead}`. That is an ordinary three-voter group with one dead member, repaired by the steady-state REPLACE (placement `FAILED_OR_DEAD`). Exposure: zero further failures tolerated until repaired, the same as any RF3 group with a dead member. |
| Both joiners die inside the joint window (after the enter, before the leave) | No commit possible: the incoming majority needs a joiner. `s` steps down by check-quorum (`raft.rs:2011-2019`). No election succeeds without a joiner. | **Stall, no safety loss.** The group resumes when either joiner returns with its disk: it votes, a leader is elected and auto-leave fires. **(rev. 1)** C on the binding: probe S3 recovered 11 rounds after one joiner returned. The window is one commit round. In sequential 1 → 2 → 3 the equivalent exposure would be the whole `{s, j1}` period: losing `j1` alone stalls, for as long as `j2` takes to catch up. |
| Both joiners lost permanently inside the joint window | No automatic exit (the same class as any group that has lost its quorum). | `s` holds all data. An operator rebuild is required. Recorded as an exposure with the RF=1-style wording of the 2026-11-11 design; not engineered away. |
| `s` dies (disk intact) at any step before 4 | Stall until `s` returns: `s` is in every quorum (outgoing `{s}`). **(rev. 1)** Probe S5: with `s` lost inside the joint, the joiners stay pre-candidates for 300 rounds and elect nobody. | Identical to today, where all three voters are on `s`. On return the core leaves (probe S4, S4b). |
| `s` loses its disk before step 4 | Loss of `s`'s committed state. The learners on `j1`/`j2` hold copies up to their `matched` index, but learners cannot campaign. | No automatic recovery, **as today** (the 2026-11-11 seed-loss analysis found no rebuild path). Strictly better data exposure than today, because copies exist off the seed from step 1. Unsafe recovery from a learner is a finding, not this Quest. |

### 2.6 Priority partitions, the ledger, the formation fact and the READY lease (rev. 1)

**Ledger (`replica_operations-p1`) founded with one voter (C for the mechanism).**
- The placement owner runs on the ledger leader (placement §2.2). With one voter that leader is `s` from bootstrap, by construction.
- Every `PLACEMENT_ADMIT` commits on `s` alone (no network) until the ledger's PROMOTE.
- **(rev. 1) The ledger rule is consumed unchanged.** While any incomplete placement row on `replica_operations-p1` exists, every other admission is refused `LEDGER_TRANSITION_UNRESOLVED`, of every kind. That includes the ledger's own learner ADDs and its PROMOTE, with the dispatch hold `LEDGER_AWAITING_COPY_IDLE` (placement §2.5 step 6, "The ledger's own transition").
- Rev. 0 argued that the ledger's learner ADDs are "not self-moves". That stays true as a safety fact: a learner never counts for commit, so it cannot block the ledger's own writes. It is **withdrawn as an argument for an exemption**: there is one rule, and it is placement's.
- The cost is three exclusive ledger windows per formation: ADD `j1`, ADD `j2`, PROMOTE. WP-M measures each window's exclusive time. Narrowing step 6 to voter-changing ledger transitions would be placement's decision, made with that measurement.
- **Leadership stays on the seed:** a promotion moves no leadership, and formation has no ledger REPLACE. The 2026-11-11 finding "saturation follows the ledger leader off the seed" is not triggered. Placement §2.2's co-located source rule has nothing left to act on and is deleted (R09, §4.1).

**Priority partitions.**
- ADD `j1`, ADD `j2`, PROMOTE: 3 serial operations instead of 4 (ADD, ADD, REMOVE, REMOVE).
- Peak voter count is 3 instead of 5.
- There is no REMOVE, so the 17 "Message not acknowledged" REMOVE failures in 18 local runs and the pre-gate's STOPPING stalls have nothing to act on during formation.
- Each partition reaches three distinct voter holders in one step, at the leave.

**(rev. 1) The formation fact is not changed by this Quest.** It is owned by the `formation-declared-size-latch` Quest (`formation-latch-design.md` §3.3, §6.3).
- The record moves `DECLARED → FORMED` once, when READY hosts reach ≥ D and every priority partition holds voters on at least `V(r_p, D)` hosts. D is 1 or ≥ 3.
- Founding contributes three things:
  - `resolveVoterTarget(r, H)`, one definition: whichever Quest lands first adds it, and the other consumes it;
  - a learner is never a holder, once the role is projected from `ConfState`;
  - at D ≥ 3 the latch waits for the priority PROMOTEs.
- Rev. 0's edit of the live summary (`required = V(3, eligible)`) and D4 are withdrawn.
- The live summary's remaining repair readers belong to placement WP-F. Founding deletes only the PUBLISHED_SPREAD REPLACE relief (§1.4 (b)), if no other caller remains.

**READY lease: unchanged.** It stays node-local (sibling constraint `ready-means-node-can-serve`; binding 2026-09-28). New learner targets need a valid READY lease, as every placement target does.

### 2.7 Seed loss before up-replication: exposure compared with today

| Window | Today | This design |
| --- | --- | --- |
| Before any joiner | all voters of every system group on one disk and process: total loss on disk loss, unavailable on crash | same (one voter); identical failure domain |
| Priority partitions during formation | off-seed copies from the first ADD; seed-majority until the REMOVEs | off-seed learner copies from ADD `j1`; seed-only voting until PROMOTE |
| 39 default system partitions + `nodes-p1` | seed-only until the background REPLACE wave finishes. Predicted 14-17 min at the pre-gate rate; **never** in all 18 local runs of 2026-11-11 while the readiness latch held them (`system-partitions-stay-on-seed-2026-11-11.md`) | learner copies as soon as the owner admits class 4 after FORMED; 3 voters at their PROMOTE |
| `mg-1` | seed-only (3 co-located voters), for ever (D4 of the placement design) | unchanged (D5) |

What the three co-located voters bought: tolerance of a replica-level fault, such as one SQLite file corrupted while the others are intact. No recovery path uses that (P, 2026-11-11 seed-loss analysis), and it shares every host-level fault.

### 2.8 `mg-1`

This Quest:
- leaves `mg-1` and per-node message-group founding unchanged (D5);
- does **not** make message groups movable;
- does not change the placement Quest's D4.

There are two preconditions for any future change, both recorded as findings for the message-group owner:
- **Lone-replica CDC branch.** It must go (§1.4 (e)) before message groups can be founded with one voter.
- **Fresh replica identity for message groups.** Owner ruling 2026-10-04, item 4, stays the gate for any `mg-1` spread. When it exists, the spread uses the same learner ADD and PROMOTE.

Two founding shapes therefore coexist after this Quest: partitions by `V(r, H)`, and message groups with three co-located founders. This is a recorded, bounded residual with its follow-up, not a second rule hidden in code. The message-group founding sites keep their own literal.

The receipts state: "message-group spread is not claimed; `mg-1` is unchanged".

### 2.9 Formation arithmetic (rev. 1)

**Operations** (C counts from §1.2; P for the new path):

| | Today (3 hosts) | This design |
| --- | --- | --- |
| Ledger | REPLACE, ADD, REMOVE (3) | ADD, ADD, PROMOTE (3), each exclusive (§2.6) |
| Priority (5) | 4 each (20) | 3 each (15) |
| `nodes-p1` | 2 REPLACE | 3 |
| 39 defaults | 78 REPLACE | 117 (78 ADD + 39 PROMOTE) |
| **Operations in total** | **about 103** | **138** (46 more PROMOTE lifecycles) |
| Serial operations per partition | 2 (default) to 4 (priority) | 3 |
| **Copies sourced at the seed** | **92** | **92** |
| Voter changes with a source removal on the seed | ~85 | 0 |
| Seed Raft groups at founding | 141 | 49 (46 partitions + 3 `mg-1`, D5) |

**What the drain needs.** Per placement §2.11, the per-copy seed cost must be at most about 4.3 s to drain 92 copies at `K_src = 2` within about 400 s. The pre-gate measured about 10.5-13 s of seed time per REPLACE.

**What supports the direction, without proving it.**
- The red 0.4.0 lab run (`formation-membership-arithmetic-2026-11-11.md`) measured priority ADD at a median 13.9 s and REMOVE at 15.6 s, against REPLACE at 29.5 and 55.3 s.
- A learner ADD omits:
  - the proof RPC;
  - the hand-off;
  - the source RemoveNode and its STOPPING/REMOVED settlement;
  - the seed-side teardown and cleanup.
- It runs on a seed with a third of the groups.

**What counts against it.**
- 46 extra PROMOTE lifecycles (admission, port turn, one or two commit rounds, terminal write).
- Three serial operations per partition: two admission gaps more per partition than a REPLACE pair.
- The learner's catch-up is a log replay from index 1 for system partitions (P: no compaction of system partitions during formation), so the seed sends the whole log per copy.

**WP-M measures, and reports before WP-F1:**
- seed CPU per learner copy (log replay from index 1);
- the fixed cost of ADD and of PROMOTE (admission to terminal, excluding the copy);
- the enter and leave commit rounds;
- the drain of the 138 operations at `K_src` = 1, 2 and 3;
- the idle seed with 49 groups;
- write latency after promotion;
- the catch-up witness W7 under load.

D8 binds the receipt if the model predicts more than 420 s.

### 2.10 What is deleted (rev. 1)

**Founding-specific:**
- the 138 replica-id literals and the "3 replicas on the seed node" comment (`system-table-schemas-constants.js:195-378`);
- the PUBLISHED_SPREAD cold-formation REPLACE relief (`operation-workflow-remove-safety-evaluator.js:56-105`), if no other caller survives;
- `coLocatedLeaderSiblingObserved` (`priority-publication-leader-safety.js:22-55`);
- the partition branch of the node-level leader fallback (`move-planner-move-calculation-methods.js:386-401`);
- the ledger quorum-concentration hold, its interlock and its policy, if placement WP-G has not already deleted them.

Message-group founding is untouched (D5).

**Promotion (one meaning of learner):**
- `learner-promotion-count-check.js`, with `WOULD_CAUSE_EVEN_VOTER_COUNT`, `singleVoterExpansion` and the overflow allowances;
- `becomeFollower` as promotion, and the proof channel (`partition-service-learner-promotion-methods.js:378-526`, `partition-service-learner-promotion-proof-methods.js`);
- **(rev. 1)** the learner-promotion cadence and its timer (`:419-428`, armed at `partition-service-raft-init-base.js:401`). Its re-send duty moves to the event-driven requester (§2.4);
- `admitGroupPeer`'s `ADD_PEER` for partition admission;
- the raw `{changes}` branch of `normalizedConfChange`.

**Sole-voter branches keyed on the hint list (§1.4 (l)):** re-decided from `ConfState`, not deleted.

**Corrected (rev. 1): the participation gate is unchanged.** It opens at the applied entry that makes the replica a voter, which is now the promotion's `AddNode`.

**Never built (rev. 1):** the leave re-driver of rev. 0.

**Formation exception rows** that exist only because the founding set is co-located (`PRIORITY_EXPAND_FOR_SPREAD`, `PRIORITY_OVER_TARGET_SPREAD_CURE`, `PRIORITY_DRAIN_SPREAD_SURPLUS`, `LEDGER_EXPAND_FOR_SPREAD`, `LEDGER_DRAIN_SPREAD_SURPLUS`) go too, if placement WP-G has not deleted them with the per-partition planners.

A census test pins absence by closure over identifiers, constants, log ids and file names.

### 2.11 Contract-first transition record (rev. 1)

| Item | Record |
| --- | --- |
| 1. Producers and consumers | **Producers:** `resolveVoterTarget` (replication-target authority, shared with the latch Quest); the seed declaration's founding member builder; `ReplicaPlacementOwner` via `PLACEMENT_ADMIT` (ADD, PROMOTE); the leader port's typed requests `ADMIT` (learner), `LEARNER_CAUGHT_UP`, `GROWTH_PROMOTE`, `REPLACE_PROMOTE`, `WITHDRAW_PROMOTION`, `REMOVE_LEARNER`. **Consumers:** `OperationWorkflowOwner` (ADD, PROMOTE, REPLACE target promotion); the committed membership read (LEARNER state); the latch (holders = voters); the remove-safety floor (voter subjects only); the services-row role projection; TX1 participant release; split/merge admission. |
| 2. Owner-defined shapes | The PROMOTE row is placement's row plus `promote_peer_ids` and `base_configuration_digest`. Port outcomes are named states: `LEARNER_PROPOSED`, `LEARNER_ADMITTED`, `ALREADY_VOTER`, `CAUGHT_UP`, `CATCH_UP_PENDING`, `PROMOTION_PROPOSED`, `PROMOTION_IN_LOG`, `WITHDRAWN`, `OPERATION_WITHDRAWING`, `NOT_LEARNER`, `MULTI_CHANGE_SHAPE_REFUSED`, `REMOVES_LEADER`, `REPLACE_PROMOTE_NOT_AT_TARGET`, and §2.4's refusals. **(rev. 2)** The operation row gains the non-terminal `WITHDRAWING` step and the REPLACE outcome `TARGET_REMOVED`. The role is `VOTER`, `LEARNER` or `ABSENT`. No untyped facade, alias or `?.()` probe. |
| 3. Identity and generation | Operation ids follow placement's `pl-<partitionId>-<applyIndex>-<n>`, and the replica id is derived by its applier's identity module. Peer id = digest of the replica name. A promotion is bound to `base_configuration_digest` and its tenure's `c0`. A learner's node id is committed by its `AddLearnerNode` context; promotions carry no context. |
| 4. Ordering | Per partition, placement's busy rule gives ADD → ADD → PROMOTE. Inside a PROMOTE: enter, committed under `{s}`, then leave, committed under the joint quorum. Ledger transitions are exclusive (placement step 6). |
| 5. Absent vs unavailable | A request first evaluated in this tenure has `c0`; a peer whose Progress was reset reads `matched 0` and fails. A joint configuration at a BOOTSTRAP read is the existing retryable `JOINT`. An unknown proposal outcome is resolved by the port's typed answer and `ConfState`, never by the row. |
| 6. Durable commit | ADD: the committed `AddLearnerNode`. PROMOTE: the committed leave entry (the enter alone is not completion). Founding: the GENESIS `ConfState` in the founder's durable store and the retained original allocation (§2.12 (a)). |
| 7. Retained obligations | A PROMOTE whose enter is in a log rolls forward. Only `WITHDRAWN`, after a committed `WITHDRAWING`, permits `FAILED`, and a FAILED row is never rewritten. **(rev. 2)** A REPLACE whose promotion is in the log rolls forward to removing its source or its own dead target. A failed or dead learner is removed by `REMOVE_LEARNER` (repair class). TX1 and split/merge refusals name their clearing events. |
| 8. Wake and cleanup | Catch-up and promotion are re-evaluated on each drain of the leader's group against fixed `c0`; the volatile request records are cleared on step-down. The admission requester's events are listed in §2.4. The leave is the core's. Snapshot restore emits `MEMBERSHIP_CHANGED` and the role-projection event (experiment 5). **One timer is removed** (the learner cadence); none is added. |

### 2.12 P5: the interface agreement with the placement Quest (rev. 1, new)

Answers to `placement-owner-design.md` §2.13, "What this Quest needs from the founding design".

**(a) The founding marker.**
- **User-table and split/merge founders:** accepted. The marker is fix B's GENESIS stamp on the founder operation row: `ReplicaOperationField.BOOTSTRAP_MEMBERSHIP` with `kind === GENESIS`, read by `isGenesisFoundingCreateOperation`. It is retained: no deletion path for `replica_operations` exists, and any future retention owner must keep founder rows (a constraint on that owner).
- **Seed-founded system partitions:** recommended rule.
  - Their founding fact is the seed's completed, retained original allocation (`seed-original-allocation-declaration.js`). It is write-once and retained, and its members carry the GENESIS stamps. A ledger cannot exist before it, so no ledger row can precede it.
  - The FOUND applier refuses a partition id of the static system catalog (`classifySystemPartition`: `BOOTSTRAP_CRITICAL`) with the typed `SYSTEM_PARTITION_SEED_FOUNDED`.
  - The deficit model's `isPartitionFounded(partitionId)` is: system catalog partition, or **(rev. 2, placement rev. 3)** a ledger founder row with the GENESIS marker that is in progress or ACTIVE. When every founder row of a partition is FAILED, the partition is not founded, and a new founding set is admitted. It is one predicate, owned by placement's FOUND module, over two committed facts with different owners (bootstrap and provisioning).
  - The alternative is to record seed founding as terminal FOUND rows through an original right at registration. That gives one marker in the ledger, but needs a record-only FOUND mode and 46 extra rows. Not recommended.
- **Clusters founded before this change** are outside the support envelope (D7), so no case without a marker is supported.

**(b) The `foundingIntentId` shape.**
- User tables: `(schemaJobId, partitionId)`, accepted.
- Split/merge children: `(workflowId, childPartitionId)`. They are founded through the provisioning founder path, the only partition genesis site besides the seed (C: `genesisStamp` appears only in provisioning, the message-group port, the wasm-service port, the stamp module and the seed declaration). That they go through it is P.
- Seed: none (not FOUND).

**(c) The step sets.** Declared in `replica-operation-step-policy.js`:
- PROMOTE: `PROMOTION_PENDING` and `PROMOTION_PROPOSED`, plus `COMPLETED` and `FAILED`.
- The REPLACE target's promotion step: `TARGET_PROMOTING`.
- All are incomplete for the busy rule, and disjoint from `COPY_PHASE_STEPS`. PROMOTE carries `copySourceNodeId: null`.

**(d) The voter target.** `resolveVoterTarget(r, H)` is the single definition, shared with the latch Quest. Placement's `UNDER_REPLICATED` and `HOST_SPREAD` consume it once it lands.

**(e) Wording.** "Conditional ledger insert" and "lane" are replaced by `PLACEMENT_ADMIT` and "busy rule" throughout this document (rev. 1).

**Also agreed:**
- Operation ids follow placement's apply-index rule.
- The ledger rule is consumed unchanged (§2.6).
- Founding's WP-F1 adds three deficit kinds to `replica-placement-owner-deficits.js` in one serial merge after placement WP-F: `LEARNER_DEFICIT` (ADD), `PROMOTION_READY` (PROMOTE) and `DEAD_LEARNER` (the `REMOVE_LEARNER` repair, class repair).

---

## 3. Comparable systems

The sources were downloaded from pinned branches and tags. Line numbers are approximate. Raw copies are in `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/9c1d1357-e0ff-45b9-900a-54a2055bdf9c/scratchpad/dl/`.

**CockroachDB (`release-24.1`).**
- **Founded with one replica.** Every bootstrap range descriptor holds exactly one replica, on the first node and store: `const firstReplicaID = 1; replicas := []roachpb.ReplicaDescriptor{{NodeID: kvstorage.FirstNodeID, StoreID: kvstorage.FirstStoreID, ReplicaID: firstReplicaID}}` (`pkg/kv/kvserver/store_init.go` ~L123-137).
- **Up-replication by the allocator.** `AllocatorAddVoter` has priority 10000, plus the distance to quorum: "Priority is adjusted by the difference between the current voter count and the quorum of the desired voter count" (`allocator/allocatorimpl/allocator.go` ~L243-253, ~L980-987).
  - `GetNeededVoters`: "Ensure that we don't up- or down-replicate to an even number of replicas unless an even number of replicas was specifically requested" (~L661-683).
- **No 1 → 2 without a path to 3.** `allocator/plan/replicate.go` ~L380-394: "up-replicating from 1 to 2 replicas only makes sense if it is possible to be able to go to 3 replicas". The error is `"avoid up-replicating to fragile quorum"`; the check is `CheckAvoidsFragileQuorum` (`allocator.go` ~L1302).
  - With two live nodes a range stays at one voter. With three or more it **does** pass through a transient 2-voter configuration, one `ADD_VOTER` per pass.
- **Learners first.** `ChangeReplicas` "adds all new replicas as learner replicas… used to catch up these new replicas before turning them into voters", then sends snapshots, then "(atomically) changes all learners to voters… If only one replica is being added, raft can chose the simple configuration change protocol; otherwise it has to use joint consensus" (`replica_command.go` ~L1042-1049). Joint changes use an **explicit** leave, `ConfChangeTransitionJointExplicit`, then `maybeLeaveAtomicChangeReplicas` (`pkg/roachpb/data.go` ~L1714-1726).
- **Closest precedent for this design:** `AdminChangeReplicas` promotes several learners in one joint change. Its test adds three voters at once (`client_atomic_membership_change_test.go`). Whether the queue-driven path ever does a multi-voter add is UNVERIFIED.

**TiKV / PD (`release-7.5`).**
- **Founded with one peer, enforced.** `initial_region` pushes one peer (`components/raftstore/src/store/bootstrap.rs` L15-23). PD refuses anything else: `invalid first region peer count %d, must be 1 for bootstrap` (`pd/server/util.go` L72-75).
- **Learner, then promote.** `execAddPeer` emits `AddLearner` then `PromoteLearner` (`pkg/schedule/operator/builder.go` L784-788). For multi-peer operators, "Add all the peers as Learner first. Split `Add Voter` to `Add Learner + Promote`", then one `ChangePeerV2Enter{PromoteLearners}` and `ChangePeerV2Leave` (L571-573; `step.go`). Joint consensus is on by default (`defaultEnableJointConsensus = true`).
- TiKV enters joint with an explicit leave (`components/raftstore/src/store/util.rs` ~L986-991). Its safety check exempts a single voter: "It's always safe if there is only one node in the cluster" (~L1108-1110).
- **One peer at a time.** The rule checker adds one peer per operator, with one operator per region (`rule_checker.go` L196-198; `operator_controller.go` L398-405). So growth is 1 → 2 → 3.
- No odd/even guard was found by grep (an inference from absence). PD tolerates a 2-peer region.

**etcd (server `release-3.5`, raft `v3.6.0`).**
- **Learner, then promote only when in sync.** "Only after its raft log has caught up to leader's can learner be promoted" (runtime-configuration guide). `isLearnerReady` requires `learnerMatch ≥ 0.9 × leaderMatch` (`server/etcdserver/server.go` ~L1884). At most one learner: `const maxLearners = 1` in 3.5 (`membership/cluster.go`).
- **The 1 → 2 problem, documented:**
  - "If adding a new member to a 1-node cluster, the cluster cannot make progress before the new member starts because it needs two members as majority" (runtime-configuration guide).
  - "Adding a new member to a 1-node cluster changes the quorum size to 2, immediately causing a leader election when the previous leader finds out quorum is not active" (`design-learner`).
  - "Adding a member to bring the size of cluster up to an even number doesn't buy additional fault tolerance" (FAQ).
- **One change at a time** in raft: "possible unapplied conf change", "must transition out of joint config first" (`raft.go` ~L1318-1326; the same strings are in raft-rs 0.7 `raft.rs:2062-2091`).
- **Joint consensus in etcd raft.** `ConfChangeTransitionAuto` "Automatically use the simple protocol if possible, otherwise fall back to ConfChangeJointImplicit"; "Joint Consensus avoids entering fragile intermediate configurations" (`raftpb/raft.proto` L116-134, 178-205).

**Raft dissertation (Ongaro 2014).**
- §4.2.1: a new server "joins the cluster as a non-voting member… Once the new server has caught up… the reconfiguration can proceed".
- §4.3: joint agreement "requires separate majorities from both the old and new configurations".
- §4.4 (bootstrap): "one server is initialized with a configuration entry… it alone forms a majority". The same section warns that a two-server cluster cannot mask any failure.

**Adopted:**
- Found with one replica (CockroachDB, PD, Raft §4.4; PD enforces it).
- Learners before voters (all four).
- Never take 1 → 2 unless 3 is reachable (CockroachDB `CheckAvoidsFragileQuorum`). This design strengthens it to "never commit 2" by promoting both learners in one joint change. CockroachDB's admin path and PD's builder both promote several learners in one joint change, so the step is supported by the protocol, not invented.
- A single owner of placement (PD) is the placement Quest's.

**Not adopted:**
- The transient 2-voter configuration that CockroachDB and PD accept on the automatic path (owner decision).
- **Explicit leave.** CockroachDB and TiKV leave explicitly because their range descriptor or region epoch tracks the joint state. Here the committed `ConfState` is the only membership authority (no descriptor), so Auto (automatic leave by the core) keeps one owner of the leave. **(rev. 1)** The host re-driver of rev. 0 is dropped: probes S3, S4 and S4b show the core leaving on its own.

  Choosing Explicit instead would make the PROMOTE operation the leave proposer. Its executor would then have to survive leader changes, which is the coordinator continuation gap measured on 2026-11-07. That is recorded as an alternative under D3, not recommended. **(rev. 1)** Probe J3 shows an Explicit joint works with a transfer inside the joint and a leave proposed by the new leader. It is still a leave owned by an operation across leader changes.

---

## 4. Quest proposal (rev. 1)

### 4.1 Record (`solve/quests/single-voter-founding-and-odd-growth/quest.json`, unsealed until WP-B measures red)

```json
{
  "schema": "solve-quest/2",
  "id": "single-voter-founding-and-odd-growth",
  "class": "product",
  "epic": "operation-integrity-and-reliable-formation",
  "statement": "Every partition Raft group is founded with V(r,H) voters, one per distinct eligible declared host, where V(r,H) = resolveVoterTarget(r,H) is the largest odd number not above min(r,H) and at least 1; at seed bootstrap every system partition, the operation ledger and the priority control-plane partitions included, is founded with exactly one voter, its r1 replica on the seed, while its declared replication factor stays 3. Every new replica enters its group as a Raft learner (AddLearnerNode) through an admission request re-sent only on events. A learner becomes a voter only through one of two named transitions decided by the partition leader's port in one core turn, after the learner passes the catch-up predicate (Progress Replicate and matched at or above the leader's commit index recorded when this tenure first evaluated the request): GROWTH_PROMOTE, a PROMOTE operation admitted by the ReplicaPlacementOwner through PLACEMENT_ADMIT, commits only an odd incoming voter set, so growth from one voter promotes two learners in one automatic-leave joint ConfChangeV2 whose outgoing set is contained in its incoming set; REPLACE_PROMOTE, inside a REPLACE, promotes only that REPLACE's own target while its source is still a voter and commits N+1 voters transiently before the source removal. A promotion fails only on the port's WITHDRAWN answer; a learner is removed only by a typed port change that refuses a voter; the joint leave is the raft-rs core's. Every sole-voter decision reads the applied ConfState, never the founding hint list; the replica role is a projection of the applied ConfState. No node ever hosts two replicas of one partition; a fresh formation commits no even voter set and admits no REPLACE or REMOVE. Message-group founding and the formation fact are not changed by this Quest. The co-located partition founding literals, every mechanism that exists only because founding voters were co-located, and the application-level learner promotion (proof RPC, becomeFollower promotion, the row-based promotion count check, the learner-promotion cadence) are removed from source, tests, contracts, baselines and documentation, not disabled.",
  "doneWhen": {
    "probe": "test-receipt",
    "args": {
      "file": "solve/quests/single-voter-founding-and-odd-growth/evidence/receipt.json",
      "requiredReceipts": [
        "reproducer-red-on-base",
        "support-envelope-fence-witness",
        "seed-cost-measured-before-wp-f1",
        "real-group-founding-growth-witnesses",
        "reproducer-and-owned-roots-green",
        "negative-controls-red",
        "removed-mechanism-and-single-promotion-path-census-zero",
        "lab-journey-three-consecutive-product-defaults",
        "independent-verification"
      ]
    }
  },
  "constraints": [
    {"id": "bounded-repair-and-separate-claims", "statement": "Bounded repair of the founding shape measured on 219c27bfe and 19a2134c5: 46 system partitions and mg-1 founded as three co-located voters on the seed (141 Raft groups on the seed), every formation move a REPLACE or a voter-first ADD, and even voter sets committed during formation. The physical receipt is measured on the same runs that feed replica-placement-admission-owner's lab-journey receipt and fresh-formation-user-table-routability's scenario-green-three-consecutive; no receipt is copied into another. A remaining cause outside founding and promotion is recorded as the service blocker with its owner; scope is widened only by an explicit recorded decision (R16)."},
    {"id": "one-founding-voter", "statement": "The seed founds every system partition with one voter (r1) through the original-allocation declaration consuming resolveVoterTarget(r, 1); no partition replica-id literal list, hand count or second partition founding rule exists. The seed phase remains the one owner of when a founder campaigns (mg-1 leadership, then the registration-required cohort, then the rest), witnessed unchanged. Message-group founding (D5) and user-table and split/merge-child founding (D6) follow the owner's decisions recorded before sealing."},
    {"id": "odd-growth-and-named-replace-promotion", "statement": "A voter-count increase outside a REPLACE is a GROWTH_PROMOTE and commits only an odd incoming voter set; 1 to 2 is never proposed by growth. REPLACE_PROMOTE is the only promotion that may commit an even voter count: exactly N+1, only the REPLACE's own caught-up target, only while its source is a voter, only when the group is at its voter target (|V| == V(r,H)), with the source removal pending in the same operation; for RF=1 that is the {s,t} window (owner decision D1 = named window, 2026-11-18). Once a REPLACE_PROMOTE is in the log the REPLACE rolls forward only, to the removal of its source or of its own dead target, and never ends FAILED. The port refuses REMOVES_LEADER for every conf change that removes the proposing leader; hand-off comes first. A fresh formation of three or five nodes commits no even voter set and admits no REPLACE or REMOVE. The port refuses every multi-change ConfChangeV2 that is not AddNode of current learners."},
    {"id": "learners-before-voters", "statement": "Every new replica is admitted with AddLearnerNode; no AddNode of a non-member is ever proposed for a partition. A promotion is proposed only by the leader's port in one core turn that verifies leadership, an own-term applied entry, no pending or joint configuration, the operation's base configuration, and for every promoted learner the catch-up predicate against the commit index fixed at the request's first evaluation in the tenure."},
    {"id": "promotion-and-learner-removal-decided-at-port", "statement": "A PROMOTE (and a REPLACE before its promotion is proposed) commits a non-terminal WITHDRAWING step first and is written FAILED only after the leader port answers WITHDRAWN (leader, own-term entry applied, no pending conf change, every subject still a learner, pending record deleted and a per-operation tombstone kept for the rest of the tenure, in the same turn); any port honours a promotion only for an operation whose committed step is PROMOTION_PENDING or PROMOTION_PROPOSED; otherwise the operation rolls forward to the committed effect; a FAILED terminal row is never rewritten. A removed learner exits on its own applied ConfState or the relayed REMOVE_LEARNER answer, independent of the participation gate. A learner is removed only by REMOVE_LEARNER, refused NOT_LEARNER when the subject is a voter in the incoming or outgoing applied set and deferred while a conf change is pending; the voter floor's learner domain is that typed answer, never a planning-time classification."},
    {"id": "add-via-placement-owner-only", "statement": "ADD and PROMOTE are admitted only by the ReplicaPlacementOwner of replica-placement-admission-owner through PLACEMENT_ADMIT; the busy rule, the ledger-transition rule and the apply-index operation ids are consumed unchanged; a static check proves the caller set. This Quest's behaviour changes start only after that Quest's WP-F has landed."},
    {"id": "joint-leave-by-core", "statement": "Exactly one source module proposes a multi-change ConfChangeV2 (the port's GROWTH_PROMOTE path): Auto, AddNode of current learners, no context, outgoing contained in incoming. The leave is the raft-rs core's; no host-side leave re-driver exists. Witnessed on the production host: leader crash after and before applying the enter, check-quorum step-down and return, both joiners lost and one returning, the seed lost inside the joint (no election)."},
    {"id": "sole-voter-from-confstate", "statement": "Every branch that today keys on replicaIds.length (initialize campaign, startElection, timing rearm, leader activation, solo durability fitness, the write kernel's self-only refusal) is decided from the applied ConfState; startElection always starts tick scheduling. Witnessed: a seed restarted after PROMOTE ticks, heartbeats and steps down by check-quorum as a three-voter leader."},
    {"id": "admission-request-event-driven", "statement": "The target's admission request has one owner and is sent only on the durable SYNCING acknowledgement, a typed answer naming its next step, a change of the partition's leader pointer, the router's connection-established event for the leader's node, or the leader's existing re-drive of accepted requests; a delivery failure answer is never a re-send trigger; it settles on the target's own applied ConfState naming it a learner or voter. The learner-promotion cadence is deleted."},
    {"id": "no-timer-no-bound-no-retry", "statement": "No timeout, bound, retry count, delay or polling interval is added or changed to obtain liveness. The only timer change is the deletion of the learner-promotion cadence, whose duty moves to events. Catch-up and promotion are re-evaluated on the leader's drain events; failures resolve on lease-lapse events owned by the lease authority. Other existing execution cadences are untouched and stepped by name in deterministic harnesses."},
    {"id": "colocated-assumptions-deleted", "statement": "Every consumer classified DELETE in the design's consumer census (section 1.4) is removed; every RESTATE consumer asserts the property against one voter, learners and the voter target; a census test pins absence by closure over identifiers, constants, exports, log ids and file names. No node ever hosts two replicas of one partition (static and runtime witness); message groups are excluded per D5."},
    {"id": "one-owner-per-fact", "statement": "resolveVoterTarget is the only definition of the voter target, shared with formation-declared-size-latch and consumed by founding and the placement deficit model; the replica role has one meaning (a projection of applied ConfState, emitted on conf-change apply and on snapshot restore); no consumer re-derives min(3, n) or counts co-located replicas."},
    {"id": "remove-safety-unchanged-for-voters", "statement": "The remove-safety floor as amended by fix A, its predicate and its committed-node authority are unchanged for every removal whose subject is a voter; learners never count toward it; a REMOVE_LEARNER answered by the port is outside its domain (typed NOT_A_VOTER_REMOVAL), recorded as an R09 supersession of the sealed remove-safety-unchanged clauses for that domain only. The verifier attempts: removing the only voter of a one-voter partition; removing a voter of a just-promoted group while the other new voter is not caught up; and a learner removal whose subject is promoted between planning and proposal."},
    {"id": "participant-release-and-split-merge", "statement": "TX1 participant release keeps voters and learners in its cohort; an unreachable learner refuses typed with its removal or return as the clearing event, and the placement owner removes dead learners in the repair class; a PROMOTE's joint window is woken by MEMBERSHIP_CHANGED. Managed split and merge are refused typed while the partition is busy or joint and are woken by the terminal ledger commit or MEMBERSHIP_CHANGED; the group-retirement read's joint refusal is woken by MEMBERSHIP_CHANGED."},
    {"id": "sibling-constraints-honoured", "statement": "The sealed constraints of formation-ready-lease-independent-of-spread, replica-placement-admission-owner and formation-declared-size-latch hold except the R09 records named below. READY stays node-local; no pre-READY target; the formation fact is the latch's; the DT join-core witnesses (durable rejoin, rolling restart of a joiner and of the seed during formation, wiped joiner data directory, five-node formation, single-node operation, two nodes added to a formed three-node cluster) stay green."},
    {"id": "supersessions-recorded-first", "statement": "Before any source change, R09 records quote and supersede: the remove-safety-unchanged clauses of formation-ready-lease-independent-of-spread and replica-placement-admission-owner for the learner-subject domain only; raft-rs-full-cutover's 'a target becomes a voter on the row change that records its fact'; replica-admission-from-committed-operation's 'admitted' (now admitted as a learner); the learner-promotion quests whose statements bind the proof RPC, becomeFollower promotion, the count check or the learner cadence (census in WP-0); placement-owner-design section 2.2's co-located source rule; the 2026-09-25 record that enabling joint changes requires O1's genesis model (superseded by the 2026-10-05 fold of entries at or below the bootstrap index, raft-rs-runtime-owner.js:1135-1141, together with the BOOTSTRAP read's JOINT refusal, witnessed by W-FOLD-JOINT); and every restated assertion of the sealed DT witness dt-formation-joint-admission-release-liveness (hold engagement, admitted removals, floor 3, seed ledger voters). The contract-first transition record (design section 2.11) is written to evidence/transition.md."},
    {"id": "odd-node-proofs", "statement": "Every multi-node proof, harness default and budget uses three or five nodes. The two-host behaviour is witnessed inside a three-node world (one joiner withheld or killed), never as a two-node formation proof."},
    {"id": "upgrade-fence", "statement": "Delivered by the early work package WP-V, before replica-placement-admission-owner's WP-F and WP-D merge (their precondition P6). In-place upgrade across this release boundary, including from any version that founds co-located voters, is unsupported and fenced through the support-envelope owner, keyed on a cluster format revision it owns and the seed writes into its original allocation: the release's certified version pair excludes every pre-change source version (rolling-upgrade admission refuses OUTSIDE_SUPPORT_ENVELOPE); join admission refuses a mixed pair through resolveJoinSupportEnvelopeConflict; a seed restarting on a retained pre-change original allocation refuses typed ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED before any founder opens. No compatibility reader or dual founding path."},
    {"id": "static-gates-and-ratchets", "statement": "No ratchet baseline is raised; baselines and the fallback census change only by removed occurrences; nothing moves into a file near the size limit; every checker the Solver and the pre-commit hook run is clean on the change set."},
    {"id": "lab-execution-product-defaults", "statement": "Suites and live runs execute on the lab through scripts/lab.js under the machine lock with thermal headroom, at product default timeouts, cpus 1.0 on the seed, unchanged predicates and bounds; full node logs, the harness report and the per-group committed configuration time series are retained per run. WP-M reports before WP-F1."},
    {"id": "source-change-subagent-verification", "statement": "The revised design is re-vetted by an independent subagent before any unit starts; any source change is verified on the exact candidate by a fresh independent verifier before audit and landing (note --verification ... --verifier subagent:<id> --verdict approve)."}
  ],
  "verificationTemplates": [
    "formation-circularity",
    "owner-interaction",
    "harness-fidelity",
    "recovery-replay",
    "concurrency-serialization",
    "admission-gating",
    "sweep-timer"
  ]
}
```

### 4.2 Deterministic reproducer (WP-B), RED today

**R1. Founding census** (new `test/bootstrap/seed-founding-voter-census.test.js`).
- **Runs** the production seed bootstrap phases (`SeedMessageGroupsPhase`, `SeedPartitionsPhase` through the original-allocation preparation) in-process with real raft-rs ports. It does **not** read `INITIAL_REPLICA_IDS` in the assertion.
- **Asserts:**
  - (a) every system partition has exactly one voter, on the seed, and no learner;
  - (b) the seed hosts at most one replica of any partition;
  - (c) the seed's Raft group count is 49 (46 + `mg-1` × 3, D5);
  - (d) founders campaign in the seed phase's order;
  - (e) **(rev. 1)** every founder's port is scheduling ticks after the phase starts it.
- **Expected on `19a2134c5`:** RED on (a), (b) and (c); (d) and (e) green. Both turn red if one-voter founding is applied without the §2.2 rule, which makes them negative controls N5 and N7.

**R2. Formation membership trace** (extends placement's `dt-placement-owner-formation-drain` world).
- **Records** every committed configuration and the replica placement per node.
- **Asserts:**
  - **F1:** no co-located partition replicas;
  - **F2:** no even incoming voter set in growth;
  - **F3:** zero REPLACE and zero REMOVE during formation; per partition exactly two learner ADDs and one PROMOTE;
  - **F4:** completion with ledger quiescence, and `mg-1` unchanged;
  - **F5:** with `j2` withheld, one voter plus learner `j1` and no PROMOTE.
- **Expected red:** F1-F3 on the base.
- If the placement world's replica-runtime double cannot give real committed configurations (WLD:578-610), F2 is measured on R3's real groups. The choice is recorded before sealing.

**R3. Real-group witnesses** (receipt `real-group-founding-growth-witnesses`). Built on `test/raft/raft-rs-backend/partition-node-cluster.js` and `committed-membership-harness.js`, through the production port and runtime host, with deterministic ticks. The reviewer's S1-S7 and my J1-J3/C1 are their scratch precursors.

| Id | Witness |
| --- | --- |
| W1 | Happy path: the exact sequence `{s}`, `{s}+L{j1}`, `{s}+L{j1,j2}`, `{s,j1,j2}&&{s}`, `{s,j1,j2}`, with writes throughout (S1). |
| W2 | A GROWTH_PROMOTE of one learner from `{s}` is refused `PROMOTION_WOULD_BE_EVEN`. A multi-change `{AddNode t, RemoveNode s}` is refused `MULTI_CHANGE_SHAPE_REFUSED` (the J1 shape). |
| W3 | `j2` killed before the PROMOTE (refused; withdrawn), and after the enter (the leave commits with `s` + `j1`) (S2). |
| W4 | Both joiners killed after the enter: no commit and no safety loss; one returns and the leave commits (S3). |
| W5 | The core's leave after a leader crash after and before applying the enter, and after a check-quorum step-down. **No re-driver exists** (S4, S4b). The seed lost inside the joint elects nobody (S5). |
| W6 | A learner caught up by snapshot install is promoted, and its role projection, `MEMBERSHIP_CHANGED` and `GATE_OPENED` fire on restore (experiment 5). |
| W7 | Catch-up under steady seed-local load (100 and 500 writes/s, 5-20 ms link delay) passes with fixed `c0`. N8 runs the same load with a per-drain reference. |
| W8 | No joint entry carries a context; the decoder is untouched. |
| W9 **(rev. 1)** | Seed restart after PROMOTE: every seed group schedules ticks; followers see heartbeats across ≥ 3 idle election timeouts with no election; partitioning both joiners steps the seed down by check-quorum; no restarted founder takes a lone path. |
| W10 **(rev. 1)** | The withdrawal race (C1 derived): `WITHDRAW` while the enter is pending answers `PROMOTION_IN_LOG`; `REMOVE_LEARNER(j2)` after the enter answers `NOT_LEARNER`; the result is never `{s,j1}`. |
| W11 **(rev. 1, rev. 2)** | Admission request: the `ADMIT` answer is dropped once, the leader's node connection drops and re-establishes, and the leader changes once. The request settles with no cadence. A NO_CONNECTION answer alone produces **no** re-send; the next send follows `CONNECTION_ESTABLISHED`, the leader-pointer change or the leader's re-drive. |
| W12 **(rev. 1)** | TX1: a pause engaged with a dead learner refuses typed until `REMOVE_LEARNER`, then releases; a pause engaged during a PROMOTE joint releases after the leave. |
| W13 **(rev. 1)** | A split requested during a PROMOTE is refused `MEMBERSHIP_TRANSITION_IN_PROGRESS`, then proceeds after the leave. |
| W14 **(rev. 1)** | REPLACE_PROMOTE: RF3 live source 3 → 4 → 3; dead source `{A,B,S-dead}` + T (3 of 4 live, then `{A,B,T}`); RF=1 per the D1 ruling (`{s,t}` or the J3 shape). |
| W15 **(rev. 2)** | A live learner and a dead learner are each removed by `REMOVE_LEARNER`. The live one exits on its own applied `ConfState`, the dead one on the relayed answer, and neither waits for `REMOVAL_CONSENSUS_EXIT_BACKSTOP_MS` (probe RL). |
| W16 **(rev. 2)** | `REMOVES_LEADER`: a `RemoveNode(leader)` from `{1,2,3}` is refused at the port. After hand-off the new leader removes the old one, and writes commit (probe RLEADER is the paired red). |
| W17 **(rev. 2)** | REPLACE roll-forward: the target dies after `REPLACE_PROMOTE` is in the log. The REPLACE removes its own target and completes `TARGET_REMOVED`; it never ends FAILED. A `REPLACE_PROMOTE` on a group below target is refused `REPLACE_PROMOTE_NOT_AT_TARGET`. |
| W-FENCE **(rev. 2, WP-V)** | Each of the following refuses typed: a seed restarted on a retained original allocation of a pre-boundary cluster format revision (before any founder opens); a joiner of the other side of the boundary (join admission, `resolveJoinSupportEnvelopeConflict`); and a rolling-upgrade operation across the boundary (`OUTSIDE_SUPPORT_ENVELOPE`). Receipt `support-envelope-fence-witness`. |
| W-FOLD-JOINT **(rev. 1)** | A joiner bootstrapped before, during (BOOTSTRAP read refused `JOINT`, retried after the leave) and after a growth joint equals the leader's `ConfState` at every applied index, across restart. |

**Negative controls** (receipt `negative-controls-red`):
- N1: founding with three voters → R1(a) red.
- N2: the parity rule removed → F2 and W2 red.
- N3: learner admission replaced by `AddNode` → W1 shows a 2-voter configuration; census red.
- N4 **(rev. 1)**: the port admits the J1 shape → the group wedges (W2 red).
- N5: sole-voter decided by `replicaIds.length` → W9 and R1(e) red.
- N6: the floor applied to a learner subject → the dead-learner REMOVE parks.
- N7: a founder campaigning inside `initialize()` → R1(d) red.
- N8 **(rev. 1)**: the catch-up reference re-sampled per drain → W7 starves.
- N9 **(rev. 1)**: PROMOTE failure decided from committed `ConfState`, with planning-time learner classification → W10 red (`{s,j1}`).
- N10 **(rev. 2)**: the learner exit keyed on `gateOpen` → W15 waits for the backstop (red).
- N11 **(rev. 2)**: `REMOVES_LEADER` removed → W16 wedges (the RLEADER shape).

**Seal:** R1 and R2 (F1-F3) red on the composed base, then `node scripts/solve.js start --id single-voter-founding-and-odd-growth`.

### 4.3 Owned roots that must stay green

- `test/convergence/dt-formation-joint-admission-release-liveness.test.js`. Its co-location assertions are restated under R09, never weakened.
- The placement Quest's `dt-placement-owner-formation-drain.test.js`.
- `test/raft/raft-rs-backend/*`: `conf-change-pending-deferral`, `conf-change-leader-only`, `committed-membership-*`, `evidence-o1-*`, `partition-peer-admission`.
- `test/rebalancer/replace-real-group-handoff.test.js`: RF=1 and RF=3, restated with REPLACE_PROMOTE.
- The TX1 participant-release suites (`replica-handler-participant-*`) and the managed split/merge suites.
- The join-core wide net (memory `join-core-systemic-coupling`).
- Bootstrap phase and identity-open-refusal suites.

### 4.4 Physical acceptance

- **`seed-cost-measured-before-wp-f1` (WP-M):** the measurement list of §2.9, on `cpus: 1.0`, reported before WP-F1 starts.
- **`lab-journey-three-consecutive-product-defaults`:** the same command, hosts and bounds as the placement Quest's §4.4, on one commit. Per run it records:
  - time to FORMED and to predicate (c);
  - seed Raft groups;
  - learner ADD and PROMOTE counts;
  - the maximum committed voter count per group (odd only during formation);
  - every joint window's length;
  - zero REPLACE/REMOVE during formation;
  - final spread in hosts.

---

## 5. Staged plan (rev. 1)

Lanes marked ∥ run in parallel, in separate worktrees (memory `quest-worktree-isolation`). Merges into the Quest worktree are serial, one writer per interaction. The tree is green after every merge. Implementers are Opus (memory `lead-plans-opus-implements`). The lead reviews every stage before the independent verifier does.

| WP | Lane | Depends on | Owns (writes) | Leaves the tree green because |
| --- | --- | --- | --- | --- |
| **WP-0** Re-vet, records, decisions | ∥ | - | Quest log; `evidence/transition.md`, `evidence/supersessions.md` | Records only. Independent re-vet of rev. 1; the owner's D1-D8; the R09 list of §4.1 (incl. the 2026-09-25 record and the DT restatements) before any source change; the census of learner-promotion quests. |
| **WP-M** Seed cost | ∥ | - | `evidence/seed-cost/` | No source change. The §2.9 list, plus the ledger's exclusive windows. A scratch prototype founds one voter (a test-only build, never merged) to measure learner-copy cost and the idle seed at 49 groups. **Reports before WP-F1** (D8). Shared with placement WP-A where the capture overlaps. |
| **WP-B** Reproducer R1/R2 | ∥ | placement WP-B world | `test/bootstrap/seed-founding-voter-census.test.js`, the drain-world observers, `test/shards/*` | Test-only. Red on the base, then seal. |
| **WP-R** Real-group witnesses | ∥ | - | `test/raft/raft-rs-backend/founding-growth-*.test.js` | Written against the WP-P port API; lands with WP-P (no skip-by-absence). |
| **WP-V** Release fence **(rev. 2, P6)** | ∥, **early** | WP-0 | `src/bootstrap/owners/support-envelope-owner.js` (the boundary's certified pair, and a cluster format revision it owns); the original-allocation declaration (writes the revision; refuses a retained pre-boundary revision before any founder opens, typed); join admission's envelope check (`bootstrap-join-admission-owner.js:38`); W-FENCE | It fences the release boundary only, so behaviour inside the release is unchanged. **It lands before placement WP-F and before WP-D's `host_id` merge**, both of which depend on it (placement P6). WP-F2 consumes the same revision and does not bump it again. |
| **WP-P** Port | ∥ (not wired) | WP-0, and the owner/agent result on `REMOVES_LEADER`'s home | `src/raft/raft-rs-operation-port.js` (typed `ADD_LEARNER`, `LEARNER_CAUGHT_UP`, `GROWTH_PROMOTE`, `REPLACE_PROMOTE`, `WITHDRAW_PROMOTION` with tombstone, `REMOVE_LEARNER`; raw `{changes}` deleted); `raft-rs-conf-change-admission.js` (shape, parity, fence, `REPLACE_PROMOTE_NOT_AT_TARGET` and **`REMOVES_LEADER`** refusals, `MULTI_CHANGE_SHAPE_REFUSED`); `raft-rs-runtime-owner.js` (per-drain request evaluation with `c0` keyed per operation, peer and kind; restore events); `raft-rs-group-membership-admission.js`; `raft-rs-committed-membership-read.js` (LEARNER state) | Exercised only by WP-R and unit tests; no production caller yet. |
| **WP-F1** Stage A: one learner meaning | serial | WP-P, **placement WP-F landed**, **WP-M reported** | **Admission:** `partition-replica-admission.js` (learner admission, event-driven requester, `isOwnCommittedMember`). **Deleted:** `partition-service-learner-promotion-*` and `learner-promotion-count-check.js`. **Sole voter:** `partition-service-raft-init-base.js`, `partition-service-leader-activation-methods.js`, `partition-service-durability-fitness.js`, `partition-write-kernel.js` (decided from `ConfState`). **Role:** `partition-service-row-owner.js` (projection). **Workflow:** ADD completion; PROMOTE execution and the `WITHDRAWING` step; the REPLACE target's `TARGET_PROMOTING`; **(rev. 2)** REPLACE roll-forward (`operation-workflow-recovery-status-reconcile.js:73-75` re-scoped). **Removal exit (rev. 2):** `replica-removal-consensus-exit.js` (learner exit independent of the gate). **Step policy:** steps in `replica-operation-step-policy.js`. **Floor:** `operation-workflow-remove-safety-evaluator.js` (port-typed learner domain). **TX1:** `partition-participant-release-contract.js` and `replica-handler-participant-cutover.js` (typed member refusal). **Split/merge:** `managed-split-workflow*.js`, `managed-merge-workflow*.js`, `group-retirement-members.js` (refusal and wake). **Deficits:** `replica-placement-owner-deficits.js` (`LEARNER_DEFICIT`, `PROMOTION_READY`, `DEAD_LEARNER`). | Founding is still three co-located voters, so formation still moves by REPLACE, now through REPLACE_PROMOTE (named; no parity stop). User-table growth is ADD + PROMOTE. Witnessed by WP-R (W2-W17), DT, the REPLACE real-group suites, TX1 and split/merge. |
| **WP-F2** Stage B: one founding voter | serial | WP-F1, WP-B sealed, D8 answered, `resolveVoterTarget` landed (here or in the latch Quest) | `system-table-schemas-constants.js`, `seed-original-allocation-declaration.js`, `seed-partitions-phase.js` (founder count and order), provisioning founder count per D6. **(rev. 2)** The upgrade fence is WP-V's, consumed here. | Formation runs ADD, ADD, PROMOTE. R1, R2 and the owned roots are green; the negative controls are red. **One commit-sized behaviour change.** |
| **WP-G** Deletion and test migration | G1-G3 ∥ off WP-F2 | WP-F2 | **G1** src deletions (§1.4, §2.10) plus `test/bootstrap/removed-colocated-founding-census.test.js`. **G2** tests asserting three seed replicas, `-r2`/`-r3` literals, the formation sims and fixtures (§1.4 (g)). **G3** docs, contracts, impact contracts, baselines (removal only). | Each lane is green against WP-F2 plus its own files. |
| **WP-H** Gates | - | WP-G | none (runs) | Lab full suite, pre-commit hook, `npm run -s test:duplication`, the complexity ratchet, the verification-freshness check. |
| **WP-I** Independent verification | - | WP-H | records | A fresh verifier with the seven templates, the remove-safety counterexamples, the negative controls and the composed tree digest. |
| **WP-J** Physical | - | WP-I, placement WP-J preconditions P1-P3 | evidence | Three consecutive journey runs on one commit, shared with the placement and service receipts (not copied). Diagnose a red at its first divergence. |

**Dependencies.**
- WP-F1 starts only after the placement Quest's WP-F has landed and WP-M has reported. Learner ADDs need a deficit model that plans PROMOTE, and WP-M decides D8 before any behaviour change.
- **(rev. 2)** WP-0, WP-M and WP-B may start now (re-vet of rev. 1). WP-V starts with WP-0 and lands first, because placement P6 and WP-D wait on it. WP-P and WP-F1 wait for the lead's confirmation of rev. 2 items 1-4, and WP-P also waits for where `REMOVES_LEADER` lives.
- WP-0, WP-M, WP-B, WP-R and WP-P run in parallel with placement WP-B to WP-E and with the latch Quest's S0-S3.
- The latch Quest precedes placement WP-F (its P4); this Quest consumes its formation fact and changes nothing in it.

**Why two behaviour stages.**
- Stage A changes how voters are added while founding is unchanged. It is proven on a tree whose formation shape is known (REPLACE via REPLACE_PROMOTE) and on user-table growth.
- Stage B changes only the founding shape, the provisioning founder count and the upgrade fence. A red after B isolates to founding.

---

## 6. Risks and open owner decisions (rev. 1)

### Open decisions (the owner's call only)

**D1: DECIDED (owner, 2026-11-18) = (a), the named REPLACE window,** with the `REMOVES_LEADER` port refusal (hand-off first) and the roll-forward-only REPLACE rule. A joint REPLACE that never commits an even set is a follow-up, after a removed-leader step-down exists. The options as presented in rev. 1 follow, for the record.

**D1 (rev. 1). The RF=1 REPLACE window, and the scope of "no even voter set".**
- Growth and formation never commit an even voter set.
- A count-neutral REPLACE promotes through the named `REPLACE_PROMOTE` and commits N+1 transiently: 4 for RF3, and for a dead source 3 of 4 live.
- For RF=1:
  - **(a) Recommended.** Accept the named `{s,t}` window, the owned root's existing behaviour. Every commit and election needs both `s` and `t`, exactly as in (b).
  - **(b)** The J3 shape: Explicit joint `{t}&&{s}`, transfer to `t`, `t` proposes the leave. Sound on the binding and never commits two voters, but adds Explicit transitions, an operation-owned leave proposer across leader changes, and transfer inside a joint.
  - **(c)** Refuse RF=1 REPLACE. An RF=1 partition then never moves, and its node's loss is the partition's loss anyway.
  - The Auto form (J1) wedges and is refused in every option.
- The global "never even" for RF3 REPLACE stays the joint-REPLACE follow-up (the 2026-11-11 U6).

**D2. One learner admission for REPLACE targets too.**
- **(a) Recommended,** with REPLACE's promotion named `REPLACE_PROMOTE` (rev. 1).
- (b) Growth-only learners: two meanings of "learner" would coexist on one target path.

**D3: DECIDED (owner, 2026-11-18) = (a), separate ADD and PROMOTE.** Revisit only if WP-M shows PROMOTE's fixed cost dominating. The rev. 1 options follow, for the record.

**D3 (rev. 1, reconsidered). Separate ADD and PROMOTE, or one GROW operation.**
- **(a) Recommended, kept.** Separate operations, for the reasons in the Revision 1 section:
  - placement's single-target rows and capacity accounting;
  - the learner-without-operation state exists under GROW after any partial failure;
  - binding §11's sequential bootstrap;
  - one voter per automatic operation in CockroachDB and PD.
- (b) GROW `{j1, j2}` with phases `LEARNER(j1)`, `LEARNER(j2)`, `PROMOTE` (binding §6, the reviewer's preference). It needs a two-target row or a target that changes between phases in placement's applier, and copy weight 2 at the source. It is admitted only when two eligible targets exist, so a two-host cluster keeps no learner copy.
- (c) Explicit transition with the operation as leave proposer. Not recommended.

**D4. Moot.** The formation fact is the declared-size latch's. `D = 2` is refused there.

**D5. Message groups.**
- **(a) Recommended.** Unchanged in this Quest: three co-located founders, membership change refused.
- The follow-up for the message-group owner first removes the lone-replica CDC branch (`message-group-service-cdc-replication-runtime-methods.js:212-218`), then founds `mg-1` **and each joiner's own message group** by `V(r, H)`.
- (b) One voter now. Not recommended.

**D6 (rev. 1). User-table and split/merge-child founding.**
- **(a) Recommended.** Provisioning founds `V(r, H)` voters, and the minimum-routable count stays `quorum(r)`.
  - Consequence (C): `minimumRoutableReplicaCount = max(quorum(r), min(…, target))` (`sql-query-engine-initial-partition-provisioning.js:207-228`). With `r = 3` on two hosts, the targets are `V(3,2) = 1` < `quorum(3) = 2`, so CREATE TABLE refuses `PROVISIONING_UNAVAILABLE` instead of founding two voters.
  - That is an availability cost: it arises only after a host loss in a formed cluster, because the latch refuses `D = 2`. The refusal carries the clearing event, a third host READY.
  - Split/merge children found through the same provisioning path (P), so a split on a two-host partition is refused the same way.
- (a') Lower the minimum to `V(r, H)`: found one voter plus a learner ADD. This amends F10's "create at quorum" (owner decision 2026-11-11).
- (b) Keep F10's two-voter founding and record the even founding as a finding.

**D7 (rev. 1). In-place upgrade.**
- **(a) Recommended.** Unsupported, with the named fence:
  - a support-envelope certified pair excluding pre-change sources;
  - join-admission refusal through `resolveJoinSupportEnvelopeConflict`;
  - the seed's typed `ORIGINAL_ALLOCATION_FOUNDING_LAYOUT_UNSUPPORTED` before any founder opens, replacing today's generic CONTRARY/IDENTITY.
- (b) Supported through generic host-spread REPLACEs. Not recommended.

**D8. The physical receipt if WP-M predicts more than 420 s.**
- (a) Widen to the next measured seed-cost lever.
- **(b) Recommended.** This Quest's physical receipt is:
  - formation commits no even and no co-located configuration;
  - the drain completes with zero REPLACE/REMOVE;
  - the time to (c) is recorded.

  The 3/3 journey stays the service quest's, with the named blocker. **(rev. 1)** WP-M reports before WP-F1, so the decision precedes any behaviour change.
- (c) Change the bound or `cpus`. Excluded.

### Risks (not decisions)

- **R1, a new core path in production.** Auto-leave and promote-only joint have no test in the repository; only scratch probes (S1-S7, J1-J3, C1) exist. WP-R makes them witnesses on the production host.
- **R2, joint-window refusals.**
  - BOOTSTRAP/RETIREMENT reads and stamps refuse while joint, retryable. The busy rule keeps new operations out of the window.
  - **(rev. 1)** TX1 release and split/merge are handled in WP-F1 (§1.4 (i), (j)).
  - Remaining: any other `MEMBERSHIP_CHANGED`-blind waiter found by WP-P's census of joint-refusal sites (§1.5).
- **R3, promotion exposure (rev. 1).** With a fixed `c0` a learner can be promoted while trailing the current commit. Commits that need its acknowledgement wait during its residual catch-up. This is latency, not safety; WP-M measures it. A learner that never advances is never promoted (R12 finding).
- **R4, snapshot-carried learners.** Restore must emit the role, `MEMBERSHIP_CHANGED` and `GATE_OPENED` events (experiment 5; W6). The partition-checkpoint quest's state at this HEAD is not established (P).
- **R5, check-quorum inside the joint window.** With both joiners down, `s` steps down and nothing elects until a joiner returns (S3, S5). It is bounded to one commit round on the healthy path.
- **R6, test migration size.** §1.4 (g) has the counts.
- **R6b, the voter floor and learners.** Resolved by the port-typed domain (rev. 1). The verifier probes the promoted-meanwhile interleaving.
- **R6c, founder election order and ticks (rev. 1).** Resolved by §2.2 and witnessed by R1(d), R1(e) and W9.
- **R7, the identity-open rules.** One founder per group shrinks the partial-first-boot deferral to one replica. The partition init loop that admits bootstrap peers when a restored sole voter leads (`raft-rs-full-cutover.md:1009-1012`) must be deleted or proven inert. With one founder and no bootstrap peers it has nothing to admit (P).
- **R8, election timing.** Joiners get `r2` and `r3` (highest observed index + 1, `rebalance-coordinator-replica-identity-methods.js:476-490`), and their windows shrink (`replica-election-timeouts.js:34-47`). Recorded, not tuned.
- **R10: closed (rev. 2).** The requester no longer re-sends on delivery answers; it waits for real events (§2.4).
  - A lost request to a reachable leader is still covered without any timer: the target's own `MEMBERSHIP_CHANGED` settles it, and the leader re-drives accepted requests.
  - A request lost before the leader accepted it, on a connection that never drops, is covered by the next leader-pointer change or connection event. Its liveness rests on those events. W11 witnesses the drop-once case.
- **R12 (rev. 2), the withdrawal double fault.** A stale ledger read at a later leader together with a stale executor could commit a promotion under a FAILED row (§2.4). The effect is safe (three voters), but the history is inaccurate. If the verifier finds it reachable, the fallback is a withdrawal command in the partition's own log.
- **R11 (rev. 1), formation critical path.** Three serial operations per priority partition, and three exclusive ledger windows. WP-M measures them; the latch waits for the priority PROMOTEs.
- **R9, out-of-scope findings recorded, not absorbed (R17):**
  - the lone message-group CDC branch;
  - `partition-quorum-authority.js:331-345` reads co-located voters as corruption (still true for message groups);
  - unsafe recovery from a learner after seed disk loss;
  - the two-founder user-table founding if D6 is (b);
  - the REPLACE N+1 window (D1);
  - the per-group tick driver;
  - **(rev. 2)** The removed-leader wedge (J1, RLEADER; `raft.rs:2674-2686`) is **no longer only routed**. The `REMOVES_LEADER` port refusal is in scope (WP-P, or its own bounded repair, per the investigation's result). A removed-leader step-down remains the raft owner's follow-up, and the joint-REPLACE follow-up depends on it;
  - the 2026-11-12 preserve branch's voter-liveness work, not on this HEAD.
