import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {WORKFLOW_STEP, NODE_STATE, SERVICE_TYPE} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {getWorkflowSteps, WORKFLOW_STEP_TO_STATUS} from '../../src/rebalancer/replica-operation-progress.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {createMockPolicyService, createTestCoordinator} from './test-helpers.js';

const PARTITION_ID = 'replica_operations-p1';
const SOURCE_NODE_ID = 'node-a';
const SOURCE_REPLICA_ID = `${PARTITION_ID}-r1`;
const REMOVE_NODE_ID = 'node-c';
const REMOVE_REPLICA_ID = `${PARTITION_ID}-r3`;
const REMOVE_OPERATION_ID = 'peer-remove';
const COMPETING_OPERATION_ID = 'concurrent-replace';
const CONTACTABLE_TARGET_NODE_ID = 'node-d';
const DOWN_TARGET_NODE_ID = 'down-node';
const READY_LEASE_DURATION_MS = 60_000;
const POLICY_REPLICA_COUNT = 3;
const PREVIOUS_STEPS_WINDOW_MS = 1_000;

const CONCURRENT_OPERATION_ERROR = /concurrent partition operation concurrent-replace is active/i;
const BELOW_VOTER_FLOOR_ERROR = /would drop voter-ready replicas below minimum \(2\/3\)/i;

function buildLedgerRow({operationId, type, replicaId, sourceNodeId, sourceReplicaId,
  targetNodeId, step, createdAt, updatedAt, history}) {
  return {
    operation_id: operationId, type, replica_id: replicaId,
    partition_id: PARTITION_ID, entity_type: SERVICE_TYPE.PARTITION, entity_id: PARTITION_ID,
    source_node_id: sourceNodeId, source_replica_id: sourceReplicaId, target_node_id: targetNodeId,
    status: WORKFLOW_STEP_TO_STATUS[step], workflow_step: step, created_at: createdAt,
    updated_at: updatedAt, completed_at: null, steps_history: JSON.stringify(history),
  };
}

async function evaluateConcurrentRemoveSafety(t, {
  step,
  stepAgeMs = 0,
  updateAgeMs = stepAgeMs,
  targetContactable = true,
}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});

  const now = Date.now();
  const stepEnteredAt = now - stepAgeMs;
  const targetNodeId = targetContactable ? CONTACTABLE_TARGET_NODE_ID : DOWN_TARGET_NODE_ID;
  const subject = buildLedgerRow({
    operationId: REMOVE_OPERATION_ID, type: OperationType.REMOVE,
    replicaId: REMOVE_REPLICA_ID, sourceNodeId: REMOVE_NODE_ID, sourceReplicaId: null,
    targetNodeId: REMOVE_NODE_ID, step: WORKFLOW_STEP.PENDING, createdAt: now, updatedAt: now,
    history: [{step: WORKFLOW_STEP.PENDING, timestamp: now}],
  });
  const replaceSteps = getWorkflowSteps(OperationType.REPLACE);
  const createdAt = stepEnteredAt - PREVIOUS_STEPS_WINDOW_MS;
  const history = replaceSteps.slice(0, replaceSteps.indexOf(step) + 1).map((entry, index) => ({
    step: entry,
    timestamp: entry === step ? stepEnteredAt : createdAt + index,
    ...(index === 0 ?
      {sourceReplicaId: SOURCE_REPLICA_ID} : {previousStep: replaceSteps[index - 1]}),
  }));
  const competitor = buildLedgerRow({
    operationId: COMPETING_OPERATION_ID, type: OperationType.REPLACE,
    replicaId: `${PARTITION_ID}-r9`, sourceNodeId: SOURCE_NODE_ID, sourceReplicaId: SOURCE_REPLICA_ID,
    targetNodeId, step, createdAt, updatedAt: now - updateAgeMs, history,
  });
  const replicaNodes = [SOURCE_NODE_ID, 'node-b', REMOVE_NODE_ID];
  const pingedNodes = [];
  let coordinator;
  try {
    coordinator = createTestCoordinator({
      nodeId: 'seed-node',
      enableTimeouts: false,
      messageRouter: {
        deliver: async () => buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'}),
        getConnectionState: (nodeId) => nodeId === DOWN_TARGET_NODE_ID ? 'reconnecting' : 'connected',
        async pingNode(nodeId) {
          pingedNodes.push(nodeId);
          return nodeId !== DOWN_TARGET_NODE_ID;
        },
        isOutboundQueueAvailable: () => true,
      },
      tablePolicyService: createMockPolicyService({
        getPolicyForPartition: () => ({
          targetReplicaCount: POLICY_REPLICA_COUNT, minReplicaCount: POLICY_REPLICA_COUNT,
        }),
      }),
      cacheData: {
        replicaOperations: [subject, competitor],
        nodes: [...replicaNodes, CONTACTABLE_TARGET_NODE_ID].map((nodeId) => ({
          node_id: nodeId, status: NODE_STATE.ACTIVE, connection_state: NODE_STATE.READY,
          ready_lease_expires_at: now + READY_LEASE_DURATION_MS,
        })),
        services: replicaNodes.map((nodeId, index) => {
          const replicaId = `${PARTITION_ID}-r${index + 1}`;
          return {
            service_id: replicaId, replica_id: replicaId, partition_id: PARTITION_ID,
            node_id: nodeId, service_type: SERVICE_TYPE.PARTITION, status: ReplicaStatus.ACTIVE,
            raft_role: index === 0 ? RAFT_ROLE.LEADER : RAFT_ROLE.FOLLOWER,
            address: `${nodeId}/partition/${replicaId}`,
          };
        }),
      },
    });

    const operation = await coordinator.queryOperationById(REMOVE_OPERATION_ID);
    const gateway = coordinator.controlPlaneSystemTableGateway;
    const read = gateway.readAuthoritativeRows.bind(gateway);
    const arbitrationReads = [];
    gateway.readAuthoritativeRows = async (table, sql, params, options) => {
      const result = await read(table, sql, params, options);
      if (table === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
          params[0] === SERVICE_TYPE.PARTITION && params[1] === PARTITION_ID) {
        arbitrationReads.push({leaderMode: options.leaderMode, result});
      }
      return result;
    };

    const evaluation = await coordinator.workflowOwner.evaluateRemoveSafety(operation);
    t.equal(arbitrationReads.length, 1, 'one SQLite census covers the subject and competitor');
    const census = arbitrationReads[0];
    t.equal(census?.leaderMode, CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      'effect arbitration requires the leader view');
    t.match(census?.result, {success: true, rowSetComplete: true},
      'the SQLite census is complete');
    const byId = new Map((census?.result?.rows ?? []).map((row) => [row.operation_id, row]));
    t.equal(byId.size, 2, 'the entity census contains exactly the two committed operation IDs');
    t.match(byId.get(REMOVE_OPERATION_ID), subject, 'the current REMOVE retains its exact identity');
    t.match(byId.get(COMPETING_OPERATION_ID), competitor,
      'the REPLACE retains its source, binding and durable step history');
    return {error: evaluation?.error, targetPinged: pingedNodes.includes(targetNodeId)};
  } finally {
    try {
      await coordinator?.shutdown();
    } finally {
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    }
  }
}

export {BELOW_VOTER_FLOOR_ERROR, CONCURRENT_OPERATION_ERROR, evaluateConcurrentRemoveSafety};
