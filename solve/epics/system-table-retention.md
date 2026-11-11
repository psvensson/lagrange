---
id: system-table-retention
status: open
proof: deterministic
roadmapRow: null
graduatesTo: null
doneWhen:
  probe: script
  args:
    command: node scripts/checks/system-table-retention-budget.js --metric
    target: 0
quests:
  - retention-step-history-observation-removal
  - log-retention-owner-wiring
  - replica-operation-retention-owner
  - partition-statement-outcome-retention
  - transaction-table-retention
  - service-and-artifact-table-retention
authorizes:
  - scripts/checks/system-table-retention-budget.js
  - src/rebalancer
  - src/logging
  - src/partition
  - src/query
  - src/control-plane/owners
  - src/node
  - test
  - docs
  - architecture/contracts
  - package.json
  - solve/epics
  - solve/quests
---

# System table retention

Every system table and every partition-internal bookkeeping table has a
declared lifetime: bounded by nature, retained by a named owner, or
explicitly unbounded debt. The unbounded ones are retired slice by slice,
without deleting a row another owner still relies on. Today most tables that
record work (operations, reservations, transactions, statement outcomes,
logs) only grow; a propagated one grows in every node's cache and in every
joiner's hydration as well.

Origin: owner request, 2026-11-11, during the formation-stability takeover.
A read-only census that day produced the baseline below. This epic exists so
the work is recorded and not forgotten; all six quests are unsealed
proposals, and none is started by this record.

`doneWhen` reads the committed lifetime declaration,
[`table-lifetimes.json`](system-table-retention/table-lifetimes.json),
against `TABLES` in `src/constants/tables.js`. The checker
`scripts/checks/system-table-retention-budget.js` refuses (no count) when a
table in `TABLES` has no entry, an entry names a table that does not exist,
a `retained` entry names no `file:symbol` owner found in the tree, or an
`unbounded` entry names no quest record; otherwise it prints the number of
tables classed `unbounded`. The target is 0 and the baseline is 24: 22
system tables and 2 partition-internal tables. A new table therefore cannot
be added without declaring its lifetime (R13). The checker only reads files
(R27).

## Binding constraints

1. **Deletion waits for formation and CDC delivery.** No row is deleted from
   `replica_operations`, `storage_reservations` or the transaction tables
   before the fresh-formation scenario holds three consecutive lab passes and
   CDC delivery stages 1 to 3
   ([design note](operation-integrity-and-reliable-formation/cdc-delivery-design-note-2026-11-11.md))
   have landed.
2. **One retention owner per table, one path** (R01, R11). Retention rides
   an existing reconcile trigger. It adds no timer.
3. **Terminal, past the horizon, and unreferenced.** A row is deleted only
   when it is terminal AND past a per-table horizon AND proven unreferenced
   by every dependency listed for that table. Deletes are guarded and
   idempotent (R14) and run in bounded batches that respect the
   cache-tombstone bound.
4. **No time-based apply-side expiry for propagated tables.** It bypasses
   CDC and leaves caches stale. Position-based reclamation inside apply is
   the model for partition-internal tables.
5. **Retention never changes what a retry answers without an explicit
   ruling.** Open owner ruling: what does a deterministic-intent retry answer
   when its earlier terminal row has been retired?
6. **Observations do not belong in durable authority rows** (the
   `readinessSnapshot` finding below; R10).
7. **Unwired retention code is wired or deleted, not kept** (no-legacy
   rule): `src/logging/log-retention-service.js` and
   `sweepExpiredReservations`.
8. **No health table.** Health and observability data is exposed through
   explicit collection functions, never a table (owner direction,
   2026-11-11). That work is out of scope here; it is named so that nobody
   adds a health table under this epic.

The lifetime declaration follows the code. A table leaves class `unbounded`
only in the change that lands its retention owner or the owner ruling that
its rows are kept with a stated bound. Editing the declaration to lower the
metric ahead of the code is the one way to make this epic green without
doing it.

## Baseline: the 2026-11-11 census

Source: a read-only census on 2026-11-11 of the working tree at HEAD
`103f132c1` plus the uncommitted work then in the checkout. It covered the
46 system tables in `src/constants/tables.js` and the CDC propagation flags
in `src/cache/cdc-table-policy.js`. A propagated table's rows live in every
node's cache and in every joiner's hydration.

What was checked again while this epic was registered, on the same tree:
the 46 table names and that the four classes partition them (22 + 13 + 4 +
7); that `src/logging/log-retention-service.js` is imported only by its own
test; the deleting symbols named as owners in the declaration; and where
`sweepExpiredReservations` lives (see the findings). Everything else below
is the census as reported and was **not independently verified**: the
per-table "never deleted" and "no caller" claims, the scan counts, the
propagation flags, the dependency list for a terminal `replica_operations`
row, the mechanics, and the lab measurement.

