// Receipts:
//   a-vote-granted-is-never-recast-in-the-same-term-after-power-loss
//   no-raft-promise-is-lost-after-it-was-sent
//   committed-entries-survive-a-correlated-power-loss-of-every-replica
//
// A crash-consistency model over the real schema and the real three-replica
// core (owner decision 2026-10-05, "option 2"). Power loss is modelled as
// exactly what SQLite in WAL mode can lose: every commit after the last one
// that reached the disk. A commit reaches the disk when SQLite syncs it - a
// commit made while the connection's `PRAGMA synchronous` is FULL (read on
// the real connection immediately before COMMIT), or a checkpoint. Because
// the WAL is append-only, a synced commit also makes every earlier commit of
// that file durable; so the durable image of a replica is its whole database
// as of its last synced commit (`db.serialize()` taken right after it), and a
// power loss replaces the file with that image.
//
// The model is pessimistic for NORMAL only in ignoring automatic checkpoints
// (a checkpoint syncs too, so real SQLite may keep more); it never keeps a
// write SQLite could lose. The files live on tmpfs when the host has one: the
// model reads the level SQLite committed under, not the disk.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import {test} from 'node:test';

import {
  RAFT_OPERATION_PORT_REQUEST,
} from '../../../src/raft/raft-operation-port-request.js';
import {RAFT_RS_TABLE} from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import {REPLICA_DB_PRAGMA} from '../../../src/storage/storage-constants.js';
import {installDurableCommitObserver} from './durable-commit-observer.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const FOUNDING = Object.freeze(['replica-a', 'replica-b', 'replica-c']);
const LEADER_STATE = 2;
const PRE_CANDIDATE_STATE = 3;
const SETTLE_ROUNDS = 200;
const DELIVERY_ROUNDS = 12;
const SEEDS = 200;
const STEPS_PER_SEED = 60;
const RECOVERY_ROUNDS = 400;
const MAJORITY = 2;
const TMPFS = '/dev/shm';
const CHECKPOINT = 'wal_checkpoint(TRUNCATE)';
const ZERO_SUMMARY = Object.freeze({term: '0', vote: '0', lastIndex: '0',
  lastTerm: '0'});
const FILE_SUFFIXES = Object.freeze(['', '-wal', '-shm']);

function tempRoot() {
  return fs.existsSync(TMPFS) ? TMPFS : os.tmpdir();
}

// mulberry32: a small seeded generator, so every schedule is reproducible
// from its seed.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// What a replica has promised its peers: its term, its vote and the tail of
// its log, read from its record on its own connection.
function promiseSummary(db, groupId) {
  const hardState = db.prepare(
    `SELECT term, vote FROM ${RAFT_RS_TABLE.HARD_STATE} WHERE group_id = ?`)
    .safeIntegers(true).get(groupId);
  const last = db.prepare(
    `SELECT log_index, term FROM ${RAFT_RS_TABLE.LOG} WHERE group_id = ? ` +
    'ORDER BY log_index DESC LIMIT 1').safeIntegers(true).get(groupId);
  return {
    term: String(hardState?.term ?? 0n),
    vote: String(hardState?.vote ?? 0n),
    lastIndex: String(last?.log_index ?? 0n),
    lastTerm: String(last?.term ?? 0n),
  };
}

function logEntriesUpTo(db, groupId, index) {
  return db.prepare(
    `SELECT log_index, term FROM ${RAFT_RS_TABLE.LOG} ` +
    'WHERE group_id = ? AND log_index <= ? ORDER BY log_index')
    .safeIntegers(true).all(groupId, BigInt(index))
    .map((row) => [String(row.log_index), String(row.term)]);
}

/**
 * One partition under the power-loss model.
 */
class PowerLossPartition {
  constructor(partitionId) {
    this.partitionId = partitionId;
    this.images = new Map();
    this.synced = new Map();
    this.blocked = new Set();
    this.violations = [];
    this.leadersByTerm = new Map();
    this.committed = new Map();
    this.sends = 0;
    this.powerLosses = 0;
    this.observer = installDurableCommitObserver({
      onDurableCommit: (db) => this.capture(db),
    });
    this.cluster = new PartitionNodeCluster({
      partitionId,
      replicaIds: FOUNDING,
      tempRoot: tempRoot(),
      wrapDatabase: (replicaId, db) => {
        db.pragma(REPLICA_DB_PRAGMA.JOURNAL_MODE);
        db.pragma(REPLICA_DB_PRAGMA.SYNCHRONOUS);
        return db;
      },
      sendFor: (replicaId, address) => this.send(replicaId, address),
    });
    this.cluster.tickers = [];
  }

  /** The replica's database file IS its disk; take what reached it. */
  capture(db) {
    if (!db.open || db.inTransaction) {
      return;
    }
    this.images.set(db.name, db.serialize());
    this.synced.set(db.name, promiseSummary(db, this.partitionId));
  }

  /**
   * A checkpoint syncs under NORMAL too: the model's one other sync point.
   * @param {string} replicaId - The replica.
   */
  checkpoint(replicaId) {
    const {db} = this.cluster.replica(replicaId);
    db.pragma(CHECKPOINT);
    this.capture(db);
  }

  send(replicaId, address) {
    const to = this.cluster.replicaIdOf(address);
    // A promise is anything in the sender's term, vote and log: it must
    // already be on the sender's disk when a message leaves.
    const {db} = this.cluster.replica(replicaId);
    const live = promiseSummary(db, this.partitionId);
    const durable = this.synced.get(db.name) ?? ZERO_SUMMARY;
    this.sends += 1;
    if (JSON.stringify(live) !== JSON.stringify(durable)) {
      this.violations.push({kind: 'promise-not-durable-at-send',
        replicaId, live, durable});
    }
    if (this.blocked.has(`${replicaId}>${to}`)) {
      return null;
    }
    return undefined;
  }

  cut(replicaId) {
    for (const other of FOUNDING) {
      if (other !== replicaId) {
        this.blocked.add(`${replicaId}>${other}`);
        this.blocked.add(`${other}>${replicaId}`);
      }
    }
    this.cluster.replica(replicaId).inbox.length = 0;
  }

  heal(replicaId) {
    for (const link of [...this.blocked]) {
      if (link.split('>').includes(replicaId)) {
        this.blocked.delete(link);
      }
    }
  }

  /**
   * Lose power on one replica: its process stops and its files become what
   * last reached the disk; it then boots from them through the same seam.
   * @param {string} replicaId - The replica.
   */
  powerLoss(replicaId) {
    const replica = this.cluster.replica(replicaId);
    this.powerLosses += 1;
    replica.node.close();
    replica.db.close();
    for (const suffix of FILE_SUFFIXES) {
      fs.rmSync(`${replica.dbFile}${suffix}`, {force: true});
    }
    const image = this.images.get(replica.dbFile);
    if (image !== undefined) {
      fs.writeFileSync(replica.dbFile, image);
    }
    this.synced.set(replica.dbFile,
      this.synced.get(replica.dbFile) ?? ZERO_SUMMARY);
    this.cluster.buildReplica(replicaId,
      replica.request[RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_PEER_IDS],
      replica.extraRequest);
  }

  deliver(rounds = 1) {
    for (let round = 0; round < rounds; round += 1) {
      this.cluster.deliverAll();
      this.observe();
    }
  }

  /** Election safety and log matching, observed after every step. */
  observe() {
    for (const replicaId of FOUNDING) {
      const replica = this.cluster.replica(replicaId);
      let status;
      try {
        status = this.cluster.coreStatus(replicaId);
      } catch {
        continue;
      }
      if (status.raftState === LEADER_STATE) {
        const leaders = this.leadersByTerm.get(status.term) ?? new Set();
        const known = leaders.has(replicaId);
        leaders.add(replicaId);
        this.leadersByTerm.set(status.term, leaders);
        if (!known && leaders.size > 1) {
          this.violations.push({kind: 'two-leaders-in-one-term',
            term: status.term, leaders: [...leaders]});
        }
      }
      for (const [index, term] of logEntriesUpTo(
        replica.db, this.partitionId, status.commit)) {
        const known = this.committed.get(index);
        if (known !== undefined && known !== term) {
          this.violations.push({kind: 'committed-entry-replaced',
            replicaId, index, term, known});
        }
        this.committed.set(index, term);
      }
    }
  }

