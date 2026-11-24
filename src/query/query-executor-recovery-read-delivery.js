import {RealTimeSource} from '../time/time-source.js';
import {deliveryTransportOf} from '../transport/transport-semantic-outcome.js';
import {
  applySuccessfulCandidateAffinity,
  resolveRedirectParticipantNodeId,
} from './query-executor-partition-failure.js';
import {
  READ_COMPLETION_STATE,
  READ_ROUTE_SUPERSEDED_ERROR,
  REDIRECT_STEP_ACTION,
  ROUTE_SUPERSEDED_FAILURE,
} from './query-executor-self-leader-term-floor.js';
import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {UNKNOWN_OUTCOME_DECISION} from './query-executor-unknown-outcome.js';

const {
  CONTROL_PLANE_WRITE_RETRY_DECISION_STATE,
  ERRORS,
  QUERY_LOG_MSG,
} = QUERY_EXECUTOR_SHARED;

const RECOVERY_REDIRECT_REFUSED = Symbol('recovery redirect route is ineligible');
const ROUTING_PROBE_ELAPSED = Symbol('routing probe elapsed');
const READ_DELIVERY_CLOSED = 'Recovery read delivery closed';
const READ_ROUTE_SUPERSEDED = 'Recovery read route superseded';
const EXECUTOR_SHUTDOWN = 'Query execution aborted: SQL query engine is shutting down';
const EXECUTOR_SHUTDOWN_CODE = 'QUERY_EXECUTOR_SHUTTING_DOWN';

function executorShutdownError() {
  return Object.assign(new Error(EXECUTOR_SHUTDOWN), {code: EXECUTOR_SHUTDOWN_CODE});
}

function peerIdentityOf(router, nodeId) {
  if (!router || !nodeId) return null;
  const raw = nodeId === router.nodeId ?
    router.getLocalBootIncarnationIdentity?.() ?? null :
    router.getCurrentPrimaryConnectionBootIncarnation?.(nodeId) ?? null;
  if (!raw) return null;
  return raw.nodeId ? raw : {...raw, nodeId};
}

function matchesRoute(ticket, candidate) {
  if (!ticket?.serviceInfo || !candidate) return false;
  return ticket.address === candidate.address &&
    ticket.serviceInfo.nodeId === candidate.nodeId &&
    ticket.serviceInfo.replicaId === candidate.replicaId;
}

function isCurrentPeer(router, ticket) {
  const prior = ticket?.peer;
  if (!prior) return true; // The bounded cold-route attempt had no primary at submission.
  const current = peerIdentityOf(router, prior.nodeId);
  return Boolean(current) &&
    current.bootIncarnation === prior.bootIncarnation &&
    current.connectionId === prior.connectionId;
}

/**
 * One invocation owns its submissions and their replies. A routing probe
 * only lets that invocation inspect other eligible routes. The transport
 * retains each issued reply on its caller grant.
 * @param {Object} executor - Partition routing owner.
 * @param {Object} options - Original caller cancellation.
 * @return {Object} Per-invocation scope.
 */
