import {
  BENCHMARK_ACKNOWLEDGED_WRITES_NOT_VISIBLE,
  BENCHMARK_CONSISTENCY_CONTRACT,
  BENCHMARK_CORRECT_THROUGHPUT_BASIS,
  BENCHMARK_DURABILITY_CONTRACT,
  BENCHMARK_DURABILITY_OBSERVER_MISSING,
  BENCHMARK_ERROR_CONTRACT,
  BENCHMARK_EVENT_ID_PREFIX,
  BENCHMARK_INSERT_COLUMNS_SQL,
  BENCHMARK_INSERT_OPERATION,
  BENCHMARK_ORDERING_CONTRACT,
  BENCHMARK_PAYLOAD_MODULO,
  BENCHMARK_POSTGRES_CONFLICT_SQL,
  BENCHMARK_RESULT_ORACLE_COMMAND_ACKNOWLEDGED,
  BENCHMARK_RESULT_ORACLE_SINGLE_COUNT_ROW,
  BENCHMARK_SELECT_OPERATION,
  BENCHMARK_SEMANTIC_CONTRACT_VERSION,
  BENCHMARK_SEMANTIC_ONE,
  BENCHMARK_SEMANTIC_RESULT_ERROR_CODE,
  BENCHMARK_SEMANTIC_RESULT_ERROR_MESSAGE,
  BENCHMARK_SEMANTIC_STATUS,
  BENCHMARK_SEMANTIC_ZERO,
  BENCHMARK_SQL_DIALECT,
  BENCHMARK_SQL_ESCAPED_TEXT_QUOTE,
  BENCHMARK_SQL_TEXT_QUOTE,
  BENCHMARK_TABLE_NAME,
  BENCHMARK_TIMESTAMP_BASE_MS,
  BENCHMARK_TRANSACTION_CONTRACT,
  BENCHMARK_VISIBILITY_CHUNK_SIZE,
  BENCHMARK_VISIBILITY_RESULT_ALIAS,
} from './benchmark-workload-semantics-constants.js';
import {
  appendOwnArrayValue,
  copyDenseStringArray,
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isDenseDataArray,
  isMissingDataValue,
  isNonNegativeSafeInteger,
  isPlainDataRecord,
  isSha256Digest,
  ownDataValue,
  uniqueSortedStrings,
} from './benchmark-semantic-integrity.js';

export {
  BENCHMARK_SQL_DIALECT,
};

const objectCreate = Object.create;
const objectHasOwn = Object.hasOwn;
const MAX_SAFE_MAGNITUDE = Number.MAX_SAFE_INTEGER;
const RECEIPT_KEYS = [
  'version',
  'dialect',
  'throughputBasis',
  'dimensions',
  'contractDigest',
  'status',
  'compiledOperations',
  'validatedOperations',
  'successfulOperations',
  'oracleFailures',
  'resultSet',
  'accounting',
  'durability',
  'receiptDigest',
];
const RECEIPT_DIMENSION_KEYS = [
  'resultSet',
  'ordering',
  'transaction',
  'consistency',
  'durability',
  'errorBehavior',
];
const RESULT_SET_KEYS = ['observationCount', 'digest'];
const DURABILITY_KEYS = [
  'status',
  'expected',
  'observed',
  'missingIds',
  'reason',
];
const ACCOUNTING_KEYS = [
  'offered',
  'dispatched',
  'correct',
  'rejected',
  'timedOut',
  'errored',
  'queueOverflow',
  'undispatched',
  'cancelled',
  'rejectedByReason',
];
const REJECTED_REASON_KEYS = ['queueFull', 'flowControl', 'admission'];
const OBSERVATION_KEYS = ['operationId', 'operation', 'outcome'];
const FIRST_DECIMAL_DIGIT = '0';
const LAST_DECIMAL_DIGIT = '9';
const DECIMAL_RADIX = 10;
const IDENTIFIER_UNDERSCORE = '_';
const ASCII_LETTER_BOUND = {
  UPPER_FIRST: 'A',
  UPPER_LAST: 'Z',
  LOWER_FIRST: 'a',
  LOWER_LAST: 'z',
};
const VISIBILITY_ID_SEPARATOR = ', ';
const SEMANTIC_OPERATION_FIELD = {
  INDEX: 'operationIndex',
  OPERATION: 'operation',
};
const SEMANTIC_ERROR = {
  IDENTIFIER_TEXT: 'benchmark SQL identifier must be primitive text',
  IDENTIFIER_INVALID: 'invalid benchmark SQL identifier',
  DIALECT_UNSUPPORTED: 'unsupported benchmark SQL dialect',
  SQL_TEXT: 'benchmark SQL text must be primitive text',
  OPERATION_UNSUPPORTED: 'unsupported benchmark semantic operation',
  TIMESTAMP_RANGE: 'benchmark timestamp exceeds safe integer range',
  TIMESTAMP_TYPE: 'benchmark timestamp must be a non-negative safe integer',
  COUNTER_TYPE: 'benchmark operation counter must be a safe integer',
  OPTIONS_TYPE: 'benchmark operation options must be plain data',
  EVENT_ID_PREFIX: 'benchmark event ID prefix must be primitive text',
  OBSERVATIONS_DENSE: 'dense semantic result observations required',
  OBSERVATION_INVALID: 'invalid semantic result observation',
  OBSERVATION_DUPLICATE: 'duplicate semantic result observation',
  RECEIPT_OPTIONS: 'semantic receipt options must be plain data',
  RUNTIME_EVIDENCE: 'complete semantic runtime evidence required',
  DURABILITY_OPTIONS: 'durability options must be plain data',
  ACKNOWLEDGED_IDS: 'acknowledged write IDs must be a dense string array',
  OBSERVER_ROWS: 'durability observer rows must be dense data',
  OBSERVER_ROW: 'durability observer row must be plain data',
  OBSERVER_ID: 'durability observer event ID must be primitive text',
};

function optionalOwnDataValue(record, key) {
  const value = ownDataValue(record, key);
  return isMissingDataValue(value) ? undefined : value;
}

function isAsciiLetter(character) {
  return (
    character >= ASCII_LETTER_BOUND.UPPER_FIRST &&
    character <= ASCII_LETTER_BOUND.UPPER_LAST
  ) || (
    character >= ASCII_LETTER_BOUND.LOWER_FIRST &&
    character <= ASCII_LETTER_BOUND.LOWER_LAST
  );
}

function isDecimalDigit(character) {
  return character >= FIRST_DECIMAL_DIGIT &&
    character <= LAST_DECIMAL_DIGIT;
}

function isIdentifierCharacter(character, index) {
  if (isAsciiLetter(character) || character === IDENTIFIER_UNDERSCORE) {
    return true;
  }
  return index > BENCHMARK_SEMANTIC_ZERO && isDecimalDigit(character);
}

function normalizeIdentifier(value, fallback = BENCHMARK_TABLE_NAME) {
  const candidate = value === undefined || value === null || value === '' ?
    fallback :
    value;
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new TypeError(SEMANTIC_ERROR.IDENTIFIER_TEXT);
  }
  for (let index = 0; index < candidate.length; index += 1) {
    if (!isIdentifierCharacter(candidate[index], index)) {
      throw new TypeError(SEMANTIC_ERROR.IDENTIFIER_INVALID);
    }
  }
  return candidate;
}

function normalizeDialect(value) {
  const dialect = value === undefined || value === null ?
    BENCHMARK_SQL_DIALECT.SQLITE :
    value;
  if (
    typeof dialect !== 'string' ||
    (
      dialect !== BENCHMARK_SQL_DIALECT.SQLITE &&
      dialect !== BENCHMARK_SQL_DIALECT.POSTGRESQL
    )
  ) {
    throw new TypeError(SEMANTIC_ERROR.DIALECT_UNSUPPORTED);
  }
  return dialect;
}

function escapeSqlText(value) {
  if (typeof value !== 'string') {
    throw new TypeError(SEMANTIC_ERROR.SQL_TEXT);
  }
  let escaped = '';
  for (let index = 0; index < value.length; index += 1) {
    escaped += value[index] === BENCHMARK_SQL_TEXT_QUOTE ?
      BENCHMARK_SQL_ESCAPED_TEXT_QUOTE :
      value[index];
  }
  return escaped;
}

function buildSemanticContract(dialect) {
  const normalizedDialect = normalizeDialect(dialect);
  const dimensions = {
    resultSet: BENCHMARK_RESULT_ORACLE_SINGLE_COUNT_ROW,
    ordering: BENCHMARK_ORDERING_CONTRACT,
    transaction: BENCHMARK_TRANSACTION_CONTRACT,
    consistency: BENCHMARK_CONSISTENCY_CONTRACT,
    durability: BENCHMARK_DURABILITY_CONTRACT,
    errorBehavior: BENCHMARK_ERROR_CONTRACT,
  };
  return {
    version: BENCHMARK_SEMANTIC_CONTRACT_VERSION,
    dialect: normalizedDialect,
    throughputBasis: BENCHMARK_CORRECT_THROUGHPUT_BASIS,
    dimensions,
    contractDigest: digestBenchmarkSemanticData({
      version: BENCHMARK_SEMANTIC_CONTRACT_VERSION,
      throughputBasis: BENCHMARK_CORRECT_THROUGHPUT_BASIS,
      dimensions,
    }),
  };
}

function compileInsert(tableName, eventId, payload, timestamp, dialect) {
  const valuesSql =
    `('${escapeSqlText(eventId)}', ${payload}, ${timestamp})`;
  if (dialect === BENCHMARK_SQL_DIALECT.POSTGRESQL) {
    return `INSERT INTO ${tableName} ` +
      BENCHMARK_INSERT_COLUMNS_SQL +
      valuesSql +
      BENCHMARK_POSTGRES_CONFLICT_SQL;
  }
  return `INSERT OR IGNORE INTO ${tableName} ` +
    BENCHMARK_INSERT_COLUMNS_SQL +
    valuesSql;
}

function normalizeOperation(value) {
  if (
    value !== BENCHMARK_INSERT_OPERATION &&
    value !== BENCHMARK_SELECT_OPERATION
  ) {
    throw new TypeError(SEMANTIC_ERROR.OPERATION_UNSUPPORTED);
  }
  return value;
}

function resolveTimestamp(value, counter) {
  if (value === undefined || value === null) {
    const timestamp = BENCHMARK_TIMESTAMP_BASE_MS + counter;
    if (!isNonNegativeSafeInteger(timestamp)) {
      throw new TypeError(SEMANTIC_ERROR.TIMESTAMP_RANGE);
    }
    return timestamp;
  }
  if (!isNonNegativeSafeInteger(value)) {
    throw new TypeError(SEMANTIC_ERROR.TIMESTAMP_TYPE);
  }
  return value;
}

/**
 * Build and compile one semantic benchmark operation for a target dialect.
 * @param {string} operation
 * @param {number} counter
 * @param {Object} options
 * @returns {Object}
 */
export function buildBenchmarkOperationDescriptor(
  operation,
  counter,
  options = {},
) {
  const normalizedOperation = normalizeOperation(operation);
  if (!isNonNegativeSafeInteger(counter)) {
    throw new TypeError(SEMANTIC_ERROR.COUNTER_TYPE);
  }
  if (!isPlainDataRecord(options)) {
    throw new TypeError(SEMANTIC_ERROR.OPTIONS_TYPE);
  }
  const dialect = normalizeDialect(optionalOwnDataValue(options, 'sqlDialect'));
  const tableName = normalizeIdentifier(optionalOwnDataValue(options, 'tableName'));
  const configuredPrefix = ownDataValue(options, 'eventIdPrefix');
  const eventIdPrefix = isMissingDataValue(configuredPrefix) ?
    BENCHMARK_EVENT_ID_PREFIX :
    configuredPrefix;
  if (typeof eventIdPrefix !== 'string' || eventIdPrefix.length === 0) {
    throw new TypeError(SEMANTIC_ERROR.EVENT_ID_PREFIX);
  }
  const eventId = eventIdPrefix + counter;
  const payload = counter % BENCHMARK_PAYLOAD_MODULO;
  const configuredTimestamp = ownDataValue(options, 'timestamp');
  const timestamp = resolveTimestamp(
    isMissingDataValue(configuredTimestamp) ? undefined : configuredTimestamp,
    counter,
  );
  const semanticOperation = {
    contractVersion: BENCHMARK_SEMANTIC_CONTRACT_VERSION,
    operation: normalizedOperation,
    operationIndex: counter,
    tableName,
    eventId,
    payload,
    timestamp,
    transaction: BENCHMARK_TRANSACTION_CONTRACT,
    consistency: BENCHMARK_CONSISTENCY_CONTRACT,
    durability: BENCHMARK_DURABILITY_CONTRACT,
    errorBehavior: BENCHMARK_ERROR_CONTRACT,
    ordering: BENCHMARK_ORDERING_CONTRACT,
    resultOracle: normalizedOperation === BENCHMARK_INSERT_OPERATION ?
      BENCHMARK_RESULT_ORACLE_COMMAND_ACKNOWLEDGED :
      BENCHMARK_RESULT_ORACLE_SINGLE_COUNT_ROW,
  };
  return {
    acknowledgedWriteId:
      normalizedOperation === BENCHMARK_INSERT_OPERATION ? eventId : null,
    semanticOperation,
    sql: normalizedOperation === BENCHMARK_INSERT_OPERATION ?
      compileInsert(tableName, eventId, payload, timestamp, dialect) :
      `SELECT count(*) AS matched_count FROM ${tableName} ` +
        `WHERE payload = ${payload}`,
  };
}

