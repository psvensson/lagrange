// The seed teardown completes when the latency topology stops while a
// partition's CDC delivery is held inside the propagation service.
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
// Since 4151a3ab4 the partition's CDC is a durable obligation: its delivery
// is a durable propagation wave, the service's one propagation path. The hold
// is the wave's own retry delay between attempts (the service's sleep, which
// stop() owns), entered because the target's answer is the CDC outcome
// owner's typed unknown; settlement is observed by turns, never by a clock.

import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';

import {PartitionService} from '../../src/partition/partition-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {unknownCdcAcceptance} from '../../src/cdc/cdc-delivery-outcome.js';
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
  createDurableSourceMessageGroupService,
  createMessageRouter,
  createTopologyCache,
  setupConfig,
} from '../topology/cdc-group-propagation-service-harness.js';
import {withFoundingStamp} from '../partition/partition-founding-stamp.js';
import {resumeFixtureParticipantAdmission} from
  '../test-helpers/participant-transaction-fixture.js';

const NODE_ID = 'seed-node';
const REPLICA_ID = 'replica_operations-p1-r1';
const SETTLE_TURN_LIMIT = 2000;
// The wave's retry delay: inside the delivery budget, so the wave waits in
// it, and longer than the observation, so stop() lands inside it.
const HELD_RETRY_DELAY_MS = 1000;
const SOURCE_GROUP_ID = 'g-1';
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
    messageRouter: createMessageRouter([unknownCdcAcceptance()]),
    latencyTreeService: {getRoutingOrder: () => ['g-1', 'g-2']},
    deliveryRetryDelayMs: HELD_RETRY_DELAY_MS,
  });
  service.initialize();
  service.start();
  return service;
}

test('the seed teardown completes when the latency topology stops inside a ' +
  'partition CDC delivery\'s propagation wave', async () => {
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
    systemTableCache: new SystemTableCache(),
  }));
  await partition.initialize();
  await resumeFixtureParticipantAdmission(partition);
  const sourceMessageGroup = createDurableSourceMessageGroupService(SOURCE_GROUP_ID);
  await partition.subscribeToCDCWithHandshake(
    (cdcEvent, deliveryContext) => bridge.propagatePartitionCDCEvent(
      sourceMessageGroup, cdcEvent, deliveryContext),
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
  // delivery's propagation wave waits in its retry delay.
  await partition.insertData('replica_operations',
    {operation_id: 'op-1', status: 'COMPLETED'});
  for (let turn = 0; turn < SETTLE_TURN_LIMIT &&
    propagation.retrySleepReleases.size === 0; turn += 1) {
    await yieldTurns(1);
  }
  assert.equal(propagation.retrySleepReleases.size, 1,
    'the partition\'s CDC delivery waits in the propagation wave\'s retry delay');
  assert.notEqual(propagation.activeDurablePropagation, null,
    'the durable propagation wave is in flight');
  assert.equal(sourceMessageGroup.batches.length, 1,
    'the wave applied the event on the source group once');
  // The drive and its invocation's cleanup are both tracked (was: exactly one pending batch-window delivery).
  assert.ok(partition.pendingCDCEventDeliveries.size > 0,
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
  assert.equal(propagation.activeDurablePropagation, null,
    'no propagation wave is left in flight');
  assert.equal(propagation.retrySleepReleases.size, 0,
    'no retry delay is left held');
  await shutdown.done;
});
