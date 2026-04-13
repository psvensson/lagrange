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

import { v4 as uuidv4 } from 'uuid';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME } from
'../bootstrap/system-table-schemas-constants.js';
import {
  isPriorityControlPlanePartition } from
'../bootstrap/system-partition-classification.js';
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON } from
'../control-plane/control-plane-readiness-constants.js';
import {
  PRESSURE_WORK_CLASS } from
'../control-plane/pressure-governor.js';
import {
  WORKFLOW_STEP, NUM, ERRORS, TIME_MS, TYPEOF,
  UNIFIED_SERVICE_TYPE } from
'../constants/index.js';
import { SERVICE_TYPE } from '../constants/service.js';
import {
  buildControlPlaneQueryOptions,
  getRemainingBudgetMs } from
'../control-plane/timeout-budget.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_READ_STRATEGY,
  readAuthoritativeControlPlaneRows } from
'../control-plane/control-plane-system-table-gateway.js';
import {
  COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE,
  OPERATION_METADATA_KEY,
  TERMINAL_STATUSES,
  OperationType,
  ReplicaStatus,
  getOperationMetadataObject,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  isReplaceRemoveDispatchPhase,
  isValidWorkflowStep,
  isTerminalStep,
  isCoordinatorOwnedOperationType } from
'./replica-status.js';
import {
  ReplicaOperationField } from
'./replica-operation-constants.js';
import {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCE_COORDINATOR_LOG_MSG,
  REBALANCER_SUBSYSTEM } from
'./rebalancer-constants.js';
import {
  READ_MODEL_DIVERGENCE_TYPE,
  SQL_RECONCILIATION_REASON,
  buildDivergenceEvent } from
'../control-plane/read-model-contract.js';
import {
  QUERY_ERROR_MSG } from
'../query/query-constants.js';
import {
  PARTITION_SERVICE_ERROR_MSG } from
'../partition/partition-service-constants.js';
import { RAFT_ROLE } from '../raft/constants.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError } from
'../control-plane/control-plane-error-classification.js';

