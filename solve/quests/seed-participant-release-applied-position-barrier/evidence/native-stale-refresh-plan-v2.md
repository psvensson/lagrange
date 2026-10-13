# Native stale-membership refresh plan V2

Status: **read-only revised design; implementation and measurement remain HOLD.** This file changes no source, test, fixture, Quest, registry, generated metadata, or evidence receipt and authorizes no run.

## Exact binding and proof ceiling

This revision supersedes plan V1 SHA-256 `5699a4c27186d929a2e04f5d143691c43abd2e97b3231fa32192294a2288b9e2` only as design input and closes N1-N4 from independent review SHA-256 `e9a2fb7bcc429b9e67f9ca76bfb2a944d4da8c5e9aac0de65b16e09746670683`.

The native witness input remains reviewed V7 SHA-256 `d0f0469f57b77858827309eecfc039909a7bd223cb250194492fd4a61cd3c8bd`, executed input `77ead1c4ac1b3cd84aa209a9de6819fd506a79e6`, source tree `4ff29d950a074768b3bcc40f6df310abda9827c0`, and qualified primary-red report `85958a7474527486a393c84bed2c261e35ba9efeec2401f7bbb18acce03d1374`. The cycle/orphan integration baseline is immutable commit `9ba9a1941b2326d0d0bcfa49c581cc2fcf74af8d`, tree `c8bc996fe10cca221c68b5ca7954d1a51066d17d`, source tree `b09288511757fd86ef92553ac235c8d0fed0b345`. V7 test bytes are unchanged by this plan. An active production author may produce later source; this design does not inspect those mutable bytes or presume their approval.

At the integrated baseline, the canonical facts owner is now `partition-participant-transaction-pause.js:84-115`. It alone awaits `readCommittedMembership`, reads status afterward, and returns the existing typed membership-unavailable answer when configuration, term, or applied position disagree (`:91-98`). The test must return a real old membership answer into this owner and must never restate that comparison. `createRaftOperationPort` remains the canonical immutable wrapper constructor (`raft-operation-port.js:45-58`), and `learner-recipient-fixture.js:121-136` remains the existing precedent for delaying an actual native membership result while delegating the real port.

The extension remains inside the same V7 three-voter attempt, two existing follower carrier gates, registered release route, and resource custody. It adds no group, release call, classifier, facts reader, status poll, timer, retry, or fixture framework.

## Exact wrapper contract — N1

Each of the two existing followers receives one local scheduling wrapper built with `createRaftOperationPort({...native, readCommittedMembership})`. The wrapper retains the exact native port and a fixed bounded record:

- whether the exact follower observation has armed;
- at most one captured `N` answer and its request purpose;
- at most one subsequent canonical `K` answer for the same active observation;
- one continuation for the held `N` return;
- the exact current wrapper identity needed for safe restoration.

The wrapper entry itself is deliberately **not** declared `async`. For every unarmed read, non-target purpose, or call after the one intended capture, it invokes the retained native method exactly once and immediately returns that exact value, Promise, or rejection. No `Promise.resolve`, `await`, `.then` replacement, cap, or trace wrapper lies on this dormant path, so PAUSE, INSPECT, pre-observation release reads, and unchanged-source timing retain native result identity and settlement timing.

Only the first armed read for the exact observation request takes the intended asynchronous hold. It invokes the native method once. If the native result is asynchronous, a test-owned continuation observes that same settlement and retains the exact frozen answer; if it rejects, the original rejection is retained. The held branch validates only witness engagement: canonical purpose, original follower identity, term/configuration, and applied position equal the already measured `N`. It then signals `captured`, waits on its one test continuation, and returns the untouched native answer.

Subsequent real reads remain exact pass-through. A passive side observation may inspect their already-produced native settlement to signal the bounded `K` record, while the production caller still receives the original return object/promise/rejection. It records only the first current answer belonging to the same armed observation and never initiates a read itself. This is measurement, not a second observation owner.

