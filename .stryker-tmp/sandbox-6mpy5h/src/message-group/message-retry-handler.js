/**
 * Message Retry Handler - Implements exponential backoff retry logic.
 * Provides configurable retry with backoff, jitter, and alternative replica selection.
 * Requirements: 17.1, 17.2, 17.3, 17.4
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
import { ConfigurationManager } from '../config/configuration-manager.js';
import { CONFIG_KEY } from '../config/config-constants.js';
import { LoggingService } from '../logging/logging-service.js';

/**
 * Retry result status enumeration.
 */
const RetryStatus = stryMutAct_9fa48("89627") ? {} : (stryCov_9fa48("89627"), {
  SUCCESS: stryMutAct_9fa48("89628") ? "" : (stryCov_9fa48("89628"), 'success'),
  FAILED: stryMutAct_9fa48("89629") ? "" : (stryCov_9fa48("89629"), 'failed'),
  MAX_RETRIES_EXCEEDED: stryMutAct_9fa48("89630") ? "" : (stryCov_9fa48("89630"), 'max_retries_exceeded'),
  TIMEOUT: stryMutAct_9fa48("89631") ? "" : (stryCov_9fa48("89631"), 'timeout')
});

/**
 * Default retry configuration.
 */
const DEFAULT_RETRY_CONFIG = stryMutAct_9fa48("89632") ? {} : (stryCov_9fa48("89632"), {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2.0,
  jitterFactor: 0.1
});

/**
 * MessageRetryHandler provides exponential backoff retry logic
 * for message delivery with support for alternative replica selection.
 */
