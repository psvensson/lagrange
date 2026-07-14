# Solve report: service-install-catalog-owner

**Goal:** The cluster service install catalog durably records immutable package and revision identity, idempotent installation intent, rollout outcomes, and typed failures while exposing only logical references to the canonical service definition, instance, and endpoint actual-state owners; unsupported activation is recorded_not_running and cannot be projected as running.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 3

## Links
- spec: solve/specs/service-portability-ladder/requirements.md#r3--one-install-and-control-plane
- plan: solve/specs/service-portability-ladder/tasks.md

## Scope Pressure
- Changed files: 11
- Change bytes: 215397
- Owner areas: scripts/checks, src/bootstrap, src/cache, src/constants, src/control-plane, test/control-plane
- Categories: other, runtime, test
- Action: split by owner area before the next attempt (11 files)
- Action: land or separate 6 owner areas: scripts/checks, src/bootstrap, src/cache, src/constants, src/control-plane, test/control-plane
- Split plan:
  - src/control-plane: 4 file(s)
  - src/bootstrap: 3 file(s)
  - scripts/checks: 1 file(s)
  - src/cache: 1 file(s)
  - src/constants: 1 file(s)
  - test/control-plane: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **service-install-catalog-owner-main** [parked {exhausted}] rung 3, attempts 3, metric 0 -> 0 — No honest attempt can simultaneously cover every rejected source path and remain under this Quest's exhausted cumulative byte bound; pivot the green implementation to a linked successor.

## Findings
- **service-install-catalog-owner-main**: Ingested evidence from service-install-catalog-owner-2026-07-14T10-49-54-750Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-install-catalog-owner/service-install-catalog-owner-2026-07-14T10-49-54-750Z.report.json]
- **service-install-catalog-owner-main**: Independent exact verification rejected the concurrent install replay and rollout/failure update races [subagent:verify_s0_transport_decision]
- **service-install-catalog-owner-main**: Ingested evidence from service-install-catalog-owner-2026-07-14T11-06-34-369Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-install-catalog-owner/service-install-catalog-owner-2026-07-14T11-06-34-369Z.report.json]
- **service-install-catalog-owner-main**: Independent exact verification rejected stale losing failure replay overwriting latest_failure_id [subagent:verify_s0_transport_decision]
- **service-install-catalog-owner-main**: Ingested evidence from service-install-catalog-owner-2026-07-14T11-14-09-913Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/service-install-catalog-owner/service-install-catalog-owner-2026-07-14T11-14-09-913Z.report.json]
- **service-install-catalog-owner-main**: The append-only scope ledger, not the product implementation, blocks another same-base full-path replacement; continue through a linked successor Quest [solve/changes/service-install-catalog-owner/attempt-3.diff]

## Theories
- **theory-20260714-an-existing-losing-failure-was-treated** [active] system, mechanism an existing losing failure was treated like a new failure and could CAS the installation pointer after the original winning mutation completed, owner service-install-catalog-owner, modelGate npm run model:contracts
- **theory-20260714-service-install-catalog-concurrent-mutation-owner** [falsified] frontier, frontier service-install-catalog-owner-main, layer ownership, mechanism service_install_catalog_concurrent_mutation_owner, owner service-install-catalog-owner, boundary durable_install_mutation, modelGate npm run model:contracts
- **theory-20260714-service-install-failure-replay-owner** [supported] frontier, frontier service-install-catalog-owner-main, layer ownership, mechanism service_install_failure_replay_owner, owner service-install-catalog-owner, boundary durable_failure_replay, modelGate npm run model:contracts

## Selected Theories
- **service-install-catalog-owner-main**: theory-20260714-service-install-failure-replay-owner

## Theory Results
- **theory-20260714-service-install-catalog-concurrent-mutation-owner**: falsified (scenario=done, theory=falsified, movement=solved) [test-output/reports/service-install-catalog-owner/service-install-catalog-owner-2026-07-14T11-09-18-314Z.report.json]
- **theory-20260714-service-install-catalog-concurrent-mutation-owner**: supported (scenario=passed, theory=confirmed, movement=solved) [test-output/reports/service-install-catalog-owner/service-install-catalog-owner-2026-07-14T11-09-18-314Z.report.json]
- **theory-20260714-service-install-catalog-concurrent-mutation-owner**: falsified (scenario=passed, theory=partial, movement=moved_boundary) [subagent:verify_s0_transport_decision]
- **theory-20260714-service-install-failure-replay-owner**: supported (scenario=done, theory=supported, movement=solved) [test-output/reports/service-install-catalog-owner/service-install-catalog-owner-2026-07-14T11-14-09-913Z.report.json]

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-14T10:52:57.836Z | service-install-catalog-owner-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-install-catalog-owner/attempt-1.diff |
| 2026-07-14T10:55:30.079Z | service-install-catalog-owner-main | local-fix | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/service-install-catalog-owner/attempt-1.diff |
| 2026-07-14T11:09:18.375Z | service-install-catalog-owner-main | widen-scope | 0 -> 0 | flat | solved | theory-20260714-service-install-catalog-concurrent-mutation-owner | diff:solve/changes/service-install-catalog-owner/attempt-2.diff |
