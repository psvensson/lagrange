/**
 * Configuration Manager Tests
 * Tests for centralized configuration management.
 */

import fs from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';
import {
  ConfigurationManager,
  DEFAULT_CONFIG,
  ENV_MAPPINGS,
} from '../../src/config/configuration-manager.js';

const TEST_REST_API_PORT = 9090;
const TEST_ADMIN_WEBSOCKET_PORT = 9191;
const TEST_TRANSPORT_WEBSOCKET_PORT = 9292;

function clearListenerPortEnvironment() {
  delete process.env.REST_API_PORT;
  delete process.env.ADMIN_WEBSOCKET_PORT;
  delete process.env.NODE_WS_PORT;
}

test('listener default delegates retain the canonical port authority',
  async (t) => {
    const delegateContracts = [
      {
        path: 'src/admin/admin-constants.js',
        symbols: ['LISTENER_PORT_DEFAULT'],
        forbidden: /WEBSOCKET_PORT\s*:\s*8081/u,
      },
      {
        path: 'src/constants/entrypoint.js',
        symbols: ['LISTENER_PORT_DEFAULT', 'LISTENER_PORT_ENV'],
        forbidden: /REST_API_PORT\s*:\s*8080/u,
      },
      {
        path: 'src/constants/transport.js',
        symbols: [
          'LISTENER_PORT_DEFAULT',
          'deriveTransportWebSocketAddress',
        ],
        forbidden: /ENTRYPOINT_DEFAULT|restPort\s*\+/u,
      },
      {
        path: 'src/node/node-constants.js',
        symbols: ['LISTENER_PORT_DEFAULT'],
        forbidden: /REST_API_PORT\s*:\s*8080/u,
      },
    ];

    for (const contract of delegateContracts) {
      const source = fs.readFileSync(contract.path, 'utf8');
      for (const symbol of contract.symbols) {
        t.match(
          source,
          new RegExp(`\\b${symbol}\\b`, 'u'),
          `${contract.path} should consume ${symbol}`,
        );
      }
      t.notMatch(
        source,
        contract.forbidden,
        `${contract.path} should not own a listener default or derivation`,
      );
    }
  });

test('ConfigurationManager singleton', async (t) => {
  ConfigurationManager.resetInstance();
  const instance1 = ConfigurationManager.getInstance();
  const instance2 = ConfigurationManager.getInstance();
  t.equal(instance1, instance2, 'should return the same instance');
  ConfigurationManager.resetInstance();
});

test('ConfigurationManager initialization', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();

  t.notOk(config.isInitialized(), 'should not be initialized before initialize()');

  config.initialize();

  t.ok(config.isInitialized(), 'should be initialized after initialize()');
  t.ok(config.get('node.id'), 'should generate node ID if not provided');

  ConfigurationManager.resetInstance();
});

test('ConfigurationManager default values', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  t.equal(
    config.get('raft.electionTimeoutMinMs'),
    DEFAULT_CONFIG.raft.electionTimeoutMinMs,
    'should use default raft election timeout',
  );
  t.equal(
    config.get('logging.level'),
    DEFAULT_CONFIG.logging.level,
    'should use default log level',
  );
  t.equal(
    config.get('partition.defaultReplicaCount'),
    DEFAULT_CONFIG.partition.defaultReplicaCount,
    'should use default replica count',
  );
  t.equal(
    config.get('latency.groupThresholdMs'),
    DEFAULT_CONFIG.latency.groupThresholdMs,
    'should use default latency group threshold',
  );
  t.equal(
    config.get('latency.propagationMode'),
    DEFAULT_CONFIG.latency.propagationMode,
    'should use default latency propagation mode',
  );
  t.equal(
    config.get('admin.websocketPort'),
    config.get('node.restApiPort') + 1,
    'admin WebSocket default should derive from the REST base port',
  );
  t.equal(
    config.get('node.wsPort'),
    config.get('node.restApiPort') + 2,
    'transport WebSocket default should derive from the REST base port',
  );

  ConfigurationManager.resetInstance();
});

