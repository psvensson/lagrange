# Participant release held-recovery continuation

Status: sealed proposed production design with a measured passive diagnostic red. Production and impact metadata remain unchanged at `d35d8828c630d1b9675b47f511c477b3cc9ee991`; the only test delta is the passive diagnostic described below. Independent design review SHA256 `5a4680ebbbee3f2e8efda337ecfb53134c670d8d25cc2f31875728826640a486` returned REVISE. This document incorporates its R1-R5 correction batch for re-review; no production edit is authorized yet.

## Bounded problem

The existing participant release recovery owner consumes hosted-service and consensus events, coalesces work in one `pending` map, serializes each partition in `running`, caps all attempts at four and arms one timer (`src/node/replica-handler-release-recovery.js:16-56,97-131`). A due item is deleted before `reconcile`. `reconcile` reads each initialized hosted service's current Raft status while looking for a leader and returns normally when none exists (`:70-74`). Exceptions and non-`CUT_OVER` cutover answers re-enqueue (`:90-111`); this normal no-leader return does not.

The Raft runtime deliberately reports a group held by a host failure with `outcome=HOST_FAILURE`, `recoveryRequired=true`, `role=null` and a relative `retryAfterMs` (`src/raft/raft-rs-runtime-owner.js:775-802`). An idle `readStatus` owns the next serialized group operation and may reconstruct the group; a busy or asynchronous attempt returns that typed held status (`:846-875,889-904,925-955,1365-1378`). Reconstruction rereads the durable record, drains committed work and resumes. A gate-open sole voter campaigns because a deferred singleton has no scheduled tick (`:521-540`; `src/partition/partition-service-raft-init-base.js:455-456,501-502,643-674`).

The current write-kernel owner already defines the sole typed classifier: `isHeldByHostFailure(status)` checks the port outcome and `recoveryRequired` (`src/partition/partition-write-kernel.js:351-359`). This design reuses that export. It introduces no local status predicate.

Once admission is already closed, `participantCutoverPauseOf` returns the current pause without another port status read (`src/partition/partition-participant-transaction-pause.js:33-44`). A refused write also returns from the pause gate. Therefore neither a closed-admission poll nor a refused application write supplies a Raft recovery turn.

## Evidence classification

### Measured facts

The immutable V5 same-test, same-host comparison is recorded in `solve/quests/tx1-single-path-alpha/evidence/implementation-review-v5-recovery-hold.md` (SHA256 `37522bcb3c46d77e4accca063999e11ae93be576c9a849310b7f7b3d6b5ae0b0`). Candidate and predecessor-source treatments both ran runtime witness SHA256 `8f63c5e1ba41b8973a8a90f79c94eb33bffef8f65706e21ad4457cbe1ff65124`, reached 19/20 assertions, and spent the unchanged 10000 ms healthy group bound at “the registered release owner revalidates the healed group.” Their raw TAP hashes are `893f275afcbaa52502dda5eb305b81f29c3b54d99a5f495bee8a769e3191de78` and `271d7399a426f943fd7ec660bec6d2f6f28e4d1200e580882f550cf9f7c5081a`.

Before that red, both treatments measured successful victim and sibling seed writes, an actual committed APPLICATION/SQLITE_FULL failure with outcome unknown, an unchanged durable applied cursor, loss of victim leadership, exact `CUTOVER_PAUSED` refusal with no new log entry, and typed HOST_FAILURE/recoveryRequired/null-role status carrying the original failure and bounded retry. The real fault was then removed. The scheduled sibling case succeeded; the deferred singleton failed.

These measurements classify a pre-existing owner-interaction failure rather than a TX1 deletion regression. They do **not** record the release owner's last branch, queue contents, event order or retry timing. The old witness also manually read status after healing and slept for its reported retry. That actuation must be removed from the new red.

The proposed Quest's production baseline is `d35d8828c630d1b9675b47f511c477b3cc9ee991`. Its relevant source bytes match the reviewed V5 inputs: release recovery `07594e7e...`, runtime owner `b6cf3a11...`, pause owner `cfaed57d...`, write-kernel classifier owner `4541661a...` and Raft init owner `62db32d5...`. The passive diagnostic test is SHA256 `9ece45774ac62fad32e965f227b9e886140e21b5c8bdcd8a0fb6f7c12bd7d2e7`; it differs from the V5 witness only by the observation delta below.

