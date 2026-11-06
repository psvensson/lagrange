import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ControlPlaneReadinessService} from
  '../../src/control-plane/control-plane-readiness-service.js';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {ReplicaOperationMessageType, ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {createMockCache, createTestCoordinator} from './test-helpers.js';

const FLOOR_NOW_MS = 1000;
const FLOOR_NODE_IDS = ['floor-a', 'floor-b', 'floor-c', 'floor-d'];
const FLOOR_PARTITION_ID = 'user-floor-p1';

function floorNodeRow(nodeId, lease = 5000) {
  return {node_id: nodeId, status: 'active', connection_state: 'ready',
    last_heartbeat: 900, ready_lease_expires_at: lease};
}

function floorPublication() {
  return {
    publication_id: 'cluster_membership-7',
    publication_kind: 'cluster_membership', publication_epoch: 7,
    publisher_node_id: FLOOR_NODE_IDS[0], status: 'PUBLISHED',
    published_active_node_ids: JSON.stringify(FLOOR_NODE_IDS),
    required_ack_node_ids: JSON.stringify(FLOOR_NODE_IDS),
    acknowledged_node_ids: JSON.stringify(FLOOR_NODE_IDS),
    priority_partition_summary: JSON.stringify({satisfied: true, blockedPartitions: []}),
  };
}

// Real coordinator, workflow, readiness and committed owner. Only their SQL,
// transport and clock boundaries are controlled; no cache alias is installed
// on the workflow, and all cache nodes deliberately remain current.
async function createCommittedFloorHarness(options = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const state = {
    nowMs: FLOOR_NOW_MS,
    nodes: FLOOR_NODE_IDS.map((id) => floorNodeRow(id)),
    fail: false, hold: null, reads: 0, answers: 0, refreshes: 0,
    participation: true, timerFires: 0,
    ...options,
  };
  const services = FLOOR_NODE_IDS.map((id, index) => ({
    service_id: `${FLOOR_PARTITION_ID}-r${index + 1}`,
    replica_id: `${FLOOR_PARTITION_ID}-r${index + 1}`,
    service_type: 'partition', partition_id: FLOOR_PARTITION_ID,
    node_id: id, status: 'active', raft_role: 'follower',
    address: `${id}/partition/${FLOOR_PARTITION_ID}-r${index + 1}`,
  }));
  const cache = createMockCache({
    nodes: FLOOR_NODE_IDS.map((id) => floorNodeRow(id)),
    services: services.filter((row) => row.node_id !== options.authoritativeOnlyNode),
  });
  const timers = [];
  const setTimeoutFn = (fn, delayMs) => {
    const timer = {fn: () => {
      state.timerFires++; return fn();
    }, delayMs, cleared: false};
    timers.push(timer);
    return timer;
  };
  const clearTimeoutFn = (timer) => {
    if (timer) timer.cleared = true;
  };
  const initiatorNodeId = options.initiatorNodeId || FLOOR_NODE_IDS[0];
  const readiness = new ControlPlaneReadinessService({
    nodeId: initiatorNodeId, systemTableCache: cache,
    now: () => state.nowMs, setTimeoutFn, clearTimeoutFn,
    authoritativeControlPlaneView: {
      canRead: () => true,
      async readReadinessOwnerRows(tableName) {
        const nodes = state.nodes;
        const failed = state.fail;
        if (tableName === TABLES.NODES) state.reads++;
        if (state.hold) await state.hold;
        return {success: !failed, rows: tableName === TABLES.NODES ?
          nodes : [floorPublication()]};
      },
    },
  });
  // This independent participation projection deliberately opposes node
  // authority in the tests. It remains a separate replacement guard.
  readiness.getControlPlaneParticipationSync = () =>
    ({eligible: state.participation, reasonCodes: []});
  const read = readiness.readServeEligibility.bind(readiness);
  readiness.readServeEligibility = () => {
    state.refreshes++;
    return read();
  };
  const answer = readiness.answerCommittedNodes.bind(readiness);
  readiness.answerCommittedNodes = () => {
    state.answers++;
    return answer();
  };
  const subscribe = readiness.subscribeServeEligibility.bind(readiness);
  state.committedSubscriptions = 0;
  readiness.subscribeServeEligibility = (listener) => {
    state.committedSubscriptions++;
    return options.disableCommittedTrigger ? () => {} : subscribe(listener);
  };
  state.planningEvents = [];
  state.heldPlanningDeliveries = [];
  const subscribePlanning = readiness.subscribeReadinessPlanningSnapshots.bind(readiness);
  readiness.subscribeReadinessPlanningSnapshots = (listener) => subscribePlanning((event) => {
    state.planningEvents.push(event.ownerKey);
    if (options.holdPlanningNotifications) state.heldPlanningDeliveries.push(() => listener(event));
    else listener(event);
  });
  const coordinator = createTestCoordinator({
    nodeId: initiatorNodeId, systemTableCache: cache,
    controlPlaneReadinessService: readiness,
    enableTimeouts: false, setTimeoutFn, clearTimeoutFn,
    messageRouter: {
      deliver: async (target, payload) => {
        if (payload.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
          state.effects.push({target, payload});
        }
        return buildDeliveryEnvelope({acknowledged: true}, {
          status: ReplicaOperationResponseStatus.INITIATED,
        });
      },
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({targetReplicaCount: 3, minReplicaCount: 3}),
    },
  });
  const owner = coordinator.workflowOwner;
  state.effects = [];
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const readRows = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = (tableName, ...args) => tableName === TABLES.SERVICES ?
    Promise.resolve({success: true, rows: services}) : readRows(tableName, ...args);
  owner.timeSource = {now: () => state.nowMs};
  const operation = await coordinator.createOperation({
    type: options.replace ? OperationType.REPLACE : OperationType.REMOVE,
    partitionId: FLOOR_PARTITION_ID,
    nodeId: FLOOR_NODE_IDS[options.replace ? 3 : 0], sourceNodeId: FLOOR_NODE_IDS[0],
    replicaId: `${FLOOR_PARTITION_ID}-r1`,
  });
  if (options.replace) {
    operation.replicaId = `${FLOOR_PARTITION_ID}-r4`;
    operation.workflowStep = WORKFLOW_STEP.ACTIVE;
    operation.status = 'active';
    await coordinator.repository.persistOperationUpdate(operation);
  }
  return {
    owner, coordinator, readiness, state, cache, operation, timers,
    releasePlanningNotifications() {
      options.holdPlanningNotifications = false;
      for (const deliver of state.heldPlanningDeliveries.splice(0)) deliver();
    },
    async shutdown() {
      state.heldPlanningDeliveries.length = 0;
      await coordinator.shutdown();
      readiness.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    },
  };
}

export {createCommittedFloorHarness, floorNodeRow, FLOOR_NODE_IDS};
