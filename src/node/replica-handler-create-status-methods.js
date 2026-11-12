/**
 * ReplicaHandler create-status persistence and local recovery seed methods.
 *
 * Keeps the priority recovery fallback and its local cache projections behind
 * the existing ReplicaHandler prototype composition seam.
 *
 * Requirements: 10.2, 3.1
 */
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {
  isRetryableControlPlaneError,
} from '../control-plane/control-plane-error-classification.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';
import {normalizePublishedRaftRole} from '../raft/published-raft-role.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {buildFailedCreateCleanupToken} from
  '../rebalancer/failed-create-cleanup-token.js';
import {CREATE_ADMISSION_STATE} from './replica-create-admission-owner.js';
import {expiredCreateInitialStatusError, persistFailedCreateLifecycle} from
  './replica-handler-failed-create-publication.js';
import {durableRowVersion} from './replica-state-machine-recovery.js';
import {
  isConflictingCachedReplicaIdentity,
  resolvePreservedReplicaRaftRole,
} from './replica-state-machine-lifecycle-observation.js';
import {REPLICA_CLEANUP_ERROR_CODE} from
  './replica-cleanup-constants.js';
import {
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_SERVICE,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';
import {isReplicaServiceHandlerBound} from
  './replica-transport-handler-identity.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';
const LOCAL_STR_UPSERT = 'UPSERT';
const MISSING_TRACKED_REPLICA_OBSERVATION = Object.freeze({
  available: false,
  trackedState: null,
});

// D2: the handler binding this owner hands to the deferred durable write. It
// resolves the live runtime at reconcile time, so a durable ACTIVE is written
// only while the exact transport handler of the tracked generation is still
// registered and retires through this lifecycle owner.
function deferredDurableWriteActivation(handler, replicaId) {
  return {
    isEffectHandlerCurrent: () => isReplicaServiceHandlerBound(
      handler.getTrackedService(replicaId),
      handler.replicaStateMachine,
    ),
  };
}

function registerAuthoritativeCreateSnapshot(
  handler,
  replicaId,
  service,
) {
  const durableVersion = durableRowVersion(service);
  handler.replicaStateMachine.registerReplicaSnapshot(replicaId, {
    partitionId: service.partition_id,
    nodeId: service.node_id,
    state: service.status,
    serviceId: service.service_id,
    serviceType: service.service_type,
    serviceAddress: service.address,
    replicaIdentity: service.replica_id,
    groupId: service.group_id,
    cleanupToken: service.cleanup_token,
    createAttemptToken: service.create_attempt_token,
    createdAt: service.created_at,
    durableVersionColumn: durableVersion?.column,
    durableVersion: durableVersion?.value,
    authoritativeSnapshot: true,
  });
}

function observeTrackedReplicaState(handler, replicaId) {
  if (typeof handler.replicaStateMachine?.getState !==
    REPLICA_HANDLER_TYPEOF.FUNCTION) {
    return MISSING_TRACKED_REPLICA_OBSERVATION;
  }
  return {
    available: true,
    trackedState: handler.replicaStateMachine.getState(replicaId),
  };
}

function isExactCreateRow(handler, row, {
  replicaId,
  partitionId,
  status,
  createAdmissionEvidence = null,
}) {
  const admissionMatches = !createAdmissionEvidence ||
    row?.created_at === createAdmissionEvidence.replicaCreatedAt &&
    row?.create_attempt_token === createAdmissionEvidence.attemptToken;
  const expected = {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    node_id: handler.nodeId,
    service_type: REPLICA_HANDLER_SERVICE.TYPE,
    status,
  };
  const identityMatches = Object.entries(expected).every(([field, value]) =>
    row?.[field] === value);
  return admissionMatches && identityMatches &&
    Number.isFinite(row?.created_at) && Boolean(durableRowVersion(row));
}

async function resumePersistedCreateStatus(handler, options) {
  if (await handler.restartFailedReplicaCreateStatus(options)) return true;
  if (await handler.resumeCreatingReplicaCreateStatus(options)) return true;
  return handler.resumeSyncingReplicaCreateStatus(options);
}

function shouldRethrowCreateStatusError(error) {
  return error?.code === REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IN_PROGRESS ||
    isRetryableControlPlaneError(error) !== true;
}

async function rotateFailedCreateEvidence(handler, evidence, physicalClaim) {
  if (!evidence) return null;
  let rotating = evidence;
  if (evidence.admissionState === CREATE_ADMISSION_STATE.FAILED) {
    rotating = await handler.getReplicaCreateAdmissionOwner()
      .beginFailedAttemptRotation(evidence, physicalClaim);
  }
  return rotating?.admissionState === CREATE_ADMISSION_STATE.ROTATING ?
    rotating : null;
}

function buildRotatingReplayContext(handler, replicaId, partitionId,
  service, rotatingEvidence) {
  const context = buildFailedCreateReplayContext(partitionId, service);
  if (!rotatingEvidence) return context;
  return {
    ...context,
    createAttemptToken: rotatingEvidence.attemptToken,
    createAdmissionEvidence: rotatingEvidence,
  };
}

async function observeCreateReplay(handler, replicaId, partitionId, status,
  createAdmissionEvidence = null) {
  const observation = await handler.replicaStateMachine
    .observeAuthoritativeReplicaLifecycle(replicaId);
  if (observation?.available !== true) return {available: false, row: null};
  const row = isExactCreateRow(handler, observation.row,
    {replicaId, partitionId, status, createAdmissionEvidence}) ? observation.row : null;
  return {available: true, row};
}

// The exact authoritative row of this create on this node in `status`,
// installed as the tracked state; null when no matching row is observed.
async function resolveCreateReplay(handler, replicaId, partitionId, status,
  createAdmissionEvidence = null) {
  const observation = await observeCreateReplay(
    handler, replicaId, partitionId, status, createAdmissionEvidence);
  if (!observation.row) return null;
  registerAuthoritativeCreateSnapshot(handler, replicaId, observation.row);
  const trackedState = observeTrackedReplicaState(
    handler,
    replicaId,
  ).trackedState;
  return trackedState?.state === status ? {service: observation.row} : null;
}

function buildFailedCreateReplayContext(partitionId, service) {
  return {
    partitionId,
    nodeId: service.node_id,
    serviceId: service.service_id,
    serviceType: service.service_type,
    serviceAddress: service.address,
  };
}

function assignReplicaHandlerCreateStatusMethods(ReplicaHandler) {
  class ReplicaHandlerCreateStatusMethods {
    async persistOrConfirmReplicaCreateFailed(options = {}) {
      const {
        operationId,
        replicaId,
        partitionId,
        errorMessage,
        claimCleanup = true,
        createAdmissionEvidence = null,
        createAttemptToken = null,
      } = options;
      const cleanupToken = claimCleanup ?
        buildFailedCreateCleanupToken(operationId) : null;
      let replay = await resolveCreateReplay(
        this,
        replicaId,
        partitionId,
        ReplicaStatus.FAILED,
        createAdmissionEvidence,
      );
      if (!replay) {
        const transitionOptions = {
          partitionId,
          errorMessage,
          cleanupToken,
          createAdmissionEvidence,
          createAttemptToken,
        };
        const persisted = await persistFailedCreateLifecycle(
          this,
          options,
          transitionOptions,
          resolveCreateReplay,
        );
        if (persisted.conflict) return false;
        replay = persisted.replay;
      }
      if (!claimCleanup) return replay !== null;
      if (!cleanupToken || !replay ||
          await this.replicaStateMachine.claimFailedCreateCleanup(
            replay.service,
            cleanupToken,
          ) !== true) {
        const error = new Error(
          `Failed create cleanup claim was not durable for ${replicaId}`,
        );
        error.code =
          REPLICA_CLEANUP_ERROR_CODE.FAILED_CREATE_CLAIM_DEFERRED;
        error.errorCode = error.code;
        error.deferRetry = true;
        throw error;
      }
      return true;
    }

    /**
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @return {void}
     * @private
     */
    deferRetryableReplicaCreateStatusWrite(options = {}) {
      const {operationId, partitionId, replicaId, error} = options;
      if (operationId) {
        this.inProgressOperations.delete(operationId);
      }
      this.localServices.delete(replicaId);
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.CREATE_STATUS_WRITE_DEFERRED, {
        operationId,
        partitionId,
        replicaId,
        error: error?.message || this.formatReplicaCreationError(error),
        retryAfterMs: Number.isFinite(error?.retryAfterMs) ?
          Math.floor(error.retryAfterMs) :
          null,
        nodeId: this.nodeId,
      });
    }

    /**
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @return {Promise<boolean>}
     * @private
     */
    async persistReplicaCreateInitialStatus(options = {}) {
      const {
        operationId,
        partitionId,
        replicaId,
        pendingStatusPersisted = false,
        createAdmissionEvidence = null,
        createAttemptToken = null,
      } = options;
      if (await resumePersistedCreateStatus(this, options)) {
        return true;
      }
      try {
        if (!pendingStatusPersisted) {
          await this.persistReplicaStatusWithRetry(
            replicaId,
            ReplicaStatus.PENDING,
            {partitionId, createAdmissionEvidence, createAttemptToken},
          );
        }
        this.throwIfShuttingDown();
        if (this.shouldUsePriorityReplicaCreateStatusFallback(partitionId)) {
          return await this.persistPriorityReplicaCreateCreatingStatus(options);
        }
        await this.persistReplicaStatusWithRetry(replicaId, ReplicaStatus.CREATING, {
          partitionId,
          createAdmissionEvidence,
          createAttemptToken,
        });
        return true;
      } catch (error) {
        const currentError = await expiredCreateInitialStatusError(
          this, options, error, observeCreateReplay);
        if (currentError !== error) throw currentError;
        if (shouldRethrowCreateStatusError(error)) throw error;
        this.deferRetryableReplicaCreateStatusWrite({
          operationId,
          partitionId,
          replicaId,
          error,
        });
        return false;
      }
    }

    async resumeCreatingReplicaCreateStatus(options = {}) {
      const {partitionId, replicaId} = options;
      if (!options.createAdmissionEvidence ||
          this.getTrackedService(replicaId)) return false;
      const replay = await resolveCreateReplay(
        this,
        replicaId,
        partitionId,
        ReplicaStatus.CREATING,
        options.createAdmissionEvidence || null,
      );
      if (!replay) return false;
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.CREATING,
        service: null,
      });
      return true;
    }

    /**
     * A durable CREATE owner may re-dispatch after a typed retryable failure.
     * Admit that command through one narrow state-machine replay seam only
     * after the failed runtime has disappeared from routing. This keeps the
     * ordinary FAILED transition table terminal and leaves resource deletion
     * with canonical REMOVE/startup cleanup.
     * @param {Object} options
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @return {Promise<boolean>} Whether a FAILED create was restarted.
     * @private
     */
    async restartFailedReplicaCreateStatus(options = {}) {
      const {
        partitionId,
        replicaId,
        createAdmissionEvidence = null,
      } = options;
      const replay = await resolveCreateReplay(
        this,
        replicaId,
        partitionId,
        ReplicaStatus.FAILED,
        createAdmissionEvidence,
      );
      if (!replay) {
        return false;
      }
      if (replay.service.cleanup_token != null) return false;
      const staleRuntime = this.getTrackedService(replicaId);
      await this.fenceFailedReplicaCreateRuntime(
        replicaId,
        partitionId,
        staleRuntime,
      );
      if (this.getTrackedService(replicaId)) {
        throw new Error(
          `Cannot redrive failed replica ${replicaId} while its runtime is tracked`,
        );
      }
      const rotatingEvidence = await rotateFailedCreateEvidence(
        this,
        createAdmissionEvidence,
        options.createPhysicalWorkerClaim,
      );
      if (createAdmissionEvidence && !rotatingEvidence) return false;
      const restarted = await Promise.resolve(
        this.replicaStateMachine.restartFailedCreate(
          replicaId,
          buildRotatingReplayContext(
            this, replicaId, partitionId, replay.service, rotatingEvidence,
          ),
          {
            persist: true,
            expectedSourceEvidence: replay.service,
          },
        ),
      );
      if (restarted !== true) {
        return false;
      }
      if (rotatingEvidence) {
        options.createAdmissionEvidence =
          await this.getReplicaCreateAdmissionOwner()
            .finishFailedAttemptRotation(
              rotatingEvidence, options.createPhysicalWorkerClaim);
        options.createAttemptToken = options.createAdmissionEvidence
          ?.attemptToken;
        if (!options.createAdmissionEvidence) return false;
      }
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.CREATING,
        service: null,
      });
      return true;
    }

    /**
     * A create re-driven onto its own durable SYNCING row (the ack-loss
     * wedge, F3 (c)): an earlier attempt of this create opened its port and
     * its SYNCING write - the prior-existence fact - applied, but the attempt
     * failed before it saw that. The row is adopted as the tracked state and
     * no PENDING/CREATING is written again; the create then opens with the
     * fact durable (identityExisted): its durable record restores - a virgin
     * one never voted, since a gated port steps nothing and the core
     * persists its hard state before it sends a vote - and an absent record
     * is refused reseed-required. A tracked runtime is never resumed over.
     * @param {Object} options - {partitionId, replicaId}.
     * @return {Promise<boolean>} Whether the create resumes at SYNCING.
     * @private
     */
    async resumeSyncingReplicaCreateStatus(options = {}) {
      const {partitionId, replicaId} = options;
      if (this.getTrackedService(replicaId)) {
        return false;
      }
      const replay = await resolveCreateReplay(
        this,
        replicaId,
        partitionId,
        ReplicaStatus.SYNCING,
        options.createAdmissionEvidence || null,
      );
      if (!replay) {
        return false;
      }
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.SYNCING,
        service: null,
      });
      // Reported to the create's admission-input owner: the resumed row is
      // the leader's admission input (replica-create-admission-input.js).
      options.resumedLifecycleStatus = ReplicaStatus.SYNCING;
      return true;
    }

    /**
     * @param {string} partitionId
     * @return {boolean}
     * @private
     */
    shouldUsePriorityReplicaCreateStatusFallback(partitionId) {
      return classifySystemPartition({partitionId}).priorityControlPlane;
    }

    /**
     * Priority control-plane recovery cannot require a second durable status
     * write before the local service exists; that service may be part of the
     * write path needed to make the status durable.
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @return {Promise<boolean>}
     * @private
     */
    async persistPriorityReplicaCreateCreatingStatus(options = {}) {
      const {operationId, partitionId, replicaId} = options;
      try {
        await this.updateReplicaStatus(replicaId, ReplicaStatus.CREATING, {
          partitionId,
          createAdmissionEvidence: options.createAdmissionEvidence,
          createAttemptToken: options.createAttemptToken,
        });
        return true;
      } catch (error) {
        if (error?.code ===
          REPLICA_CLEANUP_ERROR_CODE.CLEANUP_IN_PROGRESS) {
          throw error;
        }
        if (isRetryableControlPlaneError(error) !== true) {
          throw error;
        }
        await this.commitPriorityReplicaCreateStatusLocally({
          operationId,
          partitionId,
          replicaId,
          error,
          createAdmissionEvidence: options.createAdmissionEvidence,
          createAttemptToken: options.createAttemptToken,
        });
        return true;
      }
    }

    /**
     * CL-016: the priority local-commit fallback must make the LOCAL cache
     * reflect local truth. isReplicaVoterReady, routing viability, and
     * fan-out target resolution all read the SERVICES row from the local
     * systemTableCache; during priority recovery the durable row write
     * EXPECTEDLY defers (it writes through the very control plane being
     * recovered), so without this seed the voter-ready check polls a row
     * that cannot exist within its budget — every priority REPLACE replica
     * timed out regardless of raft catch-up speed.
     * Bootstrap hydration exception: sanctioned direct
     * applySystemTableChange call site — local-only truth, superseded later
     * by the durable write's CDC round-trip (newer updated_at wins in the
     * cache merge).
     * @param {string} replicaId
     * @param {string} partitionId
     * @param {string} status - ReplicaStatus value reflecting local truth.
     * @param {Object} [options]
     * @param {boolean} [options.markLocalOnly=true]
     * @return {boolean} Whether the row was applied.
     * @private
     */
    seedLocalPriorityServiceRow(replicaId, partitionId, status, options = {}) {
      if (
        !this.systemTableCache ||
        typeof this.systemTableCache.applySystemTableChange !==
          REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return false;
      }
      const nowMs = Date.now();
      const {trackedState} = observeTrackedReplicaState(this, replicaId);
      const trackedMatchesStatus = trackedState?.state === status;
      const createdAt = Number.isFinite(trackedState?.createdAt) ?
        trackedState.createdAt : nowMs;
      const stateEnteredAt = trackedMatchesStatus &&
        Number.isFinite(trackedState?.stateEnteredAt) ?
        trackedState.stateEnteredAt : nowMs;
      const updatedAt = trackedMatchesStatus &&
        Number.isFinite(trackedState?.durableVersion) ?
        trackedState.durableVersion : stateEnteredAt;
      const seededRow = {
        service_id: replicaId,
        service_type: REPLICA_HANDLER_SERVICE.TYPE,
        partition_id: partitionId,
        node_id: this.nodeId,
        status,
        address: this.buildTrackedServiceAddress(replicaId),
        created_at: createdAt,
        updated_at: updatedAt,
      };
      if (trackedState) {
        seededRow.replica_id = trackedState.replicaIdentity || replicaId;
        seededRow.state_entered_at = stateEnteredAt;
        seededRow.previous_state = trackedMatchesStatus ?
          trackedState.previousState ?? null :
          trackedState.state ?? null;
        seededRow.cleanup_token = trackedState.cleanupToken ?? null;
        seededRow.create_attempt_token =
          trackedState.createAttemptToken ?? null;
      }
      const existingRow = typeof this.systemTableCache.get ===
          REPLICA_HANDLER_TYPEOF.FUNCTION ?
        this.systemTableCache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId) :
        null;
      const preservedRole = trackedState ?
        resolvePreservedReplicaRaftRole(
          {
            systemTableCache: this.systemTableCache,
            resolveLiveReplicaRole: (serviceId) => {
              const role = this.getTrackedReplicaRole(serviceId);
              return isVoterRaftRole(role) ? normalizePublishedRaftRole(
                role, {collapseLeaderToFollower: true}) : null;
            },
          },
          {
            ...trackedState,
            replicaId,
            replicaIdentity: seededRow.replica_id || replicaId,
            partitionId,
            nodeId: this.nodeId,
            state: status,
            createdAt,
            cleanupToken: seededRow.cleanup_token ?? null,
            createAttemptToken: seededRow.create_attempt_token ?? null,
          },
          replicaId,
          {voterOnly: false},
        ) :
        null;
      if (preservedRole) {
        seededRow.raft_role = preservedRole;
      } else if (existingRow?.raft_role !== undefined) {
        seededRow.raft_role = null;
      }
      this.systemTableCache.applySystemTableChange(
        SYSTEM_TABLE_NAME.SERVICES,
        LOCAL_STR_UPSERT,
        seededRow,
        {causeId: `priority-local-create:${replicaId}`},
      );
      // Lifecycle persistence must UPSERT for this row until a durable
      // write confirms remote existence (the local row no longer proxies
      // it). Terminal FAILED rows and post-durable ACTIVE seeds must not arm
      // local-only full-row insert reconciliation.
      if (status !== ReplicaStatus.FAILED && options?.markLocalOnly !== false) {
        this.replicaStateMachine?.markServiceRowLocalOnly?.(
          replicaId,
          deferredDurableWriteActivation(this, replicaId),
        );
      }
      return true;
    }

    /**
     * CL-035: the learner->voter promotion updates only the in-memory raft
     * role + a DEFERRED durable raft_role write that flushes through the
     * control plane being recovered (and therefore does not land within
     * budget during post-restart recovery). The REPLACE remove-safety gate
     * (priority-publication-safety-topology.isVoterReadyReplicaTopology)
     * reads the SERVICES row's raft_role and defers removing the superseded
     * source forever while the row still reads learner/null, so the spread
     * never recovers. Mirror the CL-016 local-commit seed for the one field
     * that helper omits: write the locally-decided voting role into the
     * LOCAL cache row so the gate (which merges cache over a null-raft_role
     * authoritative row, preferring defined fields) observes local truth
     * without a control-plane round-trip. Applies to every partition the
     * voter-ready activation gate covers (critical system partitions): the
     * promotion is a committed local raft decision regardless of partition
     * class (the original priority-only scoping matched the then-observed
     * symptom, and the 2026-07-13 formation run wedged six critical-system
     * REPLACEs on replace_remove_safety_blocked while their targets had
     * already logged voter-ready — the CL-035 guard breach). Only seeds when
     * the in-memory role is a non-learner voter (the promotion is a
     * committed local decision in this single-phase raft model, so it cannot
     * mark a still-catching-up learner as a voter).
     *
     * This owner-local projection deliberately preserves the existing row's
     * durable causal version. Minting Date.now() here can out-version the
     * concurrently emitted final ACTIVE lifecycle UPSERT: the cache then
     * retains a locally projected SYNCING row even though storage and CDC
     * both carry ACTIVE. The lifecycle UPSERT preserves raft_role from this
     * cached projection and advances updated_at through its own owner.
     * @param {string} replicaId
     * @return {boolean} Whether the local raft_role seed was applied.
     * @private
     */
    seedLocalReplicaVoterRaftRole(replicaId) {
      if (
        !this.systemTableCache ||
        typeof this.systemTableCache.applySystemTableChange !==
          REPLICA_HANDLER_TYPEOF.FUNCTION ||
        typeof this.systemTableCache.get !== REPLICA_HANDLER_TYPEOF.FUNCTION
      ) {
        return false;
      }
      // Do not synthesize an incomplete row: only seed the field onto an
      // existing SERVICES row (the create-path seed already established it).
      const existingRow = this.systemTableCache.get(
        SYSTEM_TABLE_NAME.SERVICES, replicaId);
      if (!existingRow) {
        return false;
      }
      const {trackedState} = observeTrackedReplicaState(this, replicaId);
      if (trackedState &&
        isConflictingCachedReplicaIdentity(existingRow, trackedState, replicaId)
      ) {
        return false;
      }
      const trackedRole = this.getTrackedReplicaRole(replicaId);
      if (!isVoterRaftRole(trackedRole)) {
        return false;
      }
      const normalizedRole = normalizePublishedRaftRole(trackedRole, {
        collapseLeaderToFollower: true,
      });
      this.systemTableCache.applySystemTableChange(
        SYSTEM_TABLE_NAME.SERVICES,
        LOCAL_STR_UPSERT,
        {service_id: replicaId, raft_role: normalizedRole},
        {causeId: `local-voter-ready:${replicaId}`},
      );
      this.replicaStateMachine?.markServiceRowLocalOnly?.(
        replicaId, deferredDurableWriteActivation(this, replicaId));
      return true;
    }

    /**
     * @param {Object} options
     * @param {string} options.operationId
     * @param {string} options.partitionId
     * @param {string} options.replicaId
     * @param {Error} options.error
     * @return {Promise<boolean>}
     * @private
     */
    async commitPriorityReplicaCreateStatusLocally(options = {}) {
      const {operationId, partitionId, replicaId, error} = options;
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.CREATING,
      });
      const transitionContext = {
        partitionId,
        nodeId: this.nodeId,
        errorMessage: error?.message || null,
        createAdmissionEvidence: options.createAdmissionEvidence,
        createAttemptToken: options.createAttemptToken,
        serviceId: replicaId,
        serviceType: REPLICA_HANDLER_SERVICE.TYPE,
        serviceAddress: this.buildTrackedServiceAddress(replicaId),
      };
      const trackedState =
        this.replicaStateMachine?.getState?.(replicaId) || null;
      if (trackedState?.state !== ReplicaStatus.CREATING) {
        const result = await Promise.resolve(
          this.replicaStateMachine._applyTransition(
            replicaId, ReplicaStatus.CREATING, transitionContext,
            {persist: false, validate: trackedState !== null},
          ),
        );
        if (result === false) {
          throw new Error(
            `Replica local state transition rejected for ${replicaId}: ` + ReplicaStatus.CREATING,
          );
        }
      }
      this.seedLocalPriorityServiceRow(
        replicaId,
        partitionId,
        ReplicaStatus.CREATING,
      );
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.CREATE_STATUS_WRITE_DEFERRED, {
        operationId,
        partitionId,
        replicaId,
        status: ReplicaStatus.CREATING,
        localProgressCommitted: true,
        error: error?.message || this.formatReplicaCreationError(error),
        retryAfterMs: Number.isFinite(error?.retryAfterMs) ?
          Math.floor(error.retryAfterMs) :
          null,
        nodeId: this.nodeId,
      });
      return true;
    }
  }

  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerCreateStatusMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerCreateStatusMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerCreateStatusMethods};
