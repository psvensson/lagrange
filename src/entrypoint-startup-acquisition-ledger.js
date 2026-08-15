const RELEASED_LEDGER_MESSAGE = 'Startup acquisition ledger is released';

async function acquireStartupOwner(options) {
  const owner = await options.acquire();
  options.register(owner);
  options.assertActive();
  return owner;
}

function createStartupAcquisitionLedger() {
  const cleanupOwners = [];
  let released = false;

  function defer(cleanup) {
    if (released) throw new Error(RELEASED_LEDGER_MESSAGE);
    cleanupOwners.push(cleanup);
  }

  function release() {
    released = true;
    cleanupOwners.length = 0;
  }

  async function unwind() {
    if (released) return;
    released = true;
    let firstError = null;
    while (cleanupOwners.length > 0) {
      const cleanup = cleanupOwners.pop();
      try {
        await cleanup();
      } catch (error) {
        firstError ||= error;
      }
    }
    if (firstError) throw firstError;
  }

  return Object.freeze({defer, release, unwind});
}

export {acquireStartupOwner, createStartupAcquisitionLedger};
