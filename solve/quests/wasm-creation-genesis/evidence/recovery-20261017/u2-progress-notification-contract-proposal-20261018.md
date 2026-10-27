---
documentClass: planning
---

# U2 progress contract: notification admission, with explicit supersessions

Status: **DRAFT FOR INDEPENDENT REVIEW. Preparation only.** This proposal has
not superseded the approved design and does not authorize U2 implementation.
Combined corrected U1 still requires independent approval first. No production
or test source was changed, no source tests were run, and no lab request was
submitted by this preparer for U2.

Author: `subagent:/root/u1_finality`, 2026-10-18. Read base:
`f5717e6f53a3ae18c2f470a507a180c3eca2cc17`; source tree
`97388f76ab4468da91b4a7eb9badc8b3c1804e62`; test tree
`4f34eaefa2bdccc83b3243a199f11091e2d148bb`.
Input bindings (`u2-preparation-source-bindings-20261018.json`) identify the
complete file bytes behind the source anchors below. This branch is separate
from the F1 source/test checkpoint. U1 corrections must be incorporated and
these seams rechecked before the U2 test-only checkpoint.

## 1. Recommendation and exact limit

Recommend **Choice B from the previous amendment draft**, made narrower and
precise: K bounds admission opportunities from qualifying, delivered
`APPLIED_PROGRESS` notifications on one live replica context. It does not bound
completed writes, committed positions, completion of the confirming probe, or
elapsed time. This is a substantive correction to approved acceptance wording,
not a rename of its existing write guarantee.

Within a stable qualifying interval, the next opportunity is admitted within
at most K further such notifications. An opportunity calls the existing keyed
queue; it can create pending work or merge with work already pending. Queue
settlement, a still-current lifetime, and an authoritative successful grant are
separate conditions for confirmation. Continued user traffic may produce fewer
than K notifications because a notification can cover a batch. No numerical
write or time bound follows from this mechanism.

This contract fits the current Quest scope: `quest.json`, constraint `scope`,
excludes runtime drain/propose edits. The existing native event and owner queue
can express the proposed admission contract without changing native ordering,
awaiting metadata in a native callback, adding a timer, or introducing another
permission owner. If the product requires confirmation completed before K more
user writes, Choice B is unacceptable for that requirement. A separate owned
counting and scheduling/backpressure contract would then need review in an
expanded scope. The present Quest cannot honestly certify that stronger claim.

The previous `u2-progress-bound-amendment-draft.md` correctly identified the
write/event discrepancy. Its Choice B was still ambiguous about admission
versus completion, and its phrase "immediately after a probe (credit zero)"
needs the phase qualification in section 3: an arbitrary probe does not reset
credit under this proposal.

## 2. Source facts supporting this correction

| Bound input / owner | Observation at the bound source | Consequence |
| --- | --- | --- |
| `src/raft/raft-rs-runtime-owner.js`, `finishReady`, `drainReady`, `announce`, `announceAppliedProgress` (committed-entry calls at 1154/1178; drain at 1196-1244; emit at 1298-1304) | The drain can apply arrays of committed entries and multiple Ready cycles before `announce`. The progress emitter compares its owned runtime generation/applied index and emits one event with no arguments. | One delivered notification need not represent one write or one log position. Its first observation after a runtime generation change is also an event; the consumer receives no count or generation payload. |
| `src/raft/raft-rs-operation-port.js`, `emit` (210-215), `subscribe` (356-367) | The port forwards the supplied arguments and stores the listener. It adds no position or write count. | WASM cannot recover a missing count from this API. Callback status reads or command parsing would invent a new observation boundary. |
| `src/wasm-service/wasm-creation-reconciliation.js`, `bind`, `request`, `reconcile`, `publish` | Native notifications enqueue one captured context under the replica key. START uses `enqueueAndWait` on the same key. Both execute the same genesis/publication continuation. | Notification receipt, queue admission, executed run, and completed authority observation are distinct events. |
| `src/workflow/owner-key-reconcile-queue.js`, `enqueue`, `drain`, `_startReconcile` | Pending reasons merge. A key already in flight can have a pending successor, but cannot execute that successor until the active run settles. Repeated enqueues can merge into that successor. | K threshold crossings are not K executed probes. An active grant can delay a pending confirming opportunity without a notification or time bound. |
| Same queue, `discard` and `shutdown` | Discard rejects pending completion waiters. Shutdown clears bookkeeping, including in-flight bookkeeping. Neither supplies the physical retirement join. | Confirmation cannot blindly discard the replica key, and U2 must keep the existing shutdown admission-close/join order agreed with corrected U1. |
| `src/wasm-service/wasm-creation-genesis.js`, `progressWasmCreationGenesis`, `observeMembership` | The current run checks the retained INIT receipt, exact founders, participation gate and applied coverage before `OBSERVED`. | A process that has not observed genesis must admit the completing progress notification without the K filter. Persisted PUBLISHED alone cannot initialize the process observation latch. |
| `src/wasm-service/wasm-creation-publication.js`, `resolveGrant`, `publishWasmCreation` | One grant-owner invocation may have the owner's bounded internal CAS work. An UNKNOWN result gets one additional resource resolution; a caught failure stays UNKNOWN. The publication helper writes local PUBLISHED and enables serving only after its currentness check and exact granted token. | "One grant attempt" means one owned publication attempt, not one SQL statement, one read, or one RPC. Only successful current publication may set the replica confirmation latch. |

