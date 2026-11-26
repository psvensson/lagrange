import {RETAINED_PLACEMENT_ATTEMPT} from '../partition/partition-placement-admission-constants.js';
import {WORKFLOW_ERROR_MSG} from '../workflow/workflow-constants.js';
import {randomUUID} from 'node:crypto';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
} from '../control-plane/owner-contract-outcome.js';
import {getRemainingBudgetMs} from '../control-plane/timeout-budget.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {isControlPlaneWriteOutcomeUnknown} from '../control-plane/control-plane-write-identity.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';
import {DurableWorkflowCoordinator} from
  '../workflow/durable-workflow-coordinator.js';
import {
  SCHEMA_PROVISIONING_DEFAULT,
  SCHEMA_PROVISIONING_ERROR_CODE,
  SCHEMA_PROVISIONING_INTENT_VERSION,
  SCHEMA_PROVISIONING_JOB_RECORD_VERSION,
  SCHEMA_PROVISIONING_JOB_STATUS,
  SCHEMA_PROVISIONING_JOB_STEP,
  SCHEMA_PROVISIONING_JOB_TERMINAL_STATUSES,
  SCHEMA_PROVISIONING_OPERATION,
  SCHEMA_PROVISIONING_REASON,
} from './schema-provisioning-job-constants.js';
import {canonicalizeSchemaProvisioningIntent, resolveIntentTableIdentity} from
  './schema-provisioning-intent.js';
import {QUERY_ERROR_CODE, QUERY_LOG_MSG} from './query-constants.js';
import {isTerminalSchemaWriteRejection, rowToWorkflow, serializeWorkflow} from
  './schema-provisioning-job-repository.js';
import {
  runAdminActivity,
} from '../diagnostics/formation-owner-attribution.js';
import {
  PLACEMENT_WAITING_CLEARING_TRIGGER,
} from '../rebalancer/replica-placement-owner-constants.js';

const TRANSIENT_ERROR_FRAGMENT = Object.freeze({
  CANCEL_CODE: 'CANCEL',
  CANCEL_MESSAGE: 'cancel',
  // Zero-change idempotent re-create with pending leader visibility is retryable.
  NOT_CONFIRMED_MESSAGE: 'authoritative replica operation not confirmed',
  STALE_FENCE_MESSAGE: 'stale fence',
  TIMEOUT_CODE: 'TIMEOUT',
  TIMEOUT_MESSAGE: 'timeout',
  TIMED_OUT_MESSAGE: 'timed out',
});
const TRANSIENT_PROVISIONING_CODES = new Set([
  QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE,
  QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE,
  SCHEMA_PROVISIONING_ERROR_CODE.STALE_OWNER,
  'PLACEMENT_LEDGER_LEADER_UNAVAILABLE',
  'OPERATION_PERSISTENCE_CONFIRMATION_UNRESOLVED',
]);
const TRANSIENT_FAILURE_CODES = new Set([
  'FORMATION_NOT_LATCHED',
  'PLACEMENT_REPAIR_PENDING',
  ...Object.keys(PLACEMENT_WAITING_CLEARING_TRIGGER),
]);
const TRANSIENT_SKIP_REASONS = new Set(['deferred_retry_pending']);
const TRANSIENT_CODE_FRAGMENTS = Object.freeze([
  TRANSIENT_ERROR_FRAGMENT.TIMEOUT_CODE,
  TRANSIENT_ERROR_FRAGMENT.CANCEL_CODE,
]);
const TRANSIENT_MESSAGE_FRAGMENTS = Object.freeze([
  TRANSIENT_ERROR_FRAGMENT.TIMEOUT_MESSAGE,
  TRANSIENT_ERROR_FRAGMENT.TIMED_OUT_MESSAGE,
  TRANSIENT_ERROR_FRAGMENT.CANCEL_MESSAGE,
  TRANSIENT_ERROR_FRAGMENT.STALE_FENCE_MESSAGE,
  TRANSIENT_ERROR_FRAGMENT.NOT_CONFIRMED_MESSAGE,
]);

function isTerminalProvisioningSuccess(result) {
  const state = result?.contractState;
  return state === OWNER_CONTRACT_STATE.READY ||
    state === OWNER_CONTRACT_STATE.UNDER_REPLICATED;
}
const SCHEMA_PROVISIONING_FAILED_MESSAGE = 'Schema provisioning failed';
const SCHEMA_PROVISIONING_FAILED_CODE = 'SCHEMA_PROVISIONING_FAILED';