function createRecoveryReadDelivery(executor, options = {}) {
  const router = executor.messageRouter;
  const clock = router?.timeSource || new RealTimeSource();
  const close = new AbortController();
  const sources = [close.signal, executor.partitionReadShutdownController.signal];
  if (options.signal) sources.push(options.signal);
  const signal = globalThis.AbortSignal.any(sources);
  const unsubscribe = options.cancellationToken?.onCancel?.((reason) => {
    close.abort(new Error(reason));
  });
  const pending = new Map();
  const issued = new Map();
  let ticketIssuer = null;

  function bindTicketIssuer(issueTicketFn) {
    ticketIssuer = issueTicketFn || null;
  }

  function mintBoundTicket(ticket) {
    const peer = peerIdentityOf(router, ticket.serviceInfo?.nodeId);
    if (ticketIssuer) {
      return ticketIssuer({...ticket, peer});
    }
    return Object.freeze({...ticket, peer});
  }

  function cancelSupersededRoute(address, record) {
    pending.delete(address);
    record.controller.abort(new Error(READ_ROUTE_SUPERSEDED));
  }

  function currentIn(ticket, candidates) {
    return candidates.some((candidate) => matchesRoute(ticket, candidate)) &&
      isCurrentPeer(router, ticket);
  }

  function reconcile(candidates) {
    for (const [address, record] of pending) {
      if (!currentIn(record.ticket, candidates)) cancelSupersededRoute(address, record);
    }
  }

  function canSelect(candidate, mayRetry) {
    if (mayRetry || pending.has(candidate.address)) return true;
    const previous = issued.get(candidate.address);
    return !previous || !currentIn(previous, [candidate]);
  }

  function start(ticket, routerOptions) {
    const {address, serviceInfo, request} = ticket;
    const existing = pending.get(address);
    if (existing && currentIn(existing.ticket, [serviceInfo])) return existing.completion;
    if (existing) cancelSupersededRoute(address, existing);
    const controller = new AbortController();
    const boundTicket = mintBoundTicket(ticket);
    const deliverySignal = globalThis.AbortSignal.any([signal, controller.signal]);
    ticket.submit?.();
    const completion = router.deliver(
      address, request, {...routerOptions, signal: deliverySignal},
    ).then((delivery) => ({ticket: boundTicket, delivery}),
      (error) => ({ticket: boundTicket, error}));
    pending.set(address, {controller, ticket: boundTicket, completion, probed: false});
    issued.set(address, {address, serviceInfo, peer: boundTicket.peer});
    return completion;
  }

  async function select(ticket, routerOptions, candidateQueue, probeMs) {
    signal.throwIfAborted();
    start(ticket, routerOptions);
    let timer;
    const events = candidateQueue.flatMap(({address}) => {
      const record = pending.get(address);
      return record ? [record.completion] : [];
    });
    if (probeMs !== null) {
      events.push(new Promise((resolve) => {
        timer = clock.setTimeout(() => resolve(ROUTING_PROBE_ELAPSED), probeMs);
      }));
    }
    try {
      const selected = await Promise.race(events);
      signal.throwIfAborted();
      if (selected === ROUTING_PROBE_ELAPSED) {
        pending.get(ticket.address).probed = true;
      } else {
        pending.delete(selected.ticket.address);
      }
      return selected;
    } finally {
      if (timer !== undefined) clock.clearTimeout(timer);
    }
  }

  return {
    bindTicketIssuer,
    select,
    reconcile,
    currentIn,
    hasPending: () => pending.size > 0,
    canSelect,
    wasProbed: (candidate) => pending.get(candidate.address)?.probed === true,
    hasUnstarted: (candidates, mayRetry) => candidates.some((candidate) =>
      !pending.has(candidate.address) && canSelect(candidate, mayRetry)),
    throwIfAborted: () => signal.throwIfAborted(),
    async redirect({origin, address, request, routerOptions, submit,
      resolveRoutes, redirectCandidate}) {
      const initial = resolveRoutes();
      const target = redirectCandidate(address, initial);
      if (!target || !currentIn(origin, initial.candidates)) return RECOVERY_REDIRECT_REFUSED;
      const result = await start({
        address,
        hadRoutableTarget: true,
        isRedirect: true,
        originTicket: origin,
        request,
        serviceInfo: target,
        submit,
      }, routerOptions);
      signal.throwIfAborted();
      pending.delete(address);
      return {
        delivery: result.delivery,
        error: result.error ?? null,
        ticket: result.ticket,
      };
    },
    dispose() {
      close.abort(new Error(READ_DELIVERY_CLOSED));
      unsubscribe?.();
      pending.clear();
      issued.clear();
    },
  };
}

function resolveDirectRedirectTarget({
  address,
  invocation,
  origin,
  participantNodeId,
  redirectCandidate,
}) {
  const initial = invocation.shouldRefreshRoutesOnCompletion() ?
    invocation.resolveRoutes() :
    invocation.getLatestRoutes();
  const target = redirectCandidate && initial?.routingSnapshot ?
    redirectCandidate(address, initial) :
    null;
  if (invocation.requiresCanonicalRouteCurrency() &&
      (!target || !invocation.isTicketRouteCurrent(origin, initial))) {
    return null;
  }
  return {
    hadRoutableTarget: Boolean(target),
    serviceInfo: target || {address, nodeId: participantNodeId, replicaId: null},
  };
}

async function deliverLeaderRedirect({
  readDelivery,
  invocation,
  messageRouter,
  origin,
  address,
  participantNodeId = null,
  request,
  routerOptions,
  submit,
  redirectCandidate,
}) {
  if (readDelivery) {
    return readDelivery.redirect({
      origin,
      address,
      request,
      routerOptions,
      submit,
      resolveRoutes: () => invocation.resolveRoutes(),
      redirectCandidate,
    });
  }
  const resolvedTarget = resolveDirectRedirectTarget({
    address,
    invocation,
    origin,
    participantNodeId,
    redirectCandidate,
  });
  if (!resolvedTarget) {
    return RECOVERY_REDIRECT_REFUSED;
  }
  const redirectTicket = invocation.issueTicket({
    address,
    hadRoutableTarget: resolvedTarget.hadRoutableTarget,
    isRedirect: true,
    originTicket: origin,
    request,
    serviceInfo: resolvedTarget.serviceInfo,
  });
  const delivery = await messageRouter.deliver(address, request, routerOptions);
  return {
    delivery,
    ticket: redirectTicket,
  };
}

function resolveRedirectFailureMessage(redirectResponse) {
  if (redirectResponse?.error) {
    return redirectResponse.error;
  }
  return ERRORS.QUERY_FAILED;
}

function handleFailedRedirectResponse(context, redirectAddress,
  redirectParticipantNodeId, redirectResponse) {
  const {
    candidateIndex, candidateState, executor, followRetryDecision, forRead,
    isLeaderPinnedDelivery, partitionId, recordCandidateFailure, response,
    unknownOutcome, widenWriteCandidate,
  } = context;
  const redirectFailureMessage = resolveRedirectFailureMessage(redirectResponse);
  const redirectUnknownDecision = unknownOutcome.observeAnswer(redirectResponse);
  if (redirectUnknownDecision !== UNKNOWN_OUTCOME_DECISION.NONE) {
    recordCandidateFailure(
      redirectFailureMessage, redirectResponse, redirectParticipantNodeId, redirectAddress);
    if (redirectUnknownDecision === UNKNOWN_OUTCOME_DECISION.UNRESOLVABLE) {
      return {action: REDIRECT_STEP_ACTION.RETURN, useLastFailure: true};
    }
    candidateState.requestRetryCurrentAddress();
    return {action: REDIRECT_STEP_ACTION.BREAK};
  }
  const redirectRetryDecision = executor.resolveControlPlaneWriteRetryDecision(
    partitionId, redirectResponse, forRead);
  recordCandidateFailure(
    redirectFailureMessage, redirectResponse, redirectParticipantNodeId, redirectAddress);
  if (redirectRetryDecision.state !== CONTROL_PLANE_WRITE_RETRY_DECISION_STATE.NONE) {
    return followRetryDecision(redirectRetryDecision, response.leaderAddress) ?
      {action: REDIRECT_STEP_ACTION.BREAK} :
      {action: REDIRECT_STEP_ACTION.CONTINUE, candidateIndex};
  }
  if (isLeaderPinnedDelivery &&
      executor.isLeaderUnavailable(redirectFailureMessage, redirectResponse?.errorCode)) {
    widenWriteCandidate(response.leaderAddress);
  }
  return {action: REDIRECT_STEP_ACTION.CONTINUE, candidateIndex};
}

