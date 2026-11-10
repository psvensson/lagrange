// Placement owns the lifetime; this protocol only transports declared bytes.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {fileURLToPath} from 'node:url';

const ARTIFACT_FRAME_PREFIX = 'placement-artifact=';
const ARTIFACT_COLLECTOR_PATH = 'scripts/lab/placement-artifact-custody.js';
const ARTIFACT_LIMITS = Object.freeze({
  FILES: 4, FILE_BYTES: 1024 * 1024, TOTAL_BYTES: 4 * 1024 * 1024,
  REQUEST_BYTES: 8192, METADATA_BYTES: 8192, PATH_CHARACTERS: 512,
  ID_CHARACTERS: 128, COLLECTOR_MS: 2000, SUPERVISOR_MS: 3000, RELAY_CHUNK_BYTES: 64 * 1024,
  ENTRY_SECONDS: 3,
});
const ENCODING = Object.freeze({UTF8: 'utf8', BASE64: 'base64', HEX: 'hex'});
const HASH = 'sha256';
const BYTE_ENCODING_RATIO = 4 / 3;
const BASE64_QUANTUM = 4;
const BASE64_SOURCE_QUANTUM = 3;
const MAX_EXIT_STATUS = 255;
const MIN_PATH_CODE_POINT = 32;
const DELETE_CODE_POINT = 127;
const FRAME_MAX_CHARACTERS =
  Math.ceil(ARTIFACT_LIMITS.FILE_BYTES * BYTE_ENCODING_RATIO) + ARTIFACT_LIMITS.METADATA_BYTES;
const RELAY_MAX_BYTES =
  Math.ceil(ARTIFACT_LIMITS.TOTAL_BYTES * BYTE_ENCODING_RATIO) +
  ARTIFACT_LIMITS.METADATA_BYTES * (ARTIFACT_LIMITS.FILES + 2);
const FRAME = Object.freeze({FILE: 'file', TERMINAL: 'terminal', UNAVAILABLE: 'unavailable'});
const STATE = Object.freeze({COMPLETE: 'complete', INCOMPLETE: 'incomplete',
  SAVED: 'saved', OPTIONAL_MISSING: 'optional-missing'});
const REASON = Object.freeze({
  DECLARATION: 'invalid-declaration', IDENTITY: 'invalid-identity',
  DUPLICATE_PATH: 'duplicate-path', MISSING: 'source-missing', SYMLINK: 'source-symlink',
  NONFILE: 'source-not-regular', OVERSIZE: 'source-oversize', CHANGED: 'source-changed',
  READ: 'source-read-error', DESTINATION: 'destination-unavailable',
  WRITE: 'destination-write-failed', FRAME: 'invalid-frame', ORDER: 'frame-order',
  RELAY_READ: 'relay-read-error',
  FRAME_BOUND: 'frame-bound-exceeded', HASH: 'hash-mismatch',
  TERMINAL: 'terminal-missing', TRUNCATED: 'transport-truncated',
  SUMMARY: 'terminal-mismatch', COLLECTOR: 'collector-error',
  TIMEOUT: 'collector-timeout', UNAVAILABLE: 'collector-unavailable',
  SETUP: 'placement-setup-failed',
});
const FILE_FAILURES = new Set([REASON.MISSING, REASON.SYMLINK, REASON.NONFILE,
  REASON.OVERSIZE, REASON.CHANGED, REASON.READ]);
const MODE = Object.freeze({SUPERVISE: 'supervise', COLLECT: 'collect'});
const RELAY_KIND = Object.freeze({ARTIFACTS: 'artifacts', DIAGNOSTICS: 'diagnostics'});
const IO = Object.freeze({READ: 'r', CREATE: 'wx', MISSING: 'ENOENT', EXISTS: 'EEXIST',
  TIMEOUT: 'ETIMEDOUT', KILL: 'SIGKILL', NEWLINE: '\n', SEPARATOR: '/',
  BACKSLASH: '\\', CURRENT: '.', PARENT: '..', CUSTODY: 'custody.json',
  IGNORE: 'ignore', INHERIT: 'inherit', PIPE: 'pipe'});
