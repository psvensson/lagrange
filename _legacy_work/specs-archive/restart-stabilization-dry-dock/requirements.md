# Requirements

## Overview

Restart stabilization must move from broad harness chasing to a small set of
deterministic owner-path regressions.

The goal of this track is not to finish roadmap work. The goal is to regain
engineering control over restart/join failures before further feature work.

## Requirements

### Requirement 1: Failure Taxonomy Must Be Explicit

The restart/join boundary MUST be described in a small set of typed failure
classes so debugging does not depend on ad hoc log sampling.

#### Acceptance Criteria

1. The active spec records the current restart failure classes.
2. Each failure class names the primary owner boundary responsible for it.
3. New deterministic regressions identify which failure class they cover.

### Requirement 2: Restart Invariants Must Be Small and Concrete

Restart behavior MUST be reduced to a small contract that can be tested below
the distributed harness.

#### Acceptance Criteria

1. The active spec defines restart invariants for:
   - control-plane ingress reachability
   - reconnect-address freshness
   - handler-before-activation ordering
   - join completion without non-critical repair blocking
2. Each invariant maps to one or more deterministic tests.

### Requirement 3: Distributed Harness Scenarios Must Become Acceptance Gates

Full distributed restart scenarios MUST stop being the primary debugging loop.

#### Acceptance Criteria

1. At least one deterministic reproducer is added for the current restart
   failure surface before additional broad harness chasing.
2. `rolling-restart` remains an acceptance scenario, not the first debugging
   tool.

### Requirement 4: Stale Reconnect Addresses Must Not Persist As Authority

When a reconnect address fails with a hard DNS-style resolution error, the
router MUST stop preferring that address on subsequent deliveries and fall back
to fresher resolver-owned candidates.

#### Acceptance Criteria

1. A deterministic test proves one failed reconnect address is invalidated
   after `ENOTFOUND` or equivalent fatal resolution failure.
2. A subsequent delivery does not start with the invalidated address while the
   invalidation is in effect.
3. The router still preserves directly observed addresses when they remain
   routable.
