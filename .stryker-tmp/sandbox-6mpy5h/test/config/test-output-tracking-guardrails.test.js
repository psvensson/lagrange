// @ts-nocheck
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..', '..');

describe('test-output tracking guardrails', () => {
  it('git does not track generated test-output artifacts', () => {
    const tracked = execFileSync(
      'git',
      ['ls-files', 'test-output'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    )
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    assert.deepEqual(
      tracked,
      [],
      'Generated test-output artifacts must stay out of the git index',
    );
  });
});
