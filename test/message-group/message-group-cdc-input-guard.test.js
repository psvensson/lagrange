// Actual recipient-entry guard witnesses over the existing real RF1 fixture.
// Input occurrences are test data, not source SQL/ledger or source ACK proof.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {CDC_EVENT_IDENTITY} from '../../src/constants/cdc-lifecycle-constants.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {CDC_COMPLETION, isCommittedCdcOutcome} from '../../src/cdc/cdc-delivery-outcome.js';
import {CDC_DELIVERY_REMAINING_MS} from '../../src/cdc/cdc-delivery-budget.js';
import {CDC_SOURCE_SCOPE_AUTHORITY, buildCdcSourceScopeEvidence} from
  '../../src/cdc/cdc-source-scope-evidence.js';
import {buildEventIdentity} from '../../src/partition/cdc-event-buffer.js';
import {digest} from '../../src/utils/canonical-json-data.js';
import {pollutePrototypeProperty, replacePrototypeProperty, withHostileIntrinsics} from
  '../helpers/hostile-intrinsics.js';
import {GROUP_ID, NODE_ID, pump, recipientFixture} from './message-group-native-custody-fixture.js';

const SOURCE_PARTITION = 'guard-source';
const KEY = 'guard-native-row';
const ENTRIES = ['direct', 'forward-handler'];

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE_ID}, logging: {level: 'fatal'},
    raft: {heartbeatIntervalMs: 20, electionTimeoutMinMs: 150, electionTimeoutMaxMs: 300}});
  LoggingService.getInstance().initialize({level: 'fatal'});
});
afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function sourceEvent() {
  return {tableName: TABLES.CONFIG, operation: CDC_OPERATION.INSERT,
    data: {config_key: KEY, config_value: 'guard-body', nested: {values: [1, 2]}},
    timestamp: new HLCTimestamp(1000, 0, 'guard-producer').toString(),
    sourcePartition: SOURCE_PARTITION, sourceReplica: `${SOURCE_PARTITION}-r1`,
    eventKey: 'guard-occurrence', entryId: 'guard-occurrence', sourceLogIndex: 7, sourceOrdinal: 0};
}

function scope(version = 1, authority = CDC_SOURCE_SCOPE_AUTHORITY.BOOTSTRAP_GENESIS) {
  return buildCdcSourceScopeEvidence({authority,
    partitionDescriptor: {partition_id: SOURCE_PARTITION, table_id: TABLES.CONFIG,
      partition_key_start: null, partition_key_end: null, partition_version: version},
    tableDescriptor: {table_id: TABLES.CONFIG, table_name: TABLES.CONFIG,
      active_partition_version: version}});
}

function unsupportedScope() {
  const {scopeId: _scopeId, descriptorDigest: _digest, ...fields} = scope();
  fields.authority = 'unsupported-scope-authority';
  const descriptorDigest = digest(fields);
  return {...fields, descriptorDigest,
    scopeId: digest({partitionId: fields.partitionId, descriptorDigest})};
}

function changedNumberConversion(result) {
  // Change the conversion function while retaining the existing numeric
  // static operations used by unrelated timeout machinery on the same path.
  return Object.setPrototypeOf(() => result, Number);
}

function nativeState(service) {
  const record = RaftRsDurableStore.readDurableRecordIn(service.db, GROUP_ID);
  return {entries: structuredClone(record.entries), hardState: structuredClone(record.hardState),
    appliedIndex: record.appliedIndex,
    row: structuredClone(service.systemTableCache.get(TABLES.CONFIG, KEY) ?? null)};
}

function observeEffects(t, service) {
  const calls = {'proposals': 0, 'applications': 0, 'direct': 0, 'forward-handler': 0};
  const wrap = (owner, method, field) => {
    const original = owner[method];
    assert.equal(typeof original, 'function', `actual ${method} owner is installed`);
    owner[method] = function(...args) {
      calls[field] += 1;
      return Reflect.apply(original, this, args);
    };
    t.after(() => {
      owner[method] = original;
    });
  };
  wrap(service, 'proposeCDCCommand', 'proposals');
  wrap(service.cdcHandler, 'applyImmediate', 'applications');
  wrap(service, 'applyCDCBatch', 'direct');
  wrap(service, 'handleLatencyCdcPropagationBatchMessage', 'forward-handler');
  return calls;
}

