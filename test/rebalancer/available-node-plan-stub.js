// The one seam a test replaces to state which nodes a rebalancer may place
// on: its classified placement answer, getAvailableNodePlan. Every reader -
// rebalance(), evaluateState() and the planner's getAvailableNodes(), which
// projects the same answer - then sees the same nodes. Replacing
// getAvailableNodes alone left rebalance() and evaluateState() on the real
// classification: a mixed composition.
import {
  AVAILABLE_NODE_PLANNING_STATE,
} from '../../src/rebalancer/rebalancer-no-target-pass-diagnostic.js';

/**
 * State the nodes a rebalancer reads as READY placement candidates.
 * @param {Object} rebalancer
 * @param {Function} readNodes () => Array<node row>, read on every call
 */
function stubAvailableNodes(rebalancer, readNodes) {
  rebalancer.getAvailableNodePlan = () => {
    const availableNodes = readNodes();
    return Object.freeze({
      availableNodes,
      candidates: Object.freeze(availableNodes.map((node) => Object.freeze({
        nodeId: node.node_id,
        state: AVAILABLE_NODE_PLANNING_STATE.READY,
        reason: null,
      }))),
      readinessDecisionDimension: null,
    });
  };
}

export {stubAvailableNodes};
