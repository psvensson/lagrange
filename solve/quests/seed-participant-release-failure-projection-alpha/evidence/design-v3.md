# Seed participant-release failure projection: design V3

## Status and binding

This is design input only. It does not authorize implementation, a Quest
seal, metadata regeneration, a test or lab run, a timeout change, a startup
repair, or landing.

The design is bound to clean HEAD
`a3b5c63451c3cf968b3d7ec807a0381261d4b61f`. It supersedes design V2
`6fb5a3b29e09697783ba36295211030c1d403f541a8e2467e59f3eeaf250c12b`
after the category-complete independent review
`21eb81538602317752374139eb8da2cb41f85ec5a5958b86c1f8ff9df9cff78e`.
The frozen integration checkpoint remains untouched.

Suggested Quest ID: `seed-participant-release-failure-projection-alpha`.

## Quest statement

On a failed fresh-seed participant release, preserve and project three bounded
owner observations: the first canonical cohort member found not drained, the
first same-build cutover attempt the seed caller joined, and the failing
service's position and spend in the existing serialized seed budget. A later
client-shaped `release_deadline` remains the terminal typed answer and cannot
erase either earlier observation.

Preserve fresh-seed authorization, the one shared deadline, service order,
retry cadence, cutover single-flight, the canonical drain predicate, admission
transitions, stored-promise lifetime, starter-only cleanup, startup result, and
shutdown. Add no release policy, second drain predicate, retry, timeout,
healthy-path log, durable state, recovery owner, nested-control inference, or
fallback success.

## Current authority and exact interaction

- The seed owner measures the build, sorts services, reads the node clock once
  to create the shared deadline, requests release serially, applies the typed
  retry delay, and throws with the final answer at
  `src/bootstrap/bootstrap-service-seed-workflow.js:255-298`.
- The unchanged typed client derives its request timeout, performs delivery,
  and creates `release_deadline` at
  `src/node/participant-release-client.js:21-64`.
- Cutover owns control-first release, pause, exact facts/census, aggregate
  drain, final revalidation and resume at
  `src/node/replica-handler-participant-cutover.js:138-299`; its current
  single-flight is the handler-keyed `RUNS` map at :302-320.
- Facts own the eight accepted-work fields and sole drain predicate at
  `src/partition/partition-participant-release-facts.js:46-65`, and the seven
  replica-generation fields at :68-74.
- The release contract owns answer identity and freezing at
  `src/partition/partition-participant-release-contract.js:176-179`.
- Production seed composition passes `nodeService.getTimeSource()` through
  lifecycle acquisition at
  `src/bootstrap/bootstrap-service-replica-registration-methods.js:272-283`
  and shared handler setup at
  `src/bootstrap/shared/replica-handler-setup.js:254-266`; the handler retains
  that exact object at `src/node/replica-handler-class.js:152-155`. The seed
  loop reads the same node clock at seed-workflow:265. This NodeService clock
  is the sole clock for the new production observations. There is no new
  `Date.now` or host-clock fallback.

The proposed interaction is diagnostic only. Projected data cannot authorize
a release, validate a token, select a leader, decide drain, change retry or
deadline arithmetic, resume admission, publish readiness, or keep work alive.

## Proposed implementation boundary

### 1. One small shared diagnostic-observation owner

Add `src/node/participant-release-diagnostic-observation.js` as the sole owner
of safe trigger capture and relative clock observation for this interaction.
No current helper covers this contract:

- `src/logging/wait-bound-spent.js:116-157` guards logger observations but
  accepts general values and owns logging/flood behavior, not typed monotonic
  release time.
- `src/control-plane/eligibility-snapshot.js:32-52` returns a nullable age from
  an ISO stamp and finite clock value; it neither catches the clock read nor
  distinguishes unsafe from nonmonotonic observations.
- `src/time/time-source.js:39-42,74-96,150-178` supplies clocks but deliberately
  does not validate monotonic safe-integer observations.

The new module is pure and bounded. It owns no timeout, timer, transport,
answer, drain, retry, map, or cleanup. It exports only these operations:

1. `captureParticipantReleaseDiagnosticTrigger(request)` returns one of the
   four existing `PARTICIPANT_RELEASE_TRIGGER` primitive strings or `null`.
