# Independent V5 recovery-failure evidence review

**Bounded deletion source/content verdict remains APPROVE for non-main WIP preservation with honest HOLD. Whole deletion Quest acceptance remains WITHHELD. The final runtime regression control is RED in both source treatments.** A separate recovery-owner Quest is the appropriate remediation boundary; the deletion Quest must retain its required proof gate rather than waive this failure. No production/test/registry/Git edit, manual port operation, additional release, lab execution or landing was performed by this reviewer.

## Exact final pair verified

| Input | Immutable tree | HEAD / tree |
| --- | --- | --- |
| Candidate | `/tmp/session-worktree-dEBHVZ/tree` | `59e022721a94b449aa0d1ee47a441db29fb5f8d7` / `5636dd3134144779ca5cc85d0c753224815f7a7f` |
| Predecessor-source treatment | `/tmp/session-worktree-wzco8c/tree` | `27218f8d8c85978755ea88b8d4ca5826aabd6a85` / `e942daa27e7cebab17522dd41eb0bca673b9f31c` |

Both trees carry identical current tests and runtime SHA256 **`8f63c5e1ba41b8973a8a90f79c94eb33bffef8f65706e21ad4457cbe1ff65124`**. Git comparison verifies exactly31 paths differ and every difference is under `src/`; no test, fixture, scripts, registry or evidence difference exists between treatments. Predecessor `src/` exactly matches base `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`. Candidate all31 source entries match approved V2 manifest `837d5131e13d81bdcdf8812068fa21ca87a053a0079b2584f37ba96e6e7487dc`, with no mismatch.

Read retained locked-run inputs/status and raw TAPs; both processes have finished. Both exit1,19/20 assertions, all10 runtime cases present, zero cancellations. The same deferred-election lone-leader case fails at body `partition-runtime-reconstruction-leadership.test.js:422`, **“the registered release owner revalidates the healed group”**:

- Candidate duration11151.617401ms.
- Predecessor-source duration11179.152098ms.

Cleanup no longer masks the primary failure. The actual body predicate (`waitForParticipantRelease:182-184`) repeatedly observes only canonical pause-null through `participantCutoverPauseOf`, within the unchanged10000ms GROUP_BUDGET_MS. Case timeout remains30000ms. This proves a healthy post-heal admission-recovery bound was spent under both source treatments. It is neither a deletion regression demonstrated by this comparison nor acceptable behavior. No import/setup fault, manual status poke or forced release produced the failure or attempted to make it green.

## Facts observed before the failure

Because the first failed assertion is:422, the preceding body checks completed in both inputs (`runtime:369-420`): actual victim and sibling setup writes succeeded; victim application fault returned OUTCOME_UNKNOWN with committed-application failure and SQLITE_FULL; durable applied cursor did not consume the failed entry; victim stopped observing leadership; a later write returned exact CUTOVER_PAUSED/deferRetry with no added log entry; the port reported HOST_FAILURE/recoveryRequired, null role, original APPLICATION/SQLITE_FULL and bounded retryAfterMs (`assertRecoveryOutcome:298-313`). Fault healing raised the page limit and removed the actual amplification trigger (`healApplicationLimit:241-243`). The body made one existing status observation after healing, waited its typed retry interval when still held, then observed canonical pause-null without actuation.

The TAP does not contain a release-owner turn trace, registry snapshot, pending/running queue observations, port tail state, current release-fact refusal or status at the final timeout. These missing observations limit the root-cause claim below.

## Complete source owner transition and stall conditions

All coordinates below are in the immutable candidate unless stated otherwise. The critical owner files are unchanged from e6; the source treatment verifies the same behavior without the deletion.

| Transition | Source-confirmed owner behavior | Runtime certainty |
| --- | --- | --- |
| Actual owner composition | `test/partition/partition-release-fixture.js:28-97` creates real ReplicaHandlers, registers them with transport, hosts actual services through `replaceLocalReplicaService`, and supplies one initial operator release. Runtime fixture:323-354 hosts both lone partitions; no post-fault operator release exists. | Setup release and ordinary writes passed. Complete-owner composition is in the exact identical witness; no missing-owner harness explanation remains. |
| Application host failure | `raft-rs-runtime-owner.js:221-237` records recovery with existing retry window, sets RECOVERY_REQUIRED and calls `announceNoRole:159-170`, which emits follower/leader-null through the current event owner. `recoveryOutcome:785-802` carries typed HOST_FAILURE, null role, current group/replica identity, retry timing and durable progress. | Actual HOST_FAILURE/null role/APPLICATION/SQLITE_FULL and unchanged durable applied cursor are asserted before:422. Exact retry/queue timing is not logged. |
| Service lifecycle response | `partition-service-raft-lifecycle-wiring.js:83-95` releases pending writes and discards volatile sessions on demotion; `relayPartitionConsensusObservations:139-151` relays membership/leader/term as CONSENSUS_OBSERVED. | Leadership and typed write changes are measured; individual event delivery/turn ordering is not in raw TAP. |
| Node relay and admission invalidation | Tracked registry attaches every hosted service relay (`replica-handler-membership-relay.js:44-50,76-87`; class:159-164). Release recovery consumes it (`release-recovery:128-130`), invalidates current admission, and enqueues one partition wake. | Current pause/defer refusal proves admission became closed. The specific wake count/order remains unmeasured. |
| Existing recovery dispatch | `release-recovery:97-118` deletes a due pending item:107, invokes one reconcile under existing single-flight `running`, clears it and arms only remaining pending work. Reconcile:70-74 finds a local initialized LEADER by existing status observation and immediately returns if none; this branch has no retry/report. Exceptions re-enqueue:108-111, and completed non-CUT_OVER cutover answers re-enqueue:90-94. A normal early no-leader return does neither. | The early-return loss of continuation is a verified code branch. The failed run does not record which branch was actually last executed. |
| Deferred singleton has no scheduled Raft turn | `raft-init:455-456` requests deferred scheduling; port:483-485 does not start it, and raft-init:501-502 stops scheduling. Founder discriminator:643-644 applies. Runtime fixture calls startElection, but singleton branch:672-674 only marks it started and returns without `startScheduling`. Port scheduling:339-353 is the sole scheduled-tick interval. | The exact test input is `{deferElection:true}` and one voter. Lack of this scheduled timer follows directly from source; no timer-state diagnostic was recorded. |
| Closed admission observation does not drive recovery | `participantCutoverPauseOf:33-38` calls invalidation, but `invalidateParticipantReleaseAdmission:41-44` returns before `readStatus` once already CLOSED. `startAdmittedPartitionWrite:441-451` returns paused before the leadership/status gate. | The observed body loop is that canonical pause predicate only. It contains no new port read, tick or write to manufacture progress. |
| Remaining service cadence does not provide an implicit Raft recovery turn in this state | Current1s cadence calls holds→fitness→snapshot (`cadence-methods:45-50`). Holds read current participant rows and expire volatile sessions (`session:211-223`), not the port. Normal fitness observes SQLite inTransaction and returns fit before its consequence (`durability-fitness:184-205,223-241`); snapshot reads published service role and returns NOT_LEADER (`snapshot-cadence:64-68`), not port status. | These source paths exclude a hidden recovery driver in the asserted no-transaction/demoted state. No runtime cadence trace is claimed. |
| Port recovery itself is existing, demand driven and serialized | `runtime-owner:1369-1388` performs/reports held-group status under the existing queue; busy tail/entered gives a typed deferral and a Promise result also initially reports held. `ensureExecution:889-904` reconstructs current held group; `reconstructGroup:846-875` waits the existing retry window, reads durable record, drains unapplied committed work and resumes the same group. | The port was demonstrably held; whether the healing observation hit a busy tail/retry window/async result is unmeasured. |
| Reopening remains current release authority | A future live LEADER turn must pass current origin/build/registry identity and run canonical cutover (`release-recovery:75-94`). Cutover checks real leadership:211-215, closes before awaited facts:226-230, and resume revalidates exact live generation/census with no await before OPEN (`pause:55-80`). | The measured missing event is pause reopening by this owner within10s. No recorded canonical refusal explains why it did not occur. |

**Verified structural waiting cycle:** if the existing recovery wake observes a typed host-held/no-role group and returns through:74 while the admission is CLOSED and the deferred singleton has no scheduled turn, that pending continuation is lost. The pause observation and refused write path cannot drive the port; absence of another owner event leaves both port recovery and release revalidation waiting for an operation that admission prevents. This is a source-confirmed reachable stall mechanism, rather than a claim inferred from the timeout alone.

**Inference about this exact run:** the above lost continuation is the leading explanation for the repeated deferred-only failure; the scheduled sibling case succeeds in both treatments. The precise last branch, busy queue timing, retry deadline and whether another current fact caused a refusal are not instrumented. Therefore this review does not call the exact live cycle fully proven, invent a stale permission, or patch a guessed line. Next evidence must come from the existing owner's transition/typed-output seam without adding an actuation driver to the witness.

## Proposed minimal single-owner remediation boundary

Use a **separate Quest owned by `createParticipantReleaseRecovery` / `src/node/replica-handler-release-recovery.js`**, targeting loss of an existing-origin recovery continuation during a typed transient host-held state. This changes an owner interaction and needs a sealed behavioral red plus independent source/proof review. It should not be mixed into executable legacy deletion after that source was frozen and independently approved.

The smallest proposed contract is: a recovery turn must preserve an owned future wake when its already required current status observation names a transient held hosted group, instead of treating it as the same terminal absence of local leadership as a healthy follower. Reuse the existing canonical host-held contract (`isHeldByHostFailure` in `partition-write-kernel.js:351-359`) or its owner-approved equivalent seam; do not add a second interpretation. Retain one status observation per current service/turn, the existing pending/running/timer/single-flight machinery, existing retry windows/backoff/concurrency limits and shutdown cancellation. A wake is not permission. Only a fresh actual LEADER plus current origin/build/registry identity and the unchanged canonical cutover/census owner may reopen admission.

