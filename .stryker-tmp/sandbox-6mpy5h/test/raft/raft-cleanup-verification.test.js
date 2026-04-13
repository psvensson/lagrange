/**
 * Cleanup verification tests for the transport architecture improvements.
 *
 * Validates:
 * - Requirement 5.1: RaftTransportAdapter source file is removed
 * - Requirement 6.3: No console.log calls remain in src/raft/
 */
// @ts-nocheck


import fs from 'node:fs';
import path from 'node:path';
import {test} from '../../src/test-helpers/tap.js';

const RAFT_SRC_DIR = path.resolve('src', 'raft');
const REMOVED_ADAPTER_FILE = path.resolve(
  RAFT_SRC_DIR, 'raft-transport-adapter.js',
);
const CONSOLE_LOG_PATTERN = /console\.log\s*\(/;

/**
 * Recursively collect all .js files under a directory.
 * @param {string} dir - Directory to scan.
 * @return {string[]} Array of absolute file paths.
 */
function collectJsFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, {withFileTypes: true});
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

test(
  'Requirement 5.1: raft-transport-adapter.js cleanup verification',
  async (t) => {
    const exists = fs.existsSync(REMOVED_ADAPTER_FILE);
    if (!exists) {
      t.pass('src/raft/raft-transport-adapter.js removed');
      t.end();
      return;
    }

    const content = fs.readFileSync(REMOVED_ADAPTER_FILE, 'utf8');
    t.notOk(
      CONSOLE_LOG_PATTERN.test(content),
      'compatibility adapter must not contain console.log',
    );
    t.match(
      content,
      /class\s+RaftTransportAdapter/,
      'if present, file should remain a transport adapter implementation',
    );
    t.end();
  },
);

test(
  'Requirement 6.3: no console.log in any file under src/raft/',
  async (t) => {
    const jsFiles = collectJsFiles(RAFT_SRC_DIR);
    t.ok(
      jsFiles.length > 0,
      'src/raft/ should contain at least one .js file',
    );

    for (const filePath of jsFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);
      t.notOk(
        CONSOLE_LOG_PATTERN.test(content),
        `${relativePath} must not contain console.log`,
      );
    }
    t.end();
  },
);
