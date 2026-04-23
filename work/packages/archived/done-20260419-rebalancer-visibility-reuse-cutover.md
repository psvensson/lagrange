# Rebalancer Visibility Reuse Cutover

## Status

Complete on 2026-04-19 after the repository-owned visibility cutover plus
focused rebalancer tests and repo metrics. Named harness reruns remain
intentionally deferred until the full reuse-first tranche is closed.

## Why

`ReplicaOperationRepository` already owns visibility read modes and
authoritative read policy for `replica_operations`, but
`OperationWorkflowOwner` still carries local progression logic that shadows
parts of that contract.

This package cuts lifecycle progression back toward repository-owned visibility
answers so rebalancer behavior is easier to reason about and less dependent on
local fallback policy.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Reuse repository-owned visibility/read outcomes in
   `src/rebalancer/operation-workflow-owner.js`
2. Tighten direct repository/workflow collaboration only where needed to avoid
   duplicate fallback policy
3. Add or update focused workflow tests that prove the cutover

## Out Of Scope

1. New rebalance features
2. Broad operation state-model redesign beyond the touched visibility lane
3. Publication redesign outside direct collaborators

## Scenario Targets

1. `seven-node-read-write-load-transaction-recovery`
2. `seven-node-load-during-partitioning`
3. `seed-restart-under-load`

## Invariants

1. Workflow progression must consume one repository-owned visibility answer.
2. Local workflow code must not restate cache-versus-authoritative fallback
   policy after the cutover.
3. Focused rebalancer tests plus metrics must remain green.

## Shared Boundary Contract

- Semantic owner: `src/rebalancer/replica-operation-repository.js`
- Canonical contract shape / vocabulary: one visibility/read-mode outcome for
  replica-operation presence and authoritative confirmation
- Allowed consumers: `OperationWorkflowOwner`, publication coordinator,
  rebalancer diagnostics and tests
- Prohibited reinterpretations: local cache/authoritative fallback policy in
  workflow owners
- Primary diagnostics / proof surfaces: rebalancer workflow tests, operation
  visibility tests, distributed recovery scenario evidence

## Detection / Analysis Tasks

- [x] Inventory workflow callers that shadow repository visibility policy.
- [x] Mark the local fallback branches that can be deleted.
- [x] Prove deferred-visibility behavior with focused tests.

## Implementation Tasks

- [x] Cut the touched workflow paths over to repository-owned visibility
      outcomes.
- [x] Delete superseded local fallback policy in workflow code.
- [x] Preserve existing diagnostics while aligning them to the repository
      vocabulary.

## Residual Closure Inventory

- [x] Workflow progression consumes repository-owned visibility answers.
- [x] Local fallback policy is deleted where superseded.
- [x] Diagnostics reflect one visibility vocabulary.

## Validation

1. Touched rebalancer tests
2. Focused distributed recovery scenario evidence
3. `npm run test:metrics`

## Done When

1. Rebalancer workflow code reuses repository-owned visibility grammar.
2. Parallel local fallback policy is removed from the touched paths.
3. The named scenario lanes keep green or fail with one obvious typed
   visibility blocker story.
