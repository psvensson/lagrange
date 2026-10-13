# Native release boundary witness fixture plan V2

Status: revised read-only plan. It authorizes no source, fixture, test, Quest,
metadata, timeout, or behavioral-run change. V1 remains preserved at SHA-256
`d8a9e097ce90032ab264a8d321da1eaa5545acef9773a74b653612c8002af1f1`.

## Binding and scope

- Inspected worktree HEAD: `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`.
- Full V1 review:
  `test-output/seed-native-startup-census-20261013/native-release-boundary-witness-plan-review-v1.md`,
  SHA-256
  `ca8e3256cabbcf3e58021bc2bed590d068ea94b29b77fabd1b37cb34bb06339d`.
- The retained startup trace remains real-workload evidence. The witness below
  is a deterministic release-lifecycle falsifier. It does not prove that the
  retained startup failure used the same envelope schedule and does not choose
  the production wake implementation.
- Existing F11 at
  `test/raft/raft-rs-backend/multi-replica-runtime-prerequisites.test.js:139-195`
  remains the generic emitted-versus-applied primitive proof. This witness adds
  the real `PartitionService`, `ReplicaHandler`, participant-release attempt,
  final census and RESUME boundary.

## Reused owners and minimum fixture extension

Use the existing full-owner composition:

1. `formAdmittedGroup` at
   `test/partition/partition-admitted-group-fixture.js:41-119` forms three real
   native voters through production membership admission.
2. `attachPartitionReleaseOwners` at
   `test/partition/partition-release-fixture.js:28-97` hosts those services in
   the real `ReplicaHandler`, owns the SQL-transactions control service, and
   invokes the actual `participantReleaseRecovery.releaseOperator` one-attempt
   recipient at `src/node/replica-handler-release-recovery.js:285-293`.
3. Construct and initialize an actual `MessageRouter` using the precedent at
   `test/test-helpers/service-delivery-fixture.js:12-23`. Use three unique
   replica addresses on the same node, matching the retained startup topology.

Only these fixture extensions are needed:

- `formAdmittedGroup` accepts an optional already-initialized `transport` and
  otherwise retains its current loopback default. The caller owns an injected
  router. Group disposal must never replace its `deliver` method or shut it
  down.
- In `attachPartitionReleaseOwners`, factor a private prepared invocation:
  preparation measures `runtimeBuildProvenance` once and creates one overall
  deadline; each invocation freshly selects the actual current leader, calls
  the same `releaseOperator`, and records its outcome. Existing `release()`
  prepares once, invokes that function on every current retry, and retains the
  exact delay, remaining-budget and terminal assertion at lines 74-95.
  New `releaseOnce(id)` prepares once and invokes it exactly once. It does not
  accept a caller-supplied build/deadline, repeat build measurement, cache a
  leader, recreate authorization, or alter existing retry policy.

No second lifecycle fixture, release algorithm, authority predicate or retry
classifier is introduced.

## Runtime anchors before the fault

The witness never assumes indexes 1 or 2. Before arming the gate:

- Open each `dbFileOf(member)` through an independent read-only
  `better-sqlite3` connection and reuse the durable-store read-view pattern at
  `partition-runtime-reconstruction-leadership.test.js:188-199`. Capture each
  complete durable record. Require all three to be settled at the same actual
  position **N**: applied index, hard-state commit index and last log index are
  N. Record the current durable term.
- Require `readPartitionWriteOrigin` on each read-only connection to be null.
- Before the hold, capture the real leader, peer identities, term,
  configuration key, current three-member committed membership and complete
  replica-generation tuples from the ordinary initial/PAUSE release route
  observations. The natural replies must agree on leader, term, configuration,
  exact voter identities and membership generation. A conf-change, generation
  change, extra log entry, missing member or different term fails the setup;
  none is normalized away.

Install the wrappers disarmed before starting release. The pass-through route
observer collects the ordinary initial/PAUSE responses. Its settlement callback
arms the wrappers synchronously when the last exact PAUSE reply completes,
before that promise continuation can advance the cutover to ENABLE. This gives
the gate complete anchors before ENABLE without another release/facts call.

## Complete commit-advancing gate

`PartitionService` registers its exact bound handler at
`src/partition/partition-service-raft-init-base.js:390-394`. Replace only the
two follower handler identities through the actual MessageRouter registry
(`src/transport/message-router-handler-registry.js:27-40,107-127`). Preserve
each exact original function and receiver.

While armed, each wrapper matches every canonical leader-to-that-follower
raft-rs carrier satisfying all of these facts:

- `payload.protocol === RAFT_RS_TRANSPORT_PROTOCOL`;
- `payload.groupId` is the exact partition ID;
- payload and nested message `from`/`to` equal the anchored leader and follower
  Raft peer identities;
- nested `term` equals the anchored current term;
- `msgType` is either `RAFT_RS_MESSAGE_TYPE.APPEND` or
  `RAFT_RS_MESSAGE_TYPE.HEARTBEAT`; and
- its canonical commit position is greater than N.

There is no empty-entry restriction. The first exact matching carrier for each
follower retains the original envelope, delivery context, receiver and
arguments without cloning, freezing or mutation. Later matching APPEND or
HEARTBEAT retransmissions are deliberately acknowledged and dropped while the
fault remains armed. Maintain bounded per-follower matched/suppressed counters
and a bounded overflow flag; a legitimate third heartbeat increments the
counter and is not itself a fixture failure. Counter overflow qualifies the
witness after cleanup. Every nonmatching delivery delegates exactly once with
the original receiver and arguments. Unexpected term/configuration/log movement
is caught by the anchored-state assertions rather than by swallowing unrelated
traffic. The gate never rewrites commit, fabricates a Raft response, ticks,
campaigns or changes election scheduling.

