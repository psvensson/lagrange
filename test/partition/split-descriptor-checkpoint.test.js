import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {PARTITIONS_SCHEMA, getInitialPartitionId} from '../../src/bootstrap/system-table-schemas-constants.js';
import {seedTableRow} from '../../src/bootstrap/seed-foundation-rows.js';
import {generateCreateIndexSQL, generateCreateTableSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {attachSnapshotCatchupDispatcher} from '../../src/bootstrap/shared/snapshot-catchup-wiring.js';
import {bulkConnectionTransferSocket} from '../../src/raft/bulk-connection-transfer-socket.js';
import {buildSnapshotCatchupIdentityFromCache} from '../../src/raft/snapshot-catchup.js';
import {buildSnapshotCatchupDecision, RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME,
  RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME} from '../../src/raft/snapshot-catchup-constants.js';
import {RAFT_CHECKPOINT_VALIDATION_OUTCOME} from '../../src/raft/snapshot-checkpoint-constants.js';
import {listCheckpointGenerations, readCheckpoint} from '../../src/raft/snapshot-checkpoint-store.js';
import {receiveSnapshotTransfer} from '../../src/raft/snapshot-transfer.js';
import {RAFT_SNAPSHOT_TRANSFER_OUTCOME} from '../../src/raft/snapshot-transfer-constants.js';
import {createBulkTransferChannelRegistry} from '../../src/transport/bulk-transfer-channel.js';
import {createInProcWebSocketPair} from '../../src/transport/inproc-transport.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {ENTITY_TYPE} from '../../src/constants/addresses.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {committedStatementEntryKey, createCommittedStatementOutcomeTable} from '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITIONS_SCHEMA_UNSUPPORTED, createPartitionServiceTable} from '../../src/partition/partition-service-table-bootstrap.js';
import {buildReplacementServiceOptions} from '../../src/partition/partition-reopen-options.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {BOOTSTRAP_MEMBERSHIP_SOURCE, COMMITTED_MEMBERSHIP_READ_PURPOSE} from '../../src/raft/raft-committed-membership-constants.js';
import {committedStampOfAnswer} from '../../src/raft/raft-committed-membership-stamp.js';
import {readRaftRsPeerIdentityReservations} from '../../src/raft/raft-rs-peer-identity.js';
import {PARTITION_COMMITTED_STATEMENT_ERROR_CODE} from '../../src/partition/partition-committed-statement-outcome-constants.js';
import {createPartitionSnapshotCadence, RAFT_SNAPSHOT_CADENCE_OUTCOME} from '../../src/partition/partition-snapshot-cadence.js';
import {buildFreshSplitChildPair} from '../../src/partition/managed-split-child-descriptor.js';
import {buildChildFinalizeIntent, buildChildTransferIntent, CHILD_DESCRIPTOR_ACTION as ACTION,
  CHILD_DESCRIPTOR_DISPOSITION as DISPOSITION} from '../../src/partition/partition-child-descriptor-effect.js';
import {buildRecipientChildForward, isSplitDescriptorReceiptFor, SPLIT_DESCRIPTOR_ERROR,
  splitDescriptorProofLocator, splitDescriptorStatement, splitDescriptorWriteKey} from
  '../../src/partition/partition-split-descriptor-command.js';
import {readPartitionWriteGeneration} from '../../src/partition/partition-participant-transaction-store.js';
import {countCdcObligations} from '../../src/partition/partition-cdc-obligation-ledger.js';
import {scrubRaftRsCheckpointPayload, validateRaftRsPayloadTables} from '../../src/raft/snapshot-application-content.js';
import {requestSnapshotInstall, resolveReplicaCheckpointsRoot} from '../../src/raft/snapshot-install.js';
import {RAFT_SNAPSHOT_INSTALL_OUTCOME} from '../../src/raft/snapshot-install-constants.js';
import {resumeFixtureParticipantGroupAdmission} from '../test-helpers/participant-transaction-fixture.js';
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {settleGroupLeader, transferGroupLeadership} from './partition-group-raft-controls.js';

const tableName = PARTITIONS_SCHEMA.tableName;
const partitionId = getInitialPartitionId(tableName);
const child = 'orders-left';
const seed = 'INSERT INTO partitions (partition_id, table_id, split_descriptor_attempt, created_at, updated_at) ' +
  'VALUES (?, ?, ?, 1, 1)';
const descriptor = {entity: {kind: ENTITY_TYPE.PARTITION, id: tableName}};
function freshPair(workflowAttempt) {
  return buildFreshSplitChildPair({
    workflow: {tableId: 'orders', workflowId: 'orders-split', partitionId: 'orders-source', metadata: {workflowAttempt}},
    splitPlan: {leftPartition: {partitionId: child, keyRange: {start: null, end: 'm'}},
      rightPartition: {partitionId: 'orders-right', keyRange: {start: 'm', end: null}}},
    partitionInfo: {partition_key_type: 'TEXT'}, tableName: 'orders',
    targetVersion: 2, replicaCount: 3, timestamp: workflowAttempt,
  });
}

function submit(service, intent) {
  const {sql, params} = splitDescriptorStatement(intent);
  return service.executeQuery(sql, params, {entryId: splitDescriptorProofLocator(intent).entryId,
    idempotencyKey: splitDescriptorWriteKey(intent), splitDescriptorIntent: intent});
}

function storedReceipt(db, intent) {
  const {entryId} = splitDescriptorProofLocator(intent);
  return db.prepare('SELECT entry_key, command_digest, owner_result_text, log_index, term, changes ' +
    'FROM _partition_statement_outcomes WHERE entry_key = ?').get(committedStatementEntryKey({entryId}));
}

async function committed(service, intent, disposition) {
  const answer = await submit(service, intent);
  assert.equal(answer.success, true, JSON.stringify(answer));
  assert.equal(answer.committed, true, JSON.stringify(answer));
  assert.ok(isSplitDescriptorReceiptFor(answer.splitDescriptorReceipt, intent));
  assert.equal(answer.splitDescriptorReceipt.disposition, disposition);
  const record = storedReceipt(service.db, intent);
  assert.equal(record.command_digest, splitDescriptorProofLocator(intent).commandDigest);
  assert.equal(record.term, answer.term);
  assert.equal(record.log_index, answer.logIndex);
  assert.deepEqual(JSON.parse(record.owner_result_text), answer.splitDescriptorReceipt);
  return answer;
}

// In both handoffs only the left forward reached the destination.
async function handoff(service, pair, workflowAttempt) {
  const recipients = [];
  for (const [index, intent] of pair.entries()) {
    const transfer = buildChildTransferIntent(intent, {workflowId: intent.workflowId, workflowAttempt});
    const answer = await committed(service, transfer, index === 0 ? DISPOSITION.TRANSFERRED : DISPOSITION.ABSENT);
    recipients.push(buildRecipientChildForward(transfer, answer.splitDescriptorReceipt));
  }
  assert.deepEqual(recipients.map(({action}) => action), [ACTION.ADOPT, ACTION.CREATE]);
  return recipients;
}

function childRows(db) {
  return db.prepare('SELECT * FROM partitions WHERE table_id = ? ORDER BY partition_id').all('orders');
}

function effectCounts(db) {
  const {owed, delivered} = countCdcObligations(db);
  return [readPartitionWriteGeneration(db), owed + delivered];
}

test('PARTITIONS startup, checkpoint sealing and incoming image validation share the descriptor format', (t) => {
  const previous = {...PARTITIONS_SCHEMA, columns: PARTITIONS_SCHEMA.columns.filter(
    (column) => column.name !== 'split_descriptor_attempt')};
  for (const kind of ['missing column', 'invalid integer', 'missing table', 'current']) {
    const db = new Database(':memory:');
    t.after(() => db.close());
    const schema = kind === 'missing column' ? previous : PARTITIONS_SCHEMA;
    const service = {db, tableName, partitionId, schema: PARTITIONS_SCHEMA, logger: {debug() {}}};
    createCommittedStatementOutcomeTable(db);
    db.exec('CREATE TABLE raft_rs_peer_identity (id TEXT PRIMARY KEY)');
    if (kind !== 'missing table') {
      db.exec(generateCreateTableSQL(schema));
      for (const sql of generateCreateIndexSQL(schema)) db.exec(sql);
    }
    if (kind === 'invalid integer') {
      assert.throws(() => db.prepare(seed).run(child, 'orders', 1.5), {code: 'SQLITE_CONSTRAINT_CHECK'});
      db.pragma('ignore_check_constraints = ON');
      db.prepare(seed).run(child, 'orders', 1.5);
      db.pragma('ignore_check_constraints = OFF');
    }
    if (kind === 'current') {
      db.prepare(seed).run(child, 'orders', 1);
      createPartitionServiceTable(service);
      scrubRaftRsCheckpointPayload(db, descriptor.entity.kind, tableName);
      assert.equal(validateRaftRsPayloadTables(db, descriptor), true);
      db.exec('DROP TABLE _partition_statement_outcomes');
      assert.equal(validateRaftRsPayloadTables(db, descriptor), false);
      assert.throws(() => scrubRaftRsCheckpointPayload(db, descriptor.entity.kind, tableName),
        {code: PARTITIONS_SCHEMA_UNSUPPORTED});
    } else {
      assert.equal(validateRaftRsPayloadTables(db, descriptor), false, kind);
      assert.throws(() => scrubRaftRsCheckpointPayload(db, descriptor.entity.kind, tableName),
        {code: PARTITIONS_SCHEMA_UNSUPPORTED}, kind);
      if (kind === 'missing table') service.bootstrapMembership = {kind: BOOTSTRAP_MEMBERSHIP_SOURCE.DURABLE_RECORD};
      assert.throws(() => createPartitionServiceTable(service), {code: PARTITIONS_SCHEMA_UNSUPPORTED, source: 'sqlite'}, kind);
      assert.throws(() => createPartitionServiceTable({...service, schema: previous}),
        {code: PARTITIONS_SCHEMA_UNSUPPORTED, source: 'catalog'});
    }
  }
});

// Inject the positive snapshot decision at the production dispatcher's input.
// A lagging member alone does not cause this system partition to compact.
async function serveRequestedImage(leader, receiver, checkpointsRoot, boundary, members) {
  const senderIdentity = buildSnapshotCatchupIdentityFromCache(leader);
  const membership = await leader.raft.readCommittedMembership({purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
  const stamp = committedStampOfAnswer(membership);
  assert.ok(stamp, JSON.stringify(membership));
  assert.deepEqual(stamp.voters.map((peerId) => stamp.identities[peerId]).sort(),
    members.map(([replicaId]) => replicaId).sort());
  assert.notEqual(senderIdentity.membershipEpoch, stamp.membershipGenerationIndex,
    'cluster publication and the admitted group have different coordinates');
  const reservations = readRaftRsPeerIdentityReservations(leader.db);
  const sender = createBulkTransferChannelRegistry({nodeId: leader.nodeId});
  const recipient = createBulkTransferChannelRegistry({nodeId: receiver.nodeId});
  try {
    const {a, b} = createInProcWebSocketPair();
    sender.adoptIncomingSocket({nodeId: receiver.nodeId, ws: a});
    const connection = recipient.adoptIncomingSocket({nodeId: leader.nodeId, ws: b});
    attachSnapshotCatchupDispatcher({service: leader, systemTableCache: leader.systemTableCache,
      messageRouter: {bulkChannelRegistry: sender}});
    const expectedIdentity = buildSnapshotCatchupIdentityFromCache({
      partitionId, tableName, systemTableCache: receiver.systemTableCache,
    });
    const decision = buildSnapshotCatchupDecision({
      outcome: RAFT_SNAPSHOT_CATCHUP_DECISION_OUTCOME.INSTALL_SNAPSHOT,
      followerAddress: receiver.getUnifiedAddress(), startIndex: 1, failedIndex: boundary, leaderBoundary: boundary,
    });
    const [dispatched, received] = await Promise.all([
      leader.onSnapshotCatchupNeeded(decision).then((answer) => {
        assert.equal(answer?.outcome, RAFT_SNAPSHOT_CATCHUP_DISPATCH_OUTCOME.SERVED, JSON.stringify(answer));
        return answer;
      }),
      receiveSnapshotTransfer({socket: bulkConnectionTransferSocket(connection), checkpointsRoot, expectedIdentity}),
    ]);
    assert.equal(received.outcome, RAFT_SNAPSHOT_TRANSFER_OUTCOME.COMPLETED, JSON.stringify(received));
    assert.equal(received.descriptor.lastIncludedIndex, dispatched.generationIndex);
    assert.ok(dispatched.generationIndex >= boundary);
    assert.deepEqual(expectedIdentity, senderIdentity);
    assert.equal(received.descriptor.membershipEpoch, senderIdentity.membershipEpoch);
    assert.equal(received.descriptor.raftRs.membershipGenerationIndex, String(stamp.membershipGenerationIndex));
    assert.deepEqual([...received.descriptor.raftRs.confState.voters].sort(), [...stamp.voters].sort());
    assert.deepEqual(received.descriptor.raftRs.peerReservations, reservations);
    const stale = readCheckpoint({checkpointDir: path.join(checkpointsRoot, String(dispatched.generationIndex)),
      expectedIdentity: {...expectedIdentity, membershipEpoch: senderIdentity.membershipEpoch + 1}});
    assert.equal(stale.outcome, RAFT_CHECKPOINT_VALIDATION_OUTCOME.STALE_EPOCH, JSON.stringify(stale));
    return {generationIndex: dispatched.generationIndex, expectedIdentity};
  } finally {
    sender.closeAll();
    recipient.closeAll();
  }
}

test('PARTITIONS refuses periodic compaction and replays the terminal receipt after a requested image is transferred and installed',
  {timeout: 30000}, async (t) => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    ConfigurationManager.getInstance().initialize({node: {id: 'descriptor-recovery'},
      raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300}});
    LoggingService.getInstance().initialize({level: 'error'});
    let group;
    t.after(async () => {
      try {
        if (group) await group.dispose();
      } finally {
        LoggingService.resetInstance();
        ConfigurationManager.resetInstance();
      }
    });
    const members = [1, 2, 3].map((i) => [partitionId + '-r' + i, 'node-' + i]);
    group = await formAdmittedGroup({partitionId, members, tempPrefix: 'split-descriptor-install-',
      serviceOptions: {tableName, tableId: tableName,
        schema: JSON.parse(seedTableRow(PARTITIONS_SCHEMA, 1).schema_definition)}, budgetMs: 5000});
    const [leader, , receiver] = group.services;
    await settleGroupLeader(group, leader);
    await resumeFixtureParticipantGroupAdmission(group.services, group.waitFor);
    const insert = (attempt) => leader.executeQuery(seed, [child, intent.tableId, attempt],
      {entryId: 'descriptor-insert-' + attempt});
    const first = await insert(intent.workflowAttempt);
    assert.equal(first.success, true, JSON.stringify(first));
    const readChild = (db) => db.prepare('SELECT * FROM partitions WHERE partition_id = ?').get(child);
    assert.ok(await group.waitFor(() => readChild(receiver.db)?.split_descriptor_attempt === intent.workflowAttempt));
    await receiver.shutdown();

    const done = await finalize(leader);
    assert.equal(done.committed, true, JSON.stringify(done));
    assert.ok(isSplitDescriptorReceiptFor(done.splitDescriptorReceipt, intent));
    assert.equal(done.splitDescriptorReceipt.disposition, 'deleted');
    const next = await insert(30);
    assert.equal(next.success, true, JSON.stringify(next));
    const expected = readChild(leader.db);
    const receipt = storedReceipt(leader.db);
    assert.equal(expected.split_descriptor_attempt, 30);
    assert.equal(receipt.changes, 1);
    assert.equal(receipt.log_index, done.logIndex);
    assert.deepEqual(JSON.parse(receipt.owner_result_text), done.splitDescriptorReceipt);

    const tick = await createPartitionSnapshotCadence({service: leader, entryThreshold: 1}).tick(Date.now());
    assert.equal(tick.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.UNSUPPORTED_PARTITION);
    assert.equal(tick.partitionId, partitionId);
    assert.deepEqual(listCheckpointGenerations(resolveReplicaCheckpointsRoot(leader.dbPath)), []);
    const dbPath = group.dbFileOf(members[2]);
    const checkpointsRoot = resolveReplicaCheckpointsRoot(dbPath);
    const image = await serveRequestedImage(leader, receiver, checkpointsRoot, leader.raft.readStatus().appliedIndex, members);
    const stale = new Database(dbPath, {readonly: true});
    try {
      assert.equal(readChild(stale).split_descriptor_attempt, intent.workflowAttempt);
      assert.equal(storedReceipt(stale), undefined);
    } finally {
      stale.close();
    }
    const installed = await requestSnapshotInstall({replicaDbPath: dbPath, checkpointsRoot,
      ...image,
      expectedReplicaIdentity: receiver.replicaId});
    assert.equal(installed.outcome, RAFT_SNAPSHOT_INSTALL_OUTCOME.INSTALLED, JSON.stringify(installed));
    const replica = new PartitionService({...buildReplacementServiceOptions(receiver),
      transport: receiver.transport, systemTableCache: receiver.systemTableCache,
      peerAddresses: members.map(group.addressOf)});
    group.services[2] = replica;
    await replica.initialize();
    assert.deepEqual(readChild(replica.db), expected);
    assert.deepEqual(storedReceipt(replica.db), receipt);
    await transferGroupLeadership(group, leader, replica);
    await settleGroupLeader(group, replica);
    await resumeFixtureParticipantGroupAdmission(group.services, group.waitFor);
    const replayed = await finalize(replica);
    assert.equal(replayed.committed, true, JSON.stringify(replayed));
    assert.equal(replayed.replayOfLogIndex, receipt.log_index);
    assert.deepEqual(replayed.splitDescriptorReceipt, done.splitDescriptorReceipt);
    assert.deepEqual(readChild(replica.db), expected);
    assert.deepEqual(storedReceipt(replica.db), receipt);

    // A retained replica whose entire receipt table disappeared cannot be
    // reopened as a fresh, empty receipt ledger.
    const replacement = buildReplacementServiceOptions(replica);
    await replica.shutdown();
    const damaged = new Database(dbPath);
    try {
      damaged.exec('DROP TABLE _partition_statement_outcomes');
      const rejected = new PartitionService(replacement);
      await assert.rejects(rejected.initialize(), {code: PARTITION_COMMITTED_STATEMENT_ERROR_CODE.FORMAT_UNSUPPORTED});
      assert.equal(damaged.prepare("SELECT 1 FROM sqlite_schema WHERE name = '_partition_statement_outcomes'").get(),
        undefined);
    } finally {
      damaged.close();
    }
  });
