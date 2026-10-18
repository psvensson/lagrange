# U1 exact-origin hydration: independent addendum review

Reviewer: `subagent:/root`, 2026-10-18. Author:
`subagent:/root/u1_inventory_lifecycle`.

Verdict: **APPROVE the complete deferred-hydration contract and oracles** in
`u1-inventory-v3-hydration-addendum.md`, SHA256
`b0d9146f17b22b0e2bda3d4c27981f4a3a10a65812c3a050c87dfb6298e326ee`.
This extends the separately approved v3 and D2/D3 addendum. It is not source
execution or corrected-U1 implementation approval.

## Why the additional seam is needed

Ordinary CREATE admission initially carries an operation/entity/replica
envelope, while an inventory plan already has its validated original journal
identity. A synchronous wake cannot safely match arbitrary full binding/token
content using only an operation ID. The first proposal to read the journal
before acknowledgment was not accepted. The reviewed correction instead
installs the existing gate and acknowledges promptly, then hydrates exact
identity inside the already-deferred route before bound continuation.

The reviewer read `readRetainedCreation`/`retainedRowAnswer`, the complete
CREATE resume/definition fallback, the handler admission path and the existing
wake scheduling owner. In particular, INTENT_NOT_FOUND does not cause the
bound route to manufacture an intent: the existing bound-class behavior is
BOUND_ROUTE_REQUIRED. Only the existing generic class takes generic create.
The addendum preserves that distinction.

## Reviewed decisions

| Concern | Approved rule and discriminator |
| --- | --- |
| Request and owner identity | Capture the coordinator envelope at admission; hydrated operation, service, canonical replica, node and any supplied full body must match. Mismatch has zero bound effects. A PENDING row supplies only its already-validated immutable intent with token:null. |
| Admission and delivery | Gate installation and acknowledgment precede the awaited read. One otherwise-unknown attempt performs at most one hydration and one ordinary bound resume. Known inventory origins skip hydration. No new reservation, policy, preparation or file read occurs during hydration. |
| Current lifetime | After the read, both live handler and exact installed entry must still hold before any retained mutation, outcome or bound resume. Suspended-read shutdown and replacement-entry witnesses discriminate this. |
| Unavailable or missing journal | There is no blind bound resume after failed hydration. Existing bound refusal/deferral and generic fallback semantics remain explicit. The original journal stays owed and the gate releases; restoring the reader and redelivering the exact request supplies the retry witness. |
| Terminal or invalid journal | A terminal observation has no physical continuation and can settle only its matching plan. A corrupt/conflicting identity produces the existing typed failure and cannot replace a different current memo. |
| Wakes before and after hydration | Before a valid original is retained, answer NO_LOCAL_OPERATION with no pending bit. The queued explicit continuation freshly observes progress. After hydration, exact binding/token-or-immutable-request matching applies, with no token copied from a wake. Actual first-start delivery provides the positive witness. |
| Existing suppression and bounds | R5 unavailable-grant suppression and record-only RESOURCE_CLOSED remain intact. One existing gate entry retains the identity; no new listener, queue, timer, observer array or durable store is created. |

The immediate-after-first-ACK synthetic wake expectation is explicitly
superseded: it becomes the negative control, and the positive witness delivers
the real exact wake after journal hydration from physical startup. This is a
reviewed delivery-contract amendment, not an unexplained loosening of an old
assertion. If hydration remains unavailable, progress depends on the already
named explicit retry/restart trigger; the contract makes no new timer or native
wake guarantee for that state.

## Category completeness and implementation gate

Owner interaction, admission, concurrency, replay and transport categories are
covered by the complete outcome and lifetime tables above. Harness fidelity
requires the real journal for hydration and the real first-start delivery seam,
including the unavailable-then-restored reader control. Formation has no new
authority or manufactured origin. Retry and timer categories retain the
existing bounded queue and explicit triggers with no autonomous retry.

All four binary-oracle groups in the addendum are required in the corrected
candidate. Preserve the old fixture and the explicit supersession in evidence.
The existing complete U1 v3 review and original 55-item implementation checklist
still apply to the integrated source; this additional approval does not close
F2–F6 or release U2 implementation.
