import {
  NUM,
  SERVICE_LIFECYCLE_OPERATION,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_OPERATION_STATE,
  TYPEOF,
} from '../constants/index.js';
import {
  LIFECYCLE_MGR_MSG,
  SERVICE_LIFECYCLE_LOG,
  SERVICE_LIFECYCLE_METRIC_STATUS,
  resolveServiceFields,
} from './service-lifecycle-common.js';

const OPERATION_COMMAND_SEPARATOR = ':';
const RECOVERY_RESULT_STATUS = Object.freeze({
  RECOVERED: 'recovered',
  SKIPPED: 'skipped',
  FAILED: 'failed',
});
const RECOVERY_SKIP_REASON = Object.freeze({
  INVALID_COMMAND: 'invalid_operation_command',
  UNKNOWN_OPERATION: 'unknown_lifecycle_operation',
  UNRESOLVED_SERVICE: 'unresolved_service_context',
});
const RECOVERABLE_OPERATION_STATES = Object.freeze([
  SERVICE_OPERATION_STATE.PENDING,
  SERVICE_OPERATION_STATE.IN_PROGRESS,
]);

function buildRecoveryResult(status, fields = {}) {
  return {status, ...fields};
}

function parseOperationCommand(command) {
  if (typeof command !== TYPEOF.STRING) {
    return null;
  }
  const separatorIndex = command.indexOf(OPERATION_COMMAND_SEPARATOR);
  if (separatorIndex <= NUM.ZERO) {
    return null;
  }
  const lifecycleOperation = command.slice(0, separatorIndex);
  const serviceId = command.slice(separatorIndex + OPERATION_COMMAND_SEPARATOR.length);
  if (!serviceId) {
    return null;
  }
  return {lifecycleOperation, serviceId};
}

async function promoteRecoveryJournalState(manager, {
  operation,
  serviceId,
  lifecycleOperation,
  journalState,
}) {
  if (journalState !== SERVICE_OPERATION_STATE.PENDING) {
    return journalState;
  }
  await manager._journalTransition(
    operation,
    serviceId,
    lifecycleOperation,
    SERVICE_OPERATION_STATE.PENDING,
    SERVICE_OPERATION_STATE.IN_PROGRESS,
  );
  return SERVICE_OPERATION_STATE.IN_PROGRESS;
}

async function failRecoveryJournalState(manager, {
  operation,
  serviceId,
  lifecycleOperation,
  journalState,
  errorMessage,
}) {
  const promotedState = await promoteRecoveryJournalState(manager, {
    operation,
    serviceId,
    lifecycleOperation,
    journalState,
  }).catch(() => journalState);
  if (promotedState === SERVICE_OPERATION_STATE.IN_PROGRESS) {
    await manager._journalTransition(
      operation,
      serviceId,
      lifecycleOperation,
      SERVICE_OPERATION_STATE.IN_PROGRESS,
      SERVICE_OPERATION_STATE.FAILED,
      {message: errorMessage},
    ).catch(() => {});
  }
  return promotedState;
}

