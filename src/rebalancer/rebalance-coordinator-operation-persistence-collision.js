import {
  applyReplaceIntentIdentity,
  buildSuccessorReplaceIntentIdentity,
  replaceIntentPredecessorMatches,
} from './rebalance-replace-intent-identity.js';
import {assertOperationUpdateRecord} from './replica-operation-update-outcome.js';
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
    // Deterministic-intent creators retry the SAME operation id, so a
    // durable terminal winner is the prior attempt's outcome, not an
    // in-flight operation. Rearming it re-drives an idempotent create
    // against a completed replica and livelocks the terminal-transition
    // repair (round-10: local lone-seed phase-1 DDL admission). A
    // terminal-successful winner IS the create result; a terminal-failed
    // winner cannot be cured under the same intent id and must surface.
    if (
      context.move?.operationIntentId && terminal
    ) {
      if (isTerminalSuccessfulCreateOperation(existing)) {
        return existing;
      }
      throw new Error(
        `${TERMINAL_INTENT_COLLISION_ERROR_PREFIX} ` +
          `${context.move.operationIntentId}: ` +
          `${existing.status}`,
      );
    }
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
