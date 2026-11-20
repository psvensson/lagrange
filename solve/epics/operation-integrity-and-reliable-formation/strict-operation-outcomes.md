---
audience: agent
documentClass: planning
status: proposed
---

# Strict operation outcomes: bounded successor proposal

Prepared 20 November 2026 for programme item 02. This is an owner-local design
proposal under [operation integrity](../operation-integrity-and-reliable-formation.md),
not a sealed Quest, implementation assignment or execution receipt. The
integration owner must independently review the proposal before assigning its
implementation. No test, runtime command or lab run was performed to prepare it.

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
authority tests and `replica-operation-terminal-cas.test.js`. Before sealing,
complete this census with method-declaration and injected-object forms; the list
above is an inspected substitution search, not proof that no dynamic fake exists.
Ordinary fixtures use owner builders; malformed fixtures remain explicit negatives.

## Contract-first transition record

### Owner-defined shapes and combinations

The existing repository shape is `{persisted, disposition, operation}`; the
workflow shape is `{committed, disposition}` with some release/result extensions.
Keep the owner distinction, but remove optional Boolean persistence and validate
each conversion once at the owner boundary. The proposed shared contract must
make durable adoption and terminal meaning available without interpreting a
caller-mutated row as evidence. Exact builder names are an implementation choice.

| Disposition | Current repository producer | Proposed workflow meaning to prove |
| --- | --- | --- |
| UPDATED | `persisted:true`, operation supplied | Current requested write confirmed through the existing producer; progress only for the validated requested transition. |
| RECOVERED | `persisted:true`, operation supplied after retryable failure recovery | Requested durable write recovered from authoritative evidence; not a second effect. |
| IDEMPOTENT_REPLAY | `persisted:true`, authoritative operation supplied | Exact requested durable result already exists; replay is distinct from a new local commit. Terminal settlement requires matching durable terminal meaning. |
| TERMINAL_ADOPTED | `persisted:false`, winning terminal operation supplied | Different terminal won; adopt its exact success/failure meaning and stand down the losing write. |
| REFUSED | `persisted:false`, null operation | No requested transition established; retain the unresolved obligation. |
| REINSERTED | `persisted:true`, operation supplied | Reinsertion is currently reported as persisted but does not by itself settle the requested terminal transition. Preserve unresolved ownership; remove growth's local reinterpretation by expressing this at the common owner. |

Concrete recommendation for independent review: retain exactly one repository
result `{persisted, disposition, operation}` and make it mandatory. `persisted`
must be Boolean, `disposition` one of the six existing constants, and `operation`
an owner-copied canonical operation record or the explicit null permitted only for
REFUSED. Freeze the outer record and protect nested retained identity/history
from caller mutation using the existing owner copy conventions. Missing fields,
accessor surprises, unknown names and inconsistent combinations are contract
errors, not alternative success representations.

The producer branches above are concrete: UPDATED originates in
`confirmPersistedOperationUpdate`; RECOVERED in the gateway's recovered-result
arm or `resolveFailedOperationUpdateResult`; replay, adoption, reinsertion and
refusal originate in `resolveZeroChangeOperationUpdate`, with additional
pre-write adoption/refusal. `recoverPersistedReplicaOperationMutation` already
requires `isReplicaOperationVisibilitySatisfied`, whose exact identity,
step/status and durable-content checks differ intentionally from
`isAppliedReplicaOperationWriteVisible`'s monotonic post-apply confirmation.
Preserve that distinction. Do not allow a later row to prove an unapplied CAS.

Use one workflow-owned conversion producing the mandatory record
`{committed, disposition, operation, reconcileOutcome}`. `reconcileOutcome`
uses existing `OPERATION_RECONCILE_OUTCOME` values; adding it to the atomic result
is a proposed API change, not a field claimed to exist today. The conversion
validates the result against the requested canonical operation and requested
step, including existing identity and content fences. Its allowed combinations
are:

| Repository disposition | Workflow committed | Workflow reconcileOutcome | Operation payload and release meaning |
| --- | --- | --- | --- |
| UPDATED / RECOVERED | true | ADVANCED for the requested non-terminal transition; COMPLETED for successful terminal; FAILED for failed terminal | Exact requested durable write under the producer's contract. Only a validated terminal permits release. RECOVERED remains distinguishable from a directly acknowledged write. |
| IDEMPOTENT_REPLAY | false | WAITING for non-terminal replay; COMPLETED or FAILED for the exact durable terminal | Exact matching durable row. It may satisfy the requested state without claiming a newly committed transition or new progress. |
| TERMINAL_ADOPTED | false | COMPLETED or FAILED according to the winning durable terminal | Same immutable subject and valid terminal tuple, possibly a different terminal from the requested one. Adopt before release; never force success. |
| REFUSED | false | REFUSED | Null payload; retains retries, hold and reservation. |
| REINSERTED | false | WAITING | Reinserted operation payload, explicitly insufficient for requested transition settlement; retain obligations until an ordinary authoritative recovery/replay establishes the result. |

All other combinations are invalid. Terminal tuple requirements apply only when
the result claims terminal settlement (COMPLETED or FAILED), including every
TERMINAL_ADOPTED payload. Such a payload requires a finite `completedAt`, a
terminal step admitted by `isTerminalStep(type, workflowStep)`,
and a matching status: the explicit `WORKFLOW_STEP.FAILED` / `ReplicaStatus.FAILED`
pair for failure, otherwise `status === WORKFLOW_STEP_TO_STATUS[workflowStep]`,
consuming the existing definitions in `replica-operation-progress.js`. The map
does not currently include FAILED, so a general map lookup alone is insufficient.
A FAILED step/status maps to FAILED; the type's successful terminal step maps to
COMPLETED. Valid non-terminal UPDATED, RECOVERED and IDEMPOTENT_REPLAY payloads
remain accepted with their requested non-terminal step/status and null
`completedAt`; they do not have to satisfy terminal predicates and cannot release
terminal obligations. Reject invalid type, missing identity, contradictory
step/status, a terminal claim without its terminal timestamp, and a non-terminal
payload with a terminal timestamp. REINSERTED retains its unresolved disposition
even if its row contains a terminal tuple; the tuple alone does not establish
requested transition settlement.
The existing `isAuthoritativeOperationTerminal` checks only the timestamp, while
`isTerminalReplicaOperationRecord` can accept a status-or-step semantic match;
neither alone validates the full result tuple. Tighten validation at this owned
boundary without replacing unrelated general progress classification. Completion
success and FAILED are both terminal
settlements, but only COMPLETED is successful completion. The common terminal
release helper validates the complete record and accepts only those terminal
meanings. `committed:true` with REFUSED, REINSERTED, missing disposition or a
contradictory payload never releases. Consumers use the conversion's result;
ordinary test doubles use its owner builders.

Choose a named contract error for malformed collaborator records, with a stable
owner code such as the proposed `INVALID_OPERATION_PERSISTENCE_OUTCOME`. Before
propagating that error from terminal paths, retain/re-arm the existing terminal
repair with the exact operation and failed validation context; non-terminal paths
retain their existing operation/progress retry ownership. Do not encode malformed
input as REFUSED: refusal is a valid producer decision, whereas this is a broken
contract. Never catch this error and substitute success. An actual timeout or
unavailable authoritative read keeps its existing typed/error semantics and
recovery obligation rather than being relabeled as a contract error.

Remove the local idempotent fast path's authority to return null disposition or
project terminal state. An already-committed workflow mirror can avoid repeating
its local transition bookkeeping, but the requested persistence/replay still
goes through the canonical repository contract before effect authorization.
This includes `ALREADY_TERMINAL_TRANSITION_OUTCOME` in ordinary completion and
the already-terminal arm in `completeGrowthPromoteOperation`: an in-memory
terminal tuple alone cannot mint a new canonical durable replay or authorize
resource release after owner reconstruction. Consume the actual repository
terminal result for the exact identity.
`updateStep` may preserve an explicit local no-op return where it starts with the
same step and performs no effect; it cannot be consumed as durable terminal proof.
Replays may project already-proven state while reporting no new advancement.
No proof-bearing cache, new ledger or public operation format is introduced.

After a malformed answer or thrown persistence call, a same-owner retry of the
same requested step must enter the repository again. The deferred workflow
mirror created before the failed await cannot make `isTransitionIdempotent` or
an equal in-memory step skip persistence. Preserve the distinction between a
proven no-op and an attempted-but-unconfirmed transition. The existing owner lane
must reconcile or discard the uncommitted mirror at that boundary, while keeping
the retained operation and resource obligations; it may not return the local
no-op arm merely because the previous attempt changed a disposable projection.

`didOperationReconcileAdvanceOrComplete` cannot merely lose its `true` arm:
`reconcileOperationProgress`, timeout-grace helpers, port methods and adapter
command application currently carry declared Boolean answers. Migrate named
lifecycle consumers and explicit Boolean adapters together. Keep settled failure
separate from successful completion and from useful recovery progress.

### Identity, ordering and durable commit

