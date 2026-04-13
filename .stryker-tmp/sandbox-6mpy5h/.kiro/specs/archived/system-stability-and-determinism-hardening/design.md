# Design Document: System Stability and Determinism Hardening

## Overview

This design turns the current stabilization effort into an architectural
program. The system already has many correct pieces; the problem is that
correctness still depends too much on timing, projection ordering, and
background repair.

The design is organized around six structural moves:

1. make ownership explicit
2. make lifecycle state explicit
3. constrain reconciliation to guarded repair
4. centralize propagation and mutation seams
5. make time injectable
6. elevate invariants and convergence tests into the main workflow

This work complements the runtime-unification effort already completed in the
codebase. [architecture.md](../../../../architecture.md) remains the canonical
source for final owner assignments.

## Key Design Decisions

1. Timeouts are treated as bug signals, not normal steady-state control flow.
2. Canonical owner rows outrank all derived read models.
3. Readiness is a state-machine decision, not a convenience snapshot.
4. Repair loops are allowed to heal drift, but not to invent or overwrite
   fresher truth.
5. Benchmarks are valid only after correctness and stability are explicit.

## Architecture Changes

### 1. Canonical Readiness and Ownership Evaluator (`P0`)

#### Components

1. `src/admin/admin-websocket-api.js`
2. `src/raft/authoritative-row-mutation-helper.js`
3. owner-row producers in partition and message-group services
4. harness readiness consumers under `test/distributed/harness/`

#### Behavior

1. Introduce one shared readiness evaluator for control snapshots, discovery,
   and benchmark gating.
2. Use owner rows to determine leader identity and group readiness.
3. Use `services` rows only for replica detail such as location, status, and
   role.
4. Mark a node unready when its local target replica is `candidate`, `learner`,
   `draining`, or otherwise non-stable for the requested workload.
5. Emit stable reason codes so harness failures do not need to reconstruct
   intent from raw row dumps.

#### Output Contract

Each readiness record should be shaped like:

```json
{
  "nodeId": "node-a",
  "status": "not_ready",
  "reasons": [
    {
      "code": "local_replica_candidate",
      "scope": "partition",
      "entityId": "tbl-123-p1"
    }
  ],
  "canonicalLeader": "node-b",
  "localReplicaRole": "candidate"
}
```

### 2. Explicit Lifecycle State Machines (`P0`)

#### Components

1. raft replica base/runtime modules
2. control-plane node-readiness services
3. readiness evaluators and diagnostics serializers

#### Behavior

1. Define explicit state models for:
   - node readiness lifecycle
   - partition replica lifecycle
   - message-group replica lifecycle
2. Keep transition ownership in the runtime layer, not in diagnostics code.
3. Require all readiness and benchmark admission logic to consume these states.
4. Add illegal-transition guards so contradictory transitions produce explicit
   failure events.
5. Separate "state observed" from "state derived for operators" so diagnostics
   remain readable without becoming owners.

#### State Model Guidance

The exact enum names may vary, but the model must preserve:

1. bootstrap and hydration states
2. stable serving states
3. unstable election states
4. draining and repair states
5. terminal failure states

### 3. Guarded Repair and Reconciliation (`P0`)

#### Components

1. lease and heartbeat sweepers
2. readiness and replica repair loops
3. authoritative row mutation helper

#### Behavior

1. All background repair mutations must include an observed-state guard.
2. Guard failure is a valid outcome and must not be treated as a mutation
   success.
3. Repair loops may clear stale state only if the observed row is still the
   same row that triggered repair.
4. Repair loops must emit no-progress diagnostics after repeated guarded
   failures or repeated re-observation of the same instability.
5. No repair loop may become a second writer for canonical owner decisions.

#### Example

Lease expiry handling should operate as:

1. read node row and lease expiry snapshot
2. determine expiry candidate
3. attempt guarded update keyed by the observed expiry and heartbeat fields
4. treat `affectedRows = 0` as "state changed underneath us", not as success

This is the same class of fix already needed for stale disconnect races and
should become a standard rule rather than a one-off patch.

### 4. Shared Propagation and Mutation Surface (`P1`)

#### Components

1. `src/cache/cache-constants.js`
2. bootstrap/joining CDC setup
3. authoritative row mutation helper
4. cache hydration and catch-up utilities

#### Behavior

1. Declare the propagated system-table set once and import it everywhere.
2. Declare the steady-state CDC subscription plan once and import it
   everywhere.
3. Keep direct cache writes limited to bootstrap snapshot hydration before CDC
   subscriptions are active.
