# C2 and participant recovery composition: independent content review V1

Reviewed read-only on 2026-10-13 by `subagent:tx1_deletion_design_vet`, after integration attempt 15:44:41.353. No source/test/metadata/receipt/Git writes or tests/labs were performed. This report is additive.

**Disposition: HOLD pending completed integration/control evidence. Source and test byte preservation passes; no composition content defect was found.** This is not a final composition approval, a receipt projection, a Quest disposition or main/corpus/startup acceptance.

## Exact input and incorporated reviews

Candidate `6c27b10b6f3c8093f4baab149f20b6a79524aecf`, tree `16b56845ffd6479c727240514aaa11f8cc63b210`, immutable `/tmp/session-worktree-GFS44r/tree`. Source-only control `57d4d8c265ac486697bb06c62177a34dc8e60d86`, immutable `/tmp/session-worktree-9B7aGk/tree`. Both actual parent lists are C2 `406ceac1c40bdf57da1a6668806d0f3b38526cb9` and recovery `f6c48301221877c534a3f669f5a91a7a8a1edd29`.

`solve/quests/participant-release-held-recovery-continuation/evidence/integrated-source-pair-v1.json` SHA256 `91c12bf256c72acd221335b2c2a5bdea64921e0a0fae3ea8d43316b440d696b2`. Actual HEAD/tree/parents and all listed hashes were independently verified. Actual Git difference is exactly `src/node/replica-handler-release-recovery.js` and `src/partition/partition-participant-transaction-pause.js`; all other tracked bytes are identical between treatments. C2 subtraction remains present in both.

The following exact durable reviews retain their original scope and HOLD ceilings and are incorporated rather than repeated:

| Review | SHA256 |
| --- | --- |
| C2 source, 41-item independent review: `solve/quests/message-group-fresh-identity-membership/evidence/c2-independent-implementation-review-20261013.md` | `0429ae581ab04210a5f6f04287e309afaf0e263f246e249a40fb98b058ae31bd` |
| C2 harness final binding, incorporates complete 44-item review: `.../evidence/harness-implementation-review-v2-final-metadata.md` | `c32913163736ea139357ce5e10511bd15a79aa6c41f810e123a21f468e13190a` |
| Recovery source/content/evidence, complete 50-item review: `solve/quests/participant-release-held-recovery-continuation/evidence/implementation-review-v3.md` | `b86a953cf45b62742bf5b19cc4e23f83038f3ff6d0fe8d0eaf3ec1e97bd3f495` |

The source reviews are independent of the relevant implementing agent. Historical standalone lab outcomes are not relabeled as measured at this merged input.

## Subtraction and preservation audit

I compared both parent change sets against common baseline `d35d8828c630d1b9675b47f511c477b3cc9ee991`. Their runtime/test/architecture sets overlap only at two canonical generated files: subsystem classes and graph seal. Every non-generated component file equals its reviewed parent. There is no undeclared changed `src`, `scripts`, `test` or `architecture` path.

| Component | Exact preserved production/fixture surface |
| --- | --- |
| C2 | The promotion and learner-successor modules remain deleted. Membership authorization SHA256 `9f78cfb0f3ef0ef1742661179e21e117381acba9e0038b7f309a8074875cb39f` and permit `a7c2fc03e8fd66e279e77a13c28a1a868cffe18a10f63aaa49714ab23b5e0ab0` match the source review. Branch test `ea98ca5f...`, DT6 proof `d187747c...`, shared helper `7c0a270c...` and bootstrap property `df78abc5...` equal C2 parent. |
| Recovery | Recovery source `1e35f7ff...`, Pause `0ce1938d...`, focused test `97965308...`, passive/native test `9ece4577...` and authority prose `128538d7...` equal recovery parent and the final V3 review. |
| Shared interaction | Impact registry `63f610be...`, primary and resource classification files equal recovery parent. No new contract, endpoint, fallback or mutation driver appears. Full hashes are in the verified pair manifest. |

## Systemic intersection assessment

