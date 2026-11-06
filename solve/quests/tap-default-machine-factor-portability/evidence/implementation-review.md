# TAP implicit-default portability: implementation approval

Reviewer: `subagent:/root/independent_review`, 2026-11-06.
Base: `ab55403b6c315ba60b771eb11794bf7171df96a3` in the isolated
`lagrange-tap-default-portability-20261106` worktree.

**Approve the exact five-path implementation for a normal WIP checkpoint
and frozen verification.** No material blocker was found. This is not Quest
closure, admission of the original R17 red run, E8/E9 approval or broader
runner/corpus acceptance.

`implementation-content.json` SHA-256
`d42cbce02e4eff9ef185e7ae393b7f5c4d8a47b41f666ee1d98d78dbd8a20c7b` matches
all five current files. All changed JavaScript paths are included. No tracked
code was edited or lab job submitted by this reviewer. I inspected the source,
test and existing caller interaction and ran the bounded child replay below.

## Source and contract

Only two implementation owners change. The existing timeout parser now
returns `hasDeclaration`, retaining presence independently from the largest
positive value. Presence is recorded before resolving a recognized timeout;
computed or unresolved declarations still produce the existing errors. A
parse failure still refuses rather than becoming an implicit default.

The runner's private resolver consumes this field. Only absent declarations
take the existing 30,000 ms reference amount through
`scaleByMachineFactor(..., resolveTestMachineFactor(childEnv))`. The result
then enters the existing floor selection. A resolved declaration at or below
30 seconds, including zero and resolvable negative values, retains its former
root behavior. Already resolved positive declarations are not scaled twice.

Explicit TAP_TIMEOUT still bypasses resolution with its original precedence.
Lane-floor selection and the unresolved-declaration error path are unchanged.
The separate default process-kill limit is still 600,000 ms; its configurable
hard-kill path is unchanged. No fixture, protocol, stability, iteration or
oracle bound is changed. There is one declaration parser and one factor owner.

The renamed private resolver has no external caller. Repository search finds
the parser's other direct consumer only in its tests; its changed result
shape is reconciled there. The change does not create a compatibility alias
for the prior resolver name.

## Proof discrimination

The new fixed fixture imports actual TAP and checks both the exported
TAP_TIMEOUT string and `t.options.timeout`. Its eight cases execute through
both synchronous and asynchronous runner entrypoints: absent, reference,
slow, invalid and below-one factors; explicit override; a higher floor; and
a floor below the scaled implicit default.

The existing declaration fixture now observes the actual TAP root too. Its
controls cover small/equal/above-default declarations, zero and a resolvable
binary-negative declaration, floors, explicit override, and the existing
machine-scaled declaration exactly once. Unary-negative syntax remains
unsupported and refuses; correcting the test expectation did not relax the
parser. The original failed test log remains retained. Existing parser
refusals, retry accounting and hard process-timeout tests are included in
the focused run.

The retained predecessor effective-budget red at
`predecessor-effective-budget-red.log` hashes to
`c8a8deb4b534e0fdd8ddb49c4915db06588bb5d280422377380b98aace18ffab`.
It shows the actual old TAP root at 30,000 ms rather than 69,000 ms for the
declared factor-2.3 control, as well as the absent exported timeout. This is
a measurement of the root, not merely a configuration-field expectation.

I independently invoked `runTestFileSync` and `runTestFiles` from the actual
runner with the final fixed fixture, child factor 2.3, no explicit timeout
or floor, and expected budget 69 seconds. Both child processes passed both
assertions. Output is retained in `independent-child-replay.json`, SHA-256
`ea3bad973af62365aaa26a699ebd86a9d5d2192cde19cebfdece1e3f7787115f`.
This brief replay does not claim a 69-second elapsed-time execution or the
native-group schedule; it verifies actual root construction in both launch
paths.

## Verified current checks

| Evidence | Result | SHA-256 |
| --- | --- | --- |
| `corrected-runner-callers-final.log` | 3/3 files, 96 reported assertions, exit 0 | `3bf7e15f3035ea18f8278478e5abcccb7be3399010b2d4b1e0bbc16e0ae08f2a` |
| `static.log` | All 33 static audits pass | `b40c612d74b2a52be81b48a24579d0f3c47c31685ed3ac0a19a26ad8aaa851b8` |

No ratchet baseline increases or tightening hints occur in this static
result. `git diff --check` is clean. The five implementation hashes still
match after these checks. Quest and generated metadata changes outside this
manifest require normal committed-applicability reconciliation.

## Remaining ceiling

The original R17 ab554 39/40 result remains red and preserved. The separate
same-host single-file predecessor/candidate passes retain their lower-load
diagnostic scope. Repeating the original 40-file schedule on the new frozen
commit is a new candidate evaluation, with the original failure disclosed;
it is not a retroactive first-pass result. No automatic retry is authorized
by this review.

Committed applicability, the exact-candidate native-group caller proof and
the runner's broader required source-range/full-corpus proof remain due.
The four other readiness failures, runtime-definition repair and unchanged
formation acceptance are separate. No receipt is admitted by this WIP
implementation approval.
