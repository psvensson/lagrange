#!/usr/bin/env node
/**
 * placement-affinity-study — wide deterministic parameter sweeps over the
 * service↔data affinity placement simulator (test/convergence/
 * placement-affinity-sim.js; fidelity boundary documented there). The tap test
 * pins the design claims on a trimmed grid; this census explores the wider
 * design space to inform the DATA_AFFINITY kernel dimension (epic:
 * solve/epics/service-data-affinity-placement.md).
 *
 * Sweeps:
 *   A  routing × wAffinity          — the "routing is the gate" surface
 *   B  hysteresis × wLoad × lag     — one-sided stability/churn frontier
 *   C  service-vs-partition hysteresis matrix — two-sided pursuit outcomes
 *   D  widen-vs-chase across consumer-group spread
 *
 * Usage: node scripts/census/placement-affinity-study.mjs [--json <path>]
 */

import fs from 'node:fs';
import {
  ROUTING_MODEL,
  makeAffinityWorld,
  snapshotPlacement,
  computeMetrics,
  runPlacementSim,
  optimalReadHitRate,
} from '../../test/convergence/placement-affinity-sim.js';

const THREE_GROUPS = [
  {id: 'G1', nodeCount: 3},
  {id: 'G2', nodeCount: 3},
  {id: 'G3', nodeCount: 3},
];

function groupLocalPartitions() {
  return [1, 2, 3].map((i) => ({
    id: `p${i}`,
    replicaCount: 2,
    nodes: [`G${i}-n1`, `G${i}-n2`],
    leaderNode: `G${i}-n1`,
    pinned: true,
  }));
}

function diagonalAccess(hot = 90, cold = 5) {
  const access = [];
  for (let s = 1; s <= 3; s += 1) {
    for (let p = 1; p <= 3; p += 1) {
      access.push({
        serviceId: `s${s}`,
        partitionId: `p${p}`,
        reads: s === p ? hot : cold,
        writes: 0,
      });
    }
  }
  return access;
}

function standardWorld(seed = 11) {
  return makeAffinityWorld({
    seed,
    groups: THREE_GROUPS,
    partitions: groupLocalPartitions(),
    services: [1, 2, 3].map((i) => ({id: `s${i}`, replicaCount: 2})),
    access: diagonalAccess(),
  });
}

function fmt(value) {
  if (value === null || value === undefined) {
    return '—';
  }
  return typeof value === 'number' ? Number(value.toFixed(3)).toString() : String(value);
}

function printTable(title, columns, rows) {
  console.log(`\n## ${title}\n`);
  console.log(`| ${columns.join(' | ')} |`);
  console.log(`|${columns.map(() => '---').join('|')}|`);
  for (const row of rows) {
    console.log(`| ${columns.map((c) => fmt(row[c])).join(' | ')} |`);
  }
}

const report = {generated: 'placement-affinity-study', sweeps: {}};

// --- Sweep A: routing × wAffinity × data-spread policy ------------------------
// The routing gate binds exactly when data replicas are SPREAD across groups
// (the fault-tolerant default): then uniform routing pins readHit at the
// same-group fraction no matter where services sit. When data is group-local,
// placement alone recovers locality even under uniform routing — i.e. the
// affinity feature's value is coupled to the data spread policy.
{
  const spreadPartitionsSpec = [1, 2, 3].map((i) => ({
    id: `p${i}`,
    replicaCount: 3,
    nodes: [`G1-n${i}`, `G2-n${i}`, `G3-n${i}`],
    leaderNode: `G1-n${i}`,
    pinned: true,
  }));
  const rows = [];
  for (const dataSpread of ['spread', 'group-local']) {
    for (const routing of [ROUTING_MODEL.UNIFORM, ROUTING_MODEL.LOCALITY]) {
      for (const wAffinity of [0, 1]) {
        const world = dataSpread === 'spread' ?
          makeAffinityWorld({
            seed: 11,
            groups: THREE_GROUPS,
            partitions: spreadPartitionsSpec,
            services: [1, 2, 3].map((i) => ({id: `s${i}`, replicaCount: 2})),
            access: diagonalAccess(),
          }) :
          standardWorld();
        const optimum = optimalReadHitRate(world, {routing});
        const result = runPlacementSim(world, {
          routing,
          weights: {affinity: wAffinity, load: 0, spread: 0},
          hysteresis: {service: 0.1},
        });
        rows.push({
          dataSpread, routing, wAffinity,
          verdict: result.verdict,
          readHit: result.finalMetrics.readHitRate,
          optimum,
          moves: result.cumulativeMoves,
        });
      }
    }
  }
  printTable('A — when routing gates locality (data spread × routing × affinity)',
    ['dataSpread', 'routing', 'wAffinity', 'verdict', 'readHit', 'optimum', 'moves'],
    rows);
  report.sweeps.routingGate = rows;
}

