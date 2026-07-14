import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {requiresSourceVerification} from
  '../../scripts/solve/change-artifact.js';
import {canonicalSourceDelta} from '../../scripts/solve/verification.js';

function git(root, args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
}

test('root package lock participates in canonical source verification', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'solver-package-lock-scope-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.test']);
  git(root, ['config', 'user.name', 'Solver']);
  writeFileSync(path.join(root, 'package.json'), '{"dependencies":{}}\n');
  writeFileSync(path.join(root, 'package-lock.json'), '{"packages":{}}\n');
  git(root, ['add', '--', 'package.json', 'package-lock.json']);
  git(root, ['commit', '-m', 'base']);
  const base = git(root, ['rev-parse', 'HEAD']);

  assert.equal(requiresSourceVerification('package.json'), true);
  assert.equal(requiresSourceVerification('package-lock.json'), true);
  assert.equal(requiresSourceVerification('nested/package-lock.json'), false);
  assert.equal(requiresSourceVerification('package-lock.json.bak'), false);
  assert.equal(requiresSourceVerification('package-lock.json5'), false);
  assert.equal(requiresSourceVerification('package-lock.json/nested'), false);

  writeFileSync(path.join(root, 'package.json'),
    '{"dependencies":{"pg":"^8.18.0"}}\n');
  writeFileSync(path.join(root, 'package-lock.json'),
    '{"packages":{"":{"dependencies":{"pg":"^8.18.0"}}}}\n');
  const withLock = canonicalSourceDelta(
    root,
    base,
    ['package.json', 'package-lock.json'],
  );
  const withoutLock = canonicalSourceDelta(root, base, ['package.json']);

  assert.equal(withLock.ok, true);
  assert.deepEqual(withLock.paths, ['package-lock.json', 'package.json']);
  assert.notEqual(withLock.fingerprint, withoutLock.fingerprint);
});
