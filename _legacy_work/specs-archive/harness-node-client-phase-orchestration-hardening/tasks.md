# Implementation Plan: Harness NodeClient and Phase Orchestration Hardening

## Overview

This plan delivers the architecture in strict test-first phases:

1. establish `NodeClient` as the single node-I/O owner,
2. move scenario execution to a deterministic phase orchestrator,
3. unify gate behavior and consistency evaluation,
4. introduce graded assertion outcomes,
5. complete cutover and remove legacy paths.

## Tasks

- [x] 1. Add failing unit tests for `NodeClient` channel routing contract
  - [x] Verify `queryLoad`, `queryControl`, `probeReadiness`, and `fetchControlSnapshot`
    call expected NodeHandle methods.
  - [x] Assert error normalization includes node id, channel, operation, and timeout class.
  - _Requirements: 1.1, 1.2, 1.4, 10.1_

- [x] 2. Implement `NodeClient` base module and public interface
  - [x] Add `test/distributed/harness/node-client.js` with typed channel methods.
  - [x] Remove direct scenario ownership of channel routing behavior.
  - _Requirements: 1.1, 1.2, 10.1, 10.2_

- [x] 3. Add failing tests for channel-specific timeout policies
  - [x] Verify `load` channel timeout is independent from `control` timeout.
  - [x] Verify policy overrides from benchmark config are applied.
  - _Requirements: 2.1, 2.2, 1.5_

- [x] 4. Implement channel policy registry in harness constants
  - [x] Centralize policy defaults and expose resolution helper.
  - [x] Remove duplicated timeout literals from harness modules.
  - _Requirements: 2.1, 2.2, 1.5, 10.3_

- [x] 5. Add failing tests for per-node load bulkheads and breaker isolation
  - [x] Verify one stalled node cannot consume global in-flight budget.
  - [x] Verify control channel breaker state is unaffected by load failures.
  - _Requirements: 2.3, 2.4, 2.5_

- [x] 6. Implement per-channel per-node budget and breaker tracking in `NodeClient`
  - [x] Add budget acquisition/release and channel-scoped breaker state.
  - [x] Emit channel metrics counters.
  - _Requirements: 2.3, 2.4, 2.5, 9.3_

- [x] 7. Add failing unit tests for `PhaseOrchestrator` transition legality
  - [x] Cover valid phase sequence and rejection of illegal transitions.
  - [x] Verify phase start/end events are emitted with timestamps.
  - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [x] 8. Implement `PhaseOrchestrator` core
  - [x] Add `test/distributed/harness/phase-orchestrator.js`.
  - [x] Implement phase result contract and teardown-on-failure behavior.
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 9. Add failing unit tests for shared `GateEngine`
  - [x] Assert all-ready success after stable window.
  - [x] Assert subset fallback on timeout with last-known-good set.
  - [x] Assert reason histogram and included/excluded nodes in result.
  - _Requirements: 4.1, 4.3, 4.4_

- [x] 10. Implement `GateEngine` module
  - [x] Add `test/distributed/harness/gate-engine.js`.
  - [x] Replace ad hoc gate polling loops in scenario logic.
  - _Requirements: 4.1, 4.2, 4.5_

- [x] 11. Add failing unit tests for local control snapshot contract adapter
  - [x] Verify local-only snapshot query path and schema validation.
  - [x] Verify snapshot acquisition never attempts distributed fanout.
  - _Requirements: 5.1, 5.2, 5.5_

- [x] 12. Implement harness snapshot adapter in `NodeClient`
  - [x] Add schema version checks and normalized snapshot errors.
  - _Requirements: 5.1, 5.3, 5.4, 1.4_

- [x] 13. Add failing system tests for local snapshot endpoint/query
  - [x] Validate endpoint/query shape, performance bound, and non-mutating behavior.
  - _Requirements: 5.1, 5.2, 5.4_

