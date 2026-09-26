// The seed teardown completes when the latency topology stops while a
// partition's CDC delivery waits in the propagation service's batch window.
//
// Witnessed on the rs-raft cutover (fresh-join-via-non-seed-node teardown
// hang): the seed cleanup stops the latency topology (and with it the CDC
// group propagation service) before it shuts down the replica handler. A
// replica_operations delivery was waiting in an immediate batch; stop() left
// it unsettled, PartitionService.shutdown awaited it, and
// ReplicaHandler.shutdown never completed.
//
// Composition: a real in-memory single-replica PartitionService registered
// with a real ReplicaHandler the way bootstrap registers seed partitions; its
// CDC subscriber is the seed's real propagation step
// (SeedRuntimeBridgeOwner.propagatePartitionCDCEvent) into a real
// CDCGroupPropagationService; the teardown steps are the seed cleanup's own,
// in its order (LatencyTopologySetup.stop, then ReplicaHandler.shutdown).
// The batch window is the service's own option, held open so stop() lands
// inside it; settlement is observed by turns, never by a clock.

import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';

import {PartitionService} from '../../src/partition/partition-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {LATENCY_PROPAGATION_MODE} from
  '../../src/topology/latency-topology-constants.js';
import {CDCGroupPropagationService} from
  '../../src/topology/cdc-group-propagation-service.js';
import {LatencyTopologySetup} from
  '../../src/bootstrap/shared/latency-topology-setup.js';
import {SeedRuntimeBridgeOwner} from
  '../../src/bootstrap/owners/seed-runtime-bridge-owner.js';
import {
  createGroupRow,
  createMessageGroupServiceRow,
  createMessageRouter,
  createSourceMessageGroupService,
  createTopologyCache,
  setupConfig,
} from '../topology/cdc-group-propagation-service-harness.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';

const NODE_ID = 'seed-node';
const REPLICA_ID = 'replica_operations-p1-r1';
const SETTLE_TURN_LIMIT = 2000;
// Longer than the whole test: the batch window stays open until stop().
const HELD_BATCH_WINDOW_MS = 3600000;
const SCHEMA = Object.freeze({
  columns: [
    {name: 'operation_id', type: 'TEXT', primaryKey: true},
    {name: 'status', type: 'TEXT'},
  ],
});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

async function yieldTurns(turns) {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

async function untilSettled(box) {
  for (let turn = 0; turn < SETTLE_TURN_LIMIT && !box.settled; turn += 1) {
    await yieldTurns(1);
  }
}

function track(operation) {
  const box = {settled: false};
  box.done = Promise.resolve(operation).finally(() => {
    box.settled = true;
  });
  return box;
}

function startPropagationService() {
  const service = new CDCGroupPropagationService({
    nodeId: NODE_ID,
    systemTableCache: createTopologyCache({
      nodes: [{[COLUMN.NODE_ID]: NODE_ID, [COLUMN.LATENCY_GROUP_ID]: 'g-1'}],
      groups: [createGroupRow('g-1', NODE_ID), createGroupRow('g-2', 'node-b')],
      services: [createMessageGroupServiceRow('mg-node-b', 'node-b',
        'node-b/message-group/mg-node-b', RAFT_ROLE.LEADER, 'mg-node-b')],
    }),
    messageRouter: createMessageRouter([{acknowledged: true}]),
    latencyTreeService: {getRoutingOrder: () => ['g-1', 'g-2']},
    immediateBatchDelayMs: HELD_BATCH_WINDOW_MS,
  });
  service.initialize();
  service.start();
  return service;
}

test('the seed teardown completes when the latency topology stops inside a ' +
  'partition CDC delivery\'s batch window', async () => {
  const propagation = startPropagationService();
  const topology = {cdcGroupPropagationService: propagation};
  const bridge = new SeedRuntimeBridgeOwner({
    delegates: {getLatencyTopology: () => topology},
  });
  const partition = new PartitionService(withFoundingStamp({
    partitionId: 'replica_operations-p1',
    tableId: 'replica_operations',
    tableName: 'replica_operations',
    replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID],
    nodeId: NODE_ID,
    dbPath: ':memory:',
    schema: SCHEMA,
  }));
  await partition.initialize();
  const sourceMessageGroup = createSourceMessageGroupService();
  await partition.subscribeToCDCWithHandshake(
    (cdcEvent) => bridge.propagatePartitionCDCEvent(sourceMessageGroup, cdcEvent),
    {subscriberId: 'seed-hydration'});
  const handler = new ReplicaHandler({
    nodeId: NODE_ID,
    systemTableCache: new SystemTableCache(),
    cdcIntegrationService: {},
    // Never called: the seed's partition is registered, not created.
    createPartitionService: async () => {
      throw new Error('the witness creates no replica');
    },
  });
  handler.registerExistingReplica({
    replicaId: REPLICA_ID,
    partitionId: 'replica_operations-p1',
    tableName: 'replica_operations',
    service: partition,
  });

  // A rebalancer completion commits on the seed's partition; its CDC
  // delivery waits in the propagation service's batch window.
  await partition.insertData('replica_operations',
    {operation_id: 'op-1', status: 'COMPLETED'});
  for (let turn = 0; turn < SETTLE_TURN_LIMIT &&
    propagation.immediateBatchEntriesByKey.size === 0; turn += 1) {
    await yieldTurns(1);
  }
  assert.equal(propagation.immediateBatchEntriesByKey.size, 1,
    'the partition\'s CDC delivery waits in the batch window');
  assert.equal(partition.pendingCDCEventDeliveries.size, 1,
    'the partition tracks it as a pending delivery');

  // The seed cleanup's order: the latency topology stops, then the replica
  // handler shuts down.
  await LatencyTopologySetup.stop(topology);
  const shutdown = track(handler.shutdown());
  await untilSettled(shutdown);

  assert.equal(shutdown.settled, true,
    'ReplicaHandler.shutdown completes: the partition\'s pending delivery ' +
    'settled when the propagation service stopped');
  assert.equal(partition.pendingCDCEventDeliveries.size, 0,
    'no CDC delivery is left pending on the partition');
  assert.equal(propagation.immediateBatchTimers.size, 0,
    'no batch timer is left armed');
  await shutdown.done;
});
