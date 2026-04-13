# Requirements Document

## Introduction

This document defines requirements to harden startup and join readiness
signaling for distributed and production-like environments. The current join
path is robust in in-process integration tests but not yet robust under full
networked runtime conditions (distributed harness, Kubernetes, reverse proxies).

The objective is to provide one explicit readiness contract that is:

1. cheap to probe,
2. consistent across harness and production,
3. monotonic enough to avoid startup flapping,
4. actionable for retries and diagnostics.

## Problem Statement

Current behavior shows a mismatch:

1. Integration tests can bypass real network/listener timing via in-process
   Fastify injection and therefore do not exercise full readiness behavior.
2. Distributed harness probes real runtime surfaces and exposes transient
   readiness (`200` once, then `503`/timeout) before join actually stabilizes.
3. `POST /bootstrap` is currently used for readiness probing in harness, but it
   is an operational endpoint and can be expensive or side-effectful in failure
   analysis contexts.
4. There is no single, explicit external contract for Kubernetes/NGINX probe
   configuration tied to startup/join safety semantics.

## Glossary

- **Liveness_Endpoint**: Probe endpoint that answers process alive/dead only.
- **Startup_Endpoint**: Probe endpoint that answers initial bootstrap completion.
- **Readiness_Endpoint**: Probe endpoint that answers traffic safety for join
  and admin APIs.
- **Join_Readiness**: Condition where seed can safely accept joining nodes
  without transient routing/leader metadata gaps.
- **Readiness_State_Owner**: Single component that computes and exposes
  readiness state and reasons.
- **Probe_Hysteresis**: Stability policy requiring sustained success before
  promoting readiness and bounded failure criteria before demotion.
- **Retry_Hint**: Machine-readable retry guidance (`Retry-After` and body fields).

## Requirements

### Requirement 1: Single Readiness State Owner

**User Story:** As an operator, I want one authoritative readiness model, so
that bootstrap, join, and probes cannot disagree.

#### Acceptance Criteria

1. THE system SHALL have one Readiness_State_Owner responsible for startup and
   readiness status exposed over HTTP.
2. WHEN readiness is false THEN the owner SHALL expose machine-readable reason
   codes and blocking dependencies.
3. WHEN readiness transitions occur THEN they SHALL be emitted as structured
   events with old state, new state, and reason.
4. THE system SHALL NOT maintain parallel readiness computations in unrelated
   components.

### Requirement 2: Explicit Probe Endpoint Contract

**User Story:** As a platform engineer, I want dedicated probe endpoints, so
that health checks are low-cost and semantically correct.

#### Acceptance Criteria

1. THE seed runtime SHALL expose `GET /livez` for process liveness.
2. THE seed runtime SHALL expose `GET /startupz` for bootstrap completion.
3. THE seed runtime SHALL expose `GET /readyz` for join/admin traffic safety.
4. THE seed runtime SHALL expose a lightweight join-specific readiness endpoint
   (`GET /bootstrap/ready` or equivalent ready scope) with no snapshot building
   and no mutating side effects.
5. Probe endpoints SHALL return machine-readable body fields:
   `ready`, `state`, `reasons`, `timestamp`, and optional `retryAfterMs`.

### Requirement 3: Operational Bootstrap Endpoint Semantics

**User Story:** As a joining node owner, I want `POST /bootstrap` to behave as
an operation endpoint, so retries are safe and predictable.

#### Acceptance Criteria

1. WHEN `POST /bootstrap` is called before readiness THEN it SHALL return `503`
   with explicit error code and retry guidance.
2. `POST /bootstrap` SHALL remain idempotent by joining `nodeId` for repeated
   client retries.
3. `POST /bootstrap` readiness failure responses SHALL avoid expensive response
   assembly beyond diagnostics.
4. THE system SHALL preserve compatibility for existing clients that parse
   current bootstrap error payload structure.

### Requirement 4: Join Client Retry and Backoff Contract

**User Story:** As a joining node, I want retry behavior tied to readiness
signals, so transient startup conditions do not fail joins prematurely.

#### Acceptance Criteria

1. Joining nodes SHALL treat timeout, `503`, and declared bootstrap-not-ready
   codes as retryable within configured budget.
2. Joining nodes SHALL respect `Retry-After`/`retryAfterMs` when present and
   apply jittered backoff.
3. Joining nodes SHALL treat validation/conflict errors as terminal and SHALL
   not retry them.
4. Retry logs SHALL include attempt count, elapsed time, last code, and next
   delay.

### Requirement 5: Startup Ordering and Readiness Gating

**User Story:** As a maintainer, I want readiness to reflect true runtime
dependencies, so probes do not signal healthy before join can work.

#### Acceptance Criteria

1. Readiness SHALL remain false until bootstrap phase completion, leader
   metadata readiness, and required runtime wiring are complete.
2. Readiness SHALL remain false while SQL/query-routing dependencies required
   for bootstrap operations are unavailable.
3. Readiness promotion SHALL require sustained success over a configurable
   stability window (probe hysteresis).
4. Readiness demotion SHALL require bounded consecutive failures to avoid
   one-off flapping.

### Requirement 6: Harness and Integration Parity

**User Story:** As a test maintainer, I want integration and distributed tests
to exercise the same readiness contract, so regressions are caught early.

#### Acceptance Criteria

1. Distributed harness SHALL probe the dedicated lightweight readiness endpoint,
   not `POST /bootstrap`, for startup gating.
2. Integration coverage SHALL include at least one network-realistic join path
   using real listeners and real HTTP transport (no in-process injection).
3. In-process integration helpers MAY remain for speed, but SHALL not be the
   only validation surface for join readiness behavior.
4. Harness timeout errors SHALL include readiness state, reason codes, and
   status histograms.

### Requirement 7: Kubernetes and NGINX Deployment Readiness Profile

**User Story:** As a production operator, I want clear probe and proxy guidance,
so deployment behavior is stable during startup and rolling changes.

#### Acceptance Criteria

1. THE spec SHALL define canonical probe mapping:
   `startupProbe -> /startupz`, `readinessProbe -> /readyz`,
   `livenessProbe -> /livez`.
2. THE spec SHALL define baseline probe timing guidance (`periodSeconds`,
   `failureThreshold`, `timeoutSeconds`) based on observed startup behavior.
3. THE spec SHALL define NGINX/ingress health-check guidance using readiness
   endpoints and safe retry policy for non-idempotent operations.
4. Deployment documentation SHALL include rollout and rollback implications for
   readiness contract changes.

### Requirement 8: Observability and Diagnostics

**User Story:** As an on-call engineer, I want precise readiness diagnostics, so
I can triage startup failures quickly.

#### Acceptance Criteria

1. The system SHALL emit structured readiness transition events.
2. The system SHALL export readiness metrics (state, transition counts, blocked
   durations, probe response code counts).
3. Timeout and failure errors SHALL include last known readiness state and
   blocking reasons.
4. Diagnostics SHALL distinguish process liveness, startup completion, and join
   readiness failures.

### Requirement 9: Backward Compatibility and Migration Safety

**User Story:** As a client maintainer, I want compatibility during rollout, so
existing join clients and tooling continue to function.

#### Acceptance Criteria

1. Existing `POST /bootstrap` contract SHALL remain available.
2. Existing `/health` endpoint MAY remain for compatibility but SHALL be
   documented as non-authoritative for join readiness.
3. New readiness endpoints SHALL be additive and version-safe.
4. Rollout SHALL allow old and new harness/test configurations to run during
   transition with explicit deprecation messaging.
