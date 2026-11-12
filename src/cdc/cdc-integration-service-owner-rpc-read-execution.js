import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {resolveControlPlaneSystemTableDeliverySource} from '../control-plane/control-plane-system-table-gateway-shared.js';
import {enforceRequiredLeaderReadAuthority} from
  '../control-plane/control-plane-authoritative-read-witness.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {CDC_TERMINAL_STAGE} from './cdc-constants.js';
import {issueAuthoritativeReadStage} from './cdc-terminal-gate.js';
import {assertControlPlaneOwnerRpcReadAuthority, isCompleteAuthoritativeReadResult} from
  '../control-plane/control-plane-system-table-gateway-read-contracts.js';

const {
  AUTHORITATIVE_READ_SOURCE,
  CDC_INTEGRATION_SERVICE_LITERAL,
  INITIAL_PARTITION_IDS,
  QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  normalizeLocalQueryTransportReadiness,
} = CDC_INTEGRATION_SERVICE_SHARED;

const AUTHORITATIVE_OWNER_RPC_READ_PREFER_LEADER = false;

function extractReadAuthorityWitness(result) {
  const candidate = result?.readAuthorityWitness;
  return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ?
    candidate :
    null;
}

function extractReadAuthorityWitnesses(result, readAuthorityWitness) {
  if (Array.isArray(result?.readAuthorityWitnesses)) {
    return result.readAuthorityWitnesses;
  }
  return readAuthorityWitness ? [readAuthorityWitness] : [];
}

function normalizeAuthoritativeQueryRowSet(queryResult) {
  const result = queryResult || {
    success: false,
    error: CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED,
    rows: [],
  };
  const rowsValid = Array.isArray(result.rows);
  const rows = rowsValid ? result.rows : [];
  const success = result.success === true && rowsValid;
  const readAuthorityWitness = extractReadAuthorityWitness(result);
  return {
    ...result,
    success,
    error: result.success === true && !rowsValid ?
      CDC_INTEGRATION_SERVICE_LITERAL.AUTHORITATIVE_QUERY_FAILED :
      result.error,
    rows,
    count: rows.length,
    rowCount: rows.length,
    rowSetComplete: isCompleteAuthoritativeReadResult(result),
    readAuthorityWitness,
    readAuthorityWitnesses: extractReadAuthorityWitnesses(
      result,
      readAuthorityWitness,
    ),
  };
}

function normalizeAuthoritativeReadLocalQueryTransport(
  localQueryTransportReadiness = null,
) {
  return localQueryTransportReadiness &&
    typeof localQueryTransportReadiness === 'object' ?
    {
      state: localQueryTransportReadiness.state || null,
      ready: localQueryTransportReadiness.ready === true,
      reason: localQueryTransportReadiness.reason || null,
      retryAfterMs: localQueryTransportReadiness.retryAfterMs || 0,
    } :
    null;
}

function getLocalQueryTransportReadiness(service) {
  if (
    !service.messageRouter ||
    typeof service.messageRouter.getQueryDataPlaneTransportReadiness !==
      'function'
  ) {
    return null;
  }

  return normalizeLocalQueryTransportReadiness(
    service.messageRouter.getQueryDataPlaneTransportReadiness(),
  );
}

function buildOwnerRpcReadResult({
  baseDiagnostics,
  localQueryTransportReadiness,
  queryResult,
}) {
  return {
    ...normalizeAuthoritativeQueryRowSet(queryResult),
    source: AUTHORITATIVE_READ_SOURCE.OWNER_RPC_LANE,
    localReadHit: false,
    queryTimeoutMs: baseDiagnostics.queryTimeoutMs,
    localQueryTransport: normalizeAuthoritativeReadLocalQueryTransport(
      localQueryTransportReadiness,
    ),
    systemTableDiagnostics: {
      ...baseDiagnostics,
      localReadHit: false,
      routedToNode:
        queryResult?.participantNodeId ||
        baseDiagnostics.leaderNodeId ||
        null,
      deniedByReadiness:
        baseDiagnostics.deniedByReadiness === true ||
        queryResult?.errorCode === QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
    },
  };
}

async function executeAuthoritativeOwnerRpcRead(
  service,
  tableName,
  statement,
  params,
  options,
  baseDiagnostics,
  localQueryTransportReadiness = null,
) {
  const readAuthority = assertControlPlaneOwnerRpcReadAuthority(options?.readAuthority);
  const queryExecutor = service.sqlQueryEngine?.queryExecutor || null;
  if (
    !queryExecutor ||
    typeof queryExecutor.executeOnPartition !== 'function'
  ) {
    return null;
  }

  const partitionId = INITIAL_PARTITION_IDS[tableName] || null;
  if (!partitionId) {
    return null;
  }

  const routingReadinessDimension = readAuthority.routingReadinessDimension;

  const deliverySource = resolveControlPlaneSystemTableDeliverySource({
    deliverySource: options?.queryOptions?.deliverySource || null,
    tableName,
    sql: statement,
  });

  const executionOptions = {
    ...(options.queryOptions && typeof options.queryOptions === 'object' ?
      options.queryOptions :
      {}),
    routingReadinessDimension,
    workClass:
      options?.queryOptions?.workClass || options?.workClass || undefined,
    deliveryPriority:
      options?.queryOptions?.deliveryPriority ||
      options?.deliveryPriority ||
      undefined,
    deliverySource,
    allowReadinessAuthoritativeRefresh:
      options?.queryOptions?.allowReadinessAuthoritativeRefresh !== false,
    readAuthority,
  };

  // Default owner-RPC reads route to "an owner" replica (preferLeader=false),
  // which can be served by the caller's OWN local replica. Leader preference
  // changes routing order. A required-leader token is
  // stronger: query routing excludes followers and this owner boundary rejects
  // a success without the serving replica's current leader witness. The routing
  // readiness dimension remains CONTROL_PLANE_RECOVERY_ELIGIBLE, so a
  // recovery-pending leader can still serve the readiness-owned interaction.
  const preferLeader =
    readAuthority.leaderMode !== CONTROL_PLANE_READ_LEADER_MODE.ANY ?
      true : AUTHORITATIVE_OWNER_RPC_READ_PREFER_LEADER;

  const queryResult = await issueAuthoritativeReadStage(service,
    CDC_TERMINAL_STAGE.OWNER_RPC_READ,
    () => queryExecutor.executeOnPartition(
      partitionId,
      statement,
      params,
      true,
      preferLeader,
      false,
      executionOptions,
    ));
  return buildOwnerRpcReadResult({
    baseDiagnostics,
    localQueryTransportReadiness,
    queryResult: enforceRequiredLeaderReadAuthority(
      queryResult,
      partitionId,
      readAuthority,
    ),
  });
}

export {
  executeAuthoritativeOwnerRpcRead,
  getLocalQueryTransportReadiness,
  normalizeAuthoritativeReadLocalQueryTransport,
};
