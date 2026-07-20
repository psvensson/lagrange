# Solve report: schema-provisioning-not-null-intent-recovery-roundtrip

**Goal:** A durable CREATE TABLE job records NOT NULL and default semantics in its canonical intent, recovers after metadata projection and owner restart into a semantically identical schema against the same deterministic table identity, still fails closed on genuinely different metadata without overwrite or cleanup, and the unchanged movielens-lagrange-service-affinity-live scenario reports priority metric 0 on three consecutive fresh runs.

**Class:** product · **Closure:** MEASURED

**Outcome:** EXHAUSTED — 1 frontier(s) parked; human decision needed

**Attempts:** 1

## Links
- spec: solve/epics/service-data-affinity-placement.md
- parent quest: runtime-service-creating-owner-wake-progress-admission
- plan: solve/epics/service-data-affinity-placement.md

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
- **schema-provisioning-not-null-intent-recovery-roundtrip-main** [parked {exhausted}] rung 1, attempts 1, metric 0 -> 0 — The current source no longer reproduces the NOT NULL recovery mismatch and the only ordered-gate red belongs to the separately evidenced ready-lease observation boundary; no honest same-frame schema move remains.

## Findings
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: DT red-on-revert proven for test/query/schema-provisioning-job-owner.test.js [dt:solve/changes/dt-prove/schema-provisioning-job-owner.test.js-2026-07-20T02-01-57-861Z.json]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: The unchanged live MovieLens demo reproducibly reaches schema deployment and fails because recovered normalized_ddl marks source_snapshot_json nullable while the already projected deterministic table metadata is NOT NULL DEFAULT '{}'; runtime-service deployment is not reached. [test-output/reports/movielens-lagrange-service-affinity-live-2026-07-20T01-53-03-265Z.report.json]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: normalizeColumn reads nullable but not the parser AST notNull field, while recovered canonical columns are projected by buildSchemaDefinition through notNull but not nullable; the two one-way adapters therefore change schema semantics across restart. [solve/changes/dt-prove/schema-provisioning-job-owner.test.js-2026-07-20T02-01-57-861Z.json]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: The legacy durable-provisioning directed assertion that every child operation is already ACTIVE fails identically at detached pre-change commit 0527723b and current source, while the other 10 legacy guard files are green; it is not caused by this schema patch. [test-output/reports/durable-provisioning-job-owner-2026-07-20T02-02-19-789Z.report.json]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: Primary-source comparison supports faithful desired-state persistence plus strict drift detection: Kubernetes controllers reconcile current state toward the stored desired spec, PostgreSQL warns IF NOT EXISTS does not validate existing schema identity, and Flyway validates applied migrations by stored checksums. The correction must repair semantic round-trip, not weaken identity comparison. [https://kubernetes.io/docs/concepts/architecture/controller/]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: Independent verification approved exact attempt 1: semantic round-trip, deterministic identities, conflict safety, real lease-expiry recovery, DT red-on-revert, and focused/static checks passed; legacy pre-fix intent_version=1 rows fail closed and require separate migration treatment. [subagent:verify_runtime_context_coalescing]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: Independent aggregate verification REJECTED terminal handoff for sha256:835b8d812822b94a0e76e156b28fbc0623b2a004751307fc5db6a24f97074620: aggregate bytes and 102 focused assertions are green, but the sealed ordered live gate is unsatisfied because the 5-of-5 probe summary uses source fingerprint 718e9a9167d85372 and the 3-of-3 demo summary uses e85b031c182c3041. (rules out: Do not approve from separate green source revisions or treat within-class source stability as cross-class ordering; replace with five probes followed by three demos under one unchanged source fingerprint.) [subagent:verify_schema_intent_aggregate]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: The required replacement ordered gate used one stable current source fingerprint e85b031c182c3041 and passed 5-of-5 formation probes, but demo slot 1 was a measuring FAIL at schema admission: snapshot_query_error from stale_usable cache_stale_watermark. Aggregate handoff remains rejected; no unchanged rerun is authorized. (rules out: Do not record aggregate approval or combine the new probes with the earlier green demos; the ordered current-fingerprint demo sequence is red.) [test-output/reports/live-repetitions-demo-2026-07-20T17-07-47-080Z.summary.json]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: The sealed NOT NULL intent round-trip symptom is absent on current HEAD: the ordered current-fingerprint gate passes 5-of-5 formation/rating-provisioning probes, and the subsequent demo drains operations and reaches zero spread before the separate ready-lease/cache_stale_watermark observation boundary. (rules out: Do not edit schema normalization, weaken drift detection, combine mismatched source revisions, or rerun unchanged for the adjacent snapshot failure.) [test-output/reports/live-repetitions-probe-2026-07-20T17-03-04-101Z.summary.json]
- **schema-provisioning-not-null-intent-recovery-roundtrip-main**: Independent verification approved the exact aggregate for honest EXHAUSTED disposition: current source blobs and reverse-apply match; the fresh deterministic scenario passed 2/2 files and 102/102 assertions; static checks pass; the same-source ordered gate passed 5/5 probes before the first measuring demo failed at the adjacent snapshot/ready-lease owner boundary. [subagent:reverify_schema_intent_aggregate]

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
