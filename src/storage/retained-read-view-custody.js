/**
 * Canonical owner of physical storage-incarnation custody for retained SQLite
 * read-view handles. Tracks active and closing-failed readers against exact
 * storage-handle incarnations and fences shutdown, sidecar unlink, and
 * snapshot replacement until acknowledged closure succeeds.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {RAFT_RS_TABLE} from '../raft/raft-rs-durable-store-constants.js';
import {getPartitionDbPath} from './data-directory-manager.js';
import {sqliteConnectionState} from './sqlite-connection-state.js';

const MEMORY_DB_PATH = ':memory:';
const SELECT_HARD_STATE_TERM_SQL =
  `SELECT term FROM ${RAFT_RS_TABLE.HARD_STATE} WHERE group_id = ?`;
const NO_SUCH_HARD_STATE_TABLE_FRAGMENT = `no such table: ${RAFT_RS_TABLE.HARD_STATE}`;
const INCARNATION_PREFIX = 'inc';
const TERM_READER_VIEW_PREFIX = 'term-rv';
const INCARNATION_SEP = ':';
const KEY_SEP = '|';
const NO_EXPLICIT_VALUE = 'none';
const DEFAULT_END_REASON = 'storage_ended';
const DEFAULT_TERM_READER_RETIRE_REASON = 'term_reader_retired';
const DEFAULT_CLOSE_FAILED_MSG = 'close_failed';
const SQL_ROLLBACK = 'ROLLBACK';
const SELF_LEADER_TERM_READ_UNAVAILABLE_LOG =
  'Failed closed reading local durable Raft term for self-published leader probe';
const TERM_READER_RETIRE_REASON = Object.freeze({
  CAPACITY_EVICTION: 'capacity_eviction',
  OBSERVER_RESET: 'observer_reset',
  READ_ERROR: 'read_error',
  SAME_PATH_RECREATION: 'same_path_recreation',
  STORAGE_ABSENT: 'storage_absent',
});
const DEFAULT_MAX_TERM_READERS = 256;
const ZERO_BIGINT = 0n;
const MAX_SAFE_TERM_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const CUSTODY_ERROR_NAME = 'RetainedReadViewCustodyError';
const ERR_MSG_REGISTRATION_REQUIRED =
  'Retained reader registration requires viewId, storage incarnation, and closeHandler';
const ERR_MSG_INCARNATION_ENDED =
  'Cannot register retained reader against ended or closed storage incarnation';

const CUSTODY_STATE = Object.freeze({
  ACTIVE: 'active',
  CLOSED: 'closed',
  CLOSING_FAILED: 'closing_failed',
});

const POLICY_DOMAIN = Object.freeze({
  CDC_IMAGE: 'cdc_image',
  PERSISTED_TERM_READER: 'persisted_term_reader',
  QUERY_READ_VIEW: 'query_read_view',
});

const PERSISTED_TERM_STATE = Object.freeze({
  OBSERVED: 'observed',
  UNAVAILABLE: 'unavailable',
});

const PERSISTED_TERM_UNAVAILABLE_REASON = Object.freeze({
  CAPACITY_EXHAUSTED: 'capacity_exhausted',
  CUSTODY_CLOSE_FAILED: 'custody_close_failed',
  HARD_STATE_ABSENT: 'hard_state_absent',
  INVALID_IDENTITY: 'invalid_identity',
  READ_FAILED: 'read_failed',
  STORAGE_ABSENT: 'storage_absent',
});

const CUSTODY_ERROR_CODE = Object.freeze({
  CLOSE_FAILED: 'RETAINED_READ_VIEW_CLOSE_FAILED',
  CUSTODY_BLOCKED: 'RETAINED_READ_VIEW_CUSTODY_BLOCKED',
  INCARNATION_ENDED: 'RETAINED_READ_VIEW_INCARNATION_ENDED',
});

class RetainedReadViewCustodyError extends Error {
  /**
   * @param {string} code - Typed custody error code.
   * @param {string} message - Human-readable error message.
   * @param {Object} [details] - Custody context details.
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = CUSTODY_ERROR_NAME;
    this.code = code;
    this.dbPath = details.dbPath ?? null;
    this.activeViewIds = Object.freeze([...(details.activeViewIds || [])]);
    this.unclosedViewIds = Object.freeze([...(details.unclosedViewIds || [])]);
    this.incarnationKey = details.incarnationKey ?? null;
  }
}

class RetainedReadViewCustodyRegistry {
  constructor() {
    this.objectIds = new WeakMap();
    this.nextObjectSeq = 0;
    this.nextIncarnationSeq = 0;
    this.custodyEntries = new Map();
    this.endedIncarnations = new Set();
  }

  assignObjectId(target) {
    if (!target || typeof target !== 'object') {
      return NO_EXPLICIT_VALUE;
    }
    let assigned = this.objectIds.get(target);
    if (!assigned) {
      this.nextObjectSeq += 1;
      assigned = `obj-${this.nextObjectSeq}`;
      this.objectIds.set(target, assigned);
    }
    return assigned;
  }

  mintIncarnationId(scopeLabel = INCARNATION_PREFIX) {
    this.nextIncarnationSeq += 1;
    const label = typeof scopeLabel === 'string' && scopeLabel.length > 0 ?
      path.basename(scopeLabel) :
      INCARNATION_PREFIX;
    return `${INCARNATION_PREFIX}${INCARNATION_SEP}${label}${INCARNATION_SEP}${this.nextIncarnationSeq}`;
  }

  isIncarnationCurrent(incarnation) {
    if (!incarnation || incarnation.isShutdown) {
      return false;
    }
    return !this.endedIncarnations.has(incarnation.incarnationKey);
  }

  register(entry) {
    if (!entry || !entry.viewId || !entry.incarnation || !entry.closeHandler) {
      throw new RetainedReadViewCustodyError(
        CUSTODY_ERROR_CODE.CUSTODY_BLOCKED, ERR_MSG_REGISTRATION_REQUIRED);
    }
    if (!this.isIncarnationCurrent(entry.incarnation)) {
      throw new RetainedReadViewCustodyError(
        CUSTODY_ERROR_CODE.INCARNATION_ENDED, ERR_MSG_INCARNATION_ENDED,
        {dbPath: entry.incarnation.dbPath, incarnationKey: entry.incarnation.incarnationKey});
    }
    const domain = entry.policyDomain ? entry.policyDomain : POLICY_DOMAIN.QUERY_READ_VIEW;
    const record = {
      closeHandler: entry.closeHandler, custodyState: CUSTODY_STATE.ACTIVE,
      dbPath: entry.incarnation.dbPath, incarnation: entry.incarnation,
      incarnationKey: entry.incarnation.incarnationKey, lastCloseError: DEFAULT_CLOSE_FAILED_MSG,
      policyDomain: domain, viewId: entry.viewId,
    };
    this.custodyEntries.set(entry.viewId, record);
    return record;
  }

  markCloseFailed(viewId, error) {
    const record = this.custodyEntries.get(viewId);
    if (!record) return false;
    record.custodyState = CUSTODY_STATE.CLOSING_FAILED;
    record.lastCloseError = error ? String(error.message) : DEFAULT_CLOSE_FAILED_MSG;
    return true;
  }

  recordUnclosed(entry) {
    if (!entry || !entry.viewId || !entry.incarnation || !entry.closeHandler) {
      throw new RetainedReadViewCustodyError(
        CUSTODY_ERROR_CODE.CUSTODY_BLOCKED, ERR_MSG_REGISTRATION_REQUIRED);
    }
    const domain = entry.policyDomain ? entry.policyDomain : POLICY_DOMAIN.QUERY_READ_VIEW;
    const record = {
      closeHandler: entry.closeHandler, custodyState: CUSTODY_STATE.CLOSING_FAILED,
      dbPath: entry.incarnation.dbPath, incarnation: entry.incarnation,
      incarnationKey: entry.incarnation.incarnationKey,
      lastCloseError: entry.error ? String(entry.error.message) : DEFAULT_CLOSE_FAILED_MSG,
      policyDomain: domain, viewId: entry.viewId,
    };
    this.custodyEntries.set(entry.viewId, record);
    return record;
  }

  unregister(viewId) {
    return this.custodyEntries.delete(viewId);
  }

  closeIdleTermReadersForDbPath(normalizedDbPath, reason = DEFAULT_TERM_READER_RETIRE_REASON) {
    for (const entry of [...this.custodyEntries.values()]) {
      if (entry.dbPath === normalizedDbPath &&
          entry.policyDomain === POLICY_DOMAIN.PERSISTED_TERM_READER) {
        entry.closeHandler(reason);
      }
    }
  }

  inspectDbPath(dbPath, options = {}) {
    const normalized = normalizeCustodyDbPath(dbPath);
    const activeViewIds = [];
    const unclosedViewIds = [];
    if (!normalized) {
      return Object.freeze({
        activeViewIds: Object.freeze(activeViewIds),
        dbPath: null,
        hasLiveOrUnclosedReaders: false,
        unclosedViewIds: Object.freeze(unclosedViewIds),
      });
    }
    if (options.preserveIdleTermReaders !== true) {
      this.closeIdleTermReadersForDbPath(normalized);
    }
    for (const entry of this.custodyEntries.values()) {
      if (entry.dbPath !== normalized) continue;
      if (entry.custodyState === CUSTODY_STATE.CLOSING_FAILED) {
        unclosedViewIds.push(entry.viewId);
      } else if (entry.custodyState === CUSTODY_STATE.ACTIVE) {
        activeViewIds.push(entry.viewId);
      }
    }
    return Object.freeze({
      activeViewIds: Object.freeze(activeViewIds),
      dbPath: normalized,
      hasLiveOrUnclosedReaders:
        activeViewIds.length > 0 || unclosedViewIds.length > 0,
      unclosedViewIds: Object.freeze(unclosedViewIds),
    });
  }

  endIncarnation(target, reason = DEFAULT_END_REASON) {
    const incarnation = target?.incarnationKey ?
      target :
      resolveStorageIncarnation(target);
    this.endedIncarnations.add(incarnation.incarnationKey);
    const matching = [];
    for (const entry of this.custodyEntries.values()) {
      if (matchesIncarnationTarget(entry, incarnation)) {
        matching.push(entry);
      }
    }
    const closedViewIds = [];
    const unclosedViewIds = [];
    for (const entry of matching) {
      const closed = Boolean(entry.closeHandler(reason));
      if (closed && !this.custodyEntries.has(entry.viewId)) {
        closedViewIds.push(entry.viewId);
      } else {
        unclosedViewIds.push(entry.viewId);
      }
    }
    return Object.freeze({
      closedViewIds: Object.freeze(closedViewIds),
      dbPath: incarnation.dbPath,
      incarnationKey: incarnation.incarnationKey,
      ok: unclosedViewIds.length === 0,
      outcome: unclosedViewIds.length === 0 ?
        DEFAULT_END_REASON :
        CUSTODY_ERROR_CODE.CLOSE_FAILED,
      unclosedViewIds: Object.freeze(unclosedViewIds),
    });
  }
}

const CUSTODY_REGISTRY = new RetainedReadViewCustodyRegistry();

function normalizeCustodyDbPath(dbPath) {
  if (typeof dbPath !== 'string' || dbPath.length === 0 || dbPath === MEMORY_DB_PATH) {
    return null;
  }
  return path.resolve(dbPath);
}

function resolveStoreContainer(partitionService) {
  if (!partitionService) return null;
  if (partitionService.store) return partitionService.store;
  if (partitionService.storageBackend) return partitionService.storageBackend;
  return null;
}

function resolveRawDbPath(partitionService, storeContainer) {
  if (storeContainer?.dbPath) return storeContainer.dbPath;
  if (partitionService?.dbPath) return partitionService.dbPath;
  return null;
}

function resolveDbHandle(partitionService, storeContainer) {
  if (storeContainer?.db) return storeContainer.db;
  if (partitionService?.db) return partitionService.db;
  return null;
}

function resolveExplicitIncarnationId(partitionService, storeContainer) {
  if (storeContainer?.storageIncarnationId !== undefined &&
      storeContainer.storageIncarnationId !== null) {
    return storeContainer.storageIncarnationId;
  }
  if (partitionService?.storageIncarnationId !== undefined &&
      partitionService.storageIncarnationId !== null) {
    return partitionService.storageIncarnationId;
  }
  return null;
}

function resolveExplicitCheckpointGen(partitionService, storeContainer) {
  if (storeContainer?.checkpointGeneration !== undefined &&
      storeContainer.checkpointGeneration !== null) {
    return storeContainer.checkpointGeneration;
  }
  if (partitionService?.checkpointGeneration !== undefined &&
      partitionService.checkpointGeneration !== null) {
    return partitionService.checkpointGeneration;
  }
  return null;
}

function isIncarnationShutdown(partitionService, storeInstance, dbInstance) {
  if (partitionService?.isShutdown === true) return true;
  if (storeInstance?.closed === true) return true;
  return Boolean(dbInstance && dbInstance.open === false);
}

function resolveStorageIncarnation(partitionService) {
  const storeInstance = resolveStoreContainer(partitionService);
  const dbPath = normalizeCustodyDbPath(resolveRawDbPath(partitionService, storeInstance));
  const dbInstance = resolveDbHandle(partitionService, storeInstance);
  const storageIncarnationId = resolveExplicitIncarnationId(partitionService, storeInstance);
  const checkpointGeneration = resolveExplicitCheckpointGen(partitionService, storeInstance);
  const storeObjId = CUSTODY_REGISTRY.assignObjectId(storeInstance);
  const dbObjId = CUSTODY_REGISTRY.assignObjectId(dbInstance);
  const serviceObjId = CUSTODY_REGISTRY.assignObjectId(partitionService);
  const handleToken = storeInstance || dbInstance ?
    `${storeObjId}${INCARNATION_SEP}${dbObjId}` : serviceObjId;
  const incarnationKey = [
    dbPath ?? MEMORY_DB_PATH,
    storageIncarnationId ?? NO_EXPLICIT_VALUE,
    checkpointGeneration ?? NO_EXPLICIT_VALUE,
    handleToken,
  ].join(KEY_SEP);
  const isShutdown = isIncarnationShutdown(partitionService, storeInstance, dbInstance);
  return Object.freeze({
    checkpointGeneration, dbInstance, dbObjId, dbPath, incarnationKey,
    isShutdown, serviceObjId, storageIncarnationId, storeInstance, storeObjId,
  });
}

function matchesIncarnationTarget(entry, incarnation) {
  if (entry.incarnationKey === incarnation.incarnationKey) {
    return true;
  }
  if (entry.policyDomain === POLICY_DOMAIN.PERSISTED_TERM_READER &&
      incarnation.dbPath !== null &&
      entry.dbPath === incarnation.dbPath) {
    return true;
  }
  if (incarnation.storageIncarnationId !== null &&
      entry.incarnation.storageIncarnationId === incarnation.storageIncarnationId &&
      entry.dbPath === incarnation.dbPath) {
    return true;
  }
  return incarnation.dbObjId !== NO_EXPLICIT_VALUE &&
    entry.incarnation.dbObjId === incarnation.dbObjId;
}

function assertStorageArtifactsUnlinkSafe(dbPath) {
  const inspection = CUSTODY_REGISTRY.inspectDbPath(dbPath);
  if (inspection.hasLiveOrUnclosedReaders) {
    throw new RetainedReadViewCustodyError(
      CUSTODY_ERROR_CODE.CUSTODY_BLOCKED,
      `Storage replacement or sidecar removal refused while retained readers remain open on ${inspection.dbPath}`,
      inspection,
    );
  }
  return inspection;
}

function parsePositiveSafeTerm(value) {
  if (typeof value === 'bigint') {
    if (value <= ZERO_BIGINT || value > MAX_SAFE_TERM_BIGINT) {
      return null;
    }
    return Number(value);
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function defaultReadPersistedTermInDb(db, partitionId) {
  const row = sqliteConnectionState(db)
    .exactStatement(SELECT_HARD_STATE_TERM_SQL)
    .get(partitionId);
  return parsePositiveSafeTerm(row?.term);
}

function isMissingHardStateTableError(error) {
  const message = String(error?.message || '');
  return message.includes(NO_SUCH_HARD_STATE_TABLE_FRAGMENT);
}

function defaultOpenTermReaderDb(dbPath) {
  return new Database(dbPath, {readonly: true, fileMustExist: true});
}

function defaultCloseTermReaderDb(db) {
  if (db && db.open) {
    if (db.inTransaction) {
      db.exec(SQL_ROLLBACK);
    }
    db.close();
  }
  return !db || db.open !== true;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function resolveCandidatePaths(identity, partitionId, replicaId) {
  const fromDataDir = isNonEmptyString(identity.dataDir) ?
    normalizeCustodyDbPath(getPartitionDbPath(identity.dataDir, partitionId, replicaId)) :
    null;
  const explicit = isNonEmptyString(identity.dbPath) ?
    normalizeCustodyDbPath(identity.dbPath) :
    null;
  if (fromDataDir && explicit && fromDataDir !== explicit) {
    return null;
  }
  return explicit ?? fromDataDir;
}

function resolveExactReplicaDbPath(identity) {
  if (!identity) return null;
  const {partitionId, replicaId} = identity;
  if (!isNonEmptyString(partitionId) || !isNonEmptyString(replicaId)) {
    return null;
  }
  return resolveCandidatePaths(identity, partitionId, replicaId);
}

function statDbFileIdentity(dbPath) {
  const dbStat = fs.statSync(dbPath, {bigint: true, throwIfNoEntry: false});
  if (!dbStat) {
    return null;
  }
  return Object.freeze({
    dev: dbStat.dev,
    ino: dbStat.ino,
  });
}

function isTermReaderEntryCurrent(entry, fileStat, partitionId, replicaId) {
  if (!entry || entry.db?.open !== true) return false;
  return entry.partitionId === partitionId &&
    entry.replicaId === replicaId &&
    entry.dev === fileStat.dev &&
    entry.ino === fileStat.ino;
}

function executeTermReaderClose(entry, closeDatabase) {
  let closed = false;
  let error = null;
  try {
    closed = Boolean(closeDatabase(entry.db));
  } catch (err) {
    error = err;
    closed = false;
  }
  return {closed, error};
}

function buildUnavailableTermOutcome(reason, details = {}) {
  return Object.freeze({
    dbPath: details.dbPath ?? null,
    ...(details.errorMessage ? {errorMessage: details.errorMessage} : {}),
    ...(details.handleId ? {handleId: details.handleId} : {}),
    partitionId: details.partitionId ?? null,
    reason,
    replicaId: details.replicaId ?? null,
    state: PERSISTED_TERM_STATE.UNAVAILABLE,
    term: null,
  });
}

function createPersistedPartitionTermObserver(options = {}) {
  const custodyRegistry = options.custodyRegistry || CUSTODY_REGISTRY;
  const maxReaders = Number.isSafeInteger(options.maxReaders) && options.maxReaders > 0 ?
    options.maxReaders :
    DEFAULT_MAX_TERM_READERS;
  const openDatabase = options.openDatabase || defaultOpenTermReaderDb;
  const closeDatabase = options.closeDatabase || defaultCloseTermReaderDb;
  const readTermInDb = options.readTermInDb || defaultReadPersistedTermInDb;
  const activeReaders = new Map();
  const unclosedReaders = new Map();
  let readerSeq = 0;
  let openCount = 0;
  let preparedQueryCount = 0;
  let closeFailureCount = 0;

  function settleReaderClosure(entry, reason) {
    const result = executeTermReaderClose(entry, closeDatabase);
    if (!result.closed) {
      closeFailureCount += 1;
      entry.custodyState = CUSTODY_STATE.CLOSING_FAILED;
      entry.invalidationReason = reason;
      activeReaders.delete(entry.dbPath);
      unclosedReaders.set(entry.viewId, entry);
      if (!custodyRegistry.markCloseFailed(entry.viewId, result.error)) {
        custodyRegistry.recordUnclosed({
          closeHandler: (nextReason) => settleReaderClosure(entry, nextReason),
          error: result.error,
          incarnation: entry.incarnation,
          policyDomain: POLICY_DOMAIN.PERSISTED_TERM_READER,
          viewId: entry.viewId,
        });
      }
      return false;
    }
    entry.custodyState = CUSTODY_STATE.CLOSED;
    activeReaders.delete(entry.dbPath);
    unclosedReaders.delete(entry.viewId);
    custodyRegistry.unregister(entry.viewId);
    return true;
  }

  function hasUnclosedReaderForPath(normalizedDbPath) {
    let blocked = false;
    for (const entry of [...unclosedReaders.values()]) {
      if (entry.dbPath !== normalizedDbPath) continue;
      if (!settleReaderClosure(entry, DEFAULT_TERM_READER_RETIRE_REASON)) {
        blocked = true;
      }
    }
    return blocked;
  }

  function retryAllUnclosedReaders() {
    for (const entry of [...unclosedReaders.values()]) {
      settleReaderClosure(entry, DEFAULT_TERM_READER_RETIRE_REASON);
    }
  }

  function ensureReaderCapacity() {
    if (activeReaders.size + unclosedReaders.size >= maxReaders) {
      retryAllUnclosedReaders();
    }
    for (const oldest of [...activeReaders.values()]) {
      if (activeReaders.size + unclosedReaders.size < maxReaders) {
        return true;
      }
      settleReaderClosure(oldest, TERM_READER_RETIRE_REASON.CAPACITY_EVICTION);
    }
    return activeReaders.size + unclosedReaders.size < maxReaders;
  }

  function openAndRegisterReader(normalizedDbPath, fileStat, partitionId, replicaId) {
    const db = openDatabase(normalizedDbPath);
    openCount += 1;
    readerSeq += 1;
    const viewId = `${TERM_READER_VIEW_PREFIX}:${partitionId}:${replicaId}:${readerSeq}`;
    const incarnation = resolveStorageIncarnation({
      db, dbPath: normalizedDbPath,
      storageIncarnationId: custodyRegistry.mintIncarnationId(normalizedDbPath),
    });
    const entry = {
      custodyState: CUSTODY_STATE.ACTIVE, db, dbPath: normalizedDbPath,
      dev: fileStat.dev, incarnation, ino: fileStat.ino, invalidationReason: null,
      openOrder: readerSeq, partitionId, replicaId, viewId,
    };
    custodyRegistry.register({
      closeHandler: (reason) => settleReaderClosure(entry, reason),
      incarnation, policyDomain: POLICY_DOMAIN.PERSISTED_TERM_READER, viewId,
    });
    activeReaders.set(normalizedDbPath, entry);
    return entry;
  }

  function resolveOrOpenReader(normalizedDbPath, fileStat, partitionId, replicaId) {
    const existing = activeReaders.get(normalizedDbPath);
    if (existing) {
      if (isTermReaderEntryCurrent(existing, fileStat, partitionId, replicaId)) {
        activeReaders.delete(normalizedDbPath);
        activeReaders.set(normalizedDbPath, existing);
        return {entry: existing};
      }
      if (!settleReaderClosure(existing, TERM_READER_RETIRE_REASON.SAME_PATH_RECREATION)) {
        return {
          entry: null,
          unavailableReason: PERSISTED_TERM_UNAVAILABLE_REASON.CUSTODY_CLOSE_FAILED,
        };
      }
    }
    if (!ensureReaderCapacity()) {
      return {
        entry: null,
        unavailableReason: PERSISTED_TERM_UNAVAILABLE_REASON.CAPACITY_EXHAUSTED,
      };
    }
    return {
      entry: openAndRegisterReader(normalizedDbPath, fileStat, partitionId, replicaId),
    };
  }

  function invalidatePath(dbPath, reason = DEFAULT_TERM_READER_RETIRE_REASON) {
    const normalized = normalizeCustodyDbPath(dbPath);
    if (!normalized) return true;
    const active = activeReaders.get(normalized);
    const activeClosed = !active || settleReaderClosure(active, reason);
    const unclosedBlocked = hasUnclosedReaderForPath(normalized);
    custodyRegistry.closeIdleTermReadersForDbPath(normalized, reason);
    return activeClosed && !unclosedBlocked;
  }

  function invalidatePartition(dataDir, partitionId, reason = DEFAULT_TERM_READER_RETIRE_REASON) {
    let allClosed = true;
    for (const entry of [...activeReaders.values(), ...unclosedReaders.values()]) {
      if (entry.partitionId === partitionId && !settleReaderClosure(entry, reason)) {
        allClosed = false;
      }
    }
    return allClosed;
  }

  function queryReaderTerm(entry, normalizedDbPath, partitionId, replicaId) {
    preparedQueryCount += 1;
    let rawTerm = null;
    try {
      rawTerm = readTermInDb(entry.db, partitionId);
    } catch (queryErr) {
      if (isMissingHardStateTableError(queryErr)) {
        return buildUnavailableTermOutcome(
          PERSISTED_TERM_UNAVAILABLE_REASON.HARD_STATE_ABSENT,
          {dbPath: normalizedDbPath, handleId: entry.viewId, partitionId, replicaId},
        );
      }
      throw queryErr;
    }
    const term = parsePositiveSafeTerm(rawTerm);
    return term !== null ?
      Object.freeze({
        dbPath: normalizedDbPath, handleId: entry.viewId, partitionId,
        replicaId, state: PERSISTED_TERM_STATE.OBSERVED, term,
      }) :
      buildUnavailableTermOutcome(PERSISTED_TERM_UNAVAILABLE_REASON.HARD_STATE_ABSENT, {
        dbPath: normalizedDbPath, handleId: entry.viewId, partitionId, replicaId,
      });
  }

  function handleTermObservationError(entry, error, normalizedDbPath, identity) {
    if (entry) settleReaderClosure(entry, TERM_READER_RETIRE_REASON.READ_ERROR);
    const errorMessage = String(error?.message || error);
    const {partitionId = null, replicaId = null} = identity || {};
    identity?.logger?.debug?.(
      SELF_LEADER_TERM_READ_UNAVAILABLE_LOG,
      {dbPath: normalizedDbPath, error: errorMessage, partitionId, replicaId});
    return buildUnavailableTermOutcome(PERSISTED_TERM_UNAVAILABLE_REASON.READ_FAILED, {
      dbPath: normalizedDbPath, errorMessage, partitionId, replicaId,
    });
  }

  function checkPreOpenAvailability(normalizedDbPath, partitionId, replicaId) {
    if (!normalizedDbPath) {
      return {fileStat: null, unavailable: buildUnavailableTermOutcome(
        PERSISTED_TERM_UNAVAILABLE_REASON.INVALID_IDENTITY, {partitionId, replicaId})};
    }
    if (hasUnclosedReaderForPath(normalizedDbPath)) {
      return {fileStat: null, unavailable: buildUnavailableTermOutcome(
        PERSISTED_TERM_UNAVAILABLE_REASON.CUSTODY_CLOSE_FAILED,
        {dbPath: normalizedDbPath, partitionId, replicaId})};
    }
    const fileStat = statDbFileIdentity(normalizedDbPath);
    if (!fileStat) {
      invalidatePath(normalizedDbPath, TERM_READER_RETIRE_REASON.STORAGE_ABSENT);
      return {fileStat: null, unavailable: buildUnavailableTermOutcome(
        PERSISTED_TERM_UNAVAILABLE_REASON.STORAGE_ABSENT,
        {dbPath: normalizedDbPath, partitionId, replicaId})};
    }
    return {fileStat, unavailable: null};
  }

  function observePersistedPartitionTerm(exactReplicaIdentity) {
    const partitionId = exactReplicaIdentity?.partitionId ?? null;
    const replicaId = exactReplicaIdentity?.replicaId ?? null;
    const normalizedDbPath = resolveExactReplicaDbPath(exactReplicaIdentity);
    const preOpen = checkPreOpenAvailability(normalizedDbPath, partitionId, replicaId);
    if (preOpen.unavailable) {
      return preOpen.unavailable;
    }
    let entry = null;
    try {
      const acquired = resolveOrOpenReader(
        normalizedDbPath, preOpen.fileStat, partitionId, replicaId);
      if (!acquired.entry) {
        return buildUnavailableTermOutcome(acquired.unavailableReason, {
          dbPath: normalizedDbPath, partitionId, replicaId,
        });
      }
      entry = acquired.entry;
      return queryReaderTerm(entry, normalizedDbPath, partitionId, replicaId);
    } catch (error) {
      return handleTermObservationError(
        entry, error, normalizedDbPath, exactReplicaIdentity);
    }
  }

  function reset(reason = TERM_READER_RETIRE_REASON.OBSERVER_RESET) {
    for (const entry of [...activeReaders.values(), ...unclosedReaders.values()]) {
      settleReaderClosure(entry, reason);
    }
    openCount = 0;
    preparedQueryCount = 0;
  }

  function getRetainedReader(exactReplicaIdentity) {
    const normalizedDbPath = resolveExactReplicaDbPath(exactReplicaIdentity);
    return normalizedDbPath ? activeReaders.get(normalizedDbPath) || null : null;
  }

  function stats() {
    return Object.freeze({
      activeReaderCount: activeReaders.size,
      closeFailureCount,
      maxReaders,
      openCount,
      preparedQueryCount,
      retainedReaderCount: activeReaders.size + unclosedReaders.size,
      unclosedReaderCount: unclosedReaders.size,
    });
  }

  return Object.freeze({
    getRetainedReader,
    invalidatePartition,
    invalidatePath,
    observePersistedPartitionTerm,
    reset,
    stats,
  });
}

const DEFAULT_PERSISTED_TERM_OBSERVER = createPersistedPartitionTermObserver();

function observePersistedPartitionTerm(exactReplicaIdentity) {
  return DEFAULT_PERSISTED_TERM_OBSERVER.observePersistedPartitionTerm(exactReplicaIdentity);
}
function invalidatePersistedTermReadersForPath(dbPath, reason) {
  return DEFAULT_PERSISTED_TERM_OBSERVER.invalidatePath(dbPath, reason);
}
function invalidatePartitionPersistedTermReaders(dataDir, partitionId, reason) {
  return DEFAULT_PERSISTED_TERM_OBSERVER.invalidatePartition(dataDir, partitionId, reason);
}
function getRetainedPersistedTermReader(exactReplicaIdentity) {
  return DEFAULT_PERSISTED_TERM_OBSERVER.getRetainedReader(exactReplicaIdentity);
}
function getPersistedTermReaderStats() {
  return DEFAULT_PERSISTED_TERM_OBSERVER.stats();
}
function resetPersistedTermReaders(reason) {
  return DEFAULT_PERSISTED_TERM_OBSERVER.reset(reason);
}
function mintStorageIncarnationId(scopeLabel) {
  return CUSTODY_REGISTRY.mintIncarnationId(scopeLabel);
}
function isIncarnationAdmissible(incarnation) {
  return CUSTODY_REGISTRY.isIncarnationCurrent(incarnation);
}
function registerRetainedReaderCustody(entry) {
  return CUSTODY_REGISTRY.register(entry);
}
function markCustodyCloseFailed(viewId, error) {
  return CUSTODY_REGISTRY.markCloseFailed(viewId, error);
}
function recordUnclosedReaderCustody(entry) {
  return CUSTODY_REGISTRY.recordUnclosed(entry);
}
function unregisterRetainedReaderCustody(viewId) {
  return CUSTODY_REGISTRY.unregister(viewId);
}
function inspectDbPathCustody(dbPath, options) {
  return CUSTODY_REGISTRY.inspectDbPath(dbPath, options);
}
function endStorageIncarnationCustody(target, reason) {
  return CUSTODY_REGISTRY.endIncarnation(target, reason);
}

export {
  CUSTODY_ERROR_CODE, CUSTODY_STATE, PERSISTED_TERM_STATE,
  PERSISTED_TERM_UNAVAILABLE_REASON, POLICY_DOMAIN, RetainedReadViewCustodyError,
  assertStorageArtifactsUnlinkSafe, createPersistedPartitionTermObserver,
  endStorageIncarnationCustody, getPersistedTermReaderStats,
  getRetainedPersistedTermReader, inspectDbPathCustody,
  invalidatePartitionPersistedTermReaders, invalidatePersistedTermReadersForPath,
  isIncarnationAdmissible, markCustodyCloseFailed, mintStorageIncarnationId,
  normalizeCustodyDbPath, observePersistedPartitionTerm,
  recordUnclosedReaderCustody, registerRetainedReaderCustody,
  resetPersistedTermReaders, resolveStorageIncarnation,
  unregisterRetainedReaderCustody,
};
