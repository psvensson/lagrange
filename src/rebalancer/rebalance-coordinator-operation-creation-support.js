import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {isBootstrapTopologyDispatchDeferred} from './replica-status.js';
import {ReplicaOperationField} from './replica-operation-constants.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from './replica-operation-update-disposition.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_FAILED_TO_PRIME_COORDINATOR_CREATED_OPER =
  'Failed to prime coordinator-created operation progress';
const OWNER_PROGRESS_STEP_METHOD = Object.freeze({
  ARM: 'armCoordinatorCreatedOperation',
  DISPATCH_AFTER_CREATE_BUDGET_TURN:
    'dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn',
});

const {
  OPERATION_METADATA_KEY,
  STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
  WORKFLOW_STEP,
} = REBALANCE_COORDINATOR_SHARED;

// The founding-cohort stamp the hold releaser writes: each stamp field (named
// as the operation field the decoded row carries) and the steps-history
// metadata key the durable row stores it under.
const BOOTSTRAP_TOPOLOGY_STAMP_FIELDS = Object.freeze([
  [ReplicaOperationField.REPLICA_IDS, OPERATION_METADATA_KEY.REPLICA_IDS],
  [ReplicaOperationField.PEER_ADDRESSES, OPERATION_METADATA_KEY.PEER_ADDRESSES],
  [
    ReplicaOperationField.BOOTSTRAP_MEMBERSHIP,
    OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP,
  ],
  [
    ReplicaOperationField.BOOTSTRAP_TABLE_METADATA,
    OPERATION_METADATA_KEY.BOOTSTRAP_TABLE_METADATA,
  ],
  [
    ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA,
    OPERATION_METADATA_KEY.BOOTSTRAP_PARTITION_METADATA,
  ],
]);

// The one state a hold release may start from: the durable row is PENDING,
// non-terminal, and still carries the bootstrap-topology dispatch hold. Any
// other row is held by another owner (a dispatch lane claimed it, a prior
// attempt released it, it finished).
function isHeldPendingBootstrapOperation(operation) {
  return Boolean(operation) &&
    operation.workflowStep === WORKFLOW_STEP.PENDING &&
    !Number.isFinite(operation.completedAt) &&
    isBootstrapTopologyDispatchDeferred(operation);
}

// Build the released row from the DURABLE row the releaser read, never from a
// caller's in-memory copy: the stamp lands on the creation step entry, the
// hold leaves every entry, and the decoded operation fields mirror the stamp.
function buildBootstrapTopologyReleasedOperation(durableOperation, stamp, now) {
  const released = structuredClone(durableOperation);
  const [creationEntry] = released.stepsHistory;
  for (const [operationField, metadataKey] of BOOTSTRAP_TOPOLOGY_STAMP_FIELDS) {
    const value = stamp[operationField];
    if (value === null || value === undefined) {
      continue;
    }
    creationEntry[metadataKey] = structuredClone(value);
    released[operationField] = structuredClone(value);
  }
  for (const entry of released.stepsHistory) {
    delete entry[OPERATION_METADATA_KEY.BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED];
  }
  released.updatedAt = now;
  return released;
}

function buildBootstrapTopologyHoldReleaseOutcome(released, operation) {
  return Object.freeze({
    released,
    operation: operation ? structuredClone(operation) : null,
  });
}

