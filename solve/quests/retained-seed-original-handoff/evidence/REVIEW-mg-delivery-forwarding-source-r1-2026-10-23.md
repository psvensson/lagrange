# Independent F3 forwarding source review — 2026-10-23

Reviewer: `subagent:/root/mg_delivery_design`.
Author: `subagent:/root/retained_effects_tests`.
Verdict: **REVISE**. Four finite source findings are below. This is a static,
category-complete review of the frozen forwarding lane, not approval of the
adjacent native/transport implementation, runtime proof, Quest completion,
original-participant classification, protected activation, or merge readiness.

## Reviewed identity and method

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Recorded base: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.
Frozen manifest: `/tmp/mg-f3-forwarding-frozen-r1-20261023/manifest.json`, SHA256
`65f84b9f90a49ba005ecfe3ff615cf86c4a3f2368f76d4ec465bcc1a3343aa67`.
Frozen patch: `forwarding-owner.patch`, SHA256
`935db1f1bf3ef446b075f776d932a6ade2e1c4bfd2982d435345454f839a465f`.
All ten live owned files matched the manifest on the final review census.

The governing contract is
`CONTRACT-mg-source-occurrence-delivery-2026-10-23.md`, SHA256
`474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`,
with design review SHA256
`2eb6a5a1243ee5efc72e0c5182e5f919fbc7d058c1404785bb3d4123ba3e597d`.
Its final F2/F2-P corrections, rather than superseded payload/total-target caps,
remain binding. The review read AGENTS, rules/router, Quest delegation, and the
admission, retry, transport, concurrency, formation, harness, owner-interaction,
adversarial-input, and recovery verification templates.

The author’s preserved syntax, scoped ESLint and whitespace results are PASS
(`static-checks.json`, SHA256
`fefa760b5da505b66e35b68f6c08cba33c92054b10a364b63d2bd7b43f66a31c`).
The complexity comparison is SHA256
`62ad16b3d239c175cd87a02fc73bbb13b13004812e2224ce07810e4bedc82ada`.
Those are inspected author artifacts, not runtime results reproduced by this
reviewer. The reviewer read the new named imports against their actual exports.
No runtime, lab work, source/test/metadata change, staging, commit or push was
performed. This review file is the only authored artifact.

| Frozen owned path (under `src/`) | SHA256 |
| --- | --- |
| message-group/message-group-forwarding-owner.js | a8d724ec76ccbe33cb85cf5e79d584a6c81a674631bebde53a100ee9db08d167 |
| message-group/message-group-forwarding-owner-delivery-methods.js | 6ff96b5dc0fbb0c3483e76b7b316571bdaad9bf5894227505ca87bbe0b26beda |
| message-group/message-group-forwarding-owner-routing-methods.js | 5f091f04c25730a19c65b77eceb729d2014c30d8d4c149421c10cc6c38bd03ec |
| message-group/message-group-forwarding-owner-constants.js | fc88e3a5c9002a636f6cc70b1b15bd85be124d9319a0fa20131794ecb9b3b020 |
| message-group/message-group-service-cdc-propagation-runtime-methods.js | a61df5d1523724b39e2e3f78bbc6da6c01c694f3f46a6244e6814fbc82dc61a2 |
| message-group/message-group-service-cdc-replication-runtime-methods.js | c13ae64e378cff031cda0b2e1e7b04f1619e1bc739bc92a3da3d0d9316c46b6e |
| bootstrap/shared/message-group-transport-handler.js | 650cacdf21b59d6ff03a0b5f16c97e37422209b411441579a466acd53769a5bd |
| message-group/message-group-service-inbound-ingress-runtime-methods.js | 4f2db5fce3e601e42d5cc4fa9ff470807f7e98a823e5d3f5e371dd64ed437796 |
| cdc/cdc-delivery-budget.js | 79c43524f102f47416d340da2bd2eb5d856bedf61867a6415b642485cf995530 |
| message-group/message-group-forwarding-owner-native-delivery-methods.js | 173ec7bf4d1e3c3a90d616aee79f83c01c8a4997695baa7dfef9c1c02484abb9 |

