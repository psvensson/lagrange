// The four v2 commands: start, note, probe, land (+ evidence add, board).
// Every command is a function of (root, options) returning a result object;
// the CLI prints it. Nothing here writes outside solve/quests/<id>/ except
// `land`, which commits.

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

import {
  CERTIFICATION_ONLY_PROBES, CLASS_FIX, ENTRY_TYPE, EPIC_PROOF, EPIC_STATUS,
  FINDING_KIND, NEXT_OWNER, QUEST_SCHEMA, QUEST_STATUS, TERMINAL_STATUSES,
  VERDICT, entryProblems, epicProblems, questProblems, text,
} from './schema.js';
import {
  appendEntry, evidenceDir, isOpenEpic, listEpics, listQuestIds, logFile, questDir,
  questExists, questState, readEpic, readLog, readQuest, verdictOf, writeQuest,
} from './store.js';
import {measure} from './probes.js';
import {
  SOLVE_PREFIX, canonicalImportGraphProblem, changedPaths, coupledPairProblems,
  epicScopeProblems, git, headSha, requiresVerification, stageablePaths,
  staticQualityProblems,
} from './guards.js';
import {
  EVIDENCE_REF_PREFIX, uploadAndVerify,
} from './evidence-store.js';

const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const ALTITUDE_BUDGET = 3;
const RECENT_ENTRIES = 3;
const LANDING_MARKER_ENV = 'LAGRANGE_SOLVER_LANDING';
const LANDING_MARKER_VALUE = '1';
const NPM = 'npm';
const NPM_TEST_ARGUMENTS = Object.freeze(['test']);
const INVENTORY_PRODUCER = 'scripts/generate-global-owner-debt-inventory.js';
const INVENTORY_REFRESH_ARGUMENT = '--refresh';
const PRIORITY_INVENTORY_PRODUCER = 'scripts/generate-priority-recovery-owner-inventory.js';
const GENERATED_INVENTORY_PATHS = Object.freeze([
  'solve/changes/global-owner-debt-inventory/inventory.json',
  'solve/changes/priority-recovery-owner-inventory/inventory.json',
  'test/shards/impact-graph-seal.json',
]);
const SPAWN_MAX_BUFFER = 64 * 1024 * 1024;
const TEST_TIMEOUT_MS = 90 * 60 * 1000;
const COMMIT_SUBJECT_LIMIT = 72;
const NO_VERIFY_FLAG = '--no-verify';
const QUESTS_SUBDIR = 'quests';
// The commit is the change record; the log records what happened. A change
// set is named by its size and a bounded sample, never carried whole: a
// cutover-sized attempt would otherwise write half a megabyte per entry into
// durable memory that git already holds exactly.
const CHANGE_SET_SAMPLE = 50;
const PROBLEM_SEPARATOR = '; ';
const SUMMARY_LENGTH = 160;
const SUMMARY_SEPARATOR = ' ';
const GIT_ADD = Object.freeze(['add', '--all', '--']);
const GIT_ADD_ONE = Object.freeze(['add', '--']);
const GIT_COMMIT = Object.freeze(['commit', '--quiet', '-m']);
const GIT_UNSTAGE = Object.freeze(['reset', '--quiet', '--']);
const MESSAGE = Object.freeze({
  ID_REQUIRED: '--id <quest> is required',
  SOLVED_BY_LAND: 'solved is recorded by land, never by note',
  REJECTION_STANDS: 'the newest verification is a rejection and no attempt is newer than it',
  VERIFICATION_MISSING: 'src/ changes need a verification entry (verifier subagent:<id>)',
  VERIFICATION_STALE: 'src/ changes need a verification entry newer than the last attempt',
  VERIFICATION_NOT_APPROVED: 'src/ changes need an approving verification',
  LAND_REFUSED: 'land refused:',
  PROBE_IMMUTABLE: 'the probe is immutable after start (supersede the quest to change it)',
  PROBLEM_BULLET: '- ',
});
// Whether the newest verification stands as a verdict on the current tree.
const VERDICT_STATE = Object.freeze({
  NONE: 'none', STALE: 'stale', APPROVED: 'approved', REJECTED: 'rejected',
});
const VERIFICATION_PROBLEMS = Object.freeze({
  [VERDICT_STATE.NONE]: MESSAGE.VERIFICATION_MISSING,
  [VERDICT_STATE.STALE]: MESSAGE.VERIFICATION_STALE,
  [VERDICT_STATE.REJECTED]: MESSAGE.VERIFICATION_NOT_APPROVED,
  [VERDICT_STATE.APPROVED]: null,
});

