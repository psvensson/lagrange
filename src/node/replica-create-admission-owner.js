/**
 * Durable partition CREATE admission owner. Its exact operation-row CAS
 * orders terminal settlement and physical admission without granting cleanup.
 */
import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {OperationType} from '../rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {buildReplicaCreateAttemptToken} from
  '../rebalancer/replica-create-admission-token.js';
import {
  adoptReplicaCreateAdmissionGeneration,
  reserveReplicaCreateAdmissionGeneration,
} from './replica-create-admission-evidence.js';
import {claimReplicaCreateDurablePhysicalWorker,
  commitReplicaCreateSnapshotInstall, releaseReplicaCreatePhysicalWorker,
  requireReplicaCreateRotationWorkerClaim,
  revalidateReplicaCreatePhysicalWorker, runReplicaCreateExclusive,
  advanceReplicaCreatePhysicalWorker,
  snapshotReplicaCreateInstallAuthority} from
  './replica-create-process-owner.js';
import {closeReplicaCreateAdmissionForLifecycle} from
  './replica-create-lifecycle-close.js';

const CREATE_ADMISSION_STATE = Object.freeze({
  ADMITTED: 'ADMITTED',
  MATERIALIZED: 'MATERIALIZED',
  ROTATING: 'ROTATING',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  CLOSED: 'CLOSED',
});
const CREATE_ADMISSION_ERROR_CODE = Object.freeze({
  DEFERRED: 'REPLICA_CREATE_ADMISSION_DEFERRED',
  REFUSED_TERMINAL: 'REPLICA_CREATE_ADMISSION_REFUSED_TERMINAL',
  STALE: 'REPLICA_CREATE_ADMISSION_STALE',
  INVALID: 'REPLICA_CREATE_ADMISSION_INVALID',
});
const READ_OPERATION_SQL =
  'SELECT * FROM replica_operations WHERE operation_id = ?';
const READ_REPLICA_ADMISSIONS_SQL =
  'SELECT * FROM replica_operations WHERE replica_id = ? ' +
  'AND target_node_id = ? AND create_admission_state IS NOT NULL';
// Scoped to the recovering handler's own entity type: a partition handler
// never reads, takes over, advances or closes a message-group admission.
const READ_TARGET_ADMISSIONS_SQL =
  'SELECT * FROM replica_operations WHERE target_node_id = ? ' +
  'AND entity_type = ? AND create_admission_state IS NOT NULL';
const READ_CURRENT_BOOT_SQL =
  'SELECT node_id, boot_incarnation FROM nodes WHERE node_id = ?';
const CRITICAL_OPTIONS = Object.freeze({
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  deliveryPriority: 'critical',
  workClass: 'critical',
});
const CREATE_ADMISSION_REQUEST_FIELD = Object.freeze({
  OPERATION_ID: 'operationId',
  ENTITY_ID: 'entityId',
  PARTITION_ID: 'partitionId',
  REPLICA_ID: 'replicaId',
  ADMISSION_TOKEN: 'admissionToken',
  ATTEMPT_TOKEN: 'attemptToken',
});
const processOwnerRegistry = new Map();
// A caller's admission basis: exact columns it read that must still hold at
// this owner's CAS. None by default, so the partition path is unchanged.
const NO_ADMISSION_BASIS = Object.freeze({});

function admissionError(code, operationId, message) {
  const error = new Error(message || `${code}: ${operationId}`);
  error.code = code;
  error.errorCode = code;
  error.operationId = operationId || null;
  error.deferRetry = code === CREATE_ADMISSION_ERROR_CODE.DEFERRED;
  return error;
}

function isCreateOperationType(value) {
  return value === OperationType.ADD || value === OperationType.REPLACE;
}

function nullableSafeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) ? normalized : null;
}

function normalizedStringField(source, field) {
  return String(source?.[field] ?? '').trim();
}

