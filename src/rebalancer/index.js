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

// Storage capacity budget registration
export {NodeStorageBudgetService} from './node-storage-budget-service.js';
// Storage capacity accounting
export {StorageCapacityAccountingService} from './storage-capacity-accounting-service.js';
// Storage admission gate
export {StorageAdmissionService} from './storage-admission-service.js';
// Storage pressure behavior
export {StoragePressureBehavior} from './storage-pressure-behavior.js';
// Storage capacity metrics
export {StorageCapacityMetrics} from './storage-capacity-metrics.js';
// Storage capacity migration
export {StorageCapacityMigration} from './storage-capacity-migration.js';

// Executor outcome emission (typed outcomes for single-writer cutover)
export {
  ExecutorOutcomeEmitter,
  buildExecutorOutcome,
  OUTCOME_EVENT_NAME,
} from './executor-outcome-emitter.js';
export {
  EXECUTOR_OUTCOME_TYPE,
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_ACTION,
  EXECUTOR_OUTCOME_ACTION_MAP,
  EXECUTOR_OUTCOME_LOG_MSG,
} from './executor-outcome-constants.js';