class MessageRetryHandler extends EventEmitter {
  /**
   * Create a new MessageRetryHandler.
   * @param {Object} options - Configuration options.
   * @param {number} options.maxRetries - Maximum retry attempts (default 3).
   * @param {number} options.initialDelayMs - Initial delay before first retry.
   * @param {number} options.maxDelayMs - Maximum delay between retries.
   * @param {number} options.backoffMultiplier - Exponential backoff multiplier.
   * @param {number} options.jitterFactor - Jitter factor (0.0-1.0).
   * @param {Function} options.getAlternativeReplicas - Function to get alternative replicas.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("89633")) {
      {}
    } else {
      stryCov_9fa48("89633");
      super();
      this.handlerId = uuidv4();

      // Load configuration from ConfigurationManager or use provided options
      const config = ConfigurationManager.getInstance();
      this.maxRetries = stryMutAct_9fa48("89634") ? (options.maxRetries ?? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_ATTEMPTS)) && DEFAULT_RETRY_CONFIG.maxRetries : (stryCov_9fa48("89634"), (stryMutAct_9fa48("89635") ? options.maxRetries && config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_ATTEMPTS) : (stryCov_9fa48("89635"), options.maxRetries ?? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_ATTEMPTS))) ?? DEFAULT_RETRY_CONFIG.maxRetries);
      this.initialDelayMs = stryMutAct_9fa48("89636") ? (options.initialDelayMs ?? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_INITIAL_DELAY_MS)) && DEFAULT_RETRY_CONFIG.initialDelayMs : (stryCov_9fa48("89636"), (stryMutAct_9fa48("89637") ? options.initialDelayMs && config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_INITIAL_DELAY_MS) : (stryCov_9fa48("89637"), options.initialDelayMs ?? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_INITIAL_DELAY_MS))) ?? DEFAULT_RETRY_CONFIG.initialDelayMs);
      this.maxDelayMs = stryMutAct_9fa48("89638") ? (options.maxDelayMs ?? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_DELAY_MS)) && DEFAULT_RETRY_CONFIG.maxDelayMs : (stryCov_9fa48("89638"), (stryMutAct_9fa48("89639") ? options.maxDelayMs && config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_DELAY_MS) : (stryCov_9fa48("89639"), options.maxDelayMs ?? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_DELAY_MS))) ?? DEFAULT_RETRY_CONFIG.maxDelayMs);
      this.backoffMultiplier = stryMutAct_9fa48("89640") ? (options.backoffMultiplier ?? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_BACKOFF_MULTIPLIER)) && DEFAULT_RETRY_CONFIG.backoffMultiplier : (stryCov_9fa48("89640"), (stryMutAct_9fa48("89641") ? options.backoffMultiplier && config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_BACKOFF_MULTIPLIER) : (stryCov_9fa48("89641"), options.backoffMultiplier ?? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_BACKOFF_MULTIPLIER))) ?? DEFAULT_RETRY_CONFIG.backoffMultiplier);
      this.jitterFactor = stryMutAct_9fa48("89642") ? (options.jitterFactor ?? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_JITTER_FACTOR)) && DEFAULT_RETRY_CONFIG.jitterFactor : (stryCov_9fa48("89642"), (stryMutAct_9fa48("89643") ? options.jitterFactor && config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_JITTER_FACTOR) : (stryCov_9fa48("89643"), options.jitterFactor ?? config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_JITTER_FACTOR))) ?? DEFAULT_RETRY_CONFIG.jitterFactor);

      // Function to get alternative replicas for a target
      this.getAlternativeReplicas = stryMutAct_9fa48("89646") ? options.getAlternativeReplicas && null : stryMutAct_9fa48("89645") ? false : stryMutAct_9fa48("89644") ? true : (stryCov_9fa48("89644", "89645", "89646"), options.getAlternativeReplicas || null);

      // Logging
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(stryMutAct_9fa48("89647") ? "" : (stryCov_9fa48("89647"), 'message-retry-handler')) : console;

      // Statistics
      this.stats = stryMutAct_9fa48("89648") ? {} : (stryCov_9fa48("89648"), {
        totalAttempts: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        retriesPerformed: 0,
        alternativeReplicasUsed: 0
      });
    }
  }

  /**
   * Calculate delay for a given retry attempt using exponential backoff with jitter.
   * @param {number} attempt - Current attempt number (0-based).
   * @return {number} Delay in milliseconds.
   */
  calculateDelay(attempt) {
    if (stryMutAct_9fa48("89649")) {
      {}
    } else {
      stryCov_9fa48("89649");
      if (stryMutAct_9fa48("89653") ? attempt > 0 : stryMutAct_9fa48("89652") ? attempt < 0 : stryMutAct_9fa48("89651") ? false : stryMutAct_9fa48("89650") ? true : (stryCov_9fa48("89650", "89651", "89652", "89653"), attempt <= 0)) {
        if (stryMutAct_9fa48("89654")) {
          {}
        } else {
          stryCov_9fa48("89654");
          return 0;
        }
      }

      // Calculate base delay with exponential backoff
      const baseDelay = stryMutAct_9fa48("89655") ? Math.max(this.initialDelayMs * Math.pow(this.backoffMultiplier, attempt - 1), this.maxDelayMs) : (stryCov_9fa48("89655"), Math.min(stryMutAct_9fa48("89656") ? this.initialDelayMs / Math.pow(this.backoffMultiplier, attempt - 1) : (stryCov_9fa48("89656"), this.initialDelayMs * Math.pow(this.backoffMultiplier, stryMutAct_9fa48("89657") ? attempt + 1 : (stryCov_9fa48("89657"), attempt - 1))), this.maxDelayMs));

      // Add jitter to prevent thundering herd
      // Jitter is ±jitterFactor of the base delay
      const jitterRange = stryMutAct_9fa48("89658") ? baseDelay / this.jitterFactor : (stryCov_9fa48("89658"), baseDelay * this.jitterFactor);
      const jitter = stryMutAct_9fa48("89659") ? (Math.random() * 2 - 1) / jitterRange : (stryCov_9fa48("89659"), (stryMutAct_9fa48("89660") ? Math.random() * 2 + 1 : (stryCov_9fa48("89660"), (stryMutAct_9fa48("89661") ? Math.random() / 2 : (stryCov_9fa48("89661"), Math.random() * 2)) - 1)) * jitterRange);
      return stryMutAct_9fa48("89662") ? Math.min(0, Math.round(baseDelay + jitter)) : (stryCov_9fa48("89662"), Math.max(0, Math.round(stryMutAct_9fa48("89663") ? baseDelay - jitter : (stryCov_9fa48("89663"), baseDelay + jitter))));
    }
  }

