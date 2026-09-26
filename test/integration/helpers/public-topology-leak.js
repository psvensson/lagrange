/**
 * Leak check for what a public caller receives: which of the given
 * topology values (node ids, partition ids, replica ids, addresses) occur
 * anywhere in an observed error's message, detail, or hint.
 * Local to the images-seam Track B proofs; to be deduplicated with the
 * epic's other leak helper at merge.
 */

const OBSERVED_TEXT_FIELDS = Object.freeze(['message', 'detail', 'hint']);

/**
 * @param {object} observed - Fields a pg client exposes on an error.
 * @param {string[]} topologyValues - Values that must never appear.
 * @return {string[]} The topology values found (empty when clean).
 */
function topologyLeaksIn(observed, topologyValues) {
  const text = OBSERVED_TEXT_FIELDS
    .map((field) => String(observed?.[field] ?? ''))
    .join('\n');
  return topologyValues.filter((value) =>
    typeof value === 'string' && value.length > 0 && text.includes(value));
}

export {topologyLeaksIn};
