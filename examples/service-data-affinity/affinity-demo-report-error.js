// Single owner of how a demo failure is written into a report: the message
// stays the `error` string every reader already consumes, and the typed fields
// the admin client attaches to a rejected query (error code, details, the
// per-participant failures of a distributed write) travel beside it as
// `errorDetail`, so a failed load names its partitions and participant errors.

const REPORT_ERROR_DETAIL_FIELDS = Object.freeze([
  'errorCode',
  'details',
  'participantFailures',
  'firstFailedParticipant',
  'participantFailuresOmittedCount',
]);

/**
 * Project an error into the report's `error` message and `errorDetail`.
 *
 * @param {Error|null} error
 * @return {{error: string|null, errorDetail: Object|null}}
 */
function buildAffinityDemoReportError(error) {
  if (!error) {
    return {error: null, errorDetail: null};
  }
  const errorDetail = {message: error.message || null};
  for (const field of REPORT_ERROR_DETAIL_FIELDS) {
    if (error[field] !== undefined) {
      errorDetail[field] = error[field];
    }
  }
  return {error: error.message || null, errorDetail};
}

export {buildAffinityDemoReportError};
