// Real RF3 receiver/admission witnesses. The durable occurrences are test
// inputs, not source SQL/ledger/ACK proof. Native append, commit, application,
// public receiveMessage and the existing bounded ProposalQueue remain real.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {CDC_EVENT_IDENTITY} from '../../src/constants/cdc-lifecycle-constants.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {isRaftRsTransportEnvelope} from '../../src/raft/raft-packet-utils.js';
import {CDC_COMPLETION, cdcCommitWaitIdentity, isCommittedCdcOutcome} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {CDC_DELIVERY_REMAINING_MS} from '../../src/cdc/cdc-delivery-budget.js';
import {MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE} from '../../src/message-group/constants.js';
import {MESSAGE_GROUP_CDC_FORWARD_MODE} from
  '../../src/message-group/message-group-forwarding-owner-constants.js';
import {GROUP_ID, NODE_ID, pump, recipientFixture} from './message-group-native-custody-fixture.js';

const KEY = 'receiver-admission-row';
const RECEIVED_BUDGET_MS = 100;

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

function sourceEvent(index) {
  return {tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
    data: {config_key: KEY, config_value: `receiver-body-${index}`},
    timestamp: new HLCTimestamp(1000 + index, 0, 'receiver-source').toString(),
    sourcePartition: 'receiver-source', sourceReplica: 'receiver-source-r1',
    eventKey: `receiver-occurrence-${index}`, entryId: `receiver-occurrence-${index}`,
    sourceLogIndex: index + 10, sourceOrdinal: 0};
}

function observe(operation) {
  const result = {settled: false, answer: undefined, error: undefined};
  result.completion = Promise.resolve(operation).then((answer) => {
    result.answer = answer;
    result.settled = true;
  }, (error) => {
    result.error = error;
    result.settled = true;
  });
  return result;
}

function receive(service, event, batch, messageId, remainingMs = service.deliveryTimeoutMs) {
  const payload = {type: batch ?
    MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH :
    MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION,
  ...(batch ? {events: [event]} : event), targetGroupId: GROUP_ID,
  [CDC_DELIVERY_REMAINING_MS]: remainingMs};
  return observe(service.receiveMessage({messageId, payload}));
}

async function settle(f, observed, reason) {
  await pump(f);
  assert.equal(observed.settled, true, reason);
  await observed.completion;
  return observed;
}

function nativeEntry(service, event) {
  const record = RaftRsDurableStore.readDurableRecordIn(service.db, GROUP_ID);
  const entries = record.entries.flatMap((entry) => {
    if (!entry.data) return [];
    const command = JSON.parse(Buffer.from(entry.data, 'base64').toString());
    const members = command.events ?? [command];
    const member = members.find((item) => item.eventKey === event.eventKey);
    return member ? [{entry, member}] : [];
  });
  return {record, entries};
}

function assertNativeCommitted(f, event, observed, {checkCurrentRow = true} = {}) {
  assert.equal(observed.error, undefined, observed.error?.stack);
  assert.equal(isCommittedCdcOutcome(observed.answer, [event], GROUP_ID), true);
  const {record, entries} = nativeEntry(f.services[0], event);
  assert.equal(entries.length, 1, 'exact occurrence entered actual native history once');
  const {entry, member} = entries[0];
  for (const [field, value] of Object.entries(event)) {
    assert.deepEqual(member[field], value, `native command preserves ${field}`);
  }
  const [receipt] = observed.answer.cdcCommitted;
  assert.equal(BigInt(receipt.logIndex), BigInt(entry.index));
  assert.equal(BigInt(receipt.term), BigInt(entry.term));
  assert.ok(BigInt(record.hardState.commit) >= BigInt(entry.index));
  assert.ok(BigInt(record.appliedIndex) >= BigInt(entry.index));
  if (checkCurrentRow) {
    assert.equal(f.services[0].systemTableCache.get(TABLES.CONFIG, KEY).config_value,
      event.data.config_value);
  }
}

