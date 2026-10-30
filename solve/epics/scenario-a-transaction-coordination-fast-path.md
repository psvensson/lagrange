---
id: scenario-a-transaction-coordination-fast-path
status: done
proof: deterministic
roadmapRow: null
doneWhen:
  probe: script
  args:
    command: node scripts/checks/scenario-a-transaction-coordination-fast-path-guard.js --metric
quests:
  - scenario-a-transaction-coordination-fast-path
authorizes:
  - CHANGELOG.md
  - RELEASE.md
  - charts/lagrange-node/Chart.yaml
  - data/tidb-comparison
  - docs/benchmarks
  - knip.json
  - package-lock.json
  - package.json
  - scripts/check-cognitive-complexity.js
  - scripts/check-duplication.js
  - scripts/checks
  - solve/changes
  - solve/epics
  - src/cli/cli-constants.js
  - src/constants/entrypoint.js
  - src/partition
  - src/query
  - src/raft
  - src/workflow
  - test/distributed
  - test/partition
  - test/query
  - test/raft
  - test/shards
  - test/transaction
---

# Scenario A Transaction Coordination Fast Path (0.3.3)

## Intent (why now)

Deliver a structural reduction in per-transaction coordination, participant phase
serialization, partition holding time, staging replay, composite-key partition
scattering, and repeated SQLite compilation/persistence overhead across the
Scenario A (`tidb-oltp-baseline`) public SQL path, backed by per-transaction
time-breakdown telemetry.

## Verified Findings & Priority Order

1. **Transaction Path Time-Breakdown Tracer**:
   - Instrument `DistributedTransactionCoordinator`, participant staging, determinism
     classification, and `RaftRsDurableStore` to report per-transaction latency and
     operation counts (`BEGIN`, per-statement execution, `PREPARE`, decision
     persistence, `COMMIT`, metadata mutations/reads, participant concurrency,
     staging replays, determinism cache hits, and Raft durable syncs).
2. **Priority 1 — Reduce Repeated Durable Transaction Bookkeeping**:
   - Remove duplicate `persistParticipants(tx, newlyEnlisted)` in `enlistParticipantsOwned`.
   - Remove unchanged `ACTIVE` transaction status progress writes in `enlistParticipantsOwned`,
     `recordWriteOperation`, and `markWriteOperationResult`.
   - Avoid unconditional authoritative readback after `persistDistributedTransactionParticipantSet`
     when the guarded compare-and-set `UPDATE` succeeds with `affectedRows === 1`,
     while preserving authoritative readback on `0` affected rows, missing counts, or lost
     mutation answers.
   - Defer `PENDING` write-operation persistence during `executeWriteStatement` so
     `sql_write_operations` is persisted once with the statement outcome.
3. **Priority 2 — Overlap Independent Participant Enlistment, Prepare, Commit, and Rollback**:
   - Execute multi-participant `BEGIN` enlistment, `PREPARE`, `COMMIT`, and `ROLLBACK`
     stages concurrently under the transaction owner's contract while keeping generic
     `DurableWorkflowCoordinator.executeParticipantStage` sequential and preserving
     insert-once decision ordering after all `PREPARE` evidence is retained.
4. **Priority 3 — Shorten Partition Holding Time & Selective Row-Key Concurrency**:
   - Shorten partition occupancy via Priorities 1 and 2.
   - Add opt-in row-key-selective concurrent participant session staging (`concurrencyGranularity: 'row-key'`)
     alongside the default partition-wide TX1 session fence, with paired same-partition
     disjoint-key vs. multi-partition concurrency experiments.
5. **Priority 4 — Reduce Repeated Replay During Transaction Staging**:
   - Reuse pre-admitted/compiled statements during staging replay when `schema_version`
     and partition write generation are unchanged, execute read-only session queries
     directly when zero writes are staged, and preserve `REPLAY_DIVERGED` detection.
6. **Priority 5 — Composite Partition Pruning, Selective Local Indexing & Locking-Read Profile**:
   - Extend `resolveCompositeKeyPartitions` to prune composite-key partitions by leftmost
     equality prefix and trailing range/IN bounds before falling back to scatter.
   - Add selective local compound index `idx_orders_customer_latest ON orders (warehouse_id, district_id, customer_id, order_id)`
     and configurable `lockingReadMode` (`snapshot-write-conflict` vs `native-for-update`)
     in `lagrange-oltp-adapter.js`.
7. **Priority 6 — SQLite Determinism Compilation Cache & Raft Durable Sync Telemetry**:
   - Cache compiled SQLite statements, `EXPLAIN` program validation, and root-page sets
     keyed by `(db, schema_version, tableName, sql)` in `partition-transaction-determinism.js`.
   - Cache active `PRAGMA synchronous` state and track durable sync counts/durations
     in `RaftRsDurableStore`.
