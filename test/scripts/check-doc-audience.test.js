import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import tap from 'tap';

import {runCheck} from '../../scripts/check-doc-audience.js';

const TEMP_PREFIX = 'doc-audience-';

async function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolutePath), {recursive: true});
  await fs.writeFile(absolutePath, content, 'utf8');
}

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  await writeFile(
    root,
    'README.md',
    '# Product\n\n[Agent portal](AGENTS.md)\n\n' +
      '[Contributing](CONTRIBUTING.md)\n',
  );
  await writeFile(root, 'AGENTS.md', '# Agent entry\n');
  await writeFile(
    root,
    'CONTRIBUTING.md',
    '---\naudience: development\n---\n\n# Contributing\n',
  );
  await writeFile(
    root,
    'docs/README.md',
    '---\naudience: human\n---\n\n# Docs\n\n' +
      '[Development](development/README.md)\n',
  );
  await writeFile(
    root,
    'docs/development/README.md',
    '---\naudience: development\n---\n\n# Development\n',
  );
  await writeFile(root, 'architecture/INDEX.md', '# Architecture\n');
  await writeFile(root, 'examples/README.md', '# Examples\n');
  return root;
}

tap.test('audience audit accepts the three isolated portal links', async (t) => {
  const root = await createFixture();
  const result = runCheck(root);

  t.equal(result.ok, true, result.message);
});

tap.test('audience audit rejects an inline steering link by itself',
  async (t) => {
    const root = await createFixture();
    await writeFile(
      root, 'architecture/leak.md',
      '# Leak\n\n[Steering](../docs/steering/system-guidelines.md)\n',
    );
    const result = runCheck(root);

    t.equal(result.ok, false);
    t.match(result.message, /agent steering or Solver state/u);
  });

tap.test('audience audit rejects a Solver link by itself', async (t) => {
  const root = await createFixture();
  await writeFile(
    root, 'architecture/leak.md',
    '# Leak\n\n[State](../solve/report/example.md)\n',
  );
  const result = runCheck(root);

  t.equal(result.ok, false);
  t.match(result.message, /agent steering or Solver state/u);
});

tap.test('audience audit rejects a reference-style steering link',
  async (t) => {
    const root = await createFixture();
    await writeFile(
      root, 'examples/leak.md',
      '# Leak\n\n[Rules][steering]\n\n' +
        '[steering]: ../docs/steering/system-guidelines.md\n',
    );
    const result = runCheck(root);

    t.equal(result.ok, false);
    t.match(result.message, /agent steering or Solver state/u);
  });

tap.test('audience audit rejects an HTML development link', async (t) => {
  const root = await createFixture();
  await writeFile(
    root, 'examples/leak.md',
    '# Leak\n\n<a href="../docs/development/README.md">Development</a>\n',
  );
  const result = runCheck(root);

  t.equal(result.ok, false);
  t.match(result.message, /development-only surface/u);
});

tap.test('audience audit rejects an autolink to agent steering', async (t) => {
  const root = await createFixture();
  await writeFile(
    root, 'examples/leak.md',
    '# Leak\n\n<../docs/steering/system-guidelines.md>\n',
  );
  const result = runCheck(root);

  t.equal(result.ok, false);
  t.match(result.message, /agent steering or Solver state/u);
});

tap.test('audience audit rejects an accidental development link',
  async (t) => {
    const root = await createFixture();
    await writeFile(
      root, 'examples/leak.md',
      '# Leak\n\n[Development](../docs/development/README.md)\n',
    );
    const result = runCheck(root);

    t.equal(result.ok, false);
    t.match(result.message, /development-only surface/u);
  });

tap.test('audience audit separates an inline link title from its destination',
  async (t) => {
    const root = await createFixture();
    await writeFile(
      root, 'examples/leak.md',
      '# Leak\n\n' +
        '[Development](../docs/development/README.md "internal")\n',
    );
    const result = runCheck(root);

    t.equal(result.ok, false);
    t.match(result.message, /development-only surface/u);
  });

tap.test('audience audit rejects an accidental agent entry link',
  async (t) => {
    const root = await createFixture();
    await writeFile(
      root, 'examples/leak.md',
      '# Leak\n\n[Agents](../AGENTS.md)\n',
    );
    const result = runCheck(root);

    t.equal(result.ok, false);
    t.match(result.message, /only README\.md may link AGENTS\.md/u);
  });

tap.test('audience audit rejects embedded Solver prose by itself',
  async (t) => {
    const root = await createFixture();
    await writeFile(
      root, 'architecture/leak.md',
      '# Leak\n\n`node scripts/solve.js next --id example`\n',
    );
    const result = runCheck(root);

    t.equal(result.ok, false);
    t.match(result.message, /Solver\/Quest workflow mechanics/u);
  });

tap.test('audience audit rejects the relocated root product roadmap', async (t) => {
  const root = await createFixture();
  await writeFile(root, 'product-roadmap.md', '# Product roadmap\n');
  const result = runCheck(root);

  t.equal(result.ok, false);
  t.match(result.message, /product-roadmap\.md: relocated path reappeared/u);
});
