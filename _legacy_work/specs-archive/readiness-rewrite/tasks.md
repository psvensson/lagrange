# Implementation Plan: Readiness Rewrite

## Overview

Rewrite readiness around explicit node/service contracts, prove the rules in
deterministic tests first, then rerun the restart acceptance scenarios.

## Tasks

- [x] 1. Define the readiness rewrite spec and traceability map
  - [x] 1.1 Record the node/service readiness model and invariants
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1_
    - _Design: 1, 1.1, 1.2, 5.1_
  - [x] 1.2 Record evidence-precedence and activation semantics
    - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2_
    - _Design: 2, 2.1, 2.2, 2.3, 3, 3.2_

- [x] 2. Prove node transport evidence precedence with deterministic tests
  - [x] 2.1 Add failing tests for explicit router-disconnected evidence outranking stale row optimism
    - _Requirements: 2.1, 2.2, 4.3, 5.1_
    - _Design: 2.2, 4.2, 5.1_
  - [x] 2.2 Add failing tests for row-evidence grace when the router has no contrary evidence
    - _Requirements: 2.3, 2.4, 5.1_
    - _Design: 2.1, 2.3, 5.1_

- [x] 3. Implement node readiness evidence precedence
  - [x] 3.1 Update `ControlPlaneReadinessService` so explicit router negative evidence fails closed for serveability
    - _Requirements: 2.1, 2.2, 4.3_
    - _Design: 2.2, 4.2_
  - [x] 3.2 Preserve row-evidence grace only when the router has no current contrary evidence
    - _Requirements: 2.3, 2.4_
    - _Design: 2.1, 2.3_

- [x] 4. Introduce service readiness ownership for partition services
  - [x] 4.1 Add failing tests proving partition services are not routable before local handler readiness
    - _Requirements: 1.3, 3.1, 3.2, 3.4, 5.1_
    - _Design: 1.2, 3.2, 5.1_
  - [x] 4.2 Implement a canonical partition-service activation owner path
    - _Requirements: 3.1, 3.2, 3.3_
    - _Design: 3.1, 3.2, 3.3_
  - [x] 4.3 Cut optimistic partition-service `active` publication over to activation-driven updates
    - _Requirements: 3.2, 3.3, 3.4, 4.1_
    - _Design: 3.1, 3.2, 4.1_

- [x] 5. Cut routing and readiness consumers to the rewritten contract
  - [x] 5.1 Update query routing to consume service routability instead of raw `services.status`
    - _Requirements: 1.4, 4.1, 4.3_
    - _Design: 1.2, 4.1_
  - [x] 5.2 Update node traffic eligibility to derive from routable service reality rather than node-row optimism
    - _Requirements: 1.1, 1.2, 4.2, 4.3_
    - _Design: 1.1, 1.2, 4.2_

- [ ] 6. Verify the rewrite
  - [x] 6.1 Run targeted readiness, routing, and activation suites
    - _Requirements: 5.1, 5.2_
    - _Design: 5.1_
  - [x] 6.2 Re-run `rolling-restart`, `seed-restart-under-load`, and `partition-kill-heal-under-load` individually
    - _Requirements: 5.3, 5.4_
    - _Design: 5.2_