For a structural counterexample, let a hypothetical K be 32 and let one native
drain apply 64 user-command entries before its final announcement. The existing
emitter can deliver one notification. A notification counter gains one credit;
it has not admitted a threshold probe despite more than K commands having
applied. This is an inference from the emitter/drain code, not a measured native
benchmark or a selected value of K.

An additive applied-index payload would not by itself repair the literal
completed-write guarantee. Log positions also cover non-user entries; replay
can advance observations; and a notification delivered after a large batch
cannot cause a probe to have finished inside that batch. Even a precise user
write count would still need scheduling semantics for the asynchronous probe.
Those are reasons to choose an honest notification-admission contract here,
not reasons to claim an unimplemented runtime improvement.

## 3. Proposed normative replacement: N1-N8

### N1. Unit, context and state

The reconciliation owner retains bounded, volatile state for the exact live
replica object, captured operation port and captured original creation:
whether this process has observed genesis, the last completed grant outcome,
whether this process has confirmed publication, and a modulo credit `q` in
`[0, K - 1]`. These states are named at their existing owner. None is restored
as confirmed merely because the local record says PUBLISHED.

K is a positive finite safe integer chosen by the reconciliation owner at
implementation, with the reason required by R4-D/N16. Rename the proposed
constant to `UNCONFIRMED_RECONFIRM_EVERY_PROGRESS_EVENTS`; its unit is qualifying
delivered notifications, explicitly defined here. There is no justified
numeric performance recommendation in this preparation. The later witness
must consume the selected owned constant and report it.

### N2. Qualifying predicate and genesis exception

A delivered `APPLIED_PROGRESS` notification qualifies for the K filter only
when the captured context is current, this process has already observed
genesis for it, publication has not been confirmed in this process, and the
last completed grant attempt has `outcome === UNAVAILABLE`. This applies
equally to a HELD follower and a replica serving on a retained local grant.

Before the first current genesis `OBSERVED`, every `APPLIED_PROGRESS` is
admitted to the existing queue. In particular, a retained START that answered
`APPLICATION_NOT_COVERED` must admit the one notification covering its original
INIT. Later temporary genesis refusal does not erase the fact that genesis was
already observed in this exact live process context.

The exact-outcome predicate does not include
`UNKNOWN {reason: UNAVAILABLE}`, storage failure, or sealed grant refusal.
Other last-grant outcomes keep their existing admission rule; this proposal
does not broaden R4-A/N19 into a new refusal-retirement policy. Formation
events retain their admitted role for an unconfirmed current context and are
not charged against K. They use the same queue.

### N3. Modulo phase and reset ownership

Entering the qualifying interval from a nonqualifying state initializes
`q = 0`. For each qualifying notification, increment modulo K; on the wrap to
zero, call the existing queue's enqueue operation with the native reason and
captured context. The synchronous callback does no journal/native status read,
grant, INIT, await, or payload retention.

