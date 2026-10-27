// Envelope-owner component vectors only. These values are not evidence of a
// committed native event, source admission, transport delivery or ACK rights.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {captureCdcEvents} from '../../src/cdc/cdc-event-envelope.js';
import {CDC_EVENT_IDENTITY} from '../../src/constants/cdc-lifecycle-constants.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {buildCdcSourceScopeEvidence, isCdcSourceScopeEvidence,
  CDC_SOURCE_SCOPE_AUTHORITY} from '../../src/cdc/cdc-source-scope-evidence.js';

const SOURCE_PARTITION = 'envelope-component-source';
const SOURCE_REPLICA = `${SOURCE_PARTITION}-r1`;
const ORIGINAL_STAMP = new HLCTimestamp(1729, 7, 'original-source-node').toString();
const SOURCE_SCOPE = buildCdcSourceScopeEvidence({
  authority: CDC_SOURCE_SCOPE_AUTHORITY.REPLICA_CREATE_WORKFLOW,
  partitionDescriptor: {partition_id: SOURCE_PARTITION, table_id: TABLES.CONFIG,
    partition_key_start: 'alpha', partition_key_end: 'omega', partition_version: 3},
  tableDescriptor: {table_id: TABLES.CONFIG, table_name: TABLES.CONFIG,
    active_partition_version: 3},
});

function event(entryId = 'captured-write', sourceLogIndex = 11) {
  return {tableName: TABLES.CONFIG, operation: CDC_OPERATION.UPSERT,
    data: {config_key: 'same-row', config_value: 'before',
      nested: {list: [null, false, 0, 'original', {leaf: ['before']}]},
      updated_at_hlc: ORIGINAL_STAMP},
    timestamp: ORIGINAL_STAMP, sourcePartition: SOURCE_PARTITION,
    sourceReplica: SOURCE_REPLICA, eventKey: entryId, entryId,
    sourceLogIndex, sourceOrdinal: 0, sourceScope: structuredClone(SOURCE_SCOPE),
    causeId: 'original-diagnostic-cause', replayOnly: true};
}

function assertDeepFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

function assertWholeBatchRefused(bad) {
  const before = event('valid-before', 10);
  const after = event('valid-after', 12);
  const expected = structuredClone([before, after]);
  let returned = null;
  assert.throws(() => {
    returned = captureCdcEvents([before, bad, after]);
  }, {code: CDC_EVENT_IDENTITY.INVALID_CODE});
  assert.equal(returned, null, 'no filtered successful prefix or suffix escapes');
  assert.deepEqual([before, after], expected, 'refusal does not change valid input members');
  assert.equal(Object.isFrozen(before), false, 'capture does not take ownership of caller objects');
  assert.equal(Object.isFrozen(after), false);
}

test('captureCdcEvents detaches and deeply freezes the complete accepted vector', () => {
  const input = [event('first', 11), event('second', 12)];
  const expected = structuredClone(input);
  const captured = captureCdcEvents(input);
  assert.deepEqual(captured, expected);
  assert.notEqual(captured, input);
  assert.notEqual(captured[0], input[0]);
  assert.notEqual(captured[0].data, input[0].data);
  assert.notEqual(captured[0].data.nested.list, input[0].data.nested.list);
  assert.notEqual(captured[0].data.nested.list[4].leaf, input[0].data.nested.list[4].leaf);
  assert.notEqual(captured[0].sourceScope, input[0].sourceScope);
  assertDeepFrozen(captured);
  input[0].data.config_value = 'changed';
  input[0].data.nested.list[4].leaf.push('caller-changed');
  input[0].sourceScope.rangeStart = 'changed-range';
  input[0].sourceLogIndex = 99;
  input[0].timestamp = new HLCTimestamp(9000, 0, 'other-node').toString();
  input[0].causeId = 'changed-cause';
  input.reverse();
  input.push(event('third', 13));
  assert.deepEqual(captured, expected, 'later caller mutation cannot change proposed semantics');
  assert.throws(() => captured.push(event('fourth', 14)), TypeError);
  assert.throws(() => {
    captured[0].data.nested.list[4].leaf[0] = 'changed';
  }, TypeError);
  assert.throws(() => {
    captured[0].sourceScope.partitionVersion = 4;
  }, TypeError);
});

for (const operation of Object.values(CDC_OPERATION)) {
  test(`captureCdcEvents preserves the supported ${operation} operation`, () => {
    const input = {...event(), operation};
    assert.deepEqual(captureCdcEvents([input]), [input]);
  });
}

