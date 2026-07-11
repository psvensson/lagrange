# Solve report: solver-proof-artifact-content-addressing

**Goal:** New large attempt patches use verified content-addressed descriptors while old inline paths remain readable; identical payloads are stored once, missing or tampered content fails audit, and a migration tool verifies every rewrite.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/solver-proof-artifact-content-addressing-2026-07-11T13-47-46-314Z.report.json

**Attempts:** 2

## Links
- spec: solve/specs/owner-boundary-hardening-and-unification/implementation-plan.md#W12
- plan: solve/epics/owner-boundary-hardening-and-unification.md

## Scope Pressure
- Changed files: 22
- Owner areas: scripts/migrate-solver-proof-artifacts.js, scripts/run-solver-proof-artifact-content-addressing-scenarios.js, scripts/solve, solve, test/solve
- Categories: other, workflow
- Action: split by owner area before the next attempt (22 files)
- Action: land or separate 5 owner areas: scripts/migrate-solver-proof-artifacts.js, scripts/run-solver-proof-artifact-content-addressing-scenarios.js, scripts/solve, solve, test/solve
- Split plan:
  - scripts/solve: 9 file(s)
  - solve: 8 file(s)
  - test/solve: 3 file(s)
  - scripts/migrate-solver-proof-artifacts.js: 1 file(s)
  - scripts/run-solver-proof-artifact-content-addressing-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **solver-proof-artifact-content-addressing-main** [solved] rung 2, attempts 2, metric 0 -> 0 — fresh measured evidence no longer satisfies frontier

## Findings
- **solver-proof-artifact-content-addressing-main**: W12 extends the existing change-artifact owner and step/handoff consumers; it does not add a parallel resolver. Inline, historical-gzip, and content-addressed descriptor forms all converge through one verified logical payload reader. [scripts/solve/change-artifact.js]
- **solver-proof-artifact-content-addressing-main**: The pre-migration exact scenario failed only on the missing migration receipt while descriptor/object guards passed, proving the zero-migration state cannot satisfy W12. [test-output/reports/solver-proof-artifact-content-addressing-2026-07-11T13-24-04-503Z.report.json]
- **solver-proof-artifact-content-addressing-main**: The W11-bound migration rewrote both 43,062-byte eligible duplicates into two descriptors backed by one 11,892-byte gzip object, preserved all 248 payload-backed baseline reference identities plus two explicit historical-invalid records, and reduced eligible duplicate bytes from 43,062 to zero. [solve/changes/solver-proof-artifact-content-addressing/migration-receipt.json]
- **solver-proof-artifact-content-addressing-main**: Migration replay is fail-closed when a receipt already exists, while receipt-loss recovery reconstructs an atomic receipt from already-verified descriptors and explicitly records recovered rather than newly rewritten artifacts. [test/solve/content-addressed-change-artifact.test.js]
- **solver-proof-artifact-content-addressing-main**: The pre-existing untracked formation-ledger quorum report is excluded from W12 and must not enter its attempt artifact or commit. [git-status:solve/report/formation-ledger-quorum-concentrated-replace-churn-60s.md]
- **solver-proof-artifact-content-addressing-main**: Independent W12 verifier approved after descriptor/object representation tampering, forged and partial receipt coverage, missing/traversal storage, receipt-loss recovery, large auto-diff handoff, and rejected-write orphan cleanup all passed adversarial replay; final exact reports execute 99 guard assertions plus migration validation. [subagent:/root/w12_artifact_verify]
- **solver-proof-artifact-content-addressing-main**: Ingested evidence from solver-proof-artifact-content-addressing-2026-07-11T13-44-42-297Z.report.json. Metric: 0 -> 2. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-proof-artifact-content-addressing-2026-07-11T13-44-42-297Z.report.json]
- **solver-proof-artifact-content-addressing-main**: Ingested evidence from solver-proof-artifact-content-addressing-2026-07-11T13-44-42-297Z.report.json. Metric: 2 -> 2. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-proof-artifact-content-addressing-2026-07-11T13-44-42-297Z.report.json]
- **solver-proof-artifact-content-addressing-main**: Ingested evidence from solver-proof-artifact-content-addressing-2026-07-11T13-45-45-276Z.report.json. Metric: 2 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-proof-artifact-content-addressing-2026-07-11T13-45-45-276Z.report.json]
- **solver-proof-artifact-content-addressing-main**: Ingested evidence from solver-proof-artifact-content-addressing-2026-07-11T13-45-45-276Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-proof-artifact-content-addressing-2026-07-11T13-45-45-276Z.report.json]
- **solver-proof-artifact-content-addressing-main**: Ingested evidence from solver-proof-artifact-content-addressing-2026-07-11T13-47-46-314Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-proof-artifact-content-addressing-2026-07-11T13-47-46-314Z.report.json]
- **solver-proof-artifact-content-addressing-main**: Ingested evidence from solver-proof-artifact-content-addressing-2026-07-11T13-47-46-314Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/solver-proof-artifact-content-addressing-2026-07-11T13-47-46-314Z.report.json]
- **solver-proof-artifact-content-addressing-main**: Post-fix independent verification approved immutable attempt 2: descriptor, 182,579-byte payload, and object hashes match the log; the payload contains a full Git binary patch and reverse-applies; 22 exact paths include the post-terminal correction while bogus nested headers, generated bookkeeping, and the formation report are excluded; handoff owns all three content objects. [subagent:/root/w12_artifact_verify]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-11T13:41:23.360Z | solver-proof-artifact-content-addressing-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/solver-proof-artifact-content-addressing/attempt-1.diff.json |
| 2026-07-11T13:48:04.259Z | solver-proof-artifact-content-addressing-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/solver-proof-artifact-content-addressing/attempt-2.diff.json |
