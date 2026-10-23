// Storage-owner fixtures. Native persistence/replay is measured separately in
// seed-retained-effects.integration.test.js; these never claim native execution.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {SERVICE_TYPE} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {decodeCommittedProposal, encodeProposal} from '../../src/raft/raft-rs-proposal-codec.js';
import {applyCommittedEntryTransaction} from '../../src/raft/raft-rs-application-transaction-owner.js';
import {RAFT_RS_ENTRY_TYPE} from '../../src/raft/raft-rs-ready-loop-constants.js';
import {createSeedOriginalAllocation} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {seedMessageGroupRow, seedTableRow, seedPartitionRow} from
  '../../src/bootstrap/seed-foundation-rows.js';
import {SYSTEM_TABLE_NAME, getSchemaByTableName} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {createPartitionServiceTable} from '../../src/partition/partition-service-table-bootstrap.js';
import {prepareInsertData} from '../../src/cdc/cdc-integration-service-insert-normalization.js';
import {buildSystemTableUpsert} from '../../src/cdc/cdc-system-table-mutation-sql-helpers.js';
import {getSystemCachePrimaryKeyField} from '../../src/cache/system-cache-key-descriptor.js';
import {PartitionServiceEntryApplyBase} from
  '../../src/partition/partition-service-entry-apply-base.js';
import {PartitionCDCGenerator} from '../../src/partition/partition-cdc-generator.js';
import {PARTITION_SERVICE_OPERATION, PARTITION_COMMITTED_COMMAND_OUTCOME} from
  '../../src/partition/partition-service-constants.js';
import {openParticipantTransactionStore} from
  '../../src/partition/partition-participant-transaction-store.js';
import {buildGenerationOriginCommand} from
  '../../src/partition/partition-participant-transaction-bytes.js';
import {committedStatementEntryKey, createCommittedStatementOutcomeTable} from
  '../../src/partition/partition-committed-statement-outcome.js';
import {buildCdcAcknowledgementCommand, cdcObligationEventKeyDigest} from
  '../../src/partition/partition-cdc-obligation-ledger.js';

const NODE_ID = 'retained-foundation-node';
const DECLARED_AT = 1234;
const TERM = '3';
const LOGGER = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});

function originalDeclaration(dataDir = '/retained-foundation-fixture') {
  return createSeedOriginalAllocation({dataDir, nodeId: NODE_ID,
    buildDigest: 'retained-foundation-fixture-build', now: DECLARED_AT});
}

function memberOf(declaration, tableName = SYSTEM_TABLE_NAME.MESSAGE_GROUPS) {
  return declaration.members.find((member) => tableName === null ?
    member.serviceType === SERVICE_TYPE.MESSAGE_GROUP : member.tableName === tableName);
}

function originalStamp(member, logical = 0) {
  return {timestamp: new HLCTimestamp(DECLARED_AT, logical, member.replicaId).toString(),
    proposedBy: member.replicaId, proposedAt: DECLARED_AT};
}

// Use the actual registration row and CDC normalization/SQL producers, not
// the classifier's computed plans. TABLES/PARTITIONS use one real catalog row.
function foundationMutation(declaration, tableName, targetTable = SYSTEM_TABLE_NAME.TABLES) {
  const schema = getSchemaByTableName(targetTable);
  const row = tableName === SYSTEM_TABLE_NAME.MESSAGE_GROUPS ?
    seedMessageGroupRow(declaration.nodeId, declaration.declaredAt) :
    tableName === SYSTEM_TABLE_NAME.TABLES ? seedTableRow(schema, declaration.declaredAt) :
      seedPartitionRow(schema, declaration.nodeId, declaration.declaredAt);
  const data = prepareInsertData({getPrimaryKeyField: getSystemCachePrimaryKeyField,
    timeSource: {now: () => declaration.declaredAt}}, tableName, row,
  {generatePrimaryKey: false});
  return {...buildSystemTableUpsert(tableName, data), data};
}

function sqlCommand(member, mutation, entryId = 'original-foundation-statement') {
  return {type: PARTITION_SERVICE_OPERATION.QUERY, sql: mutation.sql, params: mutation.params,
    entryId, operationId: null, idempotencyKey: null, splitMirrorOrigin: null,
    ...originalStamp(member)};
}

