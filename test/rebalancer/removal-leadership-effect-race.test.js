/**
 * The removal leadership rule across the window between the decision and the
 * removal (owner rule 2026-11-11):
 *  - a REPLACE's source that the group's corroborated authority shows leading
 *    at STOPPING (leadership moved onto it after the decision) is never the
 *    route of its own RETIRE: the gate's one named handoff to the target
 *    leaves, the owner waits SOURCE_LEADS, and the RETIRE follows once the
 *    target leads;
 *  - a plain REMOVE's deferred-safety re-entry never re-dispatches its older
 *    SENDING snapshot once the durable row is past it (the recorded finding:
 *    a stale SENDING snapshot re-dispatched through the effect-revalidation
 *    wait after the row was at STOPPING).
 */
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NODE_STATE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {readReplaceOwnerDiagnostic} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {createMockPolicyService, createTestCoordinator} from './test-helpers.js';
import {createReplaceWitness} from './replace-witness-fixture.js';
import {createLeadershipGroup} from './removal-leadership-group-fixture.js';
import {
  createPublishedPlanningReadinessService,
} from './quorum-conditioned-remove-safety-tail-fixture-builders.js';

const NODE_IDS = Object.freeze(['node-a', 'node-b', 'node-c', 'node-d']);
const SOURCE_LEADS_WAIT = 'source_leads_handoff_pending';
const READY_LEASE_MS = 60_000;

function resetConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function row(partitionId, index) {
  const replicaId = `${partitionId}-r${index + 1}`;
  return {service_id: replicaId, replica_id: replicaId,
    partition_id: partitionId, node_id: NODE_IDS[index],
    service_type: 'partition', status: 'active', raft_role: 'follower',
    address: `${NODE_IDS[index]}/partition/${replicaId}`};
}

function readyNodes() {
  return NODE_IDS.map((nodeId) => ({node_id: nodeId,
    status: NODE_STATE.ACTIVE, connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + READY_LEASE_MS}));
}

function typed(deliveries, type) {
  return deliveries.filter((delivery) => delivery.payload?.type === type);
}

test('STOPPING: leadership moved onto the source after the decision - no ' +
  'RETIRE through it; one named handoff to the target; the RETIRE follows ' +
  'once the target leads', async (t) => {
  resetConfig();
  const partitionId = 'sql_transactions-p1';
  const source = `${partitionId}-r1`;
  const target = `${partitionId}-r4`;
  // The target leads at the ACTIVE decision (the removal is admitted).
  const witness = createReplaceWitness({leaderReplicaId: target});
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: 'node-d',
    enableTimeouts: false,
    replaceWitness: false,
    messageRouter: {
      deliver: async (to, payload) => {
        deliveries.push({to, payload});
        const answered = witness.deliveryFor(payload);
        return answered ?? buildDeliveryEnvelope({acknowledged: true},
          {status: ReplicaOperationResponseStatus.INITIATED});
      },
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    readinessFixture: {callbacks: createPublishedPlanningReadinessService({
      publicationStatus: 'PUBLISHED', activeNodeIds: NODE_IDS,
      membershipTargetNodeId: 'node-d'})},
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({targetReplicaCount: 3,
        minReplicaCount: 3})}),
    cacheData: {nodes: readyNodes(),
      services: [0, 1, 2, 3].map((index) => row(partitionId, index))},
  });
  coordinator.initialize();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE, partitionId, nodeId: 'node-d',
      sourceNodeId: 'node-a', replicaId: source});
    operation.replicaId = target;
    operation.workflowStep = WORKFLOW_STEP.ACTIVE;
    operation.status = 'active';
    await coordinator.executeOperation(operation);
    t.equal(operation.workflowStep, WORKFLOW_STEP.STOPPING,
      'setup: the intent is durable with the target leading');
    t.equal(typed(deliveries, ReplicaOperationMessageType.REMOVE_REPLICA)
      .length, 1, 'setup: the removal effect left');
    // The source's row retires (RETIRE is admissible) and the source wins
    // leadership back before its RemoveNode was proposed.
    coordinator.systemTableCache.merge('services', source,
      {status: ReplicaStatus.REMOVING});
    witness.leaderReplicaId = source;
    const retiresBefore =
      typed(deliveries, ReplicaOperationMessageType.RETIRE_REPLICA_PEER).length;
    await coordinator.workflowOwner.runReplaceStoppingOwner(operation);
    t.equal(typed(deliveries, ReplicaOperationMessageType.RETIRE_REPLICA_PEER)
      .length, retiresBefore, 'no RETIRE while the source leads');
    const stepDowns =
      typed(deliveries, ReplicaOperationMessageType.STEP_DOWN_REPLICA);
    t.equal(stepDowns.length, 1, 'one named handoff');
    t.equal(stepDowns[0]?.payload[ReplicaOperationField.REPLICA_ID], target,
      'to the REPLACE\'s own target');
    const diagnostic = readReplaceOwnerDiagnostic(coordinator.workflowOwner,
      operation.operationId);
    t.match(JSON.stringify(diagnostic), SOURCE_LEADS_WAIT,
      `the owner waits, named (${JSON.stringify(diagnostic)})`);
    // The transfer lands: the target leads; the RETIRE follows.
    witness.leaderReplicaId = target;
    await coordinator.workflowOwner.runReplaceStoppingOwner(operation);
    t.ok(typed(deliveries, ReplicaOperationMessageType.RETIRE_REPLICA_PEER)
      .length > retiresBefore, 'the RETIRE is proposed once the target leads');
    t.notOk(typed(deliveries, ReplicaOperationMessageType.RETIRE_REPLICA_PEER)
      .some((delivery) => delivery.payload[ReplicaOperationField.REPLICA_ID] ===
        source), 'never through the source');
  } finally {
    await coordinator.shutdown();
    resetConfig();
  }
});

