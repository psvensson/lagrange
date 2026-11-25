import {
  deliveryAnswerOf,
  deliveryTransportOf,
  isDeliveredTransportDeliveryOutcome,
} from '../transport/transport-semantic-outcome.js';
import {
  statementParticipantFieldsOf,
} from './distributed/distributed-transaction-identity.js';
import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {QUERY_RESULT_REQUEST_FIELD} from './query-result-budget.js';
import {STATEMENT_INGRESS_FIELD} from './sql-statement-ingress.js';
import {
  SqlValueCodecError,
  decodeTypedRowSet,
  encodeTypedParams,
  typedRowSetByteLength,
} from './sql-value-codec.js';
import {
  defineLazyRowObjectsGetter,
  materializeAndPresentRowObjects,
  presentSqlValue,
} from './sql-value-presentation.js';
import {
  estimateJsonStringChars,
  estimateJsonValueChars,
  stampPresentedRowCollection,
} from './distributed/parallel-query-execution-metrics.js';
import {CONTROL_PLANE_READ_LEADER_MODE} from
  '../control-plane/control-plane-system-table-gateway-constants.js';
import {LEADER_READ_REQUEST_FIELD, leaderReadRequestOf} from
  '../control-plane/control-plane-owner-fact-read-contract.js';

const {
  MIGRATION_PARTITION_OPERATION,
  QUERY_EXECUTOR_LITERAL,
  QUERY_MESSAGE_FIELD_ENTRY_ID,
  QUERY_MESSAGE_FIELD_EXPECTED_PARTITION_VERSION,
  QUERY_MESSAGE_FIELD_IDEMPOTENCY_KEY,
  QUERY_MESSAGE_FIELD_MIGRATION_ID,
  QUERY_MESSAGE_FIELD_MIGRATION_OPERATION,
  QUERY_MESSAGE_FIELD_OPERATION_ID,
  QUERY_MESSAGE_FIELD_SESSION_ID,
  QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN,
  QUERY_MESSAGE_TYPE,
} = QUERY_EXECUTOR_SHARED;

function hasTypedWireParameter(params) {
  return Array.isArray(params) &&
    params.some((value) => typeof value === 'bigint' || ArrayBuffer.isView(value));
}

function copySafeResultLimit(request, field, value) {
  if (Number.isSafeInteger(value) && value >= 0) {
    request[field] = value;
  }
}

function copyQueryResultLimits(request, executionOptions) {
  copySafeResultLimit(
    request,
    QUERY_RESULT_REQUEST_FIELD.MAX_BYTES,
    executionOptions.resultMaxBytes,
  );
  copySafeResultLimit(
    request,
    QUERY_RESULT_REQUEST_FIELD.MAX_ROWS,
    executionOptions.resultMaxRows,
  );
  copySafeResultLimit(
    request,
    QUERY_RESULT_REQUEST_FIELD.DEADLINE_MS,
    executionOptions.timeoutBudget?.deadlineMs,
  );
}

function stampOptionalStringField(request, field, value) {
  if (typeof value === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      value.length > 0) {
    request[field] = value;
  }
}

function stampMigrationIdentityFields(request, executionOptions) {
  if (
    executionOptions.migrationOperation ===
      MIGRATION_PARTITION_OPERATION.ALTER_TABLE
  ) {
    request[QUERY_MESSAGE_FIELD_MIGRATION_OPERATION] =
      executionOptions.migrationOperation;
    if (executionOptions.migrationId) {
      request[QUERY_MESSAGE_FIELD_MIGRATION_ID] =
        executionOptions.migrationId;
    }
  }
}

// A statement of an open transaction carries the transaction's identity to
// the participant it reaches (TX1 seam A): the participantId names this
// request's partition.
function stampTransactionIdentityFields(request, executionOptions,
  partitionId) {
  const identity = executionOptions.transactionIdentity;
  if (identity && typeof partitionId === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      partitionId.length > 0) {
    Object.assign(request, statementParticipantFieldsOf(identity,
      partitionId));
  }
}

// A leader-REQUIRED read is decided by its receiver: the request names the
// leader-qualified read (and, for readOwnerFact, its read point floor), and a
// replica that may not serve it refuses typed, with no rows.
function leaderReadFieldOf(executionOptions, forRead) {
  const requiresLeader =
    executionOptions?.requireLeader === true ||
    executionOptions?.readAuthority?.leaderMode ===
      CONTROL_PLANE_READ_LEADER_MODE.REQUIRED;
  return forRead === true && requiresLeader ?
    {[LEADER_READ_REQUEST_FIELD]: leaderReadRequestOf(
      executionOptions.ownerFactFloor)} :
    {};
}

