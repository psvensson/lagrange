# Applied-position controls V4 plan revision V2

Status: **ADDITIVE TEST DESIGN ONLY.** This revision preserves the original V4 plan SHA256 `47ca5b472bf8dd470cd0e896473089fe0f9b8581406fa4cf4fd490310ac8c088` and its addendum SHA256 `b22d0028854c7d2c2e5cbbce215145ad3c5eda98b687b6d1414467ffbe3fc823` unchanged. It closes T1–T3 from `control-plan-independent-review-v1.md` SHA256 `081d4fc78d9c19804f2b6d350683b6a36e8a965d0bf4ad461129f54c1e7d4cfa` and aligns with production-design review SHA256 `6e171854072032c25cf924dd433373a535830285a1dc30323aa867f51f829194`. No source, test, fixture, Quest, registry, generated metadata, behavior, lab input or Git history is changed by this note.

The existing placement remains: protocol test owns input/budget/progress controls, recovery test owns lifecycle/resource/current-context controls, and the existing participant fixture supplies the canonical request, committed-membership gate, passive settlement record and one event-loop checkpoint. Native retained-wake and final-query proofs remain separate.

## T1 — strict ingress, coherent intent and conflict grammar

Use the actual registered participant-release route for every case. The response and effects come from the production ingress, strict-copy owner, canonical identity owner and observation owner; the test neither hashes an identity nor predicts validity with a copied classifier.

### Fresh malformed starter

Build one otherwise-current request with the existing canonical request builder, then give it unequal own primitive deadlines: `deadlineAtMs !== attempt.deadlineAtMs`. Send it when no observation record exists. Require the canonical `INVALID` outcome before listener, timer, membership read or budget effects. Record listener/timer/read baselines and prove they remain exact. Follow it with an unchanged valid starter so the malformed call cannot have occupied the single-flight slot or left hidden debt.

Run the same no-effect shape for actual registered-ingress own accessors on `type`, `action` and `replicaId`. Each accessor increments/throws if invoked; the registered handler must reject from descriptor inspection with zero getter/coercion calls and zero resources. Unsafe fields are not echoed or coerced into an invented identity. This specifically crosses the lifecycle and release dispatch boundary, so a copy added only inside the observation owner cannot satisfy the control.

Add one plain top-level request whose nested `release` is also plain own data but whose declared digest scalar is boxed/coercible. Give that value hostile `toJSON`, `toString` and `Symbol.toPrimitive` counters. Retain the copied valid `releaseId` while altering this body. Require immediate `INVALID`, all counters zero, and no listener/timer/read/single-flight effect. This proves primitive pinning occurs before the existing canonical hash/regular-expression/serialization owner without adding a test-side hash.

### Held-starter join matrix

Create one valid starter, hold its real committed-membership read with the existing gate, and snapshot the original listener count, timer count, deadline and passive settlement record. Within that same lifetime:

1. A copied valid release ID with a malformed release body returns `INVALID`.
2. Changing only top-level `deadlineAtMs` while leaving `attempt.deadlineAtMs` unchanged is incoherent and returns `INVALID`.
3. Changing both deadlines to one equal new safe value is a coherent different intent and returns `STALE`; it neither joins nor renews the starter.
4. Existing valid origin, target and attempt conflicts retain their canonical `STALE` treatment.
5. Accessor/proxy/symbol/noncanonical variants remain immediate `INVALID` with zero hostile reads.

For every prompt result, preinstall the existing passive `track(operation)` record, await exactly the already-approved `settle()`/`setImmediate` checkpoint, and assert settlement before releasing held facts. Do not use a resolved-sentinel race, duration, timeout, poll, microtask count or virtual-clock advance. The one checkpoint is specific to the registered route's Promise continuations. Gate retirement still owns the original promise and preserves its actual rejection rather than treating `track.value` as authority.

After the starter settles, send an exact coherent join while retaining the original resource baselines. It must return the stored terminal answer and must not acquire a listener, timer, membership read, renewed deadline or successor record. If cleanup debt is deliberately retained by T3, the exact join may drive the same cleanup record, but it cannot replace the stored answer/Promise or create a successor during that call. Only a later fresh call after exact custody discharge may start a new observation.

## T2 — real older-origin progress fact versus full drain refusal

Extend the existing `participant-release-protocol` SQL_TRANSACTIONS case that already constructs a real service, `ReplicaHandler`, registered route, controllable consensus port and production proposal owner. Do not add another control service, gateway, release fixture or classifier.

1. Run the existing current full release through the actual handler/recovery and registered per-replica release path. Require `CUT_OVER`, OPEN admission and a non-null durable `readPartitionWriteOrigin` result. Retain that exact `{originIndex, originTerm}` and the current canonical facts.
2. Submit the existing ordinary SQL mutation while admission is OPEN. Wait only for the real proposal owner to expose its entry. Retain the actual proposal without committing it and assert `pendingWrite.settled === false`, `proposalQueue.size === 1`, no application row, and the durable origin unchanged. This work is accepted **before PAUSE**; no work is introduced afterward.
3. Advance the controllable consensus owner through its existing `setTerm`, choosing a safe current term strictly greater than `durableOrigin.originTerm`. Build the fresh observation/cutover intent only afterward from the current canonical facts. Assert `durableOrigin.originTerm < request.attempt.term`; do not rewrite the database origin or require the old origin term to equal the current attempt term.
4. Raise PAUSE through the existing request/observation fixture and send the actual registered `OBSERVE_APPLIED_POSITION` request. Its target and origin must be copied from the canonical facts/request owner. Require the actual fact answer shape: `OBSERVED` plus exact partition, generation, membership, origin and work. Do not require `releaseId` or `phase` on a positive fact. Pin `answer.origin === durableOrigin`, `answer.membership.term === request.attempt.term`, the older applied watermark, the real proposal count of one, the still-unsettled write and CLOSED admission.
5. While the same real proposal remains pending, invoke the canonical full release owner. Require `DRAIN_PENDING` and CLOSED admission. Read fresh facts through the canonical facts owner and compare the refusal's `blockedDrain.generation/work` to that fact; do not call or reproduce `isReleaseDrained` in the test. The earlier OBSERVED result must not have removed the proposal, granted admission or become release authority.
6. Commit the retained proposal through the controllable port, await the actual write settlement, assert the application effect and empty proposal queue, then invoke a fresh full release and require `CUT_OVER`. Preserve every primary, proposal, write-settlement, membership-gate, handler/service shutdown and directory failure independently.