function assertBackpressure(observed, marker) {
  assert.equal(observed.error, undefined, `${marker}: ${observed.error?.stack ?? ''}`);
  assert.equal(observed.answer?.success, false, marker);
  assert.equal(observed.answer?.error, CDC_COMPLETION.BACKPRESSURE, marker);
  assert.equal(observed.answer?.deferRetry, true, marker);
}

function configureOneSlot(service) {
  // Configure the real queue's existing capacity; no queue method/result is
  // substituted. Each occupied slot below is installed by actual CDC work.
  assert.equal(service.cdcCommitWaiters.size, 0);
  service.cdcCommitWaiters.maxCapacity = 1;
  return service.cdcCommitWaiters;
}

function releaseNativePackets(f) {
  f.holdEntries = false;
  f.queue.push(...f.held.splice(0));
}

async function occupyNativeSlot(f, service, event) {
  f.holdEntries = true;
  const pending = observe(service.applyCDCBatch([event]));
  await pump(f);
  assert.equal(pending.settled, false, 'actual native quorum remains held');
  const retained = nativeEntry(service, event);
  assert.equal(retained.entries.length, 1, 'capacity is occupied by a real native append');
  const index = BigInt(retained.entries[0].entry.index);
  assert.ok(BigInt(retained.record.hardState.commit) < index);
  assert.ok(BigInt(retained.record.appliedIndex) < index);
  assert.ok(f.held.length > 0, 'the fixture held actual native replication envelopes');
  assert.equal(service.cdcCommitWaiters.isFull, true);
  return pending;
}

for (const batch of [false, true]) {
  test(`public ${batch ? 'batch' : 'single'} CDC receiver reserves the existing queue before capture`,
    async (t) => {
      const f = await recipientFixture(t, KEY);
      const leader = f.services[0];
      assert.equal(leader.raft.readStatus().role, RAFT_ROLE.LEADER);
      const queue = configureOneSlot(leader);
      const occupiedEvent = sourceEvent(1);
      try {
        const occupied = await occupyNativeSlot(f, leader, occupiedEvent);
        const key = cdcCommitWaitIdentity([occupiedEvent]);
        const entry = queue.get(key);
        assert.ok(entry, 'the existing queue retains the admitted native occurrence');
        const invalid = sourceEvent(2);
        invalid.data.nested = {captureTripwire: Symbol('requires-deep-capture')};
        const pressured = await settle(f,
          receive(leader, invalid, batch, `full-${batch}`),
          'public capacity refusal settles without waiting for held native work');
        assert.equal(queue.get(key), entry, 'refused input cannot replace the occupied entry');
        assert.equal(queue.size, 1);
        assert.equal(nativeEntry(leader, invalid).entries.length, 0);
        releaseNativePackets(f);
        await settle(f, occupied, 'released real quorum settles the original operation');
        assertNativeCommitted(f, occupiedEvent, occupied);
        assert.equal(queue.size, 0);
        const free = await settle(f, receive(leader, invalid, batch, `free-${batch}`),
          'free-capacity invalid input reaches the real deep capture guard');
        assert.ok(free.error?.code === CDC_EVENT_IDENTITY.INVALID_CODE ||
          free.error?.code === CDC_COMPLETION.INVALID, free.error?.stack);
        assert.equal(free.answer, undefined);
        assert.equal(queue.size, 0, 'failed deep capture releases its admission reservation');
        const valid = sourceEvent(3);
        const accepted = await settle(f, receive(leader, valid, batch, `valid-${batch}`),
          'restored input completes through public receipt and actual native application');
        assertNativeCommitted(f, valid, accepted);
        assertBackpressure(pressured,
          `C1_PUBLIC_${batch ? 'BATCH' : 'SINGLE'}_CAPACITY_PRECEDES_DEEP_CAPTURE`);
      } finally {
        releaseNativePackets(f);
        await pump(f);
      }
    });
}

