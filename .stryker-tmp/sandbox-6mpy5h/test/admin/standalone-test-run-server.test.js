/**
 * Tests for standalone test-run dashboard server.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {
  buildServerUrl,
  createStandaloneTestRunServer,
  parsePort,
} from '../../src/admin/standalone-test-run-server.js';

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const TEST_HOST = '127.0.0.1';
const TEST_PORT = 8300;

/**
 * Create a mock test-run service.
 * @return {Object}
 */
function createMockTestRunService() {
  return {
    readDashboardPage: async () => '<html><body>standalone-dashboard</body></html>',
    readPlaybackViewer: async () => '<html><body>playback-viewer</body></html>',
    listAvailableTests: async () => [
      {id: 'alpha', file: 'test/distributed/scenarios/alpha.js'},
    ],
    listAvailableConfigs: async () => [
      {id: 'local.json', file: 'test/distributed/config/local.json'},
    ],
    listSavedRuns: async () => [],
    getRun: async (_runId) => null,
    startRun: async (_payload) => ({
      runId: 'run-1',
      scenario: 'alpha',
      status: 'running',
    }),
    stopRun: async (_runId) => ({
      runId: 'run-1',
      scenario: 'alpha',
      status: 'stopping',
    }),
    subscribeToRun: (_runId, _listener) => null,
    readOutputAsset: async (_wildcardPath) => ({
      contentType: 'application/json; charset=utf-8',
      body: Buffer.from('{"ok":true}', 'utf8'),
    }),
  };
}

test('standalone-test-run-server helpers', async (t) => {
  t.equal(parsePort('8181', 1000), 8181, 'should parse integer string port');
  t.equal(parsePort('abc', 1000), 1000, 'should fallback for invalid port');
  t.equal(buildServerUrl('127.0.0.1', 8181), 'http://127.0.0.1:8181');
});

test('standalone-test-run-server exposes HTTP dashboard routes without admin stream',
  async (t) => {
    const server = createStandaloneTestRunServer({
      host: TEST_HOST,
      port: TEST_PORT,
      testRunService: createMockTestRunService(),
    });

    const info = await server.start({listen: false});
    t.equal(info.url, `http://${TEST_HOST}:${TEST_PORT}`, 'should provide server URL');
    t.equal(info.dashboardUrl, `http://${TEST_HOST}:${TEST_PORT}/`, 'should provide dashboard URL');

    const fastify = server.getFastify();

    const dashboard = await fastify.inject({method: 'GET', url: '/'});
    t.equal(dashboard.statusCode, HTTP_OK, 'dashboard route should be available');
    t.match(dashboard.body, /standalone-dashboard/, 'dashboard should return static html');

    const testsResponse = await fastify.inject({method: 'GET', url: '/api/admin/tests'});
    t.equal(testsResponse.statusCode, HTTP_OK, 'test catalog route should be available');
    t.equal(testsResponse.json().tests[0].id, 'alpha', 'should return mock scenario');

    const streamRoute = await fastify.inject({method: 'GET', url: '/api/admin/stream'});
    t.equal(streamRoute.statusCode, HTTP_NOT_FOUND, 'legacy admin stream should be disabled');

    await server.stop();
  });
