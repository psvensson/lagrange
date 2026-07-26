// Raft snapshot generation retention (quest raft-snapshot-retention-compaction,
// spec solve/specs/raft-snapshot-transfer-install/retention-compaction-design.md,
// S5/R4). Owns the bounded-count sweep over sealed checkpoint generations and
// the pin extraction from the durable install/transfer markers. Retention
// policy constants live HERE: the protocol surfaces (compaction, transfer,
// install) take only explicit indexes and durable proof — policy never leaks
// into protocol semantics (epic open question 3, resolved).
//
// Single-process ownership assumption (documented, R4): one process owns a
// checkpointsRoot at a time, so the sweep and the receiver publish path are
// same-process and the transfer-marker GC exception below is race-free. A
// cross-process sweep would be TOCTOU-unsafe and is out of contract.

import fs from 'node:fs';
import path from 'node:path';

import {
  RAFT_CHECKPOINT_DESCRIPTOR_FILE,
  RAFT_CHECKPOINT_PAYLOAD_FILE,
} from './snapshot-checkpoint-constants.js';
import {
  RAFT_SNAPSHOT_INSTALL_DIRNAME,
  RAFT_SNAPSHOT_INSTALL_MARKER_FILE,
  RAFT_SNAPSHOT_INSTALL_STATE,
} from './snapshot-install-constants.js';
import {
  RAFT_SNAPSHOT_TRANSFER_DIRNAME,
  RAFT_SNAPSHOT_TRANSFER_PROGRESS_MARKER_FILE,
} from './snapshot-transfer-constants.js';

// Bounded retention: how many newest complete generations survive an
// unpinned sweep (R4 default). The newest complete generation additionally
// NEVER goes away, even when this count is configured to zero — it is the
// sole recovery source for an admitted transfer.
const RAFT_SNAPSHOT_RETAINED_GENERATION_COUNT = 2;

// Sentinel for "no complete generation exists" in the typed report — index 0
// is never a generation name (generations are named by lastIncludedIndex > 0
// in practice, and 0 is the virgin marker everywhere else in this protocol).
const NO_GENERATION_INDEX = 0;

const DECIMAL_RADIX = 10;
const UTF8 = 'utf8';

// Install-marker states that pin their generation (an active install). A
// REJECTED marker is not an active install per R4 and does NOT pin — its
// generation stays protected only by the newest/bounded rules.
const PINNING_INSTALL_STATES = Object.freeze([
  RAFT_SNAPSHOT_INSTALL_STATE.STAGING,
  RAFT_SNAPSHOT_INSTALL_STATE.STAGED,
  RAFT_SNAPSHOT_INSTALL_STATE.INSTALLED,
]);

function parseGenerationDirName(name) {
  const index = Number.parseInt(name, DECIMAL_RADIX);
  return Number.isSafeInteger(index) && index >= 0 && name === String(index) ?
    index :
    null;
}

function listNumericDirectories(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs.readdirSync(root, {withFileTypes: true})
    .filter((entry) => entry.isDirectory())
    .map((entry) => parseGenerationDirName(entry.name))
    .filter((index) => index !== null)
    .sort((left, right) => left - right);
}

/**
 * List sealed checkpoint generations (ascending lastIncludedIndex) under a
 * checkpoint root. Staging and non-generation entries are ignored. Note this
 * is a NAME listing: completeness (descriptor presence) is re-checked per
 * candidate by consumers that need it (S1 publication-token semantics).
 * @param {string} checkpointsRoot durable checkpoint root directory
 * @return {number[]} ascending generation indices
 */
function listCheckpointGenerations(checkpointsRoot) {
  return listNumericDirectories(checkpointsRoot);
}

function generationDirectory(checkpointsRoot, generationIndex) {
  return path.join(checkpointsRoot, String(generationIndex));
}

function hasGenerationDescriptor(checkpointsRoot, generationIndex) {
  return fs.existsSync(path.join(
    generationDirectory(checkpointsRoot, generationIndex),
    RAFT_CHECKPOINT_DESCRIPTOR_FILE));
}

// Descriptor-first deletion: the descriptor IS the publication token, so
// removing it FIRST makes a crash-interrupted removal read as a typed
// `partial`, never as a valid generation. Then the payload, then the dir.
function removeGenerationDirectory(generationDir) {
  fs.rmSync(
    path.join(generationDir, RAFT_CHECKPOINT_DESCRIPTOR_FILE), {force: true});
  fs.rmSync(
    path.join(generationDir, RAFT_CHECKPOINT_PAYLOAD_FILE), {force: true});
  fs.rmSync(generationDir, {recursive: true, force: true});
}

// S2 install-marker pin: the marker's generationIndex for the active-install
// states only. Unreadable/corrupt markers pin nothing — the newest/bounded
// rules still hold the recovery floor.
function readInstallMarkerPin(checkpointsRoot) {
  const markerFile = path.join(
    checkpointsRoot,
    RAFT_SNAPSHOT_INSTALL_DIRNAME,
    RAFT_SNAPSHOT_INSTALL_MARKER_FILE);
  try {
    if (!fs.existsSync(markerFile)) {
      return null;
    }
    const marker = JSON.parse(fs.readFileSync(markerFile, UTF8));
    const pinning = PINNING_INSTALL_STATES.includes(marker?.state);
    return pinning && Number.isSafeInteger(marker.generationIndex) ?
      marker.generationIndex :
      null;
  } catch (_error) {
    return null;
  }
}

