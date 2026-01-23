/**
 * Rebalancer module exports.
 */

export {
  UnifiedRebalancer,
  EntityType,
  TriggerType,
  MoveType,
  ReplicaStatus,
  NodeStatus,
  DEFAULT_TABLE_POLICY,
  DEFAULT_MESSAGE_GROUP_POLICY,
  isOddReplicaCount,
  adjustToOddCount,
  getNextOddCount,
  getPreviousOddCount,
} from './unified-rebalancer.js';

// Assignment Epoch (immutable versioned partition assignments)
export {
  AssignmentEpoch,
  EpochImmutabilityError,
  EpochValidationError,
} from './assignment-epoch.js';

// Assignment Epoch Manager (CAS-based epoch coordination)
export {
  AssignmentEpochManager,
  EpochMismatchError,
  StaleEpochError,
} from './assignment-epoch-manager.js';

// Unified replica status and operation types (new simplified architecture)
export {
  ReplicaStatus as UnifiedReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
  OperationType,
  ADD_WORKFLOW_STEPS,
  REMOVE_WORKFLOW_STEPS,
  getWorkflowSteps,
  isValidWorkflowStep,
  getNextWorkflowStep,
  isTerminalStep,
  createOperation,
  getAllStatusValues,
  isValidStatus,
} from './replica-status.js';

// RebalanceCoordinator (new simplified architecture)
export {RebalanceCoordinator} from './rebalance-coordinator.js';

// State-Aware Rebalancer (respects node lifecycle states)
export {StateAwareRebalancer} from './state-aware-rebalancer.js';
