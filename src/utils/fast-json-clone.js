/**
 * Structural clone for JSON-shaped values, matching
 * JSON.parse(JSON.stringify(value)) semantics without the serialize/parse
 * roundtrip.
 *
 * Why (closure record CL-011): the system-table cache deep-clones every row
 * it returns for read isolation, and the readiness/recovery projection
 * pipeline scans whole tables per readiness evaluation. The V8 sampling
 * profiler measured the JSON-roundtrip clone as the single largest named
 * frame on the stalled seed (41% of gap-window samples, plus a GC share
 * consistent with its transient-string churn). This clone preserves the
 * isolation semantics at a fraction of the cost.
 *
 * Semantics matched to the JSON roundtrip:
 * - undefined / function / symbol object values are dropped; as array items
 *   they become null
 * - non-finite numbers become null
 * - toJSON() is honored (Date and timestamp classes)
 * - own enumerable string-keyed properties only
 * One deliberate divergence: bigint returns undefined (dropped) instead of
 * throwing, which is strictly safer on a hot path.
 */

const TYPE_STRING = 'string';
const TYPE_BOOLEAN = 'boolean';
const TYPE_NUMBER = 'number';
const TYPE_OBJECT = 'object';
const TYPE_FUNCTION = 'function';

/**
 * @param {*} value - JSON-shaped value.
 * @return {*} Clone with JSON.parse(JSON.stringify(...)) semantics, or
 *   undefined where JSON.stringify would drop the value.
 */
function fastJsonClone(value) {
  if (value === null) {
    return null;
  }
  const type = typeof value;
  if (type === TYPE_STRING || type === TYPE_BOOLEAN) {
    return value;
  }
  if (type === TYPE_NUMBER) {
    return Number.isFinite(value) ? value : null;
  }
  if (type !== TYPE_OBJECT) {
    return undefined;
  }
  if (typeof value.toJSON === TYPE_FUNCTION) {
    return fastJsonClone(value.toJSON());
  }
  if (Array.isArray(value)) {
    const length = value.length;
    const clone = new Array(length);
    for (let index = 0; index < length; index++) {
      const item = fastJsonClone(value[index]);
      clone[index] = item === undefined ? null : item;
    }
    return clone;
  }
  const clone = {};
  for (const key of Object.keys(value)) {
    const item = fastJsonClone(value[key]);
    if (item !== undefined) {
      clone[key] = item;
    }
  }
  return clone;
}

export {fastJsonClone};
