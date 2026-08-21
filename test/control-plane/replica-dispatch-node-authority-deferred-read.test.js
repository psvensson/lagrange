import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {NodesOwner} from '../../src/control-plane/owners/nodes-owner.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';

const TEST_NODE_ID = 'node-target';
const TEST_SYSTEM_PARTITION_ID = 'replica_operations-p1';
const TEST_REGULAR_PARTITION_ID = 'customer-orders-p1';
const TEST_RETRY_AFTER_MS = 111;

function buildOperation(partitionId, operationId) {
  return {
    operation_id: operationId,
    type: OperationType.REMOVE,
    partition_id: partitionId,
    entity_type: 'partition',
    entity_id: partitionId,
    replica_id: `${partitionId}-r4`,
    source_node_id: TEST_NODE_ID,
    target_node_id: TEST_NODE_ID,
    status: 'pending',
    workflow_step: WORKFLOW_STEP.SENDING,
    created_at: Date.now(),
    updated_at: Date.now(),
    steps_history: '[]',
  };
}

function buildReadiness(nodeId, decisionDimension, ready, reasonCode = null) {
  return {
    nodeId,
    observedAt: new Date().toISOString(),
    dimensions: {
      [decisionDimension]: ready,
    },
    reasons: reasonCode ? [{code: reasonCode}] : [],
  };
}

function createOwnerBackedDispatchFixture({
  authoritativeResult,
  partitionId = TEST_SYSTEM_PARTITION_ID,
  syncRecoveryEligible = true,
  syncRepairEligible = true,
}) {
  initEnv();
  const scheduled = [];
  const authoritativeCalls = [];
  let dispatchCalls = 0;
  const nodesOwner = new NodesOwner({
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(tableName, sql, params, options) {
        authoritativeCalls.push({tableName, sql, params, options});
        return authoritativeResult;
      },
    },
  });
  const service = createService({
    nodeId: 'node-dispatcher',
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId, options) {
        const decisionDimension = options?.decisionDimension;
        const ready = decisionDimension ===
            CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE ?
          syncRecoveryEligible :
          syncRepairEligible;
        return buildReadiness(nodeId, decisionDimension, ready);
      },
      async getNodeReadiness(nodeId, options) {
        const nodeRow = await nodesOwner.getNode(nodeId, {
          allowAuthoritativeRefresh: true,
          ...options,
        });
        const decisionDimension = options?.decisionDimension;
        return buildReadiness(
          nodeId,
          decisionDimension,
          Boolean(nodeRow),
          nodeRow ? null : 'node_row_missing',
        );
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
  return {
    authoritativeCalls,
    getDispatchCalls: () => dispatchCalls,
    operation: buildOperation(partitionId, `op-${partitionId}`),
    scheduled,
    service,
  };
}

test('NodesOwner typed retryable read failure reaches the existing priority ' +
  'recovery sync fallback', async (t) => {
  const fixture = createOwnerBackedDispatchFixture({
    authoritativeResult: {
      success: false,
      rows: [],
      error: 'control_plane_pressure_degraded while reading nodes',
      errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
      retryAfterMs: TEST_RETRY_AFTER_MS,
      deferRetry: true,
    },
  });
  try {
    await fixture.service.dispatchOperationRow(fixture.operation);
    t.equal(fixture.authoritativeCalls.length, 1,
      'dispatch should perform one real NodesOwner authoritative read');
    t.equal(fixture.getDispatchCalls(), 1,
      'typed retryable owner failure should reuse recovery-eligible sync truth');
    t.equal(fixture.service.operationDispatchDeferredRetries.size, 0,
      'satisfied recovery fallback should not create another retry loop');
  } finally {
    fixture.service.stop();
  }
});

test('NodesOwner successful empty read remains definitive missing-node ' +
  'evidence for priority recovery dispatch', async (t) => {
  const fixture = createOwnerBackedDispatchFixture({
    authoritativeResult: {success: true, rows: []},
  });
  try {
    await fixture.service.dispatchOperationRow(fixture.operation);
    t.equal(fixture.authoritativeCalls.length, 1);
    t.equal(fixture.getDispatchCalls(), 0,
      'successful absence must not engage the failure fallback');
    t.equal(fixture.service.operationDispatchDeferredRetries.size, 1,
      'successful absence should remain on the existing deferred retry lane');
  } finally {
    fixture.service.stop();
  }
});

test('NodesOwner non-retryable read failure remains fail closed for priority ' +
  'recovery dispatch', async (t) => {
  const fixture = createOwnerBackedDispatchFixture({
    authoritativeResult: {
      success: false,
      rows: [],
      error: 'invalid authoritative node row schema',
      errorCode: 'INVALID_AUTHORITATIVE_NODE_ROW',
    },
  });
  try {
    await fixture.service.dispatchOperationRow(fixture.operation);
    t.equal(fixture.getDispatchCalls(), 0,
      'non-retryable owner failures must not engage the sync fallback');
    t.equal(fixture.service.operationDispatchDeferredRetries.size, 1,
      'non-retryable failure should use the existing deferred retry lane');
  } finally {
    fixture.service.stop();
  }
});

test('NodesOwner retryable read failure cannot bypass an ineligible canonical ' +
  'recovery snapshot', async (t) => {
  const fixture = createOwnerBackedDispatchFixture({
    authoritativeResult: {
      success: false,
      rows: [],
      error: 'control_plane_pressure_degraded while reading nodes',
      errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
      retryAfterMs: TEST_RETRY_AFTER_MS,
      deferRetry: true,
    },
    syncRecoveryEligible: false,
  });
  try {
    await fixture.service.dispatchOperationRow(fixture.operation);
    t.equal(fixture.getDispatchCalls(), 0,
      'retryable failure must not override recovery-ineligible sync truth');
    t.equal(fixture.service.operationDispatchDeferredRetries.size, 1,
      'recovery-ineligible work should remain deferred');
  } finally {
    fixture.service.stop();
  }
});

test('NodesOwner retryable read failure cannot widen non-priority dispatch ' +
  'eligibility', async (t) => {
  const fixture = createOwnerBackedDispatchFixture({
    authoritativeResult: {
      success: false,
      rows: [],
      error: 'control_plane_pressure_degraded while reading nodes',
      errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
      retryAfterMs: TEST_RETRY_AFTER_MS,
      deferRetry: true,
    },
    partitionId: TEST_REGULAR_PARTITION_ID,
    syncRepairEligible: true,
  });
  try {
    await fixture.service.dispatchOperationRow(fixture.operation);
    t.equal(fixture.getDispatchCalls(), 0,
      'retryable failures must not reuse sync readiness outside recovery work');
    t.equal(fixture.service.operationDispatchDeferredRetries.size, 1,
      'non-priority work should remain deferred');
  } finally {
    fixture.service.stop();
  }
});
