/**
 * A routed system-table write answers at commit with its position; a
 * consumer that needs its own projection waits on that position (quest
 * replica-admission-from-committed-operation, evidence/transition.md §4b,
 * lead decision 2026-11-02 condition 3):
 *
 *   (a) with the writer's cache never updated, insert and update (upsert
 *       composes them) resolve promptly with {committed: true, position} where position is
 *       {tableName, key, originHlc} of the committed write
 *   (b) awaitProjectionAt(position) resolves exactly when the local cache's
 *       row for the key carries an origin HLC at or after the position, and
 *       otherwise only when the service shuts down (typed, never VISIBLE)
 *   (c) a write whose commit itself fails is a failure, never converted
 *       into success by visibility or by a repair read
 *   (d) static, over the parsed sources: waitForCacheUpdate,
 *       allowPendingVisibility, skipCacheWait, CACHE_WAIT_TIMEOUT_MS and the
 *       bootstrapMode early return of the write path are gone from src/
 */

import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as espree from 'espree';
import {sourceFiles, walk} from '../test-helpers/source-tree-walk.js';
import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {CDCIntegrationService} from '../../src/cdc/cdc-integration-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const SRC_ROOT = fileURLToPath(new URL('../../src/', import.meta.url));
const SERVICE_ID = 'sql_transactions-p1-r4';
const PROMPT_MS = 300;
const COMMIT_HLC = new HLCTimestamp(1793615397288, 3, 'node-1').toString();
const OLDER_HLC = new HLCTimestamp(1793615397288, 1, 'node-1').toString();
const PENDING = Symbol('pending');

beforeEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});

function committingEngine(result = {}) {
  const engine = {
    calls: [],
    async executeQuery(sql, params) {
      engine.calls.push({sql, params});
      return {success: true, affectedRows: 1, originHlc: COMMIT_HLC,
        ...result};
    },
  };
  return engine;
}

function createService(engine = committingEngine()) {
  const cache = new SystemTableCache();
  const service = new CDCIntegrationService({
    nodeId: 'node-2',
    sqlQueryEngine: engine,
    systemTableCache: cache,
  });
  service.initialize();
  service.setSystemTableCache?.(cache);
  return {service, cache, engine};
}

function serviceRow(overrides = {}) {
  return {
    service_id: SERVICE_ID,
    service_type: 'partition',
    node_id: 'node-2',
    partition_id: 'sql_transactions-p1',
    status: 'syncing',
    created_at: 1,
    updated_at: 2,
    ...overrides,
  };
}

async function within(promise, ms) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(PENDING), ms);
  });
  try {
    return await Promise.race([
      promise.then((value) => ({value}), (error) => ({error})),
      timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const EXPECTED_POSITION = Object.freeze({
  tableName: SYSTEM_TABLE_NAME.SERVICES,
  key: SERVICE_ID,
  originHlc: COMMIT_HLC,
});

test('(a) insert and update answer at commit with the position, ' +
  'while the writer\'s cache never sees the row', async (t) => {
  const {service} = createService();
  const writes = {
    insert: () => service.insertSystemTableRow(
      SYSTEM_TABLE_NAME.SERVICES, serviceRow()),
    update: () => service.updateSystemTableRow(SYSTEM_TABLE_NAME.SERVICES,
      {service_id: SERVICE_ID}, {status: 'active'}),
  };
  for (const [name, write] of Object.entries(writes)) {
    const outcome = await within(write(), PROMPT_MS);
    t.not(outcome, PENDING,
      `${name} answers within ${PROMPT_MS} ms of its commit`);
    t.notOk(outcome?.error, `${name} does not fail ` +
      `(${outcome?.error?.message ?? 'no error'})`);
    t.equal(outcome?.value?.committed, true, `${name} answers committed`);
    t.same(outcome?.value?.position, EXPECTED_POSITION,
      `${name} answers its commit position`);
  }
  service.markShuttingDown();
});

test('(b) awaitProjectionAt resolves exactly at the position, and only ' +
  'shutdown ends it otherwise', async (t) => {
  const {service, cache} = createService();
  t.equal(typeof service.awaitProjectionAt, 'function',
    'the projection wait is one owner method');
  if (typeof service.awaitProjectionAt !== 'function') return;
  const waiting = service.awaitProjectionAt(EXPECTED_POSITION);
  t.equal(await within(waiting, 50), PENDING, 'nothing applied: pending');
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT',
    serviceRow({updated_at_hlc: OLDER_HLC}));
  t.equal(await within(waiting, 50), PENDING,
    'an older origin does not satisfy the position');
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'UPDATE',
    serviceRow({updated_at_hlc: COMMIT_HLC, updated_at: 3}));
  const reached = await within(waiting, 50);
  t.not(reached, PENDING, 'the position applied resolves the wait');
  t.notOk(reached?.error, 'and it resolves, never rejects');

  const never = service.awaitProjectionAt({...EXPECTED_POSITION,
    key: 'never-applied'});
  t.equal(await within(never, 50), PENDING,
    'there is no timer: an unapplied position stays pending');
  service.markShuttingDown();
  const ended = await within(never, 50);
  t.not(ended, PENDING, 'shutdown ends the wait');
  t.equal(ended?.error?.code ?? ended?.value?.outcome, 'shutdown',
    'the end is typed shutdown, never visible');
});

// (b2) The position is a lower bound: a later write's row (a newer origin
// HLC) satisfies it; a deletion's position is satisfied once the
// pre-deletion row is gone.
test('(b2) a later HLC satisfies the position; a deletion position is ' +
  'satisfied by the row\'s absence', async (t) => {
  const {service, cache} = createService();
  const laterHlc = new HLCTimestamp(1793615397288, 9, 'node-3').toString();
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT',
    serviceRow({updated_at_hlc: laterHlc}));
  const reached = await within(
    service.awaitProjectionAt(EXPECTED_POSITION), PROMPT_MS);
  t.equal(reached?.value?.outcome, 'reached',
    'a row stamped later than the position satisfies it');

  service.markShuttingDown();

  // A second projection still holds the row as it was before the deletion.
  const other = createService();
  other.cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT',
    serviceRow({updated_at_hlc: OLDER_HLC}));
  const deletion = Object.freeze({...EXPECTED_POSITION, deleted: true});
  const waiting = other.service.awaitProjectionAt(deletion);
  t.equal(await within(waiting, 50), PENDING,
    'the pre-deletion row is still present: the deletion is not projected');
  other.cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'DELETE',
    serviceRow({updated_at_hlc: COMMIT_HLC}));
  const removed = await within(waiting, PROMPT_MS);
  t.equal(removed?.value?.outcome, 'reached',
    'the row\'s absence satisfies the deletion position');
  other.service.markShuttingDown();
});

