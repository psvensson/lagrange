/**
 * Public consumer-contract ratchet: the node-free half (no runtime started).
 *
 * This is NOT lagrange-images-owned semantics. It ratchets exactly the PUBLIC
 * Lagrange capabilities one real consumer (lagrange-images, whose Lagrange
 * backend uses createEmbeddedLagrange -> start -> openApplicationDatabase ->
 * query/transaction -> stop) depends on, so a core change that would break
 * that consumer fails here first. Expectations come from the owner contract
 * architecture/application-database-sessions.md, never from the code under
 * test. The runtime half (one embedded runtime on the lab) is
 * test/integration/public-consumer-contract-ratchet.integration.test.js.
 *
 * What is proven elsewhere is REFERENCED, not duplicated: the last test pins
 * that the referenced tests still exist, so deleting one breaks the ratchet.
 * - import without daemon side effects: public-api-side-effect-boundary;
 * - accessor params, NaN/proxy/shared-buffer params, and undefined/bigint/
 *   sparse params refused before any await, and -0 bound as 0 (none of these
 *   can cross the runtime half's JSON IPC): test/query/application-database;
 * - the consumer process imports only the package root:
 *   embedded-node-worker-contract (the integration half drives that worker);
 * - concurrent transactions on the same partitions are refused today
 *   (F-2PC-CONCURRENT-PARTICIPANT witness in the I2 facade suite); a consumer
 *   running concurrent read-then-write callbacks on one table meets it.
 */

import {readFileSync} from 'node:fs';
import {test} from '../../src/test-helpers/tap.js';

const PACKAGE_ROOT = 'lagrange-server';
const CODE = Object.freeze({
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  RUNTIME_NOT_STARTED: 'RUNTIME_NOT_STARTED',
  RUNTIME_STOPPED: 'RUNTIME_STOPPED',
});
// Every code the consumer contract (both halves of this ratchet) names.
const CONSUMER_ERROR_CODES = Object.freeze([
  'INVALID_ARGUMENT',
  'RUNTIME_ACTIVE',
  'RUNTIME_NOT_STARTED',
  'RUNTIME_STOPPED',
  'TRANSACTION_CONTROL_RESERVED',
]);
const ERROR_NAME = 'ApplicationDatabaseError';
const CONSUMER_APPLICATION_ID = 'lagrange-images';
const REPOSITORY_ROOT = new URL('../../', import.meta.url);
const INTEGRATION_HALF =
  'test/integration/public-consumer-contract-ratchet.integration.test.js';
const SRC_IMPORT_PATTERN = /\bfrom\s*['"]((?:\.\.\/)+src\/[^'"]+)['"]/g;
const TEST_HELPERS_SEGMENT = '/src/test-helpers/';
const REFERENCED_COVERAGE = Object.freeze([
  ['test/release/public-api-side-effect-boundary.test.js',
    'package public API imports and creates an embedded handle without effects'],
  ['test/query/application-database.test.js',
    'application inputs reject accessors without invoking them'],
  ['test/query/application-database.test.js',
    'bind validation resists mutable numeric intrinsics and hostile arrays'],
  ['test/query/application-database.test.js',
    'application params reject undefined, bigint and sparse slots before any await; -0 binds as 0'],
  ['test/release/embedded-node-worker-contract.test.js',
    'the application process imports only the public package entry under src/'],
  ['test/integration/public-application-database-transaction-facade.integration.test.js',
    'F-2PC-CONCURRENT-PARTICIPANT witness'],
]);

function readRepositoryFile(path) {
  return readFileSync(new URL(path, REPOSITORY_ROOT), 'utf8');
}

function thrown(run) {
  try {
    run();
  } catch (error) {
    return error;
  }
  return null;
}

async function rejected(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

test('I5.1 the package root exports what the consumer imports', async (t) => {
  const lagrange = await import(PACKAGE_ROOT);
  t.type(lagrange.createEmbeddedLagrange, 'function', 'createEmbeddedLagrange');
  t.type(lagrange.VERSION, 'string', 'VERSION');
  t.type(lagrange.ApplicationDatabaseError, 'function', ERROR_NAME);
  for (const code of CONSUMER_ERROR_CODES) {
    t.equal(lagrange.APPLICATION_DATABASE_ERROR_CODE[code], code,
      `APPLICATION_DATABASE_ERROR_CODE.${code} is exported`);
  }
});

test('I5.2 lifecycle edges reachable without a node (sessions contract, typed failure edges)', async (t) => {
  const {ApplicationDatabaseError, createEmbeddedLagrange} =
    await import(PACKAGE_ROOT);
  const runtime = createEmbeddedLagrange({configuration: {}});
  const beforeStart = thrown(() => runtime.openApplicationDatabase(
    {applicationId: CONSUMER_APPLICATION_ID}));
  t.ok(beforeStart instanceof ApplicationDatabaseError);
  t.equal(beforeStart.code, CODE.RUNTIME_NOT_STARTED,
    'open before start: RUNTIME_NOT_STARTED');

  await runtime.stop();
  const restart = await rejected(runtime.start());
  t.equal(restart?.code, CODE.RUNTIME_STOPPED,
    'STOPPED is terminal: a stopped handle cannot start');
  const afterStop = thrown(() => runtime.openApplicationDatabase(
    {applicationId: CONSUMER_APPLICATION_ID}));
  t.equal(afterStop?.code, CODE.RUNTIME_STOPPED, 'open after stop: RUNTIME_STOPPED');
});

test('I5.7 factory configuration a consumer may produce by mistake is refused before import', async (t) => {
  const {createEmbeddedLagrange} = await import(PACKAGE_ROOT);
  // A structuredClone'd configuration keeps `undefined` fields and bigints.
  for (const configuration of [{logLevel: undefined}, {limit: 1n}]) {
    const error = thrown(() => createEmbeddedLagrange({configuration}));
    t.equal(error?.code, CODE.INVALID_ARGUMENT,
      `${Object.keys(configuration)[0]}: INVALID_ARGUMENT at the factory`);
  }
});

test('I5 the runtime half reaches src/ only through test helpers', async (t) => {
  const specifiers = [...readRepositoryFile(INTEGRATION_HALF)
    .matchAll(SRC_IMPORT_PATTERN)].map((match) => match[1]);
  t.ok(specifiers.length > 0, 'the census sees the src/ imports');
  t.same(specifiers.filter((specifier) =>
    !specifier.includes(TEST_HELPERS_SEGMENT)), [],
  'no private core path: the consumer is the public-entry-only worker');
});

test('I5 referenced coverage still exists', async (t) => {
  for (const [path, title] of REFERENCED_COVERAGE) {
    t.ok(readRepositoryFile(path).includes(title), `${path}: "${title}"`);
  }
});
