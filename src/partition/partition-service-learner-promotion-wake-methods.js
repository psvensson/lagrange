import {PARTITION_SERVICE_SHARED} from './partition-service-shared.js';
import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {
  LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE,
} from '../raft/learner-promotion-progress.js';

const {
  PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_TYPE,
  SERVICE_TYPE,
  TABLES,
} = PARTITION_SERVICE_SHARED;

// The membership epoch before any proof was requested: the contract's
// bootstrap epoch (0), so the first published epoch the cache hydrates is
// itself a change worth one immediate re-request.
const LEARNER_PROMOTION_BOOTSTRAP_MEMBERSHIP_EPOCH = 0;
const PROTOTYPE_CONSTRUCTOR_NAME = 'constructor';

/**
 * Per-service learner-promotion wake bookkeeping, created by the service
 * constructor. A wake that arrives while a check is in flight is coalesced
 * (pendingReasons) and drained into one immediate re-check when the
 * in-flight check completes — the proof channel stays single-flight.
 * @return {Object} mutable wake state
 */
function createLearnerPromotionWakeState() {
  return {
    checkInFlight: false,
    pendingReasons: new Set(),
    requestedMembershipEpoch: LEARNER_PROMOTION_BOOTSTRAP_MEMBERSHIP_EPOCH,
  };
}

/**
 * Event wakes for the learner-promotion proof channel (quest
 * learner-promotion-proof-channel-wake). The promotion owner stays the sole
 * owner of when a proof is requested: these methods only re-arm the
 * existing single-flight schedule immediately when an event makes a new
 * answer likely — the learner's own services row becoming visible in its
 * system-table cache (the leader can now resolve its address) or the
 * latest PUBLISHED membership epoch changing (the proof binds to it). The
 * retry cadence remains the floor and the fallback; no promotion decision
 * lives here.
 */
class PartitionServiceLearnerPromotionWakeMethods {
  /**
   * Cache-change hook (every table, every change): route the two wake
   * sources; cheap early exits for everything else.
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} record
   * @private
   */
  observeLearnerPromotionWakeSource(tableName, operation, record) {
    if (!isCatchupLearnerRaftRole(this.role) || !record) {
      return;
    }
    if (tableName === TABLES.SERVICES) {
      if (
        record.service_id === this.replicaId &&
        record.partition_id === this.partitionId &&
        record.service_type === SERVICE_TYPE.PARTITION
      ) {
        this.wakeLearnerPromotion(
          PARTITION_SERVICE_LEARNER_PROMOTION_SCHEDULE_REASON
            .SERVICES_ROW_VISIBLE,
        );
      }
      return;
    }
    if (tableName !== TABLES.CONTROL_PLANE_PUBLICATIONS) {
      return;
    }
    const membershipEpoch = this.resolveLearnerPromotionMembershipEpoch();
    if (
      membershipEpoch === this.learnerPromotionWake.requestedMembershipEpoch
    ) {
      return;
    }
    this.wakeLearnerPromotion(
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
  wakeLearnerPromotion(wakeReason) {
    const wake = this.learnerPromotionWake;
    if (wake.checkInFlight) {
      wake.pendingReasons.add(wakeReason);
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_WAKE_COALESCED, {
        replicaId: this.replicaId,
        partitionId: this.partitionId,
        wakeReason,
      });
      return;
    }
    if (this.learnerPromotionTimer) {
      clearTimeout(this.learnerPromotionTimer);
      this.learnerPromotionTimer = null;
    }
    this.scheduleLearnerPromotion(wakeReason);
  }
  /**
   * After a check completes: one immediate re-check for the wakes that
   * arrived during it (single-flight), none when nothing arrived or the
   * replica is no longer a learner.
   * @private
   */
  drainLearnerPromotionWake() {
    const wake = this.learnerPromotionWake;
    wake.checkInFlight = false;
    const [pendingReason] = wake.pendingReasons;
    wake.pendingReasons.clear();
    if (pendingReason && isCatchupLearnerRaftRole(this.role)) {
      this.wakeLearnerPromotion(pendingReason);
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
  reactToLearnerPromotionRefusalCause(proof) {
    if (
      proof?.cause !==
      LEARNER_PROMOTION_PROOF_REFUSAL_CAUSE.LEARNER_ADDRESS_UNRESOLVABLE
    ) {
      return;
    }
    const stateMachine = this.replicaStateMachine;
    if (
      typeof stateMachine?.reconcileLocalOnlyServiceRowsNow !==
      PARTITION_SERVICE_TYPE.FUNCTION
    ) {
      return;
    }
    this.logger.info(PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_ROW_REASSERTED, {
      replicaId: this.replicaId,
      partitionId: this.partitionId,
      learnerReplicaId: this.replicaId,
      cause: proof.cause,
    });
    Promise.resolve(stateMachine.reconcileLocalOnlyServiceRowsNow()).catch(
      (reassertError) => {
        this.logger.debug(
          PARTITION_SERVICE_LOG_MSG.LEARNER_PROMOTION_ROW_REASSERTED,
          {
            replicaId: this.replicaId,
            partitionId: this.partitionId,
            error: reassertError.message,
          },
        );
      },
    );
  }
}

function createPartitionServiceLearnerPromotionWakeMethods() {
  const methods = {};
  const prototypeNames = Object.getOwnPropertyNames(
    PartitionServiceLearnerPromotionWakeMethods.prototype,
  );
  for (const name of prototypeNames) {
    if (name !== PROTOTYPE_CONSTRUCTOR_NAME) {
      methods[name] =
        PartitionServiceLearnerPromotionWakeMethods.prototype[name];
    }
  }
  return methods;
}

export {
  createLearnerPromotionWakeState,
  createPartitionServiceLearnerPromotionWakeMethods,
};
