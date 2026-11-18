// Liveness and bounded work of the CDC obligation lane's recipient drives
// (design note solve/epics/operation-integrity-and-reliable-formation/
// cdc-delivery-design-note-2026-11-11.md, Stage 2): every wait of a recipient
// is a named state woken by the event that clears it, a lane with owed rows
// always has something armed that will deliver them, and a refusing
// recipient costs bounded work. Each witness runs the production
// composition: one propagation subscriber per partition, its recipients the
// source group and the target groups of its propagation (the real
// CDCGroupPropagationService), on the real application, ledger, subscription
// and acknowledgement owners with controlled recipient answers, on virtual
// time.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {buildCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE,
  PARTITION_CDC_RECIPIENT_PASS as PASS} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {PARTITION_SERVICE_EVENT} from '../../src/partition/partition-service-constants.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {setupConfig, teardownConfig} from '../topology/cdc-group-propagation-service-harness.js';
import {clearFixtureSingletons, resetFixtureSingletons, settleTicks, track} from
  '../test-helpers/participant-transaction-fixture.js';
import {addSourceRow, fixture} from '../test-helpers/cdc-delivery-progress-fixture.js';
import {BACKPRESSURE_RETRY_AFTER_MS, RESPONSE, TARGET_GROUP, addRequiredGroup,
  addTopologySourceRow, topologyProgressFixture} from
  '../test-helpers/cdc-topology-progress-fixture.js';

beforeEach(() => {
  resetFixtureSingletons();
  setupConfig(LATENCY_PROPAGATION_MODE.SAFE);
});
afterEach(() => {
  teardownConfig();
  clearFixtureSingletons();
});

const INVOCATION_BUDGET_MS = 5000;
const diagnosticsOf = (f) => f.leader.cdcDelivery.getCdcObligationDiagnostics();
const targetOf = (f) => diagnosticsOf(f).recipients
  .find((recipient) => recipient.groupId === TARGET_GROUP);

test('L1 a propagation released while its last target answers re-ships the owed row to the ' +
  'source group without a new commit, and the lane never reports DRAINED with it owed',
async (t) => {
  const f = await topologyProgressFixture(t, {otherSubscriber: false});
  f.targetMode = RESPONSE.NATIVE;
  f.targetHold = Promise.withResolvers();
  t.after(() => f.targetHold.resolve());
  const driving = f.drive();
  await settleTicks();
  assert.deepEqual([f.sourceCalls.length, f.targetCalls.length], [1, 1]);
  // The source message group's commit lifetime is replaced while the target
  // answers: the propagation the recipients were observed under is gone.
  f.source.cdcCommitLifetime = {};
  f.targetHold.resolve();
  const outcome = await driving;
  const sourceCallsAtOutcome = f.sourceCalls.length;
  await settleTicks();
  assert.ok(outcome.state !== DRIVE.DRAINED || sourceCallsAtOutcome === 2,
    `DRAINED only once the released primary was shipped again: ${outcome.state}`);
  assert.equal(f.sourceCalls.length, 2,
    'the released primary recipient was started again, with no commit and no time');
  assert.equal(f.targetCalls.length, 2, 'the re-observed target confirms again');
  assert.equal(diagnosticsOf(f).pendingAcknowledgements, 1,
    'the row is acknowledged only once the new propagation confirmed it');
  const settled = await f.drive();
  assert.equal(settled.state, DRIVE.DRAINED);
});

