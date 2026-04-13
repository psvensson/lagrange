/**
 * OperationWorkflowOwner — single-flight owner keys, transition/claim
 * progression, and observed-progress reconciliation entry.
 *
 * Extracted from RebalanceCoordinator per D7.1 / Requirement 6.2.
 * The coordinator facade delegates workflow progression to this owner.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { ControlPlaneReadinessService } from '../control-plane/control-plane-readiness-service.js';
import { ControlPlaneField, ControlPlaneMessageType } from '../control-plane/control-plane-constants.js';
import { CONTROL_PLANE_READINESS_DIMENSION } from '../control-plane/control-plane-readiness-constants.js';
import { getControlPlaneRetryAfterMs, isRetryableControlPlaneError } from '../control-plane/control-plane-error-classification.js';
import { resolvePriorityRecoveryActiveNodeCohort } from '../control-plane/active-node-projection.js';
import { buildPriorityRecoveryBlockedPartitionIds, hasPriorityRecoverySpreadGap } from '../control-plane/priority-recovery-snapshot.js';
import { SYSTEM_TABLE_NAME } from '../bootstrap/system-table-schemas-constants.js';
import { isPriorityControlPlanePartition, isSystemTablePartition } from '../bootstrap/system-partition-classification.js';
import { WORKFLOW_STEP, NUM, TIME_MS, METRICS_LOG_TAG, TYPEOF, UNIFIED_SERVICE_TYPE } from '../constants/index.js';
import { SERVICE_TYPE } from '../constants/service.js';
import { TIMEOUT_BUDGET_CLASSIFICATION, TIMEOUT_BUDGET_DEFAULT, buildControlPlaneQueryOptions, buildTimeoutClassification, createChildTimeoutBudget, createTopLevelOperationBudget } from '../control-plane/timeout-budget.js';
import { readAuthoritativeControlPlaneRows } from '../control-plane/control-plane-system-table-gateway.js';
import { OPERATION_METADATA_KEY, ReplicaStatus, WORKFLOW_STEP_TO_STATUS, OperationType, getWorkflowSteps, isCoordinatorOwnedOperationType } from './replica-status.js';
import { ReplicaOperationMessageType, ReplicaOperationField, ReplicaOperationResponseStatus } from './replica-operation-constants.js';
import { RAFT_ROLE } from '../raft/constants.js';
import { REBALANCE_COORDINATOR_ERROR_MSG, REBALANCE_COORDINATOR_EVENT, REBALANCE_COORDINATOR_LOG_MSG, REBALANCE_COORDINATOR_DEFER_REASON, REBALANCER_SKIP_REASON, OPERATION_TRANSITION_REASON } from './rebalancer-constants.js';
import { EXECUTOR_OUTCOME_FIELD, EXECUTOR_OUTCOME_ACTION, EXECUTOR_OUTCOME_ACTION_MAP } from './executor-outcome-constants.js';
import { TRANSACTION_STATUS } from '../query/distributed/distributed-transaction-coordinator.js';
import { QUERY_ERROR_MSG } from '../query/query-constants.js';
import { PARTITION_SERVICE_ERROR_MSG } from '../partition/partition-service-constants.js';
import { SQL_RECONCILIATION_REASON } from '../control-plane/read-model-contract.js';
const OPERATION_WORKFLOW_OWNER_LITERAL = Object.freeze(stryMutAct_9fa48("131551") ? {} : (stryCov_9fa48("131551"), {
  CLOSE_PAREN: stryMutAct_9fa48("131552") ? "" : (stryCov_9fa48("131552"), ")"),
  COMMA_SPACE: stryMutAct_9fa48("131553") ? "" : (stryCov_9fa48("131553"), ", "),
  COMMITTED_REPLICA_OPERATION_TRANSITION_NOT_YET_AUTHORITATIVELY_VISIBLE: stryMutAct_9fa48("131554") ? "" : (stryCov_9fa48("131554"), "Committed replica operation transition not yet authoritatively visible"),
  CONTROL_PLANE_PRESSURE_DEGRADED: stryMutAct_9fa48("131555") ? "" : (stryCov_9fa48("131555"), "CONTROL_PLANE_PRESSURE_DEGRADED"),
  CONTROL_PLANE_PRESSURE_DEGRADED_WHILE_CLAIMING_PRIORITY: stryMutAct_9fa48("131556") ? "" : (stryCov_9fa48("131556"), "control_plane_pressure_degraded while claiming priority "),
  COORDINATOR_CREATED_OPERATION: stryMutAct_9fa48("131557") ? "" : (stryCov_9fa48("131557"), "coordinator_created_operation"),
  COORDINATOR_CREATED_REMOTE_HANDOFF: stryMutAct_9fa48("131558") ? "" : (stryCov_9fa48("131558"), "coordinator_created_remote_handoff"),
  CRITICAL: stryMutAct_9fa48("131559") ? "" : (stryCov_9fa48("131559"), "critical"),
  CRITICAL_PARTITION: stryMutAct_9fa48("131560") ? "" : (stryCov_9fa48("131560"), "Critical partition "),
  DELETE: stryMutAct_9fa48("131561") ? "" : (stryCov_9fa48("131561"), "DELETE"),
  DISPATCH: stryMutAct_9fa48("131562") ? "" : (stryCov_9fa48("131562"), "dispatch"),
  DISPATCH_RETRY: stryMutAct_9fa48("131563") ? "" : (stryCov_9fa48("131563"), "dispatch_retry"),
  DISPATCH_TRANSITION: stryMutAct_9fa48("131564") ? "" : (stryCov_9fa48("131564"), "dispatch transition"),
  EMPTY_JSON_ARRAY: stryMutAct_9fa48("131565") ? "" : (stryCov_9fa48("131565"), "[]"),
  EMPTY_STRING: stryMutAct_9fa48("131566") ? "Stryker was here!" : (stryCov_9fa48("131566"), ""),
  EXECUTE: stryMutAct_9fa48("131567") ? "" : (stryCov_9fa48("131567"), "execute"),
  EXECUTE_RECONCILE: stryMutAct_9fa48("131568") ? "" : (stryCov_9fa48("131568"), "execute_reconcile"),
  EXECUTOR_OUTCOME: stryMutAct_9fa48("131569") ? "" : (stryCov_9fa48("131569"), "executor_outcome"),
  FAILED_TO_READ_AUTHORITATIVE_TRANSITION_PARTICIPANT_STATE: stryMutAct_9fa48("131570") ? "" : (stryCov_9fa48("131570"), "Failed to read authoritative transition participant state"),
  FAILED_TO_READ_AUTHORITATIVE_TRANSITION_TRANSACTION_STATE: stryMutAct_9fa48("131571") ? "" : (stryCov_9fa48("131571"), "Failed to read authoritative transition transaction state"),
  FAILED_TO_RECOVER_TRANSITION_TRANSACTION: stryMutAct_9fa48("131572") ? "" : (stryCov_9fa48("131572"), "Failed to recover transition transaction"),
  FAILED_TO_RESOLVE_MINREPLICACOUNT_FOR_CRITICAL: stryMutAct_9fa48("131573") ? "" : (stryCov_9fa48("131573"), "Failed to resolve minReplicaCount for critical"),
  FAILED_TO_ROLL_BACK_TRANSITION_TRANSACTION: stryMutAct_9fa48("131574") ? "" : (stryCov_9fa48("131574"), "Failed to roll back transition transaction"),
  FUNCTION: stryMutAct_9fa48("131575") ? "" : (stryCov_9fa48("131575"), "function"),
  IN_PROGRESS: stryMutAct_9fa48("131576") ? "" : (stryCov_9fa48("131576"), "in_progress"),
  IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR: stryMutAct_9fa48("131577") ? "" : (stryCov_9fa48("131577"), " is no longer in the current eligible cohort for "),
  IS_NOT_VOTER_DASH_READY: stryMutAct_9fa48("131578") ? "" : (stryCov_9fa48("131578"), " is not voter-ready"),
  IS_UNAVAILABLE: stryMutAct_9fa48("131579") ? "" : (stryCov_9fa48("131579"), " is unavailable"),
  NODE_RECOVERY_DASH_INCOMPLETE_OPERATION: stryMutAct_9fa48("131580") ? "" : (stryCov_9fa48("131580"), "Node recovery - incomplete operation"),
  NODE_RECOVERY_DASH_INCOMPLETE_REMOVAL_OPERATION: stryMutAct_9fa48("131581") ? "" : (stryCov_9fa48("131581"), "Node recovery - incomplete removal operation"),
  OBJECT: stryMutAct_9fa48("131582") ? "" : (stryCov_9fa48("131582"), "object"),
  OBSERVED: stryMutAct_9fa48("131583") ? "" : (stryCov_9fa48("131583"), "observed"),
  OBSERVED_PROGRESS: stryMutAct_9fa48("131584") ? "" : (stryCov_9fa48("131584"), "observed_progress"),
  OPEN_PAREN: stryMutAct_9fa48("131585") ? "" : (stryCov_9fa48("131585"), " ("),
  OPERATIONWORKFLOWOWNER_REQUIRES_GETACTUALREPLICASTATUS_OPEN_PAREN_CLOSE_PAREN: stryMutAct_9fa48("131586") ? "" : (stryCov_9fa48("131586"), "OperationWorkflowOwner requires getActualReplicaStatus()"),
  PARTITION_SAFETY_CHECK: stryMutAct_9fa48("131587") ? "" : (stryCov_9fa48("131587"), " partition safety check"),
  PRIORITY_CLAIM_CAS: stryMutAct_9fa48("131588") ? "" : (stryCov_9fa48("131588"), "priority_claim_cas"),
  PRIORITY_CONTROL_DASH_PLANE_PARTITION: stryMutAct_9fa48("131589") ? "" : (stryCov_9fa48("131589"), "Priority control-plane partition "),
  PRIORITY_RECOVERY_TARGET_NODE: stryMutAct_9fa48("131590") ? "" : (stryCov_9fa48("131590"), "Priority recovery target node "),
  PRIORITY_SPREAD: stryMutAct_9fa48("131591") ? "" : (stryCov_9fa48("131591"), "priority spread"),
  PRIORITY_SPREAD_HAS_NOT_CONVERGED: stryMutAct_9fa48("131592") ? "" : (stryCov_9fa48("131592"), " priority spread has not converged"),
  PROGRESS: stryMutAct_9fa48("131593") ? "" : (stryCov_9fa48("131593"), "progress"),
  PROJECTED_VOTER_DASH_READY_SPREAD: stryMutAct_9fa48("131594") ? "" : (stryCov_9fa48("131594"), "projected voter-ready spread"),
  PROJECTED_VOTER_DASH_READY_SPREAD_WOULD_FALL_BELOW_THE_PUBLISHED: stryMutAct_9fa48("131595") ? "" : (stryCov_9fa48("131595"), " projected voter-ready spread would fall below the published "),
  PUBLISHED_MEMBERSHIP: stryMutAct_9fa48("131596") ? "" : (stryCov_9fa48("131596"), "published membership"),
  PUBLISHED_MEMBERSHIP_SAFETY_IS_UNAVAILABLE: stryMutAct_9fa48("131597") ? "" : (stryCov_9fa48("131597"), " published membership safety is unavailable"),
  QUESTION_MARK: stryMutAct_9fa48("131598") ? "" : (stryCov_9fa48("131598"), "?"),
  RECOVERY: stryMutAct_9fa48("131599") ? "" : (stryCov_9fa48("131599"), "recovery"),
  REPLACE_SOURCE_REMOVAL: stryMutAct_9fa48("131600") ? "" : (stryCov_9fa48("131600"), "replace_source_removal"),
  REPLACEMENT_REPLICA: stryMutAct_9fa48("131601") ? "" : (stryCov_9fa48("131601"), " replacement replica"),
  REPLACEMENT_REPLICA_2: stryMutAct_9fa48("131602") ? "" : (stryCov_9fa48("131602"), " replacement replica "),
  REPLACEMENT_REPLICA_3: stryMutAct_9fa48("131603") ? "" : (stryCov_9fa48("131603"), "replacement replica"),
  REPLICA_FAILED_DURING_OPERATION_RECONCILIATION: stryMutAct_9fa48("131604") ? "" : (stryCov_9fa48("131604"), "Replica failed during operation reconciliation"),
  REPLICA_FAILED_DURING_REMOVE_RECONCILIATION: stryMutAct_9fa48("131605") ? "" : (stryCov_9fa48("131605"), "Replica failed during remove reconciliation"),
  REPLICA_FAILED_DURING_SYNC: stryMutAct_9fa48("131606") ? "" : (stryCov_9fa48("131606"), "Replica failed during sync"),
  REPLICA_MISSING_DURING_STOPPING_RECONCILIATION: stryMutAct_9fa48("131607") ? "" : (stryCov_9fa48("131607"), "Replica missing during STOPPING reconciliation"),
  REPLICA_NOT_FOUND_DURING_RECOVERY_RECONCILIATION: stryMutAct_9fa48("131608") ? "" : (stryCov_9fa48("131608"), "Replica not found during recovery reconciliation"),
  REQUIREMENT: stryMutAct_9fa48("131609") ? "" : (stryCov_9fa48("131609"), "requirement"),
  RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE: stryMutAct_9fa48("131610") ? "" : (stryCov_9fa48("131610"), "Retryable control-plane transition failure"),
  ROTATING_TRANSITION_EXECUTION_SESSION_AFTER_STALE_SESSION_COLLISION: stryMutAct_9fa48("131611") ? "" : (stryCov_9fa48("131611"), "Rotating transition execution session after stale session collision"),
  SAFETY_CHECK_UNAVAILABLE: stryMutAct_9fa48("131612") ? "" : (stryCov_9fa48("131612"), " safety check unavailable"),
  SAFETY_CHECK_UNAVAILABLE_2: stryMutAct_9fa48("131613") ? "" : (stryCov_9fa48("131613"), "safety check unavailable"),
  STRING: stryMutAct_9fa48("131614") ? "" : (stryCov_9fa48("131614"), "string"),
  TRANSACTION: stryMutAct_9fa48("131615") ? "" : (stryCov_9fa48("131615"), "transaction"),
  TRANSITION_RETRY_RESUME: stryMutAct_9fa48("131616") ? "" : (stryCov_9fa48("131616"), "transition_retry_resume"),
  TRANSITION_SESSION_RECOVERY_PROBE_FAILED: stryMutAct_9fa48("131617") ? "" : (stryCov_9fa48("131617"), "Transition session recovery probe failed"),
  WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM: stryMutAct_9fa48("131618") ? "" : (stryCov_9fa48("131618"), " would drop voter-ready replicas below minimum"),
  WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2: stryMutAct_9fa48("131619") ? "" : (stryCov_9fa48("131619"), "would drop voter-ready replicas below minimum")
}));
const DEFAULT_MIN_REPLICA_COUNT = NUM.THREE;
const FAILURE_LOG_LEVEL = Object.freeze(stryMutAct_9fa48("131620") ? {} : (stryCov_9fa48("131620"), {
  ERROR: stryMutAct_9fa48("131621") ? "" : (stryCov_9fa48("131621"), 'error'),
  WARN: stryMutAct_9fa48("131622") ? "" : (stryCov_9fa48("131622"), 'warn')
}));
const OPERATION_SINGLE_FLIGHT_SCOPE = Object.freeze(stryMutAct_9fa48("131623") ? {} : (stryCov_9fa48("131623"), {
  CREATE: stryMutAct_9fa48("131624") ? "" : (stryCov_9fa48("131624"), 'create'),
  CREATE_BUDGET: stryMutAct_9fa48("131625") ? "" : (stryCov_9fa48("131625"), 'create-budget'),
  OPERATION: stryMutAct_9fa48("131626") ? "" : (stryCov_9fa48("131626"), 'operation')
}));
const OPERATION_OWNER_ACTION = Object.freeze(stryMutAct_9fa48("131627") ? {} : (stryCov_9fa48("131627"), {
  DISPATCH: stryMutAct_9fa48("131628") ? "" : (stryCov_9fa48("131628"), 'dispatch'),
  EXECUTE: stryMutAct_9fa48("131629") ? "" : (stryCov_9fa48("131629"), 'execute')
}));
const OPERATION_LIFECYCLE_ACTION = Object.freeze(stryMutAct_9fa48("131630") ? {} : (stryCov_9fa48("131630"), {
  FAIL_PRE_SYNC_RECOVERY: stryMutAct_9fa48("131631") ? "" : (stryCov_9fa48("131631"), 'fail_pre_sync_recovery'),
  FAIL_STOPPING_RECOVERY: stryMutAct_9fa48("131632") ? "" : (stryCov_9fa48("131632"), 'fail_stopping_recovery'),
  EXECUTE_ACTIVE_REPLACE: stryMutAct_9fa48("131633") ? "" : (stryCov_9fa48("131633"), 'execute_active_replace'),
  EXECUTE_REMOVE_DISPATCH: stryMutAct_9fa48("131634") ? "" : (stryCov_9fa48("131634"), 'execute_remove_dispatch'),
  RECONCILE_STOPPING: stryMutAct_9fa48("131635") ? "" : (stryCov_9fa48("131635"), 'reconcile_stopping'),
  RECONCILE_REPLICA_STATUS: stryMutAct_9fa48("131636") ? "" : (stryCov_9fa48("131636"), 'reconcile_replica_status'),
  NOOP: stryMutAct_9fa48("131637") ? "" : (stryCov_9fa48("131637"), 'noop')
}));
const OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR = stryMutAct_9fa48("131638") ? "" : (stryCov_9fa48("131638"), ':');
const OPERATION_WORKFLOW_OWNER_REASON = Object.freeze(stryMutAct_9fa48("131639") ? {} : (stryCov_9fa48("131639"), {
  OPERATION_ID_REQUIRED: stryMutAct_9fa48("131640") ? "" : (stryCov_9fa48("131640"), 'operation_id_required'),
  OPERATION_NOT_DISPATCHABLE: stryMutAct_9fa48("131641") ? "" : (stryCov_9fa48("131641"), 'operation_not_dispatchable'),
  OPERATION_NOT_FOUND: stryMutAct_9fa48("131642") ? "" : (stryCov_9fa48("131642"), 'operation_not_found'),
  SHUTDOWN_IN_PROGRESS: stryMutAct_9fa48("131643") ? "" : (stryCov_9fa48("131643"), 'shutdown_in_progress')
}));
const OPERATION_HANDLER = Object.freeze(stryMutAct_9fa48("131644") ? {} : (stryCov_9fa48("131644"), {
  [SERVICE_TYPE.PARTITION]: stryMutAct_9fa48("131645") ? "" : (stryCov_9fa48("131645"), 'replica-handler'),
  [SERVICE_TYPE.MESSAGE_GROUP]: stryMutAct_9fa48("131646") ? "" : (stryCov_9fa48("131646"), 'message-group-handler'),
  [UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE]: stryMutAct_9fa48("131647") ? "" : (stryCov_9fa48("131647"), 'runtime-service-handler')
}));
const OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES = Object.freeze(new Set(stryMutAct_9fa48("131648") ? [] : (stryCov_9fa48("131648"), [ReplicaStatus.SYNCING, ReplicaStatus.ACTIVE, ReplicaStatus.FAILED])));
const OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS = Object.freeze(new Set(stryMutAct_9fa48("131649") ? [] : (stryCov_9fa48("131649"), [WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING, WORKFLOW_STEP.CREATING, WORKFLOW_STEP.SYNCING, WORKFLOW_STEP.STOPPING])));
const SAFETY_DEFERRED_LOG_THROTTLE_MS = stryMutAct_9fa48("131650") ? TIME_MS.SECOND / NUM.FIVE : (stryCov_9fa48("131650"), TIME_MS.SECOND * NUM.FIVE);
const SAFETY_DEFERRED_RETRY_DELAY_MS = TIME_MS.SECOND;
const OBSERVED_PROGRESS_RETRY_DELAY_MS = stryMutAct_9fa48("131651") ? TIME_MS.SECOND * 4 : (stryCov_9fa48("131651"), TIME_MS.SECOND / 4);
const DISPATCH_RETRY_DELAY_MS = stryMutAct_9fa48("131652") ? TIME_MS.SECOND * 4 : (stryCov_9fa48("131652"), TIME_MS.SECOND / 4);
const COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS = TIME_MS.SECOND;
const TRANSITION_RETRY_DELAY_MS = stryMutAct_9fa48("131653") ? TIME_MS.SECOND * 4 : (stryCov_9fa48("131653"), TIME_MS.SECOND / 4);
const TRANSITION_STEP_OPTIONS = Object.freeze(stryMutAct_9fa48("131654") ? {} : (stryCov_9fa48("131654"), {
  DEFER_COMMITTED_MARK: Object.freeze(stryMutAct_9fa48("131655") ? {} : (stryCov_9fa48("131655"), {
    markCommitted: stryMutAct_9fa48("131656") ? true : (stryCov_9fa48("131656"), false)
  }))
}));
const OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX = stryMutAct_9fa48("131657") ? "" : (stryCov_9fa48("131657"), 'attempt');
const PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS = stryMutAct_9fa48("131658") ? TIME_MS.MINUTE / NUM.TWO : (stryCov_9fa48("131658"), TIME_MS.MINUTE * NUM.TWO);
const RECOVERABLE_TRANSITION_COMMIT_STATUS = Object.freeze(new Set(stryMutAct_9fa48("131659") ? [] : (stryCov_9fa48("131659"), [TRANSACTION_STATUS.PREPARED, TRANSACTION_STATUS.COMMITTING])));
const RECOVERABLE_TRANSITION_ROLLBACK_STATUS = Object.freeze(new Set(stryMutAct_9fa48("131660") ? [] : (stryCov_9fa48("131660"), [TRANSACTION_STATUS.ACTIVE, TRANSACTION_STATUS.PREPARING, TRANSACTION_STATUS.ROLLING_BACK])));
const AUTHORITATIVE_TRANSITION_RECOVERY_STATUS = Object.freeze(new Set(stryMutAct_9fa48("131661") ? [] : (stryCov_9fa48("131661"), [...RECOVERABLE_TRANSITION_COMMIT_STATUS, ...RECOVERABLE_TRANSITION_ROLLBACK_STATUS])));
const TRANSITION_RECOVERY_READ_OPTIONS = Object.freeze(stryMutAct_9fa48("131662") ? {} : (stryCov_9fa48("131662"), {
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  preferOwnerRpcRead: stryMutAct_9fa48("131663") ? false : (stryCov_9fa48("131663"), true),
  requireOwnerRpcRead: stryMutAct_9fa48("131664") ? false : (stryCov_9fa48("131664"), true),
  allowOwnerRpcFallback: stryMutAct_9fa48("131665") ? false : (stryCov_9fa48("131665"), true),
  allowSqlFallback: stryMutAct_9fa48("131666") ? true : (stryCov_9fa48("131666"), false)
}));
const TRANSITION_RECOVERY_SQL = Object.freeze(stryMutAct_9fa48("131667") ? {} : (stryCov_9fa48("131667"), {
  SELECT_TRANSACTIONS_BY_SESSION: stryMutAct_9fa48("131668") ? "" : (stryCov_9fa48("131668"), 'SELECT * FROM sql_transactions WHERE session_id = ?')
}));
const REMOVE_SAFETY_READ_QUERY_OPTIONS = Object.freeze(stryMutAct_9fa48("131669") ? {} : (stryCov_9fa48("131669"), {
  ...buildControlPlaneQueryOptions(),
  routingReadinessDimension: CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
  preferOwnerRpcRead: stryMutAct_9fa48("131670") ? false : (stryCov_9fa48("131670"), true),
  requireOwnerRpcRead: stryMutAct_9fa48("131671") ? true : (stryCov_9fa48("131671"), false),
  allowOwnerRpcFallback: stryMutAct_9fa48("131672") ? false : (stryCov_9fa48("131672"), true),
  allowSqlFallback: stryMutAct_9fa48("131673") ? false : (stryCov_9fa48("131673"), true)
}));
const REMOVE_SAFETY_SQL = Object.freeze(stryMutAct_9fa48("131674") ? {} : (stryCov_9fa48("131674"), {
  SELECT_PARTITION_REPLICA_ROWS: stryMutAct_9fa48("131675") ? "" : (stryCov_9fa48("131675"), 'SELECT * FROM services WHERE service_type = ? AND partition_id = ?')
}));
function normalizeNodeIdList(nodeIds) {
  if (stryMutAct_9fa48("131676")) {
    {}
  } else {
    stryCov_9fa48("131676");
    return stryMutAct_9fa48("131677") ? [] : (stryCov_9fa48("131677"), [...new Set(stryMutAct_9fa48("131678") ? (Array.isArray(nodeIds) ? nodeIds : []).map(nodeId => typeof nodeId === TYPEOF.STRING ? nodeId.trim() : OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING) : (stryCov_9fa48("131678"), (Array.isArray(nodeIds) ? nodeIds : stryMutAct_9fa48("131679") ? ["Stryker was here"] : (stryCov_9fa48("131679"), [])).map(stryMutAct_9fa48("131680") ? () => undefined : (stryCov_9fa48("131680"), nodeId => (stryMutAct_9fa48("131683") ? typeof nodeId !== TYPEOF.STRING : stryMutAct_9fa48("131682") ? false : stryMutAct_9fa48("131681") ? true : (stryCov_9fa48("131681", "131682", "131683"), typeof nodeId === TYPEOF.STRING)) ? stryMutAct_9fa48("131684") ? nodeId : (stryCov_9fa48("131684"), nodeId.trim()) : OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING)).filter(stryMutAct_9fa48("131685") ? () => undefined : (stryCov_9fa48("131685"), nodeId => stryMutAct_9fa48("131689") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("131688") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("131687") ? false : stryMutAct_9fa48("131686") ? true : (stryCov_9fa48("131686", "131687", "131688", "131689"), nodeId.length > NUM.ZERO)))))]);
  }
}
function buildSelectRowsByTransactionIdsSql(tableName, transactionIds) {
  if (stryMutAct_9fa48("131690")) {
    {}
  } else {
    stryCov_9fa48("131690");
    return stryMutAct_9fa48("131691") ? `` : (stryCov_9fa48("131691"), `SELECT * FROM ${tableName} WHERE transaction_id IN (${transactionIds.map(stryMutAct_9fa48("131692") ? () => undefined : (stryCov_9fa48("131692"), () => OPERATION_WORKFLOW_OWNER_LITERAL.QUESTION_MARK)).join(OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE)})`);
  }
}

/**
 * Owns single-flight owner-key execution, workflow step advancement,
 * claim/dispatch progression, and observed-progress reconciliation.
 *
 * Dependencies are injected by the coordinator facade at construction.
 */
class OperationWorkflowOwner {
  /**
   * @param {Object} options
   * @param {Object} options.repository - ReplicaOperationRepository.
   * @param {Object} options.operationLane - OperationLane instance.
   * @param {Object} options.operationWorkflowCoordinator -
   *   DurableWorkflowCoordinator.
   * @param {Object} options.controlPlaneReadinessService -
   *   ControlPlaneReadinessService.
   * @param {Object} options.messageRouter - MessageRouter.
   * @param {Object} options.tablePolicyService - TablePolicyService.
   * @param {Object} options.transactionCoordinator -
   *   DistributedTransactionCoordinator.
   * @param {Object} options.logger - Logger instance.
   * @param {Object} options.emitter - EventEmitter (coordinator facade).
   * @param {Object} options.config - Timeout/budget configuration.
   * @param {string} options.nodeId - Local node ID.
   * @param {Object} options.stats - Shared stats counters.
   * @param {Function} options.isShuttingDown - Shutdown predicate.
   * @param {Function} options.isInitialized - Initialization predicate.
   * @param {Function} options.releaseReservationForOperation -
   *   Reservation release callback.
  * @param {Function} options.reconcileReservations -
  *   Reservation reconciliation callback.
  * @param {Function} options.allocateCanonicalReplicaId -
  *   Replica ID allocation callback.
  * @param {Function} options.getActualReplicaStatus -
  *   Authoritative replica status read callback.
  * @param {Function} [options.setTimeoutFn] - Deferred retry timer factory.
  * @param {Function} [options.clearTimeoutFn] - Deferred retry timer cleanup.
  */
  constructor(options) {
    if (stryMutAct_9fa48("131693")) {
      {}
    } else {
      stryCov_9fa48("131693");
      this.repository = options.repository;
      this.operationLane = options.operationLane;
      this.operationWorkflowCoordinator = options.operationWorkflowCoordinator;
      this.operationWorkflowRunExclusive = this.operationLane.run.bind(this.operationLane);
      this.controlPlaneReadinessService = options.controlPlaneReadinessService;
      this.messageRouter = options.messageRouter;
      this.tablePolicyService = options.tablePolicyService;
      this.transactionCoordinator = stryMutAct_9fa48("131696") ? options.transactionCoordinator && null : stryMutAct_9fa48("131695") ? false : stryMutAct_9fa48("131694") ? true : (stryCov_9fa48("131694", "131695", "131696"), options.transactionCoordinator || null);
      this.logger = options.logger;
      this.emitter = options.emitter;
      this.config = options.config;
      this.nodeId = options.nodeId;
      this.stats = options.stats;
      this._isShuttingDown = options.isShuttingDown;
      this._isInitialized = options.isInitialized;
      this.releaseReservationForOperation = options.releaseReservationForOperation;
      this.reconcileReservations = options.reconcileReservations;
      this.allocateCanonicalReplicaId = options.allocateCanonicalReplicaId;
      this.getActualReplicaStatus = options.getActualReplicaStatus;
      this.setTimeoutFn = (stryMutAct_9fa48("131699") ? typeof options.setTimeoutFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("131698") ? false : stryMutAct_9fa48("131697") ? true : (stryCov_9fa48("131697", "131698", "131699"), typeof options.setTimeoutFn === TYPEOF.FUNCTION)) ? options.setTimeoutFn : setTimeout;
      this.clearTimeoutFn = (stryMutAct_9fa48("131702") ? typeof options.clearTimeoutFn !== TYPEOF.FUNCTION : stryMutAct_9fa48("131701") ? false : stryMutAct_9fa48("131700") ? true : (stryCov_9fa48("131700", "131701", "131702"), typeof options.clearTimeoutFn === TYPEOF.FUNCTION)) ? options.clearTimeoutFn : clearTimeout;
      this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
      this.incompleteOperationQueryEmptyBackoffMs = stryMutAct_9fa48("131705") ? options.incompleteOperationQueryEmptyBackoffMs && NUM.ZERO : stryMutAct_9fa48("131704") ? false : stryMutAct_9fa48("131703") ? true : (stryCov_9fa48("131703", "131704", "131705"), options.incompleteOperationQueryEmptyBackoffMs || NUM.ZERO);
      this.safetyDeferredLogStateByOperationId = new Map();
      this.safetyDeferredRetryTimerByOperationId = new Map();
      this.observedProgressRetryTimerByOperationId = new Map();
      this.dispatchRetryTimerByOperationId = new Map();
      this.createdOperationHandoffRetryTimerByOperationId = new Map();
      this.transitionRetryTimerByOperationId = new Map();
      this.transitionRetryGraceDeadlineByOperationId = new Map();
      this.transitionExecutionAttemptByStepOwnerKey = new Map();
      if (stryMutAct_9fa48("131708") ? typeof this.getActualReplicaStatus === OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION : stryMutAct_9fa48("131707") ? false : stryMutAct_9fa48("131706") ? true : (stryCov_9fa48("131706", "131707", "131708"), typeof this.getActualReplicaStatus !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION)) {
        if (stryMutAct_9fa48("131709")) {
          {}
        } else {
          stryCov_9fa48("131709");
          throw new Error(OPERATION_WORKFLOW_OWNER_LITERAL.OPERATIONWORKFLOWOWNER_REQUIRES_GETACTUALREPLICASTATUS_OPEN_PAREN_CLOSE_PAREN);
        }
      }
    }
  }

  /** @return {boolean} */
  get isShuttingDown() {
    if (stryMutAct_9fa48("131710")) {
      {}
    } else {
      stryCov_9fa48("131710");
      return this._isShuttingDown();
    }
  }

  /** @return {boolean} */
  get isInitialized() {
    if (stryMutAct_9fa48("131711")) {
      {}
    } else {
      stryCov_9fa48("131711");
      return this._isInitialized();
    }
  }

  /**
   * Release owner-local deferred retry state.
   */
  shutdown() {
    if (stryMutAct_9fa48("131712")) {
      {}
    } else {
      stryCov_9fa48("131712");
      for (const timerHandle of this.safetyDeferredRetryTimerByOperationId.values()) {
        if (stryMutAct_9fa48("131713")) {
          {}
        } else {
          stryCov_9fa48("131713");
          this.clearTimeoutFn(timerHandle);
        }
      }
      this.safetyDeferredRetryTimerByOperationId.clear();
      for (const timerHandle of this.observedProgressRetryTimerByOperationId.values()) {
        if (stryMutAct_9fa48("131714")) {
          {}
        } else {
          stryCov_9fa48("131714");
          this.clearTimeoutFn(timerHandle);
        }
      }
      this.observedProgressRetryTimerByOperationId.clear();
      for (const timerHandle of this.dispatchRetryTimerByOperationId.values()) {
        if (stryMutAct_9fa48("131715")) {
          {}
        } else {
          stryCov_9fa48("131715");
          this.clearTimeoutFn(timerHandle);
        }
      }
      this.dispatchRetryTimerByOperationId.clear();
      for (const timerHandle of this.createdOperationHandoffRetryTimerByOperationId.values()) {
        if (stryMutAct_9fa48("131716")) {
          {}
        } else {
          stryCov_9fa48("131716");
          this.clearTimeoutFn(timerHandle);
        }
      }
      this.createdOperationHandoffRetryTimerByOperationId.clear();
      for (const timerHandle of this.transitionRetryTimerByOperationId.values()) {
        if (stryMutAct_9fa48("131717")) {
          {}
        } else {
          stryCov_9fa48("131717");
          this.clearTimeoutFn(timerHandle);
        }
      }
      this.transitionRetryTimerByOperationId.clear();
      this.transitionRetryGraceDeadlineByOperationId.clear();
    }
  }

  /**
   * @param {string} operationId
   */
  clearObservedProgressRetry(operationId) {
    if (stryMutAct_9fa48("131718")) {
      {}
    } else {
      stryCov_9fa48("131718");
      const timerHandle = this.observedProgressRetryTimerByOperationId.get(operationId);
      if (stryMutAct_9fa48("131721") ? false : stryMutAct_9fa48("131720") ? true : stryMutAct_9fa48("131719") ? timerHandle : (stryCov_9fa48("131719", "131720", "131721"), !timerHandle)) {
        if (stryMutAct_9fa48("131722")) {
          {}
        } else {
          stryCov_9fa48("131722");
          return;
        }
      }
      this.clearTimeoutFn(timerHandle);
      this.observedProgressRetryTimerByOperationId.delete(operationId);
    }
  }

  /**
   * @param {string} operationId
   */
  clearSafetyDeferredRetry(operationId) {
    if (stryMutAct_9fa48("131723")) {
      {}
    } else {
      stryCov_9fa48("131723");
      const timerHandle = this.safetyDeferredRetryTimerByOperationId.get(operationId);
      if (stryMutAct_9fa48("131726") ? false : stryMutAct_9fa48("131725") ? true : stryMutAct_9fa48("131724") ? timerHandle : (stryCov_9fa48("131724", "131725", "131726"), !timerHandle)) {
        if (stryMutAct_9fa48("131727")) {
          {}
        } else {
          stryCov_9fa48("131727");
          return;
        }
      }
      this.clearTimeoutFn(timerHandle);
      this.safetyDeferredRetryTimerByOperationId.delete(operationId);
    }
  }

  /**
   * @param {string} operationId
   */
  clearDispatchRetry(operationId) {
    if (stryMutAct_9fa48("131728")) {
      {}
    } else {
      stryCov_9fa48("131728");
      const timerHandle = this.dispatchRetryTimerByOperationId.get(operationId);
      if (stryMutAct_9fa48("131731") ? false : stryMutAct_9fa48("131730") ? true : stryMutAct_9fa48("131729") ? timerHandle : (stryCov_9fa48("131729", "131730", "131731"), !timerHandle)) {
        if (stryMutAct_9fa48("131732")) {
          {}
        } else {
          stryCov_9fa48("131732");
          return;
        }
      }
      this.clearTimeoutFn(timerHandle);
      this.dispatchRetryTimerByOperationId.delete(operationId);
    }
  }

  /**
   * @param {string} operationId
   */
  clearCreatedOperationHandoffRetry(operationId) {
    if (stryMutAct_9fa48("131733")) {
      {}
    } else {
      stryCov_9fa48("131733");
      const timerHandle = this.createdOperationHandoffRetryTimerByOperationId.get(operationId);
      if (stryMutAct_9fa48("131736") ? false : stryMutAct_9fa48("131735") ? true : stryMutAct_9fa48("131734") ? timerHandle : (stryCov_9fa48("131734", "131735", "131736"), !timerHandle)) {
        if (stryMutAct_9fa48("131737")) {
          {}
        } else {
          stryCov_9fa48("131737");
          return;
        }
      }
      this.clearTimeoutFn(timerHandle);
      this.createdOperationHandoffRetryTimerByOperationId.delete(operationId);
    }
  }

  /**
   * @param {string} operationId
   */
  clearTransitionRetry(operationId) {
    if (stryMutAct_9fa48("131738")) {
      {}
    } else {
      stryCov_9fa48("131738");
      const timerHandle = this.transitionRetryTimerByOperationId.get(operationId);
      if (stryMutAct_9fa48("131741") ? false : stryMutAct_9fa48("131740") ? true : stryMutAct_9fa48("131739") ? timerHandle : (stryCov_9fa48("131739", "131740", "131741"), !timerHandle)) {
        if (stryMutAct_9fa48("131742")) {
          {}
        } else {
          stryCov_9fa48("131742");
          this.transitionRetryGraceDeadlineByOperationId.delete(operationId);
          return;
        }
      }
      this.clearTimeoutFn(timerHandle);
      this.transitionRetryTimerByOperationId.delete(operationId);
      this.transitionRetryGraceDeadlineByOperationId.delete(operationId);
    }
  }

  /**
   * @param {string|null} operationId
   * @param {Object} [context={}]
   * @param {number} [delayMs=0]
   * @return {void}
   * @private
   */
  recordTransitionRetryGrace(operationId, context = {}, delayMs = NUM.ZERO) {
    if (stryMutAct_9fa48("131743")) {
      {}
    } else {
      stryCov_9fa48("131743");
      if (stryMutAct_9fa48("131746") ? false : stryMutAct_9fa48("131745") ? true : stryMutAct_9fa48("131744") ? operationId : (stryCov_9fa48("131744", "131745", "131746"), !operationId)) {
        if (stryMutAct_9fa48("131747")) {
          {}
        } else {
          stryCov_9fa48("131747");
          return;
        }
      }
      const workflowStep = (stryMutAct_9fa48("131750") ? typeof context.workflowStep === TYPEOF.STRING || context.workflowStep.length > NUM.ZERO : stryMutAct_9fa48("131749") ? false : stryMutAct_9fa48("131748") ? true : (stryCov_9fa48("131748", "131749", "131750"), (stryMutAct_9fa48("131752") ? typeof context.workflowStep !== TYPEOF.STRING : stryMutAct_9fa48("131751") ? true : (stryCov_9fa48("131751", "131752"), typeof context.workflowStep === TYPEOF.STRING)) && (stryMutAct_9fa48("131755") ? context.workflowStep.length <= NUM.ZERO : stryMutAct_9fa48("131754") ? context.workflowStep.length >= NUM.ZERO : stryMutAct_9fa48("131753") ? true : (stryCov_9fa48("131753", "131754", "131755"), context.workflowStep.length > NUM.ZERO)))) ? context.workflowStep : WORKFLOW_STEP.PENDING;
      const partitionId = stryMutAct_9fa48("131758") ? context.partitionId && null : stryMutAct_9fa48("131757") ? false : stryMutAct_9fa48("131756") ? true : (stryCov_9fa48("131756", "131757", "131758"), context.partitionId || null);
      const stepTimeout = this.getTimeoutForStep(workflowStep, partitionId ? stryMutAct_9fa48("131759") ? {} : (stryCov_9fa48("131759"), {
        partitionId
      }) : null);
      const graceDeadlineMs = stryMutAct_9fa48("131760") ? Date.now() - Math.max(stepTimeout, Number.isFinite(delayMs) ? delayMs : NUM.ZERO) : (stryCov_9fa48("131760"), Date.now() + (stryMutAct_9fa48("131761") ? Math.min(stepTimeout, Number.isFinite(delayMs) ? delayMs : NUM.ZERO) : (stryCov_9fa48("131761"), Math.max(stepTimeout, Number.isFinite(delayMs) ? delayMs : NUM.ZERO))));
      const existingDeadlineMs = Number(this.transitionRetryGraceDeadlineByOperationId.get(operationId));
      this.transitionRetryGraceDeadlineByOperationId.set(operationId, Number.isFinite(existingDeadlineMs) ? stryMutAct_9fa48("131762") ? Math.min(existingDeadlineMs, graceDeadlineMs) : (stryCov_9fa48("131762"), Math.max(existingDeadlineMs, graceDeadlineMs)) : graceDeadlineMs);
    }
  }

  /**
   * @param {string|null} operationId
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  hasActiveTransitionRetryGrace(operationId, now = Date.now()) {
    if (stryMutAct_9fa48("131763")) {
      {}
    } else {
      stryCov_9fa48("131763");
      if (stryMutAct_9fa48("131766") ? false : stryMutAct_9fa48("131765") ? true : stryMutAct_9fa48("131764") ? operationId : (stryCov_9fa48("131764", "131765", "131766"), !operationId)) {
        if (stryMutAct_9fa48("131767")) {
          {}
        } else {
          stryCov_9fa48("131767");
          return stryMutAct_9fa48("131768") ? true : (stryCov_9fa48("131768"), false);
        }
      }
      const deadlineMs = Number(this.transitionRetryGraceDeadlineByOperationId.get(operationId));
      if (stryMutAct_9fa48("131771") ? false : stryMutAct_9fa48("131770") ? true : stryMutAct_9fa48("131769") ? Number.isFinite(deadlineMs) : (stryCov_9fa48("131769", "131770", "131771"), !Number.isFinite(deadlineMs))) {
        if (stryMutAct_9fa48("131772")) {
          {}
        } else {
          stryCov_9fa48("131772");
          return stryMutAct_9fa48("131773") ? true : (stryCov_9fa48("131773"), false);
        }
      }
      if (stryMutAct_9fa48("131777") ? deadlineMs > now : stryMutAct_9fa48("131776") ? deadlineMs < now : stryMutAct_9fa48("131775") ? false : stryMutAct_9fa48("131774") ? true : (stryCov_9fa48("131774", "131775", "131776", "131777"), deadlineMs <= now)) {
        if (stryMutAct_9fa48("131778")) {
          {}
        } else {
          stryCov_9fa48("131778");
          this.transitionRetryGraceDeadlineByOperationId.delete(operationId);
          return stryMutAct_9fa48("131779") ? true : (stryCov_9fa48("131779"), false);
        }
      }
      return stryMutAct_9fa48("131780") ? false : (stryCov_9fa48("131780"), true);
    }
  }

  /**
   * Critical system-partition recovery must not fail terminally on transient
   * control-plane dispatch pressure. Keep the same operation alive and retry
   * through the owner lane instead of churning new failed rows.
   *
   * @param {Object} operation
   * @param {Error|Object} errorLike
   * @return {boolean}
   * @private
   */
  shouldDeferRetryableDispatchFailure(operation, errorLike) {
    if (stryMutAct_9fa48("131781")) {
      {}
    } else {
      stryCov_9fa48("131781");
      if (stryMutAct_9fa48("131784") ? !operation && !isRetryableControlPlaneError(errorLike) : stryMutAct_9fa48("131783") ? false : stryMutAct_9fa48("131782") ? true : (stryCov_9fa48("131782", "131783", "131784"), (stryMutAct_9fa48("131785") ? operation : (stryCov_9fa48("131785"), !operation)) || (stryMutAct_9fa48("131786") ? isRetryableControlPlaneError(errorLike) : (stryCov_9fa48("131786"), !isRetryableControlPlaneError(errorLike))))) {
        if (stryMutAct_9fa48("131787")) {
          {}
        } else {
          stryCov_9fa48("131787");
          return stryMutAct_9fa48("131788") ? true : (stryCov_9fa48("131788"), false);
        }
      }
      return this.isCriticalSystemPartition(operation.partitionId);
    }
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isDispatchRetryableWorkflowStep(operation) {
    if (stryMutAct_9fa48("131789")) {
      {}
    } else {
      stryCov_9fa48("131789");
      if (stryMutAct_9fa48("131792") ? false : stryMutAct_9fa48("131791") ? true : stryMutAct_9fa48("131790") ? operation : (stryCov_9fa48("131790", "131791", "131792"), !operation)) {
        if (stryMutAct_9fa48("131793")) {
          {}
        } else {
          stryCov_9fa48("131793");
          return stryMutAct_9fa48("131794") ? true : (stryCov_9fa48("131794"), false);
        }
      }
      const workflowStep = operation.workflowStep;
      if (stryMutAct_9fa48("131796") ? false : stryMutAct_9fa48("131795") ? true : (stryCov_9fa48("131795", "131796"), this.repository.isReplaceRemoveDispatchPhase(operation))) {
        if (stryMutAct_9fa48("131797")) {
          {}
        } else {
          stryCov_9fa48("131797");
          return stryMutAct_9fa48("131800") ? workflowStep === WORKFLOW_STEP.ACTIVE && workflowStep === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("131799") ? false : stryMutAct_9fa48("131798") ? true : (stryCov_9fa48("131798", "131799", "131800"), (stryMutAct_9fa48("131802") ? workflowStep !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("131801") ? false : (stryCov_9fa48("131801", "131802"), workflowStep === WORKFLOW_STEP.ACTIVE)) || (stryMutAct_9fa48("131804") ? workflowStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("131803") ? false : (stryCov_9fa48("131803", "131804"), workflowStep === WORKFLOW_STEP.STOPPING)));
        }
      }
      if (stryMutAct_9fa48("131807") ? operation.type === OperationType.REMOVE || workflowStep === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("131806") ? false : stryMutAct_9fa48("131805") ? true : (stryCov_9fa48("131805", "131806", "131807"), (stryMutAct_9fa48("131809") ? operation.type !== OperationType.REMOVE : stryMutAct_9fa48("131808") ? true : (stryCov_9fa48("131808", "131809"), operation.type === OperationType.REMOVE)) && (stryMutAct_9fa48("131811") ? workflowStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("131810") ? true : (stryCov_9fa48("131810", "131811"), workflowStep === WORKFLOW_STEP.STOPPING)))) {
        if (stryMutAct_9fa48("131812")) {
          {}
        } else {
          stryCov_9fa48("131812");
          return stryMutAct_9fa48("131813") ? false : (stryCov_9fa48("131813"), true);
        }
      }
      return stryMutAct_9fa48("131816") ? workflowStep === WORKFLOW_STEP.PENDING && workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("131815") ? false : stryMutAct_9fa48("131814") ? true : (stryCov_9fa48("131814", "131815", "131816"), (stryMutAct_9fa48("131818") ? workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("131817") ? false : (stryCov_9fa48("131817", "131818"), workflowStep === WORKFLOW_STEP.PENDING)) || (stryMutAct_9fa48("131820") ? workflowStep !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("131819") ? false : (stryCov_9fa48("131819", "131820"), workflowStep === WORKFLOW_STEP.SENDING)));
    }
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isRemoveInitialDispatchPhase(operation) {
    if (stryMutAct_9fa48("131821")) {
      {}
    } else {
      stryCov_9fa48("131821");
      return stryMutAct_9fa48("131824") ? operation?.type === OperationType.REMOVE || operation?.workflowStep === WORKFLOW_STEP.PENDING || operation?.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("131823") ? false : stryMutAct_9fa48("131822") ? true : (stryCov_9fa48("131822", "131823", "131824"), (stryMutAct_9fa48("131826") ? operation?.type !== OperationType.REMOVE : stryMutAct_9fa48("131825") ? true : (stryCov_9fa48("131825", "131826"), (stryMutAct_9fa48("131827") ? operation.type : (stryCov_9fa48("131827"), operation?.type)) === OperationType.REMOVE)) && (stryMutAct_9fa48("131829") ? operation?.workflowStep === WORKFLOW_STEP.PENDING && operation?.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("131828") ? true : (stryCov_9fa48("131828", "131829"), (stryMutAct_9fa48("131831") ? operation?.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("131830") ? false : (stryCov_9fa48("131830", "131831"), (stryMutAct_9fa48("131832") ? operation.workflowStep : (stryCov_9fa48("131832"), operation?.workflowStep)) === WORKFLOW_STEP.PENDING)) || (stryMutAct_9fa48("131834") ? operation?.workflowStep !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("131833") ? false : (stryCov_9fa48("131833", "131834"), (stryMutAct_9fa48("131835") ? operation.workflowStep : (stryCov_9fa48("131835"), operation?.workflowStep)) === WORKFLOW_STEP.SENDING)))));
    }
  }

  /**
   * @param {Object} operation
   * @return {boolean}
   * @private
   */
  isSafetyDeferredRetryableOperation(operation) {
    if (stryMutAct_9fa48("131836")) {
      {}
    } else {
      stryCov_9fa48("131836");
      if (stryMutAct_9fa48("131839") ? false : stryMutAct_9fa48("131838") ? true : stryMutAct_9fa48("131837") ? operation : (stryCov_9fa48("131837", "131838", "131839"), !operation)) {
        if (stryMutAct_9fa48("131840")) {
          {}
        } else {
          stryCov_9fa48("131840");
          return stryMutAct_9fa48("131841") ? true : (stryCov_9fa48("131841"), false);
        }
      }
      return stryMutAct_9fa48("131844") ? this.isRemoveInitialDispatchPhase(operation) && this.repository.isReplaceRemoveDispatchPhase(operation) : stryMutAct_9fa48("131843") ? false : stryMutAct_9fa48("131842") ? true : (stryCov_9fa48("131842", "131843", "131844"), this.isRemoveInitialDispatchPhase(operation) || this.repository.isReplaceRemoveDispatchPhase(operation));
    }
  }

  /**
   * Critical control-plane operations must not rely only on timeout expiry to
   * retry first-hop dispatch progression. When observed replica status is
   * still absent in PENDING/SENDING, proactively re-arm dispatch through the
   * canonical owner path.
   *
   * @param {Object} operation
   * @param {string|null} actualStatus
   * @return {boolean}
   * @private
   */
  shouldRearmDispatchFromProgressReconcile(operation, actualStatus) {
    if (stryMutAct_9fa48("131845")) {
      {}
    } else {
      stryCov_9fa48("131845");
      if (stryMutAct_9fa48("131848") ? false : stryMutAct_9fa48("131847") ? true : stryMutAct_9fa48("131846") ? operation : (stryCov_9fa48("131846", "131847", "131848"), !operation)) {
        if (stryMutAct_9fa48("131849")) {
          {}
        } else {
          stryCov_9fa48("131849");
          return stryMutAct_9fa48("131850") ? true : (stryCov_9fa48("131850"), false);
        }
      }
      const normalizedActualStatus = (stryMutAct_9fa48("131853") ? typeof actualStatus !== TYPEOF.STRING : stryMutAct_9fa48("131852") ? false : stryMutAct_9fa48("131851") ? true : (stryCov_9fa48("131851", "131852", "131853"), typeof actualStatus === TYPEOF.STRING)) ? stryMutAct_9fa48("131854") ? actualStatus.toUpperCase() : (stryCov_9fa48("131854"), actualStatus.toLowerCase()) : actualStatus;
      if (stryMutAct_9fa48("131857") ? (normalizedActualStatus === ReplicaStatus.CREATING || normalizedActualStatus === ReplicaStatus.SYNCING || normalizedActualStatus === ReplicaStatus.ACTIVE) && normalizedActualStatus === ReplicaStatus.FAILED : stryMutAct_9fa48("131856") ? false : stryMutAct_9fa48("131855") ? true : (stryCov_9fa48("131855", "131856", "131857"), (stryMutAct_9fa48("131859") ? (normalizedActualStatus === ReplicaStatus.CREATING || normalizedActualStatus === ReplicaStatus.SYNCING) && normalizedActualStatus === ReplicaStatus.ACTIVE : stryMutAct_9fa48("131858") ? false : (stryCov_9fa48("131858", "131859"), (stryMutAct_9fa48("131861") ? normalizedActualStatus === ReplicaStatus.CREATING && normalizedActualStatus === ReplicaStatus.SYNCING : stryMutAct_9fa48("131860") ? false : (stryCov_9fa48("131860", "131861"), (stryMutAct_9fa48("131863") ? normalizedActualStatus !== ReplicaStatus.CREATING : stryMutAct_9fa48("131862") ? false : (stryCov_9fa48("131862", "131863"), normalizedActualStatus === ReplicaStatus.CREATING)) || (stryMutAct_9fa48("131865") ? normalizedActualStatus !== ReplicaStatus.SYNCING : stryMutAct_9fa48("131864") ? false : (stryCov_9fa48("131864", "131865"), normalizedActualStatus === ReplicaStatus.SYNCING)))) || (stryMutAct_9fa48("131867") ? normalizedActualStatus !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("131866") ? false : (stryCov_9fa48("131866", "131867"), normalizedActualStatus === ReplicaStatus.ACTIVE)))) || (stryMutAct_9fa48("131869") ? normalizedActualStatus !== ReplicaStatus.FAILED : stryMutAct_9fa48("131868") ? false : (stryCov_9fa48("131868", "131869"), normalizedActualStatus === ReplicaStatus.FAILED)))) {
        if (stryMutAct_9fa48("131870")) {
          {}
        } else {
          stryCov_9fa48("131870");
          return stryMutAct_9fa48("131871") ? true : (stryCov_9fa48("131871"), false);
        }
      }
      if (stryMutAct_9fa48("131874") ? false : stryMutAct_9fa48("131873") ? true : stryMutAct_9fa48("131872") ? this.isDispatchRetryableWorkflowStep(operation) : (stryCov_9fa48("131872", "131873", "131874"), !this.isDispatchRetryableWorkflowStep(operation))) {
        if (stryMutAct_9fa48("131875")) {
          {}
        } else {
          stryCov_9fa48("131875");
          return stryMutAct_9fa48("131876") ? true : (stryCov_9fa48("131876"), false);
        }
      }
      if (stryMutAct_9fa48("131878") ? false : stryMutAct_9fa48("131877") ? true : (stryCov_9fa48("131877", "131878"), this.isOperationStepTimedOut(operation))) {
        if (stryMutAct_9fa48("131879")) {
          {}
        } else {
          stryCov_9fa48("131879");
          return stryMutAct_9fa48("131880") ? true : (stryCov_9fa48("131880"), false);
        }
      }
      return this.isCriticalSystemPartition(operation.partitionId);
    }
  }

  /**
   * @param {Object} operation
   * @param {Error|Object} errorLike
   * @return {boolean}
   * @private
   */
  deferDispatchRetry(operation, errorLike) {
    if (stryMutAct_9fa48("131881")) {
      {}
    } else {
      stryCov_9fa48("131881");
      const operationId = stryMutAct_9fa48("131884") ? operation?.operationId && null : stryMutAct_9fa48("131883") ? false : stryMutAct_9fa48("131882") ? true : (stryCov_9fa48("131882", "131883", "131884"), (stryMutAct_9fa48("131885") ? operation.operationId : (stryCov_9fa48("131885"), operation?.operationId)) || null);
      if (stryMutAct_9fa48("131888") ? !operationId && !this.shouldDeferRetryableDispatchFailure(operation, errorLike) : stryMutAct_9fa48("131887") ? false : stryMutAct_9fa48("131886") ? true : (stryCov_9fa48("131886", "131887", "131888"), (stryMutAct_9fa48("131889") ? operationId : (stryCov_9fa48("131889"), !operationId)) || (stryMutAct_9fa48("131890") ? this.shouldDeferRetryableDispatchFailure(operation, errorLike) : (stryCov_9fa48("131890"), !this.shouldDeferRetryableDispatchFailure(operation, errorLike))))) {
        if (stryMutAct_9fa48("131891")) {
          {}
        } else {
          stryCov_9fa48("131891");
          return stryMutAct_9fa48("131892") ? true : (stryCov_9fa48("131892"), false);
        }
      }
      if (stryMutAct_9fa48("131894") ? false : stryMutAct_9fa48("131893") ? true : (stryCov_9fa48("131893", "131894"), this.dispatchRetryTimerByOperationId.has(operationId))) {
        if (stryMutAct_9fa48("131895")) {
          {}
        } else {
          stryCov_9fa48("131895");
          return stryMutAct_9fa48("131896") ? false : (stryCov_9fa48("131896"), true);
        }
      }
      const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
      const delayMs = (stryMutAct_9fa48("131899") ? Number.isFinite(retryAfterMs) || retryAfterMs > NUM.ZERO : stryMutAct_9fa48("131898") ? false : stryMutAct_9fa48("131897") ? true : (stryCov_9fa48("131897", "131898", "131899"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("131902") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("131901") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("131900") ? true : (stryCov_9fa48("131900", "131901", "131902"), retryAfterMs > NUM.ZERO)))) ? retryAfterMs : DISPATCH_RETRY_DELAY_MS;
      const errorMessage = this.normalizeErrorMessage(errorLike, REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED);
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED, stryMutAct_9fa48("131903") ? {} : (stryCov_9fa48("131903"), {
        operationId,
        partitionId: operation.partitionId,
        targetNodeId: operation.targetNodeId,
        workflowStep: operation.workflowStep,
        delayMs,
        errorMessage
      }));
      const timerHandle = this.setTimeoutFn(() => {
        if (stryMutAct_9fa48("131904")) {
          {}
        } else {
          stryCov_9fa48("131904");
          this.dispatchRetryTimerByOperationId.delete(operationId);
          if (stryMutAct_9fa48("131907") ? this.isShuttingDown && !this.isInitialized : stryMutAct_9fa48("131906") ? false : stryMutAct_9fa48("131905") ? true : (stryCov_9fa48("131905", "131906", "131907"), this.isShuttingDown || (stryMutAct_9fa48("131908") ? this.isInitialized : (stryCov_9fa48("131908"), !this.isInitialized)))) {
            if (stryMutAct_9fa48("131909")) {
              {}
            } else {
              stryCov_9fa48("131909");
              return;
            }
          }
          return this.operationWorkflowRunExclusive(this.getOperationOwnerSingleFlightKey(operationId), async () => {
            if (stryMutAct_9fa48("131910")) {
              {}
            } else {
              stryCov_9fa48("131910");
              const currentOperation = await this.getDeferredDispatchRetryOperation(operationId);
              if (stryMutAct_9fa48("131913") ? (!currentOperation || this.repository.isOperationTerminal(currentOperation) || !this.repository.isOperationLocallyOwned(currentOperation)) && !this.isDispatchRetryableWorkflowStep(currentOperation) : stryMutAct_9fa48("131912") ? false : stryMutAct_9fa48("131911") ? true : (stryCov_9fa48("131911", "131912", "131913"), (stryMutAct_9fa48("131915") ? (!currentOperation || this.repository.isOperationTerminal(currentOperation)) && !this.repository.isOperationLocallyOwned(currentOperation) : stryMutAct_9fa48("131914") ? false : (stryCov_9fa48("131914", "131915"), (stryMutAct_9fa48("131917") ? !currentOperation && this.repository.isOperationTerminal(currentOperation) : stryMutAct_9fa48("131916") ? false : (stryCov_9fa48("131916", "131917"), (stryMutAct_9fa48("131918") ? currentOperation : (stryCov_9fa48("131918"), !currentOperation)) || this.repository.isOperationTerminal(currentOperation))) || (stryMutAct_9fa48("131919") ? this.repository.isOperationLocallyOwned(currentOperation) : (stryCov_9fa48("131919"), !this.repository.isOperationLocallyOwned(currentOperation))))) || (stryMutAct_9fa48("131920") ? this.isDispatchRetryableWorkflowStep(currentOperation) : (stryCov_9fa48("131920"), !this.isDispatchRetryableWorkflowStep(currentOperation))))) {
                if (stryMutAct_9fa48("131921")) {
                  {}
                } else {
                  stryCov_9fa48("131921");
                  return;
                }
              }
              await this.runOperationOwnerAction(OPERATION_OWNER_ACTION.DISPATCH, currentOperation, stryMutAct_9fa48("131922") ? {} : (stryCov_9fa48("131922"), {
                boundary: stryMutAct_9fa48("131923") ? "" : (stryCov_9fa48("131923"), 'dispatch_retry'),
                workflowStep: stryMutAct_9fa48("131926") ? currentOperation.workflowStep && null : stryMutAct_9fa48("131925") ? false : stryMutAct_9fa48("131924") ? true : (stryCov_9fa48("131924", "131925", "131926"), currentOperation.workflowStep || null),
                partitionId: stryMutAct_9fa48("131929") ? currentOperation.partitionId && null : stryMutAct_9fa48("131928") ? false : stryMutAct_9fa48("131927") ? true : (stryCov_9fa48("131927", "131928", "131929"), currentOperation.partitionId || null),
                runInlineWhenOwnerLaneHeld: stryMutAct_9fa48("131930") ? false : (stryCov_9fa48("131930"), true)
              }));
            }
          }).catch(retryError => {
            if (stryMutAct_9fa48("131931")) {
              {}
            } else {
              stryCov_9fa48("131931");
              this.handleDeferredDispatchRetryFailure(operation, retryError);
            }
          });
        }
      }, delayMs);
      this.dispatchRetryTimerByOperationId.set(operationId, timerHandle);
      return stryMutAct_9fa48("131932") ? false : (stryCov_9fa48("131932"), true);
    }
  }

  /**
   * Deferred dispatch retries must tolerate cache-lagged reads after durable
   * replica_operations writes. Prefer the authoritative owner row before
   * falling back to the lighter query path so retry timers cannot silently
   * abandon freshly persisted PENDING operations.
   *
   * @param {string} operationId
   * @return {Promise<Object|null>}
   * @private
   */
  async getDeferredDispatchRetryOperation(operationId) {
    if (stryMutAct_9fa48("131933")) {
      {}
    } else {
      stryCov_9fa48("131933");
      const authoritativeOperation = await this.repository.queryAuthoritativeOperationById(operationId, stryMutAct_9fa48("131934") ? {} : (stryCov_9fa48("131934"), {
        requireOwnerRpcRead: stryMutAct_9fa48("131935") ? true : (stryCov_9fa48("131935"), false)
      }));
      if (stryMutAct_9fa48("131937") ? false : stryMutAct_9fa48("131936") ? true : (stryCov_9fa48("131936", "131937"), authoritativeOperation)) {
        if (stryMutAct_9fa48("131938")) {
          {}
        } else {
          stryCov_9fa48("131938");
          return authoritativeOperation;
        }
      }
      return this.repository.queryOperationById(operationId);
    }
  }

  /**
   * @param {Object} operation
   * @param {Error|Object} error
   */
  handleDeferredDispatchRetryFailure(operation, error) {
    if (stryMutAct_9fa48("131939")) {
      {}
    } else {
      stryCov_9fa48("131939");
      if (stryMutAct_9fa48("131941") ? false : stryMutAct_9fa48("131940") ? true : (stryCov_9fa48("131940", "131941"), this.deferDispatchRetry(operation, error))) {
        if (stryMutAct_9fa48("131942")) {
          {}
        } else {
          stryCov_9fa48("131942");
          return;
        }
      }
      if (stryMutAct_9fa48("131944") ? false : stryMutAct_9fa48("131943") ? true : (stryCov_9fa48("131943", "131944"), this.deferTransitionRetry(stryMutAct_9fa48("131947") ? operation?.operationId && null : stryMutAct_9fa48("131946") ? false : stryMutAct_9fa48("131945") ? true : (stryCov_9fa48("131945", "131946", "131947"), (stryMutAct_9fa48("131948") ? operation.operationId : (stryCov_9fa48("131948"), operation?.operationId)) || null), error, stryMutAct_9fa48("131949") ? {} : (stryCov_9fa48("131949"), {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.DISPATCH_RETRY,
        partitionId: stryMutAct_9fa48("131952") ? operation?.partitionId && null : stryMutAct_9fa48("131951") ? false : stryMutAct_9fa48("131950") ? true : (stryCov_9fa48("131950", "131951", "131952"), (stryMutAct_9fa48("131953") ? operation.partitionId : (stryCov_9fa48("131953"), operation?.partitionId)) || null),
        workflowStep: stryMutAct_9fa48("131956") ? operation?.workflowStep && null : stryMutAct_9fa48("131955") ? false : stryMutAct_9fa48("131954") ? true : (stryCov_9fa48("131954", "131955", "131956"), (stryMutAct_9fa48("131957") ? operation.workflowStep : (stryCov_9fa48("131957"), operation?.workflowStep)) || null)
      })))) {
        if (stryMutAct_9fa48("131958")) {
          {}
        } else {
          stryCov_9fa48("131958");
          return;
        }
      }
      this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED, stryMutAct_9fa48("131959") ? {} : (stryCov_9fa48("131959"), {
        operationId: stryMutAct_9fa48("131962") ? operation?.operationId && null : stryMutAct_9fa48("131961") ? false : stryMutAct_9fa48("131960") ? true : (stryCov_9fa48("131960", "131961", "131962"), (stryMutAct_9fa48("131963") ? operation.operationId : (stryCov_9fa48("131963"), operation?.operationId)) || null),
        partitionId: stryMutAct_9fa48("131966") ? operation?.partitionId && null : stryMutAct_9fa48("131965") ? false : stryMutAct_9fa48("131964") ? true : (stryCov_9fa48("131964", "131965", "131966"), (stryMutAct_9fa48("131967") ? operation.partitionId : (stryCov_9fa48("131967"), operation?.partitionId)) || null),
        workflowStep: stryMutAct_9fa48("131970") ? operation?.workflowStep && null : stryMutAct_9fa48("131969") ? false : stryMutAct_9fa48("131968") ? true : (stryCov_9fa48("131968", "131969", "131970"), (stryMutAct_9fa48("131971") ? operation.workflowStep : (stryCov_9fa48("131971"), operation?.workflowStep)) || null),
        error: stryMutAct_9fa48("131974") ? (error?.message || error?.error) && String(error) : stryMutAct_9fa48("131973") ? false : stryMutAct_9fa48("131972") ? true : (stryCov_9fa48("131972", "131973", "131974"), (stryMutAct_9fa48("131976") ? error?.message && error?.error : stryMutAct_9fa48("131975") ? false : (stryCov_9fa48("131975", "131976"), (stryMutAct_9fa48("131977") ? error.message : (stryCov_9fa48("131977"), error?.message)) || (stryMutAct_9fa48("131978") ? error.error : (stryCov_9fa48("131978"), error?.error)))) || String(error))
      }));
    }
  }

  /**
   * Re-enter remove-like operations that were deferred by safety policy.
   * Safety blockers are transient cluster state, not terminal workflow faults.
   *
   * @param {Object} operation
   * @param {string} deferReason
   * @param {string} errorMessage
   * @return {boolean}
   * @private
   */
  scheduleDeferredSafetyRetry(operation, deferReason, errorMessage) {
    if (stryMutAct_9fa48("131979")) {
      {}
    } else {
      stryCov_9fa48("131979");
      const operationId = stryMutAct_9fa48("131982") ? operation?.operationId && null : stryMutAct_9fa48("131981") ? false : stryMutAct_9fa48("131980") ? true : (stryCov_9fa48("131980", "131981", "131982"), (stryMutAct_9fa48("131983") ? operation.operationId : (stryCov_9fa48("131983"), operation?.operationId)) || null);
      if (stryMutAct_9fa48("131986") ? !operationId && !this.isSafetyDeferredRetryableOperation(operation) : stryMutAct_9fa48("131985") ? false : stryMutAct_9fa48("131984") ? true : (stryCov_9fa48("131984", "131985", "131986"), (stryMutAct_9fa48("131987") ? operationId : (stryCov_9fa48("131987"), !operationId)) || (stryMutAct_9fa48("131988") ? this.isSafetyDeferredRetryableOperation(operation) : (stryCov_9fa48("131988"), !this.isSafetyDeferredRetryableOperation(operation))))) {
        if (stryMutAct_9fa48("131989")) {
          {}
        } else {
          stryCov_9fa48("131989");
          return stryMutAct_9fa48("131990") ? true : (stryCov_9fa48("131990"), false);
        }
      }
      if (stryMutAct_9fa48("131992") ? false : stryMutAct_9fa48("131991") ? true : (stryCov_9fa48("131991", "131992"), this.safetyDeferredRetryTimerByOperationId.has(operationId))) {
        if (stryMutAct_9fa48("131993")) {
          {}
        } else {
          stryCov_9fa48("131993");
          return stryMutAct_9fa48("131994") ? false : (stryCov_9fa48("131994"), true);
        }
      }
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED, stryMutAct_9fa48("131995") ? {} : (stryCov_9fa48("131995"), {
        operationId,
        partitionId: operation.partitionId,
        targetNodeId: operation.targetNodeId,
        workflowStep: operation.workflowStep,
        delayMs: SAFETY_DEFERRED_RETRY_DELAY_MS,
        deferReason,
        errorMessage
      }));
      const timerHandle = this.setTimeoutFn(() => {
        if (stryMutAct_9fa48("131996")) {
          {}
        } else {
          stryCov_9fa48("131996");
          this.safetyDeferredRetryTimerByOperationId.delete(operationId);
          if (stryMutAct_9fa48("131999") ? this.isShuttingDown && !this.isInitialized : stryMutAct_9fa48("131998") ? false : stryMutAct_9fa48("131997") ? true : (stryCov_9fa48("131997", "131998", "131999"), this.isShuttingDown || (stryMutAct_9fa48("132000") ? this.isInitialized : (stryCov_9fa48("132000"), !this.isInitialized)))) {
            if (stryMutAct_9fa48("132001")) {
              {}
            } else {
              stryCov_9fa48("132001");
              return;
            }
          }
          return this.operationWorkflowRunExclusive(this.getOperationOwnerSingleFlightKey(operationId), async () => {
            if (stryMutAct_9fa48("132002")) {
              {}
            } else {
              stryCov_9fa48("132002");
              const authoritativeOperation = await this.repository.queryAuthoritativeOperationById(operationId, stryMutAct_9fa48("132003") ? {} : (stryCov_9fa48("132003"), {
                requireOwnerRpcRead: stryMutAct_9fa48("132004") ? true : (stryCov_9fa48("132004"), false)
              }));
              const currentOperation = stryMutAct_9fa48("132007") ? authoritativeOperation && (await this.repository.queryOperationById(operationId)) : stryMutAct_9fa48("132006") ? false : stryMutAct_9fa48("132005") ? true : (stryCov_9fa48("132005", "132006", "132007"), authoritativeOperation || (await this.repository.queryOperationById(operationId)));
              if (stryMutAct_9fa48("132010") ? (!currentOperation || this.repository.isOperationTerminal(currentOperation) || !this.repository.isOperationLocallyOwned(currentOperation)) && !this.isSafetyDeferredRetryableOperation(currentOperation) : stryMutAct_9fa48("132009") ? false : stryMutAct_9fa48("132008") ? true : (stryCov_9fa48("132008", "132009", "132010"), (stryMutAct_9fa48("132012") ? (!currentOperation || this.repository.isOperationTerminal(currentOperation)) && !this.repository.isOperationLocallyOwned(currentOperation) : stryMutAct_9fa48("132011") ? false : (stryCov_9fa48("132011", "132012"), (stryMutAct_9fa48("132014") ? !currentOperation && this.repository.isOperationTerminal(currentOperation) : stryMutAct_9fa48("132013") ? false : (stryCov_9fa48("132013", "132014"), (stryMutAct_9fa48("132015") ? currentOperation : (stryCov_9fa48("132015"), !currentOperation)) || this.repository.isOperationTerminal(currentOperation))) || (stryMutAct_9fa48("132016") ? this.repository.isOperationLocallyOwned(currentOperation) : (stryCov_9fa48("132016"), !this.repository.isOperationLocallyOwned(currentOperation))))) || (stryMutAct_9fa48("132017") ? this.isSafetyDeferredRetryableOperation(currentOperation) : (stryCov_9fa48("132017"), !this.isSafetyDeferredRetryableOperation(currentOperation))))) {
                if (stryMutAct_9fa48("132018")) {
                  {}
                } else {
                  stryCov_9fa48("132018");
                  return;
                }
              }
              await this.runOperationOwnerAction(OPERATION_OWNER_ACTION.EXECUTE, currentOperation, stryMutAct_9fa48("132019") ? {} : (stryCov_9fa48("132019"), {
                boundary: stryMutAct_9fa48("132020") ? "" : (stryCov_9fa48("132020"), 'safety_retry'),
                workflowStep: stryMutAct_9fa48("132023") ? currentOperation.workflowStep && null : stryMutAct_9fa48("132022") ? false : stryMutAct_9fa48("132021") ? true : (stryCov_9fa48("132021", "132022", "132023"), currentOperation.workflowStep || null),
                partitionId: stryMutAct_9fa48("132026") ? currentOperation.partitionId && null : stryMutAct_9fa48("132025") ? false : stryMutAct_9fa48("132024") ? true : (stryCov_9fa48("132024", "132025", "132026"), currentOperation.partitionId || null),
                runInlineWhenOwnerLaneHeld: stryMutAct_9fa48("132027") ? false : (stryCov_9fa48("132027"), true)
              }));
            }
          }).catch(retryError => {
            if (stryMutAct_9fa48("132028")) {
              {}
            } else {
              stryCov_9fa48("132028");
              if (stryMutAct_9fa48("132030") ? false : stryMutAct_9fa48("132029") ? true : (stryCov_9fa48("132029", "132030"), this.deferTransitionRetry(operationId, retryError, stryMutAct_9fa48("132031") ? {} : (stryCov_9fa48("132031"), {
                boundary: stryMutAct_9fa48("132032") ? "" : (stryCov_9fa48("132032"), 'safety_retry'),
                partitionId: stryMutAct_9fa48("132035") ? operation?.partitionId && null : stryMutAct_9fa48("132034") ? false : stryMutAct_9fa48("132033") ? true : (stryCov_9fa48("132033", "132034", "132035"), (stryMutAct_9fa48("132036") ? operation.partitionId : (stryCov_9fa48("132036"), operation?.partitionId)) || null),
                workflowStep: stryMutAct_9fa48("132039") ? operation?.workflowStep && null : stryMutAct_9fa48("132038") ? false : stryMutAct_9fa48("132037") ? true : (stryCov_9fa48("132037", "132038", "132039"), (stryMutAct_9fa48("132040") ? operation.workflowStep : (stryCov_9fa48("132040"), operation?.workflowStep)) || null)
              })))) {
                if (stryMutAct_9fa48("132041")) {
                  {}
                } else {
                  stryCov_9fa48("132041");
                  return;
                }
              }
              this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED, stryMutAct_9fa48("132042") ? {} : (stryCov_9fa48("132042"), {
                operationId,
                partitionId: stryMutAct_9fa48("132045") ? operation?.partitionId && null : stryMutAct_9fa48("132044") ? false : stryMutAct_9fa48("132043") ? true : (stryCov_9fa48("132043", "132044", "132045"), (stryMutAct_9fa48("132046") ? operation.partitionId : (stryCov_9fa48("132046"), operation?.partitionId)) || null),
                workflowStep: stryMutAct_9fa48("132049") ? operation?.workflowStep && null : stryMutAct_9fa48("132048") ? false : stryMutAct_9fa48("132047") ? true : (stryCov_9fa48("132047", "132048", "132049"), (stryMutAct_9fa48("132050") ? operation.workflowStep : (stryCov_9fa48("132050"), operation?.workflowStep)) || null),
                deferReason,
                error: stryMutAct_9fa48("132053") ? (retryError?.message || retryError?.error) && String(retryError) : stryMutAct_9fa48("132052") ? false : stryMutAct_9fa48("132051") ? true : (stryCov_9fa48("132051", "132052", "132053"), (stryMutAct_9fa48("132055") ? retryError?.message && retryError?.error : stryMutAct_9fa48("132054") ? false : (stryCov_9fa48("132054", "132055"), (stryMutAct_9fa48("132056") ? retryError.message : (stryCov_9fa48("132056"), retryError?.message)) || (stryMutAct_9fa48("132057") ? retryError.error : (stryCov_9fa48("132057"), retryError?.error)))) || String(retryError))
              }));
            }
          });
        }
      }, SAFETY_DEFERRED_RETRY_DELAY_MS);
      this.safetyDeferredRetryTimerByOperationId.set(operationId, timerHandle);
      return stryMutAct_9fa48("132058") ? false : (stryCov_9fa48("132058"), true);
    }
  }

  /**
   * @param {Object} operation
   * @param {number} [now=Date.now()]
   * @return {boolean}
   * @private
   */
  isOperationStepTimedOut(operation, now = Date.now()) {
    if (stryMutAct_9fa48("132059")) {
      {}
    } else {
      stryCov_9fa48("132059");
      if (stryMutAct_9fa48("132062") ? false : stryMutAct_9fa48("132061") ? true : stryMutAct_9fa48("132060") ? operation : (stryCov_9fa48("132060", "132061", "132062"), !operation)) {
        if (stryMutAct_9fa48("132063")) {
          {}
        } else {
          stryCov_9fa48("132063");
          return stryMutAct_9fa48("132064") ? true : (stryCov_9fa48("132064"), false);
        }
      }
      if (stryMutAct_9fa48("132066") ? false : stryMutAct_9fa48("132065") ? true : (stryCov_9fa48("132065", "132066"), this.hasActiveTransitionRetryGrace(operation.operationId, now))) {
        if (stryMutAct_9fa48("132067")) {
          {}
        } else {
          stryCov_9fa48("132067");
          return stryMutAct_9fa48("132068") ? true : (stryCov_9fa48("132068"), false);
        }
      }
      const updatedAt = Number(operation.updatedAt);
      if (stryMutAct_9fa48("132071") ? false : stryMutAct_9fa48("132070") ? true : stryMutAct_9fa48("132069") ? Number.isFinite(updatedAt) : (stryCov_9fa48("132069", "132070", "132071"), !Number.isFinite(updatedAt))) {
        if (stryMutAct_9fa48("132072")) {
          {}
        } else {
          stryCov_9fa48("132072");
          return stryMutAct_9fa48("132073") ? true : (stryCov_9fa48("132073"), false);
        }
      }
      return stryMutAct_9fa48("132077") ? now - updatedAt < this.getTimeoutForStep(operation.workflowStep, operation) : stryMutAct_9fa48("132076") ? now - updatedAt > this.getTimeoutForStep(operation.workflowStep, operation) : stryMutAct_9fa48("132075") ? false : stryMutAct_9fa48("132074") ? true : (stryCov_9fa48("132074", "132075", "132076", "132077"), (stryMutAct_9fa48("132078") ? now + updatedAt : (stryCov_9fa48("132078"), now - updatedAt)) >= this.getTimeoutForStep(operation.workflowStep, operation));
    }
  }

  /**
   * Resume one operation through the canonical owner path after a deferred
   * retryable transition failure.
   * @param {string} operationId
   * @return {Promise<void>}
   * @private
   */
  async resumeDeferredTransitionOperation(operationId) {
    if (stryMutAct_9fa48("132079")) {
      {}
    } else {
      stryCov_9fa48("132079");
      const authoritativeOperation = await this.repository.queryAuthoritativeOperationById(operationId, stryMutAct_9fa48("132080") ? {} : (stryCov_9fa48("132080"), {
        requireOwnerRpcRead: stryMutAct_9fa48("132081") ? true : (stryCov_9fa48("132081"), false)
      }));
      const operation = stryMutAct_9fa48("132084") ? authoritativeOperation && (await this.repository.queryOperationById(operationId)) : stryMutAct_9fa48("132083") ? false : stryMutAct_9fa48("132082") ? true : (stryCov_9fa48("132082", "132083", "132084"), authoritativeOperation || (await this.repository.queryOperationById(operationId)));
      if (stryMutAct_9fa48("132087") ? (!operation || this.repository.isOperationTerminal(operation)) && !this.repository.isOperationLocallyOwned(operation) : stryMutAct_9fa48("132086") ? false : stryMutAct_9fa48("132085") ? true : (stryCov_9fa48("132085", "132086", "132087"), (stryMutAct_9fa48("132089") ? !operation && this.repository.isOperationTerminal(operation) : stryMutAct_9fa48("132088") ? false : (stryCov_9fa48("132088", "132089"), (stryMutAct_9fa48("132090") ? operation : (stryCov_9fa48("132090"), !operation)) || this.repository.isOperationTerminal(operation))) || (stryMutAct_9fa48("132091") ? this.repository.isOperationLocallyOwned(operation) : (stryCov_9fa48("132091"), !this.repository.isOperationLocallyOwned(operation))))) {
        if (stryMutAct_9fa48("132092")) {
          {}
        } else {
          stryCov_9fa48("132092");
          return;
        }
      }
      const now = Date.now();
      if (stryMutAct_9fa48("132095") ? this.isDispatchRetryableWorkflowStep(operation) || this.hasActiveTransitionRetryGrace(operationId, now) || !this.isOperationStepTimedOut(operation, now) : stryMutAct_9fa48("132094") ? false : stryMutAct_9fa48("132093") ? true : (stryCov_9fa48("132093", "132094", "132095"), this.isDispatchRetryableWorkflowStep(operation) && (stryMutAct_9fa48("132097") ? this.hasActiveTransitionRetryGrace(operationId, now) && !this.isOperationStepTimedOut(operation, now) : stryMutAct_9fa48("132096") ? true : (stryCov_9fa48("132096", "132097"), this.hasActiveTransitionRetryGrace(operationId, now) || (stryMutAct_9fa48("132098") ? this.isOperationStepTimedOut(operation, now) : (stryCov_9fa48("132098"), !this.isOperationStepTimedOut(operation, now))))))) {
        if (stryMutAct_9fa48("132099")) {
          {}
        } else {
          stryCov_9fa48("132099");
          await this.runOperationOwnerAction(OPERATION_OWNER_ACTION.DISPATCH, operation, stryMutAct_9fa48("132100") ? {} : (stryCov_9fa48("132100"), {
            boundary: OPERATION_WORKFLOW_OWNER_LITERAL.TRANSITION_RETRY_RESUME,
            workflowStep: stryMutAct_9fa48("132103") ? operation.workflowStep && null : stryMutAct_9fa48("132102") ? false : stryMutAct_9fa48("132101") ? true : (stryCov_9fa48("132101", "132102", "132103"), operation.workflowStep || null),
            partitionId: stryMutAct_9fa48("132106") ? operation.partitionId && null : stryMutAct_9fa48("132105") ? false : stryMutAct_9fa48("132104") ? true : (stryCov_9fa48("132104", "132105", "132106"), operation.partitionId || null),
            runInlineWhenOwnerLaneHeld: stryMutAct_9fa48("132107") ? false : (stryCov_9fa48("132107"), true)
          }));
          return;
        }
      }
      await this.reconcileTimeoutOperation(operation, now);
    }
  }

  /**
   * @param {string|null} operationId
   * @param {Error|Object} errorLike
   * @param {Object} [context]
   * @return {boolean}
   * @private
   */
  deferTransitionRetry(operationId, errorLike, context = {}) {
    if (stryMutAct_9fa48("132108")) {
      {}
    } else {
      stryCov_9fa48("132108");
      if (stryMutAct_9fa48("132111") ? !operationId && !isRetryableControlPlaneError(errorLike) : stryMutAct_9fa48("132110") ? false : stryMutAct_9fa48("132109") ? true : (stryCov_9fa48("132109", "132110", "132111"), (stryMutAct_9fa48("132112") ? operationId : (stryCov_9fa48("132112"), !operationId)) || (stryMutAct_9fa48("132113") ? isRetryableControlPlaneError(errorLike) : (stryCov_9fa48("132113"), !isRetryableControlPlaneError(errorLike))))) {
        if (stryMutAct_9fa48("132114")) {
          {}
        } else {
          stryCov_9fa48("132114");
          return stryMutAct_9fa48("132115") ? true : (stryCov_9fa48("132115"), false);
        }
      }
      const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
      const delayMs = (stryMutAct_9fa48("132118") ? Number.isFinite(retryAfterMs) || retryAfterMs > NUM.ZERO : stryMutAct_9fa48("132117") ? false : stryMutAct_9fa48("132116") ? true : (stryCov_9fa48("132116", "132117", "132118"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("132121") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("132120") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("132119") ? true : (stryCov_9fa48("132119", "132120", "132121"), retryAfterMs > NUM.ZERO)))) ? retryAfterMs : TRANSITION_RETRY_DELAY_MS;
      this.recordTransitionRetryGrace(operationId, context, delayMs);
      if (stryMutAct_9fa48("132123") ? false : stryMutAct_9fa48("132122") ? true : (stryCov_9fa48("132122", "132123"), this.transitionRetryTimerByOperationId.has(operationId))) {
        if (stryMutAct_9fa48("132124")) {
          {}
        } else {
          stryCov_9fa48("132124");
          return stryMutAct_9fa48("132125") ? false : (stryCov_9fa48("132125"), true);
        }
      }
      const errorMessage = this.normalizeErrorMessage(errorLike, stryMutAct_9fa48("132126") ? "" : (stryCov_9fa48("132126"), 'Retryable control-plane transition failure'));
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_DEFERRED, stryMutAct_9fa48("132127") ? {} : (stryCov_9fa48("132127"), {
        operationId,
        boundary: stryMutAct_9fa48("132130") ? context.boundary && null : stryMutAct_9fa48("132129") ? false : stryMutAct_9fa48("132128") ? true : (stryCov_9fa48("132128", "132129", "132130"), context.boundary || null),
        partitionId: stryMutAct_9fa48("132133") ? context.partitionId && null : stryMutAct_9fa48("132132") ? false : stryMutAct_9fa48("132131") ? true : (stryCov_9fa48("132131", "132132", "132133"), context.partitionId || null),
        workflowStep: stryMutAct_9fa48("132136") ? context.workflowStep && null : stryMutAct_9fa48("132135") ? false : stryMutAct_9fa48("132134") ? true : (stryCov_9fa48("132134", "132135", "132136"), context.workflowStep || null),
        delayMs,
        errorMessage
      }));
      const timerHandle = this.setTimeoutFn(() => {
        if (stryMutAct_9fa48("132137")) {
          {}
        } else {
          stryCov_9fa48("132137");
          this.transitionRetryTimerByOperationId.delete(operationId);
          if (stryMutAct_9fa48("132140") ? this.isShuttingDown && !this.isInitialized : stryMutAct_9fa48("132139") ? false : stryMutAct_9fa48("132138") ? true : (stryCov_9fa48("132138", "132139", "132140"), this.isShuttingDown || (stryMutAct_9fa48("132141") ? this.isInitialized : (stryCov_9fa48("132141"), !this.isInitialized)))) {
            if (stryMutAct_9fa48("132142")) {
              {}
            } else {
              stryCov_9fa48("132142");
              return;
            }
          }
          return this.operationWorkflowRunExclusive(this.getOperationOwnerSingleFlightKey(operationId), stryMutAct_9fa48("132143") ? () => undefined : (stryCov_9fa48("132143"), () => this.resumeDeferredTransitionOperation(operationId))).catch(retryError => {
            if (stryMutAct_9fa48("132144")) {
              {}
            } else {
              stryCov_9fa48("132144");
              this.handleDeferredTransitionRetryFailure(operationId, retryError, context);
            }
          });
        }
      }, delayMs);
      this.transitionRetryTimerByOperationId.set(operationId, timerHandle);
      return stryMutAct_9fa48("132145") ? false : (stryCov_9fa48("132145"), true);
    }
  }

  /**
   * @param {string|null} operationId
   * @param {Error|Object} error
   * @param {Object} [context]
   */
  handleDeferredTransitionRetryFailure(operationId, error, context = {}) {
    if (stryMutAct_9fa48("132146")) {
      {}
    } else {
      stryCov_9fa48("132146");
      if (stryMutAct_9fa48("132148") ? false : stryMutAct_9fa48("132147") ? true : (stryCov_9fa48("132147", "132148"), this.deferTransitionRetry(operationId, error, context))) {
        if (stryMutAct_9fa48("132149")) {
          {}
        } else {
          stryCov_9fa48("132149");
          return;
        }
      }
      this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TRANSITION_RETRY_FAILED, stryMutAct_9fa48("132150") ? {} : (stryCov_9fa48("132150"), {
        operationId,
        boundary: stryMutAct_9fa48("132153") ? context.boundary && null : stryMutAct_9fa48("132152") ? false : stryMutAct_9fa48("132151") ? true : (stryCov_9fa48("132151", "132152", "132153"), context.boundary || null),
        partitionId: stryMutAct_9fa48("132156") ? context.partitionId && null : stryMutAct_9fa48("132155") ? false : stryMutAct_9fa48("132154") ? true : (stryCov_9fa48("132154", "132155", "132156"), context.partitionId || null),
        workflowStep: stryMutAct_9fa48("132159") ? context.workflowStep && null : stryMutAct_9fa48("132158") ? false : stryMutAct_9fa48("132157") ? true : (stryCov_9fa48("132157", "132158", "132159"), context.workflowStep || null),
        error: stryMutAct_9fa48("132162") ? (error?.message || error?.error) && String(error) : stryMutAct_9fa48("132161") ? false : stryMutAct_9fa48("132160") ? true : (stryCov_9fa48("132160", "132161", "132162"), (stryMutAct_9fa48("132164") ? error?.message && error?.error : stryMutAct_9fa48("132163") ? false : (stryCov_9fa48("132163", "132164"), (stryMutAct_9fa48("132165") ? error.message : (stryCov_9fa48("132165"), error?.message)) || (stryMutAct_9fa48("132166") ? error.error : (stryCov_9fa48("132166"), error?.error)))) || String(error))
      }));
    }
  }

  /**
   * Clone one operation snapshot so owner-side priming can reconcile against
   * the created record without mutating the caller's inserted snapshot.
   * @param {Object|null} operation
   * @return {Object|null}
   * @private
   */
  cloneOperationSnapshot(operation) {
    if (stryMutAct_9fa48("132167")) {
      {}
    } else {
      stryCov_9fa48("132167");
      if (stryMutAct_9fa48("132170") ? !operation && typeof operation !== TYPEOF.OBJECT : stryMutAct_9fa48("132169") ? false : stryMutAct_9fa48("132168") ? true : (stryCov_9fa48("132168", "132169", "132170"), (stryMutAct_9fa48("132171") ? operation : (stryCov_9fa48("132171"), !operation)) || (stryMutAct_9fa48("132173") ? typeof operation === TYPEOF.OBJECT : stryMutAct_9fa48("132172") ? false : (stryCov_9fa48("132172", "132173"), typeof operation !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("132174")) {
          {}
        } else {
          stryCov_9fa48("132174");
          return null;
        }
      }
      return stryMutAct_9fa48("132175") ? {} : (stryCov_9fa48("132175"), {
        ...operation,
        stepsHistory: Array.isArray(operation.stepsHistory) ? stryMutAct_9fa48("132176") ? [] : (stryCov_9fa48("132176"), [...operation.stepsHistory]) : stryMutAct_9fa48("132177") ? ["Stryker was here"] : (stryCov_9fa48("132177"), [])
      });
    }
  }

  /**
   * @param {Object|null} operation
   * @return {string|null}
   * @private
   */
  resolveCoordinatorCreatedOperationOwnerNodeId(operation) {
    if (stryMutAct_9fa48("132178")) {
      {}
    } else {
      stryCov_9fa48("132178");
      if (stryMutAct_9fa48("132181") ? !operation && typeof this.repository?.resolveOperationOwnerNodeId !== TYPEOF.FUNCTION : stryMutAct_9fa48("132180") ? false : stryMutAct_9fa48("132179") ? true : (stryCov_9fa48("132179", "132180", "132181"), (stryMutAct_9fa48("132182") ? operation : (stryCov_9fa48("132182"), !operation)) || (stryMutAct_9fa48("132184") ? typeof this.repository?.resolveOperationOwnerNodeId === TYPEOF.FUNCTION : stryMutAct_9fa48("132183") ? false : (stryCov_9fa48("132183", "132184"), typeof (stryMutAct_9fa48("132185") ? this.repository.resolveOperationOwnerNodeId : (stryCov_9fa48("132185"), this.repository?.resolveOperationOwnerNodeId)) !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("132186")) {
          {}
        } else {
          stryCov_9fa48("132186");
          return null;
        }
      }
      return this.repository.resolveOperationOwnerNodeId(operation);
    }
  }

  /**
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  isCoordinatorCreatedOperationLocallyOwned(operation) {
    if (stryMutAct_9fa48("132187")) {
      {}
    } else {
      stryCov_9fa48("132187");
      const ownerNodeId = this.resolveCoordinatorCreatedOperationOwnerNodeId(operation);
      return stryMutAct_9fa48("132190") ? typeof ownerNodeId === TYPEOF.STRING && ownerNodeId.length > NUM.ZERO || ownerNodeId === this.nodeId : stryMutAct_9fa48("132189") ? false : stryMutAct_9fa48("132188") ? true : (stryCov_9fa48("132188", "132189", "132190"), (stryMutAct_9fa48("132192") ? typeof ownerNodeId === TYPEOF.STRING || ownerNodeId.length > NUM.ZERO : stryMutAct_9fa48("132191") ? true : (stryCov_9fa48("132191", "132192"), (stryMutAct_9fa48("132194") ? typeof ownerNodeId !== TYPEOF.STRING : stryMutAct_9fa48("132193") ? true : (stryCov_9fa48("132193", "132194"), typeof ownerNodeId === TYPEOF.STRING)) && (stryMutAct_9fa48("132197") ? ownerNodeId.length <= NUM.ZERO : stryMutAct_9fa48("132196") ? ownerNodeId.length >= NUM.ZERO : stryMutAct_9fa48("132195") ? true : (stryCov_9fa48("132195", "132196", "132197"), ownerNodeId.length > NUM.ZERO)))) && (stryMutAct_9fa48("132199") ? ownerNodeId !== this.nodeId : stryMutAct_9fa48("132198") ? true : (stryCov_9fa48("132198", "132199"), ownerNodeId === this.nodeId)));
    }
  }

  /**
   * @param {string|null} nodeId
   * @return {string|null}
   * @private
   */
  buildCoordinatorCreatedDispatchIngress(nodeId) {
    if (stryMutAct_9fa48("132200")) {
      {}
    } else {
      stryCov_9fa48("132200");
      const normalizedNodeId = stryMutAct_9fa48("132201") ? String(nodeId || '') : (stryCov_9fa48("132201"), String(stryMutAct_9fa48("132204") ? nodeId && '' : stryMutAct_9fa48("132203") ? false : stryMutAct_9fa48("132202") ? true : (stryCov_9fa48("132202", "132203", "132204"), nodeId || (stryMutAct_9fa48("132205") ? "Stryker was here!" : (stryCov_9fa48("132205"), '')))).trim());
      if (stryMutAct_9fa48("132208") ? normalizedNodeId.length !== NUM.ZERO : stryMutAct_9fa48("132207") ? false : stryMutAct_9fa48("132206") ? true : (stryCov_9fa48("132206", "132207", "132208"), normalizedNodeId.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("132209")) {
          {}
        } else {
          stryCov_9fa48("132209");
          return null;
        }
      }
      return stryMutAct_9fa48("132210") ? `` : (stryCov_9fa48("132210"), `${normalizedNodeId}/service/replica-dispatch`);
    }
  }

  /**
   * @param {Object|null} operation
   * @return {Object}
   * @private
   */
  buildCoordinatorCreatedDispatchRow(operation) {
    if (stryMutAct_9fa48("132211")) {
      {}
    } else {
      stryCov_9fa48("132211");
      let stepsHistory = stryMutAct_9fa48("132212") ? operation.stepsHistory : (stryCov_9fa48("132212"), operation?.stepsHistory);
      if (stryMutAct_9fa48("132215") ? typeof stepsHistory === TYPEOF.STRING : stryMutAct_9fa48("132214") ? false : stryMutAct_9fa48("132213") ? true : (stryCov_9fa48("132213", "132214", "132215"), typeof stepsHistory !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("132216")) {
          {}
        } else {
          stryCov_9fa48("132216");
          stepsHistory = Array.isArray(stepsHistory) ? JSON.stringify(stepsHistory) : OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_JSON_ARRAY;
        }
      }
      return stryMutAct_9fa48("132217") ? {} : (stryCov_9fa48("132217"), {
        operation_id: stryMutAct_9fa48("132220") ? operation?.operationId && null : stryMutAct_9fa48("132219") ? false : stryMutAct_9fa48("132218") ? true : (stryCov_9fa48("132218", "132219", "132220"), (stryMutAct_9fa48("132221") ? operation.operationId : (stryCov_9fa48("132221"), operation?.operationId)) || null),
        type: stryMutAct_9fa48("132224") ? operation?.type && null : stryMutAct_9fa48("132223") ? false : stryMutAct_9fa48("132222") ? true : (stryCov_9fa48("132222", "132223", "132224"), (stryMutAct_9fa48("132225") ? operation.type : (stryCov_9fa48("132225"), operation?.type)) || null),
        partition_id: stryMutAct_9fa48("132228") ? operation?.partitionId && null : stryMutAct_9fa48("132227") ? false : stryMutAct_9fa48("132226") ? true : (stryCov_9fa48("132226", "132227", "132228"), (stryMutAct_9fa48("132229") ? operation.partitionId : (stryCov_9fa48("132229"), operation?.partitionId)) || null),
        replica_id: stryMutAct_9fa48("132230") ? operation.replicaId : (stryCov_9fa48("132230"), operation?.replicaId),
        source_node_id: stryMutAct_9fa48("132231") ? operation.sourceNodeId : (stryCov_9fa48("132231"), operation?.sourceNodeId),
        target_node_id: stryMutAct_9fa48("132232") ? operation.targetNodeId : (stryCov_9fa48("132232"), operation?.targetNodeId),
        status: stryMutAct_9fa48("132233") ? operation.status : (stryCov_9fa48("132233"), operation?.status),
        workflow_step: stryMutAct_9fa48("132236") ? operation?.workflowStep && null : stryMutAct_9fa48("132235") ? false : stryMutAct_9fa48("132234") ? true : (stryCov_9fa48("132234", "132235", "132236"), (stryMutAct_9fa48("132237") ? operation.workflowStep : (stryCov_9fa48("132237"), operation?.workflowStep)) || null),
        created_at: stryMutAct_9fa48("132238") ? operation.createdAt : (stryCov_9fa48("132238"), operation?.createdAt),
        updated_at: stryMutAct_9fa48("132239") ? operation.updatedAt : (stryCov_9fa48("132239"), operation?.updatedAt),
        completed_at: stryMutAct_9fa48("132240") ? operation.completedAt : (stryCov_9fa48("132240"), operation?.completedAt),
        error_message: stryMutAct_9fa48("132241") ? operation.errorMessage : (stryCov_9fa48("132241"), operation?.errorMessage),
        steps_history: stepsHistory,
        entity_type: stryMutAct_9fa48("132242") ? operation.entityType : (stryCov_9fa48("132242"), operation?.entityType),
        entity_id: stryMutAct_9fa48("132243") ? operation.entityId : (stryCov_9fa48("132243"), operation?.entityId)
      });
    }
  }

  /**
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  shouldRetryCoordinatorCreatedRemoteHandoff(operation) {
    if (stryMutAct_9fa48("132244")) {
      {}
    } else {
      stryCov_9fa48("132244");
      return this.isCriticalSystemPartition(stryMutAct_9fa48("132247") ? operation?.partitionId && null : stryMutAct_9fa48("132246") ? false : stryMutAct_9fa48("132245") ? true : (stryCov_9fa48("132245", "132246", "132247"), (stryMutAct_9fa48("132248") ? operation.partitionId : (stryCov_9fa48("132248"), operation?.partitionId)) || null));
    }
  }

  /**
   * @param {Object|null} operation
   * @param {number} delayMs
   * @param {Object} [options={}]
   * @param {boolean} [options.replaceExisting]
   * @return {boolean}
   * @private
   */
  scheduleCoordinatorCreatedRemoteHandoffFollowUp(operation, delayMs, options = {}) {
    if (stryMutAct_9fa48("132249")) {
      {}
    } else {
      stryCov_9fa48("132249");
      const operationId = stryMutAct_9fa48("132252") ? operation?.operationId && null : stryMutAct_9fa48("132251") ? false : stryMutAct_9fa48("132250") ? true : (stryCov_9fa48("132250", "132251", "132252"), (stryMutAct_9fa48("132253") ? operation.operationId : (stryCov_9fa48("132253"), operation?.operationId)) || null);
      if (stryMutAct_9fa48("132256") ? !operationId && !this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) : stryMutAct_9fa48("132255") ? false : stryMutAct_9fa48("132254") ? true : (stryCov_9fa48("132254", "132255", "132256"), (stryMutAct_9fa48("132257") ? operationId : (stryCov_9fa48("132257"), !operationId)) || (stryMutAct_9fa48("132258") ? this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) : (stryCov_9fa48("132258"), !this.shouldRetryCoordinatorCreatedRemoteHandoff(operation))))) {
        if (stryMutAct_9fa48("132259")) {
          {}
        } else {
          stryCov_9fa48("132259");
          return stryMutAct_9fa48("132260") ? true : (stryCov_9fa48("132260"), false);
        }
      }
      const replaceExisting = stryMutAct_9fa48("132263") ? options.replaceExisting !== true : stryMutAct_9fa48("132262") ? false : stryMutAct_9fa48("132261") ? true : (stryCov_9fa48("132261", "132262", "132263"), options.replaceExisting === (stryMutAct_9fa48("132264") ? false : (stryCov_9fa48("132264"), true)));
      if (stryMutAct_9fa48("132266") ? false : stryMutAct_9fa48("132265") ? true : (stryCov_9fa48("132265", "132266"), this.createdOperationHandoffRetryTimerByOperationId.has(operationId))) {
        if (stryMutAct_9fa48("132267")) {
          {}
        } else {
          stryCov_9fa48("132267");
          if (stryMutAct_9fa48("132270") ? false : stryMutAct_9fa48("132269") ? true : stryMutAct_9fa48("132268") ? replaceExisting : (stryCov_9fa48("132268", "132269", "132270"), !replaceExisting)) {
            if (stryMutAct_9fa48("132271")) {
              {}
            } else {
              stryCov_9fa48("132271");
              return stryMutAct_9fa48("132272") ? false : (stryCov_9fa48("132272"), true);
            }
          }
          this.clearCreatedOperationHandoffRetry(operationId);
        }
      }
      const operationSnapshot = stryMutAct_9fa48("132275") ? this.cloneOperationSnapshot(operation) && {
        operationId
      } : stryMutAct_9fa48("132274") ? false : stryMutAct_9fa48("132273") ? true : (stryCov_9fa48("132273", "132274", "132275"), this.cloneOperationSnapshot(operation) || (stryMutAct_9fa48("132276") ? {} : (stryCov_9fa48("132276"), {
        operationId
      })));
      const timerHandle = this.setTimeoutFn(() => {
        if (stryMutAct_9fa48("132277")) {
          {}
        } else {
          stryCov_9fa48("132277");
          this.createdOperationHandoffRetryTimerByOperationId.delete(operationId);
          if (stryMutAct_9fa48("132280") ? this.isShuttingDown && !this.isInitialized : stryMutAct_9fa48("132279") ? false : stryMutAct_9fa48("132278") ? true : (stryCov_9fa48("132278", "132279", "132280"), this.isShuttingDown || (stryMutAct_9fa48("132281") ? this.isInitialized : (stryCov_9fa48("132281"), !this.isInitialized)))) {
            if (stryMutAct_9fa48("132282")) {
              {}
            } else {
              stryCov_9fa48("132282");
              return;
            }
          }
          return this.operationWorkflowRunExclusive(this.getOperationOwnerSingleFlightKey(operationId), stryMutAct_9fa48("132283") ? () => undefined : (stryCov_9fa48("132283"), () => this.armCoordinatorCreatedOperation(operationSnapshot))).catch(retryError => {
            if (stryMutAct_9fa48("132284")) {
              {}
            } else {
              stryCov_9fa48("132284");
              this.handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(operationSnapshot, retryError);
            }
          });
        }
      }, delayMs);
      this.createdOperationHandoffRetryTimerByOperationId.set(operationId, timerHandle);
      return stryMutAct_9fa48("132285") ? false : (stryCov_9fa48("132285"), true);
    }
  }

  /**
   * @param {Object|null} operation
   * @param {Error|Object|null} errorLike
   * @return {boolean}
   * @private
   */
  deferCoordinatorCreatedRemoteHandoffRetry(operation, errorLike) {
    if (stryMutAct_9fa48("132286")) {
      {}
    } else {
      stryCov_9fa48("132286");
      const operationId = stryMutAct_9fa48("132289") ? operation?.operationId && null : stryMutAct_9fa48("132288") ? false : stryMutAct_9fa48("132287") ? true : (stryCov_9fa48("132287", "132288", "132289"), (stryMutAct_9fa48("132290") ? operation.operationId : (stryCov_9fa48("132290"), operation?.operationId)) || null);
      if (stryMutAct_9fa48("132293") ? (!operationId || !this.shouldRetryCoordinatorCreatedRemoteHandoff(operation)) && !isRetryableControlPlaneError(errorLike) : stryMutAct_9fa48("132292") ? false : stryMutAct_9fa48("132291") ? true : (stryCov_9fa48("132291", "132292", "132293"), (stryMutAct_9fa48("132295") ? !operationId && !this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) : stryMutAct_9fa48("132294") ? false : (stryCov_9fa48("132294", "132295"), (stryMutAct_9fa48("132296") ? operationId : (stryCov_9fa48("132296"), !operationId)) || (stryMutAct_9fa48("132297") ? this.shouldRetryCoordinatorCreatedRemoteHandoff(operation) : (stryCov_9fa48("132297"), !this.shouldRetryCoordinatorCreatedRemoteHandoff(operation))))) || (stryMutAct_9fa48("132298") ? isRetryableControlPlaneError(errorLike) : (stryCov_9fa48("132298"), !isRetryableControlPlaneError(errorLike))))) {
        if (stryMutAct_9fa48("132299")) {
          {}
        } else {
          stryCov_9fa48("132299");
          return stryMutAct_9fa48("132300") ? true : (stryCov_9fa48("132300"), false);
        }
      }
      if (stryMutAct_9fa48("132302") ? false : stryMutAct_9fa48("132301") ? true : (stryCov_9fa48("132301", "132302"), this.createdOperationHandoffRetryTimerByOperationId.has(operationId))) {
        if (stryMutAct_9fa48("132303")) {
          {}
        } else {
          stryCov_9fa48("132303");
          return stryMutAct_9fa48("132304") ? false : (stryCov_9fa48("132304"), true);
        }
      }
      const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
      const delayMs = (stryMutAct_9fa48("132307") ? Number.isFinite(retryAfterMs) || retryAfterMs > NUM.ZERO : stryMutAct_9fa48("132306") ? false : stryMutAct_9fa48("132305") ? true : (stryCov_9fa48("132305", "132306", "132307"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("132310") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("132309") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("132308") ? true : (stryCov_9fa48("132308", "132309", "132310"), retryAfterMs > NUM.ZERO)))) ? retryAfterMs : DISPATCH_RETRY_DELAY_MS;
      const errorMessage = this.normalizeErrorMessage(errorLike, REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED);
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_DEFERRED, stryMutAct_9fa48("132311") ? {} : (stryCov_9fa48("132311"), {
        operationId,
        partitionId: stryMutAct_9fa48("132314") ? operation?.partitionId && null : stryMutAct_9fa48("132313") ? false : stryMutAct_9fa48("132312") ? true : (stryCov_9fa48("132312", "132313", "132314"), (stryMutAct_9fa48("132315") ? operation.partitionId : (stryCov_9fa48("132315"), operation?.partitionId)) || null),
        targetNodeId: stryMutAct_9fa48("132318") ? operation?.targetNodeId && null : stryMutAct_9fa48("132317") ? false : stryMutAct_9fa48("132316") ? true : (stryCov_9fa48("132316", "132317", "132318"), (stryMutAct_9fa48("132319") ? operation.targetNodeId : (stryCov_9fa48("132319"), operation?.targetNodeId)) || null),
        workflowStep: stryMutAct_9fa48("132322") ? operation?.workflowStep && null : stryMutAct_9fa48("132321") ? false : stryMutAct_9fa48("132320") ? true : (stryCov_9fa48("132320", "132321", "132322"), (stryMutAct_9fa48("132323") ? operation.workflowStep : (stryCov_9fa48("132323"), operation?.workflowStep)) || null),
        delayMs,
        errorMessage,
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF
      }));
      return this.scheduleCoordinatorCreatedRemoteHandoffFollowUp(operation, delayMs);
    }
  }

  /**
   * @param {Object|null} operation
   * @param {Error|Object} error
   * @private
   */
  handleDeferredCoordinatorCreatedRemoteHandoffRetryFailure(operation, error) {
    if (stryMutAct_9fa48("132324")) {
      {}
    } else {
      stryCov_9fa48("132324");
      if (stryMutAct_9fa48("132326") ? false : stryMutAct_9fa48("132325") ? true : (stryCov_9fa48("132325", "132326"), this.deferCoordinatorCreatedRemoteHandoffRetry(operation, error))) {
        if (stryMutAct_9fa48("132327")) {
          {}
        } else {
          stryCov_9fa48("132327");
          return;
        }
      }
      this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DISPATCH_RETRY_FAILED, stryMutAct_9fa48("132328") ? {} : (stryCov_9fa48("132328"), {
        operationId: stryMutAct_9fa48("132331") ? operation?.operationId && null : stryMutAct_9fa48("132330") ? false : stryMutAct_9fa48("132329") ? true : (stryCov_9fa48("132329", "132330", "132331"), (stryMutAct_9fa48("132332") ? operation.operationId : (stryCov_9fa48("132332"), operation?.operationId)) || null),
        partitionId: stryMutAct_9fa48("132335") ? operation?.partitionId && null : stryMutAct_9fa48("132334") ? false : stryMutAct_9fa48("132333") ? true : (stryCov_9fa48("132333", "132334", "132335"), (stryMutAct_9fa48("132336") ? operation.partitionId : (stryCov_9fa48("132336"), operation?.partitionId)) || null),
        workflowStep: stryMutAct_9fa48("132339") ? operation?.workflowStep && null : stryMutAct_9fa48("132338") ? false : stryMutAct_9fa48("132337") ? true : (stryCov_9fa48("132337", "132338", "132339"), (stryMutAct_9fa48("132340") ? operation.workflowStep : (stryCov_9fa48("132340"), operation?.workflowStep)) || null),
        error: stryMutAct_9fa48("132343") ? (error?.message || error?.error) && String(error) : stryMutAct_9fa48("132342") ? false : stryMutAct_9fa48("132341") ? true : (stryCov_9fa48("132341", "132342", "132343"), (stryMutAct_9fa48("132345") ? error?.message && error?.error : stryMutAct_9fa48("132344") ? false : (stryCov_9fa48("132344", "132345"), (stryMutAct_9fa48("132346") ? error.message : (stryCov_9fa48("132346"), error?.message)) || (stryMutAct_9fa48("132347") ? error.error : (stryCov_9fa48("132347"), error?.error)))) || String(error)),
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_REMOTE_HANDOFF
      }));
    }
  }

  /**
   * @param {Object|null} operation
   * @return {Promise<boolean>}
   * @private
   */
  async wakeCoordinatorCreatedRemoteOwner(operation) {
    if (stryMutAct_9fa48("132348")) {
      {}
    } else {
      stryCov_9fa48("132348");
      if (stryMutAct_9fa48("132351") ? (!operation?.operationId || !this.messageRouter) && typeof this.messageRouter.deliver !== TYPEOF.FUNCTION : stryMutAct_9fa48("132350") ? false : stryMutAct_9fa48("132349") ? true : (stryCov_9fa48("132349", "132350", "132351"), (stryMutAct_9fa48("132353") ? !operation?.operationId && !this.messageRouter : stryMutAct_9fa48("132352") ? false : (stryCov_9fa48("132352", "132353"), (stryMutAct_9fa48("132354") ? operation?.operationId : (stryCov_9fa48("132354"), !(stryMutAct_9fa48("132355") ? operation.operationId : (stryCov_9fa48("132355"), operation?.operationId)))) || (stryMutAct_9fa48("132356") ? this.messageRouter : (stryCov_9fa48("132356"), !this.messageRouter)))) || (stryMutAct_9fa48("132358") ? typeof this.messageRouter.deliver === TYPEOF.FUNCTION : stryMutAct_9fa48("132357") ? false : (stryCov_9fa48("132357", "132358"), typeof this.messageRouter.deliver !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("132359")) {
          {}
        } else {
          stryCov_9fa48("132359");
          return stryMutAct_9fa48("132360") ? true : (stryCov_9fa48("132360"), false);
        }
      }
      const ownerNodeId = this.resolveCoordinatorCreatedOperationOwnerNodeId(operation);
      const target = this.buildCoordinatorCreatedDispatchIngress(ownerNodeId);
      if (stryMutAct_9fa48("132363") ? false : stryMutAct_9fa48("132362") ? true : stryMutAct_9fa48("132361") ? target : (stryCov_9fa48("132361", "132362", "132363"), !target)) {
        if (stryMutAct_9fa48("132364")) {
          {}
        } else {
          stryCov_9fa48("132364");
          return stryMutAct_9fa48("132365") ? true : (stryCov_9fa48("132365"), false);
        }
      }
      const deliveryOptions = stryMutAct_9fa48("132366") ? {} : (stryCov_9fa48("132366"), {
        targetNodeId: ownerNodeId
      });
      if (stryMutAct_9fa48("132368") ? false : stryMutAct_9fa48("132367") ? true : (stryCov_9fa48("132367", "132368"), isPriorityControlPlanePartition(stryMutAct_9fa48("132369") ? {} : (stryCov_9fa48("132369"), {
        partitionId: stryMutAct_9fa48("132372") ? operation.partitionId && null : stryMutAct_9fa48("132371") ? false : stryMutAct_9fa48("132370") ? true : (stryCov_9fa48("132370", "132371", "132372"), operation.partitionId || null)
      })))) {
        if (stryMutAct_9fa48("132373")) {
          {}
        } else {
          stryCov_9fa48("132373");
          deliveryOptions.deliveryPriority = OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL;
        }
      }
      try {
        if (stryMutAct_9fa48("132374")) {
          {}
        } else {
          stryCov_9fa48("132374");
          const response = await this.messageRouter.deliver(target, stryMutAct_9fa48("132375") ? {} : (stryCov_9fa48("132375"), {
            type: ControlPlaneMessageType.REPLICA_OPERATION_DISPATCH,
            [ControlPlaneField.OPERATION_ID]: operation.operationId,
            [ControlPlaneField.OPERATION_ROW]: this.buildCoordinatorCreatedDispatchRow(operation)
          }), deliveryOptions);
          if (stryMutAct_9fa48("132378") ? response?.acknowledged !== false : stryMutAct_9fa48("132377") ? false : stryMutAct_9fa48("132376") ? true : (stryCov_9fa48("132376", "132377", "132378"), (stryMutAct_9fa48("132379") ? response.acknowledged : (stryCov_9fa48("132379"), response?.acknowledged)) === (stryMutAct_9fa48("132380") ? true : (stryCov_9fa48("132380"), false)))) {
            if (stryMutAct_9fa48("132381")) {
              {}
            } else {
              stryCov_9fa48("132381");
              const handoffError = stryMutAct_9fa48("132384") ? response?.error && response : stryMutAct_9fa48("132383") ? false : stryMutAct_9fa48("132382") ? true : (stryCov_9fa48("132382", "132383", "132384"), (stryMutAct_9fa48("132385") ? response.error : (stryCov_9fa48("132385"), response?.error)) || response);
              if (stryMutAct_9fa48("132387") ? false : stryMutAct_9fa48("132386") ? true : (stryCov_9fa48("132386", "132387"), this.deferCoordinatorCreatedRemoteHandoffRetry(operation, handoffError))) {
                if (stryMutAct_9fa48("132388")) {
                  {}
                } else {
                  stryCov_9fa48("132388");
                  return stryMutAct_9fa48("132389") ? true : (stryCov_9fa48("132389"), false);
                }
              }
              throw new Error(this.normalizeErrorMessage(handoffError, REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED));
            }
          }
          this.scheduleCoordinatorCreatedRemoteHandoffFollowUp(operation, COORDINATOR_CREATED_REMOTE_HANDOFF_VERIFICATION_DELAY_MS, stryMutAct_9fa48("132390") ? {} : (stryCov_9fa48("132390"), {
            replaceExisting: stryMutAct_9fa48("132391") ? false : (stryCov_9fa48("132391"), true)
          }));
          return stryMutAct_9fa48("132392") ? false : (stryCov_9fa48("132392"), true);
        }
      } catch (error) {
        if (stryMutAct_9fa48("132393")) {
          {}
        } else {
          stryCov_9fa48("132393");
          if (stryMutAct_9fa48("132395") ? false : stryMutAct_9fa48("132394") ? true : (stryCov_9fa48("132394", "132395"), this.deferCoordinatorCreatedRemoteHandoffRetry(operation, error))) {
            if (stryMutAct_9fa48("132396")) {
              {}
            } else {
              stryCov_9fa48("132396");
              return stryMutAct_9fa48("132397") ? true : (stryCov_9fa48("132397"), false);
            }
          }
          throw error;
        }
      }
    }
  }

  /**
   * Prime a newly created locally owned operation onto the canonical owner
   * transition lane so it does not wait for cache visibility or external
   * dispatch observation before leaving PENDING.
   *
   * The coordinator-created event remains the actual dispatch trigger. This
   * hook only claims the durable workflow step through the owner path.
   *
   * @param {Object|null} operationInput
   * @return {Promise<boolean>}
   */
  async armCoordinatorCreatedOperation(operationInput) {
    if (stryMutAct_9fa48("132398")) {
      {}
    } else {
      stryCov_9fa48("132398");
      const operationId = stryMutAct_9fa48("132401") ? operationInput?.operationId && null : stryMutAct_9fa48("132400") ? false : stryMutAct_9fa48("132399") ? true : (stryCov_9fa48("132399", "132400", "132401"), (stryMutAct_9fa48("132402") ? operationInput.operationId : (stryCov_9fa48("132402"), operationInput?.operationId)) || null);
      if (stryMutAct_9fa48("132405") ? (!operationId || this.isShuttingDown) && !this.isInitialized : stryMutAct_9fa48("132404") ? false : stryMutAct_9fa48("132403") ? true : (stryCov_9fa48("132403", "132404", "132405"), (stryMutAct_9fa48("132407") ? !operationId && this.isShuttingDown : stryMutAct_9fa48("132406") ? false : (stryCov_9fa48("132406", "132407"), (stryMutAct_9fa48("132408") ? operationId : (stryCov_9fa48("132408"), !operationId)) || this.isShuttingDown)) || (stryMutAct_9fa48("132409") ? this.isInitialized : (stryCov_9fa48("132409"), !this.isInitialized)))) {
        if (stryMutAct_9fa48("132410")) {
          {}
        } else {
          stryCov_9fa48("132410");
          return stryMutAct_9fa48("132411") ? true : (stryCov_9fa48("132411"), false);
        }
      }
      const partitionId = stryMutAct_9fa48("132414") ? operationInput?.partitionId && null : stryMutAct_9fa48("132413") ? false : stryMutAct_9fa48("132412") ? true : (stryCov_9fa48("132412", "132413", "132414"), (stryMutAct_9fa48("132415") ? operationInput.partitionId : (stryCov_9fa48("132415"), operationInput?.partitionId)) || null);
      const singleFlightKey = this.getOperationOwnerSingleFlightKey(operationId);
      try {
        if (stryMutAct_9fa48("132416")) {
          {}
        } else {
          stryCov_9fa48("132416");
          return await this.operationWorkflowRunExclusive(singleFlightKey, async () => {
            if (stryMutAct_9fa48("132417")) {
              {}
            } else {
              stryCov_9fa48("132417");
              let operation = await this.repository.queryAuthoritativeOperationById(operationId, stryMutAct_9fa48("132418") ? {} : (stryCov_9fa48("132418"), {
                requireOwnerRpcRead: stryMutAct_9fa48("132419") ? true : (stryCov_9fa48("132419"), false)
              }));
              if (stryMutAct_9fa48("132422") ? false : stryMutAct_9fa48("132421") ? true : stryMutAct_9fa48("132420") ? operation : (stryCov_9fa48("132420", "132421", "132422"), !operation)) {
                if (stryMutAct_9fa48("132423")) {
                  {}
                } else {
                  stryCov_9fa48("132423");
                  operation = this.cloneOperationSnapshot(operationInput);
                }
              }
              if (stryMutAct_9fa48("132426") ? (!operation || this.repository.isOperationTerminal(operation)) && operation.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("132425") ? false : stryMutAct_9fa48("132424") ? true : (stryCov_9fa48("132424", "132425", "132426"), (stryMutAct_9fa48("132428") ? !operation && this.repository.isOperationTerminal(operation) : stryMutAct_9fa48("132427") ? false : (stryCov_9fa48("132427", "132428"), (stryMutAct_9fa48("132429") ? operation : (stryCov_9fa48("132429"), !operation)) || this.repository.isOperationTerminal(operation))) || (stryMutAct_9fa48("132431") ? operation.workflowStep === WORKFLOW_STEP.PENDING : stryMutAct_9fa48("132430") ? false : (stryCov_9fa48("132430", "132431"), operation.workflowStep !== WORKFLOW_STEP.PENDING)))) {
                if (stryMutAct_9fa48("132432")) {
                  {}
                } else {
                  stryCov_9fa48("132432");
                  return stryMutAct_9fa48("132433") ? true : (stryCov_9fa48("132433"), false);
                }
              }
              if (stryMutAct_9fa48("132435") ? false : stryMutAct_9fa48("132434") ? true : (stryCov_9fa48("132434", "132435"), this.isCoordinatorCreatedOperationLocallyOwned(operation))) {
                if (stryMutAct_9fa48("132436")) {
                  {}
                } else {
                  stryCov_9fa48("132436");
                  this.clearCreatedOperationHandoffRetry(operationId);
                  try {
                    if (stryMutAct_9fa48("132437")) {
                      {}
                    } else {
                      stryCov_9fa48("132437");
                      const claimedOperation = await this.claimPendingDispatchOperation(operation);
                      return Boolean(claimedOperation);
                    }
                  } catch (error) {
                    if (stryMutAct_9fa48("132438")) {
                      {}
                    } else {
                      stryCov_9fa48("132438");
                      if (stryMutAct_9fa48("132440") ? false : stryMutAct_9fa48("132439") ? true : (stryCov_9fa48("132439", "132440"), this.deferTransitionRetry(operationId, error, stryMutAct_9fa48("132441") ? {} : (stryCov_9fa48("132441"), {
                        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.COORDINATOR_CREATED_OPERATION,
                        workflowStep: stryMutAct_9fa48("132444") ? operationInput?.workflowStep && null : stryMutAct_9fa48("132443") ? false : stryMutAct_9fa48("132442") ? true : (stryCov_9fa48("132442", "132443", "132444"), (stryMutAct_9fa48("132445") ? operationInput.workflowStep : (stryCov_9fa48("132445"), operationInput?.workflowStep)) || null),
                        partitionId
                      })))) {
                        if (stryMutAct_9fa48("132446")) {
                          {}
                        } else {
                          stryCov_9fa48("132446");
                          return stryMutAct_9fa48("132447") ? true : (stryCov_9fa48("132447"), false);
                        }
                      }
                      throw error;
                    }
                  }
                }
              }
              return this.wakeCoordinatorCreatedRemoteOwner(operation);
            }
          });
        }
      } catch (error) {
        if (stryMutAct_9fa48("132448")) {
          {}
        } else {
          stryCov_9fa48("132448");
          if (stryMutAct_9fa48("132450") ? false : stryMutAct_9fa48("132449") ? true : (stryCov_9fa48("132449", "132450"), this.deferCoordinatorCreatedRemoteHandoffRetry(operationInput, error))) {
            if (stryMutAct_9fa48("132451")) {
              {}
            } else {
              stryCov_9fa48("132451");
              return stryMutAct_9fa48("132452") ? true : (stryCov_9fa48("132452"), false);
            }
          }
          throw error;
        }
      }
    }
  }

  /**
   * @param {string} operationId
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Error|Object} error
   */
  handleObservedProgressFailure(operationId, tableName, cacheOperation, error) {
    if (stryMutAct_9fa48("132453")) {
      {}
    } else {
      stryCov_9fa48("132453");
      if (stryMutAct_9fa48("132455") ? false : stryMutAct_9fa48("132454") ? true : (stryCov_9fa48("132454", "132455"), this.deferObservedProgressRetry(operationId, tableName, cacheOperation, error))) {
        if (stryMutAct_9fa48("132456")) {
          {}
        } else {
          stryCov_9fa48("132456");
          return;
        }
      }
      if (stryMutAct_9fa48("132458") ? false : stryMutAct_9fa48("132457") ? true : (stryCov_9fa48("132457", "132458"), this.deferTransitionRetry(operationId, error, stryMutAct_9fa48("132459") ? {} : (stryCov_9fa48("132459"), {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED_PROGRESS,
        workflowStep: null,
        partitionId: null
      })))) {
        if (stryMutAct_9fa48("132460")) {
          {}
        } else {
          stryCov_9fa48("132460");
          return;
        }
      }
      this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.OBSERVED_PROGRESS_TRANSITION_FAILED, stryMutAct_9fa48("132461") ? {} : (stryCov_9fa48("132461"), {
        operationId,
        tableName,
        cacheOperation,
        error: error.message
      }));
    }
  }

  /**
   * @param {string} operationId
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Error|Object} errorLike
   * @return {boolean}
   */
  deferObservedProgressRetry(operationId, tableName, cacheOperation, errorLike) {
    if (stryMutAct_9fa48("132462")) {
      {}
    } else {
      stryCov_9fa48("132462");
      if (stryMutAct_9fa48("132465") ? !operationId && !isRetryableControlPlaneError(errorLike) : stryMutAct_9fa48("132464") ? false : stryMutAct_9fa48("132463") ? true : (stryCov_9fa48("132463", "132464", "132465"), (stryMutAct_9fa48("132466") ? operationId : (stryCov_9fa48("132466"), !operationId)) || (stryMutAct_9fa48("132467") ? isRetryableControlPlaneError(errorLike) : (stryCov_9fa48("132467"), !isRetryableControlPlaneError(errorLike))))) {
        if (stryMutAct_9fa48("132468")) {
          {}
        } else {
          stryCov_9fa48("132468");
          return stryMutAct_9fa48("132469") ? true : (stryCov_9fa48("132469"), false);
        }
      }
      if (stryMutAct_9fa48("132471") ? false : stryMutAct_9fa48("132470") ? true : (stryCov_9fa48("132470", "132471"), this.observedProgressRetryTimerByOperationId.has(operationId))) {
        if (stryMutAct_9fa48("132472")) {
          {}
        } else {
          stryCov_9fa48("132472");
          return stryMutAct_9fa48("132473") ? false : (stryCov_9fa48("132473"), true);
        }
      }
      const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
      const delayMs = (stryMutAct_9fa48("132476") ? Number.isFinite(retryAfterMs) || retryAfterMs > NUM.ZERO : stryMutAct_9fa48("132475") ? false : stryMutAct_9fa48("132474") ? true : (stryCov_9fa48("132474", "132475", "132476"), Number.isFinite(retryAfterMs) && (stryMutAct_9fa48("132479") ? retryAfterMs <= NUM.ZERO : stryMutAct_9fa48("132478") ? retryAfterMs >= NUM.ZERO : stryMutAct_9fa48("132477") ? true : (stryCov_9fa48("132477", "132478", "132479"), retryAfterMs > NUM.ZERO)))) ? retryAfterMs : OBSERVED_PROGRESS_RETRY_DELAY_MS;
      const timerHandle = this.setTimeoutFn(() => {
        if (stryMutAct_9fa48("132480")) {
          {}
        } else {
          stryCov_9fa48("132480");
          this.observedProgressRetryTimerByOperationId.delete(operationId);
          if (stryMutAct_9fa48("132483") ? this.isShuttingDown && !this.isInitialized : stryMutAct_9fa48("132482") ? false : stryMutAct_9fa48("132481") ? true : (stryCov_9fa48("132481", "132482", "132483"), this.isShuttingDown || (stryMutAct_9fa48("132484") ? this.isInitialized : (stryCov_9fa48("132484"), !this.isInitialized)))) {
            if (stryMutAct_9fa48("132485")) {
              {}
            } else {
              stryCov_9fa48("132485");
              return;
            }
          }
          return this.operationWorkflowRunExclusive(this.getOperationOwnerSingleFlightKey(operationId), stryMutAct_9fa48("132486") ? () => undefined : (stryCov_9fa48("132486"), () => this.reconcileObservedProgressOperation(operationId))).catch(error => {
            if (stryMutAct_9fa48("132487")) {
              {}
            } else {
              stryCov_9fa48("132487");
              this.handleObservedProgressFailure(operationId, tableName, cacheOperation, error);
            }
          });
        }
      }, delayMs);
      this.observedProgressRetryTimerByOperationId.set(operationId, timerHandle);
      return stryMutAct_9fa48("132488") ? false : (stryCov_9fa48("132488"), true);
    }
  }

  /**
   * Resolve the best available replica status for workflow reconciliation.
   * Prefer authoritative reads, but fall back to the observed services cache
   * when the exact target row becomes visible there first.
   *
   * @param {string} replicaId
   * @param {string} partitionId
   * @param {string} targetNodeId
   * @return {Promise<string|null>}
   */
  async getReconciledReplicaStatus(replicaId, partitionId, targetNodeId) {
    if (stryMutAct_9fa48("132489")) {
      {}
    } else {
      stryCov_9fa48("132489");
      if (stryMutAct_9fa48("132492") ? this.repository || typeof this.repository.getActualReplicaObservation === TYPEOF.FUNCTION : stryMutAct_9fa48("132491") ? false : stryMutAct_9fa48("132490") ? true : (stryCov_9fa48("132490", "132491", "132492"), this.repository && (stryMutAct_9fa48("132494") ? typeof this.repository.getActualReplicaObservation !== TYPEOF.FUNCTION : stryMutAct_9fa48("132493") ? true : (stryCov_9fa48("132493", "132494"), typeof this.repository.getActualReplicaObservation === TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("132495")) {
          {}
        } else {
          stryCov_9fa48("132495");
          const observation = await this.repository.getActualReplicaObservation(replicaId, partitionId, targetNodeId);
          if (stryMutAct_9fa48("132498") ? observation?.state !== OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED : stryMutAct_9fa48("132497") ? false : stryMutAct_9fa48("132496") ? true : (stryCov_9fa48("132496", "132497", "132498"), (stryMutAct_9fa48("132499") ? observation.state : (stryCov_9fa48("132499"), observation?.state)) === OPERATION_WORKFLOW_OWNER_LITERAL.OBSERVED)) {
            if (stryMutAct_9fa48("132500")) {
              {}
            } else {
              stryCov_9fa48("132500");
              return observation.lifecycleStatus;
            }
          }
        }
      }
      const actualStatus = await this.getActualReplicaStatus(replicaId, partitionId, targetNodeId);
      if (stryMutAct_9fa48("132503") ? actualStatus === null : stryMutAct_9fa48("132502") ? false : stryMutAct_9fa48("132501") ? true : (stryCov_9fa48("132501", "132502", "132503"), actualStatus !== null)) {
        if (stryMutAct_9fa48("132504")) {
          {}
        } else {
          stryCov_9fa48("132504");
          return actualStatus;
        }
      }
      return this.repository.getObservedReplicaStatusFromCache(replicaId, partitionId, targetNodeId);
    }
  }

  // --- Single-flight key construction ---

  /**
   * Build one operation single-flight key.
   * @param {string} scope - Lock scope prefix.
   * @param {string} key - Scope-specific key.
   * @return {string}
   */
  buildOperationSingleFlightKey(scope, key) {
    if (stryMutAct_9fa48("132505")) {
      {}
    } else {
      stryCov_9fa48("132505");
      return (stryMutAct_9fa48("132506") ? [] : (stryCov_9fa48("132506"), [scope, key])).join(OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR);
    }
  }

  /**
   * @param {string} dedupeKey
   * @return {string}
   */
  getCreateOperationSingleFlightKey(dedupeKey) {
    if (stryMutAct_9fa48("132507")) {
      {}
    } else {
      stryCov_9fa48("132507");
      return this.buildOperationSingleFlightKey(OPERATION_SINGLE_FLIGHT_SCOPE.CREATE, dedupeKey);
    }
  }

  /**
   * @param {string} scope
   * @return {string}
   */
  getCreateBudgetSingleFlightKey(scope) {
    if (stryMutAct_9fa48("132508")) {
      {}
    } else {
      stryCov_9fa48("132508");
      return this.buildOperationSingleFlightKey(OPERATION_SINGLE_FLIGHT_SCOPE.CREATE_BUDGET, scope);
    }
  }

  /**
   * @param {string} operationId
   * @return {string}
   */
  getExecuteOperationSingleFlightKey(operationId) {
    if (stryMutAct_9fa48("132509")) {
      {}
    } else {
      stryCov_9fa48("132509");
      return this.buildOperationSingleFlightKey(OPERATION_SINGLE_FLIGHT_SCOPE.OPERATION, operationId);
    }
  }

  /**
   * @param {string} operationId
   * @return {string}
   */
  getOperationOwnerSingleFlightKey(operationId) {
    if (stryMutAct_9fa48("132510")) {
      {}
    } else {
      stryCov_9fa48("132510");
      return this.buildOperationSingleFlightKey(OPERATION_SINGLE_FLIGHT_SCOPE.OPERATION, operationId);
    }
  }

  /**
   * @param {string|null} operationId
   * @return {boolean}
   * @private
   */
  isOperationOwnerLaneHeld(operationId) {
    if (stryMutAct_9fa48("132511")) {
      {}
    } else {
      stryCov_9fa48("132511");
      const singleFlightKey = operationId ? this.getOperationOwnerSingleFlightKey(operationId) : null;
      const inFlightOwnerKeys = stryMutAct_9fa48("132512") ? this.operationWorkflowCoordinator.inFlightExecutionsByOwnerKey : (stryCov_9fa48("132512"), this.operationWorkflowCoordinator?.inFlightExecutionsByOwnerKey);
      return Boolean(stryMutAct_9fa48("132515") ? singleFlightKey && inFlightOwnerKeys instanceof Map || inFlightOwnerKeys.has(singleFlightKey) : stryMutAct_9fa48("132514") ? false : stryMutAct_9fa48("132513") ? true : (stryCov_9fa48("132513", "132514", "132515"), (stryMutAct_9fa48("132517") ? singleFlightKey || inFlightOwnerKeys instanceof Map : stryMutAct_9fa48("132516") ? true : (stryCov_9fa48("132516", "132517"), singleFlightKey && inFlightOwnerKeys instanceof Map)) && inFlightOwnerKeys.has(singleFlightKey)));
    }
  }

  /**
   * @param {string} action
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   * @private
   */
  invokeOperationOwnerActionInternal(action, operationInput) {
    if (stryMutAct_9fa48("132518")) {
      {}
    } else {
      stryCov_9fa48("132518");
      if (stryMutAct_9fa48("132521") ? action !== OPERATION_OWNER_ACTION.DISPATCH : stryMutAct_9fa48("132520") ? false : stryMutAct_9fa48("132519") ? true : (stryCov_9fa48("132519", "132520", "132521"), action === OPERATION_OWNER_ACTION.DISPATCH)) {
        if (stryMutAct_9fa48("132522")) {
          {}
        } else {
          stryCov_9fa48("132522");
          return this.dispatchOperationInternal(operationInput);
        }
      }
      if (stryMutAct_9fa48("132525") ? action !== OPERATION_OWNER_ACTION.EXECUTE : stryMutAct_9fa48("132524") ? false : stryMutAct_9fa48("132523") ? true : (stryCov_9fa48("132523", "132524", "132525"), action === OPERATION_OWNER_ACTION.EXECUTE)) {
        if (stryMutAct_9fa48("132526")) {
          {}
        } else {
          stryCov_9fa48("132526");
          return this.executeOperationInternal(operationInput);
        }
      }
      throw new Error(stryMutAct_9fa48("132527") ? `` : (stryCov_9fa48("132527"), `Unknown operation owner action: ${action}`));
    }
  }

  /**
   * Route one dispatch/execute request through the canonical owner lane.
   * Reconcile callers may execute inline when they already hold the owner key.
   *
   * @param {string} action
   * @param {string|Object} operationInput
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async runOperationOwnerAction(action, operationInput, options = {}) {
    if (stryMutAct_9fa48("132528")) {
      {}
    } else {
      stryCov_9fa48("132528");
      const operationId = this.getOperationIdFromInput(operationInput);
      const ownerLaneHeld = this.isOperationOwnerLaneHeld(operationId);
      if (stryMutAct_9fa48("132531") ? ownerLaneHeld || options.skipWhenOwnerLaneHeld === true : stryMutAct_9fa48("132530") ? false : stryMutAct_9fa48("132529") ? true : (stryCov_9fa48("132529", "132530", "132531"), ownerLaneHeld && (stryMutAct_9fa48("132533") ? options.skipWhenOwnerLaneHeld !== true : stryMutAct_9fa48("132532") ? true : (stryCov_9fa48("132532", "132533"), options.skipWhenOwnerLaneHeld === (stryMutAct_9fa48("132534") ? false : (stryCov_9fa48("132534"), true)))))) {
        if (stryMutAct_9fa48("132535")) {
          {}
        } else {
          stryCov_9fa48("132535");
          return this.buildSkippedOperationResult(REBALANCER_SKIP_REASON.OPERATION_ALREADY_EXECUTING, operationId);
        }
      }
      const invokeAction = stryMutAct_9fa48("132536") ? () => undefined : (stryCov_9fa48("132536"), (() => {
        const invokeAction = () => this.invokeOperationOwnerActionInternal(action, operationInput);
        return invokeAction;
      })());
      try {
        if (stryMutAct_9fa48("132537")) {
          {}
        } else {
          stryCov_9fa48("132537");
          if (stryMutAct_9fa48("132540") ? !operationId && ownerLaneHeld && options.runInlineWhenOwnerLaneHeld === true : stryMutAct_9fa48("132539") ? false : stryMutAct_9fa48("132538") ? true : (stryCov_9fa48("132538", "132539", "132540"), (stryMutAct_9fa48("132541") ? operationId : (stryCov_9fa48("132541"), !operationId)) || (stryMutAct_9fa48("132543") ? ownerLaneHeld || options.runInlineWhenOwnerLaneHeld === true : stryMutAct_9fa48("132542") ? false : (stryCov_9fa48("132542", "132543"), ownerLaneHeld && (stryMutAct_9fa48("132545") ? options.runInlineWhenOwnerLaneHeld !== true : stryMutAct_9fa48("132544") ? true : (stryCov_9fa48("132544", "132545"), options.runInlineWhenOwnerLaneHeld === (stryMutAct_9fa48("132546") ? false : (stryCov_9fa48("132546"), true)))))))) {
            if (stryMutAct_9fa48("132547")) {
              {}
            } else {
              stryCov_9fa48("132547");
              return await invokeAction();
            }
          }
          return await this.operationWorkflowRunExclusive(this.getOperationOwnerSingleFlightKey(operationId), invokeAction);
        }
      } catch (error) {
        if (stryMutAct_9fa48("132548")) {
          {}
        } else {
          stryCov_9fa48("132548");
          if (stryMutAct_9fa48("132550") ? false : stryMutAct_9fa48("132549") ? true : (stryCov_9fa48("132549", "132550"), this.deferTransitionRetry(operationId, error, stryMutAct_9fa48("132551") ? {} : (stryCov_9fa48("132551"), {
            boundary: stryMutAct_9fa48("132554") ? options.boundary && action : stryMutAct_9fa48("132553") ? false : stryMutAct_9fa48("132552") ? true : (stryCov_9fa48("132552", "132553", "132554"), options.boundary || action),
            workflowStep: stryMutAct_9fa48("132557") ? options.workflowStep && null : stryMutAct_9fa48("132556") ? false : stryMutAct_9fa48("132555") ? true : (stryCov_9fa48("132555", "132556", "132557"), options.workflowStep || null),
            partitionId: stryMutAct_9fa48("132560") ? options.partitionId && null : stryMutAct_9fa48("132559") ? false : stryMutAct_9fa48("132558") ? true : (stryCov_9fa48("132558", "132559", "132560"), options.partitionId || null)
          })))) {
            if (stryMutAct_9fa48("132561")) {
              {}
            } else {
              stryCov_9fa48("132561");
              return this.buildSkippedOperationResult(REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING, operationId, stryMutAct_9fa48("132562") ? {} : (stryCov_9fa48("132562"), {
                error: this.normalizeErrorMessage(error, OPERATION_WORKFLOW_OWNER_LITERAL.RETRYABLE_CONTROL_DASH_PLANE_TRANSITION_FAILURE)
              }));
            }
          }
          throw error;
        }
      }
    }
  }

  /**
   * Build one skipped-operation result.
   * @param {string} reason
   * @param {string|null} operationId
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildSkippedOperationResult(reason, operationId, extra = {}) {
    if (stryMutAct_9fa48("132563")) {
      {}
    } else {
      stryCov_9fa48("132563");
      return stryMutAct_9fa48("132564") ? {} : (stryCov_9fa48("132564"), {
        success: stryMutAct_9fa48("132565") ? true : (stryCov_9fa48("132565"), false),
        skipped: stryMutAct_9fa48("132566") ? false : (stryCov_9fa48("132566"), true),
        reason,
        operationId,
        ...extra
      });
    }
  }

  /**
   * Build one successful operation result.
   * @param {string|null} operationId
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildSuccessfulOperationResult(operationId, extra = {}) {
    if (stryMutAct_9fa48("132567")) {
      {}
    } else {
      stryCov_9fa48("132567");
      return stryMutAct_9fa48("132568") ? {} : (stryCov_9fa48("132568"), {
        success: stryMutAct_9fa48("132569") ? false : (stryCov_9fa48("132569"), true),
        operationId,
        ...extra
      });
    }
  }

  /**
   * Build one failed operation result.
   * @param {string|null} operationId
   * @param {string|Error|Object} error
   * @param {Object} [extra={}]
   * @return {Object}
   * @private
   */
  buildFailedOperationResult(operationId, error, extra = {}) {
    if (stryMutAct_9fa48("132570")) {
      {}
    } else {
      stryCov_9fa48("132570");
      return stryMutAct_9fa48("132571") ? {} : (stryCov_9fa48("132571"), {
        success: stryMutAct_9fa48("132572") ? true : (stryCov_9fa48("132572"), false),
        operationId,
        error,
        ...extra
      });
    }
  }

  /**
   * Delay authoritative empty-owner scans until the cache has had one bounded
   * chance to observe local replica_operations rows. An empty cache is not
   * proof of zero operations; it is only a reason to wait briefly.
   * @param {number} [now=Date.now()]
   * @return {boolean}
   */
  shouldDelayEmptyIncompleteOperationQuery(now = Date.now()) {
    if (stryMutAct_9fa48("132573")) {
      {}
    } else {
      stryCov_9fa48("132573");
      if (stryMutAct_9fa48("132577") ? this.incompleteOperationQueryEmptyBackoffMs > NUM.ZERO : stryMutAct_9fa48("132576") ? this.incompleteOperationQueryEmptyBackoffMs < NUM.ZERO : stryMutAct_9fa48("132575") ? false : stryMutAct_9fa48("132574") ? true : (stryCov_9fa48("132574", "132575", "132576", "132577"), this.incompleteOperationQueryEmptyBackoffMs <= NUM.ZERO)) {
        if (stryMutAct_9fa48("132578")) {
          {}
        } else {
          stryCov_9fa48("132578");
          return stryMutAct_9fa48("132579") ? true : (stryCov_9fa48("132579"), false);
        }
      }
      if (stryMutAct_9fa48("132583") ? this.lastEmptyIncompleteOperationQueryAtMs > NUM.ZERO : stryMutAct_9fa48("132582") ? this.lastEmptyIncompleteOperationQueryAtMs < NUM.ZERO : stryMutAct_9fa48("132581") ? false : stryMutAct_9fa48("132580") ? true : (stryCov_9fa48("132580", "132581", "132582", "132583"), this.lastEmptyIncompleteOperationQueryAtMs <= NUM.ZERO)) {
        if (stryMutAct_9fa48("132584")) {
          {}
        } else {
          stryCov_9fa48("132584");
          this.lastEmptyIncompleteOperationQueryAtMs = now;
          return stryMutAct_9fa48("132585") ? false : (stryCov_9fa48("132585"), true);
        }
      }
      if (stryMutAct_9fa48("132589") ? now - this.lastEmptyIncompleteOperationQueryAtMs >= this.incompleteOperationQueryEmptyBackoffMs : stryMutAct_9fa48("132588") ? now - this.lastEmptyIncompleteOperationQueryAtMs <= this.incompleteOperationQueryEmptyBackoffMs : stryMutAct_9fa48("132587") ? false : stryMutAct_9fa48("132586") ? true : (stryCov_9fa48("132586", "132587", "132588", "132589"), (stryMutAct_9fa48("132590") ? now + this.lastEmptyIncompleteOperationQueryAtMs : (stryCov_9fa48("132590"), now - this.lastEmptyIncompleteOperationQueryAtMs)) < this.incompleteOperationQueryEmptyBackoffMs)) {
        if (stryMutAct_9fa48("132591")) {
          {}
        } else {
          stryCov_9fa48("132591");
          return stryMutAct_9fa48("132592") ? false : (stryCov_9fa48("132592"), true);
        }
      }
      this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
      return stryMutAct_9fa48("132593") ? true : (stryCov_9fa48("132593"), false);
    }
  }

  /**
   * Clear bounded empty-owner scan deferral once local work is observed.
   * @return {void}
   */
  clearEmptyIncompleteOperationQueryDelay() {
    if (stryMutAct_9fa48("132594")) {
      {}
    } else {
      stryCov_9fa48("132594");
      this.lastEmptyIncompleteOperationQueryAtMs = NUM.ZERO;
    }
  }

  /**
   * Merge cache-visible and authoritative incomplete operation sets.
   * Authoritative rows win when both sources contain the same operation ID.
   *
   * Timeout and recovery reconciliation must not assume a non-empty local
   * cache is complete. Cache observation boundaries can lag individual
   * replica_operations rows even while some in-flight work is already visible.
   *
   * @param {Array<Object>} cachedIncompleteOps
   * @param {Array<Object>} authoritativeIncompleteOps
   * @return {Array<Object>}
   */
  mergeIncompleteOperations(cachedIncompleteOps = stryMutAct_9fa48("132595") ? ["Stryker was here"] : (stryCov_9fa48("132595"), []), authoritativeIncompleteOps = stryMutAct_9fa48("132596") ? ["Stryker was here"] : (stryCov_9fa48("132596"), [])) {
    if (stryMutAct_9fa48("132597")) {
      {}
    } else {
      stryCov_9fa48("132597");
      const mergedByOperationId = new Map();
      for (const operation of cachedIncompleteOps) {
        if (stryMutAct_9fa48("132598")) {
          {}
        } else {
          stryCov_9fa48("132598");
          if (stryMutAct_9fa48("132601") ? false : stryMutAct_9fa48("132600") ? true : stryMutAct_9fa48("132599") ? operation?.operationId : (stryCov_9fa48("132599", "132600", "132601"), !(stryMutAct_9fa48("132602") ? operation.operationId : (stryCov_9fa48("132602"), operation?.operationId)))) {
            if (stryMutAct_9fa48("132603")) {
              {}
            } else {
              stryCov_9fa48("132603");
              continue;
            }
          }
          mergedByOperationId.set(operation.operationId, operation);
        }
      }
      for (const operation of authoritativeIncompleteOps) {
        if (stryMutAct_9fa48("132604")) {
          {}
        } else {
          stryCov_9fa48("132604");
          if (stryMutAct_9fa48("132607") ? false : stryMutAct_9fa48("132606") ? true : stryMutAct_9fa48("132605") ? operation?.operationId : (stryCov_9fa48("132605", "132606", "132607"), !(stryMutAct_9fa48("132608") ? operation.operationId : (stryCov_9fa48("132608"), operation?.operationId)))) {
            if (stryMutAct_9fa48("132609")) {
              {}
            } else {
              stryCov_9fa48("132609");
              continue;
            }
          }
          mergedByOperationId.set(operation.operationId, operation);
        }
      }
      return stryMutAct_9fa48("132610") ? [...mergedByOperationId.values()] : (stryCov_9fa48("132610"), (stryMutAct_9fa48("132611") ? [] : (stryCov_9fa48("132611"), [...mergedByOperationId.values()])).sort((left, right) => {
        if (stryMutAct_9fa48("132612")) {
          {}
        } else {
          stryCov_9fa48("132612");
          const leftUpdatedAt = stryMutAct_9fa48("132615") ? Number(left?.updatedAt) && NUM.ZERO : stryMutAct_9fa48("132614") ? false : stryMutAct_9fa48("132613") ? true : (stryCov_9fa48("132613", "132614", "132615"), Number(stryMutAct_9fa48("132616") ? left.updatedAt : (stryCov_9fa48("132616"), left?.updatedAt)) || NUM.ZERO);
          const rightUpdatedAt = stryMutAct_9fa48("132619") ? Number(right?.updatedAt) && NUM.ZERO : stryMutAct_9fa48("132618") ? false : stryMutAct_9fa48("132617") ? true : (stryCov_9fa48("132617", "132618", "132619"), Number(stryMutAct_9fa48("132620") ? right.updatedAt : (stryCov_9fa48("132620"), right?.updatedAt)) || NUM.ZERO);
          if (stryMutAct_9fa48("132623") ? leftUpdatedAt === rightUpdatedAt : stryMutAct_9fa48("132622") ? false : stryMutAct_9fa48("132621") ? true : (stryCov_9fa48("132621", "132622", "132623"), leftUpdatedAt !== rightUpdatedAt)) {
            if (stryMutAct_9fa48("132624")) {
              {}
            } else {
              stryCov_9fa48("132624");
              return stryMutAct_9fa48("132625") ? leftUpdatedAt + rightUpdatedAt : (stryCov_9fa48("132625"), leftUpdatedAt - rightUpdatedAt);
            }
          }
          return String(stryMutAct_9fa48("132628") ? left?.operationId && OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING : stryMutAct_9fa48("132627") ? false : stryMutAct_9fa48("132626") ? true : (stryCov_9fa48("132626", "132627", "132628"), (stryMutAct_9fa48("132629") ? left.operationId : (stryCov_9fa48("132629"), left?.operationId)) || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING)).localeCompare(String(stryMutAct_9fa48("132632") ? right?.operationId && OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING : stryMutAct_9fa48("132631") ? false : stryMutAct_9fa48("132630") ? true : (stryCov_9fa48("132630", "132631", "132632"), (stryMutAct_9fa48("132633") ? right.operationId : (stryCov_9fa48("132633"), right?.operationId)) || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING)));
        }
      }));
    }
  }

  // --- Workflow step advancement ---

  /**
   * Register an operation as a workflow if not already tracked.
   * @param {Object} operation - Operation record.
   */
  ensureOperationWorkflow(operation) {
    if (stryMutAct_9fa48("132634")) {
      {}
    } else {
      stryCov_9fa48("132634");
      const workflowId = operation.operationId;
      if (stryMutAct_9fa48("132636") ? false : stryMutAct_9fa48("132635") ? true : (stryCov_9fa48("132635", "132636"), this.operationWorkflowCoordinator.getWorkflowById(workflowId))) {
        if (stryMutAct_9fa48("132637")) {
          {}
        } else {
          stryCov_9fa48("132637");
          return;
        }
      }
      const record = stryMutAct_9fa48("132638") ? {} : (stryCov_9fa48("132638"), {
        workflowId,
        ownerKey: workflowId,
        step: stryMutAct_9fa48("132641") ? operation.workflowStep && null : stryMutAct_9fa48("132640") ? false : stryMutAct_9fa48("132639") ? true : (stryCov_9fa48("132639", "132640", "132641"), operation.workflowStep || null),
        transitionHistory: stryMutAct_9fa48("132642") ? ["Stryker was here"] : (stryCov_9fa48("132642"), [])
      });
      const workflow = this.operationWorkflowCoordinator.createWorkflowRecord(record);
      this.operationWorkflowCoordinator.setWorkflowState(workflow);
    }
  }

  /**
   * Resolve a canonical transition reason from step progression.
   * @param {string} previousStep
   * @param {string} nextStep
   * @return {string}
   */
  resolveTransitionReason(previousStep, nextStep) {
    if (stryMutAct_9fa48("132643")) {
      {}
    } else {
      stryCov_9fa48("132643");
      if (stryMutAct_9fa48("132646") ? nextStep !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("132645") ? false : stryMutAct_9fa48("132644") ? true : (stryCov_9fa48("132644", "132645", "132646"), nextStep === WORKFLOW_STEP.SENDING)) {
        if (stryMutAct_9fa48("132647")) {
          {}
        } else {
          stryCov_9fa48("132647");
          return OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
        }
      }
      if (stryMutAct_9fa48("132650") ? nextStep !== WORKFLOW_STEP.CREATING : stryMutAct_9fa48("132649") ? false : stryMutAct_9fa48("132648") ? true : (stryCov_9fa48("132648", "132649", "132650"), nextStep === WORKFLOW_STEP.CREATING)) {
        if (stryMutAct_9fa48("132651")) {
          {}
        } else {
          stryCov_9fa48("132651");
          return OPERATION_TRANSITION_REASON.DISPATCH_CREATING;
        }
      }
      if (stryMutAct_9fa48("132654") ? nextStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("132653") ? false : stryMutAct_9fa48("132652") ? true : (stryCov_9fa48("132652", "132653", "132654"), nextStep === WORKFLOW_STEP.STOPPING)) {
        if (stryMutAct_9fa48("132655")) {
          {}
        } else {
          stryCov_9fa48("132655");
          return OPERATION_TRANSITION_REASON.DISPATCH_STOPPING;
        }
      }
      if (stryMutAct_9fa48("132658") ? nextStep === WORKFLOW_STEP.ACTIVE || previousStep === WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("132657") ? false : stryMutAct_9fa48("132656") ? true : (stryCov_9fa48("132656", "132657", "132658"), (stryMutAct_9fa48("132660") ? nextStep !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("132659") ? true : (stryCov_9fa48("132659", "132660"), nextStep === WORKFLOW_STEP.ACTIVE)) && (stryMutAct_9fa48("132662") ? previousStep !== WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("132661") ? true : (stryCov_9fa48("132661", "132662"), previousStep === WORKFLOW_STEP.SYNCING)))) {
        if (stryMutAct_9fa48("132663")) {
          {}
        } else {
          stryCov_9fa48("132663");
          return OPERATION_TRANSITION_REASON.RECONCILE_ACTIVE;
        }
      }
      if (stryMutAct_9fa48("132666") ? nextStep !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("132665") ? false : stryMutAct_9fa48("132664") ? true : (stryCov_9fa48("132664", "132665", "132666"), nextStep === WORKFLOW_STEP.ACTIVE)) {
        if (stryMutAct_9fa48("132667")) {
          {}
        } else {
          stryCov_9fa48("132667");
          return OPERATION_TRANSITION_REASON.DISPATCH_ALREADY_EXISTS;
        }
      }
      if (stryMutAct_9fa48("132670") ? nextStep !== WORKFLOW_STEP.REMOVED : stryMutAct_9fa48("132669") ? false : stryMutAct_9fa48("132668") ? true : (stryCov_9fa48("132668", "132669", "132670"), nextStep === WORKFLOW_STEP.REMOVED)) {
        if (stryMutAct_9fa48("132671")) {
          {}
        } else {
          stryCov_9fa48("132671");
          return OPERATION_TRANSITION_REASON.OPERATION_COMPLETED;
        }
      }
      if (stryMutAct_9fa48("132674") ? nextStep !== WORKFLOW_STEP.FAILED : stryMutAct_9fa48("132673") ? false : stryMutAct_9fa48("132672") ? true : (stryCov_9fa48("132672", "132673", "132674"), nextStep === WORKFLOW_STEP.FAILED)) {
        if (stryMutAct_9fa48("132675")) {
          {}
        } else {
          stryCov_9fa48("132675");
          return OPERATION_TRANSITION_REASON.OPERATION_FAILED;
        }
      }
      return OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
    }
  }

  /**
   * Build one stable owner key for transition-attempt tracking.
   * @param {string} operationId
   * @param {string} step
   * @return {string}
   */
  buildTransitionExecutionStepOwnerKey(operationId, step) {
    if (stryMutAct_9fa48("132676")) {
      {}
    } else {
      stryCov_9fa48("132676");
      return (stryMutAct_9fa48("132677") ? [] : (stryCov_9fa48("132677"), [String(stryMutAct_9fa48("132680") ? operationId && OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING : stryMutAct_9fa48("132679") ? false : stryMutAct_9fa48("132678") ? true : (stryCov_9fa48("132678", "132679", "132680"), operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING)), String(stryMutAct_9fa48("132683") ? step && OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING : stryMutAct_9fa48("132682") ? false : stryMutAct_9fa48("132681") ? true : (stryCov_9fa48("132681", "132682", "132683"), step || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING))])).join(OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR);
    }
  }

  /**
   * Get or allocate the current execution attempt number for one
   * operation/step key.
   * @param {string} operationId
   * @param {string} step
   * @return {number}
   */
  reserveTransitionExecutionAttempt(operationId, step) {
    if (stryMutAct_9fa48("132684")) {
      {}
    } else {
      stryCov_9fa48("132684");
      const ownerKey = this.buildTransitionExecutionStepOwnerKey(operationId, step);
      const currentAttempt = this.transitionExecutionAttemptByStepOwnerKey.get(ownerKey);
      if (stryMutAct_9fa48("132687") ? Number.isInteger(currentAttempt) || currentAttempt >= NUM.ONE : stryMutAct_9fa48("132686") ? false : stryMutAct_9fa48("132685") ? true : (stryCov_9fa48("132685", "132686", "132687"), Number.isInteger(currentAttempt) && (stryMutAct_9fa48("132690") ? currentAttempt < NUM.ONE : stryMutAct_9fa48("132689") ? currentAttempt > NUM.ONE : stryMutAct_9fa48("132688") ? true : (stryCov_9fa48("132688", "132689", "132690"), currentAttempt >= NUM.ONE)))) {
        if (stryMutAct_9fa48("132691")) {
          {}
        } else {
          stryCov_9fa48("132691");
          return currentAttempt;
        }
      }
      this.transitionExecutionAttemptByStepOwnerKey.set(ownerKey, NUM.ONE);
      return NUM.ONE;
    }
  }

  /**
   * Rotate the execution attempt number after a direct session collision.
   * @param {string} operationId
   * @param {string} step
   * @return {number}
   */
  rotateTransitionExecutionAttempt(operationId, step) {
    if (stryMutAct_9fa48("132692")) {
      {}
    } else {
      stryCov_9fa48("132692");
      const ownerKey = this.buildTransitionExecutionStepOwnerKey(operationId, step);
      const nextAttempt = stryMutAct_9fa48("132693") ? this.reserveTransitionExecutionAttempt(operationId, step) - NUM.ONE : (stryCov_9fa48("132693"), this.reserveTransitionExecutionAttempt(operationId, step) + NUM.ONE);
      this.transitionExecutionAttemptByStepOwnerKey.set(ownerKey, nextAttempt);
      return nextAttempt;
    }
  }

  /**
   * Rotate the transition execution attempt after a stale-session collision and
   * emit one canonical diagnostic with the next attempt number.
   * @param {string} operationId
   * @param {string} step
   * @param {string} sessionId
   * @param {*} errorLike
   * @return {number}
   */
  rotateTransitionExecutionAttemptAfterStaleSessionConflict(operationId, step, sessionId, errorLike) {
    if (stryMutAct_9fa48("132694")) {
      {}
    } else {
      stryCov_9fa48("132694");
      const nextAttempt = this.rotateTransitionExecutionAttempt(operationId, step);
      stryMutAct_9fa48("132696") ? this.logger.warn?.(OPERATION_WORKFLOW_OWNER_LITERAL.ROTATING_TRANSITION_EXECUTION_SESSION_AFTER_STALE_SESSION_COLLISION, {
        operationId,
        workflowStep: step,
        sessionId,
        nextAttempt,
        error: this.normalizeErrorMessage(errorLike, OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING)
      }) : stryMutAct_9fa48("132695") ? this.logger?.warn(OPERATION_WORKFLOW_OWNER_LITERAL.ROTATING_TRANSITION_EXECUTION_SESSION_AFTER_STALE_SESSION_COLLISION, {
        operationId,
        workflowStep: step,
        sessionId,
        nextAttempt,
        error: this.normalizeErrorMessage(errorLike, OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING)
      }) : (stryCov_9fa48("132695", "132696"), this.logger?.warn?.(OPERATION_WORKFLOW_OWNER_LITERAL.ROTATING_TRANSITION_EXECUTION_SESSION_AFTER_STALE_SESSION_COLLISION, stryMutAct_9fa48("132697") ? {} : (stryCov_9fa48("132697"), {
        operationId,
        workflowStep: step,
        sessionId,
        nextAttempt,
        error: this.normalizeErrorMessage(errorLike, OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING)
      })));
      return nextAttempt;
    }
  }

  /**
   * Clear tracked attempt state after a committed transition.
   * @param {string} operationId
   * @param {string} step
   * @return {void}
   */
  clearTransitionExecutionAttempt(operationId, step) {
    if (stryMutAct_9fa48("132698")) {
      {}
    } else {
      stryCov_9fa48("132698");
      const ownerKey = this.buildTransitionExecutionStepOwnerKey(operationId, step);
      this.transitionExecutionAttemptByStepOwnerKey.delete(ownerKey);
    }
  }

  /**
   * Build one attempt-scoped transition session id.
   * @param {string} operationId
   * @param {string} step
   * @param {number} executionAttempt
   * @return {string}
   */
  buildTransitionExecutionSessionId(operationId, step, executionAttempt) {
    if (stryMutAct_9fa48("132699")) {
      {}
    } else {
      stryCov_9fa48("132699");
      return (stryMutAct_9fa48("132700") ? [] : (stryCov_9fa48("132700"), [String(stryMutAct_9fa48("132703") ? operationId && OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING : stryMutAct_9fa48("132702") ? false : stryMutAct_9fa48("132701") ? true : (stryCov_9fa48("132701", "132702", "132703"), operationId || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING)), String(stryMutAct_9fa48("132706") ? step && OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING : stryMutAct_9fa48("132705") ? false : stryMutAct_9fa48("132704") ? true : (stryCov_9fa48("132704", "132705", "132706"), step || OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING)), stryMutAct_9fa48("132707") ? OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX - String(executionAttempt) : (stryCov_9fa48("132707"), OPERATION_TRANSITION_SESSION_ATTEMPT_PREFIX + String(executionAttempt))])).join(OPERATION_SINGLE_FLIGHT_KEY_SEPARATOR);
    }
  }

  /**
   * Clamp transition-owned replica_operations writes to the enclosing
   * distributed transaction deadline so inner retry loops do not outlive
   * the parent transaction and mask the original contention boundary.
   * @param {string} sessionId
   * @return {Object|null}
   */
  buildTransitionMutationTimeoutBudget(sessionId) {
    if (stryMutAct_9fa48("132708")) {
      {}
    } else {
      stryCov_9fa48("132708");
      if (stryMutAct_9fa48("132711") ? typeof this.transactionCoordinator?.getTransaction === TYPEOF.FUNCTION : stryMutAct_9fa48("132710") ? false : stryMutAct_9fa48("132709") ? true : (stryCov_9fa48("132709", "132710", "132711"), typeof (stryMutAct_9fa48("132712") ? this.transactionCoordinator.getTransaction : (stryCov_9fa48("132712"), this.transactionCoordinator?.getTransaction)) !== TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("132713")) {
          {}
        } else {
          stryCov_9fa48("132713");
          return null;
        }
      }
      const transactionState = this.transactionCoordinator.getTransaction(sessionId);
      const deadlineMs = Number.isFinite(stryMutAct_9fa48("132714") ? transactionState.timeoutDeadline : (stryCov_9fa48("132714"), transactionState?.timeoutDeadline)) ? Math.floor(transactionState.timeoutDeadline) : null;
      if (stryMutAct_9fa48("132717") ? false : stryMutAct_9fa48("132716") ? true : stryMutAct_9fa48("132715") ? Number.isFinite(deadlineMs) : (stryCov_9fa48("132715", "132716", "132717"), !Number.isFinite(deadlineMs))) {
        if (stryMutAct_9fa48("132718")) {
          {}
        } else {
          stryCov_9fa48("132718");
          return null;
        }
      }
      const startedAtMs = Date.now();
      return Object.freeze(stryMutAct_9fa48("132719") ? {} : (stryCov_9fa48("132719"), {
        configuredBudgetMs: stryMutAct_9fa48("132720") ? Math.min(TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS, deadlineMs - startedAtMs) : (stryCov_9fa48("132720"), Math.max(TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS, stryMutAct_9fa48("132721") ? deadlineMs + startedAtMs : (stryCov_9fa48("132721"), deadlineMs - startedAtMs))),
        startedAtMs,
        deadlineMs,
        operationName: OPERATION_WORKFLOW_OWNER_LITERAL.TRANSACTION
      }));
    }
  }

  /**
   * Build canonical persistence options for transition-owned
   * replica_operations mutations so every transition path shares the same
   * enclosing transaction budget clamp.
   * @param {string} sessionId
   * @return {Object}
   */
  buildTransitionPersistOptions(sessionId) {
    if (stryMutAct_9fa48("132722")) {
      {}
    } else {
      stryCov_9fa48("132722");
      return stryMutAct_9fa48("132723") ? {} : (stryCov_9fa48("132723"), {
        sessionId,
        confirmPersistence: stryMutAct_9fa48("132724") ? true : (stryCov_9fa48("132724"), false),
        timeoutBudget: this.buildTransitionMutationTimeoutBudget(sessionId)
      });
    }
  }

  /**
   * Confirm one committed transition best-effort so post-commit visibility
   * lag cannot unwind a transition that already durably committed.
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async confirmCommittedTransitionPersistence(operation) {
    if (stryMutAct_9fa48("132725")) {
      {}
    } else {
      stryCov_9fa48("132725");
      try {
        if (stryMutAct_9fa48("132726")) {
          {}
        } else {
          stryCov_9fa48("132726");
          await this.repository.confirmReplicaOperationPersistence(operation);
        }
      } catch (error) {
        if (stryMutAct_9fa48("132727")) {
          {}
        } else {
          stryCov_9fa48("132727");
          this.logger.warn(OPERATION_WORKFLOW_OWNER_LITERAL.COMMITTED_REPLICA_OPERATION_TRANSITION_NOT_YET_AUTHORITATIVELY_VISIBLE, stryMutAct_9fa48("132728") ? {} : (stryCov_9fa48("132728"), {
            operationId: stryMutAct_9fa48("132731") ? operation?.operationId && null : stryMutAct_9fa48("132730") ? false : stryMutAct_9fa48("132729") ? true : (stryCov_9fa48("132729", "132730", "132731"), (stryMutAct_9fa48("132732") ? operation.operationId : (stryCov_9fa48("132732"), operation?.operationId)) || null),
            workflowStep: stryMutAct_9fa48("132735") ? operation?.workflowStep && null : stryMutAct_9fa48("132734") ? false : stryMutAct_9fa48("132733") ? true : (stryCov_9fa48("132733", "132734", "132735"), (stryMutAct_9fa48("132736") ? operation.workflowStep : (stryCov_9fa48("132736"), operation?.workflowStep)) || null),
            status: stryMutAct_9fa48("132739") ? operation?.status && null : stryMutAct_9fa48("132738") ? false : stryMutAct_9fa48("132737") ? true : (stryCov_9fa48("132737", "132738", "132739"), (stryMutAct_9fa48("132740") ? operation.status : (stryCov_9fa48("132740"), operation?.status)) || null),
            error: stryMutAct_9fa48("132743") ? error?.message && String(error) : stryMutAct_9fa48("132742") ? false : stryMutAct_9fa48("132741") ? true : (stryCov_9fa48("132741", "132742", "132743"), (stryMutAct_9fa48("132744") ? error.message : (stryCov_9fa48("132744"), error?.message)) || String(error))
          }));
        }
      }
    }
  }

  /**
   * Check whether a transition failure indicates a stale session id that
   * should rotate on the next retry.
   * @param {*} errorLike
   * @return {boolean}
   */
  isStaleTransitionSessionConflict(errorLike) {
    if (stryMutAct_9fa48("132745")) {
      {}
    } else {
      stryCov_9fa48("132745");
      const message = this.normalizeErrorMessage(errorLike, stryMutAct_9fa48("132746") ? "Stryker was here!" : (stryCov_9fa48("132746"), ''));
      return stryMutAct_9fa48("132749") ? message !== QUERY_ERROR_MSG.TRANSACTION_ACTIVE : stryMutAct_9fa48("132748") ? false : stryMutAct_9fa48("132747") ? true : (stryCov_9fa48("132747", "132748", "132749"), message === QUERY_ERROR_MSG.TRANSACTION_ACTIVE);
    }
  }

  /**
   * Partition transaction contention can be caused either by a stale same-
   * session transaction or by unrelated control-plane pressure. Treat it as
   * retryable, but do not assume it warrants a new canonical session id.
   * @param {*} errorLike
   * @return {boolean}
   */
  isTransitionPartitionContention(errorLike) {
    if (stryMutAct_9fa48("132750")) {
      {}
    } else {
      stryCov_9fa48("132750");
      return stryMutAct_9fa48("132753") ? this.normalizeErrorMessage(errorLike, OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING) !== PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE : stryMutAct_9fa48("132752") ? false : stryMutAct_9fa48("132751") ? true : (stryCov_9fa48("132751", "132752", "132753"), this.normalizeErrorMessage(errorLike, OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING) === PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE);
    }
  }

  /**
   * Attempt same-session recovery without masking the original transition
   * failure when the recovery probe itself is unavailable.
   * @param {string} sessionId
   * @param {*} errorLike
   * @param {Object} [options]
   * @param {boolean} [options.allowAuthoritativeLookup=false]
   * @return {Promise<boolean>}
   * @private
   */
  async tryRecoverTransitionExecutionSession(sessionId, errorLike, options = {}) {
    if (stryMutAct_9fa48("132754")) {
      {}
    } else {
      stryCov_9fa48("132754");
      try {
        if (stryMutAct_9fa48("132755")) {
          {}
        } else {
          stryCov_9fa48("132755");
          return await this.recoverTransitionExecutionSession(sessionId, options);
        }
      } catch (recoveryError) {
        if (stryMutAct_9fa48("132756")) {
          {}
        } else {
          stryCov_9fa48("132756");
          this.logger.warn(OPERATION_WORKFLOW_OWNER_LITERAL.TRANSITION_SESSION_RECOVERY_PROBE_FAILED, stryMutAct_9fa48("132757") ? {} : (stryCov_9fa48("132757"), {
            sessionId,
            error: stryMutAct_9fa48("132760") ? recoveryError?.message && String(recoveryError) : stryMutAct_9fa48("132759") ? false : stryMutAct_9fa48("132758") ? true : (stryCov_9fa48("132758", "132759", "132760"), (stryMutAct_9fa48("132761") ? recoveryError.message : (stryCov_9fa48("132761"), recoveryError?.message)) || String(recoveryError)),
            originalError: this.normalizeErrorMessage(errorLike, OPERATION_WORKFLOW_OWNER_LITERAL.EMPTY_STRING)
          }));
          return stryMutAct_9fa48("132762") ? true : (stryCov_9fa48("132762"), false);
        }
      }
    }
  }

  /**
   * Load authoritative in-flight transaction state for one transition session
   * when the local coordinator cache has already dropped that session.
   * @param {string} sessionId
   * @return {Promise<Object|null>}
   */
  async loadAuthoritativeTransitionExecutionSession(sessionId) {
    if (stryMutAct_9fa48("132763")) {
      {}
    } else {
      stryCov_9fa48("132763");
      const txCoordinator = this.transactionCoordinator;
      const gateway = stryMutAct_9fa48("132764") ? this.repository.controlPlaneSystemTableGateway : (stryCov_9fa48("132764"), this.repository?.controlPlaneSystemTableGateway);
      if (stryMutAct_9fa48("132767") ? (!gateway || typeof txCoordinator?.recoverFromSystemTables !== TYPEOF.FUNCTION) && typeof txCoordinator.getTransaction !== TYPEOF.FUNCTION : stryMutAct_9fa48("132766") ? false : stryMutAct_9fa48("132765") ? true : (stryCov_9fa48("132765", "132766", "132767"), (stryMutAct_9fa48("132769") ? !gateway && typeof txCoordinator?.recoverFromSystemTables !== TYPEOF.FUNCTION : stryMutAct_9fa48("132768") ? false : (stryCov_9fa48("132768", "132769"), (stryMutAct_9fa48("132770") ? gateway : (stryCov_9fa48("132770"), !gateway)) || (stryMutAct_9fa48("132772") ? typeof txCoordinator?.recoverFromSystemTables === TYPEOF.FUNCTION : stryMutAct_9fa48("132771") ? false : (stryCov_9fa48("132771", "132772"), typeof (stryMutAct_9fa48("132773") ? txCoordinator.recoverFromSystemTables : (stryCov_9fa48("132773"), txCoordinator?.recoverFromSystemTables)) !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("132775") ? typeof txCoordinator.getTransaction === TYPEOF.FUNCTION : stryMutAct_9fa48("132774") ? false : (stryCov_9fa48("132774", "132775"), typeof txCoordinator.getTransaction !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("132776")) {
          {}
        } else {
          stryCov_9fa48("132776");
          return null;
        }
      }
      const transactionResult = await readAuthoritativeControlPlaneRows(gateway, SYSTEM_TABLE_NAME.SQL_TRANSACTIONS, TRANSITION_RECOVERY_SQL.SELECT_TRANSACTIONS_BY_SESSION, stryMutAct_9fa48("132777") ? [] : (stryCov_9fa48("132777"), [sessionId]), stryMutAct_9fa48("132778") ? {} : (stryCov_9fa48("132778"), {
        ...TRANSITION_RECOVERY_READ_OPTIONS,
        controlPlaneTableName: SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
        controlPlaneOperationKind: stryMutAct_9fa48("132779") ? "" : (stryCov_9fa48("132779"), 'read')
      }));
      if (stryMutAct_9fa48("132782") ? transactionResult?.success !== false : stryMutAct_9fa48("132781") ? false : stryMutAct_9fa48("132780") ? true : (stryCov_9fa48("132780", "132781", "132782"), (stryMutAct_9fa48("132783") ? transactionResult.success : (stryCov_9fa48("132783"), transactionResult?.success)) === (stryMutAct_9fa48("132784") ? true : (stryCov_9fa48("132784"), false)))) {
        if (stryMutAct_9fa48("132785")) {
          {}
        } else {
          stryCov_9fa48("132785");
          throw new Error(this.normalizeErrorMessage(transactionResult.error, OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_READ_AUTHORITATIVE_TRANSITION_TRANSACTION_STATE));
        }
      }
      const transactionRows = stryMutAct_9fa48("132786") ? transactionResult?.rows || [] : (stryCov_9fa48("132786"), (stryMutAct_9fa48("132789") ? transactionResult?.rows && [] : stryMutAct_9fa48("132788") ? false : stryMutAct_9fa48("132787") ? true : (stryCov_9fa48("132787", "132788", "132789"), (stryMutAct_9fa48("132790") ? transactionResult.rows : (stryCov_9fa48("132790"), transactionResult?.rows)) || (stryMutAct_9fa48("132791") ? ["Stryker was here"] : (stryCov_9fa48("132791"), [])))).filter(stryMutAct_9fa48("132792") ? () => undefined : (stryCov_9fa48("132792"), row => AUTHORITATIVE_TRANSITION_RECOVERY_STATUS.has(stryMutAct_9fa48("132793") ? row.status : (stryCov_9fa48("132793"), row?.status)))));
      if (stryMutAct_9fa48("132796") ? transactionRows.length !== NUM.ZERO : stryMutAct_9fa48("132795") ? false : stryMutAct_9fa48("132794") ? true : (stryCov_9fa48("132794", "132795", "132796"), transactionRows.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("132797")) {
          {}
        } else {
          stryCov_9fa48("132797");
          return null;
        }
      }
      const transactionIds = Array.from(new Set(stryMutAct_9fa48("132798") ? transactionRows.map(row => row?.transaction_id || row?.transactionId) : (stryCov_9fa48("132798"), transactionRows.map(stryMutAct_9fa48("132799") ? () => undefined : (stryCov_9fa48("132799"), row => stryMutAct_9fa48("132802") ? row?.transaction_id && row?.transactionId : stryMutAct_9fa48("132801") ? false : stryMutAct_9fa48("132800") ? true : (stryCov_9fa48("132800", "132801", "132802"), (stryMutAct_9fa48("132803") ? row.transaction_id : (stryCov_9fa48("132803"), row?.transaction_id)) || (stryMutAct_9fa48("132804") ? row.transactionId : (stryCov_9fa48("132804"), row?.transactionId))))).filter(stryMutAct_9fa48("132805") ? () => undefined : (stryCov_9fa48("132805"), value => stryMutAct_9fa48("132808") ? typeof value === TYPEOF.STRING || value.length > NUM.ZERO : stryMutAct_9fa48("132807") ? false : stryMutAct_9fa48("132806") ? true : (stryCov_9fa48("132806", "132807", "132808"), (stryMutAct_9fa48("132810") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("132809") ? true : (stryCov_9fa48("132809", "132810"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("132813") ? value.length <= NUM.ZERO : stryMutAct_9fa48("132812") ? value.length >= NUM.ZERO : stryMutAct_9fa48("132811") ? true : (stryCov_9fa48("132811", "132812", "132813"), value.length > NUM.ZERO))))))));
      let participantRows = stryMutAct_9fa48("132814") ? ["Stryker was here"] : (stryCov_9fa48("132814"), []);
      if (stryMutAct_9fa48("132818") ? transactionIds.length <= NUM.ZERO : stryMutAct_9fa48("132817") ? transactionIds.length >= NUM.ZERO : stryMutAct_9fa48("132816") ? false : stryMutAct_9fa48("132815") ? true : (stryCov_9fa48("132815", "132816", "132817", "132818"), transactionIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("132819")) {
          {}
        } else {
          stryCov_9fa48("132819");
          const participantResult = await readAuthoritativeControlPlaneRows(gateway, SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS, buildSelectRowsByTransactionIdsSql(SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS, transactionIds), transactionIds, stryMutAct_9fa48("132820") ? {} : (stryCov_9fa48("132820"), {
            ...TRANSITION_RECOVERY_READ_OPTIONS,
            controlPlaneTableName: SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS,
            controlPlaneOperationKind: stryMutAct_9fa48("132821") ? "" : (stryCov_9fa48("132821"), 'read')
          }));
          if (stryMutAct_9fa48("132824") ? participantResult?.success !== false : stryMutAct_9fa48("132823") ? false : stryMutAct_9fa48("132822") ? true : (stryCov_9fa48("132822", "132823", "132824"), (stryMutAct_9fa48("132825") ? participantResult.success : (stryCov_9fa48("132825"), participantResult?.success)) === (stryMutAct_9fa48("132826") ? true : (stryCov_9fa48("132826"), false)))) {
            if (stryMutAct_9fa48("132827")) {
              {}
            } else {
              stryCov_9fa48("132827");
              throw new Error(this.normalizeErrorMessage(participantResult.error, OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_READ_AUTHORITATIVE_TRANSITION_PARTICIPANT_STATE));
            }
          }
          participantRows = stryMutAct_9fa48("132830") ? participantResult?.rows && [] : stryMutAct_9fa48("132829") ? false : stryMutAct_9fa48("132828") ? true : (stryCov_9fa48("132828", "132829", "132830"), (stryMutAct_9fa48("132831") ? participantResult.rows : (stryCov_9fa48("132831"), participantResult?.rows)) || (stryMutAct_9fa48("132832") ? ["Stryker was here"] : (stryCov_9fa48("132832"), [])));
        }
      }
      txCoordinator.recoverFromSystemTables(stryMutAct_9fa48("132833") ? {} : (stryCov_9fa48("132833"), {
        transactions: transactionRows,
        participants: participantRows,
        writeOperations: stryMutAct_9fa48("132834") ? ["Stryker was here"] : (stryCov_9fa48("132834"), [])
      }));
      return txCoordinator.getTransaction(sessionId);
    }
  }

  /**
   * Resolve any lingering transaction state for a transition session before
   * starting a fresh transition attempt on the same session id.
   * @param {string} sessionId
   * @param {Object} [options]
   * @param {boolean} [options.allowAuthoritativeLookup=false]
   * @return {Promise<boolean>}
   */
  async recoverTransitionExecutionSession(sessionId, options = {}) {
    if (stryMutAct_9fa48("132835")) {
      {}
    } else {
      stryCov_9fa48("132835");
      const txCoordinator = this.transactionCoordinator;
      if (stryMutAct_9fa48("132838") ? !txCoordinator && typeof txCoordinator.getTransaction !== TYPEOF.FUNCTION : stryMutAct_9fa48("132837") ? false : stryMutAct_9fa48("132836") ? true : (stryCov_9fa48("132836", "132837", "132838"), (stryMutAct_9fa48("132839") ? txCoordinator : (stryCov_9fa48("132839"), !txCoordinator)) || (stryMutAct_9fa48("132841") ? typeof txCoordinator.getTransaction === TYPEOF.FUNCTION : stryMutAct_9fa48("132840") ? false : (stryCov_9fa48("132840", "132841"), typeof txCoordinator.getTransaction !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("132842")) {
          {}
        } else {
          stryCov_9fa48("132842");
          return stryMutAct_9fa48("132843") ? true : (stryCov_9fa48("132843"), false);
        }
      }
      let existingTransaction = txCoordinator.getTransaction(sessionId);
      if (stryMutAct_9fa48("132846") ? !existingTransaction?.status || options.allowAuthoritativeLookup === true : stryMutAct_9fa48("132845") ? false : stryMutAct_9fa48("132844") ? true : (stryCov_9fa48("132844", "132845", "132846"), (stryMutAct_9fa48("132847") ? existingTransaction?.status : (stryCov_9fa48("132847"), !(stryMutAct_9fa48("132848") ? existingTransaction.status : (stryCov_9fa48("132848"), existingTransaction?.status)))) && (stryMutAct_9fa48("132850") ? options.allowAuthoritativeLookup !== true : stryMutAct_9fa48("132849") ? true : (stryCov_9fa48("132849", "132850"), options.allowAuthoritativeLookup === (stryMutAct_9fa48("132851") ? false : (stryCov_9fa48("132851"), true)))))) {
        if (stryMutAct_9fa48("132852")) {
          {}
        } else {
          stryCov_9fa48("132852");
          existingTransaction = await this.loadAuthoritativeTransitionExecutionSession(sessionId);
        }
      }
      if (stryMutAct_9fa48("132855") ? false : stryMutAct_9fa48("132854") ? true : stryMutAct_9fa48("132853") ? existingTransaction?.status : (stryCov_9fa48("132853", "132854", "132855"), !(stryMutAct_9fa48("132856") ? existingTransaction.status : (stryCov_9fa48("132856"), existingTransaction?.status)))) {
        if (stryMutAct_9fa48("132857")) {
          {}
        } else {
          stryCov_9fa48("132857");
          return stryMutAct_9fa48("132858") ? true : (stryCov_9fa48("132858"), false);
        }
      }
      let result = null;
      if (stryMutAct_9fa48("132860") ? false : stryMutAct_9fa48("132859") ? true : (stryCov_9fa48("132859", "132860"), RECOVERABLE_TRANSITION_COMMIT_STATUS.has(existingTransaction.status))) {
        if (stryMutAct_9fa48("132861")) {
          {}
        } else {
          stryCov_9fa48("132861");
          if (stryMutAct_9fa48("132864") ? typeof txCoordinator.commit === TYPEOF.FUNCTION : stryMutAct_9fa48("132863") ? false : stryMutAct_9fa48("132862") ? true : (stryCov_9fa48("132862", "132863", "132864"), typeof txCoordinator.commit !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("132865")) {
              {}
            } else {
              stryCov_9fa48("132865");
              return stryMutAct_9fa48("132866") ? true : (stryCov_9fa48("132866"), false);
            }
          }
          result = await txCoordinator.commit(sessionId);
        }
      } else if (stryMutAct_9fa48("132868") ? false : stryMutAct_9fa48("132867") ? true : (stryCov_9fa48("132867", "132868"), RECOVERABLE_TRANSITION_ROLLBACK_STATUS.has(existingTransaction.status))) {
        if (stryMutAct_9fa48("132869")) {
          {}
        } else {
          stryCov_9fa48("132869");
          if (stryMutAct_9fa48("132872") ? typeof txCoordinator.rollback === TYPEOF.FUNCTION : stryMutAct_9fa48("132871") ? false : stryMutAct_9fa48("132870") ? true : (stryCov_9fa48("132870", "132871", "132872"), typeof txCoordinator.rollback !== TYPEOF.FUNCTION)) {
            if (stryMutAct_9fa48("132873")) {
              {}
            } else {
              stryCov_9fa48("132873");
              return stryMutAct_9fa48("132874") ? true : (stryCov_9fa48("132874"), false);
            }
          }
          result = await txCoordinator.rollback(sessionId);
        }
      } else {
        if (stryMutAct_9fa48("132875")) {
          {}
        } else {
          stryCov_9fa48("132875");
          return stryMutAct_9fa48("132876") ? true : (stryCov_9fa48("132876"), false);
        }
      }
      if (stryMutAct_9fa48("132879") ? result?.success !== true : stryMutAct_9fa48("132878") ? false : stryMutAct_9fa48("132877") ? true : (stryCov_9fa48("132877", "132878", "132879"), (stryMutAct_9fa48("132880") ? result.success : (stryCov_9fa48("132880"), result?.success)) === (stryMutAct_9fa48("132881") ? false : (stryCov_9fa48("132881"), true)))) {
        if (stryMutAct_9fa48("132882")) {
          {}
        } else {
          stryCov_9fa48("132882");
          return stryMutAct_9fa48("132883") ? false : (stryCov_9fa48("132883"), true);
        }
      }
      throw new Error(this.normalizeErrorMessage(stryMutAct_9fa48("132884") ? result.error : (stryCov_9fa48("132884"), result?.error), OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_RECOVER_TRANSITION_TRANSACTION));
    }
  }

  /**
   * Execute a step transition atomically using the distributed
   * transaction coordinator.
   * @param {Object} operation
   * @param {string} step
   * @param {string} reason
   * @param {Function} persistFn
   * @param {Object} [options]
   * @param {Function} [options.onIdempotentTransition]
   * @param {Function} [options.afterCommit]
   * @return {Promise<boolean>} True when this call committed the transition.
   */
  async executeAtomicTransition(operation, step, reason, persistFn, options = {}) {
    if (stryMutAct_9fa48("132885")) {
      {}
    } else {
      stryCov_9fa48("132885");
      return this.repository.runReplicaOperationTransitionExclusive(async () => {
        if (stryMutAct_9fa48("132886")) {
          {}
        } else {
          stryCov_9fa48("132886");
          this.ensureOperationWorkflow(operation);
          if (stryMutAct_9fa48("132888") ? false : stryMutAct_9fa48("132887") ? true : (stryCov_9fa48("132887", "132888"), this.operationWorkflowCoordinator.isTransitionIdempotent(operation.operationId, step))) {
            if (stryMutAct_9fa48("132889")) {
              {}
            } else {
              stryCov_9fa48("132889");
              if (stryMutAct_9fa48("132892") ? typeof options.onIdempotentTransition !== TYPEOF.FUNCTION : stryMutAct_9fa48("132891") ? false : stryMutAct_9fa48("132890") ? true : (stryCov_9fa48("132890", "132891", "132892"), typeof options.onIdempotentTransition === TYPEOF.FUNCTION)) {
                if (stryMutAct_9fa48("132893")) {
                  {}
                } else {
                  stryCov_9fa48("132893");
                  options.onIdempotentTransition();
                }
              }
              return stryMutAct_9fa48("132894") ? true : (stryCov_9fa48("132894"), false);
            }
          }
          const txCoordinator = this.transactionCoordinator;
          if (stryMutAct_9fa48("132897") ? (!txCoordinator || typeof txCoordinator.begin !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION || typeof txCoordinator.commit !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION) && typeof txCoordinator.rollback !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION : stryMutAct_9fa48("132896") ? false : stryMutAct_9fa48("132895") ? true : (stryCov_9fa48("132895", "132896", "132897"), (stryMutAct_9fa48("132899") ? (!txCoordinator || typeof txCoordinator.begin !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION) && typeof txCoordinator.commit !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION : stryMutAct_9fa48("132898") ? false : (stryCov_9fa48("132898", "132899"), (stryMutAct_9fa48("132901") ? !txCoordinator && typeof txCoordinator.begin !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION : stryMutAct_9fa48("132900") ? false : (stryCov_9fa48("132900", "132901"), (stryMutAct_9fa48("132902") ? txCoordinator : (stryCov_9fa48("132902"), !txCoordinator)) || (stryMutAct_9fa48("132904") ? typeof txCoordinator.begin === OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION : stryMutAct_9fa48("132903") ? false : (stryCov_9fa48("132903", "132904"), typeof txCoordinator.begin !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION)))) || (stryMutAct_9fa48("132906") ? typeof txCoordinator.commit === OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION : stryMutAct_9fa48("132905") ? false : (stryCov_9fa48("132905", "132906"), typeof txCoordinator.commit !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION)))) || (stryMutAct_9fa48("132908") ? typeof txCoordinator.rollback === OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION : stryMutAct_9fa48("132907") ? false : (stryCov_9fa48("132907", "132908"), typeof txCoordinator.rollback !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION)))) {
            if (stryMutAct_9fa48("132909")) {
              {}
            } else {
              stryCov_9fa48("132909");
              throw new Error(REBALANCE_COORDINATOR_ERROR_MSG.TRANSACTION_COORDINATOR_REQUIRED);
            }
          }
          const afterCommit = (stryMutAct_9fa48("132912") ? typeof options.afterCommit !== TYPEOF.FUNCTION : stryMutAct_9fa48("132911") ? false : stryMutAct_9fa48("132910") ? true : (stryCov_9fa48("132910", "132911", "132912"), typeof options.afterCommit === TYPEOF.FUNCTION)) ? options.afterCommit : null;
          const executionAttempt = this.reserveTransitionExecutionAttempt(operation.operationId, step);
          const sessionId = this.buildTransitionExecutionSessionId(operation.operationId, step, executionAttempt);
          await this.recoverTransitionExecutionSession(sessionId);
          const beginResult = await txCoordinator.begin(sessionId);
          if (stryMutAct_9fa48("132915") ? false : stryMutAct_9fa48("132914") ? true : stryMutAct_9fa48("132913") ? beginResult.success : (stryCov_9fa48("132913", "132914", "132915"), !beginResult.success)) {
            if (stryMutAct_9fa48("132916")) {
              {}
            } else {
              stryCov_9fa48("132916");
              if (stryMutAct_9fa48("132919") ? this.isStaleTransitionSessionConflict(beginResult.error) && this.isTransitionPartitionContention(beginResult.error) : stryMutAct_9fa48("132918") ? false : stryMutAct_9fa48("132917") ? true : (stryCov_9fa48("132917", "132918", "132919"), this.isStaleTransitionSessionConflict(beginResult.error) || this.isTransitionPartitionContention(beginResult.error))) {
                if (stryMutAct_9fa48("132920")) {
                  {}
                } else {
                  stryCov_9fa48("132920");
                  const recovered = await this.tryRecoverTransitionExecutionSession(sessionId, beginResult.error, stryMutAct_9fa48("132921") ? {} : (stryCov_9fa48("132921"), {
                    allowAuthoritativeLookup: stryMutAct_9fa48("132922") ? false : (stryCov_9fa48("132922"), true)
                  }));
                  if (stryMutAct_9fa48("132925") ? false : stryMutAct_9fa48("132924") ? true : stryMutAct_9fa48("132923") ? recovered : (stryCov_9fa48("132923", "132924", "132925"), !recovered)) {
                    if (stryMutAct_9fa48("132926")) {
                      {}
                    } else {
                      stryCov_9fa48("132926");
                      this.rotateTransitionExecutionAttemptAfterStaleSessionConflict(operation.operationId, step, sessionId, beginResult.error);
                    }
                  }
                }
              }
              throw new Error(beginResult.error);
            }
          }
          let committed = stryMutAct_9fa48("132927") ? true : (stryCov_9fa48("132927"), false);
          try {
            if (stryMutAct_9fa48("132928")) {
              {}
            } else {
              stryCov_9fa48("132928");
              await this.operationWorkflowCoordinator.transitionStep(operation.operationId, stryMutAct_9fa48("132929") ? {} : (stryCov_9fa48("132929"), {
                nextStep: step,
                reason
              }), {}, TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK);
              await persistFn(sessionId);
              const commitResult = await txCoordinator.commit(sessionId);
              if (stryMutAct_9fa48("132932") ? false : stryMutAct_9fa48("132931") ? true : stryMutAct_9fa48("132930") ? commitResult.success : (stryCov_9fa48("132930", "132931", "132932"), !commitResult.success)) {
                if (stryMutAct_9fa48("132933")) {
                  {}
                } else {
                  stryCov_9fa48("132933");
                  throw new Error(commitResult.error);
                }
              }
              committed = stryMutAct_9fa48("132934") ? false : (stryCov_9fa48("132934"), true);
              this.operationWorkflowCoordinator.markTransitionCommitted(operation.operationId, step);
              this.clearTransitionExecutionAttempt(operation.operationId, step);
              if (stryMutAct_9fa48("132936") ? false : stryMutAct_9fa48("132935") ? true : (stryCov_9fa48("132935", "132936"), afterCommit)) {
                if (stryMutAct_9fa48("132937")) {
                  {}
                } else {
                  stryCov_9fa48("132937");
                  await afterCommit();
                }
              }
              return stryMutAct_9fa48("132938") ? false : (stryCov_9fa48("132938"), true);
            }
          } catch (error) {
            if (stryMutAct_9fa48("132939")) {
              {}
            } else {
              stryCov_9fa48("132939");
              const staleTransitionSessionConflict = this.isStaleTransitionSessionConflict(error);
              const transitionPartitionContention = this.isTransitionPartitionContention(error);
              if (stryMutAct_9fa48("132942") ? false : stryMutAct_9fa48("132941") ? true : stryMutAct_9fa48("132940") ? committed : (stryCov_9fa48("132940", "132941", "132942"), !committed)) {
                if (stryMutAct_9fa48("132943")) {
                  {}
                } else {
                  stryCov_9fa48("132943");
                  const activeTransaction = (stryMutAct_9fa48("132946") ? typeof txCoordinator.getTransaction !== TYPEOF.FUNCTION : stryMutAct_9fa48("132945") ? false : stryMutAct_9fa48("132944") ? true : (stryCov_9fa48("132944", "132945", "132946"), typeof txCoordinator.getTransaction === TYPEOF.FUNCTION)) ? txCoordinator.getTransaction(sessionId) : null;
                  if (stryMutAct_9fa48("132949") ? false : stryMutAct_9fa48("132948") ? true : stryMutAct_9fa48("132947") ? activeTransaction : (stryCov_9fa48("132947", "132948", "132949"), !activeTransaction)) {
                    if (stryMutAct_9fa48("132950")) {
                      {}
                    } else {
                      stryCov_9fa48("132950");
                      if (stryMutAct_9fa48("132953") ? staleTransitionSessionConflict && transitionPartitionContention : stryMutAct_9fa48("132952") ? false : stryMutAct_9fa48("132951") ? true : (stryCov_9fa48("132951", "132952", "132953"), staleTransitionSessionConflict || transitionPartitionContention)) {
                        if (stryMutAct_9fa48("132954")) {
                          {}
                        } else {
                          stryCov_9fa48("132954");
                          const recovered = await this.tryRecoverTransitionExecutionSession(sessionId, error, stryMutAct_9fa48("132955") ? {} : (stryCov_9fa48("132955"), {
                            allowAuthoritativeLookup: stryMutAct_9fa48("132956") ? false : (stryCov_9fa48("132956"), true)
                          }));
                          if (stryMutAct_9fa48("132959") ? !recovered || staleTransitionSessionConflict : stryMutAct_9fa48("132958") ? false : stryMutAct_9fa48("132957") ? true : (stryCov_9fa48("132957", "132958", "132959"), (stryMutAct_9fa48("132960") ? recovered : (stryCov_9fa48("132960"), !recovered)) && staleTransitionSessionConflict)) {
                            if (stryMutAct_9fa48("132961")) {
                              {}
                            } else {
                              stryCov_9fa48("132961");
                              this.rotateTransitionExecutionAttemptAfterStaleSessionConflict(operation.operationId, step, sessionId, error);
                            }
                          }
                        }
                      }
                      throw error;
                    }
                  }
                  try {
                    if (stryMutAct_9fa48("132962")) {
                      {}
                    } else {
                      stryCov_9fa48("132962");
                      const rollbackResult = await txCoordinator.rollback(sessionId);
                      if (stryMutAct_9fa48("132965") ? rollbackResult?.success === true : stryMutAct_9fa48("132964") ? false : stryMutAct_9fa48("132963") ? true : (stryCov_9fa48("132963", "132964", "132965"), (stryMutAct_9fa48("132966") ? rollbackResult.success : (stryCov_9fa48("132966"), rollbackResult?.success)) !== (stryMutAct_9fa48("132967") ? false : (stryCov_9fa48("132967"), true)))) {
                        if (stryMutAct_9fa48("132968")) {
                          {}
                        } else {
                          stryCov_9fa48("132968");
                          throw new Error(this.normalizeErrorMessage(stryMutAct_9fa48("132969") ? rollbackResult.error : (stryCov_9fa48("132969"), rollbackResult?.error), OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_ROLL_BACK_TRANSITION_TRANSACTION));
                        }
                      }
                    }
                  } catch (rollbackError) {
                    if (stryMutAct_9fa48("132970")) {
                      {}
                    } else {
                      stryCov_9fa48("132970");
                      rollbackError.cause = error;
                      throw rollbackError;
                    }
                  }
                }
              }
              if (stryMutAct_9fa48("132973") ? staleTransitionSessionConflict && transitionPartitionContention : stryMutAct_9fa48("132972") ? false : stryMutAct_9fa48("132971") ? true : (stryCov_9fa48("132971", "132972", "132973"), staleTransitionSessionConflict || transitionPartitionContention)) {
                if (stryMutAct_9fa48("132974")) {
                  {}
                } else {
                  stryCov_9fa48("132974");
                  const recovered = await this.tryRecoverTransitionExecutionSession(sessionId, error, stryMutAct_9fa48("132975") ? {} : (stryCov_9fa48("132975"), {
                    allowAuthoritativeLookup: stryMutAct_9fa48("132976") ? false : (stryCov_9fa48("132976"), true)
                  }));
                  if (stryMutAct_9fa48("132979") ? !recovered || staleTransitionSessionConflict : stryMutAct_9fa48("132978") ? false : stryMutAct_9fa48("132977") ? true : (stryCov_9fa48("132977", "132978", "132979"), (stryMutAct_9fa48("132980") ? recovered : (stryCov_9fa48("132980"), !recovered)) && staleTransitionSessionConflict)) {
                    if (stryMutAct_9fa48("132981")) {
                      {}
                    } else {
                      stryCov_9fa48("132981");
                      this.rotateTransitionExecutionAttemptAfterStaleSessionConflict(operation.operationId, step, sessionId, error);
                    }
                  }
                }
              }
              throw error;
            }
          }
        }
      }, stryMutAct_9fa48("132982") ? {} : (stryCov_9fa48("132982"), {
        operation
      }));
    }
  }

  /**
   * Update operation workflow step.
   * @param {Object} operation
   * @param {string} step
   * @param {string} [reason]
   * @return {Promise<void>}
   */
  async updateStep(operation, step, reason) {
    if (stryMutAct_9fa48("132983")) {
      {}
    } else {
      stryCov_9fa48("132983");
      const previousStep = operation.workflowStep;
      if (stryMutAct_9fa48("132986") ? previousStep !== step : stryMutAct_9fa48("132985") ? false : stryMutAct_9fa48("132984") ? true : (stryCov_9fa48("132984", "132985", "132986"), previousStep === step)) {
        if (stryMutAct_9fa48("132987")) {
          {}
        } else {
          stryCov_9fa48("132987");
          return stryMutAct_9fa48("132988") ? true : (stryCov_9fa48("132988"), false);
        }
      }
      const transitionReason = stryMutAct_9fa48("132991") ? reason && this.resolveTransitionReason(previousStep, step) : stryMutAct_9fa48("132990") ? false : stryMutAct_9fa48("132989") ? true : (stryCov_9fa48("132989", "132990", "132991"), reason || this.resolveTransitionReason(previousStep, step));
      const now = Date.now();
      const readinessDecisionDimension = this.resolveOperationReadinessDecisionDimension(operation);
      const targetNodeId = operation.targetNodeId;
      const targetReadiness = targetNodeId ? this.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, stryMutAct_9fa48("132992") ? {} : (stryCov_9fa48("132992"), {
        decisionDimension: readinessDecisionDimension
      })) : null;
      const readinessSnapshot = ControlPlaneReadinessService.compactSnapshotSummary(targetReadiness, readinessDecisionDimension);
      const persistedStatus = stryMutAct_9fa48("132995") ? WORKFLOW_STEP_TO_STATUS[step] && operation.status : stryMutAct_9fa48("132994") ? false : stryMutAct_9fa48("132993") ? true : (stryCov_9fa48("132993", "132994", "132995"), WORKFLOW_STEP_TO_STATUS[step] || operation.status);
      const stepEntry = stryMutAct_9fa48("132996") ? {} : (stryCov_9fa48("132996"), {
        step,
        timestamp: now,
        previousStep,
        reason: transitionReason,
        ownerKey: operation.operationId
      });
      if (stryMutAct_9fa48("132998") ? false : stryMutAct_9fa48("132997") ? true : (stryCov_9fa48("132997", "132998"), readinessSnapshot)) {
        if (stryMutAct_9fa48("132999")) {
          {}
        } else {
          stryCov_9fa48("132999");
          stepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] = readinessSnapshot;
        }
      }
      const projectedOperation = stryMutAct_9fa48("133000") ? {} : (stryCov_9fa48("133000"), {
        ...operation,
        workflowStep: step,
        updatedAt: now,
        status: persistedStatus,
        stepsHistory: stryMutAct_9fa48("133001") ? [] : (stryCov_9fa48("133001"), [...(Array.isArray(operation.stepsHistory) ? operation.stepsHistory : stryMutAct_9fa48("133002") ? ["Stryker was here"] : (stryCov_9fa48("133002"), [])), stepEntry])
      });
      const projectIdempotentTransition = () => {
        if (stryMutAct_9fa48("133003")) {
          {}
        } else {
          stryCov_9fa48("133003");
          operation.workflowStep = step;
          operation.status = persistedStatus;
          const previousUpdatedAt = Number(operation.updatedAt);
          operation.updatedAt = Number.isFinite(previousUpdatedAt) ? stryMutAct_9fa48("133004") ? Math.min(previousUpdatedAt, now) : (stryCov_9fa48("133004"), Math.max(previousUpdatedAt, now)) : now;
        }
      };
      const persistFn = async sessionId => {
        if (stryMutAct_9fa48("133005")) {
          {}
        } else {
          stryCov_9fa48("133005");
          await this.repository.persistOperationUpdate(projectedOperation, this.buildTransitionPersistOptions(sessionId));
        }
      };
      const transitionCommitted = await this.executeAtomicTransition(operation, step, transitionReason, persistFn, stryMutAct_9fa48("133006") ? {} : (stryCov_9fa48("133006"), {
        onIdempotentTransition: projectIdempotentTransition,
        afterCommit: async () => {
          if (stryMutAct_9fa48("133007")) {
            {}
          } else {
            stryCov_9fa48("133007");
            await this.confirmCommittedTransitionPersistence(projectedOperation);
          }
        }
      }));
      if (stryMutAct_9fa48("133010") ? false : stryMutAct_9fa48("133009") ? true : stryMutAct_9fa48("133008") ? transitionCommitted : (stryCov_9fa48("133008", "133009", "133010"), !transitionCommitted)) {
        if (stryMutAct_9fa48("133011")) {
          {}
        } else {
          stryCov_9fa48("133011");
          return stryMutAct_9fa48("133012") ? true : (stryCov_9fa48("133012"), false);
        }
      }
      this.clearTransitionRetry(operation.operationId);
      operation.workflowStep = step;
      operation.updatedAt = now;
      operation.status = persistedStatus;
      operation.stepsHistory.push(stepEntry);
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.STEP_CHANGED, stryMutAct_9fa48("133013") ? {} : (stryCov_9fa48("133013"), {
        operationId: operation.operationId,
        previousStep,
        newStep: step,
        reason: transitionReason,
        status: operation.status,
        partitionId: operation.partitionId
      }));
      this.emitter.emit(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED, stryMutAct_9fa48("133014") ? {} : (stryCov_9fa48("133014"), {
        operation,
        previousStep,
        newStep: step,
        reason: transitionReason
      }));
      return stryMutAct_9fa48("133015") ? false : (stryCov_9fa48("133015"), true);
    }
  }

  /**
   * Priority control-plane dispatch claims should not depend on the same
   * transaction-participant machinery they are trying to repair. Narrow only
   * the initial PENDING -> SENDING claim for these partitions.
   *
   * @param {Object|null} operation
   * @return {boolean}
   * @private
   */
  shouldUsePriorityDispatchClaimNarrowPath(operation) {
    if (stryMutAct_9fa48("133016")) {
      {}
    } else {
      stryCov_9fa48("133016");
      const partitionId = stryMutAct_9fa48("133017") ? String(operation?.partitionId || '') : (stryCov_9fa48("133017"), String(stryMutAct_9fa48("133020") ? operation?.partitionId && '' : stryMutAct_9fa48("133019") ? false : stryMutAct_9fa48("133018") ? true : (stryCov_9fa48("133018", "133019", "133020"), (stryMutAct_9fa48("133021") ? operation.partitionId : (stryCov_9fa48("133021"), operation?.partitionId)) || (stryMutAct_9fa48("133022") ? "Stryker was here!" : (stryCov_9fa48("133022"), '')))).trim());
      return stryMutAct_9fa48("133025") ? partitionId.length > NUM.ZERO && operation?.workflowStep === WORKFLOW_STEP.PENDING || isPriorityControlPlanePartition({
        partitionId
      }) : stryMutAct_9fa48("133024") ? false : stryMutAct_9fa48("133023") ? true : (stryCov_9fa48("133023", "133024", "133025"), (stryMutAct_9fa48("133027") ? partitionId.length > NUM.ZERO || operation?.workflowStep === WORKFLOW_STEP.PENDING : stryMutAct_9fa48("133026") ? true : (stryCov_9fa48("133026", "133027"), (stryMutAct_9fa48("133030") ? partitionId.length <= NUM.ZERO : stryMutAct_9fa48("133029") ? partitionId.length >= NUM.ZERO : stryMutAct_9fa48("133028") ? true : (stryCov_9fa48("133028", "133029", "133030"), partitionId.length > NUM.ZERO)) && (stryMutAct_9fa48("133032") ? operation?.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("133031") ? true : (stryCov_9fa48("133031", "133032"), (stryMutAct_9fa48("133033") ? operation.workflowStep : (stryCov_9fa48("133033"), operation?.workflowStep)) === WORKFLOW_STEP.PENDING)))) && isPriorityControlPlanePartition(stryMutAct_9fa48("133034") ? {} : (stryCov_9fa48("133034"), {
        partitionId
      })));
    }
  }

  /**
   * Build one retryable synthetic error for priority-claim misses.
   *
   * A compare-and-set miss with an unchanged authoritative PENDING row is a
   * pressure/liveness ambiguity, not a hard "not dispatchable" terminal state.
   * Re-arm dispatch through the existing deferred retry lane.
   *
   * @param {Object} operation
   * @return {Error}
   * @private
   */
  buildPriorityDispatchClaimRetryableError(operation) {
    if (stryMutAct_9fa48("133035")) {
      {}
    } else {
      stryCov_9fa48("133035");
      const error = new Error((stryMutAct_9fa48("133036") ? "" : (stryCov_9fa48("133036"), 'control_plane_pressure_degraded while claiming priority ')) + (stryMutAct_9fa48("133037") ? "" : (stryCov_9fa48("133037"), 'dispatch transition')));
      error.code = OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
      error.errorCode = OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED;
      error.retryAfterMs = DISPATCH_RETRY_DELAY_MS;
      error.deferRetry = stryMutAct_9fa48("133038") ? false : (stryCov_9fa48("133038"), true);
      error.partitionId = stryMutAct_9fa48("133041") ? operation?.partitionId && null : stryMutAct_9fa48("133040") ? false : stryMutAct_9fa48("133039") ? true : (stryCov_9fa48("133039", "133040", "133041"), (stryMutAct_9fa48("133042") ? operation.partitionId : (stryCov_9fa48("133042"), operation?.partitionId)) || null);
      return error;
    }
  }

  /**
   * Claim one priority control-plane operation for dispatch without relying on
   * a transition-scoped distributed transaction. The claim remains single-
   * flight and compare-and-set guarded on the durable PENDING row.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async claimPriorityDispatchTransition(operation) {
    if (stryMutAct_9fa48("133043")) {
      {}
    } else {
      stryCov_9fa48("133043");
      if (stryMutAct_9fa48("133046") ? (!operation || operation.workflowStep !== WORKFLOW_STEP.PENDING || !this.repository.isOperationLocallyOwned(operation)) && !isCoordinatorOwnedOperationType(operation.type) : stryMutAct_9fa48("133045") ? false : stryMutAct_9fa48("133044") ? true : (stryCov_9fa48("133044", "133045", "133046"), (stryMutAct_9fa48("133048") ? (!operation || operation.workflowStep !== WORKFLOW_STEP.PENDING) && !this.repository.isOperationLocallyOwned(operation) : stryMutAct_9fa48("133047") ? false : (stryCov_9fa48("133047", "133048"), (stryMutAct_9fa48("133050") ? !operation && operation.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("133049") ? false : (stryCov_9fa48("133049", "133050"), (stryMutAct_9fa48("133051") ? operation : (stryCov_9fa48("133051"), !operation)) || (stryMutAct_9fa48("133053") ? operation.workflowStep === WORKFLOW_STEP.PENDING : stryMutAct_9fa48("133052") ? false : (stryCov_9fa48("133052", "133053"), operation.workflowStep !== WORKFLOW_STEP.PENDING)))) || (stryMutAct_9fa48("133054") ? this.repository.isOperationLocallyOwned(operation) : (stryCov_9fa48("133054"), !this.repository.isOperationLocallyOwned(operation))))) || (stryMutAct_9fa48("133055") ? isCoordinatorOwnedOperationType(operation.type) : (stryCov_9fa48("133055"), !isCoordinatorOwnedOperationType(operation.type))))) {
        if (stryMutAct_9fa48("133056")) {
          {}
        } else {
          stryCov_9fa48("133056");
          return null;
        }
      }
      return this.repository.runReplicaOperationTransitionExclusive(async () => {
        if (stryMutAct_9fa48("133057")) {
          {}
        } else {
          stryCov_9fa48("133057");
          const step = WORKFLOW_STEP.SENDING;
          const previousStep = operation.workflowStep;
          const transitionReason = OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
          const now = Date.now();
          const readinessDecisionDimension = this.resolveOperationReadinessDecisionDimension(operation);
          const targetNodeId = operation.targetNodeId;
          const targetReadiness = targetNodeId ? this.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, stryMutAct_9fa48("133058") ? {} : (stryCov_9fa48("133058"), {
            decisionDimension: readinessDecisionDimension
          })) : null;
          const readinessSnapshot = ControlPlaneReadinessService.compactSnapshotSummary(targetReadiness, readinessDecisionDimension);
          const persistedStatus = stryMutAct_9fa48("133061") ? WORKFLOW_STEP_TO_STATUS[step] && operation.status : stryMutAct_9fa48("133060") ? false : stryMutAct_9fa48("133059") ? true : (stryCov_9fa48("133059", "133060", "133061"), WORKFLOW_STEP_TO_STATUS[step] || operation.status);
          const stepEntry = stryMutAct_9fa48("133062") ? {} : (stryCov_9fa48("133062"), {
            step,
            timestamp: now,
            previousStep,
            reason: transitionReason,
            ownerKey: operation.operationId
          });
          if (stryMutAct_9fa48("133064") ? false : stryMutAct_9fa48("133063") ? true : (stryCov_9fa48("133063", "133064"), readinessSnapshot)) {
            if (stryMutAct_9fa48("133065")) {
              {}
            } else {
              stryCov_9fa48("133065");
              stepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] = readinessSnapshot;
            }
          }
          const projectedOperation = stryMutAct_9fa48("133066") ? {} : (stryCov_9fa48("133066"), {
            ...operation,
            workflowStep: step,
            updatedAt: now,
            status: persistedStatus,
            stepsHistory: stryMutAct_9fa48("133067") ? [] : (stryCov_9fa48("133067"), [...(Array.isArray(operation.stepsHistory) ? operation.stepsHistory : stryMutAct_9fa48("133068") ? ["Stryker was here"] : (stryCov_9fa48("133068"), [])), stepEntry])
          });
          const commitProjectedState = nextOperation => {
            if (stryMutAct_9fa48("133069")) {
              {}
            } else {
              stryCov_9fa48("133069");
              nextOperation.workflowStep = step;
              nextOperation.updatedAt = now;
              nextOperation.status = persistedStatus;
              nextOperation.stepsHistory = projectedOperation.stepsHistory;
            }
          };
          this.ensureOperationWorkflow(operation);
          if (stryMutAct_9fa48("133071") ? false : stryMutAct_9fa48("133070") ? true : (stryCov_9fa48("133070", "133071"), this.operationWorkflowCoordinator.isTransitionIdempotent(operation.operationId, step))) {
            if (stryMutAct_9fa48("133072")) {
              {}
            } else {
              stryCov_9fa48("133072");
              commitProjectedState(operation);
              return operation;
            }
          }
          await this.operationWorkflowCoordinator.transitionStep(operation.operationId, stryMutAct_9fa48("133073") ? {} : (stryCov_9fa48("133073"), {
            nextStep: step,
            reason: transitionReason
          }), {}, TRANSITION_STEP_OPTIONS.DEFER_COMMITTED_MARK);
          const transitionCommitted = await this.repository.persistOperationUpdate(projectedOperation, stryMutAct_9fa48("133074") ? {} : (stryCov_9fa48("133074"), {
            confirmPersistence: stryMutAct_9fa48("133075") ? false : (stryCov_9fa48("133075"), true),
            expectedWorkflowStep: WORKFLOW_STEP.PENDING
          }));
          if (stryMutAct_9fa48("133078") ? false : stryMutAct_9fa48("133077") ? true : stryMutAct_9fa48("133076") ? transitionCommitted : (stryCov_9fa48("133076", "133077", "133078"), !transitionCommitted)) {
            if (stryMutAct_9fa48("133079")) {
              {}
            } else {
              stryCov_9fa48("133079");
              const authoritativeOperation = await this.repository.queryAuthoritativeOperationById(operation.operationId, stryMutAct_9fa48("133080") ? {} : (stryCov_9fa48("133080"), {
                requireOwnerRpcRead: stryMutAct_9fa48("133081") ? true : (stryCov_9fa48("133081"), false)
              }));
              if (stryMutAct_9fa48("133084") ? (!authoritativeOperation || !this.repository.isOperationLocallyOwned(authoritativeOperation)) && authoritativeOperation.workflowStep === WORKFLOW_STEP.PENDING : stryMutAct_9fa48("133083") ? false : stryMutAct_9fa48("133082") ? true : (stryCov_9fa48("133082", "133083", "133084"), (stryMutAct_9fa48("133086") ? !authoritativeOperation && !this.repository.isOperationLocallyOwned(authoritativeOperation) : stryMutAct_9fa48("133085") ? false : (stryCov_9fa48("133085", "133086"), (stryMutAct_9fa48("133087") ? authoritativeOperation : (stryCov_9fa48("133087"), !authoritativeOperation)) || (stryMutAct_9fa48("133088") ? this.repository.isOperationLocallyOwned(authoritativeOperation) : (stryCov_9fa48("133088"), !this.repository.isOperationLocallyOwned(authoritativeOperation))))) || (stryMutAct_9fa48("133090") ? authoritativeOperation.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("133089") ? false : (stryCov_9fa48("133089", "133090"), authoritativeOperation.workflowStep === WORKFLOW_STEP.PENDING)))) {
                if (stryMutAct_9fa48("133091")) {
                  {}
                } else {
                  stryCov_9fa48("133091");
                  return null;
                }
              }
              this.operationWorkflowCoordinator.markTransitionCommitted(operation.operationId, step);
              Object.assign(operation, authoritativeOperation);
              return operation;
            }
          }
          this.clearTransitionRetry(operation.operationId);
          this.operationWorkflowCoordinator.markTransitionCommitted(operation.operationId, step);
          commitProjectedState(operation);
          this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.STEP_CHANGED, stryMutAct_9fa48("133092") ? {} : (stryCov_9fa48("133092"), {
            operationId: operation.operationId,
            previousStep,
            newStep: step,
            reason: transitionReason,
            status: operation.status,
            partitionId: operation.partitionId,
            ingress: OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CLAIM_CAS
          }));
          this.emitter.emit(REBALANCE_COORDINATOR_EVENT.STEP_CHANGED, stryMutAct_9fa48("133093") ? {} : (stryCov_9fa48("133093"), {
            operation,
            previousStep,
            newStep: step,
            reason: transitionReason
          }));
          return operation;
        }
      }, stryMutAct_9fa48("133094") ? {} : (stryCov_9fa48("133094"), {
        operation
      }));
    }
  }

  /**
   * Complete an operation successfully.
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async completeOperation(operation) {
    if (stryMutAct_9fa48("133095")) {
      {}
    } else {
      stryCov_9fa48("133095");
      this.clearDispatchRetry(stryMutAct_9fa48("133096") ? operation.operationId : (stryCov_9fa48("133096"), operation?.operationId));
      const now = Date.now();
      const finalStep = (stryMutAct_9fa48("133099") ? operation.type !== OperationType.ADD : stryMutAct_9fa48("133098") ? false : stryMutAct_9fa48("133097") ? true : (stryCov_9fa48("133097", "133098", "133099"), operation.type === OperationType.ADD)) ? WORKFLOW_STEP.ACTIVE : WORKFLOW_STEP.REMOVED;
      if (stryMutAct_9fa48("133102") ? operation.workflowStep === finalStep && operation.completedAt !== null || operation.completedAt !== undefined : stryMutAct_9fa48("133101") ? false : stryMutAct_9fa48("133100") ? true : (stryCov_9fa48("133100", "133101", "133102"), (stryMutAct_9fa48("133104") ? operation.workflowStep === finalStep || operation.completedAt !== null : stryMutAct_9fa48("133103") ? true : (stryCov_9fa48("133103", "133104"), (stryMutAct_9fa48("133106") ? operation.workflowStep !== finalStep : stryMutAct_9fa48("133105") ? true : (stryCov_9fa48("133105", "133106"), operation.workflowStep === finalStep)) && (stryMutAct_9fa48("133108") ? operation.completedAt === null : stryMutAct_9fa48("133107") ? true : (stryCov_9fa48("133107", "133108"), operation.completedAt !== null)))) && (stryMutAct_9fa48("133110") ? operation.completedAt === undefined : stryMutAct_9fa48("133109") ? true : (stryCov_9fa48("133109", "133110"), operation.completedAt !== undefined)))) {
        if (stryMutAct_9fa48("133111")) {
          {}
        } else {
          stryCov_9fa48("133111");
          return;
        }
      }
      const previousStep = operation.workflowStep;
      const readinessDecisionDimension = this.resolveOperationReadinessDecisionDimension(operation);
      const targetNodeId = operation.targetNodeId;
      const targetReadiness = targetNodeId ? this.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, stryMutAct_9fa48("133112") ? {} : (stryCov_9fa48("133112"), {
        decisionDimension: readinessDecisionDimension
      })) : null;
      const readinessSnapshot = ControlPlaneReadinessService.compactSnapshotSummary(targetReadiness, readinessDecisionDimension);
      const stepEntry = stryMutAct_9fa48("133113") ? {} : (stryCov_9fa48("133113"), {
        step: finalStep,
        timestamp: now,
        previousStep,
        reason: OPERATION_TRANSITION_REASON.OPERATION_COMPLETED,
        ownerKey: operation.operationId
      });
      if (stryMutAct_9fa48("133115") ? false : stryMutAct_9fa48("133114") ? true : (stryCov_9fa48("133114", "133115"), readinessSnapshot)) {
        if (stryMutAct_9fa48("133116")) {
          {}
        } else {
          stryCov_9fa48("133116");
          stepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] = readinessSnapshot;
        }
      }
      const projectedOperation = stryMutAct_9fa48("133117") ? {} : (stryCov_9fa48("133117"), {
        ...operation,
        workflowStep: finalStep,
        status: WORKFLOW_STEP_TO_STATUS[finalStep],
        updatedAt: now,
        completedAt: now,
        stepsHistory: stryMutAct_9fa48("133118") ? [] : (stryCov_9fa48("133118"), [...(Array.isArray(operation.stepsHistory) ? operation.stepsHistory : stryMutAct_9fa48("133119") ? ["Stryker was here"] : (stryCov_9fa48("133119"), [])), stepEntry])
      });
      const projectIdempotentTransition = () => {
        if (stryMutAct_9fa48("133120")) {
          {}
        } else {
          stryCov_9fa48("133120");
          operation.workflowStep = finalStep;
          operation.status = WORKFLOW_STEP_TO_STATUS[finalStep];
          const previousUpdatedAt = Number(operation.updatedAt);
          operation.updatedAt = Number.isFinite(previousUpdatedAt) ? stryMutAct_9fa48("133121") ? Math.min(previousUpdatedAt, now) : (stryCov_9fa48("133121"), Math.max(previousUpdatedAt, now)) : now;
          const previousCompletedAt = Number(operation.completedAt);
          operation.completedAt = Number.isFinite(previousCompletedAt) ? stryMutAct_9fa48("133122") ? Math.min(previousCompletedAt, now) : (stryCov_9fa48("133122"), Math.max(previousCompletedAt, now)) : now;
        }
      };
      const persistFn = async sessionId => {
        if (stryMutAct_9fa48("133123")) {
          {}
        } else {
          stryCov_9fa48("133123");
          await this.repository.persistOperationUpdate(projectedOperation, this.buildTransitionPersistOptions(sessionId));
        }
      };
      const transitionCommitted = await this.executeAtomicTransition(operation, finalStep, OPERATION_TRANSITION_REASON.OPERATION_COMPLETED, persistFn, stryMutAct_9fa48("133124") ? {} : (stryCov_9fa48("133124"), {
        onIdempotentTransition: projectIdempotentTransition,
        afterCommit: async () => {
          if (stryMutAct_9fa48("133125")) {
            {}
          } else {
            stryCov_9fa48("133125");
            await this.confirmCommittedTransitionPersistence(projectedOperation);
          }
        }
      }));
      if (stryMutAct_9fa48("133128") ? false : stryMutAct_9fa48("133127") ? true : stryMutAct_9fa48("133126") ? transitionCommitted : (stryCov_9fa48("133126", "133127", "133128"), !transitionCommitted)) {
        if (stryMutAct_9fa48("133129")) {
          {}
        } else {
          stryCov_9fa48("133129");
          this.clearTransitionRetry(operation.operationId);
          await this.releaseReservationForOperation(operation);
          this.clearDeferredSafetyBlockState(operation.operationId);
          return;
        }
      }
      this.clearTransitionRetry(operation.operationId);
      operation.workflowStep = finalStep;
      operation.status = WORKFLOW_STEP_TO_STATUS[finalStep];
      operation.updatedAt = now;
      operation.completedAt = now;
      operation.stepsHistory.push(stepEntry);
      await this.releaseReservationForOperation(operation);
      this.clearDeferredSafetyBlockState(operation.operationId);
      stryMutAct_9fa48("133130") ? this.stats.operationsCompleted-- : (stryCov_9fa48("133130"), this.stats.operationsCompleted++);
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_COMPLETED, stryMutAct_9fa48("133131") ? {} : (stryCov_9fa48("133131"), {
        operationId: operation.operationId,
        type: operation.type,
        partitionId: operation.partitionId,
        targetNodeId: operation.targetNodeId
      }));
      this.emitter.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED, stryMutAct_9fa48("133132") ? {} : (stryCov_9fa48("133132"), {
        operation
      }));
      try {
        if (stryMutAct_9fa48("133133")) {
          {}
        } else {
          stryCov_9fa48("133133");
          this.logger.info(METRICS_LOG_TAG.REBALANCE_OPERATION, stryMutAct_9fa48("133134") ? {} : (stryCov_9fa48("133134"), {
            operationId: operation.operationId,
            entityType: operation.entityType,
            finalState: operation.status,
            totalDurationMs: stryMutAct_9fa48("133135") ? now + operation.createdAt : (stryCov_9fa48("133135"), now - operation.createdAt)
          }));
        }
      } catch (_metricsErr) {
        // Metrics logging failures must not propagate to callers
      }
    }
  }

  /**
   * Fail an operation.
   * @param {Object} operation
   * @param {string} errorMessage
   * @param {Object} [options]
   * @return {Promise<void>}
   */
  async failOperation(operation, errorMessage, options = {}) {
    if (stryMutAct_9fa48("133136")) {
      {}
    } else {
      stryCov_9fa48("133136");
      this.clearDispatchRetry(stryMutAct_9fa48("133137") ? operation.operationId : (stryCov_9fa48("133137"), operation?.operationId));
      const now = Date.now();
      if (stryMutAct_9fa48("133140") ? operation.workflowStep === WORKFLOW_STEP.FAILED && operation.completedAt !== null || operation.completedAt !== undefined : stryMutAct_9fa48("133139") ? false : stryMutAct_9fa48("133138") ? true : (stryCov_9fa48("133138", "133139", "133140"), (stryMutAct_9fa48("133142") ? operation.workflowStep === WORKFLOW_STEP.FAILED || operation.completedAt !== null : stryMutAct_9fa48("133141") ? true : (stryCov_9fa48("133141", "133142"), (stryMutAct_9fa48("133144") ? operation.workflowStep !== WORKFLOW_STEP.FAILED : stryMutAct_9fa48("133143") ? true : (stryCov_9fa48("133143", "133144"), operation.workflowStep === WORKFLOW_STEP.FAILED)) && (stryMutAct_9fa48("133146") ? operation.completedAt === null : stryMutAct_9fa48("133145") ? true : (stryCov_9fa48("133145", "133146"), operation.completedAt !== null)))) && (stryMutAct_9fa48("133148") ? operation.completedAt === undefined : stryMutAct_9fa48("133147") ? true : (stryCov_9fa48("133147", "133148"), operation.completedAt !== undefined)))) {
        if (stryMutAct_9fa48("133149")) {
          {}
        } else {
          stryCov_9fa48("133149");
          return;
        }
      }
      const normalizedError = this.normalizeErrorMessage(errorMessage, stryMutAct_9fa48("133150") ? "" : (stryCov_9fa48("133150"), 'Unknown error'));
      const isSafetyBlocked = this.isSafetyPolicyFailure(normalizedError);
      const logLevel = stryMutAct_9fa48("133153") ? options.logLevel && (isSafetyBlocked ? FAILURE_LOG_LEVEL.WARN : FAILURE_LOG_LEVEL.ERROR) : stryMutAct_9fa48("133152") ? false : stryMutAct_9fa48("133151") ? true : (stryCov_9fa48("133151", "133152", "133153"), options.logLevel || (isSafetyBlocked ? FAILURE_LOG_LEVEL.WARN : FAILURE_LOG_LEVEL.ERROR));
      const logMessage = stryMutAct_9fa48("133156") ? options.logMessage && (isSafetyBlocked ? REBALANCE_COORDINATOR_LOG_MSG.OPERATION_BLOCKED_BY_SAFETY_POLICY : REBALANCE_COORDINATOR_LOG_MSG.OPERATION_FAILED) : stryMutAct_9fa48("133155") ? false : stryMutAct_9fa48("133154") ? true : (stryCov_9fa48("133154", "133155", "133156"), options.logMessage || (isSafetyBlocked ? REBALANCE_COORDINATOR_LOG_MSG.OPERATION_BLOCKED_BY_SAFETY_POLICY : REBALANCE_COORDINATOR_LOG_MSG.OPERATION_FAILED));
      const previousStep = operation.workflowStep;
      const transitionReason = isSafetyBlocked ? OPERATION_TRANSITION_REASON.SAFETY_POLICY_BLOCKED : OPERATION_TRANSITION_REASON.OPERATION_FAILED;
      const readinessDecisionDimension = this.resolveOperationReadinessDecisionDimension(operation);
      const targetNodeId = operation.targetNodeId;
      const targetReadiness = targetNodeId ? this.controlPlaneReadinessService.getNodeReadinessSync(targetNodeId, stryMutAct_9fa48("133157") ? {} : (stryCov_9fa48("133157"), {
        decisionDimension: readinessDecisionDimension
      })) : null;
      const readinessSnapshot = ControlPlaneReadinessService.compactSnapshotSummary(targetReadiness, readinessDecisionDimension);
      const failedStepEntry = stryMutAct_9fa48("133158") ? {} : (stryCov_9fa48("133158"), {
        step: WORKFLOW_STEP.FAILED,
        timestamp: now,
        previousStep,
        reason: transitionReason,
        ownerKey: operation.operationId
      });
      if (stryMutAct_9fa48("133161") ? options.stepMetadata || typeof options.stepMetadata === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("133160") ? false : stryMutAct_9fa48("133159") ? true : (stryCov_9fa48("133159", "133160", "133161"), options.stepMetadata && (stryMutAct_9fa48("133163") ? typeof options.stepMetadata !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("133162") ? true : (stryCov_9fa48("133162", "133163"), typeof options.stepMetadata === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("133164")) {
          {}
        } else {
          stryCov_9fa48("133164");
          Object.assign(failedStepEntry, options.stepMetadata);
        }
      }
      if (stryMutAct_9fa48("133166") ? false : stryMutAct_9fa48("133165") ? true : (stryCov_9fa48("133165", "133166"), readinessSnapshot)) {
        if (stryMutAct_9fa48("133167")) {
          {}
        } else {
          stryCov_9fa48("133167");
          failedStepEntry[OPERATION_METADATA_KEY.READINESS_SNAPSHOT] = readinessSnapshot;
        }
      }
      const projectedOperation = stryMutAct_9fa48("133168") ? {} : (stryCov_9fa48("133168"), {
        ...operation,
        workflowStep: WORKFLOW_STEP.FAILED,
        status: ReplicaStatus.FAILED,
        updatedAt: now,
        completedAt: now,
        errorMessage: normalizedError,
        stepsHistory: stryMutAct_9fa48("133169") ? [] : (stryCov_9fa48("133169"), [...(Array.isArray(operation.stepsHistory) ? operation.stepsHistory : stryMutAct_9fa48("133170") ? ["Stryker was here"] : (stryCov_9fa48("133170"), [])), failedStepEntry])
      });
      const projectIdempotentTransition = () => {
        if (stryMutAct_9fa48("133171")) {
          {}
        } else {
          stryCov_9fa48("133171");
          operation.workflowStep = WORKFLOW_STEP.FAILED;
          operation.status = ReplicaStatus.FAILED;
          const previousUpdatedAt = Number(operation.updatedAt);
          operation.updatedAt = Number.isFinite(previousUpdatedAt) ? stryMutAct_9fa48("133172") ? Math.min(previousUpdatedAt, now) : (stryCov_9fa48("133172"), Math.max(previousUpdatedAt, now)) : now;
          const previousCompletedAt = Number(operation.completedAt);
          operation.completedAt = Number.isFinite(previousCompletedAt) ? stryMutAct_9fa48("133173") ? Math.min(previousCompletedAt, now) : (stryCov_9fa48("133173"), Math.max(previousCompletedAt, now)) : now;
          operation.errorMessage = normalizedError;
        }
      };
      const persistFn = async sessionId => {
        if (stryMutAct_9fa48("133174")) {
          {}
        } else {
          stryCov_9fa48("133174");
          await this.repository.persistOperationUpdate(projectedOperation, this.buildTransitionPersistOptions(sessionId));
        }
      };
      const transitionCommitted = await this.executeAtomicTransition(operation, WORKFLOW_STEP.FAILED, transitionReason, persistFn, stryMutAct_9fa48("133175") ? {} : (stryCov_9fa48("133175"), {
        onIdempotentTransition: projectIdempotentTransition,
        afterCommit: async () => {
          if (stryMutAct_9fa48("133176")) {
            {}
          } else {
            stryCov_9fa48("133176");
            await this.confirmCommittedTransitionPersistence(projectedOperation);
          }
        }
      }));
      if (stryMutAct_9fa48("133179") ? false : stryMutAct_9fa48("133178") ? true : stryMutAct_9fa48("133177") ? transitionCommitted : (stryCov_9fa48("133177", "133178", "133179"), !transitionCommitted)) {
        if (stryMutAct_9fa48("133180")) {
          {}
        } else {
          stryCov_9fa48("133180");
          this.clearTransitionRetry(operation.operationId);
          await this.releaseReservationForOperation(operation);
          this.clearDeferredSafetyBlockState(operation.operationId);
          return;
        }
      }
      this.clearTransitionRetry(operation.operationId);
      operation.workflowStep = WORKFLOW_STEP.FAILED;
      operation.status = ReplicaStatus.FAILED;
      operation.updatedAt = now;
      operation.completedAt = now;
      operation.errorMessage = normalizedError;
      operation.stepsHistory.push(failedStepEntry);
      await this.releaseReservationForOperation(operation);
      this.clearDeferredSafetyBlockState(operation.operationId);
      stryMutAct_9fa48("133181") ? this.stats.operationsFailed-- : (stryCov_9fa48("133181"), this.stats.operationsFailed++);
      const logPayload = stryMutAct_9fa48("133182") ? {} : (stryCov_9fa48("133182"), {
        operationId: operation.operationId,
        type: operation.type,
        partitionId: operation.partitionId,
        targetNodeId: operation.targetNodeId,
        errorMessage: normalizedError
      });
      const logMethod = (stryMutAct_9fa48("133185") ? logLevel === FAILURE_LOG_LEVEL.WARN || typeof this.logger.warn === 'function' : stryMutAct_9fa48("133184") ? false : stryMutAct_9fa48("133183") ? true : (stryCov_9fa48("133183", "133184", "133185"), (stryMutAct_9fa48("133187") ? logLevel !== FAILURE_LOG_LEVEL.WARN : stryMutAct_9fa48("133186") ? true : (stryCov_9fa48("133186", "133187"), logLevel === FAILURE_LOG_LEVEL.WARN)) && (stryMutAct_9fa48("133189") ? typeof this.logger.warn !== 'function' : stryMutAct_9fa48("133188") ? true : (stryCov_9fa48("133188", "133189"), typeof this.logger.warn === (stryMutAct_9fa48("133190") ? "" : (stryCov_9fa48("133190"), 'function')))))) ? this.logger.warn.bind(this.logger) : this.logger.error.bind(this.logger);
      logMethod(logMessage, logPayload);
      this.emitter.emit(REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED, stryMutAct_9fa48("133191") ? {} : (stryCov_9fa48("133191"), {
        operation,
        errorMessage: normalizedError
      }));
      try {
        if (stryMutAct_9fa48("133192")) {
          {}
        } else {
          stryCov_9fa48("133192");
          this.logger.info(METRICS_LOG_TAG.REBALANCE_OPERATION, stryMutAct_9fa48("133193") ? {} : (stryCov_9fa48("133193"), {
            operationId: operation.operationId,
            entityType: operation.entityType,
            finalState: operation.status,
            totalDurationMs: stryMutAct_9fa48("133194") ? now + operation.createdAt : (stryCov_9fa48("133194"), now - operation.createdAt)
          }));
        }
      } catch (_metricsErr) {
        // Metrics logging failures must not propagate to callers
      }
    }
  }

  // --- Claim / dispatch / execution ---

  /**
   * Claim one pending operation for dispatch progression.
   * Uses the narrow priority CAS path only when needed and otherwise
   * reuses the canonical transition owner update path.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async claimPendingDispatchOperation(operation) {
    if (stryMutAct_9fa48("133195")) {
      {}
    } else {
      stryCov_9fa48("133195");
      if (stryMutAct_9fa48("133198") ? (!operation || operation.workflowStep !== WORKFLOW_STEP.PENDING || !isCoordinatorOwnedOperationType(operation.type)) && !this.repository.isOperationLocallyOwned(operation) : stryMutAct_9fa48("133197") ? false : stryMutAct_9fa48("133196") ? true : (stryCov_9fa48("133196", "133197", "133198"), (stryMutAct_9fa48("133200") ? (!operation || operation.workflowStep !== WORKFLOW_STEP.PENDING) && !isCoordinatorOwnedOperationType(operation.type) : stryMutAct_9fa48("133199") ? false : (stryCov_9fa48("133199", "133200"), (stryMutAct_9fa48("133202") ? !operation && operation.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("133201") ? false : (stryCov_9fa48("133201", "133202"), (stryMutAct_9fa48("133203") ? operation : (stryCov_9fa48("133203"), !operation)) || (stryMutAct_9fa48("133205") ? operation.workflowStep === WORKFLOW_STEP.PENDING : stryMutAct_9fa48("133204") ? false : (stryCov_9fa48("133204", "133205"), operation.workflowStep !== WORKFLOW_STEP.PENDING)))) || (stryMutAct_9fa48("133206") ? isCoordinatorOwnedOperationType(operation.type) : (stryCov_9fa48("133206"), !isCoordinatorOwnedOperationType(operation.type))))) || (stryMutAct_9fa48("133207") ? this.repository.isOperationLocallyOwned(operation) : (stryCov_9fa48("133207"), !this.repository.isOperationLocallyOwned(operation))))) {
        if (stryMutAct_9fa48("133208")) {
          {}
        } else {
          stryCov_9fa48("133208");
          return null;
        }
      }
      if (stryMutAct_9fa48("133210") ? false : stryMutAct_9fa48("133209") ? true : (stryCov_9fa48("133209", "133210"), this.shouldUsePriorityDispatchClaimNarrowPath(operation))) {
        if (stryMutAct_9fa48("133211")) {
          {}
        } else {
          stryCov_9fa48("133211");
          const claimedOperation = await this.claimPriorityDispatchTransition(operation);
          if (stryMutAct_9fa48("133213") ? false : stryMutAct_9fa48("133212") ? true : (stryCov_9fa48("133212", "133213"), claimedOperation)) {
            if (stryMutAct_9fa48("133214")) {
              {}
            } else {
              stryCov_9fa48("133214");
              return claimedOperation;
            }
          }
          const retryableClaimError = this.buildPriorityDispatchClaimRetryableError(operation);
          this.deferDispatchRetry(operation, retryableClaimError);
          return null;
        }
      }
      await this.updateStep(operation, WORKFLOW_STEP.SENDING, OPERATION_TRANSITION_REASON.DISPATCH_SENDING);
      return operation;
    }
  }

  /**
   * Claim a PENDING operation for dispatch.
   * @param {string} operationId
   * @return {Promise<Object|null>}
   */
  async claimDispatchTransition(operationId) {
    if (stryMutAct_9fa48("133215")) {
      {}
    } else {
      stryCov_9fa48("133215");
      if (stryMutAct_9fa48("133218") ? this.isShuttingDown && !this.isInitialized : stryMutAct_9fa48("133217") ? false : stryMutAct_9fa48("133216") ? true : (stryCov_9fa48("133216", "133217", "133218"), this.isShuttingDown || (stryMutAct_9fa48("133219") ? this.isInitialized : (stryCov_9fa48("133219"), !this.isInitialized)))) {
        if (stryMutAct_9fa48("133220")) {
          {}
        } else {
          stryCov_9fa48("133220");
          return null;
        }
      }
      const operation = await this.repository.queryOperationById(operationId);
      if (stryMutAct_9fa48("133223") ? false : stryMutAct_9fa48("133222") ? true : stryMutAct_9fa48("133221") ? operation : (stryCov_9fa48("133221", "133222", "133223"), !operation)) {
        if (stryMutAct_9fa48("133224")) {
          {}
        } else {
          stryCov_9fa48("133224");
          return null;
        }
      }
      if (stryMutAct_9fa48("133227") ? operation.workflowStep === WORKFLOW_STEP.PENDING : stryMutAct_9fa48("133226") ? false : stryMutAct_9fa48("133225") ? true : (stryCov_9fa48("133225", "133226", "133227"), operation.workflowStep !== WORKFLOW_STEP.PENDING)) {
        if (stryMutAct_9fa48("133228")) {
          {}
        } else {
          stryCov_9fa48("133228");
          return null;
        }
      }
      if (stryMutAct_9fa48("133231") ? false : stryMutAct_9fa48("133230") ? true : stryMutAct_9fa48("133229") ? isCoordinatorOwnedOperationType(operation.type) : (stryCov_9fa48("133229", "133230", "133231"), !isCoordinatorOwnedOperationType(operation.type))) {
        if (stryMutAct_9fa48("133232")) {
          {}
        } else {
          stryCov_9fa48("133232");
          return null;
        }
      }
      if (stryMutAct_9fa48("133235") ? false : stryMutAct_9fa48("133234") ? true : stryMutAct_9fa48("133233") ? this.repository.isOperationLocallyOwned(operation) : (stryCov_9fa48("133233", "133234", "133235"), !this.repository.isOperationLocallyOwned(operation))) {
        if (stryMutAct_9fa48("133236")) {
          {}
        } else {
          stryCov_9fa48("133236");
          return null;
        }
      }
      return this.claimPendingDispatchOperation(operation);
    }
  }

  /**
   * Dispatch one operation through the single-flight lane.
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   */
  async dispatchOperation(operationInput) {
    if (stryMutAct_9fa48("133237")) {
      {}
    } else {
      stryCov_9fa48("133237");
      if (stryMutAct_9fa48("133240") ? this.isShuttingDown && !this.isInitialized : stryMutAct_9fa48("133239") ? false : stryMutAct_9fa48("133238") ? true : (stryCov_9fa48("133238", "133239", "133240"), this.isShuttingDown || (stryMutAct_9fa48("133241") ? this.isInitialized : (stryCov_9fa48("133241"), !this.isInitialized)))) {
        if (stryMutAct_9fa48("133242")) {
          {}
        } else {
          stryCov_9fa48("133242");
          return this.buildSkippedOperationResult(OPERATION_WORKFLOW_OWNER_REASON.SHUTDOWN_IN_PROGRESS, this.getOperationIdFromInput(operationInput));
        }
      }
      const operationId = this.getOperationIdFromInput(operationInput);
      if (stryMutAct_9fa48("133245") ? false : stryMutAct_9fa48("133244") ? true : stryMutAct_9fa48("133243") ? operationId : (stryCov_9fa48("133243", "133244", "133245"), !operationId)) {
        if (stryMutAct_9fa48("133246")) {
          {}
        } else {
          stryCov_9fa48("133246");
          return this.buildSkippedOperationResult(OPERATION_WORKFLOW_OWNER_REASON.OPERATION_ID_REQUIRED, null);
        }
      }
      return this.runOperationOwnerAction(OPERATION_OWNER_ACTION.DISPATCH, operationInput, stryMutAct_9fa48("133247") ? {} : (stryCov_9fa48("133247"), {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.DISPATCH
      }));
    }
  }

  /**
   * Resolve an operation id from one supported caller payload.
   * @param {string|Object} operationInput
   * @return {string|null}
   */
  getOperationIdFromInput(operationInput) {
    if (stryMutAct_9fa48("133248")) {
      {}
    } else {
      stryCov_9fa48("133248");
      if (stryMutAct_9fa48("133251") ? typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.STRING || operationInput.length > NUM.ZERO : stryMutAct_9fa48("133250") ? false : stryMutAct_9fa48("133249") ? true : (stryCov_9fa48("133249", "133250", "133251"), (stryMutAct_9fa48("133253") ? typeof operationInput !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("133252") ? true : (stryCov_9fa48("133252", "133253"), typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) && (stryMutAct_9fa48("133256") ? operationInput.length <= NUM.ZERO : stryMutAct_9fa48("133255") ? operationInput.length >= NUM.ZERO : stryMutAct_9fa48("133254") ? true : (stryCov_9fa48("133254", "133255", "133256"), operationInput.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("133257")) {
          {}
        } else {
          stryCov_9fa48("133257");
          return operationInput;
        }
      }
      if (stryMutAct_9fa48("133260") ? !operationInput && typeof operationInput !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("133259") ? false : stryMutAct_9fa48("133258") ? true : (stryCov_9fa48("133258", "133259", "133260"), (stryMutAct_9fa48("133261") ? operationInput : (stryCov_9fa48("133261"), !operationInput)) || (stryMutAct_9fa48("133263") ? typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("133262") ? false : (stryCov_9fa48("133262", "133263"), typeof operationInput !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("133264")) {
          {}
        } else {
          stryCov_9fa48("133264");
          return null;
        }
      }
      if (stryMutAct_9fa48("133267") ? typeof operationInput.operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING || operationInput.operationId.length > NUM.ZERO : stryMutAct_9fa48("133266") ? false : stryMutAct_9fa48("133265") ? true : (stryCov_9fa48("133265", "133266", "133267"), (stryMutAct_9fa48("133269") ? typeof operationInput.operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("133268") ? true : (stryCov_9fa48("133268", "133269"), typeof operationInput.operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) && (stryMutAct_9fa48("133272") ? operationInput.operationId.length <= NUM.ZERO : stryMutAct_9fa48("133271") ? operationInput.operationId.length >= NUM.ZERO : stryMutAct_9fa48("133270") ? true : (stryCov_9fa48("133270", "133271", "133272"), operationInput.operationId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("133273")) {
          {}
        } else {
          stryCov_9fa48("133273");
          return operationInput.operationId;
        }
      }
      if (stryMutAct_9fa48("133276") ? typeof operationInput.operation_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING || operationInput.operation_id.length > NUM.ZERO : stryMutAct_9fa48("133275") ? false : stryMutAct_9fa48("133274") ? true : (stryCov_9fa48("133274", "133275", "133276"), (stryMutAct_9fa48("133278") ? typeof operationInput.operation_id !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("133277") ? true : (stryCov_9fa48("133277", "133278"), typeof operationInput.operation_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) && (stryMutAct_9fa48("133281") ? operationInput.operation_id.length <= NUM.ZERO : stryMutAct_9fa48("133280") ? operationInput.operation_id.length >= NUM.ZERO : stryMutAct_9fa48("133279") ? true : (stryCov_9fa48("133279", "133280", "133281"), operationInput.operation_id.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("133282")) {
          {}
        } else {
          stryCov_9fa48("133282");
          return operationInput.operation_id;
        }
      }
      return null;
    }
  }

  /**
   * Normalize one dispatch input to a canonical operation object.
   * @param {string|Object} operationInput
   * @return {Promise<Object|null>}
   */
  async resolveDispatchOperation(operationInput) {
    if (stryMutAct_9fa48("133283")) {
      {}
    } else {
      stryCov_9fa48("133283");
      if (stryMutAct_9fa48("133286") ? typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.STRING || operationInput.length > NUM.ZERO : stryMutAct_9fa48("133285") ? false : stryMutAct_9fa48("133284") ? true : (stryCov_9fa48("133284", "133285", "133286"), (stryMutAct_9fa48("133288") ? typeof operationInput !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("133287") ? true : (stryCov_9fa48("133287", "133288"), typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) && (stryMutAct_9fa48("133291") ? operationInput.length <= NUM.ZERO : stryMutAct_9fa48("133290") ? operationInput.length >= NUM.ZERO : stryMutAct_9fa48("133289") ? true : (stryCov_9fa48("133289", "133290", "133291"), operationInput.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("133292")) {
          {}
        } else {
          stryCov_9fa48("133292");
          return this.repository.queryOperationById(operationInput);
        }
      }
      if (stryMutAct_9fa48("133295") ? !operationInput && typeof operationInput !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("133294") ? false : stryMutAct_9fa48("133293") ? true : (stryCov_9fa48("133293", "133294", "133295"), (stryMutAct_9fa48("133296") ? operationInput : (stryCov_9fa48("133296"), !operationInput)) || (stryMutAct_9fa48("133298") ? typeof operationInput === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("133297") ? false : (stryCov_9fa48("133297", "133298"), typeof operationInput !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("133299")) {
          {}
        } else {
          stryCov_9fa48("133299");
          return null;
        }
      }
      if (stryMutAct_9fa48("133302") ? typeof operationInput.operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING || operationInput.operationId.length > NUM.ZERO : stryMutAct_9fa48("133301") ? false : stryMutAct_9fa48("133300") ? true : (stryCov_9fa48("133300", "133301", "133302"), (stryMutAct_9fa48("133304") ? typeof operationInput.operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("133303") ? true : (stryCov_9fa48("133303", "133304"), typeof operationInput.operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) && (stryMutAct_9fa48("133307") ? operationInput.operationId.length <= NUM.ZERO : stryMutAct_9fa48("133306") ? operationInput.operationId.length >= NUM.ZERO : stryMutAct_9fa48("133305") ? true : (stryCov_9fa48("133305", "133306", "133307"), operationInput.operationId.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("133308")) {
          {}
        } else {
          stryCov_9fa48("133308");
          return isCoordinatorOwnedOperationType(operationInput.type) ? operationInput : null;
        }
      }
      if (stryMutAct_9fa48("133311") ? typeof operationInput.operation_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING || operationInput.operation_id.length > NUM.ZERO : stryMutAct_9fa48("133310") ? false : stryMutAct_9fa48("133309") ? true : (stryCov_9fa48("133309", "133310", "133311"), (stryMutAct_9fa48("133313") ? typeof operationInput.operation_id !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("133312") ? true : (stryCov_9fa48("133312", "133313"), typeof operationInput.operation_id === OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) && (stryMutAct_9fa48("133316") ? operationInput.operation_id.length <= NUM.ZERO : stryMutAct_9fa48("133315") ? operationInput.operation_id.length >= NUM.ZERO : stryMutAct_9fa48("133314") ? true : (stryCov_9fa48("133314", "133315", "133316"), operationInput.operation_id.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("133317")) {
          {}
        } else {
          stryCov_9fa48("133317");
          const operation = this.repository.rowToOperation(operationInput);
          return isCoordinatorOwnedOperationType(stryMutAct_9fa48("133318") ? operation.type : (stryCov_9fa48("133318"), operation?.type)) ? operation : null;
        }
      }
      return null;
    }
  }

  /**
   * Execute one dispatch attempt after ownership serialization.
   * @param {string|Object} operationInput
   * @return {Promise<Object>}
   */
  async dispatchOperationInternal(operationInput) {
    if (stryMutAct_9fa48("133319")) {
      {}
    } else {
      stryCov_9fa48("133319");
      const operation = await this.resolveDispatchOperation(operationInput);
      const operationId = this.getOperationIdFromInput(operationInput);
      if (stryMutAct_9fa48("133322") ? false : stryMutAct_9fa48("133321") ? true : stryMutAct_9fa48("133320") ? operation : (stryCov_9fa48("133320", "133321", "133322"), !operation)) {
        if (stryMutAct_9fa48("133323")) {
          {}
        } else {
          stryCov_9fa48("133323");
          return this.buildSkippedOperationResult(OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_FOUND, operationId);
        }
      }
      if (stryMutAct_9fa48("133326") ? false : stryMutAct_9fa48("133325") ? true : stryMutAct_9fa48("133324") ? this.repository.isOperationLocallyOwned(operation) : (stryCov_9fa48("133324", "133325", "133326"), !this.repository.isOperationLocallyOwned(operation))) {
        if (stryMutAct_9fa48("133327")) {
          {}
        } else {
          stryCov_9fa48("133327");
          return this.buildSkippedOperationResult(REBALANCER_SKIP_REASON.OPERATION_OWNED_BY_ANOTHER_NODE, operation.operationId);
        }
      }
      const replaceRemoveDispatchPhase = this.repository.isReplaceRemoveDispatchPhase(operation);
      const dispatchableWorkflowStep = operation.workflowStep;
      if (stryMutAct_9fa48("133329") ? false : stryMutAct_9fa48("133328") ? true : (stryCov_9fa48("133328", "133329"), replaceRemoveDispatchPhase)) {
        if (stryMutAct_9fa48("133330")) {
          {}
        } else {
          stryCov_9fa48("133330");
          if (stryMutAct_9fa48("133333") ? dispatchableWorkflowStep !== WORKFLOW_STEP.ACTIVE || dispatchableWorkflowStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("133332") ? false : stryMutAct_9fa48("133331") ? true : (stryCov_9fa48("133331", "133332", "133333"), (stryMutAct_9fa48("133335") ? dispatchableWorkflowStep === WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("133334") ? true : (stryCov_9fa48("133334", "133335"), dispatchableWorkflowStep !== WORKFLOW_STEP.ACTIVE)) && (stryMutAct_9fa48("133337") ? dispatchableWorkflowStep === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("133336") ? true : (stryCov_9fa48("133336", "133337"), dispatchableWorkflowStep !== WORKFLOW_STEP.STOPPING)))) {
            if (stryMutAct_9fa48("133338")) {
              {}
            } else {
              stryCov_9fa48("133338");
              return this.buildSkippedOperationResult(OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE, operation.operationId);
            }
          }
        }
      } else if (stryMutAct_9fa48("133341") ? dispatchableWorkflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("133340") ? false : stryMutAct_9fa48("133339") ? true : (stryCov_9fa48("133339", "133340", "133341"), dispatchableWorkflowStep === WORKFLOW_STEP.PENDING)) {
        if (stryMutAct_9fa48("133342")) {
          {}
        } else {
          stryCov_9fa48("133342");
          const claimedOperation = await this.claimPendingDispatchOperation(operation);
          if (stryMutAct_9fa48("133345") ? false : stryMutAct_9fa48("133344") ? true : stryMutAct_9fa48("133343") ? claimedOperation : (stryCov_9fa48("133343", "133344", "133345"), !claimedOperation)) {
            if (stryMutAct_9fa48("133346")) {
              {}
            } else {
              stryCov_9fa48("133346");
              const dispatchRetryScheduled = this.dispatchRetryTimerByOperationId.has(operation.operationId);
              if (stryMutAct_9fa48("133348") ? false : stryMutAct_9fa48("133347") ? true : (stryCov_9fa48("133347", "133348"), dispatchRetryScheduled)) {
                if (stryMutAct_9fa48("133349")) {
                  {}
                } else {
                  stryCov_9fa48("133349");
                  return this.buildSkippedOperationResult(REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING, operation.operationId, stryMutAct_9fa48("133350") ? {} : (stryCov_9fa48("133350"), {
                    error: stryMutAct_9fa48("133351") ? OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED_WHILE_CLAIMING_PRIORITY - OPERATION_WORKFLOW_OWNER_LITERAL.DISPATCH_TRANSITION : (stryCov_9fa48("133351"), OPERATION_WORKFLOW_OWNER_LITERAL.CONTROL_PLANE_PRESSURE_DEGRADED_WHILE_CLAIMING_PRIORITY + OPERATION_WORKFLOW_OWNER_LITERAL.DISPATCH_TRANSITION)
                  }));
                }
              }
              return this.buildSkippedOperationResult(OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE, operation.operationId);
            }
          }
        }
      } else if (stryMutAct_9fa48("133354") ? dispatchableWorkflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("133353") ? false : stryMutAct_9fa48("133352") ? true : (stryCov_9fa48("133352", "133353", "133354"), dispatchableWorkflowStep !== WORKFLOW_STEP.SENDING)) {
        if (stryMutAct_9fa48("133355")) {
          {}
        } else {
          stryCov_9fa48("133355");
          return stryMutAct_9fa48("133356") ? {} : (stryCov_9fa48("133356"), {
            success: stryMutAct_9fa48("133357") ? true : (stryCov_9fa48("133357"), false),
            skipped: stryMutAct_9fa48("133358") ? false : (stryCov_9fa48("133358"), true),
            reason: OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
            operationId: operation.operationId
          });
        }
      }
      return this.executeOperationInternal(operation);
    }
  }

  /**
   * Execute operation through the single-flight lane.
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async executeOperation(operation) {
    if (stryMutAct_9fa48("133359")) {
      {}
    } else {
      stryCov_9fa48("133359");
      if (stryMutAct_9fa48("133362") ? this.isShuttingDown && !this.isInitialized : stryMutAct_9fa48("133361") ? false : stryMutAct_9fa48("133360") ? true : (stryCov_9fa48("133360", "133361", "133362"), this.isShuttingDown || (stryMutAct_9fa48("133363") ? this.isInitialized : (stryCov_9fa48("133363"), !this.isInitialized)))) {
        if (stryMutAct_9fa48("133364")) {
          {}
        } else {
          stryCov_9fa48("133364");
          return stryMutAct_9fa48("133365") ? {} : (stryCov_9fa48("133365"), {
            success: stryMutAct_9fa48("133366") ? true : (stryCov_9fa48("133366"), false),
            skipped: stryMutAct_9fa48("133367") ? false : (stryCov_9fa48("133367"), true),
            reason: OPERATION_WORKFLOW_OWNER_REASON.SHUTDOWN_IN_PROGRESS,
            operationId: stryMutAct_9fa48("133368") ? operation.operationId : (stryCov_9fa48("133368"), operation?.operationId)
          });
        }
      }
      return this.runOperationOwnerAction(OPERATION_OWNER_ACTION.EXECUTE, operation, stryMutAct_9fa48("133369") ? {} : (stryCov_9fa48("133369"), {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTE,
        workflowStep: stryMutAct_9fa48("133372") ? operation?.workflowStep && null : stryMutAct_9fa48("133371") ? false : stryMutAct_9fa48("133370") ? true : (stryCov_9fa48("133370", "133371", "133372"), (stryMutAct_9fa48("133373") ? operation.workflowStep : (stryCov_9fa48("133373"), operation?.workflowStep)) || null),
        partitionId: stryMutAct_9fa48("133376") ? operation?.partitionId && null : stryMutAct_9fa48("133375") ? false : stryMutAct_9fa48("133374") ? true : (stryCov_9fa48("133374", "133375", "133376"), (stryMutAct_9fa48("133377") ? operation.partitionId : (stryCov_9fa48("133377"), operation?.partitionId)) || null),
        skipWhenOwnerLaneHeld: stryMutAct_9fa48("133378") ? false : (stryCov_9fa48("133378"), true)
      }));
    }
  }

  /**
   * Execute one operation from reconciliation paths that may already hold
   * the per-operation owner key.
   *
   * Calling executeOperation() while runExclusive already owns the same key
   * returns OPERATION_ALREADY_EXECUTING and can stall REPLACE source-removal
   * progression. Reconciliation paths must dispatch directly when they
   * already hold ownership.
   *
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async executeOperationFromReconcilePath(operation) {
    if (stryMutAct_9fa48("133379")) {
      {}
    } else {
      stryCov_9fa48("133379");
      return this.runOperationOwnerAction(OPERATION_OWNER_ACTION.EXECUTE, operation, stryMutAct_9fa48("133380") ? {} : (stryCov_9fa48("133380"), {
        boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTE_RECONCILE,
        workflowStep: stryMutAct_9fa48("133383") ? operation?.workflowStep && null : stryMutAct_9fa48("133382") ? false : stryMutAct_9fa48("133381") ? true : (stryCov_9fa48("133381", "133382", "133383"), (stryMutAct_9fa48("133384") ? operation.workflowStep : (stryCov_9fa48("133384"), operation?.workflowStep)) || null),
        partitionId: stryMutAct_9fa48("133387") ? operation?.partitionId && null : stryMutAct_9fa48("133386") ? false : stryMutAct_9fa48("133385") ? true : (stryCov_9fa48("133385", "133386", "133387"), (stryMutAct_9fa48("133388") ? operation.partitionId : (stryCov_9fa48("133388"), operation?.partitionId)) || null),
        runInlineWhenOwnerLaneHeld: stryMutAct_9fa48("133389") ? false : (stryCov_9fa48("133389"), true)
      }));
    }
  }

  /**
   * Execute operation body once per operation ID.
   * @param {Object} operation
   * @return {Promise<Object>}
   */
  async executeOperationInternal(operation) {
    if (stryMutAct_9fa48("133390")) {
      {}
    } else {
      stryCov_9fa48("133390");
      if (stryMutAct_9fa48("133393") ? false : stryMutAct_9fa48("133392") ? true : stryMutAct_9fa48("133391") ? this.messageRouter : (stryCov_9fa48("133391", "133392", "133393"), !this.messageRouter)) {
        if (stryMutAct_9fa48("133394")) {
          {}
        } else {
          stryCov_9fa48("133394");
          throw new Error(REBALANCE_COORDINATOR_ERROR_MSG.ROUTER_MISSING);
        }
      }
      if (stryMutAct_9fa48("133397") ? false : stryMutAct_9fa48("133396") ? true : stryMutAct_9fa48("133395") ? this.repository.isOperationLocallyOwned(operation) : (stryCov_9fa48("133395", "133396", "133397"), !this.repository.isOperationLocallyOwned(operation))) {
        if (stryMutAct_9fa48("133398")) {
          {}
        } else {
          stryCov_9fa48("133398");
          return this.buildSkippedOperationResult(REBALANCER_SKIP_REASON.OPERATION_OWNED_BY_ANOTHER_NODE, stryMutAct_9fa48("133399") ? operation.operationId : (stryCov_9fa48("133399"), operation?.operationId));
        }
      }
      const supersededPriorityRecoveryError = await this.getPriorityRecoverySupersededTargetError(operation);
      if (stryMutAct_9fa48("133401") ? false : stryMutAct_9fa48("133400") ? true : (stryCov_9fa48("133400", "133401"), supersededPriorityRecoveryError)) {
        if (stryMutAct_9fa48("133402")) {
          {}
        } else {
          stryCov_9fa48("133402");
          await this.failOperation(operation, supersededPriorityRecoveryError, stryMutAct_9fa48("133403") ? {} : (stryCov_9fa48("133403"), {
            logLevel: FAILURE_LOG_LEVEL.WARN
          }));
          return this.buildFailedOperationResult(operation.operationId, supersededPriorityRecoveryError);
        }
      }
      const replaceRemoveDispatchPhase = this.repository.isReplaceRemoveDispatchPhase(operation);
      const removeStoppingReplayPhase = stryMutAct_9fa48("133406") ? operation.type === OperationType.REMOVE || operation.workflowStep === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("133405") ? false : stryMutAct_9fa48("133404") ? true : (stryCov_9fa48("133404", "133405", "133406"), (stryMutAct_9fa48("133408") ? operation.type !== OperationType.REMOVE : stryMutAct_9fa48("133407") ? true : (stryCov_9fa48("133407", "133408"), operation.type === OperationType.REMOVE)) && (stryMutAct_9fa48("133410") ? operation.workflowStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("133409") ? true : (stryCov_9fa48("133409", "133410"), operation.workflowStep === WORKFLOW_STEP.STOPPING)));
      const replaceSourceReplicaId = this.repository.getReplaceSourceReplicaId(operation);
      if (stryMutAct_9fa48("133413") ? !replaceRemoveDispatchPhase || !removeStoppingReplayPhase : stryMutAct_9fa48("133412") ? false : stryMutAct_9fa48("133411") ? true : (stryCov_9fa48("133411", "133412", "133413"), (stryMutAct_9fa48("133414") ? replaceRemoveDispatchPhase : (stryCov_9fa48("133414"), !replaceRemoveDispatchPhase)) && (stryMutAct_9fa48("133415") ? removeStoppingReplayPhase : (stryCov_9fa48("133415"), !removeStoppingReplayPhase)))) {
        if (stryMutAct_9fa48("133416")) {
          {}
        } else {
          stryCov_9fa48("133416");
          await this.updateStep(operation, WORKFLOW_STEP.SENDING);
        }
      }
      const removeSafetyError = await this.getRemoveSafetyError(operation);
      if (stryMutAct_9fa48("133418") ? false : stryMutAct_9fa48("133417") ? true : (stryCov_9fa48("133417", "133418"), removeSafetyError)) {
        if (stryMutAct_9fa48("133419")) {
          {}
        } else {
          stryCov_9fa48("133419");
          const removeSafetyDeferReason = await this.getRemoveSafetyDeferReason(operation, replaceRemoveDispatchPhase, removeSafetyError);
          if (stryMutAct_9fa48("133421") ? false : stryMutAct_9fa48("133420") ? true : (stryCov_9fa48("133420", "133421"), removeSafetyDeferReason)) {
            if (stryMutAct_9fa48("133422")) {
              {}
            } else {
              stryCov_9fa48("133422");
              this.logDeferredSafetyBlockedRemove(operation, removeSafetyError, removeSafetyDeferReason);
              this.scheduleDeferredSafetyRetry(operation, removeSafetyDeferReason, removeSafetyError);
              return this.buildSkippedOperationResult(REBALANCER_SKIP_REASON.SAFETY_BLOCKED, operation.operationId, stryMutAct_9fa48("133423") ? {} : (stryCov_9fa48("133423"), {
                deferReason: removeSafetyDeferReason,
                error: removeSafetyError
              }));
            }
          }
          await this.failOperation(operation, removeSafetyError, stryMutAct_9fa48("133424") ? {} : (stryCov_9fa48("133424"), {
            logLevel: FAILURE_LOG_LEVEL.WARN,
            logMessage: REBALANCE_COORDINATOR_LOG_MSG.OPERATION_BLOCKED_BY_SAFETY_POLICY
          }));
          return this.buildFailedOperationResult(operation.operationId, removeSafetyError);
        }
      }
      this.clearDeferredSafetyBlockState(operation.operationId);
      const entityType = stryMutAct_9fa48("133427") ? operation.entityType && SERVICE_TYPE.PARTITION : stryMutAct_9fa48("133426") ? false : stryMutAct_9fa48("133425") ? true : (stryCov_9fa48("133425", "133426", "133427"), operation.entityType || SERVICE_TYPE.PARTITION);
      const entityId = stryMutAct_9fa48("133430") ? operation.entityId && operation.partitionId : stryMutAct_9fa48("133429") ? false : stryMutAct_9fa48("133428") ? true : (stryCov_9fa48("133428", "133429", "133430"), operation.entityId || operation.partitionId);
      const handlerType = stryMutAct_9fa48("133433") ? OPERATION_HANDLER[entityType] && OPERATION_HANDLER[SERVICE_TYPE.PARTITION] : stryMutAct_9fa48("133432") ? false : stryMutAct_9fa48("133431") ? true : (stryCov_9fa48("133431", "133432", "133433"), OPERATION_HANDLER[entityType] || OPERATION_HANDLER[SERVICE_TYPE.PARTITION]);
      let dispatchNodeId = operation.targetNodeId;
      let messageType = ReplicaOperationMessageType.CREATE_REPLICA;
      let requestReplicaId = operation.replicaId;
      let requestReason = null;
      if (stryMutAct_9fa48("133436") ? operation.type !== OperationType.REMOVE : stryMutAct_9fa48("133435") ? false : stryMutAct_9fa48("133434") ? true : (stryCov_9fa48("133434", "133435", "133436"), operation.type === OperationType.REMOVE)) {
        if (stryMutAct_9fa48("133437")) {
          {}
        } else {
          stryCov_9fa48("133437");
          messageType = ReplicaOperationMessageType.REMOVE_REPLICA;
        }
      } else if (stryMutAct_9fa48("133440") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("133439") ? false : stryMutAct_9fa48("133438") ? true : (stryCov_9fa48("133438", "133439", "133440"), operation.type === OperationType.REPLACE)) {
        if (stryMutAct_9fa48("133441")) {
          {}
        } else {
          stryCov_9fa48("133441");
          if (stryMutAct_9fa48("133443") ? false : stryMutAct_9fa48("133442") ? true : (stryCov_9fa48("133442", "133443"), replaceRemoveDispatchPhase)) {
            if (stryMutAct_9fa48("133444")) {
              {}
            } else {
              stryCov_9fa48("133444");
              dispatchNodeId = operation.sourceNodeId;
              messageType = ReplicaOperationMessageType.REMOVE_REPLICA;
              requestReplicaId = replaceSourceReplicaId;
              requestReason = OPERATION_WORKFLOW_OWNER_LITERAL.REPLACE_SOURCE_REMOVAL;
            }
          } else {
            if (stryMutAct_9fa48("133445")) {
              {}
            } else {
              stryCov_9fa48("133445");
              messageType = ReplicaOperationMessageType.CREATE_REPLICA;
              if (stryMutAct_9fa48("133448") ? !operation.replicaId && operation.replicaId === replaceSourceReplicaId : stryMutAct_9fa48("133447") ? false : stryMutAct_9fa48("133446") ? true : (stryCov_9fa48("133446", "133447", "133448"), (stryMutAct_9fa48("133449") ? operation.replicaId : (stryCov_9fa48("133449"), !operation.replicaId)) || (stryMutAct_9fa48("133451") ? operation.replicaId !== replaceSourceReplicaId : stryMutAct_9fa48("133450") ? false : (stryCov_9fa48("133450", "133451"), operation.replicaId === replaceSourceReplicaId)))) {
                if (stryMutAct_9fa48("133452")) {
                  {}
                } else {
                  stryCov_9fa48("133452");
                  operation.replicaId = await this.allocateCanonicalReplicaId(stryMutAct_9fa48("133453") ? {} : (stryCov_9fa48("133453"), {
                    partitionId: operation.partitionId,
                    entityType,
                    entityId,
                    excludeReplicaIds: replaceSourceReplicaId ? stryMutAct_9fa48("133454") ? [] : (stryCov_9fa48("133454"), [replaceSourceReplicaId]) : stryMutAct_9fa48("133455") ? ["Stryker was here"] : (stryCov_9fa48("133455"), [])
                  }));
                }
              }
              requestReplicaId = operation.replicaId;
            }
          }
        }
      }
      if (stryMutAct_9fa48("133458") ? operation.type === OperationType.REPLACE && replaceRemoveDispatchPhase || !requestReplicaId : stryMutAct_9fa48("133457") ? false : stryMutAct_9fa48("133456") ? true : (stryCov_9fa48("133456", "133457", "133458"), (stryMutAct_9fa48("133460") ? operation.type === OperationType.REPLACE || replaceRemoveDispatchPhase : stryMutAct_9fa48("133459") ? true : (stryCov_9fa48("133459", "133460"), (stryMutAct_9fa48("133462") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("133461") ? true : (stryCov_9fa48("133461", "133462"), operation.type === OperationType.REPLACE)) && replaceRemoveDispatchPhase)) && (stryMutAct_9fa48("133463") ? requestReplicaId : (stryCov_9fa48("133463"), !requestReplicaId)))) {
        if (stryMutAct_9fa48("133464")) {
          {}
        } else {
          stryCov_9fa48("133464");
          const replaceSourceMissing = (stryMutAct_9fa48("133465") ? "" : (stryCov_9fa48("133465"), 'Missing source replica for REPLACE operation ')) + operation.operationId;
          await this.failOperation(operation, replaceSourceMissing);
          return this.buildFailedOperationResult(operation.operationId, replaceSourceMissing);
        }
      }
      const target = stryMutAct_9fa48("133466") ? `` : (stryCov_9fa48("133466"), `${dispatchNodeId}/service/${handlerType}`);
      const request = stryMutAct_9fa48("133467") ? {} : (stryCov_9fa48("133467"), {
        [ReplicaOperationField.TYPE]: messageType,
        [ReplicaOperationField.OPERATION_ID]: operation.operationId,
        [ReplicaOperationField.PARTITION_ID]: operation.partitionId,
        [ReplicaOperationField.REPLICA_ID]: requestReplicaId,
        [ReplicaOperationField.SOURCE_NODE_ID]: operation.sourceNodeId,
        [ReplicaOperationField.ENTITY_TYPE]: entityType,
        [ReplicaOperationField.ENTITY_ID]: entityId
      });
      if (stryMutAct_9fa48("133469") ? false : stryMutAct_9fa48("133468") ? true : (stryCov_9fa48("133468", "133469"), requestReason)) {
        if (stryMutAct_9fa48("133470")) {
          {}
        } else {
          stryCov_9fa48("133470");
          request[ReplicaOperationField.REASON] = requestReason;
        }
      }
      if (stryMutAct_9fa48("133473") ? Array.isArray(operation[ReplicaOperationField.REPLICA_IDS]) || operation[ReplicaOperationField.REPLICA_IDS].length > NUM.ZERO : stryMutAct_9fa48("133472") ? false : stryMutAct_9fa48("133471") ? true : (stryCov_9fa48("133471", "133472", "133473"), Array.isArray(operation[ReplicaOperationField.REPLICA_IDS]) && (stryMutAct_9fa48("133476") ? operation[ReplicaOperationField.REPLICA_IDS].length <= NUM.ZERO : stryMutAct_9fa48("133475") ? operation[ReplicaOperationField.REPLICA_IDS].length >= NUM.ZERO : stryMutAct_9fa48("133474") ? true : (stryCov_9fa48("133474", "133475", "133476"), operation[ReplicaOperationField.REPLICA_IDS].length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("133477")) {
          {}
        } else {
          stryCov_9fa48("133477");
          request[ReplicaOperationField.REPLICA_IDS] = operation[ReplicaOperationField.REPLICA_IDS];
        }
      }
      if (stryMutAct_9fa48("133480") ? Array.isArray(operation[ReplicaOperationField.PEER_ADDRESSES]) || operation[ReplicaOperationField.PEER_ADDRESSES].length > NUM.ZERO : stryMutAct_9fa48("133479") ? false : stryMutAct_9fa48("133478") ? true : (stryCov_9fa48("133478", "133479", "133480"), Array.isArray(operation[ReplicaOperationField.PEER_ADDRESSES]) && (stryMutAct_9fa48("133483") ? operation[ReplicaOperationField.PEER_ADDRESSES].length <= NUM.ZERO : stryMutAct_9fa48("133482") ? operation[ReplicaOperationField.PEER_ADDRESSES].length >= NUM.ZERO : stryMutAct_9fa48("133481") ? true : (stryCov_9fa48("133481", "133482", "133483"), operation[ReplicaOperationField.PEER_ADDRESSES].length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("133484")) {
          {}
        } else {
          stryCov_9fa48("133484");
          request[ReplicaOperationField.PEER_ADDRESSES] = operation[ReplicaOperationField.PEER_ADDRESSES];
        }
      }
      if (stryMutAct_9fa48("133487") ? operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] || typeof operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("133486") ? false : stryMutAct_9fa48("133485") ? true : (stryCov_9fa48("133485", "133486", "133487"), operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] && (stryMutAct_9fa48("133489") ? typeof operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("133488") ? true : (stryCov_9fa48("133488", "133489"), typeof operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("133490")) {
          {}
        } else {
          stryCov_9fa48("133490");
          request[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA] = operation[ReplicaOperationField.BOOTSTRAP_TABLE_METADATA];
        }
      }
      if (stryMutAct_9fa48("133493") ? operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] || typeof operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("133492") ? false : stryMutAct_9fa48("133491") ? true : (stryCov_9fa48("133491", "133492", "133493"), operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] && (stryMutAct_9fa48("133495") ? typeof operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("133494") ? true : (stryCov_9fa48("133494", "133495"), typeof operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("133496")) {
          {}
        } else {
          stryCov_9fa48("133496");
          request[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA] = operation[ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA];
        }
      }
      this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.SEND_OPERATION, stryMutAct_9fa48("133497") ? {} : (stryCov_9fa48("133497"), {
        operationId: operation.operationId,
        target,
        type: messageType,
        entityType,
        entityId,
        replaceRemovePhase: replaceRemoveDispatchPhase
      }));
      const response = await this.messageRouter.deliver(target, request, stryMutAct_9fa48("133498") ? {} : (stryCov_9fa48("133498"), {
        targetNodeId: dispatchNodeId,
        // Replica operation dispatch is the control-plane progress signal that
        // advances split/rebalance workflows. It must preempt bulk metadata
        // replication from transaction bookkeeping.
        deliveryPriority: stryMutAct_9fa48("133499") ? "" : (stryCov_9fa48("133499"), 'critical')
      })).catch(async error => {
        if (stryMutAct_9fa48("133500")) {
          {}
        } else {
          stryCov_9fa48("133500");
          const errorMsg = this.normalizeErrorMessage(error, REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED);
          if (stryMutAct_9fa48("133502") ? false : stryMutAct_9fa48("133501") ? true : (stryCov_9fa48("133501", "133502"), this.deferDispatchRetry(operation, error))) {
            if (stryMutAct_9fa48("133503")) {
              {}
            } else {
              stryCov_9fa48("133503");
              return stryMutAct_9fa48("133504") ? {} : (stryCov_9fa48("133504"), {
                success: stryMutAct_9fa48("133505") ? true : (stryCov_9fa48("133505"), false),
                skipped: stryMutAct_9fa48("133506") ? false : (stryCov_9fa48("133506"), true),
                reason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
                operationId: operation.operationId,
                error: errorMsg
              });
            }
          }
          await this.failOperation(operation, errorMsg);
          return stryMutAct_9fa48("133507") ? {} : (stryCov_9fa48("133507"), {
            success: stryMutAct_9fa48("133508") ? true : (stryCov_9fa48("133508"), false),
            operationId: operation.operationId,
            error: errorMsg
          });
        }
      });
      if (stryMutAct_9fa48("133511") ? response?.success === false || response?.reason === REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING : stryMutAct_9fa48("133510") ? false : stryMutAct_9fa48("133509") ? true : (stryCov_9fa48("133509", "133510", "133511"), (stryMutAct_9fa48("133513") ? response?.success !== false : stryMutAct_9fa48("133512") ? true : (stryCov_9fa48("133512", "133513"), (stryMutAct_9fa48("133514") ? response.success : (stryCov_9fa48("133514"), response?.success)) === (stryMutAct_9fa48("133515") ? true : (stryCov_9fa48("133515"), false)))) && (stryMutAct_9fa48("133517") ? response?.reason !== REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING : stryMutAct_9fa48("133516") ? true : (stryCov_9fa48("133516", "133517"), (stryMutAct_9fa48("133518") ? response.reason : (stryCov_9fa48("133518"), response?.reason)) === REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING)))) {
        if (stryMutAct_9fa48("133519")) {
          {}
        } else {
          stryCov_9fa48("133519");
          return response;
        }
      }
      if (stryMutAct_9fa48("133522") ? false : stryMutAct_9fa48("133521") ? true : stryMutAct_9fa48("133520") ? response.acknowledged : (stryCov_9fa48("133520", "133521", "133522"), !response.acknowledged)) {
        if (stryMutAct_9fa48("133523")) {
          {}
        } else {
          stryCov_9fa48("133523");
          const errorLike = stryMutAct_9fa48("133526") ? response.error && response : stryMutAct_9fa48("133525") ? false : stryMutAct_9fa48("133524") ? true : (stryCov_9fa48("133524", "133525", "133526"), response.error || response);
          const errorMsg = this.normalizeErrorMessage(errorLike, REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED);
          if (stryMutAct_9fa48("133528") ? false : stryMutAct_9fa48("133527") ? true : (stryCov_9fa48("133527", "133528"), this.deferDispatchRetry(operation, errorLike))) {
            if (stryMutAct_9fa48("133529")) {
              {}
            } else {
              stryCov_9fa48("133529");
              return stryMutAct_9fa48("133530") ? {} : (stryCov_9fa48("133530"), {
                success: stryMutAct_9fa48("133531") ? true : (stryCov_9fa48("133531"), false),
                skipped: stryMutAct_9fa48("133532") ? false : (stryCov_9fa48("133532"), true),
                reason: REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
                operationId: operation.operationId,
                error: errorMsg
              });
            }
          }
          await this.failOperation(operation, errorMsg);
          return stryMutAct_9fa48("133533") ? {} : (stryCov_9fa48("133533"), {
            success: stryMutAct_9fa48("133534") ? true : (stryCov_9fa48("133534"), false),
            operationId: operation.operationId,
            error: errorMsg
          });
        }
      }
      return this._handleDispatchResponse(operation, response, replaceRemoveDispatchPhase);
    }
  }

  /**
   * Process executor dispatch response and advance workflow.
   * @param {Object} operation
   * @param {Object} response
   * @param {boolean} replaceRemovePhase
   * @return {Promise<Object>}
   * @private
   */
  async _handleDispatchResponse(operation, response, replaceRemovePhase) {
    if (stryMutAct_9fa48("133535")) {
      {}
    } else {
      stryCov_9fa48("133535");
      this.clearDispatchRetry(stryMutAct_9fa48("133536") ? operation.operationId : (stryCov_9fa48("133536"), operation?.operationId));
      if (stryMutAct_9fa48("133539") ? response.status === ReplicaOperationResponseStatus.INITIATED && response.status === ReplicaOperationResponseStatus.IN_PROGRESS : stryMutAct_9fa48("133538") ? false : stryMutAct_9fa48("133537") ? true : (stryCov_9fa48("133537", "133538", "133539"), (stryMutAct_9fa48("133541") ? response.status !== ReplicaOperationResponseStatus.INITIATED : stryMutAct_9fa48("133540") ? false : (stryCov_9fa48("133540", "133541"), response.status === ReplicaOperationResponseStatus.INITIATED)) || (stryMutAct_9fa48("133543") ? response.status !== ReplicaOperationResponseStatus.IN_PROGRESS : stryMutAct_9fa48("133542") ? false : (stryCov_9fa48("133542", "133543"), response.status === ReplicaOperationResponseStatus.IN_PROGRESS)))) {
        if (stryMutAct_9fa48("133544")) {
          {}
        } else {
          stryCov_9fa48("133544");
          let nextStep = WORKFLOW_STEP.CREATING;
          if (stryMutAct_9fa48("133547") ? operation.type === OperationType.REMOVE && operation.type === OperationType.REPLACE && replaceRemovePhase : stryMutAct_9fa48("133546") ? false : stryMutAct_9fa48("133545") ? true : (stryCov_9fa48("133545", "133546", "133547"), (stryMutAct_9fa48("133549") ? operation.type !== OperationType.REMOVE : stryMutAct_9fa48("133548") ? false : (stryCov_9fa48("133548", "133549"), operation.type === OperationType.REMOVE)) || (stryMutAct_9fa48("133551") ? operation.type === OperationType.REPLACE || replaceRemovePhase : stryMutAct_9fa48("133550") ? false : (stryCov_9fa48("133550", "133551"), (stryMutAct_9fa48("133553") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("133552") ? true : (stryCov_9fa48("133552", "133553"), operation.type === OperationType.REPLACE)) && replaceRemovePhase)))) {
            if (stryMutAct_9fa48("133554")) {
              {}
            } else {
              stryCov_9fa48("133554");
              nextStep = WORKFLOW_STEP.STOPPING;
            }
          }
          await this.updateStep(operation, nextStep);
          return this.buildSuccessfulOperationResult(operation.operationId, stryMutAct_9fa48("133555") ? {} : (stryCov_9fa48("133555"), {
            status: OPERATION_WORKFLOW_OWNER_LITERAL.IN_PROGRESS
          }));
        }
      }
      if (stryMutAct_9fa48("133558") ? response.status !== ReplicaOperationResponseStatus.ALREADY_EXISTS : stryMutAct_9fa48("133557") ? false : stryMutAct_9fa48("133556") ? true : (stryCov_9fa48("133556", "133557", "133558"), response.status === ReplicaOperationResponseStatus.ALREADY_EXISTS)) {
        if (stryMutAct_9fa48("133559")) {
          {}
        } else {
          stryCov_9fa48("133559");
          if (stryMutAct_9fa48("133562") ? operation.type === OperationType.REPLACE || !replaceRemovePhase : stryMutAct_9fa48("133561") ? false : stryMutAct_9fa48("133560") ? true : (stryCov_9fa48("133560", "133561", "133562"), (stryMutAct_9fa48("133564") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("133563") ? true : (stryCov_9fa48("133563", "133564"), operation.type === OperationType.REPLACE)) && (stryMutAct_9fa48("133565") ? replaceRemovePhase : (stryCov_9fa48("133565"), !replaceRemovePhase)))) {
            if (stryMutAct_9fa48("133566")) {
              {}
            } else {
              stryCov_9fa48("133566");
              await this.updateStep(operation, WORKFLOW_STEP.ACTIVE);
              return this.buildSuccessfulOperationResult(operation.operationId, stryMutAct_9fa48("133567") ? {} : (stryCov_9fa48("133567"), {
                status: ReplicaOperationResponseStatus.ALREADY_EXISTS
              }));
            }
          }
          await this.completeOperation(operation);
          return this.buildSuccessfulOperationResult(operation.operationId, stryMutAct_9fa48("133568") ? {} : (stryCov_9fa48("133568"), {
            status: ReplicaOperationResponseStatus.ALREADY_EXISTS
          }));
        }
      }
      if (stryMutAct_9fa48("133571") ? response.status !== ReplicaOperationResponseStatus.COMPLETED : stryMutAct_9fa48("133570") ? false : stryMutAct_9fa48("133569") ? true : (stryCov_9fa48("133569", "133570", "133571"), response.status === ReplicaOperationResponseStatus.COMPLETED)) {
        if (stryMutAct_9fa48("133572")) {
          {}
        } else {
          stryCov_9fa48("133572");
          if (stryMutAct_9fa48("133575") ? operation.type === OperationType.REPLACE || !replaceRemovePhase : stryMutAct_9fa48("133574") ? false : stryMutAct_9fa48("133573") ? true : (stryCov_9fa48("133573", "133574", "133575"), (stryMutAct_9fa48("133577") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("133576") ? true : (stryCov_9fa48("133576", "133577"), operation.type === OperationType.REPLACE)) && (stryMutAct_9fa48("133578") ? replaceRemovePhase : (stryCov_9fa48("133578"), !replaceRemovePhase)))) {
            if (stryMutAct_9fa48("133579")) {
              {}
            } else {
              stryCov_9fa48("133579");
              await this.updateStep(operation, WORKFLOW_STEP.ACTIVE);
              return this.buildSuccessfulOperationResult(operation.operationId, stryMutAct_9fa48("133580") ? {} : (stryCov_9fa48("133580"), {
                status: ReplicaOperationResponseStatus.COMPLETED
              }));
            }
          }
          await this.completeOperation(operation);
          return this.buildSuccessfulOperationResult(operation.operationId, stryMutAct_9fa48("133581") ? {} : (stryCov_9fa48("133581"), {
            status: ReplicaOperationResponseStatus.COMPLETED
          }));
        }
      }
      if (stryMutAct_9fa48("133584") ? response.status === ReplicaOperationResponseStatus.NOT_FOUND && operation.type === OperationType.REPLACE || replaceRemovePhase : stryMutAct_9fa48("133583") ? false : stryMutAct_9fa48("133582") ? true : (stryCov_9fa48("133582", "133583", "133584"), (stryMutAct_9fa48("133586") ? response.status === ReplicaOperationResponseStatus.NOT_FOUND || operation.type === OperationType.REPLACE : stryMutAct_9fa48("133585") ? true : (stryCov_9fa48("133585", "133586"), (stryMutAct_9fa48("133588") ? response.status !== ReplicaOperationResponseStatus.NOT_FOUND : stryMutAct_9fa48("133587") ? true : (stryCov_9fa48("133587", "133588"), response.status === ReplicaOperationResponseStatus.NOT_FOUND)) && (stryMutAct_9fa48("133590") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("133589") ? true : (stryCov_9fa48("133589", "133590"), operation.type === OperationType.REPLACE)))) && replaceRemovePhase)) {
        if (stryMutAct_9fa48("133591")) {
          {}
        } else {
          stryCov_9fa48("133591");
          await this.completeOperation(operation);
          return this.buildSuccessfulOperationResult(operation.operationId, stryMutAct_9fa48("133592") ? {} : (stryCov_9fa48("133592"), {
            status: ReplicaOperationResponseStatus.NOT_FOUND
          }));
        }
      }
      const errorLike = stryMutAct_9fa48("133595") ? response?.error && response : stryMutAct_9fa48("133594") ? false : stryMutAct_9fa48("133593") ? true : (stryCov_9fa48("133593", "133594", "133595"), (stryMutAct_9fa48("133596") ? response.error : (stryCov_9fa48("133596"), response?.error)) || response);
      const errorMsg = this.normalizeErrorMessage(errorLike, stryMutAct_9fa48("133597") ? "" : (stryCov_9fa48("133597"), 'Unknown error'));
      if (stryMutAct_9fa48("133599") ? false : stryMutAct_9fa48("133598") ? true : (stryCov_9fa48("133598", "133599"), this.deferDispatchRetry(operation, errorLike))) {
        if (stryMutAct_9fa48("133600")) {
          {}
        } else {
          stryCov_9fa48("133600");
          return this.buildSkippedOperationResult(REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING, operation.operationId, stryMutAct_9fa48("133601") ? {} : (stryCov_9fa48("133601"), {
            error: errorMsg
          }));
        }
      }
      await this.failOperation(operation, errorMsg);
      return this.buildFailedOperationResult(operation.operationId, errorMsg);
    }
  }

  // --- Safety checks ---

  /**
   * @param {string} partitionId
   * @return {boolean}
   */
  isCriticalSystemPartition(partitionId) {
    if (stryMutAct_9fa48("133602")) {
      {}
    } else {
      stryCov_9fa48("133602");
      return isSystemTablePartition(stryMutAct_9fa48("133603") ? {} : (stryCov_9fa48("133603"), {
        partitionId
      }));
    }
  }

  /**
   * Resolve the readiness decision dimension for one operation context.
   * Critical system partitions should continue owner progression while
   * publication convergence is pending; ordinary entities remain strict.
   *
   * @param {Object|string|null} operationOrPartitionId
   * @return {string}
   */
  resolveOperationReadinessDecisionDimension(operationOrPartitionId = null) {
    if (stryMutAct_9fa48("133604")) {
      {}
    } else {
      stryCov_9fa48("133604");
      const partitionId = (stryMutAct_9fa48("133607") ? typeof operationOrPartitionId !== 'string' : stryMutAct_9fa48("133606") ? false : stryMutAct_9fa48("133605") ? true : (stryCov_9fa48("133605", "133606", "133607"), typeof operationOrPartitionId === (stryMutAct_9fa48("133608") ? "" : (stryCov_9fa48("133608"), 'string')))) ? operationOrPartitionId : stryMutAct_9fa48("133611") ? operationOrPartitionId?.partitionId && null : stryMutAct_9fa48("133610") ? false : stryMutAct_9fa48("133609") ? true : (stryCov_9fa48("133609", "133610", "133611"), (stryMutAct_9fa48("133612") ? operationOrPartitionId.partitionId : (stryCov_9fa48("133612"), operationOrPartitionId?.partitionId)) || null);
      if (stryMutAct_9fa48("133614") ? false : stryMutAct_9fa48("133613") ? true : (stryCov_9fa48("133613", "133614"), this.isCriticalSystemPartition(partitionId))) {
        if (stryMutAct_9fa48("133615")) {
          {}
        } else {
          stryCov_9fa48("133615");
          return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
        }
      }
      return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
    }
  }

  /**
   * Check decision dimension readiness with compatibility fallback.
   * Fallback applies only when older snapshots omit
   * controlPlaneRecoveryEligible explicitly.
   *
   * @param {Object|null} readiness
   * @param {string} decisionDimension
   * @return {boolean}
   */
  isReadinessDimensionSatisfied(readiness, decisionDimension) {
    if (stryMutAct_9fa48("133616")) {
      {}
    } else {
      stryCov_9fa48("133616");
      const dimensions = (stryMutAct_9fa48("133619") ? readiness?.dimensions || typeof readiness.dimensions === 'object' : stryMutAct_9fa48("133618") ? false : stryMutAct_9fa48("133617") ? true : (stryCov_9fa48("133617", "133618", "133619"), (stryMutAct_9fa48("133620") ? readiness.dimensions : (stryCov_9fa48("133620"), readiness?.dimensions)) && (stryMutAct_9fa48("133622") ? typeof readiness.dimensions !== 'object' : stryMutAct_9fa48("133621") ? true : (stryCov_9fa48("133621", "133622"), typeof readiness.dimensions === (stryMutAct_9fa48("133623") ? "" : (stryCov_9fa48("133623"), 'object')))))) ? readiness.dimensions : null;
      if (stryMutAct_9fa48("133626") ? false : stryMutAct_9fa48("133625") ? true : stryMutAct_9fa48("133624") ? dimensions : (stryCov_9fa48("133624", "133625", "133626"), !dimensions)) {
        if (stryMutAct_9fa48("133627")) {
          {}
        } else {
          stryCov_9fa48("133627");
          return stryMutAct_9fa48("133628") ? true : (stryCov_9fa48("133628"), false);
        }
      }
      if (stryMutAct_9fa48("133631") ? dimensions[decisionDimension] !== true : stryMutAct_9fa48("133630") ? false : stryMutAct_9fa48("133629") ? true : (stryCov_9fa48("133629", "133630", "133631"), dimensions[decisionDimension] === (stryMutAct_9fa48("133632") ? false : (stryCov_9fa48("133632"), true)))) {
        if (stryMutAct_9fa48("133633")) {
          {}
        } else {
          stryCov_9fa48("133633");
          return stryMutAct_9fa48("133634") ? false : (stryCov_9fa48("133634"), true);
        }
      }
      if (stryMutAct_9fa48("133637") ? decisionDimension === CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE : stryMutAct_9fa48("133636") ? false : stryMutAct_9fa48("133635") ? true : (stryCov_9fa48("133635", "133636", "133637"), decisionDimension !== CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE)) {
        if (stryMutAct_9fa48("133638")) {
          {}
        } else {
          stryCov_9fa48("133638");
          return stryMutAct_9fa48("133639") ? true : (stryCov_9fa48("133639"), false);
        }
      }
      if (stryMutAct_9fa48("133641") ? false : stryMutAct_9fa48("133640") ? true : (stryCov_9fa48("133640", "133641"), Object.hasOwn(dimensions, decisionDimension))) {
        if (stryMutAct_9fa48("133642")) {
          {}
        } else {
          stryCov_9fa48("133642");
          return stryMutAct_9fa48("133643") ? true : (stryCov_9fa48("133643"), false);
        }
      }
      return stryMutAct_9fa48("133646") ? dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] !== true : stryMutAct_9fa48("133645") ? false : stryMutAct_9fa48("133644") ? true : (stryCov_9fa48("133644", "133645", "133646"), dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === (stryMutAct_9fa48("133647") ? false : (stryCov_9fa48("133647"), true)));
    }
  }

  /**
   * @param {Object} replicaRow
   * @return {boolean}
   */
  isVoterReadyRoutableReplica(replicaRow) {
    if (stryMutAct_9fa48("133648")) {
      {}
    } else {
      stryCov_9fa48("133648");
      if (stryMutAct_9fa48("133651") ? false : stryMutAct_9fa48("133650") ? true : stryMutAct_9fa48("133649") ? replicaRow : (stryCov_9fa48("133649", "133650", "133651"), !replicaRow)) {
        if (stryMutAct_9fa48("133652")) {
          {}
        } else {
          stryCov_9fa48("133652");
          return stryMutAct_9fa48("133653") ? true : (stryCov_9fa48("133653"), false);
        }
      }
      if (stryMutAct_9fa48("133656") ? replicaRow.status === ReplicaStatus.ACTIVE : stryMutAct_9fa48("133655") ? false : stryMutAct_9fa48("133654") ? true : (stryCov_9fa48("133654", "133655", "133656"), replicaRow.status !== ReplicaStatus.ACTIVE)) {
        if (stryMutAct_9fa48("133657")) {
          {}
        } else {
          stryCov_9fa48("133657");
          return stryMutAct_9fa48("133658") ? true : (stryCov_9fa48("133658"), false);
        }
      }
      if (stryMutAct_9fa48("133661") ? false : stryMutAct_9fa48("133660") ? true : stryMutAct_9fa48("133659") ? replicaRow.address : (stryCov_9fa48("133659", "133660", "133661"), !replicaRow.address)) {
        if (stryMutAct_9fa48("133662")) {
          {}
        } else {
          stryCov_9fa48("133662");
          return stryMutAct_9fa48("133663") ? true : (stryCov_9fa48("133663"), false);
        }
      }
      const raftRole = (stryMutAct_9fa48("133666") ? typeof replicaRow.raft_role !== 'string' : stryMutAct_9fa48("133665") ? false : stryMutAct_9fa48("133664") ? true : (stryCov_9fa48("133664", "133665", "133666"), typeof replicaRow.raft_role === (stryMutAct_9fa48("133667") ? "" : (stryCov_9fa48("133667"), 'string')))) ? stryMutAct_9fa48("133668") ? replicaRow.raft_role.toUpperCase() : (stryCov_9fa48("133668"), replicaRow.raft_role.toLowerCase()) : null;
      if (stryMutAct_9fa48("133671") ? !raftRole && raftRole === RAFT_ROLE.LEARNER : stryMutAct_9fa48("133670") ? false : stryMutAct_9fa48("133669") ? true : (stryCov_9fa48("133669", "133670", "133671"), (stryMutAct_9fa48("133672") ? raftRole : (stryCov_9fa48("133672"), !raftRole)) || (stryMutAct_9fa48("133674") ? raftRole !== RAFT_ROLE.LEARNER : stryMutAct_9fa48("133673") ? false : (stryCov_9fa48("133673", "133674"), raftRole === RAFT_ROLE.LEARNER)))) {
        if (stryMutAct_9fa48("133675")) {
          {}
        } else {
          stryCov_9fa48("133675");
          return stryMutAct_9fa48("133676") ? true : (stryCov_9fa48("133676"), false);
        }
      }
      return this.isNodeReadyForRouting(replicaRow.node_id, stryMutAct_9fa48("133677") ? {} : (stryCov_9fa48("133677"), {
        partitionId: stryMutAct_9fa48("133680") ? (replicaRow.partition_id || replicaRow.partitionId) && null : stryMutAct_9fa48("133679") ? false : stryMutAct_9fa48("133678") ? true : (stryCov_9fa48("133678", "133679", "133680"), (stryMutAct_9fa48("133682") ? replicaRow.partition_id && replicaRow.partitionId : stryMutAct_9fa48("133681") ? false : (stryCov_9fa48("133681", "133682"), replicaRow.partition_id || replicaRow.partitionId)) || null)
      }));
    }
  }

  /**
   * @param {Object} replicaRow
   * @param {Object} operation
   * @return {boolean}
   */
  isOperationReplicaRow(replicaRow, operation) {
    if (stryMutAct_9fa48("133683")) {
      {}
    } else {
      stryCov_9fa48("133683");
      if (stryMutAct_9fa48("133686") ? !replicaRow && !operation : stryMutAct_9fa48("133685") ? false : stryMutAct_9fa48("133684") ? true : (stryCov_9fa48("133684", "133685", "133686"), (stryMutAct_9fa48("133687") ? replicaRow : (stryCov_9fa48("133687"), !replicaRow)) || (stryMutAct_9fa48("133688") ? operation : (stryCov_9fa48("133688"), !operation)))) {
        if (stryMutAct_9fa48("133689")) {
          {}
        } else {
          stryCov_9fa48("133689");
          return stryMutAct_9fa48("133690") ? true : (stryCov_9fa48("133690"), false);
        }
      }
      if (stryMutAct_9fa48("133693") ? false : stryMutAct_9fa48("133692") ? true : stryMutAct_9fa48("133691") ? operation.replicaId : (stryCov_9fa48("133691", "133692", "133693"), !operation.replicaId)) {
        if (stryMutAct_9fa48("133694")) {
          {}
        } else {
          stryCov_9fa48("133694");
          return stryMutAct_9fa48("133695") ? true : (stryCov_9fa48("133695"), false);
        }
      }
      return stryMutAct_9fa48("133698") ? replicaRow.service_id === operation.replicaId && replicaRow.replica_id === operation.replicaId : stryMutAct_9fa48("133697") ? false : stryMutAct_9fa48("133696") ? true : (stryCov_9fa48("133696", "133697", "133698"), (stryMutAct_9fa48("133700") ? replicaRow.service_id !== operation.replicaId : stryMutAct_9fa48("133699") ? false : (stryCov_9fa48("133699", "133700"), replicaRow.service_id === operation.replicaId)) || (stryMutAct_9fa48("133702") ? replicaRow.replica_id !== operation.replicaId : stryMutAct_9fa48("133701") ? false : (stryCov_9fa48("133701", "133702"), replicaRow.replica_id === operation.replicaId)));
    }
  }

  /**
   * @param {Object} replicaRow
   * @return {string|null}
   * @private
   */
  getReplicaRowIdentity(replicaRow) {
    if (stryMutAct_9fa48("133703")) {
      {}
    } else {
      stryCov_9fa48("133703");
      const serviceId = (stryMutAct_9fa48("133706") ? typeof replicaRow?.service_id !== TYPEOF.STRING : stryMutAct_9fa48("133705") ? false : stryMutAct_9fa48("133704") ? true : (stryCov_9fa48("133704", "133705", "133706"), typeof (stryMutAct_9fa48("133707") ? replicaRow.service_id : (stryCov_9fa48("133707"), replicaRow?.service_id)) === TYPEOF.STRING)) ? stryMutAct_9fa48("133708") ? replicaRow.service_id : (stryCov_9fa48("133708"), replicaRow.service_id.trim()) : (stryMutAct_9fa48("133711") ? typeof replicaRow?.serviceId !== TYPEOF.STRING : stryMutAct_9fa48("133710") ? false : stryMutAct_9fa48("133709") ? true : (stryCov_9fa48("133709", "133710", "133711"), typeof (stryMutAct_9fa48("133712") ? replicaRow.serviceId : (stryCov_9fa48("133712"), replicaRow?.serviceId)) === TYPEOF.STRING)) ? stryMutAct_9fa48("133713") ? replicaRow.serviceId : (stryCov_9fa48("133713"), replicaRow.serviceId.trim()) : stryMutAct_9fa48("133714") ? "Stryker was here!" : (stryCov_9fa48("133714"), '');
      if (stryMutAct_9fa48("133718") ? serviceId.length <= NUM.ZERO : stryMutAct_9fa48("133717") ? serviceId.length >= NUM.ZERO : stryMutAct_9fa48("133716") ? false : stryMutAct_9fa48("133715") ? true : (stryCov_9fa48("133715", "133716", "133717", "133718"), serviceId.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("133719")) {
          {}
        } else {
          stryCov_9fa48("133719");
          return serviceId;
        }
      }
      const replicaId = (stryMutAct_9fa48("133722") ? typeof replicaRow?.replica_id !== TYPEOF.STRING : stryMutAct_9fa48("133721") ? false : stryMutAct_9fa48("133720") ? true : (stryCov_9fa48("133720", "133721", "133722"), typeof (stryMutAct_9fa48("133723") ? replicaRow.replica_id : (stryCov_9fa48("133723"), replicaRow?.replica_id)) === TYPEOF.STRING)) ? stryMutAct_9fa48("133724") ? replicaRow.replica_id : (stryCov_9fa48("133724"), replicaRow.replica_id.trim()) : (stryMutAct_9fa48("133727") ? typeof replicaRow?.replicaId !== TYPEOF.STRING : stryMutAct_9fa48("133726") ? false : stryMutAct_9fa48("133725") ? true : (stryCov_9fa48("133725", "133726", "133727"), typeof (stryMutAct_9fa48("133728") ? replicaRow.replicaId : (stryCov_9fa48("133728"), replicaRow?.replicaId)) === TYPEOF.STRING)) ? stryMutAct_9fa48("133729") ? replicaRow.replicaId : (stryCov_9fa48("133729"), replicaRow.replicaId.trim()) : stryMutAct_9fa48("133730") ? "Stryker was here!" : (stryCov_9fa48("133730"), '');
      return (stryMutAct_9fa48("133734") ? replicaId.length <= NUM.ZERO : stryMutAct_9fa48("133733") ? replicaId.length >= NUM.ZERO : stryMutAct_9fa48("133732") ? false : stryMutAct_9fa48("133731") ? true : (stryCov_9fa48("133731", "133732", "133733", "133734"), replicaId.length > NUM.ZERO)) ? replicaId : null;
    }
  }

  /**
   * @param {string} partitionId
   * @return {Object[]}
   * @private
   */
  getCachedCriticalReplicaRows(partitionId) {
    if (stryMutAct_9fa48("133735")) {
      {}
    } else {
      stryCov_9fa48("133735");
      const systemTableCache = this.repository.systemTableCache;
      if (stryMutAct_9fa48("133738") ? !systemTableCache && typeof systemTableCache.filter !== TYPEOF.FUNCTION : stryMutAct_9fa48("133737") ? false : stryMutAct_9fa48("133736") ? true : (stryCov_9fa48("133736", "133737", "133738"), (stryMutAct_9fa48("133739") ? systemTableCache : (stryCov_9fa48("133739"), !systemTableCache)) || (stryMutAct_9fa48("133741") ? typeof systemTableCache.filter === TYPEOF.FUNCTION : stryMutAct_9fa48("133740") ? false : (stryCov_9fa48("133740", "133741"), typeof systemTableCache.filter !== TYPEOF.FUNCTION)))) {
        if (stryMutAct_9fa48("133742")) {
          {}
        } else {
          stryCov_9fa48("133742");
          return stryMutAct_9fa48("133743") ? ["Stryker was here"] : (stryCov_9fa48("133743"), []);
        }
      }
      return stryMutAct_9fa48("133746") ? systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, row => row.partition_id === partitionId && row.service_type === SERVICE_TYPE.PARTITION) && [] : stryMutAct_9fa48("133745") ? false : stryMutAct_9fa48("133744") ? true : (stryCov_9fa48("133744", "133745", "133746"), (stryMutAct_9fa48("133747") ? systemTableCache : (stryCov_9fa48("133747"), systemTableCache.filter(SYSTEM_TABLE_NAME.SERVICES, stryMutAct_9fa48("133748") ? () => undefined : (stryCov_9fa48("133748"), row => stryMutAct_9fa48("133751") ? row.partition_id === partitionId || row.service_type === SERVICE_TYPE.PARTITION : stryMutAct_9fa48("133750") ? false : stryMutAct_9fa48("133749") ? true : (stryCov_9fa48("133749", "133750", "133751"), (stryMutAct_9fa48("133753") ? row.partition_id !== partitionId : stryMutAct_9fa48("133752") ? true : (stryCov_9fa48("133752", "133753"), row.partition_id === partitionId)) && (stryMutAct_9fa48("133755") ? row.service_type !== SERVICE_TYPE.PARTITION : stryMutAct_9fa48("133754") ? true : (stryCov_9fa48("133754", "133755"), row.service_type === SERVICE_TYPE.PARTITION))))))) || (stryMutAct_9fa48("133756") ? ["Stryker was here"] : (stryCov_9fa48("133756"), [])));
    }
  }

  /**
   * @param {Object[]} authoritativeRows
   * @param {Object[]} cachedRows
   * @return {Object[]}
   * @private
   */
  mergeReplicaRowsForSafety(authoritativeRows, cachedRows) {
    if (stryMutAct_9fa48("133757")) {
      {}
    } else {
      stryCov_9fa48("133757");
      const mergedRowsById = new Map();
      const appendRow = (row, preferIncoming = stryMutAct_9fa48("133758") ? true : (stryCov_9fa48("133758"), false)) => {
        if (stryMutAct_9fa48("133759")) {
          {}
        } else {
          stryCov_9fa48("133759");
          if (stryMutAct_9fa48("133762") ? !row && typeof row !== TYPEOF.OBJECT : stryMutAct_9fa48("133761") ? false : stryMutAct_9fa48("133760") ? true : (stryCov_9fa48("133760", "133761", "133762"), (stryMutAct_9fa48("133763") ? row : (stryCov_9fa48("133763"), !row)) || (stryMutAct_9fa48("133765") ? typeof row === TYPEOF.OBJECT : stryMutAct_9fa48("133764") ? false : (stryCov_9fa48("133764", "133765"), typeof row !== TYPEOF.OBJECT)))) {
            if (stryMutAct_9fa48("133766")) {
              {}
            } else {
              stryCov_9fa48("133766");
              return;
            }
          }
          const rowId = this.getReplicaRowIdentity(row);
          if (stryMutAct_9fa48("133769") ? false : stryMutAct_9fa48("133768") ? true : stryMutAct_9fa48("133767") ? rowId : (stryCov_9fa48("133767", "133768", "133769"), !rowId)) {
            if (stryMutAct_9fa48("133770")) {
              {}
            } else {
              stryCov_9fa48("133770");
              mergedRowsById.set(Symbol('service_row'), stryMutAct_9fa48("133771") ? {} : (stryCov_9fa48("133771"), {
                ...row
              }));
              return;
            }
          }
          if (stryMutAct_9fa48("133774") ? !preferIncoming && !mergedRowsById.has(rowId) : stryMutAct_9fa48("133773") ? false : stryMutAct_9fa48("133772") ? true : (stryCov_9fa48("133772", "133773", "133774"), (stryMutAct_9fa48("133775") ? preferIncoming : (stryCov_9fa48("133775"), !preferIncoming)) || (stryMutAct_9fa48("133776") ? mergedRowsById.has(rowId) : (stryCov_9fa48("133776"), !mergedRowsById.has(rowId))))) {
            if (stryMutAct_9fa48("133777")) {
              {}
            } else {
              stryCov_9fa48("133777");
              mergedRowsById.set(rowId, stryMutAct_9fa48("133778") ? {} : (stryCov_9fa48("133778"), {
                ...row
              }));
              return;
            }
          }
          mergedRowsById.set(rowId, stryMutAct_9fa48("133779") ? {} : (stryCov_9fa48("133779"), {
            ...mergedRowsById.get(rowId),
            ...row
          }));
        }
      };
      for (const cachedRow of cachedRows) {
        if (stryMutAct_9fa48("133780")) {
          {}
        } else {
          stryCov_9fa48("133780");
          appendRow(cachedRow, stryMutAct_9fa48("133781") ? true : (stryCov_9fa48("133781"), false));
        }
      }
      for (const authoritativeRow of authoritativeRows) {
        if (stryMutAct_9fa48("133782")) {
          {}
        } else {
          stryCov_9fa48("133782");
          appendRow(authoritativeRow, stryMutAct_9fa48("133783") ? false : (stryCov_9fa48("133783"), true));
        }
      }
      return stryMutAct_9fa48("133784") ? [] : (stryCov_9fa48("133784"), [...mergedRowsById.values()]);
    }
  }

  /**
   * Resolve the best currently-available services rows for one critical
   * partition safety decision. Cache remains the fallback when authoritative
   * visibility lags or the read path is transiently unavailable.
   *
   * @param {string} partitionId
   * @return {Promise<Object[]>}
   * @private
   */
  async getCriticalReplicaRowsForSafety(partitionId) {
    if (stryMutAct_9fa48("133785")) {
      {}
    } else {
      stryCov_9fa48("133785");
      const cachedRows = this.getCachedCriticalReplicaRows(partitionId);
      const gateway = stryMutAct_9fa48("133786") ? this.repository.controlPlaneSystemTableGateway : (stryCov_9fa48("133786"), this.repository?.controlPlaneSystemTableGateway);
      if (stryMutAct_9fa48("133789") ? false : stryMutAct_9fa48("133788") ? true : stryMutAct_9fa48("133787") ? gateway : (stryCov_9fa48("133787", "133788", "133789"), !gateway)) {
        if (stryMutAct_9fa48("133790")) {
          {}
        } else {
          stryCov_9fa48("133790");
          return cachedRows;
        }
      }
      try {
        if (stryMutAct_9fa48("133791")) {
          {}
        } else {
          stryCov_9fa48("133791");
          const result = await readAuthoritativeControlPlaneRows(gateway, SYSTEM_TABLE_NAME.SERVICES, REMOVE_SAFETY_SQL.SELECT_PARTITION_REPLICA_ROWS, stryMutAct_9fa48("133792") ? [] : (stryCov_9fa48("133792"), [SERVICE_TYPE.PARTITION, partitionId]), REMOVE_SAFETY_READ_QUERY_OPTIONS);
          if (stryMutAct_9fa48("133795") ? (!result?.success || !Array.isArray(result.rows)) && result.rows.length === NUM.ZERO : stryMutAct_9fa48("133794") ? false : stryMutAct_9fa48("133793") ? true : (stryCov_9fa48("133793", "133794", "133795"), (stryMutAct_9fa48("133797") ? !result?.success && !Array.isArray(result.rows) : stryMutAct_9fa48("133796") ? false : (stryCov_9fa48("133796", "133797"), (stryMutAct_9fa48("133798") ? result?.success : (stryCov_9fa48("133798"), !(stryMutAct_9fa48("133799") ? result.success : (stryCov_9fa48("133799"), result?.success)))) || (stryMutAct_9fa48("133800") ? Array.isArray(result.rows) : (stryCov_9fa48("133800"), !Array.isArray(result.rows))))) || (stryMutAct_9fa48("133802") ? result.rows.length !== NUM.ZERO : stryMutAct_9fa48("133801") ? false : (stryCov_9fa48("133801", "133802"), result.rows.length === NUM.ZERO)))) {
            if (stryMutAct_9fa48("133803")) {
              {}
            } else {
              stryCov_9fa48("133803");
              return cachedRows;
            }
          }
          return this.mergeReplicaRowsForSafety(result.rows, cachedRows);
        }
      } catch {
        if (stryMutAct_9fa48("133804")) {
          {}
        } else {
          stryCov_9fa48("133804");
          return cachedRows;
        }
      }
    }
  }

  /**
   * @param {string} partitionId
   * @return {Promise<number>}
   */
  async getCriticalMinReplicaCount(partitionId) {
    if (stryMutAct_9fa48("133805")) {
      {}
    } else {
      stryCov_9fa48("133805");
      if (stryMutAct_9fa48("133808") ? !this.tablePolicyService && typeof this.tablePolicyService.getPolicyForPartition !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION : stryMutAct_9fa48("133807") ? false : stryMutAct_9fa48("133806") ? true : (stryCov_9fa48("133806", "133807", "133808"), (stryMutAct_9fa48("133809") ? this.tablePolicyService : (stryCov_9fa48("133809"), !this.tablePolicyService)) || (stryMutAct_9fa48("133811") ? typeof this.tablePolicyService.getPolicyForPartition === OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION : stryMutAct_9fa48("133810") ? false : (stryCov_9fa48("133810", "133811"), typeof this.tablePolicyService.getPolicyForPartition !== OPERATION_WORKFLOW_OWNER_LITERAL.FUNCTION)))) {
        if (stryMutAct_9fa48("133812")) {
          {}
        } else {
          stryCov_9fa48("133812");
          return DEFAULT_MIN_REPLICA_COUNT;
        }
      }
      try {
        if (stryMutAct_9fa48("133813")) {
          {}
        } else {
          stryCov_9fa48("133813");
          const policy = await this.tablePolicyService.getPolicyForPartition(partitionId);
          const minReplicaCount = Number(stryMutAct_9fa48("133814") ? policy.minReplicaCount : (stryCov_9fa48("133814"), policy?.minReplicaCount));
          if (stryMutAct_9fa48("133817") ? Number.isFinite(minReplicaCount) || minReplicaCount > NUM.ZERO : stryMutAct_9fa48("133816") ? false : stryMutAct_9fa48("133815") ? true : (stryCov_9fa48("133815", "133816", "133817"), Number.isFinite(minReplicaCount) && (stryMutAct_9fa48("133820") ? minReplicaCount <= NUM.ZERO : stryMutAct_9fa48("133819") ? minReplicaCount >= NUM.ZERO : stryMutAct_9fa48("133818") ? true : (stryCov_9fa48("133818", "133819", "133820"), minReplicaCount > NUM.ZERO)))) {
            if (stryMutAct_9fa48("133821")) {
              {}
            } else {
              stryCov_9fa48("133821");
              return Math.floor(minReplicaCount);
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("133822")) {
          {}
        } else {
          stryCov_9fa48("133822");
          this.logger.warn(stryMutAct_9fa48("133823") ? OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_RESOLVE_MINREPLICACOUNT_FOR_CRITICAL - OPERATION_WORKFLOW_OWNER_LITERAL.PARTITION_SAFETY_CHECK : (stryCov_9fa48("133823"), OPERATION_WORKFLOW_OWNER_LITERAL.FAILED_TO_RESOLVE_MINREPLICACOUNT_FOR_CRITICAL + OPERATION_WORKFLOW_OWNER_LITERAL.PARTITION_SAFETY_CHECK), stryMutAct_9fa48("133824") ? {} : (stryCov_9fa48("133824"), {
            partitionId,
            error: error.message
          }));
        }
      }
      return DEFAULT_MIN_REPLICA_COUNT;
    }
  }

  /**
   * @param {string} nodeId
   * @return {boolean}
   */
  isNodeReadyForRouting(nodeId, options = {}) {
    if (stryMutAct_9fa48("133825")) {
      {}
    } else {
      stryCov_9fa48("133825");
      if (stryMutAct_9fa48("133828") ? false : stryMutAct_9fa48("133827") ? true : stryMutAct_9fa48("133826") ? nodeId : (stryCov_9fa48("133826", "133827", "133828"), !nodeId)) {
        if (stryMutAct_9fa48("133829")) {
          {}
        } else {
          stryCov_9fa48("133829");
          return stryMutAct_9fa48("133830") ? true : (stryCov_9fa48("133830"), false);
        }
      }
      const decisionDimension = this.resolveOperationReadinessDecisionDimension(stryMutAct_9fa48("133833") ? options?.partitionId && null : stryMutAct_9fa48("133832") ? false : stryMutAct_9fa48("133831") ? true : (stryCov_9fa48("133831", "133832", "133833"), (stryMutAct_9fa48("133834") ? options.partitionId : (stryCov_9fa48("133834"), options?.partitionId)) || null));
      const readiness = this.controlPlaneReadinessService.getNodeReadinessSync(nodeId, stryMutAct_9fa48("133835") ? {} : (stryCov_9fa48("133835"), {
        decisionDimension: decisionDimension
      }));
      return this.isReadinessDimensionSatisfied(readiness, decisionDimension);
    }
  }

  /**
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async getPriorityRecoveryPlanningSnapshot(operation) {
    if (stryMutAct_9fa48("133836")) {
      {}
    } else {
      stryCov_9fa48("133836");
      if (stryMutAct_9fa48("133839") ? !operation && !isPriorityControlPlanePartition({
        partitionId: operation.partitionId
      }) : stryMutAct_9fa48("133838") ? false : stryMutAct_9fa48("133837") ? true : (stryCov_9fa48("133837", "133838", "133839"), (stryMutAct_9fa48("133840") ? operation : (stryCov_9fa48("133840"), !operation)) || (stryMutAct_9fa48("133841") ? isPriorityControlPlanePartition({
        partitionId: operation.partitionId
      }) : (stryCov_9fa48("133841"), !isPriorityControlPlanePartition(stryMutAct_9fa48("133842") ? {} : (stryCov_9fa48("133842"), {
        partitionId: operation.partitionId
      })))))) {
        if (stryMutAct_9fa48("133843")) {
          {}
        } else {
          stryCov_9fa48("133843");
          return null;
        }
      }
      const readinessService = this.controlPlaneReadinessService;
      if (stryMutAct_9fa48("133846") ? !readinessService && typeof readinessService.getPriorityRecoveryPlanningAnswerBestEffort !== TYPEOF.FUNCTION && typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !== TYPEOF.FUNCTION && typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort !== TYPEOF.FUNCTION && typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("133845") ? false : stryMutAct_9fa48("133844") ? true : (stryCov_9fa48("133844", "133845", "133846"), (stryMutAct_9fa48("133847") ? readinessService : (stryCov_9fa48("133847"), !readinessService)) || (stryMutAct_9fa48("133849") ? typeof readinessService.getPriorityRecoveryPlanningAnswerBestEffort !== TYPEOF.FUNCTION && typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !== TYPEOF.FUNCTION && typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort !== TYPEOF.FUNCTION || typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("133848") ? false : (stryCov_9fa48("133848", "133849"), (stryMutAct_9fa48("133851") ? typeof readinessService.getPriorityRecoveryPlanningAnswerBestEffort !== TYPEOF.FUNCTION && typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !== TYPEOF.FUNCTION || typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("133850") ? true : (stryCov_9fa48("133850", "133851"), (stryMutAct_9fa48("133853") ? typeof readinessService.getPriorityRecoveryPlanningAnswerBestEffort !== TYPEOF.FUNCTION || typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("133852") ? true : (stryCov_9fa48("133852", "133853"), (stryMutAct_9fa48("133855") ? typeof readinessService.getPriorityRecoveryPlanningAnswerBestEffort === TYPEOF.FUNCTION : stryMutAct_9fa48("133854") ? true : (stryCov_9fa48("133854", "133855"), typeof readinessService.getPriorityRecoveryPlanningAnswerBestEffort !== TYPEOF.FUNCTION)) && (stryMutAct_9fa48("133857") ? typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort === TYPEOF.FUNCTION : stryMutAct_9fa48("133856") ? true : (stryCov_9fa48("133856", "133857"), typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !== TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("133859") ? typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort === TYPEOF.FUNCTION : stryMutAct_9fa48("133858") ? true : (stryCov_9fa48("133858", "133859"), typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort !== TYPEOF.FUNCTION)))) && (stryMutAct_9fa48("133861") ? typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort === TYPEOF.FUNCTION : stryMutAct_9fa48("133860") ? true : (stryCov_9fa48("133860", "133861"), typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !== TYPEOF.FUNCTION)))))) {
        if (stryMutAct_9fa48("133862")) {
          {}
        } else {
          stryCov_9fa48("133862");
          return null;
        }
      }
      const publicationNodeId = stryMutAct_9fa48("133863") ? String(operation.targetNodeId || operation.sourceNodeId || this.nodeId || '') : (stryCov_9fa48("133863"), String(stryMutAct_9fa48("133866") ? (operation.targetNodeId || operation.sourceNodeId || this.nodeId) && '' : stryMutAct_9fa48("133865") ? false : stryMutAct_9fa48("133864") ? true : (stryCov_9fa48("133864", "133865", "133866"), (stryMutAct_9fa48("133868") ? (operation.targetNodeId || operation.sourceNodeId) && this.nodeId : stryMutAct_9fa48("133867") ? false : (stryCov_9fa48("133867", "133868"), (stryMutAct_9fa48("133870") ? operation.targetNodeId && operation.sourceNodeId : stryMutAct_9fa48("133869") ? false : (stryCov_9fa48("133869", "133870"), operation.targetNodeId || operation.sourceNodeId)) || this.nodeId)) || (stryMutAct_9fa48("133871") ? "Stryker was here!" : (stryCov_9fa48("133871"), '')))).trim());
      const observedAt = Date.now();
      if (stryMutAct_9fa48("133874") ? typeof readinessService.getPriorityRecoveryPlanningAnswerBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("133873") ? false : stryMutAct_9fa48("133872") ? true : (stryCov_9fa48("133872", "133873", "133874"), typeof readinessService.getPriorityRecoveryPlanningAnswerBestEffort === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("133875")) {
          {}
        } else {
          stryCov_9fa48("133875");
          return readinessService.getPriorityRecoveryPlanningAnswerBestEffort(publicationNodeId, observedAt);
        }
      }
      if (stryMutAct_9fa48("133878") ? typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("133877") ? false : stryMutAct_9fa48("133876") ? true : (stryCov_9fa48("133876", "133877", "133878"), typeof readinessService.getPriorityRecoveryPlanningSnapshotBestEffort === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("133879")) {
          {}
        } else {
          stryCov_9fa48("133879");
          return readinessService.getPriorityRecoveryPlanningSnapshotBestEffort(publicationNodeId, observedAt);
        }
      }
      if (stryMutAct_9fa48("133882") ? typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("133881") ? false : stryMutAct_9fa48("133880") ? true : (stryCov_9fa48("133880", "133881", "133882"), typeof readinessService.getMembershipPublicationPlanningAnswerBestEffort === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("133883")) {
          {}
        } else {
          stryCov_9fa48("133883");
          return readinessService.getMembershipPublicationPlanningAnswerBestEffort(publicationNodeId, observedAt);
        }
      }
      if (stryMutAct_9fa48("133886") ? typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort !== TYPEOF.FUNCTION : stryMutAct_9fa48("133885") ? false : stryMutAct_9fa48("133884") ? true : (stryCov_9fa48("133884", "133885", "133886"), typeof readinessService.getMembershipPublicationPlanningSnapshotBestEffort === TYPEOF.FUNCTION)) {
        if (stryMutAct_9fa48("133887")) {
          {}
        } else {
          stryCov_9fa48("133887");
          return readinessService.getMembershipPublicationPlanningSnapshotBestEffort(publicationNodeId, observedAt);
        }
      }
      return null;
    }
  }

  /**
   * Expose the canonical planning snapshot owner for coordinator-level gates
   * that need to decide whether one in-flight priority recovery row still
   * blocks the next add-like action.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   */
  async getPriorityRecoveryPlanningSnapshotForOperation(operation) {
    if (stryMutAct_9fa48("133888")) {
      {}
    } else {
      stryCov_9fa48("133888");
      return this.getPriorityRecoveryPlanningSnapshot(operation);
    }
  }

  /**
   * @param {Object} operation
   * @return {Promise<string|null>}
   * @private
   */
  async getPriorityRecoverySupersededTargetError(operation) {
    if (stryMutAct_9fa48("133889")) {
      {}
    } else {
      stryCov_9fa48("133889");
      if (stryMutAct_9fa48("133892") ? !operation && operation.type !== OperationType.ADD && operation.type !== OperationType.REPLACE : stryMutAct_9fa48("133891") ? false : stryMutAct_9fa48("133890") ? true : (stryCov_9fa48("133890", "133891", "133892"), (stryMutAct_9fa48("133893") ? operation : (stryCov_9fa48("133893"), !operation)) || (stryMutAct_9fa48("133895") ? operation.type !== OperationType.ADD || operation.type !== OperationType.REPLACE : stryMutAct_9fa48("133894") ? false : (stryCov_9fa48("133894", "133895"), (stryMutAct_9fa48("133897") ? operation.type === OperationType.ADD : stryMutAct_9fa48("133896") ? true : (stryCov_9fa48("133896", "133897"), operation.type !== OperationType.ADD)) && (stryMutAct_9fa48("133899") ? operation.type === OperationType.REPLACE : stryMutAct_9fa48("133898") ? true : (stryCov_9fa48("133898", "133899"), operation.type !== OperationType.REPLACE)))))) {
        if (stryMutAct_9fa48("133900")) {
          {}
        } else {
          stryCov_9fa48("133900");
          return null;
        }
      }
      const targetNodeId = stryMutAct_9fa48("133901") ? String(operation.targetNodeId || '') : (stryCov_9fa48("133901"), String(stryMutAct_9fa48("133904") ? operation.targetNodeId && '' : stryMutAct_9fa48("133903") ? false : stryMutAct_9fa48("133902") ? true : (stryCov_9fa48("133902", "133903", "133904"), operation.targetNodeId || (stryMutAct_9fa48("133905") ? "Stryker was here!" : (stryCov_9fa48("133905"), '')))).trim());
      if (stryMutAct_9fa48("133908") ? targetNodeId.length !== NUM.ZERO : stryMutAct_9fa48("133907") ? false : stryMutAct_9fa48("133906") ? true : (stryCov_9fa48("133906", "133907", "133908"), targetNodeId.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("133909")) {
          {}
        } else {
          stryCov_9fa48("133909");
          return null;
        }
      }
      const planningSnapshot = await this.getPriorityRecoveryPlanningSnapshot(operation);
      if (stryMutAct_9fa48("133912") ? !planningSnapshot && typeof planningSnapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("133911") ? false : stryMutAct_9fa48("133910") ? true : (stryCov_9fa48("133910", "133911", "133912"), (stryMutAct_9fa48("133913") ? planningSnapshot : (stryCov_9fa48("133913"), !planningSnapshot)) || (stryMutAct_9fa48("133915") ? typeof planningSnapshot === TYPEOF.OBJECT : stryMutAct_9fa48("133914") ? false : (stryCov_9fa48("133914", "133915"), typeof planningSnapshot !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("133916")) {
          {}
        } else {
          stryCov_9fa48("133916");
          return null;
        }
      }
      const priorityPartitionSummary = (stryMutAct_9fa48("133919") ? planningSnapshot.priorityPartitionSummary || typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("133918") ? false : stryMutAct_9fa48("133917") ? true : (stryCov_9fa48("133917", "133918", "133919"), planningSnapshot.priorityPartitionSummary && (stryMutAct_9fa48("133921") ? typeof planningSnapshot.priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("133920") ? true : (stryCov_9fa48("133920", "133921"), typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT)))) ? planningSnapshot.priorityPartitionSummary : null;
      if (stryMutAct_9fa48("133924") ? false : stryMutAct_9fa48("133923") ? true : stryMutAct_9fa48("133922") ? hasPriorityRecoverySpreadGap(priorityPartitionSummary) : (stryCov_9fa48("133922", "133923", "133924"), !hasPriorityRecoverySpreadGap(priorityPartitionSummary))) {
        if (stryMutAct_9fa48("133925")) {
          {}
        } else {
          stryCov_9fa48("133925");
          return null;
        }
      }
      const blockedPartitionIds = priorityPartitionSummary ? buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary) : stryMutAct_9fa48("133926") ? ["Stryker was here"] : (stryCov_9fa48("133926"), []);
      if (stryMutAct_9fa48("133929") ? blockedPartitionIds.length > NUM.ZERO || !blockedPartitionIds.includes(operation.partitionId) : stryMutAct_9fa48("133928") ? false : stryMutAct_9fa48("133927") ? true : (stryCov_9fa48("133927", "133928", "133929"), (stryMutAct_9fa48("133932") ? blockedPartitionIds.length <= NUM.ZERO : stryMutAct_9fa48("133931") ? blockedPartitionIds.length >= NUM.ZERO : stryMutAct_9fa48("133930") ? true : (stryCov_9fa48("133930", "133931", "133932"), blockedPartitionIds.length > NUM.ZERO)) && (stryMutAct_9fa48("133933") ? blockedPartitionIds.includes(operation.partitionId) : (stryCov_9fa48("133933"), !blockedPartitionIds.includes(operation.partitionId))))) {
        if (stryMutAct_9fa48("133934")) {
          {}
        } else {
          stryCov_9fa48("133934");
          return null;
        }
      }
      const eligibleNodeIds = normalizeNodeIdList(resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds);
      if (stryMutAct_9fa48("133937") ? eligibleNodeIds.length === NUM.ZERO && eligibleNodeIds.includes(targetNodeId) : stryMutAct_9fa48("133936") ? false : stryMutAct_9fa48("133935") ? true : (stryCov_9fa48("133935", "133936", "133937"), (stryMutAct_9fa48("133939") ? eligibleNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("133938") ? false : (stryCov_9fa48("133938", "133939"), eligibleNodeIds.length === NUM.ZERO)) || eligibleNodeIds.includes(targetNodeId))) {
        if (stryMutAct_9fa48("133940")) {
          {}
        } else {
          stryCov_9fa48("133940");
          return null;
        }
      }
      return stryMutAct_9fa48("133941") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_RECOVERY_TARGET_NODE + targetNodeId + OPERATION_WORKFLOW_OWNER_LITERAL.IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR + operation.partitionId + OPERATION_WORKFLOW_OWNER_LITERAL.OPEN_PAREN + eligibleNodeIds.join(OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE) - OPERATION_WORKFLOW_OWNER_LITERAL.CLOSE_PAREN : (stryCov_9fa48("133941"), (stryMutAct_9fa48("133942") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_RECOVERY_TARGET_NODE + targetNodeId + OPERATION_WORKFLOW_OWNER_LITERAL.IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR + operation.partitionId + OPERATION_WORKFLOW_OWNER_LITERAL.OPEN_PAREN - eligibleNodeIds.join(OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE) : (stryCov_9fa48("133942"), (stryMutAct_9fa48("133943") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_RECOVERY_TARGET_NODE + targetNodeId + OPERATION_WORKFLOW_OWNER_LITERAL.IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR + operation.partitionId - OPERATION_WORKFLOW_OWNER_LITERAL.OPEN_PAREN : (stryCov_9fa48("133943"), (stryMutAct_9fa48("133944") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_RECOVERY_TARGET_NODE + targetNodeId + OPERATION_WORKFLOW_OWNER_LITERAL.IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR - operation.partitionId : (stryCov_9fa48("133944"), (stryMutAct_9fa48("133945") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_RECOVERY_TARGET_NODE + targetNodeId - OPERATION_WORKFLOW_OWNER_LITERAL.IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR : (stryCov_9fa48("133945"), (stryMutAct_9fa48("133946") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_RECOVERY_TARGET_NODE - targetNodeId : (stryCov_9fa48("133946"), OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_RECOVERY_TARGET_NODE + targetNodeId)) + OPERATION_WORKFLOW_OWNER_LITERAL.IS_NO_LONGER_IN_THE_CURRENT_ELIGIBLE_COHORT_FOR)) + operation.partitionId)) + OPERATION_WORKFLOW_OWNER_LITERAL.OPEN_PAREN)) + eligibleNodeIds.join(OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE))) + OPERATION_WORKFLOW_OWNER_LITERAL.CLOSE_PAREN);
    }
  }

  /**
   * @param {Object} operation
   * @param {Object[]} projectedVoterReadyRows
   * @return {Promise<string|null>}
   */
  async getPriorityPublishedMembershipRemoveError(operation, projectedVoterReadyRows) {
    if (stryMutAct_9fa48("133947")) {
      {}
    } else {
      stryCov_9fa48("133947");
      if (stryMutAct_9fa48("133950") ? !operation && !isPriorityControlPlanePartition({
        partitionId: operation.partitionId
      }) : stryMutAct_9fa48("133949") ? false : stryMutAct_9fa48("133948") ? true : (stryCov_9fa48("133948", "133949", "133950"), (stryMutAct_9fa48("133951") ? operation : (stryCov_9fa48("133951"), !operation)) || (stryMutAct_9fa48("133952") ? isPriorityControlPlanePartition({
        partitionId: operation.partitionId
      }) : (stryCov_9fa48("133952"), !isPriorityControlPlanePartition(stryMutAct_9fa48("133953") ? {} : (stryCov_9fa48("133953"), {
        partitionId: operation.partitionId
      })))))) {
        if (stryMutAct_9fa48("133954")) {
          {}
        } else {
          stryCov_9fa48("133954");
          return null;
        }
      }
      const planningSnapshot = await this.getPriorityRecoveryPlanningSnapshot(operation);
      if (stryMutAct_9fa48("133957") ? !planningSnapshot && typeof planningSnapshot !== TYPEOF.OBJECT : stryMutAct_9fa48("133956") ? false : stryMutAct_9fa48("133955") ? true : (stryCov_9fa48("133955", "133956", "133957"), (stryMutAct_9fa48("133958") ? planningSnapshot : (stryCov_9fa48("133958"), !planningSnapshot)) || (stryMutAct_9fa48("133960") ? typeof planningSnapshot === TYPEOF.OBJECT : stryMutAct_9fa48("133959") ? false : (stryCov_9fa48("133959", "133960"), typeof planningSnapshot !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("133961")) {
          {}
        } else {
          stryCov_9fa48("133961");
          return stryMutAct_9fa48("133962") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION + operation.partitionId - OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP_SAFETY_IS_UNAVAILABLE : (stryCov_9fa48("133962"), (stryMutAct_9fa48("133963") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION - operation.partitionId : (stryCov_9fa48("133963"), OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION + operation.partitionId)) + OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP_SAFETY_IS_UNAVAILABLE);
        }
      }
      const publishedActiveNodeIds = normalizeNodeIdList(planningSnapshot.publishedActiveNodeIds);
      const priorityPartitionSummary = (stryMutAct_9fa48("133966") ? planningSnapshot.priorityPartitionSummary || typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT : stryMutAct_9fa48("133965") ? false : stryMutAct_9fa48("133964") ? true : (stryCov_9fa48("133964", "133965", "133966"), planningSnapshot.priorityPartitionSummary && (stryMutAct_9fa48("133968") ? typeof planningSnapshot.priorityPartitionSummary !== TYPEOF.OBJECT : stryMutAct_9fa48("133967") ? true : (stryCov_9fa48("133967", "133968"), typeof planningSnapshot.priorityPartitionSummary === TYPEOF.OBJECT)))) ? planningSnapshot.priorityPartitionSummary : null;
      const spreadGapPending = hasPriorityRecoverySpreadGap(priorityPartitionSummary);
      const recoveryProjectionNodeIds = spreadGapPending ? normalizeNodeIdList(stryMutAct_9fa48("133969") ? [] : (stryCov_9fa48("133969"), [...normalizeNodeIdList(planningSnapshot.recoveryActiveNodeIds), ...normalizeNodeIdList(planningSnapshot.projectedServingNodeIds), ...normalizeNodeIdList(planningSnapshot.locallyEligibleNodeIds)])) : stryMutAct_9fa48("133970") ? ["Stryker was here"] : (stryCov_9fa48("133970"), []);
      const safetyMembershipNodeIds = (stryMutAct_9fa48("133974") ? recoveryProjectionNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("133973") ? recoveryProjectionNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("133972") ? false : stryMutAct_9fa48("133971") ? true : (stryCov_9fa48("133971", "133972", "133973", "133974"), recoveryProjectionNodeIds.length > NUM.ZERO)) ? recoveryProjectionNodeIds : publishedActiveNodeIds;
      const safetyMembershipSource = (stryMutAct_9fa48("133978") ? recoveryProjectionNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("133977") ? recoveryProjectionNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("133976") ? false : stryMutAct_9fa48("133975") ? true : (stryCov_9fa48("133975", "133976", "133977", "133978"), recoveryProjectionNodeIds.length > NUM.ZERO)) ? stryMutAct_9fa48("133979") ? "" : (stryCov_9fa48("133979"), 'recovery projection membership') : stryMutAct_9fa48("133980") ? "" : (stryCov_9fa48("133980"), 'published membership');
      const publishedActiveNodeIdsPresent = stryMutAct_9fa48("133983") ? planningSnapshot.publishedActiveNodeIdsPresent === true && publishedActiveNodeIds.length > NUM.ZERO : stryMutAct_9fa48("133982") ? false : stryMutAct_9fa48("133981") ? true : (stryCov_9fa48("133981", "133982", "133983"), (stryMutAct_9fa48("133985") ? planningSnapshot.publishedActiveNodeIdsPresent !== true : stryMutAct_9fa48("133984") ? false : (stryCov_9fa48("133984", "133985"), planningSnapshot.publishedActiveNodeIdsPresent === (stryMutAct_9fa48("133986") ? false : (stryCov_9fa48("133986"), true)))) || (stryMutAct_9fa48("133989") ? publishedActiveNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("133988") ? publishedActiveNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("133987") ? false : (stryCov_9fa48("133987", "133988", "133989"), publishedActiveNodeIds.length > NUM.ZERO)));
      if (stryMutAct_9fa48("133992") ? !publishedActiveNodeIdsPresent && recoveryProjectionNodeIds.length === NUM.ZERO || projectedVoterReadyRows.length > NUM.ZERO : stryMutAct_9fa48("133991") ? false : stryMutAct_9fa48("133990") ? true : (stryCov_9fa48("133990", "133991", "133992"), (stryMutAct_9fa48("133994") ? !publishedActiveNodeIdsPresent || recoveryProjectionNodeIds.length === NUM.ZERO : stryMutAct_9fa48("133993") ? true : (stryCov_9fa48("133993", "133994"), (stryMutAct_9fa48("133995") ? publishedActiveNodeIdsPresent : (stryCov_9fa48("133995"), !publishedActiveNodeIdsPresent)) && (stryMutAct_9fa48("133997") ? recoveryProjectionNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("133996") ? true : (stryCov_9fa48("133996", "133997"), recoveryProjectionNodeIds.length === NUM.ZERO)))) && (stryMutAct_9fa48("134000") ? projectedVoterReadyRows.length <= NUM.ZERO : stryMutAct_9fa48("133999") ? projectedVoterReadyRows.length >= NUM.ZERO : stryMutAct_9fa48("133998") ? true : (stryCov_9fa48("133998", "133999", "134000"), projectedVoterReadyRows.length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("134001")) {
          {}
        } else {
          stryCov_9fa48("134001");
          return (stryMutAct_9fa48("134002") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION - operation.partitionId : (stryCov_9fa48("134002"), OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION + operation.partitionId)) + (stryMutAct_9fa48("134003") ? `` : (stryCov_9fa48("134003"), ` ${safetyMembershipSource} is unavailable for safe removal`));
        }
      }
      const safetyMembershipNodeIdSet = new Set(safetyMembershipNodeIds);
      const missingPublishedNodeIds = stryMutAct_9fa48("134004") ? [] : (stryCov_9fa48("134004"), [...new Set(stryMutAct_9fa48("134005") ? projectedVoterReadyRows.map(row => {
        return typeof row?.node_id === TYPEOF.STRING ? row.node_id.trim() : '';
      }) : (stryCov_9fa48("134005"), projectedVoterReadyRows.map(row => {
        if (stryMutAct_9fa48("134006")) {
          {}
        } else {
          stryCov_9fa48("134006");
          return (stryMutAct_9fa48("134009") ? typeof row?.node_id !== TYPEOF.STRING : stryMutAct_9fa48("134008") ? false : stryMutAct_9fa48("134007") ? true : (stryCov_9fa48("134007", "134008", "134009"), typeof (stryMutAct_9fa48("134010") ? row.node_id : (stryCov_9fa48("134010"), row?.node_id)) === TYPEOF.STRING)) ? stryMutAct_9fa48("134011") ? row.node_id : (stryCov_9fa48("134011"), row.node_id.trim()) : stryMutAct_9fa48("134012") ? "Stryker was here!" : (stryCov_9fa48("134012"), '');
        }
      }).filter(stryMutAct_9fa48("134013") ? () => undefined : (stryCov_9fa48("134013"), nodeId => stryMutAct_9fa48("134016") ? nodeId.length > NUM.ZERO || !safetyMembershipNodeIdSet.has(nodeId) : stryMutAct_9fa48("134015") ? false : stryMutAct_9fa48("134014") ? true : (stryCov_9fa48("134014", "134015", "134016"), (stryMutAct_9fa48("134019") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("134018") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("134017") ? true : (stryCov_9fa48("134017", "134018", "134019"), nodeId.length > NUM.ZERO)) && (stryMutAct_9fa48("134020") ? safetyMembershipNodeIdSet.has(nodeId) : (stryCov_9fa48("134020"), !safetyMembershipNodeIdSet.has(nodeId))))))))]);
      if (stryMutAct_9fa48("134024") ? missingPublishedNodeIds.length <= NUM.ZERO : stryMutAct_9fa48("134023") ? missingPublishedNodeIds.length >= NUM.ZERO : stryMutAct_9fa48("134022") ? false : stryMutAct_9fa48("134021") ? true : (stryCov_9fa48("134021", "134022", "134023", "134024"), missingPublishedNodeIds.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("134025")) {
          {}
        } else {
          stryCov_9fa48("134025");
          return (stryMutAct_9fa48("134026") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION - operation.partitionId : (stryCov_9fa48("134026"), OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION + operation.partitionId)) + (stryMutAct_9fa48("134027") ? `` : (stryCov_9fa48("134027"), ` ${safetyMembershipSource} does not include projected voter-ready nodes `)) + missingPublishedNodeIds.join(OPERATION_WORKFLOW_OWNER_LITERAL.COMMA_SPACE);
        }
      }
      if (stryMutAct_9fa48("134030") ? false : stryMutAct_9fa48("134029") ? true : stryMutAct_9fa48("134028") ? priorityPartitionSummary : (stryCov_9fa48("134028", "134029", "134030"), !priorityPartitionSummary)) {
        if (stryMutAct_9fa48("134031")) {
          {}
        } else {
          stryCov_9fa48("134031");
          return null;
        }
      }
      const blockedPartitionIds = new Set(buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary));
      if (stryMutAct_9fa48("134034") ? blockedPartitionIds.has(operation.partitionId) || recoveryProjectionNodeIds.length === NUM.ZERO : stryMutAct_9fa48("134033") ? false : stryMutAct_9fa48("134032") ? true : (stryCov_9fa48("134032", "134033", "134034"), blockedPartitionIds.has(operation.partitionId) && (stryMutAct_9fa48("134036") ? recoveryProjectionNodeIds.length !== NUM.ZERO : stryMutAct_9fa48("134035") ? true : (stryCov_9fa48("134035", "134036"), recoveryProjectionNodeIds.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("134037")) {
          {}
        } else {
          stryCov_9fa48("134037");
          return stryMutAct_9fa48("134038") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION + operation.partitionId - OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD_HAS_NOT_CONVERGED : (stryCov_9fa48("134038"), (stryMutAct_9fa48("134039") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION - operation.partitionId : (stryCov_9fa48("134039"), OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION + operation.partitionId)) + OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD_HAS_NOT_CONVERGED);
        }
      }
      const requiredDistinctNodeCount = Number(priorityPartitionSummary.requiredDistinctNodeCount);
      if (stryMutAct_9fa48("134042") ? !Number.isFinite(requiredDistinctNodeCount) && requiredDistinctNodeCount <= NUM.ONE : stryMutAct_9fa48("134041") ? false : stryMutAct_9fa48("134040") ? true : (stryCov_9fa48("134040", "134041", "134042"), (stryMutAct_9fa48("134043") ? Number.isFinite(requiredDistinctNodeCount) : (stryCov_9fa48("134043"), !Number.isFinite(requiredDistinctNodeCount))) || (stryMutAct_9fa48("134046") ? requiredDistinctNodeCount > NUM.ONE : stryMutAct_9fa48("134045") ? requiredDistinctNodeCount < NUM.ONE : stryMutAct_9fa48("134044") ? false : (stryCov_9fa48("134044", "134045", "134046"), requiredDistinctNodeCount <= NUM.ONE)))) {
        if (stryMutAct_9fa48("134047")) {
          {}
        } else {
          stryCov_9fa48("134047");
          return null;
        }
      }
      const projectedDistinctNodeCount = new Set(stryMutAct_9fa48("134048") ? projectedVoterReadyRows.map(row => {
        return typeof row?.node_id === TYPEOF.STRING ? row.node_id.trim() : '';
      }) : (stryCov_9fa48("134048"), projectedVoterReadyRows.map(row => {
        if (stryMutAct_9fa48("134049")) {
          {}
        } else {
          stryCov_9fa48("134049");
          return (stryMutAct_9fa48("134052") ? typeof row?.node_id !== TYPEOF.STRING : stryMutAct_9fa48("134051") ? false : stryMutAct_9fa48("134050") ? true : (stryCov_9fa48("134050", "134051", "134052"), typeof (stryMutAct_9fa48("134053") ? row.node_id : (stryCov_9fa48("134053"), row?.node_id)) === TYPEOF.STRING)) ? stryMutAct_9fa48("134054") ? row.node_id : (stryCov_9fa48("134054"), row.node_id.trim()) : stryMutAct_9fa48("134055") ? "Stryker was here!" : (stryCov_9fa48("134055"), '');
        }
      }).filter(stryMutAct_9fa48("134056") ? () => undefined : (stryCov_9fa48("134056"), nodeId => stryMutAct_9fa48("134060") ? nodeId.length <= NUM.ZERO : stryMutAct_9fa48("134059") ? nodeId.length >= NUM.ZERO : stryMutAct_9fa48("134058") ? false : stryMutAct_9fa48("134057") ? true : (stryCov_9fa48("134057", "134058", "134059", "134060"), nodeId.length > NUM.ZERO))))).size;
      if (stryMutAct_9fa48("134064") ? projectedDistinctNodeCount >= requiredDistinctNodeCount : stryMutAct_9fa48("134063") ? projectedDistinctNodeCount <= requiredDistinctNodeCount : stryMutAct_9fa48("134062") ? false : stryMutAct_9fa48("134061") ? true : (stryCov_9fa48("134061", "134062", "134063", "134064"), projectedDistinctNodeCount < requiredDistinctNodeCount)) {
        if (stryMutAct_9fa48("134065")) {
          {}
        } else {
          stryCov_9fa48("134065");
          return (stryMutAct_9fa48("134066") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION + operation.partitionId + OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD_WOULD_FALL_BELOW_THE_PUBLISHED - OPERATION_WORKFLOW_OWNER_LITERAL.REQUIREMENT : (stryCov_9fa48("134066"), (stryMutAct_9fa48("134067") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION + operation.partitionId - OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD_WOULD_FALL_BELOW_THE_PUBLISHED : (stryCov_9fa48("134067"), (stryMutAct_9fa48("134068") ? OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION - operation.partitionId : (stryCov_9fa48("134068"), OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_CONTROL_DASH_PLANE_PARTITION + operation.partitionId)) + OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD_WOULD_FALL_BELOW_THE_PUBLISHED)) + OPERATION_WORKFLOW_OWNER_LITERAL.REQUIREMENT)) + (stryMutAct_9fa48("134069") ? `` : (stryCov_9fa48("134069"), ` (${projectedDistinctNodeCount}/${requiredDistinctNodeCount})`));
        }
      }
      return null;
    }
  }

  /**
   * Get safety validation error for REMOVE operations.
   * @param {Object} operation
   * @return {Promise<string|null>}
   */
  async getRemoveSafetyError(operation) {
    if (stryMutAct_9fa48("134070")) {
      {}
    } else {
      stryCov_9fa48("134070");
      if (stryMutAct_9fa48("134073") ? false : stryMutAct_9fa48("134072") ? true : stryMutAct_9fa48("134071") ? operation : (stryCov_9fa48("134071", "134072", "134073"), !operation)) {
        if (stryMutAct_9fa48("134074")) {
          {}
        } else {
          stryCov_9fa48("134074");
          return null;
        }
      }
      const isRemoveInitialDispatch = this.isRemoveInitialDispatchPhase(operation);
      const isReplaceRemoveInitialDispatch = this.repository.isReplaceRemovePhase(operation);
      if (stryMutAct_9fa48("134077") ? !isRemoveInitialDispatch || !isReplaceRemoveInitialDispatch : stryMutAct_9fa48("134076") ? false : stryMutAct_9fa48("134075") ? true : (stryCov_9fa48("134075", "134076", "134077"), (stryMutAct_9fa48("134078") ? isRemoveInitialDispatch : (stryCov_9fa48("134078"), !isRemoveInitialDispatch)) && (stryMutAct_9fa48("134079") ? isReplaceRemoveInitialDispatch : (stryCov_9fa48("134079"), !isReplaceRemoveInitialDispatch)))) {
        if (stryMutAct_9fa48("134080")) {
          {}
        } else {
          stryCov_9fa48("134080");
          return null;
        }
      }
      if (stryMutAct_9fa48("134083") ? false : stryMutAct_9fa48("134082") ? true : stryMutAct_9fa48("134081") ? this.isCriticalSystemPartition(operation.partitionId) : (stryCov_9fa48("134081", "134082", "134083"), !this.isCriticalSystemPartition(operation.partitionId))) {
        if (stryMutAct_9fa48("134084")) {
          {}
        } else {
          stryCov_9fa48("134084");
          return null;
        }
      }
      const criticalReplicaRows = await this.getCriticalReplicaRowsForSafety(operation.partitionId);
      if (stryMutAct_9fa48("134087") ? !Array.isArray(criticalReplicaRows) && criticalReplicaRows.length === NUM.ZERO : stryMutAct_9fa48("134086") ? false : stryMutAct_9fa48("134085") ? true : (stryCov_9fa48("134085", "134086", "134087"), (stryMutAct_9fa48("134088") ? Array.isArray(criticalReplicaRows) : (stryCov_9fa48("134088"), !Array.isArray(criticalReplicaRows))) || (stryMutAct_9fa48("134090") ? criticalReplicaRows.length !== NUM.ZERO : stryMutAct_9fa48("134089") ? false : (stryCov_9fa48("134089", "134090"), criticalReplicaRows.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("134091")) {
          {}
        } else {
          stryCov_9fa48("134091");
          return (stryMutAct_9fa48("134092") ? `` : (stryCov_9fa48("134092"), `Critical partition ${operation.partitionId}`)) + OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE;
        }
      }
      const currentVoterReadyRows = stryMutAct_9fa48("134093") ? criticalReplicaRows : (stryCov_9fa48("134093"), criticalReplicaRows.filter(stryMutAct_9fa48("134094") ? () => undefined : (stryCov_9fa48("134094"), row => this.isVoterReadyRoutableReplica(row))));
      const operationReplicaId = (stryMutAct_9fa48("134097") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("134096") ? false : stryMutAct_9fa48("134095") ? true : (stryCov_9fa48("134095", "134096", "134097"), operation.type === OperationType.REPLACE)) ? this.repository.getReplaceSourceReplicaId(operation) : operation.replicaId;
      if (stryMutAct_9fa48("134100") ? false : stryMutAct_9fa48("134099") ? true : stryMutAct_9fa48("134098") ? operationReplicaId : (stryCov_9fa48("134098", "134099", "134100"), !operationReplicaId)) {
        if (stryMutAct_9fa48("134101")) {
          {}
        } else {
          stryCov_9fa48("134101");
          return (stryMutAct_9fa48("134102") ? `` : (stryCov_9fa48("134102"), `Critical partition ${operation.partitionId}`)) + OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE;
        }
      }
      const removingVoterReady = stryMutAct_9fa48("134103") ? currentVoterReadyRows.every(row => this.isOperationReplicaRow(row, {
        ...operation,
        replicaId: operationReplicaId
      })) : (stryCov_9fa48("134103"), currentVoterReadyRows.some(stryMutAct_9fa48("134104") ? () => undefined : (stryCov_9fa48("134104"), row => this.isOperationReplicaRow(row, stryMutAct_9fa48("134105") ? {} : (stryCov_9fa48("134105"), {
        ...operation,
        replicaId: operationReplicaId
      })))));
      if (stryMutAct_9fa48("134108") ? false : stryMutAct_9fa48("134107") ? true : stryMutAct_9fa48("134106") ? removingVoterReady : (stryCov_9fa48("134106", "134107", "134108"), !removingVoterReady)) {
        if (stryMutAct_9fa48("134109")) {
          {}
        } else {
          stryCov_9fa48("134109");
          return null;
        }
      }
      if (stryMutAct_9fa48("134111") ? false : stryMutAct_9fa48("134110") ? true : (stryCov_9fa48("134110", "134111"), isReplaceRemoveInitialDispatch)) {
        if (stryMutAct_9fa48("134112")) {
          {}
        } else {
          stryCov_9fa48("134112");
          const replacementReplicaId = this.repository.getReplaceTargetReplicaId(operation);
          if (stryMutAct_9fa48("134115") ? false : stryMutAct_9fa48("134114") ? true : stryMutAct_9fa48("134113") ? replacementReplicaId : (stryCov_9fa48("134113", "134114", "134115"), !replacementReplicaId)) {
            if (stryMutAct_9fa48("134116")) {
              {}
            } else {
              stryCov_9fa48("134116");
              return stryMutAct_9fa48("134117") ? OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION + operation.partitionId + OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA - OPERATION_WORKFLOW_OWNER_LITERAL.IS_UNAVAILABLE : (stryCov_9fa48("134117"), (stryMutAct_9fa48("134118") ? OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION + operation.partitionId - OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA : (stryCov_9fa48("134118"), (stryMutAct_9fa48("134119") ? OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION - operation.partitionId : (stryCov_9fa48("134119"), OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION + operation.partitionId)) + OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA)) + OPERATION_WORKFLOW_OWNER_LITERAL.IS_UNAVAILABLE);
            }
          }
          const replacementReplica = criticalReplicaRows.find(row => {
            if (stryMutAct_9fa48("134120")) {
              {}
            } else {
              stryCov_9fa48("134120");
              return stryMutAct_9fa48("134123") ? row?.service_id === replacementReplicaId && row?.replica_id === replacementReplicaId : stryMutAct_9fa48("134122") ? false : stryMutAct_9fa48("134121") ? true : (stryCov_9fa48("134121", "134122", "134123"), (stryMutAct_9fa48("134125") ? row?.service_id !== replacementReplicaId : stryMutAct_9fa48("134124") ? false : (stryCov_9fa48("134124", "134125"), (stryMutAct_9fa48("134126") ? row.service_id : (stryCov_9fa48("134126"), row?.service_id)) === replacementReplicaId)) || (stryMutAct_9fa48("134128") ? row?.replica_id !== replacementReplicaId : stryMutAct_9fa48("134127") ? false : (stryCov_9fa48("134127", "134128"), (stryMutAct_9fa48("134129") ? row.replica_id : (stryCov_9fa48("134129"), row?.replica_id)) === replacementReplicaId)));
            }
          });
          if (stryMutAct_9fa48("134132") ? false : stryMutAct_9fa48("134131") ? true : stryMutAct_9fa48("134130") ? this.isVoterReadyRoutableReplica(replacementReplica) : (stryCov_9fa48("134130", "134131", "134132"), !this.isVoterReadyRoutableReplica(replacementReplica))) {
            if (stryMutAct_9fa48("134133")) {
              {}
            } else {
              stryCov_9fa48("134133");
              return stryMutAct_9fa48("134134") ? OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION + operation.partitionId + OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_2 + replacementReplicaId - OPERATION_WORKFLOW_OWNER_LITERAL.IS_NOT_VOTER_DASH_READY : (stryCov_9fa48("134134"), (stryMutAct_9fa48("134135") ? OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION + operation.partitionId + OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_2 - replacementReplicaId : (stryCov_9fa48("134135"), (stryMutAct_9fa48("134136") ? OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION + operation.partitionId - OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_2 : (stryCov_9fa48("134136"), (stryMutAct_9fa48("134137") ? OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION - operation.partitionId : (stryCov_9fa48("134137"), OPERATION_WORKFLOW_OWNER_LITERAL.CRITICAL_PARTITION + operation.partitionId)) + OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_2)) + replacementReplicaId)) + OPERATION_WORKFLOW_OWNER_LITERAL.IS_NOT_VOTER_DASH_READY);
            }
          }
        }
      }
      const minReplicaCount = await this.getCriticalMinReplicaCount(operation.partitionId);
      const projectedVoterReadyRows = stryMutAct_9fa48("134138") ? currentVoterReadyRows : (stryCov_9fa48("134138"), currentVoterReadyRows.filter(stryMutAct_9fa48("134139") ? () => undefined : (stryCov_9fa48("134139"), row => stryMutAct_9fa48("134140") ? this.isOperationReplicaRow(row, {
        ...operation,
        replicaId: operationReplicaId
      }) : (stryCov_9fa48("134140"), !this.isOperationReplicaRow(row, stryMutAct_9fa48("134141") ? {} : (stryCov_9fa48("134141"), {
        ...operation,
        replicaId: operationReplicaId
      }))))));
      const projectedVoterReadyCount = projectedVoterReadyRows.length;
      if (stryMutAct_9fa48("134145") ? projectedVoterReadyCount >= minReplicaCount : stryMutAct_9fa48("134144") ? projectedVoterReadyCount <= minReplicaCount : stryMutAct_9fa48("134143") ? false : stryMutAct_9fa48("134142") ? true : (stryCov_9fa48("134142", "134143", "134144", "134145"), projectedVoterReadyCount < minReplicaCount)) {
        if (stryMutAct_9fa48("134146")) {
          {}
        } else {
          stryCov_9fa48("134146");
          return (stryMutAct_9fa48("134147") ? `` : (stryCov_9fa48("134147"), `Critical partition ${operation.partitionId}`)) + OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM + (stryMutAct_9fa48("134148") ? `` : (stryCov_9fa48("134148"), ` (${projectedVoterReadyCount}/${minReplicaCount})`));
        }
      }
      return this.getPriorityPublishedMembershipRemoveError(operation, projectedVoterReadyRows);
    }
  }

  /**
   * Replay REPLACE source-removal from the authoritative row when the local
   * reconcile input is stale at SYNCING but the durable workflow already
   * advanced to ACTIVE on the canonical active-phase owner.
   *
   * This closes the gap where cache-lagged timeout reconciliation observes the
   * target as ACTIVE, replays the ACTIVE transition idempotently, but never
   * re-dispatches source removal because the local row has not caught up.
   *
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async replayReplaceActiveSourceRemovalFromAuthoritative(operation) {
    if (stryMutAct_9fa48("134149")) {
      {}
    } else {
      stryCov_9fa48("134149");
      if (stryMutAct_9fa48("134152") ? (!operation || operation.type !== OperationType.REPLACE || typeof operation.operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING) && operation.operationId.length === NUM.ZERO : stryMutAct_9fa48("134151") ? false : stryMutAct_9fa48("134150") ? true : (stryCov_9fa48("134150", "134151", "134152"), (stryMutAct_9fa48("134154") ? (!operation || operation.type !== OperationType.REPLACE) && typeof operation.operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("134153") ? false : (stryCov_9fa48("134153", "134154"), (stryMutAct_9fa48("134156") ? !operation && operation.type !== OperationType.REPLACE : stryMutAct_9fa48("134155") ? false : (stryCov_9fa48("134155", "134156"), (stryMutAct_9fa48("134157") ? operation : (stryCov_9fa48("134157"), !operation)) || (stryMutAct_9fa48("134159") ? operation.type === OperationType.REPLACE : stryMutAct_9fa48("134158") ? false : (stryCov_9fa48("134158", "134159"), operation.type !== OperationType.REPLACE)))) || (stryMutAct_9fa48("134161") ? typeof operation.operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("134160") ? false : (stryCov_9fa48("134160", "134161"), typeof operation.operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING)))) || (stryMutAct_9fa48("134163") ? operation.operationId.length !== NUM.ZERO : stryMutAct_9fa48("134162") ? false : (stryCov_9fa48("134162", "134163"), operation.operationId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("134164")) {
          {}
        } else {
          stryCov_9fa48("134164");
          return stryMutAct_9fa48("134165") ? true : (stryCov_9fa48("134165"), false);
        }
      }
      const authoritativeOperation = await this.repository.queryAuthoritativeOperationById(operation.operationId, stryMutAct_9fa48("134166") ? {} : (stryCov_9fa48("134166"), {
        requireOwnerRpcRead: stryMutAct_9fa48("134167") ? false : (stryCov_9fa48("134167"), true)
      }));
      if (stryMutAct_9fa48("134170") ? (!authoritativeOperation || authoritativeOperation.workflowStep !== WORKFLOW_STEP.ACTIVE) && !this.repository.isOperationLocallyOwned(authoritativeOperation) : stryMutAct_9fa48("134169") ? false : stryMutAct_9fa48("134168") ? true : (stryCov_9fa48("134168", "134169", "134170"), (stryMutAct_9fa48("134172") ? !authoritativeOperation && authoritativeOperation.workflowStep !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("134171") ? false : (stryCov_9fa48("134171", "134172"), (stryMutAct_9fa48("134173") ? authoritativeOperation : (stryCov_9fa48("134173"), !authoritativeOperation)) || (stryMutAct_9fa48("134175") ? authoritativeOperation.workflowStep === WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("134174") ? false : (stryCov_9fa48("134174", "134175"), authoritativeOperation.workflowStep !== WORKFLOW_STEP.ACTIVE)))) || (stryMutAct_9fa48("134176") ? this.repository.isOperationLocallyOwned(authoritativeOperation) : (stryCov_9fa48("134176"), !this.repository.isOperationLocallyOwned(authoritativeOperation))))) {
        if (stryMutAct_9fa48("134177")) {
          {}
        } else {
          stryCov_9fa48("134177");
          return stryMutAct_9fa48("134178") ? true : (stryCov_9fa48("134178"), false);
        }
      }
      await this.executeOperationFromReconcilePath(authoritativeOperation);
      return stryMutAct_9fa48("134179") ? false : (stryCov_9fa48("134179"), true);
    }
  }

  /**
   * @param {Object} operation
   * @return {number}
   * @private
   */
  getOperationWorkflowStepRank(operation) {
    if (stryMutAct_9fa48("134180")) {
      {}
    } else {
      stryCov_9fa48("134180");
      const steps = getWorkflowSteps(stryMutAct_9fa48("134181") ? operation.type : (stryCov_9fa48("134181"), operation?.type));
      const workflowStep = stryMutAct_9fa48("134182") ? (operation?.workflowStep ?? operation?.workflow_step) && null : (stryCov_9fa48("134182"), (stryMutAct_9fa48("134183") ? operation?.workflowStep && operation?.workflow_step : (stryCov_9fa48("134183"), (stryMutAct_9fa48("134184") ? operation.workflowStep : (stryCov_9fa48("134184"), operation?.workflowStep)) ?? (stryMutAct_9fa48("134185") ? operation.workflow_step : (stryCov_9fa48("134185"), operation?.workflow_step)))) ?? null);
      if (stryMutAct_9fa48("134188") ? (!Array.isArray(steps) || steps.length === NUM.ZERO) && typeof workflowStep !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("134187") ? false : stryMutAct_9fa48("134186") ? true : (stryCov_9fa48("134186", "134187", "134188"), (stryMutAct_9fa48("134190") ? !Array.isArray(steps) && steps.length === NUM.ZERO : stryMutAct_9fa48("134189") ? false : (stryCov_9fa48("134189", "134190"), (stryMutAct_9fa48("134191") ? Array.isArray(steps) : (stryCov_9fa48("134191"), !Array.isArray(steps))) || (stryMutAct_9fa48("134193") ? steps.length !== NUM.ZERO : stryMutAct_9fa48("134192") ? false : (stryCov_9fa48("134192", "134193"), steps.length === NUM.ZERO)))) || (stryMutAct_9fa48("134195") ? typeof workflowStep === OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("134194") ? false : (stryCov_9fa48("134194", "134195"), typeof workflowStep !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING)))) {
        if (stryMutAct_9fa48("134196")) {
          {}
        } else {
          stryCov_9fa48("134196");
          return NUM.NEGATIVE_ONE;
        }
      }
      return steps.indexOf(workflowStep);
    }
  }

  /**
   * @param {Object} targetOperation
   * @param {Object} sourceOperation
   * @return {void}
   * @private
   */
  applyObservedOperationState(targetOperation, sourceOperation) {
    if (stryMutAct_9fa48("134197")) {
      {}
    } else {
      stryCov_9fa48("134197");
      if (stryMutAct_9fa48("134200") ? !targetOperation && !sourceOperation : stryMutAct_9fa48("134199") ? false : stryMutAct_9fa48("134198") ? true : (stryCov_9fa48("134198", "134199", "134200"), (stryMutAct_9fa48("134201") ? targetOperation : (stryCov_9fa48("134201"), !targetOperation)) || (stryMutAct_9fa48("134202") ? sourceOperation : (stryCov_9fa48("134202"), !sourceOperation)))) {
        if (stryMutAct_9fa48("134203")) {
          {}
        } else {
          stryCov_9fa48("134203");
          return;
        }
      }
      targetOperation.replicaId = sourceOperation.replicaId;
      targetOperation.sourceReplicaId = sourceOperation.sourceReplicaId;
      targetOperation.workflowStep = sourceOperation.workflowStep;
      targetOperation.status = sourceOperation.status;
      targetOperation.updatedAt = sourceOperation.updatedAt;
      targetOperation.completedAt = sourceOperation.completedAt;
      targetOperation.errorMessage = sourceOperation.errorMessage;
      targetOperation.stepsHistory = Array.isArray(sourceOperation.stepsHistory) ? stryMutAct_9fa48("134204") ? [] : (stryCov_9fa48("134204"), [...sourceOperation.stepsHistory]) : stryMutAct_9fa48("134205") ? ["Stryker was here"] : (stryCov_9fa48("134205"), []);
    }
  }

  /**
   * Prefer the most advanced observed state for a REPLACE operation before
   * replaying active-phase reconciliation, so stale SYNCING rows cannot
   * overwrite a newer STOPPING/REMOVED state.
   *
   * @param {Object} operation
   * @return {Promise<Object|null>}
   * @private
   */
  async adoptMostAdvancedObservedReplaceState(operation) {
    if (stryMutAct_9fa48("134206")) {
      {}
    } else {
      stryCov_9fa48("134206");
      if (stryMutAct_9fa48("134209") ? (!operation || operation.type !== OperationType.REPLACE || typeof operation.operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING) && operation.operationId.length === NUM.ZERO : stryMutAct_9fa48("134208") ? false : stryMutAct_9fa48("134207") ? true : (stryCov_9fa48("134207", "134208", "134209"), (stryMutAct_9fa48("134211") ? (!operation || operation.type !== OperationType.REPLACE) && typeof operation.operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("134210") ? false : (stryCov_9fa48("134210", "134211"), (stryMutAct_9fa48("134213") ? !operation && operation.type !== OperationType.REPLACE : stryMutAct_9fa48("134212") ? false : (stryCov_9fa48("134212", "134213"), (stryMutAct_9fa48("134214") ? operation : (stryCov_9fa48("134214"), !operation)) || (stryMutAct_9fa48("134216") ? operation.type === OperationType.REPLACE : stryMutAct_9fa48("134215") ? false : (stryCov_9fa48("134215", "134216"), operation.type !== OperationType.REPLACE)))) || (stryMutAct_9fa48("134218") ? typeof operation.operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("134217") ? false : (stryCov_9fa48("134217", "134218"), typeof operation.operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING)))) || (stryMutAct_9fa48("134220") ? operation.operationId.length !== NUM.ZERO : stryMutAct_9fa48("134219") ? false : (stryCov_9fa48("134219", "134220"), operation.operationId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("134221")) {
          {}
        } else {
          stryCov_9fa48("134221");
          return null;
        }
      }
      const localRank = this.getOperationWorkflowStepRank(operation);
      let selectedOperation = null;
      let selectedRank = localRank;
      const maybeSelectOperation = candidate => {
        if (stryMutAct_9fa48("134222")) {
          {}
        } else {
          stryCov_9fa48("134222");
          if (stryMutAct_9fa48("134225") ? !candidate && !this.repository.isOperationLocallyOwned(candidate) : stryMutAct_9fa48("134224") ? false : stryMutAct_9fa48("134223") ? true : (stryCov_9fa48("134223", "134224", "134225"), (stryMutAct_9fa48("134226") ? candidate : (stryCov_9fa48("134226"), !candidate)) || (stryMutAct_9fa48("134227") ? this.repository.isOperationLocallyOwned(candidate) : (stryCov_9fa48("134227"), !this.repository.isOperationLocallyOwned(candidate))))) {
            if (stryMutAct_9fa48("134228")) {
              {}
            } else {
              stryCov_9fa48("134228");
              return;
            }
          }
          const candidateRank = this.getOperationWorkflowStepRank(candidate);
          if (stryMutAct_9fa48("134232") ? candidateRank <= selectedRank : stryMutAct_9fa48("134231") ? candidateRank >= selectedRank : stryMutAct_9fa48("134230") ? false : stryMutAct_9fa48("134229") ? true : (stryCov_9fa48("134229", "134230", "134231", "134232"), candidateRank > selectedRank)) {
            if (stryMutAct_9fa48("134233")) {
              {}
            } else {
              stryCov_9fa48("134233");
              selectedOperation = candidate;
              selectedRank = candidateRank;
            }
          }
        }
      };
      const cachedRow = this.repository.getReplicaOperationRowFromCache(operation.operationId);
      if (stryMutAct_9fa48("134235") ? false : stryMutAct_9fa48("134234") ? true : (stryCov_9fa48("134234", "134235"), cachedRow)) {
        if (stryMutAct_9fa48("134236")) {
          {}
        } else {
          stryCov_9fa48("134236");
          maybeSelectOperation(this.repository.rowToOperation(cachedRow));
        }
      }
      const authoritativeOperation = await this.repository.queryAuthoritativeOperationById(operation.operationId, stryMutAct_9fa48("134237") ? {} : (stryCov_9fa48("134237"), {
        requireOwnerRpcRead: stryMutAct_9fa48("134238") ? false : (stryCov_9fa48("134238"), true)
      }));
      maybeSelectOperation(authoritativeOperation);
      if (stryMutAct_9fa48("134241") ? false : stryMutAct_9fa48("134240") ? true : stryMutAct_9fa48("134239") ? selectedOperation : (stryCov_9fa48("134239", "134240", "134241"), !selectedOperation)) {
        if (stryMutAct_9fa48("134242")) {
          {}
        } else {
          stryCov_9fa48("134242");
          return null;
        }
      }
      this.applyObservedOperationState(operation, selectedOperation);
      return selectedOperation;
    }
  }

  /**
   * Reconcile a REPLACE operation after the target replica has become ACTIVE.
   * Prefer already-observed STOPPING/REMOVED state before committing another
   * ACTIVE transition from a stale local SYNCING row.
   *
   * @param {Object} operation
   * @return {Promise<void>}
   * @private
   */
  async reconcileReplaceActualActive(operation) {
    if (stryMutAct_9fa48("134243")) {
      {}
    } else {
      stryCov_9fa48("134243");
      const observedOperation = await this.adoptMostAdvancedObservedReplaceState(operation);
      if (stryMutAct_9fa48("134245") ? false : stryMutAct_9fa48("134244") ? true : (stryCov_9fa48("134244", "134245"), observedOperation)) {
        if (stryMutAct_9fa48("134246")) {
          {}
        } else {
          stryCov_9fa48("134246");
          if (stryMutAct_9fa48("134248") ? false : stryMutAct_9fa48("134247") ? true : (stryCov_9fa48("134247", "134248"), this.repository.isOperationTerminal(operation))) {
            if (stryMutAct_9fa48("134249")) {
              {}
            } else {
              stryCov_9fa48("134249");
              return;
            }
          }
          if (stryMutAct_9fa48("134252") ? operation.workflowStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("134251") ? false : stryMutAct_9fa48("134250") ? true : (stryCov_9fa48("134250", "134251", "134252"), operation.workflowStep === WORKFLOW_STEP.STOPPING)) {
            if (stryMutAct_9fa48("134253")) {
              {}
            } else {
              stryCov_9fa48("134253");
              await this.reconcileOperationProgress(operation);
              return;
            }
          }
          if (stryMutAct_9fa48("134256") ? operation.workflowStep !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("134255") ? false : stryMutAct_9fa48("134254") ? true : (stryCov_9fa48("134254", "134255", "134256"), operation.workflowStep === WORKFLOW_STEP.ACTIVE)) {
            if (stryMutAct_9fa48("134257")) {
              {}
            } else {
              stryCov_9fa48("134257");
              await this.executeOperationFromReconcilePath(operation);
              return;
            }
          }
        }
      }
      const activeTransitionCommitted = await this.updateStep(operation, WORKFLOW_STEP.ACTIVE);
      if (stryMutAct_9fa48("134259") ? false : stryMutAct_9fa48("134258") ? true : (stryCov_9fa48("134258", "134259"), activeTransitionCommitted)) {
        if (stryMutAct_9fa48("134260")) {
          {}
        } else {
          stryCov_9fa48("134260");
          await this.executeOperationFromReconcilePath(operation);
          return;
        }
      }
      await this.replayReplaceActiveSourceRemovalFromAuthoritative(operation);
    }
  }

  /**
   * Evaluate safety error for a move intent.
   * @param {Object} move
   * @return {Promise<string|null>}
   */
  async getMoveSafetyError(move) {
    if (stryMutAct_9fa48("134261")) {
      {}
    } else {
      stryCov_9fa48("134261");
      if (stryMutAct_9fa48("134264") ? false : stryMutAct_9fa48("134263") ? true : stryMutAct_9fa48("134262") ? move : (stryCov_9fa48("134262", "134263", "134264"), !move)) {
        if (stryMutAct_9fa48("134265")) {
          {}
        } else {
          stryCov_9fa48("134265");
          return null;
        }
      }
      const normalizedType = (stryMutAct_9fa48("134268") ? typeof move.type !== 'string' : stryMutAct_9fa48("134267") ? false : stryMutAct_9fa48("134266") ? true : (stryCov_9fa48("134266", "134267", "134268"), typeof move.type === (stryMutAct_9fa48("134269") ? "" : (stryCov_9fa48("134269"), 'string')))) ? stryMutAct_9fa48("134270") ? move.type.toLowerCase() : (stryCov_9fa48("134270"), move.type.toUpperCase()) : move.type;
      const operation = stryMutAct_9fa48("134271") ? {} : (stryCov_9fa48("134271"), {
        type: normalizedType,
        partitionId: stryMutAct_9fa48("134274") ? move.partitionId && move.entityId : stryMutAct_9fa48("134273") ? false : stryMutAct_9fa48("134272") ? true : (stryCov_9fa48("134272", "134273", "134274"), move.partitionId || move.entityId),
        replicaId: move.replicaId,
        targetNodeId: move.nodeId,
        workflowStep: WORKFLOW_STEP.PENDING
      });
      return this.getRemoveSafetyError(operation);
    }
  }

  // --- Observed-progress reconciliation ---

  /**
   * @param {Object} operation
   * @return {boolean}
   */
  isObservedProgressOperationCandidate(operation) {
    if (stryMutAct_9fa48("134275")) {
      {}
    } else {
      stryCov_9fa48("134275");
      if (stryMutAct_9fa48("134278") ? (!operation || this.repository.isOperationTerminal(operation)) && !this.repository.isOperationLocallyOwned(operation) : stryMutAct_9fa48("134277") ? false : stryMutAct_9fa48("134276") ? true : (stryCov_9fa48("134276", "134277", "134278"), (stryMutAct_9fa48("134280") ? !operation && this.repository.isOperationTerminal(operation) : stryMutAct_9fa48("134279") ? false : (stryCov_9fa48("134279", "134280"), (stryMutAct_9fa48("134281") ? operation : (stryCov_9fa48("134281"), !operation)) || this.repository.isOperationTerminal(operation))) || (stryMutAct_9fa48("134282") ? this.repository.isOperationLocallyOwned(operation) : (stryCov_9fa48("134282"), !this.repository.isOperationLocallyOwned(operation))))) {
        if (stryMutAct_9fa48("134283")) {
          {}
        } else {
          stryCov_9fa48("134283");
          return stryMutAct_9fa48("134284") ? true : (stryCov_9fa48("134284"), false);
        }
      }
      if (stryMutAct_9fa48("134286") ? false : stryMutAct_9fa48("134285") ? true : (stryCov_9fa48("134285", "134286"), OBSERVED_PROGRESS_RELEVANT_WORKFLOW_STEPS.has(operation.workflowStep))) {
        if (stryMutAct_9fa48("134287")) {
          {}
        } else {
          stryCov_9fa48("134287");
          return stryMutAct_9fa48("134288") ? false : (stryCov_9fa48("134288"), true);
        }
      }
      return stryMutAct_9fa48("134291") ? operation.type === OperationType.REPLACE || operation.workflowStep === WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("134290") ? false : stryMutAct_9fa48("134289") ? true : (stryCov_9fa48("134289", "134290", "134291"), (stryMutAct_9fa48("134293") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("134292") ? true : (stryCov_9fa48("134292", "134293"), operation.type === OperationType.REPLACE)) && (stryMutAct_9fa48("134295") ? operation.workflowStep !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("134294") ? true : (stryCov_9fa48("134294", "134295"), operation.workflowStep === WORKFLOW_STEP.ACTIVE)));
    }
  }

  /**
   * @param {Object} serviceRow
   * @param {string} cacheOperation
   * @return {string[]}
   */
  findObservedProgressOperationIds(serviceRow, cacheOperation) {
    if (stryMutAct_9fa48("134296")) {
      {}
    } else {
      stryCov_9fa48("134296");
      if (stryMutAct_9fa48("134299") ? !serviceRow && typeof serviceRow !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("134298") ? false : stryMutAct_9fa48("134297") ? true : (stryCov_9fa48("134297", "134298", "134299"), (stryMutAct_9fa48("134300") ? serviceRow : (stryCov_9fa48("134300"), !serviceRow)) || (stryMutAct_9fa48("134302") ? typeof serviceRow === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("134301") ? false : (stryCov_9fa48("134301", "134302"), typeof serviceRow !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("134303")) {
          {}
        } else {
          stryCov_9fa48("134303");
          return stryMutAct_9fa48("134304") ? ["Stryker was here"] : (stryCov_9fa48("134304"), []);
        }
      }
      if (stryMutAct_9fa48("134307") ? cacheOperation === OPERATION_WORKFLOW_OWNER_LITERAL.DELETE : stryMutAct_9fa48("134306") ? false : stryMutAct_9fa48("134305") ? true : (stryCov_9fa48("134305", "134306", "134307"), cacheOperation !== OPERATION_WORKFLOW_OWNER_LITERAL.DELETE)) {
        if (stryMutAct_9fa48("134308")) {
          {}
        } else {
          stryCov_9fa48("134308");
          const status = stryMutAct_9fa48("134309") ? String(serviceRow.status || '').toUpperCase() : (stryCov_9fa48("134309"), String(stryMutAct_9fa48("134312") ? serviceRow.status && '' : stryMutAct_9fa48("134311") ? false : stryMutAct_9fa48("134310") ? true : (stryCov_9fa48("134310", "134311", "134312"), serviceRow.status || (stryMutAct_9fa48("134313") ? "Stryker was here!" : (stryCov_9fa48("134313"), '')))).toLowerCase());
          if (stryMutAct_9fa48("134316") ? false : stryMutAct_9fa48("134315") ? true : stryMutAct_9fa48("134314") ? OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES.has(status) : (stryCov_9fa48("134314", "134315", "134316"), !OBSERVED_PROGRESS_RELEVANT_SERVICE_STATUSES.has(status))) {
            if (stryMutAct_9fa48("134317")) {
              {}
            } else {
              stryCov_9fa48("134317");
              return stryMutAct_9fa48("134318") ? ["Stryker was here"] : (stryCov_9fa48("134318"), []);
            }
          }
        }
      }
      const targetNodeId = String(stryMutAct_9fa48("134321") ? (serviceRow.node_id || serviceRow.nodeId) && '' : stryMutAct_9fa48("134320") ? false : stryMutAct_9fa48("134319") ? true : (stryCov_9fa48("134319", "134320", "134321"), (stryMutAct_9fa48("134323") ? serviceRow.node_id && serviceRow.nodeId : stryMutAct_9fa48("134322") ? false : (stryCov_9fa48("134322", "134323"), serviceRow.node_id || serviceRow.nodeId)) || (stryMutAct_9fa48("134324") ? "Stryker was here!" : (stryCov_9fa48("134324"), ''))));
      const replicaId = String(stryMutAct_9fa48("134327") ? (serviceRow.service_id || serviceRow.serviceId || serviceRow.replica_id || serviceRow.replicaId) && '' : stryMutAct_9fa48("134326") ? false : stryMutAct_9fa48("134325") ? true : (stryCov_9fa48("134325", "134326", "134327"), (stryMutAct_9fa48("134329") ? (serviceRow.service_id || serviceRow.serviceId || serviceRow.replica_id) && serviceRow.replicaId : stryMutAct_9fa48("134328") ? false : (stryCov_9fa48("134328", "134329"), (stryMutAct_9fa48("134331") ? (serviceRow.service_id || serviceRow.serviceId) && serviceRow.replica_id : stryMutAct_9fa48("134330") ? false : (stryCov_9fa48("134330", "134331"), (stryMutAct_9fa48("134333") ? serviceRow.service_id && serviceRow.serviceId : stryMutAct_9fa48("134332") ? false : (stryCov_9fa48("134332", "134333"), serviceRow.service_id || serviceRow.serviceId)) || serviceRow.replica_id)) || serviceRow.replicaId)) || (stryMutAct_9fa48("134334") ? "Stryker was here!" : (stryCov_9fa48("134334"), ''))));
      const partitionId = String(stryMutAct_9fa48("134337") ? (serviceRow.partition_id || serviceRow.partitionId) && '' : stryMutAct_9fa48("134336") ? false : stryMutAct_9fa48("134335") ? true : (stryCov_9fa48("134335", "134336", "134337"), (stryMutAct_9fa48("134339") ? serviceRow.partition_id && serviceRow.partitionId : stryMutAct_9fa48("134338") ? false : (stryCov_9fa48("134338", "134339"), serviceRow.partition_id || serviceRow.partitionId)) || (stryMutAct_9fa48("134340") ? "Stryker was here!" : (stryCov_9fa48("134340"), ''))));
      if (stryMutAct_9fa48("134343") ? targetNodeId.length === NUM.ZERO && replicaId.length === NUM.ZERO && partitionId.length === NUM.ZERO : stryMutAct_9fa48("134342") ? false : stryMutAct_9fa48("134341") ? true : (stryCov_9fa48("134341", "134342", "134343"), (stryMutAct_9fa48("134345") ? targetNodeId.length !== NUM.ZERO : stryMutAct_9fa48("134344") ? false : (stryCov_9fa48("134344", "134345"), targetNodeId.length === NUM.ZERO)) || (stryMutAct_9fa48("134347") ? replicaId.length === NUM.ZERO || partitionId.length === NUM.ZERO : stryMutAct_9fa48("134346") ? false : (stryCov_9fa48("134346", "134347"), (stryMutAct_9fa48("134349") ? replicaId.length !== NUM.ZERO : stryMutAct_9fa48("134348") ? true : (stryCov_9fa48("134348", "134349"), replicaId.length === NUM.ZERO)) && (stryMutAct_9fa48("134351") ? partitionId.length !== NUM.ZERO : stryMutAct_9fa48("134350") ? true : (stryCov_9fa48("134350", "134351"), partitionId.length === NUM.ZERO)))))) {
        if (stryMutAct_9fa48("134352")) {
          {}
        } else {
          stryCov_9fa48("134352");
          return stryMutAct_9fa48("134353") ? ["Stryker was here"] : (stryCov_9fa48("134353"), []);
        }
      }
      const matchingRows = stryMutAct_9fa48("134356") ? this.repository.filterReplicaOperationRowsFromCache(row => {
        const operation = this.repository.rowToOperation(row);
        if (!this.isObservedProgressOperationCandidate(operation)) {
          return false;
        }
        if (operation.targetNodeId !== targetNodeId) {
          return false;
        }
        if (replicaId.length > NUM.ZERO && operation.replicaId === replicaId) {
          return true;
        }
        return partitionId.length > NUM.ZERO && operation.partitionId === partitionId;
      }) && [] : stryMutAct_9fa48("134355") ? false : stryMutAct_9fa48("134354") ? true : (stryCov_9fa48("134354", "134355", "134356"), this.repository.filterReplicaOperationRowsFromCache(row => {
        if (stryMutAct_9fa48("134357")) {
          {}
        } else {
          stryCov_9fa48("134357");
          const operation = this.repository.rowToOperation(row);
          if (stryMutAct_9fa48("134360") ? false : stryMutAct_9fa48("134359") ? true : stryMutAct_9fa48("134358") ? this.isObservedProgressOperationCandidate(operation) : (stryCov_9fa48("134358", "134359", "134360"), !this.isObservedProgressOperationCandidate(operation))) {
            if (stryMutAct_9fa48("134361")) {
              {}
            } else {
              stryCov_9fa48("134361");
              return stryMutAct_9fa48("134362") ? true : (stryCov_9fa48("134362"), false);
            }
          }
          if (stryMutAct_9fa48("134365") ? operation.targetNodeId === targetNodeId : stryMutAct_9fa48("134364") ? false : stryMutAct_9fa48("134363") ? true : (stryCov_9fa48("134363", "134364", "134365"), operation.targetNodeId !== targetNodeId)) {
            if (stryMutAct_9fa48("134366")) {
              {}
            } else {
              stryCov_9fa48("134366");
              return stryMutAct_9fa48("134367") ? true : (stryCov_9fa48("134367"), false);
            }
          }
          if (stryMutAct_9fa48("134370") ? replicaId.length > NUM.ZERO || operation.replicaId === replicaId : stryMutAct_9fa48("134369") ? false : stryMutAct_9fa48("134368") ? true : (stryCov_9fa48("134368", "134369", "134370"), (stryMutAct_9fa48("134373") ? replicaId.length <= NUM.ZERO : stryMutAct_9fa48("134372") ? replicaId.length >= NUM.ZERO : stryMutAct_9fa48("134371") ? true : (stryCov_9fa48("134371", "134372", "134373"), replicaId.length > NUM.ZERO)) && (stryMutAct_9fa48("134375") ? operation.replicaId !== replicaId : stryMutAct_9fa48("134374") ? true : (stryCov_9fa48("134374", "134375"), operation.replicaId === replicaId)))) {
            if (stryMutAct_9fa48("134376")) {
              {}
            } else {
              stryCov_9fa48("134376");
              return stryMutAct_9fa48("134377") ? false : (stryCov_9fa48("134377"), true);
            }
          }
          return stryMutAct_9fa48("134380") ? partitionId.length > NUM.ZERO || operation.partitionId === partitionId : stryMutAct_9fa48("134379") ? false : stryMutAct_9fa48("134378") ? true : (stryCov_9fa48("134378", "134379", "134380"), (stryMutAct_9fa48("134383") ? partitionId.length <= NUM.ZERO : stryMutAct_9fa48("134382") ? partitionId.length >= NUM.ZERO : stryMutAct_9fa48("134381") ? true : (stryCov_9fa48("134381", "134382", "134383"), partitionId.length > NUM.ZERO)) && (stryMutAct_9fa48("134385") ? operation.partitionId !== partitionId : stryMutAct_9fa48("134384") ? true : (stryCov_9fa48("134384", "134385"), operation.partitionId === partitionId)));
        }
      }) || (stryMutAct_9fa48("134386") ? ["Stryker was here"] : (stryCov_9fa48("134386"), [])));
      return stryMutAct_9fa48("134387") ? [] : (stryCov_9fa48("134387"), [...new Set(stryMutAct_9fa48("134388") ? matchingRows.map(row => row?.operation_id || row?.operationId || null) : (stryCov_9fa48("134388"), matchingRows.map(stryMutAct_9fa48("134389") ? () => undefined : (stryCov_9fa48("134389"), row => stryMutAct_9fa48("134392") ? (row?.operation_id || row?.operationId) && null : stryMutAct_9fa48("134391") ? false : stryMutAct_9fa48("134390") ? true : (stryCov_9fa48("134390", "134391", "134392"), (stryMutAct_9fa48("134394") ? row?.operation_id && row?.operationId : stryMutAct_9fa48("134393") ? false : (stryCov_9fa48("134393", "134394"), (stryMutAct_9fa48("134395") ? row.operation_id : (stryCov_9fa48("134395"), row?.operation_id)) || (stryMutAct_9fa48("134396") ? row.operationId : (stryCov_9fa48("134396"), row?.operationId)))) || null))).filter(stryMutAct_9fa48("134397") ? () => undefined : (stryCov_9fa48("134397"), opId => stryMutAct_9fa48("134400") ? typeof opId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING || opId.length > NUM.ZERO : stryMutAct_9fa48("134399") ? false : stryMutAct_9fa48("134398") ? true : (stryCov_9fa48("134398", "134399", "134400"), (stryMutAct_9fa48("134402") ? typeof opId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("134401") ? true : (stryCov_9fa48("134401", "134402"), typeof opId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) && (stryMutAct_9fa48("134405") ? opId.length <= NUM.ZERO : stryMutAct_9fa48("134404") ? opId.length >= NUM.ZERO : stryMutAct_9fa48("134403") ? true : (stryCov_9fa48("134403", "134404", "134405"), opId.length > NUM.ZERO)))))))]);
    }
  }

  /**
   * @param {string} operationId
   * @return {Promise<boolean>}
   */
  async reconcileObservedProgressOperation(operationId) {
    if (stryMutAct_9fa48("134406")) {
      {}
    } else {
      stryCov_9fa48("134406");
      if (stryMutAct_9fa48("134409") ? typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING && operationId.length === NUM.ZERO : stryMutAct_9fa48("134408") ? false : stryMutAct_9fa48("134407") ? true : (stryCov_9fa48("134407", "134408", "134409"), (stryMutAct_9fa48("134411") ? typeof operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("134410") ? false : (stryCov_9fa48("134410", "134411"), typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) || (stryMutAct_9fa48("134413") ? operationId.length !== NUM.ZERO : stryMutAct_9fa48("134412") ? false : (stryCov_9fa48("134412", "134413"), operationId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("134414")) {
          {}
        } else {
          stryCov_9fa48("134414");
          return stryMutAct_9fa48("134415") ? true : (stryCov_9fa48("134415"), false);
        }
      }
      let operation = await this.repository.queryAuthoritativeOperationById(operationId, stryMutAct_9fa48("134416") ? {} : (stryCov_9fa48("134416"), {
        requireOwnerRpcRead: stryMutAct_9fa48("134417") ? false : (stryCov_9fa48("134417"), true)
      }));
      if (stryMutAct_9fa48("134420") ? false : stryMutAct_9fa48("134419") ? true : stryMutAct_9fa48("134418") ? operation : (stryCov_9fa48("134418", "134419", "134420"), !operation)) {
        if (stryMutAct_9fa48("134421")) {
          {}
        } else {
          stryCov_9fa48("134421");
          operation = await this.repository.queryAuthoritativeOperationById(operationId, stryMutAct_9fa48("134422") ? {} : (stryCov_9fa48("134422"), {
            requireOwnerRpcRead: stryMutAct_9fa48("134423") ? true : (stryCov_9fa48("134423"), false)
          }));
        }
      }
      if (stryMutAct_9fa48("134426") ? false : stryMutAct_9fa48("134425") ? true : stryMutAct_9fa48("134424") ? this.isObservedProgressOperationCandidate(operation) : (stryCov_9fa48("134424", "134425", "134426"), !this.isObservedProgressOperationCandidate(operation))) {
        if (stryMutAct_9fa48("134427")) {
          {}
        } else {
          stryCov_9fa48("134427");
          this.clearObservedProgressRetry(operationId);
          return stryMutAct_9fa48("134428") ? true : (stryCov_9fa48("134428"), false);
        }
      }
      const progressed = await this.reconcileOperationProgress(operation, stryMutAct_9fa48("134429") ? {} : (stryCov_9fa48("134429"), {
        cause: stryMutAct_9fa48("134430") ? "" : (stryCov_9fa48("134430"), 'observed_progress')
      }));
      this.clearObservedProgressRetry(operationId);
      return progressed;
    }
  }

  /**
   * Observe services cache progress and re-enter the owner lane.
   * @param {string} tableName
   * @param {string} cacheOperation
   * @param {Object} record
   */
  handleObservedReplicaStateChange(tableName, cacheOperation, record) {
    if (stryMutAct_9fa48("134431")) {
      {}
    } else {
      stryCov_9fa48("134431");
      if (stryMutAct_9fa48("134434") ? (this.isShuttingDown || !this.isInitialized) && tableName !== SYSTEM_TABLE_NAME.SERVICES : stryMutAct_9fa48("134433") ? false : stryMutAct_9fa48("134432") ? true : (stryCov_9fa48("134432", "134433", "134434"), (stryMutAct_9fa48("134436") ? this.isShuttingDown && !this.isInitialized : stryMutAct_9fa48("134435") ? false : (stryCov_9fa48("134435", "134436"), this.isShuttingDown || (stryMutAct_9fa48("134437") ? this.isInitialized : (stryCov_9fa48("134437"), !this.isInitialized)))) || (stryMutAct_9fa48("134439") ? tableName === SYSTEM_TABLE_NAME.SERVICES : stryMutAct_9fa48("134438") ? false : (stryCov_9fa48("134438", "134439"), tableName !== SYSTEM_TABLE_NAME.SERVICES)))) {
        if (stryMutAct_9fa48("134440")) {
          {}
        } else {
          stryCov_9fa48("134440");
          return;
        }
      }
      const operationIds = this.findObservedProgressOperationIds(record, cacheOperation);
      for (const operationId of operationIds) {
        if (stryMutAct_9fa48("134441")) {
          {}
        } else {
          stryCov_9fa48("134441");
          this.operationWorkflowRunExclusive(this.getOperationOwnerSingleFlightKey(operationId), stryMutAct_9fa48("134442") ? () => undefined : (stryCov_9fa48("134442"), () => this.reconcileObservedProgressOperation(operationId))).catch(error => {
            if (stryMutAct_9fa48("134443")) {
              {}
            } else {
              stryCov_9fa48("134443");
              this.handleObservedProgressFailure(operationId, tableName, cacheOperation, error);
            }
          });
        }
      }
    }
  }

  // --- Reconciliation and timeout ---

  /**
   * Reconcile STOPPING remove/replace progression against source replica
   * removal state.
   * @param {Object} operation
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileStoppingOperationProgress(operation) {
    if (stryMutAct_9fa48("134444")) {
      {}
    } else {
      stryCov_9fa48("134444");
      const removingReplicaId = (stryMutAct_9fa48("134447") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("134446") ? false : stryMutAct_9fa48("134445") ? true : (stryCov_9fa48("134445", "134446", "134447"), operation.type === OperationType.REPLACE)) ? this.repository.getReplaceSourceReplicaId(operation) : operation.replicaId;
      const removingNodeId = (stryMutAct_9fa48("134450") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("134449") ? false : stryMutAct_9fa48("134448") ? true : (stryCov_9fa48("134448", "134449", "134450"), operation.type === OperationType.REPLACE)) ? operation.sourceNodeId : operation.targetNodeId;
      if (stryMutAct_9fa48("134453") ? false : stryMutAct_9fa48("134452") ? true : stryMutAct_9fa48("134451") ? removingReplicaId : (stryCov_9fa48("134451", "134452", "134453"), !removingReplicaId)) {
        if (stryMutAct_9fa48("134454")) {
          {}
        } else {
          stryCov_9fa48("134454");
          await this.failOperation(operation, OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_MISSING_DURING_STOPPING_RECONCILIATION);
          return stryMutAct_9fa48("134455") ? false : (stryCov_9fa48("134455"), true);
        }
      }
      const actualStatus = await this.getActualReplicaStatus(removingReplicaId, operation.partitionId, removingNodeId);
      if (stryMutAct_9fa48("134458") ? actualStatus === null && operation.type === OperationType.REPLACE && actualStatus === ReplicaStatus.FAILED : stryMutAct_9fa48("134457") ? false : stryMutAct_9fa48("134456") ? true : (stryCov_9fa48("134456", "134457", "134458"), (stryMutAct_9fa48("134460") ? actualStatus !== null : stryMutAct_9fa48("134459") ? false : (stryCov_9fa48("134459", "134460"), actualStatus === null)) || (stryMutAct_9fa48("134462") ? operation.type === OperationType.REPLACE || actualStatus === ReplicaStatus.FAILED : stryMutAct_9fa48("134461") ? false : (stryCov_9fa48("134461", "134462"), (stryMutAct_9fa48("134464") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("134463") ? true : (stryCov_9fa48("134463", "134464"), operation.type === OperationType.REPLACE)) && (stryMutAct_9fa48("134466") ? actualStatus !== ReplicaStatus.FAILED : stryMutAct_9fa48("134465") ? true : (stryCov_9fa48("134465", "134466"), actualStatus === ReplicaStatus.FAILED)))))) {
        if (stryMutAct_9fa48("134467")) {
          {}
        } else {
          stryCov_9fa48("134467");
          await this.completeOperation(operation);
          return stryMutAct_9fa48("134468") ? false : (stryCov_9fa48("134468"), true);
        }
      }
      if (stryMutAct_9fa48("134471") ? actualStatus !== ReplicaStatus.FAILED : stryMutAct_9fa48("134470") ? false : stryMutAct_9fa48("134469") ? true : (stryCov_9fa48("134469", "134470", "134471"), actualStatus === ReplicaStatus.FAILED)) {
        if (stryMutAct_9fa48("134472")) {
          {}
        } else {
          stryCov_9fa48("134472");
          await this.failOperation(operation, OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_REMOVE_RECONCILIATION);
          return stryMutAct_9fa48("134473") ? false : (stryCov_9fa48("134473"), true);
        }
      }
      const replayResult = await this.executeOperationFromReconcilePath(operation);
      if (stryMutAct_9fa48("134476") ? replayResult?.success === true || replayResult.status !== ReplicaOperationResponseStatus.IN_PROGRESS : stryMutAct_9fa48("134475") ? false : stryMutAct_9fa48("134474") ? true : (stryCov_9fa48("134474", "134475", "134476"), (stryMutAct_9fa48("134478") ? replayResult?.success !== true : stryMutAct_9fa48("134477") ? true : (stryCov_9fa48("134477", "134478"), (stryMutAct_9fa48("134479") ? replayResult.success : (stryCov_9fa48("134479"), replayResult?.success)) === (stryMutAct_9fa48("134480") ? false : (stryCov_9fa48("134480"), true)))) && (stryMutAct_9fa48("134482") ? replayResult.status === ReplicaOperationResponseStatus.IN_PROGRESS : stryMutAct_9fa48("134481") ? true : (stryCov_9fa48("134481", "134482"), replayResult.status !== ReplicaOperationResponseStatus.IN_PROGRESS)))) {
        if (stryMutAct_9fa48("134483")) {
          {}
        } else {
          stryCov_9fa48("134483");
          return stryMutAct_9fa48("134484") ? false : (stryCov_9fa48("134484"), true);
        }
      }
      return stryMutAct_9fa48("134485") ? true : (stryCov_9fa48("134485"), false);
    }
  }

  /**
   * Apply one reconciled target-replica status to the canonical operation
   * owner path.
   * @param {Object} operation
   * @param {string|null} actualStatus
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   * @private
   */
  async applyReconciledReplicaStatus(operation, actualStatus, options = {}) {
    if (stryMutAct_9fa48("134486")) {
      {}
    } else {
      stryCov_9fa48("134486");
      const cause = stryMutAct_9fa48("134489") ? options.cause && 'progress' : stryMutAct_9fa48("134488") ? false : stryMutAct_9fa48("134487") ? true : (stryCov_9fa48("134487", "134488", "134489"), options.cause || (stryMutAct_9fa48("134490") ? "" : (stryCov_9fa48("134490"), 'progress')));
      if (stryMutAct_9fa48("134493") ? actualStatus === ReplicaStatus.CREATING || operation.workflowStep === WORKFLOW_STEP.PENDING || operation.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("134492") ? false : stryMutAct_9fa48("134491") ? true : (stryCov_9fa48("134491", "134492", "134493"), (stryMutAct_9fa48("134495") ? actualStatus !== ReplicaStatus.CREATING : stryMutAct_9fa48("134494") ? true : (stryCov_9fa48("134494", "134495"), actualStatus === ReplicaStatus.CREATING)) && (stryMutAct_9fa48("134497") ? operation.workflowStep === WORKFLOW_STEP.PENDING && operation.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("134496") ? true : (stryCov_9fa48("134496", "134497"), (stryMutAct_9fa48("134499") ? operation.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("134498") ? false : (stryCov_9fa48("134498", "134499"), operation.workflowStep === WORKFLOW_STEP.PENDING)) || (stryMutAct_9fa48("134501") ? operation.workflowStep !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("134500") ? false : (stryCov_9fa48("134500", "134501"), operation.workflowStep === WORKFLOW_STEP.SENDING)))))) {
        if (stryMutAct_9fa48("134502")) {
          {}
        } else {
          stryCov_9fa48("134502");
          await this.updateStep(operation, WORKFLOW_STEP.CREATING);
          return stryMutAct_9fa48("134503") ? false : (stryCov_9fa48("134503"), true);
        }
      }
      if (stryMutAct_9fa48("134506") ? actualStatus === ReplicaStatus.SYNCING || operation.workflowStep === WORKFLOW_STEP.PENDING || operation.workflowStep === WORKFLOW_STEP.SENDING || operation.workflowStep === WORKFLOW_STEP.CREATING : stryMutAct_9fa48("134505") ? false : stryMutAct_9fa48("134504") ? true : (stryCov_9fa48("134504", "134505", "134506"), (stryMutAct_9fa48("134508") ? actualStatus !== ReplicaStatus.SYNCING : stryMutAct_9fa48("134507") ? true : (stryCov_9fa48("134507", "134508"), actualStatus === ReplicaStatus.SYNCING)) && (stryMutAct_9fa48("134510") ? (operation.workflowStep === WORKFLOW_STEP.PENDING || operation.workflowStep === WORKFLOW_STEP.SENDING) && operation.workflowStep === WORKFLOW_STEP.CREATING : stryMutAct_9fa48("134509") ? true : (stryCov_9fa48("134509", "134510"), (stryMutAct_9fa48("134512") ? operation.workflowStep === WORKFLOW_STEP.PENDING && operation.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("134511") ? false : (stryCov_9fa48("134511", "134512"), (stryMutAct_9fa48("134514") ? operation.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("134513") ? false : (stryCov_9fa48("134513", "134514"), operation.workflowStep === WORKFLOW_STEP.PENDING)) || (stryMutAct_9fa48("134516") ? operation.workflowStep !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("134515") ? false : (stryCov_9fa48("134515", "134516"), operation.workflowStep === WORKFLOW_STEP.SENDING)))) || (stryMutAct_9fa48("134518") ? operation.workflowStep !== WORKFLOW_STEP.CREATING : stryMutAct_9fa48("134517") ? false : (stryCov_9fa48("134517", "134518"), operation.workflowStep === WORKFLOW_STEP.CREATING)))))) {
        if (stryMutAct_9fa48("134519")) {
          {}
        } else {
          stryCov_9fa48("134519");
          await this.updateStep(operation, WORKFLOW_STEP.SYNCING);
          return stryMutAct_9fa48("134520") ? false : (stryCov_9fa48("134520"), true);
        }
      }
      if (stryMutAct_9fa48("134523") ? actualStatus !== ReplicaStatus.ACTIVE : stryMutAct_9fa48("134522") ? false : stryMutAct_9fa48("134521") ? true : (stryCov_9fa48("134521", "134522", "134523"), actualStatus === ReplicaStatus.ACTIVE)) {
        if (stryMutAct_9fa48("134524")) {
          {}
        } else {
          stryCov_9fa48("134524");
          if (stryMutAct_9fa48("134527") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("134526") ? false : stryMutAct_9fa48("134525") ? true : (stryCov_9fa48("134525", "134526", "134527"), operation.type === OperationType.REPLACE)) {
            if (stryMutAct_9fa48("134528")) {
              {}
            } else {
              stryCov_9fa48("134528");
              await this.reconcileReplaceActualActive(operation);
            }
          } else {
            if (stryMutAct_9fa48("134529")) {
              {}
            } else {
              stryCov_9fa48("134529");
              await this.completeOperation(operation);
            }
          }
          return stryMutAct_9fa48("134530") ? false : (stryCov_9fa48("134530"), true);
        }
      }
      if (stryMutAct_9fa48("134533") ? actualStatus !== ReplicaStatus.FAILED : stryMutAct_9fa48("134532") ? false : stryMutAct_9fa48("134531") ? true : (stryCov_9fa48("134531", "134532", "134533"), actualStatus === ReplicaStatus.FAILED)) {
        if (stryMutAct_9fa48("134534")) {
          {}
        } else {
          stryCov_9fa48("134534");
          await this.failOperation(operation, (stryMutAct_9fa48("134537") ? cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY || operation.workflowStep === WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("134536") ? false : stryMutAct_9fa48("134535") ? true : (stryCov_9fa48("134535", "134536", "134537"), (stryMutAct_9fa48("134539") ? cause !== OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY : stryMutAct_9fa48("134538") ? true : (stryCov_9fa48("134538", "134539"), cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY)) && (stryMutAct_9fa48("134541") ? operation.workflowStep !== WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("134540") ? true : (stryCov_9fa48("134540", "134541"), operation.workflowStep === WORKFLOW_STEP.SYNCING)))) ? OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_SYNC : OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_FAILED_DURING_OPERATION_RECONCILIATION);
          return stryMutAct_9fa48("134542") ? false : (stryCov_9fa48("134542"), true);
        }
      }
      if (stryMutAct_9fa48("134545") ? actualStatus === null && cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY || operation.workflowStep === WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("134544") ? false : stryMutAct_9fa48("134543") ? true : (stryCov_9fa48("134543", "134544", "134545"), (stryMutAct_9fa48("134547") ? actualStatus === null || cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY : stryMutAct_9fa48("134546") ? true : (stryCov_9fa48("134546", "134547"), (stryMutAct_9fa48("134549") ? actualStatus !== null : stryMutAct_9fa48("134548") ? true : (stryCov_9fa48("134548", "134549"), actualStatus === null)) && (stryMutAct_9fa48("134551") ? cause !== OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY : stryMutAct_9fa48("134550") ? true : (stryCov_9fa48("134550", "134551"), cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY)))) && (stryMutAct_9fa48("134553") ? operation.workflowStep !== WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("134552") ? true : (stryCov_9fa48("134552", "134553"), operation.workflowStep === WORKFLOW_STEP.SYNCING)))) {
        if (stryMutAct_9fa48("134554")) {
          {}
        } else {
          stryCov_9fa48("134554");
          await this.failOperation(operation, OPERATION_WORKFLOW_OWNER_LITERAL.REPLICA_NOT_FOUND_DURING_RECOVERY_RECONCILIATION);
          return stryMutAct_9fa48("134555") ? false : (stryCov_9fa48("134555"), true);
        }
      }
      if (stryMutAct_9fa48("134557") ? false : stryMutAct_9fa48("134556") ? true : (stryCov_9fa48("134556", "134557"), this.shouldRearmDispatchFromProgressReconcile(operation, actualStatus))) {
        if (stryMutAct_9fa48("134558")) {
          {}
        } else {
          stryCov_9fa48("134558");
          await this.executeOperationFromReconcilePath(operation);
          return stryMutAct_9fa48("134559") ? false : (stryCov_9fa48("134559"), true);
        }
      }
      return stryMutAct_9fa48("134560") ? true : (stryCov_9fa48("134560"), false);
    }
  }

  /**
   * Reconcile one in-flight operation through the canonical owner path.
   * Different wakeup causes share one progression implementation after the
   * owner queue is entered.
   * @param {Object} operation
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   * @private
   */
  async reconcileOperationLifecycle(operation, options = {}) {
    if (stryMutAct_9fa48("134561")) {
      {}
    } else {
      stryCov_9fa48("134561");
      if (stryMutAct_9fa48("134564") ? false : stryMutAct_9fa48("134563") ? true : stryMutAct_9fa48("134562") ? operation : (stryCov_9fa48("134562", "134563", "134564"), !operation)) {
        if (stryMutAct_9fa48("134565")) {
          {}
        } else {
          stryCov_9fa48("134565");
          return stryMutAct_9fa48("134566") ? true : (stryCov_9fa48("134566"), false);
        }
      }
      if (stryMutAct_9fa48("134569") ? false : stryMutAct_9fa48("134568") ? true : stryMutAct_9fa48("134567") ? this.repository.isOperationLocallyOwned(operation) : (stryCov_9fa48("134567", "134568", "134569"), !this.repository.isOperationLocallyOwned(operation))) {
        if (stryMutAct_9fa48("134570")) {
          {}
        } else {
          stryCov_9fa48("134570");
          return stryMutAct_9fa48("134571") ? true : (stryCov_9fa48("134571"), false);
        }
      }
      const cause = stryMutAct_9fa48("134574") ? options.cause && 'progress' : stryMutAct_9fa48("134573") ? false : stryMutAct_9fa48("134572") ? true : (stryCov_9fa48("134572", "134573", "134574"), options.cause || (stryMutAct_9fa48("134575") ? "" : (stryCov_9fa48("134575"), 'progress')));
      const lifecycleAction = this.resolveOperationLifecycleAction(operation, cause);
      switch (lifecycleAction) {
        case OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY:
          if (stryMutAct_9fa48("134576")) {} else {
            stryCov_9fa48("134576");
            await this.failOperation(operation, OPERATION_WORKFLOW_OWNER_LITERAL.NODE_RECOVERY_DASH_INCOMPLETE_OPERATION);
            this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED, stryMutAct_9fa48("134577") ? {} : (stryCov_9fa48("134577"), {
              operationId: operation.operationId,
              workflowStep: operation.workflowStep,
              partitionId: operation.partitionId
            }));
            return stryMutAct_9fa48("134578") ? false : (stryCov_9fa48("134578"), true);
          }
        case OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY:
          if (stryMutAct_9fa48("134579")) {} else {
            stryCov_9fa48("134579");
            await this.failOperation(operation, OPERATION_WORKFLOW_OWNER_LITERAL.NODE_RECOVERY_DASH_INCOMPLETE_REMOVAL_OPERATION);
            this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_REMOVE_FAILED, stryMutAct_9fa48("134580") ? {} : (stryCov_9fa48("134580"), {
              operationId: operation.operationId,
              workflowStep: operation.workflowStep,
              partitionId: operation.partitionId
            }));
            return stryMutAct_9fa48("134581") ? false : (stryCov_9fa48("134581"), true);
          }
        case OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE:
        case OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH:
          if (stryMutAct_9fa48("134582")) {} else {
            stryCov_9fa48("134582");
            await this.executeOperationFromReconcilePath(operation);
            return stryMutAct_9fa48("134583") ? false : (stryCov_9fa48("134583"), true);
          }
        case OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING:
          if (stryMutAct_9fa48("134584")) {} else {
            stryCov_9fa48("134584");
            return this.reconcileStoppingOperationProgress(operation);
          }
        case OPERATION_LIFECYCLE_ACTION.NOOP:
          if (stryMutAct_9fa48("134585")) {} else {
            stryCov_9fa48("134585");
            return stryMutAct_9fa48("134586") ? true : (stryCov_9fa48("134586"), false);
          }
        case OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS:
        default:
          if (stryMutAct_9fa48("134587")) {} else {
            stryCov_9fa48("134587");
            break;
          }
      }
      const actualStatus = await this.getReconciledReplicaStatus(operation.replicaId, operation.partitionId, operation.targetNodeId);
      if (stryMutAct_9fa48("134590") ? cause !== OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY : stryMutAct_9fa48("134589") ? false : stryMutAct_9fa48("134588") ? true : (stryCov_9fa48("134588", "134589", "134590"), cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY)) {
        if (stryMutAct_9fa48("134591")) {
          {}
        } else {
          stryCov_9fa48("134591");
          this.repository.emitReplicaStatusDivergence(operation.replicaId, actualStatus, SQL_RECONCILIATION_REASON.RECOVERY_REPLICA_STATUS);
        }
      }
      return this.applyReconciledReplicaStatus(operation, actualStatus, stryMutAct_9fa48("134592") ? {} : (stryCov_9fa48("134592"), {
        cause
      }));
    }
  }

  /**
   * Reconcile one in-flight operation against observed replica state.
   * @param {Object} operation
   * @param {Object} [options={}]
   * @return {Promise<boolean>}
   */
  async reconcileOperationProgress(operation, options = {}) {
    if (stryMutAct_9fa48("134593")) {
      {}
    } else {
      stryCov_9fa48("134593");
      return this.reconcileOperationLifecycle(operation, options);
    }
  }

  /**
   * @param {string} step
   * @return {number}
   */
  getTimeoutForStep(step, operation = null) {
    if (stryMutAct_9fa48("134594")) {
      {}
    } else {
      stryCov_9fa48("134594");
      switch (step) {
        case WORKFLOW_STEP.PENDING:
        case WORKFLOW_STEP.SENDING:
          if (stryMutAct_9fa48("134595")) {} else {
            stryCov_9fa48("134595");
            return this.config.pendingTimeoutMs;
          }
        case WORKFLOW_STEP.CREATING:
          if (stryMutAct_9fa48("134596")) {} else {
            stryCov_9fa48("134596");
            return this.config.creatingTimeoutMs;
          }
        case WORKFLOW_STEP.SYNCING:
          if (stryMutAct_9fa48("134597")) {} else {
            stryCov_9fa48("134597");
            {
              if (stryMutAct_9fa48("134598")) {
                {}
              } else {
                stryCov_9fa48("134598");
                const configuredTimeout = this.config.syncingTimeoutMs;
                const partitionId = stryMutAct_9fa48("134601") ? operation?.partitionId && null : stryMutAct_9fa48("134600") ? false : stryMutAct_9fa48("134599") ? true : (stryCov_9fa48("134599", "134600", "134601"), (stryMutAct_9fa48("134602") ? operation.partitionId : (stryCov_9fa48("134602"), operation?.partitionId)) || null);
                if (stryMutAct_9fa48("134605") ? false : stryMutAct_9fa48("134604") ? true : stryMutAct_9fa48("134603") ? isPriorityControlPlanePartition({
                  partitionId
                }) : (stryCov_9fa48("134603", "134604", "134605"), !isPriorityControlPlanePartition(stryMutAct_9fa48("134606") ? {} : (stryCov_9fa48("134606"), {
                  partitionId
                })))) {
                  if (stryMutAct_9fa48("134607")) {
                    {}
                  } else {
                    stryCov_9fa48("134607");
                    return configuredTimeout;
                  }
                }
                return stryMutAct_9fa48("134608") ? Math.min(TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS, Math.min(configuredTimeout, PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS)) : (stryCov_9fa48("134608"), Math.max(TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS, stryMutAct_9fa48("134609") ? Math.max(configuredTimeout, PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS) : (stryCov_9fa48("134609"), Math.min(configuredTimeout, PRIORITY_CONTROL_PLANE_SYNCING_TIMEOUT_CAP_MS))));
              }
            }
          }
        case WORKFLOW_STEP.STOPPING:
          if (stryMutAct_9fa48("134610")) {} else {
            stryCov_9fa48("134610");
            return this.config.removingTimeoutMs;
          }
        default:
          if (stryMutAct_9fa48("134611")) {} else {
            stryCov_9fa48("134611");
            return this.config.pendingTimeoutMs;
          }
      }
    }
  }

  /**
   * Per-operation timeout/progress reconciliation.
   * Called after reconcileOperationProgress returns false.
   * @param {Object} operation
   * @param {number} now
   * @return {Promise<void>}
   */
  async reconcileTimeoutOperation(operation, now) {
    if (stryMutAct_9fa48("134612")) {
      {}
    } else {
      stryCov_9fa48("134612");
      if (stryMutAct_9fa48("134614") ? false : stryMutAct_9fa48("134613") ? true : (stryCov_9fa48("134613", "134614"), this.hasActiveTransitionRetryGrace(stryMutAct_9fa48("134617") ? operation?.operationId && null : stryMutAct_9fa48("134616") ? false : stryMutAct_9fa48("134615") ? true : (stryCov_9fa48("134615", "134616", "134617"), (stryMutAct_9fa48("134618") ? operation.operationId : (stryCov_9fa48("134618"), operation?.operationId)) || null), now))) {
        if (stryMutAct_9fa48("134619")) {
          {}
        } else {
          stryCov_9fa48("134619");
          return;
        }
      }
      const progressed = await this.reconcileOperationProgress(operation, stryMutAct_9fa48("134620") ? {} : (stryCov_9fa48("134620"), {
        cause: stryMutAct_9fa48("134621") ? "" : (stryCov_9fa48("134621"), 'timeout')
      }));
      if (stryMutAct_9fa48("134623") ? false : stryMutAct_9fa48("134622") ? true : (stryCov_9fa48("134622", "134623"), progressed)) {
        if (stryMutAct_9fa48("134624")) {
          {}
        } else {
          stryCov_9fa48("134624");
          return;
        }
      }
      const operationBudget = createTopLevelOperationBudget(stryMutAct_9fa48("134625") ? {} : (stryCov_9fa48("134625"), {
        configuredBudgetMs: TIMEOUT_BUDGET_DEFAULT.REBALANCE_OPERATION_BUDGET_MS,
        operationName: stryMutAct_9fa48("134626") ? "" : (stryCov_9fa48("134626"), 'rebalance'),
        startedAtMs: stryMutAct_9fa48("134629") ? operation.createdAt && operation.updatedAt : stryMutAct_9fa48("134628") ? false : stryMutAct_9fa48("134627") ? true : (stryCov_9fa48("134627", "134628", "134629"), operation.createdAt || operation.updatedAt),
        now: stryMutAct_9fa48("134630") ? () => undefined : (stryCov_9fa48("134630"), () => now)
      }));
      const stepTimeout = this.getTimeoutForStep(operation.workflowStep, operation);
      const stepAllocation = createChildTimeoutBudget(operationBudget, stryMutAct_9fa48("134631") ? {} : (stryCov_9fa48("134631"), {
        requestedBudgetMs: stepTimeout,
        minimumBudgetMs: TIMEOUT_BUDGET_DEFAULT.MINIMUM_OPERATION_BUDGET_MS,
        classification: TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
        nestedOperation: stryMutAct_9fa48("134632") ? `` : (stryCov_9fa48("134632"), `rebalance:${stryMutAct_9fa48("134633") ? String(operation.workflowStep || 'unknown').toUpperCase() : (stryCov_9fa48("134633"), String(stryMutAct_9fa48("134636") ? operation.workflowStep && 'unknown' : stryMutAct_9fa48("134635") ? false : stryMutAct_9fa48("134634") ? true : (stryCov_9fa48("134634", "134635", "134636"), operation.workflowStep || (stryMutAct_9fa48("134637") ? "" : (stryCov_9fa48("134637"), 'unknown')))).toLowerCase())}`),
        now: stryMutAct_9fa48("134638") ? () => undefined : (stryCov_9fa48("134638"), () => now)
      }));
      const elapsed = stryMutAct_9fa48("134639") ? now + operation.updatedAt : (stryCov_9fa48("134639"), now - operation.updatedAt);
      const stepExceeded = stryMutAct_9fa48("134643") ? elapsed < stepTimeout : stryMutAct_9fa48("134642") ? elapsed > stepTimeout : stryMutAct_9fa48("134641") ? false : stryMutAct_9fa48("134640") ? true : (stryCov_9fa48("134640", "134641", "134642", "134643"), elapsed >= stepTimeout);
      const budgetExhausted = stryMutAct_9fa48("134644") ? stepAllocation.allowed : (stryCov_9fa48("134644"), !stepAllocation.allowed);
      if (stryMutAct_9fa48("134647") ? stepExceeded && budgetExhausted : stryMutAct_9fa48("134646") ? false : stryMutAct_9fa48("134645") ? true : (stryCov_9fa48("134645", "134646", "134647"), stepExceeded || budgetExhausted)) {
        if (stryMutAct_9fa48("134648")) {
          {}
        } else {
          stryCov_9fa48("134648");
          const timeoutClassification = budgetExhausted ? stepAllocation.timeoutClassification : buildTimeoutClassification(stryMutAct_9fa48("134649") ? {} : (stryCov_9fa48("134649"), {
            budget: operationBudget,
            classification: TIMEOUT_BUDGET_CLASSIFICATION.REBALANCE_OPERATION_TIMEOUT,
            nestedOperation: stryMutAct_9fa48("134650") ? `` : (stryCov_9fa48("134650"), `rebalance:${stryMutAct_9fa48("134651") ? String(operation.workflowStep || 'unknown').toUpperCase() : (stryCov_9fa48("134651"), String(stryMutAct_9fa48("134654") ? operation.workflowStep && 'unknown' : stryMutAct_9fa48("134653") ? false : stryMutAct_9fa48("134652") ? true : (stryCov_9fa48("134652", "134653", "134654"), operation.workflowStep || (stryMutAct_9fa48("134655") ? "" : (stryCov_9fa48("134655"), 'unknown')))).toLowerCase())}`),
            now: stryMutAct_9fa48("134656") ? () => undefined : (stryCov_9fa48("134656"), () => now)
          }));
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_TIMED_OUT, stryMutAct_9fa48("134657") ? {} : (stryCov_9fa48("134657"), {
            operationId: operation.operationId,
            workflowStep: operation.workflowStep,
            elapsed,
            timeout: stepTimeout,
            budgetExhausted,
            timeoutClassification
          }));
          await this.failOperation(operation, (stryMutAct_9fa48("134658") ? `` : (stryCov_9fa48("134658"), `Timeout in ${operation.workflowStep} step `)) + (stryMutAct_9fa48("134659") ? `` : (stryCov_9fa48("134659"), `after ${elapsed}ms`)), stryMutAct_9fa48("134660") ? {} : (stryCov_9fa48("134660"), {
            stepMetadata: stryMutAct_9fa48("134661") ? {} : (stryCov_9fa48("134661"), {
              timeoutClassification,
              timeoutMs: stepTimeout,
              elapsedMs: elapsed,
              timedOutAtMs: now,
              budgetExhausted
            })
          }));
          stryMutAct_9fa48("134662") ? this.stats.operationsTimedOut-- : (stryCov_9fa48("134662"), this.stats.operationsTimedOut++);
        }
      }
    }
  }

  /**
   * Check for timed out operations.
   * @return {Promise<void>}
   */
  async checkTimeouts() {
    if (stryMutAct_9fa48("134663")) {
      {}
    } else {
      stryCov_9fa48("134663");
      if (stryMutAct_9fa48("134666") ? this.isShuttingDown && !this.isInitialized : stryMutAct_9fa48("134665") ? false : stryMutAct_9fa48("134664") ? true : (stryCov_9fa48("134664", "134665", "134666"), this.isShuttingDown || (stryMutAct_9fa48("134667") ? this.isInitialized : (stryCov_9fa48("134667"), !this.isInitialized)))) {
        if (stryMutAct_9fa48("134668")) {
          {}
        } else {
          stryCov_9fa48("134668");
          return;
        }
      }
      const now = Date.now();
      if (stryMutAct_9fa48("134671") ? this.lastEmptyIncompleteOperationQueryAtMs > NUM.ZERO || now - this.lastEmptyIncompleteOperationQueryAtMs < this.incompleteOperationQueryEmptyBackoffMs : stryMutAct_9fa48("134670") ? false : stryMutAct_9fa48("134669") ? true : (stryCov_9fa48("134669", "134670", "134671"), (stryMutAct_9fa48("134674") ? this.lastEmptyIncompleteOperationQueryAtMs <= NUM.ZERO : stryMutAct_9fa48("134673") ? this.lastEmptyIncompleteOperationQueryAtMs >= NUM.ZERO : stryMutAct_9fa48("134672") ? true : (stryCov_9fa48("134672", "134673", "134674"), this.lastEmptyIncompleteOperationQueryAtMs > NUM.ZERO)) && (stryMutAct_9fa48("134677") ? now - this.lastEmptyIncompleteOperationQueryAtMs >= this.incompleteOperationQueryEmptyBackoffMs : stryMutAct_9fa48("134676") ? now - this.lastEmptyIncompleteOperationQueryAtMs <= this.incompleteOperationQueryEmptyBackoffMs : stryMutAct_9fa48("134675") ? true : (stryCov_9fa48("134675", "134676", "134677"), (stryMutAct_9fa48("134678") ? now + this.lastEmptyIncompleteOperationQueryAtMs : (stryCov_9fa48("134678"), now - this.lastEmptyIncompleteOperationQueryAtMs)) < this.incompleteOperationQueryEmptyBackoffMs)))) {
        if (stryMutAct_9fa48("134679")) {
          {}
        } else {
          stryCov_9fa48("134679");
          return;
        }
      }
      const canUseCacheObservationBoundary = this.repository.hasReplicaOperationCacheObservationBoundary();
      const cachedIncompleteOps = canUseCacheObservationBoundary ? await this.repository.queryCachedIncompleteOperations() : stryMutAct_9fa48("134680") ? ["Stryker was here"] : (stryCov_9fa48("134680"), []);
      if (stryMutAct_9fa48("134684") ? cachedIncompleteOps.length <= NUM.ZERO : stryMutAct_9fa48("134683") ? cachedIncompleteOps.length >= NUM.ZERO : stryMutAct_9fa48("134682") ? false : stryMutAct_9fa48("134681") ? true : (stryCov_9fa48("134681", "134682", "134683", "134684"), cachedIncompleteOps.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("134685")) {
          {}
        } else {
          stryCov_9fa48("134685");
          this.clearEmptyIncompleteOperationQueryDelay();
        }
      } else if (stryMutAct_9fa48("134688") ? canUseCacheObservationBoundary || this.shouldDelayEmptyIncompleteOperationQuery(now) : stryMutAct_9fa48("134687") ? false : stryMutAct_9fa48("134686") ? true : (stryCov_9fa48("134686", "134687", "134688"), canUseCacheObservationBoundary && this.shouldDelayEmptyIncompleteOperationQuery(now))) {
        if (stryMutAct_9fa48("134689")) {
          {}
        } else {
          stryCov_9fa48("134689");
          return;
        }
      }
      const incompleteOps = (stryMutAct_9fa48("134693") ? cachedIncompleteOps.length <= NUM.ZERO : stryMutAct_9fa48("134692") ? cachedIncompleteOps.length >= NUM.ZERO : stryMutAct_9fa48("134691") ? false : stryMutAct_9fa48("134690") ? true : (stryCov_9fa48("134690", "134691", "134692", "134693"), cachedIncompleteOps.length > NUM.ZERO)) ? this.mergeIncompleteOperations(cachedIncompleteOps, await this.repository.queryIncompleteOperations(stryMutAct_9fa48("134694") ? {} : (stryCov_9fa48("134694"), {
        preferAuthoritativeRead: stryMutAct_9fa48("134695") ? false : (stryCov_9fa48("134695"), true)
      }))) : await this.repository.queryIncompleteOperations();
      if (stryMutAct_9fa48("134698") ? incompleteOps.length !== NUM.ZERO : stryMutAct_9fa48("134697") ? false : stryMutAct_9fa48("134696") ? true : (stryCov_9fa48("134696", "134697", "134698"), incompleteOps.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("134699")) {
          {}
        } else {
          stryCov_9fa48("134699");
          this.lastEmptyIncompleteOperationQueryAtMs = now;
          return;
        }
      }
      this.clearEmptyIncompleteOperationQueryDelay();
      const timeoutReconcileTasks = stryMutAct_9fa48("134700") ? ["Stryker was here"] : (stryCov_9fa48("134700"), []);
      for (const operation of incompleteOps) {
        if (stryMutAct_9fa48("134701")) {
          {}
        } else {
          stryCov_9fa48("134701");
          if (stryMutAct_9fa48("134704") ? false : stryMutAct_9fa48("134703") ? true : stryMutAct_9fa48("134702") ? this.repository.isOperationLocallyOwned(operation) : (stryCov_9fa48("134702", "134703", "134704"), !this.repository.isOperationLocallyOwned(operation))) {
            if (stryMutAct_9fa48("134705")) {
              {}
            } else {
              stryCov_9fa48("134705");
              continue;
            }
          }
          if (stryMutAct_9fa48("134707") ? false : stryMutAct_9fa48("134706") ? true : (stryCov_9fa48("134706", "134707"), this.repository.isOperationTerminal(operation))) {
            if (stryMutAct_9fa48("134708")) {
              {}
            } else {
              stryCov_9fa48("134708");
              continue;
            }
          }
          const singleFlightKey = this.getOperationOwnerSingleFlightKey(operation.operationId);
          const reconcileTask = this.operationWorkflowRunExclusive(singleFlightKey, async () => {
            if (stryMutAct_9fa48("134709")) {
              {}
            } else {
              stryCov_9fa48("134709");
              const authoritativeOperation = await this.repository.queryAuthoritativeOperationById(operation.operationId, stryMutAct_9fa48("134710") ? {} : (stryCov_9fa48("134710"), {
                requireOwnerRpcRead: stryMutAct_9fa48("134711") ? true : (stryCov_9fa48("134711"), false)
              }));
              const timeoutOperation = stryMutAct_9fa48("134714") ? authoritativeOperation && operation : stryMutAct_9fa48("134713") ? false : stryMutAct_9fa48("134712") ? true : (stryCov_9fa48("134712", "134713", "134714"), authoritativeOperation || operation);
              if (stryMutAct_9fa48("134717") ? false : stryMutAct_9fa48("134716") ? true : stryMutAct_9fa48("134715") ? this.repository.isOperationLocallyOwned(timeoutOperation) : (stryCov_9fa48("134715", "134716", "134717"), !this.repository.isOperationLocallyOwned(timeoutOperation))) {
                if (stryMutAct_9fa48("134718")) {
                  {}
                } else {
                  stryCov_9fa48("134718");
                  return;
                }
              }
              if (stryMutAct_9fa48("134720") ? false : stryMutAct_9fa48("134719") ? true : (stryCov_9fa48("134719", "134720"), this.repository.isOperationTerminal(timeoutOperation))) {
                if (stryMutAct_9fa48("134721")) {
                  {}
                } else {
                  stryCov_9fa48("134721");
                  return;
                }
              }
              await this.reconcileTimeoutOperation(timeoutOperation, Date.now());
            }
          }).catch(error => {
            if (stryMutAct_9fa48("134722")) {
              {}
            } else {
              stryCov_9fa48("134722");
              if (stryMutAct_9fa48("134724") ? false : stryMutAct_9fa48("134723") ? true : (stryCov_9fa48("134723", "134724"), this.deferTransitionRetry(operation.operationId, error, stryMutAct_9fa48("134725") ? {} : (stryCov_9fa48("134725"), {
                boundary: stryMutAct_9fa48("134726") ? "" : (stryCov_9fa48("134726"), 'timeout_reconcile'),
                workflowStep: stryMutAct_9fa48("134729") ? operation?.workflowStep && null : stryMutAct_9fa48("134728") ? false : stryMutAct_9fa48("134727") ? true : (stryCov_9fa48("134727", "134728", "134729"), (stryMutAct_9fa48("134730") ? operation.workflowStep : (stryCov_9fa48("134730"), operation?.workflowStep)) || null),
                partitionId: stryMutAct_9fa48("134733") ? operation?.partitionId && null : stryMutAct_9fa48("134732") ? false : stryMutAct_9fa48("134731") ? true : (stryCov_9fa48("134731", "134732", "134733"), (stryMutAct_9fa48("134734") ? operation.partitionId : (stryCov_9fa48("134734"), operation?.partitionId)) || null)
              })))) {
                if (stryMutAct_9fa48("134735")) {
                  {}
                } else {
                  stryCov_9fa48("134735");
                  return;
                }
              }
              this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.QUERY_OPERATIONS_FAILED, stryMutAct_9fa48("134736") ? {} : (stryCov_9fa48("134736"), {
                operationId: operation.operationId,
                error: error.message,
                nodeId: this.nodeId
              }));
            }
          });
          timeoutReconcileTasks.push(reconcileTask);
        }
      }
      if (stryMutAct_9fa48("134740") ? timeoutReconcileTasks.length <= NUM.ZERO : stryMutAct_9fa48("134739") ? timeoutReconcileTasks.length >= NUM.ZERO : stryMutAct_9fa48("134738") ? false : stryMutAct_9fa48("134737") ? true : (stryCov_9fa48("134737", "134738", "134739", "134740"), timeoutReconcileTasks.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("134741")) {
          {}
        } else {
          stryCov_9fa48("134741");
          await Promise.all(timeoutReconcileTasks);
        }
      }

      // Periodic reservation reconciliation (Req 4.4)
      await this.reconcileReservations().catch(error => {
        if (stryMutAct_9fa48("134742")) {
          {}
        } else {
          stryCov_9fa48("134742");
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.RESERVATION_RELEASE_FAILED, stryMutAct_9fa48("134743") ? {} : (stryCov_9fa48("134743"), {
            error: error.message
          }));
        }
      });
    }
  }

  // --- Executor outcome routing ---

  /**
   * Handle an executor outcome event.
   * @param {Object} outcome
   */
  handleExecutorOutcome(outcome) {
    if (stryMutAct_9fa48("134744")) {
      {}
    } else {
      stryCov_9fa48("134744");
      if (stryMutAct_9fa48("134747") ? this.isShuttingDown && !this.isInitialized : stryMutAct_9fa48("134746") ? false : stryMutAct_9fa48("134745") ? true : (stryCov_9fa48("134745", "134746", "134747"), this.isShuttingDown || (stryMutAct_9fa48("134748") ? this.isInitialized : (stryCov_9fa48("134748"), !this.isInitialized)))) {
        if (stryMutAct_9fa48("134749")) {
          {}
        } else {
          stryCov_9fa48("134749");
          return;
        }
      }
      const operationId = stryMutAct_9fa48("134750") ? outcome[EXECUTOR_OUTCOME_FIELD.OPERATION_ID] : (stryCov_9fa48("134750"), outcome?.[EXECUTOR_OUTCOME_FIELD.OPERATION_ID]);
      if (stryMutAct_9fa48("134753") ? false : stryMutAct_9fa48("134752") ? true : stryMutAct_9fa48("134751") ? operationId : (stryCov_9fa48("134751", "134752", "134753"), !operationId)) {
        if (stryMutAct_9fa48("134754")) {
          {}
        } else {
          stryCov_9fa48("134754");
          return;
        }
      }
      const singleFlightKey = this.getOperationOwnerSingleFlightKey(operationId);
      this.operationWorkflowRunExclusive(singleFlightKey, stryMutAct_9fa48("134755") ? () => undefined : (stryCov_9fa48("134755"), () => this.reconcileExecutorOutcome(outcome))).catch(error => {
        if (stryMutAct_9fa48("134756")) {
          {}
        } else {
          stryCov_9fa48("134756");
          if (stryMutAct_9fa48("134758") ? false : stryMutAct_9fa48("134757") ? true : (stryCov_9fa48("134757", "134758"), this.deferTransitionRetry(operationId, error, stryMutAct_9fa48("134759") ? {} : (stryCov_9fa48("134759"), {
            boundary: OPERATION_WORKFLOW_OWNER_LITERAL.EXECUTOR_OUTCOME,
            workflowStep: stryMutAct_9fa48("134762") ? outcome?.[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP] && null : stryMutAct_9fa48("134761") ? false : stryMutAct_9fa48("134760") ? true : (stryCov_9fa48("134760", "134761", "134762"), (stryMutAct_9fa48("134763") ? outcome[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP] : (stryCov_9fa48("134763"), outcome?.[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP])) || null),
            partitionId: null
          })))) {
            if (stryMutAct_9fa48("134764")) {
              {}
            } else {
              stryCov_9fa48("134764");
              return;
            }
          }
          this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_TRANSITION_FAILED, stryMutAct_9fa48("134765") ? {} : (stryCov_9fa48("134765"), {
            operationId,
            outcomeType: stryMutAct_9fa48("134766") ? outcome[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE] : (stryCov_9fa48("134766"), outcome?.[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]),
            error: error.message
          }));
        }
      });
    }
  }

  /**
   * Reconcile a single executor outcome.
   * @param {Object} outcome
   * @return {Promise<boolean>}
   */
  async reconcileExecutorOutcome(outcome) {
    if (stryMutAct_9fa48("134767")) {
      {}
    } else {
      stryCov_9fa48("134767");
      const operationId = outcome[EXECUTOR_OUTCOME_FIELD.OPERATION_ID];
      const outcomeType = outcome[EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE];
      const workflowStep = outcome[EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP];
      const errorMessage = outcome[EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE];
      this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_RECEIVED, stryMutAct_9fa48("134768") ? {} : (stryCov_9fa48("134768"), {
        operationId,
        outcomeType,
        workflowStep
      }));
      const operation = await this.repository.queryOperationById(operationId);
      if (stryMutAct_9fa48("134771") ? false : stryMutAct_9fa48("134770") ? true : stryMutAct_9fa48("134769") ? operation : (stryCov_9fa48("134769", "134770", "134771"), !operation)) {
        if (stryMutAct_9fa48("134772")) {
          {}
        } else {
          stryCov_9fa48("134772");
          this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_FOUND, stryMutAct_9fa48("134773") ? {} : (stryCov_9fa48("134773"), {
            operationId,
            outcomeType
          }));
          return stryMutAct_9fa48("134774") ? true : (stryCov_9fa48("134774"), false);
        }
      }
      if (stryMutAct_9fa48("134776") ? false : stryMutAct_9fa48("134775") ? true : (stryCov_9fa48("134775", "134776"), this.repository.isOperationTerminal(operation))) {
        if (stryMutAct_9fa48("134777")) {
          {}
        } else {
          stryCov_9fa48("134777");
          this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_TERMINAL, stryMutAct_9fa48("134778") ? {} : (stryCov_9fa48("134778"), {
            operationId,
            outcomeType,
            step: operation.workflowStep
          }));
          return stryMutAct_9fa48("134779") ? true : (stryCov_9fa48("134779"), false);
        }
      }
      if (stryMutAct_9fa48("134782") ? false : stryMutAct_9fa48("134781") ? true : stryMutAct_9fa48("134780") ? this.repository.isOperationLocallyOwned(operation) : (stryCov_9fa48("134780", "134781", "134782"), !this.repository.isOperationLocallyOwned(operation))) {
        if (stryMutAct_9fa48("134783")) {
          {}
        } else {
          stryCov_9fa48("134783");
          this.logger.debug(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_OPERATION_NOT_LOCAL, stryMutAct_9fa48("134784") ? {} : (stryCov_9fa48("134784"), {
            operationId,
            outcomeType
          }));
          return stryMutAct_9fa48("134785") ? true : (stryCov_9fa48("134785"), false);
        }
      }
      const mapping = EXECUTOR_OUTCOME_ACTION_MAP[outcomeType];
      if (stryMutAct_9fa48("134788") ? false : stryMutAct_9fa48("134787") ? true : stryMutAct_9fa48("134786") ? mapping : (stryCov_9fa48("134786", "134787", "134788"), !mapping)) {
        if (stryMutAct_9fa48("134789")) {
          {}
        } else {
          stryCov_9fa48("134789");
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_UNKNOWN_ACTION, stryMutAct_9fa48("134790") ? {} : (stryCov_9fa48("134790"), {
            operationId,
            outcomeType
          }));
          return stryMutAct_9fa48("134791") ? true : (stryCov_9fa48("134791"), false);
        }
      }
      if (stryMutAct_9fa48("134794") ? mapping.action !== EXECUTOR_OUTCOME_ACTION.UPDATE_STEP : stryMutAct_9fa48("134793") ? false : stryMutAct_9fa48("134792") ? true : (stryCov_9fa48("134792", "134793", "134794"), mapping.action === EXECUTOR_OUTCOME_ACTION.UPDATE_STEP)) {
        if (stryMutAct_9fa48("134795")) {
          {}
        } else {
          stryCov_9fa48("134795");
          await this.updateStep(operation, workflowStep, OPERATION_TRANSITION_REASON.EXECUTOR_OUTCOME);
        }
      } else if (stryMutAct_9fa48("134798") ? mapping.action !== EXECUTOR_OUTCOME_ACTION.COMPLETE : stryMutAct_9fa48("134797") ? false : stryMutAct_9fa48("134796") ? true : (stryCov_9fa48("134796", "134797", "134798"), mapping.action === EXECUTOR_OUTCOME_ACTION.COMPLETE)) {
        if (stryMutAct_9fa48("134799")) {
          {}
        } else {
          stryCov_9fa48("134799");
          await this.completeOperation(operation);
        }
      } else if (stryMutAct_9fa48("134802") ? mapping.action !== EXECUTOR_OUTCOME_ACTION.FAIL : stryMutAct_9fa48("134801") ? false : stryMutAct_9fa48("134800") ? true : (stryCov_9fa48("134800", "134801", "134802"), mapping.action === EXECUTOR_OUTCOME_ACTION.FAIL)) {
        if (stryMutAct_9fa48("134803")) {
          {}
        } else {
          stryCov_9fa48("134803");
          await this.failOperation(operation, stryMutAct_9fa48("134806") ? errorMessage && outcomeType : stryMutAct_9fa48("134805") ? false : stryMutAct_9fa48("134804") ? true : (stryCov_9fa48("134804", "134805", "134806"), errorMessage || outcomeType));
        }
      } else {
        if (stryMutAct_9fa48("134807")) {
          {}
        } else {
          stryCov_9fa48("134807");
          this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OUTCOME_UNKNOWN_ACTION, stryMutAct_9fa48("134808") ? {} : (stryCov_9fa48("134808"), {
            operationId,
            outcomeType,
            action: mapping.action
          }));
          return stryMutAct_9fa48("134809") ? true : (stryCov_9fa48("134809"), false);
        }
      }
      this.emitter.emit(REBALANCE_COORDINATOR_EVENT.OUTCOME_ROUTED, stryMutAct_9fa48("134810") ? {} : (stryCov_9fa48("134810"), {
        operationId,
        outcomeType,
        action: mapping.action
      }));
      return stryMutAct_9fa48("134811") ? false : (stryCov_9fa48("134811"), true);
    }
  }

  // --- Recovery ---

  /**
   * @param {string} step
   * @return {boolean}
   */
  isPreSyncStep(step) {
    if (stryMutAct_9fa48("134812")) {
      {}
    } else {
      stryCov_9fa48("134812");
      return (stryMutAct_9fa48("134813") ? [] : (stryCov_9fa48("134813"), [WORKFLOW_STEP.PENDING, WORKFLOW_STEP.SENDING, WORKFLOW_STEP.CREATING])).includes(step);
    }
  }

  /**
   * Resolve the next legal lifecycle action for one locally owned operation.
   * Multiple wake causes can feed the owner, but they should all reduce to one
   * explicit action model.
   *
   * @param {Object} operation
   * @param {string} [cause='progress']
   * @return {string}
   * @private
   */
  resolveOperationLifecycleAction(operation, cause = OPERATION_WORKFLOW_OWNER_LITERAL.PROGRESS) {
    if (stryMutAct_9fa48("134814")) {
      {}
    } else {
      stryCov_9fa48("134814");
      if (stryMutAct_9fa48("134817") ? cause !== OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY : stryMutAct_9fa48("134816") ? false : stryMutAct_9fa48("134815") ? true : (stryCov_9fa48("134815", "134816", "134817"), cause === OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY)) {
        if (stryMutAct_9fa48("134818")) {
          {}
        } else {
          stryCov_9fa48("134818");
          if (stryMutAct_9fa48("134820") ? false : stryMutAct_9fa48("134819") ? true : (stryCov_9fa48("134819", "134820"), this.isPreSyncStep(operation.workflowStep))) {
            if (stryMutAct_9fa48("134821")) {
              {}
            } else {
              stryCov_9fa48("134821");
              return OPERATION_LIFECYCLE_ACTION.FAIL_PRE_SYNC_RECOVERY;
            }
          }
          if (stryMutAct_9fa48("134824") ? operation.workflowStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("134823") ? false : stryMutAct_9fa48("134822") ? true : (stryCov_9fa48("134822", "134823", "134824"), operation.workflowStep === WORKFLOW_STEP.STOPPING)) {
            if (stryMutAct_9fa48("134825")) {
              {}
            } else {
              stryCov_9fa48("134825");
              return OPERATION_LIFECYCLE_ACTION.FAIL_STOPPING_RECOVERY;
            }
          }
        }
      }
      if (stryMutAct_9fa48("134828") ? operation.type === OperationType.REPLACE || operation.workflowStep === WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("134827") ? false : stryMutAct_9fa48("134826") ? true : (stryCov_9fa48("134826", "134827", "134828"), (stryMutAct_9fa48("134830") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("134829") ? true : (stryCov_9fa48("134829", "134830"), operation.type === OperationType.REPLACE)) && (stryMutAct_9fa48("134832") ? operation.workflowStep !== WORKFLOW_STEP.ACTIVE : stryMutAct_9fa48("134831") ? true : (stryCov_9fa48("134831", "134832"), operation.workflowStep === WORKFLOW_STEP.ACTIVE)))) {
        if (stryMutAct_9fa48("134833")) {
          {}
        } else {
          stryCov_9fa48("134833");
          return OPERATION_LIFECYCLE_ACTION.EXECUTE_ACTIVE_REPLACE;
        }
      }
      if (stryMutAct_9fa48("134835") ? false : stryMutAct_9fa48("134834") ? true : (stryCov_9fa48("134834", "134835"), this.isRemoveInitialDispatchPhase(operation))) {
        if (stryMutAct_9fa48("134836")) {
          {}
        } else {
          stryCov_9fa48("134836");
          return OPERATION_LIFECYCLE_ACTION.EXECUTE_REMOVE_DISPATCH;
        }
      }
      if (stryMutAct_9fa48("134839") ? operation.workflowStep === WORKFLOW_STEP.STOPPING || operation.type === OperationType.REMOVE || operation.type === OperationType.REPLACE : stryMutAct_9fa48("134838") ? false : stryMutAct_9fa48("134837") ? true : (stryCov_9fa48("134837", "134838", "134839"), (stryMutAct_9fa48("134841") ? operation.workflowStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("134840") ? true : (stryCov_9fa48("134840", "134841"), operation.workflowStep === WORKFLOW_STEP.STOPPING)) && (stryMutAct_9fa48("134843") ? operation.type === OperationType.REMOVE && operation.type === OperationType.REPLACE : stryMutAct_9fa48("134842") ? true : (stryCov_9fa48("134842", "134843"), (stryMutAct_9fa48("134845") ? operation.type !== OperationType.REMOVE : stryMutAct_9fa48("134844") ? false : (stryCov_9fa48("134844", "134845"), operation.type === OperationType.REMOVE)) || (stryMutAct_9fa48("134847") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("134846") ? false : (stryCov_9fa48("134846", "134847"), operation.type === OperationType.REPLACE)))))) {
        if (stryMutAct_9fa48("134848")) {
          {}
        } else {
          stryCov_9fa48("134848");
          return OPERATION_LIFECYCLE_ACTION.RECONCILE_STOPPING;
        }
      }
      if (stryMutAct_9fa48("134851") ? (operation.workflowStep === WORKFLOW_STEP.PENDING || operation.workflowStep === WORKFLOW_STEP.SENDING || operation.workflowStep === WORKFLOW_STEP.CREATING) && operation.workflowStep === WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("134850") ? false : stryMutAct_9fa48("134849") ? true : (stryCov_9fa48("134849", "134850", "134851"), (stryMutAct_9fa48("134853") ? (operation.workflowStep === WORKFLOW_STEP.PENDING || operation.workflowStep === WORKFLOW_STEP.SENDING) && operation.workflowStep === WORKFLOW_STEP.CREATING : stryMutAct_9fa48("134852") ? false : (stryCov_9fa48("134852", "134853"), (stryMutAct_9fa48("134855") ? operation.workflowStep === WORKFLOW_STEP.PENDING && operation.workflowStep === WORKFLOW_STEP.SENDING : stryMutAct_9fa48("134854") ? false : (stryCov_9fa48("134854", "134855"), (stryMutAct_9fa48("134857") ? operation.workflowStep !== WORKFLOW_STEP.PENDING : stryMutAct_9fa48("134856") ? false : (stryCov_9fa48("134856", "134857"), operation.workflowStep === WORKFLOW_STEP.PENDING)) || (stryMutAct_9fa48("134859") ? operation.workflowStep !== WORKFLOW_STEP.SENDING : stryMutAct_9fa48("134858") ? false : (stryCov_9fa48("134858", "134859"), operation.workflowStep === WORKFLOW_STEP.SENDING)))) || (stryMutAct_9fa48("134861") ? operation.workflowStep !== WORKFLOW_STEP.CREATING : stryMutAct_9fa48("134860") ? false : (stryCov_9fa48("134860", "134861"), operation.workflowStep === WORKFLOW_STEP.CREATING)))) || (stryMutAct_9fa48("134863") ? operation.workflowStep !== WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("134862") ? false : (stryCov_9fa48("134862", "134863"), operation.workflowStep === WORKFLOW_STEP.SYNCING)))) {
        if (stryMutAct_9fa48("134864")) {
          {}
        } else {
          stryCov_9fa48("134864");
          return OPERATION_LIFECYCLE_ACTION.RECONCILE_REPLICA_STATUS;
        }
      }
      return OPERATION_LIFECYCLE_ACTION.NOOP;
    }
  }

  /**
   * Per-operation recovery logic.
   * @param {Object} op
   * @return {Promise<void>}
   */
  async reconcileRecoveryOperation(op) {
    if (stryMutAct_9fa48("134865")) {
      {}
    } else {
      stryCov_9fa48("134865");
      await this.reconcileOperationLifecycle(op, stryMutAct_9fa48("134866") ? {} : (stryCov_9fa48("134866"), {
        cause: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY
      }));
    }
  }

  /**
   * Reconcile a SYNCING operation by checking actual replica status.
   * @param {Object} operation
   * @return {Promise<void>}
   */
  async reconcileSyncingOperation(operation) {
    if (stryMutAct_9fa48("134867")) {
      {}
    } else {
      stryCov_9fa48("134867");
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_SYNCING, stryMutAct_9fa48("134868") ? {} : (stryCov_9fa48("134868"), {
        operationId: operation.operationId,
        partitionId: operation.partitionId,
        targetNodeId: operation.targetNodeId
      }));
      const progressed = await this.reconcileOperationLifecycle(operation, stryMutAct_9fa48("134869") ? {} : (stryCov_9fa48("134869"), {
        cause: stryMutAct_9fa48("134870") ? "" : (stryCov_9fa48("134870"), 'recovery')
      }));
      if (stryMutAct_9fa48("134873") ? false : stryMutAct_9fa48("134872") ? true : stryMutAct_9fa48("134871") ? progressed : (stryCov_9fa48("134871", "134872", "134873"), !progressed)) {
        if (stryMutAct_9fa48("134874")) {
          {}
        } else {
          stryCov_9fa48("134874");
          this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECONCILE_IN_PROGRESS, stryMutAct_9fa48("134875") ? {} : (stryCov_9fa48("134875"), {
            operationId: operation.operationId,
            partitionId: operation.partitionId,
            workflowStep: operation.workflowStep
          }));
        }
      }
    }
  }

  /**
   * Handle node recovery.
   * @return {Promise<Object>}
   */
  async handleRecovery() {
    if (stryMutAct_9fa48("134876")) {
      {}
    } else {
      stryCov_9fa48("134876");
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_START, stryMutAct_9fa48("134877") ? {} : (stryCov_9fa48("134877"), {
        nodeId: this.nodeId
      }));
      const result = stryMutAct_9fa48("134878") ? {} : (stryCov_9fa48("134878"), {
        totalIncomplete: NUM.ZERO,
        markedFailed: NUM.ZERO,
        reconciled: NUM.ZERO,
        errors: stryMutAct_9fa48("134879") ? ["Stryker was here"] : (stryCov_9fa48("134879"), [])
      });
      const incompleteOps = await this.repository.queryIncompleteOperations(stryMutAct_9fa48("134880") ? {} : (stryCov_9fa48("134880"), {
        preferAuthoritativeRead: stryMutAct_9fa48("134881") ? false : (stryCov_9fa48("134881"), true)
      }));
      result.totalIncomplete = incompleteOps.length;
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_FOUND, stryMutAct_9fa48("134882") ? {} : (stryCov_9fa48("134882"), {
        count: incompleteOps.length,
        nodeId: this.nodeId
      }));
      for (const op of incompleteOps) {
        if (stryMutAct_9fa48("134883")) {
          {}
        } else {
          stryCov_9fa48("134883");
          if (stryMutAct_9fa48("134886") ? false : stryMutAct_9fa48("134885") ? true : stryMutAct_9fa48("134884") ? this.repository.isOperationLocallyOwned(op) : (stryCov_9fa48("134884", "134885", "134886"), !this.repository.isOperationLocallyOwned(op))) {
            if (stryMutAct_9fa48("134887")) {
              {}
            } else {
              stryCov_9fa48("134887");
              continue;
            }
          }
          const originalStep = op.workflowStep;
          const singleFlightKey = this.getOperationOwnerSingleFlightKey(op.operationId);
          try {
            if (stryMutAct_9fa48("134888")) {
              {}
            } else {
              stryCov_9fa48("134888");
              await this.operationWorkflowRunExclusive(singleFlightKey, stryMutAct_9fa48("134889") ? () => undefined : (stryCov_9fa48("134889"), () => this.reconcileRecoveryOperation(op)));
            }
          } catch (error) {
            if (stryMutAct_9fa48("134890")) {
              {}
            } else {
              stryCov_9fa48("134890");
              if (stryMutAct_9fa48("134892") ? false : stryMutAct_9fa48("134891") ? true : (stryCov_9fa48("134891", "134892"), this.deferTransitionRetry(op.operationId, error, stryMutAct_9fa48("134893") ? {} : (stryCov_9fa48("134893"), {
                boundary: OPERATION_WORKFLOW_OWNER_LITERAL.RECOVERY,
                workflowStep: stryMutAct_9fa48("134896") ? op?.workflowStep && null : stryMutAct_9fa48("134895") ? false : stryMutAct_9fa48("134894") ? true : (stryCov_9fa48("134894", "134895", "134896"), (stryMutAct_9fa48("134897") ? op.workflowStep : (stryCov_9fa48("134897"), op?.workflowStep)) || null),
                partitionId: stryMutAct_9fa48("134900") ? op?.partitionId && null : stryMutAct_9fa48("134899") ? false : stryMutAct_9fa48("134898") ? true : (stryCov_9fa48("134898", "134899", "134900"), (stryMutAct_9fa48("134901") ? op.partitionId : (stryCov_9fa48("134901"), op?.partitionId)) || null)
              })))) {
                if (stryMutAct_9fa48("134902")) {
                  {}
                } else {
                  stryCov_9fa48("134902");
                  continue;
                }
              }
              result.errors.push(stryMutAct_9fa48("134903") ? {} : (stryCov_9fa48("134903"), {
                operationId: op.operationId,
                error: error.message
              }));
              this.logger.error(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_MARK_FAILED, stryMutAct_9fa48("134904") ? {} : (stryCov_9fa48("134904"), {
                operationId: op.operationId,
                workflowStep: originalStep,
                partitionId: op.partitionId,
                error: error.message
              }));
              continue;
            }
          }
          if (stryMutAct_9fa48("134907") ? this.isPreSyncStep(originalStep) && originalStep === WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("134906") ? false : stryMutAct_9fa48("134905") ? true : (stryCov_9fa48("134905", "134906", "134907"), this.isPreSyncStep(originalStep) || (stryMutAct_9fa48("134909") ? originalStep !== WORKFLOW_STEP.STOPPING : stryMutAct_9fa48("134908") ? false : (stryCov_9fa48("134908", "134909"), originalStep === WORKFLOW_STEP.STOPPING)))) {
            if (stryMutAct_9fa48("134910")) {
              {}
            } else {
              stryCov_9fa48("134910");
              stryMutAct_9fa48("134911") ? result.markedFailed-- : (stryCov_9fa48("134911"), result.markedFailed++);
            }
          } else if (stryMutAct_9fa48("134914") ? originalStep !== WORKFLOW_STEP.SYNCING : stryMutAct_9fa48("134913") ? false : stryMutAct_9fa48("134912") ? true : (stryCov_9fa48("134912", "134913", "134914"), originalStep === WORKFLOW_STEP.SYNCING)) {
            if (stryMutAct_9fa48("134915")) {
              {}
            } else {
              stryCov_9fa48("134915");
              stryMutAct_9fa48("134916") ? result.reconciled-- : (stryCov_9fa48("134916"), result.reconciled++);
            }
          }
        }
      }
      this.logger.info(REBALANCE_COORDINATOR_LOG_MSG.RECOVERY_COMPLETED, stryMutAct_9fa48("134917") ? {} : (stryCov_9fa48("134917"), {
        nodeId: this.nodeId,
        ...result
      }));
      const reservationResult = await this.reconcileReservations();
      result.reservationsExpired = reservationResult.expired;
      result.reservationsOrphansReleased = reservationResult.orphansReleased;
      this.emitter.emit(REBALANCE_COORDINATOR_EVENT.RECOVERY_COMPLETED, result);
      return result;
    }
  }

  // --- Helpers ---

  /**
   * @param {string} errorMessage
   * @return {boolean}
   */
  isSafetyPolicyFailure(errorMessage) {
    if (stryMutAct_9fa48("134918")) {
      {}
    } else {
      stryCov_9fa48("134918");
      if (stryMutAct_9fa48("134921") ? typeof errorMessage !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING && !errorMessage : stryMutAct_9fa48("134920") ? false : stryMutAct_9fa48("134919") ? true : (stryCov_9fa48("134919", "134920", "134921"), (stryMutAct_9fa48("134923") ? typeof errorMessage === OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("134922") ? false : (stryCov_9fa48("134922", "134923"), typeof errorMessage !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) || (stryMutAct_9fa48("134924") ? errorMessage : (stryCov_9fa48("134924"), !errorMessage)))) {
        if (stryMutAct_9fa48("134925")) {
          {}
        } else {
          stryCov_9fa48("134925");
          return stryMutAct_9fa48("134926") ? true : (stryCov_9fa48("134926"), false);
        }
      }
      const normalized = stryMutAct_9fa48("134927") ? errorMessage.toUpperCase() : (stryCov_9fa48("134927"), errorMessage.toLowerCase());
      return stryMutAct_9fa48("134930") ? (normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE_2) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_3) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD)) && normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD) : stryMutAct_9fa48("134929") ? false : stryMutAct_9fa48("134928") ? true : (stryCov_9fa48("134928", "134929", "134930"), (stryMutAct_9fa48("134932") ? (normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE_2) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_3) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP)) && normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD) : stryMutAct_9fa48("134931") ? false : (stryCov_9fa48("134931", "134932"), (stryMutAct_9fa48("134934") ? (normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE_2) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_3)) && normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP) : stryMutAct_9fa48("134933") ? false : (stryCov_9fa48("134933", "134934"), (stryMutAct_9fa48("134936") ? (normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE_2)) && normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_3) : stryMutAct_9fa48("134935") ? false : (stryCov_9fa48("134935", "134936"), (stryMutAct_9fa48("134938") ? normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2) && normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE_2) : stryMutAct_9fa48("134937") ? false : (stryCov_9fa48("134937", "134938"), normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.WOULD_DROP_VOTER_DASH_READY_REPLICAS_BELOW_MINIMUM_2) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.SAFETY_CHECK_UNAVAILABLE_2))) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.REPLACEMENT_REPLICA_3))) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PUBLISHED_MEMBERSHIP))) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PRIORITY_SPREAD))) || normalized.includes(OPERATION_WORKFLOW_OWNER_LITERAL.PROJECTED_VOTER_DASH_READY_SPREAD));
    }
  }

  /**
   * @param {Object} operation
   * @param {boolean} replaceRemovePhase
   * @param {string} removeSafetyError
   * @return {boolean}
   */
  async getRemoveSafetyDeferReason(operation, replaceRemovePhase, removeSafetyError) {
    if (stryMutAct_9fa48("134939")) {
      {}
    } else {
      stryCov_9fa48("134939");
      if (stryMutAct_9fa48("134942") ? !operation && !this.isSafetyPolicyFailure(removeSafetyError) : stryMutAct_9fa48("134941") ? false : stryMutAct_9fa48("134940") ? true : (stryCov_9fa48("134940", "134941", "134942"), (stryMutAct_9fa48("134943") ? operation : (stryCov_9fa48("134943"), !operation)) || (stryMutAct_9fa48("134944") ? this.isSafetyPolicyFailure(removeSafetyError) : (stryCov_9fa48("134944"), !this.isSafetyPolicyFailure(removeSafetyError))))) {
        if (stryMutAct_9fa48("134945")) {
          {}
        } else {
          stryCov_9fa48("134945");
          return null;
        }
      }
      if (stryMutAct_9fa48("134948") ? operation.type === OperationType.REPLACE || replaceRemovePhase : stryMutAct_9fa48("134947") ? false : stryMutAct_9fa48("134946") ? true : (stryCov_9fa48("134946", "134947", "134948"), (stryMutAct_9fa48("134950") ? operation.type !== OperationType.REPLACE : stryMutAct_9fa48("134949") ? true : (stryCov_9fa48("134949", "134950"), operation.type === OperationType.REPLACE)) && replaceRemovePhase)) {
        if (stryMutAct_9fa48("134951")) {
          {}
        } else {
          stryCov_9fa48("134951");
          return REBALANCE_COORDINATOR_DEFER_REASON.REPLACE_REMOVE_SAFETY_BLOCKED;
        }
      }
      if (stryMutAct_9fa48("134954") ? operation.type !== OperationType.REMOVE && !(await this.isCriticalRemoveOverReplicated(operation)) : stryMutAct_9fa48("134953") ? false : stryMutAct_9fa48("134952") ? true : (stryCov_9fa48("134952", "134953", "134954"), (stryMutAct_9fa48("134956") ? operation.type === OperationType.REMOVE : stryMutAct_9fa48("134955") ? false : (stryCov_9fa48("134955", "134956"), operation.type !== OperationType.REMOVE)) || (stryMutAct_9fa48("134957") ? await this.isCriticalRemoveOverReplicated(operation) : (stryCov_9fa48("134957"), !(await this.isCriticalRemoveOverReplicated(operation)))))) {
        if (stryMutAct_9fa48("134958")) {
          {}
        } else {
          stryCov_9fa48("134958");
          return null;
        }
      }
      return REBALANCE_COORDINATOR_DEFER_REASON.REMOVE_SAFETY_BLOCKED;
    }
  }

  /**
   * @param {Object} operation
   * @return {Promise<boolean>}
   */
  async isCriticalRemoveOverReplicated(operation) {
    if (stryMutAct_9fa48("134959")) {
      {}
    } else {
      stryCov_9fa48("134959");
      if (stryMutAct_9fa48("134962") ? (!operation || operation.type !== OperationType.REMOVE) && !this.isCriticalSystemPartition(operation.partitionId) : stryMutAct_9fa48("134961") ? false : stryMutAct_9fa48("134960") ? true : (stryCov_9fa48("134960", "134961", "134962"), (stryMutAct_9fa48("134964") ? !operation && operation.type !== OperationType.REMOVE : stryMutAct_9fa48("134963") ? false : (stryCov_9fa48("134963", "134964"), (stryMutAct_9fa48("134965") ? operation : (stryCov_9fa48("134965"), !operation)) || (stryMutAct_9fa48("134967") ? operation.type === OperationType.REMOVE : stryMutAct_9fa48("134966") ? false : (stryCov_9fa48("134966", "134967"), operation.type !== OperationType.REMOVE)))) || (stryMutAct_9fa48("134968") ? this.isCriticalSystemPartition(operation.partitionId) : (stryCov_9fa48("134968"), !this.isCriticalSystemPartition(operation.partitionId))))) {
        if (stryMutAct_9fa48("134969")) {
          {}
        } else {
          stryCov_9fa48("134969");
          return stryMutAct_9fa48("134970") ? true : (stryCov_9fa48("134970"), false);
        }
      }
      const criticalReplicaRows = await this.getCriticalReplicaRowsForSafety(operation.partitionId);
      const minReplicaCount = await this.getCriticalMinReplicaCount(operation.partitionId);
      return stryMutAct_9fa48("134974") ? criticalReplicaRows.length <= minReplicaCount : stryMutAct_9fa48("134973") ? criticalReplicaRows.length >= minReplicaCount : stryMutAct_9fa48("134972") ? false : stryMutAct_9fa48("134971") ? true : (stryCov_9fa48("134971", "134972", "134973", "134974"), criticalReplicaRows.length > minReplicaCount);
    }
  }

  /**
   * @param {string|null|undefined} operationId
   * @return {void}
   */
  clearDeferredSafetyBlockState(operationId) {
    if (stryMutAct_9fa48("134975")) {
      {}
    } else {
      stryCov_9fa48("134975");
      if (stryMutAct_9fa48("134978") ? typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING && operationId.length === NUM.ZERO : stryMutAct_9fa48("134977") ? false : stryMutAct_9fa48("134976") ? true : (stryCov_9fa48("134976", "134977", "134978"), (stryMutAct_9fa48("134980") ? typeof operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("134979") ? false : (stryCov_9fa48("134979", "134980"), typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) || (stryMutAct_9fa48("134982") ? operationId.length !== NUM.ZERO : stryMutAct_9fa48("134981") ? false : (stryCov_9fa48("134981", "134982"), operationId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("134983")) {
          {}
        } else {
          stryCov_9fa48("134983");
          return;
        }
      }
      this.clearSafetyDeferredRetry(operationId);
      this.safetyDeferredLogStateByOperationId.delete(operationId);
    }
  }

  /**
   * @param {Object} operation
   * @param {string} errorMessage
   * @return {void}
   */
  logDeferredSafetyBlockedRemove(operation, errorMessage, deferReason) {
    if (stryMutAct_9fa48("134984")) {
      {}
    } else {
      stryCov_9fa48("134984");
      const operationId = stryMutAct_9fa48("134985") ? operation.operationId : (stryCov_9fa48("134985"), operation?.operationId);
      if (stryMutAct_9fa48("134988") ? typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING && operationId.length === NUM.ZERO : stryMutAct_9fa48("134987") ? false : stryMutAct_9fa48("134986") ? true : (stryCov_9fa48("134986", "134987", "134988"), (stryMutAct_9fa48("134990") ? typeof operationId === OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("134989") ? false : (stryCov_9fa48("134989", "134990"), typeof operationId !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) || (stryMutAct_9fa48("134992") ? operationId.length !== NUM.ZERO : stryMutAct_9fa48("134991") ? false : (stryCov_9fa48("134991", "134992"), operationId.length === NUM.ZERO)))) {
        if (stryMutAct_9fa48("134993")) {
          {}
        } else {
          stryCov_9fa48("134993");
          return;
        }
      }
      const now = Date.now();
      const previousState = stryMutAct_9fa48("134996") ? this.safetyDeferredLogStateByOperationId.get(operationId) && null : stryMutAct_9fa48("134995") ? false : stryMutAct_9fa48("134994") ? true : (stryCov_9fa48("134994", "134995", "134996"), this.safetyDeferredLogStateByOperationId.get(operationId) || null);
      const errorChanged = stryMutAct_9fa48("134999") ? previousState?.errorMessage === errorMessage : stryMutAct_9fa48("134998") ? false : stryMutAct_9fa48("134997") ? true : (stryCov_9fa48("134997", "134998", "134999"), (stryMutAct_9fa48("135000") ? previousState.errorMessage : (stryCov_9fa48("135000"), previousState?.errorMessage)) !== errorMessage);
      const throttleElapsed = stryMutAct_9fa48("135003") ? !previousState && now - previousState.loggedAtMs >= SAFETY_DEFERRED_LOG_THROTTLE_MS : stryMutAct_9fa48("135002") ? false : stryMutAct_9fa48("135001") ? true : (stryCov_9fa48("135001", "135002", "135003"), (stryMutAct_9fa48("135004") ? previousState : (stryCov_9fa48("135004"), !previousState)) || (stryMutAct_9fa48("135007") ? now - previousState.loggedAtMs < SAFETY_DEFERRED_LOG_THROTTLE_MS : stryMutAct_9fa48("135006") ? now - previousState.loggedAtMs > SAFETY_DEFERRED_LOG_THROTTLE_MS : stryMutAct_9fa48("135005") ? false : (stryCov_9fa48("135005", "135006", "135007"), (stryMutAct_9fa48("135008") ? now + previousState.loggedAtMs : (stryCov_9fa48("135008"), now - previousState.loggedAtMs)) >= SAFETY_DEFERRED_LOG_THROTTLE_MS)));
      this.safetyDeferredLogStateByOperationId.set(operationId, stryMutAct_9fa48("135009") ? {} : (stryCov_9fa48("135009"), {
        errorMessage,
        loggedAtMs: now
      }));
      if (stryMutAct_9fa48("135012") ? !errorChanged || !throttleElapsed : stryMutAct_9fa48("135011") ? false : stryMutAct_9fa48("135010") ? true : (stryCov_9fa48("135010", "135011", "135012"), (stryMutAct_9fa48("135013") ? errorChanged : (stryCov_9fa48("135013"), !errorChanged)) && (stryMutAct_9fa48("135014") ? throttleElapsed : (stryCov_9fa48("135014"), !throttleElapsed)))) {
        if (stryMutAct_9fa48("135015")) {
          {}
        } else {
          stryCov_9fa48("135015");
          return;
        }
      }
      this.logger.warn(REBALANCE_COORDINATOR_LOG_MSG.OPERATION_DEFERRED_BY_SAFETY_POLICY, stryMutAct_9fa48("135016") ? {} : (stryCov_9fa48("135016"), {
        operationId,
        partitionId: operation.partitionId,
        sourceNodeId: operation.sourceNodeId,
        targetNodeId: operation.targetNodeId,
        workflowStep: operation.workflowStep,
        reason: deferReason,
        errorMessage
      }));
    }
  }

  /**
   * @param {*} errorLike
   * @param {string} fallbackMessage
   * @return {string}
   */
  normalizeErrorMessage(errorLike, fallbackMessage) {
    if (stryMutAct_9fa48("135017")) {
      {}
    } else {
      stryCov_9fa48("135017");
      if (stryMutAct_9fa48("135020") ? typeof errorLike === OPERATION_WORKFLOW_OWNER_LITERAL.STRING || errorLike.trim() : stryMutAct_9fa48("135019") ? false : stryMutAct_9fa48("135018") ? true : (stryCov_9fa48("135018", "135019", "135020"), (stryMutAct_9fa48("135022") ? typeof errorLike !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("135021") ? true : (stryCov_9fa48("135021", "135022"), typeof errorLike === OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) && (stryMutAct_9fa48("135023") ? errorLike : (stryCov_9fa48("135023"), errorLike.trim())))) {
        if (stryMutAct_9fa48("135024")) {
          {}
        } else {
          stryCov_9fa48("135024");
          return errorLike;
        }
      }
      if (stryMutAct_9fa48("135027") ? !errorLike && typeof errorLike !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("135026") ? false : stryMutAct_9fa48("135025") ? true : (stryCov_9fa48("135025", "135026", "135027"), (stryMutAct_9fa48("135028") ? errorLike : (stryCov_9fa48("135028"), !errorLike)) || (stryMutAct_9fa48("135030") ? typeof errorLike === OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT : stryMutAct_9fa48("135029") ? false : (stryCov_9fa48("135029", "135030"), typeof errorLike !== OPERATION_WORKFLOW_OWNER_LITERAL.OBJECT)))) {
        if (stryMutAct_9fa48("135031")) {
          {}
        } else {
          stryCov_9fa48("135031");
          return fallbackMessage;
        }
      }
      const candidateValues = stryMutAct_9fa48("135032") ? [] : (stryCov_9fa48("135032"), [errorLike.message, errorLike.errorMessage, stryMutAct_9fa48("135033") ? errorLike.error.message : (stryCov_9fa48("135033"), errorLike.error?.message), stryMutAct_9fa48("135034") ? errorLike.error.errorMessage : (stryCov_9fa48("135034"), errorLike.error?.errorMessage), stryMutAct_9fa48("135035") ? errorLike.details.message : (stryCov_9fa48("135035"), errorLike.details?.message), stryMutAct_9fa48("135036") ? errorLike.details.errorMessage : (stryCov_9fa48("135036"), errorLike.details?.errorMessage)]);
      for (const candidate of candidateValues) {
        if (stryMutAct_9fa48("135037")) {
          {}
        } else {
          stryCov_9fa48("135037");
          if (stryMutAct_9fa48("135040") ? typeof candidate === OPERATION_WORKFLOW_OWNER_LITERAL.STRING || candidate.trim() : stryMutAct_9fa48("135039") ? false : stryMutAct_9fa48("135038") ? true : (stryCov_9fa48("135038", "135039", "135040"), (stryMutAct_9fa48("135042") ? typeof candidate !== OPERATION_WORKFLOW_OWNER_LITERAL.STRING : stryMutAct_9fa48("135041") ? true : (stryCov_9fa48("135041", "135042"), typeof candidate === OPERATION_WORKFLOW_OWNER_LITERAL.STRING)) && (stryMutAct_9fa48("135043") ? candidate : (stryCov_9fa48("135043"), candidate.trim())))) {
            if (stryMutAct_9fa48("135044")) {
              {}
            } else {
              stryCov_9fa48("135044");
              return candidate;
            }
          }
        }
      }
      return fallbackMessage;
    }
  }
}
export { OperationWorkflowOwner };