function rowsFromResult(result) {
  if (isDenseDataArray(result)) {
    return result;
  }
  const rows = ownDataValue(result, 'rows');
  return isDenseDataArray(rows) ? rows : null;
}

function parseCountText(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  let count = BENCHMARK_SEMANTIC_ZERO;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character < FIRST_DECIMAL_DIGIT || character > LAST_DECIMAL_DIGIT) {
      return null;
    }
    count = (count * DECIMAL_RADIX) + (+character);
    if (count > MAX_SAFE_MAGNITUDE) {
      return null;
    }
  }
  return count;
}

function normalizeResultCount(value) {
  if (isNonNegativeSafeInteger(value)) {
    return value;
  }
  return parseCountText(value);
}

function isValidResultObservation(observation) {
  if (
    !hasExactOwnDataKeys(observation, OBSERVATION_KEYS) ||
    !isNonNegativeSafeInteger(observation.operationId)
  ) {
    return false;
  }
  if (observation.operation === BENCHMARK_INSERT_OPERATION) {
    return observation.outcome ===
      BENCHMARK_RESULT_ORACLE_COMMAND_ACKNOWLEDGED;
  }
  return observation.operation === BENCHMARK_SELECT_OPERATION &&
    isNonNegativeSafeInteger(observation.outcome);
}

function semanticResultError() {
  const error = new Error(BENCHMARK_SEMANTIC_RESULT_ERROR_MESSAGE);
  error.code = BENCHMARK_SEMANTIC_RESULT_ERROR_CODE;
  return error;
}

function buildResultObservation(semanticOperation, outcome) {
  return {
    operationId: ownDataValue(semanticOperation, SEMANTIC_OPERATION_FIELD.INDEX),
    operation: ownDataValue(
      semanticOperation,
      SEMANTIC_OPERATION_FIELD.OPERATION,
    ),
    outcome,
  };
}

/**
 * Fail closed when a successful query response violates its result oracle.
 * @param {Object} operationDescriptor
 * @param {*} queryResult
 * @returns {Object} normalized result receipt
 */
export function assertBenchmarkOperationResult(
  operationDescriptor,
  queryResult,
) {
  const semanticOperation = ownDataValue(
    operationDescriptor,
    'semanticOperation',
  );
  if (isMissingDataValue(semanticOperation)) {
    return {
      status: BENCHMARK_SEMANTIC_STATUS.PASS,
      oracle: null,
      resultObservation: null,
    };
  }
  if (!isPlainDataRecord(semanticOperation)) {
    throw semanticResultError();
  }
  const resultOracle = ownDataValue(semanticOperation, 'resultOracle');
  if (resultOracle === BENCHMARK_RESULT_ORACLE_COMMAND_ACKNOWLEDGED) {
    return {
      status: BENCHMARK_SEMANTIC_STATUS.PASS,
      oracle: BENCHMARK_RESULT_ORACLE_COMMAND_ACKNOWLEDGED,
      resultObservation: buildResultObservation(
        semanticOperation,
        BENCHMARK_RESULT_ORACLE_COMMAND_ACKNOWLEDGED,
      ),
    };
  }
  if (resultOracle !== BENCHMARK_RESULT_ORACLE_SINGLE_COUNT_ROW) {
    throw semanticResultError();
  }
  const rows = rowsFromResult(queryResult);
  if (!rows || rows.length !== BENCHMARK_SEMANTIC_ONE) {
    throw semanticResultError();
  }
  const row = rows[BENCHMARK_SEMANTIC_ZERO];
  if (!isPlainDataRecord(row)) {
    throw semanticResultError();
  }
  const snakeCaseCount = ownDataValue(row, 'matched_count');
  const camelCaseCount = ownDataValue(row, 'matchedCount');
  const rawCount = !isMissingDataValue(snakeCaseCount) ?
    snakeCaseCount :
    camelCaseCount;
  const count = normalizeResultCount(rawCount);
  if (count === null) {
    throw semanticResultError();
  }
  return {
    status: BENCHMARK_SEMANTIC_STATUS.PASS,
    oracle: BENCHMARK_RESULT_ORACLE_SINGLE_COUNT_ROW,
    normalizedRows: [{matchedCount: count}],
    resultObservation: buildResultObservation(semanticOperation, count),
  };
}

