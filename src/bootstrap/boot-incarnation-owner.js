import fs from 'node:fs';
import path from 'node:path';

import {
  exactKeys,
  readCanonicalJson,
  writeAtomicDurable,
} from '../runtime/oci-host-agent-durable-files.js';
import {isIssuedBootIncarnation} from './boot-incarnation-contract.js';

/**
 * The boot incarnation owner (invariant I9, owner decision F1): one durable,
 * monotonic counter per data directory. Once a data directory has issued
 * boot incarnation N it never issues N or anything smaller again, whatever
 * happens afterwards (failed join, crash, hints rewrite, rejoin).
 *
 * Reserve before use: read the persisted reservation, derive N+1, durably
 * replace the reservation with N+1 (the repository's durable atomic
 * replacement: fsync the temporary file, rename, fsync the directory), and
 * only then hand N+1 to the boot lifecycle. A crash after the replacement
 * burns N+1; a crash can never cause reuse.
 *
 * One reservation per boot lifecycle (process start, or a new join attempt
 * after the previous one was abandoned), never per RPC retry.
 *
 * Single writer: every issuance (reservation and floor raise) of one data
 * directory runs through one in-process queue keyed by the canonical
 * identity of its state file, so concurrent in-process callers (an embedder
 * of the public export included) never read the same reservation and never
 * lose a raise. Across processes the runtime holds the data directory
 * process owner (storage/data-directory-process-owner.js) for its whole
 * life; this owner does not acquire it, so two processes that both bypass
 * the runtime and reserve on one data directory are not excluded here.
 *
 * The rejoin hints document is only a projection of the reservation; the
 * owner's own reservation file is the sole authority for boot incarnation
 * issuance, and hints never gate, raise or lower issuance.
 */
const BOOT_INCARNATION_FILENAME = 'boot-incarnation.json';
const BOOT_INCARNATION_STATE_VERSION = 1;
const BOOT_INCARNATION_STATE_FIELDS = Object.freeze(['version', 'reserved']);
const BOOT_INCARNATION_INCREMENT = 1;
const BOOT_INCARNATION_ERROR_CODE = Object.freeze({
  DATA_DIR_REQUIRED: 'BOOT_INCARNATION_DATA_DIR_REQUIRED',
  STATE_UNREADABLE: 'BOOT_INCARNATION_STATE_UNREADABLE',
});
const FILE_NOT_FOUND_ERROR = 'ENOENT';
const DATA_DIRECTORY_OWNER_DB_PREFIX = '.lagrange-data-directory-owner.sqlite';
const TRANSIENT_FILE_SUFFIXES = Object.freeze(['.tmp', '.lock']);
const TRANSIENT_EXACT_NAMES = Object.freeze(new Set(['.write-test']));
// "This data directory has issued nothing yet": a count, never an
// incarnation handed to a lifecycle.
const NOTHING_ISSUED = 0;

function bootIncarnationError(code, cause = null) {
  const error = new Error(`Boot incarnation owner: ${code}`);
  error.code = code;
  error.errorCode = code;
  if (cause) error.cause = cause;
  return error;
}

function resolveBootIncarnationPath(dataDir) {
  if (typeof dataDir !== 'string' || dataDir.trim().length === 0) {
    throw bootIncarnationError(BOOT_INCARNATION_ERROR_CODE.DATA_DIR_REQUIRED);
  }
  return path.join(dataDir.trim(), BOOT_INCARNATION_FILENAME);
}

// The canonical identity of a data directory's state file: symlinked or
// relative spellings of one directory share one issuance queue. A directory
// that does not exist yet has no aliases; its lexical absolute path is its
// identity (the durable write then fails on it).
function canonicalStateFileIdentity(file) {
  const directory = path.resolve(path.dirname(file));
  try {
    return path.join(fs.realpathSync.native(directory),
      BOOT_INCARNATION_FILENAME);
  } catch (error) {
    if (error?.code === FILE_NOT_FOUND_ERROR) {
      return path.join(directory, BOOT_INCARNATION_FILENAME);
    }
    throw bootIncarnationError(
      BOOT_INCARNATION_ERROR_CODE.STATE_UNREADABLE, error);
  }
}

// One issuance queue per canonical state file. The read-derive-write of a
// reservation or a floor raise awaits between its read and its write, so
// every issuance path runs strictly after the previous one of the same data
// directory settled (fulfilled or refused). The entry is dropped when its
// tail settles, so the map holds only data directories with work in flight.
const issuanceQueues = new Map();

function settleQuietly() {}

function serializeIssuance(file, issue) {
  const identity = canonicalStateFileIdentity(file);
  const previous = issuanceQueues.get(identity) ?? Promise.resolve();
  const issued = previous.then(issue);
  const tail = issued.then(settleQuietly, settleQuietly);
  issuanceQueues.set(identity, tail);
  tail.then(() => {
    if (issuanceQueues.get(identity) === tail) issuanceQueues.delete(identity);
  });
  return issued;
}

