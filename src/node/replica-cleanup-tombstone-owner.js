import {randomUUID} from 'node:crypto';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_READ_LEADER_MODE,
  readAuthoritativeControlPlaneRows,
} from '../control-plane/control-plane-system-table-gateway.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';
import {
  SERVICE_TYPE,
  TABLES,
  isPartitionCleanupServiceRow,
} from '../constants/index.js';
import {
  buildFailedCreateRemoveToken,
  isFailedCreateCleanupToken,
  isFailedCreateRemoveToken,
  parseFailedCreateRemoveOperationId,
} from '../rebalancer/failed-create-cleanup-token.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  REPLICA_CLEANUP_AUTHORITY_KIND,
  REPLICA_CLEANUP_CONTINUATION,
  REPLICA_CLEANUP_PHASE,
  REPLICA_CLEANUP_ERROR_CODE,
  REPLICA_CLEANUP_LOG_MSG,
  REPLICA_CLEANUP_COMPLETION,
  REPLICA_CLEANUP_OPERATION_STATE,
} from './replica-cleanup-constants.js';
import {cleanupOperationFromRow, cleanupOperationMatchesRequest,
  cleanupOperationMatchesReceipt} from './replica-cleanup-operation-authority.js';
import {buildReplicaLifecycleMutationPredicateFromState, isReplicaLifecycleMutationPredicate,
  observeAuthoritativeReplicaLifecycle, rowMatchesReplicaLifecycle} from
  './replica-state-machine-lifecycle-observation.js';

const REPLICA_CLEANUP_SERVICE_TYPE = SERVICE_TYPE.PARTITION_CLEANUP;
const REPLICA_CLEANUP_CRITICAL_WORK = 'critical';
const REPLICA_CLEANUP_STARTUP_SNAPSHOT_ID = 'startup-snapshot';
const READ_CLEANUP_OPERATION_SQL = 'SELECT operation_id, type, replica_id, partition_id, ' +
  'target_node_id, entity_type, entity_id, status, workflow_step, completed_at, steps_history ' +
  'FROM replica_operations WHERE operation_id = ?';
const REPLICA_CLEANUP_ACQUIRE_OUTCOME = Object.freeze({
  ACQUIRED: 'acquired',
  DEFERRED: 'deferred',
  LIVE_GENERATION: 'live_generation',
  OWNED: 'owned',
});

function isCleanupTombstoneRow(row) {
  return isPartitionCleanupServiceRow(row) &&
    [
      REPLICA_CLEANUP_AUTHORITY_KIND.OWNED,
      REPLICA_CLEANUP_AUTHORITY_KIND.COMPLETE,
    ]
      .includes(row?.status);
}

function cleanupAuthorityFromRow(row) {
  if (!isCleanupTombstoneRow(row) ||
      typeof row.cleanup_token !== 'string' ||
      !Number.isFinite(row.updated_at)) return false;
  return Object.freeze({
    kind: row.status,
    nodeId: row.node_id,
    ownerToken: row.cleanup_token,
    partitionId: row.partition_id,
    replicaId: row.service_id,
    replicaCreatedAt: row.created_at,
    createAttemptToken: row.create_attempt_token ?? null,
    updatedAt: row.updated_at,
  });
}

function cleanupMutationPredicate(authority) {
  return {
    service_id: authority.replicaId,
    service_type: REPLICA_CLEANUP_SERVICE_TYPE,
    partition_id: authority.partitionId,
    node_id: authority.nodeId,
    status: authority.kind,
    cleanup_token: authority.ownerToken,
    created_at: authority.replicaCreatedAt,
    create_attempt_token: authority.createAttemptToken,
    updated_at: authority.updatedAt,
  };
}

function rowMatchesCleanupAuthority(row, authority) {
  return isCleanupTombstoneRow(row) && Boolean(authority) &&
    Object.entries(cleanupMutationPredicate(authority)).every(([field, value]) =>
      (row[field] ?? null) === value);
}

