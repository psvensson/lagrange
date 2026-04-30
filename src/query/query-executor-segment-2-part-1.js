import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {QueryExecutorSegment1} from './query-executor-segment-1.js';

const {
  CONTROL_PLANE_WRITE_RETRY_DECISION_STATE,
  ERRORS,
  LOG_MSG,
  MIGRATION_PARTITION_OPERATION,
  NUM,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_LOG_MSG,
  QUERY_MESSAGE_FIELD_MIGRATION_ID,
  QUERY_MESSAGE_FIELD_MIGRATION_OPERATION,
  QUERY_MESSAGE_FIELD_SESSION_ID,
  QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN,
  QUERY_MESSAGE_TYPE,
  QUERY_RESPONSE_TYPE,
  QUERY_ROUTING_REPAIR_REASON,
  normalizeParticipantFailureString,
  normalizeParticipantRetryAfterMs,
  resolveParticipantBackpressureState,
} = QUERY_EXECUTOR_SHARED;

class QueryExecutorSegment2Part1 extends QueryExecutorSegment1 {
  async executeOnPartition(
    partitionId,
    sql,
    params,
    forRead,
    preferLeader,
    preferSameLatencyGroup,
    executionOptions = {},
  ) {
    const cancellationToken = executionOptions?.cancellationToken || null;
    const failedTable = normalizeParticipantFailureString(
      executionOptions?.tableName,
    );
    const executionTimeoutMs =
      Number.isFinite(executionOptions?.timeoutMs) &&
      executionOptions.timeoutMs > NUM.ZERO ?
        Math.floor(executionOptions.timeoutMs) :
        null;
    const executionDeadlineMs =
      executionTimeoutMs === null ? null : Date.now() + executionTimeoutMs;
    const getRemainingExecutionBudgetMs = () => {
      if (executionDeadlineMs === null) {
        return null;
      }
      return Math.max(NUM.ZERO, executionDeadlineMs - Date.now());
    };
    const buildRouterDeliveryOptions = () => {
      const routerOptions = {};
      if (
        typeof executionOptions?.deliveryPriority ===
          QUERY_EXECUTOR_LITERAL.STRING_STRING &&
        executionOptions.deliveryPriority.length > NUM.ZERO
      ) {
        routerOptions.deliveryPriority = executionOptions.deliveryPriority;
      }
      if (
        typeof executionOptions?.deliverySource ===
          QUERY_EXECUTOR_LITERAL.STRING_STRING &&
        executionOptions.deliverySource.length > NUM.ZERO
      ) {
        routerOptions.deliverySource = executionOptions.deliverySource;
      }
      if (
        typeof executionOptions?.replacePendingKey ===
          QUERY_EXECUTOR_LITERAL.STRING_STRING &&
        executionOptions.replacePendingKey.length > NUM.ZERO
      ) {
        routerOptions.replacePendingKey = executionOptions.replacePendingKey;
      }
      const remainingBudgetMs = getRemainingExecutionBudgetMs();
      if (remainingBudgetMs !== null) {
        if (remainingBudgetMs <= NUM.ZERO) {
          return null;
        }
        routerOptions.timeoutMs = remainingBudgetMs;
      }
      if (Object.keys(routerOptions).length === NUM.ZERO) {
        return undefined;
      }
      return routerOptions;
    };
    const waitForRetryBudget = async (retryDelayMs) => {
      const normalizedRetryDelayMs =
        Number.isFinite(retryDelayMs) && retryDelayMs > NUM.ZERO ?
          Math.floor(retryDelayMs) :
          NUM.ZERO;
      const remainingBudgetMs = getRemainingExecutionBudgetMs();
      if (remainingBudgetMs === null) {
        if (normalizedRetryDelayMs > NUM.ZERO) {
          await this.delay(normalizedRetryDelayMs);
          this.throwIfCancelled(cancellationToken);
        }
        return true;
      }
      if (remainingBudgetMs <= NUM.ZERO) {
        return false;
      }
      if (normalizedRetryDelayMs > remainingBudgetMs) {
        return false;
      }
      if (normalizedRetryDelayMs > NUM.ZERO) {
        await this.delay(normalizedRetryDelayMs);
        this.throwIfCancelled(cancellationToken);
      }
      const nextRemainingBudgetMs = getRemainingExecutionBudgetMs();
      return nextRemainingBudgetMs === null || nextRemainingBudgetMs > NUM.ZERO;
    };
    this.throwIfCancelled(cancellationToken);
    const buildFailureResult = (errorMessage, details = {}) => ({
      partitionId,
      success: false,
      error: errorMessage || ERRORS.QUERY_FAILED,
      errorCode: normalizeParticipantFailureString(
        details?.errorCode || details?.code,
      ),
      retryAfterMs: normalizeParticipantRetryAfterMs(details?.retryAfterMs),
      deferRetry: details?.deferRetry === true,
      participantNodeId: normalizeParticipantFailureString(
        details?.participantNodeId,
      ),
      participantAddress: normalizeParticipantFailureString(
        details?.participantAddress,
      ),
      backpressured: resolveParticipantBackpressureState(details),
      failedTable,
      rows: [],
    });
    const resolveRetryableLeaderFailureRetryAfterMs = (
      failure,
      participantNodeId,
    ) => {
      const explicitRetryAfterMs = normalizeParticipantRetryAfterMs(
        failure?.retryAfterMs,
      );
      if (explicitRetryAfterMs !== null) {
        return explicitRetryAfterMs;
      }
      if (
        typeof participantNodeId !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
        participantNodeId.length === NUM.ZERO ||
        forRead ||
        typeof this.messageRouter?.getConnectionState !==
          QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
      ) {
        return null;
      }
      const errorMessage =
        typeof failure?.error === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
          failure.error :
          typeof failure?.message === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
            failure.message :
            QUERY_EXECUTOR_LITERAL.STRING_VALUE;
      const errorCode =
        typeof failure?.errorCode === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
          failure.errorCode :
          typeof failure?.code === QUERY_EXECUTOR_LITERAL.STRING_STRING ?
            failure.code :
            null;
      if (!this.isLeaderUnavailable(errorMessage, errorCode)) {
        return null;
      }
      const connectionState =
        this.messageRouter.getConnectionState(participantNodeId);
      if (
        connectionState !== QUERY_EXECUTOR_LITERAL.STRING_RECONNECTING &&
        connectionState !== QUERY_EXECUTOR_LITERAL.STRING_DISCONNECTED
      ) {
        return null;
      }
      const reconnectIntervalMs = Number(
        this.messageRouter?.reconnectIntervalMs,
      );
      if (
        !Number.isFinite(reconnectIntervalMs) ||
        reconnectIntervalMs <= NUM.ZERO
      ) {
        return null;
      }
      return Math.floor(reconnectIntervalMs);
    };

    // Validate dependencies
    if (!this.messageRouter) {
      this.logger.error(QUERY_LOG_MSG.MESSAGE_ROUTER_UNAVAILABLE, {
        partitionId,
      });
      return {
        ...buildFailureResult(QUERY_ERROR_MSG.MESSAGE_ROUTER_UNAVAILABLE),
      };
    }
    if (!this.systemCache) {
      this.logger.error(LOG_MSG.SYSTEM_CACHE_NOT_AVAILABLE, {
        partitionId,
      });
      return {
        ...buildFailureResult(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE),
      };
    }
    const maxAttempts = forRead ?
      this.getReadRetryAttemptLimit() :
      this.getWriteRetryAttemptLimit(executionOptions);
    let lastError = null;
    let lastFailureDetails = null;
    let awaitedRoutingRepair = false;
    let awaitedRuntimeRoutingRepair = false;
    const routingReadinessDimension =
      executionOptions.routingReadinessDimension ||
      this.defaultRoutingReadinessDimension;
    const allowReadinessAuthoritativeRefresh =
      this.shouldAllowRoutingAuthoritativeRefresh(executionOptions);
    const buildRequest =
      typeof executionOptions.buildRequest === 'function' ?
        executionOptions.buildRequest :
        () => {
          const request = {
            type: QUERY_MESSAGE_TYPE.QUERY,
            sql,
            params,
          };
          if (
            typeof executionOptions.sessionId === 'string' &&
              executionOptions.sessionId.length > NUM.ZERO
          ) {
            request[QUERY_MESSAGE_FIELD_SESSION_ID] =
                executionOptions.sessionId;
          }
          if (executionOptions.splitMirrorOrigin) {
            request[QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN] =
                executionOptions.splitMirrorOrigin;
          }
          if (
            executionOptions.migrationOperation ===
              MIGRATION_PARTITION_OPERATION.ALTER_TABLE
          ) {
            request[QUERY_MESSAGE_FIELD_MIGRATION_OPERATION] =
                executionOptions.migrationOperation;
            if (executionOptions.migrationId) {
              request[QUERY_MESSAGE_FIELD_MIGRATION_ID] =
                  executionOptions.migrationId;
            }
          }
          return request;
        };
    const isSuccessfulResponse =
      typeof executionOptions.isSuccessfulResponse === 'function' ?
        executionOptions.isSuccessfulResponse :
        (response) => response?.acknowledged && response?.success;
    const buildSuccessResult =
      typeof executionOptions.buildSuccessResult === 'function' ?
        executionOptions.buildSuccessResult :
        (response) => ({
          partitionId,
          success: true,
          rows: response.rows || [],
          changes: response.changes,
        });
    for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt++) {
      this.throwIfCancelled(cancellationToken);
      const attemptBudgetMs = getRemainingExecutionBudgetMs();
      if (attemptBudgetMs !== null && attemptBudgetMs <= NUM.ZERO) {
        return {
          ...buildFailureResult(
            lastError || ERRORS.QUERY_FAILED,
            lastFailureDetails,
          ),
        };
      }
      let {candidates: serviceCandidates, routingSnapshot} =
        this.resolvePartitionServiceCandidates(
          partitionId,
          forRead,
          preferLeader,
          preferSameLatencyGroup,
          routingReadinessDimension,
          {
            allowReadinessAuthoritativeRefresh,
            recoveryCandidateSelectionKey:
                executionOptions.recoveryCandidateSelectionKey,
          },
        );
      if (
        !awaitedRoutingRepair &&
        serviceCandidates.length === NUM.ZERO &&
        (await this.maybeAwaitDeniedPartitionRoutingRepair(routingSnapshot, {
          allowReadinessAuthoritativeRefresh,
        }))
      ) {
        awaitedRoutingRepair = true;
        this.throwIfCancelled(cancellationToken);
        ({candidates: serviceCandidates, routingSnapshot} =
          this.resolvePartitionServiceCandidates(
            partitionId,
            forRead,
            preferLeader,
            preferSameLatencyGroup,
            routingReadinessDimension,
            {
              allowReadinessAuthoritativeRefresh,
              recoveryCandidateSelectionKey:
                  executionOptions.recoveryCandidateSelectionKey,
            },
          ));
      }
      serviceCandidates = this.prioritizeSessionPartitionAddress(
        serviceCandidates,
        routingSnapshot,
        executionOptions.sessionId,
        partitionId,
      );
      if (serviceCandidates.length === NUM.ZERO) {
        const hasRoutableService =
          routingSnapshot.routableServiceCount > NUM.ZERO;
        const hasPartitionRecord = this.hasPartitionRecord(partitionId);
        if (!forRead) {
          if (hasRoutableService && attempt < maxAttempts) {
            lastError = ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE;
            if (!(await waitForRetryBudget(this.leaderRetryDelayMs))) {
              return {
                ...buildFailureResult(lastError, lastFailureDetails),
              };
            }
            continue;
          }
          if (
            !hasRoutableService &&
            hasPartitionRecord &&
            attempt < maxAttempts
          ) {
            lastError = ERRORS.PARTITION_SERVICE_NOT_FOUND;
            if (!(await waitForRetryBudget(this.leaderRetryDelayMs))) {
              return {
                ...buildFailureResult(lastError, lastFailureDetails),
              };
            }
            continue;
          }
          if (hasRoutableService) {
            this.logger.warn(QUERY_LOG_MSG.NO_LEADER_SERVICE_FOR_PARTITION, {
              partitionId,
              attempts: attempt,
            });
            return {
              ...buildFailureResult(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE),
            };
          }
          if (!hasRoutableService) {
            this.logNoServiceForPartition(partitionId, routingSnapshot);
            return {
              ...buildFailureResult(
                QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND,
              ),
            };
          }
        } else {
          // §1.10/§1.12: Reads get bounded retries so routing
          // repair and cache convergence can discover candidates.
          if (hasPartitionRecord && attempt < maxAttempts) {
            lastError = QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND;
            if (!(await waitForRetryBudget(this.leaderRetryDelayMs))) {
              return {
                ...buildFailureResult(lastError, lastFailureDetails),
              };
            }
            continue;
          }
          this.logNoServiceForPartition(partitionId, routingSnapshot);
          return {
            ...buildFailureResult(QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND),
          };
        }
      }
      const candidateQueue = [...serviceCandidates];
      const attemptedAddresses = new Set();
      let retryCurrentAddressOnNextAttempt = false;
      let deferPartitionRetryOnNextAttempt = false;
      let leaderRecoveryQueued = false;
      const shouldSkipCandidateDelivery = (serviceInfo, address) => {
        if (
          typeof address !== QUERY_EXECUTOR_LITERAL.STRING_STRING ||
          address.length === NUM.ZERO ||
          attemptedAddresses.has(address)
        ) {
          return true;
        }
        const witnessedService = this.findRoutingSnapshotService(
          routingSnapshot,
          serviceInfo,
          address,
        );
        return this.isTemporarilyUnroutableAddress(
          partitionId,
          address,
          witnessedService,
        );
      };
      const queueLeaderRecoveryCandidates = (
        currentCandidateIndex = null,
        participantNodeId = null,
      ) => {
        if (leaderRecoveryQueued) {
          return;
        }
        const recoveryCandidates = this.getLeaderRecoveryCandidates(
          routingSnapshot,
          attemptedAddresses,
          preferSameLatencyGroup,
          {
            recoveryCandidateSelectionKey:
              executionOptions.recoveryCandidateSelectionKey,
          },
        );
        if (recoveryCandidates.length === 0) {
          return;
        }
        leaderRecoveryQueued = true;
        const recoveryRoutingContract =
          this.resolveCanonicalLeaderGapRecoveryRoutingContract(
            partitionId,
            routingSnapshot,
            routingReadinessDimension,
            allowReadinessAuthoritativeRefresh,
          );
        const shouldDeprioritizeSameNodeCandidates =
          recoveryRoutingContract.preferDifferentNodeAfterRuntimeWitness ===
            true &&
          typeof participantNodeId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
          participantNodeId.length > NUM.ZERO &&
          Number.isInteger(currentCandidateIndex) &&
          currentCandidateIndex >= NUM.ZERO;
        if (!shouldDeprioritizeSameNodeCandidates) {
          candidateQueue.push(...recoveryCandidates);
          return;
        }
        const nextCandidateIndex = currentCandidateIndex + NUM.ONE;
        const retainedTailCandidates = candidateQueue
          .slice(nextCandidateIndex)
          .filter((candidate) => candidate?.nodeId !== participantNodeId);
        candidateQueue.splice(
          nextCandidateIndex,
          candidateQueue.length - nextCandidateIndex,
          ...recoveryCandidates,
          ...retainedTailCandidates,
        );
      };
      const buildCandidateFailureDetails = (
        failure,
        participantNodeId,
        participantAddress,
      ) => ({
        errorCode: failure?.errorCode || failure?.code,
        retryAfterMs: resolveRetryableLeaderFailureRetryAfterMs(
          failure,
          participantNodeId,
        ),
        deferRetry: failure?.deferRetry,
        participantNodeId,
        participantAddress,
        backpressured: resolveParticipantBackpressureState(failure),
      });
      const recordCandidateFailure = (
        errorMessage,
        failure,
        participantNodeId,
        participantAddress,
      ) => {
        lastError = errorMessage;
        lastFailureDetails = buildCandidateFailureDetails(
          failure,
          participantNodeId,
          participantAddress,
        );
      };
      const requestRetryCurrentAddress = () => {
        retryCurrentAddressOnNextAttempt = true;
      };
      const requestDeferredPartitionRetry = () => {
        deferPartitionRetryOnNextAttempt = true;
      };
      for (
        let candidateIndex = NUM.ZERO;
        candidateIndex < candidateQueue.length;
        candidateIndex += NUM.ONE
      ) {
        const serviceInfo = candidateQueue[candidateIndex];
        const {address} = serviceInfo;
        if (shouldSkipCandidateDelivery(serviceInfo, address)) {
          continue;
        }
        attemptedAddresses.add(address);
        this.logger.debug(QUERY_LOG_MSG.ROUTING_QUERY_TO_PARTITION, {
          partitionId,
          address,
        });
        try {
          this.throwIfCancelled(cancellationToken);
          const request = buildRequest({
            partitionId,
            address,
            sql,
            params,
            executionOptions,
          });
          const attemptRouterDeliveryOptions = buildRouterDeliveryOptions();
          if (attemptRouterDeliveryOptions === null) {
            return {
              ...buildFailureResult(
                lastError || ERRORS.QUERY_FAILED,
                lastFailureDetails,
              ),
            };
          }
          const response = await this.messageRouter.deliver(
            address,
            request,
            attemptRouterDeliveryOptions,
          );
          this.throwIfCancelled(cancellationToken);
          if (isSuccessfulResponse(response)) {
            this.clearTemporarilyUnroutableAddress(partitionId, address);
            if (
              executionOptions.clearSessionPartitionAffinityOnSuccess === true
            ) {
              this.clearSessionPartitionAddress(
                executionOptions.sessionId,
                partitionId,
              );
            } else {
              this.setSessionPartitionAddress(
                executionOptions.sessionId,
                partitionId,
                address,
              );
            }
            return buildSuccessResult(response, {
              partitionId,
              address,
              request,
              executionOptions,
            });
          }

          // Handle leader redirect response - immediately retry with provided address
          if (
            response.redirect === QUERY_RESPONSE_TYPE.LEADER_REDIRECT &&
            response.leaderAddress
          ) {
            this.logger.debug(QUERY_LOG_MSG.FOLLOWING_LEADER_REDIRECT, {
              partitionId,
              fromAddress: address,
              leaderAddress: response.leaderAddress,
            });
            const redirectRouterDeliveryOptions = buildRouterDeliveryOptions();
            if (redirectRouterDeliveryOptions === null) {
              return {
                ...buildFailureResult(
                  lastError || errorMessage,
                  lastFailureDetails,
                ),
              };
            }
            const redirectResponse = await this.messageRouter.deliver(
              response.leaderAddress,
              buildRequest({
                partitionId,
                address: response.leaderAddress,
                redirectedFromAddress: address,
                leaderAddress: response.leaderAddress,
                sql,
                params,
                executionOptions,
              }),
              redirectRouterDeliveryOptions,
            );
            if (isSuccessfulResponse(redirectResponse)) {
              this.clearTemporarilyUnroutableAddress(
                partitionId,
                response.leaderAddress,
              );
              if (
                executionOptions.clearSessionPartitionAffinityOnSuccess === true
              ) {
                this.clearSessionPartitionAddress(
                  executionOptions.sessionId,
                  partitionId,
                );
              } else {
                this.setSessionPartitionAddress(
                  executionOptions.sessionId,
                  partitionId,
                  response.leaderAddress,
                );
              }
              return buildSuccessResult(redirectResponse, {
                partitionId,
                address: response.leaderAddress,
                redirectedFromAddress: address,
                executionOptions,
              });
            }

            // Redirect target also failed - continue to next candidate
            const redirectFailureMessage =
              redirectResponse.error || ERRORS.QUERY_FAILED;
            const redirectRetryDecision =
              this.resolveControlPlaneWriteRetryDecision(
                partitionId,
                executionOptions,
                redirectResponse,
                forRead,
              );
            recordCandidateFailure(
              redirectFailureMessage,
              redirectResponse,
              serviceInfo?.nodeId,
              response.leaderAddress,
            );
            if (
              redirectRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS
            ) {
              requestRetryCurrentAddress();
              break;
            }
            if (
              redirectRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY
            ) {
              requestDeferredPartitionRetry();
              break;
            }
            if (
              redirectRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.WIDEN_TO_RECOVERY_CANDIDATE
            ) {
              queueLeaderRecoveryCandidates(
                candidateIndex,
                serviceInfo?.nodeId || null,
              );
            }
            continue;
          }
          if (response.noHandler) {
            const errorMessage =
              response.error || `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`;
            const witnessedService = this.findRoutingSnapshotService(
              routingSnapshot,
              serviceInfo,
              address,
            );
            this.logger.warn(QUERY_LOG_MSG.NO_HANDLER_FOR_PARTITION, {
              partitionId,
              address,
            });
            this.markTemporarilyUnroutableAddress(
              partitionId,
              address,
              witnessedService,
            );
            if (
              this.getSessionPartitionAddress(
                executionOptions.sessionId,
                partitionId,
              ) === address
            ) {
              this.clearSessionPartitionAddress(
                executionOptions.sessionId,
                partitionId,
              );
            }
            if (
              !awaitedRuntimeRoutingRepair &&
              (await this.maybeAwaitRuntimeRoutingRepair(routingSnapshot, {
                partitionId,
                participantNodeId: serviceInfo?.nodeId || null,
                routingReadinessDimension,
                allowReadinessAuthoritativeRefresh,
                refreshReason:
                  QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
              }))
            ) {
              awaitedRuntimeRoutingRepair = true;
              const refreshedResolution =
                this.resolvePartitionServiceCandidates(
                  partitionId,
                  forRead,
                  preferLeader,
                  preferSameLatencyGroup,
                  routingReadinessDimension,
                  {
                    allowReadinessAuthoritativeRefresh,
                    recoveryCandidateSelectionKey:
                      executionOptions.recoveryCandidateSelectionKey,
                  },
                );
              routingSnapshot = refreshedResolution.routingSnapshot;
              const refreshedRecoveryCandidates =
                this.getLeaderRecoveryCandidates(
                  routingSnapshot,
                  attemptedAddresses,
                  preferSameLatencyGroup,
                  {
                    recoveryCandidateSelectionKey:
                      executionOptions.recoveryCandidateSelectionKey,
                  },
                );
              if (refreshedRecoveryCandidates.length > NUM.ZERO) {
                candidateQueue.push(...refreshedRecoveryCandidates);
              }
            }
            recordCandidateFailure(
              errorMessage,
              response,
              serviceInfo?.nodeId,
              address,
            );
            queueLeaderRecoveryCandidates(
              candidateIndex,
              serviceInfo?.nodeId || null,
            );
            if (
              !forRead &&
              this.isLeaderUnavailable(errorMessage, response?.errorCode)
            ) {
              continue;
            }
            continue;
          }
          const errorMessage = response.error || ERRORS.QUERY_FAILED;
          const controlPlaneWriteRetryDecision =
            this.resolveControlPlaneWriteRetryDecision(
              partitionId,
              executionOptions,
              {
                error: errorMessage,
                errorCode: response?.errorCode,
                retryAfterMs: response?.retryAfterMs,
                deferRetry: response?.deferRetry,
              },
              forRead,
            );
          if (
            controlPlaneWriteRetryDecision.state !==
            CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.NONE
          ) {
            recordCandidateFailure(
              errorMessage,
              response,
              serviceInfo?.nodeId,
              address,
            );
            if (
              controlPlaneWriteRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS
            ) {
              requestRetryCurrentAddress();
              break;
            }
            if (
              controlPlaneWriteRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY
            ) {
              requestDeferredPartitionRetry();
              break;
            }
            queueLeaderRecoveryCandidates(
              candidateIndex,
              serviceInfo?.nodeId || null,
            );
            continue;
          }
          if (
            !forRead &&
            this.isLeaderUnavailable(errorMessage, response?.errorCode)
          ) {
            recordCandidateFailure(
              errorMessage,
              response,
              serviceInfo?.nodeId,
              address,
            );
            if (
              this.getSessionPartitionAddress(
                executionOptions.sessionId,
                partitionId,
              ) === address
            ) {
              this.clearSessionPartitionAddress(
                executionOptions.sessionId,
                partitionId,
              );
            }
            queueLeaderRecoveryCandidates(
              candidateIndex,
              serviceInfo?.nodeId || null,
            );
            continue;
          }

          // §1.12: For reads, treat transient failures as reasons
          // to try the next candidate rather than hard-failing.
          if (forRead) {
            this.logger.debug(QUERY_LOG_MSG.READ_CANDIDATE_TRANSIENT_FAILURE, {
              partitionId,
              address,
            });
            recordCandidateFailure(
              errorMessage,
              response,
              serviceInfo?.nodeId,
              address,
            );
            continue;
          }
          return {
            ...buildFailureResult(errorMessage, {
              errorCode: response?.errorCode,
              retryAfterMs: response?.retryAfterMs,
              deferRetry: response?.deferRetry,
              participantNodeId: serviceInfo?.nodeId,
              participantAddress: address,
              backpressured: resolveParticipantBackpressureState(response),
            }),
          };
        } catch (error) {
          const errorMessage =
            typeof error?.message === 'string' &&
            error.message.length > NUM.ZERO ?
              error.message :
              ERRORS.QUERY_FAILED;
          if (this.isNoHandlerFailure(errorMessage)) {
            const witnessedService = this.findRoutingSnapshotService(
              routingSnapshot,
              serviceInfo,
              address,
            );
            this.logger.warn(QUERY_LOG_MSG.NO_HANDLER_FOR_PARTITION, {
              partitionId,
              address,
            });
            this.markTemporarilyUnroutableAddress(
              partitionId,
              address,
              witnessedService,
            );
            if (
              this.getSessionPartitionAddress(
                executionOptions.sessionId,
                partitionId,
              ) === address
            ) {
              this.clearSessionPartitionAddress(
                executionOptions.sessionId,
                partitionId,
              );
            }
            if (
              !awaitedRuntimeRoutingRepair &&
              (await this.maybeAwaitRuntimeRoutingRepair(routingSnapshot, {
                partitionId,
                participantNodeId: serviceInfo?.nodeId || null,
                routingReadinessDimension,
                allowReadinessAuthoritativeRefresh,
                refreshReason:
                  QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
              }))
            ) {
              awaitedRuntimeRoutingRepair = true;
              const refreshedResolution =
                this.resolvePartitionServiceCandidates(
                  partitionId,
                  forRead,
                  preferLeader,
                  preferSameLatencyGroup,
                  routingReadinessDimension,
                  {
                    allowReadinessAuthoritativeRefresh,
                    recoveryCandidateSelectionKey:
                      executionOptions.recoveryCandidateSelectionKey,
                  },
                );
              routingSnapshot = refreshedResolution.routingSnapshot;
              const refreshedRecoveryCandidates =
                this.getLeaderRecoveryCandidates(
                  routingSnapshot,
                  attemptedAddresses,
                  preferSameLatencyGroup,
                  {
                    recoveryCandidateSelectionKey:
                      executionOptions.recoveryCandidateSelectionKey,
                  },
                );
              if (refreshedRecoveryCandidates.length > NUM.ZERO) {
                candidateQueue.push(...refreshedRecoveryCandidates);
              }
            }
            recordCandidateFailure(
              errorMessage,
              error,
              serviceInfo?.nodeId,
              address,
            );
            queueLeaderRecoveryCandidates(
              candidateIndex,
              serviceInfo?.nodeId || null,
            );
            if (!forRead) {
              if (
                this.getSessionPartitionAddress(
                  executionOptions.sessionId,
                  partitionId,
                ) === address
              ) {
                this.clearSessionPartitionAddress(
                  executionOptions.sessionId,
                  partitionId,
                );
              }
              queueLeaderRecoveryCandidates(
                candidateIndex,
                serviceInfo?.nodeId || null,
              );
            }
            continue;
          }
          if (
            !forRead &&
            this.isLeaderUnavailable(
              errorMessage,
              error?.code || error?.errorCode,
            )
          ) {
            const controlPlaneWriteRetryDecision =
              this.resolveControlPlaneWriteRetryDecision(
                partitionId,
                executionOptions,
                error,
                forRead,
              );
            if (
              controlPlaneWriteRetryDecision.state !==
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.NONE
            ) {
              recordCandidateFailure(
                errorMessage,
                error,
                serviceInfo?.nodeId,
                address,
              );
              if (
                controlPlaneWriteRetryDecision.state ===
                CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS
              ) {
                requestRetryCurrentAddress();
                break;
              }
              if (
                controlPlaneWriteRetryDecision.state ===
                CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY
              ) {
                requestDeferredPartitionRetry();
                break;
              }
              queueLeaderRecoveryCandidates(
                candidateIndex,
                serviceInfo?.nodeId || null,
              );
              continue;
            }
            recordCandidateFailure(
              errorMessage,
              error,
              serviceInfo?.nodeId,
              address,
            );
            if (
              this.getSessionPartitionAddress(
                executionOptions.sessionId,
                partitionId,
              ) === address
            ) {
              this.clearSessionPartitionAddress(
                executionOptions.sessionId,
                partitionId,
              );
            }
            queueLeaderRecoveryCandidates(
              candidateIndex,
              serviceInfo?.nodeId || null,
            );
            continue;
          }
          const controlPlaneWriteRetryDecision =
            this.resolveControlPlaneWriteRetryDecision(
              partitionId,
              executionOptions,
              error,
              forRead,
            );
          if (
            controlPlaneWriteRetryDecision.state !==
            CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.NONE
          ) {
            recordCandidateFailure(
              errorMessage,
              error,
              serviceInfo?.nodeId,
              address,
            );
            if (
              controlPlaneWriteRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.RETRY_SAME_ADDRESS
            ) {
              requestRetryCurrentAddress();
              break;
            }
            if (
              controlPlaneWriteRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY
            ) {
              requestDeferredPartitionRetry();
              break;
            }
            queueLeaderRecoveryCandidates(
              candidateIndex,
              serviceInfo?.nodeId || null,
            );
            continue;
          }

          // §1.12: For reads, catch transient transport errors
          // and try the next candidate.
          if (forRead) {
            this.logger.debug(QUERY_LOG_MSG.READ_CANDIDATE_TRANSIENT_FAILURE, {
              partitionId,
              address,
              error: errorMessage,
            });
            recordCandidateFailure(
              errorMessage,
              error,
              serviceInfo?.nodeId,
              address,
            );
            continue;
          }
          this.logger.error(QUERY_LOG_MSG.QUERY_ROUTING_FAILED, {
            partitionId,
            address,
            error: errorMessage,
          });
          throw error;
        }
      }
      if (retryCurrentAddressOnNextAttempt) {
        if (attempt < maxAttempts) {
          const retryDelayMs =
            Number.isFinite(lastFailureDetails?.retryAfterMs) &&
            lastFailureDetails.retryAfterMs > NUM.ZERO ?
              Math.max(
                this.leaderRetryDelayMs,
                lastFailureDetails.retryAfterMs,
              ) :
              this.leaderRetryDelayMs;
          if (!(await waitForRetryBudget(retryDelayMs))) {
            return {
              ...buildFailureResult(
                lastError || ERRORS.QUERY_FAILED,
                lastFailureDetails,
              ),
            };
          }
          continue;
        }
        return {
          ...buildFailureResult(
            lastError || ERRORS.QUERY_FAILED,
            lastFailureDetails,
          ),
        };
      }
      if (deferPartitionRetryOnNextAttempt) {
        if (attempt < maxAttempts) {
          const retryDelayMs =
            Number.isFinite(lastFailureDetails?.retryAfterMs) &&
            lastFailureDetails.retryAfterMs > NUM.ZERO ?
              Math.max(
                this.leaderRetryDelayMs,
                lastFailureDetails.retryAfterMs,
              ) :
              this.leaderRetryDelayMs;
          if (!(await waitForRetryBudget(retryDelayMs))) {
            return {
              ...buildFailureResult(
                lastError || ERRORS.QUERY_FAILED,
                lastFailureDetails,
              ),
            };
          }
          continue;
        }
        return {
          ...buildFailureResult(
            lastError || ERRORS.QUERY_FAILED,
            lastFailureDetails,
          ),
        };
      }
      if (attempt < maxAttempts) {
        const retryDelayMs =
          Number.isFinite(lastFailureDetails?.retryAfterMs) &&
          lastFailureDetails.retryAfterMs > NUM.ZERO ?
            Math.max(this.leaderRetryDelayMs, lastFailureDetails.retryAfterMs) :
            this.leaderRetryDelayMs;
        if (!(await waitForRetryBudget(retryDelayMs))) {
          return {
            ...buildFailureResult(
              lastError || ERRORS.QUERY_FAILED,
              lastFailureDetails,
            ),
          };
        }
      }
    }
    return {
      ...buildFailureResult(
        lastError || ERRORS.QUERY_FAILED,
        lastFailureDetails,
      ),
    };
  }
}
export {QueryExecutorSegment2Part1};
