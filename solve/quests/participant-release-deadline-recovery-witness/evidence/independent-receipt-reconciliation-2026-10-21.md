# Independent five-predicate receipt reconciliation

Date: 2026-10-21. Verifier: `subagent:/root/control_source_review`.

Recommendation: the current derived receipt for `participant-release-deadline-recovery-witness` may record **all five required predicates true**, with receipt status `pass`, on the evidence below. This is a reconciliation of the existing bounded witness seal, not a change to its statement, constraints or probe. The reviewer has changed no receipt, log, source, test or commit and has executed no new tests. Root owns the derived update and canonical probe.

The historical `true,true,true,false,false` decisions were correct when the retry-suppression control and complete scoped review were outstanding. Preserve those decisions, the rejected preparation, the original inputs and prior reviews unchanged. This additive record explains why the remaining two predicates are now supported. A passing bounded receipt is not terminal landing or publication authority.

## Exact witness and source lineage

The witness-only Quest is sealed at `be93c7e5d9a76a39e76a530c93715521b2281356`. Its measured operation uses real PartitionService/native SQLite, registered release/recovery owners and controlled transport/notification/handler-clock seams; it does not certify fresh public startup.

The frozen executable witness is `test/partition/participant-release-deadline-recovery.test.js`, SHA256 `d2f5be01c26338c9715d4abcb75ed6bd1a9dee269eaad312528bdc255bfcaa7a`. Its shared fixture is `test/test-helpers/participant-release-protocol-fixture.js`, SHA256 `3f3b17a7d3fa637b09001fb179170bb1792efbec5acbb96cd009dcdd7117934c`. Both are byte-identical across the original positive, measured controls and current positive.

| Role | Exact commit | Bound observation |
| --- | --- | --- |
| Original native positive | `a72609dadfca7f8292c347d041175990b09e2c54` | Both cases pass on locked adam-laptop, retry0. |
| Earlier composed positive | `32dfdc388cf80c695b70207e1b659bce8d5d6ad5` | Same cases pass on adams-gamla; distinct composition evidence. |
| Deadline control, derived from a726 | `27d00cd4be71fe4445fc20a2049e933b3ae63b60` | Actual dependent PAUSE engages; changing client timeout exclusion `<= 0` to `< 0` delivers one unexpected ENABLE. First case fails at the named line178 assertion; receiver refusal is still enforced. |
| No-origin authorization control, derived from a726 | `187221614f26fd2bc2c16342d35a1ebf6cf09564` | Changing the absent-origin guard's `=== null` to `=== undefined` lets the new live-budget unprivileged release return CUT_OVER. First case fails at line186 instead of OPERATOR_REQUIRED. |
| Current composed positive | `393f411ca09449898465cc3cb7320c03fba2aba8` | Both cases pass on locked adam-laptop in the32-file/838-count no-retry measurement; existing protocol and recovery regressions also pass. |
| Final retry-suppression control, derived from393 | `e88d94ef5bbeaf5c20759fa66518cbd06b1df94c` | Sole deletion of the returned non-CUT_OVER recovery enqueue; first case passes, second fails only at the intended due-retry OPEN assertion after actual restart/control-return engagement. |

Current positive source tree: `ddf32b08e93c0b617f6ec24d0d70596e2888eec5`. The exact a726-to393 diff leaves the cutover owner and both witness files unchanged. In the release client it adds the separately reviewed completion helper/import/export; the existing request/pre-dispatch primitive exercised by the old deadline control is unchanged. This witness's operator/background paths do not invoke the fresh-create completion helper. Consequently the old controls remain evidence for the identical exercised primitive/authorization branches, alongside a new exact393 positive. They are not relabelled as controls executed on393.

The final retry control's sole runtime delta is independently verified against393: patch SHA256 `1468ae44d3487ee43c9e06a0a010a44ee4981f35f07ff37a7670122a645828d3`; old recovery-source SHA256 `9b1051f820e4a2ffbe55a123b8d01e28fe05a9ff9a85ed5eecacd4cf284e0937`; mutant SHA256 `959e710416b32ebaf738b6b1904b5cec3b40a696a8e25c666e270aa752a49fd8`. Diagnostic source remains excluded from production composition. The initial uncommitted retry mutation against a726 remains a blocked historical attempt, not a measured failure.

## Five existing predicates

