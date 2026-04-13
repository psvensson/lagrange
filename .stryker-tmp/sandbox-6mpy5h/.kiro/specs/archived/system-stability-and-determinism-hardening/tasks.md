# Implementation Plan: System Stability and Determinism Hardening

## Overview

This plan executes from correctness ownership to deterministic testing and only
then to benchmark validation. Timeouts and long waits are treated as bugs to
remove, not behaviors to normalize.

## S1 - Ownership and Readiness Closure

- [x] 1. Add failing readiness tests for unstable local replicas
  - [x] Reproduce a node whose target local replica is `candidate`.
  - [x] Assert shared readiness evaluation marks the node not ready with a
    stable reason code.
  - _Requirements: 1.2, 1.3, 2.3_

- [x] 2. Implement shared readiness evaluator closure
  - [x] Route control snapshots, discovery, and benchmark preflight through one
    readiness evaluator.
  - [x] Remove any remaining readiness branches that infer stability from
    convenience projections alone.
  - _Requirements: 1.1, 1.2, 1.4_

- [x] 3. Add failing tests for owner-row vs replica-row disagreement
  - [x] Reproduce leader mismatch between owner rows and `services` rows.
  - [x] Assert diagnostics report inconsistency instead of choosing an
    alternate truth source.
  - _Requirements: 1.1, 1.4_

- [x] 4. Implement canonical inconsistency reporting
  - [x] Normalize inconsistency reason codes across admin and harness outputs.
  - [x] Keep `architecture.md` as the canonical owner reference.
  - _Requirements: 1.4, 1.5, 6.1_

## S2 - Explicit Lifecycle and Guarded Repair

- [x] 5. Define explicit lifecycle state models
  - [x] Introduce or finalize node and replica lifecycle enums and legal
    transitions.
  - [x] Document which states are load-ready vs repair-only.
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 6. Add failing tests for illegal lifecycle transitions
  - [x] Reproduce contradictory readiness and role combinations.
  - [x] Assert fail-fast diagnostics with stable codes.
  - _Requirements: 2.4, 2.5_

- [x] 7. Convert remaining stale repair paths to guarded mutations
  - [x] Audit lease, heartbeat, readiness, and replica repair loops.
  - [x] Replace stale overwrite updates with observed-state guarded writes.
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 8. Add regression tests for stale repair races
  - [x] Cover stale disconnect, stale leader overwrite, and stale readiness
    demotion classes.
  - _Requirements: 3.2, 3.5_

## S3 - Shared Propagation and Time Abstractions

- [x] 9. Collapse duplicated propagation and subscription lists
  - [x] Audit bootstrap, join, CDC, and cache hydration code for parallel
    system-table lists.
  - [x] Route them through one canonical declaration.
  - _Requirements: 4.2, 4.3_

- [x] 10. Add failing tests for list drift and dropped pending updates
  - [x] Reproduce omitted table subscription and stranded pending owner-write
    scenarios.
  - _Requirements: 4.1, 4.5_

- [x] 11. Finish shared owner-row mutation helper adoption
  - [x] Migrate remaining authoritative write sites to the shared helper.
  - [x] Remove duplicated per-service cache-visibility retry logic.
  - _Requirements: 4.1, 4.4_

- [x] 12. Introduce shared clock and scheduler seams
  - [x] Inject time into retries, poll loops, readiness windows, and leases.
  - [x] Distinguish no-progress vs absolute timeouts in diagnostics.
  - _Requirements: 5.1, 5.3_

- [x] 13. Virtualize remaining slow targeted harness tests
  - [x] Remove unnecessary real waits from readiness, discovery, and benchmark
    control-path tests.
  - _Requirements: 5.2, 5.4, 5.5_

## S4 - Invariant Pipeline

- [x] 14. Define the invariant catalog
  - [x] Finalize invariant IDs, severity levels, and payload shape.
  - _Requirements: 6.1, 6.2_

- [x] 15. Emit runtime invariant events
  - [x] Add structured invariant emission for leadership, readiness, lease, and
    propagation correctness.
  - _Requirements: 6.1, 6.2_

- [x] 16. Wire invariant handling into harness reports and gates
  - [x] Serialize invariant breaches in reports.
  - [x] Fail strict benchmark runs on hard invariant breaches before throughput
    interpretation.
  - _Requirements: 6.3, 6.4, 6.5_

## S5 - Deterministic Convergence Layer

- [x] 17. Build the convergence test harness
  - [x] Add deterministic scheduling for heartbeat, CDC, and stale-read races.
  - [x] Emit machine-readable failure artifacts.
  - _Requirements: 7.1, 7.2, 7.4_

- [x] 18. Backfill current baseline-discovered bugs into convergence tests
  - [x] Add cases for stale lease sweep overwrite.
  - [x] Add cases for `candidate` replica readiness admission.
  - [x] Add cases for dropped or delayed owner-row convergence.
  - _Requirements: 7.3, 7.5_

## S6 - Benchmark Contract Validation

- [x] 19. Split correctness and performance outputs in baseline reports
  - [x] Prevent broken runs from being presented as throughput results.
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 20. Add benchmark runbook updates
  - [x] Document the targeted checks required before running 3-node or 7-node
    baselines.
  - _Requirements: 8.5_

- [ ] 21. Run checkpoint verification
  - [x] Run targeted readiness, lifecycle, convergence, and harness suites.
  - [x] Run a strict 3-node baseline.
  - [ ] Run a strict 7-node baseline only after lower-layer checks pass.
  - _Requirements: 1-8_

- [ ] 22. Record residual risks and close the spec
  - [ ] Capture stability deltas, remaining bottlenecks, and follow-on work.
  - _Requirements: 1-8_
