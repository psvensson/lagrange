# Rs-raft U1 — exact-source positive/negative evidence and remaining acceptance gates

**Date:** 2026-10-20. **Disposition:** WIP proof ledger, **NOT** independent combined U1 acceptance, U2 permission, activation certification or `main` merge.
**Owner:** `raft-rs-full-cutover` epic / `wasm-creation-genesis` quest. All GitHub references are immutable exact commits or actual original lab issues.

## Exact positive candidates and their ceilings

| Subject | Exact source SHA | Executed terminal result |
| --- | --- | --- |
| Full bounded focused selection | `ccdd6938c5e79ff95fbd71a2090ba4c800223266` | [lab #439](https://github.com/psvensson/lagrange-lab/issues/439): **15/15 PASS**, 418 runner assertions, tv-dator |
| Named owner compatibility | *same exact* `ccdd6938c5e79ff95fbd71a2090ba4c800223266` | [lab #440](https://github.com/psvensson/lagrange-lab/issues/440): **23/23 PASS**, 958 runner assertions, lenovo-laptop |
| Extra post-shutdown physical-inspection assertion | `69f1ce966857eae42b63cc4e7f182260a1362730` | [lab #471](https://github.com/psvensson/lagrange-lab/issues/471): **1/1 PASS**, 3 runner assertions; test-only delta against ccdd6938 |
| Historical test-only original-source defect | `54950e9969f91c73ce7af1bc294db8eef41195e6` | [lab #419](https://github.com/psvensson/lagrange-lab/issues/419): RED synchronous-handler/lifecycle interleavings |
| Immediate WASM correction | `a1d3b056d75e85f257646da6388b0c003a45b30b` | [lab #420](https://github.com/psvensson/lagrange-lab/issues/420): synchronous retirement and all 1,884 schedules PASS; whole file RED for four inherited fixture failures |
| Corrected original fixture | `69f597091071c4bbb254179939d7e8ea771b7a1a` | [lab #422](https://github.com/psvensson/lagrange-lab/issues/422): **1/1 PASS**, 54 runner assertions (original fixture now uses deferred commit/rollback effects) |

The `ccdd6938` delta versus `61a4c4c` changes **only two new test files**. These seven reconstructed inventory/execution cases are not byte-identical recoveries of the unpublished test-only checkpoint described in the prior handoff, and are not independent native physical certification. The final `69f1ce96` changes only an assertion in the inventory test: the 38-file positive evidence does **not** automatically transfer to that new tree. Refresh metadata and rerun the final selection if choosing `69f1ce96` as the acceptance SHA.

## Deliberate source-only regressions: executed effect discriminators

The mutations below were made on *separate* Git branches based on the unchanged relevant positive oracle tree. They modify production implementations, not test assertions. The linked issue records the controller's actual terminal outcome, not a proposed test or synthetic verdict.

| Property | Mutation commit | Executed lab / decisive effect | Disposition |
| --- | --- | --- | --- |
| P0 pre-start physical currentness | `818d8f22` | [#441](https://github.com/psvensson/lagrange-lab/issues/441) `OLD_CONTEXT_STARTED_A_SUCCESSOR_THROUGH_SERVICE_ID` | Meaningful RED |
| P1 manager STARTING return | `1edcf2a4` | [#442](https://github.com/psvensson/lagrange-lab/issues/442) `LATE_ORIGINAL_RETURN_REPLACED_SUCCESSOR_MANAGER_RECORD` | Meaningful RED |
| P2 driver PUBLISHED return | `84bc1a87` | [#443](https://github.com/psvensson/lagrange-lab/issues/443) `LATE_PUBLISHED_DRIVER_RETURN_MARKED_HELD_SUCCESSOR_RUNNING` | Meaningful RED |
| P3 manager RUNNING confirmation | `36b2a862` | [#444](https://github.com/psvensson/lagrange-lab/issues/444) `LATE_ORIGINAL_RETURN_REPLACED_SUCCESSOR_MANAGER_RECORD` | Meaningful RED |
| P4 post-services projection | `a528f7a6` | [#445](https://github.com/psvensson/lagrange-lab/issues/445) `LATE_SERVICES_RETURN_INVOKED_RETIRED_CREATIONS_ENDPOINT_WRITER` | Meaningful RED |
| P5 post-endpoint write | `c591a75d` | [#446](https://github.com/psvensson/lagrange-lab/issues/446) `LATE_ENDPOINT_RETURN_INVOKED_RETIRED_CREATIONS_PHYSICAL_MARK` | Meaningful RED |
| V1 failed inventory retry | `b5999e19` | [#447](https://github.com/psvensson/lagrange-lab/issues/447) `FAILED_SCAN_MUST_RELEASE_ITS_RETRY_OWNERSHIP` | Meaningful RED |
| V3 late generic STOP over successor | `d9d95ac1` | [#448](https://github.com/psvensson/lagrange-lab/issues/448) `LATE_OLD_STOP_SETTLED_SUCCESSOR_MEMO` | Meaningful RED |
| V3 missing generic gate release | `881c1c31` | [#449](https://github.com/psvensson/lagrange-lab/issues/449) three independent old-gate/retry assertions | Meaningful RED |
| V9 initial REMOVE guard outside finally | `3995101b` | [#464](https://github.com/psvensson/lagrange-lab/issues/464) `STALE_QUEUED_REMOVE_DID_NOT_RELEASE_EXECUTION_GATE` | Meaningful RED |
| V1 concurrent inventory missing coalescence | `ece9d108` | [#473](https://github.com/psvensson/lagrange-lab/issues/473) concurrent scan counts 4 vs required 2 (including earlier failed scan) | Meaningful RED |
| V1 removed post-scan lifetime check | `d60770c7` | [#474](https://github.com/psvensson/lagrange-lab/issues/474) `POST_SHUTDOWN_INVENTORY_INVOKED_PHYSICAL_INSPECTION_OWNER` | Meaningful RED |
| V1 removed post-inspection lifetime check | `2d0dbc32` | [#475](https://github.com/psvensson/lagrange-lab/issues/475) shutdown returned plans instead of `UNAVAILABLE`; stale continuation was admitted | Meaningful RED |
| V2 historical plan keyed by physical replica, not CREATE ID | `f76e4ca9` | [#479](https://github.com/psvensson/lagrange-lab/issues/479) `EXACT_F_RETRY_DID_NOT_ENTER_ITS_OWNER` | Meaningful RED |

Three further precise isolated controls were submitted, but their final terminal receipts must be read before classification:

- V4 ordinary HELD memo wake omission: `208bc056`, [#480](https://github.com/psvensson/lagrange-lab/issues/480).
- V5 physical currentness reduced to token ID: `694e9d1c`, [#483](https://github.com/psvensson/lagrange-lab/issues/483).
- V7 physical `FINAL` without original journal `ROW_COMPLETED`: `c975b461`, [#484](https://github.com/psvensson/lagrange-lab/issues/484).
- V8 strict repository read without absence confirmation: `97d760e9`, [#485](https://github.com/psvensson/lagrange-lab/issues/485).

Any control that reports an import, timeout, malformed fixture or setup failure before its decisive effect must remain **UNPROVEN**; a generic RED or total failure count is not sufficient. The above linked receipts were classified by reading the actual first substantive error; they do not establish a synthetic independent review.

## Bounded source-review lineage

- The original coherent handler and physical U1 source approvals are preserved at `ac092686975dd22b4843be8df8e2e1d3663c0b7f` / equivalent `ed9c5ccc`, production tree `10a9c9d676d5b71e1b5d522f84882c596440e26a`.
- `u1-nine-path-source-independent-review-ac092686-a55ab412-20261019.md` **APPROVES the bounded nine-path net delta except the generic REMOVE early return** (composite `a55ab412` was REVISE). It did not perform tests. The source guard itself received separate independent approval at SHA256 `a8db277dc5bd861796d870478bd52397984e6e5d444a02000ad3604ff3af7f30`, documented in `u1-remove-guard-source-and-prestart-order-independent-verdict-20261019.md`. #464 now measures the corresponding V9 failure on the newer tree.
- The new synchronous WASM handler-retirement source delta at `a1d3b056`, plus inherited-failing test corrections, needs an **independent review against the final exact bytes**, not self-certification by a positive test. Handler unregistration synchronously closes address admission; asynchronous reconciliation/opening/physical release remain separately joined. This is the same *systemic lifetime* family as earlier exact-identity handler and dropped-continuation incidents.
- The final candidate also requires rechecking any changed source blob/contract/hook gate against previously approved source hashes. The post-commit safety-state fixture correction matches the authoritative `raft-rs-application-transaction-owner` callback shape. The Cell fixture enters public CREATE and awaits the admitted worker. The services-row fixture distinguishes a token-only invalid invocation from a real retained physical origin.

## Outstanding immutable final gates

1. **Source/candidate identity:** decide the final reviewed `69f1ce96` candidate versus its `ccdd6938` parent; freeze and rebind source/test SHA and every relevant copied oracle to the accepted candidate. The new 2-file witnesses have not yet received an independent final oracle review.
2. **Canonical metadata:** in an isolated checkout at the exact final SHA, run the repository's ordinary `npm run -s test:metadata:refresh`, preserving all **four** derived test metadata/seal files, and commit with its normal hooks. Do not hand-compute the import graph seal or pass stale manifest hashes as green. Recheck current source tree after any generator commit.
3. **Whole-U1 static:** `node scripts/check-fast-static.js --base 381750de29af647d446b19adedf1da53eb712093 --explain` and `node scripts/select-change-tests.js --base 381750de29af647d446b19adedf1da53eb712093 --explain`; record the actual ordinary cone rather than silently replacing its ~1,896-file predecessor census by a curated 38-file subset. Run normal hook/static and dependency gates on exact HEAD.
4. **Final exact positive:** repeat the 15 focused + 23 named compatibility selections on one final frozen candidate if any test, production, or generated byte changed. Preserve both lab terminal receipts, all file counts and first failures.
5. **Remaining controls:** reconcile the approved v3, 55-item implementation checklist and V1–V9 evidence map. In particular keep V2/F6 distinct historical CREATE debts, V3 capture/late response and V4 wake, V6 physical custody, V7 stopped projection/journal and V8 legacy authority as *separate* safety and progress conclusions. Historical unchanged lower-owner proofs can retain only their original bounded claims.
6. **Independent combined U1 acceptance** over exact current source/tests plus all evidence. Only an actual APPROVE closes U1 and releases U2's sealed dependency. Release integration, whole native physical proof, activation, and `main` merge are still separate gates. No automatic expansion of the finite U1 scope into adjacent request-Cell generic lifetime work.

**No release sign-off or merge action is authorized by this evidence document.**
