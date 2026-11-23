import {AddressManager} from '../../address/address-manager.js';
import {isExactReplicaHandlerRegistered} from
  '../../node/replica-transport-handler-identity.js';
import {REPLICA_REGISTERED_ACTIVATION_ERROR_CODE} from
  '../../node/replica-state-machine-registered-activation.js';
import {PartitionServiceRowOwner} from
  '../../partition/partition-service-row-owner.js';
import {
  isRetryableControlPlaneError,
} from '../../control-plane/control-plane-error-classification.js';
import {
  ENTITY_TYPE,
} from '../../constants/index.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from
  '../../control-plane/control-plane-readiness-constants.js';


const PARTITION_SERVICE_ACTIVATION_ERROR = Object.freeze({
  NODE_ID_REQUIRED:
    'Partition service activation requires nodeId',
  WRITER_REQUIRED:
    'Partition service activation requires system table writer',
  ROUTER_REQUIRED:
    'Partition service activation requires router registration lookup',
  runtimeRequired: (replicaId) =>
    `Partition service activation requires initialized runtime for ${replicaId}`,
  replicaHandlerRequired: (replicaId) =>
    'Partition service activation requires replica handler ' +
    `registration for ${replicaId}`,
});
const PARTITION_ACTIVE_ADMISSION_LOG_MSG =
  'Exact ACTIVE admission downstream evidence discriminator';

function partitionQueryExecutor(service) {
  return service?.sqlQueryEngine?.queryExecutor ||
    service?.cdcIntegrationService?.sqlQueryEngine?.queryExecutor ||
    null;
}

function valueOrNull(value) {
  return value ?? null;
}

function currentPartitionRuntimeRole(service) {
  if (typeof service?.getRole === 'function') {
    return service.getRole();
  }
  return valueOrNull(service?.role);
}

function capturePartitionRuntimeEvidence(service) {
  return Object.freeze({
    runtimeIsLeader: service?.isLeader === true,
    runtimeRole: currentPartitionRuntimeRole(service),
    pendingRole: valueOrNull(service?.pendingRoleUpdate),
    persistedRole: valueOrNull(service?.persistedRole),
    pendingLeaderNodeId: valueOrNull(service?.pendingLeaderNodeUpdate),
    persistedLeaderNodeId: valueOrNull(service?.persistedLeaderNodeId),
  });
}

function capturePartitionRoutingEvidence(queryExecutor, partitionId) {
  if (typeof queryExecutor?.getPartitionRoutingSnapshot !== 'function') {
    return null;
  }
  return queryExecutor.getPartitionRoutingSnapshot(
    partitionId,
    CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
  );
}

function hasReadinessDenial(routingSnapshot) {
  return routingSnapshot?.canonicalLeaderNodeId !== null &&
    routingSnapshot?.canonicalLeaderNodeId !== undefined &&
    Object.keys(routingSnapshot?.deniedByNodeId || {}).length > 0;
}

function observePartitionRoutingEvidence(queryExecutor, partitionId) {
  try {
    return Object.freeze({
      error: null,
      snapshot: capturePartitionRoutingEvidence(queryExecutor, partitionId),
    });
  } catch (error) {
    return Object.freeze({error, snapshot: null});
  }
}

function reassertMissingPartitionLeaderEvidence(
  service,
  routingSnapshot,
  runtime,
) {
  const canonicalLeaderMissing = routingSnapshot !== null &&
    (routingSnapshot.canonicalLeaderNodeId === null ||
      routingSnapshot.canonicalLeaderNodeId === undefined);
  if (!canonicalLeaderMissing || !runtime.runtimeIsLeader) {
    return Object.freeze({leader: false, role: false});
  }
  return Object.freeze({
    leader: service?.reassertDurableLeaderNodeId?.() === true,
    role: service?.reassertDurableRaftRole?.() === true,
  });
}

async function refreshDeniedPartitionReadiness(
  queryExecutor,
  routingSnapshot,
) {
  if (!hasReadinessDenial(routingSnapshot) ||
      typeof queryExecutor?.maybeAwaitDeniedPartitionRoutingRepair !==
        'function') {
    return Object.freeze({attempted: false, error: null});
  }
  try {
    await queryExecutor.maybeAwaitDeniedPartitionRoutingRepair(
      routingSnapshot,
      {
        allowReadinessAuthoritativeRefresh: true,
        routingReadinessDimension:
          CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
      },
    );
    return Object.freeze({attempted: true, error: null});
  } catch (error) {
    // Exact ACTIVE remains authoritative. The readiness owner retains its own
    // repair debt, and a later level-trigger retries this observation.
    return Object.freeze({attempted: true, error});
  }
}