For interaction tracing only, adjacent draft/source snapshots read were:

| Path (under `src/`) | SHA256 |
| --- | --- |
| message-group/message-group-cdc-committed-acceptance.js | 6c47d0e5b7c7e99934e499bb29d60dc1dd9b8e4d5f2c8e1098128a8d550925b4 |
| message-group/message-group-proposal-routing.js | 9223219f63154f22545827c7978e0a8a7215f99621cfae1a15de50e4c0d2b7d1 |
| cdc/cdc-delivery-outcome.js | a09abd1f0fd1ca94a6a675cbf8d3be4c4cb189418ae8da77e83a9b593961cac6 |
| cdc/cdc-event-envelope.js | 2b7d00242ced4cb627ba70e4e1456cc377058b97c49114e55259428dfef1716b |
| message-group/message-group-forwarding-owner-target-methods.js | b130297a46f7e91c9aa1a1b1788a70701d17ae54b01ab3a115f3609de8e82dd2 |
| raft/raft-rs-status-observation.js | 02bb3526353bb62a7e637626d5ea054d4af31147a9d94bfcd01e098a43dcb427 |

## F3-R1 — cached-target native constraints go stale before dispatch

Categories: admission/gating, concurrency, owner interaction. Blocking.

`message-group-forwarding-owner-routing-methods.js:75-81` captures a native
observation and filters cache candidates against its leader identity and
non-learner peer set. `:236` supplies that predicate to target construction.
The filter is only a selection-time observation. The new actual-dispatch guard,
`message-group-forwarding-owner-native-delivery-methods.js:84-93`, checks a
non-native target only by asking whether a **fully resolved** native leader
route is now available.

Concrete reachable schedule:

1. An admitted follower has no known leader and has voter B in its current
   native peers. Existing cache rules select B and the router queues that work.
2. The same service/port/lifetime remains live. Native evidence now names A as
   leader, but A’s address is `UNAVAILABLE`; alternatively, a new configuration
   removes B while the leader route remains unresolved.
3. At actual dispatch the parent budget/currentness checks pass, and
   `resolveLiveLeaderForwardTarget()` returns null. The old B request is sent.

The new positive leader/membership contradiction is therefore treated like
missing address evidence. This violates contract lines 568-573 and 588-591:
cache may help resolve an eligible address, but cannot override a conflicting
live leader/peer binding, and binding must be rechecked at dispatch. The same
gap covers an observation that loses participation/health after cache selection.
The native-branded branch does recheck its exact port and status binding; this
finding concerns the separate cache-selected branch.

Required finite correction: re-evaluate the existing native eligibility
constraint for the exact cached target at the actual dispatch cut, including
unavailable/contrary observation, leader identity and configured voter status.
Do not make “cannot resolve the new leader’s address” permission to dispatch an
old contradictory target. No new route owner or retry policy is required.

Required paired witness: block the existing router queue after selecting B;
change native leader to unresolved A, remove B, and close participation as
separate negatives. Prove no B handler/send/proposal occurs. Preserve the
positive case where B remains eligible and only address evidence becomes
available through the existing owner, then obtain a real native receipt on a
fresh source invocation. A retained source debt alone does not excuse the
incorrect dispatch.

## F3-R2 — native selection bypasses its own target suppression

Categories: retry/backoff, admission/gating, owner interaction. Blocking.

`resolveNativeCdcIngressDecision` in routing methods `:105-129` directly returns
the observed native leader target. It does not consult
`service.isForwardTargetSuppressed`. The older target construction at `:413`
does consult that exact owner. The new failure path still calls
`suppressForwardTarget` (`native-delivery-methods.js:154-158`).

