// A complete original allocation is prepared by the existing lifecycle owner
// before native opening. Its files are not an alternative membership authority.
import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {deepFreeze} from './raft-operation-port.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {validateOriginalSeedDeclaration, validateOriginalSeedDraft,
  completeSeedOriginalAllocation, originalSeedPeerAddresses} from
  '../bootstrap/seed-original-allocation-declaration.js';
import {readOriginalSeedRetainedEffects} from '../bootstrap/seed-retained-effects.js';
import {getSchemaByTableName} from '../bootstrap/system-table-schemas-constants.js';
import {RaftRsPeerIdentityRegistry, readRaftRsPeerIdentityReservations,
  deriveRaftRsPeerId} from
  './raft-rs-peer-identity.js';
// The lifecycle owner is the only writer of the founder rows and their
// allocation fields (owner decision 2026-10-26, Q3): this preparation births,
// formats, issues and reads them only through these named operations.
import {prepareReplicaLifecycleForOriginalAllocation, prepareOriginalAllocationRow,
  markOriginalAllocationIssued, readOriginalAllocationRow,
  readOriginalAllocationDeclaration, transitionOriginalRight} from
  './raft-rs-replica-lifecycle-owner.js';
import {RaftRsDurableStore, commitDurably} from './raft-rs-durable-store.js';
import {RAFT_RS_RETAINED_HISTORY_COVERAGE, RAFT_RS_RETAINED_ENTRY_KIND,
  RAFT_RS_ZERO_INDEX} from './raft-rs-durable-store-constants.js';
import {RAFT_RS_OPENING_HISTORY} from './raft-rs-opening-history-constants.js';
import {RaftRsPreparationCustody} from './raft-rs-preparation-custody.js';
import {REPLICA_DB_PRAGMA} from '../storage/storage-constants.js';
import {ownsDataDirectoryProcessOwner} from '../storage/data-directory-process-owner.js';
import {ORIGINAL_ALLOCATION as STATE, ORIGINAL_ALLOCATION_REASON as REASON,
  ORIGINAL_ALLOCATION_COLUMN as COLUMN, originalAllocationError} from
  './raft-rs-original-allocation-constants.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {RAFT_OPERATION_PORT_REQUEST as PORT_REQUEST} from './raft-operation-port-request.js';
import {validateBootstrapMembershipStamp, validateDurableRecordBootstrap} from
  './raft-committed-membership-stamp.js';

const ABSENT_FILE = 'ENOENT';
const JOURNAL_SUFFIXES = Object.freeze(['', '-wal', '-journal']);
const PUBLICATION_EXECUTION = Object.freeze({IDLE: 'idle', RUNNING: 'running'});

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

// Birth one founder through the lifecycle owner's named original operation,
// committed with its peer-identity rows. The owner mints the incarnation and
// this returns it; the declaration is completed from these stamps only.
function bearOriginalMember(db, member) {
  db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
  db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
  let born;
  commitDurably(db, () => {
    const registry = new RaftRsPeerIdentityRegistry(db);
    for (const replicaId of member.replicaIds) registry.registerReplica(replicaId);
    // This callback closes over immutable owned data and cannot call a
    // consumer. No observer/logger/native dispatcher runs during preparation.
    born = prepareReplicaLifecycleForOriginalAllocation({db, groupId: member.groupId,
      peerId: member.peerId, replicaIdentity: member.replicaId});
    if (born.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
      throw originalAllocationError(REASON.IDENTITY, member.replicaId);
    }
  });
  new RaftRsDurableStore(db);
  return born.detail.incarnation;
}

function verifyMemberBinding(db, declaration, member) {
  const row = readOriginalAllocationRow({db, member});
  if (row[COLUMN.DECLARATION] !== JSON.stringify(declaration) ||
      row[COLUMN.MEMBER] !== JSON.stringify(member)) {
    throw originalAllocationError(REASON.IDENTITY, member.replicaId);
  }
  if (row[COLUMN.SERVICE_RIGHT] !== STATE.UNUSED ||
      (member.replicaId === declaration.anchorReplicaId &&
       row[COLUMN.IDENTITY_RIGHT] !== STATE.UNUSED)) {
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
          reservation.learnerAdmission === undefined))) {
    throw originalAllocationError(REASON.IDENTITY, member.replicaId);
  }
  return row;
}

