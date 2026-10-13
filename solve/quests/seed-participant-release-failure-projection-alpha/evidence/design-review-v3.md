# Independent design review: seed participant-release failure projection V3

## Binding and verdict

**Verdict: APPROVE the bounded design, before implementation.**

This verdict binds the following two design records as one additive design:

- `test-output/seed-release-diagnostics-20261013/seed-diagnostic-design-v3.md`
  at SHA-256
  `f3fcf5c22571bc4388239637f77014da3d067f504e7d12a0a4f82580a64c5eb4`;
- `test-output/seed-release-diagnostics-20261013/seed-diagnostic-design-v3-registry-correction.md`
  at SHA-256
  `587f3475319c6cb38cfb040213feb04a6f37fe0a89d799a684482dd5551262c2`.

The reviewed repository input is clean tracked HEAD
`a3b5c63451c3cf968b3d7ec807a0381261d4b61f`. The current owner bytes include:

- `src/node/replica-handler-participant-cutover.js`
  `de7c59950179093519f5a161e61768df9c25759980e0618543bb6e076df0d271`;
- `src/bootstrap/bootstrap-service-seed-workflow.js`
  `cf24ca03d57820f0870642034046556ad036bbe54b6c467e39a36f141344a8a6`;
- `src/node/participant-release-client.js`
  `5775bb980f25271bc458c493c908399ad7d25290844984a81b7adfd2bfe0dd5c`;
- `src/partition/partition-participant-release-contract.js`
  `a7d2031ba6ecd98f43a506282f48cf3adab1c6bcb49ca595fb0c7078d9f2965c`;
- `src/partition/partition-participant-release-facts.js`
  `fcc0d2daee5ef58382d98419094ac007cc1f74ec8f8d8435ffa2edfd6b56990e`;
- `src/utils/strict-own-data.js`
  `2959845c9671dc783685d4758bcfc6b5b2d8ed57782c12a2eeece4a92fbba12f`;
- `src/time/time-source.js`
  `c4bf713ffca20541e11f079eeacf6cb51892ef722c0993a6277c7edd4ca48311`;
- `test/shards/impact-contracts.json`
  `63f610be8f25c15fbd981e04bb631c8dc7419087356e2dc84d008812d18bea33`.

This is design approval only. It is not source approval, a Quest seal, a test
result, a static receipt, a lab result, a startup repair, a timeout change, a
landing verdict, or permission to claim the existing startup reds resolved.

The initial V3 round found one blocker: the design declared a new sole
diagnostic-observation owner but omitted it from the impact contract. The
hash-bound additive correction resolves that blocker by adding
`src/node/participant-release-diagnostic-observation.js`, the seed workflow,
and participant-release client to both existing representations of
`raft-rs-runtime-application-transaction`, in the existing
`application-and-progress-transaction` endpoint, with exactly two endpoints
retained. No other design blocker remains.

## Why the new helper earns its boundary

The proposed helper has one narrow responsibility shared by two current
consumers: convert owner-clock samples and a hostile release trigger into fixed,
non-authoritative diagnostic observations. V3:68-122 defines that boundary and
explicitly excludes timeout, timer, transport, answer, drain, retry, map and
cleanup ownership.

The existing candidates do not own the required contract. The wait-bound
logger owns logging and flood behavior, the eligibility snapshot owns ISO-age
projection, and `TimeSource` supplies time without safe-integer or monotonic
validation (V3:72-81). Current `RealTimeSource.now()` delegates directly to
`Date.now` (`src/time/time-source.js:39-42`), while `VirtualTimeSource` accepts
finite fractional starts and advances (`src/time/time-source.js:84-96,150-178`).
The helper therefore centralizes a real shared classification instead of
duplicating it in cutover and seed workflow. It does not become a clock,
release, retry, or authority owner.

## Prior V2 blockers

1. **Typed clock observations — resolved.** V3:83-122 fixes the exported
   operations, captured intrinsics, four clock states, precedence, safe
   arithmetic, null representation, and no host-clock fallback. Production
   composition supplies the same NodeService clock to the seed and handler at
   `src/bootstrap/bootstrap-service-replica-registration-methods.js:272-283`,
   `src/bootstrap/shared/replica-handler-setup.js:254-266`, and
   `src/node/replica-handler-class.js:152-155` (V3:52-60).
