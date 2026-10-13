# Seed release diagnostic witness preflight v1

## Verdict and exact binding

**REVISE.** The two test-first witnesses engage the intended current owners and
produce meaningful source-revert failures, but six bounded proof gaps remain.
This verdict reviews witness fidelity only. It does not reject approved design
V3, approve production implementation, alter the sealed Quest, certify the
diagnostic implementation, or waive final source/metadata/lab review.

Reviewed inputs:

- repository HEAD: `a3b5c63451c3cf968b3d7ec807a0381261d4b61f`
- design V3: `test-output/seed-release-diagnostics-20261013/seed-diagnostic-design-v3.md`, SHA-256 `f3fcf5c22571bc4388239637f77014da3d067f504e7d12a0a4f82580a64c5eb4`
- registry correction: `test-output/seed-release-diagnostics-20261013/seed-diagnostic-design-v3-registry-correction.md`, SHA-256 `587f3475319c6cb38cfb040213feb04a6f37fe0a89d799a684482dd5551262c2`
- protocol witness: `test/partition/participant-release-protocol.test.js`, SHA-256 `7400fdef0c3706664bd872f81bb91e0d1942129febea8908f445040f91a6a447`
- seed witness: `test/bootstrap/seed-participant-release-failure-projection.test.js`, SHA-256 `de8e6e093db95fc9b1547e7751476eac936f0820eaa756b4c13668898c209194`
- immutable source-revert input: `989d34f5cceed3f83722d147b72f724dad077024`, tree `6c1ad50b5fd992369bf4a80737f370a549cb9dea`

Root's locked source-revert measurement is preserved under
`test-output/seed-release-diagnostics-20261013/red-protocol-v1` and
`test-output/seed-release-diagnostics-20261013/red-seed-v1`:

- on `tv-dator`, the seven original protocol cases stayed green; the new real
  pending-write case reached its actual proposal, committed-membership gate,
  same-build join, and aggregate `DRAIN_PENDING`, then failed only because
  `blockedDrain.work.proposals` was absent; the two hostless diagnostic groups
  failed on their missing projection state;
- on `carinas-windows`, the seed case delivered the actual first refusal and
  then received the actual client-produced deadline answer before failing on
  missing `seedRelease.ordinal`; the terminal clock group likewise reached its
  owner refusal before the missing projection;
- neither run reported a timeout, retry-only green, setup/import failure,
  cancellation, or teardown failure.

This proves engagement for the current cases. It does not prove first-value
custody against a later different projected answer.

## Six required witness corrections

### W1. Prove first slots resist a different later projected answer

The seed primary at `test/bootstrap/seed-participant-release-failure-projection.test.js:119-179`
delivers one projected `DRAIN_PENDING` and then reaches the client deadline.
It proves that one observation survives a later answer with no projection, but
an implementation that overwrites a filled slot with each later projected
answer would still pass.

Keep the existing one-delivery/two-attempt case unchanged. Add a separate case
using the actual workflow and client that delivers two distinct frozen
projected refusals before the actual client deadline. Require the terminal
deadline answer, exact delivery/attempt/sleep counts, and the first blocked and
joined values rather than the second. No history array, retry classifier, or
direct diagnostic-helper call is permitted.

### W2. Pin the complete actual blocked-drain projection

The real protocol case at
`test/partition/participant-release-protocol.test.js:439-462` proves canonical
`DRAIN_PENDING`, imports `isReleaseDrained`, and checks the actual replica ID
and proposal count. It does not pin the remaining six generation fields or
seven work fields. An implementation that emits a partial object could pass.

Compare the projected object to one current canonical facts read from the
existing `readParticipantReleaseFacts` owner after the gate is released, or
otherwise assert every exact canonical key and value. The required generation
tuple is `nodeId`, `ownerIncarnation`, `replicaId`, `lifecycleIncarnation`,
`runtimeGeneration`, `connectionGeneration`, and `admissionGeneration`. The
work tuple is `sqliteTransactionOpen`, `participantStaging`,
`participantPrepared`, `proposals`, `pendingOutcomes`, `appliedIndex`,
`commitIndex`, and `lastIndex`. Retain the single canonical drain-predicate
assertion. The seed test's complete synthetic fixture proves downstream
preservation only; it cannot prove producer completeness.

