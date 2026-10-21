// A complete original allocation is prepared by the existing lifecycle owner
// before native opening. Its files are not an alternative membership authority.
import fs from 'node:fs';
import path from 'node:path';
import {RaftRsPeerIdentityRegistry, readRaftRsPeerIdentityReservations} from
  './raft-rs-peer-identity.js';
import {RaftRsReplicaLifecycleOwner} from './raft-rs-replica-lifecycle-owner.js';
import {RaftRsDurableStore, commitDurably} from './raft-rs-durable-store.js';
import {RAFT_RS_OPENING_HISTORY} from './raft-rs-opening-history-constants.js';
import {RaftRsPreparationCustody} from './raft-rs-preparation-custody.js';
import {REPLICA_DB_PRAGMA} from '../storage/storage-constants.js';
import {ownsDataDirectoryProcessOwner} from '../storage/data-directory-process-owner.js';
import {originalAllocationRow, prepareOriginalAllocationRow,
  markOriginalAllocationIssued} from './raft-rs-original-allocation-store.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN, originalAllocationError} from
  './raft-rs-original-allocation-constants.js';
import {REPLICA_LIFECYCLE_TABLE} from './raft-rs-original-allocation-constants.js';

const ABSENT_FILE = 'ENOENT';
const JOURNAL_SUFFIXES = Object.freeze(['', '-wal', '-journal']);

function assertVirginMember(member) {
  for (const suffix of JOURNAL_SUFFIXES) {
    try {
      fs.lstatSync(member.dbPath + suffix);
    } catch (error) {
      if (error.code === ABSENT_FILE) continue;
      throw error;
    }
    throw originalAllocationError(REASON.HISTORY, member.replicaId);
  }
}

function formatOriginalMember(db, declaration, member) {
  db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
  db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
  commitDurably(db, () => {
    const registry = new RaftRsPeerIdentityRegistry(db);
    for (const replicaId of member.replicaIds) registry.registerReplica(replicaId);
    // This callback closes over immutable owned data and cannot call a
    // consumer. No observer/logger/native dispatcher runs during preparation.
    const lifecycle = new RaftRsReplicaLifecycleOwner({db,
      groupId: member.groupId, peerId: member.peerId, replicaIdentity: member.replicaId,
      mintIncarnation: () => member.incarnation});
    if (!lifecycle.active || lifecycle.incarnation !== member.incarnation) {
      throw originalAllocationError(REASON.IDENTITY, member.replicaId);
    }
  });
  new RaftRsDurableStore(db);
  prepareOriginalAllocationRow(db, declaration, member);
}

function verifyMemberBinding(db, declaration, member) {
  const row = originalAllocationRow(db, member);
  if (row[COLUMN.DECLARATION] !== JSON.stringify(declaration) ||
      row[COLUMN.MEMBER] !== JSON.stringify(member)) {
    throw originalAllocationError(REASON.IDENTITY, member.replicaId);
  }
  if (row[COLUMN.SERVICE_RIGHT] !== STATE.UNUSED) {
    throw originalAllocationError(REASON.SPENT, member.replicaId);
  }
  const reservations = readRaftRsPeerIdentityReservations(db);
  if (reservations.length !== member.replicaIds.length ||
      !member.replicaIds.every((replicaId) =>
        reservations.some((reservation) => reservation.replicaIdentity === replicaId &&
          reservation.learnerAdmission === undefined && reservation.promotionAdmission === undefined))) {
    throw originalAllocationError(REASON.IDENTITY, member.replicaId);
  }
  return row;
}

function inspectColdMember(db, declaration, member) {
  const row = verifyMemberBinding(db, declaration, member);
  const expectedIssue = member.replicaId === declaration.anchorReplicaId ? STATE.ISSUED : STATE.PREPARING;
  if (row[COLUMN.ISSUE] !== expectedIssue ||
      row.native_history_state !== RAFT_RS_OPENING_HISTORY.ESTABLISHED ||
      (member.replicaId === declaration.anchorReplicaId && row[COLUMN.IDENTITY_RIGHT] !== STATE.UNUSED)) {
    throw originalAllocationError(REASON.HISTORY, member.replicaId);
  }
  if (!RaftRsDurableStore.hasDurableRecordIn(db, member.groupId)) {
    throw originalAllocationError(REASON.HISTORY, member.replicaId);
  }
  // This is the existing DDL-free durable reader, including pending entries.
  // Application/transition classification is a further required owner check;
  // neither an applied projection nor committed==applied supplies it.
  return RaftRsDurableStore.readDurableRecordIn(db, member.groupId);
}

class RaftRsOriginalAllocationPreparation {
  #custody = new RaftRsPreparationCustody();
  #directoryOwner;
  #dataDir;
  #started = false;
  #closed = false;

  constructor({directoryOwner, dataDir}) {
    this.#directoryOwner = directoryOwner;
    this.#dataDir = path.resolve(dataDir);
    this.assertCurrent();
  }

  assertCurrent() {
    if (this.#closed) throw originalAllocationError(REASON.CLOSED);
    if (!ownsDataDirectoryProcessOwner(this.#directoryOwner, this.#dataDir)) {
      throw originalAllocationError(REASON.DIRECTORY);
    }
  }

  #begin() {
    this.assertCurrent();
    if (this.#started) throw originalAllocationError(REASON.REENTRANT);
    this.#started = true;
  }

  readDeclaration(anchor) {
    this.assertCurrent();
    try {
      fs.lstatSync(anchor.dbPath);
    } catch (error) {
      if (error.code === ABSENT_FILE) return Object.freeze({state: STATE.ABSENT});
      throw originalAllocationError(REASON.OBSERVATION, anchor.replicaId, error);
    }
    let answer;
    try {
      const db = this.#custody.open(anchor, {readonly: true, fileMustExist: true});
      const present = db.prepare(`SELECT 1 FROM sqlite_master
        WHERE type = 'table' AND name = ?`).get(REPLICA_LIFECYCLE_TABLE);
      const row = present === undefined ? undefined :
        db.prepare(`SELECT * FROM ${REPLICA_LIFECYCLE_TABLE}
          WHERE group_id = ? AND replica_identity = ?`)
          .get(anchor.groupId, anchor.replicaId);
      answer = row?.[COLUMN.DECLARATION] == null ?
        Object.freeze({state: STATE.ABSENT}) :
        Object.freeze({state: STATE.PRESENT, declaration: JSON.parse(row[COLUMN.DECLARATION])});
    } catch (error) {
      this.#fail(originalAllocationError(REASON.OBSERVATION, anchor.replicaId, error));
    }
    this.#finishRead();
    return answer;
  }

  prepare(declaration) {
    this.#begin();
    const opened = new Map();
    try {
      // Complete virgin inventory precedes the first writable open.
      for (const member of declaration.members) assertVirginMember(member);
      for (const member of declaration.members) {
        fs.mkdirSync(path.dirname(member.dbPath), {recursive: true});
        const db = this.#custody.open(member);
        opened.set(member.replicaId, db);
        formatOriginalMember(db, declaration, member);
      }
      for (const member of declaration.members) {
        verifyMemberBinding(opened.get(member.replicaId), declaration, member);
      }
      const anchor = declaration.members.find(({replicaId}) => replicaId === declaration.anchorReplicaId);
      markOriginalAllocationIssued(opened.get(anchor.replicaId), declaration, anchor);
    } catch (error) {
      this.#fail(error);
    }
    this.#finishRead();
  }

  inspect(declaration, inspectApplicationHistory) {
    this.#begin();
    try {
      for (const member of declaration.members) {
        const db = this.#custody.open(member, {readonly: true, fileMustExist: true});
        const record = inspectColdMember(db, declaration, member);
        // A named existing application-owner check, with no native entry or
        // formatting. The seed composition supplies the complete original
        // producer correspondence, not a caller-defined permissive default.
        const assessment = inspectApplicationHistory({db, declaration, member, record});
        if (assessment !== STATE.HISTORY_ACCEPTED) {
          throw originalAllocationError(REASON.CONTRARY, member.replicaId);
        }
      }
    } catch (error) {
      this.#fail(error);
    }
    this.#finishRead();
  }

  #finishRead() {
    try {
      this.#custody.closeAll();
      this.assertCurrent();
    } catch (error) {
      // A failed close is kept for an explicit later owner cleanup attempt;
      // do not retry it implicitly through the preparation-failure branch.
      this.#closed = true;
      throw error;
    }
  }

  #fail(primary) {
    this.#closed = true;
    try {
      this.#custody.closeAll();
    } catch (cleanup) {
      throw new AggregateError([primary, cleanup], REASON.RESOURCE);
    }
    throw primary;
  }

  revoke() {
    this.#closed = true;
  }

  close() {
    this.revoke();
    this.#custody.closeAll();
  }

  observeResources() {
    return this.#custody.observe();
  }
}

export {RaftRsOriginalAllocationPreparation, verifyMemberBinding};
