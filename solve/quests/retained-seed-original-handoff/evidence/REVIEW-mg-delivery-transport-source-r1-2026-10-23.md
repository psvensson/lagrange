# Independent F1/F2 transport source review, round 1

Verdict: **REVISE**. Four material findings below are the complete findings from
this bounded source review. This is not runtime proof, approval of the root or
F3 lanes, Quest closure, publication, or merge acceptance.

Reviewer: `subagent:/root/retained_effects_tests`. The reviewer did not author the
nine transport files. The reviewer authored the separate F3 forwarding lane;
its files are inspected here only as consumers of the transport contract, not
independently approved here. No production/test/metadata changes, runtime
execution, lab, commit, or push was performed for this review.

## Exact candidate and authority

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Base HEAD: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.

- Transport manifest: `/tmp/mg-delivery-transport-manifest-2026-10-23.json`,
  SHA256 `9fddb15cbe42bcda4e881183990d666c20c94b592af3e4edfa355dedde350cfa`.
- Authored patch: `/tmp/mg-delivery-transport-owned-2026-10-23.patch`,
  SHA256 `dc04c89207743dcab1278fdf747958f8ef74e899fe224c354f96c9583325645e`.
- Author dossier: `/tmp/mg-delivery-transport-notes-2026-10-23.md`,
  SHA256 `77feab407c90b4db9ef6236a90f7edfd3df73c5e58a963848d196ed103ee44fa`.
- Approved interaction contract: `CONTRACT-mg-source-occurrence-delivery-2026-10-23.md`,
  SHA256 `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`.
  F1 is at lines 379-461; the final F2 memory/custody correction includes
  lines 749-801. Later progress corrections remain binding.

All nine live transport file hashes were checked against the manifest and
matched. The review covers delivery-lifetime, ack-delivery, delivery-behaviors,
pending-response-ledger, outbound-delivery-registry, delivery-pressure-routing,
delivery-delegation, reconnect-behaviors and stats-shutdown. The author's normal
syntax/lint/cycle/debt reports are claimed static evidence, not rerun runtime
evidence. No test result is inferred from them.

Auxiliary interaction bytes inspected:

| Path | SHA256 |
| --- | --- |
| `src/cdc/cdc-delivery-invocation.js` | `227f1320c10c1a553e3b2f0bf8237d09932acfd13c856da47eeb8c1844211d21` |
| `src/topology/cdc-group-propagation-durable-delivery.js` | `554ae07074a6d92b373ce7c9353cdda569513c76b2986fcbca00a4aaf0add9be` |
| `src/message-group/message-group-cdc-committed-acceptance.js` | `6c47d0e5b7c7e99934e499bb29d60dc1dd9b8e4d5f2c8e1098128a8d550925b4` |
| `src/cdc/cdc-delivery-budget.js` | `79c43524f102f47416d340da2bd2eb5d856bedf61867a6415b642485cf995530` |
| `src/transport/message-router-connection-authority.js` | `10752e921d243caa3a5cac59b7c2ed0d700ca01d936803c52a3616351767eb36` |
| `src/transport/message-router-server-lifecycle.js` | `719d030d11d364f7d38f64d1be878ce1e2f50a78369b6aa01f9ba30a79cefeb6` |

## T1 - raw socket write custody ends at ACK refusal

Categories: transport-delivery, concurrency-serialization, owner-interaction,
retry-loops. Priority: high.

`src/transport/message-router-ack-delivery.js:63-72` creates the encoded request,
but line 135 calls `connection.ws.send(encoded)` without a write-completion
callback. The only observed completion is ACK/abort: lines 84-112 settle the
send promise immediately. On timeout, the queued deliver function therefore
closes; `message-router-outbound-delivery-registry.js:603-614` releases its
in-flight charge, and `message-router-delivery-lifetime.js:171-198` settles the
raw promise charged to the genuine source invocation.

That is not the actual encoded-copy lifetime. The installed socket owner
documents its callback as running when data is written out
(`node_modules/ws/lib/websocket.js:440-455`). Its sender retains data through
asynchronous compression and queued writes (`node_modules/ws/lib/sender.js:511-527`
and `551-553`). An ACK timeout need not close that socket:
`message-router-reconnect-behaviors.js:586-620` deliberately leaves recently
live slow peers connected. This liveness policy must not be weakened to hide
the missing charge.

Finite counterexample: a valid large event enters a socket whose write remains
held, while independent inbound activity keeps that connection live. The
invocation expires without ACK. All newly tracked transport/source children
can close even though the socket still owns the encoded copy. The next source
retry can repeat the same send. Repetition retains more encoded copies than
the admitted active dispatch window accounts for. The source ledger retaining
debt is necessary, but does not account for these transient copies.