class SolveError extends Error {}

function refuse(message) {
  throw new SolveError(message);
}

function loadQuestOrRefuse(root, id) {
  if (!text(id)) refuse(MESSAGE.ID_REQUIRED);
  if (!questExists(root, id)) refuse(`no quest ${id} under ${questDir(root, id)}`);
  return readQuest(root, id);
}

function loadEpic(root, quest) {
  if (quest.class === CLASS_FIX || !quest.epic) return null;
  const epic = readEpic(root, quest.epic);
  if (!epic || !epic.front) refuse(`quest ${quest.id} names epic ${quest.epic}, which has no front-matter`);
  const problems = epicProblems(epic.front);
  if (problems.length > 0) refuse(`epic ${quest.epic}: ${problems.join(PROBLEM_SEPARATOR)}`);
  return epic;
}

function openState(root, id) {
  const quest = loadQuestOrRefuse(root, id);
  const log = readLog(root, id);
  const state = questState(log);
  if (state.terminal) refuse(`quest ${id} is ${state.status}; a terminal quest takes no entries`);
  return {quest, log, state};
}

// --- start ---------------------------------------------------------------------

/**
 * Seal a quest: validate quest.json, check the epic, measure the probe and
 * refuse unless it is red, then record the seal with the seal-time value.
 * @param {string} root
 * @param {{id: string}} options
 * @return {Object}
 */
function start(root, options) {
  const quest = loadQuestOrRefuse(root, options.id);
  const problems = questProblems(quest);
  if (problems.length > 0) refuse(`quest ${quest.id}: ${problems.join(PROBLEM_SEPARATOR)}`);
  const log = readLog(root, quest.id);
  const state = questState(log);
  if (state.seal) refuse(`quest ${quest.id} is already sealed at ${state.seal.seal.sealedAt}`);
  if (state.terminal) refuse(`quest ${quest.id} is ${state.status}`);
  const epic = loadEpic(root, quest);
  if (epic && !isOpenEpic(epic)) refuse(`epic ${epic.id} is ${epic.front.status}, not open`);
  if (epic && epic.front.proof !== EPIC_PROOF.CERTIFICATION &&
    CERTIFICATION_ONLY_PROBES.includes(quest.doneWhen.probe)) {
    refuse(`probe ${quest.doneWhen.probe} is terminal evidence only under a ` +
      `certification epic; ${epic.id} is ${epic.front.proof}`);
  }
  const measured = measure(root, quest.doneWhen);
  if (!measured.measuring) {
    refuse(`quest ${quest.id} cannot start on a probe that does not measure ` +
      `(${measured.reason}); make the probe red first`);
  }
  if (measured.done) {
    refuse(`quest ${quest.id} cannot start on a green probe (metric ` +
      `${measured.metric} <= ${measured.target}); write a probe that is red now`);
  }
  const sealedAt = headSha(root);
  const sealed = {...quest, schema: QUEST_SCHEMA, sealedAt};
  writeQuest(root, sealed);
  fs.mkdirSync(evidenceDir(root, quest.id), {recursive: true});
  const entry = appendEntry(root, quest.id, {
    type: ENTRY_TYPE.FINDING,
    kind: FINDING_KIND.DECISION,
    text: `sealed at ${sealedAt}; seal-time probe ${quest.doneWhen.probe} ` +
      `metric=${measured.metric} target=${measured.target} measuring=${measured.measuring}`,
    seal: {sealedAt, statement: quest.statement, doneWhen: quest.doneWhen,
      metric: measured.metric, target: measured.target, measuring: measured.measuring,
      reason: measured.reason},
  });
  return {id: quest.id, sealedAt, probe: measured, entry};
}

// --- note ----------------------------------------------------------------------

function changeSetRecord(paths) {
  const record = {pathCount: paths.length, paths: paths.slice(0, CHANGE_SET_SAMPLE)};
  return paths.length > CHANGE_SET_SAMPLE ? {...record, truncated: true} : record;
}

// The change set a quest is judged on: everything but its own directory.
function pathsOutsideQuest(root, id) {
  return changedPaths(root).filter((filePath) =>
    !filePath.startsWith(`${SOLVE_PREFIX}${QUESTS_SUBDIR}/${id}/`));
}

