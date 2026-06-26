# Requirements Document: Harness Baseline Root Cause Observability Hardening

## Introduction

Baseline distributed harness runs have repeatedly failed before load starts
(`ops_per_sec=0`) with strict preflight/pre-load gates failing on downstream
symptoms (for example: empty service discovery, schema/version unknown, routing
not ready).

This spec focuses on development working conditions: make these failures fast
to attribute to one upstream hop (leadership -> CDC emit -> CDC delivery -> cache
apply -> discovery -> strict gate), with one compact artifact and stable reason
codes, so engineers can fix the real bug instead of grepping noisy logs.

## Problem Statement

Observed failure pattern (example from February 27, 2026):

1. 3-node and 7-node baselines fail before load starts at strict preflight /
   pre-load gating.
2. Service discovery remains empty for required load nodes, so strict gating
   cannot admit a full fanout and fails closed.
3. Control-plane logs show intermittent transport reconnecting, CDC retries, and
   endpoint partition instability; however, these signals are not causally
   stitched into a single root-cause narrative.

Today’s tooling makes it easy to see the final gate result, but hard to see
which hop first broke and why.

## Goals

1. Produce a single, structured “root-cause bundle” on strict gate failure that
   contains all critical-path state needed for attribution.
2. Enable cross-node correlation for control-plane mutations (services/endpoints)
   across write, CDC forwarding, cache apply, and discovery reads.
3. Add assertable invariants for control-plane convergence so the harness can
   fail with an upstream cause instead of a downstream symptom.
4. Add targeted, fast integration tests that isolate each hop in the critical
   path without requiring full benchmark execution.
5. Standardize failure taxonomy codes so compare tooling can group failures by
   root cause.
6. Add a deterministic debug mode to reproduce failures with stable config and
   sampling.

## Non-Goals

1. Redesigning Raft, message groups, CDC, or SQL semantics.
2. Introducing new observability stacks (Prometheus/Otel exporters, etc.).
3. Making strict mode “pass anyway” when the control plane is unhealthy; strict
   mode continues to fail closed.

## Requirements

### Requirement 1: Preflight Critical-Path Snapshot

**User Story:** As an engineer, I need a compact per-node snapshot of the strict
preflight critical path so I can identify the first broken hop without log
archaeology.

#### Acceptance Criteria

1. The harness SHALL capture a `PreflightCriticalPathSnapshot` for each required
   node when strict preflight/pre-load gating fails.
2. The snapshot SHALL include, at minimum:
   - node identity (`nodeId`, `address`) and capture timestamp
   - message-router connectivity summary to other nodes (connected / reconnecting
     / disconnected counts)
   - leadership/health summary for control-plane partitions required for service
     discovery (`nodes`, `services`, `node_endpoints`, `service_endpoints`)
   - CDC pipeline health summary (buffer depth, retry counters, last error class)
   - system-cache freshness/watermark summary relevant to readiness (applied
     schema watermark and last-applied time)
   - row-count summaries for `services` (filtered to `sys-postgres-wire`),
     `node_endpoints`, and `service_endpoints`
   - strict discovery result summary (selected node ids and exclusion reasons)
3. Snapshot collection SHALL be bounded (one request per node per failure) and
   MUST NOT introduce new caches or polling loops outside existing harness
   preflight.
4. Missing snapshot data SHALL fail closed but SHALL be recorded with stable
   machine-readable missing-data reasons.

### Requirement 2: Causal Correlation IDs for Control-Plane Mutations

**User Story:** As a diagnostician, I need to correlate control-plane mutations
across write -> CDC -> cache apply -> discovery so I can see where propagation
breaks.

#### Acceptance Criteria

1. Mutations to control-plane rows that drive readiness and discovery (services
   and endpoint rows) SHALL carry a `causeId` for correlation in logs and
   diagnostics.
2. When an existing operation identifier already exists (for example, assignment
   token/operation id), it SHALL be used as the `causeId` instead of introducing
   parallel identifiers.
3. `causeId` MUST be present in:
   - the initiating write log/telemetry record
   - CDC event forwarding logs/telemetry records
   - system-cache apply logs/telemetry records
4. The harness root-cause bundle SHALL surface the last-seen `causeId` per
   relevant table when available.

### Requirement 3: Invariant-Based Preflight Attribution

**User Story:** As a maintainer, I want strict preflight to fail with an
upstream invariant violation (leadership/CDC/cache/discovery) instead of a
downstream symptom like “discovery empty”.

#### Acceptance Criteria

1. Strict preflight SHALL evaluate a fixed set of invariants derived from the
   critical-path snapshot.
2. Invariant violations SHALL map to stable root-cause taxonomy codes (see
   Requirement 6).
3. When strict preflight fails, the root-cause bundle SHALL include:
   - invariant results (pass/fail with details)
   - the selected dominant invariant violation (if any)

### Requirement 4: Root-Cause Bundle on Strict Gate Failure

**User Story:** As a developer, I need one artifact I can attach to an issue
that explains the failure without re-running the scenario.

#### Acceptance Criteria

1. Every strict gate failure SHALL include a `rootCauseBundle` section in the
   report output.
2. `rootCauseBundle` SHALL include:
   - stable `rootCauseCode` and `rootCauseClass`
   - per-node `PreflightCriticalPathSnapshot`
   - invariant results and dominant invariant violation
   - pointers to playback artifacts (if present) needed to reproduce timeline
3. `rootCauseBundle` MUST be stable and machine-readable; it SHALL avoid
   embedding unbounded logs.

### Requirement 5: Targeted Hop-Level Integration Tests

**User Story:** As a maintainer, I need fast tests that isolate each hop in the
critical path so regressions can be detected without running full baselines.

#### Acceptance Criteria

1. Add integration tests that validate, independently:
   - service registration produces `services` + `service_endpoints` rows
   - CDC forwarding results in cache-applied watermarks advancing
   - discovery returns expected `sys-postgres-wire` endpoints once rows exist
2. Each integration test SHALL complete within 30 seconds.
3. Tests SHALL assert on stable taxonomy codes and bundle fields, not brittle
   free-form log strings.

### Requirement 6: Stable Root-Cause Taxonomy Codes

**User Story:** As an operator, I need failures grouped by root cause so
baseline comparisons and regressions are obvious.

#### Acceptance Criteria

1. Strict preflight/pre-load failures SHALL map to a stable set of
   `ROOT_CAUSE_CODE` values owned by one constants module.
2. Compare tooling SHALL print root-cause code/class and key critical-path
   deltas for latest-vs-prior runs when present.

### Requirement 7: Deterministic Debug Mode

**User Story:** As an engineer, I need a deterministic mode so reproductions are
stable and comparable across runs and machines.

#### Acceptance Criteria

1. Distributed harness runs SHALL support a deterministic debug mode flag in
   config and CLI.
2. Deterministic mode SHALL:
   - pin a fixed random seed
   - pin preflight sampling intervals
   - record the seed and deterministic settings in report metadata
3. Deterministic mode SHALL be opt-in and MUST NOT change default benchmark
   behavior.

### Requirement 8: Single Owner for Readiness, Taxonomy, and Formatting

**User Story:** As a maintainer, I need one source of truth for readiness
reasons and diagnostics formatting so signals don’t drift across components.

#### Acceptance Criteria

1. Root-cause taxonomy codes SHALL be owned by exactly one constants module.
2. Root-cause bundle formatting SHALL be owned by exactly one harness module.
3. Strict discovery exclusion reasons SHALL be derived from one shared helper so
   diagnostics and gating cannot disagree.