This send behavior predates the candidate (`21cfd917` delivery-behaviors line
689). It is nevertheless an applicable systematic defect in the newly claimed
F1/F2 closure: contract lines 766-781 and 797-801 explicitly retain transport
copies and raw-send cleanup until the actual finalizer closes them.

Required correction: make the existing send/queue/source custody interaction
observe actual socket write completion or actual owner closure independently
of the public ACK/response deadline. Public timeout must remain prompt, and
must not release that charge. Preserve exact finalizer identity and rejection
consumption. Do not add another unbounded payload registry. The in-process
socket implementation also needs faithful applicable completion semantics:
`message-router-shared-vocabulary.js:266-274` currently has only `send(data)`
and a queued delivery microtask. Treating it as immediately completed would
make the negative witness vacuous.

Required witness: hold a real send-completion seam after public timeout, keep
the connection legitimately live, attempt a successor wave, and assert actual
slot/copy custody remains. Then release or close the held write and prove one
release, no stale-finalizer release of a successor, and an ordinary later
retry. The source-semantic mutation which drops write custody must fail on
accounting/effect facts, not merely a longer timeout.

## T2 - router reinitialization can revive a private local grant

Categories: admission-gating, recovery-replay, concurrency-serialization,
sweep-timer, owner-interaction. Priority: high.

`message-router-delivery-lifetime.js:85-117` checks the mutable
`router.isShuttingDown` flag, but captures no shutdown incarnation/currentness
fact. `message-router-stats-shutdown.js:167-199` retires ACK/response and queued
work, not the new lifetimes of still-running local handlers. The latter own no
pending-message entry. `message-router-server-lifecycle.js:29-50` explicitly
supports initializing the same object again and resets that flag.

Finite counterexample: a local handler has captured argument 3 and is held
before its effect/fulfillment; the source context and deadline remain live.
Shutdown and reinitialize the router before the handler resumes and before
its timer fires. `localDelivery.assertCurrent` and `remainingMs` at
delivery-behaviors lines 50-54 now see a non-shutting-down router again. The
old handler can use the grant and the old delivery can settle successfully.
The F3 receiver correctly consumes that grant, but cannot discover a shutdown
incarnation the grant did not capture.

This exact lifecycle class was already addressed by another existing owner:
`message-router-connection-authority.js:112-130` rotates a private lifetime at
shutdown so old deliveries cannot resurrect. Commit
`d9e87b2961993121d75df11d3a177d380ad790df` introduced that boundary;
`test/transport/service-delivery-lifetime.test.js:52-63` explicitly checks the
same-object shutdown/reinitialize schedule for argument 2. Argument 2 is
preserved by this candidate, but its lifetime fact is not consumed by the new
argument 3. This is a cross-owner omission, not a request to conflate deadline
context with membership/connection authority.

Required correction: bind the new deadline/currentness interaction to the
actual router lifecycle owner so shutdown permanently retires old grants,
including grants held only by a local handler. Keep raw child cleanup charged
until it actually closes. Do not reset old refusal when initialization succeeds.

Required witness: extend the real lifecycle schedule to capture argument 3,
hold the old handler across shutdown/reinitialize, and prove old effect and
success refusal while a genuinely new delivery succeeds. No manual assignment
of `isShuttingDown`, fabricated context, or forced source retirement may supply
the fence being tested.

## T3 - a rejected late response can still be classified SETTLED

Categories: transport-delivery, sweep-timer, concurrency-serialization.
Priority: medium.

`message-router-pending-response-ledger.js:442-459` checks the remaining grant,
then calls `pending.resolve`. That resolver checks the clock/currentness again
at lines 363-369 and can reject instead. The caller nevertheless unconditionally
returns `true` at line 459. `resolveServiceResponseDisposition` at lines 205-214
therefore reports `SETTLED` even when the actual completion was timeout/refusal.

Finite counterexample: the first check sees positive time just before the
deadline; the second sees expiry, without the timer callback having run. The
lifetime synchronously retires the waiter and records the timeout marker, but
the arriving frame is reported as matched. Source acceptance is still fenced
by the rejected promise: this is not a demonstrated false source ACK. It is a
concrete violation of the required original-pending/late-classification owner
contract and can leave the timeout marker to classify a different later frame.
The same pattern applies if the live parent becomes invalid during those checks.