This case proves the recipient action is a progress-watermark observation while the full classifier still owns transaction drain. It is a controllable-owner boundary proof, not native election/startup certification. It does not replace the native N/K witness or final-query schedule.

## T3 — resource acquisition, captured clock, bounded debt and scoped intrinsics

Use the existing actual-handler recovery fixture and its public listener/timer/registered-route/shutdown effects. No observation-map export, cleanup result API, retry timer, private record hook or duplicate lifetime driver is added.

### Synchronous acquisition cancellation

Use two distinct cases so the exact acquisition that reenters cancellation is unambiguous:

- **Subscription case:** wrap the existing real Raft subscription seam. The wrapper first obtains the actual unsubscribe closure, synchronously deletes/replaces the exact tracked service before returning it, then returns that exact closure. Require the same observation to settle with its canonical cancellation outcome, the late-returned unsubscribe to run under the original record, listener count to return to baseline, and timer acquisition never to occur. Installation must not resume after cancellation.
- **Timer case:** allow every preceding real subscription to install. Scheduler A's wrapper obtains an actual timer handle, synchronously deletes/replaces the tracked service before returning that handle, then returns it. Require all earlier subscriptions and the late timer handle to retire, no later resource acquisition, no listener/timer/map-slot resurrection, and the canonical cancellation answer.

Each case registers its operation under the existing membership-gate custody before awaiting engagement. After the prompt-cancellation assertion and one approved event-loop checkpoint, release and retire the held membership continuation before awaiting unrelated shutdown work. Preserve every assertion, returned operation, resource restoration, shutdown and directory failure independently.

### Actual cleanup grammar and bounded debt

Use actual owner return contracts. A real native/registry unsubscribe returning `false` means the listener was already absent and is successful idempotent retirement; it must not create cleanup debt or a typed cleanup refusal. Timer clear returns void and EventEmitter `off` returns its emitter; neither receives a fabricated boolean convention.

In the separate failure case, inject throws with distinct sentinel error objects from the acquired release operations. Trigger the real lifecycle cancellation while facts remain held. Require every independent release operation to be attempted, the existing typed `UNAVAILABLE` cleanup answer with exact request identity, CLOSED admission, and the same sentinel identities in the existing handler-shutdown `AggregateError`. Repeated exact joins and cleanup triggers must retain at most one current error/count per exact acquired resource, never append history, renew the deadline or create a successor. Disable each fault, drive the same canonical cleanup record again, and require all listener/timer counts return to baseline. Failed shutdown/restoration retains and reports its actual directory; successful cleanup permits ordinary deletion.

### Captured scheduler and settled joins

Start the observation on explicit scheduler/clock A, retain its exact timer handle, then replace `handler.timeSource` with B. All later expiry sampling and clearing for that record must remain on A; assert A clears the exact handle and B clears none. Advancing or reading B cannot expire, extend or renew the stored A-owned lifetime. Restore the handler field under fixture custody.

After terminal answer creation, an exact join receives the original stored terminal answer/Promise and does not reacquire a timer or subscription. A coherent changed deadline pair remains STALE and cannot clean the old slot and create a new starter in that same call.

### Scoped mutable-intrinsic control

Limit the ambient mutation to the new client budget guard. Construct one valid request and sender clock, then replace ambient `Number.isSafeInteger` and `Object.is` with throwing functions only after the client input is ready. Install one transparent `transport.deliver` tap that:

1. counts exactly one call;
2. restores both intrinsics before invoking the original delivery once with the identical address, payload and options; and
3. returns the original delivery result unchanged.

Require the actual client reaches that tap exactly once and the real registered recipient completes with its canonical result. A `finally` restores the intrinsics if the client fails before delivery. This measures captured guards/arithmetic at the new client boundary only; it does not claim unchanged PA/K/Map/Set resilience and cannot count a mutated-recipient failure as budget proof.

## Preserved seams and proof boundary

- S1's satisfying first read remains one canonical membership read.
- S2's direct missing carried ceiling remains `INVALID`; sender-owned derivation remains separate.
- S3's valid `MAX_SAFE_INTEGER - 1` plus one-millisecond ceiling remains a success case. Signed/boxed/fractional/unsafe/throwing clocks remain domain-invalid controls, not fabricated arithmetic-overflow cases.
- S5 still covers both synchronous registry replacement and deletion using the existing passive record and one checkpoint, with the old membership read held until prompt STALE is observed.
- S6 retains coherent current-context and typed unavailable controls; authentic stale N/current K refresh remains native-only.
- S8 remains the existing two-form/two-endpoint registry correction owned by root.

T1–T3 require narrow independent design re-vet before any test implementation. Exact implementation bytes then need an independent content review and locked candidate/source-treatment measurements. No absent OBS action, setup failure, cleanup failure or spent healthy bound may count as the intended negative. Production correction, native treatment, final-query ordering, startup, metadata, selected cone, corpus, Quest and landing remain separate HOLDs.
