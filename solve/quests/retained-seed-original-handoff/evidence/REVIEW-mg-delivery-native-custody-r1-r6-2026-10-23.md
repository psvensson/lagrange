# Independent review: native raw-operation custody and cleanup notification

Reviewer: `subagent:/root/mg_delivery_design`. Date: 2026-10-23.

Verdict: **APPROVE for the exact isolated R1/R6 source correction**. No remaining
blocking defect was established in the bounded three-file delta. Approval is
source-only: no held native turn, timeout, failure notification, shutdown,
integration or lab witness was executed by this review. It is not approval of
the separately changing complete-vector R4 helper or the whole composed MG
implementation, and is not Quest landing/publication acceptance.

Only this review evidence is written. No production/test/metadata/Quest-log/ref,
commit, runtime or lab action was performed.

## Exact identity

Frozen bundle: `/tmp/mg-native-custody-r1-r6-20261023`.
Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Base: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.

| Artifact | SHA256 |
| --- | --- |
| Three-file manifest | `b12b52a4885a3dff2de1c9c867a13c43ced0650222ed4df4144c44da0077f046` |
| NOTES | `a9c1026b6ad0eeaf0d95f5f8076bdf75ddb9cfda3589d76051a5f2b1e6d69e70` |
| Finite custody patch | `77b1fb3752ad324cfe16eaa2800e87b97b942ad30d8d8d9bfb26ccd2ae27d126` |
| Static report | `202e810411d1840137f9d0d32839954ee499e2f601a6e0d43221fd3ac7cd0b2b` |
| Complexity comparison | `d056068753a58c74dece94ff59128c2beb46addb6d742dbdd9dc5ffbaf5266ba` |
| Original root R1 review | `b404fadb31060fad56944dbd4c05603f7fa8d0ecc70ff92193ef7a83d235ca7a` |
| Approved MG contract | `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383` |
| Approved design review | `2eb6a5a1243ee5efc72e0c5182e5f919fbc7d058c1404785bb3d4123ba3e597d` |

| Frozen source | SHA256 |
| --- | --- |
| `src/message-group/message-group-cdc-committed-acceptance.js` | `163a79709f1eb4f0a69818f4ba9884ab9d7561fddbad8de08d4ca317a72f1bd0` |
| `src/cdc/cdc-delivery-invocation.js` | `4abb2267aae8815c33b2aea453cceb41d83e480049e2e888dd7b7343c9de3774` |
| `src/partition/proposal-queue.js` | `46f83d0ae76d47fc382a19490014267c60e83509ce6a216e5af5115fa9f3bc3c` |

I checked all three frozen `after/` files against the manifest. The live files
also matched at the initial check. The native helper subsequently became a
separately authored R4 surface, so this review reads and approves its frozen
after-copy only; no later live bytes inherit this verdict. The invocation and
queue are the frozen correction. Before-copies and finite patch remain preserved.

## R1: retain the original native operation before the public race

The original source path is real: `proposeMessageGroupCommand` awaits the
operation port's proposal, while `routeAttempt` wraps that operation in
`withinProposalDeadline` (`message-group-proposal-routing.js:119-188`). The runtime
queues commands behind `group.tail` (`raft-rs-runtime-owner.js:966-988,1841-1851`).
An outer timed-out promise therefore cannot stand for actual native closure.

The revised `proposeCdcAndAwaitCommitted` acquires a raw operation through the
existing recipient ProposalQueue and then charges that same promise to the
genuine local parent context, before the operation's first microtask/port call
(`message-group-cdc-committed-acceptance.js:97-122`). Its body includes the real
proposal await and committed-response await. The public route can retire while
this raw operation remains open, but the same recipient slot and source/topology
child custody remain charged.

The acquisition order also handles a parent becoming invalid before that first
port call: the raw body rechecks the exact current waiter, native service
lifetime/port, creating deadline and parent grant. If parent charging refuses,
the scheduled raw body still observes the retired parent and cannot make a
native effect. A remote boundary carries no source brand; its recipient queue
nevertheless retains the same raw operation until actual closure.

The queue keeps one metadata record per existing entry with response-pending
state and an optional raw operation (`proposal-queue.js:114-174`). Retirement
settles the response once and clears its creating-clock timer, but only removes
the entry when raw custody is empty. While raw work is open, the key still
consumes the unchanged capacity and duplicate-vector reservation is refused.
Another routing attempt for the same live response joins the existing raw
promise; it cannot enqueue a second native copy. A subsequent attempt after
actual raw refusal may proceed only while the original response remains live.

Fulfillment and rejection use the same exact entry/custody/raw-promise identities
before removal. A stale closure cannot delete a successor. `currentWait` now
distinguishes response rights from a retained cleanup-only entry. Late
afterCommit cannot resurrect a retired response or mint an old caller's receipt.
The existing local lifetime fences still compare the service's operation port,
group and `cdcCommitLifetime`; open/close rotate/retire through the existing
consensus owner, while the queue itself is created once on service construction.

