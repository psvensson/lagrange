import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {loadSelectorInputs} from
  '../../scripts/checks/impact-proof-cone-inputs.js';
import {buildManifest as buildPrimaryManifest} from
  '../../scripts/checks/test-primary-classification.js';
import {OWNER_DEBT} from
  '../../scripts/global-owner-debt-inventory/constants.js';
import {
  fileIdentity,
  importGraphResolverStateDigest,
  javascriptSourceDigest,
  listImportGraphInputFiles,
  listJavaScriptFiles,
} from '../../scripts/global-owner-debt-inventory/helpers.js';

const FOLLOWED_PROBLEM_PATTERN = /import graph followed file/iu;
const MODULE_PATH = 'node_modules/fixture-package/dist/followed.js';
const FIRST_TARGET = 'workspace/first.js';
const SECOND_TARGET = 'workspace/second.js';
const MODULE_TO_FIRST_TARGET = '../../../workspace/first.js';
const MODULE_TO_SECOND_TARGET = '../../../workspace/second.js';

function writeFixture(root, relativePath, content = '') {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, content);
}

function writeGraphAndSeal(root, graph) {
  graph.snapshotDigest = crypto.createHash(OWNER_DEBT.hashAlgorithm)
    .update(JSON.stringify(graph)).digest(OWNER_DEBT.hashEncoding);
  writeFixture(root,
    'test-output/analysis/global-owner-debt-import-graph.json',
    JSON.stringify(graph));
  writeFixture(root, 'test/shards/impact-graph-seal.json', JSON.stringify({
    schemaVersion: 1,
    importGraphSchemaVersion: graph.schemaVersion,
    sourceDigest: graph.sourceDigest,
    producerInputDigest: graph.producerInputDigest,
    resolverStateDigest: graph.resolverStateDigest,
    snapshotDigest: graph.snapshotDigest,
  }));
}

function createFollowedFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'followed-races-'));
  writeFixture(root, 'src/owner.js', 'export default 1;\n');
  writeFixture(root, 'test/owner.test.js',
    'import \'../src/owner.js\';\n');
  writeFixture(root, FIRST_TARGET, 'export default 1;\n');
  writeFixture(root, SECOND_TARGET, 'export default 1;\n');
  fs.mkdirSync(path.dirname(path.join(root, MODULE_PATH)), {recursive: true});
  fs.symlinkSync(MODULE_TO_FIRST_TARGET, path.join(root, MODULE_PATH));
  writeFixture(root, 'test/shards/primary-classes.json',
    JSON.stringify(buildPrimaryManifest(root)));
  writeFixture(root, 'test/shards/impact-contracts.json', JSON.stringify({
    schemaVersion: 2,
    id: 'followed-race-fixture',
    contracts: {},
    coupledPairs: {},
  }));

  const files = listJavaScriptFiles(root);
  const resolverInputs = [];
  const degrees = Object.fromEntries(
    files.map((filePath) => [filePath, {in: 0, out: 0}]));
  degrees['src/owner.js'].in = 1;
  degrees['test/owner.test.js'].out = 1;
  degrees[MODULE_PATH] = {in: 0, out: 0};
  writeGraphAndSeal(root, {
    schemaVersion: OWNER_DEBT.importGraphSchemaVersion,
    sourceDigest: javascriptSourceDigest(root, files),
    producerInputDigest: javascriptSourceDigest(
      root, listImportGraphInputFiles(root)),
    fileDigests: Object.fromEntries(files.map((filePath) => [
      filePath,
      fileIdentity(root, filePath).sha256,
    ])),
    followedFileDigests: {
      [FIRST_TARGET]: fileIdentity(root, FIRST_TARGET).sha256,
    },
    resolverInputs,
    resolverStateDigest: importGraphResolverStateDigest(root, resolverInputs),
    moduleCount: files.length + 1,
    edgeCount: 1,
    unresolvedCount: 0,
    degrees,
    importers: {'src/owner.js': ['test/owner.test.js']},
  });
  return root;
}

function withFollowedFixture(callback) {
  const root = createFollowedFixture();
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

function assertAccepted(root) {
  const loaded = loadSelectorInputs(root);
  assert.equal(loaded.ok, true, loaded.problems?.join('\n'));
}

function assertFollowedRejected(root) {
  const loaded = loadSelectorInputs(root);
  assert.equal(loaded.ok, false);
  assert.match(loaded.problems.join('\n'), FOLLOWED_PROBLEM_PATTERN);
}

function descriptorPath(descriptor) {
  try {
    return fs.realpathSync(`/proc/self/fd/${descriptor}`);
  } catch {
    return null;
  }
}

test('followed-file descriptor close failure fails closed after cached green', () => {
  withFollowedFixture((root) => {
    assertAccepted(root);
    const followedAbsolute = path.join(root, FIRST_TARGET);
    const originalCloseSync = fs.closeSync;
    let leakedDescriptor;
    fs.closeSync = (descriptor) => {
      if (leakedDescriptor === undefined &&
          descriptorPath(descriptor) === followedAbsolute) {
        leakedDescriptor = descriptor;
        throw new Error('injected followed-file close failure');
      }
      return originalCloseSync(descriptor);
    };
    try {
      assertFollowedRejected(root);
    } finally {
      fs.closeSync = originalCloseSync;
      if (leakedDescriptor !== undefined) originalCloseSync(leakedDescriptor);
    }
  });
});

test('followed-file repeated read rejects an in-place content mutation', () => {
  withFollowedFixture((root) => {
    assertAccepted(root);
    const followedAbsolute = path.join(root, FIRST_TARGET);
    const originalReadSync = fs.readSync;
    let mutated = false;
    fs.readSync = (...args) => {
      const bytesRead = originalReadSync(...args);
      if (!mutated && descriptorPath(args[0]) === followedAbsolute) {
        mutated = true;
        fs.writeFileSync(followedAbsolute, 'export default 2;\n');
      }
      return bytesRead;
    };
    try {
      assertFollowedRejected(root);
      assert.equal(mutated, true);
    } finally {
      fs.readSync = originalReadSync;
    }
  });
});

test('cached followed census detects a logical symlink membership race', () => {
  withFollowedFixture((root) => {
    assertAccepted(root);
    const moduleAbsolute = path.join(root, MODULE_PATH);
    const originalRealpathSync = fs.realpathSync;
    let transitioned = false;
    fs.realpathSync = (...args) => {
      const result = originalRealpathSync(...args);
      if (!transitioned && path.resolve(args[0]) === moduleAbsolute) {
        transitioned = true;
        fs.unlinkSync(moduleAbsolute);
        fs.symlinkSync(MODULE_TO_SECOND_TARGET, moduleAbsolute);
      }
      return result;
    };
    try {
      assertFollowedRejected(root);
      assert.equal(transitioned, true);
    } finally {
      fs.realpathSync = originalRealpathSync;
    }
  });
});