function createDefaultPartitionRequestBuilder({
  executionOptions,
  forRead = false,
  params,
  partitionId = null,
  sql,
}) {
  const leaderReadField = leaderReadFieldOf(executionOptions, forRead);
  const shouldEncodeTypedParams =
    !executionOptions?.transactionIdentity &&
    Array.isArray(params);
  const preEncodedTypedParams = shouldEncodeTypedParams ?
    encodeTypedParams(params) :
    null;
  const wireParams =
    preEncodedTypedParams && hasTypedWireParameter(params) ?
      preEncodedTypedParams.cells :
      params;

  return () => {
    const request = {
      type: QUERY_MESSAGE_TYPE.QUERY,
      sql,
      params: wireParams,
      ...(preEncodedTypedParams ? {typedParams: preEncodedTypedParams} : {}),
      ...leaderReadField,
    };
    stampOptionalStringField(
      request, QUERY_MESSAGE_FIELD_SESSION_ID, executionOptions.sessionId);
    stampTransactionIdentityFields(request, executionOptions, partitionId);
    stampOptionalStringField(
      request, QUERY_MESSAGE_FIELD_ENTRY_ID, executionOptions.entryId);
    stampOptionalStringField(
      request, QUERY_MESSAGE_FIELD_OPERATION_ID, executionOptions.operationId);
    stampOptionalStringField(
      request, QUERY_MESSAGE_FIELD_IDEMPOTENCY_KEY,
      executionOptions.idempotencyKey);
    if (executionOptions.splitMirrorOrigin) {
      request[QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN] =
        executionOptions.splitMirrorOrigin;
    }
    stampOptionalStringField(
      request, STATEMENT_INGRESS_FIELD,
      executionOptions[STATEMENT_INGRESS_FIELD]);
    stampMigrationIdentityFields(request, executionOptions);
    if (Number.isSafeInteger(executionOptions.expectedPartitionVersion) &&
        executionOptions.expectedPartitionVersion > 0) {
      request[QUERY_MESSAGE_FIELD_EXPECTED_PARTITION_VERSION] =
        executionOptions.expectedPartitionVersion;
    }
    copyQueryResultLimits(request, executionOptions);
    return request;
  };
}

const LAZY_ROWS_GETTER_SYMBOL_KEY = 'lagrange.query.lazyRowsGetter';
const LAZY_ROWS_GETTER_SYMBOL = Symbol.for(LAZY_ROWS_GETTER_SYMBOL_KEY);
const UTF16_BYTES_PER_CHAR = 2;

function presentDecodedRowsInPlaceAndMeasureBytes(columns, rawRows, safeIntegers) {
  const colCount = Array.isArray(columns) ? columns.length : 0;
  const lastIndexByCol = new Map();
  for (let c = 0; c < colCount; c += 1) {
    lastIndexByCol.set(String(columns[c]), c);
  }
  const isWinningCol = new Array(colCount);
  let baseRowChars = 2 + Math.max(0, lastIndexByCol.size - 1);
  for (let c = 0; c < colCount; c += 1) {
    const colName = String(columns[c]);
    const wins = lastIndexByCol.get(colName) === c;
    isWinningCol[c] = wins;
    if (wins) {
      baseRowChars += estimateJsonStringChars(colName) + 1;
    }
  }
  const presentationOptions = {safeIntegers};
  let totalChars = rawRows.length > 0 ? 2 + (rawRows.length - 1) : 0;
  for (let r = 0; r < rawRows.length; r += 1) {
    const row = rawRows[r];
    let rowChars = baseRowChars;
    for (let c = 0; c < colCount; c += 1) {
      const cell = row[c] === undefined ? null : row[c];
      const presented = safeIntegers ?
        cell :
        presentSqlValue(cell, presentationOptions);
      row[c] = presented;
      if (isWinningCol[c]) {
        rowChars += estimateJsonValueChars(presented);
      }
    }
    totalChars += rowChars;
  }
  const residentBytes = rawRows.length === 0 ?
    0 :
    totalChars * UTF16_BYTES_PER_CHAR;
  stampPresentedRowCollection(rawRows, safeIntegers, residentBytes);
  return residentBytes;
}

function materializePresentedRowObjects(
  columns,
  rawRows,
  safeIntegers,
  residentBytes,
) {
  return materializeAndPresentRowObjects(columns, rawRows, {
    safeIntegers,
    residentBytes,
    alreadyPresented: true,
  });
}

function attachLazyRowsProperty(target, getRows) {
  return defineLazyRowObjectsGetter(target, getRows);
}