Thus a current native leader which returns an immediate no-handler,
backpressure, timeout or other suppressible response is recorded as suppressed,
but the next ordinary source retry selects it immediately again. The existing
suppression clock is implemented at `forwarding-owner-target-methods.js:222-252`;
the qualifying failure policy is `forwarding-owner-delivery-methods.js:318-347`.
This is a new bypass, not a change to the suppression owner’s policy. It defeats
contract lines 602-603 and the pressure/backoff paired invariant. Under an
immediate refusal, attempted traffic is bounded by caller retry cadence rather
than by the existing per-target suppression interval; adding callers amplifies
that difference.

Required finite correction: preserve the native route’s precedence without
dispatching a suppressed target or falling through to contradictory cache
targets. Re-enter fresh native observation through the existing source retry
when the existing suppression expires. Do not shorten the interval, add a
timer, widen fallback, or convert suppression into provisional completion.

Required paired witness: make the actual native target return a suppressible
failure, retry before expiry and prove no extra dispatch; advance the creating
owner’s clock to expiry and prove one fresh decision can dispatch. Repeat with
new native binding evidence and verify the intended existing suppression key
semantics, not a special test-only bypass.

## F3-R3 — malformed terminal requests escape into the ordinary path

Categories: admission/gating, transport, adversarial input, owner interaction.
Blocking.

Incoming single and batch handlers choose the durable path solely via
`hasDurableCdcEvents` (`cdc-propagation-runtime-methods.js:50` and `:191`). That
predicate means an event has an own `eventKey` (`cdc-delivery-outcome.js:137-148`).
A request explicitly marked `cdcForwardMode: 'native_commit'`, with a
`targetGroupId` naming a different group, but whose event has no `eventKey`,
therefore enters the legacy branch. That branch drops the terminal/group
context from its decision and application/forward calls (`:92-96`, `:118-136`,
`:166-174`; batch `:227-231`, `:257-261`, `:281-291`).

An ordinary-shaped NODES/SERVICES event can consequently project through
permitted strict local ingress on a follower, or be forwarded again; an actual
leader also applies it while ignoring the wrong target group. It cannot mint
a canonical durable receipt, but the explicit terminal request has nevertheless
acquired effects/routing prohibited by contract lines 577-585. The obligation
to retain source debt is not the only terminal-request invariant.

Required finite correction: recognize and validate the explicit forwarding
control context before choosing ordinary versus durable behavior. An explicit
terminal request with missing/invalid durable identity, wrong target group or
invalid depth must return/throw the existing typed retaining refusal before
projection, proposal or relay. Preserve the separately existing behavior of
ordinary cache-only events that carry no terminal request context.

Required paired witnesses cover single and batch: valid terminal request to the
admitted leader; valid terminal request to a follower; missing-key terminal
request; wrong-group terminal request; exhausted/invalid depth. Count projection,
native proposals and sends, rather than merely asserting absence of a receipt.

## F3-R4 — transient routing context is read before data validation

Categories: adversarial JS input, admission/gating. Blocking at the new context
boundary; this does not commission a rewrite of unrelated legacy payload code.

`readCdcForwardContext` and `combinedCdcForwardContext`
(`native-delivery-methods.js:15-41`) directly read `targetGroupId`, `relayDepth`
and `cdcForwardMode`; the conditional expressions can read a field repeatedly.
The receiver directly reads `payload.cdcDeliveryRemainingMs` before capture
(`cdc-propagation-runtime-methods.js:12`), and the batch discriminator reads
`payload.events` before any record validation (`:191-193`).

The semantic event capture is appropriately owned and detached, but in a batch
it validates only the member events. The outer forwarding wrapper is not
included. For example, an outer object inheriting `targetGroupId` from its
prototype, with own valid `events` and duration, is accepted as a matching
captured target. A getter for the duration/target/depth/events executes before
capture, can run more than once, and can change the transient routing decision.
In the single case capture eventually rejects an accessor-bearing record, but
only after the getter has already run. This is the own-property/accessor class
explicitly required by the repository verification template and addressed by
the existing `utils/canonical-json-data.js` owner.