  /**
   * Every committed entry must still be held by a majority after every
   * replica lost power at once (the correlated case).
   */
  checkCommittedSurviveTotalPowerLoss() {
    for (const replicaId of FOUNDING) {
      this.powerLoss(replicaId);
    }
    for (const [index, term] of this.committed) {
      const holders = FOUNDING.filter((replicaId) =>
        logEntriesUpTo(this.cluster.replica(replicaId).db, this.partitionId,
          index).some(([held, heldTerm]) => held === index &&
          heldTerm === term)).length;
      if (holders < MAJORITY) {
        this.violations.push({kind: 'committed-entry-lost',
          index, term, holders});
      }
    }
  }

  leaderOf() {
    const leaders = FOUNDING.filter((replicaId) => {
      try {
        return this.cluster.coreStatus(replicaId).raftState === LEADER_STATE;
      } catch {
        return false;
      }
    });
    return leaders.length === 1 ? leaders[0] : null;
  }

  dispose() {
    this.observer.uninstall();
    this.cluster.dispose();
  }
}

test('a vote granted before a power loss is never cast again in the same ' +
  'term (deterministic three-replica schedule)', async () => {
  const model = new PowerLossPartition('power-loss-vote');
  const [a, b, c] = FOUNDING;
  try {
    model.cluster.tickers = [a];
    assert.ok(model.cluster.settle(() => model.leaderOf() === a &&
      FOUNDING.every((replicaId) => model.cluster.coreStatus(replicaId)
        .lead === model.cluster.raftPeerIdOf(a)), {rounds: SETTLE_ROUNDS}),
    'replica-a leads');
    model.cluster.propose(a, 'before-the-election');
    model.cluster.tickers = [];
    model.deliver(DELIVERY_ROUNDS);
    // Every replica's disk holds the formed group (a checkpoint): what is
    // at stake below is only what happens after it.
    for (const replicaId of FOUNDING) {
      model.checkpoint(replicaId);
    }
    const formedTerm = model.cluster.coreStatus(a).term;

    // Once a is cut off, first let b's native lease expire into pre-candidate
    // while c still holds its lease; then let c's own lease expire. The core's
    // ordinary pre-vote/vote path elects c with b's vote — no host campaign
    // bypasses check-quorum or the lease.
    model.cut(a);
    model.cluster.tickers = [b];
    assert.ok(model.cluster.settle(() =>
      model.cluster.coreStatus(b).raftState === PRE_CANDIDATE_STATE,
    {rounds: SETTLE_ROUNDS}),
    'replica-b reaches pre-candidate only after its native lease expires');
    model.cluster.tickers = [c];
    assert.ok(model.cluster.settle(() =>
      model.cluster.coreStatus(c).raftState === LEADER_STATE,
    {rounds: SETTLE_ROUNDS}),
    'replica-c leads after its native lease expires');
    const cTerm = model.cluster.coreStatus(c).term;
    assert.equal(BigInt(cTerm), BigInt(formedTerm) + 1n);

    // b loses power, c is cut off, and b and a become the reachable pair.
    // Expire a's surviving old-leader lease before b's own election timeout;
    // b must win through the ordinary pre-vote/vote path using the vote that
    // survived its power loss.
    model.powerLoss(b);
    model.heal(a);
    model.cut(c);
    model.blocked.add(`${a}>${b}`);
    model.cluster.tickers = [a];
    assert.ok(model.cluster.settle(() =>
      model.cluster.coreStatus(a).raftState === PRE_CANDIDATE_STATE,
    {rounds: SETTLE_ROUNDS}),
    'replica-a reaches pre-candidate only after its native lease expires');
    model.blocked.delete(`${a}>${b}`);
    model.cluster.tickers = [b];
    assert.ok(model.cluster.settle(() =>
      model.cluster.coreStatus(b).raftState === LEADER_STATE,
    {rounds: SETTLE_ROUNDS}),
    'replica-b leads the partition it can reach after native lease expiry');

    const recast = model.violations.filter((violation) =>
      violation.kind === 'two-leaders-in-one-term');
    assert.deepEqual(recast, [],
      `replica-b led term ${model.cluster.coreStatus(b).term} after voting ` +
      `for replica-c in term ${cTerm}: its vote did not survive the power ` +
      'loss');
    assert.deepEqual(model.violations, [],
      `no promise was lost: ${JSON.stringify(model.violations.slice(0, 3))}`);
  } finally {
    model.dispose();
  }
});

