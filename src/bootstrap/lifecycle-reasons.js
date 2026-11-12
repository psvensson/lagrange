// Pure operations on lifecycle reason-code lists, used by the lifecycle
// controller.

function uniqueReasons(reasons) {
  return [...new Set(reasons)];
}

/**
 * The reason codes of a caller-supplied list: strings only, each once.
 * @param {*} reasons
 * @return {Array<string>}
 */
function normalizeReasons(reasons) {
  if (!Array.isArray(reasons)) {
    return [];
  }
  return uniqueReasons(
    reasons.filter((reason) => typeof reason === 'string' && reason.length > 0),
  );
}

/**
 * Whether two reason lists carry the same codes in the same order.
 * @param {*} a
 * @param {*} b
 * @return {boolean}
 */
function sameReasons(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

export {normalizeReasons, sameReasons, uniqueReasons};