test('a REMOVE\'s deferred-safety re-entry does not re-dispatch its SENDING ' +
  'snapshot once the durable row is at STOPPING', async (t) => {
  resetConfig();
  const partitionId = 'orders-p1';
  const rows = [0, 1, 2, 3].map((index) => row(partitionId, index));
  // The subject leads and no other voter is past its gate: the gate waits
  // (wait_no_transferee) and arms the deferred-safety fallback.
  const group = createLeadershipGroup({partitionId,
    members: rows.map((entry, index) => ({replicaId: entry.replica_id,
      nodeId: entry.node_id, gateOpen: index === 0})),
    leaderReplicaId: `${partitionId}-r1`});
  const timers = [];
  const removals = [];
  const groupRouter = group.router();
  const coordinator = createTestCoordinator({
    nodeId: 'node-b',
    enableTimeouts: false,
    replaceWitness: false,
    setTimeoutFn(fn, delayMs) {
      const handle = {fn, delayMs};
      timers.push(handle);
      return handle;
    },
    clearTimeoutFn() {},
    messageRouter: {
      deliver: async (to, payload) => {
        if (payload?.type === ReplicaOperationMessageType.REMOVE_REPLICA) {
          removals.push(payload);
          return buildDeliveryEnvelope({acknowledged: true},
            {status: ReplicaOperationResponseStatus.INITIATED});
        }
        return groupRouter.deliver(to, payload);
      },
      getConnectionState: () => 'connected',
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({targetReplicaCount: 3,
        minReplicaCount: 3})}),
    cacheData: {nodes: readyNodes(), services: rows},
  });
  coordinator.initialize();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE, partitionId, nodeId: 'node-a',
      replicaId: `${partitionId}-r1`});
    const first = await coordinator.executeOperation(operation);
    t.equal(first?.deferReason, 'remove_safety_blocked',
      `setup: the gate waits (${JSON.stringify(first)})`);
    const snapshotStep = operation.workflowStep;
    t.equal(snapshotStep, WORKFLOW_STEP.SENDING,
      'setup: the deferral holds a SENDING snapshot');
    const retry = timers.find((handle) => typeof handle.fn === 'function');
    t.ok(retry, 'setup: the deferred-safety fallback is armed');
    // Elsewhere the durable row advanced past dispatch (to STOPPING), and
    // the leadership moved: a re-dispatch of the snapshot would now send.
    const durable = {...operation, workflowStep: WORKFLOW_STEP.STOPPING};
    await coordinator.repository.persistOperationUpdate(durable);
    group.elect(`${partitionId}-r2`);
    await retry.fn();
    for (let turn = 0; turn < 10; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    t.equal(removals.length, 0,
      'the older SENDING snapshot is never re-dispatched');
  } finally {
    await coordinator.shutdown();
    resetConfig();
  }
});
