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
/**
 * The membership epoch the promotion proof binds to.
 * @return {number} non-negative epoch (0 at bootstrap)
 * @private
 */
function resolveLearnerPromotionMembershipEpoch(service) {
  return buildSnapshotCatchupIdentityFromCache({
    partitionId: service.partitionId,
    tableName: service.tableName,
    systemTableCache: service.systemTableCache,
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
 * @return {Object} {partitionId, learnerReplicaId, proof}
 * @private
 */
function handleLearnerPromotionProofRequest(service, payload) {
  const learnerReplicaId = String(
    payload?.replicaId || STRING.EMPTY,
  ).trim();
  const requestShape = {

    partitionId: service.partitionId,
    learnerReplicaId,
  };
  if (
    payload?.partitionId !== service.partitionId ||
    learnerReplicaId.length === 0
  ) {
    return service.refuseLearnerPromotionProofRequest(
      requestShape,
      LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.REQUEST_SHAPE,
      {requestedPartitionId: payload?.partitionId},
    );
  }
  let learnerAddress = null;
  try {
    learnerAddress = service.buildPeerAddress(learnerReplicaId);
  } catch (addressError) {
    return service.refuseLearnerPromotionProofRequest(
      requestShape,
      LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEARNER_ADDRESS_UNRESOLVABLE,
      {error: addressError.message},
    );
  }
  const followerMatchIndex =
    service.raft?.readStatus?.().followerProgress?.[learnerAddress];
  const matchObservation = Object.freeze({
    state: Number.isFinite(followerMatchIndex) ? 'available' : 'unavailable',
    matchIndex: Number.isFinite(followerMatchIndex) ? followerMatchIndex : 0,
  });
  const proof = evaluateLearnerPromotionProof({
    raftIsLeader:
      service.isLeader === true &&
        service.raft?.readStatus?.().role === RaftRole.LEADER,
    currentTerm: service.resolveCurrentTermSafe(),
    committedIndex: service.raft.readStatus().commitIndex,
    learnerMatchIndex: matchObservation.matchIndex,
    leaderMembershipEpoch: service.resolveLearnerPromotionMembershipEpoch(),
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
    service.probeLearnerReplicationProgress(learnerAddress);
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
function refuseLearnerPromotionProofRequest(service, requestShape, cause, detail) {
  service.logger.info(
    PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_PROOF_REQUEST_REFUSED,
    {
      partitionId: service.partitionId,
      replicaId: service.replicaId,
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
async function probeLearnerReplicationProgress(service, learnerAddress) {
  // A closed replica has no port; an open one is a validated operation port
  // (createRaftOperationPort), which always probes.
  if (!service.raft) {
    return;
  }
  try {
    await turnChainValue(service.raft.probePeerProgress(learnerAddress));
  } catch (probeError) {
    service.logger.debug(
      PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_PROGRESS_PROBE_FAILED,
      {
        partitionId: service.partitionId,
        replicaId: service.replicaId,
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
async function requestLearnerPromotionProofFromLeader(service, promotionObservation) {
  const leaderAddress = service.resolveLeaderAddressForPromotionProof();
  if (!leaderAddress || !service.transport) {
    return service.refuseLearnerPromotionProofResponse(
      LEARNER_PROMOTION_PROOF_REASON.TRANSPORT_FAILED,
      LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEADER_UNREACHABLE,
      promotionObservation,
      {},
    );
  }
  let delivery = null;
  try {
    delivery = await service.transport.deliver(
      leaderAddress,
      {
        type: PARTITION_SERVICE_MESSAGE_TYPE.LEARNER_PROMOTION_PROOF,
        partitionId: service.partitionId,
        replicaId: service.replicaId,
        membershipEpoch: promotionObservation.membershipEpoch,
      },
      {timeoutMs: service.resolveLearnerPromotionProofDeliveryTimeoutMs()},
    );
  } catch (deliverError) {
    return service.refuseLearnerPromotionProofResponse(
      LEARNER_PROMOTION_PROOF_REASON.TRANSPORT_FAILED,
      LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.DELIVERY_FAILED,
      promotionObservation,
      {error: deliverError.message},
    );
  }
  const response = deliveryAnswerOf(delivery);
  if (!service.learnerPromotionProofResponseBindsThisLearner(delivery)) {
    return service.refuseLearnerPromotionProofResponse(
      LEARNER_PROMOTION_PROOF_REASON.REQUEST_INVALID,
      LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.RESPONSE_BINDING_MISMATCH,
      promotionObservation,
      {
        responsePartitionId: response?.partitionId,
        responseLearnerReplicaId: response?.learnerReplicaId,
      },
    );
  }
  service.reactToLearnerPromotionRefusalCause(response.proof);
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
function refuseLearnerPromotionProofResponse(service, reason,
  cause,
  promotionObservation,
  detail) {
  service.logger.info(
    PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_PROOF_RESPONSE_REFUSED,
    {
      partitionId: service.partitionId,
      replicaId: service.replicaId,
      learnerReplicaId: service.replicaId,
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
function resolveLearnerPromotionProofDeliveryTimeoutMs(service) {
  return service.transport?.messageTimeoutMs ||
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
function resolveLeaderAddressForPromotionProof(service) {
  try {
    return service.resolveLeaderAddress();
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
function learnerPromotionProofResponseBindsThisLearner(service, delivery) {
  const transport = deliveryTransportOf(delivery);
  const response = deliveryAnswerOf(delivery);
  return isDeliveredTransportDeliveryOutcome(transport) &&
    response?.partitionId === service.partitionId &&
    response?.learnerReplicaId === service.replicaId &&
    Boolean(response?.proof) &&
    typeof response.proof === PARTITION_SERVICE_LITERAL.OBJECT;
}

export {
  handleLearnerPromotionProofRequest,
  learnerPromotionProofResponseBindsThisLearner,
  probeLearnerReplicationProgress,
  refuseLearnerPromotionProofRequest,
  refuseLearnerPromotionProofResponse,
  requestLearnerPromotionProofFromLeader,
  resolveLeaderAddressForPromotionProof,
  resolveLearnerPromotionMembershipEpoch,
  resolveLearnerPromotionProofDeliveryTimeoutMs,
};
