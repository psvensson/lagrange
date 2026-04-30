/**
 * Node Joining Service - Handles new node joining an existing cluster.
 *
 * Bootstrap Process:
 * 1. Contact seed node via HTTP to get bootstrap response
 * 2. Bootstrap response contains default cache-sync table snapshots
 * 3. Hydrate local system cache from snapshots
 * 4. System cache becomes single source of truth for query routing
 * 5. Subscribe to CDC events to keep cache updated
 * 6. Register node in cluster via system cache routing
 *
 * System Cache Architecture:
 * - All cluster state stored in system tables
 * - System cache populated from bootstrap snapshots
 * - CDC events keep cache synchronized across all nodes
 * - All queries route through system cache (no bootstrap directories)
 * - Cache provides partition locations and leader addresses
 *
 * Requirements: 4.1, 4.6, 4.7, 7.8, 7.10, 7.11, 7.14
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {NodeService} from '../node/node-service.js';
import {ReplicaHandlerSetup} from './shared/replica-handler-setup.js';
import {CDCIntegrationSetup} from './shared/cdc-integration-setup.js';
import {ControlPlaneSetup} from './shared/control-plane-setup.js';
import {LatencyTopologySetup} from './shared/latency-topology-setup.js';
import {HEARTBEAT_STATE} from '../control-plane/heartbeat-service-constants.js';
import {LEASE_STATE} from '../control-plane/lease-service-constants.js';
import {waitForLocalQueryTransportReadiness} from './shared/local-query-transport-readiness.js';
import {waitForMetadataPublicationReadiness} from './traffic-readiness-utils.js';
import {BootstrapMessageGroupSelectionOwner} from './owners/bootstrap-message-group-selection-owner.js';
import {BootstrapTopologySnapshotOwner} from './owners/bootstrap-topology-snapshot-owner.js';
import {PartitionService} from '../partition/partition-service.js';
import {
  NodeLifecycleStateMachine,
  NodeState,
} from '../node/node-lifecycle-state-machine.js';
import {
  CACHE_DEFAULT,
  CACHE_HYDRATION_TABLES,
  CDC_PROPAGATED_TABLES,
} from '../cache/cache-constants.js';
import {CDCPipelineReadinessGate} from '../cdc/cdc-pipeline-readiness-gate.js';
import {CDC_LIFECYCLE_LOG_MSG} from '../constants/cdc-lifecycle-constants.js';
import {getSystemCachePrimaryKeyFieldOrFallback} from '../cache/system-cache-key-descriptor.js';
import {SQLQueryEngine} from '../query/sql-query-engine.js';
import {resolveCanonicalLeaderIdentitySnapshot} from '../query/canonical-leader-routing.js';
import {wireMigrationWorkflowOwners} from '../migration/migration-composition.js';
import {TablePolicyService} from '../policy/table-policy-service.js';
import {NodeStorageBudgetSetup} from './shared/node-storage-budget-setup.js';
import {
  classifyTransportDeliveryOutcome,
  isDeliveredTransportDeliveryOutcome,
} from '../transport/transport-semantic-outcome.js';
import {
  NodeStatePublicationOwner,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE,
  NODE_STATE_UPDATE_PUBLICATION_PATH,
  NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET,
  buildNodeStateUpdateDeliveryError,
  buildNodeStateUpdatePublicationDiagnostics,
  buildNodeStateUpdatePublicationFailureAction,
  buildNodeStateUpdatePublicationFailureError,
  buildNodeStateUpdatePublicationOutcome,
  createNodeStateUpdateDeferredPublicationState,
} from './shared/node-state-publication-owner.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../control-plane/pressure-governor.js';
import {
  buildOwnerContractOutcome,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../control-plane/owner-contract-outcome.js';
import {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../control-plane/control-plane-workload-profile.js';
import {
  resolveMembershipJoinIntentType,
  MembershipLifecycleController,
} from '../control-plane/membership-lifecycle-controller.js';
import {
  BOOTSTRAP_EVENT,
  BOOTSTRAP_SUBSYSTEM,
  JOIN_DELEGATE_BUNDLE,
  JOIN_PLAN_SEGMENT,
  JOINING_PHASE,
  JOINING_PHASE_TO_SUB_PHASE,
} from './bootstrap-constants.js';
import {
  CDC_REESTABLISHMENT,
  CDC_SUBSCRIPTION_STATUS,
  JOIN_BACKFILL_QUERY,
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_HTTP,
  JOINING_LOG_MSG,
  JOIN_READINESS_REPAIR,
  JOINING_UNIFIED_RECONCILE,
} from './node-joining-constants.js';
import {createRuntimeStartupWiring} from '../runtime/runtime-startup-wiring.js';
import {
  WORK_CLASS,
  WorkClassScheduler,
} from '../runtime/work-class-scheduler.js';
import {JoinReadinessEvaluator} from './join-readiness-evaluator.js';
import {JOIN_REJOIN_PROMOTION_RESTORE_STATE} from './join-promotion-state-owner.js';
import {JoinCleanupHandler} from './join-cleanup-handler.js';
import {
  ContactSeedPhase,
  parseBootstrapError as _parseBootstrapError,
  formatLeaderMetadataDetails as _formatLeaderMetadataDetails,
  resolveSeedContactRetryAfterMs as _resolveSeedContactRetryAfterMs,
} from './phases/contact-seed-phase.js';
import {
  ConnectWebSocketPhase,
  deriveWsAddressFromNodeAddress as _deriveWsAddressFromNodeAddress,
} from './phases/connect-websocket-phase.js';
import {QuerySystemStatePhase} from './phases/query-system-state-phase.js';
import {WaitForLeadershipPhase} from './phases/wait-for-leadership-phase.js';
import {CreateMessageGroupPhase} from './phases/create-message-group-phase.js';
import {
  CONTROL_PLANE_ROLLOUT_REQUIRED,
  assertRequiredControlPlaneRollout,
} from '../runtime/control-plane-rollout-controls.js';
import {RPCClient} from '../transport/rpc-client.js';
import {
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
  CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT,
  ControlPlaneMessageType,
  ControlPlaneField,
  getControlPlaneNodeStatePublicationProfile,
  isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
  DEFAULT_NODE_CAPABILITIES,
  getControlPlaneMessageRequiredTables,
  resolveControlPlaneNodeStatePublicationMode,
  resolveReplayControlPlaneNodeStatePublicationMode,
} from '../control-plane/control-plane-constants.js';
import {ControlPlaneKernelIngress} from '../control-plane/control-plane-kernel-ingress.js';
import {CONTROL_PLANE_READINESS_DIMENSION} from '../control-plane/control-plane-readiness-constants.js';
import {
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {STORAGE_DEFAULT} from '../storage/storage-constants.js';
import {
  COLUMN,
  NUM,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  STRING,
  TABLES,
  TYPEOF,
  TIME_MS,
  UNIFIED_SERVICE_TYPE,
} from '../constants/index.js';
import {RAFT_ROLE} from '../raft/constants.js';

import {CDC_EVENT} from '../cdc/cdc-constants.js';
import {createJoiningPhaseOwners} from './owners/join-phase-owners.js';
import {StartupRuntimeHandoffOwner} from './owners/startup-runtime-handoff-owner.js';
import {JoinMessageGroupRuntimeOwner} from './owners/join-message-group-runtime-owner.js';
import {StartupPipelineRunner} from './pipeline/startup-pipeline-runner.js';
import {
  createJoinStartupPlan,
  assertJoinPlanSegments,
} from './pipeline/join-startup-plan.js';
import {PgWireStartupSafetyGate} from './pgwire-startup-safety-gate.js';
import {RuntimeServiceHandlerSetup} from './shared/runtime-service-handler-setup.js';
import {MessageGroupServiceHandlerSetup} from './shared/message-group-service-handler-setup.js';
import {activateMessageGroupServiceRows} from './shared/message-group-service-activation.js';
import {activatePartitionServiceRows} from './shared/partition-service-activation.js';
import {activateSteadyStateRuntimeHandoff} from './shared/startup-sql-runtime-handoff.js';
import {StartupServiceLifecycleOwner} from './shared/startup-service-lifecycle-owner.js';
import {StartupRuntimeSurfaceOwner} from './shared/startup-runtime-surface-owner.js';
import {
  extractJoinSchemaVersionFromRecord,
  compareJoinSchemaVersions,
} from './join-schema-version-resolver.js';
import {JoinCoordinator} from './join-coordinator.js';
import {JOIN_CHECKPOINT, JoinSessionStore} from './join-session-store.js';
import {STARTUP_JOIN_MODE} from './rejoin-hints-constants.js';
import {buildDurableRejoinPartitionRestorePlans} from './shared/durable-rejoin-partition-restore-planner.js';
import {formatReplicatedServiceAddress} from '../service/replicated-service-topology.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {NODE_STATE_UPDATE_RETRY_CLASS} from '../control-plane/replica-dispatch-service-constants.js';
import {QUERY_ERROR_CODE, QUERY_ERROR_MSG} from '../query/query-constants.js';

const NODE_JOINING_SERVICE_LITERAL = Object.freeze({
  NODEJOININGSERVICE: 'NodeJoiningService',
  CREATERUNTIMESTARTUPWIRING: 'createRuntimeStartupWiring',
  DEFERRED_CREATE_SELF_HOSTED_MESSAGE_GROUP_METADATA_PUBLICATION_FAILED:
    'Deferred CREATE_SELF_HOSTED message-group metadata publication failed',
  LATENCYTOPOLOGYSETUP: 'LatencyTopologySetup',
  JOIN_RECONCILER_MUST_BE_INITIALIZED_BEFORE_RECONCILIATION:
    'Join reconciler must be initialized before reconciliation',
  LOCAL_QUERY_DATA_PLANE_TRANSPORT_IS_NOT_READY:
    'Local query/data-plane transport is not ready',
  LOCAL_QUERY_TRANSPORT: 'local_query_transport',
  LIFECYCLE_METADATA_PUBLICATION_READINESS_IS_NOT_SATISFIED:
    'Lifecycle metadata publication readiness is not satisfied',
  METADATA_PUBLICATION_READINESS: 'metadata_publication_readiness',
  DEFERRING_JOIN_PARTITION_SERVICE_ROW_ACTIVATION:
    'Deferring join partition service row activation',
  DEFERRING_JOIN_MESSAGE_GROUP_SERVICE_ROW_ACTIVATION:
    'Deferring join message-group service row activation',
  ANY_REPLICA: 'any_replica',
  NO_CONNECTION_TO_NODE: 'No connection to node',
  CONNECTION_TO_NODE: 'Connection to node',
  CLOSED: 'closed',
  MESSAGE_TIMEOUT: 'Message timeout',
  NO_HANDLER_REGISTERED_FOR_ADDRESS: 'No handler registered for address',
  OBJECT: 'object',
  CONTROL_PLANE_MESSAGE_WAS_NOT_ACKNOWLEDGED:
    'control-plane message was not acknowledged',
  FAILED: 'failed',
  SHUTTING_DOWN: 'shutting_down',
  STOPPED: 'stopped',
  VALUE: ', ',
  VALUE_2: '|',
  JOIN_BACKFILL: 'join:backfill',
  CONTROL_PLANE_READ: 'control-plane:read',
  CRITICAL: 'critical',
  BACKGROUND: 'background',
  JOIN_BACKFILL_DETECTED_REPLICA_DIVERGENCE:
    'Join backfill detected replica divergence',
  OPERATIONAL_MESSAGE_GROUP_CDC_INGRESS_NOT_READY:
    'Operational message-group ingress not ready ',
  QUERY_FAILED: 'query failed',
  RESTORED_DURABLE_LOCAL_PARTITION_SERVICES_FROM_CACHED_TOPOLOGY:
    'Restored durable local partition services from cached topology',
  SUBSCRIBETOCDC_NOT_AVAILABLE: 'subscribeToCDC not available',
  CONTROL_PLANE_INITIALIZED_BY_OWNER: 'Control plane initialized by owner',
  CONTROLPLANESETUP: 'ControlPlaneSetup',
  CDC_INTEGRATION_INITIALIZED_BY_OWNER: 'CDC integration initialized by owner',
  CDCINTEGRATIONSETUP: 'CDCIntegrationSetup',
  NORMAL: 'normal',
});
const JoiningPhase = JOINING_PHASE;
const JoiningEvent = BOOTSTRAP_EVENT;
const JOIN_SESSION_PHASE = Object.freeze({
  SEED_CONTACTED: 'join_session:seed_contacted',
  INFRASTRUCTURE_READY: 'join_session:infrastructure_ready',
  MEMBERSHIP_WRITTEN: 'join_session:membership_written',
  READY_LEASE_ASSIGNED: 'join_session:ready_lease_assigned',
  FINALIZED: 'join_session:finalized',
});
import {shouldAttachPartitionCdcPropagation} from './shared/cdc-propagation-filter.js';
import {buildPartitionCdcPropagationSubscriber} from './shared/partition-cdc-propagation-subscriber.js';
import {canonicalizeSystemTableRow} from '../control-plane/system-row-normalizers.js';
/**
 * NodeJoiningService handles the process of a new node joining an existing cluster.
 */

