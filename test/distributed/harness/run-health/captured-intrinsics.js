/**
 * Prototype methods captured at module load, for the run-health unit.
 *
 * The run-health modules read external data (samples, node logs, collected
 * health, probe output). They call these captures instead of the ambient
 * prototype methods, so that code which replaces an intrinsic after load
 * cannot change what the unit reads (the harness tree's convention;
 * scripts/check-guideline-ambient-intrinsics.js).
 */

const call = Function.call;
const arrayMap = call.bind(Array.prototype.map);
const arrayFilter = call.bind(Array.prototype.filter);
const arraySome = call.bind(Array.prototype.some);
const arrayFind = call.bind(Array.prototype.find);
const arrayFlatMap = call.bind(Array.prototype.flatMap);
const arrayIncludes = call.bind(Array.prototype.includes);
const arrayIndexOf = call.bind(Array.prototype.indexOf);
const stringIncludes = call.bind(String.prototype.includes);
const stringIndexOf = call.bind(String.prototype.indexOf);
const stringSplit = call.bind(String.prototype.split);
const stringTrim = call.bind(String.prototype.trim);
const stringStartsWith = call.bind(String.prototype.startsWith);
const stringEndsWith = call.bind(String.prototype.endsWith);

/**
 * `includes` on a string or an array, by the value's own type.
 * @param {string|Array} value
 * @param {*} item
 * @return {boolean}
 */
function includesOf(value, item) {
  return typeof value === 'string' ? stringIncludes(value, item) : arrayIncludes(value, item);
}

/**
 * `indexOf` on a string or an array, by the value's own type.
 * @param {string|Array} value
 * @param {*} item
 * @return {number}
 */
function indexOfIn(value, item) {
  return typeof value === 'string' ? stringIndexOf(value, item) : arrayIndexOf(value, item);
}

export {
  arrayFilter,
  arrayFind,
  arrayFlatMap,
  arrayMap,
  arraySome,
  includesOf,
  indexOfIn,
  stringEndsWith,
  stringSplit,
  stringStartsWith,
  stringTrim,
};
