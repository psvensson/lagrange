/**
 * Query Executor - Executes queries across partitions in parallel.
 * Implements parallel query execution and result aggregation.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 7.2, 7.4, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7
 */

import { LoggingService } from "../logging/logging-service.js";
import { HLCClockService } from "../hlc/hlc-clock-service.js";
import { ConfigurationManager } from "../config/configuration-manager.js";
import {
  COLUMN,
  ERRORS,
  LOG_MSG,
  METRICS_LOG_TAG,
  NUM,
  SQL,
  TABLES,
  SERVICE_STATUS,
  SERVICE_TYPE,
} from "../constants/index.js";
import { TRANSPORT_ERROR_MSG } from "../constants/transport.js";
import { RAFT_ROLE } from "../raft/constants.js";
import {
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_JOIN_TYPE,
  QUERY_LOG_MSG,
  QUERY_MESSAGE_TYPE,
  QUERY_OPERATOR,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
  QUERY_AST_NODE,
  QUERY_RESPONSE_TYPE,
  QUERY_SQL,
  QUERY_SUBSYSTEM,
} from "./query-constants.js";
import { PG_EXPR_TYPE } from "./pg/pg-compat-constants.js";
import { DistributedMergeEngine } from "./distributed/distributed-merge-engine.js";
import { ParallelQueryCoordinator } from "./distributed/parallel-query-coordinator.js";
import { DISTRIBUTED_JOIN_STRATEGY } from "./distributed/distributed-query-plan-constants.js";
import { MIGRATION_PARTITION_OPERATION } from "../migration/migration-constants.js";
import {
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
} from "../control-plane/control-plane-readiness-constants.js";
import {
  compactEligibilitySnapshot,
  evaluateEligibilityDecision,
} from "../control-plane/eligibility-snapshot.js";
import { isRetryableControlPlaneError } from "../control-plane/control-plane-error-classification.js";
import { PARTITION_SERVICE_ERROR_MSG } from "../partition/partition-service-constants.js";
import { resolveBootstrapLeaderSelection } from "./bootstrap-leader-selection.js";
const QUERY_EXECUTOR_LITERAL = Object.freeze({
  STRING_OBJECT: "object",
  STRING_VALUE: "",
  STRING_VALUE_2: "|",
  STRING_STRING: "string",
  STRING_BOOLEAN: "boolean",
  STRING_PINNED: "pinned",
  STRING_UNPINNED: "unpinned",
  STRING_LEFT: "left",
  STRING_RIGHT: "right",
  STRING_SELECT: "SELECT ",
  STRING_DISTINCT: "DISTINCT ",
  STRING_VALUE_3: "*",
  STRING_FUNCTION: "function",
  STRING_ROUTER_CONNECTION_CLOSED: "ROUTER_CONNECTION_CLOSED",
  STRING_CONNECTION_TO_NODE: "Connection to node",
  STRING_CLOSED: "closed",
  STRING_RECONNECTING: "reconnecting",
  STRING_DISCONNECTED: "disconnected",
  STRING_NO_CONNECTION_TO_NODE: "No connection to node",
  STRING_FAILED_TO_FORWARD_WRITE_TO_LEADER: "Failed to forward write to leader",
  STRING_AGGREGATE: "aggregate",
  STRING_COLUMN_REF: "column_ref",
  STRING_STAR: "star",
  STRING_VALUE_4: "?",
  STRING_COUNT: "COUNT",
  STRING_SUM: "SUM",
  STRING_AVG: "AVG",
  STRING_MIN: "MIN",
  STRING_MAX: "MAX",
  STRING_BINARY: "binary",
  STRING_UNARY: "unary",
  STRING_IN: "in",
  STRING_BETWEEN: "between",
  STRING_LIKE: "like",
  STRING_LITERAL: "literal",
  STRING_AND: "AND",
  STRING_OR: "OR",
  STRING_VALUE_5: "=",
  STRING_VALUE_6: "!=",
  STRING_VALUE_7: "<>",
  STRING_VALUE_8: "<",
  STRING_VALUE_9: "<=",
  STRING_VALUE_10: ">",
  STRING_VALUE_11: ">=",
  STRING_IS_NULL: "IS NULL",
  STRING_IS_NOT_NULL: "IS NOT NULL",
  STRING_NOT: "NOT",
  STRING_VALUE_12: "+",
  STRING_VALUE_13: "-",
  STRING_VALUE_14: ", ",
  STRING_NULL: "NULL",
  STRING_NOT_LIKE: "NOT LIKE",
  STRING_LIKE_2: "LIKE",
  STRING_PARAMETER: "parameter",
  STRING_CASE: "CASE",
  STRING_VALUE_15: " ",
  STRING_WHEN: " WHEN ",
  STRING_THEN: " THEN ",
  STRING_ELSE: " ELSE ",
  STRING_END: " END",
  STRING_EXECUTING_INSERT: "Executing INSERT",
  STRING_INSERT: "INSERT",
  STRING_NUMBER: "number",
  STRING_EXECUTING_UPDATE: "Executing UPDATE",
  STRING_EXECUTING_DELETE: "Executing DELETE",
});
const QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN = "splitMirrorOrigin";
const QUERY_MESSAGE_FIELD_MIGRATION_OPERATION = "migrationOperation";
const QUERY_MESSAGE_FIELD_MIGRATION_ID = "migrationId";
const QUERY_MESSAGE_FIELD_SESSION_ID = "sessionId";
const LEADER_GAP_REASON_OWNER_MISSING = "owner_missing";
const LEADER_GAP_REASON_SERVICE_MISSING = "service_missing";
const SYSTEM_TABLE_NAMES = new Set(Object.values(TABLES));
const CONTROL_PLANE_WRITE_RETRY_DECISION_STATE = Object.freeze({
  NONE: "none",
  RETRY_SAME_ADDRESS: "retry_same_address",
  DEFER_PARTITION_RETRY: "defer_partition_retry",
  WIDEN_TO_RECOVERY_CANDIDATE: "widen_to_recovery_candidate",
});
function buildPartitionServiceWitnessFingerprint(service) {
  if (!service || typeof service !== QUERY_EXECUTOR_LITERAL.STRING_OBJECT) {
    return null;
  }
  const serviceId = String(
    service.service_id ||
      service.replica_id ||
      service.serviceId ||
      service.replicaId ||
      "",
  );
  const address = String(service.address || "");
  if (serviceId.length === NUM.ZERO && address.length === NUM.ZERO) {
    return null;
  }
  const updatedAt =
    service.updated_at ??
    service.updatedAt ??
    service.created_at ??
    service.createdAt ??
    null;
  return [
    serviceId,
    address,
    String(
      service.node_id || service.nodeId || QUERY_EXECUTOR_LITERAL.STRING_VALUE,
    ),
    String(
      service.raft_role ||
        service.raftRole ||
        QUERY_EXECUTOR_LITERAL.STRING_VALUE,
    ),
    String(service.status || QUERY_EXECUTOR_LITERAL.STRING_VALUE),
    Number.isFinite(updatedAt)
      ? String(Math.floor(updatedAt))
      : QUERY_EXECUTOR_LITERAL.STRING_VALUE,
  ].join(QUERY_EXECUTOR_LITERAL.STRING_VALUE_2);
}
function normalizeParticipantFailureString(value) {
  return typeof value === QUERY_EXECUTOR_LITERAL.STRING_STRING &&
    value.length > NUM.ZERO
    ? value
    : null;
}
function normalizeParticipantRetryAfterMs(value) {
  return Number.isFinite(value) && value >= NUM.ZERO ? Math.floor(value) : null;
}
function resolveParticipantBackpressureState(result = {}) {
  if (typeof result?.backpressured === QUERY_EXECUTOR_LITERAL.STRING_BOOLEAN) {
    return result.backpressured;
  }
  if (result?.deferRetry === true) {
    return true;
  }
  return (
    Number.isFinite(result?.retryAfterMs) && result.retryAfterMs > NUM.ZERO
  );
}
function buildParticipantFailureEntry(result) {
  return {
    partitionId: result.partitionId,
    participantNodeId: normalizeParticipantFailureString(
      result.participantNodeId,
    ),
    participantAddress: normalizeParticipantFailureString(
      result.participantAddress,
    ),
    errorCode: normalizeParticipantFailureString(result.errorCode),
    error: result.error || ERRORS.QUERY_FAILED,
    durationMs: Number.isFinite(result?.durationMs)
      ? Math.max(NUM.ZERO, Math.floor(result.durationMs))
      : null,
    retryAfterMs: normalizeParticipantRetryAfterMs(result?.retryAfterMs),
    deferRetry: result?.deferRetry === true,
    backpressured: resolveParticipantBackpressureState(result),
    failedTable: normalizeParticipantFailureString(result.failedTable),
  };
}
function buildDistributedFailureSummary(failedResults) {
  const participantFailures = failedResults.map((result) =>
    buildParticipantFailureEntry(result),
  );
  return {
    failedPartitions: failedResults.map((result) => result.partitionId),
    partitionErrors: participantFailures,
    participantFailures,
    firstFailedParticipant:
      participantFailures.length > NUM.ZERO
        ? participantFailures[NUM.ZERO]
        : null,
  };
}

