# Operation Progress Resource And Deterministic Gates Sprint

Status: done on 2026-05-20. Opened after the rolling-restart green-gate
sprint was closed as an architecture reset.

## Goal

Promote `operation_progress` to the single owned resource for operation
lifecycle progress, then prove the lifecycle through named invariants,
deterministic simulation, and multiple failure-gate scenarios.

## Sprint Strategy Brief

- Goal state: operation workflow owns `operation_progress`; publication,
  active-gate, and observers consume owner outcomes rather than re-deriving
  lifecycle state.
- Current causal thesis: the repeated rolling-restart frontier is a shared
  operation-publication-active-gate lifecycle with no single progress writer.
- Competing hypotheses: H1 operation lifecycle state is implicit and split
  across owners; H2 symptom metrics hide invariant violations; H3
  rolling-restart is overfit as a sole gate; H4 probe/package ceremony is
  too heavy to run cheap experiments.
- Confidence and evidence: high that repeated package churn exposed a
  multi-owner operation lifecycle; high that the focused tests now cover the
  lifecycle table, invariant IDs, deterministic replay, and expanded gate
  matrix; medium that remaining runtime observers can migrate incrementally
  through the compatibility facade.
- Expected path: add one operation lifecycle state table, route the existing
  workflow decision through it, publish owner-map responsibility, add invariant
  IDs and checks, add deterministic scheduler/network harness proof, extend
  topology failure gate coverage, and add a lightweight probe validation lane.
- Expected green path: follow this package with observer call-site migration
  only when fresh evidence identifies a concrete read-only projection still
  re-deriving operation progress.
- Wrong direction signals: patching publication, active-gate, readiness,
  admission, or timeout symptoms without consuming the `operation_progress`
  owner outcome; adding new segment files; or weakening guardrails so the
  package validates.
- Next best package: closed package
  `work/packages/done-20260520-operation-progress-resource-and-deterministic-gates.md`
  completed the architecture implementation pass; fresh theory-ladder evidence
  must select any successor.
- Stop or escalate rule: stop if implementation requires changing publication,
  active-gate admission, timeout budgets, or weakening guardrails to make the
  package pass.

## Current Edge Card

