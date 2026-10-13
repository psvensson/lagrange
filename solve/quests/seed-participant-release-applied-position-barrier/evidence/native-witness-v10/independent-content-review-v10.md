# Native release boundary witness V10: independent delta review

Verdict: **APPROVE the V8→V9→V10 test-content delta.** V9 closes the two and only two defects in the complete V8 content review; V10 makes the V9 directory-retention consequence observable on the final aggregate. No new source, fixture, release decision, timing rule or test driver appears in either delta. This is witness-content approval only. No behavior, production implementation, metadata, Quest completion, lab, corpus or landing claim follows from it.

## Exact binding and artifact custody

- Repository HEAD: `3ebc7da41a92ed4196bf87eb8aaf039ef604dfc4`.
- Prior complete review: `solve/quests/seed-participant-release-applied-position-barrier/evidence/native-witness-v8/independent-content-review-v8.md`, SHA256 `db96fd5d05d9a932e6b11aa8d16549190a36e0a2583cd5cb9c3f25b3980bef48`.
- V8 witness: SHA256 `56de6d74e80e9d07228af9a9eb23a90fe9d47932017fbfa8b0b66db94d048066`, 1327 lines. Its frozen archive `/tmp/native-witness-v9/participant-release-native-application-order.v8.test.js` matches that hash.
- V9 witness: SHA256 `a8c86a338b3b01c86fa08e522d59b45d61fadb8dda2f3e7f4017757db1cbefba`, 1346 lines. Its frozen archive `/tmp/native-witness-v10/participant-release-native-application-order.v9.test.js` matches that hash. Root custody manifest SHA256 `e9e8bf26a0f6137d67b1e5fb212c1a1b9c3e8fbe7d74a8a2c3ea89a082c464ca` binds 13 artifacts; every recorded byte count and artifact hash was independently recomputed with zero mismatch.
- V10 witness: `test/partition/participant-release-native-application-order.test.js`, SHA256 `01518ea0132c2806d268c265e642fd9e2a54a3f05568ef49256f8acf4698c8c2`, 1353 lines. Root custody manifest SHA256 `6e5112cdfeadd1f48e4cff00d2e525afacf3d689fc73bd99ac5b4d15fd17d480`, also 13 artifacts, independently matches every byte count and hash. The exact V8→V9 and V9→V10 diffs are SHA256 `f32a0255adcad34d5ff2b95af0df2ed7efc710846c414b33913fc455f57c83a1` and `312b9eff869a1dabe1dc761ee26e3ca5c32399d624ee1b0107d10de11b76ea52`.
- The two production-fidelity fixtures remain byte-identical to V7: `partition-admitted-group-fixture.js` SHA256 `24d4a14f2fab2c5ee43d02846fe32280ec31f5897ae301aa5695123cf1376af0` and `partition-release-fixture.js` SHA256 `2025703ba80ff8ab2d20bb70c00d851cd19c687578a5ba5e5e973f99cee522b1`.
- `git diff --name-only -- src scripts` is empty. The only test-path delta represented by the V9/V10 scope records is the native witness. Their recorded syntax, exact ESLint, strict cyclomatic/cognitive, strict file-size and whitespace logs and statuses match the custody manifests. Those are static artifact checks, not behavior runs; both manifests record `behavioralRuns: 0` and `metadataRefreshes: 0`.

## V8-R1: exact carrier outcome is independently retained

V9 adds one `carrierOutcome` slot to each of the two fixed membership-read states (`participant-release-native-application-order.test.js:401-414`). `recordOwnedSettlement` attaches directly to the exact promise returned by `gate.forward`, records its original fulfillment value or rejection before returning the observer outcome, places that observer under the already-owned `passiveTasks` cleanup, and installs a rejection sink (`:559-573`). The observer itself cannot reject because both branches return a record; the sink therefore creates no hidden rejected task.

`requireOwnedSettlement` now calls the already-reviewed `requireTreatmentRecord` and judges `state.carrierOutcome` after the race (`:545-580`). Route or outer-release reaction order can end the stage race, but it cannot substitute a route answer or stage assertion for an already-recorded carrier value/error. A recorded rejection is rethrown unchanged. At the actual stage, each exact forwarded carrier is registered once, both transport gates are then disarmed/restored, and the retained records are required before publication (`:1297-1310`). This is the requested recorded-state precedence; ACK still supplies no application authority.