Repeated UNAVAILABLE answers while the qualifying predicate stays true do not
reset `q`. A formation or explicit request that probes and again gets
UNAVAILABLE does not reset it either. A threshold wrap already leaves zero;
notifications received while its run is pending or in flight can accumulate
residual credit before that run finishes. Thus "the probe just finished" does
not prove zero phase.

Leaving the predicate because the last completed grant outcome changed, a
successful confirmation, or retirement of the exact context ends that
interval. A new qualifying interval starts at zero. A new process/context
does not inherit credit. No reset occurs because the remote owner returned:
return has not yet been observed by the reconciliation owner.

### N4. Admission opportunity and continuation

For any current qualifying context at credit q, the next opportunity is
admitted after `K - q` more qualifying notifications, and therefore after at
most K. The enqueue may merge with an already pending item. If a same-key run
is in flight, the admitted opportunity remains represented by a pending
successor until that run settles. Multiple thresholds may coalesce; do not
add a backlog of one catch-up probe per historical threshold.

When the current lifetime remains live, queued work is scheduled fairly, and
the relevant owner calls settle, that opportunity can execute. Confirmation
then requires current genesis coverage and a real successful exact grant.
Under those conditions a reachable owner can be re-observed without explicit
handler re-entry. There is no guarantee of completed confirmation within K
notifications, K committed/user writes, or a wall-clock interval. A hanging
owner call or closed/replaced context does not become successful by counting
notifications.

### N5. Cost statement with phase and carried work

In a stable qualifying interval starting at phase q, N qualifying notification
receipts create exactly `O = floor((q + N) / K)` threshold opportunities. Thus
`O <= ceil(N / K)`. This counts calls requesting or merging work, not completed
runs. Coalescing can reduce the number of native-driven executed continuations
attributable to these opportunities.

A cost witness that starts with a drained queue and q zero, with no formation,
explicit request, handler re-entry or other trigger, may assert at most
`floor(N / K)` native-driven runs. It must separately observe the number of
opportunities and runs so a lost opportunity cannot pass as cheap behavior.

For an arbitrary measurement window, include work already admitted before its
start and external admissions. A conservative accounting bound for runs that
can perform owner work in the window is `R <= O + E + C`, where E counts
non-threshold admissions during the window and C counts carried active/pending
items at its start (at most one active and one pending item for this key in
the ordinary typed-result path). Attribute mixed-reason work once. A completed
pre-window read or an in-flight grant is not fresh threshold work. Retryable
exception machinery is not a new cadence authorized by this proposal.

Each executed continuation makes the existing owned genesis/publication
attempt; it need not execute a grant if genesis is HELD. Its internal reads
and bounded owner CAS retries keep their own contracts. Do not describe this
as exactly one physical genesis read, one journal read, or one SQL request per
K notifications. The callback performs zero such reads. Exact UNAVAILABLE
grant wakes cause zero immediate handler re-entries and zero deferred
`wakePending` re-entries, including HELD and in-flight handler memos (R5-A).

### N6. Confirmation, pending work and the one wake

The first successful current publication run for a retained reopen writes
the replica's process confirmation state only after exact GRANTED publication.
Immediately after awaiting the publication helper, its caller rechecks the
captured lifetime before changing a latch, retiring listeners, or waking the
operation owner. A manager's operation-authority check does not set this local
process latch.

That first retained confirming run emits exactly one
`CREATION_GENESIS_OBSERVED` wake even when START waited for the run or serving
did not flip. It retires the native subscriptions. Repeated explicit requests
must not emit another first-confirmation wake. Fresh-open waited/no-flip wake
suppression remains as specified by its existing controls.

**Pending-work requirement derived from the current queue:** unsubscribe only
prevents new callbacks. A native-only successor may already be queued behind
the confirming run. At dequeue, confirmed native-only work must do no new
genesis/grant I/O and emit no wake. A pending item with an explicit START
reason/waiter must still complete through the proper current owner answer.
Do not call `queue.discard(replicaId)` to implement the no-work case: it rejects
legitimate waiters sharing that key. A private, named no-work decision in the
reconciliation owner can meet this requirement without changing the generic
queue; its exact answer shape belongs to the subsequent implementation review.
This distinction is necessary for "zero native probe work once confirmed" to
hold when an event arrives during the confirming await.

