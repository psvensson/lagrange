---
audience: agent
documentClass: planning
status: active
---

# Strict operation outcomes

Prepared 20 November 2026 for programme item 02. This is an owner-local design
contract under [operation integrity](../operation-integrity-and-reliable-formation.md).
The successor [Quest](../../quests/strict-operation-outcomes/quest.json) sealed at `58a208033` with six outstanding obligations.
The managed SQLite witness reproduced the malformed-reply failure.
The runtime migration is in progress. Independent reviewer
`subagent:/root/lifetime_census` approved the revised implementation design at
SHA256 `0c282984a2831b9887f1c1f2f33d65bfc50c325e928d5b3211060a8f4b5083ce`.
This current contract incorporates that prospective refinement; historical
reviews, findings and original execution artifacts remain unchanged.

## Baseline, decision and scope

Source inspected: `candidate/reconciliation-20261119` at
`6c0bdff11f24e32459178e9d2c0d9f563e7cd790`; remote main reported by the
integration owner: `5edfcadb508f9a82783159026364d3005836cc5c`. Rule-set revision
5 applies. Loaded instructions: root `AGENTS.md`, rules, router, Quest workflow,
runtime contracts, authority and recovery contract, scoped design-note template,
and the investigation/navigation skills. Navigation used direct source and Git
reads: no Serena tool was exposed, and no successful Serena invocation is claimed.

**Decision:** which repository persistence answers may establish workflow
progress, terminal success or failure, and permission to clear retries or release
storage reservations and placement holds. `ReplicaOperationRepository` owns the
durable answer; `OperationWorkflowOwner` owns its workflow consequence. Storage
reservation and placement-hold owners retain their actual release mechanisms.

The proposed writable interaction is the producer, transition adapter, terminal
and progress consumers listed below, their substituting fixtures and real-path
witnesses, and their existing owner documentation. A new owner-defined result
builder/validator may live beside `replica-operation-update-disposition.js`; it
must not introduce a generic schema framework or second workflow owner. Generated
metadata is refreshed only by its existing producer when the final change needs it.

Excluded: programme item 03's admission/cancellation resource lifetime, item 04's
completed-growth census authority, Raft membership algorithms, transaction/SQL
semantics, retention policies, new retry timers, and broad physical formation
acceptance. A necessary dependency discovered there is recorded for its owner,
not silently absorbed. One writer must own this whole result-shape migration.

## Existing repairs and source findings

Credit the candidate's removal of undefined/true exceptions from four terminal
reconciliation wrappers and the fail-closed unknown-growth-policy arm. Those
repairs exist; the shared interpretation they consume remains permissive.

| Source at the baseline | First divergence visible in source | Required discriminating observation |
| --- | --- | --- |
| `src/rebalancer/replica-operation-repository-mutation-update-methods.js`, `buildOperationUpdatePersistResult` | Default Boolean return and optional `{persisted, disposition, operation}` remain two public interpretations. | Every real producer branch and migrated consumer uses the same owner-defined result. |
| `src/rebalancer/operation-workflow-transition-orchestration.js`, `runAtomicTransitionUnderLane` | Only `false` or `.persisted === false` refuses; undefined, null, true and malformed objects reach `markTransitionCommitted` and `afterCommit`. | Malformed persistence answers cannot commit the workflow mirror or release anything; ordinary real persistence still succeeds. |
| `src/rebalancer/operation-workflow-terminal-reservation-release.js` | `committed:true` admits any string disposition; recognized dispositions admit missing or contradictory committed flags; the settlement helper accepts `{committed:true}` alone. | Missing fields and contradictory combinations retain obligations. |
| `src/rebalancer/operation-workflow-growth-promote.js`, settlement policy | Unknown disposition is refused as progress, but recognized UPDATED/RECOVERED dispositions do not validate the complete result. | A recognized name with invalid fields cannot discharge growth obligations. |
| `src/rebalancer/operation-workflow-terminal-transition-repair.js`, `runTerminalTransitionRepairAttempt` | A second false-only persistence check remains; TERMINAL_ADOPTED can clear repair without a winning operation. | Malformed repair answers retain the same owned repair and cannot invent adoption. |
| `src/rebalancer/operation-workflow-recovery-reconcile.js`, `ensureReplaceRemovalIntentRecorded` | Only `.persisted === false` prevents adopting recorded intent. | Missing/malformed persistence cannot authorize removal intent. |
| `src/rebalancer/operation-workflow-recovery-status-reconcile.js`, `classifyTerminalPersistOutcome` | Ignores the operation's terminal meaning and returns COMPLETED for every settled terminal. | A committed or adopted failure remains FAILED while its settlement can still be complete. |
| `src/rebalancer/operation-workflow-growth-promote.js`, `didOperationReconcileAdvanceOrComplete` | Accepts bare true alongside named outcomes. | Named-result consumers reject Booleans, while explicitly Boolean port adapters preserve their valid contract. |