```text
Representative artifact: none
Visible first frontier: operation_progress
Active package: work/packages/done-20260520-operation-progress-resource-and-deterministic-gates.md
Active package owner: operation_workflow_owner
Active package boundary: operation_progress
Selected cause: operation_progress_multi_owner
Required action: Close this package or route any successor from fresh representative evidence rather than rolling-restart symptom metrics.
Representative status: architecture-gap
Causal outcome: architecture-gap
Architecture gate: not-required / unknown
Expected delta: Operation progress is represented by one owner-owned state machine; publication, active-gate, and observation code consume owned outcomes instead of re-deriving lifecycle state; rolling-restart joins a multi-scenario invariant gate.
Current state: Implementation and closure proof are validated; operation_progress owns lifecycle state, retired source vocabulary is removed from source/test/script/owner docs, and rebalancer ordinal wrappers are guarded by the owner-map ledger.
Allowed edits: work/packages/done-20260520-operation-progress-resource-and-deterministic-gates.md, work/sprints/done-2026-q2-operation-progress-resource-and-deterministic-gates.md, work/sprints/current-blocker.md, work/sprints/current-blocker.json, work/tracks/topology-convergence.md, architecture/current-owner-maps.md, package.json, scripts/check-operation-progress-authority.js, scripts/list-commands.js, scripts/run-topology-failure-gates.js, scripts/work-package-schema.js, scripts/work-tracker.js, work/README.md, work/model-ledger.jsonl, work/templates/probe-package.md, src/rebalancer/README.md, src/rebalancer/operation-lifecycle.js, src/rebalancer/operation-progress-events.js, src/rebalancer/operation-progress-observer.js, src/rebalancer/operation-progress-store.js, src/rebalancer/operation-workflow-owner.js, src/rebalancer/operation-workflow-owner-adapter.js, src/rebalancer/operation-workflow-owner-decision.js, src/rebalancer/operation-workflow-owner-constants.js, src/rebalancer/operation-workflow-owner-ports.js, src/rebalancer/operation-workflow-owner-shared.js, src/control-plane/invariant-engine.js, src/control-plane/invariant-constants.js, src/control-plane/priority-recovery-snapshot-stage-8.js, src/control-plane/topology-operator-witness.js, src/diagnostics/topology-convergence-graph.js, src/invariants/invariant-catalog.js, test/rebalancer/operation-lifecycle.test.js, test/rebalancer/operation-progress-store.test.js, test/rebalancer/operation-workflow-owner-adapter.test.js, test/rebalancer/operation-workflow-owner-decision.test.js, test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry-suite.js, test/rebalancer/priority-recovery-topology-timeout-owner-reentry-test-cases.js, test/control-plane/invariant-engine.test.js, test/diagnostics/topology-convergence-graph.test.js, test/distributed/harness/deterministic-simulator.js, test/distributed/harness/__tests__/deterministic-simulator.test.js, test/distributed/harness/cluster-segment-7-class-4.js, test/distributed/harness/scenario-registry.js, test/distributed/harness/__tests__/scenario-registry.test.js, test/distributed/harness/topology-failure-gate-runner.js, test/distributed/harness/topology-failure-gate-matrix.js, test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js, test/scripts/analyze-topology-convergence.test.js, test/scripts/__fixtures__/topology-convergence/publication-operation-active-gate-handoff.fixture.json
Candidate runtime files: src/rebalancer/operation-lifecycle.js, src/rebalancer/operation-progress-events.js, src/rebalancer/operation-progress-observer.js, src/rebalancer/operation-progress-store.js, src/rebalancer/operation-workflow-owner.js, src/rebalancer/operation-workflow-owner-adapter.js, src/rebalancer/operation-workflow-owner-decision.js, src/rebalancer/operation-workflow-owner-effects.js, src/rebalancer/operation-workflow-owner-ports.js, src/rebalancer/operation-workflow-owner-shared.js, src/control-plane/topology-operator-witness.js, src/control-plane/invariant-engine.js, src/control-plane/priority-recovery-snapshot-stage-8.js, src/diagnostics/topology-convergence-graph.js, src/invariants/invariant-catalog.js
Forbidden edits: owned files expand beyond this package, a frozen decision must be reopened
Required latest proof: npm test -- test/rebalancer/operation-lifecycle.test.js test/rebalancer/operation-progress-store.test.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js, npm test -- test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js, npm test -- test/control-plane/invariant-engine.test.js test/distributed/harness/__tests__/deterministic-simulator.test.js test/distributed/harness/__tests__/topology-failure-gate-matrix.test.js test/distributed/harness/__tests__/scenario-registry.test.js, npm run test:topology-failure-gates, npm run audit:operation-progress-authority, npm run audit:runtime-grammar:file -- src/rebalancer/operation-lifecycle.js src/rebalancer/operation-progress-events.js src/rebalancer/operation-progress-store.js src/rebalancer/operation-progress-observer.js src/rebalancer/operation-workflow-owner-adapter.js src/rebalancer/operation-workflow-owner-effects.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/control-plane/topology-operator-witness.js src/control-plane/invariant-engine.js src/invariants/invariant-catalog.js src/diagnostics/topology-convergence-graph.js src/control-plane/priority-recovery-snapshot-stage-8.js, npm run audit:guideline:literals -- scripts/check-operation-progress-authority.js scripts/list-commands.js src/rebalancer/operation-lifecycle.js src/rebalancer/operation-progress-events.js src/rebalancer/operation-progress-store.js src/rebalancer/operation-progress-observer.js src/rebalancer/operation-workflow-owner-adapter.js src/rebalancer/operation-workflow-owner-effects.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/control-plane/topology-operator-witness.js src/control-plane/invariant-engine.js src/invariants/invariant-catalog.js src/diagnostics/topology-convergence-graph.js src/control-plane/priority-recovery-snapshot-stage-8.js test/distributed/harness/deterministic-simulator.js test/distributed/harness/topology-failure-gate-runner.js scripts/run-topology-failure-gates.js, npm run audit:guideline:decision-boundaries -- scripts/check-operation-progress-authority.js src/rebalancer/operation-lifecycle.js src/rebalancer/operation-progress-events.js src/rebalancer/operation-progress-store.js src/rebalancer/operation-progress-observer.js src/rebalancer/operation-workflow-owner-adapter.js src/rebalancer/operation-workflow-owner-effects.js src/rebalancer/operation-workflow-owner-ports.js src/rebalancer/operation-workflow-owner.js src/rebalancer/operation-workflow-owner-decision.js src/control-plane/topology-operator-witness.js test/distributed/harness/deterministic-simulator.js test/distributed/harness/topology-failure-gate-runner.js scripts/run-topology-failure-gates.js, npm run work:validate -- --entry, npm run work:validate -- --pre-impl, npm run work:validate -- --closure
Allowed stop modes: representative-green, migrated, reduced, same-frontier, classification-only, architecture-gap, human-escalation
```