Arming occurs in the existing V7 route observer immediately before delegating the exact follower `OBSERVE_APPLIED_POSITION` delivery. The route observer uses the existing decoded edge and request identity; it neither recognizes the action independently nor imports a new classifier. The wrapper remains dormant when unchanged source takes V7's earlier premature-settlement branch. Access to `RAFT_EVENT.APPLIED_PROGRESS` is deferred until the existing observer edge is actually reached, so the unchanged-source negative cannot become a missing-action or missing-event setup failure.

## Deterministic same-attempt schedule — N2 and N3

One tracked settlement record is installed when the existing outer release promise is created. Once an observation route exists, its exact registered-route promise is tracked as the inner settlement of that same attempt. Every stage below races its owner-produced signal against the earliest original outer/inner settlement that would make the stage impossible. A stage losing that race fails immediately with the actual typed result or rejection plus the already captured stage facts. It does not start a timer. The original request/observation deadline remains the only time bound.

The race judges recorded owner state, not Promise callback ordering. If a settlement callback wins but the required capture/event/current answer was already recorded, the stage accepts that recorded fact. If the required fact is absent, the settlement is the failure evidence. A valid final observation may therefore settle as soon as its real `K` read is recorded; the test never requires an extra microtask in which the request remains pending.

1. Start V7's one ordinary release attempt and retain its existing release, attempt, origin, term, cohort, deadline, pause, and zero-effect observations. The existing PAUSE treatment arms the two real carrier gates. No wrapper is armed yet.
2. When the original attempt routes the two follower observations, arm only the matching follower before the existing delivery delegate runs. Race both `captured` signals against the original settlements. Winning capture proves each real native membership read returned immutable `N` while its continuation remains held; losing reports the actual premature/typed settlement. The outer release must still be pending at this point because the real required follower evidence is unavailable, rather than because a test-time turn was sampled.
3. Before forwarding, subscribe through each retained native port to payload-free `RAFT_EVENT.APPLIED_PROGRESS`. The listener records only the owner event and does not read status, call facts, or drive Raft.
4. Invoke each existing carrier gate's `forward` exactly once with its stored receiver and exact arguments. Retain each actual return/rejection. After both forwarding calls have been made, disarm and restore both exact transport handlers **while both `N` continuations are still held**. Restoration compares exact installed handler identity and never overwrites a replacement. This ends the artificial fault immediately: later APPEND/HEARTBEAT traffic, including commit-`K` heartbeats, passes through normally.
5. Race both actual carrier settlements and both native `APPLIED_PROGRESS` signals against the original attempt settlements. The already reviewed durable witness may then pin the two followers' real published `K/K/K`, ENABLE origin, unchanged term, role, configuration key/generation, request lineage, and remaining deadline. No `readStatus`, tick, campaign, step, polling helper, sleep, or added timeout is used to obtain the wake.
6. Resolve both held membership continuations only after transport is restored and both real publication events occurred. The canonical facts call receives its untouched membership `N` and reads the now-published status `K`, producing its existing membership-unavailable result internally. The observer's retained dirty wake must cause its one owned canonical re-observation before it settles that first unavailable result.
7. Race the two passive subsequent-read `K` records and the exact registered observation replies against the original settlements. Each second native answer must be current `K` for the same follower and exact active observation; each route answer must be the canonical valid response for the original request. Two calls alone are not accepted: the authentic `N` capture, publication event, original request identity, and retained same-route settlement must all bind them.
8. After both observations have validly answered, allow the existing outer release to complete normally. Do not assert that it remains pending after valid refresh. Preserve V7's fresh final census, sole classifier, current-control check, guarded RESUME, identical origin, unchanged proposal/pending effects, and ordinary `K+1` write. No successor release or renewed deadline is introduced.

The stage-race helper, if a local name is useful, is witness-local and accepts only an existing stage Promise plus the already tracked settlement Promises. It has no clock, timeout, retry, polling, facts, or authority logic and is not exported as another framework.

