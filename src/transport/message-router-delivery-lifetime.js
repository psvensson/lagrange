// Private local delivery lifetime. Only a remaining duration crosses the wire;
// the creating clock and source invocation never leave this process.
import {assertCdcDeliveryInvocation} from '../cdc/cdc-delivery-invocation.js';
import {createTimeoutBudget, getRemainingBudgetMs} from '../control-plane/timeout-budget.js';
import {ROUTER_ERROR_MSG, TRANSPORT_ERROR_MSG, TRANSPORT_EVENT} from '../constants/transport.js';
import {ROUTER_MESSAGE_TIMEOUT_ERROR_CODE} from './transport-error-codes.js';
const DELIVERY_LIFETIME_INVALID = 'router_delivery_lifetime_invalid';
const lifetimes = new WeakMap();

function deliveryTimeoutError() {
  return Object.assign(new Error(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT), {
    code: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
    deferRetry: true,
  });
}

function deliveryAbortReason(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error(ROUTER_ERROR_MSG.SHUTDOWN);
}

function invalidLifetime() {
  return Object.assign(new Error(DELIVERY_LIFETIME_INVALID), {code: DELIVERY_LIFETIME_INVALID});
}

function validateDeliveryCallbacks(options) {
  for (const callback of [options.remainingMs, options.prepareDeliveryMessage]) {
    if (callback !== undefined && typeof callback !== 'function') throw invalidLifetime();
  }
  if (options.deliveryDurationField !== undefined &&
      (typeof options.deliveryDurationField !== 'string' || options.deliveryDurationField.length === 0 ||
       typeof options.prepareDeliveryMessage !== 'function')) throw invalidLifetime();
}

function parentDeliveryLimits(context, parentRemaining, localRemaining) {
  const limits = [localRemaining];
  if (context !== undefined) {
    assertCdcDeliveryInvocation(context);
    limits.push(context.remainingMs());
  }
  if (parentRemaining) limits.push(parentRemaining());
  if (context !== undefined) assertCdcDeliveryInvocation(context);
  return limits;
}

function createDeliveryLifetime(router, options) {
  const routerLifetime = router.connectionAuthorityOwner.captureDeliveryLifetime();
  const {deliveryContext: context, remainingMs: parentRemaining, prepareDeliveryMessage} = options;
  if (context !== undefined) assertCdcDeliveryInvocation(context);
  validateDeliveryCallbacks(options);
  const clock = router.timeSource;
  const now = () => clock.now();
  // Preserve the public positive-override-or-default option. Genuine parent
  // grants below are strict: zero/invalid remaining time never gets a default.
  const requestedMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ?
    Math.floor(options.timeoutMs) : router.messageTimeoutMs;
  let budget = createTimeoutBudget({configuredBudgetMs: requestedMs, now});
  const controller = new AbortController();
  const listeners = [];
  let timeoutId = null;
  let refusal = null;
  let timeoutError = null;
  let shutdownError = null;
  let closed = false;
  const clearTimer = () => {
    if (timeoutId !== null) clock.clearTimeout(timeoutId);
    timeoutId = null;
  };
  const spent = () => {
    timeoutError ??= deliveryTimeoutError();
    return timeoutError;
  };
  const refuse = (error) => {
    if (refusal !== null) return;
    refusal = error;
    clearTimer();
    controller.abort(error);
  };
  const shutdown = () => {
    shutdownError ??= new Error(ROUTER_ERROR_MSG.SHUTDOWN);
    return shutdownError;
  };
  const armTimer = (remainingMs) => {
    clearTimer();
    timeoutId = clock.setTimeout(() => {
      try {
        armTimer(remaining());
      } catch (error) {
        // Idempotent when remaining() already refused; timer failures use the same owner.
        refuse(error);
      }
    }, remainingMs);
    timeoutId?.unref?.();
  };
  function remaining() {
    if (refusal !== null) throw refusal;
    if (closed) throw invalidLifetime();
    try {
      if (router.isShuttingDown || !routerLifetime.isCurrent()) throw shutdown();
      const observedAtMs = clock.now();
      const localRemaining = getRemainingBudgetMs(budget, {now: () => observedAtMs});
      const limits = parentDeliveryLimits(context, parentRemaining, localRemaining);
      if (refusal !== null) throw refusal;
      if (limits.some((value) => !Number.isFinite(value) || value <= 0)) {
        throw spent();
      }
      const grantedMs = Math.floor(Math.min(...limits));
      if (grantedMs <= 0) throw spent();
      if (grantedMs < localRemaining) {
        // A later parent observation may shorten this local grant, never renew it.
        budget = createTimeoutBudget({
          configuredBudgetMs: grantedMs, startedAtMs: observedAtMs, now,
        });
        armTimer(grantedMs);
      }
      // Parent checks and timer scheduling are synchronous calls too. Debit
      // their time before a caller can use the grant for an actual effect.
      const actualRemaining = Math.floor(getRemainingBudgetMs(budget, {now}));
      if (actualRemaining <= 0) throw spent();
      return actualRemaining;
    } catch (error) {
      refuse(error);
      throw error;
    }
  }
  const dispose = () => {
    closed = true;
    clearTimer();
    for (const [signal, listener] of listeners) {
      signal.removeEventListener(TRANSPORT_EVENT.ABORT, listener);
    }
  };
  const lifetime = Object.freeze({
    clock,
    context,
    durationField: options.deliveryDurationField,
    signal: controller.signal,
    remainingMs: remaining,
    ownsTimeout: (error) => error === timeoutError && timeoutError !== null,
    ownsShutdown: (error) => error === shutdownError && shutdownError !== null,
    dispose,
    prepareMessage: (message) => {
      const grantedMs = remaining();
      const prepared = prepareDeliveryMessage ?
        prepareDeliveryMessage(message, grantedMs) : message;
      remaining();
      return prepared;
    },
  });
  lifetimes.set(lifetime, router);
  try {
    const onShutdown = () => refuse(shutdown());
    if (!routerLifetime.isCurrent() || routerLifetime.signal.aborted) throw shutdown();
    routerLifetime.signal.addEventListener(TRANSPORT_EVENT.ABORT, onShutdown, {once: true});
    listeners.push([routerLifetime.signal, onShutdown]);
    for (const signal of new Set([options.signal, context?.signal])) {
      if (!signal) continue;
      if (signal.aborted) throw deliveryAbortReason(signal);
      const listener = () => refuse(deliveryAbortReason(signal));
      signal.addEventListener(TRANSPORT_EVENT.ABORT, listener, {once: true});
      listeners.push([signal, listener]);
    }
    armTimer(requestedMs);
    return lifetime;
  } catch (error) {
    dispose();
    throw error;
  }
}

