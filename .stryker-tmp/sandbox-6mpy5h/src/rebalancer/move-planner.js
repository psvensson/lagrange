/**
 * Move Planner - Calculates replica placement and moves for rebalancing.
 *
 * This module provides move planning logic extracted from UnifiedRebalancer.
 * It calculates target replica state and the moves needed to reach that
 * state for partitions, message groups, and runtime services.
 *
 * Requirements: 1.3, 1.8, 5.1, 5.2, 5.3, 5.4, 5.5, 11.3
 *
 * @module rebalancer/move-planner
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
import { LoggingService } from '../logging/logging-service.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { getPartitionRowFromCache, isPriorityControlPlanePartition } from '../bootstrap/system-partition-classification.js';
import { NUM, WORKFLOW_STEP } from '../constants/index.js';
import { ADJUST_DIRECTION, ReplicaStatus } from './replica-status.js';
import { adjustToOddCount, getNextOddCount, getPreviousOddCount, isOddReplicaCount } from './odd-replica-count.js';
import { MOVE_REASON, PLACEMENT_DEGRADED_REASON, REBALANCER_ENTITY_TYPE, REBALANCER_LOG_MSG, REBALANCER_MOVE_TYPE, MOVE_PLANNER_ERROR_MSG, REBALANCER_SUBSYSTEM } from './rebalancer-constants.js';
import { ADMISSION_DECISION, MOVE_CRITICALITY, PRESSURE_BEHAVIOR_DECISION, STORAGE_CAPACITY_LOG_MSG } from './storage-capacity-constants.js';
const MOVE_PLANNER_LITERAL = Object.freeze(stryMutAct_9fa48("130098") ? {} : (stryCov_9fa48("130098"), {
  MOVEPLANNER_REQUIRES_ENTITYID: stryMutAct_9fa48("130099") ? "" : (stryCov_9fa48("130099"), "MovePlanner requires entityId"),
  MOVEPLANNER_REQUIRES_ENTITYTYPE: stryMutAct_9fa48("130100") ? "" : (stryCov_9fa48("130100"), "MovePlanner requires entityType"),
  MOVEPLANNER_REQUIRES_MOVESTATEPROVIDER: stryMutAct_9fa48("130101") ? "" : (stryCov_9fa48("130101"), "MovePlanner requires moveStateProvider"),
  FUNCTION: stryMutAct_9fa48("130102") ? "" : (stryCov_9fa48("130102"), "function"),
  STRING: stryMutAct_9fa48("130103") ? "" : (stryCov_9fa48("130103"), "string"),
  NODES_WITHOUT_LOCAL_REPLICA: stryMutAct_9fa48("130104") ? "" : (stryCov_9fa48("130104"), "nodes_without_local_replica: "),
  EMPTY: stryMutAct_9fa48("130105") ? "" : (stryCov_9fa48("130105"), ", "),
  CONTROL_PLANE_REPLICAS_NOT_SPREAD: stryMutAct_9fa48("130106") ? "" : (stryCov_9fa48("130106"), "control_plane_replicas_not_spread: "),
  UNKNOWN: stryMutAct_9fa48("130107") ? "" : (stryCov_9fa48("130107"), "unknown")
}));
const EntityType = REBALANCER_ENTITY_TYPE;
const MoveType = REBALANCER_MOVE_TYPE;
const DegradedReason = PLACEMENT_DEGRADED_REASON;
const PLACEMENT_OCCUPIED_STATUSES = new Set(stryMutAct_9fa48("130108") ? [] : (stryCov_9fa48("130108"), [ReplicaStatus.PENDING, ReplicaStatus.CREATING, ReplicaStatus.SYNCING, ReplicaStatus.ACTIVE]));
const MOVE_PLANNER_TOPOLOGY_SCORE = Object.freeze(stryMutAct_9fa48("130109") ? {} : (stryCov_9fa48("130109"), {
  SAME_GROUP_BONUS: 5,
  SAME_GROUP_PENALTY: 2,
  DIVERSITY_NEW_GROUP_BONUS: 4,
  DIVERSITY_EXISTING_GROUP_PENALTY: 4
}));
const CAPACITY_REJECTION_REASON = Object.freeze(stryMutAct_9fa48("130110") ? {} : (stryCov_9fa48("130110"), {
  ADMISSION_ERROR: stryMutAct_9fa48("130111") ? "" : (stryCov_9fa48("130111"), 'admission_error')
}));
const MOVE_PLANNER_REBALANCE_REASON = Object.freeze(stryMutAct_9fa48("130112") ? {} : (stryCov_9fa48("130112"), {
  REPLICA_COUNT_BELOW_TARGET: stryMutAct_9fa48("130113") ? "" : (stryCov_9fa48("130113"), 'replica_count_below_target'),
  REPLICA_COUNT_ABOVE_TARGET: stryMutAct_9fa48("130114") ? "" : (stryCov_9fa48("130114"), 'replica_count_above_target'),
  REPLICAS_NOT_SPREAD: stryMutAct_9fa48("130115") ? "" : (stryCov_9fa48("130115"), 'replicas_not_spread'),
  NODES_WITHOUT_LOCAL_REPLICA: stryMutAct_9fa48("130116") ? "" : (stryCov_9fa48("130116"), 'nodes_without_local_replica')
}));
const MESSAGE_GROUP_PLACEMENT_DEFAULT_MAX_REPLICA_COUNT = NUM.FIVE;
function buildReplicaCountPolicyDecision(options = {}) {
  if (stryMutAct_9fa48("130117")) {
    {}
  } else {
    stryCov_9fa48("130117");
    const healthyReplicaCount = stryMutAct_9fa48("130120") ? Number(options.healthyReplicaCount) && NUM.ZERO : stryMutAct_9fa48("130119") ? false : stryMutAct_9fa48("130118") ? true : (stryCov_9fa48("130118", "130119", "130120"), Number(options.healthyReplicaCount) || NUM.ZERO);
    const actionableTarget = stryMutAct_9fa48("130123") ? Number(options.actionableTarget) && NUM.ZERO : stryMutAct_9fa48("130122") ? false : stryMutAct_9fa48("130121") ? true : (stryCov_9fa48("130121", "130122", "130123"), Number(options.actionableTarget) || NUM.ZERO);
    const targetCount = stryMutAct_9fa48("130126") ? Number(options.targetCount) && NUM.ZERO : stryMutAct_9fa48("130125") ? false : stryMutAct_9fa48("130124") ? true : (stryCov_9fa48("130124", "130125", "130126"), Number(options.targetCount) || NUM.ZERO);
    let needsRebalancing = stryMutAct_9fa48("130127") ? true : (stryCov_9fa48("130127"), false);
    let reason = null;
    if (stryMutAct_9fa48("130131") ? healthyReplicaCount >= actionableTarget : stryMutAct_9fa48("130130") ? healthyReplicaCount <= actionableTarget : stryMutAct_9fa48("130129") ? false : stryMutAct_9fa48("130128") ? true : (stryCov_9fa48("130128", "130129", "130130", "130131"), healthyReplicaCount < actionableTarget)) {
      if (stryMutAct_9fa48("130132")) {
        {}
      } else {
        stryCov_9fa48("130132");
        needsRebalancing = stryMutAct_9fa48("130133") ? false : (stryCov_9fa48("130133"), true);
        reason = MOVE_PLANNER_REBALANCE_REASON.REPLICA_COUNT_BELOW_TARGET;
      }
    } else if (stryMutAct_9fa48("130137") ? healthyReplicaCount <= targetCount : stryMutAct_9fa48("130136") ? healthyReplicaCount >= targetCount : stryMutAct_9fa48("130135") ? false : stryMutAct_9fa48("130134") ? true : (stryCov_9fa48("130134", "130135", "130136", "130137"), healthyReplicaCount > targetCount)) {
      if (stryMutAct_9fa48("130138")) {
        {}
      } else {
        stryCov_9fa48("130138");
        needsRebalancing = stryMutAct_9fa48("130139") ? false : (stryCov_9fa48("130139"), true);
        reason = MOVE_PLANNER_REBALANCE_REASON.REPLICA_COUNT_ABOVE_TARGET;
      }
    }
    return stryMutAct_9fa48("130140") ? {} : (stryCov_9fa48("130140"), {
      needsRebalancing,
      reason
    });
  }
}
function applyAdditionalRebalancingReason(decision, shouldRebalance, reason) {
  if (stryMutAct_9fa48("130141")) {
    {}
  } else {
    stryCov_9fa48("130141");
    if (stryMutAct_9fa48("130144") ? false : stryMutAct_9fa48("130143") ? true : stryMutAct_9fa48("130142") ? shouldRebalance : (stryCov_9fa48("130142", "130143", "130144"), !shouldRebalance)) {
      if (stryMutAct_9fa48("130145")) {
        {}
      } else {
        stryCov_9fa48("130145");
        return decision;
      }
    }
    return stryMutAct_9fa48("130146") ? {} : (stryCov_9fa48("130146"), {
      ...decision,
      needsRebalancing: stryMutAct_9fa48("130147") ? false : (stryCov_9fa48("130147"), true),
      reason: stryMutAct_9fa48("130150") ? decision.reason && reason : stryMutAct_9fa48("130149") ? false : stryMutAct_9fa48("130148") ? true : (stryCov_9fa48("130148", "130149", "130150"), decision.reason || reason)
    });
  }
}
function buildMessageGroupPlacementResult(options = {}) {
  if (stryMutAct_9fa48("130151")) {
    {}
  } else {
    stryCov_9fa48("130151");
    const targetReplicaCount = stryMutAct_9fa48("130154") ? Number(options.targetReplicaCount) && NUM.ZERO : stryMutAct_9fa48("130153") ? false : stryMutAct_9fa48("130152") ? true : (stryCov_9fa48("130152", "130153", "130154"), Number(options.targetReplicaCount) || NUM.ZERO);
    const targetNodes = Array.isArray(options.targetNodes) ? options.targetNodes : stryMutAct_9fa48("130155") ? ["Stryker was here"] : (stryCov_9fa48("130155"), []);
    return stryMutAct_9fa48("130156") ? {} : (stryCov_9fa48("130156"), {
      targetReplicaCount,
      targetNodes,
      maxReplicaCount: stryMutAct_9fa48("130159") ? options.maxReplicaCount && MESSAGE_GROUP_PLACEMENT_DEFAULT_MAX_REPLICA_COUNT : stryMutAct_9fa48("130158") ? false : stryMutAct_9fa48("130157") ? true : (stryCov_9fa48("130157", "130158", "130159"), options.maxReplicaCount || MESSAGE_GROUP_PLACEMENT_DEFAULT_MAX_REPLICA_COUNT),
      degraded: stryMutAct_9fa48("130163") ? targetNodes.length >= targetReplicaCount : stryMutAct_9fa48("130162") ? targetNodes.length <= targetReplicaCount : stryMutAct_9fa48("130161") ? false : stryMutAct_9fa48("130160") ? true : (stryCov_9fa48("130160", "130161", "130162", "130163"), targetNodes.length < targetReplicaCount),
      degradedReason: options.degradedReason,
      availableNodeCount: stryMutAct_9fa48("130166") ? Number(options.availableNodeCount) && NUM.ZERO : stryMutAct_9fa48("130165") ? false : stryMutAct_9fa48("130164") ? true : (stryCov_9fa48("130164", "130165", "130166"), Number(options.availableNodeCount) || NUM.ZERO),
      capacityDiagnostics: options.capacityDiagnostics
    });
  }
}

/**
 * MovePlanner calculates replica placement and moves for partitions,
 * message groups, and runtime services.
 *
 * This class is responsible for:
 * - Calculating target replica state based on policy
 * - Filtering infeasible nodes by storage capacity before scoring
 * - Determining optimal node placement for replicas
 * - Calculating the moves needed to reach target state
 * - Sorting nodes by load and suitability
 *
 * Requirements: 1.3, 1.8, 5.1, 5.2, 5.3, 5.4, 5.5, 11.3
 *
 * @constructor
 * @param {Object} options - Configuration options
 * @param {string} options.entityId - Entity ID (partition, message
 *   group, or service definition ID)
 * @param {string} options.entityType - 'partition', 'message_group',
 *   or 'runtime_service'
 * @param {Object} options.moveStateProvider - Provider for state access
 * @param {Object} [options.storageAdmissionService] - Admission gate
 * @param {Object} [options.accountingService] - Capacity accounting
 * @param {Object} [options.storagePressureBehavior] - Pressure behavior
 */
class MovePlanner {
  /**
   * Create a new MovePlanner instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.entityId - Entity ID (partition, message
   *   group, or service definition ID).
   * @param {string} options.entityType - 'partition', 'message_group',
   *   or 'runtime_service'.
   * @param {Object} options.moveStateProvider - Provider for state access.
   * @param {Object} [options.storageAdmissionService] - Admission gate.
   * @param {Object} [options.accountingService] - Capacity accounting.
   * @param {Object} [options.storagePressureBehavior] - Pressure behavior.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("130167")) {
      {}
    } else {
      stryCov_9fa48("130167");
      if (stryMutAct_9fa48("130170") ? false : stryMutAct_9fa48("130169") ? true : stryMutAct_9fa48("130168") ? options.entityId : (stryCov_9fa48("130168", "130169", "130170"), !options.entityId)) {
        if (stryMutAct_9fa48("130171")) {
          {}
        } else {
          stryCov_9fa48("130171");
          throw new Error(MOVE_PLANNER_LITERAL.MOVEPLANNER_REQUIRES_ENTITYID);
        }
      }
      if (stryMutAct_9fa48("130174") ? false : stryMutAct_9fa48("130173") ? true : stryMutAct_9fa48("130172") ? options.entityType : (stryCov_9fa48("130172", "130173", "130174"), !options.entityType)) {
        if (stryMutAct_9fa48("130175")) {
          {}
        } else {
          stryCov_9fa48("130175");
          throw new Error(MOVE_PLANNER_LITERAL.MOVEPLANNER_REQUIRES_ENTITYTYPE);
        }
      }
      if (stryMutAct_9fa48("130178") ? false : stryMutAct_9fa48("130177") ? true : stryMutAct_9fa48("130176") ? options.moveStateProvider : (stryCov_9fa48("130176", "130177", "130178"), !options.moveStateProvider)) {
        if (stryMutAct_9fa48("130179")) {
          {}
        } else {
          stryCov_9fa48("130179");
          throw new Error(MOVE_PLANNER_LITERAL.MOVEPLANNER_REQUIRES_MOVESTATEPROVIDER);
        }
      }
      this.entityId = options.entityId;
      this.entityType = options.entityType;
      this.moveStateProvider = options.moveStateProvider;
      this.storageAdmissionService = stryMutAct_9fa48("130182") ? options.storageAdmissionService && null : stryMutAct_9fa48("130181") ? false : stryMutAct_9fa48("130180") ? true : (stryCov_9fa48("130180", "130181", "130182"), options.storageAdmissionService || null);
      this.accountingService = stryMutAct_9fa48("130185") ? options.accountingService && null : stryMutAct_9fa48("130184") ? false : stryMutAct_9fa48("130183") ? true : (stryCov_9fa48("130183", "130184", "130185"), options.accountingService || null);
      this.storagePressureBehavior = stryMutAct_9fa48("130188") ? options.storagePressureBehavior && null : stryMutAct_9fa48("130187") ? false : stryMutAct_9fa48("130186") ? true : (stryCov_9fa48("130186", "130187", "130188"), options.storagePressureBehavior || null);
      this.strictOwnerDependencies = stryMutAct_9fa48("130191") ? options.strictOwnerDependencies !== true : stryMutAct_9fa48("130190") ? false : stryMutAct_9fa48("130189") ? true : (stryCov_9fa48("130189", "130190", "130191"), options.strictOwnerDependencies === (stryMutAct_9fa48("130192") ? false : (stryCov_9fa48("130192"), true)));

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(REBALANCER_SUBSYSTEM.UNIFIED) : console;
    }
  }

  /**
   * Calculate target state based on policy.
   * Applies capacity feasibility filter before scoring when admission
   * service is available.
   *
   * Routes entity types to the appropriate placement strategy:
   * - MESSAGE_GROUP with ensureLocalAccess: message-group placement
   * - PARTITION: partition placement (spread by suitability)
   * - RUNTIME_SERVICE: partition placement (cluster-global target)
   *
   * @param {Array<Object>} currentReplicas - Current replica state.
   * @param {Object} policy - Applicable policy.
   * @return {Promise<Object>} Target state with replica count and
   *   placement.
   */
  async calculateTargetState(currentReplicas, policy) {
    if (stryMutAct_9fa48("130193")) {
      {}
    } else {
      stryCov_9fa48("130193");
      const nodes = this.moveStateProvider.getAvailableNodes();
      const targetReplicaCount = stryMutAct_9fa48("130196") ? (policy.targetReplicaCount || policy.replicaCount) && NUM.THREE : stryMutAct_9fa48("130195") ? false : stryMutAct_9fa48("130194") ? true : (stryCov_9fa48("130194", "130195", "130196"), (stryMutAct_9fa48("130198") ? policy.targetReplicaCount && policy.replicaCount : stryMutAct_9fa48("130197") ? false : (stryCov_9fa48("130197", "130198"), policy.targetReplicaCount || policy.replicaCount)) || NUM.THREE);
      const estimatedBytes = this.getEstimatedBytesForEntity();
      const {
        feasibleNodes,
        diagnostics
      } = await this.filterNodesByCapacity(nodes, estimatedBytes);

      // For message groups: ensure every node has local access
      if (stryMutAct_9fa48("130201") ? this.entityType === EntityType.MESSAGE_GROUP || policy.ensureLocalAccess : stryMutAct_9fa48("130200") ? false : stryMutAct_9fa48("130199") ? true : (stryCov_9fa48("130199", "130200", "130201"), (stryMutAct_9fa48("130203") ? this.entityType !== EntityType.MESSAGE_GROUP : stryMutAct_9fa48("130202") ? true : (stryCov_9fa48("130202", "130203"), this.entityType === EntityType.MESSAGE_GROUP)) && policy.ensureLocalAccess)) {
        if (stryMutAct_9fa48("130204")) {
          {}
        } else {
          stryCov_9fa48("130204");
          return this.calculateMessageGroupPlacement(feasibleNodes, targetReplicaCount, policy, diagnostics);
        }
      }

      // For partitions and runtime services: spread across nodes by
      // policy with cluster-global replica count target.
      return this.calculatePartitionPlacement(feasibleNodes, targetReplicaCount, policy, diagnostics);
    }
  }

  /**
   * Validate and adjust replica count to an entity-safe target.
   * Raft-backed entities require odd replica counts; runtime services do not.
   * @param {number} count
   * @param {Object} policy
   * @return {number}
   */
  validateReplicaCount(count, policy) {
    if (stryMutAct_9fa48("130205")) {
      {}
    } else {
      stryCov_9fa48("130205");
      const defaultMin = (stryMutAct_9fa48("130208") ? this.entityType !== EntityType.RUNTIME_SERVICE : stryMutAct_9fa48("130207") ? false : stryMutAct_9fa48("130206") ? true : (stryCov_9fa48("130206", "130207", "130208"), this.entityType === EntityType.RUNTIME_SERVICE)) ? NUM.ONE : NUM.THREE;
      const defaultMax = (stryMutAct_9fa48("130211") ? this.entityType !== EntityType.RUNTIME_SERVICE : stryMutAct_9fa48("130210") ? false : stryMutAct_9fa48("130209") ? true : (stryCov_9fa48("130209", "130210", "130211"), this.entityType === EntityType.RUNTIME_SERVICE)) ? stryMutAct_9fa48("130212") ? Math.min(defaultMin, count || defaultMin) : (stryCov_9fa48("130212"), Math.max(defaultMin, stryMutAct_9fa48("130215") ? count && defaultMin : stryMutAct_9fa48("130214") ? false : stryMutAct_9fa48("130213") ? true : (stryCov_9fa48("130213", "130214", "130215"), count || defaultMin))) : NUM.SEVEN;
      const min = stryMutAct_9fa48("130218") ? policy.minReplicaCount && defaultMin : stryMutAct_9fa48("130217") ? false : stryMutAct_9fa48("130216") ? true : (stryCov_9fa48("130216", "130217", "130218"), policy.minReplicaCount || defaultMin);
      const max = stryMutAct_9fa48("130221") ? policy.maxReplicaCount && defaultMax : stryMutAct_9fa48("130220") ? false : stryMutAct_9fa48("130219") ? true : (stryCov_9fa48("130219", "130220", "130221"), policy.maxReplicaCount || defaultMax);
      let adjusted = stryMutAct_9fa48("130222") ? Math.min(min, Math.min(max, count)) : (stryCov_9fa48("130222"), Math.max(min, stryMutAct_9fa48("130223") ? Math.max(max, count) : (stryCov_9fa48("130223"), Math.min(max, count))));
      if (stryMutAct_9fa48("130226") ? this.entityType !== EntityType.RUNTIME_SERVICE : stryMutAct_9fa48("130225") ? false : stryMutAct_9fa48("130224") ? true : (stryCov_9fa48("130224", "130225", "130226"), this.entityType === EntityType.RUNTIME_SERVICE)) {
        if (stryMutAct_9fa48("130227")) {
          {}
        } else {
          stryCov_9fa48("130227");
          return adjusted;
        }
      }
      if (stryMutAct_9fa48("130230") ? false : stryMutAct_9fa48("130229") ? true : stryMutAct_9fa48("130228") ? isOddReplicaCount(adjusted) : (stryCov_9fa48("130228", "130229", "130230"), !isOddReplicaCount(adjusted))) {
        if (stryMutAct_9fa48("130231")) {
          {}
        } else {
          stryCov_9fa48("130231");
          adjusted = adjustToOddCount(adjusted, ADJUST_DIRECTION.UP);
          if (stryMutAct_9fa48("130235") ? adjusted <= max : stryMutAct_9fa48("130234") ? adjusted >= max : stryMutAct_9fa48("130233") ? false : stryMutAct_9fa48("130232") ? true : (stryCov_9fa48("130232", "130233", "130234", "130235"), adjusted > max)) {
            if (stryMutAct_9fa48("130236")) {
              {}
            } else {
              stryCov_9fa48("130236");
              adjusted = adjustToOddCount(count, ADJUST_DIRECTION.DOWN);
            }
          }
        }
      }
      return adjusted;
    }
  }

  /**
   * Get desired replica target from policy.
   * @param {Object} policy
   * @return {number}
   */
  getPolicyTargetReplicaCount(policy) {
    if (stryMutAct_9fa48("130237")) {
      {}
    } else {
      stryCov_9fa48("130237");
      const defaultTarget = (stryMutAct_9fa48("130240") ? this.entityType !== EntityType.RUNTIME_SERVICE : stryMutAct_9fa48("130239") ? false : stryMutAct_9fa48("130238") ? true : (stryCov_9fa48("130238", "130239", "130240"), this.entityType === EntityType.RUNTIME_SERVICE)) ? NUM.ONE : NUM.THREE;
      return stryMutAct_9fa48("130243") ? (policy.targetReplicaCount || policy.replicaCount) && defaultTarget : stryMutAct_9fa48("130242") ? false : stryMutAct_9fa48("130241") ? true : (stryCov_9fa48("130241", "130242", "130243"), (stryMutAct_9fa48("130245") ? policy.targetReplicaCount && policy.replicaCount : stryMutAct_9fa48("130244") ? false : (stryCov_9fa48("130244", "130245"), policy.targetReplicaCount || policy.replicaCount)) || defaultTarget);
    }
  }

  /**
   * Get actionable target based on currently available ready nodes.
   * @param {Object} policy
   * @param {Array<Object>} availableNodes
   * @return {number}
   */
  getActionableTargetReplicaCount(policy, availableNodes) {
    if (stryMutAct_9fa48("130246")) {
      {}
    } else {
      stryCov_9fa48("130246");
      const desiredTarget = this.getPolicyTargetReplicaCount(policy);
      const availableCount = Array.isArray(availableNodes) ? availableNodes.length : NUM.ZERO;
      return stryMutAct_9fa48("130247") ? Math.max(desiredTarget, availableCount) : (stryCov_9fa48("130247"), Math.min(desiredTarget, availableCount));
    }
  }

  /**
   * Calculate target replica count based on policy and current state.
   * @param {Array<Object>} currentReplicas
   * @param {Object} policy
   * @return {number}
   */
  calculateTargetReplicaCount(currentReplicas, policy) {
    if (stryMutAct_9fa48("130248")) {
      {}
    } else {
      stryCov_9fa48("130248");
      const healthyCount = this.getHealthyReplicas(currentReplicas).length;
      const targetCount = this.getPolicyTargetReplicaCount(policy);
      const minCount = stryMutAct_9fa48("130251") ? policy.minReplicaCount && NUM.THREE : stryMutAct_9fa48("130250") ? false : stryMutAct_9fa48("130249") ? true : (stryCov_9fa48("130249", "130250", "130251"), policy.minReplicaCount || NUM.THREE);
      const maxCount = stryMutAct_9fa48("130254") ? policy.maxReplicaCount && NUM.SEVEN : stryMutAct_9fa48("130253") ? false : stryMutAct_9fa48("130252") ? true : (stryCov_9fa48("130252", "130253", "130254"), policy.maxReplicaCount || NUM.SEVEN);
      if (stryMutAct_9fa48("130257") ? this.entityType !== EntityType.RUNTIME_SERVICE : stryMutAct_9fa48("130256") ? false : stryMutAct_9fa48("130255") ? true : (stryCov_9fa48("130255", "130256", "130257"), this.entityType === EntityType.RUNTIME_SERVICE)) {
        if (stryMutAct_9fa48("130258")) {
          {}
        } else {
          stryCov_9fa48("130258");
          return this.validateReplicaCount(targetCount, policy);
        }
      }
      const validTarget = this.validateReplicaCount(targetCount, policy);
      if (stryMutAct_9fa48("130262") ? healthyCount >= minCount : stryMutAct_9fa48("130261") ? healthyCount <= minCount : stryMutAct_9fa48("130260") ? false : stryMutAct_9fa48("130259") ? true : (stryCov_9fa48("130259", "130260", "130261", "130262"), healthyCount < minCount)) {
        if (stryMutAct_9fa48("130263")) {
          {}
        } else {
          stryCov_9fa48("130263");
          return this.validateReplicaCount(minCount, policy);
        }
      }
      if (stryMutAct_9fa48("130267") ? healthyCount <= maxCount : stryMutAct_9fa48("130266") ? healthyCount >= maxCount : stryMutAct_9fa48("130265") ? false : stryMutAct_9fa48("130264") ? true : (stryCov_9fa48("130264", "130265", "130266", "130267"), healthyCount > maxCount)) {
        if (stryMutAct_9fa48("130268")) {
          {}
        } else {
          stryCov_9fa48("130268");
          return this.validateReplicaCount(maxCount, policy);
        }
      }
      if (stryMutAct_9fa48("130272") ? healthyCount >= validTarget : stryMutAct_9fa48("130271") ? healthyCount <= validTarget : stryMutAct_9fa48("130270") ? false : stryMutAct_9fa48("130269") ? true : (stryCov_9fa48("130269", "130270", "130271", "130272"), healthyCount < validTarget)) {
        if (stryMutAct_9fa48("130273")) {
          {}
        } else {
          stryCov_9fa48("130273");
          const nextCount = getNextOddCount(healthyCount, maxCount);
          return stryMutAct_9fa48("130274") ? Math.max(nextCount, validTarget) : (stryCov_9fa48("130274"), Math.min(nextCount, validTarget));
        }
      }
      if (stryMutAct_9fa48("130278") ? healthyCount <= validTarget : stryMutAct_9fa48("130277") ? healthyCount >= validTarget : stryMutAct_9fa48("130276") ? false : stryMutAct_9fa48("130275") ? true : (stryCov_9fa48("130275", "130276", "130277", "130278"), healthyCount > validTarget)) {
        if (stryMutAct_9fa48("130279")) {
          {}
        } else {
          stryCov_9fa48("130279");
          const prevCount = getPreviousOddCount(healthyCount, minCount);
          return stryMutAct_9fa48("130280") ? Math.min(prevCount, validTarget) : (stryCov_9fa48("130280"), Math.max(prevCount, validTarget));
        }
      }
      return validTarget;
    }
  }

  /**
   * Check if multiple replicas are on the same node.
   * @param {Array<Object>} replicas
   * @return {boolean}
   */
  hasMultipleReplicasOnSameNode(replicas) {
    if (stryMutAct_9fa48("130281")) {
      {}
    } else {
      stryCov_9fa48("130281");
      const nodeIds = stryMutAct_9fa48("130282") ? replicas.map(replica => replica.node_id) : (stryCov_9fa48("130282"), replicas.filter(stryMutAct_9fa48("130283") ? () => undefined : (stryCov_9fa48("130283"), replica => stryMutAct_9fa48("130286") ? replica || replica.node_id : stryMutAct_9fa48("130285") ? false : stryMutAct_9fa48("130284") ? true : (stryCov_9fa48("130284", "130285", "130286"), replica && replica.node_id))).map(stryMutAct_9fa48("130287") ? () => undefined : (stryCov_9fa48("130287"), replica => replica.node_id)));
      if (stryMutAct_9fa48("130290") ? nodeIds.length !== NUM.ZERO : stryMutAct_9fa48("130289") ? false : stryMutAct_9fa48("130288") ? true : (stryCov_9fa48("130288", "130289", "130290"), nodeIds.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("130291")) {
          {}
        } else {
          stryCov_9fa48("130291");
          return stryMutAct_9fa48("130292") ? true : (stryCov_9fa48("130292"), false);
        }
      }
      return stryMutAct_9fa48("130296") ? new Set(nodeIds).size >= nodeIds.length : stryMutAct_9fa48("130295") ? new Set(nodeIds).size <= nodeIds.length : stryMutAct_9fa48("130294") ? false : stryMutAct_9fa48("130293") ? true : (stryCov_9fa48("130293", "130294", "130295", "130296"), new Set(nodeIds).size < nodeIds.length);
    }
  }

  /**
   * Get nodes that do not have a local replica.
   * @param {Array<Object>} replicas
   * @return {Array<string>}
   */
  getNodesWithoutLocalReplica(replicas) {
    if (stryMutAct_9fa48("130297")) {
      {}
    } else {
      stryCov_9fa48("130297");
      const allNodes = this.moveStateProvider.getAvailableNodes();
      let localAccessReplicas = replicas;
      const cache = this.moveStateProvider.systemTableCache;
      if (stryMutAct_9fa48("130300") ? this.entityType === EntityType.MESSAGE_GROUP && cache || typeof cache.filter === MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("130299") ? false : stryMutAct_9fa48("130298") ? true : (stryCov_9fa48("130298", "130299", "130300"), (stryMutAct_9fa48("130302") ? this.entityType === EntityType.MESSAGE_GROUP || cache : stryMutAct_9fa48("130301") ? true : (stryCov_9fa48("130301", "130302"), (stryMutAct_9fa48("130304") ? this.entityType !== EntityType.MESSAGE_GROUP : stryMutAct_9fa48("130303") ? true : (stryCov_9fa48("130303", "130304"), this.entityType === EntityType.MESSAGE_GROUP)) && cache)) && (stryMutAct_9fa48("130306") ? typeof cache.filter !== MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("130305") ? true : (stryCov_9fa48("130305", "130306"), typeof cache.filter === MOVE_PLANNER_LITERAL.FUNCTION)))) {
        if (stryMutAct_9fa48("130307")) {
          {}
        } else {
          stryCov_9fa48("130307");
          localAccessReplicas = stryMutAct_9fa48("130308") ? cache : (stryCov_9fa48("130308"), cache.filter(SYSTEM_TABLE_NAME.SERVICES, service => {
            if (stryMutAct_9fa48("130309")) {
              {}
            } else {
              stryCov_9fa48("130309");
              return stryMutAct_9fa48("130312") ? service?.service_type === EntityType.MESSAGE_GROUP && service?.status === ReplicaStatus.ACTIVE && typeof service?.node_id === MOVE_PLANNER_LITERAL.STRING || service.node_id.length > NUM.ZERO : stryMutAct_9fa48("130311") ? false : stryMutAct_9fa48("130310") ? true : (stryCov_9fa48("130310", "130311", "130312"), (stryMutAct_9fa48("130314") ? service?.service_type === EntityType.MESSAGE_GROUP && service?.status === ReplicaStatus.ACTIVE || typeof service?.node_id === MOVE_PLANNER_LITERAL.STRING : stryMutAct_9fa48("130313") ? true : (stryCov_9fa48("130313", "130314"), (stryMutAct_9fa48("130316") ? service?.service_type === EntityType.MESSAGE_GROUP || service?.status === ReplicaStatus.ACTIVE : stryMutAct_9fa48("130315") ? true : (stryCov_9fa48("130315", "130316"), (stryMutAct_9fa48("130318") ? service?.service_type !== EntityType.MESSAGE_GROUP : stryMutAct_9fa48("130317") ? true : (stryCov_9fa48("130317", "130318"), (stryMutAct_9fa48("130319") ? service.service_type : (stryCov_9fa48("130319"), service?.service_type)) === EntityType.MESSAGE_GROUP)) && (stryMutAct_9fa48("130321") ? service?.status !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("130320") ? true : (stryCov_9fa48("130320", "130321"), (stryMutAct_9fa48("130322") ? service.status : (stryCov_9fa48("130322"), service?.status)) === ReplicaStatus.ACTIVE)))) && (stryMutAct_9fa48("130324") ? typeof service?.node_id !== MOVE_PLANNER_LITERAL.STRING : stryMutAct_9fa48("130323") ? true : (stryCov_9fa48("130323", "130324"), typeof (stryMutAct_9fa48("130325") ? service.node_id : (stryCov_9fa48("130325"), service?.node_id)) === MOVE_PLANNER_LITERAL.STRING)))) && (stryMutAct_9fa48("130328") ? service.node_id.length <= NUM.ZERO : stryMutAct_9fa48("130327") ? service.node_id.length >= NUM.ZERO : stryMutAct_9fa48("130326") ? true : (stryCov_9fa48("130326", "130327", "130328"), service.node_id.length > NUM.ZERO)));
            }
          }));
        }
      }
      const nodesWithReplicas = new Set(stryMutAct_9fa48("130329") ? localAccessReplicas.map(replica => replica.node_id) : (stryCov_9fa48("130329"), localAccessReplicas.filter(stryMutAct_9fa48("130330") ? () => undefined : (stryCov_9fa48("130330"), replica => stryMutAct_9fa48("130333") ? replica || replica.node_id : stryMutAct_9fa48("130332") ? false : stryMutAct_9fa48("130331") ? true : (stryCov_9fa48("130331", "130332", "130333"), replica && replica.node_id))).map(stryMutAct_9fa48("130334") ? () => undefined : (stryCov_9fa48("130334"), replica => replica.node_id))));
      return stryMutAct_9fa48("130335") ? allNodes.map(node => node?.node_id || null) : (stryCov_9fa48("130335"), allNodes.map(stryMutAct_9fa48("130336") ? () => undefined : (stryCov_9fa48("130336"), node => stryMutAct_9fa48("130339") ? node?.node_id && null : stryMutAct_9fa48("130338") ? false : stryMutAct_9fa48("130337") ? true : (stryCov_9fa48("130337", "130338", "130339"), (stryMutAct_9fa48("130340") ? node.node_id : (stryCov_9fa48("130340"), node?.node_id)) || null))).filter(stryMutAct_9fa48("130341") ? () => undefined : (stryCov_9fa48("130341"), nodeId => stryMutAct_9fa48("130344") ? nodeId || !nodesWithReplicas.has(nodeId) : stryMutAct_9fa48("130343") ? false : stryMutAct_9fa48("130342") ? true : (stryCov_9fa48("130342", "130343", "130344"), nodeId && (stryMutAct_9fa48("130345") ? nodesWithReplicas.has(nodeId) : (stryCov_9fa48("130345"), !nodesWithReplicas.has(nodeId)))))));
    }
  }

  /**
   * Check whether this planner owns one of the startup-critical control-plane
   * partitions that must fan out promptly after bootstrap.
   * @return {boolean}
   */
  isControlPlanePriorityPartition() {
    if (stryMutAct_9fa48("130346")) {
      {}
    } else {
      stryCov_9fa48("130346");
      if (stryMutAct_9fa48("130349") ? this.entityType === EntityType.PARTITION : stryMutAct_9fa48("130348") ? false : stryMutAct_9fa48("130347") ? true : (stryCov_9fa48("130347", "130348", "130349"), this.entityType !== EntityType.PARTITION)) {
        if (stryMutAct_9fa48("130350")) {
          {}
        } else {
          stryCov_9fa48("130350");
          return stryMutAct_9fa48("130351") ? true : (stryCov_9fa48("130351"), false);
        }
      }
      const systemTableCache = stryMutAct_9fa48("130354") ? this.moveStateProvider?.systemTableCache && null : stryMutAct_9fa48("130353") ? false : stryMutAct_9fa48("130352") ? true : (stryCov_9fa48("130352", "130353", "130354"), (stryMutAct_9fa48("130355") ? this.moveStateProvider.systemTableCache : (stryCov_9fa48("130355"), this.moveStateProvider?.systemTableCache)) || null);
      const partitionRow = getPartitionRowFromCache(systemTableCache, this.entityId);
      return isPriorityControlPlanePartition(stryMutAct_9fa48("130356") ? {} : (stryCov_9fa48("130356"), {
        partitionId: this.entityId,
        partitionRow
      }));
    }
  }

  /**
   * Resolve whether placement admission should run with critical-system
   * semantics for this entity.
   *
   * Critical-system classification is provider-owned. MovePlanner should not
   * keep a second local detector alive for the same semantic question.
   *
   * @return {boolean}
   * @private
   */
  isCriticalAdmissionEntity() {
    if (stryMutAct_9fa48("130357")) {
      {}
    } else {
      stryCov_9fa48("130357");
      if (stryMutAct_9fa48("130360") ? this.moveStateProvider || typeof this.moveStateProvider.isCriticalSystemPartition === MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("130359") ? false : stryMutAct_9fa48("130358") ? true : (stryCov_9fa48("130358", "130359", "130360"), this.moveStateProvider && (stryMutAct_9fa48("130362") ? typeof this.moveStateProvider.isCriticalSystemPartition !== MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("130361") ? true : (stryCov_9fa48("130361", "130362"), typeof this.moveStateProvider.isCriticalSystemPartition === MOVE_PLANNER_LITERAL.FUNCTION)))) {
        if (stryMutAct_9fa48("130363")) {
          {}
        } else {
          stryCov_9fa48("130363");
          return stryMutAct_9fa48("130366") ? this.moveStateProvider.isCriticalSystemPartition() !== true : stryMutAct_9fa48("130365") ? false : stryMutAct_9fa48("130364") ? true : (stryCov_9fa48("130364", "130365", "130366"), this.moveStateProvider.isCriticalSystemPartition() === (stryMutAct_9fa48("130367") ? false : (stryCov_9fa48("130367"), true)));
        }
      }
      return stryMutAct_9fa48("130368") ? true : (stryCov_9fa48("130368"), false);
    }
  }

  /**
   * Check whether healthy replicas are concentrated on too few nodes even
   * though ready nodes exist to spread them.
   * @param {Array<Object>} replicas
   * @param {Object} policy
   * @param {Array<Object>|null} [availableNodes]
   * @return {boolean}
   */
  hasSpreadableReplicaConcentration(replicas, policy, availableNodes = null) {
    if (stryMutAct_9fa48("130369")) {
      {}
    } else {
      stryCov_9fa48("130369");
      const prioritySpread = this.analyzePrioritySpread(replicas, policy, availableNodes);
      if (stryMutAct_9fa48("130372") ? prioritySpread.requiresSpread === true : stryMutAct_9fa48("130371") ? false : stryMutAct_9fa48("130370") ? true : (stryCov_9fa48("130370", "130371", "130372"), prioritySpread.requiresSpread !== (stryMutAct_9fa48("130373") ? false : (stryCov_9fa48("130373"), true)))) {
        if (stryMutAct_9fa48("130374")) {
          {}
        } else {
          stryCov_9fa48("130374");
          return stryMutAct_9fa48("130375") ? true : (stryCov_9fa48("130375"), false);
        }
      }
      return stryMutAct_9fa48("130378") ? prioritySpread.satisfied !== true || prioritySpread.hasUnusedReadyNodes === true : stryMutAct_9fa48("130377") ? false : stryMutAct_9fa48("130376") ? true : (stryCov_9fa48("130376", "130377", "130378"), (stryMutAct_9fa48("130380") ? prioritySpread.satisfied === true : stryMutAct_9fa48("130379") ? true : (stryCov_9fa48("130379", "130380"), prioritySpread.satisfied !== (stryMutAct_9fa48("130381") ? false : (stryCov_9fa48("130381"), true)))) && (stryMutAct_9fa48("130383") ? prioritySpread.hasUnusedReadyNodes !== true : stryMutAct_9fa48("130382") ? true : (stryCov_9fa48("130382", "130383"), prioritySpread.hasUnusedReadyNodes === (stryMutAct_9fa48("130384") ? false : (stryCov_9fa48("130384"), true)))));
    }
  }

  /**
   * Analyze the priority control-plane spread invariant for this entity.
   * @param {Array<Object>} replicas
   * @param {Object} policy
   * @param {Array<Object>|null} [availableNodes]
   * @return {Object}
   */
  analyzePrioritySpread(replicas, policy, availableNodes = null) {
    if (stryMutAct_9fa48("130385")) {
      {}
    } else {
      stryCov_9fa48("130385");
      const readyNodes = Array.isArray(availableNodes) ? availableNodes : this.moveStateProvider.getAvailableNodes();
      const healthyReplicas = this.getHealthyReplicas(replicas);
      const distinctNodeIds = new Set(stryMutAct_9fa48("130386") ? healthyReplicas.map(replica => replica.node_id) : (stryCov_9fa48("130386"), healthyReplicas.filter(stryMutAct_9fa48("130387") ? () => undefined : (stryCov_9fa48("130387"), replica => stryMutAct_9fa48("130390") ? replica || replica.node_id : stryMutAct_9fa48("130389") ? false : stryMutAct_9fa48("130388") ? true : (stryCov_9fa48("130388", "130389", "130390"), replica && replica.node_id))).map(stryMutAct_9fa48("130391") ? () => undefined : (stryCov_9fa48("130391"), replica => replica.node_id))));
      const requiresSpread = stryMutAct_9fa48("130394") ? this.isControlPlanePriorityPartition() || policy?.placementConstraints?.spreadAcrossNodes === true : stryMutAct_9fa48("130393") ? false : stryMutAct_9fa48("130392") ? true : (stryCov_9fa48("130392", "130393", "130394"), this.isControlPlanePriorityPartition() && (stryMutAct_9fa48("130396") ? policy?.placementConstraints?.spreadAcrossNodes !== true : stryMutAct_9fa48("130395") ? true : (stryCov_9fa48("130395", "130396"), (stryMutAct_9fa48("130398") ? policy.placementConstraints?.spreadAcrossNodes : stryMutAct_9fa48("130397") ? policy?.placementConstraints.spreadAcrossNodes : (stryCov_9fa48("130397", "130398"), policy?.placementConstraints?.spreadAcrossNodes)) === (stryMutAct_9fa48("130399") ? false : (stryCov_9fa48("130399"), true)))));
      const requiredDistinctNodeCount = requiresSpread ? stryMutAct_9fa48("130400") ? Math.max(NUM.THREE, readyNodes.length) : (stryCov_9fa48("130400"), Math.min(NUM.THREE, readyNodes.length)) : NUM.ZERO;
      const hasUnusedReadyNodes = stryMutAct_9fa48("130401") ? readyNodes.every(node => node && node.node_id && !distinctNodeIds.has(node.node_id)) : (stryCov_9fa48("130401"), readyNodes.some(stryMutAct_9fa48("130402") ? () => undefined : (stryCov_9fa48("130402"), node => stryMutAct_9fa48("130405") ? node && node.node_id || !distinctNodeIds.has(node.node_id) : stryMutAct_9fa48("130404") ? false : stryMutAct_9fa48("130403") ? true : (stryCov_9fa48("130403", "130404", "130405"), (stryMutAct_9fa48("130407") ? node || node.node_id : stryMutAct_9fa48("130406") ? true : (stryCov_9fa48("130406", "130407"), node && node.node_id)) && (stryMutAct_9fa48("130408") ? distinctNodeIds.has(node.node_id) : (stryCov_9fa48("130408"), !distinctNodeIds.has(node.node_id)))))));
      return stryMutAct_9fa48("130409") ? {} : (stryCov_9fa48("130409"), {
        isPriorityPartition: this.isControlPlanePriorityPartition(),
        requiresSpread,
        requiredDistinctNodeCount,
        actualDistinctNodeCount: distinctNodeIds.size,
        hasUnusedReadyNodes,
        satisfied: stryMutAct_9fa48("130412") ? (requiresSpread !== true || requiredDistinctNodeCount <= NUM.ONE) && distinctNodeIds.size >= requiredDistinctNodeCount : stryMutAct_9fa48("130411") ? false : stryMutAct_9fa48("130410") ? true : (stryCov_9fa48("130410", "130411", "130412"), (stryMutAct_9fa48("130414") ? requiresSpread !== true && requiredDistinctNodeCount <= NUM.ONE : stryMutAct_9fa48("130413") ? false : (stryCov_9fa48("130413", "130414"), (stryMutAct_9fa48("130416") ? requiresSpread === true : stryMutAct_9fa48("130415") ? false : (stryCov_9fa48("130415", "130416"), requiresSpread !== (stryMutAct_9fa48("130417") ? false : (stryCov_9fa48("130417"), true)))) || (stryMutAct_9fa48("130420") ? requiredDistinctNodeCount > NUM.ONE : stryMutAct_9fa48("130419") ? requiredDistinctNodeCount < NUM.ONE : stryMutAct_9fa48("130418") ? false : (stryCov_9fa48("130418", "130419", "130420"), requiredDistinctNodeCount <= NUM.ONE)))) || (stryMutAct_9fa48("130423") ? distinctNodeIds.size < requiredDistinctNodeCount : stryMutAct_9fa48("130422") ? distinctNodeIds.size > requiredDistinctNodeCount : stryMutAct_9fa48("130421") ? false : (stryCov_9fa48("130421", "130422", "130423"), distinctNodeIds.size >= requiredDistinctNodeCount)))
      });
    }
  }

