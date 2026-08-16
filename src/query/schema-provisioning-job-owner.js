import {randomUUID} from 'node:crypto';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
} from '../control-plane/owner-contract-outcome.js';
import {getRemainingBudgetMs} from '../control-plane/timeout-budget.js';
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
import {canonicalizeSchemaProvisioningIntent} from
  './schema-provisioning-intent.js';
import {QUERY_ERROR_CODE} from './query-constants.js';
import {rowToWorkflow, serializeWorkflow} from
  './schema-provisioning-job-repository.js';

const TRANSIENT_ERROR_FRAGMENT = Object.freeze({
  CANCEL_CODE: 'CANCEL',
  CANCEL_MESSAGE: 'cancel',
  // A zero-change idempotent re-create whose leader read-back cannot yet
  // prove visibility is a timing outcome, not a semantic failure: the
  // durable row exists (often already COMPLETED from the prior attempt) and
  // the job's next retry attaches to it. Terminal-failing it poisoned every
  // later CREATE of the same table via the schema_operations short-circuit
  // (round-7 root cause; local repro + archived run 22-15-08).
  NOT_CONFIRMED_MESSAGE: 'authoritative replica operation not confirmed',
  STALE_FENCE_MESSAGE: 'stale fence',
  TIMEOUT_CODE: 'TIMEOUT',
  TIMEOUT_MESSAGE: 'timeout',
  TIMED_OUT_MESSAGE: 'timed out',
});
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

