# CDC delay timer cleanup

Status: bounded proposal and tests-only original; not sealed, solved or accepted.
Base: verified main `49fba99e1ad27acf83a75fdcee1f89a061377de4`, confirmed by
the sole lab/transport coordinator at 2026-11-12 19:25:31 UTC. Steering rule-set
revision 5 and the current lifecycle, resource, retry, owner-interaction and
harness-fidelity guidance were read. All existing WIP branches remain intact.

## Owner and complete transition

`CDCIntegrationServiceLifecycleMethods.delayUntilShutdown` owns one delay's
Promise, timer handle and `holdUntilShutdown` registration. The public service
constructor supplies its `timeSource`. The clock owns the actual timer; the
CDC lifecycle owner owns the service's terminal flag and shutdown registrations.
No durable state or commit point is involved, and this change cannot settle a
write or certify a cache effect.

The actual callers are `waitForRetryBudget` in
`src/cdc/cdc-routed-mutation-readiness.js` (both budgeted and unbudgeted paths)
and the retry in `src/cdc/cdc-integration-service-authoritative-catchup.js`.
Both retain their current delay, deadline and terminal checks. Projection waits
also use `holdUntilShutdown`, but own no delay timer. Their callbacks are not
redefined here. Other CDC timer owners remain distinct operations.

| Trigger | Existing owner transition and obligation |
| --- | --- |
| Ordinary delay | Capture this delay's clock, register one shutdown release, acquire one handle, and await its existing deadline. |
| Normal firing | The clock retires its timer; the callback removes the exact registration and resolves the Promise. |
| Already terminal | Resolve without timer acquisition or a null-handle cancellation. |
| Shutdown while held | Cancel the actual handle through its acquiring clock and resolve on successful cancellation; the lifecycle owner removes the registrations. |
| Acquisition throws before allocating | Remove the exact registration and reject with the original cause. A later delay on the same live owner remains useful. |
| Shutdown during acquisition | Record terminal state through the existing lifecycle owner, but defer this delay's shutdown settlement until acquisition returns a handle or throws. Cancel that handle or reject the acquisition cause. |
| Cancellation throws | Reject this delay with that exact cause without throwing into the shutdown release loop. The other registered delay still releases. The original clock retains any timer it did not cancel. |
| Service clock field changes | The outstanding delay remains bound to its captured clock. A coincident numeric handle on another clock is unrelated work. |

No additional retry, registry, timer, shutdown dispatcher or public result type
is proposed. A compact local acquisition state in the existing method is enough
to prevent a reentrant shutdown from claiming release before a handle returns.
The public Promise remains `Promise<void>`: normal completion resolves and
clock acquisition/cancellation errors reject without converting their causes.
This timer's contained failure does not promise that arbitrary third-party
callbacks registered through `holdUntilShutdown` cannot throw.

## Admission and evidence ceiling

`resolveTimeSource` accepts an explicitly supplied object with a `now` method;
the declared clock interface supplies `setTimeout` and `clearTimeout`. The CDC
constructor stores that object in its writable `timeSource` field. No canonical
contract excludes acquisition reentry or later field replacement. The normal
RealTimeSource and VirtualTimeSource do not spontaneously reenter acquisition
with the numeric delays supplied by these callers. Those controls therefore
measure an admitted injected-clock boundary, not a reported native-clock incident.

The controls construct the actual CDCIntegrationService. Their ordinary paths
use the existing VirtualTimeSource, and one positive uses the default
RealTimeSource and actual returned native handles. Only acquisition/cancellation
faults and reentry are injected; no CDC decision or registration is replaced.
No native awaited timer is unreferenced. The virtual duration is preserved up
to its exact deadline. A clock which allocates a resource and then throws
without publishing its handle remains responsible for that unpublished resource;
the acquisition-failure control throws before allocation and does not claim to
recover a handle the clock never returned.

| Material claim | Discriminating control |
| --- | --- |
| Delay and shutdown release the correct resources | Both completion paths hold one timer and one registration, retain the requested deadline, then reach zero; repeat shutdown adds no cancellation. |
| Native behavior stays useful | A default native delay fires while referenced; successful shutdown cancels the exact returned handle. |
| Failed acquisition does not retain a shutdown hold | The real clock method throws before allocation; the exact error is returned, resources are zero, and a restored clock runs a later delay on the same service. |
| Failure of one cancellation cannot block the next delay | Two real delays are held; only the first cancellation throws, its Promise rejects, the second resolves, and the original failed timer is subsequently observed firing on its own clock. |
| Shutdown cannot settle an acquisition before its resource is known | An admitted clock calls shutdown before returning its handle; successful cancellation, failed cancellation and acquisition throw retain the corresponding result and resource accounting. |
| Handle identity includes the original clock | Another clock already holds the same numeric handle; replacing the service clock during or after acquisition must leave that unrelated timer useful. |

