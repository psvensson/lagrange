// Pure semantic-owner vectors. Builder-produced receipts here are validator
// inputs, never evidence of native application or permission to ACK source debt.
// The real native/source witness is message-group-native-custody-handoff.test.js.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  CDC_COMPLETION,
  buildCommittedCdcOutcome,
  buildProvisionalCdcOutcome,
  cdcCommitWaitIdentity,
  completeCdcPropagation,
  isCommittedCdcOutcome,
  isCommittedCdcDelivery,
  isProvisionalCdcOutcome,
  isProvisionalCdcDelivery,
  observeCdcCoverage,
} from '../../src/cdc/cdc-delivery-outcome.js';
import {copyCdcEventMetadata} from '../../src/cdc/cdc-event-envelope.js';
import {CDC_EVENT_IDENTITY} from '../../src/constants/cdc-lifecycle-constants.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {buildTransportDeliveryOutcome, TRANSPORT_DELIVERY_OUTCOME_STATE} from
  '../../src/transport/transport-semantic-outcome.js';
import {MESSAGE_GROUP_APPLICATION_STATUS, MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE} from
  '../../src/message-group/constants.js';
import {CDC_GROUP_PROPAGATION_STRATEGY, CDC_GROUP_PROPAGATION_STATUS} from
  '../../src/topology/cdc-group-propagation-constants.js';
import {buildCdcSourceScopeEvidence, CDC_SOURCE_SCOPE_AUTHORITY} from
  '../../src/cdc/cdc-source-scope-evidence.js';

const GROUP_ID = 'mg-outcome-recipient';
const SOURCE_ID = 'config-outcome-source';
const POSITION = Object.freeze({index: 23, term: 3});
const SOURCE_SCOPE = buildCdcSourceScopeEvidence({
  authority: CDC_SOURCE_SCOPE_AUTHORITY.BOOTSTRAP_GENESIS,
  partitionDescriptor: {partition_id: SOURCE_ID, table_id: TABLES.CONFIG,
    partition_key_start: null, partition_key_end: null, partition_version: 1},
  tableDescriptor: {table_id: TABLES.CONFIG, table_name: TABLES.CONFIG,
    active_partition_version: 1},
});

function sourceEvent(entryId, sourceLogIndex = 17) {
  return {tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
    data: {config_key: 'same-row', config_value: 'same-value'},
    timestamp: new HLCTimestamp(1000, 0, 'source-node').toString(),
    sourcePartition: SOURCE_ID, sourceReplica: `${SOURCE_ID}-r1`,
    eventKey: entryId, entryId, sourceLogIndex, sourceOrdinal: 0,
    sourceScope: SOURCE_SCOPE};
}

function fixture() {
  const events = [sourceEvent('write-first'), sourceEvent('write-second', 18)];
  return {events, answer: buildCommittedCdcOutcome(events, GROUP_ID, POSITION)};
}

function zeroTarget(event, sourceAnswer) {
  return completeCdcPropagation([event], observeCdcCoverage(sourceAnswer, [event], GROUP_ID),
    [], GROUP_ID);
}

test('canonical local committed acceptance needs no transport ACK', () => {
  const {events, answer} = fixture();
  assert.equal(Object.hasOwn(answer, 'acknowledged'), false);
  assert.equal(isCommittedCdcOutcome(answer, events, GROUP_ID), true);
  assert.equal(isCommittedCdcDelivery(answer, events, GROUP_ID), false);
  const remote = buildTransportDeliveryOutcome({...answer, acknowledged: true});
  assert.equal(isCommittedCdcDelivery(remote, events, GROUP_ID), true);
  assert.equal(remote.deliveryState, TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED);
  assert.deepEqual(remote.cdcCommitted, answer.cdcCommitted);
  const single = buildCommittedCdcOutcome([events[0]], GROUP_ID, POSITION);
  assert.equal(isCommittedCdcOutcome(zeroTarget(events[0], single),
    [events[0]], GROUP_ID), true);
});