  /**
   * Check if current state is critical.
   * @param {Array<Object>} replicas
   * @param {Object} policy
   * @param {Array<Object>|null} [availableNodes]
   * @return {boolean}
   */
  isCriticalState(replicas, policy, availableNodes = null) {
    if (stryMutAct_9fa48("130424")) {
      {}
    } else {
      stryCov_9fa48("130424");
      const healthyReplicas = this.getHealthyReplicas(replicas);
      const readyNodes = Array.isArray(availableNodes) ? availableNodes : this.moveStateProvider.getAvailableNodes();
      const minReplicas = stryMutAct_9fa48("130427") ? policy.minReplicaCount && NUM.THREE : stryMutAct_9fa48("130426") ? false : stryMutAct_9fa48("130425") ? true : (stryCov_9fa48("130425", "130426", "130427"), policy.minReplicaCount || NUM.THREE);
      if (stryMutAct_9fa48("130430") ? healthyReplicas.length < minReplicas || readyNodes.length >= minReplicas : stryMutAct_9fa48("130429") ? false : stryMutAct_9fa48("130428") ? true : (stryCov_9fa48("130428", "130429", "130430"), (stryMutAct_9fa48("130433") ? healthyReplicas.length >= minReplicas : stryMutAct_9fa48("130432") ? healthyReplicas.length <= minReplicas : stryMutAct_9fa48("130431") ? true : (stryCov_9fa48("130431", "130432", "130433"), healthyReplicas.length < minReplicas)) && (stryMutAct_9fa48("130436") ? readyNodes.length < minReplicas : stryMutAct_9fa48("130435") ? readyNodes.length > minReplicas : stryMutAct_9fa48("130434") ? true : (stryCov_9fa48("130434", "130435", "130436"), readyNodes.length >= minReplicas)))) {
        if (stryMutAct_9fa48("130437")) {
          {}
        } else {
          stryCov_9fa48("130437");
          return stryMutAct_9fa48("130438") ? false : (stryCov_9fa48("130438"), true);
        }
      }
      if (stryMutAct_9fa48("130441") ? this.entityType === EntityType.MESSAGE_GROUP || policy.ensureLocalAccess : stryMutAct_9fa48("130440") ? false : stryMutAct_9fa48("130439") ? true : (stryCov_9fa48("130439", "130440", "130441"), (stryMutAct_9fa48("130443") ? this.entityType !== EntityType.MESSAGE_GROUP : stryMutAct_9fa48("130442") ? true : (stryCov_9fa48("130442", "130443"), this.entityType === EntityType.MESSAGE_GROUP)) && policy.ensureLocalAccess)) {
        if (stryMutAct_9fa48("130444")) {
          {}
        } else {
          stryCov_9fa48("130444");
          return stryMutAct_9fa48("130448") ? this.getNodesWithoutLocalReplica(replicas).length <= NUM.ZERO : stryMutAct_9fa48("130447") ? this.getNodesWithoutLocalReplica(replicas).length >= NUM.ZERO : stryMutAct_9fa48("130446") ? false : stryMutAct_9fa48("130445") ? true : (stryCov_9fa48("130445", "130446", "130447", "130448"), this.getNodesWithoutLocalReplica(replicas).length > NUM.ZERO);
        }
      }
      if (stryMutAct_9fa48("130450") ? false : stryMutAct_9fa48("130449") ? true : (stryCov_9fa48("130449", "130450"), this.hasSpreadableReplicaConcentration(replicas, policy, readyNodes))) {
        if (stryMutAct_9fa48("130451")) {
          {}
        } else {
          stryCov_9fa48("130451");
          return stryMutAct_9fa48("130452") ? false : (stryCov_9fa48("130452"), true);
        }
      }
      return stryMutAct_9fa48("130453") ? true : (stryCov_9fa48("130453"), false);
    }
  }

  /**
   * Get the reason for critical state.
   * @param {Array<Object>} replicas
   * @param {Object} policy
   * @param {Array<Object>|null} [availableNodes]
   * @return {string}
   */
  getCriticalReason(replicas, policy, availableNodes = null) {
    if (stryMutAct_9fa48("130454")) {
      {}
    } else {
      stryCov_9fa48("130454");
      const healthyReplicas = this.getHealthyReplicas(replicas);
      const readyNodes = Array.isArray(availableNodes) ? availableNodes : this.moveStateProvider.getAvailableNodes();
      const minReplicas = stryMutAct_9fa48("130457") ? policy.minReplicaCount && NUM.THREE : stryMutAct_9fa48("130456") ? false : stryMutAct_9fa48("130455") ? true : (stryCov_9fa48("130455", "130456", "130457"), policy.minReplicaCount || NUM.THREE);
      if (stryMutAct_9fa48("130460") ? healthyReplicas.length < minReplicas || readyNodes.length >= minReplicas : stryMutAct_9fa48("130459") ? false : stryMutAct_9fa48("130458") ? true : (stryCov_9fa48("130458", "130459", "130460"), (stryMutAct_9fa48("130463") ? healthyReplicas.length >= minReplicas : stryMutAct_9fa48("130462") ? healthyReplicas.length <= minReplicas : stryMutAct_9fa48("130461") ? true : (stryCov_9fa48("130461", "130462", "130463"), healthyReplicas.length < minReplicas)) && (stryMutAct_9fa48("130466") ? readyNodes.length < minReplicas : stryMutAct_9fa48("130465") ? readyNodes.length > minReplicas : stryMutAct_9fa48("130464") ? true : (stryCov_9fa48("130464", "130465", "130466"), readyNodes.length >= minReplicas)))) {
        if (stryMutAct_9fa48("130467")) {
          {}
        } else {
          stryCov_9fa48("130467");
          return (stryMutAct_9fa48("130468") ? `` : (stryCov_9fa48("130468"), `replica_count_below_minimum: ${healthyReplicas.length} < `)) + (stryMutAct_9fa48("130469") ? `` : (stryCov_9fa48("130469"), `${minReplicas}`));
        }
      }
      if (stryMutAct_9fa48("130472") ? this.entityType === EntityType.MESSAGE_GROUP || policy.ensureLocalAccess : stryMutAct_9fa48("130471") ? false : stryMutAct_9fa48("130470") ? true : (stryCov_9fa48("130470", "130471", "130472"), (stryMutAct_9fa48("130474") ? this.entityType !== EntityType.MESSAGE_GROUP : stryMutAct_9fa48("130473") ? true : (stryCov_9fa48("130473", "130474"), this.entityType === EntityType.MESSAGE_GROUP)) && policy.ensureLocalAccess)) {
        if (stryMutAct_9fa48("130475")) {
          {}
        } else {
          stryCov_9fa48("130475");
          const nodesWithoutLocalReplica = this.getNodesWithoutLocalReplica(replicas);
          if (stryMutAct_9fa48("130479") ? nodesWithoutLocalReplica.length <= NUM.ZERO : stryMutAct_9fa48("130478") ? nodesWithoutLocalReplica.length >= NUM.ZERO : stryMutAct_9fa48("130477") ? false : stryMutAct_9fa48("130476") ? true : (stryCov_9fa48("130476", "130477", "130478", "130479"), nodesWithoutLocalReplica.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("130480")) {
              {}
            } else {
              stryCov_9fa48("130480");
              return stryMutAct_9fa48("130481") ? MOVE_PLANNER_LITERAL.NODES_WITHOUT_LOCAL_REPLICA - nodesWithoutLocalReplica.join(MOVE_PLANNER_LITERAL.EMPTY) : (stryCov_9fa48("130481"), MOVE_PLANNER_LITERAL.NODES_WITHOUT_LOCAL_REPLICA + nodesWithoutLocalReplica.join(MOVE_PLANNER_LITERAL.EMPTY));
            }
          }
        }
      }
      if (stryMutAct_9fa48("130483") ? false : stryMutAct_9fa48("130482") ? true : (stryCov_9fa48("130482", "130483"), this.hasSpreadableReplicaConcentration(replicas, policy, readyNodes))) {
        if (stryMutAct_9fa48("130484")) {
          {}
        } else {
          stryCov_9fa48("130484");
          const distinctNodeCount = new Set(stryMutAct_9fa48("130485") ? healthyReplicas.map(replica => replica.node_id) : (stryCov_9fa48("130485"), healthyReplicas.filter(stryMutAct_9fa48("130486") ? () => undefined : (stryCov_9fa48("130486"), replica => stryMutAct_9fa48("130489") ? replica || replica.node_id : stryMutAct_9fa48("130488") ? false : stryMutAct_9fa48("130487") ? true : (stryCov_9fa48("130487", "130488", "130489"), replica && replica.node_id))).map(stryMutAct_9fa48("130490") ? () => undefined : (stryCov_9fa48("130490"), replica => replica.node_id)))).size;
          return MOVE_PLANNER_LITERAL.CONTROL_PLANE_REPLICAS_NOT_SPREAD + (stryMutAct_9fa48("130491") ? `` : (stryCov_9fa48("130491"), `${distinctNodeCount}/${readyNodes.length}`));
        }
      }
      return MOVE_PLANNER_LITERAL.UNKNOWN;
    }
  }

  /**
   * Check if current state is suboptimal.
   * @param {Array<Object>} replicas
   * @param {Object} policy
   * @param {Array<Object>|null} [availableNodes]
   * @return {boolean}
   */
  isSuboptimalState(replicas, policy, availableNodes = null) {
    if (stryMutAct_9fa48("130492")) {
      {}
    } else {
      stryCov_9fa48("130492");
      const targetCount = this.getPolicyTargetReplicaCount(policy);
      const healthyReplicas = this.getHealthyReplicas(replicas);
      const readyNodes = Array.isArray(availableNodes) ? availableNodes : this.moveStateProvider.getAvailableNodes();
      const actionableTarget = this.getActionableTargetReplicaCount(policy, readyNodes);
      if (stryMutAct_9fa48("130495") ? healthyReplicas.length < actionableTarget && healthyReplicas.length > targetCount : stryMutAct_9fa48("130494") ? false : stryMutAct_9fa48("130493") ? true : (stryCov_9fa48("130493", "130494", "130495"), (stryMutAct_9fa48("130498") ? healthyReplicas.length >= actionableTarget : stryMutAct_9fa48("130497") ? healthyReplicas.length <= actionableTarget : stryMutAct_9fa48("130496") ? false : (stryCov_9fa48("130496", "130497", "130498"), healthyReplicas.length < actionableTarget)) || (stryMutAct_9fa48("130501") ? healthyReplicas.length <= targetCount : stryMutAct_9fa48("130500") ? healthyReplicas.length >= targetCount : stryMutAct_9fa48("130499") ? false : (stryCov_9fa48("130499", "130500", "130501"), healthyReplicas.length > targetCount)))) {
        if (stryMutAct_9fa48("130502")) {
          {}
        } else {
          stryCov_9fa48("130502");
          return stryMutAct_9fa48("130503") ? false : (stryCov_9fa48("130503"), true);
        }
      }
      if (stryMutAct_9fa48("130506") ? policy.placementConstraints?.spreadAcrossNodes || this.hasMultipleReplicasOnSameNode(healthyReplicas) : stryMutAct_9fa48("130505") ? false : stryMutAct_9fa48("130504") ? true : (stryCov_9fa48("130504", "130505", "130506"), (stryMutAct_9fa48("130507") ? policy.placementConstraints.spreadAcrossNodes : (stryCov_9fa48("130507"), policy.placementConstraints?.spreadAcrossNodes)) && this.hasMultipleReplicasOnSameNode(healthyReplicas))) {
        if (stryMutAct_9fa48("130508")) {
          {}
        } else {
          stryCov_9fa48("130508");
          const usedNodeIds = new Set(stryMutAct_9fa48("130509") ? healthyReplicas.map(replica => replica.node_id) : (stryCov_9fa48("130509"), healthyReplicas.filter(stryMutAct_9fa48("130510") ? () => undefined : (stryCov_9fa48("130510"), replica => stryMutAct_9fa48("130513") ? replica || replica.node_id : stryMutAct_9fa48("130512") ? false : stryMutAct_9fa48("130511") ? true : (stryCov_9fa48("130511", "130512", "130513"), replica && replica.node_id))).map(stryMutAct_9fa48("130514") ? () => undefined : (stryCov_9fa48("130514"), replica => replica.node_id))));
          const unusedNodes = stryMutAct_9fa48("130515") ? readyNodes : (stryCov_9fa48("130515"), readyNodes.filter(stryMutAct_9fa48("130516") ? () => undefined : (stryCov_9fa48("130516"), node => stryMutAct_9fa48("130519") ? node && node.node_id || !usedNodeIds.has(node.node_id) : stryMutAct_9fa48("130518") ? false : stryMutAct_9fa48("130517") ? true : (stryCov_9fa48("130517", "130518", "130519"), (stryMutAct_9fa48("130521") ? node || node.node_id : stryMutAct_9fa48("130520") ? true : (stryCov_9fa48("130520", "130521"), node && node.node_id)) && (stryMutAct_9fa48("130522") ? usedNodeIds.has(node.node_id) : (stryCov_9fa48("130522"), !usedNodeIds.has(node.node_id)))))));
          if (stryMutAct_9fa48("130526") ? unusedNodes.length <= NUM.ZERO : stryMutAct_9fa48("130525") ? unusedNodes.length >= NUM.ZERO : stryMutAct_9fa48("130524") ? false : stryMutAct_9fa48("130523") ? true : (stryCov_9fa48("130523", "130524", "130525", "130526"), unusedNodes.length > NUM.ZERO)) {
            if (stryMutAct_9fa48("130527")) {
              {}
            } else {
              stryCov_9fa48("130527");
              return stryMutAct_9fa48("130528") ? false : (stryCov_9fa48("130528"), true);
            }
          }
        }
      }
      return stryMutAct_9fa48("130529") ? true : (stryCov_9fa48("130529"), false);
    }
  }

  /**
   * Apply policy to determine if rebalancing is needed.
   * @param {Object} policy
   * @return {Object}
   */
  applyPolicy(policy) {
    if (stryMutAct_9fa48("130530")) {
      {}
    } else {
      stryCov_9fa48("130530");
      const currentReplicas = this.getCurrentReplicas();
      const healthyReplicas = this.getHealthyReplicas(currentReplicas);
      const availableNodes = this.moveStateProvider.getAvailableNodes();
      const actionableTarget = this.getActionableTargetReplicaCount(policy, availableNodes);
      const targetCount = this.calculateTargetReplicaCount(currentReplicas, policy);
      const replicaCountDecision = buildReplicaCountPolicyDecision(stryMutAct_9fa48("130531") ? {} : (stryCov_9fa48("130531"), {
        healthyReplicaCount: healthyReplicas.length,
        actionableTarget,
        targetCount
      }));
      const decision = stryMutAct_9fa48("130532") ? {} : (stryCov_9fa48("130532"), {
        ...replicaCountDecision,
        currentCount: healthyReplicas.length,
        targetCount,
        policy
      });
      const usedNodeIds = new Set(stryMutAct_9fa48("130533") ? healthyReplicas.map(replica => replica.node_id) : (stryCov_9fa48("130533"), healthyReplicas.filter(stryMutAct_9fa48("130534") ? () => undefined : (stryCov_9fa48("130534"), replica => stryMutAct_9fa48("130537") ? replica || replica.node_id : stryMutAct_9fa48("130536") ? false : stryMutAct_9fa48("130535") ? true : (stryCov_9fa48("130535", "130536", "130537"), replica && replica.node_id))).map(stryMutAct_9fa48("130538") ? () => undefined : (stryCov_9fa48("130538"), replica => replica.node_id))));
      const spreadAcrossNodesBlocked = stryMutAct_9fa48("130541") ? policy.placementConstraints?.spreadAcrossNodes || this.hasMultipleReplicasOnSameNode(healthyReplicas) : stryMutAct_9fa48("130540") ? false : stryMutAct_9fa48("130539") ? true : (stryCov_9fa48("130539", "130540", "130541"), (stryMutAct_9fa48("130542") ? policy.placementConstraints.spreadAcrossNodes : (stryCov_9fa48("130542"), policy.placementConstraints?.spreadAcrossNodes)) && this.hasMultipleReplicasOnSameNode(healthyReplicas));
      const unusedNodes = spreadAcrossNodesBlocked ? stryMutAct_9fa48("130543") ? availableNodes : (stryCov_9fa48("130543"), availableNodes.filter(stryMutAct_9fa48("130544") ? () => undefined : (stryCov_9fa48("130544"), node => stryMutAct_9fa48("130547") ? node && node.node_id || !usedNodeIds.has(node.node_id) : stryMutAct_9fa48("130546") ? false : stryMutAct_9fa48("130545") ? true : (stryCov_9fa48("130545", "130546", "130547"), (stryMutAct_9fa48("130549") ? node || node.node_id : stryMutAct_9fa48("130548") ? true : (stryCov_9fa48("130548", "130549"), node && node.node_id)) && (stryMutAct_9fa48("130550") ? usedNodeIds.has(node.node_id) : (stryCov_9fa48("130550"), !usedNodeIds.has(node.node_id))))))) : stryMutAct_9fa48("130551") ? ["Stryker was here"] : (stryCov_9fa48("130551"), []);
      const enforceLocalAccess = stryMutAct_9fa48("130554") ? this.entityType === EntityType.MESSAGE_GROUP || policy.ensureLocalAccess : stryMutAct_9fa48("130553") ? false : stryMutAct_9fa48("130552") ? true : (stryCov_9fa48("130552", "130553", "130554"), (stryMutAct_9fa48("130556") ? this.entityType !== EntityType.MESSAGE_GROUP : stryMutAct_9fa48("130555") ? true : (stryCov_9fa48("130555", "130556"), this.entityType === EntityType.MESSAGE_GROUP)) && policy.ensureLocalAccess);
      const nodesWithoutReplica = enforceLocalAccess ? this.getNodesWithoutLocalReplica(currentReplicas) : stryMutAct_9fa48("130557") ? ["Stryker was here"] : (stryCov_9fa48("130557"), []);
      decision = applyAdditionalRebalancingReason(decision, stryMutAct_9fa48("130561") ? unusedNodes.length <= NUM.ZERO : stryMutAct_9fa48("130560") ? unusedNodes.length >= NUM.ZERO : stryMutAct_9fa48("130559") ? false : stryMutAct_9fa48("130558") ? true : (stryCov_9fa48("130558", "130559", "130560", "130561"), unusedNodes.length > NUM.ZERO), MOVE_PLANNER_REBALANCE_REASON.REPLICAS_NOT_SPREAD);
      decision = applyAdditionalRebalancingReason(decision, stryMutAct_9fa48("130565") ? nodesWithoutReplica.length <= NUM.ZERO : stryMutAct_9fa48("130564") ? nodesWithoutReplica.length >= NUM.ZERO : stryMutAct_9fa48("130563") ? false : stryMutAct_9fa48("130562") ? true : (stryCov_9fa48("130562", "130563", "130564", "130565"), nodesWithoutReplica.length > NUM.ZERO), MOVE_PLANNER_REBALANCE_REASON.NODES_WITHOUT_LOCAL_REPLICA);
      return decision;
    }
  }

  /**
   * Assess the current state for logging and scheduling.
   * @param {Array<Object>} currentReplicas
   * @param {Object} policy
   * @param {Array<Object>|null} [availableNodes]
   * @return {Object}
   */
  assessState(currentReplicas, policy, availableNodes = null) {
    if (stryMutAct_9fa48("130566")) {
      {}
    } else {
      stryCov_9fa48("130566");
      const readyNodes = Array.isArray(availableNodes) ? availableNodes : this.moveStateProvider.getAvailableNodes();
      const healthyReplicas = this.getHealthyReplicas(currentReplicas);
      const desiredTarget = this.getPolicyTargetReplicaCount(policy);
      const actionableTarget = this.getActionableTargetReplicaCount(policy, readyNodes);
      const critical = this.isCriticalState(currentReplicas, policy, readyNodes);
      return stryMutAct_9fa48("130567") ? {} : (stryCov_9fa48("130567"), {
        healthyReplicas,
        desiredTarget,
        actionableTarget,
        critical,
        criticalReason: critical ? this.getCriticalReason(currentReplicas, policy, readyNodes) : null,
        suboptimal: stryMutAct_9fa48("130570") ? !critical || this.isSuboptimalState(currentReplicas, policy, readyNodes) : stryMutAct_9fa48("130569") ? false : stryMutAct_9fa48("130568") ? true : (stryCov_9fa48("130568", "130569", "130570"), (stryMutAct_9fa48("130571") ? critical : (stryCov_9fa48("130571"), !critical)) && this.isSuboptimalState(currentReplicas, policy, readyNodes))
      });
    }
  }

  /**
   * Read current replicas from the owner provider.
   * @return {Array<Object>}
   * @private
   */
  getCurrentReplicas() {
    if (stryMutAct_9fa48("130572")) {
      {}
    } else {
      stryCov_9fa48("130572");
      if (stryMutAct_9fa48("130575") ? typeof this.moveStateProvider.getCurrentReplicas === MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("130574") ? false : stryMutAct_9fa48("130573") ? true : (stryCov_9fa48("130573", "130574", "130575"), typeof this.moveStateProvider.getCurrentReplicas !== MOVE_PLANNER_LITERAL.FUNCTION)) {
        if (stryMutAct_9fa48("130576")) {
          {}
        } else {
          stryCov_9fa48("130576");
          return stryMutAct_9fa48("130577") ? ["Stryker was here"] : (stryCov_9fa48("130577"), []);
        }
      }
      return this.moveStateProvider.getCurrentReplicas();
    }
  }

  /**
   * Read healthy replicas through the owner provider.
   * @param {Array<Object>} replicas
   * @return {Array<Object>}
   * @private
   */
  getHealthyReplicas(replicas) {
    if (stryMutAct_9fa48("130578")) {
      {}
    } else {
      stryCov_9fa48("130578");
      if (stryMutAct_9fa48("130581") ? typeof this.moveStateProvider.getHealthyReplicas === MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("130580") ? false : stryMutAct_9fa48("130579") ? true : (stryCov_9fa48("130579", "130580", "130581"), typeof this.moveStateProvider.getHealthyReplicas !== MOVE_PLANNER_LITERAL.FUNCTION)) {
        if (stryMutAct_9fa48("130582")) {
          {}
        } else {
          stryCov_9fa48("130582");
          return Array.isArray(replicas) ? replicas : stryMutAct_9fa48("130583") ? ["Stryker was here"] : (stryCov_9fa48("130583"), []);
        }
      }
      return this.moveStateProvider.getHealthyReplicas(replicas);
    }
  }

  /**
   * Estimate bytes needed for a replica of this entity type.
   * Delegates to accountingService when available.
   * @return {number} estimated bytes or 0 when unavailable
   * @private
   */
  getEstimatedBytesForEntity() {
    if (stryMutAct_9fa48("130584")) {
      {}
    } else {
      stryCov_9fa48("130584");
      if (stryMutAct_9fa48("130587") ? !this.accountingService && typeof this.accountingService.estimateReplicaBytes !== MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("130586") ? false : stryMutAct_9fa48("130585") ? true : (stryCov_9fa48("130585", "130586", "130587"), (stryMutAct_9fa48("130588") ? this.accountingService : (stryCov_9fa48("130588"), !this.accountingService)) || (stryMutAct_9fa48("130590") ? typeof this.accountingService.estimateReplicaBytes === MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("130589") ? false : (stryCov_9fa48("130589", "130590"), typeof this.accountingService.estimateReplicaBytes !== MOVE_PLANNER_LITERAL.FUNCTION)))) {
        if (stryMutAct_9fa48("130591")) {
          {}
        } else {
          stryCov_9fa48("130591");
          if (stryMutAct_9fa48("130593") ? false : stryMutAct_9fa48("130592") ? true : (stryCov_9fa48("130592", "130593"), this.strictOwnerDependencies)) {
            if (stryMutAct_9fa48("130594")) {
              {}
            } else {
              stryCov_9fa48("130594");
              throw new Error((stryMutAct_9fa48("130595") ? this.accountingService : (stryCov_9fa48("130595"), !this.accountingService)) ? MOVE_PLANNER_ERROR_MSG.STORAGE_ACCOUNTING_REQUIRED : MOVE_PLANNER_ERROR_MSG.STORAGE_ACCOUNTING_ESTIMATE_REQUIRED);
            }
          }
          return NUM.ZERO;
        }
      }
      return this.accountingService.estimateReplicaBytes(stryMutAct_9fa48("130596") ? {} : (stryCov_9fa48("130596"), {
        entityType: this.entityType,
        sizeBytes: NUM.ZERO
      }));
    }
  }

  /**
   * Filter nodes by storage capacity feasibility.
   *
   * When storageAdmissionService is available, each candidate node is
   * checked via checkAdd. Nodes that fail admission are excluded from
   * placement.
   *
   * Requirements: 5.1, 5.4, 11.3
   *
   * @param {Array<Object>} nodes - Candidate nodes.
   * @param {number} estimatedBytes - Estimated bytes for the replica.
   * @return {Promise<Object>} { feasibleNodes, diagnostics }
   * @private
   */
  async filterNodesByCapacity(nodes, estimatedBytes) {
    if (stryMutAct_9fa48("130597")) {
      {}
    } else {
      stryCov_9fa48("130597");
      const diagnostics = stryMutAct_9fa48("130598") ? {} : (stryCov_9fa48("130598"), {
        totalCandidates: nodes.length,
        feasibleCount: nodes.length,
        rejectedCount: NUM.ZERO,
        rejectionsByReason: {},
        capacityFilterApplied: stryMutAct_9fa48("130599") ? true : (stryCov_9fa48("130599"), false)
      });
      if (stryMutAct_9fa48("130603") ? estimatedBytes > NUM.ZERO : stryMutAct_9fa48("130602") ? estimatedBytes < NUM.ZERO : stryMutAct_9fa48("130601") ? false : stryMutAct_9fa48("130600") ? true : (stryCov_9fa48("130600", "130601", "130602", "130603"), estimatedBytes <= NUM.ZERO)) {
        if (stryMutAct_9fa48("130604")) {
          {}
        } else {
          stryCov_9fa48("130604");
          diagnostics.feasibleCount = nodes.length;
          return stryMutAct_9fa48("130605") ? {} : (stryCov_9fa48("130605"), {
            feasibleNodes: nodes,
            diagnostics
          });
        }
      }
      if (stryMutAct_9fa48("130608") ? !this.storageAdmissionService && typeof this.storageAdmissionService.checkAdd !== MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("130607") ? false : stryMutAct_9fa48("130606") ? true : (stryCov_9fa48("130606", "130607", "130608"), (stryMutAct_9fa48("130609") ? this.storageAdmissionService : (stryCov_9fa48("130609"), !this.storageAdmissionService)) || (stryMutAct_9fa48("130611") ? typeof this.storageAdmissionService.checkAdd === MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("130610") ? false : (stryCov_9fa48("130610", "130611"), typeof this.storageAdmissionService.checkAdd !== MOVE_PLANNER_LITERAL.FUNCTION)))) {
        if (stryMutAct_9fa48("130612")) {
          {}
        } else {
          stryCov_9fa48("130612");
          if (stryMutAct_9fa48("130614") ? false : stryMutAct_9fa48("130613") ? true : (stryCov_9fa48("130613", "130614"), this.strictOwnerDependencies)) {
            if (stryMutAct_9fa48("130615")) {
              {}
            } else {
              stryCov_9fa48("130615");
              throw new Error((stryMutAct_9fa48("130616") ? this.storageAdmissionService : (stryCov_9fa48("130616"), !this.storageAdmissionService)) ? MOVE_PLANNER_ERROR_MSG.STORAGE_ADMISSION_REQUIRED : MOVE_PLANNER_ERROR_MSG.STORAGE_ADMISSION_CHECK_ADD_REQUIRED);
            }
          }
          diagnostics.feasibleCount = nodes.length;
          return stryMutAct_9fa48("130617") ? {} : (stryCov_9fa48("130617"), {
            feasibleNodes: nodes,
            diagnostics
          });
        }
      }
      diagnostics.capacityFilterApplied = stryMutAct_9fa48("130618") ? false : (stryCov_9fa48("130618"), true);
      const feasibleNodes = stryMutAct_9fa48("130619") ? ["Stryker was here"] : (stryCov_9fa48("130619"), []);
      const criticalAdmissionEntity = this.isCriticalAdmissionEntity();
      for (const node of nodes) {
        if (stryMutAct_9fa48("130620")) {
          {}
        } else {
          stryCov_9fa48("130620");
          const nodeId = node.node_id;
          try {
            if (stryMutAct_9fa48("130621")) {
              {}
            } else {
              stryCov_9fa48("130621");
              const result = await this.storageAdmissionService.checkAdd(stryMutAct_9fa48("130622") ? {} : (stryCov_9fa48("130622"), {
                targetNodeId: nodeId,
                estimatedBytes,
                isCritical: criticalAdmissionEntity
              }));
              if (stryMutAct_9fa48("130625") ? result.decision !== ADMISSION_DECISION.ALLOW : stryMutAct_9fa48("130624") ? false : stryMutAct_9fa48("130623") ? true : (stryCov_9fa48("130623", "130624", "130625"), result.decision === ADMISSION_DECISION.ALLOW)) {
                if (stryMutAct_9fa48("130626")) {
                  {}
                } else {
                  stryCov_9fa48("130626");
                  feasibleNodes.push(node);
                }
              } else {
                if (stryMutAct_9fa48("130627")) {
                  {}
                } else {
                  stryCov_9fa48("130627");
                  const reason = result.reason;
                  diagnostics.rejectionsByReason[reason] = stryMutAct_9fa48("130628") ? (diagnostics.rejectionsByReason[reason] || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("130628"), (stryMutAct_9fa48("130631") ? diagnostics.rejectionsByReason[reason] && NUM.ZERO : stryMutAct_9fa48("130630") ? false : stryMutAct_9fa48("130629") ? true : (stryCov_9fa48("130629", "130630", "130631"), diagnostics.rejectionsByReason[reason] || NUM.ZERO)) + NUM.ONE);
                  this.logger.debug(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_REJECTED, stryMutAct_9fa48("130632") ? {} : (stryCov_9fa48("130632"), {
                    entityId: this.entityId,
                    nodeId,
                    reason,
                    projectedUtilization: result.projectedUtilization
                  }));
                }
              }
            }
          } catch (err) {
            if (stryMutAct_9fa48("130633")) {
              {}
            } else {
              stryCov_9fa48("130633");
              diagnostics.rejectionsByReason[CAPACITY_REJECTION_REASON.ADMISSION_ERROR] = stryMutAct_9fa48("130634") ? (diagnostics.rejectionsByReason[CAPACITY_REJECTION_REASON.ADMISSION_ERROR] || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("130634"), (stryMutAct_9fa48("130637") ? diagnostics.rejectionsByReason[CAPACITY_REJECTION_REASON.ADMISSION_ERROR] && NUM.ZERO : stryMutAct_9fa48("130636") ? false : stryMutAct_9fa48("130635") ? true : (stryCov_9fa48("130635", "130636", "130637"), diagnostics.rejectionsByReason[CAPACITY_REJECTION_REASON.ADMISSION_ERROR] || NUM.ZERO)) + NUM.ONE);
              this.logger.warn(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_REJECTED, stryMutAct_9fa48("130638") ? {} : (stryCov_9fa48("130638"), {
                entityId: this.entityId,
                nodeId,
                reason: CAPACITY_REJECTION_REASON.ADMISSION_ERROR,
                error: stryMutAct_9fa48("130641") ? err?.message && null : stryMutAct_9fa48("130640") ? false : stryMutAct_9fa48("130639") ? true : (stryCov_9fa48("130639", "130640", "130641"), (stryMutAct_9fa48("130642") ? err.message : (stryCov_9fa48("130642"), err?.message)) || null)
              }));
            }
          }
        }
      }
      diagnostics.feasibleCount = feasibleNodes.length;
      diagnostics.rejectedCount = stryMutAct_9fa48("130643") ? nodes.length + feasibleNodes.length : (stryCov_9fa48("130643"), nodes.length - feasibleNodes.length);
      if (stryMutAct_9fa48("130647") ? diagnostics.rejectedCount <= NUM.ZERO : stryMutAct_9fa48("130646") ? diagnostics.rejectedCount >= NUM.ZERO : stryMutAct_9fa48("130645") ? false : stryMutAct_9fa48("130644") ? true : (stryCov_9fa48("130644", "130645", "130646", "130647"), diagnostics.rejectedCount > NUM.ZERO)) {
        if (stryMutAct_9fa48("130648")) {
          {}
        } else {
          stryCov_9fa48("130648");
          this.logger.info(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_APPLIED, stryMutAct_9fa48("130649") ? {} : (stryCov_9fa48("130649"), {
            entityId: this.entityId,
            entityType: this.entityType,
            totalCandidates: diagnostics.totalCandidates,
            feasibleCount: diagnostics.feasibleCount,
            rejectedCount: diagnostics.rejectedCount,
            rejectionsByReason: diagnostics.rejectionsByReason
          }));
        }
      }
      return stryMutAct_9fa48("130650") ? {} : (stryCov_9fa48("130650"), {
        feasibleNodes,
        diagnostics
      });
    }
  }

  /**
   * Determine the degraded reason based on node counts and capacity
   * filter results.
   *
   * Requirements: 5.3
   *
   * @param {number} totalReadyNodes - Nodes before capacity filter.
   * @param {number} feasibleCount - Nodes after capacity filter.
   * @param {number} effectiveCount - Nodes actually placed.
   * @param {number} targetCount - Desired replica count.
   * @param {Object} diagnostics - Capacity filter diagnostics.
   * @return {string|null} Degraded reason or null.
   * @private
   */
  getDegradedReason(totalReadyNodes, feasibleCount, effectiveCount, targetCount, diagnostics) {
    if (stryMutAct_9fa48("130651")) {
      {}
    } else {
      stryCov_9fa48("130651");
      if (stryMutAct_9fa48("130655") ? effectiveCount < targetCount : stryMutAct_9fa48("130654") ? effectiveCount > targetCount : stryMutAct_9fa48("130653") ? false : stryMutAct_9fa48("130652") ? true : (stryCov_9fa48("130652", "130653", "130654", "130655"), effectiveCount >= targetCount)) {
        if (stryMutAct_9fa48("130656")) {
          {}
        } else {
          stryCov_9fa48("130656");
          return null;
        }
      }
      // Capacity filtering removed nodes — capacity is the bottleneck
      // when the filter reduced the candidate set below target.
      if (stryMutAct_9fa48("130659") ? diagnostics.rejectedCount > NUM.ZERO || feasibleCount < targetCount : stryMutAct_9fa48("130658") ? false : stryMutAct_9fa48("130657") ? true : (stryCov_9fa48("130657", "130658", "130659"), (stryMutAct_9fa48("130662") ? diagnostics.rejectedCount <= NUM.ZERO : stryMutAct_9fa48("130661") ? diagnostics.rejectedCount >= NUM.ZERO : stryMutAct_9fa48("130660") ? true : (stryCov_9fa48("130660", "130661", "130662"), diagnostics.rejectedCount > NUM.ZERO)) && (stryMutAct_9fa48("130665") ? feasibleCount >= targetCount : stryMutAct_9fa48("130664") ? feasibleCount <= targetCount : stryMutAct_9fa48("130663") ? true : (stryCov_9fa48("130663", "130664", "130665"), feasibleCount < targetCount)))) {
        if (stryMutAct_9fa48("130666")) {
          {}
        } else {
          stryCov_9fa48("130666");
          return DegradedReason.INSUFFICIENT_CAPACITY;
        }
      }
      // Not enough ready nodes regardless of capacity
      return DegradedReason.INSUFFICIENT_NODES;
    }
  }

