# Independent seed failure projection design review

Verdict: **REVISE before implementation.** The bounded diagnostic objective is
sound, and V2 closes the original first-observation, answer-identity, nested
control-answer, and claim-ceiling gaps. Four remaining design corrections are
required as one batch. This verdict does not authorize production/test edits,
metadata work, a lab run, a Quest seal, a repair, a timeout change, or landing.

## Exact binding

Reviewed design SHA256:
`6fb5a3b29e09697783ba36295211030c1d403f541a8e2467e59f3eeaf250c12b`
(`test-output/startup-intersection-20261013/seed-diagnostic-design-draft-v2.md`).
Reviewed integrated preservation HEAD:
`a3b5c63451c3cf968b3d7ec807a0381261d4b61f`; root records that its product
bytes equal candidate `6c27b10b6f3c8093f4baab149f20b6a79524aecf` and the commit adds evidence
only. I independently confirmed no tracked `src`, `scripts`, `test`,
`architecture`, or `docs` diff in this worktree before writing this ignored
review.

Load-bearing input fingerprints:

- cutover owner `de7c59950179093519f5a161e61768df9c25759980e0618543bb6e076df0d271`
- seed workflow `cf24ca03d57820f0870642034046556ad036bbe54b6c467e39a36f141344a8a6`
- participant client `5775bb980f25271bc458c493c908399ad7d25290844984a81b7adfd2bfe0dd5c`
- release contract `a7d2031ba6ecd98f43a506282f48cf3adab1c6bcb49ca595fb0c7078d9f2965c`
- release facts `fcc0d2daee5ef58382d98419094ac007cc1f74ec8f8d8435ffa2edfd6b56990e`
- strict own-data reader `2959845c9671dc783685d4758bcfc6b5b2d8ed57782c12a2eeece4a92fbba12f`
- interaction registry `63f610be8f25c15fbd981e04bb631c8dc7419087356e2dc84d008812d18bea33`

No source/test/registry file was edited or run by this verifier.

## What V2 gets right

The drain observation is properly subordinate to the canonical decision:
replace the one aggregate `some` at
`src/node/replica-handler-participant-cutover.js:253-257` with one `find`
using imported `isReleaseDrained` from
`src/partition/partition-participant-release-facts.js:62-65`, and use the
same found facts for both `DRAIN_PENDING` and the bounded projection. It does
not retain a second drain predicate, whole census, membership, SQL payload, or
authorization fact.

The proposed generation and work projection is bounded and names the actual
fact owners: generation is produced at release-facts:68-74 and work at
release-facts:46-59. The terminal seed answer remains the current answer;
write-once local slots retain only the first blocked drain and first joined
attempt for the currently failing service. V2 now explicitly admits that
`releaseControlOwnerFirst` at cutover:138-168 can replace a nested control
answer with outer `current_control_owner_fact`; this unit therefore cannot
claim to explain every startup failure.

The same-build join design preserves the existing single-flight key, stored
promise and starter-only identity-checked cleanup at cutover:302-320. The
caller-specific projection begins with the settled answer and uses the
existing `releaseAnswer` deep-freezing surface at
`src/partition/partition-participant-release-contract.js:176-179`; stripping
only `joinedAttempt` must reproduce every settled field. This is the right
way to preserve release ID, partition ID, phase, retry, reason, missing-fact,
control-owner and other optional fields rather than reconstructing identity
from the joining request.

The seed budget remains the one deadline created before the sorted loop at
`src/bootstrap/bootstrap-service-seed-workflow.js:260-267`; request order,
typed retry selection, sleep and termination at :277-297 remain unchanged.
Relative budget/elapsed/remaining values and service ordinal/counters are
bounded diagnostics. No absolute timestamp, history, durable row, timer,
authority, success path field, or new log is warranted.

## Required corrections

### R1. Bind both age and budget observations to the canonical node clock and define invalid-time output

V2:80-99 and :141-159 say ages and seed spend are finite nonnegative safe
integers, but do not define how this remains true if `now()` is fractional,
non-finite, unsafe, throws, or moves backward. Clamping a backward delta to
zero would hide the clock defect; throwing while constructing an optional
diagnostic would replace the underlying typed release answer. V2:158 also says
“No new read,” although a universally available terminal observation requires
one new terminal sample on paths where the current retry expression
short-circuits before `timeSource.now()`.

