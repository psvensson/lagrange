import {test} from '../../src/test-helpers/tap.js';
import {TableCreationService} from '../../src/query/table-creation-service.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
} from '../../src/control-plane/control-plane-system-table-visibility-constants.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../src/control-plane/owner-contract-outcome.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const TABLE_CREATION_TEST_COMPLETION_STATE = Object.freeze({
  PENDING_CREATION: 'pending_creation',
});
const TABLE_CREATION_TEST_COMPLETION_REASON = Object.freeze({
  METADATA_VISIBILITY_PENDING: 'metadata_visibility_pending',
  REPLICA_CONVERGENCE_PENDING: 'replica_convergence_pending',
});

function createCreateTableAst() {
  return {
    tableName: 'users',
    columns: [
      {
        name: 'id',
        dataType: {name: 'TEXT'},
        primaryKey: true,
      },
      {
        name: 'name',
        dataType: {name: 'TEXT'},
        primaryKey: false,
      },
    ],
    primaryKey: ['id'],
    ifNotExists: false,
  };
}

function createObservableSystemCache(tableRows = [], partitionRows = []) {
  const listeners = new Set();
  return {
    getAll(tableName) {
      if (tableName === 'tables') {
        return tableRows;
      }
      if (tableName === 'partitions') {
        return partitionRows;
      }
      return [];
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      return listeners.delete(listener);
    },
    emit(tableName, operation, record) {
      for (const listener of listeners) {
        listener(tableName, operation, record);
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

test('TableCreationService - triggers split/merge evaluation after CREATE TABLE',
  async (t) => {
    let evaluationCalls = 0;
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
      },
      partitionSplitMergeManager: {
        async evaluateAllPartitions() {
          evaluationCalls += 1;
        },
      },
    });

    const result = await service.executeCreateTableProvisioning(createCreateTableAst());

    t.equal(result.success, true);
    t.equal(evaluationCalls, 1);
  });

test('TableCreationService - continues when split/merge evaluation fails',
  async (t) => {
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
      },
      partitionSplitMergeManager: {
        async evaluateAllPartitions() {
          throw new Error('manager unavailable');
        },
      },
    });

    const result = await service.executeCreateTableProvisioning(createCreateTableAst());
    t.equal(result.success, true);
    t.equal(result.operation, 'CREATE_TABLE');
  });

test('TableCreationService - starts periodic split/merge evaluation when manager supports it',
  async (t) => {
    let startCalls = 0;
    const service = new TableCreationService({
      partitionSplitMergeManager: {
        startPeriodicEvaluation() {
          startCalls += 1;
        },
      },
    });

    t.equal(startCalls, 1);

    await service.shutdown();
  });

test('TableCreationService - stops previous periodic split/merge manager on replacement',
  async (t) => {
    let firstStopCalls = 0;
    let secondStartCalls = 0;
    const firstManager = {
      startPeriodicEvaluation() {},
      stopPeriodicEvaluation() {
        firstStopCalls += 1;
      },
    };
    const secondManager = {
      startPeriodicEvaluation() {
        secondStartCalls += 1;
      },
      stopPeriodicEvaluation() {},
    };

    const service = new TableCreationService({
      partitionSplitMergeManager: firstManager,
    });
    service.setPartitionSplitMergeManager(secondManager);

    t.equal(firstStopCalls, 1);
    t.equal(secondStartCalls, 1);

    await service.shutdown();
  });

test('TableCreationService - stops periodic split/merge evaluation on shutdown',
  async (t) => {
    let stopCalls = 0;
    const service = new TableCreationService({
      partitionSplitMergeManager: {
        startPeriodicEvaluation() {},
        stopPeriodicEvaluation() {
          stopCalls += 1;
        },
      },
    });

    await service.shutdown();
    t.equal(stopCalls, 1);
  });

