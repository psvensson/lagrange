import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {NodeState} from '../node/node-lifecycle-state-machine.js';
import {STARTUP_JOIN_MODE} from './rejoin-hints-constants.js';
import {
  compareJoinSchemaVersions,
  normalizeJoinSchemaVersion,
} from './join-schema-version-resolver.js';

const LOCAL_STR_EMPTY = '';

const JOIN_PROMOTION_STATE = Object.freeze({
  OBSERVED: 'observed',
  HYDRATED: 'hydrated',
  RESTORING: 'restoring',
  CATCHING_UP: 'catching_up',
  PROMOTABLE: 'promotable',
  READY: 'ready',
});

const JOIN_REJOIN_PROMOTION_RESTORE_STATE = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  PENDING: 'pending',
  RESTORING: 'restoring',
  RESTORED: 'restored',
});

const JOIN_PROMOTION_REASON = Object.freeze({
  SYSTEM_CACHE_NOT_HYDRATED: 'system_cache_not_hydrated',
  DURABLE_REJOIN_RESTORE_PENDING: 'durable_rejoin_restore_pending',
  DURABLE_REJOIN_RESTORE_ACTIVE: 'durable_rejoin_restore_active',
  ROUTING_NOT_READY: 'routing_not_ready',
  SCHEMA_VERSION_UNKNOWN: 'schema_version_unknown',
  SCHEMA_VERSION_LAG: 'schema_version_lag',
  TOPOLOGY_NOT_READY: 'topology_not_ready',
  IN_FLIGHT_REPLICA_OPERATIONS: 'in_flight_replica_operations',
  LIFECYCLE_NOT_READY: 'lifecycle_not_ready',
});

function normalizeDistinctStringArray(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => typeof value === TYPEOF.STRING ? value.trim() : LOCAL_STR_EMPTY)
      .filter((value) => value.length > NUM.ZERO),
  )];
}

function normalizeJoinPromotionRestoreState(value) {
  if (value === JOIN_REJOIN_PROMOTION_RESTORE_STATE.PENDING) {
    return JOIN_REJOIN_PROMOTION_RESTORE_STATE.PENDING;
  }
  if (value === JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING) {
    return JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING;
  }
  if (value === JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED) {
    return JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORED;
  }
  return JOIN_REJOIN_PROMOTION_RESTORE_STATE.NOT_APPLICABLE;
}

function normalizeLifecycleState(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO ?
    value :
    null;
}

function isDurableRejoin(startupMode) {
  return startupMode === STARTUP_JOIN_MODE.DURABLE_REJOIN;
}

function evaluateJoinPromotionState(context = {}) {
  const reasons = [];
  const systemCacheHydrated = context.systemCacheHydrated === true;
  const startupMode = context.startupMode || STARTUP_JOIN_MODE.FRESH_JOIN;
  const restoreState = normalizeJoinPromotionRestoreState(context.restoreState);
  const routingReady = context.routingReady === true;
  const topologyReady = context.topologyReady === true;
  const requiredSchemaVersion = normalizeJoinSchemaVersion(
    context.requiredSchemaVersion,
  );
  const appliedSchemaVersion = normalizeJoinSchemaVersion(
    context.appliedSchemaVersion,
  );
  const inFlightReplicaOperations =
    Number.isFinite(context.inFlightReplicaOperations) ?
      Math.max(NUM.ZERO, Math.floor(context.inFlightReplicaOperations)) :
      NUM.ZERO;
  const lifecycleState = normalizeLifecycleState(context.lifecycleState);

  if (!systemCacheHydrated) {
    reasons.push(JOIN_PROMOTION_REASON.SYSTEM_CACHE_NOT_HYDRATED);
    return Object.freeze({
      state: JOIN_PROMOTION_STATE.OBSERVED,
      restoreState,
      reasons: normalizeDistinctStringArray(reasons),
      readyToPromote: false,
    });
  }

  if (isDurableRejoin(startupMode) &&
      restoreState === JOIN_REJOIN_PROMOTION_RESTORE_STATE.PENDING) {
    reasons.push(JOIN_PROMOTION_REASON.DURABLE_REJOIN_RESTORE_PENDING);
    return Object.freeze({
      state: JOIN_PROMOTION_STATE.HYDRATED,
      restoreState,
      reasons: normalizeDistinctStringArray(reasons),
      readyToPromote: false,
    });
  }

  if (isDurableRejoin(startupMode) &&
      restoreState === JOIN_REJOIN_PROMOTION_RESTORE_STATE.RESTORING) {
    reasons.push(JOIN_PROMOTION_REASON.DURABLE_REJOIN_RESTORE_ACTIVE);
    return Object.freeze({
      state: JOIN_PROMOTION_STATE.RESTORING,
      restoreState,
      reasons: normalizeDistinctStringArray(reasons),
      readyToPromote: false,
    });
  }

  if (!routingReady) {
    reasons.push(JOIN_PROMOTION_REASON.ROUTING_NOT_READY);
  }
  if (!requiredSchemaVersion || !appliedSchemaVersion) {
    reasons.push(JOIN_PROMOTION_REASON.SCHEMA_VERSION_UNKNOWN);
  } else if (compareJoinSchemaVersions(
    appliedSchemaVersion,
    requiredSchemaVersion,
  ) < NUM.ZERO) {
    reasons.push(JOIN_PROMOTION_REASON.SCHEMA_VERSION_LAG);
  }

  if (!topologyReady) {
    reasons.push(JOIN_PROMOTION_REASON.TOPOLOGY_NOT_READY);
  }
  if (inFlightReplicaOperations > NUM.ZERO) {
    reasons.push(JOIN_PROMOTION_REASON.IN_FLIGHT_REPLICA_OPERATIONS);
  }

  if (reasons.length > NUM.ZERO) {
    const state = routingReady === true && topologyReady === true ?
      JOIN_PROMOTION_STATE.CATCHING_UP :
      JOIN_PROMOTION_STATE.HYDRATED;
    return Object.freeze({
      state,
      restoreState,
      reasons: normalizeDistinctStringArray(reasons),
      readyToPromote: false,
    });
  }

  if (lifecycleState === NodeState.READY) {
    return Object.freeze({
      state: JOIN_PROMOTION_STATE.READY,
      restoreState,
      reasons: normalizeDistinctStringArray(reasons),
      readyToPromote: true,
    });
  }

  if (lifecycleState !== null && lifecycleState !== NodeState.READY) {
    reasons.push(JOIN_PROMOTION_REASON.LIFECYCLE_NOT_READY);
  }

  return Object.freeze({
    state: JOIN_PROMOTION_STATE.PROMOTABLE,
    restoreState,
    reasons: normalizeDistinctStringArray(reasons),
    readyToPromote: true,
  });
}

export {
  evaluateJoinPromotionState,
  JOIN_PROMOTION_REASON,
  JOIN_PROMOTION_STATE,
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
};