The OBSERVED wake requests operation-owner continuation. It does not itself
assert ACTIVE or PRESENT. The operation confirmation and existing runtime
projection/endpoint owners must actually complete before the corresponding
outcome. The late-projection seam in `u2-owner-plan.md` remains required.

### N7. Quiet groups and outer triggers

With known q zero, no carried/pending run, no formation event or explicit
request, and fewer than K qualifying notifications, no threshold opportunity
is admitted. With arbitrary q the remaining threshold is `K - q`. At
`q = K - 1`, a single next notification is sufficient; owner return does not
reset that credit. User-write count alone cannot prove either schedule.

Without the remaining notifications or another admitted trigger, the system
can stay unconfirmed indefinitely. Existing formation events and explicit
re-entry can request the same owned probe. B9 coordinator dispatch is the
production activation Quest's obligation; this draft does not claim that
production trigger is wired or supplies a time bound. REMOVE is a retirement
continuation, not a promise of confirmation/ACTIVE. Restart re-observes
retained state and follows the same permission rules, not an unconditional
successful grant.

A fully HELD group with no qualifying traffic may similarly remain HELD
until an outer trigger. In the partially serving case, the durable local
grant and resource custody preserve the approved degraded serving permission;
HELD followers remain non-serving. Stale projection and an ADD parked HELD
are explicit liveness costs, not completed activation.

### N8. Safety and implementation gate remain separate

No native callback becomes authority. Current object/port/origin checks,
original journal identity, exact admission/publication tokens, local seven-field
identity, and the corrected U1 physical-retirement and inventory lifetime
contracts continue to govern. Subscription failure retains cleanup custody.
Shutdown closes callback admission and joins existing keyed work before
physical transfer; clearing queue bookkeeping is not that join.

Independent approval of this exact amendment and combined corrected U1 are
both prerequisites to U2 production/test implementation. Approval of a prior
design version or F1 alone does not satisfy those gates.

The pending corrected U1 deferred-CREATE hydration uses the same
`readRetainedCreation` owner to recover an original journal identity before
the bound resume. U2's opening-claim pass-through must compose with that
owner, including any validated PENDING intent with `token: null`; such an
intent is not an admission/opening grant. No second identity cache is added.
The original claim is read/validated through the journal owner before local
offline classification; a mutable null-to-claimed opening is not added to
the stable captured creation whose equality identifies a live replica.

## 4. Exact supersession list for approval

References below are anchored to the input hashes. They name acceptance
sentences to replace if this proposal is approved. Historical text, test
results and vet reports remain unchanged; append the approved successor and
name it in the eventual implementation/landing record.

