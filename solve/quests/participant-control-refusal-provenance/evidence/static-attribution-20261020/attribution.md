# Independent static attribution — 2026-10-20

Reviewer: `subagent:/root/physical_custody_review`.
Predecessor: `be93c7e5d9a76a39e76a530c93715521b2281356`.
Candidate: `32dfdc388cf80c695b70207e1b659bce8d5d6ad5`.

The remaining static result is **red**. The original candidate documentation
result included six introduced findings, so describing that entire result as
inherited would be incorrect. Those six are now corrected; the remaining
documentation findings match the predecessor exactly.

| Audit | Predecessor | Candidate 32df | Independent attribution |
| --- | --- | --- | --- |
| Complexity | 1811 findings; baseline 1755; fail | 1804; same baseline; fail | Complete structured multiset comparison: seven removed, zero added. Every remaining finding matches exactly, including file, line, column and message. |
| Cognitive complexity | 153; baseline 152; fail | 152; same baseline; pass | Complete structured comparison: one removed, zero added. |
| Operation progress authority | One finding; fail | Same finding; fail | Same test file and retired source-vocabulary finding in both logs. |
| Retired-namespace audit | Three findings; fail | Same three findings; fail | Same historical evidence file and three line locations in both logs. |
| Literal guidelines | 321 new findings, 1264 baseline matches; fail | Same counts; fail | Entire emitted summary/top-20 block is byte-identical. A complete per-finding literal report was not available; this does not prove all 321 individual findings are identical. |
| Documentation current state | 292; fail | 298; fail | Full logged finding lists: all original 292 retained, six added in the new snapshot/CDC review, zero old findings removed. After correction, one canonical validator run returns exactly the original 292-element multiset and zero findings in the corrected report. |

The seven removed complexity findings comprise two production functions in
`src/node/replica-handler-participant-cutover.js`, one test function in
`test/raft/raft-rs-backend/single-path-partition-cutover.test.js`, and four
functions in `test/test-helpers/participant-release-delivery-trace.js`.
The removed cognitive finding is `runCutoverAttempt` in the same production
owner. These are measured reductions, not baseline increases.

The candidate command ran 19 owed audits and skipped four by its declared
input-change selection; five owed audits failed. The predecessor ran all 23
and six failed. The four candidate skips are CLI documentation, documentation
audience, documentation ASCII and steering; the predecessor passed them.
Consequently, this is not a candidate claim of passing all 23 audits.

Git confirms exactly three changed `src/` paths: the new diagnostic-observation
owner, the participant-cutover owner, and its constants owner. Their current
bytes still match candidate 32df. The compared audit scripts and baseline paths
have no diff between predecessor and candidate. No finding was waived and no
historical record was edited in this attribution task.

The two canonical logs and both pairs of structured complexity reports are
identified by path and SHA-256 in `attribution.json`. The authorized corrected
documentation invocation is preserved in
`corrected-documentation-validator.json`, including the exact report and
validator hashes. The corrected report is a working-tree revision after 32df;
its result must not be retroactively attributed to 32df's original 298 findings.

This review performed read-only comparisons and one expressly authorized
canonical documentation validation. It did not edit repository source, reports,
baselines or allowances, or run native tests or the full static suite. Artifacts
were written only under the original B worktree's ignored `test-output/` directory.
Static attribution is not a Quest landing, whole-U1 acceptance or release gate.