After the natural ENABLE response, take actual **K/originTerm** from that exact
reply's canonical `origin`. Prove each retained first carrier has commit K in
the anchored term and that K is greater than N. This measures the carrier
instead of predicting the origin index.

## Passive engagement edge

Install a non-async pass-through observer around the real router's `deliver`
before the release. It invokes the exact original method once, attaches only a
nonthrowing settlement observer to the original promise, and returns the exact
promise/result/error unchanged. It records bounded participant-release action,
target and result references needed by this witness.

The test imports the already-existing `PARTICIPANT_RELEASE_ACTION` object and
compares requests with its `OBSERVE_APPLIED_POSITION` property. It does not
import a new named symbol or call a new method. On the source-only baseline the
property is simply absent, so the observer cannot report that action; the same
release attempt instead settles with its actual result.

Race two passive signals:

1. the tracked `releaseOnce` promise settles; or
2. the natural route observer sees the same release/attempt enter
   `OBSERVE_APPLIED_POSITION`.

The source-only baseline must take branch 1 and expose the actual
`DRAIN_PENDING` answer while the follower evidence below remains held. The
witness then fails an explicit premature-settlement assertion containing that
answer. It cannot fail because of a missing import, unknown action handler,
setup timeout or unimplemented event subscription. A candidate with the
approved phase takes branch 2; the same release promise must still be pending.
No fixed wait or one-turn guess is part of the engagement proof.

## Passive durable inspection during the hold

During the held edge, use only independent read-only SQLite views:

- create `Object.create(RaftRsDurableStore.prototype)`, assign the independent
  connection, and call its existing `readDurableRecord(partitionId)`, exactly
  as `partition-runtime-reconstruction-leadership.test.js:188-199` does;
- call existing `readPartitionWriteOrigin` on that same read-only connection.

This does not enter the operation port, group queue, release route or service
handler. It cannot drain inbound work. Do not call `raft.readStatus`,
`readCommittedMembership`, `readParticipantReleaseFacts`, INSPECT, tick, a
fresh facts read, or any wait predicate containing them while the fault is
held.

At the measured edge assert:

- leader durable applied/commit/last are K/K/K and its stored origin is the
  exact K/originTerm from ENABLE;
- each follower is N/N/K and has no stored origin;
- the two first held carriers are distinct follower carriers for K;
- the pre-origin complete generation, leader, term, configuration and exact
  three-member membership anchors remain the ones carried by the active
  release/observation requests; and
- one ordinary write is refused by the existing `CUTOVER_PAUSED` path with no
  new proposal, pending outcome, durable log entry or application row.

The write control uses direct durable before/after views plus passive queue-size
properties during the hold; it invokes no consensus/read/facts operation.

## Completion and assertions

Disarm the gate, invoke each retained original follower handler exactly once
with its retained receiver/arguments, then restore both exact registered
handler identities. Restoration first requires
`unregisterExact(address, wrapper)` and only then registers the saved original;
if the current identity is no longer the wrapper, record a custody failure and
never overwrite that successor. Prove `getRegisteredHandler(address)` is the
original after restoration. Await the **same** release promise. Do not issue another
release, manual admission/resume, retry poll, heartbeat, facts repair or new
origin proposal.

Require the result to be `CUT_OVER`; require its existing final canonical
census to contain exactly the three member identities, unchanged complete
generations/configuration/membership, the identical K/originTerm on all three,
and `isReleaseDrained` for every member. Require existing RESUME to clear every
pause. Then make one ordinary leader write and use the group's existing bounded
`waitFor` only after release completion to prove all three replicas durably
apply the same one row/log position exactly once.

The current cutover boundary is
`src/node/replica-handler-participant-cutover.js:279-304`. The existing origin
application emits `PARTITION_SERVICE_EVENT.ENTRY_COMMITTED` at
`src/partition/partition-participant-transaction-apply.js:630-635`, but this
event is supporting evidence only; it does not replace the natural route edge
or claim completed runtime publication.

## Deadline, fault and cleanup custody

- Keep all current fixture, request and test deadlines unchanged. The gate-
  induced hold must remain inside the original attempt deadline. Term loss,
  deadline spend or host failure is a fault/control failure, never green.
- Bound retained envelopes at one per follower and bound only scalar counters
  for later retransmissions. Preserve no unbounded request/envelope history.
- Cleanup steps are independent and all run even after a primary assertion:
  disarm; forward follower 1's retained carrier; forward follower 2's retained
  carrier; restore follower 1 identity; restore follower 2 identity; settle the
  release promise; restore the pass-through `router.deliver` observer; stop
  release recovery/control service; dispose all group services/databases; shut
  down the caller-owned router; reset existing config and logging singletons.
- Collect primary, route-observation, forwarding, restoration, release-
  settlement and teardown errors separately. One failed forward/restore never
  skips the other follower or later ownership cleanup. Report the primary
  failure with secondary custody failures attached; do not mask either class.
- Exact handler restoration precedes service retirement, whose current owner
  requires identity at
  `src/partition/partition-service-lifecycle-methods.js:61-77`. The group never
  overwrites an injected router's `deliver` during disposal.

This remains the smallest full-owner witness: two existing fixture extensions,
one real router, one bounded injected handler gate and one release attempt. A
three-router socket topology or another release lifecycle helper would enlarge
the test without strengthening the same-promise publication assertion.
