// The four v2 commands over a scratch git repository: start refuses a green
// probe and records the seal-time value; note needs a seal for attempts;
// land honors the last verdict, requires verification for src/, enforces the
// altitude budget and the epic scope, then commits and records solved.

import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  ENTRY_TYPE, FINDING_KIND, NEXT_OWNER, PROBE, QUEST_SCHEMA, QUEST_STATUS, VERDICT,
} from '../../scripts/solve/schema.js';
import {readLog, readQuest} from '../../scripts/solve/store.js';
import {
  ALTITUDE_BUDGET, SolveError, board, land, landChangeProofEnvironment, note,
  probe, runChangeProof, start,
} from '../../scripts/solve/commands.js';
import {
  CHECK_BASE_ENV, RANGE_SOURCE,
} from '../../scripts/checks/change-selection-constants.js';
import {resolvedCheckRange} from '../../scripts/checks/changed-paths.js';
import {
  RETRY_FAILED_ONCE_ENABLED, RETRY_FAILED_ONCE_ENV,
} from '../../scripts/run-test-files.js';
import {
  OFFENCE as SHAPE_OFFENCE, closedQuestShapeOffences,
} from '../../scripts/checks/check-closed-quest-shape.js';
import {
  OUTCOME, PROOF, RESOLUTION, buildReceipt, buildTagBody, identityRef, proofRef, resolveProof,
} from '../../scripts/proof-authority.js';
import {computeReleaseProofIdentity} from '../../scripts/release-proof-identity.js';
import {stagedSourceChange} from '../../scripts/solve/guards.js';

const QUEST_ID = 'demo';
const EPIC_ID = 'demo-epic';
const ORACLE = `solve/quests/${QUEST_ID}/evidence/oracle.json`;
const STATEMENT = 'The demo metric reaches zero.';
const VERIFIER = 'subagent:v1';
const SRC_FILE = 'src/thing.js';
const DOC_FILE = 'docs/thing.md';
const OUTSIDE_FILE = 'other/thing.txt';
const TEXT = 'note';
const GIT_USER = ['-c', 'user.name=t', '-c', 'user.email=t@example.com'];

function git(root, args) {
  return execFileSync('git', [...GIT_USER, ...args], {cwd: root, encoding: 'utf8'});
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

function repo(t, {metric = 1, legacy = false} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-cmd-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init', '-q']);
  // The code under test commits through this repository, and a machine
  // without a global git identity (any CI runner) would otherwise refuse.
  git(root, ['config', 'user.name', 'lagrange-test']);
  git(root, ['config', 'user.email', 'lagrange-test@example.com']);
  write(root, 'solve/epics/demo-epic.md', ['---', `id: ${EPIC_ID}`, 'status: open',
    'proof: deterministic', legacy ? 'legacy: true' : 'doneWhen:',
    ...(legacy ? [] : ['  probe: oracle', '  args:', `    file: ${ORACLE}`]),
    'quests:', `  - ${QUEST_ID}`, 'authorizes:', '  - src/**', '  - docs/**', '---', '',
    '# Demo', ''].join('\n'));
  write(root, `solve/quests/${QUEST_ID}/quest.json`, JSON.stringify({
    schema: QUEST_SCHEMA, id: QUEST_ID, statement: STATEMENT, epic: EPIC_ID,
    doneWhen: {probe: PROBE.ORACLE, args: {file: ORACLE}},
  }));
  write(root, ORACLE, JSON.stringify({metric, target: 0}));
  write(root, '.gitkeep', '');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'seed']);
  return root;
}

function refuses(fn, pattern) {
  assert.throws(fn, (error) => error instanceof SolveError && pattern.test(error.message),
    `expected refusal matching ${pattern}`);
}

function goGreen(root) {
  write(root, ORACLE, JSON.stringify({metric: 0, target: 0}));
}

test('start refuses a green or non-measuring probe; a red one seals', (t) => {
  refuses(() => start(repo(t, {metric: 0}), {id: QUEST_ID}), /green probe/u);
  const unmeasured = repo(t);
  fs.unlinkSync(path.join(unmeasured, ORACLE));
  refuses(() => start(unmeasured, {id: QUEST_ID}), /does not measure/u);
  const root = repo(t);
  const sealed = start(root, {id: QUEST_ID});
  assert.match(sealed.sealedAt, /^[0-9a-f]{40}$/u);
  assert.equal(readQuest(root, QUEST_ID).sealedAt, sealed.sealedAt);
  const log = readLog(root, QUEST_ID);
  assert.equal(log[0].seal.metric, 1);
  refuses(() => start(root, {id: QUEST_ID}), /already sealed/u);
  refuses(() => start(root, {id: 'missing'}), /no quest/u);
});

test('note: attempts need a seal; findings, verifications and blocked entries record', (t) => {
  const root = repo(t);
  refuses(() => note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT}), /not sealed/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, text: TEXT, kind: FINDING_KIND.THEORY,
    status: 'active'});
  start(root, {id: QUEST_ID});
  write(root, DOC_FILE, TEXT);
  const attempt = note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  assert.deepEqual(attempt.entry.paths, [DOC_FILE]);
  assert.equal(attempt.entry.pathCount, 1);
  assert.equal(attempt.entry.truncated, undefined);
  refuses(() => note(root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, text: TEXT, kind: 'vibes'}),
    /kind/u);
  refuses(() => note(root, {id: QUEST_ID, type: ENTRY_TYPE.TERMINAL, text: TEXT,
    status: QUEST_STATUS.SOLVED}), /land/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.TERMINAL, text: TEXT, status: QUEST_STATUS.BLOCKED,
    nextOwner: NEXT_OWNER.JUDGMENT});
  const shown = probe(root, {id: QUEST_ID});
  assert.equal(shown.status, QUEST_STATUS.BLOCKED);
  assert.equal(shown.delta, 0);
  assert.equal(shown.recent.length, 3);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.TERMINAL, text: TEXT, status: QUEST_STATUS.EXHAUSTED});
  refuses(() => note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT}), /exhausted/u);
});

test('land: red probe, standing rejection, src without verification, altitude, scope', (t) => {
  const root = repo(t);
  start(root, {id: QUEST_ID});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /not green/u);
  goGreen(root);
  write(root, SRC_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /production-surface \(src\/, vendor\/\) changes need a verification/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.REJECT});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /rejection/u);
  for (let index = 0; index <= ALTITUDE_BUDGET; index += 1) {
    note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  }
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /altitude-check/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, text: TEXT,
    kind: FINDING_KIND.ALTITUDE_CHECK});
  write(root, OUTSIDE_FILE, TEXT);
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /outside epic/u);
  fs.unlinkSync(path.join(root, OUTSIDE_FILE));
  const landed = land(root, {id: QUEST_ID, skipProof: true});
  assert.match(landed.commit, /^[0-9a-f]{40}$/u);
  assert.deepEqual(landed.paths, [SRC_FILE]);
  assert.equal(git(root, ['status', '--porcelain']).trim(), '', 'everything committed');
  assert.match(git(root, ['log', '-1', '--format=%B']), new RegExp(`Quest: ${QUEST_ID}`, 'u'));
  const state = readLog(root, QUEST_ID).at(-1);
  assert.equal(state.type, ENTRY_TYPE.TERMINAL);
  assert.equal(state.status, QUEST_STATUS.SOLVED);
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /solved/u);
});

test('a legacy epic carries no scope; docs-only landings need no verifier', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, OUTSIDE_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const landed = land(root, {id: QUEST_ID, skipProof: true});
  assert.ok(landed.paths.includes(OUTSIDE_FILE));
  const shown = board(root);
  assert.equal(shown.quests.length, 0);
  assert.equal(shown.counts.quests, 1);
  assert.equal(shown.epics[0].legacy, true);
});

test('land refuses a blocked quest and a probe changed after the seal', (t) => {
  const root = repo(t);
  start(root, {id: QUEST_ID});
  goGreen(root);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.TERMINAL, text: TEXT, status: QUEST_STATUS.BLOCKED,
    nextOwner: NEXT_OWNER.AUTHORIZATION});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /blocked/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const drifted = {...readQuest(root, QUEST_ID),
    doneWhen: {probe: PROBE.ORACLE, args: {file: `${ORACLE}.other`}}};
  write(root, `solve/quests/${QUEST_ID}/quest.json`, JSON.stringify(drifted));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /immutable after start/u);
});

test('a refused commit takes the terminal entry back out', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  goGreen(root);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const hooks = path.join(root, '.git', 'hooks');
  fs.mkdirSync(hooks, {recursive: true});
  fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nexit 1\n', {mode: 0o755});
  const before = readLog(root, QUEST_ID).length;
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /commit was refused/u);
  assert.equal(readLog(root, QUEST_ID).length, before, 'no solved entry survives');
  assert.equal(git(root, ['diff', '--cached', '--name-only']).trim(), '', 'nothing stays staged');
  assert.equal(probe(root, {id: QUEST_ID}).status, QUEST_STATUS.OPEN);
  fs.unlinkSync(path.join(hooks, 'pre-commit'));
  assert.match(land(root, {id: QUEST_ID, skipProof: true}).commit, /^[0-9a-f]{40}$/u);
});

test('the change proof runs against the tree that will be committed', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, DOC_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  // A checker that reads the repository through `git ls-files` (the test
  // taxonomy liveness rules, the classification shards) must see the new
  // file while the proof runs, not after the commit.
  let trackedDuringProof = null;
  land(root, {id: QUEST_ID, runProof: () => {
    trackedDuringProof = git(root, ['ls-files', DOC_FILE]).trim();
  }});
  assert.equal(trackedDuringProof, DOC_FILE);
});

test('a failing change proof leaves nothing staged and the quest open', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, DOC_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  refuses(() => land(root, {id: QUEST_ID, runProof: () => {
    throw new SolveError('npm test failed (exit 1)');
  }}), /npm test failed/u);
  assert.equal(git(root, ['diff', '--cached', '--name-only']).trim(), '',
    'a refused proof gives the index back');
  assert.equal(probe(root, {id: QUEST_ID}).status, QUEST_STATUS.OPEN);
});

