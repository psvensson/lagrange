import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcRoot = path.join(__dirname, '..', '..', 'src');

const SANCTIONED_APPLY_CALL_COUNTS = Object.freeze({
  'bootstrap/bootstrap-cache-hydration-applier.js': 1,
  'bootstrap/node-joining-service.js': 1,
  'bootstrap/phases/create-message-group-phase.js': 1,
  'bootstrap/phases/query-system-state-phase.js': 2,
  'cdc/cdc-integration-service.js': 1,
  'control-plane/control-plane-system-table-gateway.js': 2,
  'message-group/cdc-handler.js': 1,
});

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
 * Find direct applySystemTableChange invocations.
 * Matches only member-call usage (".applySystemTableChange("), not method declarations.
 * @return {Array<{file: string, line: number}>}
 */
function findApplyCallSites() {
  const matches = [];
  const sourceFiles = getSourceFiles(srcRoot);
  const pattern = /\.applySystemTableChange\s*\(/g;

  for (const filePath of sourceFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(srcRoot, filePath).split(path.sep).join('/');

    let match;
    while ((match = pattern.exec(source)) !== null) {
      const line = source.slice(0, match.index).split('\n').length;
      matches.push({file: relativePath, line});
      if (pattern.lastIndex === match.index) {
        pattern.lastIndex++;
      }
    }
  }

  return matches;
}

describe('system cache write callsite guardrails', () => {
  it('limits direct applySystemTableChange call sites to sanctioned owners', () => {
    const matches = findApplyCallSites();
    const allowedFiles = new Set(Object.keys(SANCTIONED_APPLY_CALL_COUNTS));
    const counts = new Map();
    const violations = [];

    for (const match of matches) {
      counts.set(match.file, (counts.get(match.file) || 0) + 1);
      if (!allowedFiles.has(match.file)) {
        violations.push(match);
      }
    }

    assert.equal(
      violations.length,
      0,
      `Unsanctioned applySystemTableChange call sites: ${JSON.stringify(violations)}`,
    );

    for (const [file, expectedCount] of Object.entries(SANCTIONED_APPLY_CALL_COUNTS)) {
      assert.equal(
        counts.get(file) || 0,
        expectedCount,
        `Expected ${expectedCount} direct applySystemTableChange calls in ${file}`,
      );
    }

    assert.equal(
      counts.size,
      Object.keys(SANCTIONED_APPLY_CALL_COUNTS).length,
      'Unexpected applySystemTableChange files: ' +
        `${JSON.stringify(Array.from(counts.keys()))}`,
    );
  });

  it('documents node-joining bootstrap exceptions near sanctioned writes', () => {
    const createMsgGroupPhasePath = path.join(
      srcRoot,
      'bootstrap',
      'phases',
      'create-message-group-phase.js',
    );
    const phaseSource = fs.readFileSync(
      createMsgGroupPhasePath,
      'utf8',
    );

    assert.match(
      phaseSource,
      /Bootstrap timing exception:/,
      'registerMessageGroupService callsite should document bootstrap timing exception',
    );

    const queryStatePhasePath = path.join(
      srcRoot,
      'bootstrap',
      'phases',
      'query-system-state-phase.js',
    );
    const querySource = fs.readFileSync(
      queryStatePhasePath,
      'utf8',
    );

    assert.match(
      querySource,
      /Bootstrap hydration exception:/,
      'hydrateSystemCacheFromSnapshots callsite should document bootstrap hydration exception',
    );
  });
});