Required finite correction: validate/copy the new untrusted request wrapper and
its routing/duration fields as own enumerable data before reading their values
or invoking recipient budget/selection. Consume one captured context thereafter.
Keep private `localDelivery` closures separate: they are local owned authority,
not fields to serialize or pretend are wire JSON. Reuse canonical-data admission
primitives rather than another input-schema implementation. Preserve strict
finite positive duration checks, the bounded integer relay domain and no clock
synchronization claim. Duration values larger than the local budget may safely
be capped by that existing budget; they must not enlarge it.

Required witnesses use inherited controls, accessor counters/changing values,
boxed/non-finite duration/depth, polluted prototypes and a faithful valid batch.
Verify zero accessor invocation/effects and unchanged source semantics. They
must exercise the wrapper, not only `captureCdcEvents` on already detached
members. No runtime attack was executed by this review.

## Native binding, answer and lifetime checks which are sound in source

The semantic question remains “did this exact vector obtain an applicable
native committed outcome for this target group?”. `cdc-delivery-outcome.js`
adjudicates it; forwarding supplies route/response evidence and does not build
a committed receipt. The existing native application afterCommit owner remains
the receipt producer. There is no new durable ledger, recovery controller,
payload-size cap, total-target cap, or wire command identity.

`nativeCdcObservation` requires an initialized live service, exact group and
replica, `CORE_OK`, healthy/usable status, recorded identity and open
participation. `observedNativeLeaderTarget` requires the same resolved leader
and non-learner peer address. The private WeakMap binds the exact port and
group/replica/peer/term/role/leader/configuration/membership/incarnation/runtime
and admission fields; `assertNativeForwardTarget` re-reads them and resolves
the address again (`routing-methods.js:36-103`). The actual status owner supplies
those immutable observations (`raft-rs-status-observation.js:27-149`). Missing
native address is not itself evidence of commitment or permission to substitute
mutable `service.leaderId`. F3-R1 is the remaining alternate-path gap.

For a valid durable vector, terminal context is captured, relay depth is an
integer in [0,2], every new send increments it, and a terminal or exhausted
forward cannot be relayed again (`native-delivery-methods.js:31-41,96-114,
164-179`). A valid terminal request on a follower is deferred by the canonical
native decision; the root-owned native acceptance seam also checks terminal
group/current leadership and disables provisional callbacks
(`message-group-cdc-committed-acceptance.js:142-168`). F3-R3 covers the malformed
control request which currently misses this valid-vector path.

Single and batch durable normalization use `captureCdcEvents` before the first
await and carry the full source vector/stamp. Successful forwarding requires
`isCommittedCdcDelivery(answer, events, groupId)`, or canonical provisional
delivery only for a nonterminal route; it returns the exact answer object
(`native-delivery-methods.js:55-57,135-141,183-196`). No transport ACK, cache
dedup or operation-ledger index is reinterpreted as commitment. Unknown/invalid
answers retain their cause rather than becoming success. The handler’s outer
application metadata does not replace the canonical receipt/provisional body.
`proposeCDCCommand` now returns `routed.answer` rather than discarding it
(`cdc-replication-runtime-methods.js:326-358`).

The local grant captures one creating clock, service/port/lifetime/group and
the minimum of configured, received-duration and enclosing grants
(`cdc-delivery-budget.js:23-57`). Each assertion recomputes actual remaining
time and the source/currentness fences; the wire builder adds only a fresh
top-level duration. Same-process authority travels unchanged in the private
third handler argument through registration, receiveMessage, application
dispatch and single/batch methods (`message-group-transport-handler.js:28-30`;
`inbound-ingress-runtime-methods.js:114-129,137,184-194,227-249`). The second
connection-authority argument is not repurposed. Remote delivery receives no
source brand or remote absolute deadline. The native waiter snapshot inspected
for compatibility consumes these parent operations at admission, proposal and
afterCommit (`message-group-cdc-committed-acceptance.js:35-50,99-119,173-187,
210-218`). This compatibility trace is not independent approval of that moving
adjacent implementation or of the separately reviewed transport lifetime.

