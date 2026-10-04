import tap from 'tap';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  POST_MERGE_REFUSAL,
  proveMergedHead,
  publishExactHead,
  parsePublishArgs,
  retainGateDiagnostics,
  runLocalCorpus,
  validatePublishRequest,
} from '../../scripts/publish-head.js';
import {recordProof} from '../../scripts/proof-authority.js';

function git(cwd, args) {
  return execFileSync('git', args, {cwd, encoding: 'utf8'}).trim();
}

const PROOF_AUTHORITY = path.join(path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'scripts', 'proof-authority.js');
const CORPUS_REF_ROOT = 'refs/lagrange-proofs/corpus-full-v1/';

function fixture(hookBody = 'cat >/dev/null\nexit 0') {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-head-'));
  const root = path.join(parent, 'repo');
  const remote = path.join(parent, 'remote.git');
  fs.mkdirSync(root);
  git(parent, ['init', '--bare', remote]);
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'publish@example.com']);
  git(root, ['config', 'user.name', 'Publish Test']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['config', 'core.hooksPath', '.githooks']);
  fs.mkdirSync(path.join(root, '.githooks'));
  const hook = path.join(root, '.githooks', 'pre-push');
  fs.writeFileSync(hook, `#!/bin/sh\n${hookBody}\n`);
  fs.chmodSync(hook, 0o755);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'one\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'initial']);
  git(root, ['remote', 'add', 'origin', remote]);
  git(root, ['push', '-u', 'origin', 'main']);
  fs.writeFileSync(path.join(root, 'tracked.txt'), 'two\n');
  git(root, ['commit', '-am', 'publish exact head']);
  // The gitignored dataset tree the gate links; its absence is a fail-fast.
  fs.mkdirSync(path.join(root, 'data'));
  return {parent, root, remote};
}

tap.test('publish fails fast when data/ is absent and names the links', (t) => {
  const {parent, root, remote} = fixture();
  const before = git(remote, ['rev-parse', 'refs/heads/main']);
  fs.rmSync(path.join(root, 'data'), {recursive: true, force: true});
  const lines = [];
  const log = (line) => lines.push(line);
  t.throws(() => publishExactHead(root, {}, {queryCi: false, log}),
    /publish: data\/ is absent in .*--allow-missing-data/u,
    'a fresh worktree without the dataset stops before the gate');
  t.match(lines.join(''),
    /publish: linking node_modules -> \(absent\), data -> \(absent\)/u,
    'the notice names every link the gate would make');
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']), before,
    'nothing was pushed');
  t.equal(fs.existsSync(path.join(root, 'test-output', 'publish-worktrees')),
    false, 'no gate worktree was created');
  lines.length = 0;
  publishExactHead(root, {allowMissingData: true}, {queryCi: false, log});
  t.match(lines.join(''), /data -> \(absent\)/u);
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']),
    git(root, ['rev-parse', 'HEAD']), '--allow-missing-data publishes');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish validates red-main attribution without mutation', (t) => {
  t.equal(validatePublishRequest({
    fixesRed: null, reason: null, remoteSha: 'a'.repeat(40),
  }), 'github', 'every publication runs GitHub-hosted');
  t.throws(() => validatePublishRequest({
    fixesRed: 'a'.repeat(40), reason: 'fix', remoteSha: 'b'.repeat(40),
  }), /names a head the branch is not red at/u,
  'the authority refuses a repair attributed to the wrong head');
  t.throws(() => parsePublishArgs(['--reason', '--fixes-red', 'a'.repeat(40)]),
    /requires a value/u);
  t.end();
});

