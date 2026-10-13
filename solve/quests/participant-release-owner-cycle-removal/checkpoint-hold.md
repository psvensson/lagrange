# Mechanical release owner consolidation checkpoint — HOLD

Base: `77e091f64fb711fbc5ca40a7915ae85f01a5cf4e`.
Immutable measured input: `b1d7116c11102725ce34f4d18021f924851b9efe`, tree
`96dd319f69fda9f7c62d42c30a315ecd73c3ba0f`.

The change consolidates current facts observation with the existing lexical
pause/resume admission owner, moves the sole pure drain predicate to the existing
release contract, deletes the redundant facts module and rewires direct imports.
Moved function bodies, the admission block and the guarded OPEN mutation are
unchanged. No second state owner, unchecked setter, compatibility export,
application wait, timeout or recovery policy was introduced.

The exact 11-path content has independent approval in
`evidence/frozen-v1/implementation-review-v1.md`, SHA-256
`f32b20f994984989109e5754d49731585200fbe6ea683c40a18af0c6067dc4c8`.
Root measured existing protocol/recovery tests on locked `lenovo-laptop` and
admission/build tests on locked `tv-dator`: four files, 32 assertions, all passed
on attempt one with zero runner retries. Exact inputs, raw output, result records,
fleet identity and checksums are retained in `evidence/lab-v1/lab-result-v1.json`,
SHA-256 `b8c8791c074a6aa8eacf184166711adea45d7c6ac2af1342f9a31e95c0de4a81`.
A behavioral red-on-source-revert is not claimed for this behavior-preserving move.

The actual graph now has zero dependency cycles. Syntax, ESLint, diff checks,
impact registry, shard classification and generated metadata checks pass. Static
acceptance remains RED: eight cyclomatic and one cognitive findings are unchanged
from the predecessor, and the changed source has 13 unchanged literal findings.
The ambient audit admits no eligible files in this scope; its zero is not broad
intrinsic hardening proof. No baseline or bound was raised.

This is a non-main preservation checkpoint, not Quest landing, startup recovery,
barrier implementation, full corpus, main merge or publication approval. The Quest
remains open. Integration with the separately reviewed connection-orphan deletion
and future applied-position barrier requires new exact-composition verification.
The original dirty checkout and other workers' changes are outside this checkpoint.

Independent lab custody review `evidence/lab-v1/evidence-review-v1.md` (SHA-256
`c2de9a457f917c71d57ffbc809688f71110f12cf7996453ba923f8244792ca46`)
approves the bounded four-file evidence. Retained raw output is classified-runner
stdout; child TAP is not archived separately. The first two receipts are true;
the static receipt remains false.
