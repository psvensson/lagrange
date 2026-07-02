import t from 'tap';
import {
  ROUTING_MODEL,
  SIM_VERDICT,
  makeAffinityWorld,
  snapshotPlacement,
  computeMetrics,
  runPlacementSim,
  optimalReadHitRate,
} from './placement-affinity-sim.js';

// ---------------------------------------------------------------------------
// Deterministic scenario suite for the service↔data affinity placement model
// (epic: solve/epics/service-data-affinity-placement.md; module header in
// placement-affinity-sim.js states the fidelity boundary — read it first).
//
// The scenarios pin the design claims that must survive before any DATA_AFFINITY
// dimension is written into the real placement kernel (Tier 1b):
//   1. ROUTING IS THE GATE (prerequisite #0): under today's uniform read
//      routing the read-locality observable is a constant of the topology —
//      NO placement, and no affinity weight, can move it; enabling locality
//      routing moves it to 1.0 with no placement change at all.
//   2. With locality routing, the affinity planner converges to a fixpoint at
//      ≥90% of the brute-forced optimal read hit rate across a cadence/lag/
//      load-weight/access-shape grid — asserted RELATIVELY to the optimum so
//      load-vs-affinity tension is not papered over with magic weights.
//   3. Red-line (in-sim red-on-revert): same world, same seed, wAffinity 0 vs 1
//      — the affinity term is load-bearing for the locality outcome.
//   4. Two-sided pursuit: service and partition planners chasing each other on
//      CDC-lagged views oscillate forever without hysteresis; SYMMETRIC
//      hysteresis freezes them (stable but useless, hit rate 0); ASYMMETRIC
//      movement cost (data heavy, service light — the product thesis) converges
//      in one move to full locality.
//   5. False-fixpoint regression: with cdcLag ≥ opTicks + cadence a genuine
//      oscillation has quiet stale-view windows; the verdict machinery must
//      report oscillation, never fixpoint.
//   6. Write-heavy affinity chases the LEADER's group (not "any replica"), and
//      re-converges after a deterministic leader flip.
//   7. Anchored consumers in many groups: chasing caps at the same-group
//      fraction; widening the hot partition's replica set (coverage-aware
//      greedy) reaches hit rate 1.0 with exactly (#consumerGroups − 1) adds.
// ---------------------------------------------------------------------------

const THREE_GROUPS = [
  {id: 'G1', nodeCount: 3},
  {id: 'G2', nodeCount: 3},
  {id: 'G3', nodeCount: 3},
];

// Partitions with one replica in every group: the topology where uniform
// routing's hit rate is a placement-independent constant (1/3).
function spreadPartitions() {
  return [1, 2, 3].map((i) => ({
    id: `p${i}`,
    replicaCount: 3,
    nodes: [`G1-n${i}`, `G2-n${i}`, `G3-n${i}`],
    leaderNode: `G1-n${i}`,
    pinned: true,
  }));
}

// Group-local partitions (all replicas in one home group): the topology where
// placement actually determines locality, used by the planner scenarios.
function groupLocalPartitions() {
  return [1, 2, 3].map((i) => ({
    id: `p${i}`,
    replicaCount: 2,
    nodes: [`G${i}-n1`, `G${i}-n2`],
    leaderNode: `G${i}-n1`,
    pinned: true,
  }));
}

// Diagonal-hot access: service si is hot on its home partition pi.
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

// Deterministic zipf-ish shape: service si ranks partitions by rotation.
function zipfAccess() {
  const weights = [60, 30, 10];
  const access = [];
  for (let s = 1; s <= 3; s += 1) {
    for (let offset = 0; offset < 3; offset += 1) {
      const p = ((s - 1 + offset) % 3) + 1;
      access.push({serviceId: `s${s}`, partitionId: `p${p}`, reads: weights[offset], writes: 0});
    }
  }
  return access;
}

function traceComment(t, result, label) {
  const last = result.finalMetrics;
  t.comment(
    `${label}: verdict=${result.verdict}@${result.verdictAtTick} ` +
      `moves=${result.cumulativeMoves} readHit=${last.readHitRate} ` +
      `writeLoc=${last.writeLocality} phi=${last.phiAffinity}`,
  );
}

