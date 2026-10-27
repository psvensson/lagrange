# Independent review: invocation notification witnesses R2

Reviewer: `subagent:/root/mg_delivery_design`. Date: 2026-10-23.

Verdict: **APPROVE the exact test revision for its component scope**. The four
new cases exercise the R6 notification-failure boundary through the actual
invocation owner and preserve the previous ten cases byte-for-byte. No blocking
fixture-premise or assertion defect was established in this bounded delta.

This is static test review, not production or runtime approval. No runtime,
production/test edit, metadata, Quest log, commit, push or lab operation was
performed. This evidence file is the only write for this review.

## Exact reviewed bytes

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Test: `test/partition/partition-cdc-invocation-custody.test.js`.
Bundle: `/tmp/mg-invocation-notification-witness-r2-20261023`.

| Artifact | SHA256 |
| --- | --- |
| Before test, 416 lines | `5e9fc78dfb4a18a7b2e8332b8b93a52741594814f4fce63fbc3bfab8bbc82d3b` |
| After/live test, 472 lines | `556f2519388645603e727e70a81ac40eb42fcb95dc791f17641642852c064772` |
| Bundle manifest | `8adc4beb988469c8d877b66fbdac99abc932b5214a0a487e6bfdcef7437eb2cc` |
| Append-only delta | `6aa7346ec9f91d82e81671be08e3d5e874cc3e8a9b416c2cb927cab34e601831` |
| Governing interaction contract | `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383` |
| R1/R6 independent source review | `98ba8aa8b252efa6e9d9fb3691d05e4a1753167b052e59fc14d48f4925ad8146` |

I checked both test hashes, the live/frozen equality and exact 15,520-byte old
prefix. The only change is the appended synchronous/asynchronous notification
failure by reporting-success/reporting-failure matrix at lines 418-472. There are
no new imports, fixture policy changes, weakened earlier assertions or new timers.
The prior review remains
`REVIEW-mg-delivery-invocation-custody-witnesses-2026-10-23.md`; its component and
clock-model limits remain binding.

The actual invocation source was inspected at SHA256
`5d02b240662e0784175006884effeb9bbf913a192fed300626f4c2a0464e2d84`.
That is a source observation used to trace this witness, not an approval of a
moving integrated candidate. No source bytes are certified by this test verdict.

## What the four cases prove when executed

The fixture still starts real PartitionService/PartitionCDCDelivery through the
existing controllable-port fixture with generation-origin application disabled.
Production receives the controlled leadership event and mints its tenure. The
test does not claim native election, admitted SQL debt or a real recipient commit.

The new tests call the actual `beginCdcDeliveryInvocation` through `f.begin`,
register an independently held child, and execute a handler that throws a unique
original error through the owner's real `run` operation (`:436-445`). The test
observer only records the returned promise; it does not replace response racing,
the child counter, active-slot field or cleanup resolution.

After the public operation has settled, `finish` closes dispatch while the child
remains held. The tests require zero notifications and unsettled cleanup, then
use a real fresh delivery attempt to prove BACKPRESSURE with zero callback entry
(`:446-451`, helper `:129-137`). This is observable custody, not a test boolean
standing in for occupied capacity.

Resolving the held child must cause cleanup to settle without rejection. The
returned frozen result reports closed custody and retains the exact notification
error; the logger-throw cases retain the exact reporting error as well
(`:452-460`). The public response must still contain the identical original
handler error (`:461`). One report is observed, its payload names the notification
failure, and a second `finish` cannot notify again (`:462-465`). Finally the real
delivery path must admit and enter one new callback (`:466`, helper `:140-148`).

Both notification failure forms are genuine: one callback throws synchronously,
the other returns a rejected promise. The test does not install a catch on the
notification's promise. The production `notifyCdcInvocationClosed` must consume
it. `f.observe` consumes only the public response and cleanup promises, allowing
the test runner to expose a detached notification rejection.

The supplied logger is a scoped test double for the reporting dependency. It
records the actual production call and optionally throws; it does not resolve
cleanup or alter the invocation result. It is restored in `finally`. Existing
fixture teardown retires contexts, releases every held gate, awaits observed
work and shuts down the real partition, so failed assertions do not deliberately
leave the test's child gate open.

## Source-bound engagement and limits

The owned path is `beginCdcDeliveryInvocation.closeIfSettled` ->
`notifyCdcInvocationClosed` -> either successful notification or
`failedCleanupNotification` -> the existing cleanup promise
(`src/cdc/cdc-delivery-invocation.js:25-49,186-202,212-222`). The slot releases only
after dispatch closure and actual child settlement. Logging is an observer of a
notification failure and cannot replace the original delivery response. The
tests reach each of the four failure combinations on that path, rather than
manufacturing the expected cleanup result or calling a reporting helper alone.

Removing the notification catch/returned-rejection consumer leaves the tested
cleanup unresolved or creates an unhandled rejection after the held child is
released. Removing the logger guard similarly prevents the expected terminal
cleanup record. Releasing custody at `finish` would instead make the measured
BACKPRESSURE assertion fail. These are intended semantic discriminators; none
has been run as a measured revert control in this review.

The async notification here rejects immediately. This matrix does not measure a
long-running observer or prove successor admission while an observer promise is
still pending. It also does not pin the diagnostic text or every failure-code
field, and it does not exercise an unreadable error-message accessor. Those are
limits of this finite witness, not invented runtime results. It does pin exact
error custody, explicit frozen failure structure, reporting failure containment,
once-only close and capacity recovery.

No creating-clock delay is introduced by the appended cases. The existing
delayed-timer helper's documented limitations remain unchanged; these four
cases do not rely on re-arming a timer while its scheduler clock lags. The earlier
expiry/shutdown/tenure tests remain separate controls.

The author reports syntax and scoped ESLint complexity-12 passing; runtime is
unexecuted. Appropriate exact-candidate lab execution still must demonstrate
these cases and the unchanged ten cases. Real native custody, source ledger
hydration/ACK, topology fanout, multi-budget provisional progression, recovery,
activation, transfer and composed two-start acceptance remain separate proof.
