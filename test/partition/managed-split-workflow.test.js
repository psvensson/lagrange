import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  SPLIT_OWNER_MANAGED_PHASES,
  SPLIT_MERGE_LOG_MSG,
} from '../../src/partition/partition-constants.js';
import {ManagedSplitWorkflow} from '../../src/partition/managed-split-workflow.js';
import {
  QUERY_ERROR_MSG,
} from '../../src/query/query-constants.js';
import {
  DistributedTransactionCoordinator,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
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

function createTransactionCoordinator(now = () => 1000) {
  return new DistributedTransactionCoordinator({
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async () => {},
    rollbackParticipant: async () => {},
    now,
  });
}

function buildWorkflow(options = {}) {
  const updateCalls = options.updateCalls || [];
  const insertCalls = options.insertCalls || [];
  const admissionCalls = options.admissionCalls || [];
  const probeProvisioningCalls = options.probeProvisioningCalls || [];
  const provisionCalls = options.provisionCalls || [];
  const transactionCoordinator =
    Object.prototype.hasOwnProperty.call(options, 'transactionCoordinator') ?
      options.transactionCoordinator :
      createTransactionCoordinator(options.now || (() => 1000));
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
    captureTopologySnapshot:
      options.captureTopologySnapshot || null,
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
    probeInitialTablePartitionProvisioning:
      options.probeInitialTablePartitionProvisioning || (async (context) => {
        probeProvisioningCalls.push(context);
        return {
          existingRoutableNodeIds: [],
          candidateTargetNodeIds: Array.isArray(context?.targetNodeIds) ?
            [...context.targetNodeIds] :
            [],
          admittedTargetNodeIds: Array.isArray(context?.targetNodeIds) ?
            [...context.targetNodeIds] :
            [],
          rejectedTargetNodePlans: [],
          maximumProvisionableReplicaCount: Array.isArray(
            context?.targetNodeIds,
          ) ?
            context.targetNodeIds.length :
            0,
        };
      }),
    provisionInitialTablePartition:
      options.provisionInitialTablePartition || (async (context) => {
        provisionCalls.push(context);
      }),
    startSplitReplicationOnSourcePartition:
      options.startSplitReplicationOnSourcePartition || (async () => {}),
    logger: options.logger || {info() {}, error() {}},
    now: options.now || (() => 1000),
    transactionCoordinator,
  });

  return {
    workflow,
    updateCalls,
    insertCalls,
    admissionCalls,
    probeProvisioningCalls,
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
    pendingMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ].attemptCount,
    1,
    'first split attempt should persist retry attempt count',
  );
  t.equal(
    pendingMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT
    ].snapshotVersion,
    1,
    'workflow should persist a versioned topology snapshot for the attempt',
  );
  t.same(
    pendingMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT
    ].candidateTargetNodeIds,
    ['node-a', 'node-b', 'node-c'],
    'topology snapshot should carry the admission candidate cohort',
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
            projectedUtilization: {
              budgetBytes: 1000,
              usedBytes: 900,
              reservedBytes: 50,
              estimatedBytes: 128,
              projectedAllocatedBytes: 1078,
              projectedAvailableBytes: 0,
              projectedUtilizationPercent: 107.8,
            },
            nodeSummary: {
              status: 'active',
              connectionState: 'ready',
              storageBudgetBytes: 1000,
            },
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
  t.equal(
    blockedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.ADMISSION
    ].ineligibleNodes[0].projectedUtilization.projectedUtilizationPercent,
    107.8,
    'blocked admission should persist projected storage pressure for the rejected node',
  );
  t.equal(
    blockedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.ADMISSION
    ].ineligibleNodes[0].nodeSummary.storageBudgetBytes,
    1000,
    'blocked admission should persist node budget context for the rejected node',
  );
  t.equal(
    blockedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ].attemptCount,
    1,
    'retryable admission denial should retain the attempt count',
  );
  t.ok(
    blockedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ].backoffMs > 0,
    'retryable admission denial should persist a retry backoff',
  );
  t.ok(
    blockedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ].nextAttemptAt,
    'retryable admission denial should persist the next retry window',
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

