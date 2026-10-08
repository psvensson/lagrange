import {
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  DURABLE_VERSION_COLUMN,
  buildReplicaLifecycleMutationPredicateFromRow,
  durableRowVersion,
  installAuthoritativeReplicaLifecycleSnapshot,
  isReplicaLifecycleMutationPredicate,
  observeAuthoritativeReplicaLifecycle,
  rowMatchesReplicaLifecycle,
} from
  './replica-state-machine-lifecycle-observation.js';
import {completeRemovalInLane} from './replica-state-machine-transition.js';
import {createRemovalCompletionReceiptVerifier} from
  './replica-state-machine-removal-completion-receipt.js';
import {removeFromTracking} from './replica-state-machine-metrics.js';
import {
  advanceReplicaRevision,
  captureReplicaAdmission,
  getReplicaRevision,
  isReplicaAdmissionCurrent,
  runSerializedReplicaMutation,
} from './replica-state-machine-serialization.js';
import {
  REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE,
  REPLICA_STATE_MACHINE_ERROR_MSG,
  REPLICA_STATE_MACHINE_EVENT,
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_NUM,
  REPLICA_STATE_MACHINE_REASON,
  REPLICA_STATE_MACHINE_STATE,
} from './replica-state-machine-constants.js';

const ReplicaState = REPLICA_STATE_MACHINE_STATE;
const REMOVAL_AUTHORITY_KIND = Object.freeze({
  ABSENT: 'absent',
  CONFLICT: 'conflict',
  REMOVING: 'removing',
  UNAVAILABLE: 'unavailable',
});
const EXISTING_RECOVERY_SNAPSHOT_OUTCOME = Object.freeze({
  REFUSED: 'refused',
  REPLACED: 'replaced',
  SAME: 'same',
});

function normalizeRecoveryCleanupToken(context) {
  return context.cleanupToken ?? null;
}
function removalAuthority(
  kind,
  row = null,
  replicaState = null,
  revision = null,
) {
  const version = durableRowVersion(row);
  return Object.freeze({
    kind,
    replicaState,
    revision,
    durableVersionColumn: version?.column || null,
    durableVersion: version?.value ?? null,
    status: row?.status || null,
  });
}

function rowMatchesRemovingContext(row, replicaId, context, stateMachine) {
  const expected = {
    service_id: replicaId,
    service_type: SERVICE_TYPE.PARTITION,
    status: ReplicaState.REMOVING,
    partition_id: context.partitionId,
    node_id: context.nodeId || stateMachine.nodeId,
    replica_id: replicaId,
  };
  return Object.entries(expected).every(([field, value]) =>
    row?.[field] === value) &&
    isReplicaLifecycleMutationPredicate(
      buildReplicaLifecycleMutationPredicateFromRow(row),
    );
}

function boundMatchesRemovingVersion(bound, version) {
  return bound?.state === ReplicaState.REMOVING &&
    bound.durableVersionColumn === version.column &&
    bound.durableVersion === version.value;
}

