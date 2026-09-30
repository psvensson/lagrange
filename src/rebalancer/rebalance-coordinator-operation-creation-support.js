import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';

const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_FAILED_TO_PRIME_COORDINATOR_CREATED_OPER =
  'Failed to prime coordinator-created operation progress';
const OWNER_PROGRESS_STEP_METHOD = Object.freeze({
  ARM: 'armCoordinatorCreatedOperation',
  DISPATCH_AFTER_CREATE_BUDGET_TURN:
    'dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn',
});

const {
  OperationType,
  REBALANCE_COORDINATOR_LOG_MSG,
  SERVICE_TYPE,
  STRICT_CREATE_DEDUPE_REPOSITORY_QUERY_OPTIONS,
  buildReplicatedServiceBootstrapTopology,
} = REBALANCE_COORDINATOR_SHARED;

function requiresBootstrapTopology({normalizedMoveType, entityType}) {
  const supportedEntity = entityType === SERVICE_TYPE.MESSAGE_GROUP ||
    entityType === SERVICE_TYPE.PARTITION;
  const supportedMove = normalizedMoveType === OperationType.ADD ||
    normalizedMoveType === OperationType.REPLACE;
  return supportedEntity && supportedMove;
}

const operationCreationSupportMethods = {
  async readOperationBootstrapServiceRows(context) {
    const {partitionId, entityType, entityId} = context;
    const cacheServiceRows = this.repository.getEntityServiceRows({
      partitionId,
      entityType,
      entityId,
    });
    let authoritativeObservation = null;
    try {
      authoritativeObservation =
        await this.getAuthoritativeEntityServiceRowsObservation({
          partitionId,
          entityType,
          entityId,
        });
    } catch {
      authoritativeObservation = null;
    }
    if (
      authoritativeObservation?.available !== true ||
      authoritativeObservation.rows.length === 0
    ) {
      return cacheServiceRows;
    }
    return this.mergeEntityServiceRows(
      cacheServiceRows,
      authoritativeObservation.rows,
    );
  },

  resolveMissingOperationBootstrapTopology(context) {
    const {partitionId, entityType, entityId} = context;
    if (entityType === SERVICE_TYPE.PARTITION) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.BOOTSTRAP_TOPOLOGY_UNRESOLVED,
        {partitionId, entityType, entityId, reason: 'no_service_rows'},
      );
      return null;
    }
    throw new Error(
      `Cannot create ${entityType} operation for ${entityId} without existing canonical topology`,
    );
  },

  resolveIncompleteOperationBootstrapTopology(context, topology) {
    const {partitionId, entityType, entityId} = context;
    const replicaIds = topology?.replicaIds || [];
    const peerAddresses = topology?.peerAddresses || [];
    if (entityType === SERVICE_TYPE.PARTITION) {
      this.logger.warn(
        REBALANCE_COORDINATOR_LOG_MSG.BOOTSTRAP_TOPOLOGY_UNRESOLVED,
        {
          partitionId,
          entityType,
          entityId,
          reason: 'incomplete_topology',
          replicaIdCount: replicaIds.length,
          peerAddressCount: peerAddresses.length,
        },
      );
      return null;
    }
    throw new Error(
      `Canonical topology for ${entityType} ${entityId} is incomplete`,
    );
  },

  async buildOperationBootstrapTopology(context) {
    const {
      normalizedMoveType,
      entityType,
      excludeReplicaIds,
      targetNodeId,
      targetReplicaId,
    } = context;
    if (!requiresBootstrapTopology({normalizedMoveType, entityType})) {
      return null;
    }
    const serviceRows = await this.readOperationBootstrapServiceRows(context);
    if (!Array.isArray(serviceRows) || serviceRows.length === 0) {
      return this.resolveMissingOperationBootstrapTopology(context);
    }
    const topology = buildReplicatedServiceBootstrapTopology({
      serviceType: entityType,
      serviceRows,
      excludeReplicaIds,
      targetReplicaId,
      targetNodeId,
    });
    const replicaIds = topology?.replicaIds || [];
    const peerAddresses = topology?.peerAddresses || [];
    if (replicaIds.length <= 1 || peerAddresses.length < replicaIds.length) {
      return this.resolveIncompleteOperationBootstrapTopology(
        context,
        topology,
      );
    }
    return {replicaIds, peerAddresses};
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
          workflowStep: operation.workflowStep || null,
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
