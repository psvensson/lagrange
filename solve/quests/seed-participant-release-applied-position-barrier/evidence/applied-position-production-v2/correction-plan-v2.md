# Applied-position production V2 correction plan — additive D1–D4 supersession

Status: **design only**. This document adds the complete D1–D4 corrections to `correction-plan-v1.md` SHA-256 `99f11f83e3888d0d90dec8a54cf1809d7068aaef54b376da2edb94b20879034e`. It supersedes that plan where the two differ and retains every accepted current-context, retained-wake, publication, final-census, registry, proof, and claim-limit provision. Its binding review is `solve/quests/seed-participant-release-applied-position-barrier/evidence/applied-position-production-v2/correction-plan-independent-review-v1.md` SHA-256 `6e171854072032c25cf924dd433373a535830285a1dc30323aa867f51f829194`. No source, test, script, generated metadata, Quest record, Git history, or behavior run is changed here.

The rejected source remains immutable commit `bb976f03b1dca9989cfd990af7f188e490ac5243`, source tree `aeb56ee8f9a208b693dc2251a11558e7d11386a1`, snapshot `/tmp/session-worktree-Q14Yjd/tree`. The active worktree's V1 source bytes remain frozen. Native V10 test SHA-256 `01518ea0132c2806d268c265e642fd9e2a54a3f05568ef49256f8acf4698c8c2` is also frozen and is not implementation proof.

## Exact correction scope

The eventual one-batch source correction may change only these existing owners plus ordinary generated metadata after approval:

- `src/node/replica-handler-lifecycle-methods.js`: the actual registered dispatch boundary, before its current raw `payload.type`/`payload.action` reads at lines 134–143;
- `src/node/replica-handler-participant-release.js`: one release-ingress capture result, the OBSERVE-only canonical request/current-context decision, and no second identity algorithm;
- `src/node/participant-release-applied-position-observation.js`: immutable observation records, conditional refresh, exact settled-promise joins, and same-record resource custody;
- `src/node/participant-release-client.js`: one shared capped-window arithmetic operation and sender/receiver request-budget policy;
- `src/node/participant-release-diagnostic-observation.js`: a bounded export of the existing captured primitive safe-clock predicate at lines 24–26; signed diagnostics stay unchanged;
- `src/partition/partition-participant-release-contract.js`: the existing canonical generation field/domain validator needed to validate a copied target without copying its field list or projection;
- `src/partition/partition-participant-transaction-pause.js`: the sole replica-generation projection and private facts assessment for authentic committed-N/current-K applied lag;
- `src/node/replica-runtime-cleanup-custody.js`: prompt cancellation inside the already-owned shutdown settlement and final retained-custody failure aggregation;
- `src/partition/partition-participant-transaction-cutover-constants.js`: the domain-owned cleanup-incomplete reason value;
- `test/shards/impact-contracts.json`: the already approved two existing forms/endpoints only.

All publication, port/event, service-shutdown-entry, cutover, final classifier, RESUME, and impact bytes accepted from V1 remain in the batch but are not redesigned here. `src/utils/strict-own-data.js` needs no change: `copyStrictOwnDataRecord` already captures its descriptor/proxy/prototype intrinsics and never invokes a caller getter. No new module, result classifier, resource store, retry driver, timer policy, release algorithm, or generic message grammar is introduced.

## D1 — one registered-ingress capture before any release discriminator

### Safe discrimination and explicit malformed-input effect

`ReplicaHandlerLifecycleMethods.handleMessage` receives an internal router envelope, but its `payload` is the caller's message. After obtaining that router-owned payload/correlation pair, it calls one `captureParticipantReleaseDispatch(payload)` owned and exported by `replica-handler-participant-release.js` **before** reading `payload.type`, `payload.action`, `payload.replicaId`, or `payload.partitionId`. The capture first calls `copyStrictOwnDataRecord(payload)` and reads the type only from that null-prototype copy. It returns one internal tagged result:

1. `ordinary`: the strict copy has a primitive string type other than `PARTICIPANT_RELEASE_TYPE`; lifecycle dispatch uses the captured type but passes the original ordinary payload to the existing ordinary dispatcher, preserving valid CREATE/REMOVE/STEP_DOWN/read behavior;
2. `release`: the strict copy names `PARTICIPANT_RELEASE_TYPE`; lifecycle dispatch passes the returned captured request and internal validation tag to `runParticipantCutover` or `receiveParticipantRelease`, and never rereads the raw payload;
3. `malformed`: the payload is a proxy, accessor-bearing/non-data/non-enumerable/symbol-keyed/noncanonical record, or its discriminator is not a primitive string. Because no implementation can safely discover whether such a payload hides a release type without invoking it, lifecycle dispatch returns the existing unknown-message response using an inert undefined type. It invokes no ordinary or release action owner.

