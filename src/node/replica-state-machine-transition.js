import {AddressManager} from '../address/address-manager.js';
import {
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';
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
const CLEARS_CANONICAL_PARTITION_LEADER_STATES = new Set([
  ReplicaState.REMOVING,
  ReplicaState.REMOVED,
  ReplicaState.FAILED,
]);
const RETAINS_CANONICAL_PARTITION_LEADER_SERVICE_STATES = new Set([
  ReplicaState.ACTIVE,
]);

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
  const existingState = stateMachine.replicas.get(replicaId);
  const currentState = existingState ? existingState.state : null;
  const validate = options.validate !== false;
  const persist = options.persist !== false;

  if (validate && !stateMachine.isValidTransition(currentState, newState)) {
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

  const now = stateMachine.now();
  const previousState = currentState;
  const timeInPreviousState = existingState ?
    now - existingState.stateEnteredAt : REPLICA_STATE_MACHINE_NUM.ZERO;
  const replicaState = {
    replicaId,
    partitionId: context.partitionId || existingState?.partitionId || null,
    nodeId: context.nodeId || existingState?.nodeId || stateMachine.nodeId,
    state: newState,
    stateEnteredAt: now,
    timeoutStartedAt: null,
    previousState,
    triggerReason: context.reason || REPLICA_STATE_MACHINE_REASON.UNKNOWN,
    errorMessage: context.errorMessage || null,
    metadata: context.metadata || existingState?.metadata || {},
    serviceId: context.serviceId || existingState?.serviceId || null,
    serviceType: context.serviceType || existingState?.serviceType ||
      SERVICE_TYPE.PARTITION,
    serviceAddress: context.serviceAddress || existingState?.serviceAddress ||
      null,
  };
  const commitTransition = () => {
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
  };

  if (!persist) {
    commitTransition();
    stateMachine._armTimeoutClock(replicaId);
    return true;
  }

  // CL-021: serialize this row's durable writes against the local-only
  // reconcile (replica-state-machine.js _reconcileLocalOnlyServiceRows).
  // Both paths submit full-row writes; unserialized, a reconcile carrying
  // the PRE-transition state could land after this transition's write and
  // regress the durable row. The reconcile skips rows with an in-flight
  // transition persist; transitions chain after an in-flight reconcile.
  const startPersist = () => previousState === null ?
    stateMachine._createReplicaRowInCdc(replicaState) :
    stateMachine._updateReplicaStateInCdc(replicaState, previousState);
  const inFlightMap = stateMachine.serviceRowPersistInFlightByServiceId;
  const previousInFlight = inFlightMap?.get(replicaId) || null;
  // No previous in-flight write: start synchronously (callers and tests
  // depend on the persist beginning within the current microtask).
  const persistencePromise = previousInFlight ?
    previousInFlight.catch(() => null).then(startPersist) :
    Promise.resolve(startPersist());
  const clearInFlight = () => {
    if (inFlightMap?.get(replicaId) === persistencePromise) {
      inFlightMap.delete(replicaId);
    }
  };
  inFlightMap?.set(replicaId, persistencePromise);

  return persistencePromise.then((result) => {
    clearInFlight();
    commitTransition();
    stateMachine._armTimeoutClock(replicaId);
    return result;
  }, (error) => {
    clearInFlight();
    throw error;
  });
}

/**
 * Create the initial services row for a newly tracked replica.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {Object} replicaState - The replica state to persist.
 * @return {Promise<boolean>} True if persistence succeeded.
 */
async function createReplicaRowInCdc(stateMachine, replicaState) {
  try {
    const serviceId = replicaState.serviceId || replicaState.replicaId;
    const addressManager = AddressManager.getInstance();
    const serviceType = replicaState.serviceType || SERVICE_TYPE.PARTITION;
    const address = replicaState.serviceAddress ||
      addressManager.format(replicaState.nodeId, serviceType, serviceId);
    const insertData = stateMachine._buildCreateCdcData(
      replicaState,
      serviceId,
      serviceType,
      address,
    );
    const persistenceOptions = stateMachine._buildCdcPersistenceOptions(
      replicaState,
      serviceId,
    );

    await stateMachine.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SERVICES,
      row: insertData,
    }, persistenceOptions);
    await stateMachine._clearCanonicalPartitionLeaderIfNeeded(replicaState);

    stateMachine.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSISTED, {
      replicaId: replicaState.replicaId,
      state: replicaState.state,
      nodeId: stateMachine.nodeId,
    });

    return true;
  } catch (error) {
    stateMachine.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSIST_FAILED, {
      replicaId: replicaState.replicaId,
      state: replicaState.state,
      error: error.message,
      nodeId: stateMachine.nodeId,
    });

    stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.PERSISTENCE_ERROR, {
      replicaId: replicaState.replicaId,
      state: replicaState.state,
      error: error.message,
    });

    throw error;
  }
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
    const serviceType = replicaState.serviceType || SERVICE_TYPE.PARTITION;
    const addressManager = AddressManager.getInstance();
    const address = replicaState.serviceAddress ||
      addressManager.format(replicaState.nodeId, serviceType, serviceId);
    const persistenceOptions = stateMachine._buildCdcPersistenceOptions(
      replicaState,
      serviceId,
    );
    const hasServiceCacheLookup =
      typeof stateMachine.systemTableCache?.get === 'function';
    const cachedService = hasServiceCacheLookup ?
      stateMachine.systemTableCache.get(TABLES.SERVICES, serviceId) :
      null;
    // CL-016: the local cache no longer proxies REMOTE existence — the
    // priority create fallback seeds a local-only services row while the
    // durable write is deferred. For such rows an UPDATE could target a
    // row the distributed table never received; UPSERT is idempotent and
    // converges either way. The marker clears when a durable write
    // commits.
    const remoteExistenceUnconfirmed =
      typeof stateMachine.isServiceRowLocalOnly === 'function' &&
      stateMachine.isServiceRowLocalOnly(serviceId);
    const shouldUpsertMissingServiceRow =
      (hasServiceCacheLookup && !cachedService) ||
      remoteExistenceUnconfirmed;
    const mutation = shouldUpsertMissingServiceRow ?
      {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName: TABLES.SERVICES,
        row: stateMachine._buildCreateCdcData(
          replicaState,
          serviceId,
          serviceType,
          address,
        ),
      } :
      {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause: {service_id: serviceId},
        data: stateMachine._buildUpdateCdcData(replicaState, previousState),
      };
    await stateMachine.getControlPlaneSystemTableGateway().submitMutation(
      mutation,
      persistenceOptions,
    );
    if (typeof stateMachine.clearServiceRowLocalOnly === 'function') {
      // Durable write committed — remote existence confirmed (CL-016).
      stateMachine.clearServiceRowLocalOnly(serviceId);
    }
    await stateMachine._clearCanonicalPartitionLeaderIfNeeded(replicaState);

    stateMachine.logger.debug(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSISTED, {
      replicaId: replicaState.replicaId,
      state: replicaState.state,
      nodeId: stateMachine.nodeId,
    });

    return true;
  } catch (error) {
    stateMachine.logger.error(REPLICA_STATE_MACHINE_LOG_MSG.STATE_PERSIST_FAILED, {
      replicaId: replicaState.replicaId,
      state: replicaState.state,
      error: error.message,
      nodeId: stateMachine.nodeId,
    });

    stateMachine.emit(REPLICA_STATE_MACHINE_EVENT.PERSISTENCE_ERROR, {
      replicaId: replicaState.replicaId,
      state: replicaState.state,
      error: error.message,
    });

    throw error;
  }
}