2. **Accessor-free trigger capture — resolved.** V3:150-186 reuses
   `copyStrictOwnDataRecord` exactly once for the starter and retains only one
   of the four canonical primitive triggers. The existing helper captures its
   reflective intrinsics and rejects proxies, accessors, symbols, exotic
   prototypes and arrays at `src/utils/strict-own-data.js:5-15,61-87`.
3. **Interaction registration — resolved by the additive correction.** All
   three added owner paths and the named seed witness are assigned to the
   existing contract and endpoint. No parallel contract or endpoint is added.
4. **Falsifier fidelity — resolved.** V3:282-398 names the exact controllable
   consensus port, actual pending proposal, committed-membership gate,
   registered handler, actual workflow/client, and source-revert engagement.
   `startLeader` is exported and builds a real `PartitionService` through the
   existing controllable port at
   `test/test-helpers/participant-transaction-fixture.js:370-424,884`; the port
   applies committed entries and exposes the existing membership seam at
   `test/test-helpers/controllable-consensus-port.js:115-176,254-259`.

## Complete category disposition

Every item below is an accepted design obligation. None is claimed as measured
implementation proof.

### Admission and gating — 7/7

1. **Same fact at decision and projection.** Current aggregate refusal uses
   `isReleaseDrained` at cutover:245-257. V3:128-148 replaces `some` with one
   `find` using that same imported predicate; the found record both causes and
   labels `DRAIN_PENDING`. There is no copied precheck or second selection.
2. **Classification remains owned.** V3:257-278 preserves every current
   release outcome and the client-created `release_deadline`; measured,
   unavailable, unsafe and nonmonotonic are diagnostic clock states, never
   release outcomes. Existing retry consumers continue to branch on the
   existing `outcome` and `retryAfterMs`.
3. **The existing bound remains sole.** The shared seed deadline remains
   `leadershipWaitTimeoutMs` at
   `src/bootstrap/bootstrap-service-seed-workflow.js:265-293`. V3:192-235
   reuses its initial raw read and adds no wait, retry, reset or increased
   budget.
4. **Answer shape is preserved.** `releaseAnswer` remains the sole answer and
   freeze owner at
   `src/partition/partition-participant-release-contract.js:176-179`.
   V3:157-165 and 204-228 require the actual settled answer identity and every
   optional field to survive; projections are additive fixed fields.
5. **Ordinary progress releases the hold.** V3:294-322 requires the real
   pending proposal to commit through the controllable port and a later fresh
   cutover to reach `CUT_OVER`. Diagnostics add no wake, mutation or release.
6. **Fresh evidence still controls.** The existing final cohort read and
   release revalidation at cutover:278-299 remain. First observations are
   labelled history and cannot veto or authorize a later attempt.
7. **Messages identify the examined owner facts.** V3:128-148 projects the
   exact first blocked member's canonical seven-field generation tuple and
   eight-field work vector. V3:409-412 explicitly admits that a discarded
   nested control cause cannot be reconstructed.

### Retry loops — 7/7

1. **The current retry still fires.** The request, typed delay, fit check,
   sleep and loop at seed-workflow:277-293 are unchanged. Custody is filled
   only after the existing answer and cannot suppress a retry or rescue.
2. **Frozen evidence bounds unreadable observations.** The same deadline
   bounds the loop. Missing, throwing or unsafe diagnostic time produces a
   typed observation with null scalars; it does not create a fallback clock or
   alter the policy deadline (V3:103-122,267-277).
3. **Every existing exit remains visible.** Success, absent/invalid/negative
   retry, retry that cannot fit, deadline after sleep, build/authority refusal,
   owner refusal and transport/client deadline retain their existing final
   typed answer. V3:200-228 adds `seedRelease` only after failure is already
   decided.
4. **No mutual suppression.** The projection creates no re-drive owner and no
   dependency from cutover/control back to seed history. Nested control loss is
   disclosed rather than bypassed (V3:409-412).
5. **Retention is fixed.** Per service, seed holds one blocked record, one
   joined record and scalar counters; RUNS adds one start observation and one
   trigger to its existing record. No arrays, histories or per-retry logs are
   added (V3:150-155,195-199,230-235).
