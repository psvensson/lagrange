# Solve report: service-install-lifecycle-cli-final

**Goal:** Bounded terminal successor: the shipped lagrange service install/dev-install/list/status/remove surface uses only authenticated PG-wire lifecycle SQL, pins remote or locally built OCI manifests, requires replayable mutation idempotency, drains typed output, and fails every validation, build, write, transport, authorization, or ambiguous-result error without fallback.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T16-39-23-329Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- parent quest: service-install-lifecycle-cli
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 9
- Change bytes: 88890
- Owner areas: scripts/checks, src/cli, src/sea-entry.js, test/cli, test/integration, test/packaging
- Categories: other, runtime, test
- Action: land or separate 6 owner areas: scripts/checks, src/cli, src/sea-entry.js, test/cli, test/integration, test/packaging
- Split plan:
  - src/cli: 4 file(s)
  - scripts/checks: 1 file(s)
  - src/sea-entry.js: 1 file(s)
  - test/cli: 1 file(s)
  - test/integration: 1 file(s)
  - test/packaging: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **service-install-lifecycle-cli-final-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
_(none recorded)_

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T17:00:30.544Z | service-install-lifecycle-cli-final-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-install-lifecycle-cli-final/attempt-1.diff |
