import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';

const {
  CONTROL_PLANE_READINESS_DIMENSION,
  classifySystemPartition,
} = REBALANCE_COORDINATOR_SHARED;

class RebalanceCoordinatorOwnerFacade {
  /**
   * Ensure storage admission approves one storage-increasing workflow.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async ensureProvisioningAdmissionAllowed(context) {
    return this.provisioningAdmissionPolicy.ensureProvisioningAdmissionAllowed(
      context,
    );
  }

  /**
   * Evaluate storage admission for one storage-increasing move.
   * @param {Object} context
   * @return {Promise<Object>} Normalized evaluation output.
   * @private
   */
  async evaluateProvisioningAdmission(context) {
    return this.provisioningAdmissionPolicy.evaluateProvisioningAdmission(
      context,
    );
  }

  /**
   * Estimate replica bytes for admission decisions.
   * @param {string} entityType
   * @return {number}
   * @private
   */
  estimateProvisioningAdmissionBytes(entityType) {
    return this.provisioningAdmissionPolicy.estimateProvisioningAdmissionBytes(
      entityType,
    );
  }

  /**
   * Verify admission and accounting owners are available for storage-increasing moves.
   * @param {string} moveType
   * @return {void}
   * @private
   */
  assertProvisioningAdmissionDependencies(moveType) {
    return this.provisioningAdmissionPolicy.assertProvisioningAdmissionDependencies(
      moveType,
    );
  }

  /**
   * Build a typed admission-denied error for coordinator callers.
   * @param {Object} move
   * @param {Object} admissionResult
   * @return {Error}
   * @private
   */
  createProvisioningAdmissionError(move, admissionResult) {
    return this.provisioningAdmissionPolicy.createProvisioningAdmissionError(
      move,
      admissionResult,
    );
  }

  /**
   * Persist a new operation via SQL engine.
   *
   * OWNERSHIP BOUNDARY: RebalanceCoordinator is the sole writer for
   * steady-state replica_operations rows (ADD/REMOVE/REPLACE).
   * BootstrapAPI owns a separate domain for MOVE_REPLICA handoff
   * and MOVE_ASSIGNMENT reservation rows created during node join.
   * The two domains are distinguished by operation type and creation
   * context. See BootstrapAPI.insertMoveReplicaHandoffOperation for
   * the bootstrap-side boundary contract.
   *
   * @readModel COORDINATOR_OPERATION_PERSIST —
   *   READ_MODEL_SOURCE.AUTHORITATIVE_SQL
   * @param {Object} operation - Operation to persist.
   * @param {Object} [options={}] - Optional persistence-result shape.
   * @return {Promise<boolean|Object>} Persistence result.
   * @private
   */
  async persistNewOperation(operation, options = {}) {
    return this.repository.persistNewOperation(operation, options);
  }

  /**
   * Update an existing operation via SQL engine.
   * @param {Object} operation - Operation to update.
   * @return {Promise<void>}
   * @private
   */
  async persistOperationUpdate(operation, options = {}) {
    return this.runReplicaOperationTransitionExclusive(
      () => this.repository.persistOperationUpdate(operation, options),
      {operation},
    );
  }

  /**
   * Wait for replica_operations cache visibility after SQL persistence.
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async waitForReplicaOperationCacheVisibility(operation) {
    return this.repository.waitForReplicaOperationCacheVisibility(operation);
  }

  /**
   * Execute operation mutation SQL with retry for transient leader gaps.
   * @param {string} sql - SQL statement.
   * @param {Array<*>} params - Statement parameters.
   * @return {Promise<Object>} SQL query result.
   * @private
   */
  async executeOperationMutationWithRetry(sql, params, options = {}) {
    return this.repository.executeOperationMutationWithRetry(
      sql,
      params,
      options,
    );
  }