test('the commit-time checks run before the proof and a miss costs no test run', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, DOC_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  // A hook that refuses the staged tree the way the file-size ratchet does.
  write(root, '.githooks/pre-commit',
    'echo "Source oversized-file ratchet: 28/27 over 800 lines."; exit 1\n');
  let proofRan = false;
  refuses(() => land(root, {id: QUEST_ID, runProof: () => {
    proofRan = true;
  }}), /commit-time checks refused[\s\S]*oversized-file ratchet/u);
  assert.equal(proofRan, false, 'the proof never started');
  assert.equal(git(root, ['diff', '--cached', '--name-only']).trim(), '',
    'the index is given back');
  assert.equal(probe(root, {id: QUEST_ID}).status, QUEST_STATUS.OPEN);
  // The hook sees the staged tree and the landing marker the commit carries.
  write(root, '.githooks/pre-commit',
    '[ "$LAGRANGE_SOLVER_LANDING" = 1 ] && git diff --cached --name-only | grep -q docs/ ' +
    '&& exit 0; exit 1\n');
  const landed = land(root, {id: QUEST_ID, runProof: () => {
    proofRan = true;
  }});
  assert.equal(proofRan, true, 'a passing hook lets the proof run');
  assert.match(landed.commit, /^[0-9a-f]{40}$/u);
});

test('a path already staged as a deletion still lands', (t) => {
  const root = repo(t, {legacy: true});
  const doomed = 'docs/retired.md';
  write(root, doomed, TEXT);
  git(root, ['add', doomed]);
  git(root, ['commit', '-q', '-m', 'add the file the cutover deletes']);
  start(root, {id: QUEST_ID});
  goGreen(root);
  // `git rm` leaves the path in neither the working tree nor the index; a
  // bare `git add -- <path>` would refuse the pathspec outright.
  git(root, ['rm', '--quiet', doomed]);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const landed = land(root, {id: QUEST_ID, skipProof: true});
  assert.ok(landed.paths.includes(doomed));
  assert.equal(git(root, ['status', '--porcelain']).trim(), '');
  assert.equal(git(root, ['ls-files', doomed]).trim(), '', 'the deletion is committed');
});

test('probe --epic measures the epic doneWhen', (t) => {
  const root = repo(t);
  const shown = probe(root, {epic: EPIC_ID});
  assert.equal(shown.probe.metric, 1);
  refuses(() => probe(root, {epic: 'nope'}), /no epic/u);
});

test('a large change set is recorded by size and a bounded sample', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  for (let index = 0; index < 60; index += 1) {
    write(root, `docs/bulk-${index}.md`, TEXT);
  }
  const attempt = note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  assert.equal(attempt.entry.pathCount, 60);
  assert.equal(attempt.entry.paths.length, 50);
  assert.equal(attempt.entry.truncated, true);
  goGreen(root);
  const landed = land(root, {id: QUEST_ID, skipProof: true});
  const terminal = readLog(root, QUEST_ID).at(-1);
  assert.equal(terminal.pathCount, landed.paths.length);
  assert.equal(terminal.paths.length, 50);
  // The log stays small; the commit holds the exact set.
  assert.ok(fs.statSync(path.join(root, `solve/quests/${QUEST_ID}/log.ndjson`)).size < 16384);
});

test('the change proof is spawned against the quest delta, HEAD, and says so', () => {
  // The index land proves differs from HEAD by exactly the staged scope, so
  // HEAD names the quest delta; a branch carrying earlier landed quests would
  // otherwise prove them all again at every land (1927 tests for a one-file
  // repair, 2026-09-17). The spawn seam observes the environment the proof
  // really runs under, not only the helper that builds it.
  const spawned = [];
  const lines = [];
  const spawn = (command, args, options) => {
    spawned.push({command, args, options});
    return {status: 0, stdout: '', stderr: ''};
  };
  runChangeProof('/repo', (line) => lines.push(line), spawn);
  assert.equal(spawned.length, 1);
  assert.deepEqual([spawned[0].command, spawned[0].args], ['npm', ['test']]);
  assert.equal(spawned[0].options.cwd, '/repo');
  assert.equal(spawned[0].options.env[CHECK_BASE_ENV], 'HEAD',
    'the proof process carries the pinned base');
  assert.equal(spawned[0].options.env.PATH, process.env.PATH,
    'the rest of the environment is the caller\'s');
  assert.match(lines[0], /change proof base HEAD/u, 'the base is announced before the proof');
  // Through the one ladder the static layer and the selector share, that
  // environment resolves to HEAD as an ENVIRONMENT range, never a silent
  // publication default; an unqualified proof - the push gate's - keeps
  // the publication merge-base rung (decision 0538db5c7).
  assert.deepEqual(resolvedCheckRange(null, landChangeProofEnvironment({}), '/repo'),
    {base: 'HEAD', source: RANGE_SOURCE.ENVIRONMENT});
  const caller = {KEEP: 'me'};
  const landing = landChangeProofEnvironment(caller);
  assert.equal(landing.KEEP, 'me');
  assert.equal(caller[CHECK_BASE_ENV], undefined, 'the caller environment is not mutated');
});

test('the change proof runs under the recorded retry policy, as CI does', () => {
  // ci.yml, full-gate.yml and the canary export LAGRANGE_RETRY_FAILED_ONCE=1;
  // land ran without it, so a flake cost a whole re-land where CI would have
  // rerun the file once standalone, reported and capped (never hidden).
  // Local is now equal to CI, not weaker.
  const spawned = [];
  const lines = [];
  const spawn = (command, args, options) => {
    spawned.push(options);
    return {status: 0, stdout: '', stderr: ''};
  };
  runChangeProof('/repo', (line) => lines.push(line), spawn);
  assert.equal(spawned[0].env[RETRY_FAILED_ONCE_ENV], RETRY_FAILED_ONCE_ENABLED,
    'the proof process carries the retry-once policy');
  assert.equal(spawned[0].env[CHECK_BASE_ENV], 'HEAD', 'and still the quest-delta base');
  assert.match(lines[0], /rerun once/u, 'the policy is announced with the base');
  const caller = {};
  const landing = landChangeProofEnvironment(caller);
  assert.equal(landing[RETRY_FAILED_ONCE_ENV], RETRY_FAILED_ONCE_ENABLED);
  assert.equal(caller[RETRY_FAILED_ONCE_ENV], undefined, 'the caller environment is not mutated');
});

// --- land judges its own quest's closed shape ---------------------------------
// Every land guard looks outside the quest's own directory, and the closed-
// quest audit looks only at quests whose log is already terminal, so a quest
// carrying an evidence file its sealed claim does not require landed green
// and left the landed commit red (6929b84de, repaired by 5768db879).

const EXTRA_EVIDENCE = `solve/quests/${QUEST_ID}/evidence/extra.json`;

test('land refuses a quest holding a file its sealed claim does not require, before any proof', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, DOC_FILE, TEXT);
  write(root, EXTRA_EVIDENCE, '{}');
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const indexBefore = git(root, ['diff', '--cached', '--name-only']);
  let proofRan = false;
  refuses(() => land(root, {id: QUEST_ID, runProof: () => {
    proofRan = true;
  }}), new RegExp(`${EXTRA_EVIDENCE}: ${SHAPE_OFFENCE.UNREQUIRED}`, 'u'));
  assert.equal(proofRan, false, 'no proof ran for a landing that would close red');
  assert.equal(git(root, ['diff', '--cached', '--name-only']), indexBefore,
    'the index is left as it was');
  assert.equal(probe(root, {id: QUEST_ID}).status, QUEST_STATUS.OPEN);
  // The twin without the unrequired file lands, and closes clean.
  fs.unlinkSync(path.join(root, EXTRA_EVIDENCE));
  assert.match(land(root, {id: QUEST_ID, runProof: () => {}}).commit, /^[0-9a-f]{40}$/u);
  assert.deepEqual(closedQuestShapeOffences({root}), []);
});

test('land refuses to commit a rewritten quest log', (t) => {
  const root = repo(t, {legacy: true});
  start(root, {id: QUEST_ID});
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'record the sealed quest']);
  goGreen(root);
  write(root, DOC_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  const log = path.join(root, `solve/quests/${QUEST_ID}/log.ndjson`);
  fs.writeFileSync(log, fs.readFileSync(log, 'utf8').replace('sealed at', 'SEALED AT'));
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}),
    /log\.ndjson: committed entries were rewritten in place/u);
});

// --- admission to main: every src/ change entering main is a solver landing -----
// Owner decision 2026-10-04. Driven through the command the push gate runs
// (the landing guard's own `admit`), spawned in scratch repositories; the
// receipts are real proof-authority tags on a bare remote.
const ADMISSION_CLI = path.resolve('scripts/solve/guards.js');

