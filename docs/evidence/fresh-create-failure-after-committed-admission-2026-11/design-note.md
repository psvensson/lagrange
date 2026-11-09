---
audience: evidence
recorded: 2026-11-02
quest: fresh-create-failure-after-committed-admission
status: proposal awaiting lead decision (no src/ change made)
---

# Design note: fresh create failure after committed admission

Format: `docs/development/verification-templates/design-note-template.md`. The chain, timestamps and file:line references
are in `first-divergence-2026-11-02.md` (same directory). Line numbers refer to HEAD `df28ef54a`, whose `src/` is
identical to the run's `b26d2c090`.

## Claim, scope and current evidence

**Invariant.** A replica admitted into a committed Raft configuration is a retained obligation. No unavailability may
turn it into a terminal failure that leaves the configured member without a runtime, without a removal owner, and
blocking every participant release of its partition. A participant release whose committed cohort contains such a
member ends in a typed answer that names its reconsideration event. The answer is never a silent re-drive.

**Failing witness.** Run b26d2c090 at 10:29:57.228. `sql_transactions-p1-r4` was admitted and its promotion proof
granted. A 110-170 ms readiness-projection routing refusal on the `replica_operations` authority read then made it
FAILED, fenced and unowned. From 10:31:13 the control release of `sql_transactions-p1` answers `hosted_replica`
forever. 23 creates fail behind it, and the serve lane never opens.

**Interaction.** This is the fresh CREATE of a priority-partition replica on a joiner: `CREATE_REPLICA`, then the
learner, then the committed ADD, then the promotion proof, then voter-ready, then `releaseFreshCreate` (authority read,
control-first release), then ACTIVE. The failure entry path is `replica-handler-create-methods.js:460` -> catch
`:578-656`.

**Claim boundary.** This note repairs the two owner gaps that turn the 10:29:57 flap into a permanent stop: quests B and
C below. It does not claim the scenario green. C1/C10 (admission from the projection, CDC holds; Stream B) and the
readiness flap (C5) remain open and can still slow the run. Full release acceptance is out of scope.

**Observed vs inferred vs hypothesis.**

- Observed: the timeline; the FAILED row without a cleanup token; no REMOVE of r4; the hosted_replica re-drive; the
  apply outcome `statement_failed, committed: true`.
- Source analysis: the typed DEFERRED is not consumed; cleanup is not claimed on `deferRetry`; the planner skip; the
  cohort is the committed configuration; recovery has no permanent outcome; apply is total.
