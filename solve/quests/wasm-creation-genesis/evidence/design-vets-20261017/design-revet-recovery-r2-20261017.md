# Design re-vet R2: Revision 2 of RECOVERY-DESIGN-20261017

Subject: `solve/quests/wasm-creation-genesis/RECOVERY-DESIGN-20261017.md` lines 568-749
("Revision 2") in `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`
at `381750de2` (file untracked; `src/`/`test/` clean; charter item 13 re-pointed in the
working tree). Read-only; nothing touched; no lab. Every `file:line` re-read from this tree or
carried from the two earlier vets on the same tree. Sealed bar applied; retry-loops once, out
of bar (R2-D is a re-drive filter).

Read this round: Revision 2 in full; the charter diff; `service-instance-state.js:218-246`
(`reserveResourceState`); the consumer census of `confirmConsensusBootstrapResult`
(`service-runtime-consensus-bootstrap.js:27`, `service-consensus-bootstrap.js:152`) and the
witnesses that pin its shape (`test/node/runtime-service-bound-route.test.js:234-314`,
`test/wasm-service/wasm-creation-publication.integration.test.js:675`). Withheld: nothing new.

## Verdict: REVISE (new blocking B7; required R28-R33; recorded N14-N15)

B5 and B6 are closed by R2-A and R2-B as mechanisms. R2-D closes the storm (R17) but
starves the confirmation it exists to deliver: the metadata owner's return is not a raft
event, a settled group emits no formation events, APPLIED_PROGRESS is filtered and the
GRANT_HELD wake is recorded without re-entry, so an unconfirmed replica whose owner comes back
after formation never confirms in this scope (B7). R2-E's "the code IS the outcome" makes the
open-time UNAVAILABLE collide with the pre-retained UNROUTED row of the handler's table (R28)
and, through R1-B's `cause.outcome ?? cause.code`, lets transient lifecycle codes through as
permanent refusals unless the set is closed (R29). The rest is precision.

---

## Part 1. Disposition

| Id | Disposition | Clause / reason |
| --- | --- | --- |
| B5 orphaned reservation | CLOSED | R2-A resolves first through `reserveAndRetain :138-159`; CANCELLED on a sealed refusal (PENDING -> CANCELLED allowed, `VALID_TRANSITIONS :26-30`); REMOVE_HELD on UNAVAILABLE/UNKNOWN; reader census carried. Precisions R30-R32. |
| B6 TENTATIVE / skipped claim | CLOSED | R2-B: ADMISSION_RETAINED with `phase: UNAVAILABLE`; the opening module decides on its own read (`:220`); the claim stays the one source of `creationOpening`. |
| R17 storm bound | CLOSED as a bound, but the filter starves | -> B7. |
| R18 P-R3 third clause | CLOSED | R2-H; P-R3d for the CONTRADICTED branch. |
| R19 `grantConfirmation` writer / latch | CLOSED | R2-D: publication run on GRANTED; latch consulted by `admitsNativeWake`. |
| R20 P6a supersession | CLOSED | R2-H, by appending, with the census owed at landing. |
| R21 one refusal shape | PARTLY | Shape chosen (code as outcome); UNAVAILABLE lands on the wrong decision row (R28); the code set is not closed (R29). |
| R22 journal-side corrupt cell | CLOSED, one split owed | R2-E typed INVENTORIED entry, total loop; an intent-undecodable row has no replica id to re-enter (R33). |
| R23 charter re-point + generic-row consequence | CLOSED | Charter diff lines 87-99 name `recoverPendingOperations`, the INVENTORIED entries, the generic re-run decision, the journal reader and the sweep. |
| R24 readonly precondition / close-before-open | CLOSED | R2-F. |
| R25 HELD reopen under UNAVAILABLE | CLOSED, B1-safe (analysis below) | R2-C row ADMITTED. N14 records the HELD-raft-leader degradation. |
| R26 own permanent codes under an unreachable owner | CLOSED | R2-C table. |
| R27 P-R10 wording, P-R2 incarnation | CLOSED | R2-H. |
| N10 absent-row delete | recorded | implementer verifies; a finding if `success: false`. |
| N11 adapter base verb | CLOSED | R2-F typed UNSUPPORTED on partition/MG adapters. |
| N12 NOT_READY owner/member; REMOVED reply-only | CLOSED | R2-F. |
| N13 (opening, file) table | CLOSED | R2-C. |

