# Solve report: join-retry-patience-selectable

**Goal:** A joining node survives transient seed-side unreadiness instead of exiting: the existing patient join budget (attemptBudgetMode ELAPSED_ONLY, already implemented in resolveRetryableJoinResumeDecision) is reachable for default retryable failures — either by documented permanent operator config or by a decided default posture — so a joiner facing a transiently stale seed gate (e.g. LEADER_METADATA_INCOMPLETE after a leadership move) keeps retrying within maxElapsedMs rather than exhausting 4 attempts in ~26s and exiting the process (the fatal join-abort family — same invariant shape as CL-024: a joining node must degrade or keep retrying, never abort the process, when the blocker is transient). Proven by deterministic red-on-revert tests driving the resume-decision machinery through both postures; no weakening of non-retryable failure handling.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/join-retry-patience-selectable-2026-07-15T13-48-35-907Z.report.json

**Attempts:** 2

## Links
- parent quest: movielens-affinity-placement-demo

## Scope Pressure
- Changed files: 8
- Change bytes: 21132
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/bootstrap, src/constants, src/entrypoint-runtime-join-config.js, src/index.js, test/bootstrap
- Categories: other, runtime
- Action: land or separate 6 owner areas: scripts/run-placement-affinity-scenarios.js, src/bootstrap, src/constants, src/entrypoint-runtime-join-config.js, src/index.js, test/bootstrap
- Split plan:
  - src/bootstrap: 3 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
  - src/constants: 1 file(s)
  - src/entrypoint-runtime-join-config.js: 1 file(s)
  - src/index.js: 1 file(s)
  - test/bootstrap: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **join-retry-patience-selectable-main** [solved] rung 2, attempts 2, metric 0 -> 0

## Findings
- **join-retry-patience-selectable-main**: Ingested evidence from join-retry-patience-selectable-2026-07-15T13-39-09-172Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/join-retry-patience-selectable-2026-07-15T13-39-09-172Z.report.json]
- **join-retry-patience-selectable-main**: DT red-on-revert proven for test/bootstrap/join-retry-patience-selectable.test.js [dt:solve/changes/dt-prove/join-retry-patience-selectable.test.js-2026-07-15T13-41-19-214Z.json]
- **join-retry-patience-selectable-main**: DT red-on-revert proven for test/bootstrap/join-retry-patience-selectable.test.js [dt:solve/changes/dt-prove/join-retry-patience-selectable.test.js-2026-07-15T13-41-36-494Z.json]
- **join-retry-patience-selectable-main**: Independent verification passed: exact eight-file attempt preserves bounded retry ownership and every fail-closed path, while permanent elapsed-only config reaches ordinary retryable failures and the owner-only directed test is behaviorally red on revert. [subagent:join_retry_verifier]
- **join-retry-patience-selectable-main**: Independent post-attempt verification passed for both exact attempt 3 and aggregate source: byte-identical eight-file payload, fresh distinct three-run closure evidence, and correct replacement of the null-baseline integrity violation. [subagent:join_retry_verifier]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T13:40:26.143Z | join-retry-patience-selectable-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/join-retry-patience-selectable/attempt-2.diff |
| 2026-07-15T13:48:46.253Z | join-retry-patience-selectable-main | local-fix | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/join-retry-patience-selectable/attempt-3.diff |