function runSchedule(seed) {
  const random = seededRandom(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const model = new PowerLossPartition(`power-loss-${seed}`);
  try {
    for (const replicaId of FOUNDING) {
      model.checkpoint(replicaId);
    }
    let proposals = 0;
    for (let step = 0; step < STEPS_PER_SEED; step += 1) {
      const roll = random();
      const replicaId = pick(FOUNDING);
      if (roll < 0.35) {
        model.cluster.tick(replicaId);
      } else if (roll < 0.55) {
        const leader = model.leaderOf();
        if (leader !== null) {
          model.cluster.propose(leader, `seed-${seed}-command-${proposals}`);
          proposals += 1;
        }
      } else if (roll < 0.65) {
        model.cluster.node(replicaId).campaign();
      } else if (roll < 0.75) {
        if (model.blocked.size === 0) {
          model.cut(replicaId);
        } else {
          model.heal(replicaId);
        }
      } else if (roll < 0.85) {
        model.powerLoss(replicaId);
      }
      model.deliver();
    }
    model.checkCommittedSurviveTotalPowerLoss();
    for (const replicaId of FOUNDING) {
      model.heal(replicaId);
    }
    model.cluster.tickers = [...FOUNDING];
    const recovered = model.cluster.settle(() => {
      model.observe();
      return model.leaderOf() !== null;
    }, {rounds: RECOVERY_ROUNDS});
    return {seed, recovered, violations: model.violations,
      committed: model.committed.size, sends: model.sends,
      powerLosses: model.powerLosses, terms: model.leadersByTerm.size};
  } finally {
    model.dispose();
  }
}

test(`randomized schedules with power-loss points (${SEEDS} seeds): one ` +
  'leader per term, no promise lost, committed entries survive', async (t) => {
  const results = [];
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    results.push(runSchedule(seed));
  }
  const failing = results.filter((result) => result.violations.length > 0);
  const byKind = {};
  // How many seeds broke each property.
  for (const result of failing) {
    for (const kind of new Set(result.violations.map(({kind}) => kind))) {
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
  }
  const committed = results.reduce((sum, result) =>
    sum + result.committed, 0);
  const sends = results.reduce((sum, result) => sum + result.sends, 0);
  const total = (field) => results.reduce((sum, result) =>
    sum + result[field], 0);
  t.diagnostic(`seeds=${SEEDS} powerLosses=${total('powerLosses')} ` +
    `committedEntries=${committed} sends=${sends} ` +
    `ledTerms=${total('terms')} failingSeeds=${failing.length} ` +
    `byKind=${JSON.stringify(byKind)}`);
  assert.ok(committed > SEEDS, `the schedules committed entries (${
    committed}) and sent messages (${sends})`);
  assert.deepEqual({failingSeeds: failing.length, byKind}, {
    failingSeeds: 0, byKind: {}},
  `first failing seed: ${JSON.stringify(failing[0]?.violations.slice(0, 2))}`);
  const unrecovered = results.filter((result) => !result.recovered)
    .map((result) => result.seed);
  assert.deepEqual(unrecovered, [],
    'every schedule elects a leader again once healed');
});