### Unbounded (22 system tables, 2 partition-internal)

| Table | Propagated | Census finding | Quest |
| --- | --- | --- | --- |
| `replica_operations` | yes | One row per ADD, REMOVE or REPLACE; the whole row is rewritten per step; never deleted (`ReplicaOperationsOwner.removeReplicaOperation` has no caller). Read with `SELECT *` everywhere; full-table scans in `getAllOperations`, `queryTerminalFailedCreateCleanupOperations` and storage accounting; 12 repository cache scans parse `steps_history`. | `replica-operation-retention-owner`; row size first by `retention-step-history-observation-removal` |
| `storage_reservations` | yes | One row per storage-increasing operation; status only moves to released or expired. | `replica-operation-retention-owner` |
| `control_plane_publications` | yes | One row per membership epoch and node boot, with `transition_history` JSON; `removePublication` is uncalled. | `service-and-artifact-table-retention` |
| `sql_transactions`, `sql_transaction_participants` | yes | Never deleted; scanned in full every second by the recovery sweep. | `transaction-table-retention` |
| `sql_write_operations` | no | Write-only. | `transaction-table-retention` |
| `logs` | no | `LogsTableService` bounds only its in-memory queue. `src/logging/log-retention-service.js` (7-day horizon) exists and nothing in `src` imports it. | `log-retention-owner-wiring` |
| `wasm_operations` | | The 24 h window is only a read-side refusal. | `service-and-artifact-table-retention` |
| `call_cell_reduce_results` | | Published rows stay. | `service-and-artifact-table-retention` |
| `schema_migrations`, `schema_migration_partitions` | | Never deleted. | `service-and-artifact-table-retention` |
| `service_installations`, `service_install_failures`, `service_revisions`, `service_packages`, `service_bindings`, `module_manifests` | | Never deleted. | `service-and-artifact-table-retention` |
| `artifact_payloads`, `artifact_payload_chunks` | | Reclaimable UPLOADING rows have no reclaim code. | `service-and-artifact-table-retention` |
| `debug_sessions`, `debug_breakpoints`, `debug_snapshots` | | Never deleted. | `service-and-artifact-table-retention` |
| `_partition_statement_outcomes` (partition-internal) | n/a | One row per committed statement in every partition; carried in snapshots; no DELETE exists. Its own comment defers the bound to "the snapshot/log-bound quest". | `partition-statement-outcome-retention` |
| `_participant_transactions` (partition-internal) | n/a | No retirement. | `partition-statement-outcome-retention` |

An empty "Propagated" cell means the census did not report the flag for
that table.

### Bounded by nature (13)

`nodes`, `partitions`, `tables`, `config`, `node_endpoints`,
`message_groups`, `latency_groups`, `inter_group_latencies`,
`service_definitions`, `service_instances` (deletion is explicitly
forbidden: a missing row is `CORRUPT_STATE`), `call_activation_leases`,
`service_partition_access`, `schema_operations`.

### Already retained (4 system tables, 1 partition-internal)

- `services`: cleanup tombstones, released by
  `ReplicaCleanupTombstoneOwner.release`, a guarded DELETE through
  `gateway.submitMutation`. **The model for propagated tables.**
- `service_endpoints`, `indices`, `call_cell_reduce_slots`.
- `partitions` on split and merge (counted above as bounded by nature).
- `_cdc_obligations`: D1 reclamation, `reclaimDeliveredCdcObligations` in
  `src/partition/partition-cdc-obligation-ledger.js` (about line 297), a
  position-based delete inside apply. **The model for partition-internal
  tables.**

### Inert (7): no production writer found

`service_timers`, `live_queries`, `contexts`, `code`,
`package_registry_mappings`, `package_registry_overrides`,
`module_dependency_locks`.

This is a finding for the owner, not a quest: delete each table or name its
writer. Until then they stay declared `inert`, which does not count toward
the metric.

### Measured row size

On a lab formation (3 nodes, 10 minutes): a `replica_operations` row is
about 13 KB; `steps_history` is 10.6 KB at p50 and 14.7 KB at p90; about
80 % of each history entry is an embedded `readinessSnapshot`. A 7-step
operation ships about 56 KB through the ledger's Raft log and CDC.

### What references a terminal `replica_operations` row

A retention rule must prove "unreferenced", not just "old and terminal".
The census found these references:

- the terminal-intent collision (`OPERATION_INTENT_TERMINAL_COLLISION`,
  `src/rebalancer/rebalance-coordinator-operation-persistence-collision.js`):
  if the row is gone, a retry silently becomes a fresh execution;
- the REPLACE successor identity, built from the predecessor id;
- schema-job cohort attachment by (job, node) intent id
  (`readSchemaJobEstablishedBootstrapCohort`);
