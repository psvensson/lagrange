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
  "intent": {
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "workflow_tooling_owner",
    "boundary": "admin_test",
    "dominantReason": "test",
    "currentState": "testing admin attachment",
    "nextAction": "attach track"
  },
  "scope": {
    "writeScope": [],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": []
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "test"
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": ["test"]
  },
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
