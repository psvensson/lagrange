import Database from 'better-sqlite3';
import {SERVICES_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateTableSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {ControlPlaneSystemTableGateway} from
  '../../src/control-plane/control-plane-system-table-gateway.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {ReplicaOperationMessageType, ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {assertOperationUpdateOutcome} from '../../src/rebalancer/replica-operation-update-outcome.js';
import {
  buildMockPolicyAuthorityWitness,
  createMockCache,
  createMockPolicyService,
  createTestCoordinator,
} from './test-helpers.js';
import {bindPlacementAdmission, startPlacementLedger} from
  './placement-bound-coordinator-fixture.js';
import {createReadinessServiceForTest} from '../helpers/readiness-service-fixture.js';
import {TEST_BOOT_INCARNATION} from '../test-helpers/boot-incarnation-fixture.js';

const FLOOR_NOW_MS = 1000;
const FLOOR_NODE_IDS = ['floor-a', 'floor-b', 'floor-c', 'floor-d'];
const FLOOR_PARTITION_ID = 'user-floor-p1';
const FLOOR_PUBLICATION_EPOCH = 7;

// A committed NODES row as a registered node holds it (its boot and storage
// incarnations included: a partition REMOVE is scoped by the boot).
function floorNodeRow(nodeId, lease = 5000) {
  return {node_id: nodeId, status: 'active', connection_state: 'ready',
    last_heartbeat: 900, ready_lease_expires_at: lease,
    boot_incarnation: TEST_BOOT_INCARNATION, storage_incarnation: TEST_BOOT_INCARNATION};
}

function floorPublication() {
  return {
    publication_id: `cluster_membership-${FLOOR_PUBLICATION_EPOCH}`,
    publication_kind: 'cluster_membership', publication_epoch: FLOOR_PUBLICATION_EPOCH,
    publisher_node_id: FLOOR_NODE_IDS[0], status: 'PUBLISHED',
    published_active_node_ids: JSON.stringify(FLOOR_NODE_IDS),
    required_ack_node_ids: JSON.stringify(FLOOR_NODE_IDS),
    acknowledged_node_ids: JSON.stringify(FLOOR_NODE_IDS),
    priority_partition_summary: JSON.stringify({satisfied: true, blockedPartitions: []}),
  };
}

// The committed formation record (control_plane_publications
// cluster_formation row, decoded by decodeFormationRecord): the cluster formed
// on the four floor nodes at the membership epoch, which is its latch epoch.
function floorFormation() {
  return {
    publication_id: 'cluster_formation', publication_kind: 'cluster_formation',
    publication_epoch: FLOOR_PUBLICATION_EPOCH, publisher_node_id: FLOOR_NODE_IDS[0],
    status: 'FORMED', created_at: FLOOR_NOW_MS, updated_at: FLOOR_NOW_MS,
    formation_record: JSON.stringify({version: 1, status: 'FORMED',
      clusterId: 'committed-node-floor', declaredHostCount: FLOOR_NODE_IDS.length,
      declaredByNodeId: FLOOR_NODE_IDS[0], declaredAt: FLOOR_NOW_MS,
      formedAt: FLOOR_NOW_MS, formedByNodeId: FLOOR_NODE_IDS[0],
      formedPublicationEpoch: FLOOR_PUBLICATION_EPOCH, formedHostIds: FLOOR_NODE_IDS,
      formedReadyNodeIds: FLOOR_NODE_IDS, priorityPartitionVoters: {}}),
  };
}

function floorServiceRows() {
  return FLOOR_NODE_IDS.map((id, index) => ({
    service_id: `${FLOOR_PARTITION_ID}-r${index + 1}`,
    replica_id: `${FLOOR_PARTITION_ID}-r${index + 1}`,
    service_type: 'partition', partition_id: FLOOR_PARTITION_ID,
    node_id: id, status: 'active', raft_role: 'follower',
    created_at: FLOOR_NOW_MS, updated_at: FLOOR_NOW_MS, state_entered_at: FLOOR_NOW_MS,
    address: `${id}/partition/${FLOOR_PARTITION_ID}-r${index + 1}`,
  }));
}

// The SERVICES owner's committed rows, answered from their production schema.
function openServicesAuthority(services) {
  const authority = new Database(':memory:');
  authority.exec(generateCreateTableSQL(SERVICES_SCHEMA));
  const planner = new ControlPlaneSystemTableGateway();
  for (const row of services) {
    const {sql, params} = planner.buildSqlMutationPlan({
      operation: 'insert', tableName: TABLES.SERVICES, row,
    });
    authority.prepare(sql).run(...params);
  }
  return authority;
}

// One process of the floor's initiating node: the real coordinator, bound to
// placement admission on the shared ledger, its SERVICES reads answered by the
// SERVICES owner's committed rows.
function createFloorCoordinator(world, readiness, ownsLedger) {
  const {state, cache, ledger, authority, initiatorNodeId} = world;
  const coordinator = createTestCoordinator({
    nodeId: initiatorNodeId, systemTableCache: cache,
    controlPlaneReadinessService: readiness, openLedgerDatabase: ledger.openDatabase,
    enableTimeouts: false, setTimeoutFn: world.setTimeoutFn,
    clearTimeoutFn: world.clearTimeoutFn,
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
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({targetReplicaCount: 3, minReplicaCount: 3}),
    }),
  });
  bindPlacementAdmission(coordinator, ledger, ownsLedger);
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const readRows = gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (tableName, sql, params = [], readOptions) => {
    if (tableName !== TABLES.SERVICES) return readRows(tableName, sql, params, readOptions);
    return {
      success: true,
      rows: authority.prepare(sql).all(...params),
      rowSetComplete: true,
      readAuthorityWitness: buildMockPolicyAuthorityWitness('services-p1'),
    };
  };
  coordinator.workflowOwner.timeSource = {now: () => state.nowMs};
  return coordinator;
}

