import {NODE_STATE, NUM} from '../constants/index.js';
import {PRESSURE_STATE} from '../rebalancer/storage-capacity-constants.js';

const CONTROL_PLANE_READINESS_SUBSYSTEM = 'control-plane-readiness';

const CONTROL_PLANE_READINESS_DIMENSION = Object.freeze({
  PROCESS_ALIVE: 'processAlive',
  CLUSTER_MEMBER_HEALTHY: 'clusterMemberHealthy',
  ROUTING_READY: 'routingReady',
  LOAD_READY: 'loadReady',
  PLACEMENT_ELIGIBLE: 'placementEligible',
  CONTROL_PLANE_WRITABLE: 'controlPlaneWritable',
  METADATA_PUBLICATION_HEALTHY: 'metadataPublicationHealthy',
});

const CONTROL_PLANE_READINESS_OWNER = Object.freeze({
  NODE_LIFECYCLE: 'NodeLifecycleStateMachine',
  SYSTEM_TABLE_CACHE: 'SystemTableCache',
  STORAGE_ACCOUNTING: 'StorageCapacityAccountingService',
  CDC_GROUP_PROPAGATION: 'CDCGroupPropagationService',
});

const CONTROL_PLANE_READINESS_REASON = Object.freeze({
  NODE_ROW_MISSING: 'node_row_missing',
  PROCESS_NOT_ALIVE: 'process_not_alive',
  CLUSTER_MEMBER_UNHEALTHY: 'cluster_member_unhealthy',
  ROUTING_NOT_READY: 'routing_not_ready',
  LOAD_NOT_READY: 'load_not_ready',
  STORAGE_BUDGET_UNAVAILABLE: 'storage_budget_unavailable',
  STORAGE_PRESSURE_HARD: 'storage_pressure_hard',
  STORAGE_PRESSURE_EXHAUSTED: 'storage_pressure_exhausted',
  CONTROL_PLANE_WRITE_UNHEALTHY: 'control_plane_write_unhealthy',
  METADATA_PUBLICATION_DEGRADED: 'metadata_publication_degraded',
  METADATA_PUBLICATION_REPAIR_ONLY: 'metadata_publication_repair_only',
});

const CONTROL_PLANE_PUBLICATION_MODE = Object.freeze({
  GROUPED: 'grouped',
  CONSERVATIVE_FANOUT: 'conservative_fanout',
  REPAIR_ONLY: 'repair_only',
});

const CONTROL_PLANE_READINESS_DEFAULT = Object.freeze({
  LOAD_READY_MAX_PERCENT: NUM.HUNDRED,
  NON_RUNNING_PROCESS_STATES: Object.freeze([
    NODE_STATE.FAILED,
    NODE_STATE.SHUTTING_DOWN,
    NODE_STATE.STOPPED,
  ]),
  PLACEMENT_BLOCKING_PRESSURE_STATES: Object.freeze([
    PRESSURE_STATE.HARD,
    PRESSURE_STATE.EXHAUSTED,
  ]),
});

/**
 * Keys used when persisting a compact readiness snapshot summary
 * alongside admission, dispatch, and progression decisions.
 * @enum {string}
 */
const READINESS_SNAPSHOT_KEY = Object.freeze({
  NODE_ID: 'nodeId',
  DIMENSIONS: 'dimensions',
  REASON_CODES: 'reasonCodes',
  LIFECYCLE_STATE: 'lifecycleState',
  OBSERVED_AT: 'observedAt',
});

export {
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SUBSYSTEM,
  READINESS_SNAPSHOT_KEY,
};
