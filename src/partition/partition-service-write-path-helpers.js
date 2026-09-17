// Pure helpers of the replica write path: the mutation a raw SQL entry
// performs, the SQL excerpt a CDC diagnostic carries, the proposal-queue
// record for one awaited commit, and the retry clock the size-persist write
// runs on. None of them holds state; each takes what it needs as an argument.
import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';

const {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_VALUE,
  SQL,
} = PARTITION_SERVICE_SHARED;

const CDC_SQL_PREVIEW_START = 0;

/**
 * The SQL excerpt a CDC diagnostic carries, or null without SQL.
 * @param {Object} entry - Write entry.
 * @return {string|null}
 */
function cdcSqlPreview(entry) {
  return entry.sql ?
    entry.sql.substring(CDC_SQL_PREVIEW_START,
      PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT) :
    null;
}

/**
 * The mutation a raw SQL query entry performs, by its leading keyword, or
 * null when it is none of the four.
 * @param {string} sql
 * @return {string|null}
 */
function classifyQuerySqlMutation(sql) {
  const sqlUpper = sql.trim().toUpperCase();
  if (sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO.toUpperCase())) {
    return PARTITION_SERVICE_OPERATION.UPSERT;
  }
  if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.INSERT)) {
    return PARTITION_SERVICE_OPERATION.INSERT;
  }
  if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.UPDATE)) {
    return PARTITION_SERVICE_OPERATION.UPDATE;
  }
  if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.DELETE)) {
    return PARTITION_SERVICE_OPERATION.DELETE;
  }
  return null;
}

/**
 * The proposal-queue record for one awaited commit.
 * @param {Object} pending - {options, resolve, reject, timeoutId}.
 * @return {Object}
 */
function buildPendingProposal({options, resolve, reject, timeoutId}) {
  return {
    resolve,
    reject,
    timeoutId,
    logIndex: Number.isFinite(options?.logIndex) ? options.logIndex : null,
    result:
      options?.result && typeof options.result === 'object' ?
        {...options.result} :
        null,
  };
}

/**
 * The retry contract of the size-persist write: its budgets, and its
 * deadline and sleeps on the replica's own clock - the clock the replica's
 * debounce and cadence already read.
 * @param {Object} timeSource - The replica's time source.
 * @return {Object} runRetryableControlPlaneWrite options.
 */
function partitionSizeRetryOptions(timeSource) {
  return {
    timeoutMs: PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_TIMEOUT_MS,
    baseDelayMs: PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_BASE_DELAY_MS,
    maxDelayMs: PARTITION_SERVICE_DEFAULT.SIZE_PERSIST_RETRY_MAX_DELAY_MS,
    now: () => timeSource.now(),
    sleep: (delayMs) => new Promise(
      (resolve) => timeSource.setTimeout(resolve, delayMs)),
  };
}

export {
  buildPendingProposal,
  cdcSqlPreview,
  classifyQuerySqlMutation,
  partitionSizeRetryOptions,
};
