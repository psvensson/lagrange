import {RebalanceCoordinatorSegment1} from './rebalance-coordinator-segment-1.js';
import {applyRebalanceCoordinatorOperationIntentMethods} from './rebalance-coordinator-operation-intent-methods.js';
import {applyRebalanceCoordinatorOwnerDelegationMethods} from './rebalance-coordinator-owner-delegation-methods.js';
import {applyRebalanceCoordinatorTopologyGuardMethods} from './rebalance-coordinator-topology-guard-methods.js';

class RebalanceCoordinatorSegment2 extends RebalanceCoordinatorSegment1 {}

applyRebalanceCoordinatorTopologyGuardMethods(RebalanceCoordinatorSegment2);
applyRebalanceCoordinatorOperationIntentMethods(RebalanceCoordinatorSegment2);
applyRebalanceCoordinatorOwnerDelegationMethods(RebalanceCoordinatorSegment2);

export {RebalanceCoordinatorSegment2};
