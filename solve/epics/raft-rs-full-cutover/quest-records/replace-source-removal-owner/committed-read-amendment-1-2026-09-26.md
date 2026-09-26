# Committed-membership read: amendment 1 (2026-09-26) - merged challenger findings, owner questions, and the O1 specification

Subject: `solve/epics/raft-rs-full-cutover/design-committed-membership-bootstrap-read-2026-09-25.md`, amended by the owner decisions O1/O2/O4 (`owner-decision-o1-o2-o4-committed-read-2026-09-26.md`) and by the two read-only challenger reports (`committed-read-challenger-a.md`, 13 findings; `committed-read-challenger-b.md`, 17 findings). Written by the lead under the verification protocol v2 phase 3 (union the challengers, then hand the specification to the implementer and the evidence author). Nothing here reopens seed parity, F1, the lease verdict, the readiness wake, D1 or D2.

Conventions as in challenger B: C_j = the answer (committed configuration applied at leader index j); B = the target's bootstrap ConfState (C_j plus self under O2); a_self = the index of the applied entry that names self; D = founders removed by j.

## 0. Frozen claim (O1 wording)

No projected row set grants consensus authority before committed membership establishes it. Concretely, for every replica that opens a raft-rs group on a partition:

1. its bootstrap ConfState is either the group's committed configuration as answered by the group's leader (COMMITTED), or a GENESIS founding set for a partition that no group exists for;
2. until its applied index reaches the gate index `max(j, a_self)` it does not campaign (tick election, explicit campaign, reconstruction resume, TimeoutNow), does not become leader, does not commit, and does not claim quorum membership; it may receive, persist and apply raft traffic;
3. a replica with neither a durable record nor a COMMITTED/GENESIS stamp is refused with a typed reason;
4. every consumer that reads the temporary RF+1 shape while a REPLACE is non-terminal reads it as a REPLACE-owned shape, never as surplus.

Externally relevant outputs: the stamp kind and payload; the target's applied ConfState per index; the target's durable hard state (term, vote) while below the gate; the roles of every member per term; the typed refusals; the planner's operations for the partition. Allowed nondeterminism: election timing, which member answers a redirect, batch boundaries of replication. Exclusions: snapshot install (no producer; recorded B-16), joint configurations (no producer; refused), message groups.

## 1. Disposition of every challenger finding

Legend: IN = in scope of the O1 implementation below; CELL = a coverage-model cell the evidence must range over (no production change beyond IN); RESIDUAL = recorded, out of this release with a named owner; ESC = would need the owner (none raised).

