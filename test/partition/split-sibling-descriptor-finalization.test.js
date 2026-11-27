import assert from 'node:assert/strict';
import {test} from 'node:test';
import {INITIAL_PARTITION_IDS, PARTITIONS_SCHEMA, SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schemas-constants.js';
import {PARTITION_TRANSITION_STATE} from '../../src/partition/partition-constants.js';
import {ManagedMergeWorkflowExecutionGateMethods} from '../../src/partition/managed-merge-workflow-execution-gate-methods.js';
import {ManagedMergeWorkflowPersistenceMethods} from '../../src/partition/managed-merge-workflow-persistence-methods.js';
import {ManagedSplitWorkflowExecutionGateMethods} from '../../src/partition/managed-split-workflow-execution-gate-methods.js';
import {submitSplitSiblingDescriptor} from '../../src/partition/managed-split-sibling-descriptor.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {readCommittedStatementOutcome} from '../../src/partition/partition-committed-statement-outcome.js';
import {readPartitionWriteGeneration} from '../../src/partition/partition-participant-transaction-store.js';
import {SIBLING_DESCRIPTOR_ACTION as ACTION, siblingDescriptorStatement} from '../../src/partition/partition-sibling-descriptor-effect.js';
import {deriveParticipantEntryId, SPLIT_DESCRIPTOR_ERROR, splitDescriptorWriteKey} from '../../src/partition/partition-split-descriptor-command.js';
import {buildPartitionWriteEntry} from '../../src/partition/partition-write-kernel.js';
import {selectRows, withSurface} from '../query/unknown-outcome-surface-fixture.js';
import {applyCommitted, clearFixtureSingletons, resetFixtureSingletons,
  shutdownAll, startLeader} from '../test-helpers/participant-transaction-fixture.js';

const TABLE = SYSTEM_TABLE_NAME.PARTITIONS;
const DESTINATION = INITIAL_PARTITION_IDS[TABLE];
const tableId = 'tbl-invoices';
const workflowId = 'split-invoices';
const workflowAttempt = 7;
const sibling = Object.freeze({partitionId: 'invoices-sibling', priorAttempt: 0, priorVersion: 1, targetVersion: 2});
const seed = Object.freeze({partition_id: sibling.partitionId, table_id: tableId, table_name: 'invoices',
  partition_version: sibling.priorVersion, split_descriptor_attempt: sibling.priorAttempt,
  replica_count: 3, size_bytes: 0, state: 'NORMAL', created_at: 1, updated_at: 1});
const workflow = (status) => ({tableId, workflowId, status, metadata: {
  workflowId, workflowAttempt, sourcePartitionId: 'invoices-source', targetPartitionIds: ['invoices-left', 'invoices-right'],
  targetPartitionVersion: sibling.targetVersion, splitDescriptorBaseVersion: sibling.priorVersion,
  splitIssuedSiblings: [sibling],
}});
const intent = (action) => ({action, tableId, workflowId, workflowAttempt, ...sibling});

test('a restored sibling keeps a later MERGE epoch on redelivery of the old committed restore',
  {timeout: 120000}, async () => withSurface([TABLE], async ({of, gateway, deliveries}) => {
    const {dbPath} = of(TABLE);
    const row = () => selectRows(dbPath, 'SELECT * FROM partitions WHERE partition_id = ?', [sibling.partitionId])[0];
    assert.equal((await gateway.insertSystemTableRow(TABLE, seed)).success, true);
    const owner = {getControlPlaneSystemTableGateway: () => gateway,
      buildManagedSplitMutationOptions: ManagedSplitWorkflowExecutionGateMethods.prototype.buildManagedSplitMutationOptions};
    const running = workflow(PARTITION_TRANSITION_STATE.SPLIT_CATCHUP);
    const failed = workflow(PARTITION_TRANSITION_STATE.FAILED);
    const beforeSubmission = deliveries.length;
    const extra = {...sibling, workflowId: 'foreign-workflow'};
    const another = {...sibling, partitionId: 'invoices-other-sibling'};
    const withIssued = (subjects) => ({...running, metadata: {...running.metadata, splitIssuedSiblings: subjects}});
    for (const [record, offered] of [
      [running, extra], [withIssued([extra]), sibling], [withIssued([sibling, sibling]), sibling],
      [withIssued([sibling, another, another]), sibling], [running, {...sibling, priorAttempt: 1}],
    ]) {
      await assert.rejects(submitSplitSiblingDescriptor(owner, record, offered, ACTION.PROMOTE),
        {code: 'split_sibling_plan_mismatch'});
    }
    assert.equal(deliveries.length, beforeSubmission);
    const promote = await submitSplitSiblingDescriptor(owner, running, sibling, ACTION.PROMOTE);
    assert.deepEqual(promote.splitDescriptorReceipt, {...intent(ACTION.PROMOTE), disposition: 'promoted'});
    assert.equal(row().partition_version, sibling.targetVersion);
    assert.equal(row().split_descriptor_attempt, workflowAttempt);
    const restore = await submitSplitSiblingDescriptor(owner, failed, sibling, ACTION.FINALIZE);
    assert.deepEqual(restore.splitDescriptorReceipt, {...intent(ACTION.FINALIZE), disposition: 'restored'});
    assert.equal(row().partition_version, sibling.priorVersion);
    assert.equal(row().split_descriptor_attempt, workflowAttempt);
    // Use the actual MERGE carry-forward writer. Its update recreates the
    // complete SQL predicate of the delayed restore, including A's tag.
    await ManagedMergeWorkflowPersistenceMethods.prototype.promoteSiblingPartitionVersion.call({
      getControlPlaneSystemTableGateway: () => gateway, now: () => 1234, logger: {info() {}},
      buildManagedMergeMutationOptions: ManagedMergeWorkflowExecutionGateMethods.prototype.buildManagedMergeMutationOptions,
    }, sibling.partitionId, sibling.targetVersion);
    const newer = row();
    assert.equal(newer.partition_version, sibling.targetVersion);
    assert.equal(newer.split_descriptor_attempt, workflowAttempt);
    assert.equal(newer.updated_at, 1234);
    const replay = await submitSplitSiblingDescriptor(owner, failed, sibling, ACTION.FINALIZE);
    assert.deepEqual(replay.splitDescriptorReceipt, restore.splitDescriptorReceipt);
    assert.equal(replay.logIndex, restore.logIndex);
    assert.equal(replay.term, restore.term);
    assert.deepEqual(row(), newer);
    const finalizeId = deriveParticipantEntryId(splitDescriptorWriteKey(intent(ACTION.FINALIZE)), DESTINATION);
    assert.equal(deliveries.filter((request) => request.entryId === finalizeId).length, 2);
  }, {cdc: true}));

function committedSiblingFixture(leader) {
  const entry = (operation) => buildPartitionWriteEntry({type: 'QUERY', ...operation}, {
    proposedBy: leader.replicaId, proposedAt: 1, timestamp: leader.hlcClock.now().toString(),
  });
  const command = (action, preimage = {}) => {
    const subject = {...intent(action), ...preimage};
    const key = splitDescriptorWriteKey(subject);
    return entry({...siblingDescriptorStatement(subject), splitDescriptorIntent: subject,
      idempotencyKey: key, entryId: deriveParticipantEntryId(key, DESTINATION)});
  };
  const apply = (op) => assert.equal(applyCommitted(leader, op), null);
  // Observe the actual post-commit answer even for a delayed command whose
  // original client is gone. Preserve the real pending-write owner.
  const applyRefused = (op, code) => {
    const resolve = leader.resolveCommittedWrite;
    const answers = [];
    leader.resolveCommittedWrite = function(...args) {
      const [entryId, answer] = args;
      if (entryId === op.entryId) answers.push(answer);
      return resolve.apply(this, args);
    };
    try {
      apply(op);
    } finally {
      leader.resolveCommittedWrite = resolve;
    }
    assert.equal(answers.length, 1);
    assert.equal(answers[0].success, false);
    assert.equal(answers[0].failureCode, code);
  };
  const record = (op) => readCommittedStatementOutcome(leader, leader.getCommittedEntryKey(op));
  const row = () => leader.db.prepare('SELECT * FROM partitions WHERE partition_id = ?').get(sibling.partitionId);
  const effects = () => {
    const {owed, delivered} = countCdcObligations(leader.db);
    return {events: owed + delivered, generation: readPartitionWriteGeneration(leader.db)};
  };
  return {entry, command, apply, applyRefused, record, row, effects};
}

async function withControlledDestination(body) {
  resetFixtureSingletons();
  try {
    const {leader} = await startLeader({tableName: TABLE, schema: PARTITIONS_SCHEMA}, DESTINATION);
    try {
      await body(committedSiblingFixture(leader));
    } finally {
      await shutdownAll(leader);
    }
  } finally {
    clearFixtureSingletons();
  }
}

test('first application of a delayed promotion cannot revive a finalized attempt on a same-ID replacement',
  () => withControlledDestination(async ({entry, command, apply, applyRefused, record, row, effects}) => {
    const seedRow = (entryId, created) => apply(entry({entryId,
      sql: 'INSERT INTO partitions (partition_id, table_id, partition_version, split_descriptor_attempt, ' +
        'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      params: [sibling.partitionId, tableId, sibling.priorVersion, sibling.priorAttempt, created, created]}));
    seedRow('first-descriptor', 1);
    // The original packet exists, but has not reached this Raft log.
    const delayed = command(ACTION.PROMOTE);
    const final = command(ACTION.FINALIZE);
    assert.equal(record(delayed).state, 'unsettled');
    const before = effects();
    apply(final);
    const retained = record(final);
    assert.equal(retained.changes, 0);
    assert.deepEqual(JSON.parse(retained.ownerResultText), {...intent(ACTION.FINALIZE), disposition: 'cancelled'});
    assert.deepEqual(effects(), before);
    apply(entry({entryId: 'retire-original', sql: 'DELETE FROM partitions WHERE partition_id = ?',
      params: [sibling.partitionId]}));
    seedRow('reused-descriptor', 91);
    const replacement = row();
    assert.equal(replacement.created_at, 91);
    assert.equal(replacement.split_descriptor_attempt, sibling.priorAttempt);
    assert.equal(replacement.partition_version, sibling.priorVersion);
    const afterReplacement = effects();
    assert.equal(record(delayed).state, 'unsettled');
    applyRefused(delayed, SPLIT_DESCRIPTOR_ERROR.FINALIZED);
    apply(final);
    assert.deepEqual(row(), replacement);
    assert.deepEqual(effects(), afterReplacement);
    assert.deepEqual(record(final), retained);
  }));

test('finalize cannot restore an apparent matching attempt without the committed promotion',
  () => withControlledDestination(async ({entry, command, apply, applyRefused, record, row, effects}) => {
    apply(entry({entryId: 'unrelated-row', sql: 'INSERT INTO partitions ' +
      '(partition_id, table_id, partition_version, split_descriptor_attempt, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?)', params: [sibling.partitionId, tableId, sibling.targetVersion, workflowAttempt, 4, 4]}));
    const final = command(ACTION.FINALIZE);
    const forward = command(ACTION.PROMOTE);
    const other = row();
    const before = effects();
    assert.equal(record(forward).state, 'unsettled');
    applyRefused(final, SPLIT_DESCRIPTOR_ERROR.UNRESOLVED);
    assert.equal(record(final).state, 'unsettled');
    assert.deepEqual(row(), other);
    assert.deepEqual(effects(), before);
    // After a positively newer attempt takes the descriptor, the old
    // finalizer can settle supersession without writing the newer row.
    apply(entry({entryId: 'new-owner', sql: 'UPDATE partitions SET split_descriptor_attempt = ? ' +
      'WHERE partition_id = ?', params: [30, sibling.partitionId]}));
    const successor = row();
    assert.equal(successor.split_descriptor_attempt, 30);
    const afterTakeover = effects();
    apply(final);
    const retained = record(final);
    assert.deepEqual(JSON.parse(retained.ownerResultText), {...intent(ACTION.FINALIZE), disposition: 'superseded'});
    assert.equal(retained.changes, 0);
    assert.deepEqual(row(), successor);
    assert.deepEqual(effects(), afterTakeover);
  }));

test('the original plan binds both stage keys even when a changed preimage renders identical restore SQL',
  () => withControlledDestination(async ({entry, command, apply, applyRefused, record, row, effects}) => {
    apply(entry({entryId: 'original-sibling', sql: 'INSERT INTO partitions ' +
      '(partition_id, table_id, partition_version, split_descriptor_attempt, created_at, updated_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?)', params: [sibling.partitionId, tableId, sibling.priorVersion, sibling.priorAttempt, 1, 1]}));
    const forward = command(ACTION.PROMOTE);
    const final = command(ACTION.FINALIZE);
    const divergent = command(ACTION.FINALIZE, {priorAttempt: 1});
    assert.equal(divergent.entryId, final.entryId);
    assert.equal(divergent.sql, final.sql);
    assert.deepEqual(divergent.params, final.params);
    apply(forward);
    assert.equal(record(forward).changes, 1);
    const promoted = row();
    assert.equal(promoted.partition_version, sibling.targetVersion);
    const before = effects();
    // No self result exists yet. The positive promotion belongs to the
    // original plan and cannot authorize a different plan's restore.
    applyRefused(divergent, SPLIT_DESCRIPTOR_ERROR.COLLISION);
    assert.equal(record(final).state, 'unsettled');
    assert.deepEqual(row(), promoted);
    assert.deepEqual(effects(), before);
    apply(final);
    const proof = record(final);
    assert.deepEqual(JSON.parse(proof.ownerResultText), {...intent(ACTION.FINALIZE), disposition: 'restored'});
    const restored = row();
    assert.equal(restored.partition_version, sibling.priorVersion);
    const after = effects();
    applyRefused(divergent, SPLIT_DESCRIPTOR_ERROR.COLLISION);
    assert.deepEqual(record(final), proof);
    assert.deepEqual(row(), restored);
    assert.deepEqual(effects(), after);
  }));
