/**
 * Internal artifact payload store schemas (brief:
 * docs/development/cluster-owned-artifacts-parallel-dispatch-brief.md §1).
 *
 * Two replicated system tables make the cluster the durable owner of
 * installed wasm_component payload bytes, through the NORMAL
 * partition/Raft/SQLite path — no separate blob store:
 *
 *  - `artifact_payloads` — one row per immutable payload identity: the
 *    sealed metadata (total size, expected chunk count, media type,
 *    artifact identity join, UPLOADING -> SEALED lifecycle). An Artifact
 *    must not become bindable before its payload row is SEALED.
 *  - `artifact_payload_chunks` — bounded chunks of the payload bytes.
 *    `payload_digest` leads the column list so one payload's chunks
 *    co-locate on one partition (partition key is the first column).
 *    Uniqueness of (payload_digest, chunk_number) is enforced by the
 *    unique index — the durable per-replica DDL path drops composite
 *    PRIMARY KEY clauses, so the index is the loud-failure seam for a
 *    conflicting rewrite.
 *
 * Chunk bytes ride as base64 TEXT (`chunk_bytes_base64`), NOT as a
 * binary column: Raft log entries are JSON-serialized
 * (src/raft/sqlite-log-adapter.js) and transport frames are JSON text,
 * so raw binary SQL parameters do not survive replication. The ~33%
 * encoding overhead is the price of staying on the normal replicated
 * write path.
 *
 * Both tables are CDC class CONTROL_NO_INTERNAL_PROPAGATION: payload
 * bytes never enter the system-table cache or the CDC propagation path
 * (a brief-level permanent invariant).
 */

import {
  COLUMN_TYPE,
  SYSTEM_TABLE_NAME,
} from './system-table-schema-shared-constants.js';

// Monotonic payload lifecycle: rows are created UPLOADING and flip to
// SEALED exactly once, after every chunk is durable and the assembled
// payload re-verified. There is no third state and no regression edge;
// failures before sealing leave a reclaimable UPLOADING row that never
// becomes bindable.
const ARTIFACT_PAYLOAD_STATE = Object.freeze({
  UPLOADING: 'UPLOADING',
  SEALED: 'SEALED',
});

const ARTIFACT_PAYLOADS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.ARTIFACT_PAYLOADS,
  columns: [
    {name: 'payload_digest', type: COLUMN_TYPE.TEXT, primaryKey: true},
    {name: 'artifact_digest', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'media_type', type: COLUMN_TYPE.TEXT, notNull: true},
    {
      name: 'total_size',
      type: COLUMN_TYPE.INTEGER,
      notNull: true,
      defaultValue: '0',
    },
    {
      name: 'chunk_count',
      type: COLUMN_TYPE.INTEGER,
      notNull: true,
      defaultValue: '0',
    },
    {
      name: 'state',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: `'${ARTIFACT_PAYLOAD_STATE.UPLOADING}'`,
    },
    {
      name: 'created_at',
      type: COLUMN_TYPE.INTEGER,
      notNull: true,
      defaultValue: '0',
    },
    {
      name: 'sealed_at',
      type: COLUMN_TYPE.INTEGER,
      notNull: true,
      defaultValue: '0',
    },
  ],
  indices: [
    {
      name: 'idx_artifact_payloads_artifact_digest',
      columns: ['artifact_digest'],
    },
  ],
};

const ARTIFACT_PAYLOAD_CHUNKS_SCHEMA = {
  tableName: SYSTEM_TABLE_NAME.ARTIFACT_PAYLOAD_CHUNKS,
  primaryKey: ['payload_digest', 'chunk_number'],
  columns: [
    {name: 'payload_digest', type: COLUMN_TYPE.TEXT, notNull: true},
    {name: 'chunk_number', type: COLUMN_TYPE.INTEGER, notNull: true},
    {name: 'chunk_digest', type: COLUMN_TYPE.TEXT, notNull: true},
    {
      name: 'chunk_size',
      type: COLUMN_TYPE.INTEGER,
      notNull: true,
      defaultValue: '0',
    },
    {
      name: 'chunk_bytes_base64',
      type: COLUMN_TYPE.TEXT,
      notNull: true,
      defaultValue: '\'\'',
    },
  ],
  indices: [
    {
      name: 'uidx_artifact_payload_chunk',
      columns: ['payload_digest', 'chunk_number'],
      unique: true,
    },
  ],
};

export {
  ARTIFACT_PAYLOAD_STATE,
  ARTIFACT_PAYLOADS_SCHEMA,
  ARTIFACT_PAYLOAD_CHUNKS_SCHEMA,
};
