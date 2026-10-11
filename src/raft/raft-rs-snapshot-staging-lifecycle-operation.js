import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import {isReplicaCreateInstallAuthority,
  replicaCreateInstallAuthoritiesEqual} from
  '../node/replica-create-admission-evidence.js';
import {raftRsConfStateKey} from './raft-rs-conf-state-key.js';
import {RaftRsDurableStore} from './raft-rs-durable-store.js';
import {RAFT_RS_ZERO_INDEX} from './raft-rs-durable-store-constants.js';
import {initializeSnapshotStagingLifecycleRow} from
  './raft-rs-replica-lifecycle-owner.js';
import {readRaftRsPeerIdentityReservations} from
  './raft-rs-peer-identity.js';
import {RAFT_RS_SNAPSHOT_STAGING_OUTCOME,
  RAFT_SNAPSHOT_INSTALL_DIRNAME, RAFT_SNAPSHOT_INSTALL_STAGING_FILE} from
  './snapshot-install-constants.js';

const INSTALL_BINDING_TABLE = '_raft_snapshot_install_binding';
const LIFECYCLE_TABLE = '_raft_rs_replica_lifecycle';
const RECORD_TABLES = Object.freeze([
  '_raft_rs_log', '_raft_rs_hard_state', '_raft_rs_applied_state',
  '_raft_rs_snapshot',
]);
const STAGING_OUTCOME = RAFT_RS_SNAPSHOT_STAGING_OUTCOME;
const STAGING_REASON = Object.freeze({
  INPUT_INVALID: 'input_invalid',
  FILE_IDENTITY: 'file_identity_mismatch',
  DESTINATION_PRESENT: 'destination_present_or_changed',
  BINDING_ABSENT_WITH_ROWS: 'binding_absent_with_rows',
  BINDING_MISMATCH: 'binding_extra_or_mismatch',
  LIFECYCLE_CONFLICT: 'lifecycle_retired_or_colliding',
  RECORD_PARTIAL: 'raft_schema_or_record_partial',
  DATABASE_INVALID: 'database_unreadable_or_corrupt',
  SQLITE_BUSY: 'sqlite_busy_or_locked',
});
const SQLITE_DEFERRED_CODES = new Set(['SQLITE_BUSY', 'SQLITE_LOCKED']);

function frozenResult(outcome, reason, facts = {}) {
  return Object.freeze({outcome, reason, ...facts});
}

function conflict(reason, facts = {}) {
  return frozenResult(STAGING_OUTCOME.CONFLICT, reason, facts);
}

function diagnosticFacts(facts) {
  return {installId: facts.installId, generationIndex: facts.generationIndex,
    groupId: facts.groupId, peerId: facts.peerId,
    replicaIdentity: facts.replicaIdentity,
    fileDevice: facts.fileIdentity?.dev ?? null,
    fileInode: facts.fileIdentity?.ino ?? null,
    destinationDigest: facts.destinationDigest};
}

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function captureArray(value, seen) {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => key !== 'length' &&
      (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(key)))) {
    throw new Error();
  }
  const result = new Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error();
    result[index] = capturePlain(descriptor.value, seen);
  }
  return result;
}

function captureRecord(value, seen) {
  if (!isPlainRecord(value)) throw new Error();
  const result = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new Error();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new Error();
    result[key] = capturePlain(descriptor.value, seen);
  }
  return result;
}

function capturePlain(value, seen = new WeakSet()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) throw new Error();
    return value;
  }
  if (typeof value !== 'object' || seen.has(value)) throw new Error();
  seen.add(value);
  return Array.isArray(value) ? captureArray(value, seen) :
    captureRecord(value, seen);
}

function captureInput(input) {
  const captured = capturePlain(input);
  const requiredStrings = [captured.checkpointsRoot, captured.stagingFile,
    captured.destinationFile,
    captured.installId, captured.groupId, captured.peerId,
    captured.replicaIdentity, captured.appliedIndex, captured.appliedTerm,
    captured.membershipGenerationIndex, captured.destinationDigest];
  if (requiredStrings.some((value) =>
    typeof value !== 'string' || value.length === 0) ||
      !isReplicaCreateInstallAuthority(captured.createAuthority) ||
      !isPlainRecord(captured.confState) ||
      !Number.isSafeInteger(captured.generationIndex) ||
      captured.generationIndex < 0 ||
      !isPlainRecord(captured.fileIdentity) ||
      !Number.isSafeInteger(captured.fileIdentity.dev) ||
      !Number.isSafeInteger(captured.fileIdentity.ino) ||
      !Number.isSafeInteger(captured.fileIdentity.mode) ||
      captured.fileIdentity.nlink !== 1) {
    throw new Error();
  }
  return captured;
}

function observedFileIdentity(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.nlink !== 1) return null;
  return {dev: stat.dev, ino: stat.ino, mode: stat.mode, nlink: stat.nlink};
}

function sameFileIdentity(observed, expected) {
  return observed !== null && observed.dev === expected.dev &&
    observed.ino === expected.ino && observed.mode === expected.mode &&
    observed.nlink === expected.nlink;
}

