import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  documentClass,
  localLinkTarget,
  validateDocumentationCurrentState,
} from '../../scripts/check-documentation-current-state.js';

const TEMP_PREFIX = 'documentation-current-state-';
const CURRENT_DOC = [
  '---',
  'audience: human',
  '---',
  '',
  '# Operations',
  '',
  '[Architecture](../architecture/overview.md)',
  '',
  'Implementation: `src/runtime/current-owner.js`.',
  '',
].join('\n');

async function writeFile(rootDir, relativePath, content) {
  const absolutePath = path.join(rootDir, relativePath);
  await fs.mkdir(path.dirname(absolutePath), {recursive: true});
  await fs.writeFile(absolutePath, content, 'utf8');
}

async function createFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  await writeFile(rootDir, 'docs/operations.md', CURRENT_DOC);
  await writeFile(rootDir, 'architecture/overview.md', '# Overview\n');
  await writeFile(rootDir, 'src/runtime/current-owner.js', 'export {};\n');
  await writeFile(rootDir, 'roadmap.md', '# Roadmap\n\n## Future Directions\n');
  await writeFile(
    rootDir,
    'solve/changes/old/attempt.md',
    '# Historical attempt\n\n[Missing](missing.md)\n',
  );
  await writeFile(
    rootDir,
    'solve/theory-ledger.md',
    '# Theory ledger\n\nHistorical source: `src/runtime/retired-owner.js`.\n',
  );
  return rootDir;
}

test('documentClass derives stable lifecycle classes from repository zones', (t) => {
  t.equal(documentClass('docs/operations.md', CURRENT_DOC), 'current');
  t.equal(documentClass('roadmap.md', '# Roadmap\n'), 'planning');
  t.equal(documentClass('docs/case-studies/example.md', '# Example\n'), 'evidence');
  t.equal(documentClass('models/protocol/README.md', '# Model\n'), 'evidence');
  t.equal(documentClass('solve/changes/quest/finding.md', '# Finding\n'), 'evidence');
  t.equal(documentClass('solve/theory-ledger.md', '# Theory ledger\n'), 'history');
  t.equal(documentClass('examples/demo/README.md', '# Demo\n'), 'current');
  t.equal(documentClass('docs/steering/rule.md', '# Rule\n'), 'steering');
  t.end();
});

test('localLinkTarget resolves relative and repository-root links', (t) => {
  t.equal(
    localLinkTarget('docs/operations.md', '../architecture/overview.md#owner'),
    'architecture/overview.md',
  );
  t.equal(
    localLinkTarget('docs/operations.md', '/architecture/overview.md'),
    'architecture/overview.md',
  );
  t.equal(localLinkTarget('docs/operations.md', 'https://example.com'), '');
  t.end();
});

test('current-state audit accepts current docs and excludes immutable evidence', async (t) => {
  const rootDir = await createFixture();
  await writeFile(
    rootDir,
    'docs/generated-state.md',
    '# Generated state\n\nLocal cache: `solve/state/`.\n',
  );
  const result = validateDocumentationCurrentState(rootDir);

  t.equal(result.ok, true);
  t.same(result.errors, []);
});

test('current-state audit rejects broken links and missing repository paths', async (t) => {
  const rootDir = await createFixture();
  await writeFile(
    rootDir,
    'docs/broken.md',
    [
      '# Broken',
      '',
      '[Missing](missing.md)',
      '',
      '`src/runtime/missing.js`',
      '',
      '`solve/state/../arbitrary-missing.md`',
      '',
      '`solve/state/../../src/arbitrary-missing.js`',
      '',
    ].join('\n'),
  );
  await writeFile(
    rootDir,
    'models/protocol/README.md',
    '# Model\n\n[Missing binding](missing.tla)\n',
  );
  const result = validateDocumentationCurrentState(rootDir);

  t.equal(result.ok, false);
  t.match(result.errors.join('\n'), /broken local link missing\.md/u);
  t.match(result.errors.join('\n'), /models\/protocol\/README\.md/u);
  t.match(result.errors.join('\n'), /referenced repository path is missing/u);
  t.match(result.errors.join('\n'), /solve\/arbitrary-missing\.md/u);
  t.match(result.errors.join('\n'), /src\/arbitrary-missing\.js/u);
});

test('current-state audit rejects references that escape the repository', async (t) => {
  const rootDir = await createFixture();
  await writeFile(
    rootDir,
    'docs/escaped.md',
    [
      '# Escaped',
      '',
      '[Outside](../../../etc/passwd)',
      '',
      '`solve/state/../../../../etc/passwd`',
      '',
    ].join('\n'),
  );
  const result = validateDocumentationCurrentState(rootDir);

  t.equal(result.ok, false);
  t.match(result.errors.join('\n'), /local link escapes repository/u);
  t.match(result.errors.join('\n'), /repository path escapes repository/u);
});

test('current-state audit rejects planning roles in current documentation', async (t) => {
  const rootDir = await createFixture();
  await writeFile(rootDir, 'architecture/runtime.md', '# Runtime\n\n## Migration Plan\n');
  await writeFile(
    rootDir,
    'docs/development/process.md',
    '# Process\n\n## Migration Plan\n',
  );
  await writeFile(
    rootDir,
    'examples/deployment/README.md',
    '# Deployment\n\n## Target Architecture\n',
  );
  await writeFile(
    rootDir,
    'src/runtime/README.md',
    '# Runtime\n\n## Rollout Sequence\n',
  );
  const result = validateDocumentationCurrentState(rootDir);

  t.equal(result.ok, false);
  t.match(result.errors.join('\n'), /planning\/history section in current document/u);
  t.match(result.errors.join('\n'), /docs\/development\/process\.md/u);
  t.match(result.errors.join('\n'), /examples\/deployment\/README\.md/u);
  t.match(result.errors.join('\n'), /src\/runtime\/README\.md/u);
});

test('current-state audit rejects unsupported class overrides', async (t) => {
  const rootDir = await createFixture();
  await writeFile(
    rootDir,
    'docs/invalid-class.md',
    '---\ndocumentClass: nonsense\n---\n\n# Invalid\n',
  );
  const result = validateDocumentationCurrentState(rootDir);

  t.equal(result.ok, false);
  t.match(result.errors.join('\n'), /unsupported documentClass nonsense/u);
});

test('current-state audit rejects obsolete narrative directories', async (t) => {
  const rootDir = await createFixture();
  await writeFile(rootDir, 'architecture/future/feature.md', '# Feature\n');
  await writeFile(rootDir, 'docs/reviews/snapshot.md', '# Snapshot\n');
  const result = validateDocumentationCurrentState(rootDir);

  t.equal(result.ok, false);
  t.match(result.errors.join('\n'), /architecture\/future\/feature\.md/u);
  t.match(result.errors.join('\n'), /docs\/reviews\/snapshot\.md/u);
});