| Finding | Class | Disposition |
|---|---|---|
| A1 genesis from rows; GENESIS never validated against group existence | new mechanism | IN (target side): a GENESIS stamp is refused when a durable record exists for the group (D-restart is a restore, never a second genesis) and when discovery shows another replica of the partition on any node (rows are discovery: any evidence of an existing group fails closed, `GENESIS_REFUSED_GROUP_EXISTS`). RESIDUAL (provisioner side): the provisioner's genesis-vs-join decision from its own lagging cache; owner = query provisioning; recorded as follow-up CR-F1 with the distinct-genesis oracle from A1. |
| A2 row-driven admission C1 is the only AddNode producer; PENDING/CREATING rows admitted | new mechanism | CELL (allowed shape "committed voter admitted from a row before its process exists"; safe direction, stricter quorum) + IN liveness: the leader's admission reconcile also re-runs on the port's MEMBERSHIP_CHANGED event (B-10's dropped AddNode re-drive), no poll. C1 itself stays: desired topology driving admission by the leader IS the intended split. |
| A3 zombie voter re-created with no durable record (double vote) | new mechanism | IN (fail closed): O4's rule applies to path A: a COMMITTED stamp that already names self as a voter while no durable record exists for self is refused (`DURABLE_RECORD_MISSING`), never opened. RESIDUAL: automatic recovery of the zombie identity (RemoveNode by identity through the port from the coordinator's re-plan) = follow-up CR-F2, owner = REPLACE/ADD creation; until then it is an operator reseed under the hard cutover. |
| A4 stamp kind vs join/founder classification: two authorities | new mechanism | IN: the stamp kind governs; `deferElection`/scheduling never starts on a gated replica (the gate is in force from port construction, before `startScheduling`, B-I8); GENESIS founders are never opened as learners by a row count. The row-derived classification remains discovery (which node to sync from). |
| A5 planner surplus lanes read RF+1 rows | new mechanism | CELL in the consumer table; production = amendment-1 step 4 on the REPLACE branch (planner exclusion, S10 deletions) + the D1 witness `replace-temporary-extra-voter-planner.test.js`. Proven once through the planner. |
| A6 second seam for the same authority (REPLACE completion reread) | new mechanism | IN: ONE port operation `READ_COMMITTED_MEMBERSHIP` with ONE immutable answer shape; the bootstrap read routes it to the leader, the REPLACE completion calls it locally on the target; both callers import the same answer contract. The static census asserts every `confState` reader outside `src/raft` is one of the two named callers. |
| A7 `replicaIds` readers (jitter, startElection early return, write-kernel, transaction-base, replicaCount) | new shape | CELL: census rows; each reader must refuse only or be decided by the core, never grant. `replicaIds` order made deterministic (B-11). |
| A8 post-j identity resolution from rows; NOT_LEADER without a hint | new shape | CELL: rows as address book is the intended discovery; NOT_LEADER without an address = `MEMBERSHIP_UNREADABLE`, re-plan. |
| A9 learners in the answer | new shape | IN: accepted and passed through to `create_node` unchanged (the answer is the full ConfState). |
| A10 consumers of the stamp (rehydration carriers, in-memory fallback, deferred hold for B, epoch gate, promotion campaign trigger, rejoin planner "skip") | new shape | CELL: consumer table for the evidence author; the "skip" outcome (a committed voter with a record not restarted when rows exceed RF) = RESIDUAL CR-F3 (availability), owner = durable rejoin planner. |
| A11 oracle is the implementation's own value | new mechanism (evidence) | IN (evidence plan): oracles replaced per section 5; every W run plants a rows-vs-committed disagreement. |
| A12 census must count carriers; partition row branch must be deleted not bypassed | new shape | IN: the partition branch of `buildOperationBootstrapTopology` is deleted (R11); MG branch kept. |
| A13 enumerations and the missing owner module | new shape | IN: one constants module owns the stamp kinds, the read refusals and the gate answer (section 3.6). |
| B1 MsgTimeoutNow is a fourth campaign path | new shape | CELL: safe by the crate's `hup` refusal on committed-unapplied conf entries once the gate index includes a_self (a transfer needs the target in the leader's tracker, hence a is in the target's log by `matched == last_index`); W5 variant with the transfer below a. |
| B2 window safety depends on commit knowledge, not applied alone | new mechanism | IN: the gate holds for `applied < gate_index` regardless of `committed`; it never delegates to the `hup` check. The "gate removed" mutation must go red on an H6-shaped history (silent skew), not only H1. |
| B3 retried target can hit the replay error (H9) | new shape | CELL: typed RECOVERY_REQUIRED; at RF=1 the sole committed voter erroring is an operator reseed (hard cutover), recorded. |
| B4 skew shape replays silently (H6) | new shape | CELL: the F3 trigger is `D != {}`; evidence histories include founder removals after genesis with |D| in {1,2}. |
| B5 gate index j does not establish the role under O2 | new mechanism | IN: gate index = `max(j, a_self)`; a_self observed by the runtime owner when it applies a conf-change entry that names self (a retried target already in C_j has a_self <= j). |
| B6 ticks at creation decided by rows | new shape | IN via A4. |
| B7 tick suppression has no re-arm | new mechanism (liveness) | IN: the runtime owner emits a typed `GATE_OPENED` observation when applied crosses the gate index; the port re-arms scheduling on it; I3: re-arm < 1.0 s (measured: within one drain). |
| B8 sole-voter resume at a transient index | new shape | IN: `resumeAfterReconstruction` evaluates the gate from the durable record before `isSoleVoter`. |
| B9 (confState, j) from one observation | new shape | IN: j is the applied index of the recorded observation whose ConfState is answered, never core `status.applied`. |
| B10 dropped AddNode is silent | new shape | IN via A2 (event-driven admission re-run). CELL: two joins with the second AddNode dropped behind the first. |
| B11 election tiers depend on REPLICA_IDS order | new shape | IN: the stamp's identity list is ordered deterministically (ascending peer id). |
| B12 R-1a reads a below-gate target as authoritative | new mechanism (cross-branch) | IN at integration: the witness observation carries `appliedIndex` and `gateOpen`; R-1a answers WAIT while `gateOpen` is false; AN11 extended. The REPLACE implementer was told to carry `appliedIndex` now. |
| B13 RF=1 premature transfer costs one 5 s retry | new shape | CELL: RF=1 witness expects one refusal and completion on retry; no dropped removal counted as issued. |
| B14 no bootstrap-index column | new mechanism (schema) | IN: `_raft_rs_applied_state` gains `bootstrap_index` and `admission_index` (a_self, nullable until observed), written in the index-0 transaction and on a_self observation; read on restore, reconstruction and resume. Restart before the index-0 transaction = no record = O4 refusal, and the coordinator re-creates from the persisted stamp within the creating budget. |
| B15 busy leader fails the read by timing | new shape | CELL: typed `MEMBERSHIP_UNREADABLE` (timeout), nothing persisted, re-plan on the named wake; I6 recorded. |
| B16 snapshot install crosses the gate | new shape (excluded) | RESIDUAL CR-F4: gate compares against `max(applied, snapshot index)` the day an rs-raft snapshot producer exists. |
| B17 restart classes | summary | CELL: all modelled once B8 and B14 are in. |