## History and preserved first evidence

- `f9091010dc244205a9af04e5580d0e5a9f23dc47` introduced CDC shutdown awareness
  after retry loops rearmed timers during teardown. Its commit records that
  incident; those historical timings are not independently remeasured here.
- `64ca50428a719a9dd6fbc4c63332f76b8ce1e071` introduced the existing delay and
  its shutdown registration. Main still has the uncaught acquisition and
  cancellation paths; its lifecycle blob is
  `9bc091aa40d3f3947ae2cd257b92b917e048cf2d`.
- Donor `21da553a06fd5580c3abd0f7b183559e0a957185` contains a separable repair
  for acquisition and cancellation exceptions. Its relister imports, setters,
  registration and shutdown changes are deliberately outside this cut.
  Its delay hunk still uses the live service clock and settles before a
  reentrant acquisition returns, so a blind cherry-pick would be incomplete.
- Original resource lab2834 used tests-only
  `95c8e2c8df5f628b08eeaebdc36dd7169b2fb390`; R2 test blob
  `32c810528c0a16694bb72de6d0227ff98af0c62c`. Full retained log:
  `cdc-resource-red-worker.log`, SHA256
  `ea00a31a623895f4fff050211b2c15448ca2880d8f3ab9c791c4e0d4931eddb3`.
  Its normal-fire and normal-shutdown cases passed. Case32 reached the real
  shutdown release and failed because the cancellation error escaped.
  Case33 stopped earlier at an absent pacing registration; it did not prove
  its later cancellation assertions. The earlier clock-fault cases likewise
  stopped at the relister-state assertion before the timer-custody assertion.
- Later donor lab2949 passed 3 roots / 61 classified assertions, including
  all 56 R2 cases. Its remote source was
  `97dbfd09af1778d5ebac66a792b481e634471e3e`, tree
  `f61e9977b19fb9e78f6c00396f5de67545f3feab`; full log
  `cdc-resource-core-artifacts-worker.log`, SHA256
  `e912957491fba892637573ebf1c6be849d54849f9f27ac69f386cd6f874027cc`.
  Donor R2 blob: `efa3552fe32ed7204a548f13e9a15230e8967c96`.
  This is historical composed-source evidence, not this extracted PR's proof.

The new standalone root preserves the relevant assertions while replacing the
large image fixture with the real service and clock. Its bytes are a new proof
surface, so its tests-only original and corrected candidate require separate
immutable physical runs. Historical files and failures are not rewritten.

## External design inspiration

The official Node timer documentation ties cancellation to the handle returned
by acquisition and distinguishes referenced timers from process liveness:
https://nodejs.org/api/timers.html#cancelling-timers . The official Go context
documentation distinguishes deregistering a cancellation callback from waiting
for callback completion: https://pkg.go.dev/context#AfterFunc . These support
separate accounting for Promise settlement, registration removal and actual
timer disposal; they are inspiration, not evidence about Lagrange's behavior.

## Proof plan and boundaries

First run the new root against unchanged main source with canonical `test:file`.
Then freeze the reviewed source change separately and run that exact root plus
the existing time-seam, catchup-terminal and shutdown-terminal-owner-write roots.
The coordinator owns all physical execution, metadata generation, canonical
selection, static checks, source transport and publication. Canonical generation
must run on the final exact source; no generated artifact is copied from the
donor. The existing selected cone is preserved even if broader than these
early witnesses. No source acceptance, solved status, merge or release claim
follows from this proposal or the historical donor passes.

## Candidate after the original freeze

The tests-only original is `16396e3d1e21a6c4b7ce0569ce71b863866f385b`, tree
`480bc51cc818d50eac91b28094f2cff6f4c7d19a`. Root independently approved its
complete controls and design before candidate authoring. That verdict is not
a lab result or approval of the later source change.

The candidate changes only `delayUntilShutdown` and its adjacent comment.
The method captures the original clock, contains cancellation failure, removes
the exact shutdown hold on acquisition failure, and defers reentrant shutdown
settlement until acquisition returns or throws. Its source-file SHA256 is
`5bb296e5c51c6d5a374e480d592fe85b39cb66a1075391b04d5fdc2b977cebf4`.
The eleven-control test file is unchanged from the original, SHA256
`072afdbe221424574062116235b44f1a2ee28a3819943c98791a20626555edf8`.
Original physical measurement, independent candidate source review, candidate
execution and canonical generated/static/selected-cone proof remain open.
