/**
 * Durable read dependencies, prepared reservations, and bounded read accumulation
 * witnesses (Track 1 / Review §1):
 * 1. Exact 8-step write-skew counterexample (live and across disk reconstruction
 *    on simulated restart / leader change).
 * 2. Retained concurrency companion (disjoint transactions and read/read overlap
 *    at equal generation prepare and commit cleanly alongside a PREPARED tx).
 * 3. Bounded read accumulator overflow (key count and UTF-8 byte ceiling)
 *    irreversible widening to 'partition' scope, key release, disk survival,
 *    blocking concurrent non-empty writes while allowing read-only inspection.
 * 4. Deliberate regression controls (omitted/malformed/over-budget durable read
 *    scope with recomputed preparedDigest, equal-generation asymmetric R1∩W2 and
 *    W1∩R2 reservation checks, and overflow key-drop falsification).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_COMMITTED_COMMAND_ORIGIN,
  admitCommittedCommand,
} from '../../src/partition/partition-committed-command-admission.js';
import {
  PARTICIPANT_CONCURRENCY_GRANULARITY,
  PARTICIPANT_READ_DEPENDENCY_BOUND,
  PARTICIPANT_READ_DEPENDENCY_SCOPE,
  PARTICIPANT_TRANSACTION_ADMISSION_CODE,
  PARTICIPANT_TRANSACTION_FAILURE_CODE,
  PARTICIPANT_TRANSACTION_REFUSAL_CAUSE,
  PARTICIPANT_TRANSACTION_STATE,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {
  preparedDigestOf,
  validationTextOf,
} from '../../src/partition/partition-participant-transaction-bytes.js';
import {
  decodeParticipantValidationText,
  doTransactionFootprintsConflict,
  getSessionReadDependencySnapshot,
} from '../../src/partition/partition-participant-read-dependencies.js';
import {
  discardParticipantSessions,
  findParticipantSession,
  resetParticipantRowKeyHistory,
} from '../../src/partition/partition-participant-transaction-session.js';
import {
  clearFootprintAstCache,
  getFootprintAstCacheStats,
  getFootprintPlanCacheStats,
  getOrParseCachedStatementFootprintAst,
  getStagingReplayStats,
} from '../../src/partition/partition-participant-transaction-staging.js';
import {projectTransactionParticipantFailure} from
  '../../src/query/distributed/transaction-participant-error-projection.js';
import {QUERY_ERROR_CODE} from '../../src/query/query-constants.js';
import {PG_WIRE_SQLSTATE} from '../../src/query/pg/pg-wire-constants.js';
import {
  GENERATION_ORIGIN_INDEX,
  INSERT_SQL,
  PARTITION_ID,
  TABLE,
  V3,
  applyCommitted,
  awaitProposal,
  beginMessage,
  commitMessage,
  generationOf,
  identityOf,
  isDecisionCommand,
  isPrepareCommand,
  operationOf,
  prepareCommandOf,
  prepareMessage,
  queryMessage,
  send,
  settleTicks,
  sha256,
  shutdownAll,
  startLeader,
  temporaryDbPath,
} from '../test-helpers/participant-transaction-fixture.js';

const SELECT_BY_ID_SQL = `SELECT id, value FROM ${TABLE} WHERE id = ?`;
const SELECT_ALL_SQL = `SELECT id, value FROM ${TABLE} ORDER BY id`;
const UPDATE_BY_ID_SQL = `UPDATE ${TABLE} SET value = ? WHERE id = ?`;
const OWNER_ORIGIN = Object.freeze({
  origin: PARTITION_COMMITTED_COMMAND_ORIGIN.TRANSACTION_OWNER,
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

function configureRowKeyLeader(leader, waitMs = 3000) {
  leader.concurrencyGranularity = PARTICIPANT_CONCURRENCY_GRANULARITY.ROW_KEY;
  leader.conflictSettleWaitMs = waitMs;
  if (!leader.cdcIntegrationService) {
    leader.cdcIntegrationService = {enabled: true};
  }
}

function readRowValue(service, id) {
  const row = service.db
    .prepare(`SELECT value FROM ${TABLE} WHERE id = ?`)
    .get(id);
  return row?.value ?? null;
}

function reopenLeaderSqliteAndReconstructFromDisk(leader) {
  leader.db.pragma('wal_checkpoint(TRUNCATE)');
  discardParticipantSessions(leader);
  resetParticipantRowKeyHistory(leader);
}

async function prepareParticipantTx(leader, proposed, txIdentity) {
  const prepPromise = send(leader, prepareMessage(txIdentity));
  const prepCmd = await awaitProposal(
    proposed,
    (entry) =>
      entry.transactionId === txIdentity.transactionId && isPrepareCommand(entry),
  );
  assert.ok(prepCmd, `PREPARE command must be proposed for ${txIdentity.transactionId}`);
  assert.equal(applyCommitted(leader, prepCmd), null);
  const prepResult = await prepPromise;
  return {prepCmd, prepResult};
}

async function commitPreparedParticipantTx(leader, proposed, txIdentity, preparedDigest) {
  const commitPromise = send(leader, commitMessage(txIdentity, preparedDigest));
  const decisionCmd = await awaitProposal(
    proposed,
    (entry) =>
      entry.transactionId === txIdentity.transactionId && isDecisionCommand(entry),
  );
  assert.ok(decisionCmd, `COMMIT command must be proposed for ${txIdentity.transactionId}`);
  assert.equal(applyCommitted(leader, decisionCmd), null);
  const commitResult = await commitPromise;
  assert.equal(commitResult.success, true);
  assert.equal(commitResult.state, PARTICIPANT_TRANSACTION_STATE.COMMITTED);
  return {decisionCmd, commitResult};
}

async function commitParticipantTx(leader, proposed, txIdentity) {
  const {prepCmd, prepResult} = await prepareParticipantTx(leader, proposed, txIdentity);
  assert.equal(prepResult.success, true, `PREPARE failed: ${JSON.stringify(prepResult)}`);
  const {commitResult} = await commitPreparedParticipantTx(
    leader,
    proposed,
    txIdentity,
    prepResult.preparedDigest,
  );
  return {prepCmd, prepResult, commitResult};
}

async function seedInitialRows(leader, proposed, rows) {
  const seedTx = identityOf('10'.repeat(16), {sessionId: 'sess-seed'});
  assert.equal((await send(leader, beginMessage(seedTx))).success, true);
  for (const [id, val] of rows) {
    const res = await leader.handleRemoteQuery(queryMessage(seedTx, INSERT_SQL, [id, val]));
    assert.equal(res.success, true);
  }
  await commitParticipantTx(leader, proposed, seedTx);
}

function assertPrepareConflict40001(prepAnswer, contextLabel) {
  assert.equal(prepAnswer.success, false, `${contextLabel}: PREPARE must be refused`);
  assert.equal(
    prepAnswer.failureCode,
    PARTICIPANT_TRANSACTION_FAILURE_CODE.PREPARE_REFUSED,
    `${contextLabel}: must return PREPARE_REFUSED`,
  );
  assert.equal(
    prepAnswer.refusalCause,
    PARTICIPANT_TRANSACTION_REFUSAL_CAUSE.CONFLICT,
    `${contextLabel}: refusalCause must be conflict`,
  );
  const projected = projectTransactionParticipantFailure(prepAnswer);
  assert.equal(
    projected.errorCode,
    QUERY_ERROR_CODE.WRITE_CONFLICT,
    `${contextLabel}: must project to WRITE_CONFLICT (SQLSTATE ${PG_WIRE_SQLSTATE.SERIALIZATION_FAILURE})`,
  );
}

test('Review §1 Witness 1: exact 8-step write-skew counterexample rejects T2 at PREPARE (40001) both live and after reconstructing T1 PREPARED state from disk', async () => {
  const {directory, dbPath} = temporaryDbPath();
  let leader1 = null;
  let leader2 = null;
  try {
    const started1 = await startLeader({dbPath});
    leader1 = started1.leader;
    const proposed1 = started1.proposed;
    configureRowKeyLeader(leader1, 3000);

    // Step 1: A=1, B=1 committed at generation 1.
    await seedInitialRows(leader1, proposed1, [['A', '1'], ['B', '1']]);
    assert.equal(generationOf(leader1), 1);

    // Step 2: Holder H stages update on B=1.
    const txH = identityOf('11'.repeat(16), {sessionId: 'sess-holder-h'});
    assert.equal((await send(leader1, beginMessage(txH))).success, true);
    assert.equal(
      (await leader1.handleRemoteQuery(queryMessage(txH, UPDATE_BY_ID_SQL, ['1', 'B']))).success,
      true,
    );

    // Step 3: T1 begins at gen 1, reads A=1, and waits behind H to stage B=0.
    const txT1 = identityOf('12'.repeat(16), {sessionId: 'sess-t1'});
    assert.equal((await send(leader1, beginMessage(txT1))).success, true);
    const t1ReadA = await leader1.handleRemoteQuery(queryMessage(txT1, SELECT_BY_ID_SQL, ['A']));
    assert.equal(t1ReadA.success, true);
    assert.equal(t1ReadA.rows?.[0]?.value, '1');
    const t1Session = findParticipantSession(leader1, txT1);
    assert.equal(t1Session.readScope, PARTICIPANT_READ_DEPENDENCY_SCOPE.KEYS);
    assert.deepEqual([...t1Session.readRowKeys], ['A']);

    const t1StageBPromise = leader1.handleRemoteQuery(
      queryMessage(txT1, UPDATE_BY_ID_SQL, ['0', 'B']),
    );
    await settleTicks(4);

    // Step 4: H commits (generation advances from 1 to 2).
    await commitParticipantTx(leader1, proposed1, txH);
    assert.equal(generationOf(leader1), 2);

    // Step 5: T1 rebases (since A was untouched in generation 2) and stages B=0.
    const t1StageB = await t1StageBPromise;
    assert.equal(t1StageB.success, true);
    assert.equal(t1Session.generationBase, 2);

    // Step 6: T2 begins at generation 2, reads B=1, and stages A=0.
    const txT2 = identityOf('13'.repeat(16), {sessionId: 'sess-t2-live'});
    assert.equal((await send(leader1, beginMessage(txT2))).success, true);
    const t2ReadB = await leader1.handleRemoteQuery(queryMessage(txT2, SELECT_BY_ID_SQL, ['B']));
    assert.equal(t2ReadB.success, true);
    assert.equal(t2ReadB.rows?.[0]?.value, '1');
    assert.equal(
      (await leader1.handleRemoteQuery(queryMessage(txT2, UPDATE_BY_ID_SQL, ['0', 'A']))).success,
      true,
    );

    // Step 7: T1 completes durable PREPARE (pausing after durable PREPARE before COMMIT!).
    const {prepCmd: t1PrepCmd, prepResult: t1PrepResult} =
      await prepareParticipantTx(leader1, proposed1, txT1);
    assert.equal(t1PrepResult.success, true);
    assert.equal(t1PrepResult.state, PARTICIPANT_TRANSACTION_STATE.PREPARED);
    const decodedT1Validation = decodeParticipantValidationText(t1PrepCmd.validationText);
    assert.equal(decodedT1Validation?.readScope, PARTICIPANT_READ_DEPENDENCY_SCOPE.KEYS);
    assert.deepEqual(decodedT1Validation?.readKeys, ['A']);

    // Step 8 (Live): T2 attempts PREPARE at equal generation (gen 2) and is rejected (40001)!
    const t2LivePrep = await send(leader1, prepareMessage(txT2));
    assertPrepareConflict40001(t2LivePrep, 'Step 8 live T2 PREPARE');

    // Step 8b: Simulate restart / leader change by closing SQLite connection, reopening
    // dbPath from disk, wiping all volatile session/history WeakMaps, and reconstructing
    // T1's PREPARED reservation strictly from durable SQLite bytes!
    reopenLeaderSqliteAndReconstructFromDisk(leader1, dbPath);

    // Subcase 8b-i: T2 after disk reconstruction begins at gen 2, reads B=1, stages A=0, and attempts PREPARE:
    const txT2Reopen = identityOf('14'.repeat(16), {sessionId: 'sess-t2-reopen'});
    assert.equal((await send(leader1, beginMessage(txT2Reopen))).success, true);
    assert.equal(
      (await leader1.handleRemoteQuery(queryMessage(txT2Reopen, SELECT_BY_ID_SQL, ['B']))).success,
      true,
    );
    assert.equal(
      (await leader1.handleRemoteQuery(queryMessage(txT2Reopen, UPDATE_BY_ID_SQL, ['0', 'A']))).success,
      true,
    );
    const t2ReopenPrep = await send(leader1, prepareMessage(txT2Reopen));
    assertPrepareConflict40001(t2ReopenPrep, 'Step 8b reopened T2 PREPARE');

    // Subcase 8b-ii: Pure R1 ∩ W2 witness after disk reconstruction — a write-only
    // transaction T2_writeOnlyA (with readScope: 'none', R2 = ∅) stages A=0 at gen 2.
    // Its write set W2={A} is disjoint from T1's write set W1={B}, so it conflicts ONLY
    // with T1's durably reconstructed read dependency R1={A}!
    const txWriteOnlyA = identityOf('15'.repeat(16), {sessionId: 'sess-t2-write-only-a'});
    assert.equal((await send(leader1, beginMessage(txWriteOnlyA))).success, true);
    assert.equal(
      (await leader1.handleRemoteQuery(queryMessage(txWriteOnlyA, UPDATE_BY_ID_SQL, ['0', 'A']))).success,
      true,
    );
    const writeOnlyAPrep = await send(leader1, prepareMessage(txWriteOnlyA));
    assertPrepareConflict40001(writeOnlyAPrep, 'Step 8b-ii pure R1∩W2 after disk reopen');

    // Subcase 8b-iii: Shut down leader1 completely, open a brand-new PartitionService
    // leader2 from dbPath, and verify replicated apply of a pre-sealed PARTICIPANT_PREPARE
    // writing A=0 with readScope='none' at gen 2 is deterministically refused at apply:
    leader1.db.pragma('wal_checkpoint(TRUNCATE)');
    await shutdownAll(leader1);
    leader1 = null;

    const started2 = await startLeader({
      dbPath,
      generationOrigin: false,
      releaseAdmission: false,
    });
    leader2 = started2.leader;
    const proposed2 = started2.proposed;
    configureRowKeyLeader(leader2, 3000);
    discardParticipantSessions(leader2);
    resetParticipantRowKeyHistory(leader2);

    const txDirectApplyA = identityOf('16'.repeat(16), {sessionId: 'sess-t2-direct-apply-a'});
    const directPrepA = prepareCommandOf(
      txDirectApplyA,
      [operationOf({id: 'A', value: '0'}, {sql: UPDATE_BY_ID_SQL, params: ['0', 'A']})],
      generationOf(leader2),
      PARTITION_ID,
      GENERATION_ORIGIN_INDEX,
      {readScope: PARTICIPANT_READ_DEPENDENCY_SCOPE.NONE},
    );
    assert.equal(applyCommitted(leader2, directPrepA), null);
    const directRow = leader2.db
      .prepare('SELECT state, refusal_cause FROM _participant_transactions WHERE participant_id = ?')
      .get(txDirectApplyA.participantId);
    assert.deepEqual(directRow, {
      state: PARTICIPANT_TRANSACTION_STATE.REFUSED,
      refusal_cause: PARTICIPANT_TRANSACTION_REFUSAL_CAUSE.CONFLICT,
    });

    // Complete T1's bound COMMIT decision on reopened leader2 and verify A=1, B=0:
    await commitPreparedParticipantTx(leader2, proposed2, txT1, t1PrepResult.preparedDigest);
    assert.equal(readRowValue(leader2, 'A'), '1');
    assert.equal(readRowValue(leader2, 'B'), '0');
  } finally {
    await shutdownAll(leader1, leader2);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('Review §1 Witness 2: retained concurrency companion allows disjoint read/write transactions and shared read-only overlaps to prepare and commit alongside T1', async () => {
  const {directory, dbPath} = temporaryDbPath();
  let leader = null;
  try {
    const started = await startLeader({dbPath});
    leader = started.leader;
    const proposed = started.proposed;
    configureRowKeyLeader(leader, 3000);

    await seedInitialRows(leader, proposed, [
      ['A', '10'],
      ['B', '20'],
      ['C', '30'],
      ['D', '40'],
    ]);
    const baseGen = generationOf(leader);

    // T1 reads A and stages write on B, then durably prepares:
    const txT1 = identityOf('21'.repeat(16), {sessionId: 'sess-comp-t1'});
    assert.equal((await send(leader, beginMessage(txT1))).success, true);
    assert.equal(
      (await leader.handleRemoteQuery(queryMessage(txT1, SELECT_BY_ID_SQL, ['A']))).success,
      true,
    );
    assert.equal(
      (await leader.handleRemoteQuery(queryMessage(txT1, UPDATE_BY_ID_SQL, ['21', 'B']))).success,
      true,
    );
    const {prepResult: t1Prep} = await prepareParticipantTx(leader, proposed, txT1);
    assert.equal(t1Prep.success, true);

    // T2 at the same generation reads C (and also reads A, exercising allowed R1 ∩ R2 overlap!)
    // and writes D (disjoint from T1's R1={A,C? no, R1={A}} and W1={B}):
    const txT2 = identityOf('22'.repeat(16), {sessionId: 'sess-comp-t2'});
    assert.equal((await send(leader, beginMessage(txT2))).success, true);
    assert.equal(
      (await leader.handleRemoteQuery(queryMessage(txT2, SELECT_BY_ID_SQL, ['C']))).success,
      true,
    );
    assert.equal(
      (await leader.handleRemoteQuery(queryMessage(txT2, SELECT_BY_ID_SQL, ['A']))).success,
      true,
    );
    assert.equal(
      (await leader.handleRemoteQuery(queryMessage(txT2, UPDATE_BY_ID_SQL, ['41', 'D']))).success,
      true,
    );
    assert.equal(generationOf(leader), baseGen);

    // Also open an empty prepared transaction (0 reads, 0 writes) and an empty active session
    // at baseGen to verify they both survive concurrent disjoint generation advances:
    const txEmptyPrepared = identityOf('23'.repeat(16), {sessionId: 'sess-comp-empty-prepared'});
    assert.equal((await send(leader, beginMessage(txEmptyPrepared))).success, true);
    const {prepResult: emptyPrep} = await prepareParticipantTx(leader, proposed, txEmptyPrepared);
    assert.equal(emptyPrep.success, true);

    const txEmptyActive = identityOf('24'.repeat(16), {sessionId: 'sess-comp-empty-active'});
    assert.equal((await send(leader, beginMessage(txEmptyActive))).success, true);

    // T2 prepares and commits cleanly while T1 and txEmptyPrepared remain PREPARED:
    await commitParticipantTx(leader, proposed, txT2);
    assert.equal(generationOf(leader), baseGen + 1);
    assert.equal(readRowValue(leader, 'D'), '41');

    // T1 then commits its PREPARED obligation cleanly across T2's disjoint commit:
    await commitPreparedParticipantTx(leader, proposed, txT1, t1Prep.preparedDigest);
    assert.equal(generationOf(leader), baseGen + 2);
    assert.equal(readRowValue(leader, 'B'), '21');

    // Empty prepared tx (operations=[], readScope='none') commits cleanly after gen advanced baseGen -> baseGen + 2:
    await commitPreparedParticipantTx(leader, proposed, txEmptyPrepared, emptyPrep.preparedDigest);
    assert.equal(generationOf(leader), baseGen + 2);

    // Empty active session (operations=[], readScope='none') rebases cleanly at PREPARE across baseGen -> baseGen + 2 and commits:
    await commitParticipantTx(leader, proposed, txEmptyActive);
    assert.equal(generationOf(leader), baseGen + 2);
  } finally {
    await shutdownAll(leader);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('Review §1 Witness 3: exceeding read key count or UTF-8 byte ceiling widens irreversibly to partition scope, releases individual keys, survives disk reconstruction, blocks concurrent writes, and allows read-only inspection', async () => {
  const {directory, dbPath} = temporaryDbPath();
  let leader1 = null;
  let leader2 = null;
  try {
    const started1 = await startLeader({dbPath});
    leader1 = started1.leader;
    const proposed1 = started1.proposed;
    configureRowKeyLeader(leader1, 3000);

    await seedInitialRows(leader1, proposed1, [
      ['k-0', 'v0'],
      ['k-write', 'vw'],
      ['k-other', 'vo'],
      ['k-inspect', 'vi'],
    ]);

    // 1. Key-count ceiling witness (MAX_KEYS = 256 -> 257th distinct key widens to 'partition'):
    const txKeyOverflow = identityOf('31'.repeat(16), {sessionId: 'sess-key-overflow'});
    assert.equal((await send(leader1, beginMessage(txKeyOverflow))).success, true);
    const keySession = findParticipantSession(leader1, txKeyOverflow);
    assert.equal(keySession.readScope, PARTICIPANT_READ_DEPENDENCY_SCOPE.NONE);
    assert.throws(
      () => keySession.readRowKeys.add('bypass-attempt'),
      /ParticipantReadDependencyAccumulator/u,
      'direct mutation of session.readRowKeys outside accumulator owner must fail',
    );

    for (let i = 0; i < PARTICIPANT_READ_DEPENDENCY_BOUND.MAX_KEYS; i += 1) {
      const readRes = await leader1.handleRemoteQuery(
        queryMessage(txKeyOverflow, SELECT_BY_ID_SQL, [`k-${i}`]),
      );
      assert.equal(readRes.success, true);
    }
    assert.equal(keySession.readScope, PARTICIPANT_READ_DEPENDENCY_SCOPE.KEYS);
    assert.equal(keySession.readKeyCount, PARTICIPANT_READ_DEPENDENCY_BOUND.MAX_KEYS);
    assert.equal(keySession.readRowKeys.size, PARTICIPANT_READ_DEPENDENCY_BOUND.MAX_KEYS);
    assert.equal(keySession.readBytes > 0, true);
    assert.equal(keySession.aggregateFootprintBytes, keySession.bytes + keySession.readBytes);

    // 257th distinct read key widens irreversibly to 'partition' and releases all individual keys:
    const overflowReadRes = await leader1.handleRemoteQuery(
      queryMessage(txKeyOverflow, SELECT_BY_ID_SQL, ['k-256']),
    );
    assert.equal(overflowReadRes.success, true);
    assert.equal(keySession.readScope, PARTICIPANT_READ_DEPENDENCY_SCOPE.PARTITION);
    assert.equal(keySession.hasUnscopedRead, true);
    assert.equal(keySession.readKeyCount, 0, 'individual keys must be released on widening');
    assert.equal(keySession.readRowKeys.size, 0);
    assert.equal(keySession.readBytes, 0, 'read key bytes must be released on widening');

    // Subsequent scoped read cannot narrow 'partition' back to 'keys':
    assert.equal(
      (await leader1.handleRemoteQuery(queryMessage(txKeyOverflow, SELECT_BY_ID_SQL, ['k-0']))).success,
      true,
    );
    assert.equal(keySession.readScope, PARTICIPANT_READ_DEPENDENCY_SCOPE.PARTITION);
    assert.equal(keySession.readKeyCount, 0);

    // 2. Byte-ceiling witness (MAX_BYTES = 65536 -> cumulative UTF-8 bytes > 65536 with few keys):
    const txByteOverflow = identityOf('32'.repeat(16), {sessionId: 'sess-byte-overflow'});
    assert.equal((await send(leader1, beginMessage(txByteOverflow))).success, true);
    const byteSession = findParticipantSession(leader1, txByteOverflow);
    const chunkKeyPrefix = 'utf8-é-'.padEnd(4096, 'x');
    for (let i = 0; i < 15; i += 1) {
      const k = `${chunkKeyPrefix}-${i}`;
      const chunkRead = await leader1.handleRemoteQuery(
        queryMessage(txByteOverflow, SELECT_BY_ID_SQL, [k]),
      );
      assert.equal(chunkRead.success, true);
    }
    assert.equal(byteSession.readScope, PARTICIPANT_READ_DEPENDENCY_SCOPE.KEYS);
    assert.equal(byteSession.readKeyCount, 15);
    assert.equal(byteSession.readBytes <= PARTICIPANT_READ_DEPENDENCY_BOUND.MAX_BYTES, true);

    // 16th ~4KB key pushes cumulative UTF-8 bytes past 65,536 -> widens to 'partition' and clears keys:
    assert.equal(
      (await leader1.handleRemoteQuery(
        queryMessage(txByteOverflow, SELECT_BY_ID_SQL, [`${chunkKeyPrefix}-15`]),
      )).success,
      true,
    );
    assert.equal(byteSession.readScope, PARTICIPANT_READ_DEPENDENCY_SCOPE.PARTITION);
    assert.equal(byteSession.readKeyCount, 0);
    assert.equal(byteSession.readBytes, 0);

    // 3. Stage a write on k-write in txKeyOverflow and durably PREPARE:
    assert.equal(
      (await leader1.handleRemoteQuery(
        queryMessage(txKeyOverflow, UPDATE_BY_ID_SQL, ['vw-updated', 'k-write']),
      )).success,
      true,
    );
    const {prepCmd: widePrepCmd, prepResult: widePrepResult} =
      await prepareParticipantTx(leader1, proposed1, txKeyOverflow);
    assert.equal(widePrepResult.success, true);
    const decodedWide = decodeParticipantValidationText(widePrepCmd.validationText);
    assert.equal(decodedWide?.readScope, PARTICIPANT_READ_DEPENDENCY_SCOPE.PARTITION);
    assert.deepEqual(decodedWide?.readKeys, []);

    // Reopen SQLite from disk and wipe volatile memory to prove 'partition' read reservation
    // survives disk reconstruction:
    reopenLeaderSqliteAndReconstructFromDisk(leader1, dbPath);

    // Any concurrent non-empty write (even on unrelated key 'k-other') is rejected at PREPARE:
    const txConcurrentWriter = identityOf('33'.repeat(16), {sessionId: 'sess-concurrent-writer'});
    assert.equal((await send(leader1, beginMessage(txConcurrentWriter))).success, true);
    assert.equal(
      (await leader1.handleRemoteQuery(
        queryMessage(txConcurrentWriter, UPDATE_BY_ID_SQL, ['vo-blocked', 'k-other']),
      )).success,
      true,
    );
    const writerPrep = await send(leader1, prepareMessage(txConcurrentWriter));
    assertPrepareConflict40001(writerPrep, 'Concurrent non-empty write against widened partition read');

    // Meanwhile, read-only inspection (SELECT on k-inspect and a 0-operation read-only PREPARE/COMMIT) succeeds:
    const txReadOnly = identityOf('34'.repeat(16), {sessionId: 'sess-readonly-inspect'});
    assert.equal((await send(leader1, beginMessage(txReadOnly))).success, true);
    const inspectRead = await leader1.handleRemoteQuery(
      queryMessage(txReadOnly, SELECT_BY_ID_SQL, ['k-inspect']),
    );
    assert.equal(inspectRead.success, true);
    assert.equal(inspectRead.rows?.[0]?.value, 'vi');
    await commitParticipantTx(leader1, proposed1, txReadOnly);

    // Also reopen a fresh PartitionService leader2 from dbPath and verify direct apply refusal + COMMIT:
    leader1.db.pragma('wal_checkpoint(TRUNCATE)');
    await shutdownAll(leader1);
    leader1 = null;

    const started2 = await startLeader({
      dbPath,
      generationOrigin: false,
      releaseAdmission: false,
    });
    leader2 = started2.leader;
    const proposed2 = started2.proposed;
    configureRowKeyLeader(leader2, 3000);
    discardParticipantSessions(leader2);
    resetParticipantRowKeyHistory(leader2);

    const txDirectOther = identityOf('35'.repeat(16), {sessionId: 'sess-direct-other'});
    const directOtherPrep = prepareCommandOf(
      txDirectOther,
      [operationOf({id: 'k-other', value: 'vo-blocked'}, {sql: UPDATE_BY_ID_SQL, params: ['vo-blocked', 'k-other']})],
      generationOf(leader2),
      PARTITION_ID,
      GENERATION_ORIGIN_INDEX,
      {readScope: PARTICIPANT_READ_DEPENDENCY_SCOPE.NONE},
    );
    assert.equal(applyCommitted(leader2, directOtherPrep), null);
    const directOtherRow = leader2.db
      .prepare('SELECT state, refusal_cause FROM _participant_transactions WHERE participant_id = ?')
      .get(txDirectOther.participantId);
    assert.deepEqual(directOtherRow, {
      state: PARTICIPANT_TRANSACTION_STATE.REFUSED,
      refusal_cause: PARTICIPANT_TRANSACTION_REFUSAL_CAUSE.CONFLICT,
    });

    // Settle txKeyOverflow's COMMIT on reopened leader2:
    await commitPreparedParticipantTx(
      leader2,
      proposed2,
      txKeyOverflow,
      widePrepResult.preparedDigest,
    );
    assert.equal(readRowValue(leader2, 'k-write'), 'vw-updated');
  } finally {
    await shutdownAll(leader1, leader2);
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('Review §1 Witness 4: deliberate regression controls catch omitted/malformed durable read scope, equal-generation reservation bypasses, and key-dropping on overflow', async () => {
  const {leader, proposed} = await startLeader();
  try {
    configureRowKeyLeader(leader, 3000);
    await seedInitialRows(leader, proposed, [['k-0', 'v0'], ['k-256', 'v256'], ['k-other', 'vo']]);
    const gen = generationOf(leader);
    const genDigest = sha256(`generation:${gen}`);

    // Control 4A: Omitted, unknown, empty-keys, unsorted, duplicate, or over-budget readScope
    // in validationText (even with recomputed preparedDigest!) must fail closed at decoder,
    // pre-proposal admission, and committed apply:
    const oversizedKeys = Array.from(
      {length: PARTICIPANT_READ_DEPENDENCY_BOUND.MAX_KEYS + 1},
      (_, idx) => `k-${String(idx).padStart(4, '0')}`,
    );
    const oversizedByteKeys = Array.from(
      {length: 17},
      (_, idx) => `kb-${String(idx).padStart(2, '0')}-${'z'.repeat(4000)}`,
    );
    const malformedValidationTexts = [
      // 1. Omitted readScope (legacy 4-element tuple):
      JSON.stringify([[V3.PARTITION_SCOPE, PARTITION_ID, genDigest, GENERATION_ORIGIN_INDEX]]),
      // 2. Unknown readScope:
      JSON.stringify([[V3.PARTITION_SCOPE, PARTITION_ID, genDigest, GENERATION_ORIGIN_INDEX,
        {readScope: 'legacy-empty'}]]),
      // 3. 'keys' with empty readKeys array:
      JSON.stringify([[V3.PARTITION_SCOPE, PARTITION_ID, genDigest, GENERATION_ORIGIN_INDEX,
        {readScope: 'keys', readKeys: []}]]),
      // 4. 'keys' with unsorted readKeys:
      JSON.stringify([[V3.PARTITION_SCOPE, PARTITION_ID, genDigest, GENERATION_ORIGIN_INDEX,
        {readScope: 'keys', readKeys: ['k-b', 'k-a']}]]),
      // 5. 'keys' with duplicate readKeys:
      JSON.stringify([[V3.PARTITION_SCOPE, PARTITION_ID, genDigest, GENERATION_ORIGIN_INDEX,
        {readScope: 'keys', readKeys: ['k-a', 'k-a']}]]),
      // 6. 'keys' exceeding MAX_KEYS (257 keys):
      JSON.stringify([[V3.PARTITION_SCOPE, PARTITION_ID, genDigest, GENERATION_ORIGIN_INDEX,
        {readScope: 'keys', readKeys: oversizedKeys}]]),
      // 7. 'keys' exceeding MAX_BYTES (> 65536 UTF-8 bytes):
      JSON.stringify([[V3.PARTITION_SCOPE, PARTITION_ID, genDigest, GENERATION_ORIGIN_INDEX,
        {readScope: 'keys', readKeys: oversizedByteKeys}]]),
      // 8. 'none' carrying unexpected readKeys field:
      JSON.stringify([[V3.PARTITION_SCOPE, PARTITION_ID, genDigest, GENERATION_ORIGIN_INDEX,
        {readScope: 'none', readKeys: ['k-0']}]]),
    ];

    for (let idx = 0; idx < malformedValidationTexts.length; idx += 1) {
      const badValidationText = malformedValidationTexts[idx];
      assert.equal(
        decodeParticipantValidationText(badValidationText),
        null,
        `malformed validationText #${idx} must fail closed in decoder`,
      );
      const txBad = identityOf((idx + 64).toString(16).padStart(32, '0'), {
        sessionId: `sess-bad-${idx}`,
      });
      const baseCmd = prepareCommandOf(txBad, [operationOf({id: `bad-${idx}`, value: 'v'})], gen);
      const forgedCmd = {
        ...baseCmd,
        validationText: badValidationText,
        preparedDigest: preparedDigestOf(baseCmd.operationsText, badValidationText),
      };
      const admission = admitCommittedCommand(forgedCmd, OWNER_ORIGIN);
      assert.equal(admission.admitted, false, `malformed command #${idx} must be refused at admission`);
      assert.equal(admission.code, PARTICIPANT_TRANSACTION_ADMISSION_CODE.BYTES_INVALID);

      assert.equal(applyCommitted(leader, forgedCmd), null);
      const row = leader.db
        .prepare('SELECT state, refusal_cause FROM _participant_transactions WHERE participant_id = ?')
        .get(txBad.participantId);
      assert.deepEqual(row, {
        state: PARTICIPANT_TRANSACTION_STATE.REFUSED,
        refusal_cause: PARTICIPANT_TRANSACTION_REFUSAL_CAUSE.CONFLICT,
      });
    }

    // Valid companion for Control 4A: canonical 'none', 'keys', and 'partition' all decode cleanly:
    for (const validDep of [
      {readScope: 'none'},
      {readScope: 'keys', readKeys: ['k-0', 'k-256']},
      {readScope: 'partition'},
    ]) {
      const validText = validationTextOf(gen, PARTITION_ID, GENERATION_ORIGIN_INDEX, validDep);
      const decoded = decodeParticipantValidationText(validText);
      assert.equal(decoded?.readScope, validDep.readScope);
    }

    // Control 4B: Canonical conflict predicate (W1∩W2) ∨ (W1∩R2) ∨ (R1∩W2) truth table:
    assert.equal(
      doTransactionFootprintsConflict(
        {rowKeys: new Set(['B']), readScope: 'keys', readKeys: new Set(['A'])},
        {rowKeys: new Set(['A']), readScope: 'none'},
      ),
      true,
      'R1 ∩ W2 overlap alone must conflict',
    );
    assert.equal(
      doTransactionFootprintsConflict(
        {rowKeys: new Set(['B']), readScope: 'none'},
        {rowKeys: new Set(['A']), readScope: 'keys', readKeys: new Set(['B'])},
      ),
      true,
      'W1 ∩ R2 overlap alone must conflict',
    );
    assert.equal(
      doTransactionFootprintsConflict(
        {rowKeys: new Set(['B']), readScope: 'keys', readKeys: new Set(['A'])},
        {rowKeys: new Set(['C']), readScope: 'keys', readKeys: new Set(['A'])},
      ),
      false,
      'R1 ∩ R2 read-only overlap with disjoint writes must NOT conflict',
    );

    // Control 4C: Overflowing read keys must widen to 'partition' rather than dropping either
    // the 257th overflow key ('k-256') or the first key ('k-0'):
    const txOverflowReader = identityOf('91'.repeat(16), {sessionId: 'sess-ctrl-overflow-r'});
    const txCommitterOnOverflowKey = identityOf('92'.repeat(16), {sessionId: 'sess-ctrl-overflow-w'});
    assert.equal((await send(leader, beginMessage(txOverflowReader))).success, true);
    assert.equal((await send(leader, beginMessage(txCommitterOnOverflowKey))).success, true);
    for (let i = 0; i <= PARTICIPANT_READ_DEPENDENCY_BOUND.MAX_KEYS; i += 1) {
      assert.equal(
        (await leader.handleRemoteQuery(
          queryMessage(txOverflowReader, SELECT_BY_ID_SQL, [`k-${i}`]),
        )).success,
        true,
      );
    }
    // Stage before the concurrent commit so PREPARE owns the first stale-read check.
    assert.equal(
      (await leader.handleRemoteQuery(
        queryMessage(txOverflowReader, UPDATE_BY_ID_SQL, ['vo-mod', 'k-other']),
      )).success,
      true,
    );
    // Concurrent transaction modifies the 257th key ('k-256') and commits:
    assert.equal(
      (await leader.handleRemoteQuery(
        queryMessage(txCommitterOnOverflowKey, UPDATE_BY_ID_SQL, ['v256-mod', 'k-256']),
      )).success,
      true,
    );
    await commitParticipantTx(leader, proposed, txCommitterOnOverflowKey);

    const overflowReaderPrep = await send(leader, prepareMessage(txOverflowReader));
    assertPrepareConflict40001(
      overflowReaderPrep,
      'Control 4C: modification of 257th overflow key must reject PREPARE',
    );

    // Also verify select * (unscoped scan) widens and rejects advancing across any commit:
    const txScanReader = identityOf('93'.repeat(16), {sessionId: 'sess-ctrl-scan-r'});
    const txScanWriter = identityOf('94'.repeat(16), {sessionId: 'sess-ctrl-scan-w'});
    assert.equal((await send(leader, beginMessage(txScanReader))).success, true);
    assert.equal((await send(leader, beginMessage(txScanWriter))).success, true);
    assert.equal(
      (await leader.handleRemoteQuery(queryMessage(txScanReader, SELECT_ALL_SQL, []))).success,
      true,
    );
    assert.equal(
      (await leader.handleRemoteQuery(
        queryMessage(txScanReader, UPDATE_BY_ID_SQL, ['vo-mod2', 'k-other']),
      )).success,
      true,
    );
    assert.equal(
      (await leader.handleRemoteQuery(
        queryMessage(txScanWriter, UPDATE_BY_ID_SQL, ['v0-mod', 'k-0']),
      )).success,
      true,
    );
    await commitParticipantTx(leader, proposed, txScanWriter);
    const scanPrep = await send(leader, prepareMessage(txScanReader));
    assertPrepareConflict40001(scanPrep, 'Control 4C: unscoped SELECT * must reject PREPARE');
  } finally {
    await shutdownAll(leader);
  }
});

test('Review §5 Witness 5: footprint plan cache reuse, incremental staged byte accounting, and direct execution of disjoint reads when operations are already staged', async () => {
  const {leader, proposed} = await startLeader();
  try {
    configureRowKeyLeader(leader, 3000);
    await seedInitialRows(leader, proposed, [
      ['item-1', '100'],
      ['item-2', '200'],
      ['item-3', '300'],
    ]);

    const tx = identityOf('a5'.repeat(16), {sessionId: 'sess-s5'});
    assert.equal((await send(leader, beginMessage(tx))).success, true);
    const session = findParticipantSession(leader, tx);

    // 1. Cached immutable footprint plan reuse across reads and writes:
    const cachedAst = getOrParseCachedStatementFootprintAst(SELECT_BY_ID_SQL);
    assert.equal(Object.isFrozen(cachedAst), true, 'cached footprint AST must be deeply frozen');
    const cacheBefore = getFootprintPlanCacheStats();

    // Empty read on item-1:
    const read1 = await leader.handleRemoteQuery(
      queryMessage(tx, SELECT_BY_ID_SQL, ['item-1']),
    );
    assert.equal(read1.success, true);
    assert.equal(read1.rows?.[0]?.value, '100');

    // Stage write on item-1:
    assert.equal(
      (await leader.handleRemoteQuery(
        queryMessage(tx, UPDATE_BY_ID_SQL, ['101', 'item-1']),
      )).success,
      true,
    );
    assert.equal(session.operations.length, 1);
    assert.equal(session.encodedOperations.length, 1);
    assert.equal(
      session.bytes,
      Buffer.byteLength(JSON.stringify(session.operations), 'utf8'),
      'incremental byte total must equal full JSON.stringify byte length after 1st write',
    );

    // 2. Disjoint read on item-2 while session.operations.length > 0:
    // (W_staged = {'item-1'} ∩ R_query = {'item-2'}) = ∅ -> executes directly without replay!
    const statsBeforeDisjointRead = getStagingReplayStats(leader);
    const read2 = await leader.handleRemoteQuery(
      queryMessage(tx, SELECT_BY_ID_SQL, ['item-2']),
    );
    assert.equal(read2.success, true);
    assert.equal(read2.rows?.[0]?.value, '200');
    const statsAfterDisjointRead = getStagingReplayStats(leader);
    assert.equal(
      statsAfterDisjointRead.disjointDirectReads,
      statsBeforeDisjointRead.disjointDirectReads + 1,
      'disjoint read with staged writes must execute directly',
    );
    assert.equal(
      statsAfterDisjointRead.fastReplayedOperations,
      statsBeforeDisjointRead.fastReplayedOperations,
      'disjoint read must NOT replay staged writes',
    );
    assert.deepEqual([...session.readRowKeys].sort(), ['item-1', 'item-2']);

    // 3. Stage write on item-2 and verify incremental byte accounting + failed-write non-mutation:
    assert.equal(
      (await leader.handleRemoteQuery(
        queryMessage(tx, UPDATE_BY_ID_SQL, ['202', 'item-2']),
      )).success,
      true,
    );
    assert.equal(session.operations.length, 2);
    assert.equal(session.encodedOperations.length, 2);
    const bytesAfterTwoWrites = session.bytes;
    assert.equal(
      bytesAfterTwoWrites,
      Buffer.byteLength(JSON.stringify(session.operations), 'utf8'),
      'incremental byte total must equal full JSON.stringify byte length after 2nd write',
    );

    // A failing write (duplicate primary key insert) must NOT append to operations/encodedOperations or change bytes:
    const dupInsert = await leader.handleRemoteQuery(
      queryMessage(tx, INSERT_SQL, ['item-1', 'dup']),
    );
    assert.equal(dupInsert.success, false);
    assert.equal(session.operations.length, 2);
    assert.equal(session.encodedOperations.length, 2);
    assert.equal(session.bytes, bytesAfterTwoWrites);

    // 4. Read of own write on item-1 (W_staged ∩ R_query = {'item-1'} ≠ ∅) MUST replay
    // staged operations and return '101':
    const statsBeforeOwnRead = getStagingReplayStats(leader);
    const readOwn1 = await leader.handleRemoteQuery(
      queryMessage(tx, SELECT_BY_ID_SQL, ['item-1']),
    );
    assert.equal(readOwn1.success, true);
    assert.equal(readOwn1.rows?.[0]?.value, '101', 'read of own staged write must replay and see 101');
    const statsAfterOwnRead = getStagingReplayStats(leader);
    assert.equal(
      statsAfterOwnRead.disjointDirectReads,
      statsBeforeOwnRead.disjointDirectReads,
      'overlapping read of own write must not take disjoint direct shortcut',
    );
    assert.equal(
      statsAfterOwnRead.fastReplayedOperations,
      statsBeforeOwnRead.fastReplayedOperations + 2,
      'overlapping read of own write must replay the 2 staged writes',
    );

    const cacheAfter = getFootprintPlanCacheStats();
    assert.equal(
      cacheAfter.hitCount >= cacheBefore.hitCount + 4,
      true,
      'repeated parameterized SELECT and UPDATE must reuse cached footprint plans',
    );

    // 5. PREPARE assembles operationsText from encodedOperations and commits cleanly:
    const {prepCmd} = await commitParticipantTx(leader, proposed, tx);
    assert.equal(prepCmd.operationsText, JSON.stringify(session.operations));
    assert.equal(readRowValue(leader, 'item-1'), '101');
    assert.equal(readRowValue(leader, 'item-2'), '202');
  } finally {
    await shutdownAll(leader);
  }
});

test('Finding 4 (P2): footprint AST cache admission policy enforces 4096-byte SQL ceiling and 262144-byte aggregate retained-byte budget', async () => {
  const {leader, proposed} = await startLeader();
  try {
    configureRowKeyLeader(leader, 3000);
    await seedInitialRows(leader, proposed, [
      ['item-a', 'va'],
      ['item-b', 'vb'],
    ]);

    clearFootprintAstCache();
    const initialStats = getFootprintAstCacheStats();
    assert.equal(initialStats.size, 0);
    assert.equal(initialStats.retainedBytes, 0);
    assert.equal(initialStats.maxEntries, 256);
    assert.equal(initialStats.maxSqlBytes, 4096);
    assert.equal(initialStats.maxRetainedBytes, 262144);

    // 1. Statements > 4,096 UTF-8 bytes parse and execute accurately without entering cache:
    const txOversized = identityOf('b4'.repeat(16), {sessionId: 'sess-f4-oversized'});
    assert.equal((await send(leader, beginMessage(txOversized))).success, true);
    const oversizedSession = findParticipantSession(leader, txOversized);
    const pad5k = 'x'.repeat(4200);
    const oversizedSelectSql =
      `SELECT id, value, '${pad5k}' AS filler FROM ${TABLE} WHERE id = ?`;
    const oversizedUpdateSql =
      `UPDATE ${TABLE} SET value = CASE WHEN '${pad5k}' = '${pad5k}' THEN ? ELSE value END WHERE id = ?`;
    assert.equal(Buffer.byteLength(oversizedSelectSql, 'utf8') > 4096, true);
    assert.equal(Buffer.byteLength(oversizedUpdateSql, 'utf8') > 4096, true);

    const oversizedRead = await leader.handleRemoteQuery(
      queryMessage(txOversized, oversizedSelectSql, ['item-a']),
    );
    assert.equal(oversizedRead.success, true);
    assert.equal(oversizedRead.rows?.[0]?.value, 'va');
    assert.deepEqual([...oversizedSession.readRowKeys], ['item-a']);

    const statsAfterOversizedRead = getFootprintAstCacheStats();
    assert.equal(statsAfterOversizedRead.size, 0, 'oversized SELECT must not enter footprint AST cache');
    assert.equal(
      statsAfterOversizedRead.retainedBytes,
      0,
      'oversized SELECT must not increase retainedBytes',
    );

    const oversizedWrite = await leader.handleRemoteQuery(
      queryMessage(txOversized, oversizedUpdateSql, ['va-5k', 'item-a']),
    );
    assert.equal(oversizedWrite.success, true);
    assert.deepEqual([...oversizedSession.touchedRowKeys], ['item-a']);

    const statsAfterOversizedWrite = getFootprintAstCacheStats();
    assert.equal(statsAfterOversizedWrite.size, 0, 'oversized UPDATE must not enter footprint AST cache');
    assert.equal(
      statsAfterOversizedWrite.retainedBytes,
      0,
      'oversized UPDATE must not increase retainedBytes',
    );
    await commitParticipantTx(leader, proposed, txOversized);
    assert.equal(readRowValue(leader, 'item-a'), 'va-5k');

    // 2. Many distinct 3–3.8 KiB statements (<= 4096 bytes each) evict oldest entries
    // when aggregate retainedBytes would exceed 262,144 bytes (even with size < 256):
    clearFootprintAstCache();
    let expectedTotalInsertedBytes = 0;
    const insertedSqlList = [];
    for (let idx = 0; idx < 96; idx += 1) {
      const filler = `tag_${String(idx).padStart(3, '0')}_${'z'.repeat(3400)}`;
      const sql = `SELECT id, value, '${filler}' AS tag FROM ${TABLE} WHERE id = ?`;
      const sqlBytes = Buffer.byteLength(sql, 'utf8');
      assert.equal(sqlBytes >= 2048 && sqlBytes <= 4096, true);
      expectedTotalInsertedBytes += sqlBytes;
      insertedSqlList.push({sql, sqlBytes});
      const ast = getOrParseCachedStatementFootprintAst(sql);
      assert.notEqual(ast, null);
      const stats = getFootprintAstCacheStats();
      assert.equal(
        stats.retainedBytes <= 262144,
        true,
        `retainedBytes (${stats.retainedBytes}) must never exceed 262144 at step ${idx}`,
      );
      assert.equal(
        stats.size <= 256,
        true,
        `size (${stats.size}) must never exceed 256 at step ${idx}`,
      );
    }

    assert.equal(expectedTotalInsertedBytes > 262144, true);
    const finalStats = getFootprintAstCacheStats();
    assert.equal(finalStats.retainedBytes <= 262144, true);
    assert.equal(finalStats.size < 96, true, 'byte budget must evict oldest entries before 256 entry cap');

    // Re-lookup of the most recently inserted statement hits cache without changing retainedBytes:
    const recentSql = insertedSqlList[insertedSqlList.length - 1].sql;
    getOrParseCachedStatementFootprintAst(recentSql);
    const afterRecentHit = getFootprintAstCacheStats();
    assert.equal(afterRecentHit.hitCount, finalStats.hitCount + 1);
    assert.equal(afterRecentHit.retainedBytes, finalStats.retainedBytes);

    clearFootprintAstCache();
    assert.equal(getFootprintAstCacheStats().size, 0);
    assert.equal(getFootprintAstCacheStats().retainedBytes, 0);
  } finally {
    await shutdownAll(leader);
  }
});

test('Opportunity 2: read-dependency snapshots are built lazily on demand at PREPARE and cached by revision across duplicate reads', async () => {
  const {leader, proposed} = await startLeader();
  try {
    configureRowKeyLeader(leader, 3000);
    await seedInitialRows(leader, proposed, [
      ['rk-1', '10'],
      ['rk-2', '20'],
      ['rk-3', '30'],
    ]);

    const tx = identityOf('b6'.repeat(16), {sessionId: 'sess-opp2-lazy'});
    assert.equal((await send(leader, beginMessage(tx))).success, true);
    const session = findParticipantSession(leader, tx);
    const accumulator = session.readDependencies;

    assert.equal(accumulator.revision, 0);
    assert.equal(accumulator.cachedSnapshot, null);
    assert.equal(accumulator.snapshotBuildCount, 0);

    // 1. First scoped read on rk-1 updates mutable state and bumps revision to 1 without building a snapshot:
    assert.equal(
      (await leader.handleRemoteQuery(queryMessage(tx, SELECT_BY_ID_SQL, ['rk-1']))).success,
      true,
    );
    assert.equal(accumulator.revision, 1);
    assert.equal(accumulator.cachedSnapshot, null, 'recordReadFootprint must not allocate intermediate snapshot');
    assert.equal(accumulator.snapshotBuildCount, 0);

    // 2. Duplicate read on rk-1 does NOT bump revision and does NOT allocate a snapshot:
    assert.equal(
      (await leader.handleRemoteQuery(queryMessage(tx, SELECT_BY_ID_SQL, ['rk-1']))).success,
      true,
    );
    assert.equal(accumulator.revision, 1, 'duplicate key read must not advance revision');
    assert.equal(accumulator.cachedSnapshot, null);
    assert.equal(accumulator.snapshotBuildCount, 0);

    // 3. Second distinct read on rk-2 advances revision to 2, still with 0 snapshots built:
    assert.equal(
      (await leader.handleRemoteQuery(queryMessage(tx, SELECT_BY_ID_SQL, ['rk-2']))).success,
      true,
    );
    assert.equal(accumulator.revision, 2);
    assert.equal(accumulator.cachedSnapshot, null);
    assert.equal(accumulator.snapshotBuildCount, 0);

    // 4. First on-demand getSnapshot() builds and freezes the snapshot once for revision 2:
    const snap1 = accumulator.getSnapshot();
    assert.equal(accumulator.snapshotBuildCount, 1);
    assert.equal(accumulator.cachedSnapshotRevision, 2);
    assert.equal(Object.isFrozen(snap1), true);
    assert.equal(Object.isFrozen(snap1.readKeys), true);
    assert.equal(Object.isFrozen(snap1.readKeysSet), true);
    assert.deepEqual(snap1.readKeys, ['rk-1', 'rk-2']);

    // Consecutive getSnapshot() / getSessionReadDependencySnapshot() calls at the same revision
    // (even after another duplicate read on rk-2!) return the exact same frozen reference (===):
    assert.equal(
      (await leader.handleRemoteQuery(queryMessage(tx, SELECT_BY_ID_SQL, ['rk-2']))).success,
      true,
    );
    const snap2 = accumulator.getSnapshot();
    const snap3 = getSessionReadDependencySnapshot(session);
    assert.equal(snap2, snap1);
    assert.equal(snap3, snap1);
    assert.equal(snap2.readKeys, snap1.readKeys);
    assert.equal(snap2.readKeysSet, snap1.readKeysSet);
    assert.equal(accumulator.snapshotBuildCount, 1);

    // 5. PREPARE consumes the snapshot and commits cleanly:
    assert.equal(
      (await leader.handleRemoteQuery(queryMessage(tx, UPDATE_BY_ID_SQL, ['31', 'rk-3']))).success,
      true,
    );
    await commitParticipantTx(leader, proposed, tx);
    assert.equal(accumulator.snapshotBuildCount, 1, 'PREPARE reuses cached snapshot when revision is unchanged');
    assert.equal(readRowValue(leader, 'rk-3'), '31');
  } finally {
    await shutdownAll(leader);
  }
});