  /**
   * Check whether operation persist error is transient and retryable.
   * @param {string} errorMessage - SQL error message.
   * @return {boolean} True when retry should be attempted.
   * @private
   */
  isRetryableOperationPersistError(errorMessage) {
    return this.repository.isRetryableOperationPersistError(errorMessage);
  }

  /**
   * Delay helper for operation mutation retry loop.
   * @param {number} delayMs - Delay duration in milliseconds.
   * @return {Promise<void>}
   * @private
   */
  async waitForOperationPersistRetry(delayMs) {
    return this.repository.waitForOperationPersistRetry(delayMs);
  }

  /**
   * Build query options for one owner-managed mutation.
   * Coordinator writes must not inherit the default SQL session.
   * @param {Object} [options={}] - Mutation routing options.
   * @return {Object}
   * @private
   */
  buildOperationMutationQueryOptions(options = {}) {
    return this.repository.buildOperationMutationQueryOptions(options);
  }

  /**
   * Resolve the SQL session for one owner-managed mutation.
   * @param {Object} [options={}] - Mutation routing options.
   * @return {string}
   * @private
   */
  resolveOperationMutationSessionId(options = {}) {
    return this.repository.resolveOperationMutationSessionId(options);
  }

  /**
   * Execute an operation (ADD or REMOVE).
   * Uses MessageRouter delivery to the target node.
   * Requirements: 2.1
   *
   * @param {Object} operation - Operation to execute.
   * @return {Promise<Object>} Execution result.
   */
  async executeOperation(operation) {
    return this.workflowOwner.executeOperation(operation);
  }

  /**
   * Resolve an operation id from one supported caller payload.
   * @param {string|Object} operationInput - Operation id, row, or payload.
   * @return {string|null}
   * @private
   */
  getOperationIdFromInput(operationInput) {
    return this.workflowOwner.getOperationIdFromInput(operationInput);
  }

  /**
   * Normalize one dispatch input to a canonical operation object.
   * @param {string|Object} operationInput - Operation id, row, or payload.
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveDispatchOperation(operationInput) {
    return this.workflowOwner.resolveDispatchOperation(operationInput);
  }

  /**
   * Execute one dispatch attempt after ownership serialization.
   * Delegates to workflow owner (D7.1).
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   * @private
   */
  async dispatchOperationInternal(operationInput) {
    return this.workflowOwner.dispatchOperationInternal(operationInput);
  }

  /**
   * Execute operation body once per operation ID.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {Promise<Object>}
   * @private
   */
  async executeOperationInternal(operation) {
    return this.workflowOwner.executeOperationInternal(operation);
  }

  /**
   * Execute a step transition atomically.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @param {string} step
   * @param {string} reason
   * @param {Function} persistFn
   * @return {Promise<void>}
   * @private
   */
  async executeAtomicTransition(operation, step, reason, persistFn) {
    return this.workflowOwner.executeAtomicTransition(
      operation,
      step,
      reason,
      persistFn,
    );
  }

  /**
   * Serialize replica_operations step transitions.
   * @param {Function} executionFactory
   * @return {Promise<*>}
   * @private
   */
  runReplicaOperationTransitionExclusive(executionFactory, options = {}) {
    return this.repository.runReplicaOperationTransitionExclusive(
      executionFactory,
      options,
    );
  }

  /**
   * Update operation workflow step.
   * Requirements: 4.3
   *
   * @param {Object} operation - Operation to update.
   * @param {string} step - New workflow step.
   * @return {Promise<void>}
   */
  async updateStep(operation, step, reason) {
    return this.workflowOwner.updateStep(operation, step, reason);
  }

  /**
   * Complete an operation successfully.
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async completeOperation(operation) {
    return this.workflowOwner.completeOperation(operation);
  }

  /**
   * Get safety validation error for REMOVE operations, if any.
   * Critical system partition removes are blocked until a replacement
   * replica is voter-ready and routable.
   * @readModel COORDINATOR_SAFETY_CHECK —
   *   READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE
   * @param {Object} operation - Operation to validate.
   * @return {Promise<string|null>} Error message or null when safe.
   * @private
   */
  async getRemoveSafetyError(operation) {
    return this.workflowOwner.getRemoveSafetyError(operation);
  }

  /**
   * Evaluate safety error for a move intent.
   * Delegates to workflow owner (D7.1).
   * @param {Object} move
   * @return {Promise<string|null>}
   */
  async getMoveSafetyError(move) {
    return this.workflowOwner.getMoveSafetyError(move);
  }

  /**
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
  isCriticalSystemPartition(partitionId) {
    return classifySystemPartition({partitionId}).systemTable;
  }

  /**
   * @param {string} partitionId
   * @return {boolean}
   * @private
   */
  isPriorityControlPlanePartition(partitionId) {
    return classifySystemPartition({
      partitionId,
    }).priorityControlPlane;
  }

  /**
   * Resolve the readiness dimension used for operation-scoped snapshots.
   * Critical system partition recovery paths must remain routable while
   * publication is converging; ordinary entities keep strict repair gating.
   *
   * @param {string|null} partitionId
   * @return {string}
   * @private
   */
  resolveOperationReadinessDecisionDimension(partitionId = null) {
    if (classifySystemPartition({partitionId}).systemTable) {
      return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }

  /**
   * @param {Object} replicaRow
   * @return {boolean}
   * @private
   */
  isVoterReadyRoutableReplica(replicaRow) {
    return this.workflowOwner.isVoterReadyRoutableReplica(replicaRow);
  }

  /**
   * @param {Object} replicaRow
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isOperationReplicaRow(replicaRow, operation) {
    return this.workflowOwner.isOperationReplicaRow(replicaRow, operation);
  }

  /**
   * @param {string} partitionId
   * @return {Promise<number>}
   * @private
   */
  async getCriticalMinReplicaCount(partitionId) {
    return this.workflowOwner.getCriticalMinReplicaCount(partitionId);
  }

  /**
   * @param {string} nodeId
   * @return {boolean}
   * @private
   */
  isNodeReadyForRouting(nodeId) {
    return this.workflowOwner.isNodeReadyForRouting(nodeId);
  }

  /**
   * Fail an operation.
   * Requirements: 6.2
   *
   * @param {Object} operation - Operation to fail.
   * @param {string} errorMessage - Error message.
   * @param {Object} [options] - Failure logging options.
   * @param {string} [options.logLevel] - Log level for failure event.
   * @param {string} [options.logMessage] - Log message override.
   * @param {Object} [options.stepMetadata] - FAILED step metadata.
   * @return {Promise<void>}
   */
  async failOperation(operation, errorMessage, options = {}) {
    return this.workflowOwner.failOperation(operation, errorMessage, options);
  }

  /**
   * Delegates to workflow owner (D7.1).
   * @param {Object} operation
   * @private
   */
  ensureOperationWorkflow(operation) {
    return this.workflowOwner.ensureOperationWorkflow(operation);
  }

  /**
   * Delegates to workflow owner (D7.1).
   * @param {string} previousStep
   * @param {string} nextStep
   * @return {string}
   * @private
   */
  resolveTransitionReason(previousStep, nextStep) {
    return this.workflowOwner.resolveTransitionReason(previousStep, nextStep);
  }

  /**
   * @param {string} errorMessage
   * @return {boolean}
   * @private
   */
  isSafetyPolicyFailure(errorMessage) {
    return this.workflowOwner.isSafetyPolicyFailure(errorMessage);
  }

  /**
   * @param {*} errorLike
   * @param {string} fallbackMessage
   * @return {string}
   * @private
   */
  normalizeErrorMessage(errorLike, fallbackMessage) {
    return this.workflowOwner.normalizeErrorMessage(errorLike, fallbackMessage);
  }
}

function applyRebalanceCoordinatorOwnerFacadeMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorOwnerFacade.prototype;
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

export {applyRebalanceCoordinatorOwnerFacadeMethods};