test('ManagedSplitWorkflow spreads child bootstrap cohorts across newly ' +
  'eligible nodes before falling back to the source replica cohort', async (t) => {
  const {
    workflow,
    provisionCalls,
    updateCalls,
  } = buildWorkflow({
    resolveProvisionTargetNodeIds: () => [
      'node-a',
      'node-b',
      'node-c',
      'node-d',
      'node-e',
      'node-f',
      'node-g',
    ],
    getRoutablePartitionServiceNodeIds: () => ['node-a', 'node-b', 'node-c'],
    storageAdmissionService: {
      async checkSplit(payload) {
        return createAdmissionResult({
          requiredReplicaCount: 2,
          eligibleNodeIds: payload.targetNodeIds,
        });
      },
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, true);
  t.same(
    provisionCalls.map((context) => context.targetNodeIds),
    [
      ['node-a', 'node-d', 'node-e', 'node-f', 'node-g', 'node-b', 'node-c'],
      ['node-a', 'node-f', 'node-g', 'node-d', 'node-e', 'node-b', 'node-c'],
    ],
    'child provisioning should expand onto newly eligible nodes and preserve ordered fallbacks instead of cloning the source cohort',
  );
  const preparingUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
  );
  const preparingMetadata = JSON.parse(
    preparingUpdate.data.partition_transition_metadata,
  );
  t.same(
    preparingMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT
    ].childProvisioningTargetNodeIdsByPartitionId,
    {
      'users-p-left': [
        'node-a',
        'node-d',
        'node-e',
        'node-f',
        'node-g',
        'node-b',
        'node-c',
      ],
      'users-p-right': [
        'node-a',
        'node-f',
        'node-g',
        'node-d',
        'node-e',
        'node-b',
        'node-c',
      ],
    },
    'the workflow should persist the stable child bootstrap target order for diagnostics and fallback reuse',
  );
});

test('ManagedSplitWorkflow defers before child metadata insertion when one ' +
  'child bootstrap cohort cannot satisfy the minimum routable plan', async (t) => {
  const probeProvisioningCalls = [];
  const {
    workflow,
    updateCalls,
    insertCalls,
    provisionCalls,
  } = buildWorkflow({
    probeProvisioningCalls,
    resolveProvisionTargetNodeIds: () => [
      'node-a',
      'node-b',
      'node-c',
      'node-d',
      'node-e',
      'node-f',
      'node-g',
    ],
    getRoutablePartitionServiceNodeIds: () => ['node-a', 'node-b', 'node-c'],
    storageAdmissionService: {
      async checkSplit(payload) {
        return createAdmissionResult({
          requiredReplicaCount: 2,
          eligibleNodeIds: payload.targetNodeIds,
        });
      },
    },
    probeInitialTablePartitionProvisioning: async (context) => {
      probeProvisioningCalls.push(context);
      if (context.partitionId === 'users-p-right') {
        return {
          existingRoutableNodeIds: [],
          candidateTargetNodeIds: [...context.targetNodeIds],
          admittedTargetNodeIds: ['node-a'],
          rejectedTargetNodePlans: [{
            targetNodeId: 'node-f',
            decisionType: STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
            blockingReasons: ['control_plane_write_unhealthy'],
            reasonCodes: ['control_plane_write_unhealthy'],
            readinessSnapshot: {
              dimensions: {
                repairEligible: false,
              },
            },
          }],
          maximumProvisionableReplicaCount: 1,
        };
      }
      return {
        existingRoutableNodeIds: [],
        candidateTargetNodeIds: [...context.targetNodeIds],
        admittedTargetNodeIds: ['node-a', 'node-d'],
        rejectedTargetNodePlans: [],
        maximumProvisionableReplicaCount: 2,
      };
    },
    waitForTablePartitionMetadata: async () => {
      t.fail('child metadata visibility waits must not run on precheck deferral');
    },
    startSplitReplicationOnSourcePartition: async () => {
      t.fail('source replication must not start on precheck deferral');
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, false);
  t.equal(result.state, PARTITION_TRANSITION_STATE.DEFERRED);
  t.equal(
    insertCalls.length,
    0,
    'precheck deferral must not insert child metadata rows',
  );
  t.equal(
    provisionCalls.length,
    0,
    'precheck deferral must not start child provisioning',
  );
  t.same(
    probeProvisioningCalls.map((call) => ({
      partitionId: call.partitionId,
      targetNodeIds: call.targetNodeIds,
      minimumRoutableReplicaCount: call.minimumRoutableReplicaCount,
    })),
    [
      {
        partitionId: 'users-p-left',
        targetNodeIds: [
          'node-a',
          'node-d',
          'node-e',
          'node-f',
          'node-g',
          'node-b',
          'node-c',
        ],
        minimumRoutableReplicaCount: 2,
      },
      {
        partitionId: 'users-p-right',
        targetNodeIds: [
          'node-a',
          'node-f',
          'node-g',
          'node-d',
          'node-e',
          'node-b',
          'node-c',
        ],
        minimumRoutableReplicaCount: 2,
      },
    ],
    'child precheck should reuse the exact planned target order for both children',
  );
  const preparingUpdate = updateCalls.find((entry) =>
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
  );
  t.notOk(
    preparingUpdate,
    'workflow must not enter split_preparing before child cohorts are proven viable',
  );
  const deferredUpdate = updateCalls.find((entry) =>
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.DEFERRED,
  );
  t.ok(deferredUpdate, 'workflow should persist a retryable deferred state');
  const deferredMetadata = JSON.parse(
    deferredUpdate.data.partition_transition_metadata,
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.FAILURE
    ].classification,
    'split_child_provisioning_precheck_failed',
  );
  t.same(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT
    ].childProvisioningTargetNodeIdsByPartitionId,
    {
      'users-p-left': [
        'node-a',
        'node-d',
        'node-e',
        'node-f',
        'node-g',
        'node-b',
        'node-c',
      ],
      'users-p-right': [
        'node-a',
        'node-f',
        'node-g',
        'node-d',
        'node-e',
        'node-b',
        'node-c',
      ],
    },
    'deferred metadata should retain the child cohort ordering for retry diagnostics',
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.TOPOLOGY_SNAPSHOT
    ].childProvisioningAdmissionByPartitionId['users-p-right']
      .maximumProvisionableReplicaCount,
    1,
    'deferred metadata should retain the failing child precheck result',
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ].attemptCount,
    1,
    'precheck deferral should retain the current attempt count',
  );
  t.ok(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ].nextAttemptAt,
    'precheck deferral should schedule a retry window',
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
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ].attemptCount,
    2,
    'retry should increment the persisted attempt count',
  );
});

