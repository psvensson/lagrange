import {registerRebalanceCoordinatorOperationOwnershipPriorityAdmissionTests} from './rebalance-coordinator-operation-ownership-priority-admission-test-cases.js';
import {registerRebalanceCoordinatorOperationOwnershipPriorityPlanningTests} from './rebalance-coordinator-operation-ownership-priority-planning-test-cases.js';
import {registerRebalanceCoordinatorOperationOwnershipTailMoreTests} from './rebalance-coordinator-operation-ownership-tail-more-test-cases.js';

export function registerRebalanceCoordinatorOperationOwnershipTailTests({
  test,
  assert,
  RebalanceCoordinator,
  WORKFLOW_STEP,
  REBALANCER_SKIP_REASON,
  DurableWorkflowCoordinator,
  buildPriorityRecoveryAdmissionPlan,
  OperationType,
  ReplicaStatus,
  EMERGENCY_TRANSPORT_PARTITION_ID,
  createWorkflowCoordinatorSpy,
  createStorageOwners,
  createTransactionCoordinator,
  createCoordinator,
  disablePersistenceConfirmation,
}) {
  registerRebalanceCoordinatorOperationOwnershipPriorityAdmissionTests({
    test,
    RebalanceCoordinator,
    WORKFLOW_STEP,
    REBALANCER_SKIP_REASON,
    OperationType,
    createWorkflowCoordinatorSpy,
    createStorageOwners,
    createTransactionCoordinator,
    createCoordinator,
    disablePersistenceConfirmation,
  });

  registerRebalanceCoordinatorOperationOwnershipPriorityPlanningTests({
    test,
    RebalanceCoordinator,
    WORKFLOW_STEP,
    buildPriorityRecoveryAdmissionPlan,
    OperationType,
    ReplicaStatus,
    createStorageOwners,
    createTransactionCoordinator,
  });

  registerRebalanceCoordinatorOperationOwnershipTailMoreTests({
    test,
    assert,
    RebalanceCoordinator,
    WORKFLOW_STEP,
    REBALANCER_SKIP_REASON,
    DurableWorkflowCoordinator,
    buildPriorityRecoveryAdmissionPlan,
    OperationType,
    ReplicaStatus,
    EMERGENCY_TRANSPORT_PARTITION_ID,
    createWorkflowCoordinatorSpy,
    createStorageOwners,
    createTransactionCoordinator,
    createCoordinator,
    disablePersistenceConfirmation,
  });
}
