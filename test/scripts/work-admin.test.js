import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';

const TEMP_PACKAGE_FILE = 'work/packages/active-temp-admin-test-package.md';

test('work-admin CLI intents', async () => {
  // Scaffold dummy package
  const packageContent = `<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "execution": {
    "theoryLedgerRefs": []
  }
}
-->
`;
  await fs.writeFile(TEMP_PACKAGE_FILE, packageContent, 'utf8');

  try {
    // 1. Attach a track
    execSync('node scripts/work-admin.js --attach-track --package ' + TEMP_PACKAGE_FILE + ' --track "some-track"', { stdio: 'pipe' });

    const updated = await fs.readFile(TEMP_PACKAGE_FILE, 'utf8');
    assert.match(updated, /"some-track"/u, 'Should contain attached track');

  } finally {
    await fs.unlink(TEMP_PACKAGE_FILE).catch(() => {});
  }
});
