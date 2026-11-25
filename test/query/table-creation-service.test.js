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
import {
  projectApplicationDatabaseResult,
  withExecutedStatementType,
} from '../../src/query/application-database-result.js';
import {
  SQLParser,
} from '../../src/query/sql-parser.js';
import {
  executeFromlessSelectInSession,
} from '../../src/query/sql-select-execution-helpers.js';
import {
  defineLazyRowObjectsGetter,
  getObjectRowMaterializationCount,
  hasLazyRowsProperty,
  resetObjectRowMaterializationCount,
} from '../../src/query/sql-value-presentation.js';
import {
  isPartitionVisibleForRouting,
  resolveActivePartitionVersion,
} from '../../src/query/sql-query-engine-table-routing-methods.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const TABLE_CREATION_TEST_COMPLETION_STATE = Object.freeze({
  ACTIVE: 'active',
  PENDING_CREATION: 'pending_creation',
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

test('TableCreationService - does not log shutdown cancellation as failure',
  async (t) => {
    let errorLogs = 0;
    const service = new TableCreationService({
      partitionProvisioner: async () => {
        throw new Error('Schema provisioning cancelled during shutdown');
      },
    });
    service.logger = {
      debug() {},
      error() {
        errorLogs += 1;
      },
    };

    await t.rejects(service.provisionInitialPartition({
      cancellationToken: {isCancelled: () => true},
      partitionId: 'partition-shutdown',
      replicaCount: 3,
      tableId: 'table-shutdown',
      tableName: 'shutdown_table',
    }), /cancelled during shutdown/u);
    t.equal(errorLogs, 0);
    await service.shutdown();
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
      return {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 2,
        committedReplicaCount: 2,
      };
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
        committedReplicaCount: 2,
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
      return {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 2,
        committedReplicaCount: 2,
      };
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
      return {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 2,
        committedReplicaCount: 2,
      };
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
      return {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 2,
        committedReplicaCount: 2,
      };
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
    TABLE_CREATION_TEST_COMPLETION_STATE.ACTIVE,
  );
  t.equal(
    result.completionReason,
    null,
  );
  t.equal(result.contractState, OWNER_CONTRACT_STATE.UNDER_REPLICATED);
  t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.PROCEED);
  t.equal(submittedMutations.length, 1);
  t.equal(submittedMutations[0].tableName, 'partitions');
  t.equal(submittedMutations[0].row.partition_id, 'tbl-users-p1');
  t.equal(provisionCalls.length, 1);
  t.equal(provisionCalls[0].partitionId, 'tbl-users-p1');
});

// Re-derived for answers at commit (quest
// replica-admission-from-committed-operation, attempt 2; lead decision D1):
// metadata committed = metadata done. The routed metadata writes answer at
// their commit with a position and carry no visibility opt-out; CREATE TABLE
// is pending only on provisioning convergence and success otherwise, and
// neither answer reads the projection after the writes. The client words are
// unchanged until Group A's F10 vocabulary replaces them.
function commitAnsweringTableCreation(provisioning, answerExtra = {}) {
  const submittedMutations = [];
  const counts = {projectionReads: 0, readsAfterFirstWrite: 0};
  const service = new TableCreationService({
    systemCache: {
      find() {
        counts.projectionReads += 1;
        if (submittedMutations.length > 0) counts.readsAfterFirstWrite += 1;
        return null;
      },
    },
    cdcIntegrationService: {},
    controlPlaneSystemTableGateway: {
      async submitMutation(mutation, options) {
        submittedMutations.push({mutation, options});
        return {
          success: true,
          committed: true,
          position: Object.freeze({
            tableName: mutation.tableName,
            key: 'committed-key',
            originHlc: '1793615397288-1-seam-node',
          }),
          ...answerExtra,
        };
      },
    },
    partitionProvisioner: async () => provisioning,
  });
  return {service, submittedMutations, counts};
}