test('TableCreationService - triggers split/merge evaluation on table policy cache updates',
  async (t) => {
    let evaluationCalls = 0;
    const cache = createObservableSystemCache([
      {
        table_id: 'tbl-users',
        table_policies: '{"splitStorageThreshold":16384}',
      },
    ]);
    const service = new TableCreationService({
      systemCache: cache,
      partitionSplitMergeManager: {
        async evaluateAllPartitions() {
          evaluationCalls += 1;
        },
      },
    });

    cache.emit('tables', 'UPDATE', {
      table_id: 'tbl-users',
      table_policies: '{"splitStorageThreshold":16384}',
    });
    await Promise.resolve();
    t.equal(
      evaluationCalls,
      0,
      'unchanged policy values should not trigger evaluation',
    );

    cache.emit('tables', 'UPDATE', {
      table_id: 'tbl-users',
      table_policies: '{"splitStorageThreshold":1024}',
    });
    await Promise.resolve();
    t.equal(
      evaluationCalls,
      1,
      'policy updates should trigger split/merge evaluation',
    );

    await service.shutdown();
  });

test('TableCreationService - triggers coalesced split/merge evaluation on ' +
  'partition size cache updates', async (t) => {
  const evaluationRequests = [];
  const cache = createObservableSystemCache([], [
    {
      partition_id: 'users-p1',
      size_bytes: 1024,
    },
  ]);
  const service = new TableCreationService({
    systemCache: cache,
    partitionSplitMergeManager: {
      requestEvaluation(context) {
        evaluationRequests.push(context);
      },
    },
  });

  cache.emit('partitions', 'UPDATE', {
    partition_id: 'users-p1',
    size_bytes: 1024,
  });
  await Promise.resolve();
  t.equal(
    evaluationRequests.length,
    0,
    'unchanged partition sizes should not trigger evaluation',
  );

  cache.emit('partitions', 'UPDATE', {
    partition_id: 'users-p1',
    size_bytes: 32768,
  });
  await Promise.resolve();
  t.equal(
    evaluationRequests.length,
    1,
    'partition size growth should trigger split/merge evaluation',
  );
  t.same(
    evaluationRequests[0],
    {
      reasonCode: 'partition_size_changed',
      partitionId: 'users-p1',
    },
    'partition size triggers should preserve the canonical request context',
  );

  await service.shutdown();
});

test('TableCreationService - detaches table policy cache listener on shutdown',
  async (t) => {
    const cache = createObservableSystemCache([
      {
        table_id: 'tbl-users',
        table_policies: '{}',
      },
    ]);
    const service = new TableCreationService({
      systemCache: cache,
      partitionSplitMergeManager: {
        async evaluateAllPartitions() {},
      },
    });

    t.equal(cache.listenerCount(), 1);
    await service.shutdown();
    t.equal(cache.listenerCount(), 0);
  });

test('TableCreationService - writes partition metadata with logical table_name',
  async (t) => {
    const writes = [];
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow(tableName, row) {
          writes.push({tableName, row});
          return {success: true};
        },
      },
    });

    const result = await service.executeCreateTableProvisioning(createCreateTableAst());
    t.equal(result.success, true);

    const partitionWrite = writes.find((entry) => entry.tableName === 'partitions');
    t.ok(partitionWrite, 'expected partitions write');
    t.equal(
      partitionWrite?.row?.table_name,
      'users',
      'partition metadata should include logical table_name',
    );
    t.equal(
      partitionWrite?.row?.partition_version,
      1,
      'partition metadata should start in version 1',
    );
    const tableWrite = writes.find((entry) => entry.tableName === 'tables');
    t.ok(tableWrite, 'expected tables write');
    t.equal(
      tableWrite?.row?.active_partition_version,
      1,
      'table metadata should start with active partition version 1',
    );
  });

