# C2 V2 independent lab attribution review

Reviewed 2026-10-13 14:44 UTC by `subagent:tx1_deletion_design_vet`, read-only. No source, tests, metadata, Git, lab execution, or Quest disposition changed. This is an additive evidence review; previous reports remain historical and unchanged.

**Verdict: APPROVE the explicit historical attribution of the 13 V1 outcomes to unchanged runtime/test inputs. Whole Quest acceptance, final-HEAD/corpus proof, and main landing remain HOLD.** The existing source and four-fixture content verdicts are unchanged; this report does not authorize additional implementation or certify release recovery.

## Exact bindings

| Input | Commit | Tree | Parent |
| --- | --- | --- | --- |
| Candidate V1, actual 13-file execution | `30706bc400f622e5849ca0697471a5fcdad81ea8` | `2f4f7b0bab060bc450fda9b5be9289814855d528` | `d35d8828c630d1b9675b47f511c477b3cc9ee991` |
| Candidate V2 | `47e9e99ab1c2a8df806054a7d7d1e2efafcfaf23` | `3f5c31fbb9067873243f09531897f1e32f8a4b56` | same |
| Source-revert V2 control | `80297d6b2d8c283c89b3875c27dbc6b163c3a0d9` | `73055fcb9526289d64cea3dc3e1d51795347d6cf` | same |

I independently read the actual immutable worktrees' HEAD/tree/parent values and every present/absent file hash listed by `test-output/c2-orphan-removal-20261013/source-revert-pair-v2.json`; all match. Pair manifest SHA256: `e7b75079fdbde1397045e423531a234cd9bad93cfd2023539eb68ad5b289c51b`.

Actual candidate/control Git difference is exactly these four production paths, with no other tracked-byte difference, including tests, metadata, documents, or Quest evidence:

- `src/rebalancer/replica-operation-message-group-learner-successor.js` — absent in candidate, reinstated in control.
- `src/rebalancer/replica-operation-message-group-promotion.js` — absent in candidate, reinstated in control.
- `src/rebalancer/replica-operation-message-group-membership-authorization.js` — candidate SHA256 `9f78cfb0f3ef0ef1742661179e21e117381acba9e0038b7f309a8074875cb39f`.
- `src/rebalancer/replica-operation-message-group-membership-permit.js` — candidate SHA256 `a7c2fc03e8fd66e279e77a13c28a1a868cffe18a10f63aaa49714ab23b5e0ab0`.

The independent four-source review remains `evidence/independent-implementation-review.md`, SHA256 `0429ae581ab04210a5f6f04287e309afaf0e263f246e249a40fb98b058ae31bd`. The 44-item fixture review and corrected V2 content/metadata binding remain incorporated by `evidence/harness-implementation-review-v2-final-metadata.md`, SHA256 `c32913163736ea139357ce5e10511bd15a79aa6c41f810e123a21f468e13190a`. This bounded review adds evidence attribution, not a second source approval.

## Attribution and transitive-input findings

1. **APPROVE — the 13 executed test bodies and their runtime/fixture bytes are unchanged V1 to V2.** I compared all 13 test Git blobs individually: zero differences. There are zero differences under `src`, `scripts`, `vendor`, `test/integration/helpers`, `test/helpers`, or in `package.json`, `package-lock.json`, and `.taprc`. The only changed executable/selection paths are `test/bootstrap/node-bootstrap-consistency.property.test.js`, `test/shards/subsystem-classes.json`, and `test/shards/impact-graph-seal.json`. The complete Git difference additionally contains append-only Quest evidence/report/log files; saying the *entire* V1-to-V2 Git diff has only three files would be inaccurate.

2. **APPROVE with stated scope — no changed transitive input to those 13 was found.** A literal relative-import walk from the 13 tests visited 1,498 local module files with no missing local import target; none of the three changed property/metadata files is in that closure. Fixture file reads inspected in that closure use the test-created SQLite/payload/WAL/marker files or the unchanged vendored binding source and artifacts (`test/raft/raft-rs-backend/raw-raft-rs-test-core.js:25-47,66-79`; `committed-membership-oracles.js:29-48`). This is a static import/read audit, not a claim that a regular-expression walk proves every possible dynamic import. The decisive additional bound is that all runtime, script, manifest, lock, vendored, and shared-fixture tracked bytes are unchanged, and explicit cohort file lists are preserved in each actual lab input. Generated metadata does influence test selection/classification, but V2 retains all class assignments and the 13 named cohorts' ordinary/exclusive lanes; it adds observation edges, not a new runtime policy.