function completionReceiptObservationOutcome(observation, authority, operation) {
  if (observation.available !== true) return REPLICA_CLEANUP_COMPLETION.AUTHORITY_UNAVAILABLE;
  if (observation.row === null) {
    return operation.state === REPLICA_CLEANUP_OPERATION_STATE.TERMINAL ?
      REPLICA_CLEANUP_COMPLETION.RECEIPT_RELEASED :
      REPLICA_CLEANUP_COMPLETION.AUTHORITY_UNAVAILABLE;
  }
  return rowMatchesCleanupAuthority(observation.row, authority) ?
    REPLICA_CLEANUP_COMPLETION.RECEIPT_RETAINED : REPLICA_CLEANUP_COMPLETION.IDENTITY_CONFLICT;
}

// An issued intent permits resolving its own effect, not acquiring cleanup
// authority from absence or from another claimant's observed token.
function rowMatchesRemovalContinuation(row, continuation) {
  if (continuation?.kind !== REPLICA_CLEANUP_CONTINUATION.RETAINED) return false;
  if (rowMatchesCleanupAuthority(row, continuation.cleanupAuthority)) return true;
  switch (continuation.phase) {
  case REPLICA_CLEANUP_PHASE.TAKEOVER:
    return rowMatchesReplicaLifecycle(row, continuation.removalAuthority.replicaState);
  case REPLICA_CLEANUP_PHASE.RELEASE:
    return row === null;
  case REPLICA_CLEANUP_PHASE.COMPLETE:
    return rowMatchesCleanupAuthority(row, continuation.completionAuthority);
  default:
    return false;
  }
}

function matchesRemovalRequest(retained, request) {
  const {operationId, replicaId, partitionId, nodeId, precondition} = request;
  const authority = retained.cleanupAuthority;
  if (authority.replicaId !== replicaId || authority.partitionId !== partitionId ||
      authority.nodeId !== nodeId) return false;
  if (isFailedCreateRemoveToken(authority.ownerToken) &&
      authority.ownerToken !== buildFailedCreateRemoveToken(operationId)) return false;
  if (precondition === undefined) return true;
  const original = retained.removalAuthority.replicaState;
  const expected = {service_id: replicaId, replica_id: original.replicaIdentity,
    service_type: original.serviceType, group_id: original.groupId,
    partition_id: partitionId, node_id: nodeId, status: ReplicaStatus.FAILED,
    created_at: authority.replicaCreatedAt, create_attempt_token: authority.createAttemptToken};
  return Object.entries(expected).every(([key, value]) => precondition?.[key] === value) &&
    isFailedCreateCleanupToken(precondition.cleanup_token) &&
    Number.isFinite(precondition.state_entered_at) &&
    precondition.state_entered_at < retained.removalAuthority.durableVersion;
}

function rowIsReplacementForAuthority(row, authority) {
  const expected = {
    service_id: authority?.replicaId,
    service_type: SERVICE_TYPE.PARTITION,
    partition_id: authority?.partitionId,
    node_id: authority?.nodeId,
  };
  return Object.entries(expected).every(([field, value]) =>
    row?.[field] === value) &&
    typeof row?.status === 'string' &&
    (Number.isFinite(row?.state_entered_at) ||
      Number.isFinite(row?.updated_at));
}

function throwCleanupMutationDeferred(replicaId, effect, result = null, cause = null) {
  const error = cleanupDeferredError(replicaId);
  error.cause = cause;
  error.mutationOutcome = effect.outcome || null;
  error.retryAfterMs = Number.isFinite(result?.retryAfterMs) ?
    result.retryAfterMs : null;
  throw error;
}

function cleanupDeferredError(replicaId, code =
REPLICA_CLEANUP_ERROR_CODE.CLEANUP_OWNER_DEFERRED) {
  const error = new Error(`Replica cleanup ownership deferred for ${replicaId}`);
  error.code = code;
  error.errorCode = code;
  error.deferRetry = code !==
    REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT;
  return error;
}

class ReplicaCleanupTombstoneOwner {
  #removalContinuations;
  constructor(options = {}) {
    // Issued intents precede effects, including uncertain acknowledgements.
    // Durable reads confirm this token; process loss uses the startup sweep.
    this.#removalContinuations = new Map();
    this.gateway = options.gateway;
    this.observe = options.observe;
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.randomUUID = options.randomUUID || randomUUID;
    this.logger = options.logger || console;
  }

