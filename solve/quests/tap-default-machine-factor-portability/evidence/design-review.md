# R17 frozen run: inherited TAP root timeout

Reviewer: `subagent:/root/independent_review`, 2026-11-06. Read-only source,
runner-policy and retained-result inspection; no lab run or code edit.

**The exact `ab55403b6c315ba60b771eb11794bf7171df96a3` frozen run remains red:**
39/40 files, 3,065 reported assertions, exit 1, attempt one without retry.
The immediate failing boundary is the inherited, unscaled TAP root timer.
This finding does not yet establish why the file took longer on this run or
attribute the slowdown to R17, its predecessor, the fixture or concurrent load.

## Observed failure

The placement record binds `ab55403b...`, Lenovo, ordinary lane jobs=4,
machine factor 2.3, empty timeout/retry override and admitted thermal state.
The failed ledger entry is `replace-real-group-completion.test.js`, attempt 1,
144 reported assertions, 32,610 ms process duration, `retriedOnce: false`.

Its retained TAP output shows 17 preceding subtests pass. Their reported
durations total 28,138.192 ms. In the final P1'(D2) subtest, assertions 1-11
pass, including the surviving-member election. TAP then reports
`expired: TAP`, with root time 30,082.157 ms and final-subtest time 1,912.873 ms.
The subtest did not consume its own 30-second interval.

The later `replace_target_dead_source_retained` log is the expected terminal
outcome for that test schedule, not evidence that its remaining assertions
ran. The post-loop persisted-step/error and committed-source-retention oracle
checks, including the terminal-write check, cannot be inferred from this
single log line. The timeout is a real failed proof attempt.

All new R17 files pass in this run. That preserves useful bounded evidence
and does not turn the 40-file result green or close the native completion
obligation. The four separately retained readiness failures remain open.

## Timeout ownership

`replace-real-group-completion.test.js` declares no `timeout`, `setTimeout`
or machine-scaled file budget. Its final D2 cell at lines 745-829 contains a
bounded 12-round owner re-entry schedule and semantic assertions, not a
30-second workload-specific acceptance requirement. `LONG_AFTER_MS` advances
the fixture's owner clock to test behavior beyond prior operation budgets;
it is not the wall-clock test deadline.

`src/test-helpers/tap.js` deliberately leaves TAP runtime behavior unchanged.
The installed `@tapjs/core/dist/esm/tap.js:81` constructs the TAP root from
`env.TAP_TIMEOUT || '30'`. The repository runner directly starts Node with
its configured loaders (`scripts/run-test-files.js:697` and `:729`), rather
than executing the TAP CLI. The CLI `.taprc` timeout therefore is not the
observed root's controlling source.

`scripts/run-test-files.js:329-352` lifts TAP_TIMEOUT for a resolved explicit
test declaration or supplied floor; it has no machine-scaled inherited
default. `largestDeclaredTimeoutSeconds` at lines 386-401 returns no lift
for this undeclared file. `scripts/test-machine-factor.js` owns scaling and
the declaration parser consumes it when a declaration asks for that
operation. Merely exporting factor 2.3 does not scale an absent declaration.

The classified runner supplies the 120-second floor only to bootstrap and
exclusive lanes (`scripts/run-classified-test-files.js:201-204, 494-499`).
This ordinary file receives neither that floor nor an explicit timeout.
The independent outer process-kill ceiling remains 600,000 ms and did not
expire here.

The completion test, shared tap adapter, classified runner, file runner and
factor owner are each byte-identical between `61ce6e979...` and `ab55403b...`.
Thus the 30-second default and its lack of scaling predate R17. This is an
inherited execution-policy limit, not a newly declared D2 semantic bound.
It remains the effective bound for this attempt; inheritance is not a waiver.

## Paired diagnostics and possible correction

The declared unchanged same-host predecessor/candidate one-file diagnostics
are useful. Both retain the effective bound and can distinguish a persistent
standalone failure or gross source-dependent timing change. They have less
co-running work than the original four-worker 40-file run, so a standalone
pass does not reproduce or explain that run's load. Preserve exact factors,
commands, source identities, durations and the original red.

The existing runbook (solver-runbook.md:307-317) permits one disclosed
standalone retry, capped at five failed files. If a candidate diagnostic is
used to dispose the gate failure under that policy, it must be recorded as
the single attempt-two retry; a pass is reported as passed-on-retry, not as
first-attempt success. A continuing failure remains red. Calling a run a
diagnostic does not justify unlimited acceptance retries.

If the evidence supports repairing default-budget portability, the smallest
owner-consistent change belongs in `scripts/run-test-files.js`'s inherited
default branch. Use the existing `scaleByMachineFactor` with the existing
30,000 ms reference amount and `resolveTestMachineFactor` over the actual
child environment. At factor 1 the effective reference bound is unchanged;
at factor 2.3 the corresponding root allowance is 69 seconds. This expresses
the existing work budget in the existing machine model rather than inventing
a larger reference workload.

Preserve explicit TAP_TIMEOUT precedence, declaration resolution and refusal
of unresolved declarations, lane-floor behavior, the separate 600-second
process ceiling and every fixture/protocol clock, iteration count, oracle and
stability condition. Do not scale an already resolved declaration again.
Do not insert a local environment mutation or an unrelated subtest timeout
solely to manipulate the root timer.

Such a runner change is a separate execution-policy correction with its own
review and proof: actual child-environment controls should cover reference,
slow and invalid factors; explicit override; lane floor; declared scaled
timeout exactly once; and unchanged hard process timeout/refusal behavior.
Its broader execution-owner change cone remains owed. This report approves
neither an unimplemented timeout change nor a larger proof schedule.

## Evidence identities

| Retained artifact | SHA-256 |
| --- | --- |
| `r17-frozen-run.log` | `0d1f34cd434dc73b2417c7bb3f74336ecfbb5dbf2128d4d3fd7544617e7499d8` |
| `r17-frozen/environment.json` | `9e2666b2ed6578f958e433b7f09099589b4fbf4eb004f210505cb15ed46ed65c` |
| `r17-frozen/completion.json` | `7c4735f2ca36cf77fd3eaadbe40495f911bad752a369670185864e885f8e1365` |
| `r17-frozen/test-results-lenovo-laptop.ndjson` | `896a95f71fa4f8fb39ffbe91637606f0269d0f62d70c86ce5be6d51881b78f72` |

These are the artifacts present at inspection, not a claim that a later full
collection manifest has already been verified. Exact R17 implementation and
commit applicability approval remains valid at its WIP ceiling; frozen
all-green proof, Quest receipt admission, broader source-range proof, E8/E9
and publication remain unapproved.