  /**
   * Execute a delivery function with exponential backoff retry.
   * @param {Function} deliveryFn - Async function that attempts delivery.
   * @param {Object} options - Retry options.
   * @param {string} options.targetAddress - Target service address.
   * @param {string} options.messageId - Message ID for tracking.
   * @param {Object} options.message - Message payload.
   * @return {Promise<Object>} Retry result with status and diagnostics.
   */
  async executeWithRetry(deliveryFn, options = {}) {
    if (stryMutAct_9fa48("89664")) {
      {}
    } else {
      stryCov_9fa48("89664");
      const {
        targetAddress,
        messageId,
        message
      } = options;
      const retryId = uuidv4();
      let currentTarget = targetAddress;
      let lastError = null;
      const attemptHistory = stryMutAct_9fa48("89665") ? ["Stryker was here"] : (stryCov_9fa48("89665"), []);
      const triedTargets = new Set(stryMutAct_9fa48("89666") ? [] : (stryCov_9fa48("89666"), [targetAddress]));
      this.logger.debug(stryMutAct_9fa48("89667") ? "" : (stryCov_9fa48("89667"), 'Starting retry execution'), stryMutAct_9fa48("89668") ? {} : (stryCov_9fa48("89668"), {
        retryId,
        messageId,
        targetAddress,
        maxRetries: this.maxRetries
      }));
      for (let attempt = 0; stryMutAct_9fa48("89671") ? attempt > this.maxRetries : stryMutAct_9fa48("89670") ? attempt < this.maxRetries : stryMutAct_9fa48("89669") ? false : (stryCov_9fa48("89669", "89670", "89671"), attempt <= this.maxRetries); stryMutAct_9fa48("89672") ? attempt-- : (stryCov_9fa48("89672"), attempt++)) {
        if (stryMutAct_9fa48("89673")) {
          {}
        } else {
          stryCov_9fa48("89673");
          stryMutAct_9fa48("89674") ? this.stats.totalAttempts-- : (stryCov_9fa48("89674"), this.stats.totalAttempts++);

          // Calculate and apply delay (skip for first attempt)
          if (stryMutAct_9fa48("89678") ? attempt <= 0 : stryMutAct_9fa48("89677") ? attempt >= 0 : stryMutAct_9fa48("89676") ? false : stryMutAct_9fa48("89675") ? true : (stryCov_9fa48("89675", "89676", "89677", "89678"), attempt > 0)) {
            if (stryMutAct_9fa48("89679")) {
              {}
            } else {
              stryCov_9fa48("89679");
              const delay = this.calculateDelay(attempt);
              stryMutAct_9fa48("89680") ? this.stats.retriesPerformed-- : (stryCov_9fa48("89680"), this.stats.retriesPerformed++);
              this.logger.debug(stryMutAct_9fa48("89681") ? "" : (stryCov_9fa48("89681"), 'Retrying after delay'), stryMutAct_9fa48("89682") ? {} : (stryCov_9fa48("89682"), {
                retryId,
                messageId,
                attempt,
                delay,
                currentTarget
              }));
              await this.sleep(delay);
            }
          }
          const attemptRecord = stryMutAct_9fa48("89683") ? {} : (stryCov_9fa48("89683"), {
            attempt,
            target: currentTarget,
            timestamp: Date.now(),
            delay: (stryMutAct_9fa48("89687") ? attempt <= 0 : stryMutAct_9fa48("89686") ? attempt >= 0 : stryMutAct_9fa48("89685") ? false : stryMutAct_9fa48("89684") ? true : (stryCov_9fa48("89684", "89685", "89686", "89687"), attempt > 0)) ? this.calculateDelay(attempt) : 0
          });
          try {
            if (stryMutAct_9fa48("89688")) {
              {}
            } else {
              stryCov_9fa48("89688");
              // Attempt delivery
              const result = await deliveryFn(currentTarget, message);
              if (stryMutAct_9fa48("89691") ? result || result.acknowledged || result.success : stryMutAct_9fa48("89690") ? false : stryMutAct_9fa48("89689") ? true : (stryCov_9fa48("89689", "89690", "89691"), result && (stryMutAct_9fa48("89693") ? result.acknowledged && result.success : stryMutAct_9fa48("89692") ? true : (stryCov_9fa48("89692", "89693"), result.acknowledged || result.success)))) {
                if (stryMutAct_9fa48("89694")) {
                  {}
                } else {
                  stryCov_9fa48("89694");
                  attemptRecord.status = stryMutAct_9fa48("89695") ? "" : (stryCov_9fa48("89695"), 'success');
                  attemptHistory.push(attemptRecord);
                  stryMutAct_9fa48("89696") ? this.stats.successfulDeliveries-- : (stryCov_9fa48("89696"), this.stats.successfulDeliveries++);
                  this.logger.debug(stryMutAct_9fa48("89697") ? "" : (stryCov_9fa48("89697"), 'Delivery succeeded'), stryMutAct_9fa48("89698") ? {} : (stryCov_9fa48("89698"), {
                    retryId,
                    messageId,
                    attempt,
                    target: currentTarget
                  }));
                  this.emit(stryMutAct_9fa48("89699") ? "" : (stryCov_9fa48("89699"), 'deliverySuccess'), stryMutAct_9fa48("89700") ? {} : (stryCov_9fa48("89700"), {
                    retryId,
                    messageId,
                    targetAddress: currentTarget,
                    attempt,
                    attemptHistory
                  }));
                  return stryMutAct_9fa48("89701") ? {} : (stryCov_9fa48("89701"), {
                    status: RetryStatus.SUCCESS,
                    messageId,
                    targetAddress: currentTarget,
                    attempt,
                    attemptHistory,
                    result
                  });
                }
              }

              // Delivery returned but not acknowledged
              lastError = new Error(stryMutAct_9fa48("89704") ? result?.error && 'Delivery not acknowledged' : stryMutAct_9fa48("89703") ? false : stryMutAct_9fa48("89702") ? true : (stryCov_9fa48("89702", "89703", "89704"), (stryMutAct_9fa48("89705") ? result.error : (stryCov_9fa48("89705"), result?.error)) || (stryMutAct_9fa48("89706") ? "" : (stryCov_9fa48("89706"), 'Delivery not acknowledged'))));
              attemptRecord.status = stryMutAct_9fa48("89707") ? "" : (stryCov_9fa48("89707"), 'not_acknowledged');
              attemptRecord.error = lastError.message;
            }
          } catch (error) {
            if (stryMutAct_9fa48("89708")) {
              {}
            } else {
              stryCov_9fa48("89708");
              lastError = error;
              attemptRecord.status = stryMutAct_9fa48("89709") ? "" : (stryCov_9fa48("89709"), 'error');
              attemptRecord.error = error.message;
              this.logger.debug(stryMutAct_9fa48("89710") ? "" : (stryCov_9fa48("89710"), 'Delivery attempt failed'), stryMutAct_9fa48("89711") ? {} : (stryCov_9fa48("89711"), {
                retryId,
                messageId,
                attempt,
                target: currentTarget,
                error: error.message
              }));
            }
          }
          attemptHistory.push(attemptRecord);

          // Try alternative replica if available and not last attempt
          if (stryMutAct_9fa48("89714") ? attempt < this.maxRetries || this.getAlternativeReplicas : stryMutAct_9fa48("89713") ? false : stryMutAct_9fa48("89712") ? true : (stryCov_9fa48("89712", "89713", "89714"), (stryMutAct_9fa48("89717") ? attempt >= this.maxRetries : stryMutAct_9fa48("89716") ? attempt <= this.maxRetries : stryMutAct_9fa48("89715") ? true : (stryCov_9fa48("89715", "89716", "89717"), attempt < this.maxRetries)) && this.getAlternativeReplicas)) {
            if (stryMutAct_9fa48("89718")) {
              {}
            } else {
              stryCov_9fa48("89718");
              const alternative = await this.selectAlternativeReplica(targetAddress, triedTargets);
              if (stryMutAct_9fa48("89720") ? false : stryMutAct_9fa48("89719") ? true : (stryCov_9fa48("89719", "89720"), alternative)) {
                if (stryMutAct_9fa48("89721")) {
                  {}
                } else {
                  stryCov_9fa48("89721");
                  currentTarget = alternative;
                  triedTargets.add(alternative);
                  stryMutAct_9fa48("89722") ? this.stats.alternativeReplicasUsed-- : (stryCov_9fa48("89722"), this.stats.alternativeReplicasUsed++);
                  this.logger.debug(stryMutAct_9fa48("89723") ? "" : (stryCov_9fa48("89723"), 'Switching to alternative replica'), stryMutAct_9fa48("89724") ? {} : (stryCov_9fa48("89724"), {
                    retryId,
                    messageId,
                    attempt,
                    newTarget: alternative
                  }));
                }
              }
            }
          }
        }
      }

      // Max retries exceeded
      stryMutAct_9fa48("89725") ? this.stats.failedDeliveries-- : (stryCov_9fa48("89725"), this.stats.failedDeliveries++);
      const diagnostics = stryMutAct_9fa48("89726") ? {} : (stryCov_9fa48("89726"), {
        retryId,
        messageId,
        originalTarget: targetAddress,
        lastTarget: currentTarget,
        totalAttempts: attemptHistory.length,
        triedTargets: Array.from(triedTargets),
        lastError: stryMutAct_9fa48("89729") ? lastError?.message && 'Unknown error' : stryMutAct_9fa48("89728") ? false : stryMutAct_9fa48("89727") ? true : (stryCov_9fa48("89727", "89728", "89729"), (stryMutAct_9fa48("89730") ? lastError.message : (stryCov_9fa48("89730"), lastError?.message)) || (stryMutAct_9fa48("89731") ? "" : (stryCov_9fa48("89731"), 'Unknown error'))),
        attemptHistory
      });
      this.logger.warn(stryMutAct_9fa48("89732") ? "" : (stryCov_9fa48("89732"), 'Max retries exceeded'), diagnostics);
      this.emit(stryMutAct_9fa48("89733") ? "" : (stryCov_9fa48("89733"), 'maxRetriesExceeded'), diagnostics);
      return stryMutAct_9fa48("89734") ? {} : (stryCov_9fa48("89734"), {
        status: RetryStatus.MAX_RETRIES_EXCEEDED,
        messageId,
        targetAddress,
        error: stryMutAct_9fa48("89735") ? `` : (stryCov_9fa48("89735"), `Failed after ${stryMutAct_9fa48("89736") ? this.maxRetries - 1 : (stryCov_9fa48("89736"), this.maxRetries + 1)} attempts: ${stryMutAct_9fa48("89737") ? lastError.message : (stryCov_9fa48("89737"), lastError?.message)}`),
        diagnostics
      });
    }
  }

