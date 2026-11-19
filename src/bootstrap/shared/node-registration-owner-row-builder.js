import os from 'os';
import {
  COLUMN,
  ENDPOINT_STATUS,
  NODE_STATE,
  NUM,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../constants/index.js';
import {
  AUTHORITATIVE_ROW_READ_STATE,
} from '../rejoin-hints-constants.js';
import {requireDeclaredNodeHostId} from '../../topology/node-host-identity.js';
import {
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE_MESSAGE,
  AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS,
  DURABLE_REJOIN_REQUIRED_SERVICE_IDS,
  JOIN_ADMISSION_RESOLUTION_SOURCE,
  REUSABLE_JOIN_ADMISSION_CONNECTION_STATES,
  normalizeString,
} from './node-registration-owner-constants.js';

const BOOT_INCARNATION_REQUIRED =
  'Node registration requires a positive boot incarnation';

const NON_REUSABLE_NODE_STATUSES = Object.freeze([
  NODE_STATE.FAILED,
  NODE_STATE.SHUTTING_DOWN,
  NODE_STATE.STOPPED,
]);

function readObservedBootIncarnation(nodeRow) {
  const observed = nodeRow?.[COLUMN.BOOT_INCARNATION];
  return observed === undefined ? null : observed;
}

function buildAuthoritativeRowSourceUnavailableError(tableName) {
  const error = new Error(AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE_MESSAGE);
  error.deferRetry = true;
  error.retryAfterMs = AUTHORITATIVE_ROW_UNAVAILABLE_RETRY_AFTER_MS;
  error.authoritativeRowReadState = AUTHORITATIVE_ROW_READ_STATE.UNAVAILABLE;
  error.tableName = tableName;
  return error;
}

// The row a re-entering boot writes: the persisted row advanced to this
// boot, with this boot's declared host identity (never the persisted one: a
// restart re-declares it, and an older version's row has none).
function buildReentryNormalizedNodeRow(nodeRow, now, bootIncarnation, hostId) {
  const persistedStatus = normalizeString(nodeRow?.[COLUMN.STATUS]);
  const reusableStatus =
    NON_REUSABLE_NODE_STATUSES.includes(persistedStatus) ?
      null :
      persistedStatus;
  return {
    ...nodeRow,
    [COLUMN.STATUS]: reusableStatus || NODE_STATE.JOINING,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.LAST_HEARTBEAT]: now,
    [COLUMN.READY_LEASE_EXPIRES_AT]: null,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
    [COLUMN.HOST_ID]: requireDeclaredNodeHostId(hostId),
  };
}

function withOriginHlcStamp(row, originHlc) {
  return typeof originHlc === 'string' && originHlc.length > 0 ?
    {...row, [COLUMN.UPDATED_AT_HLC]: originHlc} :
    row;
}

function buildRejectedJoinAdmissionMutationAcceptance({
  contractState,
  nextAction,
  outcome,
  retryAfterMs,
}) {
  return {
    accepted: false,
    success: false,
    withdrawalDeferred: false,
    contractState,
    nextAction,
    outcome,
    retryAfterMs,
  };
}

function buildNodeRegistrationRow({
  nodeId,
  nodeAddress,
  hostId,
  nodeCapabilities,
  bootIncarnation,
  now,
}) {
  if (!Number.isSafeInteger(bootIncarnation) || bootIncarnation <= 0) {
    throw new Error(BOOT_INCARNATION_REQUIRED);
  }
  const cpus = os.cpus();
  const totalMemoryBytes = os.totalmem();
  const totalMemoryMb = Math.floor(
    totalMemoryBytes / (NUM.THOUSAND * NUM.THOUSAND),
  );

  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.NODE_ADDRESS]: nodeAddress,
    [COLUMN.HOST_ID]: requireDeclaredNodeHostId(hostId),
    [COLUMN.CPU_CORES]: cpus.length,
    [COLUMN.MEMORY_MB]: totalMemoryMb,
    [COLUMN.DISK_GB]: NUM.HUNDRED,
    [COLUMN.CPU_USAGE_PERCENT]: 0,
    [COLUMN.MEMORY_USAGE_PERCENT]: 0,
    [COLUMN.DISK_USAGE_PERCENT]: 0,
    [COLUMN.STATUS]: NODE_STATE.JOINING,
    [COLUMN.CONNECTION_STATE]: STATE.CONNECTED,
    [COLUMN.CAPABILITIES]: JSON.stringify(nodeCapabilities || []),
    [COLUMN.LAST_HEARTBEAT]: now,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
    [COLUMN.CREATED_AT]: now,
  };
}

function filterAuthoritativeNodeEndpointRow(
  outcome,
  nodeId,
  expectedWsAddress,
) {
  const normalizedAddress = normalizeString(expectedWsAddress);
  return outcome.rows.find((row) => {
    const rowNodeId = normalizeString(row?.[COLUMN.NODE_ID]);
    const transportType = normalizeString(
      row?.[COLUMN.TRANSPORT_TYPE],
    ).toLowerCase();
    const status = normalizeString(row?.[COLUMN.STATUS]).toLowerCase();
    const address = normalizeString(row?.[COLUMN.ADDRESS]);
    return (
      rowNodeId === nodeId &&
      transportType === String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() &&
      status === String(ENDPOINT_STATUS.ACTIVE).toLowerCase() &&
      address === normalizedAddress
    );
  }) || null;
}

function filterAuthoritativeMetaEndpointRows(outcome, nodeId) {
  const rows = outcome.state === AUTHORITATIVE_ROW_READ_STATE.READABLE ?
    outcome.rows :
    [];
  const rowsByServiceId = new Map();
  for (const row of rows) {
    const rowNodeId = normalizeString(row?.[COLUMN.NODE_ID]);
    const serviceId = normalizeString(row?.[COLUMN.SERVICE_ID]);
    if (
      rowNodeId !== nodeId ||
      !DURABLE_REJOIN_REQUIRED_SERVICE_IDS.includes(serviceId) ||
      rowsByServiceId.has(serviceId)
    ) {
      continue;
    }
    rowsByServiceId.set(serviceId, row);
  }
  return DURABLE_REJOIN_REQUIRED_SERVICE_IDS
    .map((serviceId) => rowsByServiceId.get(serviceId) || null)
    .filter(Boolean);
}

function canReuseObservedJoinAdmissionNodeRowForAddress(nodeRow, nodeAddress) {
  if (!nodeRow || typeof nodeRow !== 'object') {
    return false;
  }
  const cachedNodeAddress = normalizeString(nodeRow[COLUMN.NODE_ADDRESS]);
  const currentNodeAddress = normalizeString(nodeAddress);
  if (
    cachedNodeAddress.length > 0 &&
    currentNodeAddress.length > 0 &&
    cachedNodeAddress !== currentNodeAddress
  ) {
    return false;
  }
  if (
    NON_REUSABLE_NODE_STATUSES.includes(
      normalizeString(nodeRow[COLUMN.STATUS]),
    )
  ) {
    return false;
  }
  return REUSABLE_JOIN_ADMISSION_CONNECTION_STATES.includes(
    normalizeString(nodeRow[COLUMN.CONNECTION_STATE]).toLowerCase(),
  );
}

function buildDurableRejoinMembershipResolution({
  authoritativeNodeRow,
  authoritativeEndpointRow,
  metaEndpointRows,
  now,
  currentIncarnation,
  hostId,
}) {
  return {
    nodeRow: buildReentryNormalizedNodeRow(
      authoritativeNodeRow,
      now,
      currentIncarnation,
      hostId,
    ),
    observedNodeRow: authoritativeNodeRow,
    endpointRow: authoritativeEndpointRow,
    metaEndpointRows,
    resolution: {
      source:
        JOIN_ADMISSION_RESOLUTION_SOURCE.DURABLE_REJOIN_EXISTING_MEMBERSHIP,
    },
    reusedExistingMembership: true,
  };
}

function buildExistingJoinAdmissionProgressResolution({
  authoritativeNodeRow,
  authoritativeEndpointRow,
  metaEndpointRows,
  now,
  currentIncarnation,
  hostId,
}) {
  return {
    nodeRow: buildReentryNormalizedNodeRow(
      authoritativeNodeRow,
      now,
      currentIncarnation,
      hostId,
    ),
    observedNodeRow: authoritativeNodeRow,
    endpointRow: authoritativeEndpointRow,
    metaEndpointRows,
    resolution: {
      source: JOIN_ADMISSION_RESOLUTION_SOURCE.EXISTING_PROGRESS,
    },
  };
}

function buildNodeEndpointRegistrationData({
  endpointId,
  nodeId,
  canonicalWsAddress,
  now,
}) {
  return {
    [COLUMN.ENDPOINT_ID]: endpointId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.TRANSPORT_TYPE]: TRANSPORT_TYPE.WEBSOCKET,
    [COLUMN.ADDRESS]: canonicalWsAddress,
    [COLUMN.PRIORITY]: 0,
    [COLUMN.METADATA]: JSON.stringify({}),
    [COLUMN.STATUS]: ENDPOINT_STATUS.ACTIVE,
    [COLUMN.CREATED_AT]: now,
    [COLUMN.UPDATED_AT]: now,
  };
}

function buildRefusedJoinAdmissionWithdrawal(registeredNodeId, transition) {
  return {
    success: false,
    accepted: false,
    withdrawalDeferred: false,
    registeredNodeId,
    outcome: transition.outcome,
    knownIncarnation: transition.knownIncarnation ?? null,
    nodeEndpointWithdrawn: false,
    metaEndpointCount: 0,
    metaEndpointWithdrawnCount: 0,
  };
}

function collectReusedEndpointEntries(existingMembership) {
  const metaRows = Array.isArray(existingMembership?.metaEndpointRows) ?
    existingMembership.metaEndpointRows :
    [];
  return [
    [TABLES.NODE_ENDPOINTS, existingMembership?.endpointRow],
    ...metaRows.map((row) => [TABLES.SERVICE_ENDPOINTS, row]),
  ].filter(([, row]) => Boolean(row));
}

function stampReusedEndpointMembershipIncarnations(
  existingMembership,
  bootIncarnation,
) {
  if (!existingMembership || typeof existingMembership !== 'object') {
    return;
  }
  if (existingMembership.endpointRow) {
    existingMembership.endpointRow = {
      ...existingMembership.endpointRow,
      [COLUMN.BOOT_INCARNATION]: bootIncarnation,
    };
  }
  const metaRows = Array.isArray(existingMembership.metaEndpointRows) ?
    existingMembership.metaEndpointRows :
    [];
  existingMembership.metaEndpointRows = metaRows.map((row) => ({
    ...row,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
  }));
}

export {
  buildAuthoritativeRowSourceUnavailableError,
  buildDurableRejoinMembershipResolution,
  buildExistingJoinAdmissionProgressResolution,
  buildNodeEndpointRegistrationData,
  buildNodeRegistrationRow,
  buildRefusedJoinAdmissionWithdrawal,
  buildRejectedJoinAdmissionMutationAcceptance,
  canReuseObservedJoinAdmissionNodeRowForAddress,
  collectReusedEndpointEntries,
  filterAuthoritativeMetaEndpointRows,
  filterAuthoritativeNodeEndpointRow,
  readObservedBootIncarnation,
  stampReusedEndpointMembershipIncarnations,
  withOriginHlcStamp,
};
