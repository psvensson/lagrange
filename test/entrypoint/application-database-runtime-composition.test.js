import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from '../../src/test-helpers/tap.js';
import {createEmbeddedLagrangeHandle} from '../../src/embedded-lagrange.js';
import {createBoundApplicationDatabaseRuntime} from
  '../../src/query/application-database.js';
import {createRuntimeShutdown} from
  '../../src/entrypoint-runtime-shutdown-lifecycle.js';
import {
  acquireStartupOwner,
  createStartupAcquisitionLedger,
} from
  '../../src/entrypoint-startup-acquisition-ledger.js';
import {
  resolveFailedJoinReattempt,
  throwIfStartupAborted,
} from
  '../../src/entrypoint-runtime-join-startup-policy.js';
import {createSqlRuntimeComposition} from
  '../../src/entrypoint-runtime-admin-composition.js';
import {startLagrangeRuntime} from '../../src/lagrange-runtime-startup.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {DataDirectoryManager} from
  '../../src/storage/data-directory-manager.js';
import {
  claimProcessRuntime,
  resetProcessRuntimeClaimForTests,
} from '../../src/lagrange-runtime-process-claim.js';

function createLogger() {
  return {error() {}, info() {}, warn() {}};
}

function captureThrown(callback) {
  try {
    callback();
  } catch (error) {
    return error;
  }
  return null;
}

async function captureThrownAsync(callback) {
  try {
    await callback();
  } catch (error) {
    return error;
  }
  return null;
}

test('embedded handle exposes the opener bound by its started runtime',
  async (t) => {
    resetProcessRuntimeClaimForTests();
    const opened = [];
    const handle = createEmbeddedLagrangeHandle({
      cliArgs: Object.freeze(Object.create(null)),
      configurationSnapshot: Object.freeze(Object.create(null)),
      environmentSnapshot: Object.freeze(Object.create(null)),
      async startRuntime() {
        return {
          openApplicationDatabase(options) {
            opened.push(options.applicationId);
            return {applicationId: options.applicationId};
          },
          async shutdownRuntime() {},
        };
      },
    });

    t.equal(captureThrown(() => handle.openApplicationDatabase({
      applicationId: 'images',
    })).code, 'RUNTIME_NOT_STARTED');
    await handle.start();
    t.same(handle.openApplicationDatabase({applicationId: 'images'}),
      {applicationId: 'images'});
    t.same(opened, ['images']);
    await handle.stop();
    t.equal(captureThrown(() => handle.openApplicationDatabase({
      applicationId: 'images',
    })).code, 'RUNTIME_STOPPED');
    resetProcessRuntimeClaimForTests();
  });

test('public starts reserve one process claim before asynchronous startup',
  async (t) => {
    resetProcessRuntimeClaimForTests();
    let releaseStartup;
    const startupGate = new Promise((resolve) => {
      releaseStartup = resolve;
    });
    const createHandle = () => createEmbeddedLagrangeHandle({
      configurationSnapshot: Object.freeze(Object.create(null)),
      environmentSnapshot: Object.freeze(Object.create(null)),
      async startRuntime() {
        await startupGate;
        return {async shutdownRuntime() {}, openApplicationDatabase() {}};
      },
    });
    const first = createHandle();
    const second = createHandle();
    const firstStart = first.start();
    const secondError = await captureThrownAsync(() => second.start());
    t.equal(secondError.code, 'RUNTIME_ACTIVE');
    releaseStartup();
    await firstStart;
    await first.stop();
    resetProcessRuntimeClaimForTests();
  });

test('public start normalizes raw startup failures', async (t) => {
  resetProcessRuntimeClaimForTests();
  const cause = new Error('bootstrap broke');
  const handle = createEmbeddedLagrangeHandle({
    configurationSnapshot: Object.freeze(Object.create(null)),
    environmentSnapshot: Object.freeze(Object.create(null)),
    async startRuntime() {
      throw cause;
    },
  });
  const error = await captureThrownAsync(() => handle.start());
  t.equal(error.code, 'RUNTIME_START_FAILED');
  t.equal(error.cause, cause);
  resetProcessRuntimeClaimForTests();
});

