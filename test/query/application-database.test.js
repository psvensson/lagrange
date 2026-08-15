import {test} from '../../src/test-helpers/tap.js';
import {createBoundApplicationDatabaseRuntime} from
  '../../src/query/application-database.js';
import {ApplicationDatabaseError} from
  '../../src/query/application-database-error.js';
import {
  createApplicationDatabaseExecutionOptions,
  enforceApplicationDatabaseStatementPolicy,
} from '../../src/query/application-database-statement-policy.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {createApplicationRuntimeGeneration} from
  '../../src/query/application-runtime-generation.js';

function createCore(handler = null) {
  const calls = [];
  return {
    calls,
    async executeQuery(sql, params, options) {
      calls.push({sql, params, options});
      if (handler) return handler(sql, params, options, calls);
      return {success: true};
    },
  };
}

async function captureRejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return null;
}

test('canonical parsed statement policy reserves transaction control', (t) => {
  const ast = new SQLParser('ROLLBACK').parse();
  const refused = enforceApplicationDatabaseStatementPolicy(
    ast,
    createApplicationDatabaseExecutionOptions('application:images:test'),
  );
  const allowed = enforceApplicationDatabaseStatementPolicy(
    ast,
    createApplicationDatabaseExecutionOptions('application:images:test', true),
  );

  t.equal(refused.failure.errorCode, 'TRANSACTION_CONTROL_RESERVED');
  t.equal(allowed.allowed, true);
  t.end();
});

test('control policy is independent of mutable Set methods', (t) => {
  const originalHas = Set.prototype.has;
  let refused;
  // eslint-disable-next-line no-extend-native -- adversarial intrinsic fixture
  Set.prototype.has = () => false;
  try {
    refused = enforceApplicationDatabaseStatementPolicy(
      new SQLParser('COMMIT').parse(),
      createApplicationDatabaseExecutionOptions('application:images:test'),
    );
  } finally {
    // eslint-disable-next-line no-extend-native -- restore adversarial fixture
    Set.prototype.has = originalHas;
  }
  t.equal(refused.allowed, false);
  t.equal(refused.failure.errorCode, 'TRANSACTION_CONTROL_RESERVED');
  t.end();
});

test('canonical SQLQueryEngine refuses raw application transaction control',
  async (t) => {
    const engine = new SQLQueryEngine();
    const result = await engine.executeQuery(
      'ROLLBACK',
      [],
      createApplicationDatabaseExecutionOptions('application:images:test'),
    );
    t.equal(result.success, false);
    t.equal(result.errorCode, 'TRANSACTION_CONTROL_RESERVED');
    await engine.shutdown();
  });

test('application inputs reject accessors without invoking them', async (t) => {
  const runtime = createBoundApplicationDatabaseRuntime(createCore());
  let getterCalls = 0;
  const openOptions = {};
  Object.defineProperty(openOptions, 'applicationId', {
    enumerable: true,
    get() {
      getterCalls++;
      return 'images';
    },
  });
  let openError;
  try {
    runtime.openApplicationDatabase(openOptions);
  } catch (error) {
    openError = error;
  }
  t.equal(openError.code, 'INVALID_ARGUMENT');
  t.equal(getterCalls, 0);

  const db = runtime.openApplicationDatabase({applicationId: 'images'});
  const params = [];
  Object.defineProperty(params, 0, {
    enumerable: true,
    get() {
      getterCalls++;
      return 'value';
    },
  });
  params.length = 1;
  const queryError = await captureRejection(db.query('SELECT ?', params));
  t.equal(queryError.code, 'INVALID_ARGUMENT');
  t.equal(getterCalls, 0);
});

test('application queries use isolated generated sessions and copied params',
  async (t) => {
    const core = createCore();
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    const bytes = new Uint8Array([1, 2]);

    await db.query('SELECT ?', [true, bytes]);
    bytes[0] = 9;
    await db.query('SELECT ?', [false]);

    t.not(core.calls[0].options.sessionId,
      core.calls[1].options.sessionId);
    t.equal(core.calls[0].params[0], 1);
    t.same([...core.calls[0].params[1]], [1, 2]);
  });

