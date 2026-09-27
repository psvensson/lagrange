// Public-seam CREATE can resolve with a durable schema job that is still
// pending. This observer submits the mutation once, then follows only that
// job's canonical schema_operations row until its owner reaches a terminal
// state. It never retries CREATE.

import {TABLES} from '../../../src/constants/index.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../../src/control-plane/owner-contract-outcome.js';
import {
  SCHEMA_PROVISIONING_JOB_STATUS,
} from '../../../src/query/schema-provisioning-job-constants.js';
import {
  EMBEDDED_STEP_OUTCOME,
  decodeExposure,
  describeExposedError,
} from './embedded-node-protocol.js';

const SCHEMA_JOB_SQL =
  'SELECT job_id, status, current_step, reason_codes, attempt_count, ' +
  `error_code, error_message, completed_at FROM ${TABLES.SCHEMA_OPERATIONS} ` +
  'WHERE job_id = ?';

const SCHEMA_READINESS = Object.freeze({
  FAILED: 'failed',
  OBSERVING: 'observing',
  PENDING: 'pending',
  READY: 'ready',
});

function isReadyCreateResult(result) {
  return result.success !== false &&
    result.contractState === OWNER_CONTRACT_STATE.READY &&
    result.nextAction === OWNER_CONTRACT_NEXT_ACTION.PROCEED;
}

function isPendingCreateResult(result) {
  return result.success !== false &&
    result.contractState === OWNER_CONTRACT_STATE.PENDING &&
    result.nextAction === OWNER_CONTRACT_NEXT_ACTION.RETRY &&
    typeof result.jobId === 'string' &&
    result.jobId.length > 0;
}

function createContractProjection(outcome) {
  if (outcome?.outcome !== EMBEDDED_STEP_OUTCOME.FULFILLED) {
    return {
      readiness: SCHEMA_READINESS.FAILED,
      error: describeExposedError(outcome?.value),
    };
  }
  const result = decodeExposure(outcome.value) || {};
  const projection = {
    success: result.success,
    jobId: result.jobId,
    contractState: result.contractState,
    nextAction: result.nextAction,
    completionState: result.completionState,
    completionReason: result.completionReason,
    reasonCodes: result.reasonCodes,
    retryAfterMs: result.retryAfterMs,
    error: result.error,
    errorCode: result.errorCode,
  };
  if (isReadyCreateResult(result)) {
    return {...projection, readiness: SCHEMA_READINESS.READY};
  }
  if (isPendingCreateResult(result)) {
    return {...projection, readiness: SCHEMA_READINESS.PENDING};
  }
  return {
    ...projection,
    readiness: SCHEMA_READINESS.FAILED,
    error: result.error || 'CREATE returned no actionable schema-owner contract',
  };
}

function projectSchemaJobStatus(projection) {
  switch (projection.status) {
  case SCHEMA_PROVISIONING_JOB_STATUS.SUCCEEDED:
    return {...projection, readiness: SCHEMA_READINESS.READY};
  case SCHEMA_PROVISIONING_JOB_STATUS.FAILED:
    return {
      ...projection,
      readiness: SCHEMA_READINESS.FAILED,
      errorMessage:
        projection.errorMessage || 'schema provisioning job FAILED',
    };
  case SCHEMA_PROVISIONING_JOB_STATUS.PENDING:
  case SCHEMA_PROVISIONING_JOB_STATUS.RUNNING:
    return {...projection, readiness: SCHEMA_READINESS.OBSERVING};
  default:
    return {
      ...projection,
      readiness: SCHEMA_READINESS.FAILED,
      errorMessage: `unknown schema job status: ${String(projection.status)}`,
    };
  }
}

function schemaJobProjection(outcome, jobId) {
  if (outcome?.outcome !== EMBEDDED_STEP_OUTCOME.FULFILLED) {
    return {
      readiness: SCHEMA_READINESS.OBSERVING,
      observationError: describeExposedError(outcome?.value),
    };
  }
  const result = decodeExposure(outcome.value) || {};
  const row = Array.isArray(result.rows) ? result.rows[0] : null;
  if (!row || row.job_id !== jobId) {
    return {readiness: SCHEMA_READINESS.OBSERVING, status: null};
  }
  const projection = {
    jobId: row.job_id,
    status: row.status,
    currentStep: row.current_step,
    reasonCodes: row.reason_codes,
    attemptCount: row.attempt_count,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    completedAt: row.completed_at,
  };
  return projectSchemaJobStatus(projection);
}

function buildObservationResult(startedAt, now, create, job, observations) {
  const ready = create.readiness === SCHEMA_READINESS.READY ||
    job?.readiness === SCHEMA_READINESS.READY;
  return {
    ready,
    elapsedMs: now() - startedAt,
    create,
    job,
    observations,
    failure: ready ? null :
      (job?.errorMessage || job?.observationError || create.error ||
        'schema provisioning deadline reached'),
  };
}

/**
 * Submit CREATE once and, only when its owner says pending/retry, observe the
 * exact durable job to terminal status through read-only SELECTs.
 * @param {Object} options - observation dependencies and bounds
 * @return {Promise<Object>} compact readiness evidence
 */
async function createTableAndAwaitSchemaProvisioning(options) {
  const {
    createSql,
    deadlineMs,
    now = Date.now,
    pollIntervalMs,
    query,
    sleep,
  } = options;
  const startedAt = now();
  const create = createContractProjection(await query(createSql, []));
  if (create.readiness !== SCHEMA_READINESS.PENDING) {
    return buildObservationResult(startedAt, now, create, null, 0);
  }
  let job = null;
  let observations = 0;
  while (now() < deadlineMs) {
    job = schemaJobProjection(
      await query(SCHEMA_JOB_SQL, [create.jobId]),
      create.jobId,
    );
    observations++;
    if (
      job.readiness === SCHEMA_READINESS.READY ||
      job.readiness === SCHEMA_READINESS.FAILED
    ) {
      return buildObservationResult(
        startedAt, now, create, job, observations,
      );
    }
    const remainingMs = deadlineMs - now();
    if (remainingMs <= 0) break;
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
  return buildObservationResult(startedAt, now, create, job, observations);
}

export {
  SCHEMA_JOB_SQL,
  createTableAndAwaitSchemaProvisioning,
};
