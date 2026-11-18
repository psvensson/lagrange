import {
  assignReplicaOperationRepositoryEntityReadMethods,
} from './replica-operation-repository-entity-read-methods.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {
  assignReplicaOperationRepositoryIncompleteReadMethods,
} from './replica-operation-repository-incomplete-read-methods.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {
  OPERATION_VISIBILITY_STATE,
  buildAbsentOperationVisibility,
  buildOperationListUnavailableError,
  buildOperationVisibilityUnavailableError,
  buildPresentOperationVisibility,
  buildUnavailableOperationVisibility,
  readOperationVisibilityState,
} from './replica-operation-repository-operation-visibility.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const IN_FLIGHT_DEDUPE_SCOPE = 'in-flight operations for a move intent';
const REPLICA_OPERATION_READ_COALESCING_KEY_SEPARATOR = ':';
const REPLICA_OPERATION_READ_BY_ID_COALESCING_KEY_PREFIX =
  'replica-operation';
const REPLICA_OPERATION_OWNER_READ_COALESCING_KEY_PREFIX =
  'replica-operation-owner';
const REPLICA_OPERATION_ENTITY_READ_COALESCING_KEY_PREFIX =
  'replica-operation-entity';
const REPLICA_OPERATION_ENTITY_NODE_READ_COALESCING_KEY_PREFIX =
  'replica-operation-entity-node';
const REPLICA_OPERATION_MEMBERSHIP_LANE_READ_COALESCING_KEY_PREFIX =
  'replica-operation-membership-lane';
const REPLICA_OPERATION_READ_DELIVERY_SOURCE_PREFIX = 'control-plane:read';
const REPLICA_OPERATION_READ_RETRY_WAIT = Object.freeze({
  wait: 'REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS',
  awaited: 'authoritative replica_operations read without a retryable failure',
});

/**
 * The authoritative read retry window is spent with the read still failing
 * retryably: one wait_bound_spent ERROR; the caller still gets the failure.
 * @param {Object} repository
 * @param {Object} result - The last retryable failure.
 * @param {Object} spent - {boundMs, elapsedMs, attempts, coalescingKey}
 * @return {void}
 */
function reportReplicaOperationReadRetrySpent(repository, result, spent) {
  reportWaitBoundSpent(repository.logger, {
    ...REPLICA_OPERATION_READ_RETRY_WAIT,
    boundMs: spent.boundMs,
    elapsedMs: spent.elapsedMs,
    lastObserved: {
      errorCode: result?.errorCode || result?.code || null,
      error: result?.error || result?.message || null,
      attempts: spent.attempts,
      coalescingKey: spent.coalescingKey || null,
    },
    scope: {nodeId: repository.nodeId || null},
  });
}

