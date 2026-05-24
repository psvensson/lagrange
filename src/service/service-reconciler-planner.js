import {
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
} from '../constants/index.js';
import {
  LOCAL_NUM_ONE,
  LOCAL_NUM_ZERO,
  LOCAL_STR_EMPTY,
  RECONCILER_ACTION_TYPE,
  RECONCILER_DRIFT_REASON,
  cloneReplicaHandle,
  resolveLifecycleState,
  resolveReplicaCount,
  resolveReplicaId,
  resolveServiceId,
  resolveServiceType,
  resolveTenantId,
} from './service-reconciler-contract.js';

const RECONCILER_UNKNOWN_ACTION_PRIORITY = 999;

const RECONCILER_ACTION_PRIORITY = Object.freeze({
  [RECONCILER_ACTION_TYPE.STOP_REPLICA]: 1,
  [RECONCILER_ACTION_TYPE.START_REPLICA]: 2,
  [RECONCILER_ACTION_TYPE.CREATE_START_REPLICA]: 3,
});

function compareReplicasByReplicaId(leftReplica, rightReplica) {
  const leftId = resolveReplicaId(leftReplica) || LOCAL_STR_EMPTY;
  const rightId = resolveReplicaId(rightReplica) || LOCAL_STR_EMPTY;
  return leftId.localeCompare(rightId);
}

function compareActionsDeterministically(leftAction, rightAction) {
  const typeCompare = (resolveServiceType(leftAction) || '')
    .localeCompare(resolveServiceType(rightAction) || '');
  if (typeCompare !== LOCAL_NUM_ZERO) {
    return typeCompare;
  }

  const serviceCompare = (resolveServiceId(leftAction) || '')
    .localeCompare(resolveServiceId(rightAction) || '');
  if (serviceCompare !== LOCAL_NUM_ZERO) {
    return serviceCompare;
  }

  const leftPriority =
    RECONCILER_ACTION_PRIORITY[leftAction.type] ||
    RECONCILER_UNKNOWN_ACTION_PRIORITY;
  const rightPriority =
    RECONCILER_ACTION_PRIORITY[rightAction.type] ||
    RECONCILER_UNKNOWN_ACTION_PRIORITY;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return (resolveReplicaId(leftAction.replica) || LOCAL_STR_EMPTY)
    .localeCompare(resolveReplicaId(rightAction.replica) || LOCAL_STR_EMPTY);
}

function collectDesiredDefinitions(desiredRows) {
  const desiredByServiceId = new Map();
  for (const definition of desiredRows) {
    const serviceId = resolveServiceId(definition);
    const serviceType = resolveServiceType(definition);
    if (!serviceId || !serviceType) {
      continue;
    }
    desiredByServiceId.set(serviceId, {
      ...definition,
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: serviceType,
    });
  }
  return desiredByServiceId;
}

function collectActualReplicas(actualRows) {
  const actualByServiceId = new Map();
  for (const replica of actualRows) {
    const serviceId = resolveServiceId(replica);
    const serviceType = resolveServiceType(replica);
    const replicaId = resolveReplicaId(replica);
    if (!serviceId || !serviceType || !replicaId) {
      continue;
    }
    const normalizedReplica = cloneReplicaHandle(replica);
    if (!actualByServiceId.has(serviceId)) {
      actualByServiceId.set(serviceId, []);
    }
    actualByServiceId.get(serviceId).push(normalizedReplica);
  }
  return actualByServiceId;
}

function appendStopActionsForExcessReplicas(actions, definition, runningReplicas) {
  const desiredReplicaCount = resolveReplicaCount(definition);
  if (runningReplicas.length <= desiredReplicaCount) {
    return;
  }

  const stopCandidates = runningReplicas
    .slice()
    .sort(compareReplicasByReplicaId)
    .reverse()
    .slice(0, runningReplicas.length - desiredReplicaCount);

  for (const replica of stopCandidates) {
    actions.push({
      type: RECONCILER_ACTION_TYPE.STOP_REPLICA,
      driftReason: RECONCILER_DRIFT_REASON.ABOVE_TARGET,
      definition,
      replica,
    });
  }
}

function appendStartActionsForMissingReplicas(
  actions,
  serviceId,
  definition,
  replicas,
  runningReplicas,
  nonRunningReplicas,
) {
  const desiredReplicaCount = resolveReplicaCount(definition);
  if (runningReplicas.length >= desiredReplicaCount) {
    return;
  }

  let missingCount = desiredReplicaCount - runningReplicas.length;

  for (const replica of nonRunningReplicas) {
    if (missingCount <= LOCAL_NUM_ZERO) {
      break;
    }
    actions.push({
      type: RECONCILER_ACTION_TYPE.START_REPLICA,
      driftReason: RECONCILER_DRIFT_REASON.NON_RUNNING_REPLICA,
      definition,
      replica,
    });
    missingCount -= LOCAL_NUM_ONE;
  }

  if (missingCount <= LOCAL_NUM_ZERO) {
    return;
  }

  const knownReplicaIds = new Set(
    replicas.map((replica) => resolveReplicaId(replica)),
  );

  for (let index = LOCAL_NUM_ONE; index <= missingCount; index++) {
    let suffix = index;
    let candidateReplicaId = `${serviceId}-replica-${suffix}`;
    while (knownReplicaIds.has(candidateReplicaId)) {
      suffix += LOCAL_NUM_ONE;
      candidateReplicaId = `${serviceId}-replica-${suffix}`;
    }
    knownReplicaIds.add(candidateReplicaId);

    const newReplica = {
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: serviceId,
      [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: resolveServiceType(definition),
      [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: resolveTenantId(definition),
      [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: candidateReplicaId,
      [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]:
        SERVICE_LIFECYCLE_STATE.CREATED,
    };

    actions.push({
      type: RECONCILER_ACTION_TYPE.CREATE_START_REPLICA,
      driftReason: RECONCILER_DRIFT_REASON.BELOW_TARGET,
      definition,
      replica: newReplica,
    });
  }
}

function appendServiceRemovedActions(actions, desiredByServiceId, actualByServiceId) {
  for (const [serviceId, replicas] of actualByServiceId.entries()) {
    if (desiredByServiceId.has(serviceId)) {
      continue;
    }

    for (const replica of replicas.slice().sort(compareReplicasByReplicaId)) {
      if (resolveLifecycleState(replica) !== SERVICE_LIFECYCLE_STATE.RUNNING) {
        continue;
      }
      actions.push({
        type: RECONCILER_ACTION_TYPE.STOP_REPLICA,
        driftReason: RECONCILER_DRIFT_REASON.SERVICE_REMOVED,
        definition: {
          [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: resolveServiceId(replica),
          [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: resolveServiceType(replica),
          [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: resolveTenantId(replica),
          [SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT]: LOCAL_NUM_ZERO,
        },
        replica,
      });
    }
  }
}

function appendDesiredServiceActions(actions, desiredByServiceId, actualByServiceId) {
  for (const [serviceId, definition] of desiredByServiceId.entries()) {
    const replicas = (actualByServiceId.get(serviceId) || [])
      .slice()
      .sort(compareReplicasByReplicaId);
    const runningReplicas = replicas
      .filter((replica) =>
        resolveLifecycleState(replica) === SERVICE_LIFECYCLE_STATE.RUNNING,
      );
    const nonRunningReplicas = replicas
      .filter((replica) =>
        resolveLifecycleState(replica) !== SERVICE_LIFECYCLE_STATE.RUNNING,
      );

    appendStopActionsForExcessReplicas(actions, definition, runningReplicas);
    appendStartActionsForMissingReplicas(
      actions,
      serviceId,
      definition,
      replicas,
      runningReplicas,
      nonRunningReplicas,
    );
  }
}

function planReconcilerActions(desiredRows = [], actualRows = []) {
  const desiredByServiceId = collectDesiredDefinitions(desiredRows);
  const actualByServiceId = collectActualReplicas(actualRows);
  const actions = [];

  appendDesiredServiceActions(actions, desiredByServiceId, actualByServiceId);
  appendServiceRemovedActions(actions, desiredByServiceId, actualByServiceId);

  return actions.sort(compareActionsDeterministically);
}

export {
  planReconcilerActions,
};
