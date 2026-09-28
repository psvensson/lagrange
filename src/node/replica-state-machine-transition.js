import {
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
import {
  didDurableServiceRowWriteApply,
  durableTransitionNotAppliedError,
  reportServiceRowPersisted,
  reportServiceRowPersistenceError,
} from './replica-state-machine-durability.js';
import {
  buildReplicaLifecycleMutationPredicateFromState,
  isReplicaLifecycleMutationPredicate,
  observeAuthoritativeReplicaLifecycle,
  readAuthoritativeReplicaLifecycle,
  resolveReplicaCreateGroupId,
  rowMatchesReplicaLifecycle,
} from './replica-state-machine-lifecycle-observation.js';
import {
  advanceReplicaRevision,
  captureReplicaAdmission,
  isCanonicalLeaderClearSettled,
  isReplicaAdmissionCurrent,
  runSerializedReplicaMutation,
} from './replica-state-machine-serialization.js';
import {clearLeaderOrRecordDebt} from
  './replica-state-machine-leader-clear.js';
import {createReplicaRowInCdc} from
  './replica-state-machine-create-persistence.js';
import {mintPartitionServiceCreatedAt} from
  '../partition/partition-service-incarnation.js';

const STATE_ENTERED_AT_COLUMN = 'state_entered_at';
const OBSERVED_STATE_CHANGED_OUTCOME = 'observed_state_changed';
import {
  REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE,
  REPLICA_STATE_MACHINE_EVENT,
  REPLICA_STATE_MACHINE_EVENT_TYPE,
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_NUM,
  REPLICA_STATE_MACHINE_REASON,
  REPLICA_STATE_MACHINE_STATE,
  REPLICA_STATE_MACHINE_TRANSITION,
} from './replica-state-machine-constants.js';

const LOCAL_STR_CRITICAL = 'critical';
const LOCAL_STR_BACKGROUND = 'background';

const ReplicaState = REPLICA_STATE_MACHINE_STATE;

const BACKGROUND_PERSISTENCE_STATES = new Set([
  ReplicaState.PENDING,
  ReplicaState.CREATING,
  ReplicaState.SYNCING,
  ReplicaState.REMOVING,
]);
const RETAINS_CANONICAL_PARTITION_LEADER_SERVICE_STATES = new Set([
  ReplicaState.ACTIVE,
]);

async function resolveUncertainLifecycleUpdate(
  stateMachine,
  replicaState,
  previousState,
  cause,
) {
  const serviceId = replicaState.serviceId || replicaState.replicaId;
  const observation = await observeAuthoritativeReplicaLifecycle(
    stateMachine,
    serviceId,
  );
  if (observation.available !== true ||
      !rowMatchesReplicaLifecycle(observation.row, replicaState)) {
    throw cause;
  }
  stateMachine.clearServiceRowLocalOnly?.(serviceId);
  await clearLeaderOrRecordDebt(stateMachine, replicaState, previousState);
  reportServiceRowPersisted(stateMachine, replicaState);
  return {
    success: true,
    outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    partitionResult: {affectedRows: 1},
  };
}

function refuseTransition(
  stateMachine,
  replicaId,
  currentState,
  newState,
  context,
) {
  stateMachine.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.INVALID_TRANSITION, {
    replicaId,
    currentState,
    attemptedState: newState,
    reason: context.reason,
    nodeId: stateMachine.nodeId,
  });

  stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.TRANSITION_ERROR, {
    code: REPLICA_STATE_MACHINE_DIAGNOSTIC_CODE.INVALID_TRANSITION,
    replicaId,
    currentState,
    attemptedState: newState,
    reason: context.reason,
    nodeId: stateMachine.nodeId,
  });

  return false;
}

function transitionValue(value, existingValue, fallback = null) {
  return value || existingValue || fallback;
}

function resolveTransitionTimestamp(stateMachine, existingState, context) {
  const observedNow = Number.isFinite(context?.timestamp) ?
    context.timestamp : stateMachine.now();
  const sourceVersion = Number.isFinite(existingState?.durableVersion) ?
    existingState.durableVersion : existingState?.stateEnteredAt;
  return {
    observedNow,
    now: Number.isFinite(sourceVersion) ?
      Math.max(observedNow, sourceVersion + 1) : observedNow,
  };
}