test('TableCreationService - CREATE TABLE metadata answers at its commit: ' +
  'no visibility opt-out, pending only on provisioning, no projection read',
async (t) => {
  const {service, submittedMutations, counts} =
    commitAnsweringTableCreation(undefined);

  const result = await service.executeCreateTableProvisioning(
    createCreateTableAst());

  t.equal(submittedMutations.length, 2);
  for (const {options} of submittedMutations) {
    t.equal('allowPendingVisibility' in options, false,
      'metadata writes carry no pending-visibility opt-out');
  }
  t.equal('visibilityState' in result, false, 'no visibility state remnant');
  t.equal('visibilityPending' in result, false,
    'no visibility pending remnant');
  t.equal(result.completionState,
    TABLE_CREATION_TEST_COMPLETION_STATE.PENDING_CREATION,
    'unobserved provisioning stays pending_creation until minimum writable replicas converge');
  t.equal(result.completionReason, 'replica_convergence_pending');
  t.equal(result.contractState, OWNER_CONTRACT_STATE.PENDING);
  t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.WAIT);
  t.equal(counts.readsAfterFirstWrite, 0,
    'the answer itself reads no projection after the metadata writes');
});

test('TableCreationService - CREATE TABLE with a converged cohort answers ' +
  'active from the commit with no projection read', async (t) => {
  const {service, counts} = commitAnsweringTableCreation({
    requestedReplicaCount: 3,
    resolvedReplicaCount: 3,
    minimumRoutableReplicaCount: 2,
    routableReplicaCount: 3,
    committedReplicaCount: 3,
  });

  const result = await service.executeCreateTableProvisioning(
    createCreateTableAst());

  t.equal(result.success, true);
  t.equal(result.completionState, TABLE_CREATION_TEST_COMPLETION_STATE.ACTIVE);
  t.equal(result.completionReason, null);
  t.equal(result.contractState, OWNER_CONTRACT_STATE.READY,
    'a provisioned table answers ready, not merely not-pending');
  t.equal(result.provisioningSummary.fullReplicaCountConverged, true,
    'on the converged cohort');
  t.equal('visibilityState' in result, false, 'no visibility state remnant');
  t.equal(counts.readsAfterFirstWrite, 0,
    'the answer itself reads no projection after the metadata writes');
});

// The reachable remnant of the deleted visibility states: an answer that
// still carries a legacy visibility field does not make committed metadata
// pending or deferred.
test('TableCreationService - CREATE TABLE ignores a legacy visibility field ' +
  'on a committed metadata answer', async (t) => {
  for (const legacy of [
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY,
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE
      .AUTHORITATIVE_CONFIRMATION_PENDING,
    CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE,
  ]) {
    const {service} = commitAnsweringTableCreation({
      requestedReplicaCount: 3,
      resolvedReplicaCount: 3,
      minimumRoutableReplicaCount: 2,
      routableReplicaCount: 3,
      committedReplicaCount: 3,
    }, {visibilityState: legacy});

    const result = await service.executeCreateTableProvisioning(
      createCreateTableAst());

    t.equal(result.completionState,
      TABLE_CREATION_TEST_COMPLETION_STATE.ACTIVE,
      `${legacy} on a committed answer is not a pending metadata answer`);
    t.equal('visibilityState' in result, false);
  }
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
          committedReplicaCount: 2,
        };
      },
    });

    const result = await service.executeCreateTableProvisioning(createCreateTableAst());

    t.equal(
      result.completionState,
      TABLE_CREATION_TEST_COMPLETION_STATE.ACTIVE,
    );
    t.equal(
      result.completionReason,
      null,
    );
    t.equal(result.contractState, OWNER_CONTRACT_STATE.UNDER_REPLICATED);
    t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.PROCEED);
    t.equal('visibilityState' in result, false);
    t.equal('visibilityPending' in result, false);
    t.same(
      result.provisioningSummary,
      {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 2,
        committedReplicaCount: 2,
        missingReplicaCount: 1,
        epoch: null,
        fullReplicaCountConverged: false,
        contractState: OWNER_CONTRACT_STATE.UNDER_REPLICATED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
        reasonCodes: [],
        retryAfterMs: 0,
      },
      'table creation should surface that write quorum exists while full replica convergence is still pending',
    );
  });

