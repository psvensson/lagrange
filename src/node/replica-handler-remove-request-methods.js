import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {OperationType} from '../rebalancer/replica-operation-progress.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  GROUP_RETIREMENT_REASON,
  GROUP_RETIREMENT_REFUSAL,
  RECORD_EVIDENCE_STATE,
  groupRetirementEvidenceFromRecord,
  verifyGroupRetirement,
} from '../partition/group-retirement-evidence.js';

const DISSOLVE_OPERATION_SEGMENT = ':dissolve:';
import {
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';
import {
  REPLICA_HANDLER_LEADER_HANDOFF_STATE,
} from './replica-handler-leader-handoff-methods.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

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
     * Verify a REMOVE's group-retirement evidence against the durable
     * workflow record before any removal work starts (owner decision
     * 2026-10-04: a group retired by a durable cutover exits as a unit).
     * Nothing to verify for an ordinary REMOVE, or when this request starts
     * no work (the replica is unknown, already removed, or its removal is
     * already running).
     * @param {Object} request - REMOVE_REPLICA request.
     * @return {Promise<Object|null>} The frozen group-retirement decision,
     *   or null.
     * @private
     */
    async verifyRemoveGroupRetirement(request) {
      const evidence = request?.[ReplicaOperationField.GROUP_RETIREMENT];
      const operationId = request?.[ReplicaOperationField.OPERATION_ID];
      const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
      const replica = this.getLocalReplica(replicaId);
      if (evidence === undefined || evidence === null || !replica ||
          replica.status === ReplicaStatus.REMOVED ||
          this.hasInProgressReplicaRemoval(replicaId) ||
          this.inProgressOperations.has(operationId)) {
        return null;
      }
      return this.verifyGroupRetirementForReplica(replica, evidence,
        request?.[ReplicaOperationField.PARTITION_ID]);
    }
    /**
     * The evidence's table is its record's address: it must be this
     * replica's own table whenever the replica knows it; then the record
     * decides.
     * @param {Object} replica - getLocalReplica's answer.
     * @param {Object} evidence - The REMOVE's evidence.
     * @param {string} partitionId - The partition the REMOVE names.
     * @return {Promise<Object>} The frozen decision.
     * @private
     */
    verifyGroupRetirementForReplica(replica, evidence, partitionId) {
      const ownTableId = this.resolveReplicaTableId(replica);
      if (ownTableId !== null && evidence?.tableId !== ownTableId) {
        return Promise.resolve(Object.freeze({retire: false,
          refusal: GROUP_RETIREMENT_REFUSAL.TABLE_MISMATCH}));
      }
      return verifyGroupRetirement(this.getControlPlaneSystemTableGateway(),
        evidence, partitionId);
    }
    /**
     * A replica's own table: its partition service's, else its partition
     * row's; null when neither is known.
     * @param {Object} replica - getLocalReplica's answer.
     * @return {string|null}
     * @private
     */
    resolveReplicaTableId(replica) {
      const fromService = replica?.service?.tableId;
      if (typeof fromService === REPLICA_HANDLER_TYPEOF.STRING &&
          fromService.length > 0) {
        return fromService;
      }
      const partitionRow = replica?.partitionId ?
        this.systemTableCache?.get?.(SYSTEM_TABLE_NAME.PARTITIONS,
          replica.partitionId) : null;
      const fromRow = partitionRow?.table_id;
      return typeof fromRow === REPLICA_HANDLER_TYPEOF.STRING &&
        fromRow.length > 0 ? fromRow : null;
    }
    /**
     * The safety net for a member that missed its REMOVE (owner decision
     * 2026-10-04): a replica opened (started or restarted) for a partition
     * whose durable workflow record retires its group is retired as a unit
     * through the same verified path a group-retirement REMOVE takes - the
     * evidence is the record's own (workflow id, fence), and acceptance
     * re-reads and verifies it. An absent or unreadable record is never
     * evidence: the replica opens as it always did, and the workflow owner's
     * re-drive retires it. The local tables row is only a hint to skip the
     * read when it shows no transition at all.
     * @param {string} replicaId
     * @return {Promise<Object|null>} The REMOVE answer, or null.
     * @private
     */
    async retireIfOpenedIntoRetiredGroup(replicaId) {
      const replica = this.getLocalReplica(replicaId);
      const tableId = this.resolveReplicaTableId(replica);
      const hint = tableId !== null ?
        this.systemTableCache?.get?.(SYSTEM_TABLE_NAME.TABLES, tableId) :
        null;
      if (!replica?.partitionId || tableId === null ||
          (hint && !hint.partition_transition_state)) {
        return null;
      }
      const outcome = await groupRetirementEvidenceFromRecord(
        this.getControlPlaneSystemTableGateway(), tableId,
        replica.partitionId);
      this.reportOpenRecordState(replicaId, replica.partitionId, outcome);
      if (outcome.state !== RECORD_EVIDENCE_STATE.RETIRE) {
        return null;
      }
      const evidence = outcome.evidence;
      this.logger.info(REPLICA_HANDLER_LOG_MSG.OPENED_INTO_RETIRED_GROUP, {
        replicaId, partitionId: replica.partitionId, kind: evidence.kind,
        workflowId: evidence.workflowId, nodeId: this.nodeId});
      return this.handleRemoveReplica({
        [ReplicaOperationField.TYPE]:
          ReplicaOperationMessageType.REMOVE_REPLICA,
        [ReplicaOperationField.OPERATION_ID]:
          evidence.workflowId + DISSOLVE_OPERATION_SEGMENT + replicaId,
        [ReplicaOperationField.OPERATION_TYPE]: OperationType.REMOVE,
        [ReplicaOperationField.PARTITION_ID]: replica.partitionId,
        [ReplicaOperationField.REPLICA_ID]: replicaId,
        [ReplicaOperationField.REASON]: GROUP_RETIREMENT_REASON,
        [ReplicaOperationField.GROUP_RETIREMENT]: evidence,
      });
    }
    /**
     * One WARN when a replica opened without being able to read its group's
     * retirement record (it stays un-retired, and may campaign in a dead
     * group), then again only when that state changes.
     * @param {string} replicaId
     * @param {string} partitionId
     * @param {Object} outcome - groupRetirementEvidenceFromRecord's answer.
     * @return {void}
     * @private
     */
    reportOpenRecordState(replicaId, partitionId, outcome) {
      this.openRecordStateByReplica ??= new Map();
      const previous = this.openRecordStateByReplica.get(replicaId);
      this.openRecordStateByReplica.set(replicaId, outcome.state);
      if (outcome.state === RECORD_EVIDENCE_STATE.UNAVAILABLE &&
          previous !== outcome.state) {
        this.logger.warn(
          REPLICA_HANDLER_LOG_MSG.OPEN_RETIREMENT_RECORD_UNAVAILABLE,
          {replicaId, partitionId, nodeId: this.nodeId});
      }
    }
    /**
     * The typed answer to a REMOVE whose group-retirement evidence the
     * durable record refused: nothing was fenced, nothing retires, the
     * replica keeps serving.
     * @param {Object} request - REMOVE_REPLICA request.
     * @param {Object} decision - The refused decision.
     * @return {Object} ERROR response.
     * @private
     */
    refuseRemoveGroupRetirement(request, decision) {
      const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_GROUP_RETIREMENT_REFUSED, {
        operationId: request?.[ReplicaOperationField.OPERATION_ID],
        partitionId: request?.[ReplicaOperationField.PARTITION_ID],
        replicaId,
        refusal: decision.refusal,
        nodeId: this.nodeId,
      });
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.ERROR,
        {
          error: REPLICA_HANDLER_ERROR_MSG.removeGroupRetirementRefused(
            replicaId, decision.refusal),
          groupRetirementRefusal: decision.refusal,
          replicaId,
          nodeId: this.nodeId,
        },
      );
    }
    /**
     * A group-retirement REMOVE of a replica this node already removed (its
     * own verified REMOVE, or the open-time safety net, retired it): the
     * member's own positive answer to its workflow owner, which completes
     * only on such answers. Its cleanup reconcile (e.g. the row already
     * released) stays the ordinary path's deferred debt; an ordinary REMOVE
     * keeps answering that ERROR.
     * @param {Object} request - REMOVE_REPLICA request.
     * @param {Error} error - The cleanup reconcile's failure.
     * @return {Object} COMPLETED response.
     * @private
     */
    answerRemovedGroupMember(request, error) {
      const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
      this.logger.warn(
        REPLICA_HANDLER_LOG_MSG.REMOVE_GROUP_RETIRED_CLEANUP_DEFERRED, {
          operationId: request?.[ReplicaOperationField.OPERATION_ID],
          partitionId: request?.[ReplicaOperationField.PARTITION_ID],
          replicaId, nodeId: this.nodeId, error: error?.message});
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.COMPLETED,
        {replicaId, nodeId: this.nodeId, cleanupDeferred: true},
      );
    }
    /**
     * @param {Object} request
     * @param {Object|null} [groupRetirement] - The verified group-retirement
     *   decision, or null for an ordinary REMOVE.
     * @return {void}
     * @private
     */
    startRemoveReplicaAsync(request, groupRetirement = null) {
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
                groupRetirement,
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
      const groupRetirement = await this.verifyRemoveGroupRetirement(request);
      if (groupRetirement !== null && groupRetirement.retire !== true) {
        return this.refuseRemoveGroupRetirement(request, groupRetirement);
      }
      // Check if replica exists
      const replica = this.getLocalReplica(replicaId);
      if (!replica) {
        this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_NOT_FOUND, {
          replicaId,
          nodeId: this.nodeId,
        });
        return this.buildReplicaOperationResponse(
          ReplicaOperationResponseStatus.NOT_FOUND,
          {
            replicaId,
            nodeId: this.nodeId,
          },
        );
      }
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
      // Check idempotency - already removing
      if (replica.status === ReplicaStatus.REMOVING) {
        this.fenceReplicaServingAdmissionForRemoval(replicaId, replica);
        if (!this.hasInProgressReplicaRemoval(replicaId)) {
          this.trackReplicaRemovalOperation(operationId, partitionId, replicaId);
          this.startRemoveReplicaAsync(request, groupRetirement);
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
          replica.partitionId === partitionId)
      ) {
        try {
          await this.reconcileRemovedReplicaCleanup(replicaId, partitionId);
        } catch (error) {
          if (request?.[ReplicaOperationField.GROUP_RETIREMENT]) {
            return this.answerRemovedGroupMember(request, error);
          }
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
      this.startRemoveReplicaAsync(request, groupRetirement);
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