| Existing receipt id | Current value supported | Evidence and precise extent |
| --- | --- | --- |
| `pre-enable-expiry-keeps-origins-and-admission-safe` | true | The positive first case observes genuine dependent PAUSE, advances only the injected handler clock to the unchanged3000ms deadline, excludes dependent ENABLE dispatch, retains the already committed control origin and keeps dependent admission CLOSED. Deadline control discriminates the client pre-dispatch exclusion. It does not prove that bypassing this check makes the receiver admit an expired ENABLE. |
| `absent-origin-refusal-and-authorized-progress` | true | A separate new unprivileged request has a live budget and is refused by actual no-origin authorization. A new actual operator-authorized request completes the existing protocol and normal write. The authorization control kills that refusal at the intended assertion after the same expiry setup. Expired request authority is never renewed. |
| `lost-enable-answer-restart-and-retained-recovery` | true | Positive second case loses an actual ENABLE answer after native origin commit, recreates the dependent from its retained store, positively drops actual consensus notifications, observes missing current-control refusal, recreates control through its native retained-store path, and proves the existing due retry opens the current replacement and permits a normal write while preserving origin. No direct dependent release/status actuation substitutes for the retry. |
| `semantic-negative-controls` | true | All three designed controls are now measured and independently classified after engagement. The final retry control reaches helper145/test265 only after lost response, retained restart, positive notification loss, missing-control refusal, real control restoration and cadence-minus1 closure. It fails the bounded semantic OPEN oracle, not a runner timeout/import/setup failure. The other native case passes. The unchanged positive completes assertions that the negative cannot reach. |
| `independent-scope-evidence-and-static-review` | true | All nine declared categories were independently reviewed for the frozen witness; exact positives and all three controls have independent result/source correspondence. The original Quest log records ESLint and strict cyclomatic/cognitive success for the new witness/fixture before frozen approval (entries4–5), and those bytes remain unchanged. The final recovery diagnostic passes normal checkpoint hooks after the separately scoped completion-owner repair. Current composition has reviewed fast-static, changed-owner static-quality and impact-contract evidence. No remaining scoped review or static defect has been identified for this witness unit. |

Row5 is deliberately scoped to this witness and its consumed interaction. The original strict test/fixture checks are preserved history on unchanged bytes; the later28-path static-quality check does not falsely claim to include these two already-existing files. Its role is current changed-owner correspondence. The full historical/global audit and broad changed-selection obligations remain separate; they are not silently converted to passes.

## Evidence locations and independent bindings

- Original positive and earlier composition: `../participant-control-refusal-provenance/evidence/` relative to the Quest directories, especially `provenance-recovery-green-*`, the composed32df packet and `independent-review-20261020.md`. The Quest's own append-only log records exact frozen witness approval and positive interpretation.
- Earlier controls: `negative-controls-20261020/`, including raw lossless log wrappers, ledgers, original input records and `preparation/checkpoints.json`. Those input records correctly retain their preparation-time `prepared-unmeasured` value; later result artifacts supply the actual measurement.
- Current positive: `../../seed-release-failure-custody/evidence/composed-393f411ca/`. Independent result-review SHA256 `ff5dce3d40932a6dc5de371a331ebf0813f1295c6b14fda9cd4e96dd18184d7c`; exact49 input bindings were verified against Git blobs.
- Final retry control: `retry-suppression-final-393f411ca/measurement-e88d94ef5/`. Packet manifest SHA256 `7b8f89f78f3906dfca3f41e72637460bf6a9214629500558a924a9389e738f0e`; independent result-review SHA256 `016ee67130191bc0bff621fa99a3d2894fe0a9f03a1c302842d33bbb4d4d0d07`.
- Current integration/static review: `../../participant-release-completion-owner/evidence/independent-root-composition-review.md`, SHA256 `95992fbe11cd0c75b0900a0e2e6abbd1e3a84447dbb12e43783b096b4c42ed98`, and its `root-composition-gates/` packet: fast-static against original cleanup base847 passes,28 changed JS paths return no static-quality problems, impact-contract audit passes68 contracts/40 pairs.

The positive and final retry negative share adam-laptop and retry0. Their automatic runner factors1.9 and2 reflect existing policy; they do not establish timing equivalence. The broad changed-selection run separately also passes this witness on Lenovo, but the positive/negative semantic comparison is not inferred by matching different-host timings.

## Boundaries that remain red or open

This reconciles a **witness-only** unit. Production changes needed to remove the retry-preparation blocker belong to their separate reviewed units; no source repair is retroactively assigned to this seal. Controlled local native persistence, one-member cohorts, in-process transport and empty-cache fixture boundaries remain explicit. No claim follows for full original/public seed startup, fresh-storage producer authorization, all notification loss, remote routing, arbitrary backpressure, cross-host quorum, physical loss or complete U1/TX1/FreshMG/cutover.

The canonical changed-selection packet at393 is RED:1159 pass,99 reported red,3 unreported. A separate same393 Lenovo companion measures those three red. Across two attempts this provides1159 pass/102 red observations, not a successful single full selection or whole corpus. Failures remain obligations pending causal classification and any required owner repair. This bounded receipt must not be kept false merely to encode that different gate, nor used to erase it.

Solver terminal landing, applicable complete change-proof/corpus gates, canonical publication, exact-main certification and release remain unsatisfied or separately owned. No terminal entry, seal rewrite, acceptance waiver or publication approval is recommended here. The root reports that a later evidence checkpoint encountered the standard greater-than1MB raw-log guard and is preserving exact raw bytes through canonical upload with additive mapping. That is evidence custody work, not a new runtime measurement, altered manifest, source relaxation or gate pass; upload correspondence must be verified when its mapping exists.
