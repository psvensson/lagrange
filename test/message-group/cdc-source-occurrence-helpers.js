// Shared helpers for W1, W2, W7 and W9 end-to-end native CDC delivery witnesses.
import assert from 'node:assert/strict';
import {RAFT_RS_ENTRY_TYPE} from '../../src/raft/raft-rs-ready-loop-constants.js';
import {
  PARTITION_SERVICE_CDC,
  PARTITION_SERVICE_OPERATION,
  PARTITION_COMMITTED_COMMAND_OUTCOME,
} from '../../src/partition/partition-service-constants.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {readOwedCdcObligations} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {
  resolveOperationalMessageGroupSelection,
  resolveOperationalMessageGroupSelectionAsync,
  buildMessageGroupOwnerNotReadyError,
} from '../../src/bootstrap/shared/message-group-selection.js';
import {SeedRuntimeBridgeOwner} from
  '../../src/bootstrap/owners/seed-runtime-bridge-owner.js';
import {NodeJoiningPublicationActivation} from
  '../../src/bootstrap/node-joining-publication-activation.js';
import {CDCGroupPropagationService} from
  '../../src/topology/cdc-group-propagation-service.js';
import {LatencyTreeService} from '../../src/topology/latency-tree-service.js';
import {
  NODE_A,
  pumpMulti,
  recordOf,
  json,
} from './message-group-native-w7-composition.js';

function commandOf(entry) {
  return entry.entryType === RAFT_RS_ENTRY_TYPE.NORMAL && entry.data ?
    JSON.parse(Buffer.from(entry.data, 'base64').toString()) :
    null;
}

function assertEnvelope(event, debt) {
  for (const [key, value] of Object.entries(JSON.parse(debt.eventJson))) {
    assert.deepEqual(event[key], value, `retained source field ${key}`);
  }
  assert.equal(event.eventKey, debt.eventKey);
  assert.equal(event.entryId, debt.entryId);
  assert.equal(event.sourceLogIndex, debt.logIndex);
  assert.equal(event.sourceOrdinal, debt.ordinal);
}

async function writeReleasedSql(producer, leader, sql, params, entryId, tableName) {
  assert.equal(leader.cdcSubscribers.size, 0);
  const answer = await leader.executeQuery(sql, params, {entryId});
  assert.equal(answer.success, true, `released SQL write ${entryId}: ${json(answer)}`);
  const debtsOf = () =>
    producer.services.map((replica) =>
      readOwedCdcObligations(replica.db).filter((debt) => debt.entryId === entryId),
    );
  assert.equal(
    await producer.waitFor(() => debtsOf().every((rows) => rows.length === 1)),
    true,
    `every source voter retains debt for ${entryId}`,
  );
  const debt = debtsOf()[0][0];
  for (const replica of producer.services) {
    const retained = readOwedCdcObligations(replica.db).find(
      (row) => row.entryId === entryId,
    );
    assert.deepEqual(retained, debt);
    const outcome = readCommittedStatementOutcome(
      replica,
      replica.getCommittedEntryKey({entryId}),
    );
    assert.equal(outcome.state, PARTITION_COMMITTED_STATEMENT_RECORD_STATE.SETTLED);
    assert.equal(outcome.outcome, PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED);
    assert.equal(outcome.logIndex, debt.logIndex);
    assert.equal(outcome.term, debt.term);
    const record = recordOf(replica, replica.partitionId);
    const entry = record.entries.find(
      (item) => BigInt(item.index) === BigInt(debt.logIndex),
    );
    assert.ok(entry);
    const command = commandOf(entry);
    assert.equal(command.type, PARTITION_SERVICE_OPERATION.QUERY);
    assert.equal(command.entryId, entryId);
    const event = JSON.parse(debt.eventJson);
    assert.equal(event.tableName, tableName);
    assert.equal(event.sourcePartition, replica.partitionId);
    assert.equal(event.sourceReplica, leader.replicaId);
    assert.equal(event.timestamp, command.timestamp);
    assert.equal(event.data.updated_at_hlc, command.timestamp);
  }
  return debt;
}