function holdNativeForwardAnswer(f, event, follower) {
  const deliver = f.router.deliver;
  const release = Promise.withResolvers();
  const calls = [];
  const nativePackets = [];
  let holdReplication = true;
  const hold = {calls, nativePackets, follower, response: null, release: release.resolve,
    releaseNativePackets: () => {
      holdReplication = false;
      f.queue.push(...nativePackets.splice(0));
    },
    restore: () => {
      f.router.deliver = deliver;
    }};
  f.router.deliver = function(address, payload, ...options) {
    if (isRaftRsTransportEnvelope(payload)) {
      const before = f.queue.length;
      const answer = Reflect.apply(deliver, this, [address, payload, ...options]);
      if (holdReplication && address === follower.unifiedAddress) {
        // Keep the fixture's genuine custody answer and scheduled envelope.
        // The leader and third voter commit while this follower cannot obtain
        // a local afterCommit receipt that would settle the forwarding waiter.
        const scheduled = f.queue.splice(before);
        assert.equal(scheduled.length, 1, 'the native fixture scheduled one actual envelope');
        nativePackets.push(...scheduled);
      }
      return answer;
    }
    const call = {address, payload: structuredClone(payload), answer: null};
    calls.push(call);
    return Reflect.apply(deliver, this, [address, payload, ...options]).then(async (answer) => {
      call.answer = answer;
      const members = payload.events ?? [payload];
      if (payload.cdcForwardMode === MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT &&
          members.some((member) => member.eventKey === event.eventKey)) {
        assert.equal(hold.response, null, 'only the first actual forwarding operation is held');
        hold.response = call;
        await release.promise;
      }
      return answer;
    });
  };
  return hold;
}

function assertHeldNativeAnswer(f, hold, event) {
  assert.ok(hold.response, 'setup: an actual native terminal response reached the hold');
  assert.equal(hold.response.address, f.services[0].unifiedAddress);
  assert.equal(hold.response.payload.targetGroupId, GROUP_ID);
  assert.equal(hold.response.payload.cdcForwardMode, MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT);
  assertNativeCommitted(f, event, {answer: hold.response.answer});
  assert.ok(hold.nativePackets.length > 0, 'setup: replication to the addressed follower is held');
  assert.ok(hold.nativePackets.every((packet) => packet.address === hold.follower.unifiedAddress));
  const follower = nativeEntry(hold.follower, event);
  const committedIndex = BigInt(hold.response.answer.cdcCommitted[0].logIndex);
  assert.equal(follower.entries.length, 0, 'the addressed follower has no local receipt occurrence');
  assert.ok(BigInt(follower.record.hardState.commit) < committedIndex);
  assert.ok(BigInt(follower.record.appliedIndex) < committedIndex);
}

test('public follower CDC receiver cannot bypass occupied ProposalQueue admission', async (t) => {
  const f = await recipientFixture(t, KEY);
  const follower = f.services[1];
  assert.equal(follower.raft.readStatus().role, RAFT_ROLE.FOLLOWER);
  const queue = configureOneSlot(follower);
  const firstEvent = sourceEvent(1);
  const hold = holdNativeForwardAnswer(f, firstEvent, follower);
  try {
    const occupied = observe(follower.applyCDCBatch([firstEvent]));
    await pump(f);
    assertHeldNativeAnswer(f, hold, firstEvent);
    assert.equal(occupied.settled, false);
    assert.equal(queue.isFull, true, 'admitted forwarding owns the existing queue slot');
    const key = cdcCommitWaitIdentity([firstEvent]);
    const entry = queue.get(key);
    assert.ok(entry);
    assert.equal(queue.isResponsePending(key), true);
    assert.equal(hold.calls.length, 1);
    const nextEvent = sourceEvent(2);
    const pressured = await settle(f, receive(follower, nextEvent, true, 'follower-full'),
      'public follower capacity decision settles while first raw result remains held');
    const forwardsAtCapacity = hold.calls.length;
    const nativeAtCapacity = nativeEntry(f.services[0], nextEvent).entries.length;
    assert.equal(queue.get(key), entry);
    hold.release();
    await settle(f, occupied, 'released real terminal response closes original forwarding');
    // The predecessor may already have applied the forbidden second write.
    // The hold above checked this first occurrence's actual cache application.
    assertNativeCommitted(f, firstEvent, occupied, {checkCurrentRow: false});
    assert.equal(queue.size, 0);
    hold.releaseNativePackets();
    await pump(f);
    const freshEvent = sourceEvent(3);
    const fresh = await settle(f, receive(follower, freshEvent, true, 'follower-fresh'),
      'fresh public follower admission succeeds after real raw closure');
    assertNativeCommitted(f, freshEvent, fresh);
    assert.equal(forwardsAtCapacity, 1, 'C1_PUBLIC_FOLLOWER_CAPACITY_PREVENTS_SECOND_FORWARD');
    assert.equal(nativeAtCapacity, 0, 'refused input never enters the recipient native log');
    assertBackpressure(pressured, 'C1_PUBLIC_FOLLOWER_USES_EXISTING_QUEUE');
  } finally {
    hold.release();
    hold.releaseNativePackets();
    await pump(f);
    hold.restore();
  }
});

