import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  buildFailedCreateRemoveToken,
  isFailedCreateCleanupToken,
} from
  '../rebalancer/failed-create-cleanup-token.js';
import {durableRowVersion} from
  './replica-state-machine-lifecycle-observation.js';
import {
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_LOG_MSG,
} from './replica-handler-constants.js';
import {REPLICA_CLEANUP_AUTHORITY_KIND} from
  './replica-cleanup-constants.js';
import {
  REPLICA_HANDLER_LEADER_HANDOFF_STATE,
} from './replica-handler-leader-handoff-methods.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

function matchesFailedCreateCleanupPrecondition(precondition, expected) {
  if (!precondition || typeof precondition !== 'object' ||
      Array.isArray(precondition)) return false;
  return Object.entries(expected).every(
    ([field, value]) => precondition[field] === value,
  );
}

function hasValidFailedCreateCleanupPrecondition(precondition) {
  if (!precondition) return false;
  if (!isFailedCreateCleanupToken(precondition.cleanup_token)) return false;
  return typeof precondition.create_attempt_token === 'string' &&
    precondition.create_attempt_token.length > 0;
}

function matchesClaimedFailedCreateRemoval(row, precondition, cleanupToken) {
  const identityMatches = matchesFailedCreateCleanupPrecondition(row, {
    service_id: precondition?.service_id,
    replica_id: precondition?.replica_id,
    group_id: precondition?.group_id ?? null,
    partition_id: precondition?.partition_id,
    node_id: precondition?.node_id,
    service_type: precondition?.service_type,
    created_at: precondition?.created_at,
    status: ReplicaStatus.REMOVING,
    previous_state: ReplicaStatus.FAILED,
    cleanup_token: cleanupToken,
    create_attempt_token: precondition?.create_attempt_token,
  });
  return identityMatches && isLaterLifecycleGeneration(row, precondition);
}

function isLaterLifecycleGeneration(row, precondition) {
  const sourceVersion = precondition?.state_entered_at;
  return Number.isFinite(sourceVersion) &&
    Number.isFinite(row?.state_entered_at) &&
    row.state_entered_at > sourceVersion;
}

function matchesCleanupCompletionReceipt(
  authority,
  replicaId,
  partitionId,
  nodeId,
  cleanupToken,
) {
  return authority?.kind === REPLICA_CLEANUP_AUTHORITY_KIND.COMPLETE &&
    authority.replicaId === replicaId &&
    authority.partitionId === partitionId &&
    authority.nodeId === nodeId &&
    authority.ownerToken === cleanupToken;
}

function validFailedCreateCleanupRequest(
  handler,
  precondition,
  replicaId,
  partitionId,
) {
  return matchesFailedCreateCleanupPrecondition(precondition, {
    service_id: replicaId,
    partition_id: partitionId,
    node_id: handler.nodeId,
    status: ReplicaStatus.FAILED,
  }) && isFailedCreateCleanupToken(precondition?.cleanup_token) &&
    typeof precondition?.create_attempt_token === 'string' &&
    precondition.create_attempt_token.length > 0 &&
    typeof handler.replicaStateMachine
      ?.transitionAuthoritativeReplicaGeneration === 'function';
}

async function applyFailedCreateCleanupTransition(
  handler,
  precondition,
  request,
  replicaId,
  partitionId,
  cleanupToken,
) {
  try {
    return await handler.replicaStateMachine
      .transitionAuthoritativeReplicaGeneration(
        precondition,
        ReplicaStatus.REMOVING,
        {
          partitionId,
          nodeId: handler.nodeId,
          serviceId: replicaId,
          errorMessage: request?.[ReplicaOperationField.REASON] || null,
          cleanupToken,
        },
      ) === true;
  } catch (_error) {
    return false;
  }
}

