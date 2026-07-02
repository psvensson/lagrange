/**
 * Message Retry Handler - Implements exponential backoff retry logic.
 * Provides configurable retry with backoff, jitter, and alternative replica selection.
 * Requirements: 17.1, 17.2, 17.3, 17.4
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {CONFIG_KEY} from '../config/config-constants.js';
import {resolveRandomSource} from '../random/random-source.js';
import {LoggingService} from '../logging/logging-service.js';

const LOCAL_STR_MESSAGE_RETRY_HANDLER = 'message-retry-handler';
const LOCAL_STR_STARTING_RETRY_EXECUTION = 'Starting retry execution';
const LOCAL_STR_RETRYING_AFTER_DELAY = 'Retrying after delay';
const LOCAL_STR_SUCCESS = 'success';
const LOCAL_STR_DELIVERY_SUCCEEDED = 'Delivery succeeded';
const LOCAL_STR_DELIVERYSUCCESS = 'deliverySuccess';
const LOCAL_STR_DELIVERY_NOT_ACKNOWLEDGED = 'Delivery not acknowledged';
const LOCAL_STR_NOT_ACKNOWLEDGED = 'not_acknowledged';
const LOCAL_STR_ERROR = 'error';
const LOCAL_STR_DELIVERY_ATTEMPT_FAILED = 'Delivery attempt failed';
const LOCAL_STR_SWITCHING_TO_ALTERNATIVE_REPLICA = 'Switching to alternative replica';
const LOCAL_STR_MAX_RETRIES_EXCEEDED = 'Max retries exceeded';
const LOCAL_STR_MAXRETRIESEXCEEDED = 'maxRetriesExceeded';
const LOCAL_STR_FAILED_TO_GET_ALTERNATIVE_REPLICAS = 'Failed to get alternative replicas';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_ALTERNATIVE_REPLICA_PROVIDER_MUST_BE_A_F = 'Alternative replica provider must be a function';
const LOCAL_STR_RETRY_CONFIGURATION_UPDATED = 'Retry configuration updated';
const LOCAL_STR_MAXRETRIESEXCEEDEDERROR = 'MaxRetriesExceededError';

/**
 * Retry result status enumeration.
 */
const RetryStatus = {
  SUCCESS: 'success',
  FAILED: 'failed',
  MAX_RETRIES_EXCEEDED: 'max_retries_exceeded',
  TIMEOUT: 'timeout',
};

