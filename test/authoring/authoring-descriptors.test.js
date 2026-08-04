import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {describe, it} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  AUTHORING_DESCRIPTOR_KIND,
  deepFreeze,
  defineService,
} from '../../src/authoring/define-service.js';
import {distributed} from '../../src/authoring/distributed-operation.js';
import {http} from '../../src/authoring/request-handler.js';
import {AuthoringError, sql} from '../../src/authoring/sql-template.js';

const AUTHORING_DIRECTORY =
  fileURLToPath(new URL('../../src/authoring/', import.meta.url));
const EXPECTED_MODULES = Object.freeze([
  'define-service.js',
  'distributed-operation.js',
  'request-handler.js',
  'sql-template.js',
]);

function makeOperation() {
  return distributed({
    statement: sql`SELECT count(*) FROM rides`,
    run: (rows) => rows.length,
    reduce: (counts) => counts.reduce((sum, count) => sum + count, 0),
  });
}

describe('authoring descriptors', () => {
  it('exports frozen explicit kind discriminators', () => {
    assert.equal(Object.isFrozen(AUTHORING_DESCRIPTOR_KIND), true);
    assert.deepEqual(AUTHORING_DESCRIPTOR_KIND, {
      DISTRIBUTED_OPERATION: 'distributed_operation',
      REQUEST_HANDLER: 'request_handler',
      SERVICE_DEFINITION: 'service_definition',
      SQL_STATEMENT: 'sql_statement',
    });
  });

  it('produces frozen sql statement descriptors from literal text', () => {
    const statement = sql`SELECT count(*) FROM rides`;
    assert.deepEqual(statement, {
      kind: AUTHORING_DESCRIPTOR_KIND.SQL_STATEMENT,
      text: 'SELECT count(*) FROM rides',
    });
    assert.equal(Object.isFrozen(statement), true);
  });

  it('rejects sql template interpolations with a typed authoring error', () => {
    const table = 'rides';
    assert.throws(() => sql`SELECT count(*) FROM ${table}`, AuthoringError);
    assert.throws(
      () => sql`SELECT ${1} + ${2}`,
      (error) => error instanceof AuthoringError &&
        error.name === 'AuthoringError',
    );
  });

  it('freezes distributed operation descriptors deeply', () => {
    function runOnPartition(rows) {
      return rows.length;
    }
    const operation = distributed({
      statement: sql`SELECT count(*) FROM rides`,
      run: runOnPartition,
      reduce: (counts) => counts.length,
    });
    assert.equal(
      operation.kind, AUTHORING_DESCRIPTOR_KIND.DISTRIBUTED_OPERATION);
    assert.equal(Object.isFrozen(operation), true);
    assert.equal(Object.isFrozen(operation.statement), true);
    assert.equal(Object.isFrozen(operation.run), true);
    assert.equal(Object.isFrozen(operation.run.prototype), true);
    assert.equal(Object.isFrozen(operation.reduce), true);
  });

  it('survives reference cycles while freezing', () => {
    const node = {};
    node.self = node;
    assert.equal(deepFreeze(node), node);
    assert.equal(Object.isFrozen(node), true);

    function withCycle() {}
    withCycle.link = withCycle;
    assert.equal(deepFreeze(withCycle), withCycle);
    assert.equal(Object.isFrozen(withCycle), true);
    assert.equal(Object.isFrozen(withCycle.prototype), true);
  });

  it('builds request handler descriptors from explicit fields only', () => {
    const operation = makeOperation();
    const handle = async () => ({});
    const route = http.post('/stats', {calls: [operation], handle});
    assert.equal(route.kind, AUTHORING_DESCRIPTOR_KIND.REQUEST_HANDLER);
    assert.equal(route.method, 'POST');
    assert.equal(route.path, '/stats');
    assert.deepEqual(route.calls, [operation]);
    assert.equal(route.handle, handle);
    assert.equal(Object.isFrozen(route), true);
    assert.equal(Object.isFrozen(route.calls), true);

    const getRoute = http.get('/stats', {handle});
    assert.equal(getRoute.method, 'GET');
    assert.deepEqual(getRoute.calls, []);
    assert.equal(Object.isFrozen(getRoute.calls), true);
  });

  it('derives no identity from Function.name on any descriptor', () => {
    function veryDescriptiveWorkerName(rows) {
      return rows;
    }
    const operation = distributed({
      statement: sql`SELECT 1`,
      run: veryDescriptiveWorkerName,
      reduce: veryDescriptiveWorkerName,
    });
    const route = http.post('/stats', {
      calls: [operation],
      handle: veryDescriptiveWorkerName,
    });
    const definition = defineService({
      name: 'ride-stats',
      version: '1.0.0',
      operations: {countRides: operation},
      handlers: {rideStats: route},
    });
    assert.equal(Object.hasOwn(operation, 'name'), false);
    assert.equal(Object.hasOwn(route, 'name'), false);
    assert.deepEqual(Object.keys(operation).sort(),
      ['kind', 'reduce', 'run', 'statement']);
    assert.deepEqual(Object.keys(route).sort(),
      ['calls', 'handle', 'kind', 'method', 'path']);
    assert.deepEqual(Object.keys(definition).sort(),
      ['handlers', 'kind', 'name', 'operations', 'version']);
    assert.equal(definition.kind, AUTHORING_DESCRIPTOR_KIND.SERVICE_DEFINITION);
    assert.equal(Object.isFrozen(definition), true);
    assert.equal(Object.isFrozen(definition.operations), true);
    assert.equal(Object.isFrozen(definition.handlers), true);
  });

  it('ships exactly the four guest-safe modules with no barrel', () => {
    assert.deepEqual(readdirSync(AUTHORING_DIRECTORY).sort(),
      [...EXPECTED_MODULES]);
  });

  it('imports only relative package-local modules — guest safe', () => {
    const importPattern =
      /(?:^|\n)\s*import\s[^;]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]/g;
    for (const moduleName of EXPECTED_MODULES) {
      const source = readFileSync(`${AUTHORING_DIRECTORY}${moduleName}`, 'utf8');
      assert.equal(source.includes('require('), false, moduleName);
      for (const match of source.matchAll(importPattern)) {
        const specifier = match[1] ?? match[2];
        assert.equal(specifier.startsWith('./'), true,
          `${moduleName} must not import ${specifier}`);
      }
    }
  });
});
