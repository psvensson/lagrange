// The test runner's bounded byte reader and diagnostic path rendering.
import {closeSync, openSync, readSync} from 'node:fs';
import path from 'node:path';

// A test's own output is read in chunks and never held whole. One file of
// 608,651,868 bytes (message-group-multi-join-formation under lane
// contention, 2026-09-17) passed V8's string cap, so readFileSync threw
// ERR_STRING_TOO_LONG inside finalizeTestRun and killed the runner - taking
// 220 of 262 already-green exclusive files with it. The parser is a streaming
// one, so feeding it chunks analyses every byte at constant memory; only a
// bounded excerpt is kept, because the only consumer of the text is the echo
// of a FAILED file, and echoing half a gigabyte helps nobody.
const OUTPUT_CHUNK_BYTES = 1024 * 1024;
const OUTPUT_EXCERPT_EDGE_BYTES = 64 * 1024;
const EXCERPT_ELISION_PREFIX = '\n# ... ';
const EXCERPT_ELISION_MIDDLE = ' byte(s) elided; full output in ';
const EXCERPT_ELISION_SUFFIX = ' ...\n';
const FILE_READ_FLAG = 'r';
const EMPTY_BUFFER = Buffer.alloc(0);
const OUTPUT_LINE_PREFIX_BYTES = 256;
// Measured 2026-09-18 over all 2,577 .tap and .stderr artifacts in this
// repository: the longest single line is 9,886 bytes, so this bound has about
// 106x headroom against what the corpus actually emits. A file that does
// exceed it is failed rather than analysed in part; if that ever bites a
// legitimate test, raise this number - narrowing the rule to "lines that look
// like TAP" would not be safe, because the verdict-changing shape begins
// with `ok `.
const OUTPUT_LINE_ANALYSIS_BYTES = 1024 * 1024;
const LINE_FEED_BYTE = 0x0a;
const CARRIAGE_RETURN_BYTE = 0x0d;
const NOT_FOUND = -1;
const TEXT_ENCODING = 'utf8';
const PARENT_DIRECTORY_PREFIX = '..';

/**
 * Read one test's output file without ever holding it whole, in BYTES: every
 * line's bytes go to `consume` up to OUTPUT_LINE_ANALYSIS_BYTES, each line's
 * first OUTPUT_LINE_PREFIX_BYTES go to `onLinePrefix`, and only the first and
 * last OUTPUT_EXCERPT_EDGE_BYTES of the file are retained. A file no larger
 * than the two edges is returned verbatim.
 *
 * The cap is per LINE, not per file, because the consumer is a TAP parser
 * that accumulates until it sees a line end (`this.buffer += chunk`): a
 * newline-free 520 MiB output overflows inside the parser however carefully
 * the file itself is streamed. TAP semantics live at the start of a line -
 * `ok`, `not ok`, `1..N`, `#` - so a line's head is forwarded intact and only
 * the runaway tail of that same line is dropped, counted in `dropped`. Two
 * earlier shapes of this reader died on exactly this input: readFileSync
 * (2026-09-17, one 608,651,868-byte file killed a 262-file lane) and a
 * whole-line accumulator (verifier round 1).
 * @param {string} file
 * @param {{consume?: Function, onLinePrefix?: Function}} [handlers]
 * @return {{bytes: number, dropped: number, excerpt: string, truncated: boolean}}
 */
export function readBoundedOutput(file, handlers = {}) {
  const {consume = null, onLinePrefix = null} = handlers;
  const buffer = Buffer.alloc(OUTPUT_CHUNK_BYTES);
  const descriptor = openSync(file, FILE_READ_FLAG);
  const prefix = Buffer.alloc(OUTPUT_LINE_PREFIX_BYTES);
  let bytes = 0;
  let dropped = 0;
  let head = EMPTY_BUFFER;
  let tail = EMPTY_BUFFER;
  let prefixLength = 0;
  let lineBytes = 0;
  let lineOpen = false;
  const endLine = () => {
    if (onLinePrefix && lineOpen) {
      onLinePrefix(prefix.subarray(0, prefixLength).toString(TEXT_ENCODING),
        lineBytes <= OUTPUT_LINE_PREFIX_BYTES);
    }
    prefixLength = 0;
    lineBytes = 0;
    lineOpen = false;
  };
  const takeSegment = (chunk, from, to) => {
    if (to > from) {
      lineOpen = true;
      const room = OUTPUT_LINE_PREFIX_BYTES - prefixLength;
      if (onLinePrefix && room > 0) {
        const take = to - from < room ? to - from : room;
        chunk.copy(prefix, prefixLength, from, from + take);
        prefixLength += take;
      }
      // The parser sees this line's head and nothing past the cap, so its
      // buffer can never grow without bound.
      const analysable = OUTPUT_LINE_ANALYSIS_BYTES - lineBytes;
      if (consume && analysable > 0) {
        const end = to - from < analysable ? to : from + analysable;
        consume(chunk.subarray(from, end));
        dropped += to - end;
      } else if (consume) {
        dropped += to - from;
      }
      lineBytes += to - from;
    }
  };
  const scanLines = (chunk) => {
    let index = 0;
    while (index < chunk.length) {
      const end = lineEndIndex(chunk, index);
      if (end === NOT_FOUND) {
        takeSegment(chunk, index, chunk.length);
        return;
      }
      takeSegment(chunk, index, end);
      // The line terminator always reaches the parser: it is what flushes it.
      lineOpen = true;
      if (consume) consume(chunk.subarray(end, end + 1));
      endLine();
      index = end + 1;
    }
  };
  try {
    let read = readSync(descriptor, buffer, 0, OUTPUT_CHUNK_BYTES, null);
    while (read > 0) {
      const chunk = buffer.subarray(0, read);
      bytes += read;
      scanLines(chunk);
      if (head.length < OUTPUT_EXCERPT_EDGE_BYTES) {
        head = Buffer.concat([head,
          chunk.subarray(0, OUTPUT_EXCERPT_EDGE_BYTES - head.length)]);
      }
      tail = Buffer.concat([tail, chunk]);
      if (tail.length > OUTPUT_EXCERPT_EDGE_BYTES) {
        tail = Buffer.from(tail.subarray(tail.length - OUTPUT_EXCERPT_EDGE_BYTES));
      }
      read = readSync(descriptor, buffer, 0, OUTPUT_CHUNK_BYTES, null);
    }
  } finally {
    closeSync(descriptor);
  }
  endLine();
  const elided = bytes - head.length - tail.length;
  if (elided <= 0) {
    // The edges overlap or meet: the bytes after the head are exactly the
    // last (bytes - head) of the tail.
    return {
      bytes,
      dropped,
      excerpt: Buffer.concat([head,
        tail.subarray(tail.length - (bytes - head.length))]).toString(TEXT_ENCODING),
      truncated: false,
    };
  }
  return {
    bytes,
    dropped,
    excerpt: `${head.toString(TEXT_ENCODING)}${EXCERPT_ELISION_PREFIX}` +
      `${elided}${EXCERPT_ELISION_MIDDLE}${displayPath(file)}` +
      `${EXCERPT_ELISION_SUFFIX}${tail.toString(TEXT_ENCODING)}`,
    truncated: true,
  };
}

// A line ends at the first LF or CR: the pattern this replaced was /^# time=/m,
// and JavaScript anchors a multiline ^ after either.
function lineEndIndex(chunk, from) {
  const lf = chunk.indexOf(LINE_FEED_BYTE, from);
  const cr = chunk.indexOf(CARRIAGE_RETURN_BYTE, from);
  if (lf === NOT_FOUND) return cr;
  if (cr === NOT_FOUND) return lf;
  return lf < cr ? lf : cr;
}

// A report that embeds an excerpt should not carry this machine's paths.
function displayPath(file) {
  const relative = path.relative(process.cwd(), file);
  return relative.length > 0 && !relative.startsWith(PARENT_DIRECTORY_PREFIX) ?
    relative : file;
}

export {PARENT_DIRECTORY_PREFIX, TEXT_ENCODING};