function parsedOrNull(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function headOf(root, rev = 'HEAD') {
  return git(root, ['rev-parse', rev]).trim();
}

function commitAll(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
  return headOf(root);
}

function admitRange(root, base, head = headOf(root)) {
  const run = spawnSync(process.execPath,
    [ADMISSION_CLI, 'admit', '--base', base, '--head', head, '--json'],
    {cwd: root, encoding: 'utf8'});
  const output = `${run.stdout}${run.stderr}`;
  const result = run.status === 0 ? parsedOrNull(run.stdout) : null;
  if (run.status === 0) assert.ok(result, `admit answers its verdict as JSON: ${output}`);
  return {status: run.status, stdout: run.stdout, stderr: run.stderr, output, result};
}

function refusalBlocks(run) {
  return run.stderr.split('\n- ').slice(1);
}

function assertRefused(run, commit, pattern) {
  assert.equal(run.status, 1, `refused: ${run.output}`);
  const block = refusalBlocks(run).find((part) => part.startsWith(commit));
  assert.ok(block, `the refusal names ${commit}: ${run.output}`);
  assert.match(block, pattern);
}

function landedSourceQuest(t) {
  const root = repo(t);
  const base = headOf(root);
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, SRC_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  return {root, base, landed: land(root, {id: QUEST_ID, skipProof: true}).commit};
}

test('admit refuses a direct commit that changes src/, naming the commit and its path', (t) => {
  const root = repo(t, {legacy: true});
  const base = headOf(root);
  write(root, SRC_FILE, TEXT);
  const direct = commitAll(root, 'readiness: a single-sitting fix');
  assertRefused(admitRange(root, base), direct,
    /single-sitting fix[\s\S]*not a landing[\s\S]*src\/thing\.js/u);
});

test('admit refuses typed landing trailers and hand-written terminal entries', (t) => {
  const {root, landed} = landedSourceQuest(t);
  const base = headOf(root);
  const sealedAt = readQuest(root, QUEST_ID).sealedAt;
  // Trailers alone: exactly what land writes into a message, and nothing else.
  write(root, SRC_FILE, `${TEXT} trailers`);
  const trailers = commitAll(root,
    `demo: forged\n\nQuest: ${QUEST_ID}\nEpic: ${EPIC_ID}\nSealed-At: ${sealedAt}`);
  // A typed terminal entry, unbound.
  const logPath = path.join(root, `solve/quests/${QUEST_ID}/log.ndjson`);
  const appendTerminal = (fields) => fs.appendFileSync(logPath, `${JSON.stringify({
    ts: '2026-10-04T00:00:00.000Z', type: 'terminal', status: 'solved', text: 'landed',
    ...fields})}\n`);
  write(root, SRC_FILE, `${TEXT} unbound`);
  appendTerminal({});
  const unbound = commitAll(root, 'demo: typed terminal entry');
  // A terminal entry carrying a real binding - the landing's own - over other bytes.
  const realBinding = readLog(root, QUEST_ID).find((entry) =>
    entry.type === 'terminal')?.source;
  assert.ok(realBinding, 'land records the binding of the src/ change it commits');
  write(root, SRC_FILE, `${TEXT} replayed`);
  appendTerminal({source: realBinding});
  const replayed = commitAll(root, 'demo: replayed binding');
  // The landing's exact change replayed later (the file removed, then added
  // again with a log line appended): its raw diff, and so its binding, is the
  // landing's, but no terminal entry is new in the replay.
  fs.unlinkSync(path.join(root, SRC_FILE));
  const reverted = commitAll(root, 'demo: remove the landed file');
  write(root, SRC_FILE, TEXT);
  fs.appendFileSync(logPath, `${JSON.stringify({ts: '2026-10-04T00:00:01.000Z',
    type: 'finding', kind: 'theory', text: 'replayed'})}\n`);
  const replay = commitAll(root, 'demo: replay with a log line');
  const run = admitRange(root, base);
  assertRefused(run, trailers, /not a landing/u);
  assertRefused(run, unbound, /binds no production-surface \(src\/, vendor\/\) change/u);
  assertRefused(run, replayed, /binds a different production-surface \(src\/, vendor\/\) change/u);
  assertRefused(run, reverted, /not a landing/u);
  assertRefused(run, replay, /not a landing/u);
  assert.equal(refusalBlocks(run).length, 5, run.output);
  assert.ok(!refusalBlocks(run).some((block) => block.startsWith(landed)),
    'the real landing is outside this range');
});

test('admit refuses a correctly bound terminal entry whose log records no current approval', (t) => {
  const root = repo(t);
  const base = headOf(root);
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, SRC_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  land(root, {id: QUEST_ID, skipProof: true});
  // Rebuild the same commit without the verification entry: same binding,
  // no recorded verdict.
  const logPath = path.join(root, `solve/quests/${QUEST_ID}/log.ndjson`);
  const kept = fs.readFileSync(logPath, 'utf8').split('\n')
    .filter((line) => line && JSON.parse(line).type !== 'verification');
  git(root, ['reset', '-q', '--soft', 'HEAD~1']);
  fs.writeFileSync(logPath, `${kept.join('\n')}\n`);
  const unverified = commitAll(root, 'demo: landing without its verification');
  assertRefused(admitRange(root, base), unverified, /need a verification entry/u);
});

test('admit admits a real solver landing of a src/ change', (t) => {
  const {root, base, landed} = landedSourceQuest(t);
  const run = admitRange(root, base);
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.result.admitted,
    [{commit: landed, admission: 'solver landing', coveredBy: null}]);
  assert.deepEqual(run.result.refused, []);
});

test('admit admits direct commits that touch only docs, tests and scripts', (t) => {
  const root = repo(t, {legacy: true});
  const base = headOf(root);
  write(root, DOC_FILE, TEXT);
  write(root, 'test/thing.test.js', TEXT);
  write(root, 'scripts/thing.js', TEXT);
  commitAll(root, 'docs, tests and scripts');
  const run = admitRange(root, base);
  assert.equal(run.status, 0, run.output);
  assert.equal(run.result.judged, 1);
  assert.deepEqual(run.result.refused, []);
});

test('admit judges a rename into or out of src/, a deletion and a symlink as src/ changes', (t) => {
  const root = repo(t, {legacy: true});
  write(root, DOC_FILE, TEXT);
  write(root, SRC_FILE, TEXT);
  write(root, 'src/leaving.js', TEXT);
  write(root, 'src/doomed.js', TEXT);
  const base = commitAll(root, 'tree to rearrange');
  git(root, ['mv', DOC_FILE, 'src/arrived.md']);
  const into = commitAll(root, 'rename into src');
  git(root, ['mv', 'src/leaving.js', 'docs/left.js']);
  const outOf = commitAll(root, 'rename out of src');
  git(root, ['rm', '-q', 'src/doomed.js']);
  const deletion = commitAll(root, 'delete under src');
  fs.unlinkSync(path.join(root, SRC_FILE));
  fs.symlinkSync('../docs/left.js', path.join(root, SRC_FILE));
  const symlink = commitAll(root, 'symlink under src');
  fs.symlinkSync('../src/arrived.md', path.join(root, 'docs/pointer.md'));
  const pointer = commitAll(root, 'symlink outside src pointing into it');
  const run = admitRange(root, base);
  assertRefused(run, into, /src\/arrived\.md/u);
  assertRefused(run, outOf, /src\/leaving\.js/u);
  assertRefused(run, deletion, /src\/doomed\.js/u);
  assertRefused(run, symlink, /src\/thing\.js/u);
  // A path outside src/ is not a src/ change, whatever it points at: the
  // bytes under src/ are unchanged.
  assert.equal(refusalBlocks(run).length, 4, run.output);
  assert.ok(!refusalBlocks(run).some((block) => block.startsWith(pointer)), run.output);
});

test('admit judges only what the push brings: commits on the remote main are not judged', (t) => {
  const root = repo(t, {legacy: true});
  const before = headOf(root);
  write(root, SRC_FILE, TEXT);
  const direct = commitAll(root, 'a direct src commit already on main');
  write(root, DOC_FILE, TEXT);
  commitAll(root, 'docs after it');
  const onMain = admitRange(root, direct);
  assert.equal(onMain.status, 0, `at or before the base nothing is judged: ${onMain.output}`);
  assert.equal(onMain.result.judged, 1);
  assertRefused(admitRange(root, before), direct, /not a landing/u);
});

// A long-lived integration branch of direct commits enters main as a merge:
// admitted only when an exact-SHA whole-corpus (or release) receipt names the
// merge commit itself and the merge names a sealed quest whose log records a
// current approving verification.
function remoteFor(t, root) {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-remote-'));
  t.after(() => fs.rmSync(remote, {recursive: true, force: true}));
  git(remote, ['init', '-q', '--bare']);
  git(root, ['remote', 'add', 'origin', remote]);
}

function recordReceipt(root, proofId, sha, identity = null) {
  const receipt = buildReceipt({proofId, sha, producer: {kind: 'test'}, identity});
  const tag = execFileSync('git', ['mktag'], {cwd: root, encoding: 'utf8',
    input: buildTagBody({proofId, sha, receipt})}).trim();
  git(root, ['push', '-q', 'origin', `${tag}:${proofRef(proofId, sha)}`]);
  if (identity) git(root, ['push', '-q', 'origin', `${tag}:${identityRef(proofId, identity.digest)}`]);
}

function integrationMerge(t, {questTrailer}) {
  const root = repo(t, {legacy: true});
  remoteFor(t, root);
  const base = headOf(root);
  const mainBranch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  git(root, ['checkout', '-q', '-b', 'integration']);
  write(root, SRC_FILE, TEXT);
  const branchCommit = commitAll(root, `cutover step\n\nQuest: ${QUEST_ID}`);
  write(root, DOC_FILE, TEXT);
  commitAll(root, 'cutover docs');
  git(root, ['checkout', '-q', mainBranch]);
  start(root, {id: QUEST_ID});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  git(root, ['merge', '-q', '--no-ff', '--no-commit', 'integration']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m',
    `merge the integration branch${questTrailer ? `\n\nQuest: ${QUEST_ID}` : ''}`]);
  return {root, base, branchCommit, merge: headOf(root), tip: headOf(root, 'integration')};
}

