// Witness tests for Quest Q14: cdc-recipient-domain-and-retained-debt
// Proves that LatencyTreeService routing order maps to actual message-group
// recipients, does not introduce latency-domain IDs as targets, surfaces typed
// unavailability for missing mappings while retaining source debt, and recovers
// previously captured invalid bindings via owner-validated transfer without
// fabricating receipts or dropping obligations.

import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';

import {COLUMN, SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  CDC_COMPLETION,
} from '../../src/cdc/cdc-delivery-outcome.js';
import {
  createCdcPropagationProgress,
  refreshCdcPropagationRoutes,
} from '../../src/cdc/cdc-propagation-progress.js';
import {
  LATENCY_GROUP_STATE,
  LATENCY_PROPAGATION_MODE,
} from '../../src/topology/latency-topology-constants.js';
import {
  CDC_GROUP_PROPAGATION_STATUS,
  CDC_GROUP_PROPAGATION_STRATEGY,
} from '../../src/topology/cdc-group-propagation-constants.js';
import {LatencyTreeService} from '../../src/topology/latency-tree-service.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {
  committedTargetAnswer,
  createDurableCdcEvent,
  propagateToEveryRecipient,
  createDurableSourceMessageGroupService,
  createTopologyCache,
  putTopologyRow,
  setupConfig,
  teardownConfig,
} from './cdc-group-propagation-service-harness.js';

afterEach(teardownConfig);

const SOURCE_LG = 'lg-source';
const NEAR_LG = 'lg-near';
const FAR_LG = 'lg-far';

const SOURCE_MG = 'mg-source';
const NEAR_MG = 'mg-near';
const FAR_MG = 'mg-far';

// The node's real system-table cache over both domains (latency groups and
// message groups); each inter-group latency row carries its declared key.
function createDualDomainTopologyCache({
  nodes = [],
  latencyGroups = [],
  messageGroups = [],
  services = [],
  latencies = [],
} = {}) {
  return createTopologyCache({nodes, groups: latencyGroups, messageGroups, services,
    latencies: latencies.map((row) => ({...row, [COLUMN.LATENCY_EDGE_ID]:
      `${row[COLUMN.SOURCE_GROUP_ID]}->${row[COLUMN.TARGET_GROUP_ID]}`}))});
}

