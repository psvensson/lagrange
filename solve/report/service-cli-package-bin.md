# Solve report: service-cli-package-bin

**Goal:** The package command metadata and lockfile expose lagrange through src/sea-entry.js while preserving the existing lagrange-admin binary.

**Class:** process · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T14-22-26-781Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 2
- Change bytes: 771
- Owner areas: package-lock.json, package.json
- Categories: other, workflow
- Split plan:
  - package-lock.json: 1 file(s)
  - package.json: 1 file(s)
- Signals: none

## Frontiers
- **service-cli-package-bin-main** [solved] rung 0, attempts 1, metric 1 -> 0

## Findings
- **service-cli-package-bin-main**: Model not applicable: the exact two-line package and lockfile bin-map change adds no runtime state, transition, concurrency, architecture, or lifecycle semantics. [contract:solve/quests/service-cli-package-bin.json#package-metadata-only]
- **service-cli-package-bin-main**: Independent exact verification passed: both bin maps align, each removal is red, lagrange-admin is unchanged, and the patch adds no runtime concurrency or model semantics. [subagent:verify_s5a_package_bin]
- **service-cli-package-bin-main**: Independent post-checkpoint aggregate verification passed: package.json matches the reviewed aggregate bytes and the committed lockfile remains aligned with no in-scope drift. [subagent:verify_s5a_package_bin]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T14:22:35.366Z | service-cli-package-bin-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/service-cli-package-bin/attempt-2.diff |