## Cleanup, replacement, and zero effects — N3

Every path uses the witness's existing independent aggregate/resource custody. Cleanup performs all applicable actions even after a primary failure:

- resolve both membership continuations and await every held wrapper task that actually started;
- unsubscribe every installed progress listener;
- forward or retire each still-held original carrier through the existing gate's truthful cleanup, then restore an exact transport handler only when it still owns the slot;
- restore `service.raft` only when it still equals the exact installed wrapper, never over a replacement, and never close the retained native port separately;
- await the original route/release settlements when started, preserving their actual failures;
- run the existing owner, group, router, directory, and retained-artifact cleanup without suppressing any primary or cleanup error.

No cleanup commits application work, forces a status transition, emits progress, calls the facts owner, or changes admission. Before the exact observation route, dormant wrappers are observationally identical passthroughs. During treatment, only the already held carrier deliveries and held native return are scheduled. Term, configuration, generation, origin, pause, proposal queue, pending outcomes, and data remain owned by the real runtime/application paths.

## Two distinct falsifiers and the fresh-read control — N4

The required negatives remain separate:

1. **Unchanged integrated source:** the extended wrapper stays dormant and V7 must retain its named real premature-settlement failure while the carrier treatment is engaged. This is the broad application-barrier negative. Missing imports, absent action/event access, wrapper setup, election churn, or cleanup failure cannot count as this red.
2. **Dirty-retention-only source treatment:** after an exact candidate is frozen and independently reviewed, create an immutable source treatment that changes only the recipient observer's storage/consumption of an `APPLIED_PROGRESS` wake arriving while its canonical membership read is in flight. The treatment leaves the action, subscription, idle-wake handling, first canonical read, mismatch classification, lifecycle/deadline checks, and normal revalidation path present. Its exact diff must show that no unconditional reread, poll, timer, fallback success, or classifier change was introduced.

The identical extended witness and host must prove both real `N` captures, both forwarded `K` carriers, restored transport, both real `K` publication events, unchanged term/configuration/lifecycle, and no setup failure. With dirty retention removed, the same observation must then fail at the named missing-`K` refresh or settle with its original typed membership-unavailable/deadline result. An election, missing method/event, changed cohort, lost cleanup, or the earlier application-barrier failure is the wrong mechanism and is excluded. This expected negative remains outside positive results.

The paired fresh-first-read control remains distinct: when publication is already reflected before the first facts read, the existing canonical read returns current evidence with one native membership read and no forced second pass. The prepared controllable test is not native stale-in-flight proof and remains subject to its own integration review. Independent source-order review must confirm that candidate re-observation is conditioned on the retained in-flight wake rather than unconditional looping.

## Older origin and later accepted work

The existing real registered-drain witness remains the honest full-route control: a durable older origin plus actual later accepted proposal is refused at the pre-ENABLE canonical drain check, stays CLOSED, and succeeds only after its application owner settles. That work cannot legitimately be injected into this later observation phase. This plan cites that control without claiming the native stale-refresh attempt exercised it and adds no recipient-only fabricated work.

## N1-N4 disposition

- **N1 closed in design:** exact non-async dormant passthrough; one intentional held call; bounded passive subsequent record; one native invocation per production call.
- **N2 closed in design:** both real `K` carriers are forwarded, then both exact transport gates are restored while `N` remains held, before publication/refresh waits; normal heartbeat/term/configuration health is required.
- **N3 closed in design:** every stage races original same-attempt settlements and their existing deadlines; no test timeout or post-refresh pending claim; independent cleanup covers every acquired resource and failure.
- **N4 closed in design:** unchanged-source application-barrier red, exact dirty-retention-only treatment, and fresh-first-read positive are three distinct obligations with explicit right-reason exclusions.

Exact test implementation still requires an independent content preflight followed by locked candidate, unchanged-source, and dirty-retention-treatment measurements on one immutable input. This plan does not approve source, test content, or a Quest receipt.