function normalizeRequest(request, nodeId) {
  return {
    operationId: normalizedStringField(
      request,
      CREATE_ADMISSION_REQUEST_FIELD.OPERATION_ID,
    ),
    operationType: request?.operationType ?? null,
    entityType: request?.entityType ?? null,
    entityId: normalizedStringField(
      request,
      CREATE_ADMISSION_REQUEST_FIELD.ENTITY_ID,
    ),
    partitionId: normalizedStringField(
      request,
      CREATE_ADMISSION_REQUEST_FIELD.PARTITION_ID,
    ),
    replicaId: normalizedStringField(
      request,
      CREATE_ADMISSION_REQUEST_FIELD.REPLICA_ID,
    ),
    targetNodeId: nodeId,
    admissionToken: normalizedStringField(
      request,
      CREATE_ADMISSION_REQUEST_FIELD.ADMISSION_TOKEN,
    ),
    attemptToken: normalizedStringField(
      request,
      CREATE_ADMISSION_REQUEST_FIELD.ATTEMPT_TOKEN,
    ),
    attemptSeq: nullableSafeInteger(request?.attemptSeq),
    workflowUpdatedAt: nullableSafeInteger(request?.workflowUpdatedAt),
  };
}

function isValidRequest(request) {
  return Boolean(
    request.operationId && isCreateOperationType(request.operationType) &&
    request.entityType && request.entityId && request.partitionId &&
    request.replicaId && request.targetNodeId && request.admissionToken &&
    request.attemptToken && Number.isSafeInteger(request.attemptSeq) &&
    request.attemptSeq > 0 &&
    Number.isSafeInteger(request.workflowUpdatedAt),
  );
}

function rowMatchesRequest(row, request) {
  return row?.operation_id === request.operationId &&
    row.type === request.operationType &&
    row.entity_type === request.entityType &&
    row.entity_id === request.entityId &&
    row.partition_id === request.partitionId &&
    row.replica_id === request.replicaId &&
    row.target_node_id === request.targetNodeId;
}

function rowMatchesAdmissionBasis(row, basis) {
  return Object.entries(basis).every(([column, value]) =>
    (row?.[column] ?? null) === value);
}

function rowMatchesAdmission(row, request, basis = NO_ADMISSION_BASIS) {
  return rowMatchesRequest(row, request) && rowMatchesAdmissionBasis(row, basis) &&
    row.create_admission_token === request.admissionToken &&
    row.create_admission_attempt_token === request.attemptToken &&
    nullableSafeInteger(row.create_admission_attempt_seq) ===
      request.attemptSeq &&
    nullableSafeInteger(row.create_admission_workflow_updated_at) ===
      request.workflowUpdatedAt &&
    nullableSafeInteger(row.create_admission_replica_created_at) !== null;
}

function rowMatchesRotatingPreviousAttempt(row, request) {
  return rowMatchesRequest(row, request) &&
    row.create_admission_state === CREATE_ADMISSION_STATE.ROTATING &&
    row.create_admission_token === request.admissionToken &&
    row.create_admission_previous_attempt_token === request.attemptToken &&
    nullableSafeInteger(row.create_admission_attempt_seq) ===
      request.attemptSeq + 1 &&
    nullableSafeInteger(row.create_admission_workflow_updated_at) ===
      request.workflowUpdatedAt &&
    nullableSafeInteger(row.create_admission_replica_created_at) !== null;
}

function admissionEvidenceFromRow(row, request) {
  return adoptReplicaCreateAdmissionGeneration({
    operationId: request.operationId,
    operationType: request.operationType,
    entityType: request.entityType,
    entityId: request.entityId,
    partitionId: request.partitionId,
    replicaId: request.replicaId,
    targetNodeId: request.targetNodeId,
    admissionState: row.create_admission_state,
    admissionToken: row.create_admission_token,
    attemptToken: row.create_admission_attempt_token,
    previousAttemptToken:
      row.create_admission_previous_attempt_token || null,
    attemptSeq: nullableSafeInteger(row.create_admission_attempt_seq),
    workflowUpdatedAt:
      nullableSafeInteger(row.create_admission_workflow_updated_at),
    ownerIncarnation:
      nullableSafeInteger(row.create_admission_owner_incarnation),
    replicaCreatedAt:
      nullableSafeInteger(row.create_admission_replica_created_at),
    operationTerminal: row.completed_at !== null &&
      row.completed_at !== undefined,
  });
}

