# Design vet: Revision 3 amendment A2 (bounded owner-side re-decide for slot transitions)

Subject: section "Revision 3 amendment A2" (design note lines 913-1035) of
`solve/quests/wasm-creation-genesis/SERVING-PUBLICATION-RETIREMENT-DESIGN-20261017.md`
in `/mnt/data/peter/projects/.worktrees/rs-raft-event-reconciliation-20261016` at `89e70949f`
(`git status --short`: ` M` the design note and ` M log.ndjson`, the lead's uncommitted appends).
Read-only vet; nothing edited, committed, stashed or run. Every `file:line` is from that tree.

Read in full (R18): CLAUDE.md, rules.md, router.md, authority-and-recovery.md, CONTRACT-R2.md,
INSTANCE-CAS-STAGE-ACCEPTANCE/REVIEW-20261016.md, the whole design note (original, Revision 2,
Revision 3, A1, A2), verifier-verdict-stage1.md, the five owner/gateway source files the brief
names, the five witnesses the brief names. Traced beyond the brief because the premise of A2.1
depends on them: `retryable-control-plane-write.js`, `control-plane-error-classification.js`
(:19-60, :240-330), `control-plane-system-table-gateway.js`,
`control-plane-system-table-gateway-mutation-submission.js`,
`control-plane-system-table-gateway-request-coalescing.js:160-240`,
`control-plane-mutation-outcome-classifier.js`, `cdc-integration-service-mutation-operations.js:185-210,
260-520`, `cdc-integration-service-coalesced-mutation.js`, `cdc-integration-service-authoritative-read-flow.js:385-401`,
`distributed-write-coordinator.js:250-358`, `application-database-result.js:164-184`,
`partition-committed-statement-outcome.js:120-175`, `partition-write-kernel.js:190-213`,
`control-plane-write-identity.js:1-80`, `wasm-creation-publication.js`, `wasm-creation-wake.js`,
`wasm-creation-retirement.js`, `wasm-creation-reconciliation.js`, `service-consensus-creation-intent.js:118-165`,
`service-definitions-owner.js:90-125`, `constants/service-instance.js`, the lab acceptance record
:108-150, the quest log entries 16 and 19, `git log -S"no semantic CAS loop"`.

## Verdict: REVISE

No blocking finding: the mechanism of A2 is sound (category 1-3 below hold under the traced
production path, not only under the component fixture), and the owner's choice is not re-litigated.
The amendment as WRITTEN is not yet implementable and provable without the lead's hand: its bound is
defined two incompatible ways (A2.0 vs CAS-A3), one tightened witness contradicts the fixture
consumer it keeps (`reentries === 0`), one witness oracle is wrong (CAS-A5 "CLOSED monotonic" for a
grant), the typed consequence of bound exhaustion is left ambiguous, one post-zero-row state is
unnamed (R07), the sealed R2 contract sentence it flips is not named (R09), and MA5's named witness
cannot refute the UPDATE-path mutation. Each is a text or proof-plan change; all are listed below in
one round with the exact wording or witness required. The verdict is REVISE under R19 (the declared
proof must measure the claim) and R09, not because of a defect in the mechanism.

Legend: B = blocking (scenario -> wrong runtime output the proof plan cannot refute), N = non-blocking
(required change before implementation unless marked "record only").

---

## Phase 0. The claim as read (A2.0, design :919-931)

A slot transition (reserve / grant->PUBLISHED / release->RELEASING / close->CLOSED) whose exact
prior-state UPDATE returns a successful envelope with zero affected rows is re-decided by
`ServiceDefinitionsOwner` from a fresh authoritative observation and resubmitted with a new exact
predicate, at most `SERVICE_INSTANCE_LIMIT.RESOURCES` (9) times; the caller receives its own slot's
typed decision (PUBLISHED, RELEASING, CLOSED, ADMITTED or a sealed refusal) whenever the row's
decision for that slot is unchanged by the sibling's mutation; STATE_CHANGED only at bound
exhaustion; UNKNOWN (lost reply) stays single-shot with one authoritative resolution; selection
stays single-shot. Owner module only (`mutateResource`), no new state/timer/lock/cache.

---

## 1. Soundness of "a zero-row successful envelope is definitive"

Path traced: `mutateResource` -> `commitState` (`service-instance-metadata.js:131-142, :45-72`)
-> `rows.updateWhere` (`system-metadata-owner-base.js:496-508`) -> `executeMutation :417-454`
-> `runRetryableControlPlaneWrite` (`retryable-control-plane-write.js:131-191`) ->
`gateway.updateSystemTableRow` (`...-mutation-submission.js:107-116`) -> `submitMutation :161-365`
-> `runControlPlaneWrite` (write identity, `:321-323`) -> `cdc.updateSystemTableRow`
(`cdc-integration-service-mutation-operations.js:367-520`) -> `executeSQL :426` -> routed UPDATE ->
`distributed-write-coordinator.js:250-358` -> partition apply; the answer comes back as
`{success: true, partitionResult: result, ...}` (`:506-519`) and the owner reads
`result.partitionResult.affectedRows ?? result.affectedRows` (`service-instance-metadata.js:42-44`).

Can a zero-row envelope be returned for a mutation that DID apply? Each candidate, with the
evidence:

- Transport retry of identical bytes (`runRetryableControlPlaneWrite :155-187`): retries only a
  retryable failure (`:163-170`, `:171-180`; classifier `control-plane-error-classification.js:246-260,
  :312-328`), under ONE write identity per `executeMutation` call (`loopWriteIdentity :120-129`,
  `control-plane-write-identity.js:9-14`: "two attempts under one key are one committed entry: the
  second is answered from the first's outcome row"). A replay of an applied entry answers with the
  retained count (`partition-committed-statement-outcome.js:159-163`, original `changes`, e.g. 1), or,
  when the row retains no count, with `{settledReplay: OUTCOME_NOT_RETAINED}` and NO `changes`
  (`:155-158`); `normalizeLocalSystemTableWriteResult` maps `affectedRows` only from a numeric
  `changes` (`cdc-integration-service-authoritative-read-flow.js:385-401`); the coordinator emits
  `{settledReplay}` without `affectedRows` for an unknown count (`distributed-write-coordinator.js:341-348`)
  and `sumAffectedRowCounts`/`affectedRowsField` turn any absent participant count into an ABSENT
  field, never 0 (`application-database-result.js:164-171, :180-184`). The owner then sees
  `affectedRows(submitted) === undefined` -> the UNKNOWN path (`service-instance-metadata.js:65`).
  So a replay of an applied mutation is never reported as zero rows. Premise holds.
- A failed participant: `success: false` with `affectedRowsField` (`:315-335`) -> `executeMutation`
  throws (`system-metadata-owner-base.js:441-446`) -> UNKNOWN path. Premise holds.
- Readiness refusal before delivery (`...-mutation-submission.js:218-241`) returns the failure object
  (its `affectedRows: 0` at `:228` and `:418` are the DIAGNOSTIC LEDGER entries, not the returned
  result) -> `success: false` -> UNKNOWN path. Premise holds.
- Pending/deferred visibility: `visibilityState` is about the CDC cache wait AFTER the SQL applied
  (`cdc-integration-service-mutation-operations.js:454-478`, entered only when
  `affectedRows !== number || > 0`); a `success: true` envelope with a numeric
  `partitionResult.affectedRows` means the statement was evaluated at the apply point. Premise holds.
- Coalescing (the real hazard class: one-row-for-not-applied, not zero-row-for-applied). The gateway
  defaults to SINGLE_FLIGHT (`...-request-coalescing.js:169-175`) but keys on the CONTENT
  (`whereClause`, `data`, `:192-208`), and the CDC single-flight key is also content-based
  (`cdc-integration-service-coalesced-mutation.js:45-51`); `buildMutationOptions` adds a primary-key
  coalescing key for UPSERT only (`system-metadata-owner-base.js:386-388`). Two different CAS
  attempts (different predicate or different `next`) never join; two sibling grants from the SAME
  owner object (publication fixture: one `metadata.primary` for three hosts,
  `wasm-retained-bootstrap-fixture.js:139-141`) differ in `data.state`, so they never join. A2's
  re-decided attempts have a fresh predicate, so they never join a sibling's in-flight promise.
  Premise holds.
- ABA: the predicate is the whole canonical state (`service-instance-metadata.js:57`); version,
  ordinals and phases are monotonic (`service-instance-state.js:212-239, :255-259, :277`), so no
  later state equals an earlier one. A late-arriving attempt cannot match again.

Double-apply under the loop: impossible by construction even if the premise were wrong in some
unseen path, because (i) each resubmission carries a new exact predicate and at most one attempt
per observed state applies, and (ii) `decide` on the FRESH state answers the caller's own slot
with SAME / own result when its earlier attempt did apply (`resourceTransition :276`,
`reserveResourceState :218-223`), so the loop never re-applies its own effect. Safety rests on the
predicate plus idempotent decide, not on the word "definitive".

F1 (N, text; record the trace). A2.1 asserts the premise but names no evidence; the implementer and
the next verifier need the chain above (R19). Required: cite in A2.1 that an unknown count is
ABSENT, never 0 (`application-database-result.js:180-184`, `partition-committed-statement-outcome.js:155-158`,
classifier `control-plane-mutation-outcome-classifier.js:26-32`), that the only zero-row producer
is an evaluated predicate miss, and that the component boundary already recorded by the stage-1
verifier (F-H1 (i): fixture `affectedRows` comes from better-sqlite3 `changes`,
`service-instance-creation-sqlite-fixture.js:87-104`) is where this premise is NOT witnessed.

F2 (N, text). A2.0 says the loss is "to a concurrent transition of a DIFFERENT slot of the same
row". The mechanism cannot and need not know the cause: the predicate also fails against a
selection (`selectInstanceState :198-203`) and against the SAME slot's transition by another caller
(RELEASING vs grant). The re-decide answers the sealed refusal in both cases (STALE_BINDING,
RESOURCE_CLOSED). Required: reword A2.0 to "loses the compare-and-set to any concurrent mutation of
the row" and keep the sibling-slot case as the motivating one; otherwise an implementer may try
to classify the cause.

## 2. UNKNOWN stays single-shot

Every non-definitive answer routes to the existing one-resolution path: exception
(`commitState :59-61` -> `submitted = null`), `success: false` (thrown by `executeMutation :441-446`),
absent/unknown count (`affectedRows(submitted)` undefined, `:65`), gateway OBSERVED_STATE_CHANGED is
merely the classifier's name for a numeric 0 (`...-mutation-contracts.js:59-61`) and is the
definitive case. The loop as specified in A2.3 (:985-986) never resubmits after an UNKNOWN. Correct.

F3 (N, R07, required). A2.3 does not say what the loop answers when the RE-OBSERVATION after a
definitive zero-row fails (`readState` throws UNAVAILABLE/CORRUPT_STATE,
`service-instance-metadata.js:30-41`). Today's code maps that to `{outcome: UNKNOWN, reason}`
(`:66-71`) for both fallbacks. After a definitive zero-row nothing is unknown about the mutation
(it did not apply), so UNKNOWN would be a false uncertainty claim that the lifecycle turns into
GRANT_HELD(UNKNOWN) / CLOSE_UNRESOLVED(UNKNOWN) (`wasm-creation-retirement.js:131-136`). Scenario:
sibling wins, re-read faulted -> caller told UNKNOWN although its own change never landed; a later
re-stop/re-START then performs an "UNKNOWN resolution" of a mutation that never applied (harmless
but mis-typed). Required: name the state: `{outcome: UNAVAILABLE}` when the re-read is unavailable,
`CORRUPT_STATE` when the row decodes invalid (both already in `SERVICE_INSTANCE_OUTCOME`
`constants/service-instance.js:19`), and add witness CAS-A7 (below).

## 3. Decision determinism per slot

Checked each `decide` as a function of (fresh state, binding, input):

- reserve (`reserveResourceState :212-239`): STALE_BINDING (no instance / not selected),
  HISTORY_UNAVAILABLE (lower ordinal), CONFLICT with `winnerToken` (same ordinal, other operation:
  the "CLOSED slot reused at g+1 between attempts" case), own result / CONTENT_CONFLICT (same
  ordinal), CAPACITY_EXHAUSTED, INVALID_EXPECTED_STATE, TARGET_ALREADY_OWNED, else APPLY. Total and
  deterministic. No case where re-deciding changes semantics versus today: today's `resolve`
  callback ALREADY re-decides on the fresh state and returns any no-`next` result
  (`mutateResource :137-141`); A2 only changes the `next`-present branch from STATE_CHANGED to a
  resubmission. The sealed loser answers are unchanged.
- grant (`changeResourceState :282-299`, `publicationRefusal :261-269`, `resourceTransition :270-281`):
  HISTORY_UNAVAILABLE / CONTENT_CONFLICT from `resolveResourceState :240-250`, then STALE_BINDING
  before any phase (the N3 order, witnessed CAS :286-290), RESOURCE_CLOSED on CLOSED/RELEASING,
  PREDECESSOR_OUTSTANDING, SAME, else APPLY (ADMITTED only). PREDECESSOR_OUTSTANDING can only flip
  true -> false between attempts: `retiring` gains no new non-CLOSED slot (`reserveResourceState :225`
  refuses a new ordinal on a non-selected instance) and phases only advance to CLOSED
  (`RESOURCE_PHASE_FROM :255-259`, `:277`). A flip false -> true would need a third selection, which
  is TRANSITION_HELD while `retiring` is outstanding (`selectionAdmission :161`) and otherwise makes
  the caller STALE_BINDING. Selection of J between attempts -> STALE_BINDING (sealed).
- release / close: allowed-from table + SAME + CLOSED-monotonic; no path to APPLY after the slot
  passed the target. Deterministic.

F4 (N, required naming; witness exists but the design is silent). `decide` is NOT pure: it mutates
the state object it is given (`reserveResourceState :237-238` assigns the slot and returns
`next: state`; `changeResourceState :290` sets `resource.phase` in place). Today this is safe because
the object is encoded once (`commitState :48`) and the resolve callback receives a FRESH decoded
object (`:67, :139`). Scenario (wrong implementation): the loop re-decides on the already-mutated
observation object and only re-reads `row.state` for the predicate -> `changeResourceState` sees
`resource.phase === PUBLISHED` -> SAME -> returns PUBLISHED with no `next` -> caller told PUBLISHED
while the row still says ADMITTED (wrong output, serving enabled without a metadata grant).
CAS-A1's "exactly two owner-a UPDATEs" catches it (one UPDATE would appear), but only if the
assertion is kept and the row phase is also asserted. Required: A2.3 must say "each attempt
decides on the state object of the NEW observation and submits that observation's `row.state` as
the predicate; the previous decision's object is discarded", CAS-A1 must assert
`f.state().selected.resources[0].phase === 'PUBLISHED'` as well as the write count, and the
mutation list gains MA6 "re-decide on the retained, already-mutated state object" (CAS-A1 red).

## 4. Bound and liveness

F5 (N, required: define the bound once). A2.0 (:924-925) says "decided again ... and resubmitted,
at most RESOURCES (9) times" (= up to 10 submissions); A2.3 (:984) says "loop (at most RESOURCES
attempts)"; CAS-A3 (:1004-1006) demands "STATE_CHANGED after exactly RESOURCES submissions" (= 9
total); MA3 "bound removed or off by one" is only meaningful against one definition. Scenario: an
implementer follows A2.0 (10 submissions) and the witness author follows CAS-A3 (9) -> a correct
implementation is red, or MA3's off-by-one passes. Required: "at most RESOURCES submissions in
total (the first plus at most RESOURCES-1 re-decisions)" in A2.0, A2.3 and CAS-A3, and the fixture
counts SUBMISSIONS (gateway `updateSystemTableRow` calls or `f.writes` entries of that writer), not
re-decisions.

Why 9, and is it enough? The row has at most two instances x 9 slots plus one selection
(`validFoundingPeers` caps founders at RESOURCES, `service-instance-contract.js:100-105`;
`validateInstance :84-85`). Each concurrent mutator makes one transition per call, so a caller
loses at most once per OTHER concurrent mutator that wins ahead of it. With one instance's 9
founders granting concurrently the worst case is 8 losses = 9 submissions: RESOURCES is exactly
sufficient for the case the owner decided (J's founders after I's last CLOSED). It is NOT
sufficient for the two-instance worst case: I's 9 concurrent RELEASING/CLOSED retirements plus
J's 9 concurrent reserves (reserve on the selected J is allowed while I retires,
`reserveResourceState :225`) can make one caller lose up to 17 times. That caller receives
STATE_CHANGED (typed) and is re-driven as below. Why not 2: with 3 founders the worst case is 2
losses = 3 submissions, so 2 would already starve the third founder of a 3-host group. Why not the
sibling count: it is not observable by the owner (slots are a fixed array), RESOURCES is the
sealed cap of that count, and a fixed bound keeps the loop attributable (R13). Required: record
this rationale in A2.1 ("9 = one instance's founders racing; a two-instance retirement/reserve
overlap can exceed it and answers STATE_CHANGED with the owned consequence below") so the bound is
an evidence-based owner decision (authority-and-recovery.md :163-168), not a coincidence.

F6 (N, required: the owned consequence of STATE_CHANGED at the bound). A2.2 bullet 3 (:961-964)
supersedes "losers answer STATE_CHANGED and are re-driven by the operation owner" and then says the
GRANT_HELD wake "keeps its other reasons (PREDECESSOR_OUTSTANDING, UNAVAILABLE, UNKNOWN,
STALE_BINDING, RESOURCE_CLOSED)". STATE_CHANGED (bound exhausted), HISTORY_UNAVAILABLE,
CONTENT_CONFLICT and LOCAL_GRANT_NOT_RECORDED (all in N7, design :792-798) are missing from that
list. Scenario (wrong implementation): the implementer reads the list as exhaustive and
special-cases STATE_CHANGED out of the wake in `publish()` (`wasm-creation-reconciliation.js:92-94`
today wakes for every held grant) -> a bound-exhausted founder is held with NO typed consequence
and no re-driver (authority-and-recovery.md :44-51 "a refusal has an owned consequence"; R11). The
proof plan cannot refute it: no witness reaches bound exhaustion through the lifecycle (3 founders
never exceed 9). Required: state in A2.2 that N7 is unchanged ("a run that reaches OBSERVED but
cannot grant fires one CREATION_GRANT_HELD wake carrying the typed grant outcome, STATE_CHANGED at
bound exhaustion included"), name the re-driver per verb: grant -> the N7 consumer (desired-state
reconcile in production; the fixture consumer RECORDS it and the test re-enters explicitly, as
P13 does); close -> CLOSE_UNRESOLVED with retained custody, explicit re-stop
(`wasm-creation-retirement.js:131-136`, D4'); release -> recorded `release.outcome`, retirement
continues (D5'/A1); reserve -> the producer's typed non-ADMITTED answer
(`service-consensus-creation-intent.js:134`, `unresolvedResult :120-125`) and an explicit re-START
re-reserves idempotently. Add native witness P20 (below) so a lifecycle-level bound exhaustion is
observed once.

Liveness note (record only): a stale re-observation (an authoritative read mode that falls back,
`CONTROL_PLANE_AUTHORITATIVE_READ_MODE`, gateway constants :110-119) would re-produce the same
predicate and burn the bound on identical bytes, answering STATE_CHANGED after 9 x (read + write
budget, `DEFAULT_RETRY_TIMEOUT_MS` 30 s per routed write under retryable faults,
`retryable-control-plane-write.js:15`). Not a wrong output (the predicate protects); A2.3 should say
the re-observation is the same `readByPrimaryKeyObservation` as the first (R10), which it is by
construction.

## 5. Selection exclusion

`selectConsensusInstance` calls `commitState` directly (`service-instance-metadata.js:100`), not
`mutateResource`; A2.3 keeps the loop in `mutateResource` and `commitState` single-shot (:986-988).
The witness named for MA5 is selection-admission "zero affected rows cannot manufacture a
successful selection" (`:53-63`, `attempts === 1`).

F7 (N, required witness). That witness overrides `insertSystemTableRow` only (first selection, row
absent). Scenario (wrong implementation): the implementer places the loop inside `commitState`
guarded by `observation.row !== null` ("an INSERT cannot lose to a sibling slot") -> selection at
V >= 1 that loses its CAS to a slot mutation re-decides and answers SELECTED instead of
STATE_CHANGED; the named witness stays green (INSERT path), C3 stays green (its loser is a sealed
CONFLICT via history), "selection overtaking an in-flight grant" (`:188-204`) stays green (the GRANT
loses, not the selection). No witness holds a selection UPDATE while a slot mutates. Required:
CAS-A6: select V=0; reserve slot 0; `holdNext('owner-a')`; owner-a selects V=1 (UPDATE); after
`entered`, owner-b grants slot 0; release; the selection answers STATE_CHANGED; exactly one owner-a
`UPDATE service_instances` in `f.writes` (`changes === 0`); `f.state().version === 1` and slot 0
PUBLISHED; a repeat of the same K then answers SELECTED (the retry owner is the caller, unchanged).
MA5 names CAS-A6 and the existing INSERT witness.

## 6. Interaction with Revision 3

- N3 allowed-from / CLOSED monotonic / STALE_BINDING order: consumed unchanged by the re-decide;
  the sealed answers survive (section 3). No change.
- D1' (grant inside the keyed run): the grant may now take up to 9 x (read + routed write); the
  shutdown join `awaitCurrentWorkIdle` (`wasm-creation-reconciliation.js:159`) still covers it; the
  post-grant recheck `current()` (`wasm-creation-publication.js:76`) still decides STOPPED after the
  whole loop, so a grant that lands on attempt k after the STOPPING fence stays counted and is
  RELEASING/CLOSED by the retire (the V5 argument of the stage-1 verifier still holds). P9/P10
  fences are synchronous and unaffected; P9 holds one attempt (`holdNext afterApply`), which under
  A2 is still the first attempt (the fixture's hold list is FIFO, `sqlite-fixture.js:68-86`).
  Same-slot race grant-vs-RELEASING: whichever wins, the other re-decides to a sealed answer
  (RESOURCE_CLOSED for the grant; PUBLISHED->RELEASING APPLY then resubmit for the release). No
  change needed; add the same-slot cells (section 8).
- D4' (RELEASING and CLOSED from three nodes): with A2 the retirement answers CLOSED in one pass
  for <= 9 concurrent retirements; `CLOSE_UNRESOLVED` is NOT "only an UNKNOWN outcome now":
  `closeRetired` (`wasm-creation-retirement.js:131-136`) maps every non-CLOSED answer to it, so its
  owner outcomes are UNKNOWN (lost reply / exception), UNAVAILABLE (read failure before the first
  attempt, and F3's post-zero-row read failure once named), STATE_CHANGED (bound exhausted), and
  the sealed HISTORY_UNAVAILABLE/CONTENT_CONFLICT (token mismatch). F8 (N, text): A2 should list
  these so the "no CLOSE_UNRESOLVED on group retirement" claim (owner decision, log entry 19) is
  bounded to "for at most RESOURCES concurrent retirements of one row".
- A1 (tombstone waits for RELEASING to settle): F9 (N, text). A1 (:884-889) says the handle release
  is "bounded by the metadata owner's own routed-mutation budget"; under A2 that budget becomes
  RESOURCES x (authoritative read + routed write), i.e. up to 9 x 30 s under retryable faults
  before the tombstone, port close and database close. Still "never a precondition of the fence"
  (STOPPING, admission close, handler retirement are synchronous). Required: amend the A1
  sentence to the product and say that this is the accepted cost of D5' visibility; P4's order
  (`TOMBSTONE_PRECEDED_RELEASING`) is unchanged.
- N7/F-W2 wake predicate: with STATE_CHANGED gone from the happy path, the only GRANT_HELD reasons
  reachable in P1/P15 are fault-injected ones, so "exactly one wake and it is OBSERVED" is sound for
  P1/P15. F-W2's legal two-wake interleaving survives only with a held grant (P13's UNAVAILABLE
  class), which those witnesses do not assert one-wake for. No change.

## 7. Observability (R11): decision

Decision: do NOT add `attempts` to the typed result; the component fixture's write log and a
counting gateway override are the proof of the bound; no log line is added.

Why: (a) R08 one canonical shape: `{outcome, phase, token}` is produced by both `mutateResource`
(`changeResourceState :291, :293, :295`) and `resolveInstanceResource` (`resolveResourceState :249`)
and is `deepEqual`'d by sealed witnesses (CAS `:264-267, :281-283`, `:124, :132, :144`); a field
present only on mutated answers would make the same decision two shapes and force witness
supersessions that have nothing to do with A2. (b) R07/R11 are about the OUTCOME: bound
exhaustion is the explicit typed `STATE_CHANGED`, which the lifecycle already surfaces
(`GRANT_HELD{grant.outcome}`, `CLOSE_UNRESOLVED{close.outcome}`); the attempt count is a diagnostic
of the owner's mechanics, not a decision. (c) Minimality: the owner has no logger dependency
(`InstanceRowOwner :17-26`); adding one is a new dependency. (d) The fixture already records every
`service_instances` write with `changes` per writer (`sqlite-fixture.js:87-89`), and the
selection-admission pattern (`:55-59`) counts gateway calls; CAS-A1/A3/A4/A5 and MA2/MA3/MA4 are
fully decidable from those. If the lead wants operator visibility of a bound exhaustion in
production, the right place is the gateway's operation ledger / telemetry
(`...-mutation-submission.js:385-404` already records every attempt with `affectedRows`), not the
decision shape. Required: replace A2.3's "the vet decides which" with this decision.

## 8. Proof plan

Fixture seams available (`service-instance-creation-sqlite-fixture.js`): `holdNext(writer, {afterApply})`
holds the writer's next `service_instances` write before execution or after apply (`:68-93`;
holds are FIFO, several may be registered); `loseReply(writer, onLost)` applies then throws
(`:94-103`), not retried by the wrapper (a plain Error is not retryable, `error-classification.js:246-260`,
matching selection-admission `:65-75` `attempts === 1`); `setGatewayReadFault` faults
`readAuthoritativeRows` (`:115-119, :161-164`); `f.primary.getGateway().updateSystemTableRow`
override as in `:53-63`; `f.writes` log with `changes`.

Per witness:

- CAS-A1: drivable (hold owner-a's grant UPDATE; owner-b grants slot 1; release; the held UPDATE
  returns `changes 0`; the loop re-reads and submits a second UPDATE, unheld). Catches MA1
  (STATE_CHANGED), MA4 (nine identical zero-change UPDATEs), MA6 (one UPDATE, see F4). Add the
  slot-0 row assertion (F4). Add CAS-A1b: two holds registered for owner-a, owner-b then owner-c win
  between them -> PUBLISHED on the third submission (`f.writes` three owner-a UPDATEs, 0/0/1): the
  "sibling lands between re-read and resubmission" temporal cell.
- CAS-A2: drivable (select; reserve+grant slots 0 and 1; select J; hold owner-a's CLOSED on slot 0
  while owner-b closes slot 1; release; owner-a answers CLOSED; both CLOSED; J's grant PUBLISHED).
  Catches MA1 on the close verb. Note J must be selected before the closes for "last CLOSED lifts
  the hold" to be the assertion (otherwise J's grant is simply PUBLISHED with no hold to lift).
- CAS-A3: drivable with the `updateSystemTableRow` override returning `{success: true, affectedRows: 0}`
  and counting calls (`runRetryableControlPlaneWrite :160-162` returns any `success !== false`
  result without retry, so the count is exact). Catches MA3 once F5 fixes the definition. Assert the
  row unchanged and `outcome === 'STATE_CHANGED'`.
- CAS-A4: drivable (`loseReply('owner-a')` on the grant -> applied, throw -> `executeMutation`
  rethrows -> `commitState` UNKNOWN path -> one resolution -> PUBLISHED; `appliedLostReplies.length === 1`;
  exactly one owner-a UPDATE). Catches MA2 (a resubmission after UNKNOWN is a second owner-a
  UPDATE with `changes 0`).
- CAS-A5 first half (selection J during the held grant -> STALE_BINDING, one zero-change UPDATE,
  no second): drivable; it is selection-admission `:188-204` plus a write-count assertion. Catches
  the "re-decide never resubmits a sealed refusal" property.
  F10 (N, required: wrong oracle). CAS-A5 second half says "owner-b closes the same slot (CLOSED
  monotonic answer, no resubmission)". For a GRANT target on a CLOSED slot the sealed answer is
  `RESOURCE_CLOSED` (`publicationRefusal :264-265` runs before the CLOSED-monotonic row `:277`;
  F-A3 of the stage-1 verdict; CAS `:268-269`), not `{outcome: CLOSED}`. Scenario: the witness is
  written to the design's oracle and is red on a correct implementation, or the implementer bends
  `resourceTransition` to answer CLOSED for a grant (flipping N3 as witnessed at CAS `:268-269`).
  Required: CAS-A5b expects `RESOURCE_CLOSED` for the grant; the CLOSED-monotonic branch under the
  re-decide is witnessed by holding owner-a's RELEASE (or CLOSE) of slot 0 while owner-b CLOSES
  slot 0 -> owner-a answers `{outcome: 'CLOSED', phase: 'CLOSED', token}` with one zero-change
  UPDATE and no resubmission (`f.writes` unchanged after the first).
- P19: drivable (`Promise.all(f.hosts.map((host) => f.retire(host)))` on a `publishedGroup`; one
  shared owner object so the three RELEASING chains interleave at their `await readState` and lose
  deterministically in the current schedule). F11 (N, required): assert the race was ENGAGED
  (`f.metadata.writes.some((w) => /^UPDATE service_instances/u.test(w.sql) && w.changes === 0)`),
  otherwise P19 is vacuous for MA1 under a future schedule. Also assert `release.outcome` is
  RELEASING or CLOSED on every result and `tombstone.outcome === 'RETIRED'`. Risk to flag, not a
  finding: concurrently retiring the leader with its followers has no prior witness; if the
  native shutdown of the leader stalls follower shutdowns, P19 must retire followers first and the
  leader last within the same `Promise.all`.
- P1/P15/P18 tightening: F12 (N, required: internal contradiction). A2.2 (:969-973) demands
  `reentries === 0`. The retained consumer `reenterOnWake` re-enters the host's operation on EVERY
  OBSERVED and CLOSED wake and only skips non-STATE_CHANGED GRANT_HELD wakes
  (`wasm-retained-bootstrap-fixture.js:64-73`); P1 today asserts `host.reentries === 1`
  (`publication test :258`) and `publishedGroup` requires `host.result.status === PUBLISHED`
  (`:163`), which only the re-entry sets (`f.bootstrap :204-209`). Removing the STATE_CHANGED
  branch leaves one OBSERVED re-entry per host. Scenario: a correct implementation is red on
  `reentries === 0`, or the author removes the OBSERVED re-entry and `host.result.status` can
  never be PUBLISHED. Required: "exactly one OBSERVED wake per host, `reentries === 1` (the
  consumer's collection of PUBLISHED), no GRANT_HELD(STATE_CHANGED) wake anywhere"; P18 keeps
  `host.result.status === STATUS_HELD` (no consumer) and asserts every host SERVING with
  `wake.outcome === CONSUMER_ABSENT` on every decisive run, dropping `:871-873`.
  `assertOneOwnerWake` tightening to "exactly one wake and it is OBSERVED" is sound (section 6).
  P15: `serviceInstanceMutations` counts `changes === 1` only (`:146-149`), so extra zero-change
  attempts do not disturb `A_LOST_GRANT_WAS_MUTATED_TWICE`; fine.
- P13 F-M1 assertion: drivable (`host.replica.creationReconciliation.subscriptions.length > 0`
  after the held runs, before the fault clears); A2 does not touch it (the read fault refuses
  before any mutation, `readState :32`).

Mutation catch matrix after the required changes: MA1 -> CAS-A1, CAS-A2, P1 (tightened), P19
(engaged); MA2 -> CAS-A4; MA3 -> CAS-A3 (one bound definition); MA4 -> CAS-A1 (nine identical
zero-change UPDATEs); MA5 -> selection-admission INSERT witness + CAS-A6; MA6 (new) -> CAS-A1 row +
count.

Missing cells of the model (decisions x state x events x temporal relation), each with the
required witness:
1. reserve x sibling reserve, DIFFERENT replica, different slot (the common founding pattern; today
   only the same-target race is witnessed, CAS `:148-165`): hold owner-a's reserve slot 0 while
   owner-b reserves slot 1 -> both ADMITTED, two non-CLOSED slots, owner-a two UPDATEs (0/1).
2. grant x same-slot RELEASING by the retire (RESOURCE_CLOSED, no resubmission): CAS-A5b (F10).
3. release/close x same-slot CLOSED by a racing re-stop (CLOSED monotonic, no resubmission): F10.
4. two consecutive losses (third submission wins): CAS-A1b.
5. zero-row then re-read fails: CAS-A7 (`updateSystemTableRow` override answers
   `{success: true, affectedRows: 0}` once and sets `setGatewayReadFault`; expect the F3-named
   outcome, exactly one UPDATE, no resubmission).
6. bound exhaustion through the lifecycle (grant): P20 on the native fixture: override
   `f.metadata.primary.getGateway().updateSystemTableRow` to answer zero rows for `owner-a` while
   the group forms; every host HELD with `grant.outcome === 'STATE_CHANGED'`, one GRANT_HELD wake per
   held run carrying STATE_CHANGED (F6), `reentries === 0` (consumer records only), no local write;
   restore and an explicit START publishes.
7. P19 race engaged (F11).
8. selection UPDATE path single-shot: CAS-A6 (F7).
Cells 1-8 are additions; none of A2.4's listed witnesses is wrongly placed except CAS-A5b (F10).

## 9. Supersessions (R09)

Named by A2.2 and verified against the tree: metadata header `:1-2` and comment `:63-64`; the
ACCEPTANCE `:21-24` and REVIEW `:14-19` sentences; 7' F0 and the stage-1 finding;
selection-admission `:206-223`; `reenterOnWake` `:56-73`; `assertOneOwnerWake` `:186-198`; P1/P15/P18.
Census (`grep -rn STATE_CHANGED test/ src/`, excluding the gateway's OBSERVED_STATE_CHANGED): the
only other test mentions are selection-admission `:60` (INSERT witness, stands) and the publication
file `:189, :194, :872` (listed). Source: only the owner (`:65`) and the vocabulary (`:20`). No
unlisted witness asserts STATE_CHANGED for a slot transition.

F13 (N, R09, required). Not named: CONTRACT-R2.md `:49-53` "Only affectedRows=1 or exact
authoritative outcome resolution proves success; success:true with zero changes does not. Existing
transport retry may replay identical mutation bytes; it cannot recompute a new expected state."
A2 keeps the first sentence and FLIPS the last for slot transitions (a definitive zero-row answer
now permits recomputing the expected state from a fresh observation). The brief names CONTRACT-R2
as the sealed R2 contract; the acceptance records A2 lists are downstream of it. Required: add the
sentence to A2.2 with the scoping "for slot transitions after a definitive zero-row answer; the
UNKNOWN clause and the selection paragraph stand".

F14 (N, R09, record). Not named: `SERVING-PUBLICATION-STAGE1-LAB-ACCEPTANCE-20261017.md:117-122`
(finding 5: "losers get a typed STATE_CHANGED hold and are re-driven by the operation owner") and
`:142-145` (the F0 assertion shape judged faithful), and the design note's own section 1 text
`:41-44` ("commitState ... UNKNOWN / STATE_CHANGED otherwise") and A1's "bounded by the metadata
owner's own routed-mutation budget" (F9). Required: name them in A2.2 as records that stand of
their stage and are superseded by A2 for slot transitions (the lab record is sealed-acceptance
material; the implementer report `:113` and log entry 16 are historical and need no naming).

## 10. Minimality

Not needed for the owner's decision: nothing in A2.3's mechanism is surplus; "or recorded by the
component fixture's write log; the vet decides which" is resolved by section 7.

Missing (an implementer would otherwise invent): the bound's unit (F5); the post-zero-row re-read
failure state (F3); the fresh-object rule for the impure `decide` (F4); the typed consequence of
STATE_CHANGED at the bound per verb and that N7 is unchanged (F6); that `CAPACITY_EXHAUSTED` from
`encodeInstanceJson(change.next)` (`commitState :47-51`) is a pre-submission sealed refusal that
ends the loop (list it beside "exception, missing affectedRows" in A2.3, which currently reads as
the only two non-definitive answers); what a NEVER_CREATED re-observation answers inside the loop
(`mutateResource :134` handles the first read only; rows are never deleted, so this is
unreachable; say "unreachable; answer CORRUPT_STATE if observed" rather than leave it); that
`selectConsensusInstance`'s exclusion is structural (it never calls `mutateResource`) and that the
loop must therefore live in `mutateResource`, not in `commitState` (F7).

---

## Findings summary (one round)

| Id | Class | Category | Required change |
|---|---|---|---|
| F1 | N | 1 | Cite the absent-not-zero evidence chain in A2.1; name the component boundary (F-H1 (i)) as unwitnessed |
| F2 | N | 1 | Reword A2.0: loss to ANY concurrent row mutation; sibling slot is the motivating case |
| F3 | N | 2/R07 | Name the post-zero-row re-read failure outcome (UNAVAILABLE / CORRUPT_STATE), add CAS-A7 |
| F4 | N | 3 | State the fresh-observation rule for the impure `decide`; CAS-A1 asserts the row phase; add MA6 |
| F5 | N | 4 | One bound definition: at most RESOURCES submissions in total; CAS-A3 counts submissions |
| F6 | N | 4 | STATE_CHANGED at the bound keeps the N7 GRANT_HELD wake; name the re-driver per verb; add P20 |
| F7 | N | 5 | CAS-A6: selection UPDATE held while a slot mutates -> STATE_CHANGED, one UPDATE; MA5 names it |
| F8 | N | 6 | Enumerate CLOSE_UNRESOLVED's owner outcomes after A2; bound the "no CLOSE_UNRESOLVED" claim |
| F9 | N | 6 | A1 budget sentence becomes RESOURCES x (read + routed write) |
| F10 | N | 8 | CAS-A5b oracle is RESOURCE_CLOSED for a grant; witness CLOSED-monotonic via release/close vs close |
| F11 | N | 8 | P19 asserts the race engaged (a zero-change UPDATE exists) |
| F12 | N | 8 | P1/P15/P18: `reentries === 1` (OBSERVED re-entry), not 0; P18 drops the STATE_CHANGED branch |
| F13 | N | 9/R09 | Name CONTRACT-R2 :49-53's "cannot recompute a new expected state" as superseded for slot transitions |
| F14 | N | 9/R09 | Name the lab-acceptance record :117-122/:142-145, design :41-44 and A1's budget sentence |
| 7 | decision | 7 | No `attempts` in the typed result; proof by write log / call count; no new log |
| 10 | N | 10 | List CAPACITY_EXHAUSTED and the unreachable NEVER_CREATED re-read; loop lives in `mutateResource` |

Blocking: none. The mechanism (observe, decide on the fresh object, submit the new exact predicate,
re-decide on a numeric zero, never after an absent count or a thrown/failed envelope, bound by
RESOURCES, selection excluded structurally) is sound against the traced production path and the
component fixture, and every sealed refusal survives the re-decide unchanged.

## What I did not read or run (bounded, counted)

Not read in full: `control-plane-system-table-gateway-request-coalescing.js` beyond :160-240,
`control-plane-write-identity.js` beyond :1-80, `cdc-integration-service-mutation-operations.js`
beyond :185-210 and :260-520, `cdc-integration-service-lifecycle.js executeSQL` (:284; the routed
path below it was read at the coordinator), `partition-write-kernel.js` beyond :190-213,
`wasm-service-lifecycle.js`, `wasm-service-replica-lifecycle.js` (the A1 await at :234-249 is taken
from the stage-1 verdict), `service-consensus-bootstrap.js`, `owner-key-reconcile-queue.js`, the
design vets A/B and the re-vet, HANDOFF-INTERFACES.md, the implementer report beyond its F0 line,
`log.ndjson` beyond entries 16 and 19. Not run: anything (read-only vet); no lab host touched.