2. `observeParticipantReleaseClockValue(value)` classifies one already-read
   clock value without coercion.
3. `readParticipantReleaseClock(timeSource)` performs one guarded call to the
   supplied owner clock and classifies its result.
4. `participantReleaseAttemptAgeObservation(start, join, terminal,
   originalTrigger)` returns the fixed joined-attempt projection.
5. `participantReleaseSeedBudgetObservation(start, terminal, budgetMs)`
   returns the fixed budget projection.

The module captures `Number.isSafeInteger`, `Object.is`, `Object.freeze`, and
`Reflect.apply` at module evaluation. It performs primitive comparisons and
validated subtraction only. It uses no mutable array iterator, `Map`/`Set`
iteration, string coercion, `JSON.stringify`, `Math.max`, user callback, or
host clock.

Clock observation states are fixed primitive strings owned inside this module:

- `measured`: every required sample and derived delta is a safe integer, no
  sample is negative zero, and the sequence is monotonic.
- `unavailable`: the clock or `now` function is absent, or the one guarded
  clock call throws.
- `unsafe`: a sample or budget is non-number, `NaN`, either infinity,
  fractional, negative zero, outside safe-integer range, or validated inputs
  produce an unsafe derived delta.
- `nonmonotonic`: individually safe samples move backward in their required
  causal order.

State precedence is deterministic: unavailable input, then unsafe input or
derived arithmetic, then nonmonotonic order, then measured. Non-measured
attempt-age output keeps `originalTrigger` and therefore still states that a
join occurred, but both `joinAgeMs` and `terminalAgeMs` are `null`.
Non-measured seed output keeps a valid configured `budgetMs`, but
`elapsedMs` and `remainingMs` are `null`; an invalid budget makes all three
numeric fields `null`. No invalid value is clamped, omitted, coerced, or used
as a deadline.

### 2. Cutover projection and exact attempt lifetime

Change `src/node/replica-handler-participant-cutover.js` only as follows:

1. Replace the aggregate branch's current `census.some` at :253-257 with one
   `census.find((facts) => !isReleaseDrained(facts.work))`. The exact same
   found entry decides `DRAIN_PENDING` and supplies:

   ```text
   blockedDrain = {
     generation: {
       nodeId, ownerIncarnation, replicaId, lifecycleIncarnation,
       runtimeGeneration, connectionGeneration, admissionGeneration
     },
     work: {
       sqliteTransactionOpen, participantStaging, participantPrepared,
       proposals, pendingOutcomes, appliedIndex, commitIndex, lastIndex
     }
   }
   ```

   This is the complete canonical generation tuple and work vector from one
   facts record. It excludes the full census, membership, term, routing,
   origin, query rows, SQL values, payloads, and authorization. There is no
   second scan or repeated drain evaluation.

2. On the fresh-run branch, call
   `captureParticipantReleaseDiagnosticTrigger(request)` once and discard its
   transient strict-own-data copy. Sample the canonical handler clock exactly
   once immediately before invoking `runCutoverAttempt`. Add only that typed
   start observation and the bounded trigger to the existing record beside
   `targetBuildDigest` and the exact existing `promise`.

3. A same-build joiner samples the same handler clock once immediately before
   awaiting `current.promise`, awaits that exact promise, then samples once
   immediately after it settles. A failed shared answer receives one
   caller-specific `joinedAttempt` projection through one use of the existing
   `releaseAnswer` freezing surface. Removing only `joinedAttempt` must produce
   the settled answer byte-for-value for `outcome`, `releaseId`, `partitionId`,
   `phase`, retry, reason, missing-fact, blocked-drain, control-owner, and every
   other optional field. The joining request never reconstructs answer
   identity.

4. A successful shared answer is returned unchanged with no join diagnostic.
   A mixed-build caller remains immediate `INVALID`, does not await, and takes
   no join or terminal observation. With no existing run, the caller remains
   the starter and has no `joinedAttempt` field.

5. The stored promise, key, and lifetime stay exact. A joiner may await the
   stored promise but cannot wrap or replace `record.promise`, insert a second
   record, change the handler/partition key, install a timer, or participate in
   deletion. The starter's current identity-checked `finally` at :317-320
   remains the only cleanup.

