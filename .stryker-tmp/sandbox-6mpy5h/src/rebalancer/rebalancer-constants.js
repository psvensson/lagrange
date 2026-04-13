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
import { NUM, SERVICE_STATUS, UNIFIED_SERVICE_TYPE } from '../constants/index.js';
import { SERVICE_TYPE } from '../constants/service.js';
import { STORAGE_PLACEMENT_CONSTRAINT, STORAGE_PLACEMENT_DEFAULT } from './storage-capacity-constants.js';
import { DEFAULT_MESSAGE_GROUP_POLICY } from '../policy/policy-constants.js';
const REBALANCER_SUBSYSTEM = Object.freeze(stryMutAct_9fa48("137645") ? {} : (stryCov_9fa48("137645"), {
  UNIFIED: stryMutAct_9fa48("137646") ? "" : (stryCov_9fa48("137646"), 'rebalancer'),
  COORDINATOR: stryMutAct_9fa48("137647") ? "" : (stryCov_9fa48("137647"), 'rebalance-coordinator')
}));
const REBALANCER_ENTITY_TYPE = Object.freeze(stryMutAct_9fa48("137648") ? {} : (stryCov_9fa48("137648"), {
  PARTITION: SERVICE_TYPE.PARTITION,
  MESSAGE_GROUP: SERVICE_TYPE.MESSAGE_GROUP,
  WASM_SERVICE: SERVICE_TYPE.WASM_SERVICE,
  RUNTIME_SERVICE: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE
}));
const REBALANCER_TRIGGER = Object.freeze(stryMutAct_9fa48("137649") ? {} : (stryCov_9fa48("137649"), {
  NODE_JOIN: stryMutAct_9fa48("137650") ? "" : (stryCov_9fa48("137650"), 'node_join'),
  NODE_LEAVE: stryMutAct_9fa48("137651") ? "" : (stryCov_9fa48("137651"), 'node_leave'),
  NODE_FAILURE: stryMutAct_9fa48("137652") ? "" : (stryCov_9fa48("137652"), 'node_failure'),
  POLICY_CHANGE: stryMutAct_9fa48("137653") ? "" : (stryCov_9fa48("137653"), 'policy_change'),
  PERIODIC: stryMutAct_9fa48("137654") ? "" : (stryCov_9fa48("137654"), 'periodic'),
  CRITICAL: stryMutAct_9fa48("137655") ? "" : (stryCov_9fa48("137655"), 'critical')
}));
const REBALANCER_MOVE_TYPE = Object.freeze(stryMutAct_9fa48("137656") ? {} : (stryCov_9fa48("137656"), {
  ADD: stryMutAct_9fa48("137657") ? "" : (stryCov_9fa48("137657"), 'add'),
  REMOVE: stryMutAct_9fa48("137658") ? "" : (stryCov_9fa48("137658"), 'remove'),
  REPLACE: stryMutAct_9fa48("137659") ? "" : (stryCov_9fa48("137659"), 'replace')
}));
const REBALANCER_NODE_STATUS = Object.freeze(stryMutAct_9fa48("137660") ? {} : (stryCov_9fa48("137660"), {
  ACTIVE: SERVICE_STATUS.ACTIVE,
  SUSPECTED: stryMutAct_9fa48("137661") ? "" : (stryCov_9fa48("137661"), 'suspected'),
  FAILED: stryMutAct_9fa48("137662") ? "" : (stryCov_9fa48("137662"), 'failed')
}));
const REBALANCER_CONFIG_KEY = Object.freeze(stryMutAct_9fa48("137663") ? {} : (stryCov_9fa48("137663"), {
  PENDING_TIMEOUT_MS: stryMutAct_9fa48("137664") ? "" : (stryCov_9fa48("137664"), 'rebalancer.pendingTimeoutMs'),
  CREATING_TIMEOUT_MS: stryMutAct_9fa48("137665") ? "" : (stryCov_9fa48("137665"), 'rebalancer.creatingTimeoutMs'),
  SYNCING_TIMEOUT_MS: stryMutAct_9fa48("137666") ? "" : (stryCov_9fa48("137666"), 'rebalancer.syncingTimeoutMs'),
  REMOVING_TIMEOUT_MS: stryMutAct_9fa48("137667") ? "" : (stryCov_9fa48("137667"), 'rebalancer.removingTimeoutMs'),
  MAX_CONCURRENT_ADDS: stryMutAct_9fa48("137668") ? "" : (stryCov_9fa48("137668"), 'rebalancer.maxConcurrentAdds'),
  MAX_CONCURRENT_REMOVES: stryMutAct_9fa48("137669") ? "" : (stryCov_9fa48("137669"), 'rebalancer.maxConcurrentRemoves'),
  PERIODIC_CHECK_INTERVAL_MS: stryMutAct_9fa48("137670") ? "" : (stryCov_9fa48("137670"), 'rebalancer.periodicCheckIntervalMs'),
  PERIODIC_CHECK_JITTER_MS: stryMutAct_9fa48("137671") ? "" : (stryCov_9fa48("137671"), 'rebalancer.periodicCheckJitterMs'),
  CRITICAL_CHECK_DELAY_MS: stryMutAct_9fa48("137672") ? "" : (stryCov_9fa48("137672"), 'rebalancer.criticalCheckDelayMs'),
  MAX_CONCURRENT_MOVES: stryMutAct_9fa48("137673") ? "" : (stryCov_9fa48("137673"), 'rebalancer.maxConcurrentMoves'),
  MOVE_TIMEOUT_MS: stryMutAct_9fa48("137674") ? "" : (stryCov_9fa48("137674"), 'rebalancer.moveTimeoutMs'),
  MOVE_BATCH_SIZE: stryMutAct_9fa48("137675") ? "" : (stryCov_9fa48("137675"), 'rebalancer.moveBatchSize'),
  INTER_BATCH_DELAY_MS: stryMutAct_9fa48("137676") ? "" : (stryCov_9fa48("137676"), 'rebalancer.interBatchDelayMs'),
  REBALANCE_BUDGET: stryMutAct_9fa48("137677") ? "" : (stryCov_9fa48("137677"), 'rebalancer.rebalanceBudget'),
  NODE_CPU_THRESHOLD: stryMutAct_9fa48("137678") ? "" : (stryCov_9fa48("137678"), 'rebalancer.nodeCpuThreshold'),
  NODE_MEMORY_THRESHOLD: stryMutAct_9fa48("137679") ? "" : (stryCov_9fa48("137679"), 'rebalancer.nodeMemoryThreshold'),
  NODE_DISK_THRESHOLD: stryMutAct_9fa48("137680") ? "" : (stryCov_9fa48("137680"), 'rebalancer.nodeDiskThreshold'),
  READINESS_PING_ENABLED: stryMutAct_9fa48("137681") ? "" : (stryCov_9fa48("137681"), 'rebalancer.readinessPingEnabled'),
  READINESS_PING_TIMEOUT_MS: stryMutAct_9fa48("137682") ? "" : (stryCov_9fa48("137682"), 'rebalancer.readinessPingTimeoutMs'),
  STABILIZATION_PERIOD_MS: stryMutAct_9fa48("137683") ? "" : (stryCov_9fa48("137683"), 'rebalancer.stabilizationPeriodMs'),
  SYSTEM_PARTITION_START_DELAY_MS: stryMutAct_9fa48("137684") ? "" : (stryCov_9fa48("137684"), 'rebalancer.systemPartitionStartDelayMs'),
  USER_PARTITION_START_DELAY_MS: stryMutAct_9fa48("137685") ? "" : (stryCov_9fa48("137685"), 'rebalancer.userPartitionStartDelayMs')
}));
const REBALANCER_DEFAULT = Object.freeze(stryMutAct_9fa48("137686") ? {} : (stryCov_9fa48("137686"), {
  COORDINATOR: Object.freeze(stryMutAct_9fa48("137687") ? {} : (stryCov_9fa48("137687"), {
    PENDING_TIMEOUT_MS: 30000,
    CREATING_TIMEOUT_MS: 60000,
    SYNCING_TIMEOUT_MS: 300000,
    REMOVING_TIMEOUT_MS: 60000,
    MAX_CONCURRENT_ADDS: NUM.FIVE,
    MAX_CONCURRENT_REMOVES: NUM.FIVE,
    PERIODIC_CHECK_INTERVAL_MS: 60000,
    TIMEOUT_CHECK_INTERVAL_MS: 1000
  })),
  UNIFIED: Object.freeze(stryMutAct_9fa48("137688") ? {} : (stryCov_9fa48("137688"), {
    PERIODIC_CHECK_INTERVAL_MS: 60000,
    PERIODIC_CHECK_JITTER_MS: 10000,
    CRITICAL_CHECK_DELAY_MS: 5000,
    MAX_CONCURRENT_MOVES: NUM.FIVE,
    MOVE_TIMEOUT_MS: 300000,
    MOVE_BATCH_SIZE: NUM.TWO,
    INTER_BATCH_DELAY_MS: 100,
    REBALANCE_BUDGET: 10,
    CRITICAL_BUDGET_MULTIPLIER: 2,
    NODE_CPU_THRESHOLD: 0.8,
    NODE_MEMORY_THRESHOLD: 0.8,
    NODE_DISK_THRESHOLD: 0.9,
    READINESS_PING_ENABLED: stryMutAct_9fa48("137689") ? true : (stryCov_9fa48("137689"), false),
    READINESS_PING_TIMEOUT_MS: 1000,
    MIN_STABILIZATION_MS: 1000,
    MAX_STABILIZATION_MS: 10000,
    DEFAULT_STABILIZATION_MS: 1000,
    SYSTEM_PARTITION_START_DELAY_MS: 0,
    USER_PARTITION_START_DELAY_MS: 0
  }))
}));
const REBALANCER_DEFAULT_POLICY = Object.freeze(stryMutAct_9fa48("137690") ? {} : (stryCov_9fa48("137690"), {
  TABLE: Object.freeze(stryMutAct_9fa48("137691") ? {} : (stryCov_9fa48("137691"), {
    replicaCount: NUM.THREE,
    minReplicaCount: NUM.THREE,
    maxReplicaCount: NUM.SEVEN,
    placementConstraints: stryMutAct_9fa48("137692") ? {} : (stryCov_9fa48("137692"), {
      spreadAcrossNodes: stryMutAct_9fa48("137693") ? false : (stryCov_9fa48("137693"), true),
      considerDiskSpace: stryMutAct_9fa48("137694") ? false : (stryCov_9fa48("137694"), true),
      considerCpuLoad: stryMutAct_9fa48("137695") ? false : (stryCov_9fa48("137695"), true),
      considerMemoryLoad: stryMutAct_9fa48("137696") ? false : (stryCov_9fa48("137696"), true),
      [STORAGE_PLACEMENT_CONSTRAINT.MIN_FREE_BYTES_PER_NODE]: STORAGE_PLACEMENT_DEFAULT.MIN_FREE_BYTES_PER_NODE,
      [STORAGE_PLACEMENT_CONSTRAINT.MAX_BUDGET_UTILIZATION_PERCENT]: STORAGE_PLACEMENT_DEFAULT.MAX_BUDGET_UTILIZATION_PERCENT,
      [STORAGE_PLACEMENT_CONSTRAINT.RESERVE_EMERGENCY_HEADROOM]: STORAGE_PLACEMENT_DEFAULT.RESERVE_EMERGENCY_HEADROOM
    })
  })),
  MESSAGE_GROUP: DEFAULT_MESSAGE_GROUP_POLICY,
  WASM_SERVICE: Object.freeze(stryMutAct_9fa48("137697") ? {} : (stryCov_9fa48("137697"), {
    targetReplicaCount: NUM.THREE,
    minReplicaCount: NUM.THREE,
    maxReplicaCount: NUM.SEVEN,
    placementConstraints: stryMutAct_9fa48("137698") ? {} : (stryCov_9fa48("137698"), {
      spreadAcrossNodes: stryMutAct_9fa48("137699") ? false : (stryCov_9fa48("137699"), true),
      considerCpuLoad: stryMutAct_9fa48("137700") ? false : (stryCov_9fa48("137700"), true),
      considerMemoryLoad: stryMutAct_9fa48("137701") ? false : (stryCov_9fa48("137701"), true)
    })
  })),
  RUNTIME_SERVICE: Object.freeze(stryMutAct_9fa48("137702") ? {} : (stryCov_9fa48("137702"), {
    targetReplicaCount: NUM.THREE,
    minReplicaCount: NUM.ONE,
    maxReplicaCount: NUM.SEVEN,
    placementConstraints: stryMutAct_9fa48("137703") ? {} : (stryCov_9fa48("137703"), {
      spreadAcrossNodes: stryMutAct_9fa48("137704") ? false : (stryCov_9fa48("137704"), true),
      considerCpuLoad: stryMutAct_9fa48("137705") ? false : (stryCov_9fa48("137705"), true),
      considerMemoryLoad: stryMutAct_9fa48("137706") ? false : (stryCov_9fa48("137706"), true)
    })
  }))
}));
const REBALANCER_EVENT = Object.freeze(stryMutAct_9fa48("137707") ? {} : (stryCov_9fa48("137707"), {
  REBALANCE_COMPLETE: stryMutAct_9fa48("137708") ? "" : (stryCov_9fa48("137708"), 'rebalanceComplete'),
  NODE_STATE_CHANGE: stryMutAct_9fa48("137709") ? "" : (stryCov_9fa48("137709"), 'nodeStateChange'),
  REBALANCE_NEEDED: stryMutAct_9fa48("137710") ? "" : (stryCov_9fa48("137710"), 'rebalanceNeeded')
}));
const REBALANCER_LOG_MSG = Object.freeze(stryMutAct_9fa48("137711") ? {} : (stryCov_9fa48("137711"), {
  INITIALIZED: stryMutAct_9fa48("137712") ? "" : (stryCov_9fa48("137712"), 'Rebalancer initialized'),
  COORDINATOR_SET: stryMutAct_9fa48("137713") ? "" : (stryCov_9fa48("137713"), 'RebalanceCoordinator set for rebalancer'),
  LEADER_START: stryMutAct_9fa48("137714") ? "" : (stryCov_9fa48("137714"), 'Became leader, starting rebalancing scheduler'),
  LEADER_STOP: stryMutAct_9fa48("137715") ? "" : (stryCov_9fa48("137715"), 'Lost leadership, stopping rebalancing scheduler'),
  STABILIZATION_RESET: stryMutAct_9fa48("137716") ? "" : (stryCov_9fa48("137716"), 'State change recorded, resetting stabilization timer'),
  SKIP_TRANSITIONAL: stryMutAct_9fa48("137717") ? "" : (stryCov_9fa48("137717"), 'Replicas in transition, skipping move calculation'),
  SKIP_PENDING: stryMutAct_9fa48("137718") ? "" : (stryCov_9fa48("137718"), 'Pending moves exist, skipping move calculation'),
  SKIP_REMOVE_REMOVING: stryMutAct_9fa48("137719") ? "" : (stryCov_9fa48("137719"), 'Skipping REMOVE for replica already in removing state'),
  SKIP_ADD_TRANSITIONAL: stryMutAct_9fa48("137720") ? "" : (stryCov_9fa48("137720"), 'Skipping ADD for node with transitional replica'),
  DEFER_ADD_DEGRADED: stryMutAct_9fa48("137721") ? "" : (stryCov_9fa48("137721"), 'Deferring ADD moves while degraded placement is already at target replica count'),
  DEFER_REMOVE_DETAIL: stryMutAct_9fa48("137722") ? "" : (stryCov_9fa48("137722"), 'Deferring REMOVE until ADDs complete'),
  DEFER_REMOVE: stryMutAct_9fa48("137723") ? "" : (stryCov_9fa48("137723"), 'Deferring REMOVE moves until ADD moves complete'),
  INCLUDE_CRITICAL_REMOVE: stryMutAct_9fa48("137724") ? "" : (stryCov_9fa48("137724"), 'Including critical REMOVE moves alongside ADD moves'),
  NODE_STATE_CHANGE: stryMutAct_9fa48("137725") ? "" : (stryCov_9fa48("137725"), 'Node state change detected'),
  EXECUTE_MOVE: stryMutAct_9fa48("137726") ? "" : (stryCov_9fa48("137726"), 'Executing rebalancing move'),
  MOVE_SKIPPED: stryMutAct_9fa48("137727") ? "" : (stryCov_9fa48("137727"), 'Rebalancing move skipped'),
  SKIP_UNREADY_NODE: stryMutAct_9fa48("137728") ? "" : (stryCov_9fa48("137728"), 'Skipping move for unready node'),
  MOVE_BLOCKED_BY_SAFETY_POLICY: stryMutAct_9fa48("137729") ? "" : (stryCov_9fa48("137729"), 'Skipping move blocked by safety policy'),
  MOVE_FAILED: stryMutAct_9fa48("137730") ? "" : (stryCov_9fa48("137730"), 'Failed to execute move'),
  SKIP_BATCH_UNREADY: stryMutAct_9fa48("137731") ? "" : (stryCov_9fa48("137731"), 'Skipping moves for unready node'),
  NODE_DISCONNECTED_BATCH: stryMutAct_9fa48("137732") ? "" : (stryCov_9fa48("137732"), 'Node disconnected during batch execution'),
  NOT_LEADER_SKIP: stryMutAct_9fa48("137733") ? "" : (stryCov_9fa48("137733"), 'Not leader, skipping rebalance'),
  NO_AVAILABLE_NODES: stryMutAct_9fa48("137734") ? "" : (stryCov_9fa48("137734"), 'Skipping rebalance - no available nodes in cache'),
  NO_REBALANCE_NEEDED: stryMutAct_9fa48("137735") ? "" : (stryCov_9fa48("137735"), 'No rebalancing needed'),
  START_REBALANCE: stryMutAct_9fa48("137736") ? "" : (stryCov_9fa48("137736"), 'Starting rebalancing'),
  SCHEDULE_NEXT: stryMutAct_9fa48("137737") ? "" : (stryCov_9fa48("137737"), 'Scheduled next rebalance check'),
  CACHE_UNAVAILABLE: stryMutAct_9fa48("137738") ? "" : (stryCov_9fa48("137738"), 'System table cache not available, skipping rebalance check'),
  WAIT_STABILIZATION: stryMutAct_9fa48("137739") ? "" : (stryCov_9fa48("137739"), 'Waiting for stabilization period to complete'),
  WAIT_START_DELAY: stryMutAct_9fa48("137740") ? "" : (stryCov_9fa48("137740"), 'Waiting for partition rebalance start delay to elapse'),
  WAIT_TOPOLOGY_SETTLING: (stryMutAct_9fa48("137741") ? "" : (stryCov_9fa48("137741"), 'Waiting for transitional cluster membership to settle before planning ')) + (stryMutAct_9fa48("137742") ? "" : (stryCov_9fa48("137742"), 'critical system rebalancing')),
  REVALIDATE_TOPOLOGY_BLOCKER_FAILED: stryMutAct_9fa48("137743") ? "" : (stryCov_9fa48("137743"), 'Failed to revalidate topology-settling in-flight blocker'),
  WAIT_LOCAL_SERVE_READINESS: stryMutAct_9fa48("137744") ? "" : (stryCov_9fa48("137744"), 'Waiting for local control-plane serve readiness before planning critical system rebalancing'),
  WAIT_LOCAL_MUTATION_READINESS: stryMutAct_9fa48("137745") ? "" : (stryCov_9fa48("137745"), 'Waiting for local control-plane mutation readiness before planning background rebalancing'),
  WAIT_TRAFFIC_READY: stryMutAct_9fa48("137746") ? "" : (stryCov_9fa48("137746"), 'Waiting for bootstrap traffic-readiness before planning critical system rebalancing'),
  WAIT_CONTROL_PLANE_PRIORITY: stryMutAct_9fa48("137747") ? "" : (stryCov_9fa48("137747"), 'Deferring non-system rebalancing until priority control-plane partitions spread'),
  WAIT_TRANSPORT_BACKPRESSURE: stryMutAct_9fa48("137748") ? "" : (stryCov_9fa48("137748"), 'Waiting for local transport backpressure to clear before planning'),
  REBALANCE_ERROR: stryMutAct_9fa48("137749") ? "" : (stryCov_9fa48("137749"), 'Error during rebalance check'),
  EVALUATING_STATE: stryMutAct_9fa48("137750") ? "" : (stryCov_9fa48("137750"), 'Evaluating rebalancing state'),
  CRITICAL_STATE: stryMutAct_9fa48("137751") ? "" : (stryCov_9fa48("137751"), 'Critical rebalancing state detected'),
  SUBOPTIMAL_STATE: stryMutAct_9fa48("137752") ? "" : (stryCov_9fa48("137752"), 'Suboptimal rebalancing state detected'),
  DEGRADED_TARGET: stryMutAct_9fa48("137753") ? "" : (stryCov_9fa48("137753"), 'Replica target is constrained by available ready nodes'),
  IMMEDIATE_TRIGGER: stryMutAct_9fa48("137754") ? "" : (stryCov_9fa48("137754"), 'Immediate rebalancing check triggered'),
  CLUSTER_NOT_READY: stryMutAct_9fa48("137755") ? "" : (stryCov_9fa48("137755"), 'Cluster readiness not confirmed, deferring planning'),
  CLUSTER_READINESS_TIMEOUT: stryMutAct_9fa48("137756") ? "" : (stryCov_9fa48("137756"), 'Cluster readiness timed out, proceeding with available state'),
  CLUSTER_READINESS_CONFIRMED: stryMutAct_9fa48("137757") ? "" : (stryCov_9fa48("137757"), 'Cluster readiness confirmed'),
  SHUTDOWN: stryMutAct_9fa48("137758") ? "" : (stryCov_9fa48("137758"), 'Rebalancer shutdown')
}));
const REBALANCE_COORDINATOR_EVENT = Object.freeze(stryMutAct_9fa48("137759") ? {} : (stryCov_9fa48("137759"), {
  OPERATION_CREATED: stryMutAct_9fa48("137760") ? "" : (stryCov_9fa48("137760"), 'operationCreated'),
  STEP_CHANGED: stryMutAct_9fa48("137761") ? "" : (stryCov_9fa48("137761"), 'stepChanged'),
  OPERATION_COMPLETED: stryMutAct_9fa48("137762") ? "" : (stryCov_9fa48("137762"), 'operationCompleted'),
  OPERATION_FAILED: stryMutAct_9fa48("137763") ? "" : (stryCov_9fa48("137763"), 'operationFailed'),
  RECOVERY_COMPLETED: stryMutAct_9fa48("137764") ? "" : (stryCov_9fa48("137764"), 'recoveryCompleted'),
  RECOVERY_FAILED: stryMutAct_9fa48("137765") ? "" : (stryCov_9fa48("137765"), 'recoveryFailed'),
  RESERVATION_CREATED: stryMutAct_9fa48("137766") ? "" : (stryCov_9fa48("137766"), 'reservationCreated'),
  RESERVATION_RELEASED: stryMutAct_9fa48("137767") ? "" : (stryCov_9fa48("137767"), 'reservationReleased'),
  RESERVATION_RECONCILED: stryMutAct_9fa48("137768") ? "" : (stryCov_9fa48("137768"), 'reservationReconciled'),
  READ_MODEL_DIVERGENCE: stryMutAct_9fa48("137769") ? "" : (stryCov_9fa48("137769"), 'readModelDivergence'),
  OUTCOME_ROUTED: stryMutAct_9fa48("137770") ? "" : (stryCov_9fa48("137770"), 'outcomeRouted'),
  SHUTDOWN: stryMutAct_9fa48("137771") ? "" : (stryCov_9fa48("137771"), 'shutdown')
}));
const REBALANCE_COORDINATOR_LOG_MSG = Object.freeze(stryMutAct_9fa48("137772") ? {} : (stryCov_9fa48("137772"), {
  INITIALIZED: stryMutAct_9fa48("137773") ? "" : (stryCov_9fa48("137773"), 'RebalanceCoordinator initialized'),
  CREATE_OPERATION: stryMutAct_9fa48("137774") ? "" : (stryCov_9fa48("137774"), 'Creating operation'),
  SEND_OPERATION: stryMutAct_9fa48("137775") ? "" : (stryCov_9fa48("137775"), 'Sending replica operation'),
  STEP_CHANGED: stryMutAct_9fa48("137776") ? "" : (stryCov_9fa48("137776"), 'Operation step changed'),
  OPERATION_COMPLETED: stryMutAct_9fa48("137777") ? "" : (stryCov_9fa48("137777"), 'Operation completed'),
  OPERATION_FAILED: stryMutAct_9fa48("137778") ? "" : (stryCov_9fa48("137778"), 'Operation failed'),
  OPERATION_BLOCKED_BY_SAFETY_POLICY: stryMutAct_9fa48("137779") ? "" : (stryCov_9fa48("137779"), 'Operation blocked by safety policy'),
  OPERATION_DEFERRED_BY_SAFETY_POLICY: stryMutAct_9fa48("137780") ? "" : (stryCov_9fa48("137780"), 'Operation deferred by safety policy'),
  OPERATION_DISPATCH_RETRY_DEFERRED: stryMutAct_9fa48("137781") ? "" : (stryCov_9fa48("137781"), 'Deferred retryable replica operation dispatch failure'),
  OPERATION_DISPATCH_RETRY_FAILED: stryMutAct_9fa48("137782") ? "" : (stryCov_9fa48("137782"), 'Deferred replica operation dispatch retry failed'),
  OPERATION_TRANSITION_RETRY_DEFERRED: stryMutAct_9fa48("137783") ? "" : (stryCov_9fa48("137783"), 'Deferred retryable replica operation transition failure'),
  OPERATION_TRANSITION_RETRY_FAILED: stryMutAct_9fa48("137784") ? "" : (stryCov_9fa48("137784"), 'Deferred replica operation transition retry failed'),
  OPERATION_TIMED_OUT: stryMutAct_9fa48("137785") ? "" : (stryCov_9fa48("137785"), 'Operation timed out'),
  SKIP_PERSIST_NO_CDC: stryMutAct_9fa48("137786") ? "" : (stryCov_9fa48("137786"), 'CDC integration service not available, skipping persistence'),
  PERSIST_FAILED: stryMutAct_9fa48("137787") ? "" : (stryCov_9fa48("137787"), 'Failed to persist operation'),
  RECOVERY_START: stryMutAct_9fa48("137788") ? "" : (stryCov_9fa48("137788"), 'Starting recovery process'),
  RECOVERY_FOUND: stryMutAct_9fa48("137789") ? "" : (stryCov_9fa48("137789"), 'Found incomplete operations during recovery'),
  RECOVERY_MARK_FAILED: stryMutAct_9fa48("137790") ? "" : (stryCov_9fa48("137790"), 'Marked incomplete operation as failed during recovery'),
  RECOVERY_MARK_REMOVE_FAILED: stryMutAct_9fa48("137791") ? "" : (stryCov_9fa48("137791"), 'Marked incomplete removal operation as failed during recovery'),
  RECOVERY_PROCESS_ERROR: stryMutAct_9fa48("137792") ? "" : (stryCov_9fa48("137792"), 'Error processing operation during recovery'),
  RECOVERY_COMPLETED: stryMutAct_9fa48("137793") ? "" : (stryCov_9fa48("137793"), 'Recovery process completed'),
  RECOVERY_FAILED: stryMutAct_9fa48("137794") ? "" : (stryCov_9fa48("137794"), 'Recovery process failed'),
  RECONCILE_SYNCING: stryMutAct_9fa48("137795") ? "" : (stryCov_9fa48("137795"), 'Reconciling SYNCING operation'),
  RECONCILE_ACTIVE: stryMutAct_9fa48("137796") ? "" : (stryCov_9fa48("137796"), 'Reconciled SYNCING operation to ACTIVE'),
  RECONCILE_FAILED: stryMutAct_9fa48("137797") ? "" : (stryCov_9fa48("137797"), 'Reconciled SYNCING operation to FAILED'),
  RECONCILE_FAILED_NOT_FOUND: stryMutAct_9fa48("137798") ? "" : (stryCov_9fa48("137798"), 'Reconciled SYNCING operation to FAILED - replica not found'),
  RECONCILE_IN_PROGRESS: stryMutAct_9fa48("137799") ? "" : (stryCov_9fa48("137799"), 'SYNCING operation still in progress'),
  SHUTDOWN: stryMutAct_9fa48("137800") ? "" : (stryCov_9fa48("137800"), 'Shutting down RebalanceCoordinator'),
  DUPLICATE_OPERATION: stryMutAct_9fa48("137801") ? "" : (stryCov_9fa48("137801"), 'Duplicate operation detected, reusing existing'),
  STEPS_HISTORY_PARSE_ERROR: stryMutAct_9fa48("137802") ? "" : (stryCov_9fa48("137802"), 'Failed to parse steps_history JSON'),
  QUERY_OPERATION_FAILED: stryMutAct_9fa48("137803") ? "" : (stryCov_9fa48("137803"), 'Failed to query operation from system table'),
  QUERY_OPERATIONS_FAILED: stryMutAct_9fa48("137804") ? "" : (stryCov_9fa48("137804"), 'Failed to query operations from system table'),
  RESERVATION_CREATED: stryMutAct_9fa48("137805") ? "" : (stryCov_9fa48("137805"), 'Storage reservation created with operation'),
  RESERVATION_RELEASED: stryMutAct_9fa48("137806") ? "" : (stryCov_9fa48("137806"), 'Storage reservation released'),
  RESERVATION_CREATE_FAILED: stryMutAct_9fa48("137807") ? "" : (stryCov_9fa48("137807"), 'Failed to create storage reservation for operation'),
  RESERVATION_RELEASE_FAILED: stryMutAct_9fa48("137808") ? "" : (stryCov_9fa48("137808"), 'Failed to release storage reservation for operation'),
  RESERVATION_RECONCILE_START: stryMutAct_9fa48("137809") ? "" : (stryCov_9fa48("137809"), 'Starting storage reservation reconciliation'),
  RESERVATION_RECONCILE_COMPLETED: stryMutAct_9fa48("137810") ? "" : (stryCov_9fa48("137810"), 'Storage reservation reconciliation completed'),
  RESERVATION_RECONCILE_EXPIRED: stryMutAct_9fa48("137811") ? "" : (stryCov_9fa48("137811"), 'Expired stale storage reservation during reconciliation'),
  RESERVATION_RECONCILE_ORPHAN: stryMutAct_9fa48("137812") ? "" : (stryCov_9fa48("137812"), 'Released orphan storage reservation during reconciliation'),
  READ_MODEL_DIVERGENCE: stryMutAct_9fa48("137813") ? "" : (stryCov_9fa48("137813"), 'Cache/authoritative divergence detected during reconciliation'),
  PROVISIONING_ADMISSION_DENIED: stryMutAct_9fa48("137814") ? "" : (stryCov_9fa48("137814"), 'Provisioning admission denied for storage-increasing move'),
  OUTCOME_RECEIVED: stryMutAct_9fa48("137815") ? "" : (stryCov_9fa48("137815"), 'Executor outcome received via reconcile queue'),
  OUTCOME_OPERATION_NOT_FOUND: stryMutAct_9fa48("137816") ? "" : (stryCov_9fa48("137816"), 'Executor outcome ignored: operation not found'),
  OUTCOME_OPERATION_TERMINAL: stryMutAct_9fa48("137817") ? "" : (stryCov_9fa48("137817"), 'Executor outcome ignored: operation already terminal'),
  OUTCOME_OPERATION_NOT_LOCAL: stryMutAct_9fa48("137818") ? "" : (stryCov_9fa48("137818"), 'Executor outcome ignored: operation not locally owned'),
  OUTCOME_TRANSITION_FAILED: stryMutAct_9fa48("137819") ? "" : (stryCov_9fa48("137819"), 'Executor outcome transition failed'),
  OUTCOME_UNKNOWN_ACTION: stryMutAct_9fa48("137820") ? "" : (stryCov_9fa48("137820"), 'Executor outcome ignored: unknown action mapping'),
  OBSERVED_PROGRESS_TRANSITION_FAILED: stryMutAct_9fa48("137821") ? "" : (stryCov_9fa48("137821"), 'Observed replica progress transition failed')
}));
const REBALANCE_COORDINATOR_DEFER_REASON = Object.freeze(stryMutAct_9fa48("137822") ? {} : (stryCov_9fa48("137822"), {
  REMOVE_SAFETY_BLOCKED: stryMutAct_9fa48("137823") ? "" : (stryCov_9fa48("137823"), 'remove_safety_blocked'),
  REPLACE_REMOVE_SAFETY_BLOCKED: stryMutAct_9fa48("137824") ? "" : (stryCov_9fa48("137824"), 'replace_remove_safety_blocked')
}));
const REBALANCE_COORDINATOR_ERROR_MSG = Object.freeze(stryMutAct_9fa48("137825") ? {} : (stryCov_9fa48("137825"), {
  NODE_ID_REQUIRED: stryMutAct_9fa48("137826") ? "" : (stryCov_9fa48("137826"), 'RebalanceCoordinator requires nodeId'),
  CACHE_REQUIRED: stryMutAct_9fa48("137827") ? "" : (stryCov_9fa48("137827"), 'RebalanceCoordinator requires systemTableCache'),
  CDC_REQUIRED: stryMutAct_9fa48("137828") ? "" : (stryCov_9fa48("137828"), 'RebalanceCoordinator requires cdcIntegrationService'),
  ROUTER_MISSING: stryMutAct_9fa48("137829") ? "" : (stryCov_9fa48("137829"), 'MessageRouter not configured'),
  MESSAGE_NOT_ACKED: stryMutAct_9fa48("137830") ? "" : (stryCov_9fa48("137830"), 'Message not acknowledged'),
  POLICY_REQUIRED: stryMutAct_9fa48("137831") ? "" : (stryCov_9fa48("137831"), 'RebalanceCoordinator requires tablePolicyService'),
  SQL_ENGINE_REQUIRED: stryMutAct_9fa48("137832") ? "" : (stryCov_9fa48("137832"), 'RebalanceCoordinator requires sqlQueryEngine'),
  STORAGE_ADMISSION_REQUIRED: stryMutAct_9fa48("137833") ? "" : (stryCov_9fa48("137833"), 'RebalanceCoordinator requires storageAdmissionService for add/replace operations'),
  STORAGE_ACCOUNTING_REQUIRED: stryMutAct_9fa48("137834") ? "" : (stryCov_9fa48("137834"), 'RebalanceCoordinator requires storageAccountingService for add/replace operations'),
  STORAGE_ADMISSION_CHECK_ADD_REQUIRED: stryMutAct_9fa48("137835") ? "" : (stryCov_9fa48("137835"), 'storageAdmissionService must provide checkAdd()'),
  STORAGE_ADMISSION_CHECK_REPLACE_REQUIRED: stryMutAct_9fa48("137836") ? "" : (stryCov_9fa48("137836"), 'storageAdmissionService must provide checkReplace()'),
  TRANSACTION_COORDINATOR_REQUIRED: stryMutAct_9fa48("137837") ? "" : (stryCov_9fa48("137837"), 'RebalanceCoordinator requires transactionCoordinator for atomic workflow transitions'),
  WORKFLOW_COORDINATOR_REQUIRED: stryMutAct_9fa48("137838") ? "" : (stryCov_9fa48("137838"), 'RebalanceCoordinator requires operationWorkflowCoordinator with runExclusive()'),
  WORKFLOW_COORDINATOR_REGISTRY_REQUIRED: stryMutAct_9fa48("137839") ? "" : (stryCov_9fa48("137839"), 'operationWorkflowCoordinator requires inFlightExecutionsByOwnerKey Map'),
  EXECUTOR_OUTCOME_EMITTER_REQUIRED: stryMutAct_9fa48("137840") ? "" : (stryCov_9fa48("137840"), 'RebalanceCoordinator requires executorOutcomeEmitter'),
  CONFLICTING_OPERATION_IN_FLIGHT: stryMutAct_9fa48("137841") ? "" : (stryCov_9fa48("137841"), 'Conflicting in-flight operation for replica')
}));
const REBALANCER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("137842") ? {} : (stryCov_9fa48("137842"), {
  ENTITY_ID_REQUIRED: stryMutAct_9fa48("137843") ? "" : (stryCov_9fa48("137843"), 'UnifiedRebalancer requires entityId'),
  ENTITY_TYPE_REQUIRED: stryMutAct_9fa48("137844") ? "" : (stryCov_9fa48("137844"), 'UnifiedRebalancer requires entityType'),
  NODE_ID_REQUIRED: stryMutAct_9fa48("137845") ? "" : (stryCov_9fa48("137845"), 'UnifiedRebalancer requires nodeId'),
  CACHE_REQUIRED: stryMutAct_9fa48("137846") ? "" : (stryCov_9fa48("137846"), 'UnifiedRebalancer requires systemTableCache'),
  CDC_REQUIRED: stryMutAct_9fa48("137847") ? "" : (stryCov_9fa48("137847"), 'UnifiedRebalancer requires cdcIntegrationService'),
  POLICY_REQUIRED: stryMutAct_9fa48("137848") ? "" : (stryCov_9fa48("137848"), 'UnifiedRebalancer requires tablePolicyService'),
  ROUTER_REQUIRED: stryMutAct_9fa48("137849") ? "" : (stryCov_9fa48("137849"), 'UnifiedRebalancer requires messageRouter'),
  COORDINATOR_REQUIRED: stryMutAct_9fa48("137850") ? "" : (stryCov_9fa48("137850"), 'RebalanceCoordinator is required for move execution'),
  SQL_ENGINE_REQUIRED: stryMutAct_9fa48("137851") ? "" : (stryCov_9fa48("137851"), 'UnifiedRebalancer requires sqlQueryEngine')
}));
const MOVE_PLANNER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("137852") ? {} : (stryCov_9fa48("137852"), {
  STORAGE_ADMISSION_REQUIRED: stryMutAct_9fa48("137853") ? "" : (stryCov_9fa48("137853"), 'MovePlanner requires storageAdmissionService for active capacity-gated planning'),
  STORAGE_ADMISSION_CHECK_ADD_REQUIRED: stryMutAct_9fa48("137854") ? "" : (stryCov_9fa48("137854"), 'MovePlanner storageAdmissionService must provide checkAdd()'),
  STORAGE_ACCOUNTING_REQUIRED: stryMutAct_9fa48("137855") ? "" : (stryCov_9fa48("137855"), 'MovePlanner requires accountingService for active capacity-gated planning'),
  STORAGE_ACCOUNTING_ESTIMATE_REQUIRED: stryMutAct_9fa48("137856") ? "" : (stryCov_9fa48("137856"), 'MovePlanner accountingService must provide estimateReplicaBytes()'),
  STORAGE_PRESSURE_BEHAVIOR_REQUIRED: stryMutAct_9fa48("137857") ? "" : (stryCov_9fa48("137857"), 'MovePlanner requires storagePressureBehavior for active pressure-gated planning'),
  STORAGE_PRESSURE_BEHAVIOR_CHECK_REQUIRED: stryMutAct_9fa48("137858") ? "" : (stryCov_9fa48("137858"), 'MovePlanner storagePressureBehavior must provide shouldAllowMove()')
}));
const MOVE_REASON = Object.freeze(stryMutAct_9fa48("137859") ? {} : (stryCov_9fa48("137859"), {
  REPLICA_FAILED: stryMutAct_9fa48("137860") ? "" : (stryCov_9fa48("137860"), 'replica_failed'),
  INCREASE_REPLICA_COUNT: stryMutAct_9fa48("137861") ? "" : (stryCov_9fa48("137861"), 'increase_replica_count'),
  NODE_NOT_IN_TARGET: stryMutAct_9fa48("137862") ? "" : (stryCov_9fa48("137862"), 'node_not_in_target'),
  SPREAD_REPLICAS: stryMutAct_9fa48("137863") ? "" : (stryCov_9fa48("137863"), 'spread_replicas'),
  REPLACE_REPLICA: stryMutAct_9fa48("137864") ? "" : (stryCov_9fa48("137864"), 'replace_replica')
}));
const STABILIZATION_RESET_TRIGGER = Object.freeze(stryMutAct_9fa48("137865") ? {} : (stryCov_9fa48("137865"), {
  NODE_JOINED: stryMutAct_9fa48("137866") ? "" : (stryCov_9fa48("137866"), 'node_joined'),
  NODE_LEFT: stryMutAct_9fa48("137867") ? "" : (stryCov_9fa48("137867"), 'node_left'),
  NODE_FAILED: stryMutAct_9fa48("137868") ? "" : (stryCov_9fa48("137868"), 'node_failed'),
  REPLICA_FAILED: MOVE_REASON.REPLICA_FAILED,
  POLICY_CHANGED: stryMutAct_9fa48("137869") ? "" : (stryCov_9fa48("137869"), 'policy_changed'),
  SPLIT_COMPLETED: stryMutAct_9fa48("137870") ? "" : (stryCov_9fa48("137870"), 'split_completed')
}));
const PLACEMENT_DEGRADED_REASON = Object.freeze(stryMutAct_9fa48("137871") ? {} : (stryCov_9fa48("137871"), {
  INSUFFICIENT_NODES: stryMutAct_9fa48("137872") ? "" : (stryCov_9fa48("137872"), 'insufficient_nodes'),
  INSUFFICIENT_CAPACITY: stryMutAct_9fa48("137873") ? "" : (stryCov_9fa48("137873"), 'insufficient_capacity')
}));
const REBALANCER_SKIP_REASON = Object.freeze(stryMutAct_9fa48("137874") ? {} : (stryCov_9fa48("137874"), {
  BUDGET_EXCEEDED: stryMutAct_9fa48("137875") ? "" : (stryCov_9fa48("137875"), 'budget_exceeded'),
  BUDGET_QUERY_FAILED: stryMutAct_9fa48("137876") ? "" : (stryCov_9fa48("137876"), 'budget_query_failed'),
  CONFLICTING_OPERATION_IN_FLIGHT: stryMutAct_9fa48("137877") ? "" : (stryCov_9fa48("137877"), 'conflicting_operation_in_flight'),
  MEMBERSHIP_EPOCH_CHANGED: stryMutAct_9fa48("137878") ? "" : (stryCov_9fa48("137878"), 'membership_epoch_changed'),
  NOT_LEADER: stryMutAct_9fa48("137879") ? "" : (stryCov_9fa48("137879"), 'not_leader'),
  STABILIZING: stryMutAct_9fa48("137880") ? "" : (stryCov_9fa48("137880"), 'stabilizing'),
  NO_NODES: stryMutAct_9fa48("137881") ? "" : (stryCov_9fa48("137881"), 'no_nodes'),
  CACHE_UNAVAILABLE: stryMutAct_9fa48("137882") ? "" : (stryCov_9fa48("137882"), 'cache_unavailable'),
  START_DELAY: stryMutAct_9fa48("137883") ? "" : (stryCov_9fa48("137883"), 'start_delay'),
  SAFETY_BLOCKED: stryMutAct_9fa48("137884") ? "" : (stryCov_9fa48("137884"), 'safety_blocked'),
  LOCAL_MUTATION_UNHEALTHY: stryMutAct_9fa48("137885") ? "" : (stryCov_9fa48("137885"), 'local_mutation_unhealthy'),
  OPERATION_ALREADY_EXECUTING: stryMutAct_9fa48("137886") ? "" : (stryCov_9fa48("137886"), 'operation_already_executing'),
  OPERATION_OWNED_BY_ANOTHER_NODE: stryMutAct_9fa48("137887") ? "" : (stryCov_9fa48("137887"), 'operation_owned_by_another_node'),
  DEFERRED_RETRY_PENDING: stryMutAct_9fa48("137888") ? "" : (stryCov_9fa48("137888"), 'deferred_retry_pending'),
  AWAITING_READY_ADD_CAPACITY: stryMutAct_9fa48("137889") ? "" : (stryCov_9fa48("137889"), 'awaiting_ready_add_capacity'),
  NODE_NOT_READY: stryMutAct_9fa48("137890") ? "" : (stryCov_9fa48("137890"), 'node_not_ready')
}));

