import {normalizeIdentifier} from './admin-helpers.js';

const LOAD_LANE_TABLE_ADMISSION_PROBE_PREFIX = 'SELECT 1 FROM ';
const LOAD_LANE_TABLE_ADMISSION_PROBE_SUFFIX = ' LIMIT 1';
const LOAD_LANE_TABLE_ADMISSION_PROBE_TABLE_REQUIRED_ERROR =
  'Load-lane admission probe requires a valid table name';

/**
 * Build the routed read used to ask the production load lane whether one
 * table is currently admissible. The query intentionally returns at most one
 * row; successful execution, rather than row presence, is the admission
 * witness.
 *
 * @param {string} tableName
 * @return {string}
 */
function buildLoadLaneTableAdmissionProbeSql(tableName) {
  const normalizedTableName = normalizeIdentifier(tableName);
  if (!normalizedTableName) {
    throw new TypeError(LOAD_LANE_TABLE_ADMISSION_PROBE_TABLE_REQUIRED_ERROR);
  }
  return (
    LOAD_LANE_TABLE_ADMISSION_PROBE_PREFIX +
    normalizedTableName +
    LOAD_LANE_TABLE_ADMISSION_PROBE_SUFFIX
  );
}

export {buildLoadLaneTableAdmissionProbeSql};
