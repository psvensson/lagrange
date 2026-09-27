import {execFileSync, spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const TEXT_ENCODING = 'utf8';
const PROBE_PHASE_DEFAULT = 'dbpage-probe';
const PROBE_ERROR_NAME = 'DbpageProbeError';
const COMPILER = 'cc';
const COMPILER_OUTPUT_ARGUMENT = '-o';
const STDIO_IGNORE = 'ignore';
const STDIO_PIPE = 'pipe';
const EVENT = Object.freeze({
  LINE: 'line',
  CLOSE: 'close',
  EXIT: 'exit',
  DATA: 'data',
});
const RESPONSE = Object.freeze({
  ERROR: 'error',
  READY: 'ready',
  PAGE: 'page',
  STATE: 'state',
  LATE: 'late',
  DISPOSED: 'disposed',
});
const COMMAND = Object.freeze({STATE: 'STATE', LATE: 'LATE', QUIT: 'QUIT'});
const MESSAGE = Object.freeze({
  CLOSED_BEFORE_REPLY: 'dbpage probe closed before replying',
  OUTPUT_ALREADY_CLOSED: 'dbpage probe output already closed',
});
const SOURCE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(SOURCE_DIRECTORY, '../../..');
const SQLITE_DIRECTORY = path.join(
  REPOSITORY_ROOT, 'node_modules/better-sqlite3/deps/sqlite3');
const PROBE_SOURCE = path.join(SOURCE_DIRECTORY, 'dbpage-snapshot-probe.c');
const SQLITE_SOURCE = path.join(SQLITE_DIRECTORY, 'sqlite3.c');
const COMPILE_ARGUMENTS = Object.freeze([
  '-std=c11',
  '-O1',
  '-D_POSIX_C_SOURCE=200809L',
  '-DSQLITE_ENABLE_DBPAGE_VTAB=1',
  '-DSQLITE_THREADSAFE=2',
  '-DSQLITE_OMIT_LOAD_EXTENSION=1',
  '-I', SQLITE_DIRECTORY,
  PROBE_SOURCE,
  SQLITE_SOURCE,
  '-ldl',
  '-lpthread',
  '-lm',
]);

class DbpageProbeError extends Error {
  constructor(record, stderr = '') {
    super(`${record.phase ?? PROBE_PHASE_DEFAULT} failed with SQLite code ` +
      `${record.extendedCode ?? record.code}: ${stderr.trim() || record.message}`);
    this.name = PROBE_ERROR_NAME;
    this.record = record;
  }
}

class LineQueue {
  constructor(stream) {
    this.lines = [];
    this.waiters = [];
    this.ended = false;
    const reader = createInterface({input: stream});
    reader.on(EVENT.LINE, (line) => this.push(line));
    reader.on(EVENT.CLOSE, () => this.end());
  }

  push(line) {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve(line);
    else this.lines.push(line);
  }

  end() {
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(new Error(MESSAGE.CLOSED_BEFORE_REPLY));
    }
  }

  next() {
    if (this.lines.length > 0) return Promise.resolve(this.lines.shift());
    if (this.ended) {
      return Promise.reject(new Error(MESSAGE.OUTPUT_ALREADY_CLOSED));
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({resolve, reject});
    });
  }
}

class DbpageExecutor {
  constructor(child, lines, stderr) {
    this.child = child;
    this.lines = lines;
    this.stderr = stderr;
  }

  async receive() {
    const record = JSON.parse(await this.lines.next());
    if (record.type === RESPONSE.ERROR) {
      throw new DbpageProbeError(record, this.stderr.value);
    }
    return record;
  }

  async command(command, expectedType) {
    this.child.stdin.write(`${command}\n`);
    const record = await this.receive();
    if (record.type !== expectedType) {
      throw new Error(`expected ${expectedType}, received ${record.type}`);
    }
    return record;
  }

  readPage(page) {
    return this.command(`PAGE ${page}`, RESPONSE.PAGE);
  }

  readState() {
    return this.command(COMMAND.STATE, RESPONSE.STATE);
  }

  readLate() {
    return this.command(COMMAND.LATE, RESPONSE.LATE);
  }

  async dispose() {
    if (this.child.exitCode !== null) return null;
    const record = await this.command(COMMAND.QUIT, RESPONSE.DISPOSED);
    await new Promise((resolve, reject) => {
      this.child.once(EVENT.EXIT, (code) => code === 0 ? resolve() :
        reject(new Error(`dbpage probe exited ${code}: ${this.stderr.value}`)));
    });
    return record;
  }
}

function compileDbpageProbe(outputPath) {
  execFileSync(COMPILER,
    [...COMPILE_ARGUMENTS, COMPILER_OUTPUT_ARGUMENT, outputPath], {
      cwd: REPOSITORY_ROOT,
      encoding: TEXT_ENCODING,
      stdio: [STDIO_IGNORE, STDIO_PIPE, STDIO_PIPE],
    });
  return outputPath;
}

async function openDbpageExecutor(binaryPath, databasePath) {
  const child = spawn(binaryPath, [databasePath], {
    stdio: [STDIO_PIPE, STDIO_PIPE, STDIO_PIPE],
  });
  const stderr = {value: ''};
  child.stderr.setEncoding(TEXT_ENCODING);
  child.stderr.on(EVENT.DATA, (chunk) => {
    stderr.value += chunk;
  });
  const executor = new DbpageExecutor(child, new LineQueue(child.stdout),
    stderr);
  const ready = await executor.receive();
  if (ready.type !== RESPONSE.READY) {
    throw new Error(`expected ready, received ${ready.type}`);
  }
  return {executor, ready};
}

export {
  DbpageProbeError,
  compileDbpageProbe,
  openDbpageExecutor,
};
