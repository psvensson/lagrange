import {STATEMENT_INGRESS_FIELD} from './sql-statement-ingress.js';
import {QUERY_EXECUTOR_SHARED} from './query-executor-shared.js';
import {QUERY_RESULT_REQUEST_FIELD} from './query-result-budget.js';
import {deliveryTransportOf, deliveryAnswerOf, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';
import {statementParticipantFieldsOf} from
  './distributed/distributed-transaction-identity.js';

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
  params,
  partitionId = null,
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
    // Write-path epoch fencing: carry the partition epoch the write was
    // planned against so the partition boundary can reject stale-epoch
    // writes with a typed outcome.
    if (Number.isSafeInteger(executionOptions.expectedPartitionVersion) &&
        executionOptions.expectedPartitionVersion > 0) {
      request[QUERY_MESSAGE_FIELD_EXPECTED_PARTITION_VERSION] =
        executionOptions.expectedPartitionVersion;
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
      });
  return Object.freeze({
    buildRequest,
    buildSuccessResult,
    isSuccessfulResponse,
  });
}

export {createDefaultPartitionRequestBuilder, resolvePartitionExecutionBuilders};
