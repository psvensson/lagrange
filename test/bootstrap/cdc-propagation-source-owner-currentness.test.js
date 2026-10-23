// Selection/subscriber component witnesses. Controlled semantic replies here
// establish correspondence only; native recipient commit proof is separate.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {buildProvisionalCdcOutcome, isProvisionalCdcOutcome} from
  '../../src/cdc/cdc-delivery-outcome.js';
import {buildPartitionCdcPropagationSubscriber} from
  '../../src/bootstrap/shared/partition-cdc-propagation-subscriber.js';
import {buildMessageGroupOwnerNotReadyError, resolveOperationalMessageGroupSelection,
  resolveOperationalMessageGroupSelectionAsync} from
  '../../src/bootstrap/shared/message-group-selection.js';

function service(groupId, leader = false) {
  const owner = {groupId, initialized: true, leader, ready: true,
    subscribeToCDC: async () => {},
    isLeaderReplica: () => owner.leader,
    getMetadataIngressReadiness: () => ({ready: owner.initialized && owner.ready})};
  return owner;
}

function fixture() {
  const earlierRelay = service('relay-a');
  const preferred = service('captured-b');
  const services = [earlierRelay, preferred];
  const calls = [];
  const event = {tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
    data: {config_key: 'key', config_value: 'value'}, sourcePartition: 'source-config',
    eventKey: 'source-write-1', entryId: 'source-write-1', sourceLogIndex: 11, sourceOrdinal: 0,
    timestamp: new HLCTimestamp(1000, 0, 'source-node').toString()};
  const options = {requiredTables: [TABLES.CONFIG], preferredService: preferred,
    reuseCapturedIngress: true};
  const f = {earlierRelay, preferred, services, calls, event, options, answerGroup: null};
  f.subscriber = buildPartitionCdcPropagationSubscriber({tableName: TABLES.CONFIG,
    preferredService: preferred,
    resolveOperationalMessageGroupSelection: (selection) =>
      resolveOperationalMessageGroupSelection(services, selection),
    resolveOperationalMessageGroupSelectionAsync: (selection) =>
      resolveOperationalMessageGroupSelectionAsync(services, selection),
    buildMessageGroupOwnerNotReadyError,
    propagatePartitionCDCEvent: (selected, delivered) => {
      calls.push(selected);
      return buildProvisionalCdcOutcome([delivered], 20, f.answerGroup ?? selected.groupId);
    },
  });
  return f;
}

test('shared CDC selection and currentness consume the same captured preferred owner', async () => {
  const f = fixture();
  assert.equal(resolveOperationalMessageGroupSelection(f.services, f.options).service, f.preferred);
  assert.equal((await resolveOperationalMessageGroupSelectionAsync(f.services, f.options)).service,
    f.preferred);
  assert.equal(f.subscriber.getCDCPropagationService(), f.preferred);
  f.preferred.ready = false;
  assert.equal(f.preferred.initialized, true);
  assert.equal(resolveOperationalMessageGroupSelection(f.services, f.options).service, f.preferred);
  assert.equal((await resolveOperationalMessageGroupSelectionAsync(f.services, f.options)).service,
    f.preferred);
  assert.equal(f.subscriber.getCDCPropagationService(), f.preferred,
    'the captured owner policy survives published readiness churn');
  const answer = await f.subscriber(f.event);
  assert.equal(isProvisionalCdcOutcome(answer, [f.event], f.preferred.groupId), true);
  assert.deepEqual(f.calls, [f.preferred]);

  f.preferred.initialized = false;
  assert.equal(f.subscriber.getCDCPropagationService(), f.earlierRelay);
  const replacement = await f.subscriber(f.event);
  assert.equal(isProvisionalCdcOutcome(replacement, [f.event], f.earlierRelay.groupId), true);
  assert.deepEqual(f.calls, [f.preferred, f.earlierRelay]);
});

test('shared CDC selection preserves current ready leader precedence over captured ingress',
  async () => {
    const f = fixture();
    const leader = service('current-leader', true);
    f.services.push(leader);
    assert.equal(f.subscriber.getCDCPropagationService(), leader);
    const answer = await f.subscriber(f.event);
    assert.equal(isProvisionalCdcOutcome(answer, [f.event], leader.groupId), true);
    assert.deepEqual(f.calls, [leader]);
    leader.initialized = false;
    assert.equal(f.subscriber.getCDCPropagationService(), f.preferred);
    await f.subscriber(f.event);
    assert.deepEqual(f.calls, [leader, f.preferred]);
  });

test('shared CDC subscriber refuses weak correspondence for a different source group', async () => {
  const f = fixture();
  f.answerGroup = 'contradictory-source-group';
  await assert.rejects(f.subscriber(f.event), {deferRetry: true});
  assert.deepEqual(f.calls, [f.preferred]);
});
