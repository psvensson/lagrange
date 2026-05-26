import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';

const TEST_PACKAGE_VALIDATOR_PATH = 'work/packages/active-temp-validator-test.md';

test('work-tracker workflow admin validations', async () => {
  // Read real package content to keep schema validation perfectly happy
  const realContent = await fs.readFile('work/packages/active-20260526-workflow-admin-validator-enforcement.md', 'utf8');
  
  // 1. Test stale active reference validation
  const staleContent = realContent + '\nThis contains a reference to active-20260526-workflow-publish-transaction-hardening.md which is closed.\n';

  await fs.writeFile(TEST_PACKAGE_VALIDATOR_PATH, staleContent, 'utf8');

  try {
    const output = execSync(`node scripts/work-tracker.js validate --pre-impl ${TEST_PACKAGE_VALIDATOR_PATH}`, { encoding: 'utf8', stdio: 'pipe' });
    assert.match(output, /contains stale active reference/u, 'Should flag stale active reference');
  } catch (err) {
    assert.match(err.stdout || err.message, /contains stale active reference/u, 'Should flag stale active reference');
  } finally {
    await fs.unlink(TEST_PACKAGE_VALIDATOR_PATH).catch(() => {});
  }
});
