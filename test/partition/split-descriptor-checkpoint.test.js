import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import Database from 'better-sqlite3';

import {PARTITIONS_SCHEMA, getInitialPartitionId} from '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateIndexSQL, generateCreateTableSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {ENTITY_TYPE} from '../../src/constants/addresses.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {committedStatementEntryKey, createCommittedStatementOutcomeTable} from '../../src/partition/partition-committed-statement-outcome.js';
import {PARTITIONS_SCHEMA_UNSUPPORTED, createPartitionServiceTable} from '../../src/partition/partition-service-table-bootstrap.js';
import {buildReplacementServiceOptions} from '../../src/partition/partition-reopen-options.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {BOOTSTRAP_MEMBERSHIP_SOURCE} from '../../src/raft/raft-committed-membership-constants.js';
import {createPartitionSnapshotCadence, RAFT_SNAPSHOT_CADENCE_OUTCOME} from '../../src/partition/partition-snapshot-cadence.js';
import {isSplitDescriptorReceiptFor, SPLIT_DESCRIPTOR_FINALIZE_SQL, splitDescriptorWriteKey} from
  '../../src/partition/partition-split-descriptor-command.js';
import {deriveParticipantEntryId} from '../../src/query/distributed/participant-entry-id.js';
import {scrubRaftRsCheckpointPayload, validateRaftRsPayloadTables} from '../../src/raft/snapshot-application-content.js';
import {requestSnapshotInstall, resolveReplicaCheckpointsRoot} from '../../src/raft/snapshot-install.js';
import {RAFT_SNAPSHOT_INSTALL_OUTCOME} from '../../src/raft/snapshot-install-constants.js';
import {resumeFixtureParticipantGroupAdmission} from '../test-helpers/participant-transaction-fixture.js';
import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {settleGroupLeader, transferGroupLeadership} from './partition-group-raft-controls.js';

const tableName = PARTITIONS_SCHEMA.tableName;
const partitionId = getInitialPartitionId(tableName);
const child = 'orders-left';
const intent = {action: 'finalizeChild', tableId: 'orders', partitionId: child,
  workflowId: 'orders-split', workflowAttempt: 1};
const seed = 'INSERT INTO partitions (partition_id, table_id, split_descriptor_attempt, created_at, updated_at) ' +
  'VALUES (?, ?, ?, 1, 1)';
const descriptor = {entity: {kind: ENTITY_TYPE.PARTITION, id: tableName}};
const key = splitDescriptorWriteKey(intent);
const entryId = deriveParticipantEntryId(key, partitionId);

function finalize(service) {
  return service.executeQuery(SPLIT_DESCRIPTOR_FINALIZE_SQL, [intent.tableId, intent.workflowAttempt, child],
    {entryId, idempotencyKey: key, splitDescriptorIntent: intent});
}

function storedReceipt(db) {
  return db.prepare('SELECT entry_key, command_digest, owner_result_text, log_index, term, changes ' +
    'FROM _partition_statement_outcomes WHERE entry_key = ?').get(committedStatementEntryKey({entryId}));
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

test('installed PARTITIONS leader replays the original terminal receipt while the same-ID successor stays owned',
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
      serviceOptions: {tableName, tableId: tableName, schema: PARTITIONS_SCHEMA}, budgetMs: 5000});
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
    assert.equal(tick.outcome, RAFT_SNAPSHOT_CADENCE_OUTCOME.COMPACTED, tick.detail ?? tick.cause);
    const dbPath = group.dbFileOf(members[2]);
    const checkpointsRoot = resolveReplicaCheckpointsRoot(dbPath);
    fs.mkdirSync(checkpointsRoot, {recursive: true});
    fs.cpSync(tick.creation.checkpointDir, path.join(checkpointsRoot, String(tick.checkpointedIndex)), {recursive: true});
    const stale = new Database(dbPath, {readonly: true});
    try {
      assert.equal(readChild(stale).split_descriptor_attempt, intent.workflowAttempt);
      assert.equal(storedReceipt(stale), undefined);
    } finally {
      stale.close();
    }
    const installed = await requestSnapshotInstall({replicaDbPath: dbPath, checkpointsRoot,
      generationIndex: tick.checkpointedIndex, expectedIdentity: tick.creation.descriptor,
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
  });
