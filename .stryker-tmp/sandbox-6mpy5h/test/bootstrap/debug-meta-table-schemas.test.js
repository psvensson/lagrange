/**
 * Unit tests for debug metadata system-table constants and schemas.
 */
// @ts-nocheck


import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {TABLES} from '../../src/constants/tables.js';
import {
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  DEBUG_SESSIONS_SCHEMA,
  DEBUG_BREAKPOINTS_SCHEMA,
  DEBUG_SNAPSHOTS_SCHEMA,
  generateCreateTableSQL,
  generateCreateIndexSQL,
  getSchemaByTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CACHE_SYSTEM_TABLES,
  CACHE_PRIMARY_KEY_FIELDS,
  CACHE_HYDRATION_TABLES,
  CDC_PROPAGATED_TABLES,
  CDC_NON_PROPAGATED_TABLES,
} from '../../src/cache/cache-constants.js';

const DEBUG_TABLES = [
  TABLES.DEBUG_SESSIONS,
  TABLES.DEBUG_BREAKPOINTS,
  TABLES.DEBUG_SNAPSHOTS,
];

describe('debug metadata table constants', () => {
  it('defines debug table names in TABLES', () => {
    assert.equal(TABLES.DEBUG_SESSIONS, 'debug_sessions');
    assert.equal(TABLES.DEBUG_BREAKPOINTS, 'debug_breakpoints');
    assert.equal(TABLES.DEBUG_SNAPSHOTS, 'debug_snapshots');
  });

  for (const tableName of DEBUG_TABLES) {
    it(`registers ${tableName} in SYSTEM_TABLE_NAME`, () => {
      const key = Object.keys(SYSTEM_TABLE_NAME).find(
        (name) => SYSTEM_TABLE_NAME[name] === tableName,
      );
      assert.ok(key);
    });

    it(`registers ${tableName} in SYSTEM_TABLE_SCHEMAS`, () => {
      const schema = SYSTEM_TABLE_SCHEMAS.find(
        (entry) => entry.tableName === tableName,
      );
      assert.ok(schema);
    });

    it(`registers ${tableName} partition and replica IDs`, () => {
      const partitionId = INITIAL_PARTITION_IDS[tableName];
      const replicaIds = INITIAL_REPLICA_IDS[tableName];
      assert.ok(partitionId);
      assert.ok(Array.isArray(replicaIds));
      assert.equal(replicaIds.length, 3);
    });

    it(`registers ${tableName} in cache tables`, () => {
      assert.ok(CACHE_SYSTEM_TABLES.includes(tableName));
      if (tableName === TABLES.DEBUG_SESSIONS) {
        assert.ok(CDC_PROPAGATED_TABLES.includes(tableName));
        assert.ok(CACHE_HYDRATION_TABLES.includes(tableName));
      } else {
        assert.ok(CDC_NON_PROPAGATED_TABLES.includes(tableName));
        assert.ok(!CACHE_HYDRATION_TABLES.includes(tableName));
      }
      assert.ok(CACHE_PRIMARY_KEY_FIELDS[tableName]);
    });

    it(`finds ${tableName} schema by table lookup`, () => {
      const schema = getSchemaByTableName(tableName);
      assert.ok(schema);
      assert.equal(schema.tableName, tableName);
    });
  }
});

describe('DEBUG_SESSIONS_SCHEMA', () => {
  it('uses session_id as primary key', () => {
    const column = DEBUG_SESSIONS_SCHEMA.columns.find(
      (entry) => entry.name === 'session_id',
    );
    assert.equal(column.primaryKey, true);
  });

  it('requires tenant/service ownership columns', () => {
    const tenant = DEBUG_SESSIONS_SCHEMA.columns.find(
      (entry) => entry.name === 'tenant_id',
    );
    const service = DEBUG_SESSIONS_SCHEMA.columns.find(
      (entry) => entry.name === 'service_name',
    );
    assert.equal(tenant.notNull, true);
    assert.equal(service.notNull, true);
  });

  it('defaults status to active', () => {
    const status = DEBUG_SESSIONS_SCHEMA.columns.find(
      (entry) => entry.name === 'status',
    );
    assert.equal(status.defaultValue, '\'active\'');
  });
});

describe('DEBUG_BREAKPOINTS_SCHEMA', () => {
  it('uses breakpoint_id as primary key', () => {
    const column = DEBUG_BREAKPOINTS_SCHEMA.columns.find(
      (entry) => entry.name === 'breakpoint_id',
    );
    assert.equal(column.primaryKey, true);
  });

  it('enforces source mapping columns', () => {
    const moduleRef = DEBUG_BREAKPOINTS_SCHEMA.columns.find(
      (entry) => entry.name === 'module_ref',
    );
    const sourceFile = DEBUG_BREAKPOINTS_SCHEMA.columns.find(
      (entry) => entry.name === 'source_file_url',
    );
    const lineNumber = DEBUG_BREAKPOINTS_SCHEMA.columns.find(
      (entry) => entry.name === 'line_number',
    );
    assert.equal(moduleRef.notNull, true);
    assert.equal(sourceFile.notNull, true);
    assert.equal(lineNumber.notNull, true);
  });

  it('defaults unresolved breakpoints to false-like integer', () => {
    const resolved = DEBUG_BREAKPOINTS_SCHEMA.columns.find(
      (entry) => entry.name === 'resolved',
    );
    assert.equal(resolved.defaultValue, 0);
  });
});

describe('DEBUG_SNAPSHOTS_SCHEMA', () => {
  it('uses snapshot_id as primary key', () => {
    const column = DEBUG_SNAPSHOTS_SCHEMA.columns.find(
      (entry) => entry.name === 'snapshot_id',
    );
    assert.equal(column.primaryKey, true);
  });

  it('requires serialized payload columns', () => {
    const bytes = DEBUG_SNAPSHOTS_SCHEMA.columns.find(
      (entry) => entry.name === 'snapshot_bytes_base64',
    );
    const manifest = DEBUG_SNAPSHOTS_SCHEMA.columns.find(
      (entry) => entry.name === 'manifest_json',
    );
    assert.equal(bytes.notNull, true);
    assert.equal(manifest.notNull, true);
  });

  it('tracks capture counters as required columns', () => {
    for (const name of ['total_bytes', 'frame_count', 'host_call_count']) {
      const column = DEBUG_SNAPSHOTS_SCHEMA.columns.find(
        (entry) => entry.name === name,
      );
      assert.equal(column.notNull, true);
    }
  });
});

describe('debug schema SQL generation', () => {
  it('generates create SQL for debug_sessions', () => {
    const sql = generateCreateTableSQL(DEBUG_SESSIONS_SCHEMA);
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS'));
    assert.ok(sql.includes('debug_sessions'));
  });

  it('generates index SQL for debug_breakpoints', () => {
    const sql = generateCreateIndexSQL(DEBUG_BREAKPOINTS_SCHEMA);
    assert.equal(sql.length, 3);
    assert.ok(sql.some((line) => line.includes('idx_debug_breakpoints_session')));
  });

  it('generates index SQL for debug_snapshots', () => {
    const sql = generateCreateIndexSQL(DEBUG_SNAPSHOTS_SCHEMA);
    assert.equal(sql.length, 3);
    assert.ok(sql.some((line) => line.includes('idx_debug_snapshots_captured_at')));
  });
});
