// The differential oracle's machinery for the F1 claim (quest
// f1-step-down-port; coverage-model.md as amended by
// coverage-model-amendment-1.md):
//
//   a decision made when relevant raft messages are already pending must
//   produce the same externally relevant result as that decision made after
//   those messages have first been processed.
//
// A CELL builds one cluster state and names a requester, the envelopes left
// pending at it, and a request. The oracle runs the cell twice from scratch,
// with the same identities (so the same raft ids) and the same delivery order:
//
//   PENDING   - the envelopes are handed to the requester's step() and left
//               unprocessed, then the request is made;
//   PROCESSED - the same envelopes are handed over and processed first by the
//               requester's own status read (a drain that never ticks), then
//               the same request is made.
//
// It returns everything the claim calls externally relevant, observed the
// same way in both runs, so the test compares the two and never an expected
// literal: the answer record; the requester's outbound (type, to) trace from
// the hand-over to the end of the request's turn; every replica's role, term,
// leaderId and ConfState at election tick - 1 rounds (exact) and, for the
// cells that ask, at twice the largest election tick (exact when a transferee
// is named, by class only for declared timeout-driven cells); the role, term
// and leader event stream of every replica; the durable record (hard state,
// applied ConfState, log); and a crash-and-recover of the requester.
//
// Anti-vacuity is read from the actual-core-entry log and from the shapes of
// the reads, never from the path under test: the reference drain must step
// every delivered envelope and answer a status; the pending request's turn
// must begin with a delivered step and step all of them; an observation that
// is not a status record fails.
//
// Axes: send mode (synchronous, or every send a promise released on the next
// microtask, or held until the test releases it), per-replica-index timing
// derived by the production owner (computeReplicaElectionTimeouts), listener
// re-entry (role and leader listeners that read status, as production's do),
// and admission closed by a real BEGIN on the requester's database.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import Database from 'better-sqlite3';

import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {PARTITION_SERVICE_VALUE} from
  '../../../src/partition/partition-service-constants.js';
import {
  RAFT_EVENT,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_TABLE} from
  '../../../src/raft/raft-rs-durable-store-constants.js';
import {
  RAFT_RS_MESSAGE_TYPE_RANGE,
  RAFT_RS_TRANSPORT_PROTOCOL,
} from '../../../src/raft/raft-rs-ingress-constants.js';
import {encodeProposal} from '../../../src/raft/raft-rs-proposal-codec.js';
import {computeReplicaElectionTimeouts} from
  '../../../src/raft/replica-election-timeouts.js';
