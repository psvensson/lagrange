# Requirements Document: Harness Benchmark Mode Simplification and Unification

## Introduction

This spec defines a reset of the benchmark hardening strategy: reduce moving
parts, collapse duplicate paths, and enforce one deterministic benchmark
execution mode.

The current system has many individually reasonable safeguards, but in
combination they create brittle behavior, hard-to-interpret failures, and poor
signal quality from 3-node and 7-node baseline runs.

## Problem Statement

Current failures are dominated by path inconsistency rather than one isolated
bug:

1. Different readiness and routing paths disagree about node readiness.
2. Nodes can be reachable by admin API but still fail benchmark-table
   queryability checks.
3. Rebalancing activity continues to alter topology during benchmark warmup and
   load windows.
4. Multiple fallback paths create ambiguous failure causes and noisy reports.
5. Strict benchmark profiles still fail before load, blocking throughput
   comparisons with Postgres.

## Goals

1. Establish one canonical benchmark mode with one control/readiness path.
2. Make readiness binary and deterministic across required load nodes.
3. Stabilize topology during benchmark windows.
4. Produce failure artifacts with precise, machine-readable root causes.
5. Enable repeatable 3-node and 7-node baseline runs that reach load phase and
   can be compared to Postgres.

## Non-Goals

1. Replacing the full harness architecture.
2. Redesigning query language or transaction semantics.
3. Supporting multiple benchmark behavior variants long-term.

## Requirements

### Requirement 1: Canonical Benchmark Mode Path

**User Story:** As a maintainer, I need one benchmark path so failures come
from one source of truth.

#### Acceptance Criteria

1. Benchmark mode SHALL use one canonical readiness/routing source.
2. Duplicate fallback paths in pre-load gating SHALL be removed or disabled in
   benchmark mode.
3. Benchmark mode SHALL fail closed when canonical data is missing or invalid.
4. Reports SHALL declare the canonical path and mode used.

### Requirement 2: Unified Node Readiness Contract

**User Story:** As an operator, I need a clear yes/no readiness answer for each
required load node.

#### Acceptance Criteria

1. Readiness SHALL include routing readiness, schema readiness for benchmark
   table, and topology readiness.
2. Readiness evaluation SHALL return a stable per-node reason list.
3. Load SHALL not start unless all required benchmark load nodes are ready for
   a stable window.
4. Timeouts SHALL fail with structured per-node readiness evidence.

### Requirement 3: Deterministic Routing and Partition Visibility

**User Story:** As a reliability engineer, I need routing behavior that does
not depend on local replica presence.

#### Acceptance Criteria

1. Query/data-plane routing SHALL not depend on local-only system-table
   shortcuts.
2. Nodes without local table replicas SHALL still resolve benchmark-table
   routing through canonical metadata.
3. Integration tests SHALL verify access from nodes without local table
   partitions.
4. Any violation SHALL fail tests and benchmark runs.

### Requirement 4: Benchmark Topology Stability Policy

**User Story:** As a performance engineer, I need topology stability during
benchmark execution.

#### Acceptance Criteria

1. Benchmark mode SHALL freeze non-critical rebalancing during warmup and load.
2. Only safety-critical operations SHALL bypass freeze.
3. Freeze/bypass decisions SHALL be recorded in report details.
4. Sustained critical rebalancing signals SHALL fail strict benchmark runs.

### Requirement 5: Single Strict Benchmark Profile Contract

**User Story:** As a benchmark operator, I need one strict profile definition
to reduce configuration drift.

#### Acceptance Criteria

1. 3-node and 7-node benchmark configs SHALL inherit from one strict default
   contract.
2. Required load fanout SHALL default to cluster size for strict profiles.
3. Any opt-out SHALL be explicit and reported as non-strict.
4. Compare tooling SHALL print strict/non-strict mode and fanout contract.

### Requirement 6: Unified Failure Artifact Contract

**User Story:** As a diagnostician, I need failure output that is concise and
actionable.

#### Acceptance Criteria

1. Benchmark failures SHALL include one machine-readable root-cause class.
2. Failure payload SHALL include phase, impacted node IDs, and top reasons.
3. The compare script SHALL surface root-cause classes and count deltas.
4. Failure payload schema SHALL be validated by scenario tests.

### Requirement 7: Focused Test Matrix for the Canonical Path

**User Story:** As a maintainer, I need fewer but stronger tests aligned with
the canonical benchmark path.

#### Acceptance Criteria

1. Add unit tests for canonical readiness evaluation and fail-closed behavior.
2. Add integration tests for 3-node and 7-node canonical readiness and routing.
3. Add integration test covering node without local table partition replica.
4. Add harness scenario tests that prove load starts only on full required
   fanout.

### Requirement 8: Baseline Completion Gate

**User Story:** As a release owner, I need objective completion criteria before
continuing throughput tuning.

#### Acceptance Criteria

1. 3-node strict baseline SHALL complete load phase with full required fanout.
2. 7-node strict baseline SHALL complete load phase with full required fanout.
3. Post-load comparison SHALL report throughput and p99 ratios for both runs.
4. Spec SHALL remain open until these completion gates are met.

