import {createHash, randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  canonicalizeOciHostAgentJson,
  parseExactOciHostAgentJson,
} from './oci-host-agent-json.js';
import {
  OCI_HOST_AGENT_DURABLE_ERROR,
  durableStateError,
} from './oci-host-agent-durable-errors.js';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const JSON_SUFFIX = '\n';
const HASH_ALGORITHM = 'sha256';
const LOCK_FILE = 'agent.lock';
const LOCK_VERSION = 1;
const LOCK_ATTEMPTS = 4;
const HEX_256_PATTERN = /^[0-9a-f]{64}$/u;
const OWNER_ID_PATTERN = /^[A-Za-z0-9._:-]+$/u;
const NO_FOLLOW = fs.constants.O_NOFOLLOW || 0;
const ENCODING_HEX = 'hex';
const MAXIMUM_OWNER_ID_BYTES = 255;
const PERMISSION_MASK = 0o777;
const LOCK_TOKEN_BYTES = 32;
const FILE_NOT_FOUND_ERROR = 'ENOENT';
const FILE_EXISTS_ERROR = 'EEXIST';
const PROCESS_PERMISSION_ERROR = 'EPERM';
const LOCK_FIELDS = Object.freeze(['version', 'pid', 'token']);

function sha256Digest(bytes) {
  return `sha256:${createHash(HASH_ALGORITHM).update(bytes).digest(ENCODING_HEX)}`;
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${canonicalizeOciHostAgentJson(value)}${JSON_SUFFIX}`);
}

function exactKeys(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return false;
  }
  const accepted = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((field) => Object.hasOwn(value, field)) &&
    keys.every((field) => accepted.has(field)) &&
    keys.length >= required.length;
}

function validHex256(value) {
  return typeof value === 'string' && HEX_256_PATTERN.test(value);
}

function validOwnerId(value) {
  return typeof value === 'string' && value.length > 0 &&
    Buffer.byteLength(value) <= MAXIMUM_OWNER_ID_BYTES &&
    OWNER_ID_PATTERN.test(value);
}

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function ensureDirectory(directory) {
  const existed = fs.existsSync(directory);
  fs.mkdirSync(directory, {recursive: true, mode: DIRECTORY_MODE});
  if (!existed) fs.chmodSync(directory, DIRECTORY_MODE);
}

function requireDirectoryStorage(directory, errorCode) {
  try {
    const metadata = fs.lstatSync(directory);
    if (!metadata.isDirectory() ||
        (metadata.mode & PERMISSION_MASK) !== DIRECTORY_MODE) {
      durableStateError(errorCode);
    }
  } catch (error) {
    if (error?.code === errorCode) throw error;
    durableStateError(errorCode);
  }
}

function requireFileStorage(file, errorCode) {
  try {
    const metadata = fs.lstatSync(file);
    if (!metadata.isFile() || (metadata.mode & PERMISSION_MASK) !== FILE_MODE) {
      durableStateError(errorCode);
    }
  } catch (error) {
    if (error?.code === errorCode) throw error;
    durableStateError(errorCode);
  }
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += fs.writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeExclusiveDurable(file, bytes) {
  const descriptor = fs.openSync(
    file,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY |
      NO_FOLLOW,
    FILE_MODE,
  );
  try {
    writeAll(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function appendDurable(file, bytes) {
  if (fs.existsSync(file)) {
    requireFileStorage(file, OCI_HOST_AGENT_DURABLE_ERROR.ENROLLMENT_UNAVAILABLE);
  }
  const descriptor = fs.openSync(
    file,
    fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_WRONLY |
      NO_FOLLOW,
    FILE_MODE,
  );
  try {
    writeAll(descriptor, bytes);
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fsyncDirectory(path.dirname(file));
}

function readCanonicalJson(file, errorCode) {
  try {
    requireFileStorage(file, errorCode);
    const bytes = fs.readFileSync(file);
    const value = parseExactOciHostAgentJson(bytes);
    if (!bytes.equals(canonicalJsonBytes(value))) durableStateError(errorCode);
    return value;
  } catch (error) {
    if (error?.code === errorCode) throw error;
    durableStateError(errorCode);
  }
}

// The one durable atomic replacement: write a fresh temporary file beside the
// target, fsync it, rename it over the target, fsync the directory. A crash
// leaves the old or the new bytes, never a torn file, and the new bytes
// survive power loss once this returns. The steps, the temporary naming, the
// open flags and the cleanup rule are defined once below and executed by two
// drivers: a synchronous one (bounded, boot-time and fault-injected callers)
// and an asynchronous one that never holds the event loop across the writes
// and fsyncs (recurring writers such as the rejoin hints).
const ATOMIC_TEMPORARY_FLAGS = fs.constants.O_CREAT | fs.constants.O_EXCL |
  fs.constants.O_WRONLY | NO_FOLLOW;
const ATOMIC_TEMPORARY_SUFFIX = '.tmp';
const ATOMIC_TEMPORARY_NONCE_BYTES = 12;

function atomicReplacementPaths(file) {
  const directory = path.dirname(file);
  const nonce = randomBytes(ATOMIC_TEMPORARY_NONCE_BYTES).toString(ENCODING_HEX);
  return {
    directory,
    temporary: path.join(directory,
      `.${path.basename(file)}.${process.pid}.${nonce}${ATOMIC_TEMPORARY_SUFFIX}`),
  };
}

// Cleanup rule: a temporary this writer created and did not rename is
// removed when a step fails; the target keeps its previous bytes.
function removeUnrenamedTemporarySync(temporary) {
  fs.rmSync(temporary, {force: true});
}

async function removeUnrenamedTemporary(temporary) {
  await fs.promises.rm(temporary, {force: true});
}

function writeAtomicDurable(file, value, hooks = {}) {
  writeAtomicDurableBytes(file, canonicalJsonBytes(value), hooks);
}

/**
 * Durably and atomically replace `file` with `bytes`, synchronously.
 * @param {string} file
 * @param {Buffer} bytes
 * @param {Object} [hooks] - Test seam: afterFileSync / afterDirectorySync
 *   (simulated process death: no cleanup runs for them).
 */
function writeAtomicDurableBytes(file, bytes, hooks = {}) {
  const {directory, temporary} = atomicReplacementPaths(file);
  const descriptor = fs.openSync(temporary, ATOMIC_TEMPORARY_FLAGS, FILE_MODE);
  try {
    try {
      writeAll(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch (error) {
    removeUnrenamedTemporarySync(temporary);
    throw error;
  }
  hooks.afterFileSync?.();
  try {
    fs.renameSync(temporary, file);
  } catch (error) {
    removeUnrenamedTemporarySync(temporary);
    throw error;
  }
  fsyncDirectory(directory);
  hooks.afterDirectorySync?.();
}

async function writeAllAsync(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const {bytesWritten} =
      await handle.write(bytes, offset, bytes.length - offset);
    offset += bytesWritten;
  }
}

async function fsyncDirectoryAsync(directory) {
  const handle = await fs.promises.open(directory, fs.constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Durably and atomically replace `file` with `bytes` without blocking the
 * event loop (same steps and guarantees as writeAtomicDurableBytes).
 * @param {string} file
 * @param {Buffer} bytes
 * @return {Promise<void>}
 */
async function writeAtomicDurableBytesAsync(file, bytes) {
  const {directory, temporary} = atomicReplacementPaths(file);
  const handle = await fs.promises.open(
    temporary, ATOMIC_TEMPORARY_FLAGS, FILE_MODE);
  try {
    try {
      await writeAllAsync(handle, bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.rename(temporary, file);
  } catch (error) {
    await removeUnrenamedTemporary(temporary);
    throw error;
  }
  await fsyncDirectoryAsync(directory);
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === PROCESS_PERMISSION_ERROR;
  }
}

function lockRecord(options) {
  return {
    version: LOCK_VERSION,
    pid: options.ownerPid || process.pid,
    token: options.token || randomBytes(LOCK_TOKEN_BYTES).toString(ENCODING_HEX),
  };
}

function validLockRecord(record) {
  return exactKeys(record, LOCK_FIELDS) &&
    record.version === LOCK_VERSION && safeInteger(record.pid, 1) &&
    validHex256(record.token);
}

function removeStaleLock(file) {
  try {
    fs.unlinkSync(file);
    fsyncDirectory(path.dirname(file));
  } catch (error) {
    if (error?.code !== FILE_NOT_FOUND_ERROR) {
      durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.LOCK_UNAVAILABLE);
    }
  }
}

function acquireDirectoryLock(root, options = {}) {
  const file = path.join(root, LOCK_FILE);
  const record = lockRecord(options);
  const alive = options.isProcessAlive || processIsAlive;
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      writeExclusiveDurable(file, canonicalJsonBytes(record));
      fsyncDirectory(root);
      let released = false;
      return {
        release() {
          if (released) return;
          const current = readCanonicalJson(
            file,
            OCI_HOST_AGENT_DURABLE_ERROR.LOCK_UNAVAILABLE,
          );
          if (!validLockRecord(current) || current.token !== record.token) {
            durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.LOCK_UNAVAILABLE);
          }
          removeStaleLock(file);
          released = true;
        },
      };
    } catch (error) {
      if (error?.code !== FILE_EXISTS_ERROR) {
        if (error?.code === OCI_HOST_AGENT_DURABLE_ERROR.LOCK_UNAVAILABLE) {
          throw error;
        }
        durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.LOCK_UNAVAILABLE);
      }
      const current = readCanonicalJson(
        file,
        OCI_HOST_AGENT_DURABLE_ERROR.LOCK_UNAVAILABLE,
      );
      if (!validLockRecord(current) || alive(current.pid)) {
        durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.LOCK_UNAVAILABLE);
      }
      removeStaleLock(file);
    }
  }
  durableStateError(OCI_HOST_AGENT_DURABLE_ERROR.LOCK_UNAVAILABLE);
}

export {
  LOCK_FILE,
  acquireDirectoryLock,
  appendDurable,
  canonicalJsonBytes,
  ensureDirectory,
  exactKeys,
  fsyncDirectory,
  readCanonicalJson,
  requireDirectoryStorage,
  requireFileStorage,
  safeInteger,
  sha256Digest,
  validHex256,
  validOwnerId,
  writeAtomicDurable,
  writeAtomicDurableBytesAsync,
  writeExclusiveDurable,
};
