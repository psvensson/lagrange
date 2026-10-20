---
audience: development
documentClass: evidence
---

# Same-host message-group and exact-handler regression comparison

Date: 2026-10-20.
Reviewer: `subagent:/root/physical_custody_review`.
Baseline: `63420a1a5d6ec3564027275ddf35369edb128983`.
Repaired candidate: `e29e46abf6c5daf506d8c0500b5a9a1d16c2bcd6`.

The root-owned canonical lab runner executed both selections serially on
`adam-laptop`, with `retryFailedOnce: false` and attempt 1 for every file.
Both used the same four test files and classified plans: three ordinary
files with jobs=4, followed by the bootstrap file with jobs=2. The four test
files are byte-identical between the two commits. This reviewer read their
completed output and exact source; no additional tests, fetches or source
changes were performed for the comparison.

## Exact run evidence

The durable packets are
[baseline input](owner-baseline-63420a1a5/input.json),
[baseline results](owner-baseline-63420a1a5/results.ndjson),
[baseline exit](owner-baseline-63420a1a5/exit.json),
[repaired input](owner-repaired-e29e46abf/input.json),
[repaired results](owner-repaired-e29e46abf/results.ndjson), and
[repaired exit](owner-repaired-e29e46abf/exit.json).
Both runs have exit status 1.

| File under `test/` | Baseline result | Repaired result |
| --- | --- | --- |
| `transport/exact-handler-identity-api.test.js` | PASS, 36 assertions | PASS, 36 assertions |
| `node/message-group-executor-activation-handler-boundary.test.js` | PASS, 43 assertions | PASS, 43 assertions |
| `node/replica-transport-handler-identity.test.js` | FAIL, 22 assertions | FAIL, 22 assertions |
| `bootstrap/message-group-activation-handler-boundary.test.js` | PASS, 71 assertions | FAIL, 71 assertions |
| Total | 3/4 files pass, 172 assertions | 2/4 files pass, 172 assertions |

SHA-256 of the reviewed result files:

- Baseline `results.ndjson`:
  `5d65df4c25a5c74ef293ac58ee7a1178c682f0fd668a94be5844570cbf103734`.
- Repaired `results.ndjson`:
  `d9847beb18d337774955483d0dbc2507a8fc56012d9e69b83cee804e86d4dd01`.

The original combined controller output is
`test-output/seed-release-custody/phase-and-owner-controls-controller.txt`.
At review its SHA-256 was
`3df10b7eaed7756e2db73a86666124c4c2cf7184d18494e24212e0b35f75920a`.
Baseline owner-run output occupies lines 282-490; repaired output occupies
lines 491-1551. This combined output also includes an earlier, separate
control run; that earlier run is not part of this comparison.

## Inherited: three typed-refusal fixture failures

Both candidates fail the same three children of the fourth top-level test
in `test/node/replica-transport-handler-identity.test.js`. Each fixture
deliberately supplies a presence-only transport, but expects retirement to
complete without rejecting:

| Child | First material mismatch | Production enforcement |
| --- | --- | --- |
| Partition replica shutdown | Test line 159 awaits successful `service.shutdown()` | `src/partition/partition-service-lifecycle-methods.js:63-76` requires retirement settlement |
| Message-group replica retirement | Test lines 170-173 expect a returned refusal value | `src/bootstrap/shared/message-group-transport-handler.js:44-60` requires retirement settlement |
| WASM service replica shutdown | Test line 188 awaits successful `replica.shutdown()` | `src/wasm-service/wasm-service-replica-lifecycle.js:290-304` requires retirement settlement and retains cleanup-required state on failure |

Every observed rejection reaches
`src/node/replica-transport-handler-identity.js:30-35` with code
`refused_transport_without_handler_identity`. The owner permits dependent
release only after RETIRED or ALREADY_ABSENT; logging a refusal is not
completion. The test file and these production files are unchanged between
the two commits, and both measured stacks identify the same cause.

This is inherited test/owner contract drift, not a waiver or a claim that
the regression selection is green. The follow-up must assert typed
rejection while preserving exact-handler retention and reporting checks.
The WASM fixture also currently removes its directory in `finally` at
lines 193-195 after the rejected shutdown. Its repair must settle retained
cleanup before deleting that directory; it must not suppress the rejection
or treat it as successful shutdown.

PR139 was not imported or used to establish this attribution. Its supplied
historical head `e14736eeda2dd5d9dc9f36227e18fcc320e892f2` was unavailable in
the local object database. No fetch, merge or cherry-pick was performed.

## New: two source-census correspondence failures

The repaired candidate passes all eleven preceding behavioral subtests in
`test/bootstrap/message-group-activation-handler-boundary.test.js`.
Its final structural census fails exactly two assertions:

1. Test lines 383-385 prohibit any `ENTITY_TYPE.MESSAGE_GROUP` occurrence in
   seed cleanup, describing it as address formatting for a raw removal.
2. Test lines 401-408 require two batch
   `retireMessageGroupTransportHandlers` calls in seed cleanup. The measured
   count is zero, against expected two.

The repaired composition intentionally differs. Both cleanup entry paths
call the existing handler's shared `shutdownMessageGroupServices` method at
`src/bootstrap/phases/seed-cleanup-handler.js:371,550`. That method captures
router/node context and calls the singular exact-owner helper at lines
648-654 for the captured message-group object. The formatted address is an
input to that owner, not a raw unregister call. The shared release helper
awaits native shutdown, then the exact retirement callback, and deletes the
map entry only if it still names that object (lines 612-619).

These two newly introduced test failures demonstrate stale structural
correspondence. They do not demonstrate a runtime handler-retirement
failure. The census must be updated to follow this composition while
retaining the prohibition on raw removal, exact-owner delegation and the
shutdown/retirement/discharge ordering. Simply deleting the assertions or
loosening them until green would not establish correspondence.

Root is preparing that bounded census update and six component
message-group cleanup cases under independent review, with production
unchanged. Those later test bytes and their results are not part of the
634/e29 runs documented here and receive no retrospective acceptance from
this report.

## Verdict boundary

The measured delta is one newly failing file containing two structural
census assertions, alongside one unchanged failing file containing three
typed-refusal fixture mismatches. The current owner-regression selection
remains RED. Two passing files and the passing behavioral MG cases do not
certify all transports, cleanup schedules, U1 or a release. The inherited
failures remain obligations, and the new census correction requires its
own exact-candidate review and measurement.
