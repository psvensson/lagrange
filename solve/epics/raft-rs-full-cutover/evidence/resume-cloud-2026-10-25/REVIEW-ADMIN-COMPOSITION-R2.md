# Independent ADMIN composition source review

Reviewer: `subagent:/root/metric_review`. Date: 2026-10-25. Author/integration owner: `/root`; preserved admin unit reviewer: `/root/admin_review`.

## Verdict and applicability

**APPROVE the bounded R2 composition at the frozen source hashes for source correctness. No confirmed source finding remains in this reviewed composition. Executable composition acceptance remains pending.**

This verdict is about preserving the reviewed ADMIN owners while integrating them with current CDC D1/D2, Q6 and fresh-start behavior. It does not close an ADMIN Quest, establish a passing canonical startup receipt, certify the distributed service, or approve main/publication. No product or test source was edited by this reviewer. No local runtime/native test, controller, analyzer sweep or lab submission was executed for this review.

The integration source is base `709dc2bebd4abdbec9a5d4fb2232c2621d7897f7` plus these exact units, with bounded composition corrections:

| Unit | Commit |
| --- | --- |
| Core ADMIN | `8fee98abecb29133815f9ffab9c096019692f24b`, from old base `9adb6f5de25ec4a630438fa2c195df5e536cba2e` |
| Conditional node removal | `e701ca2b35b9f682dcd051997d521fe3134bfc89` |
| PG-wire scaling | `6a228ced9439af07216b492bb8fdbba5540c3671` |
| Exact logical identity | `a97f79c35b7e1f6428032493918e16e623339688` |
| Coordinator predicate | `c582aa545068cf182754da98028812912d628bf0` |
| Config/policy effect confirmation | `930abb048f2d04db5bdb47bea20fc2ce7c450a17` |
| Complete partition cohort | `9a7aeca9e2dde7d009643d62c904bc789b70c97d` |

Marker is excluded. The superseded listener implementation is excluded. The current tighter duplication baseline, 654 blocks / 24,609 lines, is retained instead of the old incoming 675 / 25,566 values.

The R2 manifest `/workspace/scratch/285a938494ce/admin-composition-source-freeze-r2.json` has SHA256 `f65d4035b2725b87e2a919ab9830b91da634f4e5fac4d6b3a79679ce5ee3f613`. The independent `composition-source-binding-check-r2.json` verifies all 129 changed/deleted JavaScript paths against disk and the staged index, with zero unbound changed JavaScript paths. Exactly two paths differ from R1: `src/admin/admin-owner-operations.js` and `test/admin/admin-owner-mutation-outcomes.test.js`.

The original R1 binding and verdict are retained. R1 contained 116 exact incoming-unit paths and 13 manually reviewed differences; R2 adds only the correction below. Approval transfers to a later preservation commit only when these semantic bytes remain exact. Evidence/docs/generated metadata do not substitute for that binding.

## Consolidated finding and correction

**F-ADMIN-COMPOSE-1 is corrected in source.** The full original medium-severity finding, systematic family census, prior design evidence and primary comparisons are preserved in `REVIEW-ADMIN-COMPOSITION-R1.md`.

R2 imports `CDC_TABLE_POLICY_REFUSAL` and adds its `EXTERNAL_CDC_UNSUPPORTED` value to the existing refusal map with `HTTP_STATUS.BAD_REQUEST`. `answerOwnerFailure` consequently preserves the existing owner's refusal, with no new admission branch or mutation authority. Config/policy confirmation, node-incarnation predicates and PG-wire owner outcomes are unchanged by this correction.

The added section of `test/admin/admin-owner-mutation-outcomes.test.js` enters actual Fastify routes and the real `TablePolicyService` and gateway. Both top-level and nested true forms assert 400/refused, the owner code, zero CDC mutations, retained policy cache and zero events. A subsequent explicit-false request in the same fixture asserts 200/applied, one CDC mutation, cache invalidation and one event. Restoring the R1 map causes the asserted HTTP status and refusal outcome to disagree with the source path. That is a source-derived negative prediction; the lab has not yet run either sample.

