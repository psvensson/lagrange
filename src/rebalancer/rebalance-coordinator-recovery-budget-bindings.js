import {
  checkTimeouts,
  getTimeoutForStep,
  reconcileTimeoutOperation,
  reconcileOperationProgress,
  handleExecutorOutcome,
  reconcileExecutorOutcome,
  handleRecovery,
  isPreSyncStep,
  reconcileRecoveryOperation,
  reconcileSyncingOperation,
  getObservedReplicaStatusFromCache,
  getActualReplicaStatus,
  emitReplicaStatusDivergence,
  getOperation,
  getAllOperations,
  getOperationsByPartition,
  getOperationsByEntity,
  getInFlightOperations,
} from './rebalance-coordinator-recovery-helper.js';
import {
  getConcurrentAddCount,
  getConcurrentAddCountByPriorityClass,
  getConcurrentRemoveCount,
  getAddBudgetOperationPartitionId,
  buildConcurrentAddCountByPriorityClass,
  addConcurrentPriorityBudgetOperation,
  appendConcurrentPriorityPartitionOperations,
  filterConcurrentAddBudgetOperations,
  buildPriorityPartitionAddBudgetAssessment,
  shouldIgnorePriorityPartitionAddBudgetByAdmissionPlan,
  resolveRequestedPriorityAddBudgetPartitionId,
  arePriorityPartitionAddBudgetOperationsPastWorkflowTimeout,
  isAddBudgetOperationPastWorkflowTimeout,
  isConcurrentAddBudgetOperation,
  executeReplicaOperationsRead,
  canStartAddOperation,
  canStartPriorityAddOperation,
  canStartRemoveOperation,
  shouldDelayEmptyIncompleteOperationQuery,
  markEmptyIncompleteOperationQueryAt,
  clearEmptyIncompleteOperationQueryDelay,
} from './rebalance-coordinator-priority-budget-helper.js';
import {
  isLocalRouterBackpressured,
  shouldPauseAdmissionReadForLocalRouterPressure,
  hasContainedPriorityRecoveryPressure,
  buildPriorityDeferredObservationPressureEvidence,
  shouldAllowPriorityRecoveryDeferredObservation,
  resolvePriorityRecoveryPlanningEvidence,
  buildPriorityAddAdmissionPressureEvidence,
  resolvePriorityAddAdmissionPressureAction,
  shouldPausePriorityAddAdmissionReadForLocalRouterPressure,
} from './rebalance-coordinator-pressure-helper.js';

class RebalanceCoordinatorRecoveryBudgetBindings {
  async checkTimeouts() {
    return checkTimeouts(this);
  }

  getTimeoutForStep(step, operation = null) {
    return getTimeoutForStep(this, step, operation);
  }

  async reconcileTimeoutOperation(operation, now) {
    return reconcileTimeoutOperation(this, operation, now);
  }

  async reconcileOperationProgress(operation) {
    return reconcileOperationProgress(this, operation);
  }

  handleExecutorOutcome(outcome) {
    return handleExecutorOutcome(this, outcome);
  }

  async reconcileExecutorOutcome(outcome) {
    return reconcileExecutorOutcome(this, outcome);
  }

  async handleRecovery() {
    return handleRecovery(this);
  }

  isPreSyncStep(step) {
    return isPreSyncStep(this, step);
  }

  async reconcileRecoveryOperation(op) {
    return reconcileRecoveryOperation(this, op);
  }

  async reconcileSyncingOperation(operation) {
    return reconcileSyncingOperation(this, operation);
  }

  getObservedReplicaStatusFromCache(
    replicaId,
    partitionId,
    targetNodeId,
    options = {},
  ) {
    return getObservedReplicaStatusFromCache(
      this,
      replicaId,
      partitionId,
      targetNodeId,
      options,
    );
  }

  async getActualReplicaStatus(replicaId, partitionId, targetNodeId) {
    return getActualReplicaStatus(this, replicaId, partitionId, targetNodeId);
  }

  emitReplicaStatusDivergence(replicaId, authoritativeStatus, reason) {
    return emitReplicaStatusDivergence(
      this,
      replicaId,
      authoritativeStatus,
      reason,
    );
  }

  async getOperation(operationId) {
    return getOperation(this, operationId);
  }

  async getAllOperations() {
    return getAllOperations(this);
  }

  async getOperationsByPartition(partitionId) {
    return getOperationsByPartition(this, partitionId);
  }

  async getOperationsByEntity(entityType, entityId, options = {}) {
    return getOperationsByEntity(this, entityType, entityId, options);
  }

  async getInFlightOperations() {
    return getInFlightOperations(this);
  }

  async getConcurrentAddCount(options = {}) {
    return getConcurrentAddCount(this, options);
  }

  getAddBudgetOperationPartitionId(operation = null) {
    return getAddBudgetOperationPartitionId(this, operation);
  }