The revised design must pin one clock authority and one failure-only shape:

1. Production seed composition passes `nodeService.getTimeSource()` to the
   lifecycle owner at
   `src/bootstrap/bootstrap-service-replica-registration-methods.js:272-283`;
   shared setup passes that exact object to `ReplicaHandler` at
   `src/bootstrap/shared/replica-handler-setup.js:254-266`; handler stores it at
   `src/node/replica-handler-class.js:152-155`. This node-runtime `TimeSource`
   is the sole age clock. The seed workflow already reads the same node clock
   at seed-workflow:265. The design must say this explicitly; there is no host
   `Date.now` fallback for the new observations.
2. Sample start once when the starter record is created, join once immediately
   before awaiting the stored promise, settlement once after it settles, and
   seed terminal time once only after the existing control flow has already
   decided failure. The new reads feed diagnostics only. Correct V2's “no new
   read” claim to “no new wait or policy read; exactly the named observation
   samples.”
3. Add a fixed diagnostic observation state. With safe monotonic integer
   samples, emit the current numeric fields. If a sample is unavailable,
   noninteger/non-finite/unsafe, throws, or yields a negative/backward delta,
   retain the exact underlying answer and emit a fixed typed clock state with
   the affected relative scalar fields `null`. Distinguish at least
   unavailable/unsafe from nonmonotonic time; never coerce, clamp backward time,
   or omit the fact that a join occurred. The same rule applies to seed budget
   projection so optional diagnostics cannot make JSON serialization fail.
4. Pin numeric edge controls for `NaN`, both infinities, fractions, negative
   zero where relevant, unsafe magnitude and backward samples. This is required
   by the present clock contract: `RealTimeSource.now` delegates to nonmonotonic
   `Date.now` (`src/time/time-source.js:39-42`), while `VirtualTimeSource`
   accepts any finite start and finite positive fractional advance at :84-96
   and :150-178. Any new numeric
   guard uses a captured intrinsic or primitive comparison, not mutable
   `Number.isSafeInteger` looked up after module load.

The valid-clock protocol falsifier may inject a handler-only
`VirtualTimeSource`, because age sampling, release request deadlines and client
timeout arithmetic are all handler-owned in that fixture. It must give the
clock an explicit safe-integer initial value and derive both deadlines and age
samples from that exact object. State the limitation: production seed
composition shares the node clock with same-node services, while this focused
case does not certify service-side clock interactions.

### R2. Capture the trigger without executing or retaining hostile input

V2:80-85 promises never to retain an accessor, arbitrary string or object, but
a direct `request.trigger` comparison executes a getter and changes behavior on
paths that previously did not read `trigger` (notably the control partition,
which returns at cutover:139 before forwarding at :156-158). This diagnostic
cannot add an earlier hostile-input side effect or turn the original answer
into caught `UNAVAILABLE`.

The revised design must reuse the existing captured-intrinsics reader
`copyStrictOwnDataRecord` at `src/utils/strict-own-data.js:61-87` (or an
equally canonical existing ingress normalization, if the current owner already
has one by implementation time) solely to obtain an own enumerable data value.
If the request is a Proxy, exotic/inherited record, contains an accessor or
symbol key, or the value is boxed/non-string/not one of the four existing
`PARTICIPANT_RELEASE_TRIGGER` constants, the diagnostic trigger is `null` and
the original request continues through the existing owner unchanged. Do not
add a second request validator, reject the release, read the getter, coerce the
value, or retain the canonicalized request. Pin registered-handler controls
for data trigger, inherited trigger, getter with zero reads, Proxy, symbol,
boxed string and arbitrary string. This is a diagnostic projection check, not
new release-ingress certification. Perform the transient strict read once for
the starter record only, not for joiners or every retry branch. Thus its cost
is one pass over the release request's own keys per fresh attempt, with no
retained copy; `find` replaces `some` with the same short-circuit census cost
and there is no second scan or growing history.

### R3. Register the seed caller to cutover-owner interaction in the existing contract