4. Route owner-row writes through one mutation helper that understands:
   - pending-value collapse
   - cache-visibility confirmation
   - guarded retries
   - reasoned no-progress failure
5. Delete duplicated per-service lists and near-duplicate retry loops.

### 5. Injected Time and Scheduler Semantics (`P1`)

#### Components

1. harness gate engine and scenario helpers
2. node client retry/circuit code
3. lease/heartbeat services
4. benchmark load scheduling utilities

#### Behavior

1. Introduce shared clock/scheduler interfaces for retry loops, poll loops,
   stable windows, and lease deadlines.
2. Keep wall-clock time only at true external boundaries:
   - network I/O
   - process startup
   - Docker lifecycle
3. Convert harness and scenario tests to virtual clocks by default.
4. Distinguish two timeout classes:
   - no-progress timeout
   - absolute budget exceeded
5. Require reports and logs to state which class fired.

#### Design Consequence

A long-running test becomes evidence of missing abstraction, not just a slow
machine. This forces hidden timing assumptions into injectable dependencies.

### 6. Invariant Catalog and Reporting (`P1`)

#### Components

1. runtime emitters
2. admin diagnostics surfaces
3. harness report writer and scenario phase logic

#### Behavior

Define a canonical invariant catalog with IDs such as:

1. `partition.single_canonical_leader`
2. `replica.local_role_is_stable_for_readiness`
3. `node.lease_state_not_regressed`
4. `cdc.subscription_progress_visible`
5. `benchmark.required_nodes_all_ready`

Each invariant event should include:

1. invariant ID
2. severity
3. entity scope
4. observed values
5. expected condition
6. recommendation or owning subsystem

Hard invariant failures should short-circuit strict benchmark runs before
throughput interpretation begins.

### 7. Deterministic Convergence Test Layer (`P2`)

#### Components

1. a new convergence test harness under `test/`
2. deterministic schedulers and event drivers
3. machine-readable artifact writer

#### Behavior

1. Simulate multi-node control-plane convergence without Docker.
2. Control event ordering explicitly for:
   - heartbeats
   - lease renewals
   - CDC deliveries
   - delayed acknowledgments
   - stale snapshot reads
3. Assert invariants and final convergence state.
4. Emit small, inspectable artifacts on failure.
5. Promote every baseline-discovered correctness bug into this layer before the
   bug is considered fully closed.

### 8. Benchmark Correctness and Performance Split (`P2`)

#### Components

1. `test/distributed/scenarios/postgres-baseline-comparison.js`
2. report writer and compare tooling
3. benchmark runbooks

#### Behavior

1. Split baseline execution into:
   - correctness preflight
   - readiness stability window
   - performance measurement
   - post-load verification
2. Only produce throughput headlines when correctness remains intact.
3. Preserve partial artifacts for failed correctness runs, but label them as
   invalid for performance comparison.
4. Feed invariant results directly into phase transition decisions.

## Migration Plan

### Phase S1: Ownership and Readiness Closure

1. finish one shared readiness evaluator
2. reject `candidate` local replicas from benchmark readiness
3. align control snapshots and harness gating on the same reason codes

### Phase S2: Lifecycle and Guarded Repair

1. codify explicit lifecycle states
2. convert remaining stale-sweep or stale-repair paths to guarded mutations
3. fail fast on illegal transitions

### Phase S3: Shared Propagation and Time Abstractions

1. collapse duplicated propagated-table and subscription lists
2. move remaining retry/poll loops onto injected clocks
3. remove real waits from targeted harness specs where possible

### Phase S4: Invariant Pipeline

1. define invariant catalog
2. emit invariant events from runtime and harness
3. fail strict benchmark runs on hard invariant breaches

### Phase S5: Deterministic Convergence Layer and Benchmark Contract

1. add the convergence test layer
2. backfill discovered bugs into it
3. separate correctness and performance outputs in baseline reports

## Testing Strategy

1. Targeted unit and integration tests for guarded mutation and lifecycle
   legality.
2. Scenario tests for readiness gating and invariant-triggered benchmark
   failure.
3. Deterministic convergence tests for races previously found only in 7-node
   baselines.
4. Final 3-node and 7-node baselines only after lower layers pass.

## Rollout Strategy

1. Land P0 ownership, readiness, and guarded-repair changes first.
2. Land P1 propagation, time, and invariant work second.
3. Land P2 convergence-layer and benchmark-report split third.
4. Record before/after stability and throughput deltas once the benchmark is
   once again trustworthy.
