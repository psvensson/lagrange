import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {isVoterRaftRole} from '../raft/replica-voter-readiness.js';

const {
  CONTROL_PLANE_PARTITION_IDS,
  CONTROL_PLANE_READINESS_DIMENSION,
  COLUMN,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_STATUS,
  PARTITION_SERVICE_VALUE,
  PRESSURE_WORK_CLASS,
  SYSTEM_TABLE_NAME,
  TABLES,
  isSystemTableWriteReady,
  normalizePublishedRaftRole,
} = PARTITION_SERVICE_SHARED;

class PartitionServiceMetadataDeliveryMethods {
  /**
   * Queue a raft role update for persistence.
   * @param {string} role - New raft role.
   * @private
   */
  queueRoleUpdate(role) {
    this.roleMutationHelper.queue(
      normalizePublishedRaftRole(role, {collapseLeaderToFollower: true}),
    );
  }
  /**
   * Queue a partition leader update for persistence.
   * @param {string} leaderNodeId - Leader node ID.
   * @private
   */
  queueLeaderNodeUpdate(leaderNodeId, raftTerm) {
    this.seedLocalCanonicalLeaderNodeId(leaderNodeId, raftTerm);
    this.leaderNodeMutationHelper.queue(leaderNodeId);
  }
  /**
   * Make an actually-won local election visible without waiting for the
   * recovering control plane to carry its own leader publication.  This is the
   * PARTITIONS-row sibling of CL-035's voter-role seed: it mutates only an
   * existing row, keeps the row's other identity fields, and is superseded by
   * the same owner's durable CDC publication.
   *
   * The projection preserves the durable row's causal version. Minting a local
   * `updated_at` or HLC would let an unpropagated observation fence a legitimate
   * successor CDC row under clock skew. This is a sanctioned owner-local cache
   * write, not a second leadership authority: the Raft transition invokes it
   * only after setting `isLeader`, and every safety consumer continues to read
   * the canonical row projection.
   * @param {string} leaderNodeId
   * @return {boolean} Whether local canonical evidence was applied.
   */
  seedLocalCanonicalLeaderNodeId(leaderNodeId, raftTerm) {
    if (
      this.isLeader !== true ||
      typeof leaderNodeId !== 'string' ||
      leaderNodeId.length === 0 ||
      leaderNodeId !== this.nodeId ||
      !this.systemTableCache ||
      typeof this.systemTableCache.get !== PARTITION_SERVICE_LITERAL.FUNCTION
    ) {
      return false;
    }
    const existingRow = this.systemTableCache.get(
      TABLES.PARTITIONS,
      this.partitionId,
    );
    if (!existingRow) {
      return false;
    }
    if (this.localCanonicalLeaderObservation?.demoted === true) {
      this.localCanonicalLeaderObservation = null;
    }
    if (this.localCanonicalLeaderObservation?.superseded === true) {
      return false;
    }
    if (!this.localCanonicalLeaderObservation) {
      this.localCanonicalLeaderObservation = {
        baseRow: {
          [COLUMN.PARTITION_ID]: this.partitionId,
          [COLUMN.CREATED_AT]: existingRow[COLUMN.CREATED_AT],
          [COLUMN.UPDATED_AT]: existingRow[COLUMN.UPDATED_AT],
          [COLUMN.UPDATED_AT_HLC]: existingRow[COLUMN.UPDATED_AT_HLC],
        },
        demoted: false,
        superseded: false,
      };
    }
    // The tenure identity of this claim: safety consumers bind their local
    // leadership preference to it (quest local-leadership-tenure-bound-
    // safety-evidence) rather than to row content a CDC replay can fake.
    // Explicit null/undefined rejection: Number(null) is a finite 0.
    if (
      raftTerm !== null &&
      raftTerm !== undefined &&
      Number.isFinite(Number(raftTerm))
    ) {
      this.localCanonicalLeaderObservation.raftTerm = Number(raftTerm);
    }

    return this.applyLocalCanonicalLeaderObservation(
      existingRow,
      leaderNodeId,
      'elected',
    );
  }
  /**
   * Remove this node's local-only ownership evidence after Raft demotion, but
   * only while the row still names this node.  A newer successor observation
   * therefore cannot be cleared by a late follower/candidate event.
   * @return {boolean} Whether the owned local observation was cleared.
   */
  clearLocalCanonicalLeaderNodeIdIfOwned() {
    const previousObservation = this.localCanonicalLeaderObservation;
    if (
      this.isLeader === true ||
      !this.systemTableCache ||
      typeof this.systemTableCache.get !== PARTITION_SERVICE_LITERAL.FUNCTION
    ) {
      return false;
    }
    const existingRow = this.systemTableCache.get(
      TABLES.PARTITIONS,
      this.partitionId,
    );
    this.localCanonicalLeaderObservation = {
      baseRow: previousObservation?.baseRow || {
        [COLUMN.PARTITION_ID]: this.partitionId,
        [COLUMN.CREATED_AT]: existingRow?.[COLUMN.CREATED_AT],
        [COLUMN.UPDATED_AT]: existingRow?.[COLUMN.UPDATED_AT],
        [COLUMN.UPDATED_AT_HLC]: existingRow?.[COLUMN.UPDATED_AT_HLC],
      },
      demoted: true,
      superseded: previousObservation?.superseded === true,
    };
    if (
      existingRow?.[COLUMN.LEADER_NODE_ID] !== this.nodeId
    ) {
      // The row already names a successor, so the full demotion projection
      // must not touch it — but residual tenure-claim annotations from this
      // node's ended tenure still need stripping (verifier hygiene finding).
      if (existingRow?.[COLUMN.LEADER_CLAIM_NODE_ID] === this.nodeId) {
        this.applyLocalLeaderClaimAnnotationClear(
          existingRow,
          'demoted-residual-claim',
        );
      }
      return false;
    }
    return this.applyLocalCanonicalLeaderObservation(
      existingRow,
      null,
      'demoted',
    );
  }
  /**
   * A claim must not outlive its replica: teardown without a demotion event
   * (the REPLACE source-removal shutdown path) would otherwise leave the
   * tenure annotations on the cached row for an equal-version replay to
   * resurrect. Unlike the demotion clear this ignores isLeader — we are
   * dying, so our claim dies with us — and it nulls ONLY the claim fields,
   * leaving leader_node_id to the durable successor flow.
   * @return {boolean} Whether a lingering claim was cleared.
   */
  clearLocalCanonicalLeaderClaimOnTeardown() {
    const observation = this.localCanonicalLeaderObservation;
    this.localCanonicalLeaderObservation = null;
    const existingRow = this.systemTableCache?.get?.(
      TABLES.PARTITIONS,
      this.partitionId,
    );
    if (
      !existingRow ||
      (existingRow[COLUMN.LEADER_CLAIM_NODE_ID] !== this.nodeId &&
        !observation)
    ) {
      return false;
    }
    return this.applyLocalLeaderClaimAnnotationClear(existingRow, 'teardown');
  }
  /**
   * Null ONLY the local tenure-claim annotations on the cached row, leaving
   * leader_node_id and the observation state untouched. Shared by the
   * teardown clear and the demotion path's already-named-successor branch
   * (which must keep its demoted observation for the replay handler while
   * still stripping residual annotations).
   * @param {Object} existingRow
   * @param {string} transition
   * @return {boolean}
   * @private
   */
  applyLocalLeaderClaimAnnotationClear(existingRow, transition) {
    const claimClearProjection = {
      [COLUMN.PARTITION_ID]: this.partitionId,
      [COLUMN.LEADER_CLAIM_NODE_ID]: null,
      [COLUMN.LEADER_CLAIM_RAFT_TERM]: null,
      [COLUMN.LEADER_CLAIM_MINTED_AGAINST_UPDATED_AT]: null,
    };
    return this.applyLocalCanonicalLeaderProjection(
      existingRow,
      claimClearProjection,
      transition,
    );
  }
  /**
   * Apply one version-preserving owner-local leader projection. Keeping the
   * direct cache write in one method lets election, demotion, teardown, and
   * supersession share the same sanctioned owner boundary.
   * @param {Object} existingRow
   * @param {Object} localProjection
   * @param {string} transition
   * @return {boolean}
   * @private
   */
  applyLocalCanonicalLeaderProjection(
    existingRow,
    localProjection,
    transition,
  ) {
    if (
      !existingRow ||
      typeof this.systemTableCache?.applySystemTableChange !==
        PARTITION_SERVICE_LITERAL.FUNCTION
    ) {
      return false;
    }
    const versionedProjection = {...localProjection};
    if (typeof existingRow[COLUMN.UPDATED_AT] !== 'undefined') {
      versionedProjection[COLUMN.UPDATED_AT] =
        existingRow[COLUMN.UPDATED_AT];
    }
    if (typeof existingRow[COLUMN.UPDATED_AT_HLC] !== 'undefined') {
      versionedProjection[COLUMN.UPDATED_AT_HLC] =
        existingRow[COLUMN.UPDATED_AT_HLC];
    }
    this.systemTableCache.applySystemTableChange(
      TABLES.PARTITIONS,
      PARTITION_SERVICE_LITERAL.UPDATE,
      versionedProjection,
      {
        causeId:
          `local-raft-leader:${transition}:${this.partitionId}:${this.nodeId}`,
      },
    );
    return true;
  }
  /**
   * Reconcile an authoritative cache delivery with the active local projection.
   * Equal/older replays of the pre-election row may temporarily overwrite an
   * equal-version local projection, so the same publication owner re-projects
   * current Raft truth. A strictly newer row is successor evidence: it wins and
   * disables further local seeds until Raft demotion closes this tenure.
   *
   * The comparison delegates to SystemTableCache's canonical LWW rule rather
   * than rebuilding timestamp/HLC semantics in this owner.
   * @param {Object} record
   * @return {boolean} Whether local evidence was re-projected.
   */
  handleCanonicalLeaderRowCacheChange(record) {
    const observation = this.localCanonicalLeaderObservation;
    if (
      !observation ||
      record?.[COLUMN.PARTITION_ID] !== this.partitionId
    ) {
      return false;
    }
    if (this.isLeader !== true) {
      if (
        observation.demoted === true &&
        record?.[COLUMN.LEADER_NODE_ID] === this.nodeId
      ) {
        return this.applyLocalCanonicalLeaderObservation(
          record,
          null,
          'demoted-replay',
        );
      }
      return false;
    }
    if (
      observation.demoted === true ||
      observation.superseded === true ||
      record?.[COLUMN.LEADER_NODE_ID] === this.nodeId
    ) {
      return false;
    }
    const cache = this.systemTableCache;
    const successorIsStrictlyNewer =
      typeof cache?.isStaleForExistingRecord ===
        PARTITION_SERVICE_LITERAL.FUNCTION &&
      cache.isStaleForExistingRecord(
        TABLES.PARTITIONS,
        record,
        observation.baseRow,
      );
    if (successorIsStrictlyNewer) {
      observation.superseded = true;
      this.applyLocalLeaderClaimAnnotationClear(record, 'superseded');
      return false;
    }
    return this.applyLocalCanonicalLeaderObservation(
      record,
      this.nodeId,
      'replayed',
    );
  }
  /**
   * Apply one node-local canonical leader projection without changing the
   * durable row's LWW version. This helper keeps the sanctioned direct-cache-
   * write surface to one owner call site. A later durable successor can
   * therefore supersede the projection using the normal cache merge rule.
   * @param {Object} existingRow
   * @param {string|null} leaderNodeId
   * @param {string} transition
   * @return {boolean}
   * @private
   */
  applyLocalCanonicalLeaderObservation(
    existingRow,
    leaderNodeId,
    transition,
  ) {
    const localProjection = {
      [COLUMN.PARTITION_ID]: this.partitionId,
      [COLUMN.LEADER_NODE_ID]: leaderNodeId,
    };
    // Tenure claim annotations ride every projection explicitly: the UPDATE
    // merge preserves absent fields, so a demotion/supersession projection
    // must null them or a stale claim would outlive its tenure. A live claim
    // is stamped only when this projection asserts THIS node's leadership
    // and the observation carries the term the election was won at.
    const observationTerm = this.localCanonicalLeaderObservation?.raftTerm;
    const claimActive =
      leaderNodeId === this.nodeId &&
      Number.isFinite(observationTerm);
    localProjection[COLUMN.LEADER_CLAIM_NODE_ID] =
      claimActive ? this.nodeId : null;
    localProjection[COLUMN.LEADER_CLAIM_RAFT_TERM] =
      claimActive ? observationTerm : null;
    localProjection[COLUMN.LEADER_CLAIM_MINTED_AGAINST_UPDATED_AT] =
      claimActive ?
        this.localCanonicalLeaderObservation?.baseRow?.[COLUMN.UPDATED_AT] ??
          null :
        null;
    if (!this.applyLocalCanonicalLeaderProjection(
      existingRow,
      localProjection,
      transition,
    )) {
      return false;
    }
    return this.systemTableCache.get(
      TABLES.PARTITIONS,
      this.partitionId,
    )?.[COLUMN.LEADER_NODE_ID] === leaderNodeId;
  }
  /**
   * Level-trigger the durable half from current Raft ownership.  Unlike the
   * election edge, this can be called again after activation/readiness changes;
   * the mutation helper performs authoritative dedup when storage already
   * agrees.
   * @return {boolean} Whether a durable reassert was queued.
   */
  reassertDurableLeaderNodeId() {
    if (this.isLeader !== true) {
      return false;
    }
    this.leaderNodeMutationHelper.queue(this.nodeId);
    return true;
  }
  /**
   * Persist the latest pending raft role update.
   * @return {Promise<void>}
   * @private
   */
  async flushRoleUpdate() {
    return this.roleMutationHelper.flush();
  }
  /**
   * Level-triggered durable re-assert of this replica's CURRENT raft role.
   * Called by the replica handler's voter-ready seam right after the CL-035
   * local cache seed: the seed makes the promotion locally visible while the
   * durable write can still be lost (run-27: a dropped/dedup-masked write
   * left the whole cluster reading a raft LEADER as a learner forever). The
   * owner (this service) re-queues from its own state; the helper's
   * authoritative dedup makes the re-queue a no-op when the durable row
   * already converged.
   * @return {boolean} Whether a re-assert was queued.
   */
  reassertDurableRaftRole() {
    if (!isVoterRaftRole(this.role)) {
      return false;
    }
    this.queueRoleUpdate(this.role);
    return true;
  }
  /**
   * Persist the latest pending partition leader update.
   * @return {Promise<void>}
   * @private
   */
  async flushLeaderNodeUpdate() {
    return this.leaderNodeMutationHelper.flush();
  }
  /**
   * Check if the partitions partition leader is available for writes.
   * @return {boolean} True if a leader with an address is known.
   * @private
   */
  isPartitionsLeaderAvailable() {
    if (
      isSystemTableWriteReady(
        this.systemTableCache,
        SYSTEM_TABLE_NAME.PARTITIONS,
      )
    ) {
      return true;
    }
    return (
      this.cdcIntegrationService?.canWriteSystemTableLocally?.(
        SYSTEM_TABLE_NAME.PARTITIONS,
      ) === true
    );
  }
  /**
   * Check if the services table is writable through either cache-visible
   * routing metadata or the local services-p1 leader owner.
   * @return {boolean} True if writes can be issued safely.
   * @private
   */
  isServicesLeaderAvailable() {
    if (
      isSystemTableWriteReady(this.systemTableCache, SYSTEM_TABLE_NAME.SERVICES)
    ) {
      return true;
    }
    return (
      this.cdcIntegrationService?.canWriteSystemTableLocally?.(
        SYSTEM_TABLE_NAME.SERVICES,
      ) === true
    );
  }
  getMetadataPublicationDeliveryPriority() {
    return CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) ?
      PARTITION_SERVICE_LITERAL.CRITICAL :
      PARTITION_SERVICE_LITERAL.BACKGROUND;
  }
  getMetadataPublicationWorkClass() {
    return CONTROL_PLANE_PARTITION_IDS.has(this.partitionId) ?
      PRESSURE_WORK_CLASS.CRITICAL :
      PRESSURE_WORK_CLASS.BACKGROUND;
  }
  shouldMetadataPublicationAllowPressureDefer() {
    return (
      this.getMetadataPublicationWorkClass() !== PRESSURE_WORK_CLASS.CRITICAL
    );
  }
  getMetadataPublicationReadinessDimension() {
    return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
  }
  /**
   * Trigger an immediate rebalance check.
   * Called when a significant cluster event occurs (e.g., node join).
   * @param {string} reason - Reason for the trigger.
   */
  triggerRebalanceCheck(reason) {
    if (this.rebalancer && this.isLeader) {
      this.rebalancer.recordStateChange(reason);
    }
  }
  /**
   * Extract ACK from transport response.
   * Requirements: 6.1, 6.2, 6.3, 6.4
   * @param {Object} result - Transport result (now flat structure).
   * @param {string} requestId - Expected request ID.
   * @return {Object|null} ACK or null if not found.
   * @private
   */
  extractAckFromResponse(result, requestId) {
    if (!result) return null;
    if (result.request_id === requestId) {
      return result;
    }
    if (result.result) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NESTED_ACK_UNSUPPORTED);
    }
    return null;
  }
  /**
   * Deliver a message via transport and wait for ACK with timeout.
   * Uses PendingRequestTracker instead of EventEmitter-based ACK handling.
   * Requirements: 3.1, 6.1, 6.2, 6.3, 6.4
   * @param {Object} transport - MessageRouter instance.
   * @param {string} targetAddress - Target address (e.g., 'node-2/lifecycle').
   * @param {Object} message - Message to send.
   * @param {number} timeoutMs - Timeout in milliseconds.
   * @return {Promise<Object>} ACK response or timeout error.
   * @private
   */
  async deliverWithAck(
    transport,
    targetAddress,
    message,
    timeoutMs = PARTITION_SERVICE_VALUE.DEFAULT_TIMEOUT_MS,
  ) {
    const requestId = message.request_id;
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.DELIVERING_WITH_ACK, {
      requestId,
      targetAddress,
      messageType: message.type,
      partitionId: this.partitionId,
    });
    const trackPromise = this.pendingRequestTracker.track(requestId, {
      type: message.type,
      targetAddress,
      timeoutMs,
    });
    let earlyRejection = null;
    const buildTrackerShutdownAck = () => ({
      request_id: requestId,
      status: PARTITION_SERVICE_STATUS.INITIATED,
      message: PARTITION_SERVICE_LOG_MSG.REPLICA_REMOVAL_SELF,
    });
    trackPromise.catch((err) => {
      earlyRejection = err;
    });
    try {
      const result = await transport.deliver(targetAddress, message);
      if (earlyRejection) {
        if (
          earlyRejection.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN
        ) {
          this.logger.debug(
            PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_DELIVERY,
            {requestId, partitionId: this.partitionId},
          );
          return buildTrackerShutdownAck();
        }
        throw earlyRejection;
      }
      if (result && result.acknowledged === false) {
        const errorMsg =
          result.error || PARTITION_SERVICE_ERROR_MSG.DELIVERY_NOT_ACK;
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.MESSAGE_DELIVERY_FAILED, {
          requestId,
          targetAddress,
          error: errorMsg,
          partitionId: this.partitionId,
        });
        if (this.pendingRequestTracker.hasPending(requestId)) {
          this.pendingRequestTracker.reject(
            requestId,
            new Error(`Delivery failed: ${errorMsg}`),
          );
        }
        throw new Error(`Delivery failed: ${errorMsg}`);
      }
      const ack = this.extractAckFromResponse(result, requestId);
      if (ack) {
        this.pendingRequestTracker.resolve(requestId, ack);
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.RECEIVED_ACK, {
          requestId,
          status: ack.status,
          partitionId: this.partitionId,
        });
        return ack;
      }
      return await trackPromise;
    } catch (error) {
      if (error.message === PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN) {
        this.logger.debug(PARTITION_SERVICE_LOG_MSG.TRACKER_SHUTDOWN_ACK, {
          requestId,
          partitionId: this.partitionId,
        });
        return buildTrackerShutdownAck();
      }
      if (this.pendingRequestTracker.hasPending(requestId)) {
        this.pendingRequestTracker.reject(requestId, error);
      }
      throw error;
    }
  }
}

function createPartitionServiceMetadataDeliveryMethods() {
  const methods = {};
  const prototypeNames =
    Object.getOwnPropertyNames(PartitionServiceMetadataDeliveryMethods.prototype);
  for (const name of prototypeNames) {
    if (name !== 'constructor') {
      methods[name] = PartitionServiceMetadataDeliveryMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionServiceMetadataDeliveryMethods};
