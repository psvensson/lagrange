// Production CDC producer -> subscriber -> seed bridge -> topology fanout ->
// actual message-group RF1/RF3. No committed receipt is constructed by this test.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import path from 'node:path';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {CONFIG_SCHEMA} from '../../src/bootstrap/system-table-schemas-constants.js';
import {PARTITION_SERVICE_OPERATION, PARTITION_COMMITTED_COMMAND_OUTCOME} from
  '../../src/partition/partition-service-constants.js';
import {PARTICIPANT_CUTOVER_OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE} from
  '../../src/partition/partition-committed-statement-outcome-constants.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {isCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {readOwedCdcObligations, readCdcObligation} from
  '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_CDC_COMMAND} from
  '../../src/partition/partition-cdc-obligation-constants.js';
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
import {emit, pump, recipientFixture, view, NODE_ID, GROUP_ID} from
  './message-group-native-custody-fixture.js';

const KEY = 'native_cdc_custody_witness';
const PARTITION_ID = 'config-custody-native';
const BUDGET_MS = 10000;
const LOSS_ROUNDS = 200;
const MEMBERS = [1, 2, 3].map((n) => [`${PARTITION_ID}-r${n}`, NODE_ID]);
const WRITE_SQL = 'INSERT INTO config (config_key, config_value, value_type, ' +
  'default_value, created_at) VALUES (?, ?, ?, ?, ?)';
const WRITE_PARAMS = [KEY, 'owed-value', 'string', '', 1];

function json(value) {
  return JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? String(item) : item);
}

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
  const release = await owners.release(PARTITION_ID);
  assert.equal(release.outcome, PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER, json(release));
  const status = group.services[0].raft.readStatus();
  assert.equal(status.role, RAFT_ROLE.LEADER);
  assert.equal(status.confState.voters.length, MEMBERS.length);
  t.diagnostic(json({stage: 'setup-real-release-complete', release, status}));
  return {group, leader: group.services[0], release};
}

function readSource(producer, entryId) {
  return producer.group.services.map((service) => ({
    replicaId: service.replicaId,
    owed: readOwedCdcObligations(service.db).filter((item) => item.entryId === entryId),
    outcome: readCommittedStatementOutcome(service, service.getCommittedEntryKey({entryId})),
    row: service.db.prepare('SELECT * FROM config WHERE config_key = ?').get(KEY),
    record: RaftRsDurableStore.readDurableRecordIn(service.db, PARTITION_ID),
  }));
}

async function writeSource(t, producer, entryId) {
  assert.equal(producer.leader.cdcSubscribers.size, 0,
    'setup measures owed source debt before any recipient can authorize ACK');
  const written = await producer.leader.executeQuery(WRITE_SQL, WRITE_PARAMS, {entryId});
  assert.equal(written.success, true, `ordinary released-source admission: ${json(written)}`);
  assert.equal(await producer.group.waitFor(() => readSource(producer, entryId)
    .every((peer) => peer.owed.length === 1)), true,
  'setup: every real source replica retains the ordinary SQL CDC obligation');
  const source = readSource(producer, entryId);
  for (const peer of source) {
    assert.equal(peer.outcome.state, PARTITION_COMMITTED_STATEMENT_RECORD_STATE.SETTLED);
    assert.equal(peer.outcome.outcome, PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED);
    assert.equal(peer.row.config_key, KEY);
    assert.equal(peer.row.config_value, WRITE_PARAMS[1]);
    const [debt] = peer.owed;
    assert.deepEqual(debt, source[0].owed[0], 'every source replica retains identical CDC debt');
    assert.equal(debt.logIndex, peer.outcome.logIndex);
    assert.equal(debt.term, peer.outcome.term);
    assert.ok(Number.isSafeInteger(debt.logIndex) && debt.logIndex > 0);
    const retained = peer.record.entries.find((entry) =>
      BigInt(entry.index) === BigInt(debt.logIndex));
    assert.ok(retained, 'source debt names an actual retained native entry');
    assert.equal(BigInt(retained.term), BigInt(debt.term));
    const command = JSON.parse(Buffer.from(retained.data, 'base64').toString());
    const event = JSON.parse(debt.eventJson);
    assert.equal(command.type, PARTITION_SERVICE_OPERATION.QUERY);
    assert.equal(command.entryId, entryId);
    assert.equal(command.sql, WRITE_SQL);
    assert.deepEqual(command.params, WRITE_PARAMS);
    assert.equal(event.tableName, TABLES.CONFIG);
    assert.equal(event.operation, CDC_OPERATION.INSERT);
    assert.equal(event.sourcePartition, PARTITION_ID);
    assert.equal(event.sourceReplica, producer.leader.replicaId);
    assert.equal(event.data.config_key, KEY);
    assert.equal(event.data.config_value, WRITE_PARAMS[1]);
    assert.ok(typeof event.timestamp === 'string' && event.timestamp.length > 0,
      'the normal producer supplied its HLC');
    assert.equal(event.timestamp, command.timestamp);
    assert.equal(event.data.updated_at_hlc, command.timestamp);
    assert.ok(BigInt(peer.record.hardState.commit) >= BigInt(debt.logIndex));
    assert.ok(BigInt(peer.record.appliedIndex) >= BigInt(debt.logIndex));
  }
  t.diagnostic(json({stage: 'setup-ordinary-query-and-durable-debt', written, source}));
  return source[0].owed[0];
}

function assertSourceEvent(event, debt) {
  const envelope = JSON.parse(debt.eventJson);
  for (const [field, value] of Object.entries(envelope)) {
    assert.deepEqual(event[field], value, `durable source envelope ${field}`);
  }
  assert.equal(event.eventKey, debt.eventKey);
  assert.equal(event.entryId, debt.entryId);
  assert.equal(event.sourceLogIndex, debt.logIndex);
  assert.equal(event.sourceOrdinal, debt.ordinal);
}

function recipientEntries(recipientView) {
  return recipientView.record.entries.filter((entry) => {
    if (!entry.data) return false;
    const command = JSON.parse(Buffer.from(entry.data, 'base64').toString());
    return command.data?.config_key === KEY ||
      command.events?.some((event) => event.data?.config_key === KEY);
  });
}

function assertNativeReceipt(propagation, debt) {
  assert.equal(propagation.result.targetGroupCount, 0,
    'this first witness has one source MG and no additional target groups');
  assert.equal(isCommittedCdcOutcome(propagation.result, [propagation.event], GROUP_ID), true,
    `RF1_ACCEPTANCE_REQUIRES_NATIVE_AFTER_COMMIT: ${json(propagation.result)}`);
  const [receipt] = propagation.result.cdcCommitted;
  const peer = propagation.recipient[0];
  const retained = peer.record.entries.find((entry) =>
    BigInt(entry.index) === BigInt(receipt.logIndex));
  assert.ok(retained, 'receipt position names a real retained native entry at result time');
  assert.equal(BigInt(retained.term), BigInt(receipt.term));
  const command = JSON.parse(Buffer.from(retained.data, 'base64').toString());
  const events = command.events ?? [command];
  const exact = events.filter((event) => event.eventKey === debt.eventKey);
  assert.equal(exact.length, 1, 'native entry retains the exact source occurrence once');
  assertSourceEvent(exact[0], debt);
  assert.ok(BigInt(peer.record.hardState.commit) >= BigInt(retained.index));
  assert.ok(BigInt(peer.record.appliedIndex) >= BigInt(retained.index));
  assert.equal(peer.row.config_value, WRITE_PARAMS[1]);
}

async function assertSourceAck(t, f, producer, debt) {
  const flush = await producer.leader.cdcDelivery.flushCdcAcknowledgements('rf1-native-receipt');
  assert.equal(await producer.group.waitFor(() => producer.group.services.every((service) =>
    readCdcObligation(service.db, debt.eventKey)?.delivered === true)), true,
  'the canonical source ACK applies to every actual source replica');
  const result = report(t, f, producer, 'source-ack-after-native-receipt', {flush});
  for (const peer of result.producer) {
    assert.equal(peer.obligation.eventJson, debt.eventJson);
    const entry = peer.record.entries.find((item) =>
      BigInt(item.index) === BigInt(peer.obligation.deliveredIndex));
    assert.ok(entry, 'source delivered flag names a retained native ACK');
    assert.equal(BigInt(entry.term), BigInt(peer.obligation.deliveredTerm));
    assert.equal(JSON.parse(Buffer.from(entry.data, 'base64').toString()).type,
      PARTITION_CDC_COMMAND.DELIVERED);
    assert.ok(BigInt(peer.record.appliedIndex) >= BigInt(entry.index));
  }
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
  t.diagnostic(json(result));
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
      emit(f, 'actual-propagation-return', {result, event: structuredClone(args[1]),
        recipient: view(f)});
      return result;
    },
    afterPropagation: () => emit(f, 'subscriber-after-propagation'),
  });
  return {subscriber, topology};
}

test('released executeQuery debt requires actual RF1 native receipt through the seed bridge',
  async (t) => {
    const producer = await producerFixture(t);
    const debt = await writeSource(t, producer, 'native-cdc-rf1-write');
    const f = await recipientFixture(t, KEY, {replicaCount: 1});
    const {subscriber, topology} = subscribe(f, producer);
    t.after(() => topology.cdcGroupPropagationService.stop());
    await producer.leader.subscribeToCDCWithHandshake(subscriber,
      {subscriberId: 'native-rf1-message-group-custody'});
    await pump(f);
    const propagation = f.events.find((event) => event.kind === 'actual-propagation-return');
    report(t, f, producer, 'rf1-actual-propagation-return');
    assert.ok(propagation, 'the real subscriber/seed/topology call returned its own result');
    assertSourceEvent(propagation.event, debt);
    // Receipt and native frontier are inspected at the actual return, not
    // after a later pump that could conceal append-only early success.
    assertNativeReceipt(propagation, debt);
    await assertSourceAck(t, f, producer, debt);
  });

test('native CDC producer retains custody until message-group committed application',
  async (t) => {
    const producer = await producerFixture(t);
    const debt = await writeSource(t, producer, 'native-cdc-custody-write');
    const f = await recipientFixture(t, KEY);
    const {subscriber, topology} = subscribe(f, producer);
    t.after(() => topology.cdcGroupPropagationService.stop());
    f.holdEntries = true;
    await producer.leader.subscribeToCDCWithHandshake(subscriber,
      {subscriberId: 'native-message-group-custody'});
    await pump(f);
    assert.ok(f.event?.eventKey, 'actual durable event entered its subscriber');
    assert.equal(f.event.sourcePartition, PARTITION_ID);
    assert.ok(Number.isSafeInteger(f.event.sourceLogIndex) && f.event.sourceLogIndex > 0);
    assertSourceEvent(f.event, debt);
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