function copyAndSortObservations(observations) {
  if (!isDenseDataArray(observations)) {
    throw new TypeError(SEMANTIC_ERROR.OBSERVATIONS_DENSE);
  }
  const sorted = [];
  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index];
    if (!isValidResultObservation(observation)) {
      throw new TypeError(SEMANTIC_ERROR.OBSERVATION_INVALID);
    }
    appendOwnArrayValue(sorted, {
      operationId: observation.operationId,
      operation: observation.operation,
      outcome: observation.outcome,
    });
  }
  sortObservationsByOperationId(sorted);
  assertUniqueObservationIds(sorted);
  return sorted;
}

function sortObservationsByOperationId(sorted) {
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    let insertionIndex = index;
    while (
      insertionIndex > 0 &&
      sorted[insertionIndex - 1].operationId > current.operationId
    ) {
      sorted[insertionIndex] = sorted[insertionIndex - 1];
      insertionIndex -= 1;
    }
    sorted[insertionIndex] = current;
  }
}

function assertUniqueObservationIds(sorted) {
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index - 1].operationId === sorted[index].operationId) {
      throw new TypeError(SEMANTIC_ERROR.OBSERVATION_DUPLICATE);
    }
  }
}

export function buildBenchmarkResultSetEvidence(observations) {
  const sorted = copyAndSortObservations(observations);
  return {
    observationCount: sorted.length,
    digest: digestBenchmarkSemanticData(sorted),
  };
}

function isCanonicalResultSetEvidence(value) {
  return hasExactOwnDataKeys(value, RESULT_SET_KEYS) &&
    isNonNegativeSafeInteger(value.observationCount) &&
    isSha256Digest(value.digest);
}

function isCanonicalDurabilityReceipt(value) {
  if (!hasExactOwnDataKeys(value, DURABILITY_KEYS)) {
    return false;
  }
  const missingIds = copyDenseStringArray(value.missingIds);
  return (
    (
      value.status === BENCHMARK_SEMANTIC_STATUS.PASS ||
      value.status === BENCHMARK_SEMANTIC_STATUS.FAIL
    ) &&
    isNonNegativeSafeInteger(value.expected) &&
    isNonNegativeSafeInteger(value.observed) &&
    missingIds !== null &&
    (value.reason === null || typeof value.reason === 'string')
  );
}

function durabilityEvidencePassed(value) {
  return isCanonicalDurabilityReceipt(value) &&
    value.status === BENCHMARK_SEMANTIC_STATUS.PASS &&
    value.expected > BENCHMARK_SEMANTIC_ZERO &&
    value.observed === value.expected &&
    value.missingIds.length === BENCHMARK_SEMANTIC_ZERO &&
    value.reason === null;
}

function isCanonicalRejectedByReason(value) {
  return hasExactOwnDataKeys(value, REJECTED_REASON_KEYS) &&
    isNonNegativeSafeInteger(value.queueFull) &&
    isNonNegativeSafeInteger(value.flowControl) &&
    isNonNegativeSafeInteger(value.admission);
}

function isCanonicalExecutionAccounting(value) {
  if (
    !hasExactOwnDataKeys(value, ACCOUNTING_KEYS) ||
    !isCanonicalRejectedByReason(value.rejectedByReason)
  ) {
    return false;
  }
  for (let index = 0; index < ACCOUNTING_KEYS.length - 1; index += 1) {
    if (!isNonNegativeSafeInteger(value[ACCOUNTING_KEYS[index]])) {
      return false;
    }
  }
  return true;
}

function executionAccountingReconciles(value) {
  if (!isCanonicalExecutionAccounting(value)) {
    return false;
  }
  const reasons = value.rejectedByReason;
  return value.rejected ===
      reasons.queueFull + reasons.flowControl + reasons.admission &&
    value.queueOverflow === reasons.queueFull &&
    value.offered ===
      value.dispatched +
      reasons.queueFull +
      reasons.flowControl +
      value.undispatched &&
    value.dispatched ===
      value.correct +
      value.timedOut +
      value.errored +
      reasons.admission +
      value.cancelled;
}