These are source findings, not measured reproductions. The initial hypothesis is
that weak producer validation allows invalid evidence to become a committed
workflow result, after which shared helpers permit progress and release. The
first witness must exercise that boundary through the actual workflow owner.

### Prior failures and predecessor comparison

Treat the interaction as systematic unless the evidence proves it local. The
following records show recurring confusion between attempted writes, observed
durable state, progress and obligation release; none establishes current physical
acceptance.

| Retained source | Recorded failure or correction | Consequence for this successor |
| --- | --- | --- |
| [Terminal CAS Quest](../../quests/replica-operation-terminal-cas/quest.json), sealed at `bbb8522616736db58e040e8fea54ec6feba4b795` | Competing terminal writers could overwrite each other and terminal repair could reassert a losing result. | Preserve first-terminal-wins and adoption of the real winner; malformed adoption cannot stand down repair. |
| [Reservation dispatch/release Quest](../../quests/reservation-fail-closed-dispatch-gate/quest.json) | An under-reserved operation could be stranded; unresolved divergence must retain the reservation. | Prove the resource rows and real release owner, not merely a result Boolean. |
| [Terminal refusal Quest](../../quests/terminal-write-refusal-retry-ownership/quest.json), baseline `d75b01706a1f1cd6307bd4de9bfb2686dbf45a8c` | Four formation runs recorded 175-249 terminalization decisions per run with no completion. Clearing retries before a refused write silenced recovery, while the drain claimed progress. | Malformed and refused answers must retain the existing repair before propagating failure; re-adding an unconditional progress arm must fail a witness. |
| [Refusal investigation log](../../quests/terminal-write-refusal-retry-ownership/log.ndjson), finding `2026-08-10T10:31:46.688Z` | Later research refuted the initially suspected stale-log election cause and identified a row-visibility gap at ownership transfer. | Preserve that correction. Do not repeat the rejected election diagnosis or transplant historical consensus behavior into the current rs-raft backend. |
| Main `5edfcadb508f9a82783159026364d3005836cc5c` and candidate predecessor `530035262` | Source comparison shows the same false-only atomic adapter and weak common terminal helper before the latest candidate repair. | This is an inherited source defect class, not an established new regression. No same-host predecessor execution was performed. |
| Candidate `530035262`, [growth witness](../../../test/rebalancer/growth-promote-authoritative-completion-and-progress.test.js), interrupted-release case | Real SQLite terminal persistence is retained while an injected hold-release call fails; a subsequent reconciliation releases it. | Credit the witness but extend it to discard volatile owners and reopen durable state. Reusing the same live operation does not prove reconstruction. |

The historical logs retain their original assertions and corrections. This note
neither changes their seals nor imports their old receipt status as current proof.

### Similar-system lessons and their limits

