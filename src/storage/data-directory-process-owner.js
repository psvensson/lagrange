import Database from 'better-sqlite3';
import path from 'node:path';

// Resource custody only: SQLite still decides exclusive ownership. Keep each
// acquired handle reachable until explicit release or process death, even when
// failed startup drops its ledger or an embedded caller drops its runtime.
const heldDataDirectoryDatabases = new Set();
const dataDirectoryOwnerHandles = new WeakMap();

const DATA_DIRECTORY_OWNER_DB = '.lagrange-data-directory-owner.sqlite';
const DATA_DIRECTORY_OWNER_ERROR_CODE = 'DATA_DIRECTORY_ALREADY_OWNED';
const DATA_DIRECTORY_OWNER_UNAVAILABLE_ERROR_CODE =
  'DATA_DIRECTORY_OWNERSHIP_UNAVAILABLE';
const DATA_DIRECTORY_OWNER_SQL = Object.freeze({
  ACQUIRE: 'BEGIN EXCLUSIVE',
  BUSY_TIMEOUT: 'busy_timeout = 0',
  RELEASE: 'ROLLBACK',
});

function dataDirectoryOwnershipError(dataDir, cause, alreadyOwned) {
  const error = new Error(
    alreadyOwned ?
      `Data directory is already owned by another Lagrange process: ${dataDir}` :
      `Data directory ownership could not be established: ${dataDir}`,
  );
  error.code = alreadyOwned ? DATA_DIRECTORY_OWNER_ERROR_CODE :
    DATA_DIRECTORY_OWNER_UNAVAILABLE_ERROR_CODE;
  error.errorCode = error.code;
  error.cause = cause;
  return error;
}

function acquireDataDirectoryProcessOwner(dataDir) {
  const canonicalDataDir = path.resolve(dataDir);
  const lockPath = path.join(canonicalDataDir, DATA_DIRECTORY_OWNER_DB);
  let database = null;
  try {
    database = new Database(lockPath);
    database.pragma(DATA_DIRECTORY_OWNER_SQL.BUSY_TIMEOUT);
    database.exec(DATA_DIRECTORY_OWNER_SQL.ACQUIRE);
  } catch (cause) {
    database?.close();
    const alreadyOwned = cause?.code === 'SQLITE_BUSY' ||
      cause?.code === 'SQLITE_LOCKED';
    throw dataDirectoryOwnershipError(canonicalDataDir, cause, alreadyOwned);
  }
  heldDataDirectoryDatabases.add(database);
  let released = false;
  const owner = Object.freeze({
    dataDir: canonicalDataDir,
    lockPath,
    release() {
      if (released) return;
      try {
        database.exec(DATA_DIRECTORY_OWNER_SQL.RELEASE);
      } finally {
        database.close();
        heldDataDirectoryDatabases.delete(database);
        dataDirectoryOwnerHandles.delete(owner);
        released = true;
      }
    },
  });
  dataDirectoryOwnerHandles.set(owner, {database, canonicalDataDir});
  return owner;
}

// This is a current custody check, not an allocation or membership decision.
// A copied object/path cannot stand in for the actual unreleased SQLite owner.
function ownsDataDirectoryProcessOwner(owner, dataDir) {
  const held = dataDirectoryOwnerHandles.get(owner);
  return held?.canonicalDataDir === path.resolve(dataDir) &&
    held.database.open === true && held.database.inTransaction === true;
}

function bindDataDirectoryProcessOwner(runtime, owner) {
  const shutdownRuntime = runtime.shutdownRuntime;
  return Object.freeze({
    ...runtime,
    async shutdownRuntime() {
      const result = await shutdownRuntime.call(runtime);
      owner.release();
      return result;
    },
  });
}

export {
  DATA_DIRECTORY_OWNER_ERROR_CODE,
  acquireDataDirectoryProcessOwner,
  bindDataDirectoryProcessOwner,
  ownsDataDirectoryProcessOwner,
};
