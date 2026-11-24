// Self-published leader term-fenced peer probing (Option A, S0 ruling Q1
// refinement) and inseparable read-completion authority boundary (Review §3 & §4).
import {
  COLUMN,
  SERVICE_TYPE,
  TABLES,
} from '../constants/index.js';
import {OWNER_FACT_UNAVAILABLE_REASON} from
  '../control-plane/control-plane-owner-fact-read-contract.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../raft/raft-operation-port-constants.js';
import {
  PERSISTED_TERM_STATE,
  invalidatePartitionPersistedTermReaders,
  observePersistedPartitionTerm,
} from '../storage/retained-read-view-custody.js';
import {
  deliveryAnswerOf,
  deliveryReadingOf,
} from '../transport/transport-semantic-outcome.js';
import {readLowerStateField} from '../utils/state-field-read.js';
import {
  READ_COMPLETION_STATE,
  READ_ROUTE_SUPERSEDED_CODE,
  REDIRECT_STEP_ACTION,
  ROUTE_SUPERSEDED_FAILURE,
  isCurrentPeer,
  matchesRoute,
  peerIdentityOf,
} from './query-executor-recovery-read-delivery.js';

const ZERO_BIGINT = 0n;
const MAX_SAFE_TERM_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const REMOVED_SERVICE_STATUS = 'removed';
const UNSEALED_READ_COMPLETION_CODE = 'UNSEALED_READ_COMPLETION_REJECTED';
const UNSEALED_READ_COMPLETION_MSG =
  'Unsealed read completion result rejected: authority validation required';
const UNISSUED_READ_TICKET_CODE = 'UNISSUED_READ_DELIVERY_TICKET';
const UNISSUED_READ_TICKET_MSG =
  'Read completion rejected: delivery ticket was not issued by this invocation';
const DEADLINE_EXPIRED_COMPLETION_CODE = 'READ_COMPLETION_DEADLINE_EXPIRED';
const DEADLINE_EXPIRED_COMPLETION_MSG =
  'Read completion rejected: original invocation deadline expired';

const TERM_FLOOR_CHECK_STATE = Object.freeze({
  ACCEPTED: 'accepted',
  BELOW_FLOOR: 'below_floor',
});

const INELIGIBLE_TERM_FLOOR = Object.freeze({
  eligible: false,
  hasLocalReplica: false,
  termFloor: null,
});

