# Priority Recovery Closure Consumer Cutover And Guardrails

## Why

The actuation contract exists, but correct usage is incomplete.

Several consumers still sit close to raw or derived-but-stale surfaces:

1. durable publication `priorityPartitionSummary`
2. gate-level `prioritySpreadPending`
3. failure-bundle dominant reason selection
4. operation-presence inference from partial row visibility
5. replay-only comparison between durable and final captured rows

After the publication closure witness exists, these consumers must be cut over
to the decision-layer closure contract instead of reconstructing meaning from
their local evidence.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

Sprint:

1. [Publication-scoped consistency and node-join closure](../sprints/active-2026-q2-publication-scoped-consistency-and-node-join-closure.md)

Depends on:

1. [Priority recovery publication closure witness contract](./todo-20260423-priority-recovery-publication-closure-witness-contract.md)

## In Scope

1. Audit every runtime and presentation consumer that derives priority
   recovery closure from raw publication summary, operation row absence, or
   gate booleans.
2. Cut over those consumers to the priority recovery closure witness or to the
   canonical decision snapshot that owns the witness.
3. Delete or demote local fallback meanings that compete with the decision
   owner.
4. Add a static guardrail for the known misuse paths.
5. Keep legacy retained-artifact support bounded and explicitly labeled.

## Out Of Scope

1. A second closure witness shape.
2. New harness pass/fail criteria.
3. Changing placement policy or quorum sizing.

## Shared Boundary Contract

- Semantic owner:
  priority recovery closure meaning is owned by the decision-layer witness.
- Allowed consumers:
  membership publication, recovery gates, readiness/startup authority,
  admin snapshots, harness failure bundles, replay tooling, and reports.
- Prohibited reinterpretations:
  consumer-local dominant reasons from raw `priorityPartitionSummary`,
  spread-pending booleans without witness state, and operation absence from
  partial evidence.
- Primary proof:
  consumer-focused tests plus runtime grammar audit.

## Hotspots

1. `src/control-plane/priority-recovery-observation-snapshot.js`
2. `src/control-plane/recovery-protocol-snapshot.js`
3. `src/control-plane/publication-recovery-gate.js`
4. `src/control-plane/control-plane-readiness-service-segment-4.js`
5. `test/distributed/harness/failure-bundle-segment-4.js`
6. `test/distributed/harness/cluster-segment-2.js`
7. `test/distributed/harness/publication-evidence-replay.js`
8. `scripts/check-runtime-grammar-contracts.js`

## Detection / Analysis Tasks

- [x] List every consumer that reads `priorityPartitionSummary`,
      `prioritySpreadPending`, or operation absence to decide priority
      recovery closure.
- [x] Classify each consumer as operational authority, diagnostics-only, or
      legacy retained-artifact support.
- [x] Identify fallback meanings that must be deleted versus kept as bounded
      legacy parsing.

## Implementation Tasks

- [x] Cut operational consumers over to the closure witness.
- [x] Cut diagnostics consumers over to displaying witness state and supporting
      evidence.
- [x] Update failure-bundle dominant reason selection so it cannot report
      `eligible_but_no_operation_created` when the witness says publication
      refresh is the blocker.
- [x] Extend replay output to classify closure-witness state, not only durable
      versus replayed summary drift.
- [x] Extend runtime grammar audit for the consumer misuse patterns.

## Residual Closure Inventory

- [x] Operational consumers no longer reconstruct closure from presentation or
      raw publication fields.
- [x] Diagnostics consumers preserve the decision-layer witness vocabulary.
- [x] Legacy retained artifact parsing is bounded and named.
- [x] Static guardrails fail on the known misuse patterns.
- [x] Scenario rerun confirms blocker movement.

## Progress Notes

1. Failure-bundle, replay, readiness, and active-gate consumers now preserve
   decision-owned closure witness fields instead of rebuilding closure from
   `priorityPartitionSummary`, `prioritySpreadPending`, or partial operation
   visibility.
2. Replay output now emits witness-state classification in addition to durable
   versus replayed summary drift, so stale durable publication metadata is a
   named consumer state rather than a manual artifact correlation step.
3. Runtime grammar audit coverage now guards the known misuse paths at the
   load-lane freshness callsite, the load convergence witness threading seam,
   and the replay classification path.
4. Focused validation passed:
   `npx tap test/distributed/harness/__tests__/failure-bundle.test.js`,
   `npx tap test/distributed/harness/__tests__/publication-evidence-replay.test.js`,
   `npx tap test/control-plane/control-plane-readiness-service.test-part-4.js`,
   `npx tap test/control-plane/priority-recovery-snapshot.test.js`,
   `npx tap test/scripts/check-runtime-grammar-contracts.test.js`,
   `npm run audit:runtime-grammar`, and `npm run test:metrics`.
5. Representative rerun on April 23, 2026 confirms blocker migration. The
   scenario no longer reports stale no-operation or stale priority-spread
   closure; it now fails later on `nodeAdmissionBlocked` with publication gate
   readiness `true` and zero blocked or unresolved priority partitions.

## Validation

1. `npx tap test/distributed/harness/__tests__/failure-bundle.test.js`
2. `npx tap test/distributed/harness/__tests__/publication-evidence-replay.test.js`
3. `npx tap test/control-plane/control-plane-readiness-service.test-part-4.js`
4. `npx tap test/control-plane/priority-recovery-snapshot.test.js`
5. `npx tap test/scripts/check-runtime-grammar-contracts.test.js`
6. `npm run audit:runtime-grammar`
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --fast-local`

## Done When

1. Correct usage is enforced at the known consumer paths.
2. Failure bundles and triage summaries name publication refresh stale when
   that is the actual closure-witness blocker.
3. No current runtime consumer has to replay final rows to discover that
   durable publication metadata is stale.
