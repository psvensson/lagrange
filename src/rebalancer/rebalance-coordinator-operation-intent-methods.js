import {assertOperationUpdateSubject} from './replica-operation-update-outcome.js';
import {readOperationRecordWorkflowStep} from './replica-operation-progress.js';
import {readStateField} from '../utils/state-field-read.js';
import {REBALANCE_COORDINATOR_SHARED} from './rebalance-coordinator-shared.js';
import {
  PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_WORKFLOW_STEPS,
} from './replica-operation-step-policy.js';
import {
  assertCanonicalRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';

const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  INCOMPLETE_OPERATION_OBSERVATION_STATE,
  NUM,
  OperationType,
  PRIORITY_RECENT_INTENT_TTL_MS,
  REBALANCE_COORDINATOR_LOG_MSG,
  RECENT_INTENT_TTL_MS,
  RECENT_OPERATION_INTENT_VISIBILITY_STATE,
  ReplicaStatus,
  STRING,
  WORKFLOW_STEP,
  classifySystemPartition,
} = REBALANCE_COORDINATOR_SHARED;

const LOCAL_STR_STRING = 'string';
const LOCAL_STR_FUNCTION = 'function';
const REUSED_OPERATION_REARM_ACTION = Object.freeze({
  SKIP_NOT_PENDING: 'skip_not_pending',
  SKIP_LIVE_DEFERRED_RETRY: 'skip_live_deferred_retry',
  REARM_DISPATCH: 'rearm_dispatch',
});
const PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_OPERATION_TYPES = new Set([
  OperationType.ADD,
  OperationType.REPLACE,
]);

class RebalanceCoordinatorOperationIntentMethods {
  /**
   * Normalize one move type to canonical upper-case enum representation.
   * @param {string} moveType
   * @return {string|null}
   * @private
   */
  normalizeMoveType(moveType) {
    if (typeof moveType !== LOCAL_STR_STRING) {
      return null;
    }
    const normalized = moveType.toUpperCase();
    if (normalized.length === 0) {
      return null;
    }
    return normalized;
  }

  /**
   * Build a stable in-memory idempotency key for a move intent.
   * @param {Object} move - Move specification.
   * @param {string} entityType - Canonical entity type.
   * @param {string} entityId - Canonical entity ID.
   * @return {string} Intent key.
   * @private
   */
  buildOperationIntentKey(move, entityType, entityId) {
    const normalizedType = this.normalizeMoveType(move?.type) || '';
    const targetNodeId = move?.nodeId || '';
    const replicaIntent =
      normalizedType === OperationType.REMOVE ||
      normalizedType === OperationType.REPLACE ?
        move?.replicaId || '' :
        '';
    return `${entityType}:${entityId}:${normalizedType}:${targetNodeId}:${replicaIntent}`;
  }

  /**
   * Critical system partitions allow only one add-like recovery lifecycle in
   * flight. Use one broader key so target-node churn or authoritative entity
   * read misses cannot mint a second PENDING replacement for the same entity.
   *
   * @param {string|null} normalizedMoveType
   * @param {string} partitionId
   * @param {string} entityType
   * @param {string} entityId
   * @return {string|null}
   * @private
   */
  buildCriticalAddLikeIntentKey(
    move,
    normalizedMoveType,
    partitionId,
    entityType,
    entityId,
  ) {
    if (
      move?.enforceConcurrentOperationBudget !== true ||
      (normalizedMoveType !== OperationType.ADD &&
        normalizedMoveType !== OperationType.REPLACE) ||
      !classifySystemPartition({partitionId}).systemTable
    ) {
      return null;
    }
    return `${entityType}:${entityId}:critical_add_like`;
  }

