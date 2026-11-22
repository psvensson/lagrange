// Witness: the workflow owner's REPLACE target binding asks the canonical
// replica-id allocator, whose used-id set is decided on the services-p1
// owner fact. While that fact is UNAVAILABLE the allocator throws its typed
// deferral (services_inventory_unavailable, deferRetry). The dispatch turn
// that bound the target must then fail nothing and allocate nothing, and the
// workflow owner's own per-operation retry must bring the dispatch back: once
// the fact is READY that retry binds the target exactly once and delivers
// the CREATE. Nothing else (no event, no call) re-drives the operation.
//
// Production on the subject path: RebalanceCoordinator (the shared test
// composer), its operation workflow owner (dispatchOperation, the owner-action
// lane and its catch, the transition retry and its resume, the dispatch lane,
// executeOperationInternal, resolveDispatchTargetBinding), the allocator,
// readEntityServiceOwnerFact and readOwnerFact. The SERVICES read answers as
// the services-p1 leader answers (or fails) at the gateway port.
// Substituted, not the subject (as in coordinator-created-operation-admission
// .test.js): ownership and phase predicates, the binding's durable write, the
// remove-safety evaluation, the physical delivery and its response handling;
// on the dispatch lane the storage-reservation gate (disengaged) and the
// dispatch-wake progress preemption. The retry timer is captured and fired by
// the case (no real time passes).
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {REBALANCER_SKIP_REASON} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaOperationResponseStatus} from
  '../../src/rebalancer/replica-operation-constants.js';
import {buildOperationUpdateOutcome} from
  '../../src/rebalancer/replica-operation-update-outcome.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from
  '../../src/rebalancer/replica-operation-update-disposition.js';
import {OPERATION_RECONCILE_OUTCOME} from
  '../../src/rebalancer/operation-workflow-reconcile-outcome.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {buildMockPolicyAuthorityWitness, createTestCoordinator} from './test-helpers.js';

const LOCAL_NODE_ID = 'node-local';
const SOURCE_NODE_ID = 'node-source';
const PARTITION_ID = 'sql_transactions-p1';
const SOURCE_REPLICA_ID = `${PARTITION_ID}-r1`;
// The owner's rows name r1..r3; r1 is the source: the next canonical id is r4.
const OWNER_REPLICA_NODES = Object.freeze([SOURCE_NODE_ID, 'node-b', 'node-c']);
const EXPECTED_TARGET_REPLICA_ID = `${PARTITION_ID}-r4`;
const OPERATION_ID = 'replace-target-binding-owner-fact-retry';
const OWNER_UNREACHABLE = 'services-p1 leader unreachable (witness)';
const INVENTORY_UNAVAILABLE = 'services_inventory_unavailable';
const OPERATION_AGE_MS = 1000;

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({node: {id: LOCAL_NODE_ID}, logging: {level: 'error'}});
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) logging.initialize({level: 'error'});
}

function ownerServiceRows() {
  return OWNER_REPLICA_NODES.map((nodeId, index) => {
    const replicaId = `${PARTITION_ID}-r${index + 1}`;
    return {service_id: replicaId, replica_id: replicaId, service_type: 'partition',
      partition_id: PARTITION_ID, node_id: nodeId, status: ReplicaStatus.ACTIVE,
      raft_role: index === 0 ? 'leader' : 'follower',
      address: `${nodeId}/partition/${replicaId}`};
  });
}

// The services-p1 leader's answer to the SERVICES read, or its failure.
function servicesAnswer(available) {
  return available ?
    {success: true, rowSetComplete: true, rows: ownerServiceRows(),
      readAuthorityWitness: buildMockPolicyAuthorityWitness('services-p1')} :
    {success: false, rows: [], error: OWNER_UNREACHABLE};
}

