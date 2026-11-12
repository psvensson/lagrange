// Actual CDC execution and the real PartitionService/SQLite read producer.
// Partition selection and RPC answers are controlled ports. The final case
// uses the existing controllable consensus fixture, not native Raft proof.
import Database from 'better-sqlite3';
import {afterEach, beforeEach, test} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {executeAuthoritativeOwnerRpcRead} from
  '../../src/cdc/cdc-integration-service-owner-rpc-read-execution.js';
import {buildControlPlaneReadAuthority} from
  '../../src/control-plane/control-plane-system-table-gateway-read-contracts.js';
import {CONTROL_PLANE_AUTHORITATIVE_READ_MODE as MODE,
  CONTROL_PLANE_READ_LEADER_MODE as LEADER, CONTROL_PLANE_READ_STRATEGY as STRATEGY,
  GATEWAY_ERROR_MSG} from
  '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {createLocalSystemTablePartitionServices, setupCDCTestLifecycle} from
  './cdc-integration-service-test-support.js';
import {startLeader, shutdownAll, TABLE as FIXTURE_TABLE} from
  '../test-helpers/participant-transaction-fixture.js';

setupCDCTestLifecycle(beforeEach, afterEach);

const TABLE = SYSTEM_TABLE_NAME.NODES;
const SQL = 'SELECT * FROM nodes';
const PARTITION_ID = INITIAL_PARTITION_IDS[TABLE];
const ROW = Object.freeze({node_id: 'read-producer-node', status: 'active'});
const WITNESS = Object.freeze({state: 'observed', partitionId: PARTITION_ID,
  role: 'leader', servingNodeId: 'read-producer-node', servingReplicaId: 'nodes-owner',
  observedAtMs: 1000, term: 3, appliedIndex: 8, commitIndex: 8});
const CONTRADICTION = 'contradictory_control_plane_authoritative_read_authority';
const TOKEN_REQUIRED = GATEWAY_ERROR_MSG.AUTHORITATIVE_READ_AUTHORITY_TOKEN_REQUIRED;
const WITNESS_FAILURE = 'authoritative_owner_leader_witness_required';

function localAuthority(leaderMode = LEADER.ANY) {
  return buildControlPlaneReadAuthority({authoritativeReadMode: MODE.OWNER_LOCAL_ONLY,
    leaderMode, localReadConsistency: 'local_leader'});
}

function reader(t, partitions) {
  const calls = {rpc: 0, sql: 0};
  const rpcRequests = [];
  const service = new CDCIntegrationService({nodeId: 'read-producer-node',
    partitionServicesProvider: () => partitions,
    sqlQueryEngine: {
      queryExecutor: {async executeOnPartition(...args) {
        calls.rpc += 1;
        rpcRequests.push(args);
        return {success: true, rows: [ROW], rowSetComplete: true,
          readAuthorityWitness: WITNESS};
      }},
      async executeQuery() {calls.sql += 1; return {success: true, rows: [ROW]};},
    },
  });
  service.initialize();
  t.teardown(() => service.markShuttingDown());
  return {service, calls, rpcRequests,
    read: (readAuthority) => service.executeAuthoritativeSystemTableRead(
    TABLE, SQL, [], {readAuthority})};
}

for (const alternate of ['executeQuery', 'database']) {
  test(`missing local read port cannot use the ${alternate} as an alternate`, async (t) => {
    let alternateReads = 0;
    const partitions = createLocalSystemTablePartitionServices(TABLE, {
      async executeQuery() {alternateReads += 1; return {success: true, rows: [ROW]};},
    });
    const partition = partitions.get(PARTITION_ID);
    if (alternate === 'database') {
      const db = new Database(':memory:');
      t.teardown(() => db.close());
      db.exec('CREATE TABLE nodes(node_id TEXT PRIMARY KEY, status TEXT)');
      db.prepare('INSERT INTO nodes VALUES (?, ?)').run(ROW.node_id, ROW.status);
      const prepare = db.prepare;
      db.prepare = function(...args) {
        alternateReads += 1;
        return Reflect.apply(prepare, db, args);
      };
      partition.db = db;
      partition.tableName = TABLE;
      delete partition.executeQuery;
    }
    const f = reader(t, partitions);
    const authority = localAuthority();
    const unavailable = await f.read(authority);
    t.equal(unavailable.success, false);
    t.same(unavailable.rows, []);
    t.equal(unavailable.rowSetComplete, false);
    t.equal(alternateReads, 0, 'a missing declared port does not authorize another execution path');
    partition.executeLocalQuery = async () => ({success: true, rows: [ROW], rowSetComplete: true,
      readAuthorityWitness: WITNESS});
    const healed = await f.read(authority);
    t.equal(healed.success, true);
    t.same(healed.rows, [ROW]);
    t.equal(alternateReads, 0);
    t.same(f.calls, {rpc: 0, sql: 0});
  });
}

test('local read evidence belongs to its answer and cannot be reconstructed after the read',
  async (t) => {
    let rebuilt = 0;
    let answer = {success: true, rows: [ROW], rowSetComplete: true};
    const partitions = createLocalSystemTablePartitionServices(TABLE, {
      async executeLocalQuery() {return answer;},
    });
    const partition = partitions.get(PARTITION_ID);
    partition.buildRemoteReadAuthorityWitness = () => {rebuilt += 1; return WITNESS;};
    const f = reader(t, partitions);
    const authority = localAuthority(LEADER.REQUIRED);
    const unwitnessed = await f.read(authority);
    t.equal(unwitnessed.success, false);
    t.equal(unwitnessed.authorityFailureReason, WITNESS_FAILURE);
    t.same(unwitnessed.rows, []);
    t.equal(rebuilt, 0, 'a second owner observation cannot certify the earlier read');
    answer = {success: true, rows: [ROW], rowSetComplete: true, readAuthorityWitness: WITNESS};
    const healed = await f.read(authority);
    t.equal(healed.success, true);
    t.same(healed.rows, [ROW]);
    t.same(healed.readAuthorityWitness, WITNESS);
    t.equal(rebuilt, 0);
    t.same(f.calls, {rpc: 0, sql: 0});
  });

const RPC_TOKEN = buildControlPlaneReadAuthority({authoritativeReadMode: MODE.OWNER_RPC_REQUIRED,
  leaderMode: LEADER.REQUIRED});
for (const invalid of [
  {name: 'null', token: null, message: TOKEN_REQUIRED},
  {name: 'mutable', token: {...RPC_TOKEN}, message: TOKEN_REQUIRED},
  {name: 'local', token: localAuthority(), code: CONTRADICTION},
  {name: 'cache', token: buildControlPlaneReadAuthority({strategy: STRATEGY.CACHE}),
    code: CONTRADICTION},
  {name: 'unknown mode', token: Object.freeze({...RPC_TOKEN,
    authoritativeReadMode: 'unknown-owner-mode'}),
  message: 'unsupported_control_plane_authoritative_read_mode'},
]) {
  test(`RPC execution kernel refuses ${invalid.name} selected authority before delivery`, async (t) => {
    const f = reader(t, new Map());
    const engine = f.service.sqlQueryEngine;
    let dependencyReads = 0;
    Object.defineProperty(f.service, 'sqlQueryEngine', {
      configurable: true,
      get() {dependencyReads += 1; return engine;},
    });
    await t.rejects(executeAuthoritativeOwnerRpcRead(f.service, TABLE, SQL, [],
      {readAuthority: invalid.token}, {}),
    invalid.code ? {code: invalid.code} : {message: invalid.message});
    t.equal(dependencyReads, 0, 'invalid authority is refused before dependency access');
    t.same(f.calls, {rpc: 0, sql: 0});
    const healed = await executeAuthoritativeOwnerRpcRead(f.service, TABLE, SQL, [],
      {readAuthority: RPC_TOKEN}, {});
    t.equal(healed.success, true);
    t.same(healed.rows, [ROW]);
    t.same(f.calls, {rpc: 1, sql: 0});
    t.ok(dependencyReads > 0, 'the valid request reaches the actual execution dependency');
    t.equal(f.rpcRequests[0][6].readAuthority, RPC_TOKEN);
  });
}

test('the actual PartitionService local SQLite read returns its serving witness with its rows',
  async (t) => {
    const {leader} = await startLeader({releaseAdmission: false});
    t.teardown(() => shutdownAll(leader));
    let witnesses = 0;
    const buildWitness = leader.buildRemoteReadAuthorityWitness;
    leader.buildRemoteReadAuthorityWitness = function(...args) {
      witnesses += 1;
      return Reflect.apply(buildWitness, this, args);
    };
    const result = await leader.executeLocalQuery(`SELECT * FROM ${FIXTURE_TABLE}`);
    const status = leader.raft.readStatus();
    t.equal(result.success, true);
    t.same(result.rows, []);
    t.equal(result.rowSetComplete, true);
    t.equal(result.readAuthorityWitness?.state, 'observed');
    t.equal(result.readAuthorityWitness?.partitionId, leader.partitionId);
    t.equal(result.readAuthorityWitness?.servingNodeId, leader.nodeId);
    t.equal(result.readAuthorityWitness?.servingReplicaId, leader.replicaId);
    t.equal(result.readAuthorityWitness?.role, 'leader');
    t.equal(result.readAuthorityWitness?.term, status.term);
    t.equal(result.readAuthorityWitness?.appliedIndex, status.appliedIndex);
    t.equal(result.readAuthorityWitness?.commitIndex, status.commitIndex);
    t.ok(Number.isFinite(result.readAuthorityWitness?.observedAtMs));
    t.equal(witnesses, 1, 'the producer captures one witness before returning the read result');
  });
