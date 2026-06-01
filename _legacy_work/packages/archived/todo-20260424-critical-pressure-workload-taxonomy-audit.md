# Critical Pressure Workload Taxonomy Audit

## Why

The representative pressure work fixed the primary `node-join-under-load`
path, but the latest `rolling-restart` logs still show control-plane repair,
admin observation, CDC visibility, and critical topology work competing for
attention during convergence. The pressure grammar needs one taxonomy audit
before more caller-local exceptions are added.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Production guarantees`

Sprint:

1. [Critical topology convergence grammar contract](./done-20260424-critical-topology-convergence-grammar-contract.md)

## In Scope

1. Audit `control-plane-workload-profile.js` against the convergence grammar.
2. Confirm `readiness`, `repair`, `CDC visibility`, `node-state publication`,
   and `membership publication` map to one workload class each.
3. Remove or fence caller-local pressure exceptions that duplicate
   `PressureGovernor`.
4. Add proof that diagnostics and broad repair defer before critical topology
   lifecycle work.

## Out Of Scope

1. Broad transport rewrite.
2. Product-visible quality-of-service features.
3. Harness exceptions for pressure symptoms.

## Shared Boundary Contract

- Semantic owner:
  `PressureGovernor` plus the canonical workload profile table.
- Canonical contract:
  every control-plane work item enters as one normalized workload class and
  receives one `admit`, `defer`, `retry`, or `reject` outcome.
- Allowed consumers:
  operation workflow owner, node-state publication, membership publication,
  CDC visibility, admin diagnostics, readiness, and harness reporting.
- Prohibited reinterpretations:
  caller-local critical bypasses, diagnostics consuming critical reserve, or
  treating contained observation backlog as critical write loss.

## Residual Closure Inventory

- [ ] Audit workload classes and resource partitions.
- [ ] Resolve surprising class mappings with owner rationale.
- [ ] Fence superseded caller-local exceptions.
- [ ] Add focused pressure-governor proof.
- [ ] Rerun the relevant `rolling-restart` convergence probe.

## Validation

1. `npm test -- test/control-plane/pressure-governor.test.js`
2. `npm test -- test/control-plane/control-plane-readiness-service.test-part-4.js`
3. `node --test test/distributed/harness/__tests__/failure-bundle.test.js`

## Done When

1. Pressure classification has one owner vocabulary across critical recovery,
   observation, diagnostics, and background work.
2. The latest convergence blocker is not explained by a caller-local pressure
   exception.