  /**
   * Determine whether an in-flight operation matches a new move intent.
   * @param {Object} operation - Existing operation.
   * @param {Object} move - New move request.
   * @param {string} entityType - Canonical entity type.
   * @param {string} entityId - Canonical entity ID.
   * @return {boolean} True when intents match.
   * @private
   */
  operationMatchesMoveIntent(operation, move, entityType, entityId) {
    if (!operation || !move) {
      return false;
    }

    const operationType = this.normalizeMoveType(operation.type) || '';
    const moveType = this.normalizeMoveType(move.type) || '';
    if (operationType !== moveType) {
      return false;
    }

    if (operation.targetNodeId !== move.nodeId) {
      return false;
    }

    if (operation.entityType !== entityType) {
      return false;
    }

    if (operation.entityId !== entityId) {
      return false;
    }

    if (moveType === OperationType.REMOVE) {
      return operation.replicaId === move.replicaId;
    }

    if (moveType === OperationType.REPLACE) {
      return this.getReplaceSourceReplicaId(operation) === move.replicaId;
    }

    return true;
  }

  operationMatchesCreationRequest(operation, move) {
    const moveType = this.normalizeMoveType(move.type);
    const explicitTargetReplicaId = moveType === OperationType.ADD ?
      move.replicaId || move.replicaIntentId :
      move.replicaIntentId;
    return operation.partitionId === move.partitionId &&
      this.operationMatchesMoveIntent(operation, move, move.entityType, move.entityId) &&
      (!move.operationIntentId || operation.operationId === move.operationIntentId) &&
      (!explicitTargetReplicaId || operation.replicaId === explicitTargetReplicaId) &&
      (!Object.hasOwn(move, 'targetClaimKey') ||
        operation.targetClaimKey === move.targetClaimKey) &&
      (!move.membershipPublicationEpoch ||
        operation.membershipPublicationEpoch === move.membershipPublicationEpoch) &&
      (moveType !== OperationType.REPLACE ||
        operation.sourceNodeId === (move.sourceNodeId || this.nodeId));
  }

  async refuseConflictingCreation(operation, move) {
    const moveType = this.normalizeMoveType(move.type);
    if (this.isDisruptiveOperationLedgerSelfMove(moveType, move.partitionId)) {
      await this.assertNoRegisteredLedgerSelfMove([operation], moveType, move.partitionId);
    }
    throw this.createConcurrentOperationBudgetError(moveType, 1, {
      message: `Partition ${move.partitionId} already has a different create intent`,
      conflictingOperationId: operation.operationId,
    });
  }

  async resolveKnownCreationOperation(candidate, move, {
    allowAbsent = false,
    retireRecentHint = false,
  } = {}) {
    if (!candidate) return null;
    const observation = await this.observeExactCreationOperation(candidate.operationId);
    const operation = observation.operation;
    if (operation) {
      let sameSubject = false;
      try {
        assertOperationUpdateSubject(candidate, operation);
        sameSubject = operation.createdAt === candidate.createdAt &&
          operation.replicaId === candidate.replicaId;
      } catch {
        // A foreign row cannot settle this caller's request.
      }
      if (sameSubject) {
        if (this.isRecentOperationIntentTerminal(operation)) {
          if (retireRecentHint || allowAbsent) {
            this.pruneRecentOperationIntentsForOperation(operation);
            return null;
          }
          if (operation.workflowStep === WORKFLOW_STEP.FAILED) {
            throw this.createDeferredOperationVisibilityError(
              this.normalizeMoveType(move.type), observation, move,
            );
          }
        }
        if (!this.operationMatchesCreationRequest(operation, move)) {
          return this.refuseConflictingCreation(operation, move);
        }
        return operation;
      }
    }
    if (!operation && !observation.deferredOutcome) {
      if (allowAbsent) return null;
      if (retireRecentHint) {
        const census = await this.inspectRecentOperationIntentEntityVisibility(candidate);
        if (census.state === RECENT_OPERATION_INTENT_VISIBILITY_STATE.MISSING ||
            (census.operation && this.isRecentOperationIntentTerminal(census.operation))) {
          this.pruneRecentOperationIntentsForOperation(candidate);
          return null;
        }
      }
    }
    if (!this.operationMatchesCreationRequest(candidate, move)) {
      return this.refuseConflictingCreation(candidate, move);
    }
    throw this.createDeferredOperationVisibilityError(
      this.normalizeMoveType(move.type), observation, move,
    );
  }

