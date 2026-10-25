// Filesystem answers supplied to the real cycle analyzer/resolver. These facts
// are replayed without parsing imports or running a second resolution policy.
import fs from 'node:fs';
import path from 'node:path';
import {metricDigest} from './metric-report-inputs.js';

const MISSING = new Set(['ENOENT', 'ENOTDIR']);
const FILE = 'file';
const DIRECTORY = 'directory';
const ABSENT = 'absent';
const UNSUPPORTED = 'unsupported';
const KIND = 'kind';
const CONTENT = 'content';
const REALPATH = 'realpath';
const UTF8 = 'utf8';

function filesystemKind(stat) {
  if (stat.isFile()) return FILE;
  if (stat.isDirectory()) return DIRECTORY;
  return UNSUPPORTED;
}

function pathState(filename) {
  let stat;
  try {
    stat = fs.statSync(filename);
  } catch (error) {
    if (MISSING.has(error.code)) return {kind: ABSENT};
    throw error;
  }
  const realpath = fs.realpathSync(filename);
  const kind = filesystemKind(stat);
  if (kind === UNSUPPORTED) throw new Error(`unbound cycle input object: ${filename}`);
  return {kind, realpath};
}

function contentDigest(value) {
  return metricDigest(Buffer.isBuffer(value) ? value : Buffer.from(value, UTF8));
}

function currentFact(entry) {
  switch (entry.operation) {
  case KIND: return pathState(entry.path);
  case CONTENT: return contentDigest(fs.readFileSync(entry.path, entry.encoding));
  case REALPATH: {
    const state = pathState(entry.path);
    return state.kind === ABSENT ? entry.path : state.realpath;
  }
  default: throw new Error(`unbound cycle input operation: ${entry.operation}`);
  }
}

export function createCycleInputFacts(root) {
  const facts = new Map();
  const reads = new Set();
  let failure;
  function record(operation, filename, result, encoding = null) {
    const absolute = path.resolve(filename);
    const entry = {operation, path: absolute, encoding, result};
    const key = JSON.stringify([operation, absolute, encoding]);
    const previous = facts.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) {
      failure = new Error(`cycle input changed during analysis: ${absolute}`);
    }
    facts.set(key, entry);
    return result;
  }
  function guarded(operation) {
    try {
      return operation();
    } catch (error) {
      failure = error;
      throw error;
    }
  }
  const kind = (filename) => guarded(() => record(KIND, filename, pathState(filename)));
  const fileSystem = {
    readFileSync(filename, encoding = null) {
      return guarded(() => {
        kind(filename);
        const value = fs.readFileSync(filename, encoding);
        record(CONTENT, filename, contentDigest(value), encoding);
        reads.add(path.resolve(filename));
        return value;
      });
    },
    isFile: (filename) => kind(filename).kind === FILE,
    isDirectory: (filename) => kind(filename).kind === DIRECTORY,
    realpathSync(filename) {
      const state = kind(filename);
      return record(REALPATH, filename, state.kind === ABSENT ? filename : state.realpath);
    },
  };
  return {
    fileSystem, kind, reads,
    fail(error) {
      failure = error;
    },
    finish() {
      if (failure) throw failure;
      return {root: fs.realpathSync(root), facts: [...facts.values()]};
    },
  };
}

export function cycleInputsAreCurrent(root, inputs) {
  if (inputs?.root !== fs.realpathSync(root) || !Array.isArray(inputs.facts) ||
      inputs.facts.length === 0) return false;
  return inputs.facts.every((entry) => {
    try {
      return JSON.stringify(currentFact(entry)) === JSON.stringify(entry.result);
    } catch (error) {
      if (MISSING.has(error.code)) return false;
      throw error;
    }
  });
}