test('canonical vector requires every distinct source occurrence exactly once', () => {
  const {events, answer} = fixture();
  assert.equal(answer.cdcCommitted.length, 2, 'same row does not coalesce source writes');
  assert.notEqual(answer.cdcCommitted[0].eventKey, answer.cdcCommitted[1].eventKey);
  assert.notEqual(answer.cdcCommitted[0].eventDigest, answer.cdcCommitted[1].eventDigest);
  assert.equal(isCommittedCdcOutcome({...answer,
    cdcCommitted: [...answer.cdcCommitted].reverse()}, events, GROUP_ID), true);
  for (const receipts of [answer.cdcCommitted.slice(0, 1),
    [...answer.cdcCommitted, answer.cdcCommitted[0]],
    [answer.cdcCommitted[0], answer.cdcCommitted[0]]]) {
    assert.equal(isCommittedCdcOutcome({...answer, cdcCommitted: receipts}, events, GROUP_ID),
      false);
  }
  assert.equal(isCommittedCdcOutcome(answer, [events[0], events[0]], GROUP_ID), false);
  assert.equal(isCommittedCdcOutcome(answer, events, 'another-group'), false);
});

const RECEIPT_CONTRADICTIONS = [
  {sourcePartition: 'another-source'}, {eventKey: 'another-write'},
  {eventDigest: 'another-digest'}, {groupId: 'another-group'},
  {groupId: ''}, {logIndex: 0}, {logIndex: '23'},
  {logIndex: Number.MAX_SAFE_INTEGER + 1}, {term: 0}, {term: 1.5}, {term: '3'},
];

for (const patch of RECEIPT_CONTRADICTIONS) {
  test(`canonical receipt rejects ${JSON.stringify(patch)}`, () => {
    const {events, answer} = fixture();
    answer.cdcCommitted[1] = {...answer.cdcCommitted[1], ...patch};
    assert.equal(isCommittedCdcOutcome(answer, events, GROUP_ID), false);
  });
}

const FIELD_CONTRADICTIONS = {
  error: ['recipient-failed', '', false, {}],
  errorCode: ['RECIPIENT_FAILED', '', false, {}],
  reasonCode: ['pending-target', '', false, {}],
  deferRetry: [true, null, 'false'],
  noHandler: [true, null, 'false'],
  retryAfterMs: [1, 0, '1', false],
  cdcProvisional: [[], null, {}],
  deliveryFailures: [[{groupId: 'unresolved-target'}], null, {}],
  deliveryState: [TRANSPORT_DELIVERY_OUTCOME_STATE.DEFERRED,
    TRANSPORT_DELIVERY_OUTCOME_STATE.FAILED, '', null, 1],
  acknowledged: [false, null, 'true'],
  status: ['failed', 'unknown-success', null, {}],
  unexpectedAcceptance: [true],
};

for (const [field, values] of Object.entries(FIELD_CONTRADICTIONS)) {
  for (const value of values) {
    const label = `${field}=${JSON.stringify(value)}`;
    test(`local canonical owner refuses contradictory ${label}`, () => {
      const {events, answer} = fixture();
      assert.equal(isCommittedCdcOutcome({...answer, [field]: value}, events, GROUP_ID), false);
    });
    test(`zero-target composition cannot launder contradictory ${label}`, () => {
      const event = sourceEvent('zero-target-write');
      const answer = buildCommittedCdcOutcome([event], GROUP_ID, POSITION);
      const result = zeroTarget(event, {...answer, [field]: value});
      assert.equal(result.success, false);
      assert.equal(result.error, CDC_COMPLETION.UNKNOWN);
      assert.equal(isCommittedCdcOutcome(result, [event], GROUP_ID), false);
    });
  }
}

