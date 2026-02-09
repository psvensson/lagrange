/**
 * Unit test to verify no eslint-disable comments exist in test files.
 *
 * This test ensures that the service-lifecycle.property.test.js file
 * does not contain any eslint-disable comments, as per the project's
 * code quality requirements.
 *
 * **Validates: Requirements 2.1**
 */

import {test} from '../../src/test-helpers/tap.js';
import {readFileSync} from 'fs';
import {join} from 'path';

test('service-lifecycle.property.test.js has no eslint-disable comments', async (t) => {
  const filePath = join(
    process.cwd(),
    'test/bootstrap/service-lifecycle.property.test.js',
  );

  const content = readFileSync(filePath, 'utf8');

  // Check for various forms of eslint-disable comments
  const eslintDisablePatterns = [
    /eslint-disable/,
    /eslint-disable-next-line/,
    /eslint-disable-line/,
  ];

  for (const pattern of eslintDisablePatterns) {
    const match = content.match(pattern);
    t.equal(
      match,
      null,
      `file should not contain ${pattern.source}`,
    );
  }
});
