import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {QueryExecutorBase} from './query-executor-base.js';
import {
  QUERY_PARTITION_DELIVERY_PRE_SUBMISSION_ROUTE_UNAVAILABLE,
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
  applySuccessfulCandidateAffinity,
  buildQueryPartitionCandidateFailureDetails,
  buildQueryPartitionRoutingDenialFailureDetails,
  clearPinnedCandidateAddress,
  hasPlanningRefreshPendingDenial,
  resolveNoCandidateErrorMessage,
  resolveRedirectParticipantNodeId,
} from './query-executor-partition-failure.js';
import {
  resolvePartitionExecutionBuilders,
} from './query-executor-partition-request-builders.js';
import {
  UNKNOWN_OUTCOME_DECISION,
  createUnknownOutcomeRedelivery,
  withWriteEntryIdentity,
} from './query-executor-unknown-outcome.js';
import {deliveryAnswerOf, deliveryTransportOf, TRANSPORT_DELIVERY_OUTCOME_REASON_CODE, classifyThrownDeliveryError,
  deliveryReadingOf} from
  '../transport/transport-semantic-outcome.js';

const {
  CONTROL_PLANE_WRITE_RETRY_DECISION_STATE,
  CONTROL_PLANE_READ_LEADER_MODE,
  ERRORS,
  LOG_MSG,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_EXECUTOR_ROUTING_OPTION_FIELD,
  QUERY_LOG_MSG,
  QUERY_RESPONSE_TYPE,
  normalizeParticipantFailureString,
} = QUERY_EXECUTOR_SHARED;

const LOCAL_NUM_PLANNING_REFRESH_MAX_ATTEMPTS = 30;

