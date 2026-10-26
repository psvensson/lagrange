# Combined independent source applicability — metric provenance repair

Date: 2026-10-25. Reviewer: `subagent:/root/metric_review`.

**Verdict: APPROVE the combined metric source comprising exact `5485381b70d7c963f30e1468c5e8ca17d156f569` plus the exact two-file M2 correction below.** This is a bounded source/owner-interaction approval, not a declaration that the official suite, hooks, candidate composition or release gates have passed.

| Corrected path | Reviewed SHA-256 |
| --- | --- |
| `scripts/metric-report-inputs.js` | `ff23a957d07acb6d960fa866210c69b20f06c5b20ac81f5b58e50305eb817080` |
| `test/scripts/metric-cycle-resolution.test.js` | `a03a97773f407075aab534c899b3fc2e6299070cb930ab283ec965a4cde7042c` |

The full original source review is complete. `REVIEW-5485381-home-context.md` records inspection of all six production files, all five changed/new tests, installed analyzer source/hooks and direct report consumers. It found one demonstrated defect, M2: missing effective home-derived resolution context. It found no second concrete defect. That original rejection and its actual stale-zero/fresh-cycle discriminator remain preserved; this approval does not overwrite history.

**No M1 source-review work remains incomplete.** The earlier M1 rejection concerned `.cache` and imported dependencies outside the declared entry roots escaping the report digest. Exact 5485381 addresses those causes by observing actual analyzer content reads and resolution facts, binding the observation manifest to the payload and refusing the old schema. The source review also covered the actual single resolver, graph/edge/skip coverage, unsupported-route refusals, installed-source digest, cleanup/restoration and dedicated measurement-process custody. Its tests and historical author evidence were examined. The absence of an independent seven-file rerun is an execution-evidence limit, not an unreviewed M1 source question.

`APPROVE-M2-home-context-correction.md` independently approves the exact delta above. It records the effective `homedir()` input through the existing provenance owner, checks that the supported dedicated producer initializes the actual resolver under that same captured context, and establishes unchanged-content invalidation without a second resolver or fallback. An external real canonical producer/shared-reader experiment passed all twelve checks, including unchanged-context reuse, changed-context refusal, preserved report bytes/inode, a fresh actual cycle, reverse-context refusal and actual dependency-read engagement. The two correction source hashes remained unchanged throughout.

The composition of those reviews supplies complete independent source approval for the combined bounded repair. There is no further source-review stage required merely because the historical original report says REVISE. Any new changes to other production/test bytes, a different analyzer dependency/source identity, or a semantic merge resolution require ordinary applicability review at that changed boundary.

## What remains with the verification owner

- The official affected regression/conformance suite and normal hooks must produce or validly reuse evidence for the actual candidate under their existing provenance owners.
- The historical seven-file/186-assertion result remains author evidence; it is not an independent rerun by this reviewer.
- Integration metric values, full-corpus status and the existing cyclomatic baseline are unaffected claims; this source approval does not make their gates green.
- Exact normal-commit source binding and final candidate composition still have to be recorded. This approval can transfer to a normal commit whose relevant source bytes match the reviewed combination.

No native product/runtime acceptance was run for this tooling review. The authorized experiments were minimal deterministic static-analyzer fixtures. No implementation or test source was edited by the reviewer.
