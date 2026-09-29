import Database from 'better-sqlite3';
import path from 'node:path';

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
  let released = false;
  return Object.freeze({
    dataDir: canonicalDataDir,
    lockPath,
    release() {
      if (released) return;
      released = true;
      try {
        database.exec(DATA_DIRECTORY_OWNER_SQL.RELEASE);
      } finally {
        database.close();
      }
    },
  });
}

function bindDataDirectoryProcessOwner(runtime, owner) {
  const shutdownRuntime = runtime.shutdownRuntime;
  return Object.freeze({
    ...runtime,
    async shutdownRuntime() {
      try {
        return await shutdownRuntime.call(runtime);
      } finally {
        owner.release();
      }
    },
  });
}

export {
  DATA_DIRECTORY_OWNER_ERROR_CODE,
  acquireDataDirectoryProcessOwner,
  bindDataDirectoryProcessOwner,
};
