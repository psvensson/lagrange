import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {CDCHandler} from '../../src/message-group/cdc-handler.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {HLCClockService} from '../../src/hlc/hlc-clock-service.js';
import {CDCEventBuffer, buildEventIdentity} from '../../src/partition/cdc-event-buffer.js';
import {normalizeCDCBatchEvents} from '../../src/message-group/message-group-service-cdc-propagation-runtime-methods.js';
import {assignRaftTiming} from '../../src/message-group/message-group-service-raft-timing.js';
import {MESSAGE_GROUP_COMMAND_TYPE} from '../../src/message-group/constants.js';
import {SeedRuntimeBridgeOwner} from '../../src/bootstrap/owners/seed-runtime-bridge-owner.js';
import {NodeJoiningPublicationActivation} from '../../src/bootstrap/node-joining-publication-activation.js';
import {CDCGroupPropagationService} from '../../src/topology/cdc-group-propagation-service.js';
import {createMessageGroupForwardingOwnerDeliveryMethods} from '../../src/message-group/message-group-forwarding-owner-delivery-methods.js';
import {resolveCdcPropagationDeliveryProfile} from '../../src/cache/cdc-propagation-delivery-profile.js';
import {CDC_SOURCE_SCOPE_AUTHORITY, buildCdcSourceScopeEvidence} from
  '../../src/partition/partition-cdc-source-coverage.js';

let clock;
beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: 'cdc-identity'}});
  LoggingService.getInstance().initialize({level: 'error'});
  clock = new HLCClockService('cdc-identity');
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function sourceScope(partitionId = 'nodes-p1') {
  return buildCdcSourceScopeEvidence({
    authority: CDC_SOURCE_SCOPE_AUTHORITY.OWNER_RPC_DESCRIPTOR,
    partitionDescriptor: {partition_id: partitionId, table_id: 't-nodes',
      partition_version: 1, partition_key_start: null,
      partition_key_end: null, state: 'NORMAL'},
    tableDescriptor: {table_id: 't-nodes', table_name: 'nodes',
      active_partition_version: 1, pending_partition_version: null,
      partition_transition_state: null, partition_transition_generation: 1},
  });
}
function eventOf(ordinal = 0, timestamp = clock.now().toString(),
  partitionId = 'nodes-p1') {
  return {tableName: 'nodes', operation: 'UPSERT',
    data: {node_id: 'n1', address: `value-${ordinal}`}, timestamp,
    sourcePartition: partitionId, eventKey: `txop:p1:${ordinal}`,
    sourceLogIndex: 1, sourceOrdinal: ordinal,
    sourceScope: sourceScope(partitionId)};
}
function identityFields(event) {
  return {eventKey: event.eventKey, sourcePartition: event.sourcePartition,
    timestamp: event.timestamp, sourceLogIndex: event.sourceLogIndex,
    sourceOrdinal: event.sourceOrdinal, sourceScope: event.sourceScope};
}
function handlerOf() {
  const handler = new CDCHandler(new SystemTableCache());
  handler.subscribe('nodes');
  return handler;
}

for (const buffered of [false, true]) {
  test(`durable CDC ${buffered ? 'buffered' : 'immediate'} consumer preserves same-stamp operations and replay`, async (t) => {
    const handler = handlerOf();
    const first = eventOf();
    const second = eventOf(1, first.timestamp);
    const applied = [];
    handler.on('eventApplied', () => {
      applied.push(handler.cache.get('nodes', 'n1').address);
    });
    const consume = (event) => buffered ?
      handler.handleEvent(event) : handler.applyImmediate(event);
    consume(first);
    consume(second);
    handler.flushAllBuffers();
    consume(first);
    consume(second);
    handler.flushAllBuffers();
    t.same(applied, ['value-0', 'value-1'], 'both operation payloads apply once in order');
    t.equal(handler.cache.get('nodes', 'n1').address, 'value-1', 'replay does not restore an old payload');
    handler.shutdown();
  });
}

test('MG normalizer preserves durable identity and rejects missing producer stamp', async (t) => {
  const event = eventOf();
  const service = {hlcClock: clock};
  const deps = {normalizeCauseId: (id) => id || null};
  t.same(identityFields(normalizeCDCBatchEvents(service, deps, [event])[0]), identityFields(event));
  t.throws(() => normalizeCDCBatchEvents(service, deps, [{...event, timestamp: null}]),
    {code: 'cdc_event_durable_identity_invalid'}, 'durable event cannot acquire receiver time');
});

