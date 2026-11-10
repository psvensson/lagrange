/**
 * Primordial-safe marker serialization and Node/shell launch analysis for the
 * fallback-branch census (scripts/checks/fallback-branch-census-witnesses.js
 * and scripts/checks/fallback-branch-census-preload.js).
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const {process} = globalThis;

const GLOBAL_UNICODE_FLAGS = 'gu';
const SHELL_LEX_SOURCE =
  /(\|\||&&|[;&|\n()])|((?:[^\s;&|\n()"']+|"[^"]*"|'[^']*')+)/u.source;
const SHELL_SEGMENT_SOURCE =
  /"([^"]*)"|'([^']*)'|([^\s"'`;&|\n()]+|`[^`]*`)/u.source;
const SHELL_VARIABLE_SOURCE =
  /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/u.source;
const UNQUOTED_BARE_VAR_PATTERN =
  /^(?:\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*))$/u;
const WHITESPACE_WORD_SOURCE = /\S+/u.source;
const COMMAND_SUB_BACKTICK_SOURCE = /`([^`]+)`/u;
const FILE_URL_SOURCE = /file:\/\/[^\s'"`)]+/u.source;
const ENV_ASSIGNMENT_PATTERN = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/su;
const DYNAMIC_SHELL_TOKEN_PATTERN = /[$`]/u;
const JS_SCRIPT_PATTERN = /\.[cm]?js$/u;

const COVERAGE_ENV = 'NODE_V8_COVERAGE';
const NODE_OPTIONS_ENV = 'NODE_OPTIONS';
const PRELOAD_SCRIPT_NAME = 'fallback-branch-census-preload.js';
const UNSET_COMMAND = 'unset';
const ENV_COMMAND = 'env';
const COMMAND_BUILTIN = 'command';
const COMMAND_INQUIRY_FLAGS = Object.freeze(['-v', '-V', '-pv', '-vp', '-pV', '-Vp']);
const TIMEOUT_COMMAND = 'timeout';
const TIMEOUT_VALUE_FLAGS = Object.freeze(['-k', '-s']);
const POSIX_CONTROL_KEYWORDS = Object.freeze([
  'if', 'then', 'elif', 'else', 'while', 'until', 'do', '!',
]);
const SHELL_WRAPPER_COMMANDS = Object.freeze(['exec', 'nohup', 'nice', 'time']);
const MAX_VAR_SPLITS = 16;
const ENV_IGNORE_FLAGS = Object.freeze(['-i', '--ignore-environment', '-']);
const ENV_UNSET_FLAG = '-u';
const ENV_UNSET_PREFIX = '--unset=';
const ENV_CHDIR_FLAG = '-C';
const ENV_SPLIT_FLAG = '-S';
const ENV_SPLIT_PREFIX = '--split-string=';
const WRAPPER_VALUE_FLAGS = Object.freeze(['-a', '-n']);

const FLAG_PREFIX = '-';
const DOUBLE_DASH = '--';
const SPACE = ' ';
const EMPTY = '';
const FILE_URL_PREFIX = 'file://';
const TEST_RUNNER_FLAG = '--test';
const ISOLATION_NONE_VALUE = 'none';
const TEST_ISOLATION_NONE_FLAGS = Object.freeze([
  '--test-isolation=none',
  '--experimental-test-isolation=none',
]);
const TEST_ISOLATION_VALUE_FLAGS = Object.freeze([
  '--test-isolation',
  '--experimental-test-isolation',
]);
const EVAL_FLAG_PREFIXES = Object.freeze(['--eval=', '--print=']);
const NODE_EVAL_FLAGS = Object.freeze(['-e', '--eval', '-p', '--print']);
const NODE_VALUE_FLAGS = Object.freeze([
  '-e', '--eval', '-p', '--print', '-r', '--require', '--import', '--loader',
  '--experimental-loader', '--input-type', '--conditions', '-C', '--watch-path',
  '--env-file', '--env-file-if-exists', '--inspect-port', '--title',
  '--redirect-warnings', '--diagnostic-dir', '--heapsnapshot-signal',
  '--max-old-space-size', '--openssl-config', '--icu-data-dir', '--v8-pool-size',
  '--test-name-pattern', '--test-skip-pattern', '--test-reporter',
  '--test-reporter-destination', '--test-concurrency', '--test-timeout',
  '--test-shard', '--test-isolation', '--experimental-test-isolation',
]);
const NODE_BINARY_NAMES = Object.freeze(['node', 'nodejs', 'node.exe']);
const LAUNCH_OPTION_FIELD = Object.freeze({ENV: 'env', SHELL: 'shell'});

const JSON_TEXT = Object.freeze({
  NULL: 'null', ARRAY_OPEN: '[', ARRAY_CLOSE: ']', OBJECT_OPEN: '{', OBJECT_CLOSE: '}',
  ITEM_SEPARATOR: ',', KEY_SEPARATOR: ':', EMPTY: '',
});

// Primordials captured at module load before any user code can mutate globals.
const jsonStringify = JSON.stringify;
const objectCreate = Object.create;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const objectValues = Object.values;
const arrayIsArray = Array.isArray;
const dateNow = Date.now;
const DateConstructor = Date;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const existsSync = fs.existsSync;
const execPath = process.execPath;
const pathBasename = path.basename;
const pathResolve = path.resolve;
const RegExpConstructor = RegExp;
const regexpExec = Function.call.bind(RegExp.prototype.exec);
const SetConstructor = Set;
const setAdd = Function.call.bind(Set.prototype.add);
const setForEach = Function.call.bind(Set.prototype.forEach);
const toStringValue = String;
const URLConstructor = URL;
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

function execAllMatches(source, text) {
  const scanner = new RegExpConstructor(source, GLOBAL_UNICODE_FLAGS);
  const matches = [];
  let match = regexpExec(scanner, text);
  while (match !== null) {
    arrayPush(matches, match);
    if (match[0].length === 0) scanner.lastIndex += 1;
    match = regexpExec(scanner, text);
  }
  return matches;
}

function sortedSetValues(set) {
  const values = [];
  setForEach(set, (item) => {
    arrayPush(values, item);
  });
  return arraySort(values);
}

function fieldText(value) {
  if (value === undefined) return JSON_TEXT.NULL;
  if (!arrayIsArray(value)) return jsonStringify(value);
  let text = JSON_TEXT.ARRAY_OPEN;
  for (let index = 0; index < value.length; index += 1) {
    const sep = index === 0 ? JSON_TEXT.EMPTY : JSON_TEXT.ITEM_SEPARATOR;
    text += `${sep}${fieldText(value[index])}`;
  }
  return `${text}${JSON_TEXT.ARRAY_CLOSE}`;
}

/**
 * Serialize a flat record of primitives and primitive arrays without consulting
 * Object.prototype.toJSON or Array.prototype.toJSON.
 * @param {Object} body
 * @return {string}
 */
