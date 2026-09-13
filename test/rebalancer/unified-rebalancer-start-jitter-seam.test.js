// Seam proof (formation-sim, bounded-seams constraint): the unified
// rebalancer's first eligible instant and its stabilisation anchor are drawn
// from the owner's own clock and random seams, so a virtual clock and a seed
// determine them. RED on revert: with a bare Date.now()/Math.random() in the
// constructor the values below would be wall-clock times, not 10 000 ms.

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

const VIRTUAL_NOW_MS = 10_000;
const FIXED_DRAW = 0.5;
const OTHER_DRAW = 0.25;
const CONNECTED = 'connected';

function buildRebalancer({nowMs, draw}) {
  const cache = createMockCache([], [], [], [], [], [], []);
  return new UnifiedRebalancer({
    entityId: 'partition-1',
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
    controlPlaneReadinessService: createMockReadinessService(cache),
    nowFn: () => nowMs,
    randomSource: {random: () => draw},
  });
}

test('the first eligible instant and the stabilisation anchor follow the injected seams',
  (t) => {
    initializeTestEnvironment();
    const rebalancer = buildRebalancer({nowMs: VIRTUAL_NOW_MS, draw: FIXED_DRAW});
    t.equal(rebalancer.lastStateChangeTime, VIRTUAL_NOW_MS,
      'the stabilisation anchor is the injected clock, not the wall clock');
    t.equal(rebalancer.rebalanceStartAtMs,
      VIRTUAL_NOW_MS + Math.floor(FIXED_DRAW * rebalancer.periodicCheckJitterMs),
      'the start jitter is drawn from the injected random source over the jitter window');
    const other = buildRebalancer({nowMs: VIRTUAL_NOW_MS, draw: OTHER_DRAW});
    t.equal(other.rebalanceStartAtMs,
      VIRTUAL_NOW_MS + Math.floor(OTHER_DRAW * other.periodicCheckJitterMs),
      'a different draw moves the instant, so a seed decides it');
    t.end();
  });