function assignReplicaHandlerRemoveRequestMethods(ReplicaHandler) {
  class ReplicaHandlerRemoveRequestMethods {
    /**
     * @param {string} replicaId
     * @return {boolean}
     * @private
     */
    hasInProgressReplicaRemoval(replicaId) {
      for (const operation of this.inProgressOperations.values()) {
        if (
          operation?.type === ReplicaOperationMessageType.REMOVE_REPLICA &&
          operation?.replicaId === replicaId
        ) {
          return true;
        }
      }
      return false;
    }
    /**
     * @param {string} operationId
     * @param {string} partitionId
     * @param {string} replicaId
     * @return {void}
     * @private
     */
    trackReplicaRemovalOperation(operationId, partitionId, replicaId) {
      this.inProgressOperations.set(operationId, {
        type: ReplicaOperationMessageType.REMOVE_REPLICA,
        replicaId,
        partitionId,
        startedAt: Date.now(),
      });
    }
    /**
     * @param {Object} request
     * @return {void}
     * @private
     */
    startRemoveReplicaAsync(request) {
      const operationId = request?.[ReplicaOperationField.OPERATION_ID];
      const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
      const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
      const reason = request?.[ReplicaOperationField.REASON];
      this.registerOperationTask(
        new Promise((resolve) => {
          setImmediate(() => {
            if (this.shuttingDown) {
              this.inProgressOperations.delete(operationId);
              resolve();
              return;
            }
            resolve(
              this.removeReplicaAsync({
                operationId,
                partitionId,
                replicaId,
                reason,
              }).catch((error) => {
                this.logger.error(REPLICA_HANDLER_LOG_MSG.ASYNC_REMOVE_FAILED, {
                  operationId,
                  replicaId,
                  error: error.message,
                  stack: error.stack,
                });
              }),
            );
          });
        }),
      );
    }
    /**
     * Consume a failed-create cleanup precondition at the lifecycle owner.
     * The state machine performs the authoritative read and exact-generation
     * FAILED -> REMOVING CAS in its per-replica mutation lane. A token is only
     * a predicate; absence, authority failure, or a newer generation refuses
     * the destructive request before the local serving fence is raised.
     * @param {Object} request
     * @param {string} replicaId
     * @param {string} partitionId
     * @return {Promise<boolean>}
     * @private
     */
    async admitFailedCreateTargetCleanup(request, replicaId, partitionId) {
      const precondition = request?.[
        ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
      ];
      if (precondition === undefined) {
        return true;
      }
      if (!validFailedCreateCleanupRequest(
        this, precondition, replicaId, partitionId)) {
        return false;
      }
      const cleanupToken = buildFailedCreateRemoveToken(
        request?.[ReplicaOperationField.OPERATION_ID],
      );
      if (!cleanupToken) return false;
      if (await applyFailedCreateCleanupTransition(
        this, precondition, request, replicaId, partitionId, cleanupToken)) {
        return true;
      }
      const observation = await this.replicaStateMachine
        .observeAuthoritativeReplicaLifecycle(replicaId);
      if (observation?.available !== true ||
          !matchesClaimedFailedCreateRemoval(
            observation.row,
            precondition,
            cleanupToken,
          )) return false;
      const version = durableRowVersion(observation.row);
      return this.replicaStateMachine.registerReplicaSnapshot(replicaId, {
        partitionId,
        nodeId: this.nodeId,
        state: ReplicaStatus.REMOVING,
        serviceId: replicaId,
        serviceType: observation.row.service_type,
        serviceAddress: observation.row.address,
        replicaIdentity: observation.row.replica_id,
        groupId: observation.row.group_id,
        cleanupToken: observation.row.cleanup_token,
        createAttemptToken: observation.row.create_attempt_token,
        createdAt: observation.row.created_at,
        durableVersionColumn: version?.column,
        durableVersion: version?.value,
        authoritativeSnapshot: true,
      }) === true;
    }
    async hasCompletedFailedCreateCleanupReceipt(
      request,
      replicaId,
      partitionId,
    ) {
      const precondition = request?.[
        ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
      ];
      if (!hasValidFailedCreateCleanupPrecondition(precondition)) return false;
      const cleanupToken = buildFailedCreateRemoveToken(
        request?.[ReplicaOperationField.OPERATION_ID],
      );
      if (!cleanupToken) return false;
      const owner = this.getReplicaCleanupTombstoneOwner();
      const observation = await owner.observeReplica(replicaId);
      if (observation.available !== true) return false;
      if (observation.row === null) {
        return owner.isTerminalCleanupReplicaAbsent(
          replicaId,
          request?.[ReplicaOperationField.OPERATION_ID],
        );
      }
      const authority = await owner.observeAuthority(replicaId);
      const matchingReceipt = matchesCleanupCompletionReceipt(
        authority,
        replicaId,
        partitionId,
        this.nodeId,
        cleanupToken,
      );
      if (!matchingReceipt) return false;
      if (!await owner.isReceiptOperationTerminal(authority)) return true;
      return owner.release(authority, {artifactsAbsent: true});
    }
    async answerCompletedFailedCreateCleanupReceipt(
      request,
      operationId,
      replicaId,
      partitionId,
    ) {
      const precondition = request?.[
        ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
      ];
      if (precondition === undefined ||
          !await this.hasCompletedFailedCreateCleanupReceipt(
            request,
            replicaId,
            partitionId,
          )) return null;
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.COMPLETED,
        {operationId, replicaId, nodeId: this.nodeId},
      );
    }
    answerMissingRemoveReplica(replica, precondition, replicaId) {
      if (replica) return null;
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_NOT_FOUND, {
        replicaId,
        nodeId: this.nodeId,
      });
      return this.buildReplicaOperationResponse(
        precondition === undefined ?
          ReplicaOperationResponseStatus.NOT_FOUND :
          ReplicaOperationResponseStatus.ERROR,
        {
          ...(precondition === undefined ? {} : {
            error:
              REPLICA_HANDLER_ERROR_MSG.REMOVE_CLEANUP_PRECONDITION_REFUSED,
          }),
          replicaId,
          nodeId: this.nodeId,
        },
      );
    }
    /**
     * Handle REMOVE_REPLICA request.
     * Returns immediately with 'initiated', then does async work.
     * Implements idempotency per Requirements 10.2.
     * @param {Object} request - REMOVE_REPLICA request.
     * @return {Promise<Object>} Response.
     */
    async handleRemoveReplica(request) {
      await this.awaitRemovedReplicaCleanupAdmissionBarrier();
      const operationId = request?.[ReplicaOperationField.OPERATION_ID];
      const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
      const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
      const reason = request?.[ReplicaOperationField.REASON];
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_REQUEST, {
        operationId,
        partitionId,
        replicaId,
        reason,
        nodeId: this.nodeId,
      });
      if (!operationId || !partitionId || !replicaId) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_MISSING_FIELDS, {
          operationId,
          partitionId,
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: REPLICA_HANDLER_ERROR_MSG.REMOVE_REQUIRED_FIELDS,
            nodeId: this.nodeId,
          },
        );
      }
      const failedCreateCleanupPrecondition = request?.[
        ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION
      ];
      const receiptResponse =
        await this.answerCompletedFailedCreateCleanupReceipt(
          request, operationId, replicaId, partitionId);
      if (receiptResponse) return receiptResponse;
      // Check if replica exists
      const replica = this.getLocalReplica(replicaId);
      const missingReplicaResponse = this.answerMissingRemoveReplica(
        replica, failedCreateCleanupPrecondition, replicaId);
      if (missingReplicaResponse) return missingReplicaResponse;
      // Cross-check partition identity before any status write or shutdown:
      // a mismatched request must never shut down the wrong replica, corrupt
      // local metadata, or silently no-op the partition-scoped row delete.
      if (
        typeof replica.partitionId === 'string' &&
        replica.partitionId !== partitionId
      ) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_PARTITION_MISMATCH, {
          operationId,
          replicaId,
          localPartitionId: replica.partitionId,
          requestPartitionId: partitionId,
          nodeId: this.nodeId,
        });
        const partitionMismatch = REPLICA_HANDLER_ERROR_MSG
          .REMOVE_PARTITION_MISMATCH;
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: partitionMismatch(
              replicaId,
              replica.partitionId,
              partitionId,
            ),
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      const trackedOperation = this.inProgressOperations.get(operationId);
      const sameRemovalAlreadyInProgress =
        trackedOperation?.type === ReplicaOperationMessageType.REMOVE_REPLICA &&
        trackedOperation?.replicaId === replicaId &&
        trackedOperation?.partitionId === partitionId;
      const mayUseLocalRemovalShortcut =
        failedCreateCleanupPrecondition === undefined ||
        sameRemovalAlreadyInProgress;
      // Check idempotency - already removing
      if (replica.status === ReplicaStatus.REMOVING &&
          mayUseLocalRemovalShortcut) {
        this.fenceReplicaServingAdmissionForRemoval(replicaId, replica);
        if (!this.hasInProgressReplicaRemoval(replicaId)) {
          this.trackReplicaRemovalOperation(operationId, partitionId, replicaId);
          this.startRemoveReplicaAsync(request);
        }
        this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_IN_PROGRESS, {
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.IN_PROGRESS,
          {
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      // Check idempotency - already removed. Cleanup reconcile is only safe
      // when the request targets the replica's recorded partition; a
      // mismatched partitionId would no-op the partition-scoped row delete
      // and could drive filesystem cleanup against the wrong identity.
      if (
        replica.status === ReplicaStatus.REMOVED &&
        (typeof replica.partitionId !== 'string' ||
          replica.partitionId === partitionId) &&
        mayUseLocalRemovalShortcut
      ) {
        try {
          await this.reconcileRemovedReplicaCleanup(replicaId, partitionId);
        } catch (error) {
          this.logger.error(REPLICA_HANDLER_LOG_MSG.REMOVE_FAILED, {
            operationId,
            replicaId,
            partitionId,
            error: error.message,
            stack: error.stack,
          });
          return this.buildReplicaOperationResponse(
            ReplicaOperationResponseStatus.ERROR,
            {
              error: error.message,
              replicaId,
              nodeId: this.nodeId,
            },
          );
        }
        this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED, {
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.COMPLETED,
          {
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      const cleanupAdmitted = await this.admitFailedCreateTargetCleanup(
        request,
        replicaId,
        partitionId,
      );
      if (!cleanupAdmitted) {
        this.logger.warn(
          REPLICA_HANDLER_LOG_MSG.REMOVE_CLEANUP_PRECONDITION_REFUSED,
          {operationId, replicaId, partitionId, nodeId: this.nodeId},
        );
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error:
              REPLICA_HANDLER_ERROR_MSG.REMOVE_CLEANUP_PRECONDITION_REFUSED,
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
      // Check idempotency - in-progress operation
      if (this.inProgressOperations.has(operationId)) {
        this.logger.info(REPLICA_HANDLER_LOG_MSG.OPERATION_IN_PROGRESS, {
          operationId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.IN_PROGRESS,
          {
            operationId,
            nodeId: this.nodeId,
          },
        );
      }
      // Install the partition-owned admission fence before acknowledging the
      // request. The asynchronous removal may wait for existing transactions,
      // but no later transaction can overtake the removal turn.
      this.fenceReplicaServingAdmissionForRemoval(replicaId, replica);
      // Track in-progress operation
      this.trackReplicaRemovalOperation(operationId, partitionId, replicaId);
      this.setLocalReplica(replicaId, {
        replicaId,
        partitionId,
        status: ReplicaStatus.REMOVING,
        service: replica.service || this.getTrackedService(replicaId),
      });
      // Start async removal after ACK has returned.
      this.startRemoveReplicaAsync(request);
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.INITIATED,
        {
          operationId,
          replicaId,
          nodeId: this.nodeId,
        },
      );
    }
    /**
     * The STEP_DOWN_REPLICA answer of one typed leader handoff: an untracked
     * replica is NOT_FOUND; a tracked service with no transfer authority, or
     * a transfer the port refused (nothing changed; its typed reason rides
     * along), is ERROR; a transfer accepted or a named role no-op is
     * COMPLETED with the branch taken.
     * @param {Object} handoffResult - The typed leader-handoff result.
     * @param {Object} request - {operationId, partitionId, replicaId}.
     * @return {Object} Response.
     * @private
     */
    answerStepDownHandoff(handoffResult, {operationId, partitionId,
      replicaId}) {
      const fields = {operationId, partitionId, replicaId, nodeId: this.nodeId};
      const answer = {operationId, replicaId, nodeId: this.nodeId};
      if (handoffResult.state ===
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_APPLICABLE) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_NOT_FOUND, fields);
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.NOT_FOUND, answer);
      }
      if (handoffResult.state ===
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED) {
        this.logger.error(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_FAILED, {...fields,
          error: REPLICA_HANDLER_ERROR_MSG.STEP_DOWN_NOT_SUPPORTED});
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {error: REPLICA_HANDLER_ERROR_MSG.STEP_DOWN_NOT_SUPPORTED, ...answer});
      }
      const handoff = {
        handoffBranch: handoffResult.branch,
        handoffTrackedRole: handoffResult.trackedRole,
        handoffTransfer: handoffResult.transfer ?? null,
      };
      if (handoffResult.state ===
          REPLICA_HANDLER_LEADER_HANDOFF_STATE.REFUSED) {
        const error = REPLICA_HANDLER_ERROR_MSG.stepDownTransferRefused(
          handoffResult.transfer?.reason);
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_REFUSED,
          {...fields, ...handoff, error});
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR, {error, ...answer, ...handoff});
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_COMPLETED,
        {...fields, ...handoff});
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.COMPLETED, {...answer, ...handoff});
    }
    /**
     * Handle STEP_DOWN_REPLICA request.
     * Answers once the partition's port answered the leadership transfer
     * (acceptance, never completion).
     * @param {Object} request - STEP_DOWN_REPLICA request.
     * @return {Promise<Object>} Response.
     */
    async handleStepDownReplica(request) {
      const operationId = request?.[ReplicaOperationField.OPERATION_ID];
      const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
      const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
      const reason = request?.[ReplicaOperationField.REASON];
      this.logger.info(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_REQUEST, {
        operationId,
        partitionId,
        replicaId,
        reason,
        nodeId: this.nodeId,
      });
      if (!operationId || !partitionId || !replicaId) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_MISSING_FIELDS, {
          operationId,
          partitionId,
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: REPLICA_HANDLER_ERROR_MSG.STEP_DOWN_REQUIRED_FIELDS,
            nodeId: this.nodeId,
          },
        );
      }
      try {
        const handoffResult = await this.requestTrackedPartitionLeaderHandoff(
          replicaId,
          reason,
        );
        return this.answerStepDownHandoff(handoffResult,
          {operationId, partitionId, replicaId});
      } catch (error) {
        this.logger.error(REPLICA_HANDLER_LOG_MSG.STEP_DOWN_FAILED, {
          operationId,
          partitionId,
          replicaId,
          nodeId: this.nodeId,
          error: error.message,
          stack: error.stack,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.ERROR,
          {
            error: error.message,
            operationId,
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
    }
  }
  for (const methodName of Object.getOwnPropertyNames(
    ReplicaHandlerRemoveRequestMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      ReplicaHandler.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerRemoveRequestMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignReplicaHandlerRemoveRequestMethods};
