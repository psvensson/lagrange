// Actual CDC catchup, authoritative read flow and writable cache. The owner
// RPC and local partition answers are controlled ports; this does not prove
// native membership or cross-table snapshot execution.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {CDC_CATCHUP_TRIGGER} from
  '../../src/cdc/cdc-integration-service-authoritative-catchup.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {CDC_OPERATION, TABLES} from '../../src/constants/index.js';
import {INITIAL_PARTITION_IDS} from '../../src/bootstrap/system-table-schemas-constants.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER, GATEWAY_ERROR_MSG} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {createLocalSystemTablePartitionServices, setupCDCTestLifecycle} from
  './cdc-integration-service-test-support.js';

setupCDCTestLifecycle(beforeEach, afterEach);

const TABLE = TABLES.NODES;
const NOW = 1000;
const ROW = Object.freeze({node_id: 'catchup-owned-row', status: 'active', updated_at: 10});
const UNSEEN_ROW = Object.freeze({node_id: 'catchup-unseen-row', status: 'active', updated_at: 10});
const LOCAL_ROW = Object.freeze({...ROW, address: 'local-bootstrap-owner'});
const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const CATCHUP_OPTIONS = Object.freeze({trigger: CDC_CATCHUP_TRIGGER.JOIN_CATCHUP,
  tables: Object.freeze([TABLE]), maxAttemptsPerTable: 1});

function ownerAnswer(fields = {}) {
  return {success: true, rows: [ROW], rowSetComplete: true,
    readAuthorityWitness: {state: 'observed', partitionId: INITIAL_PARTITION_IDS[TABLE],
      role: 'leader', servingNodeId: 'catchup-owner', servingReplicaId: 'nodes-p1-owner',
      observedAtMs: NOW, term: 3, appliedIndex: 8, commitIndex: 8},
    ...fields};
}

function selectedAuthority() {
  return buildControlPlaneReadAuthority({authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
    leaderMode: LEADER.REQUIRED});
}

function fixture(t, {bootstrap = false} = {}) {
  const clock = new VirtualTimeSource({startMs: NOW});
  const cache = new SystemTableCache({timeSource: clock});
  cache.applySystemTableChange(TABLE, CDC_OPERATION.UPSERT, ROW);
  cache.applySystemTableChange(TABLE, CDC_OPERATION.UPSERT, UNSEEN_ROW);
  const calls = {reads: [], rpc: [], local: 0, sql: 0, repairs: 0, sweeps: 0};
  let answer = ownerAnswer();
  const local = createLocalSystemTablePartitionServices(TABLE, {
    async executeQuery() {
      calls.local += 1;
      return {success: true, rows: [LOCAL_ROW]};
    },
  });
  const service = new CDCIntegrationService({nodeId: 'catchup-recipient',
    timeSource: clock, systemTableCache: cache,
    sqlQueryEngine: {
      queryExecutor: {async executeOnPartition(...args) {
        calls.rpc.push(args);
        return answer;
      }},
      async executeQuery() {calls.sql += 1; return ownerAnswer();},
    },
  });
  service.logger = QUIET;
  if (bootstrap) service.setBootstrapMode(true, local);
  const read = service.executeAuthoritativeSystemTableRead;
  service.executeAuthoritativeSystemTableRead = function(...args) {
    calls.reads.push(args);
    return Reflect.apply(read, this, args);
  };
  const repair = service.applyAuthoritativeCacheRepair;
  service.applyAuthoritativeCacheRepair = function(...args) {
    calls.repairs += 1;
    return Reflect.apply(repair, this, args);
  };
  const sweep = service.applyAuthoritativeCacheSweep;
  service.applyAuthoritativeCacheSweep = function(...args) {
    calls.sweeps += 1;
    return Reflect.apply(sweep, this, args);
  };
  t.after(() => service.markShuttingDown());
  return {service, cache, clock, calls, setAnswer(result) {answer = result;},
    run: (options = {}) => service.hydrateCdcPropagatedTablesFromAuthority({
      ...CATCHUP_OPTIONS, ...options,
    })};
}

