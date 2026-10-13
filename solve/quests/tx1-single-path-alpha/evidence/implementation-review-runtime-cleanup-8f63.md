# Independent runtime cleanup delta review — 8f63

**Exact content verdict: APPROVE for a clearly labelled non-main WIP preservation checkpoint with honest HOLD. Whole-Quest / independent acceptance remains WITHHELD.** The cleanup-only change preserves the existing behavioral acceptance and exposes its primary failure. It does not fix or certify deferred-election recovery, authorize Quest landing/publishing/main merge, discharge static/lab gates, or convert any spent timeout into green. No source, tests, registry or Git were edited by this reviewer. No personal test execution is claimed.

Reviewed path: `test/partition/partition-runtime-reconstruction-leadership.test.js` in `/mnt/data/peter/projects/.worktrees/rs-raft-alpha-single-path-20261013`.

- Retained A/B candidate input: commit `2feb3110f196467e015c7741211e35bf597248a0`, tree `93807cf464420d6b02265fffeee4bd906c4f6a1e`, runtime SHA256 `f8ea05b90b5509328312b98b763fe130a22c2f922053cc3fd3de528195e9bce6`.
- Reviewed replacement runtime SHA256: **`8f63c5e1ba41b8973a8a90f79c94eb33bffef8f65706e21ad4457cbe1ff65124`**.
- Source base: `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`. All31 source-manifest entries still match V2 `837d5131e13d81bdcdf8812068fa21ca87a053a0079b2584f37ba96e6e7487dc` (26 present/5 deleted). No production delta is part of this review.

The full category-complete review remains incorporated by immutable content hash: `test-output/alpha-single-path-20261013/implementation-review-current.md`, SHA256 `40cd991c9ce2b3e753d67620dcc2cfa7eb0c19ae9725ea36d0771d09e79510fe`. That report contains every item across the seven sealed categories, the complete35-path test/registry sweep, verified durable V1/V2 report hashes, current-coverage corrections and all inherited/unmeasured gates. It is not overwritten. This report updates only the four cleanup assertions and the newly available retained A/B evidence.

## Actual byte delta and findings

Programmatic diff of retained commit runtime bytes against the replacement found **exactly four removals**, each the same two-line `assert.equal(await waitForParticipantRelease(...), true, 'cleanup: ...')` inside a finally block. No insertion or other changed byte exists. Actual replacement coordinates:

| Finally block | Retained cleanup | Removed assertion |
| --- | --- | --- |
| Lone scheduled/deferred leader helper:442-444 | `healApplicationLimit(partition.db)` | Cleanup-only OPEN wait |
| Persistent application-failure case:547-549 | `healApplicationLimit(partition.db)` | Cleanup-only OPEN wait |
| Lone persistence storm:1012-1015 | `stopCountingReconstructions()` and `healPersistenceLimit(partition.db)` | Cleanup-only OPEN wait |
| Fresh failure-record case:1078-1080 | `healPersistenceLimit(partition.db)` | Cleanup-only OPEN wait |

Outer real release-owner and service disposal is unchanged (`withLonePartitions:355-361`). Idempotent application trigger removal is unchanged:241-243. Real faults are removed before disposal even if a body assertion aborts. Remaining group/network finally blocks preserve fault healing and disposal.

All10 cases remain. Body canonical release/liveness observations stay at422-423,1038-1039,1054-1055,1072-1073, plus current group-leader/core/F-z release predicates. The lone helper still requires exactly one post-heal write, unchanged runtime generation, the committed failed row applied, sibling untouched and true leadership:424-441. All fault injection, durable reads, no-success/catch-up assertions, typed storm outcomes/entry identity/cause/phase/retryability/nonempty string reason, client/reconstruction/term/log bounds are unchanged. GROUP_BUDGET_MS remains10000 and TEST_TIMEOUT_MS remains30000:97-98. No manual second release, forced tick/leader event, OPEN mutation, increased budget or fixture recovery algorithm was added.

**No newly unresolved content defect was found in this bounded cleanup delta.** Its purpose is to prevent a cleanup acceptance assertion from replacing a body failure, not to make the body pass. Cleanup must restore the injected environment and dispose owners; the body remains the owner-behavior contract.

