// v2 records on disk: quest directories, epics with front-matter, the
// append-only log, and the derived quest state. Legacy (v1) log entries are
// classified into the four v2 types for state; their bytes are never touched.

import fs from 'node:fs';
import path from 'node:path';
import {
  ENTRY_TYPE, EPICS_DIR, EPIC_STATUS, EVIDENCE_DIR, FINDING_KIND, LOG_FILE,
  QUESTS_DIR, QUEST_FILE, QUEST_STATUS, TERMINAL_STATUSES, VERDICT,
  isPlainObject,
} from './schema.js';

const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const MARKDOWN_SUFFIX = '.md';
const FRONT_MATTER_FENCE = '---';
const YAML_LIST_PREFIX = '- ';
const EMPTY_LIST = '[]';
const PRIVATE_EPIC_PREFIX = '_';
const EPIC_README = 'README.md';
const YAML_KEY_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u;
const YAML_NESTED_KEY_PATTERN = /^(\s+)([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u;
const YAML_NUMBER_PATTERN = /^-?\d+(\.\d+)?$/u;
const YAML_QUOTED_PATTERN = /^["'](.*)["']$/u;
const YAML_UNQUOTE_REPLACEMENT = '$1';
const YAML_SCALARS = Object.freeze(new Map([
  ['', null], ['null', null], ['true', true], ['false', false],
]));
const JSON_INDENT = 2;
const UNPARSEABLE_TYPE = 'unparseable';
const LEGACY_TYPE = Object.freeze({
  QUEST: 'quest', PARK: 'park', SOLVED: 'solved',
});
const LEGACY_FINDING_TYPES = Object.freeze([
  'finding', 'evidence-ingested', 'reflection', 'theory-option-declared',
  'theory-selected', 'theory-system-declared', 'theory-superseded',
  'theory-result',
]);
const LEGACY_TERMINAL_TYPES = Object.freeze(Object.values(LEGACY_TYPE));
const LEGACY_VERIFICATION_KINDS = Object.freeze({
  'verifier-approval': VERDICT.APPROVE,
  'verifier-rejection': VERDICT.REJECT,
});
const LEGACY_EXHAUSTED = 'exhausted';
// The status a legacy terminal-classified entry records: `quest` carries its
// own, `park` reads as exhausted, per-frontier `solved` is not quest-level.
const LEGACY_TERMINAL_STATUS = Object.freeze({
  [LEGACY_TYPE.QUEST]: (entry) => entry.status,
  [LEGACY_TYPE.PARK]: () => LEGACY_EXHAUSTED,
  [LEGACY_TYPE.SOLVED]: () => null,
});
const NO_HOLD = null;

function questDir(root, id) {
  return path.join(root, QUESTS_DIR, id);
}

function questFile(root, id) {
  return path.join(questDir(root, id), QUEST_FILE);
}

function logFile(root, id) {
  return path.join(questDir(root, id), LOG_FILE);
}

function evidenceDir(root, id) {
  return path.join(questDir(root, id), EVIDENCE_DIR);
}

function questExists(root, id) {
  return fs.existsSync(questFile(root, id));
}

function readQuest(root, id) {
  const file = questFile(root, id);
  if (!fs.existsSync(file)) throw new Error(`no quest ${id} (${file})`);
  return JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
}

function writeQuest(root, quest) {
  fs.mkdirSync(questDir(root, quest.id), {recursive: true});
  fs.writeFileSync(questFile(root, quest.id),
    `${JSON.stringify(quest, null, JSON_INDENT)}${LINE_SEPARATOR}`, TEXT_ENCODING);
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch (_error) {
    return {type: UNPARSEABLE_TYPE, raw: line};
  }
}

function readLog(root, id) {
  const file = logFile(root, id);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, TEXT_ENCODING).split(LINE_SEPARATOR)
    .filter((line) => line.trim()).map(parseLine);
}

function appendEntry(root, id, entry) {
  fs.mkdirSync(questDir(root, id), {recursive: true});
  const stamped = {ts: new Date().toISOString(), ...entry};
  fs.appendFileSync(logFile(root, id),
    `${JSON.stringify(stamped)}${LINE_SEPARATOR}`, TEXT_ENCODING);
  return stamped;
}

function listQuestIds(root) {
  const dir = path.join(root, QUESTS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() &&
      fs.existsSync(path.join(dir, entry.name, QUEST_FILE)))
    .map((entry) => entry.name)
    .sort();
}

function isLegacyVerification(entry) {
  return entry.type === ENTRY_TYPE.FINDING &&
    Boolean(LEGACY_VERIFICATION_KINDS[entry.kind]);
}

// Classify any entry (v2 or verbatim v1) into a v2 type, or null when it
// carries no v2 meaning (v1 gate decisions, overrides, violations, ...).
function classifyEntry(entry) {
  if (!isPlainObject(entry)) return null;
  if (isLegacyVerification(entry)) return ENTRY_TYPE.VERIFICATION;
  if (Object.values(ENTRY_TYPE).includes(entry.type)) return entry.type;
  if (LEGACY_FINDING_TYPES.includes(entry.type)) return ENTRY_TYPE.FINDING;
  if (LEGACY_TERMINAL_TYPES.includes(entry.type)) return ENTRY_TYPE.TERMINAL;
  return null;
}

// The v2 verdict of any verification-classified entry.
function verdictOf(entry) {
  return entry.type === ENTRY_TYPE.VERIFICATION ? entry.verdict :
    LEGACY_VERIFICATION_KINDS[entry.kind] || null;
}

function terminalStatusOf(entry) {
  if (entry.type === ENTRY_TYPE.TERMINAL) return entry.status;
  const legacy = LEGACY_TERMINAL_STATUS[entry.type];
  return legacy ? legacy(entry) : null;
}

function applyTerminal(state, entry) {
  const terminal = terminalStatusOf(entry);
  if (TERMINAL_STATUSES.includes(terminal)) {
    state.status = terminal;
    state.hold = NO_HOLD;
  } else if (terminal === QUEST_STATUS.BLOCKED) {
    state.hold = entry;
  }
}

function applyFinding(state, entry) {
  if (entry.kind === FINDING_KIND.ALTITUDE_CHECK) state.attemptsSinceAltitudeCheck.length = 0;
  if (entry.seal && !state.seal) state.seal = entry;
  if (entry.kind !== undefined) state.hold = NO_HOLD;
}

function applyAttempt(state, entry, index) {
  state.attempts.push(entry);
  state.attemptsSinceAltitudeCheck.push(entry);
  state.lastAttemptIndex = index;
  state.hold = NO_HOLD;
}

function applyVerification(state, entry, index) {
  state.lastVerification = entry;
  state.lastVerificationIndex = index;
}

const ENTRY_EFFECTS = Object.freeze({
  [ENTRY_TYPE.TERMINAL]: applyTerminal,
  [ENTRY_TYPE.FINDING]: applyFinding,
  [ENTRY_TYPE.ATTEMPT]: applyAttempt,
  [ENTRY_TYPE.VERIFICATION]: applyVerification,
});

/**
 * Derived state of a quest from its log: status, the newest entry of each
 * type, the seal, and the attempts since the last altitude check. A
 * `blocked` terminal entry holds the quest until the next attempt or typed
 * finding.
 * @param {Object[]} entries
 * @return {Object}
 */
function questState(entries) {
  const state = {
    status: QUEST_STATUS.OPEN, hold: NO_HOLD, seal: null, attempts: [],
    attemptsSinceAltitudeCheck: [], lastVerification: null,
    lastVerificationIndex: -1, lastAttemptIndex: -1,
  };
  entries.forEach((entry, index) => {
    const effect = ENTRY_EFFECTS[classifyEntry(entry)];
    if (effect) effect(state, entry, index);
  });
  const held = state.hold !== NO_HOLD && state.status === QUEST_STATUS.OPEN;
  return {
    status: held ? QUEST_STATUS.BLOCKED : state.status,
    terminal: TERMINAL_STATUSES.includes(state.status),
    blocked: held ? state.hold : null,
    seal: state.seal,
    attempts: state.attempts,
    attemptsSinceAltitudeCheck: state.attemptsSinceAltitudeCheck,
    lastVerification: state.lastVerification,
    verificationIsCurrent: state.lastVerification !== null &&
      state.lastVerificationIndex > state.lastAttemptIndex,
  };
}

// --- epics -----------------------------------------------------------------

function parseScalar(raw) {
  const value = raw.trim();
  if (YAML_SCALARS.has(value)) return YAML_SCALARS.get(value);
  if (value === EMPTY_LIST) return [];
  if (YAML_NUMBER_PATTERN.test(value)) return Number(value);
  return value.replace(YAML_QUOTED_PATTERN, YAML_UNQUOTE_REPLACEMENT);
}

function pushListItem(holder, key, line) {
  const item = parseScalar(line.trim().slice(YAML_LIST_PREFIX.length));
  if (!Array.isArray(holder[key])) holder[key] = [];
  holder[key].push(item);
}

// One parser step over a front-matter line; `cursor` tracks the current
// top-level key and the innermost nested holder.
function parseFrontLine(front, cursor, line) {
  const top = YAML_KEY_PATTERN.exec(line);
  if (top) {
    front[top[1]] = parseScalar(top[2]);
    return {key: top[1], nested: null};
  }
  if (cursor.key && line.trim().startsWith(YAML_LIST_PREFIX)) {
    const holder = cursor.nested ? cursor.nested.object : front;
    pushListItem(holder, cursor.nested ? cursor.nested.key : cursor.key, line);
    return cursor;
  }
  const inner = YAML_NESTED_KEY_PATTERN.exec(line);
  if (!inner || !cursor.key) return cursor;
  const [, indent, key, raw] = inner;
  if (!isPlainObject(front[cursor.key])) front[cursor.key] = {};
  if (cursor.nested && indent.length > cursor.nested.indent) {
    const parent = cursor.nested.object;
    if (!isPlainObject(parent[cursor.nested.key])) parent[cursor.nested.key] = {};
    parent[cursor.nested.key][key] = parseScalar(raw);
    return cursor;
  }
  front[cursor.key][key] = parseScalar(raw);
  return {key: cursor.key, nested: {object: front[cursor.key], key, indent: indent.length}};
}

// Minimal YAML front-matter: scalars, `- item` lists, `[]`, and two levels of
// nested keys (doneWhen: probe/args). Enough for epics; nothing else uses it.
function parseFrontMatter(text) {
  const lines = text.split(LINE_SEPARATOR);
  const end = lines[0] === FRONT_MATTER_FENCE ? lines.indexOf(FRONT_MATTER_FENCE, 1) : -1;
  if (end === -1) return {front: null, body: text};
  const front = {};
  let cursor = {key: null, nested: null};
  for (const line of lines.slice(1, end)) cursor = parseFrontLine(front, cursor, line);
  return {front, body: lines.slice(end + 1).join(LINE_SEPARATOR)};
}

function epicFile(root, id) {
  return path.join(root, EPICS_DIR, `${id}${MARKDOWN_SUFFIX}`);
}

function readEpic(root, id) {
  const file = epicFile(root, id);
  if (!fs.existsSync(file)) return null;
  const parsed = parseFrontMatter(fs.readFileSync(file, TEXT_ENCODING));
  return {id, file, front: parsed.front, body: parsed.body};
}

function listEpics(root) {
  const dir = path.join(root, EPICS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith(MARKDOWN_SUFFIX) && name !== EPIC_README &&
      !name.startsWith(PRIVATE_EPIC_PREFIX))
    .map((name) => readEpic(root, name.slice(0, -MARKDOWN_SUFFIX.length)))
    .filter((epic) => epic && epic.front);
}

function isOpenEpic(epic) {
  return epic?.front?.status === EPIC_STATUS.OPEN;
}

export {
  appendEntry, classifyEntry, epicFile, evidenceDir, isOpenEpic, listEpics,
  listQuestIds, logFile, parseFrontMatter, questDir, questExists, questFile,
  questState, readEpic, readLog, readQuest, terminalStatusOf, verdictOf,
  writeQuest,
};
