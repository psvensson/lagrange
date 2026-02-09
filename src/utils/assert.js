/**
 * Assert a critical dependency is available.
 * Throws to allow top-level handlers to terminate.
 * @param {*} value
 * @param {string} message
 * @param {Object} [options]
 * @param {Function} [options.ErrorClass]
 * @param {Object} [options.context]
 * @return {*}
 */
export function assertCritical(value, message, options = {}) {
  if (!value) {
    const ErrorClass = options.ErrorClass || Error;
    const errorOptions = options.context ? {context: options.context} : undefined;
    let error;

    try {
      error = errorOptions ?
        new ErrorClass(message, errorOptions) :
        new ErrorClass(message);
    } catch {
      error = new Error(message);
    }

    if (options.context && error.context === undefined) {
      error.context = options.context;
    }

    error.isCritical = true;
    throw error;
  }
  return value;
}

/**
 * Assert a value is not null or undefined.
 * @param {*} value
 * @param {string} message
 * @param {Object} [options]
 * @return {*}
 */
export function assertDefined(value, message, options = {}) {
  if (value === null || value === undefined) {
    return assertCritical(false, message, options);
  }
  return value;
}
