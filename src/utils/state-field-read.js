/**
 * The one reader of an optional state field (status, role, raft role,
 * workflow step, phase, step) on a record whose producer does not guarantee
 * it. A state the record does not carry is the named STATE_ABSENT, which the
 * caller decides on explicitly; it is never replaced by the most common state
 * (rules R07). A field the schema or its decoder guarantees is read directly,
 * not through this reader.
 */

/**
 * The state of a record that carries none.
 * @type {null}
 */
const STATE_ABSENT = null;

/**
 * Read the first present state among the record's named sources.
 * @param {...*} sources - Candidate state values, in authority order.
 * @return {string|null} The state, or STATE_ABSENT.
 */
function readStateField(...sources) {
  for (const value of sources) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return STATE_ABSENT;
}

/**
 * Read a state field in the lower-case spelling of its vocabulary.
 * @param {...*} sources - Candidate state values, in authority order.
 * @return {string|null} The lower-cased state, or STATE_ABSENT.
 */
function readLowerStateField(...sources) {
  const state = readStateField(...sources);
  return state === STATE_ABSENT ? STATE_ABSENT : state.toLowerCase();
}

/**
 * Read a state field in the upper-case spelling of its vocabulary.
 * @param {...*} sources - Candidate state values, in authority order.
 * @return {string|null} The upper-cased state, or STATE_ABSENT.
 */
function readUpperStateField(...sources) {
  const state = readStateField(...sources);
  return state === STATE_ABSENT ? STATE_ABSENT : state.toUpperCase();
}

export {
  STATE_ABSENT,
  readLowerStateField,
  readStateField,
  readUpperStateField,
};
