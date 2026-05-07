import {REPLICA_DISPATCH_SERVICE_SHARED} from './replica-dispatch-service-shared.js';
import {ReplicaDispatchServiceSegment2} from './replica-dispatch-service-segment-2.js';

const {
  COLUMN,
  CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT,
  ControlPlaneField,
  DISPATCH_DEFAULT,
  DISPATCH_LOG_MSG,
  MEMBERSHIP_PUBLICATION_STATUS,
  NODE_STATE_UPDATE_RETRY_ACTION,
  NODE_STATE_UPDATE_RETRY_CLASS,
  NODE_STATE_UPDATE_RETRY_POLICY,
  NUM,
  OperationType,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  READY_NODE_PUBLICATION_ADVANCEMENT_STATE,
  RECONCILE_REASON,
  REPLICA_DISPATCH_SERVICE_LITERAL,
  STATE,
  TYPEOF,
  WORKFLOW_STEP,
  compareNodeHeartbeatWatermarks,
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneNodeStatePublicationProfile,
  getControlPlaneRetryAfterMs,
  getNodeHeartbeatWatermark,
  isCoordinatorOwnedOperationType,
  isRetryableControlPlaneError,
  resolveControlPlaneNodeStatePublicationMode,
  resolveReadyNodePublicationAdvancementState,
  resolveReplayControlPlaneNodeStatePublicationMode,
} = REPLICA_DISPATCH_SERVICE_SHARED;

const READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS = Object.freeze({});
const READY_NODE_PUBLICATION_ADVANCEMENT_NODE_ROW_UNAVAILABLE = null;
const READY_NODE_PUBLICATION_ADVANCEMENT_OPTION = Object.freeze({
  PUBLICATION_ROWS: 'publicationRows',
});

class ReplicaDispatchServiceSegment3 extends ReplicaDispatchServiceSegment2 {
  enqueueReplicaOperationRow(row, reasons) {
    if (!row || !row.operation_id) {
      return false;
    }
    if (
      !isCoordinatorOwnedOperationType(row.type) ||
      !this.isReplicaOperationLocallyOwned(row)
    ) {
      return false;
    }

    if (
      row.type === OperationType.REPLACE &&
      row.workflow_step === WORKFLOW_STEP.ACTIVE
    ) {
      this.operationDispatchQueue.enqueue(
        row.operation_id,
        reasons.replaceActiveReason,
        {row},
      );
      return true;
    }

    if (
      row.workflow_step !== WORKFLOW_STEP.PENDING &&
      row.workflow_step !== WORKFLOW_STEP.SENDING
    ) {
      return false;
    }

    this.operationDispatchQueue.enqueue(
      row.operation_id,
      reasons.pendingReason,
      {row},
    );
    return true;
  }

  replayReplicaOperationRow(row, reasons) {
    if (!row || !row.operation_id) {
      return false;
    }
    if (!isCoordinatorOwnedOperationType(row.type)) {
      return false;
    }
    if (this.enqueueReplicaOperationRow(row, reasons)) {
      return true;
    }

    const workflowStep = row.workflow_step;
    const remoteReplayable =
      workflowStep === WORKFLOW_STEP.PENDING ||
      workflowStep === WORKFLOW_STEP.SENDING ||
      (row.type === OperationType.REPLACE &&
        workflowStep === WORKFLOW_STEP.ACTIVE);
    if (!remoteReplayable || this.isReplicaOperationLocallyOwned(row)) {
      return false;
    }

    this.sendDirectDispatchWakeup(this.buildOperationFromRow(row)).catch(
      () => {},
    );
    return true;
  }

  /**
   * Resolve node id from a system row shape.
   * @param {Object} record - Row object.
   * @return {string|null} Node ID.
   * @private
   */
  getNodeIdFromRecord(record) {
    return record?.[COLUMN.NODE_ID] || record?.node_id || record?.id || null;
  }

  /**
   * Clear cached ready-trigger watermark for one node.
   * @param {string} nodeId - Node ID.
   * @private
   */
  clearNodeReadyRetryWatermark(nodeId) {
    if (!nodeId) {
      return;
    }
    this.nodeReadyRetryWatermarks.delete(nodeId);
  }

  /**
   * Build a comparable watermark for one ready row.
   * @param {Object} nodeRow - Nodes row candidate.
   * @return {Object|null} Comparable watermark or null when unavailable.
   * @private
   */
  getNodeReadyRetryWatermark(nodeRow) {
    const heartbeatAt = Number(
      nodeRow?.[COLUMN.LAST_HEARTBEAT] || nodeRow?.last_heartbeat,
    );
    const readyLeaseExpiresAt = Number(
      nodeRow?.[COLUMN.READY_LEASE_EXPIRES_AT] ||
        nodeRow?.ready_lease_expires_at,
    );
    if (
      !Number.isFinite(heartbeatAt) ||
      !Number.isFinite(readyLeaseExpiresAt)
    ) {
      return null;
    }
    return {heartbeatAt, readyLeaseExpiresAt};
  }

  /**
   * Compare two ready-row watermarks for monotonic retry progression.
   * @param {Object|null} previous - Previous watermark.
   * @param {Object|null} next - Next watermark.
   * @return {boolean} True when next watermark is newer.
   * @private
   */
  isNodeReadyRetryWatermarkNewer(previous, next) {
    if (!previous) {
      return true;
    }
    if (!next) {
      return true;
    }

    if (next.readyLeaseExpiresAt > previous.readyLeaseExpiresAt) {
      return true;
    }
    if (next.readyLeaseExpiresAt < previous.readyLeaseExpiresAt) {
      return false;
    }

    if (next.heartbeatAt > previous.heartbeatAt) {
      return true;
    }
    if (next.heartbeatAt < previous.heartbeatAt) {
      return false;
    }

    return false;
  }

  /**
   * Check and record ready-trigger watermark for deduped retry scheduling.
   * @param {string} nodeId - Node ID.
   * @param {Object} nodeRow - Nodes row candidate.
   * @return {boolean} True when retry should run for this trigger.
   * @private
   */
  shouldRetryNodeReadyWatermark(nodeId, nodeRow) {
    const next = this.getNodeReadyRetryWatermark(nodeRow);
    const previous = this.nodeReadyRetryWatermarks.get(nodeId) || null;
    if (!this.isNodeReadyRetryWatermarkNewer(previous, next)) {
      return false;
    }
    this.nodeReadyRetryWatermarks.set(nodeId, next);
    return true;
  }

  /**
   * Build a comparable watermark from one NODE_STATE_UPDATE payload.
   * @param {Object} payload - Control-plane node-state payload.
   * @return {Object|null}
   * @private
   */
  getNodeStateUpdateWatermark(payload) {
    if (!payload || typeof payload !== TYPEOF.OBJECT) {
      return null;
    }

    const payloadNodeRow = payload[ControlPlaneField.NODE_ROW];
    const watermarkRow =
      payloadNodeRow && typeof payloadNodeRow === TYPEOF.OBJECT ?
        {...payloadNodeRow} :
        {};
    const heartbeatAt = Number(payload[ControlPlaneField.HEARTBEAT_AT]);
    const readyLeaseExpiresAt = Number(
      payload[ControlPlaneField.READY_LEASE_EXPIRES_AT],
    );
    if (Number.isFinite(heartbeatAt)) {
      watermarkRow[COLUMN.LAST_HEARTBEAT] = heartbeatAt;
    }
    if (Number.isFinite(readyLeaseExpiresAt)) {
      watermarkRow[COLUMN.READY_LEASE_EXPIRES_AT] = readyLeaseExpiresAt;
    }
    if (typeof payload[ControlPlaneField.STATE] === TYPEOF.STRING) {
      watermarkRow[COLUMN.CONNECTION_STATE] = payload[ControlPlaneField.STATE];
    }
    const watermark = getNodeHeartbeatWatermark(watermarkRow);
    if (!watermark) {
      return null;
    }
    if (
      watermark.lastHeartbeat === null &&
      watermark.readyLeaseExpiresAt === null &&
      watermark.connectionState === null
    ) {
      return null;
    }
    return watermark;
  }

  /**
   * Accept only forward node-state watermark progression.
   * @param {Object|null} previous - Previous watermark.
   * @param {Object|null} next - Candidate watermark.
   * @return {boolean}
   * @private
   */
  isNodeStateUpdateWatermarkNewer(previous, next) {
    if (!previous) {
      return true;
    }
    if (!next) {
      return true;
    }
    if (previous.lastHeartbeat === null && next.lastHeartbeat !== null) {
      return true;
    }
    if (previous.lastHeartbeat !== null && next.lastHeartbeat === null) {
      return false;
    }
    if (
      previous.readyLeaseExpiresAt === null &&
      next.readyLeaseExpiresAt !== null
    ) {
      return true;
    }
    if (
      previous.readyLeaseExpiresAt !== null &&
      next.readyLeaseExpiresAt === null
    ) {
      return false;
    }
    return (
      compareNodeHeartbeatWatermarks(previous, next) >
      REPLICA_DISPATCH_SERVICE_LITERAL.ZERO
    );
  }

  /**
   * Normalize operation-dispatch queue shard count to a safe positive integer.
   * One blocked operation reconcile must not head-of-line block unrelated
   * operation ids on the same node.
   *
   * @param {*} value - Candidate shard count.
   * @return {number}
   * @private
   */
  normalizeOperationDispatchQueueShardCount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return DISPATCH_DEFAULT.OPERATION_DISPATCH_QUEUE_SHARD_COUNT;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
  }

  /**
   * Normalize node-state queue shard count to a safe positive integer.
   * @param {*} value - Candidate shard count.
   * @return {number}
   * @private
   */
  normalizeNodeStateUpdateQueueShardCount(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return REPLICA_DISPATCH_SERVICE_LITERAL.FOUR;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
  }

  /**
   * Normalize one retry-after default for deferred node-state retries.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeNodeStateUpdateRetryAfterMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= NUM.ZERO) {
      return DISPATCH_DEFAULT.NODE_STATE_UPDATE_RETRY_AFTER_MS;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
  }

  /**
   * Normalize one retry-after default for deferred replica dispatch retries.
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeOperationDispatchRetryAfterMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= NUM.ZERO) {
      return DISPATCH_DEFAULT.OPERATION_DISPATCH_RETRY_AFTER_MS;
    }
    return Math.max(NUM.ONE, Math.floor(numeric));
  }

  /**
   * Keep dispatch readiness refresh bounded so one slow authoritative read
   * cannot head-of-line block the owner queue while sync recovery evidence is
   * already available locally.
   *
   * @param {*} value
   * @return {number}
   * @private
   */
  normalizeDispatchReadinessRefreshTimeoutMs(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(numeric));
    }
    return Math.max(
      this.operationDispatchRetryAfterMs,
      DISPATCH_DEFAULT.OPERATION_DISPATCH_READINESS_REFRESH_TIMEOUT_MS,
    );
  }

  /**
   * @param {*} errorLike
   * @return {number}
   * @private
   */
  resolveOperationDispatchRetryAfterMs(errorLike) {
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(retryAfterMs));
    }
    return this.operationDispatchRetryAfterMs;
  }

  /**
   * @param {string} nodeId
   * @param {number} timeoutMs
   * @return {Error}
   * @private
   */
  buildDispatchReadinessRefreshTimeoutError(nodeId, timeoutMs) {
    const error = new Error(
      'Message timeout while refreshing readiness for dispatch target ' +
        String(nodeId || 'unknown') +
        ' after ' +
        String(timeoutMs) +
        'ms',
    );
    error.code =
      REPLICA_DISPATCH_SERVICE_LITERAL.CONTROL_PLANE_READINESS_REFRESH_TIMEOUT;
    error.retryAfterMs = this.operationDispatchRetryAfterMs;
    error.deferRetry = true;
    error.targetNodeId = nodeId || null;
    return error;
  }

  /**
   * Bound one authoritative readiness refresh so dispatch progression can fall
   * back to the already-visible sync snapshot instead of stalling indefinitely.
   *
   * @param {string} nodeId
   * @param {string} decisionDimension
   * @return {Promise<Object|null>}
   * @private
   */
  async getBoundedDispatchReadiness(nodeId, decisionDimension) {
    if (
      typeof this.controlPlaneReadinessService.getNodeReadiness !==
      TYPEOF.FUNCTION
    ) {
      return null;
    }

    const timeoutMs = this.dispatchReadinessRefreshTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= NUM.ZERO) {
      return this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
        allowAuthoritativeRefresh: true,
        decisionDimension,
        maxCachedAgeMs: NUM.ZERO,
      });
    }

    let timeoutHandle = null;
    try {
      return await Promise.race([
        this.controlPlaneReadinessService.getNodeReadiness(nodeId, {
          allowAuthoritativeRefresh: true,
          decisionDimension,
          maxCachedAgeMs: NUM.ZERO,
        }),
        new Promise((_resolve, reject) => {
          timeoutHandle = this.setTimeoutFn(() => {
            reject(
              this.buildDispatchReadinessRefreshTimeoutError(nodeId, timeoutMs),
            );
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        this.clearTimeoutFn(timeoutHandle);
      }
    }
  }

  /**
   * Defer one retryable operation-dispatch failure onto the existing owner queue.
   * @param {string} operationId
   * @param {*} errorLike
   * @param {Object|null} [row=null]
   * @return {boolean}
   * @private
   */
  deferOperationDispatchRetry(operationId, errorLike, row = null) {
    if (!operationId || !isRetryableControlPlaneError(errorLike)) {
      return false;
    }
    const retryAfterMs = this.resolveOperationDispatchRetryAfterMs(errorLike);
    const desiredAttemptAt = Date.now() + retryAfterMs;
    const errorMessage = errorLike?.message || errorLike?.error || null;
    const existing = this.operationDispatchDeferredRetries.get(operationId);
    if (existing) {
      existing.errorMessage = errorMessage;
      if (row) {
        existing.row = this.cloneDeferredOperationDispatchRow(row);
      }
      if (desiredAttemptAt < existing.nextAttemptAt) {
        if (existing.timeoutHandle) {
          this.clearTimeoutFn(existing.timeoutHandle);
        }
        existing.nextAttemptAt = desiredAttemptAt;
        existing.timeoutHandle = this.armDeferredOperationDispatchRetry(
          operationId,
          retryAfterMs,
        );
      }
      return true;
    }

    const deferredRetry = {
      errorMessage,
      nextAttemptAt: desiredAttemptAt,
      row: row ? this.cloneDeferredOperationDispatchRow(row) : null,
      timeoutHandle: this.armDeferredOperationDispatchRetry(
        operationId,
        retryAfterMs,
      ),
    };
    this.operationDispatchDeferredRetries.set(operationId, deferredRetry);
    this.logger.info(DISPATCH_LOG_MSG.OPERATION_DISPATCH_DEFERRED, {
      nodeId: this.nodeId,
      operationId,
      retryAfterMs,
      error: errorMessage,
    });
    return true;
  }

  /**
   * @param {string} operationId
   * @param {number} delayMs
   * @return {*}
   * @private
   */
  armDeferredOperationDispatchRetry(operationId, delayMs) {
    return this.setTimeoutFn(() => {
      const deferredRetry =
        this.operationDispatchDeferredRetries.get(operationId);
      if (!deferredRetry) {
        return;
      }
      this.operationDispatchDeferredRetries.delete(operationId);
      const row = deferredRetry?.row ?
        this.cloneDeferredOperationDispatchRow(deferredRetry.row) :
        null;
      this.operationDispatchQueue.enqueue(
        operationId,
        RECONCILE_REASON.RETRYABLE_OPERATION_DISPATCH,
        row ? {row} : undefined,
      );
      this.logger.debug(DISPATCH_LOG_MSG.OPERATION_DISPATCH_DEFERRED_RETRY, {
        nodeId: this.nodeId,
        operationId,
        retryAfterMs: delayMs,
      });
    }, delayMs);
  }

  /**
   * Preserve one dispatchable replica_operations row across deferred retries so
   * direct wake-up payloads can survive until cache visibility converges.
   * @param {Object|null} row
   * @return {Object|null}
   * @private
   */
  cloneDeferredOperationDispatchRow(row) {
    if (!row || typeof row !== TYPEOF.OBJECT) {
      return null;
    }
    return {
      ...row,
    };
  }

  /**
   * @param {string} operationId
   * @return {void}
   * @private
   */
  clearDeferredOperationDispatchRetry(operationId) {
    const deferredRetry =
      this.operationDispatchDeferredRetries.get(operationId);
    if (!deferredRetry) {
      return;
    }
    if (deferredRetry.timeoutHandle) {
      this.clearTimeoutFn(deferredRetry.timeoutHandle);
    }
    this.operationDispatchDeferredRetries.delete(operationId);
  }

  /**
   * Build canonical write options for NODE_STATE_UPDATE persistence.
   * @param {string} nodeId
   * @param {string} nextState
   * @param {boolean} [isHeartbeatOnly=false]
   * @return {Object}
   * @private
   */
  resolveNodeStateUpdatePublicationMode(
    nextState,
    isHeartbeatOnly = false,
    payload = null,
  ) {
    return resolveControlPlaneNodeStatePublicationMode({
      publicationMode: payload?.[ControlPlaneField.NODE_STATE_PUBLICATION_MODE],
      heartbeatOnly: isHeartbeatOnly === true,
      state: nextState,
    });
  }

  buildDeferredNodeStateUpdatePayload(payload) {
    if (!payload || typeof payload !== TYPEOF.OBJECT) {
      return payload;
    }
    const isHeartbeatOnly = this.isHeartbeatOnlyNodeStateUpdate(payload);
    if (isHeartbeatOnly !== true) {
      return payload;
    }
    const nextPublicationMode =
      resolveReplayControlPlaneNodeStatePublicationMode({
        publicationMode:
          payload?.[ControlPlaneField.NODE_STATE_PUBLICATION_MODE],
        heartbeatOnly: isHeartbeatOnly,
        replayContext: CONTROL_PLANE_NODE_STATE_REPLAY_CONTEXT.DEFERRED_PENDING,
        state: payload?.[ControlPlaneField.STATE],
      });
    if (
      payload?.[ControlPlaneField.NODE_STATE_PUBLICATION_MODE] ===
      nextPublicationMode
    ) {
      return payload;
    }
    return {
      ...payload,
      [ControlPlaneField.NODE_STATE_PUBLICATION_MODE]: nextPublicationMode,
    };
  }

  buildNodeStateUpdateWriteOptions(
    nodeId,
    nextState,
    isHeartbeatOnly = false,
    payload = null,
  ) {
    const publicationMode = this.resolveNodeStateUpdatePublicationMode(
      nextState,
      isHeartbeatOnly,
      payload,
    );
    const publicationProfile = getControlPlaneNodeStatePublicationProfile({
      publicationMode,
    });
    return {
      allowCoalescing: true,
      allowPressureDefer: publicationProfile.allowPressureDefer,
      coalescingKey: `node-state:${nodeId}`,
      deliveryPriority: publicationProfile.deliveryPriority,
      pressureRetryAfterMs: this.nodeStateUpdateRetryAfterMs,
      queryTimeoutMs: this.nodeStateUpdateQueryTimeoutMs,
      skipCacheWait: true,
      workloadClass: publicationProfile.workloadClass,
      workClass: publicationProfile.workClass,
    };
  }

  resolveMembershipPublicationService() {
    const readinessService = this.controlPlaneReadinessService;
    if (!readinessService || typeof readinessService !== TYPEOF.OBJECT) {
      return null;
    }
    const membershipPublicationService =
      readinessService.membershipPublicationService;
    return membershipPublicationService &&
      typeof membershipPublicationService === TYPEOF.OBJECT ?
      membershipPublicationService :
      null;
  }

  normalizeMembershipPublicationStatus(status) {
    return typeof status === TYPEOF.STRING ? status.toUpperCase() : null;
  }

  buildReadyNodePublicationAdvancementOptions(publicationRow) {
    if (!publicationRow || typeof publicationRow !== TYPEOF.OBJECT) {
      return READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS;
    }
    return Object.freeze({
      [READY_NODE_PUBLICATION_ADVANCEMENT_OPTION.PUBLICATION_ROWS]:
        Object.freeze([publicationRow]),
    });
  }

  resolveReadyNodePublicationAdvancement(
    nodeId,
    options = READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS,
  ) {
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (
      !membershipPublicationService ||
      typeof membershipPublicationService.getLatestPublicationRowSync !==
        TYPEOF.FUNCTION ||
      typeof membershipPublicationService.getLatestPublicationForNodeSync !==
        TYPEOF.FUNCTION
    ) {
      return Object.freeze({
        latestPublicationStatus: null,
        nodePublicationStatus: null,
        needsAcknowledgement: false,
        needsReconcile: false,
      });
    }
    const latestPublicationRow =
      membershipPublicationService.getLatestPublicationRowSync(options);
    const latestPublicationForNode =
      membershipPublicationService.getLatestPublicationForNodeSync(
        nodeId,
        options,
      );
    const latestPublicationStatus = this.normalizeMembershipPublicationStatus(
      latestPublicationRow?.status,
    );
    const nodePublicationStatus = this.normalizeMembershipPublicationStatus(
      latestPublicationForNode?.status,
    );
    const nodeIncluded = Boolean(latestPublicationForNode);
    const advancementState = resolveReadyNodePublicationAdvancementState({
      latestPublicationStatus,
      nodeIncluded,
    });
    const needsAcknowledgement =
      advancementState ===
        READY_NODE_PUBLICATION_ADVANCEMENT_STATE.IN_FLIGHT_NODE_VISIBLE ||
      advancementState ===
        READY_NODE_PUBLICATION_ADVANCEMENT_STATE.IN_FLIGHT_NODE_UNRESOLVED ||
      (
        advancementState ===
          READY_NODE_PUBLICATION_ADVANCEMENT_STATE.PUBLISHED_NODE_MISSING &&
        latestPublicationStatus === MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED
      );
    const needsReconcile =
      advancementState !==
        READY_NODE_PUBLICATION_ADVANCEMENT_STATE.PUBLISHED_NODE_VISIBLE ||
      nodePublicationStatus !== MEMBERSHIP_PUBLICATION_STATUS.PUBLISHED;
    return Object.freeze({
      latestPublicationStatus,
      nodePublicationStatus,
      advancementState,
      needsAcknowledgement,
      needsReconcile,
    });
  }

  async maybeAdvanceReadyNodeMembershipPublication(
    nodeId,
    nodeRow,
    reason = RECONCILE_REASON.NODE_STATE_UPDATE_READY,
    options = READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS,
  ) {
    const publicationAdvancement =
      this.resolveReadyNodePublicationAdvancement(nodeId, options);
    if (publicationAdvancement.needsReconcile !== true) {
      return false;
    }
    this.enqueueMembershipPublicationReconcile(reason, {
      nodeId,
      state: STATE.READY,
      nodeRow,
    });
    if (publicationAdvancement.needsAcknowledgement === true) {
      await this.acknowledgeMembershipPublicationForNode(nodeId, options);
    }
    return true;
  }

  scheduleReadyNodeMembershipPublicationAdvance(
    nodeId,
    nodeRow,
    reason = RECONCILE_REASON.NODE_STATE_UPDATE_READY,
    options = READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS,
  ) {
    Promise.resolve()
      .then(() =>
        this.maybeAdvanceReadyNodeMembershipPublication(
          nodeId,
          nodeRow,
          reason,
          options,
        ),
      )
      .catch((error) => {
        this.logger.warn(DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_ACK_FAILED, {
          nodeId,
          error: error?.message || String(error),
        });
      });
  }

  scheduleLocalReadyNodeMembershipPublicationAdvance(
    reason = RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_CACHE_UPDATE,
    publicationRow = READY_NODE_PUBLICATION_ADVANCEMENT_NODE_ROW_UNAVAILABLE,
  ) {
    const nodeId = this.nodeId;
    if (!nodeId || !this.isNodeReady(nodeId)) {
      return false;
    }
    this.scheduleReadyNodeMembershipPublicationAdvance(
      nodeId,
      READY_NODE_PUBLICATION_ADVANCEMENT_NODE_ROW_UNAVAILABLE,
      reason,
      this.buildReadyNodePublicationAdvancementOptions(publicationRow),
    );
    return true;
  }

  resolveMembershipPublicationAckRetryAfterMs(error) {
    const retryAfterMs = getControlPlaneRetryAfterMs(error);
    if (Number.isFinite(retryAfterMs) && retryAfterMs > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(retryAfterMs));
    }
    return this.nodeStateUpdateRetryAfterMs;
  }

  armDeferredMembershipPublicationAckRetry(nodeId, retryAfterMs) {
    return this.setTimeoutFn(() => {
      this.membershipPublicationAckDeferredRetries.delete(nodeId);
      if (!this.isNodeReady(nodeId)) {
        return;
      }
      this.scheduleReadyNodeMembershipPublicationAdvance(
        nodeId,
        READY_NODE_PUBLICATION_ADVANCEMENT_NODE_ROW_UNAVAILABLE,
        RECONCILE_REASON.CONTROL_PLANE_PUBLICATION_ACK_RETRY,
      );
    }, retryAfterMs);
  }

  deferMembershipPublicationAckRetry(nodeId, error) {
    if (!nodeId || !isRetryableControlPlaneError(error)) {
      return false;
    }
    const retryAfterMs =
      this.resolveMembershipPublicationAckRetryAfterMs(error);
    const desiredAttemptAt = Date.now() + retryAfterMs;
    const existing =
      this.membershipPublicationAckDeferredRetries.get(nodeId);
    if (existing) {
      existing.error = getControlPlaneErrorMessage(error);
      if (desiredAttemptAt < existing.nextAttemptAt) {
        if (existing.timeoutHandle) {
          this.clearTimeoutFn(existing.timeoutHandle);
        }
        existing.nextAttemptAt = desiredAttemptAt;
        existing.timeoutHandle = this.armDeferredMembershipPublicationAckRetry(
          nodeId,
          retryAfterMs,
        );
      }
      return true;
    }

    this.membershipPublicationAckDeferredRetries.set(nodeId, {
      error: getControlPlaneErrorMessage(error),
      nextAttemptAt: desiredAttemptAt,
      timeoutHandle: this.armDeferredMembershipPublicationAckRetry(
        nodeId,
        retryAfterMs,
      ),
    });
    this.logger.info(DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_ACK_DEFERRED, {
      nodeId,
      retryAfterMs,
      error: getControlPlaneErrorMessage(error),
    });
    return true;
  }

  /**
   * READY node-state updates must re-enter the canonical publication owner
   * queue so cluster publication convergence advances through the durable
   * control-plane writer rather than only via later read-time repair.
   *
   * @param {string} reason
   * @param {Object} [context={}]
   * @return {boolean}
   * @private
   */
  enqueueMembershipPublicationReconcile(reason, context = {}) {
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (
      !membershipPublicationService ||
      typeof membershipPublicationService.enqueueClusterMembershipReconcile !==
        TYPEOF.FUNCTION
    ) {
      return false;
    }
    membershipPublicationService.enqueueClusterMembershipReconcile(
      reason,
      context,
    );
    return true;
  }

  async acknowledgeMembershipPublicationForNode(
    nodeId,
    options = READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS,
  ) {
    const membershipPublicationService =
      this.resolveMembershipPublicationService();
    if (
      !membershipPublicationService ||
      typeof membershipPublicationService.acknowledgeMembershipPublicationForNode !==
        TYPEOF.FUNCTION
    ) {
      return null;
    }

    try {
      if (options === READY_NODE_PUBLICATION_ADVANCEMENT_EMPTY_OPTIONS) {
        return await membershipPublicationService.acknowledgeMembershipPublicationForNode(
          nodeId,
        );
      }
      return await membershipPublicationService.acknowledgeMembershipPublicationForNode(
        nodeId,
        options,
      );
    } catch (error) {
      this.logger.warn(DISPATCH_LOG_MSG.MEMBERSHIP_PUBLICATION_ACK_FAILED, {
        nodeId,
        error: error?.message || String(error),
      });
      this.deferMembershipPublicationAckRetry(nodeId, error);
      return null;
    }
  }

  /**
   * Determine whether one node-state write failure should be retried through
   * the owner queue instead of surfacing as a terminal reconcile error.
   * @param {Error} error
   * @return {boolean}
   * @private
   */
  shouldDeferNodeStateUpdateRetry(error, payload = null) {
    if (!error) {
      return false;
    }
    const nextState = payload?.[ControlPlaneField.STATE];
    const isHeartbeatOnly = this.isHeartbeatOnlyNodeStateUpdate(payload);
    const publicationMode = this.resolveNodeStateUpdatePublicationMode(
      nextState,
      isHeartbeatOnly,
      payload,
    );
    const publicationProfile = getControlPlaneNodeStatePublicationProfile({
      publicationMode,
    });
    const retryClass = this.resolveNodeStateUpdateRetryClass(error);
    if (
      retryClass === NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE &&
      publicationProfile?.allowPressureDefer !== true
    ) {
      return false;
    }
    if (error?.deferRetry === true) {
      return true;
    }
    if (error?.code === REPLICA_DISPATCH_SERVICE_LITERAL.NODE_ROW_MISSING) {
      return true;
    }
    if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > NUM.ZERO) {
      return true;
    }
    if (isRetryableControlPlaneError(error)) {
      return true;
    }
    const message = error?.message || String(error);
    if (
      typeof this.cdcIntegrationService?.isTransientCdcError ===
        TYPEOF.FUNCTION &&
      this.cdcIntegrationService.isTransientCdcError(message)
    ) {
      return true;
    }
    return (
      (message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CONNECTION_TO_NODE) &&
        message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.CLOSED)) ||
      message.includes(
        REPLICA_DISPATCH_SERVICE_LITERAL.NO_CONNECTION_TO_NODE,
      ) ||
      message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.QUERY_ROUTING_FAILED) ||
      message.includes(
        REPLICA_DISPATCH_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER,
      ) ||
      message.includes(REPLICA_DISPATCH_SERVICE_LITERAL.MESSAGE_TIMEOUT)
    );
  }

  /**
   * Resolve one retry delay for deferred node-state writes.
   * @param {Error} error
   * @return {number}
   * @private
   */
  resolveNodeStateUpdateRetryAfterMs(error) {
    if (Number.isFinite(error?.retryAfterMs) && error.retryAfterMs > NUM.ZERO) {
      return Math.max(NUM.ONE, Math.floor(error.retryAfterMs));
    }
    return this.nodeStateUpdateRetryAfterMs;
  }

  resolveNodeStateUpdateRetryClass(error) {
    const errorCode = getControlPlaneErrorCode(error);
    const errorMessage = getControlPlaneErrorMessage(error);
    if (
      errorCode === QUERY_ERROR_CODE.DISTRIBUTED_PARTICIPANT_FAILURE ||
      errorMessage.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE) ||
      errorMessage.includes(QUERY_ERROR_MSG.QUERY_ROUTING_FAILED) ||
      errorMessage.includes(QUERY_ERROR_MSG.NO_ACTIVE_SERVICE_FOR_PARTITION) ||
      errorMessage.includes(
        REPLICA_DISPATCH_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER,
      )
    ) {
      return NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE;
    }
    return NODE_STATE_UPDATE_RETRY_CLASS.TRANSIENT;
  }

  resolveNodeStateUpdateRetryFailureCount(nodeId, retryClass) {
    const existingState = this.nodeStateUpdateRetryStateByNodeId.get(nodeId);
    if (!existingState || existingState.retryClass !== retryClass) {
      return NUM.ONE;
    }
    const currentFailureCount = Number(existingState.failureCount);
    if (
      !Number.isFinite(currentFailureCount) ||
      currentFailureCount < NUM.ONE
    ) {
      return NUM.ONE;
    }
    return currentFailureCount + NUM.ONE;
  }

  resolveNodeStateUpdateRetryDelayBounds(retryClass, baseRetryAfterMs) {
    if (retryClass === NODE_STATE_UPDATE_RETRY_CLASS.PUBLICATION_PRESSURE) {
      return Object.freeze({
        baseRetryAfterMs: Math.max(
          baseRetryAfterMs,
          this.nodeStateUpdateRetryAfterMs *
            NODE_STATE_UPDATE_RETRY_POLICY.PUBLICATION_PRESSURE_MIN_DELAY_MULTIPLIER,
        ),
        maxRetryAfterMs: Math.max(
          baseRetryAfterMs,
          this.nodeStateUpdateRetryAfterMs *
            NODE_STATE_UPDATE_RETRY_POLICY.PUBLICATION_PRESSURE_MAX_DELAY_MULTIPLIER,
        ),
      });
    }
    return Object.freeze({
      baseRetryAfterMs,
      maxRetryAfterMs: Math.max(
        baseRetryAfterMs,
        baseRetryAfterMs *
          NODE_STATE_UPDATE_RETRY_POLICY.TRANSIENT_MAX_DELAY_MULTIPLIER,
      ),
    });
  }

  computeNodeStateUpdateRetryDelayMs(
    baseRetryAfterMs,
    failureCount,
    maxRetryAfterMs,
  ) {
    let retryAfterMs = baseRetryAfterMs;
    let remainingBackoffSteps = Math.max(NUM.ZERO, failureCount - NUM.ONE);
    while (remainingBackoffSteps > NUM.ZERO && retryAfterMs < maxRetryAfterMs) {
      retryAfterMs = Math.min(
        maxRetryAfterMs,
        retryAfterMs * NODE_STATE_UPDATE_RETRY_POLICY.BACKOFF_MULTIPLIER,
      );
      remainingBackoffSteps -= NUM.ONE;
    }
    return retryAfterMs;
  }

  buildNodeStateUpdateRetryDecision(nodeId, error) {
    const baseRetryAfterMs = this.resolveNodeStateUpdateRetryAfterMs(error);
    const retryClass = this.resolveNodeStateUpdateRetryClass(error);
    const failureCount = this.resolveNodeStateUpdateRetryFailureCount(
      nodeId,
      retryClass,
    );
    const retryDelayBounds = this.resolveNodeStateUpdateRetryDelayBounds(
      retryClass,
      baseRetryAfterMs,
    );
    return Object.freeze({
      action: NODE_STATE_UPDATE_RETRY_ACTION.SCHEDULE_DEFERRED,
      retryClass,
      failureCount,
      retryAfterMs: this.computeNodeStateUpdateRetryDelayMs(
        retryDelayBounds.baseRetryAfterMs,
        failureCount,
        retryDelayBounds.maxRetryAfterMs,
      ),
    });
  }

  recordDeferredNodeStateUpdateRetryState(nodeId, retryDecision, error) {
    if (!nodeId || !retryDecision) {
      return;
    }
    this.nodeStateUpdateRetryStateByNodeId.set(
      nodeId,
      Object.freeze({
        retryClass: retryDecision.retryClass,
        failureCount: retryDecision.failureCount,
        retryAfterMs: retryDecision.retryAfterMs,
        errorMessage:
          getControlPlaneErrorMessage(error) ||
          REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING,
      }),
    );
  }

  clearNodeStateUpdateRetryState(nodeId) {
    this.nodeStateUpdateRetryStateByNodeId.delete(nodeId);
  }

  /**
   * Store the latest node-state payload and arm one deferred retry timer.
   * @param {string} nodeId
   * @param {Object} payload
   * @param {Error} error
   * @return {number}
   * @private
   */
  deferNodeStateUpdateRetry(nodeId, payload, error) {
    if (!nodeId || !payload) {
      return this.nodeStateUpdateRetryAfterMs;
    }

    const deferredPayload = this.buildDeferredNodeStateUpdatePayload(payload);
    const retryDecision = this.buildNodeStateUpdateRetryDecision(nodeId, error);
    const retryAfterMs = retryDecision.retryAfterMs;
    const desiredAttemptAt = Date.now() + retryAfterMs;
    this.recordDeferredNodeStateUpdateRetryState(nodeId, retryDecision, error);
    const existing = this.nodeStateUpdateDeferredRetries.get(nodeId);
    if (existing) {
      existing.payload = deferredPayload;
      existing.errorMessage =
        getControlPlaneErrorMessage(error) ||
        REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING;
      existing.retryClass = retryDecision.retryClass;
      existing.failureCount = retryDecision.failureCount;
      if (existing.timeoutHandle) {
        this.clearTimeoutFn(existing.timeoutHandle);
      }
      existing.nextAttemptAt = desiredAttemptAt;
      existing.timeoutHandle = this.armDeferredNodeStateUpdateRetry(
        nodeId,
        retryAfterMs,
      );
      return retryAfterMs;
    }

    const deferredRetry = {
      payload: deferredPayload,
      nextAttemptAt: desiredAttemptAt,
      errorMessage:
        getControlPlaneErrorMessage(error) ||
        REPLICA_DISPATCH_SERVICE_LITERAL.EMPTY_STRING,
      retryClass: retryDecision.retryClass,
      failureCount: retryDecision.failureCount,
      timeoutHandle: null,
    };
    deferredRetry.timeoutHandle = this.armDeferredNodeStateUpdateRetry(
      nodeId,
      retryAfterMs,
    );
    this.nodeStateUpdateDeferredRetries.set(nodeId, deferredRetry);
    return retryAfterMs;
  }

  /**
   * Arm the deferred retry timer for one node-state update owner key.
   * @param {string} nodeId
   * @param {number} delayMs
   * @return {*}
   * @private
   */
  armDeferredNodeStateUpdateRetry(nodeId, delayMs) {
    return this.setTimeoutFn(() => {
      const deferredRetry = this.nodeStateUpdateDeferredRetries.get(nodeId);
      if (!deferredRetry) {
        return;
      }
      this.nodeStateUpdateDeferredRetries.delete(nodeId);
      this.resolveNodeStateUpdateQueue(nodeId).enqueue(
        nodeId,
        RECONCILE_REASON.NODE_STATE_UPDATE_MESSAGE,
        {payload: deferredRetry.payload},
      );
      this.logger.debug(DISPATCH_LOG_MSG.NODE_STATE_UPDATE_DEFERRED_RETRY, {
        nodeId,
        retryAfterMs: delayMs,
      });
    }, delayMs);
  }

  /**
   * Replace the deferred retry payload for one node without scheduling another
   * immediate write attempt.
   * @param {string} nodeId
   * @param {Object} payload
   * @return {boolean}
   * @private
   */
}

export {ReplicaDispatchServiceSegment3};