const RETAINED_DIRECTORY = 'test-output/placement-artifacts';
const CLI_ARGUMENT_OFFSET = 2;
const COLLECTOR_SOURCE = fileURLToPath(import.meta.url);
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u;
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

function requireFact(condition, reason) {
  if (!condition) throw new Error(reason);
}

function declarationsOf(artifacts) {
  requireFact(Array.isArray(artifacts) && artifacts.length > 0 &&
    artifacts.length <= ARTIFACT_LIMITS.FILES, REASON.DECLARATION);
  const declared = artifacts.map((entry) => {
    const file = entry?.path;
    requireFact(typeof file === 'string' && file.length > 0 &&
      file.length <= ARTIFACT_LIMITS.PATH_CHARACTERS &&
      !file.includes(IO.BACKSLASH) && [...file].every((character) =>
      character.codePointAt(0) >= MIN_PATH_CODE_POINT &&
      character.codePointAt(0) !== DELETE_CODE_POINT) &&
      file !== IO.CUSTODY && file.split(IO.SEPARATOR).every((part) =>
      part.length > 0 && part !== IO.CURRENT && part !== IO.PARENT), REASON.DECLARATION);
    requireFact(typeof entry.required === 'boolean' && Number.isSafeInteger(entry.maxBytes) &&
      entry.maxBytes > 0 && entry.maxBytes <= ARTIFACT_LIMITS.FILE_BYTES, REASON.DECLARATION);
    return Object.freeze({path: file, required: entry.required, maxBytes: entry.maxBytes});
  });
  requireFact(new Set(declared.map((entry) => entry.path)).size === declared.length,
    REASON.DUPLICATE_PATH);
  return Object.freeze(declared);
}

function bindingOf(binding) {
  requireFact(SHA_PATTERN.test(binding?.candidate) && SHA_PATTERN.test(binding?.base) &&
    [binding?.run, binding?.host].every((value) => typeof value === 'string' &&
      value.length <= ARTIFACT_LIMITS.ID_CHARACTERS && ID_PATTERN.test(value)), REASON.IDENTITY);
  return Object.freeze({candidate: binding.candidate, base: binding.base,
    run: binding.run, host: binding.host});
}

