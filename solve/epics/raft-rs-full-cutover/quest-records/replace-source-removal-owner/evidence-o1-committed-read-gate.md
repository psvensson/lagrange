# Evidence: committed-membership read and participation gate (O1 / O4), phases 4-7

Evidence author (independent of the implementer), verification protocol v2
phases 4-7, against the FROZEN production SHA `ab7669fd0` (worktree
`evidence-o1`, branch `evidence/evidence-o1-2026-09-26`). No `src` file was
changed. The specification is committed-read amendment 1 sections 0, 4 and 5;
the oracles are challenger A's F-A11 set; the histories and timing are
challenger B's sections B and C.

Test files (all under `test/raft/raft-rs-backend/`, prefix `evidence-o1-`):

| File | Property | Cases |
| --- | --- | --- |
| `evidence-o1-model.js` | the model and its plumbing (histories, filters, oracle stamp, folds, storms, restarts); no expectation lives here | - |
| `evidence-o1-gate-histories.test.js` | M1 | 6 histories x {0, every conf-change index below j, j, a_self - 1} |
| `evidence-o1-restart-equivalence.test.js` | M4 | 4 points x 4 classes (14 cells) + pre-gate record + H1 transient reconstruction |
| `evidence-o1-admission-liveness.test.js` | M3 (gate side) | commit-lag window, GATE_OPENED, re-arm, heartbeat |
| `evidence-o1-real-chain.test.js` | M2, M5 (a/b/c), M3 (re-drive), routing and GENESIS anchors | production chain end to end (7) |
| `evidence-o1-anchors.test.js` | anchors, B13, B1 reachability, B12 | 7 |
| `evidence-o1-static.test.js` | phase 5 enumerations, phase 6 timing | 8 |

`committed-membership-harness.js` (the implementer's real-chain plumbing) gained
one transport hook, `rewriteTo(address, fn)`, so a run can hold a
PartitionService target under a commit-knowledge lag; nothing else in the
implementer's files was touched. `committed-membership-oracles.js` (the
implementer's O-a..O-d readers) is reused as is: every value it yields comes
from an independent read-only connection, the binding's own decoder, and the
TEST'S genesis founders.

## 0. Frozen claim (amendment section 0)

No projected row set grants consensus authority before committed membership
establishes it. For every replica that opens a raft-rs group on a partition:

1. its bootstrap ConfState is the group's committed configuration as answered
   by the leader (COMMITTED) or a GENESIS founding set;
2. until its applied index reaches `max(j, a_self)` it does not campaign (tick
   election, explicit campaign, reconstruction resume, TimeoutNow), does not
   become leader, does not commit, and does not claim quorum membership; it
   may receive, persist and apply traffic;
3. a replica with neither a durable record nor a COMMITTED/GENESIS stamp is
   refused with a typed reason;
4. the RF+1 shape of a non-terminal REPLACE is read as REPLACE-owned (B12 at
   the R-1a witness).

Externally relevant outputs measured here: the stamp kind and payload; the
target's durable applied ConfState per index; its durable hard state (term,
vote) below the gate; the members' durable terms and votes; the typed
refusals; the R-1a verdict. Not measured here: the planner's operations for
the partition (the D1 planner witness of the sibling branch owns them).

## 1. The model ranged over

Histories (challenger B section C; each a genesis founder set and a script of
single voter changes committed through the canonical port; D = founders
removed by j):

| Key | Genesis | Script | C_j | D | Shape |
| --- | --- | --- | --- | --- | --- |
| H1 | {a} | +b, -b, +b, -a | {b} | {a} | RF=1; with self the replay passes through {t} (transient sole voter) |
| H3 | {a,b,c} | -a, +a | {a,b,c} | {} | exact replay |
| H4 | {a,b,c} | +d, -a, +a, -d | {a,b,c} | {} | a REPLACE cycle |
| H5 | {a} | +b, -a, +a, -b | {a} | {} | with self the view passes through {b,t} (a absent, b unreserved) |
| H6a | {a,b,c} | +d, -b | {a,c,d} | {b} | silent skew, |D| = 1, odd n |
| H6b | {a,b,c} | +d, -b, +e, -a | {c,d,e} | {a,b} | silent skew, |D| = 2, odd n |

