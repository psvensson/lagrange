# Controls V6a candidate-V4 systemic triage

Read-only triage only. No source, test, fixture, Quest, metadata or Git bytes
were changed and no command reran behavior. Candidate snapshot HEAD is
`6a4fef46db8cb63cc78541fd432a8855c27c4f4e`; A and R match frozen V6a hashes
`004fb47f...` and `5fcc36bc...`.

Raw inputs:

- PA/P log `c88c66ed0ecd56d7e66e972d4f7e8627a05254cfa297aeefc9743df73d7f9155`:
  A 2/8, P 11/11.
- R log `df987f5a9b6becee233d1cf06d766daad387ad6ff056364b9b6fa628c9da27c7`:
  R 18/23.
- No timeout, cancellation, skip, retry or setup/import failure is present.

## Failure classification

### Test measurement ownership

1. **A timer totals, four failures.** A212 sees 3 versus baseline 5; A357 and
   A431 see 3 versus expected 6; A700 sees 3 versus baseline 5. The fixture
   gives the same `VirtualTimeSource` to the real service and handler. Advancing
   it runs ordinary service/recovery timers as well as the observation timer.
   A total `pendingTimerCount()` is therefore not an observation-resource
   identity and cannot be expected to return to the earlier global baseline.
   O275-295 already owns and clears its exact captured scheduler handle. These
   reds do not show an observation timer leak.

2. **R timer totals, three failures.** R368, R630 and R723 expect the global
   handler clock to retain its earlier baseline after handler shutdown,
   registry replacement/deletion or acquisition-time deletion. Those actions
   legitimately discharge the separate release-recovery timer too. Actual 0
   versus expected 1 is consistent with both owners cleaning up; it is not
   evidence that O lost or duplicated its timer. The test must observe the
   exact O handle, not preserve unrelated hosted-recovery debt.

3. **R aggregate listener total.** R836 expects 4 but sees 9 because
   `observationSubscriptionCount` sums every listener already registered on
   the four Raft event sets. O30-38 adds exactly four observation slots, but
   the service has five existing listeners. Later `releaseCalls` already wrap
   the exact four acquisitions. Raw aggregate 9 must not be adopted as a new
   expected count.

   A read-only helper census found no existing shared exact-resource observer.
   The existing owner-faithful seams are inline in R: subscription acquisition
   and release wrapping at R681-710, and exact timer-handle capture/clear plus
   the seven cleanup slots at R759-810. F539-541 only counts the total
   APPLIED_PROGRESS listeners, so it cannot distinguish the observation owner.

4. **Registered generic envelope.** A's first unsafe-envelope assertion omits
   `acknowledged: true`. The registered shared entry deliberately returns
   `{acknowledged: true, result, correlationId}` for an engaged handler
   (`replica-handler-lifecycle-methods.js:156`), including its generic typed
   unknown-message result. The test expected shape is incomplete; production
   did not misclassify or read the hostile payload.

5. **Fresh-first-read counter.** A907 performs an explicit independent
   `leader.raft.readCommittedMembership` through the still-installed gate
   before A917 asserts one read. Actual 2 comprises the production observation
   plus the test's own after-application witness read. The source observation
   did not unconditionally reread. Measure immediately after the answer or
   restore the gate before the independent witness read.

### Production contract defect

6. **Context-null refusal skips the current-generation fence.** R's
   changed-generation companion expected STALE but receives the original
   typed membership UNAVAILABLE. PA131-161 returns unavailable with `context:
   null` before generation projection when committed membership is refused.
   R292-305 checks lifecycle, then returns that refusal immediately at
   `assessment.context === null`; it never samples current status/generation.
   The accepted S6 decision explicitly requires a dirty terminal refusal to
   remain UNAVAILABLE only in the same current context, with a runtime-
   generation change settling STALE. This is an owner-contract gap, not a
   count adjustment. Preserve current-context membership refusal precedence;
   reuse PA's sole generation projection/current request fence for the latest
   status and return STALE only when the current identity moved. Do not turn
   unavailable facts into refresh eligibility or add another classifier.

## Completed and unexecuted coverage

- P ran all 11 subtests green.
- A ran all eight top-level subtests. Candidate S1 term fencing and S2 N-to-K
  application both completed green. In the retained-feature same-host negative,
  those exact assertions fail OBSERVED-vs-STALE and STALE-vs-OBSERVED, so their
  correction discrimination is engaged. The other six candidate failures are
  the measurement issues above.
- A1 stopped during the first `rpc` case after terminal settlement; its
  successor assertions and the entire `overall` case did not execute.
- A2 stopped before the queued timeout progression and later-arrival controls.
- A3 stopped after the initial exact join; unsafe/conflict/terminal/successor
  lifetime branches did not execute.
- A4 stopped on the first unsafe generic envelope; remaining unsafe and nested
  matrices, valid observation and generation controls did not execute.
- A5 completed malformed receiver inputs and the backward-timer answer, then
  stopped on the global timer count; later sender-clock controls did not run.
- A8 completed answer, application and independent membership read, then
  stopped at its contaminated read count; final listener/timer assertions did
  not run.
- R ran all 23 top-level subtests: 18 green and five red. R5 reached typed
  STALE, exact identity, CLOSED and listener cleanup before its timer-total
  failure. R9's unchanged-generation case completed; changed-generation
  stopped on the production outcome mismatch before its remaining identity,
  count and resource checks. R10 stopped in the first `replace` case before
  successor assertions; the `delete` case did not run. R11 stopped in the
  first `subscription` case at the global timer total; the `timer` case did
  not run. R12 stopped at the initial aggregate listener total, so retained
  debt joins, seven-resource failures/discharge, fresh record and final
  AggregateError custody did not execute. R13-R23 all executed green.

## Minimal correction plan

1. Extract one shared test-only observation-resource custody seam for the real
   A/R consumers only if both corrected files actually consume it. There is no
   existing shared helper to reuse; the canonical starting point is the exact
   inline R681-710 and R759-810 instrumentation. Move that seam once into F,
   rather than creating another tracker, and have it retain subscription
   identities per actual Raft event plus the exact timer handle installed and
   cleared on the captured scheduler. If a correction remains single-consumer,
   keep the existing inline owner observation local. Assert additions/removals
   by identity while allowing unrelated service/recovery timers and listeners
   to progress. Do not expose O's private map or add another lifecycle driver.
2. Include `acknowledged: true` in the actual registered generic-error envelope
   expectation; retain exact error and correlation fields and zero hostile
   reads.
3. Take the A8 production membership-read count before the test's independent
   after-application read, or restore the shared gate before that read.
4. Repair only R's accepted same-current-context decision: a context-null
   refusal retains UNAVAILABLE when the latest canonical generation is still
   the request generation, while moved generation is STALE. Reuse existing PA
   projection and R identity fences; no retry, refresh, budget or result-shape
   change.
5. Rerun the complete A/R files after correction because early assertions left
   the branches listed above unexecuted. Same-host candidate/retained-feature
   comparison remains required; hardcoded observed totals are not acceptable.

The retained-feature R run subsequently completed with the same 18/23 shape
and the same five assertions as the candidate; it adds no divergent resource
count or outcome. This triage does not alter the green P result or accept the
candidate. It distinguishes the one source contract gap from ten measurement
failures without weakening resource cleanup.
