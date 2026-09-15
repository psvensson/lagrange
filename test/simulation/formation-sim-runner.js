#!/usr/bin/env node
// Deterministic five-node cold-formation simulator (formation-sim quest):
// five nodes on the virtual network, one staged real-LifeRaft cohort per
// priority control-plane table with the seed leading alone until joiners
// arrive on the scenario's schedule, the real control-plane owners of every
// node on the node's network clock (readiness, publication, policy,
// admission, rebalance coordinator; a real planning owner per priority
// partition on the seed), per-node virtual time charged per owner segment
// from the committed calibration with the segments counted by the
// production attribution seam, the deterministic guard on every owner
// dispatch, and the live report shape with formationMetrics.
//
//   node test/simulation/formation-sim-runner.js --seed <n> --output <dir>
//
// Slices so far host Raft and the control-plane owners; bootstrap and the
// admission snapshot are not hosted, so node, partition and service rows are
// scenario data, cross-node replication is not modelled, and the admission
// transitions are empty. Nothing here reads the wall clock: the timestamp
// is the virtual epoch.
//
// Guard scope: the owners' handlers are async, so the deterministic guard
// covers the synchronous prefix of each dispatch (up to its first await);
// an ambient read in a later continuation is not caught here, and a read
// caught inside an async handler surfaces as a rejected promise.
// Math.random (LifeRaft's timer-name uuid) and process.hrtime are outside
// the guard; neither reached the report bytes.

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {SeededRandomSource} from '../../src/random/random-source.js';
import {FORMATION_OWNER} from '../../src/diagnostics/formation-diagnostics-contract.js';
import {configureSharedSyncSectionClock} from '../../src/diagnostics/event-loop-gap-watchdog.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
} from '../../src/bootstrap/system-partition-classification.js';
import {EntityType, ReplicaStatus} from '../../src/rebalancer/unified-rebalancer.js';
import {TABLES} from '../../src/constants/index.js';
import {runOnExecutionNode} from '../../src/diagnostics/formation-turn-attribution.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {
  ScenarioHostObserver, advanceToNextInstant, closeCurrentInstant,
} from './formation-sim-quiescence.js';
import {
  initializeTestEnvironment,
} from '../integration/membership-consistency-integration-test-helpers.js';
import {REQUIRED_OWNERS, loadCalibration} from './formation-sim-coefficients.js';
import {ChargeAccumulator} from './formation-sim-charge.js';
import {GapObserver} from './formation-sim-gap-observer.js';
import {createStagedCohort} from './formation-sim-raft-cohort.js';
import {
  createPriorityPartitionRebalancer, createSimulatedNodeHosts, seedNodeRows,
} from './formation-sim-node-hosts.js';
import {
  OwnerTurnMeter, spreadObservation,
} from './formation-sim-owner-passes.js';
import {buildReport, writeReport} from './formation-sim-report.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARG = Object.freeze({SEED: '--seed', OUTPUT: '--output'});
const DEFAULT_SEED = 1;
const NODE_COUNT = 5;
const SEED_INDEX = 0;
const NODE_ID_PREFIX = 'node-';
const ROLE = Object.freeze({SEED: 'seed', JOINER: 'joiner'});
// The scenario: virtual epoch, join schedule, link delay, election timing,
// owner pass cadence.
const SCENARIO = Object.freeze({
  id: 'five-node-cold-formation-v2',
  startEpochMs: Date.UTC(2026, 8, 13, 10, 38, 58),
  joinAtMs: Object.freeze([5000, 10000, 15000, 20000]),
  linkDelayMs: 1,
  electionMinMs: 150,
  electionMaxMs: 300,
  heartbeatMs: 50,
  deadlineMs: 120000,
  stepMs: 5,
  flushTurns: 8,
  // The rebalancer's own periodic check is armed with an ambient setTimeout
  // that production does not expose (rebalancer-planning-gate-methods.js),
  // so its planning gate is still read on a harness cadence. That is a named
  // limitation with its own seam repair owed, not a readiness cadence.
  observeEveryMs: 250,
  // Non-convergence guard on the instant walk, never a batching size.
  maxInstants: 2000000,
  targetReplicaCount: 3,
});
const DEFAULT_GENERATION = 'scenario';
const HEARTBEAT_STATS = Object.freeze({cpuPercent: 0, memoryPercent: 0, diskPercent: 0});
const MS_SUFFIX = ' ms';
const QUORUM_NODE_COUNT = 3;
const WINDOW_END_REASON = Object.freeze({FORMED: 'formed', DEADLINE: 'deadline'});
const PERCENT = 100;
const ONE_SECOND_MS = 1000;
const SEED_STREAM_STRIDE = 1000;
const HOST_STREAM_OFFSET = 500;
const INSERT = 'INSERT';
const UPDATE = 'UPDATE';
const PARTITION_SUFFIX = '-p1';
const SEED_REPLICA_SUFFIX = '-r1';
const RAFT_ROLE_LEADER = 'leader';
const ADDRESS_PORT = 9000;
const HOSTED_OWNERS = Object.freeze([
  FORMATION_OWNER.RAFT_PROTOCOL, FORMATION_OWNER.READINESS,
  FORMATION_OWNER.MEMBERSHIP_PUBLICATION, FORMATION_OWNER.REBALANCER,
]);

