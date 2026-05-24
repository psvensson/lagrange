import {
  SERVICE_LIFECYCLE_OPERATION,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_OPERATION_STATE,
} from '../constants/index.js';
import {assertServiceDescriptor} from './service-descriptor.js';
import {ServiceDescriptorValidationError} from './service-lifecycle-errors.js';
import {
  SERVICE_LIFECYCLE_LOG,
  SERVICE_LIFECYCLE_MANAGER_LITERAL,
  SERVICE_LIFECYCLE_METRIC_STATUS,
  resolveServiceFields,
} from './service-lifecycle-common.js';

async function createReplica(manager, definition, context = {}, options = {}) {
  const startedAt = Date.now();
  let canonicalDefinition = null;
  const lifecycleOperation = SERVICE_LIFECYCLE_OPERATION.CREATE;
  let operation = null;
  let serviceId = null;
  let serviceType = null;
  let tenantId = null;
  let replicaId = null;
  try {
    canonicalDefinition = assertServiceDescriptor(definition, {
      adapterResolver: (serviceType) => manager._adapters.get(serviceType),
    });
    ({serviceId, serviceType, tenantId, replicaId} = resolveServiceFields(canonicalDefinition));
    const adapter = manager._resolveAdapter(serviceType);
    manager._logger.debug(SERVICE_LIFECYCLE_LOG.OPERATION_START, {
      ...manager._buildLifecycleLogContext(lifecycleOperation, canonicalDefinition, context, {
        operationId: null,
      }),
    });
    await manager._enforceRuntimePolicy(lifecycleOperation, canonicalDefinition, context);
    const definitionValidation = adapter.validateDefinition(canonicalDefinition);
    if (!definitionValidation.valid) {
      throw new ServiceDescriptorValidationError(
        definitionValidation.errors || [
          SERVICE_LIFECYCLE_MANAGER_LITERAL.ADAPTER_REJECTED_SERVICE_DEFINITION,
        ],
        {serviceId, serviceType},
      );
    }
    const idempotencyKey = options.idempotencyKey || null;
    operation = await manager._journalCreate(
      tenantId,
      serviceId,
      lifecycleOperation,
      idempotencyKey,
    );
    if (operation?.idempotent) {
      const idempotentResult = {
        operationId: operation.operationId,
        idempotent: true,
        status: operation.existing.state || SERVICE_OPERATION_STATE.PENDING,
      };
      manager._recordLifecycleOutcome(lifecycleOperation, canonicalDefinition, context, {
        operationId: operation.operationId,
        status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
        durationMs: Date.now() - startedAt,
      });
      return idempotentResult;
    }
    await manager._journalTransition(
      operation,
      serviceId,
      lifecycleOperation,
      SERVICE_OPERATION_STATE.PENDING,
      SERVICE_OPERATION_STATE.IN_PROGRESS,
    );
    const result = await adapter.createReplica({definition: canonicalDefinition, context});
    manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.CREATED);
    await manager._journalTransition(
      operation,
      serviceId,
      lifecycleOperation,
      SERVICE_OPERATION_STATE.IN_PROGRESS,
      SERVICE_OPERATION_STATE.COMPLETED,
      result,
    );
    manager._recordLifecycleOutcome(lifecycleOperation, canonicalDefinition, context, {
      operationId: operation?.operationId || null,
      status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
      durationMs: Date.now() - startedAt,
    });
    return {...result, operationId: operation?.operationId};
  } catch (error) {
    if (replicaId) {
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.FAILED);
    }
    if (operation) {
      await manager._journalTransition(
        operation,
        serviceId,
        lifecycleOperation,
        SERVICE_OPERATION_STATE.IN_PROGRESS,
        SERVICE_OPERATION_STATE.FAILED,
        {message: error.message},
      ).catch(() => {});
    }
    manager._recordLifecycleOutcome(
      lifecycleOperation,
      canonicalDefinition || definition || {},
      context,
      {
        operationId: operation?.operationId || null,
        status: SERVICE_LIFECYCLE_METRIC_STATUS.FAILURE,
        durationMs: Date.now() - startedAt,
        error,
      },
    );
    throw error;
  }
}

