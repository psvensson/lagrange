# Solve report: helm-admin-default-deny-cutover

**Goal:** Default and legacy-insecure Helm values cannot render a cluster-published admin listener; pods bind the admin listener to loopback, REST health and readiness remain independently available, and a live node started from the rendered admin environment refuses an admin connection from a sibling network namespace.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/helm-admin-default-deny-cutover-2026-07-10T18-13-09-948Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/owner-boundary-hardening-and-unification/implementation-plan.md#W5
- plan: solve/epics/owner-boundary-hardening-and-unification.md

## Scope Pressure
- Changed files: 13
- Owner areas: CHANGELOG.md, charts, docs, scripts/helm, scripts/run-helm-admin-default-deny-contract.js, scripts/run-helm-admin-default-deny-live-scenario.js, test/fixtures, test/helm
- Categories: docs, other, test
- Action: split by owner area before the next attempt (13 files)
- Action: land or separate 8 owner areas: CHANGELOG.md, charts, docs, scripts/helm, scripts/run-helm-admin-default-deny-contract.js, scripts/run-helm-admin-default-deny-live-scenario.js, test/fixtures, test/helm
- Split plan:
  - charts: 6 file(s)
  - CHANGELOG.md: 1 file(s)
  - docs: 1 file(s)
  - scripts/helm: 1 file(s)
  - scripts/run-helm-admin-default-deny-contract.js: 1 file(s)
  - scripts/run-helm-admin-default-deny-live-scenario.js: 1 file(s)
  - test/fixtures: 1 file(s)
  - test/helm: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **helm-admin-default-deny-cutover-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **helm-admin-default-deny-cutover-main**: Independent verifier approved W5 after attacking schema and skipped-schema paths, legacy and direct insecure values, extraEnv value/valueFrom/port injections, Service variants, duplicate env concealment, source freshness, non-vacuous namespace isolation, cleanup, and scoped/static ratchets. [subagent:/root/w5_implementation_verify]
- **helm-admin-default-deny-cutover-main**: Live run 2026-07-10T18:13:09.948Z built the current source image, matched the host/booted fingerprint, observed node-local admin health 200, sibling REST health 200 and structured readiness, sibling admin ECONNREFUSED, and zero run-resource cleanup errors. [test-output/reports/helm-admin-default-deny-cutover-2026-07-10T18-13-09-948Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-10T18:13:47.399Z | helm-admin-default-deny-cutover-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/helm-admin-default-deny-cutover/attempt-2.diff |