3. **APPROVE with provenance limit — runtime-build measurement does not hash the changed property, test metadata, or Quest history.** The actual source-mode owner hashes all `src` files, installed production dependencies, and package/lock bytes (`src/diagnostics/runtime-content-fingerprint.js:8-11,16-57,67-81`). Boot measurement additionally consumes the verified Raft artifact identities, actual SQLite addon/envelope, and running executable (`runtime-build-provenance.js:31-47,60-74`), cached once per process at `81-83`. Thus there is no V1-to-V2 source-driven build-fingerprint invalidation for the 13 cases. Remote installed dependency/native/addon/executable bytes and host conditions remain facts of the *actual* historical placement, not newly measured local facts or an assertion of bit-identical environments across different attempts. The raw logs bind their actual placement HEAD and linked dependency tree.

4. **REQUIRED wording — source-revert control has different measured source content by design.** Restoring the four island files/exports changes the canonical all-`src` content fingerprint even where code is unreachable. It is not correct to call candidate/control runtime-build digests identical. Each real owner derives its own build facts; the unchanged test validates those facts. The pair is a source-only treatment with unchanged test/fixture bytes, not a constant-build-fingerprint experiment.

5. **APPROVE historical reuse only — do not relabel the execution.** The 13 outcomes remain attempts of V1 `30706bc...` on their recorded hosts, with equivalent tracked runtime/test inputs at V2. They can be included additively in a scoped preservation argument and paired with the V2 source-only controls, explicitly naming both inputs. They cannot become “13 files executed at 47e9e99a,” a single-final-HEAD receipt, or proof of the complete corpus. The new V2 property case and its two additional files are separate actual V2 executions. No duplicate rerun is necessary merely to change the label; final corpus/Quest requirements remain separate guards.

## Measured outcomes and honest scope

I verified every artifact hash listed in `evidence/candidate-v1-lab-result.json`; zero mismatches. Result document SHA256: `ea2531d0e3e52affe292b6f41138891e1aac99ebbe15d3d908c6529d907c8610`. Its 13 records sum to 444 runner assertions, 12 green files and one red, with attempt 1 and no test retry in every record.

| Host / explicit cohort | Candidate actual input | Candidate | Source-revert V2 control |
| --- | --- | --- | --- |
| tv-dator, seven current branch/learner/progress/release files | V1 | 7/7 files, 294 runner assertions | 7/7, 294 |
| adam-laptop, three learner/runtime/claim-cache integrations | V1 | 2/3, 77 | 2/3, 77 |
| lenovo-laptop, native fresh promotion/discovery/recipient | V1 | 3/3, 73 | 3/3, 73 |
| adams-gamla, corrected property/rejoin-hints/seed-migration | V2 | 2/3, 111 | 2/3, 111 |

The fourth intended V1 placement used the absent inventory name `adams-laptop` and never ran tests. It contributes no behavioral proof. The subsequent `adams-gamla` cohort is an actual V2 run, not a successful retry of those nonexistent V1 results. The mixed-input arithmetic is 16 files, 14 green, 555 runner assertions; it must never be presented as one 16-file final-HEAD candidate run or as all behavioral requirements passing.

**Claim-cache stays red and does not certify T1 behavior.** V1 reaches real bootstrap, creates 138 services, and fails the seed assertion before the intended failed/successful T1 bodies on `call_activation_leases-p1` with exact `release_drain_pending` (`evidence/candidate-v1-adam-laptop.log:18-38`). Its timing record is 10,436 ms inside a 30,000 ms outer test budget (`:19`); this is a genuine internal release failure, not a fully spent outer 30-second wait and not a harmless setup exemption. The same-host source-revert also reaches bootstrap and fails before T1 on that partition, now `release_fact_unavailable`, phase `release`, missing fact `release_deadline` (`test-output/.../source-revert-v2-adam-laptop.log:18-38`). Both inputs exhibit release-progress failure; their exact typed outcomes differ. This supports an unresolved common owner-path problem, but does not identify one exact internal root cause or waive required T1 proof.

