# Bounded independent design verdict: reservation finality

Reviewer: `subagent:/root/prepare_recovery_u2`

Verdict: **APPROVE**, limited to the reservation-finality subunit described below.

Reviewed proposal: `/workspace/scratch/6d2a7b72384f/lagrange/solve/quests/wasm-creation-genesis/evidence/recovery-20261017/u1-correction-proposal.md`

Content binding: SHA-256 `90d98bb2bae217faaeff848200bc684ccfc20a9ac4c2c1a22fc8b759b8a61d34`, section **Exact reservation refusal belongs to the resource owner**, lines 11–46, and its reservation witnesses at lines 104–105 and 111–118.

The whole-proposal **REVISE** verdict remains in force for the inventory, canonical-state and retirement interactions. This approval does not cover those edits and does not approve any implementation or test result. No source edits, tests or lab jobs were performed for this review.

## Approved boundary and behavior

Every negative result of the public metadata-owner `reserveInstanceResource` interaction carries explicit `reservationRefusal: SEALED | UNRESOLVED`. Only the deterministic resource-state owner can produce SEALED from one of the proposal's monotone facts. The enclosing metadata interaction defaults every other negative result, including capture, encoding, read, submission and contention failures, to UNRESOLVED. No intent caller reconstructs finality from outcome names.

For REMOVE-time resolution, SEALED permits the existing exact PENDING-to-CANCELLED CAS and confirming journal reread. UNRESOLVED leaves PENDING, returns UNKNOWN with the original owner reason, and therefore remains REMOVE_HELD. ADMITTED still persists the exact token before physical retirement. A terminal journal observed independently keeps its existing terminal-with-row-state result. Corrupt journal identity is not normalized into resource uncertainty.

## Reasoning from the existing owners

- `INVALID_EXPECTED_STATE` can mean an occupied slot or a future expected ordinal, and `TARGET_ALREADY_OWNED` means another currently live slot owns that replica; neither is irrevocable (`src/control-plane/owners/service-instance-state.js:212–238`). Closing the blocker can permit the exact original request later (`:255–295`). The current caller's outcome list is therefore not a finality authority (`src/service/service-consensus-creation-intent.js:48–52,359–375`).
- A missing binding at a selection version no later than the monotone retained state version cannot later be reselected; historical selection retries return recorded results without restoring selected state (`service-instance-state.js:134–165,178–207`). A missing future binding has no such proof. The metadata layer expressly retains rows (`service-instance-metadata.js:160–167`).
- Below-current ordinals cannot return; a different immutable winner at the exact ordinal cannot become this request; and a retiring binding cannot admit a new reservation. Exact matching historical/current admission resolves before those refusals (`service-instance-state.js:212–226`).
- An unrepresentable next ordinal is a deterministic property of the exact request. Encoded-size exhaustion is a different failure and does not receive that proof (`service-instance-state.js:225–236`; `service-instance-metadata.js:55–60,84–95`).
- Unknown submissions and bounded CAS contention alone establish no permanent exclusion (`service-instance-metadata.js:169–205`). A subsequent authoritative state observation can supply its own monotone fact; the unknown acknowledgement cannot.
- The preserved result mapping matches recovery R2-A/R3-E (`RECOVERY-DESIGN-20261017.md:593–617,832–845`), and UNKNOWN already maps to the bound removal HELD decision (`src/node/runtime-service-bound-creation-route.js:49–56,397–405`).

## Required decisive oracles for this subunit

1. Use the real SQLite-backed resource owner for both temporary blockers. Suspend/delay an original request, let REMOVE resolve the same request while blocked, assert UNKNOWN/reason, REMOVE_HELD and an unchanged PENDING journal, then close the blocking resource and show that the exact original request can admit. Verify the returned token is persisted before retirement and no abandoned live slot remains.
2. Supply a valid future binding to the real owner before its selection exists: STALE_BINDING must carry UNRESOLVED and cannot cancel the original journal. Select that exact binding later and demonstrate later admission. Contrast with an irrevocably absent old binding whose version is no later than the owner's retained version: SEALED and positive cancellation.
3. Distinguish lower historical ordinal, same ordinal with a different operation, same operation with different immutable body, exact matching admission including CLOSED, and a retiring binding requiring a new reservation. Exact matching admission always wins over the fresh-reservation refusal rule.
4. Distinguish counter exhaustion from encoded-size failure; include capture/validation failure, unavailable read, UNKNOWN submission and exhausted definitive-zero contention. Every negative public result must have the explicit tag. An older/fake owner response with no SEALED proof must fail closed in the intent consumer.
5. Preserve positive cancellation, successful exact-token retention, concurrent terminal journal handling, and no fresh runtime policy on REMOVE-time resolution. Mutation of tag production or replacement by outcome-name inference must fail the real delayed/future-binding witnesses for their intended assertion.

These requirements make the finality correction a reviewable implementation subunit within the same unit-1 corrective round. Finality implementation may proceed under the parent’s authorization while the other proposal sections are revised and independently reviewed.
