import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {createTestCoordinator} from './test-helpers.js';

const STOPPING_REPLICA_OBSERVATION_STATE = Object.freeze({
  OBSERVED: 'observed',
  ABSENT: 'absent',
  UNAVAILABLE: 'unavailable',
});

test('RebalanceCoordinator reconciles REPLACE STOPPING when source ' +
  'replica is already removed and completion outcome is missing',
async (t) => {
  const deliveries = [];
  const messageRouter = {
    async deliver(target, payload) {
      deliveries.push({target, payload});
      return {
        acknowledged: true,
        status: 'initiated',
      };
    },
  };
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter,
    storageAdmissionService: {
      async checkReplace() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 0;
      },
    },
    cacheData: {
      services: [
        {
          service_id: 'mg-1-r1',
          replica_id: 'mg-1-r1',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'seed-node',
          status: 'active',
          address: 'seed-node/message-group/mg-1-r1',
        },
        {
          service_id: 'mg-1-r2',
          replica_id: 'mg-1-r2',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'node-2',
          status: 'active',
          address: 'node-2/message-group/mg-1-r2',
        },
      ],
    },
  });

  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: 'mg-1',
      entityType: 'message_group',
      entityId: 'mg-1',
      nodeId: 'node-3',
      sourceNodeId: 'seed-node',
      replicaId: 'mg-1-r1',
    });

    await coordinator.executeOperation(operation);
    await coordinator.updateStep(operation, WORKFLOW_STEP.ACTIVE);
    await coordinator.executeOperation(operation);

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'remove dispatch should place REPLACE in STOPPING',
    );

    coordinator.repository.getActualReplicaObservation = async (replicaId) => {
      if (replicaId === 'mg-1-r1') {
        return {
          state: STOPPING_REPLICA_OBSERVATION_STATE.ABSENT,
          source: 'authoritative',
        };
      }
      return {
        state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
        source: 'authoritative',
        lifecycleStatus: ReplicaStatus.ACTIVE,
      };
    };

    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
    await coordinator.checkTimeouts();
    const persistedOperation =
      await coordinator.getOperation(operation.operationId);

    t.equal(
      deliveries.length,
      2,
      'REPLACE should dispatch create and remove once',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      'timeout reconciliation should complete STOPPING when source replica is already removed',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator re-dispatches REPLACE STOPPING remove phase ' +
  'while source replica remains active', async (t) => {
  const deliveries = [];
  const messageRouter = {
    async deliver(target, payload) {
      deliveries.push({target, payload});
      if (payload.type === ReplicaOperationMessageType.CREATE_REPLICA) {
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      }
      if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
        const removeDispatchCount = deliveries.filter((entry) =>
          entry.payload.type ===
            ReplicaOperationMessageType.REMOVE_REPLICA,
        ).length;
        return {
          acknowledged: true,
          status: removeDispatchCount >= 2 ?
            ReplicaOperationResponseStatus.COMPLETED :
            ReplicaOperationResponseStatus.INITIATED,
        };
      }
      return {
        acknowledged: true,
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
      };
    },
  };
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter,
    storageAdmissionService: {
      async checkReplace() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 0;
      },
    },
    cacheData: {
      services: [
        {
          service_id: 'mg-1-r1',
          replica_id: 'mg-1-r1',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'seed-node',
          status: 'active',
          address: 'seed-node/message-group/mg-1-r1',
        },
        {
          service_id: 'mg-1-r2',
          replica_id: 'mg-1-r2',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'node-2',
          status: 'active',
          address: 'node-2/message-group/mg-1-r2',
        },
      ],
    },
  });

  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: 'mg-1',
      entityType: 'message_group',
      entityId: 'mg-1',
      nodeId: 'node-3',
      sourceNodeId: 'seed-node',
      replicaId: 'mg-1-r1',
    });

    await coordinator.executeOperation(operation);
    await coordinator.updateStep(operation, WORKFLOW_STEP.ACTIVE);
    await coordinator.executeOperation(operation);

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'remove dispatch should place REPLACE in STOPPING',
    );

    coordinator.repository.getActualReplicaObservation = async (replicaId) => {
      if (replicaId === 'mg-1-r1') {
        return {
          state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
          source: 'authoritative',
          lifecycleStatus: ReplicaStatus.ACTIVE,
        };
      }
      return {
        state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
        source: 'authoritative',
        lifecycleStatus: ReplicaStatus.ACTIVE,
      };
    };

    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
    await coordinator.checkTimeouts();

    const persistedOperation =
      await coordinator.getOperation(operation.operationId);

    t.equal(
      deliveries.length,
      3,
      'coordinator should replay remove dispatch when STOPPING remains active',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.REMOVED,
      'STOPPING reconciliation should complete when replayed remove returns completed',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('RebalanceCoordinator keeps REPLACE STOPPING in progress when source ' +
  'removal visibility is unavailable', async (t) => {
  const deliveries = [];
  const messageRouter = {
    async deliver(target, payload) {
      deliveries.push({target, payload});
      if (payload.type === ReplicaOperationMessageType.CREATE_REPLICA) {
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      }
      if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
        return {
          acknowledged: true,
          status: ReplicaOperationResponseStatus.INITIATED,
        };
      }
      return {
        acknowledged: true,
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
      };
    },
  };
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter,
    storageAdmissionService: {
      async checkReplace() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 0;
      },
    },
    cacheData: {
      services: [
        {
          service_id: 'mg-1-r1',
          replica_id: 'mg-1-r1',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'seed-node',
          status: 'active',
          address: 'seed-node/message-group/mg-1-r1',
        },
        {
          service_id: 'mg-1-r2',
          replica_id: 'mg-1-r2',
          service_type: 'message_group',
          group_id: 'mg-1',
          node_id: 'node-2',
          status: 'active',
          address: 'node-2/message-group/mg-1-r2',
        },
      ],
    },
  });

  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: 'mg-1',
      entityType: 'message_group',
      entityId: 'mg-1',
      nodeId: 'node-3',
      sourceNodeId: 'seed-node',
      replicaId: 'mg-1-r1',
    });

    await coordinator.executeOperation(operation);
    await coordinator.updateStep(operation, WORKFLOW_STEP.ACTIVE);
    await coordinator.executeOperation(operation);

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'remove dispatch should place REPLACE in STOPPING',
    );

    coordinator.repository.getActualReplicaObservation = async (replicaId) => {
      if (replicaId === 'mg-1-r1') {
        return {
          state: STOPPING_REPLICA_OBSERVATION_STATE.UNAVAILABLE,
          source: 'unavailable',
        };
      }
      return {
        state: STOPPING_REPLICA_OBSERVATION_STATE.OBSERVED,
        source: 'authoritative',
        lifecycleStatus: ReplicaStatus.ACTIVE,
      };
    };

    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
    await coordinator.checkTimeouts();
    const persistedOperation =
      await coordinator.getOperation(operation.operationId);

    t.equal(
      deliveries.length,
      2,
      'owner should not invent a completion or replay another remove while visibility is unresolved',
    );
    t.equal(
      persistedOperation?.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'timeout reconciliation should preserve STOPPING when source-removal visibility is unavailable',
    );
  } finally {
    await coordinator.shutdown();
  }
});
