# Design Document

## Overview

This design converts the completed raft-logic investigation into an executable,
production-safe migration program.

Current state from spike:
- Recommendation: `go_candidate`
- Correctness: pass
- Transport/storage restart: pass
- Resource viability: pass
- Remaining high risks: ID mapping breadth, transport coupling, dynamic timing
  parity, and log-volume discipline

Primary objective:
- migrate to raft-logic safely with explicit stage gates and rollback readiness

## Goals

- Keep runtime deterministic with one provider per process.
- Preserve system invariants for leader election, commit apply, and membership.
- Reach or improve liferaft baseline performance without operational regressions.
- Produce auditable rollout artifacts and go-live decision evidence.

## Non-Goals

- Runtime dual-provider fallback within a process.
- Big-bang cutover of all environments at once.
- Unbounded optimization work before parity gates are met.

## Architecture Strategy

### 1) Provider Contract as Integration Boundary

A single internal provider contract remains the only way services interact with
raft behavior.

Contract areas:
- lifecycle: start/stop
- command path: propose/apply completion
- status: role/term/leader
- membership: join/remove/replace hooks
- timing: config-driven update API

Design rule:
- Service code in partition/message-group components does not call raft library
  APIs directly.

### 2) Single-Provider Process Model

Per process startup:
- select `liferaft` or `raft_logic`
- initialize one provider implementation
- keep selection fixed until restart

This enforces deterministic behavior and avoids fallback complexity.

### 3) Canonical ID Mapping Layer

A dedicated ID mapping module owns:
- external runtime IDs (UUID style)
- internal raft IDs (numeric strings)

Properties:
- deterministic
- one-to-one within group
- validated at startup
- shared by transport, status, and membership paths

### 4) MessageRouter Transport Alignment

Production transport path:
- raft provider outbound -> MessageRouter -> remote node ingress -> provider step

Requirements:
- no production dependence on in-memory transport
- demultiplexed artifacts for analysis
- capability-aware log/stream subscriptions in harness

### 5) Timing and Dynamic Config Semantics

Timing sources:
- one canonical dynamic config owner

Supported semantics per parameter:
- immediate apply if provider supports safe runtime mutation
- otherwise staged apply on restart/new replica creation

Adaptive timing (optional):
- conservative defaults
- hysteresis thresholds
- explicit on/off control in dynamic config

### 6) Observability and Log Policy

Defaults:
- low-overhead health metrics enabled
- detailed instrumentation off
- verbose commit-level tracing off

Diagnostics mode:
- explicit temporary toggles
- bounded duration
- clear report labeling when diagnostic mode is active

## Phased Rollout Plan

### Phase 0: Hardening Foundation

Scope:
- stabilize provider contract
- finalize ID mapping and transport parity
- reduce noisy raft-worker logs by default

Exit gate:
- all contract and integration tests green
- no unresolved blocker in issue register

### Phase 1: Bench Parity in Harness

Scope:
- run 3-node and 5-node benchmark scenarios with raft-logic provider
- compare to liferaft runs and replicated Postgres baseline

Exit gate:
- <=10% regression vs liferaft baseline on equivalent workload,
  or documented mitigation plan approved
- idle resource checks within thresholds

### Phase 2: Canary Environment Rollout

Scope:
- enable raft-logic in non-critical canary clusters
- exercise failover, restart, rejoin, and membership operations

Exit gate:
- no severity-blocker incidents over defined soak window
- successful rollback rehearsal completed

### Phase 3: Limited Production Rollout

Scope:
- controlled percentage rollout (by cluster cohort)
- enhanced monitoring and incident triage

Exit gate:
- stability and performance SLOs met for promotion window
- go-live review approved

### Phase 4: Default Provider Cutover

Scope:
- switch default provider to raft-logic
- archive/remove superseded migration-only code

Exit gate:
- post-cutover verification report complete
- rollback plan remains tested and operational

## Validation and Gating Matrix

For each phase, run:
- correctness suite (leadership, forwarding, commit apply, failover)
- restart/durability suite (sqlite restart, leader restart, rolling restart)
- resource suite (idle CPU/RSS/write trend)
- benchmark suite (current run vs prior run vs Postgres baseline)

Standard run profiles:
- fast loop: 2-minute idle soak, small write set
- release gate: extended soak and failure-injection schedule

## Rollback Model

Rollback is operational, not in-process fallback:
- redeploy/restart affected cohort with prior provider selection
- verify service readiness and convergence
- preserve evidence from failed stage for root-cause analysis

## Risks and Mitigations

- Risk: hidden transport coupling.
  Mitigation: explicit contract tests plus packet-path parity checks.
- Risk: ID mapping edge-case drift.
  Mitigation: centralized mapper and startup validation.
- Risk: timing adaptation instability.
  Mitigation: conservative adaptive defaults and reversible rollout toggles.
- Risk: observability overhead skews results.
  Mitigation: strict default logging policy and diagnostic-mode isolation.

## Deliverables

- migration requirements, design, tasks (this spec)
- updated benchmark reports per phase
- rollout/rollback runbook and incident playbook
- final go-live decision report