function inspectColdMember(db, declaration, member) {
  const row = verifyMemberBinding(db, declaration, member);
  const expectedIssue = member.replicaId === declaration.anchorReplicaId ?
    STATE.ISSUED : STATE.PREPARING;
  if (row[COLUMN.ISSUE] !== expectedIssue ||
      row.native_history_state !== RAFT_RS_OPENING_HISTORY.ESTABLISHED) {
    throw originalAllocationError(REASON.HISTORY, member.replicaId);
  }
  let history;
  try {
    history = RaftRsDurableStore.readRetainedHistoryIn(db, member.groupId);
  } catch (cause) {
    throw originalAllocationError(REASON.HISTORY, member.replicaId, cause);
  }
  const {record} = history;
  const voters = member.replicaIds.map(deriveRaftRsPeerId).sort();
  const expected = {voters, learners: [], votersOutgoing: [], learnersNext: [],
    autoLeave: false};
  if (!isDeepStrictEqual({...record.confState,
    voters: [...record.confState.voters].sort()}, expected) ||
      record.bootstrapIndex !== RAFT_RS_ZERO_INDEX ||
      record.admissionIndex !== RAFT_RS_ZERO_INDEX ||
      record.membershipGenerationIndex !== RAFT_RS_ZERO_INDEX) {
    throw originalAllocationError(REASON.HISTORY, member.replicaId);
  }
  // Native membership/checkpoint interpretation remains with those owners.
  // A current founder set cannot classify a retained configuration command or
  // the application prefix a snapshot replaced.
  if (history.coverage !== RAFT_RS_RETAINED_HISTORY_COVERAGE.COMPLETE ||
      history.entries.some(({kind}) => kind === RAFT_RS_RETAINED_ENTRY_KIND.CONFIGURATION)) {
    throw originalAllocationError(REASON.CLASSIFICATION_UNAVAILABLE, member.replicaId);
  }
  return record;
}


// Only this preparation owner mints these same-live capabilities. Neither a
// declaration read from disk nor a copied object can reopen original work.
// Tokens own no handle: the existing service/port keeps physical custody.
const originalOpenings = new WeakMap();
let originalRightObserver = null;

