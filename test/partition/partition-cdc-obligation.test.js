/**
 * TX1 (quest replicated-transaction-decision-and-apply) receipt 8: the durable
 * CDC obligation of a committed participant decision (design revision 10,
 * section 8.3), on controllable replicas. Siblings:
 * test/cdc/cdc-obligation-recovery.integration.test.js (real rs-raft groups,
 * the R-series); fixture: test/test-helpers/participant-transaction-fixture.js.
 * Each witness measures every fact before one deepEqual. Red on the sealed head
 * through the absent obligation owner (no ledger, after-commit emission only:
 * design 8.3 "Today").
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import Database from 'better-sqlite3';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {PARTITION_SERVICE_DEFAULT, PARTITION_SERVICE_EVENT} from
  '../../src/partition/partition-service-constants.js';
import {
  PARTITION_COMMITTED_COMMAND_ORIGIN,
  admitCommittedCommand,
} from '../../src/partition/partition-committed-command-admission.js';
import {buildEventIdentity} from '../../src/partition/cdc-event-buffer.js';
import {buildProvisionalCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {CDC_PIPELINE_METRIC} from '../../src/constants/cdc-lifecycle-constants.js';
import {
  PARTITION_CDC_COMMAND,
  PARTITION_CDC_OBLIGATION_BOUND,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE,
  PARTITION_CDC_OBLIGATION_FAILURE_CODE,
  PARTITION_CDC_OBLIGATION_FLUSH_STATE,
  PARTITION_CDC_OBLIGATION_STANDING as STANDING,
} from '../../src/partition/partition-cdc-obligation-constants.js';
import {
  acknowledgedBytesOf,
  buildCdcAcknowledgementCommand,
  cdcObligationEventKeyDigest,
  countCdcObligations,
  readCdcObligation,
  readCdcObligationProgress,
  readCdcObligationStanding,
  readOwedCdcObligations,
} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {getSchemaByTableName} from '../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../src/constants/index.js';
import {readPartitionWriteGeneration} from
  '../../src/partition/partition-participant-transaction-store.js';
import {
  CDC_INSERT_SQL, CDC_TABLE, INSERT_SQL, PARTITION_ID, REPLICAS, ROW, ROW_2, applyCommitted,
  awaitProposal,
  beginMessage, clearFixtureSingletons, commitDecision, commitMessage, committedQueryOf,
  durableAppliedIndex, generationOf, identityOf, isDecisionCommand, isPrepareCommand,
  onTwoReplicas, operationOf, prepareCommandOf, prepareMessage, queryMessage,
  plantAppliedStateFailure, removeAppliedStateFailure, resetFixtureSingletons, send,
  settleTicks, shutdownAll, startLeader, startReplica, temporaryDbPath, track,
  transactionOperationOutcomes,
} from '../test-helpers/participant-transaction-fixture.js';
import {acknowledgingCdcSubscriber} from '../test-helpers/acknowledging-cdc-subscriber.js';

const BOUND = PARTITION_CDC_OBLIGATION_BOUND;
const DRIVE = PARTITION_CDC_OBLIGATION_DRIVE_STATE;
const FLUSH = PARTITION_CDC_OBLIGATION_FLUSH_STATE;
const CODE = PARTITION_CDC_OBLIGATION_FAILURE_CODE;
const ACK = PARTITION_CDC_COMMAND.DELIVERED;
const CDC_OWNER = Object.freeze({origin: PARTITION_COMMITTED_COMMAND_ORIGIN.CDC_DELIVERY_OWNER});
const WRITE_PATH = Object.freeze({origin: PARTITION_COMMITTED_COMMAND_ORIGIN.WRITE_PATH});
const txKey = (tx, ordinal) => `txop:${tx.participantId}:${ordinal}`;
const RETRY_AFTER_MS = 20;
const ONE_TICK_MS = 1;
const LONG_ID = 'å'.repeat(70_000);
// Every witness here hosts its partition under the fixture's CDC-carrying
// table: only an internally propagated table owes an obligation (owner
// decision D2), and a user table owes none (O20).
const CDC = Object.freeze({tableName: CDC_TABLE});
const startCdcLeader = (extra = {}) => startLeader({...CDC, ...extra});
const startCdcReplica = (replicaId, extra = {}) => startReplica(replicaId, {...CDC, ...extra});
const cdcOperationOf = (row, extra = {}) =>
  operationOf(row, {sql: CDC_INSERT_SQL, ...extra});

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

// A recording subscriber: every delivered event, in order; `ready` gates it.
// It answers the owner's committed receipt (the one acknowledging fixture), so
// an acknowledgement is the delivery owner's decision, never a refusal.
function recordingSubscriber(options = {}) {
  const subscriber = acknowledgingCdcSubscriber({
    canAcceptCDCEvent: () => subscriber.ready ? true :
      {ready: false, retryAfterMs: RETRY_AFTER_MS, reason: 'consumer not ready'},
    onEvent: (event) => {
      // The consumer's de-duplication contract: identity, never a count. A
      // duplicate is acknowledged again, applied once.
      const identity = buildEventIdentity(event);
      if (subscriber.applied.has(identity)) {
        subscriber.duplicates += 1;
        return;
      }
      subscriber.applied.set(identity, event);
    },
  });
  return Object.assign(subscriber, {ready: options.ready ?? true, applied: new Map(),
    duplicates: 0});
}
const isAck = (entry) => entry.type === ACK;
const acksOf = (proposed) => proposed.filter(isAck);
const identityOfEvent = (event) => ({eventKey: event.eventKey, entryId: event.entryId,
  logIndex: event.logIndex, ordinal: event.ordinal, identity: buildEventIdentity(event)});
function ledgerRow(partition, key) {
  const row = readCdcObligation(partition.db, key);
  return row === null ? null : {logIndex: row.logIndex, ordinal: row.ordinal,
    entryId: row.entryId, delivered: row.delivered};
}
// Every positional member resolves one retained ledger row and binds its
// durable key.
function groupsMatchLedger(partition, command) {
  return command.acknowledged.every((group) => group.events.every((event) => {
    const {row} = readCdcObligationStanding(partition.db,
      {logIndex: group.logIndex, ordinal: event.ordinal});
    return row !== null && cdcObligationEventKeyDigest(row.eventKey) === event.eventKeyDigest;
  }));
}
const groupShape = (command) => command.acknowledged.map((group) =>
  ({logIndex: group.logIndex, events: group.events.length}));
const eventCount = (command) =>
  command.acknowledged.reduce((sum, group) => sum + group.events.length, 0);
const ackEvent = (eventKey, ordinal) =>
  ({ordinal, eventKeyDigest: cdcObligationEventKeyDigest(eventKey)});

// Drive one transaction through the leader's request path and apply its two
// committed commands; the decision's committed index is the obligations' entry.
async function commitThroughLeader(leader, proposed, tx, rows) {
  await send(leader, beginMessage(tx));
  for (const row of rows) {
    await send(leader, queryMessage(tx, CDC_INSERT_SQL, [row.id, row.value]));
  }
  const prepare = track(send(leader, prepareMessage(tx)));
  const prepareCommand = await awaitProposal(proposed,
    (entry) => isPrepareCommand(entry) && entry.transactionId === tx.transactionId);
  applyCommitted(leader, prepareCommand);
  const prepared = await prepare.promise;
  const commit = track(send(leader, commitMessage(tx, prepared.preparedDigest)));
  const decision = await awaitProposal(proposed,
    (entry) => isDecisionCommand(entry) && entry.transactionId === tx.transactionId);
  applyCommitted(leader, decision);
  const decisionIndex = leader.controllablePort.committedIndex;
  const answer = await commit.promise;
  await settleTicks();
  return {decision, decisionIndex, answer};
}
// Apply a hand-built PREPARE and its COMMIT on a replica (leader or follower).
function commitHandBuilt(partition, tx, operations) {
  const prepareCommand = prepareCommandOf(tx, operations, generationOf(partition));
  const prepareApply = applyCommitted(partition, prepareCommand);
  const decision = {...commitDecision(tx, prepareCommand),
    timestamp: new HLCTimestamp(1, 0, 'cdc-test').toString()};
  const decisionApply = applyCommitted(partition, decision);
  return {prepareCommand, decision, prepareApply, decisionApply,
    decisionIndex: partition.controllablePort.committedIndex};
}
const rowsOf = (prefix, count) => Array.from({length: count},
  (_unused, index) => ({id: `${prefix}-${index}`, value: `${prefix}-v${index}`}));
// Lead a replica started over an existing database: the fixture leader's flags
// and a proposal capture, the port's committed index at the durable one.
function leadRestarted(replica) {
  replica.controllablePort.committedIndex = durableAppliedIndex(replica);
  replica.role = 'leader';
  replica.isLeader = true;
  replica.leaderId = replica.replicaId;
  replica.controllablePort.setRole(RAFT_ROLE.LEADER);
  const proposed = [];
  replica.controllablePort.setProposeHandler(async (entry) => {
    proposed.push({...entry});
  });
  return proposed;
}
function independentLedger(dbPath) {
  const independent = new Database(dbPath, {readonly: true});
  try {
    return independent.prepare('SELECT event_key, log_index, ordinal, delivered ' +
      'FROM _cdc_obligations ORDER BY log_index, ordinal').all()
      .map((row) => ({eventKey: row.event_key, logIndex: Number(row.log_index),
        ordinal: Number(row.ordinal), delivered: Number(row.delivered)}));
  } finally {
    independent.close();
  }
}

// --- O1: the obligation is written in the decision's application transaction ---
test('TX1 CDC O1: a committed COMMIT records one owed obligation per applied operation ' +
  'inside its application transaction, and a planted failure of the applied-state write ' +
  'records none', async () => {
  const tx = identityOf('c1');
  const follower = await startCdcReplica(REPLICAS[1]);
  try {
    const prepareCommand = prepareCommandOf(tx, [cdcOperationOf(ROW), cdcOperationOf(ROW_2)],
      generationOf(follower));
    const facts = {prepareApply: applyCommitted(follower, prepareCommand)};
    const appliedBefore = durableAppliedIndex(follower);
    plantAppliedStateFailure(follower.db);
    facts.plantedApply = applyCommitted(follower, commitDecision(tx, prepareCommand));
    removeAppliedStateFailure(follower.db);
    facts.afterPlant = {...countCdcObligations(follower.db),
      appliedAdvance: durableAppliedIndex(follower) - appliedBefore};
    const decision = commitDecision(tx, prepareCommand);
    facts.decisionApply = applyCommitted(follower, decision);
    const decisionIndex = follower.controllablePort.committedIndex;
    facts.afterDecision = countCdcObligations(follower.db);
    facts.rows = [ledgerRow(follower, txKey(tx, 0)), ledgerRow(follower, txKey(tx, 1))];
    assert.deepEqual(facts, {prepareApply: null, plantedApply: 'SQLITE_CONSTRAINT_TRIGGER',
      afterPlant: {owed: 0, delivered: 0, appliedAdvance: 0},
      decisionApply: null, afterDecision: {owed: 2, delivered: 0},
      rows: [
        {logIndex: decisionIndex, ordinal: 0, entryId: decision.entryId, delivered: false},
        {logIndex: decisionIndex, ordinal: 1, entryId: decision.entryId, delivered: false}]},
    'the obligations commit with the rows, the outcomes and the applied index, or not at all');
  } finally {
    await shutdownAll(follower);
  }
});

// --- O2: identity and the payload as of the commit, the same on every replica ---
test('TX1 CDC O2: an obligation is identified by transaction, entry and ordinal, holds the ' +
  'event payload as of its commit, and is byte-identical on two replicas', async () => {
  const tx = identityOf('c2');
  const perReplica = await onTwoReplicas(async (replica) => {
    const {decision, decisionIndex} = commitHandBuilt(replica, tx, [cdcOperationOf(ROW)]);
    const recorded = readCdcObligation(replica.db, txKey(tx, 0));
    // A later committed write changes the row; the recorded payload keeps the
    // value as of the decision's commit (no later row version is read back).
    applyCommitted(replica, committedQueryOf('c2-later',
      `UPDATE ${CDC_TABLE} SET value = 'later' WHERE id = '${ROW.id}'`));
    const afterLater = readCdcObligation(replica.db, txKey(tx, 0));
    const event = JSON.parse(afterLater.eventJson);
    return {
      identity: {eventKey: recorded.eventKey, entryId: recorded.entryId,
        logIndex: recorded.logIndex, ordinal: recorded.ordinal, delivered: recorded.delivered},
      decisionEntryId: decision.entryId, decisionIndex,
      payload: {tableName: event.tableName, operation: event.operation,
        timestamp: event.timestamp, sourcePartition: event.sourcePartition,
        sourceReplica: event.sourceReplica, value: event.data?.value,
        updatedAtHlc: event.data?.updated_at_hlc},
      sameBytesAfterLaterWrite: recorded.eventJson === afterLater.eventJson,
      eventJson: recorded.eventJson,
    };
  }, CDC);
  const [first, second] = perReplica;
  assert.deepEqual({
    identity: first.identity,
    sameEntry: first.identity.entryId === first.decisionEntryId &&
      first.identity.logIndex === first.decisionIndex,
    payload: first.payload,
    sameBytesAfterLaterWrite: first.sameBytesAfterLaterWrite,
    identicalOnBothReplicas: first.eventJson === second.eventJson &&
      first.identity.eventKey === second.identity.eventKey,
  }, {
    identity: {eventKey: txKey(tx, 0), entryId: first.decisionEntryId,
      logIndex: first.decisionIndex, ordinal: 0, delivered: false},
    sameEntry: true,
    payload: {tableName: CDC_TABLE, operation: 'INSERT', timestamp: '1-0-cdc-test',
      sourcePartition: PARTITION_ID, sourceReplica: 'tx1-v3-elsewhere', value: ROW.value,
      updatedAtHlc: '1-0-cdc-test'},
    sameBytesAfterLaterWrite: true,
    identicalOnBothReplicas: true,
  }, 'identity = transaction + entry + ordinal; payload frozen at commit; same bytes everywhere');
});

// --- O3: delivered only on acknowledgement ---
test('TX1 CDC O3: an obligation is marked delivered only after every subscriber acknowledged ' +
  'it and the CDC_DELIVERED committed; a subscriber that is not ready holds it owed', async () => {
  const tx = identityOf('c3');
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startCdcLeader({timeSource});
  const consumer = recordingSubscriber({ready: false});
  try {
    await leader.subscribeToCDCWithHandshake(consumer, {subscriberId: 'c3'});
    const {decisionIndex, answer} = await commitThroughLeader(leader, proposed, tx, [ROW, ROW_2]);
    const facts = {commit: answer?.success === true,
      whileHeld: {received: consumer.events.length, ...countCdcObligations(leader.db),
        pending: leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements,
        drive: leader.cdcDelivery.getCdcObligationDiagnostics().lastDrive?.state,
        acksProposed: acksOf(proposed).length}};
    consumer.ready = true;
    timeSource.advance(RETRY_AFTER_MS);
    await settleTicks();
    facts.afterAcknowledgement = {received: consumer.events.map(identityOfEvent),
      ...countCdcObligations(leader.db),
      pending: leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements,
      acksProposed: acksOf(proposed).length};
    timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
    const [ack] = acksOf(proposed);
    facts.proposed = ack ? {groups: groupShape(ack), matchesLedger: groupsMatchLedger(leader, ack),
      admitted: admitCommittedCommand(ack, CDC_OWNER).admitted} : null;
    facts.beforeAckApplies = countCdcObligations(leader.db);
    facts.ackApply = ack ? applyCommitted(leader, ack) : 'not proposed';
    await settleTicks();
    facts.afterAckApplies = {...countCdcObligations(leader.db),
      pending: leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements,
      flush: leader.cdcDelivery.getCdcObligationDiagnostics().lastFlush?.state};
    assert.deepEqual(facts, {commit: true,
      whileHeld: {received: 0, owed: 2, delivered: 0, pending: 0,
        drive: DRIVE.HELD_BY_SUBSCRIBER, acksProposed: 0},
      afterAcknowledgement: {received: [0, 1].map((ordinal) => ({eventKey: txKey(tx, ordinal),
        entryId: `${tx.participantId}:decision:${proposed.find(isDecisionCommand).decisionDigest}`,
        logIndex: decisionIndex, ordinal, identity: buildEventIdentity(consumer.events[ordinal])})),
      owed: 2, delivered: 0, pending: 2, acksProposed: 0},
      proposed: {groups: [{logIndex: decisionIndex, events: 2}], matchesLedger: true,
        admitted: true},
      beforeAckApplies: {owed: 2, delivered: 0},
      ackApply: null,
      afterAckApplies: {owed: 0, delivered: 2, pending: 0, flush: FLUSH.COMMITTED}},
    'acknowledgement never precedes delivery; the flag moves only with the committed ack');
  } finally {
    await shutdownAll(leader);
  }
});

// --- O4: the count bound, grouped by committed entry ---
test('TX1 CDC O4: acknowledgements are batched by committed entry under the count bound: ' +
  'two entries\' events fill one CDC_DELIVERED of exactly the bound, in log and ordinal ' +
  'order, and the rest follows at the deadline', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startCdcLeader({timeSource});
  const consumer = recordingSubscriber();
  try {
    await leader.subscribeToCDCWithHandshake(consumer, {subscriberId: 'c4'});
    const first = commitHandBuilt(leader, identityOf('c4a'),
      rowsOf('c4a', 200).map((row) => cdcOperationOf(row)));
    await settleTicks();
    const second = commitHandBuilt(leader, identityOf('c4b'),
      rowsOf('c4b', 100).map((row) => cdcOperationOf(row)));
    await settleTicks();
    const atBound = acksOf(proposed);
    // The second ledger page is admitted on the delivery owner's initial
    // scheduled turn; the sparse deadline starts when that page's first
    // acknowledgement enters the next batch.
    timeSource.advance(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS);
    await settleTicks();
    timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
    const all = acksOf(proposed);
    const facts = {
      applies: [first.prepareApply, first.decisionApply, second.prepareApply,
        second.decisionApply],
      received: consumer.events.length,
      receivedInLogOrder: consumer.events.every((event, index) => index === 0 ||
        event.logIndex > consumer.events[index - 1].logIndex ||
        (event.logIndex === consumer.events[index - 1].logIndex &&
          event.ordinal > consumer.events[index - 1].ordinal)),
      proposedAtBound: atBound.map((ack) => ({events: eventCount(ack), groups: groupShape(ack),
        matchesLedger: groupsMatchLedger(leader, ack),
        bytes: acknowledgedBytesOf(ack.acknowledged) <= BOUND.ACK_BATCH_MAX_BYTES})),
      proposedAfterDeadline: all.slice(atBound.length).map((ack) =>
        ({events: eventCount(ack), groups: groupShape(ack),
          matchesLedger: groupsMatchLedger(leader, ack)})),
      ordinalOrderInGroups: all.every((ack) => ack.acknowledged.every((group) =>
        group.events.every((event, index) => index === 0 ||
          event.ordinal > group.events[index - 1].ordinal))),
    };
    assert.deepEqual(facts, {
      applies: [null, null, null, null], received: 300, receivedInLogOrder: true,
      proposedAtBound: [{events: BOUND.ACK_BATCH_MAX_EVENTS, groups: [
        {logIndex: first.decisionIndex, events: 200},
        {logIndex: second.decisionIndex, events: BOUND.ACK_BATCH_MAX_EVENTS - 200}],
      matchesLedger: true, bytes: true}],
      proposedAfterDeadline: [{events: 300 - BOUND.ACK_BATCH_MAX_EVENTS,
        groups: [{logIndex: second.decisionIndex, events: 300 - BOUND.ACK_BATCH_MAX_EVENTS}],
        matchesLedger: true}],
      ordinalOrderInGroups: true,
    }, 'one batch per bound, never across an entry\'s identity, never beyond the count');
  } finally {
    await shutdownAll(leader);
  }
});

// --- O5: bounded acknowledgement identity ---
test('TX1 CDC O5: an arbitrary long durable event key is acknowledged by its bounded ' +
  'position and key digest', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startCdcLeader({timeSource});
  const consumer = recordingSubscriber();
  try {
    await leader.subscribeToCDCWithHandshake(consumer, {subscriberId: 'c5'});
    const tx = identityOf(`c5-${LONG_ID}`);
    const committed = commitHandBuilt(leader, tx, [cdcOperationOf(ROW)]);
    await settleTicks();
    timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
    const [ack] = acksOf(proposed);
    const ackBytes = acknowledgedBytesOf(ack.acknowledged);
    const apply = applyCommitted(leader, ack);
    const facts = {
      applies: [committed.prepareApply, committed.decisionApply],
      received: consumer.events.length,
      eventKeyExceedsAckBound:
        Buffer.byteLength(txKey(tx, 0)) > BOUND.ACK_BATCH_MAX_BYTES,
      ackBytes,
      withinBound: ackBytes <= BOUND.ACK_BATCH_MAX_BYTES,
      admitted: admitCommittedCommand(ack, CDC_OWNER).admitted,
      apply,
      final: countCdcObligations(leader.db),
    };
    assert.deepEqual(facts, {applies: [null, null], received: 1,
      eventKeyExceedsAckBound: true, ackBytes,
      withinBound: true, admitted: true, apply: null, final: {owed: 0, delivered: 1}},
    'caller-sized keys never make the replicated acknowledgement unrepresentable');
  } finally {
    await shutdownAll(leader);
  }
});

// --- O6: sparse traffic progresses by the deadline ---
test('TX1 CDC O6: a single acknowledged event is proposed at the flush deadline and not ' +
  'before', async () => {
  const tx = identityOf('c6');
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startCdcLeader({timeSource});
  const consumer = recordingSubscriber();
  try {
    await leader.subscribeToCDCWithHandshake(consumer, {subscriberId: 'c6'});
    const {decisionIndex} = await commitThroughLeader(leader, proposed, tx, [ROW]);
    const facts = {received: consumer.events.length,
      armed: leader.cdcDelivery.getCdcObligationDiagnostics().flushArmed,
      acksBeforeDeadline: acksOf(proposed).length};
    timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS - ONE_TICK_MS);
    await settleTicks();
    facts.acksOneTickBefore = acksOf(proposed).length;
    timeSource.advance(ONE_TICK_MS);
    await settleTicks();
    facts.acksAtDeadline = acksOf(proposed).map(groupShape);
    assert.deepEqual(facts, {received: 1, armed: true, acksBeforeDeadline: 0,
      acksOneTickBefore: 0, acksAtDeadline: [[{logIndex: decisionIndex, events: 1}]]},
    'sparse traffic is acknowledged within one deadline, as one replicated write');
  } finally {
    await shutdownAll(leader);
  }
});

// --- O7: the committed CDC_DELIVERED ---
test('TX1 CDC O7: CDC_DELIVERED marks only the owed events it names, reclaims the delivered ' +
  'prefix into the compact progress (decision D1), replays idempotently, ' +
  'refuses an unknown position or a wrong key digest at a retained position without a ' +
  'write, moves neither the generation nor an outcome row, and is admitted only from the ' +
  'CDC delivery owner in its pinned form', async () => {
  const follower = await startCdcReplica(REPLICAS[1]);
  try {
    const txA = identityOf('c7a');
    const txB = identityOf('c7b');
    const a = commitHandBuilt(follower, txA, [cdcOperationOf(ROW), cdcOperationOf(ROW_2)]);
    const b = commitHandBuilt(follower, txB, [cdcOperationOf({id: 'c7b-row', value: 'b'})]);
    const stamp = {timestamp: '', proposedBy: REPLICAS[0], proposedAt: 0};
    const ackA = buildCdcAcknowledgementCommand(PARTITION_ID,
      [{logIndex: a.decisionIndex,
        events: [ackEvent(txKey(txA, 0), 0), ackEvent(txKey(txA, 1), 1)]}], stamp);
    const before = {generation: readPartitionWriteGeneration(follower.db),
      outcomes: transactionOperationOutcomes(follower), applied: durableAppliedIndex(follower)};
    const facts = {applies: [a.prepareApply, a.decisionApply, b.prepareApply, b.decisionApply]};
    facts.ackApply = applyCommitted(follower, ackA);
    const standingAt = (logIndex, ordinal) =>
      readCdcObligationStanding(follower.db, {logIndex, ordinal}).standing;
    const progress = () => {
      const facts = readCdcObligationProgress(follower.db);
      return facts && {through: [facts.throughLogIndex, facts.throughOrdinal],
        reclaimed: facts.reclaimed, advancedIndex: facts.advancedIndex};
    };
    facts.afterAck = {...countCdcObligations(follower.db),
      a0: standingAt(a.decisionIndex, 0), a1: standingAt(a.decisionIndex, 1),
      b0: standingAt(b.decisionIndex, 0), rows: ledgerRow(follower, txKey(txA, 0)),
      progress: progress()};
    facts.replayApply = applyCommitted(follower, ackA);
    facts.afterReplay = countCdcObligations(follower.db);
    const unknown = buildCdcAcknowledgementCommand(PARTITION_ID,
      [{logIndex: b.decisionIndex,
        events: [ackEvent(txKey(txB, 0), 0), ackEvent(txKey(txB, 7), 7)]}], stamp);
    facts.unknownApply = applyCommitted(follower, unknown);
    facts.afterUnknown = countCdcObligations(follower.db);
    // A wrong key digest is judged at a retained row (b0, still owed); at or
    // below the reclaimed prefix a position is delivered without a row to
    // compare against (decision D1).
    const misfiled = buildCdcAcknowledgementCommand(PARTITION_ID,
      [{logIndex: b.decisionIndex, events: [ackEvent(txKey(txA, 0), 0)]}], stamp);
    facts.misfiledApply = applyCommitted(follower, misfiled);
    facts.afterMisfiled = {...countCdcObligations(follower.db), progress: progress()};
    facts.unchanged = {generation: readPartitionWriteGeneration(follower.db) - before.generation,
      outcomes: transactionOperationOutcomes(follower) - before.outcomes,
      appliedAdvance: durableAppliedIndex(follower) - before.applied};
    const oversized = buildCdcAcknowledgementCommand(PARTITION_ID, [{logIndex: a.decisionIndex,
      events: Array.from({length: BOUND.ACK_BATCH_MAX_EVENTS + 1},
        (_unused, index) => ackEvent(txKey(txA, index), index))}], stamp);
    facts.admission = {
      fromOwner: admitCommittedCommand(ackA, CDC_OWNER).admitted,
      fromWritePath: admitCommittedCommand(ackA, WRITE_PATH).code,
      tamperedEntryId: admitCommittedCommand({...ackA, entryId: 'cdc-ack:forged'}, CDC_OWNER).code,
      unsortedGroups: admitCommittedCommand(buildCdcAcknowledgementCommand(PARTITION_ID,
        [{logIndex: b.decisionIndex, events: [ackEvent(txKey(txB, 0), 0)]},
          {logIndex: a.decisionIndex, events: [ackEvent(txKey(txA, 0), 0)]}],
        stamp), CDC_OWNER).code,
      oversized: admitCommittedCommand(oversized, CDC_OWNER).code,
    };
    assert.deepEqual(facts, {applies: [null, null, null, null],
      ackApply: null,
      afterAck: {owed: 1, delivered: 2, a0: STANDING.RECLAIMED, a1: STANDING.RECLAIMED,
        b0: STANDING.OWED, rows: null,
        progress: {through: [a.decisionIndex, 1], reclaimed: 2,
          advancedIndex: before.applied + 1}},
      replayApply: null, afterReplay: {owed: 1, delivered: 2},
      unknownApply: null, afterUnknown: {owed: 1, delivered: 2},
      misfiledApply: null, afterMisfiled: {owed: 1, delivered: 2,
        progress: {through: [a.decisionIndex, 1], reclaimed: 2,
          advancedIndex: before.applied + 1}},
      unchanged: {generation: 0, outcomes: 0, appliedAdvance: 4},
      admission: {fromOwner: true, fromWritePath: CODE.ORIGIN_REFUSED,
        tamperedEntryId: CODE.BYTES_INVALID, unsortedGroups: CODE.BYTES_INVALID,
        oversized: CODE.BYTES_INVALID}},
    'the flag is a function of the committed log; an unknown or misfiled event refuses the ' +
    'whole command');
  } finally {
    await shutdownAll(follower);
  }
});

// --- O8: a crash between the apply and the acknowledgement ---
test('TX1 CDC O8: obligations owed when the replica stopped are redelivered in log order on ' +
  'the next leadership, with the same identities, and every one survived the restart',
async () => {
  const {directory, dbPath} = temporaryDbPath();
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startCdcLeader({timeSource, dbPath});
  let restarted = null;
  try {
    const first = await commitThroughLeader(leader, proposed, identityOf('c8a'), [ROW, ROW_2]);
    const second = await commitThroughLeader(leader, proposed,
      identityOf('c8b'), [{id: 'c8b-row', value: 'b'}]);
    const facts = {commits: [first.answer?.success, second.answer?.success],
      acksBeforeCrash: acksOf(proposed).length};
    await leader.shutdown();
    const durable = independentLedger(dbPath);
    facts.afterCrash = {rows: durable.length,
      everyOwed: durable.every((row) => row.delivered === 0)};
    restarted = await startCdcReplica(REPLICAS[0], {dbPath, timeSource, generationOrigin: false});
    const consumer = recordingSubscriber();
    await restarted.subscribeToCDCWithHandshake(consumer, {subscriberId: 'c8'});
    await settleTicks();
    facts.beforeLeadership = {received: consumer.events.length,
      drive: restarted.cdcDelivery.getCdcObligationDiagnostics().lastDrive?.state};
    const reproposed = leadRestarted(restarted);
    restarted.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED,
      {leaderId: restarted.replicaId, term: 2, partitionId: PARTITION_ID});
    await settleTicks();
    facts.redelivered = consumer.events.map(identityOfEvent);
    facts.ledgerOrder = durable.map((row) => row.eventKey);
    timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
    const [ack] = acksOf(reproposed);
    facts.ack = ack ? {groups: groupShape(ack), matchesLedger: groupsMatchLedger(restarted, ack)} :
      null;
    facts.ackApply = ack ? applyCommitted(restarted, ack) : 'not proposed';
    facts.final = countCdcObligations(restarted.db);
    const expectedKeys = [txKey(identityOf('c8a'), 0), txKey(identityOf('c8a'), 1),
      txKey(identityOf('c8b'), 0)];
    assert.deepEqual(facts, {commits: [true, true], acksBeforeCrash: 0,
      afterCrash: {rows: 3, everyOwed: true},
      beforeLeadership: {received: 0, drive: DRIVE.NOT_LEADER},
      redelivered: expectedKeys.map((eventKey, index) => ({eventKey,
        entryId: index < 2 ? first.decision.entryId : second.decision.entryId,
        logIndex: index < 2 ? first.decisionIndex : second.decisionIndex,
        ordinal: index < 2 ? index : 0, identity: buildEventIdentity(consumer.events[index])})),
      ledgerOrder: expectedKeys,
      ack: {groups: [{logIndex: first.decisionIndex, events: 2},
        {logIndex: second.decisionIndex, events: 1}], matchesLedger: true},
      ackApply: null, final: {owed: 0, delivered: 3}},
    'a crash before acknowledgement loses nothing; the new tenure re-drives the ledger in order');
  } finally {
    await shutdownAll(leader, restarted);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

// --- O9: a lost acknowledgement ---
test('TX1 CDC O9: an acknowledgement whose CDC_DELIVERED never committed is redelivered after ' +
  'a restart with the same identity, the consumer applies it once, and the ledger is then ' +
  'marked delivered', async () => {
  const {directory, dbPath} = temporaryDbPath();
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startCdcLeader({timeSource, dbPath});
  const consumer = recordingSubscriber();
  let restarted = null;
  try {
    await leader.subscribeToCDCWithHandshake(consumer, {subscriberId: 'c9'});
    const tx = identityOf('c9');
    const {decisionIndex} = await commitThroughLeader(leader, proposed, tx, [ROW, ROW_2]);
    timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
    const lost = acksOf(proposed);
    const facts = {firstDelivery: consumer.events.map((event) => event.eventKey),
      ackProposedThenLost: lost.length,
      pendingBeforeCrash: leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements};
    // The proposed CDC_DELIVERED is never committed: the leader crashes first.
    await leader.shutdown();
    facts.afterCrash = independentLedger(dbPath).map((row) => row.delivered);
    restarted = await startCdcReplica(REPLICAS[0], {dbPath, timeSource, generationOrigin: false});
    const reproposed = leadRestarted(restarted);
    await restarted.subscribeToCDCWithHandshake(consumer, {subscriberId: 'c9'});
    await settleTicks();
    facts.redelivered = consumer.events.slice(2).map(identityOfEvent);
    facts.consumer = {applied: consumer.applied.size, duplicates: consumer.duplicates,
      sameIdentityAsFirst: consumer.events.slice(2).every((event, index) =>
        buildEventIdentity(event) === buildEventIdentity(consumer.events[index]) &&
        event.eventKey === consumer.events[index].eventKey)};
    timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
    const [ack] = acksOf(reproposed);
    facts.reacknowledged = ack ? {groups: groupShape(ack), sameEntryIdAsLost:
      ack.entryId === lost[0]?.entryId} : null;
    facts.ackApply = ack ? applyCommitted(restarted, ack) : 'not proposed';
    facts.final = countCdcObligations(restarted.db);
    assert.deepEqual(facts, {firstDelivery: [txKey(tx, 0), txKey(tx, 1)],
      ackProposedThenLost: 1, pendingBeforeCrash: 2,
      afterCrash: [0, 0],
      redelivered: [0, 1].map((ordinal) => ({eventKey: txKey(tx, ordinal),
        entryId: consumer.events[ordinal].entryId, logIndex: decisionIndex, ordinal,
        identity: buildEventIdentity(consumer.events[ordinal])})),
      consumer: {applied: 2, duplicates: 2, sameIdentityAsFirst: true},
      reacknowledged: {groups: [{logIndex: decisionIndex, events: 2}], sameEntryIdAsLost: true},
      ackApply: null, final: {owed: 0, delivered: 2}},
    'a lost acknowledgement means replay through the consumer\'s de-duplication, never loss');
  } finally {
    await shutdownAll(leader, restarted);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});


// Delayed activation of the same canonical tenure must not erase acknowledgements.
test('TX1 CDC O10: repeated leader activation preserves the acknowledged batch', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startCdcLeader({timeSource});
  const consumer = recordingSubscriber();
  try {
    await leader.subscribeToCDCWithHandshake(consumer, {subscriberId: 'c10'});
    commitHandBuilt(leader, identityOf('c10'), [cdcOperationOf(ROW)]);
    await settleTicks();
    const tenure = leader.leadershipTenure;
    leader.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);
    await settleTicks();
    timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
    assert.deepEqual({sameTenure: leader.leadershipTenure === tenure,
      received: consumer.events.length, acks: acksOf(proposed).length},
    {sameTenure: true, received: 1, acks: 1});
  } finally {
    await shutdownAll(leader);
  }
});

// A callback accepted by an old leader can finish after its successor starts.
// That completion owes no acknowledgement from the new tenure.
test('TX1 CDC O11: a stale subscriber completion cannot acknowledge for a new tenure',
  async () => {
    const timeSource = new VirtualTimeSource();
    const {leader, proposed} = await startCdcLeader({timeSource});
    let finishOld;
    let calls = 0;
    // The old completion answers the owner's committed receipt, so only the
    // tenure guard can keep it from acknowledging.
    const consumer = acknowledgingCdcSubscriber({onEvent: async () => {
      calls += 1;
      if (calls === 1) {
        await new Promise((resolve) => {
          finishOld = resolve;
        });
      } else {
        throw new Error('successor subscriber is unavailable');
      }
    }});
    try {
      await leader.subscribeToCDCWithHandshake(consumer, {subscriberId: 'c11'});
      commitHandBuilt(leader, identityOf('c11'), [cdcOperationOf(ROW)]);
      await settleTicks();
      assert.equal(typeof finishOld, 'function');
      leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
      leader.controllablePort.setRole(RAFT_ROLE.LEADER);
      leader.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);
      await settleTicks();
      finishOld();
      await settleTicks();
      // The successor's drive joined the old invocation; once its cleanup
      // closes, the lane redrives on its retry timer (still before the flush
      // deadline), not in the same turn.
      timeSource.advance(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS);
      await settleTicks();
      const beforeDeadline = {
        retried: calls > 1,
        pending: leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements,
      };
      timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
      await settleTicks();
      assert.deepEqual({beforeDeadline, acks: acksOf(proposed).length,
        ...countCdcObligations(leader.db)},
      {beforeDeadline: {retried: true, pending: 0}, acks: 0, owed: 1, delivered: 0});
    } finally {
      if (finishOld) finishOld();
      await shutdownAll(leader);
    }
  });

test('TX1 CDC O12: same-row operations retain their own values and distinct consumer identities',
  async () => {
    const replica = await startCdcReplica(REPLICAS[1]);
    const tx = identityOf('c12');
    try {
      assert.equal(applyCommitted(replica, {
        ...committedQueryOf('c12-insert', CDC_INSERT_SQL),
        params: [ROW.id, ROW.value],
      }), null);
      const operations = ['first', 'second'].map((value, ordinal) => cdcOperationOf(ROW, {
        entryId: `c12-update-${ordinal}`, sql: `UPDATE ${CDC_TABLE} SET value = ? WHERE id = ?`,
        params: [value, ROW.id],
      }));
      const applied = commitHandBuilt(replica, tx, operations);
      const events = operations.map((_operation, ordinal) => {
        const row = readCdcObligation(replica.db, txKey(tx, ordinal));
        return {...JSON.parse(row.eventJson), eventKey: row.eventKey,
          entryId: row.entryId, logIndex: row.logIndex, ordinal: row.ordinal};
      });
      assert.deepEqual({prepare: applied.prepareApply, commit: applied.decisionApply,
        values: events.map((event) => event.data.value),
        identities: new Set(events.map(buildEventIdentity)).size},
      {prepare: null, commit: null, values: ['first', 'second'], identities: 2});
    } finally {
      await shutdownAll(replica);
    }
  });

test('TX1 CDC O13: arbitrary-length UTF-8 event IDs enter ACKs only as fixed digests', () => {
  const short = [{logIndex: 3, events: [ackEvent('x', 0)]}];
  const long = [{logIndex: 3,
    events: [ackEvent(`txop:${'å漢'.repeat(40_000)}:0`, 0)]}];
  assert.equal(acknowledgedBytesOf(long), acknowledgedBytesOf(short));
  assert.equal(long[0].events[0].eventKeyDigest.length, 64);
  assert.deepEqual(Object.keys(long[0].events[0]), ['ordinal', 'eventKeyDigest']);
});


test('TX1 CDC O14: an unknown acknowledgement retries the same command without new traffic',
  async () => {
    const timeSource = new VirtualTimeSource();
    const {leader, proposed} = await startCdcLeader({timeSource});
    try {
      await leader.subscribeToCDCWithHandshake(recordingSubscriber(), {subscriberId: 'c14'});
      commitHandBuilt(leader, identityOf('c14'), [cdcOperationOf(ROW)]);
      await settleTicks();
      timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
      await settleTicks();
      assert.equal(acksOf(proposed).length, 1);
      timeSource.advance(PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS);
      await settleTicks();
      const unknown = leader.cdcDelivery.getCdcObligationDiagnostics().lastFlush?.state;
      timeSource.advance(PARTITION_SERVICE_DEFAULT.CDC_BUFFER_REPLAY_INITIAL_DELAY_MS);
      await settleTicks();
      const attempts = acksOf(proposed);
      const applied = attempts[1] ? applyCommitted(leader, attempts[1]) : 'not retried';
      await settleTicks();
      assert.deepEqual({unknown, attempts: attempts.length,
        sameBytes: attempts.length === 2 &&
          JSON.stringify(attempts[0]) === JSON.stringify(attempts[1]),
        applied, ...countCdcObligations(leader.db)},
      {unknown: FLUSH.OUTCOME_UNKNOWN, attempts: 2, sameBytes: true,
        applied: null, owed: 0, delivered: 1});
    } finally {
      await shutdownAll(leader);
    }
  });

test('TX1 CDC O15: resolved semantic subscriber refusal cannot acknowledge an event', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startCdcLeader({timeSource});
  try {
    await leader.subscribeToCDCWithHandshake({
      async handleCDCEvent() {
        return {success: false, failureCode: 'consumer-unavailable'};
      },
    }, {subscriberId: 'c15'});
    commitHandBuilt(leader, identityOf('c15'), [cdcOperationOf(ROW)]);
    await settleTicks();
    timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
    assert.deepEqual({acks: acksOf(proposed).length,
      pending: leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements,
      ...countCdcObligations(leader.db)},
    {acks: 0, pending: 0, owed: 1, delivered: 0});
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 CDC O16: ordinary writes retain an atomic obligation through later writes and replay',
  async () => {
    const replica = await startCdcReplica(REPLICAS[1]);
    try {
      const command = {...committedQueryOf('c16-insert', CDC_INSERT_SQL),
        params: [ROW.id, ROW.value]};
      const before = durableAppliedIndex(replica);
      plantAppliedStateFailure(replica.db);
      const failed = applyCommitted(replica, command);
      removeAppliedStateFailure(replica.db);
      const rolledBack = {...countCdcObligations(replica.db),
        advance: durableAppliedIndex(replica) - before};
      const applied = applyCommitted(replica, command);
      const first = readCdcObligation(replica.db, 'entry:c16-insert');
      const replay = applyCommitted(replica, command);
      applyCommitted(replica, committedQueryOf('c16-later',
        `UPDATE ${CDC_TABLE} SET value = 'later' WHERE id = '${ROW.id}'`));
      const retained = readCdcObligation(replica.db, 'entry:c16-insert');
      assert.deepEqual({failed, rolledBack, applied, replay,
        firstValue: first && JSON.parse(first.eventJson).data.value,
        samePayload: retained !== null && first.eventJson === retained.eventJson,
        generated: replica.cdcPipelineMetrics.getSnapshot()[
          CDC_PIPELINE_METRIC.EVENTS_GENERATED],
        ...countCdcObligations(replica.db)},
      {failed: 'SQLITE_CONSTRAINT_TRIGGER', rolledBack: {owed: 0, delivered: 0, advance: 0},
        applied: null, replay: null, firstValue: ROW.value, samePayload: true,
        generated: 2, owed: 2, delivered: 0});
    } finally {
      await shutdownAll(replica);
    }
  });

test('TX1 CDC O17: provisional metadata advances formation without acknowledging source debt',
  async () => {
    const timeSource = new VirtualTimeSource();
    const {leader, proposed} = await startCdcLeader({timeSource});
    const seen = [];
    let provisional = true;
    try {
      // Provisional first; then the owner's committed receipt through the one
      // acknowledging fixture (was: undefined, which the receipt gate refuses).
      const acknowledging = acknowledgingCdcSubscriber();
      await leader.subscribeToCDCWithHandshake(async (event) => {
        seen.push(event.data.id);
        return provisional ? buildProvisionalCdcOutcome([event], 50) : acknowledging(event);
      });
      commitHandBuilt(leader, identityOf('c17'), [cdcOperationOf(ROW), cdcOperationOf(ROW_2)]);
      await settleTicks();
      assert.deepEqual(seen, [ROW.id, ROW_2.id], 'later peer metadata must reach ingress');
      assert.deepEqual(countCdcObligations(leader.db), {owed: 2, delivered: 0});
      assert.equal(leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 0);
      assert.equal(leader.cdcEventBuffer.getRecentEvents().length, 0);
      provisional = false;
      timeSource.advance(50);
      await settleTicks();
      timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
      await settleTicks();
      for (const command of acksOf(proposed)) applyCommitted(leader, command);
      await settleTicks();
      assert.deepEqual(countCdcObligations(leader.db), {owed: 0, delivered: 2});
    } finally {
      await shutdownAll(leader);
    }
  });

test('TX1 CDC O18: provisional scanning yields after one page and revisits old debt', async () => {
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startCdcLeader({timeSource});
  try {
    commitHandBuilt(leader, identityOf('c18-a'), rowsOf('a', 256).map(cdcOperationOf));
    commitHandBuilt(leader, identityOf('c18-b'), rowsOf('b', 4).map(cdcOperationOf));
    await settleTicks();
    const seen = [];
    leader.cdcSubscribers.add(async (event) => {
      seen.push(event.data.id);
      return buildProvisionalCdcOutcome([event], 50);
    });
    await leader.cdcDelivery.driveCdcObligations('provisional-page-witness');
    assert.equal(seen.length, 256, 'one bounded page in the first turn');
    timeSource.advance(50);
    await settleTicks();
    assert.equal(new Set(seen).size, 260, 'second page is not starved by provisional page one');
    timeSource.advance(100);
    await settleTicks();
    assert.equal(seen.filter((id) => id === 'a-0').length, 2, 'old debt is revisited');
    assert.equal(acksOf(proposed).length, 0, 'scan cursor is never an acknowledgement');
    assert.deepEqual(countCdcObligations(leader.db), {owed: 260, delivered: 0});
  } finally {
    await shutdownAll(leader);
  }
});

for (const buffered of [true, false]) {
  test(`TX1 CDC O19: provisional ${buffered ? 'buffered' : 'sliding'} handshake stays incomplete`,
    async () => {
      const timeSource = new VirtualTimeSource();
      const {leader} = await startCdcLeader({timeSource});
      try {
        const event = {tableName: CDC_TABLE, operation: 'UPSERT', data: ROW,
          timestamp: leader.hlcClock.now().toString(), sourcePartition: PARTITION_ID,
          eventKey: 'handshake-event'};
        if (buffered) leader.cdcEventBuffer.buffer(event);
        else leader.cdcEventBuffer.recordDelivered(event);
        let completed = 0;
        leader.on(PARTITION_SERVICE_EVENT.CDC_CATCHUP_COMPLETED, () => {
          completed += 1;
        });
        const subscriber = async (received) => buildProvisionalCdcOutcome([received], 50);
        const answer = await leader.subscribeToCDCWithHandshake(subscriber);
        assert.equal(answer.catchup.completed, false);
        assert.equal(answer.catchup.completedAt, null);
        assert.equal(answer.catchup.provisionalEvents, 1);
        assert.equal(completed, 0, 'no semantic completion announcement');
        assert.equal(leader.cdcSubscriberStates.get(subscriber).lastDeliveredAt, null);
        assert.equal(leader.cdcEventBuffer.size(), buffered ? 1 : 0);
      } finally {
        await shutdownAll(leader);
      }
    });
}

// --- O20/O21: the recording rule (owner decision D2) ---

const POLICY_WRITES = 40;
const policyStamp = (index) => new HLCTimestamp(1, index, 'cdc-policy').toString();
const committedWrite = (entryId, sql, params, index) => ({...committedQueryOf(entryId, sql),
  params, timestamp: policyStamp(index)});
// One committed ordinary write per index on each table, in its real shape (a
// user table is the fixture table; the system tables carry their schemas).
const POLICY_TABLES = Object.freeze({
  user: {extra: {}, write: (index) => committedWrite(`pu-${index}`, INSERT_SQL,
    [`pu-${index}`, `v-${index}`], index)},
  [TABLES.LOGS]: {extra: {tableName: TABLES.LOGS, schema: getSchemaByTableName(TABLES.LOGS)},
    write: (index) => committedWrite(`pl-${index}`, 'INSERT OR REPLACE INTO logs (log_id, ' +
      'timestamp, level, node_id, service_id, service_type, message, trace_id, metadata, ' +
      'created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [`log-${index}`, index, 'info',
      'node-a', null, null, `line ${index}`, null, null, index], index)},
  [TABLES.SQL_WRITE_OPERATIONS]: {extra: {tableName: TABLES.SQL_WRITE_OPERATIONS,
    schema: getSchemaByTableName(TABLES.SQL_WRITE_OPERATIONS)},
  write: (index) => committedWrite(`ps-${index}`, 'INSERT INTO sql_write_operations ' +
    '(operation_id, statement_type, status, idempotency_key, payload_hash, partition_ids, ' +
    'retry_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  [`op-${index}`, 'INSERT', 'pending', `key-${index}`, 'hash', '[]', 0, index, index], index)},
  [TABLES.MESSAGE_GROUPS]: {extra: {tableName: TABLES.MESSAGE_GROUPS,
    schema: getSchemaByTableName(TABLES.MESSAGE_GROUPS)},
  write: (index) => committedWrite(`pm-${index}`, 'INSERT INTO message_groups (group_id, ' +
    'group_name, replica_count, policy, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  [`group-${index}`, `group ${index}`, 3, '{}', index, index], index)},
});
function applyPolicyWrites(replica, table) {
  const failures = [];
  for (let index = 0; index < POLICY_WRITES; index += 1) {
    const failure = applyCommitted(replica, POLICY_TABLES[table].write(index));
    if (failure !== null) failures.push(failure);
  }
  return failures;
}
const ledgerImage = (replica) => readOwedCdcObligations(replica.db, {limit: 100_000})
  .map((row) => [row.eventKey, row.logIndex, row.ordinal, row.eventJson]);

test('TX1 CDC O20: writes to a user table, logs and sql_write_operations record no ' +
  'obligation; a propagated system table records one per write and delivers it', async () => {
  const facts = {};
  for (const table of ['user', TABLES.LOGS, TABLES.SQL_WRITE_OPERATIONS]) {
    const replica = await startReplica(REPLICAS[1], POLICY_TABLES[table].extra);
    try {
      const failures = applyPolicyWrites(replica, table);
      if (table === 'user') {
        // A committed participant decision of two operations: traffic, no CDC.
        const decided = commitHandBuilt(replica, identityOf('c20-user'),
          [operationOf(ROW, {sql: INSERT_SQL}), operationOf(ROW_2, {sql: INSERT_SQL})]);
        failures.push(...[decided.prepareApply, decided.decisionApply]
          .filter((failure) => failure !== null));
      }
      await settleTicks();
      facts[table] = {failures, ...countCdcObligations(replica.db),
        generated: replica.cdcPipelineMetrics.getSnapshot()[
          CDC_PIPELINE_METRIC.EVENTS_GENERATED] ?? 0,
        traffic: replica.writeTraffic.getSnapshot().committedWrites};
    } finally {
      await shutdownAll(replica);
    }
  }
  const timeSource = new VirtualTimeSource();
  const {leader, proposed} = await startLeader({...POLICY_TABLES[TABLES.MESSAGE_GROUPS].extra,
    timeSource});
  const consumer = recordingSubscriber();
  try {
    const failures = applyPolicyWrites(leader, TABLES.MESSAGE_GROUPS);
    await settleTicks();
    const recorded = countCdcObligations(leader.db);
    await leader.subscribeToCDCWithHandshake(consumer, {subscriberId: 'c20'});
    await settleTicks();
    timeSource.advance(BOUND.ACK_FLUSH_DEADLINE_MS);
    await settleTicks();
    for (const ack of acksOf(proposed)) applyCommitted(leader, ack);
    await settleTicks();
    facts[TABLES.MESSAGE_GROUPS] = {failures, recorded,
      received: consumer.applied.size, tables: [...new Set(consumer.events.map(
        (event) => event.tableName))], after: countCdcObligations(leader.db)};
  } finally {
    await shutdownAll(leader);
  }
  const none = {failures: [], owed: 0, delivered: 0, generated: 0, traffic: POLICY_WRITES};
  // The split traffic signal counts every committed write, CDC or not.
  assert.deepEqual(facts, {user: {...none, traffic: POLICY_WRITES + 2}, [TABLES.LOGS]: none,
    [TABLES.SQL_WRITE_OPERATIONS]: none,
    [TABLES.MESSAGE_GROUPS]: {failures: [], recorded: {owed: POLICY_WRITES, delivered: 0},
      received: POLICY_WRITES, tables: [TABLES.MESSAGE_GROUPS],
      after: {owed: 0, delivered: POLICY_WRITES}}},
  'a table nobody consumes owes nothing; internal propagation keeps its obligation');
});

test('TX1 CDC O21: the recording decision is identical on every replica of a three-replica ' +
  'group, with a subscriber attached on one replica only', async () => {
  const facts = {};
  for (const table of Object.keys(POLICY_TABLES)) {
    const {leader} = await startLeader(POLICY_TABLES[table].extra);
    const followers = [];
    const consumer = recordingSubscriber({ready: false});
    try {
      followers.push(await startReplica(REPLICAS[1], POLICY_TABLES[table].extra));
      followers.push(await startReplica(REPLICAS[2], POLICY_TABLES[table].extra));
      await leader.subscribeToCDCWithHandshake(consumer, {subscriberId: `c21-${table}`});
      const replicas = [leader, ...followers];
      const failures = replicas.flatMap((replica) => applyPolicyWrites(replica, table));
      await settleTicks();
      const images = replicas.map(ledgerImage);
      facts[table] = {failures, subscribers: replicas.map((replica) => replica.cdcSubscribers.size),
        owed: images.map((image) => image.length),
        identical: images.every((image) => JSON.stringify(image) === JSON.stringify(images[0]))};
    } finally {
      await shutdownAll(leader, ...followers);
    }
  }
  const expected = (owed) => ({failures: [], subscribers: [1, 0, 0],
    owed: [owed, owed, owed], identical: true});
  assert.deepEqual(facts, {user: expected(0), [TABLES.LOGS]: expected(0),
    [TABLES.SQL_WRITE_OPERATIONS]: expected(0),
    [TABLES.MESSAGE_GROUPS]: expected(POLICY_WRITES)},
  'every replica records the same ledger rows whatever its subscribers');
});
