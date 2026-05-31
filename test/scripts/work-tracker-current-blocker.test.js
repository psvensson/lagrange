import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execSync} from 'node:child_process';

const CURRENT_BLOCKER_JSON = 'work/sprints/current-blocker.json';

describe('work-tracker current-blocker command', () => {
  it('refreshes canonical current-blocker json successfully and matches structure',
    async () => {
    // Run the current-blocker refresh command
    const output = execSync('node scripts/work-tracker.js current-blocker --write', { encoding: 'utf8' });
    assert.match(output, /Updated /u);
    assert.match(output, /current-blocker\.json/u);
    assert.doesNotMatch(output, /current-blocker\.md/u);

    // Read the current-blocker.json
    const jsonContent = await fs.readFile(CURRENT_BLOCKER_JSON, 'utf8');
    const payload = JSON.parse(jsonContent);

    assert.ok(payload.schema);
    assert.ok(payload.package);
    assert.ok(payload.status);
  });

  it('renders markdown on demand without making it part of repair output', () => {
    const output = execSync('node scripts/work-tracker.js current-blocker --markdown', { encoding: 'utf8' });
    assert.match(output, /# Current Blocker/u);
  });
});