// A REPLACE whose CREATE target is not yet bound: its replica id is still
// the source's, on the durable SENDING step.
function unboundReplace() {
  const now = Date.now();
  return {
    operationId: OPERATION_ID, type: OperationType.REPLACE, partitionId: PARTITION_ID,
    replicaId: SOURCE_REPLICA_ID, sourceReplicaId: SOURCE_REPLICA_ID,
    sourceNodeId: SOURCE_NODE_ID, targetNodeId: LOCAL_NODE_ID,
    status: ReplicaStatus.PENDING, workflowStep: WORKFLOW_STEP.SENDING,
    createdAt: now - OPERATION_AGE_MS, updatedAt: now - OPERATION_AGE_MS,
    completedAt: null, entityType: 'partition', entityId: PARTITION_ID,
    stepsHistory: [], createAdmissionState: null,
  };
}

async function settle(run) {
  try {
    return {value: await run(), error: null};
  } catch (error) {
    return {value: null, error};
  }
}

function openWitness(t) {
  const world = {servicesAvailable: false, servicesReads: 0, timers: [], allocations: [],
    persisted: [], deliveries: [], failures: [], durable: unboundReplace()};
  const coordinator = createTestCoordinator({
    nodeId: LOCAL_NODE_ID,
    setTimeoutFn: (fn, delayMs) => {
      const handle = {fn, delayMs};
      world.timers.push(handle);
      return handle;
    },
    clearTimeoutFn: () => {},
    controlPlaneSystemTableGatewayFactory: (gateway) => ({...gateway,
      async readAuthoritativeRows(tableName, sql, params, readOptions) {
        if (tableName !== SYSTEM_TABLE_NAME.SERVICES) {
          return gateway.readAuthoritativeRows(tableName, sql, params, readOptions);
        }
        world.servicesReads += 1;
        return servicesAnswer(world.servicesAvailable);
      }}),
  });
  t.teardown(() => coordinator.shutdown());
  const allocate = coordinator.allocateCanonicalReplicaId.bind(coordinator);
  coordinator.allocateCanonicalReplicaId = async (params) => {
    const outcome = await settle(() => allocate(params));
    world.allocations.push(outcome.error === null ? {replicaId: outcome.value} :
      {rebalanceSkipReason: outcome.error.rebalanceSkipReason ?? null,
        reasonCode: outcome.error.reasonCode ?? null,
        deferRetry: outcome.error.deferRetry === true});
    if (outcome.error !== null) throw outcome.error;
    return outcome.value;
  };
  const owner = coordinator.workflowOwner;
  owner.repository.isOperationLocallyOwned = () => true;
  owner.repository.isReplaceRemoveDispatchPhase = () => false;
  owner.repository.getReplaceSourceReplicaId = () => SOURCE_REPLICA_ID;
  owner.repository.getOperationByIdVisibilityObservation = async () => ({
    operation: structuredClone(world.durable), deferredOutcome: null});
  owner.repository.persistOperationUpdate = async (operation, options) => {
    world.persisted.push({replicaId: operation.replicaId,
      expectedWorkflowStep: options?.expectedWorkflowStep ?? null});
    world.durable = structuredClone(operation);
    return buildOperationUpdateOutcome({persisted: true, operation,
      disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED});
  };
  owner.isCreateRearmDispatchPhase = () => false;
  owner.isPriorityRecoverySupersededTargetFailureApplicable = () => false;
  owner.buildOperationTransitionPersistOptions = () => ({});
  owner.updateStep = async () => OPERATION_RECONCILE_OUTCOME.WAITING;
  owner.evaluateRemoveSafety = async () => null;
  owner.clearDeferredSafetyBlockState = () => {};
  owner.hasStorageReservationSupport = () => false;
  owner.shouldPreemptCreateRearmWithObservedProgress = () => false;
  owner.failOperation = async (operation, error) => {
    world.failures.push({operationId: operation?.operationId,
      error: error?.message ?? String(error)});
    throw new Error('the witness fails no operation');
  };
  owner.deliverReplicaOperationRequest = async (operation, target, request) => {
    world.deliveries.push({target, replicaId: request.replicaId});
    return buildDeliveryEnvelope({acknowledged: true},
      {status: ReplicaOperationResponseStatus.INITIATED});
  };
  owner.retainDeliveredCreateProgress = () => {};
  owner._handleDispatchResponse = async (operation) => ({success: true,
    operationId: operation.operationId});
  return {coordinator, owner, world};
}

