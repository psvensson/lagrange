import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import process from 'node:process';
import {test} from '../../src/test-helpers/tap.js';
import {
  EXIT_CODE,
  OPTION,
  STAGE_KIND,
  parseArgs,
  validateStages,
} from '../../scripts/run-distributed-validation-ladder.js';

const LADDER_SCRIPT_PATH = resolve('scripts/run-distributed-validation-ladder.js');
const NODE_EXECUTABLE = process.execPath;
const OWNER_PASS_TEXT = 'owner-pass';
const BOUNDARY_PASS_TEXT = 'boundary-pass';
const BOUNDARY_FAIL_TEXT = 'boundary-fail';
const CHECKPOINT_MARKER_TEXT = 'checkpoint-marker';

function buildStdoutCommand(text) {
  return 'node -e ' + JSON.stringify(
    'process.stdout.write(' + JSON.stringify(text + '\n') + ')',
  );
}

function buildStderrExitCommand(text, exitCode) {
  return 'node -e ' + JSON.stringify(
    'process.stderr.write(' + JSON.stringify(text + '\n') + '); process.exit(' + exitCode + ')',
  );
}

const OWNER_PASS_COMMAND = buildStdoutCommand(OWNER_PASS_TEXT);
const BOUNDARY_PASS_COMMAND = buildStdoutCommand(BOUNDARY_PASS_TEXT);
const BOUNDARY_FAIL_COMMAND = buildStderrExitCommand(BOUNDARY_FAIL_TEXT, 3);
const CHECKPOINT_COMMAND = buildStdoutCommand(CHECKPOINT_MARKER_TEXT);

function runCli(args) {
  return spawnSync(NODE_EXECUTABLE, [LADDER_SCRIPT_PATH, ...args], {
    encoding: 'utf8',
  });
}

test('distributed validation ladder parses ordered owner, boundary, and checkpoint commands', async (t) => {
  const parsed = parseArgs([
    OPTION.OWNER,
    OWNER_PASS_COMMAND,
    OPTION.BOUNDARY,
    BOUNDARY_PASS_COMMAND,
    OPTION.CHECKPOINT,
    CHECKPOINT_COMMAND,
  ]);

  t.same(parsed, {
    owners: [OWNER_PASS_COMMAND],
    boundaries: [BOUNDARY_PASS_COMMAND],
    checkpoints: [CHECKPOINT_COMMAND],
    help: false,
  });
});

test('distributed validation ladder rejects incomplete stage definitions', async (t) => {
  t.throws(() => validateStages({
    owners: [OWNER_PASS_COMMAND],
    boundaries: [BOUNDARY_PASS_COMMAND],
    checkpoints: [],
  }), /requires at least one --owner, one --boundary, and one --checkpoint/);
});

test('distributed validation ladder stops at a failed boundary stage before checkpoint execution', async (t) => {
  const result = runCli([
    OPTION.OWNER,
    OWNER_PASS_COMMAND,
    OPTION.BOUNDARY,
    BOUNDARY_FAIL_COMMAND,
    OPTION.CHECKPOINT,
    CHECKPOINT_COMMAND,
  ]);
  const combinedOutput = (result.stdout || '') + (result.stderr || '');

  t.equal(result.status, EXIT_CODE.FAILURE);
  t.match(combinedOutput, /Validation ladder stopped at boundary stage/);
  t.match(combinedOutput, new RegExp(BOUNDARY_FAIL_TEXT));
  t.notMatch(combinedOutput, new RegExp(CHECKPOINT_MARKER_TEXT));
  t.match(combinedOutput, /Stop here and fix the boundary-transition scenario before another full 7-node rerun/);
});

test('distributed validation ladder completes when all stages pass', async (t) => {
  const result = runCli([
    OPTION.OWNER,
    OWNER_PASS_COMMAND,
    OPTION.BOUNDARY,
    BOUNDARY_PASS_COMMAND,
    OPTION.CHECKPOINT,
    CHECKPOINT_COMMAND,
  ]);
  const combinedOutput = (result.stdout || '') + (result.stderr || '');

  t.equal(result.status, EXIT_CODE.SUCCESS);
  t.match(combinedOutput, new RegExp(OWNER_PASS_TEXT));
  t.match(combinedOutput, new RegExp(BOUNDARY_PASS_TEXT));
  t.match(combinedOutput, new RegExp(CHECKPOINT_MARKER_TEXT));
  t.match(combinedOutput, /Validation ladder completed successfully/);
  t.equal(STAGE_KIND.CHECKPOINT, 'checkpoint');
});