That third case is the unavoidable registered-ingress effect and is explicit scope, not a hidden generic policy change. Valid ordinary message shapes and outcomes are unchanged. Malformed ordinary participant-release actions become fail-closed before side effects. Non-strict generic payloads are likewise refused rather than probed; no new accepted generic shape is created. The envelope grammar and transport behavior are unchanged.

### One immutable release request

For a release-tagged top-level copy, the same capture operation strictly copies each present declared nested record `release`, `attempt`, `target`, and `origin`, substitutes only those copies into the copied top-level request, and freezes the nested records and request with a module-captured freeze intrinsic. It never retains or rereads those raw nested objects after capture. Other action-specific values such as census, query proof, and authorization retain their existing owners and validation policy; this correction does not recursively decode them.

Before any canonical release hash/serialization, map lookup, clock read, subscription, timer, registry lookup, or service lookup, capture pins the declared scalar domains:

- `type`, `action`, `partitionId`, and `replicaId` are primitive strings where the action requires them;
- release `partitionId`, `targetBuildDigest`, `configurationKey`, and `releaseId` are primitive strings; `protocolVersion` and `membershipGenerationIndex` are safe integer primitives in their existing canonical domains;
- attempt `term` is a positive safe integer, `leaderReplicaId` is a nonempty primitive string, `deadlineAtMs` is a nonnegative safe integer excluding negative zero, and `leaderLifecycleIncarnation` accepts the existing native nonempty-string form and controllable-fixture positive-safe-integer form;
- top-level `deadlineAtMs` and OBSERVE-only `observationDeadlineAtMs` use the exported captured safe-clock predicate plus their nonnegative rule;
- target generation validation delegates to a bounded validator beside `GENERATION_FIELDS`/`sameReplicaGeneration` in `partition-participant-release-contract.js`. That owner pins node/replica strings, positive safe numeric generations, and the same existing native-string/controllable-number lifecycle incarnation domain. No caller restates the seven-field list or constructs a generation;
- origin uses primitive positive safe integers and then the existing `originEqual(copiedOrigin, copiedOrigin)` owner check.

Only after those pins does the capture call existing `releaseIdentityValid` once for a request that has a release. The resulting internal tag means the OBSERVE-specific R/O path consumes that canonical identity result; it does not hash again. Existing ordinary action decisions remain owned by R/K, but malformed nested records now reach their existing INVALID outcome without coercion. The existing K/Map/Set algorithms outside this captured boundary are not thereby certified against arbitrary ambient mutation.

### Coherent OBSERVE tuple before effects

An OBSERVE capture is valid only when all of these hold together:

- action is exactly `OBSERVE_APPLIED_POSITION`;
- `request.deadlineAtMs === request.attempt.deadlineAtMs`;
- `request.partitionId === request.release.partitionId`;
- `request.replicaId === request.target.replicaId`;
- the copied release passed the one canonical identity/hash validation;
- the copied attempt, target, and origin passed their existing owner domains;
- the carried observation deadline is present and no later than the overall deadline.

An incoherent tuple returns existing `releaseAnswer(INVALID, safeCapturedRequest)` before map/budget/resource effects. The response can use only already captured safe identity fields. A coherent valid tuple that conflicts with a retained record is STALE. R's OBSERVE decision consumes this exact captured intent for registry/service lookup and every post-await fence; O never constructs or recaptures it.

## D2 — one cap operation, one captured lifetime clock/scheduler

`participant-release-diagnostic-observation.js` exports its existing captured `safeClockInteger` under one bounded participant-release name. It does not alter `readParticipantReleaseClock`, signed age calculations, state precedence, or diagnostic serialization.

`participant-release-client.js` owns one private capped-window arithmetic operation used by both existing ordinary request timeout selection and OBSERVE budgeting. It uses module-captured min/max/freeze operations (or equivalent primitive comparisons) and the exported captured safe-number predicate; no call site duplicates `REQUEST_TIMEOUT_MS` arithmetic. Policy remains specialized:

- ordinary actions retain their current missing/invalid-deadline fallback, `ownerNow` behavior, 5,000 ms maximum, and observable timeout result;
- OBSERVE requires safe nonnegative, non-negative-zero `now`, overall deadline, and carried ceiling with `ceiling <= overall`. It computes safe nonnegative `overallRemaining` and `ceilingRemaining` first, then caps the smaller remaining duration at the existing 5,000 ms. Only after that does it form and validate `observationDeadlineAtMs = now + timeoutMs`. Thus `now = MAX_SAFE_INTEGER - 1`, deadline/ceiling `MAX_SAFE_INTEGER` yields one millisecond without first overflowing `now + 5000`.

The sender takes exactly one clock observation to derive both timeout and the carried absolute `observationDeadlineAtMs`; the original request/attempt deadline is its ceiling. The receiver requires that carried ceiling and never defaults it or derives a new arrival window.

A new record captures `const scheduler = handler.timeSource` once before the receiver's one registration sample. That exact object owns all later clock observations, `setTimeout`, and `clearTimeout`; replacement of `handler.timeSource` cannot change the stored record's clock domain or retire a handle through a different scheduler. Matching joins do not sample a clock or install a timer. The timer callback uses the same captured scheduler and keeps overall-expiry precedence:

1. unusable observation: existing typed UNAVAILABLE for the reply dependency, with no fallback clock;
2. `now >= request.deadlineAtMs`: UNAVAILABLE / `release_deadline`;
3. otherwise `now >= observationDeadlineAtMs`: UNAVAILABLE / `replica_release_reply` / existing `MESSAGE_TIMEOUT` reason;
4. otherwise no expiry decision.

There is no timeout increase, renewal, poll, sleep, extra sample at dispatch, fallback clock, or changed ordinary-action policy.

## D3 — exact coherent joins and nonrenewal

The per-handler map remains bounded by exact hosted replica identity. A record stores the immutable captured intent, exact service/port/registry identities, captured scheduler, effective deadlines, timer/resource slots, terminal answer, and the **inner** `Promise.withResolvers().promise` before it is inserted.

A join first completes the same ingress capture and coherence validation. It matches only exact action, partition, replica, canonically valid release identity, full attempt (term, leader replica, lifecycle incarnation, and original deadline), full target generation, origin, and carried observation ceiling. A changed top-level deadline with unchanged attempt deadline is INVALID. A coherent changed top-level+attempt deadline pair is a valid conflicting intent and therefore STALE; it never renews or shortens the starter.

When a call captures an existing exact record, it saves that record and its stored inner Promise before doing anything else. It returns that same inner Promise even when the record has already settled and is retained for cleanup debt. The call may re-attempt that same record's failed cleanup, but it cannot fall through to starter creation if cleanup removes the slot during the call. Registered async wrappers naturally return adopting outer Promises, so public controls prove unchanged owner answer/nonrenewal; source review proves inner stored-Promise identity. Once a successfully cleaned record has been fully removed, a later genuinely fresh call may create a new record. There is no perpetual memoization or completed-intent store.

Starter-tail map deletion still compares exact record identity. Registry replacement/removal synchronously terminalizes the exact old record while a facts read is held; a late read/callback cannot delete a successor or change the settled answer.

## D4 — exact resource-slot custody and reentrant acquisition

### Resource grammar and bounded state

Every exact record declares a fixed slot before acquiring each resource: four native Raft subscriptions, one tracked-service-registry subscription, one service shutdown listener/removal closure, and one timer. Each slot has a bounded state (`pending`, `owned`, `failed`, or `retired`), exact returned handle/closure where one exists, and at most the first actual cleanup error. Repeated joins, callbacks, lifecycle cancellation, and shutdown retries do not append errors. A successful retry clears that slot's retained error and retires the slot once. There is no parallel debt map, retry timer, backoff, or unbounded counter/array.

Cleanup follows the actual APIs:

- Raft and registry unsubscribe closures return `Set.delete`; either `true` or `false` is idempotent successful retirement, and only a throw is failure;
- service `off`/`removeListener` returns the emitter; return value is ignored and no throw means success;
- captured-scheduler `clearTimeout` returns void; no throw means success;
- a timer callback first marks its own handle fired/retired before terminal cleanup, so cleanup never claims an already-fired timer remains owned.