Topology repair keeps its existing single-flight and cooldown owner
(`forwarding-owner-delivery-methods.js:62-117`). Each new read is capped by
remaining duration and each cache-reconciliation call rechecks it (`:128-218`).
The actual reconciliation owner performs its mutation pass synchronously
(`control-plane-system-table-gateway-cache-reconciliation.js:568-657`), so this
review found no additional unguarded await inside that mutation call. Late
repair completion is not converted into a receipt. No new repair timer is added.

## Category-complete disposition

| Template/items | Source disposition and remaining evidence |
| --- | --- |
| Admission 1, 6: prediction and freshness | Native route status and exact target binding use the canonical operation-port owner. **F3-R1** identifies the stale cache-selected dispatch; **F3-R3/R4** identify input admission gaps. |
| Admission 2-4, 7: reasons/budget/honesty | `cdcDeliveryBudgetError` carries typed code, deferRetry and non-retryable-current-invocation status; unknown results remain retaining. `createCdcDeliveryBudget:31-57` bounds the invocation without expiring debt. No claim of measured release latency or current-state diagnostic detail is made. |
| Admission 5; retry 1, 2, 4, 7 | No new retry registration/counter exists. Fresh native status plus the existing source retry releases provisional ingress; terminal depth cannot reset in-request. Source F2-P coverage and actual multi-budget release are separate root-owner/integration proof, still required. |
| Retry 3, 5 | Exits are typed INVALID/UNKNOWN or existing delivery failure; **F3-R2** is the suppression/storm-ceiling defect. No new timing override is proposed. |
| Retry 6; recovery 4 | The same source vector may be proposed again after lost response; only that new occurrence’s real afterCommit can answer. Projection dedup is not committed acceptance. Paired restart/loss proof is not supplied by this static review. |
| Transport 1-3 | Canonical outcome predicates reject ACK-only/no-handler/error/wrong-group answers; the exact canonical answer survives forwarding. Parent/current-clock checks fence late local returns. Transport’s independently found late-response issues are outside F3 approval and remain separate blockers. |
| Transport 4-5 | Existing router budget/queue owns missing handler/connection termination. F3 supplies remaining grant and dispatch callback; this review ran no router stub or runtime. No claim that a wire duration cancels already dispatched remote work. |
| Concurrency 1, 3, 5 | F3 introduces no queue/claim controller. Native waiter capacity and source/transport custody stay with existing owners; topology repair retains its one in-flight promise. The WeakMap is binding custody, not a second native identity authority. |
| Concurrency 2, 4 | Budget/currentness checks surround repair, transport and apply awaits; native targets are rebound at dispatch. **F3-R1** is the alternate-target TOCTOU defect. No new timer reentrancy is introduced. |
| Formation 1-3, 5 | Native addresses and cache/hints remain formation dependencies; no-address may use only permitted provisional ingress, never an ACK. B’s SERVICES metadata can repair route evidence; source-owned provisional coverage allows its scan to reach B. No activation/publication authority is granted. **F3-R2** prevents claiming the pressure variant complete. |
| Formation 4 | End-to-end budget/window arithmetic remains unmeasured. Do not infer release latency or W7 success from static source, a cache change, or an RF1 witness. |
| Harness 1-6 | No new tests in this lane. The two existing mutable-leader fixtures below omit newly required real premises. Native S2 must still establish actual application-return/route engagement before its semantic red/green predicate; setup or timeout failures are not evidence. |
| Owner interaction 1-2, 7, 9 | Outcome and native status authorities remain singular. Private third argument does not leak through wire/native commands. **F3-R1/R3/R4** are specific surviving alternate-admission routes; they are not permission for broad fallback. |
| Owner interaction 3-6, 8 | Native-before-provisional release, stale-then-fresh replay and unchanged pressure must be demonstrated in the same exact-source witness. **F3-R2** fails pressure preservation in source. No controlled-negative runtime was run for this candidate. |
| Owner interaction 10 | Final integrated impact registration must include these new owner helpers and the exact current native/component witnesses. The frozen F3 lane deliberately did not own metadata/registry changes; final registration/proof alignment remains root’s gate. |
| Adversarial 1, 5, 7 | Relay bounds and finite primitive durations are checked; local minimum caps large wire duration. Captured semantic positions/digests remain with the envelope/outcome owners; no coercion-created receipt is introduced. The new wrapper needs the complete edge-lattice tests in **F3-R4**. |
| Adversarial 2-4, 6, 8 | Member-vector canonical capture handles dense data and immutable descendants, but it does not validate the outer request or pin its inherited/accessor reads. **F3-R4** requires the existing canonical input primitives and prototype/intrinsic-sensitive wrapper coverage; do not substitute a test of already captured events. |
| Recovery 1-3, 5 | No durable restart registry or recovered enlistment is introduced. Repair remains authoritative cache reconciliation, not replacement of waiters/history. Unavailable native observation, lost response and absent cache rows cannot imply completion. Old-versus-live source coverage invalidation is root’s existing source owner, outside this F3 lane. |

