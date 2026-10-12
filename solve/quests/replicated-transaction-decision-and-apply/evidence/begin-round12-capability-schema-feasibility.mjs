import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import Database from 'better-sqlite3';
import {TRANSPORT_DEFAULT} from '../../../../src/constants/transport.js';
import {COMMITTED_MEMBERSHIP_MAX_PEERS} from
  '../../../../src/raft/raft-committed-membership-constants.js';
import {applyCommittedTransactionCommand} from
  '../../../../src/partition/partition-participant-transaction-apply.js';
import {
  openParticipantTransactionStore,
  readPartitionWriteGeneration,
  readPartitionWriteOrigin,
} from '../../../../src/partition/partition-participant-transaction-store.js';
import {
  installTransactionSchemaEnforcement,
  readTransactionSchemaEnforcement,
} from '../../../../src/query/distributed/distributed-transaction-schema-enforcement.js';

const root = new URL('../', import.meta.url);
const outputPath = fileURLToPath(new URL(
  './begin-round12-capability-schema-feasibility.json', import.meta.url));
const subjectPath = fileURLToPath(new URL(
  './design-query-begin-uncertain-insert-resolution-2026-10-11.md', root));
const predecessorPath = fileURLToPath(new URL(
  './evidence/design-query-begin-uncertain-insert-resolution-round11-a43acda0.md',
  root));
const round11Path = fileURLToPath(new URL(
  './begin-round11-endpoint-feasibility.json', import.meta.url));
const reviewPath = '/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/' +
  'test-output/continuation-20261011/' +
  'review-begin-uncertain-design-round11-independent.md';
const wsServerPath = fileURLToPath(new URL(
  '../../../../node_modules/ws/lib/websocket-server.js', import.meta.url));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileSha256(path) {
  return sha256(readFileSync(path));
}

function checkedAdd(...values) {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 ||
        !Number.isSafeInteger(total + value)) {
      throw new RangeError('feasibility accounting overflow');
    }
    total += value;
  }
  return total;
}

const round11 = JSON.parse(readFileSync(round11Path, 'utf8'));
const {tupleBytes} = round11;
const endpointSlotBytes = checkedAdd(
  tupleBytes.creditRequest,
  tupleBytes.classificationRequest,
  tupleBytes.ack,
  tupleBytes.ack,
  Math.max(tupleBytes.grant, tupleBytes.pressure),
  Math.max(tupleBytes.pageResult, tupleBytes.expired),
  tupleBytes.grant,
);
const totalBytes = 1048576;
const nativeLaneBytes = 262144;
const endpointSlotCount = 4;
const endpointReserveBytes = endpointSlotBytes * endpointSlotCount;
const retainedRecordBytes = totalBytes - nativeLaneBytes - endpointReserveBytes;
assert.equal(checkedAdd(nativeLaneBytes, endpointReserveBytes,
  retainedRecordBytes), totalBytes);
assert(retainedRecordBytes > 0);

const wrapperBytes = Object.freeze({old: 32768, equal: 32768, larger: 32769});
const capacity = {
  equation: {
    totalBytes,
    nativeLaneBytes,
    endpointSlotCount,
    endpointSlotBytes,
    endpointReserveBytes,
    retainedRecordBytes,
    reconciliationReservedSlots: 1,
    sharedSlots: endpointSlotCount - 1,
    usedAtFullCohort: checkedAdd(nativeLaneBytes, endpointReserveBytes,
      retainedRecordBytes),
    freeAtFullCohort: 0,
  },
  chargeSplit: {
    privateSlotIncludesVariableConnectionStrings: false,
    genericTransportOwnsRawWrapperAndCallback: true,
    oldWrapperBytes: wrapperBytes.old,
    equalSuccessorWrapperBytes: wrapperBytes.equal,
    largerSuccessorWrapperBytes: wrapperBytes.larger,
    oldPrivateSlotBytes: endpointSlotBytes,
    equalSuccessorPrivateSlotBytes: endpointSlotBytes,
    largerSuccessorPrivateSlotBytes: endpointSlotBytes,
  },
  fullCohortSchedules: {
    oldGenerationBorrowed: {
      availableSlots: 3,
      borrowedSlotGeneration: 41,
      oldPhysicalRootsRetained: true,
    },
    oldGenerationDrained: {
      availableSlots: 4,
      borrowedSlotGeneration: null,
      oldPhysicalRootsRetained: false,
    },
    equalSuccessor: {
      enabled: true,
      availableSlotsAfterBorrow: 3,
      privateBytes: endpointSlotBytes,
      requiresRecordRelease: false,
    },
    largerSuccessor: {
      enabled: true,
      availableSlotsAfterBorrow: 3,
      privateBytes: endpointSlotBytes,
      requiresRecordRelease: false,
    },
    additionalOrigin: {
      enabled: true,
      availableSlotsAfterBorrow: 3,
      requiresRecordRelease: false,
    },
    fourOrigins: {
      borrowedSlots: 4,
      granted: 1,
      pressure: 3,
      waiters: 0,
    },
    fifthConcurrentOrigin: {
      privateSlotAllocated: false,
      waiters: 0,
      outcome: 'TRANSPORT_PRESSURE_OR_CONNECTION_CLOSE',
      laterRetryAfterSlotRelease: true,
    },
  },
};

