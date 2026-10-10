/**
 * Shared fixture of the TX1 (quest replicated-transaction-decision-and-apply)
 * participant witnesses: the pinned revision-6 wire vocabulary, the canonical
 * committed commands of design-leg-a-v6-2026-10-10.md section 2, the staging
 * classifier's refusal cases (section 3.3), controllable replicas, request
 * builders and measurements. The literals below are the
 * design's pinned values until their owners export them; the implementation
 * replaces them with owner imports without changing a value.
 */
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from '../../src/raft/raft-operation-port-request.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {COMMIT_MODE, PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {
  ControllableConsensusPort,
  createControllablePartitionService,
} from '../partition/partition-service-test-support.js';

const PARTITION_ID = 'tx1-v3';
const REPLICAS = Object.freeze(['tx1-v3-r1', 'tx1-v3-r2', 'tx1-v3-r3']);
const TABLE = 'test_table';
const SESSION = 'tx1-v3-session';
const EPOCH = 7;
const ELSEWHERE = 'tx1-v3-elsewhere';
const INSERT_SQL = 'INSERT INTO test_table (id, value) VALUES (?, ?)';
const ROW = Object.freeze({id: 'row-1', value: 'value-1'});
const ROW_2 = Object.freeze({id: 'row-2', value: 'value-2'});
const OTHER_ROW = Object.freeze({id: 'row-9', value: 'other'});
const SETTLE_TICKS = 25;

const V3 = Object.freeze({
  PREPARE_COMMAND: 'PARTICIPANT_PREPARE',
  DECISION_COMMAND: 'PARTICIPANT_DECISION',
  DECISION: Object.freeze({COMMIT: 'COMMIT', ROLLBACK: 'ROLLBACK'}),
  STATE: Object.freeze({
    ABSENT: 'ABSENT',
    PREPARED: 'PREPARED',
    COMMITTED: 'COMMITTED',
    ROLLED_BACK: 'ROLLED_BACK',
    REFUSED: 'REFUSED',
  }),
  REFUSAL_CAUSE: Object.freeze({
    CONFLICT: 'conflict',
    STATEMENT_FAILED: 'statement_failed',
    DIGEST_INVALID: 'digest_invalid',
  }),
  CODE: Object.freeze({
    DECISION_BINDING_REQUIRED: 'participant_transaction_decision_binding_required',
    DECISION_DIGEST_MISMATCH: 'participant_transaction_decision_digest_mismatch',
    PREPARING: 'participant_transaction_preparing',
    NOT_ACTIVE: 'participant_transaction_not_active',
    PREPARE_REFUSED: 'participant_transaction_prepare_refused',
    SESSION_WRITE_NONDETERMINISTIC:
      'participant_transaction_session_write_nondeterministic',
    SESSION_WRITE_PARAM_UNSUPPORTED:
      'participant_transaction_session_write_param_unsupported',
    DETERMINISM_SELF_CHECK_FAILED:
      'participant_transaction_determinism_self_check_failed',
  }),
  // The classifier layer that refused a statement (design v6 section 3.3).
  CLASSIFIER_LAYER: Object.freeze({
    STATEMENT_KIND: 'statement_kind',
    COMPILE: 'compile',
    OPCODE: 'opcode',
    DATABASE: 'database',
    ROOT_PAGE: 'root_page',
    FUNCTION: 'function',
    IMPLICIT_KEY: 'implicit_key',
  }),
  // The classifier owner to create (design v6 section 3.3).
  DETERMINISM_MODULE: '../../src/partition/partition-transaction-determinism.js',
  PARTITION_SCOPE: 'partition',
  OPERATION_KEY_PREFIX: 'txop:',
  GENERATION_TABLE: '_partition_write_generation',
});

