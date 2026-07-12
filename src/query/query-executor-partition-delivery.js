import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {QueryExecutorBase} from './query-executor-base.js';
import {
  buildPartitionExecutionFailureResult,
  resolvePartitionRetryDelayMs,
} from './query-execution-budget.js';
import {
  createPartitionAttemptBudget,
} from './query-executor-partition-attempt-budget.js';
import {
  createPartitionCandidateDeliveryState,
} from './query-executor-partition-candidate-state.js';
import {
  buildQueryPartitionCandidateFailureDetails,
} from './query-executor-partition-failure.js';
import {
  resolvePartitionExecutionBuilders,
} from './query-executor-partition-request-builders.js';

const {
  CONTROL_PLANE_WRITE_RETRY_DECISION_STATE,
  ERRORS,
  LOG_MSG,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_LOG_MSG,
  QUERY_RESPONSE_TYPE,
  normalizeParticipantFailureString,
  resolveParticipantBackpressureState,
} = QUERY_EXECUTOR_SHARED;

class QueryExecutorPartitionDelivery extends QueryExecutorBase {
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
    const routingReadinessDimension =
      executionOptions.routingReadinessDimension ||
      this.defaultRoutingReadinessDimension;
    const allowReadinessAuthoritativeRefresh =
      this.shouldAllowRoutingAuthoritativeRefresh(executionOptions);
    const attemptBudget = createPartitionAttemptBudget({
      executor: this,
      partitionId,
      forRead,
      executionOptions,
      routingReadinessDimension,
      cancellationToken,
    });
    const {
      buildRouterDeliveryOptions,
      getRemainingExecutionBudgetMs,
      waitForRetryBudget,
    } = attemptBudget;
    this.throwIfCancelled(cancellationToken);
    const buildFailureResult = (errorMessage, details = {}) =>
      buildPartitionExecutionFailureResult({
        partitionId,
        failedTable,
        errorMessage,
        details,
      });

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
    const runtimeRoutingRepairState = {
      awaited: false,
    };
    const {
      buildRequest,
      buildSuccessResult,
      isSuccessfulResponse,
    } = resolvePartitionExecutionBuilders({
      executionOptions,
      params,
      partitionId,
      sql,
    });
    const buildLastFailureResult = () => ({
      ...buildFailureResult(
        lastError || ERRORS.QUERY_FAILED,
        lastFailureDetails,
      ),
    });
    const waitForLeaderRetryBudget = async () => waitForRetryBudget(
      resolvePartitionRetryDelayMs(this.leaderRetryDelayMs, lastFailureDetails),
    );
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.throwIfCancelled(cancellationToken);
      const attemptBudgetMs = getRemainingExecutionBudgetMs();
      if (attemptBudgetMs !== null && attemptBudgetMs <= 0) {
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
        serviceCandidates.length === 0 &&
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
      if (serviceCandidates.length === 0) {
        const hasRoutableService =
          routingSnapshot.routableServiceCount > 0;
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
      const candidateState = createPartitionCandidateDeliveryState({
        allowReadinessAuthoritativeRefresh,
        candidateQueue: [...serviceCandidates],
        executionOptions,
        executor: this,
        forRead,
        partitionId,
        preferLeader,
        preferSameLatencyGroup,
        routingReadinessDimension,
        routingSnapshot,
        runtimeRoutingRepairState,
      });
      const {attemptedAddresses, candidateQueue} = candidateState;
      const recordCandidateFailure = (
        errorMessage,
        failure,
        participantNodeId,
        participantAddress,
      ) => {
        lastError = errorMessage;
        lastFailureDetails = buildQueryPartitionCandidateFailureDetails({
          executor: this,
          failure,
          forRead,
          participantNodeId,
          participantAddress,
        });
      };
      for (
        let candidateIndex = 0;
        candidateIndex < candidateQueue.length;
        candidateIndex += 1
      ) {
        const serviceInfo = candidateQueue[candidateIndex];
        const {address} = serviceInfo;
        if (candidateState.shouldSkipCandidateDelivery(serviceInfo, address)) {
          continue;
        }
        candidateState.markAttemptedAddress(address);
        this.notifyHedgeDeliveryObserver(
          executionOptions,
          partitionId,
          serviceInfo,
          address,
          serviceCandidates.length,
        );
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
          const attemptRouterDeliveryOptions = buildRouterDeliveryOptions(
            candidateQueue,
            candidateIndex,
            attemptedAddresses,
          );
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
            const redirectRouterDeliveryOptions = buildRouterDeliveryOptions(
              candidateQueue,
              candidateIndex,
              attemptedAddresses,
            );
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
              candidateState.requestRetryCurrentAddress();
              break;
            }
            if (
              redirectRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY
            ) {
              candidateState.requestDeferredPartitionRetry();
              break;
            }
            if (
              redirectRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.WIDEN_TO_RECOVERY_CANDIDATE
            ) {
              candidateState.queueLeaderRecoveryCandidates(
                candidateIndex,
                serviceInfo?.nodeId || null,
              );
            }
            continue;
          }
          if (response.noHandler) {
            const errorMessage =
              response.error || `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`;
            await candidateState.handleNoHandlerCandidate(
              serviceInfo,
              address,
            );
            recordCandidateFailure(
              errorMessage,
              response,
              serviceInfo?.nodeId,
              address,
            );
            candidateState.queueLeaderRecoveryCandidates(
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
              candidateState.requestRetryCurrentAddress();
              break;
            }
            if (
              controlPlaneWriteRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY
            ) {
              candidateState.requestDeferredPartitionRetry();
              break;
            }
            candidateState.queueLeaderRecoveryCandidates(
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
            candidateState.queueLeaderRecoveryCandidates(
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
            error.message.length > 0 ?
              error.message :
              ERRORS.QUERY_FAILED;
          if (this.isNoHandlerFailure(errorMessage)) {
            await candidateState.handleNoHandlerCandidate(
              serviceInfo,
              address,
            );
            recordCandidateFailure(
              errorMessage,
              error,
              serviceInfo?.nodeId,
              address,
            );
            candidateState.queueLeaderRecoveryCandidates(
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
              candidateState.queueLeaderRecoveryCandidates(
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
                candidateState.requestRetryCurrentAddress();
                break;
              }
              if (
                controlPlaneWriteRetryDecision.state ===
                CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY
              ) {
                candidateState.requestDeferredPartitionRetry();
                break;
              }
              candidateState.queueLeaderRecoveryCandidates(
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
            candidateState.queueLeaderRecoveryCandidates(
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
              candidateState.requestRetryCurrentAddress();
              break;
            }
            if (
              controlPlaneWriteRetryDecision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY
            ) {
              candidateState.requestDeferredPartitionRetry();
              break;
            }
            candidateState.queueLeaderRecoveryCandidates(
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
      if (candidateState.shouldRetryCurrentAddress()) {
        if (attempt < maxAttempts) {
          if (!(await waitForLeaderRetryBudget())) {
            return buildLastFailureResult();
          }
          continue;
        }
        return buildLastFailureResult();
      }
      if (candidateState.shouldDeferPartitionRetry()) {
        if (attempt < maxAttempts) {
          if (!(await waitForLeaderRetryBudget())) {
            return buildLastFailureResult();
          }
          continue;
        }
        return buildLastFailureResult();
      }
      if (attempt < maxAttempts) {
        if (!(await waitForLeaderRetryBudget())) {
          return buildLastFailureResult();
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

  /**
   * Report one delivery attempt to a straggler-hedging observer when the
   * caller supplied one, so a speculative retry can be forced onto a
   * different replica than the primary attempt targeted.
   * @param {Object} executionOptions - Execution options.
   * @param {string} partitionId - Partition ID.
   * @param {Object} serviceInfo - Candidate service info.
   * @param {string} address - Delivery address.
   * @param {number} candidateCount - Distinct routable candidates seen.
   * @private
   */
  notifyHedgeDeliveryObserver(
    executionOptions,
    partitionId,
    serviceInfo,
    address,
    candidateCount,
  ) {
    if (
      typeof executionOptions?.hedgeDeliveryObserver !==
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION
    ) {
      return;
    }
    executionOptions.hedgeDeliveryObserver({
      partitionId,
      address,
      nodeId: serviceInfo?.nodeId,
      candidateCount,
    });
  }
}
export {QueryExecutorPartitionDelivery};
