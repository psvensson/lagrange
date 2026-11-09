import {readLowerStateField, readStateField} from '../utils/state-field-read.js';
import {CONTROL_PLANE_READINESS_PLANNING_SHARED as SHARED} from './control-plane-readiness-planning-shared.js';
import {
  isAuthoritativeControlPlaneRowReadSuccessful,
} from './control-plane-system-table-gateway.js';
import {NODE_LIVENESS_SEMANTIC_STATE} from
  './node-liveness-semantic-projection-owner.js';
import {readWiredCollaborator} from './control-plane-readiness-collaborators.js';
import {
  CONTROL_PLANE_READ_PURPOSE,
  CONTROL_PLANE_READINESS_COLLABORATOR as COLLABORATOR,
  CONTROL_PLANE_READINESS_COLLABORATOR_UNWIRED as UNWIRED,
} from './control-plane-readiness-constants.js';

const {
  COLUMN,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  LOCAL_STR_12BRF,
  LOCAL_STR_BOOLEAN,
  LOCAL_STR_EMPTY,
  PRESSURE_STATE,
  READINESS_ERROR_MSG,
  RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
  compactEligibilitySnapshot,
  normalizeLocalQueryTransportEvidence,
} = SHARED;

function withReadinessInternalPurpose(options = {}) {
  const {purpose = CONTROL_PLANE_READ_PURPOSE.READINESS_INTERNAL} = options;
  return {...options, purpose};
}

