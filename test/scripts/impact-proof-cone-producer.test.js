import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {refreshImportGraphReport} from
  '../../scripts/generate-global-owner-debt-inventory.js';
import {listJavaScriptFiles} from
  '../../scripts/global-owner-debt-inventory/helpers.js';

const TEST_NAME = 'producer serializes the exact canonical emitted module closure';
const FIXTURE_ROOT_PREFIX = 'proof-cone-producer-';
const FIXTURE_DIRECTORIES = ['src', 'scripts', 'test', 'node_modules'];
const IMPORTER_PATH = 'src/importer.js';
const IMPORTER_SOURCE =
  'import "regular-package";\nimport "workspace-package";\n';
const REGULAR_MANIFEST_PATH =
  'node_modules/regular-package/package.json';
const REGULAR_MANIFEST =
  '{"name":"regular-package","main":"index.js"}\n';
const REGULAR_ENTRY_PATH = 'node_modules/regular-package/index.js';
const WORKSPACE_MANIFEST_PATH = 'workspace/package/package.json';
const WORKSPACE_MANIFEST =
  '{"name":"workspace-package","main":"index.js"}\n';
const WORKSPACE_ENTRY_PATH = 'workspace/package/index.js';
const WORKSPACE_ENTRY_SOURCE = 'import "../shared.js";\n';
const WORKSPACE_SHARED_PATH = 'workspace/shared.js';
const WORKSPACE_SHARED_SOURCE = 'import "./nested-link.js";\n';
const WORKSPACE_REAL_PATH = 'workspace/real/nested.js';
const WORKSPACE_LOGICAL_PATH = 'workspace/nested-link.js';
const WORKSPACE_UNRELATED_PATH = 'workspace/unrelated.js';
const DEFAULT_EXPORT_SOURCE = 'export default true;\n';
const NESTED_SYMLINK_TARGET = 'real/nested.js';
const PACKAGE_SYMLINK_TARGET = '../workspace/package';
const PACKAGE_SYMLINK_PATH = 'node_modules/workspace-package';
const EXPECTED_FOLLOWED_PATHS = [
  REGULAR_ENTRY_PATH,
  WORKSPACE_ENTRY_PATH,
  WORKSPACE_REAL_PATH,
  WORKSPACE_SHARED_PATH,
];

function writeFixture(root, relativePath, content = '') {
  const absolute = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, content);
}

test(TEST_NAME, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_ROOT_PREFIX));
  try {
    for (const directory of FIXTURE_DIRECTORIES) {
      fs.mkdirSync(path.join(root, directory), {recursive: true});
    }
    writeFixture(root, IMPORTER_PATH, IMPORTER_SOURCE);
    writeFixture(root, REGULAR_MANIFEST_PATH, REGULAR_MANIFEST);
    writeFixture(root, REGULAR_ENTRY_PATH, DEFAULT_EXPORT_SOURCE);
    writeFixture(root, WORKSPACE_MANIFEST_PATH, WORKSPACE_MANIFEST);
    writeFixture(root, WORKSPACE_ENTRY_PATH, WORKSPACE_ENTRY_SOURCE);
    writeFixture(root, WORKSPACE_SHARED_PATH, WORKSPACE_SHARED_SOURCE);
    writeFixture(root, WORKSPACE_REAL_PATH, DEFAULT_EXPORT_SOURCE);
    writeFixture(root, WORKSPACE_UNRELATED_PATH, DEFAULT_EXPORT_SOURCE);
    fs.symlinkSync(NESTED_SYMLINK_TARGET,
      path.join(root, WORKSPACE_LOGICAL_PATH));
    fs.symlinkSync(PACKAGE_SYMLINK_TARGET,
      path.join(root, PACKAGE_SYMLINK_PATH));

    const report = await refreshImportGraphReport(
      root, listJavaScriptFiles(root));
    const primaryPaths = Object.keys(report.fileDigests);
    const followedPaths = Object.keys(report.followedFileDigests);
    const modulePaths = Object.keys(report.degrees);

    assert.deepEqual(primaryPaths, [IMPORTER_PATH]);
    assert.deepEqual(followedPaths, EXPECTED_FOLLOWED_PATHS);
    assert.equal(report.followedFileDigests[WORKSPACE_LOGICAL_PATH], undefined);
    assert.equal(report.followedFileDigests[WORKSPACE_UNRELATED_PATH], undefined);
    assert.deepEqual(modulePaths, [...primaryPaths, ...followedPaths].sort());
    assert.equal(report.moduleCount, modulePaths.length);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
