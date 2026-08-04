import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  AUTHORING_DESCRIPTOR_KIND,
  defineService,
} from '../../src/authoring/define-service.js';
import {distributed} from '../../src/authoring/distributed-operation.js';
import {http} from '../../src/authoring/request-handler.js';
import {sql} from '../../src/authoring/sql-template.js';
// Imported through the package index on purpose: these are the contract's
// public re-exported names, and this import keeps that surface exercised.
import {
  SERVICE_SOURCE_ERROR_CODE,
  SERVICE_SOURCE_MESSAGE,
  SERVICE_SOURCE_PATH,
  SERVICE_SOURCE_STATUS,
  normalizeServiceDefinition,
  normalizeServiceSource,
} from '../../src/service/index.js';

function makeOperation() {
  return distributed({
    statement: sql`SELECT count(*) FROM rides`,
    run: (rows) => rows.length,
    reduce: (counts) => counts.reduce((sum, count) => sum + count, 0),
  });
}

function makeDefinition(overrides = {}) {
  const countRides = makeOperation();
  return defineService({
    name: 'ride-stats',
    version: '1.0.0',
    operations: {countRides},
    handlers: {
      rideStats: http.post('/stats', {
        calls: [countRides],
        handle: async (request, operations) => operations,
      }),
    },
    ...overrides,
  });
}

function rejectionCodes(result) {
  assert.equal(result.status, SERVICE_SOURCE_STATUS.REJECTED);
  for (const error of result.errors) {
    assert.equal(typeof error.message, 'string');
    assert.equal(error.message.length > 0, true);
    assert.equal(error.path.startsWith('/'), true);
  }
  return result.errors.map((error) => error.code);
}

