/**
 * Property Test: Cache Query Methods Completeness
 *
 * Property 53: Cache Query Methods Completeness
 * *For any* cache state, getLogs(), getConfig(), and getContexts() should return
 * all entries from their respective tables.
 *
 * Validates: Requirements 13.2
 */
// @ts-nocheck


import {test} from '../../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {RemoteCache} from '../../../src/cli/core/remote-cache.js';

/**
 * Arbitrary for generating a log record
 */
const logArb = fc.record({
  log_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  level: fc.constantFrom('ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'),
  node_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  service_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  message: fc.string({minLength: 1, maxLength: 100}),
  timestamp: fc.integer({min: 0, max: Date.now()}),
});

/**
 * Arbitrary for generating a config record
 * Uses config_key as the primary key field to match RemoteCache PRIMARY_KEYS
 */
const configArb = fc.record({
  config_key: fc.string({minLength: 1, maxLength: 20})
    .filter((s) => /^[a-z0-9._-]+$/i.test(s)),
  value: fc.string({minLength: 0, maxLength: 50}),
  type: fc.constantFrom('string', 'number', 'boolean'),
  requires_restart: fc.boolean(),
});

/**
 * Arbitrary for generating a context record
 */
const contextArb = fc.record({
  context_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  context_type: fc.constantFrom('function', 'trigger', 'procedure'),
  name: fc.string({minLength: 1, maxLength: 30}),
  created_at: fc.integer({min: 0, max: Date.now()}),
  updated_at: fc.integer({min: 0, max: Date.now()}),
});

/**
 * Arbitrary for generating a node record
 */
const nodeArb = fc.record({
  node_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  node_address: fc.string({minLength: 5, maxLength: 30}),
  status: fc.constantFrom('active', 'inactive', 'failed'),
});

/**
 * Arbitrary for generating a service record
 */
const serviceArb = fc.record({
  service_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  node_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  service_type: fc.constantFrom('partition', 'message_group', 'node'),
  status: fc.constantFrom('running', 'stopped', 'failed'),
});

/**
 * Arbitrary for generating a table record
 */
const tableArb = fc.record({
  table_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  table_name: fc.string({minLength: 1, maxLength: 20}),
});

/**
 * Arbitrary for generating a partition record
 */
const partitionArb = fc.record({
  partition_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  table_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  replica_count: fc.integer({min: 1, max: 5}),
});

/**
 * Arbitrary for generating a message group record
 */
const messageGroupArb = fc.record({
  group_id: fc.string({minLength: 1, maxLength: 10})
    .filter((s) => /^[a-z0-9-]+$/i.test(s)),
  replica_count: fc.integer({min: 1, max: 5}),
  status: fc.constantFrom('healthy', 'degraded', 'failed'),
});

/**
 * Helper to make records unique by their primary key
 */
