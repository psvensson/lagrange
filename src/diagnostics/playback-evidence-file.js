/**
 * Shared playback snapshot evidence codec and artifact resolver.
 *
 * Logical snapshot paths retain the historical `snapshots.ndjson` name. New
 * captures are written to the adjacent `.gz` artifact; exact paths always win
 * so retained plain-text evidence remains readable without migration.
 */

import {createReadStream, createWriteStream, lstatSync, readFileSync} from 'node:fs';
import {lstat, readFile, rm} from 'node:fs/promises';
import {Transform} from 'node:stream';
import {once} from 'node:events';
import {pipeline} from 'node:stream/promises';
import {
  createGunzip,
  createGzip,
  gunzip,
  gunzipSync,
  constants as zlibConstants,
} from 'node:zlib';
import {promisify} from 'node:util';

const GZIP_SUFFIX = '.gz';
const NEWLINE = '\n';
const UTF8_ENCODING = 'utf8';
const FILE_FLAGS_TRUNCATE = 'w';
const EMPTY_BUFFER = Buffer.alloc(0);
const ERROR_CODE_MISSING_FILE = 'ENOENT';
const STREAM_EVENT_ERROR = 'error';
const STREAM_EVENT_CLOSE = 'close';
const STREAM_EVENT_OPEN = 'open';
const STREAM_EVENT_DRAIN = 'drain';
const ERROR_MESSAGE_OUTPUT_CLOSED_EARLY =
  'Playback evidence output closed before opening';
const ERROR_MESSAGE_WRITER_CLOSED = 'Playback evidence writer is closed';
const ERROR_MESSAGE_CAPTURE_ABORTED = 'Playback evidence capture aborted';
const gunzipAsync = promisify(gunzip);

function isMissingFileError(error) {
  return error?.code === ERROR_CODE_MISSING_FILE;
}

function gzipPlaybackEvidencePath(logicalPath) {
  return logicalPath.endsWith(GZIP_SUFFIX) ?
    logicalPath :
    logicalPath + GZIP_SUFFIX;
}

