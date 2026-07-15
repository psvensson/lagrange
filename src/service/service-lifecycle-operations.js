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

const REPLICA_STATE_UPDATE_TIMING = Object.freeze({
  AFTER_JOURNAL_START: 'after_journal_start',
  BEFORE_JOURNAL_START: 'before_journal_start',
});

const REPLICA_OPERATION_SPEC = Object.freeze({
  RESTART: Object.freeze({
    lifecycleOperation: SERVICE_LIFECYCLE_OPERATION.RESTART,
    requiresRuntimePolicy: true,
    enteringState: SERVICE_LIFECYCLE_STATE.STOPPING,
    stateUpdateTiming: REPLICA_STATE_UPDATE_TIMING.AFTER_JOURNAL_START,
    steps: Object.freeze([
      Object.freeze({
        adapterMethod: 'stopReplica',
        enteringState: SERVICE_LIFECYCLE_STATE.STOPPING,
        completedState: SERVICE_LIFECYCLE_STATE.STOPPED,
      }),
      Object.freeze({
        adapterMethod: 'startReplica',
        enteringState: SERVICE_LIFECYCLE_STATE.STARTING,
        completedState: SERVICE_LIFECYCLE_STATE.RUNNING,
      }),
    ]),
  }),
  START: Object.freeze({
    lifecycleOperation: SERVICE_LIFECYCLE_OPERATION.START,
    requiresRuntimePolicy: true,
    enteringState: SERVICE_LIFECYCLE_STATE.STARTING,
    stateUpdateTiming: REPLICA_STATE_UPDATE_TIMING.BEFORE_JOURNAL_START,
    steps: Object.freeze([
      Object.freeze({
        adapterMethod: 'startReplica',
        enteringState: SERVICE_LIFECYCLE_STATE.STARTING,
        completedState: SERVICE_LIFECYCLE_STATE.RUNNING,
      }),
    ]),
  }),
  STOP: Object.freeze({
    lifecycleOperation: SERVICE_LIFECYCLE_OPERATION.STOP,
    requiresRuntimePolicy: false,
    enteringState: SERVICE_LIFECYCLE_STATE.STOPPING,
    stateUpdateTiming: REPLICA_STATE_UPDATE_TIMING.BEFORE_JOURNAL_START,
    steps: Object.freeze([
      Object.freeze({
        adapterMethod: 'stopReplica',
        enteringState: SERVICE_LIFECYCLE_STATE.STOPPING,
        completedState: SERVICE_LIFECYCLE_STATE.STOPPED,
      }),
    ]),
  }),
});

function logOperationStart(manager, lifecycleOperation, subject, context) {
  manager._logger.debug(SERVICE_LIFECYCLE_LOG.OPERATION_START, {
    ...manager._buildLifecycleLogContext(
      lifecycleOperation,
      subject,
      context,
      {operationId: null},
    ),
  });
}

function recordLifecycleSuccess(
  manager,
  lifecycleOperation,
  subject,
  context,
  startedAt,
  operationId,
) {
  manager._recordLifecycleOutcome(lifecycleOperation, subject, context, {
    operationId: operationId || null,
    status: SERVICE_LIFECYCLE_METRIC_STATUS.SUCCESS,
    durationMs: Date.now() - startedAt,
  });
}

function idempotentLifecycleResult(
  manager,
  lifecycleOperation,
  subject,
  context,
  startedAt,
  operation,
) {
  recordLifecycleSuccess(
    manager,
    lifecycleOperation,
    subject,
    context,
    startedAt,
    operation.operationId,
  );
  return {
    operationId: operation.operationId,
    idempotent: true,
    status: operation.existing.state || SERVICE_OPERATION_STATE.PENDING,
  };
}

async function transitionJournalToInProgress(
  manager,
  operation,
  serviceId,
  lifecycleOperation,
) {
  await manager._journalTransition(
    operation,
    serviceId,
    lifecycleOperation,
    SERVICE_OPERATION_STATE.PENDING,
    SERVICE_OPERATION_STATE.IN_PROGRESS,
  );
}

