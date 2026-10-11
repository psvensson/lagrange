import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {resolveBootSourceProvenance} from '../../src/entrypoint-runtime-provenance.js';
import {verifyRaftRsBinding} from '../../src/raft/raft-rs-operation-port.js';
import {RAFT_RS_WASM_FILE} from '../../src/raft/raft-rs-core-constants.js';
import {measureRuntimeContent} from '../../src/diagnostics/runtime-content-fingerprint.js';

const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('release build census measures native artifact bytes through the binding owner', () => {
  const verified = verifyRaftRsBinding();
  assert.equal(verified.state, 'verified');
  const packageDir = path.join(path.dirname(verified.digestFile),
    RAFT_RS_WASM_FILE.PACKAGE_DIRECTORY);
  assert.deepEqual(verified.artifactDigests, {
    wasm: digest(path.join(packageDir, RAFT_RS_WASM_FILE.WASM)),
    glue: digest(path.join(packageDir, RAFT_RS_WASM_FILE.GLUE)),
  });
});

test('same lock and version with different installed runtime body has different build content',
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tx1-runtime-content-'));
    try {
      fs.mkdirSync(path.join(root, 'src'));
      fs.mkdirSync(path.join(root, 'node_modules', 'dependency'), {recursive: true});
      fs.mkdirSync(path.join(root, 'node_modules', 'dev-tool'), {recursive: true});
      fs.writeFileSync(path.join(root, 'src', 'index.js'), 'runtime();');
      fs.writeFileSync(path.join(root, 'package.json'), '{}');
      fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({packages: {
        '': {}, 'node_modules/dependency': {version: '1.0.0'},
        'node_modules/dev-tool': {version: '1.0.0', dev: true},
      }}));
      const body = path.join(root, 'node_modules', 'dependency', 'index.js');
      fs.writeFileSync(body, 'export default 1;');
      const before = await measureRuntimeContent(root);
      fs.writeFileSync(body, 'export default 2;');
      const after = await measureRuntimeContent(root);
      assert.equal(before.sourceDigest, after.sourceDigest);
      assert.equal(before.manifestDigest, after.manifestDigest);
      assert.notEqual(before.dependencyDigest, after.dependencyDigest);
      fs.writeFileSync(path.join(root, 'node_modules', 'dev-tool', 'index.js'), 'dev();');
      assert.deepEqual(await measureRuntimeContent(root), after,
        'unrelated development tools are outside the runtime closure');
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

test('boot release identity is full measured content and ignores expected environment digest',
  async () => {
    const first = await resolveBootSourceProvenance({});
    const forged = await resolveBootSourceProvenance({SRC_FINGERPRINT: 'caller-value',
      LAGRANGE_BUILD_SOURCE_DIGEST: 'caller-build-value'});
    assert.match(first.runtimeBuild?.digest ?? '', /^[a-f0-9]{64}$/);
    assert.deepEqual(forged.runtimeBuild, first.runtimeBuild);
    assert.equal(forged.expectedSrcFingerprint, 'caller-value');
  });