function tableNames(db, names) {
  const select = db.prepare(
    'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?',
  );
  return names.filter((name) => select.get(name) !== undefined);
}

function tableSchemaShape(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((column) => [
    column.name, column.type, column.notnull, column.dflt_value, column.pk,
  ]);
}

function canonicalRecordSchemas() {
  const db = new Database(':memory:');
  try {
    new RaftRsDurableStore(db);
    return Object.freeze(Object.fromEntries(RECORD_TABLES.map((table) =>
      [table, tableSchemaShape(db, table)])));
  } finally {
    db.close();
  }
}

const CANONICAL_RECORD_SCHEMAS = canonicalRecordSchemas();

function recordSchemaState(db) {
  const present = tableNames(db, RECORD_TABLES);
  if (present.length === 0) return 'absent';
  if (present.length !== RECORD_TABLES.length) return 'partial';
  for (const table of RECORD_TABLES) {
    if (JSON.stringify(tableSchemaShape(db, table)) !==
        JSON.stringify(CANONICAL_RECORD_SCHEMAS[table])) return 'partial';
  }
  return 'complete';
}

function bindingState(db, facts) {
  if (tableNames(db, [INSTALL_BINDING_TABLE]).length === 0) return 'absent';
  const columns = tableSchemaShape(db, INSTALL_BINDING_TABLE);
  if (JSON.stringify(columns) !== JSON.stringify([
    ['install_id', 'TEXT', 0, null, 1],
    ['create_authority', 'TEXT', 1, null, 0],
  ])) return 'mismatch';
  const rows = db.prepare(`SELECT install_id, create_authority FROM
    ${INSTALL_BINDING_TABLE}`).all();
  if (rows.length !== 1 || rows[0].install_id !== facts.installId) {
    return 'mismatch';
  }
  try {
    return replicaCreateInstallAuthoritiesEqual(
      JSON.parse(rows[0].create_authority), facts.createAuthority) ?
      'exact' : 'mismatch';
  } catch {
    return 'mismatch';
  }
}

function hasLifecycleTable(db) {
  return tableNames(db, [LIFECYCLE_TABLE]).length === 1;
}

function emptyRecord(record) {
  return record.hardState === null && record.appliedIndex === RAFT_RS_ZERO_INDEX &&
    record.membershipGenerationIndex === RAFT_RS_ZERO_INDEX &&
    record.entries.length === 0 && record.snapshot === null;
}

function exactHardState(hardState, facts) {
  return hardState?.term === facts.appliedTerm &&
    hardState?.vote === RAFT_RS_ZERO_INDEX &&
    hardState?.commit === facts.appliedIndex;
}

function exactSnapshot(snapshot, facts) {
  const metadata = snapshot?.metadata;
  return metadata?.index === facts.appliedIndex &&
    metadata?.term === facts.appliedTerm &&
    metadata?.membershipGenerationIndex === facts.membershipGenerationIndex &&
    raftRsConfStateKey(metadata?.confState) ===
      raftRsConfStateKey(facts.confState);
}

function exactRecord(record, facts) {
  return record.entries.length === 0 &&
    record.appliedIndex === facts.appliedIndex &&
    record.membershipGenerationIndex === facts.membershipGenerationIndex &&
    raftRsConfStateKey(record.confState) === raftRsConfStateKey(facts.confState) &&
    exactHardState(record.hardState, facts) &&
    exactSnapshot(record.snapshot, facts);
}

function exactReservation(observed, expected) {
  return observed.replicaIdentity === expected.replicaIdentity &&
    observed.peerId === expected.peerId &&
    (observed.learnerAdmission ?? null) ===
      (expected.learnerAdmission ?? null) &&
    (observed.promotionAdmission ?? null) ===
      (expected.promotionAdmission ?? null);
}

function exactReservations(db, facts) {
  const observed = readRaftRsPeerIdentityReservations(db);
  return Array.isArray(facts.peerReservations) &&
    observed.length === facts.peerReservations.length &&
    observed.every((reservation, index) =>
      exactReservation(reservation, facts.peerReservations[index]));
}

