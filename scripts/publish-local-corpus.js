// The publisher's detached local corpus and post-merge obligations share one
// execution/evidence owner. The CLI remains the original publish-head entry.

import fs from 'node:fs';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ACTION, authorizeAction, isAuthorized} from './action-authority.js';
import {PROOF_SCOPE_PATH} from './checks/change-selection-constants.js';
import {wholeCorpusFiles} from './plan-test-lane.js';
import {THERMAL_REFUSAL_EXIT} from './checks/wait-for-thermal-headroom.js';
import {spawnGit} from './checks/git-invocation.js';
import {
  EXECUTION_REPORT_PATH, EXECUTION_SECTIONS_ENV, buildExecutionReport, openExecutionSections,
  readExecutionReport, readExecutionRuns, writeExecutionReport,
} from './test-execution-report.js';
import {checkedGit, git, removePublishCheckout} from './publish-command-runner.js';
import {
  CORPUS_PROOF_ID, DETACH_ARGUMENT, FETCH_COMMAND, FIELD_FULL_CORPUS, FIELD_SHA,
  FILE_ALREADY_EXISTS, FILE_NOT_FOUND, INHERIT_STDIO, MAIN_BRANCH, NEWLINE, ORIGIN_REMOTE,
  PROOF_AUTHORITY_SCRIPT, PROOF_RECORD_COMMAND, PROOF_REPORT_FLAG,
  PUBLISH_ACQUISITION_UNAVAILABLE, PUBLISH_WORKTREE_PARENT, PUBLISH_WORKTREE_PREFIX,
  QUIET_ARGUMENT, RECEIPT_NO_REASON, RECORD_TIMEOUT_MS, REV_PARSE_COMMAND, UTF8,
  WORKTREE_ADD, WORKTREE_COMMAND,
} from './publish-execution-constants.js';

const LOCAL_CORPUS_ENTRY = fileURLToPath(new URL('./publish-head.js', import.meta.url));

// --- The local corpus (owner rule, 2026-09-18) ------------------------------
// The whole corpus is proved on local machines, never on a GitHub-hosted
// runner while a local alternative exists. A publish whose gate proved a cone
// starts, after its push, a detached run of exactly the rest of the corpus for
// the pushed commit - what the cone did not prove at that commit - in a fresh
// exact checkout, where placement spreads it over the lab machines. Green, it
// records the whole-corpus receipt; red or lost, the next publish says so
// first. Every admitted source retains its own execution obligation; a newer
// publication neither cancels it nor overwrites its evidence. It runs
// from the main checkout, never from a quest worktree that may be removed
// while it runs. Thermal headroom is its runner's to gate, before every batch
// on every host; a machine that stays too hot is the runner's typed refusal,
// recorded lost. None of this can fail a publish.
const LOCAL_CORPUS_ARGUMENT = '--local-corpus';
const LOCAL_CORPUS_DIRECTORY = 'lagrange-local-corpus';
const LOCAL_CORPUS_COMMON_DIR = Object.freeze(['rev-parse', '--git-common-dir']);
const LOCAL_CORPUS_GIT_DIR_NAME = '.git';
const LOCAL_CORPUS_STATE = Object.freeze({
  STARTING: 'starting', RUNNING: 'running', GREEN: 'green', RED: 'red', LOST: 'lost',
});
const LOCAL_CORPUS_RUNNER = 'scripts/run-classified-test-files.js';
const LOCAL_CORPUS_GATE = 'scripts/checks/push-gate-corpus-worktree.js';
const LOCAL_CORPUS_GATE_FLAG = '--gate';
const LOCAL_CORPUS_RUN_FLAG = '--run';
const LOCAL_CORPUS_SHELL = 'sh';
const LOCAL_CORPUS_SHELL_COMMAND = '-c';
// $1 the file list, $2 this node. The convergence probes follow, observed as
// the hosted canary observed them: their result never decides the verdict.
// The probes run with the execution sections off: observed, they are no part
// of the corpus the receipt rests on.
const LOCAL_CORPUS_RUN_SCRIPT =
  `"$2" ${LOCAL_CORPUS_RUNNER} --stdin < "$1"; status=$?; ` +
  `${EXECUTION_SECTIONS_ENV}= npm run -s test:convergence-probes || ` +
  'echo "local corpus: convergence probes red (observed, never the verdict)"; ' +
  'exit "$status"';
const LOCAL_CORPUS_FIELD_TESTS = 'testPaths';
const LOCAL_CORPUS_SUFFIX = Object.freeze({STATE: '.json', LOG: '.log', FILES: '.files',
  CONE_REPORT: '.cone-report.json', SECTIONS: '.sections.ndjson', REPORT: '.report.json'});