/**
 * QueryExecutor handles parallel query execution across partitions
 * and aggregates results while preserving SQL semantics.
 * Supports distributed read-only queries with cross-partition JOINs
 * and aggregate functions (COUNT, SUM, AVG, MIN, MAX).
 * Routes ALL queries through message router - no local vs remote distinction.
 */

export const QUERY_EXECUTOR_SHARED = {
  COLUMN,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_WRITE_RETRY_DECISION_STATE,
  ConfigurationManager,
  DISTRIBUTED_JOIN_STRATEGY,
  DistributedMergeEngine,
  ERRORS,
  HLCClockService,
  LEADER_GAP_REASON_OWNER_MISSING,
  LEADER_GAP_REASON_SERVICE_MISSING,
  LOG_MSG,
  LoggingService,
  METRICS_LOG_TAG,
  MIGRATION_PARTITION_OPERATION,
  NUM,
  PARTITION_SERVICE_ERROR_MSG,
  PG_EXPR_TYPE,
  ParallelQueryCoordinator,
  QUERY_AST_NODE,
  QUERY_AST_TYPE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_EXECUTOR_LITERAL,
  QUERY_JOIN_TYPE,
  QUERY_LOG_MSG,
  QUERY_MESSAGE_FIELD_MIGRATION_ID,
  QUERY_MESSAGE_FIELD_MIGRATION_OPERATION,
  QUERY_MESSAGE_FIELD_SESSION_ID,
  QUERY_MESSAGE_FIELD_SPLIT_MIRROR_ORIGIN,
  QUERY_MESSAGE_TYPE,
  QUERY_OPERATOR,
  QUERY_RESPONSE_TYPE,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
  QUERY_SQL,
  QUERY_SUBSYSTEM,
  RAFT_ROLE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SQL,
  SYSTEM_TABLE_NAMES,
  TABLES,
  TRANSPORT_ERROR_MSG,
  buildDistributedFailureSummary,
  buildParticipantFailureEntry,
  buildPartitionServiceWitnessFingerprint,
  compactEligibilitySnapshot,
  evaluateEligibilityDecision,
  isRetryableControlPlaneError,
  normalizeParticipantFailureString,
  normalizeParticipantRetryAfterMs,
  resolveBootstrapLeaderSelection,
  resolveParticipantBackpressureState,
};
