# C0 transition census - first read-only attempt

Status: working source analysis, not independently approved. No source repair
or production-race claim. Runtime target:
`82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af`.
The first Actions/GCP measurement candidate is
`4cdeac1c43ccc470ee5816a7439197d1d6c21bf4`; its runtime sources are unchanged
from the inherited product. Action run: `37736547313`.

## Facts, projections and remaining proof

| Subject | Current source/contract | Authority ceiling and unresolved work |
| --- | --- | --- |
| Admitted operation | ReplicaOperationRepository / replica_operations | Actual durable row is distinct from a volatile operation object and local workflow mirror; trace exact CAS winner/adoption/unknown outcomes |
| Workflow transition mirror | RebalanceCoordinator wires DurableWorkflowCoordinator to persistOperationWorkflowTransitionToDurableRow | Callback checks candidate length and returns; it does not itself execute SQL or compare the prefix |
| Durable transition commit | OperationWorkflowTransitionOrchestration.runAtomicTransitionUnderLane invokes persistFn, then markTransitionCommitted | The repository write, not the earlier mirror callback, is the commit point; prove failure/restart between them |
| operation_progress | OperationWorkflowOwner's default createOperationProgressStore | Map and event array, with local version CAS; no independent durable authorization |
| FreshMG membership | Existing sealed message-group-fresh-identity-membership Quest | Configuration authority is applied committed ConfState; permit/runtime end-to-end wiring is incomplete |
| Physical CREATE and install | Existing ReplicaCreateAdmissionOwner and snapshot-install generation fencing | Exact physical-generation and worker claim; not ordinary terminal operation status |
| Cleanup and reservation | Existing cleanup and storage-reservation owners | Distinct release conditions; do not merge these facts into membership completion |

## Workflow transition trace

1. `rebalance-coordinator-lifecycle.js:280-296` constructs the workflow
   coordinator with `persistOperationWorkflowTransitionToDurableRow`.
2. `operation-workflow-owner-ports.js:893-906` binds progress load/CAS/event
   append to the default volatile store.
3. `operation-workflow-transition-orchestration.js:120-178` ensures a workflow,
   calls transitionStep with deferred committed mark, invokes the supplied
   persistence function, classifies rejection, and only then marks committed.
4. `durable-workflow-storage-ownership.js:174-201` invokes the configured
   callback before replacing the local workflow record. In this composition
   that callback is the length validator, so the 'durable-first' wording is
   not itself proof that a SQL write occurred at that point.
5. `operation-workflow-owner-adapter.js:235-332` stores local progress, appends
   events and executes commands; it does not branch on a failed local CAS
   before those effects.

The current `operation-progress-store-persistence.test.js` uses the real
coordinator constructor with mocked cache/SQL/gateway dependencies. It checks
callback refusal and recovery from supplied rows, not a disk crash through an
actual durable transition commit. Retain those useful tests, but do not cite
them as the missing full persistence/restart proof.

### Deterministic boundary results

The new `scripts/quest-evidence/cutover-transition-authority-baseline.js` uses
the real adapter and real progress store, with explicit observation/effect
ports. It has no fabricated CAS return, timer or sleep. A positive single call
must execute exactly one dispatch and accept the progress write. Two direct
concurrent calls produce one actual CAS winner and one conflict, while both
execute dispatch. It also distinguishes refusal of a non-extending history
from acceptance of a longer history carrying a conflicting prefix.

These are boundary facts only. The harness excludes the enclosing production
owner lane and downstream receiver/durable guards. Do not promote them into a
production concurrency, duplicate physical CREATE, or data-loss claim.

### Existing serialization substantially narrows the question

| Entry | Source | Observation |
| --- | --- | --- |
| Coordinator-created dispatch | operation-workflow-owner.js:615-633 | Calls operationWorkflowRunExclusive with the operation owner key |
| Cache-driven observed progress | operation-workflow-recovery-observation.js:550-579 | Uses the same owner-key exclusive path; held lane schedules retry |
| Timer/delivered-create progress | operation-workflow-observed-progress-retention.js:290-325 | Uses the same exclusive path after held-lane checks |
| Priority target-progress reentry | operation-workflow-owner-priority-recovery-reentry.js:590-604 | Uses the same owner-key exclusive path |
| Remote-retry progress recording | operation-workflow-recovery-reconcile-dispatch-pending.js:485-518 | Uses a separate _remoteRetryProgressLocks Set and calls the adapter directly |
| Coordinator observed-progress facade | rebalance-coordinator-topology-guard-methods.js:738-740 | Delegates directly; actual production callers need classification |

`OperationLane.run` delegates to `DurableWorkflowCoordinator.runExclusive`.
The latter shares one in-flight promise per owner key. The normal paths above
therefore cannot be treated as unguarded merely because the adapter alone
admits the demonstration. The next discriminator must establish whether the
remote-retry recording route can overlap one of these protected paths for the
same operation and whether its effects remain observational/idempotent. A
separate lock is a candidate interaction gap, not automatic proof of one.

Do not add a second serialization framework or blanket CAS gate before this
specific reachable interaction is resolved.

## FreshMG success and failure subjects

The sealed Quest requires: admitted serial replacement; permanently fresh
target identity; committed ADD_LEARNER; exact CREATE; real state transfer;
atomic promotion; committed target voter; leadership handoff; source removal;
leader/quorum absence for membership-lane resolution; source-own applied
absence for local stop; exact-generation cleanup.

The preserved permit branch `cd366cc0` ends with an explicit unresolved
REMOVE/release subject: it is target-based, while successful source retirement
must preserve the promoted target. Review both the subject and phase. No
admission, uncertain admission, admitted learner, promoted target and already-
removed source cannot share an unconditional rollback. The terminal/lane/
reservation/cleanup distinctions in the sealed Quest remain binding.

Unresolved: a fully reviewed, source-bound transition table for phase-specific
failure after target promotion/source removal. No permit WIP is adopted by
this analysis and no existing acceptance is silently changed.

## Snapshot and local restart

The preserved `9554f689` draft separates LOCAL_OPEN, KNOWN_WIPE,
INSTALL_ADMISSION and READ_UNAVAILABLE. Those are useful owner distinctions,
not proof of completed production wiring. It requires receiver-native accepted
Ready bound to the exact application image, preserved local identity and
election state, and coherent durable application/consensus completion.
Intact cold restart must not require an already-live majority.

Unresolved: compare this draft against accepted checkpoint/install-generation
bytes in the integrated product and trace the registered transfer/install
path to actual atomic completion and lost-answer recovery. No new sender
HardState import or same-voter resurrection is permitted.

## Immediate next action

Finish the source/target protocol table and build a production-owner-entry
witness for the narrowed remote-retry/progress interaction. Then obtain a
category-complete independent contract review. Only a demonstrated missing
invariant opens a narrow runtime repair Quest; C0 does not authorize one.
The C0 receipt remains nonterminal and final cutover/A1-v13 approval stays
blocked.