function buildTransitionLifecycleIdentity(replicaId, existingState, now) {
  const createdAt = Number.isFinite(existingState?.createdAt) ?
    existingState.createdAt :
    mintPartitionServiceCreatedAt(now);
  return {
    replicaIdentity: existingState?.replicaIdentity || replicaId,
    groupId: existingState?.groupId ?? null,
    createdAt,
    lifecycleIdentityAuthoritative:
      existingState?.lifecycleIdentityAuthoritative === true,
  };
}

function buildTransitionState(
  stateMachine,
  replicaId,
  newState,
  context,
  existingState,
) {
  const {observedNow, now} = resolveTransitionTimestamp(
    stateMachine,
    existingState,
    context,
  );
  // The durable timestamp is the lifecycle generation token. Make it
  // strictly monotonic even when transitions share a millisecond or a
  // recovered row was stamped by a clock ahead of this process.
  const previousState = existingState ? existingState.state : null;
  return {
    now,
    previousState,
    timeInPreviousState: existingState ?
      Math.max(
        REPLICA_STATE_MACHINE_NUM.ZERO,
        observedNow - existingState.stateEnteredAt,
      ) : REPLICA_STATE_MACHINE_NUM.ZERO,
    replicaState: {
      replicaId,
      partitionId: transitionValue(
        context.partitionId,
        existingState?.partitionId,
      ),
      nodeId: transitionValue(
        context.nodeId,
        existingState?.nodeId,
        stateMachine.nodeId,
      ),
      state: newState,
      stateEnteredAt: now,
      timeoutStartedAt: null,
      previousState,
      triggerReason: transitionValue(
        context.reason,
        null,
        REPLICA_STATE_MACHINE_REASON.UNKNOWN,
      ),
      errorMessage: context.errorMessage || null,
      metadata: transitionValue(context.metadata, existingState?.metadata, {}),
      serviceId: transitionValue(context.serviceId, existingState?.serviceId),
      serviceType: transitionValue(
        context.serviceType,
        existingState?.serviceType,
        SERVICE_TYPE.PARTITION,
      ),
      serviceAddress: transitionValue(
        context.serviceAddress,
        existingState?.serviceAddress,
      ),
      ...buildTransitionLifecycleIdentity(replicaId, existingState, now),
      durableVersionColumn: STATE_ENTERED_AT_COLUMN,
      durableVersion: now,
    },
  };
}

function commitTransition(
  stateMachine,
  replicaId,
  newState,
  context,
  transitionState,
) {
  const {
    now,
    previousState,
    timeInPreviousState,
    replicaState,
  } = transitionState;
  if (previousState !== null) {
    stateMachine.stateCounts[previousState]--;
  }
  stateMachine.stateCounts[newState]++;

  const transitionKey =
    `${previousState}${REPLICA_STATE_MACHINE_TRANSITION.SEPARATOR}${newState}`;
  const currentTransitionCount =
    stateMachine.transitionCounts.get(transitionKey) ||
    REPLICA_STATE_MACHINE_NUM.ZERO;
  stateMachine.transitionCounts.set(
    transitionKey,
    currentTransitionCount + REPLICA_STATE_MACHINE_NUM.ONE,
  );

  if (previousState !== null &&
      timeInPreviousState > REPLICA_STATE_MACHINE_NUM.ZERO) {
    const currentTimeInState = stateMachine.timeInState.get(previousState) ||
      REPLICA_STATE_MACHINE_NUM.ZERO;
    stateMachine.timeInState.set(
      previousState,
      currentTimeInState + timeInPreviousState,
    );
  }

  if (newState === ReplicaState.FAILED) {
    stateMachine.failureCount++;
  }

  stateMachine._updatePeakConcurrentOperations();
  stateMachine.replicas.set(replicaId, replicaState);
  advanceReplicaRevision(stateMachine, replicaId);

  stateMachine.logger.info(REPLICA_STATE_MACHINE_LOG_MSG.STATE_TRANSITION, {
    replicaId,
    previousState,
    newState,
    reason: context.reason,
    nodeId: stateMachine.nodeId,
  });

  stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.STATE_TRANSITION, {
    eventType: REPLICA_STATE_MACHINE_EVENT_TYPE.REPLICA_STATE_TRANSITION,
    replicaId,
    partitionId: replicaState.partitionId,
    nodeId: replicaState.nodeId,
    previousState,
    newState,
    timestamp: now,
    triggerReason: replicaState.triggerReason,
    errorMessage: replicaState.errorMessage,
    timeInPreviousState,
  });
}