function assertNoCompleteEffect(f) {
  assert.deepEqual(f.cache.get(TABLE, UNSEEN_ROW.node_id), UNSEEN_ROW,
    'an incomplete owner subset cannot certify absence of a real cached row');
  assert.deepEqual(f.cache.get(TABLE, ROW.node_id), ROW);
  assert.equal(f.cache.getLastAuthoritativeObservedAtMs(TABLE), null,
    'the incomplete answer cannot publish complete freshness');
  assert.equal(f.calls.repairs, 0);
  assert.equal(f.calls.sweeps, 0);
  assert.equal(f.clock.pendingTimerCount(), 0);
  assert.equal(f.calls.sql, 0);
}

async function assertCompleteOwnerHealing(f, authority) {
  f.setAnswer(ownerAnswer());
  const healed = await f.run({readAuthority: authority});
  assert.equal(healed.tablesHydrated, 1);
  assert.deepEqual(healed.tablesFailed, []);
  assert.equal(healed.rowsSwept, 1, 'the complete owner answer reaches the real absence sweep');
  assert.equal(f.cache.get(TABLE, UNSEEN_ROW.node_id), undefined);
  assert.deepEqual(f.cache.get(TABLE, ROW.node_id), ROW);
  assert.equal(f.cache.getLastAuthoritativeObservedAtMs(TABLE), NOW);
  assert.equal(f.calls.reads.at(-1)[3].readAuthority, authority);
  assert.equal(f.calls.rpc.at(-1)[6].readAuthority, authority);
  assert.equal(f.calls.local, 0);
  assert.equal(f.calls.sql, 0);
}

for (const malformed of [
  {name: 'null', create: () => null},
  {name: 'mutable', create: (authority) => ({...authority})},
]) {
  test(`catchup refuses a selected ${malformed.name} token before replacing it or reading`,
    async (t) => {
      const f = fixture(t);
      const authority = selectedAuthority();
      await assert.rejects(f.run({readAuthority: malformed.create(authority)}), {
        message: GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_AUTHORITY_TOKEN_REQUIRED,
      });
      assert.equal(f.calls.reads.length, 0);
      assert.equal(f.calls.rpc.length, 0);
      assertNoCompleteEffect(f);
      await assertCompleteOwnerHealing(f, authority);
    });
}

const INCOMPLETE_ANSWERS = [
  {name: 'missing completeness', fields: {rowSetComplete: undefined}},
  {name: 'explicit incomplete', fields: {rowSetComplete: false}},
  {name: 'partial', fields: {partial: true}},
  ...['failedPartitions', 'partitionErrors', 'participantFailures'].flatMap((field) => [
    {name: `${field} count`, fields: {[field]: 1}},
    {name: `${field} collection`, fields: {[field]: ['unanswered-owner']}},
  ]),
];

for (const incomplete of INCOMPLETE_ANSWERS) {
  test(`catchup ${incomplete.name} owner subset preserves cache absence debt; same owner heals`,
    async (t) => {
      const f = fixture(t);
      const authority = selectedAuthority();
      f.setAnswer(ownerAnswer(incomplete.fields));
      const refused = await f.run({readAuthority: authority});
      assertNoCompleteEffect(f);
      assert.equal(refused.tablesHydrated, 0);
      assert.deepEqual(refused.tablesFailed, [TABLE]);
      assert.equal(f.calls.rpc.length, 1, 'the declared RPC owner actually answered the subset');
      assert.equal(f.calls.rpc[0][6].readAuthority, authority);
      await assertCompleteOwnerHealing(f, authority);
      assert.equal(f.calls.rpc.length, 2, 'a later request returns to the same owner');
    });
}

test('catchup accepts an exact selected complete owner token through real reconciliation',
  async (t) => {
    const f = fixture(t);
    await assertCompleteOwnerHealing(f, selectedAuthority());
    assert.equal(f.calls.reads.length, 1);
    assert.equal(f.calls.rpc.length, 1);
  });

