# Rolling Restart Operation Transition Status Authority Review Followup

Closed on May 4, 2026 after the operation-transition status-authority
regression was repaired and the representative path migrated earlier into
startup active-gate evidence.

## Why

Review found that stale cache-observed target progress could override an
authoritative terminal target status during priority `REPLACE` drain. That
violated the operation workflow owner contract: authoritative terminal target
state is stronger evidence than cache-observed progress.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under
topology workflow stabilization, failure simulations, and production
guarantees.

## In Scope

1. Authoritative `FAILED` target status must outrank stale cache-observed
   `ACTIVE` target status.
2. Authoritative `REMOVED` target status must outrank stale cache-observed
   `ACTIVE` target status.
3. The representative `rolling-restart --fast-local` path must be rerun and
   either reach the post-active operation-transition boundary again or migrate
   to a named owner boundary.

## Out Of Scope

1. Post-active operation timeout retry behavior after the representative path
   migrates earlier.
2. Durable over-target trim once operation lifecycle evidence has converged.
3. Pro or Enterprise behavior.

## Boundary Contract

1. Semantic owner: operation workflow owner.
2. Canonical contract: reconcile one normalized target-status evidence
   snapshot through one resolution table.
3. Authoritative terminal statuses are stronger than cache-observed target
   progress.
4. Cache-observed progress may only outrank authoritative evidence when the
   authoritative status is absent or non-terminal and the cache status is a
   valid forward progress witness.
5. Consumers must not reinterpret stale cache progress as terminal authority.

## Static Drift Ledger

Preflight:

1. Relevant guardrails selected by boundary: literal ownership,
   decision-boundary audit, runtime grammar, focused owner tests, and diff
   whitespace.
2. The review follow-up started from the already-active operation-transition
   package history; no new package-specific static baseline was recorded
   before the first status-authority edit.

Closure:

1. Focused regression proof was added for authoritative `FAILED` over stale
   cache `ACTIVE`.
2. Review correction added focused regression proof for authoritative
   `REMOVED` over stale cache `ACTIVE`.
3. Operation-transition residuals not evaluated by the migrated representative
   path are explicitly queued in
   [Rolling Restart Operation Transition Pressure And Over-Target Trim](./active-20260425-rolling-restart-operation-transition-pressure-and-overtarget-trim.md).
4. The status-authority follow-up first migrated to
   [Rolling Restart Startup Active Gate Snapshot Coverage Operation Progress Reentry](./done-20260504-rolling-restart-startup-active-gate-snapshot-coverage-operation-progress-reentry.md),
   which then migrated to
   [Rolling Restart Startup Rejoin Seed Contact Snapshot Coverage](./done-20260504-rolling-restart-startup-rejoin-seed-contact-snapshot-coverage.md).

## Validation

1. `npm test -- test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js --grep "authoritative REMOVED"`:
   passed after the review correction.
2. `npm test -- test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`:
   passed, `89/89`.
3. `npm test -- test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`:
   passed, `158/158`.
4. `node --test test/rebalancer/replace-replica-workflow.test.js`:
   passed, `219/219`.
5. Static guardrails for touched files:
   passed:
   `node --check src/rebalancer/operation-workflow-owner-segment-7.js`,
   `node --check test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`,
   `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-segment-7.js test/rebalancer/rebalance-coordinator-stopping-reconcile.test.js`,
   `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-segment-7.js`,
   `node scripts/check-runtime-grammar-contracts.js src/rebalancer/operation-workflow-owner-segment-7.js`,
   and `git diff --check`.

## Representative Execution

1. `test-output/reports/rolling-restart-after-status-authority-20260504-codex.report.json`
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
    `e4add92f-0aac-450c-b085-0c6fb2dc4ae2`, latest workflow step `SENDING`,
    latest status `pending`, `transition_deferred`, `workflow_timeout`, wait
    mode `timeout_reconcile_due`, and next action
    `reconcile_stale_operation_progress`.
15. The run migrated before post-active operation-transition / over-target
    trim could be evaluated again.

## Done When

1. Authoritative terminal target status is a first-class resolution-table
   signal for `FAILED` and `REMOVED`.
2. Focused operation workflow owner tests and static guardrails pass.
3. The representative path either reaches post-active convergence again or
   migrates to one newly named owner boundary.