test('bind validation resists mutable numeric intrinsics and hostile arrays',
  async (t) => {
    const core = createCore();
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    const originalFinite = Number.isFinite;
    const originalSafeInteger = Number.isSafeInteger;
    Number.isFinite = () => true;
    Number.isSafeInteger = () => true;
    let numericError;
    try {
      numericError = await captureRejection(db.query('SELECT ?', [Number.NaN]));
    } finally {
      Number.isFinite = originalFinite;
      Number.isSafeInteger = originalSafeInteger;
    }
    const proxyError = await captureRejection(db.query(
      'SELECT ?',
      new Proxy([], {}),
    ));
    const sharedError = typeof SharedArrayBuffer === 'undefined' ? null :
      await captureRejection(db.query(
        'SELECT ?',
        [new Uint8Array(new SharedArrayBuffer(1))],
      ));
    t.equal(numericError.code, 'INVALID_ARGUMENT');
    t.equal(proxyError.code, 'INVALID_ARGUMENT');
    if (sharedError) t.equal(sharedError.code, 'INVALID_ARGUMENT');
    t.equal(core.calls.length, 0);
  });

test('detached byte views fail as typed input errors before canonical SQL',
  async (t) => {
    const core = createCore();
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    const buffer = new ArrayBuffer(8);
    const wholeView = new Uint8Array(buffer);
    const offsetView = new Uint8Array(buffer, 2, 3);
    structuredClone(buffer, {transfer: [buffer]});

    const detachedError = await captureRejection(db.query(
      'SELECT ?',
      [wholeView],
    ));
    const offsetError = await captureRejection(db.query(
      'SELECT ?',
      [offsetView],
    ));

    t.equal(detachedError.code, 'INVALID_ARGUMENT');
    t.equal(offsetError.code, 'INVALID_ARGUMENT');
    t.equal(core.calls.length, 0);
  });

test('bind snapshots and deferred admission ignore inherited array setters',
  async (t) => {
    const params = ['safe'];
    let releaseCallback;
    const callbackPromise = new Promise((resolve) => {
      releaseCallback = resolve;
    });
    let observedOwn = false;
    let observedValue;
    let bindSetterCalls = 0;
    let deferredSetterCalls = 0;
    const core = {
      async executeQuery(sql, boundParams) {
        if (sql === 'SELECT ?') {
          observedOwn = Object.hasOwn(boundParams, 0);
          observedValue = boundParams[0];
        }
        return {success: true};
      },
    };
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    const original = Object.getOwnPropertyDescriptor(Array.prototype, 0);
    let queryPromise;

    // eslint-disable-next-line no-extend-native -- adversarial fixture
    Object.defineProperty(Array.prototype, 0, {
      configurable: true,
      enumerable: true,
      get() {
        return 'polluted';
      },
      set(value) {
        if (value === 'safe') bindSetterCalls++;
        if (value && typeof value.admit === 'function') {
          deferredSetterCalls++;
        }
        Object.defineProperty(this, 0, {
          configurable: true,
          enumerable: true,
          value,
          writable: true,
        });
      },
    });
    try {
      await db.transaction((tx) => {
        queueMicrotask(() => {
          queryPromise = tx.query('SELECT ?', params);
          releaseCallback('settled');
        });
        return callbackPromise;
      });
      await queryPromise;
    } finally {
      // eslint-disable-next-line no-extend-native -- restore adversarial fixture
      if (original) Object.defineProperty(Array.prototype, 0, original);
      else Reflect.deleteProperty(Array.prototype, 0);
    }

    t.equal(bindSetterCalls, 0);
    t.equal(deferredSetterCalls, 0);
    t.equal(observedOwn, true);
    t.equal(observedValue, 'safe');
  });

