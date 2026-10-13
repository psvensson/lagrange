# Native release boundary witness fixture plan

Status: read-only design inventory. This does not authorize a release-ordering
repair, fixture change, test change, timeout change, or behavioral run.

## Binding and claim limit

- Inspected worktree HEAD: `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`.
- The retained startup trace remains the real-workload evidence. It observed a
  three-replica same-node cohort whose leader had applied the generation origin
  while both followers reported applied/commit/last `1/1/2`; the release owner
  then returned `release_drain_pending`.
- Existing F11 already proves the generic native boundary between an emitted
  commit announcement and follower application:
  `test/raft/raft-rs-backend/multi-replica-runtime-prerequisites.test.js:139-195`.
  A new witness is justified only to traverse the real `PartitionService` and
  `ReplicaHandler` release lifecycle and pin the release promise's ordering.
- A held-envelope test is deliberate transport fault injection. It can falsify
  premature release settlement and prove safe continuation after delivery. It
  cannot prove that the retained startup failure was caused by the same
  scheduling order, and it does not select a repair mechanism.

## Nearest existing composition

1. `test/partition/partition-admitted-group-fixture.js:41-119`
   (`formAdmittedGroup`) already forms a real native `PartitionService` group:
   the first voter leads, later voters join through the production services-
   cache reconcile, and each replica owns its own database and Raft operation
   port. It is already used with three voters by
   `partition-runtime-reconstruction-leadership.test.js:577-594` and
   `partition-unreadable-durable-record.test.js:420-435`.

2. `test/partition/partition-release-fixture.js:28-97`
   (`attachPartitionReleaseOwners`) already composes the real `ReplicaHandler`,
   hosts every replica, registers the handler with the transport, builds the
   SQL-transactions control partition, and invokes
   `participantReleaseRecovery.releaseOperator`. The production one-attempt
   recipient is `src/node/replica-handler-release-recovery.js:285-293`.

3. `src/transport/message-router.js:50-85` and
   `test/test-helpers/service-delivery-fixture.js:12-23` provide the canonical
   initialized `MessageRouter` construction and shutdown pattern. A
   `PartitionService` registers its exact bound transport handler at
   `src/partition/partition-service-raft-init-base.js:390-394`; exact identity
   lookup/replacement is supported by
   `src/transport/message-router-handler-registry.js:27-40,107-127`; shutdown
   requires that identity at
   `src/partition/partition-service-lifecycle-methods.js:61-77`.

`participant-release-protocol.test.js` has real release routing but only a
single voter and a mock transport. `PartitionNodeCluster` has deterministic
envelope holding but bypasses `PartitionService` and the release recipient.
Neither should become a second lifecycle/protocol helper.

## Minimum future fixture extension

Extend only the two shared owners above:

- Let `formAdmittedGroup` accept an optional already-initialized `transport`.
  Its default remains the current `createLoopbackTransport()`. When supplied,
  the caller owns router shutdown and the fixture must not replace
  `transport.deliver` during disposal. Returning the selected transport is
  useful but adds no behavior.
- Factor the body of `attachPartitionReleaseOwners.release()` that selects the
  actual leader and invokes `releaseOperator` into `releaseOnce(partitionId,
  {deadlineAtMs})`. Keep `release()` as its current bounded retrying wrapper.
  The witness uses `releaseOnce` so one production attempt, release ID, and
  promise span ENABLE, the final census, and RESUME. Exposing handlers or
  recreating authorization/build selection in the test is broader and should
  be rejected.

Use three member tuples on one node to match the retained cohort while keeping
unique replica addresses. Initialize one real `MessageRouter` with
`TEST_BOOT_INCARNATION`, pass it into `formAdmittedGroup`, then attach the
existing release owners. The narrow test may live in a new partition test file
and import the two shared fixtures; it needs no new lifecycle fixture.

Expected imports are the existing owners only: `MessageRouter`,
`TEST_BOOT_INCARNATION`, `formAdmittedGroup`,
`attachPartitionReleaseOwners`, `RAFT_RS_TRANSPORT_PROTOCOL`,
`RAFT_RS_MESSAGE_TYPE`, `PARTITION_SERVICE_EVENT`,
`readPartitionWriteOrigin`, `participantCutoverPauseOf`,
`isReleaseDrained`, `releaseMemberIds`, `PARTICIPANT_CUTOVER_OUTCOME`, and the
existing `track` helper from `participant-transaction-fixture.js:639-649`.

