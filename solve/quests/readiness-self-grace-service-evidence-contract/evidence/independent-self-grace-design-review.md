# Independent Design and R09 Supersession Review for `readiness-self-grace-service-evidence-contract`

## 1. Review Scope and Metadata

- **Verifier**: `subagent:b53f502d-cb6d-4d3b-b17c-9e51dbbbcf82`
- **Rule-Set Revision**: `5` (`AGENTS.md`, `docs/steering/rules.md`, `docs/steering/router.md`)
- **Worktree**: `/mnt/data/peter/projects/.worktrees/lagrange-composed-05-20261103`
- **Source Commit (`HEAD`)**: `ad0d64de8cfc06b574b0589f33985d4be1f3a4d0`
- **Target Quest**: `readiness-self-grace-service-evidence-contract` (`class: fix`, epic `operation-integrity-and-reliable-formation`)
- **Verdict**: **APPROVE**

## 2. Verified Input Files and SHA-256 Hashes

| File | SHA-256 | Role Verified |
| --- | --- | --- |
| `src/control-plane/control-plane-readiness-node-service-rows.js` | `9013b217e01eaf6281612fab52d5c7ef87cbe0633ad925ab29c7ebc10f45d5ad` | `hasServeEligibleControlPlaneService` (`:232-253`) and `hasRecoveryGraceControlPlaneService` (`:255-282`) |
| `src/control-plane/control-plane-readiness-evidence-reasons.js` | `5fb117306b9d8a7549b4bdab27dc96974c5110d6d42e4adebca729159f9e8135` | `resolveMissingNodeReadinessState` (`:427-468`) and stale comment (`:452-456`) |
| `src/control-plane/control-plane-readiness-service-node-methods.js` | `d558b1ce3fa215b25586767d8f88663709f00d0f333cc0193a63820f4c26a922` | `evaluateNodeReadiness` (`:470-583`) and `buildNodeReadinessSyncCurrent` (`:621-763`) |
| `src/control-plane/authoritative-node-evidence-reconciler.js` | `2ef5d87fb46b475b1c933b18a939b2deb8c583accde6eb9099e1cf6f9367b196` | `maybeRepairNodeEvidence` (`:287-335`), `collectRepairNodeEvidenceContext` (`:533-632`), `applyAuthoritativeRows` (`:731-752`) |
| `test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js` | `0f82414c8b7980dbd1dfd8242fe6f77f998a63f83a1edbd89f9935cfb4241483` | Subtests 5, 6, and 7 (`:305-538`) |
| `architecture/readiness-and-owner-contracts.md` | `43933414f88c1469a89152a0f416bb4962d0adde83e84caa4a05e849a3cac802` | Readiness and owner contracts architecture owner document |
| `solve/quests/serve-eligibility-committed-epoch-read/quest.json` | `1687937c5a2248ab7de1424712114f58dd3287faab5646d7ee4225e22a159204` | Sealed `doneWhen` item `no-empty-or-missing-means-ok` |
| `solve/quests/serve-eligibility-committed-epoch-read/evidence/design-note.md` | `47ca435c6fa286212be05ab05818b75bbef71e0886caeef26a2c24e584831243` | Section 2.1 lines 122-124 and Section 4 item 5 lines 243-244 |
| `test-output/verification-20261106-partition-target/independent-readiness-cleanup-design-review.md` | `0206272720dacb4325d11efd85bc529d18c380c2607f34290ee8fe0a7116b6ac` | Prior Step 2 design review analysis |

## 3. Causal and Owner History Verification (R09)

1. **`e2797b6c8756cc0d596e24b16465b41c820cbd56` (2026-04-20)**:
   Introduced subtest 7 (`ControlPlaneReadinessService keeps self runtime grace when the local node row and control-plane service rows are both missing`) in the historical `control-plane-readiness-service.test-part-5.js` file at the same time `hasServeEligibleControlPlaneService` in `src/control-plane/control-plane-readiness-service.js` had the permissive empty-means-satisfied default (`if (serviceRows.length === 0) return true`).
2. **`40ab2eccd7e9d3c98cedbecff6dc21a897cfe44a` (2026-06-14)**:
   Re-enabled and renamed that historical part file to `test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js`.
3. **`0177e9d1df290492bc3f03be4835eb22b747b414` (2026-07-23)**:
   Decomposed `src/control-plane/control-plane-readiness-service.js` into `src/control-plane/control-plane-readiness-evidence-reasons.js` and `src/control-plane/control-plane-readiness-node-service-rows.js` (Wave C), preserving `resolveMissingNodeReadinessState` and its comment at `src/control-plane/control-plane-readiness-evidence-reasons.js:452-456`.
