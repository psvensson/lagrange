# Seed cohort repeated-intent observation and bounded owner decision

State: WIP, not source/behavioral acceptance and not an independent review.
Quest: `seed-release-once-per-partition-cohort`, canonically sealed OPEN/red at
`4431a5e94b4128f91576911a76071b0d03bbf962` with five false receipts.

## Original owner / actual evidence
- Exact composed baseline `f2d14fe2b5a0a64ba20afb6b4bac14944321bf4c`, source
  `src/bootstrap/bootstrap-service-seed-workflow.js` before the new seed edit.
- Hosted Actions original unchanged claim/cache test run `38521463582` was
  red at 1,000 ms. Its seed owner completed 13 of 135 local service entries
  and failed with current_control_owner_fact at the 14th service.
- The read-only, post-hoc complete TAP census run `38522151540` retained
  1,777,722 original TAP bytes (SHA256
  `e146775d1e152a01d6a6dd258bc7378c95546b34eb606afed15f4b4c1565836a`),
  with 694 matched/completed release-protocol deliveries; zero drops,
  capture errors or incomplete observations. Among 41 natural RELEASE requests,
  28 targeted `sql_transactions-p1`. The other 13 targeted five non-control
  partitions: four names had three RELEASE requests each, the fifth had one.
  The complete trace-derived summary and raw original TAP are archived in
  that GitHub run; no missing suffix has been inferred.
- The real cutover owner in
  `src/node/replica-handler-participant-cutover.js`
  delegates once to the entire current partition cohort. It then checks
  SQL_TRANSACTIONS through the same nested full control RELEASE before and after
  each dependent cohort. The seed's `partitionServices` is keyed by *replicaId*.
  Thus three local replicas cause three repeated *partition-wide* fresh-seed
  requests, multiplying both control checks and the actual pause/reopen/
  enable/observe/final census/RESUME work.
- Exact baseline engaged test at `434ecac89db106df8475a0f13015c11279bc0c04`
  on run `38522765352`, original
  `test/bootstrap/seed-release-once-per-cohort.test.js`: nine local replica
  services representing three real partition names initiated nine RELEASE
  requests. Its named expected one-per-partition assertion failed with
  the complete actual repeated request list; no timeout or missing-symbol
  substitute was accepted.

## Owner decision — only one intent per distinct partition

The seed bootstrap workflow is the single owner of which ordered partitions
receive a fresh-seed cutover intent. Its source now selects the first service
for every distinct partitionId from the **existing** SQL_TRANSACTIONS-first,
then partitionId-sorted inventory, preserving relative serialization.
No native membership or current control permission is inferred from this
selection. Every selected cohort still invokes the unchanged
`requestParticipantRelease` route with the original authorization owner and
one original shared absolute deadline. That existing cutover route reads the
authentic current membership and checks every actual member, including all
three distinct replicas, before resuming. The registry itself is not changed.

The failure projection's total counts distinct cohort intents, not local replica
entries. This changes the meaning of the progress *denominator* to match the
unit of work while retaining original typed outcomes, attempt count and clock.

The first direct source edit is `62136dc36e0a76d63edcc88ddb73897ee771d615`.
This has no implied permission to skip either current-control check,
cache a control CUT_OVER/OPEN result, issue parallel intents, extend 1,000/5,000ms
or change admission. If the real startup still exceeds those limits, the
remaining work is independent nested-control cost and must be measured before
any additional owner change.

## Remaining acceptance
- Exact same-host identical-test source-only old/new differential.
- Exact full original 1,000 and 5,000 ms seed startup bodies and current
  member census proof.
- Native V10, controls, TX1/TX2, recovery/CDC, metadata and strict gates.
- Independent source review and locked lab verification on final composition.

All five new Quest receipts remain false pending measured proof.
