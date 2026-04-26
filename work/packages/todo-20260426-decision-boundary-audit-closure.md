# Decision-Boundary Audit Closure

## Why

`npm run audit:guideline:decision-boundaries` reports 16 violations. The
doctrine forbids readiness, admission, retryability, lifecycle, phase, outcome,
and reason-code decisions from being implemented as branch piles, so these
violations are architecture debt, not cosmetic cleanup.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under
`Topology workflow stabilization`, `Failure simulations`, and `Production
guarantees`.

Sprint:

1. [Roadmap runtime truth and boundary closure](../sprints/active-2026-q2-roadmap-runtime-truth-and-boundary-closure.md)

## In Scope

1. Capture the current 16 violation list.
2. Assign each violation to a semantic owner boundary.
3. Convert each in-scope boundary to evidence collection plus one canonical
   decision table/state model/outcome.
4. Preserve or improve focused behavior tests for every rewritten boundary.

## Out Of Scope

1. Suppressing detector output without removing the decision-boundary shape.
2. Rewriting unrelated modules to chase incidental style.
3. Mixing literal cleanup into the same package unless the literal belongs to
   the same decision boundary.

## Invariants

1. Multi-signal decisions emit one canonical outcome and reasons.
2. Consumers do not reconstruct the same decision from booleans.
3. The decision-boundary audit count must not increase.

## Hotspots

1. Files reported by `scripts/check-guideline-decision-boundaries.js`
2. Current rolling-restart owner boundaries
3. Priority recovery and rebalancer admission/progress code

## Initial Baseline

Observed on April 26, 2026:

1. `src/admin/admin-websocket-api-segment-3.js`
2. `src/bootstrap/control-plane-write-health-owner.js`
3. `src/bootstrap/owners/bootstrap-readiness-owner-class-part-1.js`
4. `src/bootstrap/owners/service-registration-visibility-owner.js`
5. `src/bootstrap/shared/node-state-publication-owner.js`
6. `src/cdc/cdc-integration-service-shared.js`
7. `src/control-plane/active-node-projection.js`
8. `src/control-plane/control-plane-error-classification.js`
9. `src/control-plane/control-plane-system-table-gateway-shared.js`
10. `src/control-plane/heartbeat-service-write-coalescing.js`
11. `src/node/node-reintegration-service.js`
12. `src/query/query-executor-segment-2-part-2.js`
13. `src/query/table-creation-service-class-part-1.js`
14. `src/query/table-creation-service-class-part-2.js`
15. `src/rebalancer/operation-workflow-owner-segment-4.js`
16. `src/worker/replica-worker.js`

## Static Drift Ledger

Preflight:

- [ ] Run `npm run audit:guideline:decision-boundaries`.
- [ ] Record the 16 inherited violations.
- [ ] Record touched-file violation counts before edits.
- [ ] Select owner-scoped focused tests for each violation group.

Closure:

- [ ] Rerun the same audit.
- [ ] No decision-boundary violation count increased.
- [ ] No touched-file decision-boundary violation remains unless linked to a
      narrower follow-on outside the package boundary.

## Validation

1. `npm run audit:guideline:decision-boundaries`
2. Focused tests for each changed semantic owner.
3. Representative `rolling-restart` probe if a changed owner is on the active
   failure path.

## Done When

1. The repo-wide decision-boundary audit is green, or all remaining violations
   are split into explicit owner packages with no touched-file regression.
2. Every changed multi-signal decision has one canonical state model or
   decision table.
