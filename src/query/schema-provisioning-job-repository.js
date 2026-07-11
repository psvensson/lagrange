import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {SCHEMA_PROVISIONING_ERROR_CODE} from
  './schema-provisioning-job-constants.js';

const SELECT_BY_IDENTITY =
  `SELECT * FROM ${TABLES.SCHEMA_OPERATIONS} ` +
  'WHERE table_identity_key = ? LIMIT 1';
const SELECT_NONTERMINAL =
  `SELECT * FROM ${TABLES.SCHEMA_OPERATIONS} ` +
  'WHERE status NOT IN (\'SUCCEEDED\', \'FAILED\')';

const WRITE_OPTIONS = Object.freeze({
  allowPendingVisibility: true,
  workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
  deliveryPriority: 'critical',
});
const SCHEMA_JOB_REPOSITORY_ERROR_MSG = Object.freeze({
  INSERT_FAILED: 'Schema provisioning intent insert failed',
  PERSISTENCE_UNAVAILABLE:
    'Schema provisioning job persistence is unavailable',
});
const SCHEMA_JOB_TERMINAL_STATUS = Object.freeze({
  FAILED: 'FAILED',
  SUCCEEDED: 'SUCCEEDED',
});

function createPersistenceUnavailableError() {
  const error = new Error(
    SCHEMA_JOB_REPOSITORY_ERROR_MSG.PERSISTENCE_UNAVAILABLE,
  );
  error.code = SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE;
  return error;
}

