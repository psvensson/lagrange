/**
 * The one parser of the transition columns a `tables` row carries
 * (partition_transition_state + partition_transition_metadata).
 */

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_STRING = 'string';

/**
 * Parse partition transition metadata from a table row.
 * @param {Object|null} tableInfo - Table metadata row.
 * @return {{state: string, metadata: Object}|null} Parsed transition.
 */
function parseTablePartitionTransition(tableInfo) {
  if (!tableInfo) {
    return null;
  }

  const state = tableInfo.partition_transition_state ??
    tableInfo.partitionTransitionState ??
    null;
  const rawMetadata = tableInfo.partition_transition_metadata ??
    tableInfo.partitionTransitionMetadata ??
    null;
  if (!state || !rawMetadata) {
    return null;
  }

  try {
    const metadata = typeof rawMetadata === LOCAL_STR_STRING ?
      JSON.parse(rawMetadata) :
      rawMetadata;
    return metadata && typeof metadata === LOCAL_STR_OBJECT ?
      {state, metadata} :
      null;
  } catch (_parseErr) {
    return null;
  }
}

export {parseTablePartitionTransition};
