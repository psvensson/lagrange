import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import {
  claimQuest,
  listSessions,
  questLeaseHolder,
  registerSession,
  releaseSession,
  scopeOverlaps,
  sessionIsLive,
  sessionsDir,
  QUEST_LEASE_CONFLICT_CODE,
} from '../../scripts/solve/session-registry.js';

// One real repo with a second linked worktree: the registry's whole premise
// is that both resolve the same git common dir.
function makeRepoWithWorktree(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'session-registry-'));
  const git = (args, cwd = repo) => execFileSync('git', args,
    {cwd, encoding: 'utf8', env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t',
    }}).trim();
  git(['init', '-q']);
  fs.writeFileSync(path.join(repo, 'seed.txt'), 'seed\n');
  git(['add', 'seed.txt']);
  git(['commit', '-q', '-m', 'seed']);
  const worktree = path.join(repo, '.wt-agent');
  git(['worktree', 'add', '-q', '--detach', worktree]);
  t.teardown(() => fs.rmSync(repo, {recursive: true, force: true}));
  return {repo, worktree};
}

tap.test('session registry and quest leases', async (t) => {
  t.test('both worktrees share one registry', (t) => {
    const {repo, worktree} = makeRepoWithWorktree(t);
    t.equal(sessionsDir(repo), sessionsDir(worktree),
      'the registry resolves to the shared git common dir');
    registerSession(repo, {questId: 'quest-a'});
    registerSession(worktree, {questId: 'quest-b'});
    const sessions = listSessions(repo);
    t.equal(sessions.length, 2, 'each worktree registers once');
    t.same(sessions.map((s) => s.questId).sort(), ['quest-a', 'quest-b']);
    t.end();
  });

  t.test('a live lease refuses a second claimant, fail-closed', (t) => {
    const {repo, worktree} = makeRepoWithWorktree(t);
    claimQuest(repo, 'quest-x');
    t.ok(questLeaseHolder(worktree, 'quest-x'),
      'the other worktree sees the holder');
    try {
      claimQuest(worktree, 'quest-x');
      t.fail('the second claimant must be refused');
    } catch (error) {
      t.equal(error.code, QUEST_LEASE_CONFLICT_CODE,
        'the refusal carries the machine-readable code callers key on');
      t.match(error.message, /claimed by the live session/,
        'and names the holder for the human');
    }
    t.doesNotThrow(() => claimQuest(worktree, 'quest-y'),
      'a different quest claims freely');
    // Re-claiming your own lease is a heartbeat, not a conflict.
    t.doesNotThrow(() => claimQuest(repo, 'quest-x'),
      'the holder can refresh its own claim');
    t.end();
  });

  t.test('a simultaneous claim resolves to exactly one winner', (t) => {
    const {repo, worktree} = makeRepoWithWorktree(t);
    // Simulate the race: both sessions have already WRITTEN their claim
    // (write-then-verify), neither having seen the other. Arbitration is
    // earliest claimedAt, so the first writer is the deterministic winner.
    registerSession(repo, {questId: 'quest-raced'});
    registerSession(worktree, {questId: 'quest-raced'});
    try {
      claimQuest(worktree, 'quest-raced');
      t.fail('the later claimant must back off');
    } catch (error) {
      t.equal(error.code, QUEST_LEASE_CONFLICT_CODE,
        'the loser backs off with the conflict code');
    }
    t.doesNotThrow(() => claimQuest(repo, 'quest-raced'),
      'the earlier claimant keeps the lease');
    t.equal(listSessions(repo)
      .filter((s) => s.questId === 'quest-raced').length, 1,
    'exactly one live session holds the quest after the race');
    t.end();
  });

  t.test('switching quests does not bleed the previous scope', (t) => {
    const {repo} = makeRepoWithWorktree(t);
    claimQuest(repo, 'quest-a', {scopePaths: ['src/a.js']});
    const {session} = claimQuest(repo, 'quest-b');
    t.same(session.scopePaths, [],
      'a new quest starts with no inherited scope');
    claimQuest(repo, 'quest-b', {scopePaths: ['src/b.js']});
    const refreshed = claimQuest(repo, 'quest-b');
    t.same(refreshed.session.scopePaths, ['src/b.js'],
      'a scopeless re-claim of the SAME quest preserves declared scope');
    t.end();
  });

  t.test('the bypass environment flag is an explicit escape', (t) => {
    const {repo, worktree} = makeRepoWithWorktree(t);
    claimQuest(repo, 'quest-x');
    process.env.LAGRANGE_SESSION_LEASE_BYPASS = '1';
    t.teardown(() => delete process.env.LAGRANGE_SESSION_LEASE_BYPASS);
    t.doesNotThrow(() => claimQuest(worktree, 'quest-x'),
      'the bypass claims over a live lease');
    t.end();
  });

  t.test('release clears the lease; quest-only keeps the session', (t) => {
    const {repo, worktree} = makeRepoWithWorktree(t);
    claimQuest(repo, 'quest-x');
    releaseSession(repo, {questOnly: true});
    t.equal(questLeaseHolder(worktree, 'quest-x'), null,
      'quest-only release frees the lease');
    t.equal(listSessions(repo).length, 1, 'the session itself survives');
    releaseSession(repo);
    t.equal(listSessions(repo).length, 0, 'full release removes the session');
    t.end();
  });

  t.test('stale sessions are GC-d on read', (t) => {
    const {repo, worktree} = makeRepoWithWorktree(t);
    registerSession(worktree, {questId: 'quest-gone'});
    execFileSync('git', ['worktree', 'remove', '--force', worktree],
      {cwd: repo});
    t.equal(listSessions(repo).length, 0,
      'a session whose worktree vanished is pruned');
    t.equal(questLeaseHolder(repo, 'quest-gone'), null,
      'its lease dies with it');

    const session = registerSession(repo, {questId: 'quest-old'});
    t.equal(sessionIsLive(session), true, 'fresh heartbeat is live');
    t.equal(sessionIsLive(session,
      {now: Date.now() + 25 * 60 * 60 * 1000}), false,
    'a heartbeat older than the TTL is stale');
    t.end();
  });

  t.test('declared-scope overlap is surfaced, not blocked', (t) => {
    const {repo, worktree} = makeRepoWithWorktree(t);
    claimQuest(repo, 'quest-a',
      {scopePaths: ['src/owner/a.js', 'src/shared/util.js']});
    const {overlaps} = claimQuest(worktree, 'quest-b',
      {scopePaths: ['src/shared/util.js', 'test/b.test.js']});
    t.equal(overlaps.length, 1, 'one overlapping peer');
    t.same(overlaps[0].paths, ['src/shared/util.js'],
      'exactly the shared path is named');
    t.same(scopeOverlaps(repo, ['test/b.test.js'])[0].paths,
      ['test/b.test.js'], 'the check works from either side');
    t.end();
  });
});
