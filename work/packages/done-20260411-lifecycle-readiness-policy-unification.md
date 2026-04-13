# Lifecycle Readiness Policy Unification for Boot, Join, Rejoin, and Rebalance

## Why

Boot, join, rejoin, restart, and rebalance flows shared intent but still
reported readiness and timeout policy through overlapping logic, which increased
drift risk and complicated stabilization diagnosis.

## Scope Basis

AGPL-in-scope roadmap rows:

1. `Topology workflow stabilization` (`roadmap.md`, `edition-matrix.md`)
2. `Failure simulations` (`roadmap.md`, `edition-matrix.md`)
3. `Operational visibility basics` (`roadmap.md`, `edition-matrix.md`)

## Sprint Umbrella

[Matrix Stability and Readiness Semantics Sprint](../sprints/done-2026-q2-matrix-stability-timeout-and-readiness-unification.md)

## In Scope

1. Define one readiness evidence contract used by lifecycle-related flows.
2. Move duplicated active-wait and admission decisions behind shared owner-path semantics.
3. Ensure boot, join, rejoin, and rebalance share `classCode`, `recoverability`,
   and no-progress evidence fields.
4. Preserve scenario-specific guardrails while using common policy semantics.
5. Document mode-to-policy defaults.

## Out Of Scope

1. Introducing a new lifecycle state machine from scratch.
2. Production protocol redesign or member-election changes.
3. Non-AGPL feature expansion.

## Invariants

1. The same evidence input produces one admission-decision shape across lifecycle modes.
2. No path can bypass shared policy without explicit exception handling.
3. Existing soft-proceed hardening remains bounded and explicit.

## Hotspots

1. `test/distributed/scenarios/node-join-under-load.js`
2. `test/distributed/scenarios/node-failure-rebalance.js`
3. `test/distributed/harness/cluster.js`
4. `test/distributed/harness/active-gate-closure-classification.js`
5. `test/distributed/scenarios/rolling-restart`

## Implementation Tasks

- [x] Normalize lifecycle wait paths onto one readiness-failure envelope.
- [x] Replace remaining ad-hoc wait branches with shared evidence and verdict helpers.
- [x] Keep scenario guardrails while standardizing evidence keys across flows.
- [x] Normalize logging so triage consumers see one format.
- [x] Add focused regression assertions proving per-flow behavior maps to shared policy fields.

## Outcome

Completed as the lifecycle-readiness alignment pass. Boot, join, rejoin, and
rebalance failure surfaces now describe convergence trouble through the same
structured readiness contract, which removes one major source of cross-flow
triage drift even though the runtime still exhibits systemic instability.

## Validation

- [x] Shared startup and active-gate witness coverage
- [x] Scenario-level reruns covering join, load, and partition pressure paths
- [x] Report-shape validation for consistent lifecycle evidence fields

## Done When

1. Lifecycle readiness admission has one canonical evidence contract.
2. No lifecycle path relies on a private timeout and soft-success vocabulary.
3. Shared evidence remains stable across flows and useful in triage output.
