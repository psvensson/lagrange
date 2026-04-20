# Startup and Control-Plane Contract Hardening

## Why

The current runtime blocker sits in startup/control-plane authority, and this
area also contains the clearest domain-level `null` contract violations.

`null` currently stands in for multiple meanings on this path:
1. unpublished by design
2. observation unavailable
3. authority unavailable
4. recovery pending
5. no failure reason

That is exactly the ambiguity the doctrine forbids.

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Hotspots

1. `src/control-plane/control-plane-readiness-service.js`
2. `src/control-plane/control-plane-system-table-gateway.js`
3. `src/control-plane/membership-publication-coordinator.js`
4. `src/bootstrap/bootstrap-api.js`
5. `src/bootstrap/owners/bootstrap-readiness-owner.js`
6. `src/bootstrap/startup-recovery-coordinator.js`

## Invariants

1. Startup/publication state is never represented by nullable epoch/status.
2. Owner APIs do not return `null` to encode publication/readiness state.
3. Bootstrap consumers receive one explicit startup/control-plane state model.
4. Required dependencies are not stored as `null`.

## Analysis Tasks

- [ ] Inventory all owner/service contracts on this path that still use `null` or `undefined`.
- [ ] Group usages by meaning: phase, failure, capability, missing evidence, optional dependency.
- [ ] Define one explicit variant set for startup/publication/readiness state within existing owners.

## Implementation Tasks

- [ ] Replace nullable startup/publication fields in `ControlPlaneReadinessService` with explicit variants.
- [ ] Remove sentinel `return null` from touched startup/control-plane owner APIs.
- [ ] Refactor bootstrap-facing responses to consume explicit readiness/publication state.
- [ ] Convert optional capability/dependency storage from `null` to explicit capability representation where needed.
- [ ] Add focused unit coverage proving absence is not used as state on this path.

## Done When

1. The startup/control-plane authority path no longer presents `null` or `undefined` as state.
2. Bootstrap/readiness/publication consumers agree on one explicit vocabulary.
3. Distributed startup failures, if any remain, are expressed as explicit blockers rather than nullable absence.

## 2026-04-12 execution update

Implemented slice:
1. `ControlPlaneReadinessService.buildStartupAuthority...` now emits explicit
   `publication`, `priorityPartition`, `recoveryProtocol`,
   `targetParticipationDetail`, and `failure` descriptors on the hardened
   startup-authority path.
2. Startup-authority compatibility aliases are only attached when a concrete
   value exists, instead of carrying `null`.
3. Priority-recovery health details derived from startup authority now reuse
   the explicit descriptors.
4. `StartupRecoveryCoordinator` and `BootstrapReadinessOwner` now consume and
   surface the explicit startup-authority descriptors.

Focused validation passed:
1. `node test/control-plane/startup-authority-snapshot.test.js`
2. `node test/bootstrap/startup-authority-consumption.test.js`
3. `node test/bootstrap/startup-recovery-coordinator.test.js`
4. `node test/control-plane/control-plane-readiness-service.test.js`
5. `node test/bootstrap/bootstrap-api.test.js`

Remaining gap in this package:
1. broader startup/control-plane contracts outside the hardened startup-authority seam still contain nullish state elsewhere in the touched owners