Every intermediate joiner of a history is opened from the oracle stamp of its
own moment, and every replica the script removed is isolated afterwards. The
target's cuts are the applied indices {0, every conf-change index below j, j,
a_self - 1} (the group admits the target while it has replayed nothing, so
every cut below a_self is reachable; the leader replicates to it only from
then on).

Restart points x classes (M4):

| Point | Meaning |
| --- | --- |
| before-index-0-transaction | no record: a rejoin is refused typed, a re-dispatched stamp is the create itself |
| applied-below-j | the target holds a prefix below j (the silent-skew view) |
| j-at-or-below-applied-below-a-self | j <= applied = a_self - 1 |
| open | applied >= a_self, gate open |

| Class | Mechanism |
| --- | --- |
| continue | no restart (the reference cell) |
| process-restart | node and database closed; rebuilt from the SAME file with the durable-record bootstrap (`durableRecordBootstrap()`, O4) |
| coordinator-re-init | rebuilt from the same file with the COMMITTED stamp dispatched again (RESTART_CREATE) |
| runtime-reconstruction | the shared core trapped through the target's port; every group rebuilt from its record on its next operation |

Rows: every cluster run plants, in every replica's services table, the target
and a phantom as ACTIVE and omits one committed voter (`plantDisagreeingRows`);
every real-chain run hands the creation owner rows that omit a committed
voter and keep a removed founder and a phantom.

Enumerations imported and classified member by member (a new member no case
names fails `evidence-o1-static.test.js`): `COMMITTED_MEMBERSHIP_STAMP_KIND`,
`BOOTSTRAP_MEMBERSHIP_SOURCE`, `COMMITTED_MEMBERSHIP_ANSWER_KIND`,
`COMMITTED_MEMBERSHIP_READ_PURPOSE`, `COMMITTED_MEMBERSHIP_ANSWER_FIELD`,
`COMMITTED_MEMBERSHIP_REFUSAL` (by the place that decides it),
`COMMITTED_MEMBERSHIP_STAMP_DEFECT`, `PARTICIPATION_GATE`, `RUNTIME_REASON`
(all 42 keys), `RAFT_RS_RECORD_COMPATIBILITY`, `RAFT_OPERATION_OUTCOME`,
`RAFT_MEMBERSHIP_ADMISSION_OUTCOME`, `REPLACE_COMPLETION_VERDICT`,
`RAFT_RS_CONF_CHANGE_TYPE` and `RAFT_RS_ENTRY_TYPE` against the binding's own
match arms (every arm a production constant, arm counts equal).

## 2. Properties: test, oracle, anchors

### M1 - rows claim membership, committed excludes the replica

`evidence-o1-gate-histories.test.js`, one test per history, every cut below
a_self. At each cut: the target's durable applied configuration equals the
fold of the leader's durable log over C_j + self (the crate's replay law,
folded by the test); at or past j the view minus self is the committed
configuration (O-a); below j it omits exactly the removed founders present at
that index (the D1 skew witnessed on H6a/H6b, and the transient sole-voter
view on H1). Then an election storm (200 target ticks, every envelope
delivered): O-d - the target's durable term and vote unchanged, its term never
above the group's, never a self-vote; the members' durable terms and votes
unchanged and never naming the target (sampled every 10 ticks); the leader
unchanged; explicit campaign, tick and write refused `GATE_CLOSED`; status
`gateOpen=false`, `bootstrapIndex=j`, `admissionIndex=null`; no GATE_OPENED.
After admission: GATE_OPENED exactly once with (j, a_self) where a_self is the
decoded AddNode(self) entry of the leader's durable log; a_self durable; O-b
cross-member agreement at equal index; O-c one payload per index across every
durable log and at most one majority-voted id per sampled term.

### M2 - a committed voter omitted from the rows

`evidence-o1-real-chain.test.js` "M2 (differential)". Founders a, b, c; d
joined through the chain; -b committed; rows handed to the creation owner =
{a, b, c, phantom} (d omitted, b and the phantom present). The persisted
stamp equals the fold of the leader's durable log over the test's genesis at
its label, the label is the leader's durable applied index, the identities are
the leader's durable reservations; the row-derived stamp (rows -> raft ids by
the production derivation) differs exactly on d (in the stamp, not the rows)
and on b and the phantom (in the rows, not the stamp). The target opened
through the handler over a cache that claims the rows holds fold + self at
index 0 with its gate closed (d held before participation); every sampled view
during catch-up holds d and never the phantom; converged, a_self is the
decoded AddNode of the target, the target's log is a payload-for-payload
prefix of the leader's (O-c), its configuration is the fold at its index (O-a),
and every member at the same index agrees (O-b).

