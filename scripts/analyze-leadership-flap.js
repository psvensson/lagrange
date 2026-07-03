#!/usr/bin/env node
/**
 * Leadership-flap attribution census (quest leadership-flap-attribution-census).
 *
 * Read-only analyzer over the retained rolling-restart playback corpus
 * (`test-output/reports/.playback/<runKey>/rolling-restart/`). For every
 * leadership owner-map flip observed across snapshots.ndjson frames it decides
 * whether the flip is explained by the DELIBERATE succession machinery (R1/R3
 * REPLACE handoffs) or looks like a SPONTANEOUS raft timer election — the
 * attribution datum the candidacy-reluctance / pre-vote levers depend on.
 *
 * Classification per flip (partition P changed leader from -> to inside the
 * frame interval, joined against replica_operations rows within --window ms):
 *   DELIBERATE_REPLACEMENT          an active REPLACE on P targets the gaining
 *                                   node (the replacement-election path elects
 *                                   the REPLACE target)
 *   COUNTER_DELIBERATE_REGAIN       an active REPLACE/REMOVE on P drains the
 *                                   GAINING node — leadership came back to the
 *                                   very node being unloaded (nothing
 *                                   deliberate elects the drain source)
 *   DELIBERATE_STEPDOWN_SUCCESSION  an active REPLACE/REMOVE on P drains the
 *                                   LOSING node (leader handoff fallout; any
 *                                   peer may win the succession election)
 *   AMBIGUOUS                       REPLACE/REMOVE ops are active on P but
 *                                   neither geometry matches the flip
 *   SPONTANEOUS_LIKELY              no REPLACE/REMOVE active on P in the join
 *                                   window — only a timer election explains it
 *
 * Bootstrap vacancy fills (from == null: a partition's FIRST leader) are
 * tagged fromNull and excluded from the drain-source / restart-node
 * aggregates — a first election is not a flap.
 *
 * HONEST LIMITS (stated in the verdict artifact): flips are observed at
 * snapshot resolution (~3s; multiple flips inside one interval are invisible),
 * attribution is geometry-based inference (node logs do not record raft
 * candidacy at the captured level, and snapshot op rows carry no reason
 * column), and an op that is created AND trimmed between two frames would be
 * missed as a deliberate driver.
 *
 * Usage:
 *   node scripts/analyze-leadership-flap.js [--dir <playbackRoot>]
 *     [--run <runKey>]... [--window <ms>] [--out <verdictPath>] [--json]
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PLAYBACK_ROOT = 'test-output/reports/.playback';
const SCENARIO_DIR = 'rolling-restart';
const DEFAULT_JOIN_WINDOW_MS = 10000;
const DEFAULT_VERDICT_PATH =
  'test-output/reports/leadership-flap-attribution.verdict.json';
const CPU_SAMPLE_WINDOW_MS = 10000;
const LEADERSHIP_AFFECTING_TYPES = new Set(['REPLACE', 'REMOVE']);

const FLIP_CLASS = Object.freeze({
  DELIBERATE_REPLACEMENT: 'DELIBERATE_REPLACEMENT',
  DELIBERATE_STEPDOWN_SUCCESSION: 'DELIBERATE_STEPDOWN_SUCCESSION',
  COUNTER_DELIBERATE_REGAIN: 'COUNTER_DELIBERATE_REGAIN',
  AMBIGUOUS: 'AMBIGUOUS',
  SPONTANEOUS_LIKELY: 'SPONTANEOUS_LIKELY',
});

function parseArgs(argv) {
  const args = {
    dir: DEFAULT_PLAYBACK_ROOT,
    runs: [],
    windowMs: DEFAULT_JOIN_WINDOW_MS,
    out: DEFAULT_VERDICT_PATH,
    json: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dir') args.dir = argv[(i += 1)];
    else if (arg === '--run') args.runs.push(argv[(i += 1)]);
    else if (arg === '--window') args.windowMs = Number(argv[(i += 1)]);
    else if (arg === '--out') args.out = argv[(i += 1)];
    else if (arg === '--json') args.json = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function readNdjson(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function discoverRuns(playbackRoot, onlyRuns) {
  if (!fs.existsSync(playbackRoot)) return [];
  return fs.readdirSync(playbackRoot)
    .filter((name) => onlyRuns.length === 0 || onlyRuns.includes(name))
    .map((name) => ({
      runKey: name,
      dir: path.join(playbackRoot, name, SCENARIO_DIR),
    }))
    .filter(({dir}) => fs.existsSync(path.join(dir, 'snapshots.ndjson')));
}

// The node(s) the scenario restarted: any node with a stop AND a later start
// in events.ndjson. Falls back to node.restart.boundary events.
function resolveRestartNodes(events) {
  const stops = new Map();
  const restarts = new Map();
  for (const event of events) {
    const nodeId = event.entityId || event.nodeId || event.node_id || null;
    if (!nodeId) continue;
    if (event.type === 'node.stopped') {
      stops.set(nodeId, event.timestamp);
    } else if (event.type === 'node.started' && stops.has(nodeId)) {
      const at = event.timestamp;
      if (!restarts.has(nodeId) || at < restarts.get(nodeId)) {
        restarts.set(nodeId, at);
      }
    } else if (
      event.type === 'node.restart.boundary' &&
      event.details?.phase === 'after_ready' &&
      !restarts.has(nodeId)
    ) {
      // Boundaries come in before_stop / after_ready pairs; only the
      // after_ready edge marks the node as back — the re-gain window.
      restarts.set(nodeId, event.timestamp);
    }
  }
  return restarts;
}

// All replica_operations rows across all frames, deduped by operation_id
// keeping the latest updated_at (later frames carry later workflow state).
function collectOperations(frames) {
  const byId = new Map();
  for (const frame of frames) {
    for (const op of frame.replicaOperations || []) {
      if (!op || !op.operation_id) continue;
      const prior = byId.get(op.operation_id);
      if (!prior || (op.updated_at || 0) >= (prior.updated_at || 0)) {
        byId.set(op.operation_id, op);
      }
    }
  }
  return [...byId.values()];
}

function activeOpsOnPartition(ops, partitionId, fromMs, toMs) {
  return ops.filter((op) =>
    op.partition_id === partitionId &&
    LEADERSHIP_AFFECTING_TYPES.has(op.type) &&
    (op.created_at || 0) <= toMs &&
    (op.completed_at == null || op.completed_at >= fromMs));
}

function classifyFlip(flip, ops, windowMs) {
  const active = activeOpsOnPartition(
    ops, flip.partition, flip.intervalStartMs - windowMs,
    flip.intervalEndMs + windowMs);
  if (active.length === 0) return {cls: FLIP_CLASS.SPONTANEOUS_LIKELY, ops: []};
  const replacementDriver = active.find((op) =>
    op.type === 'REPLACE' && op.target_node_id === flip.to);
  if (replacementDriver) {
    return {cls: FLIP_CLASS.DELIBERATE_REPLACEMENT, ops: [replacementDriver]};
  }
  // Leadership landed BACK on a node an active op is draining on this very
  // partition: nothing deliberate elects the drain source, so this is the
  // strongest wasted-work signal (timer election or rewin after step-down).
  const counterDriver = active.find((op) => op.source_node_id === flip.to);
  if (counterDriver) {
    return {cls: FLIP_CLASS.COUNTER_DELIBERATE_REGAIN, ops: [counterDriver]};
  }
  const stepdownDriver = active.find((op) => op.source_node_id === flip.from);
  if (stepdownDriver) {
    return {
      cls: FLIP_CLASS.DELIBERATE_STEPDOWN_SUCCESSION,
      ops: [stepdownDriver],
    };
  }
  return {cls: FLIP_CLASS.AMBIGUOUS, ops: active.slice(0, 3)};
}

function nearestCpuPercent(samples, nodeId, atMs) {
  let best = null;
  for (const sample of samples) {
    if (sample.nodeId !== nodeId) continue;
    const distance = Math.abs((sample.timestamp || 0) - atMs);
    if (distance <= CPU_SAMPLE_WINDOW_MS && (!best || distance < best.distance)) {
      best = {distance, cpuPercent: sample.cpuPercent};
    }
  }
  return best ? best.cpuPercent : null;
}

function extractFlips(frames) {
  const flips = [];
  let prevLeaders = null;
  let prevTs = null;
  for (const frame of frames) {
    const leaders = new Map();
    for (const partition of frame.partitions || []) {
      leaders.set(partition.partition_id, partition.leader_node_id || null);
    }
    if (prevLeaders) {
      for (const [partitionId, leader] of leaders) {
        const prev = prevLeaders.has(partitionId) ?
          prevLeaders.get(partitionId) :
          undefined;
        if (prev !== undefined && prev !== leader) {
          flips.push({
            partition: partitionId,
            from: prev,
            to: leader,
            intervalStartMs: prevTs,
            intervalEndMs: frame.timestamp,
          });
        }
      }
    }
    prevLeaders = leaders;
    prevTs = frame.timestamp;
  }
  return flips;
}

function summarizeCounts(flips) {
  const counts = {};
  for (const key of Object.values(FLIP_CLASS)) counts[key] = 0;
  for (const flip of flips) counts[flip.cls] += 1;
  return counts;
}

function analyzeRun(run, windowMs) {
  const frames = readNdjson(path.join(run.dir, 'snapshots.ndjson'))
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  const events = readNdjson(path.join(run.dir, 'events.ndjson'));
  const samples = readNdjson(path.join(run.dir, 'samples.ndjson'));
  const restartNodes = resolveRestartNodes(events);
  const ops = collectOperations(frames);
  // A node is a "drain source" at time t when any leadership-affecting op
  // anywhere is actively moving replicas OFF it — the node the machinery is
  // trying to unload. Its leadership GAINS are the waste the levers target.
  const isDrainSourceAt = (nodeId, fromMs, toMs) => ops.some((op) =>
    LEADERSHIP_AFFECTING_TYPES.has(op.type) &&
    op.source_node_id === nodeId &&
    (op.created_at || 0) <= toMs &&
    (op.completed_at == null || op.completed_at >= fromMs));
  const flips = extractFlips(frames).map((flip) => {
    const verdict = classifyFlip(flip, ops, windowMs);
    return {
      ...flip,
      cls: verdict.cls,
      fromNull: flip.from == null,
      driverOpIds: verdict.ops.map((op) => op.operation_id),
      gainerCpuPercent: flip.to ?
        nearestCpuPercent(samples, flip.to, flip.intervalEndMs) :
        null,
      gainerIsRestartNode: flip.to != null && restartNodes.has(flip.to),
      postRestartBoundary: flip.to != null && restartNodes.has(flip.to) &&
        flip.intervalEndMs >= restartNodes.get(flip.to),
      gainerIsDrainSource: flip.to != null && isDrainSourceAt(
        flip.to, flip.intervalStartMs - windowMs,
        flip.intervalEndMs + windowMs),
    };
  });
  const restartRegains = flips.filter((flip) =>
    !flip.fromNull && flip.gainerIsRestartNode && flip.postRestartBoundary);
  const drainSourceGains = flips.filter((flip) =>
    !flip.fromNull && flip.gainerIsDrainSource);
  return {
    runKey: run.runKey,
    frames: frames.length,
    operationsSeen: ops.length,
    restartNodes: [...restartNodes.keys()],
    totalFlips: flips.length,
    bootstrapFills: flips.filter((flip) => flip.fromNull).length,
    flipCounts: summarizeCounts(flips.filter((flip) => !flip.fromNull)),
    restartNodeRegains: {
      total: restartRegains.length,
      counts: summarizeCounts(restartRegains),
    },
    drainSourceGains: {
      total: drainSourceGains.length,
      counts: summarizeCounts(drainSourceGains),
    },
    flips,
  };
}

function buildVerdict(runResults, windowMs) {
  const overallRegains = {total: 0};
  const overallDrainGains = {total: 0};
  for (const key of Object.values(FLIP_CLASS)) {
    overallRegains[key] = 0;
    overallDrainGains[key] = 0;
  }
  let totalFlips = 0;
  let bootstrapFills = 0;
  const overallFlips = {};
  for (const key of Object.values(FLIP_CLASS)) overallFlips[key] = 0;
  for (const result of runResults) {
    totalFlips += result.totalFlips;
    bootstrapFills += result.bootstrapFills;
    for (const key of Object.values(FLIP_CLASS)) {
      overallFlips[key] += result.flipCounts[key];
      overallRegains[key] += result.restartNodeRegains.counts[key];
      overallDrainGains[key] += result.drainSourceGains.counts[key];
    }
    overallRegains.total += result.restartNodeRegains.total;
    overallDrainGains.total += result.drainSourceGains.total;
  }
  // Undirected gains = nothing deliberate elected this node: timer elections
  // (SPONTANEOUS_LIKELY), rewins against an active drain of the gainer
  // (COUNTER_DELIBERATE_REGAIN), and unexplained (AMBIGUOUS).
  const undirectedDrainGains =
    overallDrainGains[FLIP_CLASS.SPONTANEOUS_LIKELY] +
    overallDrainGains[FLIP_CLASS.COUNTER_DELIBERATE_REGAIN] +
    overallDrainGains[FLIP_CLASS.AMBIGUOUS];
  const deliberateDrainGains =
    overallDrainGains[FLIP_CLASS.DELIBERATE_REPLACEMENT] +
    overallDrainGains[FLIP_CLASS.DELIBERATE_STEPDOWN_SUCCESSION];
  const answer = overallDrainGains.total === 0 ?
    'no-drain-source-gains-observed' :
    undirectedDrainGains > deliberateDrainGains ?
      'mostly-undirected' :
      deliberateDrainGains > undirectedDrainGains ?
        'mostly-deliberate' :
        'split';
  return {
    metric: 0,
    target: null,
    done: runResults.length > 0,
    classification: 'attribution-census',
    question: 'Are leadership gains by a node the machinery is draining ' +
      'UNDIRECTED (timer elections / rewins — candidacy-reluctance and ' +
      'pre-vote have a target) or DELIBERATE R1/R3 successions (those ' +
      'levers would be no-ops)?',
    answer,
    joinWindowMs: windowMs,
    runsAnalyzed: runResults.length,
    totalFlips,
    bootstrapFills,
    flipCounts: overallFlips,
    restartNodeRegains: overallRegains,
    drainSourceGains: overallDrainGains,
    limits: [
      'flips observed at snapshot resolution (~3s); multiple flips within ' +
        'one interval are invisible',
      'attribution is geometry-based inference from replica_operations rows; ' +
        'node logs do not record raft candidacy at the captured level',
      'an operation created and trimmed between two frames is missed as a ' +
        'deliberate driver (would misclassify toward SPONTANEOUS_LIKELY)',
    ],
    runs: runResults.map(({flips, ...rest}) => ({
      ...rest,
      flips: flips.map((flip) => ({
        partition: flip.partition,
        from: flip.from,
        to: flip.to,
        atMs: flip.intervalEndMs,
        cls: flip.cls,
        driverOpIds: flip.driverOpIds,
        gainerCpuPercent: flip.gainerCpuPercent,
        gainerIsRestartNode: flip.gainerIsRestartNode,
        gainerIsDrainSource: flip.gainerIsDrainSource,
      })),
    })),
  };
}

function renderSummary(verdict) {
  const lines = [
    `leadership-flap attribution — ${verdict.runsAnalyzed} run(s), ` +
      `${verdict.totalFlips} flips (${verdict.bootstrapFills} bootstrap ` +
      'vacancy fills excluded from aggregates), join window ' +
      `${verdict.joinWindowMs}ms`,
    `  real flips: ${JSON.stringify(verdict.flipCounts)}`,
    `  drain-source gains: total ${verdict.drainSourceGains.total} ` +
      `spontaneous ${verdict.drainSourceGains.SPONTANEOUS_LIKELY} ` +
      `counter ${verdict.drainSourceGains.COUNTER_DELIBERATE_REGAIN} ` +
      `replacement ${verdict.drainSourceGains.DELIBERATE_REPLACEMENT} ` +
      `stepdown ${verdict.drainSourceGains.DELIBERATE_STEPDOWN_SUCCESSION} ` +
      `ambiguous ${verdict.drainSourceGains.AMBIGUOUS}`,
    `  restart-node re-gains: total ${verdict.restartNodeRegains.total}`,
    `  ANSWER: ${verdict.answer}`,
  ];
  for (const run of verdict.runs) {
    lines.push(
      `  ${run.runKey}: flips ${run.totalFlips} ` +
      `${JSON.stringify(run.flipCounts)} drain-source-gains ` +
      `${run.drainSourceGains.total} ` +
      `${JSON.stringify(run.drainSourceGains.counts)}`);
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  const runs = discoverRuns(args.dir, args.runs);
  if (runs.length === 0) {
    process.stderr.write(
      `no playback runs with snapshots.ndjson under ${args.dir}\n`);
    process.exitCode = 2;
    return;
  }
  const runResults = runs.map((run) => analyzeRun(run, args.windowMs));
  const verdict = buildVerdict(runResults, args.windowMs);
  fs.mkdirSync(path.dirname(args.out), {recursive: true});
  fs.writeFileSync(args.out, JSON.stringify(verdict, null, 2));
  if (args.json) {
    process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderSummary(verdict)}\nverdict: ${args.out}\n`);
  }
}

main();
