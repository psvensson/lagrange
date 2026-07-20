# Solve report: schema-provisioning-not-null-intent-recovery-roundtrip

**Goal:** A durable CREATE TABLE job records NOT NULL and default semantics in its canonical intent, recovers after metadata projection and owner restart into a semantically identical schema against the same deterministic table identity, still fails closed on genuinely different metadata without overwrite or cleanup, and the unchanged movielens-lagrange-service-affinity-live scenario reports priority metric 0 on three consecutive fresh runs.

**Class:** product · **Closure:** MEASURED

**Outcome:** IN PROGRESS (no terminal recorded)

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-service-creating-owner-wake-progress-admission
- plan: solve/epics/service-data-affinity-placement.md

## Current Blocker
- Frontier: schema-provisioning-not-null-intent-recovery-roundtrip-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: transition_gap
- Movement: first blocker observed: unknown
- Latest evidence: test-output/reports/schema-provisioning-not-null-intent-recovery-roundtrip-2026-07-20T02-08-16-436Z.report.json
- Selected theory: none
- Next move: continue supervised step for schema-provisioning-not-null-intent-recovery-roundtrip-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 4
- Change bytes: 5590
- Owner areas: scripts/run-durable-provisioning-job-owner-scenarios.js, src/query, test/query
- Categories: other, runtime
- Action: land or separate 3 owner areas: scripts/run-durable-provisioning-job-owner-scenarios.js, src/query, test/query
- Split plan:
  - src/query: 2 file(s)
  - scripts/run-durable-provisioning-job-owner-scenarios.js: 1 file(s)
  - test/query: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **schema-provisioning-not-null-intent-recovery-roundtrip-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: DT red-on-revert proven for test/query/schema-provisioning-job-owner.test.js [dt:solve/changes/dt-prove/schema-provisioning-job-owner.test.js-2026-07-20T02-01-57-861Z.json]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: The unchanged live MovieLens demo reproducibly reaches schema deployment and fails because recovered normalized_ddl marks source_snapshot_json nullable while the already projected deterministic table metadata is NOT NULL DEFAULT '{}'; runtime-service deployment is not reached. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T01-53-03-265Z.report.json]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: normalizeColumn reads nullable but not the parser AST notNull field, while recovered canonical columns are projected by buildSchemaDefinition through notNull but not nullable; the two one-way adapters therefore change schema semantics across restart. [solve/changes/dt-prove/schema-provisioning-job-owner.test.js-2026-07-20T02-01-57-861Z.json]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: The legacy durable-provisioning directed assertion that every child operation is already ACTIVE fails identically at detached pre-change commit 0527723b and current source, while the other 10 legacy guard files are green; it is not caused by this schema patch. [test-output/reports/durable-provisioning-job-owner-2026-07-20T02-02-19-789Z.report.json]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: Primary-source comparison supports faithful desired-state persistence plus strict drift detection: Kubernetes controllers reconcile current state toward the stored desired spec, PostgreSQL warns IF NOT EXISTS does not validate existing schema identity, and Flyway validates applied migrations by stored checksums. The correction must repair semantic round-trip, not weaken identity comparison. [https://kubernetes.io/docs/concepts/architecture/controller/]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: Independent verification approved exact attempt 1: semantic round-trip, deterministic identities, conflict safety, real lease-expiry recovery, DT red-on-revert, and focused/static checks passed; legacy pre-fix intent_version=1 rows fail closed and require separate migration treatment. [subagent:verify_runtime_context_coalescing]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-20T02:06:34.716Z | schema-provisioning-not-null-intent-recovery-roundtrip-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/schema-provisioning-not-null-intent-recovery-roundtrip/attempt-1.diff |
