# Solve report: developer-smoke-proof

**Goal:** One public npm run test:smoke command executes the single authoritative developer-smoke acceptance manifest through the existing fail-closed acceptance executor, exercises the sealed V1 safety and owner contracts, fails on empty, missing, skipped, timed-out, or removed-command proof, completes below its 60-second hard ceiling in three consecutive measured runs, and leaves test:fast and CI unchanged.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/developer-smoke-proof-2026-07-12T07-54-26-904Z.report.json

**Attempts:** 1

## Links
- spec: solve/epics/developer-velocity-maintainability-and-product-readiness.md#v1--developer-smoke-proof
- plan: solve/epics/developer-velocity-maintainability-and-product-readiness.md

## Scope Pressure
- Changed files: 4
- Change bytes: 7140
- Owner areas: scripts/run-developer-smoke-proof-scenarios.js, solve, test/manifests, test/scripts
- Categories: other, test, workflow
- Action: land or separate 4 owner areas: scripts/run-developer-smoke-proof-scenarios.js, solve, test/manifests, test/scripts
- Split plan:
  - scripts/run-developer-smoke-proof-scenarios.js: 1 file(s)
  - solve: 1 file(s)
  - test/manifests: 1 file(s)
  - test/scripts: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **developer-smoke-proof-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **developer-smoke-proof-main**: V1 reuses the versioned acceptance manifest schema, fail-closed acceptance executor, and run-test-files; it adds one manifest instance and public alias without introducing another runner or test-list owner. [test/manifests/developer-smoke-proof-manifest.json]
- **developer-smoke-proof-main**: Independent source verifier approved the executable proof diff: one exact 17-test manifest, existing fail-closed owners, red semantics, three measured passes, and no CI or test:fast drift. [subagent:/root/v1_source_verification]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-12T07:54:44.415Z | developer-smoke-proof-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/developer-smoke-proof/attempt-1.diff |