test('ManagedSplitWorkflow respects persisted retry windows before ' +
  'starting another split attempt', async (t) => {
  const existingWorkflowId = 'split-tbl-users-users-p1-v2';
  const existingTransition = {
    state: PARTITION_TRANSITION_STATE.DEFERRED,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
        existingWorkflowId,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
      [PARTITION_TRANSITION_METADATA_FIELD.RETRY]: {
        attemptCount: 1,
        nextAttemptAt: '1970-01-01T00:00:02.000Z',
        backoffMs: 1000,
      },
    },
  };
  const admissionCalls = [];
  const {workflow, updateCalls} = buildWorkflow({
    now: () => 1000,
    getTableInfo: () => ({
      table_id: 'tbl-users',
      table_name: 'users',
      partition_key: 'id',
      active_partition_version: 1,
      partition_transition_state: PARTITION_TRANSITION_STATE.DEFERRED,
      partition_transition_metadata: JSON.stringify(existingTransition.metadata),
    }),
    parsePartitionTransition: () => existingTransition,
    storageAdmissionService: {
      async checkSplit(payload) {
        admissionCalls.push(payload);
        return createAdmissionResult();
      },
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, false);
  t.equal(result.retryScheduled, true);
  t.equal(result.workflowId, existingWorkflowId);
  t.equal(
    result.nextAttemptAt,
    '1970-01-01T00:00:02.000Z',
    'workflow should surface the persisted retry window',
  );
  t.equal(
    admissionCalls.length,
    0,
    'workflow should not probe admission before the retry window opens',
  );
  t.equal(
    updateCalls.length,
    0,
    'workflow should not rewrite transition state when simply honoring retry scheduling',
  );
});

test('ManagedSplitWorkflow defers insufficient-row split planning so the ' +
  'owner path can retry later', async (t) => {
  const {
    workflow,
    updateCalls,
    insertCalls,
    provisionCalls,
  } = buildWorkflow({
    buildManagedSplitPlan: async () => {
      throw new Error(SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT);
    },
    waitForTablePartitionMetadata: async () => {
      t.fail('child metadata wait must not run when planning defers');
    },
    provisionInitialTablePartition: async () => {
      t.fail('child provisioning must not run when planning defers');
    },
    startSplitReplicationOnSourcePartition: async () => {
      t.fail('source replication must not start when planning defers');
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, false);
  t.equal(result.state, PARTITION_TRANSITION_STATE.DEFERRED);
  t.equal(result.error, SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT);
  const deferredUpdate = updateCalls.find((entry) =>
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.DEFERRED,
  );
  t.ok(deferredUpdate, 'retryable planning failure must persist as deferred');
  const deferredMetadata = JSON.parse(
    deferredUpdate.data.partition_transition_metadata,
  );
  t.equal(
    deferredMetadata[PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID],
    result.workflowId,
    'retryable planning failure must preserve workflow identity',
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.ADMISSION
    ].decisionType,
    STORAGE_ADMISSION_DECISION_TYPE.ADMITTED,
    'deferred planning must keep the admitted owner context',
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.FAILURE
    ].classification,
    'split_plan_deferred',
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.FAILURE
    ].message,
    SPLIT_MERGE_LOG_MSG.INSUFFICIENT_ROWS_FOR_SPLIT,
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.FAILURE
    ].retryable,
    true,
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ].attemptCount,
    1,
    'planning deferral should preserve the current attempt count',
  );
  t.ok(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ].backoffMs > 0,
    'planning deferral should persist a retry backoff',
  );
  t.equal(
    insertCalls.length,
    0,
    'planning deferral must not create child partitions',
  );
  t.equal(
    provisionCalls.length,
    0,
    'planning deferral must not provision child replicas',
  );
});