  /**
   * Select an alternative replica that hasn't been tried yet.
   * @param {string} originalTarget - Original target address.
   * @param {Set<string>} triedTargets - Set of already tried targets.
   * @return {Promise<string|null>} Alternative replica address or null.
   * @private
   */
  async selectAlternativeReplica(originalTarget, triedTargets) {
    if (stryMutAct_9fa48("89738")) {
      {}
    } else {
      stryCov_9fa48("89738");
      if (stryMutAct_9fa48("89741") ? false : stryMutAct_9fa48("89740") ? true : stryMutAct_9fa48("89739") ? this.getAlternativeReplicas : (stryCov_9fa48("89739", "89740", "89741"), !this.getAlternativeReplicas)) {
        if (stryMutAct_9fa48("89742")) {
          {}
        } else {
          stryCov_9fa48("89742");
          return null;
        }
      }
      try {
        if (stryMutAct_9fa48("89743")) {
          {}
        } else {
          stryCov_9fa48("89743");
          const alternatives = await this.getAlternativeReplicas(originalTarget);
          if (stryMutAct_9fa48("89746") ? !alternatives && !Array.isArray(alternatives) : stryMutAct_9fa48("89745") ? false : stryMutAct_9fa48("89744") ? true : (stryCov_9fa48("89744", "89745", "89746"), (stryMutAct_9fa48("89747") ? alternatives : (stryCov_9fa48("89747"), !alternatives)) || (stryMutAct_9fa48("89748") ? Array.isArray(alternatives) : (stryCov_9fa48("89748"), !Array.isArray(alternatives))))) {
            if (stryMutAct_9fa48("89749")) {
              {}
            } else {
              stryCov_9fa48("89749");
              return null;
            }
          }

          // Find first alternative not yet tried
          for (const alt of alternatives) {
            if (stryMutAct_9fa48("89750")) {
              {}
            } else {
              stryCov_9fa48("89750");
              if (stryMutAct_9fa48("89753") ? false : stryMutAct_9fa48("89752") ? true : stryMutAct_9fa48("89751") ? triedTargets.has(alt) : (stryCov_9fa48("89751", "89752", "89753"), !triedTargets.has(alt))) {
                if (stryMutAct_9fa48("89754")) {
                  {}
                } else {
                  stryCov_9fa48("89754");
                  return alt;
                }
              }
            }
          }
          return null;
        }
      } catch (error) {
        if (stryMutAct_9fa48("89755")) {
          {}
        } else {
          stryCov_9fa48("89755");
          this.logger.debug(stryMutAct_9fa48("89756") ? "" : (stryCov_9fa48("89756"), 'Failed to get alternative replicas'), stryMutAct_9fa48("89757") ? {} : (stryCov_9fa48("89757"), {
            originalTarget,
            error: error.message
          }));
          return null;
        }
      }
    }
  }

