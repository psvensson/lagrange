// Real process/SQLite custody with injected collaborator failure. No RF3 claim.
import Database from 'better-sqlite3';
import {join} from 'node:path';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {
  acquireDataDirectoryProcessOwner,
  bindDataDirectoryProcessOwner,
} from '../../src/storage/data-directory-process-owner.js';

const [mode, dataDir] = process.argv.slice(2);

async function forgetFailedRuntime() {
  const owner = acquireDataDirectoryProcessOwner(dataDir);
  const weak = new WeakRef(owner);
  const failure = new Error('injected embedded shutdown failure');
  const runtime = bindDataDirectoryProcessOwner({
    async shutdownRuntime() {
      throw failure;
    },
  }, owner);
  try {
    await runtime.shutdownRuntime();
    throw new Error('shutdown incorrectly succeeded');
  } catch (error) {
    if (error !== failure) throw error;
  }
  return weak;
}

async function collectForgottenOwner() {
  if (typeof global.gc !== 'function') throw new Error('explicit GC required');
  const weak = await forgetFailedRuntime();
  // Each GC is in a new job; no WeakRef dereference keeps the wrapper alive.
  for (let turn = 0; turn < 12; turn++) {
    await nextTurn();
    global.gc();
  }
  await nextTurn();
  return {wrapperCollected: weak.deref() === undefined};
}

async function failActualStartup() {
  const {startLagrangeRuntime} = await import('../../src/lagrange-runtime-startup.js');
  const {BootstrapAPI} = await import('../../src/bootstrap/bootstrap-api.js');
  const failCleanup = mode === 'startup-failed-cleanup';
  const startupError = new Error('injected actual bootstrap initialization failure');
  const cleanupError = new Error('injected actual bootstrap cleanup failure');
  const events = [];
  let resource;
  // Both methods are existing production seams. No constructor/startup/lock or
  // ledger is replaced, and no healthy cluster formation is claimed.
  BootstrapAPI.prototype.initialize = async function() {
    events.push('initialize');
    resource = new Database(join(dataDir, 'retained-startup-resource.sqlite'));
    resource.exec('CREATE TABLE held(value INTEGER)');
    throw startupError;
  };
  BootstrapAPI.prototype.shutdown = async function() {
    events.push('shutdown');
    if (failCleanup) throw cleanupError;
    resource.close();
  };
  let rejected;
  try {
    await startLagrangeRuntime({
      cliArgs: {dataDir},
      configuration: {
        logging: {level: 'error'},
        node: {id: 'process-custody-review'},
        storage: {dataDir},
      },
      environment: {NODE_ID: 'process-custody-review'},
    });
  } catch (error) {
    rejected = error;
  }
  return {
    events,
    resourceOpen: resource?.open ?? null,
    originalStartupError: rejected === startupError,
    cleanupErrorVisible: rejected instanceof AggregateError &&
      rejected.cause === startupError &&
      rejected.errors.length === 2 &&
      rejected.errors[0] === startupError && rejected.errors[1] === cleanupError,
    errorName: rejected?.name,
    errorMessage: rejected?.message,
  };
}

try {
  const result = mode === 'gc' ?
    await collectForgottenOwner() : await failActualStartup();
  process.once('message', (message) => {
    if (message !== 'exit') throw new Error('unknown owner control');
    // Deliberate process termination is the approved failed-cleanup recovery.
    process.exit(0);
  });
  process.send({kind: 'ready', mode, pid: process.pid, ...result});
} catch (error) {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
  process.disconnect();
}
