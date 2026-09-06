// The four v2 commands over a scratch git repository: start refuses a green
// probe and records the seal-time value; note needs a seal for attempts;
// land honors the last verdict, requires verification for src/, enforces the
// altitude budget and the epic scope, then commits and records solved.

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  ENTRY_TYPE, FINDING_KIND, NEXT_OWNER, PROBE, QUEST_SCHEMA, QUEST_STATUS, VERDICT,
} from '../../scripts/solve/schema.js';
import {readLog, readQuest} from '../../scripts/solve/store.js';
import {
  ALTITUDE_BUDGET, SolveError, board, land, note, probe, start,
} from '../../scripts/solve/commands.js';

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
