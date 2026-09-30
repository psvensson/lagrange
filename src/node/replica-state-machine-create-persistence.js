import {AddressManager} from '../address/address-manager.js';
import {SERVICE_TYPE, TABLES} from '../constants/index.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from
  '../control-plane/control-plane-system-table-gateway.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {
  REPLICA_CLEANUP_ERROR_CODE,
  cleanupDeferredError,
  isCleanupTombstoneRow,
} from './replica-cleanup-tombstone-owner.js';
import {
  didDurableServiceRowWriteApply,
  reportServiceRowPersisted,
  reportServiceRowPersistenceError,
} from './replica-state-machine-durability.js';
import {clearLeaderOrRecordDebt} from
  './replica-state-machine-leader-clear.js';
import {
  observeAuthoritativeReplicaLifecycle,
  resolveReplicaCreateGroupId,
  rowMatchesReplicaLifecycle,
} from './replica-state-machine-lifecycle-observation.js';
import {
  REPLICA_STATE_MACHINE_LOG_MSG,
  REPLICA_STATE_MACHINE_NUM,
  REPLICA_STATE_MACHINE_STATE,
} from './replica-state-machine-constants.js';
import {
  runPersistedTransitionEffect,
  runSerializedReplicaMutation,
} from './replica-state-machine-serialization.js';

const REPLICA_CREATE_ERROR_CODE = Object.freeze({
  CREATE_OWNER_DEFERRED: 'CREATE_OWNER_DEFERRED',
  IDENTITY_CONFLICT: 'REPLICA_IDENTITY_CONFLICT',
});
const LOCAL_ONLY_TERMINAL_SKIP_STATES = new Set([
  REPLICA_STATE_MACHINE_STATE.REMOVING,
  REPLICA_STATE_MACHINE_STATE.REMOVED,
  REPLICA_STATE_MACHINE_STATE.FAILED,
]);

function createOwnershipError(replicaId, code, cause = null) {
  const error = new Error(`Replica creation ${code}: ${replicaId}`);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = code !== REPLICA_CREATE_ERROR_CODE.IDENTITY_CONFLICT;
  if (cause) error.cause = cause;
  return error;
}

async function resolveInitialInsertOutcome(
  stateMachine,
  serviceId,
  replicaState,
  cause = null,
) {
  const observation = await observeAuthoritativeReplicaLifecycle(
    stateMachine,
    serviceId,
  );
  if (observation.available !== true) {
    throw createOwnershipError(
      serviceId,
      REPLICA_CREATE_ERROR_CODE.CREATE_OWNER_DEFERRED,
      cause,
    );
  }
  if (isCleanupTombstoneRow(observation.row)) {
    throw cleanupDeferredError(
      serviceId,
      REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IN_PROGRESS,
    );
  }
  if (rowMatchesReplicaLifecycle(observation.row, replicaState)) return true;
  throw createOwnershipError(
    serviceId,
    observation.row ? REPLICA_CREATE_ERROR_CODE.IDENTITY_CONFLICT :
      REPLICA_CREATE_ERROR_CODE.CREATE_OWNER_DEFERRED,
    cause,
  );
}

async function createReplicaRowInCdc(stateMachine, replicaState) {
  try {
    const serviceId = replicaState.serviceId || replicaState.replicaId;
    const serviceType = replicaState.serviceType || SERVICE_TYPE.PARTITION;
    const address = replicaState.serviceAddress ||
      AddressManager.getInstance().format(
        replicaState.nodeId,
        serviceType,
        serviceId,
      );
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

    let mutationResult;
    try {
      mutationResult = await stateMachine
        .getControlPlaneSystemTableGateway().submitMutation({
          operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
          tableName: TABLES.SERVICES,
          row: insertData,
        }, persistenceOptions);
    } catch (error) {
      return resolveInitialInsertOutcome(
        stateMachine,
        serviceId,
        replicaState,
        error,
      );
    }
    if (!didDurableServiceRowWriteApply(mutationResult)) {
      return resolveInitialInsertOutcome(
        stateMachine,
        serviceId,
        replicaState,
      );
    }
    await clearLeaderOrRecordDebt(stateMachine, replicaState, null);
    reportServiceRowPersisted(stateMachine, replicaState);
    return mutationResult;
  } catch (error) {
    reportServiceRowPersistenceError(stateMachine, replicaState, error);
    throw error;
  }
}