test('stop during startup aborts the admitted startup operation', async (t) => {
  resetProcessRuntimeClaimForTests();
  let observedSignal;
  const handle = createEmbeddedLagrangeHandle({
    configurationSnapshot: Object.freeze(Object.create(null)),
    environmentSnapshot: Object.freeze(Object.create(null)),
    startRuntime({signal}) {
      observedSignal = signal;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {once: true});
      });
    },
  });
  const starting = captureThrownAsync(() => handle.start());
  await handle.stop();
  const error = await starting;
  t.equal(observedSignal.aborted, true);
  t.equal(error.code, 'RUNTIME_STOPPED');
  t.equal(captureThrown(() => handle.openApplicationDatabase({
    applicationId: 'images',
  })).code, 'RUNTIME_STOPPED');
  resetProcessRuntimeClaimForTests();
});

test('bounded stop reports timeout while cleanup continues', async (t) => {
  resetProcessRuntimeClaimForTests();
  let releaseCleanup;
  const cleanupGate = new Promise((resolve) => {
    releaseCleanup = resolve;
  });
  const handle = createEmbeddedLagrangeHandle({
    configurationSnapshot: Object.freeze(Object.create(null)),
    environmentSnapshot: Object.freeze(Object.create(null)),
    stopTimeoutMs: 5,
    async startRuntime() {
      return {
        openApplicationDatabase() {},
        async shutdownRuntime() {
          await cleanupGate;
        },
      };
    },
  });
  await handle.start();
  const error = await captureThrownAsync(() => handle.stop());
  t.equal(error.code, 'RUNTIME_STOP_TIMEOUT');
  releaseCleanup();
  await new Promise((resolve) => setImmediate(resolve));
  t.equal(captureThrown(() => handle.openApplicationDatabase({
    applicationId: 'images',
  })).code, 'RUNTIME_STOPPED');
  resetProcessRuntimeClaimForTests();
});

test('hung transaction callback times out stop then permits eventual cleanup',
  async (t) => {
    resetProcessRuntimeClaimForTests();
    let releaseCallback;
    const callbackGate = new Promise((resolve) => {
      releaseCallback = resolve;
    });
    const applicationRuntime = createBoundApplicationDatabaseRuntime({
      async executeQuery() {
        return {success: true};
      },
    });
    const handle = createEmbeddedLagrangeHandle({
      configurationSnapshot: Object.freeze(Object.create(null)),
      environmentSnapshot: Object.freeze(Object.create(null)),
      stopTimeoutMs: 5,
      async startRuntime() {
        return {
          openApplicationDatabase:
            applicationRuntime.openApplicationDatabase,
          shutdownRuntime: applicationRuntime.close,
        };
      },
    });
    await handle.start();
    const db = handle.openApplicationDatabase({applicationId: 'images'});
    const transaction = db.transaction(async () => callbackGate);
    await new Promise((resolve) => setImmediate(resolve));
    const stopError = await captureThrownAsync(() => handle.stop());
    t.equal(stopError.code, 'RUNTIME_STOP_TIMEOUT');
    releaseCallback();
    await transaction;
    await new Promise((resolve) => setImmediate(resolve));
    const lateError = await captureThrownAsync(() => db.query('SELECT late'));
    t.equal(lateError.code, 'RUNTIME_STOPPED');
    resetProcessRuntimeClaimForTests();
  });

test('runtime shutdown drains application operations before owner cleanup',
  async (t) => {
    const calls = [];
    const shutdown = createRuntimeShutdown({
      adminAPI: null,
      bootstrapAPI: {
        async markDraining() {
          calls.push('draining');
          return {};
        },
        async shutdown() {
          calls.push('bootstrap');
        },
      },
      async closeApplicationDatabases() {
        calls.push('applications');
      },
      failureMessage: 'failed',
      logger: createLogger(),
      async ownerCleanup() {
        calls.push('owner');
      },
    });

    await shutdown('embedded');
    t.equal(calls[0], 'applications');
    t.ok(calls.indexOf('applications') < calls.indexOf('owner'));
  });

