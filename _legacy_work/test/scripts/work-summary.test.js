import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

test('work-summary CLI JSON output', () => {
  const output = execSync('node scripts/work-summary.js --json', { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  
  assert.ok(parsed.hasOwnProperty('activePackage'), 'Should contain activePackage field');
  assert.ok(parsed.hasOwnProperty('activeSprint'), 'Should contain activeSprint field');
  assert.ok(parsed.hasOwnProperty('nextCommandHint'), 'Should contain nextCommandHint field');
});

test('work-track-summary CLI JSON output', () => {
  const output = execSync('node scripts/work-track-summary.js --json', { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  
  assert.ok(Array.isArray(parsed.tracks), 'Should contain tracks array');
  assert.ok(Array.isArray(parsed.releases), 'Should contain releases array');
});