## Part 2. The four attacks

### R2-A: reservation-first REMOVE on a PENDING row

- "Is applying the reservation now 'the same request'?" Yes, by the owner's own rule.
  `reserveResourceState :218-246` is slot-indexed by the request (`instance.resources[request.slot]`):
  the same `operationId` at the same ordinal answers the recorded state (`:218-223`,
  idempotent); a different operation at that ordinal answers CONFLICT with the winner token;
  a selection moved -> STALE_BINDING; a wrong expected ordinal or a non-CLOSED slot ->
  INVALID_EXPECTED_STATE; the same replica already holding another non-CLOSED slot ->
  TARGET_ALREADY_OWNED. It never allocates a different slot. A never-applied reservation
  applied now occupies exactly the slot and ordinal the producer asked for (`expectedOrdinal`
  0 -> ordinal 1). Acceptable: this is HANDOFF's "a lost reservation response is resolved with
  the same request", and the ordinal cost (the slot ends CLOSED at ordinal 1; a later attempt
  on it uses ordinal 2) is the sealed monotonic rule, not a leak.
- "Who then retires it?" The same REMOVE, in the same pass: token persisted -> `retireConsensusCreation
  :92-110` -> `retireWasmCreation :145-159` -> no live instance -> `tombstoneByPath :77-87`
  -> `fs.existsSync` false -> `CREATION_STORAGE_MISSING` (DURABLE, `RETIRED_LOCALLY :25-26`)
  -> `closeRetired :128-137` CLOSED -> wake -> STOPPED (services row absent: N10) -> row
  COMPLETED (R1-D step 4). HOLDS.
- Crash window inside R2-A (NEW, recorded, witness owed): token persisted, crash before
  CLOSED. Durable facts: row IN_PROGRESS with admission, `opening_json` null, no file, slot
  ADMITTED; the REMOVING memo is volatile. Restart: the by-path reader answers
  `ABSENT_UNCLAIMED` (R2-C) -> CREATE re-entry -> FRESH open (claim, file) -> HELD founder for a
  replica the coordinator is removing. Indistinguishable, from durable facts, from a founder
  that never received its CREATE; the design cannot and should not guess. The owned
  continuation is the coordinator's REMOVE retry (its REMOVE workflow never received
  REMOVE_COMPLETED), which finds the HELD named memo and retires through the bound REMOVE.
  State it, and add P-R12c (REMOVE on PENDING, crash after the token write, restart, re-REMOVE
  retires). -> R32.
- Repeated REMOVE after CANCELLED: `readRetainedCreation :245-265` answers TERMINAL_OPERATION;
  the handler's `READ_DECISION :46-47` maps TERMINAL to FAILED -> REMOVE_FAILED for a
  creation the previous REMOVE legitimately cancelled. The first vet's TERMINAL-with-row-state
  amendment covers COMPLETED and FAILED; add CANCELLED -> REMOVE_COMPLETED (idempotent: the
  cancellation IS the removal). -> R30.