test('ConfigurationManager overrides', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();

  config.initialize({
    node: {id: 'test-node-123'},
    logging: {level: 'debug'},
  });

  t.equal(config.get('node.id'), 'test-node-123', 'should apply node ID override');
  t.equal(config.get('logging.level'), 'debug', 'should apply logging level override');

  ConfigurationManager.resetInstance();
});

test('ConfigurationManager environment variables', async (t) => {
  ConfigurationManager.resetInstance();

  // Set environment variables
  process.env.NODE_ID = 'env-node-456';
  process.env.LOG_LEVEL = 'warn';
  process.env.REST_API_PORT = String(TEST_REST_API_PORT);

  const config = ConfigurationManager.getInstance();
  config.initialize();

  t.equal(config.get('node.id'), 'env-node-456', 'should load NODE_ID from env');
  t.equal(config.get('logging.level'), 'warn', 'should load LOG_LEVEL from env');
  t.equal(
    config.get('node.restApiPort'),
    TEST_REST_API_PORT,
    'should parse numeric env values',
  );
  t.equal(
    config.get('admin.websocketPort'),
    TEST_REST_API_PORT + 1,
    'unoverridden admin port should follow the overridden REST base',
  );
  t.equal(
    config.get('node.wsPort'),
    TEST_REST_API_PORT + 2,
    'unoverridden transport port should follow the overridden REST base',
  );

  // Clean up
  delete process.env.NODE_ID;
  delete process.env.LOG_LEVEL;
  clearListenerPortEnvironment();
  ConfigurationManager.resetInstance();
});

test('ConfigurationManager accepts individual listener port overrides', async (t) => {
  ConfigurationManager.resetInstance();
  clearListenerPortEnvironment();
  process.env.REST_API_PORT = String(TEST_REST_API_PORT);
  process.env.ADMIN_WEBSOCKET_PORT = String(TEST_ADMIN_WEBSOCKET_PORT);
  process.env.NODE_WS_PORT = String(TEST_TRANSPORT_WEBSOCKET_PORT);

  const config = ConfigurationManager.getInstance();
  config.initialize();

  t.equal(config.get('node.restApiPort'), TEST_REST_API_PORT);
  t.equal(config.get('admin.websocketPort'), TEST_ADMIN_WEBSOCKET_PORT);
  t.equal(config.get('node.wsPort'), TEST_TRANSPORT_WEBSOCKET_PORT);

  clearListenerPortEnvironment();
  ConfigurationManager.resetInstance();
});

test('explicit WebSocket overrides do not evaluate unused offset ports', async (t) => {
  ConfigurationManager.resetInstance();
  clearListenerPortEnvironment();
  process.env.REST_API_PORT = '65535';
  process.env.ADMIN_WEBSOCKET_PORT = '10';
  process.env.NODE_WS_PORT = '11';

  const config = ConfigurationManager.getInstance();
  config.initialize();

  t.equal(config.get('node.restApiPort'), 65535);
  t.equal(config.get('admin.websocketPort'), 10);
  t.equal(config.get('node.wsPort'), 11);

  clearListenerPortEnvironment();
  ConfigurationManager.resetInstance();
});

test('derived WebSocket ports must remain within the listener range', async (t) => {
  ConfigurationManager.resetInstance();
  clearListenerPortEnvironment();
  process.env.REST_API_PORT = '65534';

  const config = ConfigurationManager.getInstance();
  t.throws(
    () => config.initialize(),
    /transport WebSocket listener port must be an integer between 1 and 65535/iu,
  );

  clearListenerPortEnvironment();
  ConfigurationManager.resetInstance();
});

test('ConfigurationManager rejects listener port collisions', async (t) => {
  const collisions = [
    {
      node: {id: 'rest-admin-collision', restApiPort: TEST_REST_API_PORT},
      admin: {websocketPort: TEST_REST_API_PORT},
    },
    {
      node: {
        id: 'rest-transport-collision',
        restApiPort: TEST_REST_API_PORT,
        wsPort: TEST_REST_API_PORT,
      },
    },
    {
      node: {
        id: 'admin-transport-collision',
        restApiPort: TEST_REST_API_PORT,
        wsPort: TEST_TRANSPORT_WEBSOCKET_PORT,
      },
      admin: {websocketPort: TEST_TRANSPORT_WEBSOCKET_PORT},
    },
  ];

  for (const overrides of collisions) {
    ConfigurationManager.resetInstance();
    const config = ConfigurationManager.getInstance();
    t.throws(
      () => config.initialize(overrides),
      /listener ports must be distinct/iu,
      'startup validation should reject pairwise listener collisions',
    );
  }

  ConfigurationManager.resetInstance();
});

test('ConfigurationManager accepts NODE_ADVERTISED_WS_ADDRESS', async (t) => {
  ConfigurationManager.resetInstance();

  // The Helm chart sets this on every pod; the schema must admit the key the
  // env mapping writes or the node dies at config validation.
  process.env.NODE_ADVERTISED_WS_ADDRESS = 'node-0.cluster.local:8082';

  const config = ConfigurationManager.getInstance();
  config.initialize();

  t.equal(
    config.get('node.advertisedWsAddress'),
    'node-0.cluster.local:8082',
    'should load NODE_ADVERTISED_WS_ADDRESS from env and pass validation',
  );

  delete process.env.NODE_ADVERTISED_WS_ADDRESS;
  ConfigurationManager.resetInstance();
});

test('ConfigurationManager validation', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();

  t.throws(
    () => config.initialize({logging: {level: 'invalid-level'}}),
    /Configuration validation failed/,
    'should throw on invalid log level',
  );

  ConfigurationManager.resetInstance();
});

test('ConfigurationManager latency validation', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();

  t.throws(
    () => config.initialize({
      node: {id: 'n-1'},
      latency: {smoothingAlpha: 2},
    }),
    /Configuration validation failed/,
    'should reject out-of-range smoothing alpha',
  );

  ConfigurationManager.resetInstance();
});

test('ConfigurationManager categories', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize();

  const categories = config.getCategories();
  t.ok(categories.includes('node'), 'should have node category');
  t.ok(categories.includes('raft'), 'should have raft category');
  t.ok(categories.includes('messageGroup'), 'should have messageGroup category');
  t.ok(categories.includes('partition'), 'should have partition category');
  t.ok(categories.includes('logging'), 'should have logging category');
  t.ok(categories.includes('latency'), 'should have latency category');

  const nodeConfig = config.getCategory('node');
  t.ok(nodeConfig.id, 'should return category configuration');

  ConfigurationManager.resetInstance();
});

test('ConfigurationManager getDefault', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();

  t.equal(
    config.getDefault('raft.heartbeatIntervalMs'),
    DEFAULT_CONFIG.raft.heartbeatIntervalMs,
    'should return default value',
  );

  ConfigurationManager.resetInstance();
});

test('ConfigurationManager getAll', async (t) => {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({node: {id: 'test-node'}});

  const allConfig = config.getAll();
  t.ok(allConfig.node, 'should return all configuration');
  t.ok(allConfig.raft, 'should include raft config');
  t.ok(allConfig.logging, 'should include logging config');

  // Verify it's a clone
  allConfig.node.id = 'modified';
  t.equal(config.get('node.id'), 'test-node', 'should return a clone');

  ConfigurationManager.resetInstance();
});

test('ENV_MAPPINGS coverage', async (t) => {
  t.ok(ENV_MAPPINGS.NODE_ID, 'should have NODE_ID mapping');
  t.ok(ENV_MAPPINGS.LOG_LEVEL, 'should have LOG_LEVEL mapping');
  t.ok(ENV_MAPPINGS.REST_API_PORT, 'should have REST_API_PORT mapping');
  t.ok(
    ENV_MAPPINGS.ADMIN_WEBSOCKET_PORT,
    'should have ADMIN_WEBSOCKET_PORT mapping',
  );
  t.ok(ENV_MAPPINGS.NODE_WS_PORT, 'should have NODE_WS_PORT mapping');
});