Trigger capture uses `copyStrictOwnDataRecord` from
`src/utils/strict-own-data.js:61-87` exactly once for the starter record. Only
an own enumerable data property on an ordinary/null-prototype non-Proxy record
is considered. The copied value is accepted by four direct primitive equality
checks against the existing trigger constants. An inherited/accessor/symbol
property, Proxy/exotic record, boxed value, object, or arbitrary string yields
`null`. The request itself continues unchanged: no validator, rejection,
canonical request copy, getter read, coercion, or retained hostile value is
introduced.

### 3. Seed first-observation custody and terminal projection

Change `src/bootstrap/bootstrap-service-seed-workflow.js` only as follows:

1. Reuse the existing one raw start read at :265-266 both to create the current
   deadline and, without another read, to make a typed start observation.
   Existing deadline arithmetic and behavior remain unchanged.
2. For each service, initialize `attemptCount`, `firstBlockedDrain`, and
   `firstJoinedAttempt`. Increment the count once per existing request. After
   each answer, fill each empty first slot only from the corresponding answer
   projection. Never overwrite a filled slot and never accumulate an array or
   history. Reset all three for the next service.
3. After existing control flow has already decided failure, sample the same
   NodeService clock exactly once. This is the only new seed clock read. It is
   diagnostic only and is guarded by the shared helper, so a throwing or bad
   sample cannot replace the final typed answer.
4. Add this bounded object beside the unchanged final answer in the existing
   terminal error:

   ```text
   seedRelease = {
     clockState,
     budgetMs,
     elapsedMs,
     remainingMs,
     ordinal,
     total,
     completed,
     attemptCount,
     firstBlockedDrain,
     firstJoinedAttempt
   }
   ```

   `ordinal` is one-based; `total` is the fixed sorted service count;
   `completed` counts prior services that reached `CUT_OVER`. For measured
   time, `elapsedMs` is terminal minus start and may exceed the budget;
   `remainingMs` is zero when elapsed is at least budget and otherwise budget
   minus elapsed. All arithmetic is revalidated after subtraction. No absolute
   start, deadline, join, settlement, failure, or wall-clock timestamp is
   emitted.

There is no new wait or policy read. The exact observation reads are: one new
cutover start read per fresh run; one join and one settlement read per
same-build joining caller; zero join reads for mixed-build callers; the seed's
existing start read reused; and one new seed terminal read only on failure.
Current policy reads inside cutover, client timeout shaping, seed retry fitting,
sleep, and loop termination remain untouched.

### 4. Register the existing interaction, without a parallel contract

Update `test/shards/impact-contracts.json` in both representations of the
existing `raft-rs-runtime-application-transaction` contract:

- In the top-level entry at :599-646, add
  `src/bootstrap/bootstrap-service-seed-workflow.js` and
  `src/node/participant-release-client.js` to `owners`, and add the named seed
  witness below to `tests`. Retain every existing owner/test, including the
  current protocol witness.
- In `coupledPairs` at :1522-1578, add those same two owner paths only to the
  existing `application-and-progress-transaction` endpoint at :1539-1557 and
  add the seed witness to `witnessTests`. Retain the current
  `ready-persistence-and-reconstruction` and
  `application-and-progress-transaction` endpoints exactly; create no third
  endpoint or contract.
- Retain the separate `core-system-logic` registration at :532-546. It owns the
  workflow's readiness handoff and is not rewritten to describe participant
  release diagnostics.

## Typed decision table

