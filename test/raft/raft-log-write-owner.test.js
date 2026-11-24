import fs from 'node:fs';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';

const SOURCE_ROOT = path.resolve('src');
const CANONICAL_RAFT_RS_SQL_OWNER = path.resolve(
  'src',
  'raft',
  'raft-rs-durable-store-constants.js',
);
const LEGACY_RAFT_LOG_MUTATION_PATTERN =
  /\b(?:INSERT(?:\s+OR\s+REPLACE)?\s+INTO|UPDATE|DELETE\s+FROM)\s+_raft_log\b/i;
const RAFT_RS_LOG_MUTATION_PATTERN =
  /\b(?:INSERT(?:\s+OR\s+REPLACE)?\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:_raft_rs_log\b|\$\{RAFT_RS_TABLE\.LOG\})/i;

function collectJavaScriptFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
  return files;
}

test('no production module mutates the retired _raft_log table', async (t) => {
  const legacyWriters = collectJavaScriptFiles(SOURCE_ROOT)
    .filter((filePath) => LEGACY_RAFT_LOG_MUTATION_PATTERN.test(
      fs.readFileSync(filePath, 'utf8').replaceAll(/\s+/g, ' '),
    ));
  t.same(legacyWriters, [],
    'retired _raft_log table must have zero SQL mutation writers in src/');
});

test('RaftRsDurableStore constants own all _raft_rs_log SQL mutations',
  async (t) => {
    const owners = collectJavaScriptFiles(SOURCE_ROOT)
      .filter((filePath) => RAFT_RS_LOG_MUTATION_PATTERN.test(
        fs.readFileSync(filePath, 'utf8').replaceAll(/\s+/g, ' '),
      ));
    t.same(owners, [CANONICAL_RAFT_RS_SQL_OWNER],
      'no partition or service facade can introduce a second _raft_rs_log SQL writer');
  });