test('TableCreationService - CREATE TABLE without provisioning detail stays ' +
  'pending_creation with 0 observed routable replicas',
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
    'replica_convergence_pending',
  );
  t.equal(result.contractState, OWNER_CONTRACT_STATE.PENDING);
  t.equal(result.nextAction, OWNER_CONTRACT_NEXT_ACTION.WAIT);
  t.same(
    result.provisioningSummary,
    {
      requestedReplicaCount: 3,
      resolvedReplicaCount: 3,
      minimumRoutableReplicaCount: 2,
      routableReplicaCount: 0,
      committedReplicaCount: 0,
      missingReplicaCount: 3,
      epoch: null,
      fullReplicaCountConverged: false,
      contractState: OWNER_CONTRACT_STATE.PENDING,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      reasonCodes: [],
      retryAfterMs: 0,
    },
    'table creation must not report active/proceed when provisioning provides no observed replicas',
  );
});

test('TableCreationService - CREATE TABLE refuses ACTIVE/PROCEED when observed ' +
  'replicas are missing, zero, or below minimumRoutableReplicaCount',
async (t) => {
  const insufficientCases = [
    {label: 'empty provisioning result object', payload: {}},
    {
      label: 'zero routable and committed replicas',
      payload: {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 0,
        committedReplicaCount: 0,
      },
    },
    {
      label: 'routableReplicaCount below minimumRoutableReplicaCount',
      payload: {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 1,
        committedReplicaCount: 1,
      },
    },
    {
      label: 'committedReplicaCount below minimumRoutableReplicaCount',
      payload: {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 2,
        committedReplicaCount: 1,
      },
    },
    {
      label: 'inconsistent under_replicated/proceed claim with zero observed replicas',
      payload: {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 0,
        committedReplicaCount: 0,
        fullReplicaCountConverged: false,
        contractState: OWNER_CONTRACT_STATE.UNDER_REPLICATED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
      },
    },
    {
      label: 'omitted committedReplicaCount must not be inferred from routableReplicaCount',
      payload: {
        requestedReplicaCount: 3,
        resolvedReplicaCount: 3,
        minimumRoutableReplicaCount: 2,
        routableReplicaCount: 3,
        fullReplicaCountConverged: true,
        contractState: OWNER_CONTRACT_STATE.READY,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
      },
    },
  ];

  for (const testCase of insufficientCases) {
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
      partitionProvisioner: async () => testCase.payload,
    });

    const result = await service.executeCreateTableProvisioning(
      createCreateTableAst(),
    );

    t.not(
      result.completionState,
      TABLE_CREATION_TEST_COMPLETION_STATE.ACTIVE,
      `${testCase.label}: must never report completionState active`,
    );
    t.not(
      result.nextAction,
      OWNER_CONTRACT_NEXT_ACTION.PROCEED,
      `${testCase.label}: must never report nextAction proceed`,
    );
    t.equal(
      result.completionState,
      TABLE_CREATION_TEST_COMPLETION_STATE.PENDING_CREATION,
      `${testCase.label}: must classify as pending_creation`,
    );
    t.equal(
      result.completionReason,
      'replica_convergence_pending',
      `${testCase.label}: must explain pending replica convergence`,
    );
    t.equal(
      result.contractState,
      OWNER_CONTRACT_STATE.PENDING,
      `${testCase.label}: contractState must be pending`,
    );
    t.equal(
      result.nextAction,
      OWNER_CONTRACT_NEXT_ACTION.WAIT,
      `${testCase.label}: nextAction must be wait`,
    );
    t.equal(
      result.provisioningSummary.fullReplicaCountConverged,
      false,
      `${testCase.label}: fullReplicaCountConverged must be false`,
    );
  }
});

