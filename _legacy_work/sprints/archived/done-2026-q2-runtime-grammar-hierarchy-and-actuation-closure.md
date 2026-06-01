# Runtime Grammar Hierarchy And Actuation Closure Sprint (AGPL)

## Goal

Replace the current flatter runtime meaning system with one explicit hierarchy:

1. `intent`
2. `authority`
3. `actuation`
4. `conditions`
5. `decision`
6. `presentation`

The pilot slice is priority recovery under load.

The sprint goal is not a broad rewrite. The goal is one vertical slice where
the system can discuss blocked progress without mixing authority, action,
pressure, and reporting semantics together.

## Status

Closed on 2026-04-23. The amendment fixed the terminal follow-up
actuation/decision contradiction, closed the retained harness dominant-reason
flattening on the pilot slice, and the deferred `node-join-under-load` rerun
now points at a narrower non-grammar runtime defect on the rebalancer
operation-scheduling path.

## Why This Sprint Exists

Recent runtime work improved the system materially:

1. progress, handoff, and timeout vocabulary is more explicit
2. admission and publication authority are more coherent
3. reporting now names the actual blocker path more often

But the latest `node-join-under-load` rerun shows the next boundary clearly:

1. the harness still reports publication pending and priority recovery blocked
2. unresolved partitions can still collapse to
   `eligible_but_no_operation_created`
3. the same artifacts also show heavy control-plane pressure and timeout
   evidence

That means the system now has richer observation than actuation grammar.

The sprint exists to close that gap by making actuation first-class inside one
strict grammar hierarchy.

## Relationship To Current Sprint

This sprint is a successor architecture lane to:

1. [Coherence Closure Before Harness Sprint](./done-2026-q2-remaining-runtime-hotspot-reduction.md)

It does not replace the remaining narrow runtime bug packages in that sprint.
It provides the hierarchy and actuation structure needed so those fixes stop
appearing as tactical patches.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## Pilot Slice

The pilot slice for this sprint is:

1. priority recovery under load
2. publication/admission convergence on that path
3. workflow/coordinator actuation for that path
4. admin/harness/reporting consumers of that path

## Out Of Scope

1. A repo-wide grammar rewrite in one sprint
2. New product capability or scope expansion
3. Broad transport redesign beyond the touched control-plane pressure seam
4. Another round of harness-driven discovery before the pilot slice is
   structurally cleaner

## Completed Packages

1. [Runtime grammar hierarchy contract and priority-recovery inventory](../../packages/archived/done-20260422-runtime-grammar-hierarchy-contract-and-priority-recovery-inventory.md)
2. [Priority-recovery actuation contract and owner-path normalization](../../packages/archived/done-20260422-priority-recovery-actuation-contract-and-owner-path-normalization.md)
3. [Control-plane action pressure and attempt-outcome normalization](../../packages/archived/done-20260422-control-plane-action-pressure-and-attempt-outcome-normalization.md)
4. [Priority-recovery decision recomposition over the runtime grammar hierarchy](../../packages/archived/done-20260422-priority-recovery-decision-recomposition-over-the-runtime-grammar-hierarchy.md)
5. [Runtime-grammar presentation consumer cutover](../../packages/archived/done-20260422-runtime-grammar-presentation-consumer-cutover.md)
6. [Runtime-grammar overlap deletion and proof hardening](../../packages/archived/done-20260422-runtime-grammar-overlap-deletion-and-proof-hardening.md)

## Completion Confirmation

1. [Runtime-grammar pilot harness confirmation](../../packages/archived/done-20260422-runtime-grammar-pilot-harness-confirmation.md)

## Amendment 2026-04-23

Review of the landed sprint slice and the retained `node-join-under-load`
playback artifacts found one remaining contract contradiction on the touched
pilot path:

1. a terminal prior operation can still leave spread unresolved and require a
   new recovery operation
2. the shared decision layer already says `nextRequiredAction =
   create_recovery_operation`
3. the actuation layer still reports `completed` for that same partition
4. harness dominant-reason shaping can still compress pressure-shaped
   persistence outcomes back into a generic stalled scheduling label

That means the sprint is reopened as an amendment on the same pilot slice.
The amendment stays within the original sprint scope:
priority recovery under load,
workflow/coordinator actuation,
and admin/harness/reporting consumers of that path.

## Amendment Packages

1. [Priority-recovery terminal follow-up actuation consistency closure](../../packages/done-20260423-priority-recovery-terminal-followup-actuation-consistency-closure.md)
2. [Priority-recovery harness progress-summary pressure dominant-reason closure](../../packages/done-20260423-priority-recovery-harness-progress-summary-pressure-dominant-reason-closure.md)
3. [Runtime-grammar pilot harness confirmation](../../packages/archived/done-20260422-runtime-grammar-pilot-harness-confirmation.md)

## Amendment Execution Order

1. Fix the actuation/decision contradiction for terminal follow-up partitions on
   the shared priority-recovery snapshot path.
2. Cut harness dominant-reason and dominant-witness shaping over to the shared
   actuation contract where pressure or retryability materially changes the
   blocker story.
3. Re-run `node-join-under-load` only after the amendment implementation
   packages are complete.

## Contract Target

The sprint target is one vertical stack of meaning:

1. `intent` answers what should become true
2. `authority` answers who may count toward that intent
3. `actuation` answers what action exists or must exist
4. `conditions` answer what is observed
5. `decision` answers what the canonical current meaning is
6. `presentation` answers how humans are told that story

## Execution Order

1. Freeze the hierarchy contract and map the current pilot slice into it.
2. Add the missing actuation contract on the existing workflow/coordinator
   owner path.
3. Normalize pressure, timeout, and attempt-outcome evidence as conditions and
   actuation inputs.
4. Recompose the decision layer over
   `intent + authority + actuation + conditions`.
5. Cut reporting consumers over to the hierarchy.
6. Delete overlapping grammar on the touched slice.
7. Re-run the harness only after the vertical slice is coherent and the
   implementation packages are complete.

## Simplification Rules

1. Do not add another peer grammar beside the hierarchy.
2. Do not let presentation invent decision meaning.
3. Do not let conditions become top-level semantics directly.
4. Do not let publication authority stand in for actuation closure.
5. Reuse existing owner paths whenever possible.
6. Delete touched overlap before claiming the slice is done.

## Validation

1. Focused unit tests for the actuation owner path
2. Focused snapshot composition tests on the pilot slice
3. Focused admin/harness consumer tests on the pilot slice
4. `npm run test:metrics`
5. Deferred named harness rerun after the implementation packages are complete

## Exit Check

1. The pilot slice has one explicit actuation contract.
2. Pressure and timeout evidence are subordinate conditions and actuation
   inputs, not competing top-level meanings.
3. `PriorityRecoveryProgressContract` is clearly derived from the hierarchy.
4. Admin and harness surfaces summarize the hierarchy instead of reconstructing
   local meaning.
5. The next harness rerun tests a narrower owner/runtime defect instead of
   another grammar hole.
6. No touched partition may require a new recovery action while the shared
   actuation contract reports `completed` or `no_action_needed`.
