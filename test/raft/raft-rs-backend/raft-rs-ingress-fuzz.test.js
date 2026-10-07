// No peer input traps the core (owner decision M5: a remote peer must never
// be able to crash the shared core). Real rs-raft ports on the real WASM
// core (PartitionNodeCluster), every envelope delivered through a port's
// own `step` and drained by its own turn - the single ingress.
//
//   F1  each shape raft-rs traps on, found by the fuzz below on the tree
//       before this change, crafted alone: refused (at admission or by the
//       local-log guard), never stepped, no trap, no runtime replacement,
//       the group still serving;
//   F2  a seeded fuzz of thousands of hostile envelopes - random types,
//       positions near and far from the recipient's own, oversized,
//       negative, non-integer and missing fields, random entry shapes and
//       snapshots, member and unknown senders - against a leader and its
//       followers: zero core traps, zero runtime replacements, zero groups
//       held by a host failure. A member-identity heartbeat beyond the log
//       may hold its recipient for a reseed (the stated residual: the
//       transport does not authenticate a sender), so a held group's cluster
//       is rebuilt and the fuzz goes on. The pre-vote request and response
//       shapes are among the generated types, and some of each reach the
//       core (an admitted, stepped envelope), so the native pre-vote path is
//       fuzzed, not only refused at admission.
//
// INGRESS_FUZZ_SEEDS (comma-separated integers) runs F2 under other seeds
// by hand; the default is the one fixed seed.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  capturingErrors,
  envelopeTo,
  formedCluster,
  peerIdsOf,
} from './identity-reuse-harness.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {RUNTIME_FAULT_REPORT} from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_RS_MESSAGE_TYPE as T} from
  '../../../src/raft/raft-rs-ingress-constants.js';

const FORMED_ENTRIES = 4;
const FUZZ_SEEDS = (process.env.INGRESS_FUZZ_SEEDS || String(0x5eed1))
  .split(',').map(Number);
const PRE_VOTE_TYPES = Object.freeze([T.REQUEST_PRE_VOTE,
  T.REQUEST_PRE_VOTE_RESPONSE]);
const FUZZ_CASES = 2400;
const U64_MAX = '18446744073709551615';
const STEP = 'step';
const B64_JUNK = 'AAAA';

function faultsIn(lines) {
  return lines.filter(({context}) =>
    context.report === RUNTIME_FAULT_REPORT.CORE_TRAPPED ||
    context.report === RUNTIME_FAULT_REPORT.RUNTIME_REPLACED);
}

// The shapes, each as (ids, leader status) -> [recipient role, message].
const TRAP_SHAPES = Object.freeze({
  'vote request at term 0': (ids) => ['follower', {msgType: T.REQUEST_VOTE,
    from: ids.c, term: '0', logTerm: '0', index: '0'}],
  'pre-vote request at term 0': (ids) => ['follower', {
    msgType: T.REQUEST_PRE_VOTE, from: ids.c, term: '0'}],
  'timeout-now at term 0': (ids) => ['follower', {msgType: T.TIMEOUT_NOW,
    from: ids.a, term: '0'}],
  'forwarded proposal with a term': (ids, s) => ['follower', {
    msgType: T.PROPOSE, from: ids.c, term: String(s.term),
    entries: [{entryType: 0, data: 'e30='}]}],
  'transfer request at a follower with a leader': (ids, s) => ['follower', {
    msgType: T.TRANSFER_LEADER, from: ids.c, term: String(s.term)}],
  'read-index request without entries': (ids, s) => ['leader', {
    msgType: T.READ_INDEX, from: ids.b, term: '0', index: String(s.commit)}],
  'read-index response beyond the log': (ids, s) => ['follower', {
    msgType: T.READ_INDEX_RESPONSE, from: ids.a, term: String(s.term),
    index: String(s.commit + 50)}],
  'snapshot fabricating a prefix': (ids, s) => ['follower', {
    msgType: T.SNAPSHOT, from: ids.a, term: String(s.term),
    snapshot: {metadata: {index: String(s.commit + 50), term: '1',
      confState: {voters: [], learners: []}}, data: B64_JUNK}}],
  'append with a gap in its entries': (ids, s) => ['follower', {
    msgType: T.APPEND, from: ids.a, term: String(s.term),
    index: String(s.commit), logTerm: String(s.term),
    commit: String(s.commit),
    entries: [{index: String(s.commit + 5), term: String(s.term),
      entryType: 0}]}],
  'append beyond the log naming logTerm 0': (ids, s) => ['follower', {
    msgType: T.APPEND, from: ids.a, term: String(s.term),
    index: String(s.commit + 4), logTerm: '0', commit: String(s.commit + 5),
    entries: []}],
  'heartbeat at term u64::MAX': (ids) => ['follower', {
    msgType: T.HEARTBEAT, from: ids.a, term: U64_MAX, commit: '0'}],
  'forwarded configuration change': (ids) => ['leader', {
    msgType: T.PROPOSE, from: ids.b,
    entries: [{entryType: 2, data: B64_JUNK}]}],
  'forwarded entry that is not a proposal': (ids) => ['leader', {
    msgType: T.PROPOSE, from: ids.b,
    entries: [{entryType: 0, data: B64_JUNK}]}],
});

