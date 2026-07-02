const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaOperationRepositoryVisibilityMethods(
  ReplicaOperationRepository,
  options = {},
) {
  const {
    CONTROL_PLANE_PUBLICATION_STATUS,
    ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE,
    INCOMPLETE_OPERATION_OBSERVATION_SOURCE,
    INCOMPLETE_OPERATION_OBSERVATION_STATE,
    INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_CEILING_MS,
    INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS,
    INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS,
    INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE,
    INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE,
    NUM,
    PRIORITY_RECOVERY_COMPLETION_STATE,
    PRIORITY_RECOVERY_INCOMPLETE_OPERATION_OWNER_VISIBILITY_GRACE_MS,
    PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STALE_GRACE_MS,
    REPLICA_OPERATION_OWNER_PERSISTED_TRANSITION_VISIBILITY_GRACE_MS,
    REPLICA_OPERATION_READ_RETRY_DELAY_MS,
    REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
    REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE,
    REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE,
    REPLICA_OPERATION_VISIBILITY_READ_MODE,
    REPLICA_OPERATION_VISIBILITY_REASON,
    TYPEOF,
    buildPriorityRecoveryCompletion,
    buildReplicaOperationVisibilityReadOptions,
    getControlPlaneRetryAfterMs,
    hasPriorityRecoverySpreadGap,
    isRetryableControlPlaneError,
    resolveIncompleteOperationVisibilitySupplementMode,
    resolveReplicaOperationVisibilityReadMode,
  } = options;

  class ReplicaOperationRepositoryVisibilityMethods {
  /**
   * Bound retryable SQL backoff for replica_operations owner reads.
   * @param {Object} result
   * @return {number}
   * @private
   */
    getRetryableIncompleteOperationReadBackoffMs(result) {
      const retryAfterMs = getControlPlaneRetryAfterMs(result);
      if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
        return Math.min(
          INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_CEILING_MS,
          Math.max(INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS, retryAfterMs),
        );
      }
      return INCOMPLETE_OPERATION_QUERY_RETRYABLE_BACKOFF_FLOOR_MS;
    }
    /**
   * Bound authoritative operation-id read retries to a short window.
   * @param {Object} result
   * @return {number}
   * @private
   */
    getRetryableReplicaOperationReadRetryDelayMs(result) {
      const retryAfterMs = getControlPlaneRetryAfterMs(result);
      if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
        return Math.max(
          REPLICA_OPERATION_READ_RETRY_DELAY_MS,
          Math.min(REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS, retryAfterMs),
        );
      }
      return REPLICA_OPERATION_READ_RETRY_DELAY_MS;
    }
    /**
   * Wait before retrying one authoritative replica_operations read.
   * @param {number} delayMs
   * @return {Promise<void>}
   */
    async waitForReplicaOperationReadRetry(delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    getLastIncompleteOperationReadOutcome() {
      return this.lastIncompleteOperationReadOutcome ?
        {...this.lastIncompleteOperationReadOutcome} :
        null;
    }
    getLastAuthoritativeOperationVisibilityOutcome() {
      return this.lastAuthoritativeOperationVisibilityOutcome ?
        {...this.lastAuthoritativeOperationVisibilityOutcome} :
        null;
    }
    cloneIncompleteOperationObservation(operation) {
      return operation && typeof operation === TYPEOF.OBJECT ?
        {
          ...operation,
          stepsHistory: Array.isArray(operation.stepsHistory) ?
            [...operation.stepsHistory] :
            operation.stepsHistory,
        } :
        operation;
    }
    cloneIncompleteOperationObservationSet(operations = []) {
      return Array.isArray(operations) ?
        operations.map((operation) => this.cloneIncompleteOperationObservation(operation)) :
        [];
    }
    resolveOwnerPersistedTransitionVisibilityGraceMs() {
      return Math.max(
        REPLICA_OPERATION_OWNER_PERSISTED_TRANSITION_VISIBILITY_GRACE_MS,
        this.replicaOperationAuthoritativeVisibilityTimeoutMs,
      );
    }
    recordOwnerPersistedTransitionVisibilityWitness(operation) {
      if (!operation?.operationId) {
        return;
      }
      this.ownerPersistedTransitionVisibilityWitnesses.set(operation.operationId, {
        recordedAtMs: Date.now(),
        operation: this.cloneIncompleteOperationObservation(operation),
      });
    }
    clearOwnerPersistedTransitionVisibilityWitness(operationId) {
      if (!operationId) {
        return;
      }
      this.ownerPersistedTransitionVisibilityWitnesses.delete(operationId);
    }
    getOwnerPersistedTransitionVisibilityWitness(operationId, expectedOperation = null) {
      if (!operationId) {
        return null;
      }
      const witness = this.ownerPersistedTransitionVisibilityWitnesses.get(operationId);
      if (!witness || typeof witness !== TYPEOF.OBJECT) {
        return null;
      }
      if (
        Date.now() - witness.recordedAtMs >
      this.resolveOwnerPersistedTransitionVisibilityGraceMs()
      ) {
        this.ownerPersistedTransitionVisibilityWitnesses.delete(operationId);
        return null;
      }
      if (
        expectedOperation &&
      !this.isReplicaOperationVisibilitySatisfied(expectedOperation, witness.operation)
      ) {
        return null;
      }
      return {
        recordedAtMs: witness.recordedAtMs,
        operation: this.cloneIncompleteOperationObservation(witness.operation),
      };
    }
    getOwnerPersistedTransitionVisibilityFallbackOperation(
      operationId,
      expectedOperation = null,
    ) {
      const witness = this.getOwnerPersistedTransitionVisibilityWitness(
        operationId,
        expectedOperation,
      );
      return witness?.operation ?
        this.cloneIncompleteOperationObservation(witness.operation) :
        null;
    }
    getOwnerPersistedTransitionVisibilityFallbackOperationsForEntity(
      entityType,
      entityId,
    ) {
      const normalizedEntityType = String(entityType || '').trim();
      const normalizedEntityId = String(entityId || '').trim();
      if (
        normalizedEntityType.length === NUM.ZERO ||
      normalizedEntityId.length === NUM.ZERO
      ) {
        return [];
      }
      const fallbackOperations = [];
      for (const operationId of this.ownerPersistedTransitionVisibilityWitnesses.keys()) {
        const operation =
        this.getOwnerPersistedTransitionVisibilityFallbackOperation(operationId);
        if (
          !operation ||
        this.isOperationTerminal(operation) ||
        !this.isOperationLocallyOwned(operation)
        ) {
          continue;
        }
        const operationEntityType = String(
          operation.entityType || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE,
        ).trim();
        const operationEntityId = String(
          operation.entityId ||
        operation.partitionId ||
        REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE,
        ).trim();
        const entityMatches =
        (operationEntityType === normalizedEntityType &&
          operationEntityId === normalizedEntityId) ||
        (operationEntityType.length === NUM.ZERO &&
          String(operation.partitionId || '').trim() === normalizedEntityId);
        if (!entityMatches) {
          continue;
        }
        fallbackOperations.push(operation);
      }
      return this.mergeIncompleteOperationVisibilityOperations([], fallbackOperations);
    }
    resolveEntityOperationVisibilityWithPersistedTransition(operation = null) {
      if (!operation?.operationId) {
        return operation;
      }
      const witness = this.getOwnerPersistedTransitionVisibilityWitness(
        operation.operationId,
      );
      const witnessOperation = witness?.operation || null;
      if (!witnessOperation || !this.isOperationLocallyOwned(witnessOperation)) {
        return operation;
      }
      if (this.isReplicaOperationVisibilitySatisfied(witnessOperation, operation)) {
        this.clearOwnerPersistedTransitionVisibilityWitness(operation.operationId);
        return operation;
      }
      if (
        this.isOwnerPersistedTransitionVisibilityLagCandidate(
          witnessOperation,
          operation,
          witness,
        )
      ) {
        return this.cloneIncompleteOperationObservation(witnessOperation);
      }
      return operation;
    }
    reconcileEntityOperationVisibilityWithPersistedTransitions(operations = []) {
      return this.mergeIncompleteOperationVisibilityOperations(
        (Array.isArray(operations) ? operations : []).map((operation) =>
          this.resolveEntityOperationVisibilityWithPersistedTransition(operation),
        ),
        [],
      );
    }
    isOwnerPersistedTransitionVisibilityLagCandidate(
      expectedOperation,
      observedOperation,
      witness = null,
    ) {
      if (
        !expectedOperation ||
      typeof expectedOperation !== TYPEOF.OBJECT ||
      !observedOperation ||
      typeof observedOperation !== TYPEOF.OBJECT ||
      !witness ||
      typeof witness !== TYPEOF.OBJECT
      ) {
        return false;
      }
      if (observedOperation.operationId !== expectedOperation.operationId) {
        return false;
      }
      if (
        expectedOperation.replicaId !== null &&
      expectedOperation.replicaId !== undefined &&
      observedOperation.replicaId !== null &&
      observedOperation.replicaId !== undefined &&
      observedOperation.replicaId !== expectedOperation.replicaId
      ) {
        return false;
      }

      const expectedUpdatedAt = Number(expectedOperation.updatedAt);
      const witnessUpdatedAt = Number(witness.operation?.updatedAt);
      const observedUpdatedAt = Number(observedOperation.updatedAt);
      const authoritativeUpdatedAtFloor = Number.isFinite(expectedUpdatedAt) ?
        expectedUpdatedAt :
        Number.isFinite(witnessUpdatedAt) ?
          witnessUpdatedAt :
          null;
      if (
        Number.isFinite(authoritativeUpdatedAtFloor) &&
      Number.isFinite(observedUpdatedAt) &&
      observedUpdatedAt < authoritativeUpdatedAtFloor
      ) {
        return true;
      }

      const expectedCompletedAt = Number(expectedOperation.completedAt);
      const witnessCompletedAt = Number(witness.operation?.completedAt);
      const observedCompletedAt = Number(observedOperation.completedAt);
      const authoritativeCompletedAtFloor = Number.isFinite(expectedCompletedAt) ?
        expectedCompletedAt :
        Number.isFinite(witnessCompletedAt) ?
          witnessCompletedAt :
          null;
      return (
        Number.isFinite(authoritativeCompletedAtFloor) &&
      Number.isFinite(observedCompletedAt) &&
      observedCompletedAt < authoritativeCompletedAtFloor
      );
    }
    resolveIncompleteOperationObservationGraceMs() {
      return this.lastIncompleteOperationObservationSource ===
      INCOMPLETE_OPERATION_OBSERVATION_SOURCE.OWNER_PERSISTED_TRANSITION ?
        PRIORITY_RECOVERY_INCOMPLETE_OPERATION_OWNER_VISIBILITY_GRACE_MS :
        PRIORITY_RECOVERY_INCOMPLETE_OPERATION_STALE_GRACE_MS;
    }
    recordIncompleteOperationObservation(operations = [], options = {}) {
      const source =
      options?.source === INCOMPLETE_OPERATION_OBSERVATION_SOURCE.OWNER_PERSISTED_TRANSITION ?
        INCOMPLETE_OPERATION_OBSERVATION_SOURCE.OWNER_PERSISTED_TRANSITION :
        INCOMPLETE_OPERATION_OBSERVATION_SOURCE.CACHE_OR_AUTHORITATIVE_READ;
      this.lastIncompleteOperationObservation =
      this.cloneIncompleteOperationObservationSet(operations);
      this.lastIncompleteOperationObservationAtMs = Date.now();
      this.lastIncompleteOperationObservationSource = source;
    }
    syncIncompleteOperationObservation(operation) {
      if (!operation?.operationId) {
        return;
      }
      const observedOperations = this.cloneIncompleteOperationObservationSet(
        this.lastIncompleteOperationObservation,
      );
      const operationIndex = observedOperations.findIndex(
        (entry) => entry?.operationId === operation.operationId,
      );
      if (this.isOperationTerminal(operation)) {
        if (operationIndex >= NUM.ZERO) {
          observedOperations.splice(operationIndex, NUM.ONE);
        }
        this.recordIncompleteOperationObservation(observedOperations, {
          source: INCOMPLETE_OPERATION_OBSERVATION_SOURCE.OWNER_PERSISTED_TRANSITION,
        });
        return;
      }
      const observedOperation = this.cloneIncompleteOperationObservation(operation);
      if (operationIndex >= NUM.ZERO) {
        observedOperations[operationIndex] = observedOperation;
      } else {
        observedOperations.push(observedOperation);
      }
      this.recordIncompleteOperationObservation(
        this.mapAndSortIncompleteOperations(
          observedOperations.map((entry) => this.buildReplicaOperationRow(entry)),
        ),
        {
          source: INCOMPLETE_OPERATION_OBSERVATION_SOURCE.OWNER_PERSISTED_TRANSITION,
        },
      );
    }
    resolveIncompleteOperationObservation(operations = []) {
      const normalizedOperations = Array.isArray(operations) ? operations : [];
      const deferredOutcome = this.getLastIncompleteOperationReadOutcome();
      const hasDeferredOwnerRead =
      deferredOutcome?.completionState ===
      PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED;
      const state =
      normalizedOperations.length > NUM.ZERO ?
        INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
        hasDeferredOwnerRead ?
          INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED :
          INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY;
      return Object.freeze({
        state,
        operationCount: normalizedOperations.length,
        deferredOutcome,
        retryAfterMs: Number.isFinite(deferredOutcome?.retryAfterMs) ?
          deferredOutcome.retryAfterMs :
          null,
      });
    }
    clearIncompleteOperationReadOutcome() {
      this.lastIncompleteOperationReadOutcome = null;
    }
    clearAuthoritativeOperationVisibilityOutcome() {
      this.lastAuthoritativeOperationVisibilityOutcome = null;
    }
    resolvePriorityRecoveryPlanningSnapshotForOwnerRead() {
      const readinessService = this.controlPlaneReadinessService;
      if (!readinessService) {
        return null;
      }
      const observedAt = Date.now();
      if (typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort === TYPEOF.FUNCTION) {
        return (
          readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(this.nodeId, observedAt) ||
        null
        );
      }
      if (
        typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort === TYPEOF.FUNCTION
      ) {
        return (
          readinessService.getMembershipPublicationPlanningSnapshotBestEffort(
            this.nodeId,
            observedAt,
          ) || null
        );
      }
      if (typeof readinessService.getPriorityRecoveryPlanningAnswerSync === TYPEOF.FUNCTION) {
        return (
          readinessService.getPriorityRecoveryPlanningAnswerSync(this.nodeId, observedAt) || null
        );
      }
      if (typeof readinessService.getMembershipPublicationPlanningAnswerSync === TYPEOF.FUNCTION) {
        return (
          readinessService.getMembershipPublicationPlanningAnswerSync(this.nodeId, observedAt) || null
        );
      }
      if (typeof readinessService.getPriorityRecoveryPlanningSnapshotSync === TYPEOF.FUNCTION) {
        return (
          readinessService.getPriorityRecoveryPlanningSnapshotSync(this.nodeId, observedAt) || null
        );
      }
      if (typeof readinessService.getMembershipPublicationPlanningSnapshotSync === TYPEOF.FUNCTION) {
        return (
          readinessService.getMembershipPublicationPlanningSnapshotSync(this.nodeId, observedAt) ||
        null
        );
      }
      return null;
    }
    isPriorityRecoveryOwnerReadActive(planningSnapshot = null) {
      if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
        return false;
      }
      const publicationStatus = String(
        planningSnapshot.publicationStatus || planningSnapshot.status || '',
      )
        .trim()
        .toUpperCase();
      if (
        publicationStatus.length > NUM.ZERO &&
      publicationStatus !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED
      ) {
        return true;
      }
      return hasPriorityRecoverySpreadGap(planningSnapshot.priorityPartitionSummary || null);
    }
    canReuseLastIncompleteOperationObservation() {
      return (
        Array.isArray(this.lastIncompleteOperationObservation) &&
      this.lastIncompleteOperationObservation.length > NUM.ZERO &&
      Date.now() - this.lastIncompleteOperationObservationAtMs <=
        this.resolveIncompleteOperationObservationGraceMs()
      );
    }
    buildDeferredIncompleteOperationReadOutcome(options = {}) {
      const priorityRecoveryActive = options.priorityRecoveryActive === true;
      if (priorityRecoveryActive !== true) {
        return null;
      }
      const completion = buildPriorityRecoveryCompletion({
        authoritativeOperationReadDeferred: true,
        priorityRecoveryActive: true,
        retryAfterMs: options.retryAfterMs,
      });
      const fallbackOperationCount = Array.isArray(options.fallbackOperations) ?
        options.fallbackOperations.length :
        Array.isArray(options.cachedOperations) ?
          options.cachedOperations.length :
          NUM.ZERO;
      return {
        completionState: completion.state,
        reasonCode: completion.reasonCode,
        retryAfterMs: completion.retryAfterMs,
        cachedOperationCount: fallbackOperationCount,
        fallbackOperationCount,
        queryDurationMs: Number.isFinite(options.queryDurationMs) ?
          Math.floor(options.queryDurationMs) :
          null,
        source:
        typeof options.source === TYPEOF.STRING ?
          options.source :
          INCOMPLETE_OPERATION_READ_OUTCOME_SOURCE.PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_READ,
      };
    }
    buildDeferredAuthoritativeOperationVisibilityOutcome(options = {}) {
      const priorityRecoveryActive = options.priorityRecoveryActive === true;
      if (priorityRecoveryActive !== true) {
        return null;
      }
      const completion = buildPriorityRecoveryCompletion({
        authoritativeOperationReadDeferred: true,
        priorityRecoveryActive: true,
        retryAfterMs: options.retryAfterMs,
      });
      return {
        confirmationState: REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED,
        completionState: completion.state,
        reasonCode: completion.reasonCode,
        retryAfterMs: completion.retryAfterMs,
        queryDurationMs: Number.isFinite(options.queryDurationMs) ?
          Math.floor(options.queryDurationMs) :
          null,
        operationId:
        typeof options.operationId === TYPEOF.STRING ?
          options.operationId :
          null,
        source:
        typeof options.source === TYPEOF.STRING ?
          options.source :
          REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
            .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_FAILURE,
      };
    }
    buildOwnerPersistedTransitionDeferredVisibilityOutcome(options = {}) {
      const operationId =
      typeof options.operationId === TYPEOF.STRING ?
        options.operationId :
        null;
      if (!operationId) {
        return null;
      }
      return {
        confirmationState: REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED,
        completionState: null,
        reasonCode:
        REPLICA_OPERATION_VISIBILITY_REASON
          .OWNER_PERSISTED_TRANSITION_PENDING_AUTHORITATIVE_CONFIRMATION,
        retryAfterMs: Number.isFinite(options.retryAfterMs) ?
          Math.floor(options.retryAfterMs) :
          null,
        queryDurationMs: Number.isFinite(options.queryDurationMs) ?
          Math.floor(options.queryDurationMs) :
          null,
        operationId,
        source:
        typeof options.source === TYPEOF.STRING ?
          options.source :
          REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
            .OWNER_PERSISTED_TRANSITION_EMPTY_READ,
      };
    }
    buildDeferredEntityOperationVisibilityOutcome(options = {}) {
      const priorityRecoveryActive = options.priorityRecoveryActive === true;
      if (priorityRecoveryActive !== true) {
        return null;
      }
      const completion = buildPriorityRecoveryCompletion({
        authoritativeOperationReadDeferred: true,
        priorityRecoveryActive: true,
        retryAfterMs: options.retryAfterMs,
      });
      const fallbackOperationCount = Array.isArray(options.fallbackOperations) ?
        options.fallbackOperations.length :
        Array.isArray(options.cachedOperations) ?
          options.cachedOperations.length :
          NUM.ZERO;
      return {
        completionState: completion.state,
        reasonCode: completion.reasonCode,
        retryAfterMs: completion.retryAfterMs,
        cachedOperationCount: fallbackOperationCount,
        fallbackOperationCount,
        queryDurationMs: Number.isFinite(options.queryDurationMs) ?
          Math.floor(options.queryDurationMs) :
          null,
        entityType: typeof options.entityType === TYPEOF.STRING ? options.entityType : null,
        entityId: typeof options.entityId === TYPEOF.STRING ? options.entityId : null,
        source:
        typeof options.source === TYPEOF.STRING ?
          options.source :
          ENTITY_OPERATION_VISIBILITY_OUTCOME_SOURCE.PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_READ,
      };
    }
    buildOperationVisibilityObservation(operation = null, deferredOutcome = null) {
      const hasDeferredOwnerRead =
      deferredOutcome?.completionState ===
        PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED ||
      deferredOutcome?.confirmationState ===
        REPLICA_OPERATION_VISIBILITY_CONFIRMATION_STATE.DEFERRED;
      const normalizedOperation =
      operation && typeof operation === TYPEOF.OBJECT ? {...operation} : null;
      return Object.freeze({
        state: normalizedOperation ?
          INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
          hasDeferredOwnerRead ?
            INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED :
            INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
        operation: normalizedOperation,
        deferredOutcome: deferredOutcome ? {...deferredOutcome} : null,
        retryAfterMs: Number.isFinite(deferredOutcome?.retryAfterMs) ?
          deferredOutcome.retryAfterMs :
          null,
      });
    }
    buildEntityOperationVisibilityObservation(operations = [], deferredOutcome = null) {
      const normalizedOperations = this.cloneIncompleteOperationObservationSet(
        Array.isArray(operations) ? operations : [],
      );
      const hasDeferredOwnerRead =
      deferredOutcome?.completionState ===
      PRIORITY_RECOVERY_COMPLETION_STATE.AUTHORITATIVE_OPERATION_READ_DEFERRED;
      return Object.freeze({
        state:
        normalizedOperations.length > NUM.ZERO ?
          INCOMPLETE_OPERATION_OBSERVATION_STATE.PRESENT :
          hasDeferredOwnerRead ?
            INCOMPLETE_OPERATION_OBSERVATION_STATE.DEFERRED :
            INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY,
        operationCount: normalizedOperations.length,
        operations: normalizedOperations,
        deferredOutcome: deferredOutcome ? {...deferredOutcome} : null,
        retryAfterMs: Number.isFinite(deferredOutcome?.retryAfterMs) ?
          deferredOutcome.retryAfterMs :
          null,
      });
    }
    mergeIncompleteOperationVisibilityOperations(
      cachedOperations = [],
      authoritativeOperations = [],
    ) {
      const mergedByOperationId = new Map();
      const appendOperations = (operations = []) => {
        for (const operation of operations) {
          if (!operation?.operationId) {
            continue;
          }
          mergedByOperationId.set(operation.operationId, operation);
        }
      };

      appendOperations(cachedOperations);
      appendOperations(authoritativeOperations);

      return [...mergedByOperationId.values()].sort((left, right) => {
        const leftUpdatedAt = Number(left?.updatedAt) || NUM.ZERO;
        const rightUpdatedAt = Number(right?.updatedAt) || NUM.ZERO;
        if (leftUpdatedAt !== rightUpdatedAt) {
          return leftUpdatedAt - rightUpdatedAt;
        }
        return String(left?.operationId || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE).localeCompare(
          String(right?.operationId || REPLICA_OPERATION_REPOSITORY_LITERAL.VALUE),
        );
      });
    }
    async getIncompleteOperationVisibilityObservation(options = {}) {
      const visibilityReadMode =
      resolveReplicaOperationVisibilityReadMode(options) ||
      REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_PREFERRED_SQL_FALLBACK;
      const visibilitySupplementMode = resolveIncompleteOperationVisibilitySupplementMode(options);
      const cachedOperations = Array.isArray(options?.cachedOperations) ?
        this.cloneIncompleteOperationObservationSet(options.cachedOperations) :
        [];
      let visibleOperations = [];

      if (
        cachedOperations.length > NUM.ZERO &&
      visibilitySupplementMode ===
        INCOMPLETE_OPERATION_VISIBILITY_SUPPLEMENT_MODE.AUTHORITATIVE_SUPPLEMENT &&
      visibilityReadMode !== REPLICA_OPERATION_VISIBILITY_READ_MODE.CACHE_ONLY
      ) {
        visibleOperations = this.mergeIncompleteOperationVisibilityOperations(
          cachedOperations,
          await this.queryIncompleteOperations({
            visibilityReadMode: REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
          }),
        );
      } else if (
        cachedOperations.length > NUM.ZERO &&
      visibilityReadMode !== REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED
      ) {
        this.recordIncompleteOperationObservation(cachedOperations);
        this.clearIncompleteOperationReadOutcome();
        visibleOperations = cachedOperations;
      } else {
        visibleOperations = await this.queryIncompleteOperations({
          visibilityReadMode,
        });
      }

      const visibilityObservation = this.resolveIncompleteOperationObservation(visibleOperations);

      return Object.freeze({
        ...visibilityObservation,
        operations: this.cloneIncompleteOperationObservationSet(visibleOperations),
      });
    }
    resolveDeferredIncompleteOperationReadFallback(cachedOperations = []) {
      if (Array.isArray(cachedOperations) && cachedOperations.length > NUM.ZERO) {
        return this.cloneIncompleteOperationObservationSet(cachedOperations);
      }
      if (this.canReuseLastIncompleteOperationObservation()) {
        return this.cloneIncompleteOperationObservationSet(this.lastIncompleteOperationObservation);
      }
      return [];
    }
    shouldDeferIncompleteOperationEmptyRead(
      result,
      queryDurationMs,
      cachedOperations = [],
      planningSnapshot = null,
    ) {
      return (
        result?.success === true &&
      Array.isArray(result?.rows) &&
      result.rows.length === NUM.ZERO &&
      queryDurationMs >= INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS &&
      this.isPriorityRecoveryOwnerReadActive(planningSnapshot) &&
      (cachedOperations.length > NUM.ZERO || this.canReuseLastIncompleteOperationObservation())
      );
    }
    shouldDeferEntityOperationEmptyRead(result, queryDurationMs, planningSnapshot = null) {
      return (
        result?.success === true &&
      Array.isArray(result?.rows) &&
      result.rows.length === NUM.ZERO &&
      queryDurationMs >= INCOMPLETE_OPERATION_QUERY_SLOW_THRESHOLD_MS &&
      this.isPriorityRecoveryOwnerReadActive(planningSnapshot)
      );
    }
    shouldDeferIncompleteOperationReadFailure(
      result,
      planningSnapshot = null,
      options = {},
    ) {
      const cachedOperations = Array.isArray(options.cachedOperations) ?
        options.cachedOperations :
        [];
      const fallbackOperations = Array.isArray(options.fallbackOperations) ?
        options.fallbackOperations :
        [];
      const hasReusableOperationEvidence =
      cachedOperations.length > NUM.ZERO ||
      fallbackOperations.length > NUM.ZERO ||
      this.canReuseLastIncompleteOperationObservation();
      return (
        result?.success === false &&
      (
        this.isPriorityRecoveryOwnerReadActive(planningSnapshot) ||
        (
          hasReusableOperationEvidence &&
          isRetryableControlPlaneError(result)
        )
      )
      );
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryVisibilityMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaOperationRepositoryVisibilityMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaOperationRepositoryVisibilityMethods};
