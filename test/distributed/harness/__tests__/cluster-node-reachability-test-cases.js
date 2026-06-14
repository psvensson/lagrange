import {test} from '../../../../src/test-helpers/tap.js';
import http from 'node:http';
import assert from 'node:assert';
import {
  NodeHandle,
  NODE_ROLES,
} from './cluster-test-helpers.js';

const LARGE_RESTART_READINESS_TIMEOUT_MS = 120000;
const REACHABILITY_HTTP_STAGE_TIMEOUT_CAP_MS = 1000;
const RESTART_RECOVERY_DIAGNOSTIC_TEST_PROJECTION_BLOCKER =
  'control_snapshot_authority_unavailable';

test('Unit: NodeHandle.isReachable checks bootstrap health endpoint', async () => {
  const node = new NodeHandle(
    'node-1',
    'container-1',
    '127.0.0.1',
    NODE_ROLES.SEED,
    {getContainerLogs: async () => ''},
  );

  const originalGet = http.get;
  const calledUrls = [];
  http.get = (url, _options, callback) => {
    calledUrls.push(String(url));
    const req = {
      on: () => req,
      destroy: () => {},
    };
    process.nextTick(() => {
      callback({
        statusCode: String(url).endsWith('/health') ? 200 : 404,
        resume: () => {},
      });
    });
    return req;
  };

  try {
    const reachable = await node.isReachable();
    assert.strictEqual(reachable, true, 'health endpoint should be reachable');
    assert.ok(calledUrls[0].endsWith('/health'), 'should probe /health endpoint');
  } finally {
    http.get = originalGet;
  }
});

test('Unit: NodeHandle.isReachable uses admin health when bootstrap health is unavailable',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQuery = node.query;
    const calledUrls = [];
    let queryCalled = false;
    http.get = (url, _options, callback) => {
      calledUrls.push(String(url));
      const req = {
        on: (event, handler) => {
          if (event === 'error' && String(url).includes(':8080/health')) {
            process.nextTick(() => handler(new Error('connect ECONNREFUSED')));
          }
          return req;
        },
        destroy: () => {},
      };
      if (String(url).includes(':8080/bootstrap/ready')) {
        process.nextTick(() => {
          callback({
            statusCode: 503,
            resume: () => {},
          });
        });
      }
      if (String(url).includes(':8081/health')) {
        process.nextTick(() => {
          callback({
            statusCode: 200,
            resume: () => {},
          });
        });
      }
      return req;
    };
    node.query = async () => {
      queryCalled = true;
      throw new Error('query probe should not be used');
    };

    try {
      const reachable = await node.isReachable();
      assert.strictEqual(reachable, true, 'admin health probe should mark node reachable');
      assert.strictEqual(queryCalled, false, 'should not issue query fallback');
      assert.ok(calledUrls.some((url) => url.includes(':8080/health')),
        'should probe bootstrap health endpoint first');
      assert.ok(calledUrls.some((url) => url.includes(':8081/health')),
        'should probe admin health endpoint');
    } finally {
      http.get = originalGet;
      node.query = originalQuery;
    }
  });

test('Unit: NodeHandle.isReachable falls back to admin query when HTTP probes are unavailable',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    let queryProbeCount = 0;
    const calledUrls = [];
    const originalQueryWithTimeout = node.queryWithTimeout;
    const originalGetAdminSocket = node._getAdminSocket;
    http.get = (url, _options, _callback) => {
      calledUrls.push(String(url));
      const req = {
        on: (event, handler) => {
          if (event === 'error') {
            process.nextTick(() => handler(new Error('connect ECONNREFUSED')));
          }
          return req;
        },
        destroy: () => {},
      };
      return req;
    };
    node.queryWithTimeout = async (sql) => {
      if (sql === 'SELECT node_id FROM nodes LIMIT 1') {
        queryProbeCount += 1;
      }
      return {rows: [{ok: 1}]};
    };
    node._getAdminSocket = async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:8081');
    };

    try {
      const reachable = await node.isReachable();
      assert.strictEqual(reachable, true,
        'admin query probe should mark node reachable');
      assert.strictEqual(queryProbeCount, 1, 'should issue exactly one admin probe');
      assert.strictEqual(calledUrls.length, 3,
        'should attempt bootstrap health, bootstrap readiness, and admin HTTP probes');
    } finally {
      http.get = originalGet;
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  });