test('admit admits a long-lived branch merge only under its exact-SHA receipt and governing quest', (t) => {
  const unproven = integrationMerge(t, {questTrailer: true});
  const bare = admitRange(unproven.root, unproven.base);
  assertRefused(bare, unproven.merge, /brings 1 unlanded[\s\S]*exact-SHA corpus-full-v1/u);
  assertRefused(bare, unproven.branchCommit, /not a landing/u);
  // A receipt for the branch tip is not a receipt for the tree entering main.
  recordReceipt(unproven.root, PROOF.CORPUS_FULL, unproven.tip);
  assertRefused(admitRange(unproven.root, unproven.base), unproven.merge, /exact-SHA/u);
  // A receipt for the merge without a governing quest is not enough.
  const unnamed = integrationMerge(t, {questTrailer: false});
  recordReceipt(unnamed.root, PROOF.CORPUS_FULL, unnamed.merge);
  assertRefused(admitRange(unnamed.root, unnamed.base), unnamed.merge, /governing quest/u);
  // Both, but no owner authorisation: still refused, the merge left pending.
  recordReceipt(unproven.root, PROOF.RELEASE_FULL, unproven.merge);
  assertRefused(admitRange(unproven.root, unproven.base), unproven.merge,
    /no owner decision finding naming this merge/u);
  // The authorisation is a decision finding naming the merge's full sha,
  // appended on top of the merge (the merge cannot carry its own sha).
  const authorise = (text, kind = FINDING_KIND.DECISION) => {
    note(unproven.root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, kind, text});
    return commitAll(unproven.root, 'record the owner decision');
  };
  const otherSha = unproven.tip;
  authorise(`owner authorizes merge of PR #73: merge sha ${otherSha}, head ${unproven.tip}, ` +
    'receipt release-full-v1');
  assertRefused(admitRange(unproven.root, unproven.base), unproven.merge,
    /no owner decision finding/u);
  authorise(`owner authorizes merge of PR #73: merge sha ${unproven.merge}`, FINDING_KIND.EVIDENCE);
  assertRefused(admitRange(unproven.root, unproven.base), unproven.merge,
    /no owner decision finding/u);
  // A sha prefix is not the merge's sha: the finding must name it in full.
  authorise(`owner authorizes merge of PR #73: merge sha ${unproven.merge.slice(0, 12)}, ` +
    `head ${unproven.tip}, receipt release-full-v1`);
  assertRefused(admitRange(unproven.root, unproven.base), unproven.merge,
    /no owner decision finding/u);
  const head = authorise(`owner authorizes merge of PR #73: merge sha ${unproven.merge}, ` +
    `head ${unproven.tip}, receipt release-full-v1 (GitHub reviewDecision APPROVED)`);
  // Pushed without the finding on top, the merge is still pending.
  assertRefused(admitRange(unproven.root, unproven.base, unproven.merge), unproven.merge,
    /no owner decision finding/u);
  const admitted = admitRange(unproven.root, unproven.base, head);
  assert.equal(admitted.status, 0, admitted.output);
  assert.deepEqual(admitted.result.admitted.find((entry) =>
    entry.commit === unproven.branchCommit), {commit: unproven.branchCommit,
    admission: 'brought by an admitted merge', coveredBy: unproven.merge});
});

test('admit admits a clean merge of solver landings and refuses a merge that resolves src/ itself', (t) => {
  const {root, base, landed} = landedSourceQuest(t);
  remoteFor(t, root);
  git(root, ['branch', '-q', 'landed-work']);
  git(root, ['reset', '-q', '--hard', base]);
  write(root, DOC_FILE, TEXT);
  commitAll(root, 'main moves on');
  git(root, ['merge', '-q', '--no-ff', '-m', 'merge the landed work', 'landed-work']);
  const clean = admitRange(root, base);
  assert.equal(clean.status, 0, `a clean merge brings only landings: ${clean.output}`);
  assert.deepEqual(clean.result.admitted.map((entry) => entry.commit), [landed]);
  // The same merge with a src/ change of its own that neither parent has.
  git(root, ['reset', '-q', '--hard', 'HEAD~1']);
  git(root, ['merge', '-q', '--no-ff', '--no-commit', 'landed-work']);
  write(root, SRC_FILE, `${TEXT} resolved by hand`);
  const evil = commitAll(root, 'merge, resolving src by hand');
  assertRefused(admitRange(root, base), evil, /exact-SHA corpus-full-v1[\s\S]*src\/thing\.js/u);
});

test('admit refuses a merge proven only through a sibling\'s release content identity', (t) => {
  const {root, base, merge} = integrationMerge(t, {questTrailer: true});
  // A sibling that differs only in Solver records shares the merge's release
  // identity; its release receipt is indexed under that identity.
  write(root, 'solve/sibling-note.md', TEXT);
  const sibling = commitAll(root, 'sibling: a Solver record only');
  const identity = computeReleaseProofIdentity(root);
  recordReceipt(root, PROOF.RELEASE_FULL, sibling, identity);
  git(root, ['reset', '-q', '--hard', merge]);
  const lent = resolveProof({proofId: PROOF.RELEASE_FULL, sha: merge, cwd: root});
  assert.equal(lent.outcome, OUTCOME.PROVEN, 'the proof store lends the sibling receipt');
  assert.equal(lent.resolution, RESOLUTION.RELEASE_CONTENT_IDENTITY);
  assertRefused(admitRange(root, base), merge, /exact-SHA corpus-full-v1 or release-full-v1/u);
});

// --- attempt 3: the verifier's holes (src-via-land-review-2) ---------------------

test('admit refuses a solved entry appended to an already-closed quest and a never-sealed log', (t) => {
  const {root} = landedSourceQuest(t);
  const base = headOf(root);
  // B1: one more solved entry, correctly bound, riding the closed quest's approval.
  write(root, 'src/a.js', TEXT);
  git(root, ['add', '-A']);
  const logPath = path.join(root, `solve/quests/${QUEST_ID}/log.ndjson`);
  fs.appendFileSync(logPath, `${JSON.stringify({ts: '2026-10-04T09:00:00.000Z',
    type: 'terminal', status: 'solved', text: 'x', source: stagedSourceChange(root)})}\n`);
  const reused = commitAll(root, 'direct src fix riding a closed quest');
  assertRefused(admitRange(root, base), reused, /already closed/u);
  // The landing itself rebuilt without its seal entry: same binding, never sealed.
  const unsealedRoot = landedSourceQuest(t);
  const kept = fs.readFileSync(path.join(unsealedRoot.root, `solve/quests/${QUEST_ID}/log.ndjson`),
    'utf8').split('\n').filter((line) => line && !JSON.parse(line).seal);
  git(unsealedRoot.root, ['reset', '-q', '--soft', 'HEAD~1']);
  fs.writeFileSync(path.join(unsealedRoot.root, `solve/quests/${QUEST_ID}/log.ndjson`),
    `${kept.join('\n')}\n`);
  const unsealed = commitAll(unsealedRoot.root, 'demo: landing without its seal');
  assertRefused(admitRange(unsealedRoot.root, unsealedRoot.base), unsealed, /never sealed/u);
});

// A merge's own src/ change: every src/ path where it differs from its first
// parent, unless it took that path from a second parent that changed it since
// the merge base.
test('admit refuses a merge that reverts or drops src/ by taking a stale side', (t) => {
  const root = repo(t, {legacy: true});
  remoteFor(t, root);
  write(root, 'src/a.js', 'a1\n');
  const old = commitAll(root, 'old main');
  write(root, 'src/a.js', 'a2\n');
  const mainHead = commitAll(root, 'main moves src/a.js on');
  // P8: merge an old main commit (git calls it up to date, so plumbing),
  // keeping its src/a.js.
  git(root, ['checkout', old, '--', 'src/a.js']);
  const revert = git(root, ['commit-tree', git(root, ['write-tree']).trim(), '-p', mainHead,
    '-p', old, '-m', 'merge old main (reverts src/a.js)']).trim();
  git(root, ['reset', '-q', '--hard', mainHead]);
  assertRefused(admitRange(root, mainHead, revert), revert, /exact-SHA[\s\S]*src\/a\.js/u);
  // P9: a docs-only side branch forked before a landing; the merge drops the landing's file.
  const landed = landedSourceQuest(t);
  remoteFor(t, landed.root);
  const branch = git(landed.root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  git(landed.root, ['checkout', '-q', '-b', 'side', landed.base]);
  write(landed.root, DOC_FILE, TEXT);
  commitAll(landed.root, 'side docs');
  git(landed.root, ['checkout', '-q', branch]);
  git(landed.root, ['merge', '-q', '--no-ff', '--no-commit', 'side']);
  git(landed.root, ['rm', '-q', SRC_FILE]);
  const dropped = commitAll(landed.root, 'merge side (drops the landed file)');
  assertRefused(admitRange(landed.root, landed.landed), dropped, /exact-SHA[\s\S]*src\/thing\.js/u);
  // An octopus merge that changes src/ against its first parent takes the
  // receipt route, even where it takes a side's own change.
  git(root, ['checkout', '-q', '-b', 'o1', old]);
  write(root, 'src/a.js', 'o1\n');
  const o1 = commitAll(root, 'o1');
  git(root, ['checkout', '-q', '-b', 'o2', old]);
  write(root, 'docs/o2.md', TEXT);
  const o2 = commitAll(root, 'o2');
  git(root, ['checkout', '-q', '--detach', mainHead]);
  git(root, ['checkout', o1, '--', 'src/a.js']);
  const octopus = git(root, ['commit-tree', git(root, ['write-tree']).trim(), '-p', mainHead,
    '-p', o1, '-p', o2, '-m', 'octopus taking o1 src/a.js']).trim();
  assertRefused(admitRange(root, mainHead, octopus), octopus, /exact-SHA[\s\S]*src\/a\.js/u);
});

test('admit admits a clean merge of two landings on different files with nothing extra', (t) => {
  const root = repo(t);
  const other = 'demo2';
  const otherOracle = `solve/quests/${other}/evidence/oracle.json`;
  const epic = path.join(root, 'solve/epics/demo-epic.md');
  fs.writeFileSync(epic, fs.readFileSync(epic, 'utf8').replace(`  - ${QUEST_ID}\n`,
    `  - ${QUEST_ID}\n  - ${other}\n`));
  write(root, `solve/quests/${other}/quest.json`, JSON.stringify({schema: QUEST_SCHEMA,
    id: other, statement: STATEMENT, epic: EPIC_ID,
    doneWhen: {probe: PROBE.ORACLE, args: {file: otherOracle}}}));
  write(root, otherOracle, JSON.stringify({metric: 1, target: 0}));
  const base = commitAll(root, 'a second quest');
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const landOne = (id, oracle, file) => {
    start(root, {id});
    write(root, oracle, JSON.stringify({metric: 0, target: 0}));
    write(root, file, TEXT);
    note(root, {id, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
    note(root, {id, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
      verdict: VERDICT.APPROVE});
    return land(root, {id, skipProof: true}).commit;
  };
  git(root, ['checkout', '-q', '-b', 'side']);
  const sideLanding = landOne(QUEST_ID, ORACLE, SRC_FILE);
  git(root, ['checkout', '-q', branch]);
  const mainLanding = landOne(other, otherOracle, 'src/other.js');
  git(root, ['merge', '-q', '--no-ff', '-m', 'merge two landings', 'side']);
  const run = admitRange(root, base);
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.result.admitted.map((entry) => entry.commit).sort(),
    [mainLanding, sideLanding].sort());
});

test('admit refuses a range whose base is not an ancestor or is unknown, without a stack trace', (t) => {
  const {root, base, landed} = landedSourceQuest(t);
  const rewound = admitRange(root, landed, base);
  assert.equal(rewound.status, 1, rewound.output);
  assert.match(rewound.output, /is not an ancestor/u);
  const unknown = admitRange(root, 'deadbeef'.repeat(5), base);
  assert.equal(unknown.status, 1, unknown.output);
  assert.match(unknown.output, /not a commit in this repository/u);
  assert.doesNotMatch(unknown.output, /\n\s+at /u, 'no stack trace');
});

test('admit says its verdict on one line naming exactly the judged range', (t) => {
  const {root, base, landed} = landedSourceQuest(t);
  const say = (from, to) => spawnSync(process.execPath, [ADMISSION_CLI, 'admit', '--base', from,
    '--head', to], {cwd: root, encoding: 'utf8'});
  const admitted = say(base, landed);
  assert.equal(admitted.status, 0, admitted.stderr);
  assert.ok(admitted.stdout.split('\n').includes(
    `solver-landing admission: admitted ${base}..${landed}`), admitted.stdout);
  write(root, 'src/a.js', TEXT);
  const direct = commitAll(root, 'direct');
  const refused = say(base, direct);
  assert.equal(refused.status, 1);
  assert.ok(refused.stderr.split('\n').includes(
    `solver-landing admission: refused ${base}..${direct}`), refused.stderr);
  assert.doesNotMatch(`${refused.stdout}${refused.stderr}`, /admission: admitted/u);
});

test('land and admit read src/ paths git would quote (non-ASCII, quote characters)', (t) => {
  const root = repo(t);
  write(root, 'src/"q".js', 'tracked');
  write(root, 'src/gône.js', 'tracked');
  const base = commitAll(root, 'tracked files git quotes');
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, 'src/néw dîr/x y.js', TEXT);
  write(root, 'src/"q".js', TEXT);
  fs.unlinkSync(path.join(root, 'src/gône.js'));
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  const landed = land(root, {id: QUEST_ID, skipProof: true});
  assert.ok(landed.paths.includes('src/néw dîr/x y.js'), landed.paths.join(', '));
  assert.ok(landed.paths.includes('src/"q".js'), landed.paths.join(', '));
  assert.equal(git(root, ['show', '--format=', '--name-only', '-z', landed.commit]).split('\0')
    .includes('src/gône.js'), true, 'the deletion is landed');
  const run = admitRange(root, base);
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.result.admitted.map((entry) => entry.commit), [landed.commit]);
});