| Existing text | Proposed disposition |
| --- | --- |
| `RECOVERY-DESIGN-20261017.md`, R3-A rule 2, 786-791: WRITES constant, one read/attempt per K committed writes, zero once confirmed | Replace the surviving unit/cost/continuation text with N1 and N3-N6. Use a notification constant, opportunity count and pending-native guard. The HELD expansion already made by R4-A remains. |
| Same, R3-G P-R3, 859-861: owner observed within K committed writes | Replace with N4 and witness P-R3-N below: opportunity within remaining eligible notifications; actual confirmation after owned work settles; one retained wake and real projection. No completed-write/notification/time limit. |
| Same, R3-G P-R3c, 862-864: N writes imply ceil(N/K) runs and read counts | Replace with N5 and P-R3c-N; quantify N notifications, modulo q, opportunity versus run count, external/carried work and owned internal I/O. Keep no UNAVAILABLE handler re-entry. |
| Same, R4-A rationale, 898-902: followers imply a genesis/grant per committed user write | Correct the causal unit to delivered native progress; many entries can share one event. HELD follower concern remains. |
| Same, R4-A rule 1, 904-910 | Preserve exact OBSERVED/last-UNAVAILABLE/current-context scope and other-outcome policy. Replace unspecified counting/reset semantics with N1-N3. |
| Same, R4-A rule 2, 911-919, sentence that return is observed by the K-th run | Replace the timing implication with N4/N6. Preserve the exact-detail RECORDED behavior for every memo and all other custody-table behavior. |
| Same, R4-A rule 3/P-R3f, 920-924: N writes/ceil(N/K) and within K writes on followers | Replace with N2/N4/N5 and P-R3f-N. Count each replica's delivered notifications and credit separately; include actual later grant/wake/projection as a separate completion assertion. |
| Same, R4-B, 928-936, including P-R3g and the characterization of REMOVE/restart as confirmation | Replace with N7 and P-R3g-N. A no-opportunity witness starts at known q zero with no carried or external work; general phase is K-q. Distinguish retirement/restart from successful confirmation. |
| Same, R4-D/N16, 949-950, together with the constant name inherited from R3-A | Keep value ownership and the requirement for a reason; use the notification-unit name in N1. No numeric value is selected by this draft. |
| Same, R5-B/N19, 985-988: per-committed-write wording for other refused HELD followers | Clarify only the frequency description as existing admitted native notifications, which can batch entries. Preserve stage-1 ownership and do not widen the UNAVAILABLE filter or retire sealed-refusal subscriptions here. |
| Same, R5-B/N20, 989-991: fully HELD quiet group and listed confirmations | Apply N7's known-phase/trigger/completion distinctions. Preserve the requirement for an outer continuation in a group with no progress traffic. |
| `evidence/recovery-20261017/briefs/implementer-recovery-unit2.md`, E (36-47), witness paragraph (64-80), title's bounded-window interpretation | Replace WRITES unit and copied P-R3/P-R3c/P-R3f/P-R3g acceptance with N1-N7 and the successor witness table. Preserve all unconfirmed-opening, confirmation, one-wake, C9 and U1-dependency clauses. |
| `evidence/recovery-20261017/u2-owner-plan.md`, native-event owner-map row; P-R3/P-R3c/P-R3f/P-R3g and batched-native-progress witness rows (including the ambiguous "writes/progress units" row) | Resolve the pending amendment reference to this exact approved successor if approved. Use notifications/opportunities/phase, not interchangeable units. N-UNITS below is disclosure of the chosen event unit, not proof of a stronger position/write bound. Other seam and scope recommendations remain proposals. |
| `evidence/recovery-20261017/u2-progress-bound-amendment-draft.md`, Choice B and quiet-group precision | Select the N1-N7 version explicitly if approved. Replace its possible completion interpretation and arbitrary-probe-zero assumption; Choice A remains a documented unimplemented alternative, not an authorized task. |

Earlier R2-D (660-680) and R2-H's original P-R3c (728-731) already had their
formation-only/no-progress filter superseded by R3-A/R3-G. Do not resurrect
that filter. Their premise that every committed write emits an event is
withdrawn by section 2; R2-D's distinct local-grant and operation-confirmation
owners remain binding. R3-A rule 1/P-R3e, R4-C/P-R3h, R5-A's append-only and
`wakePending` rules, and R5-B/N21 are not weakened.

Historical audit trail, not implementation authority for the old numeric
claim: design-vet R2's B7 text and P-R3/P-R3c recommendations (144-150,
215-216, 233-236), R3's R34/R35/N16 and P-R3 text (53-67, 107-108, 191,
209-217, 230), R4's closure rationale (48), R5's inherited design approval,
and `log.ndjson` entry 43 remain the original records. The eventual new
approval must explicitly say its numeric acceptance supersedes their inherited
write interpretation; none of those old approvals certifies this amendment.
`TEST-PLAN.md` has no K bound to rewrite. The handover's discrepancy notice
remains accurate until a new approval is recorded.

## 5. Successor witness specifications, no implementation

All rows below are future oracle requirements, not tests authored or run in
this branch. They require an independently approved test-only checkpoint and
the root-coordinated Harnessd request after corrected U1 approval. Existing
P6a and other committed assertions must be censused and superseded by appending
as the sealed record requires; no edit-to-green of historical witnesses.

