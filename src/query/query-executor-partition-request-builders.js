import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {CDC_COVERAGE_QUERY_FIELD} from '../cdc/cdc-coverage-protocol.js';

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

const CDC_COVERAGE_STRING_FIELDS = Object.freeze([
  CDC_COVERAGE_QUERY_FIELD.EXPECTED_SCOPE_ID,
  CDC_COVERAGE_QUERY_FIELD.MODE,
  CDC_COVERAGE_QUERY_FIELD.RECONCILE_GENERATION_ID,
  CDC_COVERAGE_QUERY_FIELD.REQUEST_ID,
  CDC_COVERAGE_QUERY_FIELD.TARGET_LIFECYCLE_ID,
  CDC_COVERAGE_QUERY_FIELD.TARGET_NODE_ID,
  CDC_COVERAGE_QUERY_FIELD.TRANSFER_ID,
]);

function stampCdcCoverageFields(request, executionOptions) {
  if (executionOptions[CDC_COVERAGE_QUERY_FIELD.COMPLETE] !== true) return;
  request[CDC_COVERAGE_QUERY_FIELD.COMPLETE] = true;
  for (const field of CDC_COVERAGE_STRING_FIELDS) {
    stampOptionalStringField(request, field, executionOptions[field]);
  }
  const pageStart = executionOptions[CDC_COVERAGE_QUERY_FIELD.PAGE_START];
  if (typeof pageStart === 'string') {
    request[CDC_COVERAGE_QUERY_FIELD.PAGE_START] = pageStart;
  }
  copySafeResultLimit(request, CDC_COVERAGE_QUERY_FIELD.CHUNK_ORDINAL,
    executionOptions[CDC_COVERAGE_QUERY_FIELD.CHUNK_ORDINAL]);
  copySafeResultLimit(request, CDC_COVERAGE_QUERY_FIELD.DEADLINE_MS,
    executionOptions[CDC_COVERAGE_QUERY_FIELD.DEADLINE_MS]);
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
    stampOptionalStringField(
      request, QUERY_MESSAGE_FIELD_SESSION_ID, executionOptions.sessionId);
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
    stampMigrationIdentityFields(request, executionOptions);
    // Write-path epoch fencing: carry the partition epoch the write was
    // planned against so the partition boundary can reject stale-epoch
    // writes with a typed outcome.
    if (Number.isSafeInteger(executionOptions.expectedPartitionVersion) &&
        executionOptions.expectedPartitionVersion > 0) {
      request[QUERY_MESSAGE_FIELD_EXPECTED_PARTITION_VERSION] =
        executionOptions.expectedPartitionVersion;
    }
    copyQueryResultLimits(request, executionOptions);
    stampCdcCoverageFields(request, executionOptions);
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
        ...(response.settledReplay === undefined ? {} :
          {settledReplay: response.settledReplay}),
        durableCommitWitness: response.durableCommitWitness,
        originHlc: response.originHlc,
        acceptingNodeId: response.acceptingNodeId,
        acknowledgedAtMs: response.acknowledgedAtMs,
        readAuthorityWitness: response.readAuthorityWitness,
        ...(response.state === undefined ? {} : {
          state: response.state,
          sourceScope: response.sourceScope,
          sourcePrefix: response.sourcePrefix,
          sourceLifecycle: response.sourceLifecycle,
          logicalCoverage: response.logicalCoverage,
          observationDigest: response.observationDigest,
          nextPageStart: response.nextPageStart,
          transferId: response.transferId,
          requestId: response.requestId,
          targetNodeId: response.targetNodeId,
          targetLifecycleId: response.targetLifecycleId,
          reconcileGenerationId: response.reconcileGenerationId,
          deadlineMs: response.deadlineMs,
          totalBytes: response.totalBytes,
          chunkBytes: response.chunkBytes,
          chunkCount: response.chunkCount,
          chunkOrdinal: response.chunkOrdinal,
          chunkDigest: response.chunkDigest,
          dataBase64: response.dataBase64,
          payloadDigest: response.payloadDigest,
          rowKey: response.rowKey,
          domain: response.domain,
        }),
      });
  return Object.freeze({
    buildRequest,
    buildSuccessResult,
    isSuccessfulResponse,
  });
}

export {createDefaultPartitionRequestBuilder, resolvePartitionExecutionBuilders};