function shapedCluster(name) {
  const cluster = formedCluster(name, [`${name}-a`, `${name}-b`,
    `${name}-c`], FORMED_ENTRIES);
  const byRole = peerIdsOf(cluster);
  const ids = {a: byRole[`${name}-a`], b: byRole[`${name}-b`],
    c: byRole[`${name}-c`]};
  return {cluster, ids, leader: `${name}-a`, follower: `${name}-b`};
}

// One shape against a fresh group: what went wrong, or null.
async function shapeFailure(shape, build) {
  const {cluster, ids, leader, follower} = shapedCluster('f1');
  try {
    const status = cluster.node(leader).readStatus();
    const [role, message] = build(ids,
      {term: status.term, commit: Number(status.commitIndex)});
    const recipient = role === 'leader' ? leader : follower;
    const to = cluster.node(recipient).readStatus().peerId;
    const before = cluster.coreEntries.length;
    const lines = await capturingErrors(async () => {
      await cluster.node(recipient).step(envelopeTo(cluster.partitionId,
        to, message));
      await cluster.node(recipient).tick();
    });
    if (faultsIn(lines).length > 0) {
      return 'the core trapped';
    }
    if (cluster.coreEntries.slice(before).some((entry) =>
      entry.operation === STEP)) {
      return 'stepped';
    }
    const after = cluster.node(recipient).readStatus();
    if (after.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
      return `held: ${after.reason}`;
    }
    const commit = Number(status.commitIndex);
    cluster.propose(leader, {op: shape});
    cluster.tickers = [leader];
    return cluster.settle(() => Number(cluster.node(follower).readStatus()
      .commitIndex) > commit, {rounds: 100}) ? null :
      'the group stopped committing';
  } finally {
    cluster.dispose();
  }
}

test('F1: each shape raft-rs traps on is refused before step; no trap, ' +
  'no replacement, the group still commits', async () => {
  const failures = {};
  for (const [shape, build] of Object.entries(TRAP_SHAPES)) {
    const failure = await shapeFailure(shape, build);
    if (failure !== null) {
      failures[shape] = failure;
    }
  }
  assert.deepEqual(failures, {});
});

// mulberry32: a seeded, reproducible stream.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hostileGenerator(random) {
  const pick = (values) => values[Math.floor(random() * values.length)];
  const near = (value) => String(Math.max(0,
    Number(value) + Math.floor(random() * 9) - 4));
  const malformed = ['18446744073709551616', '-1', 1, 1.5, 'abc', null, ''];
  const position = (local) => random() < 0.04 ? pick(malformed) : pick([
    undefined, '0', '1', near(local.commit), near(local.commit),
    near(local.term), near(local.term), String(Math.floor(random() * 1e6)),
    U64_MAX]);
  const entry = (local, offset, base) => pick([
    () => ({index: String(base + 1 + offset), term: near(local.term),
      entryType: pick([0, 0, 1, 2])}),
    () => ({index: position(local), term: position(local),
      entryType: pick([0, 0, 1, 2, 3, -1]),
      data: pick([undefined, B64_JUNK, 'not-b64!', 'e30=', 5])}),
    () => pick([null, 5, 'x', []]),
  ])();
  const entries = (local) => {
    const roll = random();
    if (roll < 0.25) {
      return undefined;
    }
    if (roll < 0.27) {
      return pick(['x', 5, {}]);
    }
    const base = Number(near(local.commit));
    return Array.from({length: pick([0, 1, 1, 2, 3, 5, 20])},
      (_, offset) => entry(local, offset, base));
  };
  const snapshot = (local) => pick([{}, 'x', {metadata: {
    index: near(local.commit), term: near(local.term),
    confState: {voters: pick([[], local.voters]), learners: []}},
  data: B64_JUNK}]);
  return (local, ids) => {
    const message = {
      msgType: random() < 0.03 ? pick([-1, 19, 1.5, '3', undefined]) :
        pick([...Array(19).keys(), 3, 3, 3, 8, 8, 4, 5, 7, 15, 16, 17, 14,
          13, 2, 2]),
      from: random() < 0.03 ? pick(['x', 7, undefined]) :
        pick([...ids, ...ids, String(Math.floor(random() * 1e9)), '0']),
      term: position(local), logTerm: position(local),
      index: position(local), commit: position(local),
      rejectHint: position(local), reject: pick([undefined, true, false]),
      entries: entries(local),
      snapshot: random() < 0.2 ? snapshot(local) : undefined,
      context: pick([undefined, B64_JUNK, '!!']),
    };
    for (const key of Object.keys(message)) {
      if (message[key] === undefined ||
          (key !== 'msgType' && random() < 0.05)) {
        delete message[key];
      }
    }
    return message;
  };
}