| Input/edge | Diagnostic result | Underlying behavior that must remain exact |
| --- | --- | --- |
| Aggregate census has a blocked member | First `find` result becomes `blockedDrain`; answer is `DRAIN_PENDING` | The same imported `isReleaseDrained` call decides refusal; no second evaluation |
| Aggregate census has no blocked member | No blocked projection | Continue current reopen/query/final census/resume path |
| No active RUNS record | Caller starts one record; no join field | One existing attempt promise and starter-only cleanup |
| Active record, mixed build | No clock/trigger join projection | Immediate current `INVALID`; do not await |
| Active same-build record settles `CUT_OVER` | No join field | Return exact success answer |
| Active same-build record fails, measured clock | `joinedAttempt={originalTrigger,clockState,joinAgeMs,terminalAgeMs}` with `terminalAgeMs >= joinAgeMs >= 0` | Await exact stored promise; preserve settled answer identity/fields |
| Clock missing or any required `now` call throws | `clockState=unavailable`; affected ages/spend are `null` | Preserve the exact failed answer and the fact of a join |
| Sample is non-number, `NaN`, infinity, fractional, negative zero, or unsafe magnitude | `clockState=unsafe`; affected ages/spend are `null` | No coercion, clamping, alternate clock, throw, or outcome change |
| Safe samples yield unsafe subtraction | `clockState=unsafe`; affected ages/spend are `null` | No overflow/precision value reaches JSON |
| Safe sample order is start > join or join > terminal; seed terminal < start | `clockState=nonmonotonic`; affected ages/spend are `null` | Backward time is visible and never treated as zero elapsed |
| Starter trigger is an own primitive fixed trigger | `originalTrigger` is that fixed string | Request is otherwise unchanged |
| Trigger is inherited, accessor, Proxy/exotic, symbol-keyed, boxed, object, or arbitrary string | `originalTrigger=null`; accessor/Proxy trigger reads remain zero | Existing release path decides; diagnostic never rejects or coerces |
| First seed slot is empty and answer carries projection | Store that frozen bounded observation once | Existing retry proceeds |
| Slot is already populated | Retain first value | Later retries cannot rewrite history |
| Later client answer is `release_deadline` | Final answer remains exact deadline answer; first observations remain beside it | Failure stays red and terminal |
| Valid terminal seed time | Emit safe budget/spend/counters | Same deadline/order/retry/sleep |
| Invalid or throwing terminal seed time | Emit typed clock state with affected scalars `null`; counters and first slots remain | Final typed owner/client answer is unchanged |
| Nested control release is reshaped to `current_control_owner_fact` | No invented inner cause | Current outer answer remains the only observable result |

## Exact falsifying witnesses

### Existing protocol file: real aggregate drain and older join

Extend only `test/partition/participant-release-protocol.test.js`. For one new
case, use the existing `startLeader` binding in
`test/test-helpers/participant-transaction-fixture.js:370-424`, which constructs
its real `PartitionService` through `createControllablePartitionService` at
:372-397, installs the canonical committed-membership fixture at :427-441,
and opens current admission through existing owners. Register that service on
an actual `ReplicaHandler` and the existing in-process exact-identity transport.
Use the SQL-transactions schema for this one-member service so the release is
the control owner itself and does not fabricate a dependent control fact.

The case must:

1. Perform one actual operator release and require `CUT_OVER` before injecting
   work.
2. Use the established controllable-port pattern from
   `test/partition/partition-service-write-commit.test.js:98-149`: start one
   real service write, capture but do not commit its actual proposal, prove the
   write is unsettled, the row is absent, and `proposalQueue.size === 1`.
3. Wrap the existing `committedMembershipHandler` with the bounded gate pattern
   at `test/node/replica-handler-release-recovery.test.js:132-143`. Start the
   first registered operator-release message and wait until the real
   membership read enters the gate.
4. Give the handler only an explicit safe-integer `VirtualTimeSource` start,
   derive the ample unchanged release deadline from that clock, advance it one
   millisecond after the gate is entered, and issue the second same-build
   registered release. Production shares the NodeService clock with same-node
   composition; this focused handler-only clock proves cutover age sampling
   and client deadline arithmetic, not service-side/native physical Raft clock
   behavior.
5. Release the membership gate. Require one attempt engagement, two aggregate
   `DRAIN_PENDING` answers, the exact same blocked generation/work, starter
   without join projection, joiner with positive measured age, and the fixed
   starter trigger. Removing only `joinedAttempt` from the joiner must deep
   equal the starter answer. Import canonical `isReleaseDrained` and prove the
   projected work is not drained and its proposal count matches the real queue.
6. Commit the captured proposal through the controllable port, await the
   original write, restore the membership owner in `finally`, and require one
   later actual release to start fresh and reach `CUT_OVER` without join
   diagnostics. Keep the current mixed-build witness unchanged.

This exercises the production application/proposal queue, registered release
handler, facts, drain predicate, single-flight, answer freezing, and admission.
The controllable semantic port is an established test seam; this is not native
physical Raft proof. No test assigns queue, work, pause, origin, membership,
facts, or admission state.

In the same registered-handler file, add bounded table controls for:

