const RELEASED_LEDGER_MESSAGE = 'Startup acquisition ledger is released';
const STARTUP_CLEANUP_FAILURE_MESSAGE =
  'Startup failed and acquired-resource cleanup also failed';

async function acquireStartupOwner(options) {
  const owner = await options.acquire();
  options.register(owner);
  options.assertActive();
  return owner;
}

async function unwindCleanupOwners(cleanupOwners) {
  let firstError = null;
  let cleanupFailed = false;
  while (cleanupOwners.length > 0) {
    const cleanup = cleanupOwners.pop();
    try {
      await cleanup();
    } catch (error) {
      if (!cleanupFailed) firstError = error;
      cleanupFailed = true;
    }
  }
  if (cleanupFailed) throw firstError;
}

function createStartupAcquisitionLedger() {
  const cleanupOwners = [];
  const exclusiveOwnerReleases = [];
  let released = false;

  function defer(cleanup, {requiresSuccessfulCleanup = false} = {}) {
    if (released) throw new Error(RELEASED_LEDGER_MESSAGE);
    const owners = requiresSuccessfulCleanup ?
      exclusiveOwnerReleases : cleanupOwners;
    owners.push(cleanup);
  }

  function release() {
    released = true;
    cleanupOwners.length = 0;
    exclusiveOwnerReleases.length = 0;
  }

  async function unwind() {
    if (released) return;
    released = true;
    // Every ordinary owner is attempted before any exclusive-owner release.
    // A rejected cleanup leaves process custody held; unwind never retries it.
    await unwindCleanupOwners(cleanupOwners);
    await unwindCleanupOwners(exclusiveOwnerReleases);
  }

  return Object.freeze({defer, release, unwind});
}

async function runStartupWithCleanup(cleanupLedger, startup) {
  try {
    const runtime = await startup();
    cleanupLedger.release();
    return runtime;
  } catch (startupError) {
    try {
      await cleanupLedger.unwind();
    } catch (cleanupError) {
      throw new AggregateError(
        [startupError, cleanupError],
        STARTUP_CLEANUP_FAILURE_MESSAGE,
        {cause: startupError},
      );
    }
    throw startupError;
  }
}

export {
  acquireStartupOwner,
  createStartupAcquisitionLedger,
  runStartupWithCleanup,
};
