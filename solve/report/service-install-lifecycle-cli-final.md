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
- **service-install-lifecycle-cli-final-main**: Independent verification passed: the bounded successor receipt is byte-identical to the fully verified S5c artifact, applies cleanly to e19a192, preserves all nine postimages and proofs, and adds no behavior or scope. [subagent:phase1_s5a_preflight]
- **service-install-lifecycle-cli-final-main**: The sealed lifecycle seam reproduces on current HEAD: the fresh full scenario engages the shipped authenticated PG-wire and SEA paths and reports priority 0 with all four guard files green; this successor is a terminal receipt, not a stale symptom-disambiguation attempt. [test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T16-39-23-329Z.report.json]
- **service-install-lifecycle-cli-final-main**: Independent aggregate verification passed at checkpoint 2b381bcc: the exact nine-path base-to-checkpoint delta equals the approved attempt, all blobs match with no drift, and a fresh isolated scenario passed 4/4. [subagent:phase1_s5a_preflight]
- **service-install-lifecycle-cli-final-main**: Live validation: the shipped src/sea-entry.js child process connected with password authentication to a started production PG-wire runtime, emitted exact INSTALL/SHOW/REMOVE SQL envelopes and typed rows, rejected the wrong password before any SqlRequest, and drained a 20,000-row list before exit; the same SEA bundle loaded its pg closure and failed closed when unreachable. (rules out: Do not treat injected SQL-client unit doubles or static bundle inclusion alone as proof that the operator-facing CLI reaches authenticated PG-wire or flushes process output.) [test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T16-39-23-329Z.report.json]

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
