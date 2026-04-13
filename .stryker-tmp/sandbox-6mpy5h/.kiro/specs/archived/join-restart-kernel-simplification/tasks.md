# Implementation Plan

## Overview

Implement the restart/join simplification track in ordered slices so the join
owner path is cleaned up before larger control-plane cutovers.

## Tasks

- [x] 1. Align durable join checkpoints with the real startup pipeline
  - [x] 1.1 Replace generic join checkpoint names with startup-owner checkpoints
  - [x] 1.2 Integrate `JoinCoordinator` into `NodeJoiningService.join()`
  - [x] 1.3 Ensure retries of the same join session skip completed checkpoints
  - [x] 1.4 Add `NodeJoiningService` regression coverage for resume semantics

- [x] 2. Introduce a control-plane kernel ingress interface
  - [x] 2.1 Define the kernel admission/lease interface over existing
    control-plane owners
  - [x] 2.2 Route join admission through the kernel interface
  - [x] 2.3 Remove control-plane admission dependence on cache-derived
    message-group ingress selection

- [x] 3. Enforce the activation contract for `ACTIVE`
  - [x] 3.1 Require local handler registration before service activation
  - [x] 3.2 Require endpoint publication before service activation
  - [x] 3.3 Add owner-path regressions for publication ordering

- [x] 4. Split join-blocking recovery from post-join repair
  - [x] 4.1 Restrict join-blocking repair to discovery-critical tables
  - [x] 4.2 Move opportunistic propagated-table repair behind activation
  - [x] 4.3 Add diagnostics distinguishing blocking vs background repair

- [x] 5. Cut leader routing over to kernel lease ownership
  - [x] 5.1 Define a canonical lease/epoch owner for control-plane ingress
  - [x] 5.2 Demote projection-driven target selection to read-model status
  - [x] 5.3 Add restart regressions for leader-uncertainty degradation

- [ ] 6. Verify restart stabilization end-to-end
  - [x] 6.1 Run focused unit suites for the join/control-plane slices
  - [x] 6.2 Re-run `rolling-restart` individually
  - [x] 6.3 Re-run the remaining topology-recovery scenarios individually