function defined(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

// The fields each entry type takes from the note options.
const ENTRY_FIELDS = Object.freeze({
  [ENTRY_TYPE.FINDING]: (options) => defined({kind: options.kind, status: options.status,
    evidence: options.evidence}),
  [ENTRY_TYPE.ATTEMPT]: () => ({}),
  [ENTRY_TYPE.VERIFICATION]: (options) => ({verifier: options.verifier, verdict: options.verdict}),
  [ENTRY_TYPE.TERMINAL]: (options) => defined({status: options.status,
    nextOwner: options.nextOwner, supersededBy: options.supersededBy}),
});

function noteEntry(options) {
  const fields = ENTRY_FIELDS[options.type];
  return {type: options.type, text: text(options.text), ...(fields ? fields(options) : {})};
}

/**
 * Append one entry: finding (kinds), attempt, verification, or a terminal
 * entry other than solved (solved is only ever written by land).
 * @param {string} root
 * @param {Object} options
 * @return {Object}
 */
function note(root, options) {
  const {quest, state} = openState(root, options.id);
  const entry = noteEntry(options);
  const problems = entryProblems(entry);
  if (problems.length > 0) refuse(`note: ${problems.join(PROBLEM_SEPARATOR)}`);
  if (entry.type === ENTRY_TYPE.TERMINAL && entry.status === QUEST_STATUS.SOLVED) {
    refuse(MESSAGE.SOLVED_BY_LAND);
  }
  if (entry.type === ENTRY_TYPE.ATTEMPT && !state.seal) {
    refuse(`quest ${quest.id} is not sealed; run start first`);
  }
  if (entry.type === ENTRY_TYPE.ATTEMPT) {
    entry.at = headSha(root);
    Object.assign(entry, changeSetRecord(pathsOutsideQuest(root, quest.id)));
  }
  return {id: quest.id, entry: appendEntry(root, quest.id, entry)};
}

// --- probe ---------------------------------------------------------------------

function summarize(entry) {
  const head = [entry.ts, entry.type, entry.kind || entry.verdict || entry.status]
    .filter(Boolean).join(SUMMARY_SEPARATOR);
  return `${head}: ${String(entry.text || entry.summary || '').slice(0, SUMMARY_LENGTH)}`;
}

/**
 * Measure a quest's (or, with --epic, an epic's) doneWhen and show the delta
 * from the seal-time value and the last three log entries.
 * @param {string} root
 * @param {{id?: string, epic?: string}} options
 * @return {Object}
 */
function probe(root, options) {
  if (options.epic) {
    const epic = readEpic(root, options.epic);
    if (!epic || !epic.front) refuse(`no epic ${options.epic}`);
    const problems = epicProblems(epic.front);
    if (problems.length > 0) refuse(`epic ${epic.id}: ${problems.join(PROBLEM_SEPARATOR)}`);
    return {epic: epic.id, status: epic.front.status,
      probe: epic.front.doneWhen ? measure(root, epic.front.doneWhen) : null};
  }
  const quest = loadQuestOrRefuse(root, options.id);
  const log = readLog(root, quest.id);
  const state = questState(log);
  const measured = measure(root, quest.doneWhen);
  const sealMetric = state.seal?.seal?.metric ?? null;
  return {
    id: quest.id,
    status: state.status,
    blocked: state.blocked ? {nextOwner: state.blocked.nextOwner,
      text: state.blocked.text} : null,
    probe: measured,
    sealMetric,
    delta: sealMetric === null || measured.metric === null ? null :
      measured.metric - sealMetric,
    attempts: state.attempts.length,
    attemptsSinceAltitudeCheck: state.attemptsSinceAltitudeCheck.length,
    recent: log.slice(-RECENT_ENTRIES).map(summarize),
  };
}

// --- land ----------------------------------------------------------------------

function verdictState(state) {
  const last = state.lastVerification;
  if (!last) return VERDICT_STATE.NONE;
  if (!state.verificationIsCurrent) return VERDICT_STATE.STALE;
  return verdictOf(last) === VERDICT.APPROVE ? VERDICT_STATE.APPROVED : VERDICT_STATE.REJECTED;
}

function verificationProblems(state, paths) {
  const verdict = verdictState(state);
  const problems = [];
  if (verdict === VERDICT_STATE.REJECTED) problems.push(MESSAGE.REJECTION_STANDS);
  const required = requiresVerification(paths) ? VERIFICATION_PROBLEMS[verdict] : null;
  if (required) problems.push(required);
  return problems;
}

function altitudeProblems(state) {
  return state.attemptsSinceAltitudeCheck.length > ALTITUDE_BUDGET ? [
    `${state.attemptsSinceAltitudeCheck.length} attempts since the last ` +
    `altitude-check finding (budget ${ALTITUDE_BUDGET}); record one before landing`,
  ] : [];
}

function refreshInventories(root) {
  const fast = spawnSync(process.execPath, [INVENTORY_PRODUCER],
    {cwd: root, encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER});
  if (fast.status !== 0) {
    const refresh = spawnSync(process.execPath, [INVENTORY_PRODUCER, INVENTORY_REFRESH_ARGUMENT],
      {cwd: root, encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER});
    if (refresh.status !== 0) refuse(`inventory refresh failed: ${refresh.stderr}`);
  }
  const priority = spawnSync(process.execPath, [PRIORITY_INVENTORY_PRODUCER],
    {cwd: root, encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER});
  if (priority.status !== 0) refuse(`priority inventory failed: ${priority.stderr}`);
}

function runChangeProof(root, log) {
  const result = spawnSync(NPM, [...NPM_TEST_ARGUMENTS], {cwd: root,
    encoding: TEXT_ENCODING, maxBuffer: SPAWN_MAX_BUFFER, timeout: TEST_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe']});
  log(`${result.stdout || ''}${result.stderr || ''}`);
  if (result.status !== 0) refuse(`npm test failed (exit ${result.status})`);
}

function commitSubject(quest) {
  const statement = text(quest.statement).replace(/\s+/gu, ' ');
  const limit = COMMIT_SUBJECT_LIMIT - quest.id.length - 2;
  return `${quest.id}: ${statement.length > limit ?
    `${statement.slice(0, limit - 1)}…` : statement}`;
}

// The index IS the change set being proven and committed: a checker that
// reads the repository through `git ls-files` (test taxonomy liveness, the
// classification shards) must see the post-landing tree, not the pre-landing
// one. Staging happens before the proof and again before the commit, because
// the terminal log entry is appended in between.
function stageLanding(root, quest, paths) {
  git(root, [...GIT_ADD, ...stageablePaths(root, paths), questDir(root, quest.id)]);
  for (const generated of GENERATED_INVENTORY_PATHS) {
    if (fs.existsSync(path.join(root, generated))) git(root, [...GIT_ADD_ONE, generated]);
  }
}

// Give the index back to the caller exactly as a refusal found it.
function unstageLanding(root, quest, paths) {
  git(root, [...GIT_UNSTAGE, ...paths, questDir(root, quest.id)], {allowFailure: true});
}

// Refresh the generated inventories, verify the canonical import graph, stage
// the change set, and prove it. Staging precedes the proof because the index
// IS the change set: a checker reading the repository through `git ls-files`
// must see the tree that will be committed. A refused proof gives the index
// back. `options.runProof` replaces the environment-bound default, which is
// how the staged-tree guarantee is observed under test.
function proveLanding(root, quest, paths, options) {
  const injected = options.runProof || null;
  if (!injected && !options.skipProof) {
    refreshInventories(root);
    const graphProblem = canonicalImportGraphProblem(root);
    if (graphProblem) refuse(graphProblem);
  }
  stageLanding(root, quest, paths);
  const proof = injected || (options.skipProof ? null : runChangeProof);
  if (!proof) return;
  try {
    proof(root, options.log || (() => {}));
  } catch (error) {
    unstageLanding(root, quest, paths);
    throw error;
  }
}

function commitLanding(root, quest, paths, options) {
  const env = {...process.env, [LANDING_MARKER_ENV]: LANDING_MARKER_VALUE};
  stageLanding(root, quest, paths);
  const message = [commitSubject(quest), '', `Quest: ${quest.id}`,
    quest.epic ? `Epic: ${quest.epic}` : null, `Sealed-At: ${quest.sealedAt}`,
    ...(options.trailers || [])].filter((line) => line !== null).join(LINE_SEPARATOR);
  const args = [...GIT_COMMIT, message];
  if (options.noVerify) args.push(NO_VERIFY_FLAG);
  git(root, args, {env});
  return headSha(root);
}

/**
 * Land: every guard, the change proof, the commit, then the terminal entry.
 * Never pushes. `options.log` receives the proof output; `options.runProof`
 * replaces the default `npm test` (tests observe the staged tree through it).
 * @param {string} root
 * @param {{id: string, log?: Function, skipProof?: boolean,
 *   runProof?: Function}} options
 * @return {Object}
 */
function land(root, options) {
  const {quest, state} = openState(root, options.id);
  if (!state.seal) refuse(`quest ${quest.id} is not sealed; run start first`);
  if (state.status === QUEST_STATUS.BLOCKED) {
    refuse(`quest ${quest.id} is blocked (next owner ${state.blocked.nextOwner}): ` +
      `${state.blocked.text}; record the attempt or typed finding that clears it`);
  }
  if (JSON.stringify(quest.doneWhen) !== JSON.stringify(state.seal.seal.doneWhen)) {
    refuse(`quest ${quest.id}: doneWhen differs from the sealed probe; ${MESSAGE.PROBE_IMMUTABLE}`);
  }
  const epic = loadEpic(root, quest);
  const measured = measure(root, quest.doneWhen);
  const problems = [];
  if (!measured.done) {
    problems.push(`doneWhen is not green: metric ${measured.metric} target ` +
      `${measured.target} (${measured.reason})`);
  }
  const paths = pathsOutsideQuest(root, quest.id);
  problems.push(...verificationProblems(state, paths));
  problems.push(...altitudeProblems(state));
  problems.push(...epicScopeProblems(quest, epic, paths));
  problems.push(...coupledPairProblems(root, paths));
  problems.push(...staticQualityProblems(root, paths));
  if (problems.length > 0) {
    refuse(`${MESSAGE.LAND_REFUSED}${LINE_SEPARATOR}${MESSAGE.PROBLEM_BULLET}` +
      problems.join(`${LINE_SEPARATOR}${MESSAGE.PROBLEM_BULLET}`));
  }
  proveLanding(root, quest, paths, options);
  // The terminal entry rides in the landing commit; a refused commit takes
  // the entry back out so the quest stays open and land can be retried.
  const logPath = logFile(root, quest.id);
  const logBefore = fs.readFileSync(logPath);
  const terminal = appendEntry(root, quest.id, {
    type: ENTRY_TYPE.TERMINAL,
    status: QUEST_STATUS.SOLVED,
    text: `landed: probe ${quest.doneWhen.probe} metric=${measured.metric} ` +
      `target=${measured.target}; ${paths.length} paths`,
    probe: measured,
    ...changeSetRecord(paths),
  });
  let commit;
  try {
    commit = commitLanding(root, quest, paths, options);
  } catch (error) {
    fs.writeFileSync(logPath, logBefore);
    unstageLanding(root, quest, paths);
    refuse(`land: the commit was refused, the quest stays open: ${error.message}`);
  }
  return {id: quest.id, commit, paths, probe: measured, terminal};
}

// --- evidence add ----------------------------------------------------------------

/**
 * Upload a file to the evidence store, verify it, and record an evidence
 * finding carrying the sha256 reference and URL.
 * @param {string} root
 * @param {{id: string, file: string, tmpdir: string, run?: Function}} options
 * @return {Object}
 */
function evidenceAdd(root, options) {
  const {quest} = openState(root, options.id);
  const file = path.resolve(root, options.file);
  if (!fs.existsSync(file)) refuse(`no file ${options.file}`);
  const uploaded = uploadAndVerify({file, questId: quest.id, run: options.run,
    tmpdir: options.tmpdir, root});
  const entry = appendEntry(root, quest.id, {
    type: ENTRY_TYPE.FINDING,
    kind: FINDING_KIND.EVIDENCE,
    text: text(options.text) || `evidence ${uploaded.asset} uploaded and verified`,
    evidence: `${EVIDENCE_REF_PREFIX}${uploaded.sha256}`,
    asset: uploaded.asset,
    url: uploaded.url,
    bytes: uploaded.bytes,
  });
  return {id: quest.id, uploaded, entry};
}

// --- board ------------------------------------------------------------------------

/**
 * Open epics with their open quests, computed on demand; nothing is written.
 * @param {string} root
 * @return {Object}
 */
function board(root) {
  const quests = listQuestIds(root).map((id) => {
    const quest = readQuest(root, id);
    const state = questState(readLog(root, id));
    return {id, epic: quest.epic || null, class: quest.class || null,
      status: state.status, sealed: Boolean(state.seal),
      attempts: state.attempts.length,
      nextOwner: state.blocked?.nextOwner || null};
  });
  const openQuests = quests.filter((quest) => !TERMINAL_STATUSES.includes(quest.status));
  const epics = listEpics(root).map((epic) => ({
    id: epic.id, status: epic.front.status, proof: epic.front.proof,
    legacy: epic.front.legacy === true,
    quests: openQuests.filter((quest) => quest.epic === epic.id).map((quest) => quest.id),
  }));
  return {
    epics: epics.filter((epic) => epic.status === EPIC_STATUS.OPEN),
    quests: openQuests,
    counts: {epics: epics.length, quests: quests.length},
  };
}

export {
  ALTITUDE_BUDGET, LANDING_MARKER_ENV, LANDING_MARKER_VALUE, NEXT_OWNER,
  SolveError, board, evidenceAdd, land, note, probe, start,
};
