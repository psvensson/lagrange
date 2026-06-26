# Implementation Plan: Control-Plane Readiness and Workload Isolation Hardening

## Overview

This plan applies the hardening work in test-first phases:

1. establish lifecycle ownership and probe contract,
2. isolate workload classes and protect control-plane capacity,
3. make join durable and idempotent,
4. add realistic failure-path coverage,
5. roll out safely with feature flags and diagnostics.

## Tasks

- [x] 1. Add failing unit tests for lifecycle state machine invariants
  - Cover legal/illegal transitions and reason propagation.
  - _Requirements: 1.1, 1.2, 1.3, 7.1_

- [x] 2. Implement `LifecycleController` as single state owner
  - Add explicit phase transitions and persisted transition metadata.
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 3. Add failing API tests for probe endpoint semantics
  - Validate `GET /livez`, `GET /startupz`, `GET /readyz`,
    `GET /bootstrap/ready` status and body contract.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4. Implement probe handlers sourced from lifecycle state only
  - Ensure probe handlers remain lightweight and non-mutating.
  - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 5. Add failing unit tests for dependency classification
  - Verify hard dependencies gate readiness and soft dependencies do not.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 6. Implement central hard/soft dependency classifier
  - Route all readiness blockers through one classification owner.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 7. Add failing unit tests for workload class scheduling
  - Assert class-A reservation, fairness, and class-C shedding behavior.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 8. Implement `WorkClassScheduler` core
  - Add class queues, reservation budget, and class-C defer/shed policy.
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 9. Integrate bootstrap/join flows into class-A scheduling
  - Ensure control-plane operations use reserved capacity path.
  - _Requirements: 4.1, 4.2, 7.1, 7.2_

- [x] 10. Integrate logging/observability flush paths into class-C scheduling
  - Ensure class-C saturation cannot block class-A execution.
  - _Requirements: 3.3, 4.2, 4.3, 4.4_

- [x] 11. Add failing tests for durable join session persistence
  - Cover checkpoint replay and duplicate-attempt idempotency.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 12. Implement durable `JoinSessionStore`
  - Persist checkpoints, retry hints, terminal status, and timestamps.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 13. Implement `JoinCoordinator` checkpointed workflow
  - Execute join stages idempotently and resume from durable checkpoint.
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 14. Add failing tests for retry signaling contract in join client
  - Verify timeout/503 retry path, retryAfterMs honoring, and terminal fail-fast.
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 15. Implement join retry contract in `node-joining-service`
  - Add retry classifier, jittered delay, and structured retry diagnostics.
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 16. Add failing integration test for real-listener join under saturation
  - Use real HTTP listener and inject class-C pressure during startup.
  - _Requirements: 9.2, 9.3, 9.4_

- [x] 17. Implement integration fault fixtures
  - Add deterministic fixtures for SQL delay, metadata lag, and class-C flood.
  - _Requirements: 9.2, 9.3, 9.4_

- [x] 18. Add failing harness unit tests for startup gate behavior
  - Assert probe path uses lightweight readiness endpoint and diagnostics shape.
  - _Requirements: 8.3, 9.1_

- [x] 19. Update distributed harness startup gate
  - Probe `GET /bootstrap/ready` and include phase/reason histograms on timeout.
  - _Requirements: 8.3, 9.1_

- [x] 20. Add failing tests for startup/drain sequencing
  - Assert non-ready draining transition and explicit shutdown deadlines.
  - _Requirements: 7.2, 7.3, 7.4_

- [x] 21. Implement startup and graceful drain signaling
  - Wire lifecycle transitions for startup, draining, and lease handoff.
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 22. Add failing tests for lifecycle observability
  - Assert transition events, blocked-duration metrics, and probe status counters.
  - _Requirements: 8.1, 8.2, 8.4_

- [x] 23. Implement observability plumbing
  - Emit lifecycle events and metrics by endpoint/reason/work class.
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 24. Add rollout compatibility tests
  - Verify `POST /bootstrap` compatibility and `/health` migration behavior.
  - _Requirements: 10.2, 10.3_

- [x] 25. Implement feature flags and staged rollout controls
  - Add independent toggles for lifecycle probes, scheduler, and join sessions.
  - _Requirements: 10.1, 10.4_

- [x] 26. Publish rollout/rollback runbook notes for this spec
  - Record canary criteria, expansion gates, and rollback triggers.
  - _Requirements: 10.4_

- [x] 27. Checkpoint: run targeted test suites
  - `npm test -- test/bootstrap/bootstrap-api.test.js`
  - `npm test -- test/bootstrap/node-joining-service.test.js`
  - `npm test -- test/integration/node-join-convergence-slo.integration.test.js`
  - `npm test -- test/distributed/harness/__tests__/cluster.test.js`
  - _Requirements: All_

- [x] 28. Checkpoint: run pg baseline distributed harness scenario
  - Capture startup gate timing, phase history, and reason histograms.
  - Compare against pre-change baseline report.
  - _Requirements: 8.3, 9.1, 9.4_