// S3 transfer pins: every numeric transfer staging directory whose progress
// marker exists. Marker existence (not staged-payload existence) is the pin
// condition, so the receiver's publish window (payload renamed into the
// generation dir, descriptor not yet written) stays covered.
function readTransferMarkerPins(checkpointsRoot) {
  const transferRoot = path.join(
    checkpointsRoot, RAFT_SNAPSHOT_TRANSFER_DIRNAME);
  return listNumericDirectories(transferRoot).filter((index) =>
    fs.existsSync(path.join(
      transferRoot,
      String(index),
      RAFT_SNAPSHOT_TRANSFER_PROGRESS_MARKER_FILE)));
}

/**
 * Union of every retention pin for one checkpoints root: the durable install
 * marker (staging/staged/installed only), every durable transfer progress
 * marker, and the caller's in-process pins (the S4 dispatcher's in-flight
 * generation indexes). EVERY sweep invocation must receive this full set.
 * @param {Object} options pin sources
 * @param {string} options.checkpointsRoot durable checkpoint root directory
 * @param {number[]} [options.inProcessPins] in-process generation pins
 * @return {number[]} frozen ascending deduplicated pin indexes
 */
function gatherRetentionPins(options) {
  const pins = new Set();
  const installPin = readInstallMarkerPin(options.checkpointsRoot);
  if (installPin !== null) {
    pins.add(installPin);
  }
  for (const index of readTransferMarkerPins(options.checkpointsRoot)) {
    pins.add(index);
  }
  for (const index of options.inProcessPins ?? []) {
    if (Number.isSafeInteger(index)) {
      pins.add(index);
    }
  }
  return Object.freeze([...pins].sort((left, right) => left - right));
}

function resolveRetainedCount(retainedGenerationCount) {
  return Number.isSafeInteger(retainedGenerationCount) &&
    retainedGenerationCount >= 0 ?
    retainedGenerationCount :
    RAFT_SNAPSHOT_RETAINED_GENERATION_COUNT;
}

function sweepReport(facts) {
  return Object.freeze({
    kept: Object.freeze(facts.kept),
    removed: Object.freeze(facts.removed),
    pinnedKept: Object.freeze(facts.pinnedKept),
    soleSourceKept: facts.soleSourceKept,
    garbageCollected: Object.freeze(facts.garbageCollected),
  });
}

// GC half-removed (descriptor-less) numeric dirs, EXCEPT while a transfer
// marker for that index exists — the receiver's legitimate payload-only
// publish instant — or the index is explicitly pinned.
function collectGarbage(checkpointsRoot, partial, pinned, transferPins) {
  const garbageCollected = [];
  for (const index of partial) {
    if (transferPins.has(index) || pinned.has(index)) {
      continue;
    }
    removeGenerationDirectory(generationDirectory(checkpointsRoot, index));
    garbageCollected.push(index);
  }
  return garbageCollected;
}

/**
 * Sweep one checkpoints root down to the bounded generation count without
 * ever removing a pinned generation or the newest complete generation (the
 * sole recovery source — R4's floor holds even when every pin is forgotten).
 * Complete generations (descriptor present) are retention candidates;
 * descriptor-less numeric dirs are garbage-collected unless a transfer
 * marker for that index exists. Deletion is descriptor-first so a crash mid
 * removal always reads as a typed partial generation.
 * @param {Object} options sweep request
 * @param {string} options.checkpointsRoot durable checkpoint root directory
 * @param {number} [options.retainedGenerationCount] newest complete
 *   generations to keep (default RAFT_SNAPSHOT_RETAINED_GENERATION_COUNT)
 * @param {number[]} [options.pinnedGenerationIndexes] full pin set (see
 *   gatherRetentionPins — every invocation must receive it)
 * @return {Object} frozen typed report {kept, removed, pinnedKept,
 *   soleSourceKept, garbageCollected}; soleSourceKept names the newest
 *   complete generation (0 when none exists)
 */
function sweepCheckpointGenerations(options) {
  const {checkpointsRoot} = options;
  const retainedCount = resolveRetainedCount(options.retainedGenerationCount);
  const pinned = new Set(options.pinnedGenerationIndexes ?? []);
  const transferPins = new Set(readTransferMarkerPins(checkpointsRoot));
  const complete = [];
  const partial = [];
  for (const index of listCheckpointGenerations(checkpointsRoot)) {
    (hasGenerationDescriptor(checkpointsRoot, index) ? complete : partial)
      .push(index);
  }
  const garbageCollected = collectGarbage(
    checkpointsRoot, partial, pinned, transferPins);
  const soleSourceKept = complete.length > 0 ?
    complete[complete.length - 1] :
    NO_GENERATION_INDEX;
  const boundedKeep = new Set(
    complete.slice(Math.max(complete.length - retainedCount, 0)));
  const kept = [];
  const removed = [];
  const pinnedKept = [];
  for (const index of complete) {
    if (index === soleSourceKept || boundedKeep.has(index)) {
      kept.push(index);
      continue;
    }
    if (pinned.has(index)) {
      kept.push(index);
      pinnedKept.push(index);
      continue;
    }
    removeGenerationDirectory(generationDirectory(checkpointsRoot, index));
    removed.push(index);
  }
  return sweepReport(
    {kept, removed, pinnedKept, soleSourceKept, garbageCollected});
}

export {
  gatherRetentionPins,
  listCheckpointGenerations,
  RAFT_SNAPSHOT_RETAINED_GENERATION_COUNT,
  sweepCheckpointGenerations,
};