function completeRemovalInLane(stateMachine, replicaId, context = {}) {
  const existingState = stateMachine.replicas.get(replicaId) || null;
  if (existingState?.state !== ReplicaState.REMOVING ||
      !isCanonicalLeaderClearSettled(stateMachine, replicaId)) {
    return false;
  }
  const transitionState = buildTransitionState(
    stateMachine,
    replicaId,
    ReplicaState.REMOVED,
    context,
    existingState,
  );
  commitTransition(
    stateMachine,
    replicaId,
    ReplicaState.REMOVED,
    context,
    transitionState,
  );
  stateMachine._armTimeoutClock(replicaId);
  return true;
}

function runTransitionAttempt(
  stateMachine,
  replicaId,
  newState,
  context,
  options,
  admission,
) {
  const existingState = stateMachine.replicas.get(replicaId) || null;
  const currentState = existingState?.state || null;
  const validate = options.validate !== false;
  const persist = options.persist !== false;

  // Admission is source-state specific. A queued request must not be
  // reinterpreted as a different, coincidentally valid edge after an earlier
  // transition commits (for example, a CREATING -> FAILED observation after
  // durable REMOVING has won). The monotonic revision also fences ABA changes.
  if (!isReplicaAdmissionCurrent(stateMachine, replicaId, admission) ||
      currentState === ReplicaState.REMOVING &&
        newState === ReplicaState.REMOVED &&
        !isCanonicalLeaderClearSettled(stateMachine, replicaId) ||
      validate && !stateMachine.isValidTransition(currentState, newState)) {
    return refuseTransition(
      stateMachine,
      replicaId,
      currentState,
      newState,
      context,
    );
  }

  const transitionState = buildTransitionState(
    stateMachine,
    replicaId,
    newState,
    context,
    existingState,
  );
  const commit = () => {
    commitTransition(
      stateMachine,
      replicaId,
      newState,
      context,
      transitionState,
    );
    stateMachine._armTimeoutClock(replicaId);
  };

  if (!persist) {
    commit();
    return true;
  }

  const uncertainRemoval = newState === ReplicaState.REMOVING ?
    stateMachine.uncertainRemovingIntentByReplicaId.get(replicaId) : null;
  if (uncertainRemoval) {
    return resolveUncertainRemovingTransition({
      stateMachine,
      replicaId,
      existingState,
      admission,
      uncertainty: uncertainRemoval,
    }).then((resolved) => resolved === true ? true :
      resolved === false ? false : persistTransitionAttempt({
        stateMachine,
        replicaId,
        newState,
        existingState,
        admission,
        transitionState,
        context,
        commit,
      }));
  }
  return persistTransitionAttempt({
    stateMachine,
    replicaId,
    newState,
    existingState,
    admission,
    transitionState,
    context,
    commit,
  });
}

