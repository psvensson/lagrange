// Private lifecycle authority for CDC coverage reconciliation. Observations are
// capabilities only for this module: callers can retain and compare them, but
// cannot construct a live token or revive a retired service.

import {randomUUID} from 'node:crypto';

const liveServices = new WeakMap();
const CDC_COVERAGE_LIFECYCLE_CLEANUP_FAILURE =
  'CDC coverage lifecycle cleanup failed';

function registerCdcCoverageLifecycle(service) {
  const current = liveServices.get(service);
  if (current) return current.token;
  const token = Object.freeze({});
  liveServices.set(service, {token, incarnation: randomUUID(),
    cleanups: new Set()});
  return token;
}

function captureCdcCoverageToken(service) {
  const current = liveServices.get(service);
  if (!current || service?.isShuttingDown === true) return null;
  return Object.freeze({service, token: current.token,
    lifecycleIncarnation: current.incarnation,
    systemTableCache: service.systemTableCache,
    cacheMutationTarget: service.cacheMutationTarget});
}

function isCurrentCdcCoverageLifecycle(observation) {
  const service = observation?.service;
  const current = service && liveServices.get(service);
  return Boolean(current && service.isShuttingDown !== true &&
    current.token === observation.token &&
    service.systemTableCache === observation.systemTableCache &&
    service.cacheMutationTarget === observation.cacheMutationTarget);
}

function registerCdcCoverageLifecycleCleanup(service, cleanup) {
  const current = liveServices.get(service);
  if (!current || typeof cleanup !== 'function' ||
      service?.isShuttingDown === true) return () => {};
  current.cleanups.add(cleanup);
  return () => current.cleanups.delete(cleanup);
}

function retireCdcCoverageLifecycle(service) {
  const current = liveServices.get(service);
  if (!current) return false;
  liveServices.delete(service);
  const cleanups = [...current.cleanups];
  current.cleanups.clear();
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (error) {
      service.logger?.warn?.(CDC_COVERAGE_LIFECYCLE_CLEANUP_FAILURE,
        {error: error?.message || String(error)});
    }
  }
  return true;
}

export {
  captureCdcCoverageToken,
  isCurrentCdcCoverageLifecycle,
  registerCdcCoverageLifecycle,
  registerCdcCoverageLifecycleCleanup,
  retireCdcCoverageLifecycle,
};
