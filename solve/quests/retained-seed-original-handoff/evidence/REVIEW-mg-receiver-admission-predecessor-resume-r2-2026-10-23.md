# Independent test/design review: C1 receiver admission, resumed R2

Reviewer: `subagent:/root/composition_review_r2`. Date: 2026-10-23.

Verdict: **APPROVE the exact test-only witness for predecessor measurement**,
conditional on canonical metadata and an independently reviewed exact-SHA lab
packet. The proposed bounded owner consolidation is suitable to implement
after a measured predecessor failure at the named semantic assertions. This
review does not claim that the test ran, that C1 is repaired, or that the
production candidate is accepted.

## Exact identity

Repository: `/workspace/scratch/0c0362d1530e/lagrange`.
Branch: `work/mg-delivery-resume-r2-20261023`.
Base HEAD: `1e2fcc2da391ab72883132a22fbfbde39b2313f7`.
Author: `subagent:/root/receiver_admission_r2`.

| File | SHA256 at review |
| --- | --- |
| New `test/message-group/message-group-cdc-receiver-admission.test.js` | `f4192d3d2510278d258a9c2e085d3c237daa508af2e8e191ef45fef87f8e48e8` |
| Existing `test/message-group/message-group-native-custody-fixture.js` | `2806d3980b7b4b0392c79e2924984fb23e26147c5c27a3ed2e5d7a9409ff3012` |
| `src/message-group/message-group-cdc-committed-acceptance.js` | `7bb0595056b206384a9128773b53291ddeef11b66c6b7921b6ce78f9837fb5ae` |
| `src/message-group/message-group-service-cdc-propagation-runtime-methods.js` | `35d0dd7f0df64009fdd8050aa068f70d991e4dce0b06a5fd11ce575da20cf2f7` |
| `src/message-group/message-group-service-cdc-replication-runtime-methods.js` | `8f1fece571068e8207b66c6afb0397ce39f22016467ba0f7f542d6b67dbd39e4` |
| `src/partition/proposal-queue.js` | `46f83d0ae76d47fc382a19490014267c60e83509ce6a216e5af5115fa9f3bc3c` |

These are new R2 bytes and an independent review. Earlier lost-workspace test
hashes or approvals are not transferred. The production files in this table
remain uncorrected at this review; their hashes identify the observed defect.

## Observed defect and existing owner

`handleDurableLatencyCdcMessage` currently deep-captures input before queue
admission, then `applyDurableLatencyCdcDecision` separately chooses local apply,
defer, or direct forwarding. The direct forwarding arm never enters
`reserveCdcWait`. This contradicts the superseding F2 admission/custody contract
and F1 finite-response rule in
`CONTRACT-mg-source-occurrence-delivery-2026-10-23.md`.

The existing `applyCDCBatch` entry already checks forwarding options and terminal
mode before using `applyDurableCdcBatch`. Its reservation is synchronous and
precedes the immutable capture/digest. The existing `ProposalQueue` distinguishes
responsePending from rawOperation: retiring a response removes the queue entry
only when actual raw work has also closed. The local native proposal path
already uses `ownOperation`. These existing owners are the correction boundary;
no alternate capacity, queue, clock grant or receipt grammar is needed.

## Four witness cases and nonvacuity

| Case | Actual engagement before the named failure cut |
| --- | --- |
| Public single at capacity | RF3 is formed through the real native adapters. The leader's actual queue has capacity one and is filled by `applyCDCBatch`; a real native entry is persisted while entry-bearing APPEND envelopes are held. Commit/applied indexes remain below that entry. Public `receiveMessage` with a nested Symbol must refuse BACKPRESSURE before deep capture. |
| Public batch at capacity | Same actual occupied-owner premise through the public batch entry. The occupied exact queue object and native history remain unchanged by refused input. |
| Public follower at capacity | A direct admitted follower batch traverses the actual router and actual leader native path. Only its already-fulfilled native terminal response is held. The follower's queue is full and the public next input must cause zero additional forwards/native entries. |
| Public follower expiry | The public request carries 100 ms remaining. Its real terminal response reaches the hold after leader commit/application. Advancing only the follower's creating clock to expiry must settle UNKNOWN while retaining the same exact queue entry, with responsePending=false and size one. A second public invocation must be backpressured; releasing the actual held operation must free admission for a fresh valid call. |

