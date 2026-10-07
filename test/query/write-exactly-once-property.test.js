// A bounded randomized property of the write path on a real three-replica
// rs-raft group behind the production engine and control-plane gateway:
// under dropped packets, duplicated deliveries, lost answers, leader changes
// and runtime replacements, every logical write - an INSERT, a counter
// UPDATE (read-modify-write CAS), a DELETE, a named birth re-born after its
// row was deleted - is applied exactly once.
//
// Each logical write is delivered under its one identity (an idempotency
// key, or a write identity whose owner releases it once the write is
// classified) and re-driven under it until its outcome is known, as the
// client contract says. The property:
// - the final state on every replica is the exactly-once application of
//   every logical write, in issue order;
// - every caller-visible answer is that write's own application (one row) or
//   a typed failure that applied nothing yet (an unknown outcome or a
//   refusal before proposal) - never another write's result.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createControlPlaneRuntimeBundle} from
  '../../src/control-plane/control-plane-runtime-bundle.js';
import {
  controlPlaneWriteIdentity,
  releaseControlPlaneWriteIdentities,
} from '../../src/control-plane/control-plane-write-identity.js';
import * as writeKernel from '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  NODE_ID,
  USER_TABLE,
  sleep,
  trapCore,
  waitFor,
  withGroupSurface,
  withMutedConsoleError,
} from './unknown-outcome-surface-fixture.js';

const TEST_TIMEOUT_MS = 300000;
const TEMP_PREFIX = 'write-exactly-once-property-';
const SEEDS = Object.freeze([20261005, 7, 424242]);
const WRITES_PER_SEED = 40;
const WRITE_BUDGET_MS = 1500;
const MAX_REDRIVES = 12;
const ROUTER_CONNECTION_CLOSED = 'ROUTER_CONNECTION_CLOSED';
const OUTCOME_UNKNOWN =
  writeKernel.PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN;
// A fault either ends inside the executor's budget (re-delivered there) or
// outlasts it (the caller re-drives under the write's identity).
const FAULTS = Object.freeze(['none', 'drop', 'duplicate', 'lost',
  'leader-change', 'runtime-replacement', 'outlasting-replacement',
  'outlasting-partition']);
const OUTLAST_MS = WRITE_BUDGET_MS + 300;
const NAME_SCOPE = 'property';
const INSERT_SQL = `INSERT INTO ${USER_TABLE} (node_id, value) VALUES (?, ?)`;
const CAS_SQL = `UPDATE ${USER_TABLE} SET value = ? WHERE node_id = ? ` +
  'AND value = ?';
const DELETE_SQL = `DELETE FROM ${USER_TABLE} WHERE node_id = ?`;

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 0x100000000;
  };
}

const pick = (random, list) => list[Math.floor(random() * list.length)];

// The next logical write the model admits (each changes exactly one row).
function nextWrite(random, model, index) {
  const keys = [...model.keys()];
  const bornNamed = keys.filter((key) => key.startsWith('n'));
  const roll = random();
  if (roll < 0.25 || keys.length === 0) {
    return {kind: 'insert', key: `k${index}`, value: '0'};
  }
  if (roll < 0.5) {
    const key = pick(random, keys);
    const value = model.get(key);
    return {kind: 'cas', key, value: String(Number(value) + 1), from: value};
  }
  if (roll < 0.65) {
    return {kind: 'delete', key: pick(random, keys)};
  }
  // A named birth: of a fresh key, or of a named key deleted before
  // (re-born, with identical content half the time).
  const deadNamed = ['n0', 'n1', 'n2'].filter((key) => !model.has(key));
  if (deadNamed.length === 0) {
    return {kind: 'delete', key: pick(random, bornNamed)};
  }
  return {kind: 'named-birth', key: pick(random, deadNamed),
    value: random() < 0.5 ? '0' : String(index)};
}

