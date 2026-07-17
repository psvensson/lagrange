# Solve report: service-install-lifecycle-cli

**Goal:** The shipped lagrange service install/dev-install/list/status/remove surface uses only authenticated PG-wire lifecycle SQL and returns its typed outcomes. Install submits a validated pinned manifest; dev-install first builds the S5b OCI layout and pins its receipt digest into the same install payload. Mutations require explicit replayable idempotency keys, and every build, validation, transport, authorization, or ambiguous-result failure is nonzero with no fallback.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T16-39-23-329Z.report.json

**Attempts:** 2

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 9
- Change bytes: 174896
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
- **service-install-lifecycle-cli-main** [solved] rung 1, attempts 2, metric 2 -> 0 — exact terminal source attempt was rejected

## Findings
- **service-install-lifecycle-cli-main**: The product Quest must consume pg as an already-landed runtime dependency because Solver classifies package metadata as workflow scope; a companion process Quest will promote pg in package.json and package-lock.json before the S5c source attempt begins. [subagent:phase1_s5a_preflight]
- **service-install-lifecycle-cli-main**: A trustworthy dev-install must hash and build the same immutable ordinary-file snapshot; hashing the mutable project and then passing its live path to Buildx permits source bytes to change between fingerprint and export. The S5c implementation will snapshot the bounded effective context, reject links, and pass the snapshot as builder context. [subagent:phase1_s5a_preflight]
- **service-install-lifecycle-cli-main**: S5c will preserve the CJS SEA contract with synchronous init/help routing and a promise result only for selected lifecycle commands; it will require trimmed idempotency keys of at most 256 characters, buffer success output until client close, accept exact command row cardinalities, and reuse only byte-identical regular final manifests while rejecting differing or linked outputs. [subagent:phase1_s5a_preflight]
- **service-install-lifecycle-cli-main**: Ingested evidence from service-install-lifecycle-cli-2026-07-14T15-59-32-416Z.report.json. Metric: unknown -> 2. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T15-59-32-416Z.report.json]
- **service-install-lifecycle-cli-main**: Ingested evidence from service-install-lifecycle-cli-2026-07-14T15-59-32-416Z.report.json. Metric: 2 -> 2. Verdict: FAIL. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T15-59-32-416Z.report.json]
- **service-install-lifecycle-cli-main**: Ingested evidence from service-install-lifecycle-cli-2026-07-14T16-16-47-535Z.report.json. Metric: 2 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T16-16-47-535Z.report.json]
- **service-install-lifecycle-cli-main**: Ingested evidence from service-install-lifecycle-cli-2026-07-14T16-16-47-535Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T16-16-47-535Z.report.json]
- **service-install-lifecycle-cli-main**: Ingested evidence from service-install-lifecycle-cli-2026-07-14T16-34-45-849Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T16-34-45-849Z.report.json]
- **service-install-lifecycle-cli-main**: Ingested evidence from service-install-lifecycle-cli-2026-07-14T16-34-45-849Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T16-34-45-849Z.report.json]
- **service-install-lifecycle-cli-main**: Exact attempt lacks explicit sealed attacks for unreadable input, invalid service names, builder and post-build local-write failures, and does not scan every lifecycle module for forbidden fallback routes. [subagent:phase1_s5b_preflight]
- **service-install-lifecycle-cli-main**: Ingested evidence from service-install-lifecycle-cli-2026-07-14T16-39-23-329Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T16-39-23-329Z.report.json]
- **service-install-lifecycle-cli-main**: Ingested evidence from service-install-lifecycle-cli-2026-07-14T16-39-23-329Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-install-lifecycle-cli/service-install-lifecycle-cli-2026-07-14T16-39-23-329Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T16:36:03.652Z | service-install-lifecycle-cli-main | observe | 2 -> 0 | progress | solved |  | diff:solve/changes/service-install-lifecycle-cli/attempt-1.diff |
| 2026-07-14T16:55:33.263Z | service-install-lifecycle-cli-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/service-install-lifecycle-cli/attempt-3.diff |
