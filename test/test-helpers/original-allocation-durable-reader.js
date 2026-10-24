// Custody-free, read-only observation of the durable original seed allocation
// for witnesses that cannot hold the data-directory owner (a live runtime
// holds it). The authority read is the store owner's originalAllocationRow;
// the per-macrotask sampler is a cached hint that never decides a receipt.
// When the lifecycle owner exports a custody-free reader (Q3), both consume it.
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {originalAllocationRow} from '../../src/raft/raft-rs-original-allocation-store.js';
import {originalSeedAnchor} from
  '../../src/bootstrap/seed-original-allocation-declaration.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_COLUMN as COLUMN,
  REPLICA_LIFECYCLE_TABLE} from '../../src/raft/raft-rs-original-allocation-constants.js';

const RIGHT_COLUMNS = Object.freeze([COLUMN.SERVICE_RIGHT, COLUMN.IDENTITY_RIGHT]);
const NATIVE_KEY = 'native';

function readOnly(dbPath) {
  return new Database(dbPath, {readonly: true, fileMustExist: true});
}

/**
 * The complete declaration once the anchor is ISSUED; null while absent or
 * still PREPARING. Restates the anchor-row read of
 * RaftRsOriginalAllocationPreparation.readDeclaration, which needs custody.
 * @param {string} dataDir
 * @return {Object|null}
 */
function readIssuedDeclaration(dataDir) {
  const anchor = originalSeedAnchor(dataDir);
  if (!fs.existsSync(anchor.dbPath)) return null;
  const db = readOnly(anchor.dbPath);
  try {
    const present = db.prepare(`SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = ?`).get(REPLICA_LIFECYCLE_TABLE);
    if (present === undefined) return null;
    const row = db.prepare(`SELECT * FROM ${REPLICA_LIFECYCLE_TABLE}
      WHERE group_id = ? AND replica_identity = ?`).get(anchor.groupId, anchor.replicaId);
    if (row?.[COLUMN.ISSUE] !== STATE.ISSUED) return null;
    return JSON.parse(row[COLUMN.DECLARATION]);
  } finally {
    db.close();
  }
}

function rightKey(replicaId, column) {
  return `${replicaId}:${column}`;
}

/**
 * Authority read of every declared member through the store owner.
 * @param {Object} declaration
 * @return {Object} replicaId -> {native, <right column>: state}
 */
function readOwnerRights(declaration) {
  const rights = {};
  for (const member of declaration.members) {
    const db = readOnly(member.dbPath);
    try {
      const row = originalAllocationRow(db, member);
      rights[member.replicaId] = {[NATIVE_KEY]: row.native_history_state,
        ...Object.fromEntries(RIGHT_COLUMNS.filter((column) => row[column] !== null)
          .map((column) => [column, row[column]]))};
    } finally {
      db.close();
    }
  }
  return rights;
}

/**
 * A cheap sampler: one read-only handle and one prepared statement per
 * member, opened once. Records each right's distinct state sequence.
 * @param {Object} declaration
 * @return {{sample: Function, sequences: Object, close: Function}}
 */
function createRightsSampler(declaration) {
  const statements = declaration.members.map((member) => {
    const db = readOnly(member.dbPath);
    const select = db.prepare(`SELECT ${RIGHT_COLUMNS.join(', ')} FROM ${REPLICA_LIFECYCLE_TABLE}
      WHERE group_id = ? AND peer_id = ? AND replica_identity = ? AND incarnation = ?`);
    return {db, member, select};
  });
  const sequences = {};
  return {
    sequences,
    sample() {
      const snapshot = {};
      for (const {member, select} of statements) {
        const row = select.get(member.groupId, member.peerId, member.replicaId,
          member.incarnation);
        for (const column of RIGHT_COLUMNS) {
          if (row?.[column] === null || row?.[column] === undefined) continue;
          const key = rightKey(member.replicaId, column);
          snapshot[key] = row[column];
          const sequence = sequences[key] ??= [];
          if (sequence.at(-1) !== row[column]) sequence.push(row[column]);
        }
      }
      return snapshot;
    },
    close() {
      for (const {db} of statements) db.close();
    },
  };
}

/**
 * @param {Object|null} snapshot right key -> state
 * @return {boolean} every sampled right TRANSFERRED (false for no snapshot)
 */
function everyRightTransferred(snapshot) {
  if (snapshot === null || Object.keys(snapshot).length === 0) return false;
  return Object.values(snapshot).every((value) => value === STATE.TRANSFERRED);
}

/**
 * The right keys a complete declaration owes: every SERVICES birth right and
 * the anchor's reserved cluster-identity right.
 * @param {Object} declaration
 * @return {string[]}
 */
function declaredRightKeys(declaration) {
  return declaration.members.flatMap((member) => [
    rightKey(member.replicaId, COLUMN.SERVICE_RIGHT),
    ...(member.replicaId === declaration.anchorReplicaId ?
      [rightKey(member.replicaId, COLUMN.IDENTITY_RIGHT)] : []),
  ]).sort();
}

export {RIGHT_COLUMNS, createRightsSampler, declaredRightKeys, everyRightTransferred,
  readIssuedDeclaration, readOwnerRights};
