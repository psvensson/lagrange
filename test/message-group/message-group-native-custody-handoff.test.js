// Production CDC producer -> subscriber -> seed bridge -> topology fanout ->
// actual message-group RF3. No committed receipt is constructed by this test.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {CONFIG_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {readOwedCdcObligations, readCdcObligation} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {resolveOperationalMessageGroupSelection,
  resolveOperationalMessageGroupSelectionAsync, buildMessageGroupOwnerNotReadyError} from
  '../../src/bootstrap/shared/message-group-selection.js';
import {SeedRuntimeBridgeOwner} from '../../src/bootstrap/owners/seed-runtime-bridge-owner.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {LatencyTreeService} from '../../src/topology/latency-tree-service.js';
import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {attachPartitionReleaseOwners} from '../partition/partition-release-fixture.js';
import {emit, pump, recipientFixture, view, NODE_ID} from
  './message-group-native-custody-fixture.js';

const KEY = 'native_cdc_custody_witness';
const PARTITION_ID = 'config-custody-native';
const BUDGET_MS = 10000;
const LOSS_ROUNDS = 200;
const MEMBERS = [1, 2, 3].map((n) => [`${PARTITION_ID}-r${n}`, NODE_ID]);

async function producerFixture(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID},
    logging: {level: 'fatal'}, raft: {heartbeatIntervalMs: 20,
      electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300}});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const group = await formAdmittedGroup({partitionId: PARTITION_ID, members: MEMBERS,
    tempPrefix: 'mg-custody-producer-', budgetMs: BUDGET_MS,
    serviceOptions: {tableName: TABLES.CONFIG, tableId: TABLES.CONFIG,
      schema: CONFIG_SCHEMA}});
  let owners = null;
  t.after(async () => {
    const results = await Promise.allSettled([owners?.dispose()]);
    const retained = results.some((result) => result.status === 'rejected');
    results.push(...await Promise.allSettled([
      group.dispose({retainDirectory: retained}),
    ]));
    const failures = results.filter((result) => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures,
        `producer cleanup failed; retained ${path.dirname(group.dbFileOf(MEMBERS[0]))}`);
    }
  });
  owners = await attachPartitionReleaseOwners(group.services,
    {directory: path.dirname(group.dbFileOf(MEMBERS[0])), budgetMs: BUDGET_MS});
  await owners.release(PARTITION_ID);
  assert.equal(group.services[0].raft.readStatus().role, 'leader');
  return {group, leader: group.services[0]};
}

function recipientEntries(recipientView) {
  return recipientView.record.entries.filter((entry) => {
    if (!entry.data) return false;
    const command = JSON.parse(Buffer.from(entry.data, 'base64').toString());
    return command.data?.config_key === KEY ||
      command.events?.some((event) => event.data?.config_key === KEY);
  });
}

function report(t, f, producer, stage, extra = {}) {
  const result = {stage, recipient: view(f), events: structuredClone(f.events),
    eventIdentity: structuredClone(f.event ?? null),
    deliveryLane: producer.leader.cdcDelivery.getCdcObligationDiagnostics(),
    held: structuredClone(f.held),
    producer: producer.group.services.map((service) => ({
      replicaId: service.replicaId, owed: readOwedCdcObligations(service.db),
      record: RaftRsDurableStore.readDurableRecordIn(service.db, PARTITION_ID),
      obligation: f.event ? readCdcObligation(service.db, f.event.eventKey) : null,
      sourceRow: service.db.prepare('SELECT * FROM config WHERE config_key = ?').get(KEY),
    })), ...extra};
  t.diagnostic(JSON.stringify(result));
  return result;
}

function subscribe(f, producer) {
  const service = f.services[0];
  const topology = {cdcGroupPropagationService: new CDCGroupPropagationService({
    nodeId: NODE_ID, systemTableCache: service.systemTableCache,
    messageRouter: f.router,
    latencyTreeService: new LatencyTreeService({nodeId: NODE_ID,
      systemTableCache: service.systemTableCache})})};
  const bridge = new SeedRuntimeBridgeOwner({delegates: {getLatencyTopology: () => topology}});
  const subscriber = buildPartitionCdcPropagationSubscriber({tableName: TABLES.CONFIG,
    partitionId: PARTITION_ID, replicaId: producer.leader.replicaId,
    resolveOperationalMessageGroupSelection: (options) =>
      resolveOperationalMessageGroupSelection(f.services, options),
    resolveOperationalMessageGroupSelectionAsync: (options) =>
      resolveOperationalMessageGroupSelectionAsync(f.services, options),
    buildMessageGroupOwnerNotReadyError,
    beforePropagation: (event) => {
      f.event = structuredClone(event);
      emit(f, 'producer-durable-event-entered-subscriber', {event: f.event,
        obligation: readCdcObligation(producer.leader.db, event.eventKey)});
    },
    propagatePartitionCDCEvent: async (...args) => {
      const result = await Reflect.apply(bridge.propagatePartitionCDCEvent, bridge, args);
      emit(f, 'actual-propagation-return', {result, recipient: view(f)});
      return result;
    },
    afterPropagation: () => emit(f, 'subscriber-after-propagation'),
  });
  return {subscriber, topology};
}