const LOCAL_CORPUS_STATE_NAME = /^[0-9a-f]{40}\.json$/u;
const LOCAL_CORPUS_REPORT = Object.freeze({
  PRODUCER_KIND: 'local-corpus', PRODUCER_ID_PREFIX: 'pid-', LABEL: 'local-corpus',
  TREE_SUFFIX: '^{tree}',
});
const LOCAL_CORPUS_PROC = Object.freeze({DIRECTORY: '/proc', COMMAND: 'cmdline'});
const LOCAL_CORPUS_PS = Object.freeze(['ps', '-o', 'command=', '-p']);
const LOCAL_CORPUS_OWED = Object.freeze({
  REST: 'the rest of the corpus',
  NOTHING: 'nothing: the gate proved the whole corpus',
});
const LOCAL_CORPUS_ERROR_EVENT = 'error';
const LOCAL_CORPUS_TEXT = Object.freeze({
  PREFIX: 'publish: local corpus ',
  STARTED: 'started for ',
  NOT_STARTED: 'not started: ',
  NO_SCOPE: 'the gate left no proof scope for this commit',
  OTHER_COMMIT: 'the proof scope names another commit',
  NO_CONE: 'the proof scope lists no cone',
  FILES: ' file(s), log ',
  RED_BANNER: 'publish: !!! the local corpus was RED for ',
  LOST_BANNER: 'publish: !!! the local corpus was LOST for ',
  LOST: 'its process ended without a verdict',
  HOT: 'the machine stayed too hot to run it (thermal-headroom-exhausted)',
  EXECUTION_LOST: 'gate execution unavailable: ',
  STORAGE_UNAVAILABLE: 'publish: local corpus evidence storage unavailable for ',
  PROOF_NOT_RECORDED: 'proof-receipt-not-recorded',
  UNRECORDED: 'receipt not recorded: ',
  BOOKKEEPING: 'bookkeeping failed: ',
  ALREADY: 'already ',
  FOR_THIS_COMMIT: ' for this commit',
  RECORDED: 'publish: local corpus already recorded for ',
  NOT_STARTING: 'publish: local corpus has no starting obligation for ',
  STATE_CHANGED: 'publish: local corpus state changed during execution for ',
  INVALID_RECORD: 'publish: invalid local corpus record ',
});

// Where the local corpus keeps its records (the git common dir, shared by
// every worktree) and where it runs from (the main checkout that holds it).
function localCorpusPlaces(root) {
  const common = path.resolve(root, git(root, [...LOCAL_CORPUS_COMMON_DIR]));
  return {
    stateDir: path.join(common, LOCAL_CORPUS_DIRECTORY),
    mainRoot: path.basename(common) === LOCAL_CORPUS_GIT_DIR_NAME ?
      path.dirname(common) : root,
  };
}

// Every record in the directory, newest first. An absent directory holds no
// records; unreadable or malformed evidence is not permission to replace it.
function readLocalCorpusRecords(recordDir) {
  let names = [];
  try {
    names = fs.readdirSync(recordDir);
  } catch (error) {
    if (error.code !== FILE_NOT_FOUND) throw error;
  }
  const records = [];
  for (const name of names) {
    if (!LOCAL_CORPUS_STATE_NAME.test(name)) continue;
    const file = path.join(recordDir, name);
    const record = JSON.parse(fs.readFileSync(file, UTF8));
    if (!record || typeof record !== 'object' || Array.isArray(record) ||
        record.sha + LOCAL_CORPUS_SUFFIX.STATE !== name || typeof record.state !== 'string') {
      throw new Error(LOCAL_CORPUS_TEXT.INVALID_RECORD + file);
    }
    records.push(record);
  }
  return records.sort((left, right) => (right.startedAt || 0) - (left.startedAt || 0));
}

