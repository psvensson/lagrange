import {test} from '../../src/test-helpers/tap.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  NODE_CAPABILITY,
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';

const READY_NODE_CAPABILITIES_JSON = JSON.stringify([
  NODE_CAPABILITY.PARTITION_REPLICA,
  NODE_CAPABILITY.MESSAGE_GROUP_REPLICA,
]);

// replica_operations is a priority control-plane partition class, so dispatches
// for it are subject to the priority in-flight lane admission cap.
const PRIORITY_PARTITION_ID = 'replica_operations-p1';

function buildPriorityOperationRow(operationId) {
  const now = Date.now();
  return {
    operation_id: operationId,
    type: OperationType.ADD,
    partition_id: PRIORITY_PARTITION_ID,
    entity_type: 'partition',
    entity_id: PRIORITY_PARTITION_ID,
    replica_id: 'replica_operations-p1-r4',
    source_node_id: 'node-1',
    target_node_id: 'node-2',
    status: 'pending',
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: now,
    updated_at: now,
    steps_history: '[]',
  };
}

function buildReadyService(scheduled, dispatchCounter) {
  const now = Date.now();
  return createService({
    cacheNodes: [{
      node_id: 'node-2',
      status: SERVICE_STATUS.ACTIVE,
      connection_state: STATE.READY,
      capabilities: READY_NODE_CAPABILITIES_JSON,
      last_heartbeat: now,
      ready_lease_expires_at: now + 30000,
    }],
    cdcIntegrationService: {
      upsertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
            [CONTROL_PLANE_READINESS_DIMENSION
              .CONTROL_PLANE_RECOVERY_ELIGIBLE]: true,
          },
        };
      },
    },
    rebalanceCoordinator: {
      async dispatchOperation() {
        dispatchCounter.count += 1;
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
}

test('priority dispatch is deferred when the in-flight lane cap is reached',
  async (t) => {
    initEnv();
    const scheduled = [];
    const dispatchCounter = {count: 0};
    const service = buildReadyService(scheduled, dispatchCounter);
    // Saturate the priority dispatch lane.
    service.priorityControlPlaneDispatchMaxInFlight = 1;
    service.priorityDispatchInFlight.add('priority-op-already-in-flight');

    try {
      await service.dispatchOperationRow(
        buildPriorityOperationRow('priority-op-shed-1'),
      );

      t.equal(
        dispatchCounter.count,
        0,
        'no dispatch is attempted once the priority lane cap is reached',
      );
      t.equal(
        scheduled.length,
        1,
        'lane exhaustion arms exactly one deferred retry timer',
      );
      t.equal(
        scheduled[0].delayMs,
        service.operationDispatchRetryAfterMs,
        'the deferred lane-exhausted retry honors the dispatch retry budget',
      );
      t.equal(
        service.priorityDispatchInFlight.has('priority-op-shed-1'),
        false,
        'a shed operation is never admitted into the in-flight lane set',
      );
    } finally {
      service.stop();
    }
    t.end();
  });

test('priority dispatch proceeds when the in-flight lane has headroom',
  async (t) => {
    initEnv();
    const scheduled = [];
    const dispatchCounter = {count: 0};
    const service = buildReadyService(scheduled, dispatchCounter);
    service.priorityControlPlaneDispatchMaxInFlight = 8;

    try {
      await service.dispatchOperationRow(
        buildPriorityOperationRow('priority-op-admit-1'),
      );

      t.equal(
        dispatchCounter.count,
        1,
        'dispatch is attempted while the priority lane has headroom',
      );
      t.equal(
        service.priorityDispatchInFlight.size,
        0,
        'the in-flight lane set is released after the dispatch settles',
      );
    } finally {
      service.stop();
    }
    t.end();
  });
