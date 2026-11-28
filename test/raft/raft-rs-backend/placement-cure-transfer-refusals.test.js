import assert from 'node:assert/strict';
import {test} from 'node:test';
import {RAFT_LEADERSHIP_TRANSFER_REASON as REASON, RAFT_LEADERSHIP_TRANSFER_SUCCESSOR as SUCCESSOR,
  RAFT_MEMBERSHIP_OPERATION, RAFT_OPERATION_OUTCOME} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from '../../../src/raft/raft-rs-ready-loop-constants.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {TransferLeadershipDriver, assertRefused, namedSuccessor} from './transfer-leadership-driver.js';
import {capturingErrors} from './identity-reuse-harness.js';
import {RUNTIME_FAULT_REPORT} from '../../../src/raft/raft-rs-runtime-owner-constants.js';

const [a, b, c] = ['placement-source', 'placement-other', 'placement-target'];
function open(t) {
  const driver = new TransferLeadershipDriver({partitionId: 'placement-fences', replicaIds: [a, b, c]});
  t.after(() => driver.dispose());
  driver.form();
  return driver;
}

function request(status) {
  return {successor: SUCCESSOR.SOURCE_NAMED, replicaIdentity: c, term: status.term,
    configurationKey: status.configurationKey,
    membershipGenerationIndex: status.membershipGenerationIndex,
    runtimeGeneration: status.runtimeGeneration, lifecycleIncarnation: status.lifecycleIncarnation};
}

async function assertRefusalSteps(driver, captured, eligible, expected, inboundSteps = 0) {
  const before = driver.coreOperations().length;
  const answer = await turnChainValue(driver.port(a).transferLeadership(captured, eligible));
  assertRefused(answer, expected);
  assert.equal(driver.coreOperations().slice(before).filter((op) => op === 'step').length, inboundSteps,
    'only the previously received frames were stepped');
}

test('cancelled or stale source authorization does not step a transfer', async (t) => {
  const driver = open(t);
  const captured = request(driver.status(a));
  let observedCall;
  await assertRefusalSteps(driver, captured, function(...args) {
    observedCall = {receiver: this, args};
    return false;
  }, REASON.PLACEMENT_WITHDRAWN);
  assert.deepEqual(observedCall, {receiver: undefined, args: []});
  for (const [key, value] of Object.entries({term: captured.term + 1,
    membershipGenerationIndex: captured.membershipGenerationIndex + 1,
    configurationKey: 'obsolete configuration', runtimeGeneration: captured.runtimeGeneration + 1,
    lifecycleIncarnation: captured.lifecycleIncarnation + '-retired'})) {
    await assertRefusalSteps(driver, {...captured, [key]: value}, () => true,
      REASON.SOURCE_CHANGED);
  }
  assert.equal(driver.leads(a), true);
});

test('draining a higher-term vote invalidates the captured leader before transfer', async (t) => {
  const driver = open(t);
  const captured = request(driver.status(a));
  await turnChainValue(driver.port(a).transferLeadership(namedSuccessor(b)));
  driver.deliverOnly([b]);
  const delivered = driver.stepUndrained(a);
  assert.ok(delivered > 0);
  await assertRefusalSteps(driver, captured, () => true, REASON.SOURCE_CHANGED, delivered);
  assert.ok(driver.status(a).term > captured.term);
  assert.equal(driver.leads(a), false);
});

test('draining a target removal invalidates the captured configuration before transfer', async (t) => {
  const driver = open(t);
  const captured = request(driver.status(a));
  const targetPeer = driver.raftIdAt(a, c);
  driver.isolate(c);
  assert.equal(driver.port(a).proposeConfChange({
    type: RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER, replicaIdentity: c,
  }).result.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
  driver.deliverOnly([b]);
  const delivered = driver.stepUndrained(a);
  assert.ok(delivered > 0);
  await assertRefusalSteps(driver, captured, () => true, REASON.SOURCE_CHANGED, delivered);
  assert.equal(driver.status(a).confState.voters.includes(targetPeer), false);
});

test('a matching stamp during joint consensus still refuses placement transfer', async (t) => {
  const driver = open(t);
  // Explicit joint transition retains the outgoing voter set until explicitly left.
  const change = {transition: 2, changes: [{changeType: RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE,
    nodeId: driver.raftIdAt(a, b)}]};
  assert.equal(driver.port(a).proposeConfChange(change).result.outcome,
    RAFT_OPERATION_OUTCOME.CORE_OK);
  driver.deliver();
  const status = driver.status(a);
  assert.ok(status.confState.votersOutgoing.length > 0);
  assert.ok(status.confState.voters.includes(driver.raftIdAt(a, c)));
  await assertRefusalSteps(driver, request(status), () => true, REASON.SOURCE_CHANGED);
});

test('a placement predicate that throws or answers non-true withdraws the transfer; a throw is reported',
  async (t) => {
    const driver = open(t);
    const captured = request(driver.status(a));
    const failure = Object.assign(new Error('placement read failed'), {code: 'PLACEMENT_READ'});
    const errors = await capturingErrors(async () => {
      await assertRefusalSteps(driver, captured, () => {
        throw failure;
      }, REASON.PLACEMENT_WITHDRAWN);
    });
    const reported = errors.filter(({context}) =>
      context.report === RUNTIME_FAULT_REPORT.TRANSFER_ADMISSION_FAILED);
    assert.equal(reported.length, 1, JSON.stringify(errors));
    assert.equal(reported[0].context.error, 'placement read failed');
    assert.equal(reported[0].context.code, 'PLACEMENT_READ');
    assert.equal(reported[0].context.groupId, driver.status(a).groupId);
    for (const answer of [1, 'true', {}, undefined]) {
      const quiet = await capturingErrors(async () => {
        await assertRefusalSteps(driver, captured, () => answer, REASON.PLACEMENT_WITHDRAWN);
      });
      assert.deepEqual(quiet.filter(({context}) =>
        context.report === RUNTIME_FAULT_REPORT.TRANSFER_ADMISSION_FAILED), [],
      `a ${JSON.stringify(answer)} answer is a withdrawal, not a failure`);
    }
    assert.equal(driver.leads(a), true);
  });