// --- attempt 4: the round-3 holes (src-via-land-review-3) ------------------------

// Commits with chosen dates, so which merge base `git merge-base` picks in a
// criss-cross is fixed by the test, not by the clock.
let datedClock = 1700000000;
const FUTURE_EPOCH_SECONDS = 4100000000;
function datedGit(root, args) {
  const stamp = `${datedClock++} +0000`;
  return execFileSync('git', [...GIT_USER, ...args], {cwd: root, encoding: 'utf8',
    env: {...process.env, GIT_AUTHOR_DATE: stamp, GIT_COMMITTER_DATE: stamp}});
}

function questRepo(t, ids) {
  const root = repo(t, {legacy: true});
  const epic = path.join(root, 'solve/epics/demo-epic.md');
  fs.writeFileSync(epic, fs.readFileSync(epic, 'utf8').replace(`  - ${QUEST_ID}\n`,
    ids.map((id) => `  - ${id}\n`).join('')));
  for (const id of ids) {
    const oracle = `solve/quests/${id}/evidence/oracle.json`;
    write(root, `solve/quests/${id}/quest.json`, JSON.stringify({schema: QUEST_SCHEMA, id,
      statement: STATEMENT, epic: EPIC_ID, doneWhen: {probe: PROBE.ORACLE, args: {file: oracle}}}));
    write(root, oracle, JSON.stringify({metric: 1, target: 0}));
  }
  write(root, 'src/a.js', 'a1\n');
  commitAll(root, 'quests');
  remoteFor(t, root);
  return root;
}

function landQuest(root, id, file, content) {
  start(root, {id});
  write(root, `solve/quests/${id}/evidence/oracle.json`, JSON.stringify({metric: 0, target: 0}));
  write(root, file, content);
  note(root, {id, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  note(root, {id, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  return land(root, {id, skipProof: true}).commit;
}

test('admit refuses a re-landing of a quest whose log an earlier commit in the push reopened', (t) => {
  const {root} = landedSourceQuest(t);
  const base = headOf(root);
  const logPath = path.join(root, `solve/quests/${QUEST_ID}/log.ndjson`);
  const kept = fs.readFileSync(logPath, 'utf8').split('\n')
    .filter((line) => line && JSON.parse(line).type !== 'terminal');
  fs.writeFileSync(logPath, `${kept.join('\n')}\n`);
  commitAll(root, 'tidy the log');
  write(root, 'src/a.js', TEXT);
  git(root, ['add', '-A']);
  fs.appendFileSync(logPath, `${JSON.stringify({ts: '2026-10-04T23:00:00.000Z',
    type: 'terminal', status: 'solved', text: 'x', source: stagedSourceChange(root)})}\n`);
  const reopened = commitAll(root, 'direct src riding a reopened quest');
  assertRefused(admitRange(root, base), reopened, /remote base/u);
  // An open quest on main whose approval went stale: an earlier commit drops
  // the newer attempt, so the old approval reads as current at the landing.
  const open = repo(t);
  start(open, {id: QUEST_ID});
  goGreen(open);
  note(open, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  note(open, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  note(open, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: 'a newer, unreviewed attempt'});
  const staleBase = commitAll(open, 'quest on main, approval stale');
  const openLog = path.join(open, `solve/quests/${QUEST_ID}/log.ndjson`);
  const lines = fs.readFileSync(openLog, 'utf8').split('\n').filter(Boolean);
  fs.writeFileSync(openLog, `${lines.slice(0, -1).join('\n')}\n`);
  commitAll(open, 'tidy the log');
  write(open, SRC_FILE, TEXT);
  git(open, ['add', '-A']);
  fs.appendFileSync(openLog, `${JSON.stringify({ts: '2026-10-04T23:00:00.000Z',
    type: 'terminal', status: 'solved', text: 'x', source: stagedSourceChange(open)})}\n`);
  const revived = commitAll(open, 'landing on a rewritten approval');
  assertRefused(admitRange(open, staleBase), revived, /remote base/u);
  // Every entry kept but reordered (the approval moved after the newer
  // attempt) is a rewrite too: main's order must survive.
  git(open, ['checkout', '-q', '-b', 'reordered', staleBase]);
  const [approval, newer] = lines.slice(-2);
  fs.writeFileSync(openLog, `${[...lines.slice(0, -2), newer, approval].join('\n')}\n`);
  commitAll(open, 'move the approval after the newer attempt');
  write(open, SRC_FILE, TEXT);
  git(open, ['add', '-A']);
  fs.appendFileSync(openLog, `${JSON.stringify({ts: '2026-10-04T23:00:00.000Z',
    type: 'terminal', status: 'solved', text: 'x', source: stagedSourceChange(open)})}\n`);
  const reordered = commitAll(open, 'landing on a reordered approval');
  assertRefused(admitRange(open, staleBase), reordered, /remote base/u);
});

// A long-lived branch that merged main resolves the quest log as an
// order-preserving union of both lineages (here the side's entries first); a
// landing on it keeps every entry main has, in order, without main's log being
// a byte prefix of it. Dropping one of main's entries is still a rewrite.
test('admit admits a landing over an order-preserving union of the quest log', (t) => {
  const root = repo(t);
  const mainBranch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  start(root, {id: QUEST_ID});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  const fork = commitAll(root, 'quest approved on main');
  const logPath = path.join(root, `solve/quests/${QUEST_ID}/log.ndjson`);
  const forkLog = fs.readFileSync(logPath, 'utf8');
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, kind: FINDING_KIND.EVIDENCE,
    text: 'a finding main records'});
  const base = commitAll(root, 'main records a finding');
  const mainLine = fs.readFileSync(logPath, 'utf8').slice(forkLog.length);
  git(root, ['checkout', '-q', '-b', 'side', fork]);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, kind: FINDING_KIND.EVIDENCE,
    text: 'a finding the side records'});
  commitAll(root, 'the side records a finding');
  const sideLog = fs.readFileSync(logPath, 'utf8');
  const merged = (log) => {
    git(root, ['merge', '-q', '--no-commit', '-s', 'ours', mainBranch]);
    fs.writeFileSync(logPath, log);
    return commitAll(root, 'side takes main (quest log: union)');
  };
  merged(`${sideLog}${mainLine}`);
  goGreen(root);
  write(root, SRC_FILE, TEXT);
  const landed = land(root, {id: QUEST_ID, skipProof: true}).commit;
  const run = admitRange(root, base, landed);
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.result.admitted.map((entry) => entry.commit), [landed]);
  // The same landing over a merge that drops main's finding is refused.
  git(root, ['checkout', '-q', '-b', 'dropping', `${landed}~2`]);
  merged(sideLog);
  goGreen(root);
  write(root, SRC_FILE, TEXT);
  const dropped = land(root, {id: QUEST_ID, skipProof: true}).commit;
  assertRefused(admitRange(root, base, dropped), dropped, /remote base/u);
});

