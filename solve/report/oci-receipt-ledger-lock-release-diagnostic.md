# Solve report: oci-receipt-ledger-lock-release-diagnostic

**Goal:** Receipt-ledger open failures keep the primary typed fail-closed error authoritative while any failed best-effort directory-lock release is exposed on that same error as a typed lock_release_failed cleanup diagnostic, leaving zero silent-catch violations without logging, behavior, or static-metric regressions. doneWhen: solve/oracle/oci-receipt-ledger-lock-release-diagnostic.json is done only when the focused dual-failure regression, complete receipt-ledger tests, silent-catch and scoped guideline audits, lint, metrics, and unused/dependency checks are green without baseline changes.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/oci-receipt-ledger-lock-release-diagnostic.json

**Attempts:** 1

## Links
- spec: architecture/oci-runtime-host-contract.md#idempotency-cleanup-and-restart-posture
- plan: solve/epics/roadmap-integrity-wave-0.md

## Scope Pressure
- Changed files: 2
- Change bytes: 3881
- Owner areas: src/runtime, test/runtime
- Categories: runtime, test
- Split plan:
  - src/runtime: 1 file(s)
  - test/runtime: 1 file(s)
- Signals: none

## Frontiers
- **oci-receipt-ledger-lock-release-diagnostic-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **oci-receipt-ledger-lock-release-diagnostic-main**: A corrupted receipt manifest plus the existing directory-lock token option reaches the real ledger-open cleanup path: recovery throws receipt_unavailable and release throws receipt_volume_lock_unavailable; the focused regression failed before the source change because cleanupFailure was absent. (rules out: Treating successful recovery tests or the static violation alone as proof of the dual-failure contract.) [test/runtime/oci-host-agent-receipt-ledger.test.js]
- **oci-receipt-ledger-lock-release-diagnostic-main**: REUSED the existing directory-lock release path, durable error class/codes, recovery error mapping, and lockOptions seam; EXTENDED only the dual-failure thrown primary error with a frozen cleanupFailure {kind,error}; NEW no logger, warning, retry, callback, mutable state, test hook, or alternate recovery owner. (rules out: Logging, retrying, replacing the primary failure, or adding a new diagnostic owner.) [src/runtime/oci-host-agent-receipt-ledger.js]
- **oci-receipt-ledger-lock-release-diagnostic-main**: Focused receipt-ledger and enrollment tests pass 17 assertions; silent-catch, literal, decision-boundary, hot-path-diagnostic, scoped cyclomatic, and scoped cognitive audits report zero; lint, duplication, unused, and dependency gates pass. The pre-existing global cognitive value remains 184 against baseline 183, unchanged by this scoped-zero patch. (rules out: Raising any baseline or attributing the inherited global cognitive violation to this attempt.) [solve/oracle/oci-receipt-ledger-lock-release-diagnostic.json]
- **oci-receipt-ledger-lock-release-diagnostic-main**: Independent exact and aggregate verification passed: the real dual-failure path was red on base, primary recovery failure remains authoritative, frozen typed cleanup diagnostic is observable, and focused plus aggregate gates pass without baseline or scope changes. [subagent:oci_receipt_ledger_review_72371224_20260715T1120CEST]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T09:04:10.631Z | oci-receipt-ledger-lock-release-diagnostic-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/oci-receipt-ledger-lock-release-diagnostic/attempt-1.diff |
