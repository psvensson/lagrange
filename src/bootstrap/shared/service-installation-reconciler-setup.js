import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../system-table-schemas-constants.js';
import {
  ServiceInstallationReconciler,
  isServiceInstallCatalogOwnerCompatible,
} from '../../service/service-installation-reconciler.js';
import {resolveTimeSource} from '../../time/time-source.js';

const DEFAULT_SINK_WIRING_RETRY_INTERVAL_MS = 5_000;
const RETRY_TIMER_STATE = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});
const PARTITION_SERVICE_STATE = Object.freeze({
  ATTACHED: 'attached',
  UNRESOLVED: 'unresolved',
});
const INACTIVE_RETRY_TIMER = Object.freeze({
  state: RETRY_TIMER_STATE.INACTIVE,
});
const UNRESOLVED_PARTITION_SERVICE = Object.freeze({
  state: PARTITION_SERVICE_STATE.UNRESOLVED,
});
const PARTITION_SERVICE_UNAVAILABLE = null;
const RECONCILER_HANDLE_UNAVAILABLE = null;
const CATALOG_OWNER_UNAVAILABLE = null;
const LEADERSHIP_SINK_DETACHED = null;

function resolvePartitionServiceByPartitionId(partitionServices, partitionId) {
  if (!partitionServices || typeof partitionServices.values !== 'function') {
    return PARTITION_SERVICE_UNAVAILABLE;
  }
  for (const partitionService of partitionServices.values()) {
    if (partitionService?.partitionId === partitionId) return partitionService;
  }
  return PARTITION_SERVICE_UNAVAILABLE;
}

function attachServiceInstallationReconcilerOwner(options = {}) {
  const owner = new ServiceInstallationReconciler(options);
  const timeSource = resolveTimeSource(options);
  const partitionId =
    INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SERVICE_INSTALLATIONS];
  const retryIntervalMs =
    Number.isSafeInteger(options.sinkWiringRetryIntervalMs) &&
      options.sinkWiringRetryIntervalMs > 0 ?
      options.sinkWiringRetryIntervalMs :
      DEFAULT_SINK_WIRING_RETRY_INTERVAL_MS;
  let partitionServiceState = UNRESOLVED_PARTITION_SERVICE;
  let retryTimerState = INACTIVE_RETRY_TIMER;
  let detached = false;

  const tryWireSink = () => {
    if (detached) return false;
    if (partitionServiceState.state === PARTITION_SERVICE_STATE.ATTACHED) {
      return true;
    }
    const resolved = resolvePartitionServiceByPartitionId(
      options.partitionServices,
      partitionId,
    );
    if (typeof resolved?.setRebalancerLeadershipSink !== 'function') {
      return false;
    }
    partitionServiceState = {
      state: PARTITION_SERVICE_STATE.ATTACHED,
      service: resolved,
    };
    resolved.setRebalancerLeadershipSink(owner);
    if (retryTimerState.state === RETRY_TIMER_STATE.ACTIVE) {
      timeSource.clearInterval(retryTimerState.handle);
      retryTimerState = INACTIVE_RETRY_TIMER;
    }
    return true;
  };

  if (!tryWireSink()) {
    const handle = timeSource.setInterval(tryWireSink, retryIntervalMs);
    retryTimerState = {state: RETRY_TIMER_STATE.ACTIVE, handle};
    if (typeof handle?.unref === 'function') handle.unref();
  }

  return {
    owner,
    get partitionService() {
      return partitionServiceState.state === PARTITION_SERVICE_STATE.ATTACHED ?
        partitionServiceState.service :
        PARTITION_SERVICE_UNAVAILABLE;
    },
    detach() {
      if (detached) return;
      detached = true;
      if (retryTimerState.state === RETRY_TIMER_STATE.ACTIVE) {
        timeSource.clearInterval(retryTimerState.handle);
        retryTimerState = INACTIVE_RETRY_TIMER;
      }
      if (partitionServiceState.state === PARTITION_SERVICE_STATE.ATTACHED) {
        partitionServiceState.service.setRebalancerLeadershipSink(
          LEADERSHIP_SINK_DETACHED,
        );
      }
      owner.shutdown();
    },
  };
}

function ensureServiceInstallationReconcilerOwner(startupOwner) {
  if (!startupOwner || startupOwner.serviceInstallationReconcilerOwnerHandle) {
    return startupOwner?.serviceInstallationReconcilerOwnerHandle ||
      RECONCILER_HANDLE_UNAVAILABLE;
  }
  const catalogOwner =
    startupOwner.serviceLifecycleCommandOwner?.catalogOwner ||
    CATALOG_OWNER_UNAVAILABLE;
  if (!isServiceInstallCatalogOwnerCompatible(catalogOwner)) {
    return RECONCILER_HANDLE_UNAVAILABLE;
  }
  const handle = attachServiceInstallationReconcilerOwner({
    catalogOwner,
    partitionServices: startupOwner.partitionServices,
    timeSource: startupOwner.timeSource,
    logger: startupOwner.logger,
  });
  startupOwner.serviceInstallationReconcilerOwnerHandle = handle;
  return handle;
}

function detachServiceInstallationReconcilerOwner(startupOwner) {
  const handle = startupOwner?.serviceInstallationReconcilerOwnerHandle ||
    RECONCILER_HANDLE_UNAVAILABLE;
  if (!handle) return;
  handle.detach();
  startupOwner.serviceInstallationReconcilerOwnerHandle =
    RECONCILER_HANDLE_UNAVAILABLE;
}

export {
  attachServiceInstallationReconcilerOwner,
  detachServiceInstallationReconcilerOwner,
  ensureServiceInstallationReconcilerOwner,
};