test('admit refuses a criss-cross merge that takes a stale side over a later main landing', (t) => {
  const root = questRepo(t, ['q1', 'q2']);
  const seed = headOf(root);
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const first = landQuest(root, 'q1', 'src/a.js', 'a-v1\n');
  datedGit(root, ['checkout', '-q', '-b', 'side', seed]);
  write(root, DOC_FILE, TEXT);
  git(root, ['add', '-A']);
  // Dated after the landing: the date the committer chooses steers the base.
  datedClock = Math.max(datedClock, FUTURE_EPOCH_SECONDS);
  datedGit(root, ['commit', '-q', '-m', 'side docs']);
  const sideDocs = headOf(root);
  datedGit(root, ['checkout', '-q', branch]);
  datedGit(root, ['merge', '-q', '--no-ff', '-m', 'main takes side', 'side']);
  datedGit(root, ['checkout', '-q', 'side']);
  datedGit(root, ['merge', '-q', '--no-ff', '-m', 'side takes the landing', first]);
  datedGit(root, ['checkout', '-q', branch]);
  landQuest(root, 'q2', 'src/a.js', 'a-v2\n');
  const base = headOf(root);
  const bases = git(root, ['merge-base', '--all', base, 'side']).trim().split('\n');
  assert.equal(bases.length, 2, 'a criss-cross: two merge bases');
  assert.equal(git(root, ['merge-base', base, 'side']).trim(), sideDocs,
    'git picks the docs-only base, from which side changed src/a.js through a main commit');
  datedGit(root, ['merge', '-q', '--no-ff', '--no-commit', 'side']);
  datedGit(root, ['checkout', 'side', '--', 'src/a.js']);
  datedGit(root, ['commit', '-q', '-m', 'final merge drops the q2 landing']);
  assertRefused(admitRange(root, base), headOf(root), /exact-SHA[\s\S]*src\/a\.js/u);
});

test('admit refuses a merge that takes the side of a path both sides landed', (t) => {
  const root = questRepo(t, ['q1', 'q2']);
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  git(root, ['branch', 'side']);
  landQuest(root, 'q1', 'src/a.js', 'a-main\n');
  const base = headOf(root);
  git(root, ['checkout', '-q', 'side']);
  landQuest(root, 'q2', 'src/a.js', 'a-side\n');
  git(root, ['checkout', '-q', branch]);
  spawnSync('git', [...GIT_USER, 'merge', '-q', '--no-ff', '--no-commit', 'side'], {cwd: root});
  git(root, ['checkout', '--theirs', '--', 'src/a.js']);
  const theirs = commitAll(root, 'merge side, take theirs (drops the q1 landing)');
  assertRefused(admitRange(root, base), theirs, /exact-SHA[\s\S]*src\/a\.js/u);
});

// The differential oracle for the merge rule, from the independent verifier
// (src-via-land-review-4, prop4): random two-branch histories of landings,
// direct commits, docs, merges with random per-file resolutions (take ours,
// take theirs, keep the base) and fast-forwards of main onto the side, over
// src/ and vendor/ files, judged by admit and by this oracle:
// - a single-parent commit that changes the production surface must be a
//   landing;
// - a merge is clean on a path only if, for EVERY merge base B of its
//   parents, the textbook three-way result exists and equals the merge there
//   (p1 == B gives p2; p2 == B gives p1; p1 == p2 gives p1; anything else is
//   a conflict, which has no clean result);
// - anything else is the merge's own production change and needs a receipt
//   (the histories hold none, so it is refused).
// A second, net-effect oracle: whatever admit admits must leave every
// production path at the base's blob or at one a landing in the range wrote.
// Fixed seeds, bounded size.
const PROPERTY_FILES = Object.freeze(['src/a.js', 'src/b.js', 'vendor/c.js']);
const PROPERTY_HISTORIES = 30;
// Seeds the verifier ran (attempt 4b diverged on 124/200 and 134/200 of them).
const PROPERTY_SEEDS = Object.freeze([11, 4242]);
const LANDING_SUBJECT = 'land ';
const PROPERTY_OPS = 10;
const FAST_FORWARD_OP = 9;

function propertyRandom(seed) {
  let state = seed;
  return (bound) => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state % bound;
  };
}

function blobAt(root, rev, file) {
  const run = spawnSync('git', ['rev-parse', '-q', '--verify', `${rev}:${file}`],
    {cwd: root, encoding: 'utf8'});
  return run.status === 0 ? run.stdout.trim() : null;
}

// A landing as land writes it (sealed, approved, a terminal entry binding the
// exact surface change); content null deletes the file.
function syntheticLanding(root, id, change) {
  change();
  datedGit(root, ['add', '-A']);
  const source = stagedSourceChange(root);
  write(root, `solve/quests/${id}/quest.json`, '{}');
  write(root, `solve/quests/${id}/log.ndjson`, `${[
    {ts: '1', type: 'finding', kind: 'decision', text: 's', seal: {sealedAt: 'x'}},
    {ts: '2', type: 'attempt', text: 'a'},
    {ts: '3', type: 'verification', text: 'v', verifier: VERIFIER, verdict: 'approve'},
    {ts: '4', type: 'terminal', status: 'solved', text: 't', source},
  ].map((entry) => JSON.stringify(entry)).join('\n')}\n`);
  datedGit(root, ['add', '-A']);
  datedGit(root, ['commit', '-q', '-m', `${LANDING_SUBJECT}${id}`]);
  return headOf(root);
}

function propertyLanding(root, file, content, id) {
  return syntheticLanding(root, id, () => {
    if (content === null) fs.rmSync(path.join(root, file));
    else write(root, file, content);
  });
}

function rangeRows(root, base, head) {
  return datedGit(root, ['rev-list', '--parents', `${base}..${head}`]).trim()
    .split('\n').filter(Boolean).map((line) => line.split(' '));
}

function isLandingSubject(root, sha) {
  return datedGit(root, ['log', '-1', '--format=%s', sha]).startsWith(LANDING_SUBJECT);
}

function textbookThreeWay(ours, theirs, base) {
  if (ours === base) return theirs;
  if (theirs === base || ours === theirs) return ours;
  return 'CONFLICT';
}

function oracleMergeIsClean(root, sha, parents) {
  assert.equal(parents.length, 2, 'the generator makes two-parent merges only');
  const [ours, theirs] = parents;
  const bases = datedGit(root, ['merge-base', '--all', ours, theirs]).trim().split('\n')
    .filter(Boolean);
  return PROPERTY_FILES.every((file) => bases.every((base) =>
    textbookThreeWay(blobAt(root, ours, file), blobAt(root, theirs, file),
      blobAt(root, base, file)) === blobAt(root, sha, file)));
}

function independentOracle(root, base, head) {
  const refused = rangeRows(root, base, head).some(([sha, ...parents]) => (parents.length > 1 ?
    !oracleMergeIsClean(root, sha, parents) :
    Boolean(datedGit(root, ['diff-tree', '-r', '--name-only', parents[0], sha, '--', 'src',
      'vendor']).trim()) && !isLandingSubject(root, sha)));
  return refused ? 'refuse' : 'admit';
}

function netEffectOracle(root, base, head) {
  const written = new Map(PROPERTY_FILES.map((file) =>
    [file, new Set([blobAt(root, base, file)])]));
  for (const [sha, ...parents] of rangeRows(root, base, head)) {
    if (parents.length !== 1 || !isLandingSubject(root, sha)) continue;
    for (const file of PROPERTY_FILES) {
      const blob = blobAt(root, sha, file);
      if (blob !== blobAt(root, parents[0], file)) written.get(file).add(blob);
    }
  }
  return PROPERTY_FILES.every((file) => written.get(file).has(blobAt(root, head, file))) ?
    'admit' : 'refuse';
}

// Merge `other` into the checked-out branch, each file resolved at random:
// take ours, take theirs, keep the merge base, or keep git's result.
function randomMerge(root, other, random) {
  spawnSync('git', [...GIT_USER, 'merge', '-q', '--no-ff', '--no-commit', other], {cwd: root});
  for (const file of PROPERTY_FILES) {
    const pick = random(4);
    const from = ['HEAD', other][pick];
    if (from && blobAt(root, from, file)) datedGit(root, ['checkout', from, '--', file]);
    else if (pick === 2) {
      const mergeBase = datedGit(root, ['merge-base', 'HEAD', other]).trim();
      if (blobAt(root, mergeBase, file)) datedGit(root, ['checkout', mergeBase, '--', file]);
    }
  }
  datedGit(root, ['add', '-A']);
  datedGit(root, ['commit', '-q', '--allow-empty', '-m', 'merge']);
}

function fastForwardMainToSide(root) {
  datedGit(root, ['checkout', '-q', '-f', 'main']);
  spawnSync('git', ['merge', '-q', '--ff-only', 'side'], {cwd: root});
}

function randomStep(root, {iteration, step, random}) {
  const op = random(PROPERTY_OPS);
  const file = PROPERTY_FILES[random(PROPERTY_FILES.length)];
  if (op === FAST_FORWARD_OP && random(2) === 0) {
    fastForwardMainToSide(root);
    return;
  }
  const content = `v${iteration}-${step}\n`;
  const branch = op < 2 || op >= 8 ? 'main' : 'side';
  datedGit(root, ['checkout', '-q', '-f', branch]);
  if (op < 5) propertyLanding(root, file, content, `p${iteration}-${step}`);
  else if (op === 5 || op === 6) {
    write(root, op === 5 ? file : `docs/${step}.md`, content);
    datedGit(root, ['add', '-A']);
    datedGit(root, ['commit', '-q', '-m', op === 5 ? 'direct' : 'docs']);
  } else randomMerge(root, branch === 'main' ? 'side' : 'main', random);
}

