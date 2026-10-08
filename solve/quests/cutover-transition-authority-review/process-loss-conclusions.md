# Workflow process-loss classification

Measurement: GitHub Actions/GCP run 37743852151, candidate
ac8194b2981de59d28726e68ea447d29d596f438. Runtime source is unchanged from
82b54ef9b7c8d6be9f2d6450cbc5e6713ade00af. This is a C0 measurement, not a
source repair or cutover approval.

## What actually ran

The existing reservation-dispatch test harness constructs the actual
RebalanceCoordinator, OperationWorkflowOwner and ReplicaOperationRepository.
The repository emits SQL into real file-backed better-sqlite3 tables generated
from REPLICA_OPERATIONS_SCHEMA and STORAGE_RESERVATIONS_SCHEMA. Each case
creates an operation through the existing coordinator and retains its storage
reservation. The owner executes a guarded transition through
executeAtomicTransition -> repository.persistOperationUpdate.

The gateway/cache/readiness/transport environment is the existing test
harness, not distributed SQL or a running Raft cluster. The injected engine
executes the repository's emitted SQL; it does not reimplement transition
classification. The parent receives a named cut observation, sends SIGKILL to
that exact child PID, waits for exit, and starts a different process against
the same database. No original JavaScript object, map or committed-marker set
is shared with the restarted process.

## Results

| Interruption | State in writer | State after reopening | Owner replay result |
| --- | --- | --- | --- |
| Before SQL write | Mirror SENDING; row PENDING; no committed mark | PENDING, uncommitted | Existing transition commits SENDING |
| After SQL inside uncommitted transaction | Connection sees SENDING; transaction still open; no committed mark | PENDING after SQLite rollback | Existing transition commits SENDING |
| After SQL commit, before return/mark | Row SENDING; no local committed mark | SENDING and reconstructed committed mark | Idempotent return, no new transition commit |
| After local committed mark | Row/mirror SENDING, mark present | SENDING and reconstructed committed mark | Idempotent return, no new transition commit |
| Actual SQLite read-only write refusal | Row PENDING, mirror SENDING, no committed mark | PENDING, uncommitted | Existing transition commits after reopening |
| Terminal FAILED commit, answer lost | Row FAILED; no local committed mark | Repository classifies FAILED terminal | Diagnostic does not re-enter a live workflow |

All six cases passed, each with a distinct killed/restarted process. Fresh
processes began with zero volatile progress records. The identity of the one
retained storage reservation matched across restart. No transport/physical
tripwire was invoked in the restarted diagnostic.

Existing regression files also passed: reservation-file-backed-restart (39
reported assertions), operation-progress-store-persistence (24), and
operation-workflow-owner-handoff-retry-backoff (27), total 90.

## Conclusion and limits

The current owner can reconstruct the tested nonterminal transition truth and
idempotency from the real persisted operation row. An advanced volatile mirror
is not incorrectly recovered as a committed step in these cases. Therefore
these results do not justify adding a second persistence store, another
committed-step ledger, or a blanket new queue.

The terminal case explicitly uses the real repository terminal predicate
before live-workflow recovery; that filtering is performed by this diagnostic
entrypoint. It is not a proof that every production recovery caller filters
terminal rows correctly. The tested reentry is executeAtomicTransition with
the actual repository, not a full cluster-startup pass through every recovery
path. The read-only fault is a genuine SQLite refusal, not ENOSPC or a torn
write. SIGKILL is process loss, not host power loss or fsync failure. The
uncommitted-transaction cut adds an explicit test transaction around emitted
SQL; it does not claim every production update uses that transaction shape.

No physical CREATE or external effect is run, so zero tripwires cannot prove
exactly-once external execution. The tests do not cover changing remote leases,
concurrent distributed writers, membership obligations after terminal
settlement, or promotion/source-removal outcomes. Those remain with their
existing owners and full-cutover acceptance.

The earlier direct-adapter red result remains valid at its stated boundary,
and the earlier independent C0 rejection remains recorded. This measurement
answers the specific missing process-loss question without reinterpreting
that rejection as an approval.

## Evidence identity

Artifact 11534404586, c0-crash-37743852151-1.
Archive SHA256: 91f3c052db86c3da9ca0ab09ada9738787bba259a0669c9be8c18122155f2bb4.
Raw process-loss.json SHA256:
8710119148201ee3d8c4e2cb641424b8d31e4c37c215092bae3b8a6463aa744a.
Harness SHA256: 18efc629fc68d43e62687f5e13a4dede3777162db7ee9e6032849976aadf8bcd.
All 17 manifest members were rehashed after download. Runtime diff and final
Git status are empty. Raw artifact retention is handled through the canonical
Solver evidence store, not by claiming the expiring Actions URL is permanent.
