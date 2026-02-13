/**
 * Configuration Manager Tests
 * Tests for centralized configuration management.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  ConfigurationManager,
  DEFAULT_CONFIG,
  ENV_MAPPINGS,
} from '../../src/config/configuration-manager.js';

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
  process.env.REST_API_PORT = '9090';

  const config = ConfigurationManager.getInstance();
  config.initialize();

  t.equal(config.get('node.id'), 'env-node-456', 'should load NODE_ID from env');
  t.equal(config.get('logging.level'), 'warn', 'should load LOG_LEVEL from env');
  t.equal(config.get('node.restApiPort'), 9090, 'should parse numeric env values');

  // Clean up
  delete process.env.NODE_ID;
  delete process.env.LOG_LEVEL;
  delete process.env.REST_API_PORT;
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
});