describe('service source contract', () => {
  it('normalizes an authored service into a deeply frozen IR', () => {
    const result = normalizeServiceDefinition(makeDefinition());
    assert.equal(result.status, SERVICE_SOURCE_STATUS.ACCEPTED);
    const {ir} = result;
    assert.equal(ir.name, 'ride-stats');
    assert.equal(ir.version, '1.0.0');
    const [operation] = ir.operations;
    assert.equal(ir.operations.length, 1);
    assert.equal(operation.id, 'countRides');
    assert.deepEqual(operation.statement, {text: 'SELECT count(*) FROM rides'});
    assert.equal(typeof operation.run, 'function');
    assert.equal(typeof operation.reduce, 'function');
    const [handler] = ir.handlers;
    assert.equal(ir.handlers.length, 1);
    assert.equal(handler.id, 'rideStats');
    assert.equal(handler.kind, 'request');
    assert.equal(handler.method, 'POST');
    assert.equal(handler.path, '/stats');
    assert.equal(typeof handler.handle, 'function');
    assert.deepEqual(handler.allowedOperations, ['countRides']);
    for (const value of [result, ir, ir.operations, operation,
      operation.statement, ir.handlers, handler, handler.allowedOperations]) {
      assert.equal(Object.isFrozen(value), true);
    }
  });

  it('is deterministic for the same definition', () => {
    const definition = makeDefinition();
    const first = normalizeServiceDefinition(definition);
    const second = normalizeServiceDefinition(definition);
    assert.deepEqual(first, second);
  });

  it('takes identities only from object keys, never Function.name', () => {
    const worker = function completelyUnrelatedName(rows) {
      return rows;
    };
    const countRides = distributed({
      statement: sql`SELECT 1`, run: worker, reduce: worker,
    });
    const result = normalizeServiceDefinition(defineService({
      name: 'ride-stats',
      version: '1.0.0',
      operations: {countRides},
      handlers: {report: http.get('/report', {calls: [countRides], handle: worker})},
    }));
    assert.equal(result.status, SERVICE_SOURCE_STATUS.ACCEPTED);
    assert.deepEqual(result.ir.operations.map((operation) => operation.id),
      ['countRides']);
    assert.deepEqual(result.ir.handlers.map((handler) => handler.id),
      ['report']);
  });

  it('rejects values that are not defineService descriptors', () => {
    class FakeDefinition {}
    const attacks = [
      null,
      42,
      'service',
      [],
      new FakeDefinition(),
      {kind: 'other'},
      new Proxy({...makeDefinition()}, {}),
    ];
    for (const attack of attacks) {
      assert.deepEqual(rejectionCodes(normalizeServiceDefinition(attack)),
        [SERVICE_SOURCE_ERROR_CODE.NOT_SERVICE_DEFINITION]);
    }
  });

  it('rejects missing or empty name and version', () => {
    const result = normalizeServiceDefinition(defineService({
      name: '', operations: {}, handlers: {},
    }));
    assert.deepEqual(
      result.errors.map((error) => [error.path, error.code]), [
        [SERVICE_SOURCE_PATH.NAME, SERVICE_SOURCE_ERROR_CODE.INVALID_FIELD],
        [SERVICE_SOURCE_PATH.VERSION, SERVICE_SOURCE_ERROR_CODE.INVALID_FIELD],
      ]);
    assert.equal(result.errors[0].message, SERVICE_SOURCE_MESSAGE.INVALID_FIELD);
  });

  it('accepts a service with no operations and no handlers', () => {
    const result = normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0', operations: {}, handlers: {},
    }));
    assert.equal(result.status, SERVICE_SOURCE_STATUS.ACCEPTED);
    assert.deepEqual(result.ir.operations, []);
    assert.deepEqual(result.ir.handlers, []);
  });

  it('rejects non-plain operations and handlers containers', () => {
    for (const container of [[], new Map(), null, new class {}()]) {
      const codes = rejectionCodes(normalizeServiceDefinition(defineService({
        name: 'ride-stats', version: '1.0.0',
        operations: container, handlers: container,
      })));
      assert.deepEqual(codes, [
        SERVICE_SOURCE_ERROR_CODE.NOT_PLAIN_OBJECT,
        SERVICE_SOURCE_ERROR_CODE.NOT_PLAIN_OBJECT,
      ]);
    }
  });

  it('rejects operation and handler ids outside the identifier grammar', () => {
    const codes = rejectionCodes(normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0',
      operations: {'count-rides': makeOperation()},
      handlers: {'9stats': http.post('/stats', {handle: () => ({})})},
    })));
    assert.deepEqual(codes, [
      SERVICE_SOURCE_ERROR_CODE.INVALID_IDENTIFIER,
      SERVICE_SOURCE_ERROR_CODE.INVALID_IDENTIFIER,
    ]);
  });

  it('rejects operation values that are not distributed descriptors', () => {
    for (const value of [{}, http.post('/x', {handle: () => ({})}), 'op']) {
      const codes = rejectionCodes(normalizeServiceDefinition(defineService({
        name: 'ride-stats', version: '1.0.0',
        operations: {countRides: value}, handlers: {},
      })));
      assert.deepEqual(codes, [SERVICE_SOURCE_ERROR_CODE.INVALID_OPERATION]);
    }
  });

  it('rejects missing or non-sql statements', () => {
    const attacks = [
      undefined,
      'SELECT count(*) FROM rides',
      {kind: AUTHORING_DESCRIPTOR_KIND.SQL_STATEMENT, text: ''},
      {kind: 'other', text: 'SELECT 1'},
    ];
    for (const statement of attacks) {
      const result = normalizeServiceDefinition(defineService({
        name: 'ride-stats', version: '1.0.0',
        operations: {countRides: distributed({
          statement, run: () => 0, reduce: () => 0,
        })},
        handlers: {},
      }));
      assert.deepEqual(rejectionCodes(result),
        [SERVICE_SOURCE_ERROR_CODE.INVALID_STATEMENT]);
      assert.equal(result.errors[0].path, '/operations/countRides/statement');
    }
  });

  it('rejects distributed operations missing run or reduce', () => {
    const codes = rejectionCodes(normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0',
      operations: {countRides: distributed({statement: sql`SELECT 1`})},
      handlers: {},
    })));
    assert.deepEqual(codes, [
      SERVICE_SOURCE_ERROR_CODE.MISSING_REDUCE,
      SERVICE_SOURCE_ERROR_CODE.MISSING_RUN,
    ]);
  });

  it('fails closed on more than one distributed operation', () => {
    const first = makeOperation();
    const codes = rejectionCodes(normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0',
      operations: {countRides: first, sumFares: makeOperation()},
      handlers: {rideStats: http.post('/stats', {
        calls: [first], handle: () => ({}),
      })},
    })));
    assert.deepEqual(codes,
      [SERVICE_SOURCE_ERROR_CODE.SINGLE_OPERATION_RESTRICTION]);
  });

  it('rejects one descriptor registered under two operation ids', () => {
    const operation = makeOperation();
    const codes = rejectionCodes(normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0',
      operations: {first: operation, second: operation},
      handlers: {},
    })));
    assert.deepEqual(codes.sort(), [
      SERVICE_SOURCE_ERROR_CODE.DUPLICATE_OPERATION_ID,
      SERVICE_SOURCE_ERROR_CODE.SINGLE_OPERATION_RESTRICTION,
    ]);
  });

  it('rejects duplicate method plus path routes across handler ids', () => {
    const handle = () => ({});
    const rejected = normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0', operations: {},
      handlers: {
        alpha: http.post('/stats', {handle}),
        beta: http.post('/stats', {handle}),
      },
    }));
    assert.deepEqual(rejectionCodes(rejected),
      [SERVICE_SOURCE_ERROR_CODE.DUPLICATE_ROUTE]);
    assert.equal(rejected.errors[0].path, '/handlers/beta');

    const accepted = normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0', operations: {},
      handlers: {
        read: http.get('/stats', {handle}),
        write: http.post('/stats', {handle}),
      },
    }));
    assert.equal(accepted.status, SERVICE_SOURCE_STATUS.ACCEPTED);
  });

  it('resolves calls by descriptor reference, not by shape or name', () => {
    const declared = makeOperation();
    const impostor = makeOperation();
    const result = normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0',
      operations: {countRides: declared},
      handlers: {rideStats: http.post('/stats', {
        calls: [impostor], handle: () => ({}),
      })},
    }));
    assert.deepEqual(rejectionCodes(result),
      [SERVICE_SOURCE_ERROR_CODE.UNDECLARED_OPERATION]);
    assert.equal(result.errors[0].path, '/handlers/rideStats/calls/0');
  });

  it('rejects handler descriptors with wrong kind, method, or path', () => {
    const attacks = [
      {},
      makeOperation(),
      {kind: AUTHORING_DESCRIPTOR_KIND.REQUEST_HANDLER, method: 'PATCH',
        path: '/stats', calls: [], handle: () => ({})},
      {kind: AUTHORING_DESCRIPTOR_KIND.REQUEST_HANDLER, method: 'POST',
        path: 'stats', calls: [], handle: () => ({})},
    ];
    for (const handler of attacks) {
      const codes = rejectionCodes(normalizeServiceDefinition(defineService({
        name: 'ride-stats', version: '1.0.0',
        operations: {}, handlers: {rideStats: handler},
      })));
      assert.deepEqual(codes, [SERVICE_SOURCE_ERROR_CODE.INVALID_HANDLER]);
    }
  });

  it('rejects a handler without a handle function', () => {
    const codes = rejectionCodes(normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0',
      operations: {}, handlers: {rideStats: http.post('/stats', {calls: []})},
    })));
    assert.deepEqual(codes, [SERVICE_SOURCE_ERROR_CODE.MISSING_HANDLE]);
  });

  it('rejects calls that are not an array', () => {
    const result = normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0', operations: {},
      handlers: {rideStats: {
        kind: AUTHORING_DESCRIPTOR_KIND.REQUEST_HANDLER, method: 'POST',
        path: '/stats', calls: 'countRides', handle: () => ({}),
      }},
    }));
    assert.deepEqual(rejectionCodes(result),
      [SERVICE_SOURCE_ERROR_CODE.INVALID_CALLS]);
    assert.equal(result.errors[0].path, '/handlers/rideStats/calls');
  });

  it('accumulates every violation, sorted by path then code', () => {
    const result = normalizeServiceDefinition(defineService({
      name: '', version: '1.0.0',
      operations: {'bad-id': {}},
      handlers: {rideStats: http.post('stats', {calls: 'x', handle: null})},
    }));
    assert.deepEqual(
      result.errors.map((error) => [error.path, error.code]), [
        ['/handlers/rideStats', SERVICE_SOURCE_ERROR_CODE.INVALID_HANDLER],
        [SERVICE_SOURCE_PATH.NAME, SERVICE_SOURCE_ERROR_CODE.INVALID_FIELD],
        ['/operations/bad-id', SERVICE_SOURCE_ERROR_CODE.INVALID_IDENTIFIER],
        ['/operations/bad-id', SERVICE_SOURCE_ERROR_CODE.INVALID_OPERATION],
      ]);
    const sortKeys = result.errors.map((error) => `${error.path}:${error.code}`);
    assert.deepEqual(sortKeys, [...sortKeys].sort((left, right) =>
      left.localeCompare(right)));
  });

  it('turns throwing getters into a named diagnostic, never a throw', () => {
    const topLevel = {
      kind: AUTHORING_DESCRIPTOR_KIND.SERVICE_DEFINITION,
      get name() {
        throw new Error('gotcha');
      },
      version: '1.0.0', operations: {}, handlers: {},
    };
    assert.deepEqual(rejectionCodes(normalizeServiceDefinition(topLevel)),
      [SERVICE_SOURCE_ERROR_CODE.DEFINITION_ACCESS_THREW]);

    const nested = {
      kind: AUTHORING_DESCRIPTOR_KIND.SERVICE_DEFINITION,
      name: 'ride-stats', version: '1.0.0', handlers: {},
      operations: {countRides: {
        get kind() {
          throw new Error('gotcha');
        },
      }},
    };
    assert.deepEqual(rejectionCodes(normalizeServiceDefinition(nested)),
      [SERVICE_SOURCE_ERROR_CODE.DEFINITION_ACCESS_THREW]);
  });

  it('handles null-prototype containers deterministically', () => {
    const operations = Object.create(null);
    operations.countRides = makeOperation();
    const accepted = normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0', operations, handlers: {},
    }));
    assert.equal(accepted.status, SERVICE_SOURCE_STATUS.ACCEPTED);
    assert.deepEqual(accepted.ir.operations.map((operation) => operation.id),
      ['countRides']);

    const broken = Object.create(null);
    broken.countRides = distributed({statement: sql`SELECT 1`});
    const rejected = normalizeServiceDefinition(defineService({
      name: 'ride-stats', version: '1.0.0', operations: broken, handlers: {},
    }));
    assert.deepEqual(rejectionCodes(rejected), [
      SERVICE_SOURCE_ERROR_CODE.MISSING_REDUCE,
      SERVICE_SOURCE_ERROR_CODE.MISSING_RUN,
    ]);
  });

  it('maps loader failures to named diagnostics', async () => {
    const notFound = Object.assign(new Error('module missing'),
      {code: 'ERR_MODULE_NOT_FOUND'});
    const cases = [
      [() => Promise.reject(notFound),
        SERVICE_SOURCE_ERROR_CODE.MODULE_NOT_FOUND],
      [() => Promise.reject(new Error('threw at top level')),
        SERVICE_SOURCE_ERROR_CODE.MODULE_THREW_ON_IMPORT],
      [() => Promise.resolve({}),
        SERVICE_SOURCE_ERROR_CODE.NO_DEFAULT_EXPORT],
      [() => Promise.resolve({default: 42}),
        SERVICE_SOURCE_ERROR_CODE.DEFAULT_EXPORT_NOT_PLAIN_OBJECT],
      [() => Promise.resolve({default: [makeDefinition()]}),
        SERVICE_SOURCE_ERROR_CODE.DEFAULT_EXPORT_NOT_PLAIN_OBJECT],
    ];
    for (const [load, expectedCode] of cases) {
      const result =
        await normalizeServiceSource('lagrange.service.js', {load});
      assert.deepEqual(rejectionCodes(result), [expectedCode]);
      assert.equal(result.errors[0].path, SERVICE_SOURCE_PATH.ROOT);
    }
  });

  it('resolves plain paths to file URLs and accepts loaded modules', async () => {
    const seen = [];
    const definition = makeDefinition();
    const load = (url) => {
      seen.push(url);
      return Promise.resolve({default: definition});
    };
    const result = await normalizeServiceSource(
      'services/rides/lagrange.service.js', {load});
    assert.equal(result.status, SERVICE_SOURCE_STATUS.ACCEPTED);
    assert.equal(result.ir.name, 'ride-stats');
    assert.equal(seen[0].startsWith('file://'), true);
    assert.equal(seen[0].endsWith('/services/rides/lagrange.service.js'), true);

    await normalizeServiceSource('file:///opt/app/lagrange.service.js', {load});
    assert.equal(seen[1], 'file:///opt/app/lagrange.service.js');
  });
});

describe('service source contract under Object.prototype pollution', () => {
  it('rejects a definition whose required fields exist only on the prototype', () => {
    const statement = sql`SELECT count(*) FROM rides`;
    const hostileOperation = {
      kind: AUTHORING_DESCRIPTOR_KIND.DISTRIBUTED_OPERATION,
      statement,
    };
    const hostileDefinition = {
      kind: AUTHORING_DESCRIPTOR_KIND.SERVICE_DEFINITION,
      version: '1.0.0',
      operations: {countRides: hostileOperation},
      handlers: {},
    };
    const polluted = Object.freeze({
      handle: () => 'ATTACKER-CODE',
      name: 'attacker-service',
      reduce: () => 'ATTACKER-CODE',
      run: () => 'ATTACKER-CODE',
    });
    const pollutedKeys = Object.keys(polluted);
    try {
      for (const key of pollutedKeys) {
        // eslint-disable-next-line no-extend-native -- deliberate Object.prototype pollution attack fixture, reverted in finally
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          enumerable: false,
          value: polluted[key],
        });
      }
      const codes = rejectionCodes(normalizeServiceDefinition(hostileDefinition));
      assert.equal(codes.includes(SERVICE_SOURCE_ERROR_CODE.MISSING_RUN), true);
      assert.equal(codes.includes(SERVICE_SOURCE_ERROR_CODE.MISSING_REDUCE), true);
      assert.equal(codes.includes(SERVICE_SOURCE_ERROR_CODE.INVALID_FIELD), true);
    } finally {
      for (const key of pollutedKeys) {
        delete Object.prototype[key];
      }
    }
  });

  it('keeps a clean definition accepted while the prototype is polluted', () => {
    try {
      // eslint-disable-next-line no-extend-native -- deliberate Object.prototype pollution attack fixture, reverted in finally
      Object.defineProperty(Object.prototype, 'run', {
        configurable: true,
        enumerable: false,
        value: () => 'ATTACKER-CODE',
      });
      const result = normalizeServiceDefinition(makeDefinition());
      assert.equal(result.status, SERVICE_SOURCE_STATUS.ACCEPTED);
      assert.notEqual(result.ir.operations[0].run(['a']), 'ATTACKER-CODE');
    } finally {
      delete Object.prototype.run;
    }
  });
});
