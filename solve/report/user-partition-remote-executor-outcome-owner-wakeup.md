# Solve report: user-partition-remote-executor-outcome-owner-wakeup

**Goal:** A successful non-system user-partition REPLACE target outcome wakes the canonical remote source owner through the existing replica-dispatch ingress, with bounded retry ownership and no wake for local, terminal, incompatible, or expired operations; deterministic real-seam tests prove the owner handoff and red-on-revert behavior.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/user-partition-remote-executor-outcome-owner-wakeup-2026-07-15T17-27-27-928Z.report.json

**Attempts:** 3

## Links
- parent quest: formation-ledger-self-move-blocks-cluster-ops
- plan: solve/epics/service-data-affinity-placement.md

## Scope Pressure
- Changed files: 11
- Change bytes: 88078
- Owner areas: scripts/run-user-partition-remote-executor-outcome-owner-wakeup-scenarios.js, src/rebalancer, test/rebalancer
- Categories: other, runtime
- Action: split by owner area before the next attempt (11 files)
- Action: land or separate 3 owner areas: scripts/run-user-partition-remote-executor-outcome-owner-wakeup-scenarios.js, src/rebalancer, test/rebalancer
- Split plan:
  - src/rebalancer: 9 file(s)
  - scripts/run-user-partition-remote-executor-outcome-owner-wakeup-scenarios.js: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **user-partition-remote-executor-outcome-owner-wakeup-main** [solved] rung 3, attempts 3, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **user-partition-remote-executor-outcome-owner-wakeup-main**: The wake, exact eligibility shape, retry lifecycle, and diagnostics are one owner-boundary transition: a target-side executor outcome may schedule the canonical source owner through the existing dispatch ingress. The negative cases constrain that same transition rather than defining independent frontiers. [solve/changes/formation-ledger-self-move-blocks-cluster-ops/2026-07-15-wave4-live-remote-outcome-forensics.md]
- **user-partition-remote-executor-outcome-owner-wakeup-main**: Independent verification rejected attempt-1 because its exact artifact omitted all untracked new production modules, the red-on-revert test, and the sealed scenario emitter [subagent:wave4_remote_outcome_verify]
- **user-partition-remote-executor-outcome-owner-wakeup-main**: Independent verification rejected attempt-2: target-outcome diagnostics still used the operation target instead of the resolved source owner, the attack matrix missed outcome/type/armed-stop/diagnostics cases, and late-response follow-up lost TARGET_EXECUTOR_OUTCOME mode [subagent:wave4_remote_outcome_verify]
- **user-partition-remote-executor-outcome-owner-wakeup-main**: Ingested evidence from user-partition-remote-executor-outcome-owner-wakeup-2026-07-15T17-13-04-398Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/user-partition-remote-executor-outcome-owner-wakeup-2026-07-15T17-13-04-398Z.report.json]
- **user-partition-remote-executor-outcome-owner-wakeup-main**: Independent exact verification passed: canonical source-owner delivery, mode-aware bounded retry lifecycle, diagnostics, late-response rearm, terminal cleanup, negative shapes, adjacent suites, and scoped analyzers are green [subagent:wave4_remote_outcome_verify]
- **user-partition-remote-executor-outcome-owner-wakeup-main**: Independent aggregate verification passed: rejected attempts are same-base strict path subsets of the content-complete final aggregate, current source matches exactly, and three consecutive 38/38 scenario reports are green [subagent:wave4_remote_outcome_verify]
- **user-partition-remote-executor-outcome-owner-wakeup-main**: Ingested evidence from user-partition-remote-executor-outcome-owner-wakeup-2026-07-15T17-32-41-093Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/user-partition-remote-executor-outcome-owner-wakeup-2026-07-15T17-32-41-093Z.report.json]
- **user-partition-remote-executor-outcome-owner-wakeup-main**: Ingested evidence from user-partition-remote-executor-outcome-owner-wakeup-2026-07-15T17-32-41-093Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/user-partition-remote-executor-outcome-owner-wakeup-2026-07-15T17-32-41-093Z.report.json]

## Theories
- **theory-20260715-target-outcome-mode-retained-through-retry-lifecycle** [supported] frontier, frontier user-partition-remote-executor-outcome-owner-wakeup-main, layer ownership, mechanism target_outcome_mode_was_not_retained_across_diagnostics_and_late_response_rearm, owner operation_workflow_owner, boundary coordinator_created_remote_handoff_retry, modelGate npm run model:contracts

## Selected Theories
- **user-partition-remote-executor-outcome-owner-wakeup-main**: theory-20260715-target-outcome-mode-retained-through-retry-lifecycle

## Theory Results
- **theory-20260715-target-outcome-mode-retained-through-retry-lifecycle**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/user-partition-remote-executor-outcome-owner-wakeup-2026-07-15T17-27-27-928Z.report.json]
- **theory-20260715-target-outcome-mode-retained-through-retry-lifecycle**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/user-partition-remote-executor-outcome-owner-wakeup-2026-07-15T17-32-41-093Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T17:05:29.248Z | user-partition-remote-executor-outcome-owner-wakeup-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/user-partition-remote-executor-outcome-owner-wakeup/attempt-1.diff.json |
| 2026-07-15T17:11:29.684Z | user-partition-remote-executor-outcome-owner-wakeup-main | local-fix | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/user-partition-remote-executor-outcome-owner-wakeup/attempt-2.diff.json |
| 2026-07-15T17:27:28.027Z | user-partition-remote-executor-outcome-owner-wakeup-main | widen-scope | 0 -> 0 | flat | solved | theory-20260715-target-outcome-mode-retained-through-retry-lifecycle | diff:solve/changes/user-partition-remote-executor-outcome-owner-wakeup/attempt-3.diff.json |
