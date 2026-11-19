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
  materializeAndPresentRowObjects,
  presentRawSqlRows,
} from './sql-value-presentation.js';

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

const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function toJsonSafeParams(params) {
  if (!Array.isArray(params)) return params;
  if (!params.some((value) => typeof value === 'bigint')) {
    return params;
  }
  return params.map((value) => {
    if (typeof value === 'bigint') {
      return value >= MIN_SAFE_BIGINT && value <= MAX_SAFE_BIGINT ?
        Number(value) :
        value.toString();
    }
    return value;
  });
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

function createDefaultPartitionRequestBuilder({
  executionOptions,
  forRead = false,
  params,
  partitionId = null,
  sql,
}) {
  const shouldEncodeTypedParams =
    forRead === true &&
    !executionOptions?.transactionIdentity &&
    Array.isArray(params);
  const preEncodedTypedParams = shouldEncodeTypedParams ?
    encodeTypedParams(params) :
    null;
  const jsonSafeParams = toJsonSafeParams(params);

  return () => {
    const request = {
      type: QUERY_MESSAGE_TYPE.QUERY,
      sql,
      params: jsonSafeParams,
      ...(preEncodedTypedParams ? {typedParams: preEncodedTypedParams} : {}),
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

function decodePartitionResponseRows(response, executionOptions) {
  const safeIntegers = executionOptions?.safeIntegers === true;
  if (response.rowSet !== undefined && response.rowSet !== null) {
    const decoded = decodeTypedRowSet(response.rowSet);
    const byteLength = typedRowSetByteLength(response.rowSet);
    return {
      rows: materializeAndPresentRowObjects(decoded.columns, decoded.rows, {
        safeIntegers,
      }),
      rawRows: presentRawSqlRows(decoded.rows, {safeIntegers}),
      columns: decoded.columns,
      rowSet: response.rowSet,
      byteLength,
    };
  }
  return {
    rows: response.rows || [],
    rawRows: null,
    columns: null,
    rowSet: null,
    byteLength: 0,
  };
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
        return {
          partitionId,
          success: true,
          rows: decodedPayload.rows,
          ...(decodedPayload.rawRows ? {rawRows: decodedPayload.rawRows} : {}),
          ...(decodedPayload.columns ? {columns: decodedPayload.columns} : {}),
          ...(decodedPayload.rowSet ? {rowSet: decodedPayload.rowSet} : {}),
          ...(decodedPayload.byteLength > 0 ?
            {byteLength: decodedPayload.byteLength} :
            {}),
          ...(response.executionEnvelope ?
            {executionEnvelope: response.executionEnvelope} :
            {}),
          changes: response.changes,
          ...(typeof response.rowSetComplete === 'boolean' ?
            {rowSetComplete: response.rowSetComplete} :
            {}),
          ...(response.partial === true ? {partial: true} : {}),
          ...(response.settledReplay === undefined ? {} :
            {settledReplay: response.settledReplay}),
          durableCommitWitness: response.durableCommitWitness,
          originHlc: response.originHlc,
          acceptingNodeId: response.acceptingNodeId,
          acknowledgedAtMs: response.acknowledgedAtMs,
          readAuthorityWitness: response.readAuthorityWitness,
          ...(response.authoritativeObservation ?
            {authoritativeObservation: response.authoritativeObservation} :
            {}),
        };
      };
  return Object.freeze({
    buildRequest,
    buildSuccessResult,
    isSuccessfulResponse,
  });
}

export {createDefaultPartitionRequestBuilder, resolvePartitionExecutionBuilders};