| ID | Required schedule and discriminator |
| --- | --- |
| P-R3-N | Real retained local-PUBLISHED serving reopen under exact metadata UNAVAILABLE; observe genesis in the new process, then establish q zero and a drained queue. Restore the real owner; K-1 qualifying notifications admit no threshold, the K-th admits one opportunity without explicit handler re-entry. After declared queue/owner settlement, exact grant confirmation produces one OBSERVED wake and real endpoint/services projection before ACTIVE. The native-notification count is emitted beside any separately measured writes. Removing the threshold trigger must starve the opportunity. |
| P-R3c-N | At known q zero, owner down and no external/carried work, N notifications yield floor(N/K) opportunities and no more attributable runs. Grant-owner internal calls are separately observed; no callback journal/native read and no handler re-entry. Removing the filter exceeds the event bound. At arbitrary q, assert floor((q+N)/K); do not assume every probe resets credit. |
| P-R3f-N | Two local-ADMITTED HELD followers and one locally PUBLISHED unconfirmed leader; real founder formation/genesis, exact UNAVAILABLE. Observe per-replica credits and delivered events. Apply the N5 bounds independently, with no GRANT_HELD re-entry in HELD or in-flight memos. Restore the owner and drive each remaining notification threshold; after real grants/projectors settle, each gets one wake and all three ACTIVE. Serving-only filtering/recording mutations must fail. |
| P-R3g-N | Owner returns at known q zero, no pending/in-flight work, formation or other trigger; fewer than K qualifying notifications leave no threshold and remain unconfirmed. An explicit owned request then confirms/projects. Separate q=K-1 control: one notification admits a probe. A no-event fully HELD group stays HELD until the declared trigger. |
| P-R3e retained | START before the retained original INIT is applied/covered; only the completing native notification is delivered. It must be admitted despite fewer than K events. Filter-before-OBSERVED mutation must fail. |
| N-COALESCE | Hold a real owned grant await, then deliver multiple threshold crossings. They produce at most one pending successor, with residual q preserved; no concurrent same-key run and no catch-up burst. Release the await with UNAVAILABLE, then show the retained successor executes. Count opportunities separately so silently dropped work is detected. |
| N-CONFIRM-PENDING | Hold a confirming grant await while native work becomes pending. Release it with real exact GRANTED. First retained confirmation wakes once; already queued native-only work executes no new genesis/grant I/O. Repeat with explicit START mixed into the pending item: its waiter resolves through the proper current result, without a second first-confirmation wake or a generic discard rejection. |
| N-LIFETIME | Stop/replace the exact replica in the post-publication-await gap. No old latch mutation/wake/registry effect. Failed unsubscribe retains its cleanup handle; joined shutdown includes admitted work. Combine with corrected U1 lifetime witnesses. |
| N-UNITS | Independently observe real batched native application/notification delivery; disclose the relationship instead of asserting 1:1. A deterministic owner/port structural control can establish event forwarding but cannot stand in for native batching evidence. Report generation-first and non-user-entry cases without interpreting them as a user-write count. No runtime counter/status read is added to the subscription callback. |
| N-OUTCOMES | Exact UNAVAILABLE receives the filter; UNKNOWN-with-UNAVAILABLE reason and a sealed grant refusal retain their existing behavior. This guards the unchanged R4-A predicate and N19 ownership. |
| Existing confirmation controls | Retained no-flip/waited first success wakes once; fresh waited/no-flip behavior stays as before. A manager-only authority read does not confirm the replica latch. Confirm-time UNAVAILABLE for every serving result, including PUBLISHED_UNPROJECTED, remains PUBLISHED_UNCONFIRMED/HELD. Late CONFIRMED cannot publish ACTIVE before the actual existing projector and endpoint owner complete. |

## 6. Decisions the independent approval must name

The reviewer must accept or reject the explicit loss of the universal
K-completed-write claim, and approve the notification **opportunity** bound,
phase/reset rules, cost accounting, queued-native suppression and all named
supersessions together. K's eventual numeric choice remains N16's owned
implementation decision. This review does not pre-approve a fabricated
projection result or an opening claim written before local permission; the
two seams in the prior owner plan still require concrete review against the
corrected U1 candidate. C9's distinct preparation is in
[u2-c9-process-recovery-design-gaps-20261018.md](u2-c9-process-recovery-design-gaps-20261018.md).