async function bindAuthoritativeRemovalAuthority(
  stateMachine,
  replicaId,
  context = {},
) {
  const admission = captureReplicaAdmission(stateMachine, replicaId);
  const bind = async () => {
    const observation = await observeAuthoritativeReplicaLifecycle(
      stateMachine,
      replicaId,
    );
    if (!isReplicaAdmissionCurrent(stateMachine, replicaId, admission)) {
      return removalAuthority(REMOVAL_AUTHORITY_KIND.UNAVAILABLE);
    }
    if (observation.available !== true) {
      return removalAuthority(REMOVAL_AUTHORITY_KIND.UNAVAILABLE);
    }
    const row = observation.row;
    if (!row) {
      return removalAuthority(
        REMOVAL_AUTHORITY_KIND.ABSENT,
        null,
        stateMachine.replicas.get(replicaId) || null,
        getReplicaRevision(stateMachine, replicaId),
      );
    }
    const version = durableRowVersion(row);
    if (!rowMatchesRemovingContext(row, replicaId, context, stateMachine)) {
      return removalAuthority(REMOVAL_AUTHORITY_KIND.CONFLICT, row);
    }
    const registered = registerSnapshotInLane(
      stateMachine,
      replicaId,
      {
        partitionId: row.partition_id,
        nodeId: row.node_id,
        state: row.status,
        serviceId: row.service_id,
        serviceType: row.service_type,
        serviceAddress: row.address,
        replicaIdentity: row.replica_id,
        groupId: row.group_id,
        cleanupToken: row.cleanup_token,
        createdAt: row.created_at,
        durableVersionColumn: version.column,
        durableVersion: version.value,
        authoritativeSnapshot: true,
        reason: REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION,
      },
      ReplicaState.REMOVING,
      admission,
    );
    const bound = stateMachine.replicas.get(replicaId) || null;
    if (registered !== true || !boundMatchesRemovingVersion(bound, version)) {
      return removalAuthority(REMOVAL_AUTHORITY_KIND.CONFLICT, row);
    }
    return removalAuthority(
      REMOVAL_AUTHORITY_KIND.REMOVING,
      row,
      bound,
      getReplicaRevision(stateMachine, replicaId),
    );
  };
  const result = runSerializedReplicaMutation(
    stateMachine,
    replicaId,
    bind,
  );
  return Promise.resolve(result).then((authority) => authority ||
    removalAuthority(REMOVAL_AUTHORITY_KIND.UNAVAILABLE));
}
function authorityMatchesRow(authority, row) {
  if (authority.kind === REMOVAL_AUTHORITY_KIND.ABSENT) return row === null;
  if (authority.kind !== REMOVAL_AUTHORITY_KIND.REMOVING) return false;
  return rowMatchesReplicaLifecycle(row, authority.replicaState);
}

function isRemovalAuthorityCurrent(stateMachine, replicaId, authority) {
  return stateMachine.replicaMutationAdmissionClosed !== true &&
    stateMachine.replicas.get(replicaId) === authority?.replicaState &&
    getReplicaRevision(stateMachine, replicaId) === authority?.revision;
}

async function observeRemovalAuthority(
  stateMachine,
  replicaId,
  authority,
) {
  if (!isRemovalAuthorityCurrent(stateMachine, replicaId, authority)) {
    return false;
  }
  const observation = await observeAuthoritativeReplicaLifecycle(
    stateMachine,
    replicaId,
  );
  return isRemovalAuthorityCurrent(stateMachine, replicaId, authority) &&
    observation.available === true &&
    authorityMatchesRow(authority, observation.row);
}

function buildRemovalAuthorityGuard(stateMachine, replicaId, authority) {
  let exactDeleteAttempted = false;
  let deletedGenerationBound = false;
  const isCurrent = () => isRemovalAuthorityCurrent(
    stateMachine,
    replicaId,
    authority,
  );
  const completionReceipt = createRemovalCompletionReceiptVerifier({
    stateMachine, replicaId, authority, isAuthorityCurrent: isCurrent,
  });
  const requireAbsent = async () => {
    if (!deletedGenerationBound || !isCurrent()) return false;
    const observation = await observeAuthoritativeReplicaLifecycle(
      stateMachine,
      replicaId,
    );
    return isCurrent() && observation.available === true &&
      observation.row === null;
  };
  return Object.freeze({
    isCurrent,
    requireRemoving: () => authority.kind ===
        REMOVAL_AUTHORITY_KIND.REMOVING &&
      observeRemovalAuthority(stateMachine, replicaId, authority),
    beginExactDelete: () => {
      if (!isRemovalAuthorityCurrent(stateMachine, replicaId, authority) ||
          authority.kind !== REMOVAL_AUTHORITY_KIND.REMOVING) return false;
      exactDeleteAttempted = true;
      return true;
    },
    confirmDeleted: async () => {
      if (!exactDeleteAttempted ||
          !isRemovalAuthorityCurrent(stateMachine, replicaId, authority)) {
        return false;
      }
      const observation = await observeAuthoritativeReplicaLifecycle(
        stateMachine,
        replicaId,
      );
      deletedGenerationBound =
        isRemovalAuthorityCurrent(stateMachine, replicaId, authority) &&
        observation.available === true && observation.row === null;
      return deletedGenerationBound;
    },
    confirmCleanupComplete: completionReceipt.confirm,
    requireAbsent,
    requireComplete: () => deletedGenerationBound ?
      requireAbsent() : completionReceipt.requireCurrent(),
  });
}