async function completeLifecycleOperation(
  manager,
  details,
  result,
) {
  await manager._journalTransition(
    details.operation,
    details.serviceId,
    details.lifecycleOperation,
    SERVICE_OPERATION_STATE.IN_PROGRESS,
    SERVICE_OPERATION_STATE.COMPLETED,
    result,
  );
  recordLifecycleSuccess(
    manager,
    details.lifecycleOperation,
    details.subject,
    details.context,
    details.startedAt,
    details.operation?.operationId,
  );
  return {...result, operationId: details.operation?.operationId};
}

async function recordLifecycleFailure(manager, details, error) {
  if (details.replicaId) {
    manager._replicaStateById.set(
      details.replicaId,
      SERVICE_LIFECYCLE_STATE.FAILED,
    );
  }
  if (details.operation) {
    await manager._journalTransition(
      details.operation,
      details.serviceId,
      details.lifecycleOperation,
      SERVICE_OPERATION_STATE.IN_PROGRESS,
      SERVICE_OPERATION_STATE.FAILED,
      {message: error.message},
    ).catch(() => {});
  }
  manager._recordLifecycleOutcome(
    details.lifecycleOperation,
    details.subject,
    details.context,
    {
      operationId: details.operation?.operationId || null,
      status: SERVICE_LIFECYCLE_METRIC_STATUS.FAILURE,
      durationMs: Date.now() - details.startedAt,
      error,
    },
  );
}

async function createReplica(manager, definition, context = {}, options = {}) {
  const lifecycleOperation = SERVICE_LIFECYCLE_OPERATION.CREATE;
  const startedAt = Date.now();
  let canonicalDefinition;
  let operation;
  let fields = {};
  try {
    canonicalDefinition = assertServiceDescriptor(definition, {
      adapterResolver: (serviceType) => manager._adapters.get(serviceType),
    });
    fields = resolveServiceFields(canonicalDefinition);
    const adapter = manager._resolveAdapter(fields.serviceType);
    logOperationStart(manager, lifecycleOperation, canonicalDefinition, context);
    await manager._enforceRuntimePolicy(
      lifecycleOperation,
      canonicalDefinition,
      context,
    );
    const definitionValidation = adapter.validateDefinition(canonicalDefinition);
    if (!definitionValidation.valid) {
      throw new ServiceDescriptorValidationError(
        definitionValidation.errors || [
          SERVICE_LIFECYCLE_MANAGER_LITERAL.ADAPTER_REJECTED_SERVICE_DEFINITION,
        ],
        {serviceId: fields.serviceId, serviceType: fields.serviceType},
      );
    }
    operation = await manager._journalCreate(
      fields.tenantId,
      fields.serviceId,
      lifecycleOperation,
      options.idempotencyKey || null,
    );
    if (operation?.idempotent) {
      return idempotentLifecycleResult(
        manager,
        lifecycleOperation,
        canonicalDefinition,
        context,
        startedAt,
        operation,
      );
    }
    await transitionJournalToInProgress(
      manager,
      operation,
      fields.serviceId,
      lifecycleOperation,
    );
    const result = await adapter.createReplica({
      definition: canonicalDefinition,
      context,
    });
    manager._replicaStateById.set(
      fields.replicaId,
      SERVICE_LIFECYCLE_STATE.CREATED,
    );
    const completed = await completeLifecycleOperation(manager, {
      operation,
      serviceId: fields.serviceId,
      lifecycleOperation,
      subject: canonicalDefinition,
      context,
      startedAt,
    }, result);
    return completed;
  } catch (error) {
    await recordLifecycleFailure(manager, {
      operation,
      serviceId: fields.serviceId,
      replicaId: fields.replicaId,
      lifecycleOperation,
      subject: canonicalDefinition || definition || {},
      context,
      startedAt,
    }, error);
    throw error;
  }
}