tap.test('the gate reads the remote sha this publish observed as its base', (t) => {
  // The ref line's fourth field is the proof base the gate lints and tests
  // against. It reached the hook as the word "undefined" while this function
  // destructured `remoteBefore` from an answer whose key is `remoteSha`, and
  // every stage that reads a base silently widened to the whole tree.
  // Appended, and the setup push's line is discarded first: git's own push
  // runs this hook again after the gate, with a ref line of the same shape
  // (the refspec's local ref is HEAD) carrying git's own remote sha whatever
  // this function computed. The gate's line is then the first one.
  // Each invocation is tagged: the publisher's own `git push` sets
  // LAGRANGE_PUSH_SKIP_TESTS, the gate call does not. Without the tag the two
  // lines are indistinguishable - git's carries the correct sha whatever this
  // function computed - and a witness reading the wrong one passes blind.
  // The gate invocation also writes the proof scope the real gate writes, so
  // the publisher's own recording of the whole-corpus receipt is observable:
  // it must happen AFTER the push it verified, which is the whole reason the
  // gate itself defers (proof-ref-push-fast-path).
  const {parent, root, remote} = fixture(
    '{ printf "%s " "${LAGRANGE_PUSH_SKIP_TESTS:-GATE}"; cat -; } ' +
    '>> "$(git rev-parse --git-common-dir)/gate-ref-lines.txt"\n' +
    'if [ -z "${LAGRANGE_PUSH_SKIP_TESTS:-}" ]; then\n' +
    '  SHA="$(git rev-parse HEAD)"\n' +
    '  mkdir -p test-output\n' +
    '  printf \'{"sha":"%s","fullCorpus":true}\\n\' "$SHA" ' +
    '> test-output/proof-scope.json\n' +
    'fi\nexit 0');
  const recorded = path.join(root, '.git', 'gate-ref-lines.txt');
  // A stub authority: the publisher spawns `scripts/proof-authority.js record`
  // from the repository root, so this records the argv it was given, in order
  // with the hook lines above.
  const authority = path.join(root, 'scripts', 'proof-authority.js');
  fs.mkdirSync(path.dirname(authority), {recursive: true});
  fs.writeFileSync(authority,
    'import fs from \'node:fs\';\n' +
    'fs.appendFileSync(\'.git/gate-ref-lines.txt\',\n' +
    '  `RECORD ${process.argv.slice(2).join(\' \')}\\n`);\n', 'utf8');
  // And a stub pruner: retention runs on the routine path now, after the
  // push and the receipt, so it is observable in the same ordered record.
  fs.writeFileSync(path.join(root, 'scripts', 'prune-test-output.js'),
    'import fs from \'node:fs\';\n' +
    'fs.appendFileSync(\'.git/gate-ref-lines.txt\',\n' +
    '  `PRUNE ${process.argv.slice(2).join(\' \')}\\n`);\n', 'utf8');
  // The real repository ignores test-output/, so the gate writing its scope
  // there is not a mutation of the checkout; the fixture must say the same or
  // the publisher's own mutation guard fires first.
  fs.writeFileSync(path.join(root, '.gitignore'), 'test-output/\n', 'utf8');
  git(root, ['add', 'scripts/proof-authority.js', 'scripts/prune-test-output.js',
    '.gitignore']);
  git(root, ['commit', '--quiet', '-m', 'stub authority']);
  fs.rmSync(recorded, {force: true});
  const remoteBefore = git(remote, ['rev-parse', 'refs/heads/main']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const receipt = publishExactHead(root, {}, {queryCi: false});
  const lines = fs.readFileSync(recorded, 'utf8').trim().split('\n');
  t.equal(lines.length, 4,
    'the gate ran the hook, so did the push, then the receipt, then retention');
  const [gateLine, pushLine, recordLine, pruneLine] = lines;
  t.equal(recordLine, `RECORD record corpus-full-v1 ${head}`,
    'the publisher records the corpus the gate proved, for the published sha');
  t.equal(pruneLine,
    'PRUNE --apply --keep-days 7 --keep-reports 24 --keep-report-playbacks 24',
    'and applies the history-safe retention policy last, after the publish stood');
  t.equal(gateLine, `GATE HEAD ${head} refs/heads/main ${remoteBefore}`,
    'the gate is handed the pushed head and the remote sha it will advance');
  t.match(pushLine, /^1 /u, 'the second invocation is git\'s own push');
  t.equal(JSON.parse(fs.readFileSync(receipt.receipt, 'utf8')).remoteBefore,
    remoteBefore, 'and the receipt records the same sha, not an absent field');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish gates and pushes only the exact committed HEAD', (t) => {
  const {parent, root, remote} = fixture();
  const beforeStatus = git(root, ['status', '--porcelain']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const receipt = publishExactHead(root, {}, {queryCi: false});
  t.equal(receipt.head, head);
  t.equal(receipt.runner, 'github',
    'the default publication receipt records GitHub-hosted routing');
  t.equal(git(root, ['status', '--porcelain']), beforeStatus,
    'publisher does not stage, commit, amend, or sweep the working tree');
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']), head,
    'remote main is the exact gated HEAD');
  t.equal(JSON.parse(fs.readFileSync(receipt.receipt, 'utf8')).head, head,
    'receipt is bound to the published commit');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish exposes installed dependencies only while gating', (t) => {
  const {parent, root, remote} = fixture(
    'cat >/dev/null\ntest ! -f .git || ' +
      'test "${LAGRANGE_PUSH_SKIP_TESTS:-}" = 1 || ' +
      'test -f node_modules/.publish-marker',
  );
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'node_modules', '.publish-marker'), 'ready\n');
  const head = git(root, ['rev-parse', 'HEAD']);
  publishExactHead(root, {}, {queryCi: false});
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']), head,
    'the exact-HEAD gate resolves the workspace installation');
  t.notOk(fs.lstatSync(path.join(root, 'node_modules')).isSymbolicLink(),
    'the publisher never replaces the workspace installation');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish exposes the gitignored dataset tree only while gating', (t) => {
  const {parent, root, remote} = fixture(
    'cat >/dev/null\ntest ! -f .git || ' +
      'test "${LAGRANGE_PUSH_SKIP_TESTS:-}" = 1 || ' +
      'test -f data/examples/movielens-100k/u.data',
  );
  const dataset = path.join(root, 'data', 'examples', 'movielens-100k');
  fs.mkdirSync(dataset, {recursive: true});
  fs.writeFileSync(path.join(dataset, 'u.data'), '1\t1\t5\t0\n');
  const head = git(root, ['rev-parse', 'HEAD']);
  publishExactHead(root, {}, {queryCi: false});
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']), head,
    'the exact-HEAD gate reads the gitignored dataset the worktree lacks');
  t.notOk(fs.lstatSync(path.join(root, 'data')).isSymbolicLink(),
    'the publisher never replaces the workspace dataset tree');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish fails closed when the gate mutates tracked content', (t) => {
  const {parent, root, remote} = fixture(
    'cat >/dev/null\necho gate-mutated >> tracked.txt\nexit 0',
  );
  const remoteBefore = git(remote, ['rev-parse', 'refs/heads/main']);
  t.throws(() => publishExactHead(root, {}, {queryCi: false}),
    /gate mutated the exact-HEAD worktree/u);
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']), remoteBefore,
    'nothing is pushed after a mutating gate');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish fails closed when the gate creates untracked content', (t) => {
  const {parent, root, remote} = fixture(
    'cat >/dev/null\necho created > gate-created.js\nexit 0',
  );
  const remoteBefore = git(remote, ['rev-parse', 'refs/heads/main']);
  t.throws(() => publishExactHead(root, {}, {queryCi: false}),
    /gate mutated the exact-HEAD worktree/u);
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']), remoteBefore);
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('a failed gate retains its receipt outside the worktree', (t) => {
  // The gate runs inside a throwaway worktree and writes its acceptance
  // receipt there, so cleanup used to destroy the only artifact naming the
  // failing command. Three consecutive ~17-minute publish attempts on
  // 2026-08-19 were spent rediscovering what that receipt already said.
  const hook = [
    'cat >/dev/null',
    // The fixture's own setup push runs this hook against the FIRST commit;
    // only the published commit should fail, or the fixture cannot be built.
    'grep -q two tracked.txt || exit 0',
    'mkdir -p test-output/acceptance/demo',
    'printf \'%s\' \'{"commands":[{"id":"first","status":"PASS"},' +
      '{"id":"second","status":"FAIL","artifactIdentity":' +
      '{"path":"test-output/acceptance/demo/second.json"}}]}\'' +
      ' > test-output/acceptance/gate.report.json',
    'printf \'%s\' \'{"stdout":"the real failure detail"}\'' +
      ' > test-output/acceptance/demo/second.json',
    'exit 1',
  ].join('\n');
  const {parent, root, remote} = fixture(hook);
  const head = git(root, ['rev-parse', 'HEAD']);
  const remoteBefore = git(remote, ['rev-parse', 'refs/heads/main']);

  t.throws(() => publishExactHead(root, {}, {queryCi: false}));
  t.equal(git(remote, ['rev-parse', 'refs/heads/main']), remoteBefore,
    'a failed gate still publishes nothing');

  const retained = path.join(root, 'test-output', 'push-gate', head);
  t.ok(fs.existsSync(path.join(retained, 'gate.report.json')),
    'the acceptance receipt survives worktree cleanup');
  t.ok(fs.existsSync(path.join(retained, 'second.json')),
    'the FIRST failing command artifact survives too');
  t.match(
    fs.readFileSync(path.join(retained, 'second.json'), 'utf8'),
    /the real failure detail/u,
    'the retained artifact carries the detail, not just a filename');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

// failed-gate-keeps-evidence: every failed direct push gate retains now, so
// the one retention owner bounds what it keeps (R13), says when a second
// failure of the same sha replaces the first, and still reports the receipt
// it kept when the named artifact is missing.
function failedGateCheckout(parent, name, artifact = 'test-output/acceptance/p/proof.json') {
  const worktree = path.join(parent, name);
  fs.mkdirSync(path.join(worktree, 'test-output', 'acceptance', 'p'), {recursive: true});
  fs.writeFileSync(path.join(worktree, 'test-output', 'acceptance', 'g.report.json'),
    JSON.stringify({commands: [{id: 'proof', status: 'FAIL', artifactIdentity: {path: artifact}}]}));
  fs.writeFileSync(path.join(worktree, 'test-output/acceptance/p/proof.json'), name);
  fs.writeFileSync(path.join(worktree, 'test-output/acceptance/p/proof.json.stdout.txt'), name);
  return worktree;
}

tap.test('retained gate diagnostics are bounded, replaced aloud, and honest', (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'retain-bound-'));
  const root = path.join(parent, 'root');
  const kept = path.join(root, 'test-output', 'push-gate');
  const shas = Array.from({length: 7}, (_unused, index) => `sha${index}`);
  shas.forEach((sha, index) => {
    t.equal(retainGateDiagnostics(root, failedGateCheckout(parent, sha), sha),
      path.join(kept, sha), 'a first failure of a sha is kept where it says');
    fs.utimesSync(path.join(kept, sha), index + 1, index + 1);
  });
  t.same(fs.readdirSync(kept).sort(), shas.slice(2),
    'only the newest five shas are kept; older ones are pruned');
  t.equal(fs.readFileSync(path.join(kept, 'sha6', 'proof.json.stdout.txt'), 'utf8'), 'sha6',
    'the raw stdout beside the artifact is kept too');
  t.equal(retainGateDiagnostics(root, failedGateCheckout(parent, 'again'), 'sha6'),
    `${path.join(kept, 'sha6')} (replacing an earlier failed run of this sha)`,
    'a second failure of one sha says it replaced the first');
  t.equal(fs.readFileSync(path.join(kept, 'sha6', 'proof.json'), 'utf8'), 'again');
  t.equal(retainGateDiagnostics(root,
    failedGateCheckout(parent, 'missing', 'test-output/acceptance/p/gone.json'), 'shaM'),
  path.join(kept, 'shaM'), 'a kept receipt is reported even when its artifact is missing');
  t.ok(fs.existsSync(path.join(kept, 'shaM', 'g.report.json')));
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('a successful publish retains no gate diagnostics', (t) => {
  const {parent, root} = fixture();
  const head = git(root, ['rev-parse', 'HEAD']);
  publishExactHead(root, {}, {queryCi: false});
  t.notOk(
    fs.existsSync(path.join(root, 'test-output', 'push-gate', head)),
    'retention is a failure path, not clutter on every push');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish rebases local commits over inert trend commits on the remote', (t) => {
  const {parent, root, remote} = fixture();
  fs.writeFileSync(path.join(root, 'local.txt'), 'local work\n');
  git(root, ['add', 'local.txt']);
  git(root, ['commit', '-m', 'local work']);
  const localHead = git(root, ['rev-parse', 'HEAD']);
  const sibling = path.join(parent, 'sibling');
  git(parent, ['clone', '--branch', 'main', remote, sibling]);
  git(sibling, ['config', 'user.email', 'formation-health@users.noreply.github.com']);
  git(sibling, ['config', 'user.name', 'formation-health']);
  fs.mkdirSync(path.join(sibling, 'data', 'formation-health'), {recursive: true});
  fs.writeFileSync(path.join(sibling, 'data', 'formation-health', 'trend.ndjson'),
    '{"verdict":"PASS"}\n');
  git(sibling, ['add', 'data/formation-health/trend.ndjson']);
  git(sibling, ['commit', '-m', 'formation-health: trend record']);
  const botHead = git(sibling, ['rev-parse', 'HEAD']);
  git(sibling, ['push', 'origin', 'main']);
  const receipt = publishExactHead(root, {}, {queryCi: false});
  const published = git(remote, ['rev-parse', 'refs/heads/main']);
  t.equal(receipt.head, published, 'the receipt binds the rebased head');
  t.not(published, localHead, 'the local commit was rebased');
  // The fixture's own unpushed commit and the local one are both rebased
  // onto the bot commit: exactly two commits above it, nothing else.
  t.equal(git(remote, ['rev-list', '--count', `${botHead}..${published}`]), '2',
    'the local commits sit on top of the bot commit');
  t.equal(git(root, ['show', '--format=', '--name-only', published]).trim(),
    'local.txt', 'the local change is intact');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish aborts a conflicting rebase and leaves the repo where it was', (t) => {
  const {parent, root, remote} = fixture();
  fs.mkdirSync(path.join(root, 'data', 'formation-health'), {recursive: true});
  fs.writeFileSync(path.join(root, 'data', 'formation-health', 'trend.ndjson'), 'local\n');
  git(root, ['add', 'data/formation-health/trend.ndjson']);
  git(root, ['commit', '-m', 'local touches the trend']);
  const localHead = git(root, ['rev-parse', 'HEAD']);
  const sibling = path.join(parent, 'sibling');
  git(parent, ['clone', '--branch', 'main', remote, sibling]);
  git(sibling, ['config', 'user.email', 'formation-health@users.noreply.github.com']);
  git(sibling, ['config', 'user.name', 'formation-health']);
  fs.mkdirSync(path.join(sibling, 'data', 'formation-health'), {recursive: true});
  fs.writeFileSync(path.join(sibling, 'data', 'formation-health', 'trend.ndjson'), 'remote\n');
  git(sibling, ['add', 'data/formation-health/trend.ndjson']);
  git(sibling, ['commit', '-m', 'formation-health: trend record']);
  git(sibling, ['push', 'origin', 'main']);
  t.throws(() => publishExactHead(root, {}, {queryCi: false}), /conflicted/u);
  t.equal(git(root, ['rev-parse', 'HEAD']), localHead, 'HEAD is untouched');
  t.notOk(fs.existsSync(path.join(root, '.git', 'rebase-merge')), 'no rebase left in progress');
  t.equal(git(root, ['status', '--porcelain']), '', 'the tree is clean');
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish refuses to rebase over a dirty tracked tree', (t) => {
  const {parent, root, remote} = fixture();
  const sibling = path.join(parent, 'sibling');
  git(parent, ['clone', '--branch', 'main', remote, sibling]);
  git(sibling, ['config', 'user.email', 'formation-health@users.noreply.github.com']);
  git(sibling, ['config', 'user.name', 'formation-health']);
  fs.mkdirSync(path.join(sibling, 'data', 'formation-health'), {recursive: true});
  fs.writeFileSync(path.join(sibling, 'data', 'formation-health', 'trend.ndjson'), 'remote\n');
  git(sibling, ['add', 'data/formation-health/trend.ndjson']);
  git(sibling, ['commit', '-m', 'formation-health: trend record']);
  git(sibling, ['push', 'origin', 'main']);
  const tracked = git(root, ['ls-files']).split('\n').find((name) => !name.startsWith('.githooks/'));
  fs.appendFileSync(path.join(root, tracked), 'dirty\n');
  t.throws(() => publishExactHead(root, {}, {queryCi: false}), /uncommitted tracked changes/u);
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

tap.test('publish rejects a non-fast-forward HEAD', (t) => {
  const {parent, root, remote} = fixture();
  const sibling = path.join(parent, 'sibling');
  git(parent, ['clone', '--branch', 'main', remote, sibling]);
  git(sibling, ['config', 'user.email', 'sibling@example.com']);
  git(sibling, ['config', 'user.name', 'Sibling']);
  fs.writeFileSync(path.join(sibling, 'remote.txt'), 'advance\n');
  git(sibling, ['add', 'remote.txt']);
  git(sibling, ['commit', '-m', 'advance remote']);
  git(sibling, ['push', 'origin', 'main']);
  t.throws(() => publishExactHead(root, {}, {queryCi: false}),
    /not a fast-forward/u);
  fs.rmSync(parent, {recursive: true, force: true});
  t.end();
});

// --- The post-merge arm: a head GitHub merged never met the publisher, so it
// has no corpus proof until the operator runs the rest of the corpus for it.
// The fixture's own HEAD lands on origin/main by a plain push (a merge the
// publisher never saw), and the main checkout then moves on, as it does.
function mergedFixture() {
  const fixed = fixture();
  const merged = git(fixed.root, ['rev-parse', 'HEAD']);
  git(fixed.root, ['push', '--quiet', 'origin', 'HEAD:refs/heads/main']);
  fs.writeFileSync(path.join(fixed.root, 'tracked.txt'), 'three\n');
  git(fixed.root, ['commit', '--quiet', '-am', 'local work after the merge']);
  const stateDir = path.join(fixed.parent, 'state');
  const lines = [];
  const spawned = [];
  const prove = (sha) => proveMergedHead(fixed.root, sha, {
    localCorpusDir: stateDir,
    write: (line) => lines.push(line),
    wholeCorpus: () => ['a.test.js', 'b.test.js'],
    spawnProcess: (command, args) => {
      spawned.push(args.slice(1));
      return {pid: 777, unref: () => {}};
    },
  });
  const receiptRef = (sha) => git(fixed.remote,
    ['for-each-ref', '--format=%(objectname)', `${CORPUS_REF_ROOT}${sha}`]);
  return {...fixed, merged, stateDir, lines, spawned, prove, receiptRef};
}

function refusalOf(action) {
  try {
    action();
  } catch (error) {
    return error.refusal || `untyped: ${error.message}`;
  }
  return 'not refused';
}

tap.test('a GitHub-merged head with no receipt gets one from the post-merge arm', (t) => {
  const merged = mergedFixture();
  const remoteBefore = git(merged.remote, ['rev-parse', 'refs/heads/main']);
  const statusBefore = git(merged.root, ['status', '--porcelain']);
  merged.prove(merged.merged);
  t.same(merged.spawned, [['--local-corpus', merged.merged]],
    'the detached local corpus starts for the merged sha');
  t.equal(fs.readFileSync(path.join(merged.stateDir, `${merged.merged}.files`), 'utf8'),
    'a.test.js\nb.test.js\n',
    'no local gate proved a cone for it, so the whole corpus is owed');
  t.equal(merged.receiptRef(merged.merged), '', 'no receipt before the corpus ran');
  // The detached half, with the corpus run stubbed green and the REAL proof
  // authority recording into the fake origin.
  const status = runLocalCorpus(merged.root, merged.merged, {
    stateDir: merged.stateDir,
    run: (command, args, options) => {
      if (args[0] === 'scripts/proof-authority.js') {
        return spawnSync(command, [PROOF_AUTHORITY, ...args.slice(1)], options);
      }
      return {status: 0};
    },
  });
  t.equal(status, 0);
  t.match(merged.receiptRef(merged.merged), /^[0-9a-f]{40}$/u,
    'the fake origin now holds the corpus-full-v1 receipt for the merged sha');
  t.equal(git(merged.remote, ['rev-parse', 'refs/heads/main']), remoteBefore,
    'nothing was pushed to main');
  t.equal(git(merged.root, ['status', '--porcelain']), statusBefore,
    'nothing was staged or changed in the caller\'s checkout');
  fs.rmSync(merged.parent, {recursive: true, force: true});
  t.end();
});

tap.test('the post-merge arm refuses a sha that is not a main head', (t) => {
  const merged = mergedFixture();
  const local = git(merged.root, ['rev-parse', 'HEAD']);
  t.equal(refusalOf(() => merged.prove(local)), POST_MERGE_REFUSAL.NOT_ON_MAIN,
    'a commit origin/main does not carry is refused, typed');
  t.equal(refusalOf(() => merged.prove('main')), POST_MERGE_REFUSAL.NOT_A_SHA,
    'a name is not an exact head');
  // A side commit reachable from main only through a merge commit was never a
  // head of main.
  git(merged.root, ['checkout', '--quiet', '-b', 'side', merged.merged]);
  fs.writeFileSync(path.join(merged.root, 'side.txt'), 'side\n');
  git(merged.root, ['add', 'side.txt']);
  git(merged.root, ['commit', '--quiet', '-m', 'side commit']);
  const side = git(merged.root, ['rev-parse', 'HEAD']);
  git(merged.root, ['checkout', '--quiet', '-b', 'trunk', merged.merged]);
  fs.writeFileSync(path.join(merged.root, 'trunk.txt'), 'trunk\n');
  git(merged.root, ['add', 'trunk.txt']);
  git(merged.root, ['commit', '--quiet', '-m', 'trunk commit']);
  git(merged.root, ['merge', '--quiet', '--no-edit', 'side']);
  git(merged.root, ['push', '--quiet', 'origin', 'HEAD:refs/heads/main']);
  t.equal(refusalOf(() => merged.prove(side)), POST_MERGE_REFUSAL.NOT_ON_MAIN,
    'a branch commit behind a merge commit is not a main head');
  t.same(merged.spawned, [], 'nothing was started for any refused sha');
  t.equal(merged.receiptRef(local), '', 'and nothing was recorded');
  fs.rmSync(merged.parent, {recursive: true, force: true});
  t.end();
});

tap.test('the post-merge arm never re-mints an existing receipt', (t) => {
  const merged = mergedFixture();
  recordProof({proofId: 'corpus-full-v1', sha: merged.merged, cwd: merged.root});
  const receipt = merged.receiptRef(merged.merged);
  t.match(receipt, /^[0-9a-f]{40}$/u, 'the head already carries a receipt');
  t.equal(refusalOf(() => merged.prove(merged.merged)), POST_MERGE_REFUSAL.ALREADY_PROVEN,
    'a proved head is refused, typed');
  t.same(merged.spawned, [], 'no corpus is started for it');
  t.equal(merged.receiptRef(merged.merged), receipt, 'the receipt is the same object');
  // The authority is spawned, never imported; an answer outside its exit and
  // stdout contract is not a verdict.
  const unanswered = refusalOf(() => proveMergedHead(merged.root, merged.merged, {
    localCorpusDir: merged.stateDir,
    run: (command, args, options) => (args[0] === PROOF_AUTHORITY ?
      {status: 2, stdout: 'UNAVAILABLE proof store lookup failed\n', stderr: ''} :
      spawnSync(command, args, options)),
  }));
  t.equal(unanswered, POST_MERGE_REFUSAL.PROOF_STORE_UNAVAILABLE,
    'a proof store that cannot answer refuses, typed');
  fs.rmSync(merged.parent, {recursive: true, force: true});
  t.end();
});

tap.test('the post-merge arm runs one local corpus at a time', (t) => {
  // A live process that looks like a local corpus: its own group, named so.
  const merged = mergedFixture();
  const children = [];
  t.teardown(() => {
    for (const child of children) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
  });
  const liveProve = (sha) => proveMergedHead(merged.root, sha, {
    localCorpusDir: merged.stateDir,
    write: () => {},
    wholeCorpus: () => ['a.test.js'],
    spawnProcess: () => {
      const child = spawn(process.execPath,
        ['-e', 'setTimeout(() => {}, 60000)', '--', '--local-corpus'],
        {detached: true, stdio: 'ignore'});
      children.push(child);
      return child;
    },
  });
  // The main checkout's later commit is merged too, so the first head is no
  // longer the tip.
  git(merged.root, ['push', '--quiet', 'origin', 'HEAD:refs/heads/main']);
  const tip = git(merged.root, ['rev-parse', 'HEAD']);
  liveProve(tip);
  t.equal(refusalOf(() => liveProve(tip)), POST_MERGE_REFUSAL.ALREADY_RUNNING,
    'a head whose local corpus is running is not started twice');
  t.equal(refusalOf(() => liveProve(merged.merged)), POST_MERGE_REFUSAL.CORPUS_BUSY,
    'an older head does not start beside the newest head\'s run');
  t.equal(children.length, 1, 'one run was started');
  fs.rmSync(merged.parent, {recursive: true, force: true});
  t.end();
});

tap.test('the post-merge arm is a publisher option that takes one sha', (t) => {
  t.same(parsePublishArgs(['--post-merge', 'a'.repeat(40)]), {postMerge: 'a'.repeat(40)});
  t.throws(() => parsePublishArgs(['--post-merge']), /requires a value/u);
  t.end();
});
