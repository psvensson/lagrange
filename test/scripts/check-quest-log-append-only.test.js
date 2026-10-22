/**
 * A quest log is the one file the live-surface guards exempt as immutable
 * history, so that immutability must be enforced rather than assumed. These
 * scenarios drive the checker over a fixture repository: an in-place rewrite
 * of a committed log is refused, a deleted one is refused, and the ordinary
 * solver lifecycle (appending, adding a new quest) is admitted. A merge is
 * held to the per-lineage rule: each parent an order-preserving subsequence.
 */

import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  OFFENCE, questLogOffences,
} from '../../scripts/checks/check-quest-log-append-only.js';

const QUEST_ID = 'demo-quest';
const LOG = `solve/quests/${QUEST_ID}/log.ndjson`;
const RECORD = `solve/quests/${QUEST_ID}/quest.json`;
const GIT_USER = Object.freeze(['-c', 'user.name=t', '-c', 'user.email=t@example.com']);
const ENCODING = 'utf8';
const WORKING_TREE = 'working tree';

function git(root, args, options = {}) {
  try {
    return execFileSync('git', [...GIT_USER, ...args], {cwd: root, encoding: ENCODING});
  } catch (error) {
    if (options.allowFailure) return '';
    throw error;
  }
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

function entry(text, extra = {}) {
  return `${JSON.stringify({ts: '2026-09-06T00:00:00.000Z', text, ...extra})}\n`;
}

function commit(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

function repo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quest-log-append-only-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init', '-q']);
  // The code under test commits through this repository, and a machine
  // without a global git identity (any CI runner) would otherwise refuse.
  git(root, ['config', 'user.name', 'lagrange-test']);
  git(root, ['config', 'user.email', 'lagrange-test@example.com']);
  write(root, RECORD, JSON.stringify({id: QUEST_ID}));
  write(root, LOG, entry('sealed', {type: 'finding'}) +
    entry('verified', {type: 'verification', verdict: 'approve'}));
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'record the quest']);
  return root;
}

test('a rewritten committed log is refused', (t) => {
  const root = repo(t);
  assert.deepEqual(questLogOffences({root}), []);
  // Flip a recorded verdict without changing the file's length: the offence
  // is the rewrite itself, not a size change.
  const committed = fs.readFileSync(path.join(root, LOG), ENCODING);
  const forged = committed.replace('"approve"', '"reject" ');
  assert.equal(forged.length, committed.length, 'same length, different history');
  fs.writeFileSync(path.join(root, LOG), forged);
  assert.deepEqual(questLogOffences({root}),
    [{path: LOG, reason: OFFENCE.REWRITTEN, at: WORKING_TREE}]);

  // Truncation is refused for the same reason.
  fs.writeFileSync(path.join(root, LOG), committed.slice(0, committed.length - 5));
  assert.deepEqual(questLogOffences({root}),
    [{path: LOG, reason: OFFENCE.TRUNCATED, at: WORKING_TREE}]);
});

test('a deleted committed log is refused', (t) => {
  const root = repo(t);
  fs.rmSync(path.join(root, LOG));
  assert.deepEqual(questLogOffences({root}),
    [{path: LOG, reason: OFFENCE.DELETED, at: WORKING_TREE}]);
});

test('appending and adding a log are admitted', (t) => {
  const root = repo(t);
  fs.appendFileSync(path.join(root, LOG), entry('later', {type: 'attempt'}));
  assert.deepEqual(questLogOffences({root}), [],
    'the ordinary lifecycle only appends');
  write(root, 'solve/quests/second-quest/log.ndjson', entry('new', {type: 'finding'}));
  assert.deepEqual(questLogOffences({root}), [],
    'a log with no committed history is unconstrained');
  // The authored record carries no append-only claim; only the log does.
  write(root, RECORD, JSON.stringify({id: QUEST_ID, statement: 'amended'}));
  assert.deepEqual(questLogOffences({root}), []);
});

