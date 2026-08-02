import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  MIGRATION_PARTITION_OPERATION,
  QUERY_EXECUTOR_LITERAL,
  QUERY_MESSAGE_FIELD_ENTRY_ID,
  QUERY_MESSAGE_FIELD_IDEMPOTENCY_KEY,
  QUERY_MESSAGE_FIELD_MIGRATION_ID,
  QUERY_MESSAGE_FIELD_MIGRATION_OPERATION,
  QUERY_MESSAGE_FIELD_OPERATION_ID,
  QUERY_MESSAGE_FIELD_SESSION_ID,
  QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN,
  QUERY_MESSAGE_TYPE,
} = QUERY_EXECUTOR_SHARED;

const QUERY_RESULT_REQUEST_FIELD = Object.freeze({
  DEADLINE_MS: 'resultDeadlineMs',
  MAX_BYTES: 'resultMaxBytes',
  MAX_ROWS: 'resultMaxRows',
});

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

function createDefaultPartitionRequestBuilder({
  executionOptions,
  params,
  sql,
}) {
  return () => {
    const request = {
      type: QUERY_MESSAGE_TYPE.QUERY,
      sql,
      params,
    };
    if (
      typeof executionOptions.sessionId ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      executionOptions.sessionId.length > 0
    ) {
      request[QUERY_MESSAGE_FIELD_SESSION_ID] = executionOptions.sessionId;
    }
    if (
      typeof executionOptions.entryId ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      executionOptions.entryId.length > 0
    ) {
      request[QUERY_MESSAGE_FIELD_ENTRY_ID] = executionOptions.entryId;
    }
    if (
      typeof executionOptions.operationId ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      executionOptions.operationId.length > 0
    ) {
      request[QUERY_MESSAGE_FIELD_OPERATION_ID] = executionOptions.operationId;
    }
    if (
      typeof executionOptions.idempotencyKey ===
        QUERY_EXECUTOR_LITERAL.STRING_STRING &&
      executionOptions.idempotencyKey.length > 0
    ) {
      request[QUERY_MESSAGE_FIELD_IDEMPOTENCY_KEY] =
        executionOptions.idempotencyKey;
    }
    if (executionOptions.splitMirrorOrigin) {
      request[QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN] =
        executionOptions.splitMirrorOrigin;
    }
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
    copyQueryResultLimits(request, executionOptions);
    return request;
  };
}

function resolvePartitionExecutionBuilders({
  executionOptions = {},
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
        params,
        sql,
      });
  const isSuccessfulResponse =
    typeof executionOptions.isSuccessfulResponse ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION ?
      executionOptions.isSuccessfulResponse :
      (response) => response?.acknowledged && response?.success;
  const buildSuccessResult =
    typeof executionOptions.buildSuccessResult ===
      QUERY_EXECUTOR_LITERAL.STRING_FUNCTION ?
      executionOptions.buildSuccessResult :
      (response) => ({
        partitionId,
        success: true,
        rows: response.rows || [],
        changes: response.changes,
        durableCommitWitness: response.durableCommitWitness,
        acceptingNodeId: response.acceptingNodeId,
        acknowledgedAtMs: response.acknowledgedAtMs,
        readAuthorityWitness: response.readAuthorityWitness,
      });
  return Object.freeze({
    buildRequest,
    buildSuccessResult,
    isSuccessfulResponse,
  });
}

export {resolvePartitionExecutionBuilders};
