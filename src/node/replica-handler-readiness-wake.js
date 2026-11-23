// Event-driven wake for ReplicaHandler learner-admission and voter-readiness
// loops. Keeps VOTER_READY_CHECK_INTERVAL_MS as the bounded fallback timeout
// while waking immediately on Raft consensus events, admission settlement,
// service lifecycle changes, or SERVICES cache updates.
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {PARTITION_SERVICE_EVENT} from '../partition/partition-service-constants.js';

function startWakeTimer(handler, delayMs, onTimeout) {
  if (handler?.timeSource?.setTimeout) {
    return handler.timeSource.setTimeout(onTimeout, delayMs);
  }
  return setTimeout(onTimeout, delayMs);
}

function stopWakeTimer(handler, timerId) {
  if (timerId === null || timerId === undefined) return;
  if (handler?.timeSource?.clearTimeout) {
    handler.timeSource.clearTimeout(timerId);
  } else {
    clearTimeout(timerId);
  }
}

function subscribeConsensusWake(handler, replicaId, wake) {
  const unsub = handler?.consensusEvents?.subscribe?.((event) => {
    if (event?.replicaId === replicaId) wake();
  });
  return unsub ?? null;
}

function subscribeLocalServiceWake(handler, replicaId, wake) {
  const unsub = handler?.localServices?.subscribeServiceChanges?.((event) => {
    if (event?.replicaId === replicaId) wake();
  });
  return unsub ?? null;
}

function subscribeServicesCacheWake(handler, replicaId, watchServicesCache, wake) {
  const cache = watchServicesCache ? handler?.systemTableCache : null;
  if (!cache?.onCacheChange || !cache?.offCacheChange) {
    return null;
  }
  const listener = (tableName, _op, row) => {
    if (tableName === SYSTEM_TABLE_NAME.SERVICES && row?.service_id === replicaId) {
      wake();
    }
  };
  cache.onCacheChange(listener);
  return () => cache.offCacheChange(listener);
}

function subscribeServiceEventsWake(service, wake) {
  if (!service?.on || !service?.off) {
    return null;
  }
  service.on(PARTITION_SERVICE_EVENT.REPLICA_ADMISSION_SETTLED, wake);
  service.on(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED, wake);
  return () => {
    service.off(PARTITION_SERVICE_EVENT.REPLICA_ADMISSION_SETTLED, wake);
    service.off(PARTITION_SERVICE_EVENT.SHUTDOWN_STARTED, wake);
  };
}

function waitForReadinessEventOrTimeout(
  handler,
  replicaId,
  service,
  delayMs,
  options = {},
) {
  const {watchServicesCache = false} = options;
  return new Promise((resolve) => {
    let settled = false;
    let timerId = null;
    const cleanups = [];
    const wake = () => {
      if (settled) return;
      settled = true;
      stopWakeTimer(handler, timerId);
      timerId = null;
      for (const cleanup of cleanups) cleanup();
      resolve();
    };
    const stopConsensus = subscribeConsensusWake(handler, replicaId, wake);
    if (stopConsensus) cleanups.push(stopConsensus);
    const stopLocalService = subscribeLocalServiceWake(handler, replicaId, wake);
    if (stopLocalService) cleanups.push(stopLocalService);
    const stopCache = subscribeServicesCacheWake(
      handler, replicaId, watchServicesCache, wake);
    if (stopCache) cleanups.push(stopCache);
    const stopService = subscribeServiceEventsWake(service, wake);
    if (stopService) cleanups.push(stopService);
    timerId = startWakeTimer(handler, delayMs, wake);
  });
}

export {waitForReadinessEventOrTimeout};
