// Original allocation fields are owned by the existing lifecycle record.
// No separate database, row identity or bootstrap ledger is introduced.
import {commitDurably} from './raft-rs-durable-store.js';
import {RAFT_RS_OPENING_HISTORY} from './raft-rs-opening-history-constants.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN, REPLICA_LIFECYCLE_TABLE as TABLE,
  originalAllocationError} from './raft-rs-original-allocation-constants.js';

function exactLifecycleRow(db, member) {
  const row = db.prepare(`SELECT * FROM ${TABLE}
    WHERE group_id = ? AND peer_id = ? AND replica_identity = ?`)
    .get(member.groupId, member.peerId, member.replicaId);
  if (row?.incarnation !== member.incarnation || row?.state !== 'active') {
    throw originalAllocationError(REASON.IDENTITY, member.replicaId);
  }
  return row;
}

function originalAllocationRow(db, member) {
  const row = exactLifecycleRow(db, member);
  if (typeof row[COLUMN.DECLARATION] !== 'string' ||
      typeof row[COLUMN.MEMBER] !== 'string') {
    throw originalAllocationError(REASON.INCOMPLETE, member.replicaId);
  }
  return row;
}

function commitAndReadback(db, write, read, expected) {
  let commitFailure;
  try {
    commitDurably(db, write);
  } catch (error) {
    commitFailure = error;
  }
  // Includes a throw after a successful COMMIT. Unknown observation is never
  // absence and never permission to repeat a native or registration effect.
  try {
    if (!expected(read())) throw originalAllocationError(REASON.INCOMPLETE);
  } catch (error) {
    if (commitFailure) {
      throw new AggregateError([commitFailure, error], REASON.OBSERVATION);
    }
    throw error;
  }
}

function prepareOriginalAllocationRow(db, declaration, member) {
  // Only the original issuer formats these optional columns. Ordinary and
  // cold read consumers do not migrate historical files to discover a grant.
  const columns = new Set(db.prepare(`PRAGMA table_info(${TABLE})`).all()
    .map(({name}) => name));
  for (const column of Object.values(COLUMN)) {
    if (!columns.has(column)) db.exec(`ALTER TABLE ${TABLE} ADD COLUMN ${column} TEXT`);
  }
  const before = exactLifecycleRow(db, member);
  if (before.native_history_state !== RAFT_RS_OPENING_HISTORY.NEVER_OPENED ||
      Object.values(COLUMN).some((column) => before[column] !== null)) {
    throw originalAllocationError(REASON.IDENTITY, member.replicaId);
  }
  const declarationText = JSON.stringify(declaration);
  const memberText = JSON.stringify(member);
  commitAndReadback(db, () => db.prepare(`UPDATE ${TABLE}
    SET ${COLUMN.DECLARATION} = ?, ${COLUMN.MEMBER} = ?,
      ${COLUMN.ISSUE} = ?, ${COLUMN.SERVICE_RIGHT} = ?,
      ${COLUMN.IDENTITY_RIGHT} = ?
    WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
      AND incarnation = ? AND state = 'active'
      AND ${COLUMN.DECLARATION} IS NULL`)
    .run(declarationText, memberText, STATE.PREPARING, STATE.UNUSED,
      member.replicaId === declaration.anchorReplicaId ? STATE.UNUSED : null,
      member.groupId, member.peerId, member.replicaId, member.incarnation),
  () => originalAllocationRow(db, member), (row) =>
    row[COLUMN.DECLARATION] === declarationText &&
    row[COLUMN.MEMBER] === memberText && row[COLUMN.ISSUE] === STATE.PREPARING &&
    row[COLUMN.SERVICE_RIGHT] === STATE.UNUSED);
}

function markOriginalAllocationIssued(db, declaration, anchor) {
  commitAndReadback(db, () => db.prepare(`UPDATE ${TABLE}
    SET ${COLUMN.ISSUE} = ? WHERE group_id = ? AND peer_id = ?
      AND replica_identity = ? AND incarnation = ? AND state = 'active'
      AND ${COLUMN.DECLARATION} = ? AND ${COLUMN.ISSUE} = ?`)
    .run(STATE.ISSUED, anchor.groupId, anchor.peerId, anchor.replicaId,
      anchor.incarnation, JSON.stringify(declaration), STATE.PREPARING),
  () => originalAllocationRow(db, anchor), (row) =>
    row[COLUMN.ISSUE] === STATE.ISSUED &&
    row[COLUMN.IDENTITY_RIGHT] === STATE.UNUSED &&
    row[COLUMN.SERVICE_RIGHT] === STATE.UNUSED);
}

function transitionOriginalRight(db, member, column, from, to) {
  if (column !== COLUMN.SERVICE_RIGHT && column !== COLUMN.IDENTITY_RIGHT) {
    throw originalAllocationError(REASON.IDENTITY, member.replicaId);
  }
  const before = originalAllocationRow(db, member);
  if (before[column] !== from) throw originalAllocationError(REASON.SPENT, member.replicaId);
  commitAndReadback(db, () => db.prepare(`UPDATE ${TABLE} SET ${column} = ?
    WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
      AND incarnation = ? AND state = 'active' AND ${column} = ?`)
    .run(to, member.groupId, member.peerId, member.replicaId, member.incarnation, from),
  () => originalAllocationRow(db, member), (row) => row[column] === to);
}

export {exactLifecycleRow, originalAllocationRow, prepareOriginalAllocationRow,
  markOriginalAllocationIssued, transitionOriginalRight};
