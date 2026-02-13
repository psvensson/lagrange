import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  RegistrationPhase,
} from '../../src/bootstrap/phases/registration-phase.js';
import {
  SD_COL,
  SERVICE_DEFINITION_COLUMN_LIST,
} from '../../src/wasm-service/wasm-service-models.js';

const LEGACY_SERVICE_DEFINITION_COLUMNS = Object.freeze([
  SD_COL.SERVICE_ID,
  SD_COL.SERVICE_NAME,
  SD_COL.HANDLER_FUNCTION_ID,
  SD_COL.READ_CONSISTENCY,
  SD_COL.WRITE_CONSISTENCY,
  SD_COL.REPLICA_COUNT,
  SD_COL.PROTOCOL,
  SD_COL.RESOURCE_BUDGET,
  SD_COL.SAFETY_INTERVAL_MS,
  SD_COL.STATUS,
  SD_COL.CREATED_AT,
  SD_COL.UPDATED_AT,
]);

function createRegistrationPhase() {
  return new RegistrationPhase({
    nodeId: 'node-a',
    partitionServices: new Map(),
    messageGroupServices: new Map(),
    cdcIntegrationService: {
      setBootstrapMode: () => {},
      clearBootstrapMode: () => {},
      upsertSystemTableRow: async () => {},
      updateSystemTableRow: async () => {},
    },
    getLeaderMessageGroupService: () => null,
    getSystemTableCache: () => ({}),
  });
}

function createMockLeaderPartition(tableInfoRows) {
  const sqlCalls = [];
  return {
    sqlCalls,
    service: {
      executeLocalQuery: async (sql, _params) => {
        sqlCalls.push(sql);
        if (sql.includes('pragma_table_info')) {
          return {success: true, rows: tableInfoRows};
        }
        return {success: true, rows: []};
      },
    },
  };
}

function createCanonicalTableInfo(handlerNotNull) {
  return SERVICE_DEFINITION_COLUMN_LIST.map((name) => ({
    name,
    notNull: name === SD_COL.HANDLER_FUNCTION_ID ? handlerNotNull : 0,
  }));
}

describe('RegistrationPhase service_definitions schema migration', () => {
  it('does not migrate when table already matches canonical contract',
    async () => {
      const phase = createRegistrationPhase();
      const tableInfoRows = createCanonicalTableInfo(0);
      const mock = createMockLeaderPartition(tableInfoRows);

      await phase.ensureServiceDefinitionsSchema(mock.service);

      assert.equal(mock.sqlCalls.length, 1);
      assert.ok(
        mock.sqlCalls[0].includes('pragma_table_info'),
      );
      assert.ok(!mock.sqlCalls.includes('BEGIN IMMEDIATE'));
    });

  it('migrates legacy table missing service_profile and runtime columns',
    async () => {
      const phase = createRegistrationPhase();
      const tableInfoRows = LEGACY_SERVICE_DEFINITION_COLUMNS.map((name) => ({
        name,
        notNull: name === SD_COL.HANDLER_FUNCTION_ID ? 1 : 0,
      }));
      const mock = createMockLeaderPartition(tableInfoRows);

      await phase.ensureServiceDefinitionsSchema(mock.service);

      assert.ok(mock.sqlCalls.includes('BEGIN IMMEDIATE'));
      assert.ok(mock.sqlCalls.includes('COMMIT'));
      assert.ok(!mock.sqlCalls.includes('ROLLBACK'));

      const createTableSql = mock.sqlCalls.find(
        (sql) => sql.startsWith(
          'CREATE TABLE IF NOT EXISTS service_definitions__migrating',
        ),
      );
      assert.ok(createTableSql);
      assert.ok(
        createTableSql.includes(
          'service_profile TEXT NOT NULL DEFAULT \'default\'',
        ),
      );
      assert.ok(createTableSql.includes('handler_function_id TEXT'));
      assert.ok(!createTableSql.includes('handler_function_id TEXT NOT NULL'));

      const copySql = mock.sqlCalls.find(
        (sql) => sql.startsWith('INSERT INTO service_definitions__migrating'),
      );
      assert.ok(copySql);
      assert.ok(copySql.includes('\'default\' AS service_profile'));
      assert.ok(copySql.includes('NULL AS runtime_kind'));
      assert.ok(copySql.includes('NULL AS runtime_ref'));
      assert.ok(copySql.includes('NULL AS runtime_config'));
    });

  it('migrates table when handler_function_id still has NOT NULL constraint',
    async () => {
      const phase = createRegistrationPhase();
      const tableInfoRows = createCanonicalTableInfo(1);
      const mock = createMockLeaderPartition(tableInfoRows);

      await phase.ensureServiceDefinitionsSchema(mock.service);

      assert.ok(mock.sqlCalls.includes('BEGIN IMMEDIATE'));
      assert.ok(mock.sqlCalls.includes('COMMIT'));
    });
});