function acknowledgement(member, command, sourceIndex, logical = 1) {
  const groups = [{logIndex: sourceIndex, events: [{ordinal: 0,
    eventKeyDigest: cdcObligationEventKeyDigest(committedStatementEntryKey(command))}]}];
  return buildCdcAcknowledgementCommand(member.groupId, groups, originalStamp(member, logical));
}

function createApplicationOwners(db, declaration, member) {
  const {tableName} = member;
  const schema = getSchemaByTableName(tableName);
  const generator = new PartitionCDCGenerator({partitionId: member.groupId,
    replicaId: member.replicaId, tableName, db, logger: LOGGER});
  // Real apply owner and collaborators; after-commit delivery is deliberately
  // left queued, so tests inspect owed debt without inventing a recipient ACK.
  const service = Object.assign(Object.create(PartitionServiceEntryApplyBase.prototype),
    {db, tableName, schema, tableId: tableName, partitionId: member.groupId,
      replicaId: member.replicaId, nodeId: declaration.nodeId, logger: LOGGER,
      getCommittedEntryKey: committedStatementEntryKey,
      syncCDCGeneratorDependencies: () => generator});
  createPartitionServiceTable(service);
  openParticipantTransactionStore(db);
  createCommittedStatementOutcomeTable(db);
  return service;
}

function fixture(t, tableName = SYSTEM_TABLE_NAME.MESSAGE_GROUPS) {
  const declaration = originalDeclaration();
  const member = memberOf(declaration, tableName);
  const db = new Database(':memory:');
  t.after(() => db.close());
  const store = new RaftRsDurableStore(db);
  const confState = {voters: declaration.members.filter((candidate) =>
    candidate.groupId === member.groupId).map((candidate) => candidate.peerId)};
  store.putBootstrapAppliedState(member.groupId, confState,
    {bootstrapIndex: '0', admissionIndex: '0'});
  store.putHardState(member.groupId, {term: TERM, vote: member.peerId, commit: '0'});
  const service = tableName === null ? undefined : createApplicationOwners(db, declaration, member);
  return {db, store, declaration, member, confState, service, afterCommitBatches: []};
}

function applyRetainedEntry(f, entry) {
  const result = applyCommittedEntryTransaction({store: f.store, groupId: f.member.groupId,
    entry, confState: f.confState,
    applyCommittedEntry: f.service ? (bytes, {index, term, effects}) => {
      const afterCommit = [];
      const applied = f.service.applyCommittedEntry({command: decodeCommittedProposal(bytes),
        index: Number(index), term: Number(term),
        effects: {afterCommit, afterRollback: effects.afterRollback}});
      assert.ok([PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED,
        PARTITION_COMMITTED_COMMAND_OUTCOME.REPLAYED].includes(applied),
      `fixture must engage successful real application: ${applied}`);
      // This storage fixture holds delivery/notification work for inspection.
      // The real transaction owner admits that work only after durable apply;
      // rollback must never publish a deferred batch. Native tests run the full host.
      effects.afterCommit.push(() =>
        f.afterCommitBatches.push({index, term, effects: afterCommit}));
      return applied;
    } : undefined});
  assert.equal(result.escapedEffectFailures, 0, 'fixture effect capture must settle after commit');
}

function retain(f, commands, {applied = commands.length, commit = commands.length} = {}) {
  const {store, member} = f;
  const entries = commands.map((command, ordinal) => ({
    index: String(ordinal + 1), term: TERM, entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
    ...(command === undefined ? {} :
      {data: Buffer.from(encodeProposal(command)).toString('base64')}),
  }));
  store.appendEntries(member.groupId, entries);
  store.putHardState(member.groupId,
    {term: TERM, vote: member.peerId, commit: String(commit)});
  for (let ordinal = 0; ordinal < applied; ordinal++) applyRetainedEntry(f, entries[ordinal]);
  return f;
}

function origin(f) {
  return buildGenerationOriginCommand(f.member.groupId, originalStamp(f.member));
}

export {NODE_ID, DECLARED_AT, TERM, originalDeclaration, memberOf, originalStamp,
  foundationMutation, sqlCommand, acknowledgement, createApplicationOwners,
  fixture, retain, origin};