const settle = () => new Promise((resolve) => setImmediate(resolve));
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function identityOf(transactionId, overrides = {}) {
  const partitionId = overrides.partitionId ?? PARTITION_ID;
  return {
    sessionId: SESSION,
    transactionId,
    participantId: `${transactionId}:${partitionId}`,
    commitMode: COMMIT_MODE.TWO_PHASE_COMMIT,
    transactionEpoch: EPOCH,
    ...overrides,
  };
}
function identityFields(identity) {
  const {sessionId, transactionId, participantId, commitMode, transactionEpoch} = identity;
  return {sessionId, transactionId, participantId, commitMode, transactionEpoch};
}
// The partition write generation (design v4 section 3.2): one replicated row,
// absent on the sealed head (null there).
function generationOf(partition) {
  try {
    return partition.db.prepare(
      `SELECT generation FROM ${V3.GENERATION_TABLE} WHERE singleton = 1`).get()?.generation ??
      null;
  } catch {
    return null;
  }
}
function validationTextOf(generation, partitionId = PARTITION_ID) {
  return JSON.stringify([[V3.PARTITION_SCOPE, partitionId,
    sha256(`generation:${generation === null ? 'none' : generation}`)]]);
}
function operationOf(row, extra = {}) {
  return {entryId: extra.entryId ?? `op-${row.id}`, sql: extra.sql ?? INSERT_SQL,
    params: extra.params ?? [row.id, row.value]};
}
function prepareCommandOf(identity, operations, generation, partitionId = PARTITION_ID) {
  const operationsText = JSON.stringify(operations);
  const validationText = validationTextOf(generation, partitionId);
  return {
    type: V3.PREPARE_COMMAND,
    entryId: `${identity.participantId}:prepare`,
    ...identityFields(identity),
    operationsText,
    validationText,
    preparedDigest: sha256(`${operationsText}\n${validationText}`),
    timestamp: '',
    proposedBy: ELSEWHERE,
    proposedAt: 0,
  };
}
function bindingOf(identity, decision, preparedDigest) {
  const decisionText = JSON.stringify({transactionId: identity.transactionId, decision,
    participants: [[identity.participantId, preparedDigest ?? null]]});
  return {decision, preparedDigest: preparedDigest ?? null, decisionText,
    decisionDigest: sha256(decisionText)};
}
function decisionCommandOf(identity, decision, preparedDigest) {
  const binding = bindingOf(identity, decision, preparedDigest);
  return {
    type: V3.DECISION_COMMAND,
    entryId: `${identity.participantId}:decision:${binding.decisionDigest}`,
    ...identityFields(identity),
    ...binding,
    timestamp: '',
    proposedBy: ELSEWHERE,
    proposedAt: 0,
  };
}
function ordinaryWriteOf(entryId, row, table = TABLE) {
  return {type: PARTITION_SERVICE_OPERATION.INSERT, entryId,
    sql: `INSERT INTO ${table} (id, value) VALUES (?, ?)`,
    params: [row.id, row.value], timestamp: '', proposedBy: ELSEWHERE, proposedAt: 0};
}

function alterCommandOf(entryId, sql) {
  return {type: PARTITION_SERVICE_OPERATION.MIGRATION_ALTER_TABLE, entryId, sql, params: [],
    timestamp: '', proposedBy: ELSEWHERE, proposedAt: 0};
}
const columnsOf = (partition) =>
  partition.db.prepare(`PRAGMA table_info(${TABLE})`).all().map((column) => column.name);
// A temporary table on the leader's own connection (a per-connection channel).
const SCRATCH_TABLE = 'tx1_v3_scratch';
// Session statements the staging classifier refuses, each with its params: the
// function census (rev 4-5), and the channels of round-5 R5-1 that compile to
// no function opcode (a table-valued pragma, dbstat, a replica-local rs-raft
// table, a temporary table, PRAGMA statements).
function classifierRefusalCases() {
  const value = (expression) => `INSERT INTO ${TABLE} (id, value) VALUES (?, ${expression})`;
  const select = (from) => `INSERT INTO ${TABLE} (id, value) SELECT ${from}`;
  return [
    [value('datetime(\'now\')'), ['n1']], [value('DATETIME(\'NOW\')'), ['n2']],
    [value('datetime()'), ['n3']], [value('unixepoch()'), ['n4']],
    [value('strftime(\'%s\')'), ['n5']], [value('datetime(?)'), ['n6', 'now']],
    [value('datetime(?)'), ['n7', 'NOW']],
    [value('datetime(\'2020-01-01\', ?)'), ['n8', 'localtime']],
    [value('random()'), ['n9']], [value('hex(randomblob(4))'), ['n10']],
    [value('sqlite_version()'), ['n11']], [`INSERT INTO ${TABLE} (value) VALUES (?)`, ['k']],
    [select('?, page_count FROM pragma_page_count()'), ['c1']],
    [select('?, file FROM pragma_database_list'), ['c2']],
    [select('?, sum(pgsize) FROM dbstat'), ['c3']],
    [select('?, \'x\' FROM _raft_rs_log LIMIT 1'), ['c4']],
    [select(`id || ?, value FROM ${SCRATCH_TABLE}`), ['c5']],
    ['PRAGMA page_count', []], ['PRAGMA reverse_unordered_selects = 1', []],
  ];
}