async function resolveUncertainRemovingTransition({
  stateMachine,
  replicaId,
  existingState,
  admission,
  uncertainty,
}) {
  const row = await readAuthoritativeReplicaLifecycle(stateMachine, replicaId);
  if (rowMatchesReplicaLifecycle(row, uncertainty.transitionState.replicaState)) {
    if (!isReplicaAdmissionCurrent(stateMachine, replicaId, admission)) {
      return false;
    }
    await clearLeaderOrRecordDebt(
      stateMachine,
      uncertainty.transitionState.replicaState,
      existingState,
    );
    if (!isReplicaAdmissionCurrent(stateMachine, replicaId, admission)) {
      return false;
    }
    stateMachine.uncertainRemovingIntentByReplicaId.delete(replicaId);
    commitTransition(
      stateMachine,
      replicaId,
      ReplicaState.REMOVING,
      uncertainty.context,
      uncertainty.transitionState,
    );
    stateMachine._armTimeoutClock(replicaId);
    return true;
  }
  if (rowMatchesReplicaLifecycle(row, existingState)) {
    stateMachine.uncertainRemovingIntentByReplicaId.delete(replicaId);
    return null;
  }
  throw durableTransitionNotAppliedError(
    replicaId,
    ReplicaState.REMOVING,
    {
      success: true,
      outcome: OBSERVED_STATE_CHANGED_OUTCOME,
      deferRetry: true,
    },
  );
}

function persistTransitionAttempt({
  stateMachine,
  replicaId,
  newState,
  existingState,
  admission,
  transitionState,
  context,
  commit,
}) {
  const persistenceResult = transitionState.previousState === null ?
    stateMachine._createReplicaRowInCdc(transitionState.replicaState) :
    stateMachine._updateReplicaStateInCdc(
      transitionState.replicaState,
      existingState,
    );
  return Promise.resolve(persistenceResult).then((result) => {
    const durableApplyConfirmed = result === true ||
      didDurableServiceRowWriteApply(result);
    if (!durableApplyConfirmed) {
      throw durableTransitionNotAppliedError(replicaId, newState, result);
    }
    if (!isReplicaAdmissionCurrent(stateMachine, replicaId, admission)) {
      return false;
    }
    if (newState === ReplicaState.REMOVING) {
      stateMachine.uncertainRemovingIntentByReplicaId.delete(replicaId);
    }
    if (transitionState.previousState === null) {
      transitionState.replicaState.lifecycleIdentityAuthoritative = true;
    }
    commit();
    return durableApplyConfirmed;
  }, (error) => {
    if (newState === ReplicaState.REMOVING) {
      // A thrown persistence outcome can mean the durable REMOVING write
      // applied but its acknowledgement was lost. Fence the old source
      // revision so no failure or forward transition can reinterpret that
      // uncertainty; only a fresh idempotent REMOVING redrive may resolve it.
      stateMachine.uncertainRemovingIntentByReplicaId.set(replicaId, {
        revision: admission.revision,
        sourceState: admission.sourceState,
        context: Object.freeze({reason: context.reason}),
        transitionState,
      });
      advanceReplicaRevision(stateMachine, replicaId);
    }
    throw error;
  });
}

/**
 * Apply one replica-state transition with optional validation and persistence.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {string} replicaId - Replica identifier.
 * @param {string} newState - Target state.
 * @param {Object} context - Additional context.
 * @param {Object} options - Transition options.
 * @return {boolean|Promise<boolean>} True if transition succeeded.
 */
function applyTransition(stateMachine, replicaId, newState, context = {}, options = {}) {
  const admission = captureReplicaAdmission(stateMachine, replicaId);
  const currentState = admission.sourceState;
  const validate = options.validate !== false;

  if (stateMachine.uncertainRemovingIntentByReplicaId.has(replicaId) &&
      newState !== ReplicaState.REMOVING) {
    return refuseTransition(
      stateMachine,
      replicaId,
      currentState,
      newState,
      context,
    );
  }
  if (validate && !stateMachine.isValidTransition(currentState, newState)) {
    return refuseTransition(
      stateMachine,
      replicaId,
      currentState,
      newState,
      context,
    );
  }

  // CL-021: serialize this row's durable writes against the local-only
  // Both paths submit full-row writes; unserialized, a reconcile carrying
  // the PRE-transition state could land after this transition's write and
  // regress the durable row. The reconcile skips rows with an in-flight
  // transition persist; transitions chain after an in-flight reconcile.
  const runAttempt = () => runTransitionAttempt(
    stateMachine,
    replicaId,
    newState,
    context,
    options,
    admission,
  );
  return runSerializedReplicaMutation(stateMachine, replicaId, runAttempt);
}

/**
 * Update an existing services row for a tracked replica.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {Object} replicaState - The replica state to persist.
 * @param {string} previousState - The previous state.
 * @return {Promise<boolean>} True if persistence succeeded.
 */
