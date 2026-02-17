# Implementation Plan

## Overview

This plan executes the raft-logic investigation as a contained spike and
produces a go/no-go recommendation supported by concrete evidence.

Execution order:
1. Scope controls and baseline setup
2. API/capability mapping
3. Minimal adapter prototype
4. Narrow integration path
5. Transport/storage validation
6. Correctness + viability evaluation
7. Final decision artifacts

## Tasks

- [ ] 1. Establish spike controls and baseline capture
  - Define explicit spike activation control and ensure default liferaft path
    remains unchanged.
  - Capture baseline correctness/resource references for later comparison.
  - _Requirements: 1.1, 1.3, 1.4, 8.1, 8.2_

- [ ] 2. Produce raft capability gap analysis
  - Map existing liferaft touchpoints to raft-logic equivalents.
  - Identify unsupported/high-friction areas and expected adapter boundaries.
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 3. Design spike adapter interface
  - Define a minimal adapter contract for lifecycle, propose, role events,
    commit callbacks, and leader identity.
  - Document assumptions and non-goals.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 4. Implement spike-only adapter module
  - Implement adapter in dedicated spike-only module path.
  - Ensure code is removable with minimal impact to default path.
  - _Requirements: 1.5, 4.6_

- [ ] 5. Wire a narrow integration path
  - Integrate adapter into one scoped service path in harness/spike mode.
  - Keep non-spike execution on default liferaft path.
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 6. Validate transport semantics and restart behavior
  - Run targeted flow checks for message semantics and restart/persistence.
  - Record any schema or storage adaptation required.
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 7. Execute focused correctness test set
  - Run single-node leadership, 3-node election, follower forwarding, commit
    apply, and leader failover/re-election scenarios.
  - Capture pass/fail outcomes and blocking defects.
  - _Requirements: 7.1, 7.2_

- [ ] 8. Execute resource/performance viability checks
  - Run idle soak, small write workload, and failover scenarios.
  - Capture CPU, RSS, write-bytes/sec, and convergence evidence.
  - Evaluate viability threshold vs baseline.
  - _Requirements: 8.1, 8.2, 8.3_

- [ ] 9. Assess migration complexity and operational fit
  - Estimate phased migration effort (rough weeks, risk areas, dependencies).
  - Identify operational blockers and licensing/compliance constraints.
  - _Requirements: 9.1, 9.2_

- [ ] 10. Produce final decision report
  - Compile required artifacts and decision summary in standard report format.
  - State explicit recommendation: go-to-phase-2 design or no-go.
  - _Requirements: 10.1, 10.2, 9.1, 9.2_

## Notes

- This plan is a decision spike, not a migration commitment.
- No mixed production behavior is introduced during the spike.
- If a no-go condition is encountered, stop implementation expansion and
  complete decision artifacts.