assert.equal(capacity.fullCohortSchedules.equalSuccessor.enabled, true);
assert.equal(capacity.fullCohortSchedules.largerSuccessor.enabled, true);
assert.equal(capacity.fullCohortSchedules.additionalOrigin.enabled, true);
assert.equal(capacity.fullCohortSchedules.fourOrigins.borrowedSlots,
  endpointSlotCount);
assert.equal(capacity.equation.reconciliationReservedSlots, 1);
assert.equal(capacity.fullCohortSchedules.fifthConcurrentOrigin.waiters, 0);

const wsServerSource = readFileSync(wsServerPath, 'utf8');
assert.match(wsServerSource, /maxPayload:\s*100\s*\*\s*1024\s*\*\s*1024/);
const transport = {
  installedWsServerSourceSha256: sha256(wsServerSource),
  installedWsDefaultMaxPayloadBytes: 100 * 1024 * 1024,
  outboundQueueMaxConcurrent: TRANSPORT_DEFAULT.OUTBOUND_QUEUE_CONCURRENCY,
  outboundQueueMaxPending: TRANSPORT_DEFAULT.OUTBOUND_QUEUE_MAX_PENDING,
  classificationCapableCohortMaxPeers: COMMITTED_MEMBERSHIP_MAX_PEERS,
  futureRequirement:
    'pin the installed primary maxPayload on dial/server and apply the same ' +
    'serialized-byte check to in-process delivery before private preflight',
};

const createSql = `CREATE TABLE sql_transactions(
  transaction_id TEXT PRIMARY KEY, session_id TEXT NOT NULL,
  status TEXT NOT NULL, transaction_epoch INTEGER, timeout_deadline INTEGER,
  transaction_mode TEXT NOT NULL, participant_set_state TEXT NOT NULL,
  participant_set_text TEXT, commit_mode TEXT NOT NULL,
  frozen_participant_count INTEGER NOT NULL, decision TEXT,
  decision_text TEXT, decision_digest TEXT, created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL)`;
const db = new Database(':memory:');
db.exec(createSql);
openParticipantTransactionStore(db);
const callbacks = [];
const answers = [];
const service = {
  db,
  tableName: 'sql_transactions',
  partitionId: 'tx-p0',
  logger: {info() {}, debug() {}},
  resolveCommittedWrite(id, result) {
    answers.push({id, result});
  },
  rejectCommittedWrite() {},
  emit() {},
};
const committed = {
  command: {
    type: 'PARTICIPANT_GENERATION_ORIGIN',
    partitionId: 'tx-p0',
    entryId: 'origin-proof',
  },
  index: 7,
  term: 3,
  afterCommit(callback) {
    callbacks.push(callback);
  },
  afterRollback() {},
};

const beforeOrigin = {
  origin: readPartitionWriteOrigin(db),
  enforcement: readTransactionSchemaEnforcement(db),
};
const originOutcome = db.transaction(() =>
  applyCommittedTransactionCommand(service, committed))();
for (const callback of callbacks.splice(0)) callback();
const originatedV2 = {
  origin: readPartitionWriteOrigin(db),
  generation: readPartitionWriteGeneration(db),
  enforcement: readTransactionSchemaEnforcement(db),
  rows: db.prepare('SELECT count(*) AS count FROM sql_transactions').get().count,
};
const originReplay = db.transaction(() =>
  applyCommittedTransactionCommand(service, committed))();
for (const callback of callbacks.splice(0)) callback();
const afterOriginReplay = {
  origin: readPartitionWriteOrigin(db),
  generation: readPartitionWriteGeneration(db),
  enforcement: readTransactionSchemaEnforcement(db),
};

assert.equal(originOutcome, 'applied');
assert.equal(originReplay, 'replayed');
assert.deepEqual(originatedV2.origin, {originIndex: 7, originTerm: 3});
assert.equal(originatedV2.generation, 0);
assert.equal(originatedV2.enforcement.schemaVersion, 2);
assert.deepEqual(afterOriginReplay.origin, originatedV2.origin);
assert.equal(afterOriginReplay.generation, originatedV2.generation);

const triggerRow = db.prepare(`SELECT name, sql FROM sqlite_schema
  WHERE type = 'trigger' AND tbl_name = 'sql_transactions'`).get();
const v2TriggerSql = triggerRow.sql;
const v3TriggerSql = v2TriggerSql.replace(
  'length(NEW.session_id) > 0',
  'octet_length(NEW.session_id) > 0',
);
assert.notEqual(v3TriggerSql, v2TriggerSql);
const expectedOrigin = structuredClone(originatedV2.origin);
const expectedGeneration = originatedV2.generation;

const upgradeOutcome = db.transaction(() => {
  assert.deepEqual(readPartitionWriteOrigin(db), expectedOrigin);
  assert.equal(readPartitionWriteGeneration(db), expectedGeneration);
  const currentTrigger = db.prepare(`SELECT sql FROM sqlite_schema
    WHERE type = 'trigger' AND name = ?`).get(triggerRow.name)?.sql;
  assert.equal(currentTrigger, v2TriggerSql);
  db.exec(`DROP TRIGGER ${triggerRow.name}`);
  db.exec(v3TriggerSql);
  const installed = db.prepare(`SELECT sql FROM sqlite_schema
    WHERE type = 'trigger' AND name = ?`).get(triggerRow.name)?.sql;
  assert.equal(installed, v3TriggerSql);
  assert.deepEqual(readPartitionWriteOrigin(db), expectedOrigin);
  assert.equal(readPartitionWriteGeneration(db), expectedGeneration);
  return 'upgraded_origin_preserved';
})();
const afterUpgrade = {
  origin: readPartitionWriteOrigin(db),
  generation: readPartitionWriteGeneration(db),
  triggerSha256: sha256(db.prepare(`SELECT sql FROM sqlite_schema
    WHERE type = 'trigger' AND name = ?`).get(triggerRow.name).sql),
};
const upgradeReplay = db.transaction(() => {
  assert.deepEqual(readPartitionWriteOrigin(db), expectedOrigin);
  assert.equal(readPartitionWriteGeneration(db), expectedGeneration);
  const installed = db.prepare(`SELECT sql FROM sqlite_schema
    WHERE type = 'trigger' AND name = ?`).get(triggerRow.name)?.sql;
  assert.equal(installed, v3TriggerSql);
  return 'replayed_origin_preserved';
})();
assert.deepEqual(afterUpgrade.origin, originatedV2.origin);
assert.equal(afterUpgrade.generation, originatedV2.generation);

const emptyLegacy = new Database(':memory:');
emptyLegacy.exec(`CREATE TABLE sql_transactions(
  transaction_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL)`);
const emptyLegacyBefore = readTransactionSchemaEnforcement(emptyLegacy);
const emptyLegacyAfter = emptyLegacy.transaction(() =>
  installTransactionSchemaEnforcement(emptyLegacy))();
assert.equal(emptyLegacyBefore.state, 'install_required');
assert(emptyLegacyBefore.missingColumns.length > 0);
assert.equal(emptyLegacyAfter.state, 'enforced');

const schema = {
  beforeOrigin,
  originOutcome,
  originatedV2,
  originReplay,
  afterOriginReplay,
  answers,
  upgrade: {
    expectedOrigin,
    expectedGeneration,
    v2TriggerSha256: sha256(v2TriggerSql),
    v3TriggerSha256: sha256(v3TriggerSql),
    outcome: upgradeOutcome,
    after: afterUpgrade,
    replay: upgradeReplay,
  },
  emptyLegacy: {
    before: emptyLegacyBefore,
    after: emptyLegacyAfter,
    rows: emptyLegacy.prepare(
      'SELECT count(*) AS count FROM sql_transactions').get().count,
    futureTransition: 'INSTALL_FIXED_COLUMNS_AND_V3_DURING_FIRST_ORIGIN',
  },
  refusalStates: [
    'ORIGIN_PRESENT_TRIGGER_MISSING',
    'ORIGIN_PRESENT_TRIGGER_FOREIGN',
    'NONEMPTY_LEGACY_MISSING_COLUMNS',
    'EXPECTED_ORIGIN_OR_GENERATION_MISMATCH',
  ],
};

db.close();
emptyLegacy.close();

const output = {
  scope:
    'Round-twelve fixed-slot design model plus actual current committed-origin, ' +
    'replay and SQLite schema controls; no production endpoint or V3 apply.',
  provenance: {
    subjectSha256: fileSha256(subjectPath),
    predecessorSha256: fileSha256(predecessorPath),
    reviewSha256: fileSha256(reviewPath),
    round11FeasibilitySha256: fileSha256(round11Path),
  },
  capacity,
  transport,
  schema,
};

writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
