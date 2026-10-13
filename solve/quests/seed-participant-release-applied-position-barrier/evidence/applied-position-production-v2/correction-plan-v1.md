# Applied-position production V2 correction plan

Status: design only. No source, test, fixture, registry, generated metadata, Quest record, Git history, or behavior run is changed by this file.

## Binding and scope

This plan responds to all S1-S8 and all 48 category dispositions in `solve/quests/seed-participant-release-applied-position-barrier/evidence/applied-position-production-v1/independent-source-review-v1.md` SHA-256 `7350c29ef69a49da0e16c512d2330ca9ea2814c4a7c6a05b2191db3d9c4c526a`. The rejected immutable source is commit `bb976f03b1dca9989cfd990af7f188e490ac5243`, source SHA `aeb56ee8f9a208b693dc2251a11558e7d11386a1`, snapshot `/tmp/session-worktree-Q14Yjd/tree`, relative to integrated parent `9ba9a1941b2326d0d0bcfa49c581cc2fcf74af8d`. The current preservation head is `3ebc7da41a92ed4196bf87eb8aaf039ef604dfc4`; its production/impact bytes are the reviewed V1 bytes. Native V8 test SHA `56de6d74e80e9d07228af9a9eb23a90fe9d47932017fbfa8b0b66db94d048066` remains frozen.

The V2 production delta is bounded to:

- `src/node/participant-release-applied-position-observation.js` (observation intent, single-flight scheduling, retained wake, exact resource custody);
- `src/node/participant-release-client.js` (the sole request-budget arithmetic owner);
- `src/node/participant-release-diagnostic-observation.js` (a bounded export of its captured primitive safe-clock predicate; diagnostic sampling stays unchanged);
- `src/node/replica-handler-participant-release.js` (the canonical OBSERVE request/context decision);
- `src/partition/partition-participant-transaction-pause.js` (the sole facts assessment and existing replica-generation projection);
- `src/node/replica-runtime-cleanup-custody.js` (surface retained observation cleanup debt through the existing handler shutdown settlement);
- `test/shards/impact-contracts.json` (the existing two registry forms only).

No strict-own utility change is planned: `copyStrictOwnDataRecord` already rejects proxies, accessors, symbols, arrays and noncanonical prototypes without invoking user getters. No runtime publication, Raft port, release classifier, cutover sequence, ordinary action, retry driver, timeout, or admission source is added or changed.

## Input and budget boundary (S2, S3, S7)

`participant-release-applied-position-observation.js` will capture an OBSERVE intent before map lookup, budget acquisition, subscription, or timer creation. It will shallow-copy the top-level request and each declared nested record (`release`, `attempt`, `target`, `origin`) with `copyStrictOwnDataRecord`, validate the copied release through existing `releaseIdentityValid`, validate the copied generation/origin through existing `sameReplicaGeneration`/`originEqual`, and freeze the copied declared fields. The record never retains the caller's raw request or rereads it after an await. Missing, inherited, accessor-backed, proxy, boxed, symbol, mutable-after-call, malformed or noncanonical declared data returns `releaseAnswer(INVALID, copied-or-empty-request)` before effects. Valid current plain and null-prototype producers remain accepted.

The immutable intent includes both the original `deadlineAtMs` and mandatory carried `observationDeadlineAtMs`. A join first passes the same capture and canonical release validation, then compares exact partition/replica/action, full canonical release identity, full attempt including original deadline, target generation, origin, and carried ceiling. Only an exact valid join receives the stored starter Promise/timer/deadline. An invalid body is `INVALID`; a valid conflicting body is `STALE`. A copied release ID never substitutes for canonical body validation.

`participant-release-diagnostic-observation.js` will export its existing captured-intrinsic safe-clock-integer predicate under one bounded public name; raw diagnostic clock observations and signed age calculations remain unchanged. `participant-release-client.js` will consume that predicate and own all OBSERVE budget arithmetic. `participantReleaseRequestBudget(owner, deadlineAtMs, ceilingAtMs)` will require both absolute values explicitly. The sender samples once and passes the original deadline as its derivation ceiling; it then carries the measured `observationDeadlineAtMs`. The receiver requires the carried ceiling and never defaults it from arrival time.