- valid own-data trigger;
- inherited trigger;
- a trigger getter with exactly zero reads;
- Proxy input with zero `trigger` gets beyond existing required field gets;
- symbol key, boxed string, arbitrary string, and coercion objects whose
  `toString`/`Symbol.toPrimitive` counts remain zero;
- Object/Array/Map/Set prototype pollution, set and restored through the
  existing hostile-intrinsics fixture;
- `NaN`, both infinities, fractions, negative zero, unsafe magnitudes,
  backward sequences, derived-delta overflow, and a throwing clock;
- one join sampled while the ambient `Number.isSafeInteger` is replaced after
  the starter is gated, then restored before the owner continues.

These controls use a registered handler with no hosted partition and two
same-turn same-build messages only to expose the caller-specific failed join
projection with an exact four-read scripted clock: starter observation,
existing policy read, join observation, settlement observation. They retain
the exact `hosted_partition` failure and do not claim blocked work or an older
join. The real pending-proposal case above is the sole positive witness for
those claims.

The protocol test must not import the new diagnostic module or its internal
state strings. It proves primitive nonempty state equality/distinction and
numeric/null fields from behavior. Against source-only input with identical
test bytes, fixture construction, pending proposal, membership gate, and
same-build join all engage; the test then fails on the missing blocked/age
projection, not on a missing export.

### Named seed workflow witness

Add
`test/bootstrap/seed-participant-release-failure-projection.test.js` and
register that exact path in the interaction above. Build a narrow host with
`Object.create(createBootstrapServiceSeedWorkflowMethods())`, following the
real-method binding precedent at
`test/control-plane/core-system-logic-runtime-witness.test.js:195-267` but
providing only the fields consumed by `releaseSeedParticipantCohorts`.

The witness must run the actual workflow method and unchanged
`requestParticipantRelease` client. Use one shared injected virtual seed/handler
clock, one service, the actual participant-release authorization owner with a
current fresh-seed membership-owner outcome, and an in-process transport whose
single delivered reply is an actual frozen `releaseAnswer(DRAIN_PENDING, ...)`
carrying fixed first blocked/join projections. Give that reply a retry delay
equal to the small unchanged test budget; the host's real injected sleep
advances the clock by exactly the requested delay. On the second actual client
request, remaining time is zero, so `participant-release-client.js:34-39`
creates the terminal `release_deadline` without a second delivery.

Assert exactly one transport delivery, two workflow attempts, final answer
identity equal to the actual client deadline answer, first projections retained
unchanged, exact ordinal/total/completed/attempt counters, and measured
budget/elapsed/remaining scalars. Successful control answers carry no
diagnostics.

Table-drive terminal observation controls with the actual method/client:
safe, throwing, `NaN`, both infinities, fractional, negative zero, unsafe,
backward, and derived-overflow samples. Use an immediate actual frozen refusal
with no retry field when needed so current control flow decides failure before
the one terminal sample. Each case retains the exact answer, counters, and
first slots; only clock state and affected numeric fields differ. The test
does not duplicate retry classification or call the diagnostic helper.

Against source-only input with identical test bytes, the actual method and
client still deliver the first refusal and create the deadline answer; the test
fails because the terminal error lacks `seedRelease`/first-only custody. It
does not fail on a new export or copied classifier.

### Existing live startup and recovery witnesses

Keep these current tests unchanged as live-result witnesses:

- `test/integration/message-group-membership-claim-cache.integration.test.js`
- the three original startup cases in
  `test/bootstrap/node-bootstrap-consistency.property.test.js`
- `test/node/replica-handler-release-recovery.test.js`

Claim-cache/bootstrap reds remain real system failures at current bounds. A
dependent release may expose only outer `current_control_owner_fact` because
`releaseControlOwnerFirst` at cutover:138-168 currently discards lower answer
details. This projection neither diagnoses nor reconstructs that nested cause.
Focused green proves only diagnostic fidelity; it cannot prove startup repair,
native Raft behavior, C2/recovery closure, corpus readiness, or landing.

## Adversarial JavaScript / intrinsics disposition

The category at
`docs/development/verification-templates/adversarial-js-intrinsics.md` applies
only to the new projection input/observation surface.

