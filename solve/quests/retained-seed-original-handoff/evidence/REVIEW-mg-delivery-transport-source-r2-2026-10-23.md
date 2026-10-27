# Independent review: MG delivery transport source, revision 2

Reviewer: `subagent:/root/retained_effects_tests`.
Verdict: **APPROVE for the exact transport source and bounded T4 design
correction below; runtime and composed acceptance remain UNPROVED.**

This review resolves T1-T4 from the first source review. It does not approve the
reviewer's own F3 or native-custody changes, the concurrently changing root
delivery owners, or the complete work package. No production/test/metadata
file was edited and no runtime, lab, commit or push was run for this review.

## Exact reviewed material

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Base HEAD: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.

| Artifact | SHA256 |
| --- | --- |
| `/tmp/mg-delivery-transport-r2-20261023/manifest.json` | `fafe0b3e24b141c5ed3f14753548c143a696592a738f7f7a4a51177e23b663d8` |
| `transport-r2.patch` in that directory | `4000d92e88d076bfb13486d6787d254e1df042128eb069abb160d9d2c7ed5bd1` |
| `dossier.md` in that directory | `6e6969932f5c479722695f77fd1818321ef278bf682fc0a515ee5798ab5a8858` |
| Governing `CONTRACT-mg-source-occurrence-delivery-2026-10-23.md` | `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383` |
| Prior `REVIEW-mg-delivery-transport-source-r1-2026-10-23.md` | `f96b6e5769b8fa5892964a77d8ecef5ba4dfec5140ffd0e5e69a6a85bd2d403f` |

All twelve live transport files and their preserved `after/` copies match the
manifest. All available `before/` files match its round-2 input hashes. The six
unchanged files retain their prior reviewed dispositions. In particular this
review covers the new encoder and changes in delivery-lifetime, ack-delivery,
pending-response-ledger, connection-authority and shared-vocabulary, composed
with delivery-behaviors, outbound-delivery-registry, delivery-pressure-routing,
delivery-delegation, reconnect-behaviors and stats-shutdown. Source anchors below
use these exact files under `src/transport/` unless a different path is given.

The installed dependency is **ws 8.21.0**, independently read from its package
metadata. These installed-source hashes match the author's inventory:

| `node_modules/ws/lib/` file | SHA256 |
| --- | --- |
| `websocket.js` | `48fdb0f54c1f8ce580d3cfa2908fe7d96fe18f06f9d82306950441cb09b5db26` |
| `sender.js` | `d0791d30c3defd44dcabbddb879a901c757993fea2c00a7ffea01d53b23b4b77` |
| `permessage-deflate.js` | `02c31796f0132a335d4efe7b7adcebadbb69543a1ce65ae04aaccc3530e27ab9` |
| `limiter.js` | `e0469d4b83f6ba764b15f80e1766b75c136fbff68f048f4c050f0b1c7f065f69` |

## T1: actual write closure remains charged

**Resolved in source.** `message-router-ack-delivery.js:52-169` acquires a
separate write completion before send and consumes its rejection immediately.
ACK and write have independent, idempotent finalizers. The returned raw
operation waits for both using `Promise.allSettled`; ACK refusal, public
deadline, and socket CLOSE are no longer substitutes for write completion.

The relevant composition is literal: outbound `process` releases its captured
queue's in-flight charge only after the returned `deliverFn` settles
(`outbound-delivery-registry:581-618`). `runDeliveryOperation` charges its raw
promise to the genuine parent before starting the operation; its public abort
race does not resolve that raw promise (`delivery-lifetime:177-211`). Expiry of
a queued item removes only that exact pending item; a dequeued raw child is not
released by its old abort listener (`outbound-delivery-registry:12-53,594-614`).

The ws source supports the selected lower-owner boundary: `websocket.js:440-485`
passes the callback through; `sender.js:346-415` can retain a send behind another
send; `:498-527` can retain it through compression; `:551-574` passes completion
to the actual socket write, and `:585-603` reports queued failures. The zlib
limiter can still hold a closure when a close notification arrives
(`permessage-deflate.js:322-330`; `limiter.js:26-50`). Thus merely waiting for
CLOSE would remain wrong. This review claims operation closure, not immediate
collection of every library heap object.

Both orders now preserve the invariant: an early write callback leaves ACK
pending; an early ACK leaves the write charged. A late callback cannot settle a
new pending message because `finishWrite` is per send and ACK cleanup deletes
only its captured pending entry (`ack-delivery:57-63,95-106,148-150`). A send
exception after entering ws retains unresolved write custody until a real
callback; a faulty lower socket that never calls back remains explicit
unclosed custody. Public refusal is still bounded. No timer, CLOSED flag or
new queue is used to manufacture cleanup.

The real in-process shim now models the same acquisition distinction:
`shared-vocabulary:254-291` calls completion after the queued peer handoff or
closed-peer refusal, not at enqueue. Its `finally` separates application
listener failure from completed handoff. Runtime controls for callback order,
errors and the real compression/close path remain required.