// The operation the harness evaluates, admitted as production admits it: the
// initiating node's process, its committed owner current (the floor's
// membership, formation and nodes), creates the REMOVE (or REPLACE, then
// committed ACTIVE) through placement admission, after the committed
// formation latch and the REMOVE's committed scope (its SERVICES row and its
// node's boot incarnation), and stops. Its committed owner is its own, so the
// committed owner the harness then evaluates with starts unread.
async function admitFloorOperation(world, options) {
  const readiness = createReadinessServiceForTest({
    nodeId: world.initiatorNodeId, systemTableCache: world.cache,
    now: () => world.state.nowMs, setTimeoutFn: () => ({}), clearTimeoutFn: () => {},
    authoritativeControlPlaneView: {
      canRead: () => true,
      readReadinessOwnerRows: async (tableName) => ({success: true,
        rows: tableName === TABLES.NODES ? FLOOR_NODE_IDS.map((id) => floorNodeRow(id)) :
          [floorPublication(), floorFormation()]}),
    },
  });
  const coordinator = createFloorCoordinator(world, readiness, false);
  try {
    await readiness.readServeEligibility();
    const operation = await coordinator.createOperation({
      type: options.replace ? OperationType.REPLACE : OperationType.REMOVE,
      partitionId: FLOOR_PARTITION_ID,
      nodeId: FLOOR_NODE_IDS[options.replace ? 3 : 0], sourceNodeId: FLOOR_NODE_IDS[0],
      replicaId: `${FLOOR_PARTITION_ID}-r1`,
    });
    if (!options.replace) return operation;
    const active = {
      ...operation,
      replicaId: `${FLOOR_PARTITION_ID}-r4`,
      workflowStep: WORKFLOW_STEP.ACTIVE,
      status: ReplicaStatus.ACTIVE,
    };
    const outcome = assertOperationUpdateOutcome(
      await coordinator.repository.persistOperationUpdate(active, {
        expectedWorkflowStep: WORKFLOW_STEP.PENDING,
      }),
    );
    if (!outcome.persisted || outcome.operation.workflowStep !== WORKFLOW_STEP.ACTIVE ||
        outcome.operation.replicaId !== active.replicaId ||
        outcome.operation.sourceReplicaId !== `${FLOOR_PARTITION_ID}-r1`) {
      throw new Error('fixture could not commit its exact ACTIVE REPLACE');
    }
    return structuredClone(outcome.operation);
  } finally {
    await coordinator.shutdown();
  }
}

// Real coordinator, workflow, readiness and committed owner. Only their SQL,
// transport and clock boundaries are controlled; no cache alias is installed
// on the workflow, and all cache nodes deliberately remain current. The
// operation is admitted first (admitFloorOperation); the harness's coordinator
// is the node's next process on the same ledger, its committed owner reading
// the case's committed state from its first read on.
async function createCommittedFloorHarness(options = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const state = {
    nowMs: FLOOR_NOW_MS,
    nodes: FLOOR_NODE_IDS.map((id) => floorNodeRow(id)),
    fail: false, hold: null, reads: 0, answers: 0, refreshes: 0,
    participation: true, timerFires: 0, effects: [],
    ...options,
  };
  const services = floorServiceRows();
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
  const authority = openServicesAuthority(services);
  const ledger = await startPlacementLedger({nodeId: initiatorNodeId});
  const world = {state, cache, ledger, authority, initiatorNodeId, setTimeoutFn,
    clearTimeoutFn};
  let operation;
  try {
    operation = await admitFloorOperation(world, options);
  } catch (error) {
    await ledger.stop();
    authority.close();
    throw error;
  }
  const readiness = createReadinessServiceForTest({
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
          nodes : [floorPublication(), floorFormation()]};
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
  // Its shutdown stops the ledger.
  const coordinator = createFloorCoordinator(world, readiness, true);
  const owner = coordinator.workflowOwner;
  return {
    owner, coordinator, readiness, state, cache, operation, timers,
    releasePlanningNotifications() {
      options.holdPlanningNotifications = false;
      for (const deliver of state.heldPlanningDeliveries.splice(0)) deliver();
    },
    async shutdown() {
      state.heldPlanningDeliveries.length = 0;
      await coordinator.shutdown();
      authority.close();
      readiness.shutdown();
      ConfigurationManager.resetInstance();
      LoggingService.resetInstance();
    },
  };
}

export {createCommittedFloorHarness, floorNodeRow, FLOOR_NODE_IDS};