function positiveSafeTerm(value) {
  if (typeof value === 'bigint') {
    if (value <= ZERO_BIGINT || value > MAX_SAFE_TERM_BIGINT) {
      return null;
    }
    return Number(value);
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function maxPositiveTerm(left, right) {
  const validLeft = positiveSafeTerm(left);
  const validRight = positiveSafeTerm(right);
  if (validLeft === null) return validRight;
  if (validRight === null) return validLeft;
  return Math.max(validLeft, validRight);
}

function currentInCandidates(router, ticket, candidates) {
  if (!Array.isArray(candidates)) return false;
  return candidates.some((candidate) => matchesRoute(ticket, candidate)) &&
    isCurrentPeer(router, ticket);
}

function isAuthoritativeLocalServiceRow(row, partitionId, nodeId) {
  if (!row || row.partition_id !== partitionId || row.node_id !== nodeId) {
    return false;
  }
  if (readLowerStateField(row.status) === REMOVED_SERVICE_STATUS) {
    return false;
  }
  return !row.service_type || row.service_type === SERVICE_TYPE.PARTITION;
}

function readPartitionServiceRows(executor, partitionId, routingSnapshot) {
  if (Array.isArray(routingSnapshot?.serviceRows)) {
    return routingSnapshot.serviceRows;
  }
  return executor?.systemCache?.filter?.(
    TABLES.SERVICES,
    (row) => row?.partition_id === partitionId,
  ) || [];
}

function resolveServiceRowReplicaId(row) {
  if (typeof row?.service_id === 'string' && row.service_id.length > 0) {
    return row.service_id;
  }
  if (typeof row?.replica_id === 'string' && row.replica_id.length > 0) {
    return row.replica_id;
  }
  return null;
}

function collectAuthoritativeLocalReplicaIds(executor, partitionId, routingSnapshot) {
  const rows = readPartitionServiceRows(executor, partitionId, routingSnapshot);
  const replicaIds = new Set();
  for (const row of rows) {
    if (!isAuthoritativeLocalServiceRow(row, partitionId, executor.nodeId)) {
      continue;
    }
    const replicaId = resolveServiceRowReplicaId(row);
    if (replicaId !== null) {
      replicaIds.add(replicaId);
    }
  }
  return [...replicaIds];
}

function readPersistedTermFloor(executor, partitionId, routingSnapshot) {
  const dataDir = executor?.dataDir;
  if (!dataDir) {
    return null;
  }
  const replicaIds = collectAuthoritativeLocalReplicaIds(
    executor,
    partitionId,
    routingSnapshot,
  );
  let maxTerm = null;
  for (const replicaId of replicaIds) {
    const outcome = observePersistedPartitionTerm({
      dataDir,
      logger: executor.logger,
      partitionId,
      replicaId,
    });
    if (outcome.state === PERSISTED_TERM_STATE.OBSERVED) {
      maxTerm = maxPositiveTerm(maxTerm, outcome.term);
    }
  }
  return maxTerm;
}

function readPublishedLeaderClaimTerm(executor, partitionId) {
  const partitionRow = executor?.getPartitionRecord?.(partitionId) ?? null;
  return positiveSafeTerm(partitionRow?.[COLUMN.LEADER_CLAIM_RAFT_TERM]);
}

function isMatchingCoreAuthority(obs, partitionId, replicaId) {
  return obs?.outcome === RAFT_OPERATION_OUTCOME.CORE_OK &&
    obs.groupId === partitionId &&
    obs.replicaIdentity === replicaId;
}

function observeLocalReplicasTermState(localReplicas, partitionId) {
  let isLocalLeader = false;
  let liveTerm = null;
  for (const replica of localReplicas) {
    const obs = replica?.raft?.observeCurrentAuthority?.() ?? null;
    if (!isMatchingCoreAuthority(obs, partitionId, replica?.replicaId)) {
      continue;
    }
    if (obs.role === RAFT_ROLE.LEADER) {
      isLocalLeader = true;
    }
    liveTerm = maxPositiveTerm(liveTerm, obs.term);
  }
  return {isLocalLeader, liveTerm};
}

function isSelfPublishedPartition(executor, partitionId, routingSnapshot) {
  const nodeId = executor?.nodeId;
  return Boolean(nodeId) &&
    Boolean(partitionId) &&
    routingSnapshot?.canonicalLeaderNodeId === nodeId;
}

function readLocalPartitionTermState(executor, partitionId, routingSnapshot) {
  const rawLocalReplicas = executor.getLocalPartitionReplicas?.(partitionId) ?? null;
  const localReplicas = Array.isArray(rawLocalReplicas) ? rawLocalReplicas : [];
  if (localReplicas.length > 0) {
    invalidatePartitionPersistedTermReaders(executor?.dataDir, partitionId);
    const {isLocalLeader, liveTerm} = observeLocalReplicasTermState(
      localReplicas,
      partitionId,
    );
    return {hasLocalReplica: true, isLocalLeader, localTerm: liveTerm};
  }
  return {
    hasLocalReplica: false,
    isLocalLeader: false,
    localTerm: readPersistedTermFloor(executor, partitionId, routingSnapshot),
  };
}

function resolveSelfPublishedLeaderTermFloor(executor, partitionId, routingSnapshot) {
  if (!isSelfPublishedPartition(executor, partitionId, routingSnapshot)) {
    return INELIGIBLE_TERM_FLOOR;
  }
  const {hasLocalReplica, isLocalLeader, localTerm} = readLocalPartitionTermState(
    executor,
    partitionId,
    routingSnapshot,
  );
  if (isLocalLeader || localTerm === null) {
    return INELIGIBLE_TERM_FLOOR;
  }
  const publishedClaimTerm = readPublishedLeaderClaimTerm(executor, partitionId);
  if (publishedClaimTerm !== null && localTerm < publishedClaimTerm) {
    return INELIGIBLE_TERM_FLOOR;
  }
  return Object.freeze({
    eligible: true,
    hasLocalReplica,
    termFloor: localTerm,
  });
}

function observeActiveSelfLeaderTermFloor(executor, partitionId, routingSnapshot) {
  if (!isSelfPublishedPartition(executor, partitionId, routingSnapshot)) {
    return null;
  }
  const {localTerm} = readLocalPartitionTermState(
    executor,
    partitionId,
    routingSnapshot,
  );
  const publishedClaimTerm = readPublishedLeaderClaimTerm(executor, partitionId);
  return maxPositiveTerm(localTerm, publishedClaimTerm);
}

function orderSelfLeaderProbeServices(orderedServices, nodeId, hasLocalReplica) {
  const own = orderedServices.filter((service) => service.node_id === nodeId);
  const peers = orderedServices.filter((service) => service.node_id !== nodeId);
  return hasLocalReplica ? [...own, ...peers] : [...peers, ...own];
}

function mergeSelfLeaderTermFloor(currentFloor, nextFloor) {
  return maxPositiveTerm(currentFloor, nextFloor);
}

function checkDeliveryTermFloor(delivery, termFloor) {
  const validFloor = positiveSafeTerm(termFloor);
  if (validFloor === null) {
    return Object.freeze({state: TERM_FLOOR_CHECK_STATE.ACCEPTED});
  }
  const witnessTerm = positiveSafeTerm(
    deliveryAnswerOf(delivery)?.readAuthorityWitness?.term,
  );
  if (witnessTerm !== null && witnessTerm >= validFloor) {
    return Object.freeze({state: TERM_FLOOR_CHECK_STATE.ACCEPTED});
  }
  return Object.freeze({
    state: TERM_FLOOR_CHECK_STATE.BELOW_FLOOR,
    failure: {
      error: OWNER_FACT_UNAVAILABLE_REASON.BELOW_TERM_FLOOR,
      failureCode: OWNER_FACT_UNAVAILABLE_REASON.BELOW_TERM_FLOOR,
      success: false,
    },
  });
}

function shouldRetainTermFloorFailure(currentDetails, nextFailure) {
  if (currentDetails?.failureCode !== OWNER_FACT_UNAVAILABLE_REASON.BELOW_TERM_FLOOR) {
    return false;
  }
  const nextCode = nextFailure?.failureCode ?? null;
  return nextCode === null ||
    nextCode === OWNER_FACT_UNAVAILABLE_REASON.NOT_LEADER ||
    nextCode === READ_ROUTE_SUPERSEDED_CODE;
}

function executorNowMs(executor) {
  if (executor?.nowFn) {
    return executor.nowFn();
  }
  if (executor?.timeSource) {
    return executor.timeSource.now();
  }
  return Date.now();
}

function resolveExplicitDeadlineMs(executionOptions) {
  if (Number.isFinite(executionOptions?.deadlineMs)) {
    return Math.floor(executionOptions.deadlineMs);
  }
  if (Number.isFinite(executionOptions?.timeoutBudget?.deadlineMs)) {
    return Math.floor(executionOptions.timeoutBudget.deadlineMs);
  }
  return null;
}

function buildTypedAuthorityError(message, code) {
  return Object.assign(new Error(message), {code});
}

function isRedirectRouteCurrent(router, ticket, routes, redirectCandidate, strictCanonical) {
  const eligibleTarget = redirectCandidate ?
    redirectCandidate(ticket.address, routes) :
    null;
  if (!eligibleTarget) {
    return !strictCanonical && !ticket.hadRoutableTarget;
  }
  if (!matchesRoute(ticket, eligibleTarget) || !isCurrentPeer(router, ticket)) {
    return false;
  }
  if (!strictCanonical) {
    return true;
  }
  return currentInCandidates(router, ticket, routes?.candidates) ||
    (Boolean(ticket.originTicket) &&
      currentInCandidates(router, ticket.originTicket, routes?.candidates));
}

function stampCompletedReadResult(result, sealedResults) {
  if (result && typeof result === 'object') {
    sealedResults.add(result);
  }
  return result;
}

function defaultSuccessBuilder(answer) {
  return answer;
}

function defaultIsSuccessfulResponse(delivery) {
  return Boolean(deliveryAnswerOf(delivery)?.success);
}

function normalizeInvocationTrackerOptions(options = {}) {
  return {
    buildSuccessResult: options.buildSuccessResult || defaultSuccessBuilder,
    cancellationToken: options.cancellationToken || null,
    candidateEligibility: options.candidateEligibility || null,
    executionOptions: options.executionOptions || {},
    forRead: options.forRead !== false,
    getRemainingExecutionBudgetMs: options.getRemainingExecutionBudgetMs || null,
    isSuccessfulResponse: options.isSuccessfulResponse || defaultIsSuccessfulResponse,
    readDelivery: options.readDelivery || null,
    requireCanonicalLeader: options.requireCanonicalLeader === true,
    resolveCandidates: options.resolveCandidates || null,
  };
}

function createInvocationTermFloorTracker(executor, partitionId, rawOptions = {}) {
  const {
    buildSuccessResult,
    cancellationToken,
    candidateEligibility,
    executionOptions,
    forRead,
    getRemainingExecutionBudgetMs,
    isSuccessfulResponse,
    readDelivery,
    requireCanonicalLeader,
    resolveCandidates,
  } = normalizeInvocationTrackerOptions(rawOptions);
  const router = executor?.messageRouter ?? null;
  const explicitDeadlineMs = resolveExplicitDeadlineMs(executionOptions);
  const strictRouteCurrency = forRead &&
    (Boolean(readDelivery) || requireCanonicalLeader);
  const issuedTickets = new WeakSet();
  const sealedResults = new WeakSet();
  let termFloor = null;
  let latestRoutes = null;

  function observe(resolution, refreshActiveFloor = false) {
    if (resolution) {
      latestRoutes = resolution;
    }
    const resolvedFloor = positiveSafeTerm(resolution?.selfPublishedLeaderTermFloor);
    if (resolvedFloor !== null) {
      termFloor = mergeSelfLeaderTermFloor(termFloor, resolvedFloor);
      if (!refreshActiveFloor) {
        return termFloor;
      }
    }
    if (termFloor !== null && resolution?.routingSnapshot) {
      termFloor = mergeSelfLeaderTermFloor(
        termFloor,
        observeActiveSelfLeaderTermFloor(executor, partitionId, resolution.routingSnapshot),
      );
    }
    return termFloor;
  }

  function resolveRoutes() {
    if (typeof resolveCandidates !== 'function') {
      if (latestRoutes?.routingSnapshot) {
        observe(latestRoutes, true);
      }
      return latestRoutes || {candidates: [], routingSnapshot: null};
    }
    const resolved = resolveCandidates();
    observe(resolved, false);
    return resolved;
  }

  function isIssuedTicket(ticket) {
    return Boolean(ticket) &&
      typeof ticket === 'object' &&
      issuedTickets.has(ticket);
  }

  function issueTicket(draft) {
    if (isIssuedTicket(draft)) {
      return draft;
    }
    if (!draft || typeof draft.address !== 'string' || draft.address.length === 0) {
      throw buildTypedAuthorityError(UNISSUED_READ_TICKET_MSG, UNISSUED_READ_TICKET_CODE);
    }
    if (draft.isRedirect && draft.originTicket && !isIssuedTicket(draft.originTicket)) {
      throw buildTypedAuthorityError(UNISSUED_READ_TICKET_MSG, UNISSUED_READ_TICKET_CODE);
    }
    const peer = draft.peer !== undefined ?
      draft.peer :
      peerIdentityOf(router, draft.serviceInfo?.nodeId);
    const ticket = {...draft, peer};
    Object.freeze(ticket);
    issuedTickets.add(ticket);
    return ticket;
  }

  function isTicketRouteCurrent(ticket, routes = latestRoutes) {
    if (!isIssuedTicket(ticket) || !isCurrentPeer(router, ticket)) {
      return false;
    }
    if (!strictRouteCurrency || !routes) {
      return true;
    }
    if (ticket.isRedirect) {
      return isRedirectRouteCurrent(
        router,
        ticket,
        routes,
        candidateEligibility?.redirectCandidate,
        strictRouteCurrency,
      );
    }
    return currentInCandidates(router, ticket, routes.candidates);
  }

  function throwIfAborted() {
    executor?.throwIfCancelled?.(cancellationToken);
    readDelivery?.throwIfAborted?.();
    if (executionOptions?.signal?.aborted) {
      executionOptions.signal.throwIfAborted();
    }
  }

  function isDeadlineExpired() {
    if (typeof getRemainingExecutionBudgetMs === 'function') {
      const remainingMs = getRemainingExecutionBudgetMs();
      if (remainingMs !== null && remainingMs <= 0) {
        return true;
      }
    }
    return explicitDeadlineMs !== null && executorNowMs(executor) >= explicitDeadlineMs;
  }

  function refreshObservationsForCompletion() {
    if (!strictRouteCurrency) {
      if (termFloor !== null && latestRoutes?.routingSnapshot) {
        observe(latestRoutes, true);
      }
      return latestRoutes;
    }
    const refreshed = resolveRoutes();
    if (refreshed?.candidates) {
      readDelivery?.reconcile?.(refreshed.candidates);
    }
    return refreshed;
  }

  function buildAcceptedCompletion(ticket, delivery, redirectedFromAddress, routes) {
    const builtResult = buildSuccessResult(deliveryAnswerOf(delivery), {
      address: ticket.address,
      executionOptions,
      partitionId,
      ...(redirectedFromAddress ? {redirectedFromAddress} : {}),
      request: ticket.request,
    });
    if (!builtResult || typeof builtResult !== 'object') {
      return Object.freeze({
        accepted: false,
        latestRoutes: routes,
        response: builtResult || deliveryReadingOf(delivery),
        state: READ_COMPLETION_STATE.REJECTED_RESPONSE,
      });
    }
    const sealed = stampCompletedReadResult(builtResult, sealedResults);
    return Object.freeze({
      accepted: true,
      completedResult: sealed,
      latestRoutes: routes,
      response: deliveryReadingOf(delivery),
      state: READ_COMPLETION_STATE.ACCEPTED,
    });
  }

  function handleCompletionError(error, ticket, routes) {
    if (strictRouteCurrency && !isTicketRouteCurrent(ticket, routes)) {
      return Object.freeze({
        accepted: false,
        latestRoutes: routes,
        response: ROUTE_SUPERSEDED_FAILURE,
        state: READ_COMPLETION_STATE.ROUTE_SUPERSEDED,
      });
    }
    throw error;
  }

  function isLateCompletionOrRedirect(succeeded, reading) {
    if (!isDeadlineExpired()) {
      return false;
    }
    if (succeeded) {
      return Boolean(forRead);
    }
    return Boolean(reading?.redirect) && Boolean(reading?.leaderAddress);
  }

  function completeDelivery({
    ticket,
    delivery,
    error = null,
    redirectedFromAddress = undefined,
  }) {
    if (!isIssuedTicket(ticket)) {
      throw buildTypedAuthorityError(UNISSUED_READ_TICKET_MSG, UNISSUED_READ_TICKET_CODE);
    }
    const routes = refreshObservationsForCompletion();
    if (error) {
      return handleCompletionError(error, ticket, routes);
    }
    throwIfAborted();
    const succeeded = Boolean(isSuccessfulResponse(delivery));
    const reading = deliveryReadingOf(delivery);
    if (isLateCompletionOrRedirect(succeeded, reading)) {
      return Object.freeze({
        accepted: false,
        latestRoutes: routes,
        response: null,
        state: READ_COMPLETION_STATE.DEADLINE_EXPIRED,
      });
    }
    if (succeeded) {
      const floorCheck = checkDeliveryTermFloor(delivery, termFloor);
      if (floorCheck.state !== TERM_FLOOR_CHECK_STATE.ACCEPTED) {
        return Object.freeze({
          accepted: false,
          latestRoutes: routes,
          response: floorCheck.failure,
          state: READ_COMPLETION_STATE.BELOW_TERM_FLOOR,
        });
      }
    }
    if (!isTicketRouteCurrent(ticket, routes)) {
      return Object.freeze({
        accepted: false,
        latestRoutes: routes,
        response: ROUTE_SUPERSEDED_FAILURE,
        state: READ_COMPLETION_STATE.ROUTE_SUPERSEDED,
      });
    }
    if (!succeeded) {
      return Object.freeze({
        accepted: false,
        latestRoutes: routes,
        response: reading,
        state: READ_COMPLETION_STATE.REJECTED_RESPONSE,
      });
    }
    return buildAcceptedCompletion(ticket, delivery, redirectedFromAddress, routes);
  }

  function finalizeAcceptedResult(result) {
    throwIfAborted();
    if (forRead && isDeadlineExpired()) {
      throw buildTypedAuthorityError(
        DEADLINE_EXPIRED_COMPLETION_MSG,
        DEADLINE_EXPIRED_COMPLETION_CODE,
      );
    }
    if (!result || typeof result !== 'object' || !sealedResults.has(result)) {
      throw buildTypedAuthorityError(
        UNSEALED_READ_COMPLETION_MSG,
        UNSEALED_READ_COMPLETION_CODE,
      );
    }
    return result;
  }

  readDelivery?.bindTicketIssuer?.(issueTicket);

  return Object.freeze({
    completeDelivery,
    current: () => termFloor,
    finalizeAcceptedResult,
    getLatestRoutes: () => latestRoutes,
    isDeadlineExpired,
    isIssuedTicket,
    isTicketRouteCurrent,
    issueTicket,
    merge: (nextFloor) => {
      termFloor = mergeSelfLeaderTermFloor(termFloor, nextFloor);
      return termFloor;
    },
    observe,
    requiresCanonicalRouteCurrency: () => strictRouteCurrency,
    resolveRoutes,
    shouldRefreshRoutesOnCompletion: () => strictRouteCurrency,
    throwIfAborted,
  });
}

export {
  DEADLINE_EXPIRED_COMPLETION_CODE,
  READ_COMPLETION_STATE,
  READ_ROUTE_SUPERSEDED_CODE,
  REDIRECT_STEP_ACTION,
  UNISSUED_READ_TICKET_CODE,
  UNSEALED_READ_COMPLETION_CODE,
  createInvocationTermFloorTracker,
  orderSelfLeaderProbeServices,
  resolveSelfPublishedLeaderTermFloor,
  shouldRetainTermFloorFailure,
};
