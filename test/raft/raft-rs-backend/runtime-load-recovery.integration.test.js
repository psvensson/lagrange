// Real production operation ports, vendored raft-rs WASM and SQLite WAL files.
// Every fault runs in a separate byte-for-byte source copy and child process;
// neither the checked-out vendor files nor another test's shared core is edited.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const TEST_DIRECTORY = 'test/raft/raft-rs-backend';
const CHILD = `${TEST_DIRECTORY}/runtime-load-recovery-child.js`;
const SUBJECTS = [
  'src/raft/raft-rs-runtime-owner.js',
  'src/raft/raft-rs-binding-owner.js',
  'src/raft/raft-rs-operation-port.js',
  'src/raft/raft-rs-durable-store.js',
  'src/raft/raft-rs-application-transaction-owner.js',
  `${TEST_DIRECTORY}/partition-node-cluster.js`,
  CHILD,
];
const SCENARIOS = ['control', 'missing-glue', 'changed-glue', 'repeated-refusal'];
const CHILD_BOUND_MS = 20000;
const OUTPUT = path.join(ROOT, 'test-output/runtime-load-native');
const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

for (const scenario of SCENARIOS) {
  test(`shared runtime load recovery through production ports: ${scenario}`, (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-load-isolated-'));
    try {
      fs.cpSync(path.join(ROOT, 'src'), path.join(directory, 'src'), {recursive: true});
      fs.mkdirSync(path.join(directory, TEST_DIRECTORY), {recursive: true});
      fs.mkdirSync(path.join(directory, 'vendor/raft-rs-wasm'), {recursive: true});
      for (const file of ['package.json', CHILD, `${TEST_DIRECTORY}/partition-node-cluster.js`,
        'vendor/raft-rs-wasm/artifact-digest.json']) {
        fs.copyFileSync(path.join(ROOT, file), path.join(directory, file));
      }
      fs.cpSync(path.join(ROOT, 'vendor/raft-rs-wasm/pkg'),
        path.join(directory, 'vendor/raft-rs-wasm/pkg'), {recursive: true});
      fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
      const sourceDigests = {};
      for (const file of SUBJECTS) {
        sourceDigests[file] = digest(path.join(ROOT, file));
        assert.equal(digest(path.join(directory, file)), sourceDigests[file],
          `private fixture must execute exact source: ${file}`);
      }
      const result = spawnSync(process.execPath, [path.join(directory, CHILD), scenario], {
        cwd: directory, encoding: 'utf8', timeout: CHILD_BOUND_MS, maxBuffer: 4 * 1024 * 1024,
      });
      const output = {scenario, sourceDigests, status: result.status, signal: result.signal,
        error: result.error?.message ?? null, stdout: result.stdout, stderr: result.stderr};
      fs.mkdirSync(OUTPUT, {recursive: true});
      fs.writeFileSync(path.join(OUTPUT, `${scenario}.json`), JSON.stringify(output, null, 2) + '\n');
      t.diagnostic(JSON.stringify(output));
      assert.equal(result.error, undefined, 'child must run, not time out or fail to spawn');
      assert.equal(result.signal, null, 'child must not be killed');
      assert.equal(result.status, 0, `native recovery failed in ${scenario}`);
      const receiptLine = result.stdout.split('\n').find((line) => line.startsWith('NATIVE_RECOVERY '));
      assert.ok(receiptLine, 'an engaged native witness must return its own receipt');
      const receipt = JSON.parse(receiptLine.slice('NATIVE_RECOVERY '.length));
      assert.equal(receipt.phase, 'complete');
      assert.equal(receipt.traps, 1, 'the actual runtime containment path must be engaged');
      assert.equal(receipt.groupsRestored, 2, 'both independent groups must be restored');
      assert.equal(receipt.artifactsRestored, true);
    } finally {
      fs.rmSync(directory, {recursive: true, force: true});
    }
  });
}
