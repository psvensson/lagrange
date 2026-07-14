# Solve report: service-local-oci-layout

**Goal:** Given explicit pinned development inputs for an oci_container image or prebuilt wasm_component payload, one local build owner publishes an atomic OCI image-layout directory and immutable deterministic receipt whose descriptor graph binds the exact bytes; identical inputs reproduce the same content graph, and InstallableServiceArtifactResolver accepts the exact local layout for a matching external manifest while tampered or partial graphs fail closed, without registry, catalog, control-transport, reconciler, or runtime activation.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-local-oci-layout/service-local-oci-layout-2026-07-14T15-03-47-761Z.report.json

**Attempts:** 2

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 10
- Change bytes: 131324
- Owner areas: architecture, scripts/checks, src/service, test/service
- Categories: docs, other, runtime, test
- Action: land or separate 4 owner areas: architecture, scripts/checks, src/service, test/service
- Split plan:
  - src/service: 7 file(s)
  - architecture: 1 file(s)
  - scripts/checks: 1 file(s)
  - test/service: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **service-local-oci-layout-main** [solved] rung 1, attempts 2, metric 1 -> 0 — exact terminal source attempt was rejected

## Findings
- **service-local-oci-layout-main**: Pre-edit affected boundary had zero runtime-grammar violations, 88 inherited literal violations (resolver 69, external manifest 19), repo file-size ratchet 25 source and 21 test files, and the missing build owner measured red at priority 1. [commands:runtime-grammar,literals,file-size,scenario-report]
- **service-local-oci-layout-main**: Ingested evidence from service-local-oci-layout-2026-07-14T14-29-39-026Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-local-oci-layout/service-local-oci-layout-2026-07-14T14-29-39-026Z.report.json]
- **service-local-oci-layout-main**: Closure gates kept runtime-grammar at zero, added zero literal violations beyond the exact inherited baseline of 88, added no file-size debt, and passed focused lint, scoped complexity/cognitive checks, depcruise, portability-claims audit, resolver acceptance, and three consecutive deterministic scenario runs. [commands:eslint,runtime-grammar,literals,file-size,complexity,depcruise,portability-claims,focused-tests,scenario-reports]
- **service-local-oci-layout-main**: Affected-area deep dive re-read the local builder, error and output-path owners, Buildx adapter, OCI constants, service exports, resolver, external manifest/runtime constants, public API, scenario harness, focused tests, and architecture record. Ownership is single-path, explicit injected dependencies fail loudly, the resolver behavior is unchanged apart from shared protocol constants, public re-export is covered, capability claims remain truthful, and no CLI/catalog/reconciler/runtime activation or leftover test-only scaffold entered the boundary. [files:src/service,src/public-api.js,src/constants/runtime.js,scripts/checks,architecture/lagrange-service-registry.md;commands:portability-claims,depcruise,focused-tests]
- **service-local-oci-layout-main**: Independent verification rejected unsafe output-root replacement and graph-directory indirection [subagent:verify_s5b_exact]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T14:30:42.199Z | service-local-oci-layout-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/service-local-oci-layout/attempt-1.diff |
| 2026-07-14T15:09:09.839Z | service-local-oci-layout-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-local-oci-layout/attempt-2.diff.json |
