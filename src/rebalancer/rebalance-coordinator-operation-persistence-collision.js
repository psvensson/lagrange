import {
  applyReplaceIntentIdentity,
  buildSuccessorReplaceIntentIdentity,
  replaceIntentCollisionMatches,
} from './rebalance-replace-intent-identity.js';
import {
  isTerminalSuccessfulCreateOperation,
} from './replica-operation-progress.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const TERMINAL_INTENT_COLLISION_ERROR_PREFIX =
  'Operation persistence collision winner is durably terminal for ' +
  'deterministic intent';

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
    // Deterministic-intent creators retry the SAME operation id, so a
    // durable terminal winner is the prior attempt's outcome, not an
    // in-flight operation. Rearming it re-drives an idempotent create
    // against a completed replica and livelocks the terminal-transition
    // repair (round-10: local lone-seed phase-1 DDL admission). A
    // terminal-successful winner IS the create result; a terminal-failed
    // winner cannot be cured under the same intent id and must surface.
    if (
      context.move?.operationIntentId &&
      this.isRecentOperationIntentTerminal(existing)
    ) {
      if (isTerminalSuccessfulCreateOperation(existing)) {
        return existing;
      }
      throw new Error(
        `${TERMINAL_INTENT_COLLISION_ERROR_PREFIX} ` +
          `${context.move.operationIntentId}: ` +
          `${existing.status || existing.workflowStep}`,
      );
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