- Surface: `reserveAndRetain` is module-private and the REMOVE path must call it WITHOUT
  `_enforceRuntimePolicy` (RV2.1's reason for the journal-only read); a manager method for the
  REMOVE-time resolution is a surface to create and is unnamed. -> R31.

### R2-C: HELD reopen of ADMITTED founders under an unreachable owner

- "Can two ADMITTED reopened founders plus one unconfirmed founder form and serve while the
  owner is down?" Form: yes. Membership is in each replica's synced raft record
  (`raft-rs-durable-store.js:13-23`); formation needs no metadata read. Serve: only the
  unconfirmed founder admits user work (`isServing :64-66`); the two HELD founders admit
  genesis commands only (`boundProposalAdmission :132-136`) and refuse reads/writes typed
  (`servingRefusal :119-123`), while APPLYING what the leader commits (apply does not consult
  serving). This is the stage-1 steady state during publication: founders publish
  independently (D1' per replica); a PUBLISHED leader serves while followers are still HELD.
- "Is that B1-safe?" Yes. Serving permission is per resource slot; the unconfirmed founder
  holds a durable local grant (B1 :156-159); the HELD founders hold none and serve nothing
  ("permits bootstrap recovery but no protected serving", :164-165). When the owner returns,
  the HELD founders' grants are decided by the owner (STALE_BINDING / PREDECESSOR_OUTSTANDING
  / RESOURCE_CLOSED / PUBLISHED, `publicationRefusal :262-265`): owner-fenced, never local.
- Degradation to record (N14): if a HELD founder wins the election, the unconfirmed founder
  is a follower; writes forwarded to the HELD leader are refused typed (bootstrap admission),
  the HELD leader runs no leader effects (`onBecameLeader :558-565` gated by `serving`: no
  safety broadcasts, no timers), so the unconfirmed follower serves local reads only until the
  owner returns. Safe, degraded, typed. Say it.
- The HELD reopen needs the claim (a journal read on a claimed row, `:314-317`) and the
  RETAINED file (`openWasmServiceDatabase :180-191`): both independent of the metadata owner.
  HOLDS.

### R2-D: the formation-event filter

- "Does a formation event always follow a committed write so that confirmation is not
  starved?" NO. Two starvations:
  1. The unconfirmed case. The owner's return is not a raft event. Formation emits
     LEADER/FOLLOWER/CANDIDATE once per replica at election (and TERM_CHANGE/LEADER_CHANGE on
     a change); a settled group with a stable leader emits none of them. With the owner down
     through formation, the one formation run answers UNAVAILABLE -> HELD; thereafter
     APPLIED_PROGRESS is filtered, the GRANT_HELD(UNAVAILABLE) wake is RECORDED without
     re-entry (R2-D), there is no cadence (contract :143), and in production the planner sees
     "slot PUBLISHED + row present -> satisfied" and dispatches nothing (activation design item
     3). When the owner returns, nothing confirms. R2-D's "the next formation event or the
     coordinator's dispatch re-enters" names no event that will occur and a dispatch that the
     planner does not make; the held-CREATE budget (charter item 6, B9) is the activation
     quest's and is absent from the embedding. P-R3's "owner later PUBLISHED + one wake ->
     CONFIRMED" is unreachable except by an explicit test re-entry, which P-R3 does not say.
  2. The HELD-after-RETAINED-reopen case, APPLICATION_NOT_COVERED sub-case. `observeMembership
     :53-55` answers HELD while `stamp.appliedIndex < receipt.index`. After a process loss the
     applied progress is recomputed by replaying the synced log at port open
     (`raft-rs-durable-store.js:21-23`); if the handler's START (or the election's role
     event) runs before replay has covered the INIT index, the run answers HELD and the event
     that completes it is APPLIED_PROGRESS, which the filter drops. Nothing proves the role
     event follows replay.
- Classification: NEW SHAPE (owner-interaction #6 wake/release path; authority-and-recovery
  "fail-closed without an owned continuation is not completion"). BLOCKING -> B7.
- Change that keeps the storm bound and uses only existing owners: (a) filter APPLIED_PROGRESS
  only when genesis is already OBSERVED on this instance in this process and the sole missing
  fact is the owner's answer (the unconfirmed window); admit it while genesis is not yet
  observed (the HELD-after-reopen window: APPLIED_PROGRESS is exactly the event that completes
  genesis). (b) For the unconfirmed window, give the owner's return an owned trigger without a
  timer: admit every K-th APPLIED_PROGRESS (K a named constant at the reconciliation owner,
  `wasm-creation-reconciliation.js`, R06), so cost is one genesis read + one grant attempt per
  K committed writes while the owner is down and zero once confirmed; the confirming run
  fires its one OBSERVED wake as R2-D says. (c) Record the production cadence (B9 held-CREATE
  budget) as the activation quest's second trigger. (d) P-R3c then asserts: N writes -> at
  most ceil(N/K) runs, zero handler re-entries, zero journal reads; P-R3 asserts the owner's
  return is observed within K writes with no explicit re-entry; mutation "K-th trigger
  removed" reddens P-R3 (starved), mutation "filter removed" reddens P-R3c.

### R2-E: `{outcome: <code>}` against every consumer of `confirmConsensusBootstrapResult`

- Consumers: runtime `startConsensusBootstrap :27-28` (`if (confirmed.status !== PUBLISHED)
  return confirmed;`: passes an outcome-only answer through, HOLDS); manager
  `continueRetainedCreation :152-158` (`!SERVING_STATUSES.has(confirmed.status)` -> return:
  HOLDS); the manager's catch `:160-166` no longer sees these codes as throws (intended). The
  handler's `decideResume :66-69`: permanent codes -> not in `RESUME_STATUS`/`RESUME_OUTCOME`
  -> FAILED permanent, `settleCreation :105-130` names the memo (`names: true` because `kind
  !== UNROUTED`): HOLDS for STORAGE_MISSING, CORRUPT_STATE, CONTENT_CONFLICT, RESOURCE_CLOSED,
  CREATION_RETIRED.
- UNAVAILABLE collides (R28). `RESUME_OUTCOME :43-44` maps `UNAVAILABLE -> UNROUTED` (the
  journal-read unavailability of a creation the manager could not read, RV2.2 step 3). An
  open-time `{outcome: UNAVAILABLE}` (R2-C ABSENT_UNCLAIMED under a down owner, or any
  owner-read failure at `resolveWasmCreationAdmission :220`) is decided UNROUTED:
  `routeRuntimeServiceCreate :186-191` then classifies the `service_definitions` row
  (`resolveServiceDefinition`, a cache read the bound route was designed not to depend on),
  settles NAMELESS (`names: false`) and, for a non-bound-class row, would take the GENERIC
  create path for a creation the manager had just retained. In the embedding the row is
  bound-class, so the visible effect is: memo untouched by RV5.2 (custody survives) but the
  outcome is the UNROUTED deferral, `retainedAnswer` false, and the route's own invariant
  "routing keys on the journal; only the refusal class keys on the row" is broken for a
  retained creation. Witnesses pinning today's two rows: `runtime-service-bound-route.test.js:234-243`
  (UNKNOWN after retention -> deferral, errorCode CONSENSUS_SERVING_NOT_IMPLEMENTED) and
  `:277-282, :311-314` (journal read fault -> deferral, errorCode UNAVAILABLE). Change: the
  retained-but-unavailable answer must be a DIFFERENT value from the pre-retained UNAVAILABLE
  at the `decideResume` seam: either keep the existing `UNKNOWN{reason: UNAVAILABLE}` wrapper
  for the post-retained class (so R2-E's "no wrapper" has one named exception and `:243`'s
  row keeps meaning "retained, deferred"), or add the open-time code to `RESUME_OUTCOME` as
  DEFERRED under a distinct name. Either way the memo must be written NAMED (deferRetry) as
  RV3.2/RV7.1 require.
