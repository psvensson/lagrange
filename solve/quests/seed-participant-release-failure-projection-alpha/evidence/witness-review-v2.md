# Seed release diagnostic witness review v2

## Verdict and exact binding

**APPROVE the frozen witness bytes for final production review and locked
measurement.** All six witness gaps in preflight V1 are closed. The added
unsafe-derived-before-backward controls match design V3's precedence, and no
new fixture-authority, cleanup, copied-classifier, or source-revert engagement
fault is visible in the frozen test delta.

This is a narrow incremental witness verdict. It does not approve production
implementation, generated metadata, the Quest receipt, live startup repair,
corpus readiness, or landing. Those remain with the independent production
reviewer and root-owned gates.

Reviewed exact inputs:

- repository HEAD: `a3b5c63451c3cf968b3d7ec807a0381261d4b61f`
- prior rejected witness report:
  `test-output/seed-release-diagnostics-20261013/witness-preflight-v1.md`,
  SHA-256 `e21f12ab233d8133a3f90208595642ae190386e6a448dbc592928bb40d76e3b4`
- design V3: SHA-256
  `f3fcf5c22571bc4388239637f77014da3d067f504e7d12a0a4f82580a64c5eb4`
- design registry correction: SHA-256
  `587f3475319c6cb38cfb040213feb04a6f37fe0a89d799a684482dd5551262c2`
- protocol witness: `test/partition/participant-release-protocol.test.js`,
  SHA-256 `037c9c287d8c0efd5821dcd7d0548ab409054deb61ec259726dca62f1c029f82`
- seed witness:
  `test/bootstrap/seed-participant-release-failure-projection.test.js`,
  SHA-256 `3350b6ad477f1b721fd644b1af2130b597632e6dfed237e30c34d5e3f560dba1`
- frozen ten-path manifest:
  `test-output/seed-release-diagnostics-20261013/frozen-implementation-v1-hashes.json`
- original immutable source-revert input: `989d34f5cceed3f83722d147b72f724dad077024`,
  tree `6c1ad50b5fd992369bf4a80737f370a549cb9dea`

No behavioral test or lab command was run for this review.

## W1-W6 closure

### W1 — closed: later distinct projections cannot overwrite first slots

The new actual workflow/client case at
`test/bootstrap/seed-participant-release-failure-projection.test.js:201-238`
delivers two different frozen `DRAIN_PENDING` answers, advances only through
the existing sleeps, reaches an actual third client call and client-produced
deadline, and requires the first blocked and joined projections rather than
the second. It pins two deliveries, three attempts, delays `[1, 4]`, the final
deadline refusal, and bounded first-only custody. The original one-delivery,
two-attempt primary remains intact at :138-199.

### W2 — closed: complete canonical blocked member is pinned

After the real gated attempt settles `DRAIN_PENDING`, the protocol witness
reads the actual current facts owner and deep-compares the projection to
`{generation: canonicalFacts.generation, work: canonicalFacts.work}` at
`test/partition/participant-release-protocol.test.js:450-459`. This binds all
seven generation fields and all eight work fields without reproducing either
shape or the drain predicate. The separate imported `isReleaseDrained` check
and real proposal count remain at :460-462.

### W3 — closed: delivered fresh-seed request and authority are bound

`createSeedReleaseHost` now exposes one assertion over the requests actually
received by its message-router seam at
`test/bootstrap/seed-participant-release-failure-projection.test.js:76-94`.
It requires the existing RELEASE action, FRESH_SEED trigger, partition,
measured digest, one shared deadline, and successful validation of the exact
captured token by the actual participant-release authorization owner. Every
failure path invokes this check through `seedReleaseFailureOf` at :101-111;
the successful path invokes it explicitly at :180-198. No fixture-issued
authority or copied validator was added.

### W4 — closed: boxed and null-prototype trigger shapes are covered

The registered-handler matrix now rejects boxed number and boxed boolean in
the same no-coercion set as boxed string/object inputs at
`test/partition/participant-release-protocol.test.js:557-576`. A
null-prototype own-data request is a positive at :588-591. Existing inherited,
accessor, Proxy, symbol, array/exotic and prototype-pollution controls remain.

### W5 — closed: a throwing join-time read cannot change the answer

The new scripted order `[starter, policy, Error, terminal]` at
`test/partition/participant-release-protocol.test.js:669-679` exercises the
registered same-build join. It requires the unavailable state and null ages,
and stripping only the projection still yields the exact settled
`hosted_partition` answer. This closes the caller-side guarded-read edge rather
than relying on the prior terminal-throw case.