V2 changes two semantic owners but says no metadata work. The registry currently
lists the seed workflow only under top-level `core-system-logic`
(`test/shards/impact-contracts.json:532-546`) and lists cutover/facts/contract
under coupled pair `raft-rs-runtime-application-transaction` at :1522-1577.
It has no seed caller endpoint for this new cross-owner diagnostic handoff.
That violates the owner-interaction template item10 and repository R02 even
though diagnostics confer no authority.

Revise scope to update the **existing**
`raft-rs-runtime-application-transaction` contract/coupled pair, never create a
parallel contract. Add the seed failure-projection caller
`src/bootstrap/bootstrap-service-seed-workflow.js` and its unchanged typed
transport seam `src/node/participant-release-client.js` to the appropriate
existing endpoint, retain the current cutover/facts/contract owners, and add
the exact seed-retention witness plus the aggregate/join protocol witness.
Keep the existing endpoints and all current witnesses. The `core-system-logic`
registration and witness remain valid for the workflow's separate readiness
handoff responsibility; do not rewrite that contract to describe participant
release diagnostics.

### R4. Make the two falsifiers exact and honest about their seams

The aggregate/join plan is behaviorally strong but V2 describes the current
protocol fixture as already having a controllable consensus port. It does not:
`test/partition/participant-release-protocol.test.js:40-60` constructs ordinary
`PartitionService`, while the established controllable semantic-port fixture
is `createControllablePartitionService` at
`test/partition/partition-service-test-support.js:29-56`. The proven pending
write pattern is `test/partition/partition-service-write-commit.test.js:98-149`.
Revise the witness to opt this one protocol case into that existing semantic
port seam, state that it proves the real PartitionService application/proposal
queue and registered release owner but is not native physical Raft proof, and
retain the unchanged real startup consumers as the live result. Do not
override private queue/work/pause/origin/facts or invent a port.

Name an exact seed-workflow witness path rather than “an existing bootstrap
test seam.” The only present direct consumer of
`createBootstrapServiceSeedWorkflowMethods` is
`test/control-plane/core-system-logic-runtime-witness.test.js:15-18,243-267`,
whose registered purpose is the unrelated steady-state writer handoff. Prefer
a narrow new or existing bootstrap-focused witness explicitly registered in
R3. It must use the actual workflow method and one shared injected seed clock,
return an actual frozen projected `DRAIN_PENDING` followed by actual client
`release_deadline`, preserve the final answer exactly, and prove first-only
retention/counters. A hand-built duplicate of release classification is not a
valid seam.

The protocol witness also needs source-revert treatment fidelity: identical
test bytes against the input source must reach the real pending proposal and
same-build join, then fail at the missing projection/age assertion rather than
at fixture construction or missing exports. The seed witness needs the same
behavioral red-on-revert property. Existing claim-cache/property failures stay
reported as live consumers, not expected-green tests.

## Complete verification-template disposition

Every applicable item is disposed below. “Preserve” is a design obligation for
the eventual implementation; no item is claimed measured on a candidate.

### Admission / gating — 7 items

1. **Precheck/enforcement:** preserve the same authorization, leader, origin,
   complete facts/census, drain and final resume owners at cutover:200-299;
   diagnostics never pre-admit or release. One canonical found entry decides
   and labels the aggregate hold.
2. **Classification:** preserve every existing outcome and consumer branch.
   `DRAIN_PENDING` remains retryable through its existing `retryAfterMs`;
   terminal `release_deadline` remains `UNAVAILABLE`. Diagnostic clock states
   required by R1 are observations, never release outcomes.
3. **Budget:** the one existing seed `leadershipWaitTimeoutMs` deadline at
   seed-workflow:265-293 governs. No new wait, retry, reset or increase.
4. **Reason shape:** preserve `releaseAnswer` fields byte-for-value; seed keeps
   the final answer in its current JSON error. R1 and R2 prevent optional
   fields from throwing/coercing into a different reason.
5. **Release path:** actual proposal commit drains the work; a later cutover
   starts fresh through the canonical owner. Diagnostics create no wake.
6. **Freshness:** cutover still rereads cohort facts before enable/final resume
   at :245-299. Retained observations are reporting only and cannot veto later
   fresh facts.