The immutable durable subject comprises the existing `operationId`, operation
type, entity/partition and admitted placement intent. Replica binding is a
distinct, phase-dependent field: `bindReplaceCreateTargetReplicaId` may assign a
fresh `replicaId` before CREATE admission, first in the PENDING projection or
through its expected-step durable update. It explicitly refuses rotation after
`createAdmissionState` is set. Validate that permitted binding transition against
its requested durable write; do not reject it by comparing every field to an
older pre-binding snapshot. After admission, validate the exact bound replica
and generation. Growth's promoted identities are durable intent, while its
current administration route is not immutable placement identity. Preserve
existing CREATE admission, replica/node incarnation, membership and
expected-step/history fences;
this repair does not invent a new generation domain. Adoption must validate the
winning row for that same subject and its existing authority contract. An
administration route or cache row cannot replace operation identity.

Sequence: owner lane admits one transition; workflow coordinator prepares its
uncommitted mirror; repository performs the existing conditional mutation and
authoritative recovery/confirmation; the boundary validates the answer; only then
may the workflow mark a committed transition, project its durable meaning and
perform release. Terminal SQL retains `completed_at IS NULL` and applicable
expected-step/admission conditions. A winning competing terminal is monotonic.
The actual replicated mutation/authoritative confirmation owns durable truth;
`markTransitionCommitted`, a successful callback or a projected row is not that
commit point. No cross-log numeric comparison is introduced.

Repository incomplete-operation observations and coordinator workflow mirrors
remain disposable projections of their existing owner. They may trigger recovery
but cannot certify an unknown persistence answer. The existing producer's
deferred confirmation/witness behavior must be preserved and tested separately
from proven durable replay. A confirmed absent row, unavailable authority and a
malformed collaborator answer are distinct; none establishes terminal success.

### Retained obligations, wake and cleanup

REFUSED, unresolved REINSERTED, unavailable confirmation and malformed results
keep the operation owned and re-driveable. They cannot clear terminal retry state,
release an ACTIVE storage reservation or placement hold, or authorize a removal
intent. Use the existing terminal-transition repair, observed-progress and
committed-operation wake paths; do not create polling or widen retries.

A durable terminal may release only the exact operation's resources through
their owners. Crash after terminal persistence but before release must reconstruct
that same release obligation. Interrupted release must remain retryable without
reasserting the losing terminal or double-releasing another operation. The
candidate's growth releasing/settled distinction is useful and must be preserved.
Ordinary terminal completion/failure need equivalent evidence for their actual
release order. Caller expiry does not erase a durable decision; broader ownership
of work outliving admission waits belongs to item 03.

## Evidence, successor route and stopping condition

Historical solved Quests `replica-operation-terminal-cas`,
`reservation-fail-closed-dispatch-gate`, `terminal-write-refusal-retry-ownership`
and `canonical-replica-completion-observation` remain immutable. Their failure
lessons explain the retained repair/release distinction; they are not current
acceptance for this migration. Use a bounded successor Quest under this epic,
linked to those owners and the open placement/formation work. No successor record
has been created or sealed by this proposal.

**Proposed statement:** Through the production repository/workflow construction,
only recognized, internally consistent owner results for the exact operation
establish progress or terminal settlement. A competing durable failure remains
failure. Malformed, unavailable, refused or unresolved reinsertion answers retain
the existing recovery and resource obligations. All enumerated producer consumers
and substituting fixtures use the canonical contract with no weak alternate arm.

**Initial real-path witness:** build a coordinator with the existing real SQLite
fixture, seed a non-terminal operation and its storage reservation, then invoke
ordinary `updateStep` and terminal completion/failure through `workflowOwner`.
Wrap the real repository return boundary to inject undefined, null, bare Booleans,
missing fields, unknown dispositions and contradictory combinations. Keep one
unchanged real producer success as the positive control. Inspect durable rows,
workflow commit markers, actual resource rows and retry ownership. Where a write
has already happened before reply corruption, assert truthful uncertainty and
reconciliation to the real row rather than asserting that no effect occurred.

`test/rebalancer/test-helpers.js` already creates SQLite tables from the production
replica-operation/reservation/partition schemas and uses the production mutation
SQL planner; its store serializes and reopens across coordinator shutdown. Extend
the real-repository section of
`test/rebalancer/growth-promote-authoritative-completion-and-progress.test.js`
for terminal competition and interrupted release. The hand-interpreted gateway
in `createTerminalCasHarness` remains useful for narrower policy tests but cannot
supply the real-SQLite acceptance claim. Explicitly test owner reconstruction
from retained rows, not merely reuse the same live operation object.

