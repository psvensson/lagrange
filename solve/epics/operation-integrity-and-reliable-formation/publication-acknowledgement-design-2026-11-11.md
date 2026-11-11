# Membership-publication acknowledgement: lost updates and repair design (2026-11-11)

Read-only design unit (subagent) over HEAD 103f132c1 plus the uncommitted tree. Nothing
here is built; no test was run except one in-memory demonstration of Loss 1. The choice
between options A and B, and who may acknowledge for a node, are the owner's.

## Verdict

The lost update is reachable, in three separate ways. The acknowledgement lane serialises
nothing across nodes, because **every node acknowledges on behalf of every node**: each
process's `ReplicaDispatchService` reacts to a NODES row written READY by acknowledging
for that row's node (`replica-dispatch-reconcile-callbacks.js:403-431` ->
`replica-dispatch-replay-health-readiness.js:456-478, 627-658` ->
`membership-publication-coordinator-reads.js:587-623` ->
`membership-publication-coordinator-persist.js:198-251`). One READY row produces up to N
concurrent read-merge-writes of one publication row. The write is an unconditional
`INSERT OR REPLACE` of every column (`cdc-system-table-mutation-sql-helpers.js:4-9`).

- **Loss 1, one process: the lane drops the second acknowledgement.** The lane key is
  `...:ack:<publicationId>` (per publication, not per node) and
  `DurableWorkflowCoordinator.runExclusive` (`durable-workflow-coordinator.js:484-505`)
  returns the promise already running for that key. Demonstrated in memory: `ack(node-2)`
  and `ack(node-3)` together ran only node-2's body and both callers received node-2's
  row. The caller ignores the returned row; the retry fires only on a thrown error.
- **Loss 2, across processes (or reconcile versus acknowledgement): last writer wins.**
  Both read acks {seed}; j1 commits {seed,j1} and its read-back passes; j2 commits
  {seed,j2} and its read-back passes; j1's acknowledgement is gone.
- **Loss 3, one process: the gateway replaces a pending write.** Upserts carry
  `coalescingKey system-metadata:control_plane_publications:<id>` with `REPLACE_PENDING`;
  a replaced write resolves `{success:true, outcome:NO_OP, superseded:true}`. The
  read-back catches it except when `skipPublicationWriteReadback` is set, which the
  ready-node path can set.

Also: status can go backwards (a refresh or acknowledgement computed from a pre-final
read writes ACK_PENDING over PUBLISHED and passes its read-back; SUPERSEDED or ABANDONED
can be rewritten to a live status); an acknowledger can itself write ABANDONED; merge
precedence is by `updated_at` across nodes' clocks; after three attempts the unconfirmed
row is returned as persisted (`persist.js:189-195`), which releases the acknowledgement
obligation silently and lets the creation path advance the workflow to OPEN on an
unconfirmed write.

What re-acknowledges after a loss: the node's next NODES READY event (unbounded); the
owner driver every 5 s, only for OPEN/ACK_PENDING rows and only when every pending node
is acknowledgement-eligible. A node that is lost and also recovery-pending is never
re-acknowledged. The redrive uses the same unguarded write.

Relation to today's symptoms (not proven by a run): Loss 1 can produce the intermittent
`membership-consistency` failure (two READY rows back to back in one process, 2 s settle
bound, 5 s redrive). A separate diagnosis the same day measured that test's red runs as a
9 s event-loop stall with the publication already settled; both mechanisms exist in the
tree. A lost acknowledgement also keeps the owner redriving every tick while serve
eligibility reports `publication_not_acknowledged`.

## Repair options

**Option B (recommended): a guarded write on a row revision.** Reuses the pattern of
`managed-workflow-record-store.js:476-491` (owner decision 2026-10-05: "writes are
functions of the stored version").

1. Column `publication_revision INTEGER NOT NULL DEFAULT 0`; creation is an insert-only
   admission at revision 1.
2. The owner exposes `applyPublicationChange(publicationId, change)` where `change` is a
   pure function of the decoded row returning next / UNCHANGED / refusal. Terminal rows
   refuse. Timeout-abandon moves to the owner.
3. `UPDATE ... WHERE publication_id = ? AND publication_revision = ?`, changed columns
   only, plain parameters (never SET expressions); landed means one affected row.
4. On zero rows: authoritative read (`OWNER_RPC_REQUIRED`), re-apply the change
   (already present -> ALREADY_APPLIED; otherwise try again).
5. Typed outcomes `COMMITTED` / `ALREADY_APPLIED` / `REFUSED` / `UNKNOWN`; no row is ever
   returned as persisted. A caller holds UNKNOWN and resolves it by an authoritative read
   on the row's change event or retry-after; reconcile does not transition the workflow.
6. The lane is keyed by (publication, node) or queues instead of joining.

**Option A: an acknowledgements table**, one row per (publication, node), `INSERT OR
IGNORE`. Commutative and idempotent with no read-modify-write, but needs a new system
table in the publications partition, cache and CDC registration, about 20 consumers that
read `acknowledgedNodeIds` off the row changed to join, and a guarded status write for
settle anyway. Wider and costlier.

Comparable systems: etcd `Txn(If(ModRevision == r)).Then(Put)` and Kubernetes
`resourceVersion` conflicts are option B; Kubernetes server-side apply with set-typed
lists and CRDT set rows are option A.

**Owner decision beside it:** may only node X (or the owner) acknowledge for X? Today
acknowledgement is by proxy from every node. This interacts with the pending CL-001
RECOVERY_ELIGIBLE_ACK decision.

## Witnesses owed (production entry point, real replicated table)

(a) Two coordinators in separate processes acknowledge distinct nodes with acknowledger 2
held between read and write until acknowledger 1's read-back completes: the final row
holds both. (b) One process, two concurrent READY events: both acknowledged. (c) A
reconcile refresh racing the final acknowledgement: PUBLISHED never returns to
ACK_PENDING. (d) Read-back unavailable for every attempt: the caller gets UNKNOWN, no
workflow transition, the obligation is retained and resolves on the next authoritative
read. Mutant: dropping the revision predicate turns (a) and (c) red.

## Touched

Files: `membership-publication-coordinator-persist.js`,
`owners/control-plane-publications-owner.js`, `membership-publication-acknowledgement.js`,
`membership-publication-coordinator-reads.js`, `...-reconcile.js`,
`replica-dispatch-replay-health-readiness.js`, `control-plane-publication-merge.js`,
`membership-publication-planning-evidence.js`, `system-row-normalizers.js`,
`system-table-runtime-schema-definitions.js`, `membership-publication-row-contract.js`,
`membership-publication-active-gate-reconcile.js`.

Pinned or sealed: the `control_plane_publications` schema (new column);
`architecture/contracts/active-gate-convergence.md:96`; invariant
`publication-drain-deterministic`; the CL-001 decision. The upsert acknowledgement path is
deleted, not kept beside the new one.

## The same shape elsewhere

| Row / field | Guard | Verdict |
|---|---|---|
| `control_plane_publications` membership row (acks, transition history, lifecycle and priority summaries) | none | Defect |
| formation-release-handoff publication row | whole replace by one authority, exact read-back | Not a merge; two-authority overlap unverified |
| `replica_operations.steps_history` | compare-and-set on step / completion for transitions; plain update unguarded | Mostly guarded; plain-update callers unaudited |
| `tables.partition_transition_metadata` | compare-and-set on bytes, state, generation | Guarded (the precedent) |
| `services` rows | insert-only plus exact-generation update | Guarded |
| `nodes.capabilities`, `message_groups.policy`, `tables.table_policies` | not traced | Unverified |
