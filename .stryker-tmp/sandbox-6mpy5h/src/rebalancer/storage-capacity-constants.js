/**
 * Storage capacity constants for admission, reservation, and pressure-state
 * behavior in the placement/rebalancing pipeline.
 *
 * Requirements: 1.1, 1.3, 1.4, 6.2, 6.3, 8.1
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
import { NUM } from '../constants/index.js';
import { CONFIG_KEY } from '../config/config-constants.js';

// --- Node budget startup config keys ---

const STORAGE_BUDGET_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("141663") ? {} : (stryCov_9fa48("141663"), {
  BUDGET_BYTES: CONFIG_KEY.NODE_STORAGE_BUDGET_BYTES,
  BUDGET_RATIO: CONFIG_KEY.NODE_STORAGE_BUDGET_RATIO
}));

// --- Budget source values (persisted in nodes.storage_budget_source) ---

const STORAGE_BUDGET_SOURCE = Object.freeze(stryMutAct_9fa48("141664") ? {} : (stryCov_9fa48("141664"), {
  ABSOLUTE: stryMutAct_9fa48("141665") ? "" : (stryCov_9fa48("141665"), 'absolute'),
  RATIO: stryMutAct_9fa48("141666") ? "" : (stryCov_9fa48("141666"), 'ratio'),
  BACKFILL: stryMutAct_9fa48("141667") ? "" : (stryCov_9fa48("141667"), 'backfill')
}));

// --- Budget validation constants ---

const STORAGE_BUDGET_VALIDATION = Object.freeze(stryMutAct_9fa48("141668") ? {} : (stryCov_9fa48("141668"), {
  MIN_BUDGET_BYTES: NUM.BYTES_PER_MIB,
  MIN_RATIO: 0.01,
  MAX_RATIO: 1.0
}));

// --- Rebalancer / global storage config keys ---

const STORAGE_CAPACITY_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("141669") ? {} : (stryCov_9fa48("141669"), {
  SOFT_PRESSURE_PERCENT: CONFIG_KEY.REBALANCER_STORAGE_SOFT_PRESSURE_PERCENT,
  HARD_PRESSURE_PERCENT: CONFIG_KEY.REBALANCER_STORAGE_HARD_PRESSURE_PERCENT,
  RESERVATION_TTL_MS: CONFIG_KEY.REBALANCER_STORAGE_RESERVATION_TTL_MS,
  EMERGENCY_HEADROOM_PERCENT: CONFIG_KEY.REBALANCER_STORAGE_EMERGENCY_HEADROOM_PERCENT,
  MINIMUM_REPLICA_BYTES: CONFIG_KEY.REBALANCER_MINIMUM_REPLICA_BYTES,
  SPLIT_AMPLIFICATION_FACTOR: CONFIG_KEY.REBALANCER_SPLIT_AMPLIFICATION_FACTOR,
  PARTITION_REPLICA_OVERHEAD_BYTES: CONFIG_KEY.REBALANCER_PARTITION_REPLICA_OVERHEAD_BYTES,
  MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES: CONFIG_KEY.REBALANCER_MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES,
  SERVICE_REPLICA_OVERHEAD_BYTES: CONFIG_KEY.REBALANCER_SERVICE_REPLICA_OVERHEAD_BYTES,
  ADMISSION_MODE: CONFIG_KEY.REBALANCER_STORAGE_ADMISSION_MODE
}));

// --- Admission mode (rollout) ---

const ADMISSION_MODE = Object.freeze(stryMutAct_9fa48("141670") ? {} : (stryCov_9fa48("141670"), {
  OBSERVE: stryMutAct_9fa48("141671") ? "" : (stryCov_9fa48("141671"), 'observe'),
  ENFORCE: stryMutAct_9fa48("141672") ? "" : (stryCov_9fa48("141672"), 'enforce')
}));

// --- Backfill defaults ---

const BACKFILL_DEFAULT_RATIO = 0.8;

// --- Default values for storage capacity config ---

const STORAGE_CAPACITY_DEFAULT = Object.freeze(stryMutAct_9fa48("141673") ? {} : (stryCov_9fa48("141673"), {
  SOFT_PRESSURE_PERCENT: 70,
  HARD_PRESSURE_PERCENT: 85,
  RESERVATION_TTL_MS: 300000,
  EMERGENCY_HEADROOM_PERCENT: 5,
  MINIMUM_REPLICA_BYTES: NUM.BYTES_PER_MIB,
  SPLIT_AMPLIFICATION_FACTOR: 2,
  PARTITION_REPLICA_OVERHEAD_BYTES: stryMutAct_9fa48("141674") ? NUM.BYTES_PER_MIB / NUM.TEN : (stryCov_9fa48("141674"), NUM.BYTES_PER_MIB * NUM.TEN),
  MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES: NUM.BYTES_PER_MIB,
  SERVICE_REPLICA_OVERHEAD_BYTES: stryMutAct_9fa48("141675") ? NUM.BYTES_PER_MIB / NUM.FIVE : (stryCov_9fa48("141675"), NUM.BYTES_PER_MIB * NUM.FIVE),
  ADMISSION_MODE: ADMISSION_MODE.ENFORCE
}));

// --- Pressure states (Req 8.1) ---

const PRESSURE_STATE = Object.freeze(stryMutAct_9fa48("141676") ? {} : (stryCov_9fa48("141676"), {
  NORMAL: stryMutAct_9fa48("141677") ? "" : (stryCov_9fa48("141677"), 'normal'),
  SOFT: stryMutAct_9fa48("141678") ? "" : (stryCov_9fa48("141678"), 'soft'),
  HARD: stryMutAct_9fa48("141679") ? "" : (stryCov_9fa48("141679"), 'hard'),
  EXHAUSTED: stryMutAct_9fa48("141680") ? "" : (stryCov_9fa48("141680"), 'exhausted')
}));

// --- Admission decision outcomes ---

const ADMISSION_DECISION = Object.freeze(stryMutAct_9fa48("141681") ? {} : (stryCov_9fa48("141681"), {
  ALLOW: stryMutAct_9fa48("141682") ? "" : (stryCov_9fa48("141682"), 'allow'),
  DENY: stryMutAct_9fa48("141683") ? "" : (stryCov_9fa48("141683"), 'deny')
}));

// --- Admission reason codes (Req 3.4, 8.1) ---

const ADMISSION_REASON = Object.freeze(stryMutAct_9fa48("141684") ? {} : (stryCov_9fa48("141684"), {
  CAPACITY_AVAILABLE: stryMutAct_9fa48("141685") ? "" : (stryCov_9fa48("141685"), 'capacity_available'),
  EMERGENCY_HEADROOM_AVAILABLE: stryMutAct_9fa48("141686") ? "" : (stryCov_9fa48("141686"), 'emergency_headroom_available'),
  BUDGET_EXCEEDED: stryMutAct_9fa48("141687") ? "" : (stryCov_9fa48("141687"), 'budget_exceeded'),
  HARD_PRESSURE_EXCEEDED: stryMutAct_9fa48("141688") ? "" : (stryCov_9fa48("141688"), 'hard_pressure_exceeded'),
  EXHAUSTED: stryMutAct_9fa48("141689") ? "" : (stryCov_9fa48("141689"), 'exhausted'),
  INSUFFICIENT_HEADROOM: stryMutAct_9fa48("141690") ? "" : (stryCov_9fa48("141690"), 'insufficient_headroom'),
  POLICY_MIN_FREE_BYTES_VIOLATED: stryMutAct_9fa48("141691") ? "" : (stryCov_9fa48("141691"), 'policy_min_free_bytes_violated'),
  POLICY_MAX_UTILIZATION_VIOLATED: stryMutAct_9fa48("141692") ? "" : (stryCov_9fa48("141692"), 'policy_max_utilization_violated'),
  NO_BUDGET_REGISTERED: stryMutAct_9fa48("141693") ? "" : (stryCov_9fa48("141693"), 'no_budget_registered'),
  ESTIMATION_UNAVAILABLE: stryMutAct_9fa48("141694") ? "" : (stryCov_9fa48("141694"), 'estimation_unavailable')
}));

// --- Reservation status values ---

const RESERVATION_STATUS = Object.freeze(stryMutAct_9fa48("141695") ? {} : (stryCov_9fa48("141695"), {
  ACTIVE: stryMutAct_9fa48("141696") ? "" : (stryCov_9fa48("141696"), 'active'),
  RELEASED: stryMutAct_9fa48("141697") ? "" : (stryCov_9fa48("141697"), 'released'),
  EXPIRED: stryMutAct_9fa48("141698") ? "" : (stryCov_9fa48("141698"), 'expired')
}));

// --- Placement constraint keys (policy extensions, Req 6.1, 6.3) ---

const RESERVATION_REASON = Object.freeze(stryMutAct_9fa48("141699") ? {} : (stryCov_9fa48("141699"), {
  ADD_REPLICA: stryMutAct_9fa48("141700") ? "" : (stryCov_9fa48("141700"), 'add_replica'),
  REPLACE_REPLICA: stryMutAct_9fa48("141701") ? "" : (stryCov_9fa48("141701"), 'replace_replica'),
  SPLIT_REPLICA: stryMutAct_9fa48("141702") ? "" : (stryCov_9fa48("141702"), 'split_replica')
}));
const STORAGE_PLACEMENT_CONSTRAINT = Object.freeze(stryMutAct_9fa48("141703") ? {} : (stryCov_9fa48("141703"), {
  MIN_FREE_BYTES_PER_NODE: stryMutAct_9fa48("141704") ? "" : (stryCov_9fa48("141704"), 'minFreeBytesPerNode'),
  MAX_BUDGET_UTILIZATION_PERCENT: stryMutAct_9fa48("141705") ? "" : (stryCov_9fa48("141705"), 'maxBudgetUtilizationPercent'),
  RESERVE_EMERGENCY_HEADROOM: stryMutAct_9fa48("141706") ? "" : (stryCov_9fa48("141706"), 'reserveEmergencyHeadroom')
}));

// --- Placement constraint defaults ---

const STORAGE_PLACEMENT_DEFAULT = Object.freeze(stryMutAct_9fa48("141707") ? {} : (stryCov_9fa48("141707"), {
  MIN_FREE_BYTES_PER_NODE: NUM.ZERO,
  MAX_BUDGET_UTILIZATION_PERCENT: NUM.HUNDRED,
  RESERVE_EMERGENCY_HEADROOM: stryMutAct_9fa48("141708") ? true : (stryCov_9fa48("141708"), false)
}));

// --- Move criticality types (Req 8.2, 8.3) ---

const MOVE_CRITICALITY = Object.freeze(stryMutAct_9fa48("141709") ? {} : (stryCov_9fa48("141709"), {
  CRITICAL: stryMutAct_9fa48("141710") ? "" : (stryCov_9fa48("141710"), 'critical'),
  NON_CRITICAL: stryMutAct_9fa48("141711") ? "" : (stryCov_9fa48("141711"), 'non_critical')
}));

// --- Pressure behavior decision outcomes (Req 8.2, 8.3) ---

const PRESSURE_BEHAVIOR_DECISION = Object.freeze(stryMutAct_9fa48("141712") ? {} : (stryCov_9fa48("141712"), {
  ALLOW: stryMutAct_9fa48("141713") ? "" : (stryCov_9fa48("141713"), 'allow'),
  ALLOW_REDUCED_PRIORITY: stryMutAct_9fa48("141714") ? "" : (stryCov_9fa48("141714"), 'allow_reduced_priority'),
  DENY: stryMutAct_9fa48("141715") ? "" : (stryCov_9fa48("141715"), 'deny')
}));

// --- Pressure behavior event types (Req 8.5) ---

const PRESSURE_BEHAVIOR_EVENT = Object.freeze(stryMutAct_9fa48("141716") ? {} : (stryCov_9fa48("141716"), {
  PRESSURE_TRANSITION: stryMutAct_9fa48("141717") ? "" : (stryCov_9fa48("141717"), 'pressure_transition'),
  MOVE_GATED: stryMutAct_9fa48("141718") ? "" : (stryCov_9fa48("141718"), 'move_gated')
}));

// --- Metric name constants (Req 10.1) ---

const STORAGE_METRIC = Object.freeze(stryMutAct_9fa48("141719") ? {} : (stryCov_9fa48("141719"), {
  BUDGET_BYTES: stryMutAct_9fa48("141720") ? "" : (stryCov_9fa48("141720"), 'storage.budget_bytes'),
  USED_BYTES: stryMutAct_9fa48("141721") ? "" : (stryCov_9fa48("141721"), 'storage.used_bytes'),
  RESERVED_BYTES: stryMutAct_9fa48("141722") ? "" : (stryCov_9fa48("141722"), 'storage.reserved_bytes'),
  AVAILABLE_BYTES: stryMutAct_9fa48("141723") ? "" : (stryCov_9fa48("141723"), 'storage.available_bytes'),
  UTILIZATION_PERCENT: stryMutAct_9fa48("141724") ? "" : (stryCov_9fa48("141724"), 'storage.utilization_percent'),
  PRESSURE_STATE: stryMutAct_9fa48("141725") ? "" : (stryCov_9fa48("141725"), 'storage.pressure_state'),
  ADMISSION_ALLOW_COUNT: stryMutAct_9fa48("141726") ? "" : (stryCov_9fa48("141726"), 'storage.admission.allow_count'),
  ADMISSION_DENY_COUNT: stryMutAct_9fa48("141727") ? "" : (stryCov_9fa48("141727"), 'storage.admission.deny_count')
}));

// --- Admin command name constants (Req 10.3, 10.4) ---

const STORAGE_ADMIN_COMMAND = Object.freeze(stryMutAct_9fa48("141728") ? {} : (stryCov_9fa48("141728"), {
  GET_STORAGE_CAPACITY: stryMutAct_9fa48("141729") ? "" : (stryCov_9fa48("141729"), 'getStorageCapacity'),
  GET_STORAGE_RESERVATIONS: stryMutAct_9fa48("141730") ? "" : (stryCov_9fa48("141730"), 'getStorageReservations')
}));

// --- Subsystem identifier ---

const STORAGE_CAPACITY_SUBSYSTEM = stryMutAct_9fa48("141731") ? "" : (stryCov_9fa48("141731"), 'storage-capacity');

// --- Log messages ---

const STORAGE_CAPACITY_LOG_MSG = Object.freeze(stryMutAct_9fa48("141732") ? {} : (stryCov_9fa48("141732"), {
  ADMISSION_ALLOWED: stryMutAct_9fa48("141733") ? "" : (stryCov_9fa48("141733"), 'Storage admission allowed'),
  ADMISSION_DENIED: stryMutAct_9fa48("141734") ? "" : (stryCov_9fa48("141734"), 'Storage admission denied'),
  OBSERVE_MODE_OVERRIDE: stryMutAct_9fa48("141735") ? "" : (stryCov_9fa48("141735"), 'Observe mode overriding deny to allow'),
  BACKFILL_APPLIED: stryMutAct_9fa48("141736") ? "" : (stryCov_9fa48("141736"), 'Node storage budget backfilled'),
  BACKFILL_SKIPPED: stryMutAct_9fa48("141737") ? "" : (stryCov_9fa48("141737"), 'Node storage budget backfill skipped'),
  RESERVATION_CREATED: stryMutAct_9fa48("141738") ? "" : (stryCov_9fa48("141738"), 'Storage reservation created'),
  RESERVATION_RELEASED: stryMutAct_9fa48("141739") ? "" : (stryCov_9fa48("141739"), 'Storage reservation released'),
  RESERVATION_EXPIRED: stryMutAct_9fa48("141740") ? "" : (stryCov_9fa48("141740"), 'Storage reservation expired'),
  RESERVATION_RECONCILED: stryMutAct_9fa48("141741") ? "" : (stryCov_9fa48("141741"), 'Storage reservation reconciled'),
  PRESSURE_TRANSITION: stryMutAct_9fa48("141742") ? "" : (stryCov_9fa48("141742"), 'Storage pressure state transition'),
  BUDGET_RESOLVED: stryMutAct_9fa48("141743") ? "" : (stryCov_9fa48("141743"), 'Node storage budget resolved'),
  BUDGET_MISSING: stryMutAct_9fa48("141744") ? "" : (stryCov_9fa48("141744"), 'Node storage budget missing or invalid'),
  CAPACITY_FILTER_APPLIED: stryMutAct_9fa48("141745") ? "" : (stryCov_9fa48("141745"), 'Capacity feasibility filter applied'),
  CAPACITY_FILTER_REJECTED: stryMutAct_9fa48("141746") ? "" : (stryCov_9fa48("141746"), 'Node rejected by capacity filter')
}));

// --- Error messages ---

const STORAGE_CAPACITY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("141747") ? {} : (stryCov_9fa48("141747"), {
  BUDGET_NON_POSITIVE: stryMutAct_9fa48("141748") ? "" : (stryCov_9fa48("141748"), 'Storage budget must be positive'),
  BUDGET_TOO_SMALL: stryMutAct_9fa48("141749") ? "" : (stryCov_9fa48("141749"), 'Storage budget is below minimum allowed'),
  BUDGET_EXCEEDS_DISK: stryMutAct_9fa48("141750") ? "" : (stryCov_9fa48("141750"), 'Storage budget exceeds physical disk size'),
  DISK_SIZE_UNAVAILABLE: stryMutAct_9fa48("141751") ? "" : (stryCov_9fa48("141751"), 'Disk size unavailable for budget resolution'),
  BUDGET_MALFORMED: stryMutAct_9fa48("141752") ? "" : (stryCov_9fa48("141752"), 'Storage budget value is malformed'),
  RATIO_OUT_OF_RANGE: stryMutAct_9fa48("141753") ? "" : (stryCov_9fa48("141753"), 'Storage budget ratio must be between 0.01 and 1.0'),
  BOTH_BUDGET_TYPES_PROVIDED: (stryMutAct_9fa48("141754") ? "" : (stryCov_9fa48("141754"), 'Both storageBudgetBytes and storageBudgetRatio provided; ')) + (stryMutAct_9fa48("141755") ? "" : (stryCov_9fa48("141755"), 'absolute bytes takes precedence')),
  ACCOUNTING_SOURCE_REQUIRED: stryMutAct_9fa48("141756") ? "" : (stryCov_9fa48("141756"), 'StorageCapacityAccountingService requires systemTableCache or sqlQueryEngine')
}));
export { ADMISSION_DECISION, ADMISSION_MODE, ADMISSION_REASON, BACKFILL_DEFAULT_RATIO, MOVE_CRITICALITY, PRESSURE_BEHAVIOR_DECISION, PRESSURE_BEHAVIOR_EVENT, PRESSURE_STATE, RESERVATION_REASON, RESERVATION_STATUS, STORAGE_ADMIN_COMMAND, STORAGE_BUDGET_CONFIG_KEY, STORAGE_BUDGET_SOURCE, STORAGE_BUDGET_VALIDATION, STORAGE_CAPACITY_CONFIG_KEY, STORAGE_CAPACITY_DEFAULT, STORAGE_CAPACITY_ERROR_MSG, STORAGE_CAPACITY_LOG_MSG, STORAGE_CAPACITY_SUBSYSTEM, STORAGE_METRIC, STORAGE_PLACEMENT_CONSTRAINT, STORAGE_PLACEMENT_DEFAULT };