  buildConcurrentAddCountByPriorityClass(operations = []) {
    return buildConcurrentAddCountByPriorityClass(this, operations);
  }

  addConcurrentPriorityBudgetOperation(
    priorityOperationsByPartitionId,
    operation,
  ) {
    return addConcurrentPriorityBudgetOperation(
      this,
      priorityOperationsByPartitionId,
      operation,
    );
  }

  async appendConcurrentPriorityPartitionOperations(
    filteredOperations,
    partitionId,
    partitionOperations,
    options = {},
  ) {
    return appendConcurrentPriorityPartitionOperations(
      this,
      filteredOperations,
      partitionId,
      partitionOperations,
      options,
    );
  }

  async filterConcurrentAddBudgetOperations(operations = [], options = {}) {
    return filterConcurrentAddBudgetOperations(this, operations, options);
  }

  async buildPriorityPartitionAddBudgetAssessment(
    partitionId,
    operations = [],
  ) {
    return buildPriorityPartitionAddBudgetAssessment(this, partitionId, operations);
  }

  shouldIgnorePriorityPartitionAddBudgetByAdmissionPlan(
    partitionId,
    partitionOperations = [],
    options = {},
  ) {
    return shouldIgnorePriorityPartitionAddBudgetByAdmissionPlan(
      this,
      partitionId,
      partitionOperations,
      options,
    );
  }

  resolveRequestedPriorityAddBudgetPartitionId(options = {}) {
    return resolveRequestedPriorityAddBudgetPartitionId(this, options);
  }

  arePriorityPartitionAddBudgetOperationsPastWorkflowTimeout(operations = []) {
    return arePriorityPartitionAddBudgetOperationsPastWorkflowTimeout(
      this,
      operations,
    );
  }

  isAddBudgetOperationPastWorkflowTimeout(operation = null) {
    return isAddBudgetOperationPastWorkflowTimeout(this, operation);
  }

  async getConcurrentAddCountByPriorityClass(options = {}) {
    return getConcurrentAddCountByPriorityClass(this, options);
  }

  isConcurrentAddBudgetOperation(operation) {
    return isConcurrentAddBudgetOperation(this, operation);
  }

  async getConcurrentRemoveCount(options = {}) {
    return getConcurrentRemoveCount(this, options);
  }

  async executeReplicaOperationsRead(sql, params = []) {
    return executeReplicaOperationsRead(this, sql, params);
  }

  async canStartAddOperation(options = {}) {
    return canStartAddOperation(this, options);
  }

  async canStartPriorityAddOperation(options = {}) {
    return canStartPriorityAddOperation(this, options);
  }

  async canStartRemoveOperation(options = {}) {
    return canStartRemoveOperation(this, options);
  }

  shouldDelayEmptyIncompleteOperationQuery(now = Date.now()) {
    return shouldDelayEmptyIncompleteOperationQuery(this, now);
  }

  markEmptyIncompleteOperationQueryAt(now = Date.now()) {
    return markEmptyIncompleteOperationQueryAt(this, now);
  }

  clearEmptyIncompleteOperationQueryDelay() {
    return clearEmptyIncompleteOperationQueryDelay(this);
  }

  isLocalRouterBackpressured(options = {}) {
    return isLocalRouterBackpressured(this, options);
  }

  shouldPauseAdmissionReadForLocalRouterPressure(options = {}) {
    return shouldPauseAdmissionReadForLocalRouterPressure(this, options);
  }

  hasContainedPriorityRecoveryPressure(partitionId = null) {
    return hasContainedPriorityRecoveryPressure(this, partitionId);
  }

  buildPriorityDeferredObservationPressureEvidence(options = {}) {
    return buildPriorityDeferredObservationPressureEvidence(this, options);
  }

  shouldAllowPriorityRecoveryDeferredObservation(
    partitionId = null,
    observation = null,
  ) {
    return shouldAllowPriorityRecoveryDeferredObservation(
      this,
      partitionId,
      observation,
    );
  }

  resolvePriorityRecoveryPlanningEvidence(partitionId) {
    return resolvePriorityRecoveryPlanningEvidence(this, partitionId);
  }

  buildPriorityAddAdmissionPressureEvidence(options = {}) {
    return buildPriorityAddAdmissionPressureEvidence(this, options);
  }

  resolvePriorityAddAdmissionPressureAction(options = {}) {
    return resolvePriorityAddAdmissionPressureAction(this, options);
  }

  shouldPausePriorityAddAdmissionReadForLocalRouterPressure(options = {}) {
    return shouldPausePriorityAddAdmissionReadForLocalRouterPressure(
      this,
      options,
    );
  }
}

function applyRebalanceCoordinatorRecoveryBudgetBindingMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorRecoveryBudgetBindings.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === 'constructor') {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyRebalanceCoordinatorRecoveryBudgetBindingMethods};
