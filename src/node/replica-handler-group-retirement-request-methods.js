import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {
  GROUP_RETIREMENT_REASON,
  GROUP_RETIREMENT_REFUSAL,
  RECORD_EVIDENCE_STATE,
  groupRetirementEvidenceFromRecord,
  groupRetirementOperationIdOf,
  verifyGroupRetirement,
} from '../partition/group-retirement-evidence.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../rebalancer/replica-operation-constants.js';
import {OperationType} from '../rebalancer/replica-operation-progress.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {
  REPLICA_HANDLER_ERROR_MSG,
  REPLICA_HANDLER_LOG_MSG,
  REPLICA_HANDLER_TYPEOF,
} from './replica-handler-constants.js';

const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignReplicaHandlerGroupRetirementRequestMethods(ReplicaHandler) {
  class ReplicaHandlerGroupRetirementRequestMethods {
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
          groupRetirementOperationIdOf(evidence, replicaId),
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
     * A group-retirement REMOVE of a replica this node no longer tracks (it
     * restarted after retiring it, before its answer was recorded) or is
     * still removing (its row cleanup running after the retirement): the
     * member's own durable fact - its raft-rs lifecycle row for EXACTLY this
     * replica identity and group, retired with the group-retired reason;
     * retired for another reason (a reseed hold) once the REMOVE's evidence
     * verifies; or its group-retired tombstone for exactly this table,
     * group, identity, workflow and incarnation - answers COMPLETED
     * (provesGroupRetirement). Never from absence: no database, no row, a
     * live row, an unverified hold, no matching tombstone answers nothing
     * here.
     * @param {Object} request - REMOVE_REPLICA request.
     * @return {Promise<Object|null>} COMPLETED response, or null.
     * @private
     */
    async answerDurablyRetiredGroupMember(request) {
      const partitionId = request?.[ReplicaOperationField.PARTITION_ID];
      const replicaId = request?.[ReplicaOperationField.REPLICA_ID];
      // No file, no row, an unreadable database, no tombstone (or one of
      // another table, group, identity or workflow) is no fact: the member
      // stays listed.
      if (!await this.provesGroupRetirement(request)) {
        return null;
      }
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED, {
        replicaId, partitionId, nodeId: this.nodeId,
        durableLifecycle: GROUP_RETIREMENT_REASON});
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.COMPLETED,
        {replicaId, nodeId: this.nodeId, durablyRetired: true},
      );
    }
    /**
     * A group-retirement REMOVE's answer from the member's durable
     * lifecycle row (answerDurablyRetiredGroupMember), or null - always null
     * for an ordinary REMOVE.
     * @param {Object} request - REMOVE_REPLICA request.
     * @return {Promise<Object|null>}
     * @private
     */
    async groupMemberDurableAnswer(request) {
      return request?.[ReplicaOperationField.GROUP_RETIREMENT] ?
        this.answerDurablyRetiredGroupMember(request) : null;
    }
    /**
     * @param {string} replicaId
     * @return {Object} NOT_FOUND response.
     * @private
     */
    answerRemoveNotFound(replicaId) {
      this.logger.warn(REPLICA_HANDLER_LOG_MSG.REMOVE_NOT_FOUND, {
        replicaId,
        nodeId: this.nodeId,
      });
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.NOT_FOUND, {replicaId,
          nodeId: this.nodeId});
    }
    /**
     * @param {string} replicaId
     * @return {Object} IN_PROGRESS response.
     * @private
     */
    answerRemoveInProgress(replicaId) {
      this.logger.info(REPLICA_HANDLER_LOG_MSG.REMOVE_IN_PROGRESS, {
        replicaId,
        nodeId: this.nodeId,
      });
      return this.buildReplicaOperationResponse(
        ReplicaOperationResponseStatus.IN_PROGRESS, {replicaId,
          nodeId: this.nodeId});
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
                groupRetirementEvidence:
                  request?.[ReplicaOperationField.GROUP_RETIREMENT] ?? null,
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
  }
  for (const name of Object.getOwnPropertyNames(
    ReplicaHandlerGroupRetirementRequestMethods.prototype)) {
    if (name === LOCAL_STR_CONSTRUCTOR) continue;
    Object.defineProperty(ReplicaHandler.prototype, name,
      Object.getOwnPropertyDescriptor(
        ReplicaHandlerGroupRetirementRequestMethods.prototype, name));
  }
}

export {assignReplicaHandlerGroupRetirementRequestMethods};
