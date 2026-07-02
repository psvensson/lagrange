# Solve report: release-0-1-0-alpha

**Goal:** Lagrange 0.1.0-alpha is releasable: version set to 0.1.0 and marked experimental; CHANGELOG.md + RELEASE.md exist with an honest convergence Known-Limitations section (eventual-stabilization proven, bounded-time rolling-restart convergence a documented latency tail near its statistical floor); CI wired (.github/workflows/ci.yml runs test:gate on PR/push; release.yml on v* tag runs test:ci then build:all, publishes the distroless Docker image, packages the lagrange-node Helm chart, and attaches SEA binaries + SHA256SUMS to the GitHub Release); a charts/lagrange-node Helm chart (StatefulSet + headless service, ports 8080/8081/9080) renders via helm template; and end-to-end verification on a clean checkout passes: test:ci green, Docker image boots opening 8080/8081/8082, SEA binary runs, helm template renders. Terminal evidence recorded, then annotated tag v0.1.0.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/release-0-1-0-alpha-readiness.json

**Attempts:** 1

## Current Blocker
- Frontier: release-0-1-0-alpha-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for release-0-1-0-alpha-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 17
- Owner areas: .forgejo, CHANGELOG.md, Dockerfile, RELEASE.md, charts, src/bootstrap, src/control-plane, src/index.js, src/sea-entry.js
- Categories: other, runtime
- Action: split by owner area before the next attempt (17 files)
- Action: land or separate 9 owner areas: .forgejo, CHANGELOG.md, Dockerfile, RELEASE.md, charts, src/bootstrap, src/control-plane, src/index.js, src/sea-entry.js
- Split plan:
  - charts: 8 file(s)
  - .forgejo: 2 file(s)
  - CHANGELOG.md: 1 file(s)
  - Dockerfile: 1 file(s)
  - RELEASE.md: 1 file(s)
  - src/bootstrap: 1 file(s)
  - src/control-plane: 1 file(s)
  - src/index.js: 1 file(s)
  - src/sea-entry.js: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **release-0-1-0-alpha-main** [solved] rung 1, attempts 1, metric 0 -> 0

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
| 2026-07-02T16:21:01.257Z | release-0-1-0-alpha-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/release-0-1-0-alpha/release-scope.diff |
