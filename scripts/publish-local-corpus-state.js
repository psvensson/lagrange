// The publication owner's finite state history. A complete immutable successor
// occupies one predecessor-specific slot; link is the no-replace commit point.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual, TextDecoder} from 'node:util';
import {FILE_ALREADY_EXISTS, FILE_NOT_FOUND, NEWLINE, UTF8}
  from './publish-execution-constants.js';

export const LOCAL_CORPUS_STATE = Object.freeze({
  STARTING: 'starting', RUNNING: 'running', GREEN: 'green', RED: 'red', LOST: 'lost',
});
export const LOCAL_CORPUS_TRANSITION = Object.freeze({
  APPLIED: 'APPLIED', CURRENT_CHANGED: 'CURRENT_CHANGED',
  RECORD_UNAVAILABLE: 'RECORD_UNAVAILABLE', STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
  LINK_EFFECT_UNAVAILABLE: 'LINK_EFFECT_UNAVAILABLE',
  LINKED_DURABILITY_UNAVAILABLE: 'LINKED_DURABILITY_UNAVAILABLE',
  APPLIED_CLEANUP_UNAVAILABLE: 'APPLIED_CLEANUP_UNAVAILABLE',
});
const STATE_SUFFIX = '.json';
const BASE_NAME = /^([0-9a-f]{40})\.json$/u;
const SUCCESSOR_NAME = /^([0-9a-f]{40})\.from-([0-9a-f]{64})\.json$/u;
const SUCCESSOR_SCHEMA = 'lagrange-local-corpus-transition/v1';
const SUCCESSOR_PART = '.from-';
const MAX_SUCCESSORS = 2;
const RETAINED_TERMINAL = 'superseded';
const TERMINALS = new Set([LOCAL_CORPUS_STATE.GREEN, LOCAL_CORPUS_STATE.RED,
  LOCAL_CORPUS_STATE.LOST, RETAINED_TERMINAL]);
const STATES = new Set([...Object.values(LOCAL_CORPUS_STATE), RETAINED_TERMINAL]);
const RESULT_FIELDS = new Set(['state', 'status', 'reason', 'finishedAt', 'receipt']);
const ENVELOPE_FIELDS = ['predecessor', 'record', 'schema'];
const STAGING_PREFIX = '.corpus-transition-';
const STAGED_RECORD = 'record.json';
const STAGED_METADATA = 'proposal.json';
const PROPOSAL_SCHEMA = 'lagrange-local-corpus-proposal/v1';
const decoder = new TextDecoder(UTF8, {fatal: true, ignoreBOM: true});
const snapshots = new WeakMap();

function failure(code, destination, cause, proposalPath = null) {
  const error = new Error(`publish: local corpus ${code}: ${destination}` +
    `${proposalPath ? `; retained proposal ${proposalPath}` : ''}`, {cause});
  Object.assign(error, {code, destination, proposalPath});
  return error;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateRecord(record, sha, file) {
  if (!object(record) || record.sha !== sha || !STATES.has(record.state)) {
    throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, file);
  }
}

function validateSuccessor(before, after, file) {
  validateRecord(after, before.sha, file);
  const claiming = before.state === LOCAL_CORPUS_STATE.STARTING &&
    after.state === LOCAL_CORPUS_STATE.RUNNING;
  const losingStart = before.state === LOCAL_CORPUS_STATE.STARTING &&
    after.state === LOCAL_CORPUS_STATE.LOST;
  const finishing = before.state === LOCAL_CORPUS_STATE.RUNNING &&
    [LOCAL_CORPUS_STATE.GREEN, LOCAL_CORPUS_STATE.RED, LOCAL_CORPUS_STATE.LOST]
      .includes(after.state);
  if (!(claiming || losingStart || finishing) ||
      (claiming && (!Number.isSafeInteger(after.pid) || after.pid <= 0))) {
    throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, file);
  }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const mutable = claiming ? key === 'state' || key === 'pid' : RESULT_FIELDS.has(key);
    if (!mutable && (!isDeepStrictEqual(before[key], after[key]) ||
        Object.hasOwn(before, key) !== Object.hasOwn(after, key))) {
      throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, file);
    }
  }
}

function readBytes(file, optional = false) {
  try {
    return fs.readFileSync(file);
  } catch (error) {
    if (optional && error.code === FILE_NOT_FOUND) return null;
    throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, file, error);
  }
}

function decode(bytes, file) {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch (error) {
    throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, file, error);
  }
}

function successorPath(stateDir, sha, predecessor) {
  return path.join(stateDir, `${sha}${SUCCESSOR_PART}${predecessor}${STATE_SUFFIX}`);
}

function readSnapshot(stateDir, sha) {
  const basePath = path.join(stateDir, sha + STATE_SUFFIX);
  const baseBytes = readBytes(basePath);
  let bytes = baseBytes;
  let record = decode(bytes, basePath);
  validateRecord(record, sha, basePath);
  const visited = new Set([basePath]);
  for (let depth = 0; depth <= MAX_SUCCESSORS; depth += 1) {
    const predecessor = digest(bytes);
    const file = successorPath(stateDir, sha, predecessor);
    const next = readBytes(file, true);
    if (next === null) {
      const result = Object.freeze(record);
      snapshots.set(result, {basePath, baseBytes, predecessor, file, visited,
        recordBytes: JSON.stringify(record)});
      return result;
    }
    if (depth === MAX_SUCCESSORS || TERMINALS.has(record.state)) {
      throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, file);
    }
    const envelope = decode(next, file);
    if (!object(envelope) || envelope.schema !== SUCCESSOR_SCHEMA ||
        envelope.predecessor !== predecessor ||
        !isDeepStrictEqual(Object.keys(envelope).sort(), ENVELOPE_FIELDS)) {
      throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, file);
    }
    validateSuccessor(record, envelope.record, file);
    visited.add(file);
    record = envelope.record;
    bytes = next;
  }
  throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, basePath);
}

/** Read the owner's logical current states, including retained terminal history. */
export function readLocalCorpusRecords(stateDir,
  {write = (line) => process.stderr.write(line + NEWLINE)} = {}) {
  let names;
  try {
    names = fs.readdirSync(stateDir);
  } catch (error) {
    if (error.code === FILE_NOT_FOUND) return [];
    throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, stateDir, error);
  }
  const records = new Map();
  for (const name of names) {
    if (name.startsWith(STAGING_PREFIX)) reportProposal(path.join(stateDir, name), write);
    const match = BASE_NAME.exec(name);
    if (match) records.set(match[1], readSnapshot(stateDir, match[1]));
  }
  // readdir is not a snapshot: a listed successor may have arrived after a
  // first read. Directly follow its finite chain before declaring it orphaned.
  for (const name of names) {
    const match = SUCCESSOR_NAME.exec(name);
    if (!match) continue;
    const file = path.join(stateDir, name);
    let record = records.get(match[1]);
    if (!record || !snapshots.get(record).visited.has(file)) {
      record = readSnapshot(stateDir, match[1]);
      records.set(match[1], record);
    }
    if (!snapshots.get(record).visited.has(file)) {
      throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, file);
    }
  }
  return [...records.values()].sort((left, right) =>
    (right.startedAt || 0) - (left.startedAt || 0));
}

// Discovery reports retained evidence without treating a private file as a
// committed state, replaying it, or making its availability a transition veto.
function reportProposal(directory, write) {
  let detail;
  try {
    const bytes = readBytes(path.join(directory, STAGED_RECORD));
    const metadata = decode(readBytes(path.join(directory, STAGED_METADATA)), directory);
    decode(bytes, directory);
    if (!object(metadata) || metadata.schema !== PROPOSAL_SCHEMA ||
        metadata.sha256 !== digest(bytes) || typeof metadata.destination !== 'string' ||
        !Number.isSafeInteger(metadata.writerPid) || metadata.writerPid <= 0) {
      throw new Error('incomplete or inconsistent proposal metadata');
    }
    detail = `complete proposal for ${metadata.destination}`;
  } catch (error) {
    detail = `partial or unavailable proposal: ${error.message}`;
  }
  write(`publish: local corpus retained private evidence ${directory}: ${detail}; ` +
    'private evidence is not current-state authority');
}

function syncDirectory(directory) {
  const descriptor = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function stageRecord(stateDir, bytes, destination) {
  let directory;
  let file;
  try {
    directory = fs.mkdtempSync(path.join(stateDir, STAGING_PREFIX));
    file = path.join(directory, STAGED_RECORD);
    const descriptor = fs.openSync(file, 'wx');
    try {
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    const metadata = fs.openSync(path.join(directory, STAGED_METADATA), 'wx');
    try {
      fs.writeFileSync(metadata, JSON.stringify({schema: PROPOSAL_SCHEMA,
        destination: path.basename(destination), writerPid: process.pid,
        sha256: digest(bytes)}) + NEWLINE);
      fs.fsyncSync(metadata);
    } finally {
      fs.closeSync(metadata);
    }
    syncDirectory(directory);
    syncDirectory(stateDir);
    return {directory, file};
  } catch (error) {
    throw failure(LOCAL_CORPUS_TRANSITION.STORAGE_UNAVAILABLE, destination, error,
      file || directory);
  }
}

function publishRecord(stateDir, destination, bytes) {
  const staged = stageRecord(stateDir, bytes, destination);
  try {
    fs.linkSync(staged.file, destination);
  } catch (error) {
    if (error.code === FILE_ALREADY_EXISTS) {
      return {outcome: LOCAL_CORPUS_TRANSITION.CURRENT_CHANGED,
        proposalPath: staged.file, destination};
    }
    throw failure(LOCAL_CORPUS_TRANSITION.LINK_EFFECT_UNAVAILABLE,
      destination, error, staged.file);
  }
  try {
    syncDirectory(stateDir);
  } catch (error) {
    throw failure(LOCAL_CORPUS_TRANSITION.LINKED_DURABILITY_UNAVAILABLE,
      destination, error, staged.file);
  }
  try {
    fs.unlinkSync(staged.file);
    fs.unlinkSync(path.join(staged.directory, STAGED_METADATA));
    fs.rmdirSync(staged.directory);
  } catch (error) {
    throw failure(LOCAL_CORPUS_TRANSITION.APPLIED_CLEANUP_UNAVAILABLE,
      destination, error, staged.file);
  }
  return {outcome: LOCAL_CORPUS_TRANSITION.APPLIED, destination, proposalPath: null};
}

/** Atomically acquire the starting obligation before companions or child spawn. */
export function createLocalCorpusState(stateDir, state) {
  const destination = path.join(stateDir, state.sha + STATE_SUFFIX);
  validateRecord(state, state.sha, destination);
  if (state.state !== LOCAL_CORPUS_STATE.STARTING || !BASE_NAME.test(state.sha + STATE_SUFFIX)) {
    throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, destination);
  }
  let names;
  try {
    const created = fs.mkdirSync(stateDir, {recursive: true});
    if (created) {
      const firstCreated = path.resolve(created);
      let directory = path.resolve(stateDir);
      while (directory !== firstCreated) {
        syncDirectory(directory);
        directory = path.dirname(directory);
      }
      syncDirectory(firstCreated);
      syncDirectory(path.dirname(firstCreated));
    }
    names = fs.readdirSync(stateDir);
  } catch (error) {
    throw failure(LOCAL_CORPUS_TRANSITION.STORAGE_UNAVAILABLE, destination, error);
  }
  if (names.some((name) => SUCCESSOR_NAME.exec(name)?.[1] === state.sha)) {
    // Existing successors must belong to an intact admitted chain. An orphan
    // is not a free SHA; an intact chain will lose the no-replace base claim.
    readLocalCorpusRecords(stateDir);
  }
  const result = publishRecord(stateDir, destination, JSON.stringify(state) + NEWLINE);
  return {...result, record: readSnapshot(stateDir, state.sha)};
}

/** Consume an owner-issued immutable snapshot; never rebase a losing transition. */
export function transitionLocalCorpusState(stateDir, before, after) {
  const snapshot = snapshots.get(before);
  if (!snapshot || snapshot.basePath !== path.join(stateDir, before.sha + STATE_SUFFIX)) {
    throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, stateDir);
  }
  const original = JSON.parse(snapshot.recordBytes);
  validateSuccessor(original, after, snapshot.file);
  if (after.state === LOCAL_CORPUS_STATE.RUNNING && after.pid !== process.pid) {
    throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, snapshot.file);
  }
  if (!readBytes(snapshot.basePath).equals(snapshot.baseBytes)) {
    throw failure(LOCAL_CORPUS_TRANSITION.RECORD_UNAVAILABLE, snapshot.basePath);
  }
  const envelope = {schema: SUCCESSOR_SCHEMA, predecessor: snapshot.predecessor, record: after};
  const result = publishRecord(stateDir, snapshot.file, JSON.stringify(envelope) + NEWLINE);
  return {...result, record: readSnapshot(stateDir, before.sha)};
}
