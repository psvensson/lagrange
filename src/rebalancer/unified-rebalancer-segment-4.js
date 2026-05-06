/**
 * Owner contract:
 * Owner: UnifiedRebalancer segment 4 owns move execution and recovery follow-up.
 * Inputs: calculated moves, budget state, readiness state, priority-recovery decisions.
 * Canonical output: execution results, skip reasons, and follow-up move augmentation.
 * Prohibited fallbacks: no unnamed budget bypass or direct coordinator mutation.
 * Primary tests: test/rebalancer/unified-rebalancer.test-part-5-2.js.
 */
import {UnifiedRebalancerSegment4Stage5 as UnifiedRebalancerSegment4} from './unified-rebalancer-segment-4-stage-5.js';

export {
  UnifiedRebalancerSegment4,
};
