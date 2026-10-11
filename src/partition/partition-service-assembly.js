import {createPartitionServiceRebalancerMethods} from './partition-service-rebalancer-methods.js';
import {createPartitionServiceMetadataDeliveryMethods} from './partition-service-metadata-delivery-methods.js';
import {createPartitionServiceLearnerPromotionMethods} from './partition-service-learner-promotion-methods.js';
import {createPartitionServiceLearnerPromotionProofMethods} from './partition-service-learner-promotion-proof-methods.js';
import {createPartitionServiceLearnerPromotionWakeMethods} from './partition-service-learner-promotion-wake-methods.js';
import {createPartitionServiceDurabilityFitnessMethods} from './partition-service-durability-fitness.js';
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
import {createPartitionServiceCdcCoverageMethods} from
  './partition-service-cdc-coverage-methods.js';

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
  createPartitionServiceLifecycleMethods(),
  createPartitionServiceLeadershipTransferMethods(),
  createPartitionServiceMergeReplicationMethods(),
  createPartitionServiceMergeReplicationResumptionMethods(),
  createPartitionServiceSplitMirrorQueueMethods(),
  createPartitionServiceSourceReplicationStartMethods(),
  createPartitionServiceCdcCoverageMethods(),
  TRANSACTION_ENVELOPE_SERVICE_METHODS,
);

export {PartitionService};
