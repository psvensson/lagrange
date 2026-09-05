/**
 * Formation verdict: the seed log plus the demo's schema-admission evidence
 * must derive one machine-readable verdict whose causal chain names seed
 * event-loop starvation, incomplete ready leases, an open critical spread and
 * the admission end state in that order, and a missing seed log must never
 * read as PASS.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {
  CAUSAL_STAGE,
  FORMATION_VERDICT,
  FORMATION_VERDICT_REASON,
  collectFormationVerdict,
  deriveFormationVerdict,
  resolveFormationSeedBudget,
} from '../../examples/service-data-affinity/formation-verdict.js';

const SEED = 'seed-node';
const JOINER = 'joiner-node';
const BASE_MS = Date.parse('2026-09-05T19:02:40.000Z');
const SECOND_MS = 1000;
const LEASE_WAIT_MSG =
  'Waiting for transitional cluster membership to settle before planning ' +
  'critical system rebalancing';

function at(offsetSeconds) {
  return new Date(BASE_MS + offsetSeconds * SECOND_MS).toISOString();
}

function gapLine(offsetSeconds, gapMs, unexplainedMs, site) {
  return JSON.stringify({
    level: 40, time: at(offsetSeconds), nodeId: SEED, gapMs, unexplainedMs,
    siteDeltas: [{site, count: 1, totalMs: gapMs}],
    msg: 'Event loop gap detected',
  });
}

function leaseWaitLine(offsetSeconds, unreadyNodeIds) {
  return JSON.stringify({
    level: 30, time: at(offsetSeconds), nodeId: SEED,
    blockerReason: 'node_ready_lease_incomplete', unreadyNodeIds,
    msg: LEASE_WAIT_MSG,
  });
}

function plainLine(offsetSeconds, msg) {
  return JSON.stringify({level: 30, time: at(offsetSeconds), nodeId: SEED, msg});
}

function admission({admitted, blocker, spreadGap, inFlight}) {
  return {
    admitted,
    // The admitted wait result carries no top-level state; the snapshot's
    // state is what the verdict must fall back to.
    ...(admitted ? {} : {state: 'denied'}),
    snapshot: {
      state: admitted ? 'admitted' : (blocker || 'denied'),
      canonicalBlocker: blocker,
      reasonCodes: blocker ? [blocker] : [],
      criticalSystemTopology: {
        ready: spreadGap === 0, totalSpreadGap: spreadGap,
        observationState: 'available',
      },
    },
    transitionHistory: {
      transitions: [
        {
          firstObservedAtMs: BASE_MS + 90 * SECOND_MS,
          observationCount: 49,
          effectiveInFlightCount: inFlight,
          criticalSystemTopology: {prioritySpreadGap: spreadGap},
        },
        // The terminal pressure transition observes nothing; it must not
        // hide the spread reading that preceded it.
        {
          firstObservedAtMs: BASE_MS + 250 * SECOND_MS,
          observationCount: 1,
          effectiveInFlightCount: null,
          criticalSystemTopology: {prioritySpreadGap: null},
        },
        // An observation_unavailable transition carries a placeholder gap
        // of 0 under an 'available' reading (the real 2026-09-05T20-21 local
        // run's shape); it is not a closed spread either.
        {
          state: 'observation_unavailable',
          firstObservedAtMs: BASE_MS + 260 * SECOND_MS,
          observationCount: 1,
          effectiveInFlightCount: null,
          criticalSystemTopology: {
            prioritySpreadGap: 0, observationState: 'available',
          },
        },
        {
          state: 'observation_unavailable',
          firstObservedAtMs: BASE_MS + 270 * SECOND_MS,
          observationCount: 14,
          effectiveInFlightCount: null,
          criticalSystemTopology: {
            prioritySpreadGap: null, observationState: 'snapshot_lane_unavailable',
          },
        },
      ],
    },
  };
}

const STARVED_LOG = [
  plainLine(0, 'Bootstrap API started'),
  gapLine(3, 2563, 856, 'partition_replica_init'),
  gapLine(20, 4151, 4151, 'projection_readiness_owner_build'),
  gapLine(40, 5365, 5365, 'projection_readiness_owner_build'),
  gapLine(60, 4904, 4904, 'raft_follower_commit_apply_slice'),
  leaseWaitLine(10, [SEED]),
  leaseWaitLine(41, [SEED, JOINER]),
  'plain console text mentioning Event loop gap detected',
  leaseWaitLine(300, [JOINER]),
  gapLine(200, 1200, 0, 'raft_follower_commit_apply_slice'),
  plainLine(310, 'Shutting down'),
].join('\n');

test('a starved seed derives the full causal chain and a FAIL verdict', (t) => {
  const verdict = deriveFormationVerdict({
    seedLogText: STARVED_LOG,
    schemaAdmission: admission({
      admitted: false, blocker: 'control_plane_pressure',
      spreadGap: 6, inFlight: 0,
    }),
    environment: {},
  });
  t.equal(verdict.verdict, FORMATION_VERDICT.FAIL);
  t.equal(verdict.reason, FORMATION_VERDICT_REASON.SEED_STARVED);
  t.equal(verdict.seedStarved, true);
  t.equal(verdict.seedNodeId, SEED);
  t.equal(verdict.window.source, 'admission_first_observation');
  t.equal(verdict.window.windowMs, 90 * SECOND_MS);
  t.equal(verdict.seedGaps.gapCount, 4, 'the gap after the window is excluded');
  t.equal(verdict.seedGaps.unexplainedMs, 856 + 4151 + 5365 + 4904);
  t.equal(verdict.seedGaps.maxGapMs, 5365);
  t.equal(verdict.seedGaps.topSites[0].site, 'projection_readiness_owner_build');
  t.equal(verdict.leaseWaits.count, 3);
  t.equal(verdict.leaseWaits.maxUnreadyCount, 2);
  t.equal(verdict.leaseWaits.seedUnreadyCount, 2);
  t.same(verdict.leaseWaits.lastUnreadyNodeIds, [JOINER]);
  t.same(verdict.leaseWaits.blockerReasons, {node_ready_lease_incomplete: 3});
  t.equal(verdict.criticalSpread.finalSpreadGap, 6,
    'the last OBSERVED spread, not the blind or unavailable transitions');
  t.equal(verdict.criticalSpread.transitionCount, 4);
  t.equal(verdict.criticalSpread.maxSpreadGap, 6);
  t.equal(verdict.criticalSpread.openObservationCount, 49);
  t.equal(verdict.criticalSpread.inFlightCount, 0);
  t.equal(verdict.admission.canonicalBlocker, 'control_plane_pressure');
  t.same(
    verdict.causalChain.map((stage) => [stage.stage, stage.broken]),
    [
      [CAUSAL_STAGE.SEED_EVENT_LOOP, true],
      [CAUSAL_STAGE.NODE_READY_LEASE, true],
      [CAUSAL_STAGE.CRITICAL_SPREAD, true],
      [CAUSAL_STAGE.SCHEMA_ADMISSION, true],
    ],
    'every broken stage is named in causal order',
  );
  t.end();
});

test('reason precedence: leases, then spread, then the admission blocker', (t) => {
  const quietLog = [
    plainLine(0, 'Bootstrap API started'),
    leaseWaitLine(10, [JOINER]),
    plainLine(310, 'Shutting down'),
  ].join('\n');
  const leases = deriveFormationVerdict({
    seedLogText: quietLog,
    schemaAdmission: admission({
      admitted: false, blocker: 'critical_system_spread_open',
      spreadGap: 6, inFlight: 0,
    }),
    environment: {},
  });
  t.equal(leases.reason, FORMATION_VERDICT_REASON.READY_LEASE_INCOMPLETE);
  t.equal(leases.seedStarved, false);
  const noLeaseLog = [plainLine(0, 'start'), plainLine(310, 'stop')].join('\n');
  const spread = deriveFormationVerdict({
    seedLogText: noLeaseLog,
    schemaAdmission: admission({
      admitted: false, blocker: 'critical_system_spread_open',
      spreadGap: 3, inFlight: 1,
    }),
    environment: {},
  });
  t.equal(spread.reason, FORMATION_VERDICT_REASON.CRITICAL_SPREAD_OPEN);
  const blocked = deriveFormationVerdict({
    seedLogText: noLeaseLog,
    schemaAdmission: admission({
      admitted: false, blocker: 'snapshot_query_error',
      spreadGap: 0, inFlight: 0,
    }),
    environment: {},
  });
  t.equal(blocked.reason, FORMATION_VERDICT_REASON.ADMISSION_BLOCKED);
  t.equal(blocked.admission.canonicalBlocker, 'snapshot_query_error');
  t.end();
});

test('an admitted run is PASS but still reports seed starvation', (t) => {
  const verdict = deriveFormationVerdict({
    seedLogText: STARVED_LOG,
    schemaAdmission: admission({
      admitted: true, blocker: null, spreadGap: 0, inFlight: 0,
    }),
    formation: {
      clusterStartedAtMs: BASE_MS,
      clusterFormedAtMs: BASE_MS + 100 * SECOND_MS,
    },
    environment: {},
  });
  t.equal(verdict.verdict, FORMATION_VERDICT.PASS);
  t.equal(verdict.reason, FORMATION_VERDICT_REASON.SCHEMA_ADMITTED);
  t.equal(verdict.seedStarved, true, 'starvation stays visible for the trend');
  t.equal(verdict.window.source, 'demo_phase_timing');
  t.equal(verdict.window.windowMs, 100 * SECOND_MS);
  t.same(
    verdict.causalChain.map((stage) => stage.broken),
    [true, false, false, false],
    'settle waits during a formation that admitted are not broken links',
  );
  t.equal(verdict.admission.state, 'admitted');
  t.end();
});

test('the budget scales with the machine factor and bounds the percent', (t) => {
  t.same(resolveFormationSeedBudget({}), {
    machineFactor: 1, maxBlockedMs: 10000, maxBlockedPercent: 25,
  });
  t.equal(
    resolveFormationSeedBudget({LAGRANGE_TEST_MACHINE_FACTOR: '3'}).maxBlockedMs,
    30000,
  );
  t.equal(
    resolveFormationSeedBudget({LAGRANGE_TEST_MACHINE_FACTOR: 'x'}).machineFactor,
    1,
  );
  const withinBudgetButHighPercent = deriveFormationVerdict({
    seedLogText: [
      plainLine(0, 'start'),
      gapLine(1, 3000, 3000, 'site'),
      plainLine(2, 'still starting'),
      plainLine(400, 'stop'),
    ].join('\n'),
    schemaAdmission: admission({
      admitted: false, blocker: 'control_plane_pressure',
      spreadGap: 0, inFlight: 0,
    }),
    formation: {
      clusterStartedAtMs: BASE_MS, clusterFormedAtMs: BASE_MS + 8 * SECOND_MS,
    },
    environment: {},
  });
  t.equal(withinBudgetButHighPercent.seedStarved, true,
    '3 s blocked of an 8 s window exceeds the percent budget');
  t.end();
});

test('a missing or empty seed log is UNKNOWN, never PASS', async (t) => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'formation-verdict-'));
  const missing = await collectFormationVerdict(dataRoot, {
    schemaAdmission: admission({
      admitted: true, blocker: null, spreadGap: 0, inFlight: 0,
    }),
    environment: {},
  });
  t.equal(missing.verdict, FORMATION_VERDICT.UNKNOWN);
  t.equal(missing.reason, FORMATION_VERDICT_REASON.SEED_LOG_UNAVAILABLE);
  t.equal(missing.seedStarved, null);
  fs.writeFileSync(path.join(dataRoot, 'node-0.log'), STARVED_LOG);
  const present = await collectFormationVerdict(dataRoot, {
    schemaAdmission: admission({
      admitted: false, blocker: 'control_plane_pressure',
      spreadGap: 6, inFlight: 0,
    }),
    environment: {},
  });
  t.equal(present.verdict, FORMATION_VERDICT.FAIL);
  t.equal(present.reason, FORMATION_VERDICT_REASON.SEED_STARVED);
  fs.rmSync(dataRoot, {recursive: true, force: true});
  t.end();
});