function randomHistory(t, iteration, random) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-prop-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  datedGit(root, ['init', '-q', '-b', 'main']);
  for (const file of PROPERTY_FILES) write(root, file, 'v0\n');
  datedGit(root, ['add', '-A']);
  datedGit(root, ['commit', '-q', '-m', 'seed']);
  datedGit(root, ['branch', 'side']);
  let base = null;
  const steps = 8 + random(8);
  for (let step = 0; step < steps; step += 1) {
    if (step === 2) base = headOf(root, 'main');
    randomStep(root, {iteration, step, random});
  }
  datedGit(root, ['checkout', '-q', '-f', 'main']);
  return {root, base, head: headOf(root, 'main')};
}

test('admit agrees with the independent three-way oracle over every merge base on random histories', (t) => {
  const divergences = [];
  let judged = 0;
  for (const seed of PROPERTY_SEEDS) {
    const random = propertyRandom(seed);
    for (let iteration = 0; iteration < PROPERTY_HISTORIES; iteration += 1) {
      const {root, base, head} = randomHistory(t, iteration, random);
      if (!base || base === head) continue;
      judged += 1;
      const got = admitRange(root, base, head).status === 0 ? 'admit' : 'refuse';
      const want = independentOracle(root, base, head);
      if (got !== want) divergences.push(`seed ${seed} history ${iteration}: admit ${got}, oracle ${want}`);
      if (got === 'admit' && netEffectOracle(root, base, head) === 'refuse') {
        divergences.push(`seed ${seed} history ${iteration}: admitted an unlanded net effect`);
      }
    }
  }
  assert.ok(judged > PROPERTY_SEEDS.length * PROPERTY_HISTORIES / 2, `enough histories judged: ${judged}`);
  assert.deepEqual(divergences, []);
});

// --- the production surface is src/ and vendor/ (owner 2026-10-04) --------------
const VENDOR_FILE = 'vendor/raft-rs-wasm/pkg/x';

test('a vendor/ change lands only with a current approval and enters main only as a landing', (t) => {
  const root = repo(t, {legacy: true});
  remoteFor(t, root);
  const base = headOf(root);
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  write(root, VENDOR_FILE, 'direct');
  const direct = commitAll(root, 'vendor: a direct binding update');
  assertRefused(admitRange(root, base), direct, /not a landing[\s\S]*vendor\/raft-rs-wasm\/pkg\/x/u);
  git(root, ['reset', '-q', '--hard', base]);
  start(root, {id: QUEST_ID});
  goGreen(root);
  write(root, VENDOR_FILE, TEXT);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  refuses(() => land(root, {id: QUEST_ID, skipProof: true}), /need a verification entry/u);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  const landed = land(root, {id: QUEST_ID, skipProof: true}).commit;
  const run = admitRange(root, base);
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.result.admitted.map((entry) => entry.commit), [landed]);
  // A docs side branch forked before the landing; the merge drops the landed vendor/ file.
  git(root, ['checkout', '-q', '-b', 'side', base]);
  write(root, DOC_FILE, TEXT);
  commitAll(root, 'side docs');
  git(root, ['checkout', '-q', branch]);
  git(root, ['merge', '-q', '--no-ff', '--no-commit', 'side']);
  git(root, ['rm', '-q', VENDOR_FILE]);
  const dropped = commitAll(root, 'merge side (drops the landed vendor file)');
  assertRefused(admitRange(root, landed), dropped, /exact-SHA[\s\S]*vendor\/raft-rs-wasm\/pkg\/x/u);
});

// --- attempt 5: the symmetric merge rule (owner ruling 2026-10-05) ---------------
// A push to main fast-forwards to any descendant, so a merge's first parent is
// arbitrary: whichever side is first, a merge is clean on a production path only
// where it equals the textbook three-way result over every merge base.

const SHAPE_FILES = Object.freeze(['src/a.js', 'src/b.js', 'vendor/v/x.js']);

function shapeRepo(t, files = SHAPE_FILES) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'solve-v2-shape-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  datedGit(root, ['init', '-q', '-b', 'main']);
  for (const file of files) write(root, file, 'v0\n');
  write(root, DOC_FILE, 'd0\n');
  datedGit(root, ['add', '-A']);
  datedGit(root, ['commit', '-q', '-m', 'seed']);
  datedGit(root, ['branch', 'side']);
  remoteFor(t, root);
  return root;
}

function docsCommit(root, name) {
  write(root, `docs/${name}.md`, `${name}\n`);
  datedGit(root, ['add', '-A']);
  datedGit(root, ['commit', '-q', '-m', name]);
  return headOf(root);
}

function pathPattern(file) {
  return new RegExp(`exact-SHA[\\s\\S]*${file.replace(/[./]/gu, '\\$&')}`, 'u');
}

test('admit refuses a take-ours merge from a stale side fast-forwarded onto main (src/ and vendor/)', (t) => {
  for (const file of ['src/a.js', 'vendor/v/x.js']) {
    const root = shapeRepo(t);
    propertyLanding(root, file, 'v1\n', 'main-landing');
    const base = headOf(root);
    datedGit(root, ['checkout', '-q', 'side']);
    const sideDocs = docsCommit(root, 'side-docs');
    datedGit(root, ['merge', '-q', '-s', 'ours', '-m', 'side takes ours over main', 'main']);
    const merge = headOf(root);
    // A fast-forward onto a descendant: main moves to the side's later tip.
    const head = docsCommit(root, 'later-side-docs');
    assert.equal(headOf(root, `${merge}^1`), sideDocs, 'the side is the first parent');
    assert.equal(headOf(root, `${merge}^2`), base, 'main is the second parent');
    assertRefused(admitRange(root, base, head), merge, pathPattern(file));
  }
});

test('admit refuses an octopus take-ours merge that lists main last', (t) => {
  const root = shapeRepo(t);
  propertyLanding(root, 'src/a.js', 'v1\n', 'main-landing');
  const base = headOf(root);
  datedGit(root, ['checkout', '-q', '-b', 'third', 'side']);
  docsCommit(root, 'third-docs');
  datedGit(root, ['checkout', '-q', 'side']);
  docsCommit(root, 'side-docs');
  datedGit(root, ['merge', '-q', '-s', 'ours', '-m', 'octopus keeps the side', 'third', 'main']);
  const merge = headOf(root);
  assert.equal(git(root, ['rev-list', '--parents', '-n', '1', merge]).trim().split(' ').length, 4);
  assertRefused(admitRange(root, base, merge), merge, pathPattern('src/a.js'));
});

test('admit refuses a merge into the side that resurrects a file a main landing deleted', (t) => {
  const root = shapeRepo(t);
  propertyLanding(root, 'src/b.js', null, 'main-deletes');
  const base = headOf(root);
  datedGit(root, ['checkout', '-q', 'side']);
  docsCommit(root, 'side-docs');
  spawnSync('git', [...GIT_USER, 'merge', '-q', '--no-ff', '--no-commit', 'main'], {cwd: root});
  datedGit(root, ['checkout', 'HEAD', '--', 'src/b.js']);
  datedGit(root, ['add', '-A']);
  datedGit(root, ['commit', '-q', '-m', 'side merges main, keeping its stale src/b.js']);
  const merge = headOf(root);
  assertRefused(admitRange(root, base, merge), merge, pathPattern('src/b.js'));
});

// Owner-visible: a merge that drops a side's landing ("ours" over it) leaves
// main's bytes as they were, but a solved quest's code would silently never
// reach main, so it is the merge's own change and takes the receipt route
// (or the landing is reverted by a quest of its own).
test('admit refuses a take-ours merge on main that drops a side landing', (t) => {
  const root = shapeRepo(t);
  datedGit(root, ['checkout', '-q', 'side']);
  propertyLanding(root, 'src/a.js', 'side-v1\n', 'side-landing');
  datedGit(root, ['checkout', '-q', 'main']);
  const base = docsCommit(root, 'main-docs');
  datedGit(root, ['merge', '-q', '-s', 'ours', '-m', 'main drops the side landing', 'side']);
  const merge = headOf(root);
  assertRefused(admitRange(root, base, merge), merge, pathPattern('src/a.js'));
});

// The same tree merged with either parent first gets the same verdict.
function bothOrders(root, left, right, tree) {
  return [[left, right], [right, left]].map(([first, second]) => datedGit(root,
    ['commit-tree', tree, '-p', first, '-p', second, '-m', 'merge']).trim());
}

function treeTaking(root, from, picks) {
  datedGit(root, ['checkout', '-q', '-f', '--detach', from]);
  for (const [file, rev] of picks) datedGit(root, ['checkout', rev, '--', file]);
  datedGit(root, ['add', '-A']);
  return datedGit(root, ['write-tree']).trim();
}

test('admit gives a merge one verdict whichever parent is first', (t) => {
  const root = shapeRepo(t);
  const mainLanding = propertyLanding(root, 'src/a.js', 'main-v1\n', 'main-landing');
  datedGit(root, ['checkout', '-q', 'side']);
  const sideLanding = propertyLanding(root, 'src/b.js', 'side-v1\n', 'side-landing');
  docsCommit(root, 'side-docs');
  const side = headOf(root);
  const resolutions = [
    {name: 'clean: both landings', picks: [['src/b.js', side], ['docs/side-docs.md', side]],
      verdict: 0},
    {name: 'take main: drops the side landing', picks: [['docs/side-docs.md', side]],
      verdict: 1},
    {name: 'take side: drops the main landing', picks: [['src/a.js', side], ['src/b.js', side],
      ['docs/side-docs.md', side]], verdict: 1},
  ];
  for (const {name, picks, verdict} of resolutions) {
    const tree = treeTaking(root, mainLanding, picks);
    for (const merge of bothOrders(root, mainLanding, side, tree)) {
      const run = admitRange(root, mainLanding, merge);
      assert.equal(run.status, verdict, `${name}, first parent ${headOf(root, `${merge}^1`)}: ${run.output}`);
      if (verdict === 0) {
        assert.deepEqual(run.result.admitted.map((entry) => entry.commit), [sideLanding]);
      } else assertRefused(run, merge, /exact-SHA/u);
    }
  }
  // An identical change landed on both sides is a clean merge either way.
  const same = shapeRepo(t);
  const mainSame = propertyLanding(same, 'src/a.js', 'same\n', 'main-same');
  datedGit(same, ['checkout', '-q', 'side']);
  const sideSame = propertyLanding(same, 'src/a.js', 'same\n', 'side-same');
  const tree = treeTaking(same, mainSame, [['solve/quests/side-same', sideSame]]);
  for (const merge of bothOrders(same, mainSame, sideSame, tree)) {
    const run = admitRange(same, mainSame, merge);
    assert.equal(run.status, 0, run.output);
  }
});

