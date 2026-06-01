# Rebalancer Operation Workflow Owner Semantic Shared Front Reduction

## Status

Done on 2026-04-20.

This child package is the next highest-signal internal duplication slice under
`done-20260420-segmented-owner-internal-duplication-reduction-umbrella.md`.

## Why

The current top clone group sits inside the rebalancer operation workflow
owner boundary between `operation-workflow-owner-shared.js` and
`operation-workflow-owner-segment-4.js`. The goal is to replace that duplicate
same-owner front with semantic dependency ownership, not another anonymous
numbered bundle.

## Scope

1. `src/rebalancer/operation-workflow-owner-shared.js`
2. `src/rebalancer/operation-workflow-owner-segment-4.js`
3. `src/rebalancer/operation-workflow-owner.js`

## Invariants

1. `OPERATION_WORKFLOW_OWNER_SHARED` remains the canonical shared ingress for
   the segmented owner in this package.
2. No new synthetic numbered group objects or extra segmentation layers.
3. The reduction must leave the touched files lint-clean under the repo ESLint
   config.
4. Workflow state, next-action, and repair semantics stay owned by the
   rebalancer workflow boundary rather than being restated locally.

## Validation

1. `npx eslint src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-shared.js src/rebalancer/operation-workflow-owner-segment-4.js`
2. `npx tap test/rebalancer/replica-operations-single-writer.test.js`
3. `npm run test:duplication`
4. `npm run test:metrics`

## Closure Notes

1. `operation-workflow-owner-segment-4.js` now destructures only the owner
   contract names it actually consumes.
2. The touched rebalancer owner files are lint-clean under the repo ESLint
   config.
3. Repository duplication baseline tightened from `18 / 715` to
   `17 / 615`.