async function reconcileOneLocalOnlyServiceRow(
  stateMachine,
  serviceId,
  retryState,
  nowMs,
) {
  const replicaState = stateMachine.replicas.get(serviceId) || null;
  if (!replicaState ||
      LOCAL_ONLY_TERMINAL_SKIP_STATES.has(replicaState.state)) {
    stateMachine.clearServiceRowLocalOnly(serviceId);
    return REPLICA_STATE_MACHINE_NUM.ZERO;
  }
  const stampedState = {
    ...replicaState,
    groupId: resolveReplicaCreateGroupId(
      stateMachine,
      replicaState,
      serviceId,
    ),
    durableUpdatedAt: nowMs,
  };
  try {
    await Promise.resolve(runSerializedReplicaMutation(
      stateMachine,
      serviceId,
      async () => {
        // D2: the reconcile's create is the deferred durable effect of the
        // transition that seeded this row locally, so it crosses the same
        // activation boundary: a durable ACTIVE is written only while the
        // exact transport handler of this generation stays registered, and
        // handler retirement waits for that write. A row whose deferring
        // owner supplied no handler check cannot become a durable ACTIVE by
        // this path; it stays local-only retry debt.
        const result = await runPersistedTransitionEffect(
          stateMachine,
          serviceId,
          replicaState.state,
          {
            isEffectHandlerCurrent: stateMachine
              .localOnlyServiceRowActivationByServiceId.get(serviceId),
          },
          () => stateMachine._createReplicaRowInCdc(stampedState),
        );
        if (result === true ||
            classifyControlPlaneMutationResult(result).applied) {
          replicaState.groupId = stampedState.groupId;
          replicaState.lifecycleIdentityAuthoritative = true;
          stateMachine.clearServiceRowLocalOnly(serviceId);
        }
        return result;
      },
    ));
  } catch (_error) {
    stateMachine._armLocalOnlyServiceRowRetry(
      serviceId,
      retryState,
      nowMs,
    );
    return REPLICA_STATE_MACHINE_NUM.ZERO;
  }
  if (stateMachine.localOnlyServiceRowIds.has(serviceId)) {
    stateMachine._armLocalOnlyServiceRowRetry(
      serviceId,
      retryState,
      nowMs,
    );
    return REPLICA_STATE_MACHINE_NUM.ZERO;
  }
  stateMachine.logger.info(
    REPLICA_STATE_MACHINE_LOG_MSG.LOCAL_ONLY_ROW_CONVERGED,
    {
      replicaId: replicaState.replicaId,
      partitionId: replicaState.partitionId,
      state: replicaState.state,
      nodeId: stateMachine.nodeId,
    },
  );
  return REPLICA_STATE_MACHINE_NUM.ONE;
}

async function reconcileLocalOnlyServiceRows(stateMachine) {
  if (stateMachine.localOnlyServiceRowReconcileInFlight === true ||
      stateMachine.localOnlyServiceRowIds.size ===
        REPLICA_STATE_MACHINE_NUM.ZERO) {
    return REPLICA_STATE_MACHINE_NUM.ZERO;
  }
  stateMachine.localOnlyServiceRowReconcileInFlight = true;
  let persisted = REPLICA_STATE_MACHINE_NUM.ZERO;
  try {
    for (const serviceId of [...stateMachine.localOnlyServiceRowIds]) {
      if (!stateMachine.localOnlyServiceRowIds.has(serviceId)) continue;
      const nowMs = stateMachine.now();
      const retryState = stateMachine
        .localOnlyServiceRowRetryStateByServiceId.get(serviceId) || null;
      if (retryState && nowMs < retryState.notBeforeMs ||
          stateMachine.serviceRowPersistInFlightByServiceId.has(serviceId)) {
        continue;
      }
      persisted += await reconcileOneLocalOnlyServiceRow(
        stateMachine,
        serviceId,
        retryState,
        nowMs,
      );
    }
  } finally {
    stateMachine.localOnlyServiceRowReconcileInFlight = false;
  }
  return persisted;
}

export {
  createReplicaRowInCdc,
  reconcileLocalOnlyServiceRows,
};
