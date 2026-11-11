// Source-lane component fixture shared by the delivery-progress and
// range-shipping witnesses: the real application, ledger, subscription and
// acknowledgement owners on the controllable consensus fixture, with
// explicitly controlled recipient answers. A recipient is called once per
// shipped vector (the durable subscriber contract); `f.calls` records each
// call with the ids of the vector it carried. Controlled answers are semantic
// input to the source, never native acceptance evidence.
import assert from 'node:assert/strict';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {buildCommittedCdcOutcome, buildProvisionalCdcOutcome, cdcCommitWaitIdentity} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_COMMAND, PARTITION_CDC_OBLIGATION_REASON,
  PARTITION_CDC_OBLIGATION_SQL} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {PARTITION_SERVICE_CDC} from '../../src/partition/partition-service-constants.js';
import {preparedStatementOf} from '../../src/storage/sqlite-prepared-statement-owner.js';
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

// An explicit drive stands for the lane's own retry timer: the observed clock
// reaches every recipient's backoff due time (no timer callback runs), so a
// held recipient is driven as its retry would drive it. A wake by a commit
// (addSourceRow) moves no time: a recipient in backoff is not shipped to.
function elapseRecipientBackoff(leader, clock) {
  const due = leader.cdcDelivery.getCdcObligationDiagnostics().recipients
    .map((recipient) => recipient.retryDueAtMs).filter(Number.isFinite);
  const latest = Math.max(clock.now(), ...due);
  if (latest > clock.now()) clock.elapseWithoutCallbacks(latest - clock.now());
}

// The same on a source whose clock runs by itself (a wall clock): wait, on
// that clock, until every recipient's backoff is due. A witness that drives
// the lane explicitly calls this first, as the lane's retry timer would.
async function awaitRecipientBackoff(leader) {
  const due = leader.cdcDelivery.getCdcObligationDiagnostics().recipients
    .map((recipient) => recipient.retryDueAtMs).filter(Number.isFinite);
  const waitMs = Math.max(0, ...due) - leader.timeSource.now();
  if (waitMs > 0) await new Promise((resolve) => leader.timeSource.setTimeout(resolve, waitMs));
}

function driveAfterBackoff(leader, clock) {
  elapseRecipientBackoff(leader, clock);
  return leader.cdcDelivery.driveCdcObligations(REASON.DELIVERY_RETRY);
}

function recipientAnswer(events, groupId, committed) {
  return committed ? buildCommittedCdcOutcome(events, groupId, {index: 17, term: 2}) :
    buildProvisionalCdcOutcome(events, RETRY_AFTER_MS, groupId);
}

// One committed source row; `value` sets the size of its event body.
function addSourceRow(leader, id, value = PAYLOAD_SENTINEL) {
  const command = committedQueryOf(`progress-${id}`,
    `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`);
  command.params = [id, value];
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
    propagatePartitionCDCEvent: async (_selected, events, context) => {
      assert.equal(f.leader.db.inTransaction, false,
        'no SQLite transaction spans the recipient await');
      const ids = events.map((event) => event.data.id);
      f.calls.push({index, id: ids[0], ids, eventKey: events[0].eventKey,
        eventKeys: events.map((event) => event.eventKey),
        digest: cdcCommitWaitIdentity(events),
        timestamp: events[0].timestamp, remainingMs: context.remainingMs()});
      return f.behavior(index, events, context, service.groupId);
    },
    afterPropagation: (events) => {
      for (const event of events) f.hooks.push({index, id: event.data.id});
    },
  });
  f.subscribers.push(subscriber);
  // The first is the partition's one propagation subscriber (the production
  // composition); further ones are role-less.
  return f.leader.subscribeToCDCWithHandshake(subscriber,
    {subscriberId: `progress-subscriber-${index}`,
      ...(index === 0 ? {role: PARTITION_SERVICE_CDC.SUBSCRIBER_ROLE_PROPAGATION} : {})});
}

// rows: ids, or {id, value} to size a row's event body.
async function fixture(t, {rows = ['A', 'B'], subscribers = 3} = {}) {
  const clock = delayedClock();
  // The source partition holds a CDC-carrying table (decision D2: only a
  // propagated table records an obligation).
  const {leader, proposed} = await startLeader({tableName: TABLE, timeSource: clock});
  t.after(() => shutdownAll(leader));
  leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  const f = {clock, leader, proposed, ready: false, calls: [], hooks: [], subscribers: [],
    behavior: (_index, events, _context, groupId) => recipientAnswer(events, groupId, false),
    acks: () => proposed.filter((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED),
    drive: () => driveAfterBackoff(leader, clock),
  };
  for (let index = 0; index < subscribers; index += 1) await addSubscriber(f, index);
  for (const row of rows) {
    if (typeof row === 'string') addSourceRow(leader, row);
    else addSourceRow(leader, row.id, row.value);
  }
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  assert.deepEqual(countCdcObligations(leader.db), {owed: rows.length, delivered: 0});
  assert.equal(f.calls.length, 0, 'readiness held all recipient callbacks during setup');
  f.ready = true;
  return f;
}

// Every ledger page read the lane makes, with its limit and row count: read
// at the handle's own owed-page statement, the one the ledger reads through.
function observeOwedReads(leader) {
  const statement = preparedStatementOf(leader.db,
    PARTITION_CDC_OBLIGATION_SQL.SELECT_OWED_AFTER);
  const all = statement.all;
  const reads = [];
  statement.all = function(options) {
    const result = all.call(this, options);
    reads.push({limit: options.limit, count: result.length});
    return result;
  };
  return {reads, restore: () => {
    statement.all = all;
  }};
}

// The controllable port commits nothing by itself: flush the open batch and
// commit every CDC_DELIVERED the lane proposed and this fixture has not yet
// committed, until the lane proposes no more.
async function commitAcknowledgements(f) {
  f.committedAcks ??= new Set();
  const flush = f.leader.cdcDelivery.flushCdcAcknowledgements(REASON.FLUSH_DEADLINE);
  for (;;) {
    await settleTicks();
    const uncommitted = f.acks().filter((ack) => !f.committedAcks.has(ack.entryId));
    if (uncommitted.length === 0) break;
    for (const ack of uncommitted) {
      f.committedAcks.add(ack.entryId);
      assert.equal(applyCommitted(f.leader, ack), null, 'the committed CDC_DELIVERED applied');
    }
  }
  await flush;
}

// Seed hydration: the cache image at applied index P holds every row at or
// below the given one, so their obligations are acknowledged without delivery.
function hydrateThroughRow(f, rowNumber) {
  const position = f.leader.db.prepare(
    PARTITION_CDC_OBLIGATION_SQL.SELECT_ALL).all()[rowNumber - 1];
  const appliedIndex = Number(position.log_index);
  f.leader.cdcDelivery.acknowledgeHydratedObligationsThrough(appliedIndex);
  return appliedIndex;
}

export {
  PAYLOAD_SENTINEL,
  addSourceRow,
  awaitRecipientBackoff,
  commitAcknowledgements,
  delayedClock,
  driveAfterBackoff,
  elapseRecipientBackoff,
  fixture,
  hydrateThroughRow,
  observeOwedReads,
  recipientAnswer,
};