function createReplica(replicaId, extra = {}) {
  return createControllablePartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE,
    tableName: TABLE,
    replicaId,
    replicaIds: [...REPLICAS],
    nodeId: 'test-node',
    peerAddresses: REPLICAS.map((id) => `test-node/partition/${id}`),
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
    dbPath: extra.dbPath ?? ':memory:',
    ...(extra.timeSource ? {timeSource: extra.timeSource} : {}),
    // The leader's determinism self-check, injectable (design v6 section 3.3).
    ...(extra.determinismSelfCheck ?
      {transactionDeterminismSelfCheck: extra.determinismSelfCheck} : {}),
  }, new ControllableConsensusPort());
}
async function startReplica(replicaId, extra) {
  const replica = createReplica(replicaId, extra);
  await replica.initialize();
  return replica;
}
async function startLeader(extra) {
  const leader = await startReplica(REPLICAS[0], extra);
  leader.role = 'leader';
  leader.isLeader = true;
  leader.leaderId = leader.replicaId;
  leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  const proposed = [];
  leader.controllablePort.setProposeHandler(async (entry) => {
    proposed.push({...entry});
  });
  return {leader, proposed};
}
async function shutdownAll(...replicas) {
  for (const replica of replicas) {
    try {
      await replica?.shutdown();
    } catch {
      // The facts were measured before shutdown.
    }
  }
}
function temporaryDbPath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-v3-'));
  return {directory, dbPath: path.join(directory, 'partition.db')};
}
const send = (partition, payload) => partition.handleApplicationMessage(payload);
function txMessage(operation, identity, extra = {}) {
  return {type: PARTITION_SERVICE_MESSAGE_TYPE.TRANSACTION, operation,
    ...identityFields(identity), ...extra};
}
function beginMessage(identity) {
  return txMessage(PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION, identity,
    {commitMode: COMMIT_MODE.NOT_SELECTED});
}
const prepareMessage = (identity) =>
  txMessage(PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION, identity);
const commitMessage = (identity, preparedDigest) => txMessage(
  PARTITION_SERVICE_OPERATION.COMMIT, identity,
  bindingOf(identity, V3.DECISION.COMMIT, preparedDigest));
function queryMessage(identity, sql, params = []) {
  return {type: PARTITION_SERVICE_MESSAGE_TYPE.QUERY, sql, params,
    ...identityFields(identity), commitMode: COMMIT_MODE.NOT_SELECTED};
}
function pick(answer, fields) {
  const picked = {};
  for (const field of fields) {
    picked[field] = answer?.[field] ?? null;
  }
  return picked;
}
async function outcomeOf(partition, identity, extraFields = []) {
  const answer = await send(partition,
    txMessage(PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, identity));
  return pick(answer, ['outcome', 'state', ...extraFields]);
}
// Apply one committed command through the production application owner;
// null when it applied, else the typed code (or message) it failed closed with.
function applyCommitted(partition, command) {
  try {
    partition.controllablePort.commit(command);
    return null;
  } catch (error) {
    return error?.code ?? error?.message ?? String(error);
  }
}
function rowCount(partition, id = ROW.id) {
  return partition.db.prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?')
    .get(id).count;
}
function statementState(partition, entryId) {
  return readCommittedStatementOutcome(partition, `entry:${entryId}`).state;
}
function transactionOperationOutcomes(partition) {
  return partition.db.prepare('SELECT COUNT(*) AS count FROM _partition_statement_outcomes ' +
    'WHERE entry_key LIKE ?').get(`${V3.OPERATION_KEY_PREFIX}%`).count;
}
function durableAppliedIndex(partition) {
  const request = partition.controllablePort.request;
  return Number(new RaftRsDurableStore(request[RAFT_OPERATION_PORT_REQUEST.DURABLE_STORAGE])
    .readDurableProgress(request[RAFT_OPERATION_PORT_REQUEST.GROUP_ID]).appliedIndex);
}
// Observe a pending request without awaiting it.
function track(promise) {
  const tracked = {settled: false, value: undefined, promise};
  promise.then((value) => {
    tracked.settled = true;
    tracked.value = value;
  }, (error) => {
    tracked.settled = true;
    tracked.value = {thrown: error?.message ?? String(error)};
  });
  return tracked;
}
async function settleTicks() {
  for (let tick = 0; tick < SETTLE_TICKS; tick += 1) {
    await settle();
  }
}
async function awaitProposal(proposed, predicate) {
  for (let tick = 0; tick < SETTLE_TICKS && !proposed.some(predicate); tick += 1) {
    await settle();
  }
  return proposed.find(predicate) ?? null;
}
const isPrepareCommand = (entry) => entry.type === V3.PREPARE_COMMAND;
const isDecisionCommand = (entry) => entry.type === V3.DECISION_COMMAND;
const isOrdinaryWrite = (entry) => entry.type === PARTITION_SERVICE_OPERATION.QUERY ||
  entry.type === PARTITION_SERVICE_OPERATION.INSERT;
const hasEntryId = (entryId) => (entry) => entry.entryId === entryId;
// A planted failure of a later step of the same application transaction: the
// rs-raft applied-state write that follows the application callback.
function plantAppliedStateFailure(db) {
  for (const event of ['INSERT', 'UPDATE']) {
    db.exec(`CREATE TRIGGER tx1_v3_planted_${event.toLowerCase()} BEFORE ${event} ON ` +
      '_raft_rs_applied_state BEGIN SELECT RAISE(ABORT, \'tx1-v3 planted\'); END');
  }
}
function removeAppliedStateFailure(db) {
  db.exec('DROP TRIGGER IF EXISTS tx1_v3_planted_insert');
  db.exec('DROP TRIGGER IF EXISTS tx1_v3_planted_update');
}
// A single-replica environmental (host) failure while a statement runs: a
// JavaScript throw is not a deterministic SQLite outcome.
function plantStorageFault(db) {
  db.function('tx1_v3_storage_fault', () => {
    throw new Error('tx1-v3 planted storage fault');
  });
  db.exec('CREATE TRIGGER tx1_v3_storage_fault AFTER INSERT ON test_table ' +
    'BEGIN SELECT tx1_v3_storage_fault(); END');
}
function removeStorageFault(db) {
  db.exec('DROP TRIGGER IF EXISTS tx1_v3_storage_fault');
}
// A sessionless ordinary write proposed by the leader and committed by the test.
async function commitOrdinaryWrite(leader, proposed, entryId, row) {
  const pending = track(leader.executeQuery(INSERT_SQL, [row.id, row.value], {entryId}));
  const entry = await awaitProposal(proposed, hasEntryId(entryId));
  const apply = entry ? applyCommitted(leader, entry) : 'not proposed';
  await settleTicks();
  return {apply, answer: pending.settled ? pending.value?.success === true : 'pending'};
}
async function stagedLeaderTransaction(identity, rows, extra) {
  const {leader, proposed} = await startLeader(extra);
  const begun = await send(leader, beginMessage(identity));
  const staged = [];
  for (const row of rows) {
    staged.push(await send(leader, queryMessage(identity, INSERT_SQL, [row.id, row.value])));
  }
  return {leader, proposed, begun, staged};
}


const UNKNOWN_ANSWER = Object.freeze({success: false,
  outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
  failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN});
const UNKNOWN_FIELDS = Object.freeze(['success', 'outcome', 'failureCode']);
const COMMITTED = Object.freeze({outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED,
  state: V3.STATE.COMMITTED});
const PREPARED = Object.freeze({outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
  state: V3.STATE.PREPARED});
const notCommitted = (state) => ({outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED, state});

