import {test} from '../../src/test-helpers/tap.js';
import {
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_PHASE_SCOPE,
  GATEWAY_ERROR_MSG,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {
  MembershipPublicationRuntimeOwner,
} from '../../src/control-plane/owners/membership-publication-runtime-owner.js';
import {
  NODE_REGISTRATION_OUTCOME,
  createNodeRegistrationIssueRecord,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {
  CDCIntegrationService,
} from '../../src/cdc/cdc-integration-service.js';
import {
  DistributedQueryPlanner,
} from '../../src/query/distributed/distributed-query-planner.js';
import {
  deriveParticipantEntryId,
} from '../../src/query/distributed/distributed-write-coordinator.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_SCHEMAS,
  getSchemaByTableName,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  resolveDeclaredPrimaryKeyColumns,
} from '../../src/partition/partition-boundary-representation.js';
import {COLUMN, SERVICE_STATUS, STATE, TABLES} from '../../src/constants/index.js';
import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';

const NOW = 1_795_447_095_000;
const NODE_ID = '00000000-0000-4000-8000-000000000001';

function createSystemTablePlanner() {
  return new DistributedQueryPlanner({
    getTablePartitions: (tableName) => [{
      partition_id: `${tableName}-p1`,
      table_name: tableName,
      partition_key_start: null,
      partition_key_end: null,
    }],
    getTableInfo: (tableName) => {
      const schema = getSchemaByTableName(tableName);
      return schema ? {table_name: tableName, schema} : null;
    },
  });
}

function createPlannedSqlEngine() {
  const planner = createSystemTablePlanner();
  const executed = [];
  let nextLogIndex = 1;
  return {
    executed,
    async executeQuery(sql, params = [], options = {}) {
      const ast = new SQLParser(sql).parse();
      if (ast.type === 'UPDATE') {
        planner.planUpdate(ast, params);
      }
      executed.push({sql, params, ast});
      const partitionId = `${ast.table}-p1`;
      const idempotencyKey = options?.idempotencyKey;
      const durableCommitWitness = typeof idempotencyKey === 'string' &&
          idempotencyKey.length > 0 ?
        {
          partitionId,
          entryId: deriveParticipantEntryId(idempotencyKey, partitionId),
          logIndex: nextLogIndex++,
          term: 1,
        } :
        undefined;
      return {
        success: true,
        partitionId,
        affectedRows: 1,
        changes: 1,
        durableCommitWitness,
        partitionResult: {
          partitionId,
          affectedRows: 1,
          changes: 1,
          durableCommitWitness,
        },
      };
    },
  };
}

function createSampleNodeRow(bootIncarnation) {
  return {
    [COLUMN.NODE_ID]: NODE_ID,
    [COLUMN.NODE_ADDRESS]: '172.28.0.11:8080',
    [COLUMN.HOST_ID]: LOCAL_MACHINE_HOST_ID,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
    [COLUMN.LAST_HEARTBEAT]: NOW,
    [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    [COLUMN.UPDATED_AT]: NOW,
  };
}

function createJoinPhaseGateway(sqlQueryEngine, observedRows) {
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: NODE_ID,
    startupSqlMutationPhase: CONTROL_PLANE_PHASE_SCOPE.JOIN,
    sqlQueryEngine,
  });
  gateway.readAuthoritativeRows = async () => ({
    success: true,
    rows: observedRows.map((row) => ({...row})),
  });
  return gateway;
}

test('join-phase startup SQL UPDATE strips same-value node_id and clears ' +
  'DistributedQueryPlanner on durable rejoin incarnation advance', async (t) => {
  const sqlEngine = createPlannedSqlEngine();
  const observedRow = createSampleNodeRow(1);
  const nextRow = createSampleNodeRow(2);
  const gateway = createJoinPhaseGateway(sqlEngine, [observedRow]);
  const owner = new MembershipPublicationRuntimeOwner({
    nodeId: NODE_ID,
    controlPlaneSystemTableGateway: gateway,
  });

  const advanceResult = await owner.advanceJoinNodeBootIncarnation(
    {[COLUMN.NODE_ID]: NODE_ID, [COLUMN.BOOT_INCARNATION]: 1},
    nextRow,
    {phaseScope: CONTROL_PLANE_PHASE_SCOPE.JOIN},
  );
  t.equal(advanceResult.success, true,
    'advanceJoinNodeBootIncarnation succeeds through startup SQL');

  const issueRecord = createNodeRegistrationIssueRecord();
  const regResult = await owner.registerJoinNodeAtIncarnation(
    nextRow,
    2,
    issueRecord,
    {phaseScope: CONTROL_PLANE_PHASE_SCOPE.JOIN, nowMs: NOW},
  );
  t.equal(regResult.outcome, NODE_REGISTRATION_OUTCOME.ACCEPTED,
    'registerJoinNodeAtIncarnation advance succeeds through startup SQL');

  t.equal(sqlEngine.executed.length, 2, 'both rejoin advances executed SQL');
  for (const call of sqlEngine.executed) {
    const [setPart, wherePart] = call.sql.split(' WHERE ');
    t.notOk(setPart.includes('node_id'),
      'SET clause must omit same-value primary key column node_id');
    t.ok(wherePart.includes('node_id = ?') && wherePart.includes('boot_incarnation = ?'),
      'WHERE clause preserves node_id and boot_incarnation CAS guard');
    t.equal(call.params[call.params.length - 2], NODE_ID,
      'bound WHERE node_id param matches row identity');
    t.equal(call.params[call.params.length - 1], 1,
      'bound WHERE boot_incarnation param matches observed incarnation');
  }
});

test('buildSqlMutationPlan rejects primary-key re-home, unpinned PK writes, ' +
  'and PK-only UPDATE payloads fail-closed', async (t) => {
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID});

  t.throws(
    () => gateway.buildSqlMutationPlan({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.NODES,
      whereClause: {node_id: NODE_ID},
      data: {node_id: '00000000-0000-4000-8000-000000000002', status: 'active'},
    }),
    /must not re-home primary key \(node_id\)/,
    'differing primary key value in UPDATE data fails closed',
  );

  t.throws(
    () => gateway.buildSqlMutationPlan({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.NODES,
      whereClause: {status: 'joining'},
      data: {node_id: NODE_ID, status: 'active'},
    }),
    /must not re-home primary key \(node_id\)/,
    'unpinned primary key assignment in UPDATE data fails closed',
  );

  t.throws(
    () => gateway.buildSqlMutationPlan({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.NODES,
      whereClause: {node_id: null},
      data: {node_id: NODE_ID, status: 'active'},
    }),
    /must not re-home primary key \(node_id\)/,
    'null-predicated primary key assignment fails closed',
  );

  t.throws(
    () => gateway.buildSqlMutationPlan({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.NODES,
      whereClause: {node_id: NODE_ID},
      data: {node_id: NODE_ID},
    }),
    {message: GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED},
    'PK-only UPDATE payload fails closed instead of emitting empty SET',
  );
});

test('composite primary-key stripping and re-home refusal match across ' +
  'buildSqlMutationPlan and CDCIntegrationService.updateSystemTableRow', async (t) => {
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID});
  const sqlEngine = createPlannedSqlEngine();
  const cdc = new CDCIntegrationService({
    nodeId: NODE_ID,
    sqlQueryEngine: sqlEngine,
  });
  cdc.initialize();

  const where = {migration_id: 'mig-1', partition_id: 'tbl-p1'};
  const sameKeyData = {migration_id: 'mig-1', partition_id: 'tbl-p1', status: 'completed'};

  const plan = gateway.buildSqlMutationPlan({
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS,
    whereClause: where,
    data: sameKeyData,
  });
  await sqlEngine.executeQuery(plan.sql, plan.params);
  await cdc.updateSystemTableRow(
    SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS,
    where,
    sameKeyData,
  );

  t.equal(sqlEngine.executed.length, 2, 'both SQL builders pass DistributedQueryPlanner');
  for (const call of sqlEngine.executed) {
    const [setPart] = call.sql.split(' WHERE ');
    t.notOk(setPart.includes('migration_id') || setPart.includes('partition_id'),
      'SET clause strips all same-value composite primary key columns');
    t.ok(setPart.includes('status = ?'), 'non-key column stays in SET');
  }

  const badSecondaryKey = {migration_id: 'mig-1', partition_id: 'tbl-p2', status: 'completed'};
  t.throws(
    () => gateway.buildSqlMutationPlan({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS,
      whereClause: where,
      data: badSecondaryKey,
    }),
    /must not re-home primary key \(partition_id\)/,
    'buildSqlMutationPlan refuses secondary composite PK re-home',
  );
  await t.rejects(
    cdc.updateSystemTableRow(
      SYSTEM_TABLE_NAME.SCHEMA_MIGRATION_PARTITIONS,
      where,
      badSecondaryKey,
    ),
    /must not re-home primary key \(partition_id\)/,
    'CDCIntegrationService refuses secondary composite PK re-home',
  );
});

function sampleValueForColumn(column, seed) {
  return column.type === 'INTEGER' || column.type === 'REAL' ? seed : `val-${seed}`;
}

test('buildSqlMutationPlan strips declared primary keys for every system table', async (t) => {
  const gateway = new ControlPlaneSystemTableGateway({nodeId: NODE_ID});
  const planner = createSystemTablePlanner();

  for (const schema of SYSTEM_TABLE_SCHEMAS) {
    const pkColumns = resolveDeclaredPrimaryKeyColumns({schema});
    const pkSet = new Set(pkColumns);
    const nonPkCol = schema.columns.find((col) => !pkSet.has(col.name));
    if (!nonPkCol) continue;

    const whereClause = {};
    const data = {};
    pkColumns.forEach((pkName, index) => {
      const col = schema.columns.find((c) => c.name === pkName);
      const val = sampleValueForColumn(col, index + 1);
      whereClause[pkName] = val;
      data[pkName] = val;
    });
    data[nonPkCol.name] = sampleValueForColumn(nonPkCol, 99);

    const {sql, params} = gateway.buildSqlMutationPlan({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: schema.tableName,
      whereClause,
      data,
    });
    const ast = new SQLParser(sql).parse();
    t.doesNotThrow(
      () => planner.planUpdate(ast, params),
      `${schema.tableName}: full-row same-PK UPDATE clears DistributedQueryPlanner`,
    );
  }
});