The change does not cancel a command already admitted to the native owner. Its
late append/commit may finish after caller expiry; that historical fact remains
different from the expired caller's answer. Retention ends only at the actual
raw promise's settlement. No new durable outcome, secondary registry, queue,
dispatcher, retry cadence or capacity was introduced.

## Generic ProposalQueue compatibility

I traced consumers of the queue and its proposal metadata. No external production
consumer reads `queue.proposals` directly; the typed release owner continues to
expose the original proposal-state value and log index. The new raw-custody path
is opt-in. Existing callers of resolve/reject/release still remove entries
immediately when they own no raw operation. `markProposal` continues to refuse
an already answered/released response.

No-callback reservation entries remain legal, and repeated response settlement
returns false rather than invoking another callback. Timer clearing now includes
zero-valued handles and stays on the queue's creating clock. The bounded
backpressure contract and its retry hint are unchanged. Exceptions thrown by
legacy response callbacks are not silently converted into new successful answers.

The historical queue at `1aea11baf6ba35a397547be54fa2621e674c1977` was inspected:
typed release records what proposal state the owner knew and prevents a released
write from being newly handed to consensus. This repair preserves that contract
while separately retaining already-entered raw work. The required regression
selection includes ordinary queue/capacity/size-invariant tests, not only CDC.

## R6: owned notification settlement, unchanged delivery disposition

Actual child closure still releases the active invocation slot exactly once.
`notifyCdcInvocationClosed` catches a synchronous `onClosed` failure and consumes
a returned rejection on the existing cleanup promise
(`cdc-delivery-invocation.js:24-46,184-190`). It cannot replace the already settled
delivery response or escape through the discarded child-settlement tail.

The terminal cleanup result explicitly reports a notification failure with its
stable code and original error. Logging is guarded; if reporting itself throws,
the terminal failure also retains `reportingError`. Error-message inspection is
guarded against a throwing accessor/coercion. Successful notification produces
the explicit closed/no-failure result. A notification promise may remain pending,
but actual resource closure does not wait to free the active slot; no native or
ACK fact is derived from this notification result.

The real source callback remains `resumeAfterCdcCleanup` and the existing source
retry scheduler. This repair neither invents a successful retry wake after a
failed scheduler notification nor creates another retry owner. The failure is
observable on cleanup and through the guarded error event. The actual source
pending-work tracker owns cleanup; it is not an unhandled rejection detached
from shutdown custody.

The cited native cleanup precedent `26700ebea5e4ade51a8ecb0b51dcd60f4467a1c9`
separates admitted work/close custody from outcome reporting. The existing
guarded wait-bound reporting test is relevant to preserving caller behavior
when an observation sink fails. These are source/history precedents, not runtime
proof for this revision.

## Remaining proof and exact composition gate

| Required paired witness | What must actually be observed |
| --- | --- |
| Real native queued turn held across response deadline | The durable operation entered the actual runtime queue; old caller UNKNOWN/no ACK, one hydrated operation, source/topology and recipient custody still occupied. |
| Source nudges and tenure reset while held | No second native copy or payload hydration through the occupied source slot; old closure cannot mutate/release a successor. |
| Same-entry retry before raw closure | The operation body runs once, both attempts join that same raw promise, and original deadline is not renewed. |
| Remote call without a source brand | Recipient key/capacity stays charged after response retirement, and duplicate/new-at-capacity admission is refused before immutable capture. |
| Expire parent/response before first port call | Zero port/proposal effects; reserved custody releases after the raw refusal settles. |
| Release held native turn, or reject it | Late history may finish but old caller cannot gain success/ACK; actual settlement frees capacity and a fresh bounded invocation can succeed. |
| Uncontended actual RF1 | Native afterCommit produces the canonical result; source ACK still requires its own committed ACK application. |
| Ordinary queue resolve/reject/release, typed state, no callback, clock replacement | Existing public behavior and creating-clock timer cleanup remain intact. |
| Throwing onClosed after child fulfillment/rejection and zero-child retirement | Original disposition survives, one closure, no detached rejection, explicit failure and successor admission. |
| Rejected async notification and throwing logger | Rejection is consumed; original notification error and reportingError remain inspectable without retaining a closed resource slot. |

The author static artifacts report syntax, scoped ESLint, whitespace and explicit
complexity-12 passing on all three paths, with zero before/after over-limit
findings. No ratchet changed. This review inspected those artifacts and source;
it ran no runtime or semantic mutation. An already-settled fake proposal, an
outer timeout before native-queue engagement, or a builder receipt would not
measure the R1 fix.

The original review's ownership, concurrency, failure-settlement, retry/timer,
admission and transport categories are addressed by the exact custody split
above. R2/R3/R5/R7 have a separate source review. Root R4 full-vector semantics
changes this native helper and therefore needs its own exact review, followed
by composed F1/root/F3 validation. No focused source approval closes S2/W7,
original-cohort classification, protected activation, durable transfer, composed
two-start, full Quest, corpus, publication or merge gates.
