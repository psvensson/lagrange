import {
  isControlPlaneWriterShutDown,
  isTerminalTypedDistributedFailure,
} from '../control-plane/control-plane-error-classification.js';
import {TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
} from '../control-plane/control-plane-system-table-gateway.js';
import {PRESSURE_WORK_CLASS} from '../control-plane/pressure-governor.js';
import {SCHEMA_PROVISIONING_ERROR_CODE, SCHEMA_PROVISIONING_JOB_STATUS} from
  './schema-provisioning-job-constants.js';

const SELECT_BY_IDENTITY =
  `SELECT * FROM ${TABLES.SCHEMA_OPERATIONS} ` +
  'WHERE table_identity_key = ? LIMIT 1';
const RECOVERY_PAGE_SIZE = 32;
const WRITE_OPTIONS = Object.freeze({
  workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
  deliveryPriority: 'critical',
});
const TABLE_LIFECYCLE_READ_OPTIONS = Object.freeze({
  readProfile: 'table_lifecycle',
});
const SCHEMA_JOB_REPOSITORY_ERROR_MSG = Object.freeze({
  INSERT_FAILED: 'Schema provisioning intent insert failed',
  PERSISTENCE_UNAVAILABLE:
    'Schema provisioning job persistence is unavailable',
});

function isTerminalSchemaWriteRejection(error) {
  return error?.committed === true || isTerminalTypedDistributedFailure(error) ||
    isControlPlaneWriterShutDown(error);
}

function createPersistenceUnavailableError() {
  const error = new Error(
    SCHEMA_JOB_REPOSITORY_ERROR_MSG.PERSISTENCE_UNAVAILABLE,
  );
  error.code = SCHEMA_PROVISIONING_ERROR_CODE.PERSISTENCE_UNAVAILABLE;
  return error;
}

const JOB_STATUSES = new Set(Object.values(SCHEMA_PROVISIONING_JOB_STATUS));

function isDurableInteger(value, minimum) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/u.test(value))) {
    return false;
  }
  return Number.isSafeInteger(Number(value)) && Number(value) >= minimum;
}

function hasWorkflowAuthority(row) {
  if (!row?.job_id || row.workflow_id !== row.job_id || !row.owner_key ||
      !row.intent_hash || !row.table_identity_key || !JOB_STATUSES.has(row.status)) return false;
  if (!isDurableInteger(row.row_version, 1) || !isDurableInteger(row.workflow_fence_token, 0)) {
    return false;
  }
  return row.workflow_owner_id == null ? row.workflow_lease_expires_at == null :
    isDurableInteger(row.workflow_lease_expires_at, 0);
}

function authoritativeRows(result) {
  if (result?.success === false || !Array.isArray(result?.rows) ||
      !result.rows.every(hasWorkflowAuthority)) throw createPersistenceUnavailableError();
  return result.rows;
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
    tableId: row.table_id ?? null,
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
    // schema_operations.status is NOT NULL and every owner-built workflow
    // sets it; step is a different vocabulary and never stands in for it.
    status: nextWorkflow.status,
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

function isMatchingPersistedWorkflowRow(observed, current, nextWorkflow, nextRowVersion) {
  return Boolean(observed) &&
    observed.job_id === current.job_id && observed.workflow_id === nextWorkflow.workflowId &&
    observed.owner_key === nextWorkflow.ownerKey && observed.intent_hash === current.intent_hash &&
    observed.status === nextWorkflow.status && observed.current_step === nextWorkflow.step &&
    normalizeNumber(observed.workflow_lease_expires_at) === nextWorkflow.leaseExpiresAt &&
    normalizeNumber(observed.row_version) === nextRowVersion &&
    normalizeNumber(observed.workflow_fence_token) === (nextWorkflow.fenceToken ?? 0) &&
    (observed.workflow_owner_id ?? null) === (nextWorkflow.workflowOwnerId ?? null);
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
    this.rowsByJobId = new Map();
  }

  setGateway(gateway) {
    this.gateway = gateway || null;
  }

  async findByTableIdentity(tableIdentityKey) {
    if (typeof this.gateway?.readRows !== 'function') throw createPersistenceUnavailableError();
    const result = await this.gateway.readRows(
      TABLES.SCHEMA_OPERATIONS, SELECT_BY_IDENTITY, [tableIdentityKey], TABLE_LIFECYCLE_READ_OPTIONS,
    );
    const [row = null] = authoritativeRows(result);
    if (row && row.table_identity_key !== tableIdentityKey) throw createPersistenceUnavailableError();
    if (row) this.rowsByJobId.set(row.job_id, row);
    return row;
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
    if (result?.success === false && isTerminalSchemaWriteRejection(result)) {
      throw Object.assign(new Error(result.error, {cause: result}), result);
    }
    const affectedRows = resolveAffectedRows(result);
    if (result?.success === false || affectedRows !== 1) {
      const observed = current?.table_identity_key ?
        await this.findByTableIdentity(current.table_identity_key).catch(() => null) :
        null;
      if (isMatchingPersistedWorkflowRow(observed, current, nextWorkflow, nextRowVersion)) {
        return {accepted: true, workflow: rowToWorkflow(observed)};
      }
      return {accepted: false};
    }
    const row = {...current, ...data};
    this.rowsByJobId.set(row.job_id, row);
    return {accepted: true, workflow: nextWorkflow};
  }

  async findRecoveryRow(leader, tableIdentityKey) {
    const tenure = leader.leadershipTenure;
    const result = await leader.executeLocalQuery(SELECT_BY_IDENTITY, [tableIdentityKey]);
    if (!tenure || tenure !== leader.leadershipTenure || result?.rowSetComplete !== true ||
        result.partitionId !== leader.partitionId) throw createPersistenceUnavailableError();
    const [row] = authoritativeRows(result);
    if (row && row.table_identity_key !== tableIdentityKey) throw createPersistenceUnavailableError();
    if (row) this.rowsByJobId.set(row.job_id, row);
    return row || null;
  }

  async listRecoveryPage(leader, status, cursor) {
    // The existing (status, updated_at) SQLite index ends in rowid. Seek
    // backwards so later appends cannot perpetually extend a pass.
    const sql = `SELECT *, rowid AS recovery_rowid FROM ${TABLES.SCHEMA_OPERATIONS} ` +
      'WHERE status = ? ' + (cursor ? 'AND (updated_at, rowid) < (?, ?) ' : '') +
      `ORDER BY updated_at DESC, rowid DESC LIMIT ${RECOVERY_PAGE_SIZE}`;
    const params = cursor ? [status, cursor.updatedAt, cursor.rowId] : [status];
    const result = await leader.executeLocalQuery(sql, params);
    if (result?.rowSetComplete !== true || result.partitionId !== leader.partitionId) {
      throw createPersistenceUnavailableError();
    }
    const rows = authoritativeRows(result);
    if (rows.length > RECOVERY_PAGE_SIZE || rows.some((row) => row.status !== status ||
        !Number.isSafeInteger(row.recovery_rowid) || !Number.isSafeInteger(row.updated_at))) {
      throw createPersistenceUnavailableError();
    }
    return rows;
  }

}

export {
  RECOVERY_PAGE_SIZE,
  SchemaProvisioningJobRepository,
  isTerminalSchemaWriteRejection,
  rowToWorkflow,
  serializeWorkflow,
};