### W6 — closed: invalid raw budget is diagnostic only

The seed witness supplies a fractional budget with an immediate no-retry owner
refusal at
`test/bootstrap/seed-participant-release-failure-projection.test.js:342-362`.
It retains the exact delivered refusal and one attempt, emits null
budget/elapsed/remaining scalars, and pins exactly the start and terminal
observation reads. It does not present the invalid budget as accepted
production policy.

## Additional clock-precedence and label review

The protocol combination at
`test/partition/participant-release-protocol.test.js:652-659` produces both a
backward sequence and an unsafe derived age and requires the same state as the
unsafe lattice. The seed combination at
`test/bootstrap/seed-participant-release-failure-projection.test.js:310-329`
does the same for derived spend. These close the mutable-source ambiguity:
derived unsafe arithmetic takes precedence over nonmonotonic ordering.

The frozen observation owner uses the exact V3 labels `measured`,
`unavailable`, `unsafe`, and `nonmonotonic` at
`src/node/participant-release-diagnostic-observation.js:13-18`. Its decision
order is unavailable/unsafe raw input, unsafe derived arithmetic, then
nonmonotonic ordering at :64-115. The hostile tests intentionally prove
primitive nonempty equality/distinction rather than import or duplicate those
internal constants, as V3 requires. The seed custody cases use opaque marker
strings only to prove byte-for-value first-slot retention; they do not claim
those markers were produced by the clock owner or use them to decide policy.

The source now samples terminal time before returning a successful joined
`CUT_OVER` at `src/node/replica-handler-participant-cutover.js:307-318`.
There is no separate successful-join clock-count witness in the frozen pair.
This does not reopen W1-W6 or the accepted falsifier plan: V3 classifies the
successful answer as unchanged and unprojected, and final production review
must verify the declared read placement and absence of a success field/log.
No additional test-side mirror of that internal read is justified in this
narrow witness review.

## Existing 48-item bar after the delta

### Admission and gating (7/7 witness dispositions closed)

1. **A1:** real pending proposal, current facts owner, canonical imported drain
   predicate, and one complete projected facts entry are bound.
2. **A2:** current DRAIN_PENDING, UNAVAILABLE, INVALID, CUT_OVER, and deadline
   classifications remain exact.
3. **A3:** the ample release deadline and one shared seed budget are unchanged;
   the invalid-budget case is immediate diagnostic classification only.
4. **A4:** stripping only joinedAttempt recovers the complete settled answer;
   seed retains the actual terminal answer.
5. **A5:** actual proposal settlement, queue clearing and later CUT_OVER prove
   owner progress releases the hold.
6. **A6:** later attempts re-enter current owners; first slots remain reporting
   history and cannot actuate release.
7. **A7:** complete canonical generation/work, trigger and request authority
   are now pinned at their producing seams.

### Retry loops (7/7 witness dispositions closed)

1. **R1:** current retry/sleep and visible client deadline still fire.
2. **R2:** the same budget bounds invalid/unreadable observations; no fallback
   clock or wait appears.
3. **R3:** success, no-retry refusal, insufficient remaining time/deadline and
   owner failure retain their typed exits.
4. **R4:** the exact stored promise is the only join dependency; diagnostics
   add no mutual wait.
5. **R5:** two fixed first slots withstand a second different projected answer;
   no history grows.
6. **R6:** same-build sharing, mixed-build exclusion and later fresh success
   retain the one current release path.
7. **R7:** attempt counters and first slots remain bounded to one service loop;
   per-service initialization/reset remains a final source-review check, not a
   missing witness in the approved one-service falsifier.

### Concurrency and serialization (5/5 witness dispositions closed)

1. **C1:** the registered handler, RUNS gate, real committed-membership owner
   and canonical facts provide the actual authority backstop.
2. **C2:** starter/joiner identity is preserved and the caller projection does
   not reconstruct the answer.
3. **C3:** every engaged path funnels through the registered cutover owner; no
   test claim, direct facts mutation, or second driver exists.
4. **C4:** no diagnostic timer, queue, wake, or recovery interleaving is added.
5. **C5:** handler/partition/build remains the single-flight identity; trigger,
   deadline and observations do not split it.

### Formation and startup (5/5 witness dispositions closed)

1. **F1:** the real control service, proposal queue and membership read are
   exercised without a new SQL/database dependency.
2. **F2:** retained observations do not redrive; actual proposal commitment is
   required before later success.
3. **F3:** startup still throws the actual client deadline or owner refusal;
   diagnostics cannot produce expected success.
4. **F4:** position, attempts, completed count and spend remain bounded within
   the existing serialized budget; no deadline tuning is inferred.
5. **F5:** actual startup decision, fresh-seed token, workflow method and client
   are bound, with no alternate release or direct authority mutation.

### Harness fidelity (6/6 witness dispositions closed)

1. **H1:** immutable source-revert engagement already reached actual aggregate
   DRAIN_PENDING and an older same-build join; W1 adds the distinct-retry
   custody edge without weakening the original case.
2. **H2:** the established controllable proposal and committed-membership seams
   delegate to the real owners; work/queue/pause/origin/facts are not assigned.
3. **H3:** measured, unsafe, nonmonotonic, overflow, throwing join/terminal and
   invalid-budget observations use injected owner clocks and do not advance
   owner progress except through the existing seed sleep.
4. **H4:** complete actual facts and actual delivered request fields are pinned;
   the synthetic seed projection remains explicitly a custody-boundary case.
5. **H5:** pending work, absent row, one proposal, entered gate, starter,
   joiner, mixed build, later settlement and success exclude vacuity.
6. **H6:** controllable and hostless cases retain their stated limits and make
   no native-Raft or startup-repair claim.

### Owner interaction (10/10 witness dispositions closed or correctly deferred)

1. **O1:** facts answer drain, cutover decides/acts and seed only retains.
2. **O2:** actual intent, evidence, client actuation and canonical releaseAnswer
   are exercised; no option-bag policy or alias is introduced.
3. **O3:** current source-revert failures occur after owner engagement and before
   missing projections, without changing admission/refusal behavior.
4. **O4:** first stale observations survive a different later answer and remain
   labelled history only.
5. **O5:** canonical backpressure, retry delay, deadline and single-flight stay
   unchanged.
6. **O6:** actual work settlement, rather than diagnostics, releases the hold.
7. **O7:** the three projections remain the complete diagnostic inventory and
   no witness branches operationally on them.
8. **O8:** exact candidate hashes, immutable negative input and expected missing
   projection failures are separately identified.
9. **O9:** tests import no proposed observation helper and add no copied drain,
   retry, force or fallback-success classifier.
10. **O10:** registry and generated metadata remain final production/root review
    items; the witness paths themselves match V3's one existing interaction.

### Adversarial JavaScript and intrinsics (8/8 witness dispositions closed)

1. **J1:** raw clock/budget and derived deltas cover NaN, infinities, fraction,
   negative zero, unsafe range, backward order, overflow and throws, including
   unsafe-before-backward precedence.
2. **J2:** own primitive, inherited, and null-prototype own-data trigger shapes
   are distinguished.
3. **J3:** accessor and Proxy trigger reads remain zero; no hostile value is
   retained or reread.
4. **J4:** Object/Array/Map/Set prototype pollution is installed and restored
   through the existing hostile fixture.
5. **J5:** boxed string/number/boolean, symbols, Proxy/exotic, array, coercion
   objects and arbitrary strings cannot enter primitive output.
6. **J6:** ambient Number.isSafeInteger replacement remains in the actual gated
   path; captured-intrinsic correctness is a final source-review obligation.
7. **J7:** toString/Symbol.toPrimitive counts stay zero; outputs are fixed
   primitives, canonical facts, safe numbers or null.
8. **J8:** array input is rejected, and no iterator allowlist or diagnostic
   helper import appears in tests.

## D1-D4 closure

1. **D1 — closed.** Current fixture, gate, clocks, registered route, actual
   workflow/client, startup authority and canonical facts are all bound at the
   consumed seam.
2. **D2 — closed.** Measured, unavailable, unsafe, nonmonotonic, invalid budget,
   join throw, terminal throw, backward and unsafe-derived combinations retain
   the underlying result.
3. **D3 — closed for witnesses.** The second distinct retry proves first-only
   custody; the gate proves exact shared promise engagement. Exact source map
   cleanup and per-service reset remain production-review obligations.
4. **D4 — closed.** The complete actual generation/work records, fixed trigger,
   request authority and original settled answer are anchored to their current
   producers.

## Remaining boundary

No witness gap remains from V1. Approval is contingent on root's final-byte
candidate and identical-test source-revert measurements and the separate
category-complete production review. Any test or production byte change after
the hashes above invalidates this verdict.
