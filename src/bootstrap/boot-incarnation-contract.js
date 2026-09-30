/**
 * The boot incarnation contract, owned next to the boot incarnation owner
 * (boot-incarnation-owner.js), the one reservation authority. The owner
 * issues positive safe integers only (its first reservation of a virgin data
 * directory is 1) and never issues 0, so a node lifecycle owner is valid only
 * for an incarnation that satisfies this predicate. Absence is invalid: it is
 * never inferred, defaulted or collapsed to 0.
 */
const FIRST_ISSUED_BOOT_INCARNATION = 1;
const BOOT_INCARNATION_REQUIRED = 'BOOT_INCARNATION_REQUIRED';

/**
 * Whether `value` is a boot incarnation the owner can have issued.
 * @param {*} value
 * @return {boolean}
 */
function isIssuedBootIncarnation(value) {
  return Number.isSafeInteger(value) &&
    value >= FIRST_ISSUED_BOOT_INCARNATION;
}

/**
 * Fail closed unless `value` is an issued boot incarnation.
 * @param {*} value - The caller-supplied incarnation.
 * @param {string} subject - Who requires it (for the error).
 * @param {string} [code] - A subject-specific typed code.
 * @return {number} The incarnation.
 */
function requireIssuedBootIncarnation(
  value,
  subject,
  code = BOOT_INCARNATION_REQUIRED,
) {
  if (isIssuedBootIncarnation(value)) {
    return value;
  }
  const error = new Error(
    `${subject} requires a boot incarnation issued by the boot incarnation ` +
    `owner (received ${String(value)})`,
  );
  error.code = code;
  error.errorCode = code;
  error.subject = subject;
  error.received = value;
  throw error;
}

export {
  BOOT_INCARNATION_REQUIRED,
  isIssuedBootIncarnation,
  requireIssuedBootIncarnation,
};
