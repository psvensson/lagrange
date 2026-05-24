import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert';
import {WebSocketServer} from 'ws';
import {AUTHORITATIVE_REPAIR_TRIGGER} from
  '../../../../src/admin/admin-authoritative-repair-policy.js';
import {
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
} from '../../../../src/control-plane/owner-contract-outcome.js';
import {
  NodeHandle,
  NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const SNAPSHOT_OBSERVATION_STATE_STALE_USABLE = 'stale_usable';
const SNAPSHOT_OBSERVATION_CONTRACT_STATE_PENDING =
  OWNER_CONTRACT_STATE.PENDING;
const SNAPSHOT_OBSERVATION_NEXT_ACTION_WAIT = OWNER_CONTRACT_NEXT_ACTION.WAIT;
const SNAPSHOT_REFRESH_REPAIR_TRIGGER_CODES = Object.freeze([
  AUTHORITATIVE_REPAIR_TRIGGER.CACHE_STALE_WATERMARK,
  AUTHORITATIVE_REPAIR_TRIGGER.STALE_REPLICA_OPERATIONS_IN_FLIGHT,
]);
const PUBLICATION_RECOVERY_GATE_STATE_READY = 'ready';
const PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_PENDING =
  'priority_spread_pending';
const SNAPSHOT_REPAIR_DEFERRED = true;
const TEST_ADMIN_HOST = '127.0.0.1';
const TEST_ADMIN_PORT_ANY = 0;
const TEST_CACHE_DUMP_MESSAGE_TYPE = 'cache_dump';
const TEST_QUERY_RESULT_MESSAGE_TYPE = 'query_result';
const TEST_EMPTY_CACHE_DUMP = Object.freeze({});
const TEST_NODE_ID = 'node-1';
const TEST_CONTAINER_ID = 'container-1';
const TEST_CAPTURED_AT = 1;
const TEST_ADMIN_QUERY_TIMEOUT_MS = 4321;
const TEST_FORCED_REPAIR_FAILURE =
  'Distributed operation failed due to participant failures';
const TEST_FORCED_REPAIR_ERROR_CODE = 'DISTRIBUTED_PARTICIPANT_FAILURE';
const TEST_LOCAL_STALE_PUBLICATION_GATE_SNAPSHOT_ROW = Object.freeze({
  nodeId: TEST_NODE_ID,
  capturedAt: TEST_CAPTURED_AT,
  nodes: Object.freeze([]),
  snapshotObservation: Object.freeze({
    state: SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
    contractState: SNAPSHOT_OBSERVATION_CONTRACT_STATE_PENDING,
  }),
  controlPlaneDiagnostics: Object.freeze({
    publicationConvergenceGate: Object.freeze({
      ready: false,
      state: PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_PENDING,
    }),
  }),
});

export function registerClusterNodeHandleControlSnapshotTests() {
  test('Unit: NodeHandle.getControlSnapshot uses injected default admin timeout',
    async () => {
      const server = new WebSocketServer({
        host: '127.0.0.1',
        port: 0,
      });
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });

      const address = server.address();
      assert.ok(address && typeof address === 'object',
        'server should expose listen address');
      const adminApiPort = address.port;

      let capturedQuery = null;
      server.on('connection', (socket) => {
        socket.send(JSON.stringify({
          type: 'cache_dump',
          data: {},
        }));
        socket.once('message', (data) => {
          capturedQuery = JSON.parse(data.toString());
          socket.send(JSON.stringify({
            type: 'query_result',
            queryId: capturedQuery.queryId,
            results: [{
              nodeId: 'node-1',
              capturedAt: 1,
              nodes: [],
            }],
            count: 1,
          }));
        });
      });

      const node = new NodeHandle(
        'node-1',
        'container-1',
        '127.0.0.1',
        NODE_ROLES.SEED,
        {getContainerLogs: async () => ''},
        adminApiPort,
        {adminQueryTimeoutMs: 4321},
      );

      try {
        await node.getControlSnapshot();
        assert.strictEqual(
          capturedQuery.sql,
          NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
          'getControlSnapshot should query the canonical control snapshot SQL',
        );
        assert.strictEqual(
          capturedQuery.timeoutMs,
          4321,
          'getControlSnapshot should inherit the injected default admin timeout',
        );
      } finally {
        node.closeQueryConnection();
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
    });

  test('Unit: NodeHandle.getControlSnapshot reuses explicit stale observations ' +
    'before escalating to forced repair', async () => {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
    });
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object',
      'server should expose listen address');
    const adminApiPort = address.port;

    const capturedQueries = [];
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({
        type: 'cache_dump',
        data: {},
      }));
      socket.on('message', (data) => {
        const capturedQuery = JSON.parse(data.toString());
        capturedQueries.push(capturedQuery);
        socket.send(JSON.stringify({
          type: 'query_result',
          queryId: capturedQuery.queryId,
          results: [{
            nodeId: 'node-1',
            capturedAt: 1,
            nodes: [],
            snapshotObservation: {
              state: SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
              contractState: SNAPSHOT_OBSERVATION_CONTRACT_STATE_PENDING,
            },
          }],
          count: 1,
        }));
      });
    });

    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.SEED,
      {getContainerLogs: async () => ''},
      adminApiPort,
      {adminQueryTimeoutMs: 4321},
    );

    try {
      await node.getControlSnapshot({forceRepair: true});
      assert.deepEqual(
        capturedQueries.map((query) => query.sql),
        [NODE_CLIENT_CONTROL_SNAPSHOT_SQL],
        'forced repair should stay on the local control snapshot when the response already carries an explicit non-failed observation',
      );
    } finally {
      node.closeQueryConnection();
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
  });

  test('Unit: NodeHandle.getControlSnapshot escalates forced repair for ' +
    'stale refresh debt', async () => {
    const server = new WebSocketServer({
      host: TEST_ADMIN_HOST,
      port: TEST_ADMIN_PORT_ANY,
    });
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object',
      'server should expose listen address');
    const adminApiPort = address.port;

    const capturedQueries = [];
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({
        type: TEST_CACHE_DUMP_MESSAGE_TYPE,
        data: TEST_EMPTY_CACHE_DUMP,
      }));
      socket.on('message', (data) => {
        const capturedQuery = JSON.parse(data.toString());
        capturedQueries.push(capturedQuery);
        socket.send(JSON.stringify({
          type: TEST_QUERY_RESULT_MESSAGE_TYPE,
          queryId: capturedQuery.queryId,
          results: [{
            nodeId: TEST_NODE_ID,
            capturedAt: TEST_CAPTURED_AT,
            nodes: [],
            snapshotObservation: {
              state: SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
              contractState: SNAPSHOT_OBSERVATION_CONTRACT_STATE_PENDING,
              nextAction: SNAPSHOT_OBSERVATION_NEXT_ACTION_WAIT,
              reasonCodes: SNAPSHOT_REFRESH_REPAIR_TRIGGER_CODES,
            },
            adminObservation: {
              repair: {
                deferred: SNAPSHOT_REPAIR_DEFERRED,
                triggerCodes: SNAPSHOT_REFRESH_REPAIR_TRIGGER_CODES,
              },
            },
          }],
          count: TEST_CAPTURED_AT,
        }));
      });
    });

    const node = new NodeHandle(
      TEST_NODE_ID,
      TEST_CONTAINER_ID,
      TEST_ADMIN_HOST,
      NODE_ROLES.SEED,
      {getContainerLogs: async () => ''},
      adminApiPort,
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
        'forced repair should escalate when repair-deferred local snapshot ' +
          'evidence carries refresh debt',
      );
    } finally {
      node.closeQueryConnection();
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
  });

  test('Unit: NodeHandle.getControlSnapshot escalates forced repair for a ' +
    'stale publication recovery gate', async () => {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
    });
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object',
      'server should expose listen address');
    const adminApiPort = address.port;

    const capturedQueries = [];
    server.on('connection', (socket) => {
      socket.send(JSON.stringify({
        type: 'cache_dump',
        data: {},
      }));
      socket.on('message', (data) => {
        const capturedQuery = JSON.parse(data.toString());
        capturedQueries.push(capturedQuery);
        const forcedRepairQuery =
          capturedQuery.sql === NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL;
        socket.send(JSON.stringify({
          type: 'query_result',
          queryId: capturedQuery.queryId,
          results: [{
            nodeId: 'node-1',
            capturedAt: 1,
            nodes: [],
            snapshotObservation: {
              state: SNAPSHOT_OBSERVATION_STATE_STALE_USABLE,
              contractState: SNAPSHOT_OBSERVATION_CONTRACT_STATE_PENDING,
            },
            controlPlaneDiagnostics: {
              publicationConvergenceGate: {
                ready: forcedRepairQuery,
                state: forcedRepairQuery ?
                  PUBLICATION_RECOVERY_GATE_STATE_READY :
                  PUBLICATION_RECOVERY_GATE_STATE_PRIORITY_SPREAD_PENDING,
              },
            },
          }],
          count: 1,
        }));
      });
    });

    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.SEED,
      {getContainerLogs: async () => ''},
      adminApiPort,
      {adminQueryTimeoutMs: 4321},
    );

    try {
      await node.getControlSnapshot({forceRepair: true});
      assert.deepEqual(
        capturedQueries.map((query) => query.sql),
        [
          NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
          NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
        ],
        'forced repair should escalate when the local publication recovery ' +
          'gate is not ready',
      );
    } finally {
      node.closeQueryConnection();
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
  });

  test('Unit: NodeHandle.getControlSnapshot returns the local snapshot when ' +
    'forced repair fails after escalation', async () => {
    const server = new WebSocketServer({
      host: TEST_ADMIN_HOST,
      port: TEST_ADMIN_PORT_ANY,
    });
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object',
      'server should expose listen address');
    const adminApiPort = address.port;

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
        if (forcedRepairQuery) {
          socket.send(JSON.stringify({
            type: TEST_QUERY_RESULT_MESSAGE_TYPE,
            queryId: capturedQuery.queryId,
            error: TEST_FORCED_REPAIR_FAILURE,
            errorCode: TEST_FORCED_REPAIR_ERROR_CODE,
          }));
          return;
        }
        socket.send(JSON.stringify({
          type: TEST_QUERY_RESULT_MESSAGE_TYPE,
          queryId: capturedQuery.queryId,
          results: [TEST_LOCAL_STALE_PUBLICATION_GATE_SNAPSHOT_ROW],
          count: TEST_CAPTURED_AT,
        }));
      });
    });

    const node = new NodeHandle(
      TEST_NODE_ID,
      TEST_CONTAINER_ID,
      TEST_ADMIN_HOST,
      NODE_ROLES.SEED,
      {getContainerLogs: async () => ''},
      adminApiPort,
      {adminQueryTimeoutMs: TEST_ADMIN_QUERY_TIMEOUT_MS},
    );

    try {
      const result = await node.getControlSnapshot({forceRepair: true});
      assert.deepEqual(
        capturedQueries.map((query) => query.sql),
        [
          NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
          NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL,
        ],
        'forced repair should still be attempted before returning the local ' +
          'snapshot fallback',
      );
      assert.deepStrictEqual(
        result.rows,
        [TEST_LOCAL_STALE_PUBLICATION_GATE_SNAPSHOT_ROW],
        'local snapshot should be returned when forced repair fails after a ' +
          'successful local query',
      );
    } finally {
      node.closeQueryConnection();
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
  });

  test('Unit: NodeHandle.getControlSnapshot honors authoritative repair mode',
    async () => {
      const SERVER_HOST = '127.0.0.1';
      const TEST_NODE_ID = 'node-1';
      const TEST_CONTAINER_ID = 'container-1';
      const TEST_CAPTURED_AT = 1;
      const TEST_TIMEOUT_MS = 4321;
      const server = new WebSocketServer({
        host: SERVER_HOST,
        port: 0,
      });
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });

      const address = server.address();
      assert.ok(address && typeof address === 'object',
        'server should expose listen address');
      const adminApiPort = address.port;

      const capturedQueries = [];
      server.on('connection', (socket) => {
        socket.send(JSON.stringify({
          type: 'cache_dump',
          data: {},
        }));
        socket.on('message', (data) => {
          const capturedQuery = JSON.parse(data.toString());
          capturedQueries.push(capturedQuery);
          socket.send(JSON.stringify({
            type: 'query_result',
            queryId: capturedQuery.queryId,
            results: [{
              nodeId: TEST_NODE_ID,
              capturedAt: TEST_CAPTURED_AT,
              nodes: [],
            }],
            count: 1,
          }));
        });
      });

      const node = new NodeHandle(
        TEST_NODE_ID,
        TEST_CONTAINER_ID,
        SERVER_HOST,
        NODE_ROLES.SEED,
        {getContainerLogs: async () => ''},
        adminApiPort,
        {adminQueryTimeoutMs: TEST_TIMEOUT_MS},
      );

      try {
        await node.getControlSnapshot({
          forceRepair: true,
          forceAuthoritativeRepair: true,
        });
        assert.deepEqual(
          capturedQueries.map((query) => query.sql),
          [NODE_CLIENT_CONTROL_SNAPSHOT_FORCE_REPAIR_SQL],
          'authoritative repair mode should query the forced snapshot directly',
        );
      } finally {
        node.closeQueryConnection();
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
    });
}