t.test('prerequisite #0 — routing, not placement, gates read locality', async (t) => {
  const build = (seed) => makeAffinityWorld({
    seed,
    groups: THREE_GROUPS,
    partitions: spreadPartitions(),
    services: [{id: 's1', replicaCount: 3}],
    access: [1, 2, 3].map((i) =>
      ({serviceId: 's1', partitionId: `p${i}`, reads: 100, writes: 0})),
  });

  // Any seeded placement: uniform routing pins the hit rate at exactly the
  // same-group replica fraction (1/3); locality routing yields 1.0 — both
  // placement-independent in this spread topology.
  for (const seed of [1, 7, 42]) {
    const world = build(seed);
    const snapshot = snapshotPlacement(world);
    const uniform = computeMetrics(snapshot, world, {routing: ROUTING_MODEL.UNIFORM});
    const locality = computeMetrics(snapshot, world, {routing: ROUTING_MODEL.LOCALITY});
    t.ok(Math.abs(uniform.readHitRate - 1 / 3) < 1e-9,
      `seed ${seed}: uniform routing hit rate is exactly 1/3 (got ${uniform.readHitRate})`);
    t.ok(Math.abs(locality.readHitRate - 1) < 1e-9,
      `seed ${seed}: locality routing hit rate is exactly 1.0 with the SAME placement`);
  }

  // An affinity-driven planner run under uniform routing: every candidate node
  // scores identically, so the minGain guard retains incumbents — zero moves,
  // hit rate still 1/3. Placement cannot fix routing, and the planner knows it.
  const world = build(1);
  const result = runPlacementSim(world, {
    routing: ROUTING_MODEL.UNIFORM,
    weights: {affinity: 1, load: 0, spread: 0},
  });
  traceComment(t, result, 'uniform+affinity');
  t.equal(result.verdict, SIM_VERDICT.FIXPOINT, 'uniform+affinity run reaches a fixpoint');
  t.equal(result.cumulativeMoves, 0,
    'affinity placement emits ZERO moves under uniform routing (no zero-gain churn)');
  t.ok(Math.abs(result.finalMetrics.readHitRate - 1 / 3) < 1e-9,
    'hit rate stays at the 1/3 routing floor regardless of affinity weight');
});

t.test('locality routing: affinity planner reaches ≥90% of optimal across the ' +
  'cadence/lag/load/shape grid', async (t) => {
  const cells = [];
  for (const cadence of [1, 3]) {
    for (const lag of [0, 2]) {
      for (const wLoad of [0, 0.3]) {
        cells.push({cadence, lag, wLoad, shape: 'diagonal'});
      }
    }
  }
  cells.push({cadence: 1, lag: 0, wLoad: 0, shape: 'zipf'});
  cells.push({cadence: 3, lag: 2, wLoad: 0.3, shape: 'zipf'});

  for (const cell of cells) {
    const label = `cadence=${cell.cadence} lag=${cell.lag} wLoad=${cell.wLoad} ` +
      `shape=${cell.shape}`;
    const world = makeAffinityWorld({
      seed: 11,
      groups: THREE_GROUPS,
      partitions: groupLocalPartitions(),
      services: [1, 2, 3].map((i) => ({id: `s${i}`, replicaCount: 2})),
      access: cell.shape === 'diagonal' ? diagonalAccess() : zipfAccess(),
    });
    const initialPhi = computeMetrics(snapshotPlacement(world), world,
      {routing: ROUTING_MODEL.LOCALITY}).phiAffinity;
    const optimum = optimalReadHitRate(world, {routing: ROUTING_MODEL.LOCALITY});
    const result = runPlacementSim(world, {
      routing: ROUTING_MODEL.LOCALITY,
      weights: {affinity: 1, load: cell.wLoad, spread: 0},
      // Load coupling needs hysteresis ≥ the entity's own load shadow (its
      // compute follows every hop) or the planner churns — see the dedicated
      // load-self-shadow scenario below. 0.1 ≫ the ~0.05 shadow here and ≪ the
      // 0.85 affinity gradient, so it damps churn without blocking convergence.
      hysteresis: {service: 0.1},
      cadence: {service: cell.cadence, partition: cell.cadence},
      cdcLagTicks: cell.lag,
    });
    traceComment(t, result, label);
    t.equal(result.verdict, SIM_VERDICT.FIXPOINT, `${label}: fixpoint reached`);
    t.ok(result.finalMetrics.readHitRate >= 0.9 * optimum,
      `${label}: hit ${result.finalMetrics.readHitRate} ≥ 90% of optimum ${optimum}`);
    t.ok(result.cumulativeMoves <= 12,
      `${label}: bounded moves (${result.cumulativeMoves} ≤ 12, no churn/duplicates)`);
    if (cell.wLoad === 0) {
      t.ok(result.finalMetrics.phiAffinity <= initialPhi,
        `${label}: Φ_final ${result.finalMetrics.phiAffinity} ≤ Φ_initial ${initialPhi}`);
    }
  }
});

