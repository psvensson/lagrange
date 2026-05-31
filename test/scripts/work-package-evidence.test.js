import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const TEMP_PACKAGE_FILE = 'work/packages/active-temp-test-package.md';

test('work-package-evidence CLI flow', async () => {
  // Scaffold a dummy active package
  const packageContent = `<!-- work-package
{
  "schema": "work-package-v2",
  "status": "active",
  "execution": {
    "theoryLedgerRefs": ["some-ref"]
  }
}
-->
## Execution Evidence

- [ ] action: implementation; owner: workflow_tooling_owner; files-changed: none; validation: none; outcome: running.
- [ ] action: verification-fix; owner: workflow_tooling_owner; files-changed: none; validation: none; outcome: running.
`;

  await fs.writeFile(TEMP_PACKAGE_FILE, packageContent, 'utf8');

  try {
    // 1. Run work-package-evidence to update implementation action
    execSync('node scripts/work-package-evidence.js --action implementation --outcome validated --files "scripts/work-close.js" --validation "npm test" --package ' + TEMP_PACKAGE_FILE, { stdio: 'pipe' });

    let updatedContent = await fs.readFile(TEMP_PACKAGE_FILE, 'utf8');
    assert.match(updatedContent, /action: implementation/u);
    assert.match(updatedContent, /outcome: validated/u);
    assert.match(updatedContent, /files-changed: scripts\/work-close\.js/u);
    assert.match(updatedContent, /\[x\] action: implementation/u);
    assert.doesNotMatch(
      updatedContent,
      /action: implementation;.*parent revalidated focused proof: yes/u,
    );

    execSync('node scripts/work-package-evidence.js --action verification-fix --owner verifier_owner --outcome validated --files none --validation "npm test" --parent-revalidated --package ' + TEMP_PACKAGE_FILE, { stdio: 'pipe' });

    updatedContent = await fs.readFile(TEMP_PACKAGE_FILE, 'utf8');
    assert.match(updatedContent, /action: verification-fix; owner: verifier_owner/u);
    assert.match(
      updatedContent,
      /action: verification-fix;.*parent revalidated focused proof: yes/u,
    );

    // 2. Run work-package-ledger to mark no-ledger
    execSync('node scripts/work-package-ledger.js --no-ledger --package ' + TEMP_PACKAGE_FILE, { stdio: 'pipe' });

    updatedContent = await fs.readFile(TEMP_PACKAGE_FILE, 'utf8');
    assert.match(updatedContent, /theory-ledger:\s*not-needed/iu);
    assert.match(updatedContent, /"theoryLedgerRefs":\s*\[\]/u);

  } finally {
    // Cleanup
    await fs.unlink(TEMP_PACKAGE_FILE).catch(() => {});
  }
});
