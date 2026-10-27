# U2 notification opportunity contract: independent decision

Reviewer and lead: `subagent:/root`, 2026-10-18. Proposal author:
`subagent:/root/u1_finality`.

Verdict: **APPROVE the exact notification-opportunity amendment, design only.**
The reviewed proposal is `u2-progress-notification-contract-proposal-20261018.md`,
SHA256 `6e6b7e07f3c3f3da68a74f3631af41a049fa6775d9a93980b8c7cfe3d81a42aa`.
Its original DRAFT label is retained as history; this separate verdict is the
successor authority for the decisions named below. It releases no U2 source
or test implementation before independent approval of the complete corrected
U1. F1 source review alone does not satisfy that gate.

## Explicit choice and supersession

Under the owner's existing directive to continue unattended on the lead's
recommendations unless overruled (recorded in this Quest's earlier decision
entries), the lead selects **Choice B**, precisely N1-N8 of the reviewed
proposal. The reviewer accepts the loss of the inherited universal
K-completed-write confirmation claim. The current native/queue boundary cannot
prove that claim: a progress notification can follow a batch of many applied
entries, and an asynchronous authority call can still be running after any
number of subsequent notifications.

The accepted guarantee is that a current qualifying replica at modulo phase q
admits the next confirmation opportunity within `K - q` further qualifying
delivered `APPLIED_PROGRESS` notifications, at most K. Admission may merge
with one pending item. Actual confirmation additionally requires a live exact
context, fair scheduling, settling owner calls, current genesis coverage and
a real exact grant. This is no bound on completed writes, log positions,
completed confirmation, or elapsed time. User traffic alone does not imply a
fixed number of notifications. A group without sufficient notifications or an
explicit/formation trigger may remain unconfirmed indefinitely.

**The complete section 4 supersession table of the hash-bound proposal is
approved**, including its references to RECOVERY-DESIGN R3-A/R3-G, R4-A/R4-B,
R4-D/N16, R5-B/N19/N20, the U2 brief, prior owner plan, prior Choice B draft,
and inherited numeric interpretations in the design-vet records and
`log.ndjson` entry 43. Those historical files and their recorded results remain
unchanged. Their old write-bound interpretation is not future acceptance
authority. Earlier formation-only filtering is not reinstated. R3-A's
pre-genesis exception, R4-C's confirmation behavior, R5-A's record-only wake
rules, R5-B/N21 and all physical custody rules remain binding.

If a later owner decision requires a completed-write deadline, it needs a
separately reviewed counting plus scheduling/backpressure contract at the
proper owner. An applied-index payload alone would not establish that
deadline. Such runtime drain/propose work is outside this Quest's current
scope; it is neither implemented nor implicitly authorized by this decision.

## Independent source and arithmetic review

The reviewer read the complete proposal and C9 preparation, the relevant
native drain/announcement and port forwarding code, reconciliation/genesis/
publication owners, and the keyed queue's admission, merging, execution,
completion-waiter, discard and shutdown paths. The 37 original input bindings
were independently checked against `f5717e6f53a3ae18c2f470a507a180c3eca2cc17`
for byte length, SHA256 and Git blob identity. The manifest itself has SHA256
`fa486f79d3da9666461b72c03ee0cac60007a379890b73af664e17b20f9ecfc2`.
This establishes the proposal's source basis, not fresh execution evidence.

| Decision | Independent assessment and required discriminator |
| --- | --- |
| Exact qualifying predicate | Only a current unconfirmed context with this process's genesis already OBSERVED and last grant outcome exactly UNAVAILABLE is filtered. HELD followers and serving reopenings use the same rule. UNKNOWN-with-UNAVAILABLE reason and other refusals are not silently included. N-OUTCOMES is required. |
| Genesis progress | Before process-local OBSERVED, every progress notification is admitted. A retained PUBLISHED record is not a process observation latch. The single completing-INIT event control remains required. |
| Modulo phase | q starts at zero on entering the qualifying interval and survives repeated UNAVAILABLE results, including formation and explicit probes. Remote recovery cannot reset an unobserved phase. The arbitrary-phase and residual-credit controls are required. |
| Work and cost | N qualifying notifications from phase q produce exactly `floor((q + N) / K)` opportunities. Executed work can coalesce; carried and external work must be counted separately. Lost work must fail the opportunity oracle instead of passing a cheap-work assertion. Internal bounded CAS/read work is not redefined as one physical read. |
| Queue continuation | At most one active and one pending ordinary item per key; no threshold backlog or new timer. Hold an actual owner await across several thresholds and prove a pending successor executes after UNAVAILABLE settlement. Retryable-exception machinery supplies no new cadence under this amendment. |
| First retained confirmation | Set the process latch only after the real current publication succeeds; recheck lifetime after its await. Emit exactly one retained OBSERVED wake even if START waited or serving did not flip. Keep fresh-open waited/no-flip controls. |
| Already admitted native work | Unsubscribe does not erase pending work. A confirmed native-only successor must perform zero new genesis/grant work. An explicit START waiter mixed into it must still receive a proper current owner result. Generic key discard is rejected because it rejects legitimate waiters. |
| Confirmation versus visibility | An OBSERVED wake is a continuation request. The existing operation confirmation, endpoint, services projection and exact token PRESENT owners must actually complete before ACTIVE. No fabricated projection result is approved. |
| Lifetime and cleanup | Callback capture, post-await currentness, failed-unsubscribe custody and shutdown join compose with corrected U1. Queue bookkeeping deletion is not a physical join. |

All successor witnesses in proposal section 5 are required: P-R3-N,
P-R3c-N, P-R3f-N, P-R3g-N, retained P-R3e, N-COALESCE,
N-CONFIRM-PENDING, N-LIFETIME, N-UNITS, N-OUTCOMES and the complete existing
confirmation controls. N-UNITS must disclose real native batching; a synthetic
event count cannot certify a stronger write relationship. K remains a
positive finite safe integer selected and justified by its reconciliation
owner under N16 at the later implementation review.

## Review categories and remaining gates

Owner interaction and admission are covered by the exact permission predicate,
separate observation/confirmation owners and source-verified notification
boundary. Concurrency, recovery and transport are covered by q lifetime,
active/pending coalescing, retained first-wake behavior and post-await fences.
Harness fidelity and formation require the native batching and HELD follower
controls with explicit component limits. Retry and timer review finds no new
autonomous retry or time promise; quiet-group liveness costs are explicit.

This is independent contract/oracle review of the amendment, not category-
complete U2 implementation approval. The concrete original-opening pass-through
and late-projection verbs still need review against corrected U1 before the U2
test-only checkpoint. Preserve the old witnesses and every first result;
implement and measure superseding witnesses on distinct, bound trees. U2
execution and C9 remain pending on the deployed serialized Harnessd path.
