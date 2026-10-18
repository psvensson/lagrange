# Corrective inventory/lifetime design review — stopped checkpoint

Reviewer: `/root/verify_recovery_u1`.

**Status: INCOMPLETE / REVISE — preliminary record only. No content approval.**

The root agent instructed this review to stop because the user requested all changes committed and pushed with a handover. This record preserves the completed reading and the one confirmed design issue found before that stop. It is not a category-complete design verdict and must not be cited as approval of any unreviewed subsection.

## Exact subjects

- Proposed contract: `/workspace/scratch/6d2a7b72384f/u2-preparation/u1-inventory-continuation-contract-v2.md`.
- Contract SHA256 measured at this checkpoint: `b871e38a5307933e32c085e55e47b0a650c42319da85073b67e028116594858f`. This matches the requested review identity `b871e38a5307933e32c085e55e47b0a650c42319da85073b67e028116594858f`.
- Original proposal: `/workspace/scratch/6d2a7b72384f/lagrange/solve/quests/wasm-creation-genesis/evidence/recovery-20261017/u1-correction-proposal.md`.
- Original-proposal SHA256: `90d98bb2bae217faaeff848200bc684ccfc20a9ac4c2c1a22fc8b759b8a61d34`.
- Implementation used for read-only source checks: isolated worktree `/workspace/scratch/6d2a7b72384f/verify-recovery-u1`, HEAD `a251ce4fd9c980a78c0fd33d8a5f873161f90870`.
- The separately approved reservation-finality subsection was excluded from this review; root is implementing it. This reviewer makes no new approval claim for that subsection or implementation.

## Confirmed preliminary finding D1: the declared noncurrent-plan retry is incompatible with restored normal memo routing

V2 section 4 explicitly gives a known original CREATE access to its exact continuation while the canonical memo is in the collision-only `CREATION_CONTINUATION_PENDING` state. The same section says that normal memo routing applies once an exact current physical continuation is established. Section 9 promises that a retained noncurrent REENTER plan, including a future PENDING request F, is retried by its matching original CREATE redelivery.

Those clauses require an explicit precedence amendment. With J current, the existing normal custody table does not dispatch a request for F to F:

- A named ACTIVE(J) memo calls `refuseForeignCreation` and emits CONTENT_CONFLICT under F's request identity (RV7.3).
- A HELD(J) memo calls `reenterRetainedCreation`, constructs its continuation from `existing.operationId`, and therefore reenters J, irrespective of F's request identity (RV6.2).
- The existing wake lookup finds the operation through the in-flight map or a memo naming that operation. After F's attempt has settled and J owns the memo, F's separate plan is not part of that lookup.

Source anchors: `src/node/runtime-service-bound-creation-route.js`, `reenterRetainedCreation`, `refuseForeignCreation`, `replyToRetainedMemo`, and `findWakeTarget`; `src/node/runtime-service-handler.js`, existing CREATE dispatch. These are the uncorrected exact-source paths named above. This issue was communicated to root immediately during review.

The concrete scenario is a valid future PENDING F and an admitted/current J sharing a canonical replica. Inventory retains both; J becomes current; F's initial attempt is unresolved. Later, the real owner prerequisite for F changes and F's original CREATE is redelivered. Under unchanged normal memo routing, that redelivery does not retry F's original reservation/continuation. A later process restart remains possible, but it does not satisfy the separately promised redelivery trigger.

**Required owner decision:** give lookup of a known exact retained startup plan explicit precedence on every applicable later CREATE redelivery and wake, including while a different creation owns the current memo, and name the corresponding RV6.2/RV7.3 amendment. The result still belongs only to the original operation, and the canonical gate/physical owner still decide effects. Alternatively, withdraw the redelivery guarantee and provide the precise replacement trigger and custody owner. Special handling limited to the initial collision memo cannot establish the current section-9 guarantee.

This is a source/contract incompatibility identified in a design review. No new dynamic test was run for it, and no claim is made that any proposed implementation already has this defect.

## Reviewed facts supporting the next review

The v2 contract and the original proposal were read in full. The intervening inventory amendment draft was also read. The completed original-unit F1–F6 report and its counterexamples remain the starting evidence; no original evidence was changed.

Read-only source checks reconfirmed the following existing boundaries:

1. `WasmServiceLifecycle.activeReplicas` is keyed by service ID. Its bound create path returns an exact same live creation and otherwise uses the live/retiring physical fence; the handler memo is not that authority.
2. The original manager writes canonical STARTING before prepare and STOPPING before stop, then can write RUNNING/STOPPED after awaits without exact-current checks. The proposed ownership-record/current-observation change therefore addresses an actual interaction boundary; its complete correctness was not reviewed before stopping.
3. Original by-path retirement captures the exact retained intent/token and instance-qualified path. Its local-retired boolean includes CREATION_STORAGE_MISSING. V2 deliberately requires stronger RETIRED/ALREADY local evidence for the history-finality case; that difference needs to stay explicit in later implementation review.
4. Original runtime/manager/handler retirement completion derives from different conditions. The previously measured historical-completion failure F5 remains valid. V2 proposes a shared physical fact and a separate journal-completion obligation, but the complete retry and settlement contract is not approved here.
5. The original named-memo route is exactly the routing that conflicts with the declared future-plan redelivery above.

These observations are not partial approvals. The remainder of the proposed continuation table, synchronous observation API, canonical manager record conversion, all driver bookkeeping writes, shared CREATE/REMOVE gate, historical cleanup triggers, physical shutdown joins, and every witness/mutation in v2 still require the requested full independent design review.

## Stop state and handover

- No production or test file was edited during this design review.
- No tests, mutation runs, lab jobs, commits, pushes or ref changes were performed.
- No local runner or asynchronous tool session owned by this reviewer remains in flight. The measured runner had already been released to root after original-unit verification.
- The isolated source worktree remains at `a251ce4fd9c980a78c0fd33d8a5f873161f90870` with empty tracked status: `''`.
- The completed original-unit verdict remains **REJECT**, at `verify-u1-evidence/verdict.md`, SHA256 `aa5ec206809b76613f55b7547b318a3d4994757d7379d71dbd83fcc5c9b2f168`. Its six failure classes, 55 checklist items, measurements, fifteen independent cases and thirteen killed mutations are complete and unchanged.
- Root owns copying this checkpoint and the existing evidence into the lane's append-only record and performing the user-requested commit/push/handover.

**Resume instruction:** reopen this content-bound v2 review at D1, resolve the exact-plan dispatch precedence with the owner, then finish the adversarial multi-row, current-projection, retry, and lifetime review before issuing any APPROVE. Do not infer acceptance from this stopped checkpoint.