test('transaction contract resists mutable Object Array and Promise methods',
  async (t) => {
    const core = createCore();
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const originals = {
      arrayIsArray: Array.isArray,
      objectCreate: Object.create,
      objectFreeze: Object.freeze,
      objectHasOwn: Object.hasOwn,
      promiseCatch: Promise.prototype.catch,
      promiseThen: Promise.prototype.then,
    };
    let error;
    try {
      const db = runtime.openApplicationDatabase({applicationId: 'images'});
      await db.transaction((tx) => {
        try {
          Array.isArray = () => false;
          Object.create = () => {
            throw new Error('mutable Object.create');
          };
          Object.freeze = () => {
            throw new Error('mutable Object.freeze');
          };
          Object.hasOwn = () => false;
          // eslint-disable-next-line no-extend-native -- adversarial fixture
          Promise.prototype.catch = () => {
            throw new Error('mutable Promise.catch');
          };
          // eslint-disable-next-line no-extend-native -- adversarial fixture
          Promise.prototype.then = () => {
            throw new Error('mutable Promise.then');
          };
          return tx.query('SELECT stable');
        } finally {
          Array.isArray = originals.arrayIsArray;
          Object.create = originals.objectCreate;
          Object.freeze = originals.objectFreeze;
          Object.hasOwn = originals.objectHasOwn;
          // eslint-disable-next-line no-extend-native -- restore fixture
          Promise.prototype.catch = originals.promiseCatch;
          // eslint-disable-next-line no-extend-native -- restore fixture
          Promise.prototype.then = originals.promiseThen;
        }
      });
    } catch (failure) {
      error = failure;
    } finally {
      Array.isArray = originals.arrayIsArray;
      Object.create = originals.objectCreate;
      Object.freeze = originals.objectFreeze;
      Object.hasOwn = originals.objectHasOwn;
      // eslint-disable-next-line no-extend-native -- restore adversarial fixture
      Promise.prototype.catch = originals.promiseCatch;
      // eslint-disable-next-line no-extend-native -- restore adversarial fixture
      Promise.prototype.then = originals.promiseThen;
    }
    t.equal(error, undefined);
    t.same(core.calls.map(({sql}) => sql),
      ['BEGIN', 'SELECT stable', 'COMMIT']);
  });

test('canonical failure metadata uses own data properties only', async (t) => {
  let attempt = 0;
  const inheritedFailure = Object.create({
    deferred: true,
    error: 'inherited message',
    errorCode: 'INHERITED_CODE',
    retryAfterMs: 99,
  });
  Object.defineProperty(inheritedFailure, 'success', {value: false});
  const thrown = new Error('owned message');
  thrown.code = 'OWNED_CODE';
  thrown.deferred = true;
  thrown.retryAfterMs = 7;
  const core = createCore(async () => {
    attempt++;
    if (attempt === 1) return inheritedFailure;
    throw thrown;
  });
  const runtime = createBoundApplicationDatabaseRuntime(core);
  const db = runtime.openApplicationDatabase({applicationId: 'images'});

  const inheritedError = await captureRejection(db.query('SELECT inherited'));
  const thrownError = await captureRejection(db.query('SELECT thrown'));
  t.equal(inheritedError.code, 'QUERY_FAILED');
  t.equal(inheritedError.message, 'Application database query failed');
  t.equal(inheritedError.deferred, false);
  t.equal(inheritedError.retryAfterMs, null);
  t.equal(thrownError.code, 'OWNED_CODE');
  t.equal(thrownError.message, 'owned message');
  t.equal(thrownError.deferred, true);
  t.equal(thrownError.retryAfterMs, 7);
  t.equal(thrownError.cause, thrown);
});

test('failure normalization rejects hostile proxies and invalid retry delays',
  async (t) => {
    const hostile = new Proxy({}, {
      getPrototypeOf() {
        throw new Error('prototype trap');
      },
    });
    const retries = [-1, -0, 1.5, Number.MAX_SAFE_INTEGER + 1,
      Number.NaN, Number.POSITIVE_INFINITY];
    let call = -1;
    const core = createCore(async () => {
      call++;
      if (call === 0) throw hostile;
      return {success: false, retryAfterMs: retries[call - 1]};
    });
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    const proxyError = await captureRejection(db.query('SELECT proxy'));
    t.equal(proxyError.code, 'QUERY_FAILED');
    t.equal(proxyError.cause, hostile);
    for (let index = 0; index < retries.length; index++) {
      const error = await captureRejection(db.query('SELECT retry'));
      t.equal(error.retryAfterMs, index === 1 ? 0 : null);
    }
  });

test('transaction drains unawaited statements before committing', async (t) => {
  let releaseQuery;
  const queryGate = new Promise((resolve) => {
    releaseQuery = resolve;
  });
  const core = createCore(async (sql) => {
    if (sql === 'SELECT slow') await queryGate;
    return {success: true};
  });
  const runtime = createBoundApplicationDatabaseRuntime(core);
  const db = runtime.openApplicationDatabase({applicationId: 'images'});

  const transaction = db.transaction((tx) => {
    void tx.query('SELECT slow');
  });
  await new Promise((resolve) => setImmediate(resolve));
  t.same(core.calls.map(({sql}) => sql), ['BEGIN', 'SELECT slow']);
  releaseQuery();
  await transaction;
  t.same(core.calls.map(({sql}) => sql),
    ['BEGIN', 'SELECT slow', 'COMMIT']);
});