/**
 * Clear a canonical partition leader when the current replica can no longer
 * retain that leadership.
 * @param {ReplicaStateMachine} stateMachine - Owning state machine instance.
 * @param {Object} replicaState - The replica state to inspect.
 * @return {Promise<void>}
 */
async function clearCanonicalPartitionLeaderIfNeeded(
  stateMachine,
  replicaState,
) {
  if (!replicaState ||
      replicaState.serviceType !== SERVICE_TYPE.PARTITION ||
      !CLEARS_CANONICAL_PARTITION_LEADER_STATES.has(replicaState.state) ||
      typeof replicaState.partitionId !== 'string' ||
      replicaState.partitionId.length === 0 ||
      typeof replicaState.nodeId !== 'string' ||
      replicaState.nodeId.length === 0) {
    return;
  }
  if (stateMachine.hasOtherActivePartitionReplicaOnLeaderNode(replicaState)) {
    return;
  }

  await stateMachine.getControlPlaneSystemTableGateway().submitMutation({
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.PARTITIONS,
    whereClause: {
      partition_id: replicaState.partitionId,
      leader_node_id: replicaState.nodeId,
    },
    data: {
      leader_node_id: null,
      updated_at: replicaState.stateEnteredAt,
    },
  }, {
    allowCoalescing: true,
    coalescingKey: `partitions:leader:${replicaState.partitionId}`,
    deliveryPriority: LOCAL_STR_CRITICAL,
    workClass: LOCAL_STR_CRITICAL,
    skipCacheWait: true,
  });
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
  const cdcData = {
    status: replicaState.state,
    state_entered_at: replicaState.stateEnteredAt,
    previous_state: previousState,
    trigger_reason: replicaState.triggerReason,
    updated_at: replicaState.stateEnteredAt,
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
  if (
    typeof cachedRow?.group_id === 'string' &&
    cachedRow.group_id.length > 0
  ) {
    preservedColumns.group_id = cachedRow.group_id;
  }
  return {
    ...preservedColumns,
    ...stateMachine._buildUpdateCdcData(replicaState, null),
    service_id: serviceId,
    service_type: serviceType,
    node_id: replicaState.nodeId,
    partition_id: replicaState.partitionId,
    replica_id: replicaState.replicaId,
    address,
    created_at: replicaState.stateEnteredAt,
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
  clearCanonicalPartitionLeaderIfNeeded,
  createReplicaRowInCdc,
  getControlPlaneSystemTableGateway,
  hasOtherActivePartitionReplicaOnLeaderNode,
  updateReplicaStateInCdc,
};
