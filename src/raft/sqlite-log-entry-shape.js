/**
 * Helpers for converting SQLite-stored raft log payloads into the canonical
 * entry shape consumed by liferaft.
 */


const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_COMMAND = 'command';
const LOCAL_STR_RESPONSES = 'responses';
const LOCAL_STR_COMMITTED = 'committed';

/**
 * Check whether a persisted payload already uses the canonical entry shape.
 * @param {*} entry
 * @return {boolean}
 */
function isCanonicalLogEntryShape(entry) {
  return !!entry &&
    typeof entry === LOCAL_STR_OBJECT &&
    (
      Object.prototype.hasOwnProperty.call(entry, LOCAL_STR_COMMAND) ||
      Object.prototype.hasOwnProperty.call(entry, LOCAL_STR_RESPONSES) ||
      Object.prototype.hasOwnProperty.call(entry, LOCAL_STR_COMMITTED)
    );
}

/**
 * Normalize any stored or incoming entry to the canonical raft entry shape.
 * Legacy rows that stored only the command payload are wrapped without
 * rewriting metadata outside the adapter owner path.
 * @param {*} entry
 * @param {Object} [fallback]
 * @param {number} [fallback.index]
 * @param {number} [fallback.term]
 * @param {number} [fallback.committedIndex]
 * @return {Object}
 */
function normalizeLogEntry(entry, fallback = {}) {
  const hasCanonicalShape = isCanonicalLogEntryShape(entry);
  const committedIndex = Number.isFinite(fallback.committedIndex) ?
    fallback.committedIndex :
    0;
  const index = hasCanonicalShape && Number.isFinite(entry?.index) ?
    entry.index :
    fallback.index;
  const term = hasCanonicalShape && Number.isFinite(entry?.term) ?
    entry.term :
    fallback.term;

  return {
    index,
    term,
    committed: hasCanonicalShape ?
      entry.committed === true :
      Number.isFinite(index) && index <= committedIndex,
    responses: hasCanonicalShape && Array.isArray(entry.responses) ?
      entry.responses.map((response) => ({...response})) :
      [],
    command: hasCanonicalShape ? entry.command : entry,
  };
}

export {
  isCanonicalLogEntryShape,
  normalizeLogEntry,
};
