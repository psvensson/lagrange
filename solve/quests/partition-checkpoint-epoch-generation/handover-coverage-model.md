# Hand-over coverage model: who holds a replica's local existence

Quest `partition-checkpoint-epoch-generation`, round 5 step 1, **revision 2**
(design only, no source change). Revision 1 was vetted REVISE: the invariant
and table stand as the reasoning model; the mechanism is narrowed by the lead
and five refutations (S1 to S5) plus missing cells are resolved here.
"today" means tree `4441979d`. File:line references are to that tree.

## 1. Reasoning model (unchanged) and the narrowed mechanism

**Invariant (reasoning model).** For every replica id on a node, at every
instant, exactly one owner holds the replica's local existence (ABSENT,
CREATE, RUNNING, INSTALL, RECREATION, REMOVAL, CLEANUP); a hand-over is one
step; the database path has at most one opener, installer or deleter; an owner
whose authority is a durable fact takes over only once that fact is durable.

**Mechanism (narrow, lead decision).** There is no general ownership record.
There is one record per replica **for the install episode only**. No record
means the existing owners own exactly as on main.

| Episode state | Path holder | Serving |
| --- | --- | --- |
| `receiving` | the running service (opener) | yes |
| `stopped` | the installer while its step runs, otherwise nobody | no |
| `recreation` | nobody between attempts; one opener during an attempt | no |
| holds (below) | nobody | no |

Named holds, each a sub-state of `stopped`/`recreation` in which nothing is
opened: `removal_pending`, `awaiting_removal_owner`, `awaiting_cleanup_owner`,
`lifecycle_unobservable`, `row_before_syncing`, `open_refused_install_conflict`.

**Custody.** The episode mints one custody token at admission. It is void the
moment the episode ends or is claimed.

**Choke point.** `TrackedServiceRegistry.set/delete`
(`replica-handler-membership-relay.js:43-59`) refuses, typed
(`replica_under_install_episode`), any write for a replica under a live
episode unless it presents the episode's custody. `setLocalReplica` applies
the same rule to the memo's `service` field only (other memo fields pass),
because `getTrackedService` falls back to the memo's service
(`runtime-methods.js:633-655`): the registry is two-sourced and both sources
are fenced.

**Four claim points** (the only ways an episode ends other than by its own
recreation succeeding). A claim is synchronous on the record, voids custody,
and returns a promise that settles when the step in flight (shutdown, install
swap, factory open) has settled and anything an attempt opened has been shut
down with its handle closed. The claimant acts only after that promise.

| Claim | Precondition | Claimant then owns |
| --- | --- | --- |
| removal | the REMOVING row is durable | the service the claim returns (never a captured object) |
| create failure | the create that owns the mid-create replica is failing (see S5) | the stopped replica, as on main without an episode |
| handler stop | the handler is shutting down | nothing; the process ends |
| cleanup | a durable cleanup claim (token) exists | the stopped replica's storage |

A **create replay** during an episode is not a claim: it is refused typed
before attempt rotation (S3a/S4).

**Installer guard.** Section 4.

## 2. Coverage table

Durable fact of the receiving owner: **present**, **not yet durable**,
**failed/unknown**. Witness: E existing, H1/H2 verifier's, N to be written.

| # | Hand-over / event | Present | Not yet durable | Failed / unknown | Owner after; hold cleared by | Witness |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | offer admitted (replica RUNNING, row ACTIVE/SYNCING, no episode, exactly one local replica of the group) | episode `receiving`, custody bound to the tracked service | row before SYNCING or unobservable: `receiver_not_admitted`, no episode | same | episode or unchanged; leader re-ask | E W-offer-*, N |
| 2 | second offer, any leader, episode live in any state | `replica_installing`; nothing received. **Today R1** | – | – | first episode | **H1**, N per state |
| 3 | pre-shutdown admission (`receiving`) | admitted and custody still held: → `stopped` | lifecycle hold, or `removal_pending`: episode ends, replica never stopped | unobservable: same | RUNNING (no episode) | E, N |
| 4 | `stopped` → `recreation` (shutdown threw; install rejected, threw, installed) | once, on every path | – | – | episode | E unit, E W-recreate-owned |
| 5 | recreation → RUNNING | row ACTIVE/SYNCING: open with custody, registered through the choke point, serving fence and retired-group check carried (cells 20, 21), episode ends | `row_before_syncing` hold | `lifecycle_unobservable` hold | RUNNING or episode; lifecycle transition, bounded retry | E, N |
| 6 | **REMOVE accepted** during an episode (S1) | hold `removal_pending`: no new open; an open in flight is released; ownership stays with the episode | – | – | episode (held); cleared by cell 7 or 8 | N (S1 witness) |
| 7 | removal's REMOVING write durable | removal claim; removal continues on the service the claim returns (stopped, or still running if the episode was `receiving`: S2) | – | – | REMOVAL | N; killing witness for the settle wait |
| 8 | removal's REMOVING write deferred, failed or thrown | – | hold lifted in a `finally`; recreation resumes; replacement carries the serving fence. **Today R2** | same | episode | **H2** |
| 9 | recreation reads REMOVING, no local removal running (earlier outcome unknown) (S3b) | hold `awaiting_removal_owner` | – | – | episode (held); cleared by a REMOVE re-dispatch (cell 6→7), see V1 | N through `handleRemoveReplica` |
| 10 | recreation reads FAILED / cleanup-owned row (S3a) | cleanup token present: cleanup claim | no token: hold `awaiting_cleanup_owner` | same | CLEANUP or episode (held); cleared by the claimed REMOVE (`handleRemoveReplica` with the failed-create precondition) or the row returning to ACTIVE/SYNCING | N through the real claimed REMOVE |
| 11 | removal fails after durable REMOVING, FAILED write deferred | removal already claimed: stopped replica is the removal's; its own debt/retry continues | – | – | REMOVAL | N |
| 12 | create fails during an episode (S4, S5) | create-failure claim (awaits the step in flight), then the existing failure fence and FAILED/claim write | FAILED or claim deferred: same claim; replica stopped and unregistered exactly as on main; the create's re-dispatch (RESTART_CREATE) is the one opener | same | CLEANUP (claimed) or the create operation's replay | E W-new-failed (reworked), N deferred variant |
| 13 | create replay during an episode | refused typed deferral **before** rotation and before `existingCreateResponse` | – | – | episode | N (H3 run first; S4) |
| 14 | create replay after cell 12 deferred | RESTART_CREATE opens; no episode exists, so no second opener | – | – | CREATE | N |
| 15 | handler stop in `receiving` | handler-stop claim: receive abandoned typed, service shut down by the existing stop | | | process ends | N |
| 16 | handler stop in `stopped` / `recreation` | claim; the step in flight settles; no install after a void custody; an attempt's product is released | | | process ends | E W-recreate-stop, N at the install step |
| 17 | REMOVAL → CLEANUP (`takeoverRemoving`, `remove-execution-methods.js:145-167`) | unchanged; it runs only after the removal claim, on the claim's service | | | CLEANUP | E |
| 18 | REMOVE completing after a rejected install (S3c) | cleanup's preflight no longer refuses a REJECTED marker (section 3, S3c) | | | CLEANUP → ABSENT | N |
| 19 | open refused by `INSTALL_STATE_CONFLICT` (S3d) | hold `open_refused_install_conflict`: doubling backoff 2 s to 60 s, typed, visible; ended only by removal, cleanup or handler stop | | | episode (held) | N |
| 20 | REMOVE accepted, then deferred, then recreation | replacement is fenced for serving like the service it replaces (the fence is irreversible on main) | | | RUNNING | N |
| 21 | partition retired as a unit during the episode | the replacement goes through the same retired-group check as `registerExistingReplica` (`runtime-methods.js:417`) before it is RUNNING | | | RUNNING then its retirement | N |
| 22 | two local replicas of one raft group (same-node REPLACE) | the offer resolves by group id (`install-owner:354-367`): with more than one candidate the offer is refused typed `receiver_ambiguous`; one replica per group per node is thereby enforced for installs | | | unchanged | N |
| 23 | offer to a bootstrap-registered replica (`bootstrap-service-replica-registration-methods.js:291`, `:469-475`, told ACTIVE even on a SYNCING row) | admission reads the authoritative row, not the memo status: same as cell 1 | | | episode | N |
| 24 | process crash during an episode | see the startup table, section 6 | | | | E + N |
| 25 | offer when no service is registered (CREATE before open, REMOVAL, CLEANUP, ABSENT) | `replica_not_found` | | | unchanged | E, N |

## 3. Resolutions of S1 to S5

**S1 (accepted; revision 1 item 5 withdrawn).** Removal is two-phase toward
the episode. Acceptance (`remove-request-methods.js:528-536`) sets
`removal_pending` (cell 6). The durable REMOVING write is the claim (cell 7).
A deferred, failed or thrown write lifts the hold in a `finally` (cell 8). No
removal path writes a captured service object into the memo: the sites at
`remove-request-methods.js:535`, `remove-execution-methods.js:347, 421, 604`
take the service from the claim's answer, or write no `service` field while
the episode is live (the choke point refuses otherwise). The S1 interleaving
(recreation opens R, removal deletes storage under R) is closed twice: no open
happens under `removal_pending`, and the removal acts only on the service the
claim returns after any product has been closed.

**S2.** `receiving` is its own state. Removal (durable), cleanup and handler
stop claim it directly: the receive is abandoned through its abort signal with
a typed outcome, the replica was never stopped, and the claimant owns the
running service. Nothing waits for an unbounded receive.

**S3. Every hold has a production clearing actor.**

| Hold | Clearing actor | Notes |
| --- | --- | --- |
| `removal_pending` | the accepted removal itself: claim or `finally` | cells 7, 8 |
| `awaiting_removal_owner` (b) | the REMOVE re-dispatch arriving at `handleRemoveReplica` | The handler's own contract says a deferred REMOVE emits no executor outcome so its durable owner re-dispatches (`remove-execution-methods.js:580-593`). **V1: the coordinator side (`operation-workflow-dispatch-rearm-evidence.js`) is not yet traced by me; it must be traced, and the witness must drive the real re-dispatch, before this cell is relied on.** |
| `awaiting_cleanup_owner` (a) | the claimed REMOVE of a failed create; or the row returning to ACTIVE/SYNCING | Sources: a REMOVE throwing before REMOVING is durable writes FAILED without a token (`remove-execution-methods.js:400-406`); a failed create with a deferred claim (`create-status-methods.js:222-236`). The mutual wait the vetter found (rotation at `create-admission-methods.js:225` moving the row to a pre-SYNCING state while the recreation waits for SYNCING) is broken by cell 13: a replay during an episode is refused before rotation, so the row cannot move under the episode; and by cell 12: a failing create claims the episode, so no episode outlives its create's failure. |
| `open_refused_install_conflict` (d) | removal, cleanup, handler stop | Not self-clearing by design; D6. |
| `lifecycle_unobservable`, `row_before_syncing` | the control plane answering; the create publishing SYNCING | Existing; bounded retry with backoff. |

**S3c (in scope).** A REJECTED marker is written by `rejectInstall`
(`snapshot-install.js:421-429`) and `rejectInvalidCheckpoint` (`:521-523`,
legacy kind), kept by `resolvePendingSnapshotInstall` (`:726-727`), and makes
`cleanupReplicaResources` refuse for ever (`runtime-methods.js:191-198`,
only a fresh-create marker of the same generation is "owned"). With the
quest's own epoch-moved case a REMOVE could never finish. Answer, two parts:
the opener consumes a REJECTED marker at open (the rejection is already in
the typed install outcome and log; the marker carries no later authority), and
cleanup's preflight treats a marker in state REJECTED with no staging file as
removable. Restart with a REJECTED marker is then the first part.