function statementOf(write) {
  if (write.kind === 'insert' || write.kind === 'named-birth') {
    return [INSERT_SQL, [write.key, write.value]];
  }
  if (write.kind === 'cas') {
    return [CAS_SQL, [write.value, write.key, write.from]];
  }
  return [DELETE_SQL, [write.key]];
}

function applyToModel(model, write) {
  if (write.kind === 'delete') {
    model.delete(write.key);
  } else {
    model.set(write.key, write.value);
  }
}

function isTypedNotYetApplied(answer) {
  const failure = answer?.participantFailures?.[0] ?? answer;
  return answer?.success === false && failure?.committed !== true &&
    (failure?.failureCode === OUTCOME_UNKNOWN ||
      writeKernel.isPartitionWriteFailureCode(failure?.failureCode) ||
      answer?.failureCode === OUTCOME_UNKNOWN);
}

function leaderIndexOf(services) {
  return services.findIndex((service) =>
    service.raft.readStatus().role === RAFT_ROLE.LEADER);
}

// Arm one fault for the next write's first delivery; returns its teardown.
async function armFault(fault, {random, services, peers, blocked,
  interceptors, partitionId}) {
  const leader = Math.max(0, leaderIndexOf(services));
  if (fault === 'runtime-replacement') {
    const trap = trapCore(partitionId, {once: true});
    return () => trap.release();
  }
  if (fault === 'outlasting-replacement') {
    const trap = trapCore(partitionId, {once: false});
    const end = setTimeout(() => trap.release(), OUTLAST_MS);
    return () => {
      clearTimeout(end);
      trap.release();
    };
  }
  if (fault === 'drop' || fault === 'outlasting-partition') {
    const pairs = peers.filter((_peer, index) => index !== leader)
      .map((peer) => `${peers[leader]}>${peer}`);
    pairs.forEach((pair) => blocked.add(pair));
    const heal = setTimeout(() => pairs.forEach((pair) =>
      blocked.delete(pair)), fault === 'drop' ?
      100 + Math.floor(random() * 900) : OUTLAST_MS);
    return () => {
      clearTimeout(heal);
      pairs.forEach((pair) => blocked.delete(pair));
    };
  }
  if (fault === 'leader-change') {
    const next = (leader + 1 + Math.floor(random() * 2)) % services.length;
    const change = setTimeout(() => services[next].raft.campaign()
      .catch(() => undefined), Math.floor(random() * 50));
    return () => clearTimeout(change);
  }
  if (fault === 'duplicate' || fault === 'lost') {
    let used = false;
    const intercept = async (entry, message) => {
      if (used || typeof message?.entryId !== 'string') {
        return undefined;
      }
      used = true;
      const target = services[entry.index];
      if (fault === 'duplicate') {
        const [first] = await Promise.all([target.handleRemoteQuery(message),
          target.handleRemoteQuery(message)]);
        return first;
      }
      target.handleRemoteQuery(message).catch(() => undefined);
      await sleep(Math.floor(random() * 200));
      const error = new Error('router connection closed');
      error.code = ROUTER_CONNECTION_CLOSED;
      throw error;
    };
    interceptors.push(intercept);
    return () => interceptors.splice(interceptors.indexOf(intercept), 1);
  }
  return () => undefined;
}