1. **Numeric edge lattice:** clock tests cover `NaN`, infinities, negative
   zero, fractions, unsafe magnitudes, backward samples, and safe inputs whose
   subtraction overflows safe range. Every raw and derived number is checked
   by captured safe-integer logic; invalid fields are `null`.
2. **Own-property discipline:** trigger capture uses the existing strict
   null-prototype copy at `src/utils/strict-own-data.js:61-87`; inherited
   trigger is `null`.
3. **Accessor traps:** strict copy reads descriptors, not values; trigger
   getter count is zero. The copy is performed once for the starter, then
   discarded, so there is no reread or TOCTOU seam.
4. **Prototype pollution:** projection behavior is pinned while Object, Array,
   Map, and Set prototypes are polluted and restored. Fixed own output fields
   and primitive comparisons do not enumerate those prototypes.
5. **Boxed/exotic primitives:** boxed strings, objects, Proxies, symbol keys,
   and non-string values yield `null`; only four primitive strings pass.
6. **Mutable intrinsics:** the new helper captures every intrinsic it uses at
   module evaluation. The projection is pinned with ambient
   `Number.isSafeInteger` replaced after starter capture. The existing
   strict-own-data helper already captures its reflection/data-write
   intrinsics at :5-15; it is reused, not reimplemented.
7. **Serialization coercion:** trigger acceptance is type-pinned before direct
   equality; clock values are type/safety-pinned before arithmetic. No
   `String`, `Number`, JSON, digest, `toString`, or `Symbol.toPrimitive` is
   invoked on hostile input. The final existing JSON serialization receives
   only fixed strings, canonical facts records, safe numbers, and nulls.
8. **Array authenticity:** the new helper accepts no array and consumes no
   iterable. It neither uses an array allowlist nor relies on
   `Symbol.iterator`; fixed trigger comparisons are direct.

These controls do not harden or reinterpret unrelated release ingress,
deadline, transport, or answer logic.

## Binary receipts and approval bar

1. **One canonical blocked entry:** one imported-predicate `find` result both
   decides and labels aggregate `DRAIN_PENDING`; no copied predicate, second
   scan, or full census.
2. **First observations survive:** later retries and terminal deadline cannot
   overwrite the first blocked/join projections; no history grows.
3. **Typed relative time:** exact named samples produce measured,
   unavailable, unsafe, or nonmonotonic state; invalid and backward time never
   throws, clamps, coerces, changes an answer, or leaks an unsafe scalar.
4. **Accessor-free bounded trigger:** only a strict own-data fixed primitive is
   retained; adversarial trigger inputs have zero diagnostic getter/coercion
   reads and yield `null`.
5. **Exact shared promise:** same-build join awaits the stored promise and
   starter-only `finally` deletes it; mixed build and success stay unchanged.
6. **Underlying answer identity:** stripping only `joinedAttempt` from a
   projected failed join reproduces the settled owner answer exactly.
7. **Actual workflow/client retention:** the named seed witness receives one
   delivered refusal, then an actual client deadline answer, and proves exact
   final answer plus retained first observations/counters.
8. **Existing interaction registered:** both existing registry forms add the
   seed caller/client and exact seed witness while retaining exactly two
   coupled-pair endpoints and all existing owners/witnesses.
9. **Source-revert engagement:** identical protocol bytes reach pending work
   and join before missing projection failure; identical seed bytes reach the
   actual client deadline before missing retention failure.
10. **Healthy path and policy unchanged:** no success diagnostic/log, timeout,
    retry, parallelism, fallback, authority, admission, recovery, or shutdown
    change.
11. **Static and review gate:** exact approved scope passes syntax, exact
    ESLint, size, complexity, duplication, dependency, guideline including
    adversarial-intrinsics, shard, impact, and source-revert checks without
    baseline increase. Inherited reds remain attributed and the Quest remains
    HOLD until independent implementation review and locked evidence approve
    exact bytes.

## Claim ceiling

This unit can make current seed-release failures observable at their existing
owners. It cannot guarantee every failure crosses either projection point,
recover a nested control answer, identify root cause from source alone, repair
startup, justify a larger deadline, authorize parallel release or fallback,
change accepted-work/recovery/admission policy, certify native physical Raft,
close the C2/recovery integration, clear inherited reds, land the Quest, or
turn any measured red green.
