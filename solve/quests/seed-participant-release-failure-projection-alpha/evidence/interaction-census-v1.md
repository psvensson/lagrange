# Seed participant release interaction census v1

## Binding and limits

This read-only census binds to Git `a3b5c63451c3cf968b3d7ec807a0381261d4b61f`. It traces the existing release owners and the startup ordering relevant to the observed seed failures. It does not select a repair, add a fast path, or infer a root cause from the currently preserved failures. In particular, varying dependent-partition `DRAIN_PENDING` answers and one outer `current_control_owner_fact` answer do not identify which accepted-work owner, query census, nested control result, generation transition, or join produced the terminal failure.

## Release call graph and repeated control release

The seed workflow obtains a measured build, sorts `SQL_TRANSACTIONS` first, creates one shared deadline, and serially calls `requestParticipantRelease` for every hosted service. It retries only when the returned answer supplies the existing retry semantics, and it throws the actual terminal answer otherwise (`src/bootstrap/bootstrap-service-seed-workflow.js:255-298`). This runs at the registration-ready checkpoint after the bootstrap SQL engine and `ReplicaHandler` exist, and before the registration phase is executed (`src/bootstrap/bootstrap-service-seed-workflow.js:345-363`).

`requestParticipantRelease` shapes the transport timeout from the caller's deadline, delivers to the named node, and performs at most one canonical leader redirect (`src/node/participant-release-client.js:21-64`). The registered lifecycle route dispatches `RELEASE` to `runParticipantCutover` even during bootstrap (`src/node/replica-handler-lifecycle-methods.js:129-145`). `runParticipantCutover` is a handler-and-partition single flight: a same-build caller joins the exact promise; a mixed-build caller gets `INVALID`; the starter removes the record in `finally` (`src/node/replica-handler-participant-cutover.js:302-320`).

For a dependent partition, one cutover attempt invokes `releaseControlOwnerFirst` before raising the dependent pause (`src/node/replica-handler-participant-cutover.js:224-228`). If the attempt reaches a clean final census, it invokes the same owner again immediately before resuming the dependent cohort (`src/node/replica-handler-participant-cutover.js:278-299`). The control owner is skipped only when the partition being released is itself `SQL_TRANSACTIONS`; otherwise it locates the current local or topology control leader, derives the allowed control authorization, and calls the full `requestParticipantRelease` path for the `SQL_TRANSACTIONS` partition (`src/node/replica-handler-participant-cutover.js:138-168`). It accepts only a complete current `CUT_OVER` answer with the exact build, release identity, nonempty current census, applied origins, clean connections, and enforced query schema (`src/node/replica-handler-participant-cutover.js:124-135`).

Consequently, the same control cohort is requested as follows:

1. The seed loop releases `SQL_TRANSACTIONS` first. A retry is another full control attempt, subject to the control partition's single flight.
2. Every dependent-partition attempt requests a full control release once before the dependent is paused.
3. A dependent attempt that reaches its final pre-resume boundary requests a second full control release.
4. A retry of that dependent repeats the applicable control requests. Concurrent same-build requests join the current control promise; after that promise settles, a later request starts another full attempt.

There is no control-specific recursion because the control partition skips `releaseControlOwnerFirst`. There is also no existing OPEN-admission shortcut in `releaseControlOwnerFirst`. Fresh-seed and operator authorizations can derive a control token; fresh-create authorization cannot (`src/node/participant-release-authorization-owner.js:26-64`). An already-originated control partition can still be released without a fresh-create-derived control token because the cutover authority check is required only when the write origin is absent (`src/node/replica-handler-participant-cutover.js:216-223`).

An invalid nested control answer is projected outward as `UNAVAILABLE/current_control_owner_fact` with the control partition, node, and outcome only (`src/node/replica-handler-participant-cutover.js:159-167`). The current outer answer therefore cannot establish the nested missing fact, query state, blocked work, generation change, or join history.

## Canonical OPEN proof and invalidation

`partition-participant-transaction-pause.js` is the canonical admission owner. Its module-owned `WeakMap` is keyed by the exact `PartitionService` object; a previously unseen service begins CLOSED with a new admission generation (`src/partition/partition-participant-transaction-pause.js:13-30`). A successful resume stores one OPEN proof containing the release ID and current term, leader, configuration, membership generation, runtime generation, and lifecycle incarnation (`src/partition/partition-participant-transaction-pause.js:75-104`).

The current consumers are:

- every admitted partition write through `pausedWriteAnswerOf` (`src/partition/partition-service-raft-write-commit.js:441-457`);
- participant `BEGIN` admission (`src/partition/partition-participant-transaction-request.js:255-276`);
- the unreplicated local-mutation fence (`src/partition/partition-local-mutation-admission.js:20-31`);
- release facts, which expose the admission generation and paused state (`src/partition/partition-participant-release-facts.js:68-74,100-112`);
- existing-origin recovery, which invalidates from current status and returns without another release when the proof remains OPEN (`src/node/replica-handler-release-recovery.js:185-212`).

Every synchronous mutation lookup revalidates the proof. A changed term, leader, configuration key, membership generation, runtime generation, or lifecycle incarnation closes it (`src/partition/partition-participant-transaction-pause.js:33-55`). A service replacement has a different WeakMap key and starts CLOSED. Shutdown or loss of the exact registry object prevents resume and keeps or raises CLOSED (`src/partition/partition-participant-transaction-pause.js:58-67,75-104`). A wrong release ID against a still-current OPEN proof returns `STALE` without revoking that proof (`src/partition/partition-participant-transaction-pause.js:78-85`). Connection generation is present in release facts, but it is not a direct field of the OPEN proof; replacement/lifecycle identity plus the complete facts and census checks are the surrounding protection, so connection generation should not be described as a direct OPEN invalidator.

The dependent and control cutover paths deliberately call PAUSE again. A transition from OPEN to PAUSED allocates a new admission generation (`src/partition/partition-participant-transaction-pause.js:16-30`), and PAUSE is applied to each exact cohort member after its facts and attempt identity are checked (`src/node/replica-handler-participant-release.js:82-123`). Thus a stable, valid control OPEN proof is canonical for mutation/recovery admission, but it does not prevent a later dependent release from closing and reproving the control cohort.

## Accepted work that can remain after PAUSE

The canonical accepted-work vector is read from current owners: SQLite transaction-open state, volatile participant staging, durable prepared participants, proposal queue size, pending write outcomes, and applied/commit/last indexes (`src/partition/partition-participant-release-facts.js:46-65`). PAUSE prevents new ordinary admitted writes, new participant `BEGIN`, and new unreplicated local mutations through the consumers above. It does not cancel or complete already accepted work.

After PAUSE, work can therefore remain under its existing owner:

- proposals and pending write outcomes remain owned by the Raft write/commit path until apply, refusal, leadership loss, deadline, or shutdown; a pending outcome is removed only as its promise settles (`src/partition/partition-service-cdc-stream-base.js:357-375`);
- a volatile participant session remains until its operation, expiry owner, demotion, or shutdown resolves it; expiry does not discard an in-flight session, and durable PREPARED rows are reported rather than erased (`src/partition/partition-participant-transaction-session.js:158-205`);
- demotion discards volatile staging through the lifecycle owner (`src/partition/partition-service-raft-lifecycle-wiring.js:38-50`);
- an open SQLite transaction must be closed by its transaction owner;
- an applied/commit/last-index gap must be closed by consensus persistence and application.

The leader reads a first census before sending PAUSE to the cohort, then uses the returned post-PAUSE facts (`src/node/replica-handler-participant-cutover.js:229-257`). Work can be admitted before a member processes PAUSE; after PAUSE, that accepted work is intentionally visible as `DRAIN_PENDING`. The release path observes and refuses; it is not a second drain algorithm.

## Query census and release-time settlement

Only the `SQL_TRANSACTIONS` service contributes `queryCensus` to release facts (`src/partition/partition-participant-release-facts.js:100-112`). The query census is separate from the accepted-work vector. It reports schema enforcement and exact transaction rows as `CLEAR`, `HELD`, `UNAVAILABLE`, or `EMPTY_LEGACY_SCHEMA`, including a row-generation digest and legacy/recoverable transaction IDs (`src/query/distributed/distributed-transaction-release-census.js:20-62`). A control cohort can therefore be accepted-work drained while its query census is still HELD or unavailable.

When the control query census is HELD, the existing release settlement owner reads current coordinator authority, may freeze and record a decision through the control service, redrives participant COMMIT/ROLLBACK through the normal transaction wire, records coordinator progress, rereads authority, and produces an invocation-bound proof (`src/query/distributed/distributed-transaction-release-settlement.js:93-219`). The cutover then rereads the cohort and validates the final proof/census before resume (`src/node/replica-handler-participant-cutover.js:261-292`). This is existing correctness work and can create current committed/application work during the control release. The present outer `current_control_owner_fact` projection is insufficient to establish that query settlement was engaged or blocked.

## Startup ordering and background work

Partition services and their deferred elections are started before seed release (`src/bootstrap/phases/seed-partitions-phase.js:175-202,392-463`). The early SQL engine exists and is attached to bootstrap CDC, but it is constructed with migration auto-wiring and distributed-transaction recovery auto-start disabled (`src/bootstrap/owners/seed-runtime-bridge-owner.js:46-66`). The steady-state runtime handoff activates distributed transaction recovery later (`src/bootstrap/shared/startup-sql-runtime-handoff.js:188-207`), and control-plane background writers plus latency topology lifecycle are activated only when bootstrap completes (`src/bootstrap/bootstrap-service-seed-workflow.js:195-220`). Registration phase work also follows `releaseSeedParticipantCohorts` (`src/bootstrap/bootstrap-service-seed-workflow.js:345-363`).

This ordering excludes those later steady-state owners as assumed causes of an already-failing seed release. It does not prove the release is quiescent: elections, consensus/application progress from partition formation, generation-origin ENABLE, and release-time query settlement are live. `enableParticipantTransactionAdmission` is idempotent when the origin already exists; otherwise it proposes the canonical generation-origin command through the normal write owner (`src/partition/partition-participant-transaction-request.js:690-726`). Attribution requires the blocked work and generation from the measured attempt.