t.test('load self-shadow: load-coupled scoring without hysteresis churns — the ' +
  'replica hops nodes chasing the least-loaded one while its own load follows it',
async (t) => {
  const world = makeAffinityWorld({
    seed: 11,
    groups: THREE_GROUPS,
    partitions: groupLocalPartitions(),
    services: [1, 2, 3].map((i) => ({id: `s${i}`, replicaCount: 2})),
    access: diagonalAccess(),
  });
  const result = runPlacementSim(world, {
    routing: ROUTING_MODEL.LOCALITY,
    weights: {affinity: 1, load: 0.3, spread: 0},
    hysteresis: {service: 0},
  });
  traceComment(t, result, 'wLoad=0.3 hysteresis=0');
  t.equal(result.verdict, SIM_VERDICT.OSCILLATION,
    'zero-hysteresis load coupling is a limit cycle even for ONE-SIDED planning ' +
      '(an affinity dimension must ship with an in-score movement cost)');
  t.equal(result.finalMetrics.readHitRate, 0.9,
    'the churn is intra-group musical chairs: locality holds while placement thrashes');
});

t.test('red-line: the affinity term is load-bearing (wAffinity 0 vs 1 differential)',
  async (t) => {
    const run = (wAffinity) => {
      const world = makeAffinityWorld({
        seed: 11,
        groups: THREE_GROUPS,
        partitions: groupLocalPartitions(),
        services: [1, 2, 3].map((i) => ({id: `s${i}`, replicaCount: 2})),
        access: diagonalAccess(),
      });
      return runPlacementSim(world, {
        routing: ROUTING_MODEL.LOCALITY,
        weights: {affinity: wAffinity, load: 0.3, spread: 0},
        hysteresis: {service: 0.1},
      });
    };
    const withAffinity = run(1);
    const withoutAffinity = run(0);
    traceComment(t, withAffinity, 'wAffinity=1');
    traceComment(t, withoutAffinity, 'wAffinity=0');
    const separation =
        withAffinity.finalMetrics.readHitRate - withoutAffinity.finalMetrics.readHitRate;
    t.ok(separation >= 0.4,
      'same world+seed, affinity on-vs-off separates read hit rate by ≥0.4 ' +
          `(got ${separation})`);
  });