All added settlement observers are awaited again by `cleanupMembershipReads` through `state.passiveTasks` (`:1120-1133`). No promise is detached, no result is swallowed, and no new timeout, clock read, poll, turn count, proposal, facts read or treatment classifier is added. The combined V8→V10 delta changes only 46 inserted/20 removed test lines, all in carrier observation and cleanup custody.

## V8-R2: uncertain borrowed-port custody retains and reports the directory

`cleanupMembershipReads` now returns a boolean derived only from an actual exact-wrapper restoration failure (`:1120-1147`). The restoration assertion still refuses to overwrite a replacement (`:536-541`); neither V9 nor V10 closes the borrowed native port separately. Every held task and passive observer is settled before unsubscribe/restore, and every unsubscribe/restore failure remains in the existing cleanup-error array.

When that boolean is true, cleanup derives the admitted group's actual directory from the existing pure `dbFileOf(MEMBERS[0])` seam before disposal, passes `retainDirectory: true`, and continues through release-owner disposal, group disposal, router shutdown and environment reset using the existing nonthrowing `captureCleanup` accumulator (`:1150-1197`). `partition-admitted-group-fixture.js:67-83` skips deletion on that flag and independently retains/reports the same directory if group shutdown itself fails.

V10 passes the derived path to `finishWithCustody`, which keeps the original primary error and every cleanup error as aggregate causes/`cleanupFailures` and adds `aggregate.retainedDirectory` only when borrowed-port restoration was uncertain (`:1106-1117`). A restoration failure necessarily already occupies `cleanupErrors`, so the early direct-primary branch cannot discard this new path. Release-owner failures already carry their own fixture-produced retained-directory field. There is no success-path blanket retention, replacement-port mutation, extra close, hidden resource deletion or cleanup short circuit in the delta.

## Category carry-forward from the complete V8 review

The V8 report's full applicable union remains incorporated. The two correction groups do not change any other disposition:

| Category | V9/V10 delta disposition |
| --- | --- |
| Admission 1–7 | Exact carrier value/error is now preserved; full K classifier, PAUSE, same release identity, normal bounds and final RESUME assertions are unchanged. Behavior remains unmeasured. |
| Recovery 1–5 | Borrowed-port restoration uncertainty now retains/reports the actual directory. No durable state, replay, rollback or recovery policy is added. |
| Sweep 1–5 | No timer, tick, retry cadence, stage deadline or budget changed. Both K carriers are still restored before publication waits. |
| Concurrency 1–5 | R1 now uses retained state rather than callback ordering. Fixed two-follower slots, original outer attempt and exact replica identities remain unchanged. |
| Owner interaction 1–10 | Native delivery, application publication, facts refresh and full release owners remain separate. R2 uses the existing group directory-custody seam; no new decision owner appears. |
| Harness 1–6 | The real three-voter fixture and five V7 engagement guards are byte-semantically unchanged. Setup/cleanup failures cannot count as the intended negative. |
| Adversarial JS 1–8 | No external decoder, arithmetic, iterable ingress, intrinsic dependency or hostile-input claim changes. The trusted scheduling-fixture scope remains as reviewed in V8. |
| Retry 1–7 | The original route/promise identity and recorded terminal carrier outcome are preserved; no redriver or duplicate mutation is introduced. |
| Formation 1–5 | No self-read, CDC dependency, direct facts mutation, pause reset, proposal, campaign or alternate formation path is introduced. |

## Source-control meaning and remaining proof

The V9/V10 code is reached only after the same V8 engagement boundary. The dormant wrapper still delegates once with the original receiver/arguments, and the unchanged-source branch still reaches the named premature-settlement assertion at `:1275-1284` before the new carrier-record stage. Therefore a source-only control remains meaningful; neither correction can green it through missing imports, setup failure or cleanup failure.

The witness still has **zero behavioral evidence in these artifacts**. Candidate, unchanged-source and any separately approved treatment controls must use the exact V10 bytes and preserve the five V7 engagement guards. Production V2 review, V4 controls, dirty-retention treatment, final-query/older-work schedules, startup, metadata, selected cone, corpus, Quest and landing remain independently owned HOLDs.
