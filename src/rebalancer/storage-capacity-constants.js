/**
 * Storage capacity constants for admission, reservation, and pressure-state
 * behavior in the placement/rebalancing pipeline.
 *
 * Requirements: 1.1, 1.3, 1.4, 6.2, 6.3, 8.1
 */

import {NUM} from '../constants/index.js';
import {CONFIG_KEY} from '../config/config-constants.js';

// --- Node budget startup config keys ---

const STORAGE_BUDGET_CONFIG_KEY = Object.freeze({
  BUDGET_BYTES: CONFIG_KEY.NODE_STORAGE_BUDGET_BYTES,
  BUDGET_RATIO: CONFIG_KEY.NODE_STORAGE_BUDGET_RATIO,
});

// --- Budget source values (persisted in nodes.storage_budget_source) ---

const STORAGE_BUDGET_SOURCE = Object.freeze({
  ABSOLUTE: 'absolute',
  RATIO: 'ratio',
  BACKFILL: 'backfill',
});

// --- Budget validation constants ---

const STORAGE_BUDGET_VALIDATION = Object.freeze({
  MIN_BUDGET_BYTES: NUM.BYTES_PER_MIB,
  MIN_RATIO: 0.01,
  MAX_RATIO: 1.0,
});

// --- Rebalancer / global storage config keys ---

const STORAGE_CAPACITY_CONFIG_KEY = Object.freeze({
  SOFT_PRESSURE_PERCENT:
    CONFIG_KEY.REBALANCER_STORAGE_SOFT_PRESSURE_PERCENT,
  HARD_PRESSURE_PERCENT:
    CONFIG_KEY.REBALANCER_STORAGE_HARD_PRESSURE_PERCENT,
  RESERVATION_TTL_MS:
    CONFIG_KEY.REBALANCER_STORAGE_RESERVATION_TTL_MS,
  EMERGENCY_HEADROOM_PERCENT:
    CONFIG_KEY.REBALANCER_STORAGE_EMERGENCY_HEADROOM_PERCENT,
  MINIMUM_REPLICA_BYTES:
    CONFIG_KEY.REBALANCER_MINIMUM_REPLICA_BYTES,
  SPLIT_AMPLIFICATION_FACTOR:
    CONFIG_KEY.REBALANCER_SPLIT_AMPLIFICATION_FACTOR,
  PARTITION_REPLICA_OVERHEAD_BYTES:
    CONFIG_KEY.REBALANCER_PARTITION_REPLICA_OVERHEAD_BYTES,
  MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES:
    CONFIG_KEY.REBALANCER_MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES,
  SERVICE_REPLICA_OVERHEAD_BYTES:
    CONFIG_KEY.REBALANCER_SERVICE_REPLICA_OVERHEAD_BYTES,
  ADMISSION_MODE:
    CONFIG_KEY.REBALANCER_STORAGE_ADMISSION_MODE,
});

// --- Admission mode (rollout) ---

const ADMISSION_MODE = Object.freeze({
  OBSERVE: 'observe',
  ENFORCE: 'enforce',
});

// --- Backfill defaults ---

const BACKFILL_DEFAULT_RATIO = 0.8;

// --- Default values for storage capacity config ---

const STORAGE_CAPACITY_DEFAULT = Object.freeze({
  SOFT_PRESSURE_PERCENT: 70,
  HARD_PRESSURE_PERCENT: 85,
  RESERVATION_TTL_MS: 300000,
  EMERGENCY_HEADROOM_PERCENT: 5,
  MINIMUM_REPLICA_BYTES: NUM.BYTES_PER_MIB,
  SPLIT_AMPLIFICATION_FACTOR: 2,
  PARTITION_REPLICA_OVERHEAD_BYTES: NUM.BYTES_PER_MIB * NUM.TEN,
  MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES: NUM.BYTES_PER_MIB,
  SERVICE_REPLICA_OVERHEAD_BYTES: NUM.BYTES_PER_MIB * NUM.FIVE,
  ADMISSION_MODE: ADMISSION_MODE.ENFORCE,
});

// --- Pressure states (Req 8.1) ---

const PRESSURE_STATE = Object.freeze({
  NORMAL: 'normal',
  SOFT: 'soft',
  HARD: 'hard',
  EXHAUSTED: 'exhausted',
});

// --- Admission decision outcomes ---

const ADMISSION_DECISION = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
});

// --- Admission reason codes (Req 3.4, 8.1) ---

const ADMISSION_REASON = Object.freeze({
  CAPACITY_AVAILABLE: 'capacity_available',
  EMERGENCY_HEADROOM_AVAILABLE: 'emergency_headroom_available',
  BUDGET_EXCEEDED: 'budget_exceeded',
  HARD_PRESSURE_EXCEEDED: 'hard_pressure_exceeded',
  EXHAUSTED: 'exhausted',
  INSUFFICIENT_HEADROOM: 'insufficient_headroom',
  POLICY_MIN_FREE_BYTES_VIOLATED: 'policy_min_free_bytes_violated',
  POLICY_MAX_UTILIZATION_VIOLATED: 'policy_max_utilization_violated',
  NO_BUDGET_REGISTERED: 'no_budget_registered',
  ESTIMATION_UNAVAILABLE: 'estimation_unavailable',
});

// --- Reservation status values ---

const RESERVATION_STATUS = Object.freeze({
  ACTIVE: 'active',
  RELEASED: 'released',
  EXPIRED: 'expired',
});

// --- Placement constraint keys (policy extensions, Req 6.1, 6.3) ---

const RESERVATION_REASON = Object.freeze({
  ADD_REPLICA: 'add_replica',
  REPLACE_REPLICA: 'replace_replica',
  SPLIT_REPLICA: 'split_replica',
});

const STORAGE_PLACEMENT_CONSTRAINT = Object.freeze({
  MIN_FREE_BYTES_PER_NODE: 'minFreeBytesPerNode',
  MAX_BUDGET_UTILIZATION_PERCENT: 'maxBudgetUtilizationPercent',
  RESERVE_EMERGENCY_HEADROOM: 'reserveEmergencyHeadroom',
});

// --- Placement constraint defaults ---

const STORAGE_PLACEMENT_DEFAULT = Object.freeze({
  MIN_FREE_BYTES_PER_NODE: NUM.ZERO,
  MAX_BUDGET_UTILIZATION_PERCENT: NUM.HUNDRED,
  RESERVE_EMERGENCY_HEADROOM: false,
});

// --- Move criticality types (Req 8.2, 8.3) ---

const MOVE_CRITICALITY = Object.freeze({
  CRITICAL: 'critical',
  NON_CRITICAL: 'non_critical',
});

// --- Pressure behavior decision outcomes (Req 8.2, 8.3) ---

const PRESSURE_BEHAVIOR_DECISION = Object.freeze({
  ALLOW: 'allow',
  ALLOW_REDUCED_PRIORITY: 'allow_reduced_priority',
  DENY: 'deny',
});

// --- Pressure behavior event types (Req 8.5) ---

const PRESSURE_BEHAVIOR_EVENT = Object.freeze({
  PRESSURE_TRANSITION: 'pressure_transition',
  MOVE_GATED: 'move_gated',
});

// --- Metric name constants (Req 10.1) ---

const STORAGE_METRIC = Object.freeze({
  BUDGET_BYTES: 'storage.budget_bytes',
  USED_BYTES: 'storage.used_bytes',
  RESERVED_BYTES: 'storage.reserved_bytes',
  AVAILABLE_BYTES: 'storage.available_bytes',
  UTILIZATION_PERCENT: 'storage.utilization_percent',
  PRESSURE_STATE: 'storage.pressure_state',
  ADMISSION_ALLOW_COUNT: 'storage.admission.allow_count',
  ADMISSION_DENY_COUNT: 'storage.admission.deny_count',
});

// --- Admin command name constants (Req 10.3, 10.4) ---

const STORAGE_ADMIN_COMMAND = Object.freeze({
  GET_STORAGE_CAPACITY: 'getStorageCapacity',
  GET_STORAGE_RESERVATIONS: 'getStorageReservations',
});

// --- Subsystem identifier ---

const STORAGE_CAPACITY_SUBSYSTEM = 'storage-capacity';

// --- Log messages ---

const STORAGE_CAPACITY_LOG_MSG = Object.freeze({
  ADMISSION_ALLOWED: 'Storage admission allowed',
  ADMISSION_DENIED: 'Storage admission denied',
  OBSERVE_MODE_OVERRIDE: 'Observe mode overriding deny to allow',
  BACKFILL_APPLIED: 'Node storage budget backfilled',
  BACKFILL_SKIPPED: 'Node storage budget backfill skipped',
  RESERVATION_CREATED: 'Storage reservation created',
  RESERVATION_RELEASED: 'Storage reservation released',
  RESERVATION_EXPIRED: 'Storage reservation expired',
  RESERVATION_RECONCILED: 'Storage reservation reconciled',
  PRESSURE_TRANSITION: 'Storage pressure state transition',
  BUDGET_RESOLVED: 'Node storage budget resolved',
  BUDGET_MISSING: 'Node storage budget missing or invalid',
  CAPACITY_FILTER_APPLIED: 'Capacity feasibility filter applied',
  CAPACITY_FILTER_REJECTED: 'Node rejected by capacity filter',
});

// --- Error messages ---

const STORAGE_CAPACITY_ERROR_MSG = Object.freeze({
  BUDGET_NON_POSITIVE: 'Storage budget must be positive',
  BUDGET_TOO_SMALL: 'Storage budget is below minimum allowed',
  BUDGET_EXCEEDS_DISK: 'Storage budget exceeds physical disk size',
  DISK_SIZE_UNAVAILABLE: 'Disk size unavailable for budget resolution',
  BUDGET_MALFORMED: 'Storage budget value is malformed',
  RATIO_OUT_OF_RANGE: 'Storage budget ratio must be between 0.01 and 1.0',
  BOTH_BUDGET_TYPES_PROVIDED:
    'Both storageBudgetBytes and storageBudgetRatio provided; ' +
    'absolute bytes takes precedence',
  ACCOUNTING_SOURCE_REQUIRED:
    'StorageCapacityAccountingService requires systemTableCache or sqlQueryEngine',
});

export {
  ADMISSION_DECISION,
  ADMISSION_MODE,
  ADMISSION_REASON,
  BACKFILL_DEFAULT_RATIO,
  MOVE_CRITICALITY,
  PRESSURE_BEHAVIOR_DECISION,
  PRESSURE_BEHAVIOR_EVENT,
  PRESSURE_STATE,
  RESERVATION_REASON,
  RESERVATION_STATUS,
  STORAGE_ADMIN_COMMAND,
  STORAGE_BUDGET_CONFIG_KEY,
  STORAGE_BUDGET_SOURCE,
  STORAGE_BUDGET_VALIDATION,
  STORAGE_CAPACITY_CONFIG_KEY,
  STORAGE_CAPACITY_DEFAULT,
  STORAGE_CAPACITY_ERROR_MSG,
  STORAGE_CAPACITY_LOG_MSG,
  STORAGE_CAPACITY_SUBSYSTEM,
  STORAGE_METRIC,
  STORAGE_PLACEMENT_CONSTRAINT,
  STORAGE_PLACEMENT_DEFAULT,
};