### W3. Pin the actual fresh-seed request and authority

`createSeedReleaseHost` at
`test/bootstrap/seed-participant-release-failure-projection.test.js:40-76`
uses the actual startup decision, authorization owner, workflow method, and
participant-release client. Reaching one delivery proves fresh-seed
authorization was non-null, but its message-router seam accepts any request
and the assertions never validate the delivered request.

Assert that the first delivered request has the canonical `RELEASE` action,
`FRESH_SEED` trigger, exact partition, shared deadline, measured target build,
and an authorization that the actual owner validates for that partition/build.
This is an observation of the request already constructed by production. It
must not add fixture authority or validate through a copied predicate.

### W4. Complete the approved boxed/null-prototype trigger matrix

The trigger matrix at
`test/partition/participant-release-protocol.test.js:512-589` covers an own
primitive, inherited property, accessor, Proxy, symbol key, boxed string,
coercion object, arbitrary string, array, and prototype pollution. The filled
adversarial bar also names boxed numbers and boxed booleans; add both and
require `originalTrigger === null` with no coercion. Because V3 explicitly
admits an ordinary or null-prototype own-data record, add one null-prototype
own-data positive so that accepted input shape is not inferred solely from
source review.

### W5. Exercise a throwing join-time sample

The protocol clock group at
`test/partition/participant-release-protocol.test.js:591-640` covers unsafe,
overflow, backward, and a throwing settlement sample. The seed group covers a
throwing terminal sample. Neither proves that a throw at the join sample is
contained before awaiting the stored promise.

Add one registered failed-join case with the scripted order
`[starter, policy, Error, terminal]`. It must preserve the exact underlying
`hosted_partition` answer, report the fixed unavailable clock state with null
ages, and still settle the joined stored promise. This distinguishes the
caller-side guarded read from terminal-only guarding.

### W6. Exercise invalid raw budget projection

V3 declares that an invalid configured diagnostic budget yields
`budgetMs`, `elapsedMs`, and `remainingMs` all `null`, without changing the
underlying result. The seed host currently always supplies safe integer `5`.

Add one immediate no-retry owner-refusal case using an invalid test budget.
Require the owner refusal and attempt counters to remain exact and all three
budget/spend fields to be null. Label this as diagnostic classification of an
invalid raw input, not as valid production configuration or new deadline
policy.

## Category-complete witness dispositions

The dispositions below are scoped to the two witness files. `PASS` means the
frozen witness has an honest binding or source-revert engagement for the item.
`REVISE` refers only to W1-W6. `FINAL REVIEW` names an implementation or
generated-metadata check that cannot be approved by test-first bytes.

### Admission and gating (7)

1. **A1 — PASS.** The real pending case reaches the registered cutover route,
   canonical facts owner, imported `isReleaseDrained`, and actual aggregate
   `DRAIN_PENDING`. Final implementation review must confirm one `find` result
   both decides and projects the member.
2. **A2 — PASS.** The cases retain current `DRAIN_PENDING`, `UNAVAILABLE`,
   `INVALID`, `CUT_OVER`, and client `release_deadline` outcomes. No test
   treats a diagnostic as success or reclassifies an answer.
3. **A3 — PASS.** The real release uses the existing ample deadline. The seed
   primary uses one configured shared budget, its existing sleep, and the
   actual client timeout boundary. No bound is enlarged.
4. **A4 — PASS.** Stripping only `joinedAttempt` must recover the starter
   answer; the seed terminal answer is compared to the actual frozen
   client-shaped deadline. Existing release-answer freezing is used.
5. **A5 — PASS.** The protocol case commits the original pending proposal,
   awaits its write, proves the queue clears, and requires a later fresh
   release to reach `CUT_OVER`. Diagnostics are not used to release work.
6. **A6 — PASS.** The later release re-enters the production owners after the
   proposal settles. Retained seed observations are asserted only beside the
   terminal failure and never supplied to a release decision.
7. **A7 — REVISE (W2).** Actual replica/work identity is engaged, but the
   complete canonical generation and work shapes are not pinned at their
   producer.

### Retry loops (7)

1. **R1 — PASS.** The seed primary performs the existing retry sleep and next
   client call, which returns the current visible deadline refusal.