Required correction: classification must consume the actual settlement winner
of the exact pending entry. A precheck is not the result of enforcement. Keep
the delayed-timer check, exact pending identity, and creating-clock cleanup.

Required witness: use the actual pending-response ledger with a controlled
creating clock crossing the deadline between these two boundaries. Assert
both promise refusal and `late_after_timeout`, then verify the old callback
cannot settle/remove a successor. Existing late-response tests only cross
expiry before the first settlement check and do not cover this case.

## T4 - the outgoing duration does not debit known encoding time

Categories: admission-gating, transport-delivery, owner-interaction.
Priority: medium; requires an explicit owner-level handoff resolution.

`message-router-delivery-lifetime.js:132-137` obtains a remaining duration and
passes it to `prepareDeliveryMessage`. `message-router-ack-delivery.js:63-72`
then JSON-encodes the entire request. The check at line 75 refuses a completely
spent grant, but the already-encoded duration is never reduced before the send
at line 135. F3's real callback writes that supplied duration directly at
`src/cdc/cdc-delivery-budget.js:19-20`; the remote receiver admits a new child
from that field at lines 39-44.

Finite positive-time counterexample: preparation observes 1000 ms; encoding
consumes 900 ms; the post-encoding checks still pass with 100 ms. The sent field
remains 1000 ms, so a zero-transit remote recipient receives a 1000 ms child
grant rather than the residual 100 ms. This is known sender processing time,
not the unknowable network transit explicitly excluded by contract lines
420-429. Whole-grant encoding exhaustion is checked correctly; that does not
settle the partial-consumption case. Large accepted events make serialization
cost part of the applicable domain, not an unsupported oversized input.

Contract line 413 says to debit processing before further forwarding. Root
re-read lines 409-429 during this review and confirmed they do not explicitly
exclude encoding from that processing. Resolve the full encoding cost and the
finite final handoff overhead at the existing transport/CDC interaction owner.
This review does not prescribe a new wire format/codec, repeated full encoding,
foreign absolute deadlines, clock synchronization, or a smaller input cap.

Required witness: an owned encoding/clock control consumes a positive proper
part of the grant, leaves the dispatch live, and inspects the actual bytes and
receiver grant. Preserve separate full-exhaustion refusal and unknown-transit
controls. This must test semantic remaining-duration accounting, not merely
that a timer eventually expires.

## Category-complete disposition

The nine requested template categories were applied to this transport scope.
The additional hostile-input template was considered at the private-brand and
numeric-grant boundary; this router is not the canonical event/digest parser.

