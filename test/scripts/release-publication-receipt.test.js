import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  receiptVerdicts,
  verifyDockerHubOverview,
} from '../../scripts/checks/release-publication-receipt.js';

const SAMPLE_CHANGELOG = [
  '# Changelog',
  '',
  '## [0.2.7] — 2026-10-28',
  '',
  '### Fixed',
  '- 0.2.7 fix.',
  '',
  '## [0.2.6] — 2026-09-20',
  '',
  '### Added',
  '- 0.2.6 feature.',
  '',
  '## [0.2.5] — 2026-08-15',
  '',
  '### Added',
  '- 0.2.5 feature.',
].join('\n');

test('verifyDockerHubOverview succeeds with target version and no newer versions', () => {
  const content = [
    '# Docker Hub Overview',
    '',
    '### 0.2.6 — 2026-09-20',
    '',
    'Features of 0.2.6.',
    '',
    '### 0.2.5 — 2026-08-15',
    '',
    'Features of 0.2.5.',
  ].join('\n');

  const result = verifyDockerHubOverview({
    content,
    targetVersion: '0.2.6',
    changelogText: SAMPLE_CHANGELOG,
  });
  assert.equal(result.valid, true);
  assert.equal(result.version, '0.2.6');
});

test('verifyDockerHubOverview throws when file is empty or whitespace', () => {
  assert.throws(
    () => verifyDockerHubOverview({content: '', targetVersion: '0.2.6'}),
    /file is empty/u,
  );
  assert.throws(
    () => verifyDockerHubOverview({content: '   \n  ', targetVersion: '0.2.6'}),
    /file is empty/u,
  );
});

test('verifyDockerHubOverview throws when target version heading is missing', () => {
  const content = [
    '# Docker Hub Overview',
    '',
    '### 0.2.5 — 2026-08-15',
    '',
    'Features of 0.2.5.',
  ].join('\n');

  assert.throws(
    () => verifyDockerHubOverview({
      content,
      targetVersion: '0.2.6',
      changelogText: SAMPLE_CHANGELOG,
    }),
    /missing target version heading/u,
  );
});

test('verifyDockerHubOverview throws when overview leaks newer changelog version', () => {
  const content = [
    '# Docker Hub Overview',
    '',
    '### 0.2.7 — 2026-10-28',
    '',
    'Leaked 0.2.7 content.',
    '',
    '### 0.2.6 — 2026-09-20',
    '',
    'Features of 0.2.6.',
  ].join('\n');

  assert.throws(
    () => verifyDockerHubOverview({
      content,
      targetVersion: '0.2.6',
      changelogText: SAMPLE_CHANGELOG,
    }),
    /leaks newer version: 0\.2\.7/u,
  );
});

test('receiptVerdicts with dockerHubOverview option checks overview file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-test-'));
  const overviewFile = path.join(tmpDir, 'DOCKERHUB.md');
  fs.writeFileSync(
    overviewFile,
    '# Overview\n\n### 0.2.6\nValid target version.\n',
  );

  const verdicts = receiptVerdicts(undefined, {
    dockerHubOverview: overviewFile,
    targetVersion: '0.2.6',
  });
  const overviewRow = verdicts.rows.find((r) => r.name === 'dockerhub-overview');
  assert.ok(overviewRow, 'includes dockerhub-overview row');
  assert.equal(overviewRow.published, true);

  const failingVerdicts = receiptVerdicts(undefined, {
    dockerHubOverview: overviewFile,
    targetVersion: '0.9.9',
  });
  const failingRow = failingVerdicts.rows.find((r) => r.name === 'dockerhub-overview');
  assert.ok(failingRow);
  assert.equal(failingRow.published, false);
});