**The three existing bootstrap bodies stay red on both inputs.** V2 candidate fails seed bootstrap with `release_deadline`/`release_drain_pending` at `latency_groups-p1` and `debug_sessions-p1` (`candidate-v2-adams-gamla.log:19,83,148`), with typed HTTP `BOOTSTRAP_NOT_READY` rather than an import/signature error. Control also fails the three existing bodies with drain pending and unavailable current-control/release facts (`source-revert-v2-adams-gamla.log:19,83,148`). Different partition/typed branches across attempts are recorded, not collapsed into an exact causal equivalence claim. No test budget was increased or assertion reclassified as green. These are actual current release-system reds.

**The corrected direct fixture witness is non-vacuous and green on both inputs.** Actual measured build state/token validation, canonical owner acceptance, explicit null/undefined/invalid refusal, inherited absence, and both absent/own-present mutation-across-await identity/value checks all pass in 23 assertions (`candidate-v2-adams-gamla.log:243-268`, corresponding control `:243-268`). The direct case takes 42.943 ms candidate / 41.064 ms control. It proves the helper composes the current owner and preserves choices; it does not substitute for registered bootstrap release, later T1 work, physical crash safety, or full promotion certification.

The 12 current positive files remain preservation controls, including real native fresh promotion and current release/progress behavior. They are not expected source-revert behavioral falsifiers of an unreachable island. The missing-helper dependency red is structural proof and must remain labeled structural; file deletion/import repair alone does not establish semantic closure.

## Raw evidence bound in this review

Paths below are relative to `test-output/c2-orphan-removal-20261013/` unless stated otherwise. I read completed status codes, actual input HEAD/cohorts, and raw logs, not summary counts alone.

| Artifact | SHA256 |
| --- | --- |
| `source-revert-v2-tv-dator.log` | `9f685c7580e26df03d52f247114fe48cb5d7799ff7e5f367eb5291a79b1d20dc` |
| `source-revert-v2-adam-laptop.log` | `656011ddf8f1bb4b94be2f3e8fbb30e9ad4a9d208590a8d2ff26869dc02ad482` |
| `source-revert-v2-lenovo-laptop.log` | `b7779673985019a474ae2e0ae24734c645deb6b437f36acc915896fa7793ee83` |
| `source-revert-v2-adams-gamla.log` | `4812aac0ad4c5c61d761621cfa3aa9ed45ba16f307718628abe2a6e6a7d884e2` |
| `candidate-v2-adams-gamla.log` | `130ce6b6e650b0aecada8791555ad14775f8675d892125523fb65e18c767bad8` |
| `candidate-v2-adams-gamla/input.json` | `577d20f97e487c87b191ba84f5e94b850a5397635f3d0a379dcaca8cb42d09f4` |
| `candidate-v2-adams-gamla/status.json` | `281b82d76fa7cc35324407d54dea7bbd874cf77d32e9ac0d33c1da781558e66c` |
| `source-revert-v2-adams-gamla/input.json` | `3c27782ef51e8dbd5afab8912bedbfecec21d11d6fab645944fd25086dd22e4a` |
| `source-revert-v2-adams-gamla/status.json` | `a930b3ddd5cfbfbc3bfc9ffdd89aa14c78b93b1cb1737021336fcc1299b141be` |

## Disposition

No new C2 source or fixture defect is established by this bounded audit. Historical attribution is acceptable with the labels and limits above. Retain source/fixture content approvals for non-main WIP preservation; retain actual bootstrap/release reds, the unengaged T1 requirement, inherited static/corpus gates, and open FreshMG/physical certification obligations. This report grants no whole-Quest acceptance or landing permission. Release continuation review remains separately queued until its immutable source/test freeze; its future implementation cannot retroactively make these inputs green.