  /**
   * Calculate optimal placement for message groups.
   * Ensures every node has at least one local replica.
   * @param {Array<Object>} nodes - Feasible nodes after capacity filter.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Message group policy.
   * @param {Object} diagnostics - Capacity filter diagnostics.
   * @return {Object} Target placement state.
   */
  calculateMessageGroupPlacement(nodes, targetCount, policy, diagnostics) {
    if (stryMutAct_9fa48("130667")) {
      {}
    } else {
      stryCov_9fa48("130667");
      const targetNodes = stryMutAct_9fa48("130668") ? ["Stryker was here"] : (stryCov_9fa48("130668"), []);
      const diag = stryMutAct_9fa48("130671") ? diagnostics && {
        totalCandidates: nodes ? nodes.length : NUM.ZERO,
        feasibleCount: nodes ? nodes.length : NUM.ZERO,
        rejectedCount: NUM.ZERO,
        rejectionsByReason: {},
        capacityFilterApplied: false
      } : stryMutAct_9fa48("130670") ? false : stryMutAct_9fa48("130669") ? true : (stryCov_9fa48("130669", "130670", "130671"), diagnostics || (stryMutAct_9fa48("130672") ? {} : (stryCov_9fa48("130672"), {
        totalCandidates: nodes ? nodes.length : NUM.ZERO,
        feasibleCount: nodes ? nodes.length : NUM.ZERO,
        rejectedCount: NUM.ZERO,
        rejectionsByReason: {},
        capacityFilterApplied: stryMutAct_9fa48("130673") ? true : (stryCov_9fa48("130673"), false)
      })));
      const totalReadyNodes = diag.totalCandidates;
      const maxReplicaCount = stryMutAct_9fa48("130676") ? policy.maxReplicaCount && MESSAGE_GROUP_PLACEMENT_DEFAULT_MAX_REPLICA_COUNT : stryMutAct_9fa48("130675") ? false : stryMutAct_9fa48("130674") ? true : (stryCov_9fa48("130674", "130675", "130676"), policy.maxReplicaCount || MESSAGE_GROUP_PLACEMENT_DEFAULT_MAX_REPLICA_COUNT);

      // No feasible nodes: we cannot place any replicas.
      if (stryMutAct_9fa48("130679") ? !nodes && nodes.length === NUM.ZERO : stryMutAct_9fa48("130678") ? false : stryMutAct_9fa48("130677") ? true : (stryCov_9fa48("130677", "130678", "130679"), (stryMutAct_9fa48("130680") ? nodes : (stryCov_9fa48("130680"), !nodes)) || (stryMutAct_9fa48("130682") ? nodes.length !== NUM.ZERO : stryMutAct_9fa48("130681") ? false : (stryCov_9fa48("130681", "130682"), nodes.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("130683")) {
          {}
        } else {
          stryCov_9fa48("130683");
          return buildMessageGroupPlacementResult(stryMutAct_9fa48("130684") ? {} : (stryCov_9fa48("130684"), {
            targetReplicaCount: targetCount,
            targetNodes: stryMutAct_9fa48("130685") ? ["Stryker was here"] : (stryCov_9fa48("130685"), []),
            maxReplicaCount,
            degradedReason: this.getDegradedReason(totalReadyNodes, NUM.ZERO, NUM.ZERO, targetCount, diag),
            availableNodeCount: NUM.ZERO,
            capacityDiagnostics: diag
          }));
        }
      }

      // First, ensure we have replicas spread across nodes
      if (stryMutAct_9fa48("130688") ? policy.placementConstraints.spreadAcrossNodes : stryMutAct_9fa48("130687") ? false : stryMutAct_9fa48("130686") ? true : (stryCov_9fa48("130686", "130687", "130688"), policy.placementConstraints?.spreadAcrossNodes)) {
        if (stryMutAct_9fa48("130689")) {
          {}
        } else {
          stryCov_9fa48("130689");
          // Sort nodes by current replica load (prefer less loaded nodes)
          const sortedNodes = this.sortNodesByLoad(nodes);
          if (stryMutAct_9fa48("130692") ? sortedNodes.length !== NUM.ZERO : stryMutAct_9fa48("130691") ? false : stryMutAct_9fa48("130690") ? true : (stryCov_9fa48("130690", "130691", "130692"), sortedNodes.length === NUM.ZERO)) {
            if (stryMutAct_9fa48("130693")) {
              {}
            } else {
              stryCov_9fa48("130693");
              return buildMessageGroupPlacementResult(stryMutAct_9fa48("130694") ? {} : (stryCov_9fa48("130694"), {
                targetReplicaCount: targetCount,
                targetNodes: stryMutAct_9fa48("130695") ? ["Stryker was here"] : (stryCov_9fa48("130695"), []),
                maxReplicaCount,
                degradedReason: this.getDegradedReason(totalReadyNodes, NUM.ZERO, NUM.ZERO, targetCount, diag),
                availableNodeCount: NUM.ZERO,
                capacityDiagnostics: diag
              }));
            }
          }
          const effectiveCount = stryMutAct_9fa48("130696") ? Math.max(targetCount, sortedNodes.length) : (stryCov_9fa48("130696"), Math.min(targetCount, sortedNodes.length));

          // Select target nodes — one replica per node, no wrapping
          for (let i = NUM.ZERO; stryMutAct_9fa48("130699") ? i >= effectiveCount : stryMutAct_9fa48("130698") ? i <= effectiveCount : stryMutAct_9fa48("130697") ? false : (stryCov_9fa48("130697", "130698", "130699"), i < effectiveCount); stryMutAct_9fa48("130700") ? i-- : (stryCov_9fa48("130700"), i++)) {
            if (stryMutAct_9fa48("130701")) {
              {}
            } else {
              stryCov_9fa48("130701");
              targetNodes.push(sortedNodes[i].node_id);
            }
          }
          return buildMessageGroupPlacementResult(stryMutAct_9fa48("130702") ? {} : (stryCov_9fa48("130702"), {
            targetReplicaCount: targetCount,
            targetNodes,
            maxReplicaCount,
            degradedReason: this.getDegradedReason(totalReadyNodes, sortedNodes.length, effectiveCount, targetCount, diag),
            availableNodeCount: sortedNodes.length,
            capacityDiagnostics: diag
          }));
        }
      }
      return buildMessageGroupPlacementResult(stryMutAct_9fa48("130703") ? {} : (stryCov_9fa48("130703"), {
        targetReplicaCount: targetCount,
        targetNodes,
        maxReplicaCount,
        degradedReason: this.getDegradedReason(totalReadyNodes, nodes.length, targetNodes.length, targetCount, diag),
        availableNodeCount: nodes.length,
        capacityDiagnostics: diag
      }));
    }
  }

  /**
   * Calculate optimal placement for partitions.
   * @param {Array<Object>} nodes - Feasible nodes after capacity filter.
   * @param {number} targetCount - Target replica count.
   * @param {Object} policy - Table policy.
   * @param {Object} diagnostics - Capacity filter diagnostics.
   * @return {Object} Target placement state.
   */
  calculatePartitionPlacement(nodes, targetCount, policy, diagnostics) {
    if (stryMutAct_9fa48("130704")) {
      {}
    } else {
      stryCov_9fa48("130704");
      const targetNodes = stryMutAct_9fa48("130705") ? ["Stryker was here"] : (stryCov_9fa48("130705"), []);
      const diag = stryMutAct_9fa48("130708") ? diagnostics && {
        totalCandidates: nodes ? nodes.length : NUM.ZERO,
        feasibleCount: nodes ? nodes.length : NUM.ZERO,
        rejectedCount: NUM.ZERO,
        rejectionsByReason: {},
        capacityFilterApplied: false
      } : stryMutAct_9fa48("130707") ? false : stryMutAct_9fa48("130706") ? true : (stryCov_9fa48("130706", "130707", "130708"), diagnostics || (stryMutAct_9fa48("130709") ? {} : (stryCov_9fa48("130709"), {
        totalCandidates: nodes ? nodes.length : NUM.ZERO,
        feasibleCount: nodes ? nodes.length : NUM.ZERO,
        rejectedCount: NUM.ZERO,
        rejectionsByReason: {},
        capacityFilterApplied: stryMutAct_9fa48("130710") ? true : (stryCov_9fa48("130710"), false)
      })));
      const totalReadyNodes = diag.totalCandidates;

      // Sort nodes by suitability based on policy constraints
      const sortedNodes = this.sortNodesBySuitability(nodes, policy);

      // No feasible nodes: we cannot place any replicas.
      if (stryMutAct_9fa48("130713") ? sortedNodes.length !== NUM.ZERO : stryMutAct_9fa48("130712") ? false : stryMutAct_9fa48("130711") ? true : (stryCov_9fa48("130711", "130712", "130713"), sortedNodes.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("130714")) {
          {}
        } else {
          stryCov_9fa48("130714");
          const degradedReason = this.getDegradedReason(totalReadyNodes, NUM.ZERO, NUM.ZERO, targetCount, diag);
          const prioritySpread = this.analyzePrioritySpread(stryMutAct_9fa48("130715") ? ["Stryker was here"] : (stryCov_9fa48("130715"), []), policy, stryMutAct_9fa48("130716") ? ["Stryker was here"] : (stryCov_9fa48("130716"), []));
          return stryMutAct_9fa48("130717") ? {} : (stryCov_9fa48("130717"), {
            targetReplicaCount: targetCount,
            targetNodes: stryMutAct_9fa48("130718") ? ["Stryker was here"] : (stryCov_9fa48("130718"), []),
            minReplicaCount: stryMutAct_9fa48("130721") ? policy.minReplicaCount && NUM.THREE : stryMutAct_9fa48("130720") ? false : stryMutAct_9fa48("130719") ? true : (stryCov_9fa48("130719", "130720", "130721"), policy.minReplicaCount || NUM.THREE),
            maxReplicaCount: stryMutAct_9fa48("130724") ? policy.maxReplicaCount && NUM.SEVEN : stryMutAct_9fa48("130723") ? false : stryMutAct_9fa48("130722") ? true : (stryCov_9fa48("130722", "130723", "130724"), policy.maxReplicaCount || NUM.SEVEN),
            degraded: stryMutAct_9fa48("130725") ? false : (stryCov_9fa48("130725"), true),
            degradedReason,
            availableNodeCount: NUM.ZERO,
            capacityDiagnostics: diag,
            prioritySpread
          });
        }
      }

      // Keep desired replica target independent of current node count.
      // Placement assigns at most one replica per available node.
      const effectiveCount = stryMutAct_9fa48("130726") ? Math.max(targetCount, sortedNodes.length) : (stryCov_9fa48("130726"), Math.min(targetCount, sortedNodes.length));

      // Select target nodes — one replica per node, no wrapping
      for (let i = NUM.ZERO; stryMutAct_9fa48("130729") ? i >= effectiveCount : stryMutAct_9fa48("130728") ? i <= effectiveCount : stryMutAct_9fa48("130727") ? false : (stryCov_9fa48("130727", "130728", "130729"), i < effectiveCount); stryMutAct_9fa48("130730") ? i-- : (stryCov_9fa48("130730"), i++)) {
        if (stryMutAct_9fa48("130731")) {
          {}
        } else {
          stryCov_9fa48("130731");
          targetNodes.push(sortedNodes[i].node_id);
        }
      }
      const degradedReason = this.getDegradedReason(totalReadyNodes, sortedNodes.length, effectiveCount, targetCount, diag);
      const prioritySpread = this.analyzePrioritySpread(targetNodes.map(stryMutAct_9fa48("130732") ? () => undefined : (stryCov_9fa48("130732"), nodeId => stryMutAct_9fa48("130733") ? {} : (stryCov_9fa48("130733"), {
        node_id: nodeId,
        status: ReplicaStatus.ACTIVE
      }))), policy, sortedNodes);
      return stryMutAct_9fa48("130734") ? {} : (stryCov_9fa48("130734"), {
        targetReplicaCount: targetCount,
        targetNodes,
        minReplicaCount: stryMutAct_9fa48("130737") ? policy.minReplicaCount && NUM.THREE : stryMutAct_9fa48("130736") ? false : stryMutAct_9fa48("130735") ? true : (stryCov_9fa48("130735", "130736", "130737"), policy.minReplicaCount || NUM.THREE),
        maxReplicaCount: stryMutAct_9fa48("130740") ? policy.maxReplicaCount && NUM.SEVEN : stryMutAct_9fa48("130739") ? false : stryMutAct_9fa48("130738") ? true : (stryCov_9fa48("130738", "130739", "130740"), policy.maxReplicaCount || NUM.SEVEN),
        degraded: stryMutAct_9fa48("130744") ? effectiveCount >= targetCount : stryMutAct_9fa48("130743") ? effectiveCount <= targetCount : stryMutAct_9fa48("130742") ? false : stryMutAct_9fa48("130741") ? true : (stryCov_9fa48("130741", "130742", "130743", "130744"), effectiveCount < targetCount),
        degradedReason,
        availableNodeCount: sortedNodes.length,
        capacityDiagnostics: diag,
        prioritySpread
      });
    }
  }

  /**
   * Sort nodes by current load (prefer less loaded nodes).
   * @param {Array<Object>} nodes - Available nodes.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesByLoad(nodes) {
    if (stryMutAct_9fa48("130745")) {
      {}
    } else {
      stryCov_9fa48("130745");
      return stryMutAct_9fa48("130746") ? [...nodes] : (stryCov_9fa48("130746"), (stryMutAct_9fa48("130747") ? [] : (stryCov_9fa48("130747"), [...nodes])).sort((a, b) => {
        if (stryMutAct_9fa48("130748")) {
          {}
        } else {
          stryCov_9fa48("130748");
          // Calculate load score (lower is better)
          const loadA = this.calculateNodeLoad(a);
          const loadB = this.calculateNodeLoad(b);
          return stryMutAct_9fa48("130749") ? loadA + loadB : (stryCov_9fa48("130749"), loadA - loadB);
        }
      }));
    }
  }

  /**
   * Sort nodes by suitability based on policy constraints.
   * Includes storage-aware tie-breaking when capacity data is
   * available (Req 5.2).
   * @param {Array<Object>} nodes - Available nodes.
   * @param {Object} policy - Policy with placement constraints.
   * @return {Array<Object>} Sorted nodes.
   */
  sortNodesBySuitability(nodes, policy) {
    if (stryMutAct_9fa48("130750")) {
      {}
    } else {
      stryCov_9fa48("130750");
      const constraints = stryMutAct_9fa48("130753") ? policy.placementConstraints && {} : stryMutAct_9fa48("130752") ? false : stryMutAct_9fa48("130751") ? true : (stryCov_9fa48("130751", "130752", "130753"), policy.placementConstraints || {});
      const topologyContext = this.buildTopologyPlacementContext(nodes);
      return stryMutAct_9fa48("130754") ? [...nodes] : (stryCov_9fa48("130754"), (stryMutAct_9fa48("130755") ? [] : (stryCov_9fa48("130755"), [...nodes])).sort((a, b) => {
        if (stryMutAct_9fa48("130756")) {
          {}
        } else {
          stryCov_9fa48("130756");
          let scoreA = NUM.ZERO;
          let scoreB = NUM.ZERO;

          // Consider CPU load
          if (stryMutAct_9fa48("130758") ? false : stryMutAct_9fa48("130757") ? true : (stryCov_9fa48("130757", "130758"), constraints.considerCpuLoad)) {
            if (stryMutAct_9fa48("130759")) {
              {}
            } else {
              stryCov_9fa48("130759");
              const cpuA = stryMutAct_9fa48("130762") ? a.cpu_usage_percent && NUM.ZERO : stryMutAct_9fa48("130761") ? false : stryMutAct_9fa48("130760") ? true : (stryCov_9fa48("130760", "130761", "130762"), a.cpu_usage_percent || NUM.ZERO);
              const cpuB = stryMutAct_9fa48("130765") ? b.cpu_usage_percent && NUM.ZERO : stryMutAct_9fa48("130764") ? false : stryMutAct_9fa48("130763") ? true : (stryCov_9fa48("130763", "130764", "130765"), b.cpu_usage_percent || NUM.ZERO);
              stryMutAct_9fa48("130766") ? scoreA -= cpuA : (stryCov_9fa48("130766"), scoreA += cpuA);
              stryMutAct_9fa48("130767") ? scoreB -= cpuB : (stryCov_9fa48("130767"), scoreB += cpuB);
            }
          }

          // Consider memory load
          if (stryMutAct_9fa48("130769") ? false : stryMutAct_9fa48("130768") ? true : (stryCov_9fa48("130768", "130769"), constraints.considerMemoryLoad)) {
            if (stryMutAct_9fa48("130770")) {
              {}
            } else {
              stryCov_9fa48("130770");
              const memA = stryMutAct_9fa48("130773") ? a.memory_usage_percent && NUM.ZERO : stryMutAct_9fa48("130772") ? false : stryMutAct_9fa48("130771") ? true : (stryCov_9fa48("130771", "130772", "130773"), a.memory_usage_percent || NUM.ZERO);
              const memB = stryMutAct_9fa48("130776") ? b.memory_usage_percent && NUM.ZERO : stryMutAct_9fa48("130775") ? false : stryMutAct_9fa48("130774") ? true : (stryCov_9fa48("130774", "130775", "130776"), b.memory_usage_percent || NUM.ZERO);
              stryMutAct_9fa48("130777") ? scoreA -= memA : (stryCov_9fa48("130777"), scoreA += memA);
              stryMutAct_9fa48("130778") ? scoreB -= memB : (stryCov_9fa48("130778"), scoreB += memB);
            }
          }

          // Consider disk space
          if (stryMutAct_9fa48("130780") ? false : stryMutAct_9fa48("130779") ? true : (stryCov_9fa48("130779", "130780"), constraints.considerDiskSpace)) {
            if (stryMutAct_9fa48("130781")) {
              {}
            } else {
              stryCov_9fa48("130781");
              const diskA = stryMutAct_9fa48("130784") ? a.disk_usage_percent && NUM.ZERO : stryMutAct_9fa48("130783") ? false : stryMutAct_9fa48("130782") ? true : (stryCov_9fa48("130782", "130783", "130784"), a.disk_usage_percent || NUM.ZERO);
              const diskB = stryMutAct_9fa48("130787") ? b.disk_usage_percent && NUM.ZERO : stryMutAct_9fa48("130786") ? false : stryMutAct_9fa48("130785") ? true : (stryCov_9fa48("130785", "130786", "130787"), b.disk_usage_percent || NUM.ZERO);
              stryMutAct_9fa48("130788") ? scoreA -= diskA : (stryCov_9fa48("130788"), scoreA += diskA);
              stryMutAct_9fa48("130789") ? scoreB -= diskB : (stryCov_9fa48("130789"), scoreB += diskB);
            }
          }
          if (stryMutAct_9fa48("130791") ? false : stryMutAct_9fa48("130790") ? true : (stryCov_9fa48("130790", "130791"), constraints.preferSameLatencyGroup)) {
            if (stryMutAct_9fa48("130792")) {
              {}
            } else {
              stryCov_9fa48("130792");
              stryMutAct_9fa48("130793") ? scoreA -= this.getSameLatencyGroupScoreAdjustment(a, topologyContext) : (stryCov_9fa48("130793"), scoreA += this.getSameLatencyGroupScoreAdjustment(a, topologyContext));
              stryMutAct_9fa48("130794") ? scoreB -= this.getSameLatencyGroupScoreAdjustment(b, topologyContext) : (stryCov_9fa48("130794"), scoreB += this.getSameLatencyGroupScoreAdjustment(b, topologyContext));
            }
          }
          if (stryMutAct_9fa48("130796") ? false : stryMutAct_9fa48("130795") ? true : (stryCov_9fa48("130795", "130796"), constraints.preferLatencyGroupDiversity)) {
            if (stryMutAct_9fa48("130797")) {
              {}
            } else {
              stryCov_9fa48("130797");
              stryMutAct_9fa48("130798") ? scoreA -= this.getLatencyGroupDiversityScoreAdjustment(a, topologyContext) : (stryCov_9fa48("130798"), scoreA += this.getLatencyGroupDiversityScoreAdjustment(a, topologyContext));
              stryMutAct_9fa48("130799") ? scoreB -= this.getLatencyGroupDiversityScoreAdjustment(b, topologyContext) : (stryCov_9fa48("130799"), scoreB += this.getLatencyGroupDiversityScoreAdjustment(b, topologyContext));
            }
          }

          // Storage-aware tie-breaker: prefer nodes with more available
          // budget bytes (lower disk_usage_percent as proxy). This keeps
          // disk usage scoring as a secondary heuristic, not the hard
          // gate (Req 5.2).
          if (stryMutAct_9fa48("130802") ? scoreA !== scoreB : stryMutAct_9fa48("130801") ? false : stryMutAct_9fa48("130800") ? true : (stryCov_9fa48("130800", "130801", "130802"), scoreA === scoreB)) {
            if (stryMutAct_9fa48("130803")) {
              {}
            } else {
              stryCov_9fa48("130803");
              const diskA = stryMutAct_9fa48("130806") ? a.disk_usage_percent && NUM.ZERO : stryMutAct_9fa48("130805") ? false : stryMutAct_9fa48("130804") ? true : (stryCov_9fa48("130804", "130805", "130806"), a.disk_usage_percent || NUM.ZERO);
              const diskB = stryMutAct_9fa48("130809") ? b.disk_usage_percent && NUM.ZERO : stryMutAct_9fa48("130808") ? false : stryMutAct_9fa48("130807") ? true : (stryCov_9fa48("130807", "130808", "130809"), b.disk_usage_percent || NUM.ZERO);
              return stryMutAct_9fa48("130810") ? diskA + diskB : (stryCov_9fa48("130810"), diskA - diskB);
            }
          }
          return stryMutAct_9fa48("130811") ? scoreA + scoreB : (stryCov_9fa48("130811"), scoreA - scoreB);
        }
      }));
    }
  }

  /**
   * Build topology scoring context from available nodes + current replicas.
   * @param {Array<Object>} nodes - Candidate nodes.
   * @return {Object}
   * @private
   */
  buildTopologyPlacementContext(nodes) {
    if (stryMutAct_9fa48("130812")) {
      {}
    } else {
      stryCov_9fa48("130812");
      const nodeGroupById = new Map();
      for (const node of nodes) {
        if (stryMutAct_9fa48("130813")) {
          {}
        } else {
          stryCov_9fa48("130813");
          const nodeId = stryMutAct_9fa48("130814") ? node.node_id : (stryCov_9fa48("130814"), node?.node_id);
          if (stryMutAct_9fa48("130817") ? false : stryMutAct_9fa48("130816") ? true : stryMutAct_9fa48("130815") ? nodeId : (stryCov_9fa48("130815", "130816", "130817"), !nodeId)) {
            if (stryMutAct_9fa48("130818")) {
              {}
            } else {
              stryCov_9fa48("130818");
              continue;
            }
          }
          nodeGroupById.set(nodeId, stryMutAct_9fa48("130821") ? node?.latency_group_id && null : stryMutAct_9fa48("130820") ? false : stryMutAct_9fa48("130819") ? true : (stryCov_9fa48("130819", "130820", "130821"), (stryMutAct_9fa48("130822") ? node.latency_group_id : (stryCov_9fa48("130822"), node?.latency_group_id)) || null));
        }
      }
      const currentReplicas = (stryMutAct_9fa48("130825") ? typeof this.moveStateProvider.getCurrentReplicas !== 'function' : stryMutAct_9fa48("130824") ? false : stryMutAct_9fa48("130823") ? true : (stryCov_9fa48("130823", "130824", "130825"), typeof this.moveStateProvider.getCurrentReplicas === (stryMutAct_9fa48("130826") ? "" : (stryCov_9fa48("130826"), 'function')))) ? this.moveStateProvider.getCurrentReplicas() : stryMutAct_9fa48("130827") ? ["Stryker was here"] : (stryCov_9fa48("130827"), []);
      const healthyReplicas = (stryMutAct_9fa48("130830") ? typeof this.moveStateProvider.getHealthyReplicas !== 'function' : stryMutAct_9fa48("130829") ? false : stryMutAct_9fa48("130828") ? true : (stryCov_9fa48("130828", "130829", "130830"), typeof this.moveStateProvider.getHealthyReplicas === (stryMutAct_9fa48("130831") ? "" : (stryCov_9fa48("130831"), 'function')))) ? this.moveStateProvider.getHealthyReplicas(currentReplicas) : currentReplicas;
      const existingGroupCounts = new Map();
      for (const replica of healthyReplicas) {
        if (stryMutAct_9fa48("130832")) {
          {}
        } else {
          stryCov_9fa48("130832");
          const nodeId = stryMutAct_9fa48("130833") ? replica.node_id : (stryCov_9fa48("130833"), replica?.node_id);
          const groupId = stryMutAct_9fa48("130836") ? nodeGroupById.get(nodeId) && null : stryMutAct_9fa48("130835") ? false : stryMutAct_9fa48("130834") ? true : (stryCov_9fa48("130834", "130835", "130836"), nodeGroupById.get(nodeId) || null);
          if (stryMutAct_9fa48("130839") ? false : stryMutAct_9fa48("130838") ? true : stryMutAct_9fa48("130837") ? groupId : (stryCov_9fa48("130837", "130838", "130839"), !groupId)) {
            if (stryMutAct_9fa48("130840")) {
              {}
            } else {
              stryCov_9fa48("130840");
              continue;
            }
          }
          existingGroupCounts.set(groupId, stryMutAct_9fa48("130841") ? (existingGroupCounts.get(groupId) || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("130841"), (stryMutAct_9fa48("130844") ? existingGroupCounts.get(groupId) && NUM.ZERO : stryMutAct_9fa48("130843") ? false : stryMutAct_9fa48("130842") ? true : (stryCov_9fa48("130842", "130843", "130844"), existingGroupCounts.get(groupId) || NUM.ZERO)) + NUM.ONE));
        }
      }
      return stryMutAct_9fa48("130845") ? {} : (stryCov_9fa48("130845"), {
        nodeGroupById,
        existingGroupCounts,
        dominantGroupId: this.selectDominantGroupId(existingGroupCounts)
      });
    }
  }

  /**
   * Select dominant latency-group ID by current replica membership.
   * @param {Map<string, number>} existingGroupCounts
   * @return {string|null}
   * @private
   */
  selectDominantGroupId(existingGroupCounts) {
    if (stryMutAct_9fa48("130846")) {
      {}
    } else {
      stryCov_9fa48("130846");
      let dominantGroupId = null;
      let dominantCount = NUM.ZERO;
      for (const [groupId, count] of existingGroupCounts.entries()) {
        if (stryMutAct_9fa48("130847")) {
          {}
        } else {
          stryCov_9fa48("130847");
          if (stryMutAct_9fa48("130851") ? count <= dominantCount : stryMutAct_9fa48("130850") ? count >= dominantCount : stryMutAct_9fa48("130849") ? false : stryMutAct_9fa48("130848") ? true : (stryCov_9fa48("130848", "130849", "130850", "130851"), count > dominantCount)) {
            if (stryMutAct_9fa48("130852")) {
              {}
            } else {
              stryCov_9fa48("130852");
              dominantGroupId = groupId;
              dominantCount = count;
              continue;
            }
          }
          if (stryMutAct_9fa48("130855") ? count === dominantCount && dominantGroupId || groupId < dominantGroupId : stryMutAct_9fa48("130854") ? false : stryMutAct_9fa48("130853") ? true : (stryCov_9fa48("130853", "130854", "130855"), (stryMutAct_9fa48("130857") ? count === dominantCount || dominantGroupId : stryMutAct_9fa48("130856") ? true : (stryCov_9fa48("130856", "130857"), (stryMutAct_9fa48("130859") ? count !== dominantCount : stryMutAct_9fa48("130858") ? true : (stryCov_9fa48("130858", "130859"), count === dominantCount)) && dominantGroupId)) && (stryMutAct_9fa48("130862") ? groupId >= dominantGroupId : stryMutAct_9fa48("130861") ? groupId <= dominantGroupId : stryMutAct_9fa48("130860") ? true : (stryCov_9fa48("130860", "130861", "130862"), groupId < dominantGroupId)))) {
            if (stryMutAct_9fa48("130863")) {
              {}
            } else {
              stryCov_9fa48("130863");
              dominantGroupId = groupId;
            }
          }
        }
      }
      return dominantGroupId;
    }
  }

  /**
   * Score adjustment for same-group locality preference.
   * @param {Object} node
   * @param {Object} topologyContext
   * @return {number}
   * @private
   */
  getSameLatencyGroupScoreAdjustment(node, topologyContext) {
    if (stryMutAct_9fa48("130864")) {
      {}
    } else {
      stryCov_9fa48("130864");
      const dominantGroupId = topologyContext.dominantGroupId;
      const nodeGroupId = stryMutAct_9fa48("130867") ? topologyContext.nodeGroupById.get(node?.node_id) && null : stryMutAct_9fa48("130866") ? false : stryMutAct_9fa48("130865") ? true : (stryCov_9fa48("130865", "130866", "130867"), topologyContext.nodeGroupById.get(stryMutAct_9fa48("130868") ? node.node_id : (stryCov_9fa48("130868"), node?.node_id)) || null);
      if (stryMutAct_9fa48("130871") ? !dominantGroupId && !nodeGroupId : stryMutAct_9fa48("130870") ? false : stryMutAct_9fa48("130869") ? true : (stryCov_9fa48("130869", "130870", "130871"), (stryMutAct_9fa48("130872") ? dominantGroupId : (stryCov_9fa48("130872"), !dominantGroupId)) || (stryMutAct_9fa48("130873") ? nodeGroupId : (stryCov_9fa48("130873"), !nodeGroupId)))) {
        if (stryMutAct_9fa48("130874")) {
          {}
        } else {
          stryCov_9fa48("130874");
          return NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("130877") ? nodeGroupId !== dominantGroupId : stryMutAct_9fa48("130876") ? false : stryMutAct_9fa48("130875") ? true : (stryCov_9fa48("130875", "130876", "130877"), nodeGroupId === dominantGroupId)) {
        if (stryMutAct_9fa48("130878")) {
          {}
        } else {
          stryCov_9fa48("130878");
          return stryMutAct_9fa48("130879") ? +MOVE_PLANNER_TOPOLOGY_SCORE.SAME_GROUP_BONUS : (stryCov_9fa48("130879"), -MOVE_PLANNER_TOPOLOGY_SCORE.SAME_GROUP_BONUS);
        }
      }
      return MOVE_PLANNER_TOPOLOGY_SCORE.SAME_GROUP_PENALTY;
    }
  }

  /**
   * Score adjustment for latency-group diversity preference.
   * @param {Object} node
   * @param {Object} topologyContext
   * @return {number}
   * @private
   */
  getLatencyGroupDiversityScoreAdjustment(node, topologyContext) {
    if (stryMutAct_9fa48("130880")) {
      {}
    } else {
      stryCov_9fa48("130880");
      const nodeGroupId = stryMutAct_9fa48("130883") ? topologyContext.nodeGroupById.get(node?.node_id) && null : stryMutAct_9fa48("130882") ? false : stryMutAct_9fa48("130881") ? true : (stryCov_9fa48("130881", "130882", "130883"), topologyContext.nodeGroupById.get(stryMutAct_9fa48("130884") ? node.node_id : (stryCov_9fa48("130884"), node?.node_id)) || null);
      if (stryMutAct_9fa48("130887") ? false : stryMutAct_9fa48("130886") ? true : stryMutAct_9fa48("130885") ? nodeGroupId : (stryCov_9fa48("130885", "130886", "130887"), !nodeGroupId)) {
        if (stryMutAct_9fa48("130888")) {
          {}
        } else {
          stryCov_9fa48("130888");
          return NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("130890") ? false : stryMutAct_9fa48("130889") ? true : (stryCov_9fa48("130889", "130890"), topologyContext.existingGroupCounts.has(nodeGroupId))) {
        if (stryMutAct_9fa48("130891")) {
          {}
        } else {
          stryCov_9fa48("130891");
          return MOVE_PLANNER_TOPOLOGY_SCORE.DIVERSITY_EXISTING_GROUP_PENALTY;
        }
      }
      return stryMutAct_9fa48("130892") ? +MOVE_PLANNER_TOPOLOGY_SCORE.DIVERSITY_NEW_GROUP_BONUS : (stryCov_9fa48("130892"), -MOVE_PLANNER_TOPOLOGY_SCORE.DIVERSITY_NEW_GROUP_BONUS);
    }
  }

  /**
   * Calculate node load score.
   * @param {Object} node - Node object.
   * @return {number} Load score (0-300, lower is better).
   */
  calculateNodeLoad(node) {
    if (stryMutAct_9fa48("130893")) {
      {}
    } else {
      stryCov_9fa48("130893");
      const cpuLoad = stryMutAct_9fa48("130896") ? node.cpu_usage_percent && NUM.ZERO : stryMutAct_9fa48("130895") ? false : stryMutAct_9fa48("130894") ? true : (stryCov_9fa48("130894", "130895", "130896"), node.cpu_usage_percent || NUM.ZERO);
      const memoryLoad = stryMutAct_9fa48("130899") ? node.memory_usage_percent && NUM.ZERO : stryMutAct_9fa48("130898") ? false : stryMutAct_9fa48("130897") ? true : (stryCov_9fa48("130897", "130898", "130899"), node.memory_usage_percent || NUM.ZERO);
      const diskLoad = stryMutAct_9fa48("130902") ? node.disk_usage_percent && NUM.ZERO : stryMutAct_9fa48("130901") ? false : stryMutAct_9fa48("130900") ? true : (stryCov_9fa48("130900", "130901", "130902"), node.disk_usage_percent || NUM.ZERO);
      return stryMutAct_9fa48("130903") ? cpuLoad + memoryLoad - diskLoad : (stryCov_9fa48("130903"), (stryMutAct_9fa48("130904") ? cpuLoad - memoryLoad : (stryCov_9fa48("130904"), cpuLoad + memoryLoad)) + diskLoad);
    }
  }

  /**
   * Calculate moves needed to reach target state.
   * @param {Array<Object>} currentReplicas - Current replicas.
   * @param {Object} targetState - Target state.
   * @return {Array<Object>} Array of move operations.
   */
  calculateMoves(currentReplicas, targetState) {
    if (stryMutAct_9fa48("130905")) {
      {}
    } else {
      stryCov_9fa48("130905");
      const moves = stryMutAct_9fa48("130906") ? ["Stryker was here"] : (stryCov_9fa48("130906"), []);
      const healthyReplicas = this.moveStateProvider.getHealthyReplicas(currentReplicas);
      const isTopologyCleanupReason = reason => {
        if (stryMutAct_9fa48("130907")) {
          {}
        } else {
          stryCov_9fa48("130907");
          return stryMutAct_9fa48("130910") ? reason === MOVE_REASON.NODE_NOT_IN_TARGET && reason === MOVE_REASON.SPREAD_REPLICAS : stryMutAct_9fa48("130909") ? false : stryMutAct_9fa48("130908") ? true : (stryCov_9fa48("130908", "130909", "130910"), (stryMutAct_9fa48("130912") ? reason !== MOVE_REASON.NODE_NOT_IN_TARGET : stryMutAct_9fa48("130911") ? false : (stryCov_9fa48("130911", "130912"), reason === MOVE_REASON.NODE_NOT_IN_TARGET)) || (stryMutAct_9fa48("130914") ? reason !== MOVE_REASON.SPREAD_REPLICAS : stryMutAct_9fa48("130913") ? false : (stryCov_9fa48("130913", "130914"), reason === MOVE_REASON.SPREAD_REPLICAS)));
        }
      };
      const prioritySpreadPolicy = stryMutAct_9fa48("130915") ? {} : (stryCov_9fa48("130915"), {
        placementConstraints: stryMutAct_9fa48("130916") ? {} : (stryCov_9fa48("130916"), {
          spreadAcrossNodes: stryMutAct_9fa48("130917") ? false : (stryCov_9fa48("130917"), true)
        })
      });
      const placementReplicas = stryMutAct_9fa48("130918") ? currentReplicas : (stryCov_9fa48("130918"), currentReplicas.filter(replica => {
        if (stryMutAct_9fa48("130919")) {
          {}
        } else {
          stryCov_9fa48("130919");
          const status = (stryMutAct_9fa48("130922") ? typeof replica?.status !== 'string' : stryMutAct_9fa48("130921") ? false : stryMutAct_9fa48("130920") ? true : (stryCov_9fa48("130920", "130921", "130922"), typeof (stryMutAct_9fa48("130923") ? replica.status : (stryCov_9fa48("130923"), replica?.status)) === (stryMutAct_9fa48("130924") ? "" : (stryCov_9fa48("130924"), 'string')))) ? stryMutAct_9fa48("130925") ? replica.status.toUpperCase() : (stryCov_9fa48("130925"), replica.status.toLowerCase()) : ReplicaStatus.ACTIVE;
          return stryMutAct_9fa48("130928") ? !!replica?.node_id || PLACEMENT_OCCUPIED_STATUSES.has(status) : stryMutAct_9fa48("130927") ? false : stryMutAct_9fa48("130926") ? true : (stryCov_9fa48("130926", "130927", "130928"), (stryMutAct_9fa48("130929") ? !replica?.node_id : (stryCov_9fa48("130929"), !(stryMutAct_9fa48("130930") ? replica?.node_id : (stryCov_9fa48("130930"), !(stryMutAct_9fa48("130931") ? replica.node_id : (stryCov_9fa48("130931"), replica?.node_id)))))) && PLACEMENT_OCCUPIED_STATUSES.has(status));
        }
      }));
      const activePlacementReplicas = stryMutAct_9fa48("130932") ? currentReplicas : (stryCov_9fa48("130932"), currentReplicas.filter(replica => {
        if (stryMutAct_9fa48("130933")) {
          {}
        } else {
          stryCov_9fa48("130933");
          const status = stryMutAct_9fa48("130936") ? replica?.status && ReplicaStatus.ACTIVE : stryMutAct_9fa48("130935") ? false : stryMutAct_9fa48("130934") ? true : (stryCov_9fa48("130934", "130935", "130936"), (stryMutAct_9fa48("130937") ? replica.status : (stryCov_9fa48("130937"), replica?.status)) || ReplicaStatus.ACTIVE);
          return stryMutAct_9fa48("130940") ? status === ReplicaStatus.ACTIVE || !!replica?.node_id : stryMutAct_9fa48("130939") ? false : stryMutAct_9fa48("130938") ? true : (stryCov_9fa48("130938", "130939", "130940"), (stryMutAct_9fa48("130942") ? status !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("130941") ? true : (stryCov_9fa48("130941", "130942"), status === ReplicaStatus.ACTIVE)) && (stryMutAct_9fa48("130943") ? !replica?.node_id : (stryCov_9fa48("130943"), !(stryMutAct_9fa48("130944") ? replica?.node_id : (stryCov_9fa48("130944"), !(stryMutAct_9fa48("130945") ? replica.node_id : (stryCov_9fa48("130945"), replica?.node_id)))))));
        }
      }));
      const targetNodeIds = targetState.targetNodes;
      const isDegradedPlacement = stryMutAct_9fa48("130946") ? !targetState?.degraded : (stryCov_9fa48("130946"), !(stryMutAct_9fa48("130947") ? targetState?.degraded : (stryCov_9fa48("130947"), !(stryMutAct_9fa48("130948") ? targetState.degraded : (stryCov_9fa48("130948"), targetState?.degraded)))));
      const inFlightOperations = (stryMutAct_9fa48("130951") ? typeof this.moveStateProvider.getTopologyBlockingInFlightOperations !== 'function' : stryMutAct_9fa48("130950") ? false : stryMutAct_9fa48("130949") ? true : (stryCov_9fa48("130949", "130950", "130951"), typeof this.moveStateProvider.getTopologyBlockingInFlightOperations === (stryMutAct_9fa48("130952") ? "" : (stryCov_9fa48("130952"), 'function')))) ? this.moveStateProvider.getTopologyBlockingInFlightOperations() : this.moveStateProvider.getInFlightOperations();
      const transitionalReplicas = stryMutAct_9fa48("130953") ? [] : (stryCov_9fa48("130953"), [...inFlightOperations.map(stryMutAct_9fa48("130954") ? () => undefined : (stryCov_9fa48("130954"), op => stryMutAct_9fa48("130955") ? {} : (stryCov_9fa48("130955"), {
        replicaId: op.replica_id,
        partitionId: op.partition_id,
        nodeId: op.target_node_id,
        step: stryMutAct_9fa48("130958") ? op.workflow_step && null : stryMutAct_9fa48("130957") ? false : stryMutAct_9fa48("130956") ? true : (stryCov_9fa48("130956", "130957", "130958"), op.workflow_step || null),
        state: op.workflow_step ? stryMutAct_9fa48("130959") ? op.workflow_step.toUpperCase() : (stryCov_9fa48("130959"), op.workflow_step.toLowerCase()) : op.status
      })))]);

      // Build sets for quick lookup of transitional replicas
      const nodesWithAddTransitional = new Set();
      const replicasInRemoving = new Set();
      for (const replica of transitionalReplicas) {
        if (stryMutAct_9fa48("130960")) {
          {}
        } else {
          stryCov_9fa48("130960");
          const isAddTransitional = stryMutAct_9fa48("130963") ? (replica.state === ReplicaStatus.PENDING || replica.state === ReplicaStatus.CREATING || replica.state === ReplicaStatus.SYNCING) && replica.step && replica.step === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("130962") ? false : stryMutAct_9fa48("130961") ? true : (stryCov_9fa48("130961", "130962", "130963"), (stryMutAct_9fa48("130965") ? (replica.state === ReplicaStatus.PENDING || replica.state === ReplicaStatus.CREATING) && replica.state === ReplicaStatus.SYNCING : stryMutAct_9fa48("130964") ? false : (stryCov_9fa48("130964", "130965"), (stryMutAct_9fa48("130967") ? replica.state === ReplicaStatus.PENDING && replica.state === ReplicaStatus.CREATING : stryMutAct_9fa48("130966") ? false : (stryCov_9fa48("130966", "130967"), (stryMutAct_9fa48("130969") ? replica.state !== ReplicaStatus.PENDING : stryMutAct_9fa48("130968") ? false : (stryCov_9fa48("130968", "130969"), replica.state === ReplicaStatus.PENDING)) || (stryMutAct_9fa48("130971") ? replica.state !== ReplicaStatus.CREATING : stryMutAct_9fa48("130970") ? false : (stryCov_9fa48("130970", "130971"), replica.state === ReplicaStatus.CREATING)))) || (stryMutAct_9fa48("130973") ? replica.state !== ReplicaStatus.SYNCING : stryMutAct_9fa48("130972") ? false : (stryCov_9fa48("130972", "130973"), replica.state === ReplicaStatus.SYNCING)))) || (stryMutAct_9fa48("130975") ? replica.step || replica.step === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("130974") ? false : (stryCov_9fa48("130974", "130975"), replica.step && (stryMutAct_9fa48("130977") ? replica.step !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("130976") ? true : (stryCov_9fa48("130976", "130977"), replica.step === WORKFLOW_STEP.SENDING)))));
          if (stryMutAct_9fa48("130979") ? false : stryMutAct_9fa48("130978") ? true : (stryCov_9fa48("130978", "130979"), isAddTransitional)) {
            if (stryMutAct_9fa48("130980")) {
              {}
            } else {
              stryCov_9fa48("130980");
              if (stryMutAct_9fa48("130983") ? replica.partitionId !== this.entityId : stryMutAct_9fa48("130982") ? false : stryMutAct_9fa48("130981") ? true : (stryCov_9fa48("130981", "130982", "130983"), replica.partitionId === this.entityId)) {
                if (stryMutAct_9fa48("130984")) {
                  {}
                } else {
                  stryCov_9fa48("130984");
                  nodesWithAddTransitional.add(replica.nodeId);
                }
              }
            }
          }
          if (stryMutAct_9fa48("130987") ? replica.state === ReplicaStatus.REMOVING && replica.step && replica.step === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("130986") ? false : stryMutAct_9fa48("130985") ? true : (stryCov_9fa48("130985", "130986", "130987"), (stryMutAct_9fa48("130989") ? replica.state !== ReplicaStatus.REMOVING : stryMutAct_9fa48("130988") ? false : (stryCov_9fa48("130988", "130989"), replica.state === ReplicaStatus.REMOVING)) || (stryMutAct_9fa48("130991") ? replica.step || replica.step === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("130990") ? false : (stryCov_9fa48("130990", "130991"), replica.step && (stryMutAct_9fa48("130993") ? replica.step !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("130992") ? true : (stryCov_9fa48("130992", "130993"), replica.step === WORKFLOW_STEP.STOPPING)))))) {
            if (stryMutAct_9fa48("130994")) {
              {}
            } else {
              stryCov_9fa48("130994");
              replicasInRemoving.add(replica.replicaId);
            }
          }
        }
      }
      const pendingCount = inFlightOperations.length;
      if (stryMutAct_9fa48("130998") ? pendingCount <= NUM.ZERO : stryMutAct_9fa48("130997") ? pendingCount >= NUM.ZERO : stryMutAct_9fa48("130996") ? false : stryMutAct_9fa48("130995") ? true : (stryCov_9fa48("130995", "130996", "130997", "130998"), pendingCount > NUM.ZERO)) {
        if (stryMutAct_9fa48("130999")) {
          {}
        } else {
          stryCov_9fa48("130999");
          // Operation lifecycle is owned by replica_operations. Service-row status
          // can be stale (for example bootstrap-local syncing followers), so we only
          // treat in-flight operations as authoritative transitional state for
          // topology-increasing work. Cleanup-only removals may still proceed when
          // the entity is already above target.
          if (stryMutAct_9fa48("131002") ? false : stryMutAct_9fa48("131001") ? true : stryMutAct_9fa48("131000") ? this.isControlPlanePriorityPartition() : (stryCov_9fa48("131000", "131001", "131002"), !this.isControlPlanePriorityPartition())) {
            if (stryMutAct_9fa48("131003")) {
              {}
            } else {
              stryCov_9fa48("131003");
              this.logger.debug(REBALANCER_LOG_MSG.SKIP_PENDING, stryMutAct_9fa48("131004") ? {} : (stryCov_9fa48("131004"), {
                entityId: this.entityId,
                pendingCount,
                cleanupOnly: stryMutAct_9fa48("131005") ? false : (stryCov_9fa48("131005"), true)
              }));
            }
          } else {
            if (stryMutAct_9fa48("131006")) {
              {}
            } else {
              stryCov_9fa48("131006");
              this.logger.debug(REBALANCER_LOG_MSG.SKIP_PENDING, stryMutAct_9fa48("131007") ? {} : (stryCov_9fa48("131007"), {
                entityId: this.entityId,
                pendingCount,
                bypassedForPriorityRecovery: stryMutAct_9fa48("131008") ? false : (stryCov_9fa48("131008"), true)
              }));
            }
          }
        }
      }
      const cleanupOnlyWhilePending = stryMutAct_9fa48("131011") ? pendingCount > NUM.ZERO || !this.isControlPlanePriorityPartition() : stryMutAct_9fa48("131010") ? false : stryMutAct_9fa48("131009") ? true : (stryCov_9fa48("131009", "131010", "131011"), (stryMutAct_9fa48("131014") ? pendingCount <= NUM.ZERO : stryMutAct_9fa48("131013") ? pendingCount >= NUM.ZERO : stryMutAct_9fa48("131012") ? true : (stryCov_9fa48("131012", "131013", "131014"), pendingCount > NUM.ZERO)) && (stryMutAct_9fa48("131015") ? this.isControlPlanePriorityPartition() : (stryCov_9fa48("131015"), !this.isControlPlanePriorityPartition())));

      // Count target replicas per node
      const targetCounts = new Map();
      for (const nodeId of targetNodeIds) {
        if (stryMutAct_9fa48("131016")) {
          {}
        } else {
          stryCov_9fa48("131016");
          targetCounts.set(nodeId, stryMutAct_9fa48("131017") ? (targetCounts.get(nodeId) || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("131017"), (stryMutAct_9fa48("131020") ? targetCounts.get(nodeId) && NUM.ZERO : stryMutAct_9fa48("131019") ? false : stryMutAct_9fa48("131018") ? true : (stryCov_9fa48("131018", "131019", "131020"), targetCounts.get(nodeId) || NUM.ZERO)) + NUM.ONE));
        }
      }

      // Count current replicas per node
      const currentCounts = new Map();
      for (const replica of placementReplicas) {
        if (stryMutAct_9fa48("131021")) {
          {}
        } else {
          stryCov_9fa48("131021");
          if (stryMutAct_9fa48("131024") ? replica || replica.node_id : stryMutAct_9fa48("131023") ? false : stryMutAct_9fa48("131022") ? true : (stryCov_9fa48("131022", "131023", "131024"), replica && replica.node_id)) {
            if (stryMutAct_9fa48("131025")) {
              {}
            } else {
              stryCov_9fa48("131025");
              currentCounts.set(replica.node_id, stryMutAct_9fa48("131026") ? (currentCounts.get(replica.node_id) || NUM.ZERO) - NUM.ONE : (stryCov_9fa48("131026"), (stryMutAct_9fa48("131029") ? currentCounts.get(replica.node_id) && NUM.ZERO : stryMutAct_9fa48("131028") ? false : stryMutAct_9fa48("131027") ? true : (stryCov_9fa48("131027", "131028", "131029"), currentCounts.get(replica.node_id) || NUM.ZERO)) + NUM.ONE));
            }
          }
        }
      }

      // Handle failed/inactive replicas - always remove them
      for (const replica of currentReplicas) {
        if (stryMutAct_9fa48("131030")) {
          {}
        } else {
          stryCov_9fa48("131030");
          const status = stryMutAct_9fa48("131033") ? replica.status && ReplicaStatus.ACTIVE : stryMutAct_9fa48("131032") ? false : stryMutAct_9fa48("131031") ? true : (stryCov_9fa48("131031", "131032", "131033"), replica.status || ReplicaStatus.ACTIVE);
          const replicaId = stryMutAct_9fa48("131036") ? replica.replica_id && replica.service_id : stryMutAct_9fa48("131035") ? false : stryMutAct_9fa48("131034") ? true : (stryCov_9fa48("131034", "131035", "131036"), replica.replica_id || replica.service_id);
          if (stryMutAct_9fa48("131038") ? false : stryMutAct_9fa48("131037") ? true : (stryCov_9fa48("131037", "131038"), this.moveStateProvider.hasPendingMove(replicaId))) {
            if (stryMutAct_9fa48("131039")) {
              {}
            } else {
              stryCov_9fa48("131039");
              continue;
            }
          }
          if (stryMutAct_9fa48("131041") ? false : stryMutAct_9fa48("131040") ? true : (stryCov_9fa48("131040", "131041"), replicasInRemoving.has(replicaId))) {
            if (stryMutAct_9fa48("131042")) {
              {}
            } else {
              stryCov_9fa48("131042");
              this.logger.debug(REBALANCER_LOG_MSG.SKIP_REMOVE_REMOVING, stryMutAct_9fa48("131043") ? {} : (stryCov_9fa48("131043"), {
                entityId: this.entityId,
                replicaId
              }));
              continue;
            }
          }
          if (stryMutAct_9fa48("131046") ? status !== ReplicaStatus.FAILED : stryMutAct_9fa48("131045") ? false : stryMutAct_9fa48("131044") ? true : (stryCov_9fa48("131044", "131045", "131046"), status === ReplicaStatus.FAILED)) {
            if (stryMutAct_9fa48("131047")) {
              {}
            } else {
              stryCov_9fa48("131047");
              moves.push(stryMutAct_9fa48("131048") ? {} : (stryCov_9fa48("131048"), {
                type: MoveType.REMOVE,
                replicaId,
                nodeId: replica.node_id,
                reason: MOVE_REASON.REPLICA_FAILED
              }));
            }
          }
        }
      }

      // Group active placement replicas by node for removal selection
      const replicasByNode = new Map();
      for (const replica of activePlacementReplicas) {
        if (stryMutAct_9fa48("131049")) {
          {}
        } else {
          stryCov_9fa48("131049");
          if (stryMutAct_9fa48("131052") ? replica || replica.node_id : stryMutAct_9fa48("131051") ? false : stryMutAct_9fa48("131050") ? true : (stryCov_9fa48("131050", "131051", "131052"), replica && replica.node_id)) {
            if (stryMutAct_9fa48("131053")) {
              {}
            } else {
              stryCov_9fa48("131053");
              if (stryMutAct_9fa48("131056") ? false : stryMutAct_9fa48("131055") ? true : stryMutAct_9fa48("131054") ? replicasByNode.has(replica.node_id) : (stryCov_9fa48("131054", "131055", "131056"), !replicasByNode.has(replica.node_id))) {
                if (stryMutAct_9fa48("131057")) {
                  {}
                } else {
                  stryCov_9fa48("131057");
                  replicasByNode.set(replica.node_id, stryMutAct_9fa48("131058") ? ["Stryker was here"] : (stryCov_9fa48("131058"), []));
                }
              }
              replicasByNode.get(replica.node_id).push(replica);
            }
          }
        }
      }

      // Generate ADD moves for under-represented nodes FIRST
      const addMoves = stryMutAct_9fa48("131059") ? ["Stryker was here"] : (stryCov_9fa48("131059"), []);
      const replaceMoves = stryMutAct_9fa48("131060") ? ["Stryker was here"] : (stryCov_9fa48("131060"), []);
      if (stryMutAct_9fa48("131063") ? false : stryMutAct_9fa48("131062") ? true : stryMutAct_9fa48("131061") ? cleanupOnlyWhilePending : (stryCov_9fa48("131061", "131062", "131063"), !cleanupOnlyWhilePending)) {
        if (stryMutAct_9fa48("131064")) {
          {}
        } else {
          stryCov_9fa48("131064");
          for (const [nodeId, targetCount] of targetCounts) {
            if (stryMutAct_9fa48("131065")) {
              {}
            } else {
              stryCov_9fa48("131065");
              if (stryMutAct_9fa48("131067") ? false : stryMutAct_9fa48("131066") ? true : (stryCov_9fa48("131066", "131067"), this.moveStateProvider.hasPendingAddForNode(nodeId))) {
                if (stryMutAct_9fa48("131068")) {
                  {}
                } else {
                  stryCov_9fa48("131068");
                  continue;
                }
              }
              if (stryMutAct_9fa48("131070") ? false : stryMutAct_9fa48("131069") ? true : (stryCov_9fa48("131069", "131070"), nodesWithAddTransitional.has(nodeId))) {
                if (stryMutAct_9fa48("131071")) {
                  {}
                } else {
                  stryCov_9fa48("131071");
                  this.logger.debug(REBALANCER_LOG_MSG.SKIP_ADD_TRANSITIONAL, stryMutAct_9fa48("131072") ? {} : (stryCov_9fa48("131072"), {
                    entityId: this.entityId,
                    nodeId
                  }));
                  continue;
                }
              }
              const currentCount = stryMutAct_9fa48("131075") ? currentCounts.get(nodeId) && NUM.ZERO : stryMutAct_9fa48("131074") ? false : stryMutAct_9fa48("131073") ? true : (stryCov_9fa48("131073", "131074", "131075"), currentCounts.get(nodeId) || NUM.ZERO);
              const needed = stryMutAct_9fa48("131076") ? targetCount + currentCount : (stryCov_9fa48("131076"), targetCount - currentCount);
              for (let i = NUM.ZERO; stryMutAct_9fa48("131079") ? i >= needed : stryMutAct_9fa48("131078") ? i <= needed : stryMutAct_9fa48("131077") ? false : (stryCov_9fa48("131077", "131078", "131079"), i < needed); stryMutAct_9fa48("131080") ? i-- : (stryCov_9fa48("131080"), i++)) {
                if (stryMutAct_9fa48("131081")) {
                  {}
                } else {
                  stryCov_9fa48("131081");
                  addMoves.push(stryMutAct_9fa48("131082") ? {} : (stryCov_9fa48("131082"), {
                    type: MoveType.ADD,
                    nodeId,
                    reason: MOVE_REASON.INCREASE_REPLICA_COUNT
                  }));
                }
              }
            }
          }
        }
      }
      const targetReplicaCount = targetState.targetReplicaCount;
      const shouldDeferAddsInDegraded = stryMutAct_9fa48("131085") ? isDegradedPlacement && activePlacementReplicas.length >= targetReplicaCount || addMoves.length > NUM.ZERO : stryMutAct_9fa48("131084") ? false : stryMutAct_9fa48("131083") ? true : (stryCov_9fa48("131083", "131084", "131085"), (stryMutAct_9fa48("131087") ? isDegradedPlacement || activePlacementReplicas.length >= targetReplicaCount : stryMutAct_9fa48("131086") ? true : (stryCov_9fa48("131086", "131087"), isDegradedPlacement && (stryMutAct_9fa48("131090") ? activePlacementReplicas.length < targetReplicaCount : stryMutAct_9fa48("131089") ? activePlacementReplicas.length > targetReplicaCount : stryMutAct_9fa48("131088") ? true : (stryCov_9fa48("131088", "131089", "131090"), activePlacementReplicas.length >= targetReplicaCount)))) && (stryMutAct_9fa48("131093") ? addMoves.length <= NUM.ZERO : stryMutAct_9fa48("131092") ? addMoves.length >= NUM.ZERO : stryMutAct_9fa48("131091") ? true : (stryCov_9fa48("131091", "131092", "131093"), addMoves.length > NUM.ZERO)));
      const totalHealthyAfterAdds = stryMutAct_9fa48("131094") ? activePlacementReplicas.length - addMoves.length : (stryCov_9fa48("131094"), activePlacementReplicas.length + addMoves.length);
      const candidateRemoves = stryMutAct_9fa48("131095") ? ["Stryker was here"] : (stryCov_9fa48("131095"), []);

      // Generate REMOVE moves for over-represented nodes
      for (const [nodeId, replicas] of replicasByNode) {
        if (stryMutAct_9fa48("131096")) {
          {}
        } else {
          stryCov_9fa48("131096");
          const targetCount = stryMutAct_9fa48("131099") ? targetCounts.get(nodeId) && NUM.ZERO : stryMutAct_9fa48("131098") ? false : stryMutAct_9fa48("131097") ? true : (stryCov_9fa48("131097", "131098", "131099"), targetCounts.get(nodeId) || NUM.ZERO);
          const currentCount = replicas.length;
          const excess = stryMutAct_9fa48("131100") ? currentCount + targetCount : (stryCov_9fa48("131100"), currentCount - targetCount);
          for (let i = NUM.ZERO; stryMutAct_9fa48("131103") ? i >= excess : stryMutAct_9fa48("131102") ? i <= excess : stryMutAct_9fa48("131101") ? false : (stryCov_9fa48("131101", "131102", "131103"), i < excess); stryMutAct_9fa48("131104") ? i-- : (stryCov_9fa48("131104"), i++)) {
            if (stryMutAct_9fa48("131105")) {
              {}
            } else {
              stryCov_9fa48("131105");
              const replicaToRemove = replicas[i];
              const replicaId = stryMutAct_9fa48("131108") ? replicaToRemove.replica_id && replicaToRemove.service_id : stryMutAct_9fa48("131107") ? false : stryMutAct_9fa48("131106") ? true : (stryCov_9fa48("131106", "131107", "131108"), replicaToRemove.replica_id || replicaToRemove.service_id);
              if (stryMutAct_9fa48("131110") ? false : stryMutAct_9fa48("131109") ? true : (stryCov_9fa48("131109", "131110"), this.moveStateProvider.hasPendingMove(replicaId))) {
                if (stryMutAct_9fa48("131111")) {
                  {}
                } else {
                  stryCov_9fa48("131111");
                  continue;
                }
              }
              if (stryMutAct_9fa48("131113") ? false : stryMutAct_9fa48("131112") ? true : (stryCov_9fa48("131112", "131113"), replicasInRemoving.has(replicaId))) {
                if (stryMutAct_9fa48("131114")) {
                  {}
                } else {
                  stryCov_9fa48("131114");
                  this.logger.debug(REBALANCER_LOG_MSG.SKIP_REMOVE_REMOVING, stryMutAct_9fa48("131115") ? {} : (stryCov_9fa48("131115"), {
                    entityId: this.entityId,
                    replicaId
                  }));
                  continue;
                }
              }
              const reason = (stryMutAct_9fa48("131118") ? targetCount !== NUM.ZERO : stryMutAct_9fa48("131117") ? false : stryMutAct_9fa48("131116") ? true : (stryCov_9fa48("131116", "131117", "131118"), targetCount === NUM.ZERO)) ? MOVE_REASON.NODE_NOT_IN_TARGET : MOVE_REASON.SPREAD_REPLICAS;
              if (stryMutAct_9fa48("131121") ? cleanupOnlyWhilePending || isTopologyCleanupReason(reason) : stryMutAct_9fa48("131120") ? false : stryMutAct_9fa48("131119") ? true : (stryCov_9fa48("131119", "131120", "131121"), cleanupOnlyWhilePending && isTopologyCleanupReason(reason))) {
                if (stryMutAct_9fa48("131122")) {
                  {}
                } else {
                  stryCov_9fa48("131122");
                  const existingCleanupRemoves = stryMutAct_9fa48("131123") ? candidateRemoves.length : (stryCov_9fa48("131123"), candidateRemoves.filter(stryMutAct_9fa48("131124") ? () => undefined : (stryCov_9fa48("131124"), move => isTopologyCleanupReason(move.reason))).length);
                  if (stryMutAct_9fa48("131128") ? activePlacementReplicas.length - existingCleanupRemoves > targetReplicaCount : stryMutAct_9fa48("131127") ? activePlacementReplicas.length - existingCleanupRemoves < targetReplicaCount : stryMutAct_9fa48("131126") ? false : stryMutAct_9fa48("131125") ? true : (stryCov_9fa48("131125", "131126", "131127", "131128"), (stryMutAct_9fa48("131129") ? activePlacementReplicas.length + existingCleanupRemoves : (stryCov_9fa48("131129"), activePlacementReplicas.length - existingCleanupRemoves)) <= targetReplicaCount)) {
                    if (stryMutAct_9fa48("131130")) {
                      {}
                    } else {
                      stryCov_9fa48("131130");
                      this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, stryMutAct_9fa48("131131") ? {} : (stryCov_9fa48("131131"), {
                        entityId: this.entityId,
                        replicaId,
                        nodeId,
                        reason,
                        cleanupOnlyWhilePending: stryMutAct_9fa48("131132") ? false : (stryCov_9fa48("131132"), true),
                        activePlacementReplicaCount: activePlacementReplicas.length,
                        existingCleanupRemoves,
                        targetReplicaCount
                      }));
                      continue;
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("131135") ? isDegradedPlacement || !shouldDeferAddsInDegraded : stryMutAct_9fa48("131134") ? false : stryMutAct_9fa48("131133") ? true : (stryCov_9fa48("131133", "131134", "131135"), isDegradedPlacement && (stryMutAct_9fa48("131136") ? shouldDeferAddsInDegraded : (stryCov_9fa48("131136"), !shouldDeferAddsInDegraded)))) {
                if (stryMutAct_9fa48("131137")) {
                  {}
                } else {
                  stryCov_9fa48("131137");
                  this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, stryMutAct_9fa48("131138") ? {} : (stryCov_9fa48("131138"), {
                    entityId: this.entityId,
                    replicaId,
                    nodeId,
                    reason,
                    degraded: stryMutAct_9fa48("131139") ? false : (stryCov_9fa48("131139"), true),
                    availableNodeCount: stryMutAct_9fa48("131142") ? targetState.availableNodeCount && NUM.ZERO : stryMutAct_9fa48("131141") ? false : stryMutAct_9fa48("131140") ? true : (stryCov_9fa48("131140", "131141", "131142"), targetState.availableNodeCount || NUM.ZERO),
                    targetReplicaCount
                  }));
                  continue;
                }
              }
              if (stryMutAct_9fa48("131145") ? addMoves.length === NUM.ZERO && this.isControlPlanePriorityPartition() || reason === MOVE_REASON.NODE_NOT_IN_TARGET || reason === MOVE_REASON.SPREAD_REPLICAS : stryMutAct_9fa48("131144") ? false : stryMutAct_9fa48("131143") ? true : (stryCov_9fa48("131143", "131144", "131145"), (stryMutAct_9fa48("131147") ? addMoves.length === NUM.ZERO || this.isControlPlanePriorityPartition() : stryMutAct_9fa48("131146") ? true : (stryCov_9fa48("131146", "131147"), (stryMutAct_9fa48("131149") ? addMoves.length !== NUM.ZERO : stryMutAct_9fa48("131148") ? true : (stryCov_9fa48("131148", "131149"), addMoves.length === NUM.ZERO)) && this.isControlPlanePriorityPartition())) && (stryMutAct_9fa48("131151") ? reason === MOVE_REASON.NODE_NOT_IN_TARGET && reason === MOVE_REASON.SPREAD_REPLICAS : stryMutAct_9fa48("131150") ? true : (stryCov_9fa48("131150", "131151"), (stryMutAct_9fa48("131153") ? reason !== MOVE_REASON.NODE_NOT_IN_TARGET : stryMutAct_9fa48("131152") ? false : (stryCov_9fa48("131152", "131153"), reason === MOVE_REASON.NODE_NOT_IN_TARGET)) || (stryMutAct_9fa48("131155") ? reason !== MOVE_REASON.SPREAD_REPLICAS : stryMutAct_9fa48("131154") ? false : (stryCov_9fa48("131154", "131155"), reason === MOVE_REASON.SPREAD_REPLICAS)))))) {
                if (stryMutAct_9fa48("131156")) {
                  {}
                } else {
                  stryCov_9fa48("131156");
                  const remainingActiveReplicas = stryMutAct_9fa48("131157") ? activePlacementReplicas : (stryCov_9fa48("131157"), activePlacementReplicas.filter(candidate => {
                    if (stryMutAct_9fa48("131158")) {
                      {}
                    } else {
                      stryCov_9fa48("131158");
                      const candidateReplicaId = stryMutAct_9fa48("131161") ? candidate?.replica_id && candidate?.service_id : stryMutAct_9fa48("131160") ? false : stryMutAct_9fa48("131159") ? true : (stryCov_9fa48("131159", "131160", "131161"), (stryMutAct_9fa48("131162") ? candidate.replica_id : (stryCov_9fa48("131162"), candidate?.replica_id)) || (stryMutAct_9fa48("131163") ? candidate.service_id : (stryCov_9fa48("131163"), candidate?.service_id)));
                      return stryMutAct_9fa48("131166") ? candidateReplicaId === replicaId : stryMutAct_9fa48("131165") ? false : stryMutAct_9fa48("131164") ? true : (stryCov_9fa48("131164", "131165", "131166"), candidateReplicaId !== replicaId);
                    }
                  }));
                  const prioritySpreadAfterRemove = this.analyzePrioritySpread(remainingActiveReplicas, prioritySpreadPolicy, this.moveStateProvider.getAvailableNodes());
                  if (stryMutAct_9fa48("131169") ? prioritySpreadAfterRemove.requiresSpread === true || prioritySpreadAfterRemove.satisfied !== true : stryMutAct_9fa48("131168") ? false : stryMutAct_9fa48("131167") ? true : (stryCov_9fa48("131167", "131168", "131169"), (stryMutAct_9fa48("131171") ? prioritySpreadAfterRemove.requiresSpread !== true : stryMutAct_9fa48("131170") ? true : (stryCov_9fa48("131170", "131171"), prioritySpreadAfterRemove.requiresSpread === (stryMutAct_9fa48("131172") ? false : (stryCov_9fa48("131172"), true)))) && (stryMutAct_9fa48("131174") ? prioritySpreadAfterRemove.satisfied === true : stryMutAct_9fa48("131173") ? true : (stryCov_9fa48("131173", "131174"), prioritySpreadAfterRemove.satisfied !== (stryMutAct_9fa48("131175") ? false : (stryCov_9fa48("131175"), true)))))) {
                    if (stryMutAct_9fa48("131176")) {
                      {}
                    } else {
                      stryCov_9fa48("131176");
                      this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, stryMutAct_9fa48("131177") ? {} : (stryCov_9fa48("131177"), {
                        entityId: this.entityId,
                        replicaId,
                        nodeId,
                        reason,
                        requiredDistinctNodeCount: prioritySpreadAfterRemove.requiredDistinctNodeCount,
                        remainingDistinctNodeCount: prioritySpreadAfterRemove.actualDistinctNodeCount
                      }));
                      continue;
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("131180") ? reason !== MOVE_REASON.SPREAD_REPLICAS : stryMutAct_9fa48("131179") ? false : stryMutAct_9fa48("131178") ? true : (stryCov_9fa48("131178", "131179", "131180"), reason === MOVE_REASON.SPREAD_REPLICAS)) {
                if (stryMutAct_9fa48("131181")) {
                  {}
                } else {
                  stryCov_9fa48("131181");
                  const existingRemoves = stryMutAct_9fa48("131182") ? candidateRemoves.length : (stryCov_9fa48("131182"), candidateRemoves.filter(stryMutAct_9fa48("131183") ? () => undefined : (stryCov_9fa48("131183"), m => stryMutAct_9fa48("131186") ? m.reason !== MOVE_REASON.SPREAD_REPLICAS : stryMutAct_9fa48("131185") ? false : stryMutAct_9fa48("131184") ? true : (stryCov_9fa48("131184", "131185", "131186"), m.reason === MOVE_REASON.SPREAD_REPLICAS))).length);
                  if (stryMutAct_9fa48("131190") ? totalHealthyAfterAdds - existingRemoves > targetReplicaCount : stryMutAct_9fa48("131189") ? totalHealthyAfterAdds - existingRemoves < targetReplicaCount : stryMutAct_9fa48("131188") ? false : stryMutAct_9fa48("131187") ? true : (stryCov_9fa48("131187", "131188", "131189", "131190"), (stryMutAct_9fa48("131191") ? totalHealthyAfterAdds + existingRemoves : (stryCov_9fa48("131191"), totalHealthyAfterAdds - existingRemoves)) <= targetReplicaCount)) {
                    if (stryMutAct_9fa48("131192")) {
                      {}
                    } else {
                      stryCov_9fa48("131192");
                      this.logger.debug(REBALANCER_LOG_MSG.DEFER_REMOVE_DETAIL, stryMutAct_9fa48("131193") ? {} : (stryCov_9fa48("131193"), {
                        entityId: this.entityId,
                        replicaId,
                        nodeId,
                        totalHealthyAfterAdds,
                        existingRemoves,
                        targetReplicaCount
                      }));
                      continue;
                    }
                  }
                }
              }
              candidateRemoves.push(stryMutAct_9fa48("131194") ? {} : (stryCov_9fa48("131194"), {
                type: MoveType.REMOVE,
                replicaId,
                nodeId: nodeId,
                reason,
                standaloneSafe: stryMutAct_9fa48("131198") ? activePlacementReplicas.length - candidateRemoves.length <= targetReplicaCount : stryMutAct_9fa48("131197") ? activePlacementReplicas.length - candidateRemoves.length >= targetReplicaCount : stryMutAct_9fa48("131196") ? false : stryMutAct_9fa48("131195") ? true : (stryCov_9fa48("131195", "131196", "131197", "131198"), (stryMutAct_9fa48("131199") ? activePlacementReplicas.length + candidateRemoves.length : (stryCov_9fa48("131199"), activePlacementReplicas.length - candidateRemoves.length)) > targetReplicaCount)
              }));
            }
          }
        }
      }
      const canUseDegradedReplace = stryMutAct_9fa48("131202") ? isDegradedPlacement && shouldDeferAddsInDegraded || candidateRemoves.length > NUM.ZERO : stryMutAct_9fa48("131201") ? false : stryMutAct_9fa48("131200") ? true : (stryCov_9fa48("131200", "131201", "131202"), (stryMutAct_9fa48("131204") ? isDegradedPlacement || shouldDeferAddsInDegraded : stryMutAct_9fa48("131203") ? true : (stryCov_9fa48("131203", "131204"), isDegradedPlacement && shouldDeferAddsInDegraded)) && (stryMutAct_9fa48("131207") ? candidateRemoves.length <= NUM.ZERO : stryMutAct_9fa48("131206") ? candidateRemoves.length >= NUM.ZERO : stryMutAct_9fa48("131205") ? true : (stryCov_9fa48("131205", "131206", "131207"), candidateRemoves.length > NUM.ZERO)));
      if (stryMutAct_9fa48("131210") ? shouldDeferAddsInDegraded || !canUseDegradedReplace : stryMutAct_9fa48("131209") ? false : stryMutAct_9fa48("131208") ? true : (stryCov_9fa48("131208", "131209", "131210"), shouldDeferAddsInDegraded && (stryMutAct_9fa48("131211") ? canUseDegradedReplace : (stryCov_9fa48("131211"), !canUseDegradedReplace)))) {
        if (stryMutAct_9fa48("131212")) {
          {}
        } else {
          stryCov_9fa48("131212");
          this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, stryMutAct_9fa48("131213") ? {} : (stryCov_9fa48("131213"), {
            entityId: this.entityId,
            healthyReplicaCount: healthyReplicas.length,
            activePlacementReplicaCount: activePlacementReplicas.length,
            targetReplicaCount,
            deferredAddCount: addMoves.length,
            availableNodeCount: stryMutAct_9fa48("131216") ? targetState.availableNodeCount && NUM.ZERO : stryMutAct_9fa48("131215") ? false : stryMutAct_9fa48("131214") ? true : (stryCov_9fa48("131214", "131215", "131216"), targetState.availableNodeCount || NUM.ZERO)
          }));
          addMoves.length = NUM.ZERO;
        }
      }
      if (stryMutAct_9fa48("131219") ? addMoves.length > NUM.ZERO && candidateRemoves.length > NUM.ZERO || !isDegradedPlacement || canUseDegradedReplace : stryMutAct_9fa48("131218") ? false : stryMutAct_9fa48("131217") ? true : (stryCov_9fa48("131217", "131218", "131219"), (stryMutAct_9fa48("131221") ? addMoves.length > NUM.ZERO || candidateRemoves.length > NUM.ZERO : stryMutAct_9fa48("131220") ? true : (stryCov_9fa48("131220", "131221"), (stryMutAct_9fa48("131224") ? addMoves.length <= NUM.ZERO : stryMutAct_9fa48("131223") ? addMoves.length >= NUM.ZERO : stryMutAct_9fa48("131222") ? true : (stryCov_9fa48("131222", "131223", "131224"), addMoves.length > NUM.ZERO)) && (stryMutAct_9fa48("131227") ? candidateRemoves.length <= NUM.ZERO : stryMutAct_9fa48("131226") ? candidateRemoves.length >= NUM.ZERO : stryMutAct_9fa48("131225") ? true : (stryCov_9fa48("131225", "131226", "131227"), candidateRemoves.length > NUM.ZERO)))) && (stryMutAct_9fa48("131229") ? !isDegradedPlacement && canUseDegradedReplace : stryMutAct_9fa48("131228") ? true : (stryCov_9fa48("131228", "131229"), (stryMutAct_9fa48("131230") ? isDegradedPlacement : (stryCov_9fa48("131230"), !isDegradedPlacement)) || canUseDegradedReplace)))) {
        if (stryMutAct_9fa48("131231")) {
          {}
        } else {
          stryCov_9fa48("131231");
          const replaceCandidates = stryMutAct_9fa48("131232") ? candidateRemoves : (stryCov_9fa48("131232"), candidateRemoves.filter(move => {
            if (stryMutAct_9fa48("131233")) {
              {}
            } else {
              stryCov_9fa48("131233");
              return stryMutAct_9fa48("131236") ? move.reason === MOVE_REASON.NODE_NOT_IN_TARGET && move.reason === MOVE_REASON.SPREAD_REPLICAS : stryMutAct_9fa48("131235") ? false : stryMutAct_9fa48("131234") ? true : (stryCov_9fa48("131234", "131235", "131236"), (stryMutAct_9fa48("131238") ? move.reason !== MOVE_REASON.NODE_NOT_IN_TARGET : stryMutAct_9fa48("131237") ? false : (stryCov_9fa48("131237", "131238"), move.reason === MOVE_REASON.NODE_NOT_IN_TARGET)) || (stryMutAct_9fa48("131240") ? move.reason !== MOVE_REASON.SPREAD_REPLICAS : stryMutAct_9fa48("131239") ? false : (stryCov_9fa48("131239", "131240"), move.reason === MOVE_REASON.SPREAD_REPLICAS)));
            }
          }));
          const replaceCount = stryMutAct_9fa48("131241") ? Math.max(addMoves.length, replaceCandidates.length) : (stryCov_9fa48("131241"), Math.min(addMoves.length, replaceCandidates.length));
          const consumedRemoveReplicaIds = new Set();
          for (let i = NUM.ZERO; stryMutAct_9fa48("131244") ? i >= replaceCount : stryMutAct_9fa48("131243") ? i <= replaceCount : stryMutAct_9fa48("131242") ? false : (stryCov_9fa48("131242", "131243", "131244"), i < replaceCount); stryMutAct_9fa48("131245") ? i-- : (stryCov_9fa48("131245"), i++)) {
            if (stryMutAct_9fa48("131246")) {
              {}
            } else {
              stryCov_9fa48("131246");
              const addMove = addMoves.shift();
              const removeMove = replaceCandidates[i];
              consumedRemoveReplicaIds.add(removeMove.replicaId);
              replaceMoves.push(stryMutAct_9fa48("131247") ? {} : (stryCov_9fa48("131247"), {
                type: MoveType.REPLACE,
                nodeId: addMove.nodeId,
                sourceNodeId: removeMove.nodeId,
                replicaId: removeMove.replicaId,
                reason: MOVE_REASON.REPLACE_REPLICA
              }));
            }
          }
          if (stryMutAct_9fa48("131250") ? false : stryMutAct_9fa48("131249") ? true : stryMutAct_9fa48("131248") ? isDegradedPlacement : (stryCov_9fa48("131248", "131249", "131250"), !isDegradedPlacement)) {
            if (stryMutAct_9fa48("131251")) {
              {}
            } else {
              stryCov_9fa48("131251");
              moves.push(...(stryMutAct_9fa48("131252") ? candidateRemoves : (stryCov_9fa48("131252"), candidateRemoves.filter(move => {
                if (stryMutAct_9fa48("131253")) {
                  {}
                } else {
                  stryCov_9fa48("131253");
                  return stryMutAct_9fa48("131254") ? consumedRemoveReplicaIds.has(move.replicaId) : (stryCov_9fa48("131254"), !consumedRemoveReplicaIds.has(move.replicaId));
                }
              }))));
            }
          } else {
            if (stryMutAct_9fa48("131255")) {
              {}
            } else {
              stryCov_9fa48("131255");
              const deferredAddCount = addMoves.length;
              if (stryMutAct_9fa48("131259") ? deferredAddCount <= NUM.ZERO : stryMutAct_9fa48("131258") ? deferredAddCount >= NUM.ZERO : stryMutAct_9fa48("131257") ? false : stryMutAct_9fa48("131256") ? true : (stryCov_9fa48("131256", "131257", "131258", "131259"), deferredAddCount > NUM.ZERO)) {
                if (stryMutAct_9fa48("131260")) {
                  {}
                } else {
                  stryCov_9fa48("131260");
                  this.logger.debug(REBALANCER_LOG_MSG.DEFER_ADD_DEGRADED, stryMutAct_9fa48("131261") ? {} : (stryCov_9fa48("131261"), {
                    entityId: this.entityId,
                    healthyReplicaCount: healthyReplicas.length,
                    activePlacementReplicaCount: activePlacementReplicas.length,
                    targetReplicaCount,
                    deferredAddCount,
                    replaceMoveCount: replaceMoves.length,
                    availableNodeCount: stryMutAct_9fa48("131264") ? targetState.availableNodeCount && NUM.ZERO : stryMutAct_9fa48("131263") ? false : stryMutAct_9fa48("131262") ? true : (stryCov_9fa48("131262", "131263", "131264"), targetState.availableNodeCount || NUM.ZERO)
                  }));
                }
              }
              addMoves.length = NUM.ZERO;
            }
          }
        }
      } else {
        if (stryMutAct_9fa48("131265")) {
          {}
        } else {
          stryCov_9fa48("131265");
          moves.push(...candidateRemoves);
        }
      }

      // Add the ADD moves to the moves array
      moves.push(...addMoves);

      // If there are ADD moves, only include critical REMOVE moves.
      if (stryMutAct_9fa48("131269") ? addMoves.length <= NUM.ZERO : stryMutAct_9fa48("131268") ? addMoves.length >= NUM.ZERO : stryMutAct_9fa48("131267") ? false : stryMutAct_9fa48("131266") ? true : (stryCov_9fa48("131266", "131267", "131268", "131269"), addMoves.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("131270")) {
          {}
        } else {
          stryCov_9fa48("131270");
          const criticalRemoves = stryMutAct_9fa48("131271") ? moves : (stryCov_9fa48("131271"), moves.filter(stryMutAct_9fa48("131272") ? () => undefined : (stryCov_9fa48("131272"), m => stryMutAct_9fa48("131275") ? m.type === MoveType.REMOVE || m.reason === MOVE_REASON.REPLICA_FAILED || !isDegradedPlacement && m.reason === MOVE_REASON.NODE_NOT_IN_TARGET : stryMutAct_9fa48("131274") ? false : stryMutAct_9fa48("131273") ? true : (stryCov_9fa48("131273", "131274", "131275"), (stryMutAct_9fa48("131277") ? m.type !== MoveType.REMOVE : stryMutAct_9fa48("131276") ? true : (stryCov_9fa48("131276", "131277"), m.type === MoveType.REMOVE)) && (stryMutAct_9fa48("131279") ? m.reason === MOVE_REASON.REPLICA_FAILED && !isDegradedPlacement && m.reason === MOVE_REASON.NODE_NOT_IN_TARGET : stryMutAct_9fa48("131278") ? true : (stryCov_9fa48("131278", "131279"), (stryMutAct_9fa48("131281") ? m.reason !== MOVE_REASON.REPLICA_FAILED : stryMutAct_9fa48("131280") ? false : (stryCov_9fa48("131280", "131281"), m.reason === MOVE_REASON.REPLICA_FAILED)) || (stryMutAct_9fa48("131283") ? !isDegradedPlacement || m.reason === MOVE_REASON.NODE_NOT_IN_TARGET : stryMutAct_9fa48("131282") ? false : (stryCov_9fa48("131282", "131283"), (stryMutAct_9fa48("131284") ? isDegradedPlacement : (stryCov_9fa48("131284"), !isDegradedPlacement)) && (stryMutAct_9fa48("131286") ? m.reason !== MOVE_REASON.NODE_NOT_IN_TARGET : stryMutAct_9fa48("131285") ? true : (stryCov_9fa48("131285", "131286"), m.reason === MOVE_REASON.NODE_NOT_IN_TARGET))))))))));
          const filteredMoves = stryMutAct_9fa48("131287") ? [] : (stryCov_9fa48("131287"), [...replaceMoves, ...addMoves, ...criticalRemoves]);
          const deferredCount = stryMutAct_9fa48("131288") ? moves.length : (stryCov_9fa48("131288"), moves.filter(stryMutAct_9fa48("131289") ? () => undefined : (stryCov_9fa48("131289"), m => stryMutAct_9fa48("131292") ? m.type === MoveType.REMOVE && m.reason !== MOVE_REASON.REPLICA_FAILED || m.reason !== MOVE_REASON.NODE_NOT_IN_TARGET : stryMutAct_9fa48("131291") ? false : stryMutAct_9fa48("131290") ? true : (stryCov_9fa48("131290", "131291", "131292"), (stryMutAct_9fa48("131294") ? m.type === MoveType.REMOVE || m.reason !== MOVE_REASON.REPLICA_FAILED : stryMutAct_9fa48("131293") ? true : (stryCov_9fa48("131293", "131294"), (stryMutAct_9fa48("131296") ? m.type !== MoveType.REMOVE : stryMutAct_9fa48("131295") ? true : (stryCov_9fa48("131295", "131296"), m.type === MoveType.REMOVE)) && (stryMutAct_9fa48("131298") ? m.reason === MOVE_REASON.REPLICA_FAILED : stryMutAct_9fa48("131297") ? true : (stryCov_9fa48("131297", "131298"), m.reason !== MOVE_REASON.REPLICA_FAILED)))) && (stryMutAct_9fa48("131300") ? m.reason === MOVE_REASON.NODE_NOT_IN_TARGET : stryMutAct_9fa48("131299") ? true : (stryCov_9fa48("131299", "131300"), m.reason !== MOVE_REASON.NODE_NOT_IN_TARGET))))).length);
          if (stryMutAct_9fa48("131303") ? criticalRemoves.length > NUM.ZERO && deferredCount > NUM.ZERO : stryMutAct_9fa48("131302") ? false : stryMutAct_9fa48("131301") ? true : (stryCov_9fa48("131301", "131302", "131303"), (stryMutAct_9fa48("131306") ? criticalRemoves.length <= NUM.ZERO : stryMutAct_9fa48("131305") ? criticalRemoves.length >= NUM.ZERO : stryMutAct_9fa48("131304") ? false : (stryCov_9fa48("131304", "131305", "131306"), criticalRemoves.length > NUM.ZERO)) || (stryMutAct_9fa48("131309") ? deferredCount <= NUM.ZERO : stryMutAct_9fa48("131308") ? deferredCount >= NUM.ZERO : stryMutAct_9fa48("131307") ? false : (stryCov_9fa48("131307", "131308", "131309"), deferredCount > NUM.ZERO)))) {
            if (stryMutAct_9fa48("131310")) {
              {}
            } else {
              stryCov_9fa48("131310");
              this.logger.info(REBALANCER_LOG_MSG.INCLUDE_CRITICAL_REMOVE, stryMutAct_9fa48("131311") ? {} : (stryCov_9fa48("131311"), {
                entityId: this.entityId,
                addMoveCount: addMoves.length,
                criticalRemoveCount: criticalRemoves.length,
                deferredRemoveCount: deferredCount
              }));
            }
          }
          return filteredMoves;
        }
      }

      // Include computed REPLACE and ADD moves.
      moves.push(...replaceMoves);
      moves.push(...addMoves);

      // Sort: failed REMOVE first, then REPLACE, then ADD, then REMOVE.
      stryMutAct_9fa48("131312") ? moves : (stryCov_9fa48("131312"), moves.sort((a, b) => {
        if (stryMutAct_9fa48("131313")) {
          {}
        } else {
          stryCov_9fa48("131313");
          const getPriority = move => {
            if (stryMutAct_9fa48("131314")) {
              {}
            } else {
              stryCov_9fa48("131314");
              if (stryMutAct_9fa48("131317") ? move.type === MoveType.REMOVE || move.reason === MOVE_REASON.REPLICA_FAILED : stryMutAct_9fa48("131316") ? false : stryMutAct_9fa48("131315") ? true : (stryCov_9fa48("131315", "131316", "131317"), (stryMutAct_9fa48("131319") ? move.type !== MoveType.REMOVE : stryMutAct_9fa48("131318") ? true : (stryCov_9fa48("131318", "131319"), move.type === MoveType.REMOVE)) && (stryMutAct_9fa48("131321") ? move.reason !== MOVE_REASON.REPLICA_FAILED : stryMutAct_9fa48("131320") ? true : (stryCov_9fa48("131320", "131321"), move.reason === MOVE_REASON.REPLICA_FAILED)))) {
                if (stryMutAct_9fa48("131322")) {
                  {}
                } else {
                  stryCov_9fa48("131322");
                  return NUM.ZERO;
                }
              }
              if (stryMutAct_9fa48("131325") ? move.type !== MoveType.REPLACE : stryMutAct_9fa48("131324") ? false : stryMutAct_9fa48("131323") ? true : (stryCov_9fa48("131323", "131324", "131325"), move.type === MoveType.REPLACE)) {
                if (stryMutAct_9fa48("131326")) {
                  {}
                } else {
                  stryCov_9fa48("131326");
                  return NUM.ONE;
                }
              }
              if (stryMutAct_9fa48("131329") ? move.type !== MoveType.ADD : stryMutAct_9fa48("131328") ? false : stryMutAct_9fa48("131327") ? true : (stryCov_9fa48("131327", "131328", "131329"), move.type === MoveType.ADD)) {
                if (stryMutAct_9fa48("131330")) {
                  {}
                } else {
                  stryCov_9fa48("131330");
                  return NUM.TWO;
                }
              }
              return NUM.THREE;
            }
          };
          return stryMutAct_9fa48("131331") ? getPriority(a) + getPriority(b) : (stryCov_9fa48("131331"), getPriority(a) - getPriority(b));
        }
      }));
      return moves;
    }
  }

  /**
   * Apply pressure-state gating to a list of computed moves.
   *
   * For each storage-increasing move (ADD, REPLACE) targeting a node:
   * - hard/exhausted: skip non-critical moves
   * - soft: mark non-critical moves with `reducedPriority`
   * - normal: pass through unchanged
   *
   * Critical moves (replica_failed, under-replication) always pass.
   *
   * Requirements: 8.2, 8.3
   *
   * @param {Array<Object>} moves - Raw moves from calculateMoves.
   * @return {Promise<Array<Object>>} Filtered/annotated moves.
   */
  async applyPressureGating(moves) {
    if (stryMutAct_9fa48("131332")) {
      {}
    } else {
      stryCov_9fa48("131332");
      if (stryMutAct_9fa48("131335") ? moves.length !== NUM.ZERO : stryMutAct_9fa48("131334") ? false : stryMutAct_9fa48("131333") ? true : (stryCov_9fa48("131333", "131334", "131335"), moves.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("131336")) {
          {}
        } else {
          stryCov_9fa48("131336");
          return moves;
        }
      }
      if (stryMutAct_9fa48("131339") ? !this.storagePressureBehavior && typeof this.storagePressureBehavior.shouldAllowMove !== MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("131338") ? false : stryMutAct_9fa48("131337") ? true : (stryCov_9fa48("131337", "131338", "131339"), (stryMutAct_9fa48("131340") ? this.storagePressureBehavior : (stryCov_9fa48("131340"), !this.storagePressureBehavior)) || (stryMutAct_9fa48("131342") ? typeof this.storagePressureBehavior.shouldAllowMove === MOVE_PLANNER_LITERAL.FUNCTION : stryMutAct_9fa48("131341") ? false : (stryCov_9fa48("131341", "131342"), typeof this.storagePressureBehavior.shouldAllowMove !== MOVE_PLANNER_LITERAL.FUNCTION)))) {
        if (stryMutAct_9fa48("131343")) {
          {}
        } else {
          stryCov_9fa48("131343");
          if (stryMutAct_9fa48("131345") ? false : stryMutAct_9fa48("131344") ? true : (stryCov_9fa48("131344", "131345"), this.strictOwnerDependencies)) {
            if (stryMutAct_9fa48("131346")) {
              {}
            } else {
              stryCov_9fa48("131346");
              throw new Error((stryMutAct_9fa48("131347") ? this.storagePressureBehavior : (stryCov_9fa48("131347"), !this.storagePressureBehavior)) ? MOVE_PLANNER_ERROR_MSG.STORAGE_PRESSURE_BEHAVIOR_REQUIRED : MOVE_PLANNER_ERROR_MSG.STORAGE_PRESSURE_BEHAVIOR_CHECK_REQUIRED);
            }
          }
          return moves;
        }
      }
      const result = stryMutAct_9fa48("131348") ? ["Stryker was here"] : (stryCov_9fa48("131348"), []);
      for (const move of moves) {
        if (stryMutAct_9fa48("131349")) {
          {}
        } else {
          stryCov_9fa48("131349");
          const targetNodeId = move.nodeId;

          // REMOVE moves are not storage-increasing — pass through
          if (stryMutAct_9fa48("131352") ? move.type !== MoveType.REMOVE : stryMutAct_9fa48("131351") ? false : stryMutAct_9fa48("131350") ? true : (stryCov_9fa48("131350", "131351", "131352"), move.type === MoveType.REMOVE)) {
            if (stryMutAct_9fa48("131353")) {
              {}
            } else {
              stryCov_9fa48("131353");
              result.push(move);
              continue;
            }
          }
          const criticality = this.classifyMoveCriticality(move);
          const check = await this.storagePressureBehavior.shouldAllowMove(targetNodeId, criticality);
          if (stryMutAct_9fa48("131356") ? check.decision !== PRESSURE_BEHAVIOR_DECISION.DENY : stryMutAct_9fa48("131355") ? false : stryMutAct_9fa48("131354") ? true : (stryCov_9fa48("131354", "131355", "131356"), check.decision === PRESSURE_BEHAVIOR_DECISION.DENY)) {
            if (stryMutAct_9fa48("131357")) {
              {}
            } else {
              stryCov_9fa48("131357");
              this.logger.info(STORAGE_CAPACITY_LOG_MSG.CAPACITY_FILTER_REJECTED, stryMutAct_9fa48("131358") ? {} : (stryCov_9fa48("131358"), {
                entityId: this.entityId,
                nodeId: targetNodeId,
                moveType: move.type,
                reason: move.reason,
                pressureState: check.pressureState,
                criticality
              }));
              continue;
            }
          }
          if (stryMutAct_9fa48("131361") ? check.decision !== PRESSURE_BEHAVIOR_DECISION.ALLOW_REDUCED_PRIORITY : stryMutAct_9fa48("131360") ? false : stryMutAct_9fa48("131359") ? true : (stryCov_9fa48("131359", "131360", "131361"), check.decision === PRESSURE_BEHAVIOR_DECISION.ALLOW_REDUCED_PRIORITY)) {
            if (stryMutAct_9fa48("131362")) {
              {}
            } else {
              stryCov_9fa48("131362");
              result.push(stryMutAct_9fa48("131363") ? {} : (stryCov_9fa48("131363"), {
                ...move,
                reducedPriority: stryMutAct_9fa48("131364") ? false : (stryCov_9fa48("131364"), true)
              }));
              continue;
            }
          }
          result.push(move);
        }
      }
      return result;
    }
  }

  /**
   * Classify a move as critical or non-critical.
   *
   * Critical moves are correctness-preserving operations that must
   * proceed even under pressure (e.g. replacing a failed replica,
   * increasing replica count to meet minimum).
   *
   * @param {Object} move
   * @return {string} MOVE_CRITICALITY value
   * @private
   */
  classifyMoveCriticality(move) {
    if (stryMutAct_9fa48("131365")) {
      {}
    } else {
      stryCov_9fa48("131365");
      if (stryMutAct_9fa48("131368") ? move.reason === MOVE_REASON.REPLICA_FAILED && move.reason === MOVE_REASON.INCREASE_REPLICA_COUNT : stryMutAct_9fa48("131367") ? false : stryMutAct_9fa48("131366") ? true : (stryCov_9fa48("131366", "131367", "131368"), (stryMutAct_9fa48("131370") ? move.reason !== MOVE_REASON.REPLICA_FAILED : stryMutAct_9fa48("131369") ? false : (stryCov_9fa48("131369", "131370"), move.reason === MOVE_REASON.REPLICA_FAILED)) || (stryMutAct_9fa48("131372") ? move.reason !== MOVE_REASON.INCREASE_REPLICA_COUNT : stryMutAct_9fa48("131371") ? false : (stryCov_9fa48("131371", "131372"), move.reason === MOVE_REASON.INCREASE_REPLICA_COUNT)))) {
        if (stryMutAct_9fa48("131373")) {
          {}
        } else {
          stryCov_9fa48("131373");
          return MOVE_CRITICALITY.CRITICAL;
        }
      }
      if (stryMutAct_9fa48("131376") ? this.isControlPlanePriorityPartition() || move.reason === MOVE_REASON.SPREAD_REPLICAS || move.reason === MOVE_REASON.REPLACE_REPLICA : stryMutAct_9fa48("131375") ? false : stryMutAct_9fa48("131374") ? true : (stryCov_9fa48("131374", "131375", "131376"), this.isControlPlanePriorityPartition() && (stryMutAct_9fa48("131378") ? move.reason === MOVE_REASON.SPREAD_REPLICAS && move.reason === MOVE_REASON.REPLACE_REPLICA : stryMutAct_9fa48("131377") ? true : (stryCov_9fa48("131377", "131378"), (stryMutAct_9fa48("131380") ? move.reason !== MOVE_REASON.SPREAD_REPLICAS : stryMutAct_9fa48("131379") ? false : (stryCov_9fa48("131379", "131380"), move.reason === MOVE_REASON.SPREAD_REPLICAS)) || (stryMutAct_9fa48("131382") ? move.reason !== MOVE_REASON.REPLACE_REPLICA : stryMutAct_9fa48("131381") ? false : (stryCov_9fa48("131381", "131382"), move.reason === MOVE_REASON.REPLACE_REPLICA)))))) {
        if (stryMutAct_9fa48("131383")) {
          {}
        } else {
          stryCov_9fa48("131383");
          return MOVE_CRITICALITY.CRITICAL;
        }
      }
      return MOVE_CRITICALITY.NON_CRITICAL;
    }
  }
}
export { MovePlanner };