**S4 (accepted).** Cell 14 of revision 1 was wrong by reading. During an
install the stopped object stays registered, `isReplicaCreateAlreadySatisfied`
is truthy for it (`runtime-methods.js:664-668`), so a replay answers
ALREADY_EXISTS and emits REPLICA_CREATE_ACTIVE for a stopped replica
(`create-admission-methods.js:497-518, 614`). H3 is run first and expected
green; the defect is the false ACTIVE outcome, fixed by cell 13. The real
second opener is the SYNCING variant: create fails mid-install, the fence
unregisters the stopped object (`replica-runtime-cleanup-custody.js:93-103`),
the FAILED write is deferred, a replay takes RESTART_CREATE
(`create-methods.js:178-183`) while a recreation attempt may be opening.
Closed by cell 12: the failure claims the episode and awaits the attempt in
flight before the fence unregisters anything.

**S5 (accepted).** Revision 1's cell 12 stranded the create. Resolution: a
create's failure always claims the episode, whether or not its FAILED write or
claim becomes durable. The replica is then stopped and unregistered exactly as
on main, where the return owner already exists in both cases: the cleanup
claim, or the create's re-dispatch (RESTART_CREATE reopens and activates).
This differs from the lead's wording ("create failure after a durable claim");
see D7. The alternative, an owner that resumes activation on a RUNNING
replica without opening, needs a new branch in `createReplicaAsync`
(complexity 66) and is not recommended.

## 4. Installer guard

The custody check goes **inside** `swapPreparedInstall`, synchronously before
the first marker write (`snapshot-install.js` ~:488), required whenever the
installer classifies the install as follower catch-up; a missing or void
custody is a typed rejection. It is **added beside** the journal check
("-wal non-empty", `raft-rs-replica-lifecycle-owner.js:29, 736`), not instead
of it: the journal check is the only physical evidence about openers outside
the handler.

**Finding F-readers (recorded, not repaired here).** Retained read-view
readers (`call-shard-read-view-manager.js:65-70`) and split snapshot readers
(`partition-service-split-accessor-base.js:370-377`, no `isShutdown` check)
can hold the file open across a swap. By the vetter's reading, which I have
not re-verified beyond the journal check: a reader keeps the old inode and
reads a consistent old image (stale, not corrupt); a reader that keeps the
WAL non-empty makes the installer refuse, typed, for as long as it lives,
which is a stall the episode reports but cannot end. Why out of scope: those
readers have their own owners and no handle registry; why not unsafe: the
outcome is a refusal or a stale read, never a write to a swapped file.

## 5. Sites under the narrow design

| Site | Can act during an episode? | Fenced by |
| --- | --- | --- |
| registry `set/delete`: create `:455, 243, 262, 608, 620, 649`; `registerExistingReplica :408`; `replaceLocalReplicaService :434`; bootstrap `:291`; fence `custody.js:94`; removal `:342, 719`; `create-status-methods.js:254` | yes | choke point; the episode's own registration presents custody |
| memo writers carrying a service: `remove-request-methods.js:535`; `remove-execution-methods.js:347, 421, 604`; `create-admission-methods.js:210`; `create-methods.js:460, 483, 573`; `status-methods.js:139` | yes | `setLocalReplica` service-field rule; removal sites also by the claim's returned service |
| `requestSnapshotInstall` (`snapshot-catchup-install.js:69`) | it is the episode | custody inside the swap |
| `resolvePendingSnapshotInstall` at open | inside whoever opens | the opener holds custody |
| `cleanupReplicaResources` (`runtime-methods.js:163, 206`), cleanup sweep | only after a removal or cleanup claim | claim point |
| create runtime-repair and replay (`create-admission-methods.js:698`, `create-methods.js:178`) | refused | cell 13 |
| handler shutdown (`custody.js:162`) | yes | handler-stop claim first |
| shared `partitionServices` map (factories `:170`, `:271`) | written by the factory on every construction | not fenced; stale only after a discard or removal; D5 follow-up finding |

## 6. Startup: durable fact against the opener

| Row | Marker | Opener at startup | Two claimants? |
| --- | --- | --- | --- |
| ACTIVE | none / INSTALLED / STAGED | bootstrap or durable rejoin; marker resolved at open | no |
| ACTIVE | REJECTED | same; marker consumed at open (S3c) | no |
| ACTIVE | conflict | open fails closed (existing); no episode exists after a restart, so nothing retries: the replica is absent locally until removed or repaired. **Decision D6** | no |
| SYNCING (mid-create) | any of the above | retained create-admission recovery only (V2 established by the vet: bootstrap and durable rejoin open only ACTIVE rows at the exact version). The seed phase (`phases/seed-partitions-phase.js:251`) constructs only the seed's system-table partitions, which the checkpoint cadence refuses as control-plane partitions (`unsupported_partition`), so they never carry an install marker or an episode | no |
| REMOVING / cleanup-owned | any | cleanup sweep; never opened | no |
| FAILED | any | failed-create cleanup | no |

