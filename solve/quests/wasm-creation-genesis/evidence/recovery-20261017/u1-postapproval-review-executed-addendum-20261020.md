# U1 post-approval source review — executed controls and static addendum

Date 2026-10-20. This **appends** to
`u1-postapproval-ten-owner-source-reconciliation-20261020.md` and changes
none of that review's source or release ceilings. All lab results are
execution observations, not publisher or independent whole-U1 acceptance.

## R2-E duplicate-ID journal integrity, one-source-line family

- **Positive**: exact U1 candidate
  `ccdd6938c5e79ff95fbd71a2090ba4c800223266`; [lab #439](https://github.com/psvensson/lagrange-lab/issues/439)
  passed the fifteen-file selection including
  `test/service/service-consensus-creation-intent.test.js`.
- **Negative**: source-only commit
  [`4abea00ba498b0bef25d2441a88ac0c19b0c3eba`](https://github.com/psvensson/lagrange/commit/4abea00ba498b0bef25d2441a88ac0c19b0c3eba).
  Its parent is the exact positive `ccdd6938`. The diff changes only
  `src/service/service-lifecycle-manager.js`: it replaces global
  duplicate-content rejection with first-row-wins. No test files change.
- **Actual negative**: [lab #481](https://github.com/psvensson/lagrange-lab/issues/481),
  complete FAIL, 1 file, 40 runner-reported cases, 39 pass / 1 fail,
  exit 1 on `tv-dator`. [Evidence #493](https://github.com/psvensson/lagrange-lab/issues/493)
  contains the first decisive failure at test case 29:
  `recovery R2-E conflicting duplicate ID fails closed before resume`.
  The assertion reports `Missing expected rejection.` where the test
  required a typed `CORRUPT_STATE` rejection. Neighbor case 28,
  the unrelated malformed-row isolation positive, stays PASS.
- **Bounded verdict**: the current row-integrity test detects regression
  from global same-ID conflict rejection to first-contender selection.
  Neither this mutation nor the positive selection proves arbitrary data
  corruption or network consensus, and the mutant must **never** merge.

## Whole-source static diagnosis: do not miscredit

The separate read-only exact-source diagnostic at
[lab #477](https://github.com/psvensson/lagrange-lab/issues/477),
on probe commit `224e08cf99a38930bd606b9ebc78909a30766618`,
checked frozen generated-subject
`7e842a2c827d4287daf1c4e77ba5cfd264c99787` against base
`381750de29af647d446b19adedf1da53eb712093`.
It finished FAIL for **two distinct reasons**:

1. Existing whole-U1 fast-static identifies **three ESLint failures**
   in changed paths: `src/control-plane/replica-dispatch-service.js:63`
   (curly) and `test/node/runtime-service-bound-route.test.js:547,715`
   (indent). Thirteen other listed fast-static checks passed.
2. `--verify-import-graph` cannot read
   `test-output/analysis/global-owner-debt-import-graph.json`
   in the fresh isolated checkout. The producer's
   `verifyImportGraphReport` requires an existing output, while its
   refresh-only mode is `--refresh-import-graph-only`. This is a
   **diagnostic setup/prerequisite failure**, not evidence an actual
   current import graph mismatched the source.

The primary/resource/subsystem generated classification checks at that
same pinned subject all passed for 2,413 tests. Correction requires
source/test lint deltas and producer-authorized import-graph preparation,
followed by a completely new exact-subject measurement. Reclassifying the
diagnostic's FAIL as PASS or silently omitting the owner graph is forbidden.

**No decision here opens U2, activation, or main merge.** The frozen positive
candidate and all deliberately defective mutation branches remain separate.