export function serializeFlatJson(body) {
  const keys = objectKeys(body);
  let text = JSON_TEXT.OBJECT_OPEN;
  for (let index = 0; index < keys.length; index += 1) {
    const sep = index === 0 ? JSON_TEXT.EMPTY : JSON_TEXT.ITEM_SEPARATOR;
    const key = keys[index];
    text += `${sep}${jsonStringify(key)}${JSON_TEXT.KEY_SEPARATOR}${fieldText(body[key])}`;
  }
  return `${text}${JSON_TEXT.OBJECT_CLOSE}`;
}

export function nowIsoString() {
  return dateToISOString(new DateConstructor(dateNow()));
}

function ownRecordProperty(record, key) {
  return record !== null && typeof record === 'object' && objectHasOwn(record, key) ?
    record[key] : undefined;
}

function copyOwnRecord(source) {
  const copy = objectCreate(null);
  if (source === null || typeof source !== 'object') return copy;
  const keys = objectKeys(source);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    copy[key] = source[key];
  }
  return copy;
}

function effectiveChildEnv(launchEnv) {
  return copyOwnRecord(launchEnv === undefined ? process.env : launchEnv);
}

export function resolveFileCandidate(value, cwd) {
  if (value instanceof URLConstructor) {
    try {
      return fileURLToPath(value);
    } catch (_error) {
      return null;
    }
  }
  if (typeof value !== 'string' || value.length === 0) return null;
  if (stringStartsWith(value, FILE_URL_PREFIX)) {
    try {
      return fileURLToPath(value);
    } catch (_error) {
      return null;
    }
  }
  return pathResolve(cwd, value);
}

