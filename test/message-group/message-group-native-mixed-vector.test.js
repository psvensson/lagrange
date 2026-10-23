// Real RF1 and RF3 native receipt correspondence for mixed input. The durable
// event here is test input, not a claim of real source SQL/ledger/ACK evidence.
// The separate native-custody handoff witness owns that source proof.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {isRaftRsTransportEnvelope} from '../../src/raft/raft-packet-utils.js';
import {cdcCommitWaitIdentity, isCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {MESSAGE_GROUP_CDC_FORWARD_MODE} from
  '../../src/message-group/message-group-forwarding-owner-constants.js';
import {GROUP_ID, NODE_ID, pump, recipientFixture} from './message-group-native-custody-fixture.js';

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}, logging: {level: 'fatal'},
    raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300}});
  LoggingService.getInstance().initialize({level: 'fatal'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function mixedInput(assigned) {
  const stamp = new HLCTimestamp(1000, 0, 'mixed-vector-source').toString();
  const durable = {tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
    data: {config_key: 'mixed-durable', config_value: 'durable-body'}, timestamp: stamp,
    sourcePartition: 'mixed-config-source', sourceReplica: 'mixed-config-source-r1',
    eventKey: 'mixed-native-write-1', entryId: 'mixed-native-write-1',
    sourceLogIndex: 19, sourceOrdinal: 0};
  const ordinary = {tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
    data: {config_key: 'mixed-ordinary', config_value: 'ordinary-body'},
    ...(assigned ? {timestamp: stamp} : {})};
  return [durable, ordinary];
}

function nativeCommand(service, eventKey) {
  const record = RaftRsDurableStore.readDurableRecordIn(service.db, GROUP_ID);
  for (const entry of record.entries) {
    if (!entry.data) continue;
    const command = JSON.parse(Buffer.from(entry.data, 'base64').toString());
    if (command.events?.some((event) => event.eventKey === eventKey)) {
      return {record, entry, command};
    }
  }
  assert.fail('a successful mixed receipt must name an actual retained native command');
}

function observeApplicationTransport(f) {
  const deliver = f.router.deliver;
  const calls = [];
  f.router.deliver = function(address, payload, ...options) {
    if (isRaftRsTransportEnvelope(payload)) {
      return Reflect.apply(deliver, this, [address, payload, ...options]);
    }
    const call = {address, payload: structuredClone(payload), answer: null};
    calls.push(call);
    return Reflect.apply(deliver, this, [address, payload, ...options]).then((answer) => {
      call.answer = structuredClone(answer);
      return answer;
    });
  };
  return calls;
}

async function measuredApply(f, service, events) {
  let settled = false;
  let result;
  let failure;
  const operation = service.applyCDCBatch(events).then((answer) => {
    result = answer;
    settled = true;
  }, (error) => {
    failure = error;
    settled = true;
  });
  await pump(f);
  assert.equal(settled, true, 'the finite native packet schedule completes mixed delivery');
  await operation;
  assert.equal(failure, undefined, failure?.stack);
  return result;
}

function assertNativeMixedResult(f, events, answer, assigned) {
  assert.equal(isCommittedCdcOutcome(answer, events, GROUP_ID), true);
  assert.equal(answer.cdcVectorDigest, cdcCommitWaitIdentity(events));
  const receipt = answer.cdcCommitted[0];
  assert.equal(answer.cdcCommitted.length, 1, 'ordinary data does not invent durable occurrences');
  const retained = nativeCommand(f.services[0], events[0].eventKey);
  assert.equal(retained.command.events.length, events.length);
  assert.deepEqual(retained.command.events[0], events[0]);
  const ordinary = retained.command.events[1];
  assert.equal(ordinary.tableName, events[1].tableName);
  assert.equal(ordinary.operation, events[1].operation);
  assert.deepEqual(ordinary.data, events[1].data);
  assert.ok(typeof ordinary.timestamp === 'string' && ordinary.timestamp.length > 0);
  if (assigned) assert.equal(ordinary.timestamp, events[1].timestamp);
  assert.equal(Object.hasOwn(events[1], 'timestamp'), assigned,
    'normalization does not mutate the caller request');
  assert.equal(BigInt(receipt.logIndex), BigInt(retained.entry.index));
  assert.equal(BigInt(receipt.term), BigInt(retained.entry.term));
  assert.ok(BigInt(retained.record.hardState.commit) >= BigInt(retained.entry.index));
  assert.ok(BigInt(retained.record.appliedIndex) >= BigInt(retained.entry.index));
  for (const event of events) {
    assert.equal(f.services[0].systemTableCache.get(TABLES.CONFIG,
      event.data.config_key).config_value, event.data.config_value);
  }
  return retained.command.events;
}

for (const assigned of [false, true]) {
  test(`RF1 mixed native command preserves complete input with ordinary stamp assigned=${assigned}`,
    async (t) => {
      const f = await recipientFixture(t, 'mixed-durable', {replicaCount: 1});
      const events = mixedInput(assigned);
      const expected = structuredClone(events);
      const answer = await measuredApply(f, f.services[0], events);
      assert.deepEqual(events, expected, 'the complete caller vector remains unchanged');
      assertNativeMixedResult(f, expected, answer, assigned);
    });
}

test('RF3 follower forwards the complete normalized mixed vector to its actual native leader',
  async (t) => {
    const f = await recipientFixture(t, 'mixed-durable');
    const follower = f.services[1];
    assert.equal(follower.raft.readStatus().role, RAFT_ROLE.FOLLOWER);
    const applications = observeApplicationTransport(f);
    const events = mixedInput(false);
    const expected = structuredClone(events);
    const answer = await measuredApply(f, follower, events);
    assert.deepEqual(events, expected, 'the complete caller vector remains unchanged');
    const native = assertNativeMixedResult(f, expected, answer, false);
    const terminal = applications.find((call) =>
      call.payload.cdcForwardMode === MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT);
    assert.ok(terminal, 'the existing transport carries the real terminal native request');
    assert.equal(terminal.address, f.services[0].unifiedAddress);
    assert.equal(terminal.payload.targetGroupId, GROUP_ID);
    assert.deepEqual(terminal.payload.events, native,
      'no hop filters, duplicates, remints or restamps a member');
    assert.equal(isCommittedCdcOutcome(terminal.answer, native, GROUP_ID), true,
      'the forwarding consumer first receives a result bound to the native command');
    assert.notEqual(answer.cdcVectorDigest, terminal.answer.cdcVectorDigest,
      'only the original ordinary-stamp owner translates the request binding');
  });