## 7. Decisions and open items

| Item | Status |
| --- | --- |
| D1 installer guard | accepted as amended (section 4) |
| D2 holds keep ownership | accepted; every hold visible in `getStats().snapshotInstalls` with its name |
| D3 | premise withdrawn; H3 first, replay refused before rotation (cell 13) |
| D4 | replaced by the narrow design |
| D5 `partitionServices` stale entry | follow-up finding |
| D6 conflict marker: retry with backoff, ended by REMOVE | accepted |
| D7 create failure claims the episode without a durable claim (S5) | accepted |
| V1 coordinator re-dispatch of a deferred REMOVE | established by the vet: re-dispatched while the operation lives (coordinator timeout sweep, 1 s); after the operation is terminal nothing re-dispatches: cell 8 does not depend on it; cell 9's post-terminal orphan is pre-existing (finding, section 9) |
| V2 SYNCING row at startup | established: one opener (section 6) |

**Can the narrow design make every blocking cell true?** Yes by design for
cells 1 to 8 and 10 to 23. Two cells rest on facts I have not established:
cell 9 on V1 and the SYNCING line of cell 24 on V2. If V1 shows no guaranteed
re-dispatch, cell 9 has no production clearing actor under the narrow design;
if V2 shows two startup openers, that is a defect outside an episode that the
narrow design cannot fence. Either would be a reason to raise the split with
the owner. I am flagging, not designing, that exit.

## 8. Witness plan

All through the real `ReplicaHandler`; red first on `4441979d` where the cell
is wrong today.

**Await-point matrix.** Rows: each await of the orchestration (A1 offer
admission read, A2 receive, A3 pre-shutdown admission read, A4 shutdown,
A5 install) and of a recreation attempt (R1 release of the previous service,
R2 admission read, R3 factory open). Columns: competing events. Each cell is
one case of a parametrized witness with a gate at that await.

| | second offer | REMOVE accepted | REMOVING durable | create failure | create replay | handler stop |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | installing (H1 form) | no episode yet: ordinary removal | ordinary removal | ordinary failure | ordinary replay | ordinary stop |
| A2 | installing | hold; A3 then ends the episode | claim, receive abandoned | claim, receive abandoned | refused | claim, receive abandoned |
| A3 | installing (**H1**) | hold: not stopped | claim: not stopped | claim: not stopped | refused | claim |
| A4 | installing | hold; no open after | claim after shutdown settles | claim after shutdown settles | refused | no install after |
| A5 | installing | hold; no open after | claim after the swap settles (**killing witness**: storage step not before the swap) | same | refused | swap settles, nothing after |
| R1 | installing | attempt ends in the hold | claim, attempt void | claim | refused | claim |
| R2 | installing | attempt ends in the hold | claim | claim | refused | claim |
| R3 | installing | product shut down, handle closed, then hold (**S1 witness**: closed before any unlink) | product closed, then removal | product closed, then fence | refused | product closed |

Further witnesses: H1 and H2 adopted; H3 run first (expected green) then the
ACTIVE-outcome witness; each hold cleared by its real production actor (cells
8, 9, 10, 19); S5 (cells 12 and 14 end to end: failed create, deferred FAILED,
replay reopens and activates, one opener); removal completing after a
rejected install (cell 18); restart with a REJECTED marker and with a conflict
marker; SYNCING row at restart (V2); an offer to a bootstrap-registered
replica (cell 23); serving fence carried (cell 20); retired group (cell 21);
two replicas of one group (cell 22); a direct registry write and a memo
service write during an episode refused; an installer-level unit showing no
await between the custody check and the swap; a structural check that no
registry write during an episode happens outside the choke point (the choke
point counts refusals; the suite asserts zero unexpected ones).