async function applyReplicaOperationSteps(
  manager,
  adapter,
  replicaHandle,
  context,
  fields,
  spec,
) {
  let currentState = spec.enteringState;
  let result;
  for (const step of spec.steps) {
    if (currentState !== step.enteringState) {
      manager._assertTransition(
        fields.serviceId,
        spec.lifecycleOperation,
        currentState,
        step.enteringState,
      );
      manager._replicaStateById.set(fields.replicaId, step.enteringState);
    }
    result = await adapter[step.adapterMethod](replicaHandle, context);
    manager._assertTransition(
      fields.serviceId,
      spec.lifecycleOperation,
      step.enteringState,
      step.completedState,
    );
    manager._replicaStateById.set(fields.replicaId, step.completedState);
    currentState = step.completedState;
  }
  return result;
}

async function beginReplicaStateTransition(
  manager,
  fields,
  operation,
  spec,
) {
  switch (spec.stateUpdateTiming) {
  case REPLICA_STATE_UPDATE_TIMING.BEFORE_JOURNAL_START:
    manager._replicaStateById.set(fields.replicaId, spec.enteringState);
    await transitionJournalToInProgress(
      manager,
      operation,
      fields.serviceId,
      spec.lifecycleOperation,
    );
    break;
  case REPLICA_STATE_UPDATE_TIMING.AFTER_JOURNAL_START:
    await transitionJournalToInProgress(
      manager,
      operation,
      fields.serviceId,
      spec.lifecycleOperation,
    );
    manager._replicaStateById.set(fields.replicaId, spec.enteringState);
    break;
  }
}

async function runReplicaOperation(
  manager,
  replicaHandle,
  context,
  options,
  spec,
) {
  const startedAt = Date.now();
  let operation;
  let fields = {};
  try {
    fields = resolveServiceFields(replicaHandle);
    const adapter = manager._resolveAdapter(fields.serviceType);
    logOperationStart(
      manager,
      spec.lifecycleOperation,
      replicaHandle,
      context,
    );
    if (spec.requiresRuntimePolicy) {
      await manager._enforceRuntimePolicy(
        spec.lifecycleOperation,
        replicaHandle,
        context,
      );
    }
    manager._assertTransition(
      fields.serviceId,
      spec.lifecycleOperation,
      manager.getReplicaState(replicaHandle),
      spec.enteringState,
    );
    operation = await manager._journalCreate(
      fields.tenantId,
      fields.serviceId,
      spec.lifecycleOperation,
      options.idempotencyKey || null,
    );
    if (operation?.idempotent) {
      return idempotentLifecycleResult(
        manager,
        spec.lifecycleOperation,
        replicaHandle,
        context,
        startedAt,
        operation,
      );
    }
    await beginReplicaStateTransition(manager, fields, operation, spec);
    const result = await applyReplicaOperationSteps(
      manager,
      adapter,
      replicaHandle,
      context,
      fields,
      spec,
    );
    const completed = await completeLifecycleOperation(manager, {
      operation,
      serviceId: fields.serviceId,
      lifecycleOperation: spec.lifecycleOperation,
      subject: replicaHandle,
      context,
      startedAt,
    }, result);
    return completed;
  } catch (error) {
    await recordLifecycleFailure(manager, {
      operation,
      serviceId: fields.serviceId,
      replicaId: fields.replicaId,
      lifecycleOperation: spec.lifecycleOperation,
      subject: replicaHandle || {},
      context,
      startedAt,
    }, error);
    throw error;
  }
}

async function startReplica(manager, replicaHandle, context = {}, options = {}) {
  return runReplicaOperation(
    manager,
    replicaHandle,
    context,
    options,
    REPLICA_OPERATION_SPEC.START,
  );
}

async function stopReplica(manager, replicaHandle, context = {}, options = {}) {
  return runReplicaOperation(
    manager,
    replicaHandle,
    context,
    options,
    REPLICA_OPERATION_SPEC.STOP,
  );
}

async function restartReplica(manager, replicaHandle, context = {}, options = {}) {
  return runReplicaOperation(
    manager,
    replicaHandle,
    context,
    options,
    REPLICA_OPERATION_SPEC.RESTART,
  );
}

export {
  createReplica,
  restartReplica,
  startReplica,
  stopReplica,
};
