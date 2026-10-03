import {AddressManager} from '../../address/address-manager.js';
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
  retirementLaneMismatch: (replicaId) =>
    'Partition service activation requires the replica handler to retire ' +
    `through the activating lifecycle owner for ${replicaId}`,
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

// The exact handler identity this replica registered (owner decision N2),
// not mere presence at the address: a successor generation's handler under the
// same address never satisfies this replica's activation.
// Identity, never presence (owner decision N2): a router without the exact
// lookup cannot prove this replica's handler, so it proves nothing.
function isExactReplicaHandlerRegistered(messageRouter, address, service) {
  if (typeof messageRouter.getRegisteredHandler !== 'function') {
    return false;
  }
  return Boolean(service?.transportHandler) &&
    messageRouter.getRegisteredHandler(address) === service.transportHandler;
}

// The handler's retirement and this activation must meet at one lifecycle
// owner (owner decision N2): the effect section lives in that owner, so a
// service retiring through another state machine (or none) is refused.
function retiresThroughActivatingLane(service, replicaStateMachine) {
  if (!replicaStateMachine ||
      typeof service?.resolveReplicaHandlerRetirementLane !== 'function') {
    return false;
  }
  return service.resolveReplicaHandlerRetirementLane() === replicaStateMachine;
}

function isTransientActivationError(error) {
  return isRetryableControlPlaneError(error);
}

async function activatePartitionServiceRows(options = {}) {
  if (typeof options.nodeId !== 'string' || options.nodeId.length === 0) {
    throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.NODE_ID_REQUIRED);
  }
  if (!options.systemTableWriter) {
    throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.WRITER_REQUIRED);
  }
  const isReplicaHandlerRegistered =
    typeof options.isReplicaHandlerRegistered === 'function' ?
      options.isReplicaHandlerRegistered :
      options.messageRouter &&
        typeof options.messageRouter.getRegisteredHandler === 'function' ?
        (replicaId, service) => isExactReplicaHandlerRegistered(
          options.messageRouter,
          resolveReplicaUnifiedAddress(options.nodeId, replicaId, service),
          service,
        ) :
        null;
  if (!isReplicaHandlerRegistered) {
    throw new Error(PARTITION_SERVICE_ACTIVATION_ERROR.ROUTER_REQUIRED);
  }

  const isPartitionServiceReady =
    typeof options.isPartitionServiceReady === 'function' ?
      options.isPartitionServiceReady :
      (_replicaId, service) => service?.initialized !== false;

  const partitionServices = options.partitionServices instanceof Map ?
    options.partitionServices :
    new Map();
  const partitionRegistrationEvidenceByReplicaId =
    options.partitionRegistrationEvidenceByReplicaId instanceof Map ?
      options.partitionRegistrationEvidenceByReplicaId :
      null;
  const owner = new PartitionServiceRowOwner({
    systemTableWriter: options.systemTableWriter,
    replicaStateMachine: options.replicaStateMachine,
    now: typeof options.now === 'function' ?
      options.now :
      () => Date.now(),
  });
  const activationEntries = [];
  let activatedCount = 0;

  for (const [replicaId, service] of partitionServices.entries()) {
    const partitionId = service?.partitionId || null;
    if (typeof partitionId !== 'string' || partitionId.length === 0) {
      continue;
    }
    const runtimeReady = await Promise.resolve(
      isPartitionServiceReady(replicaId, service),
    );
    if (runtimeReady !== true) {
      throw new Error(
        PARTITION_SERVICE_ACTIVATION_ERROR.runtimeRequired(replicaId),
      );
    }
    const handlerRegistered = await Promise.resolve(
      isReplicaHandlerRegistered(replicaId, service),
    );
    if (handlerRegistered !== true) {
      throw new Error(
        PARTITION_SERVICE_ACTIVATION_ERROR.replicaHandlerRequired(
          replicaId,
        ),
      );
    }
    if (!retiresThroughActivatingLane(service, options.replicaStateMachine)) {
      throw new Error(
        PARTITION_SERVICE_ACTIVATION_ERROR.retirementLaneMismatch(replicaId),
      );
    }
    activationEntries.push({
      partitionId,
      replicaId,
      registrationEvidence:
        partitionRegistrationEvidenceByReplicaId?.get(replicaId),
      service,
    });
  }

  for (const entry of activationEntries) {
    const {
      partitionId,
      replicaId,
      registrationEvidence,
      service,
    } = entry;
    try {
      await owner.activateReplica({
        partitionId,
        replicaId,
        nodeId: options.nodeId,
        service,
        registrationEvidence,
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
      if (isTransientActivationError(error)) {
        if (typeof options.onDeferredActivation === 'function') {
          await Promise.resolve(options.onDeferredActivation({
            partitionId,
            replicaId,
            nodeId: options.nodeId,
            error,
          }));
        }
      }
      throw error;
    }
  }

  return activatedCount;
}

export {
  activatePartitionServiceRows,
  PARTITION_SERVICE_ACTIVATION_ERROR,
  settlePartitionServiceActiveAdmission,
};