function writeLocalCorpusState(stateDir, state) {
  fs.mkdirSync(stateDir, {recursive: true});
  const file = path.join(stateDir, `${state.sha}${LOCAL_CORPUS_SUFFIX.STATE}`);
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(state)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

// A failure to store the loss is a second failure. Keep the original
// exception primary and leave the existing uncertain obligation in place.
function retainLocalCorpusLoss(stateDir, state, error) {
  try {
    writeLocalCorpusState(stateDir, {...state, state: LOCAL_CORPUS_STATE.LOST});
  } catch (storageError) {
    process.stderr.write(`${LOCAL_CORPUS_TEXT.STORAGE_UNAVAILABLE}${state.sha}: ` +
      `${storageError.message}; original failure: ${error.message}${NEWLINE}`);
  }
}

// What a pushed commit is owed after its gate: the rest of the corpus,
// nothing (the gate proved the whole corpus), or - named - why it cannot know.
function localCorpusOwed(scope, head) {
  if (!scope || typeof scope !== 'object') return LOCAL_CORPUS_TEXT.NO_SCOPE;
  if (scope[FIELD_SHA] !== head) return LOCAL_CORPUS_TEXT.OTHER_COMMIT;
  if (scope[FIELD_FULL_CORPUS] === true) return LOCAL_CORPUS_OWED.NOTHING;
  const listsCone = scope[FIELD_FULL_CORPUS] === false &&
    Array.isArray(scope[LOCAL_CORPUS_FIELD_TESTS]);
  return listsCone ? LOCAL_CORPUS_OWED.REST : LOCAL_CORPUS_TEXT.NO_CONE;
}

/**
 * What the gate's scope leaves owed at this commit, and when it is the rest of
 * the corpus, those files: what test:all runs minus what the cone proved.
 * @param {string} checkout the exact checkout the gate ran in
 * @param {string} head
 * @param {{scopeFile?: string, wholeCorpus?: Function}} [options]
 * @return {{owed: string, files: string[]}}
 */
export function localCorpusPlan(checkout, head,
  {scopeFile = path.join(checkout, PROOF_SCOPE_PATH), wholeCorpus = wholeCorpusFiles} = {}) {
  let scope;
  try {
    scope = JSON.parse(fs.readFileSync(scopeFile, UTF8));
  } catch {
    scope = undefined;
  }
  const owed = localCorpusOwed(scope, head);
  const proved = new Set(owed === LOCAL_CORPUS_OWED.REST ? scope[LOCAL_CORPUS_FIELD_TESTS] : []);
  const files = owed === LOCAL_CORPUS_OWED.REST ?
    wholeCorpus(checkout).filter((file) => !proved.has(file)) : [];
  return {owed, files};
}

/**
 * Start the local corpus for a pushed commit, detached; returns its pid.
 * @param {{root: string, stateDir: string, head: string, files: string[],
 *   spawnProcess?: Function, env?: Object, now?: number, coneReport?: string}} input
 * @return {number}
 */
export function startLocalCorpus({root, stateDir, head, files, spawnProcess = spawn,
  env = process.env, now = Date.now(), coneReport = null}) {
  fs.mkdirSync(stateDir, {recursive: true});
  const base = path.join(stateDir, head);
  if (Object.values(LOCAL_CORPUS_SUFFIX).some((suffix) => fs.existsSync(base + suffix))) {
    throw new Error(LOCAL_CORPUS_TEXT.RECORDED + head);
  }
  // A run handed the rest of a cone owes the cone's report: without it the
  // rest is no whole corpus, whatever the run finds.
  const record = {sha: head, state: LOCAL_CORPUS_STATE.STARTING, pid: null,
    files: files.length, startedAt: now, log: `${base}${LOCAL_CORPUS_SUFFIX.LOG}`,
    ...(coneReport ? {coneOwed: true} : {})};
  // Exclusive creation is the same-head acquisition point. No companion may
  // be written until this process owns the original starting obligation.
  try {
    fs.writeFileSync(`${base}${LOCAL_CORPUS_SUFFIX.STATE}`, JSON.stringify(record) + NEWLINE,
      {flag: 'wx'});
  } catch (error) {
    if (error.code === FILE_ALREADY_EXISTS) throw new Error(LOCAL_CORPUS_TEXT.RECORDED + head);
    throw error;
  }
  let log = null;
  let child;
  try {
    fs.writeFileSync(`${base}${LOCAL_CORPUS_SUFFIX.FILES}`, files.join(NEWLINE) + NEWLINE,
      {flag: 'wx'});
    // The gate's original report of the cone it proved: the rest completes it.
    if (coneReport && fs.existsSync(coneReport)) {
      fs.copyFileSync(coneReport, `${base}${LOCAL_CORPUS_SUFFIX.CONE_REPORT}`,
        fs.constants.COPYFILE_EXCL);
    }
    log = fs.openSync(`${base}${LOCAL_CORPUS_SUFFIX.LOG}`, 'wx');
    child = spawnProcess(process.execPath,
      [LOCAL_CORPUS_ENTRY, LOCAL_CORPUS_ARGUMENT, head], {
        cwd: root, env, detached: true, stdio: ['ignore', log, log],
      });
  } catch (error) {
    retainLocalCorpusLoss(stateDir, {...record, reason: error.message}, error);
    throw error;
  } finally {
    if (log !== null) fs.closeSync(log);
  }
  // A child that could not start is lost, not an exception after the publish.
  child.on?.(LOCAL_CORPUS_ERROR_EVENT, (error) =>
    retainLocalCorpusLoss(stateDir, {...record, reason: error.message}, error));
  child.unref?.();
  return child.pid;
}

/**
 * The detached half: prove the rest of the corpus for one commit in a fresh
 * exact checkout, and record the whole-corpus receipt only when it is green.
 * Its runner gates thermal headroom before every batch; its refusal - the
 * machine stayed too hot - reached no verdict and is recorded lost, not red.
 * @param {string} root the main checkout
 * @param {string} head
 * @param {{stateDir: string, run?: Function, now?: Function}} options
 * @return {number} exit status
 */
export function runLocalCorpus(root, head, {stateDir, run = spawnSync, now = Date.now}) {
  const current = () => readLocalCorpusRecords(stateDir).find((entry) => entry.sha === head);
  const initial = current();
  if (initial?.state !== LOCAL_CORPUS_STATE.STARTING) {
    throw new Error(LOCAL_CORPUS_TEXT.NOT_STARTING + head);
  }
  const running = {...initial, state: LOCAL_CORPUS_STATE.RUNNING, pid: process.pid};
  writeLocalCorpusState(stateDir, running);
  try {
    return completeLocalCorpus(root, head, {stateDir, run, now, current});
  } catch (error) {
    let state;
    try {
      state = current();
    } catch (storageError) {
      process.stderr.write(`${LOCAL_CORPUS_TEXT.STORAGE_UNAVAILABLE}${head}: ` +
        `${storageError.message}; original failure: ${error.message}${NEWLINE}`);
      throw error;
    }
    if (state?.state === LOCAL_CORPUS_STATE.RUNNING && state.pid === process.pid) {
      retainLocalCorpusLoss(stateDir, {...state,
        reason: LOCAL_CORPUS_TEXT.EXECUTION_LOST + error.message, finishedAt: now()}, error);
    }
    throw error;
  }
}

function completeLocalCorpus(root, head, {stateDir, run, now, current}) {
  const base = path.join(stateDir, head);
  const files = `${base}${LOCAL_CORPUS_SUFFIX.FILES}`;
  const gateArgs = [LOCAL_CORPUS_GATE, LOCAL_CORPUS_GATE_FLAG, head,
    LOCAL_CORPUS_RUN_FLAG, LOCAL_CORPUS_SHELL, LOCAL_CORPUS_SHELL_COMMAND,
    LOCAL_CORPUS_RUN_SCRIPT, LOCAL_CORPUS_SHELL, files, process.execPath];
  const sections = openExecutionSections(`${base}${LOCAL_CORPUS_SUFFIX.SECTIONS}`);
  const gated = run(process.execPath, gateArgs,
    {cwd: root, stdio: INHERIT_STDIO, env: {...process.env, [EXECUTION_SECTIONS_ENV]: sections}});
  const state = current();
  if (state?.state !== LOCAL_CORPUS_STATE.RUNNING || state.pid !== process.pid) {
    throw new Error(LOCAL_CORPUS_TEXT.STATE_CHANGED + head);
  }
  if (gated?.error || !Number.isInteger(gated?.status)) {
    const reason = gated?.error?.message || gated?.signal || LOCAL_CORPUS_TEXT.LOST;
    writeLocalCorpusState(stateDir, {...state, state: LOCAL_CORPUS_STATE.LOST,
      reason: LOCAL_CORPUS_TEXT.EXECUTION_LOST + reason, finishedAt: now()});
    return 1;
  }
  if (gated.status === THERMAL_REFUSAL_EXIT) {
    writeLocalCorpusState(stateDir, {...state, state: LOCAL_CORPUS_STATE.LOST,
      reason: LOCAL_CORPUS_TEXT.HOT, finishedAt: now()});
    return gated.status;
  }
  if (gated.status !== 0) {
    writeLocalCorpusState(stateDir, {...state, state: LOCAL_CORPUS_STATE.RED,
      status: gated.status, finishedAt: now()});
    return gated.status ?? 1;
  }
  const report = writeLocalCorpusReport({root, base, head, sections,
    coneOwed: state.coneOwed === true,
    command: {label: LOCAL_CORPUS_REPORT.LABEL, argv: [process.execPath, ...gateArgs],
      exitStatus: gated.status}});
  const recorded = run(process.execPath,
    [PROOF_AUTHORITY_SCRIPT, PROOF_RECORD_COMMAND, CORPUS_PROOF_ID, head,
      PROOF_REPORT_FLAG, report],
    {cwd: root, encoding: UTF8, timeout: RECORD_TIMEOUT_MS});
  if (recorded?.status !== 0) {
    writeLocalCorpusState(stateDir, {
      ...state,
      state: LOCAL_CORPUS_STATE.RED,
      status: recorded?.status ?? 1,
      reason: LOCAL_CORPUS_TEXT.PROOF_NOT_RECORDED,
      receipt: String(recorded?.stderr || recorded?.stdout || RECEIPT_NO_REASON).trim(),
      finishedAt: now(),
    });
    return recorded?.status || 1;
  }
  writeLocalCorpusState(stateDir, {...state, state: LOCAL_CORPUS_STATE.GREEN,
    finishedAt: now(), receipt: CORPUS_PROOF_ID});
  return 0;
}

/**
 * The whole-corpus execution report of a local corpus run: the gate's cone
 * report (when the gate proved one) completed by this run's sections. The
 * planned manifest is the cone plus the rest this run was handed; the
 * candidate is the cone's, or this head's tree when the whole corpus ran here.
 * A rest run whose cone report is missing has no candidate: the authority
 * refuses that report as partial, never a whole corpus.
 * @return {string} the report file
 */
function writeLocalCorpusReport({root, base, head, sections, command, coneOwed}) {
  const coneReport = readExecutionReport(`${base}${LOCAL_CORPUS_SUFFIX.CONE_REPORT}`);
  // A malformed cone report contributes nothing; what it fails to carry the
  // authority then finds missing.
  const cone = {commands: listOf(coneReport?.commands), planned: listOf(coneReport?.planned),
    runs: listOf(coneReport?.runs)};
  const runs = [...cone.runs, ...readExecutionRuns(sections)];
  const candidate = coneReport ? coneReport.candidate ?? null :
    (coneOwed ? null : localCorpusCandidate(root, head, runs));
  return writeExecutionReport(`${base}${LOCAL_CORPUS_SUFFIX.REPORT}`, buildExecutionReport({
    candidate,
    producer: {kind: LOCAL_CORPUS_REPORT.PRODUCER_KIND,
      id: `${LOCAL_CORPUS_REPORT.PRODUCER_ID_PREFIX}${process.pid}`},
    commands: [...cone.commands, command],
    planned: [...cone.planned, ...localCorpusRest(base)],
    runs,
  }));
}

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

// The files this run was handed. The gate script reads the same list, so a
// missing one fails the run before any report is written.
function localCorpusRest(base) {
  const restFile = `${base}${LOCAL_CORPUS_SUFFIX.FILES}`;
  if (!fs.existsSync(restFile)) return [];
  return fs.readFileSync(restFile, UTF8).split(NEWLINE).filter((line) => line.trim() !== '');
}

// The whole corpus ran here, in a fresh exact checkout of head: its tree, and
// clean only when every run recorded a clean checkout.
function localCorpusCandidate(root, head, runs) {
  const tree = spawnGit([REV_PARSE_COMMAND, `${head}${LOCAL_CORPUS_REPORT.TREE_SUFFIX}`],
    {cwd: root, encoding: UTF8});
  return {sha: head, tree: String(tree.stdout || '').trim(),
    clean: runs.length > 0 && runs.every((entry) => entry.checkout?.clean === true),
    identity: null};
}

// Whether a pid is a live local corpus of ours. Fails closed: a pid it cannot
// identify is not signalled - a reused pid leading some other group would be.
function isLocalCorpusProcess(pid) {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  let command = '';
  try {
    command = fs.readFileSync(path.join(LOCAL_CORPUS_PROC.DIRECTORY, String(pid),
      LOCAL_CORPUS_PROC.COMMAND), UTF8);
  } catch {
    const listed = spawnSync(LOCAL_CORPUS_PS[0], [...LOCAL_CORPUS_PS.slice(1), String(pid)],
      {encoding: UTF8});
    command = listed.status === 0 ? String(listed.stdout) : '';
  }
  return command.includes(LOCAL_CORPUS_ARGUMENT);
}

/**
 * Name every running local corpus whose process is gone lost. Signals
 * nothing: done at the start of every publish, before anything is known about
 * whether this publish will reach main.
 * @param {string} stateDir
 */
export function reconcileLocalCorpus(stateDir) {
  for (const state of readLocalCorpusRecords(stateDir)) {
    if (state.state === LOCAL_CORPUS_STATE.RUNNING && !isLocalCorpusProcess(state.pid)) {
      writeLocalCorpusState(stateDir, {...state, state: LOCAL_CORPUS_STATE.LOST});
    }
  }
}

function localCorpusDetail(state) {
  if (state.state === LOCAL_CORPUS_STATE.LOST) return state.reason || LOCAL_CORPUS_TEXT.LOST;
  if (state.receipt && state.receipt !== CORPUS_PROOF_ID) {
    return `${LOCAL_CORPUS_TEXT.UNRECORDED}${state.receipt}`;
  }
  return `${state.files}${LOCAL_CORPUS_TEXT.FILES}${state.log}`;
}

function localCorpusLine(state) {
  return `${LOCAL_CORPUS_TEXT.PREFIX}${state.sha}: ${state.state} (${localCorpusDetail(state)})`;
}

/**
 * What the local corpus last said, before anything else a publish does: every
 * red or lost run, then the newest record. Reporting never deletes evidence.
 * @param {string} stateDir
 * @param {Function} write
 */
export function reportLocalCorpus(stateDir, write) {
  const states = readLocalCorpusRecords(stateDir);
  for (const state of states) {
    if (state.state === LOCAL_CORPUS_STATE.RED) {
      const detail = state.receipt && state.receipt !== CORPUS_PROOF_ID ?
        `${LOCAL_CORPUS_TEXT.UNRECORDED}${state.receipt}` : state.log;
      write(`${LOCAL_CORPUS_TEXT.RED_BANNER}${state.sha}: ${detail}`);
    } else if (state.state === LOCAL_CORPUS_STATE.LOST) {
      write(`${LOCAL_CORPUS_TEXT.LOST_BANNER}${state.sha}: ${localCorpusDetail(state)}`);
    }
  }
  if (states.length > 0) write(localCorpusLine(states[0]));
}

// After the verified push, start the rest when the gate proved a cone and
// this source has no earlier record. Other sources retain their obligations.
function localCorpusAfterPush(worktree, head, localCorpus) {
  const {stateDir, mainRoot, write, spawnProcess, wholeCorpus} = localCorpus;
  // Repeating a publication cannot overwrite a failed or uncertain attempt.
  const covering = readLocalCorpusRecords(stateDir).find((record) =>
    record.sha === head);
  if (covering) {
    write(`${LOCAL_CORPUS_TEXT.PREFIX}${LOCAL_CORPUS_TEXT.NOT_STARTED}` +
      `${LOCAL_CORPUS_TEXT.ALREADY}${covering.state}${LOCAL_CORPUS_TEXT.FOR_THIS_COMMIT}`);
    return;
  }
  const {owed, files} = localCorpusPlan(worktree, head, {wholeCorpus});
  if (owed !== LOCAL_CORPUS_OWED.REST) {
    if (owed !== LOCAL_CORPUS_OWED.NOTHING) {
      write(`${LOCAL_CORPUS_TEXT.PREFIX}${LOCAL_CORPUS_TEXT.NOT_STARTED}${owed}`);
    }
    return;
  }
  startLocalCorpus({root: mainRoot, stateDir, head, files, spawnProcess,
    coneReport: path.join(worktree, EXECUTION_REPORT_PATH)});
  write(`${LOCAL_CORPUS_TEXT.PREFIX}${LOCAL_CORPUS_TEXT.STARTED}${head}: ${files.length}` +
    `${LOCAL_CORPUS_TEXT.FILES}${path.join(stateDir, head)}${LOCAL_CORPUS_SUFFIX.LOG}`);
}

// Bookkeeping never fails a publish: the push is verified, or not yet begun.
function localCorpusBookkeeping(write, action) {
  try {
    action();
  } catch (error) {
    write(`${LOCAL_CORPUS_TEXT.PREFIX}${LOCAL_CORPUS_TEXT.BOOKKEEPING}${error.message}`);
  }
}

// --- The post-merge arm (owner process change, 2026-09-23) ------------------
// A head merged through GitHub never met the local gate or this publisher, so
// no corpus ran for it and it holds no whole-corpus receipt. The operator runs
// this arm for such a head. It refuses anything that is not a head of
// origin/main (on its first-parent history) or that already holds a receipt;
// plans the whole corpus from a clean temporary checkout of that sha - no
// local gate proved a cone for it, and a local receipt never reads what the
// hosted run claimed; and starts the same detached local corpus a publish
// starts, which records the receipt only when green. It pushes, stages and
// amends nothing. The receipt is its one outward write: the action authority
// is asked here, before a run that could not record, and again by the proof
// authority when it writes.
const POST_MERGE_ARGUMENT = '--post-merge';
const POST_MERGE_FULL_SHA = /^[0-9a-f]{40}$/u;
const POST_MERGE_FIRST_PARENT = Object.freeze(['rev-list', '--first-parent']);
// The proof authority is spawned, never imported, as on the record path: an
// import would put its whole closure into the push gate's (the gate imports
// this module). This publisher's own copy answers, for the caller's checkout,
// through its CLI contract: `check --json` exits 0 proven, 1 unproven, and
// otherwise could not answer; stdout carries the typed outcome.
const POST_MERGE_AUTHORITY = fileURLToPath(new URL('./proof-authority.js', import.meta.url));
const PROOF_CHECK_COMMAND = 'check';
const PROOF_JSON_FLAG = '--json';
const PROOF_CHECK = Object.freeze({
  PROVEN: Object.freeze({status: 0, outcome: 'proven'}),
  UNPROVEN: Object.freeze({status: 1, outcome: 'unproven'}),
});
const PROOF_UNANSWERED = Object.freeze({status: null, outcome: 'unanswered'});
const PROOF_UNREADABLE = 'unreadable';
const POST_MERGE_REFUSAL = Object.freeze({
  NOT_A_SHA: 'not-a-full-sha',
  NOT_ON_MAIN: 'not-a-main-head',
  ALREADY_PROVEN: 'already-proven',
  PROOF_STORE_UNAVAILABLE: 'proof-store-unavailable',
  RECORD_REFUSED: 'receipt-not-authorized',
  ALREADY_RECORDED: 'already-recorded',
});
const POST_MERGE_TEXT = Object.freeze({
  REFUSED: 'publish --post-merge: refused (',
  CLOSE: '): ',
  NOT_A_SHA: 'name the exact 40-character sha of a head on origin/main',
  NOT_ON_MAIN: ' is not a head of origin/main (not on its first-parent history)',
  ALREADY_PROVEN: ` already holds a ${CORPUS_PROOF_ID} receipt; nothing is owed`,
  UNAVAILABLE: 'the proof store could not answer: ',
  RECORD_REFUSED: 'recording the receipt is not authorized: ',
  ALREADY_RECORDED: 'a local corpus attempt is already recorded for ',
  OWED_PREFIX: 'publish: post-merge corpus owed for ',
  OWED: ': the whole corpus (no local gate proved a cone for a GitHub-merged head), ',
  ONLY_OPTION: `publish: ${POST_MERGE_ARGUMENT} takes no other option`,
});

function postMergeRefusal(refusal, detail) {
  const error = new Error(
    `${POST_MERGE_TEXT.REFUSED}${refusal}${POST_MERGE_TEXT.CLOSE}${detail}`);
  error.refusal = refusal;
  return error;
}

// Whether sha is a head of origin/main as the remote holds it now: a commit on
// its first-parent history, which is what a merge through GitHub leaves. A
// branch commit reached only through a merge commit was never a main head.
function isMainHead(root, sha) {
  checkedGit([FETCH_COMMAND, QUIET_ARGUMENT, ORIGIN_REMOTE, MAIN_BRANCH], {cwd: root});
  const heads = git(root,
    [...POST_MERGE_FIRST_PARENT, `${ORIGIN_REMOTE}/${MAIN_BRANCH}`]);
  return heads.split(NEWLINE).includes(sha);
}

// The whole corpus at sha, read from a clean temporary checkout. A failed
// acquisition or cleanup keeps the original and refuses corpus admission.
function mergedHeadCorpus(root, sha, wholeCorpus) {
  const parent = path.join(root, ...PUBLISH_WORKTREE_PARENT);
  fs.mkdirSync(parent, {recursive: true});
  const worktree = fs.mkdtempSync(path.join(parent, PUBLISH_WORKTREE_PREFIX));
  let added = false;
  let primary = null;
  let files;
  try {
    checkedGit([WORKTREE_COMMAND, WORKTREE_ADD, QUIET_ARGUMENT, DETACH_ARGUMENT, worktree, sha],
      {cwd: root});
    added = true;
    files = wholeCorpus(worktree);
  } catch (error) {
    primary = {error};
  }
  let cleanup = null;
  try {
    if (added) removePublishCheckout(root, worktree, null);
    else process.stderr.write(`${PUBLISH_ACQUISITION_UNAVAILABLE}${worktree}${NEWLINE}`);
  } catch (error) {
    cleanup = {error};
  }
  if (primary) throw primary.error;
  if (cleanup) throw cleanup.error;
  return files;
}

// The outcome the authority stated on stdout, or UNREADABLE.
function statedProofOutcome(stdout) {
  try {
    return JSON.parse(String(stdout || '')).outcome || PROOF_UNREADABLE;
  } catch {
    return PROOF_UNREADABLE;
  }
}

// The authority's answer for sha: PROVEN, UNPROVEN, or UNANSWERED with why.
function corpusProofAnswer(run, root, sha) {
  let answered = null;
  try {
    answered = run(process.execPath,
      [POST_MERGE_AUTHORITY, PROOF_CHECK_COMMAND, CORPUS_PROOF_ID, sha, PROOF_JSON_FLAG],
      {cwd: root, encoding: UTF8, timeout: RECORD_TIMEOUT_MS});
  } catch (error) {
    return {answer: PROOF_UNANSWERED, because: error.message};
  }
  const stated = statedProofOutcome(answered?.stdout);
  const answer = Object.values(PROOF_CHECK).find((candidate) =>
    answered?.status === candidate.status && stated === candidate.outcome);
  return answer ? {answer, because: RECEIPT_NO_REASON} :
    {answer: PROOF_UNANSWERED, because: String(answered?.stderr || answered?.stdout ||
      answered?.error?.message || RECEIPT_NO_REASON).trim()};
}

// Refuse before any work when the head is owed nothing or cannot be proved.
function assertMergedHeadOwed(run, root, sha) {
  if (!POST_MERGE_FULL_SHA.test(String(sha))) {
    throw postMergeRefusal(POST_MERGE_REFUSAL.NOT_A_SHA, POST_MERGE_TEXT.NOT_A_SHA);
  }
  if (!isMainHead(root, sha)) {
    throw postMergeRefusal(POST_MERGE_REFUSAL.NOT_ON_MAIN, `${sha}${POST_MERGE_TEXT.NOT_ON_MAIN}`);
  }
  const proof = corpusProofAnswer(run, root, sha);
  if (proof.answer === PROOF_CHECK.PROVEN) {
    throw postMergeRefusal(POST_MERGE_REFUSAL.ALREADY_PROVEN,
      `${sha}${POST_MERGE_TEXT.ALREADY_PROVEN}`);
  }
  if (proof.answer !== PROOF_CHECK.UNPROVEN) {
    throw postMergeRefusal(POST_MERGE_REFUSAL.PROOF_STORE_UNAVAILABLE,
      `${POST_MERGE_TEXT.UNAVAILABLE}${proof.because}`);
  }
  const decision = authorizeAction({action: ACTION.RECORD_PROOF});
  if (!isAuthorized(decision)) {
    throw postMergeRefusal(POST_MERGE_REFUSAL.RECORD_REFUSED,
      `${POST_MERGE_TEXT.RECORD_REFUSED}${decision.because || decision.requires}`);
  }
}

// A recorded attempt is never implicitly replayed. Other source identities
// retain their own attempts; physical execution remains bounded by host locks.
function assertLocalCorpusFree(stateDir, sha) {
  if (readLocalCorpusRecords(stateDir).some((record) => record.sha === sha)) {
    throw postMergeRefusal(POST_MERGE_REFUSAL.ALREADY_RECORDED,
      `${POST_MERGE_TEXT.ALREADY_RECORDED}${sha}`);
  }
}

/**
 * The post-merge arm: start the local corpus for a head already on origin/main
 * that no publish proved, so its whole-corpus receipt gets recorded.
 * @param {string} root
 * @param {string} sha the merged head
 * @param {{run?: Function, write?: Function, spawnProcess?: Function,
 *   wholeCorpus?: Function, localCorpusDir?: string}} [options]
 * @return {{sha: string, files: number, pid: number, log: string}}
 */
export function proveMergedHead(root, sha, options = {}) {
  const run = options.run || spawnSync;
  const write = options.write || ((line) => process.stdout.write(`${line}${NEWLINE}`));
  assertMergedHeadOwed(run, root, sha);
  const places = localCorpusPlaces(root);
  const stateDir = options.localCorpusDir || places.stateDir;
  reconcileLocalCorpus(stateDir);
  reportLocalCorpus(stateDir, write);
  assertLocalCorpusFree(stateDir, sha);
  const files = mergedHeadCorpus(root, sha, options.wholeCorpus || wholeCorpusFiles);
  const pid = startLocalCorpus({root: places.mainRoot, stateDir, head: sha, files,
    spawnProcess: options.spawnProcess || spawn});
  const log = `${path.join(stateDir, sha)}${LOCAL_CORPUS_SUFFIX.LOG}`;
  write(`${POST_MERGE_TEXT.OWED_PREFIX}${sha}${POST_MERGE_TEXT.OWED}${files.length}` +
    `${LOCAL_CORPUS_TEXT.FILES}${log}`);
  return {sha, files: files.length, pid, log};
}

export {
  LOCAL_CORPUS_ARGUMENT, LOCAL_CORPUS_OWED, POST_MERGE_ARGUMENT,
  POST_MERGE_REFUSAL, POST_MERGE_TEXT, localCorpusAfterPush,
  localCorpusBookkeeping, localCorpusPlaces,
};
