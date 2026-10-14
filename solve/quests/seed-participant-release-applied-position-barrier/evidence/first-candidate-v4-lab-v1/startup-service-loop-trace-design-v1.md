# Seed service-loop and nested-control trace: bounded test-only design

## Binding and claim limit

This design binds unchanged source input `25a2cd6d8f7c88df392d9efe0af312268ad3efcf`, tree `8e96670c7ec9d81332e52b68b1cf9f6af255d790`, src `7cf388f79e6afccf3d4311a475147147106e15a5`; first-candidate triage `ed7c4cfd6c84e307af4d0b2f88db1a66c3db40b644f898357719a360e2352384`; and the preserved original-Promise trace at `4d37a7eb2a95c297c7afe74a9fe5b88f88cae06e`, whose claim-cache test SHA-256 is `e4c0697fbb18ead9b2b52a856b4e71f3352449d64e7267ccbc06c1bf02a2c013`. The current test has that same hash. Prior trace review proved the non-async wrapper calls the original `MessageRouter.deliver` once, returns its exact Promise, and passively observes settlement; it also established that retained call order alone does not prove a runtime scheduling cause. Those constraints carry forward unchanged.

The measurement may establish actual repeated partition RELEASE calls, exact nested control-partition terminal answers, and how release actions consume one carried seed deadline. It cannot authorize iteration subtraction, cache control authority, renew a deadline, or diagnose unobserved Raft work.

## Smallest reuse

Update the existing local `createParticipantReleaseDeliveryTrace` in `test/integration/message-group-membership-claim-cache.integration.test.js`; do not add a second tracer, fixture, source export, or result classifier. Keep its existing `routerFactory` seam. Each instance wrapper remains non-async: snapshot bounded fields, invoke the captured delegate once with exact `this` and arguments, attach a nonthrowing `Promise.prototype.then` observer to the returned object, and return that exact object. Synchronous throw identity and asynchronous result/error identity remain untouched.

Capture all natural participant-release actions and partitions, including outer and control `RELEASE`, `INSPECT`, `PAUSE`, `ENABLE`, `OBSERVE_APPLIED_POSITION`, and `RESUME`. The trace records owner outputs only:

- entry ordinals, installation/router/node identity, target address/target node, action/trigger, partition/replica, release/attempt/target identities, `deadlineAtMs`, carried `observationDeadlineAtMs`, cohort total/captured/dropped, and one `router.timeSource.now()` observation;
- settlement ordinal and one observation from that same router clock; acknowledged/delivery/no-handler/error scalars; answer outcome, phase, missing fact, reason, owner, retry, release/control IDs and outcome, generation/work/origin/membership/blocked-drain fields, and bounded `joinedAttempt` (`originalTrigger`, `clockState`, `joinAgeMs`, `terminalAgeMs`).

No raw request, frame, response, token, accessor-bearing graph, or Error is retained. Do not read status, facts, databases, clocks other than the installed router's existing time source, or perform a tick, proposal, retry, wait, sleep, timer, ref, or fresh delivery. Raw clock observations and carried deadlines are printed; action cost is derived offline, not decided by the tracer. Temporal adjacency may identify a candidate parent/control interaction, but only matching owner identities plus source order may support a nesting inference.

## Physical bounds and output

Replace the prefix-only array with one trace owner containing a pending table capped at 64 admitted release calls and a completed suffix ring capped at 256. A matching call is admitted only while the pending cap has room; overflow increments `pendingAdmissionDropped` and delegates without an observer. Settlement removes its exact pending record and appends one immutable bounded record to the suffix; suffix eviction increments `completedEvicted`. Keep capped action counts and capped `(partitionId, action)` counts for at most 256 keys, with overflow visible. Report total router calls, matched release calls, admitted/completed counts, synchronous throws, pending count, incomplete identities, all drop/eviction/capture-error counters, retained call/completion ordinal ranges, and installation/restoration state. Never claim completeness unless every drop, eviction, capture-error, and pending/incomplete count is zero.

Emit one bounded summary line and one bounded suffix line only after bootstrap has settled and cleanup attempts have run. This avoids the prior 805 KB all-record prefix while retaining the terminal chain; the previous workload had 380 completed release records and an 11-record terminal attempt, so 256 is a useful suffix, not a completeness assumption. Observation overhead from two owner-clock reads and one settlement reaction per admitted release remains explicit.

## Failure and custody

Preserve the existing startup success assertion as the primary red; add no diagnostic acceptance assertion. Retain the exact installed wrapper identity. Restoration is idempotent only when the original is already current; restore only when the exact wrapper is current, and report rather than overwrite a third-party replacement. Attempt every installation restoration independently and preserve all errors.

For the diagnostic input, allocate and pass an explicit seed `dataDir`, so the fixture does not delete it in a shutdown `finally`. Attempt trace restoration, direct production `bootstrap.shutdown()`, and existing environment reset independently. Preserve the original primary plus every observable restoration/shutdown/reset/reporting error in one `AggregateError`; never throw only the first. Because the existing environment reset intentionally swallows internal singleton cleanup errors, retain and report the explicit directory unconditionally for this one diagnostic input rather than infer safe deletion. This is custody, not a cleanup success claim, and avoids changing the shared helper or fabricating shutdown proof.

Implementation scope is exactly the claim-cache integration test and its ordinary generated test metadata if the generator changes it. No production, shared fixture/helper, source policy, timeout/budget, Quest receipt, or startup assertion changes. Static syntax, exact ESLint, strict scoped metrics/file-size, diff and metadata checks precede one independently reviewed locked attempt. Dropped, incomplete, capture-error, restoration-error, or serialization-error output qualifies the evidence and remains HOLD.
