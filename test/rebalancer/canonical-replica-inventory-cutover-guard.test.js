import {readFile} from 'node:fs/promises';
import {test} from '../../src/test-helpers/tap.js';

const ROOT = new URL('../../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), 'utf8');
}

test('canonical replica inventory production engagement guard', async (t) => {
  const [
    planner,
    plannerState,
    plannerMoves,
    topologyGuard,
    followUp,
    priorityLane,
    legacyAccounting,
  ] =
    await Promise.all([
      source('src/rebalancer/move-planner.js'),
      source('src/rebalancer/move-planner-state-methods.js'),
      source('src/rebalancer/move-planner-move-calculation-methods.js'),
      source('src/rebalancer/rebalance-coordinator-topology-guard-methods.js'),
      source('src/rebalancer/unified-rebalancer-follow-up-move.js'),
      source('src/rebalancer/rebalance-coordinator-priority-budget-admission.js'),
      source('src/rebalancer/in-flight-aware-replica-count.js'),
    ]);

  t.match(planner, /replicaInventoryBuilder/,
    'MovePlanner accepts the canonical production builder dependency');
  t.match(plannerState, /builder: this\.replicaInventoryBuilder/,
    'planner state capture passes the canonical builder');
  t.match(plannerState, /return builder\(\{/,
    'planner inventory helper invokes the supplied production builder');
  t.match(plannerState, /isReplicaInventoryAddTransitionalOperation/,
    'global transition policy reuses canonical operation classification');
  t.notMatch(plannerMoves, /in-flight-aware-replica-count/,
    'move decisions do not import the legacy join');
  t.match(plannerMoves, /effectiveReplicaCountAfterOperations/,
    'move decisions consume the owned effective-count selector');
  t.match(plannerMoves, /topologyIncreaseUsable/,
    'move decisions fail topology increases closed on unusable provenance');
  t.match(topologyGuard, /this\.replicaInventoryBuilder\(/,
    'topology guard invokes the same canonical builder');
  t.match(topologyGuard, /countsTowardVoterTarget/,
    'topology target census consumes the owned contribution selector');
  t.match(followUp, /this\.replicaInventoryBuilder\(/,
    'follow-up planning invokes the canonical builder');
  t.notMatch(followUp, /in-flight-aware-replica-count/,
    'follow-up planning does not retain a compatibility-owner bypass');
  t.match(followUp, /inFlightAddInfluenceCount/,
    'follow-up planning consumes an owned inventory influence selector');
  t.match(followUp, /topologyIncreaseUsable/,
    'follow-up increases fail closed on unusable inventory');
  t.match(priorityLane, /this\.replicaInventoryBuilder\(/,
    'critical create-lane occupancy uses the canonical inventory');
  t.match(legacyAccounting, /buildReplicaInventorySnapshot/,
    'legacy compatibility accounting delegates to the canonical owner');
  t.end();
});
