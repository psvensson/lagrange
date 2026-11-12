// Actual CDC read ingress and its local/RPC normalizers. The controlled owner
// supplies row-set evidence and a serving-leader receipt; this isolates whether
// either normalizer can manufacture completeness from contradictory evidence.
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

const TABLE = SYSTEM_TABLE_NAME.NODES;
const SQL = 'SELECT * FROM nodes';
const NODE_ID = 'completeness-owner';
const ROW = Object.freeze({node_id: NODE_ID, status: 'active'});
const WITNESS = Object.freeze({state: 'observed', partitionId: INITIAL_PARTITION_IDS[TABLE],
  role: 'leader', servingNodeId: NODE_ID, servingReplicaId: 'nodes-owner',
  observedAtMs: 1000, term: 3, appliedIndex: 8, commitIndex: 8});

function completeAnswer(overrides = {}) {
  return {success: true, rows: [ROW], rowSetComplete: true,
    readAuthorityWitness: WITNESS, ...overrides};
}

function fixture(mode, initialAnswer) {
  let answer = initialAnswer;
  const calls = {local: 0, rpc: 0, sql: 0};
  const partitions = mode === MODE.OWNER_LOCAL_ONLY ?
    createLocalSystemTablePartitionServices(TABLE, {
      async executeQuery() {
        calls.local += 1;
        return answer;
      },
    }) : new Map();
  const service = new CDCIntegrationService({nodeId: NODE_ID,
    partitionServicesProvider: () => partitions,
    sqlQueryEngine: {
      queryExecutor: {async executeOnPartition() {
        calls.rpc += 1;
        return answer;
      }},
      async executeQuery() {
        calls.sql += 1;
        return completeAnswer();
      },
    },
  });
  service.initialize();
  service.setMessageRouter({
    getQueryDataPlaneTransportReadiness: () => ({ready: true, state: 'ready'}),
  });
  const readAuthority = buildControlPlaneReadAuthority({authoritativeReadMode: mode,
    localReadConsistency: 'local_leader', leaderMode: LEADER.REQUIRED});
  return {service, calls, setAnswer(value) {answer = value;},
    read: () => service.executeAuthoritativeSystemTableRead(TABLE, SQL, [], {readAuthority})};
}

const INCOMPLETE = [
  {name: 'missing complete declaration', evidence: {rowSetComplete: undefined}},
  {name: 'explicit incomplete declaration', evidence: {rowSetComplete: false}},
  {name: 'partial answer', evidence: {partial: true}},
  ...['failedPartitions', 'partitionErrors', 'participantFailures'].flatMap((field) => [
    {name: `${field} collection`, evidence: {[field]: ['unanswered-owner']}},
    {name: `${field} count`, evidence: {[field]: 1}},
  ]),
];

for (const mode of [MODE.OWNER_LOCAL_ONLY, MODE.OWNER_RPC_REQUIRED]) {
  for (const control of INCOMPLETE) {
    test(`${mode} cannot certify completeness with ${control.name}`, async (t) => {
      const f = fixture(mode, completeAnswer(control.evidence));
      try {
        const unavailable = await f.read();
        t.equal(unavailable.rowSetComplete, false,
          'a leader receipt does not erase missing or contradictory row-set evidence');
        t.equal(f.calls.local, mode === MODE.OWNER_LOCAL_ONLY ? 1 : 0);
        t.equal(f.calls.rpc, mode === MODE.OWNER_RPC_REQUIRED ? 1 : 0);
        t.equal(f.calls.sql, 0, 'a different executor cannot certify this owner answer');
        f.setAnswer(completeAnswer({failedPartitions: [], partitionErrors: 0,
          participantFailures: []}));
        const recovered = await f.read();
        t.equal(recovered.success, true, 'the same owner can later answer completely');
        t.equal(recovered.rowSetComplete, true);
        t.same(recovered.rows, [ROW]);
        t.equal(f.calls.local, mode === MODE.OWNER_LOCAL_ONLY ? 2 : 0);
        t.equal(f.calls.rpc, mode === MODE.OWNER_RPC_REQUIRED ? 2 : 0);
        t.equal(f.calls.sql, 0);
      } finally {
        f.service.markShuttingDown();
      }
    });
  }
}