### M3 - admission opens the gate

`evidence-o1-admission-liveness.test.js`: the target holds its own AddNode with
commit knowledge capped one below it (applied = a_self - 1 >= j). Ticks
suppressed (no timer armed, every tick refused typed), never leads, O-d
unchanged, members' terms constant, no member vote for it. Uncapped: GATE_OPENED
once with the oracle (j, a_self); the refused scheduling re-armed before the
event reached its listeners (the same drain, I3 < 1 s); a_self durable.
Leadership transferred to it: every member heard from it within
`HEARTBEAT_TICK` (3) of its ticks (60 ms at the production 20 ms tick, static).
`evidence-o1-real-chain.test.js` "M3 (dropped AddNode)": two rows in one turn,
the second AddNode dropped behind the first (the empty entry the core leaves is
in the durable log); both targets admitted and open, one AddNode entry each in
the leader's durable log, each target's durable admission index equal to its
decoded entry, no further row written.

### M4 - restart / rejoin equivalence

`evidence-o1-restart-equivalence.test.js`, 14 cells + 2. Every cell converges
on the oracle state: durable `bootstrap_index = j`, `admission_index = a_self`
(decoded), configuration = the fold at its index, O-b agreement; the durable
log held before the restart is intact (no second bootstrap, coordinator
re-init included); below a_self the restored gate is closed and the storm
shows O-d (no self-vote, term never above the group's, vote unchanged, never
leads), GATE_OPENED once after the restart at the oracle (j, a_self); at
"open" the record restores open at once. before-index-0 x process-restart =
`DURABLE_RECORD_MISSING` (CORE_REFUSED, phase durable-record-read,
non-retryable, nothing written); the pre-gate record (the production DDL minus
the gate columns) = `DURABLE_RECORD_INCOMPATIBLE` (non-retryable, distinct from
missing); H1 + self reconstructed at the transient sole-voter index never
leads, keeps its bootstrap index, opens later.

### M5 - the D1 case-2 diagnostic

`evidence-o1-real-chain.test.js`, two variants, 3 s at 100 ms samples on real
PartitionService replicas with the target's timers asked for
(`startElection()`), the target identity chosen so its jitter index is 0:
(a) the row never reaches the members (never admitted, applied 0); (b) the row
visible to every member, the leader's AddNode committed, the target holding it
under a commit lag (applied = a_self - 1, traffic flowing); (c) as (b), then
every delivery to the target dropped for the window (a stalled catch-up: the
target, tracked by the leader, hears no heartbeat). All three: every member's
durable term constant, the leader unchanged, no member vote for the target,
the target never candidate or leader, its term never above the group's, never
a self-vote. (b) and (c) then join without an election once traffic resumes.
(c) is the cell where "gate at j only" deposes the leader (the target is
between j and a_self with its timers running and no heartbeat to reset them);
(b) alone cannot show it because the leader's heartbeats keep resetting the
tracked target's election timer.

### Anchors

| Anchor | File / test | Result |
| --- | --- | --- |
| GENESIS x durable record restores one group | anchors "GENESIS stamp reaching a founder" | restored open, bootstrap 0 / admission 0, log intact, O-a one genesis at every index |
| GENESIS x discovered foreign replica refused | real-chain "GENESIS is refused where discovery shows" | `GENESIS_REFUSED_GROUP_EXISTS`; founders with a leader row are not made joiners |
| COMMITTED naming self, no record | anchors "already naming the target a voter" | `DURABLE_RECORD_MISSING` at the port, no record written |
| joint answer refused | anchors "a joint configuration" | bootstrap read JOINT; witness read carries outgoing voters; the handler refuses it as a stamp (JOINT defect); after leaving joint the read is the fold at its label |
| NOT_LEADER without hint = UNREADABLE | real-chain "anchors (routing)" | leaderless group: `MEMBERSHIP_UNREADABLE`, nothing persisted; no hint: unreadable; follower hint: exactly one redirect, stamp = fold |
| RF=1 transfer below a (B13) | anchors "(B13, RF = 1)" | one typed refusal `TARGET_NOT_VOTER`, source keeps leading, no term on the target; retry after admission `TRANSFER_REQUESTED` and completes |
| B12 R-1a WAIT | anchors "(B12, H1 + self)" and "(B12, H5 + self)" | H1: ABSENT below the gate -> `WITNESS_BELOW_GATE`, then `STILL_VOTER`; H5: the removed founder is unreserved on the target -> `UNRESOLVED` -> `UNAVAILABLE` (fail closed, not the gate branch) |
| B1 reachability | anchors "(B1 reachability)" | every append the leader sends the target after AddNode(t) carries commit >= a_self; the target holds a_self only with commit and apply at or past it (same drain); every TimeoutNow is sent to it with its gate already open; the transfer is honoured at the gate, never below it (replaces the synthetic probe of 187d27240, section 5) |

