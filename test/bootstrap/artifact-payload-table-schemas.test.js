/**
 * Registration guard for the internal artifact payload store tables
 * (cluster-owned-artifacts brief §1): artifact_payloads and
 * artifact_payload_chunks are fully five-point registered (TABLES,
 * SYSTEM_TABLE_NAME, schema, initial partition, initial replicas), the
 * generated DDL is well-formed for both the bootstrap and per-replica
 * paths, chunk uniqueness is index-enforced (the per-replica renderer
 * drops composite PKs), the chunk bytes column is TEXT (base64 — raw
 * binary does not survive the JSON-serialized Raft log), and neither
 * table enters CDC propagation or bootstrap hydration (payload bytes
 * never reach the system-table cache — a brief permanent invariant).
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {TABLES} from '../../src/constants/tables.js';
import {
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  generateCreateTableSQL,
  generateCreateIndexSQL,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ARTIFACT_PAYLOAD_STATE,
  ARTIFACT_PAYLOADS_SCHEMA,
  ARTIFACT_PAYLOAD_CHUNKS_SCHEMA,
} from '../../src/bootstrap/system-table-artifact-schema-definitions.js';
import {
  CACHE_SYSTEM_TABLES,
  CACHE_HYDRATION_TABLES,
  CDC_NON_PROPAGATED_TABLES,
} from '../../src/cache/cache-constants.js';

const NEW_TABLES = [
  TABLES.ARTIFACT_PAYLOADS,
  TABLES.ARTIFACT_PAYLOAD_CHUNKS,
];

describe('artifact payload table constants', () => {
  it('defines ARTIFACT_PAYLOADS', () => {
    assert.equal(TABLES.ARTIFACT_PAYLOADS, 'artifact_payloads');
  });

  it('defines ARTIFACT_PAYLOAD_CHUNKS', () => {
    assert.equal(TABLES.ARTIFACT_PAYLOAD_CHUNKS, 'artifact_payload_chunks');
  });

  for (const table of NEW_TABLES) {
    it(`includes ${table} in SYSTEM_TABLE_NAME`, () => {
      const key = Object.keys(SYSTEM_TABLE_NAME).find(
        (name) => SYSTEM_TABLE_NAME[name] === table,
      );
      assert.ok(key, `${table} missing from SYSTEM_TABLE_NAME`);
    });

    it(`includes ${table} in SYSTEM_TABLE_SCHEMAS`, () => {
      const schema = SYSTEM_TABLE_SCHEMAS.find(
        (entry) => entry.tableName === table,
      );
      assert.ok(schema, `${table} missing from SYSTEM_TABLE_SCHEMAS`);
    });

    it(`pins ${table} to a single initial partition`, () => {
      const partitionId = INITIAL_PARTITION_IDS[table];
      assert.ok(partitionId, `${table} missing from INITIAL_PARTITION_IDS`);
      assert.ok(partitionId.endsWith('-p1'));
    });

    it(`registers three initial replicas for ${table}`, () => {
      const replicaIds = INITIAL_REPLICA_IDS[table];
      assert.ok(replicaIds, `${table} missing from INITIAL_REPLICA_IDS`);
      assert.equal(replicaIds.length, 3);
    });
  }
});

describe('artifact payload schema shapes', () => {
  it('leads the chunk table with payload_digest so one payload\'s ' +
    'chunks co-locate (partition key is the first column)', () => {
    assert.equal(
      ARTIFACT_PAYLOAD_CHUNKS_SCHEMA.columns[0].name, 'payload_digest');
  });

  it('stores chunk bytes as TEXT base64, never a binary column', () => {
    const bytesColumn = ARTIFACT_PAYLOAD_CHUNKS_SCHEMA.columns.find(
      (column) => column.name === 'chunk_bytes_base64');
    assert.ok(bytesColumn, 'chunk_bytes_base64 column missing');
    assert.equal(bytesColumn.type, 'TEXT');
  });

  it('enforces (payload_digest, chunk_number) uniqueness by index — ' +
    'the per-replica DDL drops composite primary keys', () => {
    const uniqueIndex = ARTIFACT_PAYLOAD_CHUNKS_SCHEMA.indices.find(
      (index) => index.unique === true);
    assert.ok(uniqueIndex, 'unique chunk index missing');
    assert.deepEqual(uniqueIndex.columns, ['payload_digest', 'chunk_number']);
  });

  it('defaults the payload lifecycle to UPLOADING and names both ' +
    'monotonic states', () => {
    assert.deepEqual(
      Object.keys(ARTIFACT_PAYLOAD_STATE).sort(),
      ['SEALED', 'UPLOADING'],
    );
    const stateColumn = ARTIFACT_PAYLOADS_SCHEMA.columns.find(
      (column) => column.name === 'state');
    assert.ok(
      stateColumn.defaultValue.includes(ARTIFACT_PAYLOAD_STATE.UPLOADING));
  });

  it('joins payloads back to immutable artifact identity', () => {
    const artifactDigest = ARTIFACT_PAYLOADS_SCHEMA.columns.find(
      (column) => column.name === 'artifact_digest');
    assert.ok(artifactDigest);
    assert.equal(artifactDigest.notNull, true);
    const digestIndex = ARTIFACT_PAYLOADS_SCHEMA.indices.find(
      (index) => index.columns.includes('artifact_digest'));
    assert.ok(digestIndex, 'artifact_digest lookup index missing');
  });

  for (const schema of [
    ARTIFACT_PAYLOADS_SCHEMA,
    ARTIFACT_PAYLOAD_CHUNKS_SCHEMA,
  ]) {
    it(`generates well-formed DDL for ${schema.tableName}`, () => {
      const createTable = generateCreateTableSQL(schema);
      assert.ok(createTable.includes(schema.tableName));
      for (const indexSql of generateCreateIndexSQL(schema)) {
        assert.ok(indexSql.includes(schema.tableName));
      }
    });
  }
});

describe('artifact payload cache and CDC boundaries', () => {
  for (const table of NEW_TABLES) {
    it(`registers ${table} for schema validation`, () => {
      assert.ok(CACHE_SYSTEM_TABLES.includes(table));
    });

    it(`keeps ${table} OUT of bootstrap hydration`, () => {
      assert.ok(!CACHE_HYDRATION_TABLES.includes(table),
        `${table} must not hydrate payload data into the cache`);
    });

    it(`keeps ${table} OUT of CDC propagation`, () => {
      assert.ok([...CDC_NON_PROPAGATED_TABLES].includes(table),
        `${table} must not propagate through CDC`);
    });
  }
});
