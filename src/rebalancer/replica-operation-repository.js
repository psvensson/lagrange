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

import {v4 as uuidv4} from 'uuid';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';
import {isPriorityControlPlanePartition} from '../bootstrap/system-partition-classification.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../control-plane/control-plane-readiness-constants.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../control-plane/control-plane-publication-merge.js';
import {
  hasControlPlaneMutationRoutingGapFailureSignature,
} from '../control-plane/control-plane-mutation-readiness-constants.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE,
  buildPriorityRecoveryCompletion,
} from '../control-plane/priority-recovery-completion.js';
import {hasPriorityRecoverySpreadGap} from '../control-plane/priority-recovery-snapshot.js';
import {LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY} from '../cdc/cdc-integration-service.js';
import {
  WORKFLOW_STEP,
  NUM,
  ERRORS,
  TIME_MS,
  TYPEOF,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {SERVICE_TYPE} from '../constants/service.js';
import {ROUTER_ERROR_MSG, TRANSPORT_ERROR_MSG} from '../constants/transport.js';
import {
  buildControlPlaneQueryOptions,
  getRemainingBudgetMs,
} from '../control-plane/timeout-budget.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_READ_STRATEGY,
  resolveAuthoritativeReadModeContract,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  OPERATION_METADATA_KEY,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  TERMINAL_STATUSES,
  OperationType,
  ReplicaStatus,
  buildReplicaOperationSemanticWitnesses,
  getOperationMetadataObject,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  isReplaceRemoveDispatchPhase,
  isValidWorkflowStep,
  isTerminalStep,
  isCoordinatorOwnedOperationType,
  isTerminalReplicaOperationSemanticPhase,
  resolveReplicaOperationSemanticPhase,
} from './replica-status.js';
import {ReplicaOperationField} from './replica-operation-constants.js';
import {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_SUBSYSTEM,
} from './rebalancer-constants.js';
import {
  READ_MODEL_DIVERGENCE_TYPE,
  SQL_RECONCILIATION_REASON,
  buildDivergenceEvent,
} from '../control-plane/read-model-contract.js';
import {QUERY_ERROR_MSG} from '../query/query-constants.js';
import {PARTITION_SERVICE_ERROR_MSG} from '../partition/partition-service-constants.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {
  assignReplicaOperationRepositoryReadMethods,
} from './replica-operation-repository-read-methods.js';
import {
  assignReplicaOperationRepositoryMutationMethods,
} from './replica-operation-repository-mutation-methods.js';
import {
  assignReplicaOperationRepositoryObservationMethods,
} from './replica-operation-repository-observation-methods.js';

/**
 * SQL queries for replica_operations table access.
 * All system information access must go through SQL engine.
 */
const REPLICA_OPERATION_REPOSITORY_LITERAL = Object.freeze({
  WORKFLOW_PARTICIPANT: 'Workflow participant ',
  NOT_FOUND: ' not found',
  SYSTEMTABLECACHE: 'systemTableCache',
  CDCINTEGRATIONSERVICE: 'cdcIntegrationService',
  CONTROLPLANESYSTEMTABLEGATEWAY: 'controlPlaneSystemTableGateway',
  CONTROLPLANEREADINESSSERVICE: 'controlPlaneReadinessService',
  LOGGER: 'logger',
  CONTROL_PLANE_PARTICIPATION_DEFERRED_BY_CANONICAL_READINESS:
    'Control-plane participation deferred by canonical readiness',
  VALUE: '',
  IN_FLIGHT_OPERATION_OWNER_QUERY_INDICATES: 'In-flight operation owner query indicates',
  CONTROL_PLANE_PRESSURE: ' control-plane pressure',
  AUTHORITATIVE_REPLICA_OPERATION_NOT_CONFIRMED: 'Authoritative replica operation not confirmed: ',
  REPLICAOPERATIONREPOSITORY_REQUIRES_A_CONTROL_PLANE_MUTATION_INGRESS:
    'ReplicaOperationRepository requires a control-plane mutation ingress',
  OBJECT: 'object',
  CRITICAL: 'critical',
  WRITE: 'write',
  OBSERVED: 'observed',
  CACHE_FALLBACK_AFTER_AUTHORITATIVE_FAILURE: 'cache_fallback_after_authoritative_failure',
  CACHE: 'cache',
  AUTHORITATIVE: 'authoritative',
  ABSENT: 'absent',
  UNAVAILABLE: 'unavailable',
});
const SQL = Object.freeze({
  SELECT_OPERATION_BY_ID: 'SELECT * FROM replica_operations WHERE operation_id = ?',
  SELECT_INCOMPLETE_OPERATIONS: `SELECT * FROM replica_operations
    WHERE (source_node_id = ? OR target_node_id = ?)
    AND type IN (${COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE})
    AND (
      workflow_step IN (?, ?, ?, ?, ?)
      OR (workflow_step = ? AND type = ?)
    )`,
  SELECT_OPERATIONS_BY_PARTITION: 'SELECT * FROM replica_operations WHERE partition_id = ?',
  SELECT_OPERATIONS_BY_ENTITY: `SELECT * FROM replica_operations
    WHERE (
      (entity_type = ? AND entity_id = ?)
      OR ((entity_type IS NULL OR entity_type = '') AND partition_id = ?)
    )`,
  SELECT_IN_FLIGHT_FOR_ENTITY_NODE: `SELECT * FROM replica_operations
    WHERE partition_id = ? AND target_node_id = ?
    AND (
      (entity_type = ? AND entity_id = ?)
      OR (entity_type IS NULL OR entity_type = '')
    )`,
  SELECT_IN_FLIGHT_BY_TYPE: `SELECT * FROM replica_operations 
    WHERE type = ?`,
  SELECT_ALL_OPERATIONS: 'SELECT * FROM replica_operations ORDER BY created_at DESC',
  INSERT_OPERATION: `INSERT INTO replica_operations (
    operation_id, type, partition_id, replica_id, source_node_id,
    target_node_id, status, workflow_step, created_at, updated_at,
    completed_at, error_message, steps_history,
    entity_type, entity_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  UPDATE_OPERATION: `UPDATE replica_operations SET 
    status = ?, workflow_step = ?, updated_at = ?, completed_at = ?, 
    error_message = ?, steps_history = ?, replica_id = ?
    WHERE operation_id = ?`,
  UPDATE_OPERATION_EXPECTING_STEP: `UPDATE replica_operations SET
    status = ?, workflow_step = ?, updated_at = ?, completed_at = ?,
    error_message = ?, steps_history = ?, replica_id = ?
    WHERE operation_id = ? AND workflow_step = ?`,
  SELECT_REPLICA_STATUS: `SELECT service_id, replica_id, partition_id, node_id,
      service_type, status, raft_role, address
    FROM services WHERE service_id = ?`,
  SELECT_REPLICA_BY_PARTITION_NODE: `SELECT service_id, replica_id,
      partition_id, node_id, service_type, status, raft_role, address
    FROM services 
    WHERE partition_id = ? AND node_id = ?`,
});
const OPERATION_PERSIST_RETRY_DELAY_MS = TIME_MS.SECOND / NUM.FOUR;
const OPERATION_PERSIST_RETRY_TIMEOUT_MS = TIME_MS.SECOND * (NUM.TEN + NUM.FIVE);
const REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_TIMEOUT_MS =
  TIME_MS.SECOND * (NUM.TEN + NUM.FIVE);
const REPLICA_OPERATION_MUTATION_QUERY_TIMEOUT_MS =
  REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_TIMEOUT_MS;
const INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS = TIME_MS.SECOND;
const INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS = TIME_MS.SECOND * NUM.TEN;
const INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD = 1000;
const INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS = TIME_MS.SECOND / NUM.FOUR;
const INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_CEILING_MS = TIME_MS.SECOND * NUM.FIVE;
const PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STALE_GRACE_MS = TIME_MS.SECOND * (NUM.TEN + NUM.FIVE);
const PRIORITY_RECOVERY_INCOMPLETE_OPERATION_OWNER_VISIBILITY_GRACE_MS = TIME_MS.MINUTE * NUM.TWO;
const INCOMPLETE_OPERATION_OBSERVATION_SOURCE = Object.freeze({
  CACHE_OR_AUTHORITATIVE_READ: 'cache_or_authoritative_read',
  OWNER_PERSISTED_TRANSITION: 'owner_persisted_transition',
});
const INCOMPLETE_OPERATION_OBSERVATION_STATE = Object.freeze({
  PRESENT: 'present',
  EMPTY: 'empty',
  DEFERRED: 'deferred',
});
const COORDINATOR_OWNER_COMPONENT = 'RebalanceCoordinator';
const REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS = TIME_MS.SECOND * NUM.FIVE;
const REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_RETRY_DELAY_MS = TIME_MS.SECOND / NUM.FIVE;
const REPLICA_OPERATION_OWNER_PERSISTED_TRANSITION_VISIBILITY_GRACE_MS = TIME_MS.SECOND * NUM.FIVE;
const REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS = TIME_MS.SECOND;
const REPLICA_OPERATION_READ_RETRY_DELAY_MS = TIME_MS.SECOND / NUM.TEN;
const INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE = Object.freeze({
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_READ: 'priority_recovery_authoritative_operation_read',
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_FAILURE:
    'priority_recovery_authoritative_operation_failure',
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_EMPTY_READ:
    'priority_recovery_authoritative_operation_empty_read',
});
const REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE = Object.freeze({
  CONFIRMED: 'confirmed',
  DEFERRED: 'deferred',
  MISSING: 'missing',
});
const REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE = Object.freeze({
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_FAILURE:
    'priority_recovery_authoritative_operation_visibility_failure',
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_EMPTY_READ:
    'priority_recovery_authoritative_operation_visibility_empty_read',
  OWNER_PERSISTED_TRANSITION_RETRYABLE_FAILURE:
    'owner_persisted_transition_authoritative_operation_visibility_retryable_failure',
  OWNER_PERSISTED_TRANSITION_EMPTY_READ:
    'owner_persisted_transition_authoritative_operation_visibility_empty_read',
  OWNER_PERSISTED_TRANSITION_STALE_READ:
    'owner_persisted_transition_authoritative_operation_visibility_stale_read',
});
const REPLICA_OPERATION_VISIBILITY_REASON = Object.freeze({
  OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION:
    'owner_persisted_transition_pending_authoritative_confirmation',
});
const ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE = Object.freeze({
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_READ:
    'priority_recovery_entity_operation_authoritative_read',
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_FAILURE:
    'priority_recovery_entity_operation_authoritative_failure',
  PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_EMPTY_READ:
    'priority_recovery_entity_operation_empty_read',
});
function shouldDeferReplicaOperationOwnerRead(participation) {
  return (
    participation?.reasonCode === CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY
  );
}
function buildControlPlaneFailurePayload(nodeId, resultOrError) {
  const participantFailures = Array.isArray(resultOrError?.participantFailures) ?
    resultOrError.participantFailures
      .filter((entry) => entry && typeof entry === 'object')
      .slice(NUM.ZERO, NUM.THREE) :
    [];
  const firstFailedParticipant =
    resultOrError?.firstFailedParticipant &&
    typeof resultOrError.firstFailedParticipant === 'object' ?
      resultOrError.firstFailedParticipant :
      participantFailures.length > NUM.ZERO ?
        participantFailures[NUM.ZERO] :
        null;
  return {
    error: resultOrError?.error || resultOrError?.message || null,
    nodeId,
    code: getControlPlaneErrorCode(resultOrError) || null,
    retryAfterMs: getControlPlaneRetryAfterMs(resultOrError),
    reasonCode:
      typeof resultOrError?.reasonCode === TYPEOF.STRING ? resultOrError.reasonCode : null,
    participationKind:
      typeof resultOrError?.participationKind === TYPEOF.STRING ?
        resultOrError.participationKind :
        null,
    tableName:
      typeof resultOrError?.tableName === TYPEOF.STRING ?
        resultOrError.tableName :
        typeof firstFailedParticipant?.failedTable === TYPEOF.STRING ?
          firstFailedParticipant.failedTable :
          null,
    participantFailures,
    firstFailedParticipant,
  };
}
function cloneControlPlaneFailureParticipants(resultOrError) {
  const participantFailures = Array.isArray(resultOrError?.participantFailures) ?
    resultOrError.participantFailures
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({...entry})) :
    [];
  const firstFailedParticipant =
    resultOrError?.firstFailedParticipant &&
    typeof resultOrError.firstFailedParticipant === 'object' ?
      {...resultOrError.firstFailedParticipant} :
      participantFailures.length > NUM.ZERO ?
        participantFailures[NUM.ZERO] :
        null;
  return {participantFailures, firstFailedParticipant};
}
const CONTROL_PLANE_QUERY_OPTIONS = Object.freeze({
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
});
const REPLICA_OPERATION_READINESS_DIMENSION =
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
const REPLICA_OPERATION_VISIBILITY_WORKLOAD_PROFILE = buildControlPlaneWorkloadProfile(
  CONTROL_PLANE_WORKLOAD_CLASS.AUTHORITATIVE_OPERATION_VISIBILITY,
);
const REPLICA_OPERATION_MUTATION_WORKLOAD_PROFILE = buildControlPlaneWorkloadProfile(
  CONTROL_PLANE_WORKLOAD_CLASS.REPLICA_OPERATION_MUTATION,
);
const REPLICA_OPERATION_READ_QUERY_OPTIONS = Object.freeze({
  ...CONTROL_PLANE_QUERY_OPTIONS,
  routingReadinessDimension: REPLICA_OPERATION_READINESS_DIMENSION,
  readStrategy: CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
  replicaFallbackConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
  controlPlaneTableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
  controlPlaneOperationKind: 'read',
  workloadClass: REPLICA_OPERATION_VISIBILITY_WORKLOAD_PROFILE.workloadClass,
  workClass:
    REPLICA_OPERATION_VISIBILITY_WORKLOAD_PROFILE.workClass || PRESSURE_WORK_CLASS.CRITICAL,
  deliveryPriority: 'critical',
  allowPressureDefer: REPLICA_OPERATION_VISIBILITY_WORKLOAD_PROFILE.allowPressureDefer === true,
  preferOwnerRpcRead: false,
  requireOwnerRpcRead: false,
  allowOwnerRpcFallback: false,
  allowSqlFallback: false,
  confirmEmptyLocalReadWithOwnerRpc: false,
});
const REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_OPTIONS = Object.freeze({
  ...buildControlPlaneQueryOptions({
    requestedTimeoutMs: REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_TIMEOUT_MS,
  }),
});
const REPLICA_OPERATION_CRITICAL_RECOVERY_READ_QUERY_OPTIONS = Object.freeze({
  ...REPLICA_OPERATION_READ_QUERY_OPTIONS,
  ...REPLICA_OPERATION_CRITICAL_RECOVERY_QUERY_OPTIONS,
});
const _REPLICA_OPERATION_STRICT_DEDUPE_READ_QUERY_OPTIONS =
  REPLICA_OPERATION_READ_QUERY_OPTIONS;
const _REPLICA_OPERATION_PERSIST_CONFIRMATION_READ_QUERY_OPTIONS =
  REPLICA_OPERATION_CRITICAL_RECOVERY_READ_QUERY_OPTIONS;
const REPLICA_STATUS_READ_QUERY_OPTIONS = Object.freeze({
  ...CONTROL_PLANE_QUERY_OPTIONS,
  preferOwnerRpcRead: true,
  allowOwnerRpcFallback: true,
});
const RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES = Object.freeze([
  QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX,
]);
const RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES = Object.freeze([
  PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
]);
const RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS = Object.freeze([ERRORS.NO_HANDLER_FOR_ADDRESS]);
const REPLICA_OPERATION_TRANSITION_LANE = Object.freeze({
  DEFAULT: 'default',
  PRIORITY_RECOVERY: 'priority_recovery',
});
const OPERATION_MUTATION_SESSION_RETRY_DECISION = Object.freeze({
  RETAIN_EXISTING_SESSION: 'retain_existing_session',
  ROTATE_IMPLICIT_SESSION: 'rotate_implicit_session',
});
const REPLICA_OPERATION_OWNER_NAME = 'replica-operations-owner';
function isRetryableWorkflowParticipantLookupErrorMessage(errorMessage) {
  return (
    typeof errorMessage === TYPEOF.STRING &&
    errorMessage.startsWith(REPLICA_OPERATION_REPOSITORY_LITERAL.WORKFLOW_PARTICIPANT) &&
    errorMessage.endsWith(REPLICA_OPERATION_REPOSITORY_LITERAL.NOT_FOUND)
  );
}

/**
 */
const REPLICA_OPERATION_VISIBILITY_READ_MODE = Object.freeze({
  CACHE_ONLY: 'cache_only',
  CACHE_PREFERRED_SQL_FALLBACK: 'cache_preferred_sql_fallback',
  OWNER_RPC_REQUIRED: 'owner_rpc_required',
});
const INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE = Object.freeze({
  NONE: 'none',
  AUTHORITATIVE_SUPPLEMENT: 'authoritative_supplement',
});

const REPLICA_OPERATION_LOCAL_OWNER_READ_QUERY_OPTIONS = Object.freeze({
  ...REPLICA_OPERATION_READ_QUERY_OPTIONS,
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
});

const REPLICA_OPERATION_LOCAL_VISIBILITY_READ_QUERY_OPTIONS = Object.freeze({
  ...REPLICA_OPERATION_CRITICAL_RECOVERY_READ_QUERY_OPTIONS,
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
});

const REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS = Object.freeze({
  ...REPLICA_OPERATION_CRITICAL_RECOVERY_READ_QUERY_OPTIONS,
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED_SQL_FALLBACK,
});

const REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS = Object.freeze({
  ...REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS,
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
});

const REPLICA_OPERATION_CANONICAL_STATUS_READ_QUERY_OPTIONS = Object.freeze({
  ...REPLICA_STATUS_READ_QUERY_OPTIONS,
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
});
const REPLICA_OPERATION_LOCAL_STATUS_READ_QUERY_OPTIONS = Object.freeze({
  ...REPLICA_STATUS_READ_QUERY_OPTIONS,
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
  preferOwnerRpcRead: false,
  allowOwnerRpcFallback: false,
  allowSqlFallback: false,
  confirmEmptyLocalReadWithOwnerRpc: false,
});

function normalizeReplicaOperationVisibilityReadMode(value) {
  if (value === REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY) {
    return REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY;
  }
  if (value === REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK) {
    return REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK;
  }
  if (value === REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED) {
    return REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED;
  }
  return null;
}

function resolveReplicaOperationVisibilityReadMode(options = {}) {
  const explicitMode = normalizeReplicaOperationVisibilityReadMode(
    options?.visibilityReadMode || options?.incompleteOperationReadMode,
  );
  if (explicitMode) {
    return explicitMode;
  }
  if (options?.preferAuthoritativeRead === true) {
    return REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED;
  }
  if (options?.skipSqlFallbackWhenCacheEmpty === true) {
    return REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY;
  }
  return REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK;
}

function normalizeIncompleteOperationVisibilitySupplementMode(value) {
  if (value === INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE.NONE) {
    return INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE.NONE;
  }
  if (value === INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE.AUTHORITATIVE_SUPPLEMENT) {
    return INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE.AUTHORITATIVE_SUPPLEMENT;
  }
  return null;
}

function resolveIncompleteOperationVisibilitySupplementMode(options = {}) {
  return (
    normalizeIncompleteOperationVisibilitySupplementMode(options?.visibilitySupplementMode) ||
    INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE.NONE
  );
}

function buildReplicaOperationVisibilityReadOptions(readMode) {
  if (readMode === REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY) {
    return null;
  }
  if (readMode === REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED) {
    return {
      ...REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
      retryOnRetryableFailure: true,
    };
  }
  return {
    ...REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS,
  };
}

/**
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
    this.nodeId = options.nodeId;
    this.systemTableCache = options.systemTableCache;
    this.cdcIntegrationService = options.cdcIntegrationService;
    this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;
    this.controlPlaneReadinessService = options.controlPlaneReadinessService || null;
    this.logger = options.logger;
    this.emitter = options.emitter || null;
    this.random = typeof options.random === TYPEOF.FUNCTION ? options.random : Math.random;
    this.lastIncompleteOperationQueryWarningAtMs = NUM.ZERO;
    this.nextIncompleteOperationSqlRetryAtMs = NUM.ZERO;
    this.lastIncompleteOperationObservation = [];
    this.lastIncompleteOperationObservationAtMs = NUM.ZERO;
    this.lastIncompleteOperationObservationSource =
      INCOMPLETE_OPERATION_OBSERVATION_SOURCE.CACHE_OR_AUTHORITATIVE_READ;
    this.lastIncompleteOperationReadOutcome = null;
    this.lastAuthoritativeOperationVisibilityOutcome = null;
    this.ownerPersistedTransitionVisibilityWitnesses = new Map();
    this.replicaOperationTransitionQueues = new Map([
      [REPLICA_OPERATION_TRANSITION_LANE.DEFAULT, Promise.resolve()],
      [REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY, Promise.resolve()],
    ]);
    this.replicaOperationAuthoritativeVisibilityTimeoutMs =
      Number.isFinite(options.authoritativeVisibilityTimeoutMs) &&
      options.authoritativeVisibilityTimeoutMs >= NUM.ZERO ?
        Math.floor(options.authoritativeVisibilityTimeoutMs) :
        REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS;
    this.replicaOperationAuthoritativeVisibilityRetryDelayMs =
      Number.isFinite(options.authoritativeVisibilityRetryDelayMs) &&
      options.authoritativeVisibilityRetryDelayMs >= NUM.ZERO ?
        Math.floor(options.authoritativeVisibilityRetryDelayMs) :
        REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_RETRY_DELAY_MS;
  }
  /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */
  syncOwnerDependencies(options = {}) {
    if (Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.SYSTEMTABLECACHE)) {
      this.systemTableCache = options.systemTableCache || null;
    }
    if (Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.CDCINTEGRATIONSERVICE)) {
      this.cdcIntegrationService = options.cdcIntegrationService || null;
    }
    if (
      Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROLPLANESYSTEMTABLEGATEWAY)
    ) {
      this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway || null;
    }
    if (Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROLPLANEREADINESSSERVICE)) {
      this.controlPlaneReadinessService = options.controlPlaneReadinessService || null;
    }
    if (Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.LOGGER)) {
      this.logger = options.logger || console;
    }
  }
  /**
   * Bound retryable SQL backoff for replica_operations owner reads.
   * @param {Object} result
   * @return {number}
   * @private
   */
  getRetryableIncompleteOperationReadBackoffMs(result) {
    const retryAfterMs = getControlPlaneRetryAfterMs(result);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
      return Math.min(
        INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_CEILING_MS,
        Math.max(INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS, retryAfterMs),
      );
    }
    return INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS;
  }
  /**
   * Bound authoritative operation-id read retries to a short window.
   * @param {Object} result
   * @return {number}
   * @private
   */
  getRetryableReplicaOperationReadRetryDelayMs(result) {
    const retryAfterMs = getControlPlaneRetryAfterMs(result);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
      return Math.max(
        REPLICA_OPERATION_READ_RETRY_DELAY_MS,
        Math.min(REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS, retryAfterMs),
      );
    }
    return REPLICA_OPERATION_READ_RETRY_DELAY_MS;
  }
  /**
   * Wait before retrying one authoritative replica_operations read.
   * @param {number} delayMs
   * @return {Promise<void>}
   */
  async waitForReplicaOperationReadRetry(delayMs) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  getLastIncompleteOperationReadOutcome() {
    return this.lastIncompleteOperationReadOutcome ?
      {...this.lastIncompleteOperationReadOutcome} :
      null;
  }
  getLastAuthoritativeOperationVisibilityOutcome() {
    return this.lastAuthoritativeOperationVisibilityOutcome ?
      {...this.lastAuthoritativeOperationVisibilityOutcome} :
      null;
  }
  cloneIncompleteOperationObservation(operation) {
    return operation && typeof operation === TYPEOF.OBJECT ?
      {
        ...operation,
        stepsHistory: Array.isArray(operation.stepsHistory) ?
          [...operation.stepsHistory] :
          operation.stepsHistory,
      } :
      operation;
  }
  cloneIncompleteOperationObservationSet(operations = []) {
    return Array.isArray(operations) ?
      operations.map((operation) => this.cloneIncompleteOperationObservation(operation)) :
      [];
  }
  resolveOwnerPersistedTransitionVisibilityGraceMs() {
    return Math.max(
      REPLICA_OPERATION_OWNER_PERSISTED_TRANSITION_VISIBILITY_GRACE_MS,
      this.replicaOperationAuthoritativeVisibilityTimeoutMs,
    );
  }
  recordOwnerPersistedTransitionVisibilityWitness(operation) {
    if (!operation?.operationId) {
      return;
    }
    this.ownerPersistedTransitionVisibilityWitnesses.set(operation.operationId, {
      recordedAtMs: Date.now(),
      operation: this.cloneIncompleteOperationObservation(operation),
    });
  }
  clearOwnerPersistedTransitionVisibilityWitness(operationId) {
    if (!operationId) {
      return;
    }
    this.ownerPersistedTransitionVisibilityWitnesses.delete(operationId);
  }
  getOwnerPersistedTransitionVisibilityWitness(operationId, expectedOperation = null) {
    if (!operationId) {
      return null;
    }
    const witness = this.ownerPersistedTransitionVisibilityWitnesses.get(operationId);
    if (!witness || typeof witness !== TYPEOF.OBJECT) {
      return null;
    }
    if (
      Date.now() - witness.recordedAtMs >
      this.resolveOwnerPersistedTransitionVisibilityGraceMs()
    ) {
      this.ownerPersistedTransitionVisibilityWitnesses.delete(operationId);
      return null;
    }
    if (
      expectedOperation &&
      !this.isReplicaOperationVisibilitySatisfied(expectedOperation, witness.operation)
    ) {
      return null;
    }
    return {
      recordedAtMs: witness.recordedAtMs,
      operation: this.cloneIncompleteOperationObservation(witness.operation),
    };
  }
  getOwnerPersistedTransitionVisibilityFallbackOperation(
    operationId,
    expectedOperation = null,
  ) {
    const witness = this.getOwnerPersistedTransitionVisibilityWitness(
      operationId,
      expectedOperation,
    );
    return witness?.operation ?
      this.cloneIncompleteOperationObservation(witness.operation) :
      null;
  }
  getOwnerPersistedTransitionVisibilityFallbackOperationsForEntity(
    entityType,
    entityId,
  ) {
    const normalizedEntityType = String(entityType || '').trim();
    const normalizedEntityId = String(entityId || '').trim();
    if (
      normalizedEntityType.length === NUM.ZERO ||
      normalizedEntityId.length === NUM.ZERO
    ) {
      return [];
    }
    const fallbackOperations = [];
    for (const operationId of this.ownerPersistedTransitionVisibilityWitnesses.keys()) {
      const operation =
        this.getOwnerPersistedTransitionVisibilityFallbackOperation(operationId);
      if (
        !operation ||
        this.isOperationTerminal(operation) ||
        !this.isOperationLocallyOwned(operation)
      ) {
        continue;
      }
      const operationEntityType = String(
        operation.entityType || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE,
      ).trim();
      const operationEntityId = String(
        operation.entityId ||
        operation.partitionId ||
        REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE,
      ).trim();
      const entityMatches =
        (operationEntityType === normalizedEntityType &&
          operationEntityId === normalizedEntityId) ||
        (operationEntityType.length === NUM.ZERO &&
          String(operation.partitionId || '').trim() === normalizedEntityId);
      if (!entityMatches) {
        continue;
      }
      fallbackOperations.push(operation);
    }
    return this.mergeIncompleteOperationVisibilityOperations([], fallbackOperations);
  }
  isOwnerPersistedTransitionVisibilityLagCandidate(
    expectedOperation,
    observedOperation,
    witness = null,
  ) {
    if (
      !expectedOperation ||
      typeof expectedOperation !== TYPEOF.OBJECT ||
      !observedOperation ||
      typeof observedOperation !== TYPEOF.OBJECT ||
      !witness ||
      typeof witness !== TYPEOF.OBJECT
    ) {
      return false;
    }
    if (observedOperation.operationId !== expectedOperation.operationId) {
      return false;
    }
    if (
      expectedOperation.replicaId !== null &&
      expectedOperation.replicaId !== undefined &&
      observedOperation.replicaId !== null &&
      observedOperation.replicaId !== undefined &&
      observedOperation.replicaId !== expectedOperation.replicaId
    ) {
      return false;
    }

    const expectedUpdatedAt = Number(expectedOperation.updatedAt);
    const witnessUpdatedAt = Number(witness.operation?.updatedAt);
    const observedUpdatedAt = Number(observedOperation.updatedAt);
    const authoritativeUpdatedAtFloor = Number.isFinite(expectedUpdatedAt) ?
      expectedUpdatedAt :
      Number.isFinite(witnessUpdatedAt) ?
        witnessUpdatedAt :
        null;
    if (
      Number.isFinite(authoritativeUpdatedAtFloor) &&
      Number.isFinite(observedUpdatedAt) &&
      observedUpdatedAt < authoritativeUpdatedAtFloor
    ) {
      return true;
    }

    const expectedCompletedAt = Number(expectedOperation.completedAt);
    const witnessCompletedAt = Number(witness.operation?.completedAt);
    const observedCompletedAt = Number(observedOperation.completedAt);
    const authoritativeCompletedAtFloor = Number.isFinite(expectedCompletedAt) ?
      expectedCompletedAt :
      Number.isFinite(witnessCompletedAt) ?
        witnessCompletedAt :
        null;
    return (
      Number.isFinite(authoritativeCompletedAtFloor) &&
      Number.isFinite(observedCompletedAt) &&
      observedCompletedAt < authoritativeCompletedAtFloor
    );
  }
  resolveIncompleteOperationObservationGraceMs() {
    return this.lastIncompleteOperationObservationSource ===
      INCOMPLETE_OPERATION_OBSERVATION_SOURCE.OWNER_PERSISTED_TRANSITION ?
      PRIORITY_RECOVERY_INCOMPLETE_OPERATION_OWNER_VISIBILITY_GRACE_MS :
      PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STALE_GRACE_MS;
  }
  recordIncompleteOperationObservation(operations = [], options = {}) {
    const source =
      options?.source === INCOMPLETE_OPERATION_OBSERVATION_SOURCE.OWNER_PERSISTED_TRANSITION ?
        INCOMPLETE_OPERATION_OBSERVATION_SOURCE.OWNER_PERSISTED_TRANSITION :
        INCOMPLETE_OPERATION_OBSERVATION_SOURCE.CACHE_OR_AUTHORITATIVE_READ;
    this.lastIncompleteOperationObservation =
      this.cloneIncompleteOperationObservationSet(operations);
    this.lastIncompleteOperationObservationAtMs = Date.now();
    this.lastIncompleteOperationObservationSource = source;
  }
  syncIncompleteOperationObservation(operation) {
    if (!operation?.operationId) {
      return;
    }
    const observedOperations = this.cloneIncompleteOperationObservationSet(
      this.lastIncompleteOperationObservation,
    );
    const operationIndex = observedOperations.findIndex(
      (entry) => entry?.operationId === operation.operationId,
    );
    if (this.isOperationTerminal(operation)) {
      if (operationIndex >= NUM.ZERO) {
        observedOperations.splice(operationIndex, NUM.ONE);
      }
      this.recordIncompleteOperationObservation(observedOperations, {
        source: INCOMPLETE_OPERATION_OBSERVATION_SOURCE.OWNER_PERSISTED_TRANSITION,
      });
      return;
    }
    const observedOperation = this.cloneIncompleteOperationObservation(operation);
    if (operationIndex >= NUM.ZERO) {
      observedOperations[operationIndex] = observedOperation;
    } else {
      observedOperations.push(observedOperation);
    }
    this.recordIncompleteOperationObservation(
      this.mapAndSortIncompleteOperations(
        observedOperations.map((entry) => this.buildReplicaOperationRow(entry)),
      ),
      {
        source: INCOMPLETE_OPERATION_OBSERVATION_SOURCE.OWNER_PERSISTED_TRANSITION,
      },
    );
  }
  resolveIncompleteOperationObservation(operations = []) {
    const normalizedOperations = Array.isArray(operations) ? operations : [];
    const deferredOutcome = this.getLastIncompleteOperationReadOutcome();
    const hasDeferredOwnerRead =
      deferredOutcome?.completionState ===
      PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED;
    const state =
      normalizedOperations.length > NUM.ZERO ?
        INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
        hasDeferredOwnerRead ?
          INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED :
          INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY;
    return Object.freeze({
      state,
      operationCount: normalizedOperations.length,
      deferredOutcome,
      retryAfterMs: Number.isFinite(deferredOutcome?.retryAfterMs) ?
        deferredOutcome.retryAfterMs :
        null,
    });
  }
  clearIncompleteOperationReadOutcome() {
    this.lastIncompleteOperationReadOutcome = null;
  }
  clearAuthoritativeOperationVisibilityOutcome() {
    this.lastAuthoritativeOperationVisibilityOutcome = null;
  }
  resolvePriorityRecoveryPlanningSnapshotForOwnerRead() {
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService) {
      return null;
    }
    const observedAt = Date.now();
    if (typeof readinessService.getPriorityRecoveryPlanningAnswerBestEffort === TYPEOF.FUNCTION) {
      return (
        readinessService.getPriorityRecoveryPlanningAnswerBestEffort(this.nodeId, observedAt) ||
        null
      );
    }
    if (
      typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort === TYPEOF.FUNCTION
    ) {
      return (
        readinessService.getMembershipPublicationPlanningAnswerBestEffort(
          this.nodeId,
          observedAt,
        ) || null
      );
    }
    if (typeof readinessService.getPriorityRecoveryPlanningAnswerSync === TYPEOF.FUNCTION) {
      return (
        readinessService.getPriorityRecoveryPlanningAnswerSync(this.nodeId, observedAt) || null
      );
    }
    if (typeof readinessService.getMembershipPublicationPlanningAnswerSync === TYPEOF.FUNCTION) {
      return (
        readinessService.getMembershipPublicationPlanningAnswerSync(this.nodeId, observedAt) || null
      );
    }
    if (typeof readinessService.getPriorityRecoveryPlanningSnapshotSync === TYPEOF.FUNCTION) {
      return (
        readinessService.getPriorityRecoveryPlanningSnapshotSync(this.nodeId, observedAt) || null
      );
    }
    if (typeof readinessService.getMembershipPublicationPlanningSnapshotSync === TYPEOF.FUNCTION) {
      return (
        readinessService.getMembershipPublicationPlanningSnapshotSync(this.nodeId, observedAt) ||
        null
      );
    }
    return null;
  }
  isPriorityRecoveryOwnerReadActive(planningSnapshot = null) {
    if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
      return false;
    }
    const publicationStatus = String(
      planningSnapshot.publicationStatus || planningSnapshot.status || '',
    )
      .trim()
      .toUpperCase();
    if (
      publicationStatus.length > NUM.ZERO &&
      publicationStatus !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
    ) {
      return true;
    }
    return hasPriorityRecoverySpreadGap(planningSnapshot.priorityPartitionSummary || null);
  }
  canReuseLastIncompleteOperationObservation() {
    return (
      Array.isArray(this.lastIncompleteOperationObservation) &&
      this.lastIncompleteOperationObservation.length > NUM.ZERO &&
      Date.now() - this.lastIncompleteOperationObservationAtMs <=
        this.resolveIncompleteOperationObservationGraceMs()
    );
  }
  buildDeferredIncompleteOperationReadOutcome(options = {}) {
    const priorityRecoveryActive = options.priorityRecoveryActive === true;
    if (priorityRecoveryActive !== true) {
      return null;
    }
    const completion = buildPriorityRecoveryCompletion({
      authoritativeOperationReadDeferred: true,
      priorityRecoveryActive: true,
      retryAfterMs: options.retryAfterMs,
    });
    const fallbackOperationCount = Array.isArray(options.fallbackOperations) ?
      options.fallbackOperations.length :
      Array.isArray(options.cachedOperations) ?
        options.cachedOperations.length :
        NUM.ZERO;
    return {
      completionState: completion.state,
      reasonCode: completion.reasonCode,
      retryAfterMs: completion.retryAfterMs,
      cachedOperationCount: fallbackOperationCount,
      fallbackOperationCount,
      queryDurationMs: Number.isFinite(options.queryDurationMs) ?
        Math.floor(options.queryDurationMs) :
        null,
      source:
        typeof options.source === TYPEOF.STRING ?
          options.source :
          INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE.PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_READ,
    };
  }
  buildDeferredAuthoritativeOperationVisibilityOutcome(options = {}) {
    const priorityRecoveryActive = options.priorityRecoveryActive === true;
    if (priorityRecoveryActive !== true) {
      return null;
    }
    const completion = buildPriorityRecoveryCompletion({
      authoritativeOperationReadDeferred: true,
      priorityRecoveryActive: true,
      retryAfterMs: options.retryAfterMs,
    });
    return {
      confirmationState: REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED,
      completionState: completion.state,
      reasonCode: completion.reasonCode,
      retryAfterMs: completion.retryAfterMs,
      queryDurationMs: Number.isFinite(options.queryDurationMs) ?
        Math.floor(options.queryDurationMs) :
        null,
      operationId:
        typeof options.operationId === TYPEOF.STRING ?
          options.operationId :
          null,
      source:
        typeof options.source === TYPEOF.STRING ?
          options.source :
          REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
            .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_FAILURE,
    };
  }
  buildOwnerPersistedTransitionDeferredVisibilityOutcome(options = {}) {
    const operationId =
      typeof options.operationId === TYPEOF.STRING ?
        options.operationId :
        null;
    if (!operationId) {
      return null;
    }
    return {
      confirmationState: REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED,
      completionState: null,
      reasonCode:
        REPLICA_OPERATION_VISIBILITY_REASON
          .OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION,
      retryAfterMs: Number.isFinite(options.retryAfterMs) ?
        Math.floor(options.retryAfterMs) :
        null,
      queryDurationMs: Number.isFinite(options.queryDurationMs) ?
        Math.floor(options.queryDurationMs) :
        null,
      operationId,
      source:
        typeof options.source === TYPEOF.STRING ?
          options.source :
          REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
            .OWNER_PERSISTED_TRANSITION_EMPTY_READ,
    };
  }
  buildDeferredEntityOperationVisibilityOutcome(options = {}) {
    const priorityRecoveryActive = options.priorityRecoveryActive === true;
    if (priorityRecoveryActive !== true) {
      return null;
    }
    const completion = buildPriorityRecoveryCompletion({
      authoritativeOperationReadDeferred: true,
      priorityRecoveryActive: true,
      retryAfterMs: options.retryAfterMs,
    });
    const fallbackOperationCount = Array.isArray(options.fallbackOperations) ?
      options.fallbackOperations.length :
      Array.isArray(options.cachedOperations) ?
        options.cachedOperations.length :
        NUM.ZERO;
    return {
      completionState: completion.state,
      reasonCode: completion.reasonCode,
      retryAfterMs: completion.retryAfterMs,
      cachedOperationCount: fallbackOperationCount,
      fallbackOperationCount,
      queryDurationMs: Number.isFinite(options.queryDurationMs) ?
        Math.floor(options.queryDurationMs) :
        null,
      entityType: typeof options.entityType === TYPEOF.STRING ? options.entityType : null,
      entityId: typeof options.entityId === TYPEOF.STRING ? options.entityId : null,
      source:
        typeof options.source === TYPEOF.STRING ?
          options.source :
          ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE.PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_READ,
    };
  }
  buildOperationVisibilityObservation(operation = null, deferredOutcome = null) {
    const hasDeferredOwnerRead =
      deferredOutcome?.completionState ===
        PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED ||
      deferredOutcome?.confirmationState ===
        REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED;
    const normalizedOperation =
      operation && typeof operation === TYPEOF.OBJECT ? {...operation} : null;
    return Object.freeze({
      state: normalizedOperation ?
        INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
        hasDeferredOwnerRead ?
          INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED :
          INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
      operation: normalizedOperation,
      deferredOutcome: deferredOutcome ? {...deferredOutcome} : null,
      retryAfterMs: Number.isFinite(deferredOutcome?.retryAfterMs) ?
        deferredOutcome.retryAfterMs :
        null,
    });
  }
  buildEntityOperationVisibilityObservation(operations = [], deferredOutcome = null) {
    const normalizedOperations = this.cloneIncompleteOperationObservationSet(
      Array.isArray(operations) ? operations : [],
    );
    const hasDeferredOwnerRead =
      deferredOutcome?.completionState ===
      PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED;
    return Object.freeze({
      state:
        normalizedOperations.length > NUM.ZERO ?
          INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
          hasDeferredOwnerRead ?
            INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED :
            INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
      operationCount: normalizedOperations.length,
      operations: normalizedOperations,
      deferredOutcome: deferredOutcome ? {...deferredOutcome} : null,
      retryAfterMs: Number.isFinite(deferredOutcome?.retryAfterMs) ?
        deferredOutcome.retryAfterMs :
        null,
    });
  }
  mergeIncompleteOperationVisibilityOperations(
    cachedOperations = [],
    authoritativeOperations = [],
  ) {
    const mergedByOperationId = new Map();
    const appendOperations = (operations = []) => {
      for (const operation of operations) {
        if (!operation?.operationId) {
          continue;
        }
        mergedByOperationId.set(operation.operationId, operation);
      }
    };

    appendOperations(cachedOperations);
    appendOperations(authoritativeOperations);

    return [...mergedByOperationId.values()].sort((left, right) => {
      const leftUpdatedAt = Number(left?.updatedAt) || NUM.ZERO;
      const rightUpdatedAt = Number(right?.updatedAt) || NUM.ZERO;
      if (leftUpdatedAt !== rightUpdatedAt) {
        return leftUpdatedAt - rightUpdatedAt;
      }
      return String(left?.operationId || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE).localeCompare(
        String(right?.operationId || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE),
      );
    });
  }
  async getIncompleteOperationVisibilityObservation(options = {}) {
    const visibilityReadMode =
      resolveReplicaOperationVisibilityReadMode(options) ||
      REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK;
    const visibilitySupplementMode = resolveIncompleteOperationVisibilitySupplementMode(options);
    const cachedOperations = Array.isArray(options?.cachedOperations) ?
      this.cloneIncompleteOperationObservationSet(options.cachedOperations) :
      [];
    let visibleOperations = [];

    if (
      cachedOperations.length > NUM.ZERO &&
      visibilitySupplementMode ===
        INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE.AUTHORITATIVE_SUPPLEMENT &&
      visibilityReadMode !== REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY
    ) {
      visibleOperations = this.mergeIncompleteOperationVisibilityOperations(
        cachedOperations,
        await this.queryIncompleteOperations({
          visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
        }),
      );
    } else if (
      cachedOperations.length > NUM.ZERO &&
      visibilityReadMode !== REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED
    ) {
      this.recordIncompleteOperationObservation(cachedOperations);
      this.clearIncompleteOperationReadOutcome();
      visibleOperations = cachedOperations;
    } else {
      visibleOperations = await this.queryIncompleteOperations({
        visibilityReadMode,
      });
    }

    const visibilityObservation = this.resolveIncompleteOperationObservation(visibleOperations);

    return Object.freeze({
      ...visibilityObservation,
      operations: this.cloneIncompleteOperationObservationSet(visibleOperations),
    });
  }
  resolveDeferredIncompleteOperationReadFallback(cachedOperations = []) {
    if (Array.isArray(cachedOperations) && cachedOperations.length > NUM.ZERO) {
      return this.cloneIncompleteOperationObservationSet(cachedOperations);
    }
    if (this.canReuseLastIncompleteOperationObservation()) {
      return this.cloneIncompleteOperationObservationSet(this.lastIncompleteOperationObservation);
    }
    return [];
  }
  shouldDeferIncompleteOperationEmptyRead(
    result,
    queryDurationMs,
    cachedOperations = [],
    planningSnapshot = null,
  ) {
    return (
      result?.success === true &&
      Array.isArray(result?.rows) &&
      result.rows.length === NUM.ZERO &&
      queryDurationMs >= INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS &&
      this.isPriorityRecoveryOwnerReadActive(planningSnapshot) &&
      (cachedOperations.length > NUM.ZERO || this.canReuseLastIncompleteOperationObservation())
    );
  }
  shouldDeferEntityOperationEmptyRead(result, queryDurationMs, planningSnapshot = null) {
    return (
      result?.success === true &&
      Array.isArray(result?.rows) &&
      result.rows.length === NUM.ZERO &&
      queryDurationMs >= INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS &&
      this.isPriorityRecoveryOwnerReadActive(planningSnapshot)
    );
  }
  shouldDeferIncompleteOperationReadFailure(result, planningSnapshot = null) {
    return result?.success === false && this.isPriorityRecoveryOwnerReadActive(planningSnapshot);
  } // ── Row <-> Operation Translation ──────────────────────────────
  /**
   * Translate a raw SQL/cache row into a normalized operation object.
   * @param {object} row
   * @return {object}
   */
  rowToOperation(row) {
    let stepsHistory = [];
    if (row.steps_history) {
      try {
        stepsHistory = JSON.parse(row.steps_history);
      } catch (error) {
        this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.STEPS_HISTORY_PARSE_ERROR, {
          operationId: row.operation_id,
          error: error.message,
        });
        stepsHistory = [];
      }
    }
    const operation = {
      operationId: row.operation_id,
      type: row.type,
      partitionId: row.partition_id,
      entityType: row.entity_type || SERVICE_TYPE.PARTITION,
      entityId: row.entity_id || row.partition_id,
      replicaId: row.replica_id,
      sourceNodeId: row.source_node_id,
      targetNodeId: row.target_node_id,
      status: row.status,
      workflowStep: row.workflow_step,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
      stepsHistory,
    };
    operation.semanticPhase = resolveReplicaOperationSemanticPhase(
      operation.type,
      operation.workflowStep,
      operation.status,
    );
    operation.witnesses = buildReplicaOperationSemanticWitnesses(
      operation.type,
      operation.workflowStep,
      operation.status,
    );
    operation.sourceReplicaId = this.getReplaceSourceReplicaId(operation);
    const replicaIds = getOperationMetadataStringArray(
      stepsHistory,
      OPERATION_METADATA_KEY.REPLICA_IDS,
    );
    if (replicaIds.length > NUM.ZERO) {
      operation[ReplicaOperationField.REPLICA_IDS] = replicaIds;
    }
    const peerAddresses = getOperationMetadataStringArray(
      stepsHistory,
      OPERATION_METADATA_KEY.PEER_ADDRESSES,
    );
    if (peerAddresses.length > NUM.ZERO) {
      operation[ReplicaOperationField.PEER_ADDRESSES] = peerAddresses;
    }
    const bootstrapTableMetadata = getOperationMetadataObject(
      stepsHistory,
      OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA,
    );
    if (bootstrapTableMetadata) {
      operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] = bootstrapTableMetadata;
    }
    const bootstrapPartitionMetadata = getOperationMetadataObject(
      stepsHistory,
      OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA,
    );
    if (bootstrapPartitionMetadata) {
      operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] = bootstrapPartitionMetadata;
    }
    return operation;
  }
  /**
   * Check whether an operation is in a terminal state.
   * Accepts both translated operation objects and raw rows.
   * @param {object} operation
   * @return {boolean}
   */
  isOperationTerminal(operation) {
    if (!operation) {
      return false;
    }
    const semanticPhase =
      operation.semanticPhase ||
      resolveReplicaOperationSemanticPhase(
        operation.type || null,
        operation.workflowStep ?? operation.workflow_step ?? null,
        operation.status || null,
      );
    if (isTerminalReplicaOperationSemanticPhase(semanticPhase)) {
      return true;
    }
    if (semanticPhase !== REPLICA_OPERATION_SEMANTIC_PHASE.UNKNOWN) {
      return false;
    }
    const operationType = operation.type || null;
    const workflowStep = operation.workflowStep ?? operation.workflow_step ?? null;
    if (
      typeof operationType === TYPEOF.STRING &&
      typeof workflowStep === TYPEOF.STRING &&
      workflowStep.length > NUM.ZERO
    ) {
      if (isTerminalStep(operationType, workflowStep)) {
        return true;
      }
      if (isValidWorkflowStep(operationType, workflowStep)) {
        return false;
      }
    }
    const status = String(operation.status || '').toLowerCase();
    return TERMINAL_STATUSES.includes(status);
  }
  /**
   * Resolve the owner node ID from an operation or raw row.
   * @param {object} operation
   * @return {string|null}
   */
  resolveOperationOwnerNodeId(operation) {
    const partitionId = String(operation?.partitionId || operation?.partition_id || '');
    const sourceNodeId = String(operation?.sourceNodeId || operation?.source_node_id || '');
    const targetNodeId = String(operation?.targetNodeId || operation?.target_node_id || '');
    const semanticPhase =
      operation?.semanticPhase ||
      resolveReplicaOperationSemanticPhase(
        operation?.type || null,
        operation?.workflowStep || operation?.workflow_step || null,
        operation?.status || null,
      );
    if (
      operation?.type === OperationType.REPLACE &&
      isPriorityControlPlanePartition({partitionId}) &&
      targetNodeId.length > NUM.ZERO &&
      semanticPhase !== REPLICA_OPERATION_SEMANTIC_PHASE.SETTLED &&
      semanticPhase !== REPLICA_OPERATION_SEMANTIC_PHASE.FAILED
    ) {
      // Keep canonical ownership on the target from initial dispatch through
      // source removal so the replacement host can survive transient dispatch
      // failures without handing ownership back to a degraded source.
      return targetNodeId;
    }
    if (sourceNodeId.length > NUM.ZERO) {
      return sourceNodeId;
    }
    if (targetNodeId.length > NUM.ZERO) {
      return targetNodeId;
    }
    return null;
  }
  /**
   * Check whether an operation is owned by this node.
   * @param {object} operation
   * @return {boolean}
   */
  isOperationLocallyOwned(operation) {
    return this.resolveOperationOwnerNodeId(operation) === this.nodeId;
  }
  /**
   * Extract the source replica ID for a REPLACE operation.
   * @param {object} operation
   * @return {string|null}
   */
  getReplaceSourceReplicaId(operation) {
    if (!operation || operation.type !== OperationType.REPLACE) {
      return null;
    }
    if (operation.sourceReplicaId) {
      return operation.sourceReplicaId;
    }
    if (!Array.isArray(operation.stepsHistory)) {
      return null;
    }
    return getOperationMetadataString(
      operation.stepsHistory,
      OPERATION_METADATA_KEY.SOURCE_REPLICA_ID,
    );
  }
  /**
   * Check whether a REPLACE operation is in the remove phase.
   * @param {object} operation
   * @return {boolean}
   */
  isReplaceRemovePhase(operation) {
    return (
      operation?.type === OperationType.REPLACE && operation?.workflowStep === WORKFLOW_STEP.ACTIVE
    );
  }
  /**
   * Check whether a REPLACE operation is currently dispatching source removal.
   * This includes the initial ACTIVE dispatch and STOPPING reconciliation
   * re-dispatch while removal completion is still being observed.
   * @param {object} operation
   * @return {boolean}
   */
  isReplaceRemoveDispatchPhase(operation) {
    return isReplaceRemoveDispatchPhase(operation);
  }
  /**
   * Extract the target replica ID for a REPLACE operation.
   * @param {object} operation
   * @return {string|null}
   */
  getReplaceTargetReplicaId(operation) {
    if (operation?.type !== OperationType.REPLACE) {
      return null;
    }
    const sourceReplicaId = this.getReplaceSourceReplicaId(operation);
    if (typeof sourceReplicaId !== TYPEOF.STRING || sourceReplicaId.length === NUM.ZERO) {
      return null;
    }
    if (typeof operation?.replicaId !== TYPEOF.STRING || operation.replicaId.length === NUM.ZERO) {
      return null;
    }
    if (operation.replicaId === sourceReplicaId) {
      return null;
    }
    return operation.replicaId;
  } // ── Cache Read Methods ──────────────────────────────────────────
  /**
   * Get a single replica_operations row from cache by operation ID.
   * @param {string} operationId
   * @return {object|null}
   */
  getReplicaOperationRowFromCache(operationId) {
    if (!this.systemTableCache || !operationId) {
      return null;
    }
    if (typeof this.systemTableCache.get === TYPEOF.FUNCTION) {
      return this.systemTableCache.get(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId) || null;
    }
    if (typeof this.systemTableCache.getAll === TYPEOF.FUNCTION) {
      const rows = this.systemTableCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) || [];
      return rows.find((row) => row?.operation_id === operationId) || null;
    }
    return null;
  }
  /**
   * Filter replica_operations rows from cache using a predicate.
   * @param {Function} predicate
   * @return {Array|null} null when cache is unavailable
   */
  filterReplicaOperationRowsFromCache(predicate) {
    if (!this.systemTableCache || typeof predicate !== TYPEOF.FUNCTION) {
      return null;
    }
    if (typeof this.systemTableCache.filter === TYPEOF.FUNCTION) {
      return this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, predicate) || [];
    }
    if (typeof this.systemTableCache.getAll === TYPEOF.FUNCTION) {
      const rows = this.systemTableCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) || [];
      return rows.filter(predicate);
    }
    return null;
  }
  /**
   * Return true when one cache observation boundary exists for
   * replica_operations.
   * @return {boolean}
   */
  hasReplicaOperationCacheObservationBoundary() {
    return Boolean(
      this.systemTableCache &&
      (typeof this.systemTableCache.filter === TYPEOF.FUNCTION ||
        typeof this.systemTableCache.getAll === TYPEOF.FUNCTION),
    );
  }
}

assignReplicaOperationRepositoryReadMethods(ReplicaOperationRepository, {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_PARTICIPATION_KIND,
  ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE,
  INITIAL_PARTITION_IDS,
  INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD,
  INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS,
  INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS,
  INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE,
  NUM,
  OperationType,
  REPLICA_OPERATION_LOCAL_VISIBILITY_READ_QUERY_OPTIONS,
  REBALANCE_COORDINATOR_LOG_MSG,
  REPLICA_OPERATION_LOCAL_OWNER_READ_QUERY_OPTIONS,
  REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS,
  REPLICA_OPERATION_READINESS_DIMENSION,
  REPLICA_OPERATION_REPOSITORY_LITERAL,
  REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
  REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS,
  SERVICE_TYPE,
  SQL,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  UNIFIED_SERVICE_TYPE,
  buildControlPlaneFailurePayload,
  buildReplicaOperationVisibilityReadOptions,
  getControlPlaneRetryAfterMs,
  isCoordinatorOwnedOperationType,
  isRetryableControlPlaneError,
  readAuthoritativeControlPlaneRows,
  resolveAuthoritativeReadModeContract,
  resolveReplicaOperationVisibilityReadMode,
  shouldDeferReplicaOperationOwnerRead,
  WORKFLOW_STEP,
});

assignReplicaOperationRepositoryMutationMethods(ReplicaOperationRepository, {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_QUERY_OPTIONS,
  COORDINATOR_OWNER_COMPONENT,
  ERRORS,
  NUM,
  OPERATION_PERSIST_RETRY_DELAY_MS,
  OPERATION_PERSIST_RETRY_TIMEOUT_MS,
  OPERATION_MUTATION_SESSION_RETRY_DECISION,
  PARTITION_SERVICE_ERROR_MSG,
  PRESSURE_WORK_CLASS,
  QUERY_ERROR_MSG,
  READ_MODEL_DIVERGENCE_TYPE,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_SUBSYSTEM,
  REPLICA_OPERATION_MUTATION_WORKLOAD_PROFILE,
  REPLICA_OPERATION_MUTATION_QUERY_TIMEOUT_MS,
  REPLICA_OPERATION_OWNER_NAME,
  REPLICA_OPERATION_REPOSITORY_LITERAL,
  REPLICA_OPERATION_TRANSITION_LANE,
  REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
  RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS,
  RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES,
  RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES,
  SQL,
  SQL_RECONCILIATION_REASON,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  buildControlPlaneFailurePayload,
  buildDivergenceEvent,
  cloneControlPlaneFailureParticipants,
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  getRemainingBudgetMs,
  hasControlPlaneMutationRoutingGapFailureSignature,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
  isRetryableWorkflowParticipantLookupErrorMessage,
  ROUTER_ERROR_MSG,
  TRANSPORT_ERROR_MSG,
  uuidv4,
});

assignReplicaOperationRepositoryObservationMethods(ReplicaOperationRepository, {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  COORDINATOR_OWNER_COMPONENT,
  NUM,
  RAFT_ROLE,
  READ_MODEL_DIVERGENCE_TYPE,
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REPLICA_OPERATION_CANONICAL_STATUS_READ_QUERY_OPTIONS,
  REPLICA_OPERATION_LOCAL_STATUS_READ_QUERY_OPTIONS,
  REPLICA_OPERATION_REPOSITORY_LITERAL,
  ReplicaStatus,
  SERVICE_TYPE,
  SQL,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  buildDivergenceEvent,
  readAuthoritativeControlPlaneRows,
});

export {
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationRepository,
  SQL,
};
