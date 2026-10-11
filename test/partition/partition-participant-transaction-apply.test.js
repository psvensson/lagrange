/**
 * TX1 (quest replicated-transaction-decision-and-apply) increment 3: the
 * participant transaction's durable row, its write generation, the committed
 * PARTICIPANT_PREPARE / PARTICIPANT_DECISION commands and their admission.
 * The sealed witnesses live in partition-transaction-replicated-apply-v3.test.js
 * (design revision 10, section 10); these cover what that file does not:
 * the image property of design 8.2, the admission owner's pinned-form and
 * origin rules for the two commands, the transition-table cells the
 * W-series leaves out, and the typed answers of the leader's requests and of
 * a write that meets the reservation. Fixture:
 * test/test-helpers/participant-transaction-fixture.js.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, beforeEach, test} from 'node:test';
import Database from 'better-sqlite3';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {RAFT_OPERATION_PORT_REQUEST} from '../../src/raft/raft-operation-port-request.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {PARTITION_SERVICE_OPERATION} from '../../src/partition/partition-service-constants.js';
import {
  PARTITION_COMMITTED_COMMAND_ORIGIN,
  admitCommittedCommand,
} from '../../src/partition/partition-committed-command-admission.js';
import {
  buildPartitionWriteSideEffectPlan,
  isRetryableWriteFailureCode,
} from '../../src/partition/partition-write-kernel.js';
import {enableParticipantTransactionAdmission} from
  '../../src/partition/partition-participant-transaction-request.js';
import {PARTICIPANT_COMMIT_OUTCOME} from '../../src/constants/transactions.js';
import {
  COMMITTED, GENERATION_ORIGIN_INDEX, INSERT_SQL, INT64_MAX, IPK_SCHEMA, OTHER_ROW, PREPARED,
  PARTITION_ID, REPLICAS, ROW, ROW_2, UNKNOWN_FIELDS, V3, applyCommitted,
  awaitProposal, beginMessage, bindingOf, commitDecision, commitMessage, decisionCommandOf,
  durableAppliedIndex, generationOf, hasEntryId, identityOf, isDecisionCommand,
  isPrepareCommand, notCommitted, onTwoReplicas, operationOf, ordinaryWriteOf,
  originCommandOf, originOf, outcomeOf, pick, plantAppliedStateFailure, prepareCommandOf,
  prepareMessage, queryMessage, removeAppliedStateFailure, rowCount, send, settleTicks,
  sha256, shutdownAll, startLeader, startReplica, statementOutcomeOf, statementState,
  temporaryDbPath, track, transactionOperationOutcomes, txMessage,
} from '../test-helpers/participant-transaction-fixture.js';

// The admission owner's codes for the two commands (partition-participant-
// transaction-constants.js).
const ORIGIN_REFUSED = 'partition_write_transaction_command_not_admissible';
const BYTES_INVALID = 'partition_write_transaction_command_invalid';
// A staging session's state as an answer names it (design 4).
const ACTIVE = 'ACTIVE';
const CODE = Object.freeze({
  WRITE_RESERVED: 'partition_write_reserved',
  ALREADY_ACTIVE: 'participant_transaction_already_active',
  IDENTITY_MISMATCH: 'participant_transaction_identity_mismatch',
  NOT_ACTIVE: 'participant_transaction_not_active',
  ORIGIN_PENDING: 'participant_transaction_generation_origin_pending',
});
// The REFUSED causes these witnesses name (design 2.3, 6.2, 0.0.13).
const CAUSE = Object.freeze({
  ORIGIN_MISMATCH: 'origin_mismatch',
  COMMIT_BASE_MOVED: 'commit_base_moved',
  COMMIT_STATEMENT_FAILED: 'commit_statement_failed',
});
const OWNER = Object.freeze({origin: PARTITION_COMMITTED_COMMAND_ORIGIN.TRANSACTION_OWNER});
const REFUSED = V3.STATE.REFUSED;

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

// What an image of a partition database holds for one transaction: its row's
// state, the write generation and its origin, the applied index and the data
// row.
async function imageFacts(replica, imagePath, transactionId) {
  await replica.db.backup(imagePath);
  const image = new Database(imagePath);
  try {
    const groupId = replica.controllablePort.request[RAFT_OPERATION_PORT_REQUEST.GROUP_ID];
    return {
      state: image.prepare('SELECT state FROM _participant_transactions ' +
        'WHERE transaction_id = ?').get(transactionId)?.state ?? null,
      generation: image.prepare('SELECT generation FROM _partition_write_generation')
        .get()?.generation ?? null,
      origin: image.prepare('SELECT origin_index FROM _partition_write_generation')
        .get()?.origin_index ?? null,
      applied: Number(new RaftRsDurableStore(image).readDurableProgress(groupId).appliedIndex),
      rows: image.prepare('SELECT COUNT(*) AS count FROM test_table WHERE id = ?')
        .get(ROW.id).count,
    };
  } finally {
    image.close();
  }
}

test('TX1 inc3: the participant row and the write generation are application state: an ' +
  'image of the partition database at an applied index carries both exactly as applied ' +
  'there (design 8.2)', async () => {
  const {directory, dbPath} = temporaryDbPath();
  const tx = identityOf('i3-image');
  let replica = null;
  try {
    replica = await startReplica(REPLICAS[1], {dbPath});
    const facts = {atOpen: generationOf(replica)};
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(replica));
    facts.prepareApply = applyCommitted(replica, prepareCommand);
    facts.prepared = await imageFacts(replica, path.join(directory, 'prepared.db'), 'i3-image');
    facts.decisionApply = applyCommitted(replica, commitDecision(tx, prepareCommand));
    facts.committed = await imageFacts(replica, path.join(directory, 'committed.db'), 'i3-image');
    facts.writeApply = applyCommitted(replica, ordinaryWriteOf('i3-image-write', OTHER_ROW));
    facts.written = await imageFacts(replica, path.join(directory, 'written.db'), 'i3-image');
    const at = (offset) => GENERATION_ORIGIN_INDEX + offset;
    const origin = GENERATION_ORIGIN_INDEX;
    assert.deepEqual(facts, {atOpen: 0, prepareApply: null,
      prepared: {state: V3.STATE.PREPARED, generation: 0, origin, applied: at(1), rows: 0},
      decisionApply: null,
      committed: {state: V3.STATE.COMMITTED, generation: 1, origin, applied: at(2), rows: 1},
      writeApply: null,
      written: {state: V3.STATE.COMMITTED, generation: 2, origin, applied: at(3), rows: 1}},
    'a row, g with its origin and the applied index are written by one application ' +
    'transaction');
  } finally {
    await shutdownAll(replica);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('TX1 inc3: the admission owner admits the two commands only from the transaction owner ' +
  'and only in their pinned byte form; a forwarded write carrying one proposes nothing',
async () => {
  const tx = identityOf('i3-admit');
  const prepare = prepareCommandOf(tx, [operationOf(ROW)], 0);
  const decision = commitDecision(tx, prepare);
  const owner = {origin: PARTITION_COMMITTED_COMMAND_ORIGIN.TRANSACTION_OWNER};
  const codeOf = (command, options = owner) => {
    const admission = admitCommittedCommand(command, options);
    return admission.admitted ? 'admitted' : admission.code;
  };
  const facts = {
    pinned: [codeOf(prepare), codeOf(decision)],
    writePath: codeOf(prepare, {origin: PARTITION_COMMITTED_COMMAND_ORIGIN.WRITE_PATH}),
    digest: codeOf({...prepare, preparedDigest: sha256('other bytes')}),
    entryId: codeOf({...prepare, entryId: 'i3-admit:tx1-v3:other'}),
    identity: codeOf({...prepare, participantId: 'i3-other:tx1-v3'}),
    epoch: codeOf({...prepare, transactionEpoch: 'seven'}),
    decisionText: codeOf({...decision, decisionText: `${decision.decisionText} `}),
    operations: codeOf({...decision, operationsText: prepare.operationsText}),
    unboundCommit: codeOf(decisionCommandOf(tx, V3.DECISION.COMMIT, null)),
  };
  const {leader, proposed} = await startLeader();
  try {
    facts.forwarded = pick(await leader.applyWrite(prepare), ['success', 'failureCode']);
    facts.proposed = proposed.length;
  } finally {
    await shutdownAll(leader);
  }
  assert.deepEqual(facts, {pinned: ['admitted', 'admitted'], writePath: ORIGIN_REFUSED,
    digest: BYTES_INVALID, entryId: BYTES_INVALID, identity: BYTES_INVALID,
    epoch: BYTES_INVALID, decisionText: BYTES_INVALID, operations: BYTES_INVALID,
    unboundCommit: BYTES_INVALID, forwarded: {success: false, failureCode: ORIGIN_REFUSED},
    proposed: 0}, 'nothing the apply would refuse as malformed is ever proposed');
});

// Apply `commands` in order on two fresh replicas; per replica, each apply's
// typed failure (or null), the outcome of `subject` and the generation.
function appliedOnTwoReplicas(subject, commandsOf) {
  return onTwoReplicas(async (replica) => {
    const appliedBefore = durableAppliedIndex(replica);
    const applies = commandsOf(replica).map((command) => applyCommitted(replica, command));
    return {applies, outcome: await outcomeOf(replica, subject, ['refusalCause']),
      generation: generationOf(replica), rows: rowCount(replica, ROW.id),
      participantRows: replica.db.prepare('SELECT COUNT(*) AS count FROM ' +
        '_participant_transactions').get().count,
      appliedAdvance: durableAppliedIndex(replica) - appliedBefore};
  });
}

test('TX1 inc3: transition-table cells the W-series leaves out are consumed alike on every ' +
  'replica: a foreign participantId, an idempotent and a content-conflicting PREPARE, a ' +
  'decision whose mode, digest or decision record is not the row\'s, and a REFUSED ' +
  'transaction\'s decisions', async () => {
  const tx = identityOf('i3-cells');
  const facts = {};
  // Another partition's participant, carrying this partition's conflict evidence.
  facts.foreign = await appliedOnTwoReplicas(tx, (replica) => [prepareCommandOf(
    identityOf('i3-cells', {partitionId: 'other-partition'}), [operationOf(ROW)],
    generationOf(replica))]);
  facts.repeated = await onTwoReplicas(async (replica) => {
    const prepare = prepareCommandOf(tx, [operationOf(ROW)], generationOf(replica));
    const forged = bindingOf(identityOf('i3-cells-other'), V3.DECISION.COMMIT,
      prepare.preparedDigest);
    const refused = [prepare, prepare, prepareCommandOf(tx, [operationOf(ROW_2)],
      generationOf(replica)), {...commitDecision(tx, prepare), commitMode: 'ONE_PHASE_COMMIT'},
    decisionCommandOf(tx, V3.DECISION.ROLLBACK, sha256('other content')),
    {...commitDecision(tx, prepare), decisionText: forged.decisionText,
      decisionDigest: forged.decisionDigest}];
    const appliedBefore = durableAppliedIndex(replica);
    const applies = refused.map((command) => applyCommitted(replica, command));
    const afterRefusals = {...(await outcomeOf(replica, tx)), generation: generationOf(replica),
      rows: rowCount(replica, ROW.id),
      appliedAdvance: durableAppliedIndex(replica) - appliedBefore};
    applies.push(applyCommitted(replica, commitDecision(tx, prepare)));
    return {applies, afterRefusals, final: {...(await outcomeOf(replica, tx)),
      generation: generationOf(replica), rows: rowCount(replica, ROW.id)}};
  });
  facts.refused = await appliedOnTwoReplicas(tx, (replica) => {
    const prepare = prepareCommandOf(tx, [operationOf(ROW)], generationOf(replica) + 1);
    return [prepare, commitDecision(tx, prepare),
      decisionCommandOf(tx, V3.DECISION.ROLLBACK, prepare.preparedDigest)];
  });
  const consumed = (outcome, applies, participantRows) => ({applies, outcome, generation: 0,
    rows: 0, participantRows, appliedAdvance: applies.length});
  const absent = {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.ABSENT,
    refusalCause: null};
  const repeated = {applies: [null, null, null, null, null, null, null],
    afterRefusals: {...PREPARED, generation: 0, rows: 0, appliedAdvance: 6},
    final: {...COMMITTED, generation: 1, rows: 1}};
  const refusedConflict = {...notCommitted(V3.STATE.REFUSED),
    refusalCause: V3.REFUSAL_CAUSE.CONFLICT};
  assert.deepEqual(facts, {foreign: [1, 2].map(() => consumed(absent, [null], 0)),
    repeated: [repeated, repeated],
    refused: [1, 2].map(() => consumed(refusedConflict, [null, null, null], 1))},
  'only the bound decision of the PREPARED content moves the row; nothing else writes');
});

test('TX1 inc3: a write the leader proposed that meets the reservation is answered typed and ' +
  'retryable with its entry key unsettled, and the same entryId applies after the decision; ' +
  'BEGIN and an unknown transaction\'s statement are refused while nothing is proposed',
async () => {
  const tx = identityOf('i3-reserved');
  const {leader, proposed} = await startLeader();
  try {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader));
    const facts = {prepareApply: applyCommitted(leader, prepareCommand)};
    const write = track(leader.executeQuery(INSERT_SQL, [OTHER_ROW.id, OTHER_ROW.value],
      {entryId: 'i3-reserved-write'}));
    const entry = await awaitProposal(proposed, hasEntryId('i3-reserved-write'));
    facts.reservedApply = entry ? applyCommitted(leader, entry) : 'not proposed';
    await settleTicks();
    facts.answer = write.settled ? pick(write.value, ['success', 'failureCode', 'deferRetry']) :
      'pending';
    facts.retryable = isRetryableWriteFailureCode(facts.answer?.failureCode);
    facts.unsettled = statementState(leader, 'i3-reserved-write');
    const proposedBefore = proposed.length;
    facts.begin = pick(await send(leader, beginMessage(identityOf('i3-other'))),
      ['success', 'failureCode']);
    facts.legacyBegin = pick(await send(leader, {type: 'TRANSACTION',
      operation: PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION, sessionId: 'legacy'}),
    ['success', 'failureCode']);
    facts.unknownStatement = pick(await send(leader, queryMessage(identityOf('i3-unknown'),
      INSERT_SQL, [ROW_2.id, ROW_2.value])), ['success', 'failureCode']);
    facts.mismatch = pick(await send(leader, txMessage(
      PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, {...tx, participantId: 'x:tx1-v3'})),
    ['success', 'failureCode']);
    facts.proposedByRefusals = proposed.length - proposedBefore;
    facts.decisionApply = applyCommitted(leader, commitDecision(tx, prepareCommand));
    facts.retried = entry ? applyCommitted(leader, entry) : 'not proposed';
    facts.final = {...(await outcomeOf(leader, tx)), rows: rowCount(leader, OTHER_ROW.id),
      statement: statementState(leader, 'i3-reserved-write')};
    assert.deepEqual(facts, {prepareApply: null, reservedApply: null,
      answer: {success: false, failureCode: CODE.WRITE_RESERVED, deferRetry: true}, retryable: true, unsettled: 'unsettled',
      begin: {success: false, failureCode: CODE.ALREADY_ACTIVE},
      legacyBegin: {success: false, failureCode: CODE.ALREADY_ACTIVE},
      unknownStatement: {success: false, failureCode: CODE.NOT_ACTIVE},
      mismatch: {success: false, failureCode: CODE.IDENTITY_MISMATCH}, proposedByRefusals: 0,
      decisionApply: null, retried: null,
      final: {...COMMITTED, rows: 1, statement: 'settled'}},
    'the reservation defers other writers; it never settles or loses them');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 inc3: an outcome read answers from the durable row on any replica, PREPARED with ' +
  'its digest, index and term', async () => {
  const tx = identityOf('i3-outcome');
  const [first, second] = await onTwoReplicas(async (replica) => {
    const prepareCommand = prepareCommandOf(tx, [operationOf(ROW)], generationOf(replica));
    applyCommitted(replica, prepareCommand);
    return {...(await outcomeOf(replica, tx, ['preparedDigest', 'prepareIndex',
      'prepareTerm'])), digestIsCarried: (await send(replica, txMessage(
      PARTITION_SERVICE_OPERATION.TRANSACTION_OUTCOME, tx)))?.preparedDigest ===
      prepareCommand.preparedDigest};
  });
  const prepareIndex = GENERATION_ORIGIN_INDEX + 1;
  assert.deepEqual({first: {...first, preparedDigest: typeof first.preparedDigest}, second:
    {...second, preparedDigest: typeof second.preparedDigest}}, {first: {...PREPARED,
    preparedDigest: 'string', prepareIndex, prepareTerm: 1, digestIsCarried: true},
  second: {...PREPARED, preparedDigest: 'string', prepareIndex, prepareTerm: 1,
    digestIsCarried: true}}, 'PREPARED is UNKNOWN, never a commit or a non-commit');
});

test('TX1 inc3: a PREPARE ends the session\'s staging transaction before it proposes, so its ' +
  'command is applied on the leader\'s own connection and a session statement after it is ' +
  'refused, never run as a sessionless write', async () => {
  const tx = identityOf('i3-seal');
  const {leader, proposed} = await startLeader();
  try {
    const facts = {begun: pick(await send(leader, beginMessage(tx)), ['success', 'state'])};
    facts.staged = (await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value])))
      ?.success === true;
    facts.stagingOpen = leader.db.inTransaction;
    const prepare = track(send(leader, txMessage(PARTITION_SERVICE_OPERATION.PREPARE_TRANSACTION,
      tx)));
    const command = await awaitProposal(proposed,
      (entry) => entry.transactionId === tx.transactionId);
    facts.atProposal = {stagingOpen: leader.db.inTransaction, rows: rowCount(leader),
      type: command?.type ?? null};
    facts.late = pick(await send(leader, queryMessage(tx, INSERT_SQL, [ROW_2.id, ROW_2.value])),
      ['success', 'failureCode']);
    facts.apply = command ? applyCommitted(leader, command) : 'not proposed';
    facts.answer = pick(await prepare.promise, ['success', 'state']);
    facts.proposed = proposed.map((entry) => entry.type);
    assert.deepEqual(facts, {begun: {success: true, state: ACTIVE}, staged: true,
      stagingOpen: true, atProposal: {stagingOpen: false, rows: 0,
        type: V3.PREPARE_COMMAND}, late: {success: false,
        failureCode: 'participant_transaction_preparing'}, apply: null,
      answer: {success: true, state: V3.STATE.PREPARED}, proposed: [V3.PREPARE_COMMAND]},
    'no consensus write ever runs inside, or is erased by, the session');
  } finally {
    await shutdownAll(leader);
  }
});

test('TX1 inc3: another transaction\'s PREPARE that meets the reservation writes nothing and ' +
  'settles nothing, so the same command prepares once the reservation is released',
async () => {
  const first = identityOf('i3-first');
  const second = identityOf('i3-second');
  const perReplica = await onTwoReplicas(async (replica) => {
    const firstPrepare = prepareCommandOf(first, [operationOf(ROW)], generationOf(replica));
    const secondPrepare = prepareCommandOf(second, [operationOf(ROW_2)], generationOf(replica));
    const applies = [applyCommitted(replica, firstPrepare),
      applyCommitted(replica, secondPrepare)];
    const whileReserved = {...(await outcomeOf(replica, second)),
      generation: generationOf(replica)};
    applies.push(applyCommitted(replica, decisionCommandOf(first, V3.DECISION.ROLLBACK,
      firstPrepare.preparedDigest)), applyCommitted(replica, secondPrepare));
    return {applies, whileReserved, after: [await outcomeOf(replica, first),
      await outcomeOf(replica, second)], rows: rowCount(replica, ROW_2.id)};
  });
  const expected = {applies: [null, null, null, null],
    whileReserved: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN, state: V3.STATE.ABSENT,
      generation: 0}, after: [notCommitted(V3.STATE.ROLLED_BACK), PREPARED], rows: 0};
  assert.deepEqual(perReplica, [expected, expected],
    'one PREPARED transaction per partition; contention never forces an abort');
});

test('TX1 inc3: the PREPARE dry run runs each carried operation through the statement-' +
  'admission owner, post-statement ceiling included: a top-key insert on an INTEGER PRIMARY ' +
  'KEY table is REFUSED rowid_ceiling identically and leaves no row', async () => {
  const tx = identityOf('i3-ceiling');
  const perReplica = [];
  for (const replicaId of [REPLICAS[1], REPLICAS[2]]) {
    const replica = await startReplica(replicaId, {schema: IPK_SCHEMA});
    try {
      const apply = applyCommitted(replica, prepareCommandOf(tx, [{entryId: 'op-top',
        sql: 'INSERT INTO test_table (id, value) VALUES (?, ?)',
        params: [String(INT64_MAX), 'top']}], generationOf(replica)));
      perReplica.push({apply, outcome: await outcomeOf(replica, tx, ['refusalCause']),
        rows: replica.db.prepare('SELECT COUNT(*) AS count FROM test_table').get().count,
        generation: generationOf(replica)});
    } finally {
      await shutdownAll(replica);
    }
  }
  const refused = {apply: null, outcome: {...notCommitted(V3.STATE.REFUSED),
    refusalCause: V3.REFUSAL_CAUSE.ROWID_CEILING}, rows: 0, generation: 0};
  assert.deepEqual(perReplica, [refused, refused],
    'no random rowid allocation can be prepared: the dry run sees the ceiling');
});

// Run `measure(replica)` on one fresh fixture replica and shut it down.
async function onReplica(measure, extra) {
  const replica = await startReplica(REPLICAS[1], extra);
  try {
    return await measure(replica);
  } finally {
    await shutdownAll(replica);
  }
}

// Run `measure(leader, proposed)` on a fresh fixture leader and shut it down.
async function onLeader(measure, extra) {
  const {leader, proposed} = await startLeader(extra);
  try {
    return await measure(leader, proposed);
  } finally {
    await shutdownAll(leader);
  }
}

// `tx` staged on the leader (BEGIN, one row) with its PREPARE proposed and
// still in flight.
async function preparingOn(leader, proposed, tx) {
  await send(leader, beginMessage(tx));
  await send(leader, queryMessage(tx, INSERT_SQL, [ROW.id, ROW.value]));
  const prepare = track(send(leader, prepareMessage(tx)));
  const command = await awaitProposal(proposed,
    (entry) => isPrepareCommand(entry) && entry.transactionId === tx.transactionId);
  return {prepare, command};
}

// --- B1: the write generation counts from a committed origin (design 0.0.13) ---

test('TX1 inc3 origin: a database written before the generation origin existed, reopened on ' +
  'this build, and a replica that replayed the same entries on it count different ' +
  'generations until the committed origin applies; from it on both agree on the same PREPARE ' +
  'and COMMIT', async () => {
  const {directory, dbPath} = temporaryDbPath();
  const writes = ['o1-w1', 'o1-w2', 'o1-w3'].map((entryId, ordinal) =>
    ordinaryWriteOf(entryId, {id: `old-${ordinal}`, value: 'v'}));
  const tx = identityOf('o1');
  let upgraded = null;
  let replayed = null;
  try {
    // An increment-2 database: three committed writes, no participant tables.
    upgraded = await startReplica(REPLICAS[1], {dbPath, generationOrigin: false});
    writes.forEach((write) => applyCommitted(upgraded, write));
    upgraded.db.exec('DROP TABLE _participant_transactions; ' +
      'DROP TABLE _partition_write_generation');
    await upgraded.shutdown();
    // Reopened on this build at applied index 3 (an upgrade restart).
    upgraded = await startReplica(REPLICAS[1], {dbPath, generationOrigin: false});
    upgraded.controllablePort.committedIndex = durableAppliedIndex(upgraded);
    replayed = await startReplica(REPLICAS[2], {generationOrigin: false});
    writes.forEach((write) => applyCommitted(replayed, write));
    const both = [upgraded, replayed];
    const facts = {before: {applied: both.map(durableAppliedIndex),
      generation: both.map(generationOf), origin: both.map(originOf)}};
    facts.originApply = both.map((replica) => applyCommitted(replica, originCommandOf()));
    facts.afterOrigin = {generation: both.map(generationOf), origin: both.map(originOf)};
    // The leader (the replayed replica) read its BEGIN-time base from the origin.
    const prepare = prepareCommandOf(tx, [operationOf(ROW)], generationOf(replayed),
      PARTITION_ID, originOf(replayed));
    facts.prepareApply = both.map((replica) => applyCommitted(replica, prepare));
    facts.prepared = [await outcomeOf(upgraded, tx), await outcomeOf(replayed, tx)];
    facts.decisionApply = both.map((replica) =>
      applyCommitted(replica, commitDecision(tx, prepare)));
    facts.final = [];
    for (const replica of both) {
      facts.final.push({...(await outcomeOf(replica, tx)), generation: generationOf(replica),
        rows: replica.db.prepare('SELECT id, value FROM test_table ORDER BY id').all()});
    }
    const final = {...COMMITTED, generation: 1, rows: [{id: 'old-0', value: 'v'},
      {id: 'old-1', value: 'v'}, {id: 'old-2', value: 'v'}, {...ROW}]};
    assert.deepEqual(facts, {before: {applied: [3, 3], generation: [0, 3], origin: [null, null]},
      originApply: [null, null], afterOrigin: {generation: [0, 0], origin: [4, 4]},
      prepareApply: [null, null], prepared: [PREPARED, PREPARED], decisionApply: [null, null],
      final: [final, final]},
    'g is a function of the committed prefix from the origin on, on every replica');
  } finally {
    await shutdownAll(upgraded, replayed);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('TX1 inc3 origin: until the generation origin has applied on the leader a BEGIN carrying ' +
  'a transactionId is refused generation_origin_pending; enabling transactions proposes the ' +
  'origin once, and BEGIN is admitted once it has applied', () => onLeader(
  async (leader, proposed) => {
    const tx = identityOf('o2');
    const facts = {begin: pick(await send(leader, beginMessage(tx)), ['success', 'failureCode']),
      stagingOpen: leader.db.inTransaction};
    const enabling = track(enableParticipantTransactionAdmission(leader));
    const origin = await awaitProposal(proposed,
      (entry) => entry.type === V3.GENERATION_ORIGIN_COMMAND);
    facts.answeredBeforeApply = enabling.settled;
    facts.originApply = origin ? applyCommitted(leader, origin) : 'not proposed';
    facts.enabled = pick(await enabling.promise, ['success', 'originIndex', 'originTerm']);
    facts.again = pick(await enableParticipantTransactionAdmission(leader),
      ['success', 'alreadyEnabled', 'originIndex']);
    facts.proposed = proposed.map((entry) => entry.type);
    facts.beginAfter = pick(await send(leader, beginMessage(tx)), ['success', 'state']);
    assert.deepEqual(facts, {begin: {success: false, failureCode: CODE.ORIGIN_PENDING},
      stagingOpen: false, answeredBeforeApply: false, originApply: null,
      enabled: {success: true, originIndex: 1, originTerm: 1},
      again: {success: true, alreadyEnabled: true, originIndex: 1},
      proposed: [V3.GENERATION_ORIGIN_COMMAND], beginAfter: {success: true, state: ACTIVE}},
    'no transaction reads a base before the origin it counts from is committed here');
  }, {generationOrigin: false}));

test('TX1 inc3 origin: a PREPARE whose evidence counts from another origin, or that reaches a ' +
  'replica with no origin, is REFUSED origin_mismatch alike and reserves nothing; a second ' +
  'origin command changes nothing, so g never revisits a value', async () => {
  const tx = identityOf('o3');
  const perReplica = await onTwoReplicas(async (replica) => {
    const facts = {foreignApply: applyCommitted(replica, prepareCommandOf(tx,
      [operationOf(ROW)], generationOf(replica), PARTITION_ID, GENERATION_ORIGIN_INDEX + 5))};
    facts.foreign = await outcomeOf(replica, tx, ['refusalCause']);
    facts.writeApply = applyCommitted(replica, ordinaryWriteOf('o3-w', OTHER_ROW));
    facts.secondOrigin = applyCommitted(replica, originCommandOf());
    facts.after = {generation: generationOf(replica), origin: originOf(replica)};
    return facts;
  });
  const bare = await onReplica(async (replica) => ({apply: applyCommitted(replica,
    prepareCommandOf(tx, [operationOf(ROW)], generationOf(replica))),
  outcome: await outcomeOf(replica, tx, ['refusalCause'])}), {generationOrigin: false});
  const refused = {...notCommitted(REFUSED), refusalCause: CAUSE.ORIGIN_MISMATCH};
  const expected = {foreignApply: null, foreign: refused, writeApply: null, secondOrigin: null,
    after: {generation: 1, origin: GENERATION_ORIGIN_INDEX}};
  assert.deepEqual({perReplica, bare}, {perReplica: [expected, expected],
    bare: {apply: null, outcome: refused}}, 'only a bug carries another origin; it never prepares');
});

// --- B2: the dimensions the independent verification found unmeasured (its G1-G13) ---

test('TX1 inc3 G1: a decision digest that is a strict prefix of sha256(decisionText) is ' +
  'refused at the request, by admission and at apply', () => onLeader(async (leader, proposed) => {
  const tx = identityOf('g1');
  const prepare = prepareCommandOf(tx, [operationOf(ROW)], generationOf(leader));
  applyCommitted(leader, prepare);
  const bound = commitDecision(tx, prepare);
  const prefix = bound.decisionDigest.slice(0, 40);
  const forged = {...bound, decisionDigest: prefix, entryId: `${tx.participantId}:decision:${prefix}`};
  const facts = {request: pick(await send(leader, {...commitMessage(tx, prepare.preparedDigest),
    decisionDigest: prefix}), ['success', 'failureCode']),
  admitted: admitCommittedCommand(forged, OWNER).admitted, apply: applyCommitted(leader, forged),
  proposed: proposed.length};
  facts.after = {...(await outcomeOf(leader, tx)), rows: rowCount(leader)};
  assert.deepEqual(facts, {request: {success: false,
    failureCode: V3.CODE.DECISION_DIGEST_MISMATCH}, admitted: false, apply: null, proposed: 0,
  after: {...PREPARED, rows: 0}}, 'the decision digest is exactly sha256 of its text');
}));

test('TX1 inc3 G2: a deterministic failure of a later COMMIT operation leaves no earlier ' +
  'operation, no per-operation outcome and no generation move (one savepoint)', () => onReplica(
  async (replica) => {
    const tx = identityOf('g2');
    const prepare = prepareCommandOf(tx, [operationOf(ROW), operationOf(ROW_2)],
      generationOf(replica));
    applyCommitted(replica, prepare);
    replica.db.exec('CREATE TRIGGER g2_abort AFTER INSERT ON test_table WHEN NEW.id = ' +
      `'${ROW_2.id}' BEGIN SELECT RAISE(ABORT, 'g2'); END`);
    const apply = applyCommitted(replica, commitDecision(tx, prepare));
    assert.deepEqual({apply, outcome: await outcomeOf(replica, tx, ['refusalCause']),
      rows: [rowCount(replica, ROW.id), rowCount(replica, ROW_2.id)],
      txop: transactionOperationOutcomes(replica), generation: generationOf(replica)},
    {apply: null, outcome: {...notCommitted(REFUSED), refusalCause: CAUSE.COMMIT_STATEMENT_FAILED},
      rows: [0, 0], txop: 0, generation: 0}, 'a COMMIT applies all of its operations or none');
  }));

test('TX1 inc3 G3: while a PREPARE is in flight on the leader, a participant BEGIN and a ' +
  'legacy BEGIN are refused already_active and open no staging transaction', () => onLeader(
  async (leader, proposed) => {
    const {prepare, command} = await preparingOn(leader, proposed,
      identityOf('g3-a', {sessionId: 's-a'}));
    const facts = {participant: pick(await send(leader, beginMessage(identityOf('g3-b',
      {sessionId: 's-b'}))), ['success', 'failureCode']), legacy: pick(await send(leader,
      {type: 'TRANSACTION', operation: PARTITION_SERVICE_OPERATION.BEGIN_TRANSACTION,
        sessionId: 's-legacy'}), ['success', 'failureCode']), stagingOpen: leader.db.inTransaction};
    facts.apply = command ? applyCommitted(leader, command) : 'not proposed';
    facts.prepared = pick(await prepare.promise, ['success', 'state']);
    const refused = {success: false, failureCode: CODE.ALREADY_ACTIVE};
    assert.deepEqual(facts, {participant: refused, legacy: refused, stagingOpen: false,
      apply: null, prepared: {success: true, state: V3.STATE.PREPARED}},
    'PREPARING holds the partition like PREPARED does');
  }));

test('TX1 inc3 G4: an ordinary committed statement that fails deterministically is a control ' +
  'row: the generation does not move, and a PREPARE at the base read before it prepares',
() => onReplica(async (replica) => {
  const tx = identityOf('g4');
  applyCommitted(replica, ordinaryWriteOf('g4-w1', OTHER_ROW));
  const base = generationOf(replica);
  const facts = {base, failed: applyCommitted(replica, ordinaryWriteOf('g4-w2', OTHER_ROW))};
  facts.statement = statementOutcomeOf(replica, 'g4-w2').outcome;
  facts.generation = generationOf(replica);
  facts.prepareApply = applyCommitted(replica, prepareCommandOf(tx, [operationOf(ROW)], base));
  facts.outcome = await outcomeOf(replica, tx);
  assert.deepEqual(facts, {base: 1, failed: null, statement: 'statement_failed', generation: 1,
    prepareApply: null, outcome: PREPARED}, 'g counts application-data changes only');
}));

test('TX1 inc3 G5: a PREPARE whose base is two generations old is refused conflict', () =>
  onReplica(async (replica) => {
    const tx = identityOf('g5');
    const base = generationOf(replica);
    applyCommitted(replica, ordinaryWriteOf('g5-w1', OTHER_ROW));
    applyCommitted(replica, ordinaryWriteOf('g5-w2', {id: 'row-8', value: 'x'}));
    applyCommitted(replica, prepareCommandOf(tx, [operationOf(ROW)], base));
    assert.deepEqual({generation: generationOf(replica),
      outcome: await outcomeOf(replica, tx, ['refusalCause'])}, {generation: 2,
      outcome: {...notCommitted(REFUSED), refusalCause: V3.REFUSAL_CAUSE.CONFLICT}},
    'every stale base is refused, not only the latest one');
  }));

test('TX1 inc3 G6: a COMMIT that finds the generation moved since its PREPARE is settled ' +
  'REFUSED commit_base_moved and applies nothing', () => onReplica(async (replica) => {
  const tx = identityOf('g6');
  const prepare = prepareCommandOf(tx, [operationOf(ROW)], generationOf(replica));
  applyCommitted(replica, prepare);
  // Only a bug moves g under a reservation; planted on the connection.
  replica.db.exec('UPDATE _partition_write_generation SET generation = generation + 1');
  const apply = applyCommitted(replica, commitDecision(tx, prepare));
  assert.deepEqual({apply, outcome: await outcomeOf(replica, tx, ['refusalCause']),
    rows: rowCount(replica), txop: transactionOperationOutcomes(replica),
    generation: generationOf(replica)}, {apply: null,
    outcome: {...notCommitted(REFUSED), refusalCause: CAUSE.COMMIT_BASE_MOVED}, rows: 0,
    txop: 0, generation: 1}, 'the COMMIT re-checks the base it was prepared at');
}));

test('TX1 inc3 G7: a PREPARE whose application transaction rolls back after its row insert ' +
  'is never answered PREPARED: answers are effects after the commit', () => onLeader(
  async (leader, proposed) => {
    const tx = identityOf('g7');
    const {prepare, command} = await preparingOn(leader, proposed, tx);
    plantAppliedStateFailure(leader.db);
    const apply = command ? applyCommitted(leader, command) : 'not proposed';
    removeAppliedStateFailure(leader.db);
    await settleTicks();
    assert.deepEqual({apply, answer: prepare.settled ? pick(prepare.value, UNKNOWN_FIELDS) :
      'pending', outcome: await outcomeOf(leader, tx)}, {apply: 'SQLITE_CONSTRAINT_TRIGGER',
      answer: 'pending', outcome: {outcome: PARTICIPANT_COMMIT_OUTCOME.UNKNOWN,
        state: 'PREPARING'}}, 'a rolled-back PREPARE has no row and no answer yet');
  }));

test('TX1 inc3 G8: a participant command answered success has none of a write\'s side ' +
  'effects (not mirrored, no CDC entry, no size update or split request); an ordinary write ' +
  'has them', () => {
  const tx = identityOf('g8');
  const prepare = prepareCommandOf(tx, [operationOf(ROW)], 0);
  const planOf = (entry) => ({...buildPartitionWriteSideEffectPlan(entry,
    {success: true, changes: 1})});
  const none = {emitCdcEntry: null, splitReplicationEntry: null, scheduleSizeUpdate: false,
    requestManagedSplitEvaluation: false};
  assert.deepEqual({participant: [prepare, commitDecision(tx, prepare), originCommandOf()]
    .map(planOf), ordinarySized: planOf(ordinaryWriteOf('g8-w', OTHER_ROW)).scheduleSizeUpdate},
  {participant: [none, none, none], ordinarySized: true}, 'transactions are not mirrored');
});

test('TX1 inc3 G9: a settled ordinary write re-delivered while the partition is reserved is ' +
  'answered from its outcome row: the settled lookup comes before the reservation', () =>
  onReplica(async (replica) => {
    const tx = identityOf('g9');
    const write = ordinaryWriteOf('g9-w', OTHER_ROW);
    applyCommitted(replica, write);
    applyCommitted(replica, prepareCommandOf(tx, [operationOf(ROW)], generationOf(replica)));
    const answers = [];
    const resolve = replica.resolveCommittedWrite.bind(replica);
    replica.resolveCommittedWrite = (entryId, result) => {
      answers.push({entryId, ...pick(result, ['success', 'failureCode', 'settledReplay'])});
      return resolve(entryId, result);
    };
    const apply = applyCommitted(replica, write);
    assert.deepEqual({apply, answers: answers.filter((answer) => answer.entryId === 'g9-w')},
      {apply: null, answers: [{entryId: 'g9-w', success: true, failureCode: null,
        settledReplay: 'applied-outcome-retained'}]}, 'a settled write never meets the reservation');
  }));

test('TX1 inc3 G10: a COMMIT request while its PREPARE is in flight is refused preparing with ' +
  'deferRetry and proposes nothing', () => onLeader(async (leader, proposed) => {
  const tx = identityOf('g10');
  const {command} = await preparingOn(leader, proposed, tx);
  const commit = pick(await send(leader, commitMessage(tx, command?.preparedDigest)),
    ['success', 'failureCode', 'deferRetry']);
  assert.deepEqual({commit, decisions: proposed.filter(isDecisionCommand).length},
    {commit: {success: false, failureCode: V3.CODE.PREPARING, deferRetry: true}, decisions: 0},
    'a decision waits for the PREPARE it binds');
}));

test('TX1 inc3 G11: a request naming another transaction\'s staging session is never staged ' +
  'or sealed into it: the sessionId is routing only', () => onLeader(async (leader, proposed) => {
  const [first, second] = [identityOf('g11-a'), identityOf('g11-b')];
  await send(leader, beginMessage(first));
  await send(leader, queryMessage(first, INSERT_SQL, [ROW.id, ROW.value]));
  const facts = {staged: pick(await send(leader, queryMessage(second, INSERT_SQL,
    [ROW_2.id, ROW_2.value])), ['success', 'failureCode']),
  prepared: pick(await send(leader, prepareMessage(second)), ['success', 'failureCode'])};
  facts.proposedForSecond = proposed.filter((entry) =>
    entry.transactionId === second.transactionId).length;
  track(send(leader, prepareMessage(first)));
  const command = await awaitProposal(proposed,
    (entry) => isPrepareCommand(entry) && entry.transactionId === first.transactionId);
  facts.sealed = command ? JSON.parse(command.operationsText).map((op) => op.params[0]) : null;
  const notActive = {success: false, failureCode: CODE.NOT_ACTIVE};
  assert.deepEqual(facts, {staged: notActive, prepared: notActive, proposedForSecond: 0,
    sealed: [ROW.id]}, 'a session belongs to the transaction that began it');
}));

test('TX1 inc3 G12: the decided row records the decision entry\'s index and term, and an ' +
  'outcome read answers them with the PREPARE\'s', () => onReplica(async (replica) => {
  const tx = identityOf('g12');
  const prepare = prepareCommandOf(tx, [operationOf(ROW)], generationOf(replica));
  applyCommitted(replica, prepare);
  applyCommitted(replica, commitDecision(tx, prepare));
  assert.deepEqual(await outcomeOf(replica, tx, ['prepareIndex', 'prepareTerm', 'decisionIndex',
    'decisionTerm']), {...COMMITTED, prepareIndex: GENERATION_ORIGIN_INDEX + 1, prepareTerm: 1,
    decisionIndex: GENERATION_ORIGIN_INDEX + 2, decisionTerm: 1},
  'time is the entry\'s (index, term), never a clock');
}));

test('TX1 inc3 G13: a replayed COMMIT request answers the operations\' recorded results, ' +
  'equal to the first answer, and proposes nothing', () => onLeader(async (leader, proposed) => {
  const tx = identityOf('g13');
  const prepare = prepareCommandOf(tx, [operationOf(ROW), operationOf(ROW_2)],
    generationOf(leader));
  applyCommitted(leader, prepare);
  const first = track(send(leader, commitMessage(tx, prepare.preparedDigest)));
  const decision = await awaitProposal(proposed, isDecisionCommand);
  const apply = decision ? applyCommitted(leader, decision) : 'not proposed';
  await settleTicks();
  const replay = await send(leader, commitMessage(tx, prepare.preparedDigest));
  const results = [{changes: 1, lastInsertRowid: 1}, {changes: 1, lastInsertRowid: 2}];
  assert.deepEqual({apply, first: first.settled ? first.value.results : 'pending',
    replay: pick(replay, ['results', 'replayed']),
    decisions: proposed.filter(isDecisionCommand).length}, {apply: null, first: results,
    replay: {results, replayed: true}, decisions: 1}, 'per-operation results are retained');
}));