  async runCreateOperationForIntent(context) {
    const {singleFlightKey, canonicalMove, moveForCreate, replaceIntentIdentity,
      dedupeKey, criticalAddLikeIntentKey} = context;
    for (const allowOneRetry of [true, false]) {
      let factoryRan = false;
      const result = await this.operationWorkflowRunExclusive(singleFlightKey, async () => {
        factoryRan = true;
        let attemptedOperation = null;
        try {
          const recent = await this.getRecentOperationIntent(dedupeKey) ||
            (criticalAddLikeIntentKey &&
              await this.getRecentOperationIntent(criticalAddLikeIntentKey));
          const reusable = await this.resolveKnownCreationOperation(recent, canonicalMove, {
            retireRecentHint: true,
          });
          if (reusable) {
            this.rememberOperationIntents([dedupeKey, criticalAddLikeIntentKey], reusable);
            const operation = await this.maybeRearmReusedPendingOperation(reusable);
            return {operation, attemptedOperation, error: null};
          }
          const operation =
            await this.runOperationLedgerInterlockAccountedCreate(moveForCreate, () =>
              this.createOperationInternal(moveForCreate, {
                replaceIntentIdentity,
                requestedMove: canonicalMove,
                observeAttempt: (candidate) => {
                  attemptedOperation = candidate;
                },
              }),
            );
          return {operation, attemptedOperation, error: null};
        } catch (error) {
          return {operation: null, attemptedOperation, error};
        }
      });
      if (factoryRan) {
        if (result.error) throw result.error;
        return result.operation;
      }
      const existing = await this.resolveKnownCreationOperation(
        result.operation || result.attemptedOperation, canonicalMove,
        {allowAbsent: result.error !== null},
      );
      if (existing) {
        if (result.error) await this.ensureReservationForOperation(existing);
        return this.maybeRearmReusedPendingOperation(existing);
      }
      if (!allowOneRetry) {
        throw this.createDeferredOperationVisibilityError(
          this.normalizeMoveType(canonicalMove.type), null, canonicalMove,
        );
      }
    }
  }

  /**
   * Get a recently remembered operation intent.
   * @param {string} dedupeKey - Intent key.
   * @return {Object|null} Cached operation or null.
   * @private
   */
  getRecentOperationIntent(dedupeKey) {
    const cached = this.recentOperationIntents.get(dedupeKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now() ||
        this.isRecentOperationIntentTerminal(cached.operation)) {
      this.recentOperationIntents.delete(dedupeKey);
      return null;
    }
    return cached.operation;
  }

  observeExactCreationOperation(operationId) {
    return this.repository.queryAuthoritativeOperationVisibilityObservation(operationId, {
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      requireCompleteExactKey: true,
    });
  }