function makeUnique(records, keyField) {
  const seen = new Set();
  return records.filter((r) => {
    const key = r[keyField];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Helper to make config records unique by config_key
 */
function makeConfigUnique(records) {
  return makeUnique(records, 'config_key');
}

test('Property 53: Cache Query Methods - getLogs returns all logs', async (t) => {
  /**
   * Feature: admin-cli, Property 53: Cache Query Methods Completeness
   * Validates: Requirements 13.2
   */
  fc.assert(
    fc.property(
      fc.array(logArb, {minLength: 0, maxLength: 10}),
      (logs) => {
        const cache = new RemoteCache();
        const uniqueLogs = makeUnique(logs, 'log_id');

        cache.loadFromDump({logs: uniqueLogs});

        const result = cache.getLogs();
        return result.length === uniqueLogs.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('getLogs() returns all log entries');
});

test('Property 53: Cache Query Methods - getConfig returns all config', async (t) => {
  /**
   * Feature: admin-cli, Property 53: Cache Query Methods Completeness
   * Validates: Requirements 13.2
   */
  fc.assert(
    fc.property(
      fc.array(configArb, {minLength: 0, maxLength: 10}),
      (configs) => {
        const cache = new RemoteCache();
        const uniqueConfigs = makeConfigUnique(configs);

        cache.loadFromDump({config: uniqueConfigs});

        const result = cache.getConfig();
        return result.length === uniqueConfigs.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('getConfig() returns all config entries');
});

test('Property 53: Cache Query Methods - getContexts returns all contexts', async (t) => {
  /**
   * Feature: admin-cli, Property 53: Cache Query Methods Completeness
   * Validates: Requirements 13.2
   */
  fc.assert(
    fc.property(
      fc.array(contextArb, {minLength: 0, maxLength: 10}),
      (contexts) => {
        const cache = new RemoteCache();
        const uniqueContexts = makeUnique(contexts, 'context_id');

        cache.loadFromDump({contexts: uniqueContexts});

        const result = cache.getContexts();
        return result.length === uniqueContexts.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('getContexts() returns all context entries');
});

test('Property 53: Cache Query Methods - getNodes returns all nodes', async (t) => {
  /**
   * Feature: admin-cli, Property 53: Cache Query Methods Completeness
   * Validates: Requirements 13.2
   */
  fc.assert(
    fc.property(
      fc.array(nodeArb, {minLength: 0, maxLength: 10}),
      (nodes) => {
        const cache = new RemoteCache();
        const uniqueNodes = makeUnique(nodes, 'node_id');

        cache.loadFromDump({nodes: uniqueNodes});

        const result = cache.getNodes();
        return result.length === uniqueNodes.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('getNodes() returns all node entries');
});

test('Property 53: Cache Query Methods - getServices returns all services', async (t) => {
  /**
   * Feature: admin-cli, Property 53: Cache Query Methods Completeness
   * Validates: Requirements 13.2
   */
  fc.assert(
    fc.property(
      fc.array(serviceArb, {minLength: 0, maxLength: 10}),
      (services) => {
        const cache = new RemoteCache();
        const uniqueServices = makeUnique(services, 'service_id');

        cache.loadFromDump({services: uniqueServices});

        const result = cache.getServices();
        return result.length === uniqueServices.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('getServices() returns all service entries');
});

test('Property 53: Cache Query Methods - getTables returns all tables', async (t) => {
  /**
   * Feature: admin-cli, Property 53: Cache Query Methods Completeness
   * Validates: Requirements 13.2
   */
  fc.assert(
    fc.property(
      fc.array(tableArb, {minLength: 0, maxLength: 10}),
      (tables) => {
        const cache = new RemoteCache();
        const uniqueTables = makeUnique(tables, 'table_id');

        cache.loadFromDump({tables: uniqueTables});

        const result = cache.getTables();
        return result.length === uniqueTables.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('getTables() returns all table entries');
});

test('Property 53: Cache Query Methods - getPartitions returns all partitions', async (t) => {
  /**
   * Feature: admin-cli, Property 53: Cache Query Methods Completeness
   * Validates: Requirements 13.2
   */
  fc.assert(
    fc.property(
      fc.array(partitionArb, {minLength: 0, maxLength: 10}),
      (partitions) => {
        const cache = new RemoteCache();
        const uniquePartitions = makeUnique(partitions, 'partition_id');

        cache.loadFromDump({partitions: uniquePartitions});

        const result = cache.getPartitions();
        return result.length === uniquePartitions.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('getPartitions() returns all partition entries');
});

test('Property 53: Cache Query Methods - getMessageGroups returns all groups', async (t) => {
  /**
   * Feature: admin-cli, Property 53: Cache Query Methods Completeness
   * Validates: Requirements 13.2
   */
  fc.assert(
    fc.property(
      fc.array(messageGroupArb, {minLength: 0, maxLength: 10}),
      (groups) => {
        const cache = new RemoteCache();
        const uniqueGroups = makeUnique(groups, 'group_id');

        cache.loadFromDump({message_groups: uniqueGroups});

        const result = cache.getMessageGroups();
        return result.length === uniqueGroups.length;
      },
    ),
    {numRuns: 10},
  );
  t.pass('getMessageGroups() returns all message group entries');
});

test('Property 53: Cache Query Methods - data integrity preserved', async (t) => {
  /**
   * Feature: admin-cli, Property 53: Cache Query Methods Completeness
   * Validates: Requirements 13.2
   */
  fc.assert(
    fc.property(
      fc.array(logArb, {minLength: 1, maxLength: 5}),
      fc.array(configArb, {minLength: 1, maxLength: 5}),
      fc.array(contextArb, {minLength: 1, maxLength: 5}),
      (logs, configs, contexts) => {
        const cache = new RemoteCache();
        const uniqueLogs = makeUnique(logs, 'log_id');
        const uniqueConfigs = makeConfigUnique(configs);
        const uniqueContexts = makeUnique(contexts, 'context_id');

        cache.loadFromDump({
          logs: uniqueLogs,
          config: uniqueConfigs,
          contexts: uniqueContexts,
        });

        // Verify data integrity
        const resultLogs = cache.getLogs();
        const resultConfigs = cache.getConfig();
        const resultContexts = cache.getContexts();

        // Check that all original data is present
        for (const log of uniqueLogs) {
          const found = resultLogs.find((l) => l.log_id === log.log_id);
          if (!found || found.message !== log.message) return false;
        }

        for (const config of uniqueConfigs) {
          const found = resultConfigs.find((c) => c.config_key === config.config_key);
          if (!found || found.value !== config.value) return false;
        }

        for (const context of uniqueContexts) {
          const found = resultContexts.find((c) =>
            c.context_id === context.context_id);
          if (!found || found.name !== context.name) return false;
        }

        return true;
      },
    ),
    {numRuns: 10},
  );
  t.pass('Query methods preserve data integrity');
});