// Run `measure(replica)` on two fresh follower replicas and return both facts.
async function onTwoReplicas(measure) {
  const replicas = [await startReplica(REPLICAS[1]), await startReplica(REPLICAS[2])];
  try {
    const perReplica = [];
    for (const replica of replicas) {
      perReplica.push(await measure(replica));
    }
    return perReplica;
  } finally {
    await shutdownAll(...replicas);
  }
}
// Record `selectSql` (one row) inside every rs-raft applied-state write of the
// same application transaction, into tx1_v3_probe.
function probeAppliedStateWrite(db, columns, selectSql) {
  db.exec(`CREATE TABLE tx1_v3_probe (${columns.join(', ')})`);
  for (const event of ['INSERT', 'UPDATE']) {
    db.exec(`CREATE TRIGGER tx1_v3_probe_${event.toLowerCase()} AFTER ${event} ON ` +
      `_raft_rs_applied_state BEGIN INSERT INTO tx1_v3_probe (${columns.join(', ')}) ` +
      `${selectSql}; END`);
  }
  return () => db.prepare('SELECT * FROM tx1_v3_probe').all();
}
const GENERATION_SQL =
  `(SELECT generation FROM ${V3.GENERATION_TABLE} WHERE singleton = 1)`;
// A PREPARE request left pending on a staged leader; `interrupt(leader,
// command)` runs once the PREPARE is proposed; the answer is then observed.
async function pendingPrepareAnswer(extra, interrupt) {
  const tx = identityOf(`a11-${extra?.label ?? 'x'}`);
  const {leader, proposed} = await stagedLeaderTransaction(tx, [ROW], extra);
  try {
    const prepare = track(send(leader, prepareMessage(tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    const settledBefore = prepare.settled;
    const interruption = prepareCommand ? interrupt(leader, prepareCommand) : null;
    await settleTicks();
    return {prepareProposed: prepareCommand !== null, settledBefore, interruption,
      answer: prepare.settled ? pick(prepare.value, UNKNOWN_FIELDS) : null};
  } finally {
    await shutdownAll(leader);
  }
}

const commitDecision = (tx, prepareCommand) =>
  decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest);
// Apply a hand-built PREPARE and its COMMIT decision on two replicas.
async function decidedOnTwoReplicas(tx, operations, setup) {
  return onTwoReplicas(async (replica) => {
    const setupApply = setup ? applyCommitted(replica, setup) : null;
    const prepareCommand = prepareCommandOf(tx, operations, generationOf(replica));
    const appliedBefore = durableAppliedIndex(replica);
    const prepareApply = applyCommitted(replica, prepareCommand);
    const afterPrepare = await outcomeOf(replica, tx, ['refusalCause']);
    const decisionApply = applyCommitted(replica, commitDecision(tx, prepareCommand));
    return {setupApply, prepareApply, afterPrepare, decisionApply,
      afterDecision: await outcomeOf(replica, tx), rows: rowCount(replica),
      values: replica.db.prepare('SELECT value FROM test_table WHERE id = ?').all(ROW.id)
        .map((row) => row.value),
      appliedAdvance: durableAppliedIndex(replica) - appliedBefore};
  });
}

export {
  COMMITTED,
  SCRATCH_TABLE,
  alterCommandOf,
  classifierRefusalCases,
  columnsOf,
  ELSEWHERE,
  GENERATION_SQL,
  PREPARED,
  UNKNOWN_ANSWER,
  UNKNOWN_FIELDS,
  EPOCH,
  INSERT_SQL,
  OTHER_ROW,
  PARTITION_ID,
  REPLICAS,
  ROW,
  ROW_2,
  SESSION,
  TABLE,
  V3,
  applyCommitted,
  awaitProposal,
  beginMessage,
  bindingOf,
  commitMessage,
  commitOrdinaryWrite,
  decisionCommandOf,
  durableAppliedIndex,
  generationOf,
  hasEntryId,
  identityOf,
  notCommitted,
  commitDecision,
  decidedOnTwoReplicas,
  onTwoReplicas,
  pendingPrepareAnswer,
  probeAppliedStateWrite,
  isDecisionCommand,
  isOrdinaryWrite,
  isPrepareCommand,
  operationOf,
  ordinaryWriteOf,
  outcomeOf,
  pick,
  plantAppliedStateFailure,
  plantStorageFault,
  prepareCommandOf,
  prepareMessage,
  queryMessage,
  removeAppliedStateFailure,
  removeStorageFault,
  rowCount,
  send,
  settleTicks,
  sha256,
  shutdownAll,
  stagedLeaderTransaction,
  startLeader,
  startReplica,
  statementState,
  temporaryDbPath,
  track,
  transactionOperationOutcomes,
  txMessage,
  validationTextOf,
};