- Inferred: the read failed by routing refusal (U-a).
- Not directly observed: the committed-membership dump (H3' is confirmed by construction and by elimination).

**First failing artifact.** `replica-create-admission-owner.js:373-378` throws DEFERRED, which reaches
`create-methods.js:578` and is handled as a terminal failure.

**Next discriminating check.** A unit red test. Drive `createReplicaAsync` through voter-ready with a gateway that
answers the operation read `{success:false}` once, then answers normally. On HEAD the replica is fenced and FAILED with
no cleanup token, and the planner skips it. After the repair the create completes, or, if the deadline is spent, it
fails with a cleanup claim that the failed-create cleanup owner consumes.

## Links, owners and the committed fact that should decide

| Link | What happens | Owner (file) | Committed fact that should decide | Disposition |
| --- | --- | --- | --- | --- |
| L1 | The `replica_operations` authority read is refused by readiness-projection routing (`planning_snapshot_refresh_pending`, `freshness_not_current`) | Readiness/routing: census C5, `query-executor-partition-routing-snapshot.js`, readiness planning snapshot | Live leader of `replica_operations-p1` (raft) and the publication epoch | **Route to C5** (census quest; record `readiness-observation-currency.md`). Not repaired here. B makes the outcome survivable whatever its cause. |
| L2 | A typed DEFERRED from `authorizeFreshCreate` is thrown outside the completion loop and becomes a terminal create failure | Create-admission owner, `replica-create-admission-owner.js:347-390`; `participant-release-authorization-owner.js:25-33`; `replica-handler-release-recovery.js:250-272` | The `replica_operations` row (MATERIALIZED, identity) read from the authority, and the existing create deadline | **Quest B** |
| L3 | A FAILED after committed admission is written without a cleanup claim (`create-methods.js:623`). The planner skips it as owner-protected (`move-planner-move-calculation-methods.js:315-327`) and the operation owner fails the operation (`operation-workflow-recovery-status-reconcile.js:333-342`): an orphaned configured member | Node create path and failed-create cleanup custody (`replica-handler-create-status-methods.js:193-245`) | The committed configuration contains the replica (admission committed or not known to be absent), so a removal obligation exists | **Quest B** |
| L4 | The release cohort contains a configured member that no node hosts. Each member answers `UNAVAILABLE{hosted_replica}`, recovery re-drives every 1 s forever, the pause is raised before the cohort resolves, and dependents inherit the block through `releaseControlOwnerFirst` | Participant cutover/release recovery, `replica-handler-participant-cutover.js:47-57, 286-334`; `replica-handler-participant-release.js:383-387`; `replica-handler-release-recovery.js:183-211` | The committed configuration at the release epoch (`membershipGenerationIndex`, `configurationKey`), which is already the fact read | **Quest C** `participant-release-permanent-refusal` (census C13 proposal adopted) |
| L5 | A CL-035 voter-role cache seed marks an already-durable row local-only (`create-status-methods.js:629`). The reconcile re-drives insert-only admission (`create-persistence.js:107-112`), gets `STATEMENT_FAILED` UNIQUE, and logs `converged` while `raft_role` is not durable | Voter-ready activation, census C8 | Live raft role and committed node | **Route to C8** (`voter-ready-from-committed-role-and-node`). Not on the stopping path. **Apply-totality A is refuted**: `partition-committed-statement-outcome.js:357-397` records the deterministic failure identically on every replica. |

## Contract and failure analysis

### 1. Consumed surfaces (all exist on HEAD)

**Quest B:**

- `ReplicaCreateAdmissionOwner.readOperation` / `authorizeParticipantRelease` (`replica-create-admission-owner.js:347-390`)
- the `CREATE_ADMISSION_ERROR_CODE.DEFERRED` vocabulary (`:40-45`)
- `createParticipantReleaseAuthorizationOwner().authorizeFreshCreate`
- `releaseFreshCreate`
- `completeParticipantRelease` (`participant-release-client.js:152-185`): the existing bounded completion loop, which honours `retryAfterMs` until the caller's absolute deadline
- `persistOrConfirmReplicaCreateFailed` with `claimCleanup` and `buildFailedCreateCleanupToken`
- `claimFailedCreateCleanup`
- the planner's protected-failed-create skip
- the terminal failed-create cleanup path that already REMOVEs r5 and r6 (log `Failed-create cleanup release confirmed by the target lifecycle owner`, `rebalancer-constants.js:323`)

**Quest C:**

- `runCutoverAttempt`, `cohortOf`, `readCohort`, `isRetryableMemberRefusal`, `normalizeMemberRefusal`
- `receiveParticipantRelease`
- the recovery `reconcile` / `report` / `enqueue` functions
- the `handler.consensusEvents` subscription (`release-recovery.js:244-247`), which already wakes the queue on consensus events
- `releaseAnswer` and the `PARTICIPANT_CUTOVER_OUTCOME` / `PARTICIPANT_RELEASE_MISSING_FACT` vocabularies (`partition-participant-transaction-cutover-constants.js`)
- `readCommittedMembership({purpose})`

**Unknown surface.** Whether a permanent outcome constant exists in `PARTICIPANT_CUTOVER_OUTCOME` beyond `OPERATOR_REQUIRED`. If not, quest C proposes one (`RELEASE_BLOCKED`) as an addition, not as an alias.

### 2. Typed failure edges

#### Quest B

| Edge | Today | After |
| --- | --- | --- |
| Authority read `{success:false}` (routing refusal, no leader, pressure DEFER) | Throws DEFERRED, which becomes FAILED with no claim | `authorizeFreshCreate` answers `UNAVAILABLE{missingFact: create_admission_authority, retryAfterMs, cause: <gateway outcome, error>}`. The answer is consumed by the **same** `completeParticipantRelease` attempt loop under the **same** deadline. No new timer, no new budget. |
| Read succeeds, row not MATERIALIZED, mismatched or completed | Returns `null`, then `FRESH_AUTHORITY` error, then FAILED (claim) | Unchanged: a typed refusal with a terminal cause, from the committed row. |
| Deadline spent while UNAVAILABLE | n/a (failed on the first read) | Terminal create failure with the last typed answer. Because admission has committed, the FAILED transition **always** carries the failed-create cleanup claim, so the existing cleanup owner REMOVEs the member. |
| Failure before any admission (no committed configuration entry) | `deferRetry` means no claim | Unchanged. The rule becomes "claim exactly when a configuration obligation may exist", decided from the committed admission fact (for example the promotion proof or the `replica_operations` admission state), never from `error.deferRetry`. Resolving the exact predicate is the U-f caller census in Phase 1 of B. |
| Lost reply, or restart after FAILED without a claim | Orphan forever | Recovery of a FAILED row with `previous_state` in PENDING, CREATING or SYNCING and no claim must not be protected forever. The planner's protection is conditional on a claim or an in-flight create owner. Exact form to be decided in B Phase 1 with the planner owner; no new planner rule beyond deleting the unconditional protection arm for `previous_state` alone. |

#### Quest C

| Edge | Today | After |
| --- | --- | --- |
| Member configured but not hosted | `UNAVAILABLE{hosted_replica}`, re-drive every 1 s forever | Within the attempt deadline, retryable as today. When the owner's deadline is spent with the **same** `membershipGenerationIndex`, the answer is a permanent typed `RELEASE_BLOCKED{blockedReplicaId, membershipGenerationIndex, configurationKey, missingFact: hosted_replica}`, reported once. Recovery stops re-driving and wakes **only** on a committed-configuration change (the existing `consensusEvents` subscription) or an explicit operator release. This is contract `:138-145`. |
| Dependent partition (`releaseControlOwnerFirst`) | `current_control_owner_fact` re-driven | Carries the control's `RELEASE_BLOCKED` (member, generation) as its typed cause; no separate algorithm. |
| Pause raised before the cohort resolves (`cutover.js:303`) | The partition stays paused, so writes are refused (`partition_write_cutover_paused`, 32 on f596) | The pause is raised only after `cohortOf` resolves and the census answers OBSERVED, or it is released on a refusal. Exact ordering to be preserved against TX1 constraints (`replicated-transaction-decision-and-apply`). The verifier must check that PAUSE-before-census was not load-bearing for TX1 drain safety. **Open design question for the lead.** |
| Member removed by a committed REMOVE | Absent from the next cohort (already correct) | Unchanged |

**Who retains the obligation after cancellation or deadline.**

- B: the failed-create cleanup owner, through the claim token.
- C: the existing recovery queue retains the partition debt while blocked. Wake comes from consensus events, not from a timer. The removal itself belongs to B's owner or to the planner's FAILED cure.

### 3. Cached views touched

- **B**
  - The services cache row is used only by the planner (`currentReplicas`, census U10 `replica-operation-repository-observation-methods.js:231,242`, cache-sourced). B does not add a cache consumer.
  - The protection decision moves from `previous_state` (a projection of the row as cached) to the claim fact. The claim is durable on the authoritative services row.
  - U3 (`replica-handler-runtime-metadata-methods.js:161,171`, 60 s wait on cached partition/table rows) sits earlier on the create path. It is not on this chain; it was observed on neither stopping node.
- **C**
  - The cohort comes from the committed configuration (no cache).
  - `facts.peers` routes come from raft status.
  - The deduplicated report signature (`release-recovery.js:152-166`) is replaced by the typed blocked state. A stale report cannot veto, because a configuration change wakes the queue.

### 4. Identity and representation

- B: operation id, replica id, `createAttemptToken`, admission generation (`create_admission_state`), and the cleanup token derived from the operation id.
- C: release identity = (partitionId, targetBuildDigest, configurationKey, membershipGenerationIndex) (`cutover.js:307-310`). A change of generation mid-attempt is `STALE` today and remains so. The blocked state is keyed by generation, so any committed REMOVE or ADD ends it.

## Deletions (one implementation per concern)

- B
  - The one-shot `authorizeFreshCreate` throw path in `releaseFreshCreate` (`release-recovery.js:259-265`) as a separate prerequisite. Authorization becomes the first step of each existing completion attempt, so there is one loop.
  - `claimCleanup: error?.deferRetry !== true` (`create-methods.js:623`), replaced by the committed-admission predicate.
  - The planner's unconditional `FAILED_CREATE_SOURCE_STATES.has(previous_state)` protection arm (`move-planner-move-calculation-methods.js:321`), pending the B Phase 1 census.
- C
  - The unconditional `enqueue(partitionId, RECOVERY_RETRY_MS)` on every non-CUT_OVER answer (`release-recovery.js:210`) for a blocked answer.
  - The signature dedup as a throttle (`:152-166`), replaced by the typed blocked state.
  - Pause-before-cohort ordering (`cutover.js:303`), subject to the TX1 check.

**Rejected remedies that must not be reintroduced:**

- timeout or deadline increases;
- a second retry loop or timer around the authority read;
- cache-as-authority for the operation row (for example falling back to the cached `replica_operations` row when the read fails);
- routing fail-open or carve-outs for priority reads (C5 history: 3fda9b056 carve-out, 334bbca2d fail-open, both "moved not closed");
- keeping the voter alive by skipping the fence without an owner;
- a synthetic REMOVE event from the target;
- treating `hosted_replica` as "member removed";
- a second release algorithm or timer (constraint `one-recovery-and-release-owner` of `participant-release-held-recovery-continuation`);
- a wake signal treated as authority.

## Blast radius (test files referencing the touched symbol on HEAD)

| Quest | Symbol | src files | test files |
| --- | --- | --- | --- |
| B | `releaseFreshCreate` | 2 | 2 |
| B | `authorizeFreshCreate` | 2 | 0 |
| B | `authorizeParticipantRelease` | 2 | 1 |
| B | `REPLICA_CREATE_ADMISSION_DEFERRED` / `CREATE admission read deferred` | 4 / 1 | 2 / 1 |
| B | `claimCleanup` / `persistOrConfirmReplicaCreateFailed` | 2 / 2 | 0 / 0 |
| B | `fenceFailedReplicaCreateRuntime` | 4 | 2 |
| B | `FAILED_CREATE_SOURCE_STATES` / `ownerProtectedFailedCreate` | 1 / 1 | 0 / 0 |
| B | `Replica failed during operation reconciliation` | 1 | 1 |
| C | `RECOVERY_RETRY_MS` | 5 | 3 |
| C | `releaseMemberIds` | 2 | 2 |
| C | `HOSTED_REPLICA` / `hosted_replica` | 2 / 1 | 0 / 0 |
| C | `runParticipantCutover`, `cohortOf`, `releaseControlOwnerFirst` | 3, 1, 1 | 0, 0, 0 |
| C (census) | `CUTOVER_PAUSED` / `readParticipantReleaseFacts` / `participantCutoverPause` | - | 15 / 4 / 4 |
| L5 (C8) | `seedLocalReplicaVoterRaftRole` / `markServiceRowLocalOnly` / `reconcileLocalOnlyServiceRows` | 2 / 2 / 3 | 4 / 5 / 3 |

The near-zero test counts on `hosted_replica`, `cohortOf`, `claimCleanup` and the planner protection mean these
decision edges are unguarded today. Both quests start with red tests, so the count rises.

## Historical precedent (regression-policy "Recover Historical Precedent")

| Mechanism | When and where | Learned / accepted | Remained | What changes now |
| --- | --- | --- | --- | --- |
| Fresh-create authority and release (`authorizeFreshCreate`, `CREATE admission read deferred`, `hosted_replica`, `claimCleanup` arm, planner protection) | All introduced in the 0.2.6 squash `54dd2d7ce` (2026-10-27); `git log -S` finds nothing earlier. No quest, closure ledger or evidence names `CREATE admission read deferred` or `claimCleanup`. | not found | First appearance of the mechanism is this run | New witness. B is a new quest. |
| Release completion loop | `participant-release-completion-owner` (open, 4 attempts, approved at 132ff5185, awaiting certification): one bounded completion operation for fresh CREATE and seed. Constraint: "request failure retains existing recovery and cleanup obligations"; "Existing-origin recovery remains separate". | Accepted owner: `completeParticipantRelease` | Fresh-create authorization was left outside the loop | B **reuses** that owner and must not change its clock or authority semantics (its `original-authority-and-clock` constraint). The relation is recorded in B's constraints. B is not folded into that quest, which is landed and awaiting certification; reopening it would violate its seal. |
| Held recovery continuation | `participant-release-held-recovery-continuation` (product, solved 2026-10-26) | One continuation owner; "wake-is-not-authority" | No permanent refusal for a configured-but-unhosted member | C extends that owner. It must not add a second algorithm or timer. |
| Seed release passes | `seed-release-once-per-partition-cohort` (open, 0 attempts), `seed-participant-release-applied-position-barrier` (open, 4 attempts) | Seed-pass semantics (one ask per distinct cohort, applied-position barrier) | Not the fresh-create or existing-origin recovery path | No overlap with B. C must preserve their seals (seed trigger unchanged). |
| Failed-create host custody | `replica-cleanup-host-custody` (open, 2 attempts): host retains unfinished shutdowns and never reports a successful release | Fence semantics | It does not decide whether a FAILED row gets a cleanup claim | B consumes the fence unchanged. Relation recorded. |
| `replica-opening-history`, `startup-refusal-cleanup-custody`, `retained-seed-original-handoff` | Open, raft-rs-full-cutover | Opening history and startup refusal custody | Not on this chain (no opening or startup refusal in the window) | No relation beyond the shared epic |
| TX1 pause/release | `replicated-transaction-decision-and-apply` (open, 49 attempts), `tx1-single-path-alpha` | The pause is the TX1 drain fence | - | C's reordering of the pause is gated on not weakening TX1 drain. The verifier runs that template. |
| Local-only row re-drive (L5) | CL-016 (2026-06-11, local seed), CL-021 (2026-06-12, accepted fix: "SAME idempotent UPSERT path"), CL-035 (2026-06-14, voter-role seed e76f0ac09; guarded) | UPSERT re-drive accepted | `1aea11baf` (2026-09-30) changed it to insert-only admission. The CL-035 seed's local-only mark became a guaranteed UNIQUE plus a false `converged` | Routed to C8 (`voter-ready-from-committed-role-and-node`), which the census says must re-prove CL-035 from the committed configuration |
| Routing by readiness projection (L1) | `readiness-observation-currency.md` (2026-10-03, 21 prior fixes "moved not closed"); C5 | Rejected: carve-outs, fail-open, `!== false` defaults, timers, cache-as-authority | Planning record, not sealed | Routed to C5. B must not add a routing exception. |
| Exhausted | `rolling-restart-core-stability` (EXHAUSTED, "must not be reopened") | - | - | Not touched |

## Evidence and closure

**Safety.**

- B never treats a refused or stale operation row as authorization. Authorization is re-read from the authority on each attempt.
- A FAILED replica that may be configured always has a removal owner.
- C never declares a release complete or opens admission for a blocked cohort. The permanent refusal keeps the pause, or releases it per the TX1 decision; it never fakes CUT_OVER.

**Recovery progress, under finite failures.**

- B: a read flap shorter than the create deadline completes the create.
- B: a longer one fails with a claim, which leads to a REMOVE through the existing cleanup owner, which changes the configuration. Quest C's wake then re-runs the release with a cohort that can clear.
- C: progress depends on someone changing the configuration. That someone is B's claim or the planner's FAILED cure, so **C depends on B** for the reconsideration event (as the census noted).

**Resource bounds.** No new timers. C removes a 1 Hz forever loop per blocked partition.

**Proof per quest:**

- red unit tests first (B: deferred read, then completion within the deadline; deadline spent, then claim, then planner REMOVE eligible. C: configured-unhosted member, then a single `RELEASE_BLOCKED`, no re-drive, then a wake on generation change);
- the production entry path (`createReplicaAsync`, recovery `reconcile`), not a helper;
- one live witness on the lab of `fresh-formation-user-table-routability`, local-three-node: no create fails after its promotion proof without a claim; no `hosted_replica` re-drive beyond the deadline;
- independent subagent verification.

Scenario green is **not** claimed by B or C alone; C1/C10 (Stream B) and C5 remain.

## Recommendation (one)

Seal and implement **quest B (`fresh-create-failure-after-committed-admission`) first**. It is the first divergence that
turns a 110-170 ms projection flap into a permanent stop. Its two halves form one owner rule: the typed unavailability
is consumed by the existing completion owner, and a terminal failure after committed admission keeps its removal
obligation. With B alone, the run's r4 would either have completed, or been REMOVEd by the existing failed-create
cleanup owner, clearing `sql_transactions-p1`'s cohort.

Then seal **quest C (`participant-release-permanent-refusal`)** for the contract obligation (`:138-145`) and the
pause-before-cohort write refusal. The PAUSE ordering half needs the lead's decision against TX1.

Route L1 to the C5 owner and L5 to the C8 owner. Declare no apply-totality quest: A is refuted, because apply is total
by construction.

**Bounded quest split:**

1. **B** `fresh-create-failure-after-committed-admission` (product, epic raft-rs-full-cutover): L2 + L3. quest.json in
   this directory, not started.
2. **C** `participant-release-permanent-refusal` (product, epic raft-rs-full-cutover): L4.
   `solve/quests/participant-release-permanent-refusal/quest.json`, not started; depends on B.
3. L1 goes to the C5 quest and L5 to the C8 quest. Both are census quests owned by the lead's sequencing; neither is
   declared here.
