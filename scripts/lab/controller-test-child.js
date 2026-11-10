// Controller test-child stdin, process-group and completion mechanisms delegated by probe.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {killGroup} from './process.js';
import {PLACEMENT_STDIO_PIPE, PLACEMENT_STDIO_INHERIT,
  PLACEMENT_LOG_PARENT, PLACEMENT_READ_FLAG, PLACEMENT_STREAM,
  PLACEMENT_NEWLINE, exitOf, closeOf, streamLines, hasExited} from './process-output.js';
import {PLACEMENT_ENV, PLACEMENT_LOCAL, PLACEMENT_FORWARDED_ENV,
  PLACEMENT_RUNNER, PLACEMENT_RUNNER_STDIN} from './remote-shard-script.js';
import {PLACEMENT_RUN_RADIX} from './proof-source.js';

// The controller child's file list, named for this process and a count.
const PLACEMENT_CHILD_LIST_PREFIX = 'controller-';
const PLACEMENT_CHILD_LIST_SUFFIX = '.files';
let childListCount = 0;

// The controller's own files while lab shards run: the classified runner's
// entry point as a child in a group of its own, told never to place again.
// `abort` ends the whole group. With `onLine` its output is not inherited but
// handed over line by line, as a lab shard's relay is, and it is done only
// once that output has been read to the end.
//
// Its file list is its stdin as a FILE, never a socket this process writes:
// the runner reads stdin synchronously, and a child that got there before
// this event loop had written found the non-blocking socket empty and died
// with EAGAIN - every child, when this process was busy for 300 ms after the
// spawn (found 2026-09-23). The file is unlinked once the child holds it.
function runClassifiedChild(root, files, env, {onLine = null, checkBase = ''} = {}) {
  const output = onLine ? PLACEMENT_STDIO_PIPE : PLACEMENT_STDIO_INHERIT;
  const listDir = path.join(root, PLACEMENT_LOG_PARENT);
  fs.mkdirSync(listDir, {recursive: true});
  const list = path.join(listDir, `${PLACEMENT_CHILD_LIST_PREFIX}${process.pid}-` +
    `${Date.now().toString(PLACEMENT_RUN_RADIX)}-${childListCount += 1}` +
    `${PLACEMENT_CHILD_LIST_SUFFIX}`);
  fs.writeFileSync(list, files.join(PLACEMENT_NEWLINE) + PLACEMENT_NEWLINE);
  const input = fs.openSync(list, PLACEMENT_READ_FLAG);
  let child;
  try {
    child = spawn(process.execPath, [PLACEMENT_RUNNER, PLACEMENT_RUNNER_STDIN], {
      cwd: root,
      env: {...env, [PLACEMENT_ENV]: PLACEMENT_LOCAL,
        ...(checkBase ? {[PLACEMENT_FORWARDED_ENV.CHECK_BASE]: checkBase} : {})},
      stdio: [input, output, output],
      detached: true,
    });
  } finally {
    fs.closeSync(input);
    fs.rmSync(list, {force: true});
  }
  if (onLine) {
    streamLines(child.stdout, PLACEMENT_STREAM.OUT, onLine);
    streamLines(child.stderr, PLACEMENT_STREAM.ERR, onLine);
  }
  return {
    done: (onLine ? closeOf(child) : exitOf(child)).then((status) => status ?? 1),
    abort: () => {
      if (!hasExited(child)) killGroup(child);
    },
    // Its process group, for a caller that must know exactly what it started.
    group: child.pid,
  };
}

export {runClassifiedChild};