  async observeReplica(replicaId) {
    if (typeof this.observe === 'function') return this.observe(replicaId);
    return observeAuthoritativeReplicaLifecycle({
      getControlPlaneSystemTableGateway: () => this.gateway,
    }, replicaId);
  }

  async acquire({replicaId, partitionId, nodeId, reason}) {
    const now = this.now();
    const row = {
      service_id: replicaId,
      service_type: REPLICA_CLEANUP_SERVICE_TYPE,
      node_id: nodeId,
      partition_id: partitionId,
      group_id: null,
      replica_id: null,
      raft_role: null,
      status: REPLICA_CLEANUP_AUTHORITY_KIND.OWNED,
      state_entered_at: null,
      previous_state: null,
      address: null,
      cleanup_token: this.randomUUID(),
      create_attempt_token: null,
      trigger_reason: reason || 'startup_orphan_cleanup',
      error_message: null,
      created_at: now,
      updated_at: now,
    };
    let result;
    try {
      result = await this.gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName: TABLES.SERVICES,
        row,
      }, {
        allowCoalescing: false,
        coalescingKey: `services:${replicaId}:cleanup:${row.cleanup_token}`,
        deliveryPriority: REPLICA_CLEANUP_CRITICAL_WORK,
        workClass: REPLICA_CLEANUP_CRITICAL_WORK,
      });
    } catch (_error) {
      result = null;
    }
    const effect = classifyControlPlaneMutationResult(result);
    const observation = await this.observeReplica(replicaId);
    if (observation.available !== true) {
      return Object.freeze({
        authority: null,
        outcome: REPLICA_CLEANUP_ACQUIRE_OUTCOME.DEFERRED,
      });
    }
    const authority = cleanupAuthorityFromRow(observation.row);
    if (authority && rowMatchesCleanupAuthority(observation.row,
      cleanupAuthorityFromRow(row))) {
      return Object.freeze({authority,
        outcome: REPLICA_CLEANUP_ACQUIRE_OUTCOME.ACQUIRED});
    }
    if (authority) {
      return Object.freeze({authority: null,
        outcome: REPLICA_CLEANUP_ACQUIRE_OUTCOME.OWNED});
    }
    return Object.freeze({
      authority: null,
      mutationOutcome: effect.outcome || null,
      outcome: observation.row ?
        REPLICA_CLEANUP_ACQUIRE_OUTCOME.LIVE_GENERATION :
        REPLICA_CLEANUP_ACQUIRE_OUTCOME.DEFERRED,
    });
  }

  async snapshotPersistedAtStartup(nodeId) {
    const result = await readAuthoritativeControlPlaneRows(
      this.gateway,
      TABLES.SERVICES,
      'SELECT service_id, service_type, node_id, partition_id, status, ' +
        'cleanup_token, created_at, create_attempt_token, updated_at ' +
        'FROM services WHERE service_type = ? ' +
        'AND node_id = ?',
      [REPLICA_CLEANUP_SERVICE_TYPE, nodeId],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        deliveryPriority: REPLICA_CLEANUP_CRITICAL_WORK,
        workClass: REPLICA_CLEANUP_CRITICAL_WORK,
      },
    );
    if (result?.success !== true || !Array.isArray(result.rows)) {
      throw cleanupDeferredError(REPLICA_CLEANUP_STARTUP_SNAPSHOT_ID);
    }
    const authorities = new Map();
    for (const row of result.rows) {
      const authority = cleanupAuthorityFromRow(row);
      if (authority && authority.nodeId === nodeId &&
          typeof authority.partitionId === 'string' &&
          authority.partitionId.length > 0) {
        authorities.set(authority.replicaId, authority);
      }
    }
    return authorities;
  }

  async resumePersistedAtStartup(
    startupAuthorities,
    {replicaId, partitionId, nodeId},
  ) {
    const authority = startupAuthorities?.get?.(replicaId) || null;
    if (authority?.replicaId !== replicaId ||
        authority?.partitionId !== partitionId ||
        authority?.nodeId !== nodeId) return null;
    return await this.requireCurrent(authority) ? authority : null;
  }

  async takeoverRemoving(removingAuthority, reason, service = null) {
    const replicaId = removingAuthority.replicaState.serviceId;
    let retained = this.#removalContinuations.get(replicaId);
    if (!retained) {
      retained = this.prepareRemovalTakeover(removingAuthority, reason, service);
      this.#removalContinuations.set(replicaId, retained);
    }
    if (retained.removalAuthority !== removingAuthority || retained.service !== service) {
      throw cleanupDeferredError(replicaId, REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT);
    }
    const before = await this.observeReplica(replicaId);
    if (before.available !== true) throw cleanupDeferredError(replicaId);
    if (rowMatchesCleanupAuthority(before.row, retained.cleanupAuthority)) {
      this.retainRemovalPhase(retained.cleanupAuthority, REPLICA_CLEANUP_PHASE.PHYSICAL);
      return retained.cleanupAuthority;
    }
    if (retained.phase !== REPLICA_CLEANUP_PHASE.TAKEOVER ||
        !rowMatchesReplicaLifecycle(before.row, removingAuthority.replicaState)) {
      throw cleanupDeferredError(replicaId, REPLICA_CLEANUP_ERROR_CODE.CLEANUP_OWNERSHIP_CHANGED);
    }
    let result = null;
    let mutationError = null;
    try {
      result = await this.gateway.submitMutation(retained.mutation, {
        allowCoalescing: false,
        coalescingKey: `services:${replicaId}:cleanup-takeover:` + retained.cleanupAuthority.ownerToken,
        deliveryPriority: REPLICA_CLEANUP_CRITICAL_WORK,
        workClass: REPLICA_CLEANUP_CRITICAL_WORK,
      });
    } catch (error) {
      mutationError = error;
    }
    const observation = await this.observeReplica(replicaId);
    if (observation.available === true &&
        rowMatchesCleanupAuthority(observation.row, retained.cleanupAuthority)) {
      this.retainRemovalPhase(retained.cleanupAuthority, REPLICA_CLEANUP_PHASE.PHYSICAL);
      return retained.cleanupAuthority;
    }
    throwCleanupMutationDeferred(replicaId,
      classifyControlPlaneMutationResult(result), result, mutationError);
  }

  prepareRemovalTakeover(removingAuthority, reason, service) {
    const removalToken = removingAuthority?.replicaState?.cleanupToken;
    const ownerToken = isFailedCreateRemoveToken(removalToken) ?
      removalToken : this.randomUUID();
    const updatedAt = this.now();
    const whereClause = buildReplicaLifecycleMutationPredicateFromState(
      removingAuthority.replicaState);
    if (!isReplicaLifecycleMutationPredicate(whereClause)) {
      throw cleanupDeferredError(removingAuthority.replicaState.serviceId,
        REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT);
    }
    const data = {
      service_type: REPLICA_CLEANUP_SERVICE_TYPE,
      status: REPLICA_CLEANUP_AUTHORITY_KIND.OWNED,
      replica_id: null,
      group_id: null,
      raft_role: null,
      state_entered_at: null,
      previous_state: null,
      address: null,
      cleanup_token: ownerToken,
      trigger_reason: reason || 'durable_replica_removal',
      error_message: null,
      updated_at: updatedAt,
    };
    const state = removingAuthority.replicaState;
    const cleanupAuthority = Object.freeze({kind: REPLICA_CLEANUP_AUTHORITY_KIND.OWNED,
      nodeId: state.nodeId, ownerToken, partitionId: state.partitionId,
      replicaId: state.serviceId, replicaCreatedAt: state.createdAt,
      createAttemptToken: state.createAttemptToken ?? null, updatedAt});
    return Object.freeze({kind: REPLICA_CLEANUP_CONTINUATION.RETAINED,
      phase: REPLICA_CLEANUP_PHASE.TAKEOVER, removalAuthority: removingAuthority,
      cleanupAuthority, service, reason,
      mutation: Object.freeze({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause: Object.freeze(whereClause), data: Object.freeze(data),
      })});
  }

  retainRemovalPhase(authority, phase, completionAuthority = null) {
    const retained = this.#removalContinuations.get(authority.replicaId);
    if (!retained || retained.cleanupAuthority !== authority) return;
    const advances = retained.phase === REPLICA_CLEANUP_PHASE.TAKEOVER &&
      phase === REPLICA_CLEANUP_PHASE.PHYSICAL ||
      retained.phase === REPLICA_CLEANUP_PHASE.PHYSICAL &&
      [REPLICA_CLEANUP_PHASE.RELEASE, REPLICA_CLEANUP_PHASE.COMPLETE].includes(phase);
    if (retained.phase !== phase && !advances) {
      throw cleanupDeferredError(authority.replicaId,
        REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT);
    }
    this.#removalContinuations.set(authority.replicaId, Object.freeze({
      ...retained, phase, completionAuthority,
    }));
  }

  removalCleanupPhase(authority) {
    const retained = this.#removalContinuations.get(authority.replicaId);
    if (retained?.cleanupAuthority !== authority) {
      throw cleanupDeferredError(authority.replicaId,
        REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT);
    }
    return retained.phase;
  }

  readRemovalContinuation(replicaId, partitionId, nodeId) {
    const retained = this.#removalContinuations.get(replicaId);
    if (!retained) return Object.freeze({kind: REPLICA_CLEANUP_CONTINUATION.UNOWNED});
    if (retained.cleanupAuthority.partitionId !== partitionId ||
        retained.cleanupAuthority.nodeId !== nodeId) {
      throw cleanupDeferredError(replicaId, REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT);
    }
    return retained;
  }

  readRemovalRequestContinuation(request) {
    const retained = this.#removalContinuations.get(request.replicaId);
    if (!retained) return Object.freeze({kind: REPLICA_CLEANUP_CONTINUATION.UNOWNED});
    return matchesRemovalRequest(retained, request) ? retained :
      Object.freeze({kind: REPLICA_CLEANUP_CONTINUATION.REFUSED});
  }

  finishRemovalContinuation(authority) {
    const retained = this.#removalContinuations.get(authority.replicaId);
    if (retained?.cleanupAuthority === authority) {
      this.#removalContinuations.delete(authority.replicaId);
    }
  }

  ownsRemovalCompletionReceipt(removalAuthority, receipt) {
    const retained = this.#removalContinuations.get(removalAuthority?.replicaState?.serviceId);
    return retained?.removalAuthority === removalAuthority &&
      retained?.phase === REPLICA_CLEANUP_PHASE.COMPLETE &&
      retained.completionAuthority === receipt;
  }

  async requireCurrent(authority) {
    const observation = await this.observeReplica(authority.replicaId);
    return observation.available === true &&
      rowMatchesCleanupAuthority(observation.row, authority);
  }

  plannedRemovalCompletion(authority) {
    const retained = this.#removalContinuations.get(authority.replicaId);
    return retained?.cleanupAuthority === authority &&
      retained.phase === REPLICA_CLEANUP_PHASE.COMPLETE ?
      retained.completionAuthority : Object.freeze({...authority,
        kind: REPLICA_CLEANUP_AUTHORITY_KIND.COMPLETE,
        updatedAt: Math.max(this.now(), authority.updatedAt + 1)});
  }

  async markComplete(authority, completion = {}) {
    if (completion.artifactsAbsent !== true ||
        authority?.kind !== REPLICA_CLEANUP_AUTHORITY_KIND.OWNED ||
        !isFailedCreateRemoveToken(authority.ownerToken)) return false;
    const retained = this.#removalContinuations.get(authority.replicaId);
    const planned = this.plannedRemovalCompletion(authority);
    const before = await this.observeReplica(authority.replicaId);
    if (before.available !== true) return false;
    if (retained?.completionAuthority === planned &&
        rowMatchesCleanupAuthority(before.row, planned)) return planned;
    if (!rowMatchesCleanupAuthority(before.row, authority)) return false;
    this.retainRemovalPhase(authority, REPLICA_CLEANUP_PHASE.COMPLETE, planned);
    return this.submitCleanupCompletion(authority, planned);
  }

  async submitCleanupCompletion(authority, planned) {
    try {
      await this.gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SERVICES,
        whereClause: cleanupMutationPredicate(authority),
        data: {
          status: REPLICA_CLEANUP_AUTHORITY_KIND.COMPLETE,
          updated_at: planned.updatedAt,
        },
      }, {
        allowCoalescing: false,
        coalescingKey: `services:${authority.replicaId}:cleanup-complete:` +
          authority.ownerToken,
        deliveryPriority: REPLICA_CLEANUP_CRITICAL_WORK,
        workClass: REPLICA_CLEANUP_CRITICAL_WORK,
      });
    } catch (error) {
      this.logger.warn(REPLICA_CLEANUP_LOG_MSG.COMPLETE_ACK_UNCERTAIN, {
        replicaId: authority.replicaId,
        error: String(error),
      });
    }
    const observation = await this.observeReplica(authority.replicaId);
    return observation.available === true &&
      rowMatchesCleanupAuthority(observation.row, planned) ? planned : false;
  }

  async observeAuthority(replicaId) {
    const observation = await this.observeReplica(replicaId);
    return observation.available === true ?
      cleanupAuthorityFromRow(observation.row) : null;
  }

  async readCleanupOperation(operationId) {
    const result = await readAuthoritativeControlPlaneRows(
      this.gateway,
      TABLES.REPLICA_OPERATIONS,
      READ_CLEANUP_OPERATION_SQL,
      [operationId],
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
        deliveryPriority: REPLICA_CLEANUP_CRITICAL_WORK,
        workClass: REPLICA_CLEANUP_CRITICAL_WORK,
      },
    );
    if (result?.success !== true || !Array.isArray(result.rows) || result.rows.length !== 1 ||
        result.rows[0]?.operation_id !== operationId) {
      return Object.freeze({state: REPLICA_CLEANUP_OPERATION_STATE.UNAVAILABLE});
    }
    return cleanupOperationFromRow(result.rows[0]);
  }

  async resolveFailedCreateCompletion(request) {
    const before = await this.observeReplica(request.replicaId);
    if (before.available !== true) {
      return {outcome: REPLICA_CLEANUP_COMPLETION.AUTHORITY_UNAVAILABLE};
    }
    if (before.row !== null && !isCleanupTombstoneRow(before.row)) {
      return {outcome: REPLICA_CLEANUP_COMPLETION.NOT_APPLICABLE};
    }
    const operation = await this.readCleanupOperation(request.operationId);
    if (operation.state === REPLICA_CLEANUP_OPERATION_STATE.UNAVAILABLE) {
      return {outcome: REPLICA_CLEANUP_COMPLETION.AUTHORITY_UNAVAILABLE};
    }
    if (!cleanupOperationMatchesRequest(operation, request)) {
      return {outcome: REPLICA_CLEANUP_COMPLETION.IDENTITY_CONFLICT};
    }
    if (before.row === null) return this.confirmTerminalCleanupAbsent(request.replicaId, operation);
    return this.settleCompletionReceipt(cleanupAuthorityFromRow(before.row), operation);
  }

  async confirmTerminalCleanupAbsent(replicaId, operation) {
    if (operation.state !== REPLICA_CLEANUP_OPERATION_STATE.TERMINAL) {
      return {outcome: REPLICA_CLEANUP_COMPLETION.AUTHORITY_UNAVAILABLE};
    }
    const after = await this.observeReplica(replicaId);
    if (after.available !== true) {
      return {outcome: REPLICA_CLEANUP_COMPLETION.AUTHORITY_UNAVAILABLE};
    }
    return {outcome: after.row === null ? REPLICA_CLEANUP_COMPLETION.TERMINAL_ABSENT :
      REPLICA_CLEANUP_COMPLETION.IDENTITY_CONFLICT};
  }

  async releaseCompletionReceipt(authority) {
    const operationId = parseFailedCreateRemoveOperationId(authority.ownerToken);
    const operation = await this.readCleanupOperation(operationId);
    if (operation.state === REPLICA_CLEANUP_OPERATION_STATE.UNAVAILABLE) {
      return {outcome: REPLICA_CLEANUP_COMPLETION.AUTHORITY_UNAVAILABLE};
    }
    return this.settleCompletionReceipt(authority, operation);
  }

  async settleCompletionReceipt(authority, operation) {
    if (!cleanupOperationMatchesReceipt(operation, authority)) {
      return {outcome: REPLICA_CLEANUP_COMPLETION.IDENTITY_CONFLICT};
    }
    // Both ingress and the startup sweep bind the complete retained REMOVE
    // identity before interpreting a concurrent receipt release. Absence cannot
    // settle a nonterminal operation or grant another incarnation permission.
    const outcome = completionReceiptObservationOutcome(
      await this.observeReplica(authority.replicaId), authority, operation);
    if (outcome !== REPLICA_CLEANUP_COMPLETION.RECEIPT_RETAINED ||
        operation.state !== REPLICA_CLEANUP_OPERATION_STATE.TERMINAL) {
      return {outcome};
    }
    try {
      const result = await this.submitCleanupRelease(authority);
      const after = completionReceiptObservationOutcome(
        await this.observeReplica(authority.replicaId), authority, operation);
      if (after === REPLICA_CLEANUP_COMPLETION.RECEIPT_RETAINED) {
        throwCleanupMutationDeferred(authority.replicaId,
          classifyControlPlaneMutationResult(result), result);
      }
      return {outcome: after};
    } catch (error) {
      return {outcome: REPLICA_CLEANUP_COMPLETION.AUTHORITY_UNAVAILABLE, error};
    }
  }

  async release(authority, completion = {}) {
    if (completion.artifactsAbsent !== true) return false;
    const retained = this.#removalContinuations.get(authority.replicaId);
    const before = await this.observeReplica(authority.replicaId);
    if (before.available !== true) throw cleanupDeferredError(authority.replicaId);
    if (retained?.cleanupAuthority === authority &&
        retained.phase === REPLICA_CLEANUP_PHASE.RELEASE && before.row === null) return true;
    if (!rowMatchesCleanupAuthority(before.row, authority)) return false;
    this.retainRemovalPhase(authority, REPLICA_CLEANUP_PHASE.RELEASE);
    return this.confirmCleanupRelease(authority, await this.submitCleanupRelease(authority));
  }

  async submitCleanupRelease(authority) {
    let result;
    try {
      result = await this.gateway.submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
        tableName: TABLES.SERVICES,
        whereClause: cleanupMutationPredicate(authority),
      }, {
        allowCoalescing: false,
        coalescingKey: `services:${authority.replicaId}:cleanup-release:` +
          authority.ownerToken,
        deliveryPriority: REPLICA_CLEANUP_CRITICAL_WORK,
        workClass: REPLICA_CLEANUP_CRITICAL_WORK,
      });
    } catch (_error) {
      result = null;
    }
    return result;
  }

  async confirmCleanupRelease(authority, result) {
    const effect = classifyControlPlaneMutationResult(result);
    const observation = await this.observeReplica(authority.replicaId);
    if (observation.available !== true) {
      throwCleanupMutationDeferred(authority.replicaId, effect);
    }
    if (observation.row === null) return true;
    if (rowMatchesCleanupAuthority(observation.row, authority)) {
      throwCleanupMutationDeferred(authority.replicaId, effect, result);
    }
    if (isCleanupTombstoneRow(observation.row)) {
      throw cleanupDeferredError(
        authority.replicaId,
        REPLICA_CLEANUP_ERROR_CODE.CLEANUP_OWNERSHIP_CHANGED,
      );
    }
    if (rowIsReplacementForAuthority(observation.row, authority)) return true;
    throw cleanupDeferredError(
      authority.replicaId,
      REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IDENTITY_CONFLICT,
    );
  }
}

export {
  REPLICA_CLEANUP_ACQUIRE_OUTCOME,
  REPLICA_CLEANUP_ERROR_CODE,
  ReplicaCleanupTombstoneOwner,
  cleanupDeferredError,
  isCleanupTombstoneRow,
  rowMatchesCleanupAuthority,
  rowMatchesRemovalContinuation,
};
