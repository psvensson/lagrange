import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const ADMIN_CACHE_OWNER_SNAPSHOT_MAX_ATTEMPTS = 2;
const ADMIN_CACHE_OWNER_SNAPSHOT_WAIT = Object.freeze({
  wait: 'ADMIN_CACHE_OWNER_SNAPSHOT_MAX_ATTEMPTS',
  awaited: 'a snapshot built under one unchanged cache owner',
});
const ADMIN_CACHE_OWNER_CHANGED_DURING_SNAPSHOT_ERROR =
  'Admin cache owner changed repeatedly while building a snapshot';

function initializeAdminCacheOwnerState(
  owner,
  systemTableCache,
  cacheMutationTarget,
) {
  owner.systemTableCache = systemTableCache || null;
  owner.cacheMutationTarget = cacheMutationTarget || null;
  owner.cacheOwnerGeneration = 0;
}

function transitionAdminCacheOwner(
  owner,
  systemTableCache,
  cacheMutationTarget,
) {
  if (
    owner.systemTableCache === systemTableCache &&
    owner.cacheMutationTarget === cacheMutationTarget
  ) {
    return false;
  }
  owner.systemTableCache = systemTableCache;
  owner.cacheMutationTarget = cacheMutationTarget;
  owner.cacheOwnerGeneration += 1;
  return true;
}

function captureAdminCacheOwner(owner) {
  return Object.freeze({
    generation: owner.cacheOwnerGeneration,
    systemTableCache: owner.systemTableCache,
    cacheMutationTarget: owner.cacheMutationTarget,
  });
}

function isCurrentAdminCacheOwner(owner, cacheOwner) {
  return Boolean(
    cacheOwner &&
    cacheOwner.generation === owner.cacheOwnerGeneration &&
    cacheOwner.systemTableCache === owner.systemTableCache &&
    cacheOwner.cacheMutationTarget === owner.cacheMutationTarget,
  );
}

async function resolveAdminCacheOwnerSnapshot(
  owner,
  buildSnapshotAttempt,
  staleOwnerMessage,
) {
  const startedAtMs = Date.now();
  for (
    let attempt = 0;
    attempt < ADMIN_CACHE_OWNER_SNAPSHOT_MAX_ATTEMPTS;
    attempt += 1
  ) {
    const cacheOwner = captureAdminCacheOwner(owner);
    let snapshot;
    try {
      snapshot = await buildSnapshotAttempt(cacheOwner);
    } catch (error) {
      if (isCurrentAdminCacheOwner(owner, cacheOwner)) {
        throw error;
      }
      continue;
    }
    if (isCurrentAdminCacheOwner(owner, cacheOwner)) {
      return snapshot;
    }
  }
  reportWaitBoundSpent(owner.logger, {
    ...ADMIN_CACHE_OWNER_SNAPSHOT_WAIT,
    boundMs: null,
    startedAtMs,
    lastObserved: {
      attempts: ADMIN_CACHE_OWNER_SNAPSHOT_MAX_ATTEMPTS,
      cacheOwnerGeneration: owner.cacheOwnerGeneration,
    },
    scope: {nodeId: owner.nodeId ?? null},
  });
  throw new Error(staleOwnerMessage);
}

class AdminCacheOwnerState {
  constructor(systemTableCache = null, cacheMutationTarget = null) {
    initializeAdminCacheOwnerState(
      this,
      systemTableCache,
      cacheMutationTarget,
    );
  }

  setCacheOwner(systemTableCache, cacheMutationTarget) {
    return transitionAdminCacheOwner(
      this,
      systemTableCache,
      cacheMutationTarget,
    );
  }

  captureCacheOwner() {
    return captureAdminCacheOwner(this);
  }

  isCurrentCacheOwner(cacheOwner) {
    return isCurrentAdminCacheOwner(this, cacheOwner);
  }

  resolveCacheOwnerSnapshot(buildSnapshotAttempt) {
    return resolveAdminCacheOwnerSnapshot(
      this,
      buildSnapshotAttempt,
      ADMIN_CACHE_OWNER_CHANGED_DURING_SNAPSHOT_ERROR,
    );
  }
}

export {AdminCacheOwnerState};