const SUCCESS_METADATA = {
  messageId: 'message-id', correlationId: 'correlation-id', requestId: 'request-id',
  operationId: 'operation-id', causeId: 'cause-id', sourceGroupId: GROUP_ID, groupId: GROUP_ID,
  tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT, eventCount: 2,
  strategy: CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT,
  mode: CDC_GROUP_PROPAGATION_STATUS.SAFE, targetGroupCount: 0,
  fallbackReason: null, fallbackStrategy: null, timestamp: 1000,
  responseType: MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION,
};

for (const status of ['completed', 'delivered',
  MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_PROPAGATED,
  MESSAGE_GROUP_APPLICATION_STATUS.LATENCY_CDC_BATCH_PROPAGATED]) {
  test(`canonical owner permits typed successful wrapper metadata: ${status}`, () => {
    const {events, answer} = fixture();
    const result = {...answer, ...SUCCESS_METADATA, status, error: null,
      errorCode: null, reasonCode: null, deferRetry: false, noHandler: false,
      retryAfterMs: null, deliveryFailures: [],
      deliveryState: TRANSPORT_DELIVERY_OUTCOME_STATE.DELIVERED};
    assert.equal(isCommittedCdcOutcome(result, events, GROUP_ID), true);
    assert.equal(isCommittedCdcDelivery({...result, acknowledged: true}, events, GROUP_ID), true);
  });
}

for (const field of Object.keys(SUCCESS_METADATA)) {
  test(`canonical owner rejects wrong-type wrapper metadata: ${field}`, () => {
    const {events, answer} = fixture();
    assert.equal(isCommittedCdcOutcome({...answer, [field]: {}}, events, GROUP_ID), false);
  });
}

test('provisional ingress remains distinct from committed and transport-only answers', () => {
  const {events, answer} = fixture();
  const provisional = buildProvisionalCdcOutcome(events, 10);
  assert.equal(isProvisionalCdcOutcome(provisional, events), true);
  assert.equal(isCommittedCdcOutcome(provisional, events, GROUP_ID), false);
  assert.equal(isProvisionalCdcDelivery({...provisional, acknowledged: true}, events), true);
  assert.equal(isProvisionalCdcOutcome({...provisional,
    cdcCommitted: answer.cdcCommitted}, events), false,
  'a mixed answer cannot launder contradictory committed evidence into provisional coverage');
});

for (const answer of [undefined, {success: true}, {acknowledged: true},
  {success: true, acknowledged: true}]) {
  test(`ordinary or transport-only success is not acceptance: ${JSON.stringify(answer)}`, () => {
    const {events} = fixture();
    assert.equal(isCommittedCdcOutcome(answer, events, GROUP_ID), false);
    assert.equal(isCommittedCdcDelivery(answer, events, GROUP_ID), false);
    assert.equal(isProvisionalCdcOutcome(answer, events), false);
  });
}

test('semantic vector identity binds source occurrence, payload, position and original stamp', () => {
  const event = sourceEvent('identity-write');
  const original = cdcCommitWaitIdentity([event]);
  for (const patch of [{eventKey: 'another-write'}, {sourcePartition: 'another-source'},
    {sourceLogIndex: 18}, {sourceOrdinal: 1},
    {timestamp: new HLCTimestamp(1000, 1, 'source-node').toString()},
    {operation: CDC_OPERATION.DELETE}, {data: {...event.data, config_value: 'changed'}}]) {
    assert.notEqual(cdcCommitWaitIdentity([{...event, ...patch}]), original);
  }
  assert.equal(cdcCommitWaitIdentity([{...event, causeId: 'diagnostic', replayOnly: true}]),
    original, 'diagnostic/replay markers do not create a different source occurrence');
});

for (const [field, values] of Object.entries({
  sourceLogIndex: [0, -1, Number.MAX_SAFE_INTEGER + 1, '17', null],
  sourceOrdinal: [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, '0', null],
})) {
  for (const value of values) {
    test(`source envelope rejects unsupported position ${field}=${JSON.stringify(value)}`, () => {
      assert.throws(() => copyCdcEventMetadata({...sourceEvent('position-write'), [field]: value}),
        {code: CDC_EVENT_IDENTITY.INVALID_CODE});
    });
  }
}
