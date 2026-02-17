# Design Document

## Overview

This design describes a contained spike to evaluate `raft-logic` as a possible
future replacement for liferaft in this system. The spike is intentionally
limited in scope and isolated behind an explicit activation path.

Primary objective:
- produce a defensible go/no-go recommendation with measured evidence

Secondary objective:
- estimate migration complexity and major risks before committing to a broader
  implementation effort

## Goals

- Map current liferaft integration points to raft-logic capabilities.
- Validate a minimal adapter on one narrow integration path.
- Measure baseline correctness and resource viability under controlled tests.
- Produce actionable decision artifacts.

## Non-Goals

- Full runtime migration.
- Mixed liferaft + raft-logic production behavior.
- Data migration for existing clusters.
- Broad optimization work.

## Decision Strategy

The spike uses a gated decision model:
1. Capability mapping gate: Is the API/control-surface fit plausible?
2. Correctness gate: Do core raft flows hold in scoped integration?
3. Operations gate: Can current operational expectations still be met?
4. Viability gate: Is idle/resource profile within acceptable bounds?
5. Complexity gate: Is migration effort justified by expected gains?

Failure at any mandatory gate produces a no-go outcome.

## Architecture Approach

### Current-to-Spike Isolation

The existing liferaft path remains default and unchanged. A spike-only provider
path is introduced and activated exclusively via explicit configuration.

```text
Default runtime path (unchanged)
  RaftReplicaBase -> liferaft integration -> current message/router/storage flow

Spike runtime path (explicit opt-in only)
  RaftReplicaBase -> raft-logic spike adapter -> current message/router/storage flow
```

No fallback chaining is used at runtime. One selected provider path is active
per process start.

### Candidate Touchpoints

The design evaluates mapping and compatibility for:
- `src/raft/raft-replica-base.js`
- `src/partition/partition-service.js`
- `src/message-group/message-group-service.js`
- `src/raft/raft-timing-utils.js`
- packet-type handling in `src/raft/constants.js`

### Adapter Responsibilities

The minimal spike adapter is responsible for:
- lifecycle: start/stop
- command path: propose/write submission
- role events: leader/follower/candidate transitions
- commit events: state-machine apply callback handoff
- leader identity reporting

The adapter does not attempt to solve full migration concerns in this phase.

## Investigation Workstreams

### 1) API and Capability Mapping

Output:
- one gap-analysis document with:
  - equivalent mappings
  - unsupported behavior
  - high-friction adaptation points
  - required shim responsibilities

### 2) Minimal Prototype Integration

Output:
- spike-only adapter implementation
- narrow integration hook for one service path
- explicit provider activation control

### 3) Transport and Storage Validation

Checks:
- message flow semantics
- restart/recovery behavior in chosen storage mode
- schema or persistence assumptions requiring change

### 4) Correctness and Viability Evaluation

Correctness set:
- single-node leadership
- 3-node election
- follower forwarding
- commit/apply path
- failover and re-election

Resource/perf set:
- 15-minute idle soak
- small write workload
- failover scenario

Collected evidence:
- CPU trend
- RSS trend
- write-bytes/sec
- convergence success/failure

## Risk Model and Mitigations

Risks:
- ecosystem maturity or capability gaps
- runtime behavior differences under stress
- hidden migration breadth in packet/event models
- harness assumptions coupled to current packet taxonomy

Mitigations:
- strict 5-10 day time-box
- narrow-scope integration only
- spike-path isolation and removability
- explicit go/no-go decision gates

## Exit Criteria

The spike exits with one of two outcomes:

- Go candidate:
  - scoped correctness passes
  - no critical operational blocker
  - idle resource impact within threshold (<=20% worse vs baseline)
  - acceptable phased complexity estimate
  - no licensing/compliance blocker

- No-go:
  - correctness instability, operational mismatch, unresolved durability risk,
    or licensing blocker

## Deliverables

- API gap analysis
- Adapter design note
- Baseline-vs-spike benchmark table
- Issue register with severity
- Final recommendation report with next action
