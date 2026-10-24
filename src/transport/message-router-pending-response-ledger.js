import {createTimeoutBudget, getRemainingBudgetMs} from '../control-plane/timeout-budget.js';
import {assertDeliveryOpen, deliveryAbortReason} from './message-router-delivery-lifetime.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';
import {buildHandlerFailedError} from './transport-semantic-outcome.js';

const {
  MESSAGE_ROUTER_LITERAL,
  RETIRED_PENDING_RESPONSE_REASON,
  ROUTER_ERROR_MSG,
  ROUTER_LOG_MSG,
  SERVICE_RESPONSE_DISPOSITION_KIND,
  TRANSPORT_ERROR_MSG,
  TRANSPORT_EVENT,
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
  buildRetiredPendingClassification,
  buildServiceResponseDisposition,
  normalizeIdentifier,
} = MESSAGE_ROUTER_SHARED;

const PENDING_RESPONSE_WAIT = Object.freeze({
  wait: 'MESSAGE_TIMEOUT_MS (remaining SERVICE_RESPONSE grant after ACK)',
  awaited: 'SERVICE_RESPONSE from the target node for an acknowledged message',
});

/**
 * A SERVICE_RESPONSE waiter spent its remaining delivery bound: one wait_bound_spent
 * ERROR naming the target and what the waiter was answering.
 * @param {Object} router - The message router.
 * @param {string} messageId - The correlated message.
 * @param {Object} pending - The retired waiter.
 * @param {number} timeoutMs - The bound.
 * @return {void}
 */
function reportPendingResponseSpent(router, messageId, pending, timeoutMs) {
  reportWaitBoundSpent(router.logger, {
    ...PENDING_RESPONSE_WAIT,
    boundMs: timeoutMs,
    elapsedMs: pending.clock.now() - pending.armedAtMs,
    lastObserved: () => ({
      targetConnectionState:
        router.nodeConnections?.get?.(pending.targetNodeId)?.state ?? null,
      deliverySource: pending.deliverySource,
      responseContext: pending.responseContext,
      pendingResponses: router.pendingResponses.size,
    }),
    scope: {
      nodeId: router.nodeId ?? null,
      targetNodeId: pending.targetNodeId,
      messageId,
    },
  });
}

const DUPLICATE_PENDING_RESPONSE = 'router_duplicate_pending_response';

// A SERVICE_RESPONSE that carries no answer settles its waiter as the router
// fact it states: the target router had no handler (frame-level noHandler),
// or the target handler threw (frame-level error text, decision D1).
function unansweredServiceResponseError({error, noHandler}) {
  return noHandler === true ?
    Object.assign(new Error(error), {noHandler: true}) :
    buildHandlerFailedError(error);
}

function remainingResponseMs(pending) {
  if (pending.deliveryLifetime) {
    return assertDeliveryOpen({deliveryLifetime: pending.deliveryLifetime});
  }
  if (!pending.budget) return null;
  const remaining = getRemainingBudgetMs(pending.budget, {now: () => pending.clock.now()});
  if (remaining <= 0) throw new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT);
  return remaining;
}

function clearPendingResponse(router, messageId, pending) {
  if (pending.timeoutId !== null) pending.clock.clearTimeout(pending.timeoutId);
  pending.timeoutId = null;
  router.detachPendingResponseAbortSignal(pending);
  if (router.pendingResponses.get(messageId) === pending) router.pendingResponses.delete(messageId);
}

/**
 * Pending-response ledger for the message router: classify and warn about
 * unmatched SERVICE_RESPONSE frames, track the retired-waiter grace model,
 * register/arm/settle/cancel pending response waiters, and settle inbound ACKs.
 */
class MessageRouterPendingResponseLedger {
  /**
   * Remove the AbortSignal listener owned by one pending response.
   * @param {Object} pending
   * @return {void}
   * @private
   */
  detachPendingResponseAbortSignal(pending) {
    if (
      pending?.abortSignal &&
      pending?.abortListener
    ) {
      pending.abortSignal.removeEventListener(
        TRANSPORT_EVENT.ABORT,
        pending.abortListener,
      );
    }
    if (pending) {
      pending.abortSignal = null;
      pending.abortListener = null;
    }
  }