function initializeStagingRows(db, facts, binding, schema) {
  const store = new RaftRsDurableStore(db);
  return store.transaction(() => {
    const record = store.readDurableRecord(facts.groupId);
    if (binding === 'absent' && !emptyRecord(record)) {
      return conflict(STAGING_REASON.BINDING_ABSENT_WITH_ROWS,
        diagnosticFacts(facts));
    }
    if (binding === 'exact' && !hasLifecycleTable(db)) {
      return conflict(STAGING_REASON.RECORD_PARTIAL, diagnosticFacts(facts));
    }
    if (binding === 'exact' && !exactRecord(record, facts)) {
      return conflict(STAGING_REASON.RECORD_PARTIAL, diagnosticFacts(facts));
    }
    const lifecycle = initializeSnapshotStagingLifecycleRow({db,
      groupId: facts.groupId, peerId: facts.peerId,
      replicaIdentity: facts.replicaIdentity,
      replayAuthorized: binding === 'exact'});
    if (lifecycle.schemaValid === false) {
      return conflict(STAGING_REASON.RECORD_PARTIAL, diagnosticFacts(facts));
    }
    if (lifecycle.state !== 'active') {
      return conflict(STAGING_REASON.LIFECYCLE_CONFLICT,
        {...diagnosticFacts(facts),
          lifecycleReason: lifecycle.refusalReason});
    }
    if (binding === 'exact') {
      return frozenResult(STAGING_OUTCOME.REPLAY, null, {
        ...diagnosticFacts(facts), incarnation: lifecycle.incarnation,
      });
    }
    if (schema !== 'absent' && schema !== 'complete') {
      return conflict(STAGING_REASON.RECORD_PARTIAL, diagnosticFacts(facts));
    }
    db.exec(`CREATE TABLE ${INSTALL_BINDING_TABLE} (
      install_id TEXT PRIMARY KEY,
      create_authority TEXT NOT NULL
    )`);
    db.prepare(`INSERT INTO ${INSTALL_BINDING_TABLE}
      (install_id, create_authority) VALUES (?, ?)`)
      .run(facts.installId, JSON.stringify(facts.createAuthority));
    store.putAppliedState(facts.groupId, facts.appliedIndex, facts.confState,
      undefined, facts.membershipGenerationIndex);
    store.putHardState(facts.groupId, {term: facts.appliedTerm,
      vote: RAFT_RS_ZERO_INDEX, commit: facts.appliedIndex});
    store.putSnapshot(facts.groupId, {metadata: {index: facts.appliedIndex,
      term: facts.appliedTerm, confState: facts.confState}},
    facts.membershipGenerationIndex);
    return frozenResult(STAGING_OUTCOME.INITIALIZED, null, {
      ...diagnosticFacts(facts), incarnation: lifecycle.incarnation,
    });
  });
}

function classifyFailure(error, facts = {}) {
  if (SQLITE_DEFERRED_CODES.has(error?.code)) {
    return frozenResult(STAGING_OUTCOME.DEFERRED,
      STAGING_REASON.SQLITE_BUSY, {sqliteCode: error.code,
        ...diagnosticFacts(facts)});
  }
  return conflict(STAGING_REASON.DATABASE_INVALID, {
    sqliteCode: typeof error?.code === 'string' ? error.code : null,
    ...diagnosticFacts(facts),
  });
}

function physicalFileConflict(facts) {
  if (facts.stagingFile === facts.destinationFile ||
      fs.existsSync(facts.destinationFile)) {
    return conflict(STAGING_REASON.DESTINATION_PRESENT,
      diagnosticFacts(facts));
  }
  try {
    return sameFileIdentity(observedFileIdentity(facts.stagingFile),
      facts.fileIdentity) ? null :
      conflict(STAGING_REASON.FILE_IDENTITY, diagnosticFacts(facts));
  } catch (error) {
    return classifyFailure(error, facts);
  }
}

function inputPhysicalConflict(facts) {
  const fixedStagingFile = path.join(facts.checkpointsRoot,
    RAFT_SNAPSHOT_INSTALL_DIRNAME, RAFT_SNAPSHOT_INSTALL_STAGING_FILE);
  if (facts.stagingFile !== fixedStagingFile) {
    return conflict(STAGING_REASON.INPUT_INVALID,
      diagnosticFacts(facts));
  }
  return physicalFileConflict(facts);
}

function stageOpenDatabase(db, facts) {
  const physicalConflict = physicalFileConflict(facts);
  if (physicalConflict) return physicalConflict;
  const schema = recordSchemaState(db);
  const binding = bindingState(db, facts);
  if (schema === 'partial' || !exactReservations(db, facts)) {
    return conflict(STAGING_REASON.RECORD_PARTIAL, diagnosticFacts(facts));
  }
  if (binding === 'mismatch') {
    return conflict(STAGING_REASON.BINDING_MISMATCH, diagnosticFacts(facts));
  }
  return initializeStagingRows(db, facts, binding, schema);
}

function runStagingDatabase(facts) {
  let result;
  let db;
  try {
    db = new Database(facts.stagingFile, {fileMustExist: true, timeout: 0});
    result = stageOpenDatabase(db, facts);
  } catch (error) {
    result = classifyFailure(error, facts);
  } finally {
    try {
      db?.close();
    } catch (error) {
      result = classifyFailure(error, facts);
    }
  }
  return result;
}

function stageRaftRsSnapshotLifecycle(input) {
  let facts;
  try {
    facts = captureInput(input);
  } catch {
    return conflict(STAGING_REASON.INPUT_INVALID);
  }
  const before = inputPhysicalConflict(facts);
  if (before) return before;
  const result = runStagingDatabase(facts);
  const after = physicalFileConflict(facts);
  return after || result;
}

Object.freeze(stageRaftRsSnapshotLifecycle);

export {
  stageRaftRsSnapshotLifecycle,
};
