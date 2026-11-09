# Self-grace service evidence contract: exact committed applicability and frozen proof

Reviewer: `subagent:b53f502d-cb6d-4d3b-b17c-9e51dbbbcf82`, 2026-11-06, rule-set revision 5.

**APPROVE committed applicability and the bounded 28-file frozen proof at `e8fd1cc6e6717a6321ece53873f60fdc5e70c31f`.** The sole parent is `ad0d64de8cfc06b574b0589f33985d4be1f3a4d0`. All seven committed files listed in manifest `solve/quests/readiness-self-grace-service-evidence-contract/evidence/self-grace-implementation-content.json` (`842c162485c218819634c61046e5a89386074bc7bc1f67ae0534cbf63206831a`) match committed Git-object bytes at `e8fd1cc6e6717a6321ece53873f60fdc5e70c31f`, and the eighth manifest entry (`test-output/readiness-and-cleanup-20261106/self-grace-28-callers.log`, `f05df9d18965f58edcdedbc9088254b15d56a3d44cdf9d1dbac45dc516d67a29`) matches the retained local log on disk. This extends implementation review `165f258ada1eefe01f914520276f88cdeeae8664ca182cf783707d42f4224e1b` (inputs `4b397bae5dca9f2bb98363adcc4d53615e2241035a69cdd6f4abae726f34e083`); it does not approve Quest closure, the full source-range/caller cone, E8/E9, publication or physical formation.

The entire 17-path commit was reconciled. Its only production file change is the comment repair in `src/control-plane/control-plane-readiness-evidence-reasons.js` (`d0057424ef951d397cd3b1d973aee6e1fb3a7baceb5dc4528eae3327bd6a32f8`, lines 452-455), while `src/control-plane/control-plane-readiness-node-service-rows.js` (`9013b217e01eaf6281612fab52d5c7ef87cbe0633ad925ab29c7ebc10f45d5ad`) remains byte-for-byte unchanged (`hasServeEligibleControlPlaneService` returns `false` on `serviceRows.length === 0`). The architecture owner document (`architecture/readiness-and-owner-contracts.md`, `26d21516cad46e6c0cca454cbc4484273a981cfc1f38c86cdffeb63b4ca4dd73`) records the R09 supersession citing `e2797b6c8756cc0d596e24b16465b41c820cbd56`, `40ab2eccd7e9d3c98cedbecff6dc21a897cfe44a`, `0177e9d1df290492bc3f03be4835eb22b747b414`, `835ea25c46d1bb60f9010e195f759212a6883301` and `e4d0f3294f4d51c6be637543dc2051a0a579f37b`, and the test file (`test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js`, `282597a40fc77d569a176b535ea1cf8de8c7a0fbc6516fba94696af4629d0654`) proves both the fail-closed missing-both-rows negative after one deduped `[TABLES.NODES, TABLES.SERVICES]` refresh and the positive recovery into `SELF_RUNTIME_GRACE` when authoritative `TABLES.SERVICES` refresh reconciles the local `message_group` row into the shared cache while `TABLES.NODES` stays empty. The remaining 14 committed paths are the epic summary (`solve/epics/operation-integrity-and-reliable-formation.md`), the prior Quest's committed-applicability evidence and log (`solve/quests/readiness-direct-publication-planning-custody/evidence/independent-ad0d64de-applicability.md`, `independent-ad0d64de-inputs.json`, and `log.ndjson`), the new Quest `readiness-self-grace-service-evidence-contract` (`quest.json`, append-only `log.ndjson`, failing `evidence/receipt.json`, `evidence/self-grace-implementation-content.json`, and the four design/implementation review artifacts), and two generated metadata files (`solve/changes/global-owner-debt-inventory/inventory.json` and `test/shards/impact-graph-seal.json`). The generated inventory updates only import-graph and jscpd source digests (`moduleCount` 6079, `edgeCount` 33709, `unresolvedCount` 46, `cloneGroups` 37, `duplicatedLines` 1187 unchanged), and `impact-graph-seal.json` updates source/producer/snapshot digests while preserving `resolverStateDigest`. `solve/quests/readiness-self-grace-service-evidence-contract/evidence/receipt.json` remains `status: "fail"` with all four required receipts `false`.

The frozen launcher (`run-frozen-self-grace-e8fd1cc6.mjs`) refuses a wrong or dirty candidate, refuses to overwrite an existing output directory, and uses existing `labTestCommit` / classified placement / `runLabTest` on the named Lenovo host. The collection manifest (`frozen-self-grace-e8fd1cc6-collection.json`, `2e3684d19fc0a80c6f3aeedef2151cb47e9084f80771a703283fa29ad7332064`), environment, completion, ledger and placement log agree on the exact candidate `e8fd1cc6e6717a6321ece53873f60fdc5e70c31f` and base `ad0d64de8cfc06b574b0589f33985d4be1f3a4d0`. The candidate `package-lock.json` hash matches the recorded `8ac4b4fb882a5a93a67f192b37167fe8d5884c9a6778ca5b4b2dff7b28b76b04`. Selection and ledger are an exact 28-file readiness caller set with no duplicate or missing entry:

| File | Reported assertions | Attempt | Result |
| --- | ---: | ---: | --- |
| `test/control-plane/serve-eligibility-owner.test.js` | 143 | 1 | pass, 903 ms |
| `test/control-plane/readiness-planning-identity-churn-currency.test.js` | 2 | 1 | pass, 1,397 ms |
| `test/control-plane/publication-planning-committed-rows.test.js` | 5 | 1 | pass, 1,463 ms |
| `test/rebalancer/critical-topology-committed-lease.test.js` | 58 | 1 | pass, 2,559 ms |
| `test/control-plane/single-readiness-owner.receipt.test.js` | 190 | 1 | pass, 3,976 ms |
| `test/control-plane/readiness-planning-deferral-bounded.test.js` | 9 | 1 | pass, 5,644 ms |
| `test/control-plane/readiness-planning-publication-version-key.test.js` | 12 | 1 | pass, 6,419 ms |
| `test/control-plane/readiness-planning-consistency-mode.test.js` | 3 | 1 | pass, 1,469 ms |
| `test/rebalancer/storage-capacity-accounting-service.test.js` | 73 | 1 | pass, 2,871 ms |
| `test/control-plane/publication-readiness-churn-liveness.test.js` | 118 | 1 | pass, 2,456 ms |
| `test/control-plane/replica-dispatch-node-state-update-ready-node-retry-dispatch.test.js` | 54 | 1 | pass, 2,457 ms |
| `test/control-plane/control-plane-readiness-service-cluster-health-and-recovery-diagnostics.test.js` | 89 | 1 | pass, 1,612 ms |
| `test/rebalancer/startup-authority-available-node-contract.test.js` | 26 | 1 | pass, 2,422 ms |
| `test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js` | 116 | 1 | pass, 1,722 ms |
| `test/control-plane/control-plane-readiness-service-getall-and-snapshot-cache.test.js` | 74 | 1 | pass, 1,636 ms |
| `test/control-plane/readiness-planning-generation-granularity.test.js` | 64 | 1 | pass, 1,193 ms |
| `test/rebalancer/storage-capacity-semantic-projection-owner.test.js` | 54 | 1 | pass, 1,029 ms |
| `test/control-plane/control-plane-read-authority-token.test.js` | 41 | 1 | pass, 1,563 ms |
| `test/query/schema-provisioning-job-owner.test.js` | 330 | 1 | pass, 3,265 ms |
| `test/workflow/owner-key-reconcile-queue.test.js` | 179 | 1 | pass, 939 ms |
| `test/control-plane/node-liveness-semantic-projection-owner.test.js` | 242 | 1 | pass, 1,428 ms |
| `test/control-plane/readiness-planning-semantic-generation.test.js` | 525 | 1 | pass, 1,103 ms |
| `test/control-plane/readiness-planning-diagnostics-retention.test.js` | 26 | 1 | pass, 936 ms |
| `test/control-plane/readiness-planning-publication-atomicity.test.js` | 240 | 1 | pass, 1,068 ms |
| `test/control-plane/readiness-planning-snapshot-identity-owner.test.js` | 22 | 1 | pass, 16,713 ms |
| `test/control-plane/readiness-planning-read-amplification.test.js` | 9 | 1 | pass, 1,315 ms |
| `test/control-plane/readiness-planning-cache-classification-barrier.test.js` | 28 | 1 | pass, 1,018 ms |
| `test/control-plane/readiness-planning-liveness-veto.test.js` | 6 | 1 | pass, 760 ms |

The schedule ran from `2026-11-06T15:57:09.641Z` to `2026-11-06T15:58:41.228Z`, exited 0, and reported 28/28 files and 2,738 assertions. Automatic retries were zero; all 28 ledger entries have `attempt: 1`, `ok: true`, `retriedOnce: false` and `firstFailureLine: null`. Placement records factor 2.2, no timeout or retry override, `lanecap:7`, ordinary lane jobs 4 and admitted CPU 51 C; NVMe temperature was unmeasured. The retained environment identifies the controller as Node v22.23.2/Linux x64. It does not independently identify the worker Node executable or boot, so this review makes no new worker-runtime fingerprint claim.

The proof measures the fail-closed missing-both-rows self-readiness negative after one deduped `[TABLES.NODES, TABLES.SERVICES]` refresh, the positive recovery into `SELF_RUNTIME_GRACE` when authoritative `TABLES.SERVICES` refresh reconciles the local `message_group` row into the shared cache while `TABLES.NODES` remains empty, and the complete 28-file readiness caller suite on the frozen candidate. It does not repair or prove failed-create cleanup claim normalization, full source-range/caller coverage, or E8/E9 physical formation. The committed Quest receipt remains `fail` with all four required receipts `false`; receipt admission and full source-range proof stay with their existing owners.

Every committed path and retained artifact is hashed in `independent-e8fd1cc6-inputs.json`. No tracked edits, tests or lab jobs were performed by this reviewer.
