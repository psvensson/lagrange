# Native stale-membership refresh plan V1

Status: read-only design input. No source, test, Quest, generated metadata or
behavioral run is authorized by this plan.

## Binding and existing edge

The inspected native witness is
`test/partition/participant-release-native-application-order.test.js`, SHA-256
`d4999670285114ff87cb906c926cd922d3d6ccedaa8b3ba257a56757d12d2376`, in
worktree HEAD `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`. Its active author may revise
those bytes; this plan does not modify or claim custody of them.

The witness already has the required physical schedule:

- `createCommitCarrierGate` replaces the two exact follower transport handlers,
  retains their first real leader-to-follower commit-advancing APPEND or
  HEARTBEAT arguments and forwards nonmatching traffic unchanged
  (`:246-334`).
- the last natural PAUSE reply arms that gate (`:420-440`), so ENABLE applies
  the actual origin `K` on the leader while each held follower remains at the
  measured position `N` (`:533-590`);
- the real release promise is raced against the real
  `OBSERVE_APPLIED_POSITION` route (`:902-944`). On unchanged source the action
  does not exist, so the test reaches its current named premature-settlement
  failure with held carriers. It does not require a new method or event to
  construct that source-only red.

The canonical facts reader itself supplies the intended stale conflict: it
awaits `service.raft.readCommittedMembership`, then reads status and returns
typed membership-unavailable when the committed answer's applied index differs
from the freshly published status (`partition-participant-release-facts.js:85-99`).
The test must not copy that comparison or fabricate either side.

## Smallest extension of the same attempt

1. **Install scheduling-only operation-port wrappers.** Before starting the
   existing release, retain each current follower's exact `service.raft` port
   and assign a wrapper made by the existing `createRaftOperationPort({...port,
   readCommittedMembership})` constructor. This is the established test seam
   used by `test/test-helpers/learner-recipient-fixture.js:121-136`; it preserves
   every real operation, subscription and runtime. A Proxy cannot override the
   frozen port methods (`raft-operation-port.js:45-58`). No fixture or
   production port API changes.

2. **Arm only the actual observation RPC.** Extend the existing route observer
   with a reference to these wrappers. Immediately before delegating an exact
   follower `OBSERVE_APPLIED_POSITION` delivery, arm only that follower's
   membership wrapper. Do not infer authority or validate the request locally;
   the existing bounded route capture still checks the returned canonical
   identity. PAUSE, ENABLE, INSPECT and unrelated membership reads delegate
   unchanged. Arming must occur before `Reflect.apply(originalDeliver, ...)`,
   because local delivery may reach the facts await during that call.

3. **Capture the real immutable `N` answer before waiting.** On the armed
   follower's first membership call, invoke and await the exact retained native
   method first. Retain that returned frozen answer, assert its canonical
   purpose/term/configuration and applied position equal the already measured
   follower `N`, signal `captured`, then await a test continuation before
   returning that exact object. Do this for both existing followers so the
   natural three-member observation batch is exercised. There is no edited
   membership field and no test-owned facts object.

4. **Forward the already held `K` carriers and observe publication.** Only
   after the release has entered the observation phase and both native `N`
   answers are captured, subscribe through each retained real port to the
   approved payload-free `RAFT_EVENT.APPLIED_PROGRESS`. Then call the existing
   carrier gate's `forward` once for each follower with its exact stored
   receiver and arguments. Await the two real event promises. Do not call
   `readStatus`, facts, tick, campaign, step or a polling helper. The event is
   emitted by the candidate runtime only after the existing durable apply and
   status publication boundary; a read-only durable-store check may then pin
   each follower at `K/K/K` with the exact ENABLE origin.

5. **Return stale `N` after the `K` wake.** Resolve both membership
   continuations only after those real events. The first facts read therefore
   receives its authentic captured membership `N` after the same port has
   published status `K`; the canonical reader may produce its existing typed
   unavailable answer. The production observer's retained dirty wake must keep
   the same RPC pending, perform its one owned refresh and revalidate. Each
   wrapper records the next production membership call by delegating to the
   native owner and requires the returned membership applied index `K`. The
   route observer records the eventual existing `OBSERVED` reply for the exact
   request. These observable facts prove refresh; the test does not assert an
   internal refresh flag or restate the facts classifier.

6. **Complete the existing proof unchanged.** Require the same release promise
   to remain unsettled through the stale return and native refresh. After both
   observations answer, use the existing final census, classifier, control
   owner, guarded RESUME, identical-origin assertions and ordinary `K+1` write.
   No second release, group, native fixture, budget or timeout is added.

## Determinism, baseline and cleanup

The synchronization edges are all owner events: observation route entry,
native membership answer capture, exact retained carrier forwarding, native
`APPLIED_PROGRESS`, refreshed native membership answer and the same release
promise. There is no timer turn, sleep, poll or manual status read. Forwarding
cannot precede subscription because the carriers remain held until after both
captures; returning `N` cannot precede publication because its continuation is
resolved only by the two event promises.

The source-only baseline remains the existing behavioral red. Port wrappers
use only the already available canonical constructor and remain dormant unless
the observation action is routed. Access/subscription to the new event occurs
only after `edge.kind === 'observation'`; unchanged source settles and raises
the named premature-settlement failure first. It therefore cannot fail on a
missing action, event or method.

Cleanup must resolve every membership continuation, unsubscribe every installed
event listener, disarm/forward every unforwarded retained carrier, and restore
each exact wrapper only when `service.raft` still names it. It must then retain
the witness's independent release, route, owner, group and router cleanup and
aggregate primary plus cleanup failures. It must never overwrite a replacement
port or close the same native port through both wrapper and retained reference.

## Older origin with later accepted work

This combination is reachable, but the full release owner intentionally stops
before the applied-position phase. The existing registered real-drain control
in `test/partition/participant-release-protocol.test.js:475-623` first obtains
a durable origin, accepts a real SQL proposal without committing it, proves the
proposal queue owns one item and the durable origin is unchanged, then runs the
registered release. The canonical initial census returns `DRAIN_PENDING`, keeps
admission CLOSED, and only succeeds after the actual proposal/application owner
settles the work. That is the correct end-to-end safety proof for an older
origin plus later work.

Driving `OBSERVE_APPLIED_POSITION` inside the native attempt while that later
work exists would bypass the real cutover order: canonical pre-ENABLE drain
classification prevents that phase from being reached. The native stale-refresh
extension should therefore cite the existing real-drain control as M6 coverage,
while making no claim that it exercised the native observation phase. A separate
recipient-only action test would be an internal protocol control, not stronger
full-release evidence, and is unnecessary for this bounded extension.

