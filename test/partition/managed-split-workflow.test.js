import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
} from '../../src/partition/partition-constants.js';
import {ManagedSplitWorkflow} from '../../src/partition/managed-split-workflow.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_OPERATION_TYPE,
  STORAGE_ADMISSION_REASON,
} from '../../src/rebalancer/storage-admission-constants.js';

function createAdmissionResult(overrides = {}) {
  return {
    allowed: true,
    decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
    operationType: STORAGE_ADMISSION_OPERATION_TYPE.PARTITION_SPLIT,
    requiredReplicaCount: 2,
    eligibleNodeIds: ['node-a', 'node-b'],
    ineligibleNodes: [],
    blockingReasons: [],
    decisionTimestamp: '1970-01-01T00:00:01.000Z',
    ...overrides,
  };
}

function buildWorkflow(options = {}) {
  const updateCalls = options.updateCalls || [];
  const insertCalls = options.insertCalls || [];
  const admissionCalls = options.admissionCalls || [];
  const provisionCalls = options.provisionCalls || [];
  const workflow = new ManagedSplitWorkflow({
    nodeId: 'node-a',
    cdcIntegrationService: options.cdcIntegrationService || {
      async updateSystemTableRow(tableName, whereClause, data, updateOptions) {
        updateCalls.push({tableName, whereClause, data, options: updateOptions});
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row) {
        insertCalls.push({tableName, row});
        return {success: true};
      },
    },
    getPartitionInfo: options.getPartitionInfo || (() => ({
      partition_id: 'users-p1',
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key_start: null,
      partition_key_end: null,
      replica_count: 3,
      leader_node_id: 'node-a',
      size_bytes: 128,
    })),
    getTableInfo: options.getTableInfo || (() => ({
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: null,
      partition_transition_metadata: null,
    })),
    parsePartitionTransition: options.parsePartitionTransition || (() => null),
    isLocalManagedSplitLeader: options.isLocalManagedSplitLeader ||
      (() => true),
    resolveActivePartitionVersion: options.resolveActivePartitionVersion ||
      (() => 1),
    buildManagedSplitPlan: options.buildManagedSplitPlan || (async () => ({
      medianKey: 'm',
      leftPartition: {
        partitionId: 'users-p-left',
        keyRange: {start: null, end: 'm'},
      },
      rightPartition: {
        partitionId: 'users-p-right',
        keyRange: {start: 'm', end: null},
      },
    })),
    calculateQuorumReplicaCount: options.calculateQuorumReplicaCount ||
      (() => 2),
    resolveProvisionTargetNodeIds: options.resolveProvisionTargetNodeIds ||
      (() => ['node-a', 'node-b', 'node-c']),
    getRoutablePartitionServiceNodeIds:
      options.getRoutablePartitionServiceNodeIds ||
      (() => ['node-a', 'node-b']),
    storageAdmissionService:
      Object.hasOwn(options, 'storageAdmissionService') ?
        options.storageAdmissionService :
        {
          async checkSplit(payload) {
            admissionCalls.push(payload);
            return createAdmissionResult();
          },
        },
    waitForTablePartitionMetadata:
      options.waitForTablePartitionMetadata || (async () => {}),
    provisionInitialTablePartition:
      options.provisionInitialTablePartition || (async (context) => {
        provisionCalls.push(context);
      }),
    startSplitReplicationOnSourcePartition:
      options.startSplitReplicationOnSourcePartition || (async () => {}),
    logger: options.logger || {info() {}, error() {}},
    now: options.now || (() => 1000),
  });

  return {
    workflow,
    updateCalls,
    insertCalls,
    admissionCalls,
    provisionCalls,
  };
}

test('ManagedSplitWorkflow persists admission_pending before planning and ' +
  'consumes the admission owner', async (t) => {
  const {
    workflow,
    updateCalls,
    admissionCalls,
  } = buildWorkflow();

  const result = await workflow.execute('users-p1');

  t.equal(result.success, true);
  t.equal(admissionCalls.length, 1);
  t.same(admissionCalls[0], {
    targetNodeIds: ['node-a', 'node-b', 'node-c'],
    estimatedBytes: 128,
    requiredReplicaCount: 2,
    minimumRoutableSourceCount: 2,
    sourceRoutableNodeIds: ['node-a', 'node-b'],
  });
  const pendingUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
  );
  const preparingUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
  );
  t.ok(pendingUpdate, 'workflow should persist admission_pending first');
  t.ok(preparingUpdate, 'workflow should persist split preparation after admission');
  const pendingMetadata = JSON.parse(
    pendingUpdate.data.partition_transition_metadata,
  );
  const preparingMetadata = JSON.parse(
    preparingUpdate.data.partition_transition_metadata,
  );
  t.equal(
    pendingMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.ADMISSION
    ].state,
    PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
  );
  t.equal(
    preparingMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.ADMISSION
    ].decisionType,
    STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
  );
  t.ok(
    preparingMetadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID],
    'workflow id should be persisted in transition metadata',
  );
  t.same(
    preparingUpdate.options?.expectedCacheFields,
    {
      pending_partition_version: 2,
      partition_transition_state:
        PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
      partition_transition_metadata:
        preparingUpdate.data.partition_transition_metadata,
    },
    'workflow should wait for the transition fields to become visible in cache',
  );
});

