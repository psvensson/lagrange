import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {readFollowerMatchIndex} from '../raft/liferaft.js';
import {
  LEARNER_PROMOTION_PROOF_REASON,
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE,
  evaluateLearnerPromotionProof,
  refuseLearnerPromotionProof,
} from '../raft/learner-promotion-progress.js';
import {
  buildSnapshotCatchupIdentityFromCache,
} from '../raft/snapshot-catchup.js';
import {TRANSPORT_DEFAULT} from '../constants/transport.js';

const {
  LifeRaft,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  STRING,
} = PARTITION_SERVICE_SHARED;

// An empty raft log reports no last index; the probe has nothing to re-send.
const LEARNER_PROMOTION_PROBE_EMPTY_LOG_INDEX = 0;
const PROTOTYPE_CONSTRUCTOR_NAME = 'constructor';

/**
 * Learner-promotion progress-proof plumbing (quest
 * learner-promotion-progress-proof). The partition service stays the sole
 * promotion owner; these methods carry the progress contract between the
 * learner and the current leader over the existing application-message
 * channel. The raft layer stays the replication-progress owner: the grant
 * predicate is evaluated from the leader's own observed follower progress
 * (`readFollowerMatchIndex`) — a learner-supplied index is never an input.
 *
 * Membership epoch authority is the snapshot-catchup identity epoch
 * (latest PUBLISHED membership publication epoch from the cached
 * control_plane_publications rows, 0 at bootstrap) — one epoch author for
 * snapshots and promotion proofs.
 */
