/**
 * The in-process half of the necessity trap (scripts/checks/fallback-necessity-trap.js
 * documents the experiment): applying a plan's precomputed insertions to a
 * module's source, deciding which arms throw, and recording every arm that
 * ran. The preload (fallback-necessity-trap-preload.js) wires it into a
 * process; tests drive it directly. It parses nothing: every edit was
 * computed and syntax-checked when the plan was built.
 *
 * Rewrite: a file is rewritten only when every planned site's slice hash,
 * sha256(file + "\n" + text.slice(range)), reproduces on the text being
 * loaded. One mismatch refuses the whole file with NecessityTrapPlanDriftError
 * (code LAGRANGE_NECESSITY_TRAP_DRIFT): a plan never lands on text it was not
 * built from, and a refused file is never silently loaded unarmed. Insertions
 * add no line breaks, so line numbers in stacks stay true; a trailing marker
 * line makes a second application a no-op.
 *
 * Arms: an arm id is `<site id>#<term>` (term = the chain term index for a
 * two-source read, 0 otherwise). Calling the trap global records the arm:
 * count, throws, and at its first hit in this thread the first stack frame
 * outside the site's file (`caller`, `async` when V8 reached it through an
 * await, `detached` when no frame outside the file exists: a timer or event
 * callback). The first hit of every arm is written to disk at once, so a
 * caller that swallows the throw or a process that is SIGKILLed cannot hide
 * it; counts are written on flush.
 *
 * Selection (throw mode): comma- or newline-separated tokens `site:ID`,
 * `arm:ID`, `bucket:N1`, `row:ROW`, `file:PATH` (a path ending in `/` is a
 * prefix); `!TOKEN` excludes; `@FILE` reads tokens from a file. An arm throws
 * when some include token matches it and no exclude token does.
 *
 * Governed by the ambient-intrinsic audit: prototype methods are captured at
 * module load.
 */
import {createHash, randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringLastIndexOf = Function.call.bind(String.prototype.lastIndexOf);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const ErrorConstructor = Error;
const captureStackTrace = Error.captureStackTrace;
const jsonStringify = JSON.stringify;
const objectKeys = Object.keys;

const TRAP_ENV = Object.freeze({
  PLAN: 'LAGRANGE_NECESSITY_TRAP_PLAN',
  MODE: 'LAGRANGE_NECESSITY_TRAP_MODE',
  OUT: 'LAGRANGE_NECESSITY_TRAP_OUT',
  SELECT: 'LAGRANGE_NECESSITY_TRAP_SELECT',
  ROOT: 'LAGRANGE_NECESSITY_TRAP_ROOT',
});
const TRAP_MODE = Object.freeze({OBSERVE: 'observe', THROW: 'throw'});
const TRAP_MODES = Object.freeze(Object.values(TRAP_MODE));
// The global the rewritten source calls; defined by the preload only.
const TRAP_GLOBAL = '__lagrangeNecessityTrap';
const TRAP_MARKER = '\n//# lagrange-necessity-trap\n';
const PLAN_SCHEMA = 'fallback-necessity-trap-plan/1';
const OBSERVATION_SCHEMA = 'fallback-necessity-trap-observation/2';
const OBSERVATION_PREFIX = 'trap-';
const OBSERVATION_SUFFIX = '.json';
const TEMPORARY_SUFFIX = '.tmp';
const NAME_SEPARATOR = '-';
const TRAP_ERROR_CODE = 'LAGRANGE_NECESSITY_TRAP';
const ARMS_NOTHING_CODE = 'LAGRANGE_NECESSITY_TRAP_ARMS_NOTHING';
const OBSERVATION_EXISTS_CODE = 'LAGRANGE_NECESSITY_TRAP_OBSERVATION_EXISTS';
const ALREADY_EXISTS = 'EEXIST';
const EXCLUSIVE_CREATE = 'wx';
const START_TOKEN_BYTES = 6;
const TOKEN_ENCODING = 'hex';
const SELECTION_JOIN = ',';
const DRIFT_ERROR_CODE = 'LAGRANGE_NECESSITY_TRAP_DRIFT';
const DRIFT_REASON = 'slice-hash-mismatch';
const ARM_SEPARATOR = '#';
const HASH_SEPARATOR = '\n';
const DIGEST_ALGORITHM = 'sha256';
const DIGEST_ENCODING = 'hex';
const TEXT_ENCODING = 'utf8';
const PATH_SEPARATOR = '/';
const LIST_SEPARATOR = ', ';
const SELECTION_SEPARATOR = /[\s,]+/u;
const SELECTION_FILE_PREFIX = '@';
const SELECTION_EXCLUDE_PREFIX = '!';
const SELECTION_KEY_SEPARATOR = ':';
const SELECTION_KEY = Object.freeze({
  SITE: 'site', ARM: 'arm', BUCKET: 'bucket', ROW: 'row', FILE: 'file',
});
const SELECTION_KEYS = Object.freeze(Object.values(SELECTION_KEY));
const STACK_FRAMES = 64;
const STACK_LINE_SEPARATOR = '\n';
const FRAME_PREFIX = 'at ';
const ASYNC_FRAME_PREFIX = 'at async ';
const FRAME_LOCATION_OPEN = '(';
const FRAME_LOCATION_CLOSE = ')';
const FILE_URL_PREFIX = 'file:';
const LOCATION_FIELD_SEPARATOR = ':';
const LOCATION_SUFFIX_FIELDS = 2;
const PARENT_SEGMENT = '..';
const UNKNOWN_ARM = Object.freeze({
  site: null, file: null, line: null, bucket: null, row: null, term: null,
});
const PROBLEM = Object.freeze({
  MODE: `${TRAP_ENV.MODE} must be one of: `,
  OUT: `${TRAP_ENV.OUT} must name a writable directory`,
  PLAN_SCHEMA: `the plan is not ${PLAN_SCHEMA}: `,
  THROW_NEEDS_SELECTION: `throw mode needs an include token in ${TRAP_ENV.SELECT}`,
  ARMS_NOTHING: 'throw mode refused: the selection arms no planned arm: ',
  OBSERVATION_EXISTS: 'necessity trap: refused to overwrite an earlier observation: ',
  SELECTION_TOKEN: 'unrecognised selection token: ',
});

function sha256(text) {
  return createHash(DIGEST_ALGORITHM).update(text).digest(DIGEST_ENCODING);
}

/** The typed error a throw-mode arm raises instead of running. */
class NecessityTrapError extends ErrorConstructor {
  /**
   * @param {Object} arm the arm record (id, site, file, line, bucket, term)
   * @param {*} cause the error a trapped catch arm received, if any
   */
  constructor(arm, cause) {
    super(`necessity trap: arm ${arm.id} of site ${arm.site} (${arm.bucket}, ${arm.row}) ` +
      `at ${arm.file}:${arm.line} was armed to throw`, cause === undefined ? undefined : {cause});
    this.name = new.target.name;
    this.code = TRAP_ERROR_CODE;
    this.siteId = arm.site;
    this.armId = arm.id;
    this.file = arm.file;
    this.line = arm.line;
    this.bucket = arm.bucket;
  }
}

/** A planned file whose text no longer matches the plan. */
class NecessityTrapPlanDriftError extends ErrorConstructor {
  /**
   * @param {string} file the refused file
   * @param {string[]} siteIds the sites whose slice hash did not reproduce
   */
  constructor(file, siteIds) {
    super(`necessity trap: refused ${file}: the plan's slice hash does not reproduce for ` +
      `${siteIds.join(LIST_SEPARATOR)}; rebuild the plan at this checkout`);
    this.name = new.target.name;
    this.code = DRIFT_ERROR_CODE;
    this.file = file;
    this.siteIds = siteIds;
    this.reason = DRIFT_REASON;
  }
}

// Every planned arm by id. An arm is `<site id>#<side><term>`: side `f`
// (the fallback side) or `p` (the primary side, armed for N2 sites), term the
// chain term index (0 for a typeof or catch site), so one id names one side
// of one site whichever census the plan was built with.
function armRecords(plan) {
  const arms = new Map();
  for (const file of objectKeys(plan.files)) {
    for (const site of plan.files[file].sites) {
      for (const term of site.arms) {
        const id = `${site.id}${ARM_SEPARATOR}${term}`;
        arms.set(id, {id, site: site.id, file, line: site.line, bucket: site.bucket,
          row: site.row, term});
      }
    }
  }
  return arms;
}

/**
 * The ids of the planned arms a selection arms, sorted.
 * @param {Object} plan a trap plan
 * @param {Object} selection parseSelection's answer
 * @return {string[]} the armed arm ids
 */
function selectedArmIds(plan, selection) {
  const ids = [];
  for (const arm of armRecords(plan).values()) {
    if (armSelected(selection, arm)) ids.push(arm.id);
  }
  return ids.sort();
}

function applyInsertions(text, insertions) {
  const parts = [];
  let previous = 0;
  for (const [at, inserted] of insertions) {
    parts.push(stringSlice(text, previous, at), inserted);
    previous = at;
  }
  parts.push(stringSlice(text, previous));
  return parts.join('');
}

/**
 * The trap-armed text of a planned file, or the text unchanged when it is
 * not planned or already armed; throws NecessityTrapPlanDriftError when a
 * planned slice does not reproduce.
 * @param {Object} plan a trap plan
 * @param {string} file repo-relative path
 * @param {string} text the source being loaded
 * @return {string} the source to load
 */
function rewriteSource(plan, file, text) {
  const entry = Object.hasOwn(plan.files, file) ? plan.files[file] : undefined;
  if (!entry || stringEndsWith(text, TRAP_MARKER)) return text;
  const drifted = arrayMap(arrayFilter(entry.sites, (site) =>
    sha256(`${file}${HASH_SEPARATOR}${stringSlice(text, site.range[0], site.range[1])}`) !==
      site.hash), (site) => site.id);
  if (drifted.length > 0) throw new NecessityTrapPlanDriftError(file, drifted);
  return `${applyInsertions(text, entry.insertions)}${TRAP_MARKER}`;
}

function parseSelectionTokens(spec, readText) {
  const tokens = [];
  for (const raw of stringSplit(stringTrim(String(spec || '')), SELECTION_SEPARATOR)) {
    if (raw.length === 0) continue;
    if (stringStartsWith(raw, SELECTION_FILE_PREFIX)) {
      tokens.push(...parseSelectionTokens(readText(stringSlice(raw, 1)), readText));
    } else {
      tokens.push(raw);
    }
  }
  return tokens;
}

/**
 * A selection spec as include and exclude matchers.
 * @param {string} spec the selection text (see the header)
 * @param {Function} readText reads an `@FILE` token's file
 * @return {{include: Array, exclude: Array, spec: string}} the selection
 */
function parseSelection(spec, readText = (file) => fs.readFileSync(file, TEXT_ENCODING)) {
  const include = [];
  const exclude = [];
  const tokens = parseSelectionTokens(spec, readText);
  for (const token of tokens) {
    const excluded = stringStartsWith(token, SELECTION_EXCLUDE_PREFIX);
    const body = excluded ? stringSlice(token, 1) : token;
    const split = stringIndexOf(body, SELECTION_KEY_SEPARATOR);
    const key = stringSlice(body, 0, split);
    if (split <= 0 || !arrayIncludes(SELECTION_KEYS, key)) {
      throw new ErrorConstructor(`${PROBLEM.SELECTION_TOKEN}${token}`);
    }
    (excluded ? exclude : include).push({key, value: stringSlice(body, split + 1)});
  }
  // The tokens themselves, `@FILE` expanded, so a result names what armed it.
  return {include, exclude, spec: tokens.join(SELECTION_JOIN)};
}

function matcherHolds(matcher, arm) {
  switch (matcher.key) {
  case SELECTION_KEY.SITE: return arm.site === matcher.value;
  case SELECTION_KEY.ARM: return arm.id === matcher.value;
  case SELECTION_KEY.BUCKET: return arm.bucket === matcher.value;
  case SELECTION_KEY.ROW: return arm.row === matcher.value;
  default: return stringEndsWith(matcher.value, PATH_SEPARATOR) ?
    stringStartsWith(arm.file, matcher.value) : arm.file === matcher.value;
  }
}

function armSelected(selection, arm) {
  return arraySome(selection.include, (matcher) => matcherHolds(matcher, arm)) &&
    !arraySome(selection.exclude, (matcher) => matcherHolds(matcher, arm));
}

// One V8 stack frame (`at fn (file:///x.js:3:4)`, `at file:///x.js:3:4`,
// `at async fn (...)`) as its function text, its path and its line:column.
function parseFrame(line) {
  const asyncFrame = stringStartsWith(line, ASYNC_FRAME_PREFIX);
  const text = stringSlice(line, (asyncFrame ? ASYNC_FRAME_PREFIX : FRAME_PREFIX).length);
  const open = stringLastIndexOf(text, FRAME_LOCATION_OPEN);
  const parenthesised = open >= 0 && stringEndsWith(text, FRAME_LOCATION_CLOSE);
  const located = parenthesised ? stringSlice(text, open + 1, -1) : text;
  const fields = stringSplit(located, LOCATION_FIELD_SEPARATOR);
  const suffixFields = fields.length > LOCATION_SUFFIX_FIELDS ? LOCATION_SUFFIX_FIELDS : 0;
  const where = fields.slice(0, fields.length - suffixFields).join(LOCATION_FIELD_SEPARATOR);
  return {
    async: asyncFrame,
    name: parenthesised ? stringTrim(stringSlice(text, 0, open)) : '',
    where: stringStartsWith(where, FILE_URL_PREFIX) ? fileURLToPath(where) : where,
    position: fields.slice(fields.length - suffixFields).join(LOCATION_FIELD_SEPARATOR),
  };
}

/**
 * The first stack frame in a source file other than the site's, relative to
 * root. Node-internal and anonymous frames are passed over, so an arm reached
 * from a timer or an event callback has no caller and is `detached`.
 * @param {string} stack an Error stack
 * @param {string} absoluteFile the site file's absolute path
 * @param {string} root the plan root
 * @return {{caller: string|null, async: boolean, detached: boolean}} attribution
 */
function callerOutside(stack, absoluteFile, root) {
  for (const raw of stringSplit(String(stack), STACK_LINE_SEPARATOR)) {
    const line = stringTrim(raw);
    if (!stringStartsWith(line, FRAME_PREFIX)) continue;
    const frame = parseFrame(line);
    if (frame.where === absoluteFile || !path.isAbsolute(frame.where)) continue;
    const relative = stringSplit(path.relative(root, frame.where), path.sep)
      .join(PATH_SEPARATOR);
    const located = frame.position.length > 0 ?
      `${relative}${LOCATION_FIELD_SEPARATOR}${frame.position}` : relative;
    return {
      caller: frame.name.length > 0 ? `${frame.name} ${located}` : located,
      async: frame.async,
      detached: false,
    };
  }
  return {caller: null, async: false, detached: true};
}

function writeAtomically(file, text) {
  const temporary = `${file}${TEMPORARY_SUFFIX}`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, file);
}

// The first write of a thread's observation creates its file exclusively: a
// file already there belongs to another process start and is never replaced.
function createExclusively(file, text) {
  try {
    fs.writeFileSync(file, text, {flag: EXCLUSIVE_CREATE});
  } catch (error) {
    if (error?.code !== ALREADY_EXISTS) throw error;
    const exists = new ErrorConstructor(`${PROBLEM.OBSERVATION_EXISTS}${file}`, {cause: error});
    exists.code = OBSERVATION_EXISTS_CODE;
    throw exists;
  }
}

function refuseVacuousThrow(mode, selection, plan) {
  if (mode !== TRAP_MODE.THROW) return 0;
  if (selection.include.length === 0) throw new ErrorConstructor(PROBLEM.THROW_NEEDS_SELECTION);
  const armed = selectedArmIds(plan, selection).length;
  if (armed === 0) {
    const vacuous = new ErrorConstructor(`${PROBLEM.ARMS_NOTHING}${selection.spec}`);
    vacuous.code = ARMS_NOTHING_CODE;
    throw vacuous;
  }
  return armed;
}

/**
 * One thread's recorder: the trap function the rewritten code calls, and
 * its observation file.
 * @param {Object} options `{plan, planDigest, mode, selection, outDir, root,
 *   processKey, entry, fileName, pid, threadId, startedAt, roster}`; roster
 *   is whether the census roster records this lane's launches in outDir
 * @return {Object} `{trap, noteLoaded, noteRefused, noteSurfaced, flush,
 *   snapshot, armed}`
 */
