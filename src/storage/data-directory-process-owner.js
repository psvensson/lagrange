import Database from 'better-sqlite3';
import {createHash, randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIRECTORY_OWNER_DB = '.lagrange-data-directory-owner.sqlite';
const DATA_DIRECTORY_BIRTH_MARKER = '.lagrange-data-directory-birth.json';
const DATA_DIRECTORY_RENDEZVOUS_PREFIX = '.lagrange-data-directory-claim-';
const DATA_DIRECTORY_OWNER_ERROR_CODE = 'DATA_DIRECTORY_ALREADY_OWNED';
const DATA_DIRECTORY_OWNER_UNAVAILABLE_ERROR_CODE =
  'DATA_DIRECTORY_OWNERSHIP_UNAVAILABLE';
const DATA_DIRECTORY_ENTRY_CONFLICT_ERROR_CODE =
  'DATA_DIRECTORY_ENTRY_CONFLICT';
const DATA_DIRECTORY_OWNER_SQL = Object.freeze({
  ACQUIRE: 'BEGIN EXCLUSIVE',
  BUSY_TIMEOUT: 'busy_timeout = 0',
  RELEASE: 'ROLLBACK',
});
const OWNER_STATE = new WeakMap();

function dataDirectoryOwnershipError(dataDir, cause, code) {
  const error = new Error(code === DATA_DIRECTORY_OWNER_ERROR_CODE ?
    `Data directory is already owned by another Lagrange process: ${dataDir}` :
    `Data directory ownership could not be established: ${dataDir}`);
  error.code = code;
  error.errorCode = code;
  error.cause = cause;
  return error;
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function requireOrdinaryDirectory(directory, requested) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw dataDirectoryOwnershipError(requested, null,
      DATA_DIRECTORY_ENTRY_CONFLICT_ERROR_CODE);
  }
  return stat;
}

function openExclusiveDatabase(file, dataDir) {
  let database = null;
  try {
    database = new Database(file);
    database.pragma(DATA_DIRECTORY_OWNER_SQL.BUSY_TIMEOUT);
    database.exec(DATA_DIRECTORY_OWNER_SQL.ACQUIRE);
    return database;
  } catch (cause) {
    database?.close();
    const code = cause?.code === 'SQLITE_BUSY' || cause?.code === 'SQLITE_LOCKED' ?
      DATA_DIRECTORY_OWNER_ERROR_CODE :
      DATA_DIRECTORY_OWNER_UNAVAILABLE_ERROR_CODE;
    throw dataDirectoryOwnershipError(dataDir, cause, code);
  }
}

function releaseDatabase(database) {
  if (!database) return;
  try {
    database.exec(DATA_DIRECTORY_OWNER_SQL.RELEASE);
  } finally {
    database.close();
  }
}