test('buildSchemaDefinition round-trips string defaults as SQL literals',
  async (t) => {
    const service = new TableCreationService({});
    const schema = service.buildSchemaDefinition([
      {
        name: 'result_id',
        dataType: {name: 'TEXT'},
        primaryKey: true,
      },
      {
        name: 'source_snapshot_json',
        dataType: {name: 'TEXT'},
        notNull: true,
        defaultValue: {type: 'literal', value: '{}', sqlType: 'TEXT'},
      },
      {
        name: 'computed_at',
        dataType: {name: 'INTEGER'},
        defaultValue: {type: 'literal', value: 0, sqlType: 'INTEGER'},
      },
      {
        name: 'note',
        dataType: {name: 'TEXT'},
        defaultValue: {type: 'literal', value: 'it\'s', sqlType: 'TEXT'},
      },
      {
        name: 'ratio',
        dataType: null,
        defaultValue: {type: 'literal', value: '2.0', sqlType: 'REAL'},
      },
    ]);
    const byName = Object.fromEntries(
      schema.columns.map((column) => [column.name, column]),
    );
    t.equal(
      byName.source_snapshot_json.defaultValue,
      '\'{}\'',
      'string defaults must round-trip as quoted SQL literals — every ' +
        'schema re-emitter interpolates the stored value verbatim into DDL',
    );
    t.equal(
      byName.computed_at.defaultValue,
      '0',
      'numeric defaults stay bare literals',
    );
    t.equal(
      byName.note.defaultValue,
      '\'it\'\'s\'',
      'embedded quotes must be escaped in the stored literal',
    );
    t.equal(
      byName.result_id.defaultValue,
      undefined,
      'columns without defaults must stay undefined',
    );
    t.equal(byName.ratio.defaultValue, '2.0',
      'a decimal default stays a REAL literal, never the text \'2.0\'');
    t.equal(byName.ratio.type, 'BLOB',
      'an untyped column is recorded as BLOB, the type of the same affinity');
    // The DDL every re-emitter builds from this schema must parse in SQLite.
    const {default: Database} = await import('better-sqlite3');
    const db = new Database(':memory:');
    const columnsSql = schema.columns.map((column) => {
      let def = `${column.name} ${column.type}`;
      if (column.primaryKey) def += ' PRIMARY KEY';
      if (column.notNull) def += ' NOT NULL';
      if (column.defaultValue !== undefined) {
        def += ` DEFAULT ${column.defaultValue}`;
      }
      return def;
    }).join(', ');
    db.exec(`CREATE TABLE round_trip (${columnsSql})`);
    db.prepare('INSERT INTO round_trip (result_id) VALUES (?)').run('r1');
    const row = db.prepare('SELECT * FROM round_trip').get();
    t.equal(row.source_snapshot_json, '{}',
      'inserted rows must materialize the unquoted default value');
    t.equal(db.prepare('SELECT typeof(ratio) AS c FROM round_trip').get().c, 'real',
      'the decimal default is stored as a REAL in an untyped (BLOB) column');
    db.close();
  });

test('Lazy-row consolidation: stripPartitionDetails, withExecutedStatementType, ' +
  'and projectApplicationDatabaseResult share canonical lazy mechanics and ' +
  'preserve proxy/accessor sanitization', async (t) => {
  const service = new TableCreationService({});
  let getterCalls = 0;
  const source = defineLazyRowObjectsGetter(
    {
      success: true,
      sourcePartition: 'p1',
      partition_key_start: 'a',
      columns: ['id', 'name'],
      rawRows: [[1, 'Ada']],
    },
    () => {
      getterCalls += 1;
      return [{id: 1, name: 'Ada', _partition_id: 'p1', _sourcePartition: 'p1'}];
    },
  );

  const stripped = service.stripPartitionDetails(source);
  t.equal(getterCalls, 0, 'stripPartitionDetails must not eagerly materialize rows');
  t.equal(hasLazyRowsProperty(stripped), true);
  t.equal('sourcePartition' in stripped, false);

  const stamped = withExecutedStatementType(stripped, 'SELECT');
  t.equal(getterCalls, 0, 'withExecutedStatementType must not eagerly materialize rows');
  t.equal(hasLazyRowsProperty(stamped), true);
  t.equal(stamped.statementType, 'SELECT');

  const projected = projectApplicationDatabaseResult(stamped);
  t.equal(getterCalls, 1, 'projectApplicationDatabaseResult materializes lazy rows once');
  t.equal(Object.getPrototypeOf(projected), null);
  t.equal(Object.isFrozen(projected), true);
  t.same(projected.rows, [{id: 1, name: 'Ada'}]);

  // Accessing stamped.rows again must reuse the memoized stripped array without re-running getter.
  t.same(stamped.rows, [{id: 1, name: 'Ada'}]);
  t.equal(getterCalls, 1);

  // Untrusted hostile getter (without canonical LAZY_ROWS_GETTER_SYMBOL) and
  // Proxies must never be invoked by projectApplicationDatabaseResult.
  let hostileGetterCalls = 0;
  const hostile = {
    success: true,
    get rows() {
      hostileGetterCalls += 1;
      return [{id: 999}];
    },
  };
  const hostileProjected = projectApplicationDatabaseResult(hostile);
  t.equal(hostileGetterCalls, 0, 'untrusted rows getter must not be invoked');
  t.same(hostileProjected.rows, []);

  const proxied = new Proxy({success: true, rows: [{id: 1}]}, {});
  t.same(projectApplicationDatabaseResult(proxied).rows, []);
});

