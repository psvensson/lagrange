/**
 * Canonical owner of physical storage-incarnation custody for retained SQLite
 * read-view handles. Tracks active and closing-failed readers against exact
 * storage-handle incarnations and fences shutdown, sidecar unlink, and
 * snapshot replacement until acknowledged closure succeeds.
 */

import path from 'node:path';

const MEMORY_DB_PATH = ':memory:';
const INCARNATION_PREFIX = 'inc';
const INCARNATION_SEP = ':';
const KEY_SEP = '|';
const NO_EXPLICIT_VALUE = 'none';
const DEFAULT_END_REASON = 'storage_ended';
const DEFAULT_CLOSE_FAILED_MSG = 'close_failed';
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
  QUERY_READ_VIEW: 'query_read_view',
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
        CUSTODY_ERROR_CODE.CUSTODY_BLOCKED,
        ERR_MSG_REGISTRATION_REQUIRED,
      );
    }
    if (!this.isIncarnationCurrent(entry.incarnation)) {
      throw new RetainedReadViewCustodyError(
        CUSTODY_ERROR_CODE.INCARNATION_ENDED,
        ERR_MSG_INCARNATION_ENDED,
        {
          dbPath: entry.incarnation.dbPath,
          incarnationKey: entry.incarnation.incarnationKey,
        },
      );
    }
    const domain = entry.policyDomain ?
      entry.policyDomain :
      POLICY_DOMAIN.QUERY_READ_VIEW;
    const record = {
      closeHandler: entry.closeHandler,
      custodyState: CUSTODY_STATE.ACTIVE,
      dbPath: entry.incarnation.dbPath,
      incarnation: entry.incarnation,
      incarnationKey: entry.incarnation.incarnationKey,
      lastCloseError: DEFAULT_CLOSE_FAILED_MSG,
      policyDomain: domain,
      viewId: entry.viewId,
    };
    this.custodyEntries.set(entry.viewId, record);
    return record;
  }

  markCloseFailed(viewId, error) {
    const record = this.custodyEntries.get(viewId);
    if (!record) return false;
    record.custodyState = CUSTODY_STATE.CLOSING_FAILED;
    record.lastCloseError = error ?
      String(error.message || error) :
      DEFAULT_CLOSE_FAILED_MSG;
    return true;
  }

  unregister(viewId) {
    return this.custodyEntries.delete(viewId);
  }

  inspectDbPath(dbPath) {
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
  const dbPath = normalizeCustodyDbPath(
    resolveRawDbPath(partitionService, storeInstance),
  );
  const dbInstance = resolveDbHandle(partitionService, storeInstance);
  const storageIncarnationId = resolveExplicitIncarnationId(
    partitionService,
    storeInstance,
  );
  const checkpointGeneration = resolveExplicitCheckpointGen(
    partitionService,
    storeInstance,
  );
  const storeObjId = CUSTODY_REGISTRY.assignObjectId(storeInstance);
  const dbObjId = CUSTODY_REGISTRY.assignObjectId(dbInstance);
  const serviceObjId = CUSTODY_REGISTRY.assignObjectId(partitionService);
  const handleToken = storeInstance || dbInstance ?
    `${storeObjId}${INCARNATION_SEP}${dbObjId}` :
    serviceObjId;
  const incarnationKey = [
    dbPath ?? MEMORY_DB_PATH,
    storageIncarnationId ?? NO_EXPLICIT_VALUE,
    checkpointGeneration ?? NO_EXPLICIT_VALUE,
    handleToken,
  ].join(KEY_SEP);
  const isShutdown = isIncarnationShutdown(
    partitionService,
    storeInstance,
    dbInstance,
  );
  return Object.freeze({
    checkpointGeneration,
    dbInstance,
    dbObjId,
    dbPath,
    incarnationKey,
    isShutdown,
    serviceObjId,
    storageIncarnationId,
    storeInstance,
    storeObjId,
  });
}

function matchesIncarnationTarget(entry, incarnation) {
  if (entry.incarnationKey === incarnation.incarnationKey) {
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

export {
  CUSTODY_ERROR_CODE,
  CUSTODY_STATE,
  POLICY_DOMAIN,
  RetainedReadViewCustodyError,
  assertStorageArtifactsUnlinkSafe,
  endStorageIncarnationCustody,
  inspectDbPathCustody,
  isIncarnationAdmissible,
  markCustodyCloseFailed,
  mintStorageIncarnationId,
  normalizeCustodyDbPath,
  registerRetainedReaderCustody,
  resolveStorageIncarnation,
  unregisterRetainedReaderCustody,
};

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

function unregisterRetainedReaderCustody(viewId) {
  return CUSTODY_REGISTRY.unregister(viewId);
}

function inspectDbPathCustody(dbPath) {
  return CUSTODY_REGISTRY.inspectDbPath(dbPath);
}

function endStorageIncarnationCustody(target, reason) {
  return CUSTODY_REGISTRY.endIncarnation(target, reason);
}
