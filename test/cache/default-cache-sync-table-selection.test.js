/**
 * Tests for default replica-cache table selection.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CACHE_HYDRATION_TABLES,
  CACHE_SYSTEM_TABLES,
} from '../../src/cache/cache-constants.js';
import {TABLES} from '../../src/constants/index.js';

test('default replica-cache table set keeps logs table as a valid system table', async (t) => {
  t.ok(
    CACHE_SYSTEM_TABLES.includes(TABLES.LOGS),
    'logs should remain a recognized system table for explicit queries',
  );
});

test('default replica-cache sync excludes logs table', async (t) => {
  t.notOk(
    CACHE_HYDRATION_TABLES.includes(TABLES.LOGS),
    'logs should not be synced to every replica cache by default',
  );
});

test('default replica-cache sync includes latency topology metadata tables', async (t) => {
  t.ok(
    CACHE_HYDRATION_TABLES.includes(TABLES.LATENCY_GROUPS),
    'latency_groups should be synced by default',
  );
  t.ok(
    CACHE_HYDRATION_TABLES.includes(TABLES.INTER_GROUP_LATENCIES),
    'inter_group_latencies should be synced by default',
  );
});
