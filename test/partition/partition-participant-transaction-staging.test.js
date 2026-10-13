/**
 * TX1 (quest replicated-transaction-decision-and-apply) increment 4: the
 * participant's session side. Staging under F6 c' (no SQLite transaction
 * across requests; every statement replays the staged operations inside one
 * transaction that rolls back), the staging classifier and the leader's
 * self-check (partition-transaction-determinism.js), the sealed PREPARE kept
 * for re-proposal, the parked reserved writers' release on demotion, the hold
 * sweep, the L6 fences between the legacy and the participant protocols, the
 * generation table's origin columns at open, and the classifier owner's
 * vetting of HaltIfNull (list tx1-leg-a-2); and, from the corrective round,
 * the envelope's and the parked writers' post-commit effects, the param
 * narrowing, the hold sweep of an in-flight PREPARE, typed read failures and
 * the retained last insert rowid of committed statements. The sealed
 * witnesses are
 * W5a, W5b, W6, W7a, W7b, W12d, W13, W14, W16 and W20
 * (partition-transaction-replicated-apply-v3.test.js) and W6n, W6s, W6r and
 * W6r-b (partition-transaction-replay-cursor-v4.test.js); these cover what
 * they leave out. Fixture: test/test-helpers/participant-transaction-fixture.js.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import Database from 'better-sqlite3';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {runDeterminismSelfCheck} from
  '../../src/partition/partition-transaction-determinism.js';
import {TRANSACTION_CLASSIFIER_LAYER as LAYER} from
  '../../src/partition/partition-transaction-determinism-constants.js';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
  PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG,
  PARTICIPANT_TRANSACTION_REPLAY_BOUND as BOUND,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {
  ENVELOPE, GENERATION_ORIGIN_INDEX, INSERT_SQL, IPK_SCHEMA, OTHER_ROW, PARTITION_ID, REPLICAS,
  ROW, ROW_2, TABLE, V3, applyCommitted, awaitProposal, beginMessage, clearFixtureSingletons,
  commitOrdinaryWrite, decisionCommandOf, envelopeDiagnosticsOf, generationOf, hasEntryId,
  identityOf, isPrepareCommand, onFixtureLeader as onLeader, operationOf, ordinaryWriteOf,
  originCommandOf, originOf, outcomeOf, pick, plantAppliedStateFailure, prepareCommandOf,
  prepareMessage, queryMessage, removeAppliedStateFailure, resetFixtureSingletons, send,
  resumeFixtureParticipantAdmission, settleTicks, shutdownAll, startLeader, startReplica,
  temporaryDbPath, track, txMessage,
} from '../test-helpers/participant-transaction-fixture.js';

const NOT_LEADER = 'partition_write_not_leader';
const refusedWith = (failureCode, refusalLayer) => ({success: false, failureCode,
  refusalLayer});
const nondeterministic = (layer) => refusedWith(CODE.SESSION_WRITE_NONDETERMINISTIC, layer);
// A legacy (sessionId-only) TRANSACTION request.
const legacyMessage = (operation, sessionId, extra = {}) => ({type: 'TRANSACTION',
  operation, sessionId, ...extra});
const answerOf = (answer) => pick(answer, ['success', 'failureCode', 'refusalLayer']);
const proposedParticipantCommands = (proposed, tx) =>
  proposed.filter((entry) => entry.transactionId === tx.transactionId).length;

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

// --- c': the replay owns every session statement ---

test('TX1 inc4 c\': a staged operation that no longer replays dooms its session: every later ' +
  'statement and its PREPARE answer replay_diverged, nothing is proposed, and an unbound ' +
  'ROLLBACK discards it', () => onLeader(async (leader, proposed) => {
  const tx = identityOf('i4-doom');
  await send(leader, beginMessage(tx));
  const facts = {staged: answerOf(await send(leader, queryMessage(tx, INSERT_SQL,
    [ROW.id, ROW.value])))};
  // A committed write takes the staged key: the staged insert no longer runs.
  facts.colliding = await commitOrdinaryWrite(leader, proposed, 'i4-doom-collide', ROW);
  facts.write = answerOf(await send(leader, queryMessage(tx, INSERT_SQL,
    [ROW_2.id, ROW_2.value])));
  facts.read = answerOf(await send(leader, queryMessage(tx, `SELECT id FROM ${TABLE}`)));
  facts.prepare = answerOf(await send(leader, prepareMessage(tx)));
  facts.proposed = proposedParticipantCommands(proposed, tx);
  facts.rollback = pick(await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, tx)),
    ['success', 'durable']);
  facts.after = await outcomeOf(leader, tx);
  const diverged = {success: false, failureCode: CODE.REPLAY_DIVERGED, refusalLayer: null};
  assert.deepEqual(facts, {staged: {success: true, failureCode: null, refusalLayer: null},
    colliding: {apply: null, answer: true}, write: diverged, read: diverged, prepare: diverged,
    proposed: 0, rollback: {success: true, durable: false},
    after: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.ABSENT}},
  'a session whose replay diverged never prepares');
}));

test('TX1 inc4 c\': the replay bound refuses the 257th operation and an operations text over ' +
  '1 MiB with replay_budget_exceeded, staging nothing; the staged prefix still prepares',
() => onLeader(async (leader, proposed) => {
  const tx = identityOf('i4-bound');
  await send(leader, beginMessage(tx));
  const staged = [];
  for (let ordinal = 0; ordinal < BOUND.MAX_OPERATIONS; ordinal += 1) {
    staged.push((await send(leader, queryMessage(tx, INSERT_SQL,
      [`b-${ordinal}`, 'v'])))?.success === true);
  }
  const facts = {staged: staged.every(Boolean) ? staged.length : staged.indexOf(false),
    over: answerOf(await send(leader, queryMessage(tx, INSERT_SQL, ['b-over', 'v'])))};
  const wide = identityOf('i4-bound-bytes');
  const {leader: other} = await startLeader();
  try {
    await send(other, beginMessage(wide));
    facts.bytes = answerOf(await send(other, queryMessage(wide, INSERT_SQL,
      ['wide', 'x'.repeat(BOUND.MAX_BYTES)])));
  } finally {
    await shutdownAll(other);
  }
  track(send(leader, prepareMessage(tx)));
  const command = await awaitProposal(proposed, isPrepareCommand);
  facts.sealed = command ? JSON.parse(command.operationsText).length : null;
  const exceeded = {success: false, failureCode: CODE.REPLAY_BUDGET_EXCEEDED,
    refusalLayer: null};
  assert.deepEqual(facts, {staged: BOUND.MAX_OPERATIONS, over: exceeded, bytes: exceeded,
    sealed: BOUND.MAX_OPERATIONS}, 'the replay\'s work is bounded by count and bytes');
}));

test('TX1 inc4 c\': a statement that does not compile, or fails deterministically over the ' +
  'replay, is refused statement_failed; a param that is not a JSON scalar is refused; ' +
  'nothing refused is staged', () => onLeader(async (leader, proposed) => {
  const tx = identityOf('i4-failed');
  await send(leader, beginMessage(tx));
  const stage = async (sql, params) => answerOf(await send(leader, queryMessage(tx, sql, params)));
  const facts = {first: await stage(INSERT_SQL, [ROW.id, ROW.value]),
    compile: await stage(`INSERT INTO ${TABLE} (id, missing) VALUES (?, ?)`, ['m', 'v']),
    duplicate: await stage(INSERT_SQL, [ROW.id, 'again']),
    params: [await stage(INSERT_SQL, ['p1', true]), await stage(INSERT_SQL, ['p2', {v: 1}]),
      await stage(INSERT_SQL, ['p3', Number.NaN])]};
  track(send(leader, prepareMessage(tx)));
  const command = await awaitProposal(proposed, isPrepareCommand);
  facts.sealed = command ? JSON.parse(command.operationsText).map((op) => op.params) : null;
  const unsupported = {success: false, failureCode: CODE.SESSION_WRITE_PARAM_UNSUPPORTED,
    refusalLayer: null};
  assert.deepEqual(facts, {first: {success: true, failureCode: null, refusalLayer: null},
    compile: refusedWith(CODE.STATEMENT_FAILED, LAYER.COMPILE),
    duplicate: {success: false, failureCode: CODE.STATEMENT_FAILED, refusalLayer: null},
    params: [unsupported, unsupported, unsupported], sealed: [[ROW.id, ROW.value]]},
  'only statements that ran over the replay are staged');
}));

// --- the classifier on the session path ---

test('TX1 inc4 classifier: increment 2\'s OR ROLLBACK and table rules hold on the session ' +
  'path, an INTEGER PRIMARY KEY is assigned only explicit in-range integers (UPDATE SET, row ' +
  'value and upsert alike), and a declared false refusal refuses at its layer', () =>
  onLeader(async (leader) => {
    const tx = identityOf('i4-classify');
    await send(leader, beginMessage(tx));
    const stage = async (sql, params = []) =>
      answerOf(await send(leader, queryMessage(tx, sql, params)));
    const facts = {
      orRollback: await stage(`INSERT OR ROLLBACK INTO ${TABLE} (id, value) VALUES (?, ?)`,
        [1, 'v']),
      foreignTable: await stage('INSERT INTO _participant_transactions (transaction_id, ' +
        'participant_id, commit_mode, transaction_epoch, state) VALUES (?, ?, ?, ?, ?)',
      ['x', 'x:p', 'm', 1, 'PREPARED']),
      updateKey: await stage(`UPDATE ${TABLE} SET id = ? WHERE id = ?`, [3, 5]),
      updateKeyExpression: await stage(`UPDATE ${TABLE} SET id = id + 1 WHERE id = ?`, [3]),
      updateKeyOutOfRange: await stage(`UPDATE ${TABLE} SET id = ? WHERE id = ?`,
        [2 ** 62, 3]),
      rowValueKey: await stage(`UPDATE ${TABLE} SET (id, value) = (?, ?) WHERE id = ?`,
        [4, 'v', 3]),
      upsertKey: await stage(`INSERT INTO ${TABLE} (id, value) VALUES (?, ?) ON CONFLICT ` +
        '(id) DO UPDATE SET id = excluded.id + 1', [6, 'v']),
      like: await stage(`DELETE FROM ${TABLE} WHERE value LIKE ?`, ['v%']),
    };
    assert.deepEqual(facts, {orRollback: nondeterministic(LAYER.STATEMENT_CONFLICT),
      foreignTable: nondeterministic(LAYER.STATEMENT_TABLE),
      updateKey: {success: true, failureCode: null, refusalLayer: null},
      updateKeyExpression: nondeterministic(LAYER.IMPLICIT_KEY),
      updateKeyOutOfRange: nondeterministic(LAYER.IMPLICIT_KEY),
      rowValueKey: nondeterministic(LAYER.IMPLICIT_KEY),
      upsertKey: nondeterministic(LAYER.IMPLICIT_KEY),
      like: nondeterministic(LAYER.FUNCTION)},
    'the session path refuses by default and names the refusing layer');
  }, {schema: IPK_SCHEMA}));

// --- the classifier owner's vetting of HaltIfNull (list tx1-leg-a-2) ---

// A partition table with NOT NULL columns, one with a default (every system
// table declares some).
const NOT_NULL_SCHEMA = Object.freeze({columns: [
  {name: 'id', type: 'TEXT', primaryKey: true},
  {name: 'value', type: 'TEXT', notNull: true},
  {name: 'weight', type: 'INTEGER', notNull: true, defaultValue: 0},
]});

test('TX1 inc4 HaltIfNull (W6s on a NOT NULL table): on a partition table with NOT NULL ' +
  'columns the self-check passes, every probe refused at its own layer and the table read ' +
  'admitted, and BEGIN is admitted', () => onLeader(async (leader) => {
  const selfCheck = runDeterminismSelfCheck(leader.db, {tableName: TABLE});
  const refused = (name, at) => ({name, admitted: false, layer: at});
  assert.deepEqual({passed: selfCheck.passed,
    cases: selfCheck.cases.map((entry) => pick(entry, ['name', 'admitted', 'layer'])),
    begin: pick(await send(leader, beginMessage(identityOf('i4-nn-check'))),
      ['success', 'failureCode'])}, {passed: true, cases: [
    refused('random', LAYER.FUNCTION), refused('raft_log_read', LAYER.ROOT_PAGE),
    refused('pragma_table_valued', LAYER.OPCODE), refused('pragma_statement',
      LAYER.STATEMENT_KIND), refused('temp_schema_read', LAYER.DATABASE),
    refused('implicit_key_insert', LAYER.IMPLICIT_KEY),
    refused('aggregate_insert', LAYER.ROW_ORDER), refused('ceiling_insert', LAYER.ROWID_CEILING),
    {name: 'partition_table_read', admitted: true, layer: null}],
  begin: {success: true, failureCode: null}},
  'the insert probes reach their layers once NOT NULL checks are in the population');
}, {schema: NOT_NULL_SCHEMA}));

test('TX1 inc4 HaltIfNull: a session INSERT of literal values and an UPDATE assigning a NOT ' +
  'NULL column stage on a table with NOT NULL columns, and their PREPARE and COMMIT apply ' +
  'identically on two replicas; an INSERT that violates NOT NULL is refused statement_failed ' +
  'at staging and never staged', async () => {
  const tx = identityOf('i4-nn');
  const facts = {};
  let prepareCommand = null;
  await onLeader(async (leader, proposed) => {
    await send(leader, beginMessage(tx));
    const stage = async (sql) => answerOf(await send(leader, queryMessage(tx, sql)));
    facts.staged = [await stage(`INSERT INTO ${TABLE} (id, value) VALUES ('nn-1', 'literal')`),
      await stage(`INSERT INTO ${TABLE} (id, value) VALUES ('nn-2', NULL)`),
      await stage(`UPDATE ${TABLE} SET value = 'changed' WHERE id = 'nn-1'`)];
    track(send(leader, prepareMessage(tx)));
    prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    facts.sealed = prepareCommand ? JSON.parse(prepareCommand.operationsText)
      .map((operation) => operation.sql.split(' ')[0]) : null;
  }, {schema: NOT_NULL_SCHEMA});
  facts.replicas = [];
  for (const replicaId of [REPLICAS[1], REPLICAS[2]]) {
    const replica = await startReplica(replicaId, {schema: NOT_NULL_SCHEMA});
    try {
      const applies = prepareCommand === null ? ['not proposed'] :
        [applyCommitted(replica, prepareCommand), applyCommitted(replica,
          decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest))];
      facts.replicas.push({applies, outcome: await outcomeOf(replica, tx),
        rows: replica.db.prepare(`SELECT id, value, weight FROM ${TABLE} ORDER BY id`).all()});
    } finally {
      await shutdownAll(replica);
    }
  }
  const staged = {success: true, failureCode: null, refusalLayer: null};
  const replica = {applies: [null, null],
    outcome: {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED, state: V3.STATE.COMMITTED},
    rows: [{id: 'nn-1', value: 'changed', weight: 0}]};
  assert.deepEqual(facts, {staged: [staged,
    {success: false, failureCode: CODE.STATEMENT_FAILED, refusalLayer: null}, staged],
  sealed: ['INSERT', 'UPDATE'], replicas: [replica, replica]},
  'NOT NULL checks are deterministic: a valid write commits alike, a NULL never stages');
});

test('TX1 inc4 list version: a command stamped with the previous classifier list version ' +
  '(tx1-leg-a-1) applies as carried and is counted as an envelope mismatch against this ' +
  'build\'s tx1-leg-a-2', async () => {
  const replica = await startReplica(REPLICAS[1]);
  try {
    const tx = identityOf('i4-list');
    const apply = applyCommitted(replica, {...prepareCommandOf(tx, [operationOf(ROW)],
      generationOf(replica)), executionEnvelope: {...ENVELOPE,
      classifierListVersion: 'tx1-leg-a-1'}});
    assert.deepEqual({apply, outcome: await outcomeOf(replica, tx),
      diagnostics: envelopeDiagnosticsOf(replica)}, {apply: null,
      outcome: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.PREPARED},
      diagnostics: {mismatchCount: 1, lastMismatch: {commandType: V3.PREPARE_COMMAND,
        carried: 'tx1-leg-a-1', own: 'tx1-leg-a-2'}}},
    'the list bump is evidence for the release owner, never a refusal');
  } finally {
    await shutdownAll(replica);
  }
});

test('TX1 inc4 self-check: it runs once as the replica becomes the leader of an admission-' +
  'enabled partition, before any BEGIN, and is memoized per connection; a partition whose ' +
  'origin arrives later stays paused without running it, then checks its first released BEGIN', async () => {
  const calls = {enabled: [], pending: []};
  const spying = (list) => (db, options) => {
    list.push(options.tableName);
    return runDeterminismSelfCheck(db, options);
  };
  const facts = {};
  await onLeader(async (leader) => {
    facts.enabledAtLeadership = calls.enabled.length;
    facts.begins = [(await send(leader, beginMessage(identityOf('i4-sc-a'))))?.success,
      (await send(leader, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK,
        identityOf('i4-sc-a'))))?.success,
      (await send(leader, beginMessage(identityOf('i4-sc-b'))))?.success];
    facts.enabledAfterBegins = calls.enabled.length;
  }, {determinismSelfCheck: spying(calls.enabled)});
  await onLeader(async (leader) => {
    facts.pendingAtLeadership = calls.pending.length;
    leader.controllablePort.committedIndex = 0;
    applyCommitted(leader, originCommandOf());
    facts.pendingPaused = pick(await send(leader, beginMessage(identityOf('i4-sc-c'))),
      ['success', 'failureCode']);
    facts.callsWhilePaused = calls.pending.length;
    await resumeFixtureParticipantAdmission(leader);
    facts.pendingBegin = (await send(leader, beginMessage(identityOf('i4-sc-c'))))?.success;
    facts.pendingAfterBegin = calls.pending.length;
  }, {determinismSelfCheck: spying(calls.pending), generationOrigin: false});
  assert.deepEqual(facts, {enabledAtLeadership: 1, begins: [true, true, true],
    enabledAfterBegins: 1, pendingAtLeadership: 0,
    pendingPaused: {success: false, failureCode: CODE.CUTOVER_PAUSED}, callsWhilePaused: 0,
    pendingBegin: true, pendingAfterBegin: 1},
  'the classifier is proven live on the running binary before anything stages');
});

// --- PREPARE meets a foreign reservation; the leader steps down ---

test('TX1 inc4 reservation: a PREPARE refused at apply by a foreign reservation keeps its ' +
  'sealed command: the retry is answered reserved while the reservation lasts and ' +
  're-proposes the same bytes after the decision, which then prepares', () => onLeader(
  async (leader, proposed) => {
    const t1 = identityOf('i4-first', {sessionId: 's-first'});
    const t2 = identityOf('i4-second', {sessionId: 's-second'});
    await send(leader, beginMessage(t2));
    await send(leader, queryMessage(t2, INSERT_SQL, [ROW_2.id, ROW_2.value]));
    const firstPrepare = track(send(leader, prepareMessage(t2)));
    const sealed = await awaitProposal(proposed, isPrepareCommand);
    // T1's PREPARE commits ahead of T2's and reserves the partition.
    const t1Prepare = prepareCommandOf(t1, [operationOf(ROW)], generationOf(leader));
    const facts = {t1Apply: applyCommitted(leader, t1Prepare),
      t2Apply: sealed ? applyCommitted(leader, sealed) : 'not proposed'};
    await settleTicks();
    facts.firstAnswer = firstPrepare.settled ?
      pick(firstPrepare.value, ['success', 'failureCode', 'deferRetry']) : 'pending';
    facts.retryWhileReserved = pick(await send(leader, prepareMessage(t2)),
      ['success', 'failureCode', 'deferRetry']);
    facts.release = applyCommitted(leader, decisionCommandOf(t1, V3.DECISION.ROLLBACK,
      t1Prepare.preparedDigest));
    const retry = track(send(leader, prepareMessage(t2)));
    await settleTicks();
    const prepares = proposed.filter(isPrepareCommand);
    facts.reproposedSameBytes = prepares.length === 2 &&
      JSON.stringify(prepares[0]) === JSON.stringify(prepares[1]);
    facts.retryApply = prepares[1] ? applyCommitted(leader, prepares[1]) : 'not re-proposed';
    await settleTicks();
    facts.retryAnswer = retry.settled ? pick(retry.value, ['success', 'state']) : 'pending';
    const reserved = {success: false, failureCode: 'participant_transaction_reserved',
      deferRetry: true};
    assert.deepEqual(facts, {t1Apply: null, t2Apply: null, firstAnswer: reserved,
      retryWhileReserved: reserved, release: null, reproposedSameBytes: true,
      retryApply: null, retryAnswer: {success: true, state: V3.STATE.PREPARED}},
    'contention never loses the sealed operations');
  }));

test('TX1 inc4 demotion: a leader that stops leading releases its parked writers ' +
  'NOT_LEADER unproposed and discards its staging sessions', () => onLeader(
  async (leader, proposed) => {
    const staging = identityOf('i4-demoted', {sessionId: 's-demoted'});
    await send(leader, beginMessage(staging));
    await send(leader, queryMessage(staging, INSERT_SQL, [ROW_2.id, ROW_2.value]));
    applyCommitted(leader, prepareCommandOf(identityOf('i4-holder'), [operationOf(ROW)],
      generationOf(leader)));
    const parked = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
      {entryId: 'i4-parked'}));
    await settleTicks();
    const facts = {parkedBefore: parked.settled};
    leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
    await settleTicks();
    facts.parked = parked.settled ? pick(parked.value, ['success', 'failureCode']) : 'pending';
    facts.proposed = proposed.filter(hasEntryId('i4-parked')).length;
    facts.staging = await outcomeOf(leader, staging);
    assert.deepEqual(facts, {parkedBefore: false,
      parked: {success: false, failureCode: NOT_LEADER}, proposed: 0,
      staging: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.ABSENT}},
    'volatile leader state ends with leadership');
  }));

test('TX1 inc4 hold sweep: a PREPARED row past the hold window is reported once and never ' +
  'terminated, and its decision still applies', () => onLeader(async (leader) => {
  const tx = identityOf('i4-held');
  const prepare = prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader));
  applyCommitted(leader, prepare);
  const warnings = [];
  const warn = leader.logger.warn.bind(leader.logger);
  leader.logger.warn = (message, fields) => {
    warnings.push(message);
    return warn(message, fields);
  };
  const nowMs = Date.now();
  const swept = [0, 1, 2].map((ordinal) => leader.enforcePreparedStateHoldTimeouts(
    nowMs + ordinal * (leader.preparedStateHoldTimeoutMs + 1)));
  const facts = {swept, reported: warnings.filter((message) =>
    message === LOG_MSG.PREPARED_HELD).length, held: await outcomeOf(leader, tx)};
  facts.decision = applyCommitted(leader, decisionCommandOf(tx, V3.DECISION.COMMIT,
    prepare.preparedDigest));
  facts.after = await outcomeOf(leader, tx);
  assert.deepEqual(facts, {swept: [0, 0, 0], reported: 1,
    held: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.PREPARED},
    decision: null, after: {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
      state: V3.STATE.COMMITTED}}, 'a PREPARED row is released by its decision alone');
}));

// --- the L6 fences between the two protocols ---

test('TX1 inc4 L6 fences: on an admission-enabled partition a legacy BEGIN is refused; a ' +
  'sessionId-only PREPARE, COMMIT, ROLLBACK or QUERY naming a participant session is refused ' +
  'and touches nothing; a sessionId-only outcome read never answers NOT_COMMITTED for a ' +
  'participant\'s session; a refused direct legacy BEGIN leaves participant admission intact',
() => onLeader(async (leader, proposed) => {
  const sessionId = 's-fenced';
  const tx = identityOf('i4-fenced', {sessionId});
  const fenced = (answer) => pick(answer, ['success', 'failureCode']);
  const facts = {legacyBegin: fenced(await send(leader,
    legacyMessage(PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION, 'legacy-only')))};
  await send(leader, beginMessage(tx));
  await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value]));
  facts.legacyControls = [];
  for (const operation of [PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
    PARTITION_SERVICE_OPERATION.COMMIT, PARTITION_SERVICE_OPERATION.ROLLBACK]) {
    facts.legacyControls.push(fenced(await send(leader, legacyMessage(operation, sessionId))));
  }
  facts.legacyQuery = fenced(await send(leader, {type: 'QUERY', sql: INSERT_SQL,
    params: [OTHER_ROW.id, OTHER_ROW.value], sessionId}));
  const legacyOutcome = async (session) => (await send(leader, legacyMessage(
    PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, session,
    {transactionEpoch: tx.transactionEpoch})))?.outcome;
  facts.outcomeWhileStaging = await legacyOutcome(sessionId);
  track(send(leader, prepareMessage(tx)));
  const command = await awaitProposal(proposed, isPrepareCommand);
  facts.prepareApply = command ? applyCommitted(leader, command) : 'not proposed';
  facts.outcomeWhilePrepared = await legacyOutcome(sessionId);
  facts.outcomeOfUnknownSession = await legacyOutcome('never-used');
  facts.ordinaryProposals = proposed.filter((entry) => entry.sql !== undefined).length;
  facts.rows = leader.db.prepare(`SELECT COUNT(*) AS count FROM ${TABLE}`).get().count;
  const legacyFenced = {success: false, failureCode: CODE.LEGACY_SESSION_FENCED};
  // The current direct legacy entry point also consumes the L6 fence.
  // A refused BEGIN cannot manufacture an active legacy session and must
  // not prevent an otherwise-admitted participant BEGIN on that replica.
  await onLeader(async (other) => {
    const legacy = await other.beginTransaction('legacy-open', 1);
    facts.refusedDirectLegacy = fenced(legacy);
    facts.legacyConnectionOpen = other.db.inTransaction;
    facts.participantBeginAfterRefusal = fenced(await send(other,
      beginMessage(identityOf('i4-under-legacy'))));
    facts.legacySessionsAfterRefusal = other.activeTransactions.size;
    await send(other, txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK,
      identityOf('i4-under-legacy')));
  });
  assert.deepEqual(facts, {legacyBegin: legacyFenced,
    legacyControls: [legacyFenced, legacyFenced, legacyFenced], legacyQuery: legacyFenced,
    outcomeWhileStaging: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, prepareApply: null,
    outcomeWhilePrepared: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
    outcomeOfUnknownSession: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED, ordinaryProposals: 0,
    rows: 0,
    refusedDirectLegacy: {success: false, failureCode: CODE.LEGACY_SESSION_FENCED},
    legacyConnectionOpen: false, legacySessionsAfterRefusal: 0,
    participantBeginAfterRefusal: {success: true, failureCode: null}},
  'the two protocols never touch one partition at once');
}));

test('TX1 inc4 BEGIN fences: a non-leader refuses BEGIN NOT_LEADER and stages nothing; after ' +
  'the removal fence BEGIN is refused removal_fenced (retryable) while an open session\'s ' +
  'statements still serve', async () => {
  const follower = await startReplica(REPLICAS[1]);
  const facts = {};
  try {
    facts.follower = pick(await send(follower, beginMessage(identityOf('i4-follower'))),
      ['success', 'failureCode']);
    facts.followerSession = (await outcomeOf(follower, identityOf('i4-follower'))).state;
  } finally {
    await shutdownAll(follower);
  }
  await onLeader(async (leader) => {
    const open = identityOf('i4-open');
    await send(leader, beginMessage(open));
    leader.fenceServingAdmissionForRemoval();
    facts.fencedBegin = pick(await send(leader, beginMessage(identityOf('i4-late'))),
      ['success', 'failureCode', 'deferRetry']);
    facts.openStatement = answerOf(await send(leader, queryMessage(open, INSERT_SQL,
      [ROW.id, ROW.value])));
  });
  assert.deepEqual(facts, {follower: {success: false, failureCode: NOT_LEADER},
    followerSession: V3.STATE.ABSENT,
    fencedBegin: {success: false, failureCode: CODE.REMOVAL_FENCED, deferRetry: true},
    openStatement: {success: true, failureCode: null, refusalLayer: null}},
  'a session stages on the leader only, and the removal fence admits no new one');
});

test('TX1 inc4 origin columns: a generation table created before the origin columns existed ' +
  'gets them at open; the origin resets g but BEGIN remains paused until the existing ' +
  'release owner resumes the current observation', async () => {
  const {directory, dbPath} = temporaryDbPath();
  const facts = {};
  try {
    const created = await startReplica(REPLICAS[0], {dbPath, generationOrigin: false});
    await shutdownAll(created);
    const raw = new Database(dbPath);
    try {
      raw.exec('DROP TABLE _partition_write_generation; CREATE TABLE ' +
        '_partition_write_generation (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), ' +
        'generation INTEGER NOT NULL); INSERT INTO _partition_write_generation VALUES (1, 5)');
    } finally {
      raw.close();
    }
    await onLeader(async (leader) => {
      facts.columns = leader.db.prepare('PRAGMA table_info(_partition_write_generation)').all()
        .map((column) => column.name);
      facts.before = {origin: originOf(leader), generation: generationOf(leader)};
      facts.beginBefore = pick(await send(leader, beginMessage(identityOf('i4-col'))),
        ['success', 'failureCode']);
      leader.controllablePort.committedIndex = 0;
      facts.originApply = applyCommitted(leader, originCommandOf(PARTITION_ID));
      facts.after = {origin: originOf(leader), generation: generationOf(leader)};
      facts.originAlone = pick(await send(leader, beginMessage(identityOf('i4-col'))),
        ['success', 'failureCode']);
      await resumeFixtureParticipantAdmission(leader);
      facts.beginAfter = pick(await send(leader, beginMessage(identityOf('i4-col'))),
        ['success', 'failureCode']);
    }, {dbPath, generationOrigin: false});
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
  assert.deepEqual(facts, {columns: ['singleton', 'generation', 'origin_index', 'origin_term'],
    before: {origin: null, generation: 5},
    beginBefore: {success: false, failureCode: CODE.CUTOVER_PAUSED},
    originApply: null, after: {origin: 1, generation: 0},
    originAlone: {success: false, failureCode: CODE.CUTOVER_PAUSED},
    beginAfter: {success: true, failureCode: null}},
  'an old generation table is upgraded at open, never read as an origin');
});

// --- corrective round: post-commit effects, params, the sweep, reads, outcomes ---

test('TX1 inc4 envelope (GAP-3): a mismatched envelope carried by an application that rolls ' +
  'back is not counted; the same command, applied, is counted once', async () => {
  const replica = await startReplica(REPLICAS[1]);
  try {
    const tx = identityOf('i4-envelope-rollback');
    const command = {...prepareCommandOf(tx, [operationOf(ROW)], generationOf(replica)),
      executionEnvelope: {...ENVELOPE, sqliteVersion: '3.0.0'}};
    plantAppliedStateFailure(replica.db);
    const facts = {failed: applyCommitted(replica, command) !== null,
      afterFailed: envelopeDiagnosticsOf(replica).mismatchCount};
    removeAppliedStateFailure(replica.db);
    facts.applied = applyCommitted(replica, command);
    facts.afterApplied = envelopeDiagnosticsOf(replica).mismatchCount;
    facts.outcome = await outcomeOf(replica, tx);
    assert.deepEqual(facts, {failed: true, afterFailed: 0, applied: null, afterApplied: 1,
      outcome: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.PREPARED}},
    'the diagnostic counts what applied, after its commit');
  } finally {
    await shutdownAll(replica);
  }
});

test('TX1 inc4 parked writers (GAP-4): a decision whose application rolls back re-admits no ' +
  'parked writer; the same decision, applied, re-admits it once', () => onLeader(
  async (leader, proposed) => {
    const tx = identityOf('i4-readmit-rollback');
    const prepare = prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader));
    applyCommitted(leader, prepare);
    track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
      {entryId: 'i4-parked-rollback'}));
    await settleTicks();
    const parked = () => proposed.filter(hasEntryId('i4-parked-rollback')).length;
    const decision = decisionCommandOf(tx, V3.DECISION.COMMIT, prepare.preparedDigest);
    const facts = {whileReserved: parked()};
    plantAppliedStateFailure(leader.db);
    facts.failed = applyCommitted(leader, decision) !== null;
    await settleTicks();
    facts.afterFailed = parked();
    removeAppliedStateFailure(leader.db);
    facts.applied = applyCommitted(leader, decision);
    await settleTicks();
    facts.afterApplied = parked();
    facts.outcome = await outcomeOf(leader, tx);
    assert.deepEqual(facts, {whileReserved: 0, failed: true, afterFailed: 0, applied: null,
      afterApplied: 1, outcome: {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
        state: V3.STATE.COMMITTED}},
    'a reservation is released by a decision that committed, never by one that rolled back');
  }));

test('TX1 inc4 params (GAP-5): a Date, a BigInt, undefined, a boxed String, a nested array ' +
  'and Infinity are refused param_unsupported before the classifier, and nothing refused is ' +
  'staged', () => onLeader(async (leader, proposed) => {
  const tx = identityOf('i4-params');
  await send(leader, beginMessage(tx));
  const refusals = [];
  for (const value of [new Date(0), 5n, undefined, Object('boxed'), ['nested'],
    Number.POSITIVE_INFINITY]) {
    refusals.push(answerOf(await send(leader, queryMessage(tx, INSERT_SQL, ['p', value]))));
  }
  const valid = answerOf(await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value])));
  track(send(leader, prepareMessage(tx)));
  const command = await awaitProposal(proposed, isPrepareCommand);
  const unsupported = {success: false, failureCode: CODE.SESSION_WRITE_PARAM_UNSUPPORTED,
    refusalLayer: null};
  assert.deepEqual({refusals, valid, sealed: command ?
    JSON.parse(command.operationsText).map((operation) => operation.params) : null},
  {refusals: Array(6).fill(unsupported),
    valid: {success: true, failureCode: null, refusalLayer: null},
    sealed: [[ROW.id, ROW.value]]},
  'only JSON scalars are staged: what the proposal codec carries unchanged');
}));

test('TX1 inc4 hold sweep (GAP-6): a session whose PREPARE is in flight is not discarded, ' +
  'however long it is held: it still reads its sealed operations, and its PREPARE applies',
() => onLeader(async (leader, proposed) => {
  const tx = identityOf('i4-in-flight');
  await send(leader, beginMessage(tx));
  await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value]));
  const prepare = track(send(leader, prepareMessage(tx)));
  const command = await awaitProposal(proposed, isPrepareCommand);
  const facts = {swept: leader.enforcePreparedStateHoldTimeouts(Date.now() +
    leader.preparedStateHoldTimeoutMs * 2)};
  facts.read = pick(await send(leader, queryMessage(tx, `SELECT id FROM ${TABLE}`)),
    ['success', 'rows', 'failureCode']);
  facts.apply = command ? applyCommitted(leader, command) : 'not proposed';
  await settleTicks();
  facts.prepared = prepare.settled ? pick(prepare.value, ['success', 'state']) : 'pending';
  assert.deepEqual(facts, {swept: 0,
    read: {success: true, rows: [{id: ROW.id}], failureCode: null}, apply: null,
    prepared: {success: true, state: V3.STATE.PREPARED}},
  'a PREPARE in flight owns its commit deadline; the sweep never ends it');
}));

test('TX1 inc4 session reads (O4): a read that fails, on its result budget or its own ' +
  'runtime error, is refused statement_failed with the failing owner\'s errorCode, and the ' +
  'session stays usable', () => onLeader(async (leader) => {
  const tx = identityOf('i4-read-failure');
  await send(leader, beginMessage(tx));
  await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value]));
  await send(leader, queryMessage(tx, INSERT_SQL, [ROW_2.id, ROW_2.value]));
  const failure = (answer) => pick(answer, ['success', 'failureCode', 'errorCode']);
  const facts = {budget: failure(await send(leader, {...queryMessage(tx,
    `SELECT id FROM ${TABLE}`), resultMaxRows: 1})),
  runtime: failure(await send(leader, queryMessage(tx,
    'SELECT abs(-9223372036854775807 - 1) AS overflow')))};
  facts.after = answerOf(await send(leader, queryMessage(tx, INSERT_SQL,
    [OTHER_ROW.id, OTHER_ROW.value])));
  assert.deepEqual(facts, {
    budget: {success: false, failureCode: CODE.STATEMENT_FAILED,
      errorCode: 'query_result_rows_exhausted'},
    runtime: {success: false, failureCode: CODE.STATEMENT_FAILED, errorCode: 'SQLITE_ERROR'},
    after: {success: true, failureCode: null, refusalLayer: null}},
  'a failed read is typed as every session statement is');
}));

test('TX1 inc4 outcome rows (O1, the nullable insert-result contract): a leader whose ' +
  'connection last inserted elsewhere (the self-check\'s rolled-back ceiling plant, then ' +
  'staged inserts c\' rolled back) and a follower that did neither record identical outcome ' +
  'rows; upserts (a mixed batch of inserted and updated rows included), an INSERT OR IGNORE ' +
  'that inserts nothing, an UPDATE and a DELETE retain null, and a plain INSERT its rowid',
async () => {
  const {leader} = await startLeader({generationOrigin: false});
  const follower = await startReplica(REPLICAS[1], {generationOrigin: false});
  const applyOnBoth = (command) => [applyCommitted(leader, command),
    applyCommitted(follower, command)];
  const lastInsertRowids = () => [leader, follower].map((replica) => String(replica.db
    .prepare('SELECT last_insert_rowid() AS rowid').safeIntegers(true).get().rowid));
  const outcomeRowsOf = (entryId) => [leader, follower].map((replica) => {
    const row = replica.db.prepare('SELECT outcome, changes, last_insert_rowid AS rowid ' +
      'FROM _partition_statement_outcomes WHERE entry_key = ?').get(`entry:${entryId}`);
    return `${row?.outcome}/${row?.changes}/${row?.rowid}`;
  });
  const upsertOf = (entryId, value) => ({...ordinaryWriteOf(entryId, {id: ROW.id, value}),
    sql: `${INSERT_SQL} ON CONFLICT (id) DO UPDATE SET value = excluded.value`});
  try {
    for (const replica of [leader, follower]) {
      replica.controllablePort.committedIndex = GENERATION_ORIGIN_INDEX - 1;
    }
    const facts = {setup: [...applyOnBoth(originCommandOf()),
      ...applyOnBoth(ordinaryWriteOf('o1-seed', ROW))]};
    await resumeFixtureParticipantAdmission(leader);
    // The leader's first BEGIN runs the self-check, which plants a row at
    // the rowid ceiling and rolls it back.
    const tx = identityOf('i4-outcome-rowid');
    facts.begin = (await send(leader, beginMessage(tx)))?.success;
    // Each upsert runs where the two connections last inserted different rows.
    facts.beforeUpserts = [lastInsertRowids()];
    facts.applies = [applyOnBoth(upsertOf('o1-upsert-plant', 'u1'))];
    facts.staged = [];
    for (const row of [ROW_2, {id: 'row-3', value: 'value-3'}]) {
      facts.staged.push(answerOf(await send(leader, queryMessage(tx, INSERT_SQL,
        [row.id, row.value]))));
    }
    facts.beforeUpserts.push(lastInsertRowids());
    facts.applies.push(applyOnBoth(upsertOf('o1-upsert-staged', 'u2')),
      applyOnBoth({...ordinaryWriteOf('o1-ignore', ROW),
        sql: INSERT_SQL.replace('INSERT', 'INSERT OR IGNORE')}),
      applyOnBoth(ordinaryWriteOf('o1-insert', OTHER_ROW)),
      // One row of the batch updates the existing key, the other inserts.
      applyOnBoth({...ordinaryWriteOf('o1-upsert-mixed', ROW), sql: `INSERT INTO ${TABLE} ` +
        '(id, value) VALUES (?, ?), (?, ?) ON CONFLICT (id) DO UPDATE SET value = ' +
        'excluded.value', params: [ROW.id, 'u3', 'row-mixed', 'inserted']}),
      applyOnBoth({...ordinaryWriteOf('o1-update', ROW), type: PARTITION_SERVICE_OPERATION.UPDATE,
        sql: `UPDATE ${TABLE} SET value = ? WHERE id = ?`, params: ['u4', ROW.id]}),
      applyOnBoth({...ordinaryWriteOf('o1-delete', ROW), type: PARTITION_SERVICE_OPERATION.DELETE,
        sql: `DELETE FROM ${TABLE} WHERE id = ?`, params: [OTHER_ROW.id]}));
    facts.outcomes = ['o1-upsert-plant', 'o1-upsert-staged', 'o1-ignore', 'o1-insert',
      'o1-upsert-mixed', 'o1-update', 'o1-delete'].map(outcomeRowsOf);
    const staged = {success: true, failureCode: null, refusalLayer: null};
    const both = (row) => [row, row];
    assert.deepEqual(facts, {setup: [null, null, null, null], begin: true,
      beforeUpserts: [[String(2n ** 62n), '1'], ['3', '2']], applies: Array(7).fill([null, null]),
      staged: [staged, staged], outcomes: [both('applied/1/null'), both('applied/1/null'),
        both('applied/0/null'), both('applied/1/2'), both('applied/2/null'),
        both('applied/1/null'), both('applied/1/null')]},
    'a committed statement\'s outcome row never carries connection state');
  } finally {
    await shutdownAll(leader, follower);
  }
});
