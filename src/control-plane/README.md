# Control Plane Owner Card

## Role

`src/control-plane/` owns readiness, membership publication, mutation
readiness, priority recovery, diagnostics contracts, and control-plane system
table ingress.

## Primary Owners

- `ControlPlaneReadinessService` owns serve/repair/recovery eligibility.
- `ControlPlaneMutationReadiness` owns deferred and retryable mutation
  admission while authority is establishing.
- `ControlPlaneSystemTableGateway` owns system-table mutation ingress.
- `MembershipPublicationCoordinator` owns publication convergence.
- `PriorityRecoveryDecisionSnapshot` and
  `PriorityRecoveryObservationSnapshot` own priority-recovery meaning and
  diagnostics presentation.
- `OwnerContractOutcome` owns the shared `contractState` plus `nextAction`
  envelope.

## First Files

- `control-plane-readiness-service.js` for readiness decisions.
- `control-plane-mutation-readiness.js` for mutation deferral.
- `control-plane-system-table-gateway.js` for system-table writes.
- `membership-publication-coordinator.js` for publication convergence.
- `priority-recovery-snapshot.js` and
  `priority-recovery-observation-snapshot.js` for recovery contracts.
- `owner-contract-outcome.js` for cross-layer outcome shape.

## Do Not

- Do not let presentation, admin, or harness code invent control-plane meaning.
- Do not collapse deferred, blocked, failed, and pending states into `null`,
  empty arrays, or booleans.
- Do not add cache-plus-SQL fallback branches for one semantic decision.
- Do not perform reader-local repair when an owner outcome can express stale,
  deferred, retryable, or failed state.

## Proof Surface

- Focused tests under `test/control-plane/`.
- Admin, harness, or report tests when a diagnostic contract changes.
- Runtime grammar and decision-boundary guardrails for readiness, admission,
  publication, recovery, and presentation changes.