function requestOf(artifacts, binding) {
  return Object.freeze({binding: bindingOf(binding), declared: declarationsOf(artifacts)});
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function digest(bytes) {
  return createHash(HASH).update(bytes).digest(ENCODING.HEX);
}

function frameLine(frame) {
  return `${ARTIFACT_FRAME_PREFIX}${JSON.stringify(frame)}${IO.NEWLINE}`;
}

function failureFrame(request, reason) {
  return {kind: FRAME.UNAVAILABLE, binding: request.binding, reason};
}

function directoryChild(parent, name, fresh = false) {
  const directory = path.join(parent, name);
  try {
    fs.mkdirSync(directory);
  } catch (error) {
    if (fresh || error.code !== IO.EXISTS) throw error;
  }
  const stat = fs.lstatSync(directory);
  requireFact(stat.isDirectory() && !stat.isSymbolicLink(), REASON.DESTINATION);
  return directory;
}

function freshDestination(root, binding) {
  let directory = fs.realpathSync(root);
  for (const part of RETAINED_DIRECTORY.split(IO.SEPARATOR)) {
    directory = directoryChild(directory, part);
  }
  return directoryChild(directory, `${binding.run}-${binding.host}`, true);
}

function retainFile(directory, file, bytes) {
  let parent = directory;
  const parts = file.split(IO.SEPARATOR);
  for (const part of parts.slice(0, -1)) parent = directoryChild(parent, part);
  fs.writeFileSync(path.join(parent, parts.at(-1)), bytes, {flag: IO.CREATE});
}

function completeFiles(files) {
  return files.every((file) => file.state === STATE.SAVED ||
    (!file.required && file.state === STATE.OPTIONAL_MISSING));
}

function summaryOf(frame) {
  return {index: frame.index, path: frame.path, required: frame.required,
    state: frame.state, bytes: frame.bytes, sha256: frame.sha256};
}

function decodeFile(frame, entry, remaining) {
  requireFact(Number.isSafeInteger(frame.bytes) && frame.bytes >= 0 &&
    frame.bytes <= entry.maxBytes && frame.bytes <= remaining, REASON.FRAME_BOUND);
  requireFact(typeof frame.data === 'string' &&
    frame.data.length === BASE64_QUANTUM * Math.ceil(frame.bytes / BASE64_SOURCE_QUANTUM) &&
    BASE64_PATTERN.test(frame.data) && HASH_PATTERN.test(frame.sha256), REASON.FRAME);
  const bytes = Buffer.from(frame.data, ENCODING.BASE64);
  requireFact(bytes.length === frame.bytes && bytes.toString(ENCODING.BASE64) === frame.data,
    REASON.FRAME);
  requireFact(digest(bytes) === frame.sha256, REASON.HASH);
  return bytes;
}

// All controller failures are sideband. A missing source is distinct from a
// missing terminal: the latter means custody was lost, not that a file was absent.
function createPlacementArtifactCustody({root, artifacts, binding}) {
  const reasons = new Set();
  const files = [];
  let request;
  let directory = null;
  let terminal = null;
  let receivedBytes = 0;
  try {
    request = requestOf(artifacts, binding);
  } catch (error) {
    reasons.add(error.message);
  }
  if (request) {
    try {
      directory = freshDestination(root, request.binding);
    } catch {
      reasons.add(REASON.DESTINATION);
    }
  }
  const retainSavedFrame = (frame, entry) => {
    const bytes = decodeFile(frame, entry, ARTIFACT_LIMITS.TOTAL_BYTES - receivedBytes);
    receivedBytes += bytes.length;
    if (directory) {
      try {
        retainFile(directory, entry.path, bytes);
      } catch {
        reasons.add(REASON.WRITE);
      }
    }
  };
  const acceptFile = (frame) => {
    const entry = request.declared[files.length];
    requireFact(!terminal && entry && frame.index === files.length &&
      frame.path === entry.path && frame.required === entry.required, REASON.ORDER);
    if (frame.state === STATE.SAVED) {
      retainSavedFrame(frame, entry);
    } else {
      requireFact(frame.bytes === 0 && frame.sha256 === null && frame.data === undefined &&
        (FILE_FAILURES.has(frame.state) ||
          (!entry.required && frame.state === STATE.OPTIONAL_MISSING)), REASON.FRAME);
    }
    files.push(summaryOf(frame));
  };
  const acceptTerminal = (frame) => {
    requireFact(!terminal && frame.index === request.declared.length &&
      files.length === request.declared.length, REASON.ORDER);
    const state = completeFiles(files) ? STATE.COMPLETE : STATE.INCOMPLETE;
    requireFact(same(frame.declared, request.declared) && same(frame.files, files) &&
      frame.state === state && Number.isInteger(frame.exitStatus) && frame.exitStatus >= 0 &&
      frame.exitStatus <= MAX_EXIT_STATUS, REASON.SUMMARY);
    terminal = frame;
  };
  const accept = (line) => {
    if (!line.startsWith(ARTIFACT_FRAME_PREFIX)) return false;
    try {
      requireFact(request && line.length <= FRAME_MAX_CHARACTERS, REASON.FRAME_BOUND);
      const frame = JSON.parse(line.slice(ARTIFACT_FRAME_PREFIX.length));
      requireFact(same(frame.binding, request.binding), REASON.IDENTITY);
      switch (frame.kind) {
      case FRAME.FILE: acceptFile(frame); break;
      case FRAME.TERMINAL: acceptTerminal(frame); break;
      case FRAME.UNAVAILABLE:
        requireFact([REASON.COLLECTOR, REASON.TIMEOUT, REASON.UNAVAILABLE].includes(frame.reason),
          REASON.FRAME);
        reasons.add(frame.reason);
        break;
      default: throw new Error(REASON.FRAME);
      }
    } catch (error) {
      reasons.add(Object.values(REASON).includes(error.message) ? error.message : REASON.FRAME);
    }
    return true;
  };
  const recordFileFailures = () => {
    for (const file of files) {
      if (file.state !== STATE.SAVED && file.state !== STATE.OPTIONAL_MISSING) {
        reasons.add(file.state);
      }
    }
  };
  const retainEnvelope = (envelope) => {
    if (directory) {
      try {
        fs.writeFileSync(path.join(directory, IO.CUSTODY),
          `${JSON.stringify(envelope, null, 2)}${IO.NEWLINE}`, {flag: IO.CREATE});
      } catch {
        return {...envelope, state: STATE.INCOMPLETE, reasons: [...reasons, REASON.WRITE]};
      }
    }
    return envelope;
  };
  const finish = (failure = null) => {
    if (failure) reasons.add(failure);
    if (!terminal) reasons.add(REASON.TERMINAL);
    recordFileFailures();
    const state = reasons.size === 0 ? STATE.COMPLETE : STATE.INCOMPLETE;
    const envelope = {state, binding: request?.binding ?? binding, directory,
      declared: request?.declared ?? [], files, reasons: [...reasons],
      exitStatus: terminal?.exitStatus ?? null};
    return retainEnvelope(envelope);
  };
  const readLog = (file) => {
    try {
      return fs.readFileSync(file, ENCODING.UTF8);
    } catch {
      reasons.add(REASON.RELAY_READ);
      return '';
    }
  };
  return {request, accept, finish,
    readLog,
    incomplete: (reason) => reasons.add(reason),
    unavailableLine: request ? frameLine(failureFrame(request, REASON.UNAVAILABLE)).trimEnd() : ''};
}

// A bounded reader for the opted-in relay. Oversize/truncated frames are never
// assembled or decoded; the original log file remains the raw evidence.
function followPlacementArtifactRelay(file, onLine, custody, pollMs, kind = RELAY_KIND.ARTIFACTS) {
  let offset = 0;
  let partial = '';
  let dropping = false;
  let unreadable = false;
  const framed = kind === RELAY_KIND.ARTIFACTS;
  const decoder = new StringDecoder(ENCODING.UTF8);
  const consume = (text) => {
    for (const [index, part] of text.split(IO.NEWLINE).entries()) {
      if (index > 0) {
        if (!dropping && partial && (!framed || !custody.accept(partial))) onLine?.(partial);
        partial = '';
        dropping = false;
      }
      if (dropping) continue;
      if (partial.length + part.length > FRAME_MAX_CHARACTERS) {
        if (framed && `${partial}${part.slice(0, ARTIFACT_FRAME_PREFIX.length)}`
          .startsWith(ARTIFACT_FRAME_PREFIX)) custody.incomplete(REASON.FRAME_BOUND);
        partial = '';
        dropping = true;
      } else {
        partial += part;
      }
    }
  };
  const drain = () => {
    if (unreadable) return;
    try {
      const descriptor = fs.openSync(file, IO.READ);
      try {
        const buffer = Buffer.alloc(ARTIFACT_LIMITS.RELAY_CHUNK_BYTES);
        let count;
        while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, offset)) > 0) {
          offset += count;
          consume(decoder.write(buffer.subarray(0, count)));
        }
      } finally {
        fs.closeSync(descriptor);
      }
    } catch {
      unreadable = true;
      custody.incomplete(REASON.RELAY_READ);
    }
  };
  const timer = setInterval(drain, pollMs);
  return () => {
    clearInterval(timer);
    drain();
    consume(decoder.end());
    if (framed && partial.startsWith(ARTIFACT_FRAME_PREFIX)) custody.incomplete(REASON.TRUNCATED);
    else if (partial) onLine?.(partial);
  };
}

function sourceStat(root, file) {
  let location = root;
  const rootStat = fs.lstatSync(root);
  requireFact(rootStat.isDirectory() && !rootStat.isSymbolicLink(), REASON.SYMLINK);
  const parts = file.split(IO.SEPARATOR);
  for (const [index, part] of parts.entries()) {
    location = path.join(location, part);
    const stat = fs.lstatSync(location);
    requireFact(!stat.isSymbolicLink(), REASON.SYMLINK);
    requireFact(index === parts.length - 1 ? stat.isFile() : stat.isDirectory(), REASON.NONFILE);
  }
  return fs.lstatSync(location);
}

function unchanged(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size &&
    before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
}

function readArtifact(root, entry, remaining) {
  const before = sourceStat(root, entry.path);
  requireFact(before.size <= entry.maxBytes && before.size <= remaining, REASON.OVERSIZE);
  const descriptor = fs.openSync(path.join(root, entry.path),
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const opened = fs.fstatSync(descriptor);
    requireFact(opened.isFile() && unchanged(before, opened), REASON.CHANGED);
    const bytes = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(descriptor, bytes, offset, bytes.length - offset, null);
      requireFact(count > 0, REASON.CHANGED);
      offset += count;
    }
    const extra = Buffer.alloc(1);
    requireFact(fs.readSync(descriptor, extra, 0, 1, null) === 0 &&
      unchanged(opened, fs.fstatSync(descriptor)) &&
      unchanged(opened, sourceStat(root, entry.path)), REASON.CHANGED);
    return bytes;
  } finally {
    fs.closeSync(descriptor);
  }
}