function finishRemovalAuthorityInLane(
  stateMachine,
  replicaId,
  authority,
  context,
) {
  if (authority.kind !== REMOVAL_AUTHORITY_KIND.REMOVING ||
      !isRemovalAuthorityCurrent(stateMachine, replicaId, authority) ||
      stateMachine.canonicalLeaderClearDebtByReplicaId.has(replicaId) ||
      !completeRemovalInLane(stateMachine, replicaId, context)) {
    return false;
  }
  return removeFromTracking(stateMachine, replicaId);
}

async function completeDurableRemovalWithAuthority(
  stateMachine,
  replicaId,
  authority,
  action,
  onComplete,
  context = {},
) {
  if (authority?.kind !== REMOVAL_AUTHORITY_KIND.REMOVING) return false;
  const run = async () => {
    if (!await observeRemovalAuthority(stateMachine, replicaId, authority)) {
      return false;
    }
    const guard = buildRemovalAuthorityGuard(
      stateMachine,
      replicaId,
      authority,
    );
    if (await action(guard) !== true ||
        !await guard.requireComplete() ||
        !guard.isCurrent()) {
      return false;
    }
    if (!finishRemovalAuthorityInLane(
      stateMachine,
      replicaId,
      authority,
      context,
    )) return false;
    onComplete?.();
    return true;
  };
  return Promise.resolve(runSerializedReplicaMutation(
    stateMachine,
    replicaId,
    run,
  ));
}

function refuseRecoverySnapshot(stateMachine, replicaId, currentState, state,
  reason) {
  stateMachine.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.INVALID_TRANSITION, {
    replicaId,
    currentState,
    attemptedState: state,
    reason,
    nodeId: stateMachine.nodeId,
  });
  stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.TRANSITION_ERROR, {
    code: REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE.INVALID_TRANSITION,
    replicaId,
    currentState,
    attemptedState: state,
    reason,
    nodeId: stateMachine.nodeId,
  });
  return false;
}

async function recoverService(stateMachine, cachedService, nodeId) {
  const replicaId = cachedService.service_id;
  const observation = await observeAuthoritativeReplicaLifecycle(
    stateMachine,
    replicaId,
  );
  const service = observation.available === true ? observation.row : null;
  if (!service || service.service_id !== replicaId ||
      service.node_id !== nodeId ||
      service.service_type !== SERVICE_TYPE.PARTITION) return null;
  const partitionId = service.partition_id;
  const status = service.status;
  if (![
    ReplicaState.CREATING,
    ReplicaState.SYNCING,
    ReplicaState.REMOVING,
    ReplicaState.REMOVED,
    ReplicaState.FAILED,
  ].includes(status)) return null;
  const observedVersion = durableRowVersion(service);
  if (!observedVersion) return null;
  const existingState = await installAuthoritativeReplicaLifecycleSnapshot(
    stateMachine,
    service,
    nodeId,
    observedVersion,
  );
  if (!existingState) return null;

  if ([ReplicaState.REMOVING, ReplicaState.REMOVED, ReplicaState.FAILED]
    .includes(status) &&
      await stateMachine.settleCanonicalLeaderClearDebt(replicaId) !== true) {
    // Keep this durable generation reconstructible until its cross-owner
    // leader side effect is confirmed.
    return null;
  }
  if ([ReplicaState.REMOVING, ReplicaState.REMOVED, ReplicaState.FAILED]
    .includes(status)) {
    return null;
  }

  const newState = ReplicaState.FAILED;
  const reason = REPLICA_STATE_MACHINE_REASON.RECOVERY_INCOMPLETE;
  const result = await stateMachine.transitionAuthoritativeReplicaGeneration(
    service,
    newState,
    {
      partitionId,
      nodeId,
      reason,
      errorMessage:
        REPLICA_STATE_MACHINE_ERROR_MSG.recoveryIncompleteOperation(status),
      serviceId: replicaId,
    },
  );
  if (result !== true) return null;
  stateMachine.logger.info(
    REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_TO_FAILED,
    {replicaId, previousStatus: status, nodeId},
  );
  return status;
}

function resolveFiniteSnapshotVersion(contextValue, cachedValue) {
  if (Number.isFinite(contextValue)) return contextValue;
  return Number.isFinite(cachedValue) ? cachedValue : null;
}

