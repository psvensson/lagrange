# Detailed design: Resumable bulk data load

Quest: `resumable-bulk-data-load` (Q8). Requirements contract:
[`requirements.md`](requirements.md) "Bulk load". Epic:
[`solve/epics/pilot-readiness-and-public-proof.md`](../../epics/pilot-readiness-and-public-proof.md);
binding decisions cited as D1–D12.

## Owner boundaries touched

- Writes route through the canonical SQL/transaction owners — no bypass
  write path, no second transaction coordinator (D11):
  `src/query/sql-query-engine-statement-execution.js` and
  `src/query/sql-query-engine-write-execution.js` (statement/write
  execution), `src/query/query-executor.js` +
  `src/query/query-executor-write-retry-routing.js` (leader routing/retry),
  `src/query/distributed/distributed-transaction-coordinator.js` (2PC).
- The loader is a new CLI command following the existing per-domain router
  pattern (`src/cli/service-command-router.js` /
  `src/cli/service-pipeline-router.js`): a `*-command.js` owner plus a
  `*-router.js` argv parser wired from the `lagrange` entry
  (`src/sea-entry.js` per `package.json` `bin`).
- The loader owns exactly two new things: checkpoint identity and replay.
  Checkpoint/reject records are durable rows written through the same
  canonical write path, insert-only with fresh keys.
- Independent verification reads go through pgwire
  (`src/runtime/pgwire-protocol-handler.js`) as an external client — never
  through the loader's own counters (D7).

## Contract shape

### Source format (first scope)

One narrow format: newline-delimited canonical JSON records with an explicit
schema document. CSV is deferred (**open** below). PostgreSQL CDC is
excluded from this Quest by sealed constraint.

### Load manifest

A load is declared by a versioned manifest sealed before the first write:

- `loadId` (unique, minted once), `manifestVersion: 1`
- target table name; explicit schema (columns, types, declared primary key)
- `schemaDigest` — digest of the schema document
- source descriptor: file/stream identity plus `sourceDigest` when the
  source is sealable
- batch bounds: max rows and max bytes per batch

The declared primary key is required: it is the row identity for replay and
reconciliation.

### Checkpoint identity

Progress is a chain of durable checkpoint records, insert-only fresh keys:

- `loadId`, `checkpointSeq` (0-based, gapless, monotonic)
- `sourceOffset` — byte offset plus record index into the versioned stream
- `rowsApplied`, `rowsRejected` (cumulative), `batchChecksum` (digest of the
  batch's canonical source bytes), `schemaDigest`

A checkpoint is written only after its batch's transaction is acknowledged
by the canonical write path. A checkpoint is never rewritten; recovery reads
the highest durable `checkpointSeq`.

### Batch execution and idempotent replay

- Each batch = one bounded transaction through the canonical write path.
- Batch identity is `(loadId, checkpointSeq)`; the batch's row set is a
  deterministic function of `sourceOffset` and the batch bounds, so replay
  re-reads exactly the same source bytes (verified by `batchChecksum`).
- Restart resumes at the checkpoint chain head: the next batch starts at the
  recorded `sourceOffset`. A batch that executed but never checkpointed
  (ambiguous) is re-executed identically; row-level idempotency makes the
  re-execution safe (mechanism **open** below, requirement sealed: replay of
  a partially applied batch yields no duplicates and no gaps).

### Rejected rows

Malformed or schema-violating rows never abort the load silently and never
disappear: each produces a durable reject record (`loadId`, source record
index, reason code, bounded excerpt) and is excluded from `rowsApplied`.
Rejects are reported explicitly at completion.

### Completeness proof (independent)

Completion is proven against the source, not the loader (D7):

- an independently computed source checksum over key ranges, compared to
  target key-range digests read via pgwire, and
- a key-range sample comparison (row-by-row equality on sampled ranges).

The loader's own success counters are diagnostic only and can never close
the scenario.

## Failure semantics (D12)

Fail closed, typed, durable:

- Schema drift: manifest `schemaDigest` mismatch against the target table or
  a later stream header → refuse before any write.
- Source truncation or offset regression (stream shorter than a durable
  checkpoint claims, or `batchChecksum` mismatch on replay) → refuse; never
  re-derive a "close enough" offset.
- Loader kill/restart mid-batch and cluster-node kill/restart mid-import:
  resume from the checkpoint chain with no duplicates and no gaps — the
  sealed red-on-revert case.
- Duplicate batch replay after a lost ack: idempotent by batch identity.
- Reconciliation mismatch (checksum or sample) → the load verdict is failed
  regardless of loader counters.
- Removing checkpoint identity or idempotent replay must fail
  reconciliation deterministically (red-on-revert).

## Non-goals and edition boundaries

- No PostgreSQL CDC, no change feeds — that boundary belongs to Q9's spec
  ([`cutover-rollback.md`](cutover-rollback.md)) and its external adapter.
- No bypass write path, no direct-to-partition injection, no second
  transaction coordinator (D11).
- Single-table loads in v1; multi-table orchestration is Q9's plan layer.
- No backup/restore/PITR semantics (D9; commercial companion epic).
- Community/AGPL scope per `edition-matrix.md`.

## Open decisions left to the Quest

- Row-level idempotency mechanism for ambiguous-batch replay: idempotent
  insert keyed on the declared primary key scoped to the load vs per-row
  existence probe before apply. Either must keep the no-duplicates/no-gaps
  invariant and stay inside the canonical write path.
- CSV-with-schema as a second input format (deferred unless the pilot needs
  it).
- Checkpoint/reject table naming and schema registration (system-table
  registration follows `src/bootstrap/system-table-workflow-schema-definitions.js`
  precedent).
- Batch-bound numeric defaults and their CLI override surface.
- Parallelism: v1 is a single ordered stream; whether key-range-parallel
  loading is admitted later is a separate contract change.