## 3. Mutation matrix (mechanism x tests red)

Scratch copies of `ab7669fd0` (never committed), one mechanism each, run
against the evidence files. "-" = not run against that file (out of the
mutation's reach by construction).

| Mutation (mechanism) | M1 histories (6) | M4 restart (16) | M3 gate (1) | anchors (7) | real chain (6) |
| --- | --- | --- | --- | --- | --- |
| gate removed (`participationGateOpen` -> true) | 6 red | - | - | - | 5 red (M2, M5 a/b/c, M3 re-drive) |
| gate at j only (`participationGateIndex` -> j) | 6 red | 8 red (both below-a points x 4 classes) | - | - | 2 red (M5 b: gate observation; M5 c: members' terms rise - the D1 deposition) |
| gate delegating to the crate's hup check (campaign / tick / propose / startScheduling no longer refuse; gate state honest) | 6 red | 10 red | 1 red | 0 (the synthetic B1 probe of 187d27240 was the only red) | 2 red (M5 a: the target campaigns; M5 c) |
| j from core `status.applied` (observation label from the raw status) | 0 | 0 | 0 | 0 | not run |
| bootstrap index not persisted (index-0 write stores null) | 6 red | 15 red | 0 | 1 red (GENESIS restore) | not run |
| restore ignores the record's admission (restores open) | 0 | 7 red (below-a x 3 restart classes, H1 transient) | - | - | - |
| resume unsuppressed (`resumeAfterReconstruction` ignores the gate) | 0 | 0 | - | - | - |
| resume unsuppressed + campaign ungated | - | 1 red (H1 transient) | - | - | - |
| ticks at creation from rows / join mode from a row count (`existingReplicaCount` from rows) | - | - | - | - | 1 red (GENESIS anchor: founders with rows made joiners) |
| admission not re-driven (MEMBERSHIP_CHANGED re-drive disabled) | - | - | - | - | 2 red (M3 re-drive; M2, whose planted stale row makes the leader re-propose the removed founder first, so the target's AddNode is the dropped one) |
| R-1a ignores the gate | - | - | - | B12 H1 red | - |
| stamp from rows (voters and identities from the address book) | - | - | - | - | M2 red |

Mutations that turn nothing red, and why (findings about the evidence):

- **j from core `status.applied`**: equivalent at this SHA. The runtime records
  its observation at the end of every drain, after `advance_apply`, so the
  core's `applied` equals the runtime's applied index at every recorded
  observation; the B9 cell (a label from a different observation than the
  configuration) is unobservable through the port without a host failure
  between `recordAppliedEntry` and `advance_apply`. Recorded, not repaired.
- **resume unsuppressed alone**: `campaignGroup` itself refuses below the gate,
  so the resume's own gate check is defence in depth; the mechanism is only
  observable with both removed (then M4's H1 transient cell is red).
- **ticks at creation from rows**: not equivalent after all - the join mode
  is the other half of the same mechanism (A4: stamp kind vs row-derived
  classification) and the GENESIS anchor catches it (founders over rows
  naming a leader are made joiners). The tick half alone is subsumed by the
  gate (the port's `startScheduling` at construction is refused and
  remembered), and the real-chain harness passes `deferElection: true` to
  every built service where production leaves it to `isJoiningExistingGroup`
  (a harness deviation, recorded below).

## 4. Timing table (`evidence-o1-static.test.js`, from production constants)

| Relation | Derivation | Value |
| --- | --- | --- |
| effective heartbeat | `HEARTBEAT_TICK` (3) x `raft.tickIntervalMs` (20) | 60 ms (M3) |
| election window | `tuningOf`: electionTick = ceil(1000 / 20) = 50 ticks; raft-rs randomizes [50, 100) | 1.0-2.0 s; `electionTimeoutMaxMs` (3000) not consumed |
| I3 re-arm | `INBOUND_DRAIN_DELAY_MS` (0), drain bounded (64 cycles), synchronous | << 1.0 s; measured within one drain |
| I8 first campaign | electionMin(index) = 1000 + 2500 x index (`JITTER_PER_REPLICA_MS`) | 1.0 / 3.5 / 6.0 s; the gate is in force from construction (M3) |
| I4 / B13 transfer abort window | `recoveryRetryWindowMsOf` = electionTick x tick of the LEADER's index | 1.0 s (index 0), 3.5 s (1), 6.0 s (2) vs `REQUEST_RETRY_AFTER_MS` 5 s: one refusal then completion for index <= 1; from index 2 the retry lands inside the abort window and raft-rs ignores the repeated request to the same transferee (harmless; recorded) |
| I6 busy leader | `PERSISTENCE_ADMISSION_WAIT.BOUND_MS` 120 s > 2 x `REPLICA_OPERATION_DISPATCH_TIMEOUT_MS` 5 s | unreadable by construction |
| I7 commit ahead of apply | <= 120 s (same bound) | |
| I1 admission stalls in SYNCING | floor(300 s / 120 s) = 2 | at most two full stalls |
| I2 refusal + re-plan | 2 x 5 s + 1 s (priority floor) < 60 s creating; 2 x 5 s + 60 s (periodic) <= 300 s syncing | the 90 s formation budget is not a `src` constant: not derivable here |
| I5 hint staleness | 2 hops = 10 s < 5 s (heartbeat) + 15 s (lease) | a second leader change inside 10 s is UNREADABLE |
| I9 re-drive | event-driven (MEMBERSHIP_CHANGED), no poll; outer bound SYNCING | |

## 5. Findings against production (frozen `ab7669fd0`)

None. Every property of sections 2-4 holds on `ab7669fd0`.

### Unreachable cell U1 - MsgTimeoutNow at a target holding its AddNode with a commit index below it

First measured as a red probe (commit `187d27240`, `evidence-o1-anchors.test.js`
"anchor (B1 probe)"), classified by the lead as UNREACHABLE BY CONSTRUCTION,
no production change, and converted into the B1 reachability anchor of commit
`14233f065`. The synthetic construction: founders a, b, c; the target opened
from the oracle stamp; its AddNode committed while envelopes to it carry a
commit index capped at a_self - 1, so it holds the entry, applied = a_self - 1,
`gateOpen=false`. The leader's `transferLeadership({successor: NAMED})` is
accepted (the target is in the leader's configuration with its progress
caught up), raft-rs sends MsgTimeoutNow at once; the target's core is
promotable (O2: self is a voter of its own bootstrap), `hup(transfer)` finds
no pending configuration entry in (applied, committed] because its committed
is a_self - 1, campaigns with CAMPAIGN_TRANSFER, the members vote, and it
leads with `gateOpen=false` at applied a_self - 1. The runtime leaves
TimeoutNow to the crate (amendment B1); the crate's guard is on commit
knowledge, not on applied (challenger B, B2).

Why it is unreachable, checked by the anchor on production behaviour rather
than by prose: a leader tracks the target only after applying AddNode(t), so
its first and every MsgAppend to the target carries the leader's committed
index (>= a_self); the follower commits to `min(m.commit, last_new_index)`,
so the target learns a_self is committed in the message that delivers it and
applies it in the same drain (the anchor never observes the target holding
a_self without commit and apply at or past it); a TimeoutNow is sent only
once the leader's progress for the target reaches its last index, which the
target acknowledged after that drain - every TimeoutNow the anchor observed
was sent with the target's gate already open. The runtime's group queue
additionally serialises a stepped TimeoutNow behind the drain in flight. The
crate's pending-conf refusal (`hup` on a committed-unapplied conf entry) is a
second layer below these; it is exercised only by the synthetic transport
and is recorded here, not tested.

### Findings about the model and the evidence

- B12 on H5 + self (source a absent, removed founder b unreserved on the
  target): R-1a answers `UNAVAILABLE` (UNRESOLVED), not `WITNESS_BELOW_GATE`.
  Both fail closed; only a shape with every id reserved (H1 + self) reaches the
  gate branch. Recorded as two cells.
- The harness passes `deferElection: true` to every built PartitionService;
  production founders get `deferElection` from `isJoiningExistingGroup`
  (false). No evidence here exercises the founder's port ticking at
  construction on the real chain (the cluster tests do: the gate refuses
  `startScheduling` at construction, M3).
- Equivalent mutants (section 3): j-from-core, resume-unsuppressed alone.
- The gate does not itself close the TimeoutNow producer; claim 2's wording
  ("does not campaign (... TimeoutNow)") is carried by the crate plus the
  replication invariant of U1, not by `applied`. Recorded for the wording of
  the claim; no production change (lead ruling).

## 6. Not covered, and why

- Snapshot install crossing the gate (B16): no rs-raft snapshot producer.
- Joint configurations as a stamp producer: none in `src`; the joint anchor
  proves the refusals with a raw explicit-transition change.
- The planner's operations for the RF+1 shape (A5/D9): owned by the sibling
  D1 planner witness; not re-proven here.
- The learner-promotion producer (`becomeFollower -> startElection`): only the
  port's refusal of `startScheduling` is proven (M3), not the promotion path
  that calls it.
- The 90 s formation join budget (I2) is not a `src` constant.
- The vote-request ingress filter of amendment section 2.5: not needed by M5
  (the gate holds without it); untested because it does not exist.
## 7. Runs and SHAs

Evidence commits (branch `evidence/evidence-o1-2026-09-26`, on the frozen
production SHA `ab7669fd0`; `git diff ab7669fd0..HEAD -- src` is empty):

| SHA | Content |
| --- | --- |
| `187d27240` | the seven evidence files, the model, the harness rewrite hook; carries the synthetic B1 probe RED (U1) |
| `14233f065` | the B1 reachability anchor replacing the probe (lead ruling), the shared M5 commit-lag setup (test duplication back to 787/30304) |

Static gates at `14233f065`: guideline audits 0 new (literals, decision
boundaries, boundary-mode contracts, hot-path diagnostics, deferred outcomes,
silent catch, ambient intrinsics, terminal vocabulary); duplication 55/1777
and 787/30304; complexity 1810/1810; file-size 27/27 and 21/21; unused
exports 1435/1435 (five helper names de-exported); eslint clean; test
metadata regenerated by the hook and `audit:shards` OK.

Local classified single-file runs (`scripts/run-classified-test-files.js`,
one file at a time, thermal ok): at `187d27240` every evidence file green
except `evidence-o1-anchors.test.js` (the U1 probe red by construction, 6/7);
at `14233f065` `evidence-o1-anchors.test.js` 7/7 and
`evidence-o1-real-chain.test.js` 7/7 green (node --test). The implementer's
files that import the edited harness - `committed-membership-target-validation`,
`durable-rejoin-record-refusal`, `admission-redrive`,
`bootstrap-committed-membership`, `committed-membership-read`,
`participation-gate`, `committed-membership-census` - green locally.

Lab cone (`lab test changed --sha 14233f065 --base-sha ab7669fd0 --lane all
--split`): the lab sends only an exact commit, so the run is launched on the
commit that carries this record; its result is appended below as a dated
entry (append-only).

### Lab cone result (appended 2026-09-26)

`lab test changed --sha 7d5bed7ca --base-sha ab7669fd0 --lane all --split`
(the record commit; its tree equals `14233f065` in `src` and `test`): 194
files, 194 pass, 0 fail, 4703 assertions - controller 191/191 (ordinary,
external-toolchain, bootstrap lanes), carinas-windows exclusive 3/3. Every
evidence file and every implementer witness importing the edited harness is
in the cone and green.

## 8. Round 2 (2026-09-27, production FROZEN at `d46777ecf`, evidence branch `evidence/evidence-o1-r2-2026-09-27`)

After verification O1 round 1 (`verification-o1-round-1.md`, REJECT on V1 and
V2) and the integration-2 head `d46777ecf` (F1 completion authority, F2
removal consensus exit, F4 readiness, V1a stamp-less refusal, V2 conf-change
deferral and settlement re-drive, joint leave admitted). Round-1 evidence was
merged by the integrator with four repairs (`fc9861157`): the B12 anchors
route each witness message to the addressed replica's port under F1 and
carry `entityId`; `CONF_CHANGE_PENDING` classified in the static file; the M3
"dropped AddNode" premise inverted (no empty entry any more: the second
AddNode is deferred typed and re-driven by the settlement). No `src` file was
changed by the evidence author: `git diff d46777ecf..HEAD -- src` is empty.

### 8.1 What changed in the evidence (verifier items 3-6)

| Item | Where | What |
| --- | --- | --- |
| 3 census | `committed-membership-census.test.js` "V1a census" (implementer, V1a) | Confirmed: it sweeps every `src` file (comments stripped) for `new PartitionService(` / `createPartitionService(` / `createJoinLocalPartitionService(` and pins the declared seven sites, each with a regex proving how its bootstrap arrives (explicit `genesisStamp` at the seed, the validated `context.bootstrapMembership` at the handler's create, `durableRecordBootstrap()` at the snapshot replacement, `...options` forwarding at the four factories/lifecycles). Scratch mutant "third constructor" (a `new PartitionService(` added to `partition-service-shared.js`): 1 red (`V1a census`). Referenced from here; not duplicated into the evidence static file (one census, one owner). |
| 4 D8 | `conf-change-pending-deferral.test.js` (port), `admission-redrive-chain.test.js` (production admission path), `partition-admission-redrive-wakes.test.js` (fixture wakes) - implementer, V2 | Confirmed: the port witness ranges over the crate's five pending kinds {effective AddNode, effective RemoveNode, no-op RemoveNode (non-member), no-op AddNode (member), post-election conservative index} x "AddNode(t) proposed behind it" -> typed deferral, `CONF_CHANGE_APPLIED` within one applied entry, admitted when proposed again, no empty entry; the chain witness ranges over the three kinds the production admission path meets (no-op RemoveNode = R-1f's repeat, no-op AddNode, effective RemoveNode of a retiring row) with "no re-admission of the just-removed source" an explicit cell; the wakes witness covers the leadership-gain re-drive and a deferred retirement. Added by the author: the joint-leave cell in `evidence-o1-anchors.test.js` (joint anchor): an AddNode while joint is `CONF_CHANGE_PENDING` (retryable), the leave (a change with no steps) is taken, the AddNode is taken and commits once the group left. |
| 5 amendment | `committed-read-amendment-1-2026-09-26.md` section 8 (appended) | Supersessions (R09): claim 2's TimeoutNow wording (crate guard + U1, not the gate on applied); row B5 (a_self <= j unreachable under A3); section 2 item 1 (the seed lost-data-directory cell is NOT closed on the target side: V1a closes the stamp-less default, the empty-data-directory founding is CR-F5, pending); rows A2/B10 and section 3.5 (the V2 mechanism). |
| 6 hygiene | `evidence-o1-static.test.js`, `evidence-o1-anchors.test.js` | `RUNTIME_PHASE` classified member by member (incl. the new `bootstrap-stamp-validation`); "anchor (port stamp validation)": the port itself refuses every defect of `COMMITTED_MEMBERSHIP_STAMP_DEFECT` typed (`CORE_REFUSED`, `STAMP_INVALID`, the defect, phase `bootstrap-stamp-validation`, non-retryable) with no store built - the absent stamp (an explicit null past the cluster driver's default GENESIS) and IDENTITY_MISMATCH included, so V6's untyped path is closed at `d46777ecf` (`stampDefect` carries `consensus`); the registry-side mismatch of `committedBootstrap` is typed the same way and unreachable behind the validator's identical derivation. |

### 8.2 The seven property files on `d46777ecf` (`node --test`, one at a time)

static 8/8 (RUNTIME_PHASE added), gate histories 6/6, restart equivalence
16/16, admission liveness 1/1, anchors 8/8 (port stamp validation added),
real chain 7/7 (M3 premise inverted by the integrator), model helper - all
green.

### 8.3 Mutation matrix re-run on `d46777ecf` (scratch copies, never committed)

Files: M1 = `evidence-o1-gate-histories` (6), M4 = `evidence-o1-restart-equivalence` (16), M3 = `evidence-o1-admission-liveness` (1), A = `evidence-o1-anchors` (8), R = `evidence-o1-real-chain` (7), V2 = the implementer's V2 witnesses (port deferral 5, chain 3, wakes 9 subtests), C = `committed-membership-census` (8), S = `stampless-opening-refusal` (2). "-" = not run.

| Mutation (mechanism) | M1 | M4 | M3 | A | R | V2 / C / S |
| --- | --- | --- | --- | --- | --- | --- |
| gate removed | 6 red | 10 red | 1 red | 3 red (B1 reachability, B12 x2) | 5 red (M2, M5 a/b/c, M3) | - |
| gate at j only | 6 red | 8 red | 1 red | 0 | 2 red (M5 b, c) | - |
| gate delegating to the crate's hup check | 6 red | 10 red | 1 red | 0 | 2 red (M5 a, c) | - |
| bootstrap index not persisted | 6 red | 15 red | 0 | 1 red (GENESIS restore) | - | - |
| restore ignores the record's admission | 0 | 7 red | 0 | 0 | - | - |
| resume unsuppressed alone | - | 0 (equivalent: campaignGroup's gate subsumes) | - | - | - | - |
| resume + campaign ungated | - | 1 red (H1 transient) | - | - | - | - |
| j from core `status.applied` | 0 | 0 | 0 | 0 | - | - (equivalent, as in round 1) |
| R-1a ignores the gate (`WITNESS_BELOW_GATE` branch removed) | - | - | - | **0 - equivalent under F1** (see 8.4) | - | - |
| stamp from rows | - | - | - | - | 1 red (M2) | - |
| admission not re-driven (the settlement/leadership re-drive disabled) | - | - | - | - | 2 red (M2, M3) | chain 0 (its deferred admissions are re-proposed by the next cache reconcile; the port witness does not exercise the re-drive) |
| join mode / ticks from a row count | - | - | - | - | 1 red (GENESIS anchor) | - |
| absent stamp defaults to GENESIS (V1a reverted at the port) | - | - | - | 1 red (port stamp validation) | - | S 2 red |
| third constructor site (a `new PartitionService(` added to `src`) | - | - | - | - | - | C 1 red (V1a census) |
| settlement keyed on the configuration key (CONF_CHANGE_APPLIED only when the ConfState key changed) | - | - | - | - | 0 | V2 port 3 red - exactly the no-op RemoveNode, no-op AddNode and post-election kinds; chain 0, wakes 0 (fixture-emitted events) |
| re-drive on MEMBERSHIP_CHANGED only (V2 wiring reverted) | - | - | - | - | 0 (M3's first AddNode changes the key) | V2 wakes 4 red (no-key-change settlement, deferred admission, leadership gain, deferred retirement); port 0, chain 0 (cache reconcile masks) |

### 8.4 Findings about the evidence (round 2)

- **R-1a ignores the gate is now an equivalent mutant.** Under F1 (integration 2) the completion authority is the group's leader-answered committed configuration, reached from the addressed replica with one redirect; the integrator accordingly relaxed the B12 anchors to accept `STILL_VOTER` from the leader's answer below the target's gate. The `WITNESS_BELOW_GATE` branch of `completionVerdictOf` (`operation-workflow-replace-owner.js:203`) is therefore reached only when the ANSWERING replica is below its gate, which a leader never is; removing the branch turns nothing red. It is defence in depth under F1; whether any F1 path can present a below-gate observation to R-1a is F1's owner question, recorded here, not repaired by adding a hand case.
- **The chain re-drive witness does not discriminate the re-drive itself**: with the re-drive disabled or wired to MEMBERSHIP_CHANGED only, `admission-redrive-chain` stays green because a deferred admission latches nothing and the next cache reconcile of the same row proposes it again; the property (admitted within the bound) holds by another path. The port witness and the wakes witness carry the discrimination (settlement kinds; wakes). Recorded for the implementer; no hand case added.
- Two mutants (gate removed, bootstrap index not persisted) also turn the B1 reachability / GENESIS-restore anchors red through their setup (a gate that never closes, a record that never restores) - expected collateral, not new coverage.

### 8.5 Runs and SHAs (round 2)

| SHA | Content |
| --- | --- |
| `fc9861157` | integration-2 evidence head (the integrator's merge repairs to round-1 files) |
| `e7cec589f` | round 2: port stamp-defect anchor, D8 joint-leave cell, RUNTIME_PHASE classified, amendment section 8 |
| record commit | this section; the lab cone result appended below |

Static gates at `e7cec589f`: eslint clean; literals 0 new; duplication 55/1777 and 780/29947 (the integrator's tightened baseline held); unused exports 1435/1435; test metadata regenerated by the hook.

