// The child process the election-seed witness runs (owner decision O2). One
// process is one fresh WASM core, so a run here cannot inherit another run's
// thread_rng state. It counts every call into the platform entropy source the
// binding's getrandom backend can reach, loads the binding, drives raft-rs
// cores in memory (no storage, no network: messages are stepped in a fixed
// order), and prints one JSON report on stdout.
//
// Usage: node election-seed-probe.js '<json request>'
//   request.scenario: 'timeouts' | 'independence' | 'cluster' | 'elections'
import crypto from 'node:crypto';

const entropy = {calls: 0};
const webCrypto = globalThis.crypto;
const getRandomValues = webCrypto.getRandomValues.bind(webCrypto);
Object.defineProperty(webCrypto, 'getRandomValues', {
  configurable: true,
  value: (array) => {
    entropy.calls += 1;
    return getRandomValues(array);
  },
});
const randomFillSync = crypto.randomFillSync;
crypto.randomFillSync = (...args) => {
  entropy.calls += 1;
  return randomFillSync(...args);
};

const {loadRaftRsCore} = await import('./raw-raft-rs-test-core.js');
const {RAFT_RS_GROUP_TUNING} = await import(
  '../../../src/raft/raft-rs-group-constants.js');

const core = loadRaftRsCore();
const VOTERS = Object.freeze(['1', '2', '3']);
const LEADER_RAFT_STATE = 2;
const TUNING = Object.freeze({
  electionTick: RAFT_RS_GROUP_TUNING.ELECTION_TICK,
  heartbeatTick: RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK,
  preVote: RAFT_RS_GROUP_TUNING.PRE_VOTE,
  checkQuorum: RAFT_RS_GROUP_TUNING.CHECK_QUORUM,
});

function createNode(id, seed, bootstrap) {
  return core.create_node({
    id,
    peers: bootstrap ? [] : VOTERS,
    learners: [],
    applied: '0',
    ...TUNING,
    ...(seed === null ? {} : {electionSeed: String(seed)}),
    ...(bootstrap ? {bootstrap} : {}),
  });
}

// One Ready cycle with nothing durable: the core's own MemStorage is the
// store. Returns every message the cycle released, in release order.
function drainNode(handle) {
  const out = [];
  while (core.has_ready(handle)) {
    const ready = core.take_ready(handle);
    out.push(...(ready.messages || []));
    core.persist_ready(handle);
    out.push(...(ready.persistedMessages || []));
    const light = core.advance_append(handle);
    if (light.commitIndex !== undefined) {
      core.persist_commit_index(handle, light.commitIndex);
    }
    out.push(...(light.messages || []));
    core.advance_apply(handle);
  }
  return out;
}

// The successive randomized election timeouts of one voter that never hears
// from a peer: every campaign is a term increment, and a campaign resets the
// timeout, so the ticks between successive term increments are the draws.
function campaignTimeouts(handle, count) {
  const timeouts = [];
  let term = core.status(handle).term;
  let since = 0;
  while (timeouts.length < count) {
    core.tick(handle);
    drainNode(handle);
    since += 1;
    const now = core.status(handle).term;
    if (now !== term) {
      timeouts.push(since);
      since = 0;
      term = now;
    }
  }
  return timeouts;
}

function timeoutsScenario({seed, ids, count}) {
  return Object.fromEntries(ids.map((id) => {
    const handle = createNode(id, seed);
    const timeouts = campaignTimeouts(handle, count);
    core.free(handle);
    return [id, timeouts];
  }));
}

// Group A's node alone, then group A's node again with a second group's node
// created and ticked between every tick of A's: A's draws must not move.
function independenceScenario({seed, otherSeed, count}) {
  const alone = createNode('1', seed);
  const aloneTimeouts = campaignTimeouts(alone, count);
  core.free(alone);
  const shared = createNode('1', seed);
  const other = createNode('1', otherSeed);
  const timeouts = [];
  let term = core.status(shared).term;
  let since = 0;
  while (timeouts.length < count) {
    core.tick(other);
    drainNode(other);
    core.tick(shared);
    drainNode(shared);
    since += 1;
    const now = core.status(shared).term;
    if (now !== term) {
      timeouts.push(since);
      since = 0;
      term = now;
    }
  }
  core.free(shared);
  core.free(other);
  return {alone: aloneTimeouts, interleaved: timeouts};
}

function roleOf(handle) {
  const status = core.status(handle);
  return {raftState: status.raftState, term: status.term, lead: status.lead};
}

// Every node ticks once in id order, then messages are stepped in release
// order until none is left. Returns the round's full trace.
function round(nodes) {
  const trace = {messages: [], roles: []};
  const queue = [];
  for (const id of VOTERS) {
    core.tick(nodes.get(id));
    queue.push(...drainNode(nodes.get(id)));
  }
  while (queue.length > 0) {
    const message = queue.shift();
    trace.messages.push(message);
    const target = nodes.get(message.to);
    core.step(target, message);
    queue.push(...drainNode(target));
  }
  for (const id of VOTERS) {
    trace.roles.push(roleOf(nodes.get(id)));
  }
  return trace;
}

function leaderOf(nodes) {
  return VOTERS.find((id) =>
    core.status(nodes.get(id)).raftState === LEADER_RAFT_STATE) || null;
}

function runUntilLeader(nodes, maxRounds, traces) {
  for (let r = 1; r <= maxRounds; r += 1) {
    const trace = round(nodes);
    traces?.push(trace);
    const leader = leaderOf(nodes);
    if (leader !== null) {
      return {leader, rounds: r};
    }
  }
  return {leader: null, rounds: maxRounds};
}

// A fresh three-voter group elects; every node is then freed and recreated
// from its own exported state with the SAME seed - every stream restarts
// from where it started - and the group must elect again.
function electAndRestart(seed, maxRounds, traces) {
  const nodes = new Map(VOTERS.map((id) => [id, createNode(id, seed)]));
  const first = runUntilLeader(nodes, maxRounds, traces);
  const exported = new Map(VOTERS.map((id) =>
    [id, core.export_persisted_state(nodes.get(id))]));
  for (const handle of nodes.values()) {
    core.free(handle);
  }
  const restarted = new Map(VOTERS.map((id) => {
    const state = exported.get(id);
    return [id, createNode(id, seed, {
      confState: state.confState,
      entries: state.entries,
      ...(state.hardState ? {hardState: state.hardState} : {}),
    })];
  }));
  const second = runUntilLeader(restarted, maxRounds, traces);
  for (const handle of restarted.values()) {
    core.free(handle);
  }
  return {first, second};
}

function clusterScenario({seed, maxRounds}) {
  const traces = [];
  const outcome = electAndRestart(seed, maxRounds, traces);
  return {outcome, trace: JSON.stringify(traces)};
}

function electionsScenario({seeds, maxRounds}) {
  return seeds.map((seed) => ({seed, ...electAndRestart(seed, maxRounds)}));
}

const SCENARIOS = Object.freeze({
  timeouts: timeoutsScenario,
  independence: independenceScenario,
  cluster: clusterScenario,
  elections: electionsScenario,
});

const request = JSON.parse(process.argv[2]);
const result = SCENARIOS[request.scenario](request);
process.stdout.write(JSON.stringify({result, entropyCalls: entropy.calls}));
