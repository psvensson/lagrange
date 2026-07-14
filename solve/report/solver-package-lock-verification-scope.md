# Solve report: solver-package-lock-verification-scope

**Goal:** Solver exact and aggregate source verification classify package-lock.json as content-bound source so a dependency reclassification cannot reach terminal handoff with an aggregate fingerprint that omits the lockfile.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/solver-package-lock-verification-scope/solver-package-lock-verification-scope-2026-07-14T16-04-06-372Z.report.json

**Attempts:** 2

## Links
- spec: docs/steering/workflow-guidelines/solver-quests.md#source-change-verification-contract
- plan: docs/steering/workflow-guidelines/solver-quests.md

## Scope Pressure
- Changed files: 3
- Change bytes: 8139
- Owner areas: scripts/checks, scripts/solve, test/solve
- Categories: other, workflow
- Action: land or separate 3 owner areas: scripts/checks, scripts/solve, test/solve
- Split plan:
  - scripts/checks: 1 file(s)
  - scripts/solve: 1 file(s)
  - test/solve: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **solver-package-lock-verification-scope-main** [solved] rung 1, attempts 2, metric 1 -> 0 — exact terminal source attempt was rejected

## Findings
- **solver-package-lock-verification-scope-main**: Ingested evidence from solver-package-lock-verification-scope-2026-07-14T16-00-27-301Z.report.json. Metric: unknown -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-package-lock-verification-scope/solver-package-lock-verification-scope-2026-07-14T16-00-27-301Z.report.json]
- **solver-package-lock-verification-scope-main**: Ingested evidence from solver-package-lock-verification-scope-2026-07-14T16-00-27-301Z.report.json. Metric: 1 -> 1. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-package-lock-verification-scope/solver-package-lock-verification-scope-2026-07-14T16-00-27-301Z.report.json]
- **solver-package-lock-verification-scope-main**: Ingested evidence from solver-package-lock-verification-scope-2026-07-14T16-00-52-882Z.report.json. Metric: 1 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-package-lock-verification-scope/solver-package-lock-verification-scope-2026-07-14T16-00-52-882Z.report.json]
- **solver-package-lock-verification-scope-main**: Ingested evidence from solver-package-lock-verification-scope-2026-07-14T16-00-52-882Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-package-lock-verification-scope/solver-package-lock-verification-scope-2026-07-14T16-00-52-882Z.report.json]
- **solver-package-lock-verification-scope-main**: prefix classification also matched package-lock.json.bak, package-lock.json5, and package-lock.json/nested, violating the sealed exact-root lockfile scope and leaving focused edge coverage incomplete [subagent:phase1_s5a_preflight]
- **solver-package-lock-verification-scope-main**: Ingested evidence from solver-package-lock-verification-scope-2026-07-14T16-04-06-372Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-package-lock-verification-scope/solver-package-lock-verification-scope-2026-07-14T16-04-06-372Z.report.json]
- **solver-package-lock-verification-scope-main**: Ingested evidence from solver-package-lock-verification-scope-2026-07-14T16-04-06-372Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-package-lock-verification-scope/solver-package-lock-verification-scope-2026-07-14T16-04-06-372Z.report.json]
- **solver-package-lock-verification-scope-main**: independent replacement verification passed for exact-root lockfile scope, lookalike attacks, same-base rejection supersession, clean pre-commit, three green scenarios, red revert, and true four-path companion aggregate [subagent:phase1_s5a_preflight]
- **solver-package-lock-verification-scope-main**: independent aggregate verification passed for the exact three-path checkpoint, resolved rejected attempt, no unrelated scope or drift, and fresh terminal proof [subagent:phase1_s5a_preflight]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T16:01:11.320Z | solver-package-lock-verification-scope-main | observe | 1 -> 0 | progress | solved |  | diff:solve/changes/solver-package-lock-verification-scope/attempt-1.diff |
| 2026-07-14T16:04:23.245Z | solver-package-lock-verification-scope-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/solver-package-lock-verification-scope/attempt-2.diff |