7. **Message honesty:** `blockedDrain` is copied from the exact first found
   member, not the caller or full cohort; seven generation fields disambiguate
   lifecycle ownership. `joinedAttempt.originalTrigger` identifies only the
   starter when safely captured. For a dependent release, the outer
   `current_control_owner_fact` may still be all that survives; the projection
   cannot label a discarded nested control cause.

### Concurrency / single-flight — 5 items

1. **Sync/async gate:** existing handler-local RUNS map at cutover:302-320 is
   the synchronous single-flight; authoritative census is the async backstop.
   The stored promise, partition key and same-build equality remain exact;
   mixed build remains immediate `INVALID`.
2. **After-await validity:** no diagnostic authorizes an act after await;
   existing final census/control/final resume checks remain at :278-299. R1
   samples join before the exact await and settlement after it, then projects
   from the settled answer; it cannot revive a deleted record or rewrite owner
   identity.
3. **Single winner:** starter creates the one promise; joiner awaits it and
   cannot mutate/dequeue the record. Starter identity-checked `finally` remains
   sole cleanup.
4. **Timer reentrancy:** existing release-recovery callers can interleave and
   join the same RUNS record, but no diagnostic timer, cleanup owner or work is
   added. Seed retains existing sleep/retry; cutover join is passive.
5. **Key honesty:** key remains handler plus partition and build comparison;
   no release ID/trigger/age becomes a key or lifetime input.

### Owner interaction — 10 items

1. **Single question owner:** `isReleaseDrained` alone decides drain;
   diagnostics only identify its selected facts.
2. **Typed boundary:** release contract owns answer shape; participant client
   transports intent/result; facts supply evidence; cutover adjudicates and
   acts; seed retains optional projections only. R3 must register the
   interaction. No boolean option bag or answer alias is introduced.
3. **Paired invariant:** one deterministic protocol witness must show real
   queued work leaves admission/refusal behavior unchanged and causes the found
   hold while same-build callers still share one promise; seed witness must
   show accurate first retention while final answer stays the deadline. A
   source-only revert removes evidence but preserves the refusal.
4. **Stale then fresh:** commit the proposal and require a later fresh cutover
   without join diagnostics. Retained seed observations do not enter later
   attempts.
5. **Pressure/backoff:** same promise, same deadline, same retryAfter and same
   serial seed loop; no caller amplification or urgency flag.
6. **Wake/release:** proposal commit/application changes the canonical facts;
   a later ordinary release reruns the owner. No diagnostic polling.
7. **Projection authority:** blocked/age/budget records never validate
   authorization, choose leadership, resume admission or classify success.
   The complete projection inventory is `blockedDrain`, `joinedAttempt`, and
   terminal `seedRelease`; no operational caller may branch on any of them.
8. **Treatment fidelity:** R4 requires engaged source-revert failures with
   exact source/test hashes and keeps existing startup reds outside positive
   certification.
9. **No escape hatch:** no copied drain expression, nested-control inference,
   alternate deadline/retry loop, raw queue/facts reads in the seed caller,
   force flag or fallback success. Implementation review must repeat this
   touched-caller search.
10. **Registry/proof:** **REVISE per R3**; current registry lacks the seed to
    cutover projection interaction and exact seed witness.

### Harness fidelity — 6 items

1. **Right red:** R4 requires the revert to reach pending work and a positive
   aged join before failing on missing diagnostics.
2. **Stub honesty:** use the established controllable semantic port only for
   proposal/commit and membership gating; run real application queue, release
   route, facts and admission owners. State the native-physical limit.
3. **Time fidelity:** protocol fixture gives its handler-only virtual clock an
   explicit safe-integer start; release deadlines and age samples use that same
   clock, then advance one millisecond with ample unchanged deadlines. Invalid,
   fractional and backward controls prove diagnostics neither drive time nor
   mask a clock defect. This seam does not certify service-side clock sharing.
4. **Field fidelity:** real facts supply all generation/work fields; the seed
   sequence uses actual frozen answer shapes and the actual workflow/client
   boundary. It is labelled a deterministic boundary witness, distinct from
   live startup.