function resolveSnapshotDurableVersion(stateMachine, replicaId, context) {
  if (typeof context.durableVersionColumn === 'string' &&
      Number.isFinite(context.durableVersion)) {
    return {
      column: context.durableVersionColumn,
      value: context.durableVersion,
    };
  }
  const cachedService = typeof stateMachine.systemTableCache?.get ===
      'function' ?
    stateMachine.systemTableCache.get(TABLES.SERVICES, replicaId) : null;
  const stateEnteredAt = resolveFiniteSnapshotVersion(
    context.stateEnteredAt,
    cachedService?.state_entered_at,
  );
  const updatedAt = resolveFiniteSnapshotVersion(
    context.durableUpdatedAt,
    cachedService?.updated_at,
  );
  if (stateEnteredAt === null && updatedAt === null) return null;
  return {
    column: stateEnteredAt !== null ?
      DURABLE_VERSION_COLUMN.STATE_ENTERED_AT :
      DURABLE_VERSION_COLUMN.UPDATED_AT,
    value: stateEnteredAt ?? updatedAt,
  };
}

/**
 * Handle node recovery by processing replicas in transitional states.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {Object} options - Recovery options.
 * @return {Promise<Object>} Recovery result with processed counts.
 */
async function handleNodeRecovery(stateMachine, options = {}) {
  const {systemTableCache} = options;
  const nodeId = options.nodeId || stateMachine.nodeId;

  stateMachine.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_START, {
    nodeId,
  });

  assertCritical(
    systemTableCache,
    REPLICA_STATE_MACHINE_ERROR_MSG.MISSING_SYSTEM_TABLE_CACHE,
  );

  let services = [];
  try {
    services = systemTableCache.filter(
      TABLES.SERVICES,
      (service) =>
        service.node_id === nodeId &&
        service.service_type === SERVICE_TYPE.PARTITION &&
        [
          ReplicaState.CREATING,
          ReplicaState.SYNCING,
          ReplicaState.REMOVING,
          ReplicaState.REMOVED,
          ReplicaState.FAILED,
        ]
          .includes(service.status),
    );
  } catch (error) {
    stateMachine.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_QUERY_FAILED, {
      nodeId,
      error: error.message,
    });
    throw error;
  }

  stateMachine.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_FOUND, {
    count: services.length,
    nodeId,
  });

  let creatingToFailed = REPLICA_STATE_MACHINE_NUM.ZERO;
  let syncingToFailed = REPLICA_STATE_MACHINE_NUM.ZERO;
  let removingToRemoved = REPLICA_STATE_MACHINE_NUM.ZERO;

  for (const service of services) {
    const {service_id: replicaId, partition_id: partitionId, status} = service;
    stateMachine.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_PROCESSING, {
      replicaId,
      partitionId,
      status,
      nodeId,
    });

    try {
      const recoveredStatus = await recoverService(
        stateMachine,
        service,
        nodeId,
      );
      if (recoveredStatus === ReplicaState.CREATING) {
        creatingToFailed += REPLICA_STATE_MACHINE_NUM.ONE;
      } else if (recoveredStatus === ReplicaState.SYNCING) {
        syncingToFailed += REPLICA_STATE_MACHINE_NUM.ONE;
      } else if (recoveredStatus === ReplicaState.REMOVING) {
        removingToRemoved += REPLICA_STATE_MACHINE_NUM.ONE;
      }
    } catch (error) {
      stateMachine.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_FAILED, {
        replicaId,
        status,
        error: error.message,
        nodeId,
      });
    }
  }

  const total = creatingToFailed + syncingToFailed + removingToRemoved;

  stateMachine.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_COMPLETE, {
    nodeId,
    creatingToFailed,
    syncingToFailed,
    removingToRemoved,
    total,
  });

  stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.RECOVERY_COMPLETE, {
    nodeId,
    creatingToFailed,
    syncingToFailed,
    removingToRemoved,
    total,
  });

  return {
    nodeId,
    creatingToFailed,
    syncingToFailed,
    removingToRemoved,
    total,
  };
}