2. **R2 — PASS.** Missing or invalid observations do not create waits or
   fallback clocks; current cases retain the same bounded attempt path.
3. **R3 — PASS.** The suite includes success, immediate no-retry refusal,
   insufficient remaining time/client deadline, and owner failure. Terminal
   answers remain the existing typed answers.
4. **R4 — PASS.** The membership gate holds the owner attempt while the joiner
   observes it; neither side waits on diagnostic history or a seed slot.
5. **R5 — REVISE (W1).** Shapes are fixed and bounded, but write-once custody
   is not falsified by a second distinct projected refusal.
6. **R6 — PASS.** The same-build caller shares one attempt, the mixed build
   does not join, and a later healed attempt starts fresh without diagnostic
   success fields.
7. **R7 — PASS for the approved witness scope; FINAL REVIEW for source.** The
   one-service witness pins attempt counters and two nullable slots without a
   growing history. Per-service slot initialization/reset must be checked in
   final implementation review because the approved focused witness has one
   service.

### Concurrency and serialization (5)

1. **C1 — PASS.** A real `ReplicaHandler` registered route and gated committed
   membership read hold the exact first RUNS promise; current release/facts
   authority remains the backstop.
2. **C2 — PASS.** Starter and joiner share one promise; stripping the caller
   projection preserves the settled answer. Mixed build is immediate
   `INVALID` and receives no projection.
3. **C3 — PASS.** Operator setup, registered message delivery, facts, drain,
   proposal commit, and healed release all use existing owners. The tests add
   no claim, cutover driver, or facts mutation.
4. **C4 — PASS.** The witnesses add no timer, wake, queue, or recovery
   interleaving. Virtual/scripted clocks only supply the already injected time
   seam.
5. **C5 — PASS.** Same handler/partition/build joins; a different target build
   does not. Trigger and deadline are not used as alternate single-flight keys.

### Formation and startup (5)

1. **F1 — PASS.** The real blocked case uses the current SQL-transactions
   control service, real proposal queue, and current membership owner. No new
   query or database dependency is introduced by the witness.
2. **F2 — PASS.** Observations are asserted only after owner answers. The later
   successful release depends on committing actual work, not on retained
   diagnostic data.
3. **F3 — PASS.** The seed method still throws the actual client deadline; the
   current startup failure remains red rather than being converted to success.
4. **F4 — PASS.** The one-service primary pins ordinal `1`, total `1`,
   completed `0`, exact attempt count, configured budget, elapsed, and
   remaining values. It does not infer startup margin or tune a deadline.
5. **F5 — REVISE (W3).** Actual startup-decision and authorization owners are
   constructed, but the delivered request does not yet prove their canonical
   fields/token survived into the client call.

### Harness fidelity (6)

1. **H1 — PASS.** Locked source-revert evidence reached an actual aggregate
   `DRAIN_PENDING` and a gated older same-build join before missing projection
   assertions. It did not expire before engagement.
2. **H2 — PASS.** The established controllable semantic port captures a real
   pending SQL proposal, and the wrapper delegates to the existing committed
   membership handler. No work, queue, pause, origin, or membership fact is
   hand-set.
3. **H3 — REVISE (W5, W6).** Explicit virtual/scripted clocks cover measured,
   unsafe, overflow, backward, and terminal throwing samples without driving
   owner progress. The join-time throw and invalid raw budget edges remain
   unproved.
4. **H4 — REVISE (W2, W3).** Synthetic seed data carries every named field,
   but actual cutover projection completeness and exact fresh-seed request
   authority are not pinned.
5. **H5 — PASS.** The protocol positive proves unsettled write, absent row,
   pending proposal, entered membership gate, starter, joiner, mixed-build
   exclusion, settlement, and later success.
6. **H6 — PASS.** The tests and design expressly limit the controllable seam
   and hostless controls. They do not claim native physical Raft, startup
   repair, C2/recovery closure, or full-corpus proof.

### Owner interaction (10)

1. **O1 — PASS.** Facts supply work, cutover decides/acts, and seed retains
   observations. Tests do not move decision authority into their helpers.
2. **O2 — REVISE (W3).** The actual workflow/client and canonical
   `releaseAnswer` are used, but the fresh-seed request's intent/authority fields
   are not asserted at the delivery seam.