t.test('two-sided pursuit under CDC lag: oscillation without hysteresis; symmetric ' +
  'hysteresis freezes; asymmetric (data-heavy) converges', async (t) => {
  const build = () => makeAffinityWorld({
    seed: 1,
    groups: [{id: 'G1', nodeCount: 1}, {id: 'G2', nodeCount: 1}],
    partitions: [{id: 'p1', replicaCount: 1, nodes: ['G2-n1'], leaderNode: 'G2-n1'}],
    services: [{id: 's1', replicaCount: 1, nodes: ['G1-n1']}],
    access: [{serviceId: 's1', partitionId: 'p1', reads: 50, writes: 50}],
  });
  const base = {
    routing: ROUTING_MODEL.LOCALITY,
    weights: {affinity: 1, load: 0, spread: 0},
    twoSided: true,
    cadence: {service: 2, partition: 2},
    cdcLagTicks: 1,
    opTicks: 1,
  };

  const pursuit = runPlacementSim(build(), base);
  traceComment(t, pursuit, 'no hysteresis');
  t.equal(pursuit.verdict, SIM_VERDICT.OSCILLATION,
    'mutual chase on lagged views is a permanent swap cycle (full-state recurrence)');

  const frozen = runPlacementSim(build(),
    {...base, hysteresis: {service: 2, partition: 2}});
  traceComment(t, frozen, 'symmetric hysteresis');
  t.equal(frozen.verdict, SIM_VERDICT.FIXPOINT, 'symmetric hysteresis reaches a fixpoint');
  t.equal(frozen.cumulativeMoves, 0, 'symmetric hysteresis freezes both entities');
  t.equal(frozen.finalMetrics.readHitRate, 0,
    'frozen ≠ good: locality stays 0 — stability bought by giving up the objective');

  const asymmetric = runPlacementSim(build(),
    {...base, hysteresis: {service: 0, partition: 2}});
  traceComment(t, asymmetric, 'asymmetric hysteresis');
  t.equal(asymmetric.verdict, SIM_VERDICT.FIXPOINT,
    'data-heavy/service-light movement cost converges (the product thesis)');
  t.equal(asymmetric.cumulativeMoves, 1, 'exactly one move: the service goes to the data');
  t.equal(asymmetric.finalMetrics.readHitRate, 1, 'full read locality after convergence');
  t.equal(asymmetric.finalMetrics.writeLocality, 1, 'and full write (leader) locality');
});

t.test('false-fixpoint regression: cdcLag ≥ opTicks + cadence must report ' +
  'oscillation, never fixpoint', async (t) => {
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
    cdcLagTicks: 6,
    opTicks: 1,
  });
  traceComment(t, result, 'lag=6');
  t.equal(result.verdict, SIM_VERDICT.OSCILLATION,
    'quiet stale-view windows inside a real oscillation must not fake a fixpoint ' +
      '(the view==live clause blocks the false verdict; recurrence then proves the cycle)');
});

t.test('mismatched-cadence regression: a fast planner\'s quiet rounds must not mask ' +
  'a slow planner\'s pending move (per-kind quiet tracking)', async (t) => {
  // Pinned service (always quiet, cadence 1) + two mis-placed partitions on a
  // budget of 1 (cadence 5): p2's move can only happen at the partition round
  // at t5. A shared quiet counter reaches fixpointRounds on service rounds
  // t1–t3 and declares a FALSE fixpoint before t5; per-kind tracking waits.
  const world = makeAffinityWorld({
    seed: 1,
    groups: [{id: 'G1', nodeCount: 4}, {id: 'G2', nodeCount: 4}],
    partitions: [
      {id: 'p1', replicaCount: 1, nodes: ['G2-n1'], leaderNode: 'G2-n1'},
      {id: 'p2', replicaCount: 1, nodes: ['G2-n2'], leaderNode: 'G2-n2'},
    ],
    services: [{id: 's1', replicaCount: 1, nodes: ['G1-n1'], pinned: true}],
    access: [
      {serviceId: 's1', partitionId: 'p1', reads: 100, writes: 0},
      {serviceId: 's1', partitionId: 'p2', reads: 100, writes: 0},
    ],
  });
  const result = runPlacementSim(world, {
    routing: ROUTING_MODEL.LOCALITY,
    weights: {affinity: 1, load: 0, spread: 0},
    twoSided: true,
    cadence: {service: 1, partition: 5},
    moveBudget: {partition: 1},
  });
  traceComment(t, result, 'cadence 1/5, budget 1');
  t.equal(result.verdict, SIM_VERDICT.FIXPOINT, 'eventually a real fixpoint');
  t.equal(result.cumulativeMoves, 2,
    'BOTH partitions moved to the consumer group — the t5 budgeted move was not ' +
      'cut off by a false fixpoint on service-round quiet');
  t.ok(result.verdictAtTick >= 5 + 3 * 5,
    `fixpoint waits for ${3} quiet PARTITION rounds after the t5 move ` +
      `(verdict at ${result.verdictAtTick})`);
  t.equal(result.finalMetrics.readHitRate, 1, 'full locality once both moves land');
});

