// PR117 follow-up: native failure-scoping, reentrancy and shared-load pressure.
// Each scenario executes a private exact source copy with real raft-rs/SQLite.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIR = 'test/raft/raft-rs-backend';
const CHILD = `${DIR}/runtime-replacement-review-child.js`;
const OUTPUT = path.join(ROOT, 'test-output/runtime-review-native');
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const scenario of ['control', 'partial-restore', 'reentrant-restore', 'reload-backoff', 'trap-during-restore', 'close-during-restore', 'mixed-clocks', 'last-close']) {
  test(`shared runtime independent-review witness: ${scenario}`, (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-review-isolated-'));
    try {
      fs.cpSync(path.join(ROOT, 'src'), path.join(directory, 'src'), {recursive: true});
      fs.mkdirSync(path.join(directory, DIR), {recursive: true});
      fs.cpSync(path.join(ROOT, 'vendor/raft-rs-wasm/pkg'), path.join(directory, 'vendor/raft-rs-wasm/pkg'), {recursive: true});
      for (const file of ['package.json', CHILD, `${DIR}/partition-node-cluster.js`, 'vendor/raft-rs-wasm/artifact-digest.json']) {
        fs.copyFileSync(path.join(ROOT, file), path.join(directory, file));
      }
      fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
      const sourceDigests = {};
      for (const file of ['src/raft/raft-rs-runtime-owner.js', 'src/raft/raft-rs-binding-owner.js',
        'src/raft/raft-rs-operation-port.js', 'src/raft/raft-rs-durable-store.js',
        'src/raft/raft-rs-application-transaction-owner.js', 'src/time/time-source.js', CHILD, `${DIR}/partition-node-cluster.js`]) {
        sourceDigests[file] = digest(path.join(ROOT, file));
        assert.equal(digest(path.join(directory, file)), sourceDigests[file]);
      }
      const result = spawnSync(process.execPath, [path.join(directory, CHILD), scenario], {
        cwd: directory, encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024,
      });
      const output = {scenario, sourceDigests, status: result.status, signal: result.signal,
        error: result.error?.message ?? null, stdout: result.stdout, stderr: result.stderr};
      fs.mkdirSync(OUTPUT, {recursive: true});
      fs.writeFileSync(path.join(OUTPUT, `${scenario}.json`), JSON.stringify(output, null, 2) + '\n');
      t.diagnostic(JSON.stringify(output));
      assert.equal(result.error, undefined, 'native child must actually run');
      assert.equal(result.signal, null, 'native child must not be killed');
      const line = result.stdout.split('\n').find((row) => row.startsWith('RUNTIME_REVIEW '));
      assert.ok(line, 'an engaged native path must return its receipt');
      const receipt = JSON.parse(line.slice('RUNTIME_REVIEW '.length));
      assert.equal(receipt.traps, 1);
      assert.equal(result.status, 0, `native review witness failed: ${scenario}`);
      assert.equal(receipt.phase, 'complete');
    } finally { fs.rmSync(directory, {recursive: true, force: true}); }
  });
}
