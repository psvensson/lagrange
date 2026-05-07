import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const NODE_BIN = process.execPath;
const SCRIPT_PATH = 'scripts/analyze-topology-convergence.js';
const ARG_HELP = '--help';
const ENCODING_UTF8 = 'utf8';
const HELP_USAGE_PATTERN = /Usage: node scripts\/analyze-topology-convergence\.js/u;

describe('analyze-topology-convergence CLI', () => {
  it('prints help text', () => {
    const output = execFileSync(
      NODE_BIN,
      [SCRIPT_PATH, ARG_HELP],
      {encoding: ENCODING_UTF8},
    );

    assert.match(output, HELP_USAGE_PATTERN);
  });
});
