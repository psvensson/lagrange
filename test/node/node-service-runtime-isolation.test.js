// Can two production node runtimes coexist in one process without sharing
// node-local semantic state?
//
// The simulator hosts five virtual nodes in one JS process. If they collapse
// onto one NodeService they share node identity, the service and message-group
// registries, the lifecycle state machine and the node-local system-table
// cache - which would silently re-create the very concentration and identity
// confusion the formation work is trying to measure.
//
// A1d-0 asks only about the OBJECT: is NodeService's own state already
// instance-isolated? A1d-1 asks about the collaborator it resolves for itself.
// Neither uses getInstance(), and no singleton is reset to make coexistence
// work: a reset would answer a different question.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {NodeService} from '../../src/node/node-service.js';
import {TABLES} from '../../src/constants/index.js';

const CDC_UPSERT = 'UPSERT';
const A_NODE_ID = 'node-A';
const B_NODE_ID = 'node-B';
const A_ADDRESS = 'virtual://node-A';
const B_ADDRESS = 'virtual://node-B';

function deterministicStatsSource(loadValue) {
  return {
    cpus: () => [{model: 'virtual', speed: 1000,
      times: {user: loadValue, nice: 0, sys: 0, idle: 1000, irq: 0}}],
    totalmem: () => 1024 * 1024 * 1024,
    freemem: () => 512 * 1024 * 1024,
    loadavg: () => [loadValue, loadValue, loadValue],
    uptime: () => 1000,
    platform: () => 'linux',
    arch: () => 'x64',
    hostname: () => 'virtual-host',
  };
}

// Two runtimes, constructed directly. `new NodeService()` rather than
// getInstance() is the whole point: this measures the object, not the lookup.
// A minimal stand-in for the node's thread manager: the contract exercised
// here is getPoolStats(), which is what reaches node stats.
function isolatedThreadManager() {
  return {
    pool: null,
    services: new Map(),
    isInitialized: () => true,
    initialize() {},
    getPoolStats() {
      if (!this.pool) return {completed: 0, threads: 0};
      return {completed: this.pool.completed || 0,
        threads: this.pool.threads?.length || 0};
    },
    shutdown() {},
  };
}

function runtimePair() {
  const a = new NodeService({threadManager: isolatedThreadManager()});
  const b = new NodeService({threadManager: isolatedThreadManager()});
  a.initialize({
    nodeId: A_NODE_ID, nodeAddress: A_ADDRESS,
    now: () => 1000, nodeStatsSource: deterministicStatsSource(1),
  });
  b.initialize({
    nodeId: B_NODE_ID, nodeAddress: B_ADDRESS,
    now: () => 2000, nodeStatsSource: deterministicStatsSource(2),
  });
  return {a, b};
}

test('A1d-0. two node runtimes keep distinct identity and node-local state',
  () => {
    const {a, b} = runtimePair();
    assert.equal(a.getNodeId(), A_NODE_ID);
    assert.equal(b.getNodeId(), B_NODE_ID);
    assert.equal(a.getNodeAddress(), A_ADDRESS);
    assert.equal(b.getNodeAddress(), B_ADDRESS);
    assert.notEqual(a.lifecycleStateMachine, b.lifecycleStateMachine,
      'each runtime owns its own lifecycle state machine');
    assert.notEqual(a.services, b.services,
      'and its own service registry');
    assert.notEqual(a.messageGroupServices, b.messageGroupServices,
      'and its own message-group registry');
    assert.notEqual(a.getSystemTableCache(), b.getSystemTableCache(),
      'and its own node-local system-table cache');
  });

test('A1d-0. mutating one runtime is not observable in the other', () => {
  const {a, b} = runtimePair();
  // Node-local cache, through the ordinary owner API.
  a.getSystemTableCache().applySystemTableChange(TABLES.NODES, CDC_UPSERT,
    {node_id: 'only-in-a', status: 'active'});
  assert.equal(a.getSystemTableCache().has(TABLES.NODES, 'only-in-a'), true);
  assert.equal(b.getSystemTableCache().has(TABLES.NODES, 'only-in-a'), false,
    'a cache mutation in A is not visible in B');

  // Node-local registries.
  a.services.set('svc-a', {id: 'svc-a'});
  a.messageGroupServices.set('mg-a', {id: 'mg-a'});
  assert.equal(b.services.has('svc-a'), false,
    'a service registered on A is not registered on B');
  assert.equal(b.messageGroupServices.has('mg-a'), false,
    'nor is a message group');

  // Node-local lifecycle.
  const aState = a.lifecycleStateMachine.getState();
  const bStateBefore = b.lifecycleStateMachine.getState();
  assert.equal(typeof aState, 'string');
  assert.equal(b.lifecycleStateMachine.getState(), bStateBefore,
    'and a lifecycle read on A leaves B where it was');
});

test('A1d-1. each runtime\'s thread manager is its own, and node stats say so',
  async () => {
    // Not an aesthetic identity check. getNodeStats() reports
    // this.threadManager.getPoolStats() as threadPool, and production
    // heartbeat and control-plane paths consume that as node-local evidence,
    // so a shared manager makes one node report the other's work.
    const {a, b} = runtimePair();
    assert.notEqual(a.threadManager, b.threadManager,
      'construction sanity check: distinct managers were supplied');

    // Distinctive pool state on A only.
    a.threadManager.pool = {threads: [{}, {}, {}], completed: 41};
    const aStats = await a.getNodeStats();
    const bStats = await b.getNodeStats();
    assert.equal(aStats.threadPool?.completed, 41,
      'A reports its own pool state');
    assert.equal(bStats.threadPool?.completed, 0,
      'and B reports its own empty pool, not A\'s work');
  });

test('MUTATION: one shared thread manager makes B report A\'s pool', async () => {
  // The revert: both runtimes resolve the same manager, as they did before
  // NodeService took an explicit dependency.
  const shared = isolatedThreadManager();
  const a = new NodeService({threadManager: shared});
  const b = new NodeService({threadManager: shared});
  a.initialize({nodeId: A_NODE_ID, nodeAddress: A_ADDRESS, now: () => 1000,
    nodeStatsSource: deterministicStatsSource(1)});
  b.initialize({nodeId: B_NODE_ID, nodeAddress: B_ADDRESS, now: () => 2000,
    nodeStatsSource: deterministicStatsSource(2)});
  shared.pool = {threads: [{}], completed: 41};
  const bStats = await b.getNodeStats();
  assert.equal(bStats.threadPool?.completed, 41,
    'sharing the manager is exactly what leaks node-local evidence, which ' +
    'is why the witness above is a semantic contract and not a style rule');
});

test('A1 closure: five node runtimes coexist with no state crossing', () => {
  // The five hosted nodes of the formation scenario, constructed together and
  // never reset. Identity, lifecycle, caches and both node-local registries
  // must stay apart, and one mutation per category on node-0 must leave
  // nodes 1 to 4 exactly as they were.
  const runtimes = [0, 1, 2, 3, 4].map((index) => {
    const nodeService = new NodeService({threadManager: isolatedThreadManager()});
    nodeService.initialize({
      nodeId: `node-${index}`,
      nodeAddress: `virtual://node-${index}`,
      now: () => 1000 + index,
      nodeStatsSource: deterministicStatsSource(index),
    });
    return nodeService;
  });
  const distinct = (values) => new Set(values).size === values.length;

  assert.ok(distinct(runtimes.map((r) => r.getNodeId())), 'five identities');
  assert.ok(distinct(runtimes.map((r) => r.getNodeAddress())), 'five addresses');
  assert.ok(distinct(runtimes.map((r) => r.lifecycleStateMachine)),
    'five lifecycle machines');
  assert.ok(distinct(runtimes.map((r) => r.getSystemTableCache())),
    'five node-local caches');
  assert.ok(distinct(runtimes.map((r) => r.services)), 'five service registries');
  assert.ok(distinct(runtimes.map((r) => r.messageGroupServices)),
    'five message-group registries');
  assert.ok(distinct(runtimes.map((r) => r.threadManager)),
    'five thread managers');

  // One mutation per node-local category, all on node-0.
  const [seed, ...joiners] = runtimes;
  seed.getSystemTableCache().applySystemTableChange(TABLES.NODES, CDC_UPSERT,
    {node_id: 'seed-only', status: 'active'});
  seed.services.set('seed-service', {id: 'seed-service'});
  seed.messageGroupServices.set('seed-group', {id: 'seed-group'});
  seed.threadManager.pool = {threads: [{}], completed: 7};

  for (const joiner of joiners) {
    assert.equal(joiner.getSystemTableCache().has(TABLES.NODES, 'seed-only'),
      false, `${joiner.getNodeId()} does not see the seed's cache row`);
    assert.equal(joiner.services.has('seed-service'), false,
      `${joiner.getNodeId()} does not see the seed's service`);
    assert.equal(joiner.messageGroupServices.has('seed-group'), false,
      `${joiner.getNodeId()} does not see the seed's message group`);
    assert.equal(joiner.threadManager.pool, null,
      `${joiner.getNodeId()} does not see the seed's thread pool`);
  }
});
