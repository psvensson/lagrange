# Requirements Document: Harness Versioned CDC Readiness Convergence

## Introduction

This spec defines a convergence-first benchmark contract for `postgres-baseline-
comparison` runs. Recent strict runs on February 26, 2026:

1. `postgres-baseline-3node-20260226T171856Z.report.json`
2. `postgres-baseline-7node-20260226T172048Z.report.json`

failed before load with repeated `discovery_not_ready`, `readiness_missing`, and
`schema_table_missing` signals. The primary issue is not only "probe failure" but
missing proof that each node has converged to the same schema metadata state in
its local CDC-fed system cache.

## Problem Statement

Current strict readiness checks are still too symptom-driven:

1. They do not use one explicit required schema/version watermark as convergence
   truth.
2. They cannot always distinguish "node reachable" from "node has applied
   required metadata version".
3. Failures surface as mixed probe outcomes instead of precise per-node
   convergence gaps.
4. Cluster-size increases (3 to 7 nodes) amplify this ambiguity and brittleness.

## Goals

1. Define one canonical, versioned readiness contract for benchmark pre-load.
2. Gate load start on cluster-wide convergence to required schema/version.
3. Emit causal diagnostics that identify where convergence breaks.
4. Keep one transport/write path model (Message Group + CDC), no fallback paths.

## Non-Goals

1. Replacing the harness/scenario framework.
2. Relaxing strict benchmark gates.
3. Introducing direct non-message-group query/data-plane paths.

## Requirements

### Requirement 1: Required Schema Version Watermark

**User Story:** As a benchmark operator, I need one required schema/version
watermark to validate cluster convergence before load.

#### Acceptance Criteria

1. Benchmark table creation SHALL produce a required schema/version watermark
   for that run.
2. The watermark SHALL originate from the authoritative write/CDC path, not
   from discovery probes.
3. The watermark SHALL be recorded in scenario details for all benchmark runs.
4. Strict mode SHALL fail closed when watermark acquisition fails.

### Requirement 2: Node-Local Applied Version Tracking

**User Story:** As an engineer, I need each node to expose the highest CDC-
applied schema/version it has in local system cache.

#### Acceptance Criteria

1. System cache/CDC path SHALL maintain per-table applied-version watermarks.
2. Applied versions SHALL be monotonic and must not regress.
3. Out-of-order CDC handling SHALL not reduce applied-version state.
4. Applied-version state SHALL be exposed through one read-only API.

### Requirement 3: Canonical Versioned Readiness Predicate

**User Story:** As a maintainer, I need one machine-checkable readiness
predicate that is valid for any cluster size.

#### Acceptance Criteria

1. A node is benchmark-ready only if all required predicates pass:
   `adminQueryable`, `routingReady`, and
   `appliedSchemaVersion >= requiredSchemaVersion`.
2. Strict predicate evaluation SHALL fail closed on missing version data.
3. Readiness reason codes SHALL be machine-readable and stable.
4. Strict gate decisions SHALL use only this canonical predicate.

### Requirement 4: Cluster-Wide Convergence Barrier

**User Story:** As a performance engineer, I need load to start only after all
required load nodes converge to the required version.

#### Acceptance Criteria

1. Strict pre-load gate SHALL require all required nodes to satisfy the
   canonical predicate over a stable window.
2. Barrier timeout SHALL fail with per-node unmet predicates and observed
   versions.
3. Load SHALL never start when any required node lags required version.
4. Barrier status SHALL be emitted in scenario details.

### Requirement 5: Causality Diagnostics Timeline

**User Story:** As a diagnostician, I need event-level convergence traces to
find where replication or readiness stalls.

#### Acceptance Criteria

1. Reports SHALL include convergence timeline events keyed by
   `tableId`, `requiredSchemaVersion`, and `nodeId`.
2. Timeline SHALL include, at minimum:
   `table_create_committed`, `cdc_emitted`, `cdc_received`,
   `cache_applied_version`, `readiness_predicate_pass`.
3. Failure artifacts SHALL include version lag summaries per node.
4. Compare tooling SHALL print convergence deltas when available.

### Requirement 6: Deterministic Reproduction Tests

**User Story:** As a developer, I need deterministic tests that reproduce and
classify convergence failures independently of long benchmark runs.

#### Acceptance Criteria

1. Add integration coverage with four-plus nodes proving successful convergence
   to required schema/version.
2. Add negative integration coverage where one node lags CDC/version and barrier
   fails with explicit version-lag reasons.
3. Add unit tests for applied-version monotonicity and out-of-order handling.

### Requirement 7: Strict Baseline Contract Integration

**User Story:** As an operator, I need strict 3-node and 7-node baselines to
evaluate throughput only after convergence is proven.

#### Acceptance Criteria

1. Strict 3-node and 7-node benchmark profiles SHALL use the versioned barrier.
2. Failure payload SHALL include required and observed versions per node.
3. Root-cause classification SHALL differentiate version lag from other
   discovery failures.
4. Successful runs SHALL include fanout evidence and empty strict failure
   artifact.

### Requirement 8: Single-Path Compliance

**User Story:** As a system owner, I need this hardening to preserve system
guidelines and avoid dual-path drift.

#### Acceptance Criteria

1. Query/data-plane traffic SHALL remain message-group transport only.
2. No alternate readiness truth source SHALL be introduced in strict mode.
3. Existing fallback/probe-only shortcuts SHALL be removed from strict gate
   decisions.