t.test('write-heavy affinity chases the LEADER group and re-converges on leader flip',
  async (t) => {
    const world = makeAffinityWorld({
      seed: 1,
      groups: [{id: 'G1', nodeCount: 2}, {id: 'G2', nodeCount: 2}],
      partitions: [{
        id: 'p1', replicaCount: 2, nodes: ['G1-n1', 'G2-n1'], leaderNode: 'G1-n1',
        pinned: true,
      }],
      services: [{id: 's1', replicaCount: 1, nodes: ['G2-n2']}],
      access: [{serviceId: 's1', partitionId: 'p1', reads: 0, writes: 100}],
    });
    const result = runPlacementSim(world, {
      routing: ROUTING_MODEL.LOCALITY,
      weights: {affinity: 1, load: 0, spread: 0},
    }, [{
      atTick: 10,
      mutate: (w) => {
        w.partitions.get('p1').leaderNode = 'G2-n1';
      },
    }]);
    traceComment(t, result, 'leader-chase');
    t.equal(result.verdict, SIM_VERDICT.FIXPOINT, 'fixpoint after the flip');
    t.equal(result.finalMetrics.writeLocality, 1,
      'service sits in the leader group after the flip (write affinity is ' +
          'leader-bound, not any-replica-bound)');
    t.equal(result.cumulativeMoves, 2,
      'exactly two moves: converge to G1 leader, re-converge to G2 after the flip');
  });

t.test('anchored consumers: chasing caps at the same-group fraction; widening the ' +
  'partition covers every consumer group with exactly (#groups − 1) adds', async (t) => {
  const world = makeAffinityWorld({
    seed: 1,
    groups: THREE_GROUPS,
    partitions: [{id: 'p1', replicaCount: 1, nodes: ['G1-n1'], leaderNode: 'G1-n1'}],
    services: [
      {id: 's1', replicaCount: 1, nodes: ['G1-n2'], pinned: true},
      {id: 's2', replicaCount: 1, nodes: ['G2-n1'], pinned: true},
      {id: 's3', replicaCount: 1, nodes: ['G3-n1'], pinned: true},
    ],
    access: [1, 2, 3].map((i) =>
      ({serviceId: `s${i}`, partitionId: 'p1', reads: 100, writes: 0})),
  });
  const preWiden = [];
  const result = runPlacementSim(world, {
    routing: ROUTING_MODEL.LOCALITY,
    weights: {affinity: 1, load: 0, spread: 0},
    twoSided: true,
  }, [{
    atTick: 10,
    mutate: (w) => {
      preWiden.push(computeMetrics(snapshotPlacement(w), w,
        {routing: ROUTING_MODEL.LOCALITY}).readHitRate);
      preWiden.push(w.cumulativeMoves);
      w.partitions.get('p1').replicaCount = 3;
    },
  }]);
  traceComment(t, result, 'widen');
  t.ok(Math.abs(preWiden[0] - 1 / 3) < 1e-9,
    'before widening, pinned consumers cap locality at the same-group fraction 1/3');
  t.equal(preWiden[1], 0, 'chasing cannot act (consumers pinned, replica has no better ' +
      'single group) — zero moves before the widen event');
  t.equal(result.verdict, SIM_VERDICT.FIXPOINT, 'fixpoint after widening');
  t.equal(result.finalMetrics.readHitRate, 1,
    'coverage-aware greedy places the two new replicas in the two uncovered groups');
  t.equal(result.cumulativeMoves - preWiden[1], 2,
    'exactly (#consumerGroups − 1) = 2 replica adds — a bounded one-time cost');
});