function registerSnapshotInLane(
  stateMachine,
  replicaId,
  context,
  state,
  admission,
) {
  const existingState = stateMachine.replicas.get(replicaId) || null;
  if (!isReplicaAdmissionCurrent(stateMachine, replicaId, admission)) {
    return refuseRecoverySnapshot(
      stateMachine,
      replicaId,
      existingState?.state || null,
      state,
      context.reason,
    );
  }
  const durableVersion = resolveSnapshotDurableVersion(
    stateMachine,
    replicaId,
    context,
  );
  if (!durableVersion || !Number.isFinite(durableVersion.value)) {
    return refuseRecoverySnapshot(
      stateMachine,
      replicaId,
      existingState?.state || null,
      state,
      context.reason,
    );
  }
  if (existingState) {
    const existingOutcome = replaceExistingRecoverySnapshot(
      stateMachine,
      replicaId,
      existingState,
      state,
      durableVersion,
      context,
    );
    if (existingOutcome === EXISTING_RECOVERY_SNAPSHOT_OUTCOME.SAME) {
      return true;
    }
    if (existingOutcome === EXISTING_RECOVERY_SNAPSHOT_OUTCOME.REFUSED) {
      return false;
    }
  }
  registerReplicaForRecovery(
    stateMachine,
    replicaId,
    buildRecoveryRegistrationContext(
      stateMachine,
      context,
      state,
      durableVersion,
    ),
  );
  return true;
}
function replaceExistingRecoverySnapshot(stateMachine, replicaId,
  existingState, state, durableVersion, context) {
  const sameGeneration = existingState.state === state &&
    existingState.durableVersionColumn === durableVersion.column &&
    existingState.durableVersion === durableVersion.value;
  const sameAuthoritativeIdentity =
    existingState.lifecycleIdentityAuthoritative === true &&
    existingState.partitionId === context.partitionId &&
    existingState.nodeId === context.nodeId &&
    existingState.serviceId === context.serviceId &&
    existingState.serviceType === context.serviceType &&
    existingState.replicaIdentity === context.replicaIdentity &&
    existingState.groupId === (context.groupId ?? null) &&
    existingState.cleanupToken === (context.cleanupToken ?? null) &&
    existingState.createdAt === context.createdAt;
  if (sameGeneration &&
      (context.authoritativeSnapshot !== true || sameAuthoritativeIdentity)) {
    return EXISTING_RECOVERY_SNAPSHOT_OUTCOME.SAME;
  }
  if (context.authoritativeSnapshot !== true) {
    refuseRecoverySnapshot(
      stateMachine,
      replicaId,
      existingState.state,
      state,
      context.reason,
    );
    return EXISTING_RECOVERY_SNAPSHOT_OUTCOME.REFUSED;
  }
  stateMachine.uncertainRemovingIntentByReplicaId.delete(replicaId);
  stateMachine.canonicalLeaderClearDebtByReplicaId.delete(replicaId);
  stateMachine.canonicalLeaderClearSettlementByReplicaId.delete(replicaId);
  stateMachine.stateCounts[existingState.state]--;
  return EXISTING_RECOVERY_SNAPSHOT_OUTCOME.REPLACED;
}
function buildRecoveryRegistrationContext(stateMachine, context, state,
  durableVersion) {
  return {
    partitionId: context.partitionId,
    nodeId: context.nodeId || stateMachine.nodeId,
    state,
    serviceId: context.serviceId || null,
    serviceType: context.serviceType || SERVICE_TYPE.PARTITION,
    serviceAddress: context.serviceAddress || null,
    replicaIdentity: context.replicaIdentity || null,
    groupId: context.groupId ?? null,
    cleanupToken: context.cleanupToken ?? null,
    createdAt: context.createdAt,
    authoritativeSnapshot: context.authoritativeSnapshot === true,
    triggerReason: context.reason ||
      REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION,
    stateEnteredAt: durableVersion.value,
    durableVersionColumn: durableVersion.column,
    durableVersion: durableVersion.value,
  };
}

function installAuthoritativeReplicaLifecycleInLane(
  stateMachine,
  replicaId,
  row,
) {
  const version = durableRowVersion(row);
  if (!version || row?.service_id !== replicaId ||
      row.node_id !== stateMachine.nodeId ||
      row.service_type !== SERVICE_TYPE.PARTITION ||
      !isReplicaLifecycleMutationPredicate(
        buildReplicaLifecycleMutationPredicateFromRow(row),
      ) ||
      !Object.values(ReplicaState).includes(row.status)) {
    return false;
  }
  return registerSnapshotInLane(
    stateMachine,
    replicaId,
    {
      partitionId: row.partition_id,
      nodeId: row.node_id,
      state: row.status,
      serviceId: row.service_id,
      serviceType: row.service_type,
      serviceAddress: row.address,
      replicaIdentity: row.replica_id,
      groupId: row.group_id,
      cleanupToken: row.cleanup_token,
      createdAt: row.created_at,
      durableVersionColumn: version.column,
      durableVersion: version.value,
      authoritativeSnapshot: true,
      reason: REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION,
    },
    row.status,
    captureReplicaAdmission(stateMachine, replicaId),
  );
}

/**
 * Register a replica snapshot directly without transitional writes.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {string} replicaId - Replica identifier.
 * @param {Object} context - Replica context.
 * @return {boolean} True when registration succeeded.
 */
function registerReplicaSnapshot(stateMachine, replicaId, context = {}) {
  if (!replicaId || typeof replicaId !== 'string') {
    return false;
  }

  const state = context.state || ReplicaState.ACTIVE;
  if (!Object.values(ReplicaState).includes(state)) {
    stateMachine.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.INVALID_TRANSITION, {
      replicaId,
      currentState: null,
      attemptedState: state,
      reason: context.reason,
      nodeId: stateMachine.nodeId,
    });
    stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.TRANSITION_ERROR, {
      code: REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE.INVALID_TRANSITION,
      replicaId,
      currentState: null,
      attemptedState: state,
      reason: context.reason,
      nodeId: stateMachine.nodeId,
    });
    return false;
  }

  // Snapshot hydration is a synchronous compatibility boundary. Refuse a
  // snapshot while another mutation owns the replica lane instead of changing
  // the API into an occasionally-awaitable operation that legacy callers can
  // accidentally treat as success. Recovery can retry from fresh evidence.
  if (stateMachine.serviceRowPersistInFlightByServiceId.has(replicaId)) {
    return refuseRecoverySnapshot(
      stateMachine,
      replicaId,
      stateMachine.replicas.get(replicaId)?.state || null,
      state,
      context.reason,
    );
  }

  const admission = captureReplicaAdmission(stateMachine, replicaId);
  const register = () => registerSnapshotInLane(
    stateMachine,
    replicaId,
    context,
    state,
    admission,
  );
  return runSerializedReplicaMutation(stateMachine, replicaId, register);
}

/**
 * Register a replica directly for recovery purposes.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {string} replicaId - Replica identifier.
 * @param {Object} context - Replica context.
 */
function registerReplicaForRecovery(stateMachine, replicaId, context) {
  const now = stateMachine.now();
  const state = context.state;
  const stateEnteredAt = Number.isFinite(context.stateEnteredAt) ?
    context.stateEnteredAt : now;

  stateMachine.stateCounts[state]++;

  const replicaState = {
    replicaId,
    partitionId: context.partitionId,
    nodeId: context.nodeId || stateMachine.nodeId,
    state,
    stateEnteredAt,
    timeoutStartedAt:
      stateMachine.timeouts[state] === undefined ? null : stateEnteredAt,
    previousState: null,
    triggerReason: context.triggerReason ||
      REPLICA_STATE_MACHINE_REASON.RECOVERY_REGISTRATION,
    errorMessage: null,
    metadata: {},
    serviceId: context.serviceId || null,
    serviceType: context.serviceType || SERVICE_TYPE.PARTITION,
    serviceAddress: context.serviceAddress || null,
    replicaIdentity: context.replicaIdentity || null,
    groupId: context.groupId ?? null,
    cleanupToken: normalizeRecoveryCleanupToken(context),
    createdAt: context.createdAt,
    lifecycleIdentityAuthoritative:
      context.authoritativeSnapshot === true,
    durableVersionColumn: context.durableVersionColumn ||
      'state_entered_at',
    durableVersion: Number.isFinite(context.durableVersion) ?
      context.durableVersion : stateEnteredAt,
  };

  stateMachine.replicas.set(replicaId, replicaState);
  advanceReplicaRevision(stateMachine, replicaId);

  stateMachine.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.RECOVERY_REGISTERED, {
    replicaId,
    state,
    nodeId: stateMachine.nodeId,
  });
}

export {
  bindAuthoritativeRemovalAuthority,
  completeDurableRemovalWithAuthority,
  durableRowVersion,
  handleNodeRecovery,
  installAuthoritativeReplicaLifecycleInLane,
  registerReplicaSnapshot,
};
