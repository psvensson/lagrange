import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {WebSocketServer} from 'ws';
import {AUTHORITATIVE_REPAIR_TRIGGER} from
  '../../../../src/admin/admin-authoritative-repair-policy.js';
import {
  NodeHandle,
  NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const TEST_HOST = '127.0.0.1';
const TEST_NODE_ID = 'node-1';
const TEST_CONTAINER_ID = 'container-1';
const TEST_CAPTURED_AT = 1;
const TEST_ADMIN_QUERY_TIMEOUT_MS = 4321;
const TEST_CACHE_DUMP_MESSAGE_TYPE = 'cache_dump';
const TEST_QUERY_RESULT_MESSAGE_TYPE = 'query_result';
const TEST_EMPTY_CACHE_DUMP = Object.freeze({});
const TEST_EMPTY_ROWS = Object.freeze([]);
const SNAPSHOT_OBSERVATION_STATE_FRESH = 'fresh';
const SNAPSHOT_OBSERVATION_STATE_STALE_USABLE = 'stale_usable';
const SNAPSHOT_OBSERVATION_CONTRACT_STATE_READY = 'ready';
const SNAPSHOT_OBSERVATION_CONTRACT_STATE_PENDING = 'pending';
const SNAPSHOT_OBSERVATION_NEXT_ACTION_PROCEED = 'proceed';
const SNAPSHOT_OBSERVATION_NEXT_ACTION_WAIT = 'wait';
const PUBLICATION_RECOVERY_GATE_STATE_READY = 'ready';

function buildControlSnapshotRow(forcedRepairQuery) {
  const coverageGapReasonCodes = forcedRepairQuery ?
    TEST_EMPTY_ROWS :
    [AUTHORITATIVE_REPAIR_TRIGGER.DISCOVERY_NODE_COVERAGE_GAP];
  return {
    nodeId: TEST_NODE_ID,
    capturedAt: TEST_CAPTURED_AT,
    nodes: [],
    snapshotObservation: {
      state: forcedRepairQuery ?
        SNAPSHOT_OBSERVATION_STATE_FRESH :
        SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
      contractState: forcedRepairQuery ?
        SNAPSHOT_OBSERVATION_CONTRACT_STATE_READY :
        SNAPSHOT_OBSERVATION_CONTRACT_STATE_PENDING,
      nextAction: forcedRepairQuery ?
        SNAPSHOT_OBSERVATION_NEXT_ACTION_PROCEED :
        SNAPSHOT_OBSERVATION_NEXT_ACTION_WAIT,
      reasonCodes: coverageGapReasonCodes,
    },
    adminObservation: {
      repair: {
        deferred: forcedRepairQuery !== true,
        triggerCodes: coverageGapReasonCodes,
      },
    },
    controlPlaneDiagnostics: {
      publicationConvergenceGate: {
        ready: true,
        state: PUBLICATION_RECOVERY_GATE_STATE_READY,
      },
    },
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

test('NodeHandle.getControlSnapshot escalates forced repair for stale ' +
  'coverage-gap observations', async () => {
  const server = new WebSocketServer({
    host: TEST_HOST,
    port: 0,
  });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const capturedQueries = [];
  server.on('connection', (socket) => {
    socket.send(JSON.stringify({
      type: TEST_CACHE_DUMP_MESSAGE_TYPE,
      data: TEST_EMPTY_CACHE_DUMP,
    }));
    socket.on('message', (data) => {
      const capturedQuery = JSON.parse(data.toString());
      capturedQueries.push(capturedQuery);
      const forcedRepairQuery =
        capturedQuery.sql === NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL;
      socket.send(JSON.stringify({
        type: TEST_QUERY_RESULT_MESSAGE_TYPE,
        queryId: capturedQuery.queryId,
        results: [buildControlSnapshotRow(forcedRepairQuery)],
        count: TEST_CAPTURED_AT,
      }));
    });
  });

  const node = new NodeHandle(
    TEST_NODE_ID,
    TEST_CONTAINER_ID,
    TEST_HOST,
    NODE_ROLES.SEED,
    {getContainerLogs: async () => ''},
    address.port,
    {adminQueryTimeoutMs: TEST_ADMIN_QUERY_TIMEOUT_MS},
  );

  try {
    await node.getControlSnapshot({forceRepair: true});
    assert.deepEqual(
      capturedQueries.map((query) => query.sql),
      [
        NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
        NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
      ],
    );
  } finally {
    node.closeQueryConnection();
    await closeServer(server);
  }
});