5. **Nonvacuity:** assert proposalQueue size one, row absent, write unsettled,
   membership gate entered, found work not drained, one starter and one joiner,
   positive join age, exact first-only retention, later real success, and
   unchanged mixed-build refusal.
6. **Live binding:** unchanged claim-cache/bootstrap properties remain actual
   startup result witnesses. Focused green can prove projection only, not
   startup repair.

### Retry loops — 7 items

1. **Retry fires:** unchanged seed loop retries only from typed delay and
   existing sleep at seed-workflow:277-293; first-observation custody does not
   suppress it or any existing visible refusal/rescue.
2. **Frozen bound:** one shared deadline and original budget remain; diagnostic
   time never changes stop decisions. Missing/unreadable observations use the
   current typed answer; there is no timestamp fallback.
3. **Loud exits:** enumerate and retain current exits: `CUT_OVER` success;
   absent/invalid/negative retry field; retry that no longer fits remaining
   deadline; loop deadline after sleep; authority/build refusal; or typed
   owner/transport failure followed by the existing terminal throw. The throw
   retains the exact final answer; R1 adds typed clock-observation state rather
   than replacing or hiding its reason.
4. **Mutual suppression:** no new re-drive owner or A/B deferral is added;
   nested control limitation is reported, not bypassed.
5. **Storm ceiling:** request cadence/count and serialized one-service loop
   remain current. At most one 15-scalar blocked record and one four-scalar
   joined record are retained by reference for the current service; terminal
   seed output adds seven budget/position counters, one fixed clock state, plus
   those two bounded records. RUNS adds two scalar observations to its existing
   one record.
   Nothing grows with retries or the 138-service cohort, and no per-retry or
   healthy log is added.
6. **Duplicate effects:** retry still enters cutover single-flight and current
   idempotent release owners; projections perform no mutation.
7. **Reset:** attemptCount and both first slots reset at each service; completed
   and ordinal live only for one `releaseSeedParticipantCohorts` invocation.
   None controls retries or success. Transport ACK still must carry a delivered
   release result at participant-client:41-54 and cannot reset counters as a
   success by itself.

### Formation circularity — 5 items

1. **Self-dependency:** seed release may depend on control partition and
   partition facts during formation. Seed reads build, sorted services and
   fresh-seed authority, then calls the participant client; cutover reads the
   SQL control owner, durable origin, committed membership, release facts and,
   for SQL control, transaction rows before pause/resume. Degraded paths are
   typed control-owner/fact unavailable, drain/query-drain pending, operator
   required or deadline. Projection adds no database/query/cache dependency
   and must not infer discarded nested control causes.
2. **Re-drive starvation:** no new CDC/cache-dependent wake is introduced;
   current request/retry and release owners remain. Retained observations are
   labelled history, never a cached admission answer or new re-drive input.
3. **Formation clients:** fresh seed remains blocked/failed under its current
   budget; diagnostics do not turn that into readiness or an expected pass.
4. **Window arithmetic:** the measured formation has 138 services sharing one
   serialized seed deadline. Report failing ordinal/total/completed plus
   budget/elapsed/remaining at the unchanged bound. Missing nested cause and
   unmeasured end-to-end margin stay explicit; no timeout tuning follows from
   a diagnostic hypothesis.
5. **No bypass:** no direct admission write, parallel release, larger budget,
   fallback authority, raw facts mutation, fixture-granted authority or
   detached old-attempt workaround.

## Design-note refutations

### D1. Current consumed surfaces are source-bound; no test seam is assumed

- Seed workflow reads measured build, sorts the current partition services,
  mints fresh-seed authority, creates the one deadline and performs the serial
  retry loop at
  `src/bootstrap/bootstrap-service-seed-workflow.js:255-298`.
- The participant client owns remaining-deadline request timeout and delivered
  result shaping at `src/node/participant-release-client.js:21-64`.
- Cutover owns control-first release, pause, exact facts/census, aggregate
  drain, final revalidation and actuation at
  `src/node/replica-handler-participant-cutover.js:138-168,200-299`; RUNS owns
  current single-flight at :302-320.
- Facts own the eight work values and sole drain predicate at
  `src/partition/partition-participant-release-facts.js:46-65`; generation is
  produced at :68-74. The release contract owns the frozen answer at
  `src/partition/partition-participant-release-contract.js:176-179`.
