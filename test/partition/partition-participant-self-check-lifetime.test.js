/**
 * The leader's determinism self-check (TX1 design 3.3, AH) as the partition
 * keeps it: its cause of failure on the coordinator ledger, and the bounded
 * lifetime of its verdict.
 *
 * Observed in local three-node formations: when a REPLACE target of
 * sql_transactions-p1 became leader, the self-check failed (implicit_key_insert
 * and aggregate_insert refused at `opcode`, ceiling_insert probe_unavailable)
 * and its verdict was kept for the connection's lifetime. Cause: the committed
 * generation origin installs the coordinator ledger's insertion trigger
 * (distributed-transaction-schema-enforcement.js), so every INSERT program on
 * sql_transactions carries the trigger's `Program` opcode (not admitted) and
 * the ceiling plant is aborted by the trigger. Only a leader elected after the
 * origin runs the check there (onLeader requires the origin; the coordinator
 * ledger's BEGIN is refused before any self-check), which is why only
 * post-formation leaders (REPLACE targets) showed it. The ledger is never a
 * participant: its self-check is NOT_APPLICABLE.
 */
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {TABLES} from '../../src/constants/tables.js';
import {SQL_TRANSACTIONS_SCHEMA} from
  '../../src/bootstrap/system-table-workflow-schema-definitions.js';
import {runDeterminismSelfCheck} from
  '../../src/partition/partition-transaction-determinism.js';
import {
  TRANSACTION_CLASSIFIER_LAYER as LAYER,
  TRANSACTION_SELF_CHECK_RESULT as PROBE_RESULT,
} from '../../src/partition/partition-transaction-determinism-constants.js';
import {
  PARTICIPANT_TRANSACTION_FAILURE_CODE as CODE,
  PARTICIPANT_TRANSACTION_LOG_MSG as LOG_MSG,
} from '../../src/partition/partition-participant-transaction-constants.js';
import {
  REPLICAS, beginMessage, clearFixtureSingletons, identityOf, onFixtureLeader as onLeader,
  pick, resetFixtureSingletons, send, settleTicks, shutdownAll, startReplica,
} from '../test-helpers/participant-transaction-fixture.js';

beforeEach(resetFixtureSingletons);
afterEach(clearFixtureSingletons);

const PASSED = Object.freeze({passed: true, cases: [], engine: {vetted: true}});
const FAILED = Object.freeze({passed: false, engine: {vetted: true}, cases: [
  {name: 'implicit_key_insert', admitted: false, layer: LAYER.OPCODE,
    result: PROBE_RESULT.UNSATISFIED}]});
const UNAVAILABLE = Object.freeze({passed: false, engine: {vetted: true}, cases: [
  {name: 'ceiling_insert', admitted: false, layer: LAYER.PROBE_UNAVAILABLE,
    result: PROBE_RESULT.UNSATISFIED}]});

// A self-check answering `results` in order (the last one repeats).
function scripted(results) {
  const calls = [];
  const selfCheck = () => {
    calls.push(calls.length);
    return results[Math.min(calls.length - 1, results.length - 1)];
  };
  return {calls, selfCheck};
}

const beginAnswer = async (leader, id) =>
  pick(await send(leader, beginMessage(identityOf(id))),
    ['success', 'failureCode', 'selfCheckState']);
const admitted = {success: true, failureCode: null, selfCheckState: null};
const refused = (state) => ({success: false,
  failureCode: CODE.DETERMINISM_SELF_CHECK_FAILED, selfCheckState: state});

function captureWarnings(service) {
  const warnings = [];
  const warn = service.logger.warn.bind(service.logger);
  service.logger.warn = (message, fields) => {
    warnings.push({message, fields});
    return warn(message, fields);
  };
  return warnings;
}

test('a coordinator ledger leader elected after its origin applied never runs ' +
  'the self-check: the ledger trigger the origin installed would refuse the ' +
  'INSERT probes at opcode and abort the ceiling plant', async () => {
  const spy = {calls: 0, passed: null};
  const replica = await startReplica(REPLICAS[0], {tableName: TABLES.SQL_TRANSACTIONS,
    schema: SQL_TRANSACTIONS_SCHEMA, determinismSelfCheck: (db, options) => {
      spy.calls += 1;
      const result = runDeterminismSelfCheck(db, options);
      spy.passed = result.passed;
      return result;
    }});
  try {
    const warnings = captureWarnings(replica);
    // The cause, measured directly on the ledger's own connection.
    const direct = runDeterminismSelfCheck(replica.db,
      {tableName: TABLES.SQL_TRANSACTIONS}).cases
      .filter((entry) => entry.result === PROBE_RESULT.UNSATISFIED)
      .map((entry) => `${entry.name}:${entry.layer}`);
    replica.controllablePort.setRole(RAFT_ROLE.LEADER);
    await settleTicks();
    assert.deepEqual({direct, calls: spy.calls, passed: spy.passed,
      selfCheckWarnings: warnings.filter(({message}) =>
        message === LOG_MSG.SELF_CHECK_FAILED ||
        message === LOG_MSG.SELF_CHECK_UNAVAILABLE).length}, {
      direct: ['implicit_key_insert:opcode', 'aggregate_insert:opcode',
        'ceiling_insert:probe_unavailable'],
      calls: 0, passed: null, selfCheckWarnings: 0});
  } finally {
    await shutdownAll(replica);
  }
});

test('a FAILED verdict refuses every BEGIN of its leadership tenure and is ' +
  'measured again when the replica becomes leader again', async () => {
  const {calls, selfCheck} = scripted([FAILED, PASSED]);
  await onLeader(async (leader) => {
    const facts = {atLeadership: calls.length,
      first: await beginAnswer(leader, 'sc-life-a'),
      second: await beginAnswer(leader, 'sc-life-b'),
      withinTenure: calls.length};
    leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
    await settleTicks();
    leader.controllablePort.setRole(RAFT_ROLE.LEADER);
    await settleTicks();
    facts.nextTenure = calls.length;
    facts.afterReelection = await beginAnswer(leader, 'sc-life-c');
    assert.deepEqual(facts, {atLeadership: 1, first: refused('failed'),
      second: refused('failed'), withinTenure: 1, nextTenure: 2,
      afterReelection: admitted});
  }, {determinismSelfCheck: selfCheck});
});

test('an UNAVAILABLE verdict (a probe that could not be measured, nothing ' +
  'else unsatisfied) refuses that BEGIN, named, and the next BEGIN measures ' +
  'again; a thrown self-check is unavailable too', async () => {
  const {calls, selfCheck} = scripted([UNAVAILABLE, UNAVAILABLE, PASSED]);
  await onLeader(async (leader) => {
    const facts = {atLeadership: calls.length,
      first: await beginAnswer(leader, 'sc-unavail-a'),
      second: await beginAnswer(leader, 'sc-unavail-b'), measured: calls.length};
    assert.deepEqual(facts, {atLeadership: 1, first: refused('unavailable'),
      second: admitted, measured: 3});
  }, {determinismSelfCheck: selfCheck});
  let thrown = 0;
  await onLeader(async (leader) => {
    const first = await beginAnswer(leader, 'sc-throw-a');
    assert.deepEqual({first, thrown}, {first: refused('unavailable'), thrown: 2});
  }, {determinismSelfCheck: () => {
    thrown += 1;
    throw new Error('probe connection busy');
  }});
});
