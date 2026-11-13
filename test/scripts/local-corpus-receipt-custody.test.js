// The receipt effect is real native Git/proof-authority work. The corpus gate
// supplies finite owner-shaped runner sections; this is not whole-corpus proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {execGit} from '../../scripts/checks/git-invocation.js';
import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';
import {startLocalCorpus, runLocalCorpus} from '../../scripts/publish-local-corpus.js';
import {resolveProof, PROOF, OUTCOME} from '../../scripts/proof-authority.js';
import {
  LOCAL_CORPUS_STATE as STATE, LOCAL_CORPUS_TRANSITION as TRANSITION,
  readLocalCorpusRecords,
} from '../../scripts/publish-local-corpus-state.js';
import {SECTION_KIND, appendExecutionSection, fileResultRecord}
  from '../../scripts/test-execution-report.js';

const AUTHORITY = fileURLToPath(new URL('../../scripts/proof-authority.js', import.meta.url));

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'corpus-receipt-custody-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const root = path.join(directory, 'source');
  const remote = path.join(directory, 'remote.git');
  const stateDir = path.join(directory, 'state');
  fs.mkdirSync(root);
  const git = (cwd, args) => execGit(args,
    {cwd, encoding: 'utf8', env: gitProcessEnvironment()}).trim();
  git(root, ['init', '--quiet']);
  git(root, ['config', 'user.name', 'Custody Fixture']);
  git(root, ['config', 'user.email', 'custody@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['config', 'core.hooksPath', '/dev/null']);
  fs.writeFileSync(path.join(root, 'subject.txt'), 'subject\n');
  git(root, ['add', 'subject.txt']);
  git(root, ['commit', '--quiet', '-m', 'subject']);
  git(directory, ['init', '--bare', '--quiet', remote]);
  git(root, ['remote', 'add', 'origin', remote]);
  git(root, ['push', '--quiet', 'origin', 'HEAD:main']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const tree = git(root, ['rev-parse', 'HEAD^{tree}']);
  const files = ['test/controlled.test.js'];
  startLocalCorpus({root, stateDir, head, files,
    spawnProcess: () => ({pid: 12345, unref() {}})});
  return {root, remote, stateDir, head, tree, files, git};
}

for (const mode of ['link-before-effect', 'directory-fsync']) {
  test(`real proof receipt survives terminal ${mode} failure without a second invocation`, (t) => {
    const fixed = fixture(t);
    const nativeLink = fs.linkSync;
    const nativeSync = fs.fsyncSync;
    const fault = Object.assign(new Error(`controlled terminal ${mode}`), {code: 'EIO'});
    let greenLinked = false;
    let faults = 0;
    let receiptCalls = 0;
    let gateCalls = 0;
    let recordedObject;
    const link = t.mock.method(fs, 'linkSync', (source, destination) => {
      const proposed = JSON.parse(fs.readFileSync(source, 'utf8'));
      if (proposed.record?.state !== STATE.GREEN) return nativeLink(source, destination);
      if (mode === 'link-before-effect') {
        faults += 1; throw fault;
      }
      nativeLink(source, destination);
      greenLinked = true;
    });
    const sync = t.mock.method(fs, 'fsyncSync', (fd) => {
      if (greenLinked && fs.fstatSync(fd).isDirectory()) {
        faults += 1; throw fault;
      }
      return nativeSync(fd);
    });
    let error;
    try {
      runLocalCorpus(fixed.root, fixed.head, {stateDir: fixed.stateDir,
        run(command, args, options) {
          if (args[0] === 'scripts/proof-authority.js') {
            receiptCalls += 1;
            const result = spawnSync(command, [AUTHORITY, ...args.slice(1)], options);
            assert.equal(result.status, 0, result.stderr);
            const resolved = resolveProof({proofId: PROOF.CORPUS_FULL, sha: fixed.head,
              cwd: fixed.root});
            assert.equal(resolved.outcome, OUTCOME.PROVEN);
            recordedObject = resolved.objectSha;
            return result;
          }
          gateCalls += 1;
          assert.equal(args[0], 'scripts/checks/push-gate-corpus-worktree.js');
          const sections = options.env.LAGRANGE_EXECUTION_REPORT;
          appendExecutionSection(sections, {kind: SECTION_KIND.START, runId: 'controlled',
            argv: fixed.files, planned: fixed.files,
            checkout: {head: fixed.head, tree: fixed.tree, clean: true}});
          appendExecutionSection(sections, {kind: SECTION_KIND.END, runId: 'controlled',
            exitStatus: 0, results: fixed.files.map((file) =>
              fileResultRecord({file, ok: true, assertions: 2}))});
          return {status: 0};
        },
      });
    } catch (caught) {
      error = caught;
    } finally {
      link.mock.restore(); sync.mock.restore();
    }
    assert.ok(error, 'bookkeeping does not report success after its storage failure');
    assert.equal(error.code, greenLinked ? TRANSITION.LINKED_DURABILITY_UNAVAILABLE :
      TRANSITION.LINK_EFFECT_UNAVAILABLE);
    assert.equal(error.cause, fault);
    assert.equal(error.localCorpusCompletion.gate.status, 0);
    assert.equal(error.localCorpusCompletion.receipt.status, 0);
    assert.equal(error.proposedState.state, STATE.GREEN);
    assert.equal(faults, 1, 'failure does not rebase into a LOST publication');
    const current = readLocalCorpusRecords(fixed.stateDir)[0];
    assert.equal(current.state, greenLinked ? STATE.GREEN : STATE.RUNNING);
    assert.ok(fs.existsSync(error.proposalPath));
    assert.equal(JSON.parse(fs.readFileSync(error.proposalPath, 'utf8')).record.state, STATE.GREEN);
    const resolved = resolveProof({proofId: PROOF.CORPUS_FULL, sha: fixed.head, cwd: fixed.root});
    assert.equal(resolved.outcome, OUTCOME.PROVEN);
    assert.equal(resolved.objectSha, recordedObject, 'the real remote proof is not undone');
    assert.throws(() => runLocalCorpus(fixed.root, fixed.head, {stateDir: fixed.stateDir,
      run: () => {
        receiptCalls += 1; throw new Error('forbidden second invocation');
      }}),
    /no starting obligation/u);
    assert.equal(gateCalls, 1);
    assert.equal(receiptCalls, 1);
    assert.equal(resolveProof({proofId: PROOF.CORPUS_FULL, sha: fixed.head,
      cwd: fixed.root}).objectSha, recordedObject);
    t.diagnostic(JSON.stringify({mode, recordedObject, current,
      completion: error.localCorpusCompletion, proposalPath: error.proposalPath}));
  });
}
