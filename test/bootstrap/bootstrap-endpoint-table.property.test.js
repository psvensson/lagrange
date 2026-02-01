/**
 * Property-based test for Bootstrap Endpoint Table Creation.
 * **Property 10: Bootstrap Endpoint Table Creation**
 * **Validates: Requirements 6.10, 8.1**
 *
 * Property: For any seed node bootstrap, the `node_endpoints` system table
 * SHALL be created and included in bootstrap snapshots sent to joining nodes.
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  SYSTEM_TABLE_SCHEMAS,
  NODE_ENDPOINTS_SCHEMA,
  SystemTableName,
  INITIAL_PARTITION_IDS,
  INITIAL_REPLICA_IDS,
  generateCreateTableSQL,
  generateCreateIndexSQL,
  getSchemaByTableName,
  getInitialPartitionId,
  getInitialReplicaIds,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES, COLUMN, ENDPOINT_STATUS} from '../../src/constants/index.js';
import {CACHE_SYSTEM_TABLES} from '../../src/cache/cache-constants.js';

beforeEach(() => {
  // No global state to reset for these schema tests
});

afterEach(() => {
  // No cleanup needed
});

/**
 * Feature: transport-abstraction-layer
 * Property 10: Bootstrap Endpoint Table Creation
 *
 * For any seed node bootstrap, the `node_endpoints` system table SHALL be
 * created and included in bootstrap snapshots sent to joining nodes.
 */
test('Property 10: node_endpoints table is included in SYSTEM_TABLE_SCHEMAS', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        // Verify node_endpoints is in SYSTEM_TABLE_SCHEMAS
        const nodeEndpointsSchema = SYSTEM_TABLE_SCHEMAS.find(
          (schema) => schema.tableName === TABLES.NODE_ENDPOINTS,
        );

        if (!nodeEndpointsSchema) {
          return false;
        }

        // Verify it matches the exported NODE_ENDPOINTS_SCHEMA
        if (nodeEndpointsSchema !== NODE_ENDPOINTS_SCHEMA) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('node_endpoints table is included in SYSTEM_TABLE_SCHEMAS');
});

test('Property 10: node_endpoints table has correct schema structure', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        const schema = NODE_ENDPOINTS_SCHEMA;

        // Verify table name
        if (schema.tableName !== TABLES.NODE_ENDPOINTS) {
          return false;
        }

        // Verify required columns exist
        const requiredColumns = [
          {name: COLUMN.ENDPOINT_ID, isPrimaryKey: true},
          {name: COLUMN.NODE_ID, isPrimaryKey: false},
          {name: COLUMN.TRANSPORT_TYPE, isPrimaryKey: false},
          {name: COLUMN.ADDRESS, isPrimaryKey: false},
          {name: COLUMN.PRIORITY, isPrimaryKey: false},
          {name: COLUMN.METADATA, isPrimaryKey: false},
          {name: COLUMN.STATUS, isPrimaryKey: false},
          {name: COLUMN.CREATED_AT, isPrimaryKey: false},
          {name: COLUMN.UPDATED_AT, isPrimaryKey: false},
        ];

        for (const required of requiredColumns) {
          const column = schema.columns.find((col) => col.name === required.name);
          if (!column) {
            return false;
          }
          if (required.isPrimaryKey && !column.primaryKey) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('node_endpoints table has correct schema structure');
});

test('Property 10: node_endpoints table has correct column types', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        const schema = NODE_ENDPOINTS_SCHEMA;

        // Define expected column types
        const expectedTypes = {
          [COLUMN.ENDPOINT_ID]: 'TEXT',
          [COLUMN.NODE_ID]: 'TEXT',
          [COLUMN.TRANSPORT_TYPE]: 'TEXT',
          [COLUMN.ADDRESS]: 'TEXT',
          [COLUMN.PRIORITY]: 'INTEGER',
          [COLUMN.METADATA]: 'TEXT',
          [COLUMN.STATUS]: 'TEXT',
          [COLUMN.CREATED_AT]: 'INTEGER',
          [COLUMN.UPDATED_AT]: 'INTEGER',
        };

        for (const [columnName, expectedType] of Object.entries(expectedTypes)) {
          const column = schema.columns.find((col) => col.name === columnName);
          if (!column) {
            return false;
          }
          if (column.type !== expectedType) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('node_endpoints table has correct column types');
});

test('Property 10: node_endpoints table has required indices', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        const schema = NODE_ENDPOINTS_SCHEMA;

        // Verify indices exist
        if (!schema.indices || schema.indices.length === 0) {
          return false;
        }

        // Verify index on node_id for efficient lookups
        const nodeIdIndex = schema.indices.find(
          (idx) => idx.columns.includes(COLUMN.NODE_ID),
        );
        if (!nodeIdIndex) {
          return false;
        }

        // Verify index on transport_type
        const transportTypeIndex = schema.indices.find(
          (idx) => idx.columns.includes(COLUMN.TRANSPORT_TYPE),
        );
        if (!transportTypeIndex) {
          return false;
        }

        // Verify index on status
        const statusIndex = schema.indices.find(
          (idx) => idx.columns.includes(COLUMN.STATUS),
        );
        if (!statusIndex) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('node_endpoints table has required indices');
});

test('Property 10: node_endpoints table is in CACHE_SYSTEM_TABLES', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        // Verify node_endpoints is in CACHE_SYSTEM_TABLES for bootstrap snapshots
        if (!CACHE_SYSTEM_TABLES.includes(TABLES.NODE_ENDPOINTS)) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('node_endpoints table is in CACHE_SYSTEM_TABLES for bootstrap snapshots');
});

test('Property 10: node_endpoints has initial partition ID for bootstrap', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        // Verify node_endpoints has an initial partition ID
        const partitionId = INITIAL_PARTITION_IDS[SystemTableName.NODE_ENDPOINTS];
        if (!partitionId) {
          return false;
        }

        // Verify partition ID follows naming convention
        if (!partitionId.includes('node_endpoints')) {
          return false;
        }

        // Verify getInitialPartitionId helper works
        const helperResult = getInitialPartitionId(TABLES.NODE_ENDPOINTS);
        if (helperResult !== partitionId) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('node_endpoints has initial partition ID for bootstrap');
});

test('Property 10: node_endpoints has initial replica IDs for bootstrap', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        // Verify node_endpoints has initial replica IDs
        const replicaIds = INITIAL_REPLICA_IDS[SystemTableName.NODE_ENDPOINTS];
        if (!replicaIds || !Array.isArray(replicaIds)) {
          return false;
        }

        // Verify 3 replicas (standard for system tables)
        if (replicaIds.length !== 3) {
          return false;
        }

        // Verify replica IDs follow naming convention
        for (const replicaId of replicaIds) {
          if (!replicaId.includes('node_endpoints')) {
            return false;
          }
        }

        // Verify getInitialReplicaIds helper works
        const helperResult = getInitialReplicaIds(TABLES.NODE_ENDPOINTS);
        if (!helperResult || helperResult.length !== replicaIds.length) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('node_endpoints has initial replica IDs for bootstrap');
});

test('Property 10: node_endpoints schema can generate valid CREATE TABLE SQL', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        const sql = generateCreateTableSQL(NODE_ENDPOINTS_SCHEMA);

        // Verify SQL is generated
        if (!sql || typeof sql !== 'string') {
          return false;
        }

        // Verify SQL contains table name
        if (!sql.includes(TABLES.NODE_ENDPOINTS)) {
          return false;
        }

        // Verify SQL contains CREATE TABLE
        if (!sql.includes('CREATE TABLE')) {
          return false;
        }

        // Verify SQL contains primary key column
        if (!sql.includes(COLUMN.ENDPOINT_ID)) {
          return false;
        }

        // Verify SQL contains PRIMARY KEY
        if (!sql.includes('PRIMARY KEY')) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('node_endpoints schema can generate valid CREATE TABLE SQL');
});

test('Property 10: node_endpoints schema can generate valid CREATE INDEX SQL', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        const indexStatements = generateCreateIndexSQL(NODE_ENDPOINTS_SCHEMA);

        // Verify index statements are generated
        if (!indexStatements || !Array.isArray(indexStatements)) {
          return false;
        }

        // Verify at least one index statement
        if (indexStatements.length === 0) {
          return false;
        }

        // Verify each statement is valid SQL
        for (const stmt of indexStatements) {
          if (!stmt.includes('CREATE INDEX')) {
            return false;
          }
          if (!stmt.includes(TABLES.NODE_ENDPOINTS)) {
            return false;
          }
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('node_endpoints schema can generate valid CREATE INDEX SQL');
});

test('Property 10: getSchemaByTableName returns node_endpoints schema', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        const schema = getSchemaByTableName(TABLES.NODE_ENDPOINTS);

        // Verify schema is returned
        if (!schema) {
          return false;
        }

        // Verify it's the correct schema
        if (schema.tableName !== TABLES.NODE_ENDPOINTS) {
          return false;
        }

        // Verify it matches NODE_ENDPOINTS_SCHEMA
        if (schema !== NODE_ENDPOINTS_SCHEMA) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('getSchemaByTableName returns node_endpoints schema');
});

test('Property 10: node_endpoints schema has correct default values', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        const schema = NODE_ENDPOINTS_SCHEMA;

        // Verify priority has default value of 0
        const priorityCol = schema.columns.find((col) => col.name === COLUMN.PRIORITY);
        if (!priorityCol || priorityCol.defaultValue !== 0) {
          return false;
        }

        // Verify status has default value of 'active'
        const statusCol = schema.columns.find((col) => col.name === COLUMN.STATUS);
        if (!statusCol || !statusCol.defaultValue.includes(ENDPOINT_STATUS.ACTIVE)) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('node_endpoints schema has correct default values');
});

test('Property 10: node_endpoints schema has correct NOT NULL constraints', async (t) => {
  fc.assert(
    fc.property(
      fc.constant(null),
      (_input) => {
        const schema = NODE_ENDPOINTS_SCHEMA;

        // Columns that must be NOT NULL
        const notNullColumns = [
          COLUMN.NODE_ID,
          COLUMN.TRANSPORT_TYPE,
          COLUMN.ADDRESS,
          COLUMN.PRIORITY,
          COLUMN.STATUS,
          COLUMN.CREATED_AT,
          COLUMN.UPDATED_AT,
        ];

        for (const columnName of notNullColumns) {
          const column = schema.columns.find((col) => col.name === columnName);
          if (!column || !column.notNull) {
            return false;
          }
        }

        // Metadata can be NULL (optional)
        const metadataCol = schema.columns.find((col) => col.name === COLUMN.METADATA);
        if (metadataCol && metadataCol.notNull) {
          return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );

  t.pass('node_endpoints schema has correct NOT NULL constraints');
});
