/**
 * BaseError - Foundation class for custom errors.
 * Provides consistent error properties and behavior across the codebase.
 *
 * Features:
 * - Automatic name property set to constructor name
 * - Support for error chaining via cause parameter
 * - Support for context metadata for debugging
 * - JSON serialization for structured logging
 *
 * @module utils/base-error
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */

/**
 * @typedef {Object} ErrorContext
 * @property {string} [component] - Component where error occurred
 * @property {string} [operation] - Operation that failed
 * @property {string} [nodeId] - Node ID if applicable
 * @property {Object} [metadata] - Additional error metadata
 */

/**
 * @typedef {Object} BaseErrorOptions
 * @property {Error} [cause] - Underlying cause of the error
 * @property {ErrorContext} [context] - Additional context for debugging
 */

/**
 * BaseError - Foundation class for all custom errors in the codebase.
 * Extends native Error with consistent properties and behavior.
 *
 * @extends Error
 */
class BaseError extends Error {
  /**
   * Create a BaseError.
   * @param {string} message - Error message
   * @param {BaseErrorOptions} [options={}] - Error options
   */
  constructor(message, options = {}) {
    super(message, {cause: options.cause});

    /**
     * Error name - automatically set to constructor name.
     * @type {string}
     */
    this.name = this.constructor.name;

    /**
     * Additional context for debugging.
     * @type {ErrorContext|null}
     */
    this.context = options.context || null;

    // Capture stack trace, excluding constructor call
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for structured logging.
   * @return {Object} JSON representation of the error
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      cause: this.cause?.message || null,
      stack: this.stack,
    };
  }
}

export {BaseError};