// P4: a write that changed no row emits no change event, so a position
// would never be reached. It answers none, and the wait refuses it.
test('(b3) a zero-row update answers no position; the wait refuses null ' +
  'typed', async (t) => {
  const {service} = createService(committingEngine({affectedRows: 0}));
  const answer = await service.updateSystemTableRow(
    SYSTEM_TABLE_NAME.SERVICES, {service_id: SERVICE_ID}, {status: 'active'});
  t.equal(answer.committed, true);
  t.equal(answer.position, null, 'no position for a zero-row write');
  const refused = await service.awaitProjectionAt(answer.position)
    .then(() => null, (error) => error);
  t.equal(refused?.code, 'position_invalid', 'refused typed, no hang');
  service.markShuttingDown();
});

test('(c) a failed commit is a failure; no visibility or repair read ' +
  'turns it into success', async (t) => {
  const {service, cache, engine} = createService(committingEngine(
    {success: false, error: 'partition_execution_deadline'}));
  cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT',
    serviceRow({updated_at_hlc: COMMIT_HLC}));
  const outcome = await within(service.insertSystemTableRow(
    SYSTEM_TABLE_NAME.SERVICES, serviceRow()), PROMPT_MS);
  t.not(outcome, PENDING, 'the failed commit answers promptly');
  t.ok(outcome?.error, 'it is a failure even though the cache holds the row');
  t.notOk(outcome?.value?.committed, 'never committed');
  t.equal(engine.calls.length, 1, 'no repair read follows the failure');
  service.markShuttingDown();
});

const REMOVED_NAMES = new Set([
  'waitForCacheUpdate',
  'allowPendingVisibility',
  'skipCacheWait',
  'CACHE_WAIT_TIMEOUT_MS',
  'cacheWaitTimeoutMs',
  'confirmCacheVisibilityHoleWithinBudget',
  'ALLOW_PENDING_VISIBILITY',
  'ALLOWPENDINGVISIBILITY',
]);

test('(d) static: the cache-visibility wait and its alternate paths are ' +
  'gone from src/', async (t) => {
  const offenders = [];
  for (const file of sourceFiles(SRC_ROOT)) {
    const ast = espree.parse(fs.readFileSync(file, 'utf8'),
      {ecmaVersion: 'latest', sourceType: 'module'});
    walk(ast, (node) => {
      const name = node.type === 'Identifier' ? node.name :
        node.type === 'Literal' && typeof node.value === 'string' ?
          node.value : null;
      if (name !== null && REMOVED_NAMES.has(name)) {
        offenders.push(`${file.slice(SRC_ROOT.length)}:${name}`);
      }
    });
  }
  t.same([...new Set(offenders)], [],
    'no src identifier or key names the removed wait or its paths');
});