function parseArguments(argv) {
  const options = {seed: DEFAULT_SEED, output: null};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === ARG.SEED) {
      options.seed = Number(argv[index + 1]);
      index += 1;
    } else if (argv[index] === ARG.OUTPUT) {
      options.output = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function nodeIds() {
  return Array.from({length: NODE_COUNT}, (_unused, index) => `${NODE_ID_PREFIX}${index}`);
}

function nodeIndex(nodeId) {
  return Number(nodeId.slice(NODE_ID_PREFIX.length));
}

function raftOptionsFor(seed) {
  return (nodeId) => ({
    'election min': `${SCENARIO.electionMinMs}${MS_SUFFIX}`,
    'election max': `${SCENARIO.electionMaxMs}${MS_SUFFIX}`,
    'heartbeat': `${SCENARIO.heartbeatMs}${MS_SUFFIX}`,
    'write': (_packet, callback) => {
      if (typeof callback === 'function') callback(null);
    },
    'randomSource': new SeededRandomSource({
      seed: seed * SEED_STREAM_STRIDE + nodeIndex(nodeId),
    }),
  });
}

// The cold boot as data: every priority table has one partition whose only
// replica is the seed's leader replica, the shape the seed is in when the
// joiners arrive (the real bootstrap that writes these rows is a later
// slice).
function seedPriorityRows(hosts, seedId, groupIds) {
  const nowMs = hosts.now();
  for (const tableId of groupIds) {
    const partitionId = `${tableId}${PARTITION_SUFFIX}`;
    hosts.cache.applySystemTableChange(TABLES.PARTITIONS, INSERT, {
      partition_id: partitionId, table_id: tableId,
      replica_count: SCENARIO.targetReplicaCount, created_at: nowMs,
    });
    hosts.cache.applySystemTableChange(TABLES.SERVICES, INSERT, {
      service_id: `${partitionId}${SEED_REPLICA_SUFFIX}`,
      replica_id: `${partitionId}${SEED_REPLICA_SUFFIX}`,
      partition_id: partitionId, node_id: seedId,
      service_type: EntityType.PARTITION, status: ReplicaStatus.ACTIVE,
      raft_role: RAFT_ROLE_LEADER, address: `${seedId}:${ADDRESS_PORT}`,
      created_at: nowMs,
    });
  }
}

// Raft elects; the partition row records who. Production reads
// PARTITIONS.leader_node_id to decide which node owns control-plane
// publication, and the row the scenario seeded carried no such field, so no
// node was ever the publication owner and the heartbeat's reconcile tick
// returned at its first gate. The cohort's own elected leader is written into
// every node's cache, the way CDC would carry it.
function publishCohortLeadership({hosts, cohorts, leadership, rebalancers, seedId}) {
  for (const [groupId, cohort] of cohorts) {
    const leader = cohort.leaderId();
    if (!leader || leadership.get(groupId) === leader) continue;
    leadership.set(groupId, leader);
    for (const node of hosts.values()) {
      runOnExecutionNode(node.nodeId, () =>
        node.cache.applySystemTableChange(TABLES.PARTITIONS, UPDATE, {
          partition_id: `${groupId}${PARTITION_SUFFIX}`, table_id: groupId,
          replica_count: SCENARIO.targetReplicaCount, leader_node_id: leader,
        }));
    }
    // Leadership acquisition is the production entry that starts planning:
    // setLeader enqueues a check and arms the planner's own periodic timer.
    // It is a lifecycle hook driven by Raft's election, not a cadence.
    runOnExecutionNode(seedId, () =>
      rebalancers.get(groupId)?.setLeader(leader === seedId));
  }
}

// Quiescence, not a fixed flush budget. Production owners answer across
// promise continuations that in turn queue more deterministic events - the
// heartbeat's reconcile tick is dispatched and never awaited - so a fixed
// number of microtask turns leaves work stranded, and how much is stranded
// depends on process state rather than on the scenario. A step is settled
// only when draining the queue to the bound and flushing continuations
// produces no further runnable event.
// The owners actually hosted in this scenario that expose a current-work
// completion contract. The harness consumes those contracts; it does not
// reproduce their logic and does not read their internals.
function ownerIdleContracts(hosts, cohorts) {
  const contracts = [];
  for (const node of hosts.values()) {
    contracts.push(() => node.controlPlaneSystemTableGateway.awaitCurrentWorkIdle());
  }
  for (const cohort of cohorts.values()) {
    for (const raft of cohort.rafts.values()) {
      contracts.push(() => raft.awaitCurrentProtocolIdle());
    }
  }
  return contracts;
}

// Close the instant the scheduler is standing on. The horizon is a stopping
// predicate, never a batching boundary: nothing here runs the scheduler "up
// to" a time.
async function settle(network, untilMs, observer, owners) {
  await closeCurrentInstant({network, observer, owners});
}


function attributionSnapshot(charges, seedId, windowMs) {
  const chargedMs = charges.ownerChargedMs(seedId, REQUIRED_OWNERS);
  const segments = charges.ownerSegments(seedId, REQUIRED_OWNERS);
  const owners = REQUIRED_OWNERS.map((owner) => ({
    owner, durationMs: chargedMs[owner], durationUs: chargedMs[owner] * ONE_SECOND_MS,
    dispatchCount: segments[owner], handoffCount: 0, turnSegmentCount: segments[owner],
  }));
  const busyMs = owners.reduce((sum, entry) => sum + entry.durationMs, 0);
  return {
    schemaVersion: 1, windowComplete: true, windowDurationMs: windowMs,
    busyDurationUs: busyMs * ONE_SECOND_MS,
    idleDurationUs: (windowMs - busyMs) * ONE_SECOND_MS,
    unattributedDurationUs: 0, unattributedPercent: 0, owners,
  };
}

// One owner-pass round on every joined node: the seed's planning owners
// (rebalancer) and its publication reconcile; every node's own readiness
// build. Observations are read from the owners' return values.
// Observation only, and causally inert: it reads rows the owners have
// already written and calls no owner method that evaluates, builds or
// enqueues anything. The planning gate used to be read here, which meant the
// harness decided how often planning ran and, through it, how often readiness
// was rebuilt. The planner now arms its own periodic check on this node's
// virtual queue, so the rate is the owner's. How often the harness LOOKS must
// not change what the owners do, and the cadence-invariance witness proves it.
function observeState({hosts, joinedIds, seedId, observations}) {
  const atMs = hosts.get(seedId).now();
  observations.spread.push({atMs, ...spreadObservation(hosts.get(seedId), joinedIds)});
}

// The real initiator, started as the node's process would start it. Stats
// are a static snapshot: gathering them is host IO, not control-plane
// behaviour, and the heartbeat writes the row either way.
function startHeartbeat(node) {
  node.heartbeatService.start({stats: HEARTBEAT_STATS, capabilities: []});
}

/**
 * Run the scenario for one seed.
 * @param {number} seed
 * @returns {Promise<object>} the report object
 */
async function simulate(seed, options = {}) {
  initializeTestEnvironment();
  const calibration = loadCalibration(REPO_ROOT);
  const ids = nodeIds();
  const seedId = ids[SEED_INDEX];
  const network = createVirtualNetwork({
    onEvent: typeof options.onEvent === 'function' ? options.onEvent : undefined,
    onAdapterTimer: typeof options.onAdapterTimer === 'function' ?
      options.onAdapterTimer : undefined,
    random: new SeededRandomSource({seed}),
    costTable: calibration.costTable,
    startMs: SCENARIO.startEpochMs,
  });
  const charges = new ChargeAccumulator({network, calibration});
  // The gap observer is the production watchdog's rule on virtual time: one
  // heartbeat per node, deferred by that node's own occupancy exactly as any
  // other timer is. Gaps are never derived from charged work.
  const gapObserver = new GapObserver({network, charges});
  // The watchdog's sync-section stamps are measurement, not decisions;
  // they read the virtual clock so tagging inside a dispatch is ambient-free.
  configureSharedSyncSectionClock(() => network.now());
  const cohorts = new Map();
  for (const nodeId of ids) {
    network.registerNode(nodeId, (message, api) => {
      for (const cohort of cohorts.values()) {
        if (cohort.handleMessage(nodeId, message, api)) return;
      }
    });
  }
  const groupIds = [...PRIORITY_CONTROL_PLANE_TABLE_IDS].sort();
  const raftOptions = raftOptionsFor(seed);
  for (const groupId of groupIds) {
    cohorts.set(groupId, createStagedCohort({
      network, groupId, seedId, linkDelayMs: SCENARIO.linkDelayMs, raftOptions, charges,
    }));
  }
  // Hosts are constructed outside any guarded dispatch (construction is
  // the harness's, not an owner turn); their rows are scenario data.
  const meter = new OwnerTurnMeter({network, charges});
  const chargeDispatch = (nodeId, callback) => meter.dispatch(nodeId, callback);
  // Construction and seeding are the harness's, but they happen ON a node in
  // production, and async resources created here are resumed later; binding
  // them now is what keeps their continuations off the wrong node.
  const hosts = new Map();
  for (const nodeId of ids) {
    const node = runOnExecutionNode(nodeId, () =>
      createSimulatedNodeHosts({network, nodeId, chargeDispatch,
        randomSource: new SeededRandomSource({
          seed: seed * SEED_STREAM_STRIDE + HOST_STREAM_OFFSET + nodeIndex(nodeId),
        })}));
    runOnExecutionNode(nodeId, () => seedNodeRows(node, ids));
    hosts.set(nodeId, node);
  }
  runOnExecutionNode(seedId, () => seedPriorityRows(hosts.get(seedId), seedId, groupIds));
  const rebalancers = new Map(groupIds.map((tableId) =>
    [tableId, runOnExecutionNode(seedId, () =>
      createPriorityPartitionRebalancer(hosts.get(seedId), tableId))]));
  const observations = {readiness: [], spread: []};
  // Sampling frequency is the caller's; it must not change any owner count.
  const observeEveryMs = Number.isFinite(options.observeEveryMs) ?
    options.observeEveryMs : SCENARIO.observeEveryMs;
  const leadership = new Map();
  const joins = ids.slice(SEED_INDEX + 1).map((nodeId, index) => ({
    nodeId, atMs: SCENARIO.startEpochMs + SCENARIO.joinAtMs[index],
  }));
  const joinedIds = [seedId];
  // The seed's watchdog runs from the start of the window; a joiner's from
  // the moment it is part of the cluster, as its process would.
  gapObserver.start(seedId);
  runOnExecutionNode(seedId, () => startHeartbeat(hosts.get(seedId)));
  let quorumAtMs = null;
  let fifthJoinAtMs = null;
  let clusterFormedAtMs = null;
  let nextPassAtMs = SCENARIO.startEpochMs;
  const deadline = SCENARIO.startEpochMs + SCENARIO.deadlineMs;
  const observer = options.observer || new ScenarioHostObserver().enable();
  const ownsObserver = !options.observer;
  observer.begin(options.generation || DEFAULT_GENERATION);
  try {
  // Instant by instant, never "run everything through virtual time X". Each
  // iteration closes the instant the scheduler stands on, then advances to
  // the next causal instant. Joins are scenario inputs applied at the instant
  // they are due, which is why the horizon is consulted before stepping.
    let instantMs = SCENARIO.startEpochMs;
    const owners = ownerIdleContracts(hosts, cohorts);
    await closeCurrentInstant({network, observer, owners});
    for (let guard = 0; guard < SCENARIO.maxInstants; guard += 1) {
      for (const join of joins) {
        if (join.atMs <= instantMs && !join.done) {
          join.done = true;
          joinedIds.push(join.nodeId);
          gapObserver.start(join.nodeId);
          runOnExecutionNode(join.nodeId, () => startHeartbeat(hosts.get(join.nodeId)));
          for (const cohort of cohorts.values()) cohort.admit(join.nodeId);
          if (joinedIds.length === QUORUM_NODE_COUNT) quorumAtMs = join.atMs;
          if (joinedIds.length === NODE_COUNT) fifthJoinAtMs = join.atMs;
          await closeCurrentInstant({network, observer, owners});
        }
      }
      publishCohortLeadership({hosts, cohorts, leadership, rebalancers, seedId});
      await closeCurrentInstant({network, observer, owners});
      if (network.now() >= nextPassAtMs) {
        nextPassAtMs += observeEveryMs;
        observeState({hosts, joinedIds, seedId, observations});
      }
      if (fifthJoinAtMs !== null && clusterFormedAtMs === null &&
      [...cohorts.values()].every((cohort) => cohort.isFormed(NODE_COUNT))) {
        clusterFormedAtMs = network.now();
        break;
      }
      const advanced = await advanceToNextInstant({
        network, observer, owners, horizonMs: deadline,
      });
      if (advanced === null) break;
      instantMs = advanced;
    }
  // The scenario is over only when nothing the production owners queued is
  // still runnable. Breaking out of the drive loop the instant the cohorts
  // report formed left promise chains outstanding; in one process they landed
  // during the NEXT run and moved its counters, which is how the same seed
  // produced two different reports.
  } catch (error) {
    reportUnboundProvenance(meter);
    throw error;
  }
  // Retire every continuation the run started before the meter closes, so a
  // chain from this scenario cannot land inside the next one and move its
  // counters. Flushing is unconditional here rather than until-quiet: a
  // pure promise chain queues nothing, so there is no event to observe.
  const boundaryMs = network.now();
  await settle(network, boundaryMs, observer, ownerIdleContracts(hosts, cohorts));
  // Runnable at the boundary, which future-due timers are not.
  const strandedEvents = network.run({untilMs: boundaryMs}).steps;
  meter.stop();
  // Owners stopped, scheduler quiescent, meter closed: only now is the
  // generation sealed, so a later callback rooted in it is an escape.
  observer.seal();
  if (ownsObserver) observer.disable();
  const windowEndedAtMs = clusterFormedAtMs ?? network.now();
  const windowMs = windowEndedAtMs - SCENARIO.startEpochMs;
  // busyMs is every charged millisecond, which is diagnostic evidence only.
  // eventLoopGapMs is what the heartbeat observed: the lateness of a 250 ms
  // beat, counted when it exceeds 1000 ms, which is what the live watchdog
  // reports and what the signature's gap fractions read.
  const nodes = ids.map((nodeId, index) => {
    const ownerChargedMs = charges.ownerChargedMs(nodeId, REQUIRED_OWNERS);
    const busyMs = Object.values(ownerChargedMs).reduce((sum, ms) => sum + ms, 0);
    const eventLoopGapMs = gapObserver.gapMsFor(nodeId);
    return {
      nodeId, role: index === SEED_INDEX ? ROLE.SEED : ROLE.JOINER, windowMs,
      busyMs, busyPercent: windowMs > 0 ? (busyMs / windowMs) * PERCENT : 0,
      eventLoopGapMs, gapCount: gapObserver.gapsFor(nodeId).length,
      ownerChargedMs, ownerSegments: charges.ownerSegments(nodeId, REQUIRED_OWNERS),
    };
  });
  return buildReport({
    seedId,
    identities: {
      scenario: SCENARIO.id, seed, calibration: calibration.file,
      calibrationHead: calibration.source.head,
      reportDigest: calibration.source.report.sha256,
      owners: REQUIRED_OWNERS, hostedOwners: HOSTED_OWNERS,
    },
    residualPercent: calibration.residualPercent,
    formationStartedAtMs: SCENARIO.startEpochMs,
    quorumAtMs, fifthJoinAtMs, clusterFormedAtMs, allReadyLeaseCompleteAtMs: null,
    windowEndedAtMs,
    attribution: {
      reason: clusterFormedAtMs === null ? WINDOW_END_REASON.DEADLINE : WINDOW_END_REASON.FORMED,
      snapshot: attributionSnapshot(charges, seedId, windowMs),
    },
    seedGaps: gapObserver.gapsFor(seedId),
    strandedEvents,
    nodes,
    groups: groupIds.map((groupId) => ({groupId, leaderId: cohorts.get(groupId).leaderId()})),
    readinessObservations: observations.readiness,
    spreadObservations: observations.spread,
    admissionTransitions: [],
    schemaAdmission: null,
  });
}

function reportUnboundProvenance(meter) {
  const [first] = meter.attribution.unboundProvenance || [];
  if (!first) return;
  process.stderr.write(`UNBOUND PROVENANCE\n${JSON.stringify({
    ...first, creationStack: undefined, ownerEntryStack: undefined,
  }, null, 2)}\ncreated at:\n${first.creationStack}\nowner entered at:\n${
    first.ownerEntryStack}\n`);
}

async function main(argv) {
  const options = parseArguments(argv);
  if (!options.output) {
    process.stderr.write(`${ARG.OUTPUT} <dir> is required\n`);
    return 1;
  }
  const report = await simulate(options.seed);
  writeReport(options.output, report);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exit(1);
  });
}

export {SCENARIO, simulate};