Mutations: each claim precondition removed; removal claim moved before the
durable write (H2 red); hold not lifted in the `finally` (H2 red); hold not
set at acceptance (S1 witness red); settle wait removed (killing witness
red); custody check removed at the registry, at the memo and in the swap;
replay refusal moved after rotation; REJECTED marker not consumed.

## 9. Conditions of approval (revision 2 approved with conditions), folded in

**C1 `removal_pending` has an owner and a count.** The hold is a set of
removal operation ids on the episode, not a boolean. It is added as the last
synchronous step before the removal task starts (after the acceptance path's
memo write, which no longer carries a service for a replica under an episode),
and removed in the `finally` of that task, including the branch where the
deferred start returns early on shutdown
(`group-retirement-request-methods.js:298-305`). A second REMOVE with another
operation id adds its own id; the hold lifts when the set is empty. A REMOVE
with the failed-create precondition makes REMOVING durable at acceptance
(`remove-request-methods.js:491`) before any hold: that acceptance performs
the removal claim itself, there and then (durable fact present), and its task
adds no hold.

**C2 cleanup owns this replica's install artifacts.** Under a current cleanup
token, a follower-catch-up marker naming this replica id, or a legacy REJECTED
marker, is removable in any state together with its staging file (REJECTED
with staging after a crash, `snapshot-install.js:426-428`; REJECTED written
over an older staging file, `:521-523`; STAGED or INSTALLED left by a swap
that threw, `:488-492, 624`). The retained-rejection answer pinned by
`test/raft/snapshot-install-restart-states.test.js` (quest
`raft-snapshot-atomic-install`) is a superseded contract: recorded in the log
(R09), the test changed with that record.

**C3 choke-point refusals throw typed.** Three sites become a named claim or
are shown unreachable during an episode, each with a witness:
`create-status-methods.js:254` (deferred create status write unregistering),
`retireSupersededCreateAdmissionRuntime` (retained recovery stopping a runtime
by row tokens), `reconcileRemovedReplicaCleanup`
(`remove-execution-methods.js:671-736`, removal effects at acceptance).

**C4 step in flight.** One service shutdown, one install (its swap), or one
factory open. It excludes the retry timer (cancelled by the claim) and the
receive (aborted through its signal, `snapshot-transfer.js:430-431`). The
claim's wait for it is named `episode_step_settle`; it is bounded by the step
itself (R13): a shutdown and an open have no timer of their own, so the wait
is visible in the episode's diagnostics while it lasts.

**C5 findings recorded (R17):** the superseded retained-rejection contract;
on main a failed create whose FAILED write was deferred has no handler-side
retry; post-terminal REMOVING and FAILED orphans; the ACTIVE-row
runtime-repair race at startup; F-readers.

**C6 diagnostics.** A rejected install's outcome is kept on the episode
record (not only on the stopped service object), so it survives the marker's
consumption and is visible while recreation is pending.

**C7 witnesses added:** two REMOVE operations on one held episode; acceptance
refusing after the hold is set; removal completing over a STAGED marker and
over REJECTED with staging; the three C3 sites.

## 10. Implementation record (round 5 step 2)

Test files: EP `test/raft/raft-rs-backend/partition-snapshot-install-episode.test.js`,
IR `…/partition-snapshot-install-recreate.test.js`, H1/H2/H3 the three adopted
witnesses, CC `…/partition-snapshot-compaction-catchup.test.js`, OU
`test/node/replica-snapshot-install-owner.test.js` (real handler, stand-in
services), OR `test/raft/snapshot-catchup-install.test.js`, RS
`test/raft/snapshot-install-restart-states.test.js`.

**Built differently from the text above (each a deliberate reading, none a
wider scope):**

1. The episode is taken when the offer's admission STARTS (before the A1
   read), so a second offer during A1 already answers installing; an offer
   refused at A1 leaves no record. Row A1 of the matrix therefore behaves as
   row A2.
2. An offer is also refused while a removal of the replica is in progress
   (`removal_in_progress`): without it an offer admitted after a REMOVE's
   acceptance could stop and replace the service the removal captured.