6. **Late success remains idempotent.** Same-build callers await the exact
   stored promise, ordinary retry re-enters the current authority owners, and
   diagnostics perform no mutation (V3:157-176).
7. **Reset lifetime is explicit.** `attemptCount` and both first slots reset
   for each service, while ordinal/completed/total live for one serialized
   workflow invocation. A transport ACK without a delivered typed result still
   cannot become success through the unchanged client
   (`src/node/participant-release-client.js:41-54`).

### Concurrency and single-flight — 5/5

1. **The synchronous gate stays exact.** The handler-local `RUNS` WeakMap,
   partition key, target-build comparison and stored promise remain the gate at
   cutover:302-320. Authoritative facts remain the async backstop.
2. **No stale observation can act after await.** A joiner records time around
   the exact promise and may project only its settled failed answer. It cannot
   revive a deleted record, replace answer identity, or skip the existing final
   census/control/resume checks (V3:157-176).
3. **There is still one winner.** Only the starter inserts the record and only
   its current identity-checked `finally` removes it. Joiners neither wrap nor
   replace the promise and do not participate in deletion.
4. **Interleaving adds no scheduler.** Existing recovery/operator callers may
   join the same record. The design adds no timer, queue, cleanup callback or
   wake, so it cannot amplify release work.
5. **Identity does not split.** The key remains handler plus partition, with
   the same target-build equality. Trigger, deadline, observation state and
   caller age never become keys or claims.

### Formation circularity — 5/5

1. **The current dependency chain remains explicit.** Seed reads build,
   services, clock and fresh-seed authorization; the client transports; cutover
   reads control owner, durable origin, membership, cohort facts and current
   SQL control facts before pause/resume. V3 adds no SQL, database, cache or
   topology read and does not infer the discarded nested control answer.
2. **History is not a re-drive dependency.** First observations are reporting
   only. No wake, admission or retry waits for them, so their loss cannot starve
   formation.
3. **Formation clients see the same result.** Startup still uses the existing
   shared budget and throws on the same final answer. Diagnostics cannot turn
   failure into success or create a new expected failure class.
4. **The shared-budget position is honest.** `ordinal`, `total`, `completed`,
   `attemptCount`, elapsed and remaining expose the actual service position
   within the one shared deadline (V3:207-228). In the current 138-service live
   scenario, `total` must report that actual count; neither this design nor its
   one-service deterministic witness claims a timing margin or repairs the live
   red.
5. **No formation bypass exists.** There is no direct facts mutation, detached
   cutover, alternate release, force flag, fixture admission assignment or
   second deadline algorithm (V3:27-32,490-498).

### Harness fidelity — 6/6

1. **The negatives must fail for the right reason.** V3:353-358 and 395-398
   require identical test bytes against source-only input to engage pending
   work/join or workflow/client deadline, then fail on the missing projection.
   Missing export, setup failure, premature timeout and fixture failure are not
   evidence.
2. **The semantic port is honest about its limit.** The protocol case uses the
   established controllable port for real application proposal/commit and the
   real committed-membership seam, while running the registered handler,
   canonical facts, pause and admission owners. V3:324-328 correctly excludes
   native physical Raft certification.
3. **Clock ordering is pinned.** The protocol witness uses an explicit safe
   integer handler clock and a one-millisecond positive age under ample current
   deadlines; hostile controls cover throwing, fractional, unsafe and backward
   samples. Observation reads do not advance the clock or alter deadline
   decisions (V3:306-312,330-350).
4. **Fields are complete.** Real facts supply generation/work. The seed witness
   uses the actual workflow and unchanged client, actual authorization owner,
   a canonical frozen release answer and the actual client deadline rather
   than a copied retry classifier (V3:360-393).
5. **Vacuity is excluded.** The protocol witness must prove one unsettled write,
   absent row, queue size one, entered membership gate, non-drained work, one
   starter, one joiner, positive age, later success and unchanged mixed-build
   refusal (V3:294-322). The seed witness requires one delivery and two actual
   workflow attempts (V3:370-384).
6. **The claim remains bounded.** Existing claim-cache, startup property and
   release-recovery tests remain the live observables and may remain red at
   current bounds. Focused green does not certify startup repair or native Raft
   behavior (V3:400-414).

### Owner interaction — 10/10

