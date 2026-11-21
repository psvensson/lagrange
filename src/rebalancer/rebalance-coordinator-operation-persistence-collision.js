import {
  applyReplaceIntentIdentity,
  buildSuccessorReplaceIntentIdentity,
  replaceIntentPredecessorMatches,
} from './rebalance-replace-intent-identity.js';
import {assertOperationUpdateRecord} from './replica-operation-update-outcome.js';
import {requireCreationReplayOutcome} from './replica-operation-creation-request.js';

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
    const {operation, persistResult, requestedMove} = context;
    const observation = persistResult.operation ?
      {operation: persistResult.operation} :
      await this.observeExactCreationOperation(operation.operationId);
    const existing = observation.operation;
    if (!existing) {
      throw this.createDeferredOperationVisibilityError(
        operation.type, observation, requestedMove,
      );
    }
    assertOperationUpdateRecord(existing);
    const terminal = this.isRecentOperationIntentTerminal(existing);
    if (context.replaceIntentIdentity && terminal) {
      if (!replaceIntentPredecessorMatches({...context, existing})) {
        return this.refuseConflictingCreation(existing, requestedMove);
      }
      return this.createSuccessorReplaceOperation(context, existing);
    }
    if (existing.operationId !== operation.operationId ||
        !this.operationMatchesCreationRequest(existing, requestedMove)) {
      return this.refuseConflictingCreation(existing, requestedMove);
    }
    // A durable terminal winner is the prior attempt's outcome. Only a
    // live operation still owns reservation or dispatch work.
    if (requireCreationReplayOutcome(existing)) return existing;
    if (context.replaceIntentIdentity) {
      await this.ensureReservationForOperation(existing);
    }
    this.rememberOperationIntents(
      [context.dedupeKey, context.criticalAddLikeIntentKey],
      existing,
    );
    return this.maybeRearmReusedPendingOperation(existing);
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
