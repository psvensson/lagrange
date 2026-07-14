# Solve report: service-init-scaffold

**Goal:** The shipped lagrange service init <directory> command atomically creates a deterministic non-overwriting OCI-container Node service source project and a version-1 external-manifest template that intentionally omits artifact.digest until S5b builds the OCI layout, while initialization performs no cluster, SQL, WebSocket, catalog, or runtime work.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-init-scaffold/service-init-scaffold-2026-07-14T14-45-37-866Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 6
- Change bytes: 29677
- Owner areas: scripts/checks, src/cli, src/sea-entry.js, test/cli, test/packaging
- Categories: other, runtime, test
- Action: land or separate 5 owner areas: scripts/checks, src/cli, src/sea-entry.js, test/cli, test/packaging
- Split plan:
  - src/cli: 2 file(s)
  - scripts/checks: 1 file(s)
  - src/sea-entry.js: 1 file(s)
  - test/cli: 1 file(s)
  - test/packaging: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **service-init-scaffold-main** [solved] rung 0, attempts 1, metric 2 -> 0

## Findings
- **service-init-scaffold-main**: Independent exact verification passed for the canonical six-path product patch: three scenario samples and static gates were green, while routing and no-clobber regression controls were red. [subagent:verify_s5a_exact]
- **service-init-scaffold-main**: Independent post-checkpoint aggregate verification passed for the unchanged canonical six-path product scope and reused complete exact evidence. [subagent:phase1_s5b_preflight]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T14:46:20.392Z | service-init-scaffold-main | observe | 2 -> 0 | progress | no_evidence |  | diff:solve/changes/service-init-scaffold/attempt-1.diff |