function collectSeedStrings(value, into) {
  if (typeof value === 'string') {
    arrayPush(into, value);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const items = arrayIsArray(value) ? value : objectValues(value);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (typeof item === 'string') arrayPush(into, item);
  }
}

function addWorkerCandidateFile(found, candidate, cwd) {
  if (stringStartsWith(candidate, FILE_URL_PREFIX)) {
    const resolved = resolveFileCandidate(candidate, cwd);
    if (resolved !== null) setAdd(found, resolved);
  } else if (regexpExec(JS_SCRIPT_PATTERN, candidate) !== null) {
    const resolved = pathResolve(cwd, candidate);
    if (existsSync(resolved)) setAdd(found, resolved);
  }
}

export function collectWorkerSeedFiles(evalSource, workerData, cwd) {
  const found = new SetConstructor();
  if (typeof evalSource === 'string') {
    const matches = execAllMatches(FILE_URL_SOURCE, evalSource);
    for (let index = 0; index < matches.length; index += 1) {
      const resolved = resolveFileCandidate(matches[index][0], cwd);
      if (resolved !== null) setAdd(found, resolved);
    }
  }
  const candidates = [];
  collectSeedStrings(workerData, candidates);
  for (let index = 0; index < candidates.length; index += 1) {
    addWorkerCandidateFile(found, candidates[index], cwd);
  }
  return sortedSetValues(found);
}

function isNodeExecutable(command) {
  if (typeof command !== 'string' || command.length === 0) return false;
  if (command === execPath) return true;
  return arrayIncludes(NODE_BINARY_NAMES, pathBasename(command));
}

function extractLaunchOptions(args, options) {
  if (arrayIsArray(args)) {
    return typeof options === 'object' && options !== null ? options : {};
  }
  if (typeof args === 'object' && args !== null) return args;
  if (typeof options === 'object' && options !== null) return options;
  return {};
}

function splitShellClauses(commandText) {
  if (typeof commandText !== 'string' || commandText.length === 0) return [];
  const clauses = [];
  let current = [];
  const matches = execAllMatches(SHELL_LEX_SOURCE, commandText);
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const separator = match[1];
    const word = match[2];
    if (separator !== undefined) {
      if (current.length > 0) {
        arrayPush(clauses, current);
        current = [];
      }
    } else if (word !== undefined) {
      arrayPush(current, word);
    }
  }
  if (current.length > 0) arrayPush(clauses, current);
  return clauses;
}

function expandShellString(text, env) {
  const matches = execAllMatches(SHELL_VARIABLE_SOURCE, text);
  if (matches.length === 0) return text;
  let out = EMPTY;
  let cursor = 0;
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const key = match[1] || match[2];
    const value = ownRecordProperty(env, key);
    out += stringSlice(text, cursor, match.index);
    out += typeof value === 'string' ? value : EMPTY;
    cursor = match.index + match[0].length;
  }
  return out + stringSlice(text, cursor);
}

function expandShellWord(word, env) {
  const parts = [];
  let hasDynamic = false;
  const matches = execAllMatches(SHELL_SEGMENT_SOURCE, word);
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const doubleQuoted = match[1];
    const singleQuoted = match[2];
    const bareSegment = match[3];
    if (singleQuoted !== undefined) {
      arrayPush(parts, singleQuoted);
    } else {
      const raw = doubleQuoted ?? bareSegment ?? EMPTY;
      if (regexpExec(DYNAMIC_SHELL_TOKEN_PATTERN, raw) !== null) hasDynamic = true;
      arrayPush(parts, expandShellString(raw, env));
    }
  }
  return {value: arrayJoin(parts, EMPTY), hasDynamic};
}

