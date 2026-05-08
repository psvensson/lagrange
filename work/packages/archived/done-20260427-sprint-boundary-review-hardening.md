# Sprint Boundary Review Hardening

## Why

The April 27 sprint review found that system complexity is now a sprint risk
because small changes can widen admission, readiness, retry, or publication
behavior across several owner boundaries. This package keeps the current sprint
surface narrow by correcting review-identified regressions without implementing
the queued priority-follow-up package itself.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Restore existing node-join retryable-resume timeout budget semantics.
2. Preserve reason-only publication pending evidence at the publication
   recovery gate boundary.
3. Prevent contained transport pressure from admitting deferred owner-read
   work unless the partition is part of active priority recovery.
4. Update sprint and roadmap status truth to promote the April 27 migrated
   blocker and freeze timeout-budget expansion.
5. Add negative regression coverage for widened admission and reason-only
   publication evidence.

## Out Of Scope

1. Implementing the April 27 priority follow-up under transport pressure.
2. Increasing load-readiness, convergence, retry, or admission timeout budgets.
3. Harness-only readiness exemptions.
4. Pro or Enterprise features.

## Boundary Contract

Semantic owner: the existing publication recovery gate and rebalancer admission
owners remain authoritative.

Canonical contract shape:

1. publication recovery emits one gate state plus canonical reason codes
2. rebalancer admission emits one pressure action from normalized evidence
3. timeout budgets are explicit constants, not hidden convergence fixes

Allowed consumers: existing readiness, harness, and rebalancer callers only.

Prohibited reinterpretations:

1. contained router backpressure must not become generic admission success
2. reason-only publication debt must not be silently reclassified as ready
3. timeout increases must not stand in for deterministic owner closure

## Residual Closure Inventory

1. Owner paths: publication recovery gate, rebalancer admission, node-join
   retryable-resume config.
2. Tail consumers: readiness snapshots, priority recovery admission, current
   sprint tracker, roadmap status table.
3. Superseded paths: generic contained-pressure admission for non-priority
   partitions.
4. Required proof: focused publication gate tests, focused rebalancer admission
   tests, scalar/literal audit, decision-boundary audit, runtime grammar audit,
   and diff whitespace check.

## Current Dominant Blocker

The representative `rolling-restart --fast-local` gate is currently blocked
before post-active trim by the April 27 load-readiness priority follow-up under
transport pressure:

1. `sql_write_operations-p1` reports `eligible_but_no_operation_created`
2. `sql_transactions-p1` has a terminal failed priority witness
3. logs show router timeout, outbound queue, CDC forwarding, and system-table
   query/write pressure

This package does not solve that blocker. It prevents review-discovered
admission and timeout widening from obscuring it.

## Done When

1. The new negative tests fail before the implementation fix and pass after it.
2. Focused publication and rebalancer suites pass.
3. Static guardrails show no new drift.
4. Roadmap and sprint files identify the April 27 blocker as the active
   representative gate and keep timeout-budget increases out of scope.

## Closure Evidence

Closed on April 27, 2026.

Validation:

1. `npm test -- test/control-plane/publication-recovery-gate.test.js`
2. `npm test -- test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
3. `npm test -- test/bootstrap/node-joining-service.test.js`
4. `npm run audit:guideline:decision-boundaries`
5. `npm run audit:runtime-grammar`
6. `npm run test:metadata-gateway:audit`
7. `npm run audit:guideline:literals`
8. `git diff --check`

Representative rerun note: the full `rolling-restart --fast-local` gate was not
rerun in this package because the package explicitly does not solve the active
April 27 priority follow-up blocker. The active priority-follow-up package owns
that representative proof.