async function recoverOperationRow(manager, operationRow, resolveServiceContext, defaultContext) {
  const operationId = operationRow.operation_id || operationRow.operationId;
  const operationState = operationRow.state;
  const operation = {operationId};
  const parsed = parseOperationCommand(operationRow.command);
  const recoveryStartedAt = Date.now();
  if (!operationId) {
    throw new TypeError(LIFECYCLE_MGR_MSG.OPERATION_ID_REQUIRED);
  }
  if (!RECOVERABLE_OPERATION_STATES.includes(operationState)) {
    return buildRecoveryResult(RECOVERY_RESULT_STATUS.SKIPPED, {
      operationId,
      reason: RECOVERY_SKIP_REASON.UNKNOWN_OPERATION,
    });
  }
  if (!parsed) {
    return buildRecoveryResult(RECOVERY_RESULT_STATUS.SKIPPED, {
      operationId,
      reason: RECOVERY_SKIP_REASON.INVALID_COMMAND,
      error: LIFECYCLE_MGR_MSG.OPERATION_COMMAND_INVALID,
    });
  }
  const lifecycleOperation = parsed.lifecycleOperation;
  const serviceId = parsed.serviceId;
  let journalState = operationState;
  let resolvedServiceContext = null;
  let replicaId = null;
  try {
    resolvedServiceContext = await resolveServiceContext({
      operationId,
      operationState,
      lifecycleOperation,
      serviceId,
      operationRow,
    });
    if (!resolvedServiceContext) {
      return buildRecoveryResult(RECOVERY_RESULT_STATUS.SKIPPED, {
        operationId,
        serviceId,
        lifecycleOperation,
        reason: RECOVERY_SKIP_REASON.UNRESOLVED_SERVICE,
      });
    }
    const serviceContext =
      resolvedServiceContext.definition ||
      resolvedServiceContext.replicaHandle ||
      resolvedServiceContext;
    const {serviceType, replicaId: resolvedReplicaId} = resolveServiceFields(serviceContext);
    replicaId = resolvedReplicaId;
    const adapter = manager._resolveAdapter(serviceType);
    const runtimeContext = resolvedServiceContext.context || defaultContext;
    let result = null;
    manager._logger.debug(SERVICE_LIFECYCLE_LOG.RECOVERY_START, {
      ...manager._buildLifecycleLogContext(
        lifecycleOperation,
        resolvedServiceContext.definition ||
          resolvedServiceContext.replicaHandle ||
          serviceContext,
        runtimeContext,
        {operationId},
      ),
      operationState,
    });
    journalState = await promoteRecoveryJournalState(manager, {
      operation,
      serviceId,
      lifecycleOperation,
      journalState,
    });
    if (lifecycleOperation === SERVICE_LIFECYCLE_OPERATION.CREATE) {
      await manager._enforceRuntimePolicy(
        lifecycleOperation,
        resolvedServiceContext.definition || serviceContext,
        runtimeContext,
      );
      result = await adapter.createReplica({
        definition: resolvedServiceContext.definition || serviceContext,
        context: runtimeContext,
      });
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.CREATED);
    } else if (lifecycleOperation === SERVICE_LIFECYCLE_OPERATION.START) {
      const replicaHandle = resolvedServiceContext.replicaHandle || serviceContext;
      await manager._enforceRuntimePolicy(lifecycleOperation, replicaHandle, runtimeContext);
      const currentState = manager.getReplicaState(replicaHandle);
      manager._assertTransition(
        serviceId,
        lifecycleOperation,
        currentState,
        SERVICE_LIFECYCLE_STATE.STARTING,
      );
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STARTING);
      result = await adapter.startReplica(replicaHandle, runtimeContext);
      manager._assertTransition(
        serviceId,
        lifecycleOperation,
        SERVICE_LIFECYCLE_STATE.STARTING,
        SERVICE_LIFECYCLE_STATE.RUNNING,
      );
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.RUNNING);
    } else if (lifecycleOperation === SERVICE_LIFECYCLE_OPERATION.STOP) {
      const replicaHandle = resolvedServiceContext.replicaHandle || serviceContext;
      const currentState = manager.getReplicaState(replicaHandle);
      manager._assertTransition(
        serviceId,
        lifecycleOperation,
        currentState,
        SERVICE_LIFECYCLE_STATE.STOPPING,
      );
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPING);
      result = await adapter.stopReplica(replicaHandle, runtimeContext);
      manager._assertTransition(
        serviceId,
        lifecycleOperation,
        SERVICE_LIFECYCLE_STATE.STOPPING,
        SERVICE_LIFECYCLE_STATE.STOPPED,
      );
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPED);
    } else if (lifecycleOperation === SERVICE_LIFECYCLE_OPERATION.RESTART) {
      const replicaHandle = resolvedServiceContext.replicaHandle || serviceContext;
      await manager._enforceRuntimePolicy(lifecycleOperation, replicaHandle, runtimeContext);
      const currentState = manager.getReplicaState(replicaHandle);
      manager._assertTransition(
        serviceId,
        lifecycleOperation,
        currentState,
        SERVICE_LIFECYCLE_STATE.STOPPING,
      );
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPING);
      await adapter.stopReplica(replicaHandle, runtimeContext);
      manager._assertTransition(
        serviceId,
        lifecycleOperation,
        SERVICE_LIFECYCLE_STATE.STOPPING,
        SERVICE_LIFECYCLE_STATE.STOPPED,
      );
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPED);
      manager._assertTransition(
        serviceId,
        lifecycleOperation,
        SERVICE_LIFECYCLE_STATE.STOPPED,
        SERVICE_LIFECYCLE_STATE.STARTING,
      );
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STARTING);
      result = await adapter.startReplica(replicaHandle, runtimeContext);
      manager._assertTransition(
        serviceId,
        lifecycleOperation,
        SERVICE_LIFECYCLE_STATE.STARTING,
        SERVICE_LIFECYCLE_STATE.RUNNING,
      );
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.RUNNING);
    } else {
      return buildRecoveryResult(RECOVERY_RESULT_STATUS.SKIPPED, {
        operationId,
        serviceId,
        lifecycleOperation,
        reason: RECOVERY_SKIP_REASON.UNKNOWN_OPERATION,
      });
    }
    await manager._journalTransition(
      operation,
      serviceId,
      lifecycleOperation,
      journalState,
      SERVICE_OPERATION_STATE.COMPLETED,
      result,
    );
    manager._recordLifecycleOutcome(
      lifecycleOperation,
      resolvedServiceContext.definition || resolvedServiceContext.replicaHandle || serviceContext,
      runtimeContext,
      {
        operationId,
        status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
        durationMs: Date.now() - recoveryStartedAt,
        recovery: true,
      },
    );
    return buildRecoveryResult(RECOVERY_RESULT_STATUS.RECOVERED, {
      operationId,
      serviceId,
      lifecycleOperation,
    });
  } catch (error) {
    if (replicaId) {
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.FAILED);
    }
    await failRecoveryJournalState(manager, {
      operation,
      serviceId,
      lifecycleOperation,
      journalState,
      errorMessage: error.message,
    });
    const failureContext = resolvedServiceContext?.definition ||
      resolvedServiceContext?.replicaHandle || {serviceId};
    const failureRuntimeContext = resolvedServiceContext?.context || defaultContext;
    manager._recordLifecycleOutcome(lifecycleOperation, failureContext, failureRuntimeContext, {
      operationId,
      status: SERVICE_LIFECYCLE_METRIC_STATUS.FAILURE,
      durationMs: Date.now() - recoveryStartedAt,
      recovery: true,
      error,
    });
    return buildRecoveryResult(RECOVERY_RESULT_STATUS.FAILED, {
      operationId,
      serviceId,
      lifecycleOperation,
      error: error.message,
    });
  }
}

async function recoverPendingOperations(manager, options = {}) {
  const resolveServiceContext = options.resolveServiceContext;
  if (typeof resolveServiceContext !== TYPEOF.FUNCTION) {
    throw new TypeError(LIFECYCLE_MGR_MSG.RECOVERY_RESOLVER_REQUIRED);
  }
  const defaultContext = options.context || {};
  const operationRows = await manager._readRecoverableOperations();
  const recoveryResults = [];
  for (const operationRow of operationRows) {
    const result = await recoverOperationRow(
      manager,
      operationRow,
      resolveServiceContext,
      defaultContext,
    );
    recoveryResults.push(result);
  }
  return recoveryResults;
}

export {recoverPendingOperations};
