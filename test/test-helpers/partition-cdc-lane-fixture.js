// The one source-owner component fixture of the partition CDC obligation lane:
// the existing controllable consensus fixture with explicitly controlled
// recipient answers. It exercises the real application/ledger/subscription/ACK
// owners; it does not prove native MG commit.
import assert from 'node:assert/strict';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {buildCommittedCdcOutcome, buildProvisionalCdcOutcome} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_COMMAND, PARTITION_CDC_OBLIGATION_REASON} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {CDC_TABLE as TABLE, applyCommitted, committedQueryOf, settleTicks, shutdownAll,
  startLeader} from './participant-transaction-fixture.js';

const REASON = PARTITION_CDC_OBLIGATION_REASON;
const RETRY_AFTER_MS = 20;
const PAYLOAD_SENTINEL = 'source-body-must-not-reside-in-progress';

function delayedClock() {
  const observed = new VirtualTimeSource({startMs: 100});
  const scheduled = new VirtualTimeSource({startMs: 100});
  const delayFromScheduler = (delay) => observed.now() - scheduled.now() + delay;
  return {
    now: () => observed.now(),
    setTimeout: (callback, delay, ...args) =>
      scheduled.setTimeout(callback, delayFromScheduler(delay), ...args),
    clearTimeout: (handle) => scheduled.clearTimeout(handle),
    setInterval: (callback, delay, ...args) => scheduled.setInterval(callback, delay, ...args),
    clearInterval: (handle) => scheduled.clearInterval(handle),
    elapseWithoutCallbacks: (milliseconds) => observed.advance(milliseconds),
    advance: (milliseconds) => {
      observed.advance(milliseconds);
      scheduled.advance(milliseconds);
    },
  };
}

function recipientAnswer(event, groupId, committed) {
  // Controlled semantic input to the source, never native acceptance evidence.
  return committed ? buildCommittedCdcOutcome([event], groupId, {index: 17, term: 2}) :
    buildProvisionalCdcOutcome([event], RETRY_AFTER_MS, groupId);
}

function addSourceRow(leader, id) {
  const command = committedQueryOf(`progress-${id}`,
    `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`);
  command.params = [id, PAYLOAD_SENTINEL];
  command.timestamp = new HLCTimestamp(1000, 0, 'source-progress-component').toString();
  assert.equal(applyCommitted(leader, command), null,
    'the real application owner accepted the controlled committed QUERY');
}

function addSubscriber(f, index) {
  const service = {groupId: `component-recipient-${index}`,
    canAcceptCDCEvent: () => f.ready};
  const selection = () => ({ready: f.ready, service});
  const subscriber = buildPartitionCdcPropagationSubscriber({
    tableName: TABLE,
    resolveOperationalMessageGroupSelection: selection,
    resolveOperationalMessageGroupSelectionAsync: async () => selection(),
    buildMessageGroupOwnerNotReadyError: () => Object.assign(new Error('controlled readiness'),
      {retryAfterMs: RETRY_AFTER_MS}),
    propagatePartitionCDCEvent: async (_selected, event, context) => {
      assert.equal(f.leader.db.inTransaction, false,
        'no SQLite transaction spans the recipient await');
      f.calls.push({index, id: event.data.id, eventKey: event.eventKey,
        timestamp: event.timestamp, remainingMs: context.remainingMs()});
      return f.behavior(index, event, context, service.groupId);
    },
    afterPropagation: (event) => f.hooks.push({index, id: event.data.id}),
  });
  f.subscribers.push(subscriber);
  return f.leader.subscribeToCDCWithHandshake(subscriber,
    {subscriberId: `progress-subscriber-${index}`});
}

async function fixture(t, {rows = ['A', 'B'], subscribers = 3} = {}) {
  const clock = delayedClock();
  // The source partition holds a CDC-carrying table (decision D2: only a
  // propagated table records an obligation).
  const {leader, proposed} = await startLeader({tableName: TABLE, timeSource: clock});
  t.after(() => shutdownAll(leader));
  leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  const f = {clock, leader, proposed, ready: false, calls: [], hooks: [], subscribers: [],
    behavior: (_index, event, _context, groupId) => recipientAnswer(event, groupId, false),
    acks: () => proposed.filter((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED),
    drive: () => leader.cdcDelivery.driveCdcObligations(REASON.DELIVERY_RETRY),
  };
  for (let index = 0; index < subscribers; index += 1) await addSubscriber(f, index);
  for (const id of rows) addSourceRow(leader, id);
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  assert.deepEqual(countCdcObligations(leader.db), {owed: rows.length, delivered: 0});
  assert.equal(f.calls.length, 0, 'readiness held all recipient callbacks during setup');
  f.ready = true;
  return f;
}

function assertOwedWithoutAck(f, owed) {
  assert.deepEqual(countCdcObligations(f.leader.db), {owed, delivered: 0});
  assert.equal(f.acks().length, 0);
  assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 0);
}

export {PAYLOAD_SENTINEL, RETRY_AFTER_MS, addSourceRow, assertOwedWithoutAck, fixture,
  recipientAnswer};