1. **Facts alone decide drain.** The imported `isReleaseDrained` remains the
   only drain decision; the found record is merely its explanation.
2. **Intent/evidence/actuation stay separated.** Client carries the request,
   facts supply evidence, cutover adjudicates/acts, `releaseAnswer` owns the
   canonical result, and seed retains optional evidence. The helper owns only
   safe diagnostic projection (V3:34-64,68-122).
3. **The paired invariant is testable.** The protocol witness couples unchanged
   closed admission/refusal with the exact blocked/join evidence, and the seed
   witness couples the unchanged terminal deadline with first-only retention.
   Removing consumer integration removes evidence without making the refusal
   green.
4. **Stale history cannot control fresh decisions.** A later proposal commit
   and fresh release use current owner facts and carry no old join diagnostic;
   seed slots reset for the next service/loop lifetime (V3:195-199,319-322).
5. **Backpressure is unchanged.** Existing retry-after, serial order, one
   shared deadline and the exact RUNS promise remain. Trigger or age does not
   raise urgency or parallelism.
6. **Owner progress remains the release mechanism.** Proposal application and
   fresh facts release the hold. Diagnostics are never the only wake or a
   correctness input.
7. **The projection inventory is closed.** Operational consumers may not
   branch on `blockedDrain`, `joinedAttempt` or `seedRelease`; those records
   cannot grant authorization, leader selection, admission or readiness.
8. **Treatment comparison remains executable.** The source-revert controls
   must keep the new helper available while reverting the two consumer
   integrations, or otherwise construct an equivalent source-only comparison
   that cannot fail on a missing module. Identical witness bytes must reach the
   named assertions; expected startup negatives stay outside positive proof.
9. **No escape hatch is justified.** Touched-caller review must find no copied
   drain expression, extra scan, force flag, alternate retry/deadline, raw
   queue read in seed production, nested-control reconstruction or fallback
   success.
10. **The interaction is registered.** The additive correction binds the new
    helper, seed workflow and client to both current representations of
    `raft-rs-runtime-application-transaction`, only in the existing
    `application-and-progress-transaction` endpoint, with the exact new seed
    witness and current protocol witness. The separate `core-system-logic`
    responsibility remains intact.

## Design-note refutations

1. **D1 — consumed surfaces are bound.** V3:34-60 binds seed, client, cutover,
   facts, answer and production clock composition. V3:282-398 binds the
   participant fixture, controllable port, membership gate, actual workflow,
   client and clock seams. This review independently confirmed each cited
   source exists and carries the stated role.
2. **D2 — diagnostic failure edges are typed without policy changes.**
   V3:103-122 and 257-278 cover missing clock/now, throw, non-number, NaN,
   infinities, fraction, negative zero, unsafe range, unsafe subtraction,
   backward time, already-successful/no-join, mixed build, no blocked member,
   later deadline and nested-control loss. Invalid observations produce fixed
   state plus null affected scalars; they do not throw into release policy,
   clamp backward time or change the underlying result.
3. **D3 — lifetimes are bounded and non-authoritative.** RUNS remains one exact
   promise with starter-only cleanup at cutover:302-320. It adds only start
   observation and trigger. Seed retains exactly two first slots and scalar
   counters for one service, resets them for the next service, and keeps no
   history (V3:150-176,195-199). Neither lifetime can keep release work alive.
4. **D4 — provenance and movement are honest.** Generation/work come from the
   exact found facts entry. Trigger comes from the starter's strict own-data
   request. Join age is relative to that attempt's owner-clock samples. Seed
   spend is relative to the seed loop's existing raw start read and terminal
   observation. The settled answer retains its original release/partition/
   phase fields after awaits. Later generation or identity movement makes an
   old observation labelled history only; fresh owners still decide.

## Adversarial JavaScript and intrinsics — 8/8

1. **Numeric lattice.** V3:103-122,267-270,330-343 and 387-393 require coverage
   of raw clock/budget values and derived deltas for NaN, both infinities,
   fractions, negative zero, unsafe magnitudes, backward order, overflow and
   throw. Captured safe-integer and negative-zero checks yield fixed state and
   nulls; actual protocol/seed behavior stays in control.
2. **Own-property discipline.** Trigger is obtained only through
   `copyStrictOwnDataRecord`; inherited trigger is null
   (`src/utils/strict-own-data.js:61-87`, V3:178-186).