The passive diagnostic was measured on locked `tv-dator` at immutable input `d0ae6f839cca24e2372daffc5ee981d76b207d48`, with exact d35 production and the diagnostic test above. It ran all 20 assertions: 19 passed and one failed. The naturally scheduled singleton control passed in 2381.31443 ms. The deferred singleton spent the unchanged healthy 10000 ms bound and failed in 10183.671715 ms with passive trace `{"reconstructions":0,"consensus":[]}`. The structured result is `evidence/passive-baseline-result.json`; the full raw log is `evidence/passive-baseline-tv-dator.log`, SHA256 `ae86bec0fc21246f1d3152877f051b04f7847b3087302b1b66c628febc5c3be6`.

This measurement proves that no target `CREATE_NODE` core entry and no target service `CONSENSUS_OBSERVED` event followed the heal before the release bound expired. It still does not observe the release owner's private pending/running maps or exact final branch. The delete-before-reconcile/no-leader continuation loss remains the source-backed leading mechanism, not a claimed directly measured branch.

### Source-backed facts and hypothesis

The delete-before-reconcile plus normal no-leader return is a source-confirmed continuation-loss branch. The deferred singleton has no scheduled Raft turn, the closed release gate does not read the port, and the remaining cadence owners do not reconstruct Raft. The source-confirmed waiting cycle is reachable when the release turn sees canonical host-held/no-role status.

It remains an inference that this branch was the final private branch in either red run. The current-source locked-lab diagnostic above fulfilled the required passive measurement: it recorded the actual-core reconstruction count and service `CONSENSUS_OBSERVED` events and reproduced the unchanged-bound red without a manual status read, sleep, tick or operator release. Production approval still depends on the revised design review and candidate proof.

## Revised owner transition

The change extends the existing release-recovery owner and the canonical pause/resume owner. One adjacent extraction under `src/node/` is allowed only if required by repository size or complexity gates. It adds no classifier, retry-duration policy, recovery ledger, election driver or parallel cutover path.

1. **Trigger.** Existing tracked-service changes and `CONSENSUS_OBSERVED` events enqueue a partition exactly as today. A canonical held observation may retain one self-observation debt in that same `pending` map. There is still one timer, one `running` entry per partition and at most four simultaneous release attempts.
2. **Ordered facts.** One turn takes the registry's current hosted-service order. It visits initialized, non-shutdown services at most once, calls each visited service's semantic `raft.readStatus()` once and stops at the first actual `LEADER`, preserving today's first-leader short circuit. Status snapshots have no authority after the turn. If a leader is found, earlier held observations do not create a retry debt and later services are not read. Only when the entire visited set has no leader does the owner ask the existing `isHeldByHostFailure(status)` classifier whether any visited service is canonically held.
3. **No-leader decision.** If any visited service is canonically held, the partition retains exactly one debt regardless of how many held services were seen. A mixture of held and ordinary followers/candidates retains one debt. A set of only healthy ordinary followers/candidates remains event-driven and creates no self wake. No initialized current service or an absent service grants nothing. A null, malformed or otherwise unclassifiable status is reported as typed unavailable with its actual observed outcome/failure reason (or an explicit missing semantic-status reason) and remains event-driven; it is never classified as a healthy follower or given timed authority.
4. **Fixed cadence.** Retained debt is due after exactly `PARTICIPANT_CUTOVER_BOUND.RECOVERY_RETRY_MS` (the existing 1000 ms) on `handler.timeSource`. The release owner does **not read, coerce, validate, compare, add or schedule from `status.retryAfterMs`**. Numeric-safe and platform-timer-safe duration handling therefore remains outside this owner. The sealed Quest's duration-validation constraint is satisfied by making the port field observationally inert at this boundary, proved with hostile field values/accessors. The runtime's existing not-before gate remains the sole retry-window policy before core reconstruction. A real service/consensus event may move observation earlier through the existing enqueue path; it cannot bypass the runtime not-before gate or create a concurrent release attempt.
5. **Raft durable point.** The retained observation invokes only the existing serialized runtime status operation. The runtime owner alone checks its not-before instant, rereads the durable opening record, reconstructs, applies committed work and announces current consensus. The release owner writes no recovery record, reads no raw log and calls no core operation.
6. **Release authority.** A later turn proceeds only after freshly observing an actual leader. It retains the existing durable-origin, measured-build and current-registry checks before `runParticipantCutover` (`release-recovery.js:75-94`). The canonical cutover remains sole owner of pause, cohort facts, drain, query settlement, origin enable, final census and resume (`replica-handler-participant-cutover.js:200-320`).
7. **Lifecycle-fenced resume.** `resumeParticipantCutoverAdmission(handler, service, request)` remains the only final admission mutation. Before both its already-OPEN/idempotent branch and its final no-await mutation, it rejects through the existing `STALE` outcome when `handler.shuttingDown`, `service.isShutdown`, or `handler.localServices.get(service.replicaId) !== service`. A rejected path raises/keeps that service CLOSED and cannot return `RESUMED`. After awaited release facts, the existing exact replica generation, term, leader, configuration, runtime and lifecycle checks still run immediately before the mutation. Thus handler shutdown begun while facts are awaited and a service replacement during that await cannot reopen the old object. Direct recovery shutdown still sets `stopped`, unsubscribes, clears timer/pending/report state and awaits running tasks; handler shutdown supplies the additional mutation fence while those tasks settle.
8. **Lost answer and refusal.** A non-`CUT_OVER` cutover result already re-enqueues at the same fixed 1000 ms cadence while the partition remains hosted. `runParticipantCutover` continues to share the canonical handler/partition attempt. A late or lost answer creates no second record or permission; already-OPEN handling must pass the same lifecycle fence and exact release ID.
9. **Restart and removal.** The queue remains volatile. Registration and real consensus events rebuild observation work after restart; durable origin and Raft records remain with their existing stores. Removing the last hosted service for a partition clears its pending and report entries. Replacement emits its existing registry event and is re-observed as the current object. A stopped handler retains no background obligation.
10. **Remaining transition.** After `CUT_OVER`, writes remain owned by the partition service. Any later generation, leader, configuration, runtime or lifecycle mismatch closes admission through the existing synchronous gate. The new wake carries observation debt only and never release permission.

