import {createPartitionServiceRebalancerMethods} from './partition-service-rebalancer-methods.js';
import {createPartitionServiceMetadataDeliveryMethods} from './partition-service-metadata-delivery-methods.js';
import {createPartitionServiceLearnerPromotionMethods} from './partition-service-learner-promotion-methods.js';
import {createPartitionServiceLearnerPromotionProofMethods} from './partition-service-learner-promotion-proof-methods.js';
import {createPartitionServiceLearnerPromotionWakeMethods} from './partition-service-learner-promotion-wake-methods.js';
import {createPartitionServiceDurabilityFitnessMethods} from './partition-service-durability-fitness.js';
import {PARTITION_SERVICE_PARTICIPANT_TRANSACTION_CADENCE_METHODS} from
  './partition-service-participant-transaction-cadence-methods.js';
import {PARTITION_SERVICE_REMOVAL_SERVING_METHODS} from
  './partition-service-removal-serving-methods.js';
import {PARTITION_SERVICE_REMOTE_QUERY_METHODS} from
  './partition-service-remote-query-methods.js';
import {PARTITION_SERVICE_HYDRATION_IMAGE_METHODS} from
  './partition-service-hydration-image-methods.js';
import {PARTITION_SERVICE_LEADER_ACTIVATION_METHODS} from
  './partition-service-leader-activation-methods.js';
import {createPartitionServiceLifecycleMethods} from './partition-service-lifecycle-methods.js';
import {createPartitionServiceLeadershipTransferMethods} from './partition-service-leadership-transfer.js';
import {createPartitionServiceMergeReplicationMethods} from './partition-service-merge-replication-methods.js';
import {createPartitionServiceMergeReplicationResumptionMethods} from './partition-service-merge-replication-resumption-methods.js';
import {createPartitionServiceSplitMirrorQueueMethods} from './partition-service-split-mirror-queue-methods.js';
import {PartitionServiceSplitAccessorBase} from './partition-service-split-accessor-base.js';
import {createPartitionServiceSourceReplicationStartMethods} from
  './partition-service-source-replication-start-methods.js';
import {configureParticipantDeterminismSelfCheck} from
  './partition-participant-transaction-self-check.js';
import {TRANSACTION_ENVELOPE_SERVICE_METHODS} from
  './partition-transaction-execution-envelope.js';

class PartitionService extends PartitionServiceSplitAccessorBase {
  constructor(options = {}) {
    super(options);
    // The leader's determinism self-check (TX1 design 3.3): the construction
    // option transactionDeterminismSelfCheck, else the classifier owner's.
    configureParticipantDeterminismSelfCheck(this,
      options.transactionDeterminismSelfCheck);
  }
}

Object.assign(
  PartitionService.prototype,
  createPartitionServiceRebalancerMethods(),
  createPartitionServiceMetadataDeliveryMethods(),
  createPartitionServiceLearnerPromotionMethods(),
  createPartitionServiceLearnerPromotionProofMethods(),
  createPartitionServiceLearnerPromotionWakeMethods(),
  createPartitionServiceDurabilityFitnessMethods(),
  PARTITION_SERVICE_PARTICIPANT_TRANSACTION_CADENCE_METHODS,
  PARTITION_SERVICE_REMOVAL_SERVING_METHODS,
  PARTITION_SERVICE_REMOTE_QUERY_METHODS,
  PARTITION_SERVICE_HYDRATION_IMAGE_METHODS,
  PARTITION_SERVICE_LEADER_ACTIVATION_METHODS,
  createPartitionServiceLifecycleMethods(),
  createPartitionServiceLeadershipTransferMethods(),
  createPartitionServiceMergeReplicationMethods(),
  createPartitionServiceMergeReplicationResumptionMethods(),
  createPartitionServiceSplitMirrorQueueMethods(),
  createPartitionServiceSourceReplicationStartMethods(),
  TRANSACTION_ENVELOPE_SERVICE_METHODS,
);

export {PartitionService};
