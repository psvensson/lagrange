/**
 * Owner contract:
 * Owner: UnifiedRebalancer owns rebalance planning and execution orchestration.
 * Inputs: topology snapshots, policies, readiness, budgets, coordinator operations.
 * Canonical output: rebalance results and coordinator operation requests.
 * Prohibited fallbacks: no direct operation creation outside the coordinator owner.
 * Primary tests: test/rebalancer/unified-rebalancer.test.js.
 */
import {REBALANCER_DEFAULT_POLICY} from './rebalancer-constants.js';

export {
  UnifiedRebalancerCore as UnifiedRebalancer,
} from './unified-rebalancer-core.js';
export {
  REBALANCER_ENTITY_TYPE as EntityType,
  REBALANCER_MOVE_TYPE as MoveType,
  REBALANCER_NODE_STATUS as NodeStatus,
  REBALANCER_TRIGGER as TriggerType,
  REBALANCER_DEFAULT_POLICY,
} from './rebalancer-constants.js';
export {ReplicaStatus} from './replica-status.js';
export {
  adjustToOddCount,
  getNextOddCount,
  getPreviousOddCount,
  isOddReplicaCount,
} from './odd-replica-count.js';
export const DEFAULT_TABLE_POLICY = REBALANCER_DEFAULT_POLICY.TABLE;
export const DEFAULT_MESSAGE_GROUP_POLICY =
  REBALANCER_DEFAULT_POLICY.MESSAGE_GROUP;
