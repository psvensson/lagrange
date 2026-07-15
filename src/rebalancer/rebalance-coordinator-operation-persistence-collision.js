import {
  applyReplaceIntentIdentity,
  buildSuccessorReplaceIntentIdentity,
  replaceIntentCollisionMatches,
} from './rebalance-replace-intent-identity.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

class RebalanceCoordinatorOperationPersistenceCollision {
  /**
   * Resolve the authoritative winner of a deterministic insert collision.
   * Non-terminal winners reuse the existing CL-008 rearm decision; terminal
   * winners advance the linked identity generation.
   * @param {Object} context
   * @return {Promise<Object>}
   * @private
   */
  async resolveCreatedOperationPersistenceCollision(context) {
    const {operation, persistResult} = context;
    const existing = persistResult.operation ||
      await this.queryExistingOperationAfterInsertConflict({
        operationIntentId: context.move.operationIntentId,
        operationId: operation.operationId,
        partitionId: context.partitionId,
        targetNodeId: context.move.nodeId,
        entityType: context.entityType,
        entityId: context.entityId,
        normalizedMove: context.normalizedMove,
      });
    if (!existing) {
      throw new Error(
        `Operation persistence collision is not visible: ${operation.operationId}`,
      );
    }
    this.assertReplaceIntentCollisionMatches(context, existing);
    if (
      context.replaceIntentIdentity &&
      this.isRecentOperationIntentTerminal(existing)
    ) {
      return this.createSuccessorReplaceOperation(context, existing);
    }
    if (context.replaceIntentIdentity) {
      await this.ensureReservationForOperation(existing);
    }
    this.rememberOperationIntents(
      [context.dedupeKey, context.criticalAddLikeIntentKey],
      existing,
    );
    return this.maybeRearmReusedPendingOperation(existing, {
      shouldEmitOperationCreated: context.shouldEmitOperationCreated,
    });
  }

  assertReplaceIntentCollisionMatches(context, existing) {
    if (!context.replaceIntentIdentity) {
      return;
    }
    if (replaceIntentCollisionMatches({
      existing,
      move: context.move,
      operation: context.operation,
      entityType: context.entityType,
      entityId: context.entityId,
      allowTargetChurn: Boolean(context.criticalAddLikeIntentKey),
    })) {
      return;
    }
    throw new Error(
      `Operation persistence collision does not match REPLACE intent: ${context.operation.operationId}`,
    );
  }

  createSuccessorReplaceOperation(context, existing) {
    const identity = buildSuccessorReplaceIntentIdentity(
      context.replaceIntentIdentity,
      existing.operationId,
    );
    return this.createOperationRecordInternal({
      ...context,
      move: applyReplaceIntentIdentity(context.move, identity),
      normalizedMove: applyReplaceIntentIdentity(
        context.normalizedMove,
        identity,
      ),
      replaceIntentIdentity: identity,
    });
  }
}

function applyRebalanceCoordinatorOperationPersistenceCollisionMethods(
  RebalanceCoordinator,
) {
  for (const methodName of Object.getOwnPropertyNames(
    RebalanceCoordinatorOperationPersistenceCollision.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      RebalanceCoordinator.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        RebalanceCoordinatorOperationPersistenceCollision.prototype,
        methodName,
      ),
    );
  }
}

export {applyRebalanceCoordinatorOperationPersistenceCollisionMethods};