The census found no other missing declared validation/conflict code in the four changed semantic owner families. The existing unknown-outcome path remains truthful. Broader inherited shared-classifier compatibility is separately recorded by the admin reviewer in `MUTATION-OWNERSHIP-CAUSAL-MAP-2026-10-25.md`; this composition verdict does not certify whole-repository removal of legacy/fallback behavior.

## Merge-sensitive contract review

| Interaction | Reviewed composition and preserved invariant | Proof still needed on the composed source |
| --- | --- | --- |
| Client write admission and Q6 transport | `sql-statement-ingress.js` owns origin classification and exact reserved-table admission. Public entry dispatch marks client options; routed requests carry that origin. In `partition-service-remote-query-methods.js:267–270`, a refused client write returns the owned failure before participant staging and contains no answer ACK alias. | Actual engine/partition admission test, with allowed user writes and refused system writes in the same witness. |
| Router answers in the new admission fixture | QUERY and TRANSACTION fixture branches use `buildDeliveryEnvelope`; the QUERY handler is awaited, the transaction helper is synchronous, and unexpected message types throw. An actual direct partition refusal is checked for absence of `acknowledged`. | Run the modified admission witness and affected Q6 query/partition witnesses. |
| Existing Q6 consumers | The composed query request builder keeps `deliveryTransportOf`/`deliveryAnswerOf`; only the ingress field is added. Local admin service dispatch retains `answer: {payload}`. No old `delivery: {acknowledged, payload}` answer shape is restored. | Q6 query, partition and admin-dispatch slices on the same candidate. |
| Coordinator identity plus D1 owed work | `partition-participant-transaction-apply.js` changes only the coordinator predicate relative to current owner logic. D1's `admitCdcOwedWork` / `settleCdcOwedRefusal` remains before durable PREPARED insertion. Exact logical identity uses the shared resolver and does not revive lowercase aliases. | Exact coordinator, transaction schema/admission, PREPARED capacity and registered transaction interaction witnesses. |
| D2 recording and traffic | `TablePolicyService.updateTablePolicy` and CREATE policy resolution retain `assertTablePolicyCdcRequestSupported` before writes. The static CDC policy remains authoritative. `recordCommittedWriteTraffic(service, committed.afterCommit, operations.length)` stays after committed participant application, independently of whether a CDC event is recorded. | Policy true/false, CREATE policy, static table selection and participant obligation witnesses. |
| Fresh original authority and listener acquisition | `lagrange-runtime-startup.js` retains the narrow `assertOriginalSeedPublicAdmission` callback, with no whole-service BootstrapAPI fallback. Listener acquisition still precedes bootstrap initialization/public readiness, and bind failures are not swallowed. Incoming changes only pass established semantic owners into admin composition. | Listener-failure and startup-custody slices; separately the unchanged canonical fresh-seed controller receipt. |
| Owner availability and local drain | The late providers forward current config/policy/nodes/service-definition owners. Bootstrap/join bundles expose only the existing `systemMetadataOwners` getter. Admin and shutdown share the role-selected local drain entry; no catch/retry branch invokes another authority after a failed drain. | Existing admin drain tests and startup wiring. No remote-drain capability is claimed. |
| Config/policy completion | The exact 930 gate uses the existing canonical effect classifier and requires confirmed one-row application before success/statistics/cache/event publication. D2 admission remains ahead of that mutation, and the new HTTP mapping only represents its error. | Real HTTP-owner-gateway negative outcomes and stale-then-fresh applied control. |
| Conditional node deletion and PG-wire scale | Incoming owners retain observed incarnation/status predicates and specific built-in service identity. They do not use raw client system-table SQL or move placement/readiness decisions into the admin adapter. | Node/CDC disappearance and successor-preservation witnesses; scale-owner and supported-caller witnesses. |
| Full partition-cohort readiness | The composed source exactly matches the reviewed cohort unit. It resolves catalog ID, reads every row in that ID cohort, requires exact ID/name on every row, and deletes by-name early success. No repair writes or new metadata source appear. Fixture changes retain operation/fault choices. | Corrected intrinsic-safe cohort witness and affected readiness callers. |
| Other incoming-relative fixtures/exports | Boundary-transition keeps the integrated envelope builder; PG-wire/public-Binding tests keep the current machine-factor helper. `src/node/index.js` preserves prior removed exports alongside removal of the obsolete node lifecycle service. | Named caller tests; full static import/export gates remain mandatory. |

