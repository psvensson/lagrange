# Design Document: Phase 0.1 Failure Simulations

## Overview

This design closes the remaining Phase 0.1 failure-simulation roadmap items by:

1. Hardening the chaos primitive layer with reversible operations.
2. Emitting typed fault playback events for timeline diagnostics.
3. Adding three deterministic scenarios:
   - `disk-full-under-load`
   - `slow-follower-under-load`
   - `in-cluster-chaos-injection`

The design reuses existing harness ownership:

- `ChaosPrimitives` owns low-level container/network fault actions.
- `Cluster` owns scenario-facing orchestration and playback emission.
- Scenario modules own deterministic sequencing and assertions.

No new fault engine is introduced.

## Architecture

### 1. Reversible Chaos Primitives

`test/distributed/harness/chaos.js` is extended with:

1. `clearNetworkSlowdown(nodeId)`:
   clears root netem qdisc for idempotent slowdown recovery.
2. `fillDisk(nodeId, options)`:
   writes bounded zero payload to a deterministic pressure file.
3. `releaseDiskPressure(nodeId, options)`:
   removes pressure file and flushes sync.

These are explicit operation pairs:

- `slowNetwork` <-> `clearNetworkSlowdown`
- `fillDisk` <-> `releaseDiskPressure`

### 2. Cluster-Level API Surface

`test/distributed/harness/cluster.js` exposes wrappers so scenarios only depend
on `Cluster`, not internals:

1. `clearNetworkSlowdown(nodeId)`
2. `fillDisk(nodeId, options)`
3. `releaseDiskPressure(nodeId, options)`

Wrappers delegate through `_runChaosAction(...)` so playback semantics remain
centralized.

### 3. Typed Fault Playback Events

`PLAYBACK_EVENT_TYPE` gains:

1. `CHAOS_FAULT_INJECTED` (`chaos.fault.injected`)
2. `CHAOS_FAULT_RECOVERED` (`chaos.fault.recovered`)
3. `CHAOS_FAULT_FAILED` (`chaos.fault.failed`)

`Cluster._runChaosAction(...)` classifies each action as injected or recovered
and emits the corresponding typed event. Failures emit
`chaos.fault.failed` before rethrowing.

Classification uses one canonical recovery-action set:

- `unpauseNode`
- `restartNode`
- `healPartition`
- `clearNetworkSlowdown`
- `releaseDiskPressure`

All other chaos actions are classified as fault injection.

## Scenario Design

### Disk Full Under Load

Phases:

1. Start mixed/write-heavy load.
2. Inject disk pressure on one non-seed node.
3. Verify no invariant breach during fault window.
4. Release disk pressure.
5. Wait for convergence and verify consistency.

### Slow Follower Under Load

Phases:

1. Start sustained load.
2. Inject delay/jitter on one follower-target node.
3. Assert bounded success rate and no invariant breach.
4. Clear slowdown.
5. Verify catch-up and convergence.

### In-Cluster Chaos Injection

Phases:

1. Build deterministic action sequence from seeded RNG.
2. For each step:
   - inject one fault class
   - hold fault window
   - recover explicitly
   - verify convergence/invariants
3. Assert final consistency and health gate.

## Testing Strategy

1. Unit tests for `ChaosPrimitives`:
   command-shape checks for new operations.
2. Unit tests for `Cluster`:
   API exposure + typed playback emission behavior.
3. Scenario tests:
   deterministic assertions and bounded timing envelopes.
4. Focused harness run:
   execute only new scenarios before roadmap status update.

## Risk and Mitigation

1. **Risk:** Non-idempotent recovery causing flaky runs.
   **Mitigation:** Best-effort/idempotent recovery methods and repeated-call tests.
2. **Risk:** Event overload in playback.
   **Mitigation:** Reuse existing event pipeline; add only three typed events.
3. **Risk:** Over-coupling scenarios to host timing.
   **Mitigation:** Keep explicit hold/recovery windows and convergence polling.
