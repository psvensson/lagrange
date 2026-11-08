// Byte-bounded node-log window retention with its coverage record
// (failure-bundle-artifact-foundation.js LOG_WINDOW_COVERAGE owns the record
// shape). One implementation serves every caller: the failure bundle reads a
// node's FULL log (.full-logs/<scenario>/<nodeId>.log.gz, the complete
// source) and the container-log readers (container-log-window.js) bound what
// they keep of a node's Docker output.
//
// The source is read as a stream of byte chunks. With first divergence known
// it is read twice: the first pass finds the byte offset where the failure
// window starts and the total length, the second copies only the retained
// range. Without it (or from a source read once) one pass keeps a ring of the
// last bytes. Memory is bounded by the window, never by the log, and the
// bound is in bytes, so a newline-free log cannot defeat it. A readable source
// with no bytes is a missing-class record (FULL_LOG_EMPTY), never an empty
// complete window.

import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {pipeline} from 'node:stream';
import {createGunzip} from 'node:zlib';
import {
  LOG_WINDOW_COVERAGE,
  UTF8_ENCODING,
  ZERO,
} from './failure-bundle-artifact-foundation.js';

const bufferIndexOf = Function.call.bind(Buffer.prototype.indexOf);
const bufferToString = Function.call.bind(Buffer.prototype.toString);
const bufferSubarray = Function.call.bind(Buffer.prototype.subarray);
const stringSplit = Function.call.bind(String.prototype.split);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringSlice = Function.call.bind(String.prototype.slice);
const regexpExec = Function.call.bind(RegExp.prototype.exec);
const arrayPush = Function.call.bind(Array.prototype.push);
const arrayShift = Function.call.bind(Array.prototype.shift);

const ONE = 1;
const LOG_LINE_BYTE = 0x0a;
const JSON_OBJECT_START_BYTE = 0x7b;
const LOG_LINE_SEPARATOR = '\n';
const LOG_LINE_TIMESTAMP_SEPARATOR = ' ';
// Timestamps are read from at most this many leading bytes of a line: the
// curated `<timestamp> [<nodeId>] <level>: <message>` form
// (log-collector.js formatLogEntry) and pino JSON, whose `time` follows
// `level` (src/logging/logging-service.js), both fit.
const LOG_LINE_TIMESTAMP_PROBE_BYTES = 256;
const UTF8_CONTINUATION_MASK = 0xc0;
const UTF8_CONTINUATION_BITS = 0x80;
const NUMERIC_TIMESTAMP_PATTERN = /^\d+$/;
const JSON_TIME_FIELD_PATTERN = /"time":\s*(?:"([^"]+)"|(\d+))/;
const FILE_NOT_FOUND_CODE = 'ENOENT';

function parseTimestampToken(token) {
  if (typeof token !== 'string' || token.length === ZERO) {
    return null;
  }
  const timestampMs = regexpExec(NUMERIC_TIMESTAMP_PATTERN, token) ?
    Number(token) :
    Date.parse(token);
  return Number.isFinite(timestampMs) ? timestampMs : null;
}

function parseProbeTimestampMs(probe) {
  if (probe.length === ZERO) {
    return null;
  }
  const text = bufferToString(probe, UTF8_ENCODING);
  if (probe[ZERO] === JSON_OBJECT_START_BYTE) {
    const match = regexpExec(JSON_TIME_FIELD_PATTERN, text);
    return match ? parseTimestampToken(match[ONE] ?? match[ONE + ONE]) : null;
  }
  const separatorIndex = stringIndexOf(text, LOG_LINE_TIMESTAMP_SEPARATOR);
  return separatorIndex > ZERO ?
    parseTimestampToken(stringSlice(text, ZERO, separatorIndex)) :
    null;
}

function isUtf8Continuation(byte) {
  return byte !== null &&
    (byte & UTF8_CONTINUATION_MASK) === UTF8_CONTINUATION_BITS;
}

// Pass 1: the byte offset where the failure window starts, and the total
// length. The window starts just past the last line stamped strictly before
// first divergence: every later byte, stamped at/after divergence or carrying
// no readable stamp (a native FATAL trailer, an uncaught-exception trace, the
// harness's own boundary marker), is of the failure window or of unknown
// placement, and is retained or counted as withheld, never excluded. With no
// readable stamp at all the start is byte 0: the whole log is the window.
// One line's state while pass 1 reads it: up to PROBE bytes of its head
// (where a timestamp can be read) and whether it was judged.
function createLineProbe() {
  return {parts: [], length: ZERO, done: false};
}

function feedLineProbe(probe, chunk, position, segmentEnd) {
  const take = Math.min(segmentEnd - position,
    LOG_LINE_TIMESTAMP_PROBE_BYTES - probe.length);
  if (take > ZERO) {
    arrayPush(probe.parts, bufferSubarray(chunk, position, position + take));
    probe.length += take;
  }
}

function createDivergenceScanner(firstDivergenceAtMs) {
  const state = {
    totalBytes: ZERO,
    probe: createLineProbe(),
    lineBeforeDivergence: false,
    lastBeforeEnd: ZERO,
    windowStartByte: null,
  };
  const judgeLine = () => {
    state.probe.done = true;
    const timestampMs = parseProbeTimestampMs(Buffer.concat(state.probe.parts));
    if (timestampMs === null) {
      return;
    }
    if (timestampMs >= firstDivergenceAtMs) {
      state.windowStartByte = state.lastBeforeEnd;
      return;
    }
    state.lineBeforeDivergence = true;
  };
  // A newline at chunk offset newlineIndex ends the current line.
  const endLine = (newlineIndex) => {
    const lineStart = state.totalBytes + newlineIndex + ONE;
    state.lastBeforeEnd =
      state.lineBeforeDivergence ? lineStart : state.lastBeforeEnd;
    state.probe = createLineProbe();
    state.lineBeforeDivergence = false;
  };
  return {
    found: () => state.windowStartByte !== null,
    feed(chunk) {
      let position = ZERO;
      while (state.windowStartByte === null && position < chunk.length) {
        const newlineIndex = bufferIndexOf(chunk, LOG_LINE_BYTE, position);
        const lineEnds = newlineIndex >= ZERO;
        if (!state.probe.done) {
          feedLineProbe(state.probe, chunk, position,
            lineEnds ? newlineIndex : chunk.length);
          if (lineEnds || state.probe.length >= LOG_LINE_TIMESTAMP_PROBE_BYTES) {
            judgeLine();
          }
        }
        if (!lineEnds || state.windowStartByte !== null) {
          break;
        }
        endLine(newlineIndex);
        position = newlineIndex + ONE;
      }
      state.totalBytes += chunk.length;
    },
    finish() {
      if (state.windowStartByte === null && !state.probe.done &&
          state.probe.length > ZERO) {
        judgeLine();
      }
      // The last line has no newline: when it is stamped before divergence
      // it ends at EOF, and so does the (then empty) window's start.
      if (state.windowStartByte === null && state.lineBeforeDivergence) {
        state.lastBeforeEnd = state.totalBytes;
      }
      return {
        failureWindowStart: state.windowStartByte ?? state.lastBeforeEnd,
        totalBytes: state.totalBytes,
      };
    },
  };
}

async function scanFailureWindow(openChunks, firstDivergenceAtMs) {
  const scanner = createDivergenceScanner(firstDivergenceAtMs);
  for await (const chunk of openChunks()) {
    scanner.feed(chunk);
  }
  return scanner.finish();
}

// Pass 2: copy [start, end) and the byte just past it (to keep characters
// whole at the end edge).
async function copyRange(openChunks, start, end) {
  const parts = [];
  let base = ZERO;
  let byteAfter = null;
  for await (const chunk of openChunks()) {
    const chunkEnd = base + chunk.length;
    if (chunkEnd > start && base < end) {
      arrayPush(parts, bufferSubarray(chunk,
        Math.max(ZERO, start - base), Math.min(chunk.length, end - base)));
    }
    if (end >= base && end < chunkEnd) {
      byteAfter = chunk[end - base];
      break;
    }
    base = chunkEnd;
  }
  return {retained: Buffer.concat(parts), byteAfter};
}

// The byte-tail mode (first divergence unknown, or a source read once): a
// ring of the last `bound` bytes fed chunk by chunk while every byte is
// counted, so peak memory is the bound plus one chunk, never the log. push()
// is synchronous, so a stream's data handler can feed it with no queue.
function createLastBytesRing(bound) {
  const ring = [];
  let ringBytes = ZERO;
  let totalBytes = ZERO;
  return {
    push(chunk) {
      totalBytes += chunk.length;
      if (bound === ZERO || chunk.length === ZERO) {
        return;
      }
      arrayPush(ring, Buffer.from(chunk.length > bound ?
        bufferSubarray(chunk, chunk.length - bound) :
        chunk));
      ringBytes += ring[ring.length - ONE].length;
      while (ringBytes - ring[ZERO].length >= bound) {
        ringBytes -= arrayShift(ring).length;
      }
    },
    result() {
      const joined = Buffer.concat(ring);
      const retained = joined.length > bound ?
        bufferSubarray(joined, joined.length - bound) :
        joined;
      return {retained, start: totalBytes - retained.length, totalBytes};
    },
  };
}

function alignToCharacters(retained, byteAfter) {
  let start = ZERO;
  while (start < retained.length && isUtf8Continuation(retained[start])) {
    start += ONE;
  }
  let end = retained.length;
  let next = byteAfter;
  while (end > start && isUtf8Continuation(next)) {
    end -= ONE;
    next = retained[end];
  }
  return {aligned: bufferSubarray(retained, start, end), leadingTrim: start};
}

function splitRetainedLines(retained) {
  const lines = [];
  let firstMs = null;
  let lastMs = null;
  for (const line of stringSplit(
    bufferToString(retained, UTF8_ENCODING), LOG_LINE_SEPARATOR)) {
    if (line.length === ZERO) {
      continue;
    }
    arrayPush(lines, line);
    const timestampMs = parseProbeTimestampMs(bufferSubarray(
      Buffer.from(line, UTF8_ENCODING), ZERO, LOG_LINE_TIMESTAMP_PROBE_BYTES));
    if (timestampMs !== null) {
      firstMs = firstMs === null ? timestampMs : firstMs;
      lastMs = timestampMs;
    }
  }
  return {lines, firstMs, lastMs};
}

function toIsoOrNull(timestampMs) {
  return Number.isFinite(timestampMs) ?
    new Date(timestampMs).toISOString() :
    null;
}

function resolveBound(maxRetainedBytes) {
  return Number.isFinite(maxRetainedBytes) && maxRetainedBytes >= ZERO ?
    Math.floor(maxRetainedBytes) :
    LOG_WINDOW_COVERAGE.MAX_RETAINED_BYTES;
}

/**
 * The coverage record of a node whose log yielded nothing to examine
 * (missing, unreadable, or empty): the withheld amount is unknown (null) and
 * it is never complete.
 * @param {{firstDivergenceAtMs?: ?number, captureCompleteness?: ?Object,
 *   source?: ?string, missingReason: string}} params
 * @return {Object}
 */
function buildMissingLogWindowCoverage({
  firstDivergenceAtMs = null,
  captureCompleteness = null,
  source = null,
  missingReason,
}) {
  return {
    firstDivergenceAt: toIsoOrNull(firstDivergenceAtMs),
    windowStartAt: null,
    windowEndAt: null,
    windowStartByte: null,
    windowEndByte: null,
    retainedBytes: ZERO,
    withheldBytes: null,
    complete: false,
    captureCompleteness,
    source,
    missingReason,
  };
}

// The record of a readable window. `complete` needs both halves: the
// capture owner's verdict that the source holds the node's whole output,
// and nothing of the failure window withheld by the byte bound.
function buildReadableCoverage({
  firstDivergenceAtMs, captureCompleteness, source, retained, retainedStart,
  failureWindowStart, totalBytes,
}) {
  const {lines, firstMs, lastMs} = splitRetainedLines(retained);
  const withheldBytes = (totalBytes - failureWindowStart) - retained.length;
  return {
    lines,
    coverage: {
      firstDivergenceAt: toIsoOrNull(firstDivergenceAtMs),
      windowStartAt: toIsoOrNull(firstMs),
      windowEndAt: toIsoOrNull(lastMs),
      windowStartByte: retainedStart,
      windowEndByte: retainedStart + retained.length,
      retainedBytes: retained.length,
      withheldBytes,
      complete: withheldBytes === ZERO && captureCompleteness?.complete === true,
      captureCompleteness,
      source,
      missingReason: null,
    },
  };
}

function emptySourceResult(firstDivergenceAtMs, captureCompleteness, source) {
  return {
    lines: [],
    coverage: buildMissingLogWindowCoverage({
      firstDivergenceAtMs, captureCompleteness, source,
      missingReason: LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_EMPTY,
    }),
  };
}

/**
 * A byte-tail window fed one chunk at a time (a live Docker log stream read
 * once): first divergence unknown, the last maxRetainedBytes are kept.
 * @param {{maxRetainedBytes?: number, captureCompleteness?: ?Object,
 *   source?: ?string}} [options]
 * @return {{push: function(Buffer): void,
 *   finish: function(): {lines: Array<string>, coverage: Object}}}
 */
function createLogTailWindow({
  maxRetainedBytes = LOG_WINDOW_COVERAGE.MAX_RETAINED_BYTES,
  captureCompleteness = null,
  source = null,
} = {}) {
  const ring = createLastBytesRing(resolveBound(maxRetainedBytes));
  return {
    push: ring.push,
    finish() {
      const tail = ring.result();
      if (tail.totalBytes === ZERO) {
        return emptySourceResult(null, captureCompleteness, source);
      }
      const {aligned, leadingTrim} = alignToCharacters(tail.retained, null);
      return buildReadableCoverage({
        firstDivergenceAtMs: null, captureCompleteness, source,
        retained: aligned, retainedStart: tail.start + leadingTrim,
        failureWindowStart: ZERO, totalBytes: tail.totalBytes,
      });
    },
  };
}

async function retainLogTailFromChunks(chunks, options) {
  const tailWindow = createLogTailWindow(options);
  for await (const chunk of chunks) {
    tailWindow.push(chunk);
  }
  return tailWindow.finish();
}

/**
 * Retain one node's log window from a re-openable chunk source.
 * @param {Function} openChunks () => AsyncIterable<Buffer>; called once in
 *   the byte-tail mode (first divergence unknown), twice otherwise.
 * @param {{firstDivergenceAtMs?: ?number, maxRetainedBytes?: number,
 *   captureCompleteness?: ?Object, source?: ?string}} [options]
 *   captureCompleteness is the capture owner's verdict on the source
 *   (full-node-log-capture.js assessCaptureCompleteness); without a
 *   complete one the record is never complete.
 * @return {Promise<{lines: Array<string>, coverage: Object}>}
 */
async function retainLogWindowFromChunks(openChunks, {
  firstDivergenceAtMs = null,
  maxRetainedBytes = LOG_WINDOW_COVERAGE.MAX_RETAINED_BYTES,
  captureCompleteness = null,
  source = null,
} = {}) {
  if (!Number.isFinite(firstDivergenceAtMs)) {
    return retainLogTailFromChunks(openChunks(),
      {maxRetainedBytes, captureCompleteness, source});
  }
  const bound = resolveBound(maxRetainedBytes);
  const {failureWindowStart, totalBytes} =
    await scanFailureWindow(openChunks, firstDivergenceAtMs);
  if (totalBytes === ZERO) {
    return emptySourceResult(firstDivergenceAtMs, captureCompleteness, source);
  }
  const end = Math.min(totalBytes, failureWindowStart + bound);
  const copied = end > failureWindowStart ?
    await copyRange(openChunks, failureWindowStart, end) :
    {retained: Buffer.alloc(ZERO), byteAfter: null};
  const {aligned, leadingTrim} =
    alignToCharacters(copied.retained, copied.byteAfter);
  return buildReadableCoverage({
    firstDivergenceAtMs, captureCompleteness, source,
    retained: aligned, retainedStart: failureWindowStart + leadingTrim,
    failureWindowStart, totalBytes,
  });
}

/**
 * Retain a window of in-memory log content.
 * @param {string|Buffer} logContent
 * @param {Object} [options] As retainLogWindowFromChunks.
 * @return {Promise<{lines: Array<string>, coverage: Object}>}
 */
function retainNodeLogWindow(logContent, options = {}) {
  const contentBuffer = Buffer.isBuffer(logContent) ?
    logContent :
    Buffer.from(String(logContent ?? ''), UTF8_ENCODING);
  return retainLogWindowFromChunks(async function* singleChunk() {
    yield contentBuffer;
  }, options);
}

// pipeline destroys the file stream too when a pass stops early (the copy
// pass breaks once its range is read), so no descriptor outlives the read.
function openGzipChunks(gzPath) {
  return pipeline(createReadStream(gzPath), createGunzip(), (_error) => {
    // The iterating pass surfaces a read error itself; an early break ends
    // the pipeline with a premature-close error that is expected.
  });
}

function missingSourceResult(options, source, missingReason) {
  return {
    lines: [],
    coverage: buildMissingLogWindowCoverage({
      firstDivergenceAtMs: options.firstDivergenceAtMs ?? null,
      captureCompleteness: options.captureCompleteness ?? null,
      source,
      missingReason,
    }),
  };
}

/**
 * Retain a window of a node's gzipped full log, or record why it is missing.
 * @param {string} gzPath Absolute path of the node's .log.gz full log.
 * @param {{firstDivergenceAtMs?: ?number, maxRetainedBytes?: number,
 *   captureCompleteness?: ?Object, source?: ?string}} [options] source
 *   labels the record (defaults to gzPath).
 * @return {Promise<{lines: Array<string>, coverage: Object}>}
 */
async function retainNodeLogWindowFromGzip(gzPath, options = {}) {
  const source = options.source ?? gzPath;
  try {
    await stat(gzPath);
  } catch (error) {
    // A missing log names no source: every path a bundle names resolves.
    return error?.code === FILE_NOT_FOUND_CODE ?
      missingSourceResult(options, null,
        LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_MISSING) :
      missingSourceResult(options, source,
        LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_UNREADABLE);
  }
  try {
    return await retainLogWindowFromChunks(
      () => openGzipChunks(gzPath),
      {...options, source},
    );
  } catch (_error) {
    // A truncated or corrupt capture is evidence the bundle could not read:
    // recorded as an incomplete, unreadable window, never as a short one.
    return missingSourceResult(options, source,
      LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_UNREADABLE);
  }
}

export {
  buildMissingLogWindowCoverage,
  createLogTailWindow,
  retainLogWindowFromChunks,
  retainNodeLogWindow,
  retainNodeLogWindowFromGzip,
};