## Retained same-host A/B is red in both treatments

Read `test-output/alpha-single-path-20261013/frozen-v4-inputs.json` and `frozen-v4-runtime-ab-status.json`, plus both raw TAPs. These bind the same runtimef8ea05b9 to candidate `2feb3110f196467e015c7741211e35bf597248a0` and predecessor-source treatment `662931ff95e39ba02d329581536442bcaf2869a0` (e6 source, identical witness). Both exit1 with19/20 assertions, no cancellation; both fail the same deferred-election case at the cleanup assertion after about21s:

- Candidate raw TAP `frozen-v4-runtime-candidate.tap`: case duration21161.066384ms, failure at runtime:444.
- Predecessor-source raw TAP `frozen-v4-runtime-predecessor-source.tap`: case duration21155.690041ms, failure at runtime:444.

This comparison does not demonstrate a deletion regression. It also does not demonstrate acceptable recovery or close the spent healthy bounds. The body failure is masked in both inputs; the replacement8f63 requires a final immutable measurement that names that primary assertion/error. The previously documented CLOSED/no-tick/no-requeued-release-owner cycle remains a structural hypothesis until actual phase/event evidence proves it. No source repair is authorized by this review.

## Seven-category delta disposition

| Category | Disposition |
| --- | --- |
| admission-gating | APPROVE content delta. Body exact current typed refusal, canonical post-heal release and same existing budgets remain; deferred release behavior remains HOLD pending primary visibility. |
| recovery-replay | APPROVE content delta. Fault restoration remains before shutdown; durable failed-row/replay/catch-up/identity controls remain. Cleanup no longer imposes a second behavioral release obligation. No recovery policy change. |
| sweep-timer | APPROVE unchanged. No timer, clock, threshold, cadence or owner retry edit. Spent10s observations remain red; removal of the extra cleanup wait does not cure the body's bound exhaustion. |
| concurrency-serialization | APPROVE unchanged. Existing actual node recovery composition, one initial operator release and body freshness predicates remain. No replacement driver, polling actuation or duplicated winner. |
| owner-interaction | APPROVE content delta. Real existing owners remain sole release authority. Cleanup does not certify OPEN; body remains the exact liveness obligation. Final metadata/source fingerprints still require final immutable binding. |
| harness-fidelity | APPROVE primary-failure preservation correction. Exactly four masking finally assertions removed, all10 cases/fault engagement/exact outcomes/bounds retained. Behavioral proof remains HOLD until a final measured input exposes and classifies the primary red. |
| adversarial-js-intrinsics | APPROVE unchanged. No new classification/validator/coercion/intrinsic operation. Previously corrected actual string reason assertions remain exact. |

All full-checklist source/test findings and limits in the incorporated report remain in force. This scoped content approval must not be recorded as whole-Quest independent approval.

## Preservation and remaining gates

The reviewed source V2 and test/registry content are suitable for a non-main WIP preservation checkpoint if it retains the exact reviewed bytes, raw red evidence, unlanded Quest state and explicit HOLD. This is a content-suitability judgment; this reviewer takes no Git action and does not authorize `solve land`, publish, main merge or an acceptance-note shortcut. A preservation checkpoint cannot claim that the pending measurements/static checks passed.

Still required: final immutable candidate/hash and generated metadata seal; primary-failure runtime measurement without cleanup masking; exact appropriate static/source/registry checks and locked regression cone; classification of the ongoing broad distributed run against exact predecessor cohorts; and honest disposition of every failure/spent bound. Root reports a1146-test source775504a broad run in progress with many reds requiring taxonomy/baseline cohorts; it is not accepted evidence yet.

Historical W1 unknown-phase30s exhaustion remains open despite focused diagnostic3/3 in both sources. M1 healthy provisioning exhaustion, inherited C2/ACK-owner integration and baseline static/dependency/duplication/Knip debt remain independent gates rather than waivers. Full TX1 crash/restart, current application-snapshot authority, FreshMG, CDC and full rs-raft/main/eight-parent-receipt certification remain uncertified. No exhausted timeout is harmless, no red is green, and no failure is hidden by this preservation verdict.
