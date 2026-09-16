// Exactly one infrastructure composer per positive simulated node.
//
// The simulator has two ways to bring a node into existence. The legacy host
// composes the node's infrastructure itself - cache, CDC service, router host,
// rebalancer - and hands the result to a scenario. The production host
// composes nothing and lets a real BootstrapService do it. Both are useful;
// running both for the same node is not, because the scenario would then hold
// two caches, two routers and two opinions about what that node is, and would
// silently read whichever it happened to reach.
//
// No production service can detect that, and none should try: BootstrapService
// has no business knowing what a test harness assembled. So the rule is
// enforced here, at composition admission, where the harness knows both sides.
// This is a HARNESS invariant. It adds nothing to production's contract.

// Composition-admission verdicts. They name the harness rule they enforce.
const HARNESS_COMPOSITION_REFUSAL = Object.freeze({
  DUPLICATE_INFRASTRUCTURE_COMPOSER: 'duplicate_infrastructure_composer',
  PRECOMPOSED_INFRASTRUCTURE_ARGUMENT: 'precomposed_infrastructure_argument',
});

const PRODUCTION_BOOTSTRAP_COMPOSER = 'productionBootstrapPhaseOneHost';
const LEGACY_SIMULATED_NODE_HOST_COMPOSER = 'legacySimulatedNodeHost';

class HarnessCompositionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HarnessCompositionError';
    this.code = code;
  }
}

/**
 * A scenario-local record of which composer owns each simulated node's
 * infrastructure. Scenario-local on purpose: two scenarios in one process are
 * two different worlds, exactly as their endpoint registries are.
 * @return {Object} the registry.
 */
function createInfrastructureCompositionRegistry() {
  const composersByNodeId = new Map();
  return {
    claim(nodeId, composer) {
      const existing = composersByNodeId.get(nodeId);
      if (existing) {
        throw new HarnessCompositionError(
          HARNESS_COMPOSITION_REFUSAL.DUPLICATE_INFRASTRUCTURE_COMPOSER,
          `${nodeId} already has an infrastructure composer (${existing}); ` +
          `${composer} would be a second one`);
      }
      composersByNodeId.set(nodeId, composer);
    },
    composerFor(nodeId) {
      return composersByNodeId.get(nodeId) || null;
    },
    release(nodeId) {
      composersByNodeId.delete(nodeId);
    },
  };
}

export {
  HARNESS_COMPOSITION_REFUSAL,
  HarnessCompositionError,
  LEGACY_SIMULATED_NODE_HOST_COMPOSER,
  PRODUCTION_BOOTSTRAP_COMPOSER,
  createInfrastructureCompositionRegistry,
};
