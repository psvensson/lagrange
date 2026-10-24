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
import {CDC_DELIVERY_REMAINING_MS, cdcDeliveryBudgetError, createCdcDeliveryBudget} from
  '../../src/cdc/cdc-delivery-budget.js';
import {MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE, MESSAGE_GROUP_COMMAND_TYPE} from
  '../../src/message-group/constants.js';
import {MESSAGE_GROUP_CDC_FORWARD_MODE, MESSAGE_GROUP_CDC_INGRESS_ACTION} from
  '../../src/message-group/message-group-forwarding-owner-constants.js';
import {CDC_FORWARD_MAX_RELAY_DEPTH} from
  '../../src/message-group/message-group-service-runtime-support.js';
import {GROUP_ID, NODE_ID, pump, recipientFixture} from './message-group-native-custody-fixture.js';

const KEY = 'receiver-admission-row';
const RECEIVED_BUDGET_MS = 100;
const ORDINARY_TABLE = 'c4_ordinary_rows';

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

function receive(service, event, batch, messageId, remainingMs = service.deliveryTimeoutMs,
  wrapper = {}) {
  const payload = {type: batch ?
    MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH :
    MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION,
  ...(batch ? {events: [event]} : event), targetGroupId: GROUP_ID,
  [CDC_DELIVERY_REMAINING_MS]: remainingMs, ...wrapper};
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

// Component witnesses for the corrected owner: the four race orderings between
// the waiter deadline and the forward's raw closure, shutdown, and DEFER. The
// forward answer hold is a declared controlled schedule around the real router;
// queue methods and results, native roles and receipts remain real.

const UNKNOWN_ACCEPTANCE = Object.freeze({success: false, error: CDC_COMPLETION.UNKNOWN,
  deferRetry: true});

function directWithReceivedGrant(follower, event, remainingMs) {
  // The existing receiver grant owner bounds a direct owner call the same way
  // it bounds the public receiver, so the owner's exact answer is observable.
  const budget = createCdcDeliveryBudget(follower, {receivedRemainingMs: remainingMs});
  return observe(follower.applyCDCBatch([event], {...budget}));
}

async function heldForwardFixture(t, event, {holdFollowerReplication = true} = {}) {
  const f = await recipientFixture(t, KEY);
  const follower = f.services[1];
  assert.equal(follower.raft.readStatus().role, RAFT_ROLE.FOLLOWER);
  const queue = configureOneSlot(follower);
  const hold = holdNativeForwardAnswer(f, event, follower);
  if (!holdFollowerReplication) hold.releaseNativePackets();
  return {f, follower, queue, hold, key: cdcCommitWaitIdentity([event])};
}

async function releaseHeldForward(f, hold) {
  hold.release();
  hold.releaseNativePackets();
  await pump(f);
  hold.restore();
}

test('C1 race: waiter deadline first names typed UNKNOWN while the forward keeps its slot',
  async (t) => {
    const event = sourceEvent(1);
    const {f, follower, queue, hold, key} = await heldForwardFixture(t, event);
    try {
      const pending = directWithReceivedGrant(follower, event, RECEIVED_BUDGET_MS);
      await pump(f);
      assertHeldNativeAnswer(f, hold, event);
      const admitted = queue.get(key);
      assert.ok(admitted, 'the owner admitted the occurrence before forwarding');
      assert.equal(queue.isResponsePending(key), true);
      follower.timeSource.advance(RECEIVED_BUDGET_MS);
      await pump(f);
      assert.equal(pending.settled, true, 'C1_RACE_DEADLINE_FIRST_SETTLES');
      assert.equal(pending.error, undefined, pending.error?.stack);
      assert.deepEqual(pending.answer, UNKNOWN_ACCEPTANCE, 'C1_OWNER_EXPIRY_IS_TYPED_UNKNOWN');
      assert.equal(queue.get(key), admitted, 'the raw forward retains the exact entry');
      assert.equal(queue.size, 1);
      assert.equal(queue.isResponsePending(key), false);
      assertBackpressure(await settle(f, receive(follower, sourceEvent(2), true, 'deadline-full'),
        'a new input receives its own admission decision'), 'C1_RACE_DEADLINE_FIRST_CUSTODY');
      queue.maxCapacity = 2;
      assertBackpressure(await settle(f, receive(follower, event, true, 'deadline-same-vector'),
        'the same vector while its raw-only entry is held'), 'C1_RAW_ONLY_SAME_VECTOR_REFUSED');
      queue.maxCapacity = 1;
      assert.equal(queue.get(key), admitted);
      assert.equal(hold.calls.length, 1, 'no second forward while the first is open');
      const answer = pending.answer;
      hold.release();
      await pump(f);
      assert.equal(queue.size, 0, 'the forward\'s own closure releases the slot');
      assert.equal(pending.answer, answer, 'late raw closure cannot replace the settled answer');
      hold.releaseNativePackets();
      await pump(f);
      // The same vector's successor is admitted only after the old entry
      // physically closed; it is a distinct entry with its own native receipt.
      const successor = await settle(f, receive(follower, event, true, 'deadline-successor'),
        'the same vector is admitted again after real raw closure');
      assert.equal(successor.error, undefined, successor.error?.stack);
      assert.equal(isCommittedCdcOutcome(successor.answer, [event], GROUP_ID), true);
      const occurrences = nativeEntry(f.services[0], event).entries;
      assert.equal(occurrences.length, 2, 'the successor is its own exact native occurrence');
      assert.equal(BigInt(successor.answer.cdcCommitted[0].logIndex),
        BigInt(occurrences[1].entry.index));
      assert.equal(queue.size, 0);
    } finally {
      await releaseHeldForward(f, hold);
    }
  });

test('C1 race: raw forward closes first and its committed answer settles the caller',
  async (t) => {
    const event = sourceEvent(1);
    const {f, follower, queue, hold, key} = await heldForwardFixture(t, event);
    try {
      const pending = receive(follower, event, true, 'raw-first');
      await pump(f);
      assertHeldNativeAnswer(f, hold, event);
      assert.equal(pending.settled, false);
      assert.equal(queue.isResponsePending(key), true);
      assertBackpressure(await settle(f, receive(follower, sourceEvent(2), true, 'raw-first-full'),
        'capacity refusal while the forward is held'), 'C1_RACE_RAW_FIRST_CUSTODY');
      hold.release();
      await settle(f, pending, 'released remote answer settles the waiting caller');
      assertNativeCommitted(f, event, pending);
      assert.deepEqual(pending.answer.cdcCommitted, hold.response.answer.cdcCommitted,
        'the caller receives the remote native receipt');
      assert.equal(queue.size, 0, 'raw closure plus response retirement remove the entry once');
      assert.equal(hold.calls.length, 1);
    } finally {
      await releaseHeldForward(f, hold);
    }
  });

test('C1 race: deadline between forward admission and its raw body forwards nothing',
  async (t) => {
    const event = sourceEvent(1);
    const {f, follower, queue, hold, key} = await heldForwardFixture(t, event);
    const ownOperation = queue.ownOperation;
    let interleaved = 0;
    // Controlled schedule only: the real ownOperation runs and its real raw
    // promise is returned; the creating clock then fires the waiter deadline
    // before that raw operation's first microtask.
    queue.ownOperation = function(...args) {
      const raw = Reflect.apply(ownOperation, this, args);
      interleaved += 1;
      follower.timeSource.advance(RECEIVED_BUDGET_MS);
      return raw;
    };
    try {
      const pending = directWithReceivedGrant(follower, event, RECEIVED_BUDGET_MS);
      await settle(f, pending, 'the retired caller settles without a forward');
      assert.equal(interleaved, 1, 'setup: the forward reached real queue custody once');
      assert.equal(pending.error, undefined, pending.error?.stack);
      assert.deepEqual(pending.answer, UNKNOWN_ACCEPTANCE, 'C1_RACE_INTERLEAVE_TYPED_UNKNOWN');
      assert.equal(hold.calls.length, 0, 'C1_RACE_INTERLEAVE_NO_FORWARD');
      assert.equal(queue.has(key), false, 'the released raw operation closes its entry');
      assert.equal(queue.size, 0);
      assert.equal(nativeEntry(f.services[0], event).entries.length, 0);
    } finally {
      queue.ownOperation = ownOperation;
      await releaseHeldForward(f, hold);
    }
  });

test('C1 race: follower local afterCommit first settles committed while the forward keeps its slot',
  async (t) => {
    const event = sourceEvent(1);
    const {f, follower, queue, hold, key} = await heldForwardFixture(t, event,
      {holdFollowerReplication: false});
    try {
      const pending = receive(follower, event, true, 'local-commit-first');
      await pump(f);
      assert.ok(hold.response, 'setup: the remote terminal answer is held');
      assert.equal(hold.nativePackets.length, 0, 'setup: follower replication flows');
      const local = nativeEntry(follower, event);
      assert.equal(local.entries.length, 1, 'setup: the follower applied the occurrence locally');
      assert.ok(BigInt(local.record.appliedIndex) >= BigInt(local.entries[0].entry.index));
      assert.equal(pending.settled, true, 'C1_RACE_LOCAL_COMMIT_FIRST_SETTLES');
      assert.equal(pending.error, undefined, pending.error?.stack);
      assertNativeCommitted(f, event, pending);
      assert.equal(queue.size, 1, 'C1_RACE_LOCAL_COMMIT_FIRST_RAW_CUSTODY');
      assert.ok(queue.get(key));
      assert.equal(queue.isResponsePending(key), false);
      assertBackpressure(await settle(f, receive(follower, sourceEvent(2), true, 'local-full'),
        'capacity refusal while the raw forward remains open'), 'C1_RACE_LOCAL_COMMIT_CUSTODY');
      const answer = pending.answer;
      hold.release();
      await pump(f);
      assert.equal(queue.size, 0, 'the forward\'s closure releases the slot');
      assert.equal(pending.answer, answer);
      assert.equal(hold.calls.length, 1);
    } finally {
      await releaseHeldForward(f, hold);
    }
  });

test('C1 shutdown settles the waiter UNKNOWN without awaiting the open forward', async (t) => {
  const event = sourceEvent(1);
  const {f, follower, queue, hold, key} = await heldForwardFixture(t, event);
  try {
    const pending = receive(follower, event, true, 'shutdown-open-forward');
    await pump(f);
    assertHeldNativeAnswer(f, hold, event);
    const admitted = queue.get(key);
    assert.ok(admitted);
    const stopped = observe(follower.shutdown());
    assert.equal(queue.isResponsePending(key), false, 'shutdown retires the response synchronously');
    await pump(f);
    assert.equal(stopped.settled, true, 'C1_SHUTDOWN_DOES_NOT_AWAIT_FORWARD');
    assert.equal(stopped.error, undefined, stopped.error?.stack);
    assert.equal(pending.settled, true, 'C1_SHUTDOWN_SETTLES_WAITER');
    assert.ok(pending.answer?.error === CDC_COMPLETION.UNKNOWN ||
      pending.error?.code === CDC_COMPLETION.UNKNOWN, 'shutdown is a typed retaining UNKNOWN');
    assert.equal(pending.answer?.success === true, false);
    assert.equal(queue.get(key), admitted, 'the open forward still owns its slot');
    assert.equal(queue.size, 1);
    hold.release();
    await pump(f);
    assert.equal(queue.size, 0, 'the forward\'s own settlement releases the slot');
  } finally {
    await releaseHeldForward(f, hold);
  }
});

test('C1 DEFER is decided by the committed-acceptance owner after admission', async (t) => {
  const firstEvent = sourceEvent(1);
  const {f, follower, queue, hold, key} = await heldForwardFixture(t, firstEvent);
  const deferred = sourceEvent(2);
  const exhausted = {relayDepth: CDC_FORWARD_MAX_RELAY_DEPTH};
  try {
    const decision = follower.resolveCdcIngressDecision({...deferred, ...exhausted,
      targetGroupId: GROUP_ID, events: [deferred]});
    assert.equal(decision.action, MESSAGE_GROUP_CDC_INGRESS_ACTION.DEFER,
      'setup: an exhausted relay is an owner DEFER');
    const occupied = observe(follower.applyCDCBatch([firstEvent]));
    await pump(f);
    assertHeldNativeAnswer(f, hold, firstEvent);
    assert.equal(queue.isResponsePending(key), true);
    const full = await settle(f, receive(follower, deferred, true, 'defer-full',
      follower.deliveryTimeoutMs, exhausted), 'DEFER input at capacity');
    assertBackpressure(full, 'C1_DEFER_FOLLOWS_ADMISSION');
    hold.release();
    await settle(f, occupied, 'released forward closes the occupying operation');
    assert.equal(queue.size, 0);
    const free = await settle(f, receive(follower, deferred, true, 'defer-free',
      follower.deliveryTimeoutMs, exhausted), 'DEFER input with free capacity');
    assert.equal(free.error, undefined, free.error?.stack);
    assert.equal(free.answer.success, false);
    assert.equal(free.answer.error, CDC_COMPLETION.UNKNOWN, 'C1_DEFER_IS_TYPED_UNKNOWN');
    assert.equal(free.answer.deferRetry, true);
    assert.equal(free.answer.eventCount, 1, 'reply metadata comes from the shallow wrapper');
    assert.equal(hold.calls.length, 1, 'an exhausted relay is never forwarded');
    assert.equal(nativeEntry(f.services[0], deferred).entries.length, 0);
    assert.equal(queue.size, 0, 'the deferred wait releases its entry');
    const terminal = sourceEvent(4);
    const refused = await settle(f, receive(follower, terminal, true, 'terminal-at-follower',
      follower.deliveryTimeoutMs, {cdcForwardMode: MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT}),
    'terminal native request at a follower');
    assert.equal(refused.error, undefined, refused.error?.stack);
    assert.equal(refused.answer.error, CDC_COMPLETION.UNKNOWN, 'C1_TERMINAL_AT_FOLLOWER_UNKNOWN');
    assert.equal(hold.calls.length, 1, 'a terminal request is never forwarded');
    assert.equal(queue.size, 0);
  } finally {
    await releaseHeldForward(f, hold);
  }
});

function controlledForwardAnswers(f, answers) {
  // Declared controlled transport answers for application forwards only; the
  // native replication envelopes keep the fixture's real schedule.
  const deliver = f.router.deliver;
  const calls = [];
  f.router.deliver = function(address, payload, ...options) {
    if (isRaftRsTransportEnvelope(payload)) {
      return Reflect.apply(deliver, this, [address, payload, ...options]);
    }
    const next = answers[calls.length];
    calls.push({address, payload: structuredClone(payload)});
    return next ? next() : Reflect.apply(deliver, this, [address, payload, ...options]);
  };
  return {calls, restore: () => {
    f.router.deliver = deliver;
  }};
}

function trackRawOperations(queue) {
  const ownOperation = queue.ownOperation;
  const raws = [];
  queue.ownOperation = function(...args) {
    const raw = Reflect.apply(ownOperation, this, args);
    const record = {settled: false, openAtStart: raws.filter((item) => !item.settled).length};
    raw.then(() => {
      record.settled = true;
    }, () => {
      record.settled = true;
    });
    raws.push(record);
    return raw;
  };
  return {raws, restore: () => {
    queue.ownOperation = ownOperation;
  }};
}

test('C1 forward raw resolving a deferred transport failure is UNKNOWN with no retry',
  async (t) => {
    const f = await recipientFixture(t, KEY);
    const follower = f.services[1];
    const queue = configureOneSlot(follower);
    const forward = controlledForwardAnswers(f, [() => Promise.resolve(
      f.router.buildDeferredDeliveryFailure('controlled-deferral', 'controlled-deferral',
        'controlled deferral'))]);
    try {
      const event = sourceEvent(1);
      const pending = await settle(f, receive(follower, event, true, 'deferred-forward'),
        'a resolved deferred failure settles the caller');
      assert.equal(pending.error, undefined, pending.error?.stack);
      assert.equal(pending.answer.success, false);
      assert.equal(pending.answer.error, CDC_COMPLETION.UNKNOWN, 'C1_FORWARD_DEFERRED_UNKNOWN');
      assert.ok(pending.answer.cause, 'the remote non-success answer rides as cause');
      await pump(f);
      assert.equal(forward.calls.length, 1, 'a resolved non-success answer is not retried');
      assert.equal(queue.size, 0);
      assert.equal(nativeEntry(f.services[0], event).entries.length, 0);
    } finally {
      forward.restore();
      await pump(f);
    }
  });

test('C1 forward raw rejecting retryably is retried only after its raw closed', async (t) => {
  const f = await recipientFixture(t, KEY);
  const follower = f.services[1];
  const queue = configureOneSlot(follower);
  const refusal = () => Promise.reject(Object.assign(
    new Error('controlled retryable forward refusal'), {retryable: true}));
  const forward = controlledForwardAnswers(f, [refusal]);
  const tracked = trackRawOperations(queue);
  try {
    const event = sourceEvent(1);
    const pending = receive(follower, event, true, 'retryable-forward');
    await pump(f);
    assert.equal(forward.calls.length, 1, 'setup: the first forward was refused');
    assert.equal(tracked.raws.length, 1);
    assert.equal(tracked.raws[0].settled, true, 'the refused raw closed before any retry');
    assert.equal(queue.size, 1, 'the response still owns the entry during backoff');
    for (let step = 0; step < 50 && forward.calls.length < 2; step += 1) {
      follower.timeSource.advance(10);
      await pump(f);
    }
    await settle(f, pending, 'the retried forward settles the caller');
    assertNativeCommitted(f, event, pending);
    assert.equal(forward.calls.length, 2, 'C1_FORWARD_RETRY_ONE_RETRY');
    assert.equal(tracked.raws.length, 2);
    assert.deepEqual(tracked.raws.map((raw) => raw.openAtStart), [0, 0],
      'C1_FORWARD_RETRY_NEVER_TWO_OPEN_RAWS');
    assert.equal(queue.size, 0);
  } finally {
    tracked.restore();
    forward.restore();
    await pump(f);
  }
});

test('C1 durable forwarding without an admitted wait is refused before any forward', async (t) => {
  const f = await recipientFixture(t, KEY);
  const follower = f.services[1];
  const forward = controlledForwardAnswers(f, []);
  try {
    const event = sourceEvent(1);
    for (const attempt of [
      () => follower.forwardCDCBatchToLeader([event], {targetGroupId: GROUP_ID}),
      () => follower.forwardCDCEventToLeader(event.tableName, event.operation, event.data,
        {...event, targetGroupId: GROUP_ID}),
    ]) {
      const refused = await settle(f, observe(attempt()), 'unadmitted durable forward');
      assert.equal(refused.error?.code, CDC_COMPLETION.INVALID, 'C1_E4_UNADMITTED_FORWARD_INVALID');
    }
    assert.equal(forward.calls.length, 0);
    assert.equal(follower.cdcCommitWaiters.size, 0);
    assert.equal(nativeEntry(f.services[0], event).entries.length, 0);
  } finally {
    forward.restore();
    await pump(f);
  }
});

test('C1 proposeCDCCommand refuses unpaired or absent durable route custody', async (t) => {
  const f = await recipientFixture(t, KEY);
  const leader = f.services[0];
  const event = sourceEvent(1);
  const durable = {type: MESSAGE_GROUP_COMMAND_TYPE.CDC, ...event};
  let invoked = 0;
  const hook = () => {
    invoked += 1;
    return Promise.resolve({});
  };
  for (const options of [{proposeCommand: hook}, {forwardCommand: hook}, {}]) {
    const refused = await settle(f, observe(leader.proposeCDCCommand(durable, options)),
      'unpaired custody hooks');
    assert.equal(refused.error?.code, CDC_COMPLETION.INVALID, 'C1_RC4_UNPAIRED_HOOKS_INVALID');
  }
  assert.equal(invoked, 0, 'no route attempt ran');
  assert.equal(nativeEntry(leader, event).entries.length, 0);
  const ordinary = {type: MESSAGE_GROUP_COMMAND_TYPE.CDC, tableName: event.tableName,
    operation: event.operation, data: event.data, timestamp: event.timestamp};
  const routed = await settle(f, observe(leader.proposeCDCCommand(ordinary)),
    'a non-durable command without hooks still routes');
  assert.equal(routed.error, undefined, routed.error?.stack);
});

test('C1 a committed receipt settled before its parent retired never answers success',
  async (t) => {
    const event = sourceEvent(1);
    const {f, follower, queue, hold, key} = await heldForwardFixture(t, event,
      {holdFollowerReplication: false});
    // Controlled parent grant: it retires synchronously right after the real
    // queue settles the follower's own committed afterCommit answer, before the
    // owner can rebind that receipt to this invocation.
    let retired = false;
    let committedSettlements = 0;
    const resolve = queue.resolve;
    queue.resolve = function(entryId, result) {
      const settled = Reflect.apply(resolve, this, [entryId, result]);
      if (settled && result?.success === true) {
        committedSettlements += 1;
        retired = true;
      }
      return settled;
    };
    const parent = {
      assertCurrent: () => {
        if (retired) throw cdcDeliveryBudgetError();
      },
      remainingMs: () => {
        if (retired) throw cdcDeliveryBudgetError();
        return follower.deliveryTimeoutMs;
      },
    };
    try {
      const pending = observe(follower.applyCDCBatch([event], parent));
      await pump(f);
      assert.equal(committedSettlements, 1, 'setup: local afterCommit settled the waiter committed');
      assert.ok(hold.response, 'setup: the remote terminal answer is held');
      assert.equal(pending.settled, true, 'the caller settles at its own settlement');
      assert.equal(pending.error, undefined, pending.error?.stack);
      assert.equal(pending.answer.success, false, 'C1_RC1_RETIRED_PARENT_NEVER_SUCCESS');
      assert.equal(pending.answer.error, CDC_COMPLETION.UNKNOWN, 'C1_RC1_RETIRED_PARENT_UNKNOWN');
      assert.equal(pending.answer.deferRetry, true);
      assert.equal(isCommittedCdcOutcome(pending.answer.cause, [event], GROUP_ID), true,
        'the native receipt rides only as cause');
      assert.equal(Object.hasOwn(pending.answer, 'cdcVectorDigest'), false,
        'no input-digest rebinding past the parent grant');
      assert.equal(queue.size, 1, 'the held forward keeps its slot');
      assert.equal(queue.isResponsePending(key), false);
      hold.release();
      await pump(f);
      assert.equal(queue.size, 0, 'the forward closure releases the slot once');
      assert.equal(hold.calls.length, 1);
    } finally {
      queue.resolve = resolve;
      await releaseHeldForward(f, hold);
    }
  });

test('C4 relay depth belongs to the hop: retries keep depth 1, a third hop is refused',
  async (t) => {
    const f = await recipientFixture(t, KEY);
    const follower = f.services[1];
    // Count the routing owner's attempts at its forward step (the real method
    // runs); refuse every application send of the first two attempts.
    const forwardStep = follower.forwardCDCCommandToLeader;
    let attempts = 0;
    follower.forwardCDCCommandToLeader = function(...args) {
      attempts += 1;
      return Reflect.apply(forwardStep, this, args);
    };
    const refusal = () => Promise.reject(Object.assign(
      new Error('controlled retryable forward refusal'), {retryable: true}));
    const forward = controlledForwardAnswers(f, new Proxy([], {get: (target, index) =>
      (index === 'length' ? 0 : (attempts < 3 ? refusal : undefined))}));
    // Ordinary (non-durable, non-strict) CDC: the routing owner retries a
    // thrown retryable failure of one hop. Strict system tables defer instead.
    const ordinary = {tableName: ORDINARY_TABLE, operation: CDC_OPERATION.INSERT,
      data: {row_key: KEY, row_value: 'ordinary-hop'}};
    assert.equal(follower.shouldUseStrictCDCForwarding(ordinary), false);
    try {
      const pending = observe(follower.applyCDCEvent(ordinary.tableName, ordinary.operation,
        ordinary.data, {skipSubscriptionCheck: true}));
      for (let step = 0; step < 100 && !pending.settled; step += 1) {
        follower.timeSource.advance(10);
        await pump(f);
      }
      assert.equal(pending.settled, true, 'setup: the retried hop settles');
      assert.equal(attempts, 3, 'C4_THIRD_ATTEMPT_IS_ADMITTED');
      // The leader's own system cache refuses this non-system table; that
      // answer is the third attempt's, delivered at the unchanged hop depth.
      assert.notEqual(pending.error?.code, CDC_COMPLETION.INVALID, pending.error?.stack);
      // One shared router carries every replica's sends: depth-1 sends are this
      // follower's first hop (at least one per attempt); a depth-2 send is
      // another replica relaying that hop onward.
      const firstHop = forward.calls.filter((call) => call.payload.relayDepth === 1);
      assert.ok(firstHop.length >= 3, 'C4_RETRIES_OF_ONE_HOP_KEEP_ITS_DEPTH');
      assert.ok(forward.calls.every((call) => call.payload.relayDepth === 1 ||
        call.payload.relayDepth === CDC_FORWARD_MAX_RELAY_DEPTH),
      'no send exceeds the next hop of the one it continues');
      const sent = forward.calls.length;
      const relayed = observe(follower.applyCDCEvent(ordinary.tableName, ordinary.operation,
        {...ordinary.data, row_value: 'third-hop'},
        {skipSubscriptionCheck: true, relayDepth: CDC_FORWARD_MAX_RELAY_DEPTH}));
      await settle(f, relayed, 'a genuine third hop settles');
      assert.equal(relayed.error?.code, CDC_COMPLETION.INVALID, 'C4_THIRD_HOP_REFUSED');
      assert.equal(forward.calls.length, sent, 'the refused third hop never reaches the transport');
    } finally {
      follower.forwardCDCCommandToLeader = forwardStep;
      forward.restore();
      await pump(f);
    }
  });
