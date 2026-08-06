import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  SPLIT_MERGE_LOG_MSG,
} from '../../src/partition/partition-constants.js';
import {
} from '../../src/query/query-constants.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  SPLIT_PARTICIPANT_PREFIX,
  SPLIT_ACK_STATUS,
} from '../../src/partition/split-ack-constants.js';
import {
  STORAGE_ADMISSION_DECISION_TYPE,
  STORAGE_ADMISSION_REASON,
} from '../../src/rebalancer/storage-admission-constants.js';
import {
  TIMEOUT_BUDGET_CLASSIFICATION,
} from '../../src/control-plane/timeout-budget.js';
import {PRESSURE_WORK_CLASS} from '../../src/control-plane/pressure-governor.js';
import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
} from '../../src/workflow/workflow-constants.js';
import {
  buildWorkflow,
  createAdmissionResult,
} from './managed-split-workflow-test-helpers.js';
import {
  ManagedSplitTopologyAdapter,
} from '../../src/partition/managed-split-topology-adapter.js';
import {
  ManagedMergeTopologyAdapter,
} from '../../src/partition/managed-merge-topology-adapter.js';

test('managed topology adapters preserve coordinator-backed system-table truth',
  (t) => {
    const sqlQueryEngine = {
      rebalanceCoordinator: {
        isCriticalSystemPartition() {
          return true;
        },
      },
    };
    const adapters = [
      new ManagedSplitTopologyAdapter({sqlQueryEngine}),
      new ManagedMergeTopologyAdapter({sqlQueryEngine}),
    ];
    for (const adapter of adapters) {
      t.equal(adapter.isSystemTablePartitionId('nodes-p1'), true);
      t.equal(adapter.isSystemTablePartitionId('nodes-p2'), true);
      t.equal(adapter.isSystemTablePartitionId(' nodes-p1 '), true);
      t.equal(adapter.isSystemTablePartitionId('users-p1'), false);
    }
    const missingCoordinator = new ManagedSplitTopologyAdapter({
      sqlQueryEngine: {},
    });
    t.equal(missingCoordinator.isSystemTablePartitionId('nodes-p1'), false);
    t.end();
  });

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

test('ManagedSplitWorkflow lowers source quorum to one for critical system ' +
  'partition split recovery', async (t) => {
  const publicationsTableRow = {
    table_id: 'tbl-control-plane-publications',
    table_name: 'control_plane_publications',
    partition_key: 'publication_id',
    active_partition_version: 1,
    partition_transition_state: null,
    partition_transition_metadata: null,
  };
  const {
    workflow,
    admissionCalls,
  } = buildWorkflow({
    durableTableRows: [publicationsTableRow],
    getPartitionInfo: () => ({
      partition_id: 'control_plane_publications-p1',
      table_id: 'tbl-control-plane-publications',
      table_name: 'control_plane_publications',
      partition_key_start: null,
      partition_key_end: null,
      replica_count: 5,
      leader_node_id: 'node-a',
      size_bytes: 128,
    }),
    calculateQuorumReplicaCount: () => 3,
    getRoutablePartitionServiceNodeIds: () => ['node-a'],
    isSystemTablePartitionId: (partitionId) =>
      partitionId === 'control_plane_publications-p1',
  });

  await workflow.execute('control_plane_publications-p1');

  t.equal(admissionCalls.length, 1);
  t.equal(
    admissionCalls[0].requiredReplicaCount,
    3,
    'target quorum stays unchanged for critical split planning',
  );
  t.equal(
    admissionCalls[0].minimumRoutableSourceCount,
    1,
    'critical split admission must require one routable source to avoid ' +
    'priority-recovery deadlock',
  );
  t.same(admissionCalls[0].sourceRoutableNodeIds, ['node-a']);
});

test('ManagedSplitWorkflow accepts and persists async source ' +
  'acknowledgements after execute returns', async (t) => {
  const durableTableRows = [{
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key: 'id',
    active_partition_version: 1,
    partition_transition_state: null,
    partition_transition_metadata: null,
    created_at: 1000,
    updated_at: 1000,
  }];
  const updateCalls = [];
  const {workflow} = buildWorkflow({
    updateCalls,
    durableTableRows,
    parsePartitionTransition: (tableInfo) => {
      if (!tableInfo?.partition_transition_state ||
          !tableInfo?.partition_transition_metadata) {
        return null;
      }
      return {
        state: tableInfo.partition_transition_state,
        metadata: JSON.parse(tableInfo.partition_transition_metadata),
      };
    },
  });

  const result = await workflow.execute('users-p1');
  const ackResult = await workflow.acknowledgeSourceParticipant(
    result.workflowId,
    {
      [PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]:
        SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION,
      [PARTICIPANT_ACK_FIELD.STATUS]:
        SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    },
  );

  t.equal(
    ackResult.result,
    PARTICIPANT_ACK_RESULT.ACCEPTED,
    'source acknowledgements should still be accepted after execute returns',
  );
  const latestTransitionUpdate = updateCalls[updateCalls.length - 1];
  const persistedMetadata = JSON.parse(
    latestTransitionUpdate.data.partition_transition_metadata,
  );
  t.equal(
    persistedMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.PARTICIPANTS
    ][SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION].status,
    SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
    'source acknowledgement should be durably persisted in transition metadata',
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

test('ManagedSplitWorkflow defers under local control-plane pressure ' +
  'without creating new durable split metadata', async (t) => {
  const {
    workflow,
    updateCalls,
    insertCalls,
    admissionCalls,
    provisionCalls,
  } = buildWorkflow({
    pressureGovernor: {
      evaluate() {
        return {
          action: 'defer',
          retryAfterMs: 250,
          summary: {backpressured: true},
        };
      },
    },
    buildManagedSplitPlan: async () => {
      t.fail('split planning must not start while the node is hot');
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, false);
  t.equal(
    result.state,
    PARTITION_TRANSITION_STATE.DEFERRED,
    'workflow should return a typed deferred state under pressure',
  );
  t.equal(
    result.error,
    'control_plane_backpressure',
    'workflow should surface the canonical pressure reason',
  );
  t.equal(
    updateCalls.length,
    0,
    'workflow must not create admission metadata rows while pressure blocks the split',
  );
  t.equal(
    insertCalls.length,
    0,
    'workflow must not insert child partitions while pressure blocks the split',
  );
  t.equal(
    admissionCalls.length,
    0,
    'storage admission must not run while the local node is already hot',
  );
  t.equal(
    provisionCalls.length,
    0,
    'child provisioning must not start while pressure defers the split',
  );
  t.equal(result.retryScheduled, true);
  t.type(result.nextAttemptAt, 'string');
});

test('ManagedSplitWorkflow executes write-driven split work under local ' +
  'control-plane pressure when the caller disables defer', async (t) => {
  let pressureRequest = null;
  const {
    workflow,
    updateCalls,
    insertCalls,
    admissionCalls,
    provisionCalls,
  } = buildWorkflow({
    pressureGovernor: {
      evaluate(request) {
        pressureRequest = request;
        if (request?.workClass === PRESSURE_WORK_CLASS.CRITICAL) {
          return {
            action: 'allow',
            retryAfterMs: 0,
            summary: {backpressured: true},
          };
        }
        return {
          action: 'defer',
          retryAfterMs: 250,
          summary: {backpressured: true},
        };
      },
    },
  });

  const result = await workflow.execute('users-p1', {
    workClass: PRESSURE_WORK_CLASS.CRITICAL,
  });

  t.equal(result.success, true);
  t.same(
    pressureRequest,
    {
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      resourceKeys: [
        'partition:split:workflow',
        'control-plane:write',
      ],
    },
    'write-driven split execution should evaluate pressure with the flagless critical profile',
  );
  t.equal(
    admissionCalls.length,
    1,
    'workflow should continue into admission through the critical bypass',
  );
  t.equal(
    provisionCalls.length,
    2,
    'workflow should continue through child provisioning instead of stalling at the pressure gate',
  );
  t.equal(
    updateCalls[0]?.options?.workClass,
    PRESSURE_WORK_CLASS.CRITICAL,
    'workflow transition writes should inherit the critical execution class',
  );
  t.equal(
    insertCalls[0]?.options?.workClass,
    PRESSURE_WORK_CLASS.CRITICAL,
    'child metadata writes should inherit the critical execution class',
  );
  t.equal(
    insertCalls[0]?.options?.skipCacheWait,
    true,
    'child metadata writes should preserve skip-cache-wait semantics',
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
    provisionCalls.map((context) => ({
      targetNodeIds: context.targetNodeIds,
      admissionTargetNodeIds:
        context.admissionConvergence?.candidateTargetNodeIds,
      admittedTargetNodeIds:
        context.admissionConvergence?.admittedTargetNodeIds,
      routingReadinessDimension: context.routingReadinessDimension,
    })),
    [
      {
        targetNodeIds: ['node-a', 'node-b'],
        admissionTargetNodeIds: ['node-a', 'node-b'],
        admittedTargetNodeIds: ['node-a', 'node-b'],
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      },
      {
        targetNodeIds: ['node-a', 'node-b'],
        admissionTargetNodeIds: ['node-a', 'node-b'],
        admittedTargetNodeIds: ['node-a', 'node-b'],
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      },
    ],
    'child provisioning should reuse the admission-selected target nodes ' +
      'under recovery-eligible bootstrap routing',
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
    provisionCalls.map((context) => ({
      targetNodeIds: context.targetNodeIds,
      routingReadinessDimension: context.routingReadinessDimension,
    })),
    [
      {
        targetNodeIds: [
          'node-a',
          'node-d',
          'node-e',
          'node-f',
          'node-g',
          'node-b',
          'node-c',
        ],
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      },
      {
        targetNodeIds: [
          'node-a',
          'node-f',
          'node-g',
          'node-d',
          'node-e',
          'node-b',
          'node-c',
        ],
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      },
    ],
    'child provisioning should expand onto newly eligible nodes and preserve ' +
      'ordered fallbacks under recovery-eligible bootstrap routing',
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

test('ManagedSplitWorkflow defers retryable post-admission provisioning ' +
  'failures instead of persisting terminal failed state', async (t) => {
  const {
    workflow,
    updateCalls,
    insertCalls,
  } = buildWorkflow({
    provisionInitialTablePartition: async ({partitionId}) => {
      if (partitionId === 'users-p-left') {
        throw new Error(
          'Unable to satisfy minimum routable provisioning cohort for ' +
          'partition users-p-left: required=2, provisionable=0, target=3, ' +
          'rejected=node-b:control_plane_write_unhealthy,' +
          'cluster_member_unhealthy',
        );
      }
    },
    startSplitReplicationOnSourcePartition: async () => {
      t.fail('source replication must not start on retryable provisioning deferral');
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, false);
  t.equal(result.state, PARTITION_TRANSITION_STATE.DEFERRED);
  t.equal(
    insertCalls.length,
    2,
    'first attempt should already have inserted child metadata before deferring',
  );
  const failedUpdate = updateCalls.find((entry) =>
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.FAILED,
  );
  t.notOk(
    failedUpdate,
    'retryable provisioning failures must not persist terminal failed state',
  );
  const deferredUpdate = updateCalls.find((entry) =>
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.DEFERRED,
  );
  t.ok(deferredUpdate, 'retryable provisioning failures should persist deferred');
  const deferredMetadata = JSON.parse(
    deferredUpdate.data.partition_transition_metadata,
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.FAILURE
    ].classification,
    'split_child_provisioning_deferred',
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.FAILURE
    ].retryable,
    true,
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.FAILURE
    ].decisionType,
    STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
  );
  t.same(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS
    ],
    ['users-p-left', 'users-p-right'],
    'deferred execution should preserve split child IDs for retry resume',
  );
  t.ok(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.RETRY
    ].nextAttemptAt,
    'retryable provisioning deferral should schedule a retry window',
  );
});

test('ManagedSplitWorkflow defers timeout-classified post-admission ' +
  'provisioning failures instead of persisting terminal failed state',
async (t) => {
  const {
    workflow,
    updateCalls,
  } = buildWorkflow({
    provisionInitialTablePartition: async ({partitionId}) => {
      if (partitionId !== 'users-p-right') {
        return;
      }
      const error = new Error(
        'Timed out waiting for routable partition service for partition ' +
        partitionId,
      );
      error.timeoutClassification = {
        classification:
          TIMEOUT_BUDGET_CLASSIFICATION.PUBLICATION_WAIT_TIMEOUT,
      };
      throw error;
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, false);
  t.equal(result.state, PARTITION_TRANSITION_STATE.DEFERRED);
  t.notOk(
    updateCalls.find((entry) =>
      entry.data.partition_transition_state ===
        PARTITION_TRANSITION_STATE.FAILED,
    ),
    'retryable provisioning timeouts must not persist terminal failed state',
  );
  const deferredUpdate = updateCalls.find((entry) =>
    entry.data.partition_transition_state ===
      PARTITION_TRANSITION_STATE.DEFERRED,
  );
  t.ok(
    deferredUpdate,
    'retryable provisioning timeouts should persist deferred state',
  );
  const deferredMetadata = JSON.parse(
    deferredUpdate.data.partition_transition_metadata,
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.FAILURE
    ].classification,
    'split_child_provisioning_deferred',
  );
  t.equal(
    deferredMetadata[
      PARTITION_TRANSITION_METADATA_FIELD.FAILURE
    ].decisionType,
    STORAGE_ADMISSION_DECISION_TYPE.DEFERRED,
  );
});

test('ManagedSplitWorkflow reuses persisted split plan and child metadata ' +
  'on deferred retries instead of rebuilding a new split plan', async (t) => {
  const existingWorkflowId = 'split-tbl-users-users-p1-v2';
  const existingTransition = {
    state: PARTITION_TRANSITION_STATE.DEFERRED,
    metadata: {
      [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ID]:
        existingWorkflowId,
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_VERSION]: 2,
      [PARTITION_TRANSITION_METADATA_FIELD.SPLIT_KEY]: 'm',
      [PARTITION_TRANSITION_METADATA_FIELD.TARGET_PARTITION_IDS]: [
        'users-p-left',
        'users-p-right',
      ],
    },
  };
  const sourcePartition = {
    partition_id: 'users-p1',
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key_start: null,
    partition_key_end: null,
    partition_version: 1,
    replica_count: 3,
    leader_node_id: 'node-a',
    size_bytes: 128,
  };
  const leftPartition = {
    partition_id: 'users-p-left',
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key_start: null,
    partition_key_end: 'm',
    partition_version: 2,
    replica_count: 3,
    leader_node_id: null,
    size_bytes: 0,
  };
  const rightPartition = {
    partition_id: 'users-p-right',
    table_id: 'tbl-users',
    table_name: 'users',
    partition_key_start: 'm',
    partition_key_end: null,
    partition_version: 2,
    replica_count: 3,
    leader_node_id: null,
    size_bytes: 0,
  };
  const insertCalls = [];
  const {
    workflow,
    provisionCalls,
  } = buildWorkflow({
    getPartitionInfo: (partitionId) => {
      switch (partitionId) {
      case 'users-p1':
        return sourcePartition;
      case 'users-p-left':
        return leftPartition;
      case 'users-p-right':
        return rightPartition;
      default:
        return null;
      }
    },
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
      t.fail('deferred retry should reuse persisted split plan metadata');
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {success: true, affectedRows: 1};
      },
      async insertSystemTableRow(tableName, row) {
        insertCalls.push({tableName, row});
        return {success: true};
      },
    },
  });

  const result = await workflow.execute('users-p1');

  t.equal(result.success, true);
  t.equal(
    insertCalls.length,
    0,
    'retry should not reinsert child partition metadata when rows already exist',
  );
  t.same(
    provisionCalls.map((call) => call.partitionId),
    ['users-p-left', 'users-p-right'],
    'retry should provision the persisted split child IDs',
  );
});