function buildActiveAdmissionDiagnostic(options) {
  const {
    partitionId,
    replicaId,
    routingObservation,
    runtime,
    reassertion,
    readinessRefresh,
  } = options;
  const routingSnapshot = routingObservation.snapshot;
  const diagnostic = Object.freeze({
    partitionId,
    replicaId,
    canonicalLeaderNodeId:
      valueOrNull(routingSnapshot?.canonicalLeaderNodeId),
    canonicalLeaderRoutingGapState:
      valueOrNull(routingSnapshot?.canonicalLeaderRoutingGapState),
    deniedByNodeId: routingSnapshot?.deniedByNodeId || {},
    activeAddressedServiceCount:
      valueOrNull(routingSnapshot?.activeAddressedServiceCount),
    routableServiceCount:
      valueOrNull(routingSnapshot?.routableServiceCount),
    ...runtime,
    roleReasserted: reassertion.role,
    leaderReasserted: reassertion.leader,
    readinessRefreshAttempted: readinessRefresh.attempted,
    routingObservationError:
      routingObservation.error?.message || null,
    readinessRefreshError: readinessRefresh.error?.message || null,
  });
  return diagnostic;
}

async function settlePartitionServiceActiveAdmission(options = {}) {
  const {partitionId, replicaId, service} = options;
  const queryExecutor = partitionQueryExecutor(service);
  const routingObservation = observePartitionRoutingEvidence(
    queryExecutor,
    partitionId,
  );
  const runtime = capturePartitionRuntimeEvidence(service);
  const reassertion = reassertMissingPartitionLeaderEvidence(
    service,
    routingObservation.snapshot,
    runtime,
  );
  const readinessRefresh = await refreshDeniedPartitionReadiness(
    queryExecutor,
    routingObservation.snapshot,
  );
  const diagnostic = buildActiveAdmissionDiagnostic({
    partitionId,
    replicaId,
    routingObservation,
    runtime,
    reassertion,
    readinessRefresh,
  });
  service?.logger?.debug?.(
    PARTITION_ACTIVE_ADMISSION_LOG_MSG,
    diagnostic,
  );
  return diagnostic;
}

function resolveReplicaUnifiedAddress(nodeId, replicaId, service) {
  if (service &&
      typeof service.getUnifiedAddress === 'function') {
    return service.getUnifiedAddress();
  }
  if (typeof service?.unifiedAddress === 'string' &&
      service.unifiedAddress.length > 0) {
    return service.unifiedAddress;
  }
  return AddressManager.getInstance().format(
    nodeId,
    ENTITY_TYPE.PARTITION,
    replicaId,
  );
}

function isSupersededReplicaActivationError(error) {
  const code = error?.code || error?.errorCode || null;
  return code === REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.SOURCE_CHANGED ||
    code === REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.HANDLER_NOT_REGISTERED;
}

function isTransientActivationError(error) {
  return !isSupersededReplicaActivationError(error) &&
    isRetryableControlPlaneError(error);
}

function defaultPartitionServiceReady(_replicaId, service) {
  return service?.initialized !== false;
}

function resolveReplicaHandlerRegisteredCheck(options) {
  if (options.isReplicaHandlerRegistered) {
    return options.isReplicaHandlerRegistered;
  }
  if (options.messageRouter?.isRegistered) {
    return (replicaId, service) => isExactReplicaHandlerRegistered(
      options.messageRouter,
      resolveReplicaUnifiedAddress(options.nodeId, replicaId, service),
      service?.transportHandler,
    );
  }
  return null;
}

function buildMissingHandlerError(replicaId) {
  const error = new Error(
    PARTITION_SERVICE_ACTIVATION_ERROR.replicaHandlerRequired(replicaId),
  );
  error.code = REPLICA_REGISTERED_ACTIVATION_ERROR_CODE.HANDLER_NOT_REGISTERED;
  error.errorCode = error.code;
  return error;
}