function requestFromAdmissionRow(row) {
  return normalizeRequest({
    operationId: row?.operation_id,
    operationType: row?.type,
    entityType: row?.entity_type,
    entityId: row?.entity_id,
    partitionId: row?.partition_id,
    replicaId: row?.replica_id,
    admissionToken: row?.create_admission_token,
    attemptToken: row?.create_admission_attempt_token,
    attemptSeq: row?.create_admission_attempt_seq,
    workflowUpdatedAt: row?.create_admission_workflow_updated_at,
  }, row?.target_node_id);
}

function isClosedAdmission(row) {
  return row?.create_admission_state === CREATE_ADMISSION_STATE.CLOSED;
}

function rowMatchesAdmissionIdentity(row, evidence) {
  const expected = {
    operation_id: evidence?.operationId,
    type: evidence?.operationType,
    entity_type: evidence?.entityType,
    entity_id: evidence?.entityId,
    partition_id: evidence?.partitionId,
    replica_id: evidence?.replicaId,
    target_node_id: evidence?.targetNodeId,
    create_admission_token: evidence?.admissionToken,
  };
  return Object.entries(expected).every(([field, value]) =>
    row?.[field] === value) &&
    nullableSafeInteger(row?.create_admission_replica_created_at) ===
      evidence?.replicaCreatedAt;
}

function isRetainedAdmissionRowEligible(row, request, nodeId) {
  return rowMatchesAdmission(row, request) &&
    row.target_node_id === nodeId && !isClosedAdmission(row);
}

function isRetainedOwnerEligible(previousOwner, currentOwner) {
  if (previousOwner === null || currentOwner === null) return false;
  return currentOwner >= previousOwner;
}

function currentRowMatchesRetainedAdmission(current, retainedEvidence, owner) {
  const request = requestFromAdmissionRow(current);
  return rowMatchesAdmission(current, request) &&
    rowMatchesAdmissionIdentity(current, retainedEvidence) &&
    current.create_admission_owner_incarnation === owner;
}

function isValidAdvanceRequest(evidence, ownerIncarnation,
  expectedStates, nextState) {
  const states = Object.values(CREATE_ADMISSION_STATE);
  return evidence?.ownerIncarnation === ownerIncarnation &&
    expectedStates.length > 0 &&
    expectedStates.every((state) => states.includes(state)) &&
    states.includes(nextState);
}

function rowMatchesAdvanceResult(row, evidence, nextState, ownerIncarnation,
  data) {
  const request = requestFromAdmissionRow(row);
  return rowMatchesAdmission(row, request) &&
    rowMatchesAdmissionIdentity(row, evidence) &&
    row.create_admission_state === nextState &&
    row.create_admission_owner_incarnation === ownerIncarnation &&
    Object.entries(data).every(([field, value]) => row?.[field] === value);
}

class ReplicaCreateAdmissionOwner {
  static acquire(options = {}) {
    const ownerIncarnation = nullableSafeInteger(options.ownerIncarnation);
    if (ownerIncarnation === null || ownerIncarnation <= 0) {
      return new ReplicaCreateAdmissionOwner(options);
    }
    const key = `${options.nodeId || ''}:${ownerIncarnation}`;
    const retained = processOwnerRegistry.get(key);
    if (retained) {
      retained.references += 1;
      if (retained.references === 1 && options.gateway) {
        retained.owner.gateway = options.gateway;
        retained.owner.now = typeof options.now === 'function' ?
          options.now : retained.owner.now;
      }
      return retained.owner;
    }
    const owner = new ReplicaCreateAdmissionOwner(options);
    processOwnerRegistry.set(key, {owner, references: 1});
    owner.processOwnerRegistryKey = key;
    return owner;
  }