### Canonical decision table

The implementation may express this table with small internal decision records, but it must reuse the canonical port classifier and existing participant release outcomes. It must not introduce a second status or cutover enum.

| Fresh observation in one owner turn | Debt decision | Action/report |
| --- | --- | --- |
| First actual current leader | discharge self-observation debt | Continue the unchanged origin/build/cutover path. Stop scanning services. |
| No leader; at least one canonical host-held status | retain one partition debt | Schedule one fixed 1000 ms self observation. Throttled report carries partition/group, blocked replica and the canonical failure cause; absence of a role is not the classifier. |
| No leader; initialized services are only ordinary healthy followers/candidates | discharge self-observation debt | No periodic retry and no release call. A later real event may enqueue. |
| No initialized/current hosted service | discharge debt and clear report state when the last hosted service is gone | No success inference and no timer. |
| No leader; a status is null, malformed or otherwise unclassifiable | discharge self-observation debt | Report existing `UNAVAILABLE` with the actual observed status outcome/failure reason, or an explicit missing semantic-status reason when null. Reentry is event-driven; do not label it a healthy follower or retain timed authority. |
| Admission is already OPEN with the same release ID and lifecycle fence passes | discharge | Return existing `RESUMED`; perform no new mutation. |
| Admission is OPEN but handler shutdown, service shutdown or replacement is observed | discharge stale object's work | Raise/keep CLOSED and return existing `STALE`; never report idempotent success. |
| Admission is OPEN, lifecycle fence still passes, but release ID differs | discharge this mismatched request | Return existing `STALE` without revoking the still-current valid OPEN proof, preserving the original idempotent-owner behavior. |
| Durable origin is absent | discharge self debt | Existing `OPERATOR_REQUIRED` report with `explicit_pre_origin_release_request`; no inferred migration history. |
| Runtime build is unmeasured | discharge self debt | Existing `OPERATOR_REQUIRED` report with measured-build reason. |
| Canonical cutover returns `CUT_OVER` | discharge | Report exact cutover outcome; no further self wake. |
| Canonical cutover returns another typed outcome while the partition remains hosted/current | retain one partition debt | Report that exact outcome and retry at the existing fixed 1000 ms cadence. |
| Status observation or reconcile throws while a current service remains hosted | retain one partition debt | Existing `UNAVAILABLE` outcome with the actual error reason, throttled; no success inference. |
| Final resume sees generation/term/leader/configuration/runtime/lifecycle or registry mismatch | retain only if a current hosted partition still exists | Return `STALE`; replacement/removal events select the next current object. |
| Timer registration fails synchronously | do not claim a scheduled wake | Emit throttled `UNAVAILABLE` with the actual timer-owner error, remove the unscheduled deadline, and leave reentry to a real owner event. This is a visible degraded stop, not completion. |
| Release-recovery owner or handler is stopping | discharge volatile debt | Unsubscribe, clear timer/pending/reported state, await running work; the canonical lifecycle fence prevents any settling task from reopening admission. |