function parseJson(value, fallback) {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serializeWorkflow(workflow) {
  return JSON.stringify({
    participants: workflow.participants instanceof Map ?
      [...workflow.participants.values()] : [],
    transitionHistory: [...(workflow.transitionHistory ?? [])],
    enlistedParticipantCount: workflow.enlistedParticipantCount ?? 0,
  });
}

function normalizeNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function buildParticipantMap(participantRows) {
  return new Map(participantRows.map((participant) => [
    String(
      participant.participantKey ??
      participant.partitionId ??
      participant.participantId,
    ),
    participant,
  ]));
}

function rowToWorkflow(row = {}) {
  const record = parseJson(row.workflow_record, {});
  const participantRows = Array.isArray(record.participants) ?
    record.participants : [];
  return {
    workflowId: row.workflow_id,
    ownerKey: row.owner_key,
    step: row.current_step,
    status: row.status,
    fenceToken: normalizeNumber(row.workflow_fence_token),
    workflowOwnerId: row.workflow_owner_id ?? null,
    leaseExpiresAt: normalizeNumber(row.workflow_lease_expires_at),
    attemptCount: normalizeNumber(row.attempt_count),
    rowVersion: normalizeNumber(row.row_version, 1),
    reasonCodes: parseJson(row.reason_codes, []),
    retryAfterMs: normalizeNumber(row.retry_after_ms),
    result: parseJson(row.result_json, null),
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    createdAt: normalizeNumber(row.created_at),
    updatedAt: normalizeNumber(row.updated_at),
    completedAt: normalizeNumber(row.completed_at, null),
    transitionHistory: Array.isArray(record.transitionHistory) ?
      record.transitionHistory : [],
    participants: buildParticipantMap(participantRows),
    enlistedParticipantCount: normalizeNumber(record.enlistedParticipantCount),
  };
}

function serializeNullableJson(value) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function buildWorkflowMutationData(nextWorkflow, nextRowVersion) {
  return {
    row_version: nextRowVersion,
    status: nextWorkflow.status ?? nextWorkflow.step,
    current_step: nextWorkflow.step,
    reason_codes: JSON.stringify(nextWorkflow.reasonCodes ?? []),
    retry_after_ms: nextWorkflow.retryAfterMs ?? 0,
    workflow_record: serializeWorkflow(nextWorkflow),
    workflow_fence_token: nextWorkflow.fenceToken ?? 0,
    workflow_owner_id: nextWorkflow.workflowOwnerId ?? null,
    workflow_lease_expires_at: nextWorkflow.leaseExpiresAt ?? null,
    attempt_count: nextWorkflow.attemptCount ?? 0,
    result_json: serializeNullableJson(nextWorkflow.result),
    error_code: nextWorkflow.errorCode ?? null,
    error_message: nextWorkflow.errorMessage ?? null,
    updated_at: nextWorkflow.updatedAt,
    completed_at: nextWorkflow.completedAt ?? null,
  };
}

function resolveAffectedRows(result) {
  const value = Number(
    result?.partitionResult?.affectedRows ??
    result?.affectedRows ??
    result?.changes,
  );
  return Number.isFinite(value) ? value : null;
}

function canPersistWorkflowCandidate(repository, candidate) {
  return repository.rowsByJobId.has(candidate.workflowId) &&
    typeof repository.gateway?.submitMutation === 'function';
}

function buildWorkflowMutationWhere(candidate, previousWorkflow, context) {
  const whereClause = {
    job_id: candidate.workflowId,
    row_version: previousWorkflow.rowVersion || 1,
    workflow_fence_token: context.expectedFenceToken ?? 0,
  };
  if (typeof context.expectedOwnerId === 'string') {
    whereClause.workflow_owner_id = context.expectedOwnerId;
  }
  return whereClause;
}

class SchemaProvisioningJobRepository {
  constructor(options = {}) {
    this.gateway = options.gateway || null;
    this.systemCache = options.systemCache || null;
    this.rowsByJobId = new Map();
  }

  setSystemCache(systemCache) {
    this.systemCache = systemCache || null;
  }

  setGateway(gateway) {
    this.gateway = gateway || null;
  }

  findCachedRow(predicate) {
    for (const row of this.rowsByJobId.values()) {
      if (predicate(row)) return row;
    }
    const rows = this.systemCache?.getAll?.(TABLES.SCHEMA_OPERATIONS) || [];
    return rows.find(predicate) || null;
  }

  async findByTableIdentity(tableIdentityKey) {
    if (typeof this.gateway?.readRows === 'function') {
      const result = await this.gateway.readRows(
        TABLES.SCHEMA_OPERATIONS,
        SELECT_BY_IDENTITY,
        [tableIdentityKey],
        {readProfile: 'table_lifecycle'},
      );
      const row = Array.isArray(result?.rows) ? result.rows[0] : null;
      if (row?.job_id) {
        this.rowsByJobId.set(row.job_id, row);
        return row;
      }
    }
    return this.findCachedRow(
      (row) => row.table_identity_key === tableIdentityKey,
    );
  }

  async insertIntent(row) {
    if (typeof this.gateway?.submitMutation !== 'function') {
      throw createPersistenceUnavailableError();
    }
    let result;
    try {
      result = await this.gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: TABLES.SCHEMA_OPERATIONS,
        row,
      }, WRITE_OPTIONS);
    } catch (error) {
      const existing = await this.findByTableIdentity(row.table_identity_key);
      if (existing) return {created: false, row: existing};
      throw error;
    }
    if (result?.success === false) {
      const existing = await this.findByTableIdentity(row.table_identity_key);
      if (existing) return {created: false, row: existing};
      throw new Error(
        result.error || SCHEMA_JOB_REPOSITORY_ERROR_MSG.INSERT_FAILED,
      );
    }
    this.rowsByJobId.set(row.job_id, row);
    return {created: true, row};
  }

  async persistWorkflowCandidate(candidate, context = {}) {
    const current = this.rowsByJobId.get(candidate.workflowId);
    if (!canPersistWorkflowCandidate(this, candidate)) {
      return {accepted: false};
    }
    const previousWorkflow = context.previousWorkflow || {};
    const nextRowVersion = (previousWorkflow.rowVersion || 1) + 1;
    const nextWorkflow = {...candidate, rowVersion: nextRowVersion};
    const data = buildWorkflowMutationData(nextWorkflow, nextRowVersion);
    const result = await this.gateway.submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
      tableName: TABLES.SCHEMA_OPERATIONS,
      whereClause: buildWorkflowMutationWhere(
        candidate,
        previousWorkflow,
        context,
      ),
      data,
    }, WRITE_OPTIONS);
    const affectedRows = resolveAffectedRows(result);
    if (result?.success === false || affectedRows !== 1) {
      return {accepted: false};
    }
    const row = {...current, ...data};
    this.rowsByJobId.set(row.job_id, row);
    return {accepted: true, workflow: nextWorkflow};
  }

  recoverWorkflowRows() {
    const rows = this.systemCache?.getAll?.(TABLES.SCHEMA_OPERATIONS) || [];
    for (const row of rows) {
      if (row?.job_id) this.rowsByJobId.set(row.job_id, row);
    }
    return [...this.rowsByJobId.values()].map(rowToWorkflow);
  }

  listRows() {
    this.recoverWorkflowRows();
    return [...this.rowsByJobId.values()];
  }

  async listNonterminalRows() {
    if (typeof this.gateway?.readRows === 'function') {
      const result = await this.gateway.readRows(
        TABLES.SCHEMA_OPERATIONS,
        SELECT_NONTERMINAL,
        [],
        {readProfile: 'table_lifecycle'},
      );
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      for (const row of rows) {
        if (row?.job_id) this.rowsByJobId.set(row.job_id, row);
      }
      return rows;
    }
    return this.listRows().filter(
      (row) => row.status !== SCHEMA_JOB_TERMINAL_STATUS.SUCCEEDED &&
        row.status !== SCHEMA_JOB_TERMINAL_STATUS.FAILED,
    );
  }
}

export {SchemaProvisioningJobRepository, rowToWorkflow, serializeWorkflow};