const NODE_JOINING_SERVICE_BOOTSTRAP_SHARED = Object.freeze({
  BOOTSTRAP_EVENT,
  BOOTSTRAP_SUBSYSTEM,
  BootstrapMessageGroupSelectionOwner,
  BootstrapTopologySnapshotOwner,
  CACHE_DEFAULT,
  CACHE_HYDRATION_TABLES,
  CDCIntegrationSetup,
  CDCPipelineReadinessGate,
  CDC_EVENT,
  CDC_LIFECYCLE_LOG_MSG,
  CDC_PROPAGATED_TABLES,
  CDC_REESTABLISHMENT,
  CDC_SUBSCRIPTION_STATUS,
  COLUMN,
  CONTROL_PLANE_NODE_STATE_PUBLICATION_MODE,
  CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_ROLLOUT_REQUIRED,
});
const NODE_JOINING_SERVICE_CONTROL_PLANE_SHARED = Object.freeze({
  CONTROL_PLANE_WORKLOAD_CLASS,
  ConnectWebSocketPhase,
  ContactSeedPhase,
  ControlPlaneField,
  ControlPlaneKernelIngress,
  ControlPlaneMessageType,
  ControlPlaneSetup,
  CreateMessageGroupPhase,
  DEFAULT_NODE_CAPABILITIES,
  EventEmitter,
  HEARTBEAT_STATE,
  JOINING_DEFAULT,
  JOINING_ERROR_MSG,
  JOINING_ERROR_NAME,
  JOINING_HTTP,
  JOINING_LOG_MSG,
  JOINING_PHASE,
  JOINING_PHASE_TO_SUB_PHASE,
});
const NODE_JOINING_SERVICE_OWNER_LIFECYCLE_SHARED = Object.freeze({
  JOINING_UNIFIED_RECONCILE,
  JOIN_BACKFILL_QUERY,
  JOIN_CHECKPOINT,
  JOIN_DELEGATE_BUNDLE,
  JOIN_PLAN_SEGMENT,
  JOIN_READINESS_REPAIR,
  JOIN_REJOIN_PROMOTION_RESTORE_STATE,
  JOIN_SESSION_PHASE,
  JoinCleanupHandler,
  JoinCoordinator,
  JoinMessageGroupRuntimeOwner,
  JoinReadinessEvaluator,
  JoinSessionStore,
  JoiningEvent,
  JoiningPhase,
  LEASE_STATE,
  LatencyTopologySetup,
  LoggingService,
});
const NODE_JOINING_SERVICE_PUBLICATION_STATE_SHARED = Object.freeze({
  MembershipLifecycleController,
  MessageGroupServiceHandlerSetup,
  NODE_JOINING_SERVICE_LITERAL,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_REASON,
  NODE_STATE_UPDATE_PUBLICATION_DEFER_STATE,
  NODE_STATE_UPDATE_PUBLICATION_PATH,
  NODE_STATE_UPDATE_PUBLICATION_RETRY_TARGET,
  NODE_STATE_UPDATE_RETRY_CLASS,
  NUM,
  NodeLifecycleStateMachine,
  NodeService,
  NodeState,
  NodeStatePublicationOwner,
  NodeStorageBudgetSetup,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
});
const NODE_JOINING_SERVICE_RUNTIME_SERVICE_SHARED = Object.freeze({
  PartitionService,
  PgWireStartupSafetyGate,
  PressureGovernor,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QuerySystemStatePhase,
  RAFT_ROLE,
  RPCClient,
  ReplicaHandlerSetup,
  ReplicaStatus,
  RuntimeServiceHandlerSetup,
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SQLQueryEngine,
  STARTUP_JOIN_MODE,
  STATE,
});
const NODE_JOINING_SERVICE_STARTUP_RUNTIME_SHARED = Object.freeze({
  STORAGE_DEFAULT,
  STRING,
  StartupPipelineRunner,
  StartupRuntimeHandoffOwner,
  StartupRuntimeSurfaceOwner,
  StartupServiceLifecycleOwner,
  TABLES,
  TIME_MS,
  TYPEOF,
  TablePolicyService,
  UNIFIED_SERVICE_TYPE,
  WORK_CLASS,
  WaitForLeadershipPhase,
  WorkClassScheduler,
  _deriveWsAddressFromNodeAddress,
  _formatLeaderMetadataDetails,
  _parseBootstrapError,
  _resolveSeedContactRetryAfterMs,
});
const NODE_JOINING_SERVICE_JOIN_HELPER_SHARED = Object.freeze({
  activateMessageGroupServiceRows,
  activatePartitionServiceRows,
  activateSteadyStateRuntimeHandoff,
  assertCritical,
  assertJoinPlanSegments,
  assertRequiredControlPlaneRollout,
  buildControlPlaneWorkloadProfile,
  buildDurableRejoinPartitionRestorePlans,
  buildNodeStateUpdateDeliveryError,
  buildNodeStateUpdatePublicationDiagnostics,
  buildNodeStateUpdatePublicationFailureAction,
  buildNodeStateUpdatePublicationFailureError,
  buildNodeStateUpdatePublicationOutcome,
  buildOwnerContractOutcome,
  buildPartitionCdcPropagationSubscriber,
  canonicalizeSystemTableRow,
  classifyTransportDeliveryOutcome,
  compareJoinSchemaVersions,
});
const NODE_JOINING_SERVICE_ROUTING_HELPER_SHARED = Object.freeze({
  createJoinStartupPlan,
  createJoiningPhaseOwners,
  createNodeStateUpdateDeferredPublicationState,
  createRuntimeStartupWiring,
  extractJoinSchemaVersionFromRecord,
  formatReplicatedServiceAddress,
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneMessageRequiredTables,
  getControlPlaneNodeStatePublicationProfile,
  getControlPlaneRetryAfterMs,
  getSystemCachePrimaryKeyFieldOrFallback,
  isDeliveredTransportDeliveryOutcome,
  isHeartbeatEscalatedControlPlaneNodeStatePublicationMode,
  isRetryableControlPlaneError,
  resolveCanonicalLeaderIdentitySnapshot,
  resolveControlPlaneNodeStatePublicationMode,
  resolveMembershipJoinIntentType,
});
const NODE_JOINING_SERVICE_UTILITY_SHARED = Object.freeze({
  resolveReplayControlPlaneNodeStatePublicationMode,
  shouldAttachPartitionCdcPropagation,
  uuidv4,
  waitForLocalQueryTransportReadiness,
  waitForMetadataPublicationReadiness,
  wireMigrationWorkflowOwners,
});

export const NODE_JOINING_SERVICE_SHARED = Object.freeze({
  ...NODE_JOINING_SERVICE_BOOTSTRAP_SHARED,
  ...NODE_JOINING_SERVICE_CONTROL_PLANE_SHARED,
  ...NODE_JOINING_SERVICE_OWNER_LIFECYCLE_SHARED,
  ...NODE_JOINING_SERVICE_PUBLICATION_STATE_SHARED,
  ...NODE_JOINING_SERVICE_RUNTIME_SERVICE_SHARED,
  ...NODE_JOINING_SERVICE_STARTUP_RUNTIME_SHARED,
  ...NODE_JOINING_SERVICE_JOIN_HELPER_SHARED,
  ...NODE_JOINING_SERVICE_ROUTING_HELPER_SHARED,
  ...NODE_JOINING_SERVICE_UTILITY_SHARED,
});