function createTrapRecorder(options) {
  const {plan, planDigest, mode, selection, outDir, root, processKey, entry} = options;
  if (!arrayIncludes(TRAP_MODES, mode)) {
    throw new ErrorConstructor(`${PROBLEM.MODE}${TRAP_MODES.join(LIST_SEPARATOR)}`);
  }
  const armedCount = refuseVacuousThrow(mode, selection, plan);
  const arms = armRecords(plan);
  const hits = new Map();
  const loaded = new Set();
  const refused = new Map();
  const target = path.join(outDir, options.fileName);
  let created = false;

  function snapshot() {
    const armsOut = {};
    for (const id of [...hits.keys()].sort()) armsOut[id] = hits.get(id);
    return {
      schema: OBSERVATION_SCHEMA, plan: planDigest, head: plan.head, mode,
      selection: selection.spec, armed: armedCount, process: processKey,
      pid: options.pid ?? null, threadId: options.threadId ?? null,
      startedAt: options.startedAt ?? null, roster: options.roster === true,
      entry: entry ?? null, loaded: [...loaded].sort(),
      refused: arrayMap([...refused.keys()].sort(), (file) => ({file, reason: refused.get(file)})),
      arms: armsOut,
    };
  }

  function flush() {
    const text = `${jsonStringify(snapshot())}\n`;
    if (created) {
      writeAtomically(target, text);
      return;
    }
    createExclusively(target, text);
    created = true;
  }

  // A marker error that reached the process's uncaught handler surfaced.
  function noteSurfaced(error) {
    const hit = error?.code === TRAP_ERROR_CODE ? hits.get(error.armId) : undefined;
    if (!hit) return;
    hit.surfaced += 1;
    flush();
  }

  // An id the plan does not know cannot come from a plan's rewrite; it is
  // still recorded (with no site) rather than dropped.
  function firstHit(arm) {
    const holder = {};
    const limit = ErrorConstructor.stackTraceLimit;
    ErrorConstructor.stackTraceLimit = STACK_FRAMES;
    captureStackTrace(holder, trap);
    ErrorConstructor.stackTraceLimit = limit;
    const attribution = arm ? callerOutside(holder.stack, path.join(root, arm.file), root) :
      {caller: null, async: false, detached: true};
    const known = arm || UNKNOWN_ARM;
    return {site: known.site, file: known.file, line: known.line, bucket: known.bucket,
      row: known.row, term: known.term, count: 0, thrown: 0, surfaced: 0, ...attribution};
  }

  function trap(id, cause) {
    const arm = arms.get(id);
    let hit = hits.get(id);
    const first = hit === undefined;
    if (first) {
      hit = firstHit(arm);
      hits.set(id, hit);
    }
    hit.count += 1;
    const throwing = mode === TRAP_MODE.THROW && arm !== undefined && armSelected(selection, arm);
    if (throwing) hit.thrown += 1;
    if (first || (throwing && hit.thrown === 1)) flush();
    if (throwing) throw new NecessityTrapError(arm, cause);
  }

  return {
    trap,
    noteLoaded: (file) => loaded.add(file),
    noteRefused: (file, reason) => refused.set(file, reason),
    noteSurfaced,
    flush,
    snapshot,
    armed: armedCount,
  };
}

/**
 * The observation file name of one thread of one process start:
 * `trap-<pid>-<thread>-<random token>.json`, so a restarted process (the same
 * pid) never shares a name with an earlier one.
 * @param {number} pid process id
 * @param {number} threadId worker thread id (0 on the main thread)
 * @return {string} the file name
 */
function observationFileName(pid, threadId) {
  return `${OBSERVATION_PREFIX}${pid}${NAME_SEPARATOR}${threadId}${NAME_SEPARATOR}` +
    `${randomBytes(START_TOKEN_BYTES).toString(TOKEN_ENCODING)}${OBSERVATION_SUFFIX}`;
}

/**
 * The repo-relative plan file a module URL loads, or undefined.
 * @param {string} url the module URL
 * @param {string} root the plan root
 * @return {string|undefined} the planned file
 */
function plannedFileOfUrl(url, root) {
  if (!stringStartsWith(url, FILE_URL_PREFIX)) return undefined;
  const relative = path.relative(root, fileURLToPath(url));
  if (relative.length === 0 || stringStartsWith(relative, PARENT_SEGMENT) ||
      path.isAbsolute(relative)) {
    return undefined;
  }
  return stringSplit(relative, path.sep).join(PATH_SEPARATOR);
}

export {
  ARMS_NOTHING_CODE,
  DRIFT_ERROR_CODE,
  OBSERVATION_EXISTS_CODE,
  NecessityTrapError,
  NecessityTrapPlanDriftError,
  OBSERVATION_PREFIX,
  OBSERVATION_SCHEMA,
  OBSERVATION_SUFFIX,
  PLAN_SCHEMA,
  PROBLEM as TRAP_PROBLEM,
  TRAP_ENV,
  TRAP_ERROR_CODE,
  TRAP_GLOBAL,
  TRAP_MARKER,
  TRAP_MODE,
  applyInsertions,
  armRecords,
  armSelected,
  callerOutside,
  createTrapRecorder,
  observationFileName,
  parseSelection,
  plannedFileOfUrl,
  rewriteSource,
  selectedArmIds,
};
