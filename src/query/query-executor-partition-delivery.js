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
  createPartitionCandidateEligibility,
  notifyHedgeDeliveryObserver,
} from './query-executor-partition-candidate-state.js';
import {
  createRecoveryReadDelivery,
  executePartitionLeaderRedirectAttempt,
  ROUTING_PROBE_ELAPSED,
} from './query-executor-recovery-read-delivery.js';
import {
  applySuccessfulCandidateAffinity,
  buildQueryPartitionCandidateFailureDetails,
  buildQueryPartitionRoutingDenialFailureDetails,
  clearPinnedCandidateAddress,
  hasPlanningRefreshPendingDenial,
  resolveNoCandidateErrorMessage,
  settleUnresolvedCaughtWriteError,
} from './query-executor-partition-failure.js';
import {resolvePartitionExecutionBuilders} from './query-executor-partition-request-builders.js';
import {publishedLeaderGapOf} from '../control-plane/control-plane-owner-fact-read-contract.js';
import {
  UNKNOWN_OUTCOME_DECISION,
  createUnknownOutcomeRedelivery,
  withWriteEntryIdentity,
} from './query-executor-unknown-outcome.js';
import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  classifyThrownDeliveryError,
  deliveryTransportOf,
} from '../transport/transport-semantic-outcome.js';
import {
  READ_COMPLETION_STATE,
  REDIRECT_STEP_ACTION,
  createInvocationTermFloorTracker,
  shouldRetainTermFloorFailure,
} from './query-executor-self-leader-term-floor.js';

const {
  CONTROL_PLANE_WRITE_RETRY_DECISION_STATE,
  CONTROL_PLANE_READ_LEADER_MODE,
  ERRORS,
  LOG_MSG,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_ROUTING_OPTION_FIELD,
  QUERY_LOG_MSG,
  QUERY_RESPONSE_TYPE,
  normalizeParticipantFailureString,
} = QUERY_EXECUTOR_SHARED;

const LOCAL_NUM_PLANNING_REFRESH_MAX_ATTEMPTS = 30;
const EXECUTE_ON_PARTITION_BOOLEAN_ARGS_ERR =
  'executeOnPartition requires boolean preferLeader and allowBroadcast before deliveryOptions';

function isBooleanOrOmitted(value) {
  return value === undefined || typeof value === 'boolean';
}

function assertExecuteOnPartitionBooleanFlags(forRead, preferLeader, preferSameLatencyGroup) {
  if (
    !isBooleanOrOmitted(forRead) ||
    !isBooleanOrOmitted(preferLeader) ||
    !isBooleanOrOmitted(preferSameLatencyGroup)
  ) {
    throw new TypeError(EXECUTE_ON_PARTITION_BOOLEAN_ARGS_ERR);
  }
}