function assignReplicaOperationRepositoryReadMethods(ReplicaOperationRepository, options = {}) {
  const {
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    CONTROL_PLANE_PARTICIPATION_KIND,
    INITIAL_PARTITION_IDS,
    REPLICA_OPERATION_LOCAL_VISIBILITY_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_LOCAL_OWNER_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_OWNER_PREFERRED_READ_QUERY_OPTIONS,
    REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS,
    REPLICA_OPERATION_READINESS_DIMENSION,
    REPLICA_OPERATION_REPOSITORY_LITERAL,
    REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
    REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE,
    REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS,
    SQL,
    SYSTEM_TABLE_NAME,
    getControlPlaneRetryAfterMs,
    getRemainingBudgetMs,
    isCoordinatorOwnedOperationType,
    isRetryableControlPlaneError,
    readAuthoritativeControlPlaneRows,
    shouldDeferReplicaOperationOwnerRead,
  } = options;
  // The create dedupe read is the owner's: absence decides a create.
  const IN_FLIGHT_DEDUPE_READ_OPTIONS = Object.freeze({
    authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  });

  class ReplicaOperationRepositoryReadMethods {
  /**
   * Execute a read query against the replica_operations table.
   * @param {string} sql
   * @param {Array} params
   * @return {Promise<object>}
   */
    async executeReplicaOperationsRead(sql, params = [], readOptions = null) {
      const participationFailure = this.buildReplicaOperationReadParticipationFailure();
      if (participationFailure) {
        return participationFailure;
      }

      const retryOnRetryableFailure = Boolean(
        readOptions &&
      typeof readOptions === 'object' &&
      readOptions.retryOnRetryableFailure === true,
      );
      const queryOptions =
      readOptions && typeof readOptions === 'object' ?
        {
          ...REPLICA_OPERATION_LOCAL_OWNER_READ_QUERY_OPTIONS,
          ...readOptions,
        } :
        {
          ...REPLICA_OPERATION_LOCAL_OWNER_READ_QUERY_OPTIONS,
        };
      const coalescingKey =
        this.resolveReplicaOperationReadCoalescingKey(sql, params);
      if (
        !queryOptions.coalescingKey &&
        typeof coalescingKey === 'string' &&
        coalescingKey.length > 0
      ) {
        queryOptions.coalescingKey = coalescingKey;
      }
      if (
        !queryOptions.deliverySource &&
        typeof queryOptions.coalescingKey === 'string' &&
        queryOptions.coalescingKey.length > 0
      ) {
        queryOptions.deliverySource =
          this.buildReplicaOperationReadDeliverySource(
            queryOptions.coalescingKey,
          );
      }

      delete queryOptions.retryOnRetryableFailure;
      if (queryOptions.authoritativeReadMode === undefined) {
        delete queryOptions.authoritativeReadMode;
      }

      const executeRead = async () => {
        return readAuthoritativeControlPlaneRows(
          this.controlPlaneSystemTableGateway,
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          sql,
          params,
          queryOptions,
        );
      };

      if (!retryOnRetryableFailure) {
        return executeRead();
      }

      const startedAtMs = this.timeSource.now();
      const enclosingRemainingMs = queryOptions.timeoutBudget &&
        typeof queryOptions.timeoutBudget === 'object' ?
        getRemainingBudgetMs(queryOptions.timeoutBudget, {
          now: () => this.timeSource.now(),
        }) :
        REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS;
      const retryBoundMs = Math.min(
        REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS,
        enclosingRemainingMs,
      );
      const deadlineAtMs = startedAtMs + retryBoundMs;
      let attempts = 0;
      while (true) {
        const result = await executeRead();
        attempts += 1;
        if (result?.success !== false || !isRetryableControlPlaneError(result)) {
          return result;
        }

        const remainingMs = deadlineAtMs - this.timeSource.now();
        if (remainingMs <= 0) {
          reportReplicaOperationReadRetrySpent(this, result, {
            boundMs: retryBoundMs,
            elapsedMs: this.timeSource.now() - startedAtMs,
            attempts,
            coalescingKey: queryOptions.coalescingKey,
          });
          return result;
        }
        // Stop re-arming the backoff once the owning coordinator is shutting
        // down (otherwise this retry timer keeps the event loop alive).
        if (typeof this.isShuttingDownRequested === 'function' &&
            this.isShuttingDownRequested()) {
          return result;
        }

        await this.waitForReplicaOperationReadRetry(
          Math.min(this.getRetryableReplicaOperationReadRetryDelayMs(result), remainingMs),
        );
      }
    }

    /**
   * Return a bounded deferred result when the canonical readiness owner says
   * the local replica_operations owner path should not issue a routed read yet.
   * @return {Object|null}
   * @private
   */
    buildReplicaOperationReadParticipationFailure() {
      if (
        !this.controlPlaneReadinessService ||
      typeof this.controlPlaneReadinessService.getControlPlaneParticipationSync !== 'function'
      ) {
        return null;
      }

      const participation = this.controlPlaneReadinessService.getControlPlaneParticipationSync(
        this.nodeId,
        {
          participationKind: CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ,
          decisionDimension: REPLICA_OPERATION_READINESS_DIMENSION,
          tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          partitionId: INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS] || null,
        },
      );
      if (!participation || participation.eligible === true) {
        return null;
      }
      if (participation.localExecutionAllowed === true) {
        return null;
      }
      if (!shouldDeferReplicaOperationOwnerRead(participation)) {
        return null;
      }
      return {
        success: false,
        tableName: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        error:
        participation.error ||
        REPLICA_OPERATION_REPOSITORY_LITERAL
          .CONTROL_PLANE_PARTICIPATION_DEFERRED_BY_CANONICAL_READINESS,
        errorCode: participation.errorCode || null,
        code: participation.errorCode || null,
        reasonCode: participation.reasonCode || null,
        participationKind: participation.participationKind || null,
        retryAfterMs: getControlPlaneRetryAfterMs(participation) || null,
        deferRetry: participation.deferRetry === true,
        rows: [],
      };
    }

    /**
   * Resolve a fairness key for replica_operations reads from the declared
   * repository query shape.
   * @param {string} sql
   * @param {Array} params
   * @return {string|null}
   * @private
   */
    resolveReplicaOperationReadCoalescingKey(sql, params = []) {
      if (sql === SQL.SELECT_OPERATION_BY_ID) {
        return this.buildReplicaOperationReadCoalescingKey(
          REPLICA_OPERATION_READ_BY_ID_COALESCING_KEY_PREFIX,
          params[0],
        );
      }
      if (sql === SQL.SELECT_INCOMPLETE_OPERATIONS) {
        return this.buildReplicaOperationReadCoalescingKey(
          REPLICA_OPERATION_OWNER_READ_COALESCING_KEY_PREFIX,
          this.nodeId,
        );
      }
      if (sql === SQL.SELECT_OPERATIONS_BY_ENTITY) {
        return this.buildReplicaOperationReadCoalescingKey(
          REPLICA_OPERATION_ENTITY_READ_COALESCING_KEY_PREFIX,
          params[1],
        );
      }
      if (sql === SQL.SELECT_IN_FLIGHT_FOR_ENTITY_NODE) {
        return this.buildReplicaOperationReadCoalescingKey(
          REPLICA_OPERATION_ENTITY_NODE_READ_COALESCING_KEY_PREFIX,
          params[0],
          params[1],
        );
      }
      if (sql === SQL.SELECT_OPERATION_BY_MESSAGE_GROUP_MEMBERSHIP_LANE) {
        return this.buildReplicaOperationReadCoalescingKey(
          REPLICA_OPERATION_MEMBERSHIP_LANE_READ_COALESCING_KEY_PREFIX,
          params[0],
        );
      }
      return null;
    }

    /**
   * @param {string} prefix
   * @param {...string} values
   * @return {string|null}
   * @private
   */
    buildReplicaOperationReadCoalescingKey(prefix, ...values) {
      const normalizedValues = values.filter((value) => {
        return typeof value === 'string' && value.length > 0;
      });
      if (
        typeof prefix !== 'string' ||
        prefix.length === 0 ||
        normalizedValues.length === 0
      ) {
        return null;
      }
      return [
        prefix,
        ...normalizedValues,
      ].join(REPLICA_OPERATION_READ_COALESCING_KEY_SEPARATOR);
    }

    /**
   * @param {string} coalescingKey
   * @return {string}
   * @private
   */
    buildReplicaOperationReadDeliverySource(coalescingKey) {
      return [
        REPLICA_OPERATION_READ_DELIVERY_SOURCE_PREFIX,
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        coalescingKey,
      ].join(REPLICA_OPERATION_READ_COALESCING_KEY_SEPARATOR);
    }

    /**
   * ADVISORY projection read of one operation: the local cache row, else an
   * owner-preferred read that may fall back to local SQL. It is never
   * authority: null means "not visible in the projection" (a cache miss
   * with an empty or FAILED fallback read), never confirmed absence. A
   * consumer that discharges, completes or drops work on what it reads uses
   * getOperationByIdVisibilityObservation with OWNER_RPC_REQUIRED instead.
   * @param {string} operationId
   * @return {Promise<object|null>}
   */
    async queryOperationProjectionById(operationId) {
      const cachedRow = this.getReplicaOperationRowFromCache(operationId);
      if (cachedRow) {
        return this.rowToOperation(cachedRow);
      }

      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_OPERATION_BY_ID,
        [operationId],
        REPLICA_OPERATION_OWNER_PREFERRED_READ_QUERY_OPTIONS,
      );
      if (!result.success || !result.rows || result.rows.length === 0) {
        return null;
      }

      const operation = this.rowToOperation(result.rows[0]);
      return isCoordinatorOwnedOperationType(operation?.type) ?
        operation :
        null;
    }

    /**
   * Read one operation from the authoritative owner path only and classify
   * the answer into the by-id visibility contract
   * (replica-operation-repository-operation-visibility.js): PRESENT, ABSENT
   * (the read succeeded and holds no coordinator-owned row) or UNAVAILABLE
   * (the read failed, or the owner deferred it). A failed read is never
   * ABSENT and no projected row is ever returned.
   * @param {string} operationId
   * @param {object} [options]
   * @param {string} [options.authoritativeReadMode]
   * @return {Promise<object>} Frozen named-state observation.
   */
    async queryAuthoritativeOperationVisibilityObservation(operationId, options = {}) {
      const allowPriorityRecoveryDeferredVisibility =
      options?.allowPriorityRecoveryDeferredVisibility === true;
      const allowOwnerPersistedTransitionDeferredVisibility =
      options?.allowOwnerPersistedTransitionDeferredVisibility === true;
      const expectedOperation =
      options?.expectedOperation ||
      (allowOwnerPersistedTransitionDeferredVisibility ?
        this.getOwnerPersistedTransitionVisibilityFallbackOperation(operationId) :
        null);
      const ownerPersistedTransitionWitness = allowOwnerPersistedTransitionDeferredVisibility ?
        this.getOwnerPersistedTransitionVisibilityWitness(
          operationId,
          expectedOperation,
        ) :
        null;
      let readQueryOptions = REPLICA_OPERATION_VISIBILITY_READ_QUERY_OPTIONS;
      if (
        options?.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY
      ) {
        readQueryOptions = REPLICA_OPERATION_LOCAL_VISIBILITY_READ_QUERY_OPTIONS;
      } else if (
        options?.authoritativeReadMode ===
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED
      ) {
        readQueryOptions = REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS;
      }
      const queryStartedAtMs = this.timeSource.now();
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_OPERATION_BY_ID,
        [operationId],
        {
          ...readQueryOptions,
          leaderMode: options?.leaderMode,
          retryOnRetryableFailure:
            options?.authoritativeReadMode !==
            CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
          timeoutBudget: options?.timeoutBudget,
        },
      );
      const queryDurationMs = this.timeSource.now() - queryStartedAtMs;

      if (!result.success || !Array.isArray(result.rows) || result.rows.length === 0) {
        const isEmptyRead =
        result.success === true && Array.isArray(result.rows) && result.rows.length === 0;
        const isRetryableAuthoritativeFailure =
          result.success === false && isRetryableControlPlaneError(result);
        let deferredOutcome = null;
        if (ownerPersistedTransitionWitness && (isEmptyRead || isRetryableAuthoritativeFailure)) {
          deferredOutcome = this.buildOwnerPersistedTransitionDeferredVisibilityOutcome({
            retryAfterMs:
              isEmptyRead ?
                this.replicaOperationAuthoritativeVisibilityRetryDelayMs :
                this.getRetryableReplicaOperationReadRetryDelayMs(result),
            queryDurationMs,
            operationId,
            source:
              isEmptyRead ?
                REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
                  .OWNER_PERSISTED_TRANSITION_EMPTY_READ :
                REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
                  .OWNER_PERSISTED_TRANSITION_RETRYABLE_FAILURE,
          });
        }
        if (!deferredOutcome) {
          const planningSnapshot = allowPriorityRecoveryDeferredVisibility ?
            this.resolvePriorityRecoveryPlanningSnapshotForOwnerRead() :
            null;
          const priorityRecoveryActive = !result.success ?
            this.shouldDeferIncompleteOperationReadFailure(result, planningSnapshot) :
            this.isPriorityRecoveryOwnerReadActive(planningSnapshot);
          const source = !result.success ?
            REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
              .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_FAILURE :
            REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
              .PRIORITY_RECOVERY_AUTHORITATIVE_OPERATION_EMPTY_READ;
          deferredOutcome = this.buildDeferredAuthoritativeOperationVisibilityOutcome({
            priorityRecoveryActive,
            retryAfterMs: this.getRetryableReplicaOperationReadRetryDelayMs(result),
            queryDurationMs,
            operationId,
            source,
          });
        }
        if (!deferredOutcome && !isEmptyRead) {
          // The read FAILED rather than returning an empty row set: that is
          // unavailability for every caller, never absence.
          deferredOutcome = this.buildAuthoritativeReadUnavailableOutcome(
            result,
            {
              retryAfterMs:
                this.getRetryableReplicaOperationReadRetryDelayMs(result),
              queryDurationMs,
              operationId,
            },
          );
        }

        return deferredOutcome ?
          buildUnavailableOperationVisibility(deferredOutcome) :
          buildAbsentOperationVisibility();
      }

      const matchingRow =
      result.rows.find((row) => {
        return row?.operation_id === operationId;
      }) || result.rows[0];
      const operation = this.rowToOperation(matchingRow);
      if (
        allowOwnerPersistedTransitionDeferredVisibility &&
      ownerPersistedTransitionWitness &&
      this.isOwnerPersistedTransitionVisibilityLagCandidate(
        expectedOperation,
        operation,
        ownerPersistedTransitionWitness,
      )
      ) {
        return buildUnavailableOperationVisibility(
          this.buildOwnerPersistedTransitionDeferredVisibilityOutcome({
            retryAfterMs: this.replicaOperationAuthoritativeVisibilityRetryDelayMs,
            queryDurationMs,
            operationId,
            source:
            REPLICA_OPERATION_VISIBILITY_OUTCOME_SOURCE
              .OWNER_PERSISTED_TRANSITION_STALE_READ,
          }),
        );
      }
      if (
        ownerPersistedTransitionWitness &&
      this.isReplicaOperationVisibilitySatisfied(
        ownerPersistedTransitionWitness.operation,
        operation,
      )
      ) {
        this.clearOwnerPersistedTransitionVisibilityWitness(operationId);
      }
      return isCoordinatorOwnedOperationType(operation?.type) ?
        buildPresentOperationVisibility(operation) :
        buildAbsentOperationVisibility();
    }

    /**
     * The authoritative operation, or null for a CONFIRMED absence at the
     * requested read mode. An unavailable read throws the typed retryable
     * error (buildOperationVisibilityUnavailableError); it is never null.
     * @param {string} operationId
     * @param {Object} [options]
     * @return {Promise<Object|null>}
     */
    async queryAuthoritativeOperationById(operationId, options = {}) {
      const observation = await this.queryAuthoritativeOperationVisibilityObservation(operationId, {
        authoritativeReadMode: options?.authoritativeReadMode,
        leaderMode: options?.leaderMode,
        allowPriorityRecoveryDeferredVisibility: false,
      });
      if (
        readOperationVisibilityState(observation) ===
        OPERATION_VISIBILITY_STATE.UNAVAILABLE
      ) {
        throw buildOperationVisibilityUnavailableError(observation, operationId);
      }
      return observation.operation;
    }

    /**
     * The by-id visibility contract for a keyed authoritative row read: a
     * failed read is UNAVAILABLE (typed), an empty answer ABSENT, a row of a
     * coordinator-owned type PRESENT.
     * @param {Object} result
     * @param {Object} unavailableContext - {retryAfterMs, queryDurationMs}.
     * @return {Object}
     * @private
     */
    classifyAuthoritativeOperationRowRead(result, unavailableContext = {}) {
      if (result?.success !== true || !Array.isArray(result.rows)) {
        return buildUnavailableOperationVisibility(
          this.buildAuthoritativeReadUnavailableOutcome(result, {
            retryAfterMs: this.getRetryableReplicaOperationReadRetryDelayMs(result),
            ...unavailableContext,
          }),
        );
      }
      if (result.rows.length === 0) {
        return buildAbsentOperationVisibility();
      }
      const operation = this.rowToOperation(result.rows[0]);
      return isCoordinatorOwnedOperationType(operation?.type) ?
        buildPresentOperationVisibility(operation) :
        buildAbsentOperationVisibility();
    }

    /**
     * Observe the authoritative operation holding one durable runtime target
     * identity claim (named state: PRESENT / ABSENT / UNAVAILABLE).
     * @param {string} targetClaimKey
     * @return {Promise<Object>}
     */
    async observeAuthoritativeOperationByTargetClaimKey(targetClaimKey) {
      if (
        typeof targetClaimKey !== 'string' ||
        targetClaimKey.length === 0
      ) {
        return buildAbsentOperationVisibility();
      }
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_OPERATION_BY_TARGET_CLAIM,
        [targetClaimKey],
        {
          ...REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
          leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
          retryOnRetryableFailure: true,
        },
      );
      return this.classifyAuthoritativeOperationRowRead(result);
    }

    /**
     * Observe the authoritative operation retaining one message-group
     * membership lane (named state). The nullable unique key is released
     * only by the membership owner after it proves definitive non-admission
     * or a fresh committed absence.
     * @param {string} laneKey
     * @return {Promise<Object>}
     */
    async observeAuthoritativeOperationByMessageGroupMembershipLane(laneKey) {
      if (typeof laneKey !== 'string' || laneKey.length === 0) {
        return buildAbsentOperationVisibility();
      }
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_OPERATION_BY_MESSAGE_GROUP_MEMBERSHIP_LANE,
        [laneKey],
        {
          ...REPLICA_OPERATION_STRICT_VISIBILITY_QUERY_OPTIONS,
          leaderMode: CONTROL_PLANE_READ_LEADER_MODE.PREFERRED,
          retryOnRetryableFailure: true,
        },
      );
      return this.classifyAuthoritativeOperationRowRead(result);
    }

    /**
     * The workflow owner's by-id visibility read: the authoritative
     * observation, with this owner's own persisted-transition witness
     * honoured as a deferral (an empty or lagging read behind a transition
     * this owner just committed is UNAVAILABLE, not ABSENT) unless the
     * caller turns it off. It reads nothing else: no cache row and no
     * owner-preferred SQL fallback stand in for the owner.
     * @param {string} operationId
     * @param {Object} [options]
     * @param {string} [options.authoritativeReadMode]
     * @param {string} [options.leaderMode]
     * @param {boolean} [options.allowPriorityRecoveryDeferredVisibility]
     * @param {boolean} [options.allowOwnerPersistedTransitionDeferredVisibility]
     *   Default true.
     * @return {Promise<Object>} Frozen named-state observation.
     */
    async getOperationByIdVisibilityObservation(operationId, options = {}) {
      return this.queryAuthoritativeOperationVisibilityObservation(
        operationId,
        {
          authoritativeReadMode: options?.authoritativeReadMode,
          leaderMode: options?.leaderMode,
          allowPriorityRecoveryDeferredVisibility:
          options?.allowPriorityRecoveryDeferredVisibility === true,
          allowOwnerPersistedTransitionDeferredVisibility:
          options?.allowOwnerPersistedTransitionDeferredVisibility !== false,
        },
      );
    }

    /**
     * The create dedupe read: the existing in-flight operation matching a
     * move intent, as the owner answers it. A read that did not answer
     * throws the typed list unavailability: "no existing operation" is never
     * inferred from a failed read and no cache row stands in for the owner,
     * so creation waits rather than risk a duplicate.
     * @param {string} partitionId
     * @param {string} targetNodeId
     * @param {string} entityType
     * @param {string} entityId
     * @param {object} move
     * @param {Function} operationMatchesMoveIntent
     * @return {Promise<object|null>} The matching operation, or null when
     *   the owner answered with none.
     */
    async queryExistingInFlightOperation(
      partitionId,
      targetNodeId,
      entityType,
      entityId,
      move,
      operationMatchesMoveIntent,
    ) {
      const result = await this.executeReplicaOperationsRead(
        SQL.SELECT_IN_FLIGHT_FOR_ENTITY_NODE,
        [partitionId, targetNodeId, entityType, entityId],
        IN_FLIGHT_DEDUPE_READ_OPTIONS,
      );
      if (!result.success || !Array.isArray(result.rows)) {
        throw buildOperationListUnavailableError(result, IN_FLIGHT_DEDUPE_SCOPE);
      }
      return result.rows
        .map((row) => this.rowToOperation(row))
        .find((operation) =>
          !this.isOperationTerminal(operation) &&
          operationMatchesMoveIntent(operation, move, entityType, entityId)) ||
        null;
    }
  }

  for (
    const methodName of Object.getOwnPropertyNames(
      ReplicaOperationRepositoryReadMethods.prototype,
    )
  ) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaOperationRepository.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(ReplicaOperationRepositoryReadMethods.prototype, methodName),
    );
  }
  assignReplicaOperationRepositoryIncompleteReadMethods(
    ReplicaOperationRepository,
    options,
  );
  assignReplicaOperationRepositoryEntityReadMethods(
    ReplicaOperationRepository,
    options,
  );
}

export {assignReplicaOperationRepositoryReadMethods};