import {TransferLeadershipDriver} from './transfer-leadership-driver.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BINDING_SOURCE = 'vendor/raft-rs-wasm/src/lib.rs';
const RAW_NODE_SOURCE = 'vendor/raft-rs-wasm/raft-0.7.0/src/raw_node.rs';
const MESSAGE_TYPE_FN = /fn num_to_msg_type\([^)]*\)[^{]*\{([\s\S]*?)\n\}/u;
const MESSAGE_TYPE_ARM = /(\d+)\s*=>\s*(Msg\w+)\s*,/gu;
const MESSAGE_NAME = /MessageType::(Msg\w+)/gu;
const STEP = 'step';
const PAYLOAD_ENCODING = 'base64';
const UNSYNCED_WRITES = 'synchronous = OFF';
const ENTRY_NORMAL = 0;
// Microtask and macrotask turns a flush yields, so every promise chain the
// runtime started (sends released on a microtask) completes before a read.
const FLUSH_TURNS = 2;
// A burst of deliveries converges when the transport is quiet.
const DELIVERY_BOUND = 1000;
const FORMATION_WRITES = 3;
const ROLE_EVENTS = Object.freeze([
  RAFT_EVENT.LEADER, RAFT_EVENT.FOLLOWER, RAFT_EVENT.CANDIDATE]);

const MODE = Object.freeze({PENDING: 'pending', PROCESSED: 'processed'});
const SEND_MODE = Object.freeze({SYNC: 'sync', ASYNC: 'async'});
const TIMING_MODE = Object.freeze({
  HOMOGENEOUS: 'homogeneous',
  PER_INDEX: 'per-index',
});
const BASE_AXES = Object.freeze({
  send: SEND_MODE.SYNC, timing: TIMING_MODE.HOMOGENEOUS, reentry: true,
});

function functionBody(source, pattern, name) {
  const body = pattern.exec(source);
  assert.notEqual(body, null, `${name} is defined`);
  return body[1];
}

/**
 * The binding's message-type universe, from its own sources: every type
 * num_to_msg_type decodes, and raft-rs's is_local_msg and is_response_msg.
 * @return {Object} {types: Map name -> number, local: Set, response: Set,
 *   max}.
 */
function bindingEnumerations() {
  const binding = fs.readFileSync(path.join(ROOT, BINDING_SOURCE), 'utf8');
  const rawNode = fs.readFileSync(path.join(ROOT, RAW_NODE_SOURCE), 'utf8');
  const types = new Map([...functionBody(binding, MESSAGE_TYPE_FN,
    'num_to_msg_type').matchAll(MESSAGE_TYPE_ARM)]
    .map(([, number, name]) => [name, Number(number)]));
  const namesIn = (fn) => new Set([...functionBody(rawNode,
    new RegExp(`fn ${fn}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`, 'u'), fn)
    .matchAll(MESSAGE_NAME)].map(([, name]) => name));
  return {
    types,
    local: namesIn('is_local_msg'),
    response: namesIn('is_response_msg'),
    max: Math.max(...types.values()),
    rangeMax: RAFT_RS_MESSAGE_TYPE_RANGE.MAX,
  };
}

// Production's own per-replica election timing: the default base plus the
// per-index jitter, derived by the owner that derives it for a partition.
function perIndexTiming(replicaIds) {
  return (replicaId) => {
    const {electionMinMs, electionMaxMs} = computeReplicaElectionTimeouts({
      replicaId, replicaIds,
      baseElectionMinMs:
        PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MIN_DEFAULT_MS,
      baseElectionMaxMs:
        PARTITION_SERVICE_VALUE.LIFERAFT_ELECTION_MAX_DEFAULT_MS,
      electionJitterPerReplicaMs:
        PARTITION_SERVICE_VALUE.ELECTION_JITTER_PER_REPLICA_MS,
    });
    return {
      heartbeatMs: PARTITION_SERVICE_VALUE.LIFERAFT_HEARTBEAT_DEFAULT_MS,
      electionMinMs,
      electionMaxMs,
    };
  };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function assertStatusRecord(status, what) {
  assert.equal(status?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    `${what} is a status record, not an outcome: ${JSON.stringify(status)}`);
  assert.equal(typeof status.role, 'string', `${what} carries a role`);
}

function sortedIds(ids) {
  return [...(ids || [])].map(String).sort();
}

/**
 * One cluster run of a cell: the driver, its send and event hooks, and the
 * readings the oracle compares.
 */
class OracleRun {
  /**
   * @param {Object} shape - {partitionId, replicaIds, axes}.
   */
  constructor({partitionId, replicaIds, axes}) {
    this.axes = {...BASE_AXES, ...axes};
    this.replicaIds = [...replicaIds];
    this.asyncSends = false;
    this.holdSends = false;
    this.held = [];
    this.recording = null;
    this.requester = null;
    this.streams = new Map();
    this.projections = new Map();
    this.driver = new TransferLeadershipDriver({
      partitionId,
      replicaIds,
      timingFor: this.axes.timing === TIMING_MODE.PER_INDEX ?
        perIndexTiming(replicaIds) : null,
      sendFor: (from, address, packet) => this.send(from, address, packet),
      // The files are the durable record the oracle reads back; the OS cache
      // is enough for that, so the harness skips the fsync each commit costs.
      wrapDatabase: (replicaId, database) => {
        database.pragma(UNSYNCED_WRITES);
        return database;
      },
    });
    for (const replicaId of this.replicaIds) {
      this.watch(replicaId);
    }
  }

  /**
   * The transport hook: record the requester's outbound; in async mode the
   * envelope is queued here and the send answers a promise.
   * @param {string} from - The sender.
   * @param {string} address - The recipient's address.
   * @param {Object} packet - The envelope.
   * @return {*} undefined (the cluster queues), or a promise.
   */
  send(from, address, packet) {
    if (this.recording !== null && from === this.requester) {
      this.recording.push([packet.message.msgType,
        this.driver.cluster.replicaIdOf(address)]);
    }
    if (!this.asyncSends) {
      return undefined;
    }
    this.driver.cluster.queue(from, address, packet);
    if (this.holdSends) {
      return new Promise((resolve) => this.held.push(resolve));
    }
    return Promise.resolve();
  }

  /** Release every held send. */
  releaseHeld() {
    this.holdSends = false;
    for (const resolve of this.held.splice(0)) {
      resolve();
    }
  }

  // The role, term and leader events of one replica: the stream, and the
  // projection a subscriber builds from them (D7's output).
  watch(replicaId) {
    const port = this.driver.port(replicaId);
    const status = port.readStatus();
    this.streams.set(replicaId, []);
    this.projections.set(replicaId, {role: status.role, term: status.term,
      leaderId: status.leaderId});
    const record = (event, update) => (payload = null) => {
      this.streams.get(replicaId).push([event, payload]);
      Object.assign(this.projections.get(replicaId), update(payload));
      if (this.axes.reentry) {
        port.readStatus();
      }
    };
    for (const role of ROLE_EVENTS) {
      port.subscribe(role, record(role, () => ({role})));
    }
    port.subscribe(RAFT_EVENT.TERM_CHANGE,
      record(RAFT_EVENT.TERM_CHANGE, (term) => ({term})));
    port.subscribe(RAFT_EVENT.LEADER_CHANGE,
      record(RAFT_EVENT.LEADER_CHANGE, (leaderId) => ({leaderId})));
  }

  resetStreams() {
    for (const stream of this.streams.values()) {
      stream.length = 0;
    }
  }

  connected() {
    return this.replicaIds.filter((replicaId) =>
      !this.driver.cluster.isolated.has(replicaId)).sort();
  }

  // Let every turn the runtime queued finish. A turn may be asynchronous
  // even with synchronous sends: a listener's read queues behind the turn
  // that announced to it.
  async settle() {
    for (let turn = 0; turn < FLUSH_TURNS; turn += 1) {
      await flush();
    }
  }

  /**
   * One port operation, settled.
   * @param {Function} operation - It calls the port.
   * @return {Promise<*>} Its answer.
   */
  async act(operation) {
    const answer = operation();
    await this.settle();
    return answer;
  }

  async deliverOnly(replicaIds) {
    for (const replicaId of replicaIds) {
      this.driver.stepUndrained(replicaId);
      this.driver.port(replicaId).readStatus();
      await this.settle();
    }
  }

  async propose(replicaId, command) {
    const answer = await this.act(() =>
      this.driver.port(replicaId).propose(command));
    await this.deliver();
    return answer;
  }

  async elect(replicaId) {
    await this.act(() => this.driver.port(replicaId).campaign());
    await this.deliver();
    return this.inputsOf(replicaId).role === RAFT_ROLE.LEADER;
  }

  // The first replica elects itself and commits a few writes.
  async form() {
    const [leader] = this.replicaIds;
    assert.equal(await this.elect(leader), true, 'the first replica leads');
    for (let write = 0; write < FORMATION_WRITES; write += 1) {
      const command = {formation: write};
      await this.propose(leader, command);
      assert.equal(this.driver.applied(leader, command), true,
        'formation commits');
    }
  }

  // Tick one port without delivery until its heartbeat reaches a recipient.
  async tickUntilHeartbeat(ticking, recipient) {
    const heartbeat = bindingEnumerations().types.get('MsgHeartbeat');
    const inbox = this.driver.cluster.replica(recipient).inbox;
    const held = () => inbox.some((envelope) =>
      envelope.message.msgType === heartbeat);
    for (let tick = 0; !held() &&
      tick < this.driver.electionTickOf(ticking); tick += 1) {
      await this.act(() => this.driver.port(ticking).tick());
    }
    assert.ok(held(), `setup: ${ticking}'s heartbeat reached ${recipient}`);
  }

  leads(replicaId) {
    return this.inputsOf(replicaId).role === RAFT_ROLE.LEADER;
  }

  async deliver() {
    for (let burst = 0; burst < DELIVERY_BOUND; burst += 1) {
      let moved = 0;
      for (const replicaId of this.replicaIds) {
        moved += this.driver.stepUndrained(replicaId);
        this.driver.port(replicaId).readStatus();
      }
      await this.settle();
      if (moved === 0) {
        return;
      }
    }
    throw new Error('delivery did not quiesce');
  }

  async round() {
    for (const replicaId of this.replicaIds) {
      if (!this.driver.crashed.has(replicaId)) {
        this.driver.port(replicaId).tick();
      }
    }
    await this.settle();
    await this.deliver();
  }

  // The rounds before any follower's randomized timeout could fire: one
  // less than the smallest election tick of a connected replica.
  exactRounds() {
    return Math.min(...this.connected().map((replicaId) =>
      this.driver.electionTickOf(replicaId))) - 1;
  }

  settledRounds() {
    return 2 * Math.max(...this.replicaIds.map((replicaId) =>
      this.driver.electionTickOf(replicaId)));
  }

  inputsOf(replicaId) {
    const status = this.driver.port(replicaId).readStatus();
    assertStatusRecord(status, `${replicaId}'s status`);
    return {
      role: status.role, term: status.term, leaderId: status.leaderId,
      // The runtime's own record of refused inbound steps, where it keeps
      // one; compared like every other observation.
      inboundStepRefusals: status.inboundStepRefusals ?? null,
      progress: status.followerProgress,
      voters: sortedIds(status.confState.voters),
      learners: sortedIds(status.confState.learners),
    };
  }

  observe() {
    return this.connected().map((replicaId) => {
      const inputs = this.inputsOf(replicaId);
      return {replicaId, role: inputs.role, term: inputs.term,
        leaderId: inputs.leaderId, voters: inputs.voters,
        learners: inputs.learners,
        inboundStepRefusals: inputs.inboundStepRefusals};
    });
  }

  // Every connected replica whose subscriber projection differs from its
  // core's status (D7: the event stream must end where the core is).
  projectionMismatches() {
    return this.connected().flatMap((replicaId) => {
      const {role, term, leaderId} = this.inputsOf(replicaId);
      const projected = this.projections.get(replicaId);
      const core = {role, term, leaderId};
      return JSON.stringify(projected) === JSON.stringify(core) ? [] :
        [{replicaId, projected: {...projected}, core}];
    });
  }

  durable() {
    return this.connected().map((replicaId) => {
      const independent = new Database(
        this.driver.cluster.replica(replicaId).dbFile, {readonly: true});
      try {
        const groupId = this.driver.cluster.partitionId;
        const hard = independent.prepare(
          `SELECT term, vote, commit_index FROM ${RAFT_RS_TABLE.HARD_STATE} ` +
          'WHERE group_id = ?').get(groupId);
        const applied = independent.prepare(
          'SELECT applied_index, voters, learners FROM ' +
          `${RAFT_RS_TABLE.APPLIED_STATE} WHERE group_id = ?`).get(groupId);
        const log = independent.prepare(
          `SELECT log_index, term, entry_type, data FROM ${RAFT_RS_TABLE.LOG} ` +
          'WHERE group_id = ? ORDER BY log_index').all(groupId);
        return {replicaId, hard: {...hard}, applied: {...applied},
          log: log.map((row) => ({...row}))};
      } finally {
        independent.close();
      }
    });
  }

  // Crash the requester and rebuild it from its durable record: the recovered
  // core must report the term and ConfState the running one reported.
  recover(replicaId) {
    const before = this.inputsOf(replicaId);
    this.driver.cluster.restart(replicaId);
    const after = this.inputsOf(replicaId);
    return {before: {term: before.term, voters: before.voters,
      learners: before.learners}, after: {term: after.term,
      voters: after.voters, learners: after.learners}};
  }

  coreOperations() {
    return this.driver.coreOperations();
  }

  dispose() {
    this.releaseHeld();
    this.driver.dispose();
  }
}

/**
 * An envelope a peer delivers, shaped as the runtime's own sends are.
 * @param {OracleRun} run - The run.
 * @param {Object} message - {to, from (identities), msgType, term?, ...}.
 */
function craft(run, {to, from, fromRaftId = null, msgType, term = null,
  ...fields}) {
  const {driver} = run;
  const toRaftId = driver.status(to).peerId;
  const sender = fromRaftId ?? driver.raftIdAt(to, from);
  driver.cluster.replica(to).inbox.push({
    protocol: RAFT_RS_TRANSPORT_PROTOCOL,
    groupId: driver.cluster.partitionId,
    from: sender,
    to: toRaftId,
    message: {msgType, from: sender, to: toRaftId,
      term: String(term ?? driver.status(to).term), logTerm: '0', index: '0',
      commit: '0', ...fields},
  });
}

/**
 * One normal entry carrying a proposal, as a forwarded MsgPropose holds it.
 * @param {*} command - The proposal.
 * @return {Object} The entry.
 */
function proposalEntry(command) {
  return {entryType: ENTRY_NORMAL, term: '0', index: '0',
    data: Buffer.from(encodeProposal(command)).toString(PAYLOAD_ENCODING)};
}

function stepCount(entries) {
  return entries.filter((entry) => entry === STEP).length;
}

// Hand the pending envelopes over, process them first when asked, and make
// the request, in the cell's own send mode.
async function decide(run, cell, mode) {
  const {driver} = run;
  const requester = cell.requester;
  run.requester = requester;
  run.resetStreams();
  run.asyncSends = cell.axes?.send === SEND_MODE.ASYNC || cell.hold === true;
  run.recording = [];
  if (mode === MODE.PROCESSED && cell.midTurn) {
    cell.midTurn(run);
  }
  const handedAt = run.coreOperations().length;
  const delivered = driver.stepUndrained(requester);
  const processed = {};
  if (mode === MODE.PROCESSED) {
    processed.reference = driver.port(requester).readStatus();
    await run.settle();
    processed.steps = stepCount(run.coreOperations().slice(handedAt));
    processed.inputsAfter = run.inputsOf(requester);
    processed.outbound = [...run.recording];
  }
  const database = driver.cluster.replica(requester).db;
  if (cell.admissionClosed) {
    database.exec('BEGIN');
  }
  const before = run.coreOperations().length;
  const turnStart = run.recording.length;
  let answer;
  if (mode === MODE.PENDING && cell.hold) {
    run.holdSends = true;
    const pendingAnswer = cell.request(driver);
    await run.settle();
    assert.ok(run.held.length > 0,
      'precondition: the request\'s turn awaits a held send');
    cell.midTurn(run);
    driver.stepUndrained(requester);
    run.releaseHeld();
    await run.settle();
    answer = await pendingAnswer;
  } else {
    answer = await cell.request(driver);
    await run.settle();
  }
  const requestEntries = run.coreOperations().slice(before);
  if (cell.admissionClosed) {
    database.exec('ROLLBACK');
  }
  const outbound = [...run.recording];
  run.recording = null;
  return {delivered, processed, answer: {...answer}, requestEntries,
    outbound, turnOutbound: outbound.slice(turnStart),
    afterTurn: run.projectionMismatches()};
}

/**
 * Run a cell once, in one mode.
 * @param {Object} cell - The cell.
 * @param {string} mode - MODE.PENDING or MODE.PROCESSED.
 * @return {Promise<Object>} The readings the oracle compares.
 */
async function runCell(cell, mode) {
  const run = new OracleRun({
    partitionId: cell.id, replicaIds: cell.replicaIds, axes: cell.axes});
  try {
    if (cell.form !== false) {
      await run.form();
    }
    await cell.build(run);
    const types = run.driver.cluster.replica(cell.requester).inbox
      .map((envelope) => envelope.message.msgType);
    const inputsBefore = run.inputsOf(cell.requester);
    const decided = await decide(run, cell, mode);
    await run.deliver();
    for (let round = 0; round < run.exactRounds(); round += 1) {
      await run.round();
    }
    const exact = run.observe();
    const streams = Object.fromEntries([...run.streams]
      .map(([replicaId, stream]) => [replicaId, [...stream]]));
    const durable = run.durable();
    const atExact = run.projectionMismatches();
    let settled = null;
    if (cell.settle) {
      for (let round = run.exactRounds(); round < run.settledRounds();
        round += 1) {
        await run.round();
      }
      settled = run.observe();
    }
    const recovered = run.recover(cell.requester);
    return {types, inputsBefore, ...decided, exact, streams, durable,
      atExact, settled, recovered};
  } finally {
    run.dispose();
  }
}

export {
  MODE,
  OracleRun,
  SEND_MODE,
  STEP,
  TIMING_MODE,
  assertStatusRecord,
  bindingEnumerations,
  craft,
  proposalEntry,
  runCell,
  stepCount,
};
