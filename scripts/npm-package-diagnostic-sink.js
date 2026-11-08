import {closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync,
  writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';

import {OBSERVATION_EVENT, PACKAGE_ARTIFACT, SNAPSHOT_OUTCOME,
  PACKAGE_DIAGNOSTIC_DIRECTORY, PACKAGE_DIAGNOSTIC_FILES, TRACE_MAX_BYTES,
  SNAPSHOT_MAX_BYTES, TOTAL_MAX_BYTES} from './npm-package-diagnostic-constants.js';

const TERMINAL_RESERVE_BYTES = 4096;
const MISSING_FILE_CODE = 'ENOENT';
const CREATE_EXCLUSIVE_MODE = 'wx';
const SINK_ERROR = Object.freeze({
  EXISTING_DESTINATION: 'package diagnostic destination already exists',
  TRACE_BOUND_EXCEEDED: 'package diagnostic trace bound exceeded',
  UNDECLARED_SNAPSHOT: 'undeclared package snapshot',
});

function boundedFile(source) {
  const descriptor = openSync(source,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > SNAPSHOT_MAX_BYTES) {
      return {outcome: SNAPSHOT_OUTCOME.OVERSIZE_OR_NONFILE, bytes: 0};
    }
    return readRegularSnapshot(descriptor, stat.size);
  } finally {
    closeSync(descriptor);
  }
}

function readRegularSnapshot(descriptor, size) {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < bytes.length) {
    const count = readSync(descriptor, bytes, offset, bytes.length - offset, null);
    if (!count) return {outcome: SNAPSHOT_OUTCOME.SOURCE_CHANGED, bytes: 0};
    offset += count;
  }
  return fstatSync(descriptor).size !== size ?
    {outcome: SNAPSHOT_OUTCOME.SOURCE_CHANGED, bytes: 0} : {outcome: SNAPSHOT_OUTCOME.SAVED, bytes};
}

function packedBytes(source) {
  // Identity only: never serialize the unbounded pack entry list or tarball.
  for (const value of Object.values(source)) {
    if (typeof value !== 'string' || value.length > SNAPSHOT_MAX_BYTES) {
      return {outcome: SNAPSHOT_OUTCOME.INVALID_PACKED_IDENTITY, bytes: 0};
    }
  }
  const bytes = Buffer.from(`${JSON.stringify(source, null, 2)}\n`);
  return bytes.length > SNAPSHOT_MAX_BYTES ?
    {outcome: SNAPSHOT_OUTCOME.OVERSIZE_OR_NONFILE, bytes: 0} :
    {outcome: SNAPSHOT_OUTCOME.SAVED, bytes};
}

function createPackageDiagnosticSink(directory) {
  const started = performance.now();
  const sizes = new Map();
  let setupError;
  let traceDescriptor;
  try {
    mkdirSync(directory, {recursive: true});
    // A reused destination is incomplete; preserve earlier bytes for custody.
    for (const name of Object.values(PACKAGE_DIAGNOSTIC_FILES)) {
      try {
        lstatSync(join(directory, name));
        throw new Error(SINK_ERROR.EXISTING_DESTINATION);
      } catch (error) {
        if (error.code !== MISSING_FILE_CODE) throw error;
      }
    }
    traceDescriptor = openSync(
      join(directory, PACKAGE_DIAGNOSTIC_FILES.trace), CREATE_EXCLUSIVE_MODE);
  } catch (error) {
    setupError = error;
  }
  const totalBytes = () => [...sizes.values()].reduce((total, size) => total + size, 0);
  const sink = (record) => {
    const terminal = record.event === OBSERVATION_EVENT.TERMINAL;
    let primaryError;
    try {
      if (setupError) throw setupError;
      const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
      const nextSize = (sizes.get(PACKAGE_ARTIFACT.TRACE) || 0) + bytes.length;
      const limit = terminal ? TRACE_MAX_BYTES : TRACE_MAX_BYTES - TERMINAL_RESERVE_BYTES;
      if (nextSize > limit || totalBytes() + bytes.length > TOTAL_MAX_BYTES) {
        throw new Error(SINK_ERROR.TRACE_BOUND_EXCEEDED);
      }
      writeFileSync(traceDescriptor, bytes);
      sizes.set(PACKAGE_ARTIFACT.TRACE, nextSize);
    } catch (error) {
      primaryError = error;
    } finally {
      if (terminal && traceDescriptor !== undefined) {
        const descriptor = traceDescriptor;
        traceDescriptor = undefined;
        try {
          closeSync(descriptor);
        } catch (error) {
          primaryError ||= error;
        }
      }
    }
    if (primaryError) throw primaryError;
  };
  sink.snapshot = (artifact, source) => {
    if (setupError) throw setupError;
    if (artifact === PACKAGE_ARTIFACT.TRACE || !Object.hasOwn(PACKAGE_DIAGNOSTIC_FILES, artifact)) {
      throw new Error(SINK_ERROR.UNDECLARED_SNAPSHOT);
    }
    let captured;
    try {
      captured = artifact === PACKAGE_ARTIFACT.PACKED ? packedBytes(source) : boundedFile(source);
    } catch (error) {
      if (error.code !== MISSING_FILE_CODE) throw error;
      return {outcome: artifact === PACKAGE_ARTIFACT.INSTALLED_LOCK ?
        SNAPSHOT_OUTCOME.OPTIONAL_MISSING : SNAPSHOT_OUTCOME.MISSING, bytes: 0};
    }
    if (captured.outcome !== SNAPSHOT_OUTCOME.SAVED) return captured;
    if (totalBytes() - (sizes.get(artifact) || 0) + captured.bytes.length > TOTAL_MAX_BYTES) {
      return {outcome: SNAPSHOT_OUTCOME.TOTAL_BOUND_EXCEEDED, bytes: 0};
    }
    const destination = join(directory, PACKAGE_DIAGNOSTIC_FILES[artifact]);
    const descriptor = openSync(destination,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW);
    try {
      writeFileSync(descriptor, captured.bytes);
    } finally {
      closeSync(descriptor);
    }
    sizes.set(artifact, captured.bytes.length);
    return {outcome: SNAPSHOT_OUTCOME.SAVED, bytes: captured.bytes.length};
  };
  sink.setupOverheadMs = performance.now() - started;
  return sink;
}

export {PACKAGE_DIAGNOSTIC_DIRECTORY, PACKAGE_DIAGNOSTIC_FILES, SNAPSHOT_MAX_BYTES,
  TOTAL_MAX_BYTES, TRACE_MAX_BYTES, createPackageDiagnosticSink};
