// Owner-scoped evidence for a lifecycle owner's terminal boundary: which
// timers and immediates the owner armed, which of them are still pending or
// referenced, which ran after the boundary, and what was created after it.
//
// An async_hooks ledger, not a global handle count. A resource belongs to the
// owner when a frame of the owner's files is on its creating stack, or when
// the resource that triggered it belongs to the owner. Ownership therefore
// follows the owner's own continuations: a promise, a nextTick or a
// microtask that the owner scheduled, and whatever those create. The ledger
// is only ever open around one in-memory composition, so every Timeout or
// Immediate created after the boundary counts, whatever created it. Only the
// calling test file's own turns are excluded.
//
// It also provides the structural census: every site in the owner's files
// that can create delayed work.

import {createHook} from 'node:async_hooks';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const TIMER_TYPES = new Set(['Timeout', 'Immediate']);
const HELPER_FILE = fileURLToPath(import.meta.url);
const FRAME_PATH = /(?:\(|at )(?:file:\/\/)?(\/[^():\s]+\.js):(\d+):\d+/u;
const STACK_DEPTH = 64;

function creatingFrames() {
  const stackTraceLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = STACK_DEPTH;
  const {stack} = new Error();
  Error.stackTraceLimit = stackTraceLimit;
  return stack.split('\n').slice(1)
    .map((line) => line.match(FRAME_PATH))
    .filter(Boolean)
    .map((match) => ({file: match[1], line: Number(match[2])}))
    .filter((frame) => frame.file !== HELPER_FILE);
}

/**
 * @param {Object} options
 * @param {RegExp} options.ownerFile - Matches a path of the owner's files.
 * @param {string} options.testFile - The calling test file; its own
 *   resources (its awaited turns) are not the owner's work.
 * @return {Object} The ledger.
 */
function createOwnerWorkLedger({ownerFile, testFile}) {
  const entries = new Map();
  const ownerIds = new Set();
  const state = {open: false, terminal: false};
  const createdAfterTerminal = [];
  const executedAfterTerminal = [];

  const hook = createHook({
    init(asyncId, type, triggerAsyncId, resource) {
      if (!state.open) {
        return;
      }
      const frames = creatingFrames();
      if (frames[0]?.file === testFile) {
        return;
      }
      const ownerFrame = frames.find((frame) => ownerFile.test(frame.file));
      const owned = Boolean(ownerFrame) || ownerIds.has(triggerAsyncId);
      if (owned) {
        ownerIds.add(asyncId);
      }
      if (!TIMER_TYPES.has(type)) {
        return;
      }
      const at = ownerFrame ?? frames[0] ?? {file: 'node internals', line: 0};
      const entry = {
        asyncId, type, resource, owned, destroyed: false,
        afterTerminal: state.terminal,
        at: `${type} at ${at.file}:${at.line}`,
      };
      entries.set(asyncId, entry);
      if (state.terminal) {
        createdAfterTerminal.push(entry.at);
      }
    },
    before(asyncId) {
      const entry = entries.get(asyncId);
      if (state.terminal && entry && (entry.owned || entry.afterTerminal)) {
        executedAfterTerminal.push(entry.at);
      }
    },
    destroy(asyncId) {
      const entry = entries.get(asyncId);
      if (entry) {
        entry.destroyed = true;
      }
    },
  });

  const pendingEntries = () => [...entries.values()].filter((entry) =>
    (entry.owned || entry.afterTerminal) && !entry.destroyed);

  return {
    open() {
      state.open = true;
      hook.enable();
    },
    // The owner's terminal boundary: call it immediately before the
    // transition, so anything the transition itself arms is after it.
    markTerminal() {
      state.terminal = true;
    },
    close() {
      state.open = false;
      hook.disable();
    },
    report() {
      const pending = pendingEntries();
      return {
        createdAfterTerminal: [...createdAfterTerminal],
        executedAfterTerminal: [...executedAfterTerminal],
        // P-Q: CDC-owned delayed work still pending (armed, not run, not
        // cleared), referenced or not.
        pending: pending.map((entry) => entry.at),
        // P-L: the pending entries that keep the process alive.
        referenced: pending
          .filter((entry) => entry.resource?.hasRef?.() !== false)
          .map((entry) => entry.at),
      };
    },
    // The execution leg's clock: run every still-pending owner callback now,
    // as if time had moved past every delay.
    runPending() {
      const ran = [];
      for (const entry of pendingEntries()) {
        const callback = entry.resource?._onTimeout ??
          entry.resource?._onImmediate;
        if (typeof callback === 'function') {
          ran.push(entry.at);
          entry.destroyed = true;
          callback.call(entry.resource);
        }
      }
      return ran;
    },
  };
}

const TIMER_TOKEN = /\b(setTimeout|setInterval|setImmediate)\b/gu;
const FORBIDDEN_IMPORT =
  /from\s+['"](?:node:)?timers(?:\/promises)?['"]|require\(\s*['"](?:node:)?timers/u;
const REFRESH_CALL = /\.refresh\s*\(/gu;
const ENCLOSING = [
  /^(?: {2}|\s*\*\/\s*)(?:static\s+|async\s+)*([A-Za-z_$][\w$]*)\s*\(/u,
  /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/u,
  /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/u,
];
const NOT_A_FUNCTION = new Set(['if', 'for', 'while', 'switch', 'catch',
  'return', 'constructor']);

// Blank comments while keeping every line and column in place.
function blankComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))
    .replace(/(^|[^:'"])\/\/[^\n]*/gu, (line, lead) =>
      lead + ' '.repeat(line.length - lead.length));
}

function enclosingFunction(lines, index) {
  for (let line = index; line >= 0; line -= 1) {
    for (const pattern of ENCLOSING) {
      const name = lines[line].match(pattern)?.[1];
      if (name && !NOT_A_FUNCTION.has(name)) {
        return name;
      }
    }
  }
  return null;
}

/**
 * The structural census of one owner's files: every site that can create
 * delayed work, named by file and enclosing function.
 * @param {string} repositoryRoot
 * @param {string[]} files - Repository-relative paths.
 * @return {Object} {timerSites, forbiddenImports, refreshCalls, text}
 */
function censusDelayedWorkSites(repositoryRoot, files) {
  const timerSites = [];
  const forbiddenImports = [];
  const refreshCalls = [];
  const text = new Map();
  for (const file of files) {
    const source = readFileSync(`${repositoryRoot}/${file}`, 'utf8');
    text.set(file, source);
    const code = blankComments(source);
    const lines = source.split('\n');
    const lineOf = (offset) => code.slice(0, offset).split('\n').length - 1;
    for (const match of code.matchAll(TIMER_TOKEN)) {
      const line = lineOf(match.index);
      timerSites.push(
        `${file}:${enclosingFunction(lines, line)}:${match[1]}`);
    }
    for (const match of code.matchAll(REFRESH_CALL)) {
      refreshCalls.push(`${file}:${lineOf(match.index) + 1}`);
    }
    if (FORBIDDEN_IMPORT.test(code)) {
      forbiddenImports.push(file);
    }
  }
  return {timerSites, forbiddenImports, refreshCalls, text};
}

export {censusDelayedWorkSites, createOwnerWorkLedger};