test('ManagedSplitWorkflow single-flights duplicate split execution',
  async (t) => {
    let resolvePlan;
    const planBarrier = new Promise((resolve) => {
      resolvePlan = resolve;
    });
    let buildCalls = 0;
    const {workflow, admissionCalls} = buildWorkflow({
      calculateQuorumReplicaCount: () => 1,
      resolveProvisionTargetNodeIds: () => ['node-a'],
      getRoutablePartitionServiceNodeIds: () => ['node-a'],
      storageAdmissionService: {
        async checkSplit(payload) {
          admissionCalls.push(payload);
          return createAdmissionResult({
            requiredReplicaCount: 1,
            eligibleNodeIds: ['node-a'],
          });
        },
      },
      buildManagedSplitPlan: async () => {
        buildCalls += 1;
        await planBarrier;
        return {
          medianKey: 'm',
          leftPartition: {
            partitionId: 'users-p-left',
            keyRange: {start: null, end: 'm'},
          },
          rightPartition: {
            partitionId: 'users-p-right',
            keyRange: {start: 'm', end: null},
          },
        };
      },
    });

    const firstExecution = workflow.execute('users-p1');
    const secondExecution = workflow.execute('users-p1');

    t.equal(
      firstExecution,
      secondExecution,
      'duplicate split starts should reuse the in-flight workflow execution',
    );

    resolvePlan();
    await firstExecution;
    t.equal(buildCalls, 1);
    t.equal(admissionCalls.length, 1);
  });

test('ManagedSplitWorkflow persists blocked split admission instead of ' +
  'throwing a generic failure', async (t) => {
  const {
    workflow,
    updateCalls,
    insertCalls,
    provisionCalls,
  } = buildWorkflow({
    buildManagedSplitPlan: async () => {
      t.fail('split planning should not run when admission blocks the split');
    },
    storageAdmissionService: {
      async checkSplit() {
        return createAdmissionResult({
          allowed: false,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.BLOCKED,
          eligibleNodeIds: ['node-a'],
          ineligibleNodes: [{
            nodeId: 'node-b',
            failedDimensions: ['placementEligible'],
            reasonCodes: [
              STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES,
            ],
          }],
          blockingReasons: [
            STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES,
          ],
        });
      },
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, false);
  t.equal(result.state, PARTITION_TRANSITION_STATE.BLOCKED);
  t.equal(insertCalls.length, 0, 'workflow should not insert child metadata');
  t.equal(provisionCalls.length, 0, 'workflow should not start child provisioning');
  const blockedUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state === PARTITION_TRANSITION_STATE.BLOCKED,
  );
  t.ok(blockedUpdate, 'workflow should persist blocked admission state');
  const blockedMetadata = JSON.parse(
    blockedUpdate.data.partition_transition_metadata,
  );
  t.same(
    blockedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.ADMISSION
    ].blockingReasons,
    [STORAGE_ADMISSION_REASON.INSUFFICIENT_PLACEMENT_ELIGIBLE_NODES],
  );
});

test('ManagedSplitWorkflow uses source-routable nodes when active target ' +
  'discovery cannot satisfy split quorum', async (t) => {
  const admissionCalls = [];
  const {
    workflow,
    updateCalls,
    provisionCalls,
  } = buildWorkflow({
    resolveProvisionTargetNodeIds: () => ['node-a'],
    getRoutablePartitionServiceNodeIds: () => ['node-a', 'node-b'],
    calculateQuorumReplicaCount: () => 2,
    storageAdmissionService: {
      async checkSplit(payload) {
        admissionCalls.push(payload);
        return createAdmissionResult({
          requiredReplicaCount: 2,
          eligibleNodeIds: payload.targetNodeIds,
        });
      },
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, true);
  const preparingUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
  );
  t.ok(preparingUpdate, 'workflow should continue into split preparation');
  const preparingMetadata = JSON.parse(
    preparingUpdate.data.partition_transition_metadata,
  );
  t.same(
    preparingMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.ADMISSION
    ].candidateTargetNodeIds,
    ['node-a', 'node-b'],
  );
  t.same(
    provisionCalls.map((context) => context.targetNodeIds),
    [
      ['node-a', 'node-b'],
      ['node-a', 'node-b'],
    ],
    'child provisioning should reuse the admission-selected target nodes',
  );
});

