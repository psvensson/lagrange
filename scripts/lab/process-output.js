// Stream framing, completion observation and log tailing delegated by placement.
import fs from 'node:fs';
import {StringDecoder} from 'node:string_decoder';

const PLACEMENT_STDIO_PIPE = 'pipe';
const PLACEMENT_STDIO_INHERIT = 'inherit';
const PLACEMENT_LOG_PARENT = 'test-output/placement';
const PLACEMENT_LINE = /\r?\n/u;
// How often a streamed shard's relay files are read for new lines.
const PLACEMENT_TAIL_POLL_MS = 250;
const PLACEMENT_READ_FLAG = 'r';
const PLACEMENT_STREAM = Object.freeze({OUT: 'out', ERR: 'err'});
const TEXT_UTF8 = 'utf8';
const PLACEMENT_CHILD_EVENT = Object.freeze({ERROR: 'error', EXIT: 'exit', CLOSE: 'close',
  DATA: 'data', END: 'end'});
const PLACEMENT_STDIO_IGNORE = 'ignore';
const PLACEMENT_NEWLINE = '\n';

function exitOf(child) {
  return new Promise((resolve) => {
    child.on(PLACEMENT_CHILD_EVENT.ERROR, () => resolve(null));
    child.on(PLACEMENT_CHILD_EVENT.EXIT, (code) => resolve(code));
  });
}

// Its exit status once its output streams are also closed: every line read.
function closeOf(child) {
  return new Promise((resolve) => {
    child.on(PLACEMENT_CHILD_EVENT.ERROR, () => resolve(null));
    child.on(PLACEMENT_CHILD_EVENT.CLOSE, (code) => resolve(code));
  });
}

function streamLines(readable, stream, onLine) {
  let partial = '';
  readable.setEncoding(TEXT_UTF8);
  readable.on(PLACEMENT_CHILD_EVENT.DATA, (text) => {
    const lines = `${partial}${text}`.split(PLACEMENT_LINE);
    partial = lines.pop();
    for (const line of lines) onLine(line, stream);
  });
  readable.on(PLACEMENT_CHILD_EVENT.END, () => {
    if (partial) onLine(partial, stream);
    partial = '';
  });
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

// The relay's lines as they land: the ssh session writes the lab machine's
// output into these files live, so following them is streaming without a
// second connection. Returns the finish, which delivers the rest and stops.
function tailLines(file, stream, onLine) {
  const decoder = new StringDecoder(TEXT_UTF8);
  let offset = 0;
  let partial = '';
  const emit = (text) => {
    const lines = `${partial}${text}`.split(PLACEMENT_LINE);
    partial = lines.pop();
    for (const line of lines) onLine(line, stream);
  };
  const drain = () => {
    const size = fs.statSync(file).size;
    if (size <= offset) return;
    const buffer = Buffer.alloc(size - offset);
    const fd = fs.openSync(file, PLACEMENT_READ_FLAG);
    let read = 0;
    try {
      read = fs.readSync(fd, buffer, 0, buffer.length, offset);
    } finally {
      fs.closeSync(fd);
    }
    offset += read;
    emit(decoder.write(buffer.subarray(0, read)));
  };
  const timer = setInterval(drain, PLACEMENT_TAIL_POLL_MS);
  return () => {
    clearInterval(timer);
    drain();
    emit(decoder.end());
    if (partial) onLine(partial, stream);
    partial = '';
  };
}

export {PLACEMENT_STDIO_PIPE, PLACEMENT_STDIO_INHERIT, PLACEMENT_LOG_PARENT, PLACEMENT_LINE,
  PLACEMENT_TAIL_POLL_MS, PLACEMENT_READ_FLAG, PLACEMENT_STREAM, TEXT_UTF8, PLACEMENT_CHILD_EVENT,
  PLACEMENT_STDIO_IGNORE, PLACEMENT_NEWLINE, exitOf, closeOf, streamLines, hasExited, tailLines};