test(
  'Unit: NodeHandle.getReachabilityDiagnostics checks admin readiness even when ' +
    'bootstrap health is reachable',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQueryWithTimeout = node.queryWithTimeout;
    const originalGetAdminSocket = node._getAdminSocket;
    const calledUrls = [];
    let sqlProbeCount = 0;
    http.get = (url, _options, callback) => {
      calledUrls.push(String(url));
      const req = {
        on: () => req,
        destroy: () => {},
      };
      process.nextTick(() => {
        callback({
          statusCode: String(url).includes(':8080/health') ? 200 : 503,
          resume: () => {},
        });
      });
      return req;
    };
    node._getAdminSocket = async () => {
      throw new Error('admin ws unavailable');
    };
    node.queryWithTimeout = async (sql) => {
      if (sql === 'SELECT node_id FROM nodes LIMIT 1') {
        sqlProbeCount += 1;
      }
      return {rows: [{ok: 1}]};
    };

    try {
      const diagnostics = await node.getReachabilityDiagnostics();
      assert.strictEqual(
        diagnostics.bootstrapHealth.ok,
        true,
        'bootstrap health probe should report reachable',
      );
      assert.strictEqual(
        diagnostics.adminHealth.ok,
        false,
        'admin health probe should still execute after bootstrap health success',
      );
      assert.strictEqual(
        diagnostics.sqlProbe.ok,
        true,
        'sql readiness probe should execute as admin fallback',
      );
      assert.strictEqual(
        diagnostics.adminReady,
        true,
        'admin readiness should be true when sql fallback succeeds',
      );
      assert.strictEqual(
        diagnostics.reachableBy,
        'sql_probe',
        'reachability source should reflect admin-readiness probe path',
      );
      assert.strictEqual(
        sqlProbeCount,
        1,
        'sql readiness fallback should run exactly once',
      );
      assert.strictEqual(
        calledUrls.length,
        3,
        'diagnostics should execute bootstrap health, bootstrap readiness, and admin HTTP probes',
      );
    } finally {
      http.get = originalGet;
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  },
);

test(
  'Unit: NodeHandle.getReachabilityDiagnostics preserves published control-plane ' +
    'epoch from bootstrap readiness',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQueryWithTimeout = node.queryWithTimeout;
    const originalGetAdminSocket = node._getAdminSocket;
    let requestCount = 0;
    http.get = (url, _options, callback) => {
      requestCount += 1;
      const req = {
        on: () => req,
        destroy: () => {},
      };
      const isBootstrapReadiness =
        String(url).includes(':8080/bootstrap/ready');
      const response = {
        statusCode: isBootstrapReadiness ? 503 : 200,
        setEncoding: () => {},
        resume: () => {},
        on(event, handler) {
          if (event === 'data' && isBootstrapReadiness) {
            process.nextTick(() => {
              handler(JSON.stringify({
                phase: 'INIT',
                state: 'complete',
                reasons: ['LEADER_METADATA_INCOMPLETE'],
                controlPlaneRecoveryReady: true,
                readinessStage: 'acked',
                readinessStageRank: 3,
                recoveryStage: 'control_plane_recovery_ready',
                recoveryStageRank: 2,
                publishedControlPlaneEpoch: 14,
                bootstrapJoinProjection: {
                  canProjectReady: false,
                  blockerReason:
                    RESTART_RECOVERY_DIAGNOSTIC_TEST_PROJECTION_BLOCKER,
                },
              }));
            });
          }
          if (event === 'end') {
            process.nextTick(() => {
              handler();
            });
          }
          return response;
        },
      };
      process.nextTick(() => {
        callback(response);
      });
      return req;
    };
    node._getAdminSocket = async () => {
      throw new Error('admin ws unavailable');
    };
    node.queryWithTimeout = async () => {
      throw new Error('sql probe failed');
    };

    try {
      const diagnostics = await node.getReachabilityDiagnostics();
      assert.strictEqual(requestCount >= 3, true);
      assert.strictEqual(diagnostics.publishedControlPlaneEpoch, 14);
      assert.strictEqual(diagnostics.controlPlaneRecoveryReady, true);
      assert.strictEqual(diagnostics.readinessStage, 'acked');
      assert.strictEqual(diagnostics.readinessStageRank, 3);
      assert.strictEqual(
        diagnostics.bootstrapReadiness?.publishedControlPlaneEpoch,
        14,
      );
      assert.strictEqual(
        diagnostics.bootstrapReadiness?.bootstrapJoinProjection?.blockerReason,
        RESTART_RECOVERY_DIAGNOSTIC_TEST_PROJECTION_BLOCKER,
      );
    } finally {
      http.get = originalGet;
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  },
);

test(
  'Unit: NodeHandle.getReachabilityDiagnostics skips bootstrap readiness for ' +
    'admin-only callers',
  async () => {
    const nodeId = 'node-1';
    const containerId = 'container-1';
    const nodeIp = '127.0.0.1';
    const bootstrapHealthUrlFragment = ':8080/health';
    const bootstrapReadinessUrlFragment = ':8080/bootstrap/ready';
    const adminHealthUrlFragment = ':8081/health';
    const node = new NodeHandle(
      nodeId,
      containerId,
      nodeIp,
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQueryWithTimeout = node.queryWithTimeout;
    const originalGetAdminSocket = node._getAdminSocket;
    const calledUrls = [];
    let sqlProbeCount = 0;
    http.get = (url, _options, callback) => {
      const normalizedUrl = String(url);
      calledUrls.push(normalizedUrl);
      const req = {
        on: () => req,
        destroy: () => {},
      };
      process.nextTick(() => {
        callback({
          statusCode:
            normalizedUrl.includes(adminHealthUrlFragment) ? 200 :
              normalizedUrl.includes(bootstrapHealthUrlFragment) ? 200 :
                503,
          resume: () => {},
        });
      });
      return req;
    };
    node._getAdminSocket = async () => {
      throw new Error('admin ws unavailable');
    };
    node.queryWithTimeout = async (sql) => {
      if (sql === 'SELECT node_id FROM nodes LIMIT 1') {
        sqlProbeCount += 1;
      }
      return {rows: [{ok: 1}]};
    };

    try {
      const diagnostics = await node.getReachabilityDiagnostics({
        skipBootstrapReadiness: true,
      });
      assert.strictEqual(
        diagnostics.bootstrapHealth.ok,
        true,
        'bootstrap health probe should still execute',
      );
      assert.strictEqual(
        diagnostics.bootstrapReadiness,
        null,
        'admin-only fast path should not spend budget on bootstrap readiness',
      );
      assert.strictEqual(
        diagnostics.adminHealth.ok,
        true,
        'admin health probe should still execute on the fast path',
      );
      assert.strictEqual(
        diagnostics.adminReady,
        true,
        'admin-only fast path should preserve admin readiness',
      );
      assert.strictEqual(
        diagnostics.reachableBy,
        'admin_health',
        'admin-only fast path should preserve the admin-health witness',
      );
      assert.strictEqual(
        sqlProbeCount,
        0,
        'fast path should not fall through to SQL once admin health succeeds',
      );
      assert.strictEqual(
        calledUrls.some((entry) => entry.includes(bootstrapReadinessUrlFragment)),
        false,
        'admin-only fast path should skip the bootstrap readiness endpoint',
      );
      assert.strictEqual(
        calledUrls.length,
        2,
        'fast path should only issue bootstrap health and admin health probes',
      );
    } finally {
      http.get = originalGet;
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  },
);

test(
  'Unit: NodeHandle.getReachabilityDiagnostics applies a shared timeout budget across probes',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQueryWithTimeout = node.queryWithTimeout;
    const originalGetAdminSocket = node._getAdminSocket;
    const observedTimeouts = [];
    let requestCount = 0;
    http.get = (_url, options, callback) => {
      requestCount += 1;
      observedTimeouts.push(Number(options?.timeout));
      const req = {
        on: () => req,
        destroy: () => {},
      };
      if (requestCount === 1) {
        setTimeout(() => {
          callback({
            statusCode: 503,
            resume: () => {},
          });
        }, 30);
      } else {
        process.nextTick(() => {
          callback({
            statusCode: 503,
            resume: () => {},
          });
        });
      }
      return req;
    };
    node._getAdminSocket = async () => {
      throw new Error('admin ws unavailable');
    };
    node.queryWithTimeout = async () => {
      throw new Error('sql probe failed');
    };

    try {
      await node.getReachabilityDiagnostics({timeoutMs: 40});
      assert.strictEqual(
        observedTimeouts.length >= 3,
        true,
        'should issue bootstrap health, bootstrap readiness, and admin HTTP probes',
      );
      assert.strictEqual(
        observedTimeouts[1] < observedTimeouts[0],
        true,
        'admin probe should receive remaining timeout budget',
      );
    } finally {
      http.get = originalGet;
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  },
);

test(
  'Unit: NodeHandle.getReachabilityDiagnostics caps per-stage timeouts when ' +
    'called with a large restart readiness deadline',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQueryWithTimeout = node.queryWithTimeout;
    const originalGetAdminSocket = node._getAdminSocket;
    const observedTimeouts = [];
    http.get = (url, options, callback) => {
      observedTimeouts.push(Number(options?.timeout));
      const req = {
        on: () => req,
        destroy: () => {},
      };
      process.nextTick(() => {
        callback({
          statusCode: String(url).includes(':8080/health') ? 200 : 503,
          resume: () => {},
        });
      });
      return req;
    };
    node._getAdminSocket = async () => {
      throw new Error('admin ws unavailable');
    };
    node.queryWithTimeout = async () => {
      throw new Error('sql probe failed');
    };

    try {
      await node.getReachabilityDiagnostics({
        timeoutMs: LARGE_RESTART_READINESS_TIMEOUT_MS,
      });
      assert.strictEqual(
        observedTimeouts.length >= 3,
        true,
        'should issue bootstrap health, bootstrap readiness, and admin HTTP probes',
      );
      assert.deepStrictEqual(
        observedTimeouts.map((timeoutMs) =>
          timeoutMs <= REACHABILITY_HTTP_STAGE_TIMEOUT_CAP_MS,
        ),
        observedTimeouts.map(() => true),
        'large restart deadline must not become a single HTTP probe timeout',
      );
    } finally {
      http.get = originalGet;
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  },
);

test('Unit: NodeHandle.getReachabilityDiagnostics reports all probe stages on failure',
  async () => {
    const node = new NodeHandle(
      'node-1',
      'container-1',
      '127.0.0.1',
      NODE_ROLES.JOINER,
      {getContainerLogs: async () => ''},
    );

    const originalGet = http.get;
    const originalQueryWithTimeout = node.queryWithTimeout;
    const originalGetAdminSocket = node._getAdminSocket;
    http.get = (_url, _options, callback) => {
      const req = {
        on: () => req,
        destroy: () => {},
      };
      process.nextTick(() => {
        callback({
          statusCode: 503,
          resume: () => {},
        });
      });
      return req;
    };
    node._getAdminSocket = async () => {
      throw new Error('admin ws unavailable');
    };
    node.queryWithTimeout = async () => {
      throw new Error('sql probe failed');
    };

    try {
      const diagnostics = await node.getReachabilityDiagnostics();
      assert.strictEqual(diagnostics.reachable, false);
      assert.strictEqual(diagnostics.bootstrapHealth.attempted, true);
      assert.strictEqual(diagnostics.bootstrapHealth.ok, false);
      assert.strictEqual(diagnostics.adminHealth.attempted, true);
      assert.strictEqual(diagnostics.adminHealth.ok, false);
      assert.strictEqual(diagnostics.adminWs.attempted, true);
      assert.strictEqual(diagnostics.adminWs.ok, false);
      assert.strictEqual(diagnostics.sqlProbe.attempted, true);
      assert.strictEqual(diagnostics.sqlProbe.ok, false);
      assert.strictEqual(diagnostics.lastError, 'sql probe failed');
    } finally {
      http.get = originalGet;
      node.queryWithTimeout = originalQueryWithTimeout;
      node._getAdminSocket = originalGetAdminSocket;
    }
  });
