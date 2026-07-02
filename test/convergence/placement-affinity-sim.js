/**
 * placement-affinity-sim — a deterministic, seeded, closed-loop model of
 * service↔data affinity placement: "place service replicas as near as possible
 * to the replicas of the data they access" (the product differentiator, epic
 * solve/epics/service-data-affinity-placement.md).
 *
 * WHAT IT MODELS. Nodes belong to latency groups (group-binary distance, the
 * faithful abstraction of nodes.latency_group_id + preferSameLatencyGroup
 * ordering in query-executor-partition-routing-candidates.js). Partitions have
 * replica node-sets plus a raft leader; services have replica node-sets; an
 * access matrix A[service][partition] = {reads, writes} carries intensity.
 * Read routing is a parameter — 'uniform' (today's default: candidates in
 * snapshot order, expected distance = fraction of off-group replicas) or
 * 'locality' (the dormant preferSameLatencyGroup ordering: distance 0 iff any
 * replica shares the reader's group). Writes always go to the partition
 * leader. Service and partition planners run independently on their own
 * cadences against CDC-lagged snapshots of each other's placement — the
 * two-rebalancer reality that makes pursuit oscillation possible.
 *
 * FIDELITY BOUNDARY (honest scope — do not over-read results):
 *  - Distance is group-binary; real RTT structure inside/between groups is
 *    not modelled. Ingress (client→service) locality is OUT of scope: request
 *    volume splits evenly across a service's replicas by assumption, so
 *    readHitRate is service→data locality, not end-to-end locality.
 *  - All replicas are treated as routable (real routing excludes
 *    non-serve-ready learners); moves take a fixed opTicks, with no failure.
 *  - The planner here is a stand-in scorer shaped like the real one
 *    (placement-owner-decision.js dimensions: load, affinity, spread,
 *    incumbent hysteresis) — Tier 1b re-runs winning designs through the REAL
 *    MovePlanner kernel; this module exists to sweep designs cheaply first.
 *  - Metrics are analytic expectations (never sampled), so assertions are
 *    exact rationals; the only RNG use is initial placement (SeededRandomSource
 *    stream), never mid-run transitions — leader re-election is
 *    rank-deterministic (retain if possible, else min node id).
 *  - Unlike dt-priority-recovery-followup-stabilization-phi.test.js, NO
 *    per-step Φ monotonicity is claimed: greedy per-entity planning under CDC
 *    lag with load coupling is not a potential-game descent; verdicts come
 *    from the fixpoint/oscillation machinery below instead.
 *
 * VERDICTS. fixpoint_reached ⇔ EACH planner kind separately went quiet for
 * fixpointRounds consecutive rounds of ITS OWN cadence, every one of those
 * rounds planned against a view EQUAL to the live placement, and no op is in
 * flight. Both clauses are load-bearing: (a) a shared quiet counter lets a
 * fast-cadence planner mask a slow one's pending move (false fixpoint);
 * (b) a genuine oscillation under lag ≥ opTicks + cadence has quiet windows
 * where a stale view coincidentally satisfies every planner — quiet against a
 * stale view proves nothing.
 * oscillation_detected ⇔ the FULL transition state (placement ring buffer over
 * the lag window + relative in-flight ops + planner phases) recurs with moves
 * in between — the sim is closed and deterministic, so recurrence ⇒ cycle.
 */

import {SeededRandomSource} from '../../src/random/random-source.js';

const ROUTING_MODEL = Object.freeze({
  UNIFORM: 'uniform',
  LOCALITY: 'locality',
});

const SIM_VERDICT = Object.freeze({
  FIXPOINT: 'fixpoint_reached',
  OSCILLATION: 'oscillation_detected',
  DID_NOT_SETTLE: 'did_not_settle',
});

const ENTITY_KIND = Object.freeze({
  SERVICE: 'service',
  PARTITION: 'partition',
});

const SCORE_QUANTUM = 1e-9;