function writeBirthMarker(markerPath, canonicalDataDir) {
  const marker = Object.freeze({
    authorityId: randomBytes(32).toString('hex'),
    canonicalDataDir,
    version: 1,
  });
  const descriptor = fs.openSync(markerPath,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY |
      (fs.constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(marker)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fsyncDirectory(canonicalDataDir);
  return marker;
}

function readBirthMarker(markerPath, canonicalDataDir) {
  let marker;
  try {
    const stat = fs.lstatSync(markerPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw dataDirectoryOwnershipError(canonicalDataDir, error,
      DATA_DIRECTORY_OWNER_UNAVAILABLE_ERROR_CODE);
  }
  return marker?.version === 1 &&
    typeof marker.authorityId === 'string' && marker.authorityId.length === 64 &&
    marker.canonicalDataDir === canonicalDataDir ? marker : null;
}

function resolveLeaf(dataDir) {
  const requested = path.resolve(dataDir);
  const parentInput = path.dirname(requested);
  const leafName = path.basename(requested);
  if (leafName.length === 0 || leafName === '.' || leafName === '..') {
    throw dataDirectoryOwnershipError(requested, null,
      DATA_DIRECTORY_ENTRY_CONFLICT_ERROR_CODE);
  }
  let realParent;
  try {
    realParent = fs.realpathSync.native(parentInput);
    requireOrdinaryDirectory(realParent, requested);
  } catch (cause) {
    if (cause?.code === DATA_DIRECTORY_ENTRY_CONFLICT_ERROR_CODE) throw cause;
    throw dataDirectoryOwnershipError(requested, cause,
      DATA_DIRECTORY_OWNER_UNAVAILABLE_ERROR_CODE);
  }
  const canonicalDataDir = path.join(realParent, leafName);
  const digest = createHash('sha256').update(canonicalDataDir).digest('hex');
  return Object.freeze({canonicalDataDir, leafName, realParent,
    rendezvousPath: path.join(realParent,
      `${DATA_DIRECTORY_RENDEZVOUS_PREFIX}${digest}.sqlite`)});
}

function pathExists(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function acquireDataDirectoryProcessOwner(dataDir) {
  const leaf = resolveLeaf(dataDir);
  const {canonicalDataDir, realParent, rendezvousPath} = leaf;
  let rendezvous = null;
  let database = null;
  let created = false;
  try {
    const existedInitially = pathExists(canonicalDataDir);
    if (!existedInitially || pathExists(rendezvousPath)) {
      rendezvous = openExclusiveDatabase(rendezvousPath, canonicalDataDir);
    }
    if (!pathExists(canonicalDataDir)) {
      if (!rendezvous) {
        rendezvous = openExclusiveDatabase(rendezvousPath, canonicalDataDir);
      }
      fs.mkdirSync(canonicalDataDir, {recursive: false, mode: 0o700});
      fsyncDirectory(realParent);
      created = true;
    }
    const firstIdentity = requireOrdinaryDirectory(canonicalDataDir,
      canonicalDataDir);
    const lockPath = path.join(canonicalDataDir, DATA_DIRECTORY_OWNER_DB);
    database = openExclusiveDatabase(lockPath, canonicalDataDir);
    const secondIdentity = requireOrdinaryDirectory(canonicalDataDir,
      canonicalDataDir);
    if (firstIdentity.dev !== secondIdentity.dev ||
        firstIdentity.ino !== secondIdentity.ino) {
      throw dataDirectoryOwnershipError(canonicalDataDir, null,
        DATA_DIRECTORY_ENTRY_CONFLICT_ERROR_CODE);
    }
    if (!rendezvous && pathExists(rendezvousPath)) {
      releaseDatabase(database);
      database = null;
      return acquireDataDirectoryProcessOwner(canonicalDataDir);
    }
    const markerPath = path.join(canonicalDataDir,
      DATA_DIRECTORY_BIRTH_MARKER);
    const birthMarker = created ?
      writeBirthMarker(markerPath, canonicalDataDir) :
      readBirthMarker(markerPath, canonicalDataDir);
    releaseDatabase(rendezvous);
    rendezvous = null;
    let released = false;
    const owner = Object.freeze({
      dataDir: canonicalDataDir,
      lockPath,
      release() {
        if (released) return;
        released = true;
        OWNER_STATE.delete(owner);
        releaseDatabase(database);
        database = null;
      },
    });
    OWNER_STATE.set(owner, Object.freeze({
      authorityId: birthMarker?.authorityId ?? null,
      canonicalDataDir,
      createdAndOwned: created,
      device: secondIdentity.dev,
      inode: secondIdentity.ino,
      owner,
    }));
    return owner;
  } catch (cause) {
    releaseDatabase(database);
    releaseDatabase(rendezvous);
    if (cause?.code === DATA_DIRECTORY_OWNER_ERROR_CODE ||
        cause?.code === DATA_DIRECTORY_OWNER_UNAVAILABLE_ERROR_CODE ||
        cause?.code === DATA_DIRECTORY_ENTRY_CONFLICT_ERROR_CODE) throw cause;
    throw dataDirectoryOwnershipError(canonicalDataDir, cause,
      DATA_DIRECTORY_OWNER_UNAVAILABLE_ERROR_CODE);
  }
}

function readDataDirectoryProcessOwnerEvidence(owner, dataDir) {
  const state = OWNER_STATE.get(owner);
  if (!state || state.owner !== owner ||
      typeof dataDir !== 'string' || dataDir.length === 0) return null;
  const canonical = fs.realpathSync.native(path.resolve(dataDir));
  if (canonical !== state.canonicalDataDir) return null;
  const stat = requireOrdinaryDirectory(canonical, canonical);
  if (stat.dev !== state.device || stat.ino !== state.inode) return null;
  return Object.freeze({
    authorityId: state.authorityId,
    canonicalDataDir: state.canonicalDataDir,
    createdAndOwned: state.createdAndOwned,
    device: state.device,
    inode: state.inode,
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
  DATA_DIRECTORY_OWNER_UNAVAILABLE_ERROR_CODE,
  acquireDataDirectoryProcessOwner,
  bindDataDirectoryProcessOwner,
  readDataDirectoryProcessOwnerEvidence,
};