/**
 * SQL queries for replica_operations table access.
 * All system information access must go through SQL engine.
 */const REPLICA_OPERATION_REPOSITORY_LITERAL = Object.freeze({ WORKFLOW_PARTICIPANT:



























































































































































































  'Workflow participant ', NOT_FOUND:
  ' not found', SYSTEMTABLECACHE:





























































  'systemTableCache', CDCINTEGRATIONSERVICE:


  'cdcIntegrationService', CONTROLPLANESYSTEMTABLEGATEWAY:


  'controlPlaneSystemTableGateway', CONTROLPLANEREADINESSSERVICE:



  'controlPlaneReadinessService', LOGGER:



  'logger', CONTROL_PLANE_PARTICIPATION_DEFERRED_BY_CANONICAL_READINESS:



































































































































































































































































































































































































































































































































  'Control-plane participation deferred by canonical readiness', VALUE:


































































































  '', IN_FLIGHT_OPERATION_OWNER_QUERY_INDICATES:






















































































































  'In-flight operation owner query indicates', CONTROL_PLANE_PRESSURE:
  ' control-plane pressure', AUTHORITATIVE_REPLICA_OPERATION_NOT_CONFIRMED:













































































































































































































































































































































































































































































  'Authoritative replica operation not confirmed: ', REPLICAOPERATIONREPOSITORY_REQUIRES_A_CONTROL_PLANE_MUTATION_INGRESS:























































































































































































































































































































































  'ReplicaOperationRepository requires a control-plane mutation ingress', OBJECT:






































































































































































































































  'object', CRITICAL:



























  'critical', WRITE:






  'write', OBSERVED:























































































































































































































































































































































































































































































  'observed', CACHE_FALLBACK_AFTER_AUTHORITATIVE_FAILURE:


  'cache_fallback_after_authoritative_failure', CACHE:
  'cache', AUTHORITATIVE:









  'authoritative', ABSENT:







  'absent', UNAVAILABLE:
  'unavailable' });const SQL = Object.freeze({ SELECT_OPERATION_BY_ID: 'SELECT * FROM replica_operations WHERE operation_id = ?', SELECT_INCOMPLETE_OPERATIONS: `SELECT * FROM replica_operations
    WHERE (source_node_id = ? OR target_node_id = ?)
    AND type IN (${COORDINATOR_OWNED_OPERATION_TYPES_SQL_CLAUSE})
    AND (
      workflow_step IN (?, ?, ?, ?, ?)
      OR (workflow_step = ? AND type = ?)
    )`, SELECT_OPERATIONS_BY_PARTITION: 'SELECT * FROM replica_operations WHERE partition_id = ?', SELECT_OPERATIONS_BY_ENTITY: `SELECT * FROM replica_operations
    WHERE (
      (entity_type = ? AND entity_id = ?)
      OR ((entity_type IS NULL OR entity_type = '') AND partition_id = ?)
    )`, SELECT_IN_FLIGHT_FOR_ENTITY_NODE: `SELECT * FROM replica_operations
    WHERE partition_id = ? AND target_node_id = ?
    AND (
      (entity_type = ? AND entity_id = ?)
      OR (entity_type IS NULL OR entity_type = '')
    )`, SELECT_IN_FLIGHT_BY_TYPE: `SELECT * FROM replica_operations 
    WHERE type = ?`, SELECT_ALL_OPERATIONS: 'SELECT * FROM replica_operations ORDER BY created_at DESC', INSERT_OPERATION: `INSERT INTO replica_operations (
    operation_id, type, partition_id, replica_id, source_node_id,
    target_node_id, status, workflow_step, created_at, updated_at,
    completed_at, error_message, steps_history,
    entity_type, entity_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, UPDATE_OPERATION: `UPDATE replica_operations SET 
    status = ?, workflow_step = ?, updated_at = ?, completed_at = ?, 
    error_message = ?, steps_history = ?, replica_id = ?
    WHERE operation_id = ?`, UPDATE_OPERATION_EXPECTING_STEP: `UPDATE replica_operations SET
    status = ?, workflow_step = ?, updated_at = ?, completed_at = ?,
    error_message = ?, steps_history = ?, replica_id = ?
    WHERE operation_id = ? AND workflow_step = ?`, SELECT_REPLICA_STATUS: `SELECT service_id, replica_id, partition_id, node_id,
      service_type, status, raft_role, address
    FROM services WHERE service_id = ?`, SELECT_REPLICA_BY_PARTITION_NODE: `SELECT service_id, replica_id,
      partition_id, node_id, service_type, status, raft_role, address
    FROM services 
    WHERE partition_id = ? AND node_id = ?` });const OPERATION_PERSIST_RETRY_DELAY_MS = TIME_MS.SECOND / NUM.FOUR;const OPERATION_PERSIST_RETRY_TIMEOUT_MS = TIME_MS.SECOND * (NUM.TEN + NUM.FIVE);const INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS = TIME_MS.SECOND;const INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS = TIME_MS.SECOND * NUM.TEN;const INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD = 1000;const INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS = TIME_MS.SECOND / NUM.FOUR;const INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_CEILING_MS = TIME_MS.SECOND * NUM.FIVE;const COORDINATOR_OWNER_COMPONENT = 'RebalanceCoordinator';const REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS = TIME_MS.SECOND * NUM.FIVE;const REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_RETRY_DELAY_MS = TIME_MS.SECOND / NUM.FIVE;const REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS = TIME_MS.SECOND;const REPLICA_OPERATION_READ_RETRY_DELAY_MS = TIME_MS.SECOND / NUM.TEN;function shouldDeferReplicaOperationOwnerRead(participation) {return participation?.reasonCode === CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY;}function buildControlPlaneFailurePayload(nodeId, resultOrError) {const participantFailures = Array.isArray(resultOrError?.participantFailures) ? resultOrError.participantFailures.filter((entry) => entry && typeof entry === 'object').slice(NUM.ZERO, NUM.THREE) : [];const firstFailedParticipant = resultOrError?.firstFailedParticipant && typeof resultOrError.firstFailedParticipant === 'object' ? resultOrError.firstFailedParticipant : participantFailures.length > NUM.ZERO ? participantFailures[NUM.ZERO] : null;return { error: resultOrError?.error || resultOrError?.message || null, nodeId, code: getControlPlaneErrorCode(resultOrError) || null, retryAfterMs: getControlPlaneRetryAfterMs(resultOrError), reasonCode: typeof resultOrError?.reasonCode === TYPEOF.STRING ? resultOrError.reasonCode : null, participationKind: typeof resultOrError?.participationKind === TYPEOF.STRING ? resultOrError.participationKind : null, tableName: typeof resultOrError?.tableName === TYPEOF.STRING ? resultOrError.tableName : typeof firstFailedParticipant?.failedTable === TYPEOF.STRING ? firstFailedParticipant.failedTable : null, participantFailures, firstFailedParticipant };}function cloneControlPlaneFailureParticipants(resultOrError) {const participantFailures = Array.isArray(resultOrError?.participantFailures) ? resultOrError.participantFailures.filter((entry) => entry && typeof entry === 'object').map((entry) => ({ ...entry })) : [];const firstFailedParticipant = resultOrError?.firstFailedParticipant && typeof resultOrError.firstFailedParticipant === 'object' ? { ...resultOrError.firstFailedParticipant } : participantFailures.length > NUM.ZERO ? participantFailures[NUM.ZERO] : null;return { participantFailures, firstFailedParticipant };}const CONTROL_PLANE_QUERY_OPTIONS = Object.freeze({ ...buildControlPlaneQueryOptions(), routingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE });const REPLICA_OPERATION_READINESS_DIMENSION = CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;const REPLICA_OPERATION_READ_QUERY_OPTIONS = Object.freeze({ ...CONTROL_PLANE_QUERY_OPTIONS, routingReadinessDimension: REPLICA_OPERATION_READINESS_DIMENSION, readStrategy: CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED, controlPlaneTableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, controlPlaneOperationKind: 'read', workClass: PRESSURE_WORK_CLASS.CRITICAL, deliveryPriority: 'critical', allowPressureDefer: false, allowSqlFallback: true });const REPLICA_OPERATION_STRICT_DEDUPE_READ_QUERY_OPTIONS = Object.freeze({ ...REPLICA_OPERATION_READ_QUERY_OPTIONS, preferOwnerRpcRead: true, requireOwnerRpcRead: true, allowOwnerRpcFallback: true, allowSqlFallback: false });const REPLICA_OPERATION_PERSIST_CONFIRMATION_READ_QUERY_OPTIONS = Object.freeze({ ...REPLICA_OPERATION_READ_QUERY_OPTIONS, preferOwnerRpcRead: true, requireOwnerRpcRead: false, allowOwnerRpcFallback: true, allowSqlFallback: false });const REPLICA_STATUS_READ_QUERY_OPTIONS = Object.freeze({ ...CONTROL_PLANE_QUERY_OPTIONS, preferOwnerRpcRead: true, allowOwnerRpcFallback: true });const RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES = Object.freeze([QUERY_ERROR_MSG.TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX]);const RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES = Object.freeze([PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE]);const RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS = Object.freeze([ERRORS.NO_HANDLER_FOR_ADDRESS]);const REPLICA_OPERATION_TRANSITION_LANE = Object.freeze({ DEFAULT: 'default', PRIORITY_RECOVERY: 'priority_recovery' });const REPLICA_OPERATION_OWNER_NAME = 'replica-operations-owner';function isRetryableWorkflowParticipantLookupErrorMessage(errorMessage) {return typeof errorMessage === TYPEOF.STRING && errorMessage.startsWith(REPLICA_OPERATION_REPOSITORY_LITERAL.WORKFLOW_PARTICIPANT) && errorMessage.endsWith(REPLICA_OPERATION_REPOSITORY_LITERAL.NOT_FOUND);} /**
 * ReplicaOperationRepository owns all SQL/cache access and row <-> operation
 * translation for replica_operations.
 *
 * The coordinator facade delegates persistence and query concerns here.
 * This class does NOT own workflow progression, admission, or intent dedup.
 */class ReplicaOperationRepository {/**
   * @param {object} options
   * @param {string} options.nodeId
   * @param {object} options.systemTableCache
   * @param {object} options.cdcIntegrationService
   * @param {object} options.controlPlaneSystemTableGateway
   * @param {object} options.logger
   * @param {object} [options.emitter] - EventEmitter for divergence events
   */constructor(options) {this.nodeId = options.nodeId;this.systemTableCache = options.systemTableCache;this.cdcIntegrationService = options.cdcIntegrationService;this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway;this.controlPlaneReadinessService = options.controlPlaneReadinessService || null;this.logger = options.logger;this.emitter = options.emitter || null;this.random = typeof options.random === TYPEOF.FUNCTION ? options.random : Math.random;this.lastIncompleteOperationQueryWarningAtMs = NUM.ZERO;this.nextIncompleteOperationSqlRetryAtMs = NUM.ZERO;this.replicaOperationTransitionQueues = new Map([[REPLICA_OPERATION_TRANSITION_LANE.DEFAULT, Promise.resolve()], [REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY, Promise.resolve()]]);this.replicaOperationAuthoritativeVisibilityTimeoutMs = Number.isFinite(options.authoritativeVisibilityTimeoutMs) && options.authoritativeVisibilityTimeoutMs >= NUM.ZERO ? Math.floor(options.authoritativeVisibilityTimeoutMs) : REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_TIMEOUT_MS;this.replicaOperationAuthoritativeVisibilityRetryDelayMs = Number.isFinite(options.authoritativeVisibilityRetryDelayMs) && options.authoritativeVisibilityRetryDelayMs >= NUM.ZERO ? Math.floor(options.authoritativeVisibilityRetryDelayMs) : REPLICA_OPERATION_AUTHORITATIVE_VISIBILITY_RETRY_DELAY_MS;} /**
   * Synchronize mutable runtime dependencies after construction.
   * @param {Object} [options={}]
   */syncOwnerDependencies(options = {}) {if (Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.SYSTEMTABLECACHE)) {this.systemTableCache = options.systemTableCache || null;}if (Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.CDCINTEGRATIONSERVICE)) {this.cdcIntegrationService = options.cdcIntegrationService || null;}if (Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROLPLANESYSTEMTABLEGATEWAY)) {this.controlPlaneSystemTableGateway = options.controlPlaneSystemTableGateway || null;}if (Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROLPLANEREADINESSSERVICE)) {this.controlPlaneReadinessService = options.controlPlaneReadinessService || null;}if (Object.hasOwn(options, REPLICA_OPERATION_REPOSITORY_LITERAL.LOGGER)) {this.logger = options.logger || console;}} /**
   * Bound retryable SQL backoff for replica_operations owner reads.
   * @param {Object} result
   * @return {number}
   * @private
   */getRetryableIncompleteOperationReadBackoffMs(result) {const retryAfterMs = getControlPlaneRetryAfterMs(result);if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {return Math.min(INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_CEILING_MS, Math.max(INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS, retryAfterMs));}return INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS;} /**
   * Bound authoritative operation-id read retries to a short window.
   * @param {Object} result
   * @return {number}
   * @private
   */getRetryableReplicaOperationReadRetryDelayMs(result) {const retryAfterMs = getControlPlaneRetryAfterMs(result);if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {return Math.max(REPLICA_OPERATION_READ_RETRY_DELAY_MS, Math.min(REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS, retryAfterMs));}return REPLICA_OPERATION_READ_RETRY_DELAY_MS;} /**
   * Wait before retrying one authoritative replica_operations read.
   * @param {number} delayMs
   * @return {Promise<void>}
   */async waitForReplicaOperationReadRetry(delayMs) {await new Promise((resolve) => setTimeout(resolve, delayMs));} // ── Row <-> Operation Translation ──────────────────────────────
  /**
   * Translate a raw SQL/cache row into a normalized operation object.
   * @param {object} row
   * @return {object}
   */rowToOperation(row) {let stepsHistory = [];if (row.steps_history) {try {stepsHistory = JSON.parse(row.steps_history);} catch (error) {this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.STEPS_HISTORY_PARSE_ERROR, { operationId: row.operation_id, error: error.message });stepsHistory = [];}}const operation = { operationId: row.operation_id, type: row.type, partitionId: row.partition_id, entityType: row.entity_type || SERVICE_TYPE.PARTITION, entityId: row.entity_id || row.partition_id, replicaId: row.replica_id, sourceNodeId: row.source_node_id, targetNodeId: row.target_node_id, status: row.status, workflowStep: row.workflow_step, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at, errorMessage: row.error_message, stepsHistory };operation.sourceReplicaId = this.getReplaceSourceReplicaId(operation);const replicaIds = getOperationMetadataStringArray(stepsHistory, OPERATION_METADATA_KEY.REPLICA_IDS);if (replicaIds.length > NUM.ZERO) {operation[ReplicaOperationField.REPLICA_IDS] = replicaIds;}const peerAddresses = getOperationMetadataStringArray(stepsHistory, OPERATION_METADATA_KEY.PEER_ADDRESSES);if (peerAddresses.length > NUM.ZERO) {operation[ReplicaOperationField.PEER_ADDRESSES] = peerAddresses;}const bootstrapTableMetadata = getOperationMetadataObject(stepsHistory, OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA);if (bootstrapTableMetadata) {operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] = bootstrapTableMetadata;}const bootstrapPartitionMetadata = getOperationMetadataObject(stepsHistory, OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA);if (bootstrapPartitionMetadata) {operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] = bootstrapPartitionMetadata;}return operation;} /**
   * Check whether an operation is in a terminal state.
   * Accepts both translated operation objects and raw rows.
   * @param {object} operation
   * @return {boolean}
   */isOperationTerminal(operation) {if (!operation) {return false;}const operationType = operation.type || null;const workflowStep = operation.workflowStep ?? operation.workflow_step ?? null;if (typeof operationType === TYPEOF.STRING && typeof workflowStep === TYPEOF.STRING && workflowStep.length > NUM.ZERO) {if (isTerminalStep(operationType, workflowStep)) {return true;}if (isValidWorkflowStep(operationType, workflowStep)) {return false;}}const status = String(operation.status || '').toLowerCase();return TERMINAL_STATUSES.includes(status);} /**
   * Resolve the owner node ID from an operation or raw row.
   * @param {object} operation
   * @return {string|null}
   */resolveOperationOwnerNodeId(operation) {const workflowStep = String(operation?.workflowStep || operation?.workflow_step || '');const partitionId = String(operation?.partitionId || operation?.partition_id || '');const sourceNodeId = String(operation?.sourceNodeId || operation?.source_node_id || '');const targetNodeId = String(operation?.targetNodeId || operation?.target_node_id || '');if (operation?.type === OperationType.REPLACE && isPriorityControlPlanePartition({ partitionId }) && targetNodeId.length > NUM.ZERO && (workflowStep === WORKFLOW_STEP.PENDING || workflowStep === WORKFLOW_STEP.SENDING || workflowStep === WORKFLOW_STEP.CREATING || workflowStep === WORKFLOW_STEP.SYNCING || workflowStep === WORKFLOW_STEP.ACTIVE || workflowStep === WORKFLOW_STEP.STOPPING)) {// Keep canonical ownership on the target from initial dispatch through
      // source removal so the replacement host can survive transient dispatch
      // failures without handing ownership back to a degraded source.
      return targetNodeId;}if (sourceNodeId.length > NUM.ZERO) {return sourceNodeId;}if (targetNodeId.length > NUM.ZERO) {return targetNodeId;}return null;} /**
   * Check whether an operation is owned by this node.
   * @param {object} operation
   * @return {boolean}
   */isOperationLocallyOwned(operation) {return this.resolveOperationOwnerNodeId(operation) === this.nodeId;} /**
   * Extract the source replica ID for a REPLACE operation.
   * @param {object} operation
   * @return {string|null}
   */getReplaceSourceReplicaId(operation) {if (!operation || operation.type !== OperationType.REPLACE) {return null;}if (operation.sourceReplicaId) {return operation.sourceReplicaId;}if (!Array.isArray(operation.stepsHistory)) {return null;}return getOperationMetadataString(operation.stepsHistory, OPERATION_METADATA_KEY.SOURCE_REPLICA_ID);} /**
   * Check whether a REPLACE operation is in the remove phase.
   * @param {object} operation
   * @return {boolean}
   */isReplaceRemovePhase(operation) {return operation?.type === OperationType.REPLACE && operation?.workflowStep === WORKFLOW_STEP.ACTIVE;} /**
   * Check whether a REPLACE operation is currently dispatching source removal.
   * This includes the initial ACTIVE dispatch and STOPPING reconciliation
   * re-dispatch while removal completion is still being observed.
   * @param {object} operation
   * @return {boolean}
   */isReplaceRemoveDispatchPhase(operation) {return isReplaceRemoveDispatchPhase(operation);} /**
   * Extract the target replica ID for a REPLACE operation.
   * @param {object} operation
   * @return {string|null}
   */getReplaceTargetReplicaId(operation) {if (operation?.type !== OperationType.REPLACE) {return null;}const sourceReplicaId = this.getReplaceSourceReplicaId(operation);if (typeof operation?.replicaId !== TYPEOF.STRING || operation.replicaId.length === NUM.ZERO) {return null;}if (operation.replicaId === sourceReplicaId) {return null;}return operation.replicaId;} // ── Cache Read Methods ──────────────────────────────────────────
  /**
   * Get a single replica_operations row from cache by operation ID.
   * @param {string} operationId
   * @return {object|null}
   */getReplicaOperationRowFromCache(operationId) {if (!this.systemTableCache || !operationId) {return null;}if (typeof this.systemTableCache.get === TYPEOF.FUNCTION) {return this.systemTableCache.get(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, operationId) || null;}if (typeof this.systemTableCache.getAll === TYPEOF.FUNCTION) {const rows = this.systemTableCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) || [];return rows.find((row) => row?.operation_id === operationId) || null;}return null;} /**
   * Filter replica_operations rows from cache using a predicate.
   * @param {Function} predicate
   * @return {Array|null} null when cache is unavailable
   */filterReplicaOperationRowsFromCache(predicate) {if (!this.systemTableCache || typeof predicate !== TYPEOF.FUNCTION) {return null;}if (typeof this.systemTableCache.filter === TYPEOF.FUNCTION) {return this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, predicate) || [];}if (typeof this.systemTableCache.getAll === TYPEOF.FUNCTION) {const rows = this.systemTableCache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) || [];return rows.filter(predicate);}return null;} /**
   * Return true when one cache observation boundary exists for
   * replica_operations.
   * @return {boolean}
   */hasReplicaOperationCacheObservationBoundary() {return Boolean(this.systemTableCache && (typeof this.systemTableCache.filter === TYPEOF.FUNCTION || typeof this.systemTableCache.getAll === TYPEOF.FUNCTION));} /**
   * Get service rows for an entity from cache.
   * @param {object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Array}
   */getEntityServiceRows({ partitionId, entityType, entityId }) {if (!this.systemTableCache || typeof this.systemTableCache.filter !== TYPEOF.FUNCTION) {return [];}return this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, (row) => {if (!row || row.service_type !== entityType) {return false;}if (entityType === SERVICE_TYPE.MESSAGE_GROUP) {return row.group_id === entityId;}if (entityType === UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE) {return row.service_id === entityId;}return row.partition_id === partitionId;}) || [];} /**
   * Get in-flight operation rows for an entity from cache.
   * @param {object} params
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Array}
   */getEntityInFlightOperationRows({ entityType, entityId }) {if (!this.systemTableCache || typeof this.systemTableCache.filter !== TYPEOF.FUNCTION) {return [];}return this.systemTableCache.filter(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, (row) => {if (!row || this.isOperationTerminal(row)) {return false;}const rowEntityType = row.entity_type || SERVICE_TYPE.PARTITION;const rowEntityId = row.entity_id || row.partition_id;return rowEntityType === entityType && rowEntityId === entityId;}) || [];} // ── SQL Read Methods ────────────────────────────────────────────
  /**
   * Execute a read query against the replica_operations table.
   * @param {string} sql
   * @param {Array} params
   * @return {Promise<object>}
   */async executeReplicaOperationsRead(sql, params = [], readOptions = null) {const participationFailure = this.buildReplicaOperationReadParticipationFailure();if (participationFailure) {return participationFailure;}const retryOnRetryableFailure = Boolean(readOptions && typeof readOptions === 'object' && readOptions.retryOnRetryableFailure === true);const queryOptions = readOptions && typeof readOptions === 'object' ? { ...REPLICA_OPERATION_READ_QUERY_OPTIONS, ...readOptions } : REPLICA_OPERATION_READ_QUERY_OPTIONS;delete queryOptions.retryOnRetryableFailure;const executeRead = async () => readAuthoritativeControlPlaneRows(this.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, sql, params, queryOptions);if (!retryOnRetryableFailure) {return executeRead();}const deadlineAtMs = Date.now() + REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS;while (true) {const result = await executeRead();if (result?.success !== false || !isRetryableControlPlaneError(result)) {return result;}const remainingMs = deadlineAtMs - Date.now();if (remainingMs <= NUM.ZERO) {return result;}await this.waitForReplicaOperationReadRetry(Math.min(this.getRetryableReplicaOperationReadRetryDelayMs(result), remainingMs));}} /**
   * Return a bounded deferred result when the canonical readiness owner says
   * the local replica_operations owner path should not issue a routed read yet.
   * @return {Object|null}
   * @private
   */buildReplicaOperationReadParticipationFailure() {if (!this.controlPlaneReadinessService || typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync !== TYPEOF.FUNCTION) {return null;}const participation = this.controlPlaneReadinessService.getControlPlaneParticipationSync(this.nodeId, { participationKind: CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ, decisionDimension: REPLICA_OPERATION_READINESS_DIMENSION, tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS] || null });if (!participation || participation.eligible === true) {return null;}if (participation.localExecutionAllowed === true) {return null;}if (!shouldDeferReplicaOperationOwnerRead(participation)) {return null;}return { success: false, tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, error: participation.error || REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROL_PLANE_PARTICIPATION_DEFERRED_BY_CANONICAL_READINESS, errorCode: participation.errorCode || null, code: participation.errorCode || null, reasonCode: participation.reasonCode || null, participationKind: participation.participationKind || null, retryAfterMs: getControlPlaneRetryAfterMs(participation) || null, deferRetry: participation.deferRetry === true, rows: [] };} /**
   * Query a single operation by ID (cache-first, SQL fallback).
   * @param {string} operationId
   * @return {Promise<object|null>}
   */async queryOperationById(operationId) {const cachedRow = this.getReplicaOperationRowFromCache(operationId);if (cachedRow) {return this.rowToOperation(cachedRow);}const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATION_BY_ID, [operationId]);if (!result.success || !result.rows || result.rows.length === NUM.ZERO) {return null;}const operation = this.rowToOperation(result.rows[NUM.ZERO]);return isCoordinatorOwnedOperationType(operation?.type) ? operation : null;} /**
   * Query a single operation by ID from the authoritative owner path only.
   * @param {string} operationId
   * @param {object} [options]
   * @param {boolean} [options.requireOwnerRpcRead]
   * @return {Promise<object|null>}
   */async queryAuthoritativeOperationById(operationId, options = {}) {const requireOwnerRpcRead = options?.requireOwnerRpcRead === true;const readQueryOptions = requireOwnerRpcRead ? REPLICA_OPERATION_STRICT_DEDUPE_READ_QUERY_OPTIONS : REPLICA_OPERATION_PERSIST_CONFIRMATION_READ_QUERY_OPTIONS;const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATION_BY_ID, [operationId], { ...readQueryOptions, retryOnRetryableFailure: true });if (!result.success || !Array.isArray(result.rows) || result.rows.length === NUM.ZERO) {return null;}const matchingRow = result.rows.find((row) => {return row?.operation_id === operationId;}) || result.rows[NUM.ZERO];const operation = this.rowToOperation(matchingRow);return isCoordinatorOwnedOperationType(operation?.type) ? operation : null;} /**
   * Normalize incomplete-operation rows into the canonical owner view.
   * @param {Object[]} rows
   * @return {Object[]}
   * @private
   */mapAndSortIncompleteOperations(rows = []) {return rows.map((row) => this.rowToOperation(row)).filter((operation) => isCoordinatorOwnedOperationType(operation?.type) && this.isOperationLocallyOwned(operation) && !this.isOperationTerminal(operation)).sort((left, right) => {const leftUpdatedAt = Number(left?.updatedAt) || NUM.ZERO;const rightUpdatedAt = Number(right?.updatedAt) || NUM.ZERO;if (leftUpdatedAt !== rightUpdatedAt) {return leftUpdatedAt - rightUpdatedAt;}return String(left?.operationId || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE).localeCompare(String(right?.operationId || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE));});} /**
   * Return only the cache-visible incomplete operations.
   * Callers that specifically need the cache observation boundary should use
   * this surface instead of tuning fallback behavior on the general read API.
   *
   * @return {Object[]}
   */queryCachedIncompleteOperations() {const cachedRows = this.filterReplicaOperationRowsFromCache((row) => {if (!row) {return false;}return row.workflow_step === WORKFLOW_STEP.PENDING || row.workflow_step === WORKFLOW_STEP.SENDING || row.workflow_step === WORKFLOW_STEP.CREATING || row.workflow_step === WORKFLOW_STEP.SYNCING || row.workflow_step === WORKFLOW_STEP.STOPPING || row.workflow_step === WORKFLOW_STEP.ACTIVE && row.type === OperationType.REPLACE;});if (cachedRows === null) {return [];}return this.mapAndSortIncompleteOperations(cachedRows);} /**
   * Query all incomplete (in-flight) operations owned by this node.
   * @param {object} [options={}]
   * @param {boolean} [options.preferAuthoritativeRead]
   * @return {Promise<Array>}
   */async queryIncompleteOperations(options = {}) {const preferAuthoritativeRead = options.preferAuthoritativeRead === true;const authoritativeReadOptions = preferAuthoritativeRead ? { ...REPLICA_OPERATION_STRICT_DEDUPE_READ_QUERY_OPTIONS, retryOnRetryableFailure: true } : null;if (!preferAuthoritativeRead) {const cachedOperations = this.queryCachedIncompleteOperations();if (cachedOperations.length === NUM.ZERO && this.nextIncompleteOperationSqlRetryAtMs > Date.now()) {return [];}if (cachedOperations.length > NUM.ZERO || options.skipSqlFallbackWhenCacheEmpty === true) {return cachedOperations;}}const queryStartedAtMs = Date.now();const result = await this.executeReplicaOperationsRead(SQL.SELECT_INCOMPLETE_OPERATIONS, [this.nodeId, this.nodeId, WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING, WORKFLOW_STEP.CREATING, WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.STOPPING, WORKFLOW_STEP.ACTIVE, OperationType.REPLACE], authoritativeReadOptions);const queryDurationMs = Date.now() - queryStartedAtMs;const rowCount = Array.isArray(result?.rows) ? result.rows.length : NUM.ZERO;if (!result.success || !result.rows) {const logPayload = buildControlPlaneFailurePayload(this.nodeId, result);if (isRetryableControlPlaneError(result)) {this.nextIncompleteOperationSqlRetryAtMs = Date.now() + this.getRetryableIncompleteOperationReadBackoffMs(result);this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, logPayload);} else {this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, logPayload);}return [];}this.nextIncompleteOperationSqlRetryAtMs = NUM.ZERO;const shouldWarnOnQueryPressure = queryDurationMs >= INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS || rowCount >= INCOMPLETE_OPERATION_QUERY_ROW_WARN_THRESHOLD;if (shouldWarnOnQueryPressure) {const nowMs = Date.now();if (nowMs - this.lastIncompleteOperationQueryWarningAtMs >= INCOMPLETE_OPERATION_QUERY_WARN_THROTTLE_MS) {this.lastIncompleteOperationQueryWarningAtMs = nowMs;this.logger.warn(REPLICA_OPERATION_REPOSITORY_LITERAL.IN_FLIGHT_OPERATION_OWNER_QUERY_INDICATES + REPLICA_OPERATION_REPOSITORY_LITERAL.CONTROL_PLANE_PRESSURE, { nodeId: this.nodeId, queryDurationMs, rowCount });}}return this.mapAndSortIncompleteOperations(result.rows);} /**
   * Query for an existing in-flight operation matching a move intent.
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @param {string} entityType
   * @param {string} entityId
   * @param {object} move
   * @param {Function} operationMatchesMoveIntent
   * @return {Promise<object|null>}
   */async queryExistingInFlightOperation(partitionId, targetNodeId, entityType, entityId, move, operationMatchesMoveIntent, options = {}) {const readOptions = options?.readOptions && typeof options.readOptions === 'object' ? options.readOptions : null;const allowCacheFallbackOnReadFailure = options?.allowCacheFallbackOnReadFailure === false ? false : readOptions?.requireOwnerRpcRead !== true;const result = await this.executeReplicaOperationsRead(SQL.SELECT_IN_FLIGHT_FOR_ENTITY_NODE, [partitionId, targetNodeId, entityType, entityId], readOptions);if (result.success && Array.isArray(result.rows)) {if (result.rows.length === NUM.ZERO) {return null;}const operations = result.rows.map((row) => this.rowToOperation(row));return operations.find((operation) => {return !this.isOperationTerminal(operation) && operationMatchesMoveIntent(operation, move, entityType, entityId);}) || null;}if (!allowCacheFallbackOnReadFailure) {return null;} // Fallback path for degraded SQL-read conditions.
    const cachedRows = this.filterReplicaOperationRowsFromCache((row) => {if (!row || row.partition_id !== partitionId || row.target_node_id !== targetNodeId) {return false;}return row.entity_type === entityType && row.entity_id === entityId || row.entity_type === null || row.entity_type === undefined || row.entity_type === '';});if (cachedRows === null) {return null;}const cachedOperations = cachedRows.map((row) => this.rowToOperation(row));return cachedOperations.find((operation) => {return !this.isOperationTerminal(operation) && operationMatchesMoveIntent(operation, move, entityType, entityId);}) || null;} /**
   * Get in-flight replica IDs for an entity.
   * @param {object} params
   * @param {string} params.partitionId
   * @param {string} params.entityType
   * @param {string} params.entityId
   * @return {Promise<Set<string>>}
   */async getEntityInFlightReplicaIds({ partitionId, entityType, entityId }) {const replicaIds = new Set();const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATIONS_BY_ENTITY, [entityType, entityId, entityId]);if (result.success && Array.isArray(result.rows)) {for (const row of result.rows) {const operation = this.rowToOperation(row);if (!operation || this.isOperationTerminal(operation)) {continue;}const replicaId = operation.replicaId;if (typeof replicaId === TYPEOF.STRING && replicaId.length > NUM.ZERO) {replicaIds.add(replicaId);}}return replicaIds;} // Fallback path for degraded SQL-read conditions.
    const cachedRows = this.filterReplicaOperationRowsFromCache((row) => {if (!row) {return false;}return row.entity_type === entityType && row.entity_id === entityId || (row.entity_type === null || row.entity_type === undefined || row.entity_type === '') && row.partition_id === partitionId;});if (cachedRows === null) {return replicaIds;}for (const row of cachedRows) {const operation = this.rowToOperation(row);if (!operation || this.isOperationTerminal(operation)) {continue;}const replicaId = operation.replicaId;if (typeof replicaId === TYPEOF.STRING && replicaId.length > NUM.ZERO) {replicaIds.add(replicaId);}}return replicaIds;} /**
   * Get all operations (cache-first, SQL fallback).
   * @return {Promise<Array>}
   */async getAllOperations() {const cachedRows = this.filterReplicaOperationRowsFromCache(() => true);if (cachedRows !== null) {return [...cachedRows].sort((left, right) => {const leftCreatedAt = Number(left?.created_at) || NUM.ZERO;const rightCreatedAt = Number(right?.created_at) || NUM.ZERO;if (leftCreatedAt !== rightCreatedAt) {return rightCreatedAt - leftCreatedAt;}return String(right?.operation_id || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE).localeCompare(String(left?.operation_id || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE));}).map((row) => this.rowToOperation(row));}const result = await this.executeReplicaOperationsRead(SQL.SELECT_ALL_OPERATIONS, []);if (!result.success || !result.rows) {return [];}return result.rows.map((row) => this.rowToOperation(row));} /**
   * Get operations for an entity (cache-first, SQL fallback).
   * @param {string} entityType
   * @param {string} entityId
   * @return {Promise<Array>}
   */async getOperationsByEntity(entityType, entityId) {const cachedRows = this.filterReplicaOperationRowsFromCache((row) => {if (!row) {return false;}return row.entity_type === entityType && row.entity_id === entityId || (row.entity_type === null || row.entity_type === undefined || row.entity_type === '') && row.partition_id === entityId;});if (cachedRows !== null) {return cachedRows.map((row) => this.rowToOperation(row));}const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATIONS_BY_ENTITY, [entityType, entityId, entityId]);if (!result.success || !result.rows) {return [];}return result.rows.map((row) => this.rowToOperation(row));} /**
   * Get operations for an entity from the authoritative replica_operations
   * owner path without consulting the cache projection first.
   * @param {string} entityType
   * @param {string} entityId
   * @return {Promise<Array>}
   */async getOperationsByEntityAuthoritative(entityType, entityId) {const result = await this.executeReplicaOperationsRead(SQL.SELECT_OPERATIONS_BY_ENTITY, [entityType, entityId, entityId]);if (!result.success || !result.rows) {return [];}return result.rows.map((row) => this.rowToOperation(row));} /**
   * Get count of non-terminal REMOVE operations.
   * @param {object} [options={}]
   * @return {Promise<number>}
   */async getConcurrentRemoveCount(options = {}) {const preferAuthoritativeRead = options.preferAuthoritativeRead === true;if (!preferAuthoritativeRead) {const cachedCount = this.queryCachedIncompleteOperations().filter((operation) => operation?.type === OperationType.REMOVE).length;if (cachedCount > NUM.ZERO || options.skipSqlFallbackWhenCacheEmpty === true) {return cachedCount;}}const result = await this.executeReplicaOperationsRead(SQL.SELECT_IN_FLIGHT_BY_TYPE, [OperationType.REMOVE]);if (!result.success || !result.rows) {return NUM.ZERO;}return result.rows.map((row) => this.rowToOperation(row)).filter((op) => !this.isOperationTerminal(op)).length;} // ── SQL Write Methods ───────────────────────────────────────────
  /**
   * Persist a new operation row via SQL INSERT.
   * @param {object} operation
   * @return {Promise<boolean>}
   */async persistNewOperation(operation) {return this.runReplicaOperationTransitionExclusive(async () => {const result = await this.executeReplicaOperationGatewayMutationWithRetry({ operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT, tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, row: this.buildReplicaOperationRow(operation), owner: REPLICA_OPERATION_OWNER_NAME }, { ownerId: operation.operationId }, { sql: SQL.INSERT_OPERATION, params: [operation.operationId, operation.type, operation.partitionId, operation.replicaId, operation.sourceNodeId, operation.targetNodeId, operation.status, operation.workflowStep, operation.createdAt, operation.updatedAt, operation.completedAt, operation.errorMessage, JSON.stringify(operation.stepsHistory), operation.entityType, operation.entityId] });if (!result.success) {const persistError = this.buildOperationPersistError(result);this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, { operationId: operation.operationId, ...buildControlPlaneFailurePayload(this.nodeId, result) });throw persistError;}await this.confirmReplicaOperationPersistence(operation);const changeCount = this.extractMutationChangeCount(result);return changeCount === null ? true : changeCount > NUM.ZERO;}, { operation });} /**
   * Persist an operation update via SQL UPDATE.
   * @param {object} operation
   * @param {object} [options]
   * @param {string} [options.sessionId]
   * @param {boolean} [options.confirmPersistence]
   * @param {string} [options.expectedWorkflowStep]
   * @return {Promise<boolean>} True when a row changed or authoritative
   *   confirmation already reflects the target state.
   */async persistOperationUpdate(operation, options = {}) {const expectedWorkflowStep = typeof options.expectedWorkflowStep === 'string' && options.expectedWorkflowStep.length > NUM.ZERO ? options.expectedWorkflowStep : null;const result = await this.executeReplicaOperationGatewayMutationWithRetry({ operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE, tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, whereClause: this.buildReplicaOperationUpdateWhereClause(operation, expectedWorkflowStep), data: this.buildReplicaOperationUpdateData(operation), owner: REPLICA_OPERATION_OWNER_NAME }, { ownerId: operation.operationId, sessionId: options.sessionId, timeoutBudget: options.timeoutBudget, mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING }, { sql: expectedWorkflowStep ? SQL.UPDATE_OPERATION_EXPECTING_STEP : SQL.UPDATE_OPERATION, params: this.buildReplicaOperationUpdateParams(operation, expectedWorkflowStep) });if (!result.success) {const persistError = this.buildOperationPersistError(result);this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED, { operationId: operation.operationId, ...buildControlPlaneFailurePayload(this.nodeId, result) });throw persistError;}const changeCount = this.extractMutationChangeCount(result);if (changeCount !== null && changeCount <= NUM.ZERO) {if (expectedWorkflowStep) {const authoritativeOperation = await this.queryAuthoritativeOperationById(operation.operationId, { requireOwnerRpcRead: false });return this.isReplicaOperationVisibilitySatisfied(operation, authoritativeOperation);}return false;}if (options.confirmPersistence === false) {return true;}await this.confirmReplicaOperationPersistence(operation);return true;} /**
   * Confirm a persisted operation through authoritative reads and diagnose
   * any cache lag as projection divergence.
   * @param {object} operation
   * @return {Promise<void>}
   */async confirmReplicaOperationPersistence(operation) {if (!operation?.operationId) {return;}const authoritativeOperation = await this.confirmReplicaOperationVisibility(operation);if (!authoritativeOperation) {throw new Error(REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE_REPLICA_OPERATION_NOT_CONFIRMED + operation.operationId);}this.emitReplicaOperationPersistenceDivergence(authoritativeOperation);} /**
   * Confirm replica operation visibility through bounded authoritative reads.
   * Cache propagation is eventually consistent under sustained control-plane
   * load, so one missed cache observation must not be treated as a hard loss
   * when the owner-local authoritative row is still progressing.
   * @param {object} operation
   * @return {Promise<object|null>}
   * @private
   */async confirmReplicaOperationVisibility(operation) {const deadlineMs = Date.now() + this.replicaOperationAuthoritativeVisibilityTimeoutMs;while (true) {const observedOperation = await this.queryAuthoritativeOperationById(operation.operationId);if (this.isReplicaOperationVisibilitySatisfied(operation, observedOperation)) {return observedOperation;}if (Date.now() >= deadlineMs) {return null;}await this.waitForReplicaOperationVisibilityRetry(this.replicaOperationAuthoritativeVisibilityRetryDelayMs);}} /**
   * @param {object} expectedOperation
   * @param {object|null} observedOperation
   * @return {boolean}
   * @private
   */isReplicaOperationVisibilitySatisfied(expectedOperation, observedOperation) {if (!observedOperation || observedOperation.operationId !== expectedOperation.operationId) {return false;}if (expectedOperation.replicaId !== null && expectedOperation.replicaId !== undefined && observedOperation.replicaId !== expectedOperation.replicaId) {return false;}if (expectedOperation.workflowStep !== null && expectedOperation.workflowStep !== undefined && observedOperation.workflowStep !== expectedOperation.workflowStep) {return false;}if (expectedOperation.status !== null && expectedOperation.status !== undefined && observedOperation.status !== expectedOperation.status) {return false;}if (Number.isFinite(expectedOperation.updatedAt) && Number(observedOperation.updatedAt) < expectedOperation.updatedAt) {return false;}if (Number.isFinite(expectedOperation.completedAt) && Number(observedOperation.completedAt) < expectedOperation.completedAt) {return false;}return true;} /**
   * Wait briefly before re-checking authoritative replica operation visibility.
   * @param {number} delayMs
   * @return {Promise<void>}
   * @private
   */async waitForReplicaOperationVisibilityRetry(delayMs) {await new Promise((resolve) => setTimeout(resolve, delayMs));} /**
   * Emit divergence when the replica_operations cache lags the
   * authoritative row after a confirmed write.
   * @param {object} authoritativeOperation
   * @return {void}
   * @private
   */emitReplicaOperationPersistenceDivergence(authoritativeOperation) {if (!authoritativeOperation?.operationId) {return;}const cachedRow = this.getReplicaOperationRowFromCache(authoritativeOperation.operationId);const authoritativeValue = this.buildReplicaOperationDivergenceValue(authoritativeOperation);const cacheValue = cachedRow ? { operation_id: cachedRow.operation_id || null, replica_id: cachedRow.replica_id || null, status: cachedRow.status || null, workflow_step: cachedRow.workflow_step || null, updated_at: Number(cachedRow.updated_at) || null, completed_at: Number(cachedRow.completed_at) || null, error_message: cachedRow.error_message || null } : null;const divergentFields = [];if (!cachedRow) {divergentFields.push(...Object.keys(authoritativeValue));} else {for (const fieldName of Object.keys(authoritativeValue)) {if ((cacheValue?.[fieldName] ?? null) !== authoritativeValue[fieldName]) {divergentFields.push(fieldName);}}}if (divergentFields.length === NUM.ZERO) {return;}const divergenceType = !cachedRow ? READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING : READ_MODEL_DIVERGENCE_TYPE.FIELD_MISMATCH;const event = buildDivergenceEvent({ divergenceType, tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, ownerComponent: COORDINATOR_OWNER_COMPONENT, reconciliationReason: SQL_RECONCILIATION_REASON.RECOVERY_OPERATION_PERSIST_CONFIRMATION, rowKey: authoritativeOperation.operationId, cacheValue, authoritativeValue, divergentFields });this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.READ_MODEL_DIVERGENCE, event);if (this.emitter) {this.emitter.emit(REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE, event);}} /**
   * @param {object} operation
   * @return {object}
   * @private
   */buildReplicaOperationDivergenceValue(operation) {return { operation_id: operation.operationId, replica_id: operation.replicaId ?? null, status: operation.status ?? null, workflow_step: operation.workflowStep ?? null, updated_at: Number.isFinite(operation.updatedAt) ? operation.updatedAt : null, completed_at: Number.isFinite(operation.completedAt) ? operation.completedAt : null, error_message: operation.errorMessage ?? null };} /**
   * Execute a mutation query with bounded retry on transient errors.
   * @param {string} sql
   * @param {Array} params
   * @param {object} [options]
   * @return {Promise<object>}
   */async executeOperationMutationWithRetry(sql, params, options = {}) {const startedAt = Date.now();let retryAttempt = NUM.ZERO;while (true) {const queryOptions = this.buildOperationMutationQueryOptions(options, retryAttempt);const result = await this.controlPlaneSystemTableGateway.executeQuery(sql, params, queryOptions);if (result.success || !this.isRetryableOperationPersistError(result)) {return result;}const elapsedMs = Date.now() - startedAt;const remainingMs = this.resolveOperationMutationRemainingRetryMs(elapsedMs, options.timeoutBudget);if (remainingMs <= NUM.ZERO) {return result;}if (this.shouldRotateOperationMutationSessionOnRetry(result, options)) {retryAttempt += NUM.ONE;}const waitMs = Math.min(this.resolveOperationMutationRetryDelayMs(result), remainingMs);await this.waitForOperationPersistRetry(waitMs);}} /**
   * Execute one replica_operations mutation through the canonical gateway
   * mutation ingress when available, falling back to raw query execution only
   * for reduced test doubles that do not expose mutation helpers.
   * @param {object} mutation
   * @param {object} [options]
   * @param {object} [fallback]
   * @return {Promise<object>}
   * @private
   */async executeReplicaOperationGatewayMutationWithRetry(mutation, options = {}, fallback = {}) {const startedAt = Date.now();let retryAttempt = NUM.ZERO;while (true) {const queryOptions = this.buildOperationMutationQueryOptions(options, retryAttempt);const result = await this.executeReplicaOperationGatewayMutation(mutation, queryOptions, fallback);if (result.success || !this.isRetryableOperationPersistError(result)) {return result;}const elapsedMs = Date.now() - startedAt;const remainingMs = this.resolveOperationMutationRemainingRetryMs(elapsedMs, options.timeoutBudget);if (remainingMs <= NUM.ZERO) {return result;}if (this.shouldRotateOperationMutationSessionOnRetry(result, options)) {retryAttempt += NUM.ONE;}const waitMs = Math.min(this.resolveOperationMutationRetryDelayMs(result), remainingMs);await this.waitForOperationPersistRetry(waitMs);}} /**
   * @param {object} mutation
   * @param {object} queryOptions
   * @param {object} [fallback]
   * @return {Promise<object>}
   * @private
   */async executeReplicaOperationGatewayMutation(mutation, queryOptions, fallback = {}) {const gateway = this.controlPlaneSystemTableGateway;const canUseCanonicalMutationIngress = this.canUseReplicaOperationMutationIngress(mutation?.operation);if (canUseCanonicalMutationIngress) {if (typeof gateway?.submitMutation === TYPEOF.FUNCTION) {return gateway.submitMutation(mutation, queryOptions);}if (mutation?.operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT && typeof gateway?.insertSystemTableRow === TYPEOF.FUNCTION) {return gateway.insertSystemTableRow(mutation.tableName, mutation.row, queryOptions);}if (mutation?.operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE && typeof gateway?.updateSystemTableRow === TYPEOF.FUNCTION) {return gateway.updateSystemTableRow(mutation.tableName, mutation.whereClause, mutation.data, queryOptions);}}if (typeof gateway?.executeQuery === TYPEOF.FUNCTION && typeof fallback?.sql === TYPEOF.STRING) {return gateway.executeQuery(fallback.sql, Array.isArray(fallback?.params) ? fallback.params : [], queryOptions);}throw new Error(REPLICA_OPERATION_REPOSITORY_LITERAL.REPLICAOPERATIONREPOSITORY_REQUIRES_A_CONTROL_PLANE_MUTATION_INGRESS);} /**
   * @param {string} operationType
   * @return {boolean}
   * @private
   */canUseReplicaOperationMutationIngress(operationType) {const gateway = this.controlPlaneSystemTableGateway;const cdcIntegrationService = typeof gateway?.resolveCdcIntegrationService === 'function' ? gateway.resolveCdcIntegrationService() : gateway?.cdcIntegrationService || null;if (operationType === CONTROL_PLANE_MUTATION_OPERATION.INSERT) {return typeof cdcIntegrationService?.insertSystemTableRow === TYPEOF.FUNCTION;}if (operationType === CONTROL_PLANE_MUTATION_OPERATION.UPDATE) {return typeof cdcIntegrationService?.updateSystemTableRow === TYPEOF.FUNCTION;}return false;} /**
   * Check whether a persist error is retryable.
   * @param {object|string} errorResult
   * @return {boolean}
   */isRetryableOperationPersistError(errorResult) {if (isRetryableControlPlaneError(errorResult)) {return true;}const errorMessage = this.getOperationPersistErrorMessage(errorResult);return typeof errorMessage === TYPEOF.STRING && (errorMessage.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) || errorMessage.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) || RETRYABLE_OPERATION_PERSIST_ERROR_FRAGMENTS.some((fragment) => errorMessage.includes(fragment)) || isRetryableWorkflowParticipantLookupErrorMessage(errorMessage) || RETRYABLE_OPERATION_PERSIST_ERROR_MESSAGES.includes(errorMessage) || RETRYABLE_OPERATION_PERSIST_ERROR_PREFIXES.some((prefix) => errorMessage.startsWith(prefix)));} /**
   * Normalize one operation persist error message for retry classification.
   * @param {object|string} errorResult
   * @return {string}
   * @private
   */getOperationPersistErrorMessage(errorResult) {return typeof errorResult === TYPEOF.STRING ? errorResult : typeof errorResult?.error === TYPEOF.STRING ? errorResult.error : typeof errorResult?.message === TYPEOF.STRING ? errorResult.message : REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE;} /**
   * Preserve structured retry metadata when surfacing one failed mutation as
   * an exception so owner-lane retry classification still sees pressure hints.
   * @param {object|string|Error} errorResult
   * @param {string} [fallbackMessage]
   * @return {Error}
   * @private
   */buildOperationPersistError(errorResult, fallbackMessage = REBALANCE_COORDINATOR_LOG_MSG.PERSIST_FAILED) {const retryablePersistError = this.isRetryableOperationPersistError(errorResult);const derivedRetryAfterMs = retryablePersistError ? this.resolveOperationMutationRetryDelayMs(errorResult) : NUM.ZERO;const retryAfterMs = getControlPlaneRetryAfterMs(errorResult);const nextRetryAfterMs = retryAfterMs > NUM.ZERO ? retryAfterMs : derivedRetryAfterMs > NUM.ZERO ? derivedRetryAfterMs : NUM.ZERO;const deferRetry = errorResult?.deferRetry === true || errorResult?.firstFailedParticipant?.deferRetry === true || Array.isArray(errorResult?.participantFailures) && errorResult.participantFailures.some((entry) => entry?.deferRetry === true) || retryablePersistError;const error = new Error(this.getOperationPersistErrorMessage(errorResult) || fallbackMessage);const errorCode = getControlPlaneErrorCode(errorResult);if (typeof errorCode === TYPEOF.STRING && errorCode.length > NUM.ZERO) {error.code = errorCode;error.errorCode = errorCode;}if (nextRetryAfterMs > NUM.ZERO) {error.retryAfterMs = nextRetryAfterMs;}if (deferRetry) {error.deferRetry = true;}if (typeof errorResult?.reasonCode === TYPEOF.STRING && errorResult.reasonCode.length > NUM.ZERO) {error.reasonCode = errorResult.reasonCode;}if (typeof errorResult?.participationKind === TYPEOF.STRING && errorResult.participationKind.length > NUM.ZERO) {error.participationKind = errorResult.participationKind;}if (typeof errorResult?.tableName === TYPEOF.STRING && errorResult.tableName.length > NUM.ZERO) {error.tableName = errorResult.tableName;}const { participantFailures, firstFailedParticipant } = cloneControlPlaneFailureParticipants(errorResult);if (participantFailures.length > NUM.ZERO) {error.participantFailures = participantFailures;}if (firstFailedParticipant) {error.firstFailedParticipant = firstFailedParticipant;}if (typeof errorResult?.pressureAction === TYPEOF.STRING && errorResult.pressureAction.length > NUM.ZERO) {error.pressureAction = errorResult.pressureAction;}if (typeof errorResult?.pressureReason === TYPEOF.STRING && errorResult.pressureReason.length > NUM.ZERO) {error.pressureReason = errorResult.pressureReason;}if (typeof errorResult?.outcome === TYPEOF.STRING && errorResult.outcome.length > NUM.ZERO) {error.outcome = errorResult.outcome;}if (errorResult?.cause && !error.cause) {error.cause = errorResult.cause;}return error;} /**
   * Check whether a persist failure is a partition transaction contention.
   * @param {object|string} errorResult
   * @return {boolean}
   * @private
   */isOperationMutationPartitionContention(errorResult) {return this.getOperationPersistErrorMessage(errorResult) === PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE;} /**
   * Rotate repository-generated retry sessions after partition contention.
   * Explicit transition-owned sessions stay stable so the enclosing atomic
   * boundary can decide when to rotate them.
   * @param {object|string} errorResult
   * @param {object} [options]
   * @return {boolean}
   * @private
   */shouldRotateOperationMutationSessionOnRetry(errorResult, options = {}) {if (typeof options?.sessionId === TYPEOF.STRING && options.sessionId.length > NUM.ZERO) {return false;}return this.isOperationMutationPartitionContention(errorResult);} /**
   * Resolve the next retry delay for one failed replica_operations mutation.
   * Transaction-contention retries add light jitter so concurrent recovery
   * writers do not keep colliding in lockstep under restart pressure.
   * @param {object|string} errorResult
   * @return {number}
   * @private
   */resolveOperationMutationRetryDelayMs(errorResult) {const retryAfterMs = getControlPlaneRetryAfterMs(errorResult);const baseDelayMs = Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO ? Math.floor(retryAfterMs) : OPERATION_PERSIST_RETRY_DELAY_MS;if (!this.isOperationMutationPartitionContention(errorResult)) {return baseDelayMs;}const jitterCeilingMs = Math.max(NUM.ONE, Math.floor(baseDelayMs / NUM.TWO));const boundedRandom = Math.max(NUM.ZERO, Math.min(NUM.ONE, this.random()));const jitterMs = Math.floor(boundedRandom * jitterCeilingMs);return baseDelayMs + jitterMs;} /**
   * Wait before retrying a failed persist.
   * @param {number} delayMs
   * @return {Promise<void>}
   */async waitForOperationPersistRetry(delayMs) {await new Promise((resolve) => setTimeout(resolve, delayMs));} /**
   * Clamp replica_operations retry time to the narrower of the local retry
   * window and any enclosing timeout budget.
   * @param {number} elapsedMs
   * @param {Object|null} timeoutBudget
   * @return {number}
   * @private
   */resolveOperationMutationRemainingRetryMs(elapsedMs, timeoutBudget = null) {const localRemainingMs = OPERATION_PERSIST_RETRY_TIMEOUT_MS - elapsedMs;if (!timeoutBudget || typeof timeoutBudget !== REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT) {return localRemainingMs;}const budgetRemainingMs = getRemainingBudgetMs(timeoutBudget);return Math.min(localRemainingMs, budgetRemainingMs);} /**
   * Build query options for an operation mutation.
   * @param {object} [options]
   * @param {number} [retryAttempt=0]
   * @return {object}
   */buildOperationMutationQueryOptions(options = {}, retryAttempt = NUM.ZERO) {const ownerId = typeof options.ownerId === 'string' && options.ownerId.length > NUM.ZERO ? options.ownerId : null;return { ...CONTROL_PLANE_QUERY_OPTIONS, skipCacheWait: true, timeoutBudget: options.timeoutBudget && typeof options.timeoutBudget === REPLICA_OPERATION_REPOSITORY_LITERAL.OBJECT ? options.timeoutBudget : undefined, sessionId: this.resolveOperationMutationSessionId(options, retryAttempt), deliveryPriority: REPLICA_OPERATION_REPOSITORY_LITERAL.CRITICAL, workClass: PRESSURE_WORK_CLASS.CRITICAL, mergePolicy: options.mergePolicy || CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT, controlPlaneTableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, controlPlaneOperationKind: REPLICA_OPERATION_REPOSITORY_LITERAL.WRITE, ...(ownerId ? { coalescingKey: `replica-operation:${ownerId}` } : {}) };} /**
   * Resolve a session ID for an operation mutation.
   * @param {object} [options]
   * @param {number} [retryAttempt=0]
   * @return {string}
   */resolveOperationMutationSessionId(options = {}, retryAttempt = NUM.ZERO) {if (typeof options.sessionId === TYPEOF.STRING && options.sessionId.length > NUM.ZERO) {return options.sessionId;}const ownerId = typeof options.ownerId === 'string' && options.ownerId.length > NUM.ZERO ? options.ownerId : uuidv4();const baseSessionId = `${REBALANCER_SUBSYSTEM.COORDINATOR}:${ownerId}`;if (retryAttempt <= NUM.ZERO) {return baseSessionId;}return `${baseSessionId}:retry${retryAttempt}`;} /**
   * Extract the change count from a mutation result.
   * @param {object} result
   * @return {number|null}
   */extractMutationChangeCount(result) {const candidate = Number(result?.changes ?? result?.affectedRows ?? result?.partitionResult?.changes ?? result?.partitionResult?.affectedRows);return Number.isFinite(candidate) ? candidate : null;} /**
   * @param {object} operation
   * @return {object}
   * @private
   */buildReplicaOperationRow(operation) {return { operation_id: operation.operationId, type: operation.type, partition_id: operation.partitionId, replica_id: operation.replicaId, source_node_id: operation.sourceNodeId, target_node_id: operation.targetNodeId, status: operation.status, workflow_step: operation.workflowStep, created_at: operation.createdAt, updated_at: operation.updatedAt, completed_at: operation.completedAt, error_message: operation.errorMessage, steps_history: JSON.stringify(operation.stepsHistory), entity_type: operation.entityType, entity_id: operation.entityId };} /**
   * @param {object} operation
   * @return {object}
   * @private
   */buildReplicaOperationUpdateData(operation) {return { status: operation.status, workflow_step: operation.workflowStep, updated_at: operation.updatedAt, completed_at: operation.completedAt, error_message: operation.errorMessage, steps_history: JSON.stringify(operation.stepsHistory), replica_id: operation.replicaId };} /**
   * @param {object} operation
   * @param {string|null} expectedWorkflowStep
   * @return {object}
   * @private
   */buildReplicaOperationUpdateWhereClause(operation, expectedWorkflowStep = null) {const whereClause = { operation_id: operation.operationId };if (typeof expectedWorkflowStep === TYPEOF.STRING && expectedWorkflowStep.length > NUM.ZERO) {whereClause.workflow_step = expectedWorkflowStep;}return whereClause;} /**
   * @param {object} operation
   * @param {string|null} expectedWorkflowStep
   * @return {Array}
   * @private
   */buildReplicaOperationUpdateParams(operation, expectedWorkflowStep = null) {const params = [operation.status, operation.workflowStep, operation.updatedAt, operation.completedAt, operation.errorMessage, JSON.stringify(operation.stepsHistory), operation.replicaId, operation.operationId];if (typeof expectedWorkflowStep === TYPEOF.STRING && expectedWorkflowStep.length > NUM.ZERO) {params.push(expectedWorkflowStep);}return params;} /**
   * Serialize replica operation transitions through a queue.
   * @param {Function} executionFactory
   * @return {Promise}
   */runReplicaOperationTransitionExclusive(executionFactory, options = {}) {const lane = this.resolveReplicaOperationTransitionLane(options);const activeQueue = this.getReplicaOperationTransitionQueue(lane);const queuedExecution = activeQueue.catch(() => {}).then(async () => executionFactory());this.replicaOperationTransitionQueues.set(lane, queuedExecution.catch(() => {}));return queuedExecution;} /**
   * Resolve the transition lane for one replica operation mutation.
   * Priority control-plane partitions keep a dedicated progression lane so
   * unrelated ordinary replica_operations work cannot head-of-line block
   * the partitions that publish and repair control-plane recovery itself.
   * @param {Object} [options={}]
   * @return {string}
   * @private
   */resolveReplicaOperationTransitionLane(options = {}) {const explicitLane = this.normalizeReplicaOperationTransitionLane(options.transitionLane || options.lane);if (explicitLane) {return explicitLane;}const partitionClassificationInput = this.buildReplicaOperationTransitionPartitionClassificationInput(options);return isPriorityControlPlanePartition(partitionClassificationInput) ? REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY : REPLICA_OPERATION_TRANSITION_LANE.DEFAULT;} /**
   * @param {string|null|undefined} lane
   * @return {string|null}
   * @private
   */normalizeReplicaOperationTransitionLane(lane) {return lane === REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY ? REPLICA_OPERATION_TRANSITION_LANE.PRIORITY_RECOVERY : lane === REPLICA_OPERATION_TRANSITION_LANE.DEFAULT ? REPLICA_OPERATION_TRANSITION_LANE.DEFAULT : null;} /**
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */buildReplicaOperationTransitionPartitionClassificationInput(options = {}) {const operation = options.operation;const partitionRow = options.partitionRow && typeof options.partitionRow === 'object' ? options.partitionRow : operation?.partitionRow && typeof operation.partitionRow === 'object' ? operation.partitionRow : null;const partitionIdCandidate = options.partitionId ?? operation?.partitionId ?? operation?.partition_id ?? partitionRow?.partition_id ?? partitionRow?.partitionId ?? null;const partitionId = typeof partitionIdCandidate === 'string' ? partitionIdCandidate.trim() : null;return { partitionId: partitionId && partitionId.length > NUM.ZERO ? partitionId : null, partitionRow };} /**
   * @param {string} lane
   * @return {Promise<*>}
   * @private
   */getReplicaOperationTransitionQueue(lane) {const normalizedLane = this.normalizeReplicaOperationTransitionLane(lane) || REPLICA_OPERATION_TRANSITION_LANE.DEFAULT;if (!this.replicaOperationTransitionQueues.has(normalizedLane)) {this.replicaOperationTransitionQueues.set(normalizedLane, Promise.resolve());}return this.replicaOperationTransitionQueues.get(normalizedLane);} // ── Replica Status Observation ──────────────────────────────────
  /**
   * Normalize one observed services row into workflow replica lifecycle.
   *
   * Partition replicas that report `status=active` but still carry a learner
   * role are not fully operational for REPLACE progression yet; they remain in
   * the syncing phase until promotion.
   *
   * @param {Object} row
   * @return {string|null}
   */normalizeObservedReplicaLifecycle(row) {const status = typeof row?.status === 'string' && row.status.length > NUM.ZERO ? row.status.toLowerCase() : null;if (!status) {return null;}if (status !== ReplicaStatus.ACTIVE) {return status;}const serviceType = typeof row?.service_type === 'string' ? row.service_type.toLowerCase() : typeof row?.serviceType === 'string' ? row.serviceType.toLowerCase() : null;if (serviceType !== SERVICE_TYPE.PARTITION) {return status;}const raftRole = typeof row?.raft_role === 'string' ? row.raft_role.toLowerCase() : typeof row?.raftRole === 'string' ? row.raftRole.toLowerCase() : null;if (!raftRole || raftRole === RAFT_ROLE.LEARNER) {return ReplicaStatus.SYNCING;}return status;} /**
   * Get one observed replica row from cache.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Object|null}
   */getObservedReplicaRowFromCache(replicaId, partitionId, targetNodeId) {if (!this.systemTableCache) {return null;}const normalizedReplicaId = typeof replicaId === 'string' ? replicaId : '';const normalizedPartitionId = typeof partitionId === 'string' ? partitionId : '';const normalizedTargetNodeId = typeof targetNodeId === 'string' ? targetNodeId : '';const rowMatchesTarget = (row) => {if (!row || typeof row !== 'object') {return false;}const rowNodeId = String(row.node_id || row.nodeId || '');if (normalizedTargetNodeId.length > NUM.ZERO && rowNodeId.length > NUM.ZERO && rowNodeId !== normalizedTargetNodeId) {return false;}const rowPartitionId = String(row.partition_id || row.partitionId || '');if (normalizedPartitionId.length > NUM.ZERO && rowPartitionId.length > NUM.ZERO && rowPartitionId !== normalizedPartitionId) {return false;}return true;};const readAllServiceRows = () => {if (typeof this.systemTableCache.getAll === 'function') {return this.systemTableCache.getAll(SYSTEM_TABLE_NAME.SERVICES) || [];}if (typeof this.systemTableCache.filter === 'function') {return this.systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, () => true) || [];}return [];};if (normalizedReplicaId.length > NUM.ZERO && typeof this.systemTableCache.get === TYPEOF.FUNCTION) {const cachedRow = this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICES, normalizedReplicaId);if (rowMatchesTarget(cachedRow)) {return cachedRow;}}const serviceRows = readAllServiceRows();if (normalizedReplicaId.length > NUM.ZERO) {const exactReplicaRow = serviceRows.find((row) => {const rowReplicaId = String(row?.service_id || row?.serviceId || row?.replica_id || row?.replicaId || '');return rowReplicaId === normalizedReplicaId && rowMatchesTarget(row);});if (exactReplicaRow) {return exactReplicaRow;}}return serviceRows.find((row) => {const rowNodeId = String(row?.node_id || row?.nodeId || '');const rowPartitionId = String(row?.partition_id || row?.partitionId || '');return rowNodeId === normalizedTargetNodeId && rowPartitionId === normalizedPartitionId;}) || null;} /**
   * Get observed replica status from cache.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {string|null}
   */getObservedReplicaStatusFromCache(replicaId, partitionId, targetNodeId) {return this.normalizeObservedReplicaLifecycle(this.getObservedReplicaRowFromCache(replicaId, partitionId, targetNodeId));} /**
   * Get authoritative replica status via SQL, with cache
   * fallback for degraded conditions.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Promise<Object>}
   */async getActualReplicaObservation(replicaId, partitionId, targetNodeId) {let observedRow = null;let authoritativeReadAttempted = false;let authoritativeReadFailed = false;const recordAuthoritativeResult = (result) => {if (!result || typeof result !== 'object') {return;}authoritativeReadAttempted = true;if (result.success !== true) {authoritativeReadFailed = true;return;}if (Array.isArray(result.rows) && result.rows.length > NUM.ZERO) {observedRow = result.rows[NUM.ZERO];}};if (replicaId) {const result = await readAuthoritativeControlPlaneRows(this.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.SERVICES, SQL.SELECT_REPLICA_STATUS, [replicaId], REPLICA_STATUS_READ_QUERY_OPTIONS);recordAuthoritativeResult(result);}if (!observedRow) {// Secondary lookup by partition + node when replicaId
      // yields no row
      const result = await readAuthoritativeControlPlaneRows(this.controlPlaneSystemTableGateway, SYSTEM_TABLE_NAME.SERVICES, SQL.SELECT_REPLICA_BY_PARTITION_NODE, [partitionId, targetNodeId], REPLICA_STATUS_READ_QUERY_OPTIONS);recordAuthoritativeResult(result);}if (!observedRow && (!authoritativeReadAttempted || authoritativeReadFailed)) {observedRow = this.getObservedReplicaRowFromCache(replicaId, partitionId, targetNodeId);if (observedRow) {return Object.freeze({ state: REPLICA_OPERATION_REPOSITORY_LITERAL.OBSERVED, source: authoritativeReadFailed === true ? REPLICA_OPERATION_REPOSITORY_LITERAL.CACHE_FALLBACK_AFTER_AUTHORITATIVE_FAILURE : REPLICA_OPERATION_REPOSITORY_LITERAL.CACHE, lifecycleStatus: this.normalizeObservedReplicaLifecycle(observedRow) });}}if (observedRow) {return Object.freeze({ state: REPLICA_OPERATION_REPOSITORY_LITERAL.OBSERVED, source: REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE, lifecycleStatus: this.normalizeObservedReplicaLifecycle(observedRow) });}return Object.freeze({ state: authoritativeReadAttempted === true ? REPLICA_OPERATION_REPOSITORY_LITERAL.ABSENT : REPLICA_OPERATION_REPOSITORY_LITERAL.UNAVAILABLE, source: authoritativeReadAttempted === true ? REPLICA_OPERATION_REPOSITORY_LITERAL.AUTHORITATIVE : REPLICA_OPERATION_REPOSITORY_LITERAL.UNAVAILABLE });} /**
   * Get authoritative replica status via SQL, with cache
   * fallback for degraded conditions.
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Promise<string|null>}
   */async getActualReplicaStatus(replicaId, partitionId, targetNodeId) {const observation = await this.getActualReplicaObservation(replicaId, partitionId, targetNodeId);return observation.state === REPLICA_OPERATION_REPOSITORY_LITERAL.OBSERVED ? observation.lifecycleStatus : null;} /**
   * Emit a read-model divergence event when cache and
   * authoritative status disagree.
   * @param {string} replicaId
   * @param {string} authoritativeStatus
   * @param {string} reason
   */emitReplicaStatusDivergence(replicaId, authoritativeStatus, reason) {if (!replicaId || !this.systemTableCache || typeof this.systemTableCache.get !== TYPEOF.FUNCTION) {return;}const cachedRow = this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);const cachedStatus = cachedRow?.status || null;if (cachedStatus === authoritativeStatus) {return;}const divergenceType = authoritativeStatus === null ? READ_MODEL_DIVERGENCE_TYPE.AUTHORITATIVE_MISSING : cachedStatus === null ? READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING : READ_MODEL_DIVERGENCE_TYPE.FIELD_MISMATCH;const event = buildDivergenceEvent({ divergenceType, tableName: SYSTEM_TABLE_NAME.SERVICES, ownerComponent: COORDINATOR_OWNER_COMPONENT, reconciliationReason: reason, rowKey: replicaId, cacheValue: cachedStatus ? { status: cachedStatus } : null, authoritativeValue: authoritativeStatus ? { status: authoritativeStatus } : null, divergentFields: ['status'] });this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.READ_MODEL_DIVERGENCE, event);if (this.emitter) {this.emitter.emit(REBALANCE_COORDINATOR_EVENT.READ_MODEL_DIVERGENCE, event);}}}export { ReplicaOperationRepository, SQL };