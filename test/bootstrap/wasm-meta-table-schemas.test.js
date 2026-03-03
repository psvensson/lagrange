/**
 * Unit tests for WASM meta-service table constants and bootstrap schemas.
 *
 * Validates that the five new system tables (module_manifests,
 * package_registry_mappings, package_registry_overrides,
 * module_dependency_locks, wasm_operations) are properly defined
 * with constants, schemas, partition IDs, and replica IDs.
 *
 * Requirements: 5.2, 10.1, 10.2
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {TABLES} from '../../src/constants/tables.js';
import {COLUMN} from '../../src/constants/columns.js';
import {
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  MODULE_MANIFESTS_SCHEMA,
  PACKAGE_REGISTRY_MAPPINGS_SCHEMA,
  PACKAGE_REGISTRY_OVERRIDES_SCHEMA,
  MODULE_DEPENDENCY_LOCKS_SCHEMA,
  WASM_OPERATIONS_SCHEMA,
  generateCreateTableSQL,
  generateCreateIndexSQL,
  getSchemaByTableName,
  getInitialPartitionId,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CACHE_SYSTEM_TABLES,
  CACHE_PRIMARY_KEY_FIELDS,
  CACHE_HYDRATION_TABLES,
  CDC_NON_PROPAGATED_TABLES,
} from '../../src/cache/cache-constants.js';

const NEW_TABLES = [
  TABLES.MODULE_MANIFESTS,
  TABLES.PACKAGE_REGISTRY_MAPPINGS,
  TABLES.PACKAGE_REGISTRY_OVERRIDES,
  TABLES.MODULE_DEPENDENCY_LOCKS,
  TABLES.WASM_OPERATIONS,
];

describe('WASM meta table constants in TABLES', () => {
  it('should define MODULE_MANIFESTS', () => {
    assert.equal(TABLES.MODULE_MANIFESTS, 'module_manifests');
  });

  it('should define PACKAGE_REGISTRY_MAPPINGS', () => {
    assert.equal(
      TABLES.PACKAGE_REGISTRY_MAPPINGS,
      'package_registry_mappings',
    );
  });

  it('should define PACKAGE_REGISTRY_OVERRIDES', () => {
    assert.equal(
      TABLES.PACKAGE_REGISTRY_OVERRIDES,
      'package_registry_overrides',
    );
  });

  it('should define MODULE_DEPENDENCY_LOCKS', () => {
    assert.equal(
      TABLES.MODULE_DEPENDENCY_LOCKS,
      'module_dependency_locks',
    );
  });

  it('should define WASM_OPERATIONS', () => {
    assert.equal(TABLES.WASM_OPERATIONS, 'wasm_operations');
  });
});

describe('SYSTEM_TABLE_NAME entries', () => {
  for (const table of NEW_TABLES) {
    it(`should include ${table} in SYSTEM_TABLE_NAME`, () => {
      const key = Object.keys(SYSTEM_TABLE_NAME).find(
        (k) => SYSTEM_TABLE_NAME[k] === table,
      );
      assert.ok(key, `${table} missing from SYSTEM_TABLE_NAME`);
    });
  }
});

describe('SYSTEM_TABLE_SCHEMAS registration', () => {
  for (const table of NEW_TABLES) {
    it(`should include ${table} schema`, () => {
      const schema = SYSTEM_TABLE_SCHEMAS.find(
        (s) => s.tableName === table,
      );
      assert.ok(schema, `${table} missing from SYSTEM_TABLE_SCHEMAS`);
    });
  }
});

describe('INITIAL_PARTITION_IDS registration', () => {
  for (const table of NEW_TABLES) {
    it(`should have partition ID for ${table}`, () => {
      const pid = INITIAL_PARTITION_IDS[table];
      assert.ok(pid, `${table} missing from INITIAL_PARTITION_IDS`);
      assert.ok(pid.endsWith('-p1'));
    });
  }
});

describe('INITIAL_REPLICA_IDS registration', () => {
  for (const table of NEW_TABLES) {
    it(`should have 3 replica IDs for ${table}`, () => {
      const rids = INITIAL_REPLICA_IDS[table];
      assert.ok(rids, `${table} missing from INITIAL_REPLICA_IDS`);
      assert.equal(rids.length, 3);
    });
  }
});

describe('Cache registration', () => {
  for (const table of NEW_TABLES) {
    it(`should include ${table} in CACHE_SYSTEM_TABLES`, () => {
      assert.ok(CACHE_SYSTEM_TABLES.includes(table));
    });

    it(`should classify ${table} as non-propagated`, () => {
      assert.ok(CDC_NON_PROPAGATED_TABLES.includes(table));
      assert.ok(!CACHE_HYDRATION_TABLES.includes(table));
    });

    it(`should have primary key field for ${table}`, () => {
      assert.ok(CACHE_PRIMARY_KEY_FIELDS[table]);
    });
  }
});

describe('getSchemaByTableName for new tables', () => {
  for (const table of NEW_TABLES) {
    it(`should find schema for ${table}`, () => {
      const schema = getSchemaByTableName(table);
      assert.ok(schema);
      assert.equal(schema.tableName, table);
    });
  }
});

describe('getInitialPartitionId for new tables', () => {
  for (const table of NEW_TABLES) {
    it(`should return partition ID for ${table}`, () => {
      assert.ok(getInitialPartitionId(table));
    });
  }
});

describe('getInitialReplicaIds for new tables', () => {
  for (const table of NEW_TABLES) {
    it(`should return replica IDs for ${table}`, () => {
      const ids = getInitialReplicaIds(table);
      assert.ok(ids);
      assert.equal(ids.length, 3);
    });
  }
});

describe('MODULE_MANIFESTS_SCHEMA', () => {
  it('should have composite primary key', () => {
    assert.deepEqual(
      MODULE_MANIFESTS_SCHEMA.primaryKey,
      ['namespace', 'name', 'version'],
    );
  });

  it('should have digest column', () => {
    const col = MODULE_MANIFESTS_SCHEMA.columns.find(
      (c) => c.name === 'digest',
    );
    assert.ok(col);
    assert.equal(col.notNull, true);
  });

  it('should have run_export column', () => {
    const col = MODULE_MANIFESTS_SCHEMA.columns.find(
      (c) => c.name === 'run_export',
    );
    assert.ok(col);
    assert.equal(col.notNull, true);
  });

  it('should have JSON columns for exports, deps, capabilities', () => {
    for (const name of ['exports', 'dependencies', 'capabilities']) {
      const col = MODULE_MANIFESTS_SCHEMA.columns.find(
        (c) => c.name === name,
      );
      assert.ok(col, `${name} column missing`);
      assert.equal(col.defaultValue, '\'[]\'');
    }
  });

  it('should generate valid CREATE TABLE SQL with composite PK', () => {
    const sql = generateCreateTableSQL(MODULE_MANIFESTS_SCHEMA);
    assert.ok(sql.includes('PRIMARY KEY (namespace, name, version)'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS'));
  });
});

describe('PACKAGE_REGISTRY_OVERRIDES_SCHEMA', () => {
  it('should have composite primary key', () => {
    assert.deepEqual(
      PACKAGE_REGISTRY_OVERRIDES_SCHEMA.primaryKey,
      ['namespace', 'name'],
    );
  });

  it('should generate valid CREATE TABLE SQL with composite PK', () => {
    const sql = generateCreateTableSQL(
      PACKAGE_REGISTRY_OVERRIDES_SCHEMA,
    );
    assert.ok(sql.includes('PRIMARY KEY (namespace, name)'));
  });
});

describe('PACKAGE_REGISTRY_MAPPINGS_SCHEMA', () => {
  it('should have namespace as single primary key', () => {
    const nsPk = PACKAGE_REGISTRY_MAPPINGS_SCHEMA.columns.find(
      (c) => c.name === 'namespace',
    );
    assert.equal(nsPk.primaryKey, true);
  });

  it('should have registry_url column', () => {
    const col = PACKAGE_REGISTRY_MAPPINGS_SCHEMA.columns.find(
      (c) => c.name === 'registry_url',
    );
    assert.ok(col);
    assert.equal(col.notNull, true);
  });
});

describe('MODULE_DEPENDENCY_LOCKS_SCHEMA', () => {
  it('should have lock_id as primary key', () => {
    const pk = MODULE_DEPENDENCY_LOCKS_SCHEMA.columns.find(
      (c) => c.name === 'lock_id',
    );
    assert.equal(pk.primaryKey, true);
  });

  it('should have target module columns', () => {
    for (const name of [
      'target_module_namespace',
      'target_module_name',
      'target_module_version',
    ]) {
      const col = MODULE_DEPENDENCY_LOCKS_SCHEMA.columns.find(
        (c) => c.name === name,
      );
      assert.ok(col, `${name} column missing`);
      assert.equal(col.notNull, true);
    }
  });

  it('should have composite index on target module', () => {
    const idx = MODULE_DEPENDENCY_LOCKS_SCHEMA.indices.find(
      (i) => i.name === 'idx_dep_locks_target',
    );
    assert.ok(idx);
    assert.equal(idx.columns.length, 3);
  });
});

describe('WASM_OPERATIONS_SCHEMA', () => {
  it('should have operation_id as primary key', () => {
    const pk = WASM_OPERATIONS_SCHEMA.columns.find(
      (c) => c.name === 'operation_id',
    );
    assert.equal(pk.primaryKey, true);
  });

  it('should have tenant_id and command columns', () => {
    for (const name of ['tenant_id', 'command']) {
      const col = WASM_OPERATIONS_SCHEMA.columns.find(
        (c) => c.name === name,
      );
      assert.ok(col, `${name} column missing`);
      assert.equal(col.notNull, true);
    }
  });

  it('should have idempotency index on tenant + key', () => {
    const idx = WASM_OPERATIONS_SCHEMA.indices.find(
      (i) => i.name === 'idx_wasm_ops_idempotency',
    );
    assert.ok(idx);
    assert.deepEqual(idx.columns, ['tenant_id', 'idempotency_key']);
  });

  it('should default state to pending', () => {
    const col = WASM_OPERATIONS_SCHEMA.columns.find(
      (c) => c.name === 'state',
    );
    assert.equal(col.defaultValue, '\'pending\'');
  });
});

describe('generateCreateIndexSQL for new tables', () => {
  it('should generate index SQL for module_manifests', () => {
    const sqls = generateCreateIndexSQL(MODULE_MANIFESTS_SCHEMA);
    assert.equal(sqls.length, 2);
    assert.ok(sqls[0].includes('idx_module_manifests_digest'));
  });

  it('should generate index SQL for wasm_operations', () => {
    const sqls = generateCreateIndexSQL(WASM_OPERATIONS_SCHEMA);
    assert.equal(sqls.length, 3);
  });

  it('should return empty array for tables with no indices', () => {
    const sqls = generateCreateIndexSQL(
      PACKAGE_REGISTRY_MAPPINGS_SCHEMA,
    );
    assert.equal(sqls.length, 0);
  });
});

describe('COLUMN constants for new tables', () => {
  it('should define NAMESPACE', () => {
    assert.equal(COLUMN.NAMESPACE, 'namespace');
  });

  it('should define NAME', () => {
    assert.equal(COLUMN.NAME, 'name');
  });

  it('should define LOCK_ID', () => {
    assert.equal(COLUMN.LOCK_ID, 'lock_id');
  });

  it('should define TENANT_ID', () => {
    assert.equal(COLUMN.TENANT_ID, 'tenant_id');
  });

  it('should define IDEMPOTENCY_KEY', () => {
    assert.equal(COLUMN.IDEMPOTENCY_KEY, 'idempotency_key');
  });
});
