import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, it} from 'node:test';

import {
  PACKAGE_NAME,
  buildAndVerifyNpmPackage,
  inspectTarball,
} from '../../scripts/release-npm-package.js';

const PACKAGE_TEST_TIMEOUT_MS = 180000;
const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 25 * 1024 * 1024;
const MAX_PACKAGE_ENTRIES = 2000;
const REQUIRED_PACKAGE_PATHS = Object.freeze([
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'package.json',
  'src/admin/static/playback-viewer.html',
  'src/admin/static/test-run-dashboard.html',
  'src/cli/bin/lagrange-admin.js',
  'src/public-api.js',
  'src/sea-entry.js',
]);
const FORBIDDEN_PACKAGE_PREFIXES = Object.freeze([
  '.github/',
  'architecture/',
  'data/',
  'dist/',
  'docs/',
  'node_modules/',
  'scripts/',
  'solve/',
  'src/test-helpers/',
  'test/',
]);

describe('lagrange-server npm distribution', () => {
  it('packs one commit-bound artifact and proves its installed API and CLIs', {
    timeout: PACKAGE_TEST_TIMEOUT_MS,
  }, async (t) => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'lagrange-server-npm-'));
    t.after(async () => rm(temporaryRoot, {recursive: true, force: true}));

    const packed = await buildAndVerifyNpmPackage({
      outputDirectory: temporaryRoot,
    });
    assert.equal(packed.name, PACKAGE_NAME);
    assert.ok(packed.size <= MAX_PACKAGE_BYTES);
    assert.ok(packed.unpackedSize <= MAX_UNPACKED_BYTES);
    assert.ok(packed.entryCount <= MAX_PACKAGE_ENTRIES);

    const packedPaths = new Set(packed.files.map(({path}) => path));
    for (const requiredPath of REQUIRED_PACKAGE_PATHS) {
      assert.ok(packedPaths.has(requiredPath), `missing ${requiredPath}`);
    }
    for (const packedPath of packedPaths) {
      assert.equal(
        FORBIDDEN_PACKAGE_PREFIXES.some(
          (prefix) => packedPath.startsWith(prefix),
        ),
        false,
        `development-only path leaked into npm package: ${packedPath}`,
      );
    }

    const candidate = await inspectTarball(packed.tarballPath);
    assert.equal(candidate.manifest.name, PACKAGE_NAME);
    assert.equal(candidate.manifest.version, packed.version);
    assert.equal(candidate.manifest.gitHead, packed.gitHead);
    assert.equal(candidate.integrity, packed.integrity);
  });

  it('keeps the repository playback copy equal to the packaged runtime asset',
    async () => {
      const [packagedViewer, harnessViewer] = await Promise.all([
        readFile(join(
          import.meta.dirname,
          '../../src/admin/static/playback-viewer.html',
        )),
        readFile(join(
          import.meta.dirname,
          '../distributed/harness/playback-viewer.html',
        )),
      ]);
      assert.deepEqual(harnessViewer, packagedViewer);
    });
});
