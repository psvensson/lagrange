# Rolling Restart Startup Active Gate Snapshot Coverage Operation Progress Reentry

Opened on May 4, 2026 after
[Rolling Restart Operation Transition Status Authority Review Followup](./done-20260504-rolling-restart-operation-transition-status-authority-review-followup.md)
executed and the representative path migrated before post-active over-target
trim could be evaluated.

## Current Evidence

1. Representative report:
   `test-output/reports/rolling-restart-after-status-authority-20260504-codex.report.json`
2. Result: failed, `0/1` passed after `131.7s`.
3. Terminal barrier:
   `Not all nodes reached ACTIVE state within 120000ms`.
4. Root cause class: `topology`.
5. Dominant reason: `publication_epoch_pending`.
6. Failure class: `publication_convergence_blocked`.
7. Publication epoch `3` is `PUBLISHED`.
8. Pending ACK count is `0`.
9. Top-level missing published count is `0`.
10. Active-gate selected snapshot coverage is `4/5`.
11. Selected snapshot published active count is `3/5`.
12. Selected missing published nodes:
    `11601fe0-72d6-5853-8590-ec2881853e72` and
    `8be8d30f-4499-5eed-865c-71b4d529a67a`.
13. Priority recovery invariants passed.
14. Dominant priority witness is `replica_operations-p1` with operation
    `e4add92f-0aac-450c-b085-0c6fb2dc4ae2`.
15. The dominant witness has latest workflow step `SENDING`, latest status
    `pending`, `transition_deferred`, `workflow_timeout`, wait mode
    `timeout_reconcile_due`, and next action
    `reconcile_stale_operation_progress`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under
topology workflow stabilization, failure simulations, and production
guarantees.

## In Scope

1. Reconcile why selected active-gate membership still sees snapshot coverage
   `4/5` and two selected missing published nodes while top-level publication
   convergence has no missing-published debt.
2. Trace `replica_operations-p1` operation `e4add92f-0aac-450c-b085-0c6fb2dc4ae2`
   through timeout reconciliation from `SENDING` under startup pressure.
3. Preserve the operation-transition status-authority fix while determining
   whether this blocker is snapshot publication evidence, operation workflow
   retry, or both.

## Out Of Scope

1. Post-active over-target trim until the representative path reaches that
   boundary again.
2. Broad matrix continuation before this five-node representative blocker
   closes or migrates.
3. Pro or Enterprise behavior.

## Static Drift Ledger

Preflight:

- [x] Relevant guardrails selected by boundary: literal ownership,
      decision-boundary audit, runtime grammar, focused owner tests, and diff
      whitespace.
- [x] File-scoped static baseline recorded before production edits for this
      package.
  - `node --check test/distributed/harness/publication-evidence-contract.js`:
    pass.
  - `node --check test/distributed/harness/__tests__/failure-bundle.test.js`:
    pass.
  - `node scripts/check-guideline-literals.js
    test/distributed/harness/publication-evidence-contract.js
    test/distributed/harness/__tests__/failure-bundle.test.js`: `0` new
    violations, `0` inherited baseline violations.
  - `node scripts/check-guideline-decision-boundaries.js
    test/distributed/harness/publication-evidence-contract.js`: `0`
    violations.
  - `node scripts/check-runtime-grammar-contracts.js
    test/distributed/harness/publication-evidence-contract.js`: `0`
    violations.
- [x] Additional classifier baseline recorded before touching
      `test/distributed/harness/failure-bundle-segment-4.js` after the
      representative rerun exposed stale closure-record classification.
  - `node --check test/distributed/harness/failure-bundle-segment-4.js`:
    pass.
  - `node scripts/check-guideline-literals.js
    test/distributed/harness/failure-bundle-segment-4.js`: `16` existing
    file-scoped violations.
  - `node scripts/check-guideline-decision-boundaries.js
    test/distributed/harness/failure-bundle-segment-4.js`: `1` existing
    file-scoped violation.
  - `node scripts/check-runtime-grammar-contracts.js
    test/distributed/harness/failure-bundle-segment-4.js`: `0`
    violations.

Closure:

- [x] Same guardrails rerun after implementation.
  - `node --check test/distributed/harness/publication-evidence-contract.js`:
    pass.
  - `node --check test/distributed/harness/__tests__/failure-bundle.test.js`:
    pass.
  - `node scripts/check-guideline-literals.js
    test/distributed/harness/publication-evidence-contract.js
    test/distributed/harness/__tests__/failure-bundle.test.js`: `0` new
    violations, `0` inherited baseline violations.
  - `node scripts/check-guideline-decision-boundaries.js
    test/distributed/harness/publication-evidence-contract.js`: `0`
    violations.
  - `node scripts/check-runtime-grammar-contracts.js
    test/distributed/harness/publication-evidence-contract.js`: `0`
    violations.
  - `node --check test/distributed/harness/failure-bundle-segment-4.js`:
    pass.
  - `node scripts/check-guideline-literals.js
    test/distributed/harness/failure-bundle-segment-4.js`: `16` existing
    file-scoped violations, unchanged from the recorded baseline.
  - `node scripts/check-guideline-decision-boundaries.js
    test/distributed/harness/failure-bundle-segment-4.js`: `1` existing
    file-scoped violation, unchanged from the recorded baseline.
  - `node scripts/check-runtime-grammar-contracts.js
    test/distributed/harness/publication-evidence-contract.js
    test/distributed/harness/failure-bundle-segment-4.js`: `0` violations.