test('a rewrite committed after creation is refused', (t) => {
  const root = repo(t);
  // The publication base predates the log, so from the base's perspective the
  // whole file is new. The invariant still has to hold across the commit that
  // introduced it and the one that altered it.
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  write(root, 'solve/quests/later-quest/log.ndjson',
    entry('sealed', {type: 'finding'}) +
    entry('verified', {type: 'verification', verdict: 'approve'}));
  const created = commit(root, 'introduce a quest log after the base');
  const later = 'solve/quests/later-quest/log.ndjson';
  const committed = fs.readFileSync(path.join(root, later), ENCODING);
  fs.writeFileSync(path.join(root, later),
    committed.replace('"approve"', '"reject" '));
  const rewritten = commit(root, 'rewrite a recorded verdict');
  assert.notEqual(created, rewritten);

  // Working tree matches HEAD, so a snapshot comparison would see nothing.
  assert.deepEqual(questLogOffences({root, base: rewritten}), [],
    'a check that only looked at the newest commit would pass this');
  // The transition is what carries the invariant.
  assert.deepEqual(questLogOffences({root, base}),
    [{path: later, reason: OFFENCE.REWRITTEN, at: rewritten}]);
  assert.deepEqual(questLogOffences({root}),
    [{path: later, reason: OFFENCE.REWRITTEN, at: rewritten}],
    'and without an explicit base the whole reachable history is admitted');
});

test('history is compared by bytes, not characters', (t) => {
  // The batch stream is read at byte offsets. A log holding any non-ASCII
  // byte puts a character offset out of step with it, which would silently
  // mis-slice every later blob and report clean logs as truncated.
  const root = repo(t);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  const wide = 'solve/quests/unicode-quest/log.ndjson';
  write(root, wide, entry('sealed with a wide dash \u2014 and an emoji \u{1f9ea}',
    {type: 'finding'}));
  write(root, 'solve/quests/zz-after-unicode/log.ndjson', entry('after', {type: 'finding'}));
  commit(root, 'introduce logs with multi-byte content');
  fs.appendFileSync(path.join(root, wide), entry('appended', {type: 'attempt'}));
  commit(root, 'append to the multi-byte log');
  assert.deepEqual(questLogOffences({root, base}), [],
    'appending after multi-byte content is still an append');
});

test('a merge that drops one side of a log is refused', (t) => {
  // The publisher requires a fast-forward but does not forbid merges inside
  // the range, so every parent has to be checked. Two branches appending to
  // the same log diverge, and no merge can preserve both prefixes.
  const root = repo(t);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  git(root, ['checkout', '-q', '-b', 'side']);
  fs.appendFileSync(path.join(root, LOG), entry('side entry', {type: 'attempt'}));
  const side = commit(root, 'append on the side branch');
  git(root, ['checkout', '-q', '-']);
  fs.appendFileSync(path.join(root, LOG), entry('main entry', {type: 'attempt'}));
  commit(root, 'append on the main branch');
  // Resolve by taking only this side: the other branch's committed entry is
  // dropped, which is history loss however the merge was performed.
  git(root, ['merge', '--no-commit', '--no-ff', side], {allowFailure: true});
  git(root, ['checkout', '--ours', LOG], {allowFailure: true});
  const merged = commit(root, 'merge, keeping only one side of the log');
  assert.deepEqual(questLogOffences({root, base}),
    [{path: LOG, reason: OFFENCE.REWRITTEN, at: merged}],
    'the dropped parent is still a parent');
});

test('a renamed log is refused as a deletion', (t) => {
  const root = repo(t);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  git(root, ['mv', LOG, 'solve/quests/moved-quest-log.ndjson']);
  const moved = commit(root, 'relocate a committed log');
  assert.deepEqual(questLogOffences({root, base}),
    [{path: LOG, reason: OFFENCE.DELETED, at: moved}],
    'relocating committed history is losing it');
});