function stateFileExists(file) {
  try {
    fs.lstatSync(file);
    return true;
  } catch (error) {
    if (error?.code === FILE_NOT_FOUND_ERROR) return false;
    throw bootIncarnationError(
      BOOT_INCARNATION_ERROR_CODE.STATE_UNREADABLE, error);
  }
}

// The owner's own reservation; absent -> 0. A present but unreadable or
// malformed state fails closed: it is never collapsed to "fresh".
function readOwnedReservationState(file) {
  try {
    return readCanonicalJson(file,
      BOOT_INCARNATION_ERROR_CODE.STATE_UNREADABLE);
  } catch (error) {
    throw bootIncarnationError(
      BOOT_INCARNATION_ERROR_CODE.STATE_UNREADABLE, error);
  }
}

function readOwnedReservation(file) {
  const state = readOwnedReservationState(file);
  if (!exactKeys(state, BOOT_INCARNATION_STATE_FIELDS) ||
      state.version !== BOOT_INCARNATION_STATE_VERSION ||
      !isIssuedBootIncarnation(state.reserved)) {
    throw bootIncarnationError(BOOT_INCARNATION_ERROR_CODE.STATE_UNREADABLE);
  }
  return state.reserved;
}

function isTransientDataDirEntry(entryName) {
  if (entryName === DATA_DIRECTORY_OWNER_DB_PREFIX ||
      entryName.startsWith(`${DATA_DIRECTORY_OWNER_DB_PREFIX}-`)) {
    return true;
  }
  if (TRANSIENT_EXACT_NAMES.has(entryName)) {
    return true;
  }
  return TRANSIENT_FILE_SUFFIXES.some((suffix) => entryName.endsWith(suffix));
}

function hasPriorDurableEvidence(dataDir) {
  const directory = path.resolve(dataDir.trim());
  let entries;
  try {
    entries = fs.readdirSync(directory);
  } catch (error) {
    if (error?.code === FILE_NOT_FOUND_ERROR) return false;
    throw bootIncarnationError(
      BOOT_INCARNATION_ERROR_CODE.STATE_UNREADABLE, error);
  }
  return entries.some(
    (entry) => entry !== BOOT_INCARNATION_FILENAME && !isTransientDataDirEntry(entry),
  );
}

/**
 * The highest boot incarnation this data directory has ever issued (0 when
 * it never issued one).
 * @param {string} dataDir
 * @return {Promise<number>}
 */
async function readIssuedBootIncarnation(dataDir) {
  const file = resolveBootIncarnationPath(dataDir);
  // The owner's reservation file is the sole authority: absent in a virgin
  // directory means nothing issued yet (0); absent in a directory that already
  // holds prior durable state, or present but damaged, fails closed.
  if (stateFileExists(file)) {
    return readOwnedReservation(file);
  }
  if (hasPriorDurableEvidence(dataDir)) {
    throw bootIncarnationError(BOOT_INCARNATION_ERROR_CODE.STATE_UNREADABLE);
  }
  return NOTHING_ISSUED;
}

/**
 * Reserve the next boot incarnation for one new boot lifecycle: durably
 * persisted before it is returned.
 * @param {string} dataDir
 * @param {Object} [hooks] - Test seam: afterFileSync / afterDirectorySync.
 * @return {Promise<number>} The reserved incarnation (>= 1).
 */
async function reserveBootIncarnation(dataDir, hooks = {}) {
  const file = resolveBootIncarnationPath(dataDir);
  return serializeIssuance(file, async () => {
    const reserved = await readIssuedBootIncarnation(dataDir) +
      BOOT_INCARNATION_INCREMENT;
    writeAtomicDurable(file, {
      reserved,
      version: BOOT_INCARNATION_STATE_VERSION,
    }, hooks);
    return reserved;
  });
}

/**
 * Record that the cluster already holds `floor` for this node (a newer
 * incarnation superseded this lifecycle's registration). Durably raises the
 * reservation so the NEXT boot lifecycle reserves above it; it issues no
 * incarnation itself and never lowers the reservation.
 * @param {string} dataDir
 * @param {number} floor - The authoritative NODES incarnation observed.
 * @return {Promise<number>} The reservation after the raise.
 */
async function raiseBootIncarnationFloor(dataDir, floor) {
  const file = resolveBootIncarnationPath(dataDir);
  return serializeIssuance(file, async () => {
    const issued = await readIssuedBootIncarnation(dataDir);
    if (!isIssuedBootIncarnation(floor) || floor <= issued) return issued;
    writeAtomicDurable(file, {
      reserved: floor,
      version: BOOT_INCARNATION_STATE_VERSION,
    });
    return floor;
  });
}

export {
  BOOT_INCARNATION_FILENAME,
  raiseBootIncarnationFloor,
  readIssuedBootIncarnation,
  reserveBootIncarnation,
};