## 2. The owner's ten questions, consolidated

1. Rows -> Raft authority today (twelve sites, challenger A Q1): the join bootstrap voters (site 1) and the creation stamp (site 2) are the D1 skew and are closed by the read; durable rejoin from ACTIVE rows (site 6) is closed by O4; row-driven admission on the leader (site 3) is the intended split and stays; join/founder classification deciding tick start (site 8) and learner promotion starting elections (site 9) are closed by the gate; provisioning genesis from rows (site 7) and a seed restart with a lost DB (site 12) are closed on the target side by GENESIS validation and O4, residual on the provisioner side (CR-F1). Leadership and write authority themselves are the core's role, never rows.
2. Earliest points: a fresh replica votes on the first inbound request and adopts a higher term on any higher-term message with no membership check in raft-rs; campaign has six producers (tick driver at construction unless row-derived deferral, single-replica init campaign, learner promotion, TimeoutNow, reconstruction resume, rejoin restore); leadership follows a won poll; proposals are accepted as leader or forwarded as follower.
3. Before committed membership is known: today all of them. Under O1: campaign, lead, commit and quorum claim are blocked by the gate until `max(j, a_self)`; voting and term adoption by the target remain possible (raft-rs grants votes without a membership check). A gated target's vote counts only in the requester's configuration; it cannot complete a quorum the committed configuration would refuse because the requester's tally runs over the requester's own voters (a real member's config) - the target is not in it until a. This is the allowed residual; M5 covers disruption, not vote counting.
4. Yes: a nonmember's higher-term MsgRequestVote deposes the leader and every follower (D1 case 2), because `PRE_VOTE` and `CHECK_QUORUM` are off. Response-class messages from unknown ids are refused by the crate.
5. raft-rs does not gate request-class traffic. The gate closes the producer for every replica under our runtime (no replica campaigns before admission). No ingress filter this release: the single ingress (`enqueueStep -> admitRaftRsMessage`) stays a routing/schema check with no core or handle. If the M5 evidence fails after the gate, the fallback is a vote-request-only filter at that ingress fed the receiver's last observed ConfState as data, never for append/heartbeat/snapshot/transfer (that would deadlock catch-up). `check_quorum`/`pre_vote` stay with the election-safety re-measurement.
6. ADD/REPLACE/formation: stamp = C_j from the leader's answer, self included (O2), gate until `max(j, a_self)`; REPLACE keeps the source in C_j until the committed RemoveNode, the planner reads RF+1 as REPLACE-owned. Restart with a record: restore + the gate from the record. Rejoin without a record: O4 typed refusal, then an ordinary ADD with a read. RF=1: stamp {s}; t is promotable in its own view and only the gate holds it; the transfer to t is refused by the crate until a is applied (one 5 s retry); completion then proceeds under the REPLACE owner.
7. Joint: the read refuses a joint answer (`MEMBERSHIP_IN_JOINT_TRANSITION`), the target refuses a joint stamp; `votersOutgoing` count as voters for the gate's quorum claim and for R-1a's absence test; an AddNode during joint is dropped silently by the crate and re-driven by the admission event (A2). No producer exists in src.
8. The read fails typed (NOT_HOSTED, NOT_LEADER with or without a redirect hint, JOINT, IDENTITY_UNRESOLVED, HELD, busy-leader timeout) with nothing persisted; stale-but-committed answers are safe (replay is exact from j onward; longer window only).
9. No cycle: the read is a node-level replica-handler RPC over the message router addressed by node id; raft transport addresses are built from (node, service type, replica id); receiving grants nothing. Authority comes only from the leader's configuration naming the target plus the target's gate.
10. Minimal channel: the existing nodes table + router node addressing, the `leader_node_id` row as a hint, services rows and dispatched `peerAddresses` as the address book, and one NOT_LEADER redirect. Nothing new.

## 3. O1 specification (production)

Semantic owner: the replica membership bootstrap owner = raft-rs runtime owner (`src/raft/raft-rs-runtime-owner.js` and its constants/tuning modules) + the operation port contract + the replica handler's create/restore path + the creation stamp owner in the rebalancer. Separate from the REPLACE workflow owner (the sibling branch); the two meet at integration (B12).

### 3.1 The port operation

- `RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP` (name in `raft-operation-port-constants.js`), answered from the runtime owner's recorded observation: `{kind: COMMITTED, voters, votersOutgoing, learners, appliedIndex (= j label from that same observation), commitIndex, term, leaderId, gateOpen, identities}` frozen; or a typed refusal `{kind: REFUSED, reason}` with reason from one enumeration: NOT_LEADER (with `leaderAddress` when resolvable), JOINT, IDENTITY_UNRESOLVED, HELD, NOT_HOSTED.
- No RawNode, store, lifecycle or mutable structure crosses the seam. `identities` maps every id in the answer to its reserved identity; an unreserved id is IDENTITY_UNRESOLVED (fail closed).
- Two callers only: the creation-time bootstrap read (routed to the leader through the replica-handler message `READ_COMMITTED_MEMBERSHIP`, one NOT_LEADER redirect) and the REPLACE completion witness (local). Both import the same answer contract.

### 3.2 The stamp and the target

- Stamp kinds COMMITTED | GENESIS, produced by the creation owner (ADD/REPLACE/formation joins = COMMITTED from the read; founders = GENESIS) in one module with the refusal reasons. The partition row branch of `buildOperationBootstrapTopology` is deleted. `replicaIds` in the stamp = the answer's voter ids (+ learners) + self, ascending id order, and is an address-hint list only.
- The target validates on arrival: COMMITTED requires j > 0 and non-joint and every id resolvable; GENESIS requires no durable record and no discovered replica of the partition anywhere (rows as discovery, fail closed). A COMMITTED stamp naming self as an existing voter with no durable record for self = `DURABLE_RECORD_MISSING` (A3). A stamp that fails validation is `STAMP_INVALID` with the reason; the target never falls back to rows.
- `create_node` receives the full ConfState from the stamp (voters, votersOutgoing = none, learners) plus self under O2.

### 3.3 The participation gate

- State per group in the runtime owner: `bootstrapIndex` (j; 0 for GENESIS), `admissionIndex` (a_self; known at creation when self is in C_j, else observed when an applied conf-change entry adds self), `gateOpen = applied >= max(bootstrapIndex, admissionIndex)` with `admissionIndex` unknown counting as infinity.
- While closed: the port never starts scheduling (ticks), `campaignGroup` refuses with a typed reason `GATE_CLOSED`, `resumeAfterReconstruction` does not campaign, the single-replica init campaign does not run, learner promotion's `startElection` is refused. Receiving, persisting and applying continue. TimeoutNow is left to the crate (B1). Writes: the write path refuses with the same typed reason while closed (the core would refuse anyway as follower; the typed answer is the O1 requirement "typed not admitted / membership unresolved").
- On crossing: the owner emits `GATE_OPENED` in the same drain; the port re-arms scheduling; the status observation exposes `gateOpen`, `bootstrapIndex`, `admissionIndex`.
- Durable: `_raft_rs_applied_state` gains `bootstrap_index` and `admission_index`; written with the index-0 applied state and on observation; restore/reconstruction/resume read them. A record with a null admission index restores closed.

### 3.4 O4

- The durable rejoin planner no longer bootstraps from ACTIVE rows: no record = refusal at `RUNTIME_PHASE.DURABLE_RECORD_READ` with a new `RUNTIME_REASON.DURABLE_RECORD_MISSING`, answered `CORE_REFUSED` non-retryable, surfaced as `CONSENSUS_INIT_REFUSED` (same pattern as the legacy-DB refusal); distinct from UNREADABLE (HOST_FAILURE, retryable), from admission states (`RAFT_MEMBERSHIP_ADMISSION_OUTCOME`, `NOT_ACTIVE_VOTER`, now `GATE_CLOSED`), from IDENTITY_UNRESOLVED (structural) and from RETIRED (permanent).
- The refused replica is then a normal ADD target (a new read, a new identity if the old one is a zombie: CR-F2 until then reseed).

### 3.5 Admission liveness

- The leader's admission reconcile also runs on MEMBERSHIP_CHANGED (the port event from the REPLACE branch) so a dropped AddNode is re-driven without a poll. Bounded: one proposal in flight per identity.

### 3.6 Enumerations (import, never hand-list)

Stamp kinds, refusal reasons and gate reasons in one new constants module (the implementer names it; both the creation owner and the handler import it). Port operation names and outcomes in `raft-operation-port-constants.js`; runtime reasons/phases in `raft-rs-runtime-owner-constants.js`; conf-change entry types in `raft-rs-ready-loop-constants.js`; message types in `src/constants/messages.js` / `replica-operation-constants.js`; durable columns in `raft-rs-durable-store-constants.js`.

## 4. Amended coverage model

Decisions: D1 which member answers; D2 the answer content and label; D3 the creator stamps (kind, validity); D4 the target validates (COMMITTED/GENESIS x record present/absent x discovery shows a group); D5 the gate (open/closed) per campaign producer (tick, explicit, resume, init single-replica, promotion, TimeoutNow) and per write; D6 restart/reconstruction/resume restore the gate; D7 rejoin with/without record; D8 admission re-drive; D9 R-1a with a below-gate witness (integration).

Inputs (authoritative source): leader's recorded observation (confState, applied, commit, term, role); the durable record (applied, confState, bootstrap_index, admission_index, hard state); rows (discovery only: leader_node_id hint, address book, group-existence evidence); the stamp; the target's log completeness (last index vs j); identities registry.

Events x temporal (pending before / just before / mid-decision / timeout crossed): conf change committed (add/remove a voter, remove a founder = D != {}); leader change (with and without a hint); read timeout (busy leader); AddNode(self) applied; AddNode(self) dropped; TimeoutNow below a; snapshot (excluded); services row write on the leader (admission trigger); row omitted / phantom row (planted disagreement); process restart, coordinator re-init, runtime reconstruction at each of: before index-0 txn, applied < j, j <= applied < a_self, open.

Timing arithmetic (from challenger B, I1-I9): catch-up <= SYNCING 300 s with at most one 120 s admission stall; formation 2x5 s read + re-plan + create + catch-up <= 90 s; re-arm < 1.0 s; premature transfer = one 5 s retry; a second leader change inside 10 s = MEMBERSHIP_UNREADABLE; 120 s admission wait > 2x5 s read bound; commit can lead apply by up to 120 s (B12); the gate in force before the first possible tick (1.0 s + 2.5 s x index); admission re-drive bounded by the event, no longer by SYNCING.

## 5. Evidence plan (M1-M5, protocol phases 4-7)

Oracles (never the implementation's own value): (O-a) log fold: decode the durable `_raft_rs_log` conf-change entries on an independent connection with the binding's decoder and fold them over the TEST'S genesis founders; the target's applied ConfState at every index equals the fold; (O-b) cross-member agreement of durable applied ConfStates at equal index across separate processes/DBs; (O-c) safety from durable hard states and logs: at most one leader per term, one (index, term) payload; (O-d) the gate: the target's durable hard-state term and vote unchanged while applied < gate index. Every run plants a rows-vs-committed disagreement (a row omitted, a phantom row) so a "stamp from rows" mutation is distinguishable.

- M1 rows claim membership, committed excludes: no campaign/vote counted/leader/commit (O-c, O-d) - histories H6 (silent skew, |D| in {1,2}, odd n) and H1.
- M2 committed voter A omitted from rows: the target converges on A before participating (O-a, O-b); differential: stamp-from-read vs stamp-from-rows over the full output.
- M3 admission opens the gate: caught-up target with ticks suppressed between j and a_self, then GATE_OPENED, re-arm within one drain, heartbeat within 60 ms of a transferred leadership; no permanent lockout with a dropped AddNode (event re-drive).
- M4 restart/rejoin equivalence: continue vs destroy-recreate-recover over the four restart points x three restart classes; rejoin without record = typed refusal; reconstruction at the transient sole-voter index (B8) never leads.
- M5 the D1 case-2 diagnostic re-run: members' term constant, zero step-downs, leader unchanged, with the target's row visible to all; mutation "gate at j only" -> the target leads before a; mutation "gate removed" -> term rises at the election cadence.
- Anchors: GENESIS x existing group refused; COMMITTED naming self without a record refused; joint answer refused; NOT_LEADER without hint = MEMBERSHIP_UNREADABLE; RF=1 transfer below a = one refusal then completion; B12: R-1a WAIT while the witness is closed.
- Mutations by mechanism: stamp from rows; gate at j only; gate delegating to hup; j from core applied; bootstrap index not persisted; resume unsuppressed; ticks at creation from rows; admission not re-driven; R-1a ignores the gate.
- Static census: every `confState` reader outside `src/raft` is one of the two named callers; exactly two stamp origins; carriers pass the stamp unchanged; no row read reachable from the partition branch; enumerations imported.

## 6. Residuals recorded (not this release)

- CR-F1 provisioner genesis-vs-join from a lagging cache (A1, provisioner side); owner: query provisioning.
- CR-F2 automatic zombie-identity removal on re-plan (A3); owner: creation.
- CR-F3 durable rejoin planner "skip" of a committed voter when rows exceed RF (A10); owner: rejoin planner.
- CR-F4 snapshot index vs gate (B16); no producer today.
- R2 genesis-in-log; check_quorum / pre_vote re-measurement.

## 7. Verdict

The design's two structural claims stand (any committed C_j is a safe bootstrap; the leader answers). The model was incomplete on both axes; every finding is dispositioned above as an in-scope change, a cell, or a named residual. No stop condition is met: the read needs no participation first (node-level RPC), the gate lives inside the runtime owner behind the existing operation-only seam, RF=1 has a path (gate + crate-guarded transfer + one retry), the hard-cutover/reseed model covers the fail-closed residuals, and no incompatible product contracts arise. The implementer and the evidence author work from sections 3-5.

## 8. Round 2 supersessions (R09, 2026-09-27; appended, nothing above rewritten)

Recorded by the evidence author after verification O1 round 1
(`verification-o1-round-1.md`, items 3-6) and the integration-2 production
head `d46777ecf`. Each entry names the sealed text it supersedes and the
record or witness that measured the replacement.

1. **Section 0, claim 2 - TimeoutNow.** Superseded wording: "it does not
   campaign (tick election, explicit campaign, reconstruction resume,
   TimeoutNow)". The gate closes the tick, explicit-campaign, reconstruction-
   resume, single-replica-init and learner-promotion producers; it does NOT
   close the TimeoutNow producer, which is left to the crate (row B1, section
   3.3). What holds TimeoutNow below the gate is the crate's `hup` refusal on
   a committed-unapplied configuration entry plus the replication invariant
   U1 (every MsgAppend a leader sends a peer it tracks carries its committed
   index, so the peer learns a_self is committed in the message that delivers
   it and applies it in the same drain; a TimeoutNow reaches it only once its
   progress is caught up, by which time its gate is open). Measured on
   production behaviour by `evidence-o1-anchors.test.js` "anchor (B1
   reachability)" (evidence record section 5, U1; verifier V3 concurs). The
   synthetic cell "holds a_self with commit < a_self, receives TimeoutNow" is
   unreachable through raft-rs replication (its only producer would be a
   snapshot, excluded: CR-F4) and stays recorded, not open.
2. **Section 1, row B5 - "a retried target already in C_j has a_self <= j".**
   Unreachable under row A3: a COMMITTED stamp that already names the target
   a voter is refused `DURABLE_RECORD_MISSING` when it holds no record
   (`requiresDurableRecord`), and with a record it restores (no bootstrap, no
   a_self observation). `admitsReplica`'s `index > bootstrapIndex` guard is
   defence in depth. Witnesses: `evidence-o1-anchors.test.js` "a COMMITTED
   stamp already naming the target a voter", T3 (zombie). Verifier V5.
3. **Section 2, item 1 - "a seed restart with a lost DB (site 12) [is]
   closed on the target side by GENESIS validation and O4".** False at
   `ab7669fd0` (verifier V1: an absent stamp was read as a GENESIS of the
   request's peer ids; the seed built its system partitions without a stamp;
   a seed rebuilt on a lost data directory founded a second group under each
   partition id). V1a (`a49b36f92`, in `d46777ecf`) closes the stamp-less
   default: `bootstrapOfRequest` validates every stamp and refuses an absent
   one typed (`STAMP_INVALID` / `MISSING`, phase `bootstrap-stamp-validation`);
   the seed phase passes an explicit GENESIS stamp; the constructor census
   (`committed-membership-census.test.js` "V1a census") enumerates every
   `new PartitionService(` / `createPartitionService(` site in `src` and
   fails on a third origin (measured in scratch, round-2 record). What is NOT
   closed on the target side: a seed rebuilt on an EMPTY data directory with
   its explicit GENESIS stamp still founds (no record to restore, no cache to
   discover the live group from). That cell is owner decision CR-F5
   (pending): challenger A's "live group reachable" refusal at the port, or
   an owner-accepted residual. Until decided, the seed lost-data-directory
   restart is an operator procedure, not a target-side guarantee.
4. **Section 1, rows A2 and B10 - "the leader's admission reconcile also
   re-runs on the port's MEMBERSHIP_CHANGED event (B-10's dropped AddNode
   re-drive)".** Superseded by V2 (`a6e41d099`, in `d46777ecf`): the crate
   drops a conf-change proposal behind ANY pending configuration index
   (every proposed conf entry, effective or not, and a new leader's last
   index), two kinds of which apply without changing the configuration key
   MEMBERSHIP_CHANGED is keyed on (verifier V2). Now the runtime answers a
   proposal the core would drop as a typed, retryable deferral
   (`CONF_CHANGE_PENDING`, `raft-rs-conf-change-admission.js`) and never lets
   the crate replace it with an empty entry; a drain that applies a
   conf-change entry, or reaches the pending index without one, announces
   `CONF_CHANGE_APPLIED`; the admission re-drive runs on that event and on
   leadership gain, over this replica's in-flight and deferred admissions and
   its deferred row-driven retirements, each re-evaluated from its row (a
   removed voter whose row retired is not re-admitted). In a joint
   configuration the one change the core takes is the leave (a change with no
   steps); any other is deferred (integration 2, `d46777ecf`). Section 3.5
   ("re-drive on MEMBERSHIP_CHANGED", "one proposal in flight per identity")
   is superseded the same way; MEMBERSHIP_CHANGED keeps its configuration-key
   meaning for its other listeners. Witnesses: `conf-change-pending-deferral`
   (5 pending kinds, port), `admission-redrive-chain` (3 kinds, production
   admission path, "no re-admission of the just-removed source" explicit),
   `partition-admission-redrive-wakes` (4 wakes incl. leadership gain),
   `evidence-o1-anchors.test.js` joint anchor (the joint-leave cell),
   `evidence-o1-real-chain.test.js` M3 (premise inverted: no empty entry).
