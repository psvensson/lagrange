// Real RF1/RF3 source-range admission controls. The earlier mixed-vector
// normalizer witness is preserved at 57e396; it invented a tail position for
// an ordinary member. Ranged input now admits canonical ledger members only.
// Ordinary CDC remains its explicit unpositioned domain. These are synthetic
// producer-shaped vectors; native-custody handoff owns real SQL/ledger proof.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {isRaftRsTransportEnvelope} from '../../src/raft/raft-packet-utils.js';
import {CDC_COMPLETION, cdcCommitWaitIdentity, isCommittedCdcOutcome} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {MESSAGE_GROUP_CDC_FORWARD_MODE} from
  '../../src/message-group/message-group-forwarding-owner-constants.js';
import {GROUP_ID, NODE_ID, pump, recipientFixture as nativeRecipientFixture} from
  './message-group-native-custody-fixture.js';
import {positionRecipients, withSourceRange} from '../test-helpers/cdc-source-range-fixture.js';


const SOURCE_PARTITION = INITIAL_PARTITION_IDS[TABLES.CONFIG];

// CDC Stage 3: every recipient node starts from a known position of the
// synthetic source (a list of it at its start), and every durable vector
// travels with its source range.
async function recipientFixture(...args) {
  const f = await nativeRecipientFixture(...args);
  positionRecipients(f.services, SOURCE_PARTITION, TABLES.CONFIG);
  return f;
}

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
    data: {config_key: 'mixed-durable', config_value: 'durable-body', updated_at_hlc: stamp},
    timestamp: stamp,
    sourcePartition: SOURCE_PARTITION, sourceReplica: `${SOURCE_PARTITION}-r1`,
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
  assert.fail('a successful durable receipt must name an actual retained native command');
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
      call.answer = structuredClone(answer.answer);
      return answer;
    });
  };
  return calls;
}

async function measuredApply(f, service, events, options) {
  let settled = false;
  let result;
  let failure;
  const operation = service.applyCDCBatch(events, options).then((answer) => {
    result = answer;
    settled = true;
  }, (error) => {
    failure = error;
    settled = true;
  });
  await pump(f);
  assert.equal(settled, true, 'the finite native packet schedule completes delivery');
  await operation;
  assert.equal(failure, undefined, failure?.stack);
  return result;
}

function assertNativeResult(f, events, answer) {
  assert.equal(isCommittedCdcOutcome(answer, events, GROUP_ID), true);
  assert.equal(answer.cdcVectorDigest, cdcCommitWaitIdentity(events));
  const receipt = answer.cdcCommitted[0];
  assert.equal(answer.cdcCommitted.length, events.length);
  const retained = nativeCommand(f.services[0], events[0].eventKey);
  assert.deepEqual(retained.command.events, events, 'canonical ledger bytes are never restamped');
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
  test(`RF1 refuses mixed source range before proposal, ordinary stamp assigned=${assigned}`,
    async (t) => {
      const f = await recipientFixture(t, 'mixed-durable', {replicaCount: 1});
      const service = f.services[0];
      const events = mixedInput(assigned);
      const expected = structuredClone(events);
      const before = RaftRsDurableStore.readDurableRecordIn(service.db, GROUP_ID);
      await assert.rejects(service.applyCDCBatch(events, withSourceRange([events[0]])),
        {code: CDC_COMPLETION.INVALID});
      const after = RaftRsDurableStore.readDurableRecordIn(service.db, GROUP_ID);
      assert.deepEqual(after, before, 'malformed vector did not propose or mutate native history');
      assert.deepEqual(events, expected, 'refusal does not normalize caller bytes');
      for (const event of events) assert.equal(service.systemTableCache.has(TABLES.CONFIG,
        event.data.config_key), false);
      const durable = [events[0]];
      const answer = await measuredApply(f, service, durable, withSourceRange(durable));
      assertNativeResult(f, durable, answer);
      // Ordinary ingress intentionally invalidates source currency, so it
      // follows the positive ranged receipt in this independent-domain control.
      const ordinary = [events[1]];
      await measuredApply(f, service, ordinary, {skipReplication: true});
      assert.equal(service.systemTableCache.get(TABLES.CONFIG,
        ordinary[0].data.config_key).config_value, 'ordinary-body',
      'the ordinary unpositioned domain is still usable on its own');
    });
}

test('RF3 follower refuses mixed input and forwards an exact valid ledger vector to its native leader',
  async (t) => {
    const f = await recipientFixture(t, 'mixed-durable');
    const follower = f.services[1];
    assert.equal(follower.raft.readStatus().role, RAFT_ROLE.FOLLOWER);
    const applications = observeApplicationTransport(f);
    const mixed = mixedInput(false);
    await assert.rejects(follower.applyCDCBatch(mixed, withSourceRange([mixed[0]])),
      {code: CDC_COMPLETION.INVALID});
    assert.equal(applications.length, 0, 'malformed source membership is refused before forwarding');
    const first = mixed[0];
    const events = [first, {...first, eventKey: 'mixed-native-write-2', entryId: 'mixed-native-write-2',
      sourceLogIndex: 20, data: {...first.data, config_key: 'second-ledger-key'}}];
    const expected = structuredClone(events);
    const answer = await measuredApply(f, follower, events, withSourceRange(events));
    assert.deepEqual(events, expected);
    const native = assertNativeResult(f, expected, answer);
    const terminal = applications.find((call) =>
      call.payload.cdcForwardMode === MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT);
    assert.ok(terminal, 'the existing transport carries the actual terminal native request');
    assert.equal(terminal.address, f.services[0].unifiedAddress);
    assert.equal(terminal.payload.targetGroupId, GROUP_ID);
    assert.deepEqual(terminal.payload.events, native);
    assert.equal(isCommittedCdcOutcome(terminal.answer, native, GROUP_ID), true);
    assert.equal(answer.cdcVectorDigest, terminal.answer.cdcVectorDigest,
      'every hop binds the same source ledger vector');
  });