function resolvePlaybackEvidencePathSync(requestedPath) {
  try {
    lstatSync(requestedPath);
    return requestedPath;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
  if (requestedPath.endsWith(GZIP_SUFFIX)) {
    return null;
  }
  const compressedPath = gzipPlaybackEvidencePath(requestedPath);
  try {
    lstatSync(compressedPath);
    return compressedPath;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

async function resolvePlaybackEvidencePath(requestedPath) {
  try {
    await lstat(requestedPath);
    return requestedPath;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
  if (requestedPath.endsWith(GZIP_SUFFIX)) {
    return null;
  }
  const compressedPath = gzipPlaybackEvidencePath(requestedPath);
  try {
    await lstat(compressedPath);
    return compressedPath;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

function requireResolvedPath(requestedPath, resolvedPath) {
  if (resolvedPath) {
    return resolvedPath;
  }
  readFileSync(requestedPath);
  return requestedPath;
}

function readPlaybackEvidenceFileSync(requestedPath, encoding = UTF8_ENCODING) {
  const resolvedPath = requireResolvedPath(
    requestedPath,
    resolvePlaybackEvidencePathSync(requestedPath),
  );
  const payload = readFileSync(resolvedPath);
  const decoded = resolvedPath.endsWith(GZIP_SUFFIX) ?
    gunzipSync(payload) :
    payload;
  return encoding ? decoded.toString(encoding) : decoded;
}

async function readPlaybackEvidenceFile(requestedPath, encoding = UTF8_ENCODING) {
  const resolvedPath = await resolvePlaybackEvidencePath(requestedPath);
  const payload = await readFile(resolvedPath || requestedPath);
  const decoded = resolvedPath?.endsWith(GZIP_SUFFIX) ?
    await gunzipAsync(payload) :
    payload;
  return encoding ? decoded.toString(encoding) : decoded;
}

class CompleteNdjsonRecords extends Transform {
  constructor() {
    super();
    this._remainder = EMPTY_BUFFER;
  }

  _transform(chunk, _encoding, callback) {
    const combined = this._remainder.length === 0 ?
      chunk :
      Buffer.concat([this._remainder, chunk]);
    const lastNewline = combined.lastIndexOf(NEWLINE);
    if (lastNewline < 0) {
      this._remainder = combined;
      callback();
      return;
    }
    this.push(combined.subarray(0, lastNewline + 1));
    this._remainder = combined.subarray(lastNewline + 1);
    callback();
  }
}

function pipeWithErrorForwarding(source, destination) {
  source.on(STREAM_EVENT_ERROR, (error) => destination.destroy(error));
  // Tear the producer down when the consumer goes away so an aborted
  // download can never leak the underlying file descriptor.
  destination.on(STREAM_EVENT_CLOSE, () => source.destroy());
  return source.pipe(destination);
}

async function createPlaybackEvidenceReadStream(requestedPath, options = {}) {
  const resolvedPath = await resolvePlaybackEvidencePath(requestedPath);
  const filePath = resolvedPath || requestedPath;
  const source = createReadStream(filePath);
  if (!filePath.endsWith(GZIP_SUFFIX)) {
    return source;
  }
  const active = options.allowIncomplete === true;
  const gunzipOptions = active ?
    {finishFlush: zlibConstants.Z_SYNC_FLUSH} :
    {};
  const decoded = pipeWithErrorForwarding(source, createGunzip(gunzipOptions));
  return active ?
    pipeWithErrorForwarding(decoded, new CompleteNdjsonRecords()) :
    decoded;
}

function waitForWrite(stream, value) {
  let resolveWrite;
  let rejectWrite;
  const callbackResult = new Promise((resolve, reject) => {
    resolveWrite = resolve;
    rejectWrite = reject;
  });
  const accepted = stream.write(value, (error) => {
    if (error) {
      rejectWrite(error);
      return;
    }
    resolveWrite();
  });
  const drainResult = accepted ?
    Promise.resolve() :
    once(stream, STREAM_EVENT_DRAIN);
  return Promise.all([callbackResult, drainResult]);
}

function flushGzip(stream) {
  return new Promise((resolve, reject) => {
    stream.flush(zlibConstants.Z_SYNC_FLUSH, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function createPlaybackEvidenceWriter(targetPath) {
  const destination = createWriteStream(targetPath, {
    flags: FILE_FLAGS_TRUNCATE,
  });
  const gzip = createGzip();
  const pipelineResult = pipeline(gzip, destination);
  pipelineResult.catch(() => {});
  await Promise.race([
    once(destination, STREAM_EVENT_OPEN),
    pipelineResult.then(() => {
      throw new Error(ERROR_MESSAGE_OUTPUT_CLOSED_EARLY);
    }),
  ]);

  let tail = Promise.resolve();
  let closed = false;
  let failure = null;
  const latchFailure = (error) => {
    failure ||= error;
  };

  return {
    path: targetPath,
    appendRecord(record) {
      if (closed) {
        return Promise.reject(new Error(ERROR_MESSAGE_WRITER_CLOSED));
      }
      tail = tail.then(async () => {
        if (failure) {
          throw failure;
        }
        await waitForWrite(gzip, JSON.stringify(record) + NEWLINE);
        await flushGzip(gzip);
      });
      tail.catch(latchFailure);
      return tail;
    },
    async close() {
      closed = true;
      await tail;
      gzip.end();
      await pipelineResult;
      if (failure) {
        throw failure;
      }
    },
    async abort() {
      closed = true;
      gzip.destroy(failure || new Error(ERROR_MESSAGE_CAPTURE_ABORTED));
      await pipelineResult.catch(() => {});
      await rm(targetPath, {force: true});
    },
  };
}

export {
  createPlaybackEvidenceReadStream,
  createPlaybackEvidenceWriter,
  gzipPlaybackEvidencePath,
  readPlaybackEvidenceFile,
  readPlaybackEvidenceFileSync,
  resolvePlaybackEvidencePath,
  resolvePlaybackEvidencePathSync,
};
