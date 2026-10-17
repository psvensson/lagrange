# Design re-vet R4: Revision 4 of RECOVERY-DESIGN-20261017

Subject: `solve/quests/wasm-creation-genesis/RECOVERY-DESIGN-20261017.md` lines 883-957
("Revision 4") in `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016`
at `381750de2` (file untracked; `src/`/`test/` clean). Read-only; nothing touched; no lab.
Every `file:line` re-read from this tree or carried from the four earlier vets on the same
tree. Sealed bar applied.

Read this round: Revision 4 in full; the committed witnesses that Revisions 1-4 change the
answer of, censused by grep and read in place: `test/node/runtime-service-bound-route.test.js:338-353`
(wake reason OBSERVED -> QUEUED/RECORDED), `test/service/service-consensus-creation-intent.test.js:113-126,
:222-230, :232-239`, and the absence of any handler-level GRANT_HELD wake witness
(`test/node`, `test/runtime`: none; the publication fixture's consumer
`wasm-retained-bootstrap-fixture.js:69` is the only GRANT_HELD consumer and is unaffected).
Withheld: nothing new.

## Verdict: REVISE (record-only; one required supersession list, R37; recorded N19-N21). No mechanism finding remains.

R34, R35 and R36 are closed by R4-A, R4-B and R4-C as mechanisms; N16-N18 are recorded. What
remains is a record gap of the class the stage-1 re-vet called N1: three committed witnesses
in `test/service/service-consensus-creation-intent.test.js` pin today's restart-scan and
recover answers, Revisions 1 and 2 change those answers, and no revision names them. Rule R09
("supersede explicitly and record why") and R21 (append, never rewrite) require the design to
name them before implementation; the mechanism itself needs no change. Revision 5 can be the
supersession list alone.

---

## Part 1. Disposition

| Id | Disposition | Clause / reason |
| --- | --- | --- |
| R34 quiet-group bound | CLOSED | R4-B: B9 (production), explicit re-entry (embedding), REMOVE or restart; safety intact; P-R3g. |
| R35 K-th bound and RECORDED wake for HELD and serving alike | CLOSED | R4-A rules 1-2: predicate "genesis OBSERVED in this process AND last grant attempt answered UNAVAILABLE" at the reconciliation owner; the handler keys on the wake detail (`wasm-creation-wake.js:29`, `publish :94`) for ANY memo; "anything else keeps today's rule"; P-R3f with both mutations. |
| R36 UNRESOLVED at confirm, one mapping | CLOSED | R4-C: UNAVAILABLE at `confirmPublishedAuthority :135` on a serving answer -> PUBLISHED_UNCONFIRMED -> HELD; `UNKNOWN{UNAVAILABLE}` only for non-serving answers; P-R3h. Precision N21. |
| N16 K's value | recorded | R4-D. |
| N17 `reason: UNAVAILABLE` means "deferred" | recorded | R4-D. |
| N18 `wasm-service-lifecycle.test.js:493` | recorded | R4-D: census + append; the landing decision names the line. |

## Part 2. Attacks on Revision 4

### R4-A rule 1 (the widened predicate)

- A HELD founder whose last grant answered PREDECESSOR_OUTSTANDING (J's founders while I
  serves) keeps today's rule; J's founders are in J's own group, I's writes never reach them,
  APPLIED_PROGRESS stops after INIT: bounded as in stage 1. HOLDS.
- A HELD founder whose last grant answered UNAVAILABLE beside a serving-unconfirmed leader: the
  K-th rule applies; per K writes one run; the GRANT_HELD(UNAVAILABLE) wake is RECORDED; on
  the owner's return the K-th run lands the grant (`resolveGrant :32-40` PUBLISHED ->
  `recordLocalGrant` -> `enableServing :146-153` flips) and fires the OBSERVED wake per
  D1'/N7 (the run flipped and was not waited): the handler re-enters, PUBLISHED, ACTIVE.
  HOLDS; P-R3f covers it.
- A HELD founder whose last grant answered a SEALED refusal (STALE_BINDING, RESOURCE_CLOSED,
  HISTORY_UNAVAILABLE, CONTENT_CONFLICT) beside a serving leader: "anything else keeps
  today's rule" means every APPLIED_PROGRESS runs genesis plus a grant attempt that can never
  land, plus a GRANT_HELD wake the handler re-enters on, per committed write, until the
  coordinator's REMOVE retires the instance. This configuration already exists in stage 1c
  (J selected after I's leader published but before I's follower did: the follower's grant
  answers STALE_BINDING, I's leader keeps serving); it is not created by this design, and this
  design's rule 1 correctly declines to widen into it. Record it for the owner (N19): a
  sealed grant refusal could retire the native subscriptions (nothing further can land; the
  REMOVE will come), a stage-1 behaviour change outside this stage.
- The counter and the "last grant attempt" fact are per instance, written only inside the
  synchronous subscription callback and the run that produced the grant answer: single
  writer, no race. HOLDS.

### R4-A rule 2 (RECORDED for any memo)

- In-flight CREATE: `WAKE_ACTION[IN_FLIGHT] :299-302` sets `wakePending` for
  `PENDING_WAKE_REASONS :52-53` (OBSERVED, GRANT_HELD). "RECORDS without an immediate
  re-entry" must also mean "sets no `wakePending`" for a GRANT_HELD whose detail is
  UNAVAILABLE, else the in-flight branch schedules exactly the re-entry rule 2 forbids once
  the current one releases (`releaseBoundCreation :153-160`). One bounded extra re-entry,
  not a loop, but the rule should say it (folded into R37's precision line; no new id).
- A fully HELD group (no serving leader) under a down owner: formation event -> run ->
  UNAVAILABLE -> GRANT_HELD(UNAVAILABLE) -> RECORDED; no user writes ever flow (HELD admits
  none), so rule 1's K-th trigger never fires; the group waits for B9, an explicit re-entry,
  a REMOVE or a restart. Today the handler would re-enter immediately and read the same down
  owner, then wait for the same things (stage-1 P13: "after the fault clears an explicit
  re-entry publishes"). Not a regression; R4-B's statement covers it and should say so (N20).
- Committed witnesses: the only route-level wake witness (`runtime-service-bound-route.test.js:341-351`)
  uses reason `creation_genesis_observed` (QUEUED then RECORDED): unaffected. No test in
  `test/node` or `test/runtime` pins a GRANT_HELD wake's handling. The publication fixture's
  consumer (`wasm-retained-bootstrap-fixture.js:69`) is not the handler. R4-A flips no
  committed witness. HOLDS.

### R4-B

States the quiet-group bound and its safety; P-R3g drives the explicit re-entry. HOLDS.

### R4-C

- `confirmPublishedAuthority :134-135`'s default branch: UNAVAILABLE on a serving answer ->
  PUBLISHED_UNCONFIRMED (status wins at `decideResume :66-69` -> HELD); other UNRESOLVED
  reasons (UNKNOWN from a thrown owner through `instanceFailure :107-109`, CORRUPT_STATE,
  NEVER_CREATED) keep `UNKNOWN{reason}` -> DEFERRED named: re-enterable, custody kept. HOLDS.
- "Serving answer" includes PUBLISHED_UNPROJECTED (`SERVING_STATUSES :57-58`, RV4.1 confirms
  it like PUBLISHED). R4-C says "plain PUBLISHED" in one place and "only for non-serving
  answers" in the next; name PUBLISHED_UNPROJECTED explicitly so UNAVAILABLE at its confirm
  also maps to PUBLISHED_UNCONFIRMED and the re-drive re-projects UPDATE-first when it
  confirms (N21).
- Committed witnesses of the confirm-site UNRESOLVED shape: none found (the `UNRESOLVED`
  hits are all `CLOSE_UNRESOLVED` on the REMOVE path; `wasm-creation-publication.integration.test.js:675`
  pins `CONSENSUS_SERVING_NOT_IMPLEMENTED` for a different case and stands). HOLDS.

### Nothing else regressed, except the record (R37)

Revisions 1-4 change three answers that committed witnesses pin, and no revision names them:

1. `test/service/service-consensus-creation-intent.test.js:113-126` "recovery does not
   replace original intent with current resolver data": `loseReservation()` + `prepare()`
   leaves a PENDING row whose reservation applied with the reply lost (F3), then
   `recoverPendingOperations` asserts `result[0].status === 'held'` (`:124`),
   `result[0].outcome === 'ADMISSION_RETAINED'` (`:125`) and the row `in_progress` (`:126`):
   today the SCAN resolves the reservation and promotes the row. Under R1-A the scan answers
   `{status: INVENTORIED, rowState: PENDING, token: null, ...}`, reserves nothing, and the
   row stays PENDING until the handler's re-entry (R1-A/R2-A). Three assertions flip, and
   this witness is today's proof of F3's resolution; the superseding witness must prove the
   RE-ENTRY (not the scan) resolves the same request (P-R12 already does; cite it as the
   successor).
2. `:222-230`: a corrupt journal row through `recoverPendingOperations` asserts
   `results[0].outcome === 'CORRUPT_STATE'` and `results[0].status === 'held'` (`:228`).
   Under R1-A/R3-F the entry is `{status: INVENTORIED, outcome: CORRUPT_STATE, reentry:
   false}`; `:228` flips.
3. `:232-239` "unavailable resource resolution after retention stays UNKNOWN":
   `recoverConsensusCreation` with `resolveInstanceResource -> UNAVAILABLE` asserts
   `{outcome: 'UNKNOWN', reason: 'UNAVAILABLE'}`. Under R2-B the manager answers
   `ADMISSION_RETAINED` with `phase: UNAVAILABLE`; the whole `deepEqual` flips. The
   superseding witness asserts the pass-through shape and that the OPENING module (not the
   manager) decides on its own owner read (R2-B's one-decision-site claim).

The generic-row witnesses (`test/service/service-lifecycle-manager.test.js:432-532`) exercise
non-consensus rows and are untouched by R1-A. The two UNAVAILABLE route witnesses
(`runtime-service-bound-route.test.js:234-243, :277-282, :311-314`) stand (N15). Everything
else in the design is unchanged by Revision 4.

## Part 3. Owner uniqueness

Unchanged. Revision 4 adds no owner; the K-th predicate and its facts are the reconciliation
adapter's; the handler reads the wake detail it already receives; the confirm site keeps one
mapping per condition.

## Part 4. Proof plan

P-R3f (two followers, owner down then back, two mutations), P-R3g (quiet group), P-R3h
(confirm-site UNAVAILABLE on a serving answer) stand. Add the supersession list of R37 to
the proof plan's "superseded witnesses" so the landing decision can name each line (RV4.3
precedent), and state that P-R12 is the successor of `:113-126`'s F3 claim.

---

## Required change

- R37 Name, by appending, the three committed witnesses Revisions 1-4 flip and their
  successors: `service-consensus-creation-intent.test.js:113-126` (scan no longer resolves
  F3; successor P-R12), `:222-230` (INVENTORIED corrupt entry, `reentry: false`),
  `:232-239` (ADMISSION_RETAINED with `phase: UNAVAILABLE`; the opening module decides).
  Include in the same clause that a GRANT_HELD wake whose detail is UNAVAILABLE sets no
  `wakePending` on an in-flight entry (R4-A rule 2 completed for the IN_FLIGHT row).

Recorded:

- N19 Stage-1c latent cost, not this design's: a HELD follower whose grant is SEALED-refused
  (STALE_BINDING, RESOURCE_CLOSED, HISTORY_UNAVAILABLE, CONTENT_CONFLICT) beside a serving
  leader runs genesis plus a grant attempt and re-enters per committed write until the
  coordinator's REMOVE; retiring the native subscriptions on a sealed refusal is a stage-1
  behaviour change for its owner (R17).
- N20 A fully HELD group under a down owner (no serving leader, no user writes) confirms only
  through B9, an explicit re-entry, a REMOVE or a restart, exactly as stage-1 P13 recorded;
  R4-B's statement covers it.
- N21 R4-C applies to every serving answer, PUBLISHED_UNPROJECTED included; say so.

What the implementer must not do from Revision 4: do not rewrite
`service-consensus-creation-intent.test.js:113-126, :222-230, :232-239` in place (append the
superseding witnesses and keep the old lines as the record of their stage); do not set
`wakePending` for a GRANT_HELD wake whose detail is UNAVAILABLE; do not widen rule 1 into
sealed grant refusals in this stage.

This is the vet's verdict only; nothing is reported done on the lead's behalf.
