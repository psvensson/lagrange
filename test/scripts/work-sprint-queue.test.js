import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DUMMY_SPRINT_FILE = 'work/sprints/active-temp-sprint-queue.md';
const DUMMY_TODO_PACKAGE = 'work/packages/todo-temp-package.md';
const DUMMY_ACTIVE_PACKAGE = 'work/packages/active-temp-package.md';

test('work-sprint-queue CLI flow', async () => {
  // 1. Scaffold dummy sprint
  const sprintContent = `## Package Queue

1. [Temp Package](../packages/todo-temp-package.md)
   - Lane: lightweight-maintenance
   - Purpose: testing activation
`;
  await fs.writeFile(DUMMY_SPRINT_FILE, sprintContent, 'utf8');

  // 2. Scaffold dummy todo package
  const packageContent = `<!-- work-package
{
  "schema": "work-package-v2",
  "status": "todo"
}
-->
`;
  await fs.writeFile(DUMMY_TODO_PACKAGE, packageContent, 'utf8');

  try {
    // Run activation command
    execSync('node scripts/work-sprint-queue.js --activate todo-temp-package --sprint ' + DUMMY_SPRINT_FILE, { stdio: 'pipe' });

    // Assert file renamed to active
    let activeExists = false;
    try {
      await fs.access(DUMMY_ACTIVE_PACKAGE);
      activeExists = true;
    } catch {}
    assert.strictEqual(activeExists, true, 'Active package file should exist');

    // Assert status updated to active in metadata
    const updatedPackageContent = await fs.readFile(DUMMY_ACTIVE_PACKAGE, 'utf8');
    assert.match(updatedPackageContent, /"status":\s*"active"/u);

    // Assert sprint updated target to active
    const updatedSprintContent = await fs.readFile(DUMMY_SPRINT_FILE, 'utf8');
    assert.match(updatedSprintContent, /active-temp-package\.md/u);

  } finally {
    // Cleanup
    await fs.unlink(DUMMY_SPRINT_FILE).catch(() => {});
    await fs.unlink(DUMMY_TODO_PACKAGE).catch(() => {});
    await fs.unlink(DUMMY_ACTIVE_PACKAGE).catch(() => {});
    // Force repair to clean up any references
    try {
      execSync('node scripts/work-tracker.js repair', { stdio: 'ignore' });
    } catch {}
  }
});
