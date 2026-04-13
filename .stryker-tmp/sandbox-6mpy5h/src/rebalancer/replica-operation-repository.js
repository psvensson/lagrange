/**
 * ReplicaOperationRepository — SQL/cache reads and writes, row <-> operation
 * translation for replica_operations.
 *
 * Extracted from RebalanceCoordinator per Design D7.1 / D7.3.
 * Requirements: 6.1, 6.4
 *
 * This is the single owner for:
 * - replica_operations SQL reads and writes
 * - replica_operations cache reads
 * - row <-> operation object translation
 * - operation field extraction helpers (terminal, owner, replace phases)
 * - replica status observation (cache + authoritative)
 * - entity service row lookups
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { v4 as uuidv4 } from 'uuid';
import { INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { isPriorityControlPlanePartition } from '../bootstrap/system-partition-classification.js';
import { CONTROL_PLANE_PARTICIPATION_KIND, CONTROL_PLANE_READINESS_DIMENSION, CONTROL_PLANE_READINESS_REASON } from '../control-plane/control-plane-readiness-constants.js';
import { PRESSURE_WORK_CLASS } from '../control-plane/pressure-governor.js';
import { WORKFLOW_STEP, NUM, ERRORS, TIME_MS, TYPEOF, UNIFIED_SERVICE_TYPE } from '../constants/index.js';
import { SERVICE_TYPE } from '../constants/service.js';
import { buildControlPlaneQueryOptions, getRemainingBudgetMs } from '../control-plane/timeout-budget.js';
import { CONTROL_PLANE_MUTATION_OPERATION, CONTROL_PLANE_MUTATION_MERGE_POLICY, CONTROL_PLANE_READ_STRATEGY, readAuthoritativeControlPlaneRows } from '../control-plane/control-plane-system-table-gateway.js';
import { COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE, OPERATION_METADATA_KEY, TERMINAL_STATUSES, OperationType, ReplicaStatus, getOperationMetadataObject, getOperationMetadataString, getOperationMetadataStringArray, isReplaceRemoveDispatchPhase, isValidWorkflowStep, isTerminalStep, isCoordinatorOwnedOperationType } from './replica-status.js';
import { ReplicaOperationField } from './replica-operation-constants.js';
import { REBALANCE_COORDINATOR_EVENT, REBALANCE_COORDINATOR_LOG_MSG, REBALANCER_SUBSYSTEM } from './rebalancer-constants.js';
import { READ_MODEL_DIVERGENCE_TYPE, SQL_RECONCILIATION_REASON, buildDivergenceEvent } from '../control-plane/read-model-contract.js';
import { QUERY_ERROR_MSG } from '../query/query-constants.js';
import { PARTITION_SERVICE_ERROR_MSG } from '../partition/partition-service-constants.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { getControlPlaneErrorCode, getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../control-plane/control-plane-error-classification.js';

/**
 * SQL queries for replica_operations table access.
 * All system information access must go through SQL engine.
 */