The budget owner requires primitive, safe, nonnegative, non-`-0` clock/deadline/ceiling values and `ceilingAtMs <= deadlineAtMs`. It computes the two nonnegative remaining durations first, selects `min(REQUEST_TIMEOUT_MS, overallRemaining, ceilingRemaining)`, and only then forms and validates `now + timeout`. Thus a valid `now=MAX_SAFE_INTEGER-1`, earlier deadline `MAX_SAFE_INTEGER` yields one millisecond without evaluating an overflowing `now+5000`; negative/MIN, unsafe, fractional, boxed, coercible and hostile inputs never reach transport. The 5,000 ms cap and original overall deadline do not change. Ambient `Number.isSafeInteger`, `Object.is`, coercion, iterables, or mutable intrinsics are not used at this new guard.

Malformed recipient deadline grammar is `INVALID` before registration. An unusable/unavailable receiver clock remains a typed `UNAVAILABLE` with the original request identity and no acquired effect. On timer evaluation, one new clock observation selects overall expiry first (`now >= request.deadlineAtMs` -> `UNAVAILABLE/missingFact=release_deadline`), then RPC-only expiry (`now >= observationDeadlineAtMs` while overall remains future -> `UNAVAILABLE/missingFact=replica_release_reply/reason=MESSAGE_TIMEOUT`). Stored-deadline equality is removed. Ordinary non-OBSERVE `requestTimeoutMs` behavior is byte-preserved.

## Canonical current-context decision and retained wake (S1, S5, S6)

`partition-participant-transaction-pause.js` remains the only membership/status/facts owner. It will expose its existing `replicaGenerationOf(handler, service, status)` through a bounded owner export (planned name `participantReleaseReplicaGenerationOf`) rather than copy its seven fields. The facts read will internally return a bounded assessment to the OBSERVE recipient while the existing `readParticipantReleaseFacts` wire result remains unchanged for ordinary callers.

Only PA may classify the authentic stale-read case: committed membership has the same term/configuration/membership generation as the latest successful status, but its applied position is behind that status after publication. The assessment marks that one condition as a possible same-context refresh. Build unavailable, membership unreadable/refused, unsafe status, configuration/term/generation change, and every other facts defect remain their real typed refusal and cannot acquire refresh eligibility. No error text or consumer-side membership mismatch predicate participates.

`replica-handler-participant-release.js` will add one OBSERVE-only canonical decision owner (planned private name `participantReleaseObservationDecision`). After each PA assessment it rechecks exact registry service, service/port lifetime, release identity/build/pause, attempt term/leader/configuration, membership generation, and full `sameReplicaGeneration(request.target, participantReleaseReplicaGenerationOf(...latestStatus))`. For OBSERVED facts, the same final status/generation fence runs after all awaits. For PA's possible stale-applied assessment, `refreshEligible` is true only if every current fence still matches. Every unavailable wire answer is rebuilt with existing `releaseAnswer` so the actual request's releaseId, partitionId, and OBSERVE phase are present while canonical `missingFact` and optional reason are preserved.

The observer consumes a private bounded decision `{answer, refreshEligible}`. It never reads status, membership or generation itself. Its pass order is:

1. clear the currently retained wake and invoke the canonical decision once;
2. stop immediately on inactive/replaced lifecycle or terminal decision;
3. if the answer already satisfies the requested origin watermark, settle it even if a wake arrived during the read;
4. refresh only when the canonical decision says the unavailable stale-applied assessment is still current **and** a wake was retained during that read;
5. for valid below-watermark facts, consume a retained wake with one refresh, otherwise remain waiting.

This removes the unconditional fresh-current reread while preserving the authentic N/K in-flight refresh. One refreshing flag, one dirty bit, one starter Promise and the same deadline/timer remain; there is no poll, timer renewal, sleep, retry budget or second observation driver.

The tracked-service callback uses its authoritative `{replicaId, service, previous}` synchronously. When the exact record's replica is removed or replaced with a different service, it terminally marks the old record `STALE` and enters cleanup immediately even while its facts await is held. It does not wait for that stale read, and its later tail cannot delete a successor because map deletion still compares exact record identity. Consensus/application wakes remain passive dirty signals. Service/handler shutdown remain prompt terminal cancellation.

These stronger post-await fences apply only to `OBSERVE_APPLIED_POSITION`. The inherited ordinary PA/recipient await race and ordinary action policy are explicitly outside this correction; they are neither silently repaired nor certified here.

## Exact cleanup custody (S4)

Each observation record captures the exact scheduler that installed its timer, the exact timer handle, each exact unsubscribe closure, and the exact service-listener removal closure. A terminal transition marks computation inactive once, stores its intended answer, and attempts **every** acquired release independently. Timer clearing always uses the captured installing scheduler. A timer callback first relinquishes its fired handle, so it never pretends that an already-fired handle still needs clearing.