test('startup acquisition failure unwinds owners in reverse order', async (t) => {
  const calls = [];
  const ledger = createStartupAcquisitionLedger();
  ledger.defer(async () => calls.push('first'));
  ledger.defer(async () => calls.push('second'));
  await ledger.unwind();
  await ledger.unwind();
  t.same(calls, ['second', 'first']);
});

test('abort after acquisition registers the owner before cleanup', async (t) => {
  const calls = [];
  const ledger = createStartupAcquisitionLedger();
  const controller = new AbortController();
  const reason = new Error('cancel acquired owner');
  const error = await captureThrownAsync(() => acquireStartupOwner({
    async acquire() {
      calls.push('acquired');
      controller.abort(reason);
      return {async cleanup() {
        calls.push('cleaned');
      }};
    },
    assertActive() {
      throwIfStartupAborted(controller.signal);
    },
    register(owner) {
      ledger.defer(() => owner.cleanup());
    },
  }));
  await ledger.unwind();
  t.equal(error, reason);
  t.same(calls, ['acquired', 'cleaned']);
});

test('startup abort cancels join reattempt backoff', async (t) => {
  const controller = new AbortController();
  const reason = new Error('stop startup');
  const retry = captureThrownAsync(() => resolveFailedJoinReattempt({
    bootstrapAPI: {async shutdown() {}},
    joinAttempt: 0,
    joinResult: {error: 'retry', retryable: true},
    logger: createLogger(),
    nodeId: 'node-1',
    nodeJoiningService: {
      async cleanup() {},
      getLifecycleStateMachine() {
        return {};
      },
    },
    reattemptPolicy: {backoffCapExponent: 1, baseDelayMs: 10000,
      maxAttempts: 2, maxDelayMs: 10000},
    signal: controller.signal,
  }));
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort(reason);
  t.equal(await retry, reason);
});

test('process runtime claim is synchronous and process-lifetime scoped', (t) => {
  resetProcessRuntimeClaimForTests();
  t.equal(claimProcessRuntime(), true);
  t.equal(claimProcessRuntime(), false);
  resetProcessRuntimeClaimForTests();
  t.end();
});

test('missing-router SQL composition fails with a typed error', async (t) => {
  const error = await captureThrownAsync(() => createSqlRuntimeComposition({
    messageRouter: null,
  }));
  t.equal(error.code, 'SQL_CORE_UNAVAILABLE');
  t.equal(error.name, 'ApplicationDatabaseError');
});

test('real dry-run startup awaits CLI configuration overrides', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'lagrange-embedded-startup-'));
  const configuredDataDir = join(root, 'configured');
  const selectedDataDir = join(root, 'selected');
  resetProcessRuntimeClaimForTests();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  DataDirectoryManager.resetInstance();
  try {
    const runtime = await startLagrangeRuntime({
      cliArgs: {dataDir: selectedDataDir, dryRun: true},
      configuration: {
        logging: {level: 'error'},
        node: {id: 'embedded-startup-test'},
        storage: {dataDir: configuredDataDir},
      },
      environment: {NODE_ID: 'embedded-startup-test'},
    });
    t.equal(runtime.dryRun, true);
    t.equal(ConfigurationManager.getInstance().get('storage.dataDir'),
      selectedDataDir);
  } finally {
    await rm(root, {force: true, recursive: true});
    resetProcessRuntimeClaimForTests();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
    DataDirectoryManager.resetInstance();
  }
});

test('canonical SQL composition binds the application runtime to its engine',
  async (t) => {
    const source = await readFile(
      'src/entrypoint-runtime-admin-composition.js',
      'utf8',
    );
    t.match(source,
      /createBoundApplicationDatabaseRuntime\(sqlQueryEngine\)/u);
    t.match(source, /applicationDatabaseRuntime/u);
  });