  static release(owner) {
    const key = owner?.processOwnerRegistryKey;
    const retained = key ? processOwnerRegistry.get(key) : null;
    if (!retained || retained.owner !== owner) return false;
    retained.references -= 1;
    if (retained.references <= 0) {
      retained.references = 0;
      owner.activePhysicalWorkerOperationIds.clear();
    }
    return true;
  }

  constructor(options = {}) {
    this.gateway = options.gateway || null;
    this.nodeId = options.nodeId || null;
    this.ownerIncarnation = Number(options.ownerIncarnation) || null;
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.laneTailByOperationId = new Map();
    this.activePhysicalWorkerOperationIds = new Map();
    this.physicalWorkerCommitClaim = null;
  }

  runExclusive(operationId, work) {
    return runReplicaCreateExclusive(this, operationId, work);
  }

  async claimPhysicalWorker(evidence) {
    return claimReplicaCreateDurablePhysicalWorker(this, evidence);
  }

  async revalidatePhysicalWorker(claim, expectedEvidence = null) {
    return revalidateReplicaCreatePhysicalWorker(
      this, claim, expectedEvidence);
  }

  snapshotInstallAuthority(claim, expectedEvidence = null) {
    return snapshotReplicaCreateInstallAuthority(
      this, claim, expectedEvidence);
  }

  async commitSnapshotInstall(claim, mutation) {
    return commitReplicaCreateSnapshotInstall(this, claim, mutation);
  }

  releasePhysicalWorker(claim) {
    return releaseReplicaCreatePhysicalWorker(this, claim);
  }

