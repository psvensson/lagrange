# Solve report: installable-service-artifact-owner

**Goal:** Given a normalized external manifest, one installable artifact owner resolves remote OCI descriptor bytes or an OCI image-layout descriptor through the same verification path, recomputes the declared sha256 digest, verifies the declared container or WASM payload media type, and enforces an explicit detached-signature policy with typed fail-closed outcomes, without persisting catalog state or activating a runtime.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/installable-service-artifact-owner/installable-service-artifact-owner-2026-07-14T10-12-36-515Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 5
- Change bytes: 38465
- Owner areas: architecture, scripts/checks, src/service, test/service
- Categories: docs, other, runtime, test
- Action: land or separate 4 owner areas: architecture, scripts/checks, src/service, test/service
- Split plan:
  - src/service: 2 file(s)
  - architecture: 1 file(s)
  - scripts/checks: 1 file(s)
  - test/service: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **installable-service-artifact-owner-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **installable-service-artifact-owner-main**: Ingested evidence from installable-service-artifact-owner-2026-07-14T10-12-36-515Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/installable-service-artifact-owner/installable-service-artifact-owner-2026-07-14T10-12-36-515Z.report.json]
- **installable-service-artifact-owner-main**: Ingested evidence from installable-service-artifact-owner-2026-07-14T10-12-36-515Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/installable-service-artifact-owner/installable-service-artifact-owner-2026-07-14T10-12-36-515Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T10:13:07.445Z | installable-service-artifact-owner-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/installable-service-artifact-owner/attempt-1.diff |