export function isClauseInstrumented(env) {
  const coverageDir = ownRecordProperty(env, COVERAGE_ENV);
  const nodeOptions = ownRecordProperty(env, NODE_OPTIONS_ENV);
  return typeof coverageDir === 'string' && coverageDir.length > 0 &&
    typeof nodeOptions === 'string' && stringIncludes(nodeOptions, PRELOAD_SCRIPT_NAME);
}

function clearEnvObject(env) {
  const keys = objectKeys(env);
  for (let index = 0; index < keys.length; index += 1) {
    delete env[keys[index]];
  }
}

function stepEnvOption(clause, cursor, token, clauseEnv) {
  if (token === DOUBLE_DASH) return {advance: 1, forceStripped: false, stop: true};
  if (arrayIncludes(ENV_IGNORE_FLAGS, token)) {
    clearEnvObject(clauseEnv);
    return {advance: 1, forceStripped: false, stop: false};
  }
  if (token === ENV_UNSET_FLAG && cursor + 1 < clause.length) {
    delete clauseEnv[expandShellWord(clause[cursor + 1], clauseEnv).value];
    return {advance: 2, forceStripped: false, stop: false};
  }
  if (stringStartsWith(token, ENV_UNSET_PREFIX)) {
    delete clauseEnv[stringSlice(token, ENV_UNSET_PREFIX.length)];
    return {advance: 1, forceStripped: false, stop: false};
  }
  if (token === ENV_CHDIR_FLAG && cursor + 1 < clause.length) {
    return {advance: 2, forceStripped: false, stop: false};
  }
  if (token === ENV_SPLIT_FLAG || stringStartsWith(token, ENV_SPLIT_PREFIX)) {
    return {advance: token === ENV_SPLIT_FLAG ? 2 : 1, forceStripped: true, stop: false};
  }
  if (stringStartsWith(token, FLAG_PREFIX)) {
    return {advance: 1, forceStripped: false, stop: false};
  }
  return {advance: 0, forceStripped: false, stop: true};
}

function consumeEnvCommandOptions(clause, startCursor, clauseEnv) {
  let cursor = startCursor;
  let forceStripped = false;
  while (cursor < clause.length) {
    const {value: token} = expandShellWord(clause[cursor], clauseEnv);
    const step = stepEnvOption(clause, cursor, token, clauseEnv);
    cursor += step.advance;
    if (step.forceStripped) forceStripped = true;
    if (step.stop) break;
  }
  return {cursor, forceStripped};
}

function consumeWrapperFlags(clause, startCursor, clauseEnv) {
  let cursor = startCursor;
  while (cursor < clause.length) {
    const {value: token} = expandShellWord(clause[cursor], clauseEnv);
    if (token === DOUBLE_DASH) return cursor + 1;
    if (arrayIncludes(WRAPPER_VALUE_FLAGS, token) && cursor + 1 < clause.length) {
      cursor += 2;
    } else if (stringStartsWith(token, FLAG_PREFIX)) {
      cursor += 1;
    } else {
      break;
    }
  }
  return cursor;
}

function consumeCommandBuiltin(clause, startCursor, clauseEnv) {
  let cursor = startCursor;
  let inquiryOnly = false;
  while (cursor < clause.length) {
    const {value: token} = expandShellWord(clause[cursor], clauseEnv);
    if (token === DOUBLE_DASH) {
      cursor += 1;
      break;
    }
    if (arrayIncludes(COMMAND_INQUIRY_FLAGS, token)) {
      inquiryOnly = true;
      cursor += 1;
    } else if (stringStartsWith(token, FLAG_PREFIX)) {
      cursor += 1;
    } else {
      break;
    }
  }
  return inquiryOnly ? clause.length : cursor;
}

function consumeTimeoutCommand(clause, startCursor, clauseEnv) {
  let cursor = startCursor;
  while (cursor < clause.length) {
    const {value: token} = expandShellWord(clause[cursor], clauseEnv);
    if (token === DOUBLE_DASH) {
      cursor += 1;
      break;
    }
    if (arrayIncludes(TIMEOUT_VALUE_FLAGS, token) && cursor + 1 < clause.length) {
      cursor += 2;
    } else if (stringStartsWith(token, FLAG_PREFIX)) {
      cursor += 1;
    } else {
      break;
    }
  }
  return cursor < clause.length ? cursor + 1 : cursor;
}