// Passive measurement of committed owner transitions. The observer supplies
// no authority; a changed lifetime is checked again before the next effect.
function setOriginalAllocationRightObserver(observer) {
  originalRightObserver = observer;
}

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
  record.validate(request, false);
  record.assertCurrent();
  // Even construction failure cannot turn this into another opening right.
  record.consumed = true;
  record.db = request[PORT_REQUEST.DURABLE_STORAGE];
  return (incarnation) => {
    record.assertCurrent();
    if (incarnation !== record.member.incarnation) {
      throw originalAllocationError(REASON.IDENTITY, record.member.replicaId);
    }
    // Argument evaluation can revoke the attempt or consume durable rights.
    // Re-read through the same owner at the final native-effect cut. The cold
    // application classifier runs here, once, after caller inputs are owned.
    record.validate(request, true);
    record.assertCurrent();
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
  #publications = new Map();
  #handoffComplete = false;

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
      const read = readOriginalAllocationDeclaration({db, groupId: anchor.groupId,
        replicaIdentity: anchor.replicaId});
      answer = read.state === STATE.PRESENT ?
        Object.freeze({state: STATE.PRESENT, declaration: read.declaration}) : read;
    } catch (error) {
      this.#fail(originalAllocationError(REASON.OBSERVATION, anchor.replicaId, error));
    }
    this.#finishRead();
    return answer;
  }

  /**
   * Prepare the complete cohort of an original allocation and issue it,
   * before any native effect. Every founder is born first (the lifecycle
   * owner mints each incarnation), then the declaration is completed from
   * those stamps and written to every row, and only then is the anchor
   * issued. A failure at any point leaves no issued allocation, and the
   * files it leaves make every later attempt hold (virgin inventory).
   * @param {Object} draft The declaration owner's allocation, without
   *   incarnations: a caller-chosen incarnation is refused.
   * @return {Object} The complete, immutable declaration that was issued.
   */
  prepare(draft) {
    this.#begin();
    const opened = new Map();
    let declaration;
    try {
      // Ask the catalog owner before inventory, mkdir or any writable open.
      // Checking only the supplied members cannot prove a complete allocation.
      validateOriginalSeedDraft(draft, this.#declarationIdentity);
      this.assertCurrent();
      // Complete virgin inventory precedes the first writable open.
      for (const member of draft.members) assertVirginMember(member);
      const incarnations = new Map();
      for (const member of draft.members) {
        fs.mkdirSync(path.dirname(member.dbPath), {recursive: true});
        const db = this.#custody.open(member);
        opened.set(member.replicaId, db);
        incarnations.set(member.replicaId, bearOriginalMember(db, member));
      }
      declaration = completeSeedOriginalAllocation(draft, incarnations,
        this.#declarationIdentity);
      for (const member of declaration.members) {
        prepareOriginalAllocationRow({db: opened.get(member.replicaId), declaration, member});
      }
      for (const member of declaration.members) {
        verifyMemberBinding(opened.get(member.replicaId), declaration, member);
      }
      const anchor = declaration.members.find(({replicaId}) =>
        replicaId === declaration.anchorReplicaId);
      markOriginalAllocationIssued({db: opened.get(anchor.replicaId), declaration, anchor});
    } catch (error) {
      this.#fail(error);
    }
    this.#finishRead();
    this.#declaration = declaration;
    this.#openingMode = STATE.LIVE_ISSUER;
    return declaration;
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

  // Diagnostic evidence only: never installs COLD_RECOVERY or mints openings.
  // The live preparation retains each read handle until exact close succeeds.
  observeRetainedEffects(declaration) {
    this.#begin();
    const observations = [];
    try {
      validateOriginalSeedDeclaration(declaration, this.#declarationIdentity);
      for (const member of declaration.members) {
        this.assertCurrent();
        const db = this.#custody.open(member, {readonly: true, fileMustExist: true});
        const record = inspectColdMember(db, declaration, member);
        const observation = readOriginalSeedRetainedEffects({db, declaration, member});
        this.assertCurrent();
        if (!isDeepStrictEqual(record, inspectColdMember(db, declaration, member))) {
          throw originalAllocationError(REASON.OBSERVATION, member.replicaId);
        }
        observations.push(observation);
      }
    } catch (error) {
      this.#fail(error?.code === STATE.HOLD ? error :
        originalAllocationError(REASON.OBSERVATION, null, error));
    }
    this.#finishRead();
    return deepFreeze(observations);
  }

  foundationTimestamp() {
    this.assertCurrent();
    if (!Number.isSafeInteger(this.#declaration?.declaredAt) || this.#declaration.declaredAt < 0) {
      throw originalAllocationError(REASON.IDENTITY);
    }
    return this.#declaration.declaredAt;
  }

  assertContinuation(replicaId = undefined) {
    this.#assertCurrent();
    if (this.#openingMode === null) throw originalAllocationError(REASON.AUTHORITY);
    if (this.#openingMode !== STATE.LIVE_ISSUER) {
      throw originalAllocationError(REASON.CONTINUATION_UNAVAILABLE, replicaId);
    }
    if (replicaId !== undefined) this.#continuedMember(replicaId);
  }

  #continuedMember(replicaId) {
    const opening = this.#openings.get(replicaId);
    const record = originalOpenings.get(opening);
    if (!record?.admitted || !record.consumed) {
      throw originalAllocationError(REASON.AUTHORITY, replicaId);
    }
    let row;
    try {
      row = readOriginalAllocationRow({db: record.db, member: record.member});
    } catch (error) {
      throw error?.code === STATE.HOLD ? error :
        originalAllocationError(REASON.OBSERVATION, replicaId, error);
    }
    if (row[COLUMN.DECLARATION] !== JSON.stringify(this.#declaration) ||
        row[COLUMN.ISSUE] !== (replicaId === this.#declaration.anchorReplicaId ?
          STATE.ISSUED : STATE.PREPARING) ||
        row.native_history_state !== RAFT_RS_OPENING_HISTORY.ESTABLISHED) {
      throw originalAllocationError(REASON.IDENTITY, replicaId);
    }
    return record;
  }

  serviceBirth(replicaId) {
    this.assertContinuation(replicaId);
    const {member} = this.#continuedMember(replicaId);
    return Object.freeze({created_at: member.createdAt,
      state_entered_at: member.createdAt, updated_at: member.createdAt,
      create_attempt_token: member.createAttemptToken});
  }

  assertServiceIdentity(replicaId, row) {
    this.assertContinuation(replicaId);
    const {member} = this.#continuedMember(replicaId);
    const partition = member.serviceType === SERVICE_TYPE.PARTITION;
    const address = originalSeedPeerAddresses(this.#declaration.nodeId,
      member.serviceType, [member.replicaId])[0];
    const identity = {service_id: member.replicaId, replica_id: member.replicaId,
      service_type: member.serviceType, node_id: this.#declaration.nodeId, address,
      partition_id: partition ? member.groupId : null,
      group_id: partition ? null : member.groupId, ...this.serviceBirth(replicaId)};
    if (!Object.entries(identity).every(([field, value]) => row[field] === value)) {
      throw originalAllocationError(REASON.IDENTITY, replicaId);
    }
  }

  clusterIdentity() {
    this.assertContinuation(this.#declaration?.anchorReplicaId);
    return Object.freeze({replicaId: this.#declaration.anchorReplicaId,
      clusterId: this.#declaration.clusterId, timestamp: this.#declaration.declaredAt});
  }

  // The same live issuer retains a submitted operation's exact value. A later
  // invocation may only read it back. No failure, absent row or lost response
  // restores submission authority. Durable rights remain lifecycle-owned.
  async publishOriginalRight({replicaId, right, value, submit, observe}) {
    this.assertContinuation(replicaId);
    const record = this.#continuedMember(replicaId);
    if (right !== COLUMN.SERVICE_RIGHT &&
        !(right === COLUMN.IDENTITY_RIGHT && replicaId === this.#declaration.anchorReplicaId)) {
      throw originalAllocationError(REASON.IDENTITY, replicaId);
    }
    if (right === COLUMN.SERVICE_RIGHT) this.assertServiceIdentity(replicaId, value);
    const key = `${replicaId}:${right}`;
    const expected = deepFreeze(structuredClone(value));
    const retained = this.#publications.get(key);
    if (retained) {
      if (right === COLUMN.IDENTITY_RIGHT && !isDeepStrictEqual(retained.value, expected)) {
        throw originalAllocationError(REASON.IDENTITY, replicaId);
      }
      // A leader change can alter a newly built SERVICES row's mutable role.
      // Identity is checked above; the existing operation still observes and
      // returns its first exact row, never the caller's rebuilt mutable value.
      if (retained.execution.state === PUBLICATION_EXECUTION.RUNNING) {
        return retained.execution.promise;
      }
    } else if (readOriginalAllocationRow({db: record.db, member: record.member})[right] !==
        STATE.UNUSED) {
      // A refused first call must not leave a retained invocation that could
      // turn the next call's observed SUBMITTED/TRANSFERRED row into authority.
      throw originalAllocationError(REASON.SPENT, replicaId);
    }
    const publication = retained || {value: expected,
      execution: {state: PUBLICATION_EXECUTION.IDLE}};
    this.#publications.set(key, publication);
    // A promise is installed before any callback can re-enter this operation.
    const promise = Promise.resolve().then(async () => {
      this.assertContinuation(replicaId);
      const {db, member} = record;
      const row = readOriginalAllocationRow({db, member});
      if (row[right] === STATE.TRANSFERRED) {
        if (!retained) throw originalAllocationError(REASON.SPENT, replicaId);
        return publication.value;
      }
      let submissionError;
      if (row[right] === STATE.UNUSED) {
        this.#transitionRight(record, right, STATE.UNUSED, STATE.SUBMITTED);
        this.assertContinuation(replicaId);
        try {
          await submit(publication.value);
        } catch (error) {
          submissionError = error;
        }
      } else if (row[right] !== STATE.SUBMITTED || !retained) {
        throw originalAllocationError(REASON.SPENT, replicaId);
      }
      this.assertContinuation(replicaId);
      let observed;
      try {
        observed = await observe(publication.value);
      } catch (error) {
        throw originalAllocationError(REASON.OBSERVATION, replicaId, error);
      }
      this.assertContinuation(replicaId);
      if (observed !== true) {
        throw originalAllocationError(REASON.OBSERVATION, replicaId, submissionError);
      }
      this.#transitionRight(record, right, STATE.SUBMITTED, STATE.TRANSFERRED);
      return publication.value;
    });
    publication.execution = {state: PUBLICATION_EXECUTION.RUNNING, promise};
    try {
      return await publication.execution.promise;
    } finally {
      publication.execution = {state: PUBLICATION_EXECUTION.IDLE};
    }
  }

  #transitionRight({db, member}, right, from, to) {
    transitionOriginalRight({db, member, right, from, to});
    originalRightObserver?.(Object.freeze({replicaId: member.replicaId, right, from, to}));
  }

  assertPublicAdmission() {
    this.assertContinuation();
    // Transfer is irreversible. Once this exact live attempt has observed
    // every durable right transferred, ordinary founder retirement must not
    // turn its completed handoff back into startup debt. Current custody and
    // LIVE_ISSUER are still required; cold/closed attempts cannot borrow it.
    if (this.#handoffComplete) return;
    for (const member of this.#declaration.members) {
      const {db} = this.#continuedMember(member.replicaId);
      const row = readOriginalAllocationRow({db, member});
      if (row[COLUMN.SERVICE_RIGHT] !== STATE.TRANSFERRED ||
          (member.replicaId === this.#declaration.anchorReplicaId &&
           row[COLUMN.IDENTITY_RIGHT] !== STATE.TRANSFERRED)) {
        throw originalAllocationError(REASON.INCOMPLETE, member.replicaId);
      }
    }
    this.#handoffComplete = true;
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
        admitted: false,
        db: null,
        assertCurrent: () => this.#assertCurrent(),
        validate: (request, final) =>
          this.#validateOpeningRequest(member, request, final),
      });
      this.#openings.set(replicaId, opening);
    }
    return this.#openings.get(replicaId);
  }

  // Queueing is admission, not consumption. Return owned options carrying the
  // same exact token that the real service must consume at native opening.
  admitReplica(options) {
    this.#assertCurrent();
    const owned = {...options};
    const opening = this.openingFor(owned.replicaId);
    const member = this.#declaration.members.find((entry) =>
      entry.replicaId === owned.replicaId);
    const groupBinding = member.serviceType === SERVICE_TYPE.PARTITION ?
      {partitionId: member.groupId, tableName: member.tableName} : {groupId: member.groupId};
    const peerAddresses = originalSeedPeerAddresses(this.#declaration.nodeId,
      member.serviceType, member.replicaIds);
    const schema = member.serviceType === SERVICE_TYPE.PARTITION ?
      deepFreeze(structuredClone(getSchemaByTableName(member.tableName))) : undefined;
    const required = {...groupBinding, serviceType: member.serviceType,
      replicaIds: member.replicaIds, peerAddresses};
    if (!Object.entries(required).every(([field, value]) =>
      isDeepStrictEqual(owned[field], value)) ||
        (owned.dbPath !== undefined && path.resolve(owned.dbPath) !== member.dbPath) ||
        (owned.schema !== undefined && !isDeepStrictEqual(owned.schema, schema)) ||
        (owned.originalAllocationOpening !== undefined &&
          owned.originalAllocationOpening !== opening)) {
      throw originalAllocationError(REASON.IDENTITY, member.replicaId);
    }
    if (owned.deferElection !== true) {
      throw originalAllocationError(REASON.CONTINUATION_UNAVAILABLE, member.replicaId);
    }
    const admitted = Object.freeze({...owned,
      dbPath: member.dbPath,
      replicaIds: member.replicaIds,
      peerAddresses,
      schema,
      bootstrapMembership: member.membership,
      identityExisted: this.#openingMode === STATE.COLD_RECOVERY,
      originalAllocationOpening: opening});
    this.#assertCurrent();
    originalOpenings.get(opening).admitted = true;
    return admitted;
  }

  #assertCurrent() {
    // Keep revocation and actual directory custody at the existing owner.
    // Do not route authority through a replaceable public instance method.
    if (this.#closed) throw originalAllocationError(REASON.CLOSED);
    if (!ownsDataDirectoryProcessOwner(this.#directoryOwner, this.#dataDir)) {
      throw originalAllocationError(REASON.DIRECTORY);
    }
  }

  #validateOpeningRequest(member, request, final) {
    this.#assertCurrent();
    if (this.#openingValidationActive) throw originalAllocationError(REASON.REENTRANT);
    this.#openingValidationActive = true;
    try {
      this.#validateMemberOpening(member, request, final);
    } finally {
      this.#openingValidationActive = false;
    }
  }

  #validateMemberOpening(member, request, final) {
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
          const record = deepFreeze(inspectColdMember(
            observed, this.#declaration, member));
          if (final) {
            // Whole-cohort classification already preceded every writable
            // opening. Reclassify this member once at the final cut, not
            // before later caller getters can change its retained work.
            const assessment = this.#inspectApplicationHistory({db: observed,
              declaration: this.#declaration, member, record});
            this.#assertCurrent();
            if (assessment !== STATE.HISTORY_ACCEPTED || !isDeepStrictEqual(
              record, inspectColdMember(observed, this.#declaration, member))) {
              throw originalAllocationError(REASON.CONTRARY, member.replicaId);
            }
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
  consumeOriginalAllocationOpening, setOriginalAllocationRightObserver};