function normalizeReceiptCount(value, field) {
  if (!isNonNegativeSafeInteger(value)) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function resolveSemanticStatus(passed) {
  return passed ?
    BENCHMARK_SEMANTIC_STATUS.PASS :
    BENCHMARK_SEMANTIC_STATUS.FAIL;
}

function compilationEvidencePassed(compiledOperations, successfulOperations) {
  return compiledOperations >= successfulOperations &&
    compiledOperations > BENCHMARK_SEMANTIC_ZERO;
}

function resultSetEvidencePassed({
  validatedOperations,
  successfulOperations,
  oracleFailures,
  resultSet,
}) {
  return validatedOperations === successfulOperations &&
    successfulOperations > BENCHMARK_SEMANTIC_ZERO &&
    oracleFailures === BENCHMARK_SEMANTIC_ZERO &&
    resultSet.observationCount === successfulOperations;
}

function errorEvidencePassed(accounting, successfulOperations) {
  return executionAccountingReconciles(accounting) &&
    accounting.correct === successfulOperations;
}

function allSemanticDimensionsPassed(dimensions) {
  for (let index = 0; index < RECEIPT_DIMENSION_KEYS.length; index += 1) {
    if (dimensions[RECEIPT_DIMENSION_KEYS[index]] !== true) {
      return false;
    }
  }
  return true;
}

export function buildBenchmarkSemanticReceipt(options = {}) {
  if (!isPlainDataRecord(options)) {
    throw new TypeError(SEMANTIC_ERROR.RECEIPT_OPTIONS);
  }
  const dialect = ownDataValue(options, 'dialect');
  const compiledOperations = normalizeReceiptCount(
    ownDataValue(options, 'compiledOperations'),
    'compiledOperations',
  );
  const validatedOperations = normalizeReceiptCount(
    ownDataValue(options, 'validatedOperations'),
    'validatedOperations',
  );
  const successfulOperations = normalizeReceiptCount(
    ownDataValue(options, 'successfulOperations'),
    'successfulOperations',
  );
  const configuredOracleFailures = ownDataValue(options, 'oracleFailures');
  const oracleFailures = normalizeReceiptCount(
    isMissingDataValue(configuredOracleFailures) ?
      BENCHMARK_SEMANTIC_ZERO :
      configuredOracleFailures,
    'oracleFailures',
  );
  const resultSet = ownDataValue(options, 'resultSet');
  const accounting = ownDataValue(options, 'accounting');
  const durability = ownDataValue(options, 'durability');
  if (
    !isCanonicalResultSetEvidence(resultSet) ||
    !isCanonicalExecutionAccounting(accounting) ||
    !isCanonicalDurabilityReceipt(durability)
  ) {
    throw new TypeError(SEMANTIC_ERROR.RUNTIME_EVIDENCE);
  }
  const contract = buildSemanticContract(dialect);
  const compilationPassed = compilationEvidencePassed(
    compiledOperations,
    successfulOperations,
  );
  const resultSetPassed = resultSetEvidencePassed({
    validatedOperations,
    successfulOperations,
    oracleFailures,
    resultSet,
  });
  const orderingPassed = resultSetPassed && isSha256Digest(resultSet.digest);
  const transactionPassed = compilationPassed;
  const consistencyPassed = resultSetPassed;
  const durabilityPassed = durabilityEvidencePassed(durability);
  const errorBehaviorPassed = errorEvidencePassed(
    accounting,
    successfulOperations,
  );
  const dimensionPasses = {
    resultSet: resultSetPassed,
    ordering: orderingPassed,
    transaction: transactionPassed,
    consistency: consistencyPassed,
    durability: durabilityPassed,
    errorBehavior: errorBehaviorPassed,
  };
  const passed = allSemanticDimensionsPassed(dimensionPasses);
  const receipt = {
    ...contract,
    status: resolveSemanticStatus(passed),
    dimensions: {
      resultSet: resolveSemanticStatus(dimensionPasses.resultSet),
      ordering: resolveSemanticStatus(dimensionPasses.ordering),
      transaction: resolveSemanticStatus(dimensionPasses.transaction),
      consistency: resolveSemanticStatus(dimensionPasses.consistency),
      durability: resolveSemanticStatus(dimensionPasses.durability),
      errorBehavior: resolveSemanticStatus(dimensionPasses.errorBehavior),
    },
    compiledOperations,
    validatedOperations,
    successfulOperations,
    oracleFailures,
    resultSet,
    accounting,
    durability,
  };
  return {
    ...receipt,
    receiptDigest: digestBenchmarkSemanticData(receipt),
  };
}

function dimensionsAreComplete(dimensions) {
  if (!hasExactOwnDataKeys(dimensions, RECEIPT_DIMENSION_KEYS)) {
    return false;
  }
  for (let index = 0; index < RECEIPT_DIMENSION_KEYS.length; index += 1) {
    if (
      dimensions[RECEIPT_DIMENSION_KEYS[index]] !==
        BENCHMARK_SEMANTIC_STATUS.PASS
    ) {
      return false;
    }
  }
  return true;
}

function receiptBody(receipt) {
  return {
    version: receipt.version,
    dialect: receipt.dialect,
    throughputBasis: receipt.throughputBasis,
    dimensions: receipt.dimensions,
    contractDigest: receipt.contractDigest,
    status: receipt.status,
    compiledOperations: receipt.compiledOperations,
    validatedOperations: receipt.validatedOperations,
    successfulOperations: receipt.successfulOperations,
    oracleFailures: receipt.oracleFailures,
    resultSet: receipt.resultSet,
    accounting: receipt.accounting,
    durability: receipt.durability,
  };
}

function receiptCountsAreComplete(receipt) {
  return isNonNegativeSafeInteger(receipt.compiledOperations) &&
    isNonNegativeSafeInteger(receipt.validatedOperations) &&
    isNonNegativeSafeInteger(receipt.successfulOperations) &&
    isNonNegativeSafeInteger(receipt.oracleFailures) &&
    compilationEvidencePassed(
      receipt.compiledOperations,
      receipt.successfulOperations,
    ) &&
    receipt.validatedOperations === receipt.successfulOperations &&
    receipt.oracleFailures === BENCHMARK_SEMANTIC_ZERO;
}

function receiptResultSetIsComplete(receipt) {
  return isCanonicalResultSetEvidence(receipt.resultSet) &&
    receipt.resultSet.observationCount === receipt.successfulOperations &&
    receipt.resultSet.observationCount > BENCHMARK_SEMANTIC_ZERO;
}

function receiptAccountingIsComplete(receipt) {
  return executionAccountingReconciles(receipt.accounting) &&
    receipt.accounting.correct === receipt.successfulOperations;
}

function receiptDigestMatches(receipt) {
  if (!isSha256Digest(receipt.receiptDigest)) {
    return false;
  }
  try {
    return digestBenchmarkSemanticData(receiptBody(receipt)) ===
      receipt.receiptDigest;
  } catch {
    return false;
  }
}

export function inspectBenchmarkSemanticReceipt(receipt, expectedDialect) {
  const expectedContract = buildSemanticContract(expectedDialect);
  const shapeValid = hasExactOwnDataKeys(receipt, RECEIPT_KEYS);
  if (!shapeValid) {
    return {
      present: receipt !== null && receipt !== undefined,
      contractMatches: false,
      dialectMatches: false,
      statusPassed: false,
      dimensionsComplete: false,
      evidenceComplete: false,
      digestMatches: false,
      resultSetDigest: null,
    };
  }
  const contractMatches =
    receipt.version === expectedContract.version &&
    receipt.throughputBasis === expectedContract.throughputBasis &&
    receipt.contractDigest === expectedContract.contractDigest;
  const dialectMatches = receipt.dialect === expectedContract.dialect;
  const statusPassed = receipt.status === BENCHMARK_SEMANTIC_STATUS.PASS;
  const dimensionsComplete = dimensionsAreComplete(receipt.dimensions);
  const countsComplete = receiptCountsAreComplete(receipt);
  const resultSetComplete = receiptResultSetIsComplete(receipt);
  const accountingComplete = receiptAccountingIsComplete(receipt);
  const durabilityComplete = durabilityEvidencePassed(receipt.durability);
  const digestMatches = receiptDigestMatches(receipt);
  const evidenceComplete =
    countsComplete &&
    resultSetComplete &&
    accountingComplete &&
    durabilityComplete;
  return {
    present: true,
    contractMatches,
    dialectMatches,
    statusPassed,
    dimensionsComplete,
    evidenceComplete,
    digestMatches,
    resultSetDigest: resultSetComplete ? receipt.resultSet.digest : null,
  };
}

function chunkValues(values, size) {
  const chunks = [];
  for (
    let index = BENCHMARK_SEMANTIC_ZERO;
    index < values.length;
    index += size
  ) {
    const chunk = [];
    const end = Math.min(values.length, index + size);
    for (let chunkIndex = index; chunkIndex < end; chunkIndex += 1) {
      appendOwnArrayValue(chunk, values[chunkIndex]);
    }
    appendOwnArrayValue(chunks, chunk);
  }
  return chunks;
}

function buildVisibilitySql(tableName, ids) {
  let idList = '';
  for (let index = 0; index < ids.length; index += 1) {
    if (index > 0) {
      idList += VISIBILITY_ID_SEPARATOR;
    }
    idList += `'${escapeSqlText(ids[index])}'`;
  }
  return `SELECT event_id AS ${BENCHMARK_VISIBILITY_RESULT_ALIAS} ` +
    `FROM ${tableName} ` +
    `WHERE event_id IN (${idList}) ORDER BY event_id`;
}

/**
 * Verify every acknowledged benchmark write through a post-run observer query.
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function verifyBenchmarkAcknowledgedWrites(options = {}) {
  if (!isPlainDataRecord(options)) {
    throw new TypeError(SEMANTIC_ERROR.DURABILITY_OPTIONS);
  }
  const query = optionalOwnDataValue(options, 'query');
  const tableName = normalizeIdentifier(optionalOwnDataValue(options, 'tableName'));
  const configuredIds = ownDataValue(options, 'ids');
  const ids = copyDenseStringArray(configuredIds);
  if (ids === null) {
    throw new TypeError(SEMANTIC_ERROR.ACKNOWLEDGED_IDS);
  }
  const normalizedIds = uniqueSortedStrings(ids);
  if (typeof query !== 'function') {
    return buildDurabilityReceipt(
      normalizedIds,
      [],
      BENCHMARK_DURABILITY_OBSERVER_MISSING,
    );
  }
  const observedIds = await collectObservedWriteIds(
    query,
    tableName,
    normalizedIds,
  );
  return buildDurabilityReceipt(normalizedIds, observedIds);
}

async function collectObservedWriteIds(query, tableName, ids) {
  const observed = [];
  const chunks = chunkValues(ids, BENCHMARK_VISIBILITY_CHUNK_SIZE);
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const result = await query(buildVisibilitySql(tableName, chunks[chunkIndex]));
    const rows = rowsFromResult(result);
    if (!rows) {
      throw new TypeError(SEMANTIC_ERROR.OBSERVER_ROWS);
    }
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      if (!isPlainDataRecord(row)) {
        throw new TypeError(SEMANTIC_ERROR.OBSERVER_ROW);
      }
      const snakeCaseId = ownDataValue(row, 'event_id');
      const camelCaseId = ownDataValue(row, 'eventId');
      const eventId = !isMissingDataValue(snakeCaseId) ?
        snakeCaseId :
        camelCaseId;
      if (typeof eventId !== 'string' || eventId.length === 0) {
        throw new TypeError(SEMANTIC_ERROR.OBSERVER_ID);
      }
      appendOwnArrayValue(observed, eventId);
    }
  }
  return uniqueSortedStrings(observed);
}

function buildDurabilityReceipt(ids, observedIds, forcedReason = null) {
  const observed = objectCreate(null);
  for (let index = 0; index < observedIds.length; index += 1) {
    observed[observedIds[index]] = true;
  }
  const missingIds = [];
  for (let index = 0; index < ids.length; index += 1) {
    if (!objectHasOwn(observed, ids[index])) {
      appendOwnArrayValue(missingIds, ids[index]);
    }
  }
  const passed =
    forcedReason === null &&
    ids.length > BENCHMARK_SEMANTIC_ZERO &&
    missingIds.length === BENCHMARK_SEMANTIC_ZERO;
  return {
    status: resolveSemanticStatus(passed),
    expected: ids.length,
    observed: observedIds.length,
    missingIds,
    reason: forcedReason ||
      (passed ? null : BENCHMARK_ACKNOWLEDGED_WRITES_NOT_VISIBLE),
  };
}

export function getBenchmarkSemanticContract(dialect) {
  return buildSemanticContract(dialect);
}
