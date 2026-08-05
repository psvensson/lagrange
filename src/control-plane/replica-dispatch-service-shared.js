/**
 * ReplicaDispatchService - Replica operation dispatch and message
 * forwarding. Extracted from ControlPlaneService.
 * Requirements: 8.5, 8.6
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  compareNodeHeartbeatWatermarks,
  getNodeHeartbeatWatermark,
  wasNodeRecordReadyWhenWritten,
} from '../node/node-readiness-policy.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from './control-plane-readiness-constants.js';
import {ControlPlaneReadinessService} from './control-plane-readiness-service.js';
import {
  STALE_NODE_INCARNATION_CODE,
  buildStaleNodeIncarnationError,
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
  normalizeKnownNodeBootIncarnation,
} from './control-plane-error-classification.js';
import {createControlPlaneRuntimeBundle} from './control-plane-runtime-bundle.js';
import {
  OperationType,
  OPERATION_METADATA_KEY,
  getOperationMetadataValue,
  getOperationMetadataObject,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  isCoordinatorOwnedOperationType,
} from '../rebalancer/replica-status.js';
import {ReplicaOperationField} from '../rebalancer/replica-operation-constants.js';
import {REPLICA_OPERATION_VISIBILITY_READ_MODE} from '../rebalancer/replica-operation-repository.js';
import {REBALANCE_COORDINATOR_EVENT} from '../rebalancer/rebalancer-constants.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from '../rebalancer/operation-workflow-owner-shared.js';
import {
  COLUMN,
  NUM,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  STRING,
  TYPEOF,
  WORKFLOW_STEP,
} from '../constants/index.js';
import {assertCritical} from '../utils/assert.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
  CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT,
  ControlPlaneMessageType,
  ControlPlaneField,
  CONTROL_PLANE_ALLOWED_STATES,
  CONTROL_PLANE_CONFIG_KEY,
  DEFAULT_READY_LEASE_MS,
  CONTROL_PLANE_EVENT,
  getControlPlaneNodeStatePublicationProfile,
  getControlPlaneMessageRequiredTables,
  isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
  resolveControlPlaneNodeStatePublicationMode,
  resolveReplayControlPlaneNodeStatePublicationMode,
} from './control-plane-constants.js';
import {
  DISPATCH_ERROR_MSG,
  DISPATCH_DEFAULT,
  DISPATCH_EVENT,
  DISPATCH_LOG_MSG,
  NODE_STATE_UPDATE_RETRY_ACTION,
  NODE_STATE_UPDATE_RETRY_CLASS,
  NODE_STATE_UPDATE_RETRY_POLICY,
  DISPATCH_QUEUE_NAME,
  DISPATCH_STATE,
  DISPATCH_SUBSYSTEM,
} from './replica-dispatch-service-constants.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from '../query/query-constants.js';
import {unwrapRowReadResult} from './owners/system-metadata-owner-base.js';
import {shouldUseAuthoritativePriorityRecoveryRediscovery} from './priority-recovery-snapshot.js';
import {classifySystemPartition} from '../bootstrap/system-partition-classification.js';
import {MESSAGE_GROUP_CDC_INGRESS_ACTION} from '../message-group/message-group-forwarding-owner.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from './membership-publication-coordinator.js';
import {OwnerKeyReconcileQueue} from '../workflow/owner-key-reconcile-queue.js';
import {RECONCILE_REASON} from '../workflow/reconcile-queue-constants.js';

const {
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OPERATION_WORKFLOW_OWNER_REASON,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
} = OPERATION_WORKFLOW_OWNER_SHARED;
const REPLICA_DISPATCH_SERVICE_LITERAL = Object.freeze({
  AUTHORITATIVE: 'authoritative',
  AUTHORITATIVE_PRIORITY_RECOVERY_RETRY:
    'authoritative_priority_recovery_retry',
  BACKGROUND: 'background',
  CACHE_UPDATE_NOT_OBSERVED_FOR_REPLICA_OPERATION:
    'Cache update not observed for replica operation',
  CLOSED: 'closed',
  CONNECTION_TO_NODE: 'Connection to node',
  CONTROL_PLANE_READINESS_REFRESH_TIMEOUT:
    'CONTROL_PLANE_READINESS_REFRESH_TIMEOUT',
  COORDINATOR_DOT_EVENT: 'coordinator.event',
  CRITICAL: 'critical',
  DEFERRED_RETRY_PENDING: 'deferred_retry_pending',
  DELETE: 'DELETE',
  DIRECT_WAKEUP_VERIFICATION: 'direct_wakeup_verification',
  DISPATCH_UNSUCCESSFUL: 'dispatch_unsuccessful',
  DUPLICATE_READY_TRIGGER: 'duplicate_ready_trigger',
  EMPTY_STRING: '',
  ERROR: 'error',
  FAILED_TO_FORWARD_WRITE_TO_LEADER: 'Failed to forward write to leader',
  FOUR: 4,
  INITIALIZE: 'initialize',
  MEMBERSHIP_PUBLICATION_OWNER_DISPATCH_RETRY:
    'membership_publication_owner_dispatch_retry',
  MESSAGE_DASH_GROUP_INGRESS_READINESS_UNAVAILABLE:
    'message-group ingress readiness unavailable',
  MESSAGE_DASH_GROUP_INGRESS_SELECTION_UNAVAILABLE:
    'message-group ingress selection unavailable',
  MESSAGE_TIMEOUT: 'Message timeout',
  NO_CONNECTION_TO_NODE: 'No connection to node',
  NODE_ROW_MISSING: 'NODE_ROW_MISSING',
  NODE_STATE_UPDATE_BOOTSTRAP_UPSERT_FAILED:
    'NODE_STATE_UPDATE_BOOTSTRAP_UPSERT_FAILED',
  PRIORITY_DISPATCH_LANE_EXHAUSTED: 'PRIORITY_DISPATCH_LANE_EXHAUSTED',
  QUERY_ROUTING_FAILED: 'Query routing failed',
  REPLICADISPATCHSERVICE_REQUIRES_CONTROLPLANESYSTEMTABLEGATEWAY:
    'ReplicaDispatchService requires controlPlaneSystemTableGateway',
  REPLICA_OPERATION_VISIBILITY_LAG: 'REPLICA_OPERATION_VISIBILITY_LAG',
  REPLICA_OPERATION_DISPATCH: 'replica_operation_dispatch',
  REFRESH_ROW_BEFORE_DISPATCH: 'refreshRowBeforeDispatch',
  DEFERRED_RETRY_PROVENANCE: 'deferredRetryProvenance',
  SELECT_STAR_FROM_NODES_WHERE_NODE_ID_EQUALS_QUESTION_MARK:
    'SELECT * FROM nodes WHERE node_id = ?',
  SELECT_STAR_FROM_REPLICA_OPERATIONS_WHERE_OPERATION_ID_EQUALS_QUESTION_MARK:
    'SELECT * FROM replica_operations WHERE operation_id = ?',
  STALE_AGAINST_EXISTING_ROW: 'stale_against_existing_row',
  STALE_OR_DUPLICATE_ENQUEUE: 'stale_or_duplicate_enqueue',
  TARGET_NODE_NOT_READY: 'target_node_not_ready',
  THIRTY_ONE: 31,
  UNKNOWN: 'unknown',
  UNSUPPORTED_DISPATCH_CONTROL_MESSAGE: 'unsupported_dispatch_control_message',
  ZERO: 0,
});

const READY_NODE_PUBLICATION_ADVANCEMENT_STATE = Object.freeze({
  NO_PUBLICATION: 'no_publication',
  PUBLISHED_NODE_VISIBLE: 'published_node_visible',
  PUBLISHED_NODE_MISSING: 'published_node_missing',
  IN_FLIGHT_NODE_VISIBLE: 'in_flight_node_visible',
  IN_FLIGHT_NODE_UNRESOLVED: 'in_flight_node_unresolved',
});

function isTerminalMembershipPublicationStatus(status) {
  return (
    status === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED ||
    status === MEMBERSHIP_PUBLICATION_STATUS.ABANDONED ||
    status === MEMBERSHIP_PUBLICATION_STATUS.SUPERSEDED
  );
}

function resolveReadyNodePublicationAdvancementState({
  latestPublicationStatus,
  nodeIncluded,
} = {}) {
  if (
    typeof latestPublicationStatus !== 'string' ||
    latestPublicationStatus.length === 0
  ) {
    return READY_NODE_PUBLICATION_ADVANCEMENT_STATE.NO_PUBLICATION;
  }
  if (isTerminalMembershipPublicationStatus(latestPublicationStatus)) {
    return nodeIncluded === true ?
      READY_NODE_PUBLICATION_ADVANCEMENT_STATE.PUBLISHED_NODE_VISIBLE :
      READY_NODE_PUBLICATION_ADVANCEMENT_STATE.PUBLISHED_NODE_MISSING;
  }
  return nodeIncluded === true ?
    READY_NODE_PUBLICATION_ADVANCEMENT_STATE.IN_FLIGHT_NODE_VISIBLE :
    READY_NODE_PUBLICATION_ADVANCEMENT_STATE.IN_FLIGHT_NODE_UNRESOLVED;
}

const DISPATCH_READINESS_ERROR_CODE = Object.freeze({
  TARGET_NODE_NOT_READY: 'TARGET_NODE_NOT_READY',
  TARGET_NODE_READINESS_REFRESH_FAILED: 'TARGET_NODE_READINESS_REFRESH_FAILED',
});

const DISPATCH_READINESS_ERROR_REASON = Object.freeze({
  AUTHORITATIVE_NODE_ROW_VISIBILITY_LAG:
    'authoritative_node_row_visibility_lag',
  AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE: 'authoritative_row_source_unavailable',
  TARGET_NODE_READINESS_REFRESH_FAILED: 'target_node_readiness_refresh_failed',
  UNKNOWN: 'unknown_error',
});

const DISPATCH_READINESS_MESSAGE = Object.freeze({
  CONTROL_PLANE_LEADER_NOT_READY: 'Control-plane leader is not ready',
});

const DISPATCH_READINESS_REASON = Object.freeze({
  LOCAL_HANDLER_AVAILABLE: 'local_dispatch_handler_available',
});

export const REPLICA_DISPATCH_SERVICE_SHARED = {
  COLUMN,
  CONTROL_PLANE_ALLOWED_STATES,
  CONTROL_PLANE_CONFIG_KEY,
  CONTROL_PLANE_EVENT,
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
  CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT,
  CONTROL_PLANE_READINESS_DIMENSION,
  ConfigurationManager,
  ControlPlaneField,
  ControlPlaneMessageType,
  ControlPlaneReadinessService,
  DEFAULT_READY_LEASE_MS,
  DISPATCH_DEFAULT,
  DISPATCH_ERROR_MSG,
  DISPATCH_EVENT,
  DISPATCH_LOG_MSG,
  DISPATCH_QUEUE_NAME,
  DISPATCH_READINESS_ERROR_CODE,
  DISPATCH_READINESS_ERROR_REASON,
  DISPATCH_READINESS_MESSAGE,
  DISPATCH_READINESS_REASON,
  DISPATCH_STATE,
  DISPATCH_SUBSYSTEM,
  EventEmitter,
  LoggingService,
  MEMBERSHIP_PUBLICATION_STATUS,
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  NODE_STATE_UPDATE_RETRY_ACTION,
  NODE_STATE_UPDATE_RETRY_CLASS,
  NODE_STATE_UPDATE_RETRY_POLICY,
  NUM,
  OPERATION_METADATA_KEY,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OPERATION_WORKFLOW_OWNER_REASON,
  OperationType,
  OwnerKeyReconcileQueue,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  READY_NODE_PUBLICATION_ADVANCEMENT_STATE,
  REBALANCE_COORDINATOR_EVENT,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ReplicaOperationField,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STALE_NODE_INCARNATION_CODE,
  STATE,
  STRING,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  WORKFLOW_STEP,
  assertCritical,
  buildStaleNodeIncarnationError,
  classifySystemPartition,
  compareNodeHeartbeatWatermarks,
  createControlPlaneRuntimeBundle,
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneMessageRequiredTables,
  getControlPlaneNodeStatePublicationProfile,
  getControlPlaneRetryAfterMs,
  getNodeHeartbeatWatermark,
  getOperationMetadataValue,
  getOperationMetadataObject,
  getOperationMetadataString,
  getOperationMetadataStringArray,
  isCoordinatorOwnedOperationType,
  isDeliveredTransportDeliveryOutcome,
  isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
  isRetryableControlPlaneError,
  isTerminalMembershipPublicationStatus,
  normalizeKnownNodeBootIncarnation,
  resolveControlPlaneNodeStatePublicationMode,
  resolveReadyNodePublicationAdvancementState,
  resolveReplayControlPlaneNodeStatePublicationMode,
  shouldUseAuthoritativePriorityRecoveryRediscovery,
  unwrapRowReadResult,
  wasNodeRecordReadyWhenWritten,
  REPLICA_OPERATION_DISPATCH_TIMEOUT_MS,
  classifyTransportDeliveryOutcome,
};