The complete incoming-relative production and test diffs are retained as `src-incoming-relative-composition.patch` and `test-incoming-relative-composition.patch`. They were read in full. The original core review's two findings are addressed by the separately reviewed 930 confirmation and complete-cohort units; their source reviews are included in the applicability chain, without relabelling old execution results as current runs.

## Applicable adversarial lenses

**Admission and authority:** entry/partition decisions preserve client origin and exact identity. The accepted scope is INSERT/UPDATE/DELETE admission at supported client entry paths, with existing in-process owner routing. It is not a new authentication model or a complete arbitrary-RPC adversary guarantee. The inherited in-process boundary is visible rather than presented as a new public bypass.

**Transport and recovery:** transport acknowledgement cannot supply domain success, and loss/unknown delivery is not converted into definite noncommit. Reviewed deltas retain current Q6 separation and D1 reservation ownership. No new settlement, re-drive, timer, retention or queue policy was introduced by composition. Registered transaction witnesses remain required because both coordinator and participant source paths are changed.

**Temporal and projection checks:** the confirmation fixture keeps failed/uncertain publication blocked, then re-enters the actual owner for fresh success. The cohort witness follows empty metadata with a complete cohort, rejects a mixed complete/incomplete cohort, and admits no by-name shortcut. A cache/readiness projection is not promoted to mutation authority.

**Pressure and resource bounds:** D1 PREPARED capacity remains prior to retention, and D2 traffic accounting remains independent of CDC admission. Source preservation does not prove eventual native acknowledgement or sustained resource bounds; those wider W7/W9 and CDC obligations remain with their existing milestones.

**Fixture fidelity and hostile intrinsics:** new router answers use the production envelope owner; tests retain engagement assertions and failure meaning. Cohort module-load intrinsic captures retain arguments, predicates and event ordering. The reviewed correction changes no timeout, retry count, baseline, allowlist, pass criterion, owner double or physical fault obligation. No red control was executed in this source review.

**Registry:** the changed owner/contract paths remain registered. Four coupled interactions have both endpoint source paths changed: transaction coordinator/participant; public Binding policy/merge; original-foundation producer/observation; and admin mutation confirmation. Their complete 23-test witness union is included in the focused selection. One-sided Q6 intersections are also included because composition specifically preserves that current contract.

## Exact proof handoff

`admin-composition-focused-tests.txt` contains **68 distinct existing test files**, and `admin-composition-focused-tests.json` records every selected group and reason. The list includes the direct owner/caller changes, complete-cohort callers, current D2/D1 and Q6 interactions, startup/listener custody, and all witnesses of the four both-endpoint registered pairs. Every listed file was checked to exist. It is a focused current-composition selection, not a replacement for the canonical impact selector, full corpus or final gates.

Run the first discriminator, `test/admin/admin-owner-mutation-outcomes.test.js`, after freezing the corrected candidate. Then run the remaining selected files through the existing classified lab owner with retries zero and maximum concurrency one. Do not repeat a passing discriminator merely because it also appears in the list; retain it in the same bound result set. Source, lockfile/toolchain identity, full first-failure output, terminal result and cleanup/lock custody must remain attached to the run.

The canonical fresh-seed receipt remains a separate outstanding acceptance: invoke the existing reviewed controller/writer path for `node scripts/quest-evidence/fresh-seed-activation.js --output <evidence-directory>/receipt.json` under its prescribed thermal/custody and exact-source checks. The ordinary focused tests and a successful public request do not replace that receipt. Its controller contract is preserved at `solve/epics/raft-rs-full-cutover/evidence/stop-2026-10-25/raw/controller/REVIEW-final.md`.

Execution status at this report: **not submitted or run by this reviewer**. `/root/startup_lab` owns lab submission and result collection. Historical restored admin/cohort logs remain historical unit evidence; this review has produced no new assertion total. The next action is exact-candidate classified execution and ordinary source-bound static gates, followed by review of concrete failures. No additional source-review gate is invented while that required work remains pending.
