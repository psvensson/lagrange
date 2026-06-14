import {createPartitionServiceRebalancerMethods} from "./partition-service-rebalancer-methods.js";
import {createPartitionServiceMetadataDeliveryMethods} from "./partition-service-metadata-delivery-methods.js";
import {createPartitionServiceLearnerPromotionMethods} from "./partition-service-learner-promotion-methods.js";
import {createPartitionServiceLifecycleMethods} from "./partition-service-lifecycle-methods.js";
import {PartitionServiceSplitAccessorBase} from "./partition-service-split-accessor-base.js";

class PartitionService extends PartitionServiceSplitAccessorBase {}

Object.assign(
  PartitionService.prototype,
  createPartitionServiceRebalancerMethods(),
  createPartitionServiceMetadataDeliveryMethods(),
  createPartitionServiceLearnerPromotionMethods(),
  createPartitionServiceLifecycleMethods(),
);

export {PartitionService};
