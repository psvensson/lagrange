# Topology Systems Pattern Completion Closure Sprint

Status: done. Opened and closed on 2026-05-16 after review of
`work/sprints/done-2026-q2-topology-convergence-systems-pattern-hardening.md`
found that the TiKV-style operator witness and Cockroach-style critical
convergence class need live-path completion proof before the paused topology
sprint resumes.

## Current Blocker Snapshot

- Package:
  [Topology Systems Pattern Completion Closure](../packages/done-20260516-topology-systems-pattern-completion-closure.md)
- Owner boundary: `topology_convergence_owner /
  systems_pattern_contract_completion`
- Dominant reason: `pattern_contracts_not_fully_live_or_guarded`
- Next action: make TiKV operator witnesses live through emitted progress,
  close Cockroach critical convergence tail-consumer proof, and add tracker
  validation for stale active package/sprint references.

## Goal

Close the implementation gaps in the systems-pattern hardening work before
another topology runtime sprint depends on those contracts.

## In Scope

1. Prove `topologyOperatorWitness` through live owner progress emission and
   diagnostics consumers, not only direct builder tests.
2. Prove the critical control-plane convergence class through admin tail
   consumers and pressure outcomes.
3. Add tracker validation that catches stale active sprint/package references
   in track handoffs after files are renamed to `done-*`.
4. Repair `work/tracks/topology-convergence.md` so it no longer points at the
   closed systems-pattern sprint as active.

## Out Of Scope

1. Resuming the paused topology sprint.
2. Running a broad representative scenario before focused local proof is green.
3. Introducing user-visible priority controls or operator-facing topology
   controls.

## Package Queue

1. [Topology Systems Pattern Completion Closure](../packages/done-20260516-topology-systems-pattern-completion-closure.md)
   - Lane: `runtime-owner-boundary`
   - Acceptance: focused TiKV, Cockroach, admin, diagnostics, tracker, and
     package closure proof is green.

## Closure Rule

This sprint closes when the package is done, committed, and pushed, and the
topology track no longer carries stale active pointers to the closed
systems-pattern sprint.