test('a stack of append commits is admitted', (t) => {
  const root = repo(t);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  fs.appendFileSync(path.join(root, LOG), entry('one', {type: 'attempt'}));
  commit(root, 'append an attempt');
  fs.appendFileSync(path.join(root, LOG), entry('two', {type: 'verification'}));
  commit(root, 'append a verification');
  write(root, 'solve/quests/second-quest/log.ndjson', entry('new', {type: 'finding'}));
  commit(root, 'introduce another quest');
  assert.deepEqual(questLogOffences({root, base}), [],
    'the ordinary unpublished stack is several append commits');
});

// Merge commits (2026-10-05 rule): two branches that both append to one log
// diverge, and no merge can keep both parents as a byte prefix. A merge is
// append-only with respect to each lineage when every parent's log survives
// in the merge's log as an order-preserving subsequence of byte-identical
// entries, and anything no parent recorded comes only after all of them.
function divergedRepo(t, parents = ['side']) {
  const root = repo(t);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  const tips = {};
  for (const name of parents) {
    git(root, ['checkout', '-q', '-b', name, base]);
    fs.appendFileSync(path.join(root, LOG), entry(`${name} one`, {type: 'attempt'}) +
      entry(`${name} two`, {type: 'finding'}));
    tips[name] = commit(root, `append on ${name}`);
  }
  git(root, ['checkout', '-q', '-B', 'trunk', base]);
  fs.appendFileSync(path.join(root, LOG), entry('trunk one', {type: 'attempt'}) +
    entry('trunk two', {type: 'finding'}));
  commit(root, 'append on trunk');
  const blobOf = (rev) => git(root, ['show', `${rev}:${LOG}`]);
  const baseLog = blobOf(base);
  const tailOf = (rev) => blobOf(rev).slice(baseLog.length);
  return {root, base, tips, baseLog, trunkTail: tailOf('HEAD'), tailOf};
}

function mergeWith(root, tips, content) {
  git(root, ['merge', '--no-commit', '--no-ff', ...tips], {allowFailure: true});
  write(root, LOG, content);
  return commit(root, 'merge the appended logs');
}

test('a merge that unions both appended tails is admitted', (t) => {
  const {root, base, tips, baseLog, trunkTail, tailOf} = divergedRepo(t);
  mergeWith(root, [tips.side], baseLog + trunkTail + tailOf(tips.side));
  assert.deepEqual(questLogOffences({root, base}), [],
    'each lineage is kept whole and in order');
});

test('a merge that interleaves both lineages in order is admitted', (t) => {
  const {root, base, tips, baseLog, trunkTail, tailOf} = divergedRepo(t);
  const [trunkOne, trunkTwo] = trunkTail.split(/(?<=\n)/u);
  const [sideOne, sideTwo] = tailOf(tips.side).split(/(?<=\n)/u);
  mergeWith(root, [tips.side], baseLog + sideOne + trunkOne + sideTwo + trunkTwo);
  assert.deepEqual(questLogOffences({root, base}), []);
});

test('a merge that drops an entry of either parent is refused', (t) => {
  const {root, base, tips, baseLog, trunkTail, tailOf} = divergedRepo(t);
  const [sideOne] = tailOf(tips.side).split(/(?<=\n)/u);
  const merged = mergeWith(root, [tips.side], baseLog + trunkTail + sideOne);
  assert.deepEqual(questLogOffences({root, base}),
    [{path: LOG, reason: OFFENCE.REWRITTEN, at: merged}]);
});

test('a merge that drops a shared base entry is refused for both parents', (t) => {
  const {root, base, tips, baseLog, trunkTail, tailOf} = divergedRepo(t);
  const [, baseTwo] = baseLog.split(/(?<=\n)/u);
  const merged = mergeWith(root, [tips.side], baseTwo + trunkTail + tailOf(tips.side));
  assert.equal(questLogOffences({root, base}).filter((offence) =>
    offence.at === merged && offence.reason === OFFENCE.REWRITTEN).length, 2);
});

