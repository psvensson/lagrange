import {test} from '../../src/test-helpers/tap.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createMockCoordinator,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';
import {initializeTestEnvironment} from './unified-rebalancer-test-support.js';

function readyNode(nodeId) {
  return {node_id: nodeId, status: 'active', connection_state: 'ready',
    ready_lease_expires_at: Date.now() + 60000};
}

function receiverSensitivePort(t) {
  const listeners = new Set();
  const token = {};
  let getterCalls = 0;
  const port = Object.freeze({
    token,
    get unusedGetter() {
      getterCalls++;
      return token;
    },
    getNodeReadinessSync(nodeId) {
      t.equal(this.token, token, 'readiness keeps the original receiver');
      return {nodeId, dimensions: {repairEligible: true}};
    },
    answerCommittedNodes() {
      t.equal(this.token, token, 'committed reader keeps the original receiver');
      return {state: 'unavailable', nodeRows: []};
    },
    subscribe(listener) {
      t.equal(this.token, token, 'subscription keeps the original receiver');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return {port, getterCalls: () => getterCalls,
    emit: (value) => {
      for (const listener of listeners) listener(value);
    }};
}

test('fixture helpers preserve frozen caller-owned port custody', async (t) => {
  initializeTestEnvironment();
  const {port, emit, getterCalls} = receiverSensitivePort(t);
  const descriptors = Object.getOwnPropertyDescriptors(port);
  const cache = createMockCache({nodes: [readyNode('node-1')]});
  const coordinator = createTestCoordinator({systemTableCache: cache,
    controlPlaneReadinessService: port});
  t.teardown(() => coordinator.shutdown());
  const rebalancer = createTestRebalancer({systemTableCache: cache,
    rebalanceCoordinator: coordinator, controlPlaneReadinessService: port});
  t.teardown(() => rebalancer.shutdown());
  t.equal(coordinator.controlPlaneReadinessService, port, 'coordinator identity');
  t.equal(rebalancer.controlPlaneReadinessService, port, 'rebalancer identity');
  t.same(Object.getOwnPropertyDescriptors(port), descriptors, 'no descriptor writes');
  t.equal(getterCalls(), 0, 'no materialization of caller getters');
  t.equal(port.getNodeReadinessSync('node-1').nodeId, 'node-1');
  t.equal(rebalancer.controlPlaneReadinessService.answerCommittedNodes().state,
    'unavailable', 'healthy cache cannot replace the owner refusal');
  const received = [];
  const unsubscribe = rebalancer.controlPlaneReadinessService.subscribe(
    (value) => received.push(value));
  emit('first');
  unsubscribe();
  emit('second');
  t.same(received, ['first'], 'original callback delivery and unsubscribe survive');
});

test('missing committed reader stays missing in a healthy fixture world', (t) => {
  initializeTestEnvironment();
  const port = Object.freeze({getNodeReadinessSync: () => ({
    dimensions: {repairEligible: true, serveEligible: true}})});
  const rebalancer = createTestRebalancer({entityId: 'replica_operations-p1',
    cacheData: {nodes: [readyNode('node-1')]}, controlPlaneReadinessService: port});
  t.teardown(() => rebalancer.shutdown());
  t.equal(rebalancer.controlPlaneReadinessService, port);
  t.equal(Object.hasOwn(port, 'answerCommittedNodes'), false);
  // Stream shape (code-navigability readiness injection): the readiness
  // service is a required collaborator whose members are called, never
  // probed, so a caller-owned port without the committed reader is a
  // malformed collaborator that refuses at the read; the fixture never
  // fabricates the reader from the healthy cache.
  t.throws(() => rebalancer.getCriticalSystemTopologySettlingBlocker(),
    TypeError, 'a missing committed reader is never fabricated');
  t.end();
});

test('helper-owned port reads its live world without borrowing another cache', async (t) => {
  initializeTestEnvironment();
  const cache = createMockCache({nodes: [readyNode('first')]});
  const otherCache = createMockCache({nodes: [readyNode('other')]});
  const port = createMockControlPlaneReadinessService({systemTableCache: cache});
  const other = createMockControlPlaneReadinessService({systemTableCache: otherCache});
  const helper = createTestRebalancer({systemTableCache: cache});
  t.teardown(() => helper.shutdown());
  t.equal(helper.controlPlaneReadinessService,
    helper.rebalanceCoordinator.controlPlaneReadinessService,
    'helper constructs one shared owner for coordinator and rebalancer');
  t.equal(port.getNodeReadinessSync('first').dimensions.repairEligible, true);
  cache.upsert('nodes', {...readyNode('first'), ready_lease_expires_at: 0});
  t.equal(port.answerCommittedNodes().nodeRows[0].ready_lease_expires_at, 0);
  t.equal(port.getNodeReadinessSync('first').dimensions.repairEligible, false);
  t.equal(await port.getPriorityRecoveryPlanningSnapshotBestEffort(), null,
    'nodes alone do not fabricate a successful publication');
  cache.delete('nodes', 'first');
  t.same(port.answerCommittedNodes().nodeRows, [], 'empty world remains empty');
  t.same(other.answerCommittedNodes().nodeRows.map((row) => row.node_id), ['other']);
});

test('a supplied coordinator keeps its own selected readiness owner', (t) => {
  initializeTestEnvironment();
  const originalOwner = Object.freeze(createMockControlPlaneReadinessService({
    readNodeRows: () => [readyNode('coordinator-owned')],
  }));
  const coordinator = createMockCoordinator({controlPlaneReadinessService: originalOwner});
  const supplied = Object.freeze({answerCommittedNodes: () => ({state: 'unavailable'})});
  const rebalancer = createTestRebalancer({rebalanceCoordinator: coordinator,
    controlPlaneReadinessService: supplied});
  t.teardown(() => rebalancer.shutdown());
  t.equal(coordinator.controlPlaneReadinessService, originalOwner,
    'helper does not overwrite a caller-selected coordinator dependency');
  t.equal(rebalancer.controlPlaneReadinessService, originalOwner,
    'the production binding selects the coordinator owner for the shared interaction');
  t.equal(createMockCoordinator().controlPlaneReadinessService, null,
    'an undeclared coordinator dependency creates no alternate empty-world owner');
  t.end();
});

test('coordinator-only selection preserves a frozen owner without adaptation', (t) => {
  initializeTestEnvironment();
  const {port, getterCalls} = receiverSensitivePort(t);
  const coordinator = Object.freeze({controlPlaneReadinessService: port});
  const descriptors = Object.getOwnPropertyDescriptors(coordinator);
  const rebalancer = createTestRebalancer({rebalanceCoordinator: coordinator});
  t.teardown(() => rebalancer.shutdown());
  t.equal(rebalancer.controlPlaneReadinessService, port);
  t.same(Object.getOwnPropertyDescriptors(coordinator), descriptors);
  t.equal(getterCalls(), 0);
  t.end();
});

test('committed denial survives positive fixture projections and planning', (t) => {
  initializeTestEnvironment();
  const cache = createMockCache({nodes: [readyNode('node-1')]});
  for (const answer of [
    {state: 'unavailable', nodeRows: cache.getAll('nodes')},
    {state: 'ready', nodeRows: []},
  ]) {
    const port = createMockControlPlaneReadinessService({systemTableCache: cache,
      membershipPublicationPlanningSnapshot: {priorityPartitionSummary: {satisfied: true}},
      callbacks: {
        answerCommittedNodes: () => answer,
        projectNodeLiveness: () => ({readyNow: true}),
      }});
    const rebalancer = createTestRebalancer({entityId: 'replica_operations-p1',
      systemTableCache: cache, controlPlaneReadinessService: port});
    t.teardown(() => rebalancer.shutdown());
    t.equal(rebalancer.getCriticalSystemTopologySettlingBlocker().reason, 'unavailable');
  }
  const expired = createMockControlPlaneReadinessService({systemTableCache: cache,
    callbacks: {projectNodeLiveness: () => ({readyNow: true})}});
  cache.upsert('nodes', {...readyNode('node-1'), ready_lease_expires_at: 0});
  const rebalancer = createTestRebalancer({entityId: 'replica_operations-p1',
    systemTableCache: cache, controlPlaneReadinessService: expired});
  t.teardown(() => rebalancer.shutdown());
  t.equal(rebalancer.getCriticalSystemTopologySettlingBlocker().reason,
    'node_ready_lease_incomplete', 'positive projection cannot replace an expired committed lease');
  t.end();
});

test('explicit live callbacks preserve readiness and planning arguments', async (t) => {
  let world = {phase: 'blocked'};
  const calls = [];
  const port = createMockControlPlaneReadinessService({
    membershipPublicationPlanningSnapshot(nodeId, observedAt) {
      calls.push([nodeId, observedAt]);
      return world;
    },
    callbacks: {getNodeReadinessSync(nodeId, options) {
      t.equal(this, port, 'async forwarding retains the constructed port receiver');
      calls.push([nodeId, options]);
      return world;
    }},
  });
  const options = {decisionDimension: 'repairEligible', refresh: false};
  t.equal(await port.getNodeReadiness('node-1', options), world);
  t.equal(await port.getPriorityRecoveryPlanningSnapshotBestEffort('node-1', 123), world);
  world = {phase: 'recovered'};
  t.equal(await port.getPriorityRecoveryPlanningSnapshotBestEffort('node-2', 456), world);
  t.equal(calls[0][1], options, 'options pass through by identity');
  t.same(calls.slice(1), [['node-1', 123], ['node-2', 456]]);
  t.equal(createMockControlPlaneReadinessService().getNodeReadinessSync('absent')
    .dimensions.repairEligible, false, 'missing nodes are not implicitly approved');
});

test('constructed coordinator forwards the declared operation reader without adaptation', async (t) => {
  const options = {visibilityReadMode: 'owner_rpc_required'};
  const rows = [{operationId: 'op-reader'}];
  const calls = [];
  const coordinator = createMockCoordinator({readOperationsByEntity(...args) {
    calls.push(args);
    return rows;
  }});
  t.equal(await coordinator.getOperationsByEntity('partition', 'p1', options), rows);
  t.same(calls[0].slice(0, 2), ['partition', 'p1']);
  t.equal(calls[0][2], options, 'required-read options retain their identity');
  t.same(await createMockCoordinator().getOperationsByEntity('partition', 'p1', options), [],
    'the default explicitly models an empty ledger');
});