| Category | Content disposition and exact evidence; remaining proof |
| --- | --- |
| Admission and identity | Preserved. Initial learner and generic branch admission remain C2's authorization/permit owners; current participant release still requires origin/build/member/generation/drain/census and final lifecycle (`src/node/replica-handler-release-recovery.js:185-212`, `src/partition/partition-participant-transaction-pause.js:75-104`). Canonical fresh seed authority still validates the startup owner proof (`src/node/participant-release-authorization-owner.js:16-38`). No deletion enables fresh authority or autocommit fallback. |
| Recovery/replay | Preserved. The deleted promotion/successor island was not an enlisted recovery producer; live initial learner recorder, generic branch CAS, native promotion and participant application/replay owners remain. Recovery's new writes are volatile queue/report state and canonical admission WeakMap only. Parent source identity preserves current durable replay/rollback/CAS rather than introducing a merged reconstruction interpretation. Native/replay/three-replica controls must be freshly measured at this input. |
| Timers/concurrency/lifetime | Preserved. Existing per-handler partition claim, max-four background attempts, one timer, canonical cutover single-flight and exact registry fencing remain (`release-recovery.js:111-152,215-249,295-303`; `transaction-pause.js:58-104`). The C2 DT6 wrapper retains exact underlying handler delegation, not another retirement owner. No new timer or cross-component claim key is introduced. The focused integrated placement is still required. |
| One semantic owner | Preserved. C2 retains the existing recorder/branch/native decision owners; Kernel classifies held runtime, Runtime reconstructs, Recovery schedules, Cutover/Census decide complete release and Pause alone opens. The merged registry retains exactly two original endpoints under `raft-rs-runtime-application-transaction`; it is byte-identical to the corrected approved registry. Generated graph/debt cannot grant authority. |
| Harness/own-property contract | Preserved. `test/integration/helpers/cluster-test-helpers.js:261-309` captures node identity and own-property presence/value before awaits, derives only absent default from the actual resolver and overrides the later spread with those captured values. Own null/undefined/invalid injection is not converted into a grant. Bootstrap direct property controls retain measured build provenance and actual authorization owner. No merged fixture or duplicate local predicate is added. General hostile-port hardening is not claimed. |
| Formation/startup | No bypass, but unresolved actual red. Fresh seed release is still `src/bootstrap/bootstrap-service-seed-workflow.js:254-299`: actual measured build, actual fresh-seed token, shared existing deadline and canonical request owner. Existing-origin recovery cannot synthesize that token or reset the seed deadline; absent origin stops operator-required. The fact that this owner is composed does not imply seed setup is healed. Claim-cache needs successful bootstrap and real operation-table leader before T1 (`test/integration/message-group-membership-claim-cache.integration.test.js:267-288`); original bootstrap property cases' failed seed assertion followed by HTTP503 is downstream setup failure, not intended join-body engagement. |
| Transport/retirement | Preserved. C2's approved gate decorator forwards same inner handler identity and exact unregister. Recovery uses actual registry/event relay and canonical RPC; no response grammar, retry answer classifier, transport ACK or late-response handling change is introduced by merge. Source-only falsifiers must remain behavioral; a pre-placement host refusal is neither a test red nor green. |
| Evidence scope | Pending. Planned 19 unique files are recovery's 17-file cone plus claim-cache and bootstrap property, with direct protocol moved to adam for same-host C2 comparison. Native/focused two-source-only controls are additional expected negatives. This selected composition proof does not reissue all historical C2 cohorts at final HEAD or certify the full corpus/FreshMG/startup/main. Body engagement and all exhausted bounds must be recorded without assertion or budget weakening. |

## Canonical generated material and static state

Primary/resource/impact registry are exact recovery-parent bytes. Current subsystem SHA256 `ceff860e40f240938d3feb292933e6f9f130b1106fb82db37d8b6b72e1a55f7d` retains recovery parent's 2367 classifications/counts/digest; only observations and observationDigest differ. Graph seal SHA256 `4c103d0239efe6ef45362ba9e33d0e60685e766580cd55ac654fd70d9a4902ba` binds the composed source/producer/resolver graph. Inventory SHA256 `cbdf66ffe121ab24e06cb5cdd9eb7e5d33a81cb4f2ea2caaaf2d99d8b4aea3bf` is canonically regenerated measurement, not new permission to raise machine-check baselines.

I read `test-output/startup-intersection-20261013/integrated-metadata-refresh.log`, `integrated-owner-debt-refresh.log` and final static status/raw dependency/unused logs. Metadata/impact/shards pass. Dependency audit now reports the two retained Facts/Pause/Census cycles; C2's unresolved orphan edge is gone. Unused ratchet remains 1451 versus 1416 (lower than standalone recovery 1463). Full complexity remains 1777 versus 1755, cycle groups 1 versus 0, and test duplication 26415 versus 26369. Production duplication is 47/1462 at baseline. No ratchet scripts, thresholds or budgets changed.

Full complexity raw report SHA256 `2b662929ba1ed8a37b27922da14e9cb75b4dede727be1eded463a259dfdf987e` was read: zero entries touch the four recovery JS paths; among six C2 changed JS paths only inherited shared-helper `isPartitionLeader` complexity19 remains. This preservation classification does not waive any global static red.

## Baseline attribution and outstanding measurements

`evidence/startup-intersection-baseline-v1.json` SHA256 `15e48425580b7c34849188cdb991746ea196cc7f49a01f97a37227a7e416babf` binds C2-only input 406ceac. All 11 referenced artifacts match their hashes/bytes. Direct protocol is green on adam; claim-cache fails before T1 with release_drain_pending; three original property cases fail seed setup with typed release_deadline or drain_pending. All 138 seed services existing is not proof of successful release. An explicit release_deadline is actual exhaustion; drain_pending alone does not identify the blocked canonical work field, and whole-file duration alone is not an internal deadline.

The first integrated focused Carinas attempt is a retained **not-executed placement refusal**, not a behavioral regression: `integrated-v1-carinas-windows.log` contains only the readiness error at placeLabLanes, without placement HEAD/PID/TAP. Any later canonical same-host placement must be recorded separately; no test attempt was executed and then rerun green by this scheduling disposition.

Final candidate/control raw outcomes, exact body engagement, complete artifact archive and before/after hash recheck are still required before a final composition verdict. Any later source/test correction would invalidate this preservation binding and require independent delta review. Main, whole Quest, corpus and integrated startup remain HOLD regardless of partial green.


<!-- 2026-10-17 lead note (owner ruling, closeout plan decision 4): the C2 independent implementation review cited above was retained in the superseded quest message-group-c2-orphan-removal-alpha; its closed-quest shape removed the file, so the same bytes (sha256 0429ae581ab04210a5f6f04287e309afaf0e263f246e249a40fb98b058ae31bd) now live at solve/quests/message-group-fresh-identity-membership/evidence/c2-independent-implementation-review-20261013.md under the superseding FreshMG quest. Path changed only. -->