function buildStandardDualDomainFixture(t, mode = LATENCY_PROPAGATION_MODE.SAFE, options = {}) {
  setupConfig(mode);
  const cache = createDualDomainTopologyCache({
    nodes: [
      {[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: SOURCE_LG},
      {[COLUMN.NODE_ID]: 'node-b', [COLUMN.LATENCY_GROUP_ID]: NEAR_LG},
      {[COLUMN.NODE_ID]: 'node-c', [COLUMN.LATENCY_GROUP_ID]: FAR_LG},
    ],
    latencyGroups: [
      {[COLUMN.GROUP_ID]: SOURCE_LG, [COLUMN.COORDINATOR_NODE_ID]: 'node-a', [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE},
      {[COLUMN.GROUP_ID]: NEAR_LG, [COLUMN.COORDINATOR_NODE_ID]: 'node-b', [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE},
      {[COLUMN.GROUP_ID]: FAR_LG, [COLUMN.COORDINATOR_NODE_ID]: 'node-c', [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE},
    ],
    messageGroups: [
      {[COLUMN.GROUP_ID]: SOURCE_MG, leader_node_id: 'node-a'},
      {[COLUMN.GROUP_ID]: NEAR_MG, leader_node_id: 'node-b'},
      {[COLUMN.GROUP_ID]: FAR_MG, leader_node_id: 'node-c'},
    ],
    services: [
      {
        [COLUMN.SERVICE_ID]: `${SOURCE_MG}-r1`,
        [COLUMN.GROUP_ID]: SOURCE_MG,
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: 'node-a/mg-source',
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      },
      {
        [COLUMN.SERVICE_ID]: `${NEAR_MG}-r1`,
        [COLUMN.GROUP_ID]: NEAR_MG,
        [COLUMN.NODE_ID]: 'node-b',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: 'node-b/mg-near',
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      },
      {
        [COLUMN.SERVICE_ID]: `${FAR_MG}-r1`,
        [COLUMN.GROUP_ID]: FAR_MG,
        [COLUMN.NODE_ID]: 'node-c',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: 'node-c/mg-far',
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      },
    ],
    latencies: [
      {
        [COLUMN.SOURCE_GROUP_ID]: SOURCE_LG,
        [COLUMN.TARGET_GROUP_ID]: NEAR_LG,
        [COLUMN.LATENCY_MS]: 10,
        [COLUMN.SAMPLE_COUNT]: 20,
      },
      {
        [COLUMN.SOURCE_GROUP_ID]: SOURCE_LG,
        [COLUMN.TARGET_GROUP_ID]: FAR_LG,
        [COLUMN.LATENCY_MS]: 50,
        [COLUMN.SAMPLE_COUNT]: 20,
      },
      {
        [COLUMN.SOURCE_GROUP_ID]: NEAR_LG,
        [COLUMN.TARGET_GROUP_ID]: FAR_LG,
        [COLUMN.LATENCY_MS]: 20,
        [COLUMN.SAMPLE_COUNT]: 20,
      },
    ],
  });

  const treeService = new LatencyTreeService({
    nodeId: 'node-a',
    systemTableCache: cache,
    nowFn: () => 1000,
  });
  treeService.logger = {info() {}, warn() {}, debug() {}, error() {}};
  treeService.initialize();
  treeService.start();
  treeService.recompute();

  const calls = [];
  const routerAnswerFn = options.answer || ((payload) => committedTargetAnswer(payload));
  const messageRouter = {
    deliver: async (address, payload, deliveryOptions) => {
      calls.push({address, payload, options: deliveryOptions});
      return routerAnswerFn(payload, calls.length);
    },
  };

  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: cache,
    messageRouter,
    latencyTreeService: treeService,
    nowFn: () => 2000,
    deliveryRetryDelayMs: 1,
    deliveryRetryMaxDelayMs: 1,
    ...options.serviceOptions,
  });
  service.logger = {info() {}, warn() {}, debug() {}, error() {}, logConsoleOnly() {}};
  service.initialize();
  service.start();
  t.after(() => {
    service.stop();
  });

  const source = createDurableSourceMessageGroupService(SOURCE_MG);
  // The harness addresses every recipient, as the source lane does: the
  // service itself delivers one vector to one recipient group.
  const propagate = (event = createDurableCdcEvent()) =>
    propagateToEveryRecipient(service, source, [event]);

  return {service, treeService, cache, messageRouter, calls, source, propagate};
}

test('real-latency-tree-recipient-mapping: latency tree ordering maps to actual message groups without introducing latency IDs', async (t) => {
  const f = buildStandardDualDomainFixture(t, LATENCY_PROPAGATION_MODE.SAFE);
  const routingOrder = f.treeService.getRoutingOrder(SOURCE_LG);
  assert.deepEqual(routingOrder, [SOURCE_LG, NEAR_LG, FAR_LG]);

  const result = await f.propagate();
  assert.equal(result.success, true);
  assert.equal(result.targetGroupCount, 2);

  const deliveredTargetIds = f.calls.map((call) => call.payload.targetGroupId);
  assert.deepEqual(deliveredTargetIds, [NEAR_MG, FAR_MG]);
  assert.ok(!deliveredTargetIds.includes(NEAR_LG), 'latency domain ID must not be delivered to');
  assert.ok(!deliveredTargetIds.includes(FAR_LG), 'latency domain ID must not be delivered to');
});

test('both-propagation-modes: both conservative fanout and grouped modes route to mapped message-group recipients', async (t) => {
  // Test SAFE mode
  const safeFixture = buildStandardDualDomainFixture(t, LATENCY_PROPAGATION_MODE.SAFE);
  const safeResult = await safeFixture.propagate();
  assert.equal(safeResult.success, true);
  assert.equal(safeResult.mode, CDC_GROUP_PROPAGATION_STATUS.SAFE);
  assert.equal(safeResult.strategy, CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT);
  assert.deepEqual(safeFixture.calls.map((c) => c.payload.targetGroupId), [NEAR_MG, FAR_MG]);

  // Test GROUPED mode
  const groupedFixture = buildStandardDualDomainFixture(t, LATENCY_PROPAGATION_MODE.GROUPED);
  const groupedResult = await groupedFixture.propagate();
  assert.equal(groupedResult.success, true);
  assert.equal(groupedResult.mode, CDC_GROUP_PROPAGATION_STATUS.GROUPED);
  assert.equal(groupedResult.strategy, CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR);
  assert.deepEqual(groupedFixture.calls.map((c) => c.payload.targetGroupId), [NEAR_MG, FAR_MG]);
});

test('missing-mapping-refusal-and-recovery: unmapped latency group returns typed unavailable; once mapped, retry succeeds', async (t) => {
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  const UNMAPPED_LG = 'lg-unmapped';
  const RESOLVED_MG = 'mg-unmapped-resolved';

  const cache = createDualDomainTopologyCache({
    nodes: [
      {[COLUMN.NODE_ID]: 'node-a', [COLUMN.LATENCY_GROUP_ID]: SOURCE_LG},
      {[COLUMN.NODE_ID]: 'node-b', [COLUMN.LATENCY_GROUP_ID]: NEAR_LG},
      {[COLUMN.NODE_ID]: 'node-u', [COLUMN.LATENCY_GROUP_ID]: UNMAPPED_LG},
    ],
    latencyGroups: [
      {[COLUMN.GROUP_ID]: SOURCE_LG, [COLUMN.COORDINATOR_NODE_ID]: 'node-a', [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE},
      {[COLUMN.GROUP_ID]: NEAR_LG, [COLUMN.COORDINATOR_NODE_ID]: 'node-b', [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE},
      // UNMAPPED_LG exists in topology, but has no message group or services mapped yet!
      {[COLUMN.GROUP_ID]: UNMAPPED_LG, [COLUMN.COORDINATOR_NODE_ID]: 'node-u', [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE},
    ],
    messageGroups: [
      {[COLUMN.GROUP_ID]: SOURCE_MG, leader_node_id: 'node-a'},
      {[COLUMN.GROUP_ID]: NEAR_MG, leader_node_id: 'node-b'},
    ],
    services: [
      {
        [COLUMN.SERVICE_ID]: `${SOURCE_MG}-r1`,
        [COLUMN.GROUP_ID]: SOURCE_MG,
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: 'node-a/mg-source',
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      },
      {
        [COLUMN.SERVICE_ID]: `${NEAR_MG}-r1`,
        [COLUMN.GROUP_ID]: NEAR_MG,
        [COLUMN.NODE_ID]: 'node-b',
        [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.ADDRESS]: 'node-b/mg-near',
        [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
      },
    ],
    latencies: [
      {
        [COLUMN.SOURCE_GROUP_ID]: SOURCE_LG,
        [COLUMN.TARGET_GROUP_ID]: NEAR_LG,
        [COLUMN.LATENCY_MS]: 10,
        [COLUMN.SAMPLE_COUNT]: 20,
      },
      {
        [COLUMN.SOURCE_GROUP_ID]: SOURCE_LG,
        [COLUMN.TARGET_GROUP_ID]: UNMAPPED_LG,
        [COLUMN.LATENCY_MS]: 40,
        [COLUMN.SAMPLE_COUNT]: 20,
      },
    ],
  });

  const treeService = new LatencyTreeService({
    nodeId: 'node-a',
    systemTableCache: cache,
    nowFn: () => 1000,
  });
  treeService.logger = {info() {}, warn() {}, debug() {}, error() {}};
  treeService.initialize();
  treeService.start();
  treeService.recompute();

  const calls = [];
  const messageRouter = {
    deliver: async (address, payload, deliveryOptions) => {
      calls.push({address, payload, options: deliveryOptions});
      return committedTargetAnswer(payload);
    },
  };

  const service = new CDCGroupPropagationService({
    nodeId: 'node-a',
    systemTableCache: cache,
    messageRouter,
    latencyTreeService: treeService,
    nowFn: () => 2000,
    deliveryRetryDelayMs: 1,
    deliveryRetryMaxDelayMs: 1,
  });
  service.logger = {info() {}, warn() {}, debug() {}, error() {}, logConsoleOnly() {}};
  service.initialize();
  service.start();
  t.after(() => service.stop());

  const source = createDurableSourceMessageGroupService(SOURCE_MG);
  const event = createDurableCdcEvent();

  // Attempt 1: UNMAPPED_LG has missing mapping -> typed unavailable deferRetry
  const firstAttempt = await propagateToEveryRecipient(service, source, [event]);
  assert.equal(firstAttempt.success, false);
  assert.equal(firstAttempt.deferRetry, true);
  assert.equal(firstAttempt.error, CDC_COMPLETION.UNKNOWN);

  // Now register mapping for UNMAPPED_LG:
  putTopologyRow(cache, TABLES.MESSAGE_GROUPS, {[COLUMN.GROUP_ID]: RESOLVED_MG, leader_node_id: 'node-u'});
  putTopologyRow(cache, TABLES.SERVICES, {
    [COLUMN.SERVICE_ID]: `${RESOLVED_MG}-r1`,
    [COLUMN.GROUP_ID]: RESOLVED_MG,
    [COLUMN.NODE_ID]: 'node-u',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'node-u/mg-resolved',
    [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
  });
  treeService.recompute();

  // Attempt 2: with mapping registered, retry succeeds and delivers to newly mapped group
  const secondAttempt = await propagateToEveryRecipient(service, source, [event]);
  assert.equal(secondAttempt.success, true);
  const delivered = calls.map((c) => c.payload.targetGroupId);
  assert.ok(delivered.includes(RESOLVED_MG), 'delivered to newly resolved message group');
});

test('captured-invalid-binding-recovery: invalid latency-domain binding transfers to actual recipient without fabricating ACKs', async (t) => {
  const f = buildStandardDualDomainFixture(t, LATENCY_PROPAGATION_MODE.SAFE);

  // Simulate a progress object that previously captured an invalid latency-domain ID `lg-near`
  const progress = createCdcPropagationProgress(f.service, f.source, [
    {groupId: NEAR_LG, coordinatorNodeId: 'node-b', address: null},
  ]);

  assert.equal(progress.targets.length, 1);
  assert.equal(progress.targets[0].groupId, NEAR_LG);
  assert.equal(progress.targets[0].cursor, null);

  // Re-evaluating routing plan where NEAR_LG maps to NEAR_MG:
  const newTargets = [
    {
      groupId: NEAR_MG,
      coordinatorNodeId: 'node-b',
      address: 'node-b/mg-near',
    },
  ];

  refreshCdcPropagationRoutes(progress, newTargets);

  // Obligation was transferred to NEAR_MG without fabricating ACKs
  assert.ok(!progress.targets.some((entry) => entry.groupId === NEAR_LG), 'old latency ID leaf replaced');
  const transferredLeaf = progress.targets.find((entry) => entry.groupId === NEAR_MG);
  assert.ok(transferredLeaf, 'transferred to actual message group recipient');
  assert.equal(transferredLeaf.cursor, null,
    'the recipient starts with an unknown cursor: no receipt is fabricated');
  assert.equal(transferredLeaf.route.address, 'node-b/mg-near');
});

test('captured-invalid-binding-recovery never transfers a binding to the source group: ' +
  'a coordinator node that also hosts the source yields only its other groups', async (t) => {
  const f = buildStandardDualDomainFixture(t, LATENCY_PROPAGATION_MODE.SAFE);
  putTopologyRow(f.cache, TABLES.SERVICES, {
    [COLUMN.SERVICE_ID]: `${SOURCE_MG}-r2`,
    [COLUMN.GROUP_ID]: SOURCE_MG,
    [COLUMN.NODE_ID]: 'node-b',
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: 'node-b/mg-source',
    [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
  });
  const progress = createCdcPropagationProgress(f.service, f.source, [
    {groupId: NEAR_LG, coordinatorNodeId: 'node-b', address: null},
  ]);

  refreshCdcPropagationRoutes(progress, []);

  assert.deepEqual(progress.targets.map((leaf) => leaf.groupId), [NEAR_MG],
    'the source group is the primary recipient, never a target leaf');
});

test('exact-native-receipt-coverage: completion requires exact native committed receipts from all mapped recipients', async (t) => {
  let nearCallCount = 0;
  const f = buildStandardDualDomainFixture(t, LATENCY_PROPAGATION_MODE.SAFE, {
    answer: (payload) => {
      if (payload.targetGroupId === FAR_MG) {
        // FAR_MG fails or answers uncommitted
        return {
          acknowledged: false,
          answer: {success: false, error: CDC_COMPLETION.UNKNOWN, deferRetry: true},
        };
      }
      nearCallCount += 1;
      return committedTargetAnswer(payload);
    },
  });

  const result = await f.propagate();
  assert.equal(result.success, false);
  assert.equal(result.deferRetry, true);
  assert.ok(result.failedTargetGroupIds.includes(FAR_MG));
  assert.ok(nearCallCount > 0, 'near group was delivered');
});

test('retained-source-obligation-progress: source delivery debt remains owned until all mapped recipients acknowledge', async (t) => {
  let shouldFailFar = true;
  const f = buildStandardDualDomainFixture(t, LATENCY_PROPAGATION_MODE.SAFE, {
    answer: (payload) => {
      if (payload.targetGroupId === FAR_MG && shouldFailFar) {
        return {
          acknowledged: false,
          answer: {success: false, error: CDC_COMPLETION.UNKNOWN, deferRetry: true},
        };
      }
      return committedTargetAnswer(payload);
    },
  });

  const event = createDurableCdcEvent();

  // Attempt 1: FAR_MG fails -> entire propagation incomplete, debt owned
  const attempt1 = await f.propagate(event);
  assert.equal(attempt1.success, false);
  assert.equal(attempt1.deferRetry, true);
  assert.equal(f.source.batches.length, 1, 'source applied batch once');

  // Attempt 2: FAR_MG now succeeds -> propagation completes. (The source
  // lane keeps each recipient's cursor, so it would re-address only FAR_MG;
  // this harness addresses every recipient again.)
  shouldFailFar = false;
  const attempt2 = await f.propagate(event);
  assert.equal(attempt2.success, true);
  assert.equal(attempt2.targetGroupCount, 2);
});
