---
audience: development
documentClass: evidence
---

# Recovery witness negative controls

Date: 2026-10-20. Positive source candidate:
`a72609dadfca7f8292c347d041175990b09e2c54`.
Frozen witness SHA-256:
`d2f5be01c26338c9715d4abcb75ed6bd1a9dee269eaad312528bdc255bfcaa7a`.
Frozen fixture SHA-256:
`3f3b17a7d3fa637b09001fb179170bb1792efbec5acbb96cd009dcdd7117934c`.

The positive's two cases passed on locked adam-laptop. The composed candidate
`32dfdc388cf80c695b70207e1b659bce8d5d6ad5` also passed them on adams-gamla.
The two measured mutants use the same test/fixture bytes, the original
adam-laptop host and retries disabled. Neither mutant is merged into the
positive branch or authorized for production.

| Control | Exact commit | Engaged semantic result |
| --- | --- | --- |
| Deadline boundary | `27d00cd4be71fe4445fc20a2049e933b3ae63b60` | First case fails at line 178: one dependent ENABLE was delivered instead of zero. PAUSE, deadline and receiver refusal checks preceding it passed. The control origin was captured during PAUSE; the positive independently checks that it is non-null and unchanged. This proves client pre-dispatch exclusion, not an unsafe receiver admission. |
| No-origin authority | `187221614f26fd2bc2c16342d35a1ebf6cf09564` | First case fails at line 186: a new live-budget unprivileged continuation returns `cut_over` instead of `release_operator_required`. It reaches the authorization assertion after the expired-request setup. |
| Retry suppression | No commit; prepared against `a72609` | **BLOCKED, unexecuted.** Removing the post-refusal enqueue exposes an existing fresh-create retry loop to the normal staged decision-boundary guard. |

Each measured mutant leaves the separate lost-answer/restart case passing.
The input records preserve their original `prepared-unmeasured` state; the
separate raw logs, result codes and ledgers record the later measurements.
No historical input record was rewritten.

The [preparation manifest](preparation/checkpoints.json) binds the exact
patches, source hashes and normal-hook results. The
[retry blocker](retry/normal-commit-blocker.json) and
[lossless failed hook output](retry/normal-commit.log.json) preserve the rejected attempt.
Independent review confirmed that the flagged loop also exists in unchanged
positive source, with only the line number shifted by the mutation.

There is no applicable annotation exception. Renaming retry identifiers,
hiding the loop, changing an allowance/baseline, bypassing hooks or patching
after the check would evade the guard. Repair of its classification or the
fresh-create retry interaction requires separately bounded owner work.

The positive recovery observation stands, but no executed suppression
control demonstrates that this scheduled retry is necessary. Consequently
`semantic-negative-controls` stays false and the Quest stays open. A failed
preparation is neither a native failure nor safety evidence.
