/**
 * Shared fixture of the TX1 (quest replicated-transaction-decision-and-apply)
 * participant witnesses: the pinned revision-4 wire vocabulary, the canonical
 * committed commands of design-leg-a-v4-2026-10-10.md section 2, controllable
 * replicas, request builders and measurements. The literals below are the
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
import {COMMIT_MODE} from '../../src/constants/transactions.js';
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
    NONDETERMINISTIC: 'nondeterministic',
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
  }),
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

export {
  ELSEWHERE,
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
