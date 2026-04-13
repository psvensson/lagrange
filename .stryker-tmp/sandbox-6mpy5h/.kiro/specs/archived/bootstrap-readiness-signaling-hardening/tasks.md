# Implementation Plan: Bootstrap Readiness Signaling Hardening

## Overview

This plan implements readiness contract hardening in test-first phases:

1. define and verify explicit probe contract,
2. centralize readiness state ownership and hysteresis,
3. align join and harness behavior to the same contract,
4. validate in real-network integration and distributed harness runs,
5. publish Kubernetes/NGINX rollout guidance.

## Tasks

- [x] 1. Add failing unit tests for readiness state owner transitions
  - Add tests for promotion gate (`readyStableWindowMs`) and demotion threshold.
  - Add tests for blocker propagation (`sql_engine_missing`, leader metadata).
  - _Requirements: 1.1, 1.2, 1.3, 5.1, 5.3, 5.4_

- [x] 2. Implement single Readiness_State_Owner component
  - Introduce one owner used by BootstrapAPI and entrypoint wiring.
  - Emit structured transition events with reason codes.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Add failing API tests for probe endpoints
  - Add tests for `GET /livez`, `GET /startupz`, `GET /readyz`,
    `GET /bootstrap/ready`.
  - Assert response body shape and status semantics.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4. Implement probe endpoints in BootstrapAPI
  - Add endpoint constants, handlers, and response helpers.
  - Ensure lightweight handlers have no snapshot assembly/write side effects.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 5. Add failing tests for `POST /bootstrap` not-ready retry hints
  - Assert `503` responses include code, phase/reasons, and retry guidance.
  - Assert payload compatibility for existing error consumers.
  - _Requirements: 3.1, 3.3, 3.4, 9.1_

- [x] 6. Implement bootstrap operation contract hardening
  - Return retry hints from not-ready responses.
  - Keep operation endpoint idempotency and compatibility behavior.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 9.1_

- [x] 7. Add failing join retry behavior tests
  - Verify join retries on timeout/503/bootstrap-not-ready codes.
  - Verify join honors retry hints and jittered backoff.
  - Verify terminal failure on validation/conflict classes.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 8. Implement join retry contract in NodeJoiningService
  - Extend retry classifier and backoff logic to consume retry hints.
  - Improve retry diagnostics (attempt, elapsed, last code, next delay).
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 9. Add failing tests for startup ordering gates
  - Assert readiness stays false until SQL engine and required dependencies
    are complete.
  - Assert sustained success required for readiness promotion.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 10. Wire entrypoint startup signals into readiness owner
  - Update seed startup ordering to publish dependency milestones to owner.
  - Keep Bootstrap API early-start but readiness false until fully safe.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 11. Add failing distributed harness test for startup gate probe path
  - Assert harness uses lightweight readiness endpoint, not `POST /bootstrap`.
  - Assert timeout diagnostics include readiness reasons/histograms.
  - _Requirements: 6.1, 6.4_

- [x] 12. Update distributed harness startup gate
  - Switch probe to `GET /bootstrap/ready` (or `/readyz` join scope).
  - Keep stable window checks and unified periodic stage diagnostics.
  - _Requirements: 6.1, 6.4_

- [x] 13. Add real-network integration join test
  - Add a join test variant with real HTTP listener and no in-proc inject.
  - Assert readiness transition then successful join.
  - _Requirements: 6.2, 6.3_

- [x] 14. Add observability tests for readiness transitions
  - Assert transition events include old/new state and reasons.
  - Assert metrics counters/histograms are emitted and incremented correctly.
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 15. Implement readiness observability plumbing
  - Add structured logs/events for transitions and blocked durations.
  - Add probe status counters by endpoint/status class.
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 16. Publish Kubernetes and NGINX deployment profile documentation
  - Add probe mapping and baseline thresholds.
  - Add NGINX retry guidance for non-idempotent bootstrap operations.
  - Add migration guidance for existing `/health` consumers.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 9.2, 9.3, 9.4_

- [x] 17. Compatibility checkpoint tests
  - Verify legacy `/health` remains available during migration window.
  - Verify existing join client behavior remains functional.
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 18. Checkpoint: run targeted test suites
  - `npm test -- test/bootstrap/bootstrap-api.test.js`
  - `npm test -- test/bootstrap/node-joining-service.test.js`
  - `npm test -- test/distributed/harness/__tests__/cluster.test.js`
  - `npm test -- test/integration/node-join-convergence-slo.integration.test.js`
  - _Requirements: All_

- [x] 19. Checkpoint: run distributed baseline harness
  - Run pg baseline scenario with updated readiness gate and capture report.
  - Compare failure mode and diagnostics versus prior baseline.
  - _Requirements: 6.1, 6.4, 8.3, 8.4_

- [x] 20. Final checkpoint: document rollout and rollback
  - Add rollout checklist and rollback triggers to spec notes.
  - Record readiness SLO baseline after rollout candidate.
  - _Requirements: 7.4, 9.4_