test('public follower CDC deadline retires response while raw forwarding retains its queue slot',
  async (t) => {
    const f = await recipientFixture(t, KEY);
    const follower = f.services[1];
    assert.equal(follower.raft.readStatus().role, RAFT_ROLE.FOLLOWER);
    const queue = configureOneSlot(follower);
    const event = sourceEvent(1);
    const key = cdcCommitWaitIdentity([event]);
    const hold = holdNativeForwardAnswer(f, event, follower);
    try {
      const pending = receive(follower, event, true, 'expiring-public-follower', RECEIVED_BUDGET_MS);
      await pump(f);
      assertHeldNativeAnswer(f, hold, event);
      assert.equal(pending.settled, false, 'raw transport fulfillment remains held before expiry');
      const admittedEntry = queue.get(key);
      // Only this recipient's actual creating clock advances. The grant is
      // shorter than its native election minimum; no role is manufactured.
      follower.timeSource.advance(RECEIVED_BUDGET_MS);
      await pump(f);
      const expired = {settled: pending.settled, answer: pending.answer, error: pending.error};
      const custody = {entry: queue.get(key), size: queue.size,
        responsePending: queue.isResponsePending(key)};
      const retry = await settle(f, receive(follower, sourceEvent(2), true, 'expired-still-owned'),
        'a new public invocation receives its own finite admission decision');
      const forwardsWhileHeld = hold.calls.length;
      hold.release();
      await settle(f, pending, 'the original raw response physically closes after release');
      assert.equal(queue.size, 0, 'real raw closure releases the original queue slot');
      hold.releaseNativePackets();
      await pump(f);
      const freshEvent = sourceEvent(3);
      const fresh = await settle(f, receive(follower, freshEvent, true, 'after-raw-close'),
        'fresh public input succeeds once original custody has really closed');
      assertNativeCommitted(f, freshEvent, fresh);
      assert.equal(expired.settled, true, 'C1_PUBLIC_FORWARD_DEADLINE_SETTLES_BEFORE_RAW_CLOSE');
      assert.ok(expired.answer?.error === CDC_COMPLETION.UNKNOWN ||
        expired.error?.code === CDC_COMPLETION.UNKNOWN, 'expiry is a typed retaining UNKNOWN');
      assert.ok(admittedEntry, 'public forwarding reserved the existing semantic waiter');
      assert.equal(custody.entry, admittedEntry, 'expiry retains the same exact queue entry');
      assert.equal(custody.size, 1, 'raw work remains charged after response retirement');
      assert.equal(custody.responsePending, false, 'caller response and raw custody are distinct');
      assert.equal(forwardsWhileHeld, 1, 'expired raw custody prevents overlapping forwarding');
      assertBackpressure(retry, 'C1_EXPIRED_RAW_CUSTODY_REMAINS_BACKPRESSURED');
      assert.equal(pending.answer, expired.answer, 'late raw closure cannot replace the old answer');
      assert.equal(pending.error, expired.error, 'late raw closure cannot replace the old refusal');
    } finally {
      hold.release();
      hold.releaseNativePackets();
      await pump(f);
      hold.restore();
    }
  });