Required further witnesses cover all six dispositions, same and competing
terminal writers, authoritative lost-reply recovery, durable failure adoption,
wrong identity, interrupted release and restart. Reintroducing the old false-only
adapter must make the malformed-result witness fail while the ordinary transition
still succeeds. Restoring a permissive terminal helper must independently fail
the retention/release negative. Expected answers must not be generated from the
production policy table under examination.

Two required retry/reconstruction controls make the distinction concrete:

1. On the same owner, inject a malformed answer and separately a thrown call at
   the persistence boundary after the deferred mirror is created. Restore the
   real collaborator and retry the identical step. Assert that the repository is
   invoked again, the first attempt did not commit the mirror or release resources,
   and the retry either persists normally or reconciles an already-landed write.
   Cover valid non-terminal update/replay as positive controls, alongside terminal
   completion/failure. A mutant that skips persistence because of the deferred
   mirror must fail this witness.
2. Persist a competing terminal winner or a terminal awaiting resource release,
   close the SQLite connection, discard the coordinator, workflow mirrors,
   operation objects and retry maps, and construct a fresh owner from the retained
   database image. Read and adopt the exact durable winner, including failed
   meaning, then resume only its retained release. The stale losing projection
   must not overwrite the winner, grant a different replica generation, or release
   another operation's resources. Reusing the original coordinator or operation
   object cannot satisfy this control.

**Proposed doneWhen:** use the existing `test-receipt` probe with six required
receipt identifiers: `strict-persistence-positive-and-malformed-negative`,
`terminal-dispositions-and-failure-meaning`, `reconstruction-and-interrupted-release`,
`permissive-path-negative-controls`, `classified-consumer-closure`, and
`independent-verification`. These names are proposed executable obligations, not
present receipts. The result is binary: all six admitted is complete; otherwise
incomplete. The source census belongs to independent review and applicable checks,
and cannot substitute for any runtime witness.

The minimal new evidence producer is a declaration/admission adapter under the
existing `scripts/quest-evidence/` owner for this successor. It consumes the
managed classified runner's original execution report and raw output, validates
the exact source/tree and required file manifest through
`scripts/test-execution-report.js` (`executionReportProblems`, also consumed by
`scripts/proof-authority.js`), checks the retained output digests and actual
runtime/artifact/host metadata, and writes the successor's ordinary
`test-receipt/1` projection. It must retain command, original request/run ID and
artifact references, complete phases, exits, executed assertion counts and
per-file results. It does not launch a second scheduler or invent another report
format. A bare `runQuestEvidenceHarness` summary is insufficient: that helper
currently discards successful raw stdout and does not itself establish the full
source/runtime/substrate provenance.

For the initial red, only the completed, correctly identified baseline witness
with an actual expected-contract assertion failure establishes a measured failure.
Reported assertion/command failure remains failure and is never filtered into a
pass. The admission adapter distinguishes that product failure from missing
output, zero assertions, skipped native execution, wrong source, incomplete phases
or corrupt hashes, which remain non-measuring. For green it requires zero
`executionReportProblems`, valid original outputs and all declared predicates.
Each negative-control mutation has its own named source and expected failing
witness, so its rejection is not misreported as a normal candidate failure or
merged into a green retry. Source review binds to changed content separately.

**Real red/seal route:** implement only the discriminating witness and its
execution-derived evidence producer first; execute it on the unchanged baseline
through the managed lab. Retain its original failing output, source/runtime and
request/run identity. The probe reads those results without executing a harness.
Seal only after that measuring red record exists. An absent receipt, fabricated
failure field, source-marker count or unavailable lab is not the reproduced red.
The integration owner observes the actual run and owns continuation; no run is
currently queued or running for this proposal.

After repair, run the smallest witness, affected classified interaction selection,
and applicable static checks through existing managed placement, locks and thermal
policy. Parallelize independent selected invocations across all admitted lab
machines using the current placement owner, preserving each machine's lock,
thermal admission and original result. A coupled mutation/control pair needs its
declared same-host comparison; physical topology requirements still constrain
formation jobs. The documented changed-cone route is
`node scripts/lab.js test changed --lane all --sha <candidate> --base-sha <baseline>`;
use exact recorded commits and preserve the selector's complete invocation set.
Do not run controller-side proof to substitute for unavailable placement.

Stop when the finite census is closed, real positive/negative/reconstruction
evidence is admitted, independent review approves the collected candidate and
applicable interaction gates pass. The existing three-host, three-consecutive,
420-second formation acceptance and wider service milestone remain item 09's
separate composed predicates. Root's next action is independent review of the
concrete recommended shapes, error custody and evidence adapter, then assignment
of the first real red witness. No implementation, proof run or seal is implied by
that recommendation.