4. **Quest `serve-eligibility-committed-epoch-read` (`835ea25c46d1bb60f9010e195f759212a6883301` and `e4d0f3294f4d51c6be637543dc2051a0a579f37b`)**:
   - `solve/quests/serve-eligibility-committed-epoch-read/quest.json:6` (`no-empty-or-missing-means-ok`) and `solve/quests/serve-eligibility-committed-epoch-read/evidence/design-note.md:122-124,243-244` (Section 4 item 5, `hasServeEligibleControlPlaneService empty default`) explicitly sealed the deletion of the `serviceRows.length === 0 -> return true` fallback so that `hasServeEligibleControlPlaneService` requires at least one active addressed `message_group` row in `serviceRows`.
   - In attempt 1 (`835ea25c46d1bb60f9010e195f759212a6883301`), the author updated subtest 7 (`:501-536`) to pass `decisionDimension: CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE` and expect `serveEligible: false` before deleting the empty-`services` default.
   - In attempt 4 (`e4d0f3294f4d51c6be637543dc2051a0a579f37b`), the author deleted the empty-`services` default in `src/control-plane/control-plane-readiness-node-service-rows.js:232-243` (`if (serviceRows.length === 0) return false; ... if (!hasMessageGroupRows) return false;`), but missed updating subtest 7 (`test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js:464-538`) and the stale comment in `src/control-plane/control-plane-readiness-evidence-reasons.js:452-456`.

## 4. Production Owner Contract Analysis (R01, R03, R09)

1. **No empty-`services` fallback in production**:
   In `src/control-plane/control-plane-readiness-node-service-rows.js:232-253`, `hasServeEligibleControlPlaneService(serviceRows)` returns `false` when `serviceRows.length === 0` or when no `SERVICE_TYPE.MESSAGE_GROUP` row is present, and requires an `ACTIVE` addressed `message_group` row. In `src/control-plane/control-plane-readiness-evidence-reasons.js:427-468`, `resolveMissingNodeReadinessState` requires `hasControlPlaneService = this.hasServeEligibleControlPlaneService(serviceRows)` before returning `MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE`.
   An `ACTIVE` lifecycle state and connected router without any `NODES` or `SERVICES` evidence is not live control-plane service ownership. Restoring an empty-`services` default or inventing a rowless runtime ownership fallback would violate R03 (fail-closed on missing evidence) and the sealed `no-empty-or-missing-means-ok` invariant of `serve-eligibility-committed-epoch-read`.
2. **Stale comment repair in `src/control-plane/control-plane-readiness-evidence-reasons.js:452-456`**:
   Updating the comment at lines 452-456 so it states that missing-node `SELF_RUNTIME_GRACE` requires an active addressed `message_group` service row in `serviceRows` (and does not claim `serveEligible` authority or empty-service-row grace) aligns the inline documentation with the production implementation without altering production runtime behavior.
3. **R09 supersession documentation in `architecture/readiness-and-owner-contracts.md`**:
   Appending an explicit R09 supersession section to `architecture/readiness-and-owner-contracts.md` satisfies `docs/steering/rules.md` R09 ("Verify git history and active quests before changing a test expectation. If a test encodes an older contract, record the supersession in the owner doc or quest log rather than silently rewriting the assertion").
4. **Negative and positive test coverage in `test/control-plane/control-plane-readiness-service-sync-and-priority-recovery.test.js`**:
   - **Negative (fail-closed when both rows remain missing after authoritative refresh)**:
     When `nodes: []` and `services: []` are empty in cache and `readAuthoritativeControlPlaneRows` returns `{success: false, rows: []}`, `getNodeReadiness` performs one deduped authoritative refresh across `[TABLES.NODES, TABLES.SERVICES]` (`authoritativeReads.map((entry) => entry.tableName)` equals `[TABLES.NODES, TABLES.SERVICES]`) and fails closed (`clusterMemberHealthy: false`, `controlPlaneWritable: false`, `repairEligible: false`, `serveEligible: false`, `NODE_ROW_MISSING` reason present, and `evaluateControlPlaneParticipation` returns `allowed: false` with `SERVICE_UNAVAILABLE`).
   - **Positive (authoritative `TABLES.SERVICES` refresh into `SELF_RUNTIME_GRACE` while `TABLES.NODES` remains missing)**:
     When `nodes: []` and `services: []` are initially empty in a shared `cache` (`systemTableCache: cache, cacheMutationTarget: cache`) and `readAuthoritativeControlPlaneRows` returns `{success: true, rows: []}` for `TABLES.NODES` and `{success: true, rows: [createMessageGroupService(nodeId)]}` for `TABLES.SERVICES`, `AuthoritativeNodeEvidenceReconciler.maybeRepairNodeEvidence` reconciles the `SERVICES` row into `cache`, `evaluateNodeReadiness` re-reads `serviceRows` (`:494`), and `resolveMissingNodeReadinessState` enters `MISSING_NODE_READINESS_STATE.SELF_RUNTIME_GRACE` (`clusterMemberHealthy: true`, `controlPlaneWritable: true`, `repairEligible: true`, `serveEligible: false`, `NODE_ROW_MISSING` absent, `NODE_SELF_RUNTIME_GRACE_ACTIVE` present, and `REPAIR_ELIGIBLE` participation allowed).

## 5. Conclusion

The proposed Quest scope is minimal, owner-aligned, preserves fail-closed production readiness semantics, and satisfies R01, R03, and R09. **APPROVE**.