const DEFAULT_SIM_CONFIG = Object.freeze({
  routing: ROUTING_MODEL.LOCALITY,
  weights: Object.freeze({affinity: 1, load: 0, spread: 0}),
  // Minimum score improvement a challenger must show over an incumbent before
  // a move is emitted — kills zero-gain churn and float-noise ties.
  minGain: 1e-6,
  // Incumbent retention bonus per entity kind. Asymmetry (partition ≫ service)
  // IS the product thesis: data is heavy to move, services are light.
  hysteresis: Object.freeze({service: 0, partition: 0}),
  cadence: Object.freeze({service: 1, partition: 1}),
  cdcLagTicks: 0,
  opTicks: 1,
  moveBudget: Object.freeze({service: Infinity, partition: Infinity}),
  // twoSided: partitions also score affinity toward the services reading them
  // (coverage-aware). When false, partitions only plan load/spread.
  twoSided: false,
  fixpointRounds: 3,
  maxTicks: 200,
});

function mergeConfig(overrides = {}) {
  return {
    ...DEFAULT_SIM_CONFIG,
    ...overrides,
    weights: {...DEFAULT_SIM_CONFIG.weights, ...(overrides.weights || {})},
    hysteresis: {...DEFAULT_SIM_CONFIG.hysteresis, ...(overrides.hysteresis || {})},
    cadence: {...DEFAULT_SIM_CONFIG.cadence, ...(overrides.cadence || {})},
    moveBudget: {...DEFAULT_SIM_CONFIG.moveBudget, ...(overrides.moveBudget || {})},
  };
}

function quantizeScore(value) {
  return Math.round(value / SCORE_QUANTUM) * SCORE_QUANTUM;
}

