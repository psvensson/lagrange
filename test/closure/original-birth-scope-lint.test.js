import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {ESLint} from 'eslint';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = [
  'src/node/service-row-incarnation.js',
  'src/partition/partition-service-row-owner.js',
  'src/message-group/message-group-service-row-owner.js',
  'test/partition/partition-registration-exact-birth.test.js',
  'test/partition/partition-registration-readback-controls.test.js',
  'test/message-group/message-group-registration-exact-birth.test.js',
  'test/raft/raft-rs-backend/lifecycle-retirement-census.js',
  'test/raft/raft-rs-backend/lifecycle-retirement-census.test.js',
  'test/raft/raft-rs-backend/lifecycle-registry-runtime-generation.test.js',
  'test/closure/original-birth-scope-lint.test.js',
];

test('birth identity and lifecycle census satisfy repository ESLint rules', async () => {
  const eslint = new ESLint({cwd: root});
  const results = await eslint.lintFiles(files);
  assert.equal(results.length, files.length, 'every named source is checked');
  const diagnostics = results.flatMap((result) => result.messages.map((message) => ({
    file: path.relative(root, result.filePath),
    line: message.line,
    column: message.column,
    rule: message.ruleId,
    severity: message.severity,
    message: message.message,
  })));
  assert.deepEqual(diagnostics, [], JSON.stringify(diagnostics));
});
