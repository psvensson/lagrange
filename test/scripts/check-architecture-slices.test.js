import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  MAX_DOMAIN_FILE_LINES,
  extractDomainRows,
  lineCount,
  validateArchitectureSlices,
} from '../../scripts/check-architecture-slices.js';

const TEMP_PREFIX = 'architecture-slices-';
const INDEX_CONTENT = [
  '# Architecture Index',
  '',
  '<!-- architecture-domain-files:start -->',
  '- [Overview](overview.md) - Global architecture role.',
  '- [Runtime](runtime.md) - Runtime owner map.',
  '<!-- architecture-domain-files:end -->',
  '',
  '- [Support](support.md) - Support document.',
  '',
].join('\n');
const ROOT_POINTER = [
  '# Root',
  '',
  '[Architecture Index](architecture/INDEX.md)',
  '',
].join('\n');
const ARCHITECTURE_README = [
  '# Architecture Support Documents',
  '',
  '[Architecture Index](INDEX.md)',
  'Canonical repo-relative path: `architecture/INDEX.md`.',
  '',
].join('\n');
const STEERING_POINTER = [
  '# Architecture Steering Pointer',
  '',
  '../../architecture/INDEX.md',
  '',
].join('\n');
const LLM_README = [
  '# Steering LLM Pack',
  '',
  'Use `architecture/INDEX.md` for runtime work.',
  '',
].join('\n');
const AGENTS_POINTER = [
  '# AGENTS',
  '',
  'Read architecture/INDEX.md for architecture lookup.',
  '',
].join('\n');
const ROADMAP_POINTER = [
  '# Roadmap',
  '',
  '[Architecture Index](../../architecture/INDEX.md)',
  '',
].join('\n');
const DOMAIN_CONTENT = ['# Domain', '', 'content', ''].join('\n');

async function writeFile(rootDir, relativePath, content) {
  const absolutePath = path.join(rootDir, relativePath);
  await fs.mkdir(path.dirname(absolutePath), {recursive: true});
  await fs.writeFile(absolutePath, content, 'utf8');
}

async function createFixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  await writeFile(rootDir, 'architecture.md', ROOT_POINTER);
  await writeFile(rootDir, 'architecture/INDEX.md', INDEX_CONTENT);
  await writeFile(rootDir, 'architecture/README.md', ARCHITECTURE_README);
  await writeFile(rootDir, 'architecture/overview.md', DOMAIN_CONTENT);
  await writeFile(rootDir, 'architecture/runtime.md', DOMAIN_CONTENT);
  await writeFile(rootDir, 'architecture/support.md', DOMAIN_CONTENT);
  await writeFile(rootDir, 'docs/steering/architecture.md', STEERING_POINTER);
  await writeFile(rootDir, 'docs/steering/llm/README.md', LLM_README);
  await writeFile(rootDir, 'docs/steering/roadmap.md', ROADMAP_POINTER);
  await writeFile(rootDir, 'AGENTS.md', AGENTS_POINTER);
  return rootDir;
}

test('extractDomainRows reads one-line architecture index descriptions', (t) => {
  const {rows, errors} = extractDomainRows(INDEX_CONTENT);

  t.same(errors, []);
  t.equal(rows.length, 2);
  t.same(rows[0], {
    title: 'Overview',
    href: 'overview.md',
    description: 'Global architecture role.',
  });
  t.end();
});

test('lineCount ignores the final trailing newline', (t) => {
  t.equal(lineCount('one\ntwo\n'), 2);
  t.equal(lineCount('one\ntwo'), 2);
  t.end();
});

test('validateArchitectureSlices accepts focused domain files and links', async (t) => {
  const rootDir = await createFixture();
  const result = validateArchitectureSlices(rootDir);

  t.equal(result.ok, true);
  t.same(result.errors, []);
  t.equal(result.rows.length, 2);
});

test('validateArchitectureSlices rejects oversized domain files', async (t) => {
  const rootDir = await createFixture();
  const oversizedContent = Array.from(
    {length: MAX_DOMAIN_FILE_LINES + 1},
    (_value, index) => `line ${index}`,
  ).join('\n');
  await writeFile(rootDir, 'architecture/runtime.md', `${oversizedContent}\n`);

  const result = validateArchitectureSlices(rootDir);

  t.equal(result.ok, false);
  t.match(result.errors.join('\n'), /architecture\/runtime\.md/u);
});