  async readOperation(operationId) {
    if (!this.gateway) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        operationId,
        `CREATE admission authority unavailable for ${operationId}`,
      );
    }
    let observation;
    try {
      observation = await readAuthoritativeControlPlaneRows(
        this.gateway,
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        READ_OPERATION_SQL,
        [operationId],
        CRITICAL_OPTIONS,
      );
    } catch (cause) {
      const error = admissionError(
        CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        operationId,
        `CREATE admission read deferred for ${operationId}`,
      );
      error.cause = cause;
      throw error;
    }
    if (observation?.success !== true) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        operationId,
        `CREATE admission read deferred for ${operationId}`,
      );
    }
    return observation.rows?.length === 1 ? observation.rows[0] : null;
  }

  async readReplicaAdmissions(replicaId) {
    if (!this.gateway) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        replicaId,
        `CREATE admission authority unavailable for ${replicaId}`,
      );
    }
    let observation;
    try {
      observation = await readAuthoritativeControlPlaneRows(
        this.gateway,
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        READ_REPLICA_ADMISSIONS_SQL,
        [replicaId, this.nodeId],
        CRITICAL_OPTIONS,
      );
    } catch (cause) {
      const error = admissionError(
        CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        replicaId,
        `CREATE admission census deferred for ${replicaId}`,
      );
      error.cause = cause;
      throw error;
    }
    if (observation?.success !== true || !Array.isArray(observation.rows)) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        replicaId,
        `CREATE admission census deferred for ${replicaId}`,
      );
    }
    return observation.rows;
  }

  async snapshotTargetAdmissions(entityType) {
    if (!this.gateway) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        this.nodeId,
        `CREATE admission recovery authority unavailable for ${this.nodeId}`,
      );
    }
    if (typeof entityType !== 'string' || entityType.length === 0) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.INVALID,
        this.nodeId,
        `CREATE admission recovery needs its entity type on ${this.nodeId}`,
      );
    }
    const observation = await readAuthoritativeControlPlaneRows(
      this.gateway,
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      READ_TARGET_ADMISSIONS_SQL,
      [this.nodeId, entityType],
      CRITICAL_OPTIONS,
    );
    if (observation?.success !== true || !Array.isArray(observation.rows)) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        this.nodeId,
        `CREATE admission recovery snapshot deferred for ${this.nodeId}`,
      );
    }
    return observation.rows;
  }

  async requireCurrentBootIncarnation() {
    const observation = await readAuthoritativeControlPlaneRows(
      this.gateway,
      SYSTEM_TABLE_NAME.NODES,
      READ_CURRENT_BOOT_SQL,
      [this.nodeId],
      CRITICAL_OPTIONS,
    );
    const row = observation?.success === true &&
      Array.isArray(observation.rows) && observation.rows.length === 1 ?
      observation.rows[0] : null;
    if (row?.node_id !== this.nodeId ||
        nullableSafeInteger(row.boot_incarnation) !== this.ownerIncarnation) {
      const error = admissionError(
        CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        this.nodeId,
        `Current boot authority unavailable for ${this.nodeId}`,
      );
      error.bootAuthorityUnavailable = true;
      throw error;
    }
    return row;
  }

  async takeoverRetained(row) {
    const request = requestFromAdmissionRow(row);
    if (!isRetainedAdmissionRowEligible(row, request, this.nodeId)) {
      return null;
    }
    const previousOwner = nullableSafeInteger(
      row.create_admission_owner_incarnation,
    );
    if (!isRetainedOwnerEligible(previousOwner, this.ownerIncarnation)) {
      return null;
    }
    const retainedEvidence = admissionEvidenceFromRow(row, request);
    await this.requireCurrentBootIncarnation();
    if (this.ownerIncarnation === previousOwner) {
      const current = await this.readOperation(row.operation_id);
      if (!currentRowMatchesRetainedAdmission(
        current, retainedEvidence, this.ownerIncarnation,
      )) return null;
      return admissionEvidenceFromRow(current, requestFromAdmissionRow(current));
    }
    let result = null;
    try {
      result = await this.gateway.updateSystemTableRow(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {
          operation_id: row.operation_id,
          create_admission_state: row.create_admission_state,
          create_admission_token: row.create_admission_token,
          create_admission_replica_created_at:
            row.create_admission_replica_created_at,
          create_admission_attempt_token:
            row.create_admission_attempt_token,
          create_admission_attempt_seq: row.create_admission_attempt_seq,
          create_admission_owner_incarnation: previousOwner,
        },
        {create_admission_owner_incarnation: this.ownerIncarnation},
        CRITICAL_OPTIONS,
      );
    } catch (_error) {
      result = null;
    }
    const current = await this.readOperation(row.operation_id);
    await this.requireCurrentBootIncarnation();
    if (!currentRowMatchesRetainedAdmission(
      current, retainedEvidence, this.ownerIncarnation,
    )) {
      const effect = classifyControlPlaneMutationResult(result);
      if (effect.retryable) {
        throw admissionError(
          CREATE_ADMISSION_ERROR_CODE.DEFERRED,
          row.operation_id,
          `CREATE admission takeover deferred ${row.operation_id}`,
        );
      }
      return null;
    }
    return admissionEvidenceFromRow(current, requestFromAdmissionRow(current));
  }

  async claim(requestInput, admissionBasis = NO_ADMISSION_BASIS) {
    const request = normalizeRequest(requestInput, this.nodeId);
    if (!isValidRequest(request)) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.INVALID,
        request.operationId,
        `Invalid durable CREATE admission request for ${request.operationId}`,
      );
    }
    // A process-local lane prevents duplicate workers within one live boot;
    // the authoritative boot row fences a stale process before it can claim
    // the durable operation. Revalidate after the CAS/read as well: a boot
    // change between the two reads may leave an adoptable ADMITTED row, but
    // the stale process must never receive evidence that permits physical
    // work.
    await this.requireCurrentBootIncarnation();
    const reserved = reserveReplicaCreateAdmissionGeneration({
      ...request,
      admissionState: CREATE_ADMISSION_STATE.ADMITTED,
      ownerIncarnation: this.ownerIncarnation,
    }, this.now());
    let mutation;
    try {
      mutation = await this.gateway.updateSystemTableRow(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        {
          // The caller's basis joins the CAS; this owner's keys always win.
          ...admissionBasis,
          operation_id: request.operationId,
          type: request.operationType,
          entity_type: request.entityType,
          entity_id: request.entityId,
          partition_id: request.partitionId,
          replica_id: request.replicaId,
          target_node_id: request.targetNodeId,
          workflow_step: WORKFLOW_STEP.SENDING,
          updated_at: request.workflowUpdatedAt,
          completed_at: null,
          create_admission_state: null,
          create_admission_token: null,
        },
        {
          create_admission_state: CREATE_ADMISSION_STATE.ADMITTED,
          create_admission_token: request.admissionToken,
          create_admission_replica_created_at: reserved.replicaCreatedAt,
          create_admission_attempt_token: request.attemptToken,
          create_admission_previous_attempt_token: null,
          create_admission_attempt_seq: request.attemptSeq,
          create_admission_workflow_updated_at: request.workflowUpdatedAt,
          create_admission_owner_incarnation: this.ownerIncarnation,
        },
        CRITICAL_OPTIONS,
      );
    } catch (_error) {
      // The answer may have been lost after apply. The authoritative read
      // below is the only adoption path.
      mutation = null;
    }
    const row = await this.readOperation(request.operationId);
    await this.requireCurrentBootIncarnation();
    if (rowMatchesAdmission(row, request, admissionBasis)) {
      if (isClosedAdmission(row)) {
        throw admissionError(
          CREATE_ADMISSION_ERROR_CODE.STALE,
          request.operationId,
          `Closed CREATE admission refused ${request.operationId}`,
        );
      }
      return admissionEvidenceFromRow(row, request);
    }
    if (rowMatchesRotatingPreviousAttempt(row, request)) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.STALE,
        request.operationId,
        `Previous CREATE attempt refused during rotation ${request.operationId}`,
      );
    }
    if (row?.completed_at !== null && row?.completed_at !== undefined) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.REFUSED_TERMINAL,
        request.operationId,
        `Terminal operation refused late CREATE ${request.operationId}`,
      );
    }
    const effect = classifyControlPlaneMutationResult(mutation);
    throw admissionError(
      effect.retryable ? CREATE_ADMISSION_ERROR_CODE.DEFERRED :
        CREATE_ADMISSION_ERROR_CODE.STALE,
      request.operationId,
      `Stale CREATE admission request for ${request.operationId}`,
    );
  }

  async advance(evidence, expectedStates, nextState, data = {}, extraWhere = {}) {
    const expected = Array.isArray(expectedStates) ? expectedStates :
      [expectedStates];
    if (!isValidAdvanceRequest(
      evidence, this.ownerIncarnation, expected, nextState,
    )) return null;
    await this.requireCurrentBootIncarnation();
    for (const expectedState of expected) {
      let result = null;
      try {
        result = await this.gateway.updateSystemTableRow(
          SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
          {
            operation_id: evidence.operationId,
            create_admission_state: expectedState,
            create_admission_token: evidence.admissionToken,
            create_admission_replica_created_at: evidence.replicaCreatedAt,
            create_admission_attempt_token: evidence.attemptToken,
            create_admission_attempt_seq: evidence.attemptSeq,
            create_admission_owner_incarnation: evidence.ownerIncarnation,
            ...extraWhere,
          },
          {
            ...data,
            create_admission_state: nextState,
            create_admission_owner_incarnation: this.ownerIncarnation,
          },
          CRITICAL_OPTIONS,
        );
      } catch (_error) {
        result = null;
      }
      if (classifyControlPlaneMutationResult(result).applied === true) break;
    }
    const row = await this.readOperation(evidence.operationId);
    await this.requireCurrentBootIncarnation();
    if (!rowMatchesAdvanceResult(
      row, evidence, nextState, this.ownerIncarnation, data,
    )) return null;
    return admissionEvidenceFromRow(row, requestFromAdmissionRow(row));
  }

  async markMaterialized(evidence, admissionBasis = NO_ADMISSION_BASIS) {
    return this.advance(
      evidence,
      CREATE_ADMISSION_STATE.ADMITTED,
      CREATE_ADMISSION_STATE.MATERIALIZED,
      {},
      admissionBasis,
    );
  }

  async markProgress(evidence, nextState) {
    if (nextState !== CREATE_ADMISSION_STATE.ACTIVE &&
        nextState !== CREATE_ADMISSION_STATE.FAILED) return null;
    return this.advance(
      evidence,
      [
        CREATE_ADMISSION_STATE.ADMITTED,
        CREATE_ADMISSION_STATE.MATERIALIZED,
        CREATE_ADMISSION_STATE.ROTATING,
      ],
      nextState,
    );
  }

  async beginFailedAttemptRotation(evidence, physicalClaim = null) {
    requireReplicaCreateRotationWorkerClaim(this, evidence, physicalClaim);
    const row = await this.readOperation(evidence.operationId);
    if (!rowMatchesAdmission(row, requestFromAdmissionRow(row)) ||
        !rowMatchesAdmissionIdentity(row, evidence) ||
        row.completed_at !== null && row.completed_at !== undefined ||
        row.create_admission_state !== CREATE_ADMISSION_STATE.FAILED ||
        row.create_admission_attempt_token !== evidence.attemptToken) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.STALE,
        evidence.operationId,
        `CREATE attempt rotation refused ${evidence.operationId}`,
      );
    }
    const attemptSeq = evidence.attemptSeq + 1;
    const attemptToken = buildReplicaCreateAttemptToken(
      evidence.admissionToken,
      attemptSeq,
    );
    const rotating = await this.advance(
      evidence,
      CREATE_ADMISSION_STATE.FAILED,
      CREATE_ADMISSION_STATE.ROTATING,
      {
        create_admission_previous_attempt_token: evidence.attemptToken,
        create_admission_attempt_token: attemptToken,
        create_admission_attempt_seq: attemptSeq,
      },
      {completed_at: null},
    );
    if (!rotating) {
      throw admissionError(
        CREATE_ADMISSION_ERROR_CODE.DEFERRED,
        evidence.operationId,
        `CREATE attempt rotation deferred ${evidence.operationId}`,
      );
    }
    if (physicalClaim && !advanceReplicaCreatePhysicalWorker(
      this, physicalClaim, evidence, rotating)) return null;
    return rotating;
  }

  async finishFailedAttemptRotation(evidence, physicalClaim = null) {
    const materialized = await this.advance(
      evidence,
      CREATE_ADMISSION_STATE.ROTATING,
      CREATE_ADMISSION_STATE.MATERIALIZED,
      {create_admission_previous_attempt_token: null},
    );
    if (physicalClaim && materialized && !advanceReplicaCreatePhysicalWorker(
      this, physicalClaim, evidence, materialized)) return null;
    return materialized;
  }

  async close(evidence) {
    if (evidence?.admissionState === CREATE_ADMISSION_STATE.CLOSED) {
      return evidence;
    }
    return this.advance(
      evidence,
      [
        CREATE_ADMISSION_STATE.ADMITTED,
        CREATE_ADMISSION_STATE.MATERIALIZED,
        CREATE_ADMISSION_STATE.ROTATING,
        CREATE_ADMISSION_STATE.ACTIVE,
        CREATE_ADMISSION_STATE.FAILED,
      ],
      CREATE_ADMISSION_STATE.CLOSED,
    );
  }

  async closeForLifecycle(lifecycle) {
    return closeReplicaCreateAdmissionForLifecycle(this, lifecycle);
  }
}

export {
  CREATE_ADMISSION_ERROR_CODE,
  CREATE_ADMISSION_STATE,
  ReplicaCreateAdmissionOwner,
};