## Existing fixture mismatch and history

`test/message-group/message-group-service.test.js` SHA256
`831c6657edad468cbe84ee5125ef6eda5f9f0f9e21a58d2c1e33b1caa59cbf0a` has two
concrete component-premise mismatches:

- At `:568`, “live leader routing uses current consensus peer addresses before
  cache echo” never initializes the service, assigns mutable `service.leaderId`,
  and supplies a peer-only `reportingConsensusPort`. It supplies no coherent
  native group/replica/leader/health/participation observation.
- At `:609`, “strict CDC accepts connected live leader targets before ready
  lease publication” uses the same incomplete/uninitialized native fixture,
  with a connected NODES row and null ready lease. Its call to `canAcceptCDCEvent`
  is allowed to perform the existing optional-initialization precheck, but the
  only asserted live route is now correctly unavailable without a usable
  native observation.

The frozen before/after patch shows that the previous route normalized mutable
`service.leaderId` and then read peer addresses. The stronger current native
binding is the approved interaction change; restoring that mutable fallback to
make these fixtures green would violate it. A minimal fixture repair must model
an initialized live owner plus a coherent current operation-port observation,
preserving the intended pre-cache/pre-ready-lease behavior. It must not fabricate
an activation grant or claim component status doubles prove actual RF5/native
formation. These are source-predicted fixture mismatches, not measured runtime
regressions in this review.

The adjacent suppression behavior already lives in the pre-change target owner,
and the historical verification templates record ACK-with-no-handler, stale
precheck/enforcer state, registered retry suppression and formation-cycle
failures. Those existing owner mechanisms are the basis for F3-R1/R2, not an
invented new retry architecture. The earlier native baseline failures before
the application-return predicate remain preserved failures of engagement; they
are not upgraded here into expected semantic reds.

## Re-review and proof boundary

Re-review the finite four corrections together, with exact new hashes and
paired component witnesses. Retain current valid durable terminal/native route,
full-vector identity, ordinary unmarked cache-event behavior, relay bound,
creating-clock grant and source debt ownership. The current verdict does not
authorize changes to clocks, retry/suppression cadence, fanout domain, transport
protocol, native identity schema, source publication rights or recovery storage.

After independent source correction review, the exact combined candidate still
needs the ordinary-admission/native RF1 and custody/loss cases, the genuinely
engaged RF5 provisional-to-native route, hostile/late/pressure components and
normal metadata/static/lab gates. Even those do not close cross-member original
classification, protected activation, durable transfer or composed two-start
acceptance. No such closure is claimed here.
