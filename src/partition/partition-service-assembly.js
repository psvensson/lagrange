import {createPartitionServiceRebalancerMethods} from './partition-service-rebalancer-methods.js';
import {createPartitionServiceMetadataDeliveryMethods} from './partition-service-metadata-delivery-methods.js';
import {createPartitionServiceLearnerPromotionMethods} from './partition-service-learner-promotion-methods.js';
import {createPartitionServiceLearnerPromotionProofMethods} from './partition-service-learner-promotion-proof-methods.js';
import {createPartitionServiceLearnerPromotionWakeMethods} from './partition-service-learner-promotion-wake-methods.js';
import {createPartitionServiceDurabilityFitnessMethods} from './partition-service-durability-fitness.js';
import {createPartitionServiceLifecycleMethods} from './partition-service-lifecycle-methods.js';
import {createPartitionServiceMergeReplicationMethods} from './partition-service-merge-replication-methods.js';
import {createPartitionServiceMergeReplicationResumptionMethods} from './partition-service-merge-replication-resumption-methods.js';
import {createPartitionServiceSplitMirrorQueueMethods} from './partition-service-split-mirror-queue-methods.js';
import {PartitionServiceSplitAccessorBase} from './partition-service-split-accessor-base.js';

class PartitionService extends PartitionServiceSplitAccessorBase {}

Object.assign(
  PartitionService.prototype,
  createPartitionServiceRebalancerMethods(),
  createPartitionServiceMetadataDeliveryMethods(),
  createPartitionServiceLearnerPromotionMethods(),
  createPartitionServiceLearnerPromotionProofMethods(),
  createPartitionServiceLearnerPromotionWakeMethods(),
  createPartitionServiceDurabilityFitnessMethods(),
  createPartitionServiceLifecycleMethods(),
  createPartitionServiceMergeReplicationMethods(),
  createPartitionServiceMergeReplicationResumptionMethods(),
  createPartitionServiceSplitMirrorQueueMethods(),
);

export {PartitionService};
