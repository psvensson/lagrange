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
import {
  isPriorityControlPlanePartition,
  isSystemTablePartition,
} from '../bootstrap/system-partition-classification.js';
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
  OperationType,
  ReplicaStatus,
  buildReplicaOperationSemanticWitnesses,
  getOperationMetadataObject,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  isTerminalReplicaOperationRecord,
  isReplaceRemoveDispatchPhase,
  isCoordinatorOwnedOperationType,
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
import {
  assignReplicaOperationRepositoryVisibilityMethods,
} from './replica-operation-repository-visibility-methods.js';
import {
  assignReplicaOperationRepositoryRowMethods,
} from './replica-operation-repository-row-methods.js';

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
      OR (workflow_step = ? AND type IN (?, ?))
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
const PRIORITY_RECOVERY_INCOMPLETE_OPERATION_OWNER_VISIBILITY_GRACE_MS = TIME_MS.MINUTE * 2;
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
      .slice(0, NUM.THREE) :
    [];
  const firstFailedParticipant =
    resultOrError?.firstFailedParticipant &&
    typeof resultOrError.firstFailedParticipant === 'object' ?
      resultOrError.firstFailedParticipant :
      participantFailures.length > 0 ?
        participantFailures[0] :
        null;
  return {
    error: resultOrError?.error || resultOrError?.message || null,
    nodeId,
    code: getControlPlaneErrorCode(resultOrError) || null,
    retryAfterMs: getControlPlaneRetryAfterMs(resultOrError),
    reasonCode:
      typeof resultOrError?.reasonCode === 'string' ? resultOrError.reasonCode : null,
    participationKind:
      typeof resultOrError?.participationKind === 'string' ?
        resultOrError.participationKind :
        null,
    tableName:
      typeof resultOrError?.tableName === 'string' ?
        resultOrError.tableName :
        typeof firstFailedParticipant?.failedTable === 'string' ?
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
      participantFailures.length > 0 ?
        participantFailures[0] :
        null;
  return {participantFailures, firstFailedParticipant};
}
const CONTROL_PLANE_QUERY_OPTIONS = Object.freeze({
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
});
const REPLICA_OPERATION_READINESS_DIMENSION =
  CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
const REPLICA_OPERATION_READ_PREFER_LEADER = false;
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
  preferLeader: REPLICA_OPERATION_READ_PREFER_LEADER,
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
    typeof errorMessage === 'string' &&
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
    this.random = typeof options.random === 'function' ? options.random : Math.random;
    this.lastIncompleteOperationQueryWarningAtMs = 0;
    this.nextIncompleteOperationSqlRetryAtMs = 0;
    this.lastIncompleteOperationObservation = [];
    this.lastIncompleteOperationObservationAtMs = 0;
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
      options.authoritativeVisibilityTimeoutMs >= 0 ?
        Math.floor(options.authoritativeVisibilityTimeoutMs) :
        REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS;
    this.replicaOperationAuthoritativeVisibilityRetryDelayMs =
      Number.isFinite(options.authoritativeVisibilityRetryDelayMs) &&
      options.authoritativeVisibilityRetryDelayMs >= 0 ?
        Math.floor(options.authoritativeVisibilityRetryDelayMs) :
        REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_RETRY_DELAY_MS;
    this._shuttingDown = false;
  }
  /**
   * Signal that the owning rebalance coordinator is shutting down. The
   * authoritative read-retry and operation-persist-retry loops check this and
   * stop re-arming their backoff delays; otherwise an operation whose reads/
   * writes keep failing retryably against a torn-down cluster re-arms a ref'd
   * timer indefinitely and keeps the event loop alive after teardown.
   */
  markShuttingDown() {
    this._shuttingDown = true;
  }
  /**
   * @return {boolean} true once the owning coordinator has begun shutting down.
   */
  isShuttingDownRequested() {
    return this._shuttingDown === true;
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
}

assignReplicaOperationRepositoryVisibilityMethods(ReplicaOperationRepository, {
  CONTROL_PLANE_PUBLICATION_STATUS,
  ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE,
  INCOMPLETE_OPERATION_OBSERVATION_SOURCE,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_CEILING_MS,
  INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS,
  INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS,
  INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE,
  INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE,
  NUM,
  PRIORITY_RECOVERY_COMPLETION_STATE,
  PRIORITY_RECOVERY_INCOMPLETE_OPERATION_OWNER_VISIBILITY_GRACE_MS,
  PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STALE_GRACE_MS,
  REPLICA_OPERATION_OWNER_PERSISTED_TRANSITION_VISIBILITY_GRACE_MS,
  REPLICA_OPERATION_READ_RETRY_DELAY_MS,
  REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS,
  REPLICA_OPERATION_REPOSITORY_LITERAL,
  REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
  REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
  REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  REPLICA_OPERATION_VISIBILITY_REASON,
  TYPEOF,
  buildPriorityRecoveryCompletion,
  buildReplicaOperationVisibilityReadOptions,
  getControlPlaneRetryAfterMs,
  hasPriorityRecoverySpreadGap,
  isRetryableControlPlaneError,
  resolveIncompleteOperationVisibilitySupplementMode,
  resolveReplicaOperationVisibilityReadMode,
});

assignReplicaOperationRepositoryRowMethods(ReplicaOperationRepository, {
  NUM,
  OPERATION_METADATA_KEY,
  OperationType,
  REBALANCE_COORDINATOR_LOG_MSG,
  REPLICA_OPERATION_REPOSITORY_LITERAL,
  REPLICA_OPERATION_SEMANTIC_PHASE,
  ReplicaOperationField,
  SERVICE_TYPE,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  WORKFLOW_STEP,
  buildReplicaOperationSemanticWitnesses,
  getOperationMetadataObject,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  isPriorityControlPlanePartition,
  isReplaceRemoveDispatchPhase,
  isSystemTablePartition,
  isTerminalReplicaOperationRecord,
  resolveReplicaOperationSemanticPhase,
});

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
  isPriorityControlPlanePartition,
  isCoordinatorOwnedOperationType,
  isRetryableControlPlaneError,
  isSystemTablePartition,
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
  REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationRepository,
  SQL,
};