async function readNodeRows(service, options = {}) {
  const nodesOwner = readWiredCollaborator(service, COLLABORATOR.NODES_OWNER);
  if (nodesOwner === UNWIRED) {
    return service.getNodeRows();
  }
  if (options.allowAuthoritativeRefresh === true) {
    // Authoritative-preferred (the coordinator's read-source contract):
    // an unavailable list read answers from the row source, never as "no
    // rows" - collapsed to [], it made every node look missing to the
    // publication-planning evaluation and alternated the shared liveness
    // projection and the readiness feedback (fix-f4).
    const result = await nodesOwner.listNodes(
      withReadinessInternalPurpose(options),
    );
    if (isAuthoritativeControlPlaneRowReadSuccessful(result)) {
      return Array.isArray(result?.rows) ? result.rows : [];
    }
  }
  const result = await nodesOwner.listNodesFromCache(options);
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function readNodeServiceRows(service, nodeId, options = {}) {
  if (Array.isArray(options.allServiceRows)) {
    return options.allServiceRows.filter(
      (row) => row?.[COLUMN.NODE_ID] === nodeId,
    );
  }
  const authoritativeRows = await service.readAuthoritativeServiceRows(options);
  if (authoritativeRows !== null) {
    return authoritativeRows.filter(
      (row) => row?.[COLUMN.NODE_ID] === nodeId,
    );
  }
  const servicesOwner =
    readWiredCollaborator(service, COLLABORATOR.SERVICES_OWNER);
  if (servicesOwner === UNWIRED) {
    return service.getNodeServiceRows(nodeId);
  }
  const result = await servicesOwner.listServicesForNodeFromCache(
    nodeId,
    options,
  );
  return Array.isArray(result?.rows) ? result.rows : [];
}

// The authoritative service rows, or null when none were requested or the
// authoritative read was unavailable (the caller then reads its source).
async function readAuthoritativeServiceRows(service, options = {}) {
  const servicesOwner =
    readWiredCollaborator(service, COLLABORATOR.SERVICES_OWNER);
  if (
    options.allowAuthoritativeRefresh !== true ||
    servicesOwner === UNWIRED
  ) {
    return null;
  }
  const result = await servicesOwner.listServices(
    withReadinessInternalPurpose(options),
  );
  if (!isAuthoritativeControlPlaneRowReadSuccessful(result)) return null;
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function readAllNodeServiceRows(service, options = {}) {
  const authoritativeRows = await service.readAuthoritativeServiceRows(options);
  if (authoritativeRows !== null) return authoritativeRows;
  const servicesOwner =
    readWiredCollaborator(service, COLLABORATOR.SERVICES_OWNER);
  if (servicesOwner !== UNWIRED) {
    const result = await servicesOwner.listServicesFromCache(options);
    return Array.isArray(result?.rows) ? result.rows : [];
  }
  const cache = readWiredCollaborator(service, COLLABORATOR.SYSTEM_TABLE_CACHE);
  if (cache === UNWIRED) {
    return [];
  }
  return cache.getAll(TABLES.SERVICES) || [];
}

function getNodeRow(service, nodeId) {
  const cache = readWiredCollaborator(service, COLLABORATOR.SYSTEM_TABLE_CACHE);
  if (cache === UNWIRED) {
    return null;
  }
  // Readiness consumes the node row as immutable evidence: the shared
  // deep-frozen row keeps a stable object identity across builds so the
  // projection-readiness normalization cache can reuse it, where a fresh
  // deepClone per call defeated that cache and re-walked the largest
  // per-build input graph every cycle.
  return cache.getShared(TABLES.NODES, nodeId) || null;
}

function getNodeRows(service) {
  const cache = readWiredCollaborator(service, COLLABORATOR.SYSTEM_TABLE_CACHE);
  if (cache === UNWIRED) {
    return [];
  }
  return cache.getAll(TABLES.NODES);
}

function getNodeServiceRows(service, nodeId) {
  const cache = readWiredCollaborator(service, COLLABORATOR.SYSTEM_TABLE_CACHE);
  if (cache === UNWIRED) {
    return [];
  }
  return cache.filter(TABLES.SERVICES, (row) => {
    return row?.[COLUMN.NODE_ID] === nodeId;
  });
}

function getLifecycleState(service, nodeId, nodeRow) {
  const lifecycle =
    readWiredCollaborator(service, COLLABORATOR.NODE_LIFECYCLE);
  if (nodeId === service.nodeId && lifecycle !== UNWIRED) {
    return lifecycle.getState();
  }
  return readStateField(nodeRow?.[COLUMN.STATUS]);
}

async function getCapacitySnapshot(service, nodeId, _nodeRow) {
  const accounting =
    readWiredCollaborator(service, COLLABORATOR.STORAGE_ACCOUNTING);
  if (accounting !== UNWIRED) {
    return accounting.getCapacitySnapshotForNode(nodeId);
  }

  if (!service.loggedMissingStorageAccountingOwner) {
    service.loggedMissingStorageAccountingOwner = true;
    service.logMissingOwner(
      LOCAL_STR_12BRF,
      CONTROL_PLANE_READINESS_OWNER.STORAGE_ACCOUNTING,
    );
  }

  if (service.strictOwnerDependencies) {
    throw new Error(READINESS_ERROR_MSG.STORAGE_ACCOUNTING_OWNER_REQUIRED);
  }

  return null;
}

function hasRoutableService(service, serviceRows) {
  if (serviceRows.length === 0) {
    return true;
  }
  if (
    !serviceRows.some((serviceRow) => {
      return service.hasAddressedService(serviceRow);
    })
  ) {
    return true;
  }
  return serviceRows.some((serviceRow) => {
    return (
      readLowerStateField(serviceRow?.[COLUMN.STATUS]) ===
        SERVICE_STATUS.ACTIVE &&
      service.hasAddressedService(serviceRow)
    );
  });
}

function hasWritableControlPlaneService(service, serviceRows) {
  if (serviceRows.length === 0) {
    return true;
  }
  const hasMessageGroupRows = serviceRows.some((serviceRow) => {
    return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
  });
  if (!hasMessageGroupRows) {
    return true;
  }
  if (service.hasActiveAddressedMessageGroupService(serviceRows)) {
    return true;
  }
  return service.hasStartupControlPlaneWriteGrace(serviceRows);
}

function hasServeEligibleControlPlaneService(service, serviceRows) {
  if (serviceRows.length === 0) {
    return false;
  }
  const hasMessageGroupRows = serviceRows.some((serviceRow) => {
    return serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP;
  });
  if (!hasMessageGroupRows) {
    return false;
  }
  return service.hasActiveAddressedMessageGroupService(serviceRows);
}

function hasActiveAddressedMessageGroupService(service, serviceRows) {
  return serviceRows.some((serviceRow) => {
    return (
      serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
      readLowerStateField(serviceRow?.[COLUMN.STATUS]) ===
        SERVICE_STATUS.ACTIVE &&
      service.hasAddressedService(serviceRow)
    );
  });
}

function hasRecoveryGraceControlPlaneService(service, serviceRows) {
  if (service.hasWritableControlPlaneService(serviceRows)) {
    return true;
  }
  // A restarted joiner can expose addressed but still-converging message-group
  // service rows before the local replica flips ACTIVE again. Keep recovery
  // admission open so it can finish re-registering through the owner path.
  if (
    !service.hasAddressedMessageGroupServiceWithStatuses(
      serviceRows,
      RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
    )
  ) {
    return false;
  }
  return service.hasActiveAddressedNonMessageGroupService(serviceRows);
}

function hasStartupControlPlaneWriteGrace(service, serviceRows) {
  if (
    !service.hasAddressedMessageGroupServiceWithStatuses(serviceRows, [
      SERVICE_STATUS.STOPPED,
    ])
  ) {
    return false;
  }
  return service.hasActiveAddressedNonMessageGroupService(serviceRows);
}

function hasAddressedService(service, serviceRow) {
  return typeof serviceRow?.[COLUMN.ADDRESS] === 'string' &&
    serviceRow[COLUMN.ADDRESS].length > 0;
}

function hasAddressedMessageGroupServiceWithStatuses(service, serviceRows, allowedStatuses) {
  if (!Array.isArray(allowedStatuses) || allowedStatuses.length === 0) {
    return false;
  }
  return serviceRows.some((serviceRow) => {
    return (
      serviceRow?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.MESSAGE_GROUP &&
      allowedStatuses.includes(
        readLowerStateField(serviceRow?.[COLUMN.STATUS]),
      ) &&
      service.hasAddressedService(serviceRow)
    );
  });
}

function hasActiveAddressedNonMessageGroupService(service, serviceRows) {
  return serviceRows.some((serviceRow) => {
    return (
      serviceRow?.[COLUMN.SERVICE_TYPE] !== SERVICE_TYPE.MESSAGE_GROUP &&
      readLowerStateField(serviceRow?.[COLUMN.STATUS]) ===
        SERVICE_STATUS.ACTIVE &&
      service.hasAddressedService(serviceRow)
    );
  });
}

function isLoadReady(service, nodeRow) {
  const loadValues = [
    Number(nodeRow?.[COLUMN.CPU_USAGE_PERCENT]),
    Number(nodeRow?.[COLUMN.MEMORY_USAGE_PERCENT]),
    Number(nodeRow?.[COLUMN.DISK_USAGE_PERCENT]),
  ];

  return loadValues.every((value) => {
    return !Number.isFinite(value) ||
      value < CONTROL_PLANE_READINESS_DEFAULT.LOAD_READY_MAX_PERCENT;
  });
}

function isCapacityPlacementEligible(service, capacity) {
  if (!capacity) {
    return false;
  }
  if (
    !Number.isFinite(Number(capacity.budgetBytes)) ||
    Number(capacity.budgetBytes) <= 0
  ) {
    return false;
  }
  return !CONTROL_PLANE_READINESS_DEFAULT
    .PLACEMENT_BLOCKING_PRESSURE_STATES.includes(
      String(capacity.pressureState || LOCAL_STR_EMPTY),
    );
}

function getCapacityReasonCode(service, capacity) {
  if (!capacity) {
    return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
  }
  if (
    !Number.isFinite(Number(capacity.budgetBytes)) ||
    Number(capacity.budgetBytes) <= 0
  ) {
    return CONTROL_PLANE_READINESS_REASON.STORAGE_BUDGET_UNAVAILABLE;
  }
  if (capacity.pressureState === PRESSURE_STATE.HARD) {
    return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_HARD;
  }
  if (capacity.pressureState === PRESSURE_STATE.EXHAUSTED) {
    return CONTROL_PLANE_READINESS_REASON.STORAGE_PRESSURE_EXHAUSTED;
  }
  return null;
}

function buildClusterMemberHealthDetails(service, nodeId, nodeRow) {
  const liveness = service.projectNodeLivenessFromRow(
    nodeId,
    nodeRow,
    service.now(),
  );
  const localQueryTransport = service.getLocalQueryTransportEvidence(nodeId);
  const lastHeartbeat = Number(liveness?.heartbeatFreshness?.lastHeartbeatMs);
  const readyLeaseExpiresAt = Number(liveness?.leaseSemantics?.expiresAtMs);
  const projectedAtMs = Number(liveness?.projectedAtMs);
  const heartbeatAgeMs = Number.isFinite(lastHeartbeat) ?
    projectedAtMs - lastHeartbeat :
    null;
  const readyLeaseAgeMs = Number.isFinite(readyLeaseExpiresAt) ?
    projectedAtMs - readyLeaseExpiresAt :
    null;
  const status = liveness?.statusSemantics?.state || null;

  return Object.freeze({
    status,
    rowConnectionState: liveness?.connectionSemantics?.rowState || null,
    routerConnectionState: liveness?.connectionSemantics?.routerState || null,
    transportConnected:
      liveness?.connectionSemantics?.connected === true,
    localQueryTransportState: localQueryTransport?.state || null,
    localQueryTransportReady:
      typeof localQueryTransport?.ready === LOCAL_STR_BOOLEAN ?
        localQueryTransport.ready :
        null,
    localQueryTransportReason: localQueryTransport?.reason || null,
    localQueryTransportReasonCode:
      localQueryTransport?.reasonCode || null,
    localQueryTransportErrorCode:
      localQueryTransport?.errorCode || null,
    localQueryTransportRetryAfterMs:
      Number.isFinite(localQueryTransport?.retryAfterMs) ?
        localQueryTransport.retryAfterMs :
        null,
    lastHeartbeat: Number.isFinite(lastHeartbeat) ? lastHeartbeat : null,
    heartbeatAgeMs: Number.isFinite(heartbeatAgeMs) ? heartbeatAgeMs : null,
    readyLeaseExpiresAt: Number.isFinite(readyLeaseExpiresAt) ?
      readyLeaseExpiresAt :
      null,
    readyLeaseAgeMs:
      Number.isFinite(readyLeaseAgeMs) ? readyLeaseAgeMs : null,
    readyLeaseExplicitlyCleared:
      liveness?.leaseSemantics?.explicitlyCleared === true,
    staleHeartbeatLimitMs: service.clusterMemberStaleHeartbeatMaxAgeMs,
    readyNow: liveness?.readyNow === true,
    readyWhenWritten: liveness?.readyWhenWritten === true,
    clusterMemberHeartbeatFreshness:
      liveness?.heartbeatFreshness?.clusterMembership || null,
    repairHeartbeatFreshness:
      liveness?.repairFreshness?.state || null,
    derivationGraceActive: liveness?.derivationGraceActive === true,
  });
}

function getLocalQueryTransportEvidence(service, nodeId) {
  if (nodeId !== service.nodeId) {
    return null;
  }
  const router = readWiredCollaborator(service, COLLABORATOR.MESSAGE_ROUTER);
  if (router === UNWIRED) {
    return normalizeLocalQueryTransportEvidence(null);
  }
  return normalizeLocalQueryTransportEvidence(
    router.getQueryDataPlaneTransportReadiness(),
  );
}

function getNodeTransportState(service, nodeId, nodeRow) {
  let routerState = null;
  const router = readWiredCollaborator(service, COLLABORATOR.MESSAGE_ROUTER);
  if (nodeId && router !== UNWIRED) {
    routerState = String(
      router.getConnectionState(nodeId) || LOCAL_STR_EMPTY,
    ).toLowerCase();
  }

  const rowStateRaw = String(nodeRow?.[COLUMN.CONNECTION_STATE] || '')
    .toLowerCase();
  const normalizedRowState = rowStateRaw.length > 0 ?
    rowStateRaw :
    null;
  const normalizedRouterState =
    typeof routerState === 'string' && routerState.length > 0 ?
      routerState :
      null;

  let connected = false;
  if (normalizedRouterState === STATE.DISCONNECTED) {
    connected = false;
  } else if (
    normalizedRouterState === STATE.CONNECTED ||
    normalizedRouterState === STATE.READY
  ) {
    connected = true;
  } else {
    connected =
      normalizedRowState === STATE.CONNECTED ||
      normalizedRowState === STATE.READY;
  }

  return Object.freeze({
    connected,
    rowState: normalizedRowState,
    routerState: normalizedRouterState,
  });
}

function isNodeTransportConnected(service, nodeId, nodeRow) {
  return service.getNodeTransportState(nodeId, nodeRow).connected;
}

function isRecentHeartbeat(service, nodeRow) {
  const nodeId = nodeRow?.[COLUMN.NODE_ID] ?? nodeRow?.node_id;
  const projection = service.projectNodeLivenessFromRow(
    nodeId,
    nodeRow,
    service.now(),
  );
  return projection?.heartbeatFreshness?.clusterMembership ===
    NODE_LIVENESS_SEMANTIC_STATE.FRESH;
}

function isClusterMemberHealthy(service, nodeId, nodeRow) {
  const projection = service.projectNodeLivenessFromRow(
    nodeId,
    nodeRow,
    service.now(),
  );
  return projection?.clusterMembershipSemantics?.state ===
    NODE_LIVENESS_SEMANTIC_STATE.HEALTHY;
}

function compactSnapshotSummary(snapshot, decisionDimension = null) {
  return compactEligibilitySnapshot(snapshot, decisionDimension);
}

export {
  readNodeRows,
  readNodeServiceRows,
  readAuthoritativeServiceRows,
  readAllNodeServiceRows,
  getNodeRow,
  getNodeRows,
  getNodeServiceRows,
  getLifecycleState,
  getCapacitySnapshot,
  hasRoutableService,
  hasWritableControlPlaneService,
  hasServeEligibleControlPlaneService,
  hasActiveAddressedMessageGroupService,
  hasRecoveryGraceControlPlaneService,
  hasStartupControlPlaneWriteGrace,
  hasAddressedService,
  hasAddressedMessageGroupServiceWithStatuses,
  hasActiveAddressedNonMessageGroupService,
  isLoadReady,
  isCapacityPlacementEligible,
  getCapacityReasonCode,
  buildClusterMemberHealthDetails,
  getLocalQueryTransportEvidence,
  getNodeTransportState,
  isNodeTransportConnected,
  isRecentHeartbeat,
  isClusterMemberHealthy,
  compactSnapshotSummary,
};