etcd's transaction response separates whether the comparison selected the success
branch from the responses of the operations actually executed. A false comparison
can still execute a failure branch. The useful design lesson is to validate the
complete owner response and its branch meaning instead of treating one Boolean
as proof of an effect. Lagrange keeps its conditional SQL mutation and operation
identity; this does not introduce etcd transactions or an etcd revision domain.
[etcd v3.6 transaction API](https://etcd.io/docs/v3.6/learning/api/#transaction)

CockroachDB documents that a connection loss during commit can leave the result
unknown and distinguishes that uncertainty from a transaction known to have
aborted. The applicable lesson is that a lost or malformed reply cannot authorize
release or a fresh conflicting logical operation. Here the existing repository
reconciles the exact operation and retains its obligations; no CockroachDB retry
protocol, timestamp model or new public SQLSTATE is proposed.
[CockroachDB ambiguous results](https://docs.cockroachlabs.com/docs/stable/common-errors#result-is-ambiguous)

## Producer, construction and finite consumer census

All paths below are under `src/rebalancer/` unless stated otherwise.

| Role | Symbols and files |
| --- | --- |
| Durable producer | `persistOperationUpdate`, `confirmPersistedOperationUpdate`, `resolveFailedOperationUpdateResult`, `resolveZeroChangeOperationUpdate`, `buildOperationUpdatePersistResult` in `replica-operation-repository-mutation-update-methods.js`; disposition names in `replica-operation-update-disposition.js`. |
| Production construction | `rebalance-coordinator-lifecycle.js` constructs `ReplicaOperationRepository`, then `OperationWorkflowOwner`, passing repository, workflow coordinator, lane, reservation callbacks and recovery collaborators. `operation-workflow-owner.js` is the public owner; segment inheritance is implementation composition. |
| Non-terminal update and atomic adapter | `persistProjectedStepTransition`, `executeAtomicTransition`, `runAtomicTransitionUnderLane`, `resolveRejectedTransitionPersistOutcome`, `updateStep` in `operation-workflow-transition-orchestration.js`; `buildOperationTransitionPersistOptions` in `operation-workflow-owner-execution-lane.js`. |
| Other direct persistence callers | `claimPriorityDispatchTransition`, `completeOperation`, `failOperation` in `operation-workflow-transition-persistence.js`; `completeGrowthPromoteOperation` in `operation-workflow-growth-promote.js`; retained repair in `operation-workflow-terminal-transition-repair.js`; `bindReplaceCreateTargetReplicaId` in `operation-workflow-replace-target-binding.js`; `ensureReplaceRemovalIntentRecorded` in `operation-workflow-recovery-reconcile.js`; bootstrap-topology hold release in `rebalance-coordinator-operation-creation-support.js`; forwarding method in `rebalance-coordinator-owner-facade.js`. |
| Terminal and release policy | `shouldReleaseReservationForTerminalOutcome`, `isTerminalTransitionOutcomeSettled`; `resolveNotCommittedTerminalTransition`; `settleGrowthPromoteCompletion`, `dischargeGrowthPromoteLiveObligations`; `releasePlacementHoldIfNeeded`. |
| Terminal consumers | `operation-workflow-recovery-observation.js`, `operation-workflow-executor-outcome-reconcile-methods.js`, `operation-workflow-replace-owner.js`, `operation-workflow-recovery-status-reconcile.js`, `operation-workflow-recovery-drain.js`. |
| Named progress consumers and adapters | `operation-workflow-dispatch-response-reconcile.js`, `operation-workflow-dispatch-wake-preemption.js`, `operation-workflow-owner-adapter.js`, `operation-workflow-owner-ports.js`, `operation-workflow-recovery-status-reconcile.js`, `operation-workflow-recovery-drain.js`. |

The source search found nine direct persistence calls across seven consumer files,
plus the facade's forwarding call. Recheck references after the migration, including
prototype composition and injected callbacks; text references do not prove all
dynamic call paths. The four atomic-transition callers are ordinary step update,
ordinary completion, ordinary failure and growth completion.

The fixture census must cover every substitution of those producer/consumer
methods. Initial assignment/replacement search identified these 19 files under
`test/rebalancer/`:

- `cl-029-target-completion-evidence-retry-owner.test.js`
- `coordinator-created-operation-admission.test.js`
- `coordinator-created-operation-progress-remote-handoff.test.js`
- `coordinator-created-operation-progress.test.js`
- `epoch-fence-test-harness.js`
- `executor-outcome-redrive-untouched-payload-retry-owner.test.js`
- `growth-promote-authoritative-completion-and-progress.test.js`
- `operation-ownership-lease-fencing.test.js`
- `operation-workflow-active-cache-handoff.test.js`
- `operation-workflow-progress-event-driven-reentry.test.js`
- `rebalance-coordinator-atomic-transitions.test.js`
- `rebalance-coordinator-operation-ownership-tail-more-test-cases.js`
- `rebalance-coordinator-timeout-cache-visibility-tail-final-test-cases.js`
- `replace-real-group-completion.test.js`
- `replace-real-group-harness.js`
- `replace-replica-workflow-create-satisfaction-test-cases.js`
- `replace-replica-workflow-tail-test-cases.js`
- `reservation-fail-closed-dispatch-gate.test.js`
- `terminal-failed-add-target-cleanup.test.js`

Also migrate direct producer-result assertions in repository tests, confirmation
authority tests and `replica-operation-terminal-cas.test.js`. Before implementation assignment,
complete this census with method-declaration and injected-object forms; the list
above is an inspected substitution search, not proof that no dynamic fake exists.
Ordinary fixtures use owner builders; malformed fixtures remain explicit negatives.

## Concrete owner decisions

Keep ReplicaOperationRepository as the sole authority for persistence answers
and OperationWorkflowOwner as the sole interpreter of their workflow effects.
Use the existing disposition vocabulary. No new scheduler, ledger, generic
schema library, generic state machine, result compatibility mode or timer.

Add one small domain contract beside `replica-operation-update-disposition.js`
(recommended name `replica-operation-update-outcome.js`) for the mandatory
repository result builder/validator. All ordinary fixtures import it. Preserve
the existing operation row encoder/decoder and exact visibility comparison;
do not duplicate those algorithms in a test or result table.

Repository result is always `{persisted, disposition, operation}`:

| disposition | persisted | payload | issuing producer branch |
| --- | --- | --- | --- |
| UPDATED | true | requested operation snapshot | confirmPersistedOperationUpdate |
| RECOVERED | true | requested operation snapshot proved by exact recovery | recoveredAfterRetryableFailure or resolveFailedOperationUpdateResult |
| IDEMPOTENT_REPLAY | true | exact observed matching operation | resolveZeroChangeOperationUpdate exact-visibility arm |
| TERMINAL_ADOPTED | false | exact different winning terminal | pre-write conflict or zero-change terminal winner |
| REFUSED | false | null | expected-step/admission refusal, unresolved zero-change |
| REINSERTED | true | reinserted operation snapshot | missing-row reinsertion arm; not settlement |

All three fields are mandatory own data properties. The record must be a plain
object; reject absent/null/Boolean/array values, accessors, unknown dispositions,
missing fields and contradictory combinations. Owner builders produce copied
plain operation data and frozen outer records. Copy nested stepsHistory and
admission/membership metadata (existing `structuredClone` convention is already
used by bootstrap-topology operation construction). Existing shallow history
copies in cloneOperationSnapshot/cloneIncompleteOperationObservation are not
enough to protect a returned evidence snapshot from nested caller mutation.
The mutable working operation remains separate from the evidence snapshot.

Repository result validation establishes structural and disposition consistency.
Requested-write validation belongs at the consumer boundary and consumes the
repository's existing exact identity/step/content comparison for UPDATED,
RECOVERED and REPLAY. TERMINAL_ADOPTED instead compares immutable operation,
entity/partition and placement intent, then validates the winner's terminal
tuple. Replica binding can legitimately change before CREATE admission through
bindReplaceCreateTargetReplicaId; compare the requested bound write, not an old
pre-binding replicaId. Existing incarnation/admission checks still apply.

Terminal tuple validation is conditional: finite completedAt, an allowed terminal
step for the operation type, and matching status. FAILED needs the explicit
FAILED/ReplicaStatus.FAILED pair because WORKFLOW_STEP_TO_STATUS omits it.
Nonterminal UPDATED/RECOVERED/REPLAY with null completedAt remain valid. A terminal
timestamp on a nonterminal step is invalid. REINSERTED remains unresolved even if
its payload contains a terminal tuple.

Here nonterminal means an incomplete operation, not merely a step-name category.
The current dispatch-wake-preemption path can call updateStep(ADD, ACTIVE) before
completeOperation supplies completedAt. That valid incomplete stage must not be
rejected solely because ACTIVE is the type's eventual final step. With null
completedAt it proves at most requested stage advancement, never terminal
settlement or release. For an explicitly requested terminal transition, null
completedAt is invalid. Carry the existing terminalTransition intent into the
boundary validator and use the full tuple to classify actual terminal meaning;
do not infer it from status or step alone.

Do not change the two different repository visibility meanings: an unacknowledged
write/replay recovery requires `isReplicaOperationVisibilitySatisfied` (exact),
while confirmation of an already-applied write may use
`isAppliedReplicaOperationWriteVisible` (monotonic). UPDATED still means the
requested acknowledged write, even if later authoritative confirmation observes
a successor; such an observation may be adopted through its existing authority
path but cannot pretend an unacknowledged CAS succeeded.

Workflow conversion lives with the workflow owner, consuming the repository
validator and producing `{committed, disposition, operation, reconcileOutcome}`.
Move the generic OPERATION_RECONCILE_OUTCOME vocabulary and its predicates out of
the growth implementation into a small workflow-owned contract module; migrate
all imports directly and remove the old definition/export instead of re-exporting
it as a compatibility alias. No generic framework is needed.

| disposition | committed | reconcileOutcome |
| --- | --- | --- |
| UPDATED / RECOVERED | true | ADVANCED for nonterminal; COMPLETED for successful terminal; FAILED for failed terminal |
| IDEMPOTENT_REPLAY | false | WAITING for nonterminal replay; COMPLETED or FAILED for durable terminal |
| TERMINAL_ADOPTED | false | COMPLETED or FAILED from the exact winner |
| REFUSED | false | REFUSED |
| REINSERTED | false | WAITING |

Only this conversion decides these combinations. Terminal release helpers
validate the full workflow result and permit both terminal meanings. They do not
accept committed alone, disposition alone, operation.status alone or Boolean
success. Release eligibility is distinct from successful completion and from
whether all release effects have finished.

## Progress APIs: one named meaning, explicit predicates

Recommended coherent return migration:

* `executeAtomicTransition`, completeOperation and failOperation return the full
  validated workflow result. Refusal constructors in operation-workflow-replace-owner
  must produce the same REFUSED shape. No already-terminal constant without a
  verified operation payload survives.
* `updateStep`, reconcileOperationLifecycle, reconcileStoppingOperationProgress,
  reconcileObservedTargetProgressDuringTransitionGrace and their forwarding
  owner/coordinator entrypoints return the named OPERATION_RECONCILE_OUTCOME enum.
  updateStep maps a validated atomic result; a deliberately retained local
  priority projection returns WAITING, not ADVANCED. An ordinary nonterminal
  replay adopts the durable state but returns WAITING, not a new commit.
* Remove the redundant Boolean `reconcileOperationProgress` conversion and
  migrate its production references to reconcileOperationLifecycle. Do not keep
  an alias or a helper that accepts either Boolean or enum.
* `didOperationReconcileAdvanceOrComplete` is a strict predicate of the named
  enum: ADVANCED or COMPLETED only. A separate explicit terminal-settlement
  predicate includes FAILED when a recovery loop should stop/release. A failed
  terminal must never be classified as COMPLETED to stop a retry loop.
* Owner adapter command application is a distinct question from operation
  progress. Its command ports currently return actual Booleans for dispatch,
  wake, marker and lifecycle-derived application. Keep this one declared Boolean
  contract and validate it as Boolean; use `applied === true` in
  buildOperationWorkflowAdapterCommandResultEvidence. Lifecycle-consuming ports
  explicitly apply the named enum predicate once. Never pass their Boolean back
  to the lifecycle predicate. This is a typed predicate output, not a second
  persistence/terminal result shape or Boolean compatibility arm.

Migration includes every use of the old updateStep Boolean. Source census finds
16 call sites plus the facade across dispatch-execution, growth, dispatch-response,
priority-recovery-superseded-target, recovery-reconcile, dispatch-wake-preemption,
priority-publication-safety-topology, executor-outcome-reconcile, recovery-observation
and recovery-status-reconcile. Inspect ignored results as well as truthiness.
In particular applyReconciledReplicaStatus currently returns ADVANCED after
awaiting updateStep without checking its answer (CREATING and SYNCING arms).
persistReplaceRemovalIntent/ensureReplaceRemovalIntentRecorded and
priority-recovery-superseded-target must explicitly inspect the named result.
The new witness positive-control assertion of updateStep's current Boolean must
be prospectively migrated to ADVANCED with this declared API change after the
original baseline run is preserved; its durable row/release assertions remain.

Failure classification must be fixed in all three paths found during refinement:
classifyTerminalPersistOutcome; classifyReconcileExecutionOutcome; and the
RECONCILE_STOPPING/early-terminal branches of reconcileOperationLifecycle.
Their current generic isOperationTerminal-to-COMPLETED interpretation is not
valid for a winner whose durable meaning is failure. Consume the canonical
validated terminal meaning; transport COMPLETED alone cannot override it.

## Deferred mirror, retry and lost reply

The dangerous sequence is ensureOperationWorkflow -> transitionStep with
DEFER_COMMITTED_MARK -> persistFn -> validation -> markTransitionCommitted.
On malformed return or thrown persistence, the mirror can already have advanced
even though its committed-transition key is absent. EnsureOperationWorkflow
returns early if this mirror exists, so fixing only the false-only branch is
insufficient.

The corrected entry ordering is required for completeOperation, failOperation,
completeGrowthPromoteOperation, ordinary updateStep and retained repair:

1. Under the existing operation lane, read the exact operation from the repository
   authority using its existing authoritative visibility observation. Preserve
   absent versus unavailable/deferred; unavailable cannot hydrate or settle from
   the supplied mutable operation. Retain the obligation and return the existing
   uncertainty/error behavior. A confirmed absent row follows the current
   persistence/reinsertion policy; it is not a terminal replay.
2. Validate subject identity and the observed row before preparing a candidate.
   Resolve existing terminal truth first, through a repository-owned replay/
   adoption classification sharing the same exact-match and terminal-winner
   rules used by persistence. If the requested terminal meaning is already the
   winner, return canonical IDEMPOTENT_REPLAY carrying that unchanged observed
   row; a different terminal produces TERMINAL_ADOPTED with the exact winner.
   A new call does not invent a new timestamp/history merely to compare it with
   the winner. A retained exact request still compares its original durable
   content through the producer's existing exact comparator.
3. A validated existing terminal goes directly to the common terminal consequence
   routine. Do not call transitionStep, terminal write admission or persistence
   again. For nonterminal matching replay, return WAITING with the exact observed
   state without creating a transition-history entry or committing a new key.
   Requested metadata/binding changes at the same step still require exact
   requested-content comparison and, when not already present, a real write.
4. Only an authoritative nonterminal state requiring a new effect enters the
   transition preparation path. Replace any stale/unconfirmed workflow mirror
   and hydrate from this freshly read operation, then apply the existing step/
   admission validation, prepare the requested transition, persist, validate the
   result and mark committed. The guarded SQL/authority reread remains necessary:
   another writer can win between preflight and mutation. Such a winner is
   adopted through the same result contract, never overwritten.

`ensureOperationWorkflow` currently hydrates its caller-supplied operation, not
SQL. Passing it the freshly read validated row (or an owner-controlled snapshot
of that row) is therefore part of the fix. Removing the local early returns alone
would rehydrate a terminal workflow and then attempt an illegal new transition,
potentially wedging every retry before its repository call. The replay/adoption
branch above must run before both ensureOperationWorkflow and transitionStep.

On malformed/throw after transition preparation, discard only that disposable
workflow projection through DurableWorkflowCoordinator.removeWorkflow under the
same operation lane. Preserve the exact retained request, repository visibility
witness and retry; never roll back a durable write. The next attempt starts at
the fresh repository observation above, not at the stale supplied operation.
Remove onIdempotentTransition projections which invent timestamps and remove
runAtomicTransitionUnderLane's local committed-key return as an authority shortcut.
Each attempt re-enters repository authority, but a proved replay performs no new
UPDATE. A test must count the authoritative resolution/repository entry rather
than require a redundant persistOperationUpdate call once the read already
established immutable terminal truth. Preserve the original red run before this
prospective witness refinement, and assert no transitionStep/new history on replay.

Before throwing INVALID_OPERATION_PERSISTENCE_OUTCOME from any terminal caller,
armTerminalTransitionRepair with the exact requested snapshot and existing
persist options, then propagate the named contract error. A real thrown delivery
error remains that original error; it also retains this repair. Do not overwrite
the original error with a secondary repair/setup error. Refused and REINSERTED
take the existing not-committed repair path. Preserve all exact CREATE admission
and REPLACE terminal-admission conditions when replaying retained work.

Repair itself must validate repository observations/results before adoption,
confirmation or clearing. TERMINAL_ADOPTED without its exact valid winner is
malformed, never permission to clear. The existing repair timer catch/rearm path
owns subsequent failure; no additional retry loop is introduced.

Separate durable terminal settlement from release completion. Extract one
workflow-owned terminal consequence routine from ordinary complete/fail and
growth release code, callable by both their normal path and the existing repair.
It receives the validated exact winner and runs the existing ledger-self-move,
placement-hold and storage-reservation release owners. Only after required release
effects finish may it clear retained repair state. A known failure winner uses
failure consequences and can never emit the attempted success event. Replaying
release must be idempotent and must not increment a new-completion statistic or
rewrite the winner's timestamp/history.

`runTerminalTransitionRepairAttempt` must perform the authoritative terminal
observation/classification before `admitReplaceTerminalRepair`. The latter admits
NEW persistence only; it is never an admission gate for releasing an already
committed terminal. Today lines 473-485 can clear repair on admission refusal,
and admitReplaceTerminalRepair compares a retained FAILED REPLACE's old expected
step with the now-FAILED durable step. That refusal after successful persistence
must not discard its known release debt.

Use the existing repair owner's state with one explicit phase:
PERSISTENCE_UNCONFIRMED or TERMINAL_RELEASE_PENDING. Entering release-only replaces
the retained projectedOperation with a protected snapshot of the exact observed
winner, replaces the old persistOptions with null (there is no new write to admit),
and retains cleanup-release obligations that belong to that winner. This is a
domain phase inside the existing repair, not a second state store. Remove the
old first-value-wins behavior of buildTerminalTransitionRepairState for this
transition; it currently keeps existingState.projectedOperation/persistOptions
and would otherwise replay a losing projection or obsolete expected-step CAS.
Do not downgrade TERMINAL_RELEASE_PENDING to persistence repair on later arming.
Repeated observations must match the same immutable terminal winner; a conflicting
or unavailable observation retains the debt and reports the anomaly.

In TERMINAL_RELEASE_PENDING, invoke only the common terminal consequences. Never
call admitReplaceTerminalRepair, rewrite the row or re-evaluate whether the old
terminal would be admitted as a new effect today. Failed-create cleanup delivery
uses the winner's exact cleanup/admission identity. A required cleanup still
unavailable remains owned in this phase. Successful required release effects are
the clearing event; throwing/deferred release retains this phase and rearms the
existing backoff. Durable failed meaning stays FAILED throughout.

In PERSISTENCE_UNCONFIRMED, unavailable observation retains/rearms before any new
write. A validated terminal observation changes phase as above. Only a current
nonterminal/confirmed-absent state can proceed to fresh write admission under the
existing rules. Admission refusal prevents the new effect and remains an explicit
refusal under the normal recovery owner; it cannot clear a previously established
release-only obligation. A write that lands while admission is being checked is
handled by repository CAS/adoption plus the next fresh observation, not a blind
clear-on-refusal arm.

Ordinary reservation reconstruction uses the existing durable reservation/
operation sweep; placement hold reconstruction must use its existing owner
rather than a second ledger. Reconstruct a terminal release phase from the
observed terminal row and its outstanding durable resource obligation, never
from the lost first request's options. Do not claim that the initial reservation-
only reopen witness proves placement hold reconstruction.

Required revised recovery witnesses:

* Same-owner lost reply after a real terminal write: restore delivery, read the
  winner before transitionStep, release the retained resource and return exact
  replay/adoption. Assert no new history entry/timestamp/UPDATE, not merely no throw.
* Fresh owners re-enter completeOperation, failOperation and growth completion
  after reopening SQLite, using deliberately stale input projections. Assert
  authoritative resolution precedes transition preparation and exact successful
  or failed winner meaning survives. The reservation sweep alone is insufficient.
* Real FAILED REPLACE commits while its resource release is interrupted. Change
  the current admission state so a NEW FAILED write would be refused (including
  retained expectedWorkflowStep versus durable FAILED mismatch). Both same-owner
  repair and reopened-owner recovery must enter release-only and finish the exact
  winner's release without invoking fresh-write admission. A control where the
  FAILED write never committed must still be refused and retain the original
  nonterminal obligation; this prevents bypassing admission for new effects.
* Fault release again after winner adoption: retained repair contains the winner,
  release-only phase and no stale persist options. Clear the finite fault and
  drive the existing wake to completion, preserving other operations' resources.

## Remaining direct persistence migrations

1. persistProjectedStepTransition: mandatory repository record; no returnDisposition
   option, no Boolean success assumption.
2. claimPriorityDispatchTransition: inspect canonical result and requested state;
   no truthiness and no local committed-key shortcut. Retained priority deferral
   preserves its owner but cannot report durable progress.
3. completeOperation/failOperation/completeGrowthPromoteOperation: one conversion
   and terminal consequence path. Delete growth's local REINSERTED persisted:false
   rewrite and local terminal-success/replay inference.
4. bindReplaceCreateTargetReplicaId: accept only validated requested durable
   update/replay, copy binding from result; refusal/uncertainty retains old binding.
5. ensureReplaceRemovalIntentRecorded: adopt result.operation only after validated
   requested intent content; undefined/malformed cannot authorize removal.
6. bootstrap-topology release: source search finds no implementation of the
   feature-detected compareAndSetPendingBootstrapTopologyRelease method. Remove
   that phantom alternative and the released:true alternate result. Use the
   existing expectedWorkflowStep+expectedStepsHistory conditional repository
   update and validate its exact outcome. Preserve the existing separate public
   hold-release view after that boundary.
7. runTerminalTransitionRepairAttempt and facade: consume/forward mandatory
   results, preserving repair and exact winning operation as above.

Delete returnDisposition only for persistOperationUpdate and its caller/fixture
contract. persistNewOperation has a different existing insert API and is not
silently migrated by a global search-and-replace.

## One coherent integration unit

Work in this order inside one isolated unlanded candidate; no intermediate commit
is shared as an executable compatibility state:

1. The original managed red and its controls are retained and admitted for
   source `58a2080337b56b4e5f97bcb54da59f57b94e6611`. The Quest sealed on
   that failing witness. Continue the migration from its existing assignment.
2. Add owner contract builders/validators and mandatory producer branches, then
   migrate atomic and direct persistence callers in the same working unit.
3. Finish retained-error/mirror handling and terminal release/repair paths.
4. Migrate named progress APIs, Boolean command predicates and all terminal failure
   classifications; remove old alternate helpers/exports. Update all enumerated
   fixtures with owner builders, retaining explicit malformed negative values.
5. Extend the real SQLite test to every allowed disposition, before/after-write
   loss, exact terminal competition/failure, wrong identity/binding and interrupted
   release. Keep same-owner retry and reopened-owner proof. Add a nonterminal
   replay positive (valid shape, no new commit/progress, no release).
6. Run focused controls through managed labs. Reintroduce the false-only adapter
   in an isolated mutant and require the original malformed assertions to fail;
   independently restore the weak release helper and require retention failure.
   A mutation import/setup failure is non-measuring.
7. Run the finite affected interaction suite plus necessary static/metadata checks
   on pinned content. Independent review attacks actual production binding,
   allowed result combinations, remaining consumers and original proof artifacts.
8. Integrate the complete migration only after review and applicable gates. Item
   09 composed physical formation remains a separate acceptance obligation.

This plan does not claim closure from the first witness. Release interruption,
every producer disposition, failure adoption, dynamic fixture census and all
consumer propagation remain explicitly required. A new discovered interaction
is assessed against this semantic boundary before expanding scope; the existing
single writer and reviewer remain responsible.

## Current evidence and continuation

The original focused run executed at source
`58a2080337b56b4e5f97bcb54da59f57b94e6611`, managed request
`3883b67b-2d12-459c-a08e-d8a5f64b4ebe`, with the selected witness on `tv-dator`.
The independent original-output audit reports 11 parent tests and 129 leaf
assertions (96 pass, 33 fail): all eight malformed reply cases are red; ordinary
transition/release, thrown-reply retry and reopened-owner reservation controls
pass. The runner counts 140 assertions including the 11 parent assertions.
These are original local SQLite composition results, not physical fleet
acceptance or full outcome-contract coverage.

Original status, artifact inventory/manifest, placement selection, result ledger,
raw TAP and stderr are retained under
`/tmp/lagrange-takeover-20261120/red-originals/`. The evidence store holds the verified original archive.
[Original SQLite and support witness outputs](https://github.com/psvensson/lagrange/releases/download/solve-evidence/strict-operation-outcomes--strict-outcomes-and-support-original-red-3883b67b.tar.gz).
The original test blob is
`6339350d3c4e4c2658f5ecf1215b073c1bc2c7a287a98a5801780c57cd9ac3ad`.
Do not rewrite that source or its original evidence to match the new design.

The initial [admission adapter](../../../scripts/quest-evidence/strict-operation-outcomes.js)
is deliberately red-only: it validates pinned original bytes, request/source/host,
one selected file, no retry, complete TAP plans, named contract failures and the
three positive controls. It writes only the existing `test-receipt/1` failure
projection. It cannot admit a green run, synthesize execution sections, certify
the other five obligations or substitute an absent receipt for a measuring red.
The original preflight records Node version and dependency-lock identity, but
native binary and SQLite build hashes were not captured. The controller status
reports `source_execution_started:false`; the child placement's source marker,
selection, ledger and original TAP establish execution. Keep that evidence ceiling
explicit. Full passing admission later requires original complete-run evidence
of the required source/runtime/substrate kind, using the existing execution-report
validator where that report is actually produced; do not invent missing fields.

The Quest's six required receipt IDs remain unchanged:
`strict-persistence-positive-and-malformed-negative`,
`terminal-dispositions-and-failure-meaning`,
`reconstruction-and-interrupted-release`, `permissive-path-negative-controls`,
`classified-consumer-closure`, and `independent-verification`. All six must be
admitted for closure. The initial red does not satisfy any complete obligation.

The assigned repository and workflow owners have a separate implementation
checkpoint. On `8281e61d2`, managed request
`2378f3a8-3dc2-4ddf-982b-d8d13b6efe3a` passed the native SQLite witness
with 51 parent cases and 470 leaf assertions. The current evidence adapter
on WIP binds this run to the first three receipt rows. The original red,
isolated negative controls, classified consumer suite and independent
composed review have distinct records.
[Managed native originals](https://github.com/psvensson/lagrange/releases/download/solve-evidence/strict-operation-outcomes--strict-native-8281e61d-5487-nov20.tar.gz).

Continue from the existing [Quest log](../../quests/strict-operation-outcomes/log.ndjson).
The repository owner must preserve uncertainty on malformed target reads.
The workflow owner must bind superseded-target failure to the target state at
the conditional write and retain outstanding release and retry work. Run the
affected dispatch, reservation and recovery suites on the composed source.
The integration owner admits the remaining receipt rows after their original
controls, classified checks and independent review are complete.
