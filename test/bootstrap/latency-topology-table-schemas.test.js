import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {TABLES} from '../../src/constants/tables.js';
import {COLUMN} from '../../src/constants/columns.js';
import {
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_SCHEMAS,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  NODES_SCHEMA,
  LATENCY_GROUPS_SCHEMA,
  INTER_GROUP_LATENCIES_SCHEMA,
  generateCreateTableSQL,
  getSchemaByTableName,
  getInitialPartitionId,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  CACHE_HYDRATION_TABLES,
  CACHE_PRIMARY_KEY_FIELDS,
  CACHE_SYSTEM_TABLES,
} from '../../src/cache/cache-constants.js';
import {
  LATENCY_ASSIGNMENT_STATE,
  LATENCY_GROUP_STATE,
} from '../../src/topology/latency-topology-constants.js';

const LATENCY_TABLES = [
  TABLES.LATENCY_GROUPS,
  TABLES.INTER_GROUP_LATENCIES,
];

describe('latency topology table constants', () => {
  it('defines latency table names in TABLES', () => {
    assert.equal(TABLES.LATENCY_GROUPS, 'latency_groups');
    assert.equal(TABLES.INTER_GROUP_LATENCIES, 'inter_group_latencies');
  });

  it('registers latency table names in SYSTEM_TABLE_NAME', () => {
    assert.equal(SYSTEM_TABLE_NAME.LATENCY_GROUPS, TABLES.LATENCY_GROUPS);
    assert.equal(
      SYSTEM_TABLE_NAME.INTER_GROUP_LATENCIES,
      TABLES.INTER_GROUP_LATENCIES,
    );
  });
});

describe('latency topology schema registration', () => {
  for (const tableName of LATENCY_TABLES) {
    it(`includes ${tableName} in SYSTEM_TABLE_SCHEMAS`, () => {
      const schema = SYSTEM_TABLE_SCHEMAS.find((s) => s.tableName === tableName);
      assert.ok(schema, `${tableName} missing from SYSTEM_TABLE_SCHEMAS`);
    });

    it(`includes ${tableName} in INITIAL_PARTITION_IDS`, () => {
      const partitionId = INITIAL_PARTITION_IDS[tableName];
      assert.ok(partitionId);
      assert.ok(partitionId.endsWith('-p1'));
      assert.equal(getInitialPartitionId(tableName), partitionId);
    });

    it(`includes ${tableName} in INITIAL_REPLICA_IDS`, () => {
      const replicaIds = INITIAL_REPLICA_IDS[tableName];
      assert.ok(replicaIds);
      assert.equal(replicaIds.length, 3);
      assert.deepEqual(getInitialReplicaIds(tableName), replicaIds);
    });

    it(`includes ${tableName} in CACHE_SYSTEM_TABLES and CACHE_HYDRATION_TABLES`, () => {
      assert.ok(CACHE_SYSTEM_TABLES.includes(tableName));
      assert.ok(CACHE_HYDRATION_TABLES.includes(tableName));
    });

    it(`includes ${tableName} in cache key descriptor`, () => {
      assert.ok(CACHE_PRIMARY_KEY_FIELDS[tableName]);
    });
  }
});

describe('nodes schema latency extensions', () => {
  it('includes latency assignment columns', () => {
    const latencyGroupColumn = NODES_SCHEMA.columns.find(
      (c) => c.name === COLUMN.LATENCY_GROUP_ID,
    );
    const lastCheckColumn = NODES_SCHEMA.columns.find(
      (c) => c.name === COLUMN.LAST_LATENCY_CHECK_AT,
    );
    const assignmentStateColumn = NODES_SCHEMA.columns.find(
      (c) => c.name === COLUMN.LATENCY_ASSIGNMENT_STATE,
    );

    assert.ok(latencyGroupColumn);
    assert.ok(lastCheckColumn);
    assert.ok(assignmentStateColumn);
    assert.equal(assignmentStateColumn.notNull, true);
    assert.equal(
      assignmentStateColumn.defaultValue,
      `'${LATENCY_ASSIGNMENT_STATE.UNASSIGNED}'`,
    );
  });
});

describe('latency_groups schema', () => {
  it('defines required lifecycle columns', () => {
    assert.equal(LATENCY_GROUPS_SCHEMA.tableName, TABLES.LATENCY_GROUPS);

    const groupIdColumn = LATENCY_GROUPS_SCHEMA.columns.find(
      (c) => c.name === COLUMN.GROUP_ID,
    );
    const representativeColumn = LATENCY_GROUPS_SCHEMA.columns.find(
      (c) => c.name === COLUMN.REPRESENTATIVE_NODE_ID,
    );
    const coordinatorColumn = LATENCY_GROUPS_SCHEMA.columns.find(
      (c) => c.name === COLUMN.COORDINATOR_NODE_ID,
    );
    const stateColumn = LATENCY_GROUPS_SCHEMA.columns.find(
      (c) => c.name === 'state',
    );

    assert.ok(groupIdColumn?.primaryKey);
    assert.ok(representativeColumn);
    assert.ok(coordinatorColumn);
    assert.ok(stateColumn);
    assert.equal(stateColumn.defaultValue, `'${LATENCY_GROUP_STATE.ACTIVE}'`);
  });
});

describe('inter_group_latencies schema', () => {
  it('defines RTT sample aggregate columns', () => {
    assert.equal(
      INTER_GROUP_LATENCIES_SCHEMA.tableName,
      TABLES.INTER_GROUP_LATENCIES,
    );

    const edgeIdColumn = INTER_GROUP_LATENCIES_SCHEMA.columns.find(
      (c) => c.name === COLUMN.LATENCY_EDGE_ID,
    );
    const sourceGroupColumn = INTER_GROUP_LATENCIES_SCHEMA.columns.find(
      (c) => c.name === COLUMN.SOURCE_GROUP_ID,
    );
    const targetGroupColumn = INTER_GROUP_LATENCIES_SCHEMA.columns.find(
      (c) => c.name === COLUMN.TARGET_GROUP_ID,
    );
    const latencyMsColumn = INTER_GROUP_LATENCIES_SCHEMA.columns.find(
      (c) => c.name === COLUMN.LATENCY_MS,
    );
    const sampleCountColumn = INTER_GROUP_LATENCIES_SCHEMA.columns.find(
      (c) => c.name === COLUMN.SAMPLE_COUNT,
    );
    const measuredAtColumn = INTER_GROUP_LATENCIES_SCHEMA.columns.find(
      (c) => c.name === COLUMN.LAST_MEASURED_AT,
    );

    assert.ok(edgeIdColumn?.primaryKey);
    assert.equal(sourceGroupColumn?.notNull, true);
    assert.equal(targetGroupColumn?.notNull, true);
    assert.equal(latencyMsColumn?.notNull, true);
    assert.equal(sampleCountColumn?.defaultValue, 1);
    assert.equal(measuredAtColumn?.notNull, true);
  });

  it('can generate CREATE TABLE SQL and be discovered by helper lookups', () => {
    const sql = generateCreateTableSQL(INTER_GROUP_LATENCIES_SCHEMA);
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS'));
    assert.ok(sql.includes(TABLES.INTER_GROUP_LATENCIES));
    assert.ok(sql.includes(COLUMN.LATENCY_EDGE_ID));

    const fromLookup = getSchemaByTableName(TABLES.INTER_GROUP_LATENCIES);
    assert.equal(fromLookup, INTER_GROUP_LATENCIES_SCHEMA);
  });
});