class PartitionServiceLearnerPromotionProofMethods {
  /**
   * The membership epoch the promotion proof binds to.
   * @return {number} non-negative epoch (0 at bootstrap)
   * @private
   */
  resolveLearnerPromotionMembershipEpoch() {
    return buildSnapshotCatchupIdentityFromCache({
      partitionId: this.partitionId,
      tableName: this.tableName,
      systemTableCache: this.systemTableCache,
    }).membershipEpoch;
  }
  /**
   * Leader-side handler for a learner's promotion-proof request. Gathers
   * the facts (live leadership, current term, committed index as the safe
   * promotion index, leader-observed learner match index, both membership
   * epochs) and answers with the raft layer's typed proof outcome. Every
   * refusal is typed; a malformed request refuses REQUEST_INVALID with
   * cause request_shape, an unresolvable learner address (its services row
   * not yet in this cache) with cause learner_address_unresolvable.
   * @param {Object} payload request
   *   ({partitionId, replicaId, membershipEpoch})
   * @return {Object} {acknowledged, partitionId, learnerReplicaId, proof}
   * @private
   */
  handleLearnerPromotionProofRequest(payload) {
    const learnerReplicaId = String(
      payload?.replicaId || STRING.EMPTY,
    ).trim();
    const requestShape = {
      acknowledged: true,
      partitionId: this.partitionId,
      learnerReplicaId,
    };
    if (
      payload?.partitionId !== this.partitionId ||
      learnerReplicaId.length === 0
    ) {
      return this.refuseLearnerPromotionProofRequest(
        requestShape,
        LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.REQUEST_SHAPE,
        {requestedPartitionId: payload?.partitionId},
      );
    }
    let learnerAddress = null;
    try {
      learnerAddress = this.buildPeerAddress(learnerReplicaId);
    } catch (addressError) {
      return this.refuseLearnerPromotionProofRequest(
        requestShape,
        LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEARNER_ADDRESS_UNRESOLVABLE,
        {error: addressError.message},
      );
    }
    const matchObservation = readFollowerMatchIndex(
      this.raft,
      learnerAddress,
    );
    const proof = evaluateLearnerPromotionProof({
      raftIsLeader:
        this.isLeader === true && this.raft?.state === LifeRaft.LEADER,
      currentTerm: this.resolveCurrentTermSafe(),
      committedIndex: this.raftProvider.getCommittedIndex(this.raft),
      learnerMatchIndex: matchObservation.matchIndex,
      leaderMembershipEpoch: this.resolveLearnerPromotionMembershipEpoch(),
      learnerMembershipEpoch: payload?.membershipEpoch,
    });
    if (proof.reason === LEARNER_PROMOTION_PROOF_REASON.PROGRESS_BEHIND) {
      // Liveness: an exactly-caught-up idle learner (e.g. freshly
      // snapshot-installed with no traffic) never acks on pure heartbeats,
      // so the leader would hold zero progress evidence forever. Nudge
      // replication once per refused proof (bounded by the learner's retry
      // cadence): re-sending the last log entry either yields a
      // same-identity save + ack (caught up) or an append-fail that engages
      // the existing catch-up batching (behind). Fire-and-forget.
      this.probeLearnerReplicationProgress(learnerAddress);
    }
    return {...requestShape, proof};
  }
  /**
   * Leader-side typed REQUEST_INVALID refusal, logged at info so the two
   * mints of one reason are distinguishable in a node log.
   * @param {Object} requestShape response envelope without the proof
   * @param {string} cause LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE member
   * @param {Object} detail extra log fields
   * @return {Object} response envelope with the refused proof
   * @private
   */
  refuseLearnerPromotionProofRequest(requestShape, cause, detail) {
    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_PROOF_REQUEST_REFUSED,
      {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        learnerReplicaId: requestShape.learnerReplicaId,
        reason: LEARNER_PROMOTION_PROOF_REASON.REQUEST_INVALID,
        cause,
        ...detail,
      },
    );
    return {
      ...requestShape,
      proof: refuseLearnerPromotionProof(
        LEARNER_PROMOTION_PROOF_REASON.REQUEST_INVALID,
        cause,
      ),
    };
  }
  /**
   * Send the leader's last log entry to one learner so progress evidence
   * (an APPEND_ACK, or an append-fail engaging catch-up) materializes.
   * Never throws; failures only defer the next proof retry.
   * @param {string} learnerAddress learner unified address
   * @return {Promise<void>}
   * @private
   */
  async probeLearnerReplicationProgress(learnerAddress) {
    const raft = this.raft;
    if (!raft?.log) {
      return;
    }
    try {
      const lastInfo = await raft.log.getLastInfo();
      const lastIndex = Number.isInteger(lastInfo?.index) ?
        lastInfo.index :
        LEARNER_PROMOTION_PROBE_EMPTY_LOG_INDEX;
      if (lastIndex <= LEARNER_PROMOTION_PROBE_EMPTY_LOG_INDEX) {
        return;
      }
      const lastEntry = await raft.log.get(lastIndex);
      if (!lastEntry) {
        return;
      }
      const probePacket = await raft.appendPacket(lastEntry);
      raft.message(learnerAddress, probePacket);
    } catch (probeError) {
      this.logger.debug(
        PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_PROGRESS_PROBE_FAILED,
        {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          learnerAddress,
          error: probeError.message,
        },
      );
    }
  }
  /**
   * Learner-side proof request to the discovered leader. Any transport or
   * response-shape failure returns a typed refused proof with a typed
   * cause — fail-closed; the caller reschedules on its retry cadence. The
   * delivery carries a bounded timeout so one stalled round trip never
   * stacks beyond the cadence. A leader refusal whose cause is
   * learner_address_unresolvable re-asserts this learner's durable
   * services row (quest learner-promotion-proof-channel-wake).
   * @param {Object} promotionObservation
   * @param {string} promotionObservation.leaderReplicaId discovered leader
   * @param {number} promotionObservation.membershipEpoch epoch observed at
   *   request time
   * @return {Promise<Object>} the leader's proof outcome (typed)
   * @private
   */
  async requestLearnerPromotionProofFromLeader(promotionObservation) {
    const leaderAddress = this.resolveLeaderAddressForPromotionProof();
    if (!leaderAddress || !this.transport) {
      return this.refuseLearnerPromotionProofResponse(
        LEARNER_PROMOTION_PROOF_REASON.TRANSPORT_FAILED,
        LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEADER_UNREACHABLE,
        promotionObservation,
        {},
      );
    }
    let response = null;
    try {
      response = await this.transport.deliver(
        leaderAddress,
        {
          type: PARTITION_SERVICE_MESSAGE_TYPE.LEARNER_PROMOTION_PROOF,
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          membershipEpoch: promotionObservation.membershipEpoch,
        },
        {timeoutMs: this.resolveLearnerPromotionProofDeliveryTimeoutMs()},
      );
    } catch (deliverError) {
      return this.refuseLearnerPromotionProofResponse(
        LEARNER_PROMOTION_PROOF_REASON.TRANSPORT_FAILED,
        LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.DELIVERY_FAILED,
        promotionObservation,
        {error: deliverError.message},
      );
    }
    if (!this.learnerPromotionProofResponseBindsThisLearner(response)) {
      return this.refuseLearnerPromotionProofResponse(
        LEARNER_PROMOTION_PROOF_REASON.REQUEST_INVALID,
        LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.RESPONSE_BINDING_MISMATCH,
        promotionObservation,
        {
          responsePartitionId: response?.partitionId,
          responseLearnerReplicaId: response?.learnerReplicaId,
        },
      );
    }
    this.reactToLearnerPromotionRefusalCause(response.proof);
    return response.proof;
  }
  /**
   * Learner-side typed channel refusal (no leader address, delivery
   * failure or timeout, response bound to another learner), logged at info.
   * @param {string} reason LEARNER_PROMOTION_PROOF_REASON member
   * @param {string} cause LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE member
   * @param {Object} promotionObservation request-time observation
   * @param {Object} detail extra log fields
   * @return {Object} frozen refused proof
   * @private
   */
  refuseLearnerPromotionProofResponse(
    reason,
    cause,
    promotionObservation,
    detail,
  ) {
    this.logger.info(
      PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_PROOF_RESPONSE_REFUSED,
      {
        partitionId: this.partitionId,
        replicaId: this.replicaId,
        learnerReplicaId: this.replicaId,
        leaderReplicaId: promotionObservation.leaderReplicaId,
        membershipEpoch: promotionObservation.membershipEpoch,
        reason,
        cause,
        ...detail,
      },
    );
    return refuseLearnerPromotionProof(reason, cause);
  }
  /**
   * Proof delivery bound: never larger than the transport's
   * MESSAGE_TIMEOUT_MS, and at most twice the retry cadence so a timed-out
   * round trip plus the cadence stays within three intervals instead of
   * stacking the 5 s router default on the 1 s timer.
   * @return {number} milliseconds
   * @private
   */
  resolveLearnerPromotionProofDeliveryTimeoutMs() {
    return Math.min(
      TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS,
      this.learnerCatchUpCheckIntervalMs *
        PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_PROOF_TIMEOUT_INTERVAL_MULTIPLE,
    );
  }
  /**
   * Resolve the discovered leader's unified address, or null when it cannot
   * be resolved yet (fail-closed to a typed transport refusal upstream).
   * @return {string|null}
   * @private
   */
  resolveLeaderAddressForPromotionProof() {
    try {
      return this.resolveLeaderAddress();
    } catch (_addressError) {
      return null;
    }
  }
  /**
   * A proof response authorizes promotion only when it is acknowledged and
   * bound to exactly this partition and this learner replica.
   * @param {Object|null} response leader response envelope
   * @return {boolean}
   * @private
   */
  learnerPromotionProofResponseBindsThisLearner(response) {
    return response?.acknowledged === true &&
      response?.partitionId === this.partitionId &&
      response?.learnerReplicaId === this.replicaId &&
      Boolean(response?.proof) &&
      typeof response.proof === PARTITION_SERVICE_LITERAL.OBJECT;
  }
}

function createPartitionServiceLearnerPromotionProofMethods() {
  const methods = {};
  const prototypeNames = Object.getOwnPropertyNames(
    PartitionServiceLearnerPromotionProofMethods.prototype,
  );
  for (const name of prototypeNames) {
    if (name !== PROTOTYPE_CONSTRUCTOR_NAME) {
      methods[name] =
        PartitionServiceLearnerPromotionProofMethods.prototype[name];
    }
  }
  return methods;
}

export {createPartitionServiceLearnerPromotionProofMethods};
