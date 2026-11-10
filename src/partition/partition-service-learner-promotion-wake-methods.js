import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE,
} from '../raft/learner-promotion-progress.js';

const {
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
  PARTITION_SERVICE_LOG_MSG,
  SERVICE_TYPE,
  TABLES,
} = PARTITION_SERVICE_SHARED;

// The membership epoch observed before the learner start seeds the wake
// state from its cache: the contract's bootstrap epoch (0), so a cache that
// hydrates its first PUBLISHED epoch only after the seed still wakes once.
const LEARNER_PROMOTION_BOOTSTRAP_MEMBERSHIP_EPOCH = 0;

/**
 * Per-service learner-promotion wake bookkeeping, created by the service
 * constructor. Both wake sources are CONTENT TRANSITIONS, never change
 * notifications: observedMembershipEpoch is the latest PUBLISHED epoch the
 * hook last saw (seeded at learner start), ownServicesRowVisible flips on
 * the first own-row observation and stays set. A wake that arrives while a
 * check is in flight is coalesced (pendingReasons) and drained into one
 * immediate re-check when the in-flight check completes — the proof
 * channel stays single-flight.
 * @return {Object} mutable wake state
 */
function createLearnerPromotionWakeState() {
  return {
    checkInFlight: false,
    pendingReasons: new Set(),
    observedMembershipEpoch: LEARNER_PROMOTION_BOOTSTRAP_MEMBERSHIP_EPOCH,
    ownServicesRowVisible: false,
  };
}

/**
 * Event wakes for the learner-promotion proof channel (quest
 * learner-promotion-proof-channel-wake). The promotion owner stays the sole
 * owner of when a proof is requested: these methods only re-arm the
 * existing single-flight schedule immediately when an event makes a new
 * answer likely — the learner's own services row becoming visible in its
 * system-table cache (the leader can now resolve its address) or the
 * latest PUBLISHED membership epoch changing (the proof binds to it). Both
 * are transitions of the observed content: a row update after the row is
 * visible and a publication change that leaves the latest PUBLISHED epoch
 * unchanged are silent (no wake, no log). The retry cadence remains the
 * floor and the fallback; no promotion decision lives here.
 */
/**
 * Learner start: observe the current cache content as the wake baseline
 * so only later transitions wake. The own-row flag is deliberately left
 * unobserved here: the row the cache may already hold is the CL-016
 * local-only seed, whose durable landing is the transition under watch.
 * @private
 */
function seedLearnerPromotionWakeObservation(service) {
  service.learnerPromotionWake.observedMembershipEpoch =
    service.resolveLearnerPromotionMembershipEpoch();
}

/**
 * Cache-change hook (every table, every change): route the two wake
 * sources; cheap early exits for everything else.
 * @param {string} tableName
 * @param {string} _operation
 * @param {Object} record
 * @private
 */
function observeLearnerPromotionWakeSource(service, tableName, _operation, record) {
  if (!isCatchupLearnerRaftRole(service.role) || !record) {
    return;
  }
  if (tableName === TABLES.SERVICES) {
    service.observeOwnServicesRowForLearnerPromotion(record);
    return;
  }
  if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
    service.observePublishedEpochForLearnerPromotion();
  }
}

/**
 * Own-row source: exactly one wake, on the first observation of this
 * learner's own partition services row (absent / local-only seed ->
 * visible); every later update of the row is silent.
 * @param {Object} record services row
 * @private
 */
function observeOwnServicesRowForLearnerPromotion(service, record) {
  const wake = service.learnerPromotionWake;
  if (
    wake.ownServicesRowVisible ||
    record.service_id !== service.replicaId ||
    record.partition_id !== service.partitionId ||
    record.service_type !== SERVICE_TYPE.PARTITION
  ) {
    return;
  }
  wake.ownServicesRowVisible = true;
  service.wakeLearnerPromotion(
    PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON
      .SERVICES_ROW_VISIBLE,
  );
}

/**
 * Epoch source: wake only when the resolved latest-PUBLISHED epoch
 * differs from the last observed value, independent of whether a proof
 * was requested; the observation is updated here, so same-epoch
 * publication changes (any row, column or operation) are silent.
 * @private
 */
function observePublishedEpochForLearnerPromotion(service) {
  const wake = service.learnerPromotionWake;
  const membershipEpoch = service.resolveLearnerPromotionMembershipEpoch();
  if (membershipEpoch === wake.observedMembershipEpoch) {
    return;
  }
  wake.observedMembershipEpoch = membershipEpoch;
  service.wakeLearnerPromotion(
    PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON
      .PUBLISHED_EPOCH_CHANGED,
  );
}

/**
 * Re-arm the proof check now. While a check is in flight the wake is
 * coalesced and drained by drainLearnerPromotionWake once it completes.
 * @param {string} wakeReason PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON
 *   wake member
 * @private
 */
function wakeLearnerPromotion(service, wakeReason) {
  const wake = service.learnerPromotionWake;
  if (wake.checkInFlight) {
    wake.pendingReasons.add(wakeReason);
    service.logger.debug(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_WAKE_COALESCED, {
      replicaId: service.replicaId,
      partitionId: service.partitionId,
      wakeReason,
    });
    return;
  }
  if (service.learnerPromotionTimer) {
    clearTimeout(service.learnerPromotionTimer);
    service.learnerPromotionTimer = null;
  }
  service.scheduleLearnerPromotion(wakeReason);
}

/**
 * After a check completes: one immediate re-check for the wakes that
 * arrived during it (single-flight), none when nothing arrived or the
 * replica is no longer a learner.
 * @private
 */
function drainLearnerPromotionWake(service) {
  const wake = service.learnerPromotionWake;
  wake.checkInFlight = false;
  const [pendingReason] = wake.pendingReasons;
  wake.pendingReasons.clear();
  if (pendingReason && isCatchupLearnerRaftRole(service.role)) {
    service.wakeLearnerPromotion(pendingReason);
  }
}

/**
 * React to the typed cause of a channel-level refusal: when the leader
 * could not resolve this learner's address, its services row has not
 * landed durably yet — kick the replica state machine's CL-021
 * deferred-row retry now instead of waiting for its tick. The retry's
 * own bounds (per-row backoff, in-flight guard) apply inside; nothing is
 * bypassed. Absent a state machine (bootstrap cohorts, tests) there is
 * no deferred row to re-assert.
 * @param {Object} proof refused proof
 * @private
 */
function reactToLearnerPromotionRefusalCause(service, proof) {
  if (
    proof?.cause !==
    LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEARNER_ADDRESS_UNRESOLVABLE
  ) {
    return;
  }
  // Validated at construction (partition-service-collaborators.js).
  const stateMachine = service.replicaStateMachine;
  if (!stateMachine) {
    return;
  }
  service.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_ROW_REASSERTED, {
    replicaId: service.replicaId,
    partitionId: service.partitionId,
    learnerReplicaId: service.replicaId,
    cause: proof.cause,
  });
  Promise.resolve(stateMachine.reconcileLocalOnlyServiceRowsNow()).catch(
    (reassertError) => {
      service.logger.debug(
        PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_ROW_REASSERTED,
        {
          replicaId: service.replicaId,
          partitionId: service.partitionId,
          error: reassertError.message,
        },
      );
    },
  );
}

export {
  createLearnerPromotionWakeState,
  drainLearnerPromotionWake,
  observeLearnerPromotionWakeSource,
  observeOwnServicesRowForLearnerPromotion,
  observePublishedEpochForLearnerPromotion,
  reactToLearnerPromotionRefusalCause,
  seedLearnerPromotionWakeObservation,
  wakeLearnerPromotion,
};
