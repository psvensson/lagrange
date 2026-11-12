// Actual CDC local-owner execution with controlled partition answers. These
// controls prove lane and witness enforcement, not native leader acquisition.
import {afterEach, beforeEach, test} from '../../src/test-helpers/tap.js';
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

const NODE_ID = 'required-local-owner';
const TABLE = SYSTEM_TABLE_NAME.NODES;
const SQL = 'SELECT * FROM nodes';
const ROW = Object.freeze({node_id: NODE_ID, status: 'active'});
const CONTRADICTION = 'contradictory_control_plane_authoritative_read_authority';
const WITNESS_FAILURE = 'authoritative_owner_leader_witness_required';
const WITNESS = Object.freeze({state: 'observed', partitionId: INITIAL_PARTITION_IDS[TABLE],
  role: 'leader', servingNodeId: NODE_ID, servingReplicaId: 'local-nodes-owner',
  observedAtMs: 1000, term: 3, appliedIndex: 8, commitIndex: 8});

function fixture({leader = true} = {}) {
  const calls = {local: 0, rpc: 0, sql: 0};
  let answer = {success: true, rows: [ROW], rowSetComplete: true};
  const partitions = createLocalSystemTablePartitionServices(TABLE, {
    isLeader: leader,
    async executeQuery() {calls.local += 1; return answer;},
  });
  const service = new CDCIntegrationService({nodeId: NODE_ID,
    partitionServicesProvider: () => partitions,
    sqlQueryEngine: {
      queryExecutor: {async executeOnPartition() {
        calls.rpc += 1;
        return {success: true, rows: [ROW], rowSetComplete: true,
          readAuthorityWitness: WITNESS};
      }},
      async executeQuery() {calls.sql += 1; return {success: true, rows: [ROW]};},
    },
  });
  service.initialize();
  return {calls, setAnswer(value) {answer = value;},
    read: (readAuthority) => service.executeAuthoritativeSystemTableRead(
      TABLE, SQL, [], {readAuthority})};
}

for (const localReadConsistency of ['any_replica', null]) {
  test(`required local leader refuses ${String(localReadConsistency)} consistency before reads`,
    async (t) => {
      const authority = Object.freeze({...buildControlPlaneReadAuthority({
        authoritativeReadMode: MODE.OWNER_RPC_REQUIRED, leaderMode: LEADER.REQUIRED,
      }), authoritativeReadMode: MODE.OWNER_LOCAL_ONLY, localReadConsistency});
      const f = fixture({leader: false});
      const result = await f.read(authority);
      t.equal(result.success, false);
      t.equal(result.errorCode, CONTRADICTION);
      t.same(result.rows, []);
      t.same(f.calls, {local: 0, rpc: 0, sql: 0});
      t.throws(() => buildControlPlaneReadAuthority({
        authoritativeReadMode: MODE.OWNER_LOCAL_ONLY, leaderMode: LEADER.REQUIRED,
        localReadConsistency,
      }), {code: CONTRADICTION});
    });
}

for (const witness of [null, {...WITNESS, role: 'follower'},
  {...WITNESS, partitionId: 'foreign-partition'}]) {
  test(`required local leader refuses ${witness?.role || 'absent'} ${
    witness?.partitionId || 'witness'} then accepts the same owner`, async (t) => {
    const f = fixture();
    const authority = buildControlPlaneReadAuthority({
      authoritativeReadMode: MODE.OWNER_LOCAL_ONLY, leaderMode: LEADER.REQUIRED,
      localReadConsistency: 'local_leader',
    });
    f.setAnswer({success: true, rows: [ROW], rowSetComplete: true,
      readAuthorityWitness: witness});
    const refused = await f.read(authority);
    t.equal(refused.success, false);
    t.equal(refused.authorityFailureReason, WITNESS_FAILURE);
    t.same(refused.rows, []);
    t.equal(refused.rowSetComplete, false);
    t.same(f.calls, {local: 1, rpc: 0, sql: 0});
    f.setAnswer({success: true, rows: [ROW], rowSetComplete: true,
      readAuthorityWitness: WITNESS});
    const healed = await f.read(authority);
    t.equal(healed.success, true);
    t.same(healed.rows, [ROW]);
    t.same(healed.readAuthorityWitness, WITNESS);
    t.same(f.calls, {local: 2, rpc: 0, sql: 0});
  });
}

test('declared local any-replica authority still permits a follower read', async (t) => {
  const f = fixture({leader: false});
  const authority = buildControlPlaneReadAuthority({
    authoritativeReadMode: MODE.OWNER_LOCAL_ONLY, leaderMode: LEADER.ANY,
    localReadConsistency: 'any_replica',
  });
  const result = await f.read(authority);
  t.equal(result.success, true);
  t.same(result.rows, [ROW]);
  t.same(f.calls, {local: 1, rpc: 0, sql: 0});
});
