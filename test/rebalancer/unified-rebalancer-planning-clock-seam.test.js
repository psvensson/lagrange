// Seam proof (formation-sim, bounded-seams constraint): the unified
// rebalancer's planning-gate pass reads no ambient clock - every read goes
// through the owner's nowFn - so a virtual clock decides start-delay,
// stabilisation and readiness-age gates. RED on revert: the ambient clock is
// replaced by a thrower for the whole awaited pass, so any Date.now() on the
// path (policy scheduler, planning gate, priority readiness, critical
// topology) rejects the pass.

import {test} from '../../src/test-helpers/tap.js';
import {
  EntityType,
  UnifiedRebalancer,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  createMockCache,
  createMockCdcService,
  createMockCoordinator,
  createMockMessageRouter,
  createMockPolicyService,
  createMockReadinessService,
  initializeTestEnvironment,
} from './unified-rebalancer-test-support.js';

const VIRTUAL_NOW_MS = 1_000_000;
const CONNECTED = 'connected';
const AMBIENT_CLOCK_READ = 'ambient clock read on the planning path';
const NODES = Object.freeze([
  {node_id: 'node-1', status: 'active'},
  {node_id: 'node-2', status: 'active'},
]);

// The test-support readiness mock reads the ambient clock for lease expiry;
// it is a stand-in, not the owner under proof, so it answers on the injected
// clock here.
function clockNeutralReadiness(cache, clock) {
  const mock = createMockReadinessService(cache);
  const original = mock.getNodeReadinessSync.bind(mock);
  mock.getNodeReadinessSync = (nodeId, options) => {
    const saved = Date.now;
    Date.now = () => clock.nowMs;
    try {
      return original(nodeId, options);
    } finally {
      Date.now = saved;
    }
  };
  return mock;
}

function buildRebalancer(clock) {
  const cache = createMockCache([...NODES], [], [], [], [], [], []);
  return new UnifiedRebalancer({
    entityId: 'control_plane_publications-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'node-1',
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    tablePolicyService: createMockPolicyService([], []),
    messageRouter: createMockMessageRouter(CONNECTED),
    rebalanceCoordinator: createMockCoordinator(),
    sqlQueryEngine: {async executeQuery() {
      return {success: true, rows: []};
    }},
    controlPlaneSystemTableGateway: null,
    controlPlaneReadinessService: clockNeutralReadiness(cache, clock),
    nowFn: () => clock.nowMs,
    randomSource: {random: () => 0},
  });
}

// The ambient clock throws for the whole awaited pass, continuations
// included; only the owner's own clock may answer.
async function withThrowingAmbientClock(body) {
  const saved = Date.now;
  Date.now = () => {
    throw new Error(AMBIENT_CLOCK_READ);
  };
  try {
    return await body();
  } finally {
    Date.now = saved;
  }
}

test('a planning-gate pass reads only the injected clock', async (t) => {
  initializeTestEnvironment();
  const clock = {nowMs: VIRTUAL_NOW_MS};
  const rebalancer = buildRebalancer(clock);
  const blocker = await withThrowingAmbientClock(() => rebalancer.getCheckRebalanceBlocker());
  t.ok(blocker && blocker.decision, 'the gate produced a decision without the ambient clock');
  t.ok(rebalancer.getTimeUntilRebalanceStartEligible() >= 0,
    'the start-delay gate reads the injected clock');
  clock.nowMs += rebalancer.stabilizationPeriodMs;
  t.equal(rebalancer.isStabilized(), true,
    'advancing the injected clock past the stabilisation period stabilises the owner');
  rebalancer.recordStateChange('seam-test');
  t.equal(rebalancer.lastStateChangeTime, clock.nowMs,
    'a state change is stamped on the injected clock');
  t.end();
});
