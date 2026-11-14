// The one source-owner component fixture of the partition CDC obligation lane:
// the existing controllable consensus fixture with explicitly controlled
// recipient answers. It exercises the real application/ledger/subscription/ACK
// owners; it does not prove native MG commit. Its subscribers follow the one
// subscriber contract: each call is handed an ordered vector of events.
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
import {CDC_TABLE as TABLE, applyCommitted, commitDecision, committedQueryOf, generationOf,
  identityOf, operationOf, prepareCommandOf, settleTicks, shutdownAll, startLeader} from
  './participant-transaction-fixture.js';

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

function recipientAnswer(events, groupId, committed) {
  // Controlled semantic input to the source, never native acceptance evidence.
  return committed ? buildCommittedCdcOutcome(events, groupId, {index: 17, term: 2}) :
    buildProvisionalCdcOutcome(events, RETRY_AFTER_MS, groupId);
}

// One committed source statement through the real application owner.
function commitSourceStatement(leader, {entryId, sql, params, wallMs = 1000}) {
  const command = committedQueryOf(entryId, sql);
  command.params = params;
  command.timestamp = new HLCTimestamp(wallMs, 0, 'source-progress-component').toString();
  assert.equal(applyCommitted(leader, command), null,
    'the real application owner accepted the controlled committed QUERY');
}

function addSourceRow(leader, id, value = PAYLOAD_SENTINEL) {
  commitSourceStatement(leader, {entryId: `progress-${id}`,
    sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`, params: [id, value]});
}

// One committed transaction decision of several operations through the real
// application owner: one ledger entry (one log index) owing one event per
// operation, ordinals 0..n-1. `operations` are {sql, params} statements on the
// fixture table; `tag` names the transaction.
function addSourceEntry(leader, tag, operations, wallMs = 1000) {
  const tx = identityOf(tag);
  const prepare = prepareCommandOf(tx, operations.map((operation, ordinal) =>
    operationOf({}, {entryId: `${tag}-op-${ordinal}`, ...operation})), generationOf(leader));
  assert.equal(applyCommitted(leader, prepare), null,
    'the real application owner accepted the controlled PREPARE');
  const decision = {...commitDecision(tx, prepare),
    timestamp: new HLCTimestamp(wallMs, 0, 'source-progress-component').toString()};
  assert.equal(applyCommitted(leader, decision), null,
    'the real application owner accepted the controlled COMMIT decision');
}

const insertOperation = (id, value = PAYLOAD_SENTINEL) =>
  ({sql: `INSERT INTO ${TABLE} (id, value) VALUES (?, ?)`, params: [id, value]});

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
    propagatePartitionCDCEvent: async (_selected, delivered, context) => {
      assert.equal(f.leader.db.inTransaction, false,
        'no SQLite transaction spans the recipient await');
      return f.propagate(index, delivered, context, service.groupId);
    },
    afterPropagation: (delivered) => f.afterPropagation(index, delivered),
  });
  f.subscribers.push(subscriber);
  return f.leader.subscribeToCDCWithHandshake(subscriber,
    {subscriberId: `progress-subscriber-${index}`});
}

// rows: source row ids inserted first; statements: further committed source
// statements ({entryId, sql, params, wallMs}) applied after them; populate: any
// further committed source work ((leader) => owed events it added). All of it
// is applied before the partition leads, so no recipient callback runs during
// setup.
async function fixture(t, {rows = ['A', 'B'], subscribers = 3, statements = [],
  populate = () => 0} = {}) {
  const clock = delayedClock();
  // The source partition holds a CDC-carrying table (decision D2: only a
  // propagated table records an obligation).
  const {leader, proposed} = await startLeader({tableName: TABLE, timeSource: clock});
  t.after(() => shutdownAll(leader));
  leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  const f = {clock, leader, proposed, ready: false, calls: [], hooks: [], subscribers: [],
    behavior: (_index, events, _context, groupId) => recipientAnswer(events, groupId, false),
    // The recipient seam: what the propagation subscriber hands its
    // propagatePartitionCDCEvent (one vector per call), and its completion
    // hook. A call records the row ids its vector carried, in order.
    propagate: (index, events, context, groupId) => {
      f.calls.push({index, ids: events.map((event) => event.data.id),
        eventKeys: events.map((event) => event.eventKey),
        remainingMs: context.remainingMs()});
      return f.behavior(index, events, context, groupId);
    },
    afterPropagation: (index, events) =>
      f.hooks.push({index, ids: events.map((event) => event.data.id)}),
    acks: () => proposed.filter((command) => command.type === PARTITION_CDC_COMMAND.DELIVERED),
    drive: () => leader.cdcDelivery.driveCdcObligations(REASON.DELIVERY_RETRY),
  };
  for (let index = 0; index < subscribers; index += 1) await addSubscriber(f, index);
  for (const id of rows) addSourceRow(leader, id);
  for (const statement of statements) commitSourceStatement(leader, statement);
  const populated = populate(leader);
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  await settleTicks();
  assert.deepEqual(countCdcObligations(leader.db),
    {owed: rows.length + statements.length + populated, delivered: 0});
  assert.equal(f.calls.length, 0, 'readiness held all recipient callbacks during setup');
  f.ready = true;
  return f;
}

function assertOwedWithoutAck(f, owed) {
  assert.deepEqual(countCdcObligations(f.leader.db), {owed, delivered: 0});
  assert.equal(f.acks().length, 0);
  assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 0);
}

// The lane of the current leadership tenure. The delivery owner replaces its
// lane lazily, the next time it is asked after the tenure changed, so the lane
// is read through the owner (its diagnostics) first.
function currentLaneOf(f) {
  f.leader.cdcDelivery.getCdcObligationDiagnostics();
  return f.leader.cdcDelivery.obligationLane;
}

// The lane's shipping window as a precondition of a test whose property is
// stated for a given window (a warmed lane ships up to `rows` per wave). The
// window's own dynamics from a cold start are proved where they are the
// property; from here on the lane moves the window by its own rules.
function primeShipWindow(f, rows) {
  currentLaneOf(f).shipWindow = rows;
}

// Hold the lane's shipping window at `rows`: the same lane with its one
// parameter pinned (the reference of the differential property, window 1).
// Re-applied by the caller after a tenure change, which makes a new lane.
function holdShipWindow(f, rows) {
  Object.defineProperty(currentLaneOf(f), 'shipWindow',
    {get: () => rows, set: () => {}, enumerable: true, configurable: true});
}

const shipWindowOf = (f) => f.leader.cdcDelivery.getCdcObligationDiagnostics().shipWindow;

export {PAYLOAD_SENTINEL, RETRY_AFTER_MS, TABLE, addSourceEntry, addSourceRow,
  assertOwedWithoutAck, commitSourceStatement, currentLaneOf, fixture, holdShipWindow,
  insertOperation, primeShipWindow, recipientAnswer, shipWindowOf};