This is a remediation boundary recommendation, **not an approved implementation**. The follow-on must prove which branch lost progress before choosing exact mechanics. It must not make a healthy follower an autonomous release leader, cache an old leader as authority, start election scheduling as a side effect of release, use a second driver/timer, manually poke status/tick from the test, force OPEN, repeat the operator release, enlarge any bound, turn absent/unreadable origin into success, or resurrect removed maps/compatibility.

Required paired proof should preserve the existing actual deferred singleton fixture: initial current owner release and nonempty committed seed; actual committed APPLICATION/SQLITE_FULL; invalidated exact current admission; remove the real fault; owner-only recovery/revalidation within the existing budget; one post-heal write; failed committed row applied once; sibling term/log/runtime untouched. Source-only revert with unchanged witness must fail the named liveness assertion. Retain healthy follower non-authority, persistent-fault reconstruction/term/log bounds, service replacement/shutdown, single-flight/event pressure and exact-current-generation/census safety controls. Instrumentation may observe the owner turn and reason but may not supply the missing actuation.

## Seven-category consequence and deletion Quest disposition

The full category-complete checklist remains incorporated from `implementation-review-current.md` SHA256 `40cd991c9ce2b3e753d67620dcc2cfa7eb0c19ae9725ea36d0771d09e79510fe`; cleanup delta report SHA256 `1a7dd17b74020e311698d344c5feafac87cf9ca254a3ed61ab08601264065bf9`. No historical report is overwritten.

| Category | Current consequence |
| --- | --- |
| admission-gating | Typed refusal/identity/collision safety remains approved. Gate release liveness is RED under the real complete owner; do not hard-fail a transient or remove the pause to make progress. |
| recovery-replay | Actual healed committed apply/release continuation is not certified for deferred singleton. Durable current prepared/outcome/CDC source remains intact; existing waiting cycle belongs to recovery interaction, not old-engine deletion. |
| sweep-timer | Existing healthy10s bound is spent in both treatments. No budget increase; same-owner wake/backoff and no hidden cadence/secondary driver must be proved. |
| concurrency-serialization | Existing queues and CAS remain; follow-on must preserve single-flight/revalidate after await/current service identity and timer/event races. |
| owner-interaction | Missing transient continuation is the proposed owner issue. Sole canonical release/actuation authority remains; typed held/no-leader distinction requires owner review before implementation. |
| harness-fidelity | Final8f63 pair is faithful and exposes primary assertion red with identical tests/source-only delta. No more cleanup masking, setup red or fabricated manual repair. It remains failed proof, not green. |
| adversarial-js-intrinsics | Deletion source/ingress contract remains approved/unchanged. Follow-on must not introduce coercive or ambient-intrinsic status/identity predicates; current strict transport semantics remain intact. |

**Keep the bounded deletion Quest on HOLD** while the separate recovery-owner Quest resolves and final acceptance gates are measured. Source/content suitability for a non-main preservation checkpoint still stands with exact bytes and truthful red/HOLD receipts. Same-host baseline classification isolates this as preexisting owner interaction under the current witness; it does not waive it for landing. Eight parent receipts, full main/TX1/rs-raft acceptance, current application snapshot/FreshMG/CDC/integrated crash certification remain untouched/unproven. Historical W1 unknown-phase timeout, M1/C2 and broad-run/static cohort classifications remain independent open gates.

## Evidence fingerprints

```text
frozen-v5-inputs.json 71d1a329f50dee15dfe8a44dc2d194c41a102ff5298a0ab06fcdc3df944db241
frozen-v5-runtime-ab-status.json b1930cb42e8258f939f1eb24bf5db35c58b00490a688841060b67fdffdfd5763
frozen-v5-runtime-candidate.tap 893f275afcbaa52502dda5eb305b81f29c3b54d99a5f495bee8a769e3191de78
frozen-v5-runtime-predecessor-source.tap 271d7399a426f943fd7ec660bec6d2f6f28e4d1200e580882f550cf9f7c5081a
runtime witness 8f63c5e1ba41b8973a8a90f79c94eb33bffef8f65706e21ad4457cbe1ff65124
replica-handler-release-recovery.js 07594e7e2aeaae7305c0f39eddd6d5e6227a08e4de659e28b6e19a24125a41e3
partition-participant-transaction-pause.js cfaed57de5d72786ac528eab1dc93fdd13411c1ce2a854f682569582df3fc85e
raft-rs-runtime-owner.js b6cf3a1138030e75f23cb83eeeb31f1bc9080a8d72c414a160320217e556b1b5
raft-rs-operation-port.js 552ec26c5d173a6962646e45e8a990d79a3f8052125fc5f798a77473d2a726bd
```

All V5 artifacts above are under `test-output/alpha-single-path-20261013/` in the live review worktree; immutable input paths/SHAs are pinned above. The observations and trace are review evidence, not a substitute for final lab/Quest acceptance.
