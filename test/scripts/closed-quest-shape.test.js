/**
 * A closed quest holds its canonical record, its append-only log, and
 * exactly the proof artifacts its sealed terminal claim requires. These
 * scenarios drive the guard over fixture repositories: what the claim needs
 * survives closure, what it does not need is refused, and a required
 * artifact can be neither deleted nor rewritten afterwards. The requirement
 * is always derived structurally from the sealed doneWhen, so naming a file
 * in prose grants it nothing.
 */

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  OFFENCE, closedQuestShapeOffences,
} from '../../scripts/checks/check-closed-quest-shape.js';

const ENCODING = 'utf8';
const GIT_USER = Object.freeze(['-c', 'user.name=t', '-c', 'user.email=t@example.com']);
const WORKING_TREE = 'working tree';
const SCRIPT_PROBE = Object.freeze({probe: 'script',
  args: {command: 'node scripts/checks/x.js'}});

function git(root, args) {
  return execFileSync('git', [...GIT_USER, ...args], {cwd: root, encoding: ENCODING});
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

function closedQuest(root, id, doneWhen, statement = 'A sealed result.') {
  write(root, `solve/quests/${id}/quest.json`,
    {schema: 'solve-quest/2', id, statement, epic: 'demo-epic', doneWhen});
  write(root, `solve/quests/${id}/log.ndjson`,
    `${JSON.stringify({ts: '2026-09-06T00:00:00.000Z', type: 'terminal',
      status: 'solved', text: 'landed'})}\n`);
}

function repo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'closed-quest-shape-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'lagrange-test']);
  git(root, ['config', 'user.email', 'lagrange-test@example.com']);
  return root;
}

function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

test('an ordinary closed quest holds only its record and log', (t) => {
  const root = repo(t);
  closedQuest(root, 'plain-quest', SCRIPT_PROBE);
  commit(root, 'close a quest whose claim needs no artifact');
  assert.deepEqual(closedQuestShapeOffences({root}), []);
});

test('a sealed receipt survives closure', (t) => {
  const root = repo(t);
  const receipt = 'solve/quests/receipt-quest/evidence/receipt.json';
  closedQuest(root, 'receipt-quest', {probe: 'test-receipt',
    args: {file: receipt, requiredReceipts: ['r1']}});
  write(root, receipt, {schema: 'test-receipt/1', status: 'pass',
    receipts: [{id: 'r1', passed: true}]});
  commit(root, 'close a quest whose claim cites a receipt');
  assert.deepEqual(closedQuestShapeOffences({root}), [],
    'the artifact the terminal claim rests on is legitimate');
});

test('a sealed oracle survives closure', (t) => {
  const root = repo(t);
  const oracle = 'solve/quests/oracle-quest/evidence/oracle.json';
  closedQuest(root, 'oracle-quest', {probe: 'oracle', args: {file: oracle}});
  write(root, oracle, {metric: 0, target: 0});
  commit(root, 'close a quest whose claim cites an oracle');
  assert.deepEqual(closedQuestShapeOffences({root}), []);
});

test('an unrelated file in a closed quest is rejected', (t) => {
  const root = repo(t);
  closedQuest(root, 'plain-quest', SCRIPT_PROBE);
  write(root, 'solve/quests/plain-quest/evidence/notes.md', '# scratch\n');
  commit(root, 'close a quest carrying an incidental file');
  assert.deepEqual(closedQuestShapeOffences({root}), [{quest: 'plain-quest',
    path: 'solve/quests/plain-quest/evidence/notes.md',
    reason: OFFENCE.UNREQUIRED, at: WORKING_TREE}]);
});

test('an unreferenced proof-shaped file is rejected', (t) => {
  const root = repo(t);
  // Looks exactly like legitimate proof, but no sealed claim requires it.
  closedQuest(root, 'plain-quest', SCRIPT_PROBE);
  write(root, 'solve/quests/plain-quest/evidence/receipt.json',
    {schema: 'test-receipt/1', status: 'pass', receipts: []});
  commit(root, 'close a quest carrying an unreferenced receipt');
  assert.deepEqual(closedQuestShapeOffences({root}).map((o) => o.reason),
    [OFFENCE.UNREQUIRED]);
});

test('deleting a required artifact invalidates closure', (t) => {
  const root = repo(t);
  const oracle = 'solve/quests/oracle-quest/evidence/oracle.json';
  closedQuest(root, 'oracle-quest', {probe: 'oracle', args: {file: oracle}});
  write(root, oracle, {metric: 0, target: 0});
  commit(root, 'close a quest whose claim cites an oracle');
  fs.rmSync(path.join(root, oracle));
  assert.deepEqual(closedQuestShapeOffences({root}), [{quest: 'oracle-quest',
    path: oracle, reason: OFFENCE.MISSING, at: WORKING_TREE}],
  'tidying away the proof breaks the claim it supports');
});

test('modifying a required artifact after closure invalidates closure', (t) => {
  const root = repo(t);
  const receipt = 'solve/quests/receipt-quest/evidence/receipt.json';
  closedQuest(root, 'receipt-quest', {probe: 'test-receipt',
    args: {file: receipt, requiredReceipts: ['r1']}});
  write(root, receipt, {schema: 'test-receipt/1', status: 'pass',
    receipts: [{id: 'r1', passed: true}]});
  commit(root, 'close a quest whose claim cites a receipt');
  // Rewrite the evidence the terminal claim rests on, and commit it, so the
  // working tree matches HEAD and only the transition can see it.
  write(root, receipt, {schema: 'test-receipt/1', status: 'pass',
    receipts: [{id: 'r1', passed: true, detail: 'rewritten after closure'}]});
  const mutated = commit(root, 'rewrite retained proof');
  assert.deepEqual(closedQuestShapeOffences({root}), [{quest: 'receipt-quest',
    path: receipt, reason: OFFENCE.MUTATED, at: mutated}],
  'deletion being illegal must not leave mutation free');
});

test('prose naming an artifact cannot legalize it', (t) => {
  const root = repo(t);
  const smuggled = 'solve/quests/plain-quest/evidence/extra.json';
  // The filename appears in the sealed statement and in a log entry. The
  // requirement is derived from doneWhen by the probe owner, so neither
  // mention grants the file anything.
  closedQuest(root, 'plain-quest', SCRIPT_PROBE,
    `This quest retains ${smuggled} as its evidence.`);
  fs.appendFileSync(path.join(root, 'solve/quests/plain-quest/log.ndjson'),
    `${JSON.stringify({ts: '2026-09-06T00:00:01.000Z', type: 'finding',
      kind: 'evidence', text: `see ${smuggled}`})}\n`);
  write(root, smuggled, {anything: true});
  commit(root, 'close a quest that names a file in prose');
  assert.deepEqual(closedQuestShapeOffences({root}), [{quest: 'plain-quest',
    path: smuggled, reason: OFFENCE.UNREQUIRED, at: WORKING_TREE}]);
});

test('the repository itself is clean under the general rule', () => {
  // The two landed quests that motivated the amendment keep an oracle and a
  // receipt. No identifier appears in the implementation: they are legitimate
  // because their own sealed claims require those files.
  assert.deepEqual(closedQuestShapeOffences(), []);
});