3. The memo rule lets a write through that names the service the episode is
   bound to (it changes nothing); every other `service` write needs custody.
4. A REMOVE with the failed-create precondition does not claim at acceptance:
   like every removal it holds at acceptance and claims in its task, where
   the already-durable REMOVING row is read (`skipRemovingStatusWrite`). One
   claim point.
5. The create-failure claim lives in `fenceFailedReplicaCreateRuntime`, so it
   also covers `retireSupersededCreateAdmissionRuntime` (C3). The cleanup
   claim lives in `cleanupReplicaResources`, after the first current-token
   check.
6. A recreation never ends by its own admission read: REMOVING holds
   `awaiting_removal_owner`; FAILED, cleanup-owned, absent, foreign and
   unknown rows hold `awaiting_cleanup_owner`.
7. C3 site `create-status-methods.js` (`deferRetryableReplicaCreateStatusWrite`):
   reached only from the initial PENDING/CREATING status write of a create,
   which runs before that create has a tracked service, and a CREATE request
   for a replica under an episode is refused first; unreachable during an
   episode, and the choke point throws typed if that is ever wrong.
8. Cell 22 is implemented (follow-up pass): with more than one running
   local replica of the offered group `resolveReceiver` answers `ambiguous`,
   the router answers the typed abort `receiver_ambiguous`, and nothing is
   asked, received or taken as an episode. Witnesses: OU "two running local
   replicas of one group", `test/raft/snapshot-offer-router.test.js`;
   mutations R32, R33. No end-to-end witness with two real services.
9. **Cells 12 and 14 have no end-to-end witness** (a create failing DURING an
   episode with a deferred FAILED write, then RESTART_CREATE): the claim and
   its precondition are witnessed at OU only.

**Await-point matrix: witness, or reason.** "same predicate" means the cell
is decided by one state-independent line and is witnessed in another row.

| | second offer | REMOVE accepted | REMOVING durable | create failure | create replay | handler stop |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | OU "an offer takes the episode" | same predicate as A2 (`removalOperations` read after the A1 read); no witness | same predicate as A4 (`record.live` after the read); no witness | as REMOVING durable | H3's refusal is `custodyOf !== null`, state-independent | as REMOVING durable |
| A2 | `resolveReceiver` reads `record.live` only: same predicate as A3 | OU "the admission before the shutdown" (hold set during the receive) | receive aborted through the signal: OU "a claim is synchronous" asserts `signal.aborted`; no end-to-end witness | as REMOVING durable | same predicate | as REMOVING durable |
| A3 | **H1** | OU "the admission before the shutdown" | OR "claimed between its admission and its shutdown" | as REMOVING durable | same predicate | **EP E-stop** |
| A4 | same predicate | OU "holds the episode by operation id" (attempt start re-reads the hold) | OU "a claim is synchronous" (step in flight) + OR "claimed during its shutdown step" | as REMOVING durable | same predicate | OR "claimed during its shutdown step" |
| A5 | same predicate | as A4 | CC (custody void at the swap: nothing swapped) + OU "the cleanup owner … removes nothing before the step in flight settled"; the follower catch-up install has no await between its custody read and the rename | as REMOVING durable | same predicate | as REMOVING durable |
| R1 | same predicate | `interruptionOf` is re-read after this await: same predicate as R3; no witness | same | same | same predicate | same |
| R2 | same predicate | as R1 | as R1 | as R1 | same predicate | as R1 |
| R3 | IR W-installing | **EP E-remove** (real request path; product closed before the removal's consensus exit) and OU "holds the episode by operation id" | **EP E-remove**, OU "a claim while the replacement opens" | OU "a failing create claims …" (precondition only) | **H3** | IR W-recreate-stop |

Holds cleared by their production actor: `removal_pending` EP E-remove (claim)
and EP E-deferred (task end; cell 8, with the serving fence of cell 20);
`awaiting_removal_owner` EP E-removing (the REMOVE request); `awaiting_cleanup_owner`
EP E-failed (row returns ACTIVE; the cleanup-claim side at OU only);
`open_refused_install_conflict` OU only (stand-in open error with the typed
code); the 2 s to 60 s doubling is not witnessed by a timed test.