- [x] 14. Implement system local snapshot endpoint/query
  - [x] Add runtime implementation and contract tests.
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 15. Add failing tests for `ConsistencyEvaluatorV2` verdict classification
  - [x] Cover `consistent`, `inconsistent`, and `insufficient_evidence` cases.
  - [x] Verify mismatch diff payload format.
  - _Requirements: 6.1, 6.2, 6.5_

- [x] 16. Implement `ConsistencyEvaluatorV2`
  - [x] Add `test/distributed/harness/consistency-evaluator.js`.
  - [x] Integrate snapshot comparison invariants and coverage metrics.
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 17. Add failing tests for hard/soft assertion policy mapping
  - [x] Verify hard assertion classes fail scenario.
  - [x] Verify soft assertion classes downgrade confidence without discarding load metrics.
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 18. Implement assertion policy engine and report mapping
  - [x] Add verification confidence and policy fields to report details.
  - _Requirements: 7.1, 7.3, 7.4, 9.2_

- [x] 19. Add failing tests for post-load drain phase behavior
  - [x] Verify drain gate runs before verify phase.
  - [x] Verify timeout path returns structured reasons and follows policy mapping.
  - _Requirements: 8.1, 8.2, 8.3, 8.5_

- [x] 20. Implement post-load drain phase using `GateEngine`
  - [x] Wire into canonical phase sequence in orchestrator-backed scenarios.
  - _Requirements: 8.1, 8.2, 8.4_

- [x] 21. Add failing scenario tests for orchestrator-based benchmark composition
  - [x] Assert phase sequence and artifact wiring in `postgres-baseline-comparison`.
  - [x] Assert no direct `NodeHandle.query(...)` in scenario phase code.
  - _Requirements: 3.1, 3.2, 10.2_

- [x] 22. Refactor `postgres-baseline-comparison` to orchestrator + `NodeClient`
  - [x] Keep behavior parity while removing bespoke loops.
  - _Requirements: 1.3, 4.5, 10.1, 10.2_

- [x] 23. Add failing tests for observability/traceability fields
  - [x] Verify phase timeline, channel metrics, node inclusion/exclusion, and reason histograms.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 24. Implement observability plumbing across new modules
  - [x] Emit structured playback/report artifacts for phase and channel decisions.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 25. Add regression tests for report compatibility
  - [x] Validate existing report readers continue working with additive fields.
  - _Requirements: 12.3_

- [x] 26. Implement compatibility shims and finalize additive report schema
  - [x] Document new fields and deprecation notes.
  - _Requirements: 12.3, 12.4_

- [x] 27. Remove legacy direct-query and ad hoc gate paths
  - [x] Delete temporary adapters and old polling logic after cutover.
  - [x] Verify single implementation remains per concern.
  - _Requirements: 1.3, 4.5, 10.1, 12.1, 12.2_

- [x] 28. Update benchmark profile configs with explicit channel policies
  - [x] Set defaults for load timeout, per-node load in-flight, and assertion policy.
  - _Requirements: 2.2, 7.5, 12.4_

- [x] 29. Checkpoint: run targeted harness and scenario suites
  - [x] `npx tap test/distributed/harness/__tests__/load-generator.test.js`
  - [x] `npx tap --disable-coverage test/distributed/harness/__tests__/cluster.test.js`
  - [x] `npx tap --disable-coverage test/distributed/harness/__tests__/postgres-baseline-comparison-scenario.test.js`
  - [x] New unit suites for `node-client`, `gate-engine`, `phase-orchestrator`,
    `consistency-evaluator`.
  - _Requirements: 1-11_

- [x] 30. Checkpoint: run distributed pg baseline scenario and compare
  - [x] Run `postgres-baseline-comparison` with updated harness architecture.
  - [x] Compare against prior baseline for throughput, p99, error rate,
    and verification confidence.
  - _Requirements: 6.2, 7.4, 8.1, 9.4, 11.4, 12.5_

- [x] 31. Finalize rollout and rollback notes for the new harness architecture
  - [x] Record cutover sequence, safe rollback points, and acceptance thresholds.
  - _Requirements: 12.4, 12.5_