async function executePartitionLeaderRedirectAttempt(context) {
  const {
    activeTicket, address, attemptBudget, attemptedAddresses,
    buildDeadlineSpentFailureResult, buildLastFailureResult, buildRequest,
    buildRouterDeliveryOptions, candidateEligibility, candidateIndex, candidateQueue,
    candidateState, executionOptions, executor, forRead, invocation,
    markRecoverySubmission, onRedirectSubmissionState, params, partitionId,
    readDelivery, recordCandidateFailure, response, serviceInfo, sql, unknownOutcome,
  } = context;
  executor.logger.debug(QUERY_LOG_MSG.FOLLOWING_LEADER_REDIRECT, {
    fromAddress: address, leaderAddress: response.leaderAddress, partitionId,
  });
  const redirectRouterOptions = buildRouterDeliveryOptions(
    candidateQueue, candidateIndex, attemptedAddresses);
  if (redirectRouterOptions === null) {
    return {action: REDIRECT_STEP_ACTION.RETURN, result: buildDeadlineSpentFailureResult()};
  }
  onRedirectSubmissionState(true);
  unknownOutcome.recordDelivery();
  const redirectedFromAddress = address;
  const redirectAddress = response.leaderAddress;
  const redirectParticipantNodeId = resolveRedirectParticipantNodeId(
    redirectAddress, serviceInfo?.nodeId);
  const redirectRequest = buildRequest({
    address: redirectAddress, executionOptions, leaderAddress: redirectAddress,
    params, partitionId, redirectedFromAddress, sql,
  });
  const nextServiceInfo = {nodeId: redirectParticipantNodeId, address: redirectAddress};
  context.onRedirectTargetSelected?.(redirectAddress, nextServiceInfo);
  const redirectOutcome = await deliverLeaderRedirect({
    address: redirectAddress, invocation, messageRouter: executor.messageRouter,
    origin: activeTicket, participantNodeId: redirectParticipantNodeId, readDelivery,
    redirectCandidate: candidateEligibility.redirectCandidate, request: redirectRequest,
    routerOptions: redirectRouterOptions, submit: markRecoverySubmission,
  });
  if (redirectOutcome === RECOVERY_REDIRECT_REFUSED) {
    onRedirectSubmissionState(false);
    recordCandidateFailure(
      READ_ROUTE_SUPERSEDED_ERROR, ROUTE_SUPERSEDED_FAILURE,
      redirectParticipantNodeId, redirectAddress);
    return {
      action: REDIRECT_STEP_ACTION.CONTINUE, address: redirectAddress,
      serviceInfo: nextServiceInfo, shouldRecheckRoutes: Boolean(readDelivery),
    };
  }
  const redirectDelivery = redirectOutcome.delivery;
  if (redirectDelivery) {
    unknownOutcome.observeTransport(deliveryTransportOf(redirectDelivery));
  }
  onRedirectSubmissionState(false);
  const redirectCompletion = invocation.completeDelivery({
    delivery: redirectDelivery,
    error: redirectOutcome.error ?? null,
    redirectedFromAddress,
    ticket: redirectOutcome.ticket,
  });
  if (redirectCompletion.state === READ_COMPLETION_STATE.DEADLINE_EXPIRED) {
    attemptBudget.reportDeadlineSpentBeforeAttempt();
    return {action: REDIRECT_STEP_ACTION.RETURN, result: buildDeadlineSpentFailureResult()};
  }
  if (redirectCompletion.state === READ_COMPLETION_STATE.ROUTE_SUPERSEDED) {
    recordCandidateFailure(
      redirectCompletion.response.error, redirectCompletion.response,
      redirectParticipantNodeId, redirectAddress);
    return {
      action: REDIRECT_STEP_ACTION.CONTINUE, address: redirectAddress,
      serviceInfo: nextServiceInfo, shouldRecheckRoutes: Boolean(readDelivery),
    };
  }
  if (redirectCompletion.accepted) {
    applySuccessfulCandidateAffinity(
      executor, executionOptions, partitionId, redirectAddress, forRead);
    return {
      action: REDIRECT_STEP_ACTION.RETURN,
      result: invocation.finalizeAcceptedResult(redirectCompletion.completedResult),
    };
  }
  await candidateState.handleRedirectTransportNoHandler(
    redirectDelivery, nextServiceInfo, redirectAddress, candidateIndex);
  const failureStep = handleFailedRedirectResponse(
    context, redirectAddress, redirectParticipantNodeId, redirectCompletion.response);
  return {
    ...failureStep, address: redirectAddress,
    ...(failureStep.useLastFailure ? {result: buildLastFailureResult()} : {}),
    serviceInfo: nextServiceInfo,
  };
}

export {
  createRecoveryReadDelivery,
  deliverLeaderRedirect,
  executePartitionLeaderRedirectAttempt,
  executorShutdownError,
  isCurrentPeer,
  matchesRoute,
  peerIdentityOf,
  RECOVERY_REDIRECT_REFUSED,
  ROUTING_PROBE_ELAPSED,
};