// The two production propagation bridges (the seed's SeedRuntimeBridgeOwner
// and the joiner's NodeJoiningPublicationActivation) as subscribers of one
// source partition. A partition holds one propagation subscriber: a witness
// registers one of them, and may replace it with the other.
function buildBridgeSubscribers(f, tableName, partitionId) {
  const cache = f.source.systemTableCache;
  f.tree = new LatencyTreeService({nodeId: NODE_A, systemTableCache: cache});
  f.tree.initialize();
  f.tree.start({recomputeImmediately: true});
  f.topology = new CDCGroupPropagationService({
    nodeId: NODE_A,
    systemTableCache: cache,
    messageRouter: f.routerA,
    latencyTreeService: f.tree,
    deliveryRetryDelayMs: 1,
  });
  f.topology.initialize();
  f.topology.start();
  f.topology.deliveryRetryMaxAttempts = 1;
  f.subscribersReady = false;

  const topologyBundle = {cdcGroupPropagationService: f.topology};
  const seedBridgeOwner = new SeedRuntimeBridgeOwner({
    delegates: {getLatencyTopology: () => topologyBundle},
  });
  const joiningContext = {latencyTopology: topologyBundle};
  const inventory = [f.source, ...f.services.values()];
  const select = (options) =>
    f.subscribersReady ?
      resolveOperationalMessageGroupSelection(inventory, options) :
      {ready: false, reason: 'test-hold'};
  const selectAsync = async (options) =>
    f.subscribersReady ?
      resolveOperationalMessageGroupSelectionAsync(inventory, options) :
      {ready: false, reason: 'test-hold'};

  const makeSubscriber = (label, propagateFn) =>
    buildPartitionCdcPropagationSubscriber({
      tableName,
      partitionId,
      replicaId: f.producerLeader.replicaId,
      resolveOperationalMessageGroupSelection: select,
      resolveOperationalMessageGroupSelectionAsync: selectAsync,
      buildMessageGroupOwnerNotReadyError,
      // The hooks receive the vector; these witnesses stage one-member vectors.
      beforePropagation: ([event]) => {
        f.events.push({
          ordinal: f.events.length,
          phase: f.phase,
          kind: 'subscriber-before',
          subscriber: label,
          eventKey: event.eventKey,
          entryId: event.entryId,
        });
      },
      // The durable subscriber contract hands propagation one vector; its
      // return is recorded under the vector's first event and all its keys.
      propagatePartitionCDCEvent: async (service, events, deliveryContext) => {
        assert.equal(service, f.source);
        const result = await propagateFn(service, events, deliveryContext);
        f.events.push({
          ordinal: f.events.length,
          phase: f.phase,
          kind: 'subscriber-return',
          subscriber: label,
          eventKey: events[0].eventKey,
          eventKeys: events.map((event) => event.eventKey),
          result: structuredClone(result),
        });
        return result;
      },
      afterPropagation: ([event]) => {
        f.events.push({
          ordinal: f.events.length,
          phase: f.phase,
          kind: 'subscriber-after',
          subscriber: label,
          eventKey: event.eventKey,
        });
      },
    });

  const seedBridge = makeSubscriber('seed-bridge', (service, events, ctx) =>
    seedBridgeOwner.propagatePartitionCDCEvent(service, events, ctx),
  );
  const joiningBridge = makeSubscriber('joining-bridge', (service, events, ctx) =>
    NodeJoiningPublicationActivation.prototype.propagatePartitionCDCEvent.call(
      joiningContext,
      service,
      events,
      ctx,
    ),
  );
  return {seedBridge, joiningBridge};
}

// Register the partition's propagation subscriber (as production does) with
// the selection held, then let the handshake's eager drive settle.
async function subscribeWithoutEagerDrive(f, subscriber, subscriberId) {
  const prevReady = f.subscribersReady;
  f.subscribersReady = false;
  const handshake = await f.producerLeader.subscribeToCDCWithHandshake(subscriber,
    {subscriberId, role: PARTITION_SERVICE_CDC.SUBSCRIBER_ROLE_PROPAGATION});
  assert.notEqual(handshake.status, PARTITION_SERVICE_CDC.HANDSHAKE_STATUS_PROPAGATION_HELD,
    `the partition holds no other propagation subscriber: ${handshake.holderSubscriberId}`);
  const laneInFlight = () =>
    f.producerLeader.cdcDelivery.getCdcObligationDiagnostics().inFlight;
  for (let round = 0; round < 30 && laneInFlight() === true; round += 1) {
    await pumpMulti(f, 1);
  }
  assert.equal(laneInFlight(), false, 'handshake eager drive settled within bounded rounds');
  f.subscribersReady = prevReady;
}

export {
  commandOf,
  assertEnvelope,
  writeReleasedSql,
  buildBridgeSubscribers,
  subscribeWithoutEagerDrive,
};