test('admit refuses a merge of a rename landing with an edit landing (receipt route)', (t) => {
  const root = shapeRepo(t);
  propertyLanding(root, 'src/a.js', 'v0\nedited\n', 'main-edit');
  const base = headOf(root);
  datedGit(root, ['checkout', '-q', 'side']);
  syntheticLanding(root, 'side-rename', () => datedGit(root, ['mv', 'src/a.js', 'src/r.js']));
  datedGit(root, ['checkout', '-q', 'main']);
  datedGit(root, ['merge', '-q', '--no-ff', '-m', 'git merges the rename and the edit', 'side']);
  assert.equal(fs.readFileSync(path.join(root, 'src/r.js'), 'utf8'), 'v0\nedited\n');
  const merge = headOf(root);
  assertRefused(admitRange(root, base, merge), merge, pathPattern('src/r.js'));
});

// `merge-base --all` matters: two merge bases, and git's single pick (steered
// by commit dates) is the one where the first parent shows no change.
test('admit judges a merge over every merge base, not only the one git picks', (t) => {
  const root = shapeRepo(t, ['src/a.js']);
  datedGit(root, ['checkout', '-q', '-b', 'b2', 'side']);
  const b2 = propertyLanding(root, 'src/a.js', 'y\n', 'b2-landing');
  datedGit(root, ['checkout', '-q', 'main']);
  datedClock = Math.max(datedClock, FUTURE_EPOCH_SECONDS);
  const b1 = propertyLanding(root, 'src/a.js', 'x\n', 'b1-landing');
  // main resolves to x, the side resolves to y (each a two-sided conflict).
  spawnSync('git', [...GIT_USER, 'merge', '-q', '--no-ff', '--no-commit', b2], {cwd: root});
  datedGit(root, ['checkout', b1, '--', 'src/a.js']);
  datedGit(root, ['add', '-A']);
  datedGit(root, ['commit', '-q', '-m', 'main resolves x']);
  const base = headOf(root);
  datedGit(root, ['checkout', '-q', '-B', 'side', b2]);
  spawnSync('git', [...GIT_USER, 'merge', '-q', '--no-ff', '--no-commit', b1], {cwd: root});
  datedGit(root, ['checkout', b2, '--', 'src/a.js']);
  datedGit(root, ['add', '-A']);
  datedGit(root, ['commit', '-q', '-m', 'side resolves y']);
  const sideMerge = headOf(root);
  assert.deepEqual(git(root, ['merge-base', '--all', base, sideMerge]).trim().split('\n').sort(),
    [b1, b2].sort());
  assert.equal(git(root, ['merge-base', base, sideMerge]).trim(), b1,
    'git picks b1, where main (x) shows no change');
  datedGit(root, ['checkout', '-q', 'main']);
  spawnSync('git', [...GIT_USER, 'merge', '-q', '--no-ff', '--no-commit', 'side'], {cwd: root});
  datedGit(root, ['checkout', 'side', '--', 'src/a.js']);
  datedGit(root, ['add', '-A']);
  datedGit(root, ['commit', '-q', '-m', 'final merge takes y over main\'s x']);
  const merge = headOf(root);
  assertRefused(admitRange(root, base, merge), merge, pathPattern('src/a.js'));
});

// The surface directory itself is a production path: a root entry named
// `vendor` (a symlink here) where no vendor/ existed.
test('admit refuses a merge whose own change creates the surface directory entry itself', (t) => {
  const root = shapeRepo(t, ['src/a.js']);
  const base = docsCommit(root, 'main-docs');
  datedGit(root, ['checkout', '-q', 'side']);
  docsCommit(root, 'side-docs');
  datedGit(root, ['checkout', '-q', 'main']);
  spawnSync('git', [...GIT_USER, 'merge', '-q', '--no-ff', '--no-commit', 'side'], {cwd: root});
  fs.symlinkSync('src', path.join(root, 'vendor'));
  datedGit(root, ['add', '-A']);
  datedGit(root, ['commit', '-q', '-m', 'merge adds a vendor entry']);
  const merge = headOf(root);
  assertRefused(admitRange(root, base, merge), merge, /exact-SHA[\s\S]*paths \(1\): vendor$/mu);
});

// What a receipt-admitted merge brings is symmetric too: the integration
// branch merged main into itself (the branch is the first parent) and main
// fast-forwards onto it.
test('admit covers a long-lived branch\'s commits whichever parent the merge lists first', (t) => {
  const root = repo(t, {legacy: true});
  remoteFor(t, root);
  const base = headOf(root);
  start(root, {id: QUEST_ID});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  const mainBranch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  commitAll(root, 'the governing quest on main');
  git(root, ['checkout', '-q', '-b', 'integration', base]);
  write(root, SRC_FILE, TEXT);
  const branchCommit = commitAll(root, 'cutover step');
  git(root, ['merge', '-q', '--no-ff', '-m', `integration takes main\n\nQuest: ${QUEST_ID}`,
    mainBranch]);
  const merge = headOf(root);
  assert.equal(headOf(root, `${merge}^1`), branchCommit, 'the branch is the first parent');
  recordReceipt(root, PROOF.CORPUS_FULL, merge);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, kind: FINDING_KIND.DECISION,
    text: `owner authorizes merge of PR #73: merge sha ${merge}, head ${branchCommit}`});
  const head = commitAll(root, 'record the owner decision');
  const run = admitRange(root, base, head);
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.result.admitted.find((entry) => entry.commit === branchCommit),
    {commit: branchCommit, admission: 'brought by an admitted merge', coveredBy: merge});
});

// History every parent shares is not brought by the merge: a direct commit
// made before the fork stays refused even under an authorised receipt merge.
test('admit does not cover a direct commit that every merge parent already holds', (t) => {
  const root = repo(t, {legacy: true});
  remoteFor(t, root);
  const base = headOf(root);
  write(root, SRC_FILE, TEXT);
  const shared = commitAll(root, 'direct commit before the fork');
  start(root, {id: QUEST_ID});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.ATTEMPT, text: TEXT});
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.VERIFICATION, text: TEXT, verifier: VERIFIER,
    verdict: VERDICT.APPROVE});
  commitAll(root, 'the governing quest on main');
  const mainBranch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  git(root, ['checkout', '-q', '-b', 'integration']);
  write(root, 'src/other.js', TEXT);
  const branchCommit = commitAll(root, 'cutover step');
  git(root, ['checkout', '-q', mainBranch]);
  git(root, ['merge', '-q', '--no-ff', '-m', `merge the integration branch\n\nQuest: ${QUEST_ID}`,
    'integration']);
  const merge = headOf(root);
  recordReceipt(root, PROOF.CORPUS_FULL, merge);
  note(root, {id: QUEST_ID, type: ENTRY_TYPE.FINDING, kind: FINDING_KIND.DECISION,
    text: `owner authorizes merge of PR #73: merge sha ${merge}, head ${branchCommit}`});
  const run = admitRange(root, base, commitAll(root, 'record the owner decision'));
  assertRefused(run, shared, /not a landing/u);
  assert.equal(refusalBlocks(run).length, 1, `only the shared direct commit: ${run.output}`);
});

// Octopus: the merge bases of EVERY pair of parents count, so the verdict
// does not depend on which parent is first. Two parents share a landing Y and
// one of them reverts it by a landing; taking the other one's Y drops that
// revert, visible only over the base the two non-first parents share.
test('admit judges an octopus over the merge bases of every pair of its parents', (t) => {
  const root = shapeRepo(t, ['src/a.js']);
  datedGit(root, ['checkout', '-q', 'side']);
  propertyLanding(root, 'src/a.js', 'vY\n', 'shared-landing');
  datedGit(root, ['checkout', '-q', '-b', 'keeps']);
  const keeps = docsCommit(root, 'keeps-docs');
  datedGit(root, ['checkout', '-q', 'side']);
  const reverts = propertyLanding(root, 'src/a.js', 'v0\n', 'revert-landing');
  datedGit(root, ['checkout', '-q', 'main']);
  const base = docsCommit(root, 'main-docs');
  const tree = treeTaking(root, base, [['src/a.js', keeps], ['docs/keeps-docs.md', keeps]]);
  for (const parents of [[base, reverts, keeps], [keeps, base, reverts], [reverts, keeps, base]]) {
    const merge = datedGit(root, ['commit-tree', tree, ...parents.flatMap((parent) =>
      ['-p', parent]), '-m', 'octopus keeps Y over the revert']).trim();
    assertRefused(admitRange(root, base, merge), merge, pathPattern('src/a.js'));
  }
});

// Unrelated histories: a pair with no merge base is judged against the empty
// tree, so a clean merge of two landed roots is admitted.
test('admit admits a clean merge of an unrelated landed history over the empty tree', (t) => {
  const root = shapeRepo(t, ['src/a.js']);
  const base = propertyLanding(root, 'src/a.js', 'main-v1\n', 'main-landing');
  datedGit(root, ['checkout', '-q', '--orphan', 'unrelated']);
  datedGit(root, ['rm', '-q', '-r', '-f', '.']);
  docsCommit(root, 'unrelated-root');
  const root2 = propertyLanding(root, 'src/b.js', 'other\n', 'unrelated-landing');
  datedGit(root, ['checkout', '-q', 'main']);
  datedGit(root, ['merge', '-q', '--no-ff', '--allow-unrelated-histories', '-m',
    'merge an unrelated landed root', 'unrelated']);
  const run = admitRange(root, base);
  assert.equal(run.status, 0, run.output);
  assert.deepEqual(run.result.admitted.map((entry) => entry.commit), [root2]);
});