## Fresh-create, operator, recovery, shutdown, and generation changes

Fresh-create release runs after voter readiness and before ACTIVE publication (`src/node/replica-handler-create-methods.js:391-426`). It uses exact materialized create-admission authority and the operation deadline, retrying only through the existing typed policy (`src/node/replica-handler-release-recovery.js:251-284`). Operator release validates its supplied deadline, issues the existing operator token, and sends one canonical request (`src/node/replica-handler-release-recovery.js:285-293`). Both flow through the same cutover and control-owner interactions; neither owns an alternate release algorithm.

Existing-origin recovery is event/timer driven. Service changes enqueue the affected partition and consensus events invalidate its admission proof before enqueue (`src/node/replica-handler-release-recovery.js:239-249`). Reconciliation prefers the first hosted leader, preserves event-driven ordinary-follower behavior, treats HELD/no-leader status as timed debt, and only runs a full existing-origin cutover when current OPEN proof is absent (`src/node/replica-handler-release-recovery.js:185-235`).

Handler shutdown marks the handler shutting down before awaiting release recovery and service shutdown (`src/node/replica-runtime-cleanup-custody.js:82-125`). Recovery cancels its subscriptions/timer, clears pending/reporting state, and joins running attempts (`src/node/replica-handler-release-recovery.js:295-304`). Partition shutdown marks the service shutdown before closing consensus and mutation resources (`src/partition/partition-service-lifecycle-methods.js:159-227`). Resume rechecks handler, service, and exact registry identity after awaited facts and immediately before mutation; an old attempt cannot reopen a replaced or shutting-down service (`src/partition/partition-participant-transaction-pause.js:58-104`).

Release facts bind node/owner/replica/lifecycle/runtime/connection/admission generations (`src/partition/partition-participant-release-facts.js:68-82`). A cutover attempt also binds term, leader replica, and leader lifecycle, while release identity binds partition, target build, configuration, and membership generation (`src/node/replica-handler-participant-cutover.js:229-239`). Any such movement can produce a typed stale/unavailable answer or invalidate admission; it is a safety boundary, not permission to reuse an older observation.

## Candidate mechanisms: hypotheses only

1. **Repeated control reproving.** Serial dependent releases repeatedly close and reprove the same control cohort. A dependent retry repeats that work, while an overlap joins the current single flight. This may expose a prior control attempt or work created during control release, but current logs do not prove it.
2. **Pre-PAUSE admission window.** Work accepted before a member processes PAUSE can appear in its post-PAUSE census. The exact nonzero work field and generation are required before attributing a failure.
3. **Generation-origin proposal.** The first pre-origin release can create the canonical origin proposal and pending outcome; final census is designed to wait/refuse until it settles. This could be a transient `DRAIN_PENDING`, but the observed partition/work is not yet bound.
4. **Query settlement work.** A HELD control query census can redrive coordinator and participant decisions during release. The outer control answer currently drops the evidence needed to tell whether that path engaged.
5. **Consensus/application lag.** Election or formation work can leave proposals, pending outcomes, or an applied/commit/last gap. The present `DRAIN_PENDING` name alone does not distinguish these owners.
6. **Generation movement or replacement.** Term, leader, membership, runtime, lifecycle, connection, or service identity movement can stale an attempt or close an OPEN proof. Current terminal answers do not establish which movement occurred.
7. **Late background-owner attribution is unlikely from source order, not disproved.** Full distributed recovery, registration work, and steady-state background writers are scheduled after the seed release. Any claim that one ran early needs an actual call/trace rather than the failure timing.
8. **Shutdown overlap.** Shutdown closes admission and suppresses recovery; it would ordinarily manifest as stale/unavailable/lifecycle evidence rather than explain every startup `DRAIN_PENDING`. It remains an explicit lifecycle question if failure overlaps teardown.

## Source-bound diagnostic questions

- Which exact partition and generation produced the first blocked drain, and which work field was nonzero or which index equality failed?
- Was that partition the control cohort or the dependent cohort?
- Did the call join an older same-build attempt? If so, what was the original trigger and bounded join age?
- Did a first blocked observation survive while later retries ended at the shared seed deadline?
- For `current_control_owner_fact`, what was the lower control outcome, and was query census CLEAR, HELD, or UNAVAILABLE? The present outer projection cannot answer the nested cause.
- Was write origin absent before ENABLE, and did the generation-origin proposal account for the observed proposal or pending outcome?
- What were the admission generation and OPEN/CLOSED state before and after each nested control release?
- Did term, configuration, membership generation, runtime generation, lifecycle incarnation, connection generation, or exact hosted service change during the attempt?
- If a proposal or pending outcome remained, which current write/application owner created and eventually settled it?
- Did any supposedly post-release startup writer actually execute before the failure, contrary to the source ordering above?
- Did handler shutdown, service shutdown, or replacement overlap the attempt?

These questions preserve the authority boundary: only current facts and release owners may decide admission or perform cutover. Diagnostic history can identify what was observed, but cannot become permission, cached admission, retry policy, or a second release path.