- Production seeds pass the one NodeService clock through
  `src/bootstrap/bootstrap-service-replica-registration-methods.js:272-283`
  and `src/bootstrap/shared/replica-handler-setup.js:254-266`; handler stores it
  at `src/node/replica-handler-class.js:152-155`. The seed loop reads that same
  node clock at seed-workflow:265.
- The current protocol fixture constructs ordinary services and handler at
  `test/partition/participant-release-protocol.test.js:40-60`; it does not yet
  expose a controllable port. The existing semantic-port binding is
  `test/partition/partition-service-test-support.js:29-56`, with production
  application transaction commit at
  `test/test-helpers/controllable-consensus-port.js:115-176` and committed
  membership seam at :248-259. The existing awaited membership gate pattern is
  `test/node/replica-handler-release-recovery.test.js:132-143`. These are
  feasible ingredients, not current proof that the proposed combined fixture
  engages.

### D2. Every diagnostic edge preserves the underlying result

The revised decision table must cover: actual blocked drain; no blocked drain;
starter versus joiner; already successful settled answer; failed settled
answer; same build versus mixed build; no existing run; trigger valid versus
null/unowned/accessor/Proxy/boxed/arbitrary; valid integer samples; unavailable,
throwing, fractional, nonfinite, unsafe or backward clock samples; first slot
empty versus already populated; and final deadline answer after an earlier
projection. No-drain and successful answers gain no failure projection.
No-join gains no `joinedAttempt`. Invalid time produces the fixed diagnostic
clock state with null affected scalars while the exact owner answer remains
unchanged. Mixed build remains `INVALID`; terminal seed failure retains its
actual final answer. A nested control answer discarded by current outer shaping
remains unmeasured rather than reconstructed.

### D3. Volatile custody is constant and cannot become authority

RUNS remains one weakly handler-owned map of one record per active partition;
the proposed record adds only starter time observation and bounded trigger.
Same-build joiners neither replace the promise nor participate in cleanup;
starter identity-checked `finally` at cutover:317-320 remains the only record
invalidation. The seed loop creates two nullable first-observation slots for
the current service, resets them and attemptCount at the next service, and
drops all local custody when `releaseSeedParticipantCohorts` returns or throws.
Completed/ordinal live for that invocation only. There is no durable restore,
global cache, timer, new log stream, array/history, handler retention or
shutdown obligation. None of these fields is read by authorization, drain,
retry, deadline, admission, recovery, success or readiness decisions.

### D4. Projection identity remains historical evidence after movement

`blockedDrain.generation` is anchored to the exact facts producer's node,
owner incarnation, replica, lifecycle, runtime, connection and admission
generations; work comes from that same found facts record. `originalTrigger`
comes only from safe fixed starter input. Ages come only from handler-clock
samples around the exact stored promise. The joined answer begins with the
settled owner answer after await and preserves all identity/optional fields;
joining request identity never rewrites it.

If term, configuration, membership, service or any generation changes on a
later retry, the first retained block stays explicitly historical evidence of
what the earlier owner actually examined. It cannot authorize or veto the new
attempt; current facts and the final owner answer decide. A later service gets
fresh slots, and a fresh cutover after starter cleanup gets a new RUNS record.
The design intentionally does not project term/configuration/membership, so it
cannot claim those caused a historical block; the seven generation fields only
disambiguate the producing owner/lifecycle record.

## Approval bar after revision

A revised design can be approved without changing the diagnostic objective if
it resolves R1-R4 exactly: canonical production node clock plus typed
invalid-time projection and an explicitly scoped handler-clock test,
accessor-free bounded trigger capture, existing interaction contract
registration, and exact honest protocol/seed witnesses. Keep V2's
one-find rule, first-only custody, terminal-answer preservation, RUNS lifetime,
nested-control claim ceiling, unchanged budgets and actual startup reds.

Implementation, a sealed red, generated metadata, candidate/revert lab proof,
static baselines and independent implementation review remain future gates.
This review neither diagnoses nor repairs the current startup failure and does
not clear C2, recovery integration, inherited static reds, corpus, main, or
publication.
