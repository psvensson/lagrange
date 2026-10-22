// A complete original allocation is prepared by the existing lifecycle owner
// before native opening. Its files are not an alternative membership authority.
import fs from 'node:fs';
import path from 'node:path';
import {validateOriginalSeedDeclaration} from
  '../bootstrap/seed-original-allocation-declaration.js';
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
import {RAFT_OPERATION_PORT_REQUEST as PORT_REQUEST} from './raft-operation-port-request.js';
import {validateBootstrapMembershipStamp, validateDurableRecordBootstrap} from
  './raft-committed-membership-stamp.js';

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
  // Only the declared anchor owns a cluster-identity publication right.
  // A non-anchor grant (including a spent or unknown value) is contrary data.
  if (member.replicaId !== declaration.anchorReplicaId &&
      row[COLUMN.IDENTITY_RIGHT] !== null) {
    throw originalAllocationError(REASON.IDENTITY, member.replicaId);
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


// Only this preparation owner mints these same-live capabilities. Neither a
// declaration read from disk nor a copied object can reopen original work.
// Tokens own no handle: the existing service/port keeps physical custody.
const originalOpenings = new WeakMap();

function requireOriginalOpening(opening) {
  const record = originalOpenings.get(opening);
  if (!record) throw originalAllocationError(REASON.AUTHORITY);
  return record;
}

/**
 * Consume the original opening at the operation-port construction boundary.
 * The returned check belongs to the same attempt and exact native incarnation;
 * it does not stop protocol settlement on runtimes that have already opened.
 * @param {Object} opening Opaque capability issued by the preparation owner.
 * @param {Object} request Canonical operation-port request.
 * @return {Function} Final synchronous check immediately before native entry.
 */
function consumeOriginalAllocationOpening(opening, request) {
  const record = requireOriginalOpening(opening);
  record.assertCurrent();
  if (record.consumed) {
    throw originalAllocationError(REASON.OPENING_CONSUMED, record.member.replicaId);
  }
  record.validate(request);
  record.assertCurrent();
  // Even construction failure cannot turn this into another opening right.
  record.consumed = true;
  return (incarnation) => {
    record.assertCurrent();
    if (incarnation !== record.member.incarnation) {
      throw originalAllocationError(REASON.IDENTITY, record.member.replicaId);
    }
  };
}

class RaftRsOriginalAllocationPreparation {
  #custody = new RaftRsPreparationCustody();
  #directoryOwner;
  #dataDir;
  #declarationIdentity;
  #started = false;
  #closed = false;
  #declaration = null;
  #openingMode = null;
  #inspectApplicationHistory = null;
  #openings = new Map();
  #openingValidationActive = false;

  constructor({directoryOwner, dataDir, nodeId, buildDigest}) {
    this.#directoryOwner = directoryOwner;
    this.#dataDir = path.resolve(dataDir);
    // Bind expectations from startup, never from the declaration being checked.
    this.#declarationIdentity = Object.freeze({dataDir: this.#dataDir, nodeId, buildDigest});
    this.assertCurrent();
  }

  assertCurrent() {
    this.#assertCurrent();
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
      // Ask the catalog owner before inventory, mkdir or any writable open.
      // Checking only the supplied members cannot prove a complete allocation.
      validateOriginalSeedDeclaration(declaration, this.#declarationIdentity);
      this.assertCurrent();
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
    this.#declaration = declaration;
    this.#openingMode = STATE.LIVE_ISSUER;
  }

  inspect(declaration, inspectApplicationHistory) {
    this.#begin();
    try {
      // Empty/subset cold scans are not successful cohort inspections either.
      validateOriginalSeedDeclaration(declaration, this.#declarationIdentity);
      this.assertCurrent();
      for (const member of declaration.members) {
        this.assertCurrent();
        const db = this.#custody.open(member, {readonly: true, fileMustExist: true});
        const record = inspectColdMember(db, declaration, member);
        // A named existing application-owner check, with no native entry or
        // formatting. The seed composition supplies the complete original
        // producer correspondence, not a caller-defined permissive default.
        const assessment = inspectApplicationHistory({db, declaration, member, record});
        // The application owner can synchronously revoke the live attempt.
        // Do not acquire another member or accept its answer after closure.
        this.assertCurrent();
        if (assessment !== STATE.HISTORY_ACCEPTED) {
          throw originalAllocationError(REASON.CONTRARY, member.replicaId);
        }
      }
    } catch (error) {
      this.#fail(error?.code === STATE.HOLD ? error :
        originalAllocationError(REASON.OBSERVATION, null, error));
    }
    this.#finishRead();
    this.#declaration = declaration;
    this.#openingMode = STATE.COLD_RECOVERY;
    this.#inspectApplicationHistory = inspectApplicationHistory;
  }

  /**
   * Ask this exact live attempt for one declared member's original opening.
   * There is no issuance from a row, serialized mode, or partial preparation.
   * @param {string} replicaId Exact declared replica identity.
   * @return {Object} Opaque process-local opening capability.
   */
  openingFor(replicaId) {
    this.assertCurrent();
    if (this.#openingMode === null) throw originalAllocationError(REASON.AUTHORITY);
    const member = this.#declaration.members.find((entry) => entry.replicaId === replicaId);
    if (!member) throw originalAllocationError(REASON.IDENTITY, replicaId);
    if (!this.#openings.has(replicaId)) {
      const opening = Object.freeze(Object.create(null));
      originalOpenings.set(opening, {
        member,
        consumed: false,
        assertCurrent: () => this.#assertCurrent(),
        validate: (request) => this.#validateOpeningRequest(member, request),
      });
      this.#openings.set(replicaId, opening);
    }
    return this.#openings.get(replicaId);
  }

  #assertCurrent() {
    // Keep revocation and actual directory custody at the existing owner.
    // Do not route authority through a replaceable public instance method.
    if (this.#closed) throw originalAllocationError(REASON.CLOSED);
    if (!ownsDataDirectoryProcessOwner(this.#directoryOwner, this.#dataDir)) {
      throw originalAllocationError(REASON.DIRECTORY);
    }
  }

  #validateOpeningRequest(member, request) {
    this.#assertCurrent();
    if (this.#openingValidationActive) throw originalAllocationError(REASON.REENTRANT);
    this.#openingValidationActive = true;
    try {
      this.#validateMemberOpening(member, request);
    } finally {
      this.#openingValidationActive = false;
    }
  }

  #validateMemberOpening(member, request) {
    const db = request[PORT_REQUEST.DURABLE_STORAGE];
    const cold = this.#openingMode === STATE.COLD_RECOVERY;
    const membership = request[PORT_REQUEST.BOOTSTRAP_MEMBERSHIP];
    const checked = cold ? validateDurableRecordBootstrap(membership) :
      validateBootstrapMembershipStamp(membership);
    const peers = request[PORT_REQUEST.BOOTSTRAP_PEER_IDS];
    if (request[PORT_REQUEST.GROUP_ID] !== member.groupId ||
        request[PORT_REQUEST.PEER_ID] !== member.replicaId ||
        typeof db?.name !== 'string' || path.resolve(db.name) !== member.dbPath ||
        request[PORT_REQUEST.IDENTITY_EXISTED] !== cold ||
        request[PORT_REQUEST.JOINING_EXISTING_GROUP] === true ||
        !Array.isArray(peers) || peers.length !== member.replicaIds.length ||
        !member.replicaIds.every((id, index) => peers[index] === id) ||
        checked.valid !== true || (!cold &&
          JSON.stringify(checked.stamp) !== JSON.stringify(member.membership))) {
      throw originalAllocationError(REASON.IDENTITY, member.replicaId);
    }
    try {
      if (db.inTransaction) throw originalAllocationError(REASON.OBSERVATION, member.replicaId);
      if (cold) {
        // The application owner receives a readonly handle, just as at
        // complete-cohort inspection. Do not reinterpret a writable handle
        // as readonly authority or keep a cached approval across native open.
        const observed = this.#custody.open(member, {readonly: true, fileMustExist: true});
        try {
          const record = inspectColdMember(observed, this.#declaration, member);
          const assessment = this.#inspectApplicationHistory({db: observed,
            declaration: this.#declaration, member, record});
          this.#assertCurrent();
          if (assessment !== STATE.HISTORY_ACCEPTED) {
            throw originalAllocationError(REASON.CONTRARY, member.replicaId);
          }
        } catch (error) {
          this.#fail(error);
        }
        this.#finishRead();
      } else {
        const row = verifyMemberBinding(db, this.#declaration, member);
        const anchor = member.replicaId === this.#declaration.anchorReplicaId;
        if (row[COLUMN.ISSUE] !== (anchor ? STATE.ISSUED : STATE.PREPARING) ||
            row.native_history_state !== RAFT_RS_OPENING_HISTORY.NEVER_OPENED ||
            (anchor && row[COLUMN.IDENTITY_RIGHT] !== STATE.UNUSED) ||
            RaftRsDurableStore.hasDurableRecordIn(db, member.groupId)) {
          throw originalAllocationError(REASON.HISTORY, member.replicaId);
        }
      }
    } catch (error) {
      throw error?.code === STATE.HOLD ? error :
        originalAllocationError(REASON.OBSERVATION, member.replicaId, error);
    }
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
    this.#openings.clear();
  }

  close() {
    this.revoke();
    this.#custody.closeAll();
  }

  observeResources() {
    return this.#custody.observe();
  }
}

export {RaftRsOriginalAllocationPreparation, verifyMemberBinding,
  consumeOriginalAllocationOpening};
