# Implementation Plan

## Overview

Stabilize restart/join through deterministic owner-path regressions before more
full distributed harness chasing.

## Tasks

- [x] 1. Define the restart stabilization dry-dock track
  - [x] 1.1 Record the current restart failure taxonomy
  - [x] 1.2 Define the small restart invariants
  - [x] 1.3 Set the acceptance strategy to deterministic-first, harness-second

- [x] 2. Add deterministic reproducer coverage for stale reconnect ownership
  - [x] 2.1 Reproduce stale reconnect-address churn after fatal DNS failure
  - [x] 2.2 Invalidate stale reconnect addresses through the router owner path
  - [x] 2.3 Verify subsequent deliveries prefer fresh resolver-owned addresses

- [x] 3. Add deterministic reproducer coverage for restart-time control-plane ingress
  - [x] 3.1 Reproduce exhausted leader-target-set failure without retry storm
  - [x] 3.2 Reproduce join registration failure during seed restart in narrow scope

- [x] 4. Re-run distributed acceptance scenarios only after deterministic slices are green
  - [x] 4.1 Re-run `rolling-restart` individually
  - [x] 4.2 Re-run the remaining topology-recovery scenarios individually
