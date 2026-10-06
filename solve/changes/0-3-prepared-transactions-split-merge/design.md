# 0.3 prepared transactions across split/merge

Status: implementation design / release blocker
Branch: `quest/0-3-prepared-transactions-split-merge`

## Decision

Prepared transactions are a 0.3 correctness requirement. A partition topology cutover MUST NOT replace a participant identity while that participant owns a non-terminal transaction.

This is a serialization boundary, not participant remapping:

- the distributed transaction coordinator remains the sole owner of the frozen participant set and durable commit/rollback decision;
- `ManagedSplitWorkflow` / `ManagedMergeWorkflow` remain the sole topology lifecycle owners;
- partition services contribute durable transaction-state evidence only;
- split/merge may prepare/backfill while safe, but the authoritative cutover/retirement boundary is held while any affected source participant is ACTIVE or PREPARED;
- once the transaction reaches a durable terminal outcome, the same topology workflow is re-driven and may cut over;
- no topology owner rewrites `sql_transaction_participants` from a parent to children or from merge sources to the target.

This avoids creating a second 2PC protocol inside topology management.

## Existing invariant already landed

The raft-rs durable store refuses consensus persistence inside a user SQLite transaction (`USER_TRANSACTION_OPEN`). Commit/rollback markers are proposed only after the local SQLite session ends. That prevents user rollback from erasing Raft rows, but PREPARE is still `LOCAL_STAGING` on current main and therefore cannot yet authorize a restart-safe topology hold.

The release blocker therefore has two ordered legs.

## Leg A — durable replicated PREPARE

PREPARE must become a committed partition command.

The PREPARE command owns, at minimum:

- normalized session / transaction identity;
- transaction epoch;
- deterministic staged operations needed by the participant;
- write set;
- prepared timestamp / command identity needed for replay and idempotency.

Required semantics:

1. staging may never own Raft durability;
2. PREPARE ends local staging before proposing its command;
3. PREPARE is acknowledged only after the command is committed and applied by the participant Raft group;
4. every replica reconstructs the same PREPARED state from committed commands;
5. leader change and process restart preserve PREPARED;
6. duplicate PREPARE is idempotent for identical identity/content and fails closed for conflicting content;
7. COMMIT decision is durable before participant fanout;
8. participant COMMIT applies the prepared operations exactly once through committed-entry apply, records the durable outcome atomically with apply, and only then exposes CDC;
9. ROLLBACK terminalizes PREPARED without applying staged operations;
10. replay of PREPARE / COMMIT / ROLLBACK is idempotent.

The current leader-local `LOCAL_STAGING` state is not terminal evidence and must not remain an advertised prepared state.

## Leg B — topology transaction barrier

### Split

For source partition P:

- P may not cross the durable cutover/source-retirement boundary while P reports ACTIVE or PREPARED transaction state.
- A PREPARED hold must be derivable from committed partition state, not process-local maps.
- COMMIT/ROLLBACK of the frozen participant P remains routable while the hold exists.
- After the terminal participant outcome is durable, the split owner re-evaluates and proceeds.
- Children never inherit an unresolved transaction and never become substitute 2PC participants.

### Merge

For sources L and R:

- cutover is held if either L or R has ACTIVE or PREPARED transaction state;
- terminalization of only one source is insufficient;
- the target never inherits an unresolved transaction and never becomes a substitute participant;
- both source participant identities remain routable for their frozen transaction until both are terminal;
- after both are terminal, the merge owner re-evaluates and proceeds.

### Failure/recovery

The hold is level-triggered. It must survive:

- topology-owner restart;
- participant restart;
- participant leader change;
- duplicate workflow reconciliation;
- duplicate transaction decision delivery.

No timer may turn a PREPARED hold into topology authorization. Existing transaction recovery/timeout owners remain responsible for reaching a legal terminal outcome.

## Mandatory red-before / green-after witnesses

### Prepared-state replication

A1. 3-replica PREPARE: prepare on leader; every replica reconstructs the same PREPARED identity and operation digest.

A2. leader change after PREPARE: new leader resolves COMMIT; writes appear exactly once on all replicas.

A3. restart after PREPARE: restart participant before decision; COMMIT and ROLLBACK variants both reach the correct terminal state.

A4. duplicate decision: replay COMMIT and ROLLBACK delivery; no double apply, no duplicate CDC, no outcome reversal.

A5. crash boundaries: crash/restart after PREPARE commit, after durable coordinator decision, and during participant decision fanout.

### Split

S1. PREPARE then request split: workflow reaches the cutover barrier but source remains authoritative/routable and no child substitutes for the transaction participant.

S2. S1 + COMMIT: transaction applies exactly once to source; split re-drives and completes; post-cutover rows are correct in the appropriate child.

S3. S1 + ROLLBACK: no staged rows become visible; split re-drives and completes.

S4. PREPARE + split hold + source leader change/restart: hold survives and the final decision remains resolvable.

S5. duplicate split reconciliation while held: no source retirement, no participant rewrite, no duplicate child cutover.

### Merge

M1. PREPARE on left only: merge cutover held.

M2. PREPARE on right only: merge cutover held.

M3. PREPARE on both: terminalizing one still holds; terminalizing both releases.

M4. mixed decisions (left COMMIT, right ROLLBACK): each source reaches exactly its own durable outcome; merge then completes with correct rows.

M5. leader change/restart on either source while merge is held: hold survives and both frozen participants remain resolvable.

### Adversarial routing

R1. stale query plan naming a held source can deliver only transaction-terminal traffic allowed by the existing transaction identity; new ordinary traffic follows existing topology/routing rules.

R2. no fallback may silently route a transaction decision to children/merge target when the frozen source participant is absent.

R3. malformed/unknown transaction-state evidence fails closed at cutover.

## Proof bar

Applicable verification categories:

- concurrency-serialization
- recovery-replay
- transport-delivery
- admission-gating
- owner-interaction
- harness-fidelity

Terminal proof requires:

- focused deterministic red-on-baseline / green-on-candidate witnesses for every load-bearing invariant above;
- exact-head ordinary transaction, split and merge suites;
- 3-replica real raft-rs witnesses for PREPARE + decision across leader change and restart;
- an exact-head split and merge integration proof with a PREPARED hold;
- no weakening of split/merge safety floors, transaction timeout budgets, Raft durability, or routing failure behavior;
- independent category-complete review of the exact candidate.

## Implementation order

1. Establish RED witnesses A1-A5 and the smallest S1/M1 barrier witnesses before source changes.
2. Replace `LOCAL_STAGING` PREPARE with committed/applied replicated PREPARE and exact decision apply.
3. Prove A1-A5 before touching topology owners.
4. Add a typed transaction-cutover observation seam consumed by both managed split and managed merge owners.
5. Hold cutover/retirement level-triggered on affected non-terminal participants; re-drive from terminal transaction evidence.
6. Prove S1-S5 and M1-M5, then routing adversaries R1-R3.
7. Run ordinary suites and exact-head independent review.
8. Only after all proof is green may this release blocker be marked closed.
