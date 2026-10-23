# Independent canonical selected-output custody wrapper review

Reviewer: `subagent:/root/retained_effects_tests`.
Verdict: **APPROVE R2 for the declared fresh job and normal worker completion.**
R1's final-TAP-only mechanism is recorded below; R2 resolves its bounded-memory
and complete-attempt/channel retention limitations. This approves job-local
measurement code, not a test result, runner/controller change or lab submission.

## Exact reviewed material and authority

| Material | SHA256 |
| --- | --- |
| `/tmp/retained-effects-canonical-tests-with-tap.py` (R1, 63 lines) | `e8b2d752c25e34104e231f1b712a5264553b960a5177ee49ca3d13f19a6421f2` |
| `/tmp/retained-effects-canonical-tests-with-tap-r2.py` (R2, 97 lines) | `ae248b12797118ec5bbfdb671262337cec22f6599cb92208c93208911f1c1aa1` |

Both complete files and hashes were independently inspected. The actual command
owner remains `package.json:54` -> `scripts/run-classified-test-files.js` ->
`scripts/run-test-files.js`. The latter opens selected stdout/stderr artifacts
with `w` at `.tap/test-results/<selected-file>.tap` and `.tap.stderr`
(`:288-300`), preserves first-attempt names before an enabled retry (`:820-827`),
and owns the existing retry policy (`:898-935`). No local runtime, runner command,
mutation or lab job was executed for this review. The author's AST-only check
does not establish runtime retention or transport completeness.

The commissioning owner states that the intended job uses a fresh source workdir
and explicitly sets `LAGRANGE_RETRY_FAILED_ONCE=0`. No job was submitted at review
time. These are declared commissioning prerequisites, not observed lab facts.
The eventual packet/source/script identities and actual environment still need
to be preserved with that job.

## R1's exact useful behavior and limits

R1 invokes the unchanged canonical command once with an argv array and inherited
stdio/environment (`:47`). After it returns, R1 reads every selected final TAP,
emits raw/gzip hashes and indexed base64 chunks, and records the original exit.
For ordinary subprocess completion, any nonzero canonical exit remains nonzero;
canonical success plus missing TAP returns 1 (`:48-59`). No assertion, execution
policy, child timeout or installed retention owner is changed.

It reads complete raw, compressed, encoded and chunk-list representations into
memory (`:28-32`). That is a known project failure class, not a hypothetical
new product requirement: the real runner documents a 608,651,868-byte artifact
and deliberately streams its parser (`run-test-files.js:57-70`). R1 also retains
only final TAP, not stderr or an optional preserved first attempt. The latter
does not hide a retry in the explicitly retry-disabled fresh job, but R1 is not
an all-attempt/channel collector and never recorded the actual retry environment.
Use the reviewed R2 rather than expand R1's evidence claim.

## R2 source-bound assessment

R2 validates selected relative `test/` paths and their resolved output ancestry
before starting the command (`:24-36,73`). It executes exactly the same canonical
argv once (`:75-77`), inherits its standard streams and environment, and records
the actual retry environment value. It neither enables retry nor bypasses the
classified runner's placement/resource/timeout/keep-going policy. A single
wrapper invocation is distinct from whatever policy the canonical runner owns;
the intended explicit retry value 0 prevents that policy from adding an attempt.

The collector uses 64 KiB reads into a temporary gzip file, hashing every raw byte
as read, then hashes the completed gzip in another bounded pass (`:39-58`). It
emits at most 4500 gzip bytes per base64 part (`:59-63`). 4500 is divisible by
three, so all nonfinal parts have no base64 padding; the indexed parts can be
reassembled and checked against gzip length/hash, decompressed, and checked
against raw length/hash. Empty stderr is also a real, hashable gzip artifact.
The temporary file's context closes on success or an exception. RAM use no
longer scales with a complete child output; temporary disk and worker stdout
still necessarily scale with the evidence being retained.

For each selected file, final stdout and stderr are required. The runner's exact
optional `.attempt-1.tap` and `.attempt-1.tap.stderr` names are also inspected;
absence is emitted explicitly (`:30-36,80-86`). No extra execution is used to
obtain any artifact. Collection exceptions are recorded per artifact and do not
stop attempts to retain the remaining selected outputs. The final custody record
lists the canonical exit, selected files, successfully emitted identities and
failures (`:87-90`). Canonical success plus any collection failure returns 1;
a positive canonical nonzero is returned unchanged (`:91-93`). A subprocess
signal is reported as the original negative `canonical_exit` and translated to
the conventional shell status 128+signal, just as in R1.

This preserves the original test verdict while separately making incomplete
artifact custody visible. If the canonical command failed before a selected
file started, required artifact failure is accurate; it does not manufacture
the missing test's TAP. Under the fresh-workdir prerequisite there is no prior
artifact to mistake for the current run. A reused workdir is outside approval
without an additional run-identity check or fresh-output custody proof.

## Boundaries and required observation

This wrapper can recover full selected child files that the canonical console
excerpt intentionally elides, provided collection completes before installed
worker teardown. It does not recover #1092's already-deleted files, modify the
installed runner/controller, or authorize a rerun solely for logs. The known
72,546-byte console elision remains unobserved historical content.

Healthy, complete worker stdout remains the outer evidence channel. A killed
worker, closed stdout, exhausted temporary disk, or interrupted collector cannot
be turned into complete custody by this script; missing final custody/parts or
hash mismatch must not be called a retained result. The wrapper does not promise
to preserve a numeric exit after its own process is killed or stdout itself
fails. It adds post-test collection time, so the commissioning owner's existing
outer job deadline must allow that collection rather than treating canonical
test completion as artifact completion.

The finite next observation is one canonical job with exact wrapper bytes,
fresh workdir and recorded retry environment. After normal completion, verify
the final custody record, all required identities/part counts and both hashes,
then interpret the unchanged canonical exit and TAP. No runtime success,
semantic assertion count, fault-injection result or production acceptance is
claimed by this source review.