  /**
   * Set the function to get alternative replicas.
   * @param {Function} fn - Function that returns alternative replica addresses.
   */
  setAlternativeReplicaProvider(fn) {
    if (stryMutAct_9fa48("89758")) {
      {}
    } else {
      stryCov_9fa48("89758");
      if (stryMutAct_9fa48("89761") ? typeof fn === 'function' : stryMutAct_9fa48("89760") ? false : stryMutAct_9fa48("89759") ? true : (stryCov_9fa48("89759", "89760", "89761"), typeof fn !== (stryMutAct_9fa48("89762") ? "" : (stryCov_9fa48("89762"), 'function')))) {
        if (stryMutAct_9fa48("89763")) {
          {}
        } else {
          stryCov_9fa48("89763");
          throw new Error(stryMutAct_9fa48("89764") ? "" : (stryCov_9fa48("89764"), 'Alternative replica provider must be a function'));
        }
      }
      this.getAlternativeReplicas = fn;
    }
  }

  /**
   * Get the current retry configuration.
   * @return {Object} Retry configuration.
   */
  getConfig() {
    if (stryMutAct_9fa48("89765")) {
      {}
    } else {
      stryCov_9fa48("89765");
      return stryMutAct_9fa48("89766") ? {} : (stryCov_9fa48("89766"), {
        maxRetries: this.maxRetries,
        initialDelayMs: this.initialDelayMs,
        maxDelayMs: this.maxDelayMs,
        backoffMultiplier: this.backoffMultiplier,
        jitterFactor: this.jitterFactor
      });
    }
  }

