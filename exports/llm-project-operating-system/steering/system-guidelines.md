# System Guidelines

## Document Role

This document governs stable repo-wide implementation rules.

Use it for:

- ownership rules
- implementation-slice discipline
- single-path execution rules
- cache and communication discipline
- idempotency and resource lifetime rules
- mandatory implementation workflow rules

Do not use it for:

- current concrete owner maps
- workstream-local test commands
- style-only rules
- roadmap scope decisions

## Mandatory Work Intake

All non-trivial implementation work should follow the target repository's
active workflow.

Rules:

1. Human ideas are captured in the target repository's active planning surface.
2. Broad or scope-changing ideas sharpen `roadmap.md` before active
   implementation starts.
3. In-scope bounded work is executed from a recorded implementation slice.
4. Implementation slices are one executable concern each.
5. Status must be explicit in the active workflow state.
6. Internal planning and execution material stays separate from user-facing or
   operator-facing `docs/`.
7. Historical legacy tracker material under `_legacy_work/` is advisory only.
   It never replaces validation, review, sequencing, focused commits, or
   closure proof.

## Package Closure

Closure is filename-first and proof-first.

Rules:

1. Close completed work only when live proof is true.
2. Mark dormant work inactive in the active workflow state.
3. Link displaced work to the superseding slice.
4. A completed package slice ends in one focused commit and push.
5. The commit includes only slice-owned changes and allowed status or handoff
   updates.
6. If slice-owned and unrelated changes cannot be separated safely, stop for
   human direction instead of committing a mixed slice.

## Deep-Dive Review Before Closure

Every implementation slice should end with a review of the affected area before
it is closed.

Affected area means:

1. Production files touched by the package.
2. Direct owner collaborators of those files.
3. Decision, lifecycle, ingress, dissemination, persistence, or external
   boundary surfaces that those files participate in.

Look for:

1. Owner bypasses and shadow state.
2. Duplicate logic or parallel paths.
3. Fallback behavior and bag-of-`if` decision boundaries.
4. `null` or `undefined` domain-state contracts.
5. Unowned resource lifetime.
6. Missing diagnostics.
7. Mutations that cross ownership boundaries.

If the deep dive finds an in-scope concrete mistake or guideline violation, the
slice is not done until it is fixed or explicitly split.

## Shared Boundary Contract

When a package adds or reshapes a shared boundary, the package must declare:

1. Semantic owner.
2. Canonical contract shape or vocabulary.
3. Evidence inputs.
4. Allowed consumers.
5. Prohibited reinterpretations.
6. Primary diagnostics and proof surfaces.

If the concern has several views, state which view is operational authority,
which is diagnostics-only, and which is owner-internal retained state.

## Failure Migration

When work is driven by a failing integration, scenario, load test, or incident,
do not treat local green tests as full closure.

Rules:

1. Name the current dominant blocker.
2. After focused proof is green, rerun the original scenario or narrowest
   representative blocker probe.
3. If the failure moved, record whether the semantic owner, boundary, or next
   action changed.
4. Do not open a new package only because timestamps, ids, counts, or
   presentation changed.
5. Open or activate a new package only when normalized evidence shows a new
   owner boundary or materially different next action.

## Progress Grammar

Lifecycle-style boundaries should use explicit progress grammar.

Recommended states:

1. `ready`
2. `blocked`
3. `deferred`
4. `retryable`
5. `terminal`
6. `unknown`

Each state should have canonical reasons and allowed consumers. Do not let
callers reinterpret empty collections, missing fields, or timeouts as progress.

## Scalar And State Generation Contract

Do not write inline domain/runtime scalars.

Rules:

1. Shared domain value: import the canonical owner value.
2. File-private value: define one top-level named constant.
3. Test-private value: define one suite-local named constant.
4. Raw external input: normalize it at the boundary.
5. `null` and `undefined` do not encode domain state.
6. Use explicit named variants for absence, unknown, deferred, and terminal
   states.

## Semantic Decision Boundaries

Do not implement semantic decisions as piles of independent `if` statements.

When several signals determine one outcome:

1. Collect evidence.
2. Normalize one snapshot.
3. Use one explicit state model or decision table.
4. Emit one canonical outcome and reasons.

Small local guards are allowed. Branch piles around readiness, admission,
retryability, phase, lifecycle, permission, quota, payment, or ownership are
not.

## Duplication And Existing Owners

Before creating a new helper, cache, snapshot, mode, or output shape:

1. Search for the existing owner.
2. If it exists, use it.
3. If it exists but needs change, modify it.
4. If it is missing, define the owner and consumer contract first.

Do not create a second implementation path because the first path is hard to
use.