// --- Sweep B: hysteresis × wLoad × lag (one-sided stability frontier) --------
{
  const rows = [];
  for (const hysteresis of [0, 0.05, 0.1, 0.3]) {
    for (const wLoad of [0, 0.3, 0.6]) {
      for (const lag of [0, 2, 5]) {
        const world = standardWorld();
        const result = runPlacementSim(world, {
          routing: ROUTING_MODEL.LOCALITY,
          weights: {affinity: 1, load: wLoad, spread: 0},
          hysteresis: {service: hysteresis},
          cdcLagTicks: lag,
        });
        rows.push({
          hysteresis, wLoad, lag,
          verdict: result.verdict,
          readHit: result.finalMetrics.readHitRate,
          moves: result.cumulativeMoves,
          loadStddev: result.finalMetrics.loadStddev,
        });
      }
    }
  }
  printTable('B — one-sided stability frontier (hysteresis × wLoad × cdcLag)',
    ['hysteresis', 'wLoad', 'lag', 'verdict', 'readHit', 'moves', 'loadStddev'], rows);
  report.sweeps.stabilityFrontier = rows;
}

// --- Sweep C: two-sided pursuit hysteresis matrix ----------------------------
{
  const rows = [];
  for (const hService of [0, 0.5, 2]) {
    for (const hPartition of [0, 0.5, 2]) {
      const world = makeAffinityWorld({
        seed: 1,
        groups: [{id: 'G1', nodeCount: 1}, {id: 'G2', nodeCount: 1}],
        partitions: [{id: 'p1', replicaCount: 1, nodes: ['G2-n1'], leaderNode: 'G2-n1'}],
        services: [{id: 's1', replicaCount: 1, nodes: ['G1-n1']}],
        access: [{serviceId: 's1', partitionId: 'p1', reads: 50, writes: 50}],
      });
      const result = runPlacementSim(world, {
        routing: ROUTING_MODEL.LOCALITY,
        weights: {affinity: 1, load: 0, spread: 0},
        twoSided: true,
        cadence: {service: 2, partition: 2},
        cdcLagTicks: 1,
        hysteresis: {service: hService, partition: hPartition},
      });
      rows.push({
        hService, hPartition,
        verdict: result.verdict,
        readHit: result.finalMetrics.readHitRate,
        moves: result.cumulativeMoves,
      });
    }
  }
  printTable('C — two-sided pursuit outcomes (service × partition hysteresis)',
    ['hService', 'hPartition', 'verdict', 'readHit', 'moves'], rows);
  report.sweeps.pursuitMatrix = rows;
}

// --- Sweep D: widen-vs-chase across consumer spread --------------------------
{
  const rows = [];
  for (const consumerGroups of [1, 2, 3]) {
    for (const strategy of ['chase', 'widen']) {
      const services = [];
      const access = [];
      for (let i = 1; i <= 3; i += 1) {
        const group = `G${Math.min(i, consumerGroups)}`;
        services.push({
          id: `s${i}`,
          replicaCount: 1,
          nodes: [`${group}-n${i === 1 ? 2 : i}`],
          pinned: strategy === 'widen',
        });
        access.push({serviceId: `s${i}`, partitionId: 'p1', reads: 100, writes: 0});
      }
      const world = makeAffinityWorld({
        seed: 1,
        groups: THREE_GROUPS,
        partitions: [{
          id: 'p1', replicaCount: 1, nodes: ['G1-n1'], leaderNode: 'G1-n1',
          pinned: strategy === 'chase',
        }],
        services,
        access,
      });
      const events = strategy === 'widen' ?
        [{
          atTick: 5,
          mutate: (w) => {
            w.partitions.get('p1').replicaCount = consumerGroups;
          },
        }] :
        [];
      const result = runPlacementSim(world, {
        routing: ROUTING_MODEL.LOCALITY,
        weights: {affinity: 1, load: 0, spread: 0},
        twoSided: strategy === 'widen',
        hysteresis: {service: 0.1, partition: 0.1},
      }, events);
      const final = computeMetrics(snapshotPlacement(world), world,
        {routing: ROUTING_MODEL.LOCALITY});
      rows.push({
        consumerGroups, strategy,
        verdict: result.verdict,
        readHit: final.readHitRate,
        moves: result.cumulativeMoves,
        loadStddev: final.loadStddev,
      });
    }
  }
  printTable('D — widen-vs-chase (anchored consumers spread over N groups)',
    ['consumerGroups', 'strategy', 'verdict', 'readHit', 'moves', 'loadStddev'], rows);
  report.sweeps.widenVsChase = rows;
}

// --- Sweep E: adaptation-vs-stability frontier --------------------------------
// Hysteresis damps churn (sweep B) but above the affinity gradient it stops
// tracking workload shifts. Rotate every service's hotspot at tick 10 from a
// converged start and measure recovery: the usable hysteresis band is bounded
// below by the load self-shadow and above by the affinity gradient.
{
  const rows = [];
  for (const hysteresis of [0, 0.05, 0.1, 0.3, 0.6, 0.9, 2]) {
    const world = makeAffinityWorld({
      seed: 11,
      groups: THREE_GROUPS,
      partitions: groupLocalPartitions(),
      services: [1, 2, 3].map((i) =>
        ({id: `s${i}`, replicaCount: 2, nodes: [`G${i}-n1`, `G${i}-n2`]})),
      access: diagonalAccess(),
    });
    const result = runPlacementSim(world, {
      routing: ROUTING_MODEL.LOCALITY,
      weights: {affinity: 1, load: 0.3, spread: 0},
      hysteresis: {service: hysteresis},
    }, [{
      atTick: 10,
      mutate: (w) => {
        for (const edge of w.access) {
          const s = Number(edge.serviceId.slice(1));
          const rotated = (s % 3) + 1;
          edge.reads = edge.partitionId === `p${rotated}` ? 90 : 5;
        }
      },
    }]);
    const postOptimum = optimalReadHitRate(world, {routing: ROUTING_MODEL.LOCALITY});
    const recovered = result.trace.find((entry) =>
      entry.tick > 10 && entry.readHitRate >= 0.9 * postOptimum);
    rows.push({
      hysteresis,
      verdict: result.verdict,
      postShiftHit: result.finalMetrics.readHitRate,
      postOptimum,
      recoveryTick: recovered ? recovered.tick : null,
      moves: result.cumulativeMoves,
    });
  }
  printTable('E — adaptation-vs-stability frontier (hotspot rotation at tick 10)',
    ['hysteresis', 'verdict', 'postShiftHit', 'postOptimum', 'recoveryTick', 'moves'],
    rows);
  report.sweeps.adaptationFrontier = rows;
}

const jsonFlagIndex = process.argv.indexOf('--json');
if (jsonFlagIndex !== -1) {
  const outPath = process.argv[jsonFlagIndex + 1];
  if (!outPath) {
    console.error('--json requires a path');
    process.exit(1);
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nJSON written to ${outPath}`);
}