test('native CDC producer retains custody until message-group committed application',
  async (t) => {
    const producer = await producerFixture(t);
    const f = await recipientFixture(t, KEY);
    const {subscriber, topology} = subscribe(f, producer);
    t.after(() => topology.cdcGroupPropagationService.stop());
    await producer.leader.subscribeToCDCWithHandshake(subscriber,
      {subscriberId: 'native-message-group-custody'});
    f.holdEntries = true;
    const written = await producer.leader.applyWrite({
      type: PARTITION_SERVICE_OPERATION.INSERT, entryId: 'native-cdc-custody-write',
      sql: 'INSERT INTO config (config_key, config_value, value_type, default_value, ' +
        'created_at) VALUES (?, ?, ?, ?, ?)', params: [KEY, 'owed-value', 'string', '', 1],
    });
    assert.equal(written.success, true, JSON.stringify(written));
    await pump(f);
    assert.ok(f.event?.eventKey, 'actual durable event entered its subscriber');
    assert.equal(f.event.sourcePartition, PARTITION_ID);
    assert.ok(Number.isSafeInteger(f.event.sourceLogIndex) && f.event.sourceLogIndex > 0);
    // One explicitly scheduled source-owner flush after the fixed delivery
    // rounds. This is actuation, not an observer. EMPTY/retained/committed are
    // all valid observations; no test precondition demands unsafe discharge.
    const flush = await producer.leader.cdcDelivery.flushCdcAcknowledgements(
      'native-custody-cut');
    const cut = report(t, f, producer, 'source-flush-recipient-uncommitted', {flush});
    const entry = recipientEntries(cut.recipient[0]);
    assert.equal(entry.length, 1, 'exact actual recipient proposal is retained');
    const index = BigInt(entry[0].index);
    assert.ok(BigInt(cut.recipient[0].record.hardState.commit) < index);
    assert.ok(BigInt(cut.recipient[0].record.appliedIndex) < index);
    assert.ok(cut.recipient.slice(1).every((peer) =>
      recipientEntries(peer).length === 0 && peer.row === null));

    // Controlled native recipient leader loss followed by native rejoin and
    // suffix replacement. No database, cache or event row is deleted.
    f.phase = 'post-cut-recipient-loss';
    f.isolateLeader = true;
    let elected = false;
    for (let round = 0; round < LOSS_ROUNDS; round += 1) {
      await f.services[1].raft.tick();
      await pump(f);
      if (f.services[1].raft.readStatus().role === 'leader') {
        elected = true;
        break;
      }
    }
    assert.equal(elected, true, 'actual remaining recipient quorum elects a leader');
    await pump(f);
    f.phase = 'recipient-rejoin-and-suffix-replacement';
    f.isolateLeader = false;
    f.holdEntries = false;
    f.queue.push(...f.held.splice(0));
    await pump(f);
    const replaced = report(t, f, producer, 'native-suffix-replaced-before-source-redrive');
    assert.ok(replaced.recipient.every((peer) => recipientEntries(peer).length === 0),
      'actual new-term history replaced every uncommitted recipient occurrence');
    assert.ok(replaced.recipient.slice(1).every((peer) => peer.row === null),
      'the newly elected quorum never applied the uncommitted event');
    // The old leader cache may retain its precommit apply. Preserve that fact
    // in the vector; do not normalize it into a committed application.
    f.phase = 'source-canonical-redrive';
    let replay = {settlement: 'pending'};
    const redrive = producer.leader.cdcDelivery.driveCdcObligations('native-loss-replay');
    Promise.resolve(redrive).then((answer) => {
      replay = {settlement: 'fulfilled', answer};
    }, (error) => {
      replay = {settlement: 'rejected', message: error.message};
    });
    await pump(f);
    const afterLoss = report(t, f, producer, 'after-native-recipient-loss-and-source-redrive',
      {replay, scope: 'exact event delivery custody, not whole-database data loss'});
    const sourceLeaderCut = cut.producer.find((peer) =>
      peer.replicaId === producer.leader.replicaId);
    assert.equal(afterLoss.replay.settlement, 'fulfilled',
      'the actual source redrive returned its recorded typed outcome');
    assert.equal(afterLoss.deliveryLane.inFlight, false,
      'canonical redrive completed rather than only joining an in-flight delivery');
    for (const field of ['eventKey', 'sourcePartition', 'sourceLogIndex']) {
      assert.equal(afterLoss.eventIdentity[field], cut.eventIdentity[field],
        `redrive preserves original event ${field}`);
    }
    assert.ok(afterLoss.producer.every((peer) => peer.sourceRow.config_key === KEY &&
      peer.sourceRow.config_value === 'owed-value'), 'source data remains retained');
    assert.ok(sourceLeaderCut.owed.some((owed) => owed.eventKey === cut.eventIdentity.eventKey),
      'SOURCE_CUSTODY_RELEASED_BEFORE_RECIPIENT_COMMIT');
    for (const peer of afterLoss.recipient.slice(1)) {
      const replayEntries = recipientEntries(peer);
      assert.ok(replayEntries.length > 0, 'actual exact event was reproposed');
      assert.ok(replayEntries.some((event) =>
        BigInt(peer.record.hardState.commit) >= BigInt(event.index) &&
        BigInt(peer.record.appliedIndex) >= BigInt(event.index)),
      'new recipient quorum actually committed and applied the redelivered event');
    }
    assert.ok(afterLoss.recipient.slice(1).every((peer) => peer.row?.config_value === 'owed-value'),
      'retained source custody redelivers through the actual new recipient quorum');
  });
