import {AddressManager} from '../address/address-manager.js';
import {SERVICE_TYPE, TABLES} from '../constants/index.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from
  '../control-plane/control-plane-system-table-gateway.js';
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
  rowMatchesReplicaLifecycle,
} from './replica-state-machine-lifecycle-observation.js';

const REPLICA_CREATE_ERROR_CODE = Object.freeze({
  CREATE_OWNER_DEFERRED: 'CREATE_OWNER_DEFERRED',
  IDENTITY_CONFLICT: 'REPLICA_IDENTITY_CONFLICT',
});

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

export {createReplicaRowInCdc};
