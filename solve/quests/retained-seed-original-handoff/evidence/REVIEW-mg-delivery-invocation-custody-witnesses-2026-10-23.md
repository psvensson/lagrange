# Independent review: source invocation custody component witnesses

Reviewer: `subagent:/root/mg_delivery_design`, 2026-10-23.

**Verdict: APPROVE the exact test for its stated component scope.** No blocking
test-premise defect was found. This does not approve root's evolving invocation
implementation or establish runtime, durable-debt, native-delivery or complete
F1/F2/F2-P acceptance.

Reviewed file: `test/partition/partition-cdc-invocation-custody.test.js`, 416
lines, SHA256
`5e9fc78dfb4a18a7b2e8332b8b93a52741594814f4fce63fbc3bfab8bbc82d3b`.
The governing approved contract SHA256 is
`474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`.
F1's response-versus-cleanup separation and the final F2/F2-P global-custody
requirements govern this review; the withdrawn total-payload/fanout caps do not.

Inspection covered the frozen test, the existing participant fixture and
controllable port, VirtualTimeSource and timeout-budget owners, actual source
shutdown/tenure paths, and the current private invocation seam. The production
source is moving and is not an approved candidate here. No runtime, source/test
edit, metadata refresh, commit, push or lab action was performed. This evidence
file is the only repository write for the review.

## Fixture and authority boundaries

The fixture calls existing `startReplica` with `generationOrigin:false` and the
existing `ControllableConsensusPort`. It uses real PartitionService,
PartitionCDCDelivery, initialization, leadership listeners, pending CDC custody,
SQLite connection and shutdown. `setRole` emits the controlled port's role
event; production mints the resulting leadership tenure. This is a deliberate
component seam, not an actual native election or admitted source write.

The imported helper's default generation-origin application is explicitly
disabled. The test does not invoke its separate participant-admission/release
helpers. Artificial source-event values are labelled component vectors. The
provisional builder provides a canonical test return to the semantic consumer;
it is never called evidence of a real recipient's local or native application.
No committed receipt, native position, source debt or CDC_DELIVERED is fabricated.

The local named imports correspond to actual exports in the current candidate
surface. The private `cdc-delivery-invocation.js` seam is new production work;
this test belongs with a frozen candidate supplying that module, not the
source-unchanged `21cfd917` native baseline. A missing-module/linking failure on
that old baseline would not be a semantic red.

## Behavioral evidence

| Contract cut | What the frozen test actually distinguishes |
| --- | --- |
| Capture before asynchronous caller mutation | Real delivery receives mutable input; the caller changes nested row data and timestamp before settlement. The callback sees detached original frozen semantics and receives the real private context separately, not in the event. |
| Expiry is the creating clock's observation, not timer dispatch | The original response timer is armed, observed time advances exactly to the remaining deadline, its callback is deliberately withheld, and the raw child fulfills. The caller must receive typed UNKNOWN/deferRetry with an aborted signal. |
| No dispatch through an already spent queued continuation | The private `run` queues its local operation; time reaches expiry before that continuation executes. The operation-entry counter remains zero. |
| Expired response does not release unfinished local custody | A real delivery owns a held callback and separately registered child. Expiry settles the caller, while fresh delivery remains BACKPRESSURE and its callback is never entered. Settling the callback alone still holds capacity; settling the last child releases cleanup and allows one fresh callback. |
| Lane/tenure replacement does not detach old work | Three actual controlled follower/leader transitions change production tenures. Each new drive joins the existing global custody, the old caller remains UNKNOWN, child cleanup remains pending, and callback entry stays at one. Only actual old-child closure permits fresh admission. |
| Shutdown fences before draining and closing persistence | Real `leader.shutdown()` settles the response UNKNOWN while shutdown remains pending and the exact SQLite connection stays open. It remains held after the callback settles but before its child does. Child closure lets shutdown complete and close that connection; subsequent delivery enters no callback. |
| Creating owner clears its own timer and old callbacks cannot release a successor | After arming one invocation, the test replaces `owner.timeSource`, finishes the old context, and checks only its original clock cleared the handle. A new invocation then survives direct replay of the old queued timeout and repeated old finish/retire calls; the old close callback runs once. |
| Private context authority is not structural duck typing | Empty, counterfeit, spread and inherited context objects fail INVALID before invoking either their supplied assert method or the subscriber. |
| Child rejection is terminally consumed | A raw owned child rejects without a test-installed catch; cleanup settles once and capacity returns. The test runner may therefore detect any detached production rejection tail. |
| One invocation is not renewed between local operations | Two `run` calls consume the same observed budget, and an early handler rejection retains the exact original error object. |