export function isTransientProvisioningError(error) {
  const code = String(error?.code || error?.errorCode || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes(TRANSIENT_ERROR_FRAGMENT.TIMEOUT_CODE) ||
    code.includes(TRANSIENT_ERROR_FRAGMENT.CANCEL_CODE) ||
    code === QUERY_ERROR_CODE.TABLE_PARTITION_PROVISIONING_RETRYABLE ||
    message.includes(TRANSIENT_ERROR_FRAGMENT.TIMEOUT_MESSAGE) ||
    message.includes(TRANSIENT_ERROR_FRAGMENT.TIMED_OUT_MESSAGE) ||
    message.includes(TRANSIENT_ERROR_FRAGMENT.CANCEL_MESSAGE) ||
    message.includes(TRANSIENT_ERROR_FRAGMENT.STALE_FENCE_MESSAGE) ||
    message.includes(TRANSIENT_ERROR_FRAGMENT.NOT_CONFIRMED_MESSAGE) ||
    code === SCHEMA_PROVISIONING_ERROR_CODE.STALE_OWNER;
}

function recoverIntentFromRow(row) {
  const intent = JSON.parse(row.normalized_ddl);
  return {
    intent,
    ast: {
      tableName: intent.tableName,
      columns: intent.columns,
      primaryKey: intent.primaryKey,
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
    tableId: row.table_id,
    partitionId: `${row.table_id}-p1`,
  };
}

function resolveOutcomeReasonCodes(workflow, options) {
  if (Array.isArray(options.reasonCodes)) return options.reasonCodes;
  return Array.isArray(workflow.reasonCodes) ? workflow.reasonCodes : [];
}

class SchemaProvisioningJobOwner {
  constructor(options = {}) {
    this.repository = options.repository;
    this.now = options.now || (() => Date.now());
    this.ownerId = options.ownerId || `schema-worker-${randomUUID()}`;
    this.leaseMs = options.leaseMs || SCHEMA_PROVISIONING_DEFAULT.LEASE_MS;
    this.retryAfterMs = options.retryAfterMs ||
      SCHEMA_PROVISIONING_DEFAULT.RETRY_AFTER_MS;
    this.setTimeoutFn = options.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
    this.retrySetTimeoutFn = options.retrySetTimeoutFn || setTimeout;
    this.retryClearTimeoutFn = options.retryClearTimeoutFn || clearTimeout;
    this.retryTimersByWorkflowId = new Map();
    this.shuttingDown = false;
    this.workflowCoordinator = options.workflowCoordinator ||
      new DurableWorkflowCoordinator({
        now: this.now,
        persistWorkflowClaim: (workflow, context) =>
          this.repository.persistWorkflowCandidate(workflow, context),
        persistWorkflowTransition: (workflow, context) =>
          this.repository.persistWorkflowCandidate(workflow, context),
        isTerminalWorkflow: (workflow) =>
          SCHEMA_PROVISIONING_JOB_TERMINAL_STATUSES.has(workflow.status),
      });
    this.recover();
  }

  recover() {
    return this.workflowCoordinator.recover({
      workflows: this.repository.recoverWorkflowRows(),
      isTerminalWorkflow: () => false,
    });
  }

  clearScheduledRetry(workflowId) {
    const scheduled = this.retryTimersByWorkflowId.get(workflowId);
    if (!scheduled) return;
    this.retryTimersByWorkflowId.delete(workflowId);
    if (scheduled.timerId !== null && scheduled.timerId !== undefined) {
      this.retryClearTimeoutFn(scheduled.timerId);
    }
  }

  scheduleRetry(intent, executor) {
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
        () => this.runJob(intent, executor),
      );
      void execution.catch(() => {
        this.scheduleRetry(intent, executor);
      });
    };
    this.retryTimersByWorkflowId.set(intent.workflowId, scheduled);
    scheduled.timerId = this.retrySetTimeoutFn(
      retry,
      Math.max(1, workflow.retryAfterMs || this.retryAfterMs),
    );
    scheduled.timerId?.unref?.();
  }

  shutdown() {
    this.shuttingDown = true;
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
    if (existing && existing.intent_hash !== intent.intentHash) {
      throw createIntentConflictError(intent);
    }
    if (existing) return {created: false, row: existing};
    const workflow = buildInitialWorkflow(intent, this.now());
    const inserted = await this.repository.insertIntent(
      buildInitialRow(intent, workflow),
    );
    if (inserted.row.intent_hash !== intent.intentHash) {
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
          contractState: OWNER_CONTRACT_STATE.READY,
          nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
        }),
        jobId: workflow.workflowId,
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

  async assertOwnership(workflow) {
    const claim = await this.workflowCoordinator.claimWorkflow(
      workflow.workflowId,
      {
        ownerId: this.ownerId,
        fenceToken: workflow.fenceToken,
        leaseExpiresAt: this.now() + this.leaseMs,
      },
    );
    if (!claim.accepted) {
      const error = new Error('Schema provisioning owner fence is stale');
      error.code = SCHEMA_PROVISIONING_ERROR_CODE.STALE_OWNER;
      throw error;
    }
    return claim.workflow;
  }

  async transitionPendingForRetry(intent, executor, workflow) {
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
    });
    this.scheduleRetry(intent, executor);
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

  async runJob(intent, executor) {
    const workflow = this.workflowCoordinator.requireWorkflow(intent.workflowId);
    if (SCHEMA_PROVISIONING_JOB_TERMINAL_STATUSES.has(workflow.status)) {
      this.clearScheduledRetry(intent.workflowId);
      return this.buildOutcome(workflow);
    }
    const claim = await this.workflowCoordinator.claimWorkflow(
      workflow.workflowId,
      {
        ownerId: this.ownerId,
        fenceToken: (workflow.fenceToken || 0) + 1,
        leaseExpiresAt: this.now() + this.leaseMs,
      },
    );
    if (!claim.accepted) {
      return this.buildOutcome(workflow, {
        reasonCodes: [SCHEMA_PROVISIONING_REASON.ACTIVE_OWNER],
      });
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
      });
      const result = await executor({
        ...intent,
        ownerFenceToken: ownedWorkflow.fenceToken,
        assertOwnership: () => this.assertOwnership(ownedWorkflow),
      });
      if (result?.contractState !== OWNER_CONTRACT_STATE.READY) {
        return this.transitionPendingForRetry(
          intent,
          executor,
          ownedWorkflow,
        );
      }
      return this.transitionTerminal(intent, ownedWorkflow, {
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
    } catch (error) {
      if (isTransientProvisioningError(error)) {
        if (error.code === SCHEMA_PROVISIONING_ERROR_CODE.STALE_OWNER) {
          return this.buildOutcome(ownedWorkflow, {
            reasonCodes: [SCHEMA_PROVISIONING_REASON.ACTIVE_OWNER],
          });
        }
        return this.transitionPendingForRetry(
          intent,
          executor,
          ownedWorkflow,
        );
      }
      return this.transitionTerminal(intent, ownedWorkflow, {
        nextStep: SCHEMA_PROVISIONING_JOB_STEP.FAILED,
        reason: SCHEMA_PROVISIONING_REASON.PROVISIONING_FAILED,
        updates: {
          status: SCHEMA_PROVISIONING_JOB_STATUS.FAILED,
          reasonCodes: [SCHEMA_PROVISIONING_REASON.PROVISIONING_FAILED],
          errorCode:
            error.code || error.errorCode || SCHEMA_PROVISIONING_FAILED_CODE,
          errorMessage: error.message,
          completedAt: this.now(),
        },
      });
    }
  }

  async waitForRequest(execution, workflow, timeoutBudget) {
    if (!timeoutBudget) return execution;
    const remainingMs = getRemainingBudgetMs(timeoutBudget, {now: this.now});
    if (remainingMs <= 1) {
      return this.buildOutcome(workflow, {provisioningDeadlineExpired: true});
    }
    let timerId;
    const deadline = new Promise((resolve) => {
      timerId = this.setTimeoutFn(() => resolve(
        this.buildOutcome(workflow, {provisioningDeadlineExpired: true}),
      ), Math.max(1, remainingMs - 1));
    });
    try {
      return await Promise.race([execution, deadline]);
    } finally {
      this.clearTimeoutFn(timerId);
    }
  }

  async execute(ast, options = {}, executor) {
    const intent = canonicalizeSchemaProvisioningIntent(ast, options);
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
        return this.buildOutcome(workflow);
      }
      this.clearScheduledRetry(intent.workflowId);
      return this.workflowCoordinator.runExclusive(
        intent.ownerKey,
        () => this.runJob(intent, executor),
      );
    })();
    return this.waitForRequest(
      execution,
      prologueWorkflow,
      options.timeoutBudget,
    );
  }

  async resumeNonterminal(executor) {
    this.recover();
    const executions = [];
    const rows = await this.repository.listNonterminalRows();
    this.workflowCoordinator.recover({workflows: rows.map(rowToWorkflow)});
    for (const row of rows) {
      const intent = recoverIntentFromRow(row);
      this.clearScheduledRetry(intent.workflowId);
      executions.push(this.workflowCoordinator.runExclusive(
        intent.ownerKey,
        () => this.runJob(intent, (job) => executor({...job, ast: intent.ast})),
      ));
    }
    return Promise.all(executions);
  }
}

export {SchemaProvisioningJobOwner};
