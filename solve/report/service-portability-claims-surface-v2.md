# Solve report: service-portability-claims-surface-v2

**Goal:** The public capability matrix, README, WASM guide, and distributed-SQL example consistently label the current wasm_component path as a JavaScript-envelope rehearsal, keep native_js internal and OCI callbacks unsupported, and the service-portability-claims-surface scenario fails on contradictory wording or example metadata.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-portability-claims-surface/service-portability-claims-surface-2026-07-14T07-07-29-830Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r1--truthful-capability-contract
- parent quest: service-portability-claims-surface
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 11
- Change bytes: 28491
- Owner areas: README.md, docs, examples, scripts/checks, test/scripts
- Categories: docs, other, test
- Action: split by owner area before the next attempt (11 files)
- Action: land or separate 5 owner areas: README.md, docs, examples, scripts/checks, test/scripts
- Split plan:
  - examples: 5 file(s)
  - docs: 2 file(s)
  - scripts/checks: 2 file(s)
  - README.md: 1 file(s)
  - test/scripts: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **service-portability-claims-surface-v2-main** [open] rung 1, attempts 1, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **service-portability-claims-surface-v2-main**: Independent verification rejected the exact attempt because it broke the representative examples-catalog fixture and left public genuine-WASM claims and semantic paraphrases outside the checker; the final successor must atomically include fixture alignment and broader claims attacks. [subagent:verify_portability_plan]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T06:45:38.338Z | service-portability-claims-surface-v2-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-portability-claims-surface-v2/attempt-1.diff |