function shouldRequireCanonicalLeader(executionOptions) {
  return executionOptions?.requireLeader === true ||
    executionOptions?.strictRouteCurrency === true ||
    executionOptions?.readAuthority?.leaderMode ===
      CONTROL_PLANE_READ_LEADER_MODE.REQUIRED;
}

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
    assertExecuteOnPartitionBooleanFlags(forRead, preferLeader, preferSameLatencyGroup);
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
    const requireCanonicalLeader = shouldRequireCanonicalLeader(executionOptions);
    const isLeaderPinnedDelivery =
      !forRead || Boolean(executionOptions?.transactionIdentity);
    const attemptBudget = createPartitionAttemptBudget({
      executor: this,
      partitionId,
      forRead,
      executionOptions,
      routingReadinessDimension,
      cancellationToken,
    });
    this.throwIfCancelled(cancellationToken);
    const readDelivery = attemptBudget.retainsRecoveryReadResponse ?
      createRecoveryReadDelivery(this, executionOptions) : null;
    try {
      const {
        buildRouterDeliveryOptions,
        getRemainingExecutionBudgetMs,
        recoveryReadProbeMs,
        waitForRetryBudget,
      } = attemptBudget;
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
        forRead,
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
      const buildTimeoutFailureDetails = () => (lastFailureDetails?.errorCode ?
        lastFailureDetails :
        {...(lastFailureDetails || {}), errorCode: QUERY_ERROR_CODE.TIMEOUT});
      const buildDeadlineSpentFailureResult = () => ({
        ...buildFailureResult(
          lastError || QUERY_ERROR_MSG.QUERY_TIMEOUT,
          buildTimeoutFailureDetails(),
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
      const candidateEligibility = createPartitionCandidateEligibility(
        this, partitionId, executionOptions);
      const resolveRawAttemptCandidates = () => candidateEligibility.resolve(
        this.resolvePartitionServiceCandidates(
          partitionId, forRead, preferLeader, preferSameLatencyGroup, routingReadinessDimension,
          {
            allowReadinessAuthoritativeRefresh,
            requireLeader: executionOptions?.requireLeader === true,
            [QUERY_EXECUTOR_ROUTING_OPTION_FIELD.POST_ADMISSION_SETTLEMENT]:
              executionOptions?.postAdmissionSettlement === true,
            [QUERY_EXECUTOR_ROUTING_OPTION_FIELD.READ_AUTHORITY]:
              executionOptions?.readAuthority || null,
            recoveryCandidateSelectionKey: executionOptions.recoveryCandidateSelectionKey,
            transactionIdentity: executionOptions?.transactionIdentity || null,
          },
        ), Boolean(readDelivery), requireCanonicalLeader);
      const invocation = createInvocationTermFloorTracker(this, partitionId, {
        buildSuccessResult,
        cancellationToken,
        candidateEligibility,
        executionOptions,
        forRead,
        getRemainingExecutionBudgetMs,
        isSuccessfulResponse,
        readDelivery,
        requireCanonicalLeader,
        resolveCandidates: resolveRawAttemptCandidates,
      });
      const resolveAttemptCandidates = () => invocation.resolveRoutes();
      let shouldRecheckRoutes = false;
      for (let attempt = 1;
        attempt <= currentMaxAttempts || shouldRecheckRoutes || readDelivery?.hasPending();
        attempt++) {
        shouldRecheckRoutes = false;
        lastAttempt = attempt;
        invocation.throwIfAborted();
        const attemptBudgetMs = getRemainingExecutionBudgetMs();
        if (attemptBudgetMs !== null && attemptBudgetMs <= 0) {
          attemptBudget.reportDeadlineSpentBeforeAttempt();
          return buildDeadlineSpentFailureResult();
        }
        let {candidates: serviceCandidates, routingSnapshot, ownerHadCandidates} =
          resolveAttemptCandidates();
        readDelivery?.reconcile(serviceCandidates);
        if (
          serviceCandidates.length === 0 && !ownerHadCandidates &&
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
          ({candidates: serviceCandidates, routingSnapshot} = resolveAttemptCandidates());
          readDelivery?.reconcile(serviceCandidates);
        }
        if (!readDelivery) {
          ({candidates: serviceCandidates} = candidateEligibility.prioritize(
            {candidates: serviceCandidates, routingSnapshot}, requireCanonicalLeader));
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
                return buildPreSubmissionRouteFailureResult(lastError ||
                  QUERY_ERROR_MSG.QUERY_TIMEOUT, buildTimeoutFailureDetails());
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
              return buildDeadlineSpentFailureResult();
            }
            continue;
          }
          this.logNoServiceForPartition(partitionId, routingSnapshot);
          return {...buildFailureResult(lastError, lastFailureDetails),
            ...publishedLeaderGapOf(requireCanonicalLeader, routingSnapshot)};
        }
        const candidateState = createPartitionCandidateDeliveryState({
          allowReadinessAuthoritativeRefresh,
          candidateQueue: [...serviceCandidates],
          candidateEligibility,
          inspectEligibleCandidates: Boolean(readDelivery),
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
          errorMessage, failure, participantNodeId, participantAddress,
        ) => {
          if (shouldRetainTermFloorFailure(lastFailureDetails, failure)) return;
          lastError = errorMessage;
          lastFailureDetails = buildQueryPartitionCandidateFailureDetails({
            executor: this, failure, forRead, participantNodeId, participantAddress,
          });
        };
        let submittedRecoveryRead = false;
        let inspectedRecoveryRead = false;
        const markRecoverySubmission = () => {
          submittedRecoveryRead = true;
        };
        for (let candidateIndex = 0; candidateIndex < candidateQueue.length; candidateIndex++) {
          let serviceInfo = candidateQueue[candidateIndex];
          let address = serviceInfo?.address;
          const widenWriteCandidate = (candidateAddress = address) => {
            clearPinnedCandidateAddress(
              this,
              executionOptions,
              partitionId,
              candidateAddress,
            );
            candidateState.queueLeaderRecoveryCandidates(
              candidateIndex,
              serviceInfo?.nodeId || null,
            );
          };
          const followRetryDecision = (decision, candidateAddress = address) => {
            if (decision.state ===
              CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.DEFER_PARTITION_RETRY) {
              candidateState.requestDeferredPartitionRetry();
              return true;
            }
            widenWriteCandidate(candidateAddress);
            return false;
          };
          if (candidateState.shouldSkipCandidateDelivery(serviceInfo, address)) continue;
          const mayRetry = attempt <= currentMaxAttempts;
          if (readDelivery && !readDelivery.canSelect(serviceInfo, mayRetry)) continue;
          const moreUnstarted = readDelivery?.hasUnstarted(
            candidateQueue.slice(candidateIndex + 1), mayRetry);
          if (moreUnstarted && readDelivery.wasProbed(serviceInfo)) continue;
          candidateState.markAttemptedAddress(address);
          const observeSubmission = () => {
            markRecoverySubmission();
            candidateDeliveryAttempted = true;
            notifyHedgeDeliveryObserver(executionOptions, partitionId, serviceInfo,
              address, serviceCandidates.length);
            this.logger.debug(QUERY_LOG_MSG.ROUTING_QUERY_TO_PARTITION, {partitionId, address});
          };
          if (!readDelivery) observeSubmission();
          let deliverySubmitted = false;
          try {
            invocation.throwIfAborted();
            let request = buildRequest({
              partitionId, address, sql, params, executionOptions,
            });
            const routerOptions = buildRouterDeliveryOptions(
              candidateQueue, candidateIndex, attemptedAddresses,
            );
            if (routerOptions === null) return buildDeadlineSpentFailureResult();
            let delivery;
            let activeTicket;
            let deliveryError = null;
            if (readDelivery) {
              const ticket = {address, request, serviceInfo, submit: observeSubmission};
              // Another candidate's wait can outlive the inspection that nominated this route.
              const eligibleAtSubmit = inspectedRecoveryRead ?
                resolveAttemptCandidates().candidates : candidateQueue;
              if (inspectedRecoveryRead) readDelivery.reconcile(eligibleAtSubmit);
              if (!readDelivery.currentIn(ticket, eligibleAtSubmit)) break;
              inspectedRecoveryRead = true;
              const selected = await readDelivery.select(ticket, routerOptions, eligibleAtSubmit,
                recoveryReadProbeMs(routerOptions, serviceInfo));
              if (selected === ROUTING_PROBE_ELAPSED) {
                shouldRecheckRoutes = true;
                if (!moreUnstarted) break;
                continue;
              }
              activeTicket = selected.ticket;
              ({address, request, serviceInfo} = activeTicket);
              delivery = selected.delivery;
              deliveryError = selected.error ?? null;
            } else {
              activeTicket = invocation.issueTicket({address, request, serviceInfo});
              deliverySubmitted = true;
              unknownOutcome.recordDelivery();
              delivery = await this.messageRouter.deliver(address, request, routerOptions);
            }
            const completion = invocation.completeDelivery({
              ticket: activeTicket,
              delivery,
              error: deliveryError,
            });
            if (delivery) {
              unknownOutcome.observeTransport(deliveryTransportOf(delivery));
            }
            deliverySubmitted = false;
            if (completion.state === READ_COMPLETION_STATE.DEADLINE_EXPIRED) {
              attemptBudget.reportDeadlineSpentBeforeAttempt();
              return buildDeadlineSpentFailureResult();
            }
            if (completion.state === READ_COMPLETION_STATE.ROUTE_SUPERSEDED) {
              recordCandidateFailure(
                completion.response.error,
                completion.response,
                serviceInfo?.nodeId,
                address,
              );
              if (readDelivery) shouldRecheckRoutes = true;
              continue;
            }
            if (completion.accepted) {
              applySuccessfulCandidateAffinity(
                this,
                executionOptions,
                partitionId,
                address,
                forRead,
              );
              return invocation.finalizeAcceptedResult(completion.completedResult);
            }
            const {response} = completion;

            // Handle leader redirect response - immediately retry with provided address
            if (
              response.redirect === QUERY_RESPONSE_TYPE.LEADER_REDIRECT &&
              response.leaderAddress
            ) {
              const redirectStep = await executePartitionLeaderRedirectAttempt({
                activeTicket,
                address,
                attemptBudget,
                attemptedAddresses,
                buildDeadlineSpentFailureResult,
                buildLastFailureResult,
                buildRequest,
                buildRouterDeliveryOptions,
                candidateEligibility,
                candidateIndex,
                candidateQueue,
                candidateState,
                executionOptions,
                executor: this,
                followRetryDecision,
                forRead,
                invocation,
                isLeaderPinnedDelivery,
                markRecoverySubmission,
                onRedirectSubmissionState: (submitted) => {
                  deliverySubmitted = submitted;
                },
                onRedirectTargetSelected: (nextAddress, nextInfo) => {
                  address = nextAddress;
                  serviceInfo = nextInfo;
                },
                params,
                partitionId,
                readDelivery,
                recordCandidateFailure,
                response,
                serviceInfo,
                sql,
                unknownOutcome,
                widenWriteCandidate,
              });
              if (redirectStep.address) address = redirectStep.address;
              if (redirectStep.serviceInfo) serviceInfo = redirectStep.serviceInfo;
              if (redirectStep.shouldRecheckRoutes) shouldRecheckRoutes = true;
              if (redirectStep.action === REDIRECT_STEP_ACTION.RETURN) {
                return redirectStep.result;
              }
              if (redirectStep.action === REDIRECT_STEP_ACTION.BREAK) {
                break;
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
              widenWriteCandidate(address);
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
              isLeaderPinnedDelivery &&
              this.isLeaderUnavailable(errorMessage, response?.errorCode)
            ) {
              recordCandidateFailure(
                errorMessage,
                response,
                serviceInfo?.nodeId,
                address,
              );
              widenWriteCandidate(address);
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
            invocation.throwIfAborted();
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
              if (isLeaderPinnedDelivery) {
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
              isLeaderPinnedDelivery &&
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
              widenWriteCandidate(address);
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
              const unresolvedResult = settleUnresolvedCaughtWriteError({
                executor: this, forRead, executionOptions, errorMessage, error,
                serviceInfo, address, recordCandidateFailure,
                widenWriteCandidate, candidateState, buildFailureResult,
              });
              if (unresolvedResult === null) break;
              return unresolvedResult;
            }
            throw error;
          }
        }
        // A pending-only pass may repeat only after awaiting a reply or probe.
        if (!inspectedRecoveryRead) readDelivery?.reconcile([]);
        if (inspectedRecoveryRead && !submittedRecoveryRead) attempt -= 1;
        if (shouldRecheckRoutes || readDelivery?.hasPending()) continue;
        if (attempt < currentMaxAttempts && !(await waitForLeaderRetryBudget())) {
          return buildDeadlineSpentFailureResult();
        }
      }
      return returnReadAttemptsSpent();
    } finally {
      readDelivery?.dispose();
    }
  }
}
export {QueryExecutorPartitionDelivery};