function splitUnquotedValueWords(text) {
  const words = [];
  const matches = execAllMatches(WHITESPACE_WORD_SOURCE, stringTrim(text));
  for (let index = 0; index < matches.length; index += 1) {
    arrayPush(words, matches[index][0]);
  }
  return words;
}

function expandKnownBareVariable(clause, cursor, clauseEnv) {
  const match = regexpExec(UNQUOTED_BARE_VAR_PATTERN, clause[cursor]);
  if (match === null) return null;
  const name = match[1] || match[2];
  if (!objectHasOwn(clauseEnv, name) || typeof clauseEnv[name] !== 'string') return null;
  const words = splitUnquotedValueWords(clauseEnv[name]);
  if (words.length === 0) return {clause, cursor: cursor + 1, split: false, stop: false};
  if (words.length === 1 && words[0] === clause[cursor]) {
    return {clause, cursor, split: false, stop: true};
  }
  const nextClause = [];
  for (let index = 0; index < words.length; index += 1) {
    arrayPush(nextClause, words[index]);
  }
  const tail = arraySlice(clause, cursor + 1);
  for (let index = 0; index < tail.length; index += 1) {
    arrayPush(nextClause, tail[index]);
  }
  return {clause: nextClause, cursor: 0, split: true, stop: false};
}

function stepPrefixCommandToken(clause, cursor, token, clauseEnv) {
  if (arrayIncludes(POSIX_CONTROL_KEYWORDS, token)) {
    return {cursor: cursor + 1, forceStripped: false, stop: false};
  }
  if (token === ENV_COMMAND) {
    const consumed = consumeEnvCommandOptions(clause, cursor + 1, clauseEnv);
    return {cursor: consumed.cursor, forceStripped: consumed.forceStripped, stop: false};
  }
  if (token === COMMAND_BUILTIN) {
    return {
      cursor: consumeCommandBuiltin(clause, cursor + 1, clauseEnv),
      forceStripped: false,
      stop: false,
    };
  }
  if (token === TIMEOUT_COMMAND) {
    return {
      cursor: consumeTimeoutCommand(clause, cursor + 1, clauseEnv),
      forceStripped: false,
      stop: false,
    };
  }
  if (arrayIncludes(SHELL_WRAPPER_COMMANDS, token)) {
    return {
      cursor: consumeWrapperFlags(clause, cursor + 1, clauseEnv),
      forceStripped: false,
      stop: false,
    };
  }
  return {cursor, forceStripped: false, stop: true};
}

function consumeClausePrefix(initialClause, baseEnv) {
  let clause = initialClause;
  const clauseEnv = copyOwnRecord(baseEnv);
  const assignments = [];
  let cursor = 0;
  let splits = 0;
  let forceStripped = false;
  while (cursor < clause.length) {
    const word = clause[cursor];
    const assignment = regexpExec(ENV_ASSIGNMENT_PATTERN, word);
    if (assignment) {
      const name = assignment[1];
      const {value} = expandShellWord(assignment[2], clauseEnv);
      clauseEnv[name] = value;
      arrayPush(assignments, {name, value});
      cursor += 1;
      continue;
    }
    if (splits < MAX_VAR_SPLITS) {
      const expandedVar = expandKnownBareVariable(clause, cursor, clauseEnv);
      if (expandedVar !== null) {
        clause = expandedVar.clause;
        cursor = expandedVar.cursor;
        if (expandedVar.split) splits += 1;
        if (expandedVar.stop) break;
        continue;
      }
    }
    const {value: token} = expandShellWord(word, clauseEnv);
    const step = stepPrefixCommandToken(clause, cursor, token, clauseEnv);
    cursor = step.cursor;
    if (step.forceStripped) forceStripped = true;
    if (step.stop) break;
  }
  return {clause, clauseEnv, assignments, cursor, forceStripped};
}

function collectCommandSubstitutions(commandText) {
  const snippets = [];
  const matches = execAllMatches(COMMAND_SUB_BACKTICK_SOURCE, commandText);
  for (let index = 0; index < matches.length; index += 1) {
    arrayPush(snippets, matches[index][1]);
  }
  return snippets;
}

function applyUnsetClause(clause, cursor, effectiveEnv) {
  for (let index = cursor + 1; index < clause.length; index += 1) {
    const {value} = expandShellWord(clause[index], effectiveEnv);
    if (!stringStartsWith(value, FLAG_PREFIX) && value.length > 0) {
      delete effectiveEnv[value];
    }
  }
}

function expandClauseArgs(clause, startIndex, clauseEnv) {
  const args = [];
  for (let index = startIndex; index < clause.length; index += 1) {
    arrayPush(args, expandShellWord(clause[index], clauseEnv).value);
  }
  return args;
}

function mergeSubcommandAnalysis(state, subResult) {
  if (subResult === null) return;
  state.expectedChildren += subResult.expectedChildren;
  if (subResult.hasStrippedClause) state.hasStrippedClause = true;
  if (state.firstArgs === null) state.firstArgs = subResult.argList;
}

function isPotentialNodeToken(expandedCommand, hasDynamic) {
  if (isNodeExecutable(expandedCommand)) return true;
  return hasDynamic && expandedCommand.length === 0;
}

function analyzeShellClause(rawClause, state) {
  const {clause, clauseEnv, assignments, cursor, forceStripped} =
    consumeClausePrefix(rawClause, state.effectiveEnv);
  if (cursor >= clause.length) {
    for (let index = 0; index < assignments.length; index += 1) {
      const entry = assignments[index];
      state.effectiveEnv[entry.name] = entry.value;
    }
    return;
  }
  const {value: expandedCommand, hasDynamic} = expandShellWord(clause[cursor], clauseEnv);
  if (expandedCommand === UNSET_COMMAND) {
    applyUnsetClause(clause, cursor, state.effectiveEnv);
    return;
  }
  if (!isPotentialNodeToken(expandedCommand, hasDynamic)) return;
  const isNode = isNodeExecutable(expandedCommand);
  state.expectedChildren += 1;
  if (forceStripped || !isNode || !isClauseInstrumented(clauseEnv)) {
    state.hasStrippedClause = true;
  }
  if (state.firstArgs === null) state.firstArgs = expandClauseArgs(clause, cursor + 1, clauseEnv);
}

/**
 * Analyze a shell command string for Node child launches and stripped census
 * environment clauses.
 * @param {string} commandText
 * @param {Object} [launchEnv]
 * @return {?{argList: Array<string>, expectedChildren: number, hasStrippedClause: boolean}}
 */
export function analyzeShellCommand(commandText, launchEnv) {
  const state = {
    effectiveEnv: effectiveChildEnv(launchEnv),
    expectedChildren: 0,
    hasStrippedClause: false,
    firstArgs: null,
  };
  const substitutions = collectCommandSubstitutions(commandText);
  for (let index = 0; index < substitutions.length; index += 1) {
    mergeSubcommandAnalysis(state, analyzeShellCommand(substitutions[index], state.effectiveEnv));
  }
  const clauses = splitShellClauses(commandText);
  for (let index = 0; index < clauses.length; index += 1) {
    analyzeShellClause(clauses[index], state);
  }
  return state.expectedChildren > 0 ? {
    argList: state.firstArgs || [],
    expectedChildren: state.expectedChildren,
    hasStrippedClause: state.hasStrippedClause,
  } : null;
}

function stepTestRunnerArg(argList, index) {
  const arg = toStringValue(argList[index]);
  if (arg === TEST_RUNNER_FLAG) return {advance: 1, testFlag: true, none: false, target: null};
  if (arrayIncludes(TEST_ISOLATION_NONE_FLAGS, arg)) {
    return {advance: 1, testFlag: false, none: true, target: null};
  }
  if (arrayIncludes(TEST_ISOLATION_VALUE_FLAGS, arg)) {
    const none = argList[index + 1] === ISOLATION_NONE_VALUE;
    return {advance: 2, testFlag: false, none, target: null};
  }
  if (arrayIncludes(NODE_VALUE_FLAGS, arg)) {
    return {advance: 2, testFlag: false, none: false, target: null};
  }
  const target = stringStartsWith(arg, FLAG_PREFIX) ? null : arg;
  return {advance: 1, testFlag: false, none: false, target};
}