- The code set must be closed (R29). R1-B's `startReplica :378-381` reads `cause.outcome ??
  cause.code`; `lifecycleRefusal :86-91` sets `.code` for REPLICA_LIVE, REPLICA_RETIRED,
  STOPPED_DURING_START, and `resolveStartRefusal :506-521` yields MODULE_UNAVAILABLE /
  PORT_ALLOCATOR_UNAVAILABLE. Those are transient (RV3.3 keeps them under
  `UNKNOWN{CONSENSUS_SERVING_NOT_IMPLEMENTED}` -> deferral). If the driver carries any
  `.code` as `outcome` and `confirmConsensusBootstrapResult` passes any outcome through, a
  retire-in-flight successor fence becomes a PERMANENT FAILED memo. R2-E lists six codes;
  make the function whitelist exactly those (the opening module's `ServiceInstanceContractError.outcome`
  values plus `CREATION_RETIRED`), and keep every other FAILED on today's throw. Witnesses
  `:243` and `wasm-creation-publication.integration.test.js:675` (reason
  CONSENSUS_SERVING_NOT_IMPLEMENTED) then stand unchanged; a new witness drives one transient
  code (REPLICA_LIVE) through and asserts the deferral.
- Journal-side corrupt entries (R33): `{status: INVENTORIED, operationId, outcome:
  CORRUPT_STATE | CONTENT_CONFLICT}` carries no intent when `journaledIntent :207-220` threw,
  hence no `replicaId`/`entityId` for `scheduleBoundReentry :141-149`; "such an entry's
  re-entry answers the permanent code" is impossible for that half. Split: intent undecodable
  -> no re-entry, no memo, a typed log line and the row left for an operator; admission
  corrupt with a decodable intent (`retainedToken :115-131`) -> re-entry ->
  `recoverConsensusCreation` -> `instanceFailure` -> `{outcome: CORRUPT_STATE}` -> permanent
  named memo, as R2-E says.

## Part 3. Owner uniqueness, rechecked

Unchanged from the R1 re-vet, with the two Revision 2 moves confirmed: the admission
pass-through carries a phase and decides nothing; the opening module is the one local
decision site (R2-B, R2-C); `grantConfirmation`'s writer is the publication run; operation
confirmation stays at `confirmPublishedAuthority :114-137`; the claim is one source. New
single-owner items: the REMOVE-time reservation resolution is the manager's (R31, one method,
no policy); the K-th trigger constant is the reconciliation owner's (B7).

## Part 4. Proof plan

- P-R3 and P-R3c re-specified per B7 (owner's return observed within K writes without an
  explicit re-entry; mutations "K-th trigger removed", "filter removed").
- P-R12c (R2-A crash window) added (R32); repeated REMOVE after CANCELLED answers
  REMOVE_COMPLETED (R30).
- R2-E witnesses: one transient lifecycle code stays a deferral (R29); the open-time
  UNAVAILABLE deferral is NAMED and distinct from the journal-read deferral (R28);
  `runtime-service-bound-route.test.js:243, :282, :314` and
  `wasm-creation-publication.integration.test.js:675` stand (N15).
- Everything else in R2-H stands as written.

---

## Required changes

Blocking:

- B7 The unconfirmed window must have an owned, timer-free continuation when the owner
  returns after formation settled: filter APPLIED_PROGRESS only once genesis is OBSERVED in
  this process; admit every K-th APPLIED_PROGRESS while unconfirmed (K at the reconciliation
  owner); record B9 as the production trigger; re-specify P-R3/P-R3c and their mutations.

Required with the revision:

- R28 The post-retained UNAVAILABLE (open-time owner read) must not land on `RESUME_OUTCOME`'s
  UNROUTED row: one named exception to "no wrapper" (keep `UNKNOWN{reason: UNAVAILABLE}` for
  it) or a distinct DEFERRED member; the memo is written named with `deferRetry`.
- R29 `confirmConsensusBootstrapResult` whitelists exactly the six codes; every other driver
  FAILED keeps today's `CONSENSUS_SERVING_NOT_IMPLEMENTED` refusal; witness a transient
  lifecycle code.
- R30 TERMINAL-with-row-state: CANCELLED -> REMOVE_COMPLETED on a repeated REMOVE.
- R31 Name the manager method that resolves a PENDING row's reservation at REMOVE time without
  `_enforceRuntimePolicy`.
- R32 State the R2-A crash window (token persisted, crash before CLOSED -> restart re-enters
  HELD by FRESH open -> the coordinator's REMOVE retry retires); add P-R12c.
- R33 Split the journal-corrupt entry: intent undecodable -> typed log, no re-entry; admission
  corrupt -> re-entry -> permanent code.

Recorded:

- N14 Under an unreachable owner a HELD founder may win the election; the unconfirmed
  follower then serves reads only, forwarded writes are refused typed, no leader effects run
  until a grant lands. Safe, degraded, typed.
- N15 Witnesses `runtime-service-bound-route.test.js:243, :282, :314` and
  `wasm-creation-publication.integration.test.js:675` pin the two existing refusal rows and
  stand under R28/R29.

What the implementer must not do from Revision 2: do not filter APPLIED_PROGRESS before
genesis is observed on the instance; do not leave the unconfirmed window with no trigger but a
formation event; do not let an open-time UNAVAILABLE reach `decideResume` as the pre-retained
UNAVAILABLE; do not pass any `.code` the lifecycle sets (REPLICA_LIVE, STOPPED_DURING_START,
module/port refusals) through as a permanent outcome; do not answer REMOVE_FAILED for a
repeated REMOVE of a CANCELLED row.

This is the vet's verdict only; nothing is reported done on the lead's behalf.