function assertDeliveryOpen(options = {}) {
  if (options.signal?.aborted) throw deliveryAbortReason(options.signal);
  if (options.deliveryLifetime === undefined) return null;
  if (!lifetimes.has(options.deliveryLifetime)) throw invalidLifetime();
  return options.deliveryLifetime.remainingMs();
}

function remainingDeliveryMs(options, fallbackMs) {
  return assertDeliveryOpen(options) ?? fallbackMs;
}

function runDeliveryOperation(lifetime, options, operation) {
  // Acquire raw cleanup custody before starting or racing the operation. A
  // public timeout cannot detach a handler or an already-started reconnect.
  const raw = Promise.withResolvers();
  try {
    lifetime.context?.ownChild(raw.promise);
  } catch (error) {
    lifetime.dispose();
    return Promise.reject(error);
  }
  const result = new Promise((resolve, reject) => {
    const aborted = () => reject(deliveryAbortReason(lifetime.signal));
    lifetime.signal.addEventListener(TRANSPORT_EVENT.ABORT, aborted, {once: true});
    const settled = (settle, value) => {
      lifetime.signal.removeEventListener(TRANSPORT_EVENT.ABORT, aborted);
      try {
        lifetime.remainingMs();
        settle(value);
      } catch (error) {
        reject(error);
      } finally {
        lifetime.dispose();
      }
    };
    raw.promise.then((value) => settled(resolve, value), (error) => settled(reject, error));
  });
  try {
    lifetime.remainingMs();
    Promise.resolve(operation({
      ...options, deliveryLifetime: lifetime, signal: lifetime.signal,
    })).then(raw.resolve, raw.reject);
  } catch (error) {
    raw.reject(error);
  }
  return result;
}

function withDeliveryLifetime(router, options, operation, onRetired) {
  const existing = options.deliveryLifetime;
  if (existing !== undefined) {
    if (lifetimes.get(existing) !== router) throw invalidLifetime();
    assertDeliveryOpen(options);
    return operation(options);
  }
  const lifetime = createDeliveryLifetime(router, options);
  return runDeliveryOperation(lifetime, options, operation).catch((error) => {
    if (onRetired && (lifetime.ownsTimeout(error) || lifetime.ownsShutdown(error))) {
      return onRetired(error, lifetime);
    }
    throw error;
  });
}

export {
  assertDeliveryOpen,
  deliveryAbortReason,
  remainingDeliveryMs,
  withDeliveryLifetime,
};