function collectFile(root, entry, remaining) {
  try {
    const bytes = readArtifact(root, entry, remaining);
    return {state: STATE.SAVED, bytes: bytes.length, sha256: digest(bytes),
      data: bytes.toString(ENCODING.BASE64)};
  } catch (error) {
    const state = error.code === IO.MISSING ?
      (entry.required ? REASON.MISSING : STATE.OPTIONAL_MISSING) :
      (FILE_FAILURES.has(error.message) ? error.message : REASON.READ);
    return {state, bytes: 0, sha256: null};
  }
}

function collectArtifacts(root, request, exitStatus) {
  let total = 0;
  const files = [];
  for (const [index, entry] of request.declared.entries()) {
    const captured = collectFile(root, entry, ARTIFACT_LIMITS.TOTAL_BYTES - total);
    total += captured.bytes;
    const frame = {kind: FRAME.FILE, binding: request.binding, index,
      path: entry.path, required: entry.required, ...captured};
    files.push(summaryOf(frame));
    process.stdout.write(frameLine(frame));
  }
  process.stdout.write(frameLine({kind: FRAME.TERMINAL, binding: request.binding,
    index: request.declared.length, declared: request.declared, files, exitStatus,
    state: completeFiles(files) ? STATE.COMPLETE : STATE.INCOMPLETE}));
}

function superviseCollection(root, request, exitStatus) {
  // The worker's bound includes flushing its frames. The supervisor's final
  // small failure frame also has a bound if the transport has stopped reading.
  const cut = setTimeout(() => process.exit(0), ARTIFACT_LIMITS.SUPERVISOR_MS);
  const result = spawnSync(process.execPath, [COLLECTOR_SOURCE, MODE.COLLECT, root,
    JSON.stringify(request), String(exitStatus)], {
    timeout: ARTIFACT_LIMITS.COLLECTOR_MS, killSignal: IO.KILL, maxBuffer: RELAY_MAX_BYTES,
    encoding: ENCODING.UTF8, stdio: [IO.IGNORE, IO.INHERIT, IO.PIPE],
  });
  if (result.status !== 0 || result.error) {
    const reason = result.error?.code === IO.TIMEOUT ? REASON.TIMEOUT : REASON.COLLECTOR;
    process.stdout.write(`${IO.NEWLINE}${frameLine(failureFrame(request, reason))}`,
      () => clearTimeout(cut));
  } else {
    clearTimeout(cut);
  }
}

function runCollector() {
  const [mode, root, text, status] = process.argv.slice(CLI_ARGUMENT_OFFSET);
  requireFact(typeof text === 'string' && text.length <= ARTIFACT_LIMITS.REQUEST_BYTES,
    REASON.DECLARATION);
  const input = JSON.parse(text);
  const request = requestOf(input.declared, input.binding);
  const exitStatus = Number(status);
  requireFact(Number.isInteger(exitStatus), REASON.DECLARATION);
  if (mode === MODE.SUPERVISE) superviseCollection(root, request, exitStatus);
  else if (mode === MODE.COLLECT) collectArtifacts(root, request, exitStatus);
  else throw new Error(REASON.DECLARATION);
}

if (process.argv[1] && path.resolve(process.argv[1]) === COLLECTOR_SOURCE) runCollector();

export {ARTIFACT_COLLECTOR_PATH, ARTIFACT_FRAME_PREFIX, ARTIFACT_LIMITS, MODE, REASON, RELAY_KIND,
  createPlacementArtifactCustody, followPlacementArtifactRelay};
