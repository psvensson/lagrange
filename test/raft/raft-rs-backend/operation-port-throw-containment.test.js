// One containment boundary at the port (quest
// raft-rs-single-path-partition-cutover, F-ah (b) after verification round
// 5): a throw the runtime owner did not type - here the caller's own event
// listener throwing inside the group's leader announcement - becomes that
// group's typed host failure (phase unexpected-throw, the error's message as
// its reason, recovery required), recorded by the runtime owner. The port
// never rethrows into its caller or into its own scheduled ticks; the group
// is held and reconstructed at most once per retry window, and it leads
// again once the listener stops throwing.
//
// The port is the production rs-raft port, built from a request shaped as
// PartitionService shapes it, on its own database; the retry window is the
// tuning owner's; an escaping exception is counted where the process
// reports one.

import assert from 'node:assert/strict';
import process from 'node:process';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {
  RAFT_EVENT,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_PARTITION_NODE_REQUEST} from
  '../../../src/raft/raft-provider-contract-constants.js';
import {RaftRsWasmProvider} from '../../../src/raft/raft-rs-provider.js';
import * as runtimeConstants from
  '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {recoveryRetryWindowMsOf} from
  '../../../src/raft/raft-rs-runtime-tuning.js';

const TEST_TIMEOUT_MS = 20000;
const IN_MEMORY = ':memory:';
// A lone group on a short clock: it campaigns on its own ticks.
const TIMING = Object.freeze({
  heartbeatMs: 30,
  electionMinMs: 150,
  electionMaxMs: 300,
  tickIntervalMs: 10,
});
// The verifier's span: two seconds of the port's own scheduled ticks.
const SCHEDULED_SPAN_MS = 2000;
const WINDOW_MARGIN_MS = 50;
const LISTENER_FAILURE = 'the leader listener refused the announcement';
const ESCAPE_EVENTS = Object.freeze(['uncaughtException',
  'unhandledRejection']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// What one port call answered: its value, or that it threw.
function answerOf(call) {
  try {
    return {threw: null, value: call()};
  } catch (error) {
    return {threw: String(error?.message || error), value: null};
  }
}

// Every exception and rejection that escapes to the process while counted;
// the counter is the process's only listener meanwhile, so an escape is
// counted (and asserted on) rather than ending the test where it happened.
function countEscapes() {
  const escaped = [];
  const onEscape = (error) => escaped.push(String(error?.message || error));
  const displaced = ESCAPE_EVENTS.map((event) => {
    const listeners = process.listeners(event);
    process.removeAllListeners(event);
    process.on(event, onEscape);
    return [event, listeners];
  });
  return {
    escaped,
    stop: () => {
      for (const [event, listeners] of displaced) {
        process.off(event, onEscape);
        for (const listener of listeners) {
          process.on(event, listener);
        }
      }
    },
  };
}

// A lone replica's port, from the request PartitionService hands its
// backend (the contract owner's field names).
function lonePort(groupId, {deferElection}) {
  const db = new Database(IN_MEMORY);
  const replicaId = `${groupId}-r1`;
  const port = new RaftRsWasmProvider().createPartitionPort({
    [RAFT_PARTITION_NODE_REQUEST.GROUP_ID]: groupId,
    [RAFT_PARTITION_NODE_REQUEST.PEER_ID]: replicaId,
    [RAFT_PARTITION_NODE_REQUEST.PEER_ADDRESS]: `containment://${replicaId}`,
    [RAFT_PARTITION_NODE_REQUEST.BOOTSTRAP_PEER_IDS]: [replicaId],
    [RAFT_PARTITION_NODE_REQUEST.DURABLE_STORAGE]: db,
    [RAFT_PARTITION_NODE_REQUEST.TIMING]: TIMING,
    [RAFT_PARTITION_NODE_REQUEST.SUBSTRATE]: {},
    [RAFT_PARTITION_NODE_REQUEST.DEFER_ELECTION]: deferElection,
    [RAFT_PARTITION_NODE_REQUEST.SEND_TO_PEER]: () => undefined,
    [RAFT_PARTITION_NODE_REQUEST.RESOLVE_PEER_ADDRESS]: (peer) =>
      `containment://${peer}`,
    [RAFT_PARTITION_NODE_REQUEST.APPLY_COMMITTED_ENTRY]: () => undefined,
    [RAFT_PARTITION_NODE_REQUEST.SNAPSHOT_CATCHUP_NEEDED]: () => undefined,
  });
  return {
    port,
    dispose: () => {
      port.close();
      db.close();
    },
  };
}

function throwingLeaderListener(port) {
  return port.subscribe(RAFT_EVENT.LEADER, () => {
    throw new Error(LISTENER_FAILURE);
  });
}

// Asserts one outcome is the group's typed host failure for the contained
// throw.
function assertContained(answer, label) {
  const phase = runtimeConstants.RUNTIME_PHASE.UNEXPECTED_THROW;
  assert.equal(answer.threw, null,
    `${label}: the port answers, never throws (${answer.threw})`);
  const outcome = answer.value;
  assert.equal(outcome?.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE,
    `${label}: a typed host failure (${JSON.stringify(outcome)})`);
  assert.equal(outcome.recoveryRequired, true,
    `${label}: the group is held for recovery`);
  assert.ok(typeof phase === 'string' && outcome.phase === phase,
    `${label}: it names the unexpected-throw phase (${outcome.phase})`);
  assert.ok(String(outcome.failure?.reason ?? outcome.reason)
    .includes(LISTENER_FAILURE), `${label}: its reason is the thrown ` +
    'error\'s message');
  return outcome;
}

test('F-ah (b): a throw inside the port\'s own scheduled ticks is the ' +
  'group\'s typed host failure - nothing escapes the timer, one ' +
  'reconstruction per window', {timeout: TEST_TIMEOUT_MS}, async () => {
  const escapes = countEscapes();
  const {port, dispose} = lonePort('containment-scheduled',
    {deferElection: false});
  try {
    const unsubscribe = throwingLeaderListener(port);
    const startedAt = Date.now();
    await sleep(SCHEDULED_SPAN_MS);
    assert.deepEqual(escapes.escaped, [],
      'no exception or rejection escaped the port\'s scheduled ticks');
    const held = assertContained(answerOf(() => port.readStatus()),
      'after the span');
    const spanMs = Date.now() - startedAt;
    const bound = Math.ceil(spanMs / recoveryRetryWindowMsOf(TIMING)) + 1;
    assert.ok(Number.isInteger(held.attempts) && held.attempts >= 1 &&
      held.attempts <= bound, 'the held group was reconstructed at most ' +
      `once per window (${held.attempts} over ${spanMs} ms, bound ${bound})`);
    unsubscribe();
    await sleep(recoveryRetryWindowMsOf(TIMING) + WINDOW_MARGIN_MS);
    assert.equal(port.readStatus().role, RAFT_ROLE.LEADER,
      'once the listener stops throwing the group leads again');
    assert.deepEqual(escapes.escaped, [], 'nothing escaped');
  } finally {
    dispose();
    escapes.stop();
  }
});

test('F-ah (b): a throw inside a port operation the caller asked for is ' +
  'answered as the group\'s typed host failure, never rethrown',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const escapes = countEscapes();
  const {port, dispose} = lonePort('containment-called',
    {deferElection: true});
  try {
    const unsubscribe = throwingLeaderListener(port);
    assertContained(answerOf(() => port.campaign()), 'the campaign');
    const held = assertContained(answerOf(() => port.readStatus()),
      'the status after it');
    assert.equal(held.role, null, 'the held group has no role');
    unsubscribe();
    await sleep(recoveryRetryWindowMsOf(TIMING) + WINDOW_MARGIN_MS);
    const campaigned = await port.campaign();
    assert.equal(campaigned.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `after its window the group campaigns again (${
        JSON.stringify(campaigned)})`);
    assert.equal(port.readStatus().role, RAFT_ROLE.LEADER, 'and leads');
    assert.deepEqual(escapes.escaped, [], 'nothing escaped');
  } finally {
    dispose();
    escapes.stop();
  }
});