test('ManagedSplitWorkflow wraps partition metadata insertion in ' +
  'transaction boundary', async (t) => {
  const txCalls = [];
  const txCoordinator = createTransactionCoordinator(() => 1000);
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
    resolveProvisionTargetNodeIds: () => ['node-b'],
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

test('ManagedSplitWorkflow silently falls back to sequential writes ' +
  'when transactionCoordinator is absent — atomic topology path must ' +
  'fail closed instead', async (t) => {
  // This test reproduces the architectural contradiction described in
  // Requirement 5 and Design §6: insertPartitionMetadataAtomically
  // silently degrades to sequential writes when the transaction
  // coordinator is not wired, instead of refusing to run the path.
  //
  // The correct behavior is fail-closed: if the atomic cut point
  // cannot be performed atomically, the path must throw rather than
  // silently weaken its semantics.
  const insertCalls = [];
  const {workflow} = buildWorkflow({
    transactionCoordinator: null,
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

  // Confirm the coordinator is absent.
  t.equal(
    workflow.transactionCoordinator,
    null,
    'transactionCoordinator must be absent for this test',
  );

  await t.rejects(
    workflow.execute('users-p1'),
    {
      message:
        QUERY_ERROR_MSG.TABLE_SPLIT_TRANSACTION_COORDINATOR_REQUIRED,
    },
    'atomic split cut point must fail closed without a transaction coordinator',
  );
  t.equal(
    insertCalls.length,
    0,
    'no child partition metadata rows may be inserted without a transaction',
  );
});


// ── Task 5.1: ManagedSplitWorkflow is the only split lifecycle owner ──

test('advanceSplitPhase rejects phases not in the owner-managed set ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const {workflow} = buildWorkflow();
  await workflow.execute('users-p1');

  // The workflow is removed in the finally block of executeInternal,
  // so we need a fresh workflow with an active registration.
  const {workflow: freshWorkflow} = buildWorkflow();
  const result = await freshWorkflow.execute('users-p1');
  // Register a workflow manually to test advanceSplitPhase in isolation.
  const wfCoordinator = freshWorkflow.workflowCoordinator;
  const wfRecord = await wfCoordinator.registerWorkflow({
    workflowId: 'split-test-phase-reject',
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.SPLIT_PREPARING,
    metadata: {},
    createdAt: 1000,
    updatedAt: 1000,
  });

  try {
    await freshWorkflow.advanceSplitPhase(
      wfRecord.workflowId,
      'invalid_phase_not_in_set',
    );
    t.fail('advanceSplitPhase should reject invalid phases');
  } catch (error) {
    t.equal(
      error.message,
      QUERY_ERROR_MSG.TABLE_SPLIT_INVALID_PHASE_TRANSITION,
      'error message must reference the owner-managed phase set',
    );
  }
});

test('advanceSplitPhase rejects unknown workflow IDs ' +
  '(uses ManagedSplitWorkflow as canonical split owner)', async (t) => {
  const {workflow} = buildWorkflow();

  try {
    await workflow.advanceSplitPhase(
      'nonexistent-workflow-id',
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    );
    t.fail('advanceSplitPhase should reject unknown workflow IDs');
  } catch (error) {
    t.equal(
      error.message,
      QUERY_ERROR_MSG.TABLE_SPLIT_WORKFLOW_NOT_FOUND,
      'error message must indicate workflow not found',
    );
  }
});

test('advanceSplitPhase persists the phase transition through the ' +
  'workflow coordinator (uses ManagedSplitWorkflow as canonical ' +
  'split owner)', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});

  // Register a workflow to test advanceSplitPhase in isolation.
  const wfCoordinator = workflow.workflowCoordinator;
  await wfCoordinator.registerWorkflow({
    workflowId: 'split-test-advance',
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
        'split-test-advance',
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
        'users-p-left',
        'users-p-right',
      ],
    },
    createdAt: 1000,
    updatedAt: 1000,
  });

  await workflow.advanceSplitPhase(
    'split-test-advance',
    PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
    {
      [PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT]: 2000,
    },
  );

  const cutoverUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
  );
  t.ok(
    cutoverUpdate,
    'advanceSplitPhase must persist the cutover transition ' +
    'through the workflow coordinator',
  );
  t.equal(
    cutoverUpdate.data.active_partition_version,
    2,
    'cutover transition must promote target version to active',
  );
  t.equal(
    cutoverUpdate.data.pending_partition_version,
    null,
    'cutover transition must clear pending version',
  );
  t.equal(
    cutoverUpdate.data.partition_count,
    2,
    'cutover transition must set partition count from target IDs',
  );
  const persistedMetadata = JSON.parse(
    cutoverUpdate.data.partition_transition_metadata,
  );
  t.equal(
    persistedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.CUTOVER_APPLIED_AT
    ],
    2000,
    'phase metadata must be merged into persisted transition metadata',
  );
});

test('SPLIT_OWNER_MANAGED_PHASES contains all PARTITION_TRANSITION_STATE ' +
  'values — every split phase is owner-managed', (t) => {
  const allPhases = Object.values(PARTITION_TRANSITION_STATE);
  for (const phase of allPhases) {
    t.ok(
      SPLIT_OWNER_MANAGED_PHASES.has(phase),
      `${phase} must be in SPLIT_OWNER_MANAGED_PHASES`,
    );
  }
  t.equal(
    SPLIT_OWNER_MANAGED_PHASES.size,
    allPhases.length,
    'SPLIT_OWNER_MANAGED_PHASES must not contain extra entries',
  );
  t.end();
});

test('PARTITION_TRANSITION_STATE includes SPLIT_CATCHUP as a ' +
  'canonical constant — no bare string allowed', (t) => {
  t.equal(
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    'split_catchup',
    'SPLIT_CATCHUP must be a named constant in PARTITION_TRANSITION_STATE',
  );
  t.ok(
    SPLIT_OWNER_MANAGED_PHASES.has(
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
    ),
    'SPLIT_CATCHUP must be in the owner-managed phase set',
  );
  t.end();
});

// ── Task 5.2: Persist participant state and source checkpoint ──

import {
  SPLIT_ACK_CHECKPOINT_FIELD,
  SPLIT_PARTICIPANT_PREFIX,
  SPLIT_ACK_STATUS,
} from '../../src/partition/split-ack-constants.js';
import {
  PARTICIPANT_ACK_FIELD,
} from '../../src/workflow/workflow-constants.js';

test('persistWorkflowTransition includes participant state in ' +
  'durable metadata when participants exist (Req 2, 3)', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});

  // Register a workflow and add participants via the coordinator.
  const wfCoordinator = workflow.workflowCoordinator;
  const wfRecord = await wfCoordinator.registerWorkflow({
    workflowId: 'split-participant-persist',
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
        'split-participant-persist',
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
    },
    createdAt: 1000,
    updatedAt: 1000,
  });

  // Add participants through the canonical coordinator path.
  await wfCoordinator.upsertParticipant(wfRecord.workflowId, {
    participantId: SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD,
    participantKey: SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD,
    status: SPLIT_ACK_STATUS.CHILD_PROVISIONED,
    fenceToken: 1,
  });
  await wfCoordinator.upsertParticipant(wfRecord.workflowId, {
    participantId: SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD,
    participantKey: SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD,
    status: SPLIT_ACK_STATUS.CHILD_PROVISIONED,
    fenceToken: 1,
  });
  await wfCoordinator.upsertParticipant(wfRecord.workflowId, {
    participantId: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    status: SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
    fenceToken: 1,
  });

  // Advance the phase to trigger a persist with participants.
  await workflow.advanceSplitPhase(
    wfRecord.workflowId,
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  );

  const catchupUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  );
  t.ok(catchupUpdate, 'catchup transition must be persisted');

  const persisted = JSON.parse(
    catchupUpdate.data.partition_transition_metadata,
  );
  const participants =
    persisted[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS];
  t.ok(participants, 'persisted metadata must include participants');
  t.equal(
    participants[SPLIT_PARTICIPANT_PREFIX.LEFT_CHILD].status,
    SPLIT_ACK_STATUS.CHILD_PROVISIONED,
    'left-child participant status must be persisted',
  );
  t.equal(
    participants[SPLIT_PARTICIPANT_PREFIX.RIGHT_CHILD].status,
    SPLIT_ACK_STATUS.CHILD_PROVISIONED,
    'right-child participant status must be persisted',
  );
  t.equal(
    participants[SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION].status,
    SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
    'source-partition participant status must be persisted',
  );
});

test('persistWorkflowTransition includes source checkpoint in ' +
  'durable metadata when source-partition has checkpoint ' +
  '(Req 2, Design §3)', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});

  const wfCoordinator = workflow.workflowCoordinator;
  const wfRecord = await wfCoordinator.registerWorkflow({
    workflowId: 'split-checkpoint-persist',
    ownerKey: 'users-p1',
    tableId: 'tbl-users',
    tableName: 'users',
    partitionId: 'users-p1',
    status: PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
        'split-checkpoint-persist',
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
    },
    createdAt: 1000,
    updatedAt: 1000,
  });

  // Add source-partition participant with checkpoint data.
  await wfCoordinator.upsertParticipant(wfRecord.workflowId, {
    participantId: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    participantKey: SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
    status: SPLIT_ACK_STATUS.CATCHUP_READY,
    fenceToken: 1,
    checkpoint: {
      [SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION]: 123,
      [SPLIT_ACK_CHECKPOINT_FIELD.LAST_APPLIED_DELTA]: 456,
    },
  });

  // Advance phase to trigger persist.
  await workflow.advanceSplitPhase(
    wfRecord.workflowId,
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  );

  const catchupUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  );
  t.ok(catchupUpdate, 'catchup transition must be persisted');

  const persisted = JSON.parse(
    catchupUpdate.data.partition_transition_metadata,
  );

  // Verify source checkpoint is extracted to top-level metadata.
  const sourceCheckpoint =
    persisted[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT];
  t.ok(sourceCheckpoint, 'persisted metadata must include sourceCheckpoint');
  t.equal(
    sourceCheckpoint[SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION],
    123,
    'sourceCheckpoint.snapshotRevision must match participant checkpoint',
  );
  t.equal(
    sourceCheckpoint[SPLIT_ACK_CHECKPOINT_FIELD.LAST_APPLIED_DELTA],
    456,
    'sourceCheckpoint.lastAppliedDelta must match participant checkpoint',
  );

  // Verify participant also carries checkpoint inline.
  const participants =
    persisted[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS];
  t.same(
    participants[SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION].checkpoint,
    {
      [SPLIT_ACK_CHECKPOINT_FIELD.SNAPSHOT_REVISION]: 123,
      [SPLIT_ACK_CHECKPOINT_FIELD.LAST_APPLIED_DELTA]: 456,
    },
    'source-partition participant must carry checkpoint inline',
  );
});

test('persistWorkflowTransition omits participants and ' +
  'sourceCheckpoint when no participants exist ' +
  '(backward compatible)', async (t) => {
  const updateCalls = [];
  const {workflow} = buildWorkflow({updateCalls});

  // Execute a normal split — no participants are added.
  await workflow.execute('users-p1');

  // Find the backfilling transition (last phase in executeInternal).
  const backfillUpdate = updateCalls.find((entry) =>
    entry.tableName === TABLES.TABLES &&
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
  );
  t.ok(backfillUpdate, 'backfilling transition must be persisted');

  const persisted = JSON.parse(
    backfillUpdate.data.partition_transition_metadata,
  );
  t.equal(
    persisted[PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS],
    undefined,
    'metadata must not include participants when none exist',
  );
  t.equal(
    persisted[PARTITION_TRANSITION_METADATA_FIELD.SOURCE_CHECKPOINT],
    undefined,
    'metadata must not include sourceCheckpoint when none exist',
  );
});