function analyzeIsolatedTestRunner(argList) {
  let hasTestFlag = false;
  let isolationNone = false;
  const targets = [];
  let cursor = 0;
  while (cursor < argList.length) {
    const arg = toStringValue(argList[cursor]);
    if (arg === DOUBLE_DASH) {
      for (let rest = cursor + 1; rest < argList.length; rest += 1) {
        arrayPush(targets, toStringValue(argList[rest]));
      }
      break;
    }
    const step = stepTestRunnerArg(argList, cursor);
    if (step.testFlag) hasTestFlag = true;
    if (step.none) isolationNone = true;
    if (step.target !== null) arrayPush(targets, step.target);
    cursor += step.advance;
  }
  if (!hasTestFlag || isolationNone) return null;
  return {
    expectedChildren: targets.length > 0 ? targets.length : 1,
    firstTarget: targets[0] ?? null,
  };
}

function joinCommandAndArgs(command, argList, separator) {
  const parts = [command];
  for (let index = 0; index < argList.length; index += 1) {
    arrayPush(parts, argList[index]);
  }
  return arrayJoin(parts, separator);
}

export function normalizeNodeLaunch(command, args, options) {
  const hasArgArray = arrayIsArray(args);
  const argList = hasArgArray ? args : [];
  const launchOptions = extractLaunchOptions(args, options);
  const envOption = ownRecordProperty(launchOptions, LAUNCH_OPTION_FIELD.ENV);
  if (!ownRecordProperty(launchOptions, LAUNCH_OPTION_FIELD.SHELL) &&
      isNodeExecutable(command)) {
    const testRun = analyzeIsolatedTestRunner(argList);
    return {
      shell: false,
      testRunner: testRun !== null,
      argList,
      launchOptions,
      expectedChildren: testRun ? testRun.expectedChildren : 1,
      hasStrippedClause: !isClauseInstrumented(effectiveChildEnv(envOption)),
    };
  }
  const commandText = joinCommandAndArgs(command, argList, SPACE);
  const analyzed = analyzeShellCommand(commandText, envOption);
  if (analyzed === null) return null;
  return {
    shell: true,
    testRunner: false,
    argList: analyzed.argList,
    launchOptions,
    expectedChildren: analyzed.expectedChildren,
    hasStrippedClause: analyzed.hasStrippedClause,
  };
}

export function isNodeLaunchCommand(command, args, options) {
  return normalizeNodeLaunch(command, args, options) !== null;
}

function isEvalFlag(arg) {
  return arrayIncludes(NODE_EVAL_FLAGS, arg) ||
    arraySome(EVAL_FLAG_PREFIXES, (prefix) => stringStartsWith(arg, prefix));
}

export function parseNodeScriptArgs(argList, cwd) {
  const testRun = analyzeIsolatedTestRunner(argList);
  if (testRun !== null) {
    const entry = testRun.firstTarget !== null ?
      resolveFileCandidate(testRun.firstTarget, cwd) : resolveFileCandidate('.', cwd);
    return {eval: false, entry};
  }
  for (let index = 0; index < argList.length; index += 1) {
    const arg = toStringValue(argList[index]);
    if (arg === DOUBLE_DASH) {
      const next = argList[index + 1];
      return {eval: false, entry: resolveFileCandidate(next, cwd)};
    }
    if (isEvalFlag(arg)) return {eval: true, entry: null};
    if (arrayIncludes(NODE_VALUE_FLAGS, arg)) {
      index += 1;
    } else if (!stringStartsWith(arg, FLAG_PREFIX)) {
      return {eval: false, entry: resolveFileCandidate(arg, cwd)};
    }
  }
  return {eval: true, entry: null};
}