/**
 * Granular readiness skip reasons that map policy rejection
 * dimensions to stable rebalancer diagnostic codes.
 * Used alongside REBALANCER_SKIP_REASON.NODE_NOT_READY to
 * preserve reason granularity (Requirement 5.3, Design D6.3).
 * @enum {string}
 */
const READINESS_SKIP_DETAIL = Object.freeze(stryMutAct_9fa48("137891") ? {} : (stryCov_9fa48("137891"), {
  LEASE_EXPIRED: stryMutAct_9fa48("137892") ? "" : (stryCov_9fa48("137892"), 'lease'),
  STATUS_NOT_ACTIVE: stryMutAct_9fa48("137893") ? "" : (stryCov_9fa48("137893"), 'status'),
  CONNECTION_DOWN: stryMutAct_9fa48("137894") ? "" : (stryCov_9fa48("137894"), 'connection'),
  OUTBOUND_QUEUE_UNAVAILABLE: stryMutAct_9fa48("137895") ? "" : (stryCov_9fa48("137895"), 'outbound_queue'),
  PING_FAILED: stryMutAct_9fa48("137896") ? "" : (stryCov_9fa48("137896"), 'ping'),
  REPAIR_INELIGIBLE: stryMutAct_9fa48("137897") ? "" : (stryCov_9fa48("137897"), 'repair_ineligible')
}));
const REBALANCER_QUEUE_NAME = Object.freeze(stryMutAct_9fa48("137898") ? {} : (stryCov_9fa48("137898"), {
  REBALANCE_CHECK: stryMutAct_9fa48("137899") ? "" : (stryCov_9fa48("137899"), 'rebalance-check-reconcile')
}));