If every release succeeds, the exact map record is removed and the intended answer resolves. If any clear/unsubscribe/service-off operation throws or reports failure, the caller resolves once with the existing typed shape:

```text
releaseAnswer(UNAVAILABLE, immutableIntent, {
  missingFact: 'replica_release_reply',
  reason: 'participant_release_cleanup_incomplete',
  retryAfterMs: PAUSE_RETRY_AFTER_MS
})
```

The exact record, failed release entries, actual error objects and remaining resource ownership stay reachable in the same `OBSERVATIONS` map. Successful entries are retired and never repeated. No parallel debt map, backoff, retry timer or cleanup permission is introduced. A later exact join, retained listener callback, registry callback, service callback, or explicit lifecycle cancellation may re-attempt only those retained entries; callbacks catch their own cleanup exception and never throw into the event/runtime owner. Until cleanup completes, the retained settled record prevents a successor observation from silently taking the same replica slot.

`cancelParticipantAppliedPositionObservations(handler)` remains the one handler lifecycle entry. It attempts terminal cancellation and every retained release without awaiting. `shutdownReplicaHandler` invokes it before existing recovery/task awaits, then invokes the same custody check after all existing operation/service release attempts. Any remaining observation debt contributes its actual retained errors to the existing handler shutdown `AggregateError`; shutdown still attempts every independent service/resource release, and its Promise rejects/resets through the existing owned settlement rather than being stranded. A later shutdown retry reaches the same retained observation resources. No callback emits an unowned rejection, no clean answer hides debt, and storage deletion is not authorized by observation cleanup.

## Registry binding (S8)

`test/shards/impact-contracts.json` will add `test/partition/participant-release-native-application-order.test.js` to both existing `raft-rs-runtime-application-transaction` forms: top-level `tests` and `coupledPairs[application-and-progress-transaction].witnessTests`. The two existing endpoint IDs remain exact; no new contract, endpoint or result classifier is created. Ordinary metadata refresh occurs only after reviewed final source/test bytes.

## Causal proof and 48-item closure

The correction uses existing real-owner witnesses rather than tests that repeat formulas:

- `test/partition/participant-release-protocol.test.js`: actual sender/client/registered recipient proves mandatory carried ceiling, one sender sample, valid near-MAX earlier deadline, no-delivery hostile clock/input cases, exact valid join, invalid canonical body conflict, mutation-after-call capture, cleanup failure aggregation, installing-scheduler identity, and fresh-first-read one-read behavior.
- `test/node/replica-handler-release-recovery.test.js`: real registry replacement/removal and handler/service shutdown occur while the canonical facts read is held; the old request settles promptly, successor identity survives the late tail, and retained cleanup debt makes shutdown reject without skipping other releases.
- frozen `test/partition/participant-release-native-application-order.test.js` V8: authentic two-follower N answers, real K publication wakes, passive K rereads, same route/attempt, full final classifier/RESUME/K+1 controls. The separately reviewed dirty-retention-only treatment must fail for the missing retained wake, while a current first read remains one read.
- existing final-query, old-origin/pending-work, runtime publication, service-lifecycle and impact-selection controls remain in the cone. No post-hoc fabricated facts, copied mismatch, forced application, extra tick/read, or timeout increase can qualify.

This closes the review categories as follows: Admission1-7 and Owner1-3 consume the immutable intent plus the canonical PA/R decision; Retry1-7, Concurrency1-5 and Owner4-6 consume conditional dirty refresh, prompt registry cancellation and retained cleanup custody; Formation1-5 retain canonical facts/publication and unchanged hard windows; Harness1-6 remain evidence limits until identical locked measurements; Owner7-9 retain projection-only wakes, exact A/B fingerprints and no raw fallback; Owner10 is the two-form registry correction; JS1-7 use captured numeric primitives, strict own-data copies and canonical release hashing without coercion/getters/prototype trust; JS8 adds no decoded arrays or peer/census algorithm.

V2 acceptance still requires an independent exact-source review of the whole batch, syntax/ESLint/dependency/impact/shard/file-size/strict/guideline/unused/duplication gates without baseline increases, exact immutable candidate/control/treatment inputs, same-host native and lifecycle controls, and honest retention of every timeout or inherited red. This plan makes no startup, corpus, Quest, integration, landing, or main-closure claim.
