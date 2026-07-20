import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {RECONCILE_REASON} from '../../src/workflow/reconcile-queue-constants.js';
import {
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';

test('ReplicaDispatchService defers not-ready dispatches back onto the ' +
  'owner queue', async (t) => {
  initEnv();

  const scheduled = [];
  const enqueues = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-target-not-ready-dispatch-1',
    type: OperationType.ADD,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          retryAfterMs: 123,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: [{code: 'control_plane_publication_pending'}],
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  const originalQueue = service.operationDispatchQueue;
  service.operationDispatchQueue = {
    enqueue(operationId, reason, context) {
      enqueues.push({operationId, reason, context});
      return true;
    },
    shutdown() {},
  };

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      0,
      'not-ready targets should not dispatch inline',
    );
    t.equal(
      scheduled.length,
      1,
      'not-ready targets should arm one deferred retry timer',
    );
    t.equal(
      scheduled[0].delayMs,
      123,
      'not-ready target retries should honor readiness retryAfterMs',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      1,
      'deferred retry state should be retained until the retry fires',
    );

    scheduled[0].callback();

    t.same(
      enqueues,
      [{
        operationId: operationRow.operation_id,
        reason: RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        context: {row: operationRow, deferredRetryProvenance: true},
      }],
      'deferred target-not-ready retry should re-enter the canonical owner lane with the dispatch row',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      0,
      'deferred retry state should clear after re-enqueue',
    );
  } finally {
    service.operationDispatchQueue = originalQueue;
    service.stop();
  }
});

test('ReplicaDispatchService uses authoritative readiness before dispatching',
  async (t) => {
    initEnv();

    const scheduled = [];
    const authoritativeCalls = [];
    let dispatchCalls = 0;
    const operationRow = {
      operation_id: 'op-authoritative-readiness-dispatch-1',
      type: OperationType.REPLACE,
      partition_id: 'replica_operations-p1',
      replica_id: 'replica_operations-p1-r4',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      status: 'pending',
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: Date.now(),
      updated_at: Date.now(),
      steps_history: '[]',
    };

    const service = createService({
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return {
            nodeId,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            },
            reasons: [],
          };
        },
        async getNodeReadiness(nodeId, options) {
          authoritativeCalls.push({nodeId, options});
          return {
            nodeId,
            retryAfterMs: 321,
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
            },
            reasons: [{code: 'control_plane_publication_pending'}],
          };
        },
      },
      rebalanceCoordinator: {
        async dispatchOperation() {
          dispatchCalls += 1;
          return {success: true};
        },
        isOperationLocallyOwned() {
          return true;
        },
      },
      setTimeoutFn(callback, delayMs) {
        const handle = {callback, delayMs};
        scheduled.push(handle);
        return handle;
      },
      clearTimeoutFn() {},
    });

    try {
      await service.dispatchOperationRow(operationRow);

      t.equal(
        dispatchCalls,
        0,
        'authoritative ineligible readiness should block inline dispatch',
      );
      t.equal(
        authoritativeCalls.length,
        1,
        'dispatch readiness should refresh through the authoritative path',
      );
      t.same(
        authoritativeCalls[0],
        {
          nodeId: 'node-2',
          options: {
            allowAuthoritativeRefresh: true,
            decisionDimension:
              CONTROL_PLANE_READINESS_DIMENSION
                .CONTROL_PLANE_RECOVERY_ELIGIBLE,
            maxCachedAgeMs: 0,
          },
        },
        'authoritative dispatch readiness should bypass cached snapshots',
      );
      t.equal(
        scheduled.length,
        2,
        'authoritative ineligible readiness should arm the bounded refresh guard and one deferred retry timer',
      );
      t.equal(
        scheduled[0].delayMs,
        service.dispatchReadinessRefreshTimeoutMs,
        'dispatch should first arm the bounded authoritative readiness timeout',
      );
      t.equal(
        scheduled[1].delayMs,
        321,
        'authoritative readiness retryAfterMs should still drive the deferred dispatch retry',
      );
      t.equal(
        service.operationDispatchDeferredRetries.size,
        1,
        'authoritative readiness failures should remain queued for retry',
      );
    } finally {
      service.stop();
    }
  });

