import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {deliveryAnswerOf, deliveryTransportOf, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';
import {
  LEARNER_PROMOTION_PROOF_REASON,
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE,
  evaluateLearnerPromotionProof,
  refuseLearnerPromotionProof,
} from '../raft/learner-promotion-progress.js';
import {
  buildSnapshotCatchupIdentityFromCache,
} from '../raft/snapshot-catchup.js';
import {COMMITTED_MEMBERSHIP_ANSWER_KIND} from
  '../raft/raft-committed-membership-constants.js';
import {readPartitionCommittedMembership} from
  './partition-service-raft-membership-administration.js';
import {
  TRANSPORT_CONFIG_KEY,
  TRANSPORT_DEFAULT,
} from '../constants/transport.js';
import {turnChainValue} from '../raft/raft-rs-turn-answer.js';

const {
  ConfigurationManager,
  RaftRole,
  PARTITION_SERVICE_LITERAL,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  STRING,
} = PARTITION_SERVICE_SHARED;

const PROTOTYPE_CONSTRUCTOR_NAME = 'constructor';

/**
 * The refusal a committed-membership answer gives a proof request, or null
 * when the configuration names the learner as a voter or learner under
 * exactly its replica identity.
 * @param {Object} membership - The witness read's answer.
 * @param {string} learnerReplicaId - The requesting learner.
 * @return {Object|null} Frozen refused proof, or null.
 */
function learnerConfigurationRefusal(membership, learnerReplicaId) {
  if (membership?.kind !== COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED) {
    return refuseLearnerPromotionProof(
      LEARNER_PROMOTION_PROOF_REASON.CONFIGURATION_UNAVAILABLE,
      membership?.reason ?? null);
  }
  const named = [...membership.voters, ...membership.learners].some(
    (peerId) => membership.identities[peerId] === learnerReplicaId);
  return named ? null : refuseLearnerPromotionProof(
    LEARNER_PROMOTION_PROOF_REASON.NOT_IN_CONFIGURATION, null);
}

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
   * Leader-side handler for a learner's promotion-proof request (quest
   * learner-host-from-committed-admission). Decided from committed facts
   * only, in order: the request shape (REQUEST_INVALID/request_shape); this
   * replica's live leadership, before any other read (NOT_LEADER); its
   * committed configuration naming the learner under exactly its replica
   * identity (NOT_IN_CONFIGURATION; an unreadable configuration refuses
   * CONFIGURATION_UNAVAILABLE with the read's reason); then the raft-layer
   * predicate over the leader's own progress for that identity (raft-rs
   * Progress[id].matched), term, commit index and both membership epochs.
   * No address is resolved: whether the learner can be reached is the
   * transport's concern, never an input to this decision.
   * @param {Object} payload request
   *   ({partitionId, replicaId, membershipEpoch})
   * @return {Promise<Object>} {partitionId, learnerReplicaId, proof}
   * @private
   */
  async handleLearnerPromotionProofRequest(payload) {
    const learnerReplicaId = String(
      payload?.replicaId || STRING.EMPTY,
    ).trim();
    const requestShape = {
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
    if (!this.leadsForLearnerPromotionProof()) {
      return {...requestShape, proof: evaluateLearnerPromotionProof({
        raftIsLeader: false})};
    }
    const membership = await readPartitionCommittedMembership(this);
    const configurationRefusal =
      learnerConfigurationRefusal(membership, learnerReplicaId);
    if (configurationRefusal !== null) {
      this.logger.info(
        PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_PROOF_REQUEST_REFUSED, {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          learnerReplicaId,
          reason: configurationRefusal.reason,
          cause: configurationRefusal.cause,
        });
      return {...requestShape, proof: configurationRefusal};
    }
    const status = this.raft.readStatus();
    const followerMatchIndex = status.followerProgress?.[learnerReplicaId];
    const proof = evaluateLearnerPromotionProof({
      raftIsLeader: this.leadsForLearnerPromotionProof(),
      currentTerm: this.resolveCurrentTermSafe(),
      committedIndex: status.commitIndex,
      learnerMatchIndex: Number.isFinite(followerMatchIndex) ?
        followerMatchIndex : 0,
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
      this.probeLearnerReplicationProgress(learnerReplicaId);
    }
    return {...requestShape, proof};
  }
  /**
   * This replica leads its group now: its own flag and its port's live role.
   * @return {boolean}
   * @private
   */
  leadsForLearnerPromotionProof() {
    return this.isLeader === true &&
      this.raft?.readStatus?.().role === RaftRole.LEADER;
  }
  /**
   * Leader-side typed REQUEST_INVALID refusal (a malformed request), logged
   * at info like every leader-side refusal of a configuration fact.
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
   * Drive one heartbeat round to one learner (by replica identity) so
   * progress evidence (an APPEND_ACK, or an append-fail engaging catch-up)
   * materializes; the port addresses it from its committed node. Never
   * throws; failures only defer the next proof retry.
   * @param {string} learnerReplicaId learner replica identity
   * @return {Promise<void>}
   * @private
   */
  async probeLearnerReplicationProgress(learnerReplicaId) {
    if (typeof this.raft?.probePeerProgress !== PARTITION_SERVICE_LITERAL.FUNCTION) {
      return;
    }
    try {
      await turnChainValue(this.raft.probePeerProgress(learnerReplicaId));
    } catch (probeError) {
      this.logger.debug(
        PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_PROGRESS_PROBE_FAILED,
        {
          partitionId: this.partitionId,
          replicaId: this.replicaId,
          learnerReplicaId,
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
   * stacks beyond the cadence.
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
    let delivery = null;
    try {
      delivery = await this.transport.deliver(
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
    const response = deliveryAnswerOf(delivery);
    if (!this.learnerPromotionProofResponseBindsThisLearner(delivery)) {
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
   * Proof delivery timeout: the router-configured message timeout, resolved
   * the way the router resolves it (its own messageTimeoutMs, else the
   * configured transport.messageTimeoutMs, else TRANSPORT_DEFAULT
   * .MESSAGE_TIMEOUT_MS) and passed explicitly so the bound is visible on
   * the wire. It is never bounded below that timeout: a tighter bound
   * starves promotion under sustained leader latency (a 3 s round trip
   * times out forever against a 2 s bound). Not stacking with the cadence
   * is the schedule's property — the next check is armed from completion.
   * @return {number} milliseconds
   * @private
   */
  resolveLearnerPromotionProofDeliveryTimeoutMs() {
    return this.transport?.messageTimeoutMs ||
      ConfigurationManager.getInstance().get(
        TRANSPORT_CONFIG_KEY.MESSAGE_TIMEOUT_MS,
      ) ||
      TRANSPORT_DEFAULT.MESSAGE_TIMEOUT_MS;
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
   * @param {Object} delivery leader delivery envelope
   * @return {boolean}
   * @private
   */
  learnerPromotionProofResponseBindsThisLearner(delivery) {
    const transport = deliveryTransportOf(delivery);
    const response = deliveryAnswerOf(delivery);
    return isDeliveredTransportDeliveryOutcome(transport) &&
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
