# F-ADMIN-2 full partition cohort readback

Base: a97f79c35b7e1f6428032493918e16e623339688. Worktree: /mnt/data/peter/projects/.worktrees/codex-admin-partition-readback-20261025. Normal-hook checkpoint and independent review remain pending. The frozen original sources remain unchanged.

The existing benchmark readiness owner now resolves catalog table ID, queries every partition row for that ID with partition_id/table_id/table_name selected, then validates every returned row against the exact intended catalog identity. No by-name query can return early success; its unused builder/export is removed. Missing or conflicting identity is an immediate product finding. Empty metadata and existing transient read failures retain the existing readiness retry semantics. No system metadata writes, repairs, timeouts or production ownership changes occur.

red-reviewer.log reproduces the independent reviewer failure on a97: one named and one nameless row with the same table_id was incorrectly accepted. The retained reviewer source/log live in /tmp/codex-admin-admission-independent-review-20261025. The new actual-helper witness exercises mixed missing/null/wrong-case/wrong-name/wrong-table rows, a complete cohort after an empty read, missing catalog identity, permanent read refusal and existing transient-read recovery. It asserts the full field projection, no partial by-name path and SELECT-only readback. green-r2.log records 2/2 canonical files, 41 reported assertions/cases, retries0/cap1.

Existing benchmark scenario fixtures declared valid tbl-benchmark/benchmark_events metadata but returned only partition_id. Their fixed rows are completed with those canonical identity fields; no test adapter repairs or supplements results, no existing assertion is weakened, and no scenario expectation changes. All modified fixture files passed scoped lint. The 16-file existing benchmark cone passed 15/16 files (139 reported cases total); two post-load cases exposed extra p2/mapped rows still missing identity. Those four exact row declarations were corrected, without changing snapshot-repair assertions. green-post-load-final.log records its targeted 11-case PASS (783ms). The other 15 files and both harness owner files stayed byte-identical after their passing run. Together with the 35-assertion focused witness this validates 17 distinct files / 174 reported assertions or cases. Raw initial failure is retained in green-fixture-cone.log.

Exact a97 threshold-zero metric report: waitForSutBenchmarkTableReady cyclomatic12->11 and cognitive16->14; full-cohort assertion remains cyclomatic2/cognitive1, with a small new every-row predicate below thresholds; table-ID SQL builder remains1/0 and obsolete by-name builder is deleted. No baseline changes. git diff --check passed. This unit repairs harness readiness fidelity only; it does not certify actual physical provisioning/fault behavior or release acceptance.

## Current manifest

- solve/quests/admin-partition-cohort-readback/evidence/receipt.json
- solve/quests/admin-partition-cohort-readback/log.ndjson
- solve/quests/admin-partition-cohort-readback/quest.json
- test/distributed/harness/__tests__/admin-partition-cohort-readback.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-baseline-cache-reuse.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-benchmark-provisioning-and-schema-watermark.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-degraded-fallback-load-admission.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-discovery-canonical-readiness-admission.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-discovery-fanout-and-strict-parity.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-discovery-retry-and-recovery.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-discovery-schema-readiness-admission-gating.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-discovery-strict-fanout-and-admin-readiness.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-fallback-policy-and-admission-diagnostics.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-node-admission-and-overload-policy.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-post-load-tail-test-cases.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-post-load.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-preload-gate-and-metadata-fallback.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-preload-readiness.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-strict-diagnostics-tail-more-test-cases.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-strict-diagnostics-tail-test-cases.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-strict-diagnostics.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-strict-discovery-and-heartbeat-freshness.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-strict-parity-and-cdc-telemetry.test.js
- test/distributed/harness/__tests__/postgres-baseline-comparison-test-helpers.js
- test/distributed/scenarios/postgres-baseline-comparison-benchmark-table-load.js
- test/distributed/scenarios/postgres-baseline-comparison-constants-and-imports.js
- test/shards/impact-contracts.json