/**
 * Default retry configuration.
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2.0,
  jitterFactor: 0.1,
};

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
    super();

    this.handlerId = uuidv4();

    // Load configuration from ConfigurationManager or use provided options
    const config = ConfigurationManager.getInstance();
    this.maxRetries = options.maxRetries ??
      config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_ATTEMPTS) ??
      DEFAULT_RETRY_CONFIG.maxRetries;
    this.initialDelayMs = options.initialDelayMs ??
      config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_INITIAL_DELAY_MS) ??
      DEFAULT_RETRY_CONFIG.initialDelayMs;
    this.maxDelayMs = options.maxDelayMs ??
      config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_DELAY_MS) ??
      DEFAULT_RETRY_CONFIG.maxDelayMs;
    this.backoffMultiplier = options.backoffMultiplier ??
      config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_BACKOFF_MULTIPLIER) ??
      DEFAULT_RETRY_CONFIG.backoffMultiplier;
    this.jitterFactor = options.jitterFactor ??
      config.get(CONFIG_KEY.MESSAGE_GROUP_RETRY_JITTER_FACTOR) ??
      DEFAULT_RETRY_CONFIG.jitterFactor;
    // DT5 seam: backoff jitter draws from a RandomSource (default RealRandomSource
    // = Math.random, byte-identical) so a seed determines retry scheduling.
    this.randomSource = resolveRandomSource(options);

    // Function to get alternative replicas for a target
    this.getAlternativeReplicas = options.getAlternativeReplicas || null;

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(LOCAL_STR_MESSAGE_RETRY_HANDLER) : console;

    // Statistics
    this.stats = {
      totalAttempts: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      retriesPerformed: 0,
      alternativeReplicasUsed: 0,
    };
  }

  /**
   * Calculate delay for a given retry attempt using exponential backoff with jitter.
   * @param {number} attempt - Current attempt number (0-based).
   * @return {number} Delay in milliseconds.
   */
  calculateDelay(attempt) {
    if (attempt <= 0) {
      return 0;
    }

    // Calculate base delay with exponential backoff
    const baseDelay = Math.min(
      this.initialDelayMs * Math.pow(this.backoffMultiplier, attempt - 1),
      this.maxDelayMs,
    );

    // Add jitter to prevent thundering herd
    // Jitter is ±jitterFactor of the base delay
    const jitterRange = baseDelay * this.jitterFactor;
    const jitter = (this.randomSource.random() * 2 - 1) * jitterRange;

    return Math.max(0, Math.round(baseDelay + jitter));
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
    const {targetAddress, messageId, message} = options;
    const retryId = uuidv4();

    let currentTarget = targetAddress;
    let lastError = null;
    const attemptHistory = [];
    const triedTargets = new Set([targetAddress]);

    this.logger.debug(LOCAL_STR_STARTING_RETRY_EXECUTION, {
      retryId,
      messageId,
      targetAddress,
      maxRetries: this.maxRetries,
    });

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      this.stats.totalAttempts++;

      // Calculate and apply delay (skip for first attempt)
      if (attempt > 0) {
        const delay = this.calculateDelay(attempt);
        this.stats.retriesPerformed++;

        this.logger.debug(LOCAL_STR_RETRYING_AFTER_DELAY, {
          retryId,
          messageId,
          attempt,
          delay,
          currentTarget,
        });

        await this.sleep(delay);
      }

      const attemptRecord = {
        attempt,
        target: currentTarget,
        timestamp: Date.now(),
        delay: attempt > 0 ? this.calculateDelay(attempt) : 0,
      };

      try {
        // Attempt delivery
        const result = await deliveryFn(currentTarget, message);

        if (result && (result.acknowledged || result.success)) {
          attemptRecord.status = LOCAL_STR_SUCCESS;
          attemptHistory.push(attemptRecord);

          this.stats.successfulDeliveries++;

          this.logger.debug(LOCAL_STR_DELIVERY_SUCCEEDED, {
            retryId,
            messageId,
            attempt,
            target: currentTarget,
          });

          this.emit(LOCAL_STR_DELIVERYSUCCESS, {
            retryId,
            messageId,
            targetAddress: currentTarget,
            attempt,
            attemptHistory,
          });

          return {
            status: RetryStatus.SUCCESS,
            messageId,
            targetAddress: currentTarget,
            attempt,
            attemptHistory,
            result,
          };
        }

        // Delivery returned but not acknowledged
        lastError = new Error(result?.error || LOCAL_STR_DELIVERY_NOT_ACKNOWLEDGED);
        attemptRecord.status = LOCAL_STR_NOT_ACKNOWLEDGED;
        attemptRecord.error = lastError.message;
      } catch (error) {
        lastError = error;
        attemptRecord.status = LOCAL_STR_ERROR;
        attemptRecord.error = error.message;

        this.logger.debug(LOCAL_STR_DELIVERY_ATTEMPT_FAILED, {
          retryId,
          messageId,
          attempt,
          target: currentTarget,
          error: error.message,
        });
      }

      attemptHistory.push(attemptRecord);

      // Try alternative replica if available and not last attempt
      if (attempt < this.maxRetries && this.getAlternativeReplicas) {
        const alternative = await this.selectAlternativeReplica(
          targetAddress,
          triedTargets,
        );

        if (alternative) {
          currentTarget = alternative;
          triedTargets.add(alternative);
          this.stats.alternativeReplicasUsed++;

          this.logger.debug(LOCAL_STR_SWITCHING_TO_ALTERNATIVE_REPLICA, {
            retryId,
            messageId,
            attempt,
            newTarget: alternative,
          });
        }
      }
    }

    // Max retries exceeded
    this.stats.failedDeliveries++;

    const diagnostics = {
      retryId,
      messageId,
      originalTarget: targetAddress,
      lastTarget: currentTarget,
      totalAttempts: attemptHistory.length,
      triedTargets: Array.from(triedTargets),
      lastError: lastError?.message || 'Unknown error',
      attemptHistory,
    };

    this.logger.warn(LOCAL_STR_MAX_RETRIES_EXCEEDED, diagnostics);

    this.emit(LOCAL_STR_MAXRETRIESEXCEEDED, diagnostics);

    return {
      status: RetryStatus.MAX_RETRIES_EXCEEDED,
      messageId,
      targetAddress,
      error: `Failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`,
      diagnostics,
    };
  }

  /**
   * Select an alternative replica that hasn't been tried yet.
   * @param {string} originalTarget - Original target address.
   * @param {Set<string>} triedTargets - Set of already tried targets.
   * @return {Promise<string|null>} Alternative replica address or null.
   * @private
   */
  async selectAlternativeReplica(originalTarget, triedTargets) {
    if (!this.getAlternativeReplicas) {
      return null;
    }

    try {
      const alternatives = await this.getAlternativeReplicas(originalTarget);

      if (!alternatives || !Array.isArray(alternatives)) {
        return null;
      }

      // Find first alternative not yet tried
      for (const alt of alternatives) {
        if (!triedTargets.has(alt)) {
          return alt;
        }
      }

      return null;
    } catch (error) {
      this.logger.debug(LOCAL_STR_FAILED_TO_GET_ALTERNATIVE_REPLICAS, {
        originalTarget,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Set the function to get alternative replicas.
   * @param {Function} fn - Function that returns alternative replica addresses.
   */
  setAlternativeReplicaProvider(fn) {
    if (typeof fn !== LOCAL_STR_FUNCTION) {
      throw new Error(LOCAL_STR_ALTERNATIVE_REPLICA_PROVIDER_MUST_BE_A_F);
    }
    this.getAlternativeReplicas = fn;
  }

  /**
   * Get the current retry configuration.
   * @return {Object} Retry configuration.
   */
  getConfig() {
    return {
      maxRetries: this.maxRetries,
      initialDelayMs: this.initialDelayMs,
      maxDelayMs: this.maxDelayMs,
      backoffMultiplier: this.backoffMultiplier,
      jitterFactor: this.jitterFactor,
    };
  }

  /**
   * Update retry configuration.
   * @param {Object} config - New configuration values.
   */
  updateConfig(config) {
    if (config.maxRetries !== undefined) {
      this.maxRetries = config.maxRetries;
    }
    if (config.initialDelayMs !== undefined) {
      this.initialDelayMs = config.initialDelayMs;
    }
    if (config.maxDelayMs !== undefined) {
      this.maxDelayMs = config.maxDelayMs;
    }
    if (config.backoffMultiplier !== undefined) {
      this.backoffMultiplier = config.backoffMultiplier;
    }
    if (config.jitterFactor !== undefined) {
      this.jitterFactor = config.jitterFactor;
    }

    this.logger.debug(LOCAL_STR_RETRY_CONFIGURATION_UPDATED, this.getConfig());
  }

  /**
   * Get retry statistics.
   * @return {Object} Retry statistics.
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalAttempts > 0 ?
        this.stats.successfulDeliveries / this.stats.totalAttempts : 0,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this.stats = {
      totalAttempts: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      retriesPerformed: 0,
      alternativeReplicasUsed: 0,
    };
  }

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
    super(message);
    this.name = LOCAL_STR_MAXRETRIESEXCEEDEDERROR;
    this.diagnostics = diagnostics;
  }
}

export {
  MessageRetryHandler,
  MaxRetriesExceededError,
  RetryStatus,
  DEFAULT_RETRY_CONFIG,
};