  /**
   * Update retry configuration.
   * @param {Object} config - New configuration values.
   */
  updateConfig(config) {
    if (stryMutAct_9fa48("89767")) {
      {}
    } else {
      stryCov_9fa48("89767");
      if (stryMutAct_9fa48("89770") ? config.maxRetries === undefined : stryMutAct_9fa48("89769") ? false : stryMutAct_9fa48("89768") ? true : (stryCov_9fa48("89768", "89769", "89770"), config.maxRetries !== undefined)) {
        if (stryMutAct_9fa48("89771")) {
          {}
        } else {
          stryCov_9fa48("89771");
          this.maxRetries = config.maxRetries;
        }
      }
      if (stryMutAct_9fa48("89774") ? config.initialDelayMs === undefined : stryMutAct_9fa48("89773") ? false : stryMutAct_9fa48("89772") ? true : (stryCov_9fa48("89772", "89773", "89774"), config.initialDelayMs !== undefined)) {
        if (stryMutAct_9fa48("89775")) {
          {}
        } else {
          stryCov_9fa48("89775");
          this.initialDelayMs = config.initialDelayMs;
        }
      }
      if (stryMutAct_9fa48("89778") ? config.maxDelayMs === undefined : stryMutAct_9fa48("89777") ? false : stryMutAct_9fa48("89776") ? true : (stryCov_9fa48("89776", "89777", "89778"), config.maxDelayMs !== undefined)) {
        if (stryMutAct_9fa48("89779")) {
          {}
        } else {
          stryCov_9fa48("89779");
          this.maxDelayMs = config.maxDelayMs;
        }
      }
      if (stryMutAct_9fa48("89782") ? config.backoffMultiplier === undefined : stryMutAct_9fa48("89781") ? false : stryMutAct_9fa48("89780") ? true : (stryCov_9fa48("89780", "89781", "89782"), config.backoffMultiplier !== undefined)) {
        if (stryMutAct_9fa48("89783")) {
          {}
        } else {
          stryCov_9fa48("89783");
          this.backoffMultiplier = config.backoffMultiplier;
        }
      }
      if (stryMutAct_9fa48("89786") ? config.jitterFactor === undefined : stryMutAct_9fa48("89785") ? false : stryMutAct_9fa48("89784") ? true : (stryCov_9fa48("89784", "89785", "89786"), config.jitterFactor !== undefined)) {
        if (stryMutAct_9fa48("89787")) {
          {}
        } else {
          stryCov_9fa48("89787");
          this.jitterFactor = config.jitterFactor;
        }
      }
      this.logger.debug(stryMutAct_9fa48("89788") ? "" : (stryCov_9fa48("89788"), 'Retry configuration updated'), this.getConfig());
    }
  }

