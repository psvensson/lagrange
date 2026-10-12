---
audience: development
documentClass: proposal
---

# Participant release: model reduction (design re-evaluation, 2026-10-12)

Status: **proposed for independent design vet; no source change yet.**
Subject: the participant release protocol at the held source `14fac7d6`
(19 files, 4302 lines, absent from the reviewed candidate `10c2f0610`), its
fourteen design rounds (`design-participant-release-activation-authority-2026-10-11.md`),
and the owner rulings of 2026-10-11 (18:32 "complete authorization vs partial
observations", 20:32 "local HOLD plus owner-ordered invalidation and
revalidation"; recorded on this quest's log). Cutover ruling 11 applies: a
fifth iteration with the same mechanism means stop and re-evaluate the design.
This note is that re-evaluation. It follows the design-note template
(consumed surfaces, typed failure edges, cached-view audit, identity
anchoring) and the replica-membership reduction rule: name the minimal set of
facts and transitions, falsify the rest before adding a concept.

## 1. The falsifier: what the held source does on a fresh seed

Evidence: `evidence/activation-cycle-round11-retained/diagnostic.json` (the
`sql_transactions-p1` command log and final durable row at `14fac7d6`), the
unchanged production oracle log (`evidence/activation-retirement-reconstruction/pgwire-oracle.log.txt`),
and the source lines cited below. The live re-verification of this trace is a
separate evidence file (`activation-trace-14fac7d6.md`, in progress); claims
below are marked (T) where that run must confirm them.

The seed releases every partition serially under one 30 s deadline
(`bootstrap-service-seed-workflow.js:259-328`, `leadershipWaitTimeoutMs`),
control partition `sql_transactions-p1` first. Control-partition log:

| idx | command | cycle | what produced it |
| --- | --- | --- | --- |
| 2 | PAUSE | control's own | first attempt; followers lag the ENABLE entry so the final census answers `release_drain_pending` (`release-facts.js:65-70` requires applied=commit=last on every member); the attempt is refused and retried after 100 ms |
| 4-17 | RESERVE, 3×CLAIM, 3×SHARE, FINALIZE, DISPATCH, 3×RECEIPT, RESUME, CONFIRM | control's own (auth b24ae48e) | second attempt, PAUSE replayed by identity; control admission OPEN |
| 18-30 | RESERVE … CONFIRM | dependent #1 (auth 075bdebe) | the dependent's AUTHORIZE at the control leader (`replica-handler-participant-release.js:185-284`); SHARE on each control member overwrote that member's local CURRENT with the dependent's authorization (`:179-181` → `release-local-current.js:93-96`) (T) |
| 31 | RETIRE 075bdebe | — | dependent #2's attempt: `observeCurrentControlOwner` returned null (T: which check), so `releaseControlOwnerFirst` ran a FULL nested cutover of the control partition (`participant-cutover.js:250-291`); its first act is `raiseParticipantCutoverPause` + `retireParticipantReleaseBeforeReplacement` (`:585-602`), which retires whatever the control member's local CURRENT named: dependent #1's authorization |
| 32-45 | RESERVE … CONFIRM | control's own again (b24ae48e) | the nested control cutover re-ran the control's whole cycle (PAUSE replayed) and overwrote the slot that held dependent #1's CONFIRMED record |
| 46-58 | RESERVE … CONFIRM | dependent #2 (f1aa6015) | — |
| 59 | RETIRE f1aa6015 | — | dependent #3's attempt, same nested path; slot → RETIRED(f1aa6015) |
| 60-278 | RETIRE b24ae48e ×219, all STALE | — | the nested control cutover's `reconstructDurableRetirement` (`lifecycle-retirement.js:58-90`) derived an obligation from the control's own RESUME record (b24ae48e) because the admission generation had moved; `applyRetire` answers STALE (`release-apply.js:398-404`: existing RETIRED(f1aa6015) ≠ CONFIRMED and a different id); the helper throws, every retry (100 ms) repeats it until the deadline |

Outcome: `Seed participant release failed` for the third dependent, after
~30 s, with the control partition's admission re-closed twice along the way.

### Defects, each named by the rule it breaks

- **F1 one slot, many cycles.** The control partition keeps ONE control record for its own release and for every dependent's release (`_partition_write_generation.participant_release_control_text`, `transaction-store.js:114-124,168-177`). A dependent's RESERVE overwrites the control's own CONFIRMED record; a RETIRED record of cycle X refuses a RETIRE of cycle Y; a RESERVED record of an interrupted cycle refuses every later RESERVE (`release-apply.js:152-163,398-404`). R07 (outcome inferred from a slot state that belongs to another cycle), R14 (a retry cannot be replayed).
- **F2 one projection, two meanings.** The control member's local CURRENT means both "my own admission authorization" (published at RESUME, `participant-release.js:307-308`) and "I vouched for dependent X" (published at SHARE, `:179-181`). Retirement acts on whichever was last. R01.
- **F3 an attempt changes what it proves.** Every attempt starts with `raiseParticipantCutoverPause` (`participant-cutover.js:590`), which on an OPEN service creates a NEW admission generation and moves CURRENT into a retirement obligation (`transaction-pause.js:22-41`, `release-local-current.js:102-112`), then `retireParticipantReleaseBeforeReplacement` (`:601`). Target entries embed `admissionGeneration` (`release-command.js:46-50`), so the retry's RESERVE never matches the previous one (`release-request.js:69-78,106-114`) and every retry is a new cycle. R14; cutover ruling 11 (the mechanism the fourteen rounds kept patching).
- **F4 two execution paths for the control release.** A dependent's attempt re-runs the control partition's complete cutover whenever `observeCurrentControlOwner` cannot observe a settled state (`participant-cutover.js:265-275,293-322`): the control partition is paused again for every dependent. R11; and a liveness hazard on the one partition every transaction needs.
- **F5 drain conflated with catch-up.** `isReleaseDrained` (`release-facts.js:65-70`) requires `appliedIndex === commitIndex === lastIndex` on every member, so the protocol's own entries (ORIGIN, PAUSE) fail its census on followers that have not applied them yet. R07 (two states, one name). The owner already accepted "post-ENABLE catch-up stays inside the same attempt" (round 11).
- **F6 one wait budget for N partitions.** `releaseSeedParticipantCohorts` runs every partition under the single seed deadline; a 45-partition seed cannot fit N×(control re-cycle + own cycle) in 30 s. Spent-wait class (certification rule: any spent wait fails).
- **F7 no idempotent observation.** A partition that is already OPEN with a valid durable authorization for the current release identity is re-paused by any new request (restart, recovery wake, duplicate seed call): `runCutoverAttempt` has no "already released" answer. R14.

None of these is a local problem: every one is a missing owner or a duplicated authority.

## 2. The reduced model

Facts (durable, per partition, already owned by `partition-participant-transaction-store.js` unless marked NEW):

1. **Origin** `(originIndex, originTerm)` — the applied generation-origin command (`:108-112`). Unchanged.
2. **Pause** `(pauseGeneration, pauseEntryId)` — advanced only by a committed PAUSE apply (`:143-158`). Unchanged. An attempt never advances it merely by starting.
3. **Dependent authorization record** (the RESUME record: dependent release identity, control partition, control authorization id/revision, target entries, target configuration, expectedPauseGeneration, commit position; `:186-196`, `release-apply.js:475-522`). Unchanged shape. It is THE persisted authorization decision that "may remain valid across restart" (owner 18:32).
4. **Authorization cycles in the control partition — NEW, replaces the single control slot.** Table `_participant_release_cycles (dependent_partition_id TEXT PRIMARY KEY, cycle_generation INTEGER, revision INTEGER, state TEXT, record_text TEXT)` created by the store's open hook like the other tables (`:67-83`), DDL idempotent on every replica. `record_text` carries what the slot carried today (authorization id, release/target/configuration texts, deadline, receipts, commit positions, retirement). At most one non-terminal cycle per dependent; different dependents never share a row. States: `RESERVED → AUTHORIZED → CONFIRMED` (terminal success) and `RETIRED` (terminal end) from any of them. `cycle_generation` is monotonic per dependent and is the cycle identity; `authorizationId` stays the content hash `H(root, releaseId)` but is no longer a key.

Volatile (per service, process-local, derived):

5. **Admission** `CLOSED | OPEN(proof)` (`transaction-pause.js`). OPEN is derived from fact 3 plus the current incarnation facts (`resumeParticipantCutoverAdmission`, `:66-132`); it is never an authority (R10). Invalidated by a lifecycle/connection/term change (`:51-64`) and by a committed PAUSE apply.
6. **Own current authorization** — published ONLY by this service's own RESUME (fact 3 applied here). The SHARE publication is deleted (F2).
7. **Retirement obligation** — created only when fact 6 is invalidated (local HOLD), keyed by `(dependent, cycle_generation, target)`; carried by the recovery owner to the control leader as a target retirement. Unchanged owner, narrowed key.

Transitions (the only ways the facts change), all through existing owners:

- **Observe (NEW first step of every attempt, idempotent).** Read fact 3 and the current facts. If the record's release identity equals the identity computed now (`release-identity.js:149-157` over current committed membership and build), its targets equal the current population, and the control leader reports cycle `(dependent, gen)` CONFIRMED with the same authorization id/revision: if admission is OPEN with a matching proof answer `CUT_OVER(replayed)`; if CLOSED, re-derive OPEN locally through the existing `resumeParticipantCutoverAdmission` predicate from a request reconstructed from fact 3 (this IS the restart path; no PAUSE, RESERVE or RETIRE). Any mismatch is a typed reason (section 4) that selects the next transition; it never clears a record.
- **Control first, by consumption (F4).** A dependent asks the control leader (INSPECT) for the control's own CONFIRMED cycle under the control's current release identity. Absent or stale ⇒ typed `control_release_pending` with `retryAfterMs`; the control partition's own recovery owner (`replica-handler-release-recovery.js`) is enqueued and runs the control release on its own single path. A dependent NEVER runs the control's cutover.
- **One cycle per dependent (F1, F3).** Attempt = PAUSE (replay by identity when the durable pause entry already exists) → accepted-work drain → reopen of legacy-served connections (unchanged, `participant-release.js:98-127`) → settle query rows (control only, unchanged) → ENABLE/origin (unchanged) → catch-up wait (section 2, F5) → RESERVE at the control leader for `(dependent, gen)` → FINALIZE → RESUME on each target (unchanged RESUME apply, binds `expectedPauseGeneration`) → RECEIPT per target → CONFIRM. A retry under the same incarnations replays the same cycle by identity (same release id, same targets, same pause entry ⇒ same command bytes); it does not start a cycle, retire anything, or bump a generation.
- **Supersession (F1).** A new cycle for a dependent is reserved only against the exact prior row `(gen, revision, terminal state)`; the control leader first orders `RETIRE(dependent, gen, reason)` when the prior cycle is non-terminal and cannot complete (its recorded targets are not the current population, or its release identity is no longer current) — a request-path decision from live facts, committed as a command whose apply checks only the row and the command bytes. The next RESERVE carries the retired predecessor coordinates; apply refuses if the row moved (`expected_revision_changed`). This is round 11's cycle predecessor, with the cycle keyed by dependent instead of by one global slot, which is why no "history id" or "terminal exclusion" concept is needed.
- **Retirement by the lifecycle owner (F2, owner 20:32).** A member that invalidates its own OPEN admission records obligation 7 and the recovery owner carries `RETIRE(dependent, gen, target)` to the control leader; apply marks that target's receipt RETIRED (cycle stays CONFIRMED for the other targets; a successor target of the same replica identity needs a new cycle). A controlled replacement (`reopenReplica`, shutdown, successor publication) waits for that committed result before publishing, exactly as today's `retireParticipantReleaseBeforeReplacement` does — but it is called ONLY on those paths, never at attempt start. The finalization/confirmation apply predicates remain deterministic over the row and the command bytes (both orderings of `RETIRE` vs `FINALIZE/CONFIRM` keep their current witnesses).
- **Drain vs catch-up (F5).** `isReleaseDrained` counts accepted application work only (`legacyActive`, `legacyPrepared`, `sqliteTransactionOpen`, `participantStaging`, `participantPrepared`). Raft catch-up (`appliedIndex === commitIndex === lastIndex`, and the protocol's own `proposals`/`pendingOutcomes`) is a separate named state `catch_up_pending` that the attempt waits out inside its own deadline (poll `POLL_INTERVAL_MS`), as the accepted round-11 clause says.
- **Budget (F6).** The seed releases the control partition first, then dependents concurrently through the recovery owner's existing bound (`MAX_CONCURRENT_ATTEMPTS = 4`), each attempt under `DRAIN_DEADLINE_MS`; the REGISTRATION checkpoint is resumable because Observe answers already-released partitions without commands. The seed's wait is bounded by the slowest partition, not the sum.

What is deleted: CLAIM/SHARE commands and the member-claims/member-shares record fields (the control members' vouch duplicates the Raft commit of FINALIZE under the committed configuration, which `commandConfigurationMatchesCommitted` already binds, `release-apply.js:58-63`); DISPATCH as a separate state (AUTHORIZED already is "may resume"; keep the dispatch-admission fence at the native dispatch boundary, `release-dispatch-admission.js`); the attempt-start retirement; the nested control cutover; the single slot and its RETIRED-same-id guard; `reconstructDurableRetirement` as an attempt-start action (it stays as the restart reconstruction inside the lifecycle owner's replacement path). Expected net: fewer than half of the 4302 lines remain.

## 3. Consumed surfaces (cite or it does not exist)

| Surface | Citation at 14fac7d6 | Used for |
| --- | --- | --- |
| store open hook, generation row, pause apply, authorization apply, control CAS | `src/partition/partition-participant-transaction-store.js:67-83,131-133,143-158,168-177,186-196` | facts 1-4; the NEW table is created by the same hook |
| committed command admission by origin | `src/partition/partition-committed-command-admission.js` via `release-request.js:35-39` | release commands bypass the pause (PARTICIPANT_RELEASE_OWNER) |
| raft write commit path | `src/partition/partition-service-raft-write-commit.js:442` (`pausedWriteAnswerOf`) and `startPartitionRaftWriteCommit` | all proposals; write-time pause |
| facts read (membership witness, status, build, rowid, work, query census) | `src/partition/partition-participant-release-facts.js:89-120` | census; unchanged except the drain/catch-up split |
| release identity | `src/partition/partition-participant-release-identity.js:149-163` | fact 3 and cycle binding |
| committed configuration at apply | `committed.committedConfiguration`, consumed at `release-apply.js:58-63` | FINALIZE/RESUME bind the configuration |
| local admission predicate | `src/partition/partition-participant-transaction-pause.js:66-132` | Observe (restart re-derivation) and RESUME |
| recovery owner (wakes, bound, single-flight per partition) | `src/node/replica-handler-release-recovery.js:16-133`; `participant-cutover.js:763-794` (`RUNS`) | drives control-first and retirements; concurrency bound |
| client route and NOT_LEADER redirect | `src/node/participant-release-client.js:34-70` | unchanged |
| seed driver | `src/bootstrap/bootstrap-service-seed-workflow.js:259-328,387-427` | budget change (F6) |
| create driver | `src/node/replica-handler-create-methods.js:413` → `release-recovery.js:136-173` | unchanged entry; benefits from Observe |
| authorization owner (seed/create/operator roots) | `src/node/participant-release-authorization-owner.js` | root authorization ids; unchanged |
| enable/origin | `src/partition/partition-participant-transaction-request.js:636-673` | unchanged |
| query settlement (control only) | `src/query/distributed/distributed-transaction-release-settlement.js`, `-release-census.js` | unchanged |

Surfaces this design must CREATE: the `_participant_release_cycles` table and its CAS helper (store), the `Observe` step, the `control_release_pending` and `catch_up_pending` outcomes, the cycle-keyed RESERVE/FINALIZE/RETIRE command bodies.

## 4. Typed failure edges

| Edge | Typed outcome | Fails closed? | Caller observes |
| --- | --- | --- | --- |
| no durable authorization record, no origin, no root authority | `release_operator_required` (existing) | yes | seed/create driver refuses; operator path |
| record present, release identity changed (configuration/membership/build) | `release_generation_changed` + reason `release_identity_changed` | yes (stays CLOSED) | new cycle after supersession |
| record present, this replica's target generation ≠ current | `release_generation_changed` + reason `target_generation_changed` | yes | lifecycle owner orders target retirement; new cycle |
| record present and current, control cycle CONFIRMED, admission CLOSED | `resumed` after local re-derivation | n/a | `CUT_OVER(replayed)` |
| control's own cycle absent/non-terminal for a dependent | `control_release_pending` (NEW), retryAfterMs | yes | control recovery enqueued; dependent waits under its own deadline |
| prior non-terminal cycle whose targets are not the current population | `RETIRE(reason=population_changed)` then RESERVE(gen+1) | yes until committed | typed in the answer |
| prior cycle row moved between read and apply | `expected_revision_changed` (STALE) | yes | replay from the row |
| accepted application work present | `release_drain_pending` | yes | retry inside attempt |
| members behind commit/apply | `catch_up_pending` (NEW) | yes | waited inside attempt |
| member unavailable / no reply | `release_fact_unavailable` with `missingFact` (existing) | yes | retry; recovery wake |
| attempt deadline spent | `release_fact_unavailable` + `release_deadline` (existing) | yes | driver's bound; cycle row remains; next attempt replays |
| apply of FINALIZE/CONFIRM after a committed RETIRE of a target | `STALE` on every replica (deterministic) | yes | no authorization |
| committed FINALIZE before RETIRE | authorization recorded; retirement marks the target; future use refused | yes | both orderings witnessed |
| duplicate request in flight for the partition | `different_release_request_in_flight` (existing) | yes | — |

## 5. Cached-view audit

| View | Invalidated by | Stale at the read site means | Why it cannot reopen a closed path |
| --- | --- | --- | --- |
| ADMISSIONS (OPEN proof) | lifecycle/connection/term/configuration change (`transaction-pause.js:51-64`); committed PAUSE apply | write-time check re-derives against `raft.readStatus()` on every mutation (`:43-49`) | OPEN is never consulted by a committed predicate; a committed PAUSE closes it on apply |
| own CURRENT authorization | the same invalidation; RESUME republishes | dispatch fence refuses FINALIZE/CONFIRM for a non-current authorization (`release-dispatch-admission.js:59-75`) | the committed predicate sees only the row |
| retirement obligation | committed RETIRE result (clear) | obligation retained; recovery re-drives | typed terminal answer (`already retired`) is success, absence of the cycle row is `INVALID` and keeps the obligation |
| control INSPECT answer used by Observe/control-first | none (it is a read); every mutation revalidates at apply | a stale "CONFIRMED" leads to a RESUME whose apply binds `expectedPauseGeneration` and the configuration (`release-apply.js:491-498`) | STALE on apply, no effect |
| census (facts of each member) | none; re-read before each decision command | commands bind what they captured; apply checks the row and the committed configuration | a stale census yields STALE, never an opening |
| single-flight RUNS map | promise settlement | a concurrent identical request shares the promise; a different one is refused | — |

## 6. Identity anchoring

| Artifact | Anchors | Source |
| --- | --- | --- |
| release identity (`releaseId`) | partitionId, protocolVersion, targetBuildDigest, configurationKey, membershipGenerationIndex | `release-identity.js:149-157` from committed membership + measured build |
| cycle | `(dependent_partition_id, cycle_generation)`, predecessor `(gen-1, revision, terminal state)` | control row (NEW table) |
| authorization id | `H(rootAuthorizationId, releaseId)` | `participant-cutover.js:324-327`; root from the authorization owner |
| target entry | replicaIdentity, peerId, nodeId, ownerIncarnation, lifecycleIncarnation, runtimeGeneration, connectionGeneration, admissionGeneration, buildDigest | `release-command.js:46-85` |
| RESUME record | release identity, control authorization id/revision, targets, configuration, expectedPauseGeneration, commit index/term | `release-apply.js:499-512` |
| retirement | `(dependent, gen, target)` + `H(authorizationId, target)` | lifecycle owner |

When an anchor moves mid-operation: configuration or membership generation ⇒ every in-flight command answers STALE at apply and the attempt observes `release_identity_changed`; a member's generation ⇒ that member's RESUME/RECEIPT is STALE and its target is retired; the leader's term ⇒ `current_runtime_attempt` STALE (existing, `participant-release.js:410-418`). An admission generation moves only on a committed PAUSE apply or a local HOLD, never because an attempt started.

## 7. Owner contract mapping (2026-10-11 20:32)

| Boundary (owner) | Where in the reduced model |
| --- | --- |
| disconnect observed ⇒ close local admission, invalidate local observation, wake recovery; reconnect never restores | `transaction-pause.js` invalidation + obligation 7 + recovery enqueue (unchanged mechanism, narrowed key) |
| before dispatch ⇒ refuse an invalidated candidate, including queued work | dispatch fence (`release-dispatch-admission.js`), unchanged |
| unresolved proposal ⇒ keep identity, recover result | cycle row per dependent; replay by identity; no new identity from timeout |
| committed finalization ⇒ predicate on replicated state | `release-apply.js` FINALIZE/CONFIRM/RESUME apply, unchanged inputs |
| complete authorization applied before a later retirement ⇒ preserved | receipt-level RETIRED; CONFIRMED cycle stays historical |
| successor publishes only after ordered retirement result | `reopenReplica` / lifecycle replacement path keeps `retireParticipantReleaseBeforeReplacement` |

And 18:32: the persisted decision (fact 3) survives restart; incarnation observations (facts 5-6) are re-derived; registration writes run after the dependents are OPEN under their own authorization (the seed phase order is unchanged); recovery work that runs while CLOSED is inventoried in `startup-admission-census.md` (in progress) and must not be a participant write.

## 8. Witnesses (red at 14fac7d6 where marked)

- **W-A** the unchanged production oracle `test/integration/pgwire-command-tag-real-engine.integration.test.js` green on the exact candidate (RED today).
- **W-B** fresh seed, 3-replica control + 2 dependents: the control log is exactly PAUSE, ORIGIN, RESERVE, FINALIZE, 3×RESUME, 3×RECEIPT, CONFIRM, then per dependent RESERVE…CONFIRM on its own row; zero RETIRE, zero second control PAUSE (RED: idx 31, 32, 59, 60-278).
- **W-C** interruption at every command boundary (fault injection, 8 points) then a retried attempt under the same incarnations: the retry replays the same cycle; cycles per dependent = 1 (RED: F3).
- **W-D** restart with existing storage: no PAUSE/RESERVE/RETIRE; admission re-derived from fact 3 after revalidation. Variant: one replica wiped and recreated ⇒ its old record names a different generation ⇒ local resume refused (old-incarnation refusal holds), target retired, new cycle gen+1 (the existing `changed-incarnation restart` test at `participant-release-protocol.test.js:282` adapted).
- **W-E** both orderings of RETIRE vs FINALIZE/CONFIRM (existing tests `:369,:395,:419,:457,:491` adapted to cycle keys).
- **W-F** releasing N dependents appends no PAUSE to the control partition after its own release; a client transaction on `sql_transactions` during dependents' release succeeds (RED).
- **W-G** a follower lagging by the ORIGIN entry yields `catch_up_pending` inside the attempt and the attempt completes without a retry cycle (RED: idx 2 refusal).
- **W-H** the seed REGISTRATION step with the oracle's partition count completes inside the per-attempt bound, measured locally and on a lab host; with 45 partitions on the lab host (measurement, not a budget raise).
- **W-I** (next increment, CDC lane) restart delivery of an existing CDC event without another write.

## 9. Implementation order (one increment, reviewed as one)

1. Store: `_participant_release_cycles` + CAS; cycle-keyed RESERVE/FINALIZE/RETIRE/RECEIPT/CONFIRM bodies and apply; delete CLAIM/SHARE/DISPATCH.
2. Attempt: Observe first; control-first by consumption; no attempt-start pause/retirement; drain vs catch-up; typed new outcomes.
3. Lifecycle: retirement keyed by cycle and target; `retireParticipantReleaseBeforeReplacement` only on replacement paths.
4. Drivers: seed concurrency + per-attempt bound; create driver unchanged.
5. Witnesses W-B..W-G rewritten through the existing fixture (`test/test-helpers/participant-transaction-fixture.js`), superseded tests retired through a reviewed map (no silent deletion); W-A; generated metadata through producers; W-H measurement.

Independent verification bar: admission-gating, recovery-replay, concurrency-serialization, formation-circularity templates; the design-note refutation categories for this note.
