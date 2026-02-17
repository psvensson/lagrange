# Raft-Logic Investigation Spec (Contained Spike)

## 1. Purpose

Define a contained, time-boxed investigation of `raft-logic` as a potential
future replacement path for current liferaft-based integration.

This is a decision-making spike, not a production migration.

## 2. Scope Type

- Type: contained spike
- Duration: 5-10 engineering days
- Output: go/no-go recommendation with measured evidence

## 3. Hypothesis

`raft-logic` may provide a better feature foundation (WASM raft core, richer
control surface, snapshot-aware storage model) while still allowing in-process
Node integration. The spike will validate fit and migration risk.

## 4. Hard Guardrails

- No production cutover in this spike.
- No long-lived dual-raft behavior in mainline.
- Changes isolated behind explicit spike paths/flags.
- Spike code is removable if outcome is no-go.
- Existing liferaft behavior remains default and untouched.

## 5. Non-Goals

- Full migration of all service types.
- Data migration for existing live clusters.
- Protocol bridge to mixed liferaft + raft-logic clusters.
- Performance tuning beyond initial viability checks.

## 6. Key Questions to Answer

1. API fit: Can existing raft integration points be mapped cleanly?
2. Correctness: Are leader election, replication, and commit application stable?
3. Operations: Can we preserve dynamic timing/config and diagnostics expectations?
4. Performance: Idle CPU/memory/disk behavior vs current baseline?
5. Complexity: Is migration complexity acceptable relative to expected gains?

## 7. Current Integration Surface to Map

Primary liferaft-coupled behaviors currently used:

- peer join and election start sequencing
- packet ingress/egress through current message router
- leader/follower/candidate/commit event handling
- runtime raft timing updates
- role persistence and leader tracking hooks

Major touchpoints:

- `src/raft/raft-replica-base.js`
- `src/partition/partition-service.js`
- `src/message-group/message-group-service.js`
- `src/raft/raft-timing-utils.js`
- packet-type handling in `src/raft/constants.js`

## 8. Investigation Plan

### Step 1: API and Capability Mapping

Produce a mapping document:

- current liferaft usage -> raft-logic equivalent
- unsupported or high-friction gaps
- expected adapter responsibilities

Deliverable:

- `docs/raft-logic-api-gap-analysis.md` (or equivalent section in spike report)

### Step 2: Minimal Adapter Prototype

Implement a spike-only adapter that supports:

- startup/shutdown
- propose command
- role change notifications
- commit callback path
- leader identity tracking

Adapter must be isolated in a dedicated spike module path.

### Step 3: Narrow Integration Path

Integrate the adapter into one narrow testable path only:

- recommended: one service type in harness mode or dedicated spike service.

Activation:

- explicit feature flag, e.g. `RAFT_PROVIDER=raft_logic_spike`
- default remains current liferaft path.

### Step 4: Transport and Storage Validation

Validate transport wiring and persistence assumptions:

- confirm message flow semantics
- confirm restart behavior with chosen spike storage mode
- document any required storage schema or adapter changes

### Step 5: Correctness Test Set

Run focused tests:

- single-node leadership
- 3-node leader election
- follower write forwarding behavior
- commit delivery and state-machine application
- leader failover and re-election

### Step 6: Resource and Performance Check

Run controlled comparison against current baseline:

- 15-minute idle soak
- small write workload
- failover scenario

Collect:

- CPU percent trend
- RSS trend
- write bytes/sec
- convergence success/failure evidence

## 9. Success Criteria

Spike is a **go candidate** only if all are true:

- Correctness tests pass for scoped integration path.
- No critical operational blocker found.
- Idle resource profile is not worse than current baseline by >20%.
- Migration complexity estimate is acceptable and clearly phased.
- No licensing/dependency blocker for intended deployment model.

## 10. No-Go Criteria

Immediate no-go if any:

- correctness instability in basic raft flows
- unacceptable operational coupling (e.g., hard runtime constraints that do not
  fit current architecture)
- significant unresolved data durability risks
- unacceptable licensing/compliance concern

## 11. Risks

- Package ecosystem maturity risk.
- WASM/runtime behavior differences under stress.
- Hidden migration breadth from packet/event model differences.
- Test harness assumptions tied to liferaft packet taxonomy.

Mitigations:

- strict time-box
- isolated adapter
- explicit evidence-based decision gate

## 12. Artifacts Required at End of Spike

- API gap analysis
- adapter design note
- measured benchmark table (baseline vs spike)
- issue list with severity (blocker/high/medium/low)
- final recommendation:
  - Go to phase-2 migration design
  - No-go (and rationale)

## 13. Decision Output Format

Final spike report must include:

1. Executive summary (go/no-go)
2. What worked
3. What failed
4. Migration complexity estimate (rough weeks and risks)
5. Recommended next action