async function updateReplicaStateInCdc(
  stateMachine,
  replicaState,
  previousState,
) {
  try {
    const serviceId = replicaState.serviceId || replicaState.replicaId;
    const persistenceOptions = stateMachine._buildCdcPersistenceOptions(
      replicaState,
      serviceId,
    );
    const previousStateValue = typeof previousState === 'object' ?
      previousState?.state : previousState;
    const whereClause =
      buildReplicaLifecycleMutationPredicateFromState(previousState);
    if (!isReplicaLifecycleMutationPredicate(whereClause)) {
      return {
        success: true,
        outcome: OBSERVED_STATE_CHANGED_OUTCOME,
        partitionResult: {affectedRows: 0},
      };
    }
    const mutation = {
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SERVICES,
      whereClause,
      data: stateMachine._buildUpdateCdcData(
        replicaState,
        previousStateValue,
      ),
    };
    const mutationResult = await stateMachine
      .getControlPlaneSystemTableGateway()
      .submitMutation(mutation, persistenceOptions);
    const durableApplyConfirmed =
      didDurableServiceRowWriteApply(mutationResult);
    if (durableApplyConfirmed) {
      stateMachine.clearServiceRowLocalOnly?.(serviceId);
      await clearLeaderOrRecordDebt(
        stateMachine,
        replicaState,
        previousState,
      );
    }

    reportServiceRowPersisted(stateMachine, replicaState);

    return mutationResult;
  } catch (error) {
    reportServiceRowPersistenceError(stateMachine, replicaState, error);
    if (replicaState.state === ReplicaState.REMOVING) {
      throw error;
    }
    return resolveUncertainLifecycleUpdate(
      stateMachine,
      replicaState,
      previousState,
      error,
    );
  }
}

/**
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {Object|null} replicaState - Replica state to inspect.
 * @return {boolean}
 */
function hasOtherActivePartitionReplicaOnLeaderNode(stateMachine, replicaState) {
  if (!replicaState ||
      !stateMachine.systemTableCache ||
      typeof stateMachine.systemTableCache.filter !== 'function') {
    return false;
  }

  const currentReplicaId = replicaState.replicaId || replicaState.serviceId;
  const siblingServices = stateMachine.systemTableCache.filter(
    TABLES.SERVICES,
    (service) => {
      if (!service) {
        return false;
      }
      const serviceType = service.service_type || service.serviceType;
      if (serviceType !== SERVICE_TYPE.PARTITION) {
        return false;
      }
      const partitionId = service.partition_id || service.partitionId;
      if (partitionId !== replicaState.partitionId) {
        return false;
      }
      const nodeId = service.node_id || service.nodeId;
      if (nodeId !== replicaState.nodeId) {
        return false;
      }
      const replicaId =
        service.replica_id || service.replicaId || service.service_id;
      if (replicaId === currentReplicaId) {
        return false;
      }
      const status = service.status;
      return RETAINS_CANONICAL_PARTITION_LEADER_SERVICE_STATES.has(status);
    },
  );

  return Array.isArray(siblingServices) &&
    siblingServices.length > REPLICA_STATE_MACHINE_NUM.ZERO;
}

/**
 * Arm timeout tracking after the transition has been durably persisted.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {string} replicaId - Replica identifier.
 */
function armTimeoutClock(stateMachine, replicaId) {
  const replicaState = stateMachine.replicas.get(replicaId);
  if (!replicaState) {
    return;
  }

  if (stateMachine.timeouts[replicaState.state] === undefined) {
    replicaState.timeoutStartedAt = null;
    return;
  }

  replicaState.timeoutStartedAt = stateMachine.now();
}

/**
 * Build CDC payload for updating an existing services row.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {Object} replicaState - Replica state snapshot.
 * @param {string|null} previousState - Previous state value.
 * @return {Object} Partial services-row update payload.
 */
