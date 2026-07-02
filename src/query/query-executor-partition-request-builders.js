import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';

const {
  MIGRATION_PARTITION_OPERATION,
  QUERY_EXECUTOR_LITERAL,
  QUERY_MESSAGE_FIELD_MIGRATION_ID,
  QUERY_MESSAGE_FIELD_MIGRATION_OPERATION,
  QUERY_MESSAGE_FIELD_SESSION_ID,
  QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN,
  QUERY_MESSAGE_TYPE,
} = QUERY_EXECUTOR_SHARED;

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
      });
  return Object.freeze({
    buildRequest,
    buildSuccessResult,
    isSuccessfulResponse,
  });
}

export {resolvePartitionExecutionBuilders};
