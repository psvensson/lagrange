// Real source ledger/subscriber and topology owners, controlled recipient
// semantics and projection changes. Native commit/publication proof is separate.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {COLUMN} from '../../src/constants/index.js';
import {isIssuedBootIncarnation} from '../../src/bootstrap/boot-incarnation-contract.js';
import {LATENCY_PROPAGATION_MODE} from '../../src/topology/latency-topology-constants.js';
import {PARTITION_CDC_OBLIGATION_DRIVE_STATE as DRIVE} from
  '../../src/partition/partition-cdc-obligation-constants.js';
import {setupConfig, teardownConfig, createGroupRow} from
  '../topology/cdc-group-propagation-service-harness.js';
import {RESPONSE, SOURCE_GROUP, SOURCE_NODE, TARGET_GROUP, TARGET_NODE,
  addRequiredGroup, assertDebtWithoutAck, omitTarget, topologyProgressFixture} from
  '../test-helpers/cdc-topology-progress-fixture.js';

beforeEach(() => setupConfig(LATENCY_PROPAGATION_MODE.SAFE));
afterEach(teardownConfig);

async function coverFirstBranchAndExpireOther(f) {
  f.expireOther = true;
  assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
  assert.deepEqual(f.subscriberCalls, [0, 1]);
  assert.equal(f.targetCalls.length, 1);
  assert.equal(f.sourceCalls.length, 1);
  assertDebtWithoutAck(f);
  f.expireOther = false;
}

const replacements = [
  ['address', (f) => {
    f.projection.services[0][COLUMN.ADDRESS] = 'repaired/message-group/target';
  }],
  ['coordinator', (f) => {
    f.projection.services[0][COLUMN.NODE_ID] = 'replacement-node';
  }],
  ['service identity', (f) => {
    f.projection.services[0][COLUMN.SERVICE_ID] = 'replacement-service';
  }],
  ['same-text service birth', (f) => {
    f.projection.services[0][COLUMN.CREATED_AT] += 1;
  }],
  ['same-text creation attempt', (f) => {
    f.projection.services[0].create_attempt_token = 'replacement-birth-attempt';
  }],
  ['node boot incarnation', (f) => {
    f.projection.nodes.get(TARGET_NODE)[COLUMN.BOOT_INCARNATION] = 2;
    assert.equal(isIssuedBootIncarnation(
      f.projection.nodes.get(TARGET_NODE)[COLUMN.BOOT_INCARNATION]), true);
  }],
];

for (const [name, replace] of replacements) {
  test(`source topology owner reobserves covered branch after ${name} replacement`, async (t) => {
    const f = await topologyProgressFixture(t);
    await coverFirstBranchAndExpireOther(f);
    replace(f);
    f.targetMode = RESPONSE.UNKNOWN;
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(f.targetCalls.length, 2, 'the old weak tag cannot skip the replacement route');
    assert.equal(f.sourceCalls.length, 1, 'the existing native source fact is still reusable');
    assertDebtWithoutAck(f);
    f.targetMode = RESPONSE.WEAK;
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL,
      'a new observation from the selected route permits only weak scan release');
    assertDebtWithoutAck(f);
  });
}

test('source topology owner reuses an unchanged covered prefix across response budgets', async (t) => {
  const f = await topologyProgressFixture(t);
  await coverFirstBranchAndExpireOther(f);
  assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
  assert.deepEqual(f.subscriberCalls, [0, 1, 1]);
  assert.equal(f.sourceCalls.length, 1);
  assert.equal(f.targetCalls.length, 1);
  assert.equal(f.leader.cdcDelivery.obligationLane.currentObligation, null);
  assertDebtWithoutAck(f);
});

test('source topology owner observes a new group before consuming a previously covered branch',
  async (t) => {
    const f = await topologyProgressFixture(t);
    await coverFirstBranchAndExpireOther(f);
    const added = addRequiredGroup(f);
    f.targetMode = RESPONSE.UNKNOWN;
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.ok(f.targetCalls.some((call) => call.groupId === added[COLUMN.GROUP_ID]));
    assert.equal(f.sourceCalls.length, 1, 'native historical fact survives set expansion');
    assertDebtWithoutAck(f);
    f.targetMode = RESPONSE.WEAK;
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
    assertDebtWithoutAck(f);
  });

test('source final aggregation reobserves requirements after the last subscriber returns',
  async (t) => {
    const f = await topologyProgressFixture(t);
    f.targetMode = RESPONSE.NATIVE;
    f.duringOther = () => {
      addRequiredGroup(f);
      f.duringOther = null;
    };
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.deepEqual(f.targetCalls.map((call) => call.groupId), [TARGET_GROUP]);
    assertDebtWithoutAck(f);
    assert.equal((await f.drive()).state, DRIVE.DRAINED);
    assert.deepEqual(f.targetCalls.map((call) => call.groupId), [TARGET_GROUP, 'progress-group-c']);
    assert.equal(f.sourceCalls.length, 1);
    assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 1,
      'only the now-complete native set makes the still-owed row ACK-eligible');
  });

test('topology owner cannot install a weak result from the route replaced during its await',
  async (t) => {
    const f = await topologyProgressFixture(t);
    f.duringTarget = () => {
      f.projection.services[0][COLUMN.ADDRESS] = 'new-route/message-group/target';
      f.duringTarget = null;
    };
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(f.targetCalls.length, 1);
    assertDebtWithoutAck(f);
    assert.equal((await f.drive()).state, DRIVE.PROVISIONAL);
    assert.equal(f.targetCalls[1].address, 'new-route/message-group/target');
    assertDebtWithoutAck(f);
  });

test('topology projection omission preserves a captured owed group until it actually answers',
  async (t) => {
    const f = await topologyProgressFixture(t);
    f.targetMode = RESPONSE.UNKNOWN;
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    omitTarget(f);
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.deepEqual(f.targetCalls.map((call) => call.groupId), [TARGET_GROUP, TARGET_GROUP]);
    assertDebtWithoutAck(f);
    f.targetMode = RESPONSE.NATIVE;
    assert.equal((await f.drive()).state, DRIVE.DRAINED);
    assert.deepEqual(f.targetCalls.map((call) => call.groupId),
      [TARGET_GROUP, TARGET_GROUP, TARGET_GROUP]);
    assert.equal(f.leader.cdcDelivery.getCdcObligationDiagnostics().pendingAcknowledgements, 1);
  });

test('grouped source contradiction refuses before effects even with another fallback reason',
  async (t) => {
    setupConfig(LATENCY_PROPAGATION_MODE.GROUPED);
    const f = await topologyProgressFixture(t);
    f.targetMode = RESPONSE.NATIVE;
    f.projection.nodes.get(SOURCE_NODE)[COLUMN.LATENCY_GROUP_ID] = 'contradictory-source';
    f.projection.groups.push(createGroupRow('contradictory-source', SOURCE_NODE),
      createGroupRow(TARGET_GROUP, null));
    assert.equal((await f.drive()).state, DRIVE.HELD_BY_SUBSCRIBER);
    assert.equal(f.sourceCalls.length, 0);
    assert.equal(f.targetCalls.length, 0);
    assertDebtWithoutAck(f);
    f.projection.nodes.get(SOURCE_NODE)[COLUMN.LATENCY_GROUP_ID] = SOURCE_GROUP;
    f.projection.groups[0][COLUMN.GROUP_ID] = SOURCE_GROUP;
    assert.equal((await f.drive()).state, DRIVE.DRAINED,
      'aligned-source conservative fanout remains deliverable');
    assert.equal(f.sourceCalls.length, 1);
    assert.equal(f.targetCalls.length, 1);
  });
