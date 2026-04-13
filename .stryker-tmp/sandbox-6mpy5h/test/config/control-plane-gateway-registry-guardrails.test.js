// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcRoot = path.join(__dirname, '..', '..', 'src');

const REGISTRY_READ_ALLOWLIST = new Set([
  'admin/admin-service-discovery.js',
  'admin/admin-websocket-api.js',
  'control-plane/control-plane-gateway-registry.js',
]);

const REGISTRY_REGISTER_ALLOWLIST = new Set([
  'bootstrap/shared/control-plane-setup.js',
  'control-plane/control-plane-gateway-registry.js',
]);

/**
 * Recursively collect source files under src/.
 * @param {string} dir
 * @return {string[]}
 */
function getSourceFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, {withFileTypes: true});

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Find matching call sites in src/.
 * @param {RegExp} pattern
 * @return {Array<{file: string, line: number}>}
 */
function findCallSites(pattern) {
  const matches = [];
  const sourceFiles = getSourceFiles(srcRoot);

  for (const filePath of sourceFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(srcRoot, filePath).split(path.sep).join('/');
    const regex = new RegExp(
      pattern.source,
      pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
    );

    let match;
    while ((match = regex.exec(source)) !== null) {
      const line = source.slice(0, match.index).split('\n').length;
      matches.push({file: relativePath, line});
      if (regex.lastIndex === match.index) {
        regex.lastIndex++;
      }
    }
  }

  return matches;
}

describe('control-plane gateway registry guardrails', () => {
  it('limits registry readers to admin-side consumers', () => {
    const matches = findCallSites(/getRegisteredControlPlaneSystemTableGateway\s*\(/);
    const violations = matches.filter((match) => {
      return !REGISTRY_READ_ALLOWLIST.has(match.file);
    });

    assert.equal(
      violations.length,
      0,
      'Unexpected control-plane gateway registry readers: ' +
        `${JSON.stringify(violations)}`,
    );

    assert.deepEqual(
      new Set(matches.map((match) => match.file)),
      REGISTRY_READ_ALLOWLIST,
      'Registry reader allowlist drifted',
    );
  });

  it('limits registry registration to bootstrap composition', () => {
    const matches = findCallSites(/registerControlPlaneSystemTableGateway\s*\(/);
    const violations = matches.filter((match) => {
      return !REGISTRY_REGISTER_ALLOWLIST.has(match.file);
    });

    assert.equal(
      violations.length,
      0,
      'Unexpected control-plane gateway registry registration: ' +
        `${JSON.stringify(violations)}`,
    );

    assert.deepEqual(
      new Set(matches.map((match) => match.file)),
      REGISTRY_REGISTER_ALLOWLIST,
      'Registry registration allowlist drifted',
    );
  });
});
