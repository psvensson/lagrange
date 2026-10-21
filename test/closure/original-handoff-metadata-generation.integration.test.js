// Verification branch only: regenerate metadata with its canonical producers,
// measure the resulting gates, print the exact patch, then restore all inputs.
// Never treat generated-worktree success as proof of committed metadata.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const manifests = ['primary-classes.json', 'resource-classes.json',
  'subsystem-classes.json'].map((name) => `test/shards/${name}`);
const producers = ['generate-test-primary-classes.js',
  'generate-test-resource-classes.js', 'generate-test-subsystem-classes.js'];

function invoke(program, args) {
  const result = spawnSync(program, args, {cwd: root, encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024, env: process.env});
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(result.error, undefined, 'canonical command must start');
  assert.equal(result.signal, null, 'canonical command must settle normally');
  assert.equal(result.status, 0, `canonical command failed: ${args.join(' ')}`);
  return result.stdout;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('isolated metadata producer correspondence with exact restoration', (t) => {
  // Refuse a normal/shared checkout or symlinked manifests before any write.
  assert.equal(fs.lstatSync(path.join(root, '.git')).isFile(), true,
    'verification requires an isolated Git worktree');
  const before = new Map(manifests.map((relative) => {
    const full = path.join(root, relative);
    assert.equal(fs.realpathSync(full), full, 'manifest must be checkout-local');
    assert.equal(fs.lstatSync(full).isFile(), true);
    return [relative, fs.readFileSync(full)];
  }));
  t.after(() => {
    const errors = [];
    for (const [relative, bytes] of before) {
      try {
        fs.writeFileSync(path.join(root, relative), bytes);
        assert.deepEqual(fs.readFileSync(path.join(root, relative)), bytes);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'metadata input restoration failed');
    }
  });
  for (const producer of producers) {
    invoke(process.execPath, [`scripts/${producer}`]);
  }
  invoke('npm', ['run', '--silent', 'audit:impact-contracts']);
  invoke('npm', ['run', '--silent', 'audit:shards']);
  const records = manifests.map((relative) => {
    const bytes = fs.readFileSync(path.join(root, relative));
    return {path: relative, beforeSha256: digest(before.get(relative)),
      generatedSha256: digest(bytes), generatedBytes: bytes.length};
  });
  process.stdout.write(`GENERATED_METADATA_HASHES ${JSON.stringify(records)}\n`);
  process.stdout.write('GENERATED_METADATA_PATCH_BEGIN\n');
  invoke('git', ['--no-pager', 'diff', '--no-ext-diff', '--no-textconv',
    '--no-color', '--', ...manifests]);
  process.stdout.write('GENERATED_METADATA_PATCH_END\n');
});
