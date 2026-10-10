/**
 * TX1 (quest replicated-transaction-decision-and-apply, PR100 Leg A) red
 * witnesses for design revision 3
 * (solve/quests/replicated-transaction-decision-and-apply/design-leg-a-v3-2026-10-10.md,
 * section 10). They answer the twelve witnesses the round-2 design vet
 * requires (its section 3) where the controllable consensus port can express
 * them; the revision-2 file partition-transaction-replicated-apply.test.js is
 * kept unchanged as superseded history.
 *
 * Every witness drives the revision-3 protocol: a coordinator-minted
 * transactionId with participantId, commitMode and transactionEpoch on every
 * request; PREPARE as a committed PARTICIPANT_PREPARE command acknowledged only
 * after it applies; the decision as a committed PARTICIPANT_DECISION command
 * that carries no operations and is bound to the prepared digest and the
 * coordinator's decision text. Consensus is driven by the test while a request
 * is pending; the test never awaits the proposer's own acknowledgment first.
 * The revision-1 mechanism (a TRANSACTION_COMMIT marker carrying the
 * operations) proposes neither command, so it cannot turn any witness green.
 *
 * Each witness measures every fact before asserting any (one deepEqual), so a
 * red names all of them. On the sealed head every witness is red: either the
 * current participant answers the old way (LOCAL_STAGING PREPARE, sessions
 * held open on the shared connection, NOT_COMMITTED read from absence), or a
 * committed revision-3 command fails the application closed as an
 * unrecognised command type (a new-surface red). Positive controls run in
 * their own tests and are green on the sealed head.
 *
 * The controllable port proves scheduling and the application transaction,
 * not durable Ready/log persistence: its second delivery of a command is a
 * new index, not crash replay. Real three-replica rs-raft witnesses (PR100
 * A1-A5) remain required before closure.
 *
 * The revision-3 wire vocabulary is pinned below as literals (design section
 * 2) until its owners export it; the implementation replaces them with owner
 * imports without changing a value.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';
import Database from 'better-sqlite3';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from '../../src/raft/raft-operation-port-request.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from
  '../../src/partition/partition-write-kernel.js';
import {readCommittedStatementOutcome} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {COMMIT_MODE, PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from '../../src/query/query-constants.js';
import {
  DistributedTransactionCoordinator,
  TRANSACTION_STATUS,
} from '../../src/query/distributed/distributed-transaction-coordinator.js';
import {resolveParticipantCommitMiss} from
  '../../src/query/distributed/distributed-transaction-protocol.js';
import {
  ControllableConsensusPort,
  createControllablePartitionService,
} from './partition-service-test-support.js';

const PARTITION_ID = 'tx1-v3';
const REPLICAS = ['tx1-v3-r1', 'tx1-v3-r2', 'tx1-v3-r3'];
const TABLE = 'test_table';
const SESSION = 'tx1-v3-session';
const EPOCH = 7;
const ELSEWHERE = 'tx1-v3-elsewhere';
const INSERT_SQL = 'INSERT INTO test_table (id, value) VALUES (?, ?)';
const ROW = Object.freeze({id: 'row-1', value: 'value-1'});
const ROW_2 = Object.freeze({id: 'row-2', value: 'value-2'});
const OTHER_ROW = Object.freeze({id: 'row-9', value: 'other'});
const SETTLE_TICKS = 25;
const settle = () => new Promise((resolve) => setImmediate(resolve));

// The revision-3 vocabulary (design section 2), pinned until its owners export it.
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
  }),
  CODE: Object.freeze({
    DECISION_BINDING_REQUIRED: 'participant_transaction_decision_binding_required',
    DECISION_DIGEST_MISMATCH: 'participant_transaction_decision_digest_mismatch',
    PREPARING: 'participant_transaction_preparing',
    WRITE_RESERVED: 'partition_write_reserved',
  }),
  PARTITION_SCOPE: 'partition',
  OPERATION_KEY_PREFIX: 'txop:',
});

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'test-node'}});
  LoggingService.getInstance().initialize({level: 'error'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

// --- identity and the canonical revision-3 commands (design section 2) ---

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function identityOf(transactionId, overrides = {}) {
  return {
    sessionId: SESSION,
    transactionId,
    participantId: `${transactionId}:${PARTITION_ID}`,
    commitMode: COMMIT_MODE.TWO_PHASE_COMMIT,
    transactionEpoch: EPOCH,
    ...overrides,
  };
}
function identityFields(identity) {
  const {sessionId, transactionId, participantId, commitMode, transactionEpoch} = identity;
  return {sessionId, transactionId, participantId, commitMode, transactionEpoch};
}
// The partition commit generation: the highest log index whose committed
// statement outcome is APPLIED (design section 3).
function generationOf(partition) {
  return partition.db.prepare('SELECT MAX(log_index) AS generation ' +
    'FROM _partition_statement_outcomes WHERE outcome = \'applied\'').get().generation ?? null;
}
function generationBaseDigest(generation) {
  return sha256(`generation:${generation === null ? 'none' : generation}`);
}
function operationOf(row, extra = {}) {
  return {entryId: extra.entryId ?? `op-${row.id}`, sql: extra.sql ?? INSERT_SQL,
    params: extra.params ?? [row.id, row.value]};
}
function prepareCommandOf(identity, operations, generation) {
  const operationsText = JSON.stringify(operations);
  const validationText = JSON.stringify([
    [V3.PARTITION_SCOPE, PARTITION_ID, generationBaseDigest(generation)]]);
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
function decisionTextOf(identity, decision, preparedDigest) {
  return JSON.stringify({transactionId: identity.transactionId, decision,
    participants: [[identity.participantId, preparedDigest ?? null]]});
}
function bindingOf(identity, decision, preparedDigest) {
  const decisionText = decisionTextOf(identity, decision, preparedDigest);
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
function ordinaryWriteOf(entryId, row) {
  return {type: PARTITION_SERVICE_OPERATION.INSERT, entryId, sql: INSERT_SQL,
    params: [row.id, row.value], timestamp: '', proposedBy: ELSEWHERE, proposedAt: 0};
}

// --- replicas, requests and measurements ---

function createReplica(replicaId, extra = {}) {
  return createControllablePartitionService({
    partitionId: PARTITION_ID,
    tableId: TABLE,
    tableName: TABLE,
    replicaId,
    replicaIds: REPLICAS,
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
function queryMessage(identity, sql, params = []) {
  return {type: PARTITION_SERVICE_MESSAGE_TYPE.QUERY, sql, params,
    ...identityFields(identity), commitMode: COMMIT_MODE.NOT_SELECTED};
}
async function outcomeOf(partition, identity) {
  const answer = await send(partition,
    txMessage(PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, identity));
  return {outcome: answer?.outcome ?? null, state: answer?.state ?? null};
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
async function awaitProposal(proposed, predicate) {
  for (let tick = 0; tick < SETTLE_TICKS && !proposed.some(predicate); tick += 1) {
    await settle();
  }
  return proposed.find(predicate) ?? null;
}
async function settleTicks() {
  for (let tick = 0; tick < SETTLE_TICKS; tick += 1) {
    await settle();
  }
}
const isPrepareCommand = (entry) => entry.type === V3.PREPARE_COMMAND;
const isDecisionCommand = (entry) => entry.type === V3.DECISION_COMMAND;
const isOrdinaryWrite = (entry) => entry.type === PARTITION_SERVICE_OPERATION.QUERY ||
  entry.type === PARTITION_SERVICE_OPERATION.INSERT;
function pick(answer, fields) {
  const picked = {};
  for (const field of fields) {
    picked[field] = answer?.[field] ?? null;
  }
  return picked;
}
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
async function stagedLeaderTransaction(identity, rows, extra) {
  const {leader, proposed} = await startLeader(extra);
  const begun = await send(leader, beginMessage(identity));
  const staged = [];
  for (const row of rows) {
    staged.push(await send(leader, queryMessage(identity, INSERT_SQL, [row.id, row.value])));
  }
  return {leader, proposed, begun, staged};
}

// --- W1: the revision-3 protocol on the leader and on a follower ---

test('TX1 v3 W1a: PREPARE is acknowledged only after its committed PARTICIPANT_PREPARE ' +
  'applies, and the bound COMMIT carries no operations', async () => {
  const tx = identityOf('node-a/1/1');
  const {leader, proposed, begun, staged} = await stagedLeaderTransaction(tx, [ROW]);
  try {
    const prepare = track(send(leader,
      txMessage(PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION, tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    const facts = {
      begun: begun?.success === true,
      staged: staged[0]?.success === true,
      prepareProposed: prepareCommand !== null,
      prepareSettledBeforeApply: prepare.settled,
      rowsVisibleWhilePreparing: rowCount(leader),
      prepareApply: null,
      prepareAnswer: null,
      rowsVisibleWhilePrepared: null,
      decisionProposed: null,
      decisionCarriesOperations: null,
      commitSettledBeforeApply: null,
      decisionApply: null,
      commitAnswer: null,
      rowsAfterDecision: null,
    };
    if (prepareCommand) {
      facts.prepareApply = applyCommitted(leader, prepareCommand);
      const answer = await prepare.promise;
      facts.prepareAnswer = {...pick(answer, ['success', 'state']),
        digestMatches: answer?.preparedDigest === prepareCommand.preparedDigest};
      facts.rowsVisibleWhilePrepared = rowCount(leader);
      const commit = track(send(leader, txMessage(PARTITION_SERVICE_OPERATION.COMMIT, tx,
        bindingOf(tx, V3.DECISION.COMMIT, answer?.preparedDigest))));
      const decision = await awaitProposal(proposed, isDecisionCommand);
      facts.decisionProposed = decision !== null;
      facts.decisionCarriesOperations = decision ?
        Object.hasOwn(decision, 'operations') || Object.hasOwn(decision, 'operationsText') :
        null;
      facts.commitSettledBeforeApply = commit.settled;
      if (decision) {
        facts.decisionApply = applyCommitted(leader, decision);
        facts.commitAnswer = pick(await commit.promise, ['success', 'state', 'outcome']);
        facts.rowsAfterDecision = rowCount(leader);
      }
    }
    assert.deepEqual(facts, {
      begun: true,
      staged: true,
      prepareProposed: true,
      prepareSettledBeforeApply: false,
      rowsVisibleWhilePreparing: 0,
      prepareApply: null,
      prepareAnswer: {success: true, state: V3.STATE.PREPARED, digestMatches: true},
      rowsVisibleWhilePrepared: 0,
      decisionProposed: true,
      decisionCarriesOperations: false,
      commitSettledBeforeApply: false,
      decisionApply: null,
      commitAnswer: {success: true, state: V3.STATE.COMMITTED,
        outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED},
      rowsAfterDecision: 1,
    }, 'PREPARE and COMMIT are committed commands, each acknowledged after it applies');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W1b: a replica that staged nothing reaches PREPARED, then COMMITTED with the ' +
  'operations and the applied index, from the two committed commands', async () => {
  const tx = identityOf('node-a/1/2');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(follower));
    const appliedBefore = durableAppliedIndex(follower);
    const facts = {prepareApply: applyCommitted(follower, prepareCommand)};
    facts.afterPrepare = await outcomeOf(follower, tx);
    facts.rowsAfterPrepare = rowCount(follower);
    facts.decisionApply = applyCommitted(follower,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
    facts.afterDecision = await outcomeOf(follower, tx);
    facts.rowsAfterDecision = rowCount(follower);
    facts.appliedAdvance = durableAppliedIndex(follower) - appliedBefore;
    assert.deepEqual(facts, {
      prepareApply: null,
      afterPrepare: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.PREPARED},
      rowsAfterPrepare: 0,
      decisionApply: null,
      afterDecision: {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED, state: V3.STATE.COMMITTED},
      rowsAfterDecision: 1,
      appliedAdvance: 2,
    }, 'the committed commands are the transaction on every replica');
  } finally {
    await shutdownAll(follower);
  }
});

// --- W2: atomicity of the decision's application transaction ---

test('TX1 v3 W2a: a planted failure after the operations inside the decision\'s application ' +
  'transaction leaves no row, no outcome, no state change and the applied index unchanged',
async () => {
  const tx = identityOf('node-a/1/3');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(follower));
    const facts = {prepareApply: applyCommitted(follower, prepareCommand)};
    const appliedBefore = durableAppliedIndex(follower);
    plantAppliedStateFailure(follower.db);
    facts.decisionApply = applyCommitted(follower,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
    removeAppliedStateFailure(follower.db);
    facts.rows = rowCount(follower);
    facts.operationOutcomes = transactionOperationOutcomes(follower);
    facts.afterFailure = await outcomeOf(follower, tx);
    facts.appliedAdvance = durableAppliedIndex(follower) - appliedBefore;
    assert.deepEqual(facts, {
      prepareApply: null,
      decisionApply: 'SQLITE_CONSTRAINT_TRIGGER',
      rows: 0,
      operationOutcomes: 0,
      afterFailure: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.PREPARED},
      appliedAdvance: 0,
    }, 'operations, statement outcomes, the state transition and the applied index are one ' +
      'transaction');
  } finally {
    await shutdownAll(follower);
  }
});

test('TX1 v3 W2b: the decision\'s operations are applied inside the application transaction, ' +
  'before its applied-state write (a post-commit effect cannot satisfy this)', async () => {
  const tx = identityOf('node-a/1/4');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(follower));
    const facts = {prepareApply: applyCommitted(follower, prepareCommand)};
    follower.db.exec('CREATE TABLE tx1_v3_probe (rows_seen INTEGER)');
    for (const event of ['INSERT', 'UPDATE']) {
      follower.db.exec(`CREATE TRIGGER tx1_v3_probe_${event.toLowerCase()} AFTER ${event} ON ` +
        '_raft_rs_applied_state BEGIN INSERT INTO tx1_v3_probe (rows_seen) ' +
        'SELECT COUNT(*) FROM test_table WHERE id = \'row-1\'; END');
    }
    facts.decisionApply = applyCommitted(follower,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
    facts.rowsSeenAtAppliedStateWrite = follower.db.prepare('SELECT rows_seen FROM tx1_v3_probe')
      .all().map((row) => row.rows_seen);
    assert.deepEqual(facts, {
      prepareApply: null,
      decisionApply: null,
      rowsSeenAtAppliedStateWrite: [1],
    }, 'the applied-state write observes the transaction\'s row inside the same transaction');
  } finally {
    await shutdownAll(follower);
  }
});

// --- W3: deterministic failure identical on every replica; host failure on one ---

test('TX1 v3 W3a: a PREPARE whose operation fails deterministically is REFUSED identically on ' +
  'every replica, applies nothing, and a later COMMIT cannot apply it', async () => {
  const tx = identityOf('node-a/1/5');
  const replicas = [await startReplica(REPLICAS[1]), await startReplica(REPLICAS[2])];
  try {
    const perReplica = [];
    for (const replica of replicas) {
      // row-2 is committed state on every replica (through consensus).
      const setup = applyCommitted(replica, ordinaryWriteOf('w3a-setup', ROW_2));
      const prepareCommand = prepareCommandOf(tx,
        [operationOf(ROW), operationOf(ROW_2, {entryId: 'op-dup'})], generationOf(replica));
      const appliedBefore = durableAppliedIndex(replica);
      const prepareApply = applyCommitted(replica, prepareCommand);
      const afterPrepare = pick(await send(replica,
        txMessage(PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, tx)),
      ['outcome', 'state', 'refusalCause']);
      const decisionApply = applyCommitted(replica,
        decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
      perReplica.push({
        setup,
        prepareApply,
        afterPrepare,
        decisionApply,
        afterDecision: await outcomeOf(replica, tx),
        rows: rowCount(replica),
        appliedAdvance: durableAppliedIndex(replica) - appliedBefore,
      });
    }
    const expected = {
      setup: null,
      prepareApply: null,
      afterPrepare: {outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED, state: V3.STATE.REFUSED,
        refusalCause: V3.REFUSAL_CAUSE.STATEMENT_FAILED},
      decisionApply: null,
      afterDecision: {outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED, state: V3.STATE.REFUSED},
      rows: 0,
      appliedAdvance: 2,
    };
    assert.deepEqual(perReplica, [expected, expected],
      'every replica refuses the same PREPARE the same way and never applies it');
  } finally {
    await shutdownAll(...replicas);
  }
});

test('TX1 v3 W3b: a single-replica storage failure while the COMMIT decision applies is the ' +
  'host failure: nothing recorded, applied index unchanged, re-applied after recovery',
async () => {
  const tx = identityOf('node-a/1/6');
  const healthy = await startReplica(REPLICAS[1]);
  const faulty = await startReplica(REPLICAS[2]);
  try {
    const facts = {};
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(healthy));
    const decision = decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest);
    facts.prepareApply = [applyCommitted(healthy, prepareCommand),
      applyCommitted(faulty, prepareCommand)];
    facts.healthyDecision = applyCommitted(healthy, decision);
    const faultyAppliedBefore = durableAppliedIndex(faulty);
    plantStorageFault(faulty.db);
    facts.faultyDecision = applyCommitted(faulty, decision);
    removeStorageFault(faulty.db);
    facts.faultyAfterFailure = {...(await outcomeOf(faulty, tx)), rows: rowCount(faulty),
      appliedAdvance: durableAppliedIndex(faulty) - faultyAppliedBefore};
    facts.faultyRedelivered = applyCommitted(faulty, decision);
    facts.converged = [await outcomeOf(healthy, tx), await outcomeOf(faulty, tx)];
    facts.rows = [rowCount(healthy), rowCount(faulty)];
    assert.deepEqual(facts, {
      prepareApply: [null, null],
      healthyDecision: null,
      faultyDecision: 'partition_committed_statement_environment_failed',
      faultyAfterFailure: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.PREPARED,
        rows: 0, appliedAdvance: 0},
      faultyRedelivered: null,
      converged: [
        {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED, state: V3.STATE.COMMITTED},
        {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED, state: V3.STATE.COMMITTED},
      ],
      rows: [1, 1],
    }, 'a host failure records nothing and the same decision applies once the host recovers');
  } finally {
    await shutdownAll(healthy, faulty);
  }
});

// --- W4: the conflict rule and the reservation, from committed state only ---

test('TX1 v3 W4: a committed write after the transaction\'s base refuses its PREPARE on every ' +
  'replica; once PREPARED, a reserved write cannot make the COMMIT fail', async () => {
  const conflicted = identityOf('node-a/1/7');
  const reserved = identityOf('node-a/1/8');
  const replicas = [await startReplica(REPLICAS[1]), await startReplica(REPLICAS[2])];
  try {
    const perReplica = [];
    for (const replica of replicas) {
      const base = generationOf(replica);
      const intervening = applyCommitted(replica, ordinaryWriteOf('w4-intervening', OTHER_ROW));
      const conflictPrepare = applyCommitted(replica,
        prepareCommandOf(conflicted, [operationOf(ROW)], base));
      const conflictOutcome = pick(await send(replica,
        txMessage(PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, conflicted)),
      ['outcome', 'state', 'refusalCause']);
      const prepareCommand = prepareCommandOf(reserved, [operationOf(ROW)], generationOf(replica));
      const reservedPrepare = applyCommitted(replica, prepareCommand);
      const appliedBefore = durableAppliedIndex(replica);
      const reservedWrite = applyCommitted(replica, ordinaryWriteOf('w4-reserved', ROW_2));
      const reservedWriteFacts = {rows: rowCount(replica, ROW_2.id),
        statement: statementState(replica, 'w4-reserved'),
        appliedAdvance: durableAppliedIndex(replica) - appliedBefore};
      const decisionApply = applyCommitted(replica,
        decisionCommandOf(reserved, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
      perReplica.push({intervening, conflictPrepare, conflictOutcome, reservedPrepare,
        reservedWrite, reservedWriteFacts, decisionApply,
        committed: await outcomeOf(replica, reserved), rows: rowCount(replica)});
    }
    const expected = {
      intervening: null,
      conflictPrepare: null,
      conflictOutcome: {outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED,
        state: V3.STATE.REFUSED, refusalCause: V3.REFUSAL_CAUSE.CONFLICT},
      reservedPrepare: null,
      reservedWrite: null,
      reservedWriteFacts: {rows: 0, statement: 'unsettled', appliedAdvance: 1},
      decisionApply: null,
      committed: {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED, state: V3.STATE.COMMITTED},
      rows: 1,
    };
    assert.deepEqual(perReplica, [expected, expected],
      'first committer wins at PREPARE apply, and the reservation keeps COMMIT infallible');
  } finally {
    await shutdownAll(...replicas);
  }
});

// --- W5: c' isolation throughout ACTIVE ---

test('TX1 v3 W5a: during ACTIVE no SQLite transaction is open, no other reader sees the staged ' +
  'row, the session reads its own write, and a sessionless write is applied', async () => {
  const {directory, dbPath} = temporaryDbPath();
  const tx = identityOf('node-a/1/9');
  let leader = null;
  try {
    let proposed;
    ({leader, proposed} = await startLeader({dbPath}));
    const facts = {};
    facts.begun = (await send(leader, beginMessage(tx)))?.success === true;
    facts.inTransactionAfterBegin = leader.db.inTransaction;
    facts.staged = (await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value])))
      ?.success === true;
    facts.inTransactionAfterWrite = leader.db.inTransaction;
    const independent = new Database(dbPath, {readonly: true});
    try {
      facts.independentReader = independent
        .prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?').get(ROW.id).count;
    } finally {
      independent.close();
    }
    facts.sessionlessReader = (await leader.executeQuery(
      'SELECT id FROM test_table WHERE id = ?', [ROW.id])).rows.length;
    facts.sessionReader = (await send(leader,
      queryMessage(tx, 'SELECT id FROM test_table WHERE id = ?', [ROW.id])))?.rows?.length ?? null;
    const sessionless = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
      {entryId: 'w5-sessionless'}));
    const write = await awaitProposal(proposed, (entry) => entry.entryId === 'w5-sessionless');
    facts.sessionlessProposed = write !== null;
    facts.sessionlessApply = write ? applyCommitted(leader, write) : 'not proposed';
    await settleTicks();
    facts.sessionlessAnswer = sessionless.settled ? sessionless.value?.success === true : 'pending';
    assert.deepEqual(facts, {
      begun: true,
      inTransactionAfterBegin: false,
      staged: true,
      inTransactionAfterWrite: false,
      independentReader: 0,
      sessionlessReader: 0,
      sessionReader: 1,
      sessionlessProposed: true,
      sessionlessApply: null,
      sessionlessAnswer: true,
    }, 'staging never holds the shared connection and is visible to its own session only');
  } finally {
    await shutdownAll(leader);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('TX1 v3 W5b: a request without a transactionId is never absorbed into an open session, ' +
  'even one named the default session', async () => {
  const tx = identityOf('node-a/1/10', {sessionId: 'default'});
  const {leader, proposed} = await startLeader();
  try {
    const begun = await send(leader, beginMessage(tx));
    const sessionless = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
      {entryId: 'w5b-sessionless'}));
    const write = await awaitProposal(proposed, (entry) => entry.entryId === 'w5b-sessionless');
    const facts = {
      begun: begun?.success === true,
      proposedAsOrdinaryWrite: write !== null,
      absorbedIntoSession: sessionless.settled && sessionless.value?.inTransaction === true,
    };
    if (write) {
      applyCommitted(leader, write);
    }
    assert.deepEqual(facts, {begun: true, proposedAsOrdinaryWrite: true,
      absorbedIntoSession: false}, 'default-session absorption is gone');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W6: deterministic results inherit the ordinary write class ---

test('TX1 v3 W6: staged replies are provisional; the PREPARE carries the client\'s SQL and ' +
  'params verbatim; final results come from the committed apply', async () => {
  const tx = identityOf('node-a/1/11');
  const sql = 'INSERT INTO test_table (id, value) VALUES (?, hex(randomblob(4)))';
  const {leader, proposed} = await startLeader();
  try {
    await send(leader, beginMessage(tx));
    const staged = await send(leader, queryMessage(tx, sql, [ROW.id]));
    const prepare = track(send(leader,
      txMessage(PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION, tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    const facts = {
      stagedProvisional: staged?.provisional === true,
      prepareProposed: prepareCommand !== null,
      preparedOperations: null,
      commitResults: null,
    };
    if (prepareCommand) {
      facts.preparedOperations = JSON.parse(prepareCommand.operationsText)
        .map((operation) => ({sql: operation.sql, params: operation.params,
          pinsStagedResult: Object.hasOwn(operation, 'changes') ||
            Object.hasOwn(operation, 'lastInsertRowid')}));
      applyCommitted(leader, prepareCommand);
      const prepared = await prepare.promise;
      const commit = track(send(leader, txMessage(PARTITION_SERVICE_OPERATION.COMMIT, tx,
        bindingOf(tx, V3.DECISION.COMMIT, prepared?.preparedDigest))));
      const decision = await awaitProposal(proposed, isDecisionCommand);
      if (decision) {
        applyCommitted(leader, decision);
        const answer = await commit.promise;
        const appliedRowid = leader.db.prepare('SELECT rowid AS rowid FROM test_table WHERE id = ?')
          .get(ROW.id)?.rowid ?? null;
        facts.commitResults = (answer?.results ?? []).map((result) => ({
          changes: result.changes, fromApply: result.lastInsertRowid === appliedRowid}));
      }
    }
    assert.deepEqual(facts, {
      stagedProvisional: true,
      prepareProposed: true,
      preparedOperations: [{sql, params: [ROW.id], pinsStagedResult: false}],
      commitResults: [{changes: 1, fromApply: true}],
    }, 'transaction operations are evaluated at apply exactly like ordinary replicated writes');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W7: the reservation refusal never settles an entry ---

test('TX1 v3 W7: a write refused by the reservation is answered deferRetry without settling ' +
  'its entryId, so the same entryId applies once the reservation is released', async () => {
  const tx = identityOf('node-a/1/12');
  const {leader, proposed} = await startLeader();
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader));
    const facts = {prepareApply: applyCommitted(leader, prepareCommand)};
    const first = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
      {entryId: 'w7-retry'}));
    const firstProposal = await awaitProposal(proposed, (entry) => entry.entryId === 'w7-retry');
    if (firstProposal) {
      applyCommitted(leader, firstProposal);
    }
    await settleTicks();
    facts.precheck = {proposed: firstProposal !== null,
      answer: first.settled ? pick(first.value, ['success', 'failureCode', 'deferRetry']) : null};
    const appliedBefore = durableAppliedIndex(leader);
    facts.racedApply = applyCommitted(leader, ordinaryWriteOf('w7-raced', ROW_2));
    facts.raced = {rows: rowCount(leader, ROW_2.id), statement: statementState(leader, 'w7-raced'),
      appliedAdvance: durableAppliedIndex(leader) - appliedBefore};
    facts.release = applyCommitted(leader,
      decisionCommandOf(tx, V3.DECISION.ROLLBACK, prepareCommand.preparedDigest));
    const retry = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
      {entryId: 'w7-retry'}));
    const retryProposal = await awaitProposal(proposed,
      (entry) => entry.entryId === 'w7-retry' && entry !== firstProposal);
    if (retryProposal) {
      applyCommitted(leader, retryProposal);
    }
    await settleTicks();
    facts.retried = {success: retry.settled ? retry.value?.success === true : 'pending',
      rows: rowCount(leader, OTHER_ROW.id)};
    facts.racedRedelivered = applyCommitted(leader, ordinaryWriteOf('w7-raced', ROW_2));
    facts.racedRows = rowCount(leader, ROW_2.id);
    assert.deepEqual(facts, {
      prepareApply: null,
      precheck: {proposed: false, answer: {success: false,
        failureCode: V3.CODE.WRITE_RESERVED, deferRetry: true}},
      racedApply: null,
      raced: {rows: 0, statement: 'unsettled', appliedAdvance: 1},
      release: null,
      retried: {success: true, rows: 1},
      racedRedelivered: null,
      racedRows: 1,
    }, 'REFUSED_RESERVED is a non-settling, retryable disposition');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W9: terminal commands are bound to the decision and the prepared content ---

test('TX1 v3 W9: an unbound ROLLBACK and a COMMIT with a foreign digest are refused against ' +
  'PREPARED; a bound ROLLBACK after COMMITTED cannot reverse it', async () => {
  const tx = identityOf('node-a/1/13');
  const {leader, proposed} = await startLeader();
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader));
    const facts = {prepareApply: applyCommitted(leader, prepareCommand)};
    const proposedBefore = proposed.length;
    facts.unboundRollback = pick(await send(leader,
      txMessage(PARTITION_SERVICE_OPERATION.ROLLBACK, tx)), ['success', 'failureCode']);
    const foreignBinding = bindingOf(tx, V3.DECISION.COMMIT, sha256('foreign prepared content'));
    facts.foreignDigestCommit = pick(await send(leader,
      txMessage(PARTITION_SERVICE_OPERATION.COMMIT, tx, foreignBinding)),
    ['success', 'failureCode']);
    facts.proposedByRefusals = proposed.length - proposedBefore;
    facts.foreignDigestApply = applyCommitted(leader,
      decisionCommandOf(tx, V3.DECISION.COMMIT, sha256('foreign prepared content')));
    facts.afterRefusals = await outcomeOf(leader, tx);
    facts.commitApply = applyCommitted(leader,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
    facts.reversalApply = applyCommitted(leader,
      decisionCommandOf(tx, V3.DECISION.ROLLBACK, prepareCommand.preparedDigest));
    facts.final = await outcomeOf(leader, tx);
    facts.rows = rowCount(leader);
    assert.deepEqual(facts, {
      prepareApply: null,
      unboundRollback: {success: false, failureCode: V3.CODE.DECISION_BINDING_REQUIRED},
      foreignDigestCommit: {success: false, failureCode: V3.CODE.DECISION_DIGEST_MISMATCH},
      proposedByRefusals: 0,
      foreignDigestApply: null,
      afterRefusals: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.PREPARED},
      commitApply: null,
      reversalApply: null,
      final: {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED, state: V3.STATE.COMMITTED},
      rows: 1,
    }, 'only the bound decision terminalizes, and the first applied terminal stands');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W10: identity ---

test('TX1 v3 W10a: coordinator transaction identities are node- and incarnation-qualified and ' +
  'never derived from a clock', () => {
  const fixedClock = () => 1000;
  const coordinatorA = new DistributedTransactionCoordinator({now: fixedClock,
    nodeId: 'node-a', bootIncarnation: 1});
  const coordinatorB = new DistributedTransactionCoordinator({now: fixedClock,
    nodeId: 'node-b', bootIncarnation: 1});
  const restartedA = new DistributedTransactionCoordinator({now: () => 1,
    nodeId: 'node-a', bootIncarnation: 2});
  const idA = coordinatorA.createTransactionId('default');
  const idB = coordinatorB.createTransactionId('default');
  const idRestarted = restartedA.createTransactionId('default');
  assert.deepEqual({
    distinctAcrossNodes: idA !== idB,
    distinctAcrossIncarnations: idA !== idRestarted,
    composition: [idA, idB, idRestarted],
  }, {
    distinctAcrossNodes: true,
    distinctAcrossIncarnations: true,
    composition: ['node-a/1/1', 'node-b/1/1', 'node-a/2/1'],
  }, 'transactionId = nodeId/bootIncarnation/sequence');
});

test('TX1 v3 W10b: two transactions of one session are keyed by their transactionIds and ' +
  'never share an outcome', async () => {
  const first = identityOf('node-a/1/14');
  const second = identityOf('node-a/1/15');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const firstPrepare = prepareCommandOf(first, [operationOf(ROW)], generationOf(follower));
    const facts = {applies: [applyCommitted(follower, firstPrepare)]};
    facts.applies.push(applyCommitted(follower,
      decisionCommandOf(first, V3.DECISION.COMMIT, firstPrepare.preparedDigest)));
    const secondPrepare = prepareCommandOf(second, [operationOf(ROW_2)], generationOf(follower));
    facts.applies.push(applyCommitted(follower, secondPrepare));
    facts.applies.push(applyCommitted(follower,
      decisionCommandOf(second, V3.DECISION.ROLLBACK, secondPrepare.preparedDigest)));
    facts.outcomes = [await outcomeOf(follower, first), await outcomeOf(follower, second)];
    facts.rows = [rowCount(follower, ROW.id), rowCount(follower, ROW_2.id)];
    assert.deepEqual(facts, {
      applies: [null, null, null, null],
      outcomes: [
        {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED, state: V3.STATE.COMMITTED},
        {outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED, state: V3.STATE.ROLLED_BACK},
      ],
      rows: [1, 0],
    }, 'the session is routing context only');
  } finally {
    await shutdownAll(follower);
  }
});

// --- W11: await, deadline, leader loss, non-leader and PREPARING ---

test('TX1 v3 W11a: a PREPARE still pending at its commit deadline is answered UNKNOWN, ' +
  'not refused', async () => {
  const clock = new VirtualTimeSource({startMs: 1_000_000});
  const tx = identityOf('node-a/1/16');
  const {leader, proposed} = await stagedLeaderTransaction(tx, [ROW], {timeSource: clock});
  try {
    const prepare = track(send(leader,
      txMessage(PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION, tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    const settledBeforeDeadline = prepare.settled;
    clock.advance(PARTITION_SERVICE_DEFAULT.PENDING_REQUEST_TIMEOUT_MS);
    await settleTicks();
    assert.deepEqual({
      prepareProposed: prepareCommand !== null,
      settledBeforeDeadline,
      answer: prepare.settled ? pick(prepare.value, ['success', 'outcome', 'failureCode']) : null,
    }, {
      prepareProposed: true,
      settledBeforeDeadline: false,
      answer: {success: false, outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
        failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN},
    }, 'a proposed PREPARE may still commit, so its deadline answer is UNKNOWN');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W11b: a PREPARE pending when the leader stops leading is answered UNKNOWN',
  async () => {
    const tx = identityOf('node-a/1/17');
    const {leader, proposed} = await stagedLeaderTransaction(tx, [ROW]);
    try {
      const prepare = track(send(leader,
        txMessage(PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION, tx)));
      const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
      const settledBeforeLoss = prepare.settled;
      leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
      await settleTicks();
      assert.deepEqual({
        prepareProposed: prepareCommand !== null,
        settledBeforeLoss,
        answer: prepare.settled ? pick(prepare.value, ['success', 'outcome', 'failureCode']) :
          null,
      }, {
        prepareProposed: true,
        settledBeforeLoss: false,
        answer: {success: false, outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
          failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN},
      }, 'leadership loss releases the PREPARE as UNKNOWN, never as a failure');
    } finally {
      await shutdownAll(leader);
    }
  });

test('TX1 v3 W11c: a PREPARE on a non-leader is a typed NOT_LEADER refusal that proposes ' +
  'nothing', async () => {
  const tx = identityOf('node-a/1/18');
  const follower = await startReplica(REPLICAS[1]);
  const proposed = [];
  follower.controllablePort.setProposeHandler(async (entry) => {
    proposed.push({...entry});
  });
  try {
    const answer = await send(follower,
      txMessage(PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION, tx));
    assert.deepEqual({answer: pick(answer, ['success', 'failureCode']), proposed: proposed.length},
      {answer: {success: false, failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.NOT_LEADER},
        proposed: 0}, 'only the leader proposes a PREPARE');
  } finally {
    await shutdownAll(follower);
  }
});

test('TX1 v3 W11d: a session write while its PREPARE is in flight is refused and the PREPARE ' +
  'keeps exactly the operations it sealed', async () => {
  const tx = identityOf('node-a/1/19');
  const {leader, proposed} = await stagedLeaderTransaction(tx, [ROW]);
  try {
    track(send(leader, txMessage(PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION, tx)));
    const prepareCommand = await awaitProposal(proposed, isPrepareCommand);
    const late = track(send(leader, queryMessage(tx, INSERT_SQL, [ROW_2.id, ROW_2.value])));
    await settleTicks();
    assert.deepEqual({
      prepareProposed: prepareCommand !== null,
      lateWrite: late.settled ? pick(late.value, ['success', 'failureCode']) : 'pending',
      sealedOperations: prepareCommand ? JSON.parse(prepareCommand.operationsText).length : null,
      ordinaryProposals: proposed.filter(isOrdinaryWrite).length,
    }, {
      prepareProposed: true,
      lateWrite: {success: false, failureCode: V3.CODE.PREPARING},
      sealedOperations: 1,
      ordinaryProposals: 0,
    }, 'PREPARING seals the session');
  } finally {
    await shutdownAll(leader);
  }
});

// --- W12: the round-1 items still owed ---

test('TX1 v3 W12a: a PREPARE applied after a bound ROLLBACK tombstone is refused terminal, ' +
  'writes nothing and reserves nothing', async () => {
  const tx = identityOf('node-a/1/20');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const facts = {tombstone: applyCommitted(follower,
      decisionCommandOf(tx, V3.DECISION.ROLLBACK, null))};
    facts.afterTombstone = await outcomeOf(follower, tx);
    facts.latePrepare = applyCommitted(follower,
      prepareCommandOf(tx, [operationOf(ROW)], generationOf(follower)));
    facts.afterLatePrepare = await outcomeOf(follower, tx);
    facts.ordinaryWrite = applyCommitted(follower, ordinaryWriteOf('w12a-after', OTHER_ROW));
    facts.rows = [rowCount(follower, ROW.id), rowCount(follower, OTHER_ROW.id)];
    const rolledBack = {outcome: PARTICIPANT_COMMIT_OUTCOME.NOT_COMMITTED,
      state: V3.STATE.ROLLED_BACK};
    assert.deepEqual(facts, {
      tombstone: null,
      afterTombstone: rolledBack,
      latePrepare: null,
      afterLatePrepare: rolledBack,
      ordinaryWrite: null,
      rows: [0, 1],
    }, 'the first applied terminal is final');
  } finally {
    await shutdownAll(follower);
  }
});

test('TX1 v3 W12b: an outcome read answers UNKNOWN from absence or PREPARED, on any replica, ' +
  'and a terminal state only from its durable row', async () => {
  const tx = identityOf('node-a/1/21');
  const replicas = [await startReplica(REPLICAS[0]), await startReplica(REPLICAS[1]),
    await startReplica(REPLICAS[2])];
  try {
    const facts = {nothingApplied: await outcomeOf(replicas[2], tx)};
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(replicas[0]));
    const decision = decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest);
    facts.applies = [applyCommitted(replicas[0], prepareCommand),
      applyCommitted(replicas[0], decision), applyCommitted(replicas[1], prepareCommand)];
    facts.decided = await outcomeOf(replicas[0], tx);
    facts.preparedOnly = await outcomeOf(replicas[1], tx);
    assert.deepEqual(facts, {
      nothingApplied: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.ABSENT},
      applies: [null, null, null],
      decided: {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED, state: V3.STATE.COMMITTED},
      preparedOnly: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.PREPARED},
    }, 'absence is never NOT_COMMITTED');
  } finally {
    await shutdownAll(...replicas);
  }
});

test('TX1 v3 W12c: PREPARED survives a restart as a durable row that keeps the reservation ' +
  'and later applies its decision', async () => {
  const {directory, dbPath} = temporaryDbPath();
  const tx = identityOf('node-a/1/22');
  let first = null;
  let restarted = null;
  try {
    first = await startReplica(REPLICAS[1], {dbPath});
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(first));
    const facts = {prepareApply: applyCommitted(first, prepareCommand)};
    await first.shutdown();
    first = null;
    restarted = await startReplica(REPLICAS[1], {dbPath});
    restarted.controllablePort.committedIndex = durableAppliedIndex(restarted);
    facts.afterRestart = await outcomeOf(restarted, tx);
    facts.reservedWrite = applyCommitted(restarted, ordinaryWriteOf('w12c-reserved', OTHER_ROW));
    facts.reservedRows = rowCount(restarted, OTHER_ROW.id);
    facts.decisionApply = applyCommitted(restarted,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest));
    facts.final = await outcomeOf(restarted, tx);
    facts.rows = rowCount(restarted);
    assert.deepEqual(facts, {
      prepareApply: null,
      afterRestart: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.PREPARED},
      reservedWrite: null,
      reservedRows: 0,
      decisionApply: null,
      final: {outcome: PARTICIPANT_COMMIT_OUTCOME.COMMITTED, state: V3.STATE.COMMITTED},
      rows: 1,
    }, 'the row owner, not a log scan, is the prepared authority after restart');
  } finally {
    await shutdownAll(first, restarted);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('TX1 v3 W12d: the hold sweep discards an expired ACTIVE session and keeps an expired ' +
  'PREPARED row (paired invariants, one sweep)', async () => {
  const active = identityOf('node-a/1/23');
  const prepared = identityOf('node-a/1/24');
  const {leader} = await stagedLeaderTransaction(active, [ROW_2]);
  try {
    const facts = {preparedApply: applyCommitted(leader,
      prepareCommandOf(prepared, [operationOf(ROW)], generationOf(leader)))};
    const now = Date.now() + leader.preparedStateHoldTimeoutMs + 1;
    leader.enforcePreparedStateHoldTimeouts(now);
    facts.inTransaction = leader.db.inTransaction;
    facts.activeAfterSweep = pick(await send(leader,
      queryMessage(active, INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value])), ['success']);
    facts.preparedAfterSweep = await outcomeOf(leader, prepared);
    assert.deepEqual(facts, {
      preparedApply: null,
      inTransaction: false,
      activeAfterSweep: {success: false},
      preparedAfterSweep: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
        state: V3.STATE.PREPARED},
    }, 'expiry discards volatile staging and never terminalizes PREPARED');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 v3 W12e: a transaction operation\'s outcome never occupies an ordinary write\'s ' +
  'entry key, even when their entryIds collide', async () => {
  const tx = identityOf('node-a/1/25');
  const follower = await startReplica(REPLICAS[1]);
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW, {entryId: 'shared-entry'})],
      generationOf(follower));
    const facts = {applies: [applyCommitted(follower, prepareCommand), applyCommitted(follower,
      decisionCommandOf(tx, V3.DECISION.COMMIT, prepareCommand.preparedDigest))]};
    facts.ordinaryApply = applyCommitted(follower, ordinaryWriteOf('shared-entry', OTHER_ROW));
    facts.rows = [rowCount(follower, ROW.id), rowCount(follower, OTHER_ROW.id)];
    assert.deepEqual(facts, {applies: [null, null], ordinaryApply: null, rows: [1, 1]},
      'per-operation outcomes are keyed by (participant, ordinal), not by entryId');
  } finally {
    await shutdownAll(follower);
  }
});

// --- seam falsifiers (query lane): executable, recorded, not repaired here ---

test('TX1 v3 seam S1: once a transaction is COMMITTING, an exceeded budget never rolls a ' +
  'participant back', async () => {
  let nowMs = 1_000;
  const rollbackCalls = [];
  const coordinator = new DistributedTransactionCoordinator({
    now: () => nowMs,
    // One retry: the budget check before it turns the lost answer into the
    // timeout that today selects abortTimedOutTransaction.
    participantRetryMaxRetries: 1,
    sleep: async () => {},
    beginParticipant: async () => {},
    prepareParticipant: async () => {},
    commitParticipant: async (sessionId, partitionId) => {
      if (partitionId === 'p2') {
        nowMs += 120_000;
        throw new Error('commit answer lost');
      }
    },
    rollbackParticipant: async (sessionId, partitionId) => {
      rollbackCalls.push(partitionId);
    },
  });
  await coordinator.begin('s1');
  await coordinator.enlistParticipants('s1', ['p1', 'p2']);
  const result = await coordinator.commit('s1');
  assert.deepEqual({rollbackCalls, status: coordinator.getTransaction('s1')?.status ?? 'ended',
    success: result.success}, {rollbackCalls: [],
    status: TRANSACTION_STATUS.COMMITTING, success: false},
  'after the COMMIT decision only commit is retried (protocol.js abortTimedOutTransaction)');
});

test('TX1 v3 seam S2: a two-phase NO_TRANSACTION commit miss is resolved by an outcome read, ' +
  'never assumed COMMITTED', async () => {
  const reads = [];
  const owner = {
    resolveParticipantCommitOutcome: async (...args) => {
      reads.push(args);
      return PARTICIPANT_COMMIT_OUTCOME.UNKNOWN;
    },
  };
  const error = new Error(QUERY_ERROR_MSG.NO_TRANSACTION_COMMIT);
  error.errorCode = QUERY_ERROR_CODE.NO_TRANSACTION;
  const resolution = await resolveParticipantCommitMiss.call(owner,
    {sessionId: 's2', transactionEpoch: EPOCH, commitMode: COMMIT_MODE.TWO_PHASE_COMMIT},
    TRANSACTION_STATUS.COMMITTING, 'p1', error);
  assert.deepEqual({resolution, reads: reads.length},
    {resolution: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, reads: 1},
    'protocol.js resolveParticipantCommitMiss must read the participant outcome');
});

// --- positive controls (green on the sealed head) ---

test('control: an ordinary committed write applies exactly once and advances the applied index',
  async () => {
    const {leader, proposed} = await startLeader();
    try {
      const appliedBefore = durableAppliedIndex(leader);
      const pending = leader.insertData(TABLE, {...ROW});
      const entry = await awaitProposal(proposed, isOrdinaryWrite);
      assert.ok(entry, 'the write is proposed while its request is pending');
      assert.equal(rowCount(leader), 0, 'an ordinary write is not visible before its commit');
      leader.controllablePort.commit(entry);
      const result = await pending;
      assert.equal(result.success, true, 'the proposer is answered after application');
      assert.equal(rowCount(leader), 1, 'the committed write applies once');
      assert.equal(durableAppliedIndex(leader), appliedBefore + 1, 'the applied index advances');
    } finally {
      await shutdownAll(leader);
    }
  });

test('control: a planted applied-state failure leaves an ordinary write unapplied, unrecorded ' +
  'and the applied index unchanged', async () => {
  const replica = await startReplica(REPLICAS[1]);
  try {
    const appliedBefore = durableAppliedIndex(replica);
    plantAppliedStateFailure(replica.db);
    const failed = applyCommitted(replica, ordinaryWriteOf('control-planted', ROW));
    removeAppliedStateFailure(replica.db);
    assert.equal(failed, 'SQLITE_CONSTRAINT_TRIGGER', 'the planted failure fails the apply');
    assert.equal(rowCount(replica), 0, 'the statement rolled back with the transaction');
    assert.equal(statementState(replica, 'control-planted'), 'unsettled',
      'its outcome row rolled back with it');
    assert.equal(durableAppliedIndex(replica), appliedBefore, 'the applied index is unchanged');
  } finally {
    await shutdownAll(replica);
  }
});

test('control: a single-replica storage failure on an ordinary write is the host failure: ' +
  'nothing recorded, applied index unchanged', async () => {
  const replica = await startReplica(REPLICAS[1]);
  try {
    const appliedBefore = durableAppliedIndex(replica);
    plantStorageFault(replica.db);
    const failed = applyCommitted(replica, ordinaryWriteOf('control-storage', ROW));
    removeStorageFault(replica.db);
    assert.equal(failed, 'partition_committed_statement_environment_failed',
      'an environmental failure fails the application closed');
    assert.equal(statementState(replica, 'control-storage'), 'unsettled', 'nothing is recorded');
    assert.equal(durableAppliedIndex(replica), appliedBefore, 'the applied index is unchanged');
    assert.equal(applyCommitted(replica, ordinaryWriteOf('control-storage', ROW)), null,
      'the same entry applies once the host recovers');
    assert.equal(rowCount(replica), 1, 'and applies exactly once');
  } finally {
    await shutdownAll(replica);
  }
});

test('control: an ordinary write carries its SQL verbatim and answers the lastInsertRowid of ' +
  'its own committed apply (the class transaction operations inherit)', async () => {
  const sql = 'INSERT INTO test_table (id, value) VALUES (?, hex(randomblob(4)))';
  const {leader, proposed} = await startLeader();
  try {
    const pending = leader.executeQuery(sql, [ROW.id], {entryId: 'control-parity'});
    const entry = await awaitProposal(proposed, (candidate) =>
      candidate.entryId === 'control-parity');
    assert.ok(entry, 'the write is proposed');
    assert.deepEqual({sql: entry.sql, params: entry.params}, {sql, params: [ROW.id]},
      'the entry carries the client\'s statement and params, no evaluated value');
    leader.controllablePort.commit(entry);
    const answer = await pending;
    const appliedRowid = leader.db.prepare('SELECT rowid AS rowid FROM test_table WHERE id = ?')
      .get(ROW.id).rowid;
    assert.equal(answer.lastInsertRowid, appliedRowid, 'the answer is the apply\'s own result');
    assert.equal(statementState(leader, 'control-parity'), 'settled',
      'and its outcome row is settled for a replay');
  } finally {
    await shutdownAll(leader);
  }
});
