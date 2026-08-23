/**
 * Mechanical ingress transport machinery shared by the request Cell and
 * call Cell dispatch surfaces. Everything here is owner-neutral: active
 * request lifecycle, cancellation-aware awaiting, bounded in-flight
 * accounting, attempt retry, envelope guard construction, and the ready
 * Cell actual predicates. Each consumer parameterizes the machinery with
 * its own routing-contract error kit (failure factory, error codes,
 * classifications, messages) so the owner-facing failure taxonomy stays
 * declared in the owning contract module, never here.
 */

import {TRANSPORT_EVENT} from '../constants/transport.js';

const DEFAULT_DEADLINE_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_MAX_IN_FLIGHT = 128;
const DEFAULT_MAX_IN_FLIGHT_PER_TARGET = 32;
const ROUTE_MATCH_FIELDS = Object.freeze([
  'bindingVersionId',
  'replicaId',
  'serviceId',
  'targetNodeId',
]);

function createActiveRequest() {
  let resolveSettled;
  const settled = new Promise((resolve) => {
    resolveSettled = resolve;
  });
  return {
    abortController: new AbortController(),
    dispatchStarted: false,
    resolveSettled,
    settled,
  };
}

function createRequestCancellationAwaiter(createShutdownFailure) {
  return function awaitWithRequestCancellation(promise, activeRequest) {
    const signal = activeRequest.abortController.signal;
    if (signal.aborted) {
      return Promise.reject(
        signal.reason instanceof Error ?
          signal.reason :
          createShutdownFailure(activeRequest),
      );
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const complete = (settle, value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener(TRANSPORT_EVENT.ABORT, onAbort);
        settle(value);
      };
      function onAbort() {
        complete(
          reject,
          signal.reason instanceof Error ?
            signal.reason :
            createShutdownFailure(activeRequest),
        );
      }
      signal.addEventListener(
        TRANSPORT_EVENT.ABORT,
        onAbort,
        {once: true},
      );
      Promise.resolve(promise).then(
        (value) => complete(resolve, value),
        (error) => complete(reject, error),
      );
    });
  };
}

class CellDispatchAttemptOwner {
  constructor(maxAttempts, normalizeError) {
    this._maxAttempts = maxAttempts;
    this._normalizeError = normalizeError;
  }

  async run(executeAttempt) {
    return this._runAttempt(executeAttempt, 1);
  }

  async _runAttempt(executeAttempt, attempt) {
    try {
      return await executeAttempt(attempt);
    } catch (error) {
      const failure = this._normalizeError(error);
      if (
        !failure.retryable ||
        failure.invoked ||
        attempt >= this._maxAttempts
      ) {
        throw failure;
      }
      return this._runAttempt(executeAttempt, attempt + 1);
    }
  }
}

/**
 * Bounded in-flight accounting for one ingress surface: a global bound
 * plus a per-target bound, released through the returned closure. The
 * bounds are read through getters on every acquire so the owning
 * adapter's configured fields stay authoritative.
 * @param {object} options
 * @param {Function} options.createOverloadFailure kit-owned failure for
 *   the bound-exceeded refusal
 * @param {Function} options.getMaxInFlight
 * @param {Function} options.getMaxInFlightPerTarget
 * @return {object} {acquire(targetNodeId), inFlight(), inFlightByTarget()}
 */
function createInFlightGovernor(options) {
  const {createOverloadFailure, getMaxInFlight, getMaxInFlightPerTarget} =
    options;
  let inFlight = 0;
  const inFlightByTarget = new Map();
  return {
    acquire(targetNodeId) {
      const targetCount = inFlightByTarget.get(targetNodeId) || 0;
      if (
        inFlight >= getMaxInFlight() ||
        targetCount >= getMaxInFlightPerTarget()
      ) {
        throw createOverloadFailure();
      }
      inFlight += 1;
      inFlightByTarget.set(targetNodeId, targetCount + 1);
      return () => {
        inFlight = Math.max(0, inFlight - 1);
        const nextTargetCount =
          (inFlightByTarget.get(targetNodeId) || 1) - 1;
        if (nextTargetCount <= 0) {
          inFlightByTarget.delete(targetNodeId);
        } else {
          inFlightByTarget.set(targetNodeId, nextTargetCount);
        }
      };
    },
    inFlight() {
      return inFlight;
    },
    inFlightByTarget() {
      return Object.fromEntries(inFlightByTarget.entries());
    },
  };
}

function assertRequestOpen(shuttingDown, activeRequest,
  createShutdownFailure) {
  if (
    shuttingDown ||
    activeRequest.abortController.signal.aborted
  ) {
    throw activeRequest.abortController.signal.reason instanceof Error ?
      activeRequest.abortController.signal.reason :
      createShutdownFailure(activeRequest);
  }
}

function abortActiveRequests(activeRequests, createShutdownFailure) {
  const aborting = [...activeRequests];
  for (const request of aborting) {
    request.abortController.abort(createShutdownFailure(request));
  }
  return Promise.allSettled(
    aborting.map((request) => request.settled),
  ).then(() => undefined);
}

function buildDispatchOptions(fields) {
  return {
    deadlineMs: fields.deadlineMs,
    nodeId: fields.ingressNodeId,
    requireProcessedResponse: true,
    responseContext: {
      invocationId: fields.invocationId,
      replicaId: fields.route.replicaId,
    },
    securityContext: fields.securityContext,
    selectedRoute: fields.route,
    signal: fields.activeRequest.abortController.signal,
    traceId: fields.traceId,
  };
}

function routeFieldsMatch(envelope, route) {
  const selected = envelope?.payload?.route;
  if (!selected || !route) return false;
  return ROUTE_MATCH_FIELDS.every(
    (field) => selected[field] === route[field],
  ) && envelope.serviceId === route.serviceId;
}