- `ReplicaCleanupTombstoneOwner.isCleanupOperationTerminal`;
- `queryTerminalFailedCreateCleanupOperations`;
- message-group membership debt;
- ACTIVE storage reservations.

`steps_history` entry 0 is the operation's metadata channel, and the history
is a strictly-extending transition mirror. Never cap it by count.

### Mechanics a retention design has to live with

- A system-table delete is per row by primary key: one Raft proposal each,
  plus one CDC obligation and one delivery per recipient for a propagated
  table. There is no ranged delete for propagated tables.
- Cache tombstones are bounded: 30 s TTL and 1024 per table. A batch faster
  than about 1024 rows per 30 s per table evicts them early.
- A late upsert after tombstone expiry can resurrect a cache row until the
  next authoritative absence sweep.
- There is no SQLite vacuum. Deletes bound memory, caches and snapshot size,
  not file size.
- Snapshots include the partition-internal tables.
- Not established: whether follower Raft logs are compacted.

## Quests

All six are unsealed proposals: a record and a registration finding, no
seal. Sizes are the census estimate.

**retention-step-history-observation-removal** (S). Stop embedding
`readinessSnapshot` in `replica_operations.steps_history`; keep entry-0
metadata and the transition mirror; keep the evidence as a log line; fix the
size with a row-size regression test. Deletes no row, so constraint 1 does
not hold it. Implementation started on 2026-11-11 inside the
formation-stability work; the quest carries the acceptance if that work
lands separately.

**log-retention-owner-wiring** (S to M). Wire or delete
`LogRetentionService`; bound `logs` rows by horizon at background priority;
decide the pressure class.

**replica-operation-retention-owner** (L). One retention owner for terminal
`replica_operations` and `storage_reservations` rows, with a
referenced-predicate per dependency above. Needs the ruling in constraint 5.
Deterministic tests: a retry after retirement, cleanup release after
retirement, tombstone-cap pacing, a joiner hydrating mid-batch. Lab: three
formations and a churn soak.

**partition-statement-outcome-retention** (L). A position-based bound for
`_partition_statement_outcomes` and `_participant_transactions`, tied to the
snapshot boundary. Needs a ruling on the retry-dedupe horizon. Carries
`sweepExpiredReservations` (see the findings).

**transaction-table-retention** (L). `sql_transactions`,
`sql_transaction_participants` and `sql_write_operations`. Coupled to 2PC
recovery, the release-census digest and settlement's row-absent refusal. The
one-second full-table recovery scan is a load finding carried here.

**service-and-artifact-table-retention** (M). `wasm_operations` (the 24 h
window), `call_cell_reduce_results`, `control_plane_publications`, the
service install, revision and package tables, artifact payloads (UPLOADING
reclaim), the debug tables, and schema migrations. One table family per
attempt.

## Current summary (2026-11-11)

- **Baseline.** 24 tables declared `unbounded`; the probe measures 24 and is
  red.
- **Active work.** None sealed. The step-history change is in progress
  inside the formation-stability work, outside this epic.
- **Blockers.** Constraint 1 holds every deletion on the operation,
  reservation and transaction tables. Two owner rulings are open: the retry
  answer after retirement (constraint 5) and the retry-dedupe horizon for
  statement outcomes.
- **Next action.** The owner rules on the two questions and on the inert
  tables. `log-retention-owner-wiring` is the first quest that can be sealed
  without a ruling or the gate.

## Findings recorded at registration

- **Inert tables** (owner): the seven tables above have no production writer
  in the census. Delete them or name their writers.
- **`sweepExpiredReservations` is not about `storage_reservations`.** It is
  in `src/partition/partition-locking-read-reservation.js`, deletes expired
  rows of the partition-internal `_lagrange_locking_read_reservations` table
  by wall clock, and its only caller is a test. It is carried by
  `partition-statement-outcome-retention`.
- **`call_cell_reduce_results` has a partial reclaim.**
  `reclaimExpiredCoordination` in `src/runtime/call-cell-reduce-coordinator.js`
  deletes abandoned empty result rows along with expired slot rows; only
  published rows stay, as the census said.
- **Partition-internal tables outside the census.** `_cdc_obligation_progress`,
  `_partition_write_generation`, `_lagrange_locking_read_reservations`,
  `_raft_state` and `_raft_log` appear in `src` and are not in the lifetime
  declaration: the checker can enforce coverage only for `TABLES`, because
  partition-internal tables have no single vocabulary. Their lifetimes are
  established by `partition-statement-outcome-retention` before it is
  sealed, and each is added to the declaration then.
- **Test registration.** `test/scripts/system-table-retention-budget.test.js`
  is not in a `test/shards` file yet; it is registered when the epic record
  is landed.
