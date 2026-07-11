# Solve report: solver-proof-artifact-census

**Goal:** A reproducible report accounts for every Quest changeRef, referenced and unreferenced payload byte, SHA-256 duplicate group, encoding, and historical readability status, and reconciles its total byte count to the filesystem.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/solver-proof-artifact-census-2026-07-11T13-14-17-498Z.report.json

**Attempts:** 2

## Links
- spec: solve/specs/owner-boundary-hardening-and-unification/implementation-plan.md#W11
- plan: solve/epics/owner-boundary-hardening-and-unification.md

## Scope Pressure
- Changed files: 6
- Owner areas: scripts/run-solver-proof-artifact-census-scenarios.js, scripts/solve, solve, test/solve
- Categories: other, workflow
- Action: land or separate 4 owner areas: scripts/run-solver-proof-artifact-census-scenarios.js, scripts/solve, solve, test/solve
- Split plan:
  - scripts/solve: 2 file(s)
  - solve: 2 file(s)
  - scripts/run-solver-proof-artifact-census-scenarios.js: 1 file(s)
  - test/solve: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **solver-proof-artifact-census-main** [solved] rung 2, attempts 2, metric 0 -> 0

## Findings
- **solver-proof-artifact-census-main**: W11 reuses the existing Solver change-artifact path vocabulary and scenario-harness report shape, extends them with a read-only census, and adds no storage or resolver authority; repository search found no existing artifact census owner to reuse. [scripts/solve/change-artifact.js]
- **solver-proof-artifact-census-main**: The first real census measured 187 proof payloads, 248 changeRef occurrences, and 12,724,867 reconciled stored bytes; 246 payload refs are readable, one uses the historical gzip sibling, and two pre-integrity source-path refs are explicitly classified historical-invalid rather than presented as readable proof. [test-output/reports/solver-proof-artifact-census-2026-07-11T13-07-08-213Z.report.json]
- **solver-proof-artifact-census-main**: The measured largest threshold containing an exact duplicate group is 32 KiB (43,062 duplicate payload bytes), and eligible artifact gzip savings are 85.13%, fixing W12's inline threshold at 32 KiB and compression at gzip. [test-output/reports/solver-proof-artifact-census-2026-07-11T13-07-08-213Z.report.json]
- **solver-proof-artifact-census-main**: The pre-existing untracked formation-ledger quorum report is excluded from W11 and must not enter its attempt artifact or commit. [git-status:solve/report/formation-ledger-quorum-concentrated-replace-churn-60s.md]
- **solver-proof-artifact-census-main**: Independent W11 verifier approved after empty-inventory and missing-guard adversarial attacks fail closed; focused guard passes 33 assertions and an independent filesystem count/sum matches 187 payloads and 12,724,867 bytes with all 248 string changeRefs hashed and classified. [subagent:/root/w11_census_verify]
- **solver-proof-artifact-census-main**: Ingested evidence from solver-proof-artifact-census-2026-07-11T13-14-17-498Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-proof-artifact-census-2026-07-11T13-14-17-498Z.report.json]
- **solver-proof-artifact-census-main**: Ingested evidence from solver-proof-artifact-census-2026-07-11T13-14-17-498Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-proof-artifact-census-2026-07-11T13-14-17-498Z.report.json]
- **solver-proof-artifact-census-main**: Post-attempt independent verification approved the exact captured W11 artifact (SHA-256 86994da872870f07ab8f1269144fd7036f6e27531c0793f4dfb2b1085776e653); its six paths exclude generated bookkeeping and the formation report, reverse-apply cleanly, and fresh focused/census proofs remain green with every current string reference classified. [subagent:/root/w11_census_verify]
- **solver-proof-artifact-census-main**: Ingested evidence from solver-proof-artifact-census-2026-07-11T13-15-28-399Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-proof-artifact-census-2026-07-11T13-15-28-399Z.report.json]
- **solver-proof-artifact-census-main**: Ingested evidence from solver-proof-artifact-census-2026-07-11T13-15-28-399Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-proof-artifact-census-2026-07-11T13-15-28-399Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T13:13:33.325Z | solver-proof-artifact-census-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/solver-proof-artifact-census/attempt-1.diff |
| 2026-07-11T13:14:31.592Z | solver-proof-artifact-census-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/solver-proof-artifact-census/attempt-1.diff |