test('seed and joining bridges carry immutable producer fields', async (t) => {
  const event = eventOf();
  const received = [];
  const topology = {cdcGroupPropagationService: {
    propagateCDCEvent: async (value) => received.push(value),
  }};
  const seed = new SeedRuntimeBridgeOwner({delegates: {getLatencyTopology: () => topology}});
  await seed.propagatePartitionCDCEvent({}, event);
  await NodeJoiningPublicationActivation.prototype.propagatePartitionCDCEvent.call(
    {latencyTopology: topology}, {}, event);
  t.same(received.map(identityFields), [identityFields(event), identityFields(event)]);
});

test('topology singleton and batch normalization retain operation identity', async (t) => {
  const event = eventOf();
  const owner = CDCGroupPropagationService.prototype;
  t.same(identityFields(owner.normalizeDeliveryEvents(event)[0]), identityFields(event));
  t.same(identityFields(owner.normalizeDeliveryEvents({events: [event]})[0]),
    identityFields(event));
  const later = eventOf(1, event.timestamp);
  t.not(owner.buildBackgroundRetryEventKey(event), owner.buildBackgroundRetryEventKey(later),
    'durable operations must not share a row-coalescing key');
});

test('forwarding singleton and batch preserve the same producer envelope', async (t) => {
  const event = eventOf();
  const sent = [];
  const methods = createMessageGroupForwardingOwnerDeliveryMethods({
    num: {ZERO: 0}, typeofToken: {STRING: 'string'}, normalizeCauseId: (id) => id || null,
    messageGroupApplicationMessageType: {LATENCY_CDC_PROPAGATION: 'single', LATENCY_CDC_PROPAGATION_BATCH: 'batch'},
  });
  const owner = {service: {hlcClock: clock, nodeId: 'n1',
    forwardCDCPayloadToLeader: async (payload) => sent.push(payload)}};
  await methods.forwardCDCEventToLeader.call(
    owner, event.tableName, event.operation, event.data, event);
  await methods.forwardCDCBatchToLeader.call(owner, [event]);
  t.same(identityFields(sent[0]), identityFields(event));
  t.same(identityFields(sent[1].events[0]), identityFields(event));
});

test('actual committed batch consumer preserves identity through normalization and replay', async (t) => {
  class Service {}
  assignRaftTiming(Service);
  const service = new Service();
  service.cdcHandler = handlerOf();
  service.hlcClock = clock;
  service.logger = {error() {}};
  service.emit = () => {};
  service.normalizeCDCBatchEvents = (events) => normalizeCDCBatchEvents(service,
    {normalizeCauseId: (id) => id || null}, events);
  const first = eventOf();
  const events = [first, eventOf(1, first.timestamp)];
  const applied = [];
  service.cdcHandler.on('eventApplied', () => {
    applied.push(service.cdcHandler.cache.get('nodes', 'n1').address);
  });
  for (const index of [1, 2]) {
    const effects = {afterCommit: []};
    service.applyCommittedEntry({
      command: {type: MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH, events},
      index, term: 1, effects,
    });
    for (const effect of effects.afterCommit) effect();
  }
  t.same(applied, ['value-0', 'value-1']);
  service.cdcHandler.shutdown();
});

test('durable identities are partition-bound, unambiguous, and never silently downgraded', async (t) => {
  const handler = handlerOf();
  const first = eventOf();
  const second = eventOf(0, first.timestamp, 'other');
  handler.applyImmediate(first);
  handler.applyImmediate(second);
  t.equal(handler.processedEventIds.size, 2, 'same key on another partition is distinct');
  t.not(buildEventIdentity({...first, sourcePartition: 'p|q', eventKey: 'r'}),
    buildEventIdentity({...first, sourcePartition: 'p', eventKey: 'q|r'}));
  t.throws(() => handler.applyImmediate({...first, sourcePartition: null}),
    {code: 'cdc_event_durable_identity_invalid'});
  handler.shutdown();
});

test('durable operations do not enter row replacement or coalescing', async (t) => {
  const first = eventOf();
  const buffer = new CDCEventBuffer();
  buffer.buffer(first);
  buffer.buffer(eventOf(1, first.timestamp));
  t.equal(buffer.size(), 2);
  const event = {...first, tableName: 'replica_operations', data: {operation_id: 'op1'}};
  t.equal(resolveCdcPropagationDeliveryProfile([event]).replacePendingKey, null,
    'transport cannot replace an earlier durable obligation');
});
