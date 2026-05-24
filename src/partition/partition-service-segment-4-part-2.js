import {createPartitionServiceRebalancerMethods} from "./partition-service-rebalancer-methods.js";
import {createPartitionServiceMetadataDeliveryMethods} from "./partition-service-metadata-delivery-methods.js";
import {createPartitionServiceLearnerPromotionMethods} from "./partition-service-learner-promotion-methods.js";
import {createPartitionServiceLifecycleMethods} from "./partition-service-lifecycle-methods.js";
import {PartitionServiceSegment4Part1} from "./partition-service-segment-4-part-1.js";

class PartitionServiceSegment4 extends PartitionServiceSegment4Part1 {}

Object.assign(
  PartitionServiceSegment4.prototype,
  createPartitionServiceRebalancerMethods(),
  createPartitionServiceMetadataDeliveryMethods(),
  createPartitionServiceLearnerPromotionMethods(),
  createPartitionServiceLifecycleMethods(),
);

export {PartitionServiceSegment4};