test('explicit bootstrap catchup keeps provisional local rows without remote absence authority',
  async (t) => {
    const f = fixture(t, {bootstrap: true});
    const summary = await f.run();
    assert.equal(summary.tablesHydrated, 1);
    assert.deepEqual(f.cache.get(TABLE, ROW.node_id), LOCAL_ROW);
    assert.deepEqual(f.cache.get(TABLE, UNSEEN_ROW.node_id), UNSEEN_ROW);
    assert.equal(f.cache.getLastAuthoritativeObservedAtMs(TABLE), null);
    assert.equal(f.calls.reads[0][3].readAuthority.authoritativeReadMode, MODE.OWNER_LOCAL_ONLY);
    assert.equal(f.calls.reads[0][3].readAuthority.leaderMode, LEADER.ANY);
    assert.equal(f.calls.local, 1);
    assert.equal(f.calls.rpc.length, 0);
    assert.equal(f.calls.sql, 0);
    assert.equal(f.calls.sweeps, 0);
    assert.equal(f.clock.pendingTimerCount(), 0);
  });

const ROW_VECTOR_CARRIERS = [
  {name: 'own every callback', create(calls) {
    const rows = [{...ROW}];
    Object.defineProperty(rows, 'every', {enumerable: true, value() {
      calls.count += 1;
      return true;
    }});
    return rows;
  }},
  {name: 'own iterator getter', create(calls) {
    const rows = [{...ROW}];
    Object.defineProperty(rows, Symbol.iterator, {get() {
      calls.count += 1;
      return function* () {yield ROW;};
    }});
    return rows;
  }},
  {name: 'sparse membership', create() {
    const rows = [{...ROW}];
    rows.length = 2;
    return rows;
  }},
  {name: 'key accessor', create(calls) {
    const row = {...ROW};
    Object.defineProperty(row, 'node_id', {enumerable: true, get() {
      calls.count += 1;
      return ROW.node_id;
    }});
    return [row];
  }},
  {name: 'row serialization hook', create(calls) {
    return [{...ROW, toJSON() {calls.count += 1; return ROW;}}];
  }},
  {name: 'nested serialization hook', create(calls) {
    return [{...ROW, detail: {toJSON() {calls.count += 1; return 'rewritten';}}}];
  }},
  {name: 'nested array accessor', create(calls) {
    const detail = [];
    Object.defineProperty(detail, 0, {enumerable: true, get() {
      calls.count += 1;
      return 'rewritten';
    }});
    return [{...ROW, detail}];
  }},
  {name: 'row proxy', create(calls) {
    return [new Proxy({...ROW}, {get(target, key, receiver) {
      calls.count += 1;
      return Reflect.get(target, key, receiver);
    }})];
  }},
  {name: 'inherited canonical key', create() {
    return [Object.assign(Object.create({node_id: ROW.node_id}),
      {status: ROW.status, updated_at: ROW.updated_at})];
  }},
  {name: 'duplicate canonical keys', create() {return [{...ROW}, {...ROW}];}},
];

for (const carrier of ROW_VECTOR_CARRIERS) {
  test(`catchup refuses ${carrier.name} before data callbacks or effects; same owner heals`,
    async (t) => {
      const f = fixture(t);
      const calls = {count: 0};
      const authority = selectedAuthority();
      f.setAnswer(ownerAnswer({rows: carrier.create(calls)}));
      const refused = await f.run({readAuthority: authority});
      assert.equal(f.calls.rpc.length, 1, 'the declared owner actually returns the carrier');
      assert.equal(calls.count, 0, 'carrier callbacks are never part of data admission');
      assertNoCompleteEffect(f);
      assert.equal(refused.tablesHydrated, 0);
      assert.deepEqual(refused.tablesFailed, [TABLE]);
      await assertCompleteOwnerHealing(f, authority);
    });
}

for (const property of ['every', Symbol.iterator]) {
  test(`catchup retains canonical rows without the live Array ${String(property)} intrinsic`,
    async (t) => {
      const f = fixture(t);
      const authority = selectedAuthority();
      const original = Object.getOwnPropertyDescriptor(Array.prototype, property);
      let invoked = 0;
      let failure;
      Object.defineProperty(Array.prototype, property, {...original, value: function(...args) {
        if (this.length === 1 && this[0]?.node_id === ROW.node_id) {
          invoked += 1;
          throw new Error('borrowed row-vector intrinsic engaged');
        }
        return Reflect.apply(original.value, this, args);
      }});
      try {
        await assertCompleteOwnerHealing(f, authority);
      } catch (error) {
        failure = error;
      } finally {
        Object.defineProperty(Array.prototype, property, original);
      }
      assert.equal(f.calls.rpc.length, 1, 'the canonical owner read was actually issued');
      assert.equal(invoked, 0, 'validation, repair and sweep retain indexed row membership');
      assert.equal(failure, undefined);
    });
}