The first two cases include free-capacity controls using the same nested Symbol:
the real deep-capture guard must reject INVALID and release its reservation.
The next valid input must then produce a canonical native receipt whose actual
log index/term, complete event fields, commit/applied indexes and cache body
match the real recipient. The capacity refusal assertion is reached after
these positive controls, so a blanket invalid-input refusal cannot pass it.

The forwarding hold wraps the real router call and waits only after its actual
answer arrives. Raft envelopes still go through the fixture's real native
schedule. No queue method/result, native role, readiness, commit result or
application is manufactured. The held response's address, target group and
NATIVE_COMMIT mode are checked, as are its actual native history/application.

The follower-capacity predecessor may wrongly commit the second input before
the first response is released. Its post-release check therefore validates the
first receipt against historical native data without requiring that earlier
body to remain the current cache row. The initial held-response assertion has
already proved its actual cache application. A fresh accepted input later
checks the final current body. This avoids an incidental cache-order failure
before `C1_PUBLIC_FOLLOWER_CAPACITY_PREVENTS_SECOND_FORWARD`.

The expiry case snapshots settlement/custody before release and checks that
late raw closure cannot replace the earlier answer or refusal. The 100-ms
recipient advance is below configured native election minimum 150 ms; it
changes no synthetic role. All held packets/promises are released in `finally`
before fixture shutdown. The fixture owns shutdown and its temporary databases.

## Bounded consolidation design disposition

After the predecessor is measured, remove the receiver's duplicate durable
ingress selection and route its incoming vector through `applyCDCBatch`.
Keep public response decoration and the existing received-duration grant at
the receiver boundary. Deep capture must remain after the existing queue's
reservation, including on public follower input.

The canonical DEFER decision currently enforced by the receiver must be moved
into the existing captured durable delivery owner before provisional, native
or forwarding effects. Existing terminal-group/current-native-leader/readiness
checks, terminal-event validation and canonical full-vector acceptance stay in
their current owners. Ordinary CDC normalization and digest translation remain
under the already-admitted MG normalization owner.

Charge an actual forwarding operation through the same `ProposalQueue.ownOperation`
seam used for local native work. `proposeCDCCommand` already accepts its local
propose callback; its existing forward callback is the narrow place to expose
the corresponding raw forwarding ownership. Preserve the parent invocation's
raw-child ownership as well. Race the public forwarding wait against the
existing finite waiter completion while letting the actual raw promise retain
the queue slot until its real finalizer closes.

Do not wrap the whole delivery operation in `ownOperation`: the local path
already owns a nested raw operation, so an outer wrapper would join the wrong
promise and can deadlock. Do not introduce a second timer, replacement grant,
detached retry, duplicate semantic queue, new cap or copied CDC validator.
Concrete corrected source remains subject to separate exact-diff review.

## Category-complete disposition

