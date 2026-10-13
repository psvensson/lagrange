# Applied-position control batch V1

Status: TEST-ONLY preparation. No behavioral test or lab run was performed.
The production action, event and lifecycle constants named by these controls
are intentionally absent at base `ad23d75d58e320ca2fe58f8baa9b0a941a8158e2`;
this batch is content for composition with the reviewed production repair, not
a missing-symbol red or passing proof.

Binding:

- matrix V2 SHA-256:
  `61cffd528a15ff0b9df5b416ab235110ddbe9425b294cbcf9e4f0446a45c3054`
- `test/partition/participant-release-protocol.test.js`:
  `c5aa6ce79a233115a01d596d204ecb67fbff1947922d2a6a98bb8609946dea8e`
- `test/node/replica-handler-release-recovery.test.js`:
  `da25d5724cc8c73d4d15831794add44200b1d2eb479261e77aa6ccbb2d2915d3`
- full binary diff SHA-256:
  `2e7efa7f18a1ea1c8388e68acd2b1132ce6937006d7379c08d44f24208bd1f58`
- no source, fixture, Quest, registry or generated metadata path changed.

## Covered controls

1. **M1 sender/recipient budget:** a registered actual recipient is held at
   canonical committed-membership facts. The tests distinguish the existing
   five-second RPC cap from a shorter overall deadline, prove an already-spent
   overall deadline sends nothing, and delay the unchanged transport call by
   four seconds so only one second remains at the receiver. They require typed
   RPC `message_timeout` versus overall `release_deadline`, stable release and
   phase identity, CLOSED admission, listener/timer discharge and a fresh
   successor. Malformed carried deadlines and unusable sender clock samples
   are refusal-only controls with zero delivery/effects.
2. **M2 per-replica observation lifetime:** identical registered requests
   share one facts read, listener, timer and the starter's original deadline.
   Valid-shaped origin, attempt and generation conflicts are typed STALE while
   the starter remains intact; a successor engages after exact-boundary expiry.
3. **M3 fresh-first-read half:** an ordinary proposal is accepted before
   PAUSE, its real application and `APPLIED_PROGRESS` wake occur while the
   committed-membership call is gated before invoking its owner, and the first
   owner read succeeds without an unconditional reread.
4. **M4 lifecycle cancellation:** actual registered route controls hold facts
   while real handler shutdown or real service shutdown begins. They require
   STALE and passive-resource cleanup before releasing facts. The service test
   also binds `SHUTDOWN_STARTED` ordering to `isShutdown`, installed
   `shutdownSettlement`, and exact partition/replica identity. A new actual
   handler/service engages afterward.
5. **M5 post-await identity:** existing controllable owners change term,
   runtime generation, lifecycle incarnation, configuration key, membership
   generation or the tracked service object while facts are held. Each old
   observation stays STALE/CLOSED and detached; replacement then admits a real
   successor request. Existing mixed-build coverage remains the BUILD_MISMATCH
   control.
6. **M6 older origin plus unrelated work:** the existing real blocked-drain
   test now pins its durable origin across an unrelated pending SQL proposal,
   the exact canonical proposal count, and CLOSED admission. It still settles
   through the actual proposal/application owner and then proves normal release.
7. **M7 final control recheck:** the existing protocol fixture holds the
   dependent OBSERVE after its actual ENABLE origin, shuts down only the real
   control `PartitionService`, then requires the existing
   `UNAVAILABLE/current_control_owner_fact`, no dependent RESUME and no second
   origin. Its paired unchanged-control CUT_OVER case remains existing coverage.

## Explicit gaps and assumptions

- **M3 stale-in-flight half remains unresolved in this narrow batch.** The
  controllable singleton has no owner-produced facts snapshot that combines
  the current release/configuration identity with an applied position below
  an already-stored origin. Editing the returned facts would fabricate the
  production predicate. The separate native same-promise witness owns the real
  follower lag; an independent review should decide whether that native seam
  also proves a wake retained across a stale in-flight facts await.
- The optional recipient-only “older valid origin while later accepted work is
  still present” combination is not synthesized. M6 keeps the actual accepted
  work owner, and the native witness owns distinct follower positions.
- The final-query schedule is deliberately absent per parent scope and remains
  the separately reviewed source-order/native obligation.
- Exact future outcomes assumed from the approved contract are: valid-shaped
  observation conflicts return STALE; malformed observation deadlines return
  INVALID; unusable sender clocks return typed UNAVAILABLE without delivery.
  Independent review against the composed source must confirm these before a
  behavioral run.

## Static checks

- syntax: PASS for both changed files
- exact ESLint: PASS for both changed files
- strict scoped cyclomatic threshold 12: PASS
- strict scoped cognitive threshold 20: PASS
- `git diff --check`: PASS

Logs are in this directory. Behavioral, native, startup, timeout, corpus and
source-revert receipts remain unclaimed.
