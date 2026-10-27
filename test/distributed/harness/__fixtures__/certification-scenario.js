/**
 * Test fixture: a scenario module carrying the five-node formation
 * acceptance's real topology and certification requirements
 * (public-path-multinode-baseline), whose run is supplied by the test's
 * fake cluster. Used by the certification witnesses to drive the real
 * runner (runScenarios) without containers.
 */

export {
  SCENARIO_CERTIFICATION_REQUIREMENT,
  SCENARIO_TOPOLOGY_REQUIREMENT,
} from '../../scenarios/public-path-multinode-baseline.js';

/**
 * @param {Object} cluster A test cluster exposing runFakeScenario().
 * @return {Promise<Object>}
 */
export async function run(cluster) {
  return cluster.runFakeScenario(cluster);
}