test('synchronous callback closes admission before queued microtasks',
  async (t) => {
    const core = createCore();
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    let lateQuery;

    await db.transaction((tx) => {
      queueMicrotask(() => {
        lateQuery = captureRejection(tx.query('SELECT late'));
      });
    });
    const error = await lateQuery;
    t.equal(error.code, 'TRANSACTION_CLOSED');
    t.same(core.calls.map(({sql}) => sql), ['BEGIN', 'COMMIT']);
  });

test('fulfilled async callback closes admission before queued microtasks',
  async (t) => {
    const core = createCore();
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    let lateQuery;

    await db.transaction(async (tx) => {
      queueMicrotask(() => {
        lateQuery = captureRejection(tx.query('SELECT async late'));
      });
    });
    const error = await lateQuery;
    t.equal(error.code, 'TRANSACTION_CLOSED');
    t.same(core.calls.map(({sql}) => sql), ['BEGIN', 'COMMIT']);
  });

test('pre-existing pending callback promise admits statements until settlement',
  async (t) => {
    let releaseCallback;
    const pending = new Promise((resolve) => {
      releaseCallback = resolve;
    });
    const core = createCore();
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    let captured;
    let callbackEntered;
    const entered = new Promise((resolve) => {
      callbackEntered = resolve;
    });
    const transaction = db.transaction((tx) => {
      captured = tx;
      callbackEntered();
      return pending;
    });

    await entered;
    const during = await captured.query('SELECT during');
    releaseCallback('settled');
    t.equal(await transaction, 'settled');
    const after = await captureRejection(captured.query('SELECT after'));

    t.equal(during.success, true);
    t.equal(after.code, 'TRANSACTION_CLOSED');
    t.same(core.calls.map(({sql}) => sql),
      ['BEGIN', 'SELECT during', 'COMMIT']);
  });

test('query called before same-microtask settlement is admitted and drained',
  async (t) => {
    let releaseCallback;
    const callbackPromise = new Promise((resolve) => {
      releaseCallback = resolve;
    });
    let releaseQuery;
    const queryGate = new Promise((resolve) => {
      releaseQuery = resolve;
    });
    let markQueryStarted;
    const queryStarted = new Promise((resolve) => {
      markQueryStarted = resolve;
    });
    const core = createCore(async (sql) => {
      if (sql === 'SELECT before settlement') {
        markQueryStarted();
        await queryGate;
      }
      return {success: true};
    });
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    let queryPromise;

    const transaction = db.transaction((tx) => {
      queueMicrotask(() => {
        queryPromise = tx.query('SELECT before settlement');
        releaseCallback('settled');
      });
      return callbackPromise;
    });
    await queryStarted;
    t.same(core.calls.map(({sql}) => sql),
      ['BEGIN', 'SELECT before settlement']);
    releaseQuery();

    t.equal(await transaction, 'settled');
    t.equal((await queryPromise).success, true);
    t.same(core.calls.map(({sql}) => sql),
      ['BEGIN', 'SELECT before settlement', 'COMMIT']);
  });

test('pre-existing settled callback promises close queued admission',
  async (t) => {
    const fulfilled = Promise.resolve('fulfilled');
    const rejected = Promise.reject(new Error('rejected'));
    rejected.catch(() => undefined);
    await Promise.resolve();
    const core = createCore();
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    let fulfilledLate;
    let rejectedLate;

    t.equal(await db.transaction((tx) => {
      queueMicrotask(async () => {
        fulfilledLate = await captureRejection(tx.query('SELECT late'));
      });
      return fulfilled;
    }), 'fulfilled');
    const rejectedResult = await captureRejection(db.transaction((tx) => {
      queueMicrotask(async () => {
        rejectedLate = await captureRejection(tx.query('SELECT late'));
      });
      return rejected;
    }));
    await Promise.resolve();

    t.equal(fulfilledLate.code, 'TRANSACTION_CLOSED');
    t.equal(rejectedLate.code, 'TRANSACTION_CLOSED');
    t.equal(rejectedResult.message, 'rejected');
    t.same(core.calls.map(({sql}) => sql),
      ['BEGIN', 'COMMIT', 'BEGIN', 'ROLLBACK']);
  });

test('captured transaction handles expire after callback settlement',
  async (t) => {
    const core = createCore();
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    let captured;
    await db.transaction((tx) => {
      captured = tx;
    });
    const error = await captureRejection(captured.query('SELECT late'));
    t.equal(error.code, 'TRANSACTION_CLOSED');
    t.same(core.calls.map(({sql}) => sql), ['BEGIN', 'COMMIT']);
  });

test('swallowed statement failure dooms transaction and skips queued SQL',
  async (t) => {
    const core = createCore(async (sql) => {
      if (sql === 'SELECT broken') {
        return {success: false, error: 'broken', errorCode: 'BROKEN'};
      }
      return {success: true};
    });
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});

    const error = await captureRejection(db.transaction(async (tx) => {
      await tx.query('SELECT broken').catch(() => undefined);
      await tx.query('SELECT skipped').catch(() => undefined);
    }));
    t.equal(error.code, 'BROKEN');
    t.same(core.calls.map(({sql}) => sql),
      ['BEGIN', 'SELECT broken', 'ROLLBACK']);
  });

test('facade queries inside callbacks share the transaction session',
  async (t) => {
    const core = createCore();
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    await db.transaction(async (tx) => {
      await Promise.all([
        tx.query('SELECT tx'),
        db.query('SELECT facade'),
      ]);
    });
    t.same(core.calls.map(({sql}) => sql),
      ['BEGIN', 'SELECT tx', 'SELECT facade', 'COMMIT']);
    t.equal(new Set(core.calls.map(({options}) => options.sessionId)).size, 1);
  });

test('commit failure is not followed by rollback', async (t) => {
  const core = createCore(async (sql) => sql === 'COMMIT' ?
    {success: false, error: 'unknown commit', deferred: true} :
    {success: true});
  const runtime = createBoundApplicationDatabaseRuntime(core);
  const db = runtime.openApplicationDatabase({applicationId: 'images'});

  const error = await captureRejection(db.transaction(async () => undefined));
  t.equal(error instanceof ApplicationDatabaseError, true);
  t.same(core.calls.map(({sql}) => sql), ['BEGIN', 'COMMIT']);
});

test('rollback failure preserves primary typed metadata', async (t) => {
  const core = createCore(async (sql) => {
    if (sql === 'SELECT broken') {
      return {
        success: false,
        error: 'broken',
        errorCode: 'BROKEN',
        deferred: true,
        retryAfterMs: 11,
      };
    }
    if (sql === 'ROLLBACK') {
      return {success: false, error: 'rollback broke', errorCode: 'RB'};
    }
    return {success: true};
  });
  const runtime = createBoundApplicationDatabaseRuntime(core);
  const db = runtime.openApplicationDatabase({applicationId: 'images'});
  const error = await captureRejection(db.transaction(async (tx) => {
    await tx.query('SELECT broken');
  }));
  t.equal(error.code, 'BROKEN');
  t.equal(error.operation, 'query');
  t.equal(error.deferred, true);
  t.equal(error.retryAfterMs, 11);
  t.equal(error.rollbackError.code, 'RB');
  t.equal(error.cause.code, 'BROKEN');
});

test('nested transactions reject while closed descendants may start later',
  async (t) => {
    const core = createCore();
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    let delayed;

    await db.transaction(async () => {
      const error = await captureRejection(
        db.transaction(async () => undefined),
      );
      t.equal(error.code, 'TRANSACTION_NESTED');
      delayed = () => db.transaction(async () => undefined);
    });
    await delayed();
    t.same(core.calls.map(({sql}) => sql),
      ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT']);
  });

test('closing runtime invalidates handles after admitted operations drain',
  async (t) => {
    let releaseQuery;
    const gate = new Promise((resolve) => {
      releaseQuery = resolve;
    });
    const core = createCore(async (sql) => {
      if (sql === 'SELECT slow') await gate;
      return {success: true};
    });
    const runtime = createBoundApplicationDatabaseRuntime(core);
    const db = runtime.openApplicationDatabase({applicationId: 'images'});
    const pending = db.query('SELECT slow');
    const close = runtime.close();

    const error = await captureRejection(db.query('SELECT late'));
    t.equal(error.code, 'RUNTIME_STOPPED');
    releaseQuery();
    await Promise.all([pending, close]);
  });

test('runtime generation close is single-flight for concurrent callers',
  async (t) => {
    const generation = createApplicationRuntimeGeneration();
    const release = generation.acquire();
    const first = generation.closeAdmission();
    const second = generation.closeAdmission();
    t.equal(first, second);
    release();
    await Promise.all([first, second]);
    t.pass('both close callers drained');
  });
