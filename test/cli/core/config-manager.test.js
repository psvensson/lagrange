import {test} from 'tap';
import {ConfigManager} from '../../../src/cli/core/config-manager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Helper to create a temporary config directory
function _createTempConfigDir() {
  const tempDir = path.join(os.tmpdir(), `ddb-admin-test-${Date.now()}`);
  fs.mkdirSync(tempDir, {recursive: true});
  return tempDir;
}

// Helper to clean up temp directory
function _cleanupTempDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

test('ConfigManager - has correct defaults', async (t) => {
  const manager = new ConfigManager();

  t.equal(manager.get('refresh_interval'), 2000);
  t.equal(manager.get('default_view'), 'nodes');
  t.equal(manager.get('color_scheme'), 'default');
  t.equal(manager.get('cache_persistence'), true);
  t.equal(manager.get('cdc_lag_threshold'), 5000);
  t.equal(manager.get('read_only_mode'), false);
});

test('ConfigManager - getAll returns copy of config', async (t) => {
  const manager = new ConfigManager();
  const config = manager.getAll();

  t.equal(config.refresh_interval, 2000);
  config.refresh_interval = 9999;
  t.equal(manager.get('refresh_interval'), 2000);
});

test('ConfigManager - getDefault returns default value', async (t) => {
  const manager = new ConfigManager();

  t.equal(manager.getDefault('refresh_interval'), 2000);
  t.equal(manager.getDefault('default_view'), 'nodes');
});

test('ConfigManager - validateField validates number type', async (t) => {
  const manager = new ConfigManager();

  t.same(manager.validateField('refresh_interval', 2000), {valid: true});
  t.same(manager.validateField('refresh_interval', 'string'), {
    valid: false,
    error: 'Must be a number',
  });
  t.same(manager.validateField('refresh_interval', 500), {
    valid: false,
    error: 'Must be at least 1000',
  });
  t.same(manager.validateField('refresh_interval', 100000), {
    valid: false,
    error: 'Must be at most 60000',
  });
});

test('ConfigManager - validateField validates string enum', async (t) => {
  const manager = new ConfigManager();

  t.same(manager.validateField('default_view', 'nodes'), {valid: true});
  t.same(manager.validateField('default_view', 'tables'), {valid: true});
  t.same(manager.validateField('default_view', 'invalid'), {
    valid: false,
    error: 'Must be one of: nodes, services, tables, partitions, ' +
           'message_groups, sql, logs, config, contexts',
  });
});

test('ConfigManager - validateField validates boolean', async (t) => {
  const manager = new ConfigManager();

  t.same(manager.validateField('cache_persistence', true), {valid: true});
  t.same(manager.validateField('cache_persistence', false), {valid: true});
  t.same(manager.validateField('cache_persistence', 'true'), {
    valid: false,
    error: 'Must be a boolean',
  });
});

test('ConfigManager - validateField rejects unknown keys', async (t) => {
  const manager = new ConfigManager();

  t.same(manager.validateField('unknown_key', 'value'), {
    valid: false,
    error: 'Unknown configuration key',
  });
});

test('ConfigManager - validateConfig validates entire config', async (t) => {
  const manager = new ConfigManager();

  const validConfig = {
    refresh_interval: 3000,
    default_view: 'tables',
    color_scheme: 'monochrome',
  };
  t.same(manager.validateConfig(validConfig), {valid: true, errors: []});

  const invalidConfig = {
    refresh_interval: 'invalid',
    default_view: 'invalid',
  };
  const result = manager.validateConfig(invalidConfig);
  t.equal(result.valid, false);
  t.equal(result.errors.length, 2);
});

test('ConfigManager - applyCliArgs applies address', async (t) => {
  const manager = new ConfigManager();

  manager.applyCliArgs({address: 'localhost:8080'});
  t.equal(manager.get('node_address'), 'localhost:8080');
});

test('ConfigManager - applyCliArgs applies refresh interval', async (t) => {
  const manager = new ConfigManager();

  manager.applyCliArgs({refresh: 5000});
  t.equal(manager.get('refresh_interval'), 5000);
});

test('ConfigManager - applyCliArgs applies view', async (t) => {
  const manager = new ConfigManager();

  manager.applyCliArgs({view: 'tables'});
  t.equal(manager.get('default_view'), 'tables');
});

test('ConfigManager - applyCliArgs applies monochrome', async (t) => {
  const manager = new ConfigManager();

  manager.applyCliArgs({monochrome: true});
  t.equal(manager.get('color_scheme'), 'monochrome');
});

test('ConfigManager - applyCliArgs applies readOnly', async (t) => {
  const manager = new ConfigManager();

  manager.applyCliArgs({readOnly: true});
  t.equal(manager.get('read_only_mode'), true);
});

test('ConfigManager - applyCliArgs warns on invalid refresh', async (t) => {
  const manager = new ConfigManager();

  manager.applyCliArgs({refresh: 100});
  t.equal(manager.get('refresh_interval'), 2000); // Default preserved
  t.ok(manager.hasWarnings());
  t.ok(manager.getWarnings()[0].includes('Invalid refresh interval'));
});

test('ConfigManager - applyCliArgs warns on invalid view', async (t) => {
  const manager = new ConfigManager();

  manager.applyCliArgs({view: 'invalid'});
  t.equal(manager.get('default_view'), 'nodes'); // Default preserved
  t.ok(manager.hasWarnings());
  t.ok(manager.getWarnings()[0].includes('Invalid view'));
});

test('ConfigManager - applyCliArgs handles null args', async (t) => {
  const manager = new ConfigManager();

  manager.applyCliArgs(null);
  t.equal(manager.get('refresh_interval'), 2000);
});

test('ConfigManager - load applies environment variables', async (t) => {
  const manager = new ConfigManager();
  const originalEnv = {...process.env};

  try {
    process.env.DDB_NODE_ADDRESS = 'env-host:9090';
    process.env.DDB_REFRESH_INTERVAL = '4000';

    manager.load();

    t.equal(manager.get('node_address'), 'env-host:9090');
    t.equal(manager.get('refresh_interval'), 4000);
  } finally {
    process.env = originalEnv;
  }
});

test('ConfigManager - load warns on invalid env refresh interval', async (t) => {
  const manager = new ConfigManager();
  const originalEnv = {...process.env};

  try {
    process.env.DDB_REFRESH_INTERVAL = '100';

    manager.load();

    t.equal(manager.get('refresh_interval'), 2000); // Default preserved
    t.ok(manager.hasWarnings());
    t.ok(manager.getWarnings()[0].includes('DDB_REFRESH_INTERVAL'));
  } finally {
    process.env = originalEnv;
  }
});

test('ConfigManager - getWarnings returns copy', async (t) => {
  const manager = new ConfigManager();
  manager.applyCliArgs({refresh: 100});

  const warnings = manager.getWarnings();
  warnings.push('extra');

  t.equal(manager.getWarnings().length, 1);
});