  /**
   * Get retry statistics.
   * @return {Object} Retry statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("89789")) {
      {}
    } else {
      stryCov_9fa48("89789");
      return stryMutAct_9fa48("89790") ? {} : (stryCov_9fa48("89790"), {
        ...this.stats,
        successRate: (stryMutAct_9fa48("89794") ? this.stats.totalAttempts <= 0 : stryMutAct_9fa48("89793") ? this.stats.totalAttempts >= 0 : stryMutAct_9fa48("89792") ? false : stryMutAct_9fa48("89791") ? true : (stryCov_9fa48("89791", "89792", "89793", "89794"), this.stats.totalAttempts > 0)) ? stryMutAct_9fa48("89795") ? this.stats.successfulDeliveries * this.stats.totalAttempts : (stryCov_9fa48("89795"), this.stats.successfulDeliveries / this.stats.totalAttempts) : 0
      });
    }
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    if (stryMutAct_9fa48("89796")) {
      {}
    } else {
      stryCov_9fa48("89796");
      this.stats = stryMutAct_9fa48("89797") ? {} : (stryCov_9fa48("89797"), {
        totalAttempts: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        retriesPerformed: 0,
        alternativeReplicasUsed: 0
      });
    }
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    if (stryMutAct_9fa48("89798")) {
      {}
    } else {
      stryCov_9fa48("89798");
      return new Promise(stryMutAct_9fa48("89799") ? () => undefined : (stryCov_9fa48("89799"), resolve => setTimeout(resolve, ms)));
    }
  }
}

/**
 * MaxRetriesExceededError - Error thrown when max retries are exceeded.
 */
class MaxRetriesExceededError extends Error {
  /**
   * Create a new MaxRetriesExceededError.
   * @param {string} message - Error message.
   * @param {Object} diagnostics - Diagnostic information.
   */
  constructor(message, diagnostics = {}) {
    if (stryMutAct_9fa48("89800")) {
      {}
    } else {
      stryCov_9fa48("89800");
      super(message);
      this.name = stryMutAct_9fa48("89801") ? "" : (stryCov_9fa48("89801"), 'MaxRetriesExceededError');
      this.diagnostics = diagnostics;
    }
  }
}
export { MessageRetryHandler, MaxRetriesExceededError, RetryStatus, DEFAULT_RETRY_CONFIG };