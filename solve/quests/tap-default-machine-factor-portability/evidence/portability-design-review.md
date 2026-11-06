# TAP implicit-default portability: bounded design approval

Reviewer: `subagent:/root/independent_review`, 2026-11-06.
Isolated worktree: `lagrange-tap-default-portability-20261106`.
Source base: `ab55403b6c315ba60b771eb11794bf7171df96a3`.

**Approve the bounded design for implementation through the existing runner
and timeout-declaration owners.** This is not source approval, a test result,
Quest closure or acceptance of the original red run. No implementation was
edited or executed by this reviewer.

The sealed Quest definition hashes to
`a189d320813abcd7875e367ac4185dec24edb5c326d661890648a2eb3302b42d`.
Its copied prior disposition hashes to
`d045bd49d7c0afc388d12e02bb166f5d69ee3dacb7392fb74606002928b89567`.
The receipt remains fail with all four obligations false, SHA-256
`ff37f89c9f91877794ef579e96787cf7928ca42e485b16a2053ea2e6fa325de5`.
At inspection the isolated tree had no source edits and only the new Quest
was untracked.

## Approved owner interaction

Only the implicit TAP root default is made portable. In the absence of an
explicit TAP_TIMEOUT and a declared timeout, use the existing 30,000 ms
reference amount with `scaleByMachineFactor` and
`resolveTestMachineFactor` over the actual child environment. Feed that
resolved default into the existing lane-floor selection. Factor 1 retains
30 seconds; factor 2.3 yields 69 seconds.

Explicit TAP_TIMEOUT keeps its current precedence. Resolved declarations
retain their existing values and are never scaled twice. Lane floors,
unresolved-declaration refusal, child semantic budgets, protocol clocks,
stability intervals, iteration counts, assertions and the independent
600,000 ms process ceiling remain unchanged. There is no test-local
environment mutation, artificial unrelated-subtest timeout, parallel parser
or additional machine-factor owner.

One implementation distinction is essential: the current
`largestDeclaredTimeoutSeconds` returns null for BOTH no declaration and a
resolved declaration at or below 30 seconds. Null alone therefore cannot
select this new fallback. Preserve declaration presence through the existing
parser/runner interaction and preserve the old behavior of small/equal
declarations. The existing extractor also returns a largest value of zero
for no positive declaration, including recognized zero/negative values.
Do not silently turn those into newly scaled undeclared files. Carrying
presence from the same parser is a bounded way to keep the stated contract;
do not add a second scan or regex-based interpretation.

## Required discriminating checks

Use real child processes through both existing sync and async launch paths.
Observe the effective child root timeout without sleeping for its full
duration. The old runner must fail the slow-machine implicit-default control.
Cover absent/1/2.3/invalid factors; explicit timeout; lane floor; declarations
below/equal/above 30 seconds; recognized zero/non-positive declarations;
and a machine-scaled declaration applied exactly once. Preserve and run the
existing unresolved-expression/refusal and hard process-timeout controls.
This verifies the actual execution boundary rather than only a helper's
arithmetic.

The frozen 40-file schedule must then be repeated on the new committed
candidate with its source, environment and complete result retained. It is
a second schedule attempt on changed runner source, not a successful first
attempt or an unchanged-candidate retry. No further automatic retry is
inferred. The runner's broader required proof cone remains due, as the Quest
already states.

## Paired diagnostic applicability

I inspected both retained single-file diagnostic runs on Lenovo. The
predecessor `61ce6e979...` passes 147 reported assertions in 21,192 ms; candidate
`ab55403b...` passes 147 in 21,356 ms. Both bind factor 2.3, no timeout/retry
override, exit 0 and a local run ledger with attempt 1/retriedOnce false.

Their run-log hashes are respectively
`489303dc1be9d79b050e9adf9c0f9aba0a5cf226463e97b8a45919404367b91e` and
`6ba02389cbb52b586996dbeac55ffca3f234d7dfce3919e82ceded11c6f12209`.
These are separate, lower-concurrent-load diagnostic invocations; the
candidate remains related to its earlier 39/40 attempt and is not a clean
first-attempt acceptance claim. The close standalone durations do not prove
the cause of the original load-sensitive slowdown or an R17 performance cure.

The original `ab55403b...` 39/40 red, preceding WIP implementation approvals,
four other readiness failures, full-cone proof, E8/E9 and publication retain
their existing dispositions. The independent runtime-definition source
interaction in the composed worktree is outside this design approval.