function decodePartitionResponseRows(response, executionOptions) {
  const safeIntegers = executionOptions?.safeIntegers === true;
  if (response.rowSet !== undefined && response.rowSet !== null) {
    const decoded = decodeTypedRowSet(response.rowSet);
    const byteLength = typedRowSetByteLength(response.rowSet);
    const residentBytes = presentDecodedRowsInPlaceAndMeasureBytes(
      decoded.columns,
      decoded.rows,
      safeIntegers,
    );
    let cachedRows = null;
    const getRows = () => {
      if (cachedRows === null) {
        cachedRows = materializePresentedRowObjects(
          decoded.columns,
          decoded.rows,
          safeIntegers,
          residentBytes,
        );
      }
      return cachedRows;
    };
    return attachLazyRowsProperty({
      rawRows: decoded.rows,
      columns: decoded.columns,
      rowSet: response.rowSet,
      byteLength,
      residentBytes,
    }, getRows);
  }
  return {
    rows: response.rows || [],
    rawRows: null,
    columns: null,
    rowSet: null,
    byteLength: 0,
  };
}

function copyOptionalDecodedFields(target, decodedPayload) {
  if (decodedPayload.rawRows) target.rawRows = decodedPayload.rawRows;
  if (decodedPayload.columns) target.columns = decodedPayload.columns;
  if (decodedPayload.rowSet) target.rowSet = decodedPayload.rowSet;
  if (decodedPayload.byteLength > 0) target.byteLength = decodedPayload.byteLength;
  if (
    Number.isSafeInteger(decodedPayload.residentBytes) &&
    decodedPayload.residentBytes >= 0
  ) {
    target.residentBytes = decodedPayload.residentBytes;
  }
}

function copyOptionalResponseFields(target, response) {
  if (response.executionEnvelope) {
    target.executionEnvelope = response.executionEnvelope;
  }
  if (typeof response.rowSetComplete === 'boolean') {
    target.rowSetComplete = response.rowSetComplete;
  }
  if (response.partial === true) target.partial = true;
  if (response.settledReplay !== undefined) {
    target.settledReplay = response.settledReplay;
  }
  if (response.authoritativeObservation) {
    target.authoritativeObservation = response.authoritativeObservation;
  }
  if (Number.isSafeInteger(response.readGeneration)) {
    target.readGeneration = response.readGeneration;
  }
}

function buildDecodedPartitionSuccessResult(partitionId, response, decodedPayload) {
  const lazyGetRows = decodedPayload?.[LAZY_ROWS_GETTER_SYMBOL];
  const hasLazyRows =
    typeof lazyGetRows === QUERY_EXECUTOR_LITERAL.STRING_FUNCTION;
  const result = {
    partitionId,
    success: true,
    ...(hasLazyRows ? {} : {rows: decodedPayload.rows}),
    changes: response.changes,
    durableCommitWitness: response.durableCommitWitness,
    originHlc: response.originHlc,
    acceptingNodeId: response.acceptingNodeId,
    acknowledgedAtMs: response.acknowledgedAtMs,
    readAuthorityWitness: response.readAuthorityWitness,
  };
  copyOptionalDecodedFields(result, decodedPayload);
  copyOptionalResponseFields(result, response);
  return hasLazyRows ? attachLazyRowsProperty(result, lazyGetRows) : result;
}

function resolvePartitionExecutionBuilders({
  executionOptions = {},
  forRead = false,
  params,
  partitionId,
  sql,
}) {
  const buildRequest =
    typeof executionOptions.buildRequest ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION ?
      executionOptions.buildRequest :
      createDefaultPartitionRequestBuilder({
        executionOptions,
        forRead,
        params,
        partitionId,
        sql,
      });
  const isSuccessfulResponse =
    typeof executionOptions.isSuccessfulResponse ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION ?
      executionOptions.isSuccessfulResponse :
      (delivery) => isDeliveredTransportDeliveryOutcome(deliveryTransportOf(delivery)) &&
        deliveryAnswerOf(delivery)?.success;
  const buildSuccessResult =
    typeof executionOptions.buildSuccessResult ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION ?
      executionOptions.buildSuccessResult :
      (response) => {
        let decodedPayload;
        try {
          decodedPayload = decodePartitionResponseRows(response, executionOptions);
        } catch (error) {
          if (error instanceof SqlValueCodecError) {
            return {
              partitionId,
              success: false,
              error: error.message,
              errorCode: error.code,
            };
          }
          throw error;
        }
        return buildDecodedPartitionSuccessResult(partitionId, response, decodedPayload);
      };
  return Object.freeze({
    buildRequest,
    buildSuccessResult,
    isSuccessfulResponse,
  });
}

export {
  createDefaultPartitionRequestBuilder,
  decodePartitionResponseRows,
  resolvePartitionExecutionBuilders,
};
