const ADMIN_CACHE_OWNER_SNAPSHOT_MAX_ATTEMPTS = 2;
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