  /**
   * Resolve whether the entity-scoped authoritative operation view still
   * substantiates one cached priority recent intent after the exact
   * operation-id read misses. This prevents stale create-intent entries from
   * suppressing the next recovery operation until the hard TTL expires once
   * the partition-level authoritative view has already moved on.
   *
   * @param {Object|null} operation
   * @return {Promise<Object>}
   * @private
   */
  async inspectRecentOperationIntentEntityVisibility(operation) {
    if (!operation) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.DEFERRED,
        operation: null,
      });
    }
    const partitionId = String(operation.partitionId ?? '').trim();
    if (
      partitionId.length === 0 ||
      !classifySystemPartition({partitionId}).priorityControlPlane
    ) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.DEFERRED,
        operation: null,
      });
    }
    const {entityType, entityId} =
      assertCanonicalRebalancerEntityIdentity(operation);
    const observation = await this.getEntityAuthoritativeOperationObservation(
      entityType,
      entityId,
    );
    if (
      observation?.deferredOutcome ||
      observation?.state === INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED
    ) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.DEFERRED,
        operation: null,
      });
    }
    const operationId = String(operation?.operationId || '').trim();
    const matchingOperation = Array.isArray(observation?.operations) ?
      observation.operations.find(
        (entry) => String(entry?.operationId || '').trim() === operationId,
      ) || null :
      null;
    if (matchingOperation) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.MATCHING,
        operation: matchingOperation,
      });
    }
    if (
      observation?.state === INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY
    ) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.MISSING,
        operation: null,
      });
    }
    if (
      !Array.isArray(observation?.operations) ||
      observation.operations.length === 0
    ) {
      return Object.freeze({
        state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.DEFERRED,
        operation: null,
      });
    }
    return Object.freeze({
      state: RECENT_OPERATION_INTENT_VISIBILITY_STATE.MISSING,
      operation: null,
    });
  }

  /**
   * Remember a recently created/reused operation intent. The cache keeps its
   * own snapshot: the caller's operation object (a create's return value, a
   * provisioning plan entry) is never shared by reference with the cache, so
   * a caller's in-memory edits can neither alter the cached intent nor ride
   * it back out to the next re-creating caller.
   * @param {string} dedupeKey - Intent key.
   * @param {Object} operation - Operation payload.
   * @private
   */
  rememberOperationIntent(dedupeKey, operation) {
    if (!operation || this.isRecentOperationIntentTerminal(operation)) {
      this.recentOperationIntents.delete(dedupeKey);
      return;
    }
    this.recentOperationIntents.set(dedupeKey, {
      operation: structuredClone(operation),
      expiresAt: Date.now() + this.getRecentOperationIntentTtlMs(operation),
    });
  }

  /**
   * Recent create-intent rows are suppression hints, not semantic owners.
   * A removed row must retire the hint even when the original operation type
   * was add-like and the generic lifecycle grammar would treat removed as
   * type-inconsistent rather than terminal.
   *
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  isRecentOperationIntentTerminal(operation) {
    if (!operation) {
      return false;
    }
    if (this.isOperationTerminal(operation)) {
      return true;
    }
    return (
      operation.workflowStep === WORKFLOW_STEP.REMOVED ||
      operation.workflow_step === WORKFLOW_STEP.REMOVED ||
      operation.status === ReplicaStatus.REMOVED
    );
  }

  /**
   * Remember one operation under one or more intent keys.
   * @param {string[]|Set<string>} intentKeys
   * @param {Object} operation
   * @private
   */
  rememberOperationIntents(intentKeys, operation) {
    const keys = Array.isArray(intentKeys) ?
      intentKeys :
      Array.from(intentKeys || []);
    for (const key of keys) {
      if (typeof key !== LOCAL_STR_STRING || key.length === 0) {
        continue;
      }
      this.rememberOperationIntent(key, operation);
    }
  }

  /**
   * Reused create-intent rows may still be the correct in-flight operation
   * while remaining stuck at PENDING because the first owner-side handoff was
   * deferred or missed. Re-arm those rows through the canonical owner path so
   * later planning retries do not keep returning one limbo operation forever.
   *
   * Whether the row may be dispatched is the owner's decision, made from the
   * durable row: a row whose bootstrap-topology dispatch is still held
   * (BOOTSTRAP_TOPOLOGY_DISPATCH_DEFERRED, written at creation and cleared by
   * the provisioner that stamps the cohort) is refused by the owner's claim.
   * The re-creating caller's request flags are no dispatch authority.
   *
   * @param {Object|null} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async maybeRearmReusedPendingOperation(operation) {
    if (!operation) {
      return operation;
    }
    const workflowStep = readOperationRecordWorkflowStep(operation);
    const rearmAction = this.resolveReusedOperationRearmAction(
      operation,
      workflowStep,
    );
    this.logger.info(
      REBALANCE_COORDINATOR_LOG_MSG.REUSED_IN_FLIGHT_OPERATION,
      {
        operationId:
          operation.operationId || operation.operation_id || null,
        partitionId:
          operation.partitionId || operation.partition_id || null,
        moveTargetNodeId:
          operation.targetNodeId || operation.target_node_id || null,
        type: operation.type || operation.operation_type || null,
        workflowStep,
        rearmAction,
      },
    );
    if (rearmAction !== REUSED_OPERATION_REARM_ACTION.REARM_DISPATCH) {
      return operation;
    }
    await this.armCoordinatorCreatedOperationProgress(operation);
    return operation;
  }

  /**
   * Decide whether a reused operation needs a dispatch rearm. A live
   * deferred retry (dispatch retry, transition retry/grace, or
   * created-operation handoff retry) means the dispatch layer already owns
   * the next attempt, so a planning-tick rearm would only add a redundant
   * authoritative read, claim write, and remote dispatch attempt. Rearm is
   * reserved for the missed-handoff state: PENDING with no live timer.
   * @param {Object} operation
   * @param {string} workflowStep
   * @return {string} One REUSED_OPERATION_REARM_ACTION value.
   * @private
   */
  resolveReusedOperationRearmAction(operation, workflowStep) {
    if (
      this.isOperationTerminal(operation) ||
      workflowStep !== WORKFLOW_STEP.PENDING
    ) {
      return REUSED_OPERATION_REARM_ACTION.SKIP_NOT_PENDING;
    }
    if (this.hasLiveDeferredDispatchRetry(operation)) {
      return REUSED_OPERATION_REARM_ACTION.SKIP_LIVE_DEFERRED_RETRY;
    }
    return REUSED_OPERATION_REARM_ACTION.REARM_DISPATCH;
  }

  /**
   * Resolve whether the workflow owner already has a live deferred retry
   * scheduled for one operation. Checks both the dispatch/transition retry
   * timers and the created-operation handoff retry lane — the latter is not
   * covered by isOperationDeferredRetryActive.
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  hasLiveDeferredDispatchRetry(operation) {
    const operationId = String(
      operation?.operationId || operation?.operation_id || '',
    ).trim();
    if (operationId.length === 0) {
      return false;
    }
    const owner = this.workflowOwner;
    if (!owner) {
      return false;
    }
    if (
      typeof owner.isOperationDeferredRetryActive === LOCAL_STR_FUNCTION &&
      owner.isOperationDeferredRetryActive(operationId)
    ) {
      return true;
    }
    return (
      typeof owner.hasActiveCreatedOperationHandoffRetry ===
        LOCAL_STR_FUNCTION &&
      owner.hasActiveCreatedOperationHandoffRetry(operationId) === true
    );
  }

  /**
   * Drop cached create-intent entries that point at one terminal operation.
   * This keeps failed/completed priority recovery rows from suppressing the
   * next required operation while cache/owner reads are under pressure.
   * @param {Object|null} operation
   * @return {void}
   * @private
   */
  pruneRecentOperationIntentsForOperation(operation) {
    const operationId = String(
      operation?.operationId || operation?.operation_id || '',
    ).trim();
    if (operationId.length === 0) {
      return;
    }
    for (const [dedupeKey, entry] of this.recentOperationIntents.entries()) {
      if (String(entry?.operation?.operationId || '').trim() !== operationId) {
        continue;
      }
      this.recentOperationIntents.delete(dedupeKey);
    }
  }

  /**
   * Extend recent-intent retention for priority control-plane partitions so
   * transient owner-read misses do not create a new PENDING operation every
   * few seconds while the original one is still the intended recovery op.
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getRecentOperationIntentTtlMs(operation) {
    const partitionId = String(
      operation?.partitionId || operation?.entityId || STRING.EMPTY,
    ).trim();
    if (!partitionId ||
      !classifySystemPartition({partitionId}).priorityControlPlane) {
      return RECENT_INTENT_TTL_MS;
    }
    const configuredPendingTimeoutMs =
      Number.isFinite(this.config?.pendingTimeoutMs) &&
      this.config.pendingTimeoutMs > 0 ?
        Math.floor(this.config.pendingTimeoutMs) :
        RECENT_INTENT_TTL_MS;
    return Math.max(
      RECENT_INTENT_TTL_MS,
      PRIORITY_RECENT_INTENT_TTL_MS,
      configuredPendingTimeoutMs * NUM.FOUR,
    );
  }

  /**
   * Resolve the authoritative-miss reuse policy from one normalized operation
   * snapshot.
   * @param {Object|null} operation
   * @return {Object}
   * @private
   */
  resolveRecentOperationMissReuseSnapshot(operation) {
    const partitionId = String(
      operation?.partitionId || operation?.entityId || STRING.EMPTY,
    ).trim();
    const workflowStep = readStateField(operation?.workflowStep);
    const operationType = this.normalizeMoveType(operation?.type);
    const priorityPartition =
      partitionId.length > 0 &&
      classifySystemPartition({partitionId}).priorityControlPlane;
    const usePriorityCreatePhaseBudget =
      priorityPartition &&
      PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_OPERATION_TYPES.has(
        operationType,
      ) &&
      PRIORITY_RECENT_INTENT_MISS_REUSE_EXTENDED_WORKFLOW_STEPS.has(
        workflowStep,
      );

    return Object.freeze({
      operationType,
      partitionId,
      priorityPartition,
      usePriorityCreatePhaseBudget,
      workflowStep,
    });
  }

  /**
   * Resolve the workflow-timeout window that defines how long a missing
   * recent intent is still credible as an in-flight recovery operation.
   * Priority ADD/REPLACE create-phase work keeps the longer recent-intent TTL
   * because deferred owner reads should not mint duplicate PENDING operations.
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getRecentOperationMissReuseBudgetMs(operation) {
    const missReuseSnapshot =
      this.resolveRecentOperationMissReuseSnapshot(operation);
    if (missReuseSnapshot.usePriorityCreatePhaseBudget) {
      return this.getRecentOperationIntentTtlMs(operation);
    }

    const workflowStep = missReuseSnapshot.workflowStep;
    if (workflowStep === WORKFLOW_STEP.CREATING) {
      return this.config.creatingTimeoutMs;
    }
    if (workflowStep === WORKFLOW_STEP.SYNCING) {
      return this.config.syncingTimeoutMs;
    }
    if (
      workflowStep === WORKFLOW_STEP.STOPPING ||
      workflowStep === WORKFLOW_STEP.ACTIVE
    ) {
      return this.config.removingTimeoutMs;
    }
    return this.config.pendingTimeoutMs;
  }

  /**
   * @param {Object|null} operation
   * @return {number}
   * @private
   */
  getOperationAgeMs(operation) {
    // Intentionally anchored on updatedAt (recency-of-activity), NOT the
    // time-in-step anchor used by the CL-044 staleness sweep: this drives
    // intent-reuse exclusivity (shouldReuseRecentOperationIntentOnAuthoritativeMiss),
    // where a recently-touched op must KEEP its intent exclusive to avoid
    // multiplying replacement replicas. Aging it out on step time would re-admit
    // a duplicate intent — the opposite of the safety intent here.
    const updatedAt = Number(operation?.updatedAt);
    const createdAt = Number(operation?.createdAt);
    const startedAt =
      Number.isFinite(updatedAt) && updatedAt > 0 ?
        updatedAt :
        createdAt;
    if (!Number.isFinite(startedAt) || startedAt <= 0) {
      return 0;
    }
    return Math.max(0, Date.now() - startedAt);
  }

  /**
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  shouldReuseRecentOperationIntentOnAuthoritativeMiss(operation) {
    if (!operation || this.isOperationTerminal(operation)) {
      return false;
    }
    const missReuseSnapshot =
      this.resolveRecentOperationMissReuseSnapshot(operation);
    if (!missReuseSnapshot.priorityPartition) {
      return false;
    }

    // Source-removal phase must stay exclusive until entity visibility
    // explicitly proves the older REPLACE cleared. Timing out this recent
    // intent on a deferred read admits a second replacement and can multiply
    // active replicas for the same critical partition.
    const keepSourceRemovalIntentExclusive =
      missReuseSnapshot.operationType === OperationType.REPLACE &&
      this.isReplaceRemoveDispatchPhase(operation);
    if (keepSourceRemovalIntentExclusive) {
      return true;
    }

    const reuseBudgetMs = this.getRecentOperationMissReuseBudgetMs(operation);
    if (!Number.isFinite(reuseBudgetMs) || reuseBudgetMs <= 0) {
      return false;
    }

    return this.getOperationAgeMs(operation) < reuseBudgetMs;
  }
}

function applyRebalanceCoordinatorOperationIntentMethods(targetClass) {
  const sourcePrototype = RebalanceCoordinatorOperationIntentMethods.prototype;
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

export {applyRebalanceCoordinatorOperationIntentMethods};