## Narrow controllable fault

After formation and before the single release call, replace only r2 and r3's
registered partition-handler identities with small wrappers. While armed, a
wrapper retains the exact canonical raft-rs Append whose entries are empty and
returns the normal acknowledged transport result without invoking the original
handler. Every nonmatching delivery invokes the exact original handler with the
original `this` and arguments. The test must prove after capture that each held
envelope targets one distinct follower and carries the leader's actual origin
commit index; the matcher itself must not predict the origin.

This seam is intentionally narrower than wrapping `router.deliver`: delaying
the delivery promise would prevent leader ENABLE from resolving and would not
reach the post-ENABLE final census. Local MessageRouter normally awaits the
handler (`src/transport/message-router-delivery-behaviors.js:106-145`), while a
partition handler acknowledges after `raft.step` admits the envelope
(`src/partition/partition-service-entry-apply-base.js:247-260`). The wrapper's
acknowledgement therefore simulates transport admission with recipient
application withheld. It is a safety falsifier, not a reproduction of normal
same-node delivery.

## Meaningful source-only-red witness

1. Register existing `PARTITION_SERVICE_EVENT.ENTRY_COMMITTED` listeners before
   the release. Start and track exactly one `releaseOnce` promise.
2. Wait within the existing fixture bound for the leader's origin event and
   exactly two held commit announcements. Assert leader origin/status `2/2/2`,
   follower origins absent and status `1/1/2`, all three admission pauses held,
   and no unexpected held envelope.
3. With the two messages still held, cross one `setImmediate` turn (a fixed
   observation barrier, not polling or a release retry), then assert the same
   tracked release promise is unsettled. Current source reaches the immediate final census at
   `src/node/replica-handler-participant-cutover.js:279-297` and returns
   `DRAIN_PENDING`, so this is the useful source-only-red assertion. It measures
   release-promise ordering, not merely the already-covered F11 primitive.
4. While pending, issue one ordinary write and require the existing typed
   `CUTOVER_PAUSED` refusal with no proposal/log growth.
5. Invoke each exact original follower handler once with its retained arguments,
   then restore exact handler identities. Await the same release promise: it
   must complete `CUT_OVER`, its canonical census must contain exactly the
   three release members and be drained, every replica must contain the same
   durable origin, and RESUME must clear each pause. There is no second release,
   manual admission grant, retry polling, heartbeat, or fresh facts repair.
6. Make one ordinary leader write and use the group's existing `waitFor` to
   prove all three replicas apply the same log index and row exactly once.

The origin event is already emitted after the application transaction commits
at `src/partition/partition-participant-transaction-apply.js:630-635`; the
proposer answer is also an after-commit effect at `:116-125`. No application
hook is needed. The future owner design may introduce a bounded post-ENABLE
publication observation, but this witness must remain agnostic about that
implementation.

## Fault, deadline, and lifetime controls

- Keep the existing group/release deadline unchanged and pass it once to
  `releaseOnce`; no retry or budget increase.
- Bound the gate at exactly two retained envelopes. A third, malformed, wrong-
  target, or capture failure is a test failure.
- In `finally`, forward every retained envelope exactly once before restoring
  the original registered handlers. Restoration precedes release-owner and
  service shutdown so exact retirement remains valid.
- Always settle the tracked release promise and preserve primary, observation,
  forwarding, restoration, and shutdown errors without allowing cleanup to
  mask the first failure or create an unhandled rejection.
- Dispose in ownership order: restore partition handlers, stop release owners
  and their control partition, dispose group services/databases, then shut down
  the caller-owned MessageRouter and reset the existing configuration/logging
  singletons.

This is the smallest reusable full-owner witness seam found. A three-router
socket topology would model remote acknowledgement more literally, but it is
larger than the observed same-node cohort and duplicates transport lifecycle
coverage without strengthening the release-promise assertion.
