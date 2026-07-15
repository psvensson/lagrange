# Solve report: transition-mutation-budget-doom-loop

**Goal:** A priority operation's transition mutations never enter a permanent sub-viable-timeout retry loop: in run-23 resolveOperationMutationQueryTimeoutMs returned 1ms whenever the priority dispatch transition budget was exhausted instead of failing fast (replica-operation-repository-mutation-gateway-methods.js:477-486), and the budget anchors at operation.createdAt with 5s for sql_write_operations partitions (operation-workflow-transition-orchestration.js:530-533, operation-workflow-owner-shared.js:371) — so any priority operation older than its budget entered a permanent 1ms doom loop where no retry can ever succeed (941c4acd from 08:02:53 onward), independently guaranteeing priority transition death after any 5s delay and masking real participant responses. The fix makes budget exhaustion an explicit typed outcome (fail fast into the existing deferred-retry/reaper machinery, or re-anchor the budget per attempt rather than at creation) so a delayed operation retries with a viable timeout or terminalizes honestly — no timeout raises. Proven by a deterministic unit/DT test that ages an operation past its budget and asserts the mutation path either uses a viable timeout or fails typed (red on the current head), then the standard suites.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/transition-mutation-budget-doom-loop-2026-07-15T11-08-56-058Z.report.json

**Attempts:** 1

## Links
- parent quest: movielens-affinity-placement-demo

## Scope Pressure
- Changed files: 4
- Change bytes: 10944
- Owner areas: architecture, src/rebalancer, test/rebalancer
- Categories: docs, runtime
- Action: land or separate 3 owner areas: architecture, src/rebalancer, test/rebalancer
- Split plan:
  - src/rebalancer: 2 file(s)
  - architecture: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **transition-mutation-budget-doom-loop-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **transition-mutation-budget-doom-loop-main**: DT red-on-revert proven for test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js [dt:solve/changes/dt-prove/priority-recovery-dispatch-pending-timeout-reentry.test.js-2026-07-15T11-07-07-272Z.json]
- **transition-mutation-budget-doom-loop-main**: Full contract/model suite passed for the priority transition owner change; the tracked active-gate TLC route remains the stable evidence projection after discarding its timestamp-only rerun delta [contract:architecture/contracts/evidence/active-gate-tlc-route.model.report.json]
- **transition-mutation-budget-doom-loop-main**: Independent exact-attempt verification passed: aged priority transitions receive full per-attempt budgets and red-on-revert is behavioral [subagent:transition-mutation-budget-verifier]
- **transition-mutation-budget-doom-loop-main**: Independent aggregate verification passed: final three-path semantic patch preserves transport and transition behavior outside budget anchoring [subagent:transition-mutation-budget-verifier]
- **transition-mutation-budget-doom-loop-main**: Ingested evidence from transition-mutation-budget-doom-loop-2026-07-15T11-12-53-498Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/transition-mutation-budget-doom-loop-2026-07-15T11-12-53-498Z.report.json]
- **transition-mutation-budget-doom-loop-main**: Ingested evidence from transition-mutation-budget-doom-loop-2026-07-15T11-12-53-498Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/transition-mutation-budget-doom-loop-2026-07-15T11-12-53-498Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T11:08:56.141Z | transition-mutation-budget-doom-loop-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/transition-mutation-budget-doom-loop/attempt-1.diff |