function startEntry(service, entry, events, install = () => []) {
  // Restore all global mutations before yielding to native/runtime work. The
  // actual async method's synchronous admission prefix runs inside this cut.
  const payload = {events, targetGroupId: GROUP_ID,
    [CDC_DELIVERY_REMAINING_MS]: service.deliveryTimeoutMs};
  return withHostileIntrinsics(install(), () => entry === 'direct' ?
    service.applyCDCBatch(events) :
    service.handleLatencyCdcPropagationBatchMessage('guard-entry', payload));
}

async function settleEntry(f, operation) {
  const observed = {settled: false, answer: undefined, error: undefined};
  const completion = Promise.resolve(operation).then((answer) => {
    observed.answer = answer;
    observed.settled = true;
  }, (error) => {
    observed.error = error;
    observed.settled = true;
  });
  await pump(f);
  assert.equal(observed.settled, true, 'the existing finite native schedule settles the entry');
  await completion;
  return observed;
}

async function refuse(f, calls, entry, events, install = () => [], callerView = () => events) {
  const service = f.services[0];
  const expected = structuredClone(callerView());
  const before = nativeState(service);
  const pendingBefore = service.cdcCommitWaiters.size;
  const counters = {...calls};
  const result = await settleEntry(f, startEntry(service, entry, events, install));
  assert.ok(result.error?.code === CDC_EVENT_IDENTITY.INVALID_CODE ||
    result.error?.code === CDC_COMPLETION.INVALID, result.error?.stack ?? 'typed refusal required');
  assert.equal(result.answer, undefined);
  assert.equal(calls[entry], counters[entry] + 1, 'the real requested entry was invoked');
  assert.equal(calls.proposals, counters.proposals, 'refusal precedes actual proposal routing');
  assert.equal(calls.applications, counters.applications, 'refusal precedes actual cache apply');
  assert.equal(service.cdcCommitWaiters.size, pendingBefore,
    'typed refusal retains no recipient reservation or operation custody');
  assert.deepEqual(nativeState(service), before, 'native frontiers and row remain unchanged');
  assert.deepEqual(structuredClone(callerView()), expected, 'the complete caller vector is unchanged');
}

async function accept(f, calls, entry, events, install = () => []) {
  const expected = structuredClone(events);
  const proposals = calls.proposals;
  const applications = calls.applications;
  const result = await settleEntry(f, startEntry(f.services[0], entry, events, install));
  assert.equal(result.error, undefined, result.error?.stack);
  assert.equal(isCommittedCdcOutcome(result.answer, expected, GROUP_ID), true);
  assert.ok(calls.proposals > proposals, 'restored input reaches the actual proposal owner');
  assert.ok(calls.applications > applications, 'restored input reaches actual native application');
  assert.deepEqual(structuredClone(events), expected, 'valid admission preserves caller input');
  const record = RaftRsDurableStore.readDurableRecordIn(f.services[0].db, GROUP_ID);
  assert.ok(BigInt(record.appliedIndex) >= BigInt(result.answer.cdcCommitted[0].logIndex));
  assert.equal(f.services[0].systemTableCache.get(TABLES.CONFIG, KEY).config_value, 'guard-body');
}

for (const entry of ENTRIES) {
  test(`durable identity guards refuse before effects through ${entry}`, async (t) => {
    const f = await recipientFixture(t, KEY, {replicaCount: 1});
    const calls = observeEffects(t, f.services[0]);
    for (const patch of [{eventKey: ''}, {sourcePartition: 0}]) {
      await refuse(f, calls, entry, [{...sourceEvent(), ...patch}], () =>
        [replacePrototypeProperty(Object, 'hasOwn', () => false)]);
    }
    for (const target of [JSON, Array.prototype]) {
      let serializations = 0;
      const field = target === JSON ? 'stringify' : 'toJSON';
      await refuse(f, calls, entry, [sourceEvent(), sourceEvent()], () =>
        [replacePrototypeProperty(target, field, () => `changed-${serializations += 1}`)]);
      assert.equal(serializations, 0, 'durable tuple capture never delegates to replaced encoding');
    }
    const identity = buildEventIdentity(sourceEvent());
    const observedIdentity = withHostileIntrinsics([
      replacePrototypeProperty(Object, 'hasOwn', () => false),
      replacePrototypeProperty(JSON, 'stringify', () => 'wrong-identity'),
      replacePrototypeProperty(Array.prototype, 'toJSON', () => 'wrong-identity'),
    ], () => buildEventIdentity(sourceEvent()));
    assert.equal(observedIdentity, identity, 'exact valid identity survives the same mutations');
    await accept(f, calls, entry, [sourceEvent()]);
  });

  test(`canonical scope guards refuse coercion and inherited fields through ${entry}`, async (t) => {
    const f = await recipientFixture(t, KEY, {replicaCount: 1});
    const calls = observeEffects(t, f.services[0]);
    await refuse(f, calls, entry, [{...sourceEvent(), sourceScope: unsupportedScope()}], () =>
      [replacePrototypeProperty(Set.prototype, 'has', () => true)]);
    const versions = [[], ['1'], '1', Object(1), 0, -1, NaN, Infinity,
      Number.MAX_SAFE_INTEGER + 1];
    for (const version of versions) {
      let conversions = 0;
      const sourceScope = {...scope(), partitionVersion: version, activePartitionVersion: version};
      await refuse(f, calls, entry, [{...sourceEvent(), sourceScope}], () => [
        replacePrototypeProperty(Array.prototype, 'toString', () => {
          conversions += 1; return '1';
        }),
        replacePrototypeProperty(Number, 'isSafeInteger', () => true),
      ]);
      assert.equal(conversions, 0, 'canonical evidence is refused before coercion');
    }
    await refuse(f, calls, entry,
      [{...sourceEvent(), sourceScope: {...scope(), partitionVersion: '1'}}], () =>
        [replacePrototypeProperty(globalThis, 'Number', changedNumberConversion(1))]);
    const valid = scope();
    for (const field of Object.keys(valid)) {
      const sourceScope = {...valid};
      delete sourceScope[field];
      await refuse(f, calls, entry, [{...sourceEvent(), sourceScope}], () =>
        [pollutePrototypeProperty(Object.prototype, field, valid[field])]);
      sourceScope.extra = 'same-count-does-not-make-a-missing-field-own';
      await refuse(f, calls, entry, [{...sourceEvent(), sourceScope}]);
    }
    assert.deepEqual(scope('1'), valid, 'builder descriptor conversion remains its own policy');
    const built = withHostileIntrinsics([
      replacePrototypeProperty(Set.prototype, 'has', () => false),
      replacePrototypeProperty(Number, 'isSafeInteger', () => false),
      replacePrototypeProperty(globalThis, 'Number', changedNumberConversion(0)),
    ], () => scope('1'));
    assert.deepEqual(built, valid, 'the actual builder retains its primitive conversion semantics');
    const canonical = Object.assign(Object.create(null), valid);
    await accept(f, calls, entry, [{...sourceEvent(), sourceScope: canonical}]);
    assert.equal(Object.getPrototypeOf(canonical), null);
  });
}

function proxyInput(location, revoked) {
  const plain = [sourceEvent()];
  const expected = structuredClone(plain);
  const known = new Map();
  let traps = 0;
  const wrap = (target) => {
    const handler = {};
    for (const name of ['get', 'getPrototypeOf', 'getOwnPropertyDescriptor', 'ownKeys', 'has']) {
      handler[name] = (...args) => {
        traps += 1; return Reflect[name](...args);
      };
    }
    const pair = Proxy.revocable(target, handler);
    known.set(pair.proxy, target);
    if (revoked) pair.revoke();
    return pair.proxy;
  };
  let input = plain;
  if (location === 'vector') input = wrap(plain);
  if (location === 'member') input = [wrap(plain[0])];
  if (location === 'data') input = [{...plain[0], data: wrap(plain[0].data)}];
  if (location === 'array') {
    input = [{...plain[0], data: {...plain[0].data,
      nested: {values: wrap(plain[0].data.nested.values)}}}];
  }
  // Test-owned projection substitutes only proxies constructed above. It never
  // probes a proxy or supplies a production acceptance/identity decision.
  const view = (value) => {
    if (known.has(value)) return view(known.get(value));
    if (Array.isArray(value)) return value.map(view);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, view(item)]));
    }
    return value;
  };
  return {input, expected, view: () => view(input), traps: () => traps};
}

for (const entry of ENTRIES) {
  test(`proxy input cannot execute traps before ${entry} capture`, async (t) => {
    const f = await recipientFixture(t, KEY, {replicaCount: 1});
    const calls = observeEffects(t, f.services[0]);
    for (const location of ['vector', 'member', 'data', 'array']) {
      for (const revoked of [false, true]) {
        const input = proxyInput(location, revoked);
        assert.deepEqual(input.view(), input.expected, 'independent original input snapshot');
        await refuse(f, calls, entry, input.input, undefined, input.view);
        assert.equal(input.traps(), 0, `${location} proxy traps remain unexecuted`);
        assert.deepEqual(input.view(), input.expected);
      }
    }
    await accept(f, calls, entry, [sourceEvent()]);
  });
}