class QueryExecutorPartitionDelivery extends QueryExecutorBase {
  async executeOnPartition(
    partitionId,
    sql,
    params,
    forRead,
    preferLeader,
    preferSameLatencyGroup,
    deliveryOptions = {},
  ) {
    // One entryId for every delivery of a write (the caller's, or minted
    // once): a re-delivery is never a fresh entry.
    const executionOptions = withWriteEntryIdentity(deliveryOptions, forRead);
    const unknownOutcome = createUnknownOutcomeRedelivery({
      entryId: executionOptions?.entryId ?? null,
      forRead,
      now: () => (typeof this.nowFn === 'function' ? this.nowFn() : Date.now()),
    });
    const cancellationToken = executionOptions?.cancellationToken || null;
    const failedTable = normalizeParticipantFailureString(
      executionOptions?.tableName,
    );
    const routingReadinessDimension =
      executionOptions.routingReadinessDimension ||
      this.defaultRoutingReadinessDimension;
    const allowReadinessAuthoritativeRefresh =
      this.shouldAllowRoutingAuthoritativeRefresh(executionOptions);
    const requireCanonicalLeader =
      executionOptions?.readAuthority?.leaderMode ===
        CONTROL_PLANE_READ_LEADER_MODE.REQUIRED;
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
    // Every failure a delivery ends with: an unresolved write's is its typed
    // unknown outcome (createUnknownOutcomeRedelivery).
    const buildFailureResult = (errorMessage, details = {}) =>
      unknownOutcome.finish(buildPartitionExecutionFailureResult({
        partitionId,
        failedTable,
        errorMessage,
        details,
      }), this.logger);
    let candidateDeliveryAttempted = false;
    const buildPreSubmissionRouteFailureResult = (
      errorMessage,
      details = {},
    ) => {
      const failureResult = buildFailureResult(errorMessage, details);
      if (candidateDeliveryAttempted) {
        return failureResult;
      }
      return {
        ...failureResult,
        deliveryDisposition:
          QUERY_PARTITION_DELIVERY_PRE_SUBMISSION_ROUTE_UNAVAILABLE,
      };
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
    // Writes have one retry authority: the absolute execution deadline built
    // above. An independent attempt ceiling can expire first and turn a
    // recoverable routing gap into a permanent client-visible failure. Reads
    // retain their bounded candidate-probing policy.
    const maxAttempts = forRead ?
      this.getReadRetryAttemptLimit() :
      Number.MAX_SAFE_INTEGER;
    let currentMaxAttempts = maxAttempts;
    let lastError = null;
    let lastFailureDetails = null;
    let awaitedRoutingRepair = false;
    const runtimeRoutingRepairState = {
      awaited: false,
    };
    let lastAttempt = 0;
    attemptBudget.observeSpent(() => ({
      attempts: lastAttempt,
      lastError,
      lastErrorCode: lastFailureDetails?.errorCode ?? null,
      lastParticipantNodeId: lastFailureDetails?.participantNodeId ?? null,
      awaitedRoutingRepair,
    }));
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
    // An unresolved write's re-deliveries back off (the redelivery owner).
    const waitForLeaderRetryBudget = async () => waitForRetryBudget(
      unknownOutcome.nextDeliveryDelayMs(resolvePartitionRetryDelayMs(
        this.leaderRetryDelayMs, lastFailureDetails)),
    );
    const returnReadAttemptsSpent = () => {
      attemptBudget.reportReadAttemptsSpent(currentMaxAttempts);
      return buildLastFailureResult();
    };
    const resolveAttemptCandidates = () =>
      this.resolvePartitionServiceCandidates(
        partitionId,
        forRead,
        preferLeader,
        preferSameLatencyGroup,
        routingReadinessDimension,
        {
          allowReadinessAuthoritativeRefresh,
          [QUERY_EXECUTOR_ROUTING_OPTION_FIELD.READ_AUTHORITY]:
            executionOptions?.readAuthority || null,
          recoveryCandidateSelectionKey:
            executionOptions.recoveryCandidateSelectionKey,
        },
      );
    for (let attempt = 1; attempt <= currentMaxAttempts; attempt++) {
      lastAttempt = attempt;
      this.throwIfCancelled(cancellationToken);
      const attemptBudgetMs = getRemainingExecutionBudgetMs();
      if (attemptBudgetMs !== null && attemptBudgetMs <= 0) {
        attemptBudget.reportDeadlineSpentBeforeAttempt();
        return buildLastFailureResult();
      }
      let {candidates: serviceCandidates, routingSnapshot} =
        resolveAttemptCandidates();
      if (
        serviceCandidates.length === 0 &&
        (!awaitedRoutingRepair || hasPlanningRefreshPendingDenial(routingSnapshot)) &&
        (await this.maybeAwaitDeniedPartitionRoutingRepair(routingSnapshot, {
          allowReadinessAuthoritativeRefresh,
          timeoutMs: getRemainingExecutionBudgetMs(),
          timeoutBudget: executionOptions?.timeoutBudget || null,
          cancellationToken,
          signal: executionOptions?.signal || null,
        }))
      ) {
        awaitedRoutingRepair = true;
        this.throwIfCancelled(cancellationToken);
        ({candidates: serviceCandidates, routingSnapshot} =
          resolveAttemptCandidates());
      }
      if (!requireCanonicalLeader) {
        serviceCandidates = this.prioritizeSessionPartitionAddress(
          serviceCandidates,
          routingSnapshot,
          executionOptions.sessionId,
          partitionId,
        );
      }
      if (serviceCandidates.length === 0) {
        lastFailureDetails =
          buildQueryPartitionRoutingDenialFailureDetails(routingSnapshot);
        const hasRoutableService = routingSnapshot.routableServiceCount > 0;
        const hasPartitionRecord = this.hasPartitionRecord(partitionId);
        if (!forRead) {
          const canRetryWrite =
            attempt < maxAttempts && (hasRoutableService || hasPartitionRecord);
          lastError = resolveNoCandidateErrorMessage({
            forRead: false,
            hasRoutableService,
            hasPartitionRecord,
            isFinalWriteAttempt: !canRetryWrite,
          });
          if (canRetryWrite) {
            if (!(await waitForRetryBudget(this.leaderRetryDelayMs))) {
              return buildPreSubmissionRouteFailureResult(
                lastError,
                lastFailureDetails,
              );
            }
            continue;
          }
          if (hasRoutableService) {
            this.logger.warn(QUERY_LOG_MSG.NO_LEADER_SERVICE_FOR_PARTITION, {
              partitionId,
              attempts: attempt,
            });
          } else {
            this.logNoServiceForPartition(partitionId, routingSnapshot);
          }
          return buildPreSubmissionRouteFailureResult(
            lastError,
            lastFailureDetails,
          );
        }
        lastError = QUERY_ERROR_MSG.PARTITION_SERVICE_NOT_FOUND;
        if (
          hasPlanningRefreshPendingDenial(routingSnapshot) &&
          currentMaxAttempts < LOCAL_NUM_PLANNING_REFRESH_MAX_ATTEMPTS
        ) {
          currentMaxAttempts = LOCAL_NUM_PLANNING_REFRESH_MAX_ATTEMPTS;
        }
        if (hasPartitionRecord && attempt < currentMaxAttempts) {
          if (!(await waitForRetryBudget(this.leaderRetryDelayMs))) {
            return {...buildFailureResult(lastError, lastFailureDetails)};
          }
          continue;
        }
        this.logNoServiceForPartition(partitionId, routingSnapshot);
        return {...buildFailureResult(lastError, lastFailureDetails)};
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
        // Follow a routed write's retry decision: true when the candidate
        // loop stops for this attempt (retry here, or defer the partition),
        // false when it widens to the next recovery candidate.
        const followRetryDecision = (decision) => {
          if (decision.state ===
            CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY) {
            candidateState.requestDeferredPartitionRetry();
            return true;
          }
          candidateState.queueLeaderRecoveryCandidates(
            candidateIndex,
            serviceInfo?.nodeId || null,
          );
          return false;
        };
        if (candidateState.shouldSkipCandidateDelivery(serviceInfo, address)) {
          continue;
        }
        candidateState.markAttemptedAddress(address);
        candidateDeliveryAttempted = true;
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
        let deliverySubmitted = false;
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
          deliverySubmitted = true;
          unknownOutcome.recordDelivery();
          const delivery = await this.messageRouter.deliver(
            address,
            request,
            attemptRouterDeliveryOptions,
          );
          unknownOutcome.observeTransport(deliveryTransportOf(delivery));
          deliverySubmitted = false;
          this.throwIfCancelled(cancellationToken);
          // Every later read takes exactly one namespace: the partition's
          // answer when delivered, else the transport outcome.
          const response = deliveryReadingOf(delivery);
          if (isSuccessfulResponse(delivery)) {
            applySuccessfulCandidateAffinity(
              this,
              executionOptions,
              partitionId,
              address,
              forRead,
            );
            return buildSuccessResult(deliveryAnswerOf(delivery), {
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
              return buildLastFailureResult();
            }
            deliverySubmitted = true;
            unknownOutcome.recordDelivery();
            const redirectDelivery = await this.messageRouter.deliver(
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
            unknownOutcome.observeTransport(deliveryTransportOf(redirectDelivery));
            deliverySubmitted = false;
            const redirectResponse = deliveryReadingOf(redirectDelivery);
            if (isSuccessfulResponse(redirectDelivery)) {
              applySuccessfulCandidateAffinity(
                this,
                executionOptions,
                partitionId,
                response.leaderAddress,
                forRead,
              );
              return buildSuccessResult(deliveryAnswerOf(redirectDelivery), {
                partitionId,
                address: response.leaderAddress,
                redirectedFromAddress: address,
                executionOptions,
              });
            }

            // Redirect target also failed - continue to next candidate
            const redirectFailureMessage =
              redirectResponse.error || ERRORS.QUERY_FAILED;
            const redirectParticipantNodeId = resolveRedirectParticipantNodeId(
              response.leaderAddress,
              serviceInfo?.nodeId,
            );
            const redirectUnknownDecision =
              unknownOutcome.observeAnswer(redirectResponse);
            if (redirectUnknownDecision !== UNKNOWN_OUTCOME_DECISION.NONE) {
              recordCandidateFailure(
                redirectFailureMessage,
                redirectResponse,
                redirectParticipantNodeId,
                response.leaderAddress,
              );
              if (
                redirectUnknownDecision ===
                UNKNOWN_OUTCOME_DECISION.UNRESOLVABLE
              ) {
                return buildLastFailureResult();
              }
              candidateState.requestRetryCurrentAddress();
              break;
            }
            const redirectRetryDecision =
              this.resolveControlPlaneWriteRetryDecision(
                partitionId,
                redirectResponse,
                forRead,
              );
            recordCandidateFailure(
              redirectFailureMessage,
              redirectResponse,
              redirectParticipantNodeId,
              response.leaderAddress,
            );
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
          // An answer whose outcome is not known: re-delivered under the same
          // entryId until it is settled (the one re-delivery owner), never
          // routed again without that identity.
          const unknownDecision = unknownOutcome.observeAnswer(response);
          if (unknownDecision !== UNKNOWN_OUTCOME_DECISION.NONE) {
            recordCandidateFailure(
              response.error || ERRORS.QUERY_FAILED,
              response,
              serviceInfo?.nodeId,
              address,
            );
            if (unknownDecision === UNKNOWN_OUTCOME_DECISION.UNRESOLVABLE) {
              return buildLastFailureResult();
            }
            candidateState.requestRetryCurrentAddress();
            break;
          }
          if (deliveryTransportOf(delivery).reasonCode ===
              TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER) {
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
            continue;
          }
          const errorMessage = response.error || ERRORS.QUERY_FAILED;
          const controlPlaneWriteRetryDecision =
            this.resolveControlPlaneWriteRetryDecision(
              partitionId,
              {
                error: errorMessage,
                errorCode: response?.errorCode,
                failureCode: response?.failureCode,
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
            if (followRetryDecision(controlPlaneWriteRetryDecision)) {
              break;
            }
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
            clearPinnedCandidateAddress(
              this,
              executionOptions,
              partitionId,
              address,
            );
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
            ...buildFailureResult(
              errorMessage,
              buildQueryPartitionCandidateFailureDetails({
                executor: this,
                failure: response,
                forRead,
                participantNodeId: serviceInfo?.nodeId,
                participantAddress: address,
              }),
            ),
          };
        } catch (error) {
          const errorMessage =
            typeof error?.message === 'string' &&
            error.message.length > 0 ?
              error.message :
              ERRORS.QUERY_FAILED;
          if (deliverySubmitted && !this.isNoHandlerFailure(errorMessage)) {
            // Sent, and its answer never arrived: the write may have applied.
            unknownOutcome.observeLostAnswer(error);
          }
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
              clearPinnedCandidateAddress(
                this,
                executionOptions,
                partitionId,
                address,
              );
              candidateState.queueLeaderRecoveryCandidates(
                candidateIndex,
                serviceInfo?.nodeId || null,
              );
            }
            continue;
          }
          const controlPlaneWriteRetryDecision =
            this.resolveControlPlaneWriteRetryDecision(
              partitionId,
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
            if (followRetryDecision(controlPlaneWriteRetryDecision)) {
              break;
            }
            continue;
          }
          if (
            !forRead &&
            this.isLeaderUnavailable(
              errorMessage,
              classifyThrownDeliveryError(error).errorCode,
            )
          ) {
            recordCandidateFailure(
              errorMessage,
              error,
              serviceInfo?.nodeId,
              address,
            );
            clearPinnedCandidateAddress(
              this,
              executionOptions,
              partitionId,
              address,
            );
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
          if (unknownOutcome.isUnresolved()) {
            // A write whose outcome is unknown ends typed, never thrown.
            return buildFailureResult(
              errorMessage,
              buildQueryPartitionCandidateFailureDetails({
                executor: this,
                failure: error,
                forRead,
                participantNodeId: serviceInfo?.nodeId,
                participantAddress: address,
              }),
            );
          }
          throw error;
        }
      }
      if (attempt < currentMaxAttempts && !(await waitForLeaderRetryBudget())) {
        return buildLastFailureResult();
      }
    }
    return returnReadAttemptsSpent();
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
