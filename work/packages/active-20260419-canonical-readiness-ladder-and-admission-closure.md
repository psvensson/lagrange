# Canonical Readiness Ladder And Admission Closure

## Status

Active on 2026-04-19. The first slice is landed:

1. bootstrap readiness probes now emit one canonical readiness-stage ladder
   that advances through publication, acknowledgement, recovery-safe, and
   traffic-ready evidence instead of leaving consumers to infer that story
   from parallel booleans and status fields
2. readiness probe responses now carry canonical publication acknowledgement
   counts from the publication story so stage progression is observable and
   testable
3. harness bootstrap-readiness normalization now preserves the canonical
   readiness stage and rank so diagnostics can consume the same staged story

The remaining work is to push the same ladder through the broader readiness
owner surfaces and align harness admission on that one staged contract.

## Why

The latest harness failure is not random. It is one admission-grammar gap:
`/readyz`, startup recovery, publication status, and priority recovery still
describe the same lifecycle through adjacent but non-identical vocabularies.

This package defines one canonical ladder for traffic admission so the system
can answer "how ready is this node?" with one staged outcome instead of a
boolean plus several partially overlapping details.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Define one canonical readiness ladder for bootstrap and traffic admission:
   `alive -> published -> acked -> recovery_safe -> traffic_ready`
2. Emit that ladder through the bootstrap readiness owner and probe surfaces.
3. Reuse one publication-story evidence contract for stage progression instead
   of caller-local interpretation of `publicationStatus`, ACK sets, and
   recovery booleans.
4. Add focused readiness and harness-adjacent proof for the staged contract.

## Out Of Scope

1. Partition leader convergence redesign.
2. Router retry/quarantine redesign outside readiness consumers.
3. Replica workflow durable phase-model simplification.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`
3. `seed-restart-under-load`

## Invariants

1. Readiness consumers must not infer traffic admission from booleans alone
   when publication or recovery is still incomplete.
2. Publication acknowledgement evidence must advance through one staged
   contract, not through local status-string interpretation.
3. `traffic_ready` must remain unreachable while priority recovery is active.

## Shared Boundary Contract

- Semantic owner: bootstrap readiness admission projection
- Canonical contract shape / vocabulary: one `readinessStage`,
  `readinessStageRank`, plus canonical publication evidence and existing
  readiness reasons
- Allowed consumers: `BootstrapAPI`, harness readiness normalization, startup
  diagnostics, readiness triage
- Prohibited reinterpretations: inferring admission from `ready === true`
  fallbacks alone, inferring publication acknowledgement from raw status
  strings without the shared stage contract
- Primary diagnostics / proof surfaces: focused bootstrap readiness tests,
  harness readiness normalization tests, named harness evidence

## Detection / Analysis Tasks

- [x] Trace the current harness failure to readiness/publication admission
      mismatch instead of pure replica-operation visibility.
- [x] Identify the missing staged contract between publication and traffic
      admission.

## Implementation Tasks

- [x] Add a canonical readiness ladder helper and emit it from bootstrap
      readiness probe responses.
- [x] Surface publication acknowledgement counts alongside the ladder.
- [x] Reuse the same ladder in harness normalization.
- [ ] Align admission analysis on the canonical stage contract.
- [ ] Align remaining readiness consumers on the canonical stage contract.

## Residual Closure Inventory

- [x] `/readyz` and `/bootstrap/ready` expose one canonical readiness stage.
- [x] Publication evidence includes acknowledgement counts needed for stage
      progression.
- [x] Harness-facing readiness diagnostics preserve the same stage contract.
- [ ] Tail readiness consumers stop interpreting admission through local branch
      piles.
- [ ] Named harness evidence is rechecked against the staged contract.

## Validation

1. `test/bootstrap/bootstrap-api.test.js`
2. `test/bootstrap/bootstrap-readiness-ladder.test.js`
3. Harness readiness normalization proof
4. `npm run test:metrics`

## Done When

1. The admission boundary exposes one staged readiness answer instead of
   parallel booleans.
2. Publication and priority recovery no longer need caller-local reasoning to
   explain why traffic is still blocked.
3. Harness readiness failures, if any, classify to one stage transition and
   one blocker story.