test('executeFromlessSelectInSession preserves lazy rows until .rows is read',
  async (t) => {
    resetObjectRowMaterializationCount();
    const ast = new SQLParser('SELECT 42 AS answer, \'ok\' AS label').parse();
    const result = executeFromlessSelectInSession(ast, [], {safeIntegers: false});
    t.equal(result.success, true);
    t.equal(result.count, 1);
    t.same(result.rawRows, [[42, 'ok']]);
    t.equal(hasLazyRowsProperty(result), true);
    t.equal(
      getObjectRowMaterializationCount(),
      0,
      'executeFromlessSelectInSession must not eagerly materialize object rows',
    );
    t.same(result.rows, [{answer: 42, label: 'ok'}]);
    t.equal(getObjectRowMaterializationCount(), 1);
    t.same(result.rows, [{answer: 42, label: 'ok'}]);
    t.equal(getObjectRowMaterializationCount(), 1);

    resetObjectRowMaterializationCount();
    const safeResult = executeFromlessSelectInSession(ast, [], {safeIntegers: true});
    t.same(safeResult.rawRows, [[42n, 'ok']]);
    t.equal(getObjectRowMaterializationCount(), 0);
    t.same(safeResult.rows, [{answer: 42n, label: 'ok'}]);
    t.equal(getObjectRowMaterializationCount(), 1);
  });

test('resolveActivePartitionVersion and isPartitionVisibleForRouting require ' +
  'valid integer versions and explicit NORMAL state', async (t) => {
  t.equal(resolveActivePartitionVersion(null), null);
  t.equal(resolveActivePartitionVersion({}), null);
  t.equal(resolveActivePartitionVersion({active_partition_version: null}), null);
  t.equal(resolveActivePartitionVersion({active_partition_version: 0}), null);
  t.equal(resolveActivePartitionVersion({active_partition_version: 1.5}), null);
  t.equal(resolveActivePartitionVersion({active_partition_version: 'abc'}), null);
  t.equal(resolveActivePartitionVersion({active_partition_version: 2}), 2);
  t.equal(
    resolveActivePartitionVersion({activePartitionVersion: 3}),
    null,
    'legacy camelCase activePartitionVersion must not be accepted',
  );

  t.equal(
    isPartitionVisibleForRouting({partition_version: 1, state: 'NORMAL'}, 1),
    true,
  );
  t.equal(
    isPartitionVisibleForRouting({partition_version: 1, state: 'normal'}, 1),
    true,
  );
  t.equal(
    isPartitionVisibleForRouting({partition_version: 1}, 1),
    false,
    'missing state must not default to NORMAL',
  );
  t.equal(
    isPartitionVisibleForRouting({partition_version: 1, state: null}, 1),
    false,
  );
  t.equal(
    isPartitionVisibleForRouting({partition_version: 1, state: 'SPLITTING'}, 1),
    false,
  );
  t.equal(
    isPartitionVisibleForRouting({state: 'NORMAL'}, 1),
    false,
    'missing partition_version must not default to 1',
  );
  t.equal(
    isPartitionVisibleForRouting({partition_version: 2, state: 'NORMAL'}, 1),
    false,
  );
  t.equal(
    isPartitionVisibleForRouting({partition_version: 1, state: 'NORMAL'}, null),
    false,
  );
});