Persistent canonical hold is a background obligation bounded by the lifetime of a hosted current service and its handler, not a new operation with an invented deadline. Over a continuously held interval of `T` milliseconds, self observations are at most `floor(T / 1000) + 1`, plus real owner events. There are at most four running release attempts globally and at most one pending debt per currently hosted partition. An unchanged report signature is emitted at most `floor(T / 30000) + 1`; event bursts may add observations but coalesce by partition and do not expand concurrent cutover. Ordinary healthy followers remain event-driven. Runtime core attempts remain separately bounded by the runtime's existing retry window.

## Measured diagnostic red before source work

The authorized diagnostic changed only `test/partition/partition-runtime-reconstruction-leadership.test.js`:

- preserve the real registered ReplicaHandlers assembled by `attachPartitionReleaseOwners`, the initial canonical group release, nonempty victim/sibling writes, actual committed SQLITE_FULL injection, durable cursor check, leadership loss, paused no-log refusal, typed recovery outcome, real fault removal, final data, sibling and runtime-generation assertions;
- remove the post-heal manual `partition.raft.readStatus()` and `sleep(retryAfterMs + 1)`;
- use the existing actual-core observer to count target `CREATE_NODE` reconstruction turns without invoking them;
- subscribe passively to the target service's `PARTITION_SERVICE_EVENT.CONSENSUS_OBSERVED` data and include the observed trace in the named release assertion;
- leave `GROUP_BUDGET_MS=10000` and case budgets unchanged;
- require the scheduled-clock control to recover naturally and require the deferred singleton to expose the current red naturally.

The locked-lab result above is the required red: scheduled recovery remained green, while deferred recovery reported zero post-heal reconstructions and zero consensus events and spent the healthy bound. The two callbacks only receive operations/events already selected by the runtime and service; neither calls the port, ticks it, schedules work, changes admission or invokes release. They detach in `finally` even on the red.

## Acceptance and falsifiers

1. **Real deferred recovery.** On exact candidate source, the passive real-owner deferred singleton heals, replays the failed committed row exactly once, reopens through the canonical release owner and accepts one post-heal write inside the unchanged 10000 ms bound. Scheduled-clock control remains green. Reverting only the production repair with identical test bytes fails the named release assertion on the same host.
2. **Typed held status and fixed owner clock.** `test/node/replica-handler-release-recovery.test.js` drives the public recovery owner with canonical HOST_FAILURE/recoveryRequired evidence and proves one retained wake at exactly the existing 1000 ms cadence on the injected owner clock. It replaces `retryAfterMs` with high safe, negative, fractional, unsafe, nonfinite, boxed, proxy and throwing-accessor values and proves the release owner never reads or coerces that field. The runtime not-before gate remains unchanged and independently decides when a real reconstruction may enter the core.
3. **Ordered multi-service decision.** The focused witness proves registry order and at-most-once status reads: an earlier leader short-circuits later held services; an earlier held service followed by a leader proceeds through leader release without timed debt; no leader plus any held service retains one partition debt; no leader plus only ordinary followers/candidates retains none. Synchronous consensus reentry during a read coalesces into the same pending/running lane. Removing or replacing services before the due wake causes the next turn to use only current registry objects.
4. **Healthy nonpolling and typed exits.** An initialized ordinary follower/candidate without canonical held status receives no periodic retry and cannot enter cutover. Null/malformed/unclassifiable status is separately typed unavailable and event-driven, never folded into that healthy case. No-service, pre-origin, unmeasured-build, observation failure, cutover refusal, success, removal, timer-registration failure and stopped-owner cases match the decision table. A later real consensus event may enqueue one observation; only a fresh actual leader can proceed. Reports name the actual blocked partition/replica/cause and obey the existing 30000 ms signature throttle.
5. **Event pressure, lifetime and single-flight.** Fake-clock spans prove at most `floor(T / 1000) + 1` self turns per continuously held hosted partition, one pending key per hosted partition, at most four running attempts, and no stale map/report growth after removal. Real event bursts may nudge earlier but coalesce, do not bypass runtime not-before and do not create parallel cutover. A persistent hold remains typed for the hosted service lifetime instead of being converted into success or an invented deadline.
6. **Replacement and shutdown lifecycle fence.** The focused witness uses the actual handler shutdown path while `readParticipantReleaseFacts` is awaited and independently replaces a registered service during that await. Both prove zero OPEN mutation on the stale service, including the already-OPEN/idempotent branch, and exact `STALE` refusal. A different release ID against an otherwise current OPEN service also returns `STALE` but preserves that valid OPEN proof. The paired positive uses the same live service/facts and still resumes. Direct recovery shutdown unsubscribes, clears timer/pending/report state, awaits running tasks and permits no later retry.
7. **Current release safety.** Existing `test/partition/participant-release-protocol.test.js` and related release/admission witnesses retain origin, measured-build, exact member/generation/census, drain/query settlement and no-await final resume checks. Persistent fault stays typed and bounded. The real runtime witness retains the sibling partition's term, log, data and runtime generation assertions.
8. **Static and interaction proof.** Changed production files satisfy strict size, complexity, decision-boundary, literal, import-cycle, duplicate and unused-export checks without raising a baseline. Canonical metadata is regenerated once after final bytes freeze. Exact candidate and source-only revert use identical test bytes and locked-host treatment with no retry-green.

## Existing impact-contract extension

Extend the existing `raft-rs-runtime-application-transaction` contract and its coupled pair in `test/shards/impact-contracts.json`; do not create a parallel contract. Preserve its existing endpoint IDs `ready-persistence-and-reconstruction` and `application-and-progress-transaction`. The first continues to own durable runtime reconstruction/not-before behavior, and the second continues to own atomic application effects/progress. Add the two live interaction endpoints below to that same contract/pair:

| Endpoint ID | Exact live owners | Decision boundary |
| --- | --- | --- |
| `host-held-release-continuation` | `src/raft/raft-rs-runtime-owner.js`, `src/partition/partition-write-kernel.js`, `src/node/replica-handler-release-recovery.js`, `src/node/replica-handler-membership-relay.js` | Runtime produces typed held/current status; the write kernel supplies the sole held classifier; the existing handler queue retains one observation debt; tracked-service/consensus events are wakes without authority. |
| `participant-cutover-lifecycle-resume` | `src/node/replica-handler-participant-cutover.js`, `src/partition/partition-participant-release-facts.js`, `src/partition/partition-participant-release-contract.js`, `src/partition/partition-participant-transaction-pause.js`, `src/node/replica-runtime-cleanup-custody.js` | Canonical cutover owns census/drain/release; pause/resume owns the only OPEN mutation and checks handler/service/registry lifecycle; handler shutdown supplies the lifecycle fence while awaiting running recovery. |

The exact primary witnesses are `test/partition/partition-runtime-reconstruction-leadership.test.js` for physical durable reconstruction/replay and `test/node/replica-handler-release-recovery.test.js` for fixed cadence, ordered multi-service decisions, typed exits, pressure, replacement and actual shutdown. `test/partition/participant-release-protocol.test.js` remains a required regression witness for current cutover/admission safety rather than becoming a second primary scheduler test. The contract description and endpoint owners must encode the decision table above; no generated registry edit may substitute for the source and paired witnesses.

## Anticipated file boundary

Production candidate:

- `src/node/replica-handler-release-recovery.js`
- only if needed to keep that owner below a repository limit, one adjacent owner extraction under `src/node/`
- import only the existing `isHeldByHostFailure` from `src/partition/partition-write-kernel.js`; do not change its algorithm
- `src/partition/partition-participant-transaction-pause.js` for the canonical handler/service/registry lifecycle fence on both idempotent OPEN and final mutation

Proof candidate:

- `test/partition/partition-runtime-reconstruction-leadership.test.js`
- `test/node/replica-handler-release-recovery.test.js` for the exact fixed-cadence/ordered-decision/lifecycle/pressure controls above
- existing `test/partition/participant-release-protocol.test.js` and the current release regression cone, unchanged except where an existing lifecycle assertion must exercise the strengthened canonical owner
- the existing `raft-rs-runtime-application-transaction` impact contract/pair with the two endpoint additions above, then canonical generated shard metadata
- this Quest's receipt/evidence

## Exclusions

No election scheduler is started. No tick, proposal, operator release, pause reset or core handle is exposed to the release owner. No release state is inferred from the Raft log. No timeout or concurrency baseline is raised. This unit does not repair M1 provisioning, W1 unknown-phase recovery, C2 rebalancer ownership, FreshMG, snapshots, CDC, TX1 semantics or application startup policy. It does not claim full rs-raft cutover closure.