// One logical write, delivered under its identity and re-driven under it
// until its outcome is known; every answer is checked against the contract.
async function runLogicalWrite(write, {engine, gateway, index, seed,
  violations, tally}) {
  const [sql, params] = statementOf(write);
  const identity = write.kind === 'named-birth' ?
    {writeIdentity: controlPlaneWriteIdentity(NAME_SCOPE, write.key, 'birth'),
      skipCacheWait: true} :
    {idempotencyKey: `property-${seed}-${index}`};
  const deliver = () => withMutedConsoleError(() =>
    (write.kind === 'named-birth' ?
      gateway.executeQuery(sql, params, identity) :
      engine.executeQuery(sql, params, identity)));
  for (let attempt = 0; attempt < MAX_REDRIVES; attempt += 1) {
    const answer = await deliver();
    tally.answers += 1;
    if (answer?.success === true) {
      tally.redriven += attempt > 0 ? 1 : 0;
      if (answer.affectedRows !== 1) {
        violations.push({seed, index, write, attempt,
          violation: 'answered with a count not its own',
          affectedRows: answer.affectedRows});
      }
      if (write.kind === 'named-birth') {
        // The owner classified the write: its instance ends.
        releaseControlPlaneWriteIdentities(NAME_SCOPE, write.key);
      }
      return true;
    }
    if (!isTypedNotYetApplied(answer)) {
      violations.push({seed, index, write, attempt,
        violation: 'answered with neither its application nor a typed ' +
          'not-yet-applied failure',
        error: String(answer?.error ?? '').slice(0, 160),
        failure: answer?.participantFailures?.[0]?.failureCode ?? null});
      return false;
    }
    tally.notYetApplied += 1;
    tally.unknown += JSON.stringify(answer).includes(OUTCOME_UNKNOWN) ? 1 : 0;
    await sleep(50);
  }
  violations.push({seed, index, write, violation: 'never resolved'});
  return false;
}

for (const seed of SEEDS) {
  test(`exactly-once property, seed ${seed}: ${WRITES_PER_SEED} logical ` +
    'writes under random faults', {timeout: TEST_TIMEOUT_MS}, async () => {
    const partitionId = `xo-prop-${seed}`;
    await withGroupSurface({partitionId, table: USER_TABLE,
      tempPrefix: TEMP_PREFIX}, async (group) => {
      const {engine, services, rowsEverywhere, blocked} = group;
      engine.queryExecutor.queryTimeoutMs = WRITE_BUDGET_MS;
      const quiet = () => undefined;
      engine.queryExecutor.logger = {...engine.queryExecutor.logger,
        debug: quiet, info: quiet, warn: quiet, error: quiet};
      const gateway = createControlPlaneRuntimeBundle({nodeId: NODE_ID,
        sqlQueryEngine: engine, messageRouter: engine.queryExecutor
          .messageRouter}).controlPlaneSystemTableGateway;
      const random = lcg(seed);
      const model = new Map();
      const violations = [];
      const tally = {answers: 0, redriven: 0, notYetApplied: 0, unknown: 0};
      for (let index = 0; index < WRITES_PER_SEED; index += 1) {
        const write = nextWrite(random, model, index);
        const fault = pick(random, FAULTS);
        tally[fault] = (tally[fault] ?? 0) + 1;
        tally[write.kind] = (tally[write.kind] ?? 0) + 1;
        const disarm = await armFault(fault, {...group, random, partitionId});
        let resolved;
        try {
          resolved = await runLogicalWrite(write, {engine, gateway, index,
            seed, violations, tally});
        } finally {
          disarm();
        }
        if (resolved) {
          applyToModel(model, write);
        }
        assert.ok(await waitFor(() => leaderIndexOf(services) >= 0),
          'a leader serves the next write');
      }
      blocked.clear();
      const expected = [...model.entries()].sort()
        .map(([key, value]) => `${key}=${value}`).join();
      const converged = await waitFor(() => rowsEverywhere(
        `SELECT node_id, value FROM ${USER_TABLE} ORDER BY node_id`)
        .every((rows) => rows.map((row) => `${row.node_id}=${row.value}`)
          .join() === expected));
      console.log(`property seed ${seed}: ${JSON.stringify(tally)}`);
      assert.deepEqual(violations, [], 'every answer keeps the contract');
      assert.ok(converged, 'every replica holds exactly-once state ' +
        `(expected ${expected}; got ${JSON.stringify(rowsEverywhere(
          `SELECT node_id, value FROM ${USER_TABLE} ORDER BY node_id`))})`);
    });
  });
}
