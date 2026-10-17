# Design re-vet R1: Revision 1 of RECOVERY-DESIGN-20261017

Subject: `solve/quests/wasm-creation-genesis/RECOVERY-DESIGN-20261017.md` lines 270-564
("Revision 1") in `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`
at `381750de2` (file untracked; `src/`/`test/` clean; the activation charter and closeout plan
carry uncommitted edits). Read-only; nothing touched; no lab. Every `file:line` re-read from
this tree or carried from the first vet (same tree, same lines). Templates: the sealed bar
(owner-interaction, admission-gating, concurrency-serialization, recovery-replay,
transport-delivery, harness-fidelity, formation-circularity) plus retry-loops once, out of
bar, because R1-C 7 is a re-drive.

Read for this round: Revision 1 in full; the charter diff; `operation-lifecycle.js:18-45`
(`VALID_TRANSITIONS`). Withheld: the closeout plan's 44 new lines (not named by the brief).

## Verdict: REVISE (new blocking B5, B6; required R17-R27; recorded N10-N13)

Revision 1 closes the four blocking findings in mechanism: the inventory has two owners and a
composer, the retirement order is the implemented one, the refusal codes are made to flow, and
the unconfirmed grant has a decision owner and an event-driven release path. It introduces two
defects of its own: R1-G terminates a PENDING row without first resolving whether its
reservation applied, orphaning an ADMITTED slot nobody can close (B5); and R1-C's
`ADMISSION_TENTATIVE` cannot reach the adapter because every capture site refuses a
non-ADMISSION outcome, while the "opening claim skipped" clause creates a second source of the
opening record (B6). Both need sentence-level changes, not a new architecture.

---

## Part 1. Disposition of the first vet's findings