const operationCreationSupportMethods = {
  /**
   * Release the bootstrap-topology dispatch hold of one deterministic
   * founding-cohort ADD and stamp its cohort topology, as ONE compare-and-set
   * on the durable row: it applies only while the row is still PENDING and
   * its steps history is exactly the held history this owner read. The hold
   * is the dispatch token: while it is present only the hold's releaser may
   * dispatch the row inline; once released, the coordinator's dispatch lanes
   * own it. A caller whose release is refused never stamps or executes the
   * row; it awaits the row's outcome.
   *
   * @param {string} operationId
   * @param {Object} stamp replicaIds, peerAddresses, bootstrapMembership and
   *   the optional bootstrapTableMetadata / bootstrapPartitionMetadata
   * @return {Promise<{released: boolean, operation: (Object|null)}>} the
   *   released row on success; the re-read durable row (a private copy) when
   *   another owner holds it
   */
  async releaseBootstrapTopologyDispatchHold(operationId, stamp) {
    return this.runReplicaOperationTransitionExclusive(
      () => this.releaseBootstrapTopologyDispatchHoldUnderLane(
        operationId,
        stamp,
      ),
      {operationId},
    );
  },

  async releaseBootstrapTopologyDispatchHoldUnderLane(operationId, stamp) {
    const durableOperation =
      await this.repository.queryAuthoritativeOperationById(operationId);
    if (!isHeldPendingBootstrapOperation(durableOperation)) {
      return buildBootstrapTopologyHoldReleaseOutcome(false, durableOperation);
    }
    const released = buildBootstrapTopologyReleasedOperation(
      durableOperation,
      stamp,
      this.timeSource.now(),
    );
    const persistResult = await this.repository.persistOperationUpdate(
      released,
      {
        expectedWorkflowStep: WORKFLOW_STEP.PENDING,
        expectedStepsHistory: durableOperation.stepsHistory,
        returnDisposition: true,
      },
    );
    // Only a write that changed the held row is this caller's release. An
    // idempotent replay or a refused CAS means another writer moved the row
    // first; that writer, not this caller, owns its dispatch.
    if (
      persistResult?.disposition !== REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED
    ) {
      return buildBootstrapTopologyHoldReleaseOutcome(
        false,
        await this.repository.queryAuthoritativeOperationById(operationId),
      );
    }
    return buildBootstrapTopologyHoldReleaseOutcome(true, released);
  },


  async queryExistingOperationAfterInsertConflict(context) {
    const {
      operationIntentId,
      operationId,
      partitionId,
      targetNodeId,
      entityType,
      entityId,
      normalizedMove,
    } = context;
    if (operationIntentId) {
      const existingByDeterministicId =
        await this.repository.queryAuthoritativeOperationById(operationId);
      if (existingByDeterministicId) return existingByDeterministicId;
    }
    return this.queryExistingInFlightOperation(
      partitionId,
      targetNodeId,
      entityType,
      entityId,
      normalizedMove,
      STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
    );
  },

  async armCoordinatorCreatedOperationProgress(operation, armContext = {}) {
    return this.runCoordinatorCreatedOperationProgressStep(
      operation,
      OWNER_PROGRESS_STEP_METHOD.ARM,
      (workflowOwner) =>
        workflowOwner.armCoordinatorCreatedOperation(operation, armContext),
    );
  },

  async dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn(operation) {
    return this.runCoordinatorCreatedOperationProgressStep(
      operation,
      OWNER_PROGRESS_STEP_METHOD.DISPATCH_AFTER_CREATE_BUDGET_TURN,
      (workflowOwner) =>
        workflowOwner.dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn(
          operation.operationId,
        ),
    );
  },

  async runCoordinatorCreatedOperationProgressStep(
    operation,
    ownerMethodName,
    invokeStep,
  ) {
    if (
      !operation?.operationId ||
      typeof this.workflowOwner?.[ownerMethodName] !== LOCAL_STR_FUNCTION
    ) {
      return false;
    }
    try {
      return await invokeStep(this.workflowOwner);
    } catch (error) {
      this.logger.warn(
        LOCAL_STR_FAILED_TO_PRIME_COORDINATOR_CREATED_OPER,
        {
          operationId: operation.operationId,
          partitionId: operation.partitionId || null,
          workflowStep: operation.workflowStep,
          error: error?.message || String(error),
        },
      );
      return false;
    }
  },
};

function applyRebalanceCoordinatorOperationCreationSupportMethods(target) {
  Object.defineProperties(
    target.prototype,
    Object.getOwnPropertyDescriptors(operationCreationSupportMethods),
  );
}

export {applyRebalanceCoordinatorOperationCreationSupportMethods};