The new wire reason is named once in `partition-participant-transaction-cutover-constants.js` (planned owner key `PARTICIPANT_RELEASE_REASON.CLEANUP_INCOMPLETE`, value `participant_release_cleanup_incomplete`) and imported. Cleanup debt settles the original stored Promise once with the existing shape `UNAVAILABLE`, `missingFact: 'replica_release_reply'`, that owned reason, and existing pause retry-after. It creates no new result API.

### Pending acquisition and synchronous cancellation

`installObservation` inserts the fully formed record before invoking any resource owner. For each acquisition it marks the slot pending first, invokes the owner once, stores the exact returned closure/handle, and immediately rechecks terminal/inactive state before acquiring the next resource.

If subscription, registry, service-listener, or timer installation synchronously triggers replacement, shutdown, deadline, or other terminal cancellation, cleanup may observe the pending slot but cannot declare it retired. When the acquisition returns, its late closure/handle is attached to that same slot and immediately retired under the same record; installation stops and never resumes with later resources. If the acquisition throws, that exact error remains in that slot, installation stops, and the record remains reachable. A synchronously fired timer is marked fired before the late timer handle is processed; if another terminal cause won, the late handle is cleared through the captured installing scheduler. Callbacks are nonthrowing and nonawaiting: they record the terminal decision, attempt fixed-slot cleanup, and retain any error in the record.

### Settlement, retries, and handler shutdown

Terminal transition happens once and preserves its chosen semantic answer. It attempts every acquired resource independently. If all resources retire, exact identity-checked map deletion occurs and the stored Promise resolves with that answer. If any resource release fails, the stored Promise resolves once with cleanup-incomplete UNAVAILABLE; the failed record, exact handles/closures, first actual errors, and stored settled Promise remain in the same observations map and block replacement. Later exact joins or lifecycle callbacks may retry only failed/late-owned slots; their cleanup result cannot rewrite the stored answer or Promise.

`cancelParticipantAppliedPositionObservations(handler)` remains the sole synchronous lifecycle entry. It terminalizes every record, attempts every current slot independently, catches internally, and returns a bounded snapshot of still-retained actual resource errors rather than throwing into a callback. `shutdownReplicaHandler` calls it after `shutdownPromise` and shutdown flags are installed and before the first existing await, as V1 already requires. After all existing recovery, task, and service release attempts, shutdown calls the same custody operation again to retry retained slots and adds every still-current actual resource error to the existing shutdown `AggregateError`. It still attempts every independent service release. Failure resets/rejects through the existing `shutdownPromise` settlement at `replica-runtime-cleanup-custody.js:132–135`; no synchronous observation exception can strand that Promise. A later shutdown retry reaches the same map/slots.

A pending synchronous acquisition cannot survive its JavaScript call frame; reentrant shutdown yields at its existing awaits, allowing the late handle path above to finish before the final custody check. If its owner throws, that actual error is retained. No fabricated boolean failure convention or synthetic cleanup success is used. Observation custody never authorizes storage deletion.

## Retained PA/R decision and proofs

All accepted V1-plan behavior remains binding: PA alone measures committed membership and current status, exposes its existing replica generation through one bounded owner export, and privately distinguishes only the authentic same-term/configuration/membership-generation committed-N/current-K applied lag. R alone combines that assessment with exact current registry/service/port/build/pause/attempt/term/leader/configuration/membership/full-generation fences after every await. Unreadable membership, unavailable build, changed lineage, lifecycle, or any other defect remains its real refusal. O consumes `{answer, refreshEligible}` and may reread only for a retained wake plus that still-current eligibility or for valid below-watermark facts. A first satisfying observation returns without a second read. Ordinary PA/recipient await races remain inherited and uncertified.

V10 and all existing real-owner controls remain frozen. Future proof must cover the registered ingress, primitive/boxed/proxy/accessor/mutation lattice, coherent tuple bindings, near-MAX arithmetic, one captured scheduler, fresh-first-read, authentic retained wake, exact settled join/nonrenewal, registry replacement, every fixed cleanup slot including reentrant late handles, native N/K, final classifier/RESUME/K+1, and both existing impact forms. Tests must exercise actual owners rather than mirror the formulas. Existing hard budgets remain unchanged; any healthy expiry is a system red.

Independent exact-source review, static/impact/shard/selection gates, immutable same-host source controls and treatments, startup evidence, corpus proof, Quest receipts, integration, landing, and main remain HOLD. This additive plan is not source approval or behavior evidence.
