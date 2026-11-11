// Private local delivery lifetime. Only a remaining duration crosses the wire;
// the creating clock and source invocation never leave this process.
import {assertCdcDeliveryInvocation} from '../cdc/cdc-delivery-invocation.js';
import {createTimeoutBudget, getRemainingBudgetMs} from '../control-plane/timeout-budget.js';
import {ROUTER_ERROR_MSG, TRANSPORT_ERROR_MSG, TRANSPORT_EVENT} from '../constants/transport.js';
import {
  ROUTER_DELIVERY_LIFETIME_INVALID_ERROR_CODE,
  ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
} from './transport-error-codes.js';
import {TRANSPORT_ACKNOWLEDGEMENT, advancesAcknowledgement, isAckWaitOpen}
  from './transport-acknowledgement.js';
const lifetimes = new WeakMap();

// The lifetime was spent. The error states the acknowledgement recorded on
// this delivery at that moment, which is what names the timeout: no ACK yet
// is an ACK timeout, an acknowledged delivery is an answer timeout.
function deliveryTimeoutError(acknowledgement) {
  return Object.assign(new Error(TRANSPORT_ERROR_MSG.MESSAGE_TIMEOUT), {
    code: ROUTER_MESSAGE_TIMEOUT_ERROR_CODE,
    deferRetry: true,
    acknowledgement,
  });
}

function deliveryAbortReason(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error(ROUTER_ERROR_MSG.SHUTDOWN);
}

function invalidLifetime() {
  return Object.assign(new Error(ROUTER_DELIVERY_LIFETIME_INVALID_ERROR_CODE),
    {code: ROUTER_DELIVERY_LIFETIME_INVALID_ERROR_CODE});
}

function validateDeliveryCallbacks(options) {
  for (const callback of [options.remainingMs, options.prepareDeliveryMessage,
    options.onAcknowledgement]) {
    if (callback !== undefined && typeof callback !== 'function') throw invalidLifetime();
  }
  if (options.deliveryDurationField !== undefined &&
      (typeof options.deliveryDurationField !== 'string' || options.deliveryDurationField.length === 0 ||
       typeof options.prepareDeliveryMessage !== 'function')) throw invalidLifetime();
  // An ACK bound is optional; a supplied one is a positive duration. Zero or
  // an unmeasured value never falls back to "no ACK bound".
  const {ackTimeoutMs} = options;
  if (ackTimeoutMs !== undefined && ackTimeoutMs !== null &&
      !(Number.isFinite(ackTimeoutMs) && ackTimeoutMs >= 1)) throw invalidLifetime();
}

// The ACK wait's own bound (`ackTimeoutMs`), counted from the start of the
// delivery like the lifetime it sits inside: queue residence, connection wait
// and the wait for the ACK. Absent, the ACK wait is bounded by the lifetime.
function createAckWaitBudget(options, now) {
  return Number.isFinite(options.ackTimeoutMs) ?
    createTimeoutBudget({configuredBudgetMs: Math.floor(options.ackTimeoutMs), now}) : null;
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
  const ackWaitBudget = createAckWaitBudget(options, now);
  // What this router knows of the target router's acceptance. sendWithAck and
  // the ledger's ACK handler record it; the timeout error is stamped from it.
  let acknowledgement = TRANSPORT_ACKNOWLEDGEMENT.NOT_SENT;
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
    timeoutError ??= deliveryTimeoutError(acknowledgement);
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
  // The ACK bound's remainder while the ACK wait is open, else null: an
  // acknowledged (or rejected, or one-way) delivery has no ACK expiry left,
  // and a delivery handed to another transport leaves the ACK wait to it.
  const ackWaitRemainingMs = () => (ackWaitBudget !== null && isAckWaitOpen(acknowledgement) ?
    Math.floor(getRemainingBudgetMs(ackWaitBudget, {now})) : null);
  const ackWaitSpent = () => {
    const ackRemainingMs = ackWaitRemainingMs();
    return ackRemainingMs !== null && ackRemainingMs <= 0;
  };
  // The deadline settles an owned obligation (F1: queue, connection wait,
  // ACK and response), so it stays ref'd: an empty event loop must still see
  // the typed refusal. refuse(), dispose() and router shutdown clear it.
  // The earlier of the two expiries (ACK bound, lifetime) owns the timer.
  const armTimer = (remainingMs) => {
    clearTimer();
    const ackRemainingMs = ackWaitRemainingMs();
    timeoutId = clock.setTimeout(() => {
      try {
        armTimer(remaining());
      } catch (error) {
        // Idempotent when remaining() already refused; timer failures use the same owner.
        refuse(error);
      }
    }, ackRemainingMs === null ? remainingMs : Math.min(remainingMs, ackRemainingMs));
  };
  // The bound the open ACK wait ends on: the ACK bound when one is set and
  // earlier, else the lifetime's remainder.
  const ackWaitBoundMs = () => {
    const lifetimeMs = remaining();
    const ackRemainingMs = ackWaitRemainingMs();
    return ackRemainingMs === null ? lifetimeMs : Math.min(lifetimeMs, ackRemainingMs);
  };
  // Acknowledgement only moves forward: a frame that left is never unsent,
  // and a settled ACK wait (acknowledged, rejected, not requested) is final.
  const recordAcknowledgement = (state) => {
    if (!advancesAcknowledgement(acknowledgement, state)) return;
    const ackWaitWasOpen = isAckWaitOpen(acknowledgement);
    acknowledgement = state;
    // A delivery that carries another one (the query transport's inner hop)
    // reports its acknowledgement to the delivery it is carried for.
    options.onAcknowledgement?.(state);
    // The ACK settlement cancels the ACK expiry: only the lifetime remains.
    // (A carried delivery's first frame opens it again.) The timer moves to
    // whichever expiry is now the earlier; a frame leaving changes neither.
    if (ackWaitBudget === null || ackWaitWasOpen === isAckWaitOpen(state) ||
        refusal !== null || closed) return;
    try {
      armTimer(remaining());
    } catch (error) {
      refuse(error);
    }
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
      if (ackWaitSpent()) throw spent();
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
    ackWaitBoundMs,
    ackWaitRemainingMs,
    acknowledgement: () => acknowledgement,
    recordAcknowledgement,
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
