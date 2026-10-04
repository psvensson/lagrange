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
    /src\/ changes need a verification/u);
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
  assertRefused(run, unbound, /binds no src\/ change/u);
  assertRefused(run, replayed, /binds a different src\/ change/u);
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
  // Both: the merge and every commit only it brings are admitted.
  recordReceipt(unproven.root, PROOF.RELEASE_FULL, unproven.merge);
  const admitted = admitRange(unproven.root, unproven.base);
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