test('TableCreationService - re-provisions initial partition on ' +
  'CREATE TABLE IF NOT EXISTS retries', async (t) => {
  const provisionCalls = [];
  const service = new TableCreationService({
    systemCache: {
      find(tableName, predicate) {
        if (tableName === 'tables') {
          return [{
            table_id: 'tbl-users',
            table_name: 'users',
          }].find(predicate) || null;
        }
        if (tableName === 'partitions') {
          return [{
            partition_id: 'tbl-users-p1',
            table_id: 'tbl-users',
            table_name: 'users',
            replica_count: 3,
          }].find(predicate) || null;
        }
        return null;
      },
    },
    partitionProvisioner: async (context) => {
      provisionCalls.push(context);
    },
  });

  const result = await service.executeCreateTableProvisioning({
    ...createCreateTableAst(),
    ifNotExists: true,
  });

  t.equal(result.success, true);
  t.equal(result.skipped, true);
  t.equal(provisionCalls.length, 1,
    'existing table retries should reconcile initial partition provisioning');
  t.equal(provisionCalls[0]?.tableId, 'tbl-users');
  t.equal(provisionCalls[0]?.partitionId, 'tbl-users-p1');
  t.equal(provisionCalls[0]?.replicaCount, 3);
});

test('TableCreationService - forwards timeout budget to fresh initial ' +
  'partition provisioning', async (t) => {
  const provisionCalls = [];
  const timeoutBudget = {deadlineMs: 4321};
  const service = new TableCreationService({
    systemCache: {
      find() {
        return null;
      },
    },
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      async submitMutation() {
        return {success: true};
      },
    },
    partitionProvisioner: async (context) => {
      provisionCalls.push(context);
      return {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 2,
      };
    },
  });

  const result = await service.executeCreateTableProvisioning(
    createCreateTableAst(),
    {timeoutBudget},
  );

  t.equal(result.success, true);
  t.equal(provisionCalls.length, 1);
  t.equal(provisionCalls[0]?.timeoutBudget, timeoutBudget);
});

