/**
 * Assert a critical dependency is available.
 * Throws to allow top-level handlers to terminate.
 * @param {*} value
 * @param {string} message
 * @return {*}
 */
export function assertCritical(value, message) {
  if (!value) {
    const error = new Error(message);
    error.isCritical = true;
    throw error;
  }
  return value;
}