test('ReplicaDispatchService uses recovery eligibility for critical ' +
  'system-table dispatches', async (t) => {
  initEnv();

  const TARGET_NODE_ID = 'node-2';
  const SOURCE_NODE_ID = 'node-1';
  const OPERATION_ID = 'op-critical-recovery-dispatch-1';
  const PARTITION_ID = 'sql_write_operations-p1';
  const REPLICA_ID = 'sql_write_operations-p1-r4';
  const OPERATION_STATUS = 'pending';
  const EMPTY_STEPS_HISTORY = '[]';

  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: PARTITION_ID,
    replica_id: REPLICA_ID,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    status: OPERATION_STATUS,
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: EMPTY_STEPS_HISTORY,
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId, options) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
          },
          decisionDimension: options?.decisionDimension,
          reasons: [],
        };
      },
      async getNodeReadiness(nodeId, options) {
        authoritativeCalls.push({nodeId, options});
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
          },
          decisionDimension: options?.decisionDimension,
          reasons: [],
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      1,
      'critical system-table dispatch should proceed on recovery eligibility',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      0,
      'recovery-eligible critical dispatch should not defer as not-ready',
    );
    t.same(
      authoritativeCalls[0],
      {
        nodeId: TARGET_NODE_ID,
        options: {
          allowAuthoritativeRefresh: true,
          decisionDimension:
            CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE,
          maxCachedAgeMs: 0,
        },
      },
      'critical dispatch readiness should refresh the recovery dimension',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService admits priority dispatch blocked by circular ' +
  'recovery evidence', async (t) => {
  initEnv();

  const TARGET_NODE_ID = 'node-2';
  const SOURCE_NODE_ID = 'node-1';
  const OPERATION_ID = 'op-priority-recovery-bootstrap-dispatch-1';
  const PARTITION_ID = 'replica_operations-p1';
  const REPLICA_ID = 'replica_operations-p1-r4';
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: OPERATION_ID,
    type: OperationType.ADD,
    partition_id: PARTITION_ID,
    replica_id: REPLICA_ID,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };
  const circularReadiness = {
    nodeId: TARGET_NODE_ID,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
      [CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION
        .METADATA_PUBLICATION_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
    },
    reasons: [
      {
        code: CONTROL_PLANE_READINESS_REASON
          .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      },
    ],
    runtimeAuthority: {
      reasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON
          .PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
    },
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return circularReadiness;
      },
      async getNodeReadiness() {
        return circularReadiness;
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      1,
      'priority dispatch should proceed when the only blocker is the recovery loop',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      0,
      'circular priority recovery evidence should not arm a not-ready retry',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService admits self-target priority dispatch with ' +
  'selected placement still closed', async (t) => {
  initEnv();

  const TARGET_NODE_ID = 'node-1';
  const SOURCE_NODE_ID = 'node-2';
  const OPERATION_ID = 'op-self-priority-recovery-bootstrap-dispatch-1';
  const PARTITION_ID = 'replica_operations-p1';
  const REPLICA_ID = 'replica_operations-p1-r4';
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: OPERATION_ID,
    type: OperationType.REPLACE,
    partition_id: PARTITION_ID,
    replica_id: REPLICA_ID,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };
  const recoveryOpenReadiness = {
    nodeId: TARGET_NODE_ID,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
      [CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION
        .METADATA_PUBLICATION_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
    },
    reasons: [
      {
        code: CONTROL_PLANE_READINESS_REASON
          .LOCAL_QUERY_TRANSPORT_NOT_READY,
      },
      {
        code: CONTROL_PLANE_READINESS_REASON.CONTROL_PLANE_WRITE_UNHEALTHY,
      },
      {
        code: CONTROL_PLANE_READINESS_REASON
          .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      },
    ],
    runtimeAuthority: {
      reasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON
          .PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
    },
    projectionReadinessContract: {
      priorityRecovery: {
        reasonCodes: [
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.CONTROL_PLANE_NOT_WRITABLE,
        ],
      },
    },
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return recoveryOpenReadiness;
      },
      async getNodeReadiness() {
        return recoveryOpenReadiness;
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      1,
      'self-target priority recovery dispatch should proceed',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      0,
      'self-target recovery dispatch should not arm a not-ready retry',
    );
  } finally {
    service.stop();
  }
});

test('ReplicaDispatchService keeps priority dispatch bootstrap closed for ' +
  'non-circular blockers', async (t) => {
  initEnv();

  const TARGET_NODE_ID = 'node-2';
  const SOURCE_NODE_ID = 'node-1';
  const buildOperationRow = (partitionId) => ({
    operation_id: `op-${partitionId}`,
    type: OperationType.ADD,
    partition_id: partitionId,
    replica_id: `${partitionId}-r4`,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  });
  const buildReadiness = (overrides = {}) => ({
    nodeId: TARGET_NODE_ID,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
      [CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION
        .METADATA_PUBLICATION_HEALTHY]: true,
      [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
      ...(overrides.dimensions || {}),
    },
    reasons: overrides.reasons || [
      {
        code: CONTROL_PLANE_READINESS_REASON
          .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
      },
    ],
    runtimeAuthority: overrides.runtimeAuthority || {
      reasonCodes: [
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON
          .PRIORITY_PARTITIONS_NOT_SPREAD,
      ],
    },
  });
  const cases = [
    {
      name: 'missing priority spread reason',
      partitionId: 'replica_operations-p1',
      readiness: buildReadiness({runtimeAuthority: {reasonCodes: []}}),
    },
    {
      name: 'hard placement blocker',
      partitionId: 'replica_operations-p1',
      readiness: buildReadiness({
        dimensions: {
          [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: false,
        },
        reasons: [
          {
            code: CONTROL_PLANE_READINESS_REASON
              .PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
          },
          {code: CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD},
        ],
      }),
    },
    {
      name: 'non-priority partition',
      partitionId: 'user_table-p1',
      readiness: buildReadiness(),
    },
  ];

  for (const testCase of cases) {
    let dispatchCalls = 0;
    const service = createService({
      cdcIntegrationService: {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
      },
      controlPlaneReadinessService: {
        getNodeReadinessSync() {
          return testCase.readiness;
        },
        async getNodeReadiness() {
          return testCase.readiness;
        },
      },
      rebalanceCoordinator: {
        async dispatchOperation() {
          dispatchCalls += 1;
          return {success: true};
        },
        isOperationLocallyOwned() {
          return true;
        },
      },
    });

    try {
      await service.dispatchOperationRow(buildOperationRow(testCase.partitionId));

      t.equal(
        dispatchCalls,
        0,
        `${testCase.name} should not dispatch through the bootstrap grace`,
      );
      t.equal(
        service.operationDispatchDeferredRetries.size,
        1,
        `${testCase.name} should stay on the not-ready retry path`,
      );
    } finally {
      service.stop();
    }
  }
});

test('ReplicaDispatchService defers dispatch when authoritative readiness ' +
  'refresh fails', async (t) => {
  initEnv();

  const scheduled = [];
  let dispatchCalls = 0;
  const operationRow = {
    operation_id: 'op-authoritative-readiness-error-1',
    type: OperationType.REPLACE,
    partition_id: 'replica_operations-p1',
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };

  const service = createService({
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
          },
          reasons: ['sync_snapshot_not_recovery_eligible'],
        };
      },
      async getNodeReadiness() {
        const error = new Error('authoritative_row_source_unavailable');
        error.retryAfterMs = 222;
        throw error;
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCalls += 1;
        return {success: true};
      },
      isOperationLocallyOwned() {
        return true;
      },
    },
    setTimeoutFn(callback, delayMs) {
      const handle = {callback, delayMs};
      scheduled.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
  });

  try {
    await service.dispatchOperationRow(operationRow);

    t.equal(
      dispatchCalls,
      0,
      'readiness refresh failures should not dispatch inline',
    );
    t.equal(
      scheduled.length,
      2,
      'readiness refresh failures should arm the bounded refresh guard and one deferred retry timer',
    );
    t.equal(
      scheduled[0].delayMs,
      service.dispatchReadinessRefreshTimeoutMs,
      'readiness refresh should first arm the bounded authoritative timeout',
    );
    t.equal(
      scheduled[1].delayMs,
      222,
      'retryable readiness refresh failures should reuse retryAfterMs for the deferred dispatch retry',
    );
    t.equal(
      service.operationDispatchDeferredRetries.size,
      1,
      'readiness refresh failures should stay on the owner retry queue',
    );
  } finally {
    service.stop();
  }
});