test('TableCreationService - uses authoritative metadata reads to avoid ' +
  'duplicate CREATE TABLE IF NOT EXISTS under cache lag', async (t) => {
  const provisionCalls = [];
  let readCount = 0;
  const service = new TableCreationService({
    systemCache: {
      find() {
        return null;
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows(tableName) {
        readCount += 1;
        if (tableName === 'tables') {
          return {
            success: true,
            rows: [{
              table_id: 'tbl-users',
              table_name: 'users',
            }],
          };
        }
        if (tableName === 'partitions') {
          return {
            success: true,
            rows: [{
              partition_id: 'tbl-users-p1',
              table_id: 'tbl-users',
              table_name: 'users',
              replica_count: 3,
            }],
          };
        }
        return {success: true, rows: []};
      },
      async submitMutation() {
        throw new Error('submitMutation should not be called when table exists');
      },
    },
    partitionProvisioner: async (context) => {
      provisionCalls.push(context);
    },
  });

  const result = await service.executeCreateTableProvisioning({
    ...createCreateTableAst(),
    ifNotExists: true,
  });

  t.equal(result.success, true);
  t.equal(result.skipped, true);
  t.equal(readCount, 2,
    'authoritative table and partition reads should repair cache lag');
  t.equal(provisionCalls.length, 1,
    'authoritative retries should still reconcile initial partition provisioning');
  t.equal(provisionCalls[0]?.tableId, 'tbl-users');
  t.equal(provisionCalls[0]?.partitionId, 'tbl-users-p1');
});

test('TableCreationService - forwards timeout budget through CREATE TABLE IF ' +
  'NOT EXISTS reconciliation provisioning', async (t) => {
  const provisionCalls = [];
  const timeoutBudget = {deadlineMs: 9876};
  const service = new TableCreationService({
    systemCache: {
      find(tableName, predicate) {
        if (tableName === 'tables') {
          return [{
            table_id: 'tbl-users',
            table_name: 'users',
          }].find(predicate) || null;
        }
        if (tableName === 'partitions') {
          return [{
            partition_id: 'tbl-users-p1',
            table_id: 'tbl-users',
            table_name: 'users',
            replica_count: 3,
          }].find(predicate) || null;
        }
        return null;
      },
    },
    partitionProvisioner: async (context) => {
      provisionCalls.push(context);
    },
  });

  const result = await service.executeCreateTableProvisioning({
    ...createCreateTableAst(),
    ifNotExists: true,
  }, {
    timeoutBudget,
  });

  t.equal(result.success, true);
  t.equal(result.skipped, true);
  t.equal(provisionCalls.length, 1);
  t.equal(provisionCalls[0]?.timeoutBudget, timeoutBudget);
});

test('TableCreationService - rejects duplicate CREATE TABLE when ' +
  'authoritative metadata already exists', async (t) => {
  const service = new TableCreationService({
    systemCache: {
      find() {
        return null;
      },
    },
    controlPlaneSystemTableGateway: {
      async readRows(tableName) {
        if (tableName === 'tables') {
          return {
            success: true,
            rows: [{
              table_id: 'tbl-users',
              table_name: 'users',
            }],
          };
        }
        return {success: true, rows: []};
      },
      async submitMutation() {
        throw new Error('submitMutation should not be called when table exists');
      },
    },
  });

  await t.rejects(
    service.executeCreateTableProvisioning(createCreateTableAst()),
    /already exists/i,
    'authoritative duplicate detection should preserve CREATE TABLE semantics',
  );
});

test('TableCreationService - provisions initial partition when callback is configured',
  async (t) => {
    let provisionContext = null;
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
      },
      partitionProvisioner: async (context) => {
        provisionContext = context;
      },
    });

    const result = await service.executeCreateTableProvisioning(createCreateTableAst());
    t.equal(result.success, true);
    t.ok(provisionContext, 'partition provisioner should receive context');
    t.equal(provisionContext?.tableName, 'users', 'provisioner gets table name');
    t.equal(provisionContext?.replicaCount, 3, 'provisioner gets replica count');
    t.ok(
      String(provisionContext?.partitionId || '').startsWith('tbl-'),
      'provisioner gets generated partition ID',
    );
    t.equal(
      provisionContext?.tableMetadata?.table_name,
      'users',
      'provisioner gets the canonical table metadata snapshot',
    );
    t.equal(
      provisionContext?.partitionMetadata?.partition_id,
      provisionContext?.partitionId,
      'provisioner gets the canonical partition metadata snapshot',
    );
  });

test('TableCreationService - provisions CREATE TABLE partitions with a ' +
  'quorum-sized minimum routable cohort', async (t) => {
  let provisionContext = null;
  const service = new TableCreationService({
    systemCache: {
      find() {
        return null;
      },
    },
    cdcIntegrationService: {
      async insertSystemTableRow() {
        return {success: true};
      },
    },
    calculateQuorumReplicaCount(replicaCount) {
      return Math.floor(replicaCount / 2) + 1;
    },
    partitionProvisioner: async (context) => {
      provisionContext = context;
    },
  });

  const result = await service.executeCreateTableProvisioning(createCreateTableAst());

  t.equal(result.success, true);
  t.equal(
    provisionContext?.minimumRoutableReplicaCount,
    2,
    'CREATE TABLE should require only a quorum-sized routable cohort before returning',
  );
});

test('TableCreationService - surfaces initial partition provisioning failures',
  async (t) => {
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
      },
      partitionProvisioner: async () => {
        throw new Error('provision failed');
      },
    });

    await t.rejects(
      service.executeCreateTableProvisioning(createCreateTableAst()),
      /provision failed/,
      'create table should fail when partition provisioning fails',
    );
  });