async function preflightSingleActivationEntry(
  replicaId,
  service,
  context,
) {
  const partitionId = service?.partitionId || null;
  if (typeof partitionId !== 'string' || partitionId.length === 0) {
    return null;
  }
  const runtimeReady = await Promise.resolve(
    context.isPartitionServiceReady(replicaId, service),
  );
  if (runtimeReady !== true) {
    throw new Error(
      PARTITION_SERVICE_ACTIVATION_ERROR.runtimeRequired(replicaId),
    );
  }
  const handlerRegistered = await Promise.resolve(
    context.isReplicaHandlerRegistered(replicaId, service),
  );
  if (handlerRegistered !== true) {
    if (context.retireMissingHandler) {
      await Promise.resolve(context.onSupersededReplica?.({
        partitionId,
        replicaId,
        nodeId: context.nodeId,
        service,
        error: buildMissingHandlerError(replicaId),
      }));
      return null;
    }
    throw new Error(
      PARTITION_SERVICE_ACTIVATION_ERROR.replicaHandlerRequired(replicaId),
    );
  }
  return {
    partitionId,
    replicaId,
    registrationEvidence: context.evidenceMap?.get(replicaId),
    expectedReplicaIncarnation: context.expectedIncarnationMap?.get(replicaId),
    service,
  };
}

async function preflightPartitionServiceActivationEntries(options = {}) {
  if (typeof options.nodeId !== 'string' || options.nodeId.length === 0) {
    throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.NODE_ID_REQUIRED);
  }
  const isReplicaHandlerRegistered =
    resolveReplicaHandlerRegisteredCheck(options);
  if (!isReplicaHandlerRegistered) {
    throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.ROUTER_REQUIRED);
  }
  const partitionServices = options.partitionServices instanceof Map ?
    options.partitionServices :
    new Map();
  const context = {
    nodeId: options.nodeId,
    isReplicaHandlerRegistered,
    isPartitionServiceReady:
      options.isPartitionServiceReady ?? defaultPartitionServiceReady,
    evidenceMap:
      options.partitionRegistrationEvidenceByReplicaId instanceof Map ?
        options.partitionRegistrationEvidenceByReplicaId :
        null,
    expectedIncarnationMap:
      options.expectedReplicaIncarnationByReplicaId instanceof Map ?
        options.expectedReplicaIncarnationByReplicaId :
        null,
    retireMissingHandler:
      options.skipMissingHandlerPreflight === true &&
      options.retireSupersededReplicas === true,
    onSupersededReplica: options.onSupersededReplica,
  };
  const entries = [];
  for (const [replicaId, service] of partitionServices.entries()) {
    const entry = await preflightSingleActivationEntry(
      replicaId,
      service,
      context,
    );
    if (entry) {
      entries.push(entry);
    }
  }
  return {entries, isReplicaHandlerRegistered};
}

async function handlePartitionActivationEntryError(options, entry, error) {
  const payload = {
    partitionId: entry.partitionId,
    replicaId: entry.replicaId,
    nodeId: options.nodeId,
    service: entry.service,
    error,
  };
  if (options.retireSupersededReplicas === true &&
      isSupersededReplicaActivationError(error)) {
    await Promise.resolve(options.onSupersededReplica?.(payload));
    return;
  }
  if (isTransientActivationError(error)) {
    await Promise.resolve(options.onDeferredActivation?.(payload));
    if (options.deferTransientFailures === true) {
      return;
    }
  }
  throw error;
}

async function activatePartitionServiceRows(options = {}) {
  if (typeof options.nodeId !== 'string' || options.nodeId.length === 0) {
    throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.NODE_ID_REQUIRED);
  }
  if (!options.systemTableWriter) {
    throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.WRITER_REQUIRED);
  }
  const {entries, isReplicaHandlerRegistered} =
    await preflightPartitionServiceActivationEntries(options);
  const owner = new PartitionServiceRowOwner({
    systemTableWriter: options.systemTableWriter,
    replicaStateMachine: options.replicaStateMachine,
    now: typeof options.now === 'function' ?
      options.now :
      () => Date.now(),
  });
  let activatedCount = 0;

  for (const entry of entries) {
    const {
      partitionId,
      replicaId,
      registrationEvidence,
      expectedReplicaIncarnation,
      service,
    } = entry;
    try {
      await owner.activateReplica({
        partitionId,
        replicaId,
        nodeId: options.nodeId,
        service,
        registrationEvidence,
        expectedReplicaIncarnation,
        // Checked inside the replica's lifecycle lane immediately before the
        // ACTIVE CAS (the preflight above is only an early refusal).
        isEffectHandlerCurrent: () =>
          isReplicaHandlerRegistered(replicaId, service) === true,
      });
      await settlePartitionServiceActiveAdmission({
        partitionId,
        replicaId,
        service,
      });
      activatedCount += 1;
    } catch (error) {
      await handlePartitionActivationEntryError(options, entry, error);
    }
  }

  return activatedCount;
}

export {
  activatePartitionServiceRows,
  PARTITION_SERVICE_ACTIVATION_ERROR,
  preflightPartitionServiceActivationEntries,
  settlePartitionServiceActiveAdmission,
};