test('catchup retains original row membership, keys and nested data across the first repair',
  async (t) => {
    const f = fixture(t);
    const authority = selectedAuthority();
    const first = {...ROW, address: 'first-observed'};
    const second = {node_id: 'catchup-second-owned-row', status: 'active', updated_at: 10,
      detail: {version: 'original'}};
    const rows = [first, second];
    const foreign = {node_id: 'catchup-injected-row', status: 'active', updated_at: 10};
    f.setAnswer(ownerAnswer({rows}));
    const apply = f.service.applyAuthoritativeCacheRepair;
    let mutated = false;
    f.service.applyAuthoritativeCacheRepair = function(...args) {
      if (!mutated) {
        mutated = true;
        second.node_id = 'catchup-retargeted-row';
        second.detail.version = 'changed-after-admission';
        rows.splice(1, 1, foreign);
      }
      return Reflect.apply(apply, this, args);
    };
    const summary = await f.run({readAuthority: authority});
    assert.equal(mutated, true, 'the real first repair crosses the mutation seam');
    assert.equal(summary.tablesHydrated, 1);
    assert.equal(summary.rowsApplied, 2);
    assert.equal(summary.rowsSwept, 1);
    assert.deepEqual(f.cache.get(TABLE, ROW.node_id), first);
    assert.deepEqual(f.cache.get(TABLE, 'catchup-second-owned-row'), {
      node_id: 'catchup-second-owned-row', status: 'active', updated_at: 10,
      detail: {version: 'original'},
    });
    assert.equal(f.cache.get(TABLE, 'catchup-retargeted-row'), undefined);
    assert.equal(f.cache.get(TABLE, foreign.node_id), undefined);
    assert.equal(f.cache.get(TABLE, UNSEEN_ROW.node_id), undefined);
    assert.equal(f.cache.getLastAuthoritativeObservedAtMs(TABLE), NOW);
    assert.equal(f.calls.repairs, 2);
    assert.equal(f.calls.sweeps, 1);
    assert.equal(f.calls.rpc.length, 1);
    assert.equal(f.calls.rpc[0][6].readAuthority, authority);
  });

for (const provider of ['different field', 'throws']) {
  test(`catchup uses its canonical captured keys when a second provider ${provider}`, async (t) => {
    const f = fixture(t);
    let consulted = 0;
    let failure;
    f.service.getPrimaryKeyField = () => {
      consulted += 1;
      if (provider === 'throws') throw new Error('second key provider consulted');
      return 'other_key';
    };
    try {
      await assertCompleteOwnerHealing(f, selectedAuthority());
    } catch (error) {
      failure = error;
    }
    assert.equal(f.calls.rpc.length, 1, 'the original owner actually supplies the canonical row');
    assert.equal(consulted, 0, 'repair and sweep cannot reinterpret the admitted key');
    assert.equal(failure, undefined);
  });
}

for (const dependency of ['tables', 'maxAttemptsPerTable', 'now', 'timeSource']) {
  test(`invalid selected catchup authority refuses before the ${dependency} dependency`,
    async (t) => {
      const f = fixture(t);
      const options = {...CATCHUP_OPTIONS, readAuthority: null};
      const target = dependency === 'timeSource' ? f.service : options;
      const original = Object.getOwnPropertyDescriptor(target, dependency);
      let consulted = 0;
      let failure;
      Object.defineProperty(target, dependency, {configurable: true, get() {
        consulted += 1;
        throw new Error('dependency accessed before selected-token admission');
      }});
      try {
        await f.service.hydrateCdcPropagatedTablesFromAuthority(options);
      } catch (error) {
        failure = error;
      } finally {
        if (original) Object.defineProperty(target, dependency, original);
        else delete target[dependency];
      }
      assert.equal(failure?.message, GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_AUTHORITY_TOKEN_REQUIRED);
      assert.equal(consulted, 0);
      assert.equal(f.calls.reads.length, 0);
      assert.equal(f.calls.rpc.length, 0);
      assertNoCompleteEffect(f);
      await assertCompleteOwnerHealing(f, selectedAuthority());
    });
}
