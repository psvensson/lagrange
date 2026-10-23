# Independent review of the S2 missing-return diagnostic

Reviewer: `subagent:/root/retained_effects_review`.
Date: 2026-10-23.

Verdict: **APPROVE this exact test-only delta for non-main preservation and
baseline measurement, conditional on the root's normal metadata generation,
frozen composed manifest and explicit lab commission.** No material blocking
finding. This is source review of a diagnostic; it neither changes the #1049
FAIL nor proves its dynamic cause or the intended S2 semantic red.

## Exact reviewed bytes

Base source: `86fd86137cdbd3944f6eddcd34d7df04ab9b81e8`.

| Artifact | SHA256 |
| --- | --- |
| Base `test/message-group/message-group-native-provisional-route.test.js` | `128995ce2c8002b1266ba4eaad14c6f66c1919f43db89c274eba9465887543ab` |
| Reviewed test candidate | `929c7514e785e8a25713d89a7c6e49bfabd6d8e7ccd0910f50a70700cab4d744` |
| `/tmp/mg-delivery-s2-passive-route-cut.patch` | `c793495f08d9260ef6d6a31cc256af652db692270584b0af9b99ec95f01a3cbd` |
| Previously approved RF3 R2 test now composed in this worktree | `7f4cf6984aadb9724b012bd1f32be53e3eda28d065a07a76a7cc5ff2f44cacb7` |

The actual S2 Git diff is byte-identical to the supplied patch. Removing only
the new `pendingRouteSnapshot` helper and the four-line conditional diagnostic
restores the complete base test byte-for-byte. There are no changed imports,
assertions, acceptance bodies, time budgets, native ticks, pump bounds,
transport faults, source rows, subscriptions or cleanup paths. The worktree's
`src/` diff against the executed base is empty. The RF3 test is exactly the
separately approved R2 candidate recorded in
`REVIEW-mg-delivery-rf3-election-fixture-2026-10-23.md`; that approval is reused,
not widened here.

## Boundary and fidelity review

The new helper at candidate lines 201-234 reads already owned plain data:
captured event records and kind counts; queued/held application/native counts;
the existing source-lane object's scalar fields, maps and scan; and topology's
existing timer/map counts and immediate-batch entries. It clones only the
plain scan and captured target data. It serializes pending row IDs and counts,
not timer handles, promises, callbacks or native runtime objects.

The helper calls no owner decision, readiness/selection predicate, routing
repair, native operation port, `laneOf`, `sourceView`, `targetView` or
diagnostics owner. The original lane's `lastDrive` and `lastFlush` are
already built as frozen data outcomes in
`partition-cdc-obligation-delivery.js:280-282,424-426`.
The immediate batch's targets, pending events, resolver list and timer slot are
existing state from
`cdc-group-propagation-delivery-methods.js:201-235`.
The snapshot does not increment delivered counts, clear any map or timer,
change source tenure, or reinterpret the pending data as authority.

At candidate lines 242-245 it runs only if the original candidate-return list
is empty. `f.report` synchronously uses the fixture's existing diagnostic
serializer. There is no new await or scheduling operation between the captured
failure condition and the unchanged assertion at line 246. The new snapshot
therefore exposes the missing boundary without giving the awaited handler
another native tick, timer advance or queue drain.

The existing registered-handler observer, `targetView` and reconciliation
observer still have the native status reads described in the previous lab
review. They remain part of the already executed witness schedule. This review
does not call them generally passive or approve additional status reads. The
new failure cut adds none.

The captured event census and current immediate queue distinguish a pending A
batch from real F1 send/ingress/return and F2 send/ingress/return. It also shows
whether the existing source drive was in flight or held. It cannot recover an
upstream exception that no existing recorder retained; absence of such a field
is still not evidence of no error. If the forthcoming cut exposes that further
gap, any additional recorder must preserve the real callback/readiness
delegation and exact thrown object and receive a separate bounded review.

## Category-complete delta disposition

| Category | Exact disposition |
| --- | --- |
| Admission/gating | Unchanged. The only new condition selects diagnostic emission after the original missing-return condition; it grants no readiness, opening, write or delivery authority. |
| Recovery/replay | Unchanged. Snapshot reads the existing lane directly; it cannot invoke its reset path or restore/replay an obligation. |
| Owner interaction | The owner results and original acceptance predicates remain unchanged. Source/topology state is labeled diagnostic and never consumed to decide success. |
| Harness fidelity | The original failure and all later assertions remain exact. The diagnostic makes the unengaged #1049 boundary inspectable without making it pass. Actual runtime remains unexecuted for these new bytes. |
| Transport/delivery | No send, handler, envelope, hold/release or acknowledgment change. Existing traffic and recorded returns are only counted/copied. |
| Concurrency/time | Synchronous failure-only snapshot; no new await, deadline, retry, turn, timer or native call. Original deliberate status-read schedule is preserved. |
| Formation circularity | No routing or local-hydration decision changes. Native setup, B release, follower-to-native route and source-ACK requirements remain the same unweakened witness. |
| Retry/redrive | No callback or timer is started, rearmed, cancelled or drained. Timer presence and map sizes are observations only. |
| Ownership/lifetime/sweep | No new persistent state or background task. Snapshot lifetime is the one existing diagnostic emission, and original fixture cleanup remains exact. |

## Static evidence and proof limits

Independently ran `node --check`, targeted ESLint with complexity threshold 12,
and `git diff --check`; all passed. No runtime test was run. The new test
imports nothing, so it introduces no new export-resolution seam. Both candidate
hashes and the actual patch were independently checked after inspection.

Normal generated inventories/metadata and the composed manifest are still the
root's next gate. This review does not approve those unprovided bytes. The
forthcoming explicit baseline must preserve and name the exact source; a
terminal COMPLETE record alone will not count as PASS.

#1049's native setup evidence remains valid only for its exact executed source.
Its missing-F2-return failure remains unclassified dynamically. No S2 semantic
red, F3 release, broad W7 progress, startup/custody/activation, durable transfer,
two-start acceptance, Quest closure, publication or merge approval is granted.

The reviewer wrote only this new evidence file. No production/test edits,
metadata changes, source execution, lab submission, commit or push were made.