test('captureCdcEvents preserves the original stamp, supported positions and diagnostic fields', () => {
  const input = event('full-envelope', Number.MAX_SAFE_INTEGER);
  input.sourceOrdinal = Number.MAX_SAFE_INTEGER;
  const [captured] = captureCdcEvents([input]);
  assert.equal(captured.timestamp, ORIGINAL_STAMP);
  assert.equal(captured.data.updated_at_hlc, ORIGINAL_STAMP);
  assert.equal(captured.sourcePartition, SOURCE_PARTITION);
  assert.equal(captured.sourceReplica, SOURCE_REPLICA);
  assert.equal(captured.eventKey, 'full-envelope');
  assert.equal(captured.entryId, 'full-envelope');
  assert.equal(captured.sourceLogIndex, Number.MAX_SAFE_INTEGER);
  assert.equal(captured.sourceOrdinal, Number.MAX_SAFE_INTEGER);
  assert.equal(captured.causeId, 'original-diagnostic-cause');
  assert.equal(captured.replayOnly, true);
  assert.deepEqual(captured.sourceScope, SOURCE_SCOPE);
  assert.equal(isCdcSourceScopeEvidence(captured.sourceScope), true);
});

test('captureCdcEvents preserves absent optional fields without inventing source evidence', () => {
  const durable = event();
  for (const field of ['sourceLogIndex', 'sourceOrdinal', 'sourceScope', 'causeId', 'replayOnly']) {
    delete durable[field];
  }
  const cacheOnly = {tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
    data: {config_key: 'cache-only', config_value: 'projection'}};
  const captured = captureCdcEvents([durable, cacheOnly]);
  assert.deepEqual(captured, [durable, cacheOnly]);
  assert.equal(Object.hasOwn(captured[1], 'eventKey'), false);
  assert.equal(Object.hasOwn(captured[1], 'timestamp'), false);
  assert.equal(Object.hasOwn(captured[1], 'sourcePartition'), false);
});

test('captureCdcEvents keeps same-row distinct occurrences and source-partition distinctions', () => {
  const first = event('same-entry', 11);
  const later = {...structuredClone(first), eventKey: 'later-entry', entryId: 'later-entry',
    sourceLogIndex: 12};
  const elsewhere = {...structuredClone(first), sourcePartition: 'another-source'};
  delete elsewhere.sourceScope;
  const captured = captureCdcEvents([first, later, elsewhere]);
  assert.equal(captured.length, 3);
  assert.deepEqual(captured, [first, later, elsewhere]);
});

for (const [label, patch] of [
  ['identical', {}],
  ['conflicting payload', {data: {config_key: 'same-row', config_value: 'different'}}],
  ['conflicting original stamp', {timestamp: new HLCTimestamp(1729, 8, 'source').toString()}],
  ['conflicting position', {sourceLogIndex: 12}],
  ['different diagnostic cause', {causeId: 'another-cause'}],
]) {
  test(`captureCdcEvents rejects a duplicate durable occurrence: ${label}`, () => {
    const original = event();
    assert.throws(() => captureCdcEvents([original, {...structuredClone(original), ...patch}]),
      {code: CDC_EVENT_IDENTITY.INVALID_CODE});
  });
}

const MALFORMED_MEMBERS = [
  ['null member', () => null],
  ['primitive member', () => 'not-an-event'],
  ['array member', () => []],
  ['missing table', () => ({...event(), tableName: undefined})],
  ['empty table', () => ({...event(), tableName: ''})],
  ['wrong-type table', () => ({...event(), tableName: 1})],
  ['missing operation', () => ({...event(), operation: undefined})],
  ['unknown operation', () => ({...event(), operation: 'UNKNOWN'})],
  ['wrong-type operation', () => ({...event(), operation: true})],
  ['missing row', () => ({...event(), data: undefined})],
  ['null row', () => ({...event(), data: null})],
  ['array row', () => ({...event(), data: []})],
  ['primitive row', () => ({...event(), data: 'not-a-row'})],
  ['missing event key', () => ({...event(), eventKey: undefined})],
  ['empty event key', () => ({...event(), eventKey: ''})],
  ['missing source partition', () => ({...event(), sourcePartition: undefined})],
  ['empty source partition', () => ({...event(), sourcePartition: ''})],
  ['missing original stamp', () => ({...event(), timestamp: undefined})],
  ['empty original stamp', () => ({...event(), timestamp: ''})],
  ['numeric original stamp', () => ({...event(), timestamp: 1729})],
];

for (const [label, build] of MALFORMED_MEMBERS) {
  test(`captureCdcEvents refuses the whole batch with ${label}`, () => assertWholeBatchRefused(build()));
}

for (const field of ['sourceLogIndex', 'sourceOrdinal']) {
  for (const [label, value] of [['negative', -1], ['fractional', 1.5], ['string', '11'],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1], ['null', null], ['non-finite', Infinity]]) {
    test(`captureCdcEvents refuses unsupported ${field}: ${label}`, () => {
      assertWholeBatchRefused({...event(), [field]: value});
    });
  }
}

test('captureCdcEvents refuses a zero source log index and preserves ordinal zero', () => {
  assertWholeBatchRefused({...event(), sourceLogIndex: 0});
  assert.equal(captureCdcEvents([event()])[0].sourceOrdinal, 0);
});

for (const [label, scope] of [
  ['null', null], ['wrong type', 'not-evidence'],
  ['unknown authority', {...SOURCE_SCOPE, authority: 'unowned-authority'}],
  ['changed range', {...SOURCE_SCOPE, rangeStart: 'different'}],
  ['changed version', {...SOURCE_SCOPE, partitionVersion: 4}],
  ['wrong digest', {...SOURCE_SCOPE, descriptorDigest: 'not-the-descriptor'}],
  ['wrong scope identity', {...SOURCE_SCOPE, scopeId: 'another-scope'}],
]) {
  test(`captureCdcEvents refuses malformed supplied source scope: ${label}`, () => {
    assertWholeBatchRefused({...event(), sourceScope: scope});
  });
}

const UNSUPPORTED_DATA = [
  ['undefined', () => undefined], ['NaN', () => NaN], ['infinity', () => Infinity],
  ['negative infinity', () => -Infinity], ['bigint', () => 1n], ['symbol', () => Symbol('data')],
  ['function', () => () => 'not-data'], ['date', () => new Date(0)],
  ['map', () => new Map([['key', 'value']])], ['set', () => new Set(['value'])],
  ['typed array', () => new Uint8Array([1, 2])], ['custom prototype', () => Object.create({})],
];

for (const [label, build] of UNSUPPORTED_DATA) {
  test(`captureCdcEvents rejects unsupported nested data: ${label}`, () => {
    const input = event();
    input.data.nested.list.push(build());
    assertWholeBatchRefused(input);
  });
}

test('captureCdcEvents rejects sparse or decorated vectors and nested arrays', () => {
  const sparse = [event('first'), event('middle', 12), event('last', 13)];
  delete sparse[1];
  const decorated = [event()];
  decorated.extra = 'not-a-member';
  for (const vector of [[], sparse, decorated, {0: event(), length: 1}]) {
    assert.throws(() => captureCdcEvents(vector), {code: CDC_EVENT_IDENTITY.INVALID_CODE});
  }
  const input = event();
  delete input.data.nested.list[1];
  assertWholeBatchRefused(input);
  const nested = event();
  nested.data.nested.list.extra = 'lost-by-a-naive-array-copy';
  assertWholeBatchRefused(nested);
});

test('captureCdcEvents refuses accessors without invoking them at any captured depth', () => {
  let reads = 0;
  const accessor = {enumerable: true, get() {
    reads += 1;
    return 'hidden-work';
  }};
  const outer = event();
  Object.defineProperty(outer, 'data', accessor);
  const nested = event();
  Object.defineProperty(nested.data.nested, 'accessor', accessor);
  const scope = event();
  Object.defineProperty(scope.sourceScope, 'rangeStart', accessor);
  for (const member of [outer, nested, scope]) assertWholeBatchRefused(member);
  const vector = [event()];
  Object.defineProperty(vector, '0', accessor);
  assert.throws(() => captureCdcEvents(vector), {code: CDC_EVENT_IDENTITY.INVALID_CODE});
  assert.equal(reads, 0, 'capture inspects data descriptors rather than executing getters');
});

test('captureCdcEvents refuses cycles and toJSON behavior but accepts acyclic shared data', () => {
  const cyclic = event();
  cyclic.data.nested.back = cyclic.data;
  assertWholeBatchRefused(cyclic);
  let serialized = 0;
  const behavioral = event();
  behavioral.data.toJSON = () => {
    serialized += 1;
    return {};
  };
  assertWholeBatchRefused(behavioral);
  assert.equal(serialized, 0);
  const shared = {values: ['before']};
  const input = event();
  input.data.left = shared;
  input.data.right = shared;
  const [captured] = captureCdcEvents([input]);
  shared.values[0] = 'after';
  assert.deepEqual(captured.data.left, {values: ['before']});
  assert.deepEqual(captured.data.right, {values: ['before']});
  assertDeepFrozen(captured);
});

test('captureCdcEvents rejects hidden properties and symbol keys instead of dropping them', () => {
  const hidden = event();
  Object.defineProperty(hidden.data, 'hidden', {value: 'unrepresentable', enumerable: false});
  assertWholeBatchRefused(hidden);
  const symbolic = event();
  symbolic.data[Symbol('unrepresentable')] = 'value';
  assertWholeBatchRefused(symbolic);
});

test('captureCdcEvents accepts canonical null-prototype row data without prototype effects', () => {
  const input = event();
  input.data = Object.create(null);
  input.data.config_key = 'own-data';
  input.data.__proto__ = {literal: ['still-data']};
  const [captured] = captureCdcEvents([input]);
  assert.equal(captured.data.config_key, 'own-data');
  assert.equal(Object.hasOwn(captured.data, '__proto__'), true);
  assert.deepEqual(captured.data.__proto__, {literal: ['still-data']});
  const prototype = Object.getPrototypeOf(captured.data);
  assert.ok(prototype === Object.prototype || prototype === null);
  assertDeepFrozen(captured);
});

test('captureCdcEvents adds no 64-event or 1 MiB total-domain ceiling', () => {
  const input = Array.from({length: 65}, (_, index) => event(`accepted-${index}`, index + 1));
  input[0].data.config_value = 'x'.repeat(1024 * 1024 + 1);
  const captured = captureCdcEvents(input);
  assert.equal(captured.length, input.length);
  assert.equal(captured[0].data.config_value, input[0].data.config_value);
  assertDeepFrozen(captured);
});