| Id | Disposition | Clause / reason |
| --- | --- | --- |
| B1 (UNCONFIRMED grant unowned, no release path) | CLOSED in shape; three precisions required | R1-C 1-8. Owner = opening module; confirmation = `confirmPublishedAuthority`; release = bound-until-confirmed + one OBSERVED wake. Remaining: the TENTATIVE shape cannot pass `captureConsensusBootstrap` (B6); the release path is unbounded under UNAVAILABLE while user writes flow (R17); P-R3's third clause names a path the manager short-circuits (R18); the `grantConfirmation` writer is unnamed (R19); P6a's open-time assertions are flipped and not superseded (R20). |
| B2 (order inverted; STOP row) | CLOSED | R1-D: order = `withdrawRetiredConsensus :117-128`; crash table matches my own; row completion as step (4) in `retireConsensusCreation :101-103`; "STOP row" withdrawn. One confirm owed at implementation: `deleteRuntimeReplicaServicesRow :164-181` on an absent row must not answer `success: false` (N10). |
| B3 (refusals collapse into one deferral) | CLOSED in shape; shape across the manager->handler seam open | R1-B. `startReplica` reads `.outcome`; driver FAILED carries it; `confirmConsensusBootstrapResult` answers typed. Remaining: the manager returns `{outcome: REFUSED, reason}` but `decideResume :66-69` keys on `answer.outcome` and `RESUME_OUTCOME` is to map the CODES: one shape must be chosen (R21). The journal-side corrupt row has no inventory cell (R22). `CONSENSUS_SERVING_NOT_IMPLEMENTED` must stay the refusal for a forged/mismatched PUBLISHED (P11), not be folded into REFUSED (R21). |
| B4 (inventory owner/dependency) | CLOSED | R1-A: manager = journal half through `recoverPendingOperations`; opening module = `inspectWasmCreationLocal` by path; lifecycle derives path and identity; adapter verb `inspectRetainedCreation`; handler composes and filters by node. Remaining: the adapter verb must exist on the `ServiceTypeAdapter` base and answer typed on the partition/MG adapters (N11); the charter's item 13 still names `inventoryRetainedCreations()` (R23); making `recoverPendingOperations` the production entry point re-runs GENERIC PENDING/IN_PROGRESS rows through their adapters at startup, a consequence the activation quest must know (R23). |
| R1 quorum bound | CLOSED | R1-J. |
| R2 edge row 3 | CLOSED | R1-C 8, R1-D row 2. |
| R3 citations | CLOSED | Revision 1 cites the corrected lines. |
| R4 `storage`/`opening` compared | CLOSED | R1-A seven fields. |
| R5 claim/file gap cell | CLOSED | `ABSENT_CLAIMED`, P-R1b. |
| R6 re-drive emits nothing | CLOSED | R1-E. |
| R7 cells | CLOSED | P-R13, P-R14, P-R11 mutation (the injected wake lands after `ready`, between the memo write and the scheduled re-entry: with the mutation the wake finds no memo -> NO_LOCAL_OPERATION; without it -> RECORDED/wakePending: observable). |
| R8 supersession + UNAVAILABLE class | CLOSED | R1-C 1-2: one catch site; D2' :451-452 superseded; refuse (not HELD) chosen. |
| R9 boot incarnation, P-R2 | CLOSED | R1-F. |
| R10 PENDING wording and REMOVE-then-restart | OPEN, made worse | R1-G terminates the row (B5 below). |
| R11 C9 | CLOSED | P-R10 (three hosts, file-backed DB, kill after a durable observable, SIGKILL recorded, re-form first). Wording nit: "restarts that host ... after re-forming the other two" - all three hosts died with the child; the parent restarts all three directories and re-forms the group. |
| R12 J wake honesty | CLOSED | P-R5. |
| R13 custody witnesses | CLOSED | P-R15 through the ledger path, labelled. |
| R14 one entry point, NOT_READY carrier, fixture refuses before ready | CLOSED | R1-A, R1-H. The reply's owner (handler constants) and its status member are unnamed (N12). |
| R15 by-path reader mode | CLOSED with a precondition to state | `readonly: true` on a WAL file needs an existing or creatable `-shm` (SQLite >= 3.22: creatable only if the directory is writable; the node's own data directory is); the reader must close before `openWasmServiceDatabase` opens read-write (R24). |
| R16 NOT_FOUND after restart; registry pair | CLOSED | P-R8 honest; pair extended. |
| N1-N9 | recorded | R1-J; N5 ruled (CORRUPT_STATE permanent) in R1-B; N7 answered by the host/process labels in R1-I. |

## Part 2. Refutation of the new mechanisms by scenario

### B5 (BLOCKING, NEW MECHANISM; recovery-replay #5, authority-and-recovery "outstanding obligations must not disappear") R1-G terminates a PENDING row before resolving its reservation and orphans an ADMITTED slot

- Evidence: R1-G "A REMOVE of a PENDING creation (`NOT_ADMITTED -> REMOVE_COMPLETED`, RV3.3)
  terminates the row typed (`FAILED`, reason `REMOVED_BEFORE_ADMISSION`, one CAS at the
  manager) so a restart never re-enters a founder the coordinator considers removed."
  `readRetainedCreation :245-265` answers NOT_ADMITTED from the journal alone; it never asks
  the owner whether the reservation applied. RV3.3 :813 recorded exactly this: "a PENDING row
  MAY hide an applied reservation whose reply was lost (F3); the recovery stage's restart scan
  re-reserves idempotently and the planner's RELEASING row then retires the outstanding
  slot". The slot's token lives only in the owner's state row (`reserveResourceState`,
  `service-instance-state.js`); `closeInstanceResource` needs the token
  (`matchesInstanceResourceToken :282`); the lifecycle learns tokens only from
  `admission_json` (`retainedToken :115-131`).
- Scenario (F3 then REMOVE then restart): producer `prepareConsensusCreation` writes the row
  PENDING, `reserveInstanceResource` APPLIES slot 2 for this request, the reply is lost
  (`loseReservation`); row stays PENDING, `admission_json` null. The coordinator issues
  REMOVE: `decideBoundRemoval :365-375` -> NOT_ADMITTED -> REMOVE_COMPLETED and (R1-G) the row
  becomes terminal. Restart: the row is not an inventory entry (terminal). The owner's slot 2
  is ADMITTED under a token no journal row holds. `outstanding(state.retiring)` /
  `publicationRefusal :262-265` holds every later J at PREDECESSOR_OUTSTANDING forever; a
  REMOVE for the replica answers TERMINAL (`retainedRowAnswer :261`) -> REMOVE_FAILED; no owner
  API hands the token back to a retirement.
