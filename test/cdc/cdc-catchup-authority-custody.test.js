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