function buildUpdateCdcData(replicaState, previousState) {
  const durableUpdatedAt = Number.isFinite(replicaState.durableUpdatedAt) ?
    replicaState.durableUpdatedAt : replicaState.stateEnteredAt;
  const cdcData = {
    status: replicaState.state,
    state_entered_at: replicaState.stateEnteredAt,
    previous_state: previousState,
    trigger_reason: replicaState.triggerReason,
    updated_at: durableUpdatedAt,
  };

  if (replicaState.errorMessage) {
    cdcData.error_message = replicaState.errorMessage;
  }

  return cdcData;
}

/**
 * Build CDC payload for creating a services row.
 * @param {Object} replicaState - Replica state snapshot.
 * @param {string} serviceId - Canonical service identifier.
 * @param {string} serviceType - Service type for the row.
 * @param {string} address - Resolved service address.
 * @return {Object} Full services-row creation payload.
 */
function buildCreateCdcData(
  stateMachine,
  replicaState,
  serviceId,
  serviceType,
  address,
) {
  const createdAt = replicaState.createdAt;
  // CL-021: this payload feeds a full-row INSERT OR REPLACE. Columns owned
  // by OTHER writers (raft_role from the partition service's role-mutation
  // helper, group_id from registration) were silently NULLED by every
  // lifecycle upsert — and the priority spread-ready predicate requires a
  // truthy raft_role, so REPLACE-created replicas stayed invisible to
  // spread recovery (exclusionReasonCounts = raft_role_missing on every
  // blocked partition; the mode=load ACTIVE-wait root). Preserve them from
  // the cached row when present.
  const cachedRow =
    typeof stateMachine.systemTableCache?.get === 'function' ?
      stateMachine.systemTableCache.get(TABLES.SERVICES, serviceId) :
      null;
  const preservedColumns = {};
  if (
    typeof cachedRow?.raft_role === 'string' &&
    cachedRow.raft_role.length > 0
  ) {
    preservedColumns.raft_role = cachedRow.raft_role;
  }
  const groupId = resolveReplicaCreateGroupId(
    stateMachine,
    replicaState,
    serviceId,
  );
  return {
    ...preservedColumns,
    ...stateMachine._buildUpdateCdcData(replicaState, null),
    service_id: serviceId,
    service_type: serviceType,
    node_id: replicaState.nodeId,
    partition_id: replicaState.partitionId,
    group_id: groupId,
    replica_id: replicaState.replicaIdentity,
    address,
    created_at: createdAt,
  };
}

/**
 * Build canonical CDC mutation options for one replica-state write.
 * @param {Object} replicaState - Replica state snapshot.
 * @param {string} serviceId - Canonical service identifier.
 * @return {Object} Mutation options.
 */
function buildCdcPersistenceOptions(replicaState, serviceId) {
  const state = replicaState?.state || null;
  const backgroundWrite = BACKGROUND_PERSISTENCE_STATES.has(state);
  return {
    allowCoalescing: true,
    coalescingKey: `replica-state:${serviceId}`,
    deliveryPriority: backgroundWrite ? LOCAL_STR_BACKGROUND : LOCAL_STR_CRITICAL,
    workClass: backgroundWrite ? LOCAL_STR_BACKGROUND : LOCAL_STR_CRITICAL,
    skipCacheWait: true,
  };
}

/**
 * Resolve the canonical control-plane table gateway for replica persistence.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @return {Object} Control-plane system table gateway.
 */
function getControlPlaneSystemTableGateway(stateMachine) {
  if (stateMachine.controlPlaneSystemTableGateway) {
    return stateMachine.controlPlaneSystemTableGateway;
  }
  stateMachine.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
    nodeId: stateMachine.nodeId,
    getCdcIntegrationService: () => stateMachine.cdcIntegrationService,
  }).controlPlaneSystemTableGateway;
  return stateMachine.controlPlaneSystemTableGateway;
}

export {
  applyTransition,
  armTimeoutClock,
  buildCdcPersistenceOptions,
  buildCreateCdcData,
  buildUpdateCdcData,
  completeRemovalInLane,
  createReplicaRowInCdc,
  getControlPlaneSystemTableGateway,
  hasOtherActivePartitionReplicaOnLeaderNode,
  updateReplicaStateInCdc,
};
