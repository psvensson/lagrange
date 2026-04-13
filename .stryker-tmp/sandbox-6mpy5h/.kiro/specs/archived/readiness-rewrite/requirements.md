# Requirements Document

## Introduction

Restart failures are still clustering around one ambiguity: the system does not
have one precise definition of "ready". Node rows, service rows, router state,
leases, and local handler reality can disagree, and current routing behavior is
too willing to trust optimistic metadata during restart windows.

This rewrite reduces readiness to a smaller contract:

1. node readiness answers whether a node may participate in repair or serve
   traffic
2. service readiness answers whether a concrete replica may be routed to
3. explicit negative transport evidence outranks stale optimistic metadata
4. published `active` service state must reflect local handler reality

The goal is not more retry logic. The goal is to remove the ambiguity that
creates restart-time stale routing.

## Problem Statement

Current behavior shows three structural mismatches:

1. node readiness and service routability are conflated
2. explicit router failures can be ignored in favor of stale row optimism
3. partition services can remain externally routable before local handler
   readiness is re-established

Those mismatches produce the current failure family:

1. `No handler registered for partition service`
2. `No active service found for partition`
3. `Distributed operation failed due to participant failures`

## Requirements

### Requirement 1: Node and Service Readiness Must Be Separate Contracts

**User Story:** As a maintainer, I want node participation readiness and
replica routing readiness to be distinct so restart behavior is explicit and
non-ambiguous.

#### Acceptance Criteria

1.1. The system SHALL model node readiness separately from service readiness.

1.2. Node readiness SHALL answer whether a node is eligible for repair work and
traffic serving.

1.3. Service readiness SHALL answer whether a specific replica may be routed to
for work.

1.4. Query routing SHALL NOT infer service routability from node readiness
alone.

### Requirement 2: Explicit Negative Transport Evidence Must Fail Closed

**User Story:** As an operator, I want explicit disconnect evidence to outrank
stale optimistic metadata so restart gaps do not route traffic to dead paths.

#### Acceptance Criteria

2.1. When the live router reports a node as disconnected, the system SHALL NOT
continue treating stale row transport state as sufficient for serving traffic.

2.2. `serveEligible` SHALL fail closed when current transport evidence is
explicitly negative.

2.3. Row-based grace MAY still apply when the router has no current evidence
for that peer.

2.4. Deterministic tests SHALL prove both the negative-evidence fail-closed
case and the no-evidence grace case.

### Requirement 3: Published Active Service State Must Mean Routable

**User Story:** As a query router, I want `services.status=active` to mean the
handler is actually routable so cache metadata cannot get ahead of local
service reality.

#### Acceptance Criteria

3.1. Partition and message-group services SHALL have an explicit pre-routable
state before local handler readiness is complete.

3.2. A service row SHALL NOT become `active` until its handler is registered,
its address is published, and its local runtime is ready to accept messages.

3.3. Service activation SHALL be owned by one canonical activation path rather
than direct optimistic inserts.

3.4. Deterministic tests SHALL prove that non-routable replicas cannot become
externally active.

### Requirement 4: Consumers Must Read the Right Readiness Contract

**User Story:** As a platform engineer, I want routing, admission, and repair
paths to consume the readiness contract they actually need instead of a broad,
optimistic approximation.

#### Acceptance Criteria

4.1. Query routing SHALL consume service routability, not raw
`services.status=active` plus node optimism.

4.2. Control-plane repair/admission paths SHALL consume node repair
eligibility, not traffic-serving eligibility.

4.3. Readiness calculations SHALL derive traffic eligibility from actual
routable services and live transport evidence.

### Requirement 5: The Rewrite Must Be Proven Deterministically Before Harness Use

**User Story:** As a test maintainer, I want the readiness rewrite proven in
small owner-path tests first so harness failures are acceptance checks, not the
primary debugging loop.

#### Acceptance Criteria

5.1. Each new readiness rule SHALL be introduced with deterministic focused
tests first.

5.2. Targeted readiness, activation, and query-routing suites SHALL pass before
distributed acceptance reruns.

5.3. `rolling-restart`, `seed-restart-under-load`, and
`partition-kill-heal-under-load` SHALL be rerun individually after deterministic
slices are green.

5.4. Remaining failures, if any, SHALL be described in terms of the new
readiness contract rather than generic retry symptoms.
