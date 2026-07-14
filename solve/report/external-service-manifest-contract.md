# Solve report: external-service-manifest-contract

**Goal:** A versioned external service manifest contract accepts deterministically normalized, digest-pinned OCI artifacts for oci_container and wasm_component runtimes, rejects native_js and runtime/media mismatches with typed errors, and leaves artifact resolution, signature verification, catalog persistence, and activation to their downstream owners.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/external-service-manifest-contract/external-service-manifest-contract-2026-07-14T09-56-51-777Z.report.json

**Attempts:** 2

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 5
- Change bytes: 43556
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
- **external-service-manifest-contract-main** [solved] rung 2, attempts 2, metric 0 -> 0

## Findings
- **external-service-manifest-contract-main**: Ingested evidence from external-service-manifest-contract-2026-07-14T09-56-51-777Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/external-service-manifest-contract/external-service-manifest-contract-2026-07-14T09-56-51-777Z.report.json]
- **external-service-manifest-contract-main**: Independent verification rejected the exact attempt because the exported schema's shared string-array fragment remained nested-mutable after shallow freezing. [subagent:verify_s0_transport_decision]
- **external-service-manifest-contract-main**: Ingested evidence from external-service-manifest-contract-2026-07-14T09-56-51-777Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/external-service-manifest-contract/external-service-manifest-contract-2026-07-14T09-56-51-777Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T09:55:38.675Z | external-service-manifest-contract-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/external-service-manifest-contract/attempt-1.diff |
| 2026-07-14T09:57:42.139Z | external-service-manifest-contract-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/external-service-manifest-contract/attempt-2.diff |
