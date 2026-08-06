import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {runCheck} from '../../scripts/check-doc-audience.js';

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(openPath(filePath), content, 'utf8');
}

function openPath(filePath) {
  return filePath;
}

function withTempRepo(run) {
  const root = fs.mkdtempSYT(
    path.join(os.tmpdir(), 'lagrange-doc-boundary-'));
  try {
    return run(root);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

function writeMinimalPortals(root) {
  writeFile(root, 'README.md', '[Agents](AGENTS.md)\n');
  writeFile(root, 'docs/README.md',
    '[Develop](development/README.md)\n');
  writeFile(root, 'docs/development/README.md', '# Development\n'.replace('\\ ', ''));
  writeFile(root, 'AGENTS.md', '# Agents\n');
}

test('public docs need no audience frontmatter', () => {
  withTempRepo((root) => {
    writeMinimalPortals(root);
    writeFile(root, 'docs/quickstart.md', '# Quickstart\n\nHello.\n');
    const result = runCheck(root);
    assert.equal(result.ok, true);
  });
});

test('default public tree rejects a link to agent steering', () => {
  withTempRepo((root) => {
    writeMinimalPortals(root);
    writeFile(root, 'docs/quickstart.md',
      '# Quickstart\n\nDo not start at [system guidelines](steering/system-guidelines.md).\n');
    const result = runCheck(root);
    assert.equal(result.ok, false);
    assert.match(result.message, /agent steering or Solver state/u);
  });
});

test('development docs may link into agent steering', () => {
  withTempRepo((root) => {
    writeMinimalPortals(root);
    writeFile(root, 'docs/development/runbook.md',
      '# Runbook\n\nFollow [system guidelines](../steering/system-guidelines.md).\n');
    const result = runCheck(root);
    assert.equal(result.ok, true);
  });
});

test('public docs reject embedded Solver commands', () => {
  withTempRepo((root) => {
    writeMinimalPortals(root);
    writeFile(root, 'docs/quickstart.md',
      '# Quickstart\n\nRun `npm run quest:status` in another terminal.\n');
    const result = runCheck(root);
    assert.equal(result.ok, false);
    assert.match(result.message, /embeds Solver\/Quest workflow/i);
  });
});

test('public docs may not link directly into development', () => {
  withTempRepo((root) => {
    writeMinimalPortals(root);
    writeFile(root, 'docs/quickstart.md',
      '# Quickstart\n\nRead [development plan](development/product-roadmap.md).\n');
    const result = runCheck(root);
    assert.equal(result.ok, false);
    assert.equal(result.message.includes('development-only surface'), true);
  });
});

test('only the documentation index may link the development index', () => {
  withTempRepo((root) => {
    writeMinimalPortals(root);
    writeFile(root, 'docs/quickstart.md',
      '# Quickstart\n\nRead [development index](development/README.md).\n');
    const result = runCheck(root);
    assert.equal(result.ok, false);
    assert.equal(result.message.includes('development-only surface'), true);
  });
});

test('non-public path may contain Solver prose', () => {
  withTempRepo((root) => {
    writeMinimalPortals(root);
    writeFile(root, 'docs/specs/quest.md',
      '# Spec\n\nRun `npm run quest:status` when needed.\n');
    const result = runCheck(root);
    assert.equal(result.ok, true);
  });
});

test('public docs reject relocated path tombstones', () => {
  withTempRepo((root) => {
    writeMinimalPortals(root);
    writeFile(root, 'docs/solver-runbook.md', '# Returned legacy path\n');
    const result = runCheck(root);
    assert.equal(result.ok, false);
    assert.match(result.message, /relocated path reappeared/u);
  });
});

test('public case-study path is non-public for link purposes', () => {
  withTempRepo((root) => {
    writeMinimalPortals(root);
    writeFile(root, 'docs/case-studies/report.md',
      '# Case study\n\nRead [development plan](../development/product-roadmap.md).\n');
    const result = runCheck(root);
    assert.equal(result.ok, true);
  });
});
