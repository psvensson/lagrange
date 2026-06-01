# Canonical Readiness Ladder And Admission Closure

## Status

Closed on 2026-04-20. The canonical readiness ladder cutover is landed:

1. bootstrap readiness probes now emit one canonical readiness-stage ladder
   that advances through publication, acknowledgement, recovery-safe, and
   traffic-ready evidence instead of leaving consumers to infer that story
   from parallel booleans and status fields
2. readiness probe responses now carry canonical publication acknowledgement
   counts from the publication story so stage progression is observable and
   testable
3. harness bootstrap-readiness normalization now preserves the canonical
   readiness stage and rank so diagnostics can consume the same staged story

1. `ControlPlaneReadinessService` now projects priority recovery and admission
   through one explicit readiness/admission projection instead of rebuilding
   meaning from local gate, status, and recovery branches.
2. The touched readiness consumers now reuse that canonical projection instead
   of preserving helper-local fallback meaning.
3. Focused proof and `npm run test:metrics` are green.

Sprint-level scenario confirmation remains downstream and is not a
package-local closure gate.

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
4. Add focused readiness proof for the staged contract and align the touched
   consumer path on that contract.

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
  harness readiness normalization tests, and the sprint-level scenario pass
  after closure

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
- [x] Replace `ControlPlaneReadinessService` local
      `publicationRecoveryGate` interpretation with one explicit
      readiness/admission projection owner.
- [x] Remove helper-local admission branch piles that rebuild staged readiness
      from gate activity flags, publication status, recovery state, and ACK
      counters.
- [x] Cut the touched readiness and admission consumers over to that canonical
      projection without preserving local fallback meaning.
- [x] Strengthen focused proof for staged readiness consumption before any
      broad scenario rerun.

## Residual Closure Inventory

- [x] `/readyz` and `/bootstrap/ready` expose one canonical readiness stage.
- [x] Publication evidence includes acknowledgement counts needed for stage
      progression.
- [x] Harness-facing readiness diagnostics preserve the same stage contract.
- [x] Tail readiness consumers stop interpreting admission through local branch
      piles.
- [x] Package-local closure no longer waits on named harness evidence.

## Validation

1. `test/bootstrap/bootstrap-api.test.js`
2. `test/bootstrap/bootstrap-readiness-ladder.test.js`
3. `test/control-plane/control-plane-readiness-service.test.js`
4. `test/control-plane/canonical-readiness-consumption.test.js`
5. Harness readiness normalization proof
6. `npm run test:metrics`
7. Sprint-level scenario confirmation after the package closes

## Done When

1. The admission boundary exposes one staged readiness answer instead of
   parallel booleans.
2. Publication and priority recovery no longer need caller-local reasoning to
   explain why traffic is still blocked.
3. The touched readiness/admission consumers no longer preserve local branch
   piles beside the staged contract.
4. Harness readiness failures, if any, are evaluated in the sprint-level
   confirmation pass rather than held as this package's only remaining gate.