3. **Accessor traps.** The strict copy reads descriptors rather than getter
   values, executes once for the starter, and is discarded. Getter/Proxy
   diagnostic trigger reads remain zero and no re-read creates a TOCTOU seam
   (V3:178-186,330-337).
4. **Prototype pollution.** The hostile fixture must set and restore Object,
   Array, Map and Set prototype pollution. Fixed own output fields and direct
   primitive comparisons do not enumerate polluted prototypes
   (V3:338-343,432-434).
5. **Boxed and exotic inputs.** Boxed strings/numbers/booleans, symbol keys,
   Proxies, exotic records, objects and arbitrary strings cannot become a
   trigger or numeric diagnostic. Only fixed primitive trigger strings and
   safe primitive numbers survive (V3:178-186,435-436).
6. **Mutable intrinsics.** The new owner captures
   `Number.isSafeInteger`, `Object.is`, `Object.freeze` and `Reflect.apply` at
   module evaluation (V3:97-101). The existing strict-copy owner already
   captures its reflection and data-write intrinsics. The test replaces ambient
   `Number.isSafeInteger` only after the starter is gated and restores it before
   owner continuation, so it proves this boundary without widening unrelated
   ingress hardening (V3:342-343,437-441).
7. **No coercive serialization.** Trigger is type-pinned before direct
   comparison and time is pinned before arithmetic. No hostile `toString`,
   `Symbol.toPrimitive`, `String`, `Number`, digest or JSON operation occurs.
   Existing terminal JSON receives only fixed primitives, canonical bounded
   facts and nulls (V3:442-446).
8. **No hostile iteration.** The helper consumes no array or iterable and uses
   no iterator allowlist. Trigger comparison is fixed and direct; prototype or
   `Symbol.iterator` changes cannot create an accepted value (V3:447-449).

## Nonblocking implementation and proof checks

These checks do not block design approval. They remain mandatory before source
approval:

1. Register the new helper, seed workflow and participant client in both exact
   contract representations, preserve all current owners/witnesses and exactly
   two endpoints, and run the canonical impact/shard producers. Do not hand-edit
   generated metadata as a substitute for its owner.
2. Construct a projected failed join only through `releaseAnswer` so stripping
   `joinedAttempt` deep-equals every field of the settled answer. Do not rebuild
   an allowlist that can lose a future optional field.
3. Keep `record.promise` the exact current promise and the current starter-only
   `finally` the sole RUNS cleanup. The new record fields may not wrap the
   promise or extend its lifetime.
4. Preserve the explicitly declared observation read count. The successful
   same-build result must remain the exact existing answer with no projected
   field or log; observation failures must remain invisible to policy.
5. The protocol hostile-input table must exercise the registered handler, not
   import the diagnostic helper. Its exact four-read hostless case must bypass
   participant-client clock shaping intentionally and state that limit.
6. The pending-work case must use the actual proposal queue and committed-entry
   callback, restore the membership gate in cleanup, and prove later success.
   It must not assign pause, work, facts, origin, admission or private queue
   state.
7. The seed case must use the actual workflow method, client, authorization
   owner and canonical frozen answer. It must prove one delivery, two attempts,
   actual client `release_deadline`, exact final answer identity, first-only
   retention and scalar budget/position data.
8. Run source-revert comparisons with identical test bytes so neither negative
   fails from a missing new module/export. Preserve raw assertion output and
   classify every full healthy bound expenditure as red.
9. Implementation review must repeat no-duplicate and touched-caller searches,
   confirm source size/complexity/guideline/duplication/dependency ratchets, and
   distinguish inherited static failures from new violations.
10. Locked evidence must keep the live claim-cache/startup failures and nested
    control limitation visible. Focused green cannot be cited as startup,
    native Raft, C2/recovery, corpus, Quest or landing closure.

## Scope ceiling

Approved scope is limited to bounded failure diagnostics at the existing seed,
client, cutover, facts and release-answer interaction. It does not authorize a
timeout increase, a new retry, parallel seed release, a fallback clock, a new
drain predicate, nested-control reconstruction, release/admission changes,
startup repair, ingress hardening outside the named projection inputs, C2 or
recovery repair, or any claim that a current red is healthy.