## T2: shutdown cannot revive an old local invocation

**Resolved in source.** `connection-authority:112-145` reuses its existing
private shutdown generation, represented by one AbortController. Invalidation
rotates the generation before notifying old observers. The new observation
exposes only currentness and a signal; it does not grant socket, membership or
CDC authority. Existing connection-delivery argument 2 still uses that owner.

The router lifetime captures the generation before initialization/queue work,
listens for its retirement, and checks it at every remaining-time observation
(`delivery-lifetime:45-46,93-121,147-164`). Normal shutdown invalidates it
synchronously (`stats-shutdown:167-168`). Clearing `isShuttingDown` on a later
initialize cannot undo the recorded refusal or restore generation equality.
The private local argument 3 remains bound to this lifetime through handler
completion (`delivery-behaviors:50-79`); only raw closure disposes its listeners.

This is the same owner boundary established by historical commit
`d9e87b2961993121d75df11d3a177d380ad790df`. The unchanged real
`test/transport/service-delivery-lifetime.test.js:52-63` supplies the
shutdown/reinitialize premise for argument 2. A new paired witness must hold
argument 3 and a local CDC child across that lifecycle, prove the old effect
gate refuses, and separately prove a new delivery succeeds. No such runtime
result is inferred here.

## T3: late classification reports the actual settlement winner

**Resolved in source.** `pending-response-ledger:355-383` has one enforcing
`acceptResponse` operation. It returns the result of the exact entry's
single-winner `finish`. `settlePendingResponse:452-455` returns that boolean;
`resolveServiceResponseDisposition:205-215` uses it rather than a predictive
precheck followed by unconditional SETTLED.

If a currentness check synchronously retires the waiter, the old finish has
already lost and classification consumes its retirement marker. If a standalone
budget expires with its timer delayed, the still-current entry records TIMEOUT,
refuses its promise and returns false. A within-grant application error remains
a matched response. Timer cleanup uses the captured clock, while arm, abort and
cancel retain exact entry identity (`:74-80,393-471`). No late response supplies
CDC acceptance or clears source debt.

The required control must assert both the promise's refusal and
`late_after_timeout`, with delayed timer delivery at the enforcing boundary.
Returning true after `acceptResponse` refuses must kill that control. Merely
waiting for the old real-timer fixture's timeout is insufficient.

## T4: full encoding is debited before the finite scalar handoff

**Approved bounded design and source correction.** The local
`deliveryDurationField` option names the already existing transient numeric
payload member. It is not itself serialized. Actual callers are the topology
durable sender (`src/topology/cdc-group-propagation-durable-delivery.js:51-59`)
and F3 (`src/message-group/message-group-forwarding-owner-native-delivery-methods.js:162-170`).
They retain the original event vector and supply the existing private preparer.

`message-router-delivery-encoding.js:59-70` serializes the complete header/body
and converts the complete frame to UTF-8 once, leaving only a structurally
located fixed numeric slot. It does not search event text for a marker.
`:86-91` runs the currentness/preparation callback again after this work,
rejects any non-scalar wrapper change, and samples the minimum current grant.
`:92-102` writes the scalar and closing braces, checks expiry, and returns a
view ending before private padding. `ack-delivery:140-150` checks again and
sends that view as a **text** frame. No payload/fanout cap or second encoding
loop is introduced.

The original finite counterexample is repaired: a 1000 ms grant with 900 ms
spent in full body serialization/conversion reaches the stamp with at most
100 ms, not the original 1000 ms. Whole-grant exhaustion sends nothing.
The scalar is validated as a positive finite primitive; the 32-byte workspace
is a representation bound, not a source-event limit. Unicode body bytes and
embedded apparent markers cannot alter its structural offset.

The accepted cut is the final grant observation at encoder line 91. Fixed-size
number/framing work and currentness checks still occur afterward. This is not
an atomic clock-read-and-send guarantee: preemption can consume positive wall
time even in that finite section. The subsequent checks forbid a wholly spent
dispatch, but do not promise to subtract an unknowable scheduling pause from
an already stamped scalar. Post-handoff ws compression/socket work has actual
write custody; unknown transit does not become a foreign absolute deadline.
These precise limitations are part of this approval. The original body-sized
pre-stamp gap is not excused as network transit, and no zero-overhead or
synchronized-cancellation claim is accepted.

The encoder pins its scalar/own-key/comparison/buffer operations
(`delivery-encoding:14-24`) and rejects non-data wrapper properties through the
existing record predicate before reading values. This is an encoder consuming
the actual owners' captured immutable CDC data, not a new general recursive
hostile-input validator. In particular `canonical-json-data.js:250-270` does
not independently authenticate array descriptors before indexed reads; callers
remain responsible for the established capture contract. Generic proxy or
arbitrary mutable descendant safety must not be inferred from the dossier's
short serializer description. The current two call sites use captured event
vectors; upstream capture and its separate review remain required gates.

## Category-complete disposition and required proof

| Category | Source disposition and remaining paired witness |
| --- | --- |
| Admission/gating | One creating-clock grant begins before initialize and queue (`delivery-behaviors:143-153`; `delivery-lifetime:45-58`). Rechecks occur after initialize, queue, reconnect, encoding and fulfillment. Parent time can shorten but cannot renew it (`delivery-lifetime:98-120`). Counterfeit supplied contexts refuse through `assertCdcDeliveryInvocation`; absent context is omitted. Exercise default timeout, valid shorter override, foreign cancellation, own timeout and shutdown as distinct outcomes. No budget was raised. |
| Recovery/replay | Synchronous duplicate live message IDs refuse; original response identity is retained (`pending-response-ledger:337-343`; `delivery-behaviors:288-304`). Old timer/cancel/write finalizers cannot remove a successor. T2 permanently fences a pre-shutdown local grant. No durable outcome journal, recovered acceptance or new Raft object exists here. Exercise old response followed by a fresh real delivery. |
| Owner interaction | Transport owns response permission and raw transport closure; the source owns durable debt/retry, and native afterCommit owns completion. ACK never answers that native question. Argument 2 connection authority and private argument 3 remain distinct (`delivery-behaviors:50-69`; actual shared registration at `src/bootstrap/shared/message-group-transport-handler.js:26-30`, inbound propagation at `message-group-service-inbound-ingress-runtime-methods.js:114-249`). Final composition must use independently reviewed source/F3/native owners. |
| Harness fidelity | No runtime was executed. ws callback behavior above is installed-source evidence. Real shim, lifecycle and controlled-clock tests must reach the semantic boundary first. `message-router-quarantine-liveness-guard.test.js:48` has a callback-less send stub; that models an unclosed write now and cannot prove cleanup. The old late-response fixture mixes timer and independently advanced clock; preserve that finding rather than relaxing expiry. |
| Transport/delivery | Plain ACK keeps the original SERVICE_RESPONSE waiter (`delivery-behaviors:428-461`); inline legacy results/noHandler are preserved. Results are normalized without inventing CDC completion (`pending-response-ledger:503-519`). No-handler/no-connection public outcomes remain bounded. T1 callback hold and T3 false-SETTLED controls must assert actual ownership and disposition, not only elapsed time. |
| Concurrency/serialization | Existing synchronous admission/priority/source limits remain (`outbound-registry:360-579`); raw completion controls release and checks captured queue identity (`:581-618`). Repeated expired callers cannot free an admitted raw child. Test a held real write across source retirement/nudges, then one real callback and a succeeding successor. Capacity must remain charged during the hold. |
| Formation circularity | This lane adds no metadata/SQL/readiness/native-consensus dependency. Missing route/connection still uses the existing reconnect owner (`reconnect-behaviors:440-512`) under the same grant. It does not claim that formation, provisional delivery or later metadata hydration succeeds. Native S1/S2/W7 remains a separate composed witness. |
| Retry loops | Reconnect/backoff/retry-after owners and limits remain unchanged. The awaited connection is followed by a fresh remaining grant before send (`reconnect-behaviors:465-510`); the original response waiter survives a successful recovery attempt (`delivery-behaviors:390-396`). Test queue plus reconnect plus ACK plus response consuming one budget. No timeout or ambiguous late answer authorizes a new durable ACK or a detached retry tail. |
| Sweep/timer | Actual remaining time is checked independently of timer delivery (`delivery-lifetime:93-121`; `pending-response-ledger:362-383`; encoder `:91-99`). Timer set/clear uses the captured creating clock, handles a zero timer ID, and old closures act only on their entry. There is no new periodic sweep or raft-role action. Test delayed callbacks, clock replacement and stale finalizers; do not equate a timer firing with actual child closure. |

Additional T4 controls must inspect actual encoded/received duration after
partial encoding consumption, forbid send after full exhaustion, retain the
same event/stamp and nested Unicode data, reject changed non-scalar preparer
output, preserve text-frame semantics, and prove the private slot adds no wire
padding at the existing payload boundary. Restore a stale pre-encoding scalar
as the semantic mutant; an import failure or timeout before dispatch is not a
valid kill. Restore ACK-only raw completion, mutable shutdown flag, and
predictive SETTLED separately for the T1-T3 controls.

I read the frozen static reports: all twelve syntax checks, normal scoped
ESLint and tracked whitespace passed; Madge reports 97 dependency files,
no cycles and no skipped imports; the before/after debt report has the same
16 existing complexity/cognitive findings. Those are authored static results,
not tests I reran and not a claim that the predecessor passed. Root retains
impact-contract registration, normal guards, exact-source preservation and
locked-lab responsibility. Approval here is neither a green native delivery
run nor classification/startup, protected activation, durable transfer,
two-start, Quest landing, publication or merge acceptance.
