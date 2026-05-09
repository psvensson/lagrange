# Testing Guidelines

## Document Role

This document governs stable validation policy for all code changes.

Use this file for:

- bug-fix testing expectations
- owner-path regression policy
- test execution discipline
- validation rules for package-driven work

Do not use it for exact local script names or temporary scenario ladders.

## Package-Driven Validation

All non-trivial implementation work should have validation owned by its active
work package.

Rules:

1. The active work package defines the required validation surface.
2. Tests added during the change match the package concern.
3. A package is not renamed to `done-...` until its required validation passes.
4. If validation reveals a second concern, split it instead of silently
   widening the package.
5. If a package changes a shared contract, validation must prove the owner path
   and the direct consumers of that contract.
6. A package is not validation-complete while tail-consumer proof is missing.

## Static Guardrail Policy

Every non-trivial package should prove that it did not increase architecture
drift while fixing behavior.

Choose guardrails by boundary:

1. Decision-boundary audits for readiness, admission, lifecycle, retry, status,
   phase, outcome, or reason-code logic.
2. Literal/scalar audits for material runtime edits.
3. Dependency and cycle checks for extraction or broad refactor packages.
4. Complexity and file-size ratchets for large owner files.

If a broad guard already fails, run the narrowest file-scoped or boundary-scoped
form that covers the touched files and record the inherited status before the
change. Rerun the same guard after implementation.

Green behavior tests do not override a failed owner-path guard.

## Test-First Bug Fixes

Bug fixes should be preceded by a failing test or replayable probe that
captures the bug.

Required shape:

1. Reproduce the failure.
2. Confirm the test fails for the current code.
3. Implement the minimal package-scoped fix.
4. Confirm the test passes.
5. Run adjacent owner-path and guardrail proof.

If a failing test is impossible or uneconomical, record the reason in the
package and use the narrowest replayable proof available.

## Scenario-Driven Validation

When a package exists because a scenario or integration failure exposed a
blocker, validation must show what the original scenario does next.

Rules:

1. Keep one named reference scenario or blocker probe.
2. After targeted proof is green, rerun that scenario or probe.
3. If the scenario still fails, record whether the dominant blocker is the same
   or has migrated.
4. If blocker migration occurs, update the active package or split a follow-on
   package in the same work cycle.
5. Different counts, ids, timestamps, or presentation shapes do not prove
   migration by themselves.

## Runner Stability

When aggregate test runs fail with unrelated worker crashes, resource pressure,
or no-test startup failures, treat the problem as shared runner-boundary debt
until proven otherwise.

Prefer shared runner or budget fixes before editing individual suites.
