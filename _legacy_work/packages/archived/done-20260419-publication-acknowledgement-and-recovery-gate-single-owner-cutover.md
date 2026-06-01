# Publication Acknowledgement And Recovery-Gate Single-Owner Cutover

## Status

Closed on 2026-04-20. The first cutover slice is landed:

1. publication acknowledgement closure and priority spread closure now route
   through one shared `publicationRecoveryGate` owner snapshot
2. readiness, startup-authority, recovery-protocol, and harness closure
   diagnostics now reuse that one owner answer instead of rebuilding adjacent
   ACK and spread stories locally
3. bootstrap readiness probes now surface the shared gate state alongside the
   staged readiness ladder so publication closure is observable and testable

Focused proof and repo metrics are green. Sprint-level scenario confirmation
remains downstream and is not a package-local closure gate.

## Why

Publication status, ACK closure, and priority recovery are still computed
through adjacent helpers and owner paths. That split is exactly what makes the
current harness failure feel surprising: the system knows publication is still
`ACK_PENDING`, but readiness and admission do not yet consume one canonical
owner answer for that fact.

This package makes publication acknowledgement and recovery gating one
semantic owner story.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Define one semantic owner for publication acknowledgement closure and
   priority recovery gate state.
2. Remove remaining local publication-status interpretation from readiness,
   startup, and harness-facing diagnostics.
3. Expose one canonical gate outcome with reasons, retry hint, and
   acknowledgement witness.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`

## Invariants

1. `ACK_PENDING` must not be silently promoted to traffic-admissible.
2. Publication acknowledgement closure and priority spread closure must share
   one owner answer.
3. Missing acknowledgement evidence must defer with typed reasons, not degrade
   into permissive readiness.

## Residual Closure Inventory

- [x] One owner computes publication acknowledgement and recovery-gate state.
- [x] Readiness/startup/harness consumers reuse that one answer.
- [x] Legacy local publication-status branches are deleted from the touched
      readiness/startup/harness surfaces.
- [x] Focused proof is green.
- [x] Package-local closure no longer waits on named harness evidence.