test('L2 a target that answers backpressure costs O(1) deliveries per backoff window, not one ' +
  'per commit; the source group keeps pace and the target catches up in one vector', async (t) => {
  const COMMITS = 20;
  const f = await topologyProgressFixture(t, {otherSubscriber: false});
  f.targetMode = RESPONSE.BACKPRESSURE;
  const held = await f.drive();
  assert.equal(held.state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(targetOf(f).retryDueAtMs, f.clock.now() + BACKPRESSURE_RETRY_AFTER_MS,
    'the target carries its own hinted due time');
  assert.equal(diagnosticsOf(f).retryArmed, true, 'the lane timer is armed for it');
  for (let index = 0; index < COMMITS; index += 1) {
    addTopologySourceRow(f, `burst-${index}`);
    await settleTicks();
  }
  assert.equal(f.sourceCalls.flat().length, COMMITS + 1, 'the source group applied every row');
  assert.equal(f.targetCalls.length, 1,
    `${COMMITS} commits woke the lane; the refusing target was shipped nothing in its backoff`);
  assert.equal(diagnosticsOf(f).retryArmed, true, 'its due time is still armed after the skips');

  f.targetMode = RESPONSE.NATIVE;
  f.clock.advance(BACKPRESSURE_RETRY_AFTER_MS);
  await settleTicks();
  assert.equal(f.targetCalls.length, 2, 'its own due time delivered it once');
  assert.equal(f.targetCalls[1].eventKeys.length, COMMITS + 1,
    'the whole backlog in one vector');
  assert.equal(diagnosticsOf(f).pendingAcknowledgements, COMMITS + 1);
});

test('L3 a held target whose raw work is still open resumes at once when that work closes, ' +
  'not on its backoff', async (t) => {
  const f = await topologyProgressFixture(t, {otherSubscriber: false});
  f.targetMode = RESPONSE.NATIVE;
  f.targetHold = Promise.withResolvers();
  t.after(() => f.targetHold.resolve());
  track(f.drive());
  await settleTicks();
  assert.equal(f.targetCalls.length, 1);
  // The target's invocation budget ends with its transport call still open:
  // the response retires unknown, the raw work keeps the custody slot.
  f.clock.advance(INVOCATION_BUDGET_MS);
  await settleTicks();
  const target = targetOf(f);
  assert.equal(target.lastPass, PASS.HELD);
  assert.ok(target.retryDueAtMs > f.clock.now(), 'its backoff lies ahead');
  await f.drive();
  assert.equal(f.targetCalls.length, 1, 'occupied custody: no second delivery is attempted');
  f.targetHold.resolve();
  await settleTicks();
  assert.equal(f.targetCalls.length, 2,
    'the raw work closed and the target was shipped again with no time elapsed');
  assert.equal(diagnosticsOf(f).pendingAcknowledgements, 1);
});

test('L4 a group required while the last recipient answers holds the frontier: nothing is ' +
  'acknowledged before it is shipped', async (t) => {
  const f = await topologyProgressFixture(t, {otherSubscriber: false});
  f.targetMode = RESPONSE.NATIVE;
  const pendingWhenShipped = [];
  let added = false;
  f.duringTarget = () => {
    const call = f.targetCalls.at(-1);
    if (call.groupId === 'progress-group-c') {
      pendingWhenShipped.push(diagnosticsOf(f).pendingAcknowledgements);
    } else if (!added) {
      added = true;
      addRequiredGroup(f);
    }
  };
  await f.drive();
  await settleTicks();
  assert.deepEqual(f.targetCalls.map((call) => call.groupId), [TARGET_GROUP, 'progress-group-c']);
  assert.deepEqual(pendingWhenShipped, [0],
    'the new group was observed before the frontier was acknowledged');
  assert.equal(diagnosticsOf(f).pendingAcknowledgements, 1, 'and confirmed it after');
});

test('L5 rows committed while a recipient\'s last vector is in flight are shipped by the same ' +
  'drive before it ends: the drive ends DRAINED, not on a later restart', async (t) => {
  const f = await fixture(t, {rows: ['a', 'b'], subscribers: 1});
  let calls = 0;
  f.behavior = (_index, events, _context, groupId) => {
    calls += 1;
    if (calls === 1) addSourceRow(f.leader, 'committed-during-delivery');
    return buildCommittedCdcOutcome(events, groupId, {index: 17, term: 2});
  };
  const outcome = await f.drive();
  assert.equal(outcome.state, DRIVE.DRAINED);
  assert.deepEqual(f.calls.map((call) => call.ids), [['a', 'b'], ['committed-during-delivery']],
    'the second vector followed in the same drive');
  assert.equal(diagnosticsOf(f).pendingAcknowledgements, 3);
});

test('L6 commits to a lane whose only recipient refuses do not re-ship to it inside its ' +
  'backoff (one subscriber, the production composition)', async (t) => {
  const f = await fixture(t, {rows: ['a'], subscribers: 1});
  f.behavior = () => ({success: false, error: 'controlled-refusal', deferRetry: true,
    retryAfterMs: BACKPRESSURE_RETRY_AFTER_MS});
  const held = await f.drive();
  assert.equal(held.state, DRIVE.HELD_BY_SUBSCRIBER);
  for (let index = 0; index < 10; index += 1) {
    addSourceRow(f.leader, `more-${index}`);
    await settleTicks();
  }
  assert.equal(f.calls.length, 1, 'ten commits, one delivery per backoff window');
});

test('L7 a target answering the typed duplicate in flight is retried on its hint alone: once the ' +
  'first delivery settled, the next attempt confirms with no drive requested', async (t) => {
  const f = await topologyProgressFixture(t, {otherSubscriber: false});
  f.targetMode = RESPONSE.DUPLICATE_IN_FLIGHT;
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.equal(targetOf(f).retryDueAtMs, f.clock.now() + BACKPRESSURE_RETRY_AFTER_MS,
    'the hint travelled through the topology owner to this recipient');
  f.targetMode = RESPONSE.NATIVE;
  f.clock.advance(BACKPRESSURE_RETRY_AFTER_MS);
  await settleTicks();
  assert.equal(f.targetCalls.length, 2);
  assert.equal(diagnosticsOf(f).pendingAcknowledgements, 1, 'confirmed without a forced drive');
});

test('L8 a successor tenure whose recipient waits on the old tenure\'s custody is woken by that ' +
  'custody\'s cleanup: delivery and acknowledgement follow with no new write and no time',
async (t) => {
  const f = await fixture(t, {rows: ['a'], subscribers: 1});
  const child = Promise.withResolvers();
  const oldAnswer = Promise.withResolvers();
  t.after(() => {
    child.resolve();
    oldAnswer.resolve({success: false, error: 'released', deferRetry: true});
  });
  f.behavior = (_index, events, context, groupId) => {
    if (f.calls.length === 1) {
      context.ownChild(child.promise);
      return oldAnswer.promise;
    }
    return buildCommittedCdcOutcome(events, groupId, {index: 17, term: 2});
  };
  track(f.drive());
  await settleTicks();
  assert.equal(f.calls.length, 1, 'setup: the old tenure\'s delivery is open');
  // A new tenure: the old invocation is retired but its raw child still
  // holds the recipient's custody slot.
  f.leader.controllablePort.setRole(RAFT_ROLE.FOLLOWER);
  f.leader.controllablePort.setTerm(2);
  f.leader.controllablePort.setRole(RAFT_ROLE.LEADER);
  f.leader.emit(PARTITION_SERVICE_EVENT.LEADER_ELECTED);
  await settleTicks();
  assert.equal(diagnosticsOf(f).recipients.length, 1, 'setup: the successor lane drove');
  assert.equal(f.calls.length, 1, 'the successor waits for the occupied custody');
  oldAnswer.resolve({success: false, error: 'late', deferRetry: true});
  child.resolve();
  await settleTicks();
  assert.equal(f.calls.length, 2, 'the cleanup woke the successor lane\'s recipient');
  assert.equal(diagnosticsOf(f).pendingAcknowledgements, 1, 'and it was acknowledged');
});