  /**
   * Rate-limit unmatched service-response warnings so response storms do not
   * bury the underlying transport/control-plane failure that caused them.
   * @param {Object} unmatchedResponseClassification
   * @return {void}
   * @private
   */
  logUnmatchedServiceResponse(unmatchedResponseClassification) {
    const messageId = unmatchedResponseClassification?.messageId || null;
    const nowMs = Number(this.nowFn());
    const warnIntervalMs = this.unmatchedServiceResponseWarnIntervalMs;
    const lastWarnAtMs = this.lastUnmatchedServiceResponseWarnAtMs;
    const shouldWarnNow =
      !Number.isFinite(lastWarnAtMs) ||
      warnIntervalMs <= TRANSPORT_NUM.ZERO ||
      !Number.isFinite(nowMs) ||
      nowMs - lastWarnAtMs >= warnIntervalMs;
    if (!shouldWarnNow) {
      this.unmatchedServiceResponseWarnSuppressedCount += TRANSPORT_NUM.ONE;
      this.logger.debug(ROUTER_LOG_MSG.SERVICE_RESPONSE_NO_PENDING, {
        messageId,
        suppressedByRateLimit: true,
        unmatchedClassification:
          unmatchedResponseClassification?.classification ||
          MESSAGE_ROUTER_LITERAL.STRING_ORPHANED,
      });
      return;
    }
    const suppressedSinceLastWarn =
      this.unmatchedServiceResponseWarnSuppressedCount;
    this.unmatchedServiceResponseWarnSuppressedCount = TRANSPORT_NUM.ZERO;
    this.lastUnmatchedServiceResponseWarnAtMs = Number.isFinite(nowMs) ?
      nowMs :
      null;
    const context = {
      messageId,
      unmatchedClassification:
        unmatchedResponseClassification?.classification || 'orphaned',
    };
    if (
      typeof unmatchedResponseClassification?.retiredReason ===
        TRANSPORT_TYPEOF.STRING &&
      unmatchedResponseClassification.retiredReason.length > TRANSPORT_NUM.ZERO
    ) {
      context.retiredReason = unmatchedResponseClassification.retiredReason;
    }
    if (
      typeof unmatchedResponseClassification?.deliverySource ===
        TRANSPORT_TYPEOF.STRING &&
      unmatchedResponseClassification.deliverySource.length > TRANSPORT_NUM.ZERO
    ) {
      context.deliverySource = unmatchedResponseClassification.deliverySource;
    }
    if (
      typeof unmatchedResponseClassification?.targetNodeId ===
        TRANSPORT_TYPEOF.STRING &&
      unmatchedResponseClassification.targetNodeId.length > TRANSPORT_NUM.ZERO
    ) {
      context.targetNodeId = unmatchedResponseClassification.targetNodeId;
    }
    if (suppressedSinceLastWarn > TRANSPORT_NUM.ZERO) {
      context.suppressedSinceLastWarn = suppressedSinceLastWarn;
    }
    this.logger.warn(ROUTER_LOG_MSG.SERVICE_RESPONSE_NO_PENDING, context);
  }
  /**
   * @param {Object} disposition
   * @return {void}
   * @private
   */
  recordServiceResponseDisposition(disposition) {
    const classification =
      normalizeIdentifier(disposition?.classification) || 'orphaned';
    this.serviceResponseDispositionCounts.set(
      classification,
      (this.serviceResponseDispositionCounts.get(classification) ||
        TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE,
    );
  }
  /**
   * @return {Object}
   */
  getServiceResponseDispositionCounts() {
    return Object.freeze(
      Object.fromEntries(
        [...this.serviceResponseDispositionCounts.entries()].sort(
          (left, right) =>
            left[TRANSPORT_NUM.ZERO].localeCompare(right[TRANSPORT_NUM.ZERO]),
        ),
      ),
    );
  }
  /**
   * Settle one SERVICE_RESPONSE if possible, otherwise classify its late
   * disposition under the retired-waiter model.
   *
   * @param {string} messageId
   * @param {Object} payload
   * @return {Object}
   * @private
   */
  resolveServiceResponseDisposition(messageId, payload = {}) {
    const settled = this.settlePendingResponse(messageId, payload);
    if (settled) {
      return buildServiceResponseDisposition({
        messageId,
        kind: SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED,
        classification: SERVICE_RESPONSE_DISPOSITION_KIND.SETTLED,
      });
    }
    return this.classifyUnmatchedServiceResponse(messageId);
  }
  /**
   * Classify one SERVICE_RESPONSE that no longer has a live waiter.
   * @param {string} messageId
   * @return {Object}
   * @private
   */
  classifyUnmatchedServiceResponse(messageId) {
    const retiredPendingResponse =
      this.consumeRetiredPendingResponse(messageId);
    if (retiredPendingResponse) {
      return buildServiceResponseDisposition({
        messageId,
        kind: SERVICE_RESPONSE_DISPOSITION_KIND.ABSORBED,
        classification: buildRetiredPendingClassification(
          retiredPendingResponse.reason,
        ),
        absorbed: true,
        retiredReason:
          retiredPendingResponse.reason ||
          RETIRED_PENDING_RESPONSE_REASON.UNKNOWN,
        deliverySource: retiredPendingResponse.deliverySource || null,
        targetNodeId: retiredPendingResponse.targetNodeId || null,
        responseContext: retiredPendingResponse.responseContext || null,
      });
    }
    return buildServiceResponseDisposition({
      messageId,
      kind: SERVICE_RESPONSE_DISPOSITION_KIND.ORPHANED,
      classification: MESSAGE_ROUTER_LITERAL.STRING_ORPHANED,
    });
  }
  /**
   * Resolve the grace window for one retired SERVICE_RESPONSE waiter.
   * Mirrors retired-socket termination so one late response can still be
   * absorbed after timeout/defer/disconnect without persisting forever.
   * @return {number}
   * @private
   */
  getRetiredPendingResponseGraceMs() {
    return Math.max(this.reconnectIntervalMs, this.messageTimeoutMs);
  }
  /**
   * Prune expired retired SERVICE_RESPONSE waiters.
   * @param {number|null} [nowMs]
   * @return {void}
   * @private
   */
  pruneRetiredPendingResponses(nowMs = null) {
    const effectiveNowMs = Number.isFinite(nowMs) ?
      nowMs :
      Number(this.nowFn());
    for (const [messageId, entry] of this.retiredPendingResponses.entries()) {
      if (
        !entry ||
        !Number.isFinite(entry.expiresAtMs) ||
        !Number.isFinite(effectiveNowMs) ||
        entry.expiresAtMs <= effectiveNowMs
      ) {
        this.retiredPendingResponses.delete(messageId);
      }
    }
  }
  /**
   * Remember one response waiter that was intentionally retired before the
   * peer finished the round-trip.
   * @param {string} messageId
   * @return {void}
   * @private
   */
  rememberRetiredPendingResponse(
    messageId,
    pending = null,
    reason = RETIRED_PENDING_RESPONSE_REASON.UNKNOWN,
  ) {
    const normalizedMessageId = normalizeIdentifier(messageId);
    if (!normalizedMessageId) {
      return;
    }
    const nowMs = Number(this.nowFn());
    const effectiveNowMs =
      Number.isFinite(nowMs) ? nowMs : this.timeSource.now();
    this.pruneRetiredPendingResponses(effectiveNowMs);
    this.retiredPendingResponses.set(normalizedMessageId, {
      reason:
        typeof reason === TRANSPORT_TYPEOF.STRING &&
        reason.length > TRANSPORT_NUM.ZERO ?
          reason :
          RETIRED_PENDING_RESPONSE_REASON.UNKNOWN,
      deliverySource: normalizeIdentifier(pending?.deliverySource) || null,
      targetNodeId: normalizeIdentifier(pending?.targetNodeId) || null,
      responseContext: normalizeIdentifier(pending?.responseContext) || null,
      expiresAtMs: effectiveNowMs + this.getRetiredPendingResponseGraceMs(),
    });
  }
  /**
   * Consume one retired waiter marker when a late response finally arrives.
   * @param {string} messageId
   * @return {Object|null}
   * @private
   */
  consumeRetiredPendingResponse(messageId) {
    const normalizedMessageId = normalizeIdentifier(messageId);
    if (!normalizedMessageId) {
      return null;
    }
    const nowMs = Number(this.nowFn());
    this.pruneRetiredPendingResponses(nowMs);
    const retiredEntry = this.retiredPendingResponses.get(normalizedMessageId);
    if (!retiredEntry) {
      return null;
    }
    this.retiredPendingResponses.delete(normalizedMessageId);
    return retiredEntry;
  }
  /**
   * Register a pending SERVICE_RESPONSE waiter.
   * @param {string} messageId - Correlated message ID.
   * @param {string|null} targetNodeId - Target node ID.
   * @return {Promise<*>} Resolves with handler result.
   * @private
   */
  registerPendingResponse(messageId, targetNodeId = null, options = {}) {
    assertDeliveryOpen(options);
    if (this.pendingResponses.has(messageId)) {
      throw Object.assign(new Error(DUPLICATE_PENDING_RESPONSE), {
        code: DUPLICATE_PENDING_RESPONSE,
      });
    }
    const response = new Promise((resolve, reject) => {
      const pending = {
        abortListener: null,
        abortSignal: options.signal || null,
        timeoutId: null,
        clock: options.deliveryLifetime?.clock || this.timeSource,
        deliveryLifetime: options.deliveryLifetime || null,
        budget: null,
        targetNodeId,
        deliverySource: normalizeIdentifier(options.deliverySource) || null,
        responseContext: normalizeIdentifier(options.responseContext) || null,
      };
      let settled = false;
      const finish = (settle, value) => {
        if (settled) return false;
        settled = true;
        clearPendingResponse(this, messageId, pending);
        settle(value);
        return true;
      };
      pending.acceptResponse = ({result, error, noHandler}) => {
        try {
          remainingResponseMs(pending);
          return error || noHandler === true ?
            finish(reject, unansweredServiceResponseError({error, noHandler})) :
            finish(resolve, result);
        } catch (expired) {
          // A parent refusal can synchronously retire this exact entry. Only
          // the still-current waiter may install its own timeout marker.
          if (this.pendingResponses.get(messageId) === pending) {
            this.rememberRetiredPendingResponse(
              messageId, pending, RETIRED_PENDING_RESPONSE_REASON.TIMEOUT,
            );
            finish(reject, expired);
          }
          return false;
        }
      };
      pending.resolve = (value) => pending.acceptResponse({result: value});
      pending.reject = (error) => finish(reject, error);
      this.pendingResponses.set(messageId, pending);
      if (pending.abortSignal) {
        const signal = pending.abortSignal;
        pending.abortListener = () => this.abortPendingResponse(
          messageId, deliveryAbortReason(signal), pending,
        );
        if (signal.aborted) pending.abortListener();
        else signal.addEventListener(TRANSPORT_EVENT.ABORT, pending.abortListener, {once: true});
      }
    });
    // The owner can cancel before its caller starts awaiting SERVICE_RESPONSE.
    // Retain the rejected result, with a terminal handler from acquisition.
    response.catch(() => {});
    return response;
  }

  /** Reject only the waiter captured by the cancelling operation. */
  abortPendingResponse(messageId, reason = null, expectedPending = null) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending || (expectedPending && pending !== expectedPending)) return false;
    const ownTimeout = pending.deliveryLifetime?.ownsTimeout(reason) === true;
    this.rememberRetiredPendingResponse(
      messageId, pending, ownTimeout ? RETIRED_PENDING_RESPONSE_REASON.TIMEOUT :
        RETIRED_PENDING_RESPONSE_REASON.CANCELLED,
    );
    pending.reject(reason instanceof Error ? reason : new Error(ROUTER_ERROR_MSG.SHUTDOWN));
    if (ownTimeout && pending.armedAtMs !== undefined) {
      reportPendingResponseSpent(this, messageId, pending, pending.responseTimeoutMs);
    }
    return true;
  }

  /** ACK leaves only the original grant's remainder for SERVICE_RESPONSE. */
  armPendingResponseTimeout(messageId, timeoutMs, expectedPending = null) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending || (expectedPending && pending !== expectedPending) ||
        pending.timeoutId !== null) {
      return false;
    }
    const {clock} = pending;
    pending.armedAtMs = clock.now();
    pending.responseTimeoutMs = timeoutMs;
    if (!pending.deliveryLifetime) {
      pending.budget = createTimeoutBudget({configuredBudgetMs: timeoutMs, now: () => clock.now()});
    }
    const expire = (error) => {
      if (this.pendingResponses.get(messageId) !== pending) return;
      this.rememberRetiredPendingResponse(
        messageId, pending, RETIRED_PENDING_RESPONSE_REASON.TIMEOUT,
      );
      pending.reject(error);
      reportPendingResponseSpent(this, messageId, pending, timeoutMs);
    };
    const arm = () => {
      try {
        const remaining = remainingResponseMs(pending);
        pending.timeoutId = clock.setTimeout(() => {
          if (this.pendingResponses.get(messageId) !== pending) return;
          arm();
        }, remaining);
      } catch (error) {
        expire(error);
      }
    };
    arm();
    return this.pendingResponses.get(messageId) === pending;
  }

  /** Settle a response only while its original grant is still current. */
  settlePendingResponse(messageId, {result, error, noHandler}) {
    const pending = this.pendingResponses.get(messageId);
    return pending ? pending.acceptResponse({result, error, noHandler}) : false;
  }

  /** Close local response custody even when the caller will use the ACK. */
  cancelPendingResponse(messageId, options = {}) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending || (options.expectedPending && pending !== options.expectedPending)) return false;
    if (options.ignoreLateResponse === true) {
      this.rememberRetiredPendingResponse(messageId, pending,
        options.retiredReason || RETIRED_PENDING_RESPONSE_REASON.CANCELLED);
    }
    pending.reject(new Error(RETIRED_PENDING_RESPONSE_REASON.CANCELLED));
    return true;
  }

  failPendingResponsesForNode(nodeId, error) {
    for (const [messageId, pending] of this.pendingResponses) {
      if (pending.targetNodeId === nodeId) {
        this.rememberRetiredPendingResponse(
          messageId, pending, RETIRED_PENDING_RESPONSE_REASON.NODE_FAILURE,
        );
        pending.reject(error);
      }
    }
  }
  /**
   * Normalize SERVICE_RESPONSE payload to transport delivery shape.
   * @param {*} result - Handler result payload.
   * @return {Object} Normalized payload fields.
   * @private
   */
  normalizeServiceResponseResult(result) {
    if (!result || typeof result !== TRANSPORT_TYPEOF.OBJECT) {
      return {};
    }
    const {type: handlerType, ...rest} = result;
    if (
      handlerType &&
      !Object.prototype.hasOwnProperty.call(
        rest,
        MESSAGE_ROUTER_LITERAL.STRING_RESPONSETYPE,
      )
    ) {
      rest.responseType = handlerType;
    }
    return rest;
  }
  /**
   * Handle acknowledgment message. An ACK carries only messageId,
   * acknowledged and error; it never carries a handler answer.
   * @param {Object} message - Acknowledgment message.
   * @private
   */
  handleAcknowledgment(message) {
    const {messageId, acknowledged, error} = message;
    const pending = this.pendingMessages.get(messageId);
    if (pending) {
      try {
        pending.assertOpen?.();
      } catch (expired) {
        pending.reject(expired);
        return;
      }
      (pending.clock || this.timeSource).clearTimeout(pending.timeout);
      if (this.pendingMessages.get(messageId) === pending) this.pendingMessages.delete(messageId);
      if (acknowledged) {
        const connection = this.nodeConnections.get(pending.targetNodeId);
        if (
          connection &&
          connection.isIncoming !== true &&
          connection.isSelfConnection !== true
        ) {
          connection.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
          connection.lastAckAt = this.timeSource.now();
          connection.lastAckTimeoutAt = null;
        }
        const resolved = {messageId, acknowledged: true};
        if (error !== void 0) {
          resolved.error = error;
        }
        pending.resolve(resolved);
      } else {
        pending.reject(
          new Error(error || TRANSPORT_ERROR_MSG.MESSAGE_NOT_ACKNOWLEDGED),
        );
      }
    }
  }
}

function defineMessageRouterPendingResponseLedger(serviceClass) {
  Object.defineProperties(
    serviceClass.prototype,
    Object.fromEntries(
      Object.entries(
        Object.getOwnPropertyDescriptors(
          MessageRouterPendingResponseLedger.prototype,
        ),
      ).filter(([name]) => name !== 'constructor'),
    ),
  );
}

export {defineMessageRouterPendingResponseLedger};