test('a merge that edits an entry is refused', (t) => {
  const {root, base, tips, baseLog, trunkTail, tailOf} = divergedRepo(t);
  const merged = mergeWith(root, [tips.side],
    baseLog + trunkTail + tailOf(tips.side).replace('side two', 'side 2!!'));
  assert.deepEqual(questLogOffences({root, base}),
    [{path: LOG, reason: OFFENCE.REWRITTEN, at: merged}]);
});

test('a merge that reorders the entries of one lineage is refused', (t) => {
  const {root, base, tips, baseLog, trunkTail, tailOf} = divergedRepo(t);
  const [sideOne, sideTwo] = tailOf(tips.side).split(/(?<=\n)/u);
  const merged = mergeWith(root, [tips.side], baseLog + trunkTail + sideTwo + sideOne);
  assert.deepEqual(questLogOffences({root, base}),
    [{path: LOG, reason: OFFENCE.REWRITTEN, at: merged}]);
});

test('a merge that slips an entry no parent recorded into history is refused',
  (t) => {
    const {root, base, tips, baseLog, trunkTail, tailOf} = divergedRepo(t);
    const merged = mergeWith(root, [tips.side], baseLog +
      entry('forged', {type: 'verification', verdict: 'approve'}) +
      trunkTail + tailOf(tips.side));
    assert.deepEqual(questLogOffences({root, base}),
      [{path: LOG, reason: OFFENCE.INSERTED, at: merged}]);
  });

test('a merge may append its own entry after every lineage', (t) => {
  const {root, base, tips, baseLog, trunkTail, tailOf} = divergedRepo(t);
  mergeWith(root, [tips.side], baseLog + trunkTail + tailOf(tips.side) +
    entry('merged', {type: 'finding'}));
  assert.deepEqual(questLogOffences({root, base}), []);
});

// git refuses a conflicting octopus, so the commit is built from its tree.
function octopusWith(root, parents, content) {
  write(root, LOG, content);
  git(root, ['add', '-A']);
  const tree = git(root, ['write-tree']).trim();
  const parentArgs = parents.flatMap((parent) => ['-p', parent]);
  const merged = git(root, ['commit-tree', tree, ...parentArgs,
    '-m', 'octopus merge of the appended logs']).trim();
  git(root, ['reset', '-q', '--hard', merged]);
  return merged;
}

test('an octopus merge is held to the same rule for every parent', (t) => {
  const {root, base, tips, baseLog, trunkTail, tailOf} =
    divergedRepo(t, ['left', 'right']);
  const trunk = git(root, ['rev-parse', 'HEAD']).trim();
  const kept = octopusWith(root, [trunk, tips.left, tips.right],
    baseLog + trunkTail + tailOf(tips.left) + tailOf(tips.right));
  assert.equal(git(root, ['rev-list', '--parents', '-n1', kept]).trim()
    .split(' ').length, 4, 'a three-parent commit');
  assert.deepEqual(questLogOffences({root, base}), [], 'all three kept');
  git(root, ['reset', '-q', '--hard', trunk]);
  const dropped = octopusWith(root, [trunk, tips.left, tips.right],
    baseLog + trunkTail + tailOf(tips.left));
  assert.deepEqual(questLogOffences({root, base}),
    [{path: LOG, reason: OFFENCE.REWRITTEN, at: dropped}],
    'the dropped third parent is refused');
});

test('a single-parent commit is still held to a byte prefix', (t) => {
  // Interleaving is a merge's allowance only: one parent has one lineage,
  // and an entry inserted before its tail is a rewrite.
  const root = repo(t);
  const base = git(root, ['rev-parse', 'HEAD']).trim();
  const committed = fs.readFileSync(path.join(root, LOG), ENCODING);
  const [first, second] = committed.split(/(?<=\n)/u);
  write(root, LOG, first + entry('inserted', {type: 'attempt'}) + second);
  const inserted = commit(root, 'insert inside history');
  assert.deepEqual(questLogOffences({root, base}),
    [{path: LOG, reason: OFFENCE.REWRITTEN, at: inserted}]);
});
