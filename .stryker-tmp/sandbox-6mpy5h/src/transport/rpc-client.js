/**
 * RPCClient - Request-response pattern over message groups.
 *
 * Provides an RPC abstraction that uses message groups as transport,
 * handling correlation IDs and timeouts internally.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { LoggingService } from '../logging/logging-service.js';
import { RPC_DEFAULT, RPC_ERROR_MSG, RPC_LOG_MSG, TRANSPORT_EVENT, TRANSPORT_NUM, TRANSPORT_SUBSYSTEM } from '../constants/transport.js';

/**
 * RPCClient provides request-response semantics over message groups.
 * Handles correlation IDs and timeouts internally.
 */
class RPCClient extends EventEmitter {
  /**
   * Create a new RPCClient.
   * @param {Object} options - Configuration options.
   * @param {Object} options.messageGroupService - Message group service for transport.
   * @param {number} [options.defaultTimeoutMs=30000] - Default timeout in milliseconds.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("159341")) {
      {}
    } else {
      stryCov_9fa48("159341");
      super();
      this.messageGroupService = stryMutAct_9fa48("159344") ? options.messageGroupService && null : stryMutAct_9fa48("159343") ? false : stryMutAct_9fa48("159342") ? true : (stryCov_9fa48("159342", "159343", "159344"), options.messageGroupService || null);
      this.defaultTimeoutMs = stryMutAct_9fa48("159347") ? options.defaultTimeoutMs && RPC_DEFAULT.TIMEOUT_MS : stryMutAct_9fa48("159346") ? false : stryMutAct_9fa48("159345") ? true : (stryCov_9fa48("159345", "159346", "159347"), options.defaultTimeoutMs || RPC_DEFAULT.TIMEOUT_MS);

      // Pending requests: correlationId -> {resolve, reject, timeout, sentAt}
      this.pendingRequests = new Map();

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(TRANSPORT_SUBSYSTEM.RPC) : console;

      // Statistics
      this.stats = stryMutAct_9fa48("159348") ? {} : (stryCov_9fa48("159348"), {
        requestsSent: TRANSPORT_NUM.ZERO,
        responsesReceived: TRANSPORT_NUM.ZERO,
        timeouts: TRANSPORT_NUM.ZERO,
        errors: TRANSPORT_NUM.ZERO
      });
    }
  }

  /**
   * Set the message group service for transport.
   * @param {Object} messageGroupService - Message group service instance.
   */
  setMessageGroupService(messageGroupService) {
    if (stryMutAct_9fa48("159349")) {
      {}
    } else {
      stryCov_9fa48("159349");
      this.messageGroupService = messageGroupService;
    }
  }

  /**
   * Make an RPC call to a target service.
   * @param {string} target - Target service address.
   * @param {Object} request - Request payload.
   * @param {Object} [options={}] - Options including timeout.
   * @param {number} [options.timeout] - Timeout in milliseconds.
   * @return {Promise<Object>} Response from target.
   */
  async call(target, request, options = {}) {
    if (stryMutAct_9fa48("159350")) {
      {}
    } else {
      stryCov_9fa48("159350");
      if (stryMutAct_9fa48("159353") ? false : stryMutAct_9fa48("159352") ? true : stryMutAct_9fa48("159351") ? this.messageGroupService : (stryCov_9fa48("159351", "159352", "159353"), !this.messageGroupService)) {
        if (stryMutAct_9fa48("159354")) {
          {}
        } else {
          stryCov_9fa48("159354");
          throw new Error(RPC_ERROR_MSG.NO_MESSAGE_GROUP);
        }
      }
      const correlationId = uuidv4();
      const timeoutMs = stryMutAct_9fa48("159357") ? options.timeout && this.defaultTimeoutMs : stryMutAct_9fa48("159356") ? false : stryMutAct_9fa48("159355") ? true : (stryCov_9fa48("159355", "159356", "159357"), options.timeout || this.defaultTimeoutMs);
      this.logger.debug(RPC_LOG_MSG.CALL_INITIATED, stryMutAct_9fa48("159358") ? {} : (stryCov_9fa48("159358"), {
        correlationId,
        target,
        timeoutMs
      }));
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("159359")) {
          {}
        } else {
          stryCov_9fa48("159359");
          // Set up timeout
          const timeoutHandle = setTimeout(() => {
            if (stryMutAct_9fa48("159360")) {
              {}
            } else {
              stryCov_9fa48("159360");
              const pending = this.pendingRequests.get(correlationId);
              if (stryMutAct_9fa48("159362") ? false : stryMutAct_9fa48("159361") ? true : (stryCov_9fa48("159361", "159362"), pending)) {
                if (stryMutAct_9fa48("159363")) {
                  {}
                } else {
                  stryCov_9fa48("159363");
                  this.pendingRequests.delete(correlationId);
                  stryMutAct_9fa48("159364") ? this.stats.timeouts-- : (stryCov_9fa48("159364"), this.stats.timeouts++);
                  this.logger.debug(RPC_LOG_MSG.TIMEOUT, stryMutAct_9fa48("159365") ? {} : (stryCov_9fa48("159365"), {
                    correlationId,
                    target,
                    timeoutMs
                  }));
                  this.emit(TRANSPORT_EVENT.TIMEOUT, stryMutAct_9fa48("159366") ? {} : (stryCov_9fa48("159366"), {
                    correlationId,
                    target,
                    timeoutMs
                  }));
                  reject(new Error(RPC_ERROR_MSG.timeout(timeoutMs)));
                }
              }
            }
          }, timeoutMs);

          // Track pending request
          this.pendingRequests.set(correlationId, stryMutAct_9fa48("159367") ? {} : (stryCov_9fa48("159367"), {
            resolve,
            reject,
            timeout: timeoutHandle,
            sentAt: Date.now(),
            target
          }));
          stryMutAct_9fa48("159368") ? this.stats.requestsSent-- : (stryCov_9fa48("159368"), this.stats.requestsSent++);

          // Send via message group
          this.messageGroupService.sendMessage(target, stryMutAct_9fa48("159369") ? {} : (stryCov_9fa48("159369"), {
            correlationId,
            ...request
          })).then(result => {
            if (stryMutAct_9fa48("159370")) {
              {}
            } else {
              stryCov_9fa48("159370");
              // Check if request was already handled (timeout or response)
              if (stryMutAct_9fa48("159373") ? false : stryMutAct_9fa48("159372") ? true : stryMutAct_9fa48("159371") ? this.pendingRequests.has(correlationId) : (stryCov_9fa48("159371", "159372", "159373"), !this.pendingRequests.has(correlationId))) {
                if (stryMutAct_9fa48("159374")) {
                  {}
                } else {
                  stryCov_9fa48("159374");
                  return;
                }
              }

              // If the message group returns a direct response, handle it
              // ACK structure is flat - correlationId is directly on result
              if (stryMutAct_9fa48("159377") ? result || result.correlationId === correlationId : stryMutAct_9fa48("159376") ? false : stryMutAct_9fa48("159375") ? true : (stryCov_9fa48("159375", "159376", "159377"), result && (stryMutAct_9fa48("159379") ? result.correlationId !== correlationId : stryMutAct_9fa48("159378") ? true : (stryCov_9fa48("159378", "159379"), result.correlationId === correlationId)))) {
                if (stryMutAct_9fa48("159380")) {
                  {}
                } else {
                  stryCov_9fa48("159380");
                  this.handleResponse(correlationId, result);
                }
              }
            }
          }).catch(error => {
            if (stryMutAct_9fa48("159381")) {
              {}
            } else {
              stryCov_9fa48("159381");
              // Check if request was already handled
              const pending = this.pendingRequests.get(correlationId);
              if (stryMutAct_9fa48("159383") ? false : stryMutAct_9fa48("159382") ? true : (stryCov_9fa48("159382", "159383"), pending)) {
                if (stryMutAct_9fa48("159384")) {
                  {}
                } else {
                  stryCov_9fa48("159384");
                  clearTimeout(pending.timeout);
                  this.pendingRequests.delete(correlationId);
                  stryMutAct_9fa48("159385") ? this.stats.errors-- : (stryCov_9fa48("159385"), this.stats.errors++);
                  this.logger.error(RPC_LOG_MSG.SEND_FAILED, stryMutAct_9fa48("159386") ? {} : (stryCov_9fa48("159386"), {
                    correlationId,
                    target,
                    error: error.message
                  }));
                  reject(error);
                }
              }
            }
          });
        }
      });
    }
  }

  /**
   * Handle response from target (called by message handler).
   * @param {string} correlationId - Correlation ID from the response.
   * @param {Object} response - Response payload.
   * @return {boolean} True if response was matched to a pending request.
   */
  handleResponse(correlationId, response) {
    if (stryMutAct_9fa48("159387")) {
      {}
    } else {
      stryCov_9fa48("159387");
      const pending = this.pendingRequests.get(correlationId);
      if (stryMutAct_9fa48("159390") ? false : stryMutAct_9fa48("159389") ? true : stryMutAct_9fa48("159388") ? pending : (stryCov_9fa48("159388", "159389", "159390"), !pending)) {
        if (stryMutAct_9fa48("159391")) {
          {}
        } else {
          stryCov_9fa48("159391");
          this.logger.debug(RPC_LOG_MSG.NO_PENDING, stryMutAct_9fa48("159392") ? {} : (stryCov_9fa48("159392"), {
            correlationId
          }));
          return stryMutAct_9fa48("159393") ? true : (stryCov_9fa48("159393"), false);
        }
      }
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(correlationId);
      stryMutAct_9fa48("159394") ? this.stats.responsesReceived-- : (stryCov_9fa48("159394"), this.stats.responsesReceived++);
      const latencyMs = stryMutAct_9fa48("159395") ? Date.now() + pending.sentAt : (stryCov_9fa48("159395"), Date.now() - pending.sentAt);
      this.logger.debug(RPC_LOG_MSG.RESPONSE_RECEIVED, stryMutAct_9fa48("159396") ? {} : (stryCov_9fa48("159396"), {
        correlationId,
        latencyMs
      }));
      this.emit(TRANSPORT_EVENT.RESPONSE, stryMutAct_9fa48("159397") ? {} : (stryCov_9fa48("159397"), {
        correlationId,
        latencyMs,
        response
      }));
      pending.resolve(response);
      return stryMutAct_9fa48("159398") ? false : (stryCov_9fa48("159398"), true);
    }
  }

  /**
   * Get the number of pending requests.
   * @return {number} Number of pending requests.
   */
  getPendingCount() {
    if (stryMutAct_9fa48("159399")) {
      {}
    } else {
      stryCov_9fa48("159399");
      return this.pendingRequests.size;
    }
  }

  /**
   * Check if there is a pending request for a correlation ID.
   * @param {string} correlationId - Correlation ID to check.
   * @return {boolean} True if there is a pending request.
   */
  hasPendingRequest(correlationId) {
    if (stryMutAct_9fa48("159400")) {
      {}
    } else {
      stryCov_9fa48("159400");
      return this.pendingRequests.has(correlationId);
    }
  }

  /**
   * Get statistics about RPC calls.
   * @return {Object} Statistics object.
   */
  getStats() {
    if (stryMutAct_9fa48("159401")) {
      {}
    } else {
      stryCov_9fa48("159401");
      return stryMutAct_9fa48("159402") ? {} : (stryCov_9fa48("159402"), {
        ...this.stats,
        pendingRequests: this.pendingRequests.size
      });
    }
  }

  /**
   * Cancel a pending request.
   * @param {string} correlationId - Correlation ID of request to cancel.
   * @param {string} [reason='Cancelled'] - Reason for cancellation.
   * @return {boolean} True if request was cancelled.
   */
  cancelRequest(correlationId, reason = RPC_DEFAULT.CANCEL_REASON) {
    if (stryMutAct_9fa48("159403")) {
      {}
    } else {
      stryCov_9fa48("159403");
      const pending = this.pendingRequests.get(correlationId);
      if (stryMutAct_9fa48("159406") ? false : stryMutAct_9fa48("159405") ? true : stryMutAct_9fa48("159404") ? pending : (stryCov_9fa48("159404", "159405", "159406"), !pending)) {
        if (stryMutAct_9fa48("159407")) {
          {}
        } else {
          stryCov_9fa48("159407");
          return stryMutAct_9fa48("159408") ? true : (stryCov_9fa48("159408"), false);
        }
      }
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(correlationId);
      this.logger.debug(RPC_LOG_MSG.REQUEST_CANCELLED, stryMutAct_9fa48("159409") ? {} : (stryCov_9fa48("159409"), {
        correlationId,
        reason
      }));
      pending.reject(new Error(RPC_ERROR_MSG.cancelled(reason)));
      return stryMutAct_9fa48("159410") ? false : (stryCov_9fa48("159410"), true);
    }
  }

  /**
   * Shutdown the RPC client, cancelling all pending requests.
   * @return {Promise<void>}
   */
  async shutdown() {
    if (stryMutAct_9fa48("159411")) {
      {}
    } else {
      stryCov_9fa48("159411");
      this.logger.debug(RPC_LOG_MSG.SHUTTING_DOWN, stryMutAct_9fa48("159412") ? {} : (stryCov_9fa48("159412"), {
        pendingRequests: this.pendingRequests.size
      }));

      // Cancel all pending requests
      for (const [_correlationId, pending] of this.pendingRequests) {
        if (stryMutAct_9fa48("159413")) {
          {}
        } else {
          stryCov_9fa48("159413");
          clearTimeout(pending.timeout);
          pending.reject(new Error(RPC_ERROR_MSG.SHUTDOWN));
        }
      }
      this.pendingRequests.clear();
      this.emit(TRANSPORT_EVENT.SHUTDOWN);
    }
  }
}
export { RPCClient };