| Category | Evidence and bounded disposition |
| --- | --- |
| Scope / authority | Four RF3 recipient witnesses address public MG admission and custody only. Source occurrences are test inputs. No source SQL/ledger/ACK, whole topology, native membership replacement or Quest closure is claimed. |
| Ownership / interaction | Actual public receiver, applyCDCBatch, bounded ProposalQueue, router and native receipt owners are exercised. The design removes duplicate receiver routing and extends the existing callback seam; canonical ingress and receipt predicates remain authoritative. |
| Admission / gating | Real queue capacity one is configured through its existing field and filled by actual native or forwarded work. A nested invalid value distinguishes admission-before-capture; free/valid controls exclude vacuity. Exact occupied-entry identity is retained. No enqueue/backpressure stub supplies the answer. |
| Concurrency / freshness | Native quorum and forwarded response are held at actual asynchronous boundaries. The expiry snapshot precedes release. Exact queue identity and responsePending distinguish caller retirement from cleanup. Fresh admission is required only after actual raw closure. |
| Transport / delivery | A fulfilled native response is held above the actual router, so its original native work is real. Terminal mode, target group/address and native receipt correspondence are checked. The test does not substitute ACK-only success. The ordinary missing-handler/network-error contract is unchanged and remains covered separately. |
| Retry / deadline | Existing request duration is 100 ms and the recipient's creating clock alone advances. UNKNOWN is an explicit retained refusal. New input during raw custody is refused without another forward; release enables a later invocation. No retry budget/cadence or capacity is enlarged. |
| Custody / finalizers | Capacity is held by a real native append or actual forwarded result. Public response expiry must not remove the exact raw-owned entry. Late closure cannot overwrite the response; cleanup releases holds before shutdown. Native source-history retention beyond this recipient boundary is not claimed. |
| Canonical validation / fields | Test events carry occurrence, partition, ordinal/index, full data and valid HLC timestamp fields. Receipt validation uses the canonical predicate and also matches actual native history/index/term and cache application. Nested Symbol is a capture tripwire, not a forged receipt or role. |
| Harness fidelity | The predecessor must reach the four C1 semantic cuts, not fail on import, setup, wrong cache-order assertion, or timeout before engagement. The real fixture forms RF3 and asserts leader/follower roles; capacity setup requires held native envelopes or a real native reply. Queue methods are not stubbed. |
| Recovery / replay | Fresh post-close operation is a liveness control for this queue. Retained source classification, protected activation, W7 composition, W9 payload/fanout, durable transfer and two-start remain outside this test. |
| Registration / evidence custody | Root owns canonical metadata, test-only predecessor commit, exact source-tree comparison, reviewed locked-lab request and full TAP/stderr collection. This static approval is not measured red and does not authorize treating setup failures as the contract counterexample. |

## Checks and next evidence

Independent `node --check` and ordinary scoped ESLint both exited zero on the
frozen test. I read its entire fixture and production boundaries and checked
the listed hashes. No runtime or production edit was performed. Only this
review record was written.

Required next evidence is the test-only predecessor at the exact recorded
commit, on the sanctioned locked lab runner with canonical `test:file` and
retry-once zero. Preserve all TAP/stderr and distinguish each engagement/setup
result from the intended semantic failure. Source repair and corrected green
proof follow that measurement; they are not implied by this design review.

## Pre-measurement addendum: approval withdrawn for follower setup correction

Before any measured predecessor result, the author traced
`registerCdcCommittedAcceptance` on every real native replica. The addressed
follower can apply the replicated command and resolve its semantic waiter while
the forwarded leader response is still held. With the fixture's original
all-peer native schedule, the asserted occupied follower queue is therefore
not assured. The failure could occur at setup rather than either intended
follower C1 semantic assertion.

**The approval above for hash `f4192d3d2510278d258a9c2e085d3c237daa508af2e8e191ef45fef87f8e48e8`
is withdrawn for predecessor measurement.** Root and author were notified
immediately. This review retains the finding and earlier reasoning as history;
it is not a usable predecessor-test approval.

The proposed test-only correction holds actual native replication to the
addressed follower while leader plus the third RF3 voter still commit. It must
assert the held destination/envelopes and the follower's unapplied native
frontier, preserving an actual queue slot while the real leader terminal answer
is held. Forward response release precedes held native packet replay, so local
afterCommit cannot masquerade as forwarding raw closure. No native role or
commit outcome may be manufactured. A fresh exact-hash review is required for
the corrected test and any changed fixture before measurement. The bounded
production-owner design has not been implemented by this reviewer.