function seededShuffle(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build a simulation world.
 * groups: [{id, nodeCount}] → nodes named `${groupId}-n${i}`.
 * partitions/services: [{id, replicaCount, nodes?, leaderNode?, pinned?}];
 * entities without explicit nodes get a seeded-random placement on distinct
 * nodes (the ONLY RNG consumption in the sim).
 * access: [{serviceId, partitionId, reads, writes}].
 */
function makeAffinityWorld({seed = 1, groups, partitions, services, access}) {
  const rng = new SeededRandomSource({seed});
  const nodes = [];
  for (const group of groups) {
    for (let i = 1; i <= group.nodeCount; i += 1) {
      nodes.push({id: `${group.id}-n${i}`, groupId: group.id});
    }
  }
  nodes.sort((a, b) => (a.id < b.id ? -1 : 1));
  const groupByNode = new Map(nodes.map((n) => [n.id, n.groupId]));

  const placeRandom = (replicaCount) => {
    const picked = seededShuffle(nodes.map((n) => n.id), rng).slice(0, replicaCount);
    picked.sort();
    return picked;
  };

  const world = {
    tick: 0,
    nodes,
    groupByNode,
    services: new Map(),
    partitions: new Map(),
    access: access.map((edge) => ({reads: 0, writes: 0, ...edge})),
    inFlight: [],
    history: [],
    cumulativeMoves: 0,
  };
  for (const spec of services) {
    const replicaNodes = spec.nodes ? [...spec.nodes].sort() : placeRandom(spec.replicaCount);
    world.services.set(spec.id, {
      id: spec.id,
      replicaCount: spec.replicaCount,
      nodes: replicaNodes,
      pinned: spec.pinned === true,
    });
  }
  for (const spec of partitions) {
    const replicaNodes = spec.nodes ? [...spec.nodes].sort() : placeRandom(spec.replicaCount);
    world.partitions.set(spec.id, {
      id: spec.id,
      replicaCount: spec.replicaCount,
      nodes: replicaNodes,
      leaderNode: spec.leaderNode || replicaNodes[0],
      pinned: spec.pinned === true,
    });
  }
  return world;
}

function snapshotPlacement(world) {
  const services = {};
  for (const id of [...world.services.keys()].sort()) {
    services[id] = [...world.services.get(id).nodes].sort();
  }
  const partitions = {};
  for (const id of [...world.partitions.keys()].sort()) {
    const p = world.partitions.get(id);
    partitions[id] = {nodes: [...p.nodes].sort(), leaderNode: p.leaderNode};
  }
  return {services, partitions};
}

function placementKey(snapshot) {
  return JSON.stringify(snapshot);
}

// --- analytic metrics -------------------------------------------------------

function readMissFraction(readerGroup, partitionView, groupByNode, routing) {
  const replicaGroups = partitionView.nodes.map((n) => groupByNode.get(n));
  const sameGroup = replicaGroups.filter((g) => g === readerGroup).length;
  if (routing === ROUTING_MODEL.LOCALITY) {
    return sameGroup > 0 ? 0 : 1;
  }
  return (replicaGroups.length - sameGroup) / replicaGroups.length;
}

function writeMiss(readerGroup, partitionView, groupByNode) {
  return groupByNode.get(partitionView.leaderNode) === readerGroup ? 0 : 1;
}

/**
 * Analytic (never sampled) placement-quality metrics over one placement view.
 * phiAffinity = volume-weighted expected access distance (binary d ⇒ missed
 * volume). readHitRate / writeLocality are reported separately — a spread
 * service can never write-hit more than one leader group, so folding writes
 * into one hit-rate poisons read assertions.
 */
function computeMetrics(snapshot, world, cfg) {
  const {groupByNode} = world;
  let readVolume = 0;
  let readHitVolume = 0;
  let writeVolume = 0;
  let writeHitVolume = 0;
  const nodeLoads = new Map(world.nodes.map((n) => [n.id, 0]));
  const addLoad = (nodeId, amount) => {
    nodeLoads.set(nodeId, nodeLoads.get(nodeId) + amount);
  };

  for (const edge of world.access) {
    const serviceNodes = snapshot.services[edge.serviceId];
    const partitionView = snapshot.partitions[edge.partitionId];
    if (!serviceNodes || !partitionView || serviceNodes.length === 0) {
      continue;
    }
    const share = 1 / serviceNodes.length;
    for (const serviceNode of serviceNodes) {
      const group = groupByNode.get(serviceNode);
      const reads = edge.reads * share;
      const writes = edge.writes * share;
      addLoad(serviceNode, reads + writes);
      if (reads > 0) {
        const miss = readMissFraction(group, partitionView, groupByNode, cfg.routing);
        readVolume += reads;
        readHitVolume += reads * (1 - miss);
        const sameGroupReplicas = partitionView.nodes
          .filter((n) => groupByNode.get(n) === group);
        if (cfg.routing === ROUTING_MODEL.LOCALITY && sameGroupReplicas.length > 0) {
          for (const replica of sameGroupReplicas) {
            addLoad(replica, reads / sameGroupReplicas.length);
          }
        } else {
          for (const replica of partitionView.nodes) {
            addLoad(replica, reads / partitionView.nodes.length);
          }
        }
      }
      if (writes > 0) {
        writeVolume += writes;
        writeHitVolume += writes * (1 - writeMiss(group, partitionView, groupByNode));
        addLoad(partitionView.leaderNode, writes);
      }
    }
  }

  const phiAffinity = (readVolume - readHitVolume) + (writeVolume - writeHitVolume);
  const loads = [...nodeLoads.values()];
  const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
  const variance = loads.reduce((a, b) => a + (b - mean) * (b - mean), 0) / loads.length;
  return {
    phiAffinity,
    readHitRate: readVolume > 0 ? readHitVolume / readVolume : null,
    writeLocality: writeVolume > 0 ? writeHitVolume / writeVolume : null,
    nodeLoads,
    loadStddev: Math.sqrt(variance),
    totalVolume: readVolume + writeVolume,
  };
}

// --- planner ----------------------------------------------------------------

function serviceAffinityCost(group, service, snapshot, world, cfg) {
  let cost = 0;
  let volume = 0;
  for (const edge of world.access) {
    if (edge.serviceId !== service.id) {
      continue;
    }
    const partitionView = snapshot.partitions[edge.partitionId];
    if (!partitionView) {
      continue;
    }
    cost += edge.reads * readMissFraction(group, partitionView, world.groupByNode, cfg.routing);
    cost += edge.writes * writeMiss(group, partitionView, world.groupByNode);
    volume += edge.reads + edge.writes;
  }
  return volume > 0 ? cost / volume : 0;
}

/**
 * Partition-side affinity is a COVERAGE objective over consumer groups, not a
 * sum of independent per-replica terms — scoring nodes independently would
 * stack every widened replica into the single hottest consumer group. So the
 * cost of a candidate is evaluated for the SET picked-so-far ∪ {candidate}
 * (sequential marginal greedy over a submodular coverage function).
 */
function partitionSetAffinityCost(candidateSet, partition, snapshot, world, cfg) {
  const {groupByNode} = world;
  const readVolByGroup = new Map();
  const writeVolByGroup = new Map();
  let volume = 0;
  for (const edge of world.access) {
    if (edge.partitionId !== partition.id) {
      continue;
    }
    const serviceNodes = snapshot.services[edge.serviceId];
    if (!serviceNodes || serviceNodes.length === 0) {
      continue;
    }
    const share = 1 / serviceNodes.length;
    for (const serviceNode of serviceNodes) {
      const group = groupByNode.get(serviceNode);
      readVolByGroup.set(group, (readVolByGroup.get(group) || 0) + edge.reads * share);
      writeVolByGroup.set(group, (writeVolByGroup.get(group) || 0) + edge.writes * share);
      volume += (edge.reads + edge.writes) * share;
    }
  }
  if (volume === 0) {
    return 0;
  }
  const view = {
    nodes: candidateSet,
    leaderNode: candidateSet.includes(partition.leaderNode) ?
      partition.leaderNode :
      [...candidateSet].sort()[0],
  };
  let cost = 0;
  for (const [group, vol] of readVolByGroup) {
    cost += vol * readMissFraction(group, view, groupByNode, cfg.routing);
  }
  for (const [group, vol] of writeVolByGroup) {
    cost += vol * writeMiss(group, view, groupByNode);
  }
  return cost / volume;
}

function effectiveOwnNodes(kind, entity, world) {
  // In-flight-aware self-accounting (mirrors the real kernel's
  // countPriorityRecoveryFollowUpInFlightAdds discipline): a planner sees its
  // own committed replicas ADJUSTED by its own in-flight ops, or it re-emits
  // duplicate moves every round while an op is still landing.
  let nodes = [...entity.nodes];
  for (const op of world.inFlight) {
    if (op.entityKind !== kind || op.entityId !== entity.id) {
      continue;
    }
    if (op.fromNode !== null) {
      nodes = nodes.filter((n) => n !== op.fromNode);
    }
    if (op.toNode !== null && !nodes.includes(op.toNode)) {
      nodes.push(op.toNode);
    }
  }
  return nodes.sort();
}

/**
 * Sequential greedy target selection for one entity against a FROZEN view.
 * score(node) = wLoad·normLoad + wAffinity·affinityCost + wSpread·sameGroupPicked
 *             − hysteresis[kind]·isIncumbent, quantized; ties break by node id.
 * An incumbent within minGain of the best challenger is retained (no zero-gain
 * churn). Replicas of one entity occupy distinct nodes.
 */
function planEntityTarget(kind, entity, viewSnapshot, viewLoads, own, world, cfg) {
  const {weights, hysteresis} = cfg;
  const ownSet = new Set(own);
  const picked = [];
  const pickedGroups = new Map();
  while (picked.length < entity.replicaCount && picked.length < world.nodes.length) {
    let best = null;
    let bestIncumbent = null;
    for (const node of world.nodes) {
      if (picked.includes(node.id)) {
        continue;
      }
      let affinity = 0;
      if (weights.affinity !== 0) {
        affinity = kind === ENTITY_KIND.SERVICE ?
          serviceAffinityCost(node.groupId, entity, viewSnapshot, world, cfg) :
          partitionSetAffinityCost([...picked, node.id], entity, viewSnapshot, world, cfg);
      }
      const load = weights.load !== 0 && viewLoads.totalVolume > 0 ?
        viewLoads.nodeLoads.get(node.id) / viewLoads.totalVolume :
        0;
      const spread = (pickedGroups.get(node.groupId) || 0) / Math.max(1, entity.replicaCount);
      const isIncumbent = ownSet.has(node.id);
      const score = quantizeScore(
        weights.load * load +
          weights.affinity * affinity +
          weights.spread * spread -
          (isIncumbent ? hysteresis[kind] : 0),
      );
      const candidate = {id: node.id, groupId: node.groupId, score, isIncumbent};
      if (best === null || score < best.score || (score === best.score && node.id < best.id)) {
        best = candidate;
      }
      if (isIncumbent && (bestIncumbent === null || score < bestIncumbent.score ||
          (score === bestIncumbent.score && node.id < bestIncumbent.id))) {
        bestIncumbent = candidate;
      }
    }
    if (best === null) {
      break;
    }
    let choice = best;
    if (!best.isIncumbent && bestIncumbent !== null &&
        bestIncumbent.score <= best.score + cfg.minGain) {
      choice = bestIncumbent;
    }
    picked.push(choice.id);
    pickedGroups.set(choice.groupId, (pickedGroups.get(choice.groupId) || 0) + 1);
  }
  return picked.sort();
}

function diffToMoves(kind, entityId, own, target) {
  const ownSet = new Set(own);
  const targetSet = new Set(target);
  const removed = own.filter((n) => !targetSet.has(n)).sort();
  const added = target.filter((n) => !ownSet.has(n)).sort();
  const moves = [];
  const pairCount = Math.min(removed.length, added.length);
  for (let i = 0; i < pairCount; i += 1) {
    moves.push({entityKind: kind, entityId, fromNode: removed[i], toNode: added[i]});
  }
  for (let i = pairCount; i < added.length; i += 1) {
    moves.push({entityKind: kind, entityId, fromNode: null, toNode: added[i]});
  }
  for (let i = pairCount; i < removed.length; i += 1) {
    moves.push({entityKind: kind, entityId, fromNode: removed[i], toNode: null});
  }
  return moves;
}

// --- world transitions ------------------------------------------------------

// Precondition: no two in-flight ops of one entity share a toNode (the planner
// cannot emit that; hand-injected world.inFlight in a scenario event could, and
// would silently under-replicate because the second add finds the node present).
function landDueOps(world) {
  const remaining = [];
  for (const op of world.inFlight) {
    if (op.landsAtTick > world.tick) {
      remaining.push(op);
      continue;
    }
    const registry = op.entityKind === ENTITY_KIND.SERVICE ? world.services : world.partitions;
    const entity = registry.get(op.entityId);
    if (!entity) {
      continue;
    }
    let nodes = [...entity.nodes];
    if (op.fromNode !== null) {
      nodes = nodes.filter((n) => n !== op.fromNode);
    }
    if (op.toNode !== null && !nodes.includes(op.toNode)) {
      nodes.push(op.toNode);
    }
    entity.nodes = nodes.sort();
    if (op.entityKind === ENTITY_KIND.PARTITION && !entity.nodes.includes(entity.leaderNode)) {
      // Rank-deterministic re-election (retain-else-min-id): keeps the RNG out
      // of transitions so the full-state signature stays sound.
      entity.leaderNode = entity.nodes[0];
    }
  }
  world.inFlight = remaining;
}

function transitionSignature(world, cfg) {
  const lag = Math.max(0, cfg.cdcLagTicks);
  const ring = [];
  for (let t = world.tick - lag; t <= world.tick; t += 1) {
    ring.push(placementKey(world.history[Math.max(0, t)]));
  }
  const inFlight = world.inFlight
    .map((op) => ({
      entityKind: op.entityKind,
      entityId: op.entityId,
      fromNode: op.fromNode,
      toNode: op.toNode,
      landsIn: op.landsAtTick - world.tick,
    }))
    .sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  return JSON.stringify({
    ring,
    inFlight,
    phase: [world.tick % cfg.cadence.service, world.tick % cfg.cadence.partition],
  });
}

/**
 * Run the closed plan→apply→replan loop. Per tick: apply due scenario events →
 * land due in-flight ops → snapshot → (on each planner's cadence) plan every
 * unpinned entity of that kind against the FROZEN cdcLag-old view (all planners
 * in a round see the same view; moves enqueue only after the whole round) →
 * record metrics → verdict checks.
 *
 * events: [{atTick, mutate(world)}] — deterministic scenario actions (leader
 * flip, replicaCount widen, access shift).
 */
function runPlacementSim(world, overrides = {}, events = []) {
  const cfg = mergeConfig(overrides);
  const trace = [];
  const signatureFirstMoves = new Map();
  // Verdicts are deferred until every scheduled scenario event has fired — a
  // pre-event fixpoint would end the run before the event it exists to test.
  const lastEventTick = events.reduce((max, e) => Math.max(max, e.atTick), -1);
  // Quiet is tracked PER PLANNER KIND: one shared counter lets a fast-cadence
  // planner's quiet rounds mask a slow-cadence planner's still-pending move —
  // a false fixpoint (caught by adversarial verification; regression scenario
  // in the test file pins it).
  const quietRounds = {service: 0, partition: 0};
  let verdict = SIM_VERDICT.DID_NOT_SETTLE;
  let verdictAtTick = null;

  for (let tick = 0; tick <= cfg.maxTicks; tick += 1) {
    world.tick = tick;
    for (const event of events) {
      if (event.atTick === tick) {
        event.mutate(world);
        quietRounds.service = 0;
        quietRounds.partition = 0;
        signatureFirstMoves.clear();
      }
    }
    landDueOps(world);
    world.history[tick] = snapshotPlacement(world);

    const viewTick = Math.max(0, tick - cfg.cdcLagTicks);
    const viewSnapshot = world.history[viewTick];
    const viewLoads = computeMetrics(viewSnapshot, world, cfg);
    const serviceRound = tick % cfg.cadence.service === 0;
    const partitionRound = tick % cfg.cadence.partition === 0;
    const roundMoves = [];
    const movesByKind = {service: 0, partition: 0};
    const planKind = (kind, registry, planAffinity) => {
      const budget = cfg.moveBudget[kind];
      const kindMoves = [];
      for (const id of [...registry.keys()].sort()) {
        const entity = registry.get(id);
        if (entity.pinned) {
          continue;
        }
        const kindCfg = planAffinity ?
          cfg :
          {...cfg, weights: {...cfg.weights, affinity: 0}};
        const own = effectiveOwnNodes(kind, entity, world);
        const target =
          planEntityTarget(kind, entity, viewSnapshot, viewLoads, own, world, kindCfg);
        kindMoves.push(...diffToMoves(kind, id, own, target));
      }
      const kept = kindMoves.slice(0, budget === Infinity ? undefined : budget);
      movesByKind[kind] = kept.length;
      roundMoves.push(...kept);
    };
    if (serviceRound) {
      planKind(ENTITY_KIND.SERVICE, world.services, true);
    }
    if (partitionRound) {
      planKind(ENTITY_KIND.PARTITION, world.partitions, cfg.twoSided);
    }
    for (const move of roundMoves) {
      world.inFlight.push({...move, landsAtTick: tick + Math.max(1, cfg.opTicks)});
    }
    world.cumulativeMoves += roundMoves.length;

    const metrics = computeMetrics(world.history[tick], world, cfg);
    trace.push({
      tick,
      phiAffinity: metrics.phiAffinity,
      readHitRate: metrics.readHitRate,
      writeLocality: metrics.writeLocality,
      loadStddev: metrics.loadStddev,
      movesEmitted: roundMoves.length,
      cumulativeMoves: world.cumulativeMoves,
    });

    // Quiet only counts when this round's PLANNING VIEW equals the live
    // placement: quiet against a stale view is a false signal (the false-
    // fixpoint regression scenario exists to keep this clause honest).
    const viewWasLive =
      placementKey(viewSnapshot) === placementKey(world.history[tick]);
    if (serviceRound) {
      quietRounds.service =
        movesByKind.service === 0 && viewWasLive ? quietRounds.service + 1 : 0;
    }
    if (partitionRound) {
      quietRounds.partition =
        movesByKind.partition === 0 && viewWasLive ? quietRounds.partition + 1 : 0;
    }
    if (tick <= lastEventTick) {
      continue;
    }
    if (quietRounds.service >= cfg.fixpointRounds &&
        quietRounds.partition >= cfg.fixpointRounds &&
        world.inFlight.length === 0) {
      verdict = SIM_VERDICT.FIXPOINT;
      verdictAtTick = tick;
      break;
    }
    const signature = transitionSignature(world, cfg);
    if (signatureFirstMoves.has(signature)) {
      if (world.cumulativeMoves > signatureFirstMoves.get(signature)) {
        verdict = SIM_VERDICT.OSCILLATION;
        verdictAtTick = tick;
        break;
      }
    } else {
      signatureFirstMoves.set(signature, world.cumulativeMoves);
    }
  }

  return {
    verdict,
    verdictAtTick,
    trace,
    finalMetrics: trace[trace.length - 1],
    cumulativeMoves: world.cumulativeMoves,
    finalPlacement: snapshotPlacement(world),
  };
}

// --- analytic optimum (for relative, non-rigged assertions) ------------------

function combinationsWithRepetition(items, count) {
  if (count === 0) {
    return [[]];
  }
  const out = [];
  items.forEach((item, index) => {
    for (const rest of combinationsWithRepetition(items.slice(index), count - 1)) {
      out.push([item, ...rest]);
    }
  });
  return out;
}

/**
 * Brute-force optimal readHitRate for a FIXED partition placement: per-service
 * read hit rate depends only on that service's own replica group multiset, so
 * the optimum decomposes per service. Group multiplicity is capped by that
 * group's node count (replicas need distinct nodes).
 */
function optimalReadHitRate(world, overrides = {}) {
  const cfg = mergeConfig(overrides);
  const snapshot = snapshotPlacement(world);
  const groupIds = [...new Set(world.nodes.map((n) => n.groupId))].sort();
  const groupCapacity = new Map(groupIds.map((g) =>
    [g, world.nodes.filter((n) => n.groupId === g).length]));
  let totalReadVolume = 0;
  let totalBestHit = 0;
  for (const id of [...world.services.keys()].sort()) {
    const service = world.services.get(id);
    const edges = world.access.filter((e) => e.serviceId === id && e.reads > 0);
    const readVolume = edges.reduce((a, e) => a + e.reads, 0);
    if (readVolume === 0) {
      continue;
    }
    totalReadVolume += readVolume;
    let best = 0;
    for (const combo of combinationsWithRepetition(groupIds, service.replicaCount)) {
      const counts = new Map();
      for (const g of combo) {
        counts.set(g, (counts.get(g) || 0) + 1);
      }
      if ([...counts].some(([g, c]) => c > groupCapacity.get(g))) {
        continue;
      }
      let hit = 0;
      for (const edge of edges) {
        const partitionView = snapshot.partitions[edge.partitionId];
        const share = edge.reads / service.replicaCount;
        for (const group of combo) {
          const miss = readMissFraction(group, partitionView, world.groupByNode, cfg.routing);
          hit += share * (1 - miss);
        }
      }
      best = Math.max(best, hit);
    }
    totalBestHit += best;
  }
  return totalReadVolume > 0 ? totalBestHit / totalReadVolume : null;
}

export {
  ROUTING_MODEL,
  SIM_VERDICT,
  makeAffinityWorld,
  snapshotPlacement,
  computeMetrics,
  runPlacementSim,
  optimalReadHitRate,
};