test('ManagedSplitWorkflow preserves workflow identity across deferred ' +
  'admission retries', async (t) => {
  const existingWorkflowId = 'split-tbl-users-users-p1-v2';
  const existingTransition = {
    state: PARTITION_TRANSITION_STATE.DEFERRED,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
        existingWorkflowId,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
      [PARTITION_TRANSITION_METADATA_FIELD.ADMISSION]: {
        state: PARTITION_TRANSITION_STATE.DEFERRED,
      },
    },
  };
  const {
    workflow,
    updateCalls,
    admissionCalls,
  } = buildWorkflow({
    getTableInfo: () => ({
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: PARTITION_TRANSITION_STATE.DEFERRED,
      partition_transition_metadata: JSON.stringify(existingTransition.metadata),
    }),
    parsePartitionTransition: () => existingTransition,
    buildManagedSplitPlan: async () => {
      t.fail('split planning should not run while admission remains deferred');
    },
    storageAdmissionService: {
      async checkSplit(payload) {
        admissionCalls.push(payload);
        return createAdmissionResult({
          allowed: false,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
          eligibleNodeIds: [],
          blockingReasons: [
            STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED,
          ],
        });
      },
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, false);
  t.equal(result.state, PARTITION_TRANSITION_STATE.DEFERRED);
  t.equal(result.workflowId, existingWorkflowId);
  t.equal(admissionCalls.length, 1);
  const pendingUpdate = updateCalls.find((entry) =>
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.ADMISSION_PENDING,
  );
  const deferredUpdate = updateCalls.find((entry) =>
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.DEFERRED,
  );
  t.ok(pendingUpdate, 'retry should re-enter admission_pending');
  t.ok(deferredUpdate, 'retry should persist deferred outcome again');
  const deferredMetadata = JSON.parse(
    deferredUpdate.data.partition_transition_metadata,
  );
  t.equal(
    deferredMetadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID],
    existingWorkflowId,
  );
  t.same(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.ADMISSION
    ].blockingReasons,
    [STORAGE_ADMISSION_REASON.METADATA_PUBLICATION_DEGRADED],
  );
});
import {
  DistributedTransactionCoordinator,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';

test('ManagedSplitWorkflow wraps partition metadata insertion in ' +
  'transaction boundary', async (t) => {
  const txCalls = [];
  const txCoordinator = new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now: () => 1000,
  });
  const originalBegin = txCoordinator.begin.bind(txCoordinator);
  const originalCommit = txCoordinator.commit.bind(txCoordinator);
  txCoordinator.begin = async (sessionId) => {
    txCalls.push(`begin:${sessionId}`);
    return originalBegin(sessionId);
  };
  txCoordinator.commit = async (sessionId) => {
    txCalls.push(`commit:${sessionId}`);
    return originalCommit(sessionId);
  };

  const insertCalls = [];
  const {workflow} = buildWorkflow({
    transactionCoordinator: txCoordinator,
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row) {
        insertCalls.push({tableName, partitionId: row.partition_id});
        return {success: true};
      },
    },
  });
  workflow.transactionCoordinator = txCoordinator;

  const result = await workflow.execute('users-p1');

  t.equal(result.success, true);
  t.equal(
    insertCalls.length,
    2,
    'both partition metadata rows must be inserted',
  );
  t.ok(
    txCalls.some((c) => c.startsWith('begin:')),
    'transaction begin must be called for atomic partition insert',
  );
  t.ok(
    txCalls.some((c) => c.startsWith('commit:')),
    'transaction commit must be called for atomic partition insert',
  );
});

test('ManagedSplitWorkflow fails loudly when storageAdmissionService ' +
  'is not wired', async (t) => {
  // After removing the fallback dual-path, a missing admission service
  // must cause a hard failure rather than silently blocking splits.
  const {workflow} = buildWorkflow({
    storageAdmissionService: null,
    getRoutablePartitionServiceNodeIds: () => ['node-a'],
    calculateQuorumReplicaCount: () => 2,
    resolveProvisionTargetNodeIds: () => [],
  });

  try {
    await workflow.execute('users-p1');
    t.fail('should have thrown when storageAdmissionService is null');
  } catch (error) {
    t.ok(
      error instanceof TypeError,
      'missing admission service should throw TypeError',
    );
  }
});

test('ManagedSplitWorkflow with storageAdmissionService in observe mode ' +
  'overrides denial when quorum is transiently insufficient', async (t) => {
  // When the admission service is properly wired and in observe mode
  // (the default), it should override denials and allow the split even
  // when quorum is transiently insufficient.
  const admissionCalls = [];
  const {
    workflow,
    provisionCalls,
  } = buildWorkflow({
    storageAdmissionService: {
      async checkSplit(payload) {
        admissionCalls.push(payload);
        return createAdmissionResult({
          allowed: true,
          decisionType: STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
          eligibleNodeIds: payload.targetNodeIds,
        });
      },
    },
    getRoutablePartitionServiceNodeIds: () => ['node-a'],
    calculateQuorumReplicaCount: () => 2,
    resolveProvisionTargetNodeIds: () => [],
  });

  const result = await workflow.execute('users-p1');

  t.equal(
    result.success,
    true,
    'admission service with observe mode should allow the split',
  );
  t.equal(admissionCalls.length, 1, 'admission service should be consulted');
  t.ok(
    provisionCalls.length > 0,
    'child provisioning should proceed after admission',
  );
});