- [x] No relevant guardrail count increased.
- [x] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation was introduced.
- [x] Any inherited out-of-scope violation has a linked follow-on package or
      recorded exclusion.

The `failure-bundle-segment-4.js` literal and decision-boundary counts were
pre-existing file-scope debt outside this package's narrow closure-record
change. The package did not increase either count.

## Residual Closure Inventory

- [x] Direct owner path:
      `test/distributed/harness/publication-evidence-contract.js` canonical
      publication evidence normalization.
- [x] Tail consumer:
      `test/distributed/harness/__tests__/failure-bundle.test.js` failure
      bundle presentation of embedded active-gate progress.
- [x] Status and reporting surfaces:
      top-level publication convergence, embedded active-gate `progress`, and
      embedded active-gate `bestProgress` now share one publication-membership
      outcome.
- [x] Classifier surface:
      closed priority-spread publication closure records no longer classify a
      startup active-gate snapshot-coverage timeout as
      `publication_convergence_blocked`.
- [x] Superseded stale vocabulary:
      stale `publication_epoch_pending` and
      `publication_missing_active_node=...` selected-snapshot debt is removed
      from active-gate progress when the publication gate has closed under the
      priority-spread closure witness.
- [x] Representative proof:
      `rolling-restart --fast-local` rerun completed and migrated to the
      startup rejoin seed-contact / snapshot-coverage boundary.

## Implementation Tasks

- [x] Add the smallest owner or playback fixture for the selected-snapshot
      `4/5` plus `replica_operations-p1` timeout shape.
- [x] Determine whether the selected snapshot is stale relative to canonical
      publication convergence, and remove or downgrade any stale override.
- [x] Determine whether `SENDING` timeout reconciliation should consume
      cache-visible progress or retry dispatch before the startup active gate
      times out.

The package fixture showed the prior terminal `publication_epoch_pending`
classification was stale presentation debt, not a new startup probe
membership failure. The remaining operation-progress witness is preserved as
the canonical blocker after publication membership is closed.

## Validation

1. `node --test --test-name-pattern "keeps startup active-gate snapshot coverage" test/distributed/harness/__tests__/failure-bundle.test.js`
   - passed.
2. `node --test --test-name-pattern "separates active-gate snapshot coverage" test/distributed/harness/__tests__/failure-bundle.test.js`
   - passed.
3. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`
   - passed, `66/66`.
4. Static guardrails for touched files passed as recorded in the closure
   ledger.
5. `node --test --test-name-pattern "classifies closed publication startup active-gate coverage" test/distributed/harness/__tests__/failure-bundle.test.js`
   - failed before the classifier fix with
     `publication_convergence_blocked`; passed after the fix.
6. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --output test-output/reports/rolling-restart-active-gate-membership-reentry-20260504-codex.report.json --verbose`
   - failed after `130.6s`, but the prior stale publication blocker did not
     recur.
7. Regenerated the representative failure bundle from that report and playback
   after the classifier fix:
   `test-output/reports/.playback/rolling-restart-active-gate-membership-reentry-20260504-codex/rolling-restart/failure-bundle.json`.
   - Failure class: `startup_recovery_blocked`.
   - Dominant reason: `BOOTSTRAP_PHASE_INCOMPLETE`.
   - Publication status: `PUBLISHED`.
   - Pending ACK count: `0`.
   - Missing published count: `0`.
   - Active-gate blockers: `inactive_nodes=2` and `snapshot_coverage=2/5`.
   - Active-gate selected missing published nodes: empty for both `progress`
     and `bestProgress`.
   - The terminal raw scenario message still reports two inactive nodes and a
     retryable seed-contact timeout for
     `8be8d30f-4499-5eed-865c-71b4d529a67a`.
8. `git diff --check`:
   passed.

## Migration

This package closed the stale publication-membership and stale
publication-classification presentation debt. The representative path migrated
to:

[Rolling Restart Startup Rejoin Seed Contact Snapshot Coverage](./done-20260504-rolling-restart-startup-rejoin-seed-contact-snapshot-coverage.md)

## Done When

1. [x] Startup active-gate evidence emits one canonical outcome for selected
   snapshot publication membership and priority operation progress.
2. [x] The representative path either reaches post-active convergence again or
   migrates to one newly named owner boundary.
