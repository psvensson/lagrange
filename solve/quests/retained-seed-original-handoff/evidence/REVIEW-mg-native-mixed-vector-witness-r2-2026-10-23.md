# Independent native mixed-vector witness R2 delta review

Reviewer: `subagent:/root/retained_effects_tests`.
Verdict: **APPROVE the bounded test source after MV1's expected-input repair.**
Runtime and the moving production R4 implementation remain unproved by this
review. No source/test, metadata, lab, commit or publication was changed/run.

## Exact scope

The reviewed file is
`test/message-group/message-group-native-mixed-vector.test.js`, 151 lines,
SHA256 `cdac9bf0b0a0b00f68c2481f518d2bd0b4a245e31af2e5f873fc2f0c0554accb`.
The author preserved R1 at
`/tmp/mg-native-mixed-vector-r2-20261023/before.test.js`, SHA256
`38c50730400d3d427caa90ded1e9612c6da8a9d8cef7a7d40133ce54c4b83be4`.
I independently checked both identities, inspected the complete R2 file and
the exact six-added/two-removed-line delta. The prior review remains intact:
`REVIEW-mg-native-mixed-vector-witness-r1-2026-10-23.md`, SHA256
`c8105a1f65a18a03e582deb8b291ea8997700048418f1023aea8f8c801d6e9e3`.

This is root-authored test review, not self-approval of this reviewer's earlier
shared fixture or forwarding source. The independently approved complete-vector
R2 design remains the authority; the prior review's useful mechanism and scope
dispositions are retained.

## MV1 is resolved

Both RF1 variants capture `structuredClone(events)` before calling the public
`applyCDCBatch` path (`:121-125`). RF3 does the same before calling the actual
follower (`:135-139`). The clone is never passed to production. After the
operation, a complete `assert.deepEqual(events, expected)` protects the original
caller array and all nested content. Receipt/digest, retained member and cache
comparisons now use that independent expected value.

The finite R1 counterexample, mutating the ordinary config value in-place before
capture, now fails the full caller-vector comparison. Mutating and later restoring
the caller while committing the wrong content fails the independent retained/cache
comparison. Filtering, reordering or duplicating either member fails the actual
retained command's ordered content/length checks. The existing durable stamp
deep equality and ordinary supplied-stamp equality remain intact. These are
source-semantic discriminators, not mutation executions claimed as measurements.

The repair does not pre-normalize missing ordinary timestamps, supply a fabricated
native result, or substitute a native port for the actual public apply/forward
path. RF3 still observes a real follower, captures the whole terminal request N,
compares it with the actual native command, validates the terminal N-bound answer,
and requires a distinct final raw-I digest. The three original cases and bounded
carrier schedule remain unchanged.

## Proof limits retained

The nine-category R1 review has only the expected-input oracle changed; no new
timer, retry, sweep, admission, topology, transport or concurrency mechanism is
introduced. The author reports syntax/normal ESLint passing. No test or mutation
was executed in this independent review. The actual runtime must still show that
formation, public apply, native append/commit/application, forwarding, response
translation and cleanup complete under this schedule.

Input durable identity remains explicitly synthetic. Approval is for a recipient
native correspondence witness, not released SQL admission, actual source CDC debt,
source ACK, all-member application, loss/restart recovery, full W7, classification
authority, protected activation or merge readiness. Separate component negatives
still own contradictory canonical outcomes and coverage reuse. A source/protocol
change outside the agreed design invalidates this bounded API review.