test('TableCreationService - CREATE TABLE IF NOT EXISTS restores missing ' +
  'initial partition metadata before continuing provisioning', async (t) => {
  const submittedMutations = [];
  const provisionCalls = [];
  const existingTable = {
    table_id: 'tbl-users',
    table_name: 'users',
    active_partition_version: 1,
  };
  const service = new TableCreationService({
    systemCache: {
      find(tableName, predicate) {
        if (tableName === 'tables') {
          return predicate(existingTable) ? existingTable : null;
        }
        return null;
      },
    },
    controlPlaneSystemTableGateway: {
      async submitMutation(mutation) {
        submittedMutations.push(mutation);
        return {success: true};
      },
      async readRows() {
        return {rows: []};
      },
    },
    partitionProvisioner: async (context) => {
      provisionCalls.push(context);
    },
  });

  const result = await service.executeCreateTableProvisioning({
    ...createCreateTableAst(),
    ifNotExists: true,
  });

  t.equal(result.success, true);
  t.equal(result.skipped, true);
  t.equal(result.partitionMetadataCreated, true);
  t.equal(
    result.completionState,
    TABLE_CREATION_TEST_COMPLETION_STATE.PENDING_CREATION,
  );
  t.equal(
    result.completionReason,
    TABLE_CREATION_TEST_COMPLETION_REASON.REPLICA_CONVERGENCE_PENDING,
  );
  t.equal(result.contractState, OWNER_CONTRACT_STATE.PENDING);
  t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.WAIT);
  t.equal(submittedMutations.length, 1);
  t.equal(submittedMutations[0].tableName, 'partitions');
  t.equal(submittedMutations[0].row.partition_id, 'tbl-users-p1');
  t.equal(provisionCalls.length, 1);
  t.equal(provisionCalls[0].partitionId, 'tbl-users-p1');
});

test('TableCreationService - CREATE TABLE opts metadata writes into pending visibility semantics',
  async (t) => {
    const submittedMutations = [];
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {},
      controlPlaneSystemTableGateway: {
        async submitMutation(mutation, options) {
          submittedMutations.push({mutation, options});
          return {
            success: true,
            visibilityState:
              CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY,
          };
        },
      },
      partitionProvisioner: async () => {},
    });

    const result = await service.executeCreateTableProvisioning(createCreateTableAst());

    t.equal(submittedMutations.length, 2);
    t.equal(
      submittedMutations[0].options.allowPendingVisibility,
      true,
      'table metadata writes should tolerate pending cache visibility after authoritative commit',
    );
    t.equal(
      submittedMutations[1].options.allowPendingVisibility,
      true,
      'partition metadata writes should tolerate pending cache visibility after authoritative commit',
    );
    t.equal(
      result.visibilityState,
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY,
      'create table should surface that metadata commit succeeded while visibility is still converging',
    );
    t.equal(result.contractState, OWNER_CONTRACT_STATE.PENDING);
    t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.WAIT);
    t.equal(result.visibilityPending, true);
    t.equal(
      result.completionState,
      TABLE_CREATION_TEST_COMPLETION_STATE.PENDING_CREATION,
      'create table should not claim full convergence when provisioning exposes no replica evidence',
    );
    t.equal(
      result.completionReason,
      TABLE_CREATION_TEST_COMPLETION_REASON.METADATA_VISIBILITY_PENDING,
    );
  });


test('TableCreationService - CREATE TABLE preserves authoritative confirmation pending visibility state',
  async (t) => {
    const submittedMutations = [];
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {},
      controlPlaneSystemTableGateway: {
        async submitMutation(mutation, options) {
          submittedMutations.push({mutation, options});
          return {
            success: true,
            visibilityState:
              mutation.tableName === 'tables' ?
                CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE
                  .AUTHORITATIVE_CONFIRMATION_PENDING :
                CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
          };
        },
      },
      partitionProvisioner: async () => {},
    });

    const result = await service.executeCreateTableProvisioning(createCreateTableAst());

    t.equal(submittedMutations.length, 2);
    t.equal(
      result.visibilityState,
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE
        .AUTHORITATIVE_CONFIRMATION_PENDING,
      'create table should preserve the strongest pending metadata visibility state',
    );
    t.equal(result.contractState, OWNER_CONTRACT_STATE.PENDING);
    t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.WAIT);
    t.equal(result.visibilityPending, true);
    t.equal(
      result.completionState,
      TABLE_CREATION_TEST_COMPLETION_STATE.PENDING_CREATION,
    );
    t.equal(
      result.completionReason,
      TABLE_CREATION_TEST_COMPLETION_REASON.METADATA_VISIBILITY_PENDING,
    );
  });

test('TableCreationService - CREATE TABLE preserves deferred metadata ' +
  'visibility as a retryable contract',
async (t) => {
  const service = new TableCreationService({
    systemCache: {
      find() {
        return null;
      },
    },
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      async submitMutation() {
        return {
          success: true,
          visibilityState:
            CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE
              .DEFERRED_BY_PRESSURE,
        };
      },
    },
    partitionProvisioner: async () => {},
  });

  const result = await service.executeCreateTableProvisioning(createCreateTableAst());

  t.equal(
    result.visibilityState,
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE,
  );
  t.equal(result.contractState, OWNER_CONTRACT_STATE.DEFERRED);
  t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.RETRY);
  t.equal(result.visibilityPending, true);
  t.equal(
    result.completionState,
    TABLE_CREATION_TEST_COMPLETION_STATE.PENDING_CREATION,
  );
  t.equal(
    result.completionReason,
    TABLE_CREATION_TEST_COMPLETION_REASON.METADATA_VISIBILITY_PENDING,
  );
});

test('TableCreationService - CREATE TABLE stays pending when only the minimum routable cohort is converged',
  async (t) => {
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
      },
      partitionProvisioner: async () => {
        return {
          requestedReplicaCount: 3,
          resolvedReplicaCount: 3,
          minimumRoutableReplicaCount: 2,
          routableReplicaCount: 2,
        };
      },
    });

    const result = await service.executeCreateTableProvisioning(createCreateTableAst());

    t.equal(
      result.completionState,
      TABLE_CREATION_TEST_COMPLETION_STATE.PENDING_CREATION,
    );
    t.equal(
      result.completionReason,
      TABLE_CREATION_TEST_COMPLETION_REASON.REPLICA_CONVERGENCE_PENDING,
    );
    t.equal(result.contractState, OWNER_CONTRACT_STATE.PENDING);
    t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.WAIT);
    t.equal(
      result.visibilityState,
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
    );
    t.equal(result.visibilityPending, false);
    t.same(
      result.provisioningSummary,
      {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 2,
        fullReplicaCountConverged: false,
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
        reasonCodes: [],
        retryAfterMs: 0,
      },
      'table creation should surface that write quorum exists while full replica convergence is still pending',
    );
  });

test('TableCreationService - CREATE TABLE without provisioning detail stays pending on the quorum contract',
  async (t) => {
    const service = new TableCreationService({
      systemCache: {
        find() {
          return null;
        },
      },
      cdcIntegrationService: {
        async insertSystemTableRow() {
          return {success: true};
        },
      },
      partitionProvisioner: async () => {},
    });

    const result = await service.executeCreateTableProvisioning(createCreateTableAst());

    t.equal(
      result.completionState,
      TABLE_CREATION_TEST_COMPLETION_STATE.PENDING_CREATION,
    );
    t.equal(
      result.completionReason,
      TABLE_CREATION_TEST_COMPLETION_REASON.REPLICA_CONVERGENCE_PENDING,
    );
    t.equal(result.contractState, OWNER_CONTRACT_STATE.PENDING);
    t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.WAIT);
    t.same(
      result.provisioningSummary,
      {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 2,
        fullReplicaCountConverged: false,
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
        reasonCodes: [],
        retryAfterMs: 0,
      },
      'table creation should default to the quorum-sized routable contract when the provisioner does not report convergence detail',
    );
  });