function createIntentConflictError(intent) {
  const error = new Error(
    `A different schema intent already owns ${intent.tableIdentityKey}`,
  );
  error.code = SCHEMA_PROVISIONING_ERROR_CODE.INTENT_CONFLICT;
  return error;
}

function buildInitialWorkflow(intent, now) {
  return {
    workflowId: intent.workflowId,
    ownerKey: intent.ownerKey,
    tableId: intent.tableId,
    step: SCHEMA_PROVISIONING_JOB_STEP.PENDING,
    status: SCHEMA_PROVISIONING_JOB_STATUS.PENDING,
    fenceToken: 0,
    workflowOwnerId: null,
    leaseExpiresAt: 0,
    attemptCount: 0,
    rowVersion: 1,
    reasonCodes: [SCHEMA_PROVISIONING_REASON.INTENT_RECORDED],
    retryAfterMs: SCHEMA_PROVISIONING_DEFAULT.RETRY_AFTER_MS,
    transitionHistory: [],
    participants: new Map(),
    result: null,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

function buildInitialRow(intent, workflow) {
  return {
    job_id: intent.jobId,
    record_version: SCHEMA_PROVISIONING_JOB_RECORD_VERSION,
    row_version: workflow.rowVersion,
    workflow_id: intent.workflowId,
    owner_key: intent.ownerKey,
    idempotency_key: intent.idempotencyKey,
    operation_type: SCHEMA_PROVISIONING_OPERATION.CREATE_TABLE,
    namespace: intent.namespace,
    table_identity_key: intent.tableIdentityKey,
    table_id: intent.tableId,
    table_name: intent.tableName,
    normalized_ddl: intent.normalizedDdl,
    intent_version: SCHEMA_PROVISIONING_INTENT_VERSION,
    intent_hash: intent.intentHash,
    schema_revision: 1,
    status: workflow.status,
    current_step: workflow.step,
    reason_codes: JSON.stringify(workflow.reasonCodes),
    retry_after_ms: workflow.retryAfterMs,
    workflow_record: serializeWorkflow(workflow),
    workflow_fence_token: workflow.fenceToken,
    workflow_owner_id: null,
    workflow_lease_expires_at: null,
    attempt_count: workflow.attemptCount,
    result_json: null,
    error_code: null,
    error_message: null,
    created_at: workflow.createdAt,
    updated_at: workflow.updatedAt,
    completed_at: null,
  };
}

const DEFERRED_AUTHORITY_MESSAGE = 'Placement authority temporarily unavailable';

function isDeferredAuthorityError(error) {
  const failureCode = String(error?.failureCode || error?.code || '').toUpperCase();
  const skipReason = String(error?.rebalanceSkipReason || '').toLowerCase();
  return error?.deferRetry === true ||
    TRANSIENT_FAILURE_CODES.has(failureCode) ||
    TRANSIENT_SKIP_REASONS.has(skipReason);
}

function hasTransientProvisioningCode(code) {
  return TRANSIENT_PROVISIONING_CODES.has(code) ||
    TRANSIENT_CODE_FRAGMENTS.some((fragment) => code.includes(fragment));
}

function hasTransientProvisioningMessage(message) {
  return TRANSIENT_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment));
}

export function isTransientProvisioningError(error) {
  if (!error || isTerminalSchemaWriteRejection(error)) return false;
  if (error.admissionAnswer?.[RETAINED_PLACEMENT_ATTEMPT] === true) {
    return true;
  }
  if (isDeferredAuthorityError(error) || isRetryableControlPlaneError(error)) {
    return true;
  }
  const code = String(error.code || error.errorCode || '').toUpperCase();
  const message = String(error.message || '').toLowerCase();
  return hasTransientProvisioningCode(code) ||
    hasTransientProvisioningMessage(message);
}

function buildProvisioningRefusal(workflow, error) {
  const {epoch = null, reasons = [], retryAfterMs = 0} = error?.detail || {};
  return {
    success: false,
    error: error.message,
    errorCode: QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE,
    ...buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    }),
    jobId: workflow.workflowId,
    tableId: workflow.tableId || null,
    epoch,
    reasons,
    retryAfterMs,
    reasonCodes: reasons,
    detail: error.detail || null,
  };
}

function resolveDeferredReasons(detail, failureCode, workflow) {
  if (Array.isArray(detail.reasons)) return detail.reasons;
  if (failureCode) return [failureCode];
  return workflow.reasonCodes || [];
}

function resolveDeferredErrorCode(error, failureCode) {
  if (error?.code) return error.code;
  if (error?.errorCode) return error.errorCode;
  return failureCode || null;
}

