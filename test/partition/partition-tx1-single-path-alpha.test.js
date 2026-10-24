/**
 * Red witness for Quest tx1-single-path-alpha.  These requests enter through
 * the production partition application-message boundary.  The fixture keeps
 * its natural current release/origin state; no historical session or release
 * bypass is manufactured.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {PARTITION_SERVICE_ERROR_MSG, PARTITION_SERVICE_MESSAGE_TYPE} from
  '../../src/partition/partition-service-constants.js';
import {QUERY_ERROR_CODE, QUERY_OPERATION} from '../../src/query/query-constants.js';
import {hasParticipantSession} from
  '../../src/partition/partition-participant-transaction-session.js';
import {
  INSERT_SQL,
  OTHER_ROW,
  REPLICAS,
  ROW,
  TABLE,
  applyCommitted,
  applyProposal,
  awaitProposal,
  beginMessage,
  clearFixtureSingletons,
  commitOrdinaryWrite,
  commitMessage,
  identityOf,
  isPrepareCommand,
  isDecisionCommand,
  onFixtureLeader as onLeader,
  prepareMessage,
  queryMessage,
  resetFixtureSingletons,
  rowCount,
  send,
  settleTicks,
  shutdownAll,
  startReplica,
  track,
} from '../test-helpers/participant-transaction-fixture.js';

const IDENTITY_REQUIRED = CODE.IDENTITY_REQUIRED;
const answerCode = (answer) => answer?.failureCode ?? null;
const ingressRefusal = (answer) => ({
  acknowledged: answer?.acknowledged === true,
  error: answer?.error ?? null,
});
const transactionRequest = (operation, sessionId = 'single-path-routing') => ({
  type: PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION,
  operation,
  sessionId,
});
const ordinaryQuery = (sessionId, fields = {}) => ({
  type: PARTITION_SERVICE_MESSAGE_TYPE.QUERY,
  sql: `SELECT id FROM ${TABLE} ORDER BY id`,
  params: [],
  sessionId,
  ...fields,
});
// Whether a QUERY was served, its error, and whether it asks to be retried.
const servingAnswerOf = (answer) => ({success: answer?.success, error: answer?.error,
  deferRetry: answer?.deferRetry === true});
// The decision command proposed for this transaction.
const isDecisionOf = (tx) => (entry) =>
  isDecisionCommand(entry) && entry.transactionId === tx.transactionId;
const tableFact = (db, tableName) => {
  const exists = db.prepare(
    'SELECT COUNT(*) AS count FROM sqlite_master WHERE type = ? AND name = ?',
  ).get('table', tableName).count === 1;
  return {exists, rows: exists ?
    db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count : 0};
};
const transactionRows = (leader) => ({
  current: tableFact(leader.db, '_participant_transactions'),
  retired: tableFact(leader.db, '_transaction_outcomes'),
});
function registeredTransportHarness() {
  let registeredHandler = null;
  return {
    handler: () => registeredHandler,
    transport: {
      register(_address, handler) {
        registeredHandler = handler;
      },
      getRegisteredHandler() {
        return registeredHandler;
      },
      unregisterExact(_address, handler) {
        if (handler !== registeredHandler) return false;
        registeredHandler = null;
        return true;
      },
      async deliver() {
        return {acknowledged: true};
      },
    },
  };
}

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

test('TX1 alpha red: every identity-less transaction control reaches current identity ' +
  'admission and has zero effects', () => onLeader(async (leader, proposed) => {
  const operations = [
    QUERY_OPERATION.BEGIN,
    QUERY_OPERATION.PREPARE,
    QUERY_OPERATION.COMMIT,
    QUERY_OPERATION.ROLLBACK,
    QUERY_OPERATION.TRANSACTION_OUTCOME,
  ];
  const before = {
    sqliteOpen: leader.db.inTransaction,
    participantSession: hasParticipantSession(leader),
    proposed: proposed.length,
    rows: rowCount(leader),
    transactionRows: transactionRows(leader),
  };
  const codes = [];
  for (const operation of operations) {
    codes.push(answerCode(await send(leader, transactionRequest(operation))));
  }
  const after = {
    sqliteOpen: leader.db.inTransaction,
    participantSession: hasParticipantSession(leader),
    proposed: proposed.length,
    rows: rowCount(leader),
    transactionRows: transactionRows(leader),
  };
  assert.deepEqual({codes, before, after}, {
    codes: operations.map(() => IDENTITY_REQUIRED),
    before: {sqliteOpen: false, participantSession: false, proposed: 0, rows: 0,
      transactionRows: {current: {exists: true, rows: 0},
        retired: {exists: false, rows: 0}}},
    after: {sqliteOpen: false, participantSession: false, proposed: 0, rows: 0,
      transactionRows: {current: {exists: true, rows: 0},
        retired: {exists: false, rows: 0}}},
  }, 'session routing context never selects another transaction protocol');
}));

test('TX1 alpha red: own partial identity, inherited identity and accessors cannot become ' +
  'ordinary query traffic at the registered transport boundary', async () => {
  const harness = registeredTransportHarness();
  await onLeader(async (_leader) => {
    const registeredHandler = harness.handler();
    assert.equal(typeof registeredHandler, 'function');
    const partials = [
      {transactionId: undefined},
      {transactionId: null},
      {transactionId: ''},
      {participantId: 'partial:tx1-v3'},
      {commitMode: 'TWO_PHASE_COMMIT'},
      {transactionEpoch: 7},
    ];
    const partialCodes = [];
    for (const fields of partials) {
      partialCodes.push(answerCode(await registeredHandler(
        ordinaryQuery('partial-routing', fields))));
    }

    const inheritedIdentity = identityOf('single-path-inherited');
    const inherited = Object.assign(Object.create(inheritedIdentity), {
      type: PARTITION_SERVICE_MESSAGE_TYPE.QUERY,
      sql: `SELECT id FROM ${TABLE}`,
      params: [],
    });
    const inheritedRefusal = ingressRefusal(await registeredHandler(inherited));

    let accessorReads = 0;
    const accessor = ordinaryQuery('accessor-routing');
    Object.defineProperty(accessor, 'transactionId', {
      enumerable: true,
      get() {
        accessorReads += 1;
        return 'single-path-accessor';
      },
    });
    const accessorRefusal = ingressRefusal(await registeredHandler(accessor));

    const symbol = ordinaryQuery('symbol-routing', {participantId: 'symbol:tx1-v3'});
    symbol[Symbol('identity')] = 'hidden';
    const symbolRefusal = ingressRefusal(await registeredHandler(symbol));

    let proxyReads = 0;
    const proxy = new Proxy(ordinaryQuery('proxy-routing',
      {participantId: 'proxy:tx1-v3'}), {
      get(target, key, receiver) {
        proxyReads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const proxyRefusal = ingressRefusal(await registeredHandler(proxy));

    let typeAccessorReads = 0;
    const typeAccessor = ordinaryQuery('type-accessor-routing',
      {participantId: 'type-accessor:tx1-v3'});
    Object.defineProperty(typeAccessor, 'type', {
      enumerable: true,
      get() {
        typeAccessorReads += 1;
        return PARTITION_SERVICE_MESSAGE_TYPE.QUERY;
      },
    });
    const typeAccessorRefusal = ingressRefusal(await registeredHandler(typeAccessor));

    let payloadAccessorReads = 0;
    const payloadAccessor = {};
    Object.defineProperty(payloadAccessor, 'payload', {
      enumerable: true,
      get() {
        payloadAccessorReads += 1;
        return ordinaryQuery('payload-accessor-routing');
      },
    });
    const payloadAccessorRefusal = ingressRefusal(
      await registeredHandler(payloadAccessor));

    const ordinary = await registeredHandler(ordinaryQuery('unrelated-routing'));
    const invalid = {acknowledged: false, error: PARTITION_SERVICE_ERROR_MSG.INVALID_MESSAGE};
    assert.deepEqual({partialCodes, inheritedRefusal, accessorRefusal, accessorReads,
      symbolRefusal, proxyRefusal, proxyReads, typeAccessorRefusal, typeAccessorReads,
      payloadAccessorRefusal, payloadAccessorReads,
      ordinary: {success: ordinary?.success, rows: ordinary?.rows}}, {
      partialCodes: partials.map(() => IDENTITY_REQUIRED),
      inheritedRefusal: invalid,
      accessorRefusal: invalid,
      accessorReads: 0,
      symbolRefusal: invalid,
      proxyRefusal: invalid,
      proxyReads: 0,
      typeAccessorRefusal: invalid,
      typeAccessorReads: 0,
      payloadAccessorRefusal: invalid,
      payloadAccessorReads: 0,
      ordinary: {success: true, rows: []},
    }, 'only a strict own-data ordinary request may reach ordinary query execution');
  }, {transport: harness.transport});
});

test('TX1 alpha: registered transport preserves direct and wrapped application and Raft ' +
  'envelopes after strict extraction', async () => {
  const harness = registeredTransportHarness();
  await onLeader(async (leader) => {
    const registeredHandler = harness.handler();
    const application = ordinaryQuery('strict-envelope-routing');
    const applicationAnswers = [];
    applicationAnswers.push(await registeredHandler(application));
    applicationAnswers.push(await registeredHandler({payload: application}));
    applicationAnswers.push(await registeredHandler({payload: {
      messageId: 'strict-envelope-message',
      payload: application,
      sourceGroup: 'strict-envelope-group',
      sourceReplica: 'strict-envelope-replica',
    }}));
    const packet = {
      protocol: 'raft-rs',
      groupId: leader.partitionId,
      from: '101',
      to: '202',
      message: {msgType: 3, from: '101', to: '202'},
    };
    const raftAnswers = [];
    raftAnswers.push(await registeredHandler(packet));
    raftAnswers.push(await registeredHandler({payload: packet}));
    raftAnswers.push(await registeredHandler({payload: {
      messageId: 'strict-raft-message',
      payload: packet,
      sourceGroup: 'strict-raft-group',
      sourceReplica: 'strict-raft-replica',
    }}));
    assert.deepEqual({application: applicationAnswers.map((answer) => ({
      acknowledged: answer?.acknowledged, success: answer?.success,
      rows: answer?.rows,
    })), raft: raftAnswers,
    stepped: leader.controllablePort.steps.length}, {
      application: Array.from({length: 3}, () => ({
        acknowledged: true, success: true, rows: [],
      })),
      raft: Array.from({length: 3}, () => ({acknowledged: true})),
      stepped: 3,
    });
  }, {transport: harness.transport});
});

test('TX1 alpha red: boxed and non-finite epochs stay with the canonical identity validator ' +
  'even when the ambient Number intrinsic is replaced', () => onLeader(async (leader) => {
  const malformedEpochs = [Object(7), Number.NaN, Number.POSITIVE_INFINITY];
  const ordinaryCodes = [];
  for (const transactionEpoch of malformedEpochs) {
    const identity = identityOf(`single-path-epoch-${ordinaryCodes.length}`, {transactionEpoch});
    ordinaryCodes.push(answerCode(await send(leader, beginMessage(identity))));
  }

  const nativeSafeInteger = Number.isSafeInteger;
  const nativeSome = Array.prototype.some;
  let replacedIntrinsicCode;
  let replacedSomeCode;
  try {
    Number.isSafeInteger = () => true;
    replacedIntrinsicCode = answerCode(await send(leader, beginMessage(identityOf(
      'single-path-replaced-intrinsic', {transactionEpoch: Object(7)}))));
    // eslint-disable-next-line no-extend-native
    Array.prototype.some = () => false;
    replacedSomeCode = answerCode(await send(leader, ordinaryQuery(
      'single-path-replaced-some', {participantId: 'replaced-some:tx1-v3'})));
  } finally {
    Number.isSafeInteger = nativeSafeInteger;
    // eslint-disable-next-line no-extend-native
    Array.prototype.some = nativeSome;
  }
  assert.deepEqual({ordinaryCodes, replacedIntrinsicCode, replacedSomeCode,
    participantSession: hasParticipantSession(leader)}, {
    ordinaryCodes: malformedEpochs.map(() => IDENTITY_REQUIRED),
    replacedIntrinsicCode: IDENTITY_REQUIRED,
    replacedSomeCode: IDENTITY_REQUIRED,
    participantSession: false,
  }, 'identity validity remains the canonical owner decision under hostile intrinsics');
}));

test('TX1 alpha red: malformed current identity is refused before ordinary epoch gates while ' +
  'valid current identity retains their order', async () => {
  const follower = await startReplica(REPLICAS[1]);
  try {
    const expectedPartitionVersion = 4;
    const partial = await send(follower, {
      type: PARTITION_SERVICE_MESSAGE_TYPE.QUERY,
      sql: INSERT_SQL,
      params: [ROW.id, ROW.value],
      sessionId: 'partial-write-routing',
      participantId: 'partial-write:tx1-v3',
      expectedPartitionVersion,
    });
    const valid = await send(follower, {
      ...queryMessage(identityOf('single-path-valid-order'), INSERT_SQL,
        [ROW.id, ROW.value]),
      expectedPartitionVersion,
    });
    assert.deepEqual({partial: answerCode(partial),
      valid: {failureCode: answerCode(valid), errorCode: valid?.errorCode ?? null,
        deferRetry: valid?.deferRetry === true}, rows: rowCount(follower)}, {
      partial: IDENTITY_REQUIRED,
      valid: {failureCode: null,
        errorCode: QUERY_ERROR_CODE.PARTITION_EPOCH_EVIDENCE_DEFERRED,
        deferRetry: true},
      rows: 0,
    }, 'identity refusal precedes ordinary gates without moving valid-current execution');
  } finally {
    await shutdownAll(follower);
  }
});

test('TX1 alpha red: routing-only query collision is refused for volatile and durable current ' +
  'custody while an unrelated routing session remains ordinary', () => onLeader(
  async (leader, proposed) => {
    const seeded = await commitOrdinaryWrite(leader, proposed,
      'single-path-ordinary-seed', OTHER_ROW);
    const tx = identityOf('single-path-collision', {sessionId: 'collision-routing'});
    assert.equal((await send(leader, beginMessage(tx)))?.success, true);

    const volatile = await send(leader, {
      type: PARTITION_SERVICE_MESSAGE_TYPE.QUERY,
      sql: INSERT_SQL,
      params: [ROW.id, ROW.value],
      sessionId: tx.sessionId,
    });
    const unrelated = await send(leader, ordinaryQuery('unrelated-routing'));

    const prepare = track(send(leader, prepareMessage(tx)));
    const command = await awaitProposal(proposed, isPrepareCommand);
    const preparing = await send(leader, ordinaryQuery(tx.sessionId));
    const prepareApply = command === null ? 'not proposed' : applyCommitted(leader, command);
    await settleTicks();
    const preparedAnswer = prepare.settled ? prepare.value : null;
    const durable = await send(leader, ordinaryQuery(tx.sessionId));
    const sealedOperations = command === null ? null : JSON.parse(command.operationsText).length;
    const decision = track(send(leader,
      commitMessage(tx, command?.preparedDigest)));
    const {apply: decisionApply} = await applyProposal(leader, proposed, isDecisionOf(tx));
    await settleTicks();
    const terminal = await send(leader, ordinaryQuery(tx.sessionId));

    assert.deepEqual({volatile: answerCode(volatile), preparing: answerCode(preparing),
      durable: answerCode(durable),
      unrelated: {success: unrelated?.success, rows: unrelated?.rows},
      prepare: {apply: prepareApply, success: preparedAnswer?.success === true},
      decision: {apply: decisionApply, state: decision.value?.state},
      terminal: {success: terminal?.success, rows: terminal?.rows},
      seeded,
      sealedOperations,
      proposedOrdinaryWrites: proposed.filter((entry) => entry.sql !== undefined).length,
      seededRows: rowCount(leader, OTHER_ROW.id),
      collisionRows: rowCount(leader, ROW.id)}, {
      volatile: IDENTITY_REQUIRED,
      preparing: IDENTITY_REQUIRED,
      durable: IDENTITY_REQUIRED,
      unrelated: {success: true, rows: [{id: OTHER_ROW.id}]},
      prepare: {apply: null, success: true},
      decision: {apply: null, state: 'COMMITTED'},
      terminal: {success: true, rows: [{id: OTHER_ROW.id}]},
      seeded: {apply: null, answer: true},
      sealedOperations: 0,
      proposedOrdinaryWrites: 1,
      seededRows: 1,
      collisionRows: 0,
    }, 'routing context cannot absorb or autocommit current transaction work');
  }));

test('TX1 alpha: removal keeps malformed and colliding QUERY with the participant owner and ' +
  'drains durable PREPARED custody through its decision', () => onLeader(
  async (leader, proposed) => {
    const tx = identityOf('single-path-removal', {sessionId: 'removal-routing'});
    assert.equal((await send(leader, beginMessage(tx)))?.success, true);

    const fence = leader.fenceServingAdmissionForRemoval();
    const partial = await send(leader, ordinaryQuery('partial-removal',
      {participantId: 'partial-removal:tx1-v3'}));
    const collision = await send(leader, ordinaryQuery(tx.sessionId));
    const heldCurrent = await send(leader, queryMessage(tx,
      `SELECT id FROM ${TABLE} ORDER BY id`));
    const absentCurrent = await send(leader, queryMessage(
      identityOf('single-path-removal-absent'),
      `SELECT id FROM ${TABLE} ORDER BY id`));
    const unrelated = await send(leader, ordinaryQuery('unrelated-removal'));
    const prepare = track(send(leader, prepareMessage(tx)));
    const {entry: prepareCommand, apply: prepareApply} =
      await applyProposal(leader, proposed, isPrepareCommand);
    await settleTicks();
    const drain = track(leader.waitForRemovalServingDrain({pollIntervalMs: 1}));
    await settleTicks();
    const pendingBeforeDecision = drain.settled;

    const decision = track(send(leader,
      commitMessage(tx, prepareCommand?.preparedDigest)));
    const {apply: decisionApply} = await applyProposal(leader, proposed, isDecisionOf(tx));
    await Promise.all([decision.promise, drain.promise]);

    assert.deepEqual({prepareApply, prepared: prepare.value?.state,
      fence, partial: answerCode(partial), collision: answerCode(collision),
      heldCurrent: {success: heldCurrent?.success, rows: heldCurrent?.rows},
      absentCurrent: servingAnswerOf(absentCurrent),
      unrelated: servingAnswerOf(unrelated),
      pendingBeforeDecision, decisionApply, decision: decision.value?.state,
    }, {
      prepareApply: null,
      prepared: 'PREPARED',
      fence: {activeServingRequestCount: 0, participantTransactionActive: true},
      partial: IDENTITY_REQUIRED,
      collision: IDENTITY_REQUIRED,
      heldCurrent: {success: true, rows: []},
      absentCurrent: {success: false,
        error: PARTITION_SERVICE_ERROR_MSG.SERVING_ADMISSION_FENCED_FOR_REMOVAL,
        deferRetry: true},
      unrelated: {success: false,
        error: PARTITION_SERVICE_ERROR_MSG.SERVING_ADMISSION_FENCED_FOR_REMOVAL,
        deferRetry: true},
      pendingBeforeDecision: false,
      decisionApply: null,
      decision: 'COMMITTED',
    }, 'removal reuses current identity, collision, reservation and decision owners');
  }));
