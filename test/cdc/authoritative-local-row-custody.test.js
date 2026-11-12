// Actual CDC local read flow with declared partition answers. These controls
// exercise data ownership and complete-read refusal, not native Raft serving.
import assert from 'node:assert/strict';
import {afterEach, beforeEach, test} from 'node:test';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {createLocalSystemTablePartitionServices, setupCDCTestLifecycle} from
  './cdc-integration-service-test-support.js';

setupCDCTestLifecycle(beforeEach, afterEach);

const TABLE = SYSTEM_TABLE_NAME.NODES;
const PARTITION_ID = INITIAL_PARTITION_IDS[TABLE];
const ROW = Object.freeze({node_id: 'local-captured-node', status: 'active', updated_at: 10});
const WITNESS = Object.freeze({state: 'observed', partitionId: PARTITION_ID,
  role: 'leader', servingNodeId: ROW.node_id, servingReplicaId: 'local-captured-r1',
  observedAtMs: 1000, term: 3, appliedIndex: 8, commitIndex: 8});
const AUTHORITY = buildControlPlaneReadAuthority({
  authoritativeReadMode: MODE.OWNER_LOCAL_ONLY, leaderMode: LEADER.REQUIRED,
  localReadConsistency: 'local_leader',
});

function reader(t) {
  let rows = [ROW];
  const calls = {local: 0, rpc: 0, sql: 0};
  const partitions = createLocalSystemTablePartitionServices(TABLE, {
    async executeLocalQuery() {
      calls.local += 1;
      return {success: true, rows, rowSetComplete: true, readAuthorityWitness: WITNESS};
    },
  });
  const service = new CDCIntegrationService({nodeId: ROW.node_id,
    partitionServicesProvider: () => partitions,
    sqlQueryEngine: {
      queryExecutor: {async executeOnPartition() {calls.rpc += 1; return null;}},
      async executeQuery() {calls.sql += 1; return null;},
    },
  });
  service.initialize();
  t.after(() => service.markShuttingDown());
  return {service, calls, partitions, setRows(value) {rows = value;},
    read: () => service.executeAuthoritativeSystemTableRead(
      TABLE, 'SELECT * FROM nodes', [], {readAuthority: AUTHORITY}),
  };
}

const CARRIERS = [
  {name: 'alias-only key', create: () => [{id: ROW.node_id, status: 'active'}]},
  {name: 'blank canonical key', create: () => [{...ROW, node_id: ' \t '}]},
  {name: 'non-string canonical key', create: () => [{...ROW, node_id: 17}]},
  {name: 'duplicate canonical keys', create: () => [{...ROW}, {...ROW}]},
  {name: 'sparse membership', create() {const rows = [ROW]; rows.length = 2; return rows;}},
  {name: 'own iterator getter', create(calls) {
    const rows = [ROW];
    Object.defineProperty(rows, Symbol.iterator, {get() {
      calls.count += 1;
      return function* () {yield {...ROW, node_id: 'iterator-injected-node'};};
    }});
    return rows;
  }},
  {name: 'index accessor', create(calls) {
    const rows = [];
    Object.defineProperty(rows, 0, {enumerable: true, get() {calls.count += 1; return ROW;}});
    return rows;
  }},
  {name: 'array proxy', create(calls) {
    return new Proxy([ROW], {get(target, key, receiver) {
      calls.count += 1;
      return Reflect.get(target, key, receiver);
    }});
  }},
  {name: 'canonical-key accessor', create(calls) {
    const row = {...ROW};
    Object.defineProperty(row, 'node_id', {enumerable: true,
      get() {calls.count += 1; return ROW.node_id;}});
    return [row];
  }},
  {name: 'row proxy', create(calls) {
    return [new Proxy({...ROW}, {get(target, key, receiver) {
      calls.count += 1;
      return Reflect.get(target, key, receiver);
    }})];
  }},
  {name: 'inherited canonical key', create() {
    return [Object.assign(Object.create({node_id: ROW.node_id}), {status: 'active'})];
  }},
  {name: 'row serialization hooks at equal-version merge', create(calls) {
    return [
      {...ROW, toJSON() {calls.count += 1; return {...ROW, detail: 'first'};}},
      {...ROW, toJSON() {calls.count += 1; return {...ROW, detail: 'second-longer'};}},
    ];
  }},
];

for (const carrier of CARRIERS) {
  test(`local owner refuses ${carrier.name} without fabricated rows or absence; same owner heals`,
    async (t) => {
      const f = reader(t);
      const callbacks = {count: 0};
      f.setRows(carrier.create(callbacks));
      let refused;
      let failure;
      try {refused = await f.read();} catch (error) {failure = error;}
      assert.equal(f.calls.local, 1, 'the original local owner actually returned the carrier');
      assert.equal(callbacks.count, 0, 'data admission cannot invoke caller callbacks');
      assert.equal(failure, undefined, 'malformed data returns the typed unavailable result');
      assert.equal(refused.success, false);
      assert.equal(refused.error, 'authoritative_row_source_unavailable');
      assert.deepEqual(refused.rows, []);
      assert.equal(refused.rowSetComplete, false);
      assert.equal(refused.authoritativeObservation, null);
      assert.deepEqual(f.calls, {local: 1, rpc: 0, sql: 0});
      f.setRows([ROW]);
      const healed = await f.read();
      assert.equal(healed.success, true);
      assert.deepEqual(healed.rows, [ROW]);
      assert.equal(healed.rowSetComplete, true);
      assert.deepEqual(healed.readAuthorityWitness, WITNESS);
      assert.deepEqual(f.calls, {local: 2, rpc: 0, sql: 0});
      assert.equal(callbacks.count, 0);
    });
}

test('local owner accepts ordinary and null-prototype canonical data without borrowing it', async (t) => {
  const f = reader(t);
  const plain = {...ROW, detail: {version: 'original', values: [1, null, true]}};
  const nullPrototype = Object.assign(Object.create(null), ROW, {node_id: 'null-prototype-node'});
  const rows = [plain, nullPrototype];
  f.setRows(rows);
  const result = await f.read();
  assert.equal(result.success, true);
  assert.equal(result.rowSetComplete, true);
  plain.detail.version = 'caller-mutated';
  plain.detail.values[0] = 9;
  nullPrototype.node_id = 'caller-retargeted';
  rows.length = 0;
  assert.deepEqual(result.rows, [
    {...ROW, detail: {version: 'original', values: [1, null, true]}},
    {...ROW, node_id: 'null-prototype-node'},
  ]);
  assert.deepEqual(f.calls, {local: 1, rpc: 0, sql: 0});
});

test('local owner captures the first answer before awaiting another partition read', async (t) => {
  const f = reader(t);
  const original = {...ROW, detail: {version: 'first-observed'}};
  const rows = [original];
  f.setRows(rows);
  const secondRow = {...ROW, node_id: 'second-local-node'};
  let secondReads = 0;
  const firstPartition = f.partitions.get(PARTITION_ID);
  f.partitions.set('second-local-replica', {...firstPartition, replicaId: 'local-captured-r2',
    async executeLocalQuery() {
      secondReads += 1;
      original.node_id = 'retargeted-after-first-answer';
      original.detail.version = 'changed-during-next-read';
      rows.splice(0, 1, {...ROW, node_id: 'injected-after-first-answer'});
      return {success: true, rows: [secondRow], rowSetComplete: true,
        readAuthorityWitness: {...WITNESS, servingReplicaId: 'local-captured-r2'}};
    },
  });
  const result = await f.read();
  assert.equal(f.calls.local, 1);
  assert.equal(secondReads, 1, 'the second real read crosses the caller-mutation seam');
  assert.equal(result.success, true);
  assert.deepEqual(result.rows, [{...ROW, detail: {version: 'first-observed'}}, secondRow]);
  assert.deepEqual(f.calls, {local: 1, rpc: 0, sql: 0});
});

for (const provider of ['different field', 'throws']) {
  test(`local owner keeps canonical keys when a second key provider ${provider}`, async (t) => {
    const f = reader(t);
    let consulted = 0;
    f.service.getPrimaryKeyField = () => {
      consulted += 1;
      if (provider === 'throws') throw new Error('second key provider consulted');
      return 'different_key';
    };
    let result;
    let failure;
    try {result = await f.read();} catch (error) {failure = error;}
    assert.equal(f.calls.local, 1);
    assert.equal(consulted, 0, 'the captured canonical key cannot be reinterpreted');
    assert.equal(failure, undefined);
    assert.equal(result.success, true);
    assert.deepEqual(result.rows, [ROW]);
    assert.equal(result.rowSetComplete, true);
    assert.deepEqual(f.calls, {local: 1, rpc: 0, sql: 0});
  });
}