These assertions observe replies, entry counts, lifetime transitions, pending
cleanup, DB openness and successful later admission. They do not read or rewrite
the implementation's child counter, active-slot field, private WeakSet or lane
internals to manufacture the expected state. A finite gate releases real async
test work; it does not replace the production response/custody algorithm.

The test's shutdown cut follows a genuine owner ordering:
`partition-service-lifecycle-methods.js:shutdown` sets `isShutdown`, emits
SHUTDOWN_STARTED, later waits `pendingCDCEventDeliveries`, and only afterward
closes partition persistence. Thus the DB-open assertion can detect loss of
actual pending-child custody; it is not just a test-side boolean labelled
shutdown. The controlled port still means this is not native port-close proof.

## Clock and stale-callback limits

`delayedTimerClock` uses existing VirtualTimeSource scheduling and a separately
advanced observed-time source. Holding timer dispatch while the already-armed
invocation's observed time reaches its deadline is a valid event-loop-delay
schedule for the late-fulfillment assertion. `settleTicks` only yields existing
event-loop turns; it does not advance that observed clock or run the withheld
timer. The test therefore distinguishes a synchronous expiry check from merely
waiting for a timeout callback.

This helper is deliberately narrow. Its underlying timer clock can lag observed
time. A new timer armed during that lag is currently anchored to the lagging
scheduler clock, so this helper must not be generalized into a faithful model of
new child/successor timer deadlines during delayed dispatch without adjusting
that anchor. The reviewed expiry cases arm the timer before advancing observed
time; subsequent fresh-admission checks settle without relying on a newly armed
timer firing. This limitation does not invalidate those bounded assertions.

The queued-work test exercises the current private `run` seam's asynchronous
operation admission, not the outbound router's queue/reconnect/send boundary.
It must not be cited as proof that an expired transport queue item never sends.
The clock-replacement case proves timer **clearing** by the creating clock; it
does not establish sender/topology/MG clock-domain handoff or every remaining-time
read after arbitrary owner-clock replacement. The manually replayed old timer
is stale-callback/idempotent-close evidence, not a second completion of a native
operation or a proof that old remote effects were cancelled.

## Cleanup and remaining acceptance

The fixture's finalizer retires captured contexts, resolves held gates, awaits
observed pending work and calls the existing aggregate shutdown helper. That
helper attempts all source shutdowns and reports their failures. Tests do not
hide cleanup errors, kill a process, delete an open durable directory or leave
held gates as the intended terminal condition. Runtime must still demonstrate
that production closures settle as expected.

There is no actual owed ledger event here. In particular, JOINED_IN_FLIGHT on a
new tenure plus a stable callback count does not prove one-row SQLite hydration
or blocked hydration of a second real obligation. This file also does not prove
configured min-budget selection, a shorter enclosing caller grant, same-budget
propagation across all responsible subscribers, real selection/transport waits,
afterCommit lateness, remote transit behavior, topology wave/window capacity,
multi-budget provisional progress, source ACK, restart or complete W7.

Those require the distinct owner/component/native composition witnesses and an
exact source candidate. Preserve this test hash, independently review the
production invocation and consumers, then run the appropriate locked-lab suite.
This approval does not close activation/recovery exclusions, the Quest, release
or merge gates.