const REPLICA_OPERATION_REPOSITORY_LITERAL = Object.freeze(stryMutAct_9fa48("138527") ? {} : (stryCov_9fa48("138527"), {
  WORKFLOW_PARTICIPANT: stryMutAct_9fa48("138528") ? "" : (stryCov_9fa48("138528"), 'Workflow participant '),
  NOT_FOUND: stryMutAct_9fa48("138529") ? "" : (stryCov_9fa48("138529"), ' not found'),
  SYSTEMTABLECACHE: stryMutAct_9fa48("138530") ? "" : (stryCov_9fa48("138530"), 'systemTableCache'),
  CDCINTEGRATIONSERVICE: stryMutAct_9fa48("138531") ? "" : (stryCov_9fa48("138531"), 'cdcIntegrationService'),
  CONTROLPLANESYSTEMTABLEGATEWAY: stryMutAct_9fa48("138532") ? "" : (stryCov_9fa48("138532"), 'controlPlaneSystemTableGateway'),
  CONTROLPLANEREADINESSSERVICE: stryMutAct_9fa48("138533") ? "" : (stryCov_9fa48("138533"), 'controlPlaneReadinessService'),
  LOGGER: stryMutAct_9fa48("138534") ? "" : (stryCov_9fa48("138534"), 'logger'),
  CONTROL_PLANE_PARTICIPATION_DEFERRED_BY_CANONICAL_READINESS: stryMutAct_9fa48("138535") ? "" : (stryCov_9fa48("138535"), 'Control-plane participation deferred by canonical readiness'),
  VALUE: stryMutAct_9fa48("138536") ? "Stryker was here!" : (stryCov_9fa48("138536"), ''),
  IN_FLIGHT_OPERATION_OWNER_QUERY_INDICATES: stryMutAct_9fa48("138537") ? "" : (stryCov_9fa48("138537"), 'In-flight operation owner query indicates'),
  CONTROL_PLANE_PRESSURE: stryMutAct_9fa48("138538") ? "" : (stryCov_9fa48("138538"), ' control-plane pressure'),
  AUTHORITATIVE_REPLICA_OPERATION_NOT_CONFIRMED: stryMutAct_9fa48("138539") ? "" : (stryCov_9fa48("138539"), 'Authoritative replica operation not confirmed: '),
  REPLICAOPERATIONREPOSITORY_REQUIRES_A_CONTROL_PLANE_MUTATION_INGRESS: stryMutAct_9fa48("138540") ? "" : (stryCov_9fa48("138540"), 'ReplicaOperationRepository requires a control-plane mutation ingress'),
  OBJECT: stryMutAct_9fa48("138541") ? "" : (stryCov_9fa48("138541"), 'object'),
  CRITICAL: stryMutAct_9fa48("138542") ? "" : (stryCov_9fa48("138542"), 'critical'),
  WRITE: stryMutAct_9fa48("138543") ? "" : (stryCov_9fa48("138543"), 'write'),
  OBSERVED: stryMutAct_9fa48("138544") ? "" : (stryCov_9fa48("138544"), 'observed'),
  CACHE_FALLBACK_AFTER_AUTHORITATIVE_FAILURE: stryMutAct_9fa48("138545") ? "" : (stryCov_9fa48("138545"), 'cache_fallback_after_authoritative_failure'),
  CACHE: stryMutAct_9fa48("138546") ? "" : (stryCov_9fa48("138546"), 'cache'),
  AUTHORITATIVE: stryMutAct_9fa48("138547") ? "" : (stryCov_9fa48("138547"), 'authoritative'),
  ABSENT: stryMutAct_9fa48("138548") ? "" : (stryCov_9fa48("138548"), 'absent'),
  UNAVAILABLE: stryMutAct_9fa48("138549") ? "" : (stryCov_9fa48("138549"), 'unavailable')
}));
const SQL = Object.freeze(stryMutAct_9fa48("138550") ? {} : (stryCov_9fa48("138550"), {
  SELECT_OPERATION_BY_ID: stryMutAct_9fa48("138551") ? "" : (stryCov_9fa48("138551"), 'SELECT * FROM replica_operations WHERE operation_id = ?'),
  SELECT_INCOMPLETE_OPERATIONS: stryMutAct_9fa48("138552") ? `` : (stryCov_9fa48("138552"), `SELECT * FROM replica_operations
    WHERE (source_node_id = ? OR target_node_id = ?)
    AND type IN (${COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE})
    AND (
      workflow_step IN (?, ?, ?, ?, ?)
      OR (workflow_step = ? AND type = ?)
    )`),
  SELECT_OPERATIONS_BY_PARTITION: stryMutAct_9fa48("138553") ? "" : (stryCov_9fa48("138553"), 'SELECT * FROM replica_operations WHERE partition_id = ?'),
  SELECT_OPERATIONS_BY_ENTITY: stryMutAct_9fa48("138554") ? `` : (stryCov_9fa48("138554"), `SELECT * FROM replica_operations
    WHERE (
      (entity_type = ? AND entity_id = ?)
      OR ((entity_type IS NULL OR entity_type = '') AND partition_id = ?)
    )`),
  SELECT_IN_FLIGHT_FOR_ENTITY_NODE: stryMutAct_9fa48("138555") ? `` : (stryCov_9fa48("138555"), `SELECT * FROM replica_operations
    WHERE partition_id = ? AND target_node_id = ?
    AND (
      (entity_type = ? AND entity_id = ?)
      OR (entity_type IS NULL OR entity_type = '')
    )`),
  SELECT_IN_FLIGHT_BY_TYPE: stryMutAct_9fa48("138556") ? `` : (stryCov_9fa48("138556"), `SELECT * FROM replica_operations 
    WHERE type = ?`),
  SELECT_ALL_OPERATIONS: stryMutAct_9fa48("138557") ? "" : (stryCov_9fa48("138557"), 'SELECT * FROM replica_operations ORDER BY created_at DESC'),
  INSERT_OPERATION: stryMutAct_9fa48("138558") ? `` : (stryCov_9fa48("138558"), `INSERT INTO replica_operations (
    operation_id, type, partition_id, replica_id, source_node_id,
    target_node_id, status, workflow_step, created_at, updated_at,
    completed_at, error_message, steps_history,
    entity_type, entity_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  UPDATE_OPERATION: stryMutAct_9fa48("138559") ? `` : (stryCov_9fa48("138559"), `UPDATE replica_operations SET 
    status = ?, workflow_step = ?, updated_at = ?, completed_at = ?, 
    error_message = ?, steps_history = ?, replica_id = ?
    WHERE operation_id = ?`),
  UPDATE_OPERATION_EXPECTING_STEP: stryMutAct_9fa48("138560") ? `` : (stryCov_9fa48("138560"), `UPDATE replica_operations SET
    status = ?, workflow_step = ?, updated_at = ?, completed_at = ?,
    error_message = ?, steps_history = ?, replica_id = ?
    WHERE operation_id = ? AND workflow_step = ?`),
  SELECT_REPLICA_STATUS: stryMutAct_9fa48("138561") ? `` : (stryCov_9fa48("138561"), `SELECT service_id, replica_id, partition_id, node_id,
      service_type, status, raft_role, address
    FROM services WHERE service_id = ?`),
  SELECT_REPLICA_BY_PARTITION_NODE: stryMutAct_9fa48("138562") ? `` : (stryCov_9fa48("138562"), `SELECT service_id, replica_id,
      partition_id, node_id, service_type, status, raft_role, address
    FROM services 
    WHERE partition_id = ? AND node_id = ?`)
}));
const OPERATION_PERSIST_RETRY_DELAY_MS = stryMutAct_9fa48("138563") ? TIME_MS.SECOND * NUM.FOUR : (stryCov_9fa48("138563"), TIME_MS.SECOND / NUM.FOUR);
const OPERATION_PERSIST_RETRY_TIMEOUT_MS = stryMutAct_9fa48("138564") ? TIME_MS.SECOND / (NUM.TEN + NUM.FIVE) : (stryCov_9fa48("138564"), TIME_MS.SECOND * (stryMutAct_9fa48("138565") ? NUM.TEN - NUM.FIVE : (stryCov_9fa48("138565"), NUM.TEN + NUM.FIVE)));
const INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS = TIME_MS.SECOND;
const INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS = stryMutAct_9fa48("138566") ? TIME_MS.SECOND / NUM.TEN : (stryCov_9fa48("138566"), TIME_MS.SECOND * NUM.TEN);
const INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD = 1000;
const INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS = stryMutAct_9fa48("138567") ? TIME_MS.SECOND * NUM.FOUR : (stryCov_9fa48("138567"), TIME_MS.SECOND / NUM.FOUR);
const INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_CEILING_MS = stryMutAct_9fa48("138568") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("138568"), TIME_MS.SECOND * NUM.FIVE);
const COORDINATOR_OWNER_COMPONENT = stryMutAct_9fa48("138569") ? "" : (stryCov_9fa48("138569"), 'RebalanceCoordinator');
const REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS = stryMutAct_9fa48("138570") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("138570"), TIME_MS.SECOND * NUM.FIVE);
const REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_RETRY_DELAY_MS = stryMutAct_9fa48("138571") ? TIME_MS.SECOND * NUM.FIVE : (stryCov_9fa48("138571"), TIME_MS.SECOND / NUM.FIVE);
const REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS = TIME_MS.SECOND;
const REPLICA_OPERATION_READ_RETRY_DELAY_MS = stryMutAct_9fa48("138572") ? TIME_MS.SECOND * NUM.TEN : (stryCov_9fa48("138572"), TIME_MS.SECOND / NUM.TEN);
function shouldDeferReplicaOperationOwnerRead(participation) {
  if (stryMutAct_9fa48("138573")) {
    {}
  } else {
    stryCov_9fa48("138573");
    return stryMutAct_9fa48("138576") ? participation?.reasonCode !== CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY : stryMutAct_9fa48("138575") ? false : stryMutAct_9fa48("138574") ? true : (stryCov_9fa48("138574", "138575", "138576"), (stryMutAct_9fa48("138577") ? participation.reasonCode : (stryCov_9fa48("138577"), participation?.reasonCode)) === CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY);
  }
}
function buildControlPlaneFailurePayload(nodeId, resultOrError) {
  if (stryMutAct_9fa48("138578")) {
    {}
  } else {
    stryCov_9fa48("138578");
    const participantFailures = Array.isArray(stryMutAct_9fa48("138579") ? resultOrError.participantFailures : (stryCov_9fa48("138579"), resultOrError?.participantFailures)) ? stryMutAct_9fa48("138581") ? resultOrError.participantFailures.slice(NUM.ZERO, NUM.THREE) : stryMutAct_9fa48("138580") ? resultOrError.participantFailures.filter(entry => entry && typeof entry === 'object') : (stryCov_9fa48("138580", "138581"), resultOrError.participantFailures.filter(stryMutAct_9fa48("138582") ? () => undefined : (stryCov_9fa48("138582"), entry => stryMutAct_9fa48("138585") ? entry || typeof entry === 'object' : stryMutAct_9fa48("138584") ? false : stryMutAct_9fa48("138583") ? true : (stryCov_9fa48("138583", "138584", "138585"), entry && (stryMutAct_9fa48("138587") ? typeof entry !== 'object' : stryMutAct_9fa48("138586") ? true : (stryCov_9fa48("138586", "138587"), typeof entry === (stryMutAct_9fa48("138588") ? "" : (stryCov_9fa48("138588"), 'object'))))))).slice(NUM.ZERO, NUM.THREE)) : stryMutAct_9fa48("138589") ? ["Stryker was here"] : (stryCov_9fa48("138589"), []);
    const firstFailedParticipant = (stryMutAct_9fa48("138592") ? resultOrError?.firstFailedParticipant || typeof resultOrError.firstFailedParticipant === 'object' : stryMutAct_9fa48("138591") ? false : stryMutAct_9fa48("138590") ? true : (stryCov_9fa48("138590", "138591", "138592"), (stryMutAct_9fa48("138593") ? resultOrError.firstFailedParticipant : (stryCov_9fa48("138593"), resultOrError?.firstFailedParticipant)) && (stryMutAct_9fa48("138595") ? typeof resultOrError.firstFailedParticipant !== 'object' : stryMutAct_9fa48("138594") ? true : (stryCov_9fa48("138594", "138595"), typeof resultOrError.firstFailedParticipant === (stryMutAct_9fa48("138596") ? "" : (stryCov_9fa48("138596"), 'object')))))) ? resultOrError.firstFailedParticipant : (stryMutAct_9fa48("138600") ? participantFailures.length <= NUM.ZERO : stryMutAct_9fa48("138599") ? participantFailures.length >= NUM.ZERO : stryMutAct_9fa48("138598") ? false : stryMutAct_9fa48("138597") ? true : (stryCov_9fa48("138597", "138598", "138599", "138600"), participantFailures.length > NUM.ZERO)) ? participantFailures[NUM.ZERO] : null;
    return stryMutAct_9fa48("138601") ? {} : (stryCov_9fa48("138601"), {
      error: stryMutAct_9fa48("138604") ? (resultOrError?.error || resultOrError?.message) && null : stryMutAct_9fa48("138603") ? false : stryMutAct_9fa48("138602") ? true : (stryCov_9fa48("138602", "138603", "138604"), (stryMutAct_9fa48("138606") ? resultOrError?.error && resultOrError?.message : stryMutAct_9fa48("138605") ? false : (stryCov_9fa48("138605", "138606"), (stryMutAct_9fa48("138607") ? resultOrError.error : (stryCov_9fa48("138607"), resultOrError?.error)) || (stryMutAct_9fa48("138608") ? resultOrError.message : (stryCov_9fa48("138608"), resultOrError?.message)))) || null),
      nodeId,
      code: stryMutAct_9fa48("138611") ? getControlPlaneErrorCode(resultOrError) && null : stryMutAct_9fa48("138610") ? false : stryMutAct_9fa48("138609") ? true : (stryCov_9fa48("138609", "138610", "138611"), getControlPlaneErrorCode(resultOrError) || null),
      retryAfterMs: getControlPlaneRetryAfterMs(resultOrError),
      reasonCode: (stryMutAct_9fa48("138614") ? typeof resultOrError?.reasonCode !== TYPEOF.STRING : stryMutAct_9fa48("138613") ? false : stryMutAct_9fa48("138612") ? true : (stryCov_9fa48("138612", "138613", "138614"), typeof (stryMutAct_9fa48("138615") ? resultOrError.reasonCode : (stryCov_9fa48("138615"), resultOrError?.reasonCode)) === TYPEOF.STRING)) ? resultOrError.reasonCode : null,
      participationKind: (stryMutAct_9fa48("138618") ? typeof resultOrError?.participationKind !== TYPEOF.STRING : stryMutAct_9fa48("138617") ? false : stryMutAct_9fa48("138616") ? true : (stryCov_9fa48("138616", "138617", "138618"), typeof (stryMutAct_9fa48("138619") ? resultOrError.participationKind : (stryCov_9fa48("138619"), resultOrError?.participationKind)) === TYPEOF.STRING)) ? resultOrError.participationKind : null,
      tableName: (stryMutAct_9fa48("138622") ? typeof resultOrError?.tableName !== TYPEOF.STRING : stryMutAct_9fa48("138621") ? false : stryMutAct_9fa48("138620") ? true : (stryCov_9fa48("138620", "138621", "138622"), typeof (stryMutAct_9fa48("138623") ? resultOrError.tableName : (stryCov_9fa48("138623"), resultOrError?.tableName)) === TYPEOF.STRING)) ? resultOrError.tableName : (stryMutAct_9fa48("138626") ? typeof firstFailedParticipant?.failedTable !== TYPEOF.STRING : stryMutAct_9fa48("138625") ? false : stryMutAct_9fa48("138624") ? true : (stryCov_9fa48("138624", "138625", "138626"), typeof (stryMutAct_9fa48("138627") ? firstFailedParticipant.failedTable : (stryCov_9fa48("138627"), firstFailedParticipant?.failedTable)) === TYPEOF.STRING)) ? firstFailedParticipant.failedTable : null,
      participantFailures,
      firstFailedParticipant
    });
  }
}
function cloneControlPlaneFailureParticipants(resultOrError) {
  if (stryMutAct_9fa48("138628")) {
    {}
  } else {
    stryCov_9fa48("138628");
    const participantFailures = Array.isArray(stryMutAct_9fa48("138629") ? resultOrError.participantFailures : (stryCov_9fa48("138629"), resultOrError?.participantFailures)) ? stryMutAct_9fa48("138630") ? resultOrError.participantFailures.map(entry => ({
      ...entry
    })) : (stryCov_9fa48("138630"), resultOrError.participantFailures.filter(stryMutAct_9fa48("138631") ? () => undefined : (stryCov_9fa48("138631"), entry => stryMutAct_9fa48("138634") ? entry || typeof entry === 'object' : stryMutAct_9fa48("138633") ? false : stryMutAct_9fa48("138632") ? true : (stryCov_9fa48("138632", "138633", "138634"), entry && (stryMutAct_9fa48("138636") ? typeof entry !== 'object' : stryMutAct_9fa48("138635") ? true : (stryCov_9fa48("138635", "138636"), typeof entry === (stryMutAct_9fa48("138637") ? "" : (stryCov_9fa48("138637"), 'object'))))))).map(stryMutAct_9fa48("138638") ? () => undefined : (stryCov_9fa48("138638"), entry => stryMutAct_9fa48("138639") ? {} : (stryCov_9fa48("138639"), {
      ...entry
    })))) : stryMutAct_9fa48("138640") ? ["Stryker was here"] : (stryCov_9fa48("138640"), []);
    const firstFailedParticipant = (stryMutAct_9fa48("138643") ? resultOrError?.firstFailedParticipant || typeof resultOrError.firstFailedParticipant === 'object' : stryMutAct_9fa48("138642") ? false : stryMutAct_9fa48("138641") ? true : (stryCov_9fa48("138641", "138642", "138643"), (stryMutAct_9fa48("138644") ? resultOrError.firstFailedParticipant : (stryCov_9fa48("138644"), resultOrError?.firstFailedParticipant)) && (stryMutAct_9fa48("138646") ? typeof resultOrError.firstFailedParticipant !== 'object' : stryMutAct_9fa48("138645") ? true : (stryCov_9fa48("138645", "138646"), typeof resultOrError.firstFailedParticipant === (stryMutAct_9fa48("138647") ? "" : (stryCov_9fa48("138647"), 'object')))))) ? stryMutAct_9fa48("138648") ? {} : (stryCov_9fa48("138648"), {
      ...resultOrError.firstFailedParticipant
    }) : (stryMutAct_9fa48("138652") ? participantFailures.length <= NUM.ZERO : stryMutAct_9fa48("138651") ? participantFailures.length >= NUM.ZERO : stryMutAct_9fa48("138650") ? false : stryMutAct_9fa48("138649") ? true : (stryCov_9fa48("138649", "138650", "138651", "138652"), participantFailures.length > NUM.ZERO)) ? participantFailures[NUM.ZERO] : null;
    return stryMutAct_9fa48("138653") ? {} : (stryCov_9fa48("138653"), {
      participantFailures,
      firstFailedParticipant
    });
  }
}
const CONTROL_PLANE_QUERY_OPTIONS = Object.freeze(stryMutAct_9fa48("138654") ? {} : (stryCov_9fa48("138654"), {
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
}));
const REPLICA_OPERATION_READINESS_DIMENSION = CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
const REPLICA_OPERATION_READ_QUERY_OPTIONS = Object.freeze(stryMutAct_9fa48("138655") ? {} : (stryCov_9fa48("138655"), {
  ...CONTROL_PLANE_QUERY_OPTIONS,
  routingReadinessDimension: REPLICA_OPERATION_READINESS_DIMENSION,
  readStrategy: CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
  controlPlaneTableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  controlPlaneOperationKind: stryMutAct_9fa48("138656") ? "" : (stryCov_9fa48("138656"), 'read'),
  workClass: PRESSURE_WORK_CLASS.CRITICAL,
  deliveryPriority: stryMutAct_9fa48("138657") ? "" : (stryCov_9fa48("138657"), 'critical'),
  allowPressureDefer: stryMutAct_9fa48("138658") ? true : (stryCov_9fa48("138658"), false),
  allowSqlFallback: stryMutAct_9fa48("138659") ? false : (stryCov_9fa48("138659"), true)
}));
const REPLICA_OPERATION_STRICT_DEDUPE_READ_QUERY_OPTIONS = Object.freeze(stryMutAct_9fa48("138660") ? {} : (stryCov_9fa48("138660"), {
  ...REPLICA_OPERATION_READ_QUERY_OPTIONS,
  preferOwnerRpcRead: stryMutAct_9fa48("138661") ? false : (stryCov_9fa48("138661"), true),
  requireOwnerRpcRead: stryMutAct_9fa48("138662") ? false : (stryCov_9fa48("138662"), true),
  allowOwnerRpcFallback: stryMutAct_9fa48("138663") ? false : (stryCov_9fa48("138663"), true),
  allowSqlFallback: stryMutAct_9fa48("138664") ? true : (stryCov_9fa48("138664"), false)
}));
const REPLICA_OPERATION_PERSIST_CONFIRMATION_READ_QUERY_OPTIONS = Object.freeze(stryMutAct_9fa48("138665") ? {} : (stryCov_9fa48("138665"), {
  ...REPLICA_OPERATION_READ_QUERY_OPTIONS,
  preferOwnerRpcRead: stryMutAct_9fa48("138666") ? false : (stryCov_9fa48("138666"), true),
  requireOwnerRpcRead: stryMutAct_9fa48("138667") ? true : (stryCov_9fa48("138667"), false),
  allowOwnerRpcFallback: stryMutAct_9fa48("138668") ? false : (stryCov_9fa48("138668"), true),
  allowSqlFallback: stryMutAct_9fa48("138669") ? true : (stryCov_9fa48("138669"), false)
}));
const REPLICA_STATUS_READ_QUERY_OPTIONS = Object.freeze(stryMutAct_9fa48("138670") ? {} : (stryCov_9fa48("138670"), {
  ...CONTROL_PLANE_QUERY_OPTIONS,
  preferOwnerRpcRead: stryMutAct_9fa48("138671") ? false : (stryCov_9fa48("138671"), true),
  allowOwnerRpcFallback: stryMutAct_9fa48("138672") ? false : (stryCov_9fa48("138672"), true)
}));
const RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES = Object.freeze(stryMutAct_9fa48("138673") ? [] : (stryCov_9fa48("138673"), [QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX]));
const RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES = Object.freeze(stryMutAct_9fa48("138674") ? [] : (stryCov_9fa48("138674"), [PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE]));
const RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS = Object.freeze(stryMutAct_9fa48("138675") ? [] : (stryCov_9fa48("138675"), [ERRORS.NO_HANDLER_FOR_ADDRESS]));
const REPLICA_OPERATION_TRANSITION_LANE = Object.freeze(stryMutAct_9fa48("138676") ? {} : (stryCov_9fa48("138676"), {
  DEFAULT: stryMutAct_9fa48("138677") ? "" : (stryCov_9fa48("138677"), 'default'),
  PRIORITY_RECOVERY: stryMutAct_9fa48("138678") ? "" : (stryCov_9fa48("138678"), 'priority_recovery')
}));
const REPLICA_OPERATION_OWNER_NAME = stryMutAct_9fa48("138679") ? "" : (stryCov_9fa48("138679"), 'replica-operations-owner');
function isRetryableWorkflowParticipantLookupErrorMessage(errorMessage) {
  if (stryMutAct_9fa48("138680")) {
    {}
  } else {
    stryCov_9fa48("138680");
    return stryMutAct_9fa48("138683") ? typeof errorMessage === TYPEOF.STRING && errorMessage.startsWith(REPLICA_OPERATION_REPOSITORY_LITERAL.WORKFLOW_PARTICIPANT) || errorMessage.endsWith(REPLICA_OPERATION_REPOSITORY_LITERAL.NOT_FOUND) : stryMutAct_9fa48("138682") ? false : stryMutAct_9fa48("138681") ? true : (stryCov_9fa48("138681", "138682", "138683"), (stryMutAct_9fa48("138685") ? typeof errorMessage === TYPEOF.STRING || errorMessage.startsWith(REPLICA_OPERATION_REPOSITORY_LITERAL.WORKFLOW_PARTICIPANT) : stryMutAct_9fa48("138684") ? true : (stryCov_9fa48("138684", "138685"), (stryMutAct_9fa48("138687") ? typeof errorMessage !== TYPEOF.STRING : stryMutAct_9fa48("138686") ? true : (stryCov_9fa48("138686", "138687"), typeof errorMessage === TYPEOF.STRING)) && (stryMutAct_9fa48("138688") ? errorMessage.endsWith(REPLICA_OPERATION_REPOSITORY_LITERAL.WORKFLOW_PARTICIPANT) : (stryCov_9fa48("138688"), errorMessage.startsWith(REPLICA_OPERATION_REPOSITORY_LITERAL.WORKFLOW_PARTICIPANT))))) && (stryMutAct_9fa48("138689") ? errorMessage.startsWith(REPLICA_OPERATION_REPOSITORY_LITERAL.NOT_FOUND) : (stryCov_9fa48("138689"), errorMessage.endsWith(REPLICA_OPERATION_REPOSITORY_LITERAL.NOT_FOUND))));
  }
} /**
  * ReplicaOperationRepository owns all SQL/cache access and row <-> operation
  * translation for replica_operations.
  *
  * The coordinator facade delegates persistence and query concerns here.
  * This class does NOT own workflow progression, admission, or intent dedup.
  */
class ReplicaOperationRepository {
  /**
  * @param {object} options
  * @param {string} options.nodeId
  * @param {object} options.systemTableCache
  * @param {object} options.cdcIntegrationService
  * @param {object} options.controlPlaneSystemTableGateway
  * @param {object} options.logger
  * @param {object} [options.emitter] - EventEmitter for divergence events
  */
  constructor(options) {
    if (stryMutAct_9fa48("138690")) {
      {}
    } else {
      stryCov_9fa48("138690");
      this.nodeId = options.nodeId;
      this.systemTableCache = options.systemTableCache;
      this.cdcIntegrationService = options.cdcIntegrationService;
      this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
      this.controlPlaneReadinessService = stryMutAct_9fa48("138693") ? options.controlPlaneReadinessService && null : stryMutAct_9fa48("138692") ? false : stryMutAct_9fa48("138691") ? true : (stryCov_9fa48("138691", "138692", "138693"), options.controlPlaneReadinessService || null);
      this.logger = options.logger;
      this.emitter = stryMutAct_9fa48("138696") ? options.emitter && null : stryMutAct_9fa48("138695") ? false : stryMutAct_9fa48("138694") ? true : (stryCov_9fa48("138694", "138695", "138696"), options.emitter || null);
      this.random = (stryMutAct_9fa48("138699") ? typeof options.random !== TYPEOF.FUNCTION : stryMutAct_9fa48("138698") ? false : stryMutAct_9fa48("138697") ? true : (stryCov_9fa48("138697", "138698", "138699"), typeof options.random === TYPEOF.FUNCTION)) ? options.random : Math.random;
      this.lastIncompleteOperationQueryWarningAtMs = NUM.ZERO;
      this.nextIncompleteOperationSqlRetryAtMs = NUM.ZERO;
      this.replicaOperationTransitionQueues = new Map(stryMutAct_9fa48("138700") ? [] : (stryCov_9fa48("138700"), [stryMutAct_9fa48("138701") ? [] : (stryCov_9fa48("138701"), [REPLICA_OPERATION_TRANSITION_LANE.DEFAULT, Promise.resolve()]), stryMutAct_9fa48("138702") ? [] : (stryCov_9fa48("138702"), [REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY, Promise.resolve()])]));
      this.replicaOperationAuthoritativeVisibilityTimeoutMs = (stryMutAct_9fa48("138705") ? Number.isFinite(options.authoritativeVisibilityTimeoutMs) || options.authoritativeVisibilityTimeoutMs >= NUM.ZERO : stryMutAct_9fa48("138704") ? false : stryMutAct_9fa48("138703") ? true : (stryCov_9fa48("138703", "138704", "138705"), Number.isFinite(options.authoritativeVisibilityTimeoutMs) && (stryMutAct_9fa48("138708") ? options.authoritativeVisibilityTimeoutMs < NUM.ZERO : stryMutAct_9fa48("138707") ? options.authoritativeVisibilityTimeoutMs > NUM.ZERO : stryMutAct_9fa48("138706") ? true : (stryCov_9fa48("138706", "138707", "138708"), options.authoritativeVisibilityTimeoutMs >= NUM.ZERO)))) ? Math.floor(options.authoritativeVisibilityTimeoutMs) : REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS;
      this.replicaOperationAuthoritativeVisibilityRetryDelayMs = (stryMutAct_9fa48("138711") ? Number.isFinite(options.authoritativeVisibilityRetryDelayMs) || options.authoritativeVisibilityRetryDelayMs >= NUM.ZERO : stryMutAct_9fa48("138710") ? false : stryMutAct_9fa48("138709") ? true : (stryCov_9fa48("138709", "138710", "138711"), Number.isFinite(options.authoritativeVisibilityRetryDelayMs) && (stryMutAct_9fa48("138714") ? options.authoritativeVisibilityRetryDelayMs < NUM.ZERO : stryMutAct_9fa48("138713") ? options.authoritativeVisibilityRetryDelayMs > NUM.ZERO : stryMutAct_9fa48("138712") ? true : (stryCov_9fa48("138712", "138713", "138714"), options.authoritativeVisibilityRetryDelayMs >= NUM.ZERO)))) ? Math.floor(options.authoritativeVisibilityRetryDelayMs) : REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_RETRY_DELAY_MS;
    }
  } /**
    * Synchronize mutable runtime dependencies after construction.
    * @param {Object} [options={}]
    */
  syncOwnerDependencies(options = {}) {
    if (stryMutAct_9fa48("138715")) {
      {}
    } else {
      stryCov_9fa48("138715");
      if (stryMutAct_9fa48("138717") ? false : stryMutAct_9fa48("138716") ? true : (stryCov_9fa48("138716", "138717"), Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.SYSTEMTABLECACHE))) {
        if (stryMutAct_9fa48("138718")) {
          {}
        } else {
          stryCov_9fa48("138718");
          this.systemTableCache = stryMutAct_9fa48("138721") ? options.systemTableCache && null : stryMutAct_9fa48("138720") ? false : stryMutAct_9fa48("138719") ? true : (stryCov_9fa48("138719", "138720", "138721"), options.systemTableCache || null);
        }
      }
      if (stryMutAct_9fa48("138723") ? false : stryMutAct_9fa48("138722") ? true : (stryCov_9fa48("138722", "138723"), Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.CDCINTEGRATIONSERVICE))) {
        if (stryMutAct_9fa48("138724")) {
          {}
        } else {
          stryCov_9fa48("138724");
          this.cdcIntegrationService = stryMutAct_9fa48("138727") ? options.cdcIntegrationService && null : stryMutAct_9fa48("138726") ? false : stryMutAct_9fa48("138725") ? true : (stryCov_9fa48("138725", "138726", "138727"), options.cdcIntegrationService || null);
        }
      }
      if (stryMutAct_9fa48("138729") ? false : stryMutAct_9fa48("138728") ? true : (stryCov_9fa48("138728", "138729"), Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROLPLANESYSTEMTABLEGATEWAY))) {
        if (stryMutAct_9fa48("138730")) {
          {}
        } else {
          stryCov_9fa48("138730");
          this.controlPlaneSystemTableGateway = stryMutAct_9fa48("138733") ? options.controlPlaneSystemTableGateway && null : stryMutAct_9fa48("138732") ? false : stryMutAct_9fa48("138731") ? true : (stryCov_9fa48("138731", "138732", "138733"), options.controlPlaneSystemTableGateway || null);
        }
      }
      if (stryMutAct_9fa48("138735") ? false : stryMutAct_9fa48("138734") ? true : (stryCov_9fa48("138734", "138735"), Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROLPLANEREADINESSSERVICE))) {
        if (stryMutAct_9fa48("138736")) {
          {}
        } else {
          stryCov_9fa48("138736");
          this.controlPlaneReadinessService = stryMutAct_9fa48("138739") ? options.controlPlaneReadinessService && null : stryMutAct_9fa48("138738") ? false : stryMutAct_9fa48("138737") ? true : (stryCov_9fa48("138737", "138738", "138739"), options.controlPlaneReadinessService || null);
        }
      }
      if (stryMutAct_9fa48("138741") ? false : stryMutAct_9fa48("138740") ? true : (stryCov_9fa48("138740", "138741"), Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.LOGGER))) {
        if (stryMutAct_9fa48("138742")) {
          {}
        } else {
          stryCov_9fa48("138742");
          this.logger = stryMutAct_9fa48("138745") ? options.logger && console : stryMutAct_9fa48("138744") ? false : stryMutAct_9fa48("138743") ? true : (stryCov_9fa48("138743", "138744", "138745"), options.logger || console);
        }
      }
    }
  } /**
    * Bound retryable SQL backoff for replica_operations owner reads.
    * @param {Object} result
    * @return {number}
    * @private
    */
  getRetryableIncompleteOperationReadBackoffMs(result) {
    if (stryMutAct_9fa48("138746")) {
      {}
    } else {
      stryCov_9fa48("138746");
      const retryAfterMs = getControlPlaneRetryAfterMs(result);
      if (stryMutAct_9fa48("138749") ? Number.isFinite(retryAfterMs) || retryAfterMs > NUM.ZERO : stryMutAct_9fa48("138748") ? false : stryMutAct_9fa48("138747") ? true : (stryCov_9fa48("138747", "138748", "138749"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("138752") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("138751") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("138750") ? true : (stryCov_9fa48("138750", "138751", "138752"), retryAfterMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("138753")) {
          {}
        } else {
          stryCov_9fa48("138753");
          return stryMutAct_9fa48("138754") ? Math.max(INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_CEILING_MS, Math.max(INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS, retryAfterMs)) : (stryCov_9fa48("138754"), Math.min(INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_CEILING_MS, stryMutAct_9fa48("138755") ? Math.min(INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS, retryAfterMs) : (stryCov_9fa48("138755"), Math.max(INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS, retryAfterMs))));
        }
      }
      return INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS;
    }
  } /**
    * Bound authoritative operation-id read retries to a short window.
    * @param {Object} result
    * @return {number}
    * @private
    */
  getRetryableReplicaOperationReadRetryDelayMs(result) {
    if (stryMutAct_9fa48("138756")) {
      {}
    } else {
      stryCov_9fa48("138756");
      const retryAfterMs = getControlPlaneRetryAfterMs(result);
      if (stryMutAct_9fa48("138759") ? Number.isFinite(retryAfterMs) || retryAfterMs > NUM.ZERO : stryMutAct_9fa48("138758") ? false : stryMutAct_9fa48("138757") ? true : (stryCov_9fa48("138757", "138758", "138759"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("138762") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("138761") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("138760") ? true : (stryCov_9fa48("138760", "138761", "138762"), retryAfterMs > NUM.ZERO)))) {
        if (stryMutAct_9fa48("138763")) {
          {}
        } else {
          stryCov_9fa48("138763");
          return stryMutAct_9fa48("138764") ? Math.min(REPLICA_OPERATION_READ_RETRY_DELAY_MS, Math.min(REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS, retryAfterMs)) : (stryCov_9fa48("138764"), Math.max(REPLICA_OPERATION_READ_RETRY_DELAY_MS, stryMutAct_9fa48("138765") ? Math.max(REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS, retryAfterMs) : (stryCov_9fa48("138765"), Math.min(REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS, retryAfterMs))));
        }
      }
      return REPLICA_OPERATION_READ_RETRY_DELAY_MS;
    }
  } /**
    * Wait before retrying one authoritative replica_operations read.
    * @param {number} delayMs
    * @return {Promise<void>}
    */
  async waitForReplicaOperationReadRetry(delayMs) {
    if (stryMutAct_9fa48("138766")) {
      {}
    } else {
      stryCov_9fa48("138766");
      await new Promise(stryMutAct_9fa48("138767") ? () => undefined : (stryCov_9fa48("138767"), resolve => setTimeout(resolve, delayMs)));
    }
  } // ── Row <-> Operation Translation ──────────────────────────────
  /**
   * Translate a raw SQL/cache row into a normalized operation object.
   * @param {object} row
   * @return {object}
   */
  rowToOperation(row) {
    if (stryMutAct_9fa48("138768")) {
      {}
    } else {
      stryCov_9fa48("138768");
      let stepsHistory = stryMutAct_9fa48("138769") ? ["Stryker was here"] : (stryCov_9fa48("138769"), []);
      if (stryMutAct_9fa48("138771") ? false : stryMutAct_9fa48("138770") ? true : (stryCov_9fa48("138770", "138771"), row.steps_history)) {
        if (stryMutAct_9fa48("138772")) {
          {}
        } else {
          stryCov_9fa48("138772");
          try {
            if (stryMutAct_9fa48("138773")) {
              {}
            } else {
              stryCov_9fa48("138773");
              stepsHistory = JSON.parse(row.steps_history);
            }
          } catch (error) {
            if (stryMutAct_9fa48("138774")) {
              {}
            } else {
              stryCov_9fa48("138774");
              this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.STEPS_HISTORY_PARSE_ERROR, stryMutAct_9fa48("138775") ? {} : (stryCov_9fa48("138775"), {
                operationId: row.operation_id,
                error: error.message
              }));
              stepsHistory = stryMutAct_9fa48("138776") ? ["Stryker was here"] : (stryCov_9fa48("138776"), []);
            }
          }
        }
      }
      const operation = stryMutAct_9fa48("138777") ? {} : (stryCov_9fa48("138777"), {
        operationId: row.operation_id,
        type: row.type,
        partitionId: row.partition_id,
        entityType: stryMutAct_9fa48("138780") ? row.entity_type && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("138779") ? false : stryMutAct_9fa48("138778") ? true : (stryCov_9fa48("138778", "138779", "138780"), row.entity_type || SERVICE_TYPE.PARTITION),
        entityId: stryMutAct_9fa48("138783") ? row.entity_id && row.partition_id : stryMutAct_9fa48("138782") ? false : stryMutAct_9fa48("138781") ? true : (stryCov_9fa48("138781", "138782", "138783"), row.entity_id || row.partition_id),
        replicaId: row.replica_id,
        sourceNodeId: row.source_node_id,
        targetNodeId: row.target_node_id,
        status: row.status,
        workflowStep: row.workflow_step,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
        errorMessage: row.error_message,
        stepsHistory
      });
      operation.sourceReplicaId = this.getReplaceSourceReplicaId(operation);
      const replicaIds = getOperationMetadataStringArray(stepsHistory, OPERATION_METADATA_KEY.REPLICA_IDS);
      if (stryMutAct_9fa48("138787") ? replicaIds.length <= NUM.ZERO : stryMutAct_9fa48("138786") ? replicaIds.length >= NUM.ZERO : stryMutAct_9fa48("138785") ? false : stryMutAct_9fa48("138784") ? true : (stryCov_9fa48("138784", "138785", "138786", "138787"), replicaIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("138788")) {
          {}
        } else {
          stryCov_9fa48("138788");
          operation[ReplicaOperationField.REPLICA_IDS] = replicaIds;
        }
      }
      const peerAddresses = getOperationMetadataStringArray(stepsHistory, OPERATION_METADATA_KEY.PEER_ADDRESSES);
      if (stryMutAct_9fa48("138792") ? peerAddresses.length <= NUM.ZERO : stryMutAct_9fa48("138791") ? peerAddresses.length >= NUM.ZERO : stryMutAct_9fa48("138790") ? false : stryMutAct_9fa48("138789") ? true : (stryCov_9fa48("138789", "138790", "138791", "138792"), peerAddresses.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("138793")) {
          {}
        } else {
          stryCov_9fa48("138793");
          operation[ReplicaOperationField.PEER_ADDRESSES] = peerAddresses;
        }
      }
      const bootstrapTableMetadata = getOperationMetadataObject(stepsHistory, OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA);
      if (stryMutAct_9fa48("138795") ? false : stryMutAct_9fa48("138794") ? true : (stryCov_9fa48("138794", "138795"), bootstrapTableMetadata)) {
        if (stryMutAct_9fa48("138796")) {
          {}
        } else {
          stryCov_9fa48("138796");
          operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] = bootstrapTableMetadata;
        }
      }
      const bootstrapPartitionMetadata = getOperationMetadataObject(stepsHistory, OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA);
      if (stryMutAct_9fa48("138798") ? false : stryMutAct_9fa48("138797") ? true : (stryCov_9fa48("138797", "138798"), bootstrapPartitionMetadata)) {
        if (stryMutAct_9fa48("138799")) {
          {}
        } else {
          stryCov_9fa48("138799");
          operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] = bootstrapPartitionMetadata;
        }
      }
      return operation;
    }
  } /**
    * Check whether an operation is in a terminal state.
    * Accepts both translated operation objects and raw rows.
    * @param {object} operation
    * @return {boolean}
    */
  isOperationTerminal(operation) {
    if (stryMutAct_9fa48("138800")) {
      {}
    } else {
      stryCov_9fa48("138800");
      if (stryMutAct_9fa48("138803") ? false : stryMutAct_9fa48("138802") ? true : stryMutAct_9fa48("138801") ? operation : (stryCov_9fa48("138801", "138802", "138803"), !operation)) {
        if (stryMutAct_9fa48("138804")) {
          {}
        } else {
          stryCov_9fa48("138804");
          return stryMutAct_9fa48("138805") ? true : (stryCov_9fa48("138805"), false);
        }
      }
      const operationType = stryMutAct_9fa48("138808") ? operation.type && null : stryMutAct_9fa48("138807") ? false : stryMutAct_9fa48("138806") ? true : (stryCov_9fa48("138806", "138807", "138808"), operation.type || null);
      const workflowStep = stryMutAct_9fa48("138809") ? (operation.workflowStep ?? operation.workflow_step) && null : (stryCov_9fa48("138809"), (stryMutAct_9fa48("138810") ? operation.workflowStep && operation.workflow_step : (stryCov_9fa48("138810"), operation.workflowStep ?? operation.workflow_step)) ?? null);
      if (stryMutAct_9fa48("138813") ? typeof operationType === TYPEOF.STRING && typeof workflowStep === TYPEOF.STRING || workflowStep.length > NUM.ZERO : stryMutAct_9fa48("138812") ? false : stryMutAct_9fa48("138811") ? true : (stryCov_9fa48("138811", "138812", "138813"), (stryMutAct_9fa48("138815") ? typeof operationType === TYPEOF.STRING || typeof workflowStep === TYPEOF.STRING : stryMutAct_9fa48("138814") ? true : (stryCov_9fa48("138814", "138815"), (stryMutAct_9fa48("138817") ? typeof operationType !== TYPEOF.STRING : stryMutAct_9fa48("138816") ? true : (stryCov_9fa48("138816", "138817"), typeof operationType === TYPEOF.STRING)) && (stryMutAct_9fa48("138819") ? typeof workflowStep !== TYPEOF.STRING : stryMutAct_9fa48("138818") ? true : (stryCov_9fa48("138818", "138819"), typeof workflowStep === TYPEOF.STRING)))) && (stryMutAct_9fa48("138822") ? workflowStep.length <= NUM.ZERO : stryMutAct_9fa48("138821") ? workflowStep.length >= NUM.ZERO : stryMutAct_9fa48("138820") ? true : (stryCov_9fa48("138820", "138821", "138822"), workflowStep.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("138823")) {
          {}
        } else {
          stryCov_9fa48("138823");
          if (stryMutAct_9fa48("138825") ? false : stryMutAct_9fa48("138824") ? true : (stryCov_9fa48("138824", "138825"), isTerminalStep(operationType, workflowStep))) {
            if (stryMutAct_9fa48("138826")) {
              {}
            } else {
              stryCov_9fa48("138826");
              return stryMutAct_9fa48("138827") ? false : (stryCov_9fa48("138827"), true);
            }
          }
          if (stryMutAct_9fa48("138829") ? false : stryMutAct_9fa48("138828") ? true : (stryCov_9fa48("138828", "138829"), isValidWorkflowStep(operationType, workflowStep))) {
            if (stryMutAct_9fa48("138830")) {
              {}
            } else {
              stryCov_9fa48("138830");
              return stryMutAct_9fa48("138831") ? true : (stryCov_9fa48("138831"), false);
            }
          }
        }
      }
      const status = stryMutAct_9fa48("138832") ? String(operation.status || '').toUpperCase() : (stryCov_9fa48("138832"), String(stryMutAct_9fa48("138835") ? operation.status && '' : stryMutAct_9fa48("138834") ? false : stryMutAct_9fa48("138833") ? true : (stryCov_9fa48("138833", "138834", "138835"), operation.status || (stryMutAct_9fa48("138836") ? "Stryker was here!" : (stryCov_9fa48("138836"), '')))).toLowerCase());
      return TERMINAL_STATUSES.includes(status);
    }
  } /**
    * Resolve the owner node ID from an operation or raw row.
    * @param {object} operation
    * @return {string|null}
    */
  resolveOperationOwnerNodeId(operation) {
    if (stryMutAct_9fa48("138837")) {
      {}
    } else {
      stryCov_9fa48("138837");
      const workflowStep = String(stryMutAct_9fa48("138840") ? (operation?.workflowStep || operation?.workflow_step) && '' : stryMutAct_9fa48("138839") ? false : stryMutAct_9fa48("138838") ? true : (stryCov_9fa48("138838", "138839", "138840"), (stryMutAct_9fa48("138842") ? operation?.workflowStep && operation?.workflow_step : stryMutAct_9fa48("138841") ? false : (stryCov_9fa48("138841", "138842"), (stryMutAct_9fa48("138843") ? operation.workflowStep : (stryCov_9fa48("138843"), operation?.workflowStep)) || (stryMutAct_9fa48("138844") ? operation.workflow_step : (stryCov_9fa48("138844"), operation?.workflow_step)))) || (stryMutAct_9fa48("138845") ? "Stryker was here!" : (stryCov_9fa48("138845"), ''))));
      const partitionId = String(stryMutAct_9fa48("138848") ? (operation?.partitionId || operation?.partition_id) && '' : stryMutAct_9fa48("138847") ? false : stryMutAct_9fa48("138846") ? true : (stryCov_9fa48("138846", "138847", "138848"), (stryMutAct_9fa48("138850") ? operation?.partitionId && operation?.partition_id : stryMutAct_9fa48("138849") ? false : (stryCov_9fa48("138849", "138850"), (stryMutAct_9fa48("138851") ? operation.partitionId : (stryCov_9fa48("138851"), operation?.partitionId)) || (stryMutAct_9fa48("138852") ? operation.partition_id : (stryCov_9fa48("138852"), operation?.partition_id)))) || (stryMutAct_9fa48("138853") ? "Stryker was here!" : (stryCov_9fa48("138853"), ''))));
      const sourceNodeId = String(stryMutAct_9fa48("138856") ? (operation?.sourceNodeId || operation?.source_node_id) && '' : stryMutAct_9fa48("138855") ? false : stryMutAct_9fa48("138854") ? true : (stryCov_9fa48("138854", "138855", "138856"), (stryMutAct_9fa48("138858") ? operation?.sourceNodeId && operation?.source_node_id : stryMutAct_9fa48("138857") ? false : (stryCov_9fa48("138857", "138858"), (stryMutAct_9fa48("138859") ? operation.sourceNodeId : (stryCov_9fa48("138859"), operation?.sourceNodeId)) || (stryMutAct_9fa48("138860") ? operation.source_node_id : (stryCov_9fa48("138860"), operation?.source_node_id)))) || (stryMutAct_9fa48("138861") ? "Stryker was here!" : (stryCov_9fa48("138861"), ''))));
      const targetNodeId = String(stryMutAct_9fa48("138864") ? (operation?.targetNodeId || operation?.target_node_id) && '' : stryMutAct_9fa48("138863") ? false : stryMutAct_9fa48("138862") ? true : (stryCov_9fa48("138862", "138863", "138864"), (stryMutAct_9fa48("138866") ? operation?.targetNodeId && operation?.target_node_id : stryMutAct_9fa48("138865") ? false : (stryCov_9fa48("138865", "138866"), (stryMutAct_9fa48("138867") ? operation.targetNodeId : (stryCov_9fa48("138867"), operation?.targetNodeId)) || (stryMutAct_9fa48("138868") ? operation.target_node_id : (stryCov_9fa48("138868"), operation?.target_node_id)))) || (stryMutAct_9fa48("138869") ? "Stryker was here!" : (stryCov_9fa48("138869"), ''))));
      if (stryMutAct_9fa48("138872") ? operation?.type === OperationType.REPLACE && isPriorityControlPlanePartition({
        partitionId
      }) && targetNodeId.length > NUM.ZERO || workflowStep === WORKFLOW_STEP.PENDING || workflowStep === WORKFLOW_STEP.SENDING || workflowStep === WORKFLOW_STEP.CREATING || workflowStep === WORKFLOW_STEP.SYNCING || workflowStep === WORKFLOW_STEP.ACTIVE || workflowStep === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("138871") ? false : stryMutAct_9fa48("138870") ? true : (stryCov_9fa48("138870", "138871", "138872"), (stryMutAct_9fa48("138874") ? operation?.type === OperationType.REPLACE && isPriorityControlPlanePartition({
        partitionId
      }) || targetNodeId.length > NUM.ZERO : stryMutAct_9fa48("138873") ? true : (stryCov_9fa48("138873", "138874"), (stryMutAct_9fa48("138876") ? operation?.type === OperationType.REPLACE || isPriorityControlPlanePartition({
        partitionId
      }) : stryMutAct_9fa48("138875") ? true : (stryCov_9fa48("138875", "138876"), (stryMutAct_9fa48("138878") ? operation?.type !== OperationType.REPLACE : stryMutAct_9fa48("138877") ? true : (stryCov_9fa48("138877", "138878"), (stryMutAct_9fa48("138879") ? operation.type : (stryCov_9fa48("138879"), operation?.type)) === OperationType.REPLACE)) && isPriorityControlPlanePartition(stryMutAct_9fa48("138880") ? {} : (stryCov_9fa48("138880"), {
        partitionId
      })))) && (stryMutAct_9fa48("138883") ? targetNodeId.length <= NUM.ZERO : stryMutAct_9fa48("138882") ? targetNodeId.length >= NUM.ZERO : stryMutAct_9fa48("138881") ? true : (stryCov_9fa48("138881", "138882", "138883"), targetNodeId.length > NUM.ZERO)))) && (stryMutAct_9fa48("138885") ? (workflowStep === WORKFLOW_STEP.PENDING || workflowStep === WORKFLOW_STEP.SENDING || workflowStep === WORKFLOW_STEP.CREATING || workflowStep === WORKFLOW_STEP.SYNCING || workflowStep === WORKFLOW_STEP.ACTIVE) && workflowStep === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("138884") ? true : (stryCov_9fa48("138884", "138885"), (stryMutAct_9fa48("138887") ? (workflowStep === WORKFLOW_STEP.PENDING || workflowStep === WORKFLOW_STEP.SENDING || workflowStep === WORKFLOW_STEP.CREATING || workflowStep === WORKFLOW_STEP.SYNCING) && workflowStep === WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("138886") ? false : (stryCov_9fa48("138886", "138887"), (stryMutAct_9fa48("138889") ? (workflowStep === WORKFLOW_STEP.PENDING || workflowStep === WORKFLOW_STEP.SENDING || workflowStep === WORKFLOW_STEP.CREATING) && workflowStep === WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("138888") ? false : (stryCov_9fa48("138888", "138889"), (stryMutAct_9fa48("138891") ? (workflowStep === WORKFLOW_STEP.PENDING || workflowStep === WORKFLOW_STEP.SENDING) && workflowStep === WORKFLOW_STEP.CREATING : stryMutAct_9fa48("138890") ? false : (stryCov_9fa48("138890", "138891"), (stryMutAct_9fa48("138893") ? workflowStep === WORKFLOW_STEP.PENDING && workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("138892") ? false : (stryCov_9fa48("138892", "138893"), (stryMutAct_9fa48("138895") ? workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("138894") ? false : (stryCov_9fa48("138894", "138895"), workflowStep === WORKFLOW_STEP.PENDING)) || (stryMutAct_9fa48("138897") ? workflowStep !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("138896") ? false : (stryCov_9fa48("138896", "138897"), workflowStep === WORKFLOW_STEP.SENDING)))) || (stryMutAct_9fa48("138899") ? workflowStep !== WORKFLOW_STEP.CREATING : stryMutAct_9fa48("138898") ? false : (stryCov_9fa48("138898", "138899"), workflowStep === WORKFLOW_STEP.CREATING)))) || (stryMutAct_9fa48("138901") ? workflowStep !== WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("138900") ? false : (stryCov_9fa48("138900", "138901"), workflowStep === WORKFLOW_STEP.SYNCING)))) || (stryMutAct_9fa48("138903") ? workflowStep !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("138902") ? false : (stryCov_9fa48("138902", "138903"), workflowStep === WORKFLOW_STEP.ACTIVE)))) || (stryMutAct_9fa48("138905") ? workflowStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("138904") ? false : (stryCov_9fa48("138904", "138905"), workflowStep === WORKFLOW_STEP.STOPPING)))))) {
        if (stryMutAct_9fa48("138906")) {
          {}
        } else {
          stryCov_9fa48("138906");
          // Keep canonical ownership on the target from initial dispatch through
          // source removal so the replacement host can survive transient dispatch
          // failures without handing ownership back to a degraded source.
          return targetNodeId;
        }
      }
      if (stryMutAct_9fa48("138910") ? sourceNodeId.length <= NUM.ZERO : stryMutAct_9fa48("138909") ? sourceNodeId.length >= NUM.ZERO : stryMutAct_9fa48("138908") ? false : stryMutAct_9fa48("138907") ? true : (stryCov_9fa48("138907", "138908", "138909", "138910"), sourceNodeId.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("138911")) {
          {}
        } else {
          stryCov_9fa48("138911");
          return sourceNodeId;
        }
      }
      if (stryMutAct_9fa48("138915") ? targetNodeId.length <= NUM.ZERO : stryMutAct_9fa48("138914") ? targetNodeId.length >= NUM.ZERO : stryMutAct_9fa48("138913") ? false : stryMutAct_9fa48("138912") ? true : (stryCov_9fa48("138912", "138913", "138914", "138915"), targetNodeId.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("138916")) {
          {}
        } else {
          stryCov_9fa48("138916");
          return targetNodeId;
        }
      }
      return null;
    }
  } /**
    * Check whether an operation is owned by this node.
    * @param {object} operation
    * @return {boolean}
    */
  isOperationLocallyOwned(operation) {
    if (stryMutAct_9fa48("138917")) {
      {}
    } else {
      stryCov_9fa48("138917");
      return stryMutAct_9fa48("138920") ? this.resolveOperationOwnerNodeId(operation) !== this.nodeId : stryMutAct_9fa48("138919") ? false : stryMutAct_9fa48("138918") ? true : (stryCov_9fa48("138918", "138919", "138920"), this.resolveOperationOwnerNodeId(operation) === this.nodeId);
    }
  } /**
    * Extract the source replica ID for a REPLACE operation.
    * @param {object} operation
    * @return {string|null}
    */
  getReplaceSourceReplicaId(operation) {
    if (stryMutAct_9fa48("138921")) {
      {}
    } else {
      stryCov_9fa48("138921");
      if (stryMutAct_9fa48("138924") ? !operation && operation.type !== OperationType.REPLACE : stryMutAct_9fa48("138923") ? false : stryMutAct_9fa48("138922") ? true : (stryCov_9fa48("138922", "138923", "138924"), (stryMutAct_9fa48("138925") ? operation : (stryCov_9fa48("138925"), !operation)) || (stryMutAct_9fa48("138927") ? operation.type === OperationType.REPLACE : stryMutAct_9fa48("138926") ? false : (stryCov_9fa48("138926", "138927"), operation.type !== OperationType.REPLACE)))) {
        if (stryMutAct_9fa48("138928")) {
          {}
        } else {
          stryCov_9fa48("138928");
          return null;
        }
      }
      if (stryMutAct_9fa48("138930") ? false : stryMutAct_9fa48("138929") ? true : (stryCov_9fa48("138929", "138930"), operation.sourceReplicaId)) {
        if (stryMutAct_9fa48("138931")) {
          {}
        } else {
          stryCov_9fa48("138931");
          return operation.sourceReplicaId;
        }
      }
      if (stryMutAct_9fa48("138934") ? false : stryMutAct_9fa48("138933") ? true : stryMutAct_9fa48("138932") ? Array.isArray(operation.stepsHistory) : (stryCov_9fa48("138932", "138933", "138934"), !Array.isArray(operation.stepsHistory))) {
        if (stryMutAct_9fa48("138935")) {
          {}
        } else {
          stryCov_9fa48("138935");
          return null;
        }
      }
      return getOperationMetadataString(operation.stepsHistory, OPERATION_METADATA_KEY.SOURCE_REPLICA_ID);
    }
  } /**
    * Check whether a REPLACE operation is in the remove phase.
    * @param {object} operation
    * @return {boolean}
    */
  isReplaceRemovePhase(operation) {
    if (stryMutAct_9fa48("138936")) {
      {}
    } else {
      stryCov_9fa48("138936");
      return stryMutAct_9fa48("138939") ? operation?.type === OperationType.REPLACE || operation?.workflowStep === WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("138938") ? false : stryMutAct_9fa48("138937") ? true : (stryCov_9fa48("138937", "138938", "138939"), (stryMutAct_9fa48("138941") ? operation?.type !== OperationType.REPLACE : stryMutAct_9fa48("138940") ? true : (stryCov_9fa48("138940", "138941"), (stryMutAct_9fa48("138942") ? operation.type : (stryCov_9fa48("138942"), operation?.type)) === OperationType.REPLACE)) && (stryMutAct_9fa48("138944") ? operation?.workflowStep !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("138943") ? true : (stryCov_9fa48("138943", "138944"), (stryMutAct_9fa48("138945") ? operation.workflowStep : (stryCov_9fa48("138945"), operation?.workflowStep)) === WORKFLOW_STEP.ACTIVE)));
    }
  } /**
    * Check whether a REPLACE operation is currently dispatching source removal.
    * This includes the initial ACTIVE dispatch and STOPPING reconciliation
    * re-dispatch while removal completion is still being observed.
    * @param {object} operation
    * @return {boolean}
    */
  isReplaceRemoveDispatchPhase(operation) {
    if (stryMutAct_9fa48("138946")) {
      {}
    } else {
      stryCov_9fa48("138946");
      return isReplaceRemoveDispatchPhase(operation);
    }
  } /**
    * Extract the target replica ID for a REPLACE operation.
    * @param {object} operation
    * @return {string|null}
    */
  getReplaceTargetReplicaId(operation) {
    if (stryMutAct_9fa48("138947")) {
      {}
    } else {
      stryCov_9fa48("138947");
      if (stryMutAct_9fa48("138950") ? operation?.type === OperationType.REPLACE : stryMutAct_9fa48("138949") ? false : stryMutAct_9fa48("138948") ? true : (stryCov_9fa48("138948", "138949", "138950"), (stryMutAct_9fa48("138951") ? operation.type : (stryCov_9fa48("138951"), operation?.type)) !== OperationType.REPLACE)) {
        if (stryMutAct_9fa48("138952")) {
          {}
        } else {
          stryCov_9fa48("138952");
          return null;
        }
      }
      const sourceReplicaId = this.getReplaceSourceReplicaId(operation);
      if (stryMutAct_9fa48("138955") ? typeof operation?.replicaId !== TYPEOF.STRING && operation.replicaId.length === NUM.ZERO : stryMutAct_9fa48("138954") ? false : stryMutAct_9fa48("138953") ? true : (stryCov_9fa48("138953", "138954", "138955"), (stryMutAct_9fa48("138957") ? typeof operation?.replicaId === TYPEOF.STRING : stryMutAct_9fa48("138956") ? false : (stryCov_9fa48("138956", "138957"), typeof (stryMutAct_9fa48("138958") ? operation.replicaId : (stryCov_9fa48("138958"), operation?.replicaId)) !== TYPEOF.STRING)) || (stryMutAct_9fa48("138960") ? operation.replicaId.length !== NUM.ZERO : stryMutAct_9fa48("138959") ? false : (stryCov_9fa48("138959", "138960"), operation.replicaId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("138961")) {
          {}
        } else {
          stryCov_9fa48("138961");
          return null;
        }
      }
      if (stryMutAct_9fa48("138964") ? operation.replicaId !== sourceReplicaId : stryMutAct_9fa48("138963") ? false : stryMutAct_9fa48("138962") ? true : (stryCov_9fa48("138962", "138963", "138964"), operation.replicaId === sourceReplicaId)) {
        if (stryMutAct_9fa48("138965")) {
          {}
        } else {
          stryCov_9fa48("138965");
          return null;
        }
      }
      return operation.replicaId;
    }
  } // ── Cache Read Methods ──────────────────────────────────────────
  /**
   * Get a single replica_operations row from cache by operation ID.
   * @param {string} operationId
   * @return {object|null}
   */
  getReplicaOperationRowFromCache(operationId) {
    if (stryMutAct_9fa48("138966")) {
      {}
    } else {
      stryCov_9fa48("138966");
      if (stryMutAct_9fa48("138969") ? !this.systemTableCache && !operationId : stryMutAct_9fa48("138968") ? false : stryMutAct_9fa48("138967") ? true : (stryCov_9fa48("138967", "138968", "138969"), (stryMutAct_9fa48("138970") ? this.systemTableCache : (stryCov_9fa48("138970"), !this.systemTableCache)) || (stryMutAct_9fa48("138971") ? operationId : (stryCov_9fa48("138971"), !operationId)))) {
        if (stryMutAct_9fa48("138972")) {
          {}
        } else {
          stryCov_9fa48("138972");
          return null;
        }
      }
      if (stryMutAct_9fa48("138975") ? typeof this.systemTableCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("138974") ? false : stryMutAct_9fa48("138973") ? true : (stryCov_9fa48("138973", "138974", "138975"), typeof this.systemTableCache.get === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("138976")) {
          {}
        } else {
          stryCov_9fa48("138976");
          return stryMutAct_9fa48("138979") ? this.systemTableCache.get(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId) && null : stryMutAct_9fa48("138978") ? false : stryMutAct_9fa48("138977") ? true : (stryCov_9fa48("138977", "138978", "138979"), this.systemTableCache.get(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId) || null);
        }
      }
      if (stryMutAct_9fa48("138982") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("138981") ? false : stryMutAct_9fa48("138980") ? true : (stryCov_9fa48("138980", "138981", "138982"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("138983")) {
          {}
        } else {
          stryCov_9fa48("138983");
          const rows = stryMutAct_9fa48("138986") ? this.systemTableCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) && [] : stryMutAct_9fa48("138985") ? false : stryMutAct_9fa48("138984") ? true : (stryCov_9fa48("138984", "138985", "138986"), this.systemTableCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) || (stryMutAct_9fa48("138987") ? ["Stryker was here"] : (stryCov_9fa48("138987"), [])));
          return stryMutAct_9fa48("138990") ? rows.find(row => row?.operation_id === operationId) && null : stryMutAct_9fa48("138989") ? false : stryMutAct_9fa48("138988") ? true : (stryCov_9fa48("138988", "138989", "138990"), rows.find(stryMutAct_9fa48("138991") ? () => undefined : (stryCov_9fa48("138991"), row => stryMutAct_9fa48("138994") ? row?.operation_id !== operationId : stryMutAct_9fa48("138993") ? false : stryMutAct_9fa48("138992") ? true : (stryCov_9fa48("138992", "138993", "138994"), (stryMutAct_9fa48("138995") ? row.operation_id : (stryCov_9fa48("138995"), row?.operation_id)) === operationId))) || null);
        }
      }
      return null;
    }
  } /**
    * Filter replica_operations rows from cache using a predicate.
    * @param {Function} predicate
    * @return {Array|null} null when cache is unavailable
    */
  filterReplicaOperationRowsFromCache(predicate) {
    if (stryMutAct_9fa48("138996")) {
      {}
    } else {
      stryCov_9fa48("138996");
      if (stryMutAct_9fa48("138999") ? !this.systemTableCache && typeof predicate !== TYPEOF.FUNCTION : stryMutAct_9fa48("138998") ? false : stryMutAct_9fa48("138997") ? true : (stryCov_9fa48("138997", "138998", "138999"), (stryMutAct_9fa48("139000") ? this.systemTableCache : (stryCov_9fa48("139000"), !this.systemTableCache)) || (stryMutAct_9fa48("139002") ? typeof predicate === TYPEOF.FUNCTION : stryMutAct_9fa48("139001") ? false : (stryCov_9fa48("139001", "139002"), typeof predicate !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("139003")) {
          {}
        } else {
          stryCov_9fa48("139003");
          return null;
        }
      }
      if (stryMutAct_9fa48("139006") ? typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("139005") ? false : stryMutAct_9fa48("139004") ? true : (stryCov_9fa48("139004", "139005", "139006"), typeof this.systemTableCache.filter === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("139007")) {
          {}
        } else {
          stryCov_9fa48("139007");
          return stryMutAct_9fa48("139010") ? this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, predicate) && [] : stryMutAct_9fa48("139009") ? false : stryMutAct_9fa48("139008") ? true : (stryCov_9fa48("139008", "139009", "139010"), (stryMutAct_9fa48("139011") ? this.systemTableCache : (stryCov_9fa48("139011"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, predicate))) || (stryMutAct_9fa48("139012") ? ["Stryker was here"] : (stryCov_9fa48("139012"), [])));
        }
      }
      if (stryMutAct_9fa48("139015") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("139014") ? false : stryMutAct_9fa48("139013") ? true : (stryCov_9fa48("139013", "139014", "139015"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("139016")) {
          {}
        } else {
          stryCov_9fa48("139016");
          const rows = stryMutAct_9fa48("139019") ? this.systemTableCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) && [] : stryMutAct_9fa48("139018") ? false : stryMutAct_9fa48("139017") ? true : (stryCov_9fa48("139017", "139018", "139019"), this.systemTableCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) || (stryMutAct_9fa48("139020") ? ["Stryker was here"] : (stryCov_9fa48("139020"), [])));
          return stryMutAct_9fa48("139021") ? rows : (stryCov_9fa48("139021"), rows.filter(predicate));
        }
      }
      return null;
    }
  } /**
    * Return true when one cache observation boundary exists for
    * replica_operations.
    * @return {boolean}
    */
  hasReplicaOperationCacheObservationBoundary() {
    if (stryMutAct_9fa48("139022")) {
      {}
    } else {
      stryCov_9fa48("139022");
      return Boolean(stryMutAct_9fa48("139025") ? this.systemTableCache || typeof this.systemTableCache.filter === TYPEOF.FUNCTION || typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("139024") ? false : stryMutAct_9fa48("139023") ? true : (stryCov_9fa48("139023", "139024", "139025"), this.systemTableCache && (stryMutAct_9fa48("139027") ? typeof this.systemTableCache.filter === TYPEOF.FUNCTION && typeof this.systemTableCache.getAll === TYPEOF.FUNCTION : stryMutAct_9fa48("139026") ? true : (stryCov_9fa48("139026", "139027"), (stryMutAct_9fa48("139029") ? typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("139028") ? false : (stryCov_9fa48("139028", "139029"), typeof this.systemTableCache.filter === TYPEOF.FUNCTION)) || (stryMutAct_9fa48("139031") ? typeof this.systemTableCache.getAll !== TYPEOF.FUNCTION : stryMutAct_9fa48("139030") ? false : (stryCov_9fa48("139030", "139031"), typeof this.systemTableCache.getAll === TYPEOF.FUNCTION))))));
    }
  } /**
    * Get service rows for an entity from cache.
    * @param {object} params
    * @param {string} params.partitionId
    * @param {string} params.entityType
    * @param {string} params.entityId
    * @return {Array}
    */
  getEntityServiceRows({
    partitionId,
    entityType,
    entityId
  }) {
    if (stryMutAct_9fa48("139032")) {
      {}
    } else {
      stryCov_9fa48("139032");
      if (stryMutAct_9fa48("139035") ? !this.systemTableCache && typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("139034") ? false : stryMutAct_9fa48("139033") ? true : (stryCov_9fa48("139033", "139034", "139035"), (stryMutAct_9fa48("139036") ? this.systemTableCache : (stryCov_9fa48("139036"), !this.systemTableCache)) || (stryMutAct_9fa48("139038") ? typeof this.systemTableCache.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("139037") ? false : (stryCov_9fa48("139037", "139038"), typeof this.systemTableCache.filter !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("139039")) {
          {}
        } else {
          stryCov_9fa48("139039");
          return stryMutAct_9fa48("139040") ? ["Stryker was here"] : (stryCov_9fa48("139040"), []);
        }
      }
      return stryMutAct_9fa48("139043") ? this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, row => {
        if (!row || row.service_type !== entityType) {
          return false;
        }
        if (entityType === SERVICE_TYPE.MESSAGE_GROUP) {
          return row.group_id === entityId;
        }
        if (entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {
          return row.service_id === entityId;
        }
        return row.partition_id === partitionId;
      }) && [] : stryMutAct_9fa48("139042") ? false : stryMutAct_9fa48("139041") ? true : (stryCov_9fa48("139041", "139042", "139043"), (stryMutAct_9fa48("139044") ? this.systemTableCache : (stryCov_9fa48("139044"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, row => {
        if (stryMutAct_9fa48("139045")) {
          {}
        } else {
          stryCov_9fa48("139045");
          if (stryMutAct_9fa48("139048") ? !row && row.service_type !== entityType : stryMutAct_9fa48("139047") ? false : stryMutAct_9fa48("139046") ? true : (stryCov_9fa48("139046", "139047", "139048"), (stryMutAct_9fa48("139049") ? row : (stryCov_9fa48("139049"), !row)) || (stryMutAct_9fa48("139051") ? row.service_type === entityType : stryMutAct_9fa48("139050") ? false : (stryCov_9fa48("139050", "139051"), row.service_type !== entityType)))) {
            if (stryMutAct_9fa48("139052")) {
              {}
            } else {
              stryCov_9fa48("139052");
              return stryMutAct_9fa48("139053") ? true : (stryCov_9fa48("139053"), false);
            }
          }
          if (stryMutAct_9fa48("139056") ? entityType !== SERVICE_TYPE.MESSAGE_GROUP : stryMutAct_9fa48("139055") ? false : stryMutAct_9fa48("139054") ? true : (stryCov_9fa48("139054", "139055", "139056"), entityType === SERVICE_TYPE.MESSAGE_GROUP)) {
            if (stryMutAct_9fa48("139057")) {
              {}
            } else {
              stryCov_9fa48("139057");
              return stryMutAct_9fa48("139060") ? row.group_id !== entityId : stryMutAct_9fa48("139059") ? false : stryMutAct_9fa48("139058") ? true : (stryCov_9fa48("139058", "139059", "139060"), row.group_id === entityId);
            }
          }
          if (stryMutAct_9fa48("139063") ? entityType !== UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE : stryMutAct_9fa48("139062") ? false : stryMutAct_9fa48("139061") ? true : (stryCov_9fa48("139061", "139062", "139063"), entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE)) {
            if (stryMutAct_9fa48("139064")) {
              {}
            } else {
              stryCov_9fa48("139064");
              return stryMutAct_9fa48("139067") ? row.service_id !== entityId : stryMutAct_9fa48("139066") ? false : stryMutAct_9fa48("139065") ? true : (stryCov_9fa48("139065", "139066", "139067"), row.service_id === entityId);
            }
          }
          return stryMutAct_9fa48("139070") ? row.partition_id !== partitionId : stryMutAct_9fa48("139069") ? false : stryMutAct_9fa48("139068") ? true : (stryCov_9fa48("139068", "139069", "139070"), row.partition_id === partitionId);
        }
      }))) || (stryMutAct_9fa48("139071") ? ["Stryker was here"] : (stryCov_9fa48("139071"), [])));
    }
  } /**
    * Get in-flight operation rows for an entity from cache.
    * @param {object} params
    * @param {string} params.entityType
    * @param {string} params.entityId
    * @return {Array}
    */
  getEntityInFlightOperationRows({
    entityType,
    entityId
  }) {
    if (stryMutAct_9fa48("139072")) {
      {}
    } else {
      stryCov_9fa48("139072");
      if (stryMutAct_9fa48("139075") ? !this.systemTableCache && typeof this.systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("139074") ? false : stryMutAct_9fa48("139073") ? true : (stryCov_9fa48("139073", "139074", "139075"), (stryMutAct_9fa48("139076") ? this.systemTableCache : (stryCov_9fa48("139076"), !this.systemTableCache)) || (stryMutAct_9fa48("139078") ? typeof this.systemTableCache.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("139077") ? false : (stryCov_9fa48("139077", "139078"), typeof this.systemTableCache.filter !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("139079")) {
          {}
        } else {
          stryCov_9fa48("139079");
          return stryMutAct_9fa48("139080") ? ["Stryker was here"] : (stryCov_9fa48("139080"), []);
        }
      }
      return stryMutAct_9fa48("139083") ? this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, row => {
        if (!row || this.isOperationTerminal(row)) {
          return false;
        }
        const rowEntityType = row.entity_type || SERVICE_TYPE.PARTITION;
        const rowEntityId = row.entity_id || row.partition_id;
        return rowEntityType === entityType && rowEntityId === entityId;
      }) && [] : stryMutAct_9fa48("139082") ? false : stryMutAct_9fa48("139081") ? true : (stryCov_9fa48("139081", "139082", "139083"), (stryMutAct_9fa48("139084") ? this.systemTableCache : (stryCov_9fa48("139084"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, row => {
        if (stryMutAct_9fa48("139085")) {
          {}
        } else {
          stryCov_9fa48("139085");
          if (stryMutAct_9fa48("139088") ? !row && this.isOperationTerminal(row) : stryMutAct_9fa48("139087") ? false : stryMutAct_9fa48("139086") ? true : (stryCov_9fa48("139086", "139087", "139088"), (stryMutAct_9fa48("139089") ? row : (stryCov_9fa48("139089"), !row)) || this.isOperationTerminal(row))) {
            if (stryMutAct_9fa48("139090")) {
              {}
            } else {
              stryCov_9fa48("139090");
              return stryMutAct_9fa48("139091") ? true : (stryCov_9fa48("139091"), false);
            }
          }
          const rowEntityType = stryMutAct_9fa48("139094") ? row.entity_type && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("139093") ? false : stryMutAct_9fa48("139092") ? true : (stryCov_9fa48("139092", "139093", "139094"), row.entity_type || SERVICE_TYPE.PARTITION);
          const rowEntityId = stryMutAct_9fa48("139097") ? row.entity_id && row.partition_id : stryMutAct_9fa48("139096") ? false : stryMutAct_9fa48("139095") ? true : (stryCov_9fa48("139095", "139096", "139097"), row.entity_id || row.partition_id);
          return stryMutAct_9fa48("139100") ? rowEntityType === entityType || rowEntityId === entityId : stryMutAct_9fa48("139099") ? false : stryMutAct_9fa48("139098") ? true : (stryCov_9fa48("139098", "139099", "139100"), (stryMutAct_9fa48("139102") ? rowEntityType !== entityType : stryMutAct_9fa48("139101") ? true : (stryCov_9fa48("139101", "139102"), rowEntityType === entityType)) && (stryMutAct_9fa48("139104") ? rowEntityId !== entityId : stryMutAct_9fa48("139103") ? true : (stryCov_9fa48("139103", "139104"), rowEntityId === entityId)));
        }
      }))) || (stryMutAct_9fa48("139105") ? ["Stryker was here"] : (stryCov_9fa48("139105"), [])));
    }
  } // ── SQL Read Methods ────────────────────────────────────────────
  /**
   * Execute a read query against the replica_operations table.
   * @param {string} sql
   * @param {Array} params
   * @return {Promise<object>}
   */
  async executeReplicaOperationsRead(sql, params = stryMutAct_9fa48("139106") ? ["Stryker was here"] : (stryCov_9fa48("139106"), []), readOptions = null) {
    if (stryMutAct_9fa48("139107")) {
      {}
    } else {
      stryCov_9fa48("139107");
      const participationFailure = this.buildReplicaOperationReadParticipationFailure();
      if (stryMutAct_9fa48("139109") ? false : stryMutAct_9fa48("139108") ? true : (stryCov_9fa48("139108", "139109"), participationFailure)) {
        if (stryMutAct_9fa48("139110")) {
          {}
        } else {
          stryCov_9fa48("139110");
          return participationFailure;
        }
      }
      const retryOnRetryableFailure = Boolean(stryMutAct_9fa48("139113") ? readOptions && typeof readOptions === 'object' || readOptions.retryOnRetryableFailure === true : stryMutAct_9fa48("139112") ? false : stryMutAct_9fa48("139111") ? true : (stryCov_9fa48("139111", "139112", "139113"), (stryMutAct_9fa48("139115") ? readOptions || typeof readOptions === 'object' : stryMutAct_9fa48("139114") ? true : (stryCov_9fa48("139114", "139115"), readOptions && (stryMutAct_9fa48("139117") ? typeof readOptions !== 'object' : stryMutAct_9fa48("139116") ? true : (stryCov_9fa48("139116", "139117"), typeof readOptions === (stryMutAct_9fa48("139118") ? "" : (stryCov_9fa48("139118"), 'object')))))) && (stryMutAct_9fa48("139120") ? readOptions.retryOnRetryableFailure !== true : stryMutAct_9fa48("139119") ? true : (stryCov_9fa48("139119", "139120"), readOptions.retryOnRetryableFailure === (stryMutAct_9fa48("139121") ? false : (stryCov_9fa48("139121"), true))))));
      const queryOptions = (stryMutAct_9fa48("139124") ? readOptions || typeof readOptions === 'object' : stryMutAct_9fa48("139123") ? false : stryMutAct_9fa48("139122") ? true : (stryCov_9fa48("139122", "139123", "139124"), readOptions && (stryMutAct_9fa48("139126") ? typeof readOptions !== 'object' : stryMutAct_9fa48("139125") ? true : (stryCov_9fa48("139125", "139126"), typeof readOptions === (stryMutAct_9fa48("139127") ? "" : (stryCov_9fa48("139127"), 'object')))))) ? stryMutAct_9fa48("139128") ? {} : (stryCov_9fa48("139128"), {
        ...REPLICA_OPERATION_READ_QUERY_OPTIONS,
        ...readOptions
      }) : REPLICA_OPERATION_READ_QUERY_OPTIONS;
      delete queryOptions.retryOnRetryableFailure;
      const executeRead = stryMutAct_9fa48("139129") ? () => undefined : (stryCov_9fa48("139129"), (() => {
        const executeRead = async () => readAuthoritativeControlPlaneRows(this.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, sql, params, queryOptions);
        return executeRead;
      })());
      if (stryMutAct_9fa48("139132") ? false : stryMutAct_9fa48("139131") ? true : stryMutAct_9fa48("139130") ? retryOnRetryableFailure : (stryCov_9fa48("139130", "139131", "139132"), !retryOnRetryableFailure)) {
        if (stryMutAct_9fa48("139133")) {
          {}
        } else {
          stryCov_9fa48("139133");
          return executeRead();
        }
      }
      const deadlineAtMs = stryMutAct_9fa48("139134") ? Date.now() - REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS : (stryCov_9fa48("139134"), Date.now() + REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS);
      while (stryMutAct_9fa48("139136") ? false : stryMutAct_9fa48("139135") ? false : (stryCov_9fa48("139135", "139136"), true)) {
        if (stryMutAct_9fa48("139137")) {
          {}
        } else {
          stryCov_9fa48("139137");
          const result = await executeRead();
          if (stryMutAct_9fa48("139140") ? result?.success !== false && !isRetryableControlPlaneError(result) : stryMutAct_9fa48("139139") ? false : stryMutAct_9fa48("139138") ? true : (stryCov_9fa48("139138", "139139", "139140"), (stryMutAct_9fa48("139142") ? result?.success === false : stryMutAct_9fa48("139141") ? false : (stryCov_9fa48("139141", "139142"), (stryMutAct_9fa48("139143") ? result.success : (stryCov_9fa48("139143"), result?.success)) !== (stryMutAct_9fa48("139144") ? true : (stryCov_9fa48("139144"), false)))) || (stryMutAct_9fa48("139145") ? isRetryableControlPlaneError(result) : (stryCov_9fa48("139145"), !isRetryableControlPlaneError(result))))) {
            if (stryMutAct_9fa48("139146")) {
              {}
            } else {
              stryCov_9fa48("139146");
              return result;
            }
          }
          const remainingMs = stryMutAct_9fa48("139147") ? deadlineAtMs + Date.now() : (stryCov_9fa48("139147"), deadlineAtMs - Date.now());
          if (stryMutAct_9fa48("139151") ? remainingMs > NUM.ZERO : stryMutAct_9fa48("139150") ? remainingMs < NUM.ZERO : stryMutAct_9fa48("139149") ? false : stryMutAct_9fa48("139148") ? true : (stryCov_9fa48("139148", "139149", "139150", "139151"), remainingMs <= NUM.ZERO)) {
            if (stryMutAct_9fa48("139152")) {
              {}
            } else {
              stryCov_9fa48("139152");
              return result;
            }
          }
          await this.waitForReplicaOperationReadRetry(stryMutAct_9fa48("139153") ? Math.max(this.getRetryableReplicaOperationReadRetryDelayMs(result), remainingMs) : (stryCov_9fa48("139153"), Math.min(this.getRetryableReplicaOperationReadRetryDelayMs(result), remainingMs)));
        }
      }
    }
  } /**
    * Return a bounded deferred result when the canonical readiness owner says
    * the local replica_operations owner path should not issue a routed read yet.
    * @return {Object|null}
    * @private
    */
  buildReplicaOperationReadParticipationFailure() {
    if (stryMutAct_9fa48("139154")) {
      {}
    } else {
      stryCov_9fa48("139154");
      if (stryMutAct_9fa48("139157") ? !this.controlPlaneReadinessService && typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync !== TYPEOF.FUNCTION : stryMutAct_9fa48("139156") ? false : stryMutAct_9fa48("139155") ? true : (stryCov_9fa48("139155", "139156", "139157"), (stryMutAct_9fa48("139158") ? this.controlPlaneReadinessService : (stryCov_9fa48("139158"), !this.controlPlaneReadinessService)) || (stryMutAct_9fa48("139160") ? typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync === TYPEOF.FUNCTION : stryMutAct_9fa48("139159") ? false : (stryCov_9fa48("139159", "139160"), typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("139161")) {
          {}
        } else {
          stryCov_9fa48("139161");
          return null;
        }
      }
      const participation = this.controlPlaneReadinessService.getControlPlaneParticipationSync(this.nodeId, stryMutAct_9fa48("139162") ? {} : (stryCov_9fa48("139162"), {
        participationKind: CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ,
        decisionDimension: REPLICA_OPERATION_READINESS_DIMENSION,
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        partitionId: stryMutAct_9fa48("139165") ? INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS] && null : stryMutAct_9fa48("139164") ? false : stryMutAct_9fa48("139163") ? true : (stryCov_9fa48("139163", "139164", "139165"), INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS] || null)
      }));
      if (stryMutAct_9fa48("139168") ? !participation && participation.eligible === true : stryMutAct_9fa48("139167") ? false : stryMutAct_9fa48("139166") ? true : (stryCov_9fa48("139166", "139167", "139168"), (stryMutAct_9fa48("139169") ? participation : (stryCov_9fa48("139169"), !participation)) || (stryMutAct_9fa48("139171") ? participation.eligible !== true : stryMutAct_9fa48("139170") ? false : (stryCov_9fa48("139170", "139171"), participation.eligible === (stryMutAct_9fa48("139172") ? false : (stryCov_9fa48("139172"), true)))))) {
        if (stryMutAct_9fa48("139173")) {
          {}
        } else {
          stryCov_9fa48("139173");
          return null;
        }
      }
      if (stryMutAct_9fa48("139176") ? participation.localExecutionAllowed !== true : stryMutAct_9fa48("139175") ? false : stryMutAct_9fa48("139174") ? true : (stryCov_9fa48("139174", "139175", "139176"), participation.localExecutionAllowed === (stryMutAct_9fa48("139177") ? false : (stryCov_9fa48("139177"), true)))) {
        if (stryMutAct_9fa48("139178")) {
          {}
        } else {
          stryCov_9fa48("139178");
          return null;
        }
      }
      if (stryMutAct_9fa48("139181") ? false : stryMutAct_9fa48("139180") ? true : stryMutAct_9fa48("139179") ? shouldDeferReplicaOperationOwnerRead(participation) : (stryCov_9fa48("139179", "139180", "139181"), !shouldDeferReplicaOperationOwnerRead(participation))) {
        if (stryMutAct_9fa48("139182")) {
          {}
        } else {
          stryCov_9fa48("139182");
          return null;
        }
      }
      return stryMutAct_9fa48("139183") ? {} : (stryCov_9fa48("139183"), {
        success: stryMutAct_9fa48("139184") ? true : (stryCov_9fa48("139184"), false),
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        error: stryMutAct_9fa48("139187") ? participation.error && REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROL_PLANE_PARTICIPATION_DEFERRED_BY_CANONICAL_READINESS : stryMutAct_9fa48("139186") ? false : stryMutAct_9fa48("139185") ? true : (stryCov_9fa48("139185", "139186", "139187"), participation.error || REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROL_PLANE_PARTICIPATION_DEFERRED_BY_CANONICAL_READINESS),
        errorCode: stryMutAct_9fa48("139190") ? participation.errorCode && null : stryMutAct_9fa48("139189") ? false : stryMutAct_9fa48("139188") ? true : (stryCov_9fa48("139188", "139189", "139190"), participation.errorCode || null),
        code: stryMutAct_9fa48("139193") ? participation.errorCode && null : stryMutAct_9fa48("139192") ? false : stryMutAct_9fa48("139191") ? true : (stryCov_9fa48("139191", "139192", "139193"), participation.errorCode || null),
        reasonCode: stryMutAct_9fa48("139196") ? participation.reasonCode && null : stryMutAct_9fa48("139195") ? false : stryMutAct_9fa48("139194") ? true : (stryCov_9fa48("139194", "139195", "139196"), participation.reasonCode || null),
        participationKind: stryMutAct_9fa48("139199") ? participation.participationKind && null : stryMutAct_9fa48("139198") ? false : stryMutAct_9fa48("139197") ? true : (stryCov_9fa48("139197", "139198", "139199"), participation.participationKind || null),
        retryAfterMs: stryMutAct_9fa48("139202") ? getControlPlaneRetryAfterMs(participation) && null : stryMutAct_9fa48("139201") ? false : stryMutAct_9fa48("139200") ? true : (stryCov_9fa48("139200", "139201", "139202"), getControlPlaneRetryAfterMs(participation) || null),
        deferRetry: stryMutAct_9fa48("139205") ? participation.deferRetry !== true : stryMutAct_9fa48("139204") ? false : stryMutAct_9fa48("139203") ? true : (stryCov_9fa48("139203", "139204", "139205"), participation.deferRetry === (stryMutAct_9fa48("139206") ? false : (stryCov_9fa48("139206"), true))),
        rows: stryMutAct_9fa48("139207") ? ["Stryker was here"] : (stryCov_9fa48("139207"), [])
      });
    }
  } /**
    * Query a single operation by ID (cache-first, SQL fallback).
    * @param {string} operationId
    * @return {Promise<object|null>}
    */
  async queryOperationById(operationId) {
    if (stryMutAct_9fa48("139208")) {
      {}
    } else {
      stryCov_9fa48("139208");
      const cachedRow = this.getReplicaOperationRowFromCache(operationId);
      if (stryMutAct_9fa48("139210") ? false : stryMutAct_9fa48("139209") ? true : (stryCov_9fa48("139209", "139210"), cachedRow)) {
        if (stryMutAct_9fa48("139211")) {
          {}
        } else {
          stryCov_9fa48("139211");
          return this.rowToOperation(cachedRow);
        }
      }
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATION_BY_ID, stryMutAct_9fa48("139212") ? [] : (stryCov_9fa48("139212"), [operationId]));
      if (stryMutAct_9fa48("139215") ? (!result.success || !result.rows) && result.rows.length === NUM.ZERO : stryMutAct_9fa48("139214") ? false : stryMutAct_9fa48("139213") ? true : (stryCov_9fa48("139213", "139214", "139215"), (stryMutAct_9fa48("139217") ? !result.success && !result.rows : stryMutAct_9fa48("139216") ? false : (stryCov_9fa48("139216", "139217"), (stryMutAct_9fa48("139218") ? result.success : (stryCov_9fa48("139218"), !result.success)) || (stryMutAct_9fa48("139219") ? result.rows : (stryCov_9fa48("139219"), !result.rows)))) || (stryMutAct_9fa48("139221") ? result.rows.length !== NUM.ZERO : stryMutAct_9fa48("139220") ? false : (stryCov_9fa48("139220", "139221"), result.rows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("139222")) {
          {}
        } else {
          stryCov_9fa48("139222");
          return null;
        }
      }
      const operation = this.rowToOperation(result.rows[NUM.ZERO]);
      return isCoordinatorOwnedOperationType(stryMutAct_9fa48("139223") ? operation.type : (stryCov_9fa48("139223"), operation?.type)) ? operation : null;
    }
  } /**
    * Query a single operation by ID from the authoritative owner path only.
    * @param {string} operationId
    * @param {object} [options]
    * @param {boolean} [options.requireOwnerRpcRead]
    * @return {Promise<object|null>}
    */
  async queryAuthoritativeOperationById(operationId, options = {}) {
    if (stryMutAct_9fa48("139224")) {
      {}
    } else {
      stryCov_9fa48("139224");
      const requireOwnerRpcRead = stryMutAct_9fa48("139227") ? options?.requireOwnerRpcRead !== true : stryMutAct_9fa48("139226") ? false : stryMutAct_9fa48("139225") ? true : (stryCov_9fa48("139225", "139226", "139227"), (stryMutAct_9fa48("139228") ? options.requireOwnerRpcRead : (stryCov_9fa48("139228"), options?.requireOwnerRpcRead)) === (stryMutAct_9fa48("139229") ? false : (stryCov_9fa48("139229"), true)));
      const readQueryOptions = requireOwnerRpcRead ? REPLICA_OPERATION_STRICT_DEDUPE_READ_QUERY_OPTIONS : REPLICA_OPERATION_PERSIST_CONFIRMATION_READ_QUERY_OPTIONS;
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATION_BY_ID, stryMutAct_9fa48("139230") ? [] : (stryCov_9fa48("139230"), [operationId]), stryMutAct_9fa48("139231") ? {} : (stryCov_9fa48("139231"), {
        ...readQueryOptions,
        retryOnRetryableFailure: stryMutAct_9fa48("139232") ? false : (stryCov_9fa48("139232"), true)
      }));
      if (stryMutAct_9fa48("139235") ? (!result.success || !Array.isArray(result.rows)) && result.rows.length === NUM.ZERO : stryMutAct_9fa48("139234") ? false : stryMutAct_9fa48("139233") ? true : (stryCov_9fa48("139233", "139234", "139235"), (stryMutAct_9fa48("139237") ? !result.success && !Array.isArray(result.rows) : stryMutAct_9fa48("139236") ? false : (stryCov_9fa48("139236", "139237"), (stryMutAct_9fa48("139238") ? result.success : (stryCov_9fa48("139238"), !result.success)) || (stryMutAct_9fa48("139239") ? Array.isArray(result.rows) : (stryCov_9fa48("139239"), !Array.isArray(result.rows))))) || (stryMutAct_9fa48("139241") ? result.rows.length !== NUM.ZERO : stryMutAct_9fa48("139240") ? false : (stryCov_9fa48("139240", "139241"), result.rows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("139242")) {
          {}
        } else {
          stryCov_9fa48("139242");
          return null;
        }
      }
      const matchingRow = stryMutAct_9fa48("139245") ? result.rows.find(row => {
        return row?.operation_id === operationId;
      }) && result.rows[NUM.ZERO] : stryMutAct_9fa48("139244") ? false : stryMutAct_9fa48("139243") ? true : (stryCov_9fa48("139243", "139244", "139245"), result.rows.find(row => {
        if (stryMutAct_9fa48("139246")) {
          {}
        } else {
          stryCov_9fa48("139246");
          return stryMutAct_9fa48("139249") ? row?.operation_id !== operationId : stryMutAct_9fa48("139248") ? false : stryMutAct_9fa48("139247") ? true : (stryCov_9fa48("139247", "139248", "139249"), (stryMutAct_9fa48("139250") ? row.operation_id : (stryCov_9fa48("139250"), row?.operation_id)) === operationId);
        }
      }) || result.rows[NUM.ZERO]);
      const operation = this.rowToOperation(matchingRow);
      return isCoordinatorOwnedOperationType(stryMutAct_9fa48("139251") ? operation.type : (stryCov_9fa48("139251"), operation?.type)) ? operation : null;
    }
  } /**
    * Normalize incomplete-operation rows into the canonical owner view.
    * @param {Object[]} rows
    * @return {Object[]}
    * @private
    */
  mapAndSortIncompleteOperations(rows = stryMutAct_9fa48("139252") ? ["Stryker was here"] : (stryCov_9fa48("139252"), [])) {
    if (stryMutAct_9fa48("139253")) {
      {}
    } else {
      stryCov_9fa48("139253");
      return stryMutAct_9fa48("139255") ? rows.map(row => this.rowToOperation(row)).sort((left, right) => {
        const leftUpdatedAt = Number(left?.updatedAt) || NUM.ZERO;
        const rightUpdatedAt = Number(right?.updatedAt) || NUM.ZERO;
        if (leftUpdatedAt !== rightUpdatedAt) {
          return leftUpdatedAt - rightUpdatedAt;
        }
        return String(left?.operationId || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE).localeCompare(String(right?.operationId || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE));
      }) : stryMutAct_9fa48("139254") ? rows.map(row => this.rowToOperation(row)).filter(operation => isCoordinatorOwnedOperationType(operation?.type) && this.isOperationLocallyOwned(operation) && !this.isOperationTerminal(operation)) : (stryCov_9fa48("139254", "139255"), rows.map(stryMutAct_9fa48("139256") ? () => undefined : (stryCov_9fa48("139256"), row => this.rowToOperation(row))).filter(stryMutAct_9fa48("139257") ? () => undefined : (stryCov_9fa48("139257"), operation => stryMutAct_9fa48("139260") ? isCoordinatorOwnedOperationType(operation?.type) && this.isOperationLocallyOwned(operation) || !this.isOperationTerminal(operation) : stryMutAct_9fa48("139259") ? false : stryMutAct_9fa48("139258") ? true : (stryCov_9fa48("139258", "139259", "139260"), (stryMutAct_9fa48("139262") ? isCoordinatorOwnedOperationType(operation?.type) || this.isOperationLocallyOwned(operation) : stryMutAct_9fa48("139261") ? true : (stryCov_9fa48("139261", "139262"), isCoordinatorOwnedOperationType(stryMutAct_9fa48("139263") ? operation.type : (stryCov_9fa48("139263"), operation?.type)) && this.isOperationLocallyOwned(operation))) && (stryMutAct_9fa48("139264") ? this.isOperationTerminal(operation) : (stryCov_9fa48("139264"), !this.isOperationTerminal(operation)))))).sort((left, right) => {
        if (stryMutAct_9fa48("139265")) {
          {}
        } else {
          stryCov_9fa48("139265");
          const leftUpdatedAt = stryMutAct_9fa48("139268") ? Number(left?.updatedAt) && NUM.ZERO : stryMutAct_9fa48("139267") ? false : stryMutAct_9fa48("139266") ? true : (stryCov_9fa48("139266", "139267", "139268"), Number(stryMutAct_9fa48("139269") ? left.updatedAt : (stryCov_9fa48("139269"), left?.updatedAt)) || NUM.ZERO);
          const rightUpdatedAt = stryMutAct_9fa48("139272") ? Number(right?.updatedAt) && NUM.ZERO : stryMutAct_9fa48("139271") ? false : stryMutAct_9fa48("139270") ? true : (stryCov_9fa48("139270", "139271", "139272"), Number(stryMutAct_9fa48("139273") ? right.updatedAt : (stryCov_9fa48("139273"), right?.updatedAt)) || NUM.ZERO);
          if (stryMutAct_9fa48("139276") ? leftUpdatedAt === rightUpdatedAt : stryMutAct_9fa48("139275") ? false : stryMutAct_9fa48("139274") ? true : (stryCov_9fa48("139274", "139275", "139276"), leftUpdatedAt !== rightUpdatedAt)) {
            if (stryMutAct_9fa48("139277")) {
              {}
            } else {
              stryCov_9fa48("139277");
              return stryMutAct_9fa48("139278") ? leftUpdatedAt + rightUpdatedAt : (stryCov_9fa48("139278"), leftUpdatedAt - rightUpdatedAt);
            }
          }
          return String(stryMutAct_9fa48("139281") ? left?.operationId && REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE : stryMutAct_9fa48("139280") ? false : stryMutAct_9fa48("139279") ? true : (stryCov_9fa48("139279", "139280", "139281"), (stryMutAct_9fa48("139282") ? left.operationId : (stryCov_9fa48("139282"), left?.operationId)) || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE)).localeCompare(String(stryMutAct_9fa48("139285") ? right?.operationId && REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE : stryMutAct_9fa48("139284") ? false : stryMutAct_9fa48("139283") ? true : (stryCov_9fa48("139283", "139284", "139285"), (stryMutAct_9fa48("139286") ? right.operationId : (stryCov_9fa48("139286"), right?.operationId)) || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE)));
        }
      }));
    }
  } /**
    * Return only the cache-visible incomplete operations.
    * Callers that specifically need the cache observation boundary should use
    * this surface instead of tuning fallback behavior on the general read API.
    *
    * @return {Object[]}
    */
  queryCachedIncompleteOperations() {
    if (stryMutAct_9fa48("139287")) {
      {}
    } else {
      stryCov_9fa48("139287");
      const cachedRows = this.filterReplicaOperationRowsFromCache(row => {
        if (stryMutAct_9fa48("139288")) {
          {}
        } else {
          stryCov_9fa48("139288");
          if (stryMutAct_9fa48("139291") ? false : stryMutAct_9fa48("139290") ? true : stryMutAct_9fa48("139289") ? row : (stryCov_9fa48("139289", "139290", "139291"), !row)) {
            if (stryMutAct_9fa48("139292")) {
              {}
            } else {
              stryCov_9fa48("139292");
              return stryMutAct_9fa48("139293") ? true : (stryCov_9fa48("139293"), false);
            }
          }
          return stryMutAct_9fa48("139296") ? (row.workflow_step === WORKFLOW_STEP.PENDING || row.workflow_step === WORKFLOW_STEP.SENDING || row.workflow_step === WORKFLOW_STEP.CREATING || row.workflow_step === WORKFLOW_STEP.SYNCING || row.workflow_step === WORKFLOW_STEP.STOPPING) && row.workflow_step === WORKFLOW_STEP.ACTIVE && row.type === OperationType.REPLACE : stryMutAct_9fa48("139295") ? false : stryMutAct_9fa48("139294") ? true : (stryCov_9fa48("139294", "139295", "139296"), (stryMutAct_9fa48("139298") ? (row.workflow_step === WORKFLOW_STEP.PENDING || row.workflow_step === WORKFLOW_STEP.SENDING || row.workflow_step === WORKFLOW_STEP.CREATING || row.workflow_step === WORKFLOW_STEP.SYNCING) && row.workflow_step === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("139297") ? false : (stryCov_9fa48("139297", "139298"), (stryMutAct_9fa48("139300") ? (row.workflow_step === WORKFLOW_STEP.PENDING || row.workflow_step === WORKFLOW_STEP.SENDING || row.workflow_step === WORKFLOW_STEP.CREATING) && row.workflow_step === WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("139299") ? false : (stryCov_9fa48("139299", "139300"), (stryMutAct_9fa48("139302") ? (row.workflow_step === WORKFLOW_STEP.PENDING || row.workflow_step === WORKFLOW_STEP.SENDING) && row.workflow_step === WORKFLOW_STEP.CREATING : stryMutAct_9fa48("139301") ? false : (stryCov_9fa48("139301", "139302"), (stryMutAct_9fa48("139304") ? row.workflow_step === WORKFLOW_STEP.PENDING && row.workflow_step === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("139303") ? false : (stryCov_9fa48("139303", "139304"), (stryMutAct_9fa48("139306") ? row.workflow_step !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("139305") ? false : (stryCov_9fa48("139305", "139306"), row.workflow_step === WORKFLOW_STEP.PENDING)) || (stryMutAct_9fa48("139308") ? row.workflow_step !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("139307") ? false : (stryCov_9fa48("139307", "139308"), row.workflow_step === WORKFLOW_STEP.SENDING)))) || (stryMutAct_9fa48("139310") ? row.workflow_step !== WORKFLOW_STEP.CREATING : stryMutAct_9fa48("139309") ? false : (stryCov_9fa48("139309", "139310"), row.workflow_step === WORKFLOW_STEP.CREATING)))) || (stryMutAct_9fa48("139312") ? row.workflow_step !== WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("139311") ? false : (stryCov_9fa48("139311", "139312"), row.workflow_step === WORKFLOW_STEP.SYNCING)))) || (stryMutAct_9fa48("139314") ? row.workflow_step !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("139313") ? false : (stryCov_9fa48("139313", "139314"), row.workflow_step === WORKFLOW_STEP.STOPPING)))) || (stryMutAct_9fa48("139316") ? row.workflow_step === WORKFLOW_STEP.ACTIVE || row.type === OperationType.REPLACE : stryMutAct_9fa48("139315") ? false : (stryCov_9fa48("139315", "139316"), (stryMutAct_9fa48("139318") ? row.workflow_step !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("139317") ? true : (stryCov_9fa48("139317", "139318"), row.workflow_step === WORKFLOW_STEP.ACTIVE)) && (stryMutAct_9fa48("139320") ? row.type !== OperationType.REPLACE : stryMutAct_9fa48("139319") ? true : (stryCov_9fa48("139319", "139320"), row.type === OperationType.REPLACE)))));
        }
      });
      if (stryMutAct_9fa48("139323") ? cachedRows !== null : stryMutAct_9fa48("139322") ? false : stryMutAct_9fa48("139321") ? true : (stryCov_9fa48("139321", "139322", "139323"), cachedRows === null)) {
        if (stryMutAct_9fa48("139324")) {
          {}
        } else {
          stryCov_9fa48("139324");
          return stryMutAct_9fa48("139325") ? ["Stryker was here"] : (stryCov_9fa48("139325"), []);
        }
      }
      return this.mapAndSortIncompleteOperations(cachedRows);
    }
  } /**
    * Query all incomplete (in-flight) operations owned by this node.
    * @param {object} [options={}]
    * @param {boolean} [options.preferAuthoritativeRead]
    * @return {Promise<Array>}
    */
  async queryIncompleteOperations(options = {}) {
    if (stryMutAct_9fa48("139326")) {
      {}
    } else {
      stryCov_9fa48("139326");
      const preferAuthoritativeRead = stryMutAct_9fa48("139329") ? options.preferAuthoritativeRead !== true : stryMutAct_9fa48("139328") ? false : stryMutAct_9fa48("139327") ? true : (stryCov_9fa48("139327", "139328", "139329"), options.preferAuthoritativeRead === (stryMutAct_9fa48("139330") ? false : (stryCov_9fa48("139330"), true)));
      const authoritativeReadOptions = preferAuthoritativeRead ? stryMutAct_9fa48("139331") ? {} : (stryCov_9fa48("139331"), {
        ...REPLICA_OPERATION_STRICT_DEDUPE_READ_QUERY_OPTIONS,
        retryOnRetryableFailure: stryMutAct_9fa48("139332") ? false : (stryCov_9fa48("139332"), true)
      }) : null;
      if (stryMutAct_9fa48("139335") ? false : stryMutAct_9fa48("139334") ? true : stryMutAct_9fa48("139333") ? preferAuthoritativeRead : (stryCov_9fa48("139333", "139334", "139335"), !preferAuthoritativeRead)) {
        if (stryMutAct_9fa48("139336")) {
          {}
        } else {
          stryCov_9fa48("139336");
          const cachedOperations = this.queryCachedIncompleteOperations();
          if (stryMutAct_9fa48("139339") ? cachedOperations.length === NUM.ZERO || this.nextIncompleteOperationSqlRetryAtMs > Date.now() : stryMutAct_9fa48("139338") ? false : stryMutAct_9fa48("139337") ? true : (stryCov_9fa48("139337", "139338", "139339"), (stryMutAct_9fa48("139341") ? cachedOperations.length !== NUM.ZERO : stryMutAct_9fa48("139340") ? true : (stryCov_9fa48("139340", "139341"), cachedOperations.length === NUM.ZERO)) && (stryMutAct_9fa48("139344") ? this.nextIncompleteOperationSqlRetryAtMs <= Date.now() : stryMutAct_9fa48("139343") ? this.nextIncompleteOperationSqlRetryAtMs >= Date.now() : stryMutAct_9fa48("139342") ? true : (stryCov_9fa48("139342", "139343", "139344"), this.nextIncompleteOperationSqlRetryAtMs > Date.now())))) {
            if (stryMutAct_9fa48("139345")) {
              {}
            } else {
              stryCov_9fa48("139345");
              return stryMutAct_9fa48("139346") ? ["Stryker was here"] : (stryCov_9fa48("139346"), []);
            }
          }
          if (stryMutAct_9fa48("139349") ? cachedOperations.length > NUM.ZERO && options.skipSqlFallbackWhenCacheEmpty === true : stryMutAct_9fa48("139348") ? false : stryMutAct_9fa48("139347") ? true : (stryCov_9fa48("139347", "139348", "139349"), (stryMutAct_9fa48("139352") ? cachedOperations.length <= NUM.ZERO : stryMutAct_9fa48("139351") ? cachedOperations.length >= NUM.ZERO : stryMutAct_9fa48("139350") ? false : (stryCov_9fa48("139350", "139351", "139352"), cachedOperations.length > NUM.ZERO)) || (stryMutAct_9fa48("139354") ? options.skipSqlFallbackWhenCacheEmpty !== true : stryMutAct_9fa48("139353") ? false : (stryCov_9fa48("139353", "139354"), options.skipSqlFallbackWhenCacheEmpty === (stryMutAct_9fa48("139355") ? false : (stryCov_9fa48("139355"), true)))))) {
            if (stryMutAct_9fa48("139356")) {
              {}
            } else {
              stryCov_9fa48("139356");
              return cachedOperations;
            }
          }
        }
      }
      const queryStartedAtMs = Date.now();
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_INCOMPLETE_OPERATIONS, stryMutAct_9fa48("139357") ? [] : (stryCov_9fa48("139357"), [this.nodeId, this.nodeId, WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING, WORKFLOW_STEP.CREATING, WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.STOPPING, WORKFLOW_STEP.ACTIVE, OperationType.REPLACE]), authoritativeReadOptions);
      const queryDurationMs = stryMutAct_9fa48("139358") ? Date.now() + queryStartedAtMs : (stryCov_9fa48("139358"), Date.now() - queryStartedAtMs);
      const rowCount = Array.isArray(stryMutAct_9fa48("139359") ? result.rows : (stryCov_9fa48("139359"), result?.rows)) ? result.rows.length : NUM.ZERO;
      if (stryMutAct_9fa48("139362") ? !result.success && !result.rows : stryMutAct_9fa48("139361") ? false : stryMutAct_9fa48("139360") ? true : (stryCov_9fa48("139360", "139361", "139362"), (stryMutAct_9fa48("139363") ? result.success : (stryCov_9fa48("139363"), !result.success)) || (stryMutAct_9fa48("139364") ? result.rows : (stryCov_9fa48("139364"), !result.rows)))) {
        if (stryMutAct_9fa48("139365")) {
          {}
        } else {
          stryCov_9fa48("139365");
          const logPayload = buildControlPlaneFailurePayload(this.nodeId, result);
          if (stryMutAct_9fa48("139367") ? false : stryMutAct_9fa48("139366") ? true : (stryCov_9fa48("139366", "139367"), isRetryableControlPlaneError(result))) {
            if (stryMutAct_9fa48("139368")) {
              {}
            } else {
              stryCov_9fa48("139368");
              this.nextIncompleteOperationSqlRetryAtMs = stryMutAct_9fa48("139369") ? Date.now() - this.getRetryableIncompleteOperationReadBackoffMs(result) : (stryCov_9fa48("139369"), Date.now() + this.getRetryableIncompleteOperationReadBackoffMs(result));
              this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, logPayload);
            }
          } else {
            if (stryMutAct_9fa48("139370")) {
              {}
            } else {
              stryCov_9fa48("139370");
              this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, logPayload);
            }
          }
          return stryMutAct_9fa48("139371") ? ["Stryker was here"] : (stryCov_9fa48("139371"), []);
        }
      }
      this.nextIncompleteOperationSqlRetryAtMs = NUM.ZERO;
      const shouldWarnOnQueryPressure = stryMutAct_9fa48("139374") ? queryDurationMs >= INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS && rowCount >= INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD : stryMutAct_9fa48("139373") ? false : stryMutAct_9fa48("139372") ? true : (stryCov_9fa48("139372", "139373", "139374"), (stryMutAct_9fa48("139377") ? queryDurationMs < INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS : stryMutAct_9fa48("139376") ? queryDurationMs > INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS : stryMutAct_9fa48("139375") ? false : (stryCov_9fa48("139375", "139376", "139377"), queryDurationMs >= INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS)) || (stryMutAct_9fa48("139380") ? rowCount < INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD : stryMutAct_9fa48("139379") ? rowCount > INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD : stryMutAct_9fa48("139378") ? false : (stryCov_9fa48("139378", "139379", "139380"), rowCount >= INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD)));
      if (stryMutAct_9fa48("139382") ? false : stryMutAct_9fa48("139381") ? true : (stryCov_9fa48("139381", "139382"), shouldWarnOnQueryPressure)) {
        if (stryMutAct_9fa48("139383")) {
          {}
        } else {
          stryCov_9fa48("139383");
          const nowMs = Date.now();
          if (stryMutAct_9fa48("139387") ? nowMs - this.lastIncompleteOperationQueryWarningAtMs < INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS : stryMutAct_9fa48("139386") ? nowMs - this.lastIncompleteOperationQueryWarningAtMs > INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS : stryMutAct_9fa48("139385") ? false : stryMutAct_9fa48("139384") ? true : (stryCov_9fa48("139384", "139385", "139386", "139387"), (stryMutAct_9fa48("139388") ? nowMs + this.lastIncompleteOperationQueryWarningAtMs : (stryCov_9fa48("139388"), nowMs - this.lastIncompleteOperationQueryWarningAtMs)) >= INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS)) {
            if (stryMutAct_9fa48("139389")) {
              {}
            } else {
              stryCov_9fa48("139389");
              this.lastIncompleteOperationQueryWarningAtMs = nowMs;
              this.logger.warn(stryMutAct_9fa48("139390") ? REPLICA_OPERATION_REPOSITORY_LITERAL.IN_FLIGHT_OPERATION_OWNER_QUERY_INDICATES - REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROL_PLANE_PRESSURE : (stryCov_9fa48("139390"), REPLICA_OPERATION_REPOSITORY_LITERAL.IN_FLIGHT_OPERATION_OWNER_QUERY_INDICATES + REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROL_PLANE_PRESSURE), stryMutAct_9fa48("139391") ? {} : (stryCov_9fa48("139391"), {
                nodeId: this.nodeId,
                queryDurationMs,
                rowCount
              }));
            }
          }
        }
      }
      return this.mapAndSortIncompleteOperations(result.rows);
    }
  } /**
    * Query for an existing in-flight operation matching a move intent.
    * @param {string} partitionId
    * @param {string} targetNodeId
    * @param {string} entityType
    * @param {string} entityId
    * @param {object} move
    * @param {Function} operationMatchesMoveIntent
    * @return {Promise<object|null>}
    */
  async queryExistingInFlightOperation(partitionId, targetNodeId, entityType, entityId, move, operationMatchesMoveIntent, options = {}) {
    if (stryMutAct_9fa48("139392")) {
      {}
    } else {
      stryCov_9fa48("139392");
      const readOptions = (stryMutAct_9fa48("139395") ? options?.readOptions || typeof options.readOptions === 'object' : stryMutAct_9fa48("139394") ? false : stryMutAct_9fa48("139393") ? true : (stryCov_9fa48("139393", "139394", "139395"), (stryMutAct_9fa48("139396") ? options.readOptions : (stryCov_9fa48("139396"), options?.readOptions)) && (stryMutAct_9fa48("139398") ? typeof options.readOptions !== 'object' : stryMutAct_9fa48("139397") ? true : (stryCov_9fa48("139397", "139398"), typeof options.readOptions === (stryMutAct_9fa48("139399") ? "" : (stryCov_9fa48("139399"), 'object')))))) ? options.readOptions : null;
      const allowCacheFallbackOnReadFailure = (stryMutAct_9fa48("139402") ? options?.allowCacheFallbackOnReadFailure !== false : stryMutAct_9fa48("139401") ? false : stryMutAct_9fa48("139400") ? true : (stryCov_9fa48("139400", "139401", "139402"), (stryMutAct_9fa48("139403") ? options.allowCacheFallbackOnReadFailure : (stryCov_9fa48("139403"), options?.allowCacheFallbackOnReadFailure)) === (stryMutAct_9fa48("139404") ? true : (stryCov_9fa48("139404"), false)))) ? stryMutAct_9fa48("139405") ? true : (stryCov_9fa48("139405"), false) : stryMutAct_9fa48("139408") ? readOptions?.requireOwnerRpcRead === true : stryMutAct_9fa48("139407") ? false : stryMutAct_9fa48("139406") ? true : (stryCov_9fa48("139406", "139407", "139408"), (stryMutAct_9fa48("139409") ? readOptions.requireOwnerRpcRead : (stryCov_9fa48("139409"), readOptions?.requireOwnerRpcRead)) !== (stryMutAct_9fa48("139410") ? false : (stryCov_9fa48("139410"), true)));
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_IN_FLIGHT_FOR_ENTITY_NODE, stryMutAct_9fa48("139411") ? [] : (stryCov_9fa48("139411"), [partitionId, targetNodeId, entityType, entityId]), readOptions);
      if (stryMutAct_9fa48("139414") ? result.success || Array.isArray(result.rows) : stryMutAct_9fa48("139413") ? false : stryMutAct_9fa48("139412") ? true : (stryCov_9fa48("139412", "139413", "139414"), result.success && Array.isArray(result.rows))) {
        if (stryMutAct_9fa48("139415")) {
          {}
        } else {
          stryCov_9fa48("139415");
          if (stryMutAct_9fa48("139418") ? result.rows.length !== NUM.ZERO : stryMutAct_9fa48("139417") ? false : stryMutAct_9fa48("139416") ? true : (stryCov_9fa48("139416", "139417", "139418"), result.rows.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("139419")) {
              {}
            } else {
              stryCov_9fa48("139419");
              return null;
            }
          }
          const operations = result.rows.map(stryMutAct_9fa48("139420") ? () => undefined : (stryCov_9fa48("139420"), row => this.rowToOperation(row)));
          return stryMutAct_9fa48("139423") ? operations.find(operation => {
            return !this.isOperationTerminal(operation) && operationMatchesMoveIntent(operation, move, entityType, entityId);
          }) && null : stryMutAct_9fa48("139422") ? false : stryMutAct_9fa48("139421") ? true : (stryCov_9fa48("139421", "139422", "139423"), operations.find(operation => {
            if (stryMutAct_9fa48("139424")) {
              {}
            } else {
              stryCov_9fa48("139424");
              return stryMutAct_9fa48("139427") ? !this.isOperationTerminal(operation) || operationMatchesMoveIntent(operation, move, entityType, entityId) : stryMutAct_9fa48("139426") ? false : stryMutAct_9fa48("139425") ? true : (stryCov_9fa48("139425", "139426", "139427"), (stryMutAct_9fa48("139428") ? this.isOperationTerminal(operation) : (stryCov_9fa48("139428"), !this.isOperationTerminal(operation))) && operationMatchesMoveIntent(operation, move, entityType, entityId));
            }
          }) || null);
        }
      }
      if (stryMutAct_9fa48("139431") ? false : stryMutAct_9fa48("139430") ? true : stryMutAct_9fa48("139429") ? allowCacheFallbackOnReadFailure : (stryCov_9fa48("139429", "139430", "139431"), !allowCacheFallbackOnReadFailure)) {
        if (stryMutAct_9fa48("139432")) {
          {}
        } else {
          stryCov_9fa48("139432");
          return null;
        }
      } // Fallback path for degraded SQL-read conditions.
      const cachedRows = this.filterReplicaOperationRowsFromCache(row => {
        if (stryMutAct_9fa48("139433")) {
          {}
        } else {
          stryCov_9fa48("139433");
          if (stryMutAct_9fa48("139436") ? (!row || row.partition_id !== partitionId) && row.target_node_id !== targetNodeId : stryMutAct_9fa48("139435") ? false : stryMutAct_9fa48("139434") ? true : (stryCov_9fa48("139434", "139435", "139436"), (stryMutAct_9fa48("139438") ? !row && row.partition_id !== partitionId : stryMutAct_9fa48("139437") ? false : (stryCov_9fa48("139437", "139438"), (stryMutAct_9fa48("139439") ? row : (stryCov_9fa48("139439"), !row)) || (stryMutAct_9fa48("139441") ? row.partition_id === partitionId : stryMutAct_9fa48("139440") ? false : (stryCov_9fa48("139440", "139441"), row.partition_id !== partitionId)))) || (stryMutAct_9fa48("139443") ? row.target_node_id === targetNodeId : stryMutAct_9fa48("139442") ? false : (stryCov_9fa48("139442", "139443"), row.target_node_id !== targetNodeId)))) {
            if (stryMutAct_9fa48("139444")) {
              {}
            } else {
              stryCov_9fa48("139444");
              return stryMutAct_9fa48("139445") ? true : (stryCov_9fa48("139445"), false);
            }
          }
          return stryMutAct_9fa48("139448") ? (row.entity_type === entityType && row.entity_id === entityId || row.entity_type === null || row.entity_type === undefined) && row.entity_type === '' : stryMutAct_9fa48("139447") ? false : stryMutAct_9fa48("139446") ? true : (stryCov_9fa48("139446", "139447", "139448"), (stryMutAct_9fa48("139450") ? (row.entity_type === entityType && row.entity_id === entityId || row.entity_type === null) && row.entity_type === undefined : stryMutAct_9fa48("139449") ? false : (stryCov_9fa48("139449", "139450"), (stryMutAct_9fa48("139452") ? row.entity_type === entityType && row.entity_id === entityId && row.entity_type === null : stryMutAct_9fa48("139451") ? false : (stryCov_9fa48("139451", "139452"), (stryMutAct_9fa48("139454") ? row.entity_type === entityType || row.entity_id === entityId : stryMutAct_9fa48("139453") ? false : (stryCov_9fa48("139453", "139454"), (stryMutAct_9fa48("139456") ? row.entity_type !== entityType : stryMutAct_9fa48("139455") ? true : (stryCov_9fa48("139455", "139456"), row.entity_type === entityType)) && (stryMutAct_9fa48("139458") ? row.entity_id !== entityId : stryMutAct_9fa48("139457") ? true : (stryCov_9fa48("139457", "139458"), row.entity_id === entityId)))) || (stryMutAct_9fa48("139460") ? row.entity_type !== null : stryMutAct_9fa48("139459") ? false : (stryCov_9fa48("139459", "139460"), row.entity_type === null)))) || (stryMutAct_9fa48("139462") ? row.entity_type !== undefined : stryMutAct_9fa48("139461") ? false : (stryCov_9fa48("139461", "139462"), row.entity_type === undefined)))) || (stryMutAct_9fa48("139464") ? row.entity_type !== '' : stryMutAct_9fa48("139463") ? false : (stryCov_9fa48("139463", "139464"), row.entity_type === (stryMutAct_9fa48("139465") ? "Stryker was here!" : (stryCov_9fa48("139465"), '')))));
        }
      });
      if (stryMutAct_9fa48("139468") ? cachedRows !== null : stryMutAct_9fa48("139467") ? false : stryMutAct_9fa48("139466") ? true : (stryCov_9fa48("139466", "139467", "139468"), cachedRows === null)) {
        if (stryMutAct_9fa48("139469")) {
          {}
        } else {
          stryCov_9fa48("139469");
          return null;
        }
      }
      const cachedOperations = cachedRows.map(stryMutAct_9fa48("139470") ? () => undefined : (stryCov_9fa48("139470"), row => this.rowToOperation(row)));
      return stryMutAct_9fa48("139473") ? cachedOperations.find(operation => {
        return !this.isOperationTerminal(operation) && operationMatchesMoveIntent(operation, move, entityType, entityId);
      }) && null : stryMutAct_9fa48("139472") ? false : stryMutAct_9fa48("139471") ? true : (stryCov_9fa48("139471", "139472", "139473"), cachedOperations.find(operation => {
        if (stryMutAct_9fa48("139474")) {
          {}
        } else {
          stryCov_9fa48("139474");
          return stryMutAct_9fa48("139477") ? !this.isOperationTerminal(operation) || operationMatchesMoveIntent(operation, move, entityType, entityId) : stryMutAct_9fa48("139476") ? false : stryMutAct_9fa48("139475") ? true : (stryCov_9fa48("139475", "139476", "139477"), (stryMutAct_9fa48("139478") ? this.isOperationTerminal(operation) : (stryCov_9fa48("139478"), !this.isOperationTerminal(operation))) && operationMatchesMoveIntent(operation, move, entityType, entityId));
        }
      }) || null);
    }
  } /**
    * Get in-flight replica IDs for an entity.
    * @param {object} params
    * @param {string} params.partitionId
    * @param {string} params.entityType
    * @param {string} params.entityId
    * @return {Promise<Set<string>>}
    */
  async getEntityInFlightReplicaIds({
    partitionId,
    entityType,
    entityId
  }) {
    if (stryMutAct_9fa48("139479")) {
      {}
    } else {
      stryCov_9fa48("139479");
      const replicaIds = new Set();
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATIONS_BY_ENTITY, stryMutAct_9fa48("139480") ? [] : (stryCov_9fa48("139480"), [entityType, entityId, entityId]));
      if (stryMutAct_9fa48("139483") ? result.success || Array.isArray(result.rows) : stryMutAct_9fa48("139482") ? false : stryMutAct_9fa48("139481") ? true : (stryCov_9fa48("139481", "139482", "139483"), result.success && Array.isArray(result.rows))) {
        if (stryMutAct_9fa48("139484")) {
          {}
        } else {
          stryCov_9fa48("139484");
          for (const row of result.rows) {
            if (stryMutAct_9fa48("139485")) {
              {}
            } else {
              stryCov_9fa48("139485");
              const operation = this.rowToOperation(row);
              if (stryMutAct_9fa48("139488") ? !operation && this.isOperationTerminal(operation) : stryMutAct_9fa48("139487") ? false : stryMutAct_9fa48("139486") ? true : (stryCov_9fa48("139486", "139487", "139488"), (stryMutAct_9fa48("139489") ? operation : (stryCov_9fa48("139489"), !operation)) || this.isOperationTerminal(operation))) {
                if (stryMutAct_9fa48("139490")) {
                  {}
                } else {
                  stryCov_9fa48("139490");
                  continue;
                }
              }
              const replicaId = operation.replicaId;
              if (stryMutAct_9fa48("139493") ? typeof replicaId === TYPEOF.STRING || replicaId.length > NUM.ZERO : stryMutAct_9fa48("139492") ? false : stryMutAct_9fa48("139491") ? true : (stryCov_9fa48("139491", "139492", "139493"), (stryMutAct_9fa48("139495") ? typeof replicaId !== TYPEOF.STRING : stryMutAct_9fa48("139494") ? true : (stryCov_9fa48("139494", "139495"), typeof replicaId === TYPEOF.STRING)) && (stryMutAct_9fa48("139498") ? replicaId.length <= NUM.ZERO : stryMutAct_9fa48("139497") ? replicaId.length >= NUM.ZERO : stryMutAct_9fa48("139496") ? true : (stryCov_9fa48("139496", "139497", "139498"), replicaId.length > NUM.ZERO)))) {
                if (stryMutAct_9fa48("139499")) {
                  {}
                } else {
                  stryCov_9fa48("139499");
                  replicaIds.add(replicaId);
                }
              }
            }
          }
          return replicaIds;
        }
      } // Fallback path for degraded SQL-read conditions.
      const cachedRows = this.filterReplicaOperationRowsFromCache(row => {
        if (stryMutAct_9fa48("139500")) {
          {}
        } else {
          stryCov_9fa48("139500");
          if (stryMutAct_9fa48("139503") ? false : stryMutAct_9fa48("139502") ? true : stryMutAct_9fa48("139501") ? row : (stryCov_9fa48("139501", "139502", "139503"), !row)) {
            if (stryMutAct_9fa48("139504")) {
              {}
            } else {
              stryCov_9fa48("139504");
              return stryMutAct_9fa48("139505") ? true : (stryCov_9fa48("139505"), false);
            }
          }
          return stryMutAct_9fa48("139508") ? row.entity_type === entityType && row.entity_id === entityId && (row.entity_type === null || row.entity_type === undefined || row.entity_type === '') && row.partition_id === partitionId : stryMutAct_9fa48("139507") ? false : stryMutAct_9fa48("139506") ? true : (stryCov_9fa48("139506", "139507", "139508"), (stryMutAct_9fa48("139510") ? row.entity_type === entityType || row.entity_id === entityId : stryMutAct_9fa48("139509") ? false : (stryCov_9fa48("139509", "139510"), (stryMutAct_9fa48("139512") ? row.entity_type !== entityType : stryMutAct_9fa48("139511") ? true : (stryCov_9fa48("139511", "139512"), row.entity_type === entityType)) && (stryMutAct_9fa48("139514") ? row.entity_id !== entityId : stryMutAct_9fa48("139513") ? true : (stryCov_9fa48("139513", "139514"), row.entity_id === entityId)))) || (stryMutAct_9fa48("139516") ? row.entity_type === null || row.entity_type === undefined || row.entity_type === '' || row.partition_id === partitionId : stryMutAct_9fa48("139515") ? false : (stryCov_9fa48("139515", "139516"), (stryMutAct_9fa48("139518") ? (row.entity_type === null || row.entity_type === undefined) && row.entity_type === '' : stryMutAct_9fa48("139517") ? true : (stryCov_9fa48("139517", "139518"), (stryMutAct_9fa48("139520") ? row.entity_type === null && row.entity_type === undefined : stryMutAct_9fa48("139519") ? false : (stryCov_9fa48("139519", "139520"), (stryMutAct_9fa48("139522") ? row.entity_type !== null : stryMutAct_9fa48("139521") ? false : (stryCov_9fa48("139521", "139522"), row.entity_type === null)) || (stryMutAct_9fa48("139524") ? row.entity_type !== undefined : stryMutAct_9fa48("139523") ? false : (stryCov_9fa48("139523", "139524"), row.entity_type === undefined)))) || (stryMutAct_9fa48("139526") ? row.entity_type !== '' : stryMutAct_9fa48("139525") ? false : (stryCov_9fa48("139525", "139526"), row.entity_type === (stryMutAct_9fa48("139527") ? "Stryker was here!" : (stryCov_9fa48("139527"), '')))))) && (stryMutAct_9fa48("139529") ? row.partition_id !== partitionId : stryMutAct_9fa48("139528") ? true : (stryCov_9fa48("139528", "139529"), row.partition_id === partitionId)))));
        }
      });
      if (stryMutAct_9fa48("139532") ? cachedRows !== null : stryMutAct_9fa48("139531") ? false : stryMutAct_9fa48("139530") ? true : (stryCov_9fa48("139530", "139531", "139532"), cachedRows === null)) {
        if (stryMutAct_9fa48("139533")) {
          {}
        } else {
          stryCov_9fa48("139533");
          return replicaIds;
        }
      }
      for (const row of cachedRows) {
        if (stryMutAct_9fa48("139534")) {
          {}
        } else {
          stryCov_9fa48("139534");
          const operation = this.rowToOperation(row);
          if (stryMutAct_9fa48("139537") ? !operation && this.isOperationTerminal(operation) : stryMutAct_9fa48("139536") ? false : stryMutAct_9fa48("139535") ? true : (stryCov_9fa48("139535", "139536", "139537"), (stryMutAct_9fa48("139538") ? operation : (stryCov_9fa48("139538"), !operation)) || this.isOperationTerminal(operation))) {
            if (stryMutAct_9fa48("139539")) {
              {}
            } else {
              stryCov_9fa48("139539");
              continue;
            }
          }
          const replicaId = operation.replicaId;
          if (stryMutAct_9fa48("139542") ? typeof replicaId === TYPEOF.STRING || replicaId.length > NUM.ZERO : stryMutAct_9fa48("139541") ? false : stryMutAct_9fa48("139540") ? true : (stryCov_9fa48("139540", "139541", "139542"), (stryMutAct_9fa48("139544") ? typeof replicaId !== TYPEOF.STRING : stryMutAct_9fa48("139543") ? true : (stryCov_9fa48("139543", "139544"), typeof replicaId === TYPEOF.STRING)) && (stryMutAct_9fa48("139547") ? replicaId.length <= NUM.ZERO : stryMutAct_9fa48("139546") ? replicaId.length >= NUM.ZERO : stryMutAct_9fa48("139545") ? true : (stryCov_9fa48("139545", "139546", "139547"), replicaId.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("139548")) {
              {}
            } else {
              stryCov_9fa48("139548");
              replicaIds.add(replicaId);
            }
          }
        }
      }
      return replicaIds;
    }
  } /**
    * Get all operations (cache-first, SQL fallback).
    * @return {Promise<Array>}
    */
  async getAllOperations() {
    if (stryMutAct_9fa48("139549")) {
      {}
    } else {
      stryCov_9fa48("139549");
      const cachedRows = this.filterReplicaOperationRowsFromCache(stryMutAct_9fa48("139550") ? () => undefined : (stryCov_9fa48("139550"), () => stryMutAct_9fa48("139551") ? false : (stryCov_9fa48("139551"), true)));
      if (stryMutAct_9fa48("139554") ? cachedRows === null : stryMutAct_9fa48("139553") ? false : stryMutAct_9fa48("139552") ? true : (stryCov_9fa48("139552", "139553", "139554"), cachedRows !== null)) {
        if (stryMutAct_9fa48("139555")) {
          {}
        } else {
          stryCov_9fa48("139555");
          return stryMutAct_9fa48("139556") ? [...cachedRows].map(row => this.rowToOperation(row)) : (stryCov_9fa48("139556"), (stryMutAct_9fa48("139557") ? [] : (stryCov_9fa48("139557"), [...cachedRows])).sort((left, right) => {
            if (stryMutAct_9fa48("139558")) {
              {}
            } else {
              stryCov_9fa48("139558");
              const leftCreatedAt = stryMutAct_9fa48("139561") ? Number(left?.created_at) && NUM.ZERO : stryMutAct_9fa48("139560") ? false : stryMutAct_9fa48("139559") ? true : (stryCov_9fa48("139559", "139560", "139561"), Number(stryMutAct_9fa48("139562") ? left.created_at : (stryCov_9fa48("139562"), left?.created_at)) || NUM.ZERO);
              const rightCreatedAt = stryMutAct_9fa48("139565") ? Number(right?.created_at) && NUM.ZERO : stryMutAct_9fa48("139564") ? false : stryMutAct_9fa48("139563") ? true : (stryCov_9fa48("139563", "139564", "139565"), Number(stryMutAct_9fa48("139566") ? right.created_at : (stryCov_9fa48("139566"), right?.created_at)) || NUM.ZERO);
              if (stryMutAct_9fa48("139569") ? leftCreatedAt === rightCreatedAt : stryMutAct_9fa48("139568") ? false : stryMutAct_9fa48("139567") ? true : (stryCov_9fa48("139567", "139568", "139569"), leftCreatedAt !== rightCreatedAt)) {
                if (stryMutAct_9fa48("139570")) {
                  {}
                } else {
                  stryCov_9fa48("139570");
                  return stryMutAct_9fa48("139571") ? rightCreatedAt + leftCreatedAt : (stryCov_9fa48("139571"), rightCreatedAt - leftCreatedAt);
                }
              }
              return String(stryMutAct_9fa48("139574") ? right?.operation_id && REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE : stryMutAct_9fa48("139573") ? false : stryMutAct_9fa48("139572") ? true : (stryCov_9fa48("139572", "139573", "139574"), (stryMutAct_9fa48("139575") ? right.operation_id : (stryCov_9fa48("139575"), right?.operation_id)) || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE)).localeCompare(String(stryMutAct_9fa48("139578") ? left?.operation_id && REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE : stryMutAct_9fa48("139577") ? false : stryMutAct_9fa48("139576") ? true : (stryCov_9fa48("139576", "139577", "139578"), (stryMutAct_9fa48("139579") ? left.operation_id : (stryCov_9fa48("139579"), left?.operation_id)) || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE)));
            }
          }).map(stryMutAct_9fa48("139580") ? () => undefined : (stryCov_9fa48("139580"), row => this.rowToOperation(row))));
        }
      }
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_ALL_OPERATIONS, stryMutAct_9fa48("139581") ? ["Stryker was here"] : (stryCov_9fa48("139581"), []));
      if (stryMutAct_9fa48("139584") ? !result.success && !result.rows : stryMutAct_9fa48("139583") ? false : stryMutAct_9fa48("139582") ? true : (stryCov_9fa48("139582", "139583", "139584"), (stryMutAct_9fa48("139585") ? result.success : (stryCov_9fa48("139585"), !result.success)) || (stryMutAct_9fa48("139586") ? result.rows : (stryCov_9fa48("139586"), !result.rows)))) {
        if (stryMutAct_9fa48("139587")) {
          {}
        } else {
          stryCov_9fa48("139587");
          return stryMutAct_9fa48("139588") ? ["Stryker was here"] : (stryCov_9fa48("139588"), []);
        }
      }
      return result.rows.map(stryMutAct_9fa48("139589") ? () => undefined : (stryCov_9fa48("139589"), row => this.rowToOperation(row)));
    }
  } /**
    * Get operations for an entity (cache-first, SQL fallback).
    * @param {string} entityType
    * @param {string} entityId
    * @return {Promise<Array>}
    */
  async getOperationsByEntity(entityType, entityId) {
    if (stryMutAct_9fa48("139590")) {
      {}
    } else {
      stryCov_9fa48("139590");
      const cachedRows = this.filterReplicaOperationRowsFromCache(row => {
        if (stryMutAct_9fa48("139591")) {
          {}
        } else {
          stryCov_9fa48("139591");
          if (stryMutAct_9fa48("139594") ? false : stryMutAct_9fa48("139593") ? true : stryMutAct_9fa48("139592") ? row : (stryCov_9fa48("139592", "139593", "139594"), !row)) {
            if (stryMutAct_9fa48("139595")) {
              {}
            } else {
              stryCov_9fa48("139595");
              return stryMutAct_9fa48("139596") ? true : (stryCov_9fa48("139596"), false);
            }
          }
          return stryMutAct_9fa48("139599") ? row.entity_type === entityType && row.entity_id === entityId && (row.entity_type === null || row.entity_type === undefined || row.entity_type === '') && row.partition_id === entityId : stryMutAct_9fa48("139598") ? false : stryMutAct_9fa48("139597") ? true : (stryCov_9fa48("139597", "139598", "139599"), (stryMutAct_9fa48("139601") ? row.entity_type === entityType || row.entity_id === entityId : stryMutAct_9fa48("139600") ? false : (stryCov_9fa48("139600", "139601"), (stryMutAct_9fa48("139603") ? row.entity_type !== entityType : stryMutAct_9fa48("139602") ? true : (stryCov_9fa48("139602", "139603"), row.entity_type === entityType)) && (stryMutAct_9fa48("139605") ? row.entity_id !== entityId : stryMutAct_9fa48("139604") ? true : (stryCov_9fa48("139604", "139605"), row.entity_id === entityId)))) || (stryMutAct_9fa48("139607") ? row.entity_type === null || row.entity_type === undefined || row.entity_type === '' || row.partition_id === entityId : stryMutAct_9fa48("139606") ? false : (stryCov_9fa48("139606", "139607"), (stryMutAct_9fa48("139609") ? (row.entity_type === null || row.entity_type === undefined) && row.entity_type === '' : stryMutAct_9fa48("139608") ? true : (stryCov_9fa48("139608", "139609"), (stryMutAct_9fa48("139611") ? row.entity_type === null && row.entity_type === undefined : stryMutAct_9fa48("139610") ? false : (stryCov_9fa48("139610", "139611"), (stryMutAct_9fa48("139613") ? row.entity_type !== null : stryMutAct_9fa48("139612") ? false : (stryCov_9fa48("139612", "139613"), row.entity_type === null)) || (stryMutAct_9fa48("139615") ? row.entity_type !== undefined : stryMutAct_9fa48("139614") ? false : (stryCov_9fa48("139614", "139615"), row.entity_type === undefined)))) || (stryMutAct_9fa48("139617") ? row.entity_type !== '' : stryMutAct_9fa48("139616") ? false : (stryCov_9fa48("139616", "139617"), row.entity_type === (stryMutAct_9fa48("139618") ? "Stryker was here!" : (stryCov_9fa48("139618"), '')))))) && (stryMutAct_9fa48("139620") ? row.partition_id !== entityId : stryMutAct_9fa48("139619") ? true : (stryCov_9fa48("139619", "139620"), row.partition_id === entityId)))));
        }
      });
      if (stryMutAct_9fa48("139623") ? cachedRows === null : stryMutAct_9fa48("139622") ? false : stryMutAct_9fa48("139621") ? true : (stryCov_9fa48("139621", "139622", "139623"), cachedRows !== null)) {
        if (stryMutAct_9fa48("139624")) {
          {}
        } else {
          stryCov_9fa48("139624");
          return cachedRows.map(stryMutAct_9fa48("139625") ? () => undefined : (stryCov_9fa48("139625"), row => this.rowToOperation(row)));
        }
      }
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATIONS_BY_ENTITY, stryMutAct_9fa48("139626") ? [] : (stryCov_9fa48("139626"), [entityType, entityId, entityId]));
      if (stryMutAct_9fa48("139629") ? !result.success && !result.rows : stryMutAct_9fa48("139628") ? false : stryMutAct_9fa48("139627") ? true : (stryCov_9fa48("139627", "139628", "139629"), (stryMutAct_9fa48("139630") ? result.success : (stryCov_9fa48("139630"), !result.success)) || (stryMutAct_9fa48("139631") ? result.rows : (stryCov_9fa48("139631"), !result.rows)))) {
        if (stryMutAct_9fa48("139632")) {
          {}
        } else {
          stryCov_9fa48("139632");
          return stryMutAct_9fa48("139633") ? ["Stryker was here"] : (stryCov_9fa48("139633"), []);
        }
      }
      return result.rows.map(stryMutAct_9fa48("139634") ? () => undefined : (stryCov_9fa48("139634"), row => this.rowToOperation(row)));
    }
  } /**
    * Get operations for an entity from the authoritative replica_operations
    * owner path without consulting the cache projection first.
    * @param {string} entityType
    * @param {string} entityId
    * @return {Promise<Array>}
    */
  async getOperationsByEntityAuthoritative(entityType, entityId) {
    if (stryMutAct_9fa48("139635")) {
      {}
    } else {
      stryCov_9fa48("139635");
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATIONS_BY_ENTITY, stryMutAct_9fa48("139636") ? [] : (stryCov_9fa48("139636"), [entityType, entityId, entityId]));
      if (stryMutAct_9fa48("139639") ? !result.success && !result.rows : stryMutAct_9fa48("139638") ? false : stryMutAct_9fa48("139637") ? true : (stryCov_9fa48("139637", "139638", "139639"), (stryMutAct_9fa48("139640") ? result.success : (stryCov_9fa48("139640"), !result.success)) || (stryMutAct_9fa48("139641") ? result.rows : (stryCov_9fa48("139641"), !result.rows)))) {
        if (stryMutAct_9fa48("139642")) {
          {}
        } else {
          stryCov_9fa48("139642");
          return stryMutAct_9fa48("139643") ? ["Stryker was here"] : (stryCov_9fa48("139643"), []);
        }
      }
      return result.rows.map(stryMutAct_9fa48("139644") ? () => undefined : (stryCov_9fa48("139644"), row => this.rowToOperation(row)));
    }
  } /**
    * Get count of non-terminal REMOVE operations.
    * @param {object} [options={}]
    * @return {Promise<number>}
    */
  async getConcurrentRemoveCount(options = {}) {
    if (stryMutAct_9fa48("139645")) {
      {}
    } else {
      stryCov_9fa48("139645");
      const preferAuthoritativeRead = stryMutAct_9fa48("139648") ? options.preferAuthoritativeRead !== true : stryMutAct_9fa48("139647") ? false : stryMutAct_9fa48("139646") ? true : (stryCov_9fa48("139646", "139647", "139648"), options.preferAuthoritativeRead === (stryMutAct_9fa48("139649") ? false : (stryCov_9fa48("139649"), true)));
      if (stryMutAct_9fa48("139652") ? false : stryMutAct_9fa48("139651") ? true : stryMutAct_9fa48("139650") ? preferAuthoritativeRead : (stryCov_9fa48("139650", "139651", "139652"), !preferAuthoritativeRead)) {
        if (stryMutAct_9fa48("139653")) {
          {}
        } else {
          stryCov_9fa48("139653");
          const cachedCount = stryMutAct_9fa48("139654") ? this.queryCachedIncompleteOperations().length : (stryCov_9fa48("139654"), this.queryCachedIncompleteOperations().filter(stryMutAct_9fa48("139655") ? () => undefined : (stryCov_9fa48("139655"), operation => stryMutAct_9fa48("139658") ? operation?.type !== OperationType.REMOVE : stryMutAct_9fa48("139657") ? false : stryMutAct_9fa48("139656") ? true : (stryCov_9fa48("139656", "139657", "139658"), (stryMutAct_9fa48("139659") ? operation.type : (stryCov_9fa48("139659"), operation?.type)) === OperationType.REMOVE))).length);
          if (stryMutAct_9fa48("139662") ? cachedCount > NUM.ZERO && options.skipSqlFallbackWhenCacheEmpty === true : stryMutAct_9fa48("139661") ? false : stryMutAct_9fa48("139660") ? true : (stryCov_9fa48("139660", "139661", "139662"), (stryMutAct_9fa48("139665") ? cachedCount <= NUM.ZERO : stryMutAct_9fa48("139664") ? cachedCount >= NUM.ZERO : stryMutAct_9fa48("139663") ? false : (stryCov_9fa48("139663", "139664", "139665"), cachedCount > NUM.ZERO)) || (stryMutAct_9fa48("139667") ? options.skipSqlFallbackWhenCacheEmpty !== true : stryMutAct_9fa48("139666") ? false : (stryCov_9fa48("139666", "139667"), options.skipSqlFallbackWhenCacheEmpty === (stryMutAct_9fa48("139668") ? false : (stryCov_9fa48("139668"), true)))))) {
            if (stryMutAct_9fa48("139669")) {
              {}
            } else {
              stryCov_9fa48("139669");
              return cachedCount;
            }
          }
        }
      }
      const result = await this.executeReplicaOperationsRead(SQL.SELECT_IN_FLIGHT_BY_TYPE, stryMutAct_9fa48("139670") ? [] : (stryCov_9fa48("139670"), [OperationType.REMOVE]));
      if (stryMutAct_9fa48("139673") ? !result.success && !result.rows : stryMutAct_9fa48("139672") ? false : stryMutAct_9fa48("139671") ? true : (stryCov_9fa48("139671", "139672", "139673"), (stryMutAct_9fa48("139674") ? result.success : (stryCov_9fa48("139674"), !result.success)) || (stryMutAct_9fa48("139675") ? result.rows : (stryCov_9fa48("139675"), !result.rows)))) {
        if (stryMutAct_9fa48("139676")) {
          {}
        } else {
          stryCov_9fa48("139676");
          return NUM.ZERO;
        }
      }
      return stryMutAct_9fa48("139677") ? result.rows.map(row => this.rowToOperation(row)).length : (stryCov_9fa48("139677"), result.rows.map(stryMutAct_9fa48("139678") ? () => undefined : (stryCov_9fa48("139678"), row => this.rowToOperation(row))).filter(stryMutAct_9fa48("139679") ? () => undefined : (stryCov_9fa48("139679"), op => stryMutAct_9fa48("139680") ? this.isOperationTerminal(op) : (stryCov_9fa48("139680"), !this.isOperationTerminal(op)))).length);
    }
  } // ── SQL Write Methods ───────────────────────────────────────────
  /**
   * Persist a new operation row via SQL INSERT.
   * @param {object} operation
   * @return {Promise<boolean>}
   */
  async persistNewOperation(operation) {
    if (stryMutAct_9fa48("139681")) {
      {}
    } else {
      stryCov_9fa48("139681");
      return this.runReplicaOperationTransitionExclusive(async () => {
        if (stryMutAct_9fa48("139682")) {
          {}
        } else {
          stryCov_9fa48("139682");
          const result = await this.executeReplicaOperationGatewayMutationWithRetry(stryMutAct_9fa48("139683") ? {} : (stryCov_9fa48("139683"), {
            operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
            tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
            row: this.buildReplicaOperationRow(operation),
            owner: REPLICA_OPERATION_OWNER_NAME
          }), stryMutAct_9fa48("139684") ? {} : (stryCov_9fa48("139684"), {
            ownerId: operation.operationId
          }), stryMutAct_9fa48("139685") ? {} : (stryCov_9fa48("139685"), {
            sql: SQL.INSERT_OPERATION,
            params: stryMutAct_9fa48("139686") ? [] : (stryCov_9fa48("139686"), [operation.operationId, operation.type, operation.partitionId, operation.replicaId, operation.sourceNodeId, operation.targetNodeId, operation.status, operation.workflowStep, operation.createdAt, operation.updatedAt, operation.completedAt, operation.errorMessage, JSON.stringify(operation.stepsHistory), operation.entityType, operation.entityId])
          }));
          if (stryMutAct_9fa48("139689") ? false : stryMutAct_9fa48("139688") ? true : stryMutAct_9fa48("139687") ? result.success : (stryCov_9fa48("139687", "139688", "139689"), !result.success)) {
            if (stryMutAct_9fa48("139690")) {
              {}
            } else {
              stryCov_9fa48("139690");
              const persistError = this.buildOperationPersistError(result);
              this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, stryMutAct_9fa48("139691") ? {} : (stryCov_9fa48("139691"), {
                operationId: operation.operationId,
                ...buildControlPlaneFailurePayload(this.nodeId, result)
              }));
              throw persistError;
            }
          }
          await this.confirmReplicaOperationPersistence(operation);
          const changeCount = this.extractMutationChangeCount(result);
          return (stryMutAct_9fa48("139694") ? changeCount !== null : stryMutAct_9fa48("139693") ? false : stryMutAct_9fa48("139692") ? true : (stryCov_9fa48("139692", "139693", "139694"), changeCount === null)) ? stryMutAct_9fa48("139695") ? false : (stryCov_9fa48("139695"), true) : stryMutAct_9fa48("139699") ? changeCount <= NUM.ZERO : stryMutAct_9fa48("139698") ? changeCount >= NUM.ZERO : stryMutAct_9fa48("139697") ? false : stryMutAct_9fa48("139696") ? true : (stryCov_9fa48("139696", "139697", "139698", "139699"), changeCount > NUM.ZERO);
        }
      }, stryMutAct_9fa48("139700") ? {} : (stryCov_9fa48("139700"), {
        operation
      }));
    }
  } /**
    * Persist an operation update via SQL UPDATE.
    * @param {object} operation
    * @param {object} [options]
    * @param {string} [options.sessionId]
    * @param {boolean} [options.confirmPersistence]
    * @param {string} [options.expectedWorkflowStep]
    * @return {Promise<boolean>} True when a row changed or authoritative
    *   confirmation already reflects the target state.
    */
  async persistOperationUpdate(operation, options = {}) {
    if (stryMutAct_9fa48("139701")) {
      {}
    } else {
      stryCov_9fa48("139701");
      const expectedWorkflowStep = (stryMutAct_9fa48("139704") ? typeof options.expectedWorkflowStep === 'string' || options.expectedWorkflowStep.length > NUM.ZERO : stryMutAct_9fa48("139703") ? false : stryMutAct_9fa48("139702") ? true : (stryCov_9fa48("139702", "139703", "139704"), (stryMutAct_9fa48("139706") ? typeof options.expectedWorkflowStep !== 'string' : stryMutAct_9fa48("139705") ? true : (stryCov_9fa48("139705", "139706"), typeof options.expectedWorkflowStep === (stryMutAct_9fa48("139707") ? "" : (stryCov_9fa48("139707"), 'string')))) && (stryMutAct_9fa48("139710") ? options.expectedWorkflowStep.length <= NUM.ZERO : stryMutAct_9fa48("139709") ? options.expectedWorkflowStep.length >= NUM.ZERO : stryMutAct_9fa48("139708") ? true : (stryCov_9fa48("139708", "139709", "139710"), options.expectedWorkflowStep.length > NUM.ZERO)))) ? options.expectedWorkflowStep : null;
      const result = await this.executeReplicaOperationGatewayMutationWithRetry(stryMutAct_9fa48("139711") ? {} : (stryCov_9fa48("139711"), {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        whereClause: this.buildReplicaOperationUpdateWhereClause(operation, expectedWorkflowStep),
        data: this.buildReplicaOperationUpdateData(operation),
        owner: REPLICA_OPERATION_OWNER_NAME
      }), stryMutAct_9fa48("139712") ? {} : (stryCov_9fa48("139712"), {
        ownerId: operation.operationId,
        sessionId: options.sessionId,
        timeoutBudget: options.timeoutBudget,
        mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING
      }), stryMutAct_9fa48("139713") ? {} : (stryCov_9fa48("139713"), {
        sql: expectedWorkflowStep ? SQL.UPDATE_OPERATION_EXPECTING_STEP : SQL.UPDATE_OPERATION,
        params: this.buildReplicaOperationUpdateParams(operation, expectedWorkflowStep)
      }));
      if (stryMutAct_9fa48("139716") ? false : stryMutAct_9fa48("139715") ? true : stryMutAct_9fa48("139714") ? result.success : (stryCov_9fa48("139714", "139715", "139716"), !result.success)) {
        if (stryMutAct_9fa48("139717")) {
          {}
        } else {
          stryCov_9fa48("139717");
          const persistError = this.buildOperationPersistError(result);
          this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, stryMutAct_9fa48("139718") ? {} : (stryCov_9fa48("139718"), {
            operationId: operation.operationId,
            ...buildControlPlaneFailurePayload(this.nodeId, result)
          }));
          throw persistError;
        }
      }
      const changeCount = this.extractMutationChangeCount(result);
      if (stryMutAct_9fa48("139721") ? changeCount !== null || changeCount <= NUM.ZERO : stryMutAct_9fa48("139720") ? false : stryMutAct_9fa48("139719") ? true : (stryCov_9fa48("139719", "139720", "139721"), (stryMutAct_9fa48("139723") ? changeCount === null : stryMutAct_9fa48("139722") ? true : (stryCov_9fa48("139722", "139723"), changeCount !== null)) && (stryMutAct_9fa48("139726") ? changeCount > NUM.ZERO : stryMutAct_9fa48("139725") ? changeCount < NUM.ZERO : stryMutAct_9fa48("139724") ? true : (stryCov_9fa48("139724", "139725", "139726"), changeCount <= NUM.ZERO)))) {
        if (stryMutAct_9fa48("139727")) {
          {}
        } else {
          stryCov_9fa48("139727");
          if (stryMutAct_9fa48("139729") ? false : stryMutAct_9fa48("139728") ? true : (stryCov_9fa48("139728", "139729"), expectedWorkflowStep)) {
            if (stryMutAct_9fa48("139730")) {
              {}
            } else {
              stryCov_9fa48("139730");
              const authoritativeOperation = await this.queryAuthoritativeOperationById(operation.operationId, stryMutAct_9fa48("139731") ? {} : (stryCov_9fa48("139731"), {
                requireOwnerRpcRead: stryMutAct_9fa48("139732") ? true : (stryCov_9fa48("139732"), false)
              }));
              return this.isReplicaOperationVisibilitySatisfied(operation, authoritativeOperation);
            }
          }
          return stryMutAct_9fa48("139733") ? true : (stryCov_9fa48("139733"), false);
        }
      }
      if (stryMutAct_9fa48("139736") ? options.confirmPersistence !== false : stryMutAct_9fa48("139735") ? false : stryMutAct_9fa48("139734") ? true : (stryCov_9fa48("139734", "139735", "139736"), options.confirmPersistence === (stryMutAct_9fa48("139737") ? true : (stryCov_9fa48("139737"), false)))) {
        if (stryMutAct_9fa48("139738")) {
          {}
        } else {
          stryCov_9fa48("139738");
          return stryMutAct_9fa48("139739") ? false : (stryCov_9fa48("139739"), true);
        }
      }
      await this.confirmReplicaOperationPersistence(operation);
      return stryMutAct_9fa48("139740") ? false : (stryCov_9fa48("139740"), true);
    }
  } /**
    * Confirm a persisted operation through authoritative reads and diagnose
    * any cache lag as projection divergence.
    * @param {object} operation
    * @return {Promise<void>}
    */
  async confirmReplicaOperationPersistence(operation) {
    if (stryMutAct_9fa48("139741")) {
      {}
    } else {
      stryCov_9fa48("139741");
      if (stryMutAct_9fa48("139744") ? false : stryMutAct_9fa48("139743") ? true : stryMutAct_9fa48("139742") ? operation?.operationId : (stryCov_9fa48("139742", "139743", "139744"), !(stryMutAct_9fa48("139745") ? operation.operationId : (stryCov_9fa48("139745"), operation?.operationId)))) {
        if (stryMutAct_9fa48("139746")) {
          {}
        } else {
          stryCov_9fa48("139746");
          return;
        }
      }
      const authoritativeOperation = await this.confirmReplicaOperationVisibility(operation);
      if (stryMutAct_9fa48("139749") ? false : stryMutAct_9fa48("139748") ? true : stryMutAct_9fa48("139747") ? authoritativeOperation : (stryCov_9fa48("139747", "139748", "139749"), !authoritativeOperation)) {
        if (stryMutAct_9fa48("139750")) {
          {}
        } else {
          stryCov_9fa48("139750");
          throw new Error(stryMutAct_9fa48("139751") ? REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE_REPLICA_OPERATION_NOT_CONFIRMED - operation.operationId : (stryCov_9fa48("139751"), REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE_REPLICA_OPERATION_NOT_CONFIRMED + operation.operationId));
        }
      }
      this.emitReplicaOperationPersistenceDivergence(authoritativeOperation);
    }
  } /**
    * Confirm replica operation visibility through bounded authoritative reads.
    * Cache propagation is eventually consistent under sustained control-plane
    * load, so one missed cache observation must not be treated as a hard loss
    * when the owner-local authoritative row is still progressing.
    * @param {object} operation
    * @return {Promise<object|null>}
    * @private
    */
  async confirmReplicaOperationVisibility(operation) {
    if (stryMutAct_9fa48("139752")) {
      {}
    } else {
      stryCov_9fa48("139752");
      const deadlineMs = stryMutAct_9fa48("139753") ? Date.now() - this.replicaOperationAuthoritativeVisibilityTimeoutMs : (stryCov_9fa48("139753"), Date.now() + this.replicaOperationAuthoritativeVisibilityTimeoutMs);
      while (stryMutAct_9fa48("139755") ? false : stryMutAct_9fa48("139754") ? false : (stryCov_9fa48("139754", "139755"), true)) {
        if (stryMutAct_9fa48("139756")) {
          {}
        } else {
          stryCov_9fa48("139756");
          const observedOperation = await this.queryAuthoritativeOperationById(operation.operationId);
          if (stryMutAct_9fa48("139758") ? false : stryMutAct_9fa48("139757") ? true : (stryCov_9fa48("139757", "139758"), this.isReplicaOperationVisibilitySatisfied(operation, observedOperation))) {
            if (stryMutAct_9fa48("139759")) {
              {}
            } else {
              stryCov_9fa48("139759");
              return observedOperation;
            }
          }
          if (stryMutAct_9fa48("139763") ? Date.now() < deadlineMs : stryMutAct_9fa48("139762") ? Date.now() > deadlineMs : stryMutAct_9fa48("139761") ? false : stryMutAct_9fa48("139760") ? true : (stryCov_9fa48("139760", "139761", "139762", "139763"), Date.now() >= deadlineMs)) {
            if (stryMutAct_9fa48("139764")) {
              {}
            } else {
              stryCov_9fa48("139764");
              return null;
            }
          }
          await this.waitForReplicaOperationVisibilityRetry(this.replicaOperationAuthoritativeVisibilityRetryDelayMs);
        }
      }
    }
  } /**
    * @param {object} expectedOperation
    * @param {object|null} observedOperation
    * @return {boolean}
    * @private
    */
  isReplicaOperationVisibilitySatisfied(expectedOperation, observedOperation) {
    if (stryMutAct_9fa48("139765")) {
      {}
    } else {
      stryCov_9fa48("139765");
      if (stryMutAct_9fa48("139768") ? !observedOperation && observedOperation.operationId !== expectedOperation.operationId : stryMutAct_9fa48("139767") ? false : stryMutAct_9fa48("139766") ? true : (stryCov_9fa48("139766", "139767", "139768"), (stryMutAct_9fa48("139769") ? observedOperation : (stryCov_9fa48("139769"), !observedOperation)) || (stryMutAct_9fa48("139771") ? observedOperation.operationId === expectedOperation.operationId : stryMutAct_9fa48("139770") ? false : (stryCov_9fa48("139770", "139771"), observedOperation.operationId !== expectedOperation.operationId)))) {
        if (stryMutAct_9fa48("139772")) {
          {}
        } else {
          stryCov_9fa48("139772");
          return stryMutAct_9fa48("139773") ? true : (stryCov_9fa48("139773"), false);
        }
      }
      if (stryMutAct_9fa48("139776") ? expectedOperation.replicaId !== null && expectedOperation.replicaId !== undefined || observedOperation.replicaId !== expectedOperation.replicaId : stryMutAct_9fa48("139775") ? false : stryMutAct_9fa48("139774") ? true : (stryCov_9fa48("139774", "139775", "139776"), (stryMutAct_9fa48("139778") ? expectedOperation.replicaId !== null || expectedOperation.replicaId !== undefined : stryMutAct_9fa48("139777") ? true : (stryCov_9fa48("139777", "139778"), (stryMutAct_9fa48("139780") ? expectedOperation.replicaId === null : stryMutAct_9fa48("139779") ? true : (stryCov_9fa48("139779", "139780"), expectedOperation.replicaId !== null)) && (stryMutAct_9fa48("139782") ? expectedOperation.replicaId === undefined : stryMutAct_9fa48("139781") ? true : (stryCov_9fa48("139781", "139782"), expectedOperation.replicaId !== undefined)))) && (stryMutAct_9fa48("139784") ? observedOperation.replicaId === expectedOperation.replicaId : stryMutAct_9fa48("139783") ? true : (stryCov_9fa48("139783", "139784"), observedOperation.replicaId !== expectedOperation.replicaId)))) {
        if (stryMutAct_9fa48("139785")) {
          {}
        } else {
          stryCov_9fa48("139785");
          return stryMutAct_9fa48("139786") ? true : (stryCov_9fa48("139786"), false);
        }
      }
      if (stryMutAct_9fa48("139789") ? expectedOperation.workflowStep !== null && expectedOperation.workflowStep !== undefined || observedOperation.workflowStep !== expectedOperation.workflowStep : stryMutAct_9fa48("139788") ? false : stryMutAct_9fa48("139787") ? true : (stryCov_9fa48("139787", "139788", "139789"), (stryMutAct_9fa48("139791") ? expectedOperation.workflowStep !== null || expectedOperation.workflowStep !== undefined : stryMutAct_9fa48("139790") ? true : (stryCov_9fa48("139790", "139791"), (stryMutAct_9fa48("139793") ? expectedOperation.workflowStep === null : stryMutAct_9fa48("139792") ? true : (stryCov_9fa48("139792", "139793"), expectedOperation.workflowStep !== null)) && (stryMutAct_9fa48("139795") ? expectedOperation.workflowStep === undefined : stryMutAct_9fa48("139794") ? true : (stryCov_9fa48("139794", "139795"), expectedOperation.workflowStep !== undefined)))) && (stryMutAct_9fa48("139797") ? observedOperation.workflowStep === expectedOperation.workflowStep : stryMutAct_9fa48("139796") ? true : (stryCov_9fa48("139796", "139797"), observedOperation.workflowStep !== expectedOperation.workflowStep)))) {
        if (stryMutAct_9fa48("139798")) {
          {}
        } else {
          stryCov_9fa48("139798");
          return stryMutAct_9fa48("139799") ? true : (stryCov_9fa48("139799"), false);
        }
      }
      if (stryMutAct_9fa48("139802") ? expectedOperation.status !== null && expectedOperation.status !== undefined || observedOperation.status !== expectedOperation.status : stryMutAct_9fa48("139801") ? false : stryMutAct_9fa48("139800") ? true : (stryCov_9fa48("139800", "139801", "139802"), (stryMutAct_9fa48("139804") ? expectedOperation.status !== null || expectedOperation.status !== undefined : stryMutAct_9fa48("139803") ? true : (stryCov_9fa48("139803", "139804"), (stryMutAct_9fa48("139806") ? expectedOperation.status === null : stryMutAct_9fa48("139805") ? true : (stryCov_9fa48("139805", "139806"), expectedOperation.status !== null)) && (stryMutAct_9fa48("139808") ? expectedOperation.status === undefined : stryMutAct_9fa48("139807") ? true : (stryCov_9fa48("139807", "139808"), expectedOperation.status !== undefined)))) && (stryMutAct_9fa48("139810") ? observedOperation.status === expectedOperation.status : stryMutAct_9fa48("139809") ? true : (stryCov_9fa48("139809", "139810"), observedOperation.status !== expectedOperation.status)))) {
        if (stryMutAct_9fa48("139811")) {
          {}
        } else {
          stryCov_9fa48("139811");
          return stryMutAct_9fa48("139812") ? true : (stryCov_9fa48("139812"), false);
        }
      }
      if (stryMutAct_9fa48("139815") ? Number.isFinite(expectedOperation.updatedAt) || Number(observedOperation.updatedAt) < expectedOperation.updatedAt : stryMutAct_9fa48("139814") ? false : stryMutAct_9fa48("139813") ? true : (stryCov_9fa48("139813", "139814", "139815"), Number.isFinite(expectedOperation.updatedAt) && (stryMutAct_9fa48("139818") ? Number(observedOperation.updatedAt) >= expectedOperation.updatedAt : stryMutAct_9fa48("139817") ? Number(observedOperation.updatedAt) <= expectedOperation.updatedAt : stryMutAct_9fa48("139816") ? true : (stryCov_9fa48("139816", "139817", "139818"), Number(observedOperation.updatedAt) < expectedOperation.updatedAt)))) {
        if (stryMutAct_9fa48("139819")) {
          {}
        } else {
          stryCov_9fa48("139819");
          return stryMutAct_9fa48("139820") ? true : (stryCov_9fa48("139820"), false);
        }
      }
      if (stryMutAct_9fa48("139823") ? Number.isFinite(expectedOperation.completedAt) || Number(observedOperation.completedAt) < expectedOperation.completedAt : stryMutAct_9fa48("139822") ? false : stryMutAct_9fa48("139821") ? true : (stryCov_9fa48("139821", "139822", "139823"), Number.isFinite(expectedOperation.completedAt) && (stryMutAct_9fa48("139826") ? Number(observedOperation.completedAt) >= expectedOperation.completedAt : stryMutAct_9fa48("139825") ? Number(observedOperation.completedAt) <= expectedOperation.completedAt : stryMutAct_9fa48("139824") ? true : (stryCov_9fa48("139824", "139825", "139826"), Number(observedOperation.completedAt) < expectedOperation.completedAt)))) {
        if (stryMutAct_9fa48("139827")) {
          {}
        } else {
          stryCov_9fa48("139827");
          return stryMutAct_9fa48("139828") ? true : (stryCov_9fa48("139828"), false);
        }
      }
      return stryMutAct_9fa48("139829") ? false : (stryCov_9fa48("139829"), true);
    }
  } /**
    * Wait briefly before re-checking authoritative replica operation visibility.
    * @param {number} delayMs
    * @return {Promise<void>}
    * @private
    */
  async waitForReplicaOperationVisibilityRetry(delayMs) {
    if (stryMutAct_9fa48("139830")) {
      {}
    } else {
      stryCov_9fa48("139830");
      await new Promise(stryMutAct_9fa48("139831") ? () => undefined : (stryCov_9fa48("139831"), resolve => setTimeout(resolve, delayMs)));
    }
  } /**
    * Emit divergence when the replica_operations cache lags the
    * authoritative row after a confirmed write.
    * @param {object} authoritativeOperation
    * @return {void}
    * @private
    */
  emitReplicaOperationPersistenceDivergence(authoritativeOperation) {
    if (stryMutAct_9fa48("139832")) {
      {}
    } else {
      stryCov_9fa48("139832");
      if (stryMutAct_9fa48("139835") ? false : stryMutAct_9fa48("139834") ? true : stryMutAct_9fa48("139833") ? authoritativeOperation?.operationId : (stryCov_9fa48("139833", "139834", "139835"), !(stryMutAct_9fa48("139836") ? authoritativeOperation.operationId : (stryCov_9fa48("139836"), authoritativeOperation?.operationId)))) {
        if (stryMutAct_9fa48("139837")) {
          {}
        } else {
          stryCov_9fa48("139837");
          return;
        }
      }
      const cachedRow = this.getReplicaOperationRowFromCache(authoritativeOperation.operationId);
      const authoritativeValue = this.buildReplicaOperationDivergenceValue(authoritativeOperation);
      const cacheValue = cachedRow ? stryMutAct_9fa48("139838") ? {} : (stryCov_9fa48("139838"), {
        operation_id: stryMutAct_9fa48("139841") ? cachedRow.operation_id && null : stryMutAct_9fa48("139840") ? false : stryMutAct_9fa48("139839") ? true : (stryCov_9fa48("139839", "139840", "139841"), cachedRow.operation_id || null),
        replica_id: stryMutAct_9fa48("139844") ? cachedRow.replica_id && null : stryMutAct_9fa48("139843") ? false : stryMutAct_9fa48("139842") ? true : (stryCov_9fa48("139842", "139843", "139844"), cachedRow.replica_id || null),
        status: stryMutAct_9fa48("139847") ? cachedRow.status && null : stryMutAct_9fa48("139846") ? false : stryMutAct_9fa48("139845") ? true : (stryCov_9fa48("139845", "139846", "139847"), cachedRow.status || null),
        workflow_step: stryMutAct_9fa48("139850") ? cachedRow.workflow_step && null : stryMutAct_9fa48("139849") ? false : stryMutAct_9fa48("139848") ? true : (stryCov_9fa48("139848", "139849", "139850"), cachedRow.workflow_step || null),
        updated_at: stryMutAct_9fa48("139853") ? Number(cachedRow.updated_at) && null : stryMutAct_9fa48("139852") ? false : stryMutAct_9fa48("139851") ? true : (stryCov_9fa48("139851", "139852", "139853"), Number(cachedRow.updated_at) || null),
        completed_at: stryMutAct_9fa48("139856") ? Number(cachedRow.completed_at) && null : stryMutAct_9fa48("139855") ? false : stryMutAct_9fa48("139854") ? true : (stryCov_9fa48("139854", "139855", "139856"), Number(cachedRow.completed_at) || null),
        error_message: stryMutAct_9fa48("139859") ? cachedRow.error_message && null : stryMutAct_9fa48("139858") ? false : stryMutAct_9fa48("139857") ? true : (stryCov_9fa48("139857", "139858", "139859"), cachedRow.error_message || null)
      }) : null;
      const divergentFields = stryMutAct_9fa48("139860") ? ["Stryker was here"] : (stryCov_9fa48("139860"), []);
      if (stryMutAct_9fa48("139863") ? false : stryMutAct_9fa48("139862") ? true : stryMutAct_9fa48("139861") ? cachedRow : (stryCov_9fa48("139861", "139862", "139863"), !cachedRow)) {
        if (stryMutAct_9fa48("139864")) {
          {}
        } else {
          stryCov_9fa48("139864");
          divergentFields.push(...Object.keys(authoritativeValue));
        }
      } else {
        if (stryMutAct_9fa48("139865")) {
          {}
        } else {
          stryCov_9fa48("139865");
          for (const fieldName of Object.keys(authoritativeValue)) {
            if (stryMutAct_9fa48("139866")) {
              {}
            } else {
              stryCov_9fa48("139866");
              if (stryMutAct_9fa48("139869") ? (cacheValue?.[fieldName] ?? null) === authoritativeValue[fieldName] : stryMutAct_9fa48("139868") ? false : stryMutAct_9fa48("139867") ? true : (stryCov_9fa48("139867", "139868", "139869"), (stryMutAct_9fa48("139870") ? cacheValue?.[fieldName] && null : (stryCov_9fa48("139870"), (stryMutAct_9fa48("139871") ? cacheValue[fieldName] : (stryCov_9fa48("139871"), cacheValue?.[fieldName])) ?? null)) !== authoritativeValue[fieldName])) {
                if (stryMutAct_9fa48("139872")) {
                  {}
                } else {
                  stryCov_9fa48("139872");
                  divergentFields.push(fieldName);
                }
              }
            }
          }
        }
      }
      if (stryMutAct_9fa48("139875") ? divergentFields.length !== NUM.ZERO : stryMutAct_9fa48("139874") ? false : stryMutAct_9fa48("139873") ? true : (stryCov_9fa48("139873", "139874", "139875"), divergentFields.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("139876")) {
          {}
        } else {
          stryCov_9fa48("139876");
          return;
        }
      }
      const divergenceType = (stryMutAct_9fa48("139877") ? cachedRow : (stryCov_9fa48("139877"), !cachedRow)) ? READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING : READ_MODEL_DIVERGENCE_TYPE.FIELD_MISMATCH;
      const event = buildDivergenceEvent(stryMutAct_9fa48("139878") ? {} : (stryCov_9fa48("139878"), {
        divergenceType,
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        ownerComponent: COORDINATOR_OWNER_COMPONENT,
        reconciliationReason: SQL_RECONCILIATION_REASON.RECOVERY_OPERATION_PERSIST_CONFIRMATION,
        rowKey: authoritativeOperation.operationId,
        cacheValue,
        authoritativeValue,
        divergentFields
      }));
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.READ_MODEL_DIVERGENCE, event);
      if (stryMutAct_9fa48("139880") ? false : stryMutAct_9fa48("139879") ? true : (stryCov_9fa48("139879", "139880"), this.emitter)) {
        if (stryMutAct_9fa48("139881")) {
          {}
        } else {
          stryCov_9fa48("139881");
          this.emitter.emit(REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE, event);
        }
      }
    }
  } /**
    * @param {object} operation
    * @return {object}
    * @private
    */
  buildReplicaOperationDivergenceValue(operation) {
    if (stryMutAct_9fa48("139882")) {
      {}
    } else {
      stryCov_9fa48("139882");
      return stryMutAct_9fa48("139883") ? {} : (stryCov_9fa48("139883"), {
        operation_id: operation.operationId,
        replica_id: stryMutAct_9fa48("139884") ? operation.replicaId && null : (stryCov_9fa48("139884"), operation.replicaId ?? null),
        status: stryMutAct_9fa48("139885") ? operation.status && null : (stryCov_9fa48("139885"), operation.status ?? null),
        workflow_step: stryMutAct_9fa48("139886") ? operation.workflowStep && null : (stryCov_9fa48("139886"), operation.workflowStep ?? null),
        updated_at: Number.isFinite(operation.updatedAt) ? operation.updatedAt : null,
        completed_at: Number.isFinite(operation.completedAt) ? operation.completedAt : null,
        error_message: stryMutAct_9fa48("139887") ? operation.errorMessage && null : (stryCov_9fa48("139887"), operation.errorMessage ?? null)
      });
    }
  } /**
    * Execute a mutation query with bounded retry on transient errors.
    * @param {string} sql
    * @param {Array} params
    * @param {object} [options]
    * @return {Promise<object>}
    */
  async executeOperationMutationWithRetry(sql, params, options = {}) {
    if (stryMutAct_9fa48("139888")) {
      {}
    } else {
      stryCov_9fa48("139888");
      const startedAt = Date.now();
      let retryAttempt = NUM.ZERO;
      while (stryMutAct_9fa48("139890") ? false : stryMutAct_9fa48("139889") ? false : (stryCov_9fa48("139889", "139890"), true)) {
        if (stryMutAct_9fa48("139891")) {
          {}
        } else {
          stryCov_9fa48("139891");
          const queryOptions = this.buildOperationMutationQueryOptions(options, retryAttempt);
          const result = await this.controlPlaneSystemTableGateway.executeQuery(sql, params, queryOptions);
          if (stryMutAct_9fa48("139894") ? result.success && !this.isRetryableOperationPersistError(result) : stryMutAct_9fa48("139893") ? false : stryMutAct_9fa48("139892") ? true : (stryCov_9fa48("139892", "139893", "139894"), result.success || (stryMutAct_9fa48("139895") ? this.isRetryableOperationPersistError(result) : (stryCov_9fa48("139895"), !this.isRetryableOperationPersistError(result))))) {
            if (stryMutAct_9fa48("139896")) {
              {}
            } else {
              stryCov_9fa48("139896");
              return result;
            }
          }
          const elapsedMs = stryMutAct_9fa48("139897") ? Date.now() + startedAt : (stryCov_9fa48("139897"), Date.now() - startedAt);
          const remainingMs = this.resolveOperationMutationRemainingRetryMs(elapsedMs, options.timeoutBudget);
          if (stryMutAct_9fa48("139901") ? remainingMs > NUM.ZERO : stryMutAct_9fa48("139900") ? remainingMs < NUM.ZERO : stryMutAct_9fa48("139899") ? false : stryMutAct_9fa48("139898") ? true : (stryCov_9fa48("139898", "139899", "139900", "139901"), remainingMs <= NUM.ZERO)) {
            if (stryMutAct_9fa48("139902")) {
              {}
            } else {
              stryCov_9fa48("139902");
              return result;
            }
          }
          if (stryMutAct_9fa48("139904") ? false : stryMutAct_9fa48("139903") ? true : (stryCov_9fa48("139903", "139904"), this.shouldRotateOperationMutationSessionOnRetry(result, options))) {
            if (stryMutAct_9fa48("139905")) {
              {}
            } else {
              stryCov_9fa48("139905");
              stryMutAct_9fa48("139906") ? retryAttempt -= NUM.ONE : (stryCov_9fa48("139906"), retryAttempt += NUM.ONE);
            }
          }
          const waitMs = stryMutAct_9fa48("139907") ? Math.max(this.resolveOperationMutationRetryDelayMs(result), remainingMs) : (stryCov_9fa48("139907"), Math.min(this.resolveOperationMutationRetryDelayMs(result), remainingMs));
          await this.waitForOperationPersistRetry(waitMs);
        }
      }
    }
  } /**
    * Execute one replica_operations mutation through the canonical gateway
    * mutation ingress when available, falling back to raw query execution only
    * for reduced test doubles that do not expose mutation helpers.
    * @param {object} mutation
    * @param {object} [options]
    * @param {object} [fallback]
    * @return {Promise<object>}
    * @private
    */
  async executeReplicaOperationGatewayMutationWithRetry(mutation, options = {}, fallback = {}) {
    if (stryMutAct_9fa48("139908")) {
      {}
    } else {
      stryCov_9fa48("139908");
      const startedAt = Date.now();
      let retryAttempt = NUM.ZERO;
      while (stryMutAct_9fa48("139910") ? false : stryMutAct_9fa48("139909") ? false : (stryCov_9fa48("139909", "139910"), true)) {
        if (stryMutAct_9fa48("139911")) {
          {}
        } else {
          stryCov_9fa48("139911");
          const queryOptions = this.buildOperationMutationQueryOptions(options, retryAttempt);
          const result = await this.executeReplicaOperationGatewayMutation(mutation, queryOptions, fallback);
          if (stryMutAct_9fa48("139914") ? result.success && !this.isRetryableOperationPersistError(result) : stryMutAct_9fa48("139913") ? false : stryMutAct_9fa48("139912") ? true : (stryCov_9fa48("139912", "139913", "139914"), result.success || (stryMutAct_9fa48("139915") ? this.isRetryableOperationPersistError(result) : (stryCov_9fa48("139915"), !this.isRetryableOperationPersistError(result))))) {
            if (stryMutAct_9fa48("139916")) {
              {}
            } else {
              stryCov_9fa48("139916");
              return result;
            }
          }
          const elapsedMs = stryMutAct_9fa48("139917") ? Date.now() + startedAt : (stryCov_9fa48("139917"), Date.now() - startedAt);
          const remainingMs = this.resolveOperationMutationRemainingRetryMs(elapsedMs, options.timeoutBudget);
          if (stryMutAct_9fa48("139921") ? remainingMs > NUM.ZERO : stryMutAct_9fa48("139920") ? remainingMs < NUM.ZERO : stryMutAct_9fa48("139919") ? false : stryMutAct_9fa48("139918") ? true : (stryCov_9fa48("139918", "139919", "139920", "139921"), remainingMs <= NUM.ZERO)) {
            if (stryMutAct_9fa48("139922")) {
              {}
            } else {
              stryCov_9fa48("139922");
              return result;
            }
          }
          if (stryMutAct_9fa48("139924") ? false : stryMutAct_9fa48("139923") ? true : (stryCov_9fa48("139923", "139924"), this.shouldRotateOperationMutationSessionOnRetry(result, options))) {
            if (stryMutAct_9fa48("139925")) {
              {}
            } else {
              stryCov_9fa48("139925");
              stryMutAct_9fa48("139926") ? retryAttempt -= NUM.ONE : (stryCov_9fa48("139926"), retryAttempt += NUM.ONE);
            }
          }
          const waitMs = stryMutAct_9fa48("139927") ? Math.max(this.resolveOperationMutationRetryDelayMs(result), remainingMs) : (stryCov_9fa48("139927"), Math.min(this.resolveOperationMutationRetryDelayMs(result), remainingMs));
          await this.waitForOperationPersistRetry(waitMs);
        }
      }
    }
  } /**
    * @param {object} mutation
    * @param {object} queryOptions
    * @param {object} [fallback]
    * @return {Promise<object>}
    * @private
    */
  async executeReplicaOperationGatewayMutation(mutation, queryOptions, fallback = {}) {
    if (stryMutAct_9fa48("139928")) {
      {}
    } else {
      stryCov_9fa48("139928");
      const gateway = this.controlPlaneSystemTableGateway;
      const canUseCanonicalMutationIngress = this.canUseReplicaOperationMutationIngress(stryMutAct_9fa48("139929") ? mutation.operation : (stryCov_9fa48("139929"), mutation?.operation));
      if (stryMutAct_9fa48("139931") ? false : stryMutAct_9fa48("139930") ? true : (stryCov_9fa48("139930", "139931"), canUseCanonicalMutationIngress)) {
        if (stryMutAct_9fa48("139932")) {
          {}
        } else {
          stryCov_9fa48("139932");
          if (stryMutAct_9fa48("139935") ? typeof gateway?.submitMutation !== TYPEOF.FUNCTION : stryMutAct_9fa48("139934") ? false : stryMutAct_9fa48("139933") ? true : (stryCov_9fa48("139933", "139934", "139935"), typeof (stryMutAct_9fa48("139936") ? gateway.submitMutation : (stryCov_9fa48("139936"), gateway?.submitMutation)) === TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("139937")) {
              {}
            } else {
              stryCov_9fa48("139937");
              return gateway.submitMutation(mutation, queryOptions);
            }
          }
          if (stryMutAct_9fa48("139940") ? mutation?.operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT || typeof gateway?.insertSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("139939") ? false : stryMutAct_9fa48("139938") ? true : (stryCov_9fa48("139938", "139939", "139940"), (stryMutAct_9fa48("139942") ? mutation?.operation !== CONTROL_PLANE_MUTATION_OPERATION.INSERT : stryMutAct_9fa48("139941") ? true : (stryCov_9fa48("139941", "139942"), (stryMutAct_9fa48("139943") ? mutation.operation : (stryCov_9fa48("139943"), mutation?.operation)) === CONTROL_PLANE_MUTATION_OPERATION.INSERT)) && (stryMutAct_9fa48("139945") ? typeof gateway?.insertSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("139944") ? true : (stryCov_9fa48("139944", "139945"), typeof (stryMutAct_9fa48("139946") ? gateway.insertSystemTableRow : (stryCov_9fa48("139946"), gateway?.insertSystemTableRow)) === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("139947")) {
              {}
            } else {
              stryCov_9fa48("139947");
              return gateway.insertSystemTableRow(mutation.tableName, mutation.row, queryOptions);
            }
          }
          if (stryMutAct_9fa48("139950") ? mutation?.operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE || typeof gateway?.updateSystemTableRow === TYPEOF.FUNCTION : stryMutAct_9fa48("139949") ? false : stryMutAct_9fa48("139948") ? true : (stryCov_9fa48("139948", "139949", "139950"), (stryMutAct_9fa48("139952") ? mutation?.operation !== CONTROL_PLANE_MUTATION_OPERATION.UPDATE : stryMutAct_9fa48("139951") ? true : (stryCov_9fa48("139951", "139952"), (stryMutAct_9fa48("139953") ? mutation.operation : (stryCov_9fa48("139953"), mutation?.operation)) === CONTROL_PLANE_MUTATION_OPERATION.UPDATE)) && (stryMutAct_9fa48("139955") ? typeof gateway?.updateSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("139954") ? true : (stryCov_9fa48("139954", "139955"), typeof (stryMutAct_9fa48("139956") ? gateway.updateSystemTableRow : (stryCov_9fa48("139956"), gateway?.updateSystemTableRow)) === TYPEOF.FUNCTION)))) {
            if (stryMutAct_9fa48("139957")) {
              {}
            } else {
              stryCov_9fa48("139957");
              return gateway.updateSystemTableRow(mutation.tableName, mutation.whereClause, mutation.data, queryOptions);
            }
          }
        }
      }
      if (stryMutAct_9fa48("139960") ? typeof gateway?.executeQuery === TYPEOF.FUNCTION || typeof fallback?.sql === TYPEOF.STRING : stryMutAct_9fa48("139959") ? false : stryMutAct_9fa48("139958") ? true : (stryCov_9fa48("139958", "139959", "139960"), (stryMutAct_9fa48("139962") ? typeof gateway?.executeQuery !== TYPEOF.FUNCTION : stryMutAct_9fa48("139961") ? true : (stryCov_9fa48("139961", "139962"), typeof (stryMutAct_9fa48("139963") ? gateway.executeQuery : (stryCov_9fa48("139963"), gateway?.executeQuery)) === TYPEOF.FUNCTION)) && (stryMutAct_9fa48("139965") ? typeof fallback?.sql !== TYPEOF.STRING : stryMutAct_9fa48("139964") ? true : (stryCov_9fa48("139964", "139965"), typeof (stryMutAct_9fa48("139966") ? fallback.sql : (stryCov_9fa48("139966"), fallback?.sql)) === TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("139967")) {
          {}
        } else {
          stryCov_9fa48("139967");
          return gateway.executeQuery(fallback.sql, Array.isArray(stryMutAct_9fa48("139968") ? fallback.params : (stryCov_9fa48("139968"), fallback?.params)) ? fallback.params : stryMutAct_9fa48("139969") ? ["Stryker was here"] : (stryCov_9fa48("139969"), []), queryOptions);
        }
      }
      throw new Error(REPLICA_OPERATION_REPOSITORY_LITERAL.REPLICAOPERATIONREPOSITORY_REQUIRES_A_CONTROL_PLANE_MUTATION_INGRESS);
    }
  } /**
    * @param {string} operationType
    * @return {boolean}
    * @private
    */
  canUseReplicaOperationMutationIngress(operationType) {
    if (stryMutAct_9fa48("139970")) {
      {}
    } else {
      stryCov_9fa48("139970");
      const gateway = this.controlPlaneSystemTableGateway;
      const cdcIntegrationService = (stryMutAct_9fa48("139973") ? typeof gateway?.resolveCdcIntegrationService !== 'function' : stryMutAct_9fa48("139972") ? false : stryMutAct_9fa48("139971") ? true : (stryCov_9fa48("139971", "139972", "139973"), typeof (stryMutAct_9fa48("139974") ? gateway.resolveCdcIntegrationService : (stryCov_9fa48("139974"), gateway?.resolveCdcIntegrationService)) === (stryMutAct_9fa48("139975") ? "" : (stryCov_9fa48("139975"), 'function')))) ? gateway.resolveCdcIntegrationService() : stryMutAct_9fa48("139978") ? gateway?.cdcIntegrationService && null : stryMutAct_9fa48("139977") ? false : stryMutAct_9fa48("139976") ? true : (stryCov_9fa48("139976", "139977", "139978"), (stryMutAct_9fa48("139979") ? gateway.cdcIntegrationService : (stryCov_9fa48("139979"), gateway?.cdcIntegrationService)) || null);
      if (stryMutAct_9fa48("139982") ? operationType !== CONTROL_PLANE_MUTATION_OPERATION.INSERT : stryMutAct_9fa48("139981") ? false : stryMutAct_9fa48("139980") ? true : (stryCov_9fa48("139980", "139981", "139982"), operationType === CONTROL_PLANE_MUTATION_OPERATION.INSERT)) {
        if (stryMutAct_9fa48("139983")) {
          {}
        } else {
          stryCov_9fa48("139983");
          return stryMutAct_9fa48("139986") ? typeof cdcIntegrationService?.insertSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("139985") ? false : stryMutAct_9fa48("139984") ? true : (stryCov_9fa48("139984", "139985", "139986"), typeof (stryMutAct_9fa48("139987") ? cdcIntegrationService.insertSystemTableRow : (stryCov_9fa48("139987"), cdcIntegrationService?.insertSystemTableRow)) === TYPEOF.FUNCTION);
        }
      }
      if (stryMutAct_9fa48("139990") ? operationType !== CONTROL_PLANE_MUTATION_OPERATION.UPDATE : stryMutAct_9fa48("139989") ? false : stryMutAct_9fa48("139988") ? true : (stryCov_9fa48("139988", "139989", "139990"), operationType === CONTROL_PLANE_MUTATION_OPERATION.UPDATE)) {
        if (stryMutAct_9fa48("139991")) {
          {}
        } else {
          stryCov_9fa48("139991");
          return stryMutAct_9fa48("139994") ? typeof cdcIntegrationService?.updateSystemTableRow !== TYPEOF.FUNCTION : stryMutAct_9fa48("139993") ? false : stryMutAct_9fa48("139992") ? true : (stryCov_9fa48("139992", "139993", "139994"), typeof (stryMutAct_9fa48("139995") ? cdcIntegrationService.updateSystemTableRow : (stryCov_9fa48("139995"), cdcIntegrationService?.updateSystemTableRow)) === TYPEOF.FUNCTION);
        }
      }
      return stryMutAct_9fa48("139996") ? true : (stryCov_9fa48("139996"), false);
    }
  } /**
    * Check whether a persist error is retryable.
    * @param {object|string} errorResult
    * @return {boolean}
    */
  isRetryableOperationPersistError(errorResult) {
    if (stryMutAct_9fa48("139997")) {
      {}
    } else {
      stryCov_9fa48("139997");
      if (stryMutAct_9fa48("139999") ? false : stryMutAct_9fa48("139998") ? true : (stryCov_9fa48("139998", "139999"), isRetryableControlPlaneError(errorResult))) {
        if (stryMutAct_9fa48("140000")) {
          {}
        } else {
          stryCov_9fa48("140000");
          return stryMutAct_9fa48("140001") ? false : (stryCov_9fa48("140001"), true);
        }
      }
      const errorMessage = this.getOperationPersistErrorMessage(errorResult);
      return stryMutAct_9fa48("140004") ? typeof errorMessage === TYPEOF.STRING || errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS.some(fragment => errorMessage.includes(fragment)) || isRetryableWorkflowParticipantLookupErrorMessage(errorMessage) || RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES.includes(errorMessage) || RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES.some(prefix => errorMessage.startsWith(prefix)) : stryMutAct_9fa48("140003") ? false : stryMutAct_9fa48("140002") ? true : (stryCov_9fa48("140002", "140003", "140004"), (stryMutAct_9fa48("140006") ? typeof errorMessage !== TYPEOF.STRING : stryMutAct_9fa48("140005") ? true : (stryCov_9fa48("140005", "140006"), typeof errorMessage === TYPEOF.STRING)) && (stryMutAct_9fa48("140008") ? (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS.some(fragment => errorMessage.includes(fragment)) || isRetryableWorkflowParticipantLookupErrorMessage(errorMessage) || RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES.includes(errorMessage)) && RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES.some(prefix => errorMessage.startsWith(prefix)) : stryMutAct_9fa48("140007") ? true : (stryCov_9fa48("140007", "140008"), (stryMutAct_9fa48("140010") ? (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS.some(fragment => errorMessage.includes(fragment)) || isRetryableWorkflowParticipantLookupErrorMessage(errorMessage)) && RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES.includes(errorMessage) : stryMutAct_9fa48("140009") ? false : (stryCov_9fa48("140009", "140010"), (stryMutAct_9fa48("140012") ? (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS.some(fragment => errorMessage.includes(fragment))) && isRetryableWorkflowParticipantLookupErrorMessage(errorMessage) : stryMutAct_9fa48("140011") ? false : (stryCov_9fa48("140011", "140012"), (stryMutAct_9fa48("140014") ? (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND)) && RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS.some(fragment => errorMessage.includes(fragment)) : stryMutAct_9fa48("140013") ? false : (stryCov_9fa48("140013", "140014"), (stryMutAct_9fa48("140016") ? errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) && errorMessage.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) : stryMutAct_9fa48("140015") ? false : (stryCov_9fa48("140015", "140016"), errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND))) || (stryMutAct_9fa48("140017") ? RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS.every(fragment => errorMessage.includes(fragment)) : (stryCov_9fa48("140017"), RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS.some(stryMutAct_9fa48("140018") ? () => undefined : (stryCov_9fa48("140018"), fragment => errorMessage.includes(fragment))))))) || isRetryableWorkflowParticipantLookupErrorMessage(errorMessage))) || RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES.includes(errorMessage))) || (stryMutAct_9fa48("140019") ? RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES.every(prefix => errorMessage.startsWith(prefix)) : (stryCov_9fa48("140019"), RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES.some(stryMutAct_9fa48("140020") ? () => undefined : (stryCov_9fa48("140020"), prefix => stryMutAct_9fa48("140021") ? errorMessage.endsWith(prefix) : (stryCov_9fa48("140021"), errorMessage.startsWith(prefix)))))))));
    }
  } /**
    * Normalize one operation persist error message for retry classification.
    * @param {object|string} errorResult
    * @return {string}
    * @private
    */
  getOperationPersistErrorMessage(errorResult) {
    if (stryMutAct_9fa48("140022")) {
      {}
    } else {
      stryCov_9fa48("140022");
      return (stryMutAct_9fa48("140025") ? typeof errorResult !== TYPEOF.STRING : stryMutAct_9fa48("140024") ? false : stryMutAct_9fa48("140023") ? true : (stryCov_9fa48("140023", "140024", "140025"), typeof errorResult === TYPEOF.STRING)) ? errorResult : (stryMutAct_9fa48("140028") ? typeof errorResult?.error !== TYPEOF.STRING : stryMutAct_9fa48("140027") ? false : stryMutAct_9fa48("140026") ? true : (stryCov_9fa48("140026", "140027", "140028"), typeof (stryMutAct_9fa48("140029") ? errorResult.error : (stryCov_9fa48("140029"), errorResult?.error)) === TYPEOF.STRING)) ? errorResult.error : (stryMutAct_9fa48("140032") ? typeof errorResult?.message !== TYPEOF.STRING : stryMutAct_9fa48("140031") ? false : stryMutAct_9fa48("140030") ? true : (stryCov_9fa48("140030", "140031", "140032"), typeof (stryMutAct_9fa48("140033") ? errorResult.message : (stryCov_9fa48("140033"), errorResult?.message)) === TYPEOF.STRING)) ? errorResult.message : REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE;
    }
  } /**
    * Preserve structured retry metadata when surfacing one failed mutation as
    * an exception so owner-lane retry classification still sees pressure hints.
    * @param {object|string|Error} errorResult
    * @param {string} [fallbackMessage]
    * @return {Error}
    * @private
    */
  buildOperationPersistError(errorResult, fallbackMessage = REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED) {
    if (stryMutAct_9fa48("140034")) {
      {}
    } else {
      stryCov_9fa48("140034");
      const retryablePersistError = this.isRetryableOperationPersistError(errorResult);
      const derivedRetryAfterMs = retryablePersistError ? this.resolveOperationMutationRetryDelayMs(errorResult) : NUM.ZERO;
      const retryAfterMs = getControlPlaneRetryAfterMs(errorResult);
      const nextRetryAfterMs = (stryMutAct_9fa48("140038") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("140037") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("140036") ? false : stryMutAct_9fa48("140035") ? true : (stryCov_9fa48("140035", "140036", "140037", "140038"), retryAfterMs > NUM.ZERO)) ? retryAfterMs : (stryMutAct_9fa48("140042") ? derivedRetryAfterMs <= NUM.ZERO : stryMutAct_9fa48("140041") ? derivedRetryAfterMs >= NUM.ZERO : stryMutAct_9fa48("140040") ? false : stryMutAct_9fa48("140039") ? true : (stryCov_9fa48("140039", "140040", "140041", "140042"), derivedRetryAfterMs > NUM.ZERO)) ? derivedRetryAfterMs : NUM.ZERO;
      const deferRetry = stryMutAct_9fa48("140045") ? (errorResult?.deferRetry === true || errorResult?.firstFailedParticipant?.deferRetry === true || Array.isArray(errorResult?.participantFailures) && errorResult.participantFailures.some(entry => entry?.deferRetry === true)) && retryablePersistError : stryMutAct_9fa48("140044") ? false : stryMutAct_9fa48("140043") ? true : (stryCov_9fa48("140043", "140044", "140045"), (stryMutAct_9fa48("140047") ? (errorResult?.deferRetry === true || errorResult?.firstFailedParticipant?.deferRetry === true) && Array.isArray(errorResult?.participantFailures) && errorResult.participantFailures.some(entry => entry?.deferRetry === true) : stryMutAct_9fa48("140046") ? false : (stryCov_9fa48("140046", "140047"), (stryMutAct_9fa48("140049") ? errorResult?.deferRetry === true && errorResult?.firstFailedParticipant?.deferRetry === true : stryMutAct_9fa48("140048") ? false : (stryCov_9fa48("140048", "140049"), (stryMutAct_9fa48("140051") ? errorResult?.deferRetry !== true : stryMutAct_9fa48("140050") ? false : (stryCov_9fa48("140050", "140051"), (stryMutAct_9fa48("140052") ? errorResult.deferRetry : (stryCov_9fa48("140052"), errorResult?.deferRetry)) === (stryMutAct_9fa48("140053") ? false : (stryCov_9fa48("140053"), true)))) || (stryMutAct_9fa48("140055") ? errorResult?.firstFailedParticipant?.deferRetry !== true : stryMutAct_9fa48("140054") ? false : (stryCov_9fa48("140054", "140055"), (stryMutAct_9fa48("140057") ? errorResult.firstFailedParticipant?.deferRetry : stryMutAct_9fa48("140056") ? errorResult?.firstFailedParticipant.deferRetry : (stryCov_9fa48("140056", "140057"), errorResult?.firstFailedParticipant?.deferRetry)) === (stryMutAct_9fa48("140058") ? false : (stryCov_9fa48("140058"), true)))))) || (stryMutAct_9fa48("140060") ? Array.isArray(errorResult?.participantFailures) || errorResult.participantFailures.some(entry => entry?.deferRetry === true) : stryMutAct_9fa48("140059") ? false : (stryCov_9fa48("140059", "140060"), Array.isArray(stryMutAct_9fa48("140061") ? errorResult.participantFailures : (stryCov_9fa48("140061"), errorResult?.participantFailures)) && (stryMutAct_9fa48("140062") ? errorResult.participantFailures.every(entry => entry?.deferRetry === true) : (stryCov_9fa48("140062"), errorResult.participantFailures.some(stryMutAct_9fa48("140063") ? () => undefined : (stryCov_9fa48("140063"), entry => stryMutAct_9fa48("140066") ? entry?.deferRetry !== true : stryMutAct_9fa48("140065") ? false : stryMutAct_9fa48("140064") ? true : (stryCov_9fa48("140064", "140065", "140066"), (stryMutAct_9fa48("140067") ? entry.deferRetry : (stryCov_9fa48("140067"), entry?.deferRetry)) === (stryMutAct_9fa48("140068") ? false : (stryCov_9fa48("140068"), true))))))))))) || retryablePersistError);
      const error = new Error(stryMutAct_9fa48("140071") ? this.getOperationPersistErrorMessage(errorResult) && fallbackMessage : stryMutAct_9fa48("140070") ? false : stryMutAct_9fa48("140069") ? true : (stryCov_9fa48("140069", "140070", "140071"), this.getOperationPersistErrorMessage(errorResult) || fallbackMessage));
      const errorCode = getControlPlaneErrorCode(errorResult);
      if (stryMutAct_9fa48("140074") ? typeof errorCode === TYPEOF.STRING || errorCode.length > NUM.ZERO : stryMutAct_9fa48("140073") ? false : stryMutAct_9fa48("140072") ? true : (stryCov_9fa48("140072", "140073", "140074"), (stryMutAct_9fa48("140076") ? typeof errorCode !== TYPEOF.STRING : stryMutAct_9fa48("140075") ? true : (stryCov_9fa48("140075", "140076"), typeof errorCode === TYPEOF.STRING)) && (stryMutAct_9fa48("140079") ? errorCode.length <= NUM.ZERO : stryMutAct_9fa48("140078") ? errorCode.length >= NUM.ZERO : stryMutAct_9fa48("140077") ? true : (stryCov_9fa48("140077", "140078", "140079"), errorCode.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140080")) {
          {}
        } else {
          stryCov_9fa48("140080");
          error.code = errorCode;
          error.errorCode = errorCode;
        }
      }
      if (stryMutAct_9fa48("140084") ? nextRetryAfterMs <= NUM.ZERO : stryMutAct_9fa48("140083") ? nextRetryAfterMs >= NUM.ZERO : stryMutAct_9fa48("140082") ? false : stryMutAct_9fa48("140081") ? true : (stryCov_9fa48("140081", "140082", "140083", "140084"), nextRetryAfterMs > NUM.ZERO)) {
        if (stryMutAct_9fa48("140085")) {
          {}
        } else {
          stryCov_9fa48("140085");
          error.retryAfterMs = nextRetryAfterMs;
        }
      }
      if (stryMutAct_9fa48("140087") ? false : stryMutAct_9fa48("140086") ? true : (stryCov_9fa48("140086", "140087"), deferRetry)) {
        if (stryMutAct_9fa48("140088")) {
          {}
        } else {
          stryCov_9fa48("140088");
          error.deferRetry = stryMutAct_9fa48("140089") ? false : (stryCov_9fa48("140089"), true);
        }
      }
      if (stryMutAct_9fa48("140092") ? typeof errorResult?.reasonCode === TYPEOF.STRING || errorResult.reasonCode.length > NUM.ZERO : stryMutAct_9fa48("140091") ? false : stryMutAct_9fa48("140090") ? true : (stryCov_9fa48("140090", "140091", "140092"), (stryMutAct_9fa48("140094") ? typeof errorResult?.reasonCode !== TYPEOF.STRING : stryMutAct_9fa48("140093") ? true : (stryCov_9fa48("140093", "140094"), typeof (stryMutAct_9fa48("140095") ? errorResult.reasonCode : (stryCov_9fa48("140095"), errorResult?.reasonCode)) === TYPEOF.STRING)) && (stryMutAct_9fa48("140098") ? errorResult.reasonCode.length <= NUM.ZERO : stryMutAct_9fa48("140097") ? errorResult.reasonCode.length >= NUM.ZERO : stryMutAct_9fa48("140096") ? true : (stryCov_9fa48("140096", "140097", "140098"), errorResult.reasonCode.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140099")) {
          {}
        } else {
          stryCov_9fa48("140099");
          error.reasonCode = errorResult.reasonCode;
        }
      }
      if (stryMutAct_9fa48("140102") ? typeof errorResult?.participationKind === TYPEOF.STRING || errorResult.participationKind.length > NUM.ZERO : stryMutAct_9fa48("140101") ? false : stryMutAct_9fa48("140100") ? true : (stryCov_9fa48("140100", "140101", "140102"), (stryMutAct_9fa48("140104") ? typeof errorResult?.participationKind !== TYPEOF.STRING : stryMutAct_9fa48("140103") ? true : (stryCov_9fa48("140103", "140104"), typeof (stryMutAct_9fa48("140105") ? errorResult.participationKind : (stryCov_9fa48("140105"), errorResult?.participationKind)) === TYPEOF.STRING)) && (stryMutAct_9fa48("140108") ? errorResult.participationKind.length <= NUM.ZERO : stryMutAct_9fa48("140107") ? errorResult.participationKind.length >= NUM.ZERO : stryMutAct_9fa48("140106") ? true : (stryCov_9fa48("140106", "140107", "140108"), errorResult.participationKind.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140109")) {
          {}
        } else {
          stryCov_9fa48("140109");
          error.participationKind = errorResult.participationKind;
        }
      }
      if (stryMutAct_9fa48("140112") ? typeof errorResult?.tableName === TYPEOF.STRING || errorResult.tableName.length > NUM.ZERO : stryMutAct_9fa48("140111") ? false : stryMutAct_9fa48("140110") ? true : (stryCov_9fa48("140110", "140111", "140112"), (stryMutAct_9fa48("140114") ? typeof errorResult?.tableName !== TYPEOF.STRING : stryMutAct_9fa48("140113") ? true : (stryCov_9fa48("140113", "140114"), typeof (stryMutAct_9fa48("140115") ? errorResult.tableName : (stryCov_9fa48("140115"), errorResult?.tableName)) === TYPEOF.STRING)) && (stryMutAct_9fa48("140118") ? errorResult.tableName.length <= NUM.ZERO : stryMutAct_9fa48("140117") ? errorResult.tableName.length >= NUM.ZERO : stryMutAct_9fa48("140116") ? true : (stryCov_9fa48("140116", "140117", "140118"), errorResult.tableName.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140119")) {
          {}
        } else {
          stryCov_9fa48("140119");
          error.tableName = errorResult.tableName;
        }
      }
      const {
        participantFailures,
        firstFailedParticipant
      } = cloneControlPlaneFailureParticipants(errorResult);
      if (stryMutAct_9fa48("140123") ? participantFailures.length <= NUM.ZERO : stryMutAct_9fa48("140122") ? participantFailures.length >= NUM.ZERO : stryMutAct_9fa48("140121") ? false : stryMutAct_9fa48("140120") ? true : (stryCov_9fa48("140120", "140121", "140122", "140123"), participantFailures.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("140124")) {
          {}
        } else {
          stryCov_9fa48("140124");
          error.participantFailures = participantFailures;
        }
      }
      if (stryMutAct_9fa48("140126") ? false : stryMutAct_9fa48("140125") ? true : (stryCov_9fa48("140125", "140126"), firstFailedParticipant)) {
        if (stryMutAct_9fa48("140127")) {
          {}
        } else {
          stryCov_9fa48("140127");
          error.firstFailedParticipant = firstFailedParticipant;
        }
      }
      if (stryMutAct_9fa48("140130") ? typeof errorResult?.pressureAction === TYPEOF.STRING || errorResult.pressureAction.length > NUM.ZERO : stryMutAct_9fa48("140129") ? false : stryMutAct_9fa48("140128") ? true : (stryCov_9fa48("140128", "140129", "140130"), (stryMutAct_9fa48("140132") ? typeof errorResult?.pressureAction !== TYPEOF.STRING : stryMutAct_9fa48("140131") ? true : (stryCov_9fa48("140131", "140132"), typeof (stryMutAct_9fa48("140133") ? errorResult.pressureAction : (stryCov_9fa48("140133"), errorResult?.pressureAction)) === TYPEOF.STRING)) && (stryMutAct_9fa48("140136") ? errorResult.pressureAction.length <= NUM.ZERO : stryMutAct_9fa48("140135") ? errorResult.pressureAction.length >= NUM.ZERO : stryMutAct_9fa48("140134") ? true : (stryCov_9fa48("140134", "140135", "140136"), errorResult.pressureAction.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140137")) {
          {}
        } else {
          stryCov_9fa48("140137");
          error.pressureAction = errorResult.pressureAction;
        }
      }
      if (stryMutAct_9fa48("140140") ? typeof errorResult?.pressureReason === TYPEOF.STRING || errorResult.pressureReason.length > NUM.ZERO : stryMutAct_9fa48("140139") ? false : stryMutAct_9fa48("140138") ? true : (stryCov_9fa48("140138", "140139", "140140"), (stryMutAct_9fa48("140142") ? typeof errorResult?.pressureReason !== TYPEOF.STRING : stryMutAct_9fa48("140141") ? true : (stryCov_9fa48("140141", "140142"), typeof (stryMutAct_9fa48("140143") ? errorResult.pressureReason : (stryCov_9fa48("140143"), errorResult?.pressureReason)) === TYPEOF.STRING)) && (stryMutAct_9fa48("140146") ? errorResult.pressureReason.length <= NUM.ZERO : stryMutAct_9fa48("140145") ? errorResult.pressureReason.length >= NUM.ZERO : stryMutAct_9fa48("140144") ? true : (stryCov_9fa48("140144", "140145", "140146"), errorResult.pressureReason.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140147")) {
          {}
        } else {
          stryCov_9fa48("140147");
          error.pressureReason = errorResult.pressureReason;
        }
      }
      if (stryMutAct_9fa48("140150") ? typeof errorResult?.outcome === TYPEOF.STRING || errorResult.outcome.length > NUM.ZERO : stryMutAct_9fa48("140149") ? false : stryMutAct_9fa48("140148") ? true : (stryCov_9fa48("140148", "140149", "140150"), (stryMutAct_9fa48("140152") ? typeof errorResult?.outcome !== TYPEOF.STRING : stryMutAct_9fa48("140151") ? true : (stryCov_9fa48("140151", "140152"), typeof (stryMutAct_9fa48("140153") ? errorResult.outcome : (stryCov_9fa48("140153"), errorResult?.outcome)) === TYPEOF.STRING)) && (stryMutAct_9fa48("140156") ? errorResult.outcome.length <= NUM.ZERO : stryMutAct_9fa48("140155") ? errorResult.outcome.length >= NUM.ZERO : stryMutAct_9fa48("140154") ? true : (stryCov_9fa48("140154", "140155", "140156"), errorResult.outcome.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140157")) {
          {}
        } else {
          stryCov_9fa48("140157");
          error.outcome = errorResult.outcome;
        }
      }
      if (stryMutAct_9fa48("140160") ? errorResult?.cause || !error.cause : stryMutAct_9fa48("140159") ? false : stryMutAct_9fa48("140158") ? true : (stryCov_9fa48("140158", "140159", "140160"), (stryMutAct_9fa48("140161") ? errorResult.cause : (stryCov_9fa48("140161"), errorResult?.cause)) && (stryMutAct_9fa48("140162") ? error.cause : (stryCov_9fa48("140162"), !error.cause)))) {
        if (stryMutAct_9fa48("140163")) {
          {}
        } else {
          stryCov_9fa48("140163");
          error.cause = errorResult.cause;
        }
      }
      return error;
    }
  } /**
    * Check whether a persist failure is a partition transaction contention.
    * @param {object|string} errorResult
    * @return {boolean}
    * @private
    */
  isOperationMutationPartitionContention(errorResult) {
    if (stryMutAct_9fa48("140164")) {
      {}
    } else {
      stryCov_9fa48("140164");
      return stryMutAct_9fa48("140167") ? this.getOperationPersistErrorMessage(errorResult) !== PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE : stryMutAct_9fa48("140166") ? false : stryMutAct_9fa48("140165") ? true : (stryCov_9fa48("140165", "140166", "140167"), this.getOperationPersistErrorMessage(errorResult) === PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
    }
  } /**
    * Rotate repository-generated retry sessions after partition contention.
    * Explicit transition-owned sessions stay stable so the enclosing atomic
    * boundary can decide when to rotate them.
    * @param {object|string} errorResult
    * @param {object} [options]
    * @return {boolean}
    * @private
    */
  shouldRotateOperationMutationSessionOnRetry(errorResult, options = {}) {
    if (stryMutAct_9fa48("140168")) {
      {}
    } else {
      stryCov_9fa48("140168");
      if (stryMutAct_9fa48("140171") ? typeof options?.sessionId === TYPEOF.STRING || options.sessionId.length > NUM.ZERO : stryMutAct_9fa48("140170") ? false : stryMutAct_9fa48("140169") ? true : (stryCov_9fa48("140169", "140170", "140171"), (stryMutAct_9fa48("140173") ? typeof options?.sessionId !== TYPEOF.STRING : stryMutAct_9fa48("140172") ? true : (stryCov_9fa48("140172", "140173"), typeof (stryMutAct_9fa48("140174") ? options.sessionId : (stryCov_9fa48("140174"), options?.sessionId)) === TYPEOF.STRING)) && (stryMutAct_9fa48("140177") ? options.sessionId.length <= NUM.ZERO : stryMutAct_9fa48("140176") ? options.sessionId.length >= NUM.ZERO : stryMutAct_9fa48("140175") ? true : (stryCov_9fa48("140175", "140176", "140177"), options.sessionId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140178")) {
          {}
        } else {
          stryCov_9fa48("140178");
          return stryMutAct_9fa48("140179") ? true : (stryCov_9fa48("140179"), false);
        }
      }
      return this.isOperationMutationPartitionContention(errorResult);
    }
  } /**
    * Resolve the next retry delay for one failed replica_operations mutation.
    * Transaction-contention retries add light jitter so concurrent recovery
    * writers do not keep colliding in lockstep under restart pressure.
    * @param {object|string} errorResult
    * @return {number}
    * @private
    */
  resolveOperationMutationRetryDelayMs(errorResult) {
    if (stryMutAct_9fa48("140180")) {
      {}
    } else {
      stryCov_9fa48("140180");
      const retryAfterMs = getControlPlaneRetryAfterMs(errorResult);
      const baseDelayMs = (stryMutAct_9fa48("140183") ? Number.isFinite(retryAfterMs) || retryAfterMs > NUM.ZERO : stryMutAct_9fa48("140182") ? false : stryMutAct_9fa48("140181") ? true : (stryCov_9fa48("140181", "140182", "140183"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("140186") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("140185") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("140184") ? true : (stryCov_9fa48("140184", "140185", "140186"), retryAfterMs > NUM.ZERO)))) ? Math.floor(retryAfterMs) : OPERATION_PERSIST_RETRY_DELAY_MS;
      if (stryMutAct_9fa48("140189") ? false : stryMutAct_9fa48("140188") ? true : stryMutAct_9fa48("140187") ? this.isOperationMutationPartitionContention(errorResult) : (stryCov_9fa48("140187", "140188", "140189"), !this.isOperationMutationPartitionContention(errorResult))) {
        if (stryMutAct_9fa48("140190")) {
          {}
        } else {
          stryCov_9fa48("140190");
          return baseDelayMs;
        }
      }
      const jitterCeilingMs = stryMutAct_9fa48("140191") ? Math.min(NUM.ONE, Math.floor(baseDelayMs / NUM.TWO)) : (stryCov_9fa48("140191"), Math.max(NUM.ONE, Math.floor(stryMutAct_9fa48("140192") ? baseDelayMs * NUM.TWO : (stryCov_9fa48("140192"), baseDelayMs / NUM.TWO))));
      const boundedRandom = stryMutAct_9fa48("140193") ? Math.min(NUM.ZERO, Math.min(NUM.ONE, this.random())) : (stryCov_9fa48("140193"), Math.max(NUM.ZERO, stryMutAct_9fa48("140194") ? Math.max(NUM.ONE, this.random()) : (stryCov_9fa48("140194"), Math.min(NUM.ONE, this.random()))));
      const jitterMs = Math.floor(stryMutAct_9fa48("140195") ? boundedRandom / jitterCeilingMs : (stryCov_9fa48("140195"), boundedRandom * jitterCeilingMs));
      return stryMutAct_9fa48("140196") ? baseDelayMs - jitterMs : (stryCov_9fa48("140196"), baseDelayMs + jitterMs);
    }
  } /**
    * Wait before retrying a failed persist.
    * @param {number} delayMs
    * @return {Promise<void>}
    */
  async waitForOperationPersistRetry(delayMs) {
    if (stryMutAct_9fa48("140197")) {
      {}
    } else {
      stryCov_9fa48("140197");
      await new Promise(stryMutAct_9fa48("140198") ? () => undefined : (stryCov_9fa48("140198"), resolve => setTimeout(resolve, delayMs)));
    }
  } /**
    * Clamp replica_operations retry time to the narrower of the local retry
    * window and any enclosing timeout budget.
    * @param {number} elapsedMs
    * @param {Object|null} timeoutBudget
    * @return {number}
    * @private
    */
  resolveOperationMutationRemainingRetryMs(elapsedMs, timeoutBudget = null) {
    if (stryMutAct_9fa48("140199")) {
      {}
    } else {
      stryCov_9fa48("140199");
      const localRemainingMs = stryMutAct_9fa48("140200") ? OPERATION_PERSIST_RETRY_TIMEOUT_MS + elapsedMs : (stryCov_9fa48("140200"), OPERATION_PERSIST_RETRY_TIMEOUT_MS - elapsedMs);
      if (stryMutAct_9fa48("140203") ? !timeoutBudget && typeof timeoutBudget !== REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT : stryMutAct_9fa48("140202") ? false : stryMutAct_9fa48("140201") ? true : (stryCov_9fa48("140201", "140202", "140203"), (stryMutAct_9fa48("140204") ? timeoutBudget : (stryCov_9fa48("140204"), !timeoutBudget)) || (stryMutAct_9fa48("140206") ? typeof timeoutBudget === REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT : stryMutAct_9fa48("140205") ? false : (stryCov_9fa48("140205", "140206"), typeof timeoutBudget !== REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("140207")) {
          {}
        } else {
          stryCov_9fa48("140207");
          return localRemainingMs;
        }
      }
      const budgetRemainingMs = getRemainingBudgetMs(timeoutBudget);
      return stryMutAct_9fa48("140208") ? Math.max(localRemainingMs, budgetRemainingMs) : (stryCov_9fa48("140208"), Math.min(localRemainingMs, budgetRemainingMs));
    }
  } /**
    * Build query options for an operation mutation.
    * @param {object} [options]
    * @param {number} [retryAttempt=0]
    * @return {object}
    */
  buildOperationMutationQueryOptions(options = {}, retryAttempt = NUM.ZERO) {
    if (stryMutAct_9fa48("140209")) {
      {}
    } else {
      stryCov_9fa48("140209");
      const ownerId = (stryMutAct_9fa48("140212") ? typeof options.ownerId === 'string' || options.ownerId.length > NUM.ZERO : stryMutAct_9fa48("140211") ? false : stryMutAct_9fa48("140210") ? true : (stryCov_9fa48("140210", "140211", "140212"), (stryMutAct_9fa48("140214") ? typeof options.ownerId !== 'string' : stryMutAct_9fa48("140213") ? true : (stryCov_9fa48("140213", "140214"), typeof options.ownerId === (stryMutAct_9fa48("140215") ? "" : (stryCov_9fa48("140215"), 'string')))) && (stryMutAct_9fa48("140218") ? options.ownerId.length <= NUM.ZERO : stryMutAct_9fa48("140217") ? options.ownerId.length >= NUM.ZERO : stryMutAct_9fa48("140216") ? true : (stryCov_9fa48("140216", "140217", "140218"), options.ownerId.length > NUM.ZERO)))) ? options.ownerId : null;
      return stryMutAct_9fa48("140219") ? {} : (stryCov_9fa48("140219"), {
        ...CONTROL_PLANE_QUERY_OPTIONS,
        skipCacheWait: stryMutAct_9fa48("140220") ? false : (stryCov_9fa48("140220"), true),
        timeoutBudget: (stryMutAct_9fa48("140223") ? options.timeoutBudget || typeof options.timeoutBudget === REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT : stryMutAct_9fa48("140222") ? false : stryMutAct_9fa48("140221") ? true : (stryCov_9fa48("140221", "140222", "140223"), options.timeoutBudget && (stryMutAct_9fa48("140225") ? typeof options.timeoutBudget !== REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT : stryMutAct_9fa48("140224") ? true : (stryCov_9fa48("140224", "140225"), typeof options.timeoutBudget === REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT)))) ? options.timeoutBudget : undefined,
        sessionId: this.resolveOperationMutationSessionId(options, retryAttempt),
        deliveryPriority: REPLICA_OPERATION_REPOSITORY_LITERAL.CRITICAL,
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        mergePolicy: stryMutAct_9fa48("140228") ? options.mergePolicy && CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT : stryMutAct_9fa48("140227") ? false : stryMutAct_9fa48("140226") ? true : (stryCov_9fa48("140226", "140227", "140228"), options.mergePolicy || CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT),
        controlPlaneTableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        controlPlaneOperationKind: REPLICA_OPERATION_REPOSITORY_LITERAL.WRITE,
        ...(ownerId ? stryMutAct_9fa48("140229") ? {} : (stryCov_9fa48("140229"), {
          coalescingKey: stryMutAct_9fa48("140230") ? `` : (stryCov_9fa48("140230"), `replica-operation:${ownerId}`)
        }) : {})
      });
    }
  } /**
    * Resolve a session ID for an operation mutation.
    * @param {object} [options]
    * @param {number} [retryAttempt=0]
    * @return {string}
    */
  resolveOperationMutationSessionId(options = {}, retryAttempt = NUM.ZERO) {
    if (stryMutAct_9fa48("140231")) {
      {}
    } else {
      stryCov_9fa48("140231");
      if (stryMutAct_9fa48("140234") ? typeof options.sessionId === TYPEOF.STRING || options.sessionId.length > NUM.ZERO : stryMutAct_9fa48("140233") ? false : stryMutAct_9fa48("140232") ? true : (stryCov_9fa48("140232", "140233", "140234"), (stryMutAct_9fa48("140236") ? typeof options.sessionId !== TYPEOF.STRING : stryMutAct_9fa48("140235") ? true : (stryCov_9fa48("140235", "140236"), typeof options.sessionId === TYPEOF.STRING)) && (stryMutAct_9fa48("140239") ? options.sessionId.length <= NUM.ZERO : stryMutAct_9fa48("140238") ? options.sessionId.length >= NUM.ZERO : stryMutAct_9fa48("140237") ? true : (stryCov_9fa48("140237", "140238", "140239"), options.sessionId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140240")) {
          {}
        } else {
          stryCov_9fa48("140240");
          return options.sessionId;
        }
      }
      const ownerId = (stryMutAct_9fa48("140243") ? typeof options.ownerId === 'string' || options.ownerId.length > NUM.ZERO : stryMutAct_9fa48("140242") ? false : stryMutAct_9fa48("140241") ? true : (stryCov_9fa48("140241", "140242", "140243"), (stryMutAct_9fa48("140245") ? typeof options.ownerId !== 'string' : stryMutAct_9fa48("140244") ? true : (stryCov_9fa48("140244", "140245"), typeof options.ownerId === (stryMutAct_9fa48("140246") ? "" : (stryCov_9fa48("140246"), 'string')))) && (stryMutAct_9fa48("140249") ? options.ownerId.length <= NUM.ZERO : stryMutAct_9fa48("140248") ? options.ownerId.length >= NUM.ZERO : stryMutAct_9fa48("140247") ? true : (stryCov_9fa48("140247", "140248", "140249"), options.ownerId.length > NUM.ZERO)))) ? options.ownerId : uuidv4();
      const baseSessionId = stryMutAct_9fa48("140250") ? `` : (stryCov_9fa48("140250"), `${REBALANCER_SUBSYSTEM.COORDINATOR}:${ownerId}`);
      if (stryMutAct_9fa48("140254") ? retryAttempt > NUM.ZERO : stryMutAct_9fa48("140253") ? retryAttempt < NUM.ZERO : stryMutAct_9fa48("140252") ? false : stryMutAct_9fa48("140251") ? true : (stryCov_9fa48("140251", "140252", "140253", "140254"), retryAttempt <= NUM.ZERO)) {
        if (stryMutAct_9fa48("140255")) {
          {}
        } else {
          stryCov_9fa48("140255");
          return baseSessionId;
        }
      }
      return stryMutAct_9fa48("140256") ? `` : (stryCov_9fa48("140256"), `${baseSessionId}:retry${retryAttempt}`);
    }
  } /**
    * Extract the change count from a mutation result.
    * @param {object} result
    * @return {number|null}
    */
  extractMutationChangeCount(result) {
    if (stryMutAct_9fa48("140257")) {
      {}
    } else {
      stryCov_9fa48("140257");
      const candidate = Number(stryMutAct_9fa48("140258") ? (result?.changes ?? result?.affectedRows ?? result?.partitionResult?.changes) && result?.partitionResult?.affectedRows : (stryCov_9fa48("140258"), (stryMutAct_9fa48("140259") ? (result?.changes ?? result?.affectedRows) && result?.partitionResult?.changes : (stryCov_9fa48("140259"), (stryMutAct_9fa48("140260") ? result?.changes && result?.affectedRows : (stryCov_9fa48("140260"), (stryMutAct_9fa48("140261") ? result.changes : (stryCov_9fa48("140261"), result?.changes)) ?? (stryMutAct_9fa48("140262") ? result.affectedRows : (stryCov_9fa48("140262"), result?.affectedRows)))) ?? (stryMutAct_9fa48("140264") ? result.partitionResult?.changes : stryMutAct_9fa48("140263") ? result?.partitionResult.changes : (stryCov_9fa48("140263", "140264"), result?.partitionResult?.changes)))) ?? (stryMutAct_9fa48("140266") ? result.partitionResult?.affectedRows : stryMutAct_9fa48("140265") ? result?.partitionResult.affectedRows : (stryCov_9fa48("140265", "140266"), result?.partitionResult?.affectedRows))));
      return Number.isFinite(candidate) ? candidate : null;
    }
  } /**
    * @param {object} operation
    * @return {object}
    * @private
    */
  buildReplicaOperationRow(operation) {
    if (stryMutAct_9fa48("140267")) {
      {}
    } else {
      stryCov_9fa48("140267");
      return stryMutAct_9fa48("140268") ? {} : (stryCov_9fa48("140268"), {
        operation_id: operation.operationId,
        type: operation.type,
        partition_id: operation.partitionId,
        replica_id: operation.replicaId,
        source_node_id: operation.sourceNodeId,
        target_node_id: operation.targetNodeId,
        status: operation.status,
        workflow_step: operation.workflowStep,
        created_at: operation.createdAt,
        updated_at: operation.updatedAt,
        completed_at: operation.completedAt,
        error_message: operation.errorMessage,
        steps_history: JSON.stringify(operation.stepsHistory),
        entity_type: operation.entityType,
        entity_id: operation.entityId
      });
    }
  } /**
    * @param {object} operation
    * @return {object}
    * @private
    */
  buildReplicaOperationUpdateData(operation) {
    if (stryMutAct_9fa48("140269")) {
      {}
    } else {
      stryCov_9fa48("140269");
      return stryMutAct_9fa48("140270") ? {} : (stryCov_9fa48("140270"), {
        status: operation.status,
        workflow_step: operation.workflowStep,
        updated_at: operation.updatedAt,
        completed_at: operation.completedAt,
        error_message: operation.errorMessage,
        steps_history: JSON.stringify(operation.stepsHistory),
        replica_id: operation.replicaId
      });
    }
  } /**
    * @param {object} operation
    * @param {string|null} expectedWorkflowStep
    * @return {object}
    * @private
    */
  buildReplicaOperationUpdateWhereClause(operation, expectedWorkflowStep = null) {
    if (stryMutAct_9fa48("140271")) {
      {}
    } else {
      stryCov_9fa48("140271");
      const whereClause = stryMutAct_9fa48("140272") ? {} : (stryCov_9fa48("140272"), {
        operation_id: operation.operationId
      });
      if (stryMutAct_9fa48("140275") ? typeof expectedWorkflowStep === TYPEOF.STRING || expectedWorkflowStep.length > NUM.ZERO : stryMutAct_9fa48("140274") ? false : stryMutAct_9fa48("140273") ? true : (stryCov_9fa48("140273", "140274", "140275"), (stryMutAct_9fa48("140277") ? typeof expectedWorkflowStep !== TYPEOF.STRING : stryMutAct_9fa48("140276") ? true : (stryCov_9fa48("140276", "140277"), typeof expectedWorkflowStep === TYPEOF.STRING)) && (stryMutAct_9fa48("140280") ? expectedWorkflowStep.length <= NUM.ZERO : stryMutAct_9fa48("140279") ? expectedWorkflowStep.length >= NUM.ZERO : stryMutAct_9fa48("140278") ? true : (stryCov_9fa48("140278", "140279", "140280"), expectedWorkflowStep.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140281")) {
          {}
        } else {
          stryCov_9fa48("140281");
          whereClause.workflow_step = expectedWorkflowStep;
        }
      }
      return whereClause;
    }
  } /**
    * @param {object} operation
    * @param {string|null} expectedWorkflowStep
    * @return {Array}
    * @private
    */
  buildReplicaOperationUpdateParams(operation, expectedWorkflowStep = null) {
    if (stryMutAct_9fa48("140282")) {
      {}
    } else {
      stryCov_9fa48("140282");
      const params = stryMutAct_9fa48("140283") ? [] : (stryCov_9fa48("140283"), [operation.status, operation.workflowStep, operation.updatedAt, operation.completedAt, operation.errorMessage, JSON.stringify(operation.stepsHistory), operation.replicaId, operation.operationId]);
      if (stryMutAct_9fa48("140286") ? typeof expectedWorkflowStep === TYPEOF.STRING || expectedWorkflowStep.length > NUM.ZERO : stryMutAct_9fa48("140285") ? false : stryMutAct_9fa48("140284") ? true : (stryCov_9fa48("140284", "140285", "140286"), (stryMutAct_9fa48("140288") ? typeof expectedWorkflowStep !== TYPEOF.STRING : stryMutAct_9fa48("140287") ? true : (stryCov_9fa48("140287", "140288"), typeof expectedWorkflowStep === TYPEOF.STRING)) && (stryMutAct_9fa48("140291") ? expectedWorkflowStep.length <= NUM.ZERO : stryMutAct_9fa48("140290") ? expectedWorkflowStep.length >= NUM.ZERO : stryMutAct_9fa48("140289") ? true : (stryCov_9fa48("140289", "140290", "140291"), expectedWorkflowStep.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("140292")) {
          {}
        } else {
          stryCov_9fa48("140292");
          params.push(expectedWorkflowStep);
        }
      }
      return params;
    }
  } /**
    * Serialize replica operation transitions through a queue.
    * @param {Function} executionFactory
    * @return {Promise}
    */
  runReplicaOperationTransitionExclusive(executionFactory, options = {}) {
    if (stryMutAct_9fa48("140293")) {
      {}
    } else {
      stryCov_9fa48("140293");
      const lane = this.resolveReplicaOperationTransitionLane(options);
      const activeQueue = this.getReplicaOperationTransitionQueue(lane);
      const queuedExecution = activeQueue.catch(() => {}).then(stryMutAct_9fa48("140294") ? () => undefined : (stryCov_9fa48("140294"), async () => executionFactory()));
      this.replicaOperationTransitionQueues.set(lane, queuedExecution.catch(() => {}));
      return queuedExecution;
    }
  } /**
    * Resolve the transition lane for one replica operation mutation.
    * Priority control-plane partitions keep a dedicated progression lane so
    * unrelated ordinary replica_operations work cannot head-of-line block
    * the partitions that publish and repair control-plane recovery itself.
    * @param {Object} [options={}]
    * @return {string}
    * @private
    */
  resolveReplicaOperationTransitionLane(options = {}) {
    if (stryMutAct_9fa48("140295")) {
      {}
    } else {
      stryCov_9fa48("140295");
      const explicitLane = this.normalizeReplicaOperationTransitionLane(stryMutAct_9fa48("140298") ? options.transitionLane && options.lane : stryMutAct_9fa48("140297") ? false : stryMutAct_9fa48("140296") ? true : (stryCov_9fa48("140296", "140297", "140298"), options.transitionLane || options.lane));
      if (stryMutAct_9fa48("140300") ? false : stryMutAct_9fa48("140299") ? true : (stryCov_9fa48("140299", "140300"), explicitLane)) {
        if (stryMutAct_9fa48("140301")) {
          {}
        } else {
          stryCov_9fa48("140301");
          return explicitLane;
        }
      }
      const partitionClassificationInput = this.buildReplicaOperationTransitionPartitionClassificationInput(options);
      return isPriorityControlPlanePartition(partitionClassificationInput) ? REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY : REPLICA_OPERATION_TRANSITION_LANE.DEFAULT;
    }
  } /**
    * @param {string|null|undefined} lane
    * @return {string|null}
    * @private
    */
  normalizeReplicaOperationTransitionLane(lane) {
    if (stryMutAct_9fa48("140302")) {
      {}
    } else {
      stryCov_9fa48("140302");
      return (stryMutAct_9fa48("140305") ? lane !== REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY : stryMutAct_9fa48("140304") ? false : stryMutAct_9fa48("140303") ? true : (stryCov_9fa48("140303", "140304", "140305"), lane === REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY)) ? REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY : (stryMutAct_9fa48("140308") ? lane !== REPLICA_OPERATION_TRANSITION_LANE.DEFAULT : stryMutAct_9fa48("140307") ? false : stryMutAct_9fa48("140306") ? true : (stryCov_9fa48("140306", "140307", "140308"), lane === REPLICA_OPERATION_TRANSITION_LANE.DEFAULT)) ? REPLICA_OPERATION_TRANSITION_LANE.DEFAULT : null;
    }
  } /**
    * @param {Object} [options={}]
    * @return {Object}
    * @private
    */
  buildReplicaOperationTransitionPartitionClassificationInput(options = {}) {
    if (stryMutAct_9fa48("140309")) {
      {}
    } else {
      stryCov_9fa48("140309");
      const operation = options.operation;
      const partitionRow = (stryMutAct_9fa48("140312") ? options.partitionRow || typeof options.partitionRow === 'object' : stryMutAct_9fa48("140311") ? false : stryMutAct_9fa48("140310") ? true : (stryCov_9fa48("140310", "140311", "140312"), options.partitionRow && (stryMutAct_9fa48("140314") ? typeof options.partitionRow !== 'object' : stryMutAct_9fa48("140313") ? true : (stryCov_9fa48("140313", "140314"), typeof options.partitionRow === (stryMutAct_9fa48("140315") ? "" : (stryCov_9fa48("140315"), 'object')))))) ? options.partitionRow : (stryMutAct_9fa48("140318") ? operation?.partitionRow || typeof operation.partitionRow === 'object' : stryMutAct_9fa48("140317") ? false : stryMutAct_9fa48("140316") ? true : (stryCov_9fa48("140316", "140317", "140318"), (stryMutAct_9fa48("140319") ? operation.partitionRow : (stryCov_9fa48("140319"), operation?.partitionRow)) && (stryMutAct_9fa48("140321") ? typeof operation.partitionRow !== 'object' : stryMutAct_9fa48("140320") ? true : (stryCov_9fa48("140320", "140321"), typeof operation.partitionRow === (stryMutAct_9fa48("140322") ? "" : (stryCov_9fa48("140322"), 'object')))))) ? operation.partitionRow : null;
      const partitionIdCandidate = stryMutAct_9fa48("140323") ? (options.partitionId ?? operation?.partitionId ?? operation?.partition_id ?? partitionRow?.partition_id ?? partitionRow?.partitionId) && null : (stryCov_9fa48("140323"), (stryMutAct_9fa48("140324") ? (options.partitionId ?? operation?.partitionId ?? operation?.partition_id ?? partitionRow?.partition_id) && partitionRow?.partitionId : (stryCov_9fa48("140324"), (stryMutAct_9fa48("140325") ? (options.partitionId ?? operation?.partitionId ?? operation?.partition_id) && partitionRow?.partition_id : (stryCov_9fa48("140325"), (stryMutAct_9fa48("140326") ? (options.partitionId ?? operation?.partitionId) && operation?.partition_id : (stryCov_9fa48("140326"), (stryMutAct_9fa48("140327") ? options.partitionId && operation?.partitionId : (stryCov_9fa48("140327"), options.partitionId ?? (stryMutAct_9fa48("140328") ? operation.partitionId : (stryCov_9fa48("140328"), operation?.partitionId)))) ?? (stryMutAct_9fa48("140329") ? operation.partition_id : (stryCov_9fa48("140329"), operation?.partition_id)))) ?? (stryMutAct_9fa48("140330") ? partitionRow.partition_id : (stryCov_9fa48("140330"), partitionRow?.partition_id)))) ?? (stryMutAct_9fa48("140331") ? partitionRow.partitionId : (stryCov_9fa48("140331"), partitionRow?.partitionId)))) ?? null);
      const partitionId = (stryMutAct_9fa48("140334") ? typeof partitionIdCandidate !== 'string' : stryMutAct_9fa48("140333") ? false : stryMutAct_9fa48("140332") ? true : (stryCov_9fa48("140332", "140333", "140334"), typeof partitionIdCandidate === (stryMutAct_9fa48("140335") ? "" : (stryCov_9fa48("140335"), 'string')))) ? stryMutAct_9fa48("140336") ? partitionIdCandidate : (stryCov_9fa48("140336"), partitionIdCandidate.trim()) : null;
      return stryMutAct_9fa48("140337") ? {} : (stryCov_9fa48("140337"), {
        partitionId: (stryMutAct_9fa48("140340") ? partitionId || partitionId.length > NUM.ZERO : stryMutAct_9fa48("140339") ? false : stryMutAct_9fa48("140338") ? true : (stryCov_9fa48("140338", "140339", "140340"), partitionId && (stryMutAct_9fa48("140343") ? partitionId.length <= NUM.ZERO : stryMutAct_9fa48("140342") ? partitionId.length >= NUM.ZERO : stryMutAct_9fa48("140341") ? true : (stryCov_9fa48("140341", "140342", "140343"), partitionId.length > NUM.ZERO)))) ? partitionId : null,
        partitionRow
      });
    }
  } /**
    * @param {string} lane
    * @return {Promise<*>}
    * @private
    */
  getReplicaOperationTransitionQueue(lane) {
    if (stryMutAct_9fa48("140344")) {
      {}
    } else {
      stryCov_9fa48("140344");
      const normalizedLane = stryMutAct_9fa48("140347") ? this.normalizeReplicaOperationTransitionLane(lane) && REPLICA_OPERATION_TRANSITION_LANE.DEFAULT : stryMutAct_9fa48("140346") ? false : stryMutAct_9fa48("140345") ? true : (stryCov_9fa48("140345", "140346", "140347"), this.normalizeReplicaOperationTransitionLane(lane) || REPLICA_OPERATION_TRANSITION_LANE.DEFAULT);
      if (stryMutAct_9fa48("140350") ? false : stryMutAct_9fa48("140349") ? true : stryMutAct_9fa48("140348") ? this.replicaOperationTransitionQueues.has(normalizedLane) : (stryCov_9fa48("140348", "140349", "140350"), !this.replicaOperationTransitionQueues.has(normalizedLane))) {
        if (stryMutAct_9fa48("140351")) {
          {}
        } else {
          stryCov_9fa48("140351");
          this.replicaOperationTransitionQueues.set(normalizedLane, Promise.resolve());
        }
      }
      return this.replicaOperationTransitionQueues.get(normalizedLane);
    }
  } // ── Replica Status Observation ──────────────────────────────────
  /**
   * Normalize one observed services row into workflow replica lifecycle.
   *
   * Partition replicas that report `status=active` but still carry a learner
   * role are not fully operational for REPLACE progression yet; they remain in
   * the syncing phase until promotion.
   *
   * @param {Object} row
   * @return {string|null}
   */
  normalizeObservedReplicaLifecycle(row) {
    if (stryMutAct_9fa48("140352")) {
      {}
    } else {
      stryCov_9fa48("140352");
      const status = (stryMutAct_9fa48("140355") ? typeof row?.status === 'string' || row.status.length > NUM.ZERO : stryMutAct_9fa48("140354") ? false : stryMutAct_9fa48("140353") ? true : (stryCov_9fa48("140353", "140354", "140355"), (stryMutAct_9fa48("140357") ? typeof row?.status !== 'string' : stryMutAct_9fa48("140356") ? true : (stryCov_9fa48("140356", "140357"), typeof (stryMutAct_9fa48("140358") ? row.status : (stryCov_9fa48("140358"), row?.status)) === (stryMutAct_9fa48("140359") ? "" : (stryCov_9fa48("140359"), 'string')))) && (stryMutAct_9fa48("140362") ? row.status.length <= NUM.ZERO : stryMutAct_9fa48("140361") ? row.status.length >= NUM.ZERO : stryMutAct_9fa48("140360") ? true : (stryCov_9fa48("140360", "140361", "140362"), row.status.length > NUM.ZERO)))) ? stryMutAct_9fa48("140363") ? row.status.toUpperCase() : (stryCov_9fa48("140363"), row.status.toLowerCase()) : null;
      if (stryMutAct_9fa48("140366") ? false : stryMutAct_9fa48("140365") ? true : stryMutAct_9fa48("140364") ? status : (stryCov_9fa48("140364", "140365", "140366"), !status)) {
        if (stryMutAct_9fa48("140367")) {
          {}
        } else {
          stryCov_9fa48("140367");
          return null;
        }
      }
      if (stryMutAct_9fa48("140370") ? status === ReplicaStatus.ACTIVE : stryMutAct_9fa48("140369") ? false : stryMutAct_9fa48("140368") ? true : (stryCov_9fa48("140368", "140369", "140370"), status !== ReplicaStatus.ACTIVE)) {
        if (stryMutAct_9fa48("140371")) {
          {}
        } else {
          stryCov_9fa48("140371");
          return status;
        }
      }
      const serviceType = (stryMutAct_9fa48("140374") ? typeof row?.service_type !== 'string' : stryMutAct_9fa48("140373") ? false : stryMutAct_9fa48("140372") ? true : (stryCov_9fa48("140372", "140373", "140374"), typeof (stryMutAct_9fa48("140375") ? row.service_type : (stryCov_9fa48("140375"), row?.service_type)) === (stryMutAct_9fa48("140376") ? "" : (stryCov_9fa48("140376"), 'string')))) ? stryMutAct_9fa48("140377") ? row.service_type.toUpperCase() : (stryCov_9fa48("140377"), row.service_type.toLowerCase()) : (stryMutAct_9fa48("140380") ? typeof row?.serviceType !== 'string' : stryMutAct_9fa48("140379") ? false : stryMutAct_9fa48("140378") ? true : (stryCov_9fa48("140378", "140379", "140380"), typeof (stryMutAct_9fa48("140381") ? row.serviceType : (stryCov_9fa48("140381"), row?.serviceType)) === (stryMutAct_9fa48("140382") ? "" : (stryCov_9fa48("140382"), 'string')))) ? stryMutAct_9fa48("140383") ? row.serviceType.toUpperCase() : (stryCov_9fa48("140383"), row.serviceType.toLowerCase()) : null;
      if (stryMutAct_9fa48("140386") ? serviceType === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("140385") ? false : stryMutAct_9fa48("140384") ? true : (stryCov_9fa48("140384", "140385", "140386"), serviceType !== SERVICE_TYPE.PARTITION)) {
        if (stryMutAct_9fa48("140387")) {
          {}
        } else {
          stryCov_9fa48("140387");
          return status;
        }
      }
      const raftRole = (stryMutAct_9fa48("140390") ? typeof row?.raft_role !== 'string' : stryMutAct_9fa48("140389") ? false : stryMutAct_9fa48("140388") ? true : (stryCov_9fa48("140388", "140389", "140390"), typeof (stryMutAct_9fa48("140391") ? row.raft_role : (stryCov_9fa48("140391"), row?.raft_role)) === (stryMutAct_9fa48("140392") ? "" : (stryCov_9fa48("140392"), 'string')))) ? stryMutAct_9fa48("140393") ? row.raft_role.toUpperCase() : (stryCov_9fa48("140393"), row.raft_role.toLowerCase()) : (stryMutAct_9fa48("140396") ? typeof row?.raftRole !== 'string' : stryMutAct_9fa48("140395") ? false : stryMutAct_9fa48("140394") ? true : (stryCov_9fa48("140394", "140395", "140396"), typeof (stryMutAct_9fa48("140397") ? row.raftRole : (stryCov_9fa48("140397"), row?.raftRole)) === (stryMutAct_9fa48("140398") ? "" : (stryCov_9fa48("140398"), 'string')))) ? stryMutAct_9fa48("140399") ? row.raftRole.toUpperCase() : (stryCov_9fa48("140399"), row.raftRole.toLowerCase()) : null;
      if (stryMutAct_9fa48("140402") ? !raftRole && raftRole === RAFT_ROLE.LEARNER : stryMutAct_9fa48("140401") ? false : stryMutAct_9fa48("140400") ? true : (stryCov_9fa48("140400", "140401", "140402"), (stryMutAct_9fa48("140403") ? raftRole : (stryCov_9fa48("140403"), !raftRole)) || (stryMutAct_9fa48("140405") ? raftRole !== RAFT_ROLE.LEARNER : stryMutAct_9fa48("140404") ? false : (stryCov_9fa48("140404", "140405"), raftRole === RAFT_ROLE.LEARNER)))) {
        if (stryMutAct_9fa48("140406")) {
          {}
        } else {
          stryCov_9fa48("140406");
          return ReplicaStatus.SYNCING;
        }
      }
      return status;
    }
  } /**
    * Get one observed replica row from cache.
    * @param {string} replicaId
    * @param {string} partitionId
    * @param {string} targetNodeId
    * @return {Object|null}
    */
  getObservedReplicaRowFromCache(replicaId, partitionId, targetNodeId) {
    if (stryMutAct_9fa48("140407")) {
      {}
    } else {
      stryCov_9fa48("140407");
      if (stryMutAct_9fa48("140410") ? false : stryMutAct_9fa48("140409") ? true : stryMutAct_9fa48("140408") ? this.systemTableCache : (stryCov_9fa48("140408", "140409", "140410"), !this.systemTableCache)) {
        if (stryMutAct_9fa48("140411")) {
          {}
        } else {
          stryCov_9fa48("140411");
          return null;
        }
      }
      const normalizedReplicaId = (stryMutAct_9fa48("140414") ? typeof replicaId !== 'string' : stryMutAct_9fa48("140413") ? false : stryMutAct_9fa48("140412") ? true : (stryCov_9fa48("140412", "140413", "140414"), typeof replicaId === (stryMutAct_9fa48("140415") ? "" : (stryCov_9fa48("140415"), 'string')))) ? replicaId : stryMutAct_9fa48("140416") ? "Stryker was here!" : (stryCov_9fa48("140416"), '');
      const normalizedPartitionId = (stryMutAct_9fa48("140419") ? typeof partitionId !== 'string' : stryMutAct_9fa48("140418") ? false : stryMutAct_9fa48("140417") ? true : (stryCov_9fa48("140417", "140418", "140419"), typeof partitionId === (stryMutAct_9fa48("140420") ? "" : (stryCov_9fa48("140420"), 'string')))) ? partitionId : stryMutAct_9fa48("140421") ? "Stryker was here!" : (stryCov_9fa48("140421"), '');
      const normalizedTargetNodeId = (stryMutAct_9fa48("140424") ? typeof targetNodeId !== 'string' : stryMutAct_9fa48("140423") ? false : stryMutAct_9fa48("140422") ? true : (stryCov_9fa48("140422", "140423", "140424"), typeof targetNodeId === (stryMutAct_9fa48("140425") ? "" : (stryCov_9fa48("140425"), 'string')))) ? targetNodeId : stryMutAct_9fa48("140426") ? "Stryker was here!" : (stryCov_9fa48("140426"), '');
      const rowMatchesTarget = row => {
        if (stryMutAct_9fa48("140427")) {
          {}
        } else {
          stryCov_9fa48("140427");
          if (stryMutAct_9fa48("140430") ? !row && typeof row !== 'object' : stryMutAct_9fa48("140429") ? false : stryMutAct_9fa48("140428") ? true : (stryCov_9fa48("140428", "140429", "140430"), (stryMutAct_9fa48("140431") ? row : (stryCov_9fa48("140431"), !row)) || (stryMutAct_9fa48("140433") ? typeof row === 'object' : stryMutAct_9fa48("140432") ? false : (stryCov_9fa48("140432", "140433"), typeof row !== (stryMutAct_9fa48("140434") ? "" : (stryCov_9fa48("140434"), 'object')))))) {
            if (stryMutAct_9fa48("140435")) {
              {}
            } else {
              stryCov_9fa48("140435");
              return stryMutAct_9fa48("140436") ? true : (stryCov_9fa48("140436"), false);
            }
          }
          const rowNodeId = String(stryMutAct_9fa48("140439") ? (row.node_id || row.nodeId) && '' : stryMutAct_9fa48("140438") ? false : stryMutAct_9fa48("140437") ? true : (stryCov_9fa48("140437", "140438", "140439"), (stryMutAct_9fa48("140441") ? row.node_id && row.nodeId : stryMutAct_9fa48("140440") ? false : (stryCov_9fa48("140440", "140441"), row.node_id || row.nodeId)) || (stryMutAct_9fa48("140442") ? "Stryker was here!" : (stryCov_9fa48("140442"), ''))));
          if (stryMutAct_9fa48("140445") ? normalizedTargetNodeId.length > NUM.ZERO && rowNodeId.length > NUM.ZERO || rowNodeId !== normalizedTargetNodeId : stryMutAct_9fa48("140444") ? false : stryMutAct_9fa48("140443") ? true : (stryCov_9fa48("140443", "140444", "140445"), (stryMutAct_9fa48("140447") ? normalizedTargetNodeId.length > NUM.ZERO || rowNodeId.length > NUM.ZERO : stryMutAct_9fa48("140446") ? true : (stryCov_9fa48("140446", "140447"), (stryMutAct_9fa48("140450") ? normalizedTargetNodeId.length <= NUM.ZERO : stryMutAct_9fa48("140449") ? normalizedTargetNodeId.length >= NUM.ZERO : stryMutAct_9fa48("140448") ? true : (stryCov_9fa48("140448", "140449", "140450"), normalizedTargetNodeId.length > NUM.ZERO)) && (stryMutAct_9fa48("140453") ? rowNodeId.length <= NUM.ZERO : stryMutAct_9fa48("140452") ? rowNodeId.length >= NUM.ZERO : stryMutAct_9fa48("140451") ? true : (stryCov_9fa48("140451", "140452", "140453"), rowNodeId.length > NUM.ZERO)))) && (stryMutAct_9fa48("140455") ? rowNodeId === normalizedTargetNodeId : stryMutAct_9fa48("140454") ? true : (stryCov_9fa48("140454", "140455"), rowNodeId !== normalizedTargetNodeId)))) {
            if (stryMutAct_9fa48("140456")) {
              {}
            } else {
              stryCov_9fa48("140456");
              return stryMutAct_9fa48("140457") ? true : (stryCov_9fa48("140457"), false);
            }
          }
          const rowPartitionId = String(stryMutAct_9fa48("140460") ? (row.partition_id || row.partitionId) && '' : stryMutAct_9fa48("140459") ? false : stryMutAct_9fa48("140458") ? true : (stryCov_9fa48("140458", "140459", "140460"), (stryMutAct_9fa48("140462") ? row.partition_id && row.partitionId : stryMutAct_9fa48("140461") ? false : (stryCov_9fa48("140461", "140462"), row.partition_id || row.partitionId)) || (stryMutAct_9fa48("140463") ? "Stryker was here!" : (stryCov_9fa48("140463"), ''))));
          if (stryMutAct_9fa48("140466") ? normalizedPartitionId.length > NUM.ZERO && rowPartitionId.length > NUM.ZERO || rowPartitionId !== normalizedPartitionId : stryMutAct_9fa48("140465") ? false : stryMutAct_9fa48("140464") ? true : (stryCov_9fa48("140464", "140465", "140466"), (stryMutAct_9fa48("140468") ? normalizedPartitionId.length > NUM.ZERO || rowPartitionId.length > NUM.ZERO : stryMutAct_9fa48("140467") ? true : (stryCov_9fa48("140467", "140468"), (stryMutAct_9fa48("140471") ? normalizedPartitionId.length <= NUM.ZERO : stryMutAct_9fa48("140470") ? normalizedPartitionId.length >= NUM.ZERO : stryMutAct_9fa48("140469") ? true : (stryCov_9fa48("140469", "140470", "140471"), normalizedPartitionId.length > NUM.ZERO)) && (stryMutAct_9fa48("140474") ? rowPartitionId.length <= NUM.ZERO : stryMutAct_9fa48("140473") ? rowPartitionId.length >= NUM.ZERO : stryMutAct_9fa48("140472") ? true : (stryCov_9fa48("140472", "140473", "140474"), rowPartitionId.length > NUM.ZERO)))) && (stryMutAct_9fa48("140476") ? rowPartitionId === normalizedPartitionId : stryMutAct_9fa48("140475") ? true : (stryCov_9fa48("140475", "140476"), rowPartitionId !== normalizedPartitionId)))) {
            if (stryMutAct_9fa48("140477")) {
              {}
            } else {
              stryCov_9fa48("140477");
              return stryMutAct_9fa48("140478") ? true : (stryCov_9fa48("140478"), false);
            }
          }
          return stryMutAct_9fa48("140479") ? false : (stryCov_9fa48("140479"), true);
        }
      };
      const readAllServiceRows = () => {
        if (stryMutAct_9fa48("140480")) {
          {}
        } else {
          stryCov_9fa48("140480");
          if (stryMutAct_9fa48("140483") ? typeof this.systemTableCache.getAll !== 'function' : stryMutAct_9fa48("140482") ? false : stryMutAct_9fa48("140481") ? true : (stryCov_9fa48("140481", "140482", "140483"), typeof this.systemTableCache.getAll === (stryMutAct_9fa48("140484") ? "" : (stryCov_9fa48("140484"), 'function')))) {
            if (stryMutAct_9fa48("140485")) {
              {}
            } else {
              stryCov_9fa48("140485");
              return stryMutAct_9fa48("140488") ? this.systemTableCache.getAll(SYSTEM_TABLE_NAME.SERVICES) && [] : stryMutAct_9fa48("140487") ? false : stryMutAct_9fa48("140486") ? true : (stryCov_9fa48("140486", "140487", "140488"), this.systemTableCache.getAll(SYSTEM_TABLE_NAME.SERVICES) || (stryMutAct_9fa48("140489") ? ["Stryker was here"] : (stryCov_9fa48("140489"), [])));
            }
          }
          if (stryMutAct_9fa48("140492") ? typeof this.systemTableCache.filter !== 'function' : stryMutAct_9fa48("140491") ? false : stryMutAct_9fa48("140490") ? true : (stryCov_9fa48("140490", "140491", "140492"), typeof this.systemTableCache.filter === (stryMutAct_9fa48("140493") ? "" : (stryCov_9fa48("140493"), 'function')))) {
            if (stryMutAct_9fa48("140494")) {
              {}
            } else {
              stryCov_9fa48("140494");
              return stryMutAct_9fa48("140497") ? this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, () => true) && [] : stryMutAct_9fa48("140496") ? false : stryMutAct_9fa48("140495") ? true : (stryCov_9fa48("140495", "140496", "140497"), (stryMutAct_9fa48("140498") ? this.systemTableCache : (stryCov_9fa48("140498"), this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, stryMutAct_9fa48("140499") ? () => undefined : (stryCov_9fa48("140499"), () => stryMutAct_9fa48("140500") ? false : (stryCov_9fa48("140500"), true))))) || (stryMutAct_9fa48("140501") ? ["Stryker was here"] : (stryCov_9fa48("140501"), [])));
            }
          }
          return stryMutAct_9fa48("140502") ? ["Stryker was here"] : (stryCov_9fa48("140502"), []);
        }
      };
      if (stryMutAct_9fa48("140505") ? normalizedReplicaId.length > NUM.ZERO || typeof this.systemTableCache.get === TYPEOF.FUNCTION : stryMutAct_9fa48("140504") ? false : stryMutAct_9fa48("140503") ? true : (stryCov_9fa48("140503", "140504", "140505"), (stryMutAct_9fa48("140508") ? normalizedReplicaId.length <= NUM.ZERO : stryMutAct_9fa48("140507") ? normalizedReplicaId.length >= NUM.ZERO : stryMutAct_9fa48("140506") ? true : (stryCov_9fa48("140506", "140507", "140508"), normalizedReplicaId.length > NUM.ZERO)) && (stryMutAct_9fa48("140510") ? typeof this.systemTableCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("140509") ? true : (stryCov_9fa48("140509", "140510"), typeof this.systemTableCache.get === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("140511")) {
          {}
        } else {
          stryCov_9fa48("140511");
          const cachedRow = this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICES, normalizedReplicaId);
          if (stryMutAct_9fa48("140513") ? false : stryMutAct_9fa48("140512") ? true : (stryCov_9fa48("140512", "140513"), rowMatchesTarget(cachedRow))) {
            if (stryMutAct_9fa48("140514")) {
              {}
            } else {
              stryCov_9fa48("140514");
              return cachedRow;
            }
          }
        }
      }
      const serviceRows = readAllServiceRows();
      if (stryMutAct_9fa48("140518") ? normalizedReplicaId.length <= NUM.ZERO : stryMutAct_9fa48("140517") ? normalizedReplicaId.length >= NUM.ZERO : stryMutAct_9fa48("140516") ? false : stryMutAct_9fa48("140515") ? true : (stryCov_9fa48("140515", "140516", "140517", "140518"), normalizedReplicaId.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("140519")) {
          {}
        } else {
          stryCov_9fa48("140519");
          const exactReplicaRow = serviceRows.find(row => {
            if (stryMutAct_9fa48("140520")) {
              {}
            } else {
              stryCov_9fa48("140520");
              const rowReplicaId = String(stryMutAct_9fa48("140523") ? (row?.service_id || row?.serviceId || row?.replica_id || row?.replicaId) && '' : stryMutAct_9fa48("140522") ? false : stryMutAct_9fa48("140521") ? true : (stryCov_9fa48("140521", "140522", "140523"), (stryMutAct_9fa48("140525") ? (row?.service_id || row?.serviceId || row?.replica_id) && row?.replicaId : stryMutAct_9fa48("140524") ? false : (stryCov_9fa48("140524", "140525"), (stryMutAct_9fa48("140527") ? (row?.service_id || row?.serviceId) && row?.replica_id : stryMutAct_9fa48("140526") ? false : (stryCov_9fa48("140526", "140527"), (stryMutAct_9fa48("140529") ? row?.service_id && row?.serviceId : stryMutAct_9fa48("140528") ? false : (stryCov_9fa48("140528", "140529"), (stryMutAct_9fa48("140530") ? row.service_id : (stryCov_9fa48("140530"), row?.service_id)) || (stryMutAct_9fa48("140531") ? row.serviceId : (stryCov_9fa48("140531"), row?.serviceId)))) || (stryMutAct_9fa48("140532") ? row.replica_id : (stryCov_9fa48("140532"), row?.replica_id)))) || (stryMutAct_9fa48("140533") ? row.replicaId : (stryCov_9fa48("140533"), row?.replicaId)))) || (stryMutAct_9fa48("140534") ? "Stryker was here!" : (stryCov_9fa48("140534"), ''))));
              return stryMutAct_9fa48("140537") ? rowReplicaId === normalizedReplicaId || rowMatchesTarget(row) : stryMutAct_9fa48("140536") ? false : stryMutAct_9fa48("140535") ? true : (stryCov_9fa48("140535", "140536", "140537"), (stryMutAct_9fa48("140539") ? rowReplicaId !== normalizedReplicaId : stryMutAct_9fa48("140538") ? true : (stryCov_9fa48("140538", "140539"), rowReplicaId === normalizedReplicaId)) && rowMatchesTarget(row));
            }
          });
          if (stryMutAct_9fa48("140541") ? false : stryMutAct_9fa48("140540") ? true : (stryCov_9fa48("140540", "140541"), exactReplicaRow)) {
            if (stryMutAct_9fa48("140542")) {
              {}
            } else {
              stryCov_9fa48("140542");
              return exactReplicaRow;
            }
          }
        }
      }
      return stryMutAct_9fa48("140545") ? serviceRows.find(row => {
        const rowNodeId = String(row?.node_id || row?.nodeId || '');
        const rowPartitionId = String(row?.partition_id || row?.partitionId || '');
        return rowNodeId === normalizedTargetNodeId && rowPartitionId === normalizedPartitionId;
      }) && null : stryMutAct_9fa48("140544") ? false : stryMutAct_9fa48("140543") ? true : (stryCov_9fa48("140543", "140544", "140545"), serviceRows.find(row => {
        if (stryMutAct_9fa48("140546")) {
          {}
        } else {
          stryCov_9fa48("140546");
          const rowNodeId = String(stryMutAct_9fa48("140549") ? (row?.node_id || row?.nodeId) && '' : stryMutAct_9fa48("140548") ? false : stryMutAct_9fa48("140547") ? true : (stryCov_9fa48("140547", "140548", "140549"), (stryMutAct_9fa48("140551") ? row?.node_id && row?.nodeId : stryMutAct_9fa48("140550") ? false : (stryCov_9fa48("140550", "140551"), (stryMutAct_9fa48("140552") ? row.node_id : (stryCov_9fa48("140552"), row?.node_id)) || (stryMutAct_9fa48("140553") ? row.nodeId : (stryCov_9fa48("140553"), row?.nodeId)))) || (stryMutAct_9fa48("140554") ? "Stryker was here!" : (stryCov_9fa48("140554"), ''))));
          const rowPartitionId = String(stryMutAct_9fa48("140557") ? (row?.partition_id || row?.partitionId) && '' : stryMutAct_9fa48("140556") ? false : stryMutAct_9fa48("140555") ? true : (stryCov_9fa48("140555", "140556", "140557"), (stryMutAct_9fa48("140559") ? row?.partition_id && row?.partitionId : stryMutAct_9fa48("140558") ? false : (stryCov_9fa48("140558", "140559"), (stryMutAct_9fa48("140560") ? row.partition_id : (stryCov_9fa48("140560"), row?.partition_id)) || (stryMutAct_9fa48("140561") ? row.partitionId : (stryCov_9fa48("140561"), row?.partitionId)))) || (stryMutAct_9fa48("140562") ? "Stryker was here!" : (stryCov_9fa48("140562"), ''))));
          return stryMutAct_9fa48("140565") ? rowNodeId === normalizedTargetNodeId || rowPartitionId === normalizedPartitionId : stryMutAct_9fa48("140564") ? false : stryMutAct_9fa48("140563") ? true : (stryCov_9fa48("140563", "140564", "140565"), (stryMutAct_9fa48("140567") ? rowNodeId !== normalizedTargetNodeId : stryMutAct_9fa48("140566") ? true : (stryCov_9fa48("140566", "140567"), rowNodeId === normalizedTargetNodeId)) && (stryMutAct_9fa48("140569") ? rowPartitionId !== normalizedPartitionId : stryMutAct_9fa48("140568") ? true : (stryCov_9fa48("140568", "140569"), rowPartitionId === normalizedPartitionId)));
        }
      }) || null);
    }
  } /**
    * Get observed replica status from cache.
    * @param {string} replicaId
    * @param {string} partitionId
    * @param {string} targetNodeId
    * @return {string|null}
    */
  getObservedReplicaStatusFromCache(replicaId, partitionId, targetNodeId) {
    if (stryMutAct_9fa48("140570")) {
      {}
    } else {
      stryCov_9fa48("140570");
      return this.normalizeObservedReplicaLifecycle(this.getObservedReplicaRowFromCache(replicaId, partitionId, targetNodeId));
    }
  } /**
    * Get authoritative replica status via SQL, with cache
    * fallback for degraded conditions.
    * @param {string} replicaId
    * @param {string} partitionId
    * @param {string} targetNodeId
    * @return {Promise<Object>}
    */
  async getActualReplicaObservation(replicaId, partitionId, targetNodeId) {
    if (stryMutAct_9fa48("140571")) {
      {}
    } else {
      stryCov_9fa48("140571");
      let observedRow = null;
      let authoritativeReadAttempted = stryMutAct_9fa48("140572") ? true : (stryCov_9fa48("140572"), false);
      let authoritativeReadFailed = stryMutAct_9fa48("140573") ? true : (stryCov_9fa48("140573"), false);
      const recordAuthoritativeResult = result => {
        if (stryMutAct_9fa48("140574")) {
          {}
        } else {
          stryCov_9fa48("140574");
          if (stryMutAct_9fa48("140577") ? !result && typeof result !== 'object' : stryMutAct_9fa48("140576") ? false : stryMutAct_9fa48("140575") ? true : (stryCov_9fa48("140575", "140576", "140577"), (stryMutAct_9fa48("140578") ? result : (stryCov_9fa48("140578"), !result)) || (stryMutAct_9fa48("140580") ? typeof result === 'object' : stryMutAct_9fa48("140579") ? false : (stryCov_9fa48("140579", "140580"), typeof result !== (stryMutAct_9fa48("140581") ? "" : (stryCov_9fa48("140581"), 'object')))))) {
            if (stryMutAct_9fa48("140582")) {
              {}
            } else {
              stryCov_9fa48("140582");
              return;
            }
          }
          authoritativeReadAttempted = stryMutAct_9fa48("140583") ? false : (stryCov_9fa48("140583"), true);
          if (stryMutAct_9fa48("140586") ? result.success === true : stryMutAct_9fa48("140585") ? false : stryMutAct_9fa48("140584") ? true : (stryCov_9fa48("140584", "140585", "140586"), result.success !== (stryMutAct_9fa48("140587") ? false : (stryCov_9fa48("140587"), true)))) {
            if (stryMutAct_9fa48("140588")) {
              {}
            } else {
              stryCov_9fa48("140588");
              authoritativeReadFailed = stryMutAct_9fa48("140589") ? false : (stryCov_9fa48("140589"), true);
              return;
            }
          }
          if (stryMutAct_9fa48("140592") ? Array.isArray(result.rows) || result.rows.length > NUM.ZERO : stryMutAct_9fa48("140591") ? false : stryMutAct_9fa48("140590") ? true : (stryCov_9fa48("140590", "140591", "140592"), Array.isArray(result.rows) && (stryMutAct_9fa48("140595") ? result.rows.length <= NUM.ZERO : stryMutAct_9fa48("140594") ? result.rows.length >= NUM.ZERO : stryMutAct_9fa48("140593") ? true : (stryCov_9fa48("140593", "140594", "140595"), result.rows.length > NUM.ZERO)))) {
            if (stryMutAct_9fa48("140596")) {
              {}
            } else {
              stryCov_9fa48("140596");
              observedRow = result.rows[NUM.ZERO];
            }
          }
        }
      };
      if (stryMutAct_9fa48("140598") ? false : stryMutAct_9fa48("140597") ? true : (stryCov_9fa48("140597", "140598"), replicaId)) {
        if (stryMutAct_9fa48("140599")) {
          {}
        } else {
          stryCov_9fa48("140599");
          const result = await readAuthoritativeControlPlaneRows(this.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.SERVICES, SQL.SELECT_REPLICA_STATUS, stryMutAct_9fa48("140600") ? [] : (stryCov_9fa48("140600"), [replicaId]), REPLICA_STATUS_READ_QUERY_OPTIONS);
          recordAuthoritativeResult(result);
        }
      }
      if (stryMutAct_9fa48("140603") ? false : stryMutAct_9fa48("140602") ? true : stryMutAct_9fa48("140601") ? observedRow : (stryCov_9fa48("140601", "140602", "140603"), !observedRow)) {
        if (stryMutAct_9fa48("140604")) {
          {}
        } else {
          stryCov_9fa48("140604");
          // Secondary lookup by partition + node when replicaId
          // yields no row
          const result = await readAuthoritativeControlPlaneRows(this.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.SERVICES, SQL.SELECT_REPLICA_BY_PARTITION_NODE, stryMutAct_9fa48("140605") ? [] : (stryCov_9fa48("140605"), [partitionId, targetNodeId]), REPLICA_STATUS_READ_QUERY_OPTIONS);
          recordAuthoritativeResult(result);
        }
      }
      if (stryMutAct_9fa48("140608") ? !observedRow || !authoritativeReadAttempted || authoritativeReadFailed : stryMutAct_9fa48("140607") ? false : stryMutAct_9fa48("140606") ? true : (stryCov_9fa48("140606", "140607", "140608"), (stryMutAct_9fa48("140609") ? observedRow : (stryCov_9fa48("140609"), !observedRow)) && (stryMutAct_9fa48("140611") ? !authoritativeReadAttempted && authoritativeReadFailed : stryMutAct_9fa48("140610") ? true : (stryCov_9fa48("140610", "140611"), (stryMutAct_9fa48("140612") ? authoritativeReadAttempted : (stryCov_9fa48("140612"), !authoritativeReadAttempted)) || authoritativeReadFailed)))) {
        if (stryMutAct_9fa48("140613")) {
          {}
        } else {
          stryCov_9fa48("140613");
          observedRow = this.getObservedReplicaRowFromCache(replicaId, partitionId, targetNodeId);
          if (stryMutAct_9fa48("140615") ? false : stryMutAct_9fa48("140614") ? true : (stryCov_9fa48("140614", "140615"), observedRow)) {
            if (stryMutAct_9fa48("140616")) {
              {}
            } else {
              stryCov_9fa48("140616");
              return Object.freeze(stryMutAct_9fa48("140617") ? {} : (stryCov_9fa48("140617"), {
                state: REPLICA_OPERATION_REPOSITORY_LITERAL.OBSERVED,
                source: (stryMutAct_9fa48("140620") ? authoritativeReadFailed !== true : stryMutAct_9fa48("140619") ? false : stryMutAct_9fa48("140618") ? true : (stryCov_9fa48("140618", "140619", "140620"), authoritativeReadFailed === (stryMutAct_9fa48("140621") ? false : (stryCov_9fa48("140621"), true)))) ? REPLICA_OPERATION_REPOSITORY_LITERAL.CACHE_FALLBACK_AFTER_AUTHORITATIVE_FAILURE : REPLICA_OPERATION_REPOSITORY_LITERAL.CACHE,
                lifecycleStatus: this.normalizeObservedReplicaLifecycle(observedRow)
              }));
            }
          }
        }
      }
      if (stryMutAct_9fa48("140623") ? false : stryMutAct_9fa48("140622") ? true : (stryCov_9fa48("140622", "140623"), observedRow)) {
        if (stryMutAct_9fa48("140624")) {
          {}
        } else {
          stryCov_9fa48("140624");
          return Object.freeze(stryMutAct_9fa48("140625") ? {} : (stryCov_9fa48("140625"), {
            state: REPLICA_OPERATION_REPOSITORY_LITERAL.OBSERVED,
            source: REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE,
            lifecycleStatus: this.normalizeObservedReplicaLifecycle(observedRow)
          }));
        }
      }
      return Object.freeze(stryMutAct_9fa48("140626") ? {} : (stryCov_9fa48("140626"), {
        state: (stryMutAct_9fa48("140629") ? authoritativeReadAttempted !== true : stryMutAct_9fa48("140628") ? false : stryMutAct_9fa48("140627") ? true : (stryCov_9fa48("140627", "140628", "140629"), authoritativeReadAttempted === (stryMutAct_9fa48("140630") ? false : (stryCov_9fa48("140630"), true)))) ? REPLICA_OPERATION_REPOSITORY_LITERAL.ABSENT : REPLICA_OPERATION_REPOSITORY_LITERAL.UNAVAILABLE,
        source: (stryMutAct_9fa48("140633") ? authoritativeReadAttempted !== true : stryMutAct_9fa48("140632") ? false : stryMutAct_9fa48("140631") ? true : (stryCov_9fa48("140631", "140632", "140633"), authoritativeReadAttempted === (stryMutAct_9fa48("140634") ? false : (stryCov_9fa48("140634"), true)))) ? REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE : REPLICA_OPERATION_REPOSITORY_LITERAL.UNAVAILABLE
      }));
    }
  } /**
    * Get authoritative replica status via SQL, with cache
    * fallback for degraded conditions.
    * @param {string} replicaId
    * @param {string} partitionId
    * @param {string} targetNodeId
    * @return {Promise<string|null>}
    */
  async getActualReplicaStatus(replicaId, partitionId, targetNodeId) {
    if (stryMutAct_9fa48("140635")) {
      {}
    } else {
      stryCov_9fa48("140635");
      const observation = await this.getActualReplicaObservation(replicaId, partitionId, targetNodeId);
      return (stryMutAct_9fa48("140638") ? observation.state !== REPLICA_OPERATION_REPOSITORY_LITERAL.OBSERVED : stryMutAct_9fa48("140637") ? false : stryMutAct_9fa48("140636") ? true : (stryCov_9fa48("140636", "140637", "140638"), observation.state === REPLICA_OPERATION_REPOSITORY_LITERAL.OBSERVED)) ? observation.lifecycleStatus : null;
    }
  } /**
    * Emit a read-model divergence event when cache and
    * authoritative status disagree.
    * @param {string} replicaId
    * @param {string} authoritativeStatus
    * @param {string} reason
    */
  emitReplicaStatusDivergence(replicaId, authoritativeStatus, reason) {
    if (stryMutAct_9fa48("140639")) {
      {}
    } else {
      stryCov_9fa48("140639");
      if (stryMutAct_9fa48("140642") ? (!replicaId || !this.systemTableCache) && typeof this.systemTableCache.get !== TYPEOF.FUNCTION : stryMutAct_9fa48("140641") ? false : stryMutAct_9fa48("140640") ? true : (stryCov_9fa48("140640", "140641", "140642"), (stryMutAct_9fa48("140644") ? !replicaId && !this.systemTableCache : stryMutAct_9fa48("140643") ? false : (stryCov_9fa48("140643", "140644"), (stryMutAct_9fa48("140645") ? replicaId : (stryCov_9fa48("140645"), !replicaId)) || (stryMutAct_9fa48("140646") ? this.systemTableCache : (stryCov_9fa48("140646"), !this.systemTableCache)))) || (stryMutAct_9fa48("140648") ? typeof this.systemTableCache.get === TYPEOF.FUNCTION : stryMutAct_9fa48("140647") ? false : (stryCov_9fa48("140647", "140648"), typeof this.systemTableCache.get !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("140649")) {
          {}
        } else {
          stryCov_9fa48("140649");
          return;
        }
      }
      const cachedRow = this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      const cachedStatus = stryMutAct_9fa48("140652") ? cachedRow?.status && null : stryMutAct_9fa48("140651") ? false : stryMutAct_9fa48("140650") ? true : (stryCov_9fa48("140650", "140651", "140652"), (stryMutAct_9fa48("140653") ? cachedRow.status : (stryCov_9fa48("140653"), cachedRow?.status)) || null);
      if (stryMutAct_9fa48("140656") ? cachedStatus !== authoritativeStatus : stryMutAct_9fa48("140655") ? false : stryMutAct_9fa48("140654") ? true : (stryCov_9fa48("140654", "140655", "140656"), cachedStatus === authoritativeStatus)) {
        if (stryMutAct_9fa48("140657")) {
          {}
        } else {
          stryCov_9fa48("140657");
          return;
        }
      }
      const divergenceType = (stryMutAct_9fa48("140660") ? authoritativeStatus !== null : stryMutAct_9fa48("140659") ? false : stryMutAct_9fa48("140658") ? true : (stryCov_9fa48("140658", "140659", "140660"), authoritativeStatus === null)) ? READ_MODEL_DIVERGENCE_TYPE.AUTHORITATIVE_MISSING : (stryMutAct_9fa48("140663") ? cachedStatus !== null : stryMutAct_9fa48("140662") ? false : stryMutAct_9fa48("140661") ? true : (stryCov_9fa48("140661", "140662", "140663"), cachedStatus === null)) ? READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING : READ_MODEL_DIVERGENCE_TYPE.FIELD_MISMATCH;
      const event = buildDivergenceEvent(stryMutAct_9fa48("140664") ? {} : (stryCov_9fa48("140664"), {
        divergenceType,
        tableName: SYSTEM_TABLE_NAME.SERVICES,
        ownerComponent: COORDINATOR_OWNER_COMPONENT,
        reconciliationReason: reason,
        rowKey: replicaId,
        cacheValue: cachedStatus ? stryMutAct_9fa48("140665") ? {} : (stryCov_9fa48("140665"), {
          status: cachedStatus
        }) : null,
        authoritativeValue: authoritativeStatus ? stryMutAct_9fa48("140666") ? {} : (stryCov_9fa48("140666"), {
          status: authoritativeStatus
        }) : null,
        divergentFields: stryMutAct_9fa48("140667") ? [] : (stryCov_9fa48("140667"), [stryMutAct_9fa48("140668") ? "" : (stryCov_9fa48("140668"), 'status')])
      }));
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.READ_MODEL_DIVERGENCE, event);
      if (stryMutAct_9fa48("140670") ? false : stryMutAct_9fa48("140669") ? true : (stryCov_9fa48("140669", "140670"), this.emitter)) {
        if (stryMutAct_9fa48("140671")) {
          {}
        } else {
          stryCov_9fa48("140671");
          this.emitter.emit(REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE, event);
        }
      }
    }
  }
}
export { ReplicaOperationRepository, SQL };