/**
 * Canonical reason codes for rebalance operation step transitions.
 * Used as the `reason` field in durable workflow transition records.
 *
 * @enum {string}
 */
const OPERATION_TRANSITION_REASON = Object.freeze(stryMutAct_9fa48("137900") ? {} : (stryCov_9fa48("137900"), {
  DISPATCH_SENDING: stryMutAct_9fa48("137901") ? "" : (stryCov_9fa48("137901"), 'dispatch_sending'),
  DISPATCH_CREATING: stryMutAct_9fa48("137902") ? "" : (stryCov_9fa48("137902"), 'dispatch_creating'),
  DISPATCH_STOPPING: stryMutAct_9fa48("137903") ? "" : (stryCov_9fa48("137903"), 'dispatch_stopping'),
  DISPATCH_ALREADY_EXISTS: stryMutAct_9fa48("137904") ? "" : (stryCov_9fa48("137904"), 'dispatch_already_exists'),
  DISPATCH_COMPLETED: stryMutAct_9fa48("137905") ? "" : (stryCov_9fa48("137905"), 'dispatch_completed'),
  RECONCILE_ACTIVE: stryMutAct_9fa48("137906") ? "" : (stryCov_9fa48("137906"), 'reconcile_active'),
  RECONCILE_FAILED: stryMutAct_9fa48("137907") ? "" : (stryCov_9fa48("137907"), 'reconcile_failed'),
  EXECUTOR_OUTCOME: stryMutAct_9fa48("137908") ? "" : (stryCov_9fa48("137908"), 'executor_outcome'),
  OPERATION_COMPLETED: stryMutAct_9fa48("137909") ? "" : (stryCov_9fa48("137909"), 'operation_completed'),
  OPERATION_FAILED: stryMutAct_9fa48("137910") ? "" : (stryCov_9fa48("137910"), 'operation_failed'),
  OPERATION_TIMED_OUT: stryMutAct_9fa48("137911") ? "" : (stryCov_9fa48("137911"), 'operation_timed_out'),
  SAFETY_POLICY_BLOCKED: stryMutAct_9fa48("137912") ? "" : (stryCov_9fa48("137912"), 'safety_policy_blocked')
}));
export { MOVE_REASON, OPERATION_TRANSITION_REASON, PLACEMENT_DEGRADED_REASON, READINESS_SKIP_DETAIL, REBALANCER_SUBSYSTEM, REBALANCER_ENTITY_TYPE, REBALANCER_TRIGGER, REBALANCER_MOVE_TYPE, REBALANCER_NODE_STATUS, REBALANCER_CONFIG_KEY, REBALANCER_DEFAULT, REBALANCER_DEFAULT_POLICY, REBALANCER_EVENT, REBALANCER_LOG_MSG, REBALANCER_QUEUE_NAME, REBALANCER_SKIP_REASON, STABILIZATION_RESET_TRIGGER, REBALANCE_COORDINATOR_EVENT, REBALANCE_COORDINATOR_LOG_MSG, REBALANCE_COORDINATOR_DEFER_REASON, REBALANCE_COORDINATOR_ERROR_MSG, REBALANCER_ERROR_MSG, MOVE_PLANNER_ERROR_MSG };