function buildDeferredAuthorityOutcome(workflow, error, defaultRetryAfterMs) {
  const detail = error?.detail || {};
  const failureCode = error?.failureCode || null;
  return {
    success: false,
    error: error?.message || DEFERRED_AUTHORITY_MESSAGE,
    errorCode: resolveDeferredErrorCode(error, failureCode),
    failureCode,
    ...buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.DEFERRED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
    }),
    jobId: workflow.workflowId,
    tableId: workflow.tableId || null,
    retryAfterMs: detail.retryAfterMs ?? defaultRetryAfterMs,
    reasonCodes: resolveDeferredReasons(detail, failureCode, workflow),
  };
}

function recoverIntentFromRow(row) {
  const intent = JSON.parse(row.normalized_ddl);
  const tableId = row.table_id;
  const partitions = Array.isArray(intent.partitions) &&
      intent.partitions.length > 0 ?
    intent.partitions :
    null;
  const partitionId = partitions ? partitions[0].partitionId : `${tableId}-p1`;
  const globalIndex = intent.globalIndex ?? null;
  return {
    intent,
    ast: {
      tableName: intent.tableName,
      columns: intent.columns,
      primaryKey: intent.primaryKey,
      tableConstraints: intent.tableConstraints,
      options: intent.options,
      ifNotExists: true,
    },
    normalizedDdl: row.normalized_ddl,
    intentHash: row.intent_hash,
    idempotencyKey: row.idempotency_key,
    namespace: row.namespace,
    tableName: row.table_name,
    tableIdentityKey: row.table_identity_key,
    jobId: row.job_id,
    workflowId: row.workflow_id,
    ownerKey: row.owner_key,
    tableId,
    partitionId,
    ...(partitions ? {partitions} : {}),
    ...(globalIndex ? {globalIndex} : {}),
  };
}

function matchesIntent(row, intent) {
  return row.job_id === intent.jobId && row.workflow_id === intent.workflowId &&
    row.owner_key === intent.ownerKey && row.table_identity_key === intent.tableIdentityKey &&
    row.table_id === intent.tableId && row.intent_hash === intent.intentHash;
}

function isLostOwnership(error) {
  return error.code === SCHEMA_PROVISIONING_ERROR_CODE.STALE_OWNER ||
    error.message === WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN ||
    error.message === WORKFLOW_ERROR_MSG.WORKFLOW_LEASE_EXPIRED ||
    error.message === WORKFLOW_ERROR_MSG.WORKFLOW_OWNER_MISMATCH;
}

function resolveOutcomeReasonCodes(workflow, options) {
  if (Array.isArray(options.reasonCodes)) return options.reasonCodes;
  return Array.isArray(workflow.reasonCodes) ? workflow.reasonCodes : [];
}

const SCHEMA_PROVISIONING_DEADLINE_WAIT = Object.freeze({
  wait: 'schema_provisioning_request_deadline',
  awaited: 'schema provisioning job outcome within the request budget',
  armed: 'race_timer_fired',
  preExpired: 'budget_spent_before_race',
});

/**
 * Report the spent request deadline of one schema provisioning request.
 * @param {Object} owner - SchemaProvisioningJobOwner.
 * @param {Object} workflow - Prologue workflow.
 * @param {Object} timeoutBudget - The request budget.
 * @param {string} phase - Where the deadline was found spent.
 * @private
 */
function reportSchemaProvisioningDeadlineSpent(
  owner,
  workflow,
  timeoutBudget,
  phase,
) {
  const elapsedMs = owner.now() - timeoutBudget.startedAtMs;
  reportWaitBoundSpent(owner.logger, {
    ...SCHEMA_PROVISIONING_DEADLINE_WAIT,
    boundMs: timeoutBudget.configuredBudgetMs,
    elapsedMs,
    lastObserved: () => ({
      phase,
      workflowStatus: workflow.status,
      scheduledRetry: owner.retryTimersByWorkflowId.has(workflow.workflowId),
    }),
    scope: {workflowId: workflow.workflowId, ownerId: owner.ownerId},
  });
}

function createWorkflowCoordinator(owner, options) {
  if (options.workflowCoordinator) {
    return options.workflowCoordinator;
  }
  return new DurableWorkflowCoordinator({
    now: owner.now,
    persistWorkflowClaim: (workflow, context) =>
      owner.repository.persistWorkflowCandidate(workflow, context),
    persistWorkflowTransition: (workflow, context) =>
      owner.repository.persistWorkflowCandidate(workflow, context),
    isTerminalWorkflow: (workflow) =>
      SCHEMA_PROVISIONING_JOB_TERMINAL_STATUSES.has(workflow.status),
  });
}

class SchemaProvisioningJobOwner {
  constructor(options = {}) {
    this.repository = options.repository;
    this.now = options.now || (() => Date.now());
    this.logger = options.logger || null;
    this.ownerId = options.ownerId || `schema-worker-${randomUUID()}`;
    this.leaseMs = options.leaseMs || SCHEMA_PROVISIONING_DEFAULT.LEASE_MS;
    this.retryAfterMs = options.retryAfterMs ||
      SCHEMA_PROVISIONING_DEFAULT.RETRY_AFTER_MS;
    this.setTimeoutFn = options.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
    this.retrySetTimeoutFn = options.retrySetTimeoutFn || setTimeout;
    this.retryClearTimeoutFn = options.retryClearTimeoutFn || clearTimeout;
    this.retryTimersByWorkflowId = new Map();
    this.retryCompletionHandlers = new Map();
    this.onBackgroundJobSucceeded = options.onBackgroundJobSucceeded;
    this.onResumeSucceededGlobalIndexIntents = options.onResumeSucceededGlobalIndexIntents;
    this.shuttingDown = false;
    this.workflowCoordinator = createWorkflowCoordinator(this, options);
    this.discoveryRetries = new Map();
    this.discoveryReads = new Map();
  }

  setBackgroundJobSucceededHandler(handler) {
    this.onBackgroundJobSucceeded = handler || null;
  }

  setSucceededGlobalIndexRecoveryHandler(handler) {
    this.onResumeSucceededGlobalIndexIntents = handler || null;
  }

  async notifyBackgroundSucceeded(intent, outcome, runOptions = {}) {
    if (runOptions.background !== true || this.shuttingDown) {
      return;
    }
    const perJobHandler = this.retryCompletionHandlers.get(intent.workflowId);
    if (perJobHandler) {
      this.retryCompletionHandlers.delete(intent.workflowId);
      await perJobHandler(intent, outcome);
      return;
    }
    if (this.onBackgroundJobSucceeded) {
      await this.onBackgroundJobSucceeded(intent, outcome);
    }
  }

  clearScheduledRetry(workflowId) {
    const scheduled = this.retryTimersByWorkflowId.get(workflowId);
    if (!scheduled) return;
    this.retryTimersByWorkflowId.delete(workflowId);
    if (scheduled.timerId !== null && scheduled.timerId !== undefined) {
      this.retryClearTimeoutFn(scheduled.timerId);
    }
  }

  scheduleRetry(intent, executor, notBeforeMs = 0) {
    if (this.shuttingDown) return;
    const workflow = this.workflowCoordinator.getWorkflowById(
      intent.workflowId,
    );
    if (
      !workflow ||
      SCHEMA_PROVISIONING_JOB_TERMINAL_STATUSES.has(workflow.status) ||
      this.retryTimersByWorkflowId.has(intent.workflowId)
    ) {
      return;
    }
    const scheduled = {timerId: null};
    const retry = () => {
      if (this.shuttingDown) {
        this.clearScheduledRetry(intent.workflowId);
        return;
      }
      if (this.retryTimersByWorkflowId.get(intent.workflowId) !== scheduled) {
        return;
      }
      this.retryTimersByWorkflowId.delete(intent.workflowId);
      const execution = this.workflowCoordinator.runExclusive(
        intent.ownerKey,
        async () => {
          let row;
          try {
            row = await this.repository.findByTableIdentity(intent.tableIdentityKey);
          } catch (error) {
            this.scheduleRetry(intent, executor);
            throw error;
          }
          if (this.shuttingDown || !row || !matchesIntent(row, intent)) return;
          this.refreshWorkflowFromRow(row);
          return this.runJob(intent, executor, {background: true});
        },
      );
      void execution.catch((error) => {
        if (isTransientProvisioningError(error)) this.scheduleRetry(intent, executor);
        this.logger?.warn?.(QUERY_LOG_MSG.SCHEMA_PROVISIONING_RECOVERY_DEFERRED,
          {error: error.message});
      });
    };
    this.retryTimersByWorkflowId.set(intent.workflowId, scheduled);
    scheduled.timerId = this.retrySetTimeoutFn(
      retry,
      Math.max(1, workflow.retryAfterMs || this.retryAfterMs, notBeforeMs - this.now()),
    );
    scheduled.timerId?.unref?.();
  }

  shutdown() {
    this.shuttingDown = true;
    for (const timer of this.discoveryRetries.values()) this.retryClearTimeoutFn(timer);
    this.discoveryRetries.clear();
    this.discoveryReads.clear();
    this.retryCompletionHandlers.clear();
    for (const workflowId of [...this.retryTimersByWorkflowId.keys()]) {
      this.clearScheduledRetry(workflowId);
    }
  }

  refreshWorkflowFromRow(row) {
    const recovered = rowToWorkflow(row);
    const current = this.workflowCoordinator.getWorkflowById(
      recovered.workflowId,
    );
    if (current && recovered.rowVersion <= (current.rowVersion || 0)) {
      return current;
    }
    if (current) {
      this.workflowCoordinator.removeWorkflow(recovered.workflowId);
    }
    this.workflowCoordinator.recover({workflows: [recovered]});
    return this.workflowCoordinator.requireWorkflow(recovered.workflowId);
  }

  async insertOrAttach(intent) {
    const existing = await this.repository.findByTableIdentity(
      intent.tableIdentityKey,
    );
    if (existing && !matchesIntent(existing, intent)) {
      throw createIntentConflictError(intent);
    }
    if (existing) return {created: false, row: existing};
    const workflow = buildInitialWorkflow(intent, this.now());
    const inserted = await this.repository.insertIntent(
      buildInitialRow(intent, workflow),
    );
    if (!matchesIntent(inserted.row, intent)) {
      throw createIntentConflictError(intent);
    }
    if (!this.workflowCoordinator.getWorkflowById(intent.workflowId)) {
      this.workflowCoordinator.recover({workflows: [rowToWorkflow(inserted.row)]});
    }
    return inserted;
  }

  buildOutcome(workflow, options = {}) {
    const reasonCodes = resolveOutcomeReasonCodes(workflow, options);
    switch (workflow.status) {
    case SCHEMA_PROVISIONING_JOB_STATUS.SUCCEEDED:
      return {
        ...(workflow.result || {}),
        ...buildOwnerContractOutcome({
          contractState:
            workflow.result?.contractState === OWNER_CONTRACT_STATE.UNDER_REPLICATED ?
              OWNER_CONTRACT_STATE.UNDER_REPLICATED :
              OWNER_CONTRACT_STATE.READY,
          nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
        }),
        jobId: workflow.workflowId,
        tableId: workflow.tableId ?? null,
        reasonCodes: [...reasonCodes],
        retryAfterMs: 0,
      };
    case SCHEMA_PROVISIONING_JOB_STATUS.FAILED:
      return {
        success: false,
        error: workflow.errorMessage || SCHEMA_PROVISIONING_FAILED_MESSAGE,
        errorCode: workflow.errorCode,
        ...buildOwnerContractOutcome({
          contractState: OWNER_CONTRACT_STATE.FAILED,
          nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
        }),
        jobId: workflow.workflowId,
        reasonCodes: [...reasonCodes],
        retryAfterMs: 0,
      };
    default:
      return {
        success: true,
        ...buildOwnerContractOutcome({
          contractState: OWNER_CONTRACT_STATE.PENDING,
          nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
        }),
        jobId: workflow.workflowId,
        reasonCodes: [...reasonCodes],
        retryAfterMs: workflow.retryAfterMs || this.retryAfterMs,
        provisioningDeadlineExpired:
          options.provisioningDeadlineExpired === true,
      };
    }
  }

  async claimOwnership(workflow, fenceToken) {
    try {
      const claim = await this.workflowCoordinator.claimWorkflow(workflow.workflowId, {
        ownerId: this.ownerId,
        fenceToken,
        leaseExpiresAt: this.now() + this.leaseMs,
      });
      // A delayed acknowledgement proves a committed claim, but its grant
      // may already have expired, including on an executor's renewal.
      if (claim.accepted && claim.workflow.leaseExpiresAt <= this.now()) return {accepted: false};
      return claim;
    } catch (error) {
      if (isTerminalSchemaWriteRejection(error)) throw error;
      if (isControlPlaneWriteOutcomeUnknown(error) || isTransientProvisioningError(error)) {
        // The claim may already have advanced the row. Both callers reconcile
        // a refused claim from storage before allowing another provisioning step.
        return {accepted: false};
      }
      throw error;
    }
  }

  async assertOwnership(workflow) {
    const claim = await this.claimOwnership(workflow, workflow.fenceToken);
    if (!claim.accepted) {
      const error = new Error('Schema provisioning owner fence is stale');
      error.code = SCHEMA_PROVISIONING_ERROR_CODE.STALE_OWNER;
      throw error;
    }
    return claim.workflow;
  }

  async transitionPendingForRetry(intent, executor, workflow, error = null) {
    const renewedWorkflow = await this.assertOwnership(workflow);
    await this.workflowCoordinator.transitionStep(workflow.workflowId, {
      nextStep: SCHEMA_PROVISIONING_JOB_STEP.RECONCILING_REPLICAS,
      reason: SCHEMA_PROVISIONING_REASON.REPLICA_CONVERGENCE_PENDING,
      fenceToken: renewedWorkflow.fenceToken,
      ownerId: this.ownerId,
    }, {
      status: SCHEMA_PROVISIONING_JOB_STATUS.PENDING,
      reasonCodes: [
        SCHEMA_PROVISIONING_REASON.REPLICA_CONVERGENCE_PENDING,
      ],
      retryAfterMs: this.retryAfterMs,
    }, {
      markCommitted: false,
    });
    this.scheduleRetry(intent, executor);
    if ((error?.code || error?.errorCode) ===
        QUERY_ERROR_CODE.PROVISIONING_UNAVAILABLE) {
      // Refusal is the current committed-quorum observation, not durable job
      // completion. Repeated/recovered step history must not replay an older
      // observation or turn the generic PENDING result into wire success.
      return buildProvisioningRefusal(renewedWorkflow, error);
    }
    if (isDeferredAuthorityError(error)) {
      return buildDeferredAuthorityOutcome(
        renewedWorkflow,
        error,
        this.retryAfterMs,
      );
    }
    return this.buildOutcome(renewedWorkflow);
  }

  async transitionTerminal(intent, workflow, options = {}) {
    const renewedWorkflow = await this.assertOwnership(workflow);
    await this.workflowCoordinator.transitionStep(workflow.workflowId, {
      nextStep: options.nextStep,
      reason: options.reason,
      fenceToken: renewedWorkflow.fenceToken,
      ownerId: this.ownerId,
    }, options.updates);
    this.clearScheduledRetry(intent.workflowId);
    return this.buildOutcome(renewedWorkflow);
  }

  runJob(intent, executor, runOptions = {}) {
    return runAdminActivity(async () => {
      try {
        return await this.executeJob(intent, executor, runOptions);
      } catch (error) {
        if (!isLostOwnership(error)) throw error;
        return this.reconcileContendedJob(intent, executor);
      }
    });
  }

  async completeExecutedJob(intent, ownedWorkflow, result, runOptions) {
    const outcome = await this.transitionTerminal(intent, ownedWorkflow, {
      nextStep: SCHEMA_PROVISIONING_JOB_STEP.SUCCEEDED,
      reason: SCHEMA_PROVISIONING_REASON.PROVISIONING_COMPLETE,
      updates: {
        status: SCHEMA_PROVISIONING_JOB_STATUS.SUCCEEDED,
        reasonCodes: [SCHEMA_PROVISIONING_REASON.PROVISIONING_COMPLETE],
        result,
        retryAfterMs: 0,
        completedAt: this.now(),
      },
    });
    const notifyBackground = runOptions.background === true ||
      runOptions.completionState?.callerDetached === true;
    if (notifyBackground) {
      await this.notifyBackgroundSucceeded(intent, outcome, {...runOptions, background: true});
    } else {
      this.retryCompletionHandlers.delete(intent.workflowId);
    }
    return outcome;
  }

  async reconcileContendedJob(intent, executor) {
    let row;
    try {
      row = await this.repository.findByTableIdentity(intent.tableIdentityKey);
    } catch (error) {
      this.scheduleRetry(intent, executor);
      throw error;
    }
    if (!row || !matchesIntent(row, intent)) throw createIntentConflictError(intent);
    const workflow = this.refreshWorkflowFromRow(row);
    if (SCHEMA_PROVISIONING_JOB_TERMINAL_STATUSES.has(workflow.status)) {
      this.clearScheduledRetry(intent.workflowId);
      this.retryCompletionHandlers.delete(intent.workflowId);
      return this.buildOutcome(workflow);
    }
    this.scheduleRetry(intent, executor, workflow.leaseExpiresAt);
    return this.buildOutcome(workflow, {reasonCodes: [SCHEMA_PROVISIONING_REASON.ACTIVE_OWNER]});
  }

  async handleExecuteJobError(intent, executor, ownedWorkflow, error) {
    if (isLostOwnership(error)) throw error;
    if (isTransientProvisioningError(error)) {
      return this.transitionPendingForRetry(intent, executor, ownedWorkflow, error);
    }
    this.retryCompletionHandlers.delete(intent.workflowId);
    return this.transitionTerminal(intent, ownedWorkflow, {
      nextStep: SCHEMA_PROVISIONING_JOB_STEP.FAILED,
      reason: SCHEMA_PROVISIONING_REASON.PROVISIONING_FAILED,
      updates: {
        status: SCHEMA_PROVISIONING_JOB_STATUS.FAILED,
        reasonCodes: [SCHEMA_PROVISIONING_REASON.PROVISIONING_FAILED],
        errorCode: error.code || error.errorCode || SCHEMA_PROVISIONING_FAILED_CODE,
        errorMessage: error.message,
        completedAt: this.now(),
      },
    });
  }

  async executeJob(intent, executor, runOptions = {}) {
    const workflow = this.workflowCoordinator.requireWorkflow(intent.workflowId);
    if (SCHEMA_PROVISIONING_JOB_TERMINAL_STATUSES.has(workflow.status)) {
      this.clearScheduledRetry(intent.workflowId);
      this.retryCompletionHandlers.delete(intent.workflowId);
      return this.buildOutcome(workflow);
    }
    const claim = await this.claimOwnership(workflow, (workflow.fenceToken || 0) + 1);
    if (!claim.accepted) {
      return this.reconcileContendedJob(intent, executor);
    }
    const ownedWorkflow = claim.workflow;
    try {
      await this.workflowCoordinator.transitionStep(workflow.workflowId, {
        nextStep: SCHEMA_PROVISIONING_JOB_STEP.PROJECTING_METADATA,
        reason: SCHEMA_PROVISIONING_REASON.METADATA_PROJECTING,
        fenceToken: ownedWorkflow.fenceToken,
        ownerId: this.ownerId,
      }, {
        status: SCHEMA_PROVISIONING_JOB_STATUS.RUNNING,
        reasonCodes: [SCHEMA_PROVISIONING_REASON.METADATA_PROJECTING],
      }, {markCommitted: false});
      const result = await executor({
        ...intent,
        ownerFenceToken: ownedWorkflow.fenceToken,
        assertOwnership: () => this.assertOwnership(ownedWorkflow),
      });
      if (!isTerminalProvisioningSuccess(result)) {
        return this.transitionPendingForRetry(intent, executor, ownedWorkflow);
      }
      return await this.completeExecutedJob(intent, ownedWorkflow, result, runOptions);
    } catch (error) {
      return this.handleExecuteJobError(intent, executor, ownedWorkflow, error);
    }
  }

  async waitForRequest(execution, workflow, timeoutBudget, completionState = null) {
    if (!timeoutBudget) return execution;
    const remainingMs = getRemainingBudgetMs(timeoutBudget, {now: this.now});
    if (remainingMs <= 1) {
      if (completionState) completionState.callerDetached = true;
      reportSchemaProvisioningDeadlineSpent(
        this, workflow, timeoutBudget,
        SCHEMA_PROVISIONING_DEADLINE_WAIT.preExpired,
      );
      return this.buildOutcome(workflow, {provisioningDeadlineExpired: true});
    }
    let timerId;
    const deadline = new Promise((resolve) => {
      timerId = this.setTimeoutFn(() => {
        if (completionState) completionState.callerDetached = true;
        reportSchemaProvisioningDeadlineSpent(
          this, workflow, timeoutBudget,
          SCHEMA_PROVISIONING_DEADLINE_WAIT.armed,
        );
        resolve(
          this.buildOutcome(workflow, {provisioningDeadlineExpired: true}),
        );
      }, Math.max(1, remainingMs - 1));
    });
    try {
      return await Promise.race([execution, deadline]);
    } finally {
      this.clearTimeoutFn(timerId);
    }
  }

  async execute(ast, options = {}, executor) {
    const intent = canonicalizeSchemaProvisioningIntent(ast, options);
    if (options.onBackgroundSucceeded) {
      this.retryCompletionHandlers.set(
        intent.workflowId,
        options.onBackgroundSucceeded,
      );
    }
    const completionState = {callerDetached: false};
    // The deadline race is armed BEFORE the first await: insertOrAttach's
    // schema_operations gateway read/insert has no deadline of its own, and
    // on a lone bootstrapping seed that partition's routability can hold
    // the await past the admin client's cap with no response at all
    // (round-7 root cause of the phase-1 admin-response timeouts; local
    // baseline repro plus archived run 21-34-12). A slow prologue now
    // yields a PENDING/RETRY outcome instead of client-side silence.
    const prologueWorkflow = {
      workflowId: intent.workflowId,
      status: SCHEMA_PROVISIONING_JOB_STATUS.PENDING,
      retryAfterMs: this.retryAfterMs,
    };
    const execution = (async () => {
      const {row} = await this.insertOrAttach(intent);
      const workflow = this.refreshWorkflowFromRow(row);
      if (SCHEMA_PROVISIONING_JOB_TERMINAL_STATUSES.has(workflow.status)) {
        this.clearScheduledRetry(intent.workflowId);
        const outcome = this.buildOutcome(workflow);
        if (completionState.callerDetached &&
            workflow.status === SCHEMA_PROVISIONING_JOB_STATUS.SUCCEEDED) {
          await this.notifyBackgroundSucceeded(intent, outcome, {background: true});
        }
        return outcome;
      }
      this.clearScheduledRetry(intent.workflowId);
      return this.workflowCoordinator.runExclusive(
        intent.ownerKey,
        () => this.runJob(intent, executor, {completionState}),
      );
    })();
    return this.waitForRequest(
      execution,
      prologueWorkflow,
      options.timeoutBudget,
      completionState,
    );
  }

  async findSucceededGlobalIndexIntent(datasetName, generation) {
    const {tableIdentityKey} = resolveIntentTableIdentity(
      {tableName: datasetName}, {globalIndex: {generation}});
    const row = await this.repository.findByTableIdentity(tableIdentityKey);
    return row?.status === SCHEMA_PROVISIONING_JOB_STATUS.SUCCEEDED ?
      recoverIntentFromRow(row) : null;
  }

  scheduleDiscovery(read, resume, delayMs) {
    if (this.shuttingDown) return;
    const timer = this.retrySetTimeoutFn(() => {
      if (this.discoveryRetries.get(read) !== timer) return;
      this.discoveryRetries.delete(read);
      this.discoveryReads.delete(read);
      void this.discover(read, resume).catch((error) =>
        this.logger?.warn?.(QUERY_LOG_MSG.SCHEMA_PROVISIONING_RECOVERY_DEFERRED,
          {error: error.message}));
    }, delayMs);
    this.discoveryRetries.set(read, timer);
    timer?.unref?.();
  }

  discover(read, resume) {
    if (this.shuttingDown) return Promise.resolve([]);
    const active = this.discoveryReads.get(read);
    if (active) return active;
    const scan = Promise.resolve().then(async () => {
      if (this.shuttingDown) return [];
      let rows;
      try {
        rows = await read.call(this);
      } catch (error) {
        this.scheduleDiscovery(read, resume, this.retryAfterMs);
        throw error;
      }
      if (this.shuttingDown) return [];
      // schema_operations does not propagate cache changes. Arm the next
      // inventory before dispatch so a busy executor cannot stall discovery.
      if (read === this.readNonterminalRows) {
        this.scheduleDiscovery(read, resume, this.leaseMs);
      }
      return resume(rows);
    }).finally(() => {
      // A timer retains this scan for all activation triggers until it fires.
      // An older execution can settle after the timer started its successor.
      if (!this.discoveryRetries.has(read) && this.discoveryReads.get(read) === scan) {
        this.discoveryReads.delete(read);
      }
    });
    this.discoveryReads.set(read, scan);
    return scan;
  }

  async readNonterminalRows() {
    const rows = await this.repository.listNonterminalRows();
    return rows.map((row) => ({row, intent: recoverIntentFromRow(row)}));
  }

  async resumeNonterminal(executor) {
    const [outcomes] = await Promise.all([
      this.discover(this.readNonterminalRows,
        (rows) => this.resumeRows(rows, executor)),
      this.discover(this.listSucceededGlobalIndexIntents,
        (intents) => this.resumeSucceededGlobalIndexContinuations(intents)),
    ]);
    return outcomes;
  }

  async resumeRows(rows, executor) {
    const executions = [];
    for (const {row, intent} of rows) {
      if (this.retryTimersByWorkflowId.has(intent.workflowId) ||
          this.workflowCoordinator.hasInFlightExecution(intent.ownerKey)) continue;
      executions.push(this.workflowCoordinator.runExclusive(
        intent.ownerKey,
        () => {
          if (this.shuttingDown) return;
          this.refreshWorkflowFromRow(row);
          return this.runJob(
            intent,
            (job) => executor({...job, ast: intent.ast}),
            {background: true},
          );
        },
      ));
    }
    return Promise.all(executions);
  }
}

export {SchemaProvisioningJobOwner};
