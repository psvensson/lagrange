import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execSync} from 'node:child_process';

const TEST_TEMP_DIR = path.join('test-output', 'tmp', 'work-tracker-current-blocker-test');
const CURRENT_BLOCKER_JSON = 'work/sprints/current-blocker.json';
const CURRENT_BLOCKER_MD = 'work/sprints/current-blocker.md';

describe('work-tracker current-blocker command', () => {
  it('refreshes current-blocker files successfully and matches structure', async () => {
    // Run the current-blocker refresh command
    const output = execSync('node scripts/work-tracker.js current-blocker --write', { encoding: 'utf8' });
    assert.match(output, /Updated /u);

    // Read the current-blocker.json
    const jsonContent = await fs.readFile(CURRENT_BLOCKER_JSON, 'utf8');
    const payload = JSON.parse(jsonContent);

    assert.ok(payload.schema);
    assert.ok(payload.package);
    assert.ok(payload.status);

    // Read the current-blocker.md
    const mdContent = await fs.readFile(CURRENT_BLOCKER_MD, 'utf8');
    assert.match(mdContent, /# Current Blocker/u);
  });
});