// The operation's own retry timer: the owner keeps one per operation, in its
// transition-retry or its dispatch-retry registry.
function retryTimerOf(owner) {
  const transition = owner.transitionRetryTimerByOperationId.get(OPERATION_ID);
  const dispatch = owner.dispatchRetryTimerByOperationId.get(OPERATION_ID);
  return transition ? {kind: 'transition', handle: transition} :
    dispatch ? {kind: 'dispatch', handle: dispatch} : null;
}

const boundIds = (world) => world.allocations.filter((entry) => entry.replicaId)
  .map((entry) => entry.replicaId);
const bindings = (world) => world.persisted.filter((entry) =>
  entry.replicaId !== SOURCE_REPLICA_ID);

test('REPLACE target binding: an UNAVAILABLE SERVICES owner fact fails nothing and ' +
  'allocates nothing; the workflow owner\'s per-operation retry binds the target ' +
  'exactly once when the fact is READY', async (t) => {
  initializeEnvironment();
  const {owner, world} = openWitness(t);

  const first = await settle(() => owner.dispatchOperation(structuredClone(world.durable)));
  const retryTimer = retryTimerOf(owner);
  const afterFirst = {result: first.value, error: first.error?.message ?? null,
    allocations: [...world.allocations], servicesReads: world.servicesReads,
    retry: retryTimer && {kind: retryTimer.kind, delayMs: retryTimer.handle.delayMs},
    timers: world.timers.map(({delayMs}) => delayMs), persisted: [...world.persisted],
    deliveries: [...world.deliveries], failures: [...world.failures]};
  t.comment(`OBSERVATION first-turn ${JSON.stringify(afterFirst)}`);

  t.equal(first.error, null, 'the dispatch turn does not throw out of the owner');
  t.equal(first.value?.skipped, true, 'the turn is a skip');
  t.equal(first.value?.reason, REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
    'the skip is a deferred retry');
  t.ok(world.servicesReads > 0, 'the allocator asked the SERVICES owner');
  t.same(world.allocations.map(({rebalanceSkipReason, deferRetry}) =>
    ({rebalanceSkipReason, deferRetry})),
  [{rebalanceSkipReason: INVENTORY_UNAVAILABLE, deferRetry: true}],
  'the allocator refused with its typed deferral');
  t.same(boundIds(world), [], 'no replica id is allocated');
  t.same(bindings(world), [], 'no target binding is written');
  t.same(world.deliveries, [], 'no CREATE is delivered');
  t.same(world.failures, [], 'the operation is not failed');
  t.equal(world.durable.replicaId, SOURCE_REPLICA_ID, 'the durable row is unchanged');
  t.ok(retryTimer !== null, 'the workflow owner armed its per-operation retry');

  // The owner answers again; nothing tells the workflow owner.
  world.servicesAvailable = true;
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  t.same(bindings(world), [], 'the owner\'s answer alone re-drives nothing');

  await retryTimer?.handle.fn();
  const afterRetry = {allocations: world.allocations, persisted: world.persisted,
    deliveries: world.deliveries, failures: world.failures,
    timers: world.timers.map(({delayMs}) => delayMs), durable: world.durable.replicaId};
  t.comment(`OBSERVATION retry-turn ${JSON.stringify(afterRetry)}`);

  t.same(boundIds(world), [EXPECTED_TARGET_REPLICA_ID],
    'the retry allocates exactly one replica id, from the owner\'s rows');
  t.same(bindings(world).map(({replicaId}) => replicaId), [EXPECTED_TARGET_REPLICA_ID],
    'exactly one target binding is written');
  t.equal(bindings(world)[0]?.expectedWorkflowStep, WORKFLOW_STEP.SENDING,
    'the binding is fenced on the durable SENDING step');
  t.same(world.deliveries.map(({replicaId}) => replicaId), [EXPECTED_TARGET_REPLICA_ID],
    'the CREATE carries the bound target, once');
  t.same(world.failures, [], 'the operation is never failed');
});