// One seed's fuzz: the cases run, the faults reported (traps and runtime
// replacements apart), the groups held by a host failure, and how many
// pre-vote envelopes were generated and stepped into the core.
async function fuzzOneSeed(seed) {
  const random = seededRandom(seed);
  const hostile = hostileGenerator(random);
  const tally = {cases: 0, hostFailures: [], reseedHolds: 0,
    preVoteGenerated: 0, preVoteStepped: 0};
  let built = null;
  const rebuild = () => {
    built?.cluster.dispose();
    built = shapedCluster(`f2-${seed}-${tally.cases}`);
    built.cluster.tickers = [built.leader];
  };
  rebuild();
  let lines;
  try {
    lines = await capturingErrors(async () => {
      while (tally.cases < FUZZ_CASES) {
        const {cluster, ids} = built;
        const recipient = `${cluster.partitionId}-${pick3(random)}`;
        const status = cluster.node(recipient).readStatus();
        if (status.reason === COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED) {
          tally.reseedHolds += 1;
          rebuild();
          continue;
        }
        if (status.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
          tally.hostFailures.push({case: tally.cases, reason: status.reason});
          rebuild();
          continue;
        }
        const message = hostile({commit: status.commitIndex,
          term: status.term, voters: status.confState.voters},
        Object.values(ids));
        const preVote = PRE_VOTE_TYPES.includes(message.msgType);
        const before = cluster.coreEntries.length;
        await cluster.node(recipient).step(envelopeTo(cluster.partitionId,
          status.peerId, message));
        await cluster.node(recipient).tick();
        if (preVote) {
          tally.preVoteGenerated += 1;
          tally.preVoteStepped += cluster.coreEntries.slice(before).some(
            (entry) => entry.operation === STEP) ? 1 : 0;
        }
        cluster.settle(() => false, {rounds: 2});
        tally.cases += 1;
      }
    });
  } finally {
    built.cluster.dispose();
  }
  const faults = faultsIn(lines).map(({context}) => context);
  return {seed, ...tally,
    traps: faults.filter(({report}) =>
      report === RUNTIME_FAULT_REPORT.CORE_TRAPPED),
    replacements: faults.filter(({report}) =>
      report === RUNTIME_FAULT_REPORT.RUNTIME_REPLACED)};
}

test('F2: a seeded fuzz of hostile envelopes, pre-vote shapes included, ' +
  'through the single ingress traps no core, replaces no runtime and holds ' +
  'no group by a host failure', async (context) => {
  for (const seed of FUZZ_SEEDS) {
    const tally = await fuzzOneSeed(seed);
    context.diagnostic(JSON.stringify({seed, cases: tally.cases,
      traps: tally.traps.length, replacements: tally.replacements.length,
      hostFailures: tally.hostFailures.length,
      reseedHolds: tally.reseedHolds,
      preVoteGenerated: tally.preVoteGenerated,
      preVoteStepped: tally.preVoteStepped}));
    assert.deepEqual(tally.traps, [], `seed ${seed}: core traps`);
    assert.deepEqual(tally.replacements, [],
      `seed ${seed}: runtime replacements`);
    assert.deepEqual(tally.hostFailures, [],
      `seed ${seed}: groups held by a host failure`);
    assert.equal(tally.cases, FUZZ_CASES);
    assert.ok(tally.preVoteStepped > 0,
      `seed ${seed}: no pre-vote envelope reached the core ` +
      `(${tally.preVoteGenerated} generated)`);
  }
});

function pick3(random) {
  return ['a', 'b', 'c'][Math.floor(random() * 3)];
}