3. **O3 — PASS.** Locked source-revert runs preserve refusal/closed behavior
   and fail on missing evidence, not on a missing new export.
4. **O4 — REVISE (W1).** A deadline preserves one old observation, but a later
   different projected refusal is not shown unable to overwrite it.
5. **O5 — PASS.** Existing retry delay, client deadline, same-build sharing,
   and mixed-build exclusion are exercised without alternate backpressure.
6. **O6 — PASS.** Committing the actual pending proposal clears the hold and
   permits a later release. Diagnostics are not a wake or correctness driver.
7. **O7 — PASS for witness scope.** Tests recognize only `blockedDrain`,
   `joinedAttempt`, and `seedRelease`; no test or helper branches operationally
   on them. Final source search remains required.
8. **O8 — PASS.** The exact two witness hashes and immutable source-revert
   input are recorded, and the expected missing-projection failures are
   distinguished from positives.
9. **O9 — PASS for witness scope; FINAL REVIEW for source.** Tests import no
   proposed diagnostic module, force flag, fallback-success helper, or copied
   retry/drain classifier. Final changed-caller search remains required.
10. **O10 — FINAL REVIEW.** V3 plus the hash-bound correction names the single
    existing contract, its two endpoints, owners, and witnesses. Registry
    application and generated metadata are root-owned final gates, not
    established by these test bytes.

### Adversarial JavaScript and intrinsics (8)

1. **J1 — REVISE (W5, W6).** `NaN`, infinities, fractions, negative zero,
   unsafe range, backward time, derived overflow, and throwing terminal reads
   are present across protocol/seed controls. Join-time throw and invalid raw
   budget remain absent.
2. **J2 — PASS.** Own primitive and inherited trigger behavior are separated;
   strict-own-data remains the approved production owner.
3. **J3 — PASS.** Trigger getter and Proxy trigger reads remain zero, and no
   retained hostile object is reread.
4. **J4 — PASS.** Object, Array, Map, and Set prototype pollution is installed
   and restored through the existing hostile-intrinsics fixture.
5. **J5 — REVISE (W4).** Boxed string, symbol, Proxy, array/exotic, object,
   arbitrary string, and coercion objects are covered. Boxed number/boolean and
   the accepted null-prototype own-data shape are not.
6. **J6 — PASS for witness scope; FINAL REVIEW for source.** Ambient
   `Number.isSafeInteger` is replaced after the real starter is gated and
   restored before owner continuation. Final source review must verify every
   helper intrinsic is captured at module evaluation.
7. **J7 — PASS.** Coercion objects have zero `toString` and
   `Symbol.toPrimitive` calls; asserted outputs are fixed primitives,
   canonical facts, safe numbers, or null.
8. **J8 — PASS.** Array input is rejected as a trigger carrier. The test uses
   no iterator allowlist and imports no diagnostic helper internals.

## D1-D4 design-note checks

1. **D1 — PASS.** The witnesses bind the current fixture, real registered
   handler, controllable membership gate, actual workflow/client, startup
   decision, authorization owner, release contract, and injected clocks. The
   hostless controls are explicitly limited to caller-specific projection.
2. **D2 — REVISE (W5, W6).** Measured, unsafe, nonmonotonic, overflow, and
   terminal-unavailable rows preserve the owner result. The join-read throw and
   invalid-budget rows remain unmeasured.
3. **D3 — REVISE (W1); FINAL REVIEW for source lifetime.** RUNS engagement and
   starter-only cleanup are honestly exercised, and only two first slots are
   proposed. The tests do not yet prove first-only retention against a second
   distinct projected answer. Per-service reset and exact map cleanup remain
   final source-review obligations.
4. **D4 — REVISE (W2), otherwise PASS.** Trigger and answer identity are
   anchored and stripping caller projection recovers the settled answer. The
   actual blocked generation/work producer shape is only partially asserted.

## Approval boundary

After W1-W6 are addressed in one frozen batch, the witness set needs a narrow
incremental preflight of the changed bytes and locked candidate/source-revert
measurement. Production implementation still requires its own category-complete
review, exact metadata/registry verification, static gates, and appropriate
locked evidence. Current live startup reds remain system failures and cannot
be counted as diagnostic-unit success.
