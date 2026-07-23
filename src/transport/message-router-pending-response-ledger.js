import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';


const {
  INLINE_ACK_PASSTHROUGH_KEYS,
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
    const effectiveNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
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
    return new Promise((resolve, reject) => {
      const pending = {
        abortListener: null,
        abortSignal: null,
        resolve,
        reject,
        timeoutId: null,
        targetNodeId,
        deliverySource: normalizeIdentifier(options?.deliverySource) || null,
        responseContext: normalizeIdentifier(options?.responseContext) || null,
      };
      const signal = options?.signal;
      if (
        signal &&
        typeof signal.addEventListener === TRANSPORT_TYPEOF.FUNCTION
      ) {
        pending.abortSignal = signal;
        pending.abortListener = () => {
          this.abortPendingResponse(messageId, signal.reason);
        };
      }
      this.pendingResponses.set(messageId, pending);
      if (signal?.aborted) {
        pending.abortListener();
      } else if (pending.abortListener) {
        signal.addEventListener(
          TRANSPORT_EVENT.ABORT,
          pending.abortListener,
          {once: true},
        );
      }
    });
  }

  /**
   * Reject and retire one waiter when its delivery owner is cancelled.
   * @param {string} messageId
   * @param {*} reason
   * @return {boolean} True when a waiter was aborted.
   * @private
   */
  abortPendingResponse(messageId, reason = null) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending) return false;
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    this.detachPendingResponseAbortSignal(pending);
    this.pendingResponses.delete(messageId);
    this.rememberRetiredPendingResponse(
      messageId,
      pending,
      RETIRED_PENDING_RESPONSE_REASON.CANCELLED,
    );
    pending.reject(
      reason instanceof Error ?
        reason :
        new Error(ROUTER_ERROR_MSG.SHUTDOWN),
    );
    return true;
  }
  /**
   * Arm timeout for a pending SERVICE_RESPONSE waiter.
   * Timeout is started after ACK to avoid premature rejection while still
   * waiting for sender-side ACK.
   * @param {string} messageId - Correlated message ID.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {boolean} True when timeout was armed.
   * @private
   */
  armPendingResponseTimeout(messageId, timeoutMs) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending || pending.timeoutId) {
      return false;
    }
    const timeoutId = setTimeout(() => {
      this.pendingResponses.delete(messageId);
      this.detachPendingResponseAbortSignal(pending);
      this.rememberRetiredPendingResponse(
        messageId,
        pending,
        RETIRED_PENDING_RESPONSE_REASON.TIMEOUT,
      );
      pending.reject(new Error(ROUTER_ERROR_MSG.PENDING_RESPONSE_TIMEOUT));
    }, timeoutMs);
    if (typeof timeoutId.unref === TRANSPORT_TYPEOF.FUNCTION) {
      timeoutId.unref();
    }
    pending.timeoutId = timeoutId;
    return true;
  }
  /**
   * Settle pending SERVICE_RESPONSE waiter.
   * @param {string} messageId - Correlated message ID.
   * @param {Object} payload - Service response payload.
   * @param {*} payload.result - Handler result.
   * @param {string} payload.error - Handler error.
   * @return {boolean} True when pending waiter was found.
   * @private
   */
  settlePendingResponse(messageId, {result, error}) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending) {
      return false;
    }
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    this.detachPendingResponseAbortSignal(pending);
    this.pendingResponses.delete(messageId);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
    return true;
  }
  /**
   * Remove pending SERVICE_RESPONSE waiter without settling it.
   * @param {string} messageId - Correlated message ID.
   * @return {boolean} True when a waiter was removed.
   * @private
   */
  cancelPendingResponse(messageId, options = {}) {
    const pending = this.pendingResponses.get(messageId);
    if (!pending) {
      return false;
    }
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    this.detachPendingResponseAbortSignal(pending);
    this.pendingResponses.delete(messageId);
    if (options?.ignoreLateResponse === true) {
      this.rememberRetiredPendingResponse(
        messageId,
        pending,
        options?.retiredReason || RETIRED_PENDING_RESPONSE_REASON.CANCELLED,
      );
    }
    return true;
  }
  /**
   * Fail pending SERVICE_RESPONSE waiters for a target node.
   * @param {string} nodeId - Target node ID.
   * @param {Error} error - Failure reason.
   * @private
   */
  failPendingResponsesForNode(nodeId, error) {
    for (const [messageId, pending] of this.pendingResponses) {
      if (pending.targetNodeId === nodeId) {
        if (pending.timeoutId) {
          clearTimeout(pending.timeoutId);
        }
        this.detachPendingResponseAbortSignal(pending);
        this.pendingResponses.delete(messageId);
        this.rememberRetiredPendingResponse(
          messageId,
          pending,
          RETIRED_PENDING_RESPONSE_REASON.NODE_FAILURE,
        );
        pending.reject(error);
      }
    }
  }
  /**
   * Check whether an ACK includes legacy inline handler payload.
   * @param {Object} ackResult - ACK result.
   * @return {boolean} True when ACK carries handler payload.
   * @private
   */
  hasInlineAckPayload(ackResult) {
    if (
      !ackResult ||
      typeof ackResult !== TRANSPORT_TYPEOF.OBJECT ||
      ackResult.acknowledged !== true
    ) {
      return false;
    }
    return Object.keys(ackResult).some(
      (key) => !INLINE_ACK_PASSTHROUGH_KEYS.has(key),
    );
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
    const {acknowledged: _ack, type: handlerType, ...rest} = result;
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
   * Handle acknowledgment message.
   * Passes through flat ACK structure without additional nesting.
   * @param {Object} message - Acknowledgment message.
   * @private
   */
  handleAcknowledgment(message) {
    const {messageId, acknowledged, error, type: _type, ...rest} = message;
    const pending = this.pendingMessages.get(messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingMessages.delete(messageId);
      if (acknowledged) {
        const connection = this.nodeConnections.get(pending.targetNodeId);
        if (
          connection &&
          connection.isIncoming !== true &&
          connection.isSelfConnection !== true
        ) {
          connection.ackTimeoutStreak = TRANSPORT_NUM.ZERO;
          connection.lastAckAt = Date.now();
          connection.lastAckTimeoutAt = null;
        }
        const resolved = {
          messageId,
          acknowledged: true,
          ...rest,
        };
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