async function startReplica(manager, replicaHandle, context = {}, options = {}) {
  const startedAt = Date.now();
  const lifecycleOperation = SERVICE_LIFECYCLE_OPERATION.START;
  let operation = null;
  let serviceId = null;
  let tenantId = null;
  let replicaId = null;
  try {
    const {serviceType} = resolveServiceFields(replicaHandle);
    ({serviceId, tenantId, replicaId} = resolveServiceFields(replicaHandle));
    const adapter = manager._resolveAdapter(serviceType);
    const idempotencyKey = options.idempotencyKey || null;
    manager._logger.debug(SERVICE_LIFECYCLE_LOG.OPERATION_START, {
      ...manager._buildLifecycleLogContext(lifecycleOperation, replicaHandle, context, {
        operationId: null,
      }),
    });
    await manager._enforceRuntimePolicy(lifecycleOperation, replicaHandle, context);
    const currentState = manager.getReplicaState(replicaHandle);
    manager._assertTransition(
      serviceId,
      lifecycleOperation,
      currentState,
      SERVICE_LIFECYCLE_STATE.STARTING,
    );
    operation = await manager._journalCreate(
      tenantId,
      serviceId,
      lifecycleOperation,
      idempotencyKey,
    );
    if (operation?.idempotent) {
      const idempotentResult = {
        operationId: operation.operationId,
        idempotent: true,
        status: operation.existing.state || SERVICE_OPERATION_STATE.PENDING,
      };
      manager._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, {
        operationId: operation.operationId,
        status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
        durationMs: Date.now() - startedAt,
      });
      return idempotentResult;
    }

    manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STARTING);

    await manager._journalTransition(
      operation,
      serviceId,
      lifecycleOperation,
      SERVICE_OPERATION_STATE.PENDING,
      SERVICE_OPERATION_STATE.IN_PROGRESS,
    );

    const result = await adapter.startReplica(replicaHandle, context);
    manager._assertTransition(
      serviceId,
      lifecycleOperation,
      SERVICE_LIFECYCLE_STATE.STARTING,
      SERVICE_LIFECYCLE_STATE.RUNNING,
    );
    manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.RUNNING);

    await manager._journalTransition(
      operation,
      serviceId,
      lifecycleOperation,
      SERVICE_OPERATION_STATE.IN_PROGRESS,
      SERVICE_OPERATION_STATE.COMPLETED,
      result,
    );

    manager._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, {
      operationId: operation?.operationId || null,
      status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
      durationMs: Date.now() - startedAt,
    });

    return {
      ...result,
      operationId: operation?.operationId,
    };
  } catch (error) {
    if (replicaId) {
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.FAILED);
    }
    if (operation) {
      await manager._journalTransition(
        operation,
        serviceId,
        lifecycleOperation,
        SERVICE_OPERATION_STATE.IN_PROGRESS,
        SERVICE_OPERATION_STATE.FAILED,
        {message: error.message},
      ).catch(() => {});
    }
    manager._recordLifecycleOutcome(lifecycleOperation, replicaHandle || {}, context, {
      operationId: operation?.operationId || null,
      status: SERVICE_LIFECYCLE_METRIC_STATUS.FAILURE,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}

async function stopReplica(manager, replicaHandle, context = {}, options = {}) {
  const startedAt = Date.now();
  const lifecycleOperation = SERVICE_LIFECYCLE_OPERATION.STOP;
  let operation = null;
  let serviceId = null;
  let tenantId = null;
  let replicaId = null;

  try {
    const {serviceType} = resolveServiceFields(replicaHandle);
    ({serviceId, tenantId, replicaId} = resolveServiceFields(replicaHandle));
    const adapter = manager._resolveAdapter(serviceType);
    const idempotencyKey = options.idempotencyKey || null;

    manager._logger.debug(SERVICE_LIFECYCLE_LOG.OPERATION_START, {
      ...manager._buildLifecycleLogContext(lifecycleOperation, replicaHandle, context, {
        operationId: null,
      }),
    });

    const currentState = manager.getReplicaState(replicaHandle);
    manager._assertTransition(
      serviceId,
      lifecycleOperation,
      currentState,
      SERVICE_LIFECYCLE_STATE.STOPPING,
    );

    operation = await manager._journalCreate(
      tenantId,
      serviceId,
      lifecycleOperation,
      idempotencyKey,
    );
    if (operation?.idempotent) {
      const idempotentResult = {
        operationId: operation.operationId,
        idempotent: true,
        status: operation.existing.state || SERVICE_OPERATION_STATE.PENDING,
      };
      manager._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, {
        operationId: operation.operationId,
        status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
        durationMs: Date.now() - startedAt,
      });
      return idempotentResult;
    }

    manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPING);

    await manager._journalTransition(
      operation,
      serviceId,
      lifecycleOperation,
      SERVICE_OPERATION_STATE.PENDING,
      SERVICE_OPERATION_STATE.IN_PROGRESS,
    );

    const result = await adapter.stopReplica(replicaHandle, context);
    manager._assertTransition(
      serviceId,
      lifecycleOperation,
      SERVICE_LIFECYCLE_STATE.STOPPING,
      SERVICE_LIFECYCLE_STATE.STOPPED,
    );
    manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPED);

    await manager._journalTransition(
      operation,
      serviceId,
      lifecycleOperation,
      SERVICE_OPERATION_STATE.IN_PROGRESS,
      SERVICE_OPERATION_STATE.COMPLETED,
      result,
    );

    manager._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, {
      operationId: operation?.operationId || null,
      status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
      durationMs: Date.now() - startedAt,
    });

    return {
      ...result,
      operationId: operation?.operationId,
    };
  } catch (error) {
    if (replicaId) {
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.FAILED);
    }
    if (operation) {
      await manager._journalTransition(
        operation,
        serviceId,
        lifecycleOperation,
        SERVICE_OPERATION_STATE.IN_PROGRESS,
        SERVICE_OPERATION_STATE.FAILED,
        {message: error.message},
      ).catch(() => {});
    }
    manager._recordLifecycleOutcome(lifecycleOperation, replicaHandle || {}, context, {
      operationId: operation?.operationId || null,
      status: SERVICE_LIFECYCLE_METRIC_STATUS.FAILURE,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}

async function restartReplica(manager, replicaHandle, context = {}, options = {}) {
  const startedAt = Date.now();
  const lifecycleOperation = SERVICE_LIFECYCLE_OPERATION.RESTART;
  let operation = null;
  let serviceId = null;
  let tenantId = null;
  let replicaId = null;

  try {
    const {serviceType} = resolveServiceFields(replicaHandle);
    ({serviceId, tenantId, replicaId} = resolveServiceFields(replicaHandle));
    const adapter = manager._resolveAdapter(serviceType);
    const idempotencyKey = options.idempotencyKey || null;

    manager._logger.debug(SERVICE_LIFECYCLE_LOG.OPERATION_START, {
      ...manager._buildLifecycleLogContext(lifecycleOperation, replicaHandle, context, {
        operationId: null,
      }),
    });

    await manager._enforceRuntimePolicy(lifecycleOperation, replicaHandle, context);

    const currentState = manager.getReplicaState(replicaHandle);
    manager._assertTransition(
      serviceId,
      lifecycleOperation,
      currentState,
      SERVICE_LIFECYCLE_STATE.STOPPING,
    );

    operation = await manager._journalCreate(
      tenantId,
      serviceId,
      lifecycleOperation,
      idempotencyKey,
    );
    if (operation?.idempotent) {
      const idempotentResult = {
        operationId: operation.operationId,
        idempotent: true,
        status: operation.existing.state || SERVICE_OPERATION_STATE.PENDING,
      };
      manager._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, {
        operationId: operation.operationId,
        status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
        durationMs: Date.now() - startedAt,
      });
      return idempotentResult;
    }

    await manager._journalTransition(
      operation,
      serviceId,
      lifecycleOperation,
      SERVICE_OPERATION_STATE.PENDING,
      SERVICE_OPERATION_STATE.IN_PROGRESS,
    );

    manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.STOPPING);
    await adapter.stopReplica(replicaHandle, context);

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

    const startResult = await adapter.startReplica(replicaHandle, context);

    manager._assertTransition(
      serviceId,
      lifecycleOperation,
      SERVICE_LIFECYCLE_STATE.STARTING,
      SERVICE_LIFECYCLE_STATE.RUNNING,
    );
    manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.RUNNING);

    await manager._journalTransition(
      operation,
      serviceId,
      lifecycleOperation,
      SERVICE_OPERATION_STATE.IN_PROGRESS,
      SERVICE_OPERATION_STATE.COMPLETED,
      startResult,
    );

    manager._recordLifecycleOutcome(lifecycleOperation, replicaHandle, context, {
      operationId: operation?.operationId || null,
      status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
      durationMs: Date.now() - startedAt,
    });

    return {
      ...startResult,
      operationId: operation?.operationId,
    };
  } catch (error) {
    if (replicaId) {
      manager._replicaStateById.set(replicaId, SERVICE_LIFECYCLE_STATE.FAILED);
    }
    if (operation) {
      await manager._journalTransition(
        operation,
        serviceId,
        lifecycleOperation,
        SERVICE_OPERATION_STATE.IN_PROGRESS,
        SERVICE_OPERATION_STATE.FAILED,
        {message: error.message},
      ).catch(() => {});
    }
    manager._recordLifecycleOutcome(lifecycleOperation, replicaHandle || {}, context, {
      operationId: operation?.operationId || null,
      status: SERVICE_LIFECYCLE_METRIC_STATUS.FAILURE,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}

export {
  createReplica,
  restartReplica,
  startReplica,
  stopReplica,
};
