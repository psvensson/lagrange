# Implementation Plan: Latency-Aware Topology

## Overview

Implement latency groups in phased order:

1. metadata + cache readiness
2. measurement + assignment lifecycle
3. grouped CDC propagation

Work must preserve single-owner boundaries and avoid dual execution paths.

## Tasks

- [x] 1. Define latency topology constants and config keys
  - Add topology constants and typed config keys for thresholds, intervals,
    jitter, timeout, retries, smoothing, and propagation mode.
  - Add validation rules for all new config values.
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 2. Add system metadata schema for latency groups
  - Extend `nodes` schema with latency assignment fields.
  - Add `latency_groups` schema.
  - Add `inter_group_latencies` schema.
  - Add partition/replica bootstrap constants for new tables.
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. Wire latency metadata through cache and key descriptors
  - Add primary key descriptors for new tables.
  - Ensure SystemTableCache and SQLiteSystemCache support new tables.
  - Ensure default hydration/subscription list treatment is explicit and
    documented.
  - _Requirements: 1.4, 1.5_

- [x] 4. Implement `LatencyMeasurementService` owner
  - Implement ping/pong RTT measurement over MessageRouter.
  - Add sample validation, timeout, retry, and smoothing logic.
  - Persist/emit inter-group sample updates through SQL/CDC path.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5. Implement `GroupSelectionService` owner
  - Implement deterministic representative selection.
  - Implement deterministic coordinator selection.
  - Provide stable tie-breaking and failover behavior.
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 6. Implement `LatencyGroupManager` owner
  - Implement initial assignment logic (join nearest or create group).
  - Implement periodic recalculation with jitter.
  - Persist assignment and group lifecycle updates via SQL/CDC.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 7. Implement `LatencyTreeService` owner
  - Build local in-memory group tree from inter-group latency metadata.
  - Expose neighbor/routing order APIs for propagation/routing consumers.
  - Add recomputation triggers on topology metadata changes.
  - _Requirements: 6.3, 8.1, 8.2, 8.3_

- [x] 8. Integrate bootstrap and joining flows
  - Include latency group hints in bootstrap response payload.
  - Trigger assignment lifecycle after join connectivity is ready.
  - Preserve existing join readiness semantics while assignment finalizes.
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 9. Implement `CDCGroupPropagationService` owner
  - Add grouped propagation mode with one coordinator per target group.
  - Delegate final cache apply path to existing message-group CDC owner.
  - Add explicit safe fallback mode when topology data is incomplete.
  - _Requirements: 6.1, 6.2, 6.4, 6.5, 11.3_

- [x] 10. Integrate routing and placement hints
  - Add optional same-group preference in eligible routing decisions.
  - Add optional locality/diversity topology signals for placement heuristics.
  - Ensure quorum/correctness constraints remain dominant.
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 11. Add observability and admin diagnostics
  - Add info/debug logs for assignment, measurements, and failovers.
  - Add topology metrics and counters.
  - Expose admin query/view helpers for latency topology tables.
  - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 12. Add ownership contract tests
  - Add tests asserting single-owner paths for measurement, assignment, and
    propagation.
  - Add static checks preventing duplicate topology caches/owners.
  - _Requirements: 11.1, 11.2, 11.4, 11.5_

- [x] 13. Add functional tests
  - Unit tests for measurement, selection, assignment, and tree logic.
  - Property tests for deterministic convergence and assignment stability.
  - Integration tests for seed/join assignment and coordinator failover.
  - Integration tests for grouped propagation correctness and fallback.
  - _Requirements: 12.1, 12.2, 12.3, 12.4_

- [x] 14. Update architecture and user documentation
  - Update `.kiro/steering/architecture.md` with latency topology owner map and
    data flow.
  - Add admin/operator docs for configuration and diagnostics.
  - _Requirements: 10.3, 10.4_

- [x] 15. Final verification checkpoint
  - Run targeted bootstrap/join/cache/CDC/transport/rebalancer tests.
  - Verify no dual-path implementation remains for latency topology concerns.
  - _Requirements: 11.5, 12.1, 12.2, 12.3, 12.4_

## Notes

- Roll out grouped propagation only after metadata and assignment phases are
  verified in integration tests.
- If temporary adapters are needed during migration, they must delegate to one
  owner and contain no duplicate business logic.