| Category / applicable checklist items | Disposition and evidence |
| --- | --- |
| Admission/gating 1,3,6 | One router-clock budget begins before initialize/queue (`delivery-behaviors:143-150`, `delivery-lifetime:42-52`). Existing lifetime reuse is brand/router checked at `205-210`. Actual dispatch and fulfillment checks are present. T2 and T4 prevent approval of full currentness/grant claims. T3 is a precheck/enforcement mismatch. |
| Admission/gating 2,4,7; hold release 5 | Public own-timeout maps to typed deferred failure and own-shutdown to failed delivery (`delivery-behaviors:192-201`); foreign errors are not selected by matching text (`delivery-lifetime:129-130,213-217`). Queue release is actual completion (`outbound-registry:603-614`), subject to T1's missing lower write completion. No budget was raised. |
| Retry loops 1-7 | The existing reconnect owner, backoff, retry-after and per-target budget remain (`reconnect-behaviors:256-302,305-437`). A reconnect is awaited before a fresh remaining-time check (`451-513`); no late CDC send follows that await. A recovered ACK now feeds the original response waiter (`delivery-behaviors:385-424`). T1 permits uncharged repeated copies; T2 permits lifecycle resurrection. Native/source replay idempotence is supplied by other owners, not proved by ACK. |
| Transport/delivery 1-5 | ACK and SERVICE_RESPONSE are separate (`delivery-behaviors:428-470`). Full application fields and `noHandler` survive; only canonical CDC consumers may accept receipts. Original pending registration precedes enqueue (`287-303`). T3 defeats one late classification edge. Missing connection/deferred paths are bounded by the same lifetime; missing handlers are not converted to native acceptance. No new transport mock is supplied by this delta. |
| Sweep/timer 1-5 | Creating-clock set/clear and unref are explicit (`delivery-lifetime:46-83`, `ack-delivery:62,87,114-123`, `pending-response-ledger:349,411-437`). Actual clock is checked without requiring timer dispatch. Exact pending identity protects replacement timer/cancel cuts (`ledger:389-438`, `ack-delivery:89,115`). No Raft rollback or durable mutation is performed by expiry. T2 is the unresolved lifecycle reset; T3 the boundary classification. |
| Recovery/replay 1-5 | Live message-ID reuse is refused synchronously (`ledger:337-343`, `ack-delivery:54-56`). Arm/cancel/abort retain the exact original entry (`delivery-behaviors:293-298`; `ledger:389-471`). No durable source ledger or reconstructed completion authority is added. Late absence is not acceptance. T2 is the concrete restart/live discriminator gap. |
| Concurrency/serialization 1-5 | Queue admission remains synchronous under existing limits (`outbound-registry:360-579`); processing is guarded and exact queue identity fences old finalizers (`581-618`). Cancellation removes only its pending item, even behind blocked work (`12-53`). In-flight reconnect remains charged until the actual function settles. T1 is the lower-level unowned child; T2/T3 are the other applicable interleavings. |
| Formation circularity 1-5 | The transport owns no metadata SQL write/read or activation authority. It consumes the existing connection resolver and reconnect owner (`reconnect-behaviors:144-163,305-437`) and emits bounded refusal when unavailable. It does not bypass participation or clear source debt to unblock formation. The full provisional/native formation window remains a separate composed native witness; no window/margin measurement is claimed here. |
| Harness fidelity 1-6 | Static checks are not semantic proof. Existing tail timeout/shutdown cases and `late-response-classification.test.js:59-115` are relevant regression controls, but the latter mixes a real timer with a separately advanced nowFn. It does not prove the new delayed-check race. `service-delivery-lifetime.test.js:52-63` supplies the actual lifecycle premise for T2. In-process send callback fidelity is a required T1 repair prerequisite. |
| Owner interaction 1,2,7,9 | Delivery lifetime owns local response permission; queue/ACK/response owners retain their own work; source invocation owns durable retry custody; only native afterCommit supplies the receipt. No transport ACK mints CDC completion. The generic preparation callback and exact private third handler argument avoid putting context into payload (`delivery-behaviors:50-67`; F3 registered wrapper/receiver). T1/T2/T4 are failures at those named boundaries, not invitations to add another controller. |
| Owner interaction 3-6,8,10 | Paired positive/negative proof is still required for queue-pressure release, original ACK/response budget, shutdown, write custody and native late completion. No fresh runtime proof or mutation run is claimed. Current `cdc-source-native-delivery` registry (`test/shards/impact-contracts.json:1344,2815`) names old delivery/response files and two witnesses but not both new transport helpers; root must update the same product interaction and primary witness selection before an acceptance candidate. This is an explicit pending integration gate, not a silent source-only closure. |
| Private input/brand checks | Supplied deliveryContext is validated by the canonical brand; supplied private lifetime must belong to this router (`delivery-lifetime:43-45,157-161,205-210`). Live remaining grants reject nonfinite/nonpositive values (`95-113`), while public timeout override/default compatibility remains `50-52`. Options callbacks are trusted local owner operations, not wire input. Envelope accessor/array/digest defenses belong to the separately reviewed canonical capture owner; transport JSON must not be represented as that validator. |

## Preserved correct boundaries and remaining proof

The candidate materially repairs the original post-ACK budget renewal and the
recoverable-before-send path which could return an ACK as the final result.
It also preserves the second connection-authority handler argument exactly,
passes the third private grant only for local calls, consumes the genuine
source context for raw local-handler/reconnect custody, and retains rejected
promise handlers from acquisition (`delivery-lifetime:168-198`,
`pending-response-ledger:382-385`). The current F3 receiver captures both
private parent operations (`cdc-delivery-budget:31-58`), and the current native
waiter consumes them before proposal/afterCommit (`message-group-cdc-committed-acceptance:36-52`).
These are source findings, not approval of those independently owned lanes.

No transport path writes CDC_DELIVERED, truncates native history, grants
publication/activation or changes the accepted payload/target domain. The
standalone query transport, PONG ledger and separate websocket-provider ledgers
remain outside this bounded change; the residual inbound-dispatch timer clear
at line 74 is for pendingPings, not a missed ACK/response clear site.

After T1-T4 correction, re-review exact bytes and add controlled-clock controls
for queued expiry, partial/full encoding debit, reconnect completion after
expiry, ACK near deadline, late response between enforcement checks, real
local handler custody, write callback/close custody, source cancellation,
shutdown/reinitialize and stale finalizers. Pair those with the actual native
handoff/provisional-route witnesses and later source-owned ACK. Preserve the
distinction between a direct native persistence witness and ordinary source
delivery admission. None of those measurements was run in this review.
