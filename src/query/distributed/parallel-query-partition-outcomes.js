import {pickTypedWriteAnswer} from
  '../../partition/partition-write-kernel.js';
import {pickRoutingDenialFields} from '../query-execution-budget.js';
import {presentSqlValue} from '../sql-value-presentation.js';
import {FANOUT_PLAN_KIND} from './distributed-select-fanout-plan.js';

const LAZY_ROWS_GETTER_SYMBOL = Symbol.for('lagrange.query.lazyRowsGetter');
const PRESENTED_SAFE_INTEGERS_SYMBOL = Symbol.for(
  'lagrange.query.presentedSafeIntegers',
);
const RESIDENT_RESULT_BYTES_SYMBOL = Symbol.for(
  'lagrange.query.residentResultBytes',
);
const PROP_ROWS = 'rows';
const PROP_RAW_ROWS = 'rawRows';
const PROP_COLUMNS = 'columns';
const PROP_BYTE_LENGTH = 'byteLength';
const PROP_RESIDENT_BYTES = 'residentBytes';
const LOCAL_STR_BOOLEAN = 'boolean';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_OBJECT = 'object';

function stampRowCollectionPresentation(collection, safeIntegers, residentBytes) {
  if (!Array.isArray(collection)) {
    return collection;
  }
  if (typeof safeIntegers === LOCAL_STR_BOOLEAN) {
    Object.defineProperty(collection, PRESENTED_SAFE_INTEGERS_SYMBOL, {
      value: safeIntegers,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
  if (Number.isSafeInteger(residentBytes) && residentBytes >= 0) {
    Object.defineProperty(collection, RESIDENT_RESULT_BYTES_SYMBOL, {
      value: residentBytes,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }
  return collection;
}

function getResultRowCount(result) {
  if (Array.isArray(result?.rawRows)) {
    return result.rawRows.length;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows.length;
  }
  if (Number.isSafeInteger(result?.count) && result.count >= 0) {
    return result.count;
  }
  return 0;
}

function hasLazyRowsProperty(source) {
  if (!source || typeof source !== LOCAL_STR_OBJECT) {
    return false;
  }
  const descriptor = Object.getOwnPropertyDescriptor(source, PROP_ROWS);
  if (descriptor?.get) {
    return true;
  }
  return Boolean(source[LAZY_ROWS_GETTER_SYMBOL]) && descriptor === undefined;
}

function materializeRowObjectsFromPositionalRows(
  columns,
  rawRows,
  safeIntegers,
  residentBytes,
) {
  const colCount = Array.isArray(columns) ? columns.length : 0;
  const rows = new Array(rawRows.length);
  for (let r = 0; r < rawRows.length; r += 1) {
    const rawRow = rawRows[r];
    const obj = {};
    for (let c = 0; c < colCount; c += 1) {
      obj[columns[c]] = rawRow[c] === undefined ? null : rawRow[c];
    }
    rows[r] = obj;
  }
  return stampRowCollectionPresentation(rows, safeIntegers, residentBytes);
}

function createPositionalLazyRowsBuilder(target, options = {}) {
  const columns = Array.isArray(options.columns) ?
    options.columns :
    target?.columns;
  const rawRows = Array.isArray(options.rawRows) ?
    options.rawRows :
    target?.rawRows;
  const safeIntegers = typeof options.safeIntegers === LOCAL_STR_BOOLEAN ?
    options.safeIntegers :
    rawRows?.[PRESENTED_SAFE_INTEGERS_SYMBOL];
  const residentBytes = Number.isSafeInteger(options.residentBytes) ?
    options.residentBytes :
    rawRows?.[RESIDENT_RESULT_BYTES_SYMBOL];
  let cachedRows = null;
  return () => {
    if (cachedRows === null) {
      cachedRows = Array.isArray(rawRows) && Array.isArray(columns) ?
        materializeRowObjectsFromPositionalRows(
          columns,
          rawRows,
          safeIntegers,
          residentBytes,
        ) :
        [];
    }
    return cachedRows;
  };
}

function resolveLazyRowsBuilder(target, getterOrOptions) {
  if (typeof getterOrOptions === LOCAL_STR_FUNCTION) {
    return getterOrOptions;
  }
  const customGetRows = getterOrOptions?.getRows;
  if (typeof customGetRows === LOCAL_STR_FUNCTION) {
    return customGetRows;
  }
  return createPositionalLazyRowsBuilder(target, getterOrOptions);
}

function defineLazyRowObjectsGetter(target, getterOrOptions = undefined) {
  const getRows = resolveLazyRowsBuilder(target, getterOrOptions);
  Object.defineProperty(target, LAZY_ROWS_GETTER_SYMBOL, {
    value: getRows,
    writable: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(target, PROP_ROWS, {
    enumerable: true,
    configurable: true,
    get() {
      const materialized = getRows();
      Object.defineProperty(target, PROP_ROWS, {
        value: materialized,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return materialized;
    },
    set(nextRows) {
      Object.defineProperty(target, PROP_ROWS, {
        value: nextRows,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    },
  });
  return target;
}

function applyLazyResultIntegerPresentation(result, safeIntegers = false) {
  const normalizedSafeIntegers = safeIntegers === true;
  if (!Array.isArray(result?.rawRows)) {
    return null;
  }
  const rawRows = result.rawRows;
  if (rawRows[PRESENTED_SAFE_INTEGERS_SYMBOL] === normalizedSafeIntegers) {
    return rawRows;
  }
  const presentationOptions = {safeIntegers: normalizedSafeIntegers};
  for (let r = 0; r < rawRows.length; r += 1) {
    const row = rawRows[r];
    if (!Array.isArray(row)) {
      continue;
    }
    for (let c = 0; c < row.length; c += 1) {
      row[c] = presentSqlValue(row[c], presentationOptions);
    }
  }
  return stampRowCollectionPresentation(
    rawRows,
    normalizedSafeIntegers,
    rawRows[RESIDENT_RESULT_BYTES_SYMBOL],
  );
}

function resolveSinglePartitionMergeOptions(
  fanoutPlan,
  results,
  mergeOptions,
  singlePartitionPlanKind = FANOUT_PLAN_KIND.SINGLE_PARTITION,
) {
  if (
    fanoutPlan?.kind !== singlePartitionPlanKind ||
    !Array.isArray(results) ||
    results.length !== 1
  ) {
    return mergeOptions;
  }
  const firstRawRows = results[0]?.rawRows;
  const presentedPolicy = firstRawRows?.[PRESENTED_SAFE_INTEGERS_SYMBOL];
  if (
    typeof presentedPolicy !== LOCAL_STR_BOOLEAN ||
    presentedPolicy === mergeOptions.safeIntegers
  ) {
    return mergeOptions;
  }
  return {
    ...mergeOptions,
    safeIntegers: presentedPolicy,
  };
}

function hasPositionalRowColumns(source) {
  return Array.isArray(source?.rawRows) && Array.isArray(source?.columns);
}

function attachPositionalSelectRows(target, aggregated, safeIntegers) {
  const presentedRawRows = applyLazyResultIntegerPresentation(
    aggregated,
    safeIntegers,
  );
  target.rawRows = presentedRawRows;
  target.columns = aggregated.columns;
  target.rowSet = aggregated.rowSet;
  target.count = presentedRawRows.length;
  const residentBytes = presentedRawRows[RESIDENT_RESULT_BYTES_SYMBOL];
  if (hasLazyRowsProperty(aggregated)) {
    return defineLazyRowObjectsGetter(target, () =>
      stampRowCollectionPresentation(
        aggregated.rows,
        safeIntegers,
        residentBytes,
      ),
    );
  }
  return defineLazyRowObjectsGetter(target, {
    columns: aggregated.columns,
    rawRows: presentedRawRows,
    safeIntegers,
    residentBytes,
  });
}

function attachAggregatedSelectRows(target, aggregated, options = {}) {
  const safeIntegers = options?.safeIntegers === true;
  if (hasPositionalRowColumns(aggregated)) {
    return attachPositionalSelectRows(target, aggregated, safeIntegers);
  }
  const rows = Array.isArray(aggregated?.rows) ? aggregated.rows : [];
  target.rows = rows;
  target.rawRows = aggregated?.rawRows;
  target.columns = aggregated?.columns;
  target.rowSet = aggregated?.rowSet;
  target.count = rows.length;
  return target;
}


function normalizeRetryAfterMs(value) {
  return Number.isFinite(value) && value >= 0 ?
    Math.floor(value) :
    null;
}

function normalizeFailureString(value) {
  return typeof value === 'string' && value.length > 0 ?
    value :
    null;
}

function resolveFailureBackpressureState(diagnostics = {}) {
  if (typeof diagnostics?.backpressured === 'boolean') {
    return diagnostics.backpressured;
  }
  if (diagnostics?.deferRetry === true) {
    return true;
  }
  return Number.isFinite(diagnostics?.retryAfterMs) &&
    diagnostics.retryAfterMs > 0;
}

/**
 * Normalize one partition-execution failure snapshot.
 * @param {string} partitionId - Partition ID.
 * @param {Object} partitionMetrics - Partition metrics.
 * @param {Object} failure - Failure-like object or error.
 * @param {string} fallbackErrorMessage - Fallback error text.
 * @return {Object} Normalized failure snapshot.
 */
function normalizePartitionExecutionFailureSnapshot(
  partitionId,
  partitionMetrics,
  failure,
  fallbackErrorMessage,
) {
  return {
    // The typed fields of the answer the partition failed with (its code,
    // entryId, spent wait): a fan-out never degrades them to the text.
    ...pickTypedWriteAnswer(failure),
    ...pickRoutingDenialFields(failure),
    ...(typeof failure?.deliveryDisposition === 'string' &&
    failure.deliveryDisposition.length > 0 ?
      {deliveryDisposition: failure.deliveryDisposition} :
      {}),
    partitionId,
    status: partitionMetrics.status,
    error: normalizeFailureString(failure?.error) ||
      normalizeFailureString(failure?.message) ||
      fallbackErrorMessage,
    errorCode: normalizeFailureString(
      failure?.errorCode || failure?.code,
    ),
    retryAfterMs: normalizeRetryAfterMs(failure?.retryAfterMs),
    deferRetry: failure?.deferRetry === true,
    participantNodeId:
      normalizeFailureString(failure?.participantNodeId),
    participantAddress:
      normalizeFailureString(failure?.participantAddress),
    backpressured: resolveFailureBackpressureState(failure),
    failedTable: normalizeFailureString(failure?.failedTable),
    durationMs: partitionMetrics.latencyMs,
    rows: failure?.rows || [],
  };
}

/**
 * Build the canonical partition-execution failure outcome.
 * @param {Object} snapshot - Normalized failure snapshot.
 * @return {Object} Failure result.
 */
function buildPartitionExecutionFailureOutcome(snapshot = {}) {
  return {
    ...pickTypedWriteAnswer(snapshot),
    ...pickRoutingDenialFields(snapshot),
    ...(typeof snapshot?.deliveryDisposition === 'string' &&
    snapshot.deliveryDisposition.length > 0 ?
      {deliveryDisposition: snapshot.deliveryDisposition} :
      {}),
    partitionId: snapshot.partitionId,
    success: false,
    status: snapshot.status,
    error: snapshot.error,
    errorCode: snapshot.errorCode,
    retryAfterMs: snapshot.retryAfterMs,
    deferRetry: snapshot.deferRetry,
    participantNodeId: snapshot.participantNodeId,
    participantAddress: snapshot.participantAddress,
    backpressured: snapshot.backpressured,
    failedTable: snapshot.failedTable,
    durationMs: snapshot.durationMs,
    rows: snapshot.rows,
  };
}

function copyArrayFieldIfPresent(target, source, field) {
  if (Array.isArray(source[field])) {
    target[field] = source[field];
  }
}

function copySafeIntegerFieldIfAtLeast(target, source, field, minVal) {
  const val = source[field];
  if (Number.isSafeInteger(val) && val >= minVal) {
    target[field] = val;
  }
}

function copyPositionalOutcomeFields(outcome, result) {
  if (!result || typeof result !== LOCAL_STR_OBJECT) {
    return;
  }
  copyArrayFieldIfPresent(outcome, result, PROP_RAW_ROWS);
  copyArrayFieldIfPresent(outcome, result, PROP_COLUMNS);
  if (result.rowSet !== undefined && result.rowSet !== null) {
    outcome.rowSet = result.rowSet;
  }
  copySafeIntegerFieldIfAtLeast(outcome, result, PROP_BYTE_LENGTH, 1);
  copySafeIntegerFieldIfAtLeast(outcome, result, PROP_RESIDENT_BYTES, 0);
  if (result.executionEnvelope !== undefined) {
    outcome.executionEnvelope = result.executionEnvelope;
  }
}

function attachOutcomeRows(outcome, result) {
  if (hasLazyRowsProperty(result)) {
    return defineLazyRowObjectsGetter(outcome, () => result.rows);
  }
  if (hasPositionalRowColumns(result) && !Object.hasOwn(result, PROP_ROWS)) {
    return defineLazyRowObjectsGetter(outcome);
  }
  outcome.rows = result?.rows || [];
  return outcome;
}

/**
 * Build the canonical partition-execution success outcome.
 * @param {string} partitionId - Partition ID.
 * @param {Object} partitionMetrics - Partition metrics.
 * @param {Object} result - Query result.
 * @return {Object} Success result.
 */
function buildPartitionExecutionSuccessOutcome(
  partitionId,
  partitionMetrics,
  result,
) {
  const outcome = {
    partitionId,
    success: true,
    status: partitionMetrics.status,
    changes: result.changes,
    rowSetComplete: result.rowSetComplete === true,
    readAuthorityWitness: result.readAuthorityWitness,
    ...(result.partial === undefined ? {} : {partial: result.partial}),
    ...(result.durableCommitWitness === undefined ? {} :
      {durableCommitWitness: result.durableCommitWitness}),
    ...(result.originHlc === undefined ? {} : {originHlc: result.originHlc}),
    ...(result.acceptingNodeId === undefined ? {} :
      {acceptingNodeId: result.acceptingNodeId}),
    ...(result.acknowledgedAtMs === undefined ? {} :
      {acknowledgedAtMs: result.acknowledgedAtMs}),
    ...(result.authoritativeObservation === undefined ? {} :
      {authoritativeObservation: result.authoritativeObservation}),
    ...(Number.isSafeInteger(result.readGeneration) ?
      {readGeneration: result.readGeneration} : {}),
    // A settled replay's named state travels with its count (or in place of
    // a count it does not know).
    ...(result.settledReplay === undefined ? {} :
      {settledReplay: result.settledReplay}),
  };
  copyPositionalOutcomeFields(outcome, result);
  return attachOutcomeRows(outcome, result);
}

export {
  attachAggregatedSelectRows,
  buildPartitionExecutionFailureOutcome,
  buildPartitionExecutionSuccessOutcome,
  defineLazyRowObjectsGetter,
  getResultRowCount,
  hasLazyRowsProperty,
  normalizeFailureString,
  normalizePartitionExecutionFailureSnapshot,
  normalizeRetryAfterMs,
  resolveFailureBackpressureState,
  resolveSinglePartitionMergeOptions,
};