/**
 * The three ServiceDispatcher guard hooks plus the lazily-bound router,
 * built against one cell kind's error kit.
 * @param {object} kit
 * @param {Function} kit.createAuthenticationFailure
 * @param {Function} kit.createAuthorizationFailure
 * @param {Function} kit.createRouterUnavailableFailure
 * @param {Function} kit.createTargetStaleFailure
 * @param {string} kit.applicationRole
 * @return {object} {authenticateEnvelope, authorizeEnvelope,
 *   resolveSelectedTarget, createLazyMessageRouter}
 */
function createEnvelopeDispatchGuards(kit) {
  return {
    authenticateEnvelope(envelope, context) {
      const securityContext = context?.securityContext;
      if (
        !Object.isFrozen(securityContext) ||
        !Object.isFrozen(securityContext?.roles) ||
        envelope?.tenantId !== securityContext?.tenantId ||
        envelope?.principal !== securityContext?.principal
      ) {
        throw kit.createAuthenticationFailure();
      }
      return securityContext;
    },
    authorizeEnvelope(_envelope, context) {
      const securityContext = context?.authn;
      if (!securityContext?.roles?.includes(kit.applicationRole)) {
        throw kit.createAuthorizationFailure();
      }
    },
    resolveSelectedTarget(envelope, context) {
      const route = context?.selectedRoute;
      if (!routeFieldsMatch(envelope, route)) {
        throw kit.createTargetStaleFailure();
      }
      return {
        targetAddress: route.targetAddress,
        targetNodeId: route.targetNodeId,
      };
    },
    createLazyMessageRouter(provider) {
      return {
        async deliver(targetAddress, message, options) {
          const messageRouter = provider();
          if (!messageRouter ||
              typeof messageRouter.deliver !== 'function') {
            throw kit.createRouterUnavailableFailure();
          }
          return messageRouter.deliver(targetAddress, message, options);
        },
      };
    },
  };
}

function positiveIntegerOrDefault(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/**
 * Mechanical ingress adapter lifecycle shared by both cell dispatch
 * surfaces: bounded in-flight dispatch attempts, cancellation-aware
 * shutdown draining, and diagnostics. Subclasses own their invoke()
 * pipeline and parameterize everything owner-visible through the kit:
 * @param {object} kit
 * @param {Function} kit.buildEnvelope owner Service_Message shape
 * @param {Function} kit.createOverloadFailure
 * @param {Function} kit.createShutdownFailure
 * @param {Function} kit.failureFromDelivery
 * @param {Function} kit.mapProcessedDelivery processed-delivery result
 * @param {Function} kit.normalizeDispatchError
 */
class CellIngressAdapterBase {
  constructor(options, kit) {
    this._kit = kit;
    this._routeResolver = options.routeResolver;
    this._serviceDispatcher = options.serviceDispatcher;
    this._awaitCancellation =
      createRequestCancellationAwaiter(kit.createShutdownFailure);
    this._deadlineMs = positiveIntegerOrDefault(
      options.deadlineMs,
      DEFAULT_DEADLINE_MS,
    );
    this._attemptOwner = new CellDispatchAttemptOwner(
      positiveIntegerOrDefault(options.maxAttempts, DEFAULT_MAX_ATTEMPTS),
      kit.normalizeDispatchError,
    );
    this._maxInFlight = positiveIntegerOrDefault(
      options.maxInFlight,
      DEFAULT_MAX_IN_FLIGHT,
    );
    this._maxInFlightPerTarget = positiveIntegerOrDefault(
      options.maxInFlightPerTarget,
      DEFAULT_MAX_IN_FLIGHT_PER_TARGET,
    );
    this._inFlightGovernor = createInFlightGovernor({
      createOverloadFailure: kit.createOverloadFailure,
      getMaxInFlight: () => this._maxInFlight,
      getMaxInFlightPerTarget: () => this._maxInFlightPerTarget,
    });
    this._activeRequests = new Set();
    this._shuttingDown = false;
    this._shutdownPromise = null;
  }

  _assertOpen(activeRequest) {
    assertRequestOpen(
      this._shuttingDown,
      activeRequest,
      this._kit.createShutdownFailure,
    );
  }

  async _dispatchAttempt(fields) {
    const release =
      this._inFlightGovernor.acquire(fields.route.targetNodeId);
    try {
      const envelope = this._kit.buildEnvelope(fields);
      fields.activeRequest.dispatchStarted = true;
      const result = await this._awaitCancellation(
        this._serviceDispatcher.dispatch(
          envelope,
          buildDispatchOptions(fields),
        ),
        fields.activeRequest,
      );
      if (result.delivery?.processed === true) {
        return this._kit.mapProcessedDelivery(result.delivery, fields);
      }
      throw this._kit.failureFromDelivery(result.delivery);
    } finally {
      release();
    }
  }

  async shutdown() {
    if (this._shutdownPromise) return this._shutdownPromise;
    this._shuttingDown = true;
    this._shutdownPromise = abortActiveRequests(
      this._activeRequests,
      this._kit.createShutdownFailure,
    );
    return this._shutdownPromise;
  }

  getDiagnostics() {
    return {
      activeRequests: this._activeRequests.size,
      inFlight: this._inFlightGovernor.inFlight(),
      inFlightByTarget: this._inFlightGovernor.inFlightByTarget(),
      shuttingDown: this._shuttingDown,
    };
  }
}

export {
  CellIngressAdapterBase,
  createActiveRequest,
  createEnvelopeDispatchGuards,
  createRequestCancellationAwaiter,
};
