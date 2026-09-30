import fs from 'node:fs';
import path from 'node:path';

import {
  exactKeys,
  readCanonicalJson,
  writeAtomicDurable,
} from '../runtime/oci-host-agent-durable-files.js';
import {readRejoinHintsOutcome} from './rejoin-hints-durable-evidence.js';
import {DURABLE_EVIDENCE_STATE} from './rejoin-hints-constants.js';
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
 * after the previous one was abandoned), never per RPC retry. The data
 * directory process owner guarantees a single writer.
 *
 * The rejoin hints document is only a projection of the reservation. The
 * counter it carried before this owner existed is read as a floor only while
 * no reservation exists (the one-time migration), so an upgraded data
 * directory continues above every incarnation it issued; once the
 * reservation is durable, the hints never gate, raise or lower issuance.
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
// "This data directory has issued nothing yet": a count, never an
// incarnation handed to a lifecycle.
const NOTHING_ISSUED = 0;
const HINTS_COUNTER_FIELD = 'bootIncarnation';

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

// The legacy floor carried by the rejoin hints (consulted only before the
// owner's reservation exists: the one-time migration), from the hints
// reader's typed outcome. ABSENT (no hints file, or hints written before incarnations
// existed and carrying no counter) is a real "issued nothing": floor 0.
// PRESENT but unreadable, unparseable, or carrying a counter the owner could
// not have issued fails closed: a damaged projection may hide an incarnation
// already issued, so it is never collapsed to "fresh".
async function readLegacyHintsFloor(dataDir) {
  const hintsRead = await readRejoinHintsOutcome(dataDir);
  if (hintsRead.state === DURABLE_EVIDENCE_STATE.MISSING) {
    return NOTHING_ISSUED;
  }
  if (hintsRead.state !== DURABLE_EVIDENCE_STATE.READABLE) {
    throw bootIncarnationError(BOOT_INCARNATION_ERROR_CODE.STATE_UNREADABLE);
  }
  return readHintsCounter(hintsRead.hints);
}

function readHintsCounter(hints) {
  if (!Object.prototype.hasOwnProperty.call(hints, HINTS_COUNTER_FIELD)) {
    return NOTHING_ISSUED;
  }
  if (!isIssuedBootIncarnation(hints[HINTS_COUNTER_FIELD])) {
    throw bootIncarnationError(BOOT_INCARNATION_ERROR_CODE.STATE_UNREADABLE);
  }
  return hints[HINTS_COUNTER_FIELD];
}

/**
 * The highest boot incarnation this data directory has ever issued (0 when
 * it never issued one).
 * @param {string} dataDir
 * @return {Promise<number>}
 */
async function readIssuedBootIncarnation(dataDir) {
  const file = resolveBootIncarnationPath(dataDir);
  // Once the owner's reservation exists it is the SOLE authority (a present
  // but damaged one fails closed, never falling back to the hints). Legacy
  // hints are a one-time migration source, read only while no reservation
  // has ever been durably created.
  return stateFileExists(file) ?
    readOwnedReservation(file) :
    readLegacyHintsFloor(dataDir);
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
  const reserved = await readIssuedBootIncarnation(dataDir) +
    BOOT_INCARNATION_INCREMENT;
  writeAtomicDurable(file, {
    reserved,
    version: BOOT_INCARNATION_STATE_VERSION,
  }, hooks);
  return reserved;
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
  const issued = await readIssuedBootIncarnation(dataDir);
  if (!isIssuedBootIncarnation(floor) || floor <= issued) return issued;
  writeAtomicDurable(file, {
    reserved: floor,
    version: BOOT_INCARNATION_STATE_VERSION,
  });
  return floor;
}

export {
  BOOT_INCARNATION_FILENAME,
  raiseBootIncarnationFloor,
  readIssuedBootIncarnation,
  reserveBootIncarnation,
};
