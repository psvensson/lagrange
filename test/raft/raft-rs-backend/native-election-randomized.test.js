// Two randomized properties of the production election settings, fixed
// seeds, real WASM core (counts are bounded so the file stays fast; the
// RANDOMIZED_RUNS environment variable widens a run by hand):
//
//   S  safety of correct replicas on production partition ports under a
//      reordering, delaying, dropping and duplicating network, cuts,
//      restarts from the durable file, forwarded proposals and leadership
//      transfers: zero local-log-guard refusals, zero holds, zero core
//      traps; never two leaders in one term; committed prefixes agree;
//   L  conf-change liveness, differential: one seeded schedule of adds
//      (a joiner opened from a committed stamp; a lagging joiner reached
//      only by heartbeats), removals, learner promotions, temporary cuts and
//      leader loss runs on production ports and on raft-rs alone with the
//      same pre_vote / check_quorum settings (native-election-schedules.js);
//      wherever plain raft-rs ends with one agreed leader among the live
//      voters, the guarded stack does too.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {durableLog} from './committed-membership-oracles.js';
import {capturingErrors, lifecycleRow} from './identity-reuse-harness.js';
import {
  RAFT_RS_CONF_CHANGE_TYPE,
  SCHEDULE_KIND,
} from './native-election-schedules.js';
import {
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';

const RUNS = Number(process.env.RANDOMIZED_RUNS || 12);
const SAFETY_STEPS = 120;
const HEAL_ROUNDS = 300;
const LIVENESS_OPS = 6;
const OP_ROUNDS = 60;
const FINAL_ROUNDS = 400;
const LEADER = 'leader';

function rng(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function seeds(base) {
  return Array.from({length: RUNS}, (_, index) => base + index * 7919);
}

// One step of the adversarial-but-correct network: deliver a random subset
// in random order, keep some for later, drop a few, duplicate a few.
function shuffleDeliver(cluster, pending, random) {
  pending.sort(() => random() - 0.5);
  const kept = [];
  for (const item of pending.splice(0)) {
    const to = cluster.replicaIdOf(item.address);
    const roll = random();
    if (cluster.isolated.has(item.from) || cluster.isolated.has(to) ||
      roll < 0.08) {
      continue;
    }
    if (roll < 0.3) {
      kept.push(item);
      continue;
    }
    cluster.replicas.get(to)?.node.step(item.envelope);
    if (roll > 0.95) {
      kept.push(item);
    }
  }
  pending.push(...kept);
}

function act(cluster, ids, random, step) {
  const roll = random();
  const leader = ids.find((id) =>
    cluster.node(id).readStatus().role === LEADER);
  if (roll < 0.35) {
    cluster.node(pick(random, ids)).propose({op: 'p', step});
  } else if (roll < 0.40) {
    const victim = pick(random, ids);
    if (cluster.isolated.has(victim)) {
      cluster.heal(victim);
    } else if (cluster.isolated.size < Math.floor((ids.length - 1) / 2)) {
      cluster.isolate(victim);
    }
  } else if (roll < 0.46) {
    cluster.restart(random() < 0.4 && leader ? leader : pick(random, ids));
  } else if (roll < 0.49 && leader) {
    cluster.node(pick(random, ids)).transferLeadership({
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: pick(random, ids)});
  } else if (roll < 0.51) {
    for (const id of [...cluster.isolated]) {
      cluster.heal(id);
    }
  }
}

function recordLeaders(cluster, ids, leadersByTerm) {
  for (const id of ids) {
    const status = cluster.node(id).readStatus();
    assert.equal(status.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `${id}: ${status.reason}`);
    if (status.role === LEADER) {
      const set = leadersByTerm.get(status.term) ?? new Set();
      set.add(id);
      leadersByTerm.set(status.term, set);
      assert.equal(set.size, 1, `two leaders in term ${status.term}`);
    }
  }
}

function safetyRun(seed) {
  const random = rng(seed);
  const ids = Array.from({length: random() < 0.5 ? 3 : 5},
    (_, index) => `s${seed}-${index}`);
  const pending = [];
  const cluster = new PartitionNodeCluster({partitionId: `prop-${seed}`,
    replicaIds: ids, sendFor: (from, address, envelope) => {
      pending.push({from, address, envelope});
      return true;
    }});
  try {
    const leadersByTerm = new Map();
    for (let step = 0; step < SAFETY_STEPS; step += 1) {
      for (const id of ids) {
        if (random() < 0.7) {
          cluster.node(id).tick();
        }
      }
      shuffleDeliver(cluster, pending, random);
      act(cluster, ids, random, step);
      recordLeaders(cluster, ids, leadersByTerm);
    }
    for (const id of [...cluster.isolated]) {
      cluster.heal(id);
    }
    for (let round = 0; round < HEAL_ROUNDS; round += 1) {
      for (const item of pending.splice(0)) {
        cluster.replicas.get(cluster.replicaIdOf(item.address))?.node
          .step(item.envelope);
      }
      for (const id of ids) {
        cluster.node(id).tick();
      }
    }
    recordLeaders(cluster, ids, leadersByTerm);
    const commit = Math.min(...ids.map((id) =>
      Number(cluster.node(id).readStatus().commitIndex)));
    const prefixes = ids.map((id) => JSON.stringify(
      durableLog(cluster.dbFileOf(id), cluster.partitionId)
        .filter((entry) => Number(entry.index) <= commit)
        .map((entry) => [String(entry.index), String(entry.term)])));
    assert.ok(prefixes.every((prefix) => prefix === prefixes[0]),
      `committed prefixes disagree (seed ${seed})`);
    for (const id of ids) {
      const row = lifecycleRow(cluster, id);
      assert.ok(row === null || row.state === 'active',
        `${id} held (seed ${seed}): ${JSON.stringify(row)}`);
      const refusals = cluster.node(id).readStatus().inboundStepRefusals
        .filter((record) => record.phase === 'local-log-guard');
      assert.deepEqual(refusals, [], `${id} refused (seed ${seed})`);
    }
  } finally {
    cluster.dispose();
  }
}

test(`S: ${RUNS} randomized runs of correct replicas - no refusal, hold or ` +
  'trap; one leader per term; committed prefixes agree', async () => {
  const errors = await capturingErrors(() => {
    for (const seed of seeds(1009)) {
      safetyRun(seed);
    }
  });
  assert.deepEqual(errors.map(({context}) => context.report)
    .filter(Boolean), [], 'a runtime fault was reported');
});

const {ADD_NODE, REMOVE_NODE, ADD_LEARNER_NODE} = RAFT_RS_CONF_CHANGE_TYPE;

// One seeded membership operation, chosen by the stack's own state.
function livenessOp({schedule, random, leader, voters, members, live,
  nextJoiner}) {
  const roll = random();
  if (leader === null || roll >= 0.8 || (roll >= 0.65 && voters.length < 3)) {
    const victim = pick(random, live());
    schedule.lost.add(victim);
    schedule.run(live(), Math.floor(random() * OP_ROUNDS));
    schedule.lost.delete(victim);
  } else if (roll < 0.35) {
    const name = nextJoiner();
    schedule.join(leader, name);
    members.add(name);
    if (random() < 0.5) {
      schedule.onlyHeartbeatsTo.add(name);
    }
    schedule.change(leader, random() < 0.3 ? ADD_LEARNER_NODE : ADD_NODE,
      name);
  } else if (roll < 0.55 && voters.length > 2) {
    schedule.change(leader, REMOVE_NODE,
      pick(random, voters.filter((name) => name !== leader)));
  } else if (roll < 0.65) {
    const learner = [...members].find((name) =>
      schedule.learners(leader).includes(name));
    if (learner) {
      schedule.change(leader, ADD_NODE, learner);
    }
  } else {
    schedule.lost.add(leader);
  }
}

// One seeded schedule on one stack. Decisions read the stack's own state
// (who leads, who votes), so both stacks follow the same script of choices.
function livenessRun(Kind, seed) {
  const random = rng(seed);
  const schedule = new Kind(`lv${seed}`, ['a', 'b', 'c']);
  const members = new Set(['a', 'b', 'c']);
  let joined = 0;
  const trace = [];
  const live = () => [...members].filter((name) => !schedule.lost.has(name));
  try {
    schedule.run(['a'], OP_ROUNDS, () => schedule.leaderOf(live()) !== null);
    for (let op = 0; op < LIVENESS_OPS; op += 1) {
      const leader = schedule.leaderOf(live());
      const voters = leader === null ? [] : schedule.voters(leader);
      trace.push([leader, voters.join()]);
      livenessOp({schedule, random, leader, voters, members, live,
        nextJoiner: () => `j${joined += 1}`});
      schedule.run(live(), OP_ROUNDS);
      schedule.onlyHeartbeatsTo.clear();
    }
    const elected = schedule.run(live(), FINAL_ROUNDS, () => {
      // The live voters (each by its own configuration) agree on one
      // leader; a learner, or a joiner removed before its admission (a
      // learner of its own C_j for good, as plain raft-rs's joiner is a
      // non-member of its own), takes no part in an election.
      const leader = schedule.leaderOf(live().filter((name) =>
        schedule.voters(name).includes(name)));
      return leader !== null;
    });
    // The configuration the most advanced live replica holds, and whether a
    // quorum of it is live: then a correct Raft must elect.
    const newest = live().reduce((best, name) =>
      best === null || schedule.term(name) > schedule.term(best) ? name :
        best, null);
    const config = newest === null ? [] : schedule.voters(newest);
    const quorumLive = config.filter((name) => live().includes(name))
      .length > config.length / 2;
    return {elected, quorumLive, trace: JSON.stringify(trace),
      terms: live().map((name) => schedule.term(name))};
  } finally {
    schedule.dispose();
  }
}

test(`L: ${RUNS} seeded conf-change schedules - the guarded stack never ` +
  'stays leaderless where plain raft-rs (same pre_vote / check_quorum) ' +
  'elects', async (context) => {
  const outcomes = [];
  await capturingErrors(() => {
    for (const seed of seeds(2003)) {
      outcomes.push({seed, guarded: livenessRun(SCHEDULE_KIND.guarded, seed),
        plain: livenessRun(SCHEDULE_KIND.plain, seed)});
    }
  });
  // raft-rs draws its election timeouts from its own randomness, so two
  // stacks fed one seed may elect different leaders and the schedules
  // diverge: the differential compares runs whose decision traces agree;
  // every guarded run must elect wherever a quorum of its newest
  // configuration is live.
  const lockedOut = outcomes.filter(({guarded, plain}) =>
    (guarded.trace === plain.trace && plain.elected && !guarded.elected) ||
    (guarded.quorumLive && !guarded.elected));
  assert.deepEqual(lockedOut, [], JSON.stringify(lockedOut));
  const matched = outcomes.filter(({guarded, plain}) =>
    guarded.trace === plain.trace).length;
  assert.ok(matched >= RUNS / 4, `too few matched schedules: ${matched}`);
  context.diagnostic(JSON.stringify({runs: RUNS, matched,
    plainElected: outcomes.filter(({plain}) => plain.elected).length,
    guardedElected: outcomes.filter(({guarded}) => guarded.elected).length,
    quorumLive: outcomes.filter(({guarded}) => guarded.quorumLive).length}));
  assert.ok(outcomes.filter(({plain}) => plain.elected).length >= RUNS / 2,
    `too few schedules elect at all: ${JSON.stringify(outcomes)}`);
});
