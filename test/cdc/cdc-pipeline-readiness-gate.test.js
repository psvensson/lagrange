/**
 * Unit tests for CDCPipelineReadinessGate.
 * Tests pipeline readiness evaluation and waitForReady polling.
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {CDCPipelineReadinessGate} from
  '../../src/cdc/cdc-pipeline-readiness-gate.js';
import {
  CDC_PIPELINE_READINESS_CONDITION,
} from '../../src/constants/cdc-lifecycle-constants.js';

/**
 * Minimal SystemTableCache stub with onCacheChange/offCacheChange.
 * Calling fire() simulates a cache-change notification.
 */
function createCacheStub() {
  const listeners = new Set();
  return {
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
    fire(tableName, operation, record) {
      for (const l of listeners) {
        l(tableName, operation, record);
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

/**
 * Create a minimal partition service stub.
 * @param {string} tableName
 * @param {number} subscriberCount
 */
function createPartitionStub(tableName, subscriberCount) {
  return {
    tableName,
    cdcSubscribers: {size: subscriberCount},
  };
}

/**
 * Create a minimal message group service stub.
 * @param {boolean} isLeader
 * @param {string|null} leaderId
 */
function createMessageGroupStub(isLeader, leaderId = null) {
  return {
    isLeaderReplica() {
      return isLeader;
    },
    getLeaderId() {
      return leaderId;
    },
  };
}

// --- evaluate() tests ---

test('CDCPipelineReadinessGate — all conditions met returns ready', (t) => {
  const cache = createCacheStub();
  const gate = new CDCPipelineReadinessGate({
    systemTableCache: cache,
    cdcPropagatedTables: ['nodes', 'partitions'],
  });

  // Prove pipeline by firing a cache change
  cache.fire('nodes', 'INSERT', {node_id: 'n1'});

  const partitions = new Map();
  partitions.set('p1', createPartitionStub('nodes', 1));
  partitions.set('p2', createPartitionStub('partitions', 2));

  const messageGroups = new Map();
  messageGroups.set('mg1', createMessageGroupStub(true));

  const result = gate.evaluate({
    partitionServices: partitions,
    messageGroupServices: messageGroups,
  });

  t.equal(result.ready, true);
  t.equal(result.unmetConditions.length, 0);
  t.end();
});

test('CDCPipelineReadinessGate — no conditions met returns all unmet',
  (t) => {
    const cache = createCacheStub();
    const gate = new CDCPipelineReadinessGate({
      systemTableCache: cache,
      cdcPropagatedTables: ['nodes'],
    });

    const result = gate.evaluate({
      partitionServices: new Map(),
      messageGroupServices: new Map(),
    });

    t.equal(result.ready, false);
    t.equal(result.unmetConditions.length, 3);
    t.ok(result.unmetConditions.includes(
      CDC_PIPELINE_READINESS_CONDITION.SUBSCRIPTIONS_ACTIVE,
    ));
    t.ok(result.unmetConditions.includes(
      CDC_PIPELINE_READINESS_CONDITION.PROPAGATION_LEADER,
    ));
    t.ok(result.unmetConditions.includes(
      CDC_PIPELINE_READINESS_CONDITION.PIPELINE_PROVEN,
    ));
    t.end();
  });

test('CDCPipelineReadinessGate — missing subscription for one table',
  (t) => {
    const cache = createCacheStub();
    const gate = new CDCPipelineReadinessGate({
      systemTableCache: cache,
      cdcPropagatedTables: ['nodes', 'partitions'],
    });

    cache.fire('nodes', 'INSERT', {node_id: 'n1'});

    // Only 'nodes' has a subscriber, 'partitions' does not
    const partitions = new Map();
    partitions.set('p1', createPartitionStub('nodes', 1));

    const messageGroups = new Map();
    messageGroups.set('mg1', createMessageGroupStub(true));

    const result = gate.evaluate({
      partitionServices: partitions,
      messageGroupServices: messageGroups,
    });

    t.equal(result.ready, false);
    t.ok(result.unmetConditions.includes(
      CDC_PIPELINE_READINESS_CONDITION.SUBSCRIPTIONS_ACTIVE,
    ));
    t.notOk(result.unmetConditions.includes(
      CDC_PIPELINE_READINESS_CONDITION.PROPAGATION_LEADER,
    ));
    t.notOk(result.unmetConditions.includes(
      CDC_PIPELINE_READINESS_CONDITION.PIPELINE_PROVEN,
    ));
    t.end();
  });

test('CDCPipelineReadinessGate — no message group leader', (t) => {
  const cache = createCacheStub();
  const gate = new CDCPipelineReadinessGate({
    systemTableCache: cache,
    cdcPropagatedTables: ['nodes'],
  });

  cache.fire('nodes', 'INSERT', {node_id: 'n1'});

  const partitions = new Map();
  partitions.set('p1', createPartitionStub('nodes', 1));

  const messageGroups = new Map();
  messageGroups.set('mg1', createMessageGroupStub(false));

  const result = gate.evaluate({
    partitionServices: partitions,
    messageGroupServices: messageGroups,
  });

  t.equal(result.ready, false);
  t.ok(result.unmetConditions.includes(
    CDC_PIPELINE_READINESS_CONDITION.PROPAGATION_LEADER,
  ));
  t.end();
});

test('CDCPipelineReadinessGate — optional propagation leader check can be disabled',
  (t) => {
    const cache = createCacheStub();
    const gate = new CDCPipelineReadinessGate({
      systemTableCache: cache,
      cdcPropagatedTables: ['nodes'],
    });

    cache.fire('nodes', 'INSERT', {node_id: 'n1'});

    const partitions = new Map();
    partitions.set('p1', createPartitionStub('nodes', 1));

    const messageGroups = new Map();
    messageGroups.set('mg1', createMessageGroupStub(false));

    const result = gate.evaluate({
      partitionServices: partitions,
      messageGroupServices: messageGroups,
      requirePropagationLeader: false,
    });

    t.equal(result.ready, true);
    t.notOk(result.unmetConditions.includes(
      CDC_PIPELINE_READINESS_CONDITION.PROPAGATION_LEADER,
    ));
    t.end();
  });

test('CDCPipelineReadinessGate — follower with known leader passes gate',
  (t) => {
    const cache = createCacheStub();
    const gate = new CDCPipelineReadinessGate({
      systemTableCache: cache,
      cdcPropagatedTables: ['nodes'],
    });

    cache.fire('nodes', 'INSERT', {node_id: 'n1'});

    const partitions = new Map();
    partitions.set('p1', createPartitionStub('nodes', 1));

    const messageGroups = new Map();
    messageGroups.set('mg1', createMessageGroupStub(false, 'mg1-r2'));

    const result = gate.evaluate({
      partitionServices: partitions,
      messageGroupServices: messageGroups,
    });

    t.equal(result.ready, true);
    t.notOk(result.unmetConditions.includes(
      CDC_PIPELINE_READINESS_CONDITION.PROPAGATION_LEADER,
    ));
    t.end();
  });

test('CDCPipelineReadinessGate — pipeline not proven without cache event',
  (t) => {
    const cache = createCacheStub();
    const gate = new CDCPipelineReadinessGate({
      systemTableCache: cache,
      cdcPropagatedTables: ['nodes'],
    });

    // Do NOT fire any cache event

    const partitions = new Map();
    partitions.set('p1', createPartitionStub('nodes', 1));

    const messageGroups = new Map();
    messageGroups.set('mg1', createMessageGroupStub(true));

    const result = gate.evaluate({
      partitionServices: partitions,
      messageGroupServices: messageGroups,
    });

    t.equal(result.ready, false);
    t.ok(result.unmetConditions.includes(
      CDC_PIPELINE_READINESS_CONDITION.PIPELINE_PROVEN,
    ));
    t.end();
  });

test('CDCPipelineReadinessGate — one-shot listener unregisters after fire',
  (t) => {
    const cache = createCacheStub();
    const gate = new CDCPipelineReadinessGate({
      systemTableCache: cache,
      cdcPropagatedTables: [],
    });

    t.equal(cache.listenerCount(), 1, 'listener registered');
    cache.fire('nodes', 'INSERT', {node_id: 'n1'});
    t.equal(cache.listenerCount(), 0, 'listener removed after first fire');
    t.equal(gate._pipelineProven, true);
    t.end();
  });

test('CDCPipelineReadinessGate — partition with zero subscribers fails',
  (t) => {
    const cache = createCacheStub();
    const gate = new CDCPipelineReadinessGate({
      systemTableCache: cache,
      cdcPropagatedTables: ['nodes'],
    });

    cache.fire('nodes', 'INSERT', {node_id: 'n1'});

    const partitions = new Map();
    partitions.set('p1', createPartitionStub('nodes', 0));

    const messageGroups = new Map();
    messageGroups.set('mg1', createMessageGroupStub(true));

    const result = gate.evaluate({
      partitionServices: partitions,
      messageGroupServices: messageGroups,
    });

    t.equal(result.ready, false);
    t.ok(result.unmetConditions.includes(
      CDC_PIPELINE_READINESS_CONDITION.SUBSCRIPTIONS_ACTIVE,
    ));
    t.end();
  });

// --- waitForReady() tests ---

test('CDCPipelineReadinessGate — waitForReady resolves when ready',
  async (t) => {
    const cache = createCacheStub();
    const gate = new CDCPipelineReadinessGate({
      systemTableCache: cache,
      cdcPropagatedTables: ['nodes'],
    });

    cache.fire('nodes', 'INSERT', {node_id: 'n1'});

    const partitions = new Map();
    partitions.set('p1', createPartitionStub('nodes', 1));

    const messageGroups = new Map();
    messageGroups.set('mg1', createMessageGroupStub(true));

    const context = {
      partitionServices: partitions,
      messageGroupServices: messageGroups,
    };

    const result = await gate.waitForReady(context, 1000, 10);
    t.equal(result.ready, true);
    t.equal(result.unmetConditions.length, 0);
    t.end();
  });

test('CDCPipelineReadinessGate — waitForReady rejects on timeout',
  async (t) => {
    const cache = createCacheStub();
    const gate = new CDCPipelineReadinessGate({
      systemTableCache: cache,
      cdcPropagatedTables: ['nodes'],
    });

    // No cache fire, no partitions, no message groups — never ready
    const context = {
      partitionServices: new Map(),
      messageGroupServices: new Map(),
    };

    try {
      await gate.waitForReady(context, 50, 10);
      t.fail('should have rejected');
    } catch (err) {
      t.ok(err.message.includes('timeout=50ms'));
      t.ok(Array.isArray(err.unmetConditions));
      t.equal(err.unmetConditions.length, 3);
      t.equal(err.timeoutMs, 50);
    }
    t.end();
  });

test('CDCPipelineReadinessGate — waitForReady polls until conditions met',
  async (t) => {
    const cache = createCacheStub();
    const gate = new CDCPipelineReadinessGate({
      systemTableCache: cache,
      cdcPropagatedTables: ['nodes'],
    });

    const partitions = new Map();
    const messageGroups = new Map();

    const context = {
      partitionServices: partitions,
      messageGroupServices: messageGroups,
    };

    // Start waiting — conditions not yet met
    const promise = gate.waitForReady(context, 1000, 10);

    // Satisfy conditions after a short delay
    setTimeout(() => {
      partitions.set('p1', createPartitionStub('nodes', 1));
      messageGroups.set('mg1', createMessageGroupStub(true));
      cache.fire('nodes', 'INSERT', {node_id: 'n1'});
    }, 30);

    const result = await promise;
    t.equal(result.ready, true);
    t.end();
  });

test('CDCPipelineReadinessGate — timeout error includes unmet conditions',
  async (t) => {
    const cache = createCacheStub();
    const gate = new CDCPipelineReadinessGate({
      systemTableCache: cache,
      cdcPropagatedTables: ['nodes'],
    });

    // Only satisfy the leader condition
    const partitions = new Map();
    const messageGroups = new Map();
    messageGroups.set('mg1', createMessageGroupStub(true));

    const context = {
      partitionServices: partitions,
      messageGroupServices: messageGroups,
    };

    try {
      await gate.waitForReady(context, 50, 10);
      t.fail('should have rejected');
    } catch (err) {
      // Should include subscriptionsActive and pipelineProven but not
      // propagationLeader
      t.ok(err.unmetConditions.includes(
        CDC_PIPELINE_READINESS_CONDITION.SUBSCRIPTIONS_ACTIVE,
      ));
      t.ok(err.unmetConditions.includes(
        CDC_PIPELINE_READINESS_CONDITION.PIPELINE_PROVEN,
      ));
      t.notOk(err.unmetConditions.includes(
        CDC_PIPELINE_READINESS_CONDITION.PROPAGATION_LEADER,
      ));
    }
    t.end();
  });

test('CDCPipelineReadinessGate — empty propagated tables list', (t) => {
  const cache = createCacheStub();
  const gate = new CDCPipelineReadinessGate({
    systemTableCache: cache,
    cdcPropagatedTables: [],
  });

  cache.fire('nodes', 'INSERT', {node_id: 'n1'});

  const messageGroups = new Map();
  messageGroups.set('mg1', createMessageGroupStub(true));

  const result = gate.evaluate({
    partitionServices: new Map(),
    messageGroupServices: messageGroups,
  });

  // With empty propagated tables, subscriptions check passes vacuously
  t.equal(result.ready, true);
  t.end();
});