- Wrong output: an acknowledged obligation (an ADMITTED slot) disappears from every journal
  and memo while it still fences the instance; "no assumed quorum loss, timeout or missing map
  can discharge I" becomes "nothing can discharge I".
- Change: a REMOVE of a PENDING creation resolves the reservation FIRST through the owner
  with the same request (`reserveAndRetain :138-159`, idempotent: HANDOFF "a lost reservation
  response is resolved with the same request"): ADMITTED (applied, or applied now) -> persist
  the token, then retire normally (no file -> `CREATION_STORAGE_MISSING` tombstone -> CLOSED
  allowed -> row COMPLETED by R1-D); a sealed refusal (CONFLICT, STALE_BINDING,
  INVALID_EXPECTED_STATE) -> the slot was never this request's -> terminate the row;
  UNAVAILABLE/UNKNOWN -> REMOVE_HELD (deferral), memo REMOVING, row stays PENDING. The
  termination itself: `VALID_TRANSITIONS :26-30` allows PENDING -> IN_PROGRESS or CANCELLED
  only; "FAILED, one CAS" is an INVALID_TRANSITION (`transitionOperation :138-144`). Use
  CANCELLED (already in `TERMINAL :37` and the scan's exclusion) with the reason in `error`,
  or change the owner's table explicitly (R06/R09). P-R12 becomes: applied-then-lost
  reservation + REMOVE -> token recovered, slot CLOSED, row COMPLETED; never-applied + REMOVE
  -> row CANCELLED, slot untouched; a restart re-enters neither. Mutation: "terminate without
  resolving" reddens (slot stays ADMITTED).
- Readers of PENDING rows after the change, censused: `_readRecoverableOperations :521-543`
  (PENDING + IN_PROGRESS; a CANCELLED row is excluded), `retainedToken :118` (admission null
  requires PENDING, else CORRUPT_STATE - reached only after the TERMINAL check in both
  `continueIntent :178` and `retainedRowAnswer :261`), `prepareConsensusCreation :194-201`
  (the producer's retry of the same intent on a terminal row answers TERMINAL_OPERATION
  through `continueIntent`; the producer must then plan a new creation under a new id - the
  activation quest's planner row, record), `recoverConsensusCreation :221-234` (TERMINAL),
  `claimConsensusCreationOpening :310-312` (requires IN_PROGRESS -> CONTENT_CONFLICT),
  `isConsensusCreationRow :266-269` (unchanged), the handler's `READ_DECISION :46-47`
  (NOT_ADMITTED -> COMPLETED today; after the change NOT_ADMITTED is answered only when the
  owner refused the request). No reader treats a CANCELLED row as live.

### B6 (BLOCKING, NEW SHAPE; owner-interaction #2, R11 one path) `ADMISSION_TENTATIVE` cannot reach the adapter, and the skipped claim is a second source of the opening record

- Evidence: `captureConsensusBootstrap :37-39` `requireInstance(context?.consensusCreation?.outcome === CONSENSUS_BOOTSTRAP.ADMISSION, CONTEXT_REQUIRED)`; it is called by the runtime (`prepareConsensusBootstrap :11`, `startConsensusBootstrap :20`, `retireConsensusBootstrap :42`), the driver (`startBoundReplica :73`, `retireBoundReplica :104`) and the lifecycle (`captureWasmCreation :205-206`), and it REWRITES the origin's outcome to ADMISSION (`:46-47`), so nothing below the manager can ever observe a TENTATIVE marker through `consensusCreation`.
- Scenario (R1-C 1): the manager answers `{outcome: ADMISSION_TENTATIVE, ...}`;
  `continueRetainedCreation :143` continues; `adapter.createReplica(owned)` -> runtime
  `prepareConsensusBootstrap :11` -> CONTEXT_REQUIRED thrown -> `:160-166` ->
  `UNKNOWN{CONSENSUS_CREATION_CONTEXT_REQUIRED}` -> handler deferral. The replica never opens;
  R1-C 2-7 are unreachable as specified. Even with the five sites widened, the opening module
  could not read the marker (rewritten at `:46-47`); it decides on its OWN owner read
  (`resolveWasmCreationAdmission :220`), which is where UNAVAILABLE is observed anyway.
- Change: no new outcome value. The manager answers `ADMISSION_RETAINED` with the phase it
  observed (`resolveRetainedAdmission :172-173` already carries `phase`): `phase: UNAVAILABLE`
  for the UNAVAILABLE class. Every capture site is untouched; the opening module decides on its
  own read, as R1-C 2 says it does. (Precedent: PUBLISHED_UNPROJECTED is a status on an
  ADMISSION-class answer, not a new admission outcome.)
- Second half, the skipped claim (R1-C 2 "the opening claim is skipped (a PUBLISHED record
  proves the first use was claimed)"): `replica.creationOpening` is set only by the claim
  (`:232`); `openWasmServiceDatabase :180, :191` (RETAINED => `fileMustExist`),
  `openWasmCreationRecords :275` (FRESH vs RETAINED) and `wasmCreationLocalIdentity :198`
  (the `opening` identity field) all read it. Skipping the claim means synthesising
  `creationOpening` from a second source (the inventory entry's `opening_json`, carried down
  through the handler and the re-entry context), i.e. two paths to one record. And the claim
  on an already-claimed row is a journal READ, not a write (`:314-317` returns RETAINED before
  any write), so it does not depend on the metadata owner: there is nothing to skip. Change:
  keep the claim; drop the clause. `requireDependencies :60-66` checks that the owner's
  methods exist, not that they answer, so it passes under UNAVAILABLE.

### R1-C release path, attacked

- HELD-after-reopen (owner reachable, re-entry before re-formation): open ->
  `openServingState(PUBLISHED, PUBLISHED)` -> SERVING; bound (new rule); the handler's START
  runs now -> `progressWasmCreationGenesis :41-61` HELD (no committed stamp yet) ->
  `boundStartResult :110-115` HELD -> memo HELD. Formation -> ROLE/APPLIED_PROGRESS event ->
  run -> OBSERVED -> `publishWasmCreation` -> `resolveGrant :32-40` SAME -> PUBLISHED ->
  `recordLocalGrant` ALREADY -> `enableServing` false (already SERVING) -> GRANTED, `flipped`
  false -> (new predicate) one OBSERVED wake because the instance reopened RETAINED and is not
  yet confirmed in this process -> `retireNativeWakes :110-116` unbinds in the same run ->
  `consumeCreationWake :344-347` -> HELD memo -> `scheduleBoundReentry` -> resume -> owner
  PUBLISHED -> `createReplica :230` returns the live instance -> `startReplica` -> READY no-op
  -> `continueBoundStart` -> waited run -> PUBLISHED -> `confirmPublishedAuthority` CONFIRMED
  -> projection -> ACTIVE. Exactly one wake: the unbind is synchronous inside the confirming
  run; a START that itself confirms is waited and fires none. HOLDS, provided the latch is a
  per-instance "confirmed in this process" flag (R19) and `admitsNativeWake :44-46` admits
  SERVING instances until it is set.
- UNCONFIRMED (owner UNAVAILABLE at open): open -> SERVING UNCONFIRMED; bound. Events -> run
  -> OBSERVED -> grant UNAVAILABLE -> `held()` -> `publish :92-94` fires a
  `CREATION_GRANT_HELD` wake (not waited) -> handler `findWakeTarget` HELD memo ->
  `scheduleBoundReentry` -> resume (journal read, policy, owner read) -> phase UNAVAILABLE ->
  adapter -> live instance -> waited run (genesis read + grant attempt again) ->
  PUBLISHED_UNCONFIRMED -> UNRESOLVED -> HELD memo. A SERVING replica ADMITS user writes
  (`isServing :64-66`), and every committed write emits APPLIED_PROGRESS (`WAKE_EVENTS
  :20-23`), so while the owner is down the system runs two keyed runs, one GRANT_HELD wake, one
  journal read and two owner reads PER COMMITTED USER WRITE, with no bound. R1-C 7's "no loop,
  no timer: progress is event-driven" is true and is the problem: the event is the
  replica's own traffic. N16 unbound SERVING replicas for exactly this reason. Classification:
  NEW SHAPE (retry-loops #5, owner-interaction #5). Change (R17): while an instance is
  SERVING and unconfirmed, admit only the formation events (LEADER, FOLLOWER, CANDIDATE,
  LEADER_CHANGE, TERM_CHANGE), never APPLIED_PROGRESS; and a GRANT_HELD wake whose grant
  outcome is UNAVAILABLE must not re-enter the handler immediately (either the lifecycle does
  not fire it for an already-serving instance, or the handler records it without scheduling).
  Witness: N user writes under UNAVAILABLE -> a bounded number of runs/re-entries (P-R3c);
  mutation "APPLIED_PROGRESS admitted while unconfirmed" reddens.
- "owner later RELEASING at the re-entry -> CONTRADICTED -> retired by creation" (P-R3, third
  clause): the re-entry never reaches `confirmPublishedAuthority`: `resolveRetainedAdmission
  :171` answers RESOURCE_CLOSED for RELEASING/CLOSED and `continueRetainedCreation :143`
  returns before the adapter; the handler writes a permanent FAILED memo. The live UNCONFIRMED
  replica keeps serving (B1 permits: "may serve until its exact local closure") until the
  coordinator's REMOVE, which finds the live instance (`retiringTarget :50-54`) and retires
  it. CONTRADICTED is reached only when the owner answers ADMITTED with a non-PUBLISHED
  phase for the exact token at the manager's confirm. Correct P-R3's expectation (R18) and
  state that the lifecycle's own run on a RELEASING slot answers GRANT_HELD(RESOURCE_CLOSED)
  with no self-retirement (as stage 1 decided).
- "metadata ADMITTED + local PUBLISHED refused CORRUPT_STATE": supersession recorded; the
  REMOVE path works (`tombstoneByPath` RETIRED; CLOSED from ADMITTED allowed). HOLDS.
- B1 :164-165 "Prior ADMITTED-only local state permits bootstrap recovery but no protected
  serving until the grant is resolved" vs R1-C 2 "any other local answer -> the typed
  UNAVAILABLE refusal": with the owner unreachable, a HELD reopen (no serving) is what the
  contract permits and what formation liveness needs (two ADMITTED founders that cannot
  reopen leave the one UNCONFIRMED founder without a quorum). The refusal is safe but
  narrower than the contract. Either honour the clause (local ADMITTED + UNAVAILABLE -> open
  HELD, `bind()`, no grant until the owner answers) or record the deviation with the owner's
  reason (R25).
- "any other local answer -> UNAVAILABLE" also mislabels CORRUPT_STATE / CONTENT_CONFLICT /
  ABSENT_CLAIMED / RETIRED under an unreachable owner: those are their own permanent codes
  (B4 distinctness), not UNAVAILABLE (R26).

### R1-A inventory, attacked

- Journal-side corrupt rows: `journaledIntent :207-220` (undecodable or mismatched
  `intent_json`) and `retainedToken :115-131` (admission on a PENDING row, token mismatch)
  THROW CORRUPT_STATE/CONTENT_CONFLICT. The INVENTORIED entry vocabulary has no cell for
  them; a throw inside `recoverPendingOperations`'s loop (`:320-328`) would abort the whole
  scan. Add a typed journal-side cell (`JOURNAL_CORRUPT` with the code; no replica id may be
  derivable, so: log, no memo, the row stays for an operator) and keep the loop total (R22).
- Local-half cross product: (file present, zero tables, `opening === null`) is a legitimate
  FRESH precondition (`openWasmCreationRecords :276` requires zero tables) -> classify
  ABSENT_UNCLAIMED, say so; (file present with tables, `opening === null`) cannot arise from
  this node (the claim precedes the file) -> CONTENT_CONFLICT. State the full table (N13).
- The by-path reader runs three reads of one file before the real open (inventory, R1-C 2's
  pre-open read, `openWasmCreationRecords`). Single writer (this node's lifecycle; no live
  instance before the open, `createReplica :238-241`), so the TOCTOU is benign; a REMOVE
  racing the re-entry (P-R14) tombstones by path between reads and the open then refuses
  `CREATION_RETIRED` typed. HOLDS; say it.
- `readonly: true` precondition and close-before-open (R24).

### R1-B flow, attacked

- Manager -> handler shape: R1-B says the manager returns `{outcome: CONSENSUS_BOOTSTRAP.REFUSED, reason}` and the handler's `RESUME_OUTCOME` maps the codes. `decideResume :66-69` keys on `answer.outcome` first (`RESUME_STATUS.get(status) ?? RESUME_OUTCOME.get(outcome) ?? FAILED`) and `resumeCode :71-73` reads `reason ?? outcome`. With `outcome: REFUSED`, every refusal is the catch-all FAILED permanent with the right code - UNAVAILABLE included, which R1-B wants as a deferral. One shape (R08): either the manager returns `{outcome: <code>}` (then `RESUME_OUTCOME` maps UNAVAILABLE -> DEFERRED as today and the permanent codes fall to FAILED), or `decideResume` consults `reason` when `outcome === REFUSED`. Choose and cite (R21).
- `confirmConsensusBootstrapResult :60-66` is called twice per re-entry: runtime
  `startConsensusBootstrap :27` and manager `continueRetainedCreation :152`. Returning a typed
  REFUSED from the function covers both only if the runtime passes it through unchanged (it
  does: `:28` returns anything not PUBLISHED) and the manager's `:158` returns it (it does for
  non-serving statuses). HOLDS. But a PUBLISHED-class result with a binding/token digest
  mismatch (A-B5, P11) must still be refused with its own reason, never silently become
  `REFUSED{reason: undefined}`; keep `CONSENSUS_SERVING_NOT_IMPLEMENTED`/CONTENT_CONFLICT for
  that branch (R21).

### R1-D, R1-E, R1-F, R1-H

- R1-D: holds against the source; `retireConsensusCreation :101-103` runs after
  `withdrawRetiredConsensus` returned, so the STOPPED projection precedes the row CAS. N10 on
  the absent-row delete answer.
- R1-E: holds. The REMOVED branch of `handleRemoveReplica :645-657` answers the reply only (no
  outcome), existing stage-1c behaviour: a coordinator REMOVE arriving after the restart
  re-drive settles gets a COMPLETED reply and no REMOVE_COMPLETED outcome. Say it is unchanged
  (N12).
- R1-F: holds.
- R1-H: holds. Name the NOT_READY reply's owner and member (handler constants /
  `ReplicaOperationResponseStatus`) (N12).

### Owner uniqueness, rechecked

- Local permission: opening module (R1-C 2) - one site, once B6's shape fix lands.
- Admission pass-through: manager (phase, no decision) - one site.
- Serving state and `grantConfirmation`: serving-state module; the WRITER of CONFIRMED must be
  named: the publication run on GRANTED (the lifecycle's own grant CAS answered PUBLISHED),
  consumed by `boundStartResult` to answer PUBLISHED; the manager's `confirmPublishedAuthority`
  confirms the OPERATION (A-B5), not the replica's state. Two observations, two questions, as
  stage 1 already has (D1'/D7'); state it so no second writer appears (R19).
- Confirmation of the operation: `confirmPublishedAuthority` - one site.
- Inventory: manager (journal), opening module via lifecycle (local), handler (compose,
  filter) - one site each.
- Opening record: the claim - one source once B6's second half is dropped.
- Row termination: manager - one site, after the owner resolution (B5).

## Part 3. Proof plan

- P-R3 third clause corrected (R18); P-R3c storm bound (R17); P-R12 rewritten for B5; P-R2
  must also assert the endpoint row's `incarnation` equals the new boot incarnation (R1-F says
  it; the witness line does not).
- P6a (`wasm-creation-publication.integration.test.js:536-558`) asserts at `:550`
  `reopened.replica.creationReconciliation.subscriptions.length === 0` right after a RETAINED
  reopen that opened SERVING, and `:553` `wakes.length === 0`. Under R1-C 7 a SERVING reopen
  stays BOUND until the first confirming run, so `:550` is red at that instant unless the
  START's own (waited) run confirmed first and unbound; the wake count stays 0 only because the
  START is waited. Supersede by appending (R21 of rules): assert subscriptions > 0 at open and
  0 after the confirming START, wakes 0 for a waited confirmation (R20). Also P13's F-M1
  assertion (subscriptions > 0 while held) is unaffected.
- Mutations present and killing: inventory reads metadata; scan id; memo after re-entry;
  UNCONFIRMED treated as CONFIRMED (P-R3 first clause: CREATE_FAILED+deferRetry vs
  CREATE_HELD); UNCONFIRMED for ADMITTED (P-R3b); row completed at PUBLISHED; CLOSED redo
  skipped; tombstone inferred; five-field identity; node filter removed; subscriptions
  unbound at reopen / wake suppressed (P-R2); REMOVE outcome emitted by the re-drive; PENDING
  left PENDING. Add: "APPLIED_PROGRESS admitted while unconfirmed" (P-R3c); "terminate the
  PENDING row without resolving the reservation" (P-R12); "TENTATIVE as a new outcome"
  (P-R3: CONTEXT_REQUIRED deferral instead of serving).

---

## Required changes

Blocking:

- B5 A REMOVE of a PENDING creation resolves the reservation with the same request before any
  row termination; ADMITTED -> token persisted, normal retirement, row COMPLETED; sealed
  refusal -> row CANCELLED (PENDING -> FAILED is not an allowed transition) with the reason;
  UNAVAILABLE/UNKNOWN -> REMOVE_HELD, row PENDING. P-R12 rewritten; mutation added.
- B6 No `ADMISSION_TENTATIVE` outcome: the manager answers ADMISSION_RETAINED with
  `phase: UNAVAILABLE`; the opening module decides on its own owner read; the opening claim
  is NOT skipped (it is a journal read on a claimed row).

Required with the revision:

- R17 Bound the unconfirmed window: admit only formation events while SERVING-unconfirmed;
  no immediate re-entry on a GRANT_HELD(UNAVAILABLE) wake for a serving instance; witness
  P-R3c.
- R18 P-R3 third clause: RESOURCE_CLOSED at `resolveRetainedAdmission :171` -> permanent FAILED
  memo, the live replica serves until the REMOVE; CONTRADICTED is the manager's confirm
  branch only.
- R19 Name the `grantConfirmation` writer (publication run on GRANTED) and the per-instance
  "confirmed in this process" latch `admitsNativeWake` consults.
- R20 Supersede P6a `:550`/`:553` by appending; name any other witness that asserts
  `subscriptions.length === 0` at a SERVING open.
- R21 One manager->handler refusal shape (outcome = code, or `decideResume` reads `reason`
  under REFUSED); keep the forged/mismatched PUBLISHED refusal distinct.
- R22 Journal-side corrupt-row cell; the scan loop stays total.
- R23 Re-point charter item 13 to `recoverPendingOperations` and record that the production
  call re-runs generic PENDING/IN_PROGRESS rows through their adapters at startup.
- R24 `readonly: true` precondition (writable directory or existing `-shm`) and
  close-before-open for the by-path reader.
- R25 B1 :164-165: honour the HELD reopen under UNAVAILABLE for local ADMITTED, or record the
  deviation.
- R26 Under an unreachable owner, CORRUPT_STATE / CONTENT_CONFLICT / ABSENT_CLAIMED / RETIRED
  answer their own permanent codes, not UNAVAILABLE.
- R27 P-R10 wording (all three directories restart in the parent); P-R2 asserts the endpoint
  row's incarnation.

Recorded:

- N10 Confirm `deleteRuntimeReplicaServicesRow` on an absent row does not answer
  `success: false` (R1-D crash row 5 depends on it).
- N11 `inspectRetainedCreation` is a new verb on the `ServiceTypeAdapter` base; the partition
  and message-group adapters answer typed unsupported.
- N12 NOT_READY's owner/member; the REMOVED branch answers a reply without an outcome
  (unchanged stage-1c behaviour).
- N13 The full (opening, file) classification table for the by-path reader.

What the implementer must not do from Revision 1: do not introduce `ADMISSION_TENTATIVE` as
an outcome value; do not skip the opening claim; do not terminate a PENDING row without
resolving its reservation through the owner; do not write PENDING -> FAILED through
`transitionOperation`; do not admit APPLIED_PROGRESS wakes on a serving unconfirmed instance;
do not expect CONTRADICTED retirement at a re-entry that the manager answers RESOURCE_CLOSED.

This is the vet's verdict only; nothing is reported done on the lead's behalf.
