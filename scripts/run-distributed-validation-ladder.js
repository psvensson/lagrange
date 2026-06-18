#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {pathToFileURL} from 'node:url';

const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_5I8PB = 'Expected a non-empty shell command after ';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_UNKNOWN_ARGUMENT = 'Unknown argument: ';
const LOCAL_STR_1PLYW = '[';
const LOCAL_STR_SPACE = ' ';
const LOCAL_STR_SLASH = '/';
const LOCAL_STR_10CT0 = '] ';
const LOCAL_STR_JQB2A = 'Validation ladder stopped at ';
const LOCAL_STR_STAGE = ' stage.';
const LOCAL_STR_COMMAND = 'Command: ';
const LOCAL_STR_FAILURE = 'Failure: ';
const LOCAL_STR_1FCL4 = 'Stop here and fix the owner-path boundary before the middle distributed layer.';
const LOCAL_STR_VFPMM = 'Stop here and fix the boundary-transition scenario before another full 7-node rerun.';
const LOCAL_STR_1WXU5 = 'The ladder requires at least one --owner, one --boundary, and one --checkpoint command.';
const LOCAL_NUM_TWO = 2;
const LOCAL_STR_R6C2Y = 'Validation ladder completed successfully.';

const OPTION = Object.freeze({
  OWNER: '--owner',
  BOUNDARY: '--boundary',
  CHECKPOINT: '--checkpoint',
  HELP: '--help',
});
const STAGE_KIND = Object.freeze({
  OWNER: 'owner',
  BOUNDARY: 'boundary',
  CHECKPOINT: 'checkpoint',
});
const EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  FAILURE: 1,
  USAGE: 2,
});
const EMPTY = '';
const NEWLINE = '\n';
const README_PATH = 'test/distributed/README.local.md';
const TRIAGE_HINT_LINES = Object.freeze([
  'Artifact-first triage is mandatory after a distributed checkpoint failure.',
  'Read triage-summary.md and triage-summary.json before sampling raw node logs.',
  'See ' + README_PATH + ' for the required failure-order procedure.',
]);
const USAGE_LINES = Object.freeze([
  'Usage:',
  '  node scripts/run-distributed-validation-ladder.js \\',
  '    --owner "<targeted owner test command>" [--owner "<targeted owner test command>"] \\',
  '    --boundary "<boundary-transition scenario command>" [--boundary "<boundary-transition scenario command>"] \\',
  '    --checkpoint "<7-node checkpoint command>" [--checkpoint "<7-node checkpoint command>"]',
  EMPTY,
  'Required order is enforced:',
  '  targeted owner tests -> boundary-transition scenarios -> checkpoint distributed reruns',
]);

function requireCommand(option, value) {
  if (typeof value !== LOCAL_STR_STRING || value.trim().length === LOCAL_NUM_ZERO) {
    throw new Error(LOCAL_STR_5I8PB + option);
  }
  return value.trim();
}

function parseArgs(argv) {
  const owners = [];
  const boundaries = [];
  const checkpoints = [];
  for (let index = LOCAL_NUM_ZERO; index < argv.length; index += LOCAL_NUM_ONE) {
    const arg = argv[index];
    if (arg === OPTION.HELP) {
      return {owners, boundaries, checkpoints, help: true};
    }
    if (arg === OPTION.OWNER || arg === OPTION.BOUNDARY || arg === OPTION.CHECKPOINT) {
      const command = requireCommand(arg, argv[index + 1]);
      if (arg === OPTION.OWNER) {
        owners.push(command);
      } else if (arg === OPTION.BOUNDARY) {
        boundaries.push(command);
      } else {
        checkpoints.push(command);
      }
      index += LOCAL_NUM_ONE;
      continue;
    }
    throw new Error(LOCAL_STR_UNKNOWN_ARGUMENT + arg);
  }
  return {owners, boundaries, checkpoints, help: false};
}

function printLines(lines) {
  process.stdout.write(lines.join(NEWLINE) + NEWLINE);
}

function printStageHeader(stageKind, index, total, command) {
  printLines([
    EMPTY,
    LOCAL_STR_1PLYW + stageKind + LOCAL_STR_SPACE + index + LOCAL_STR_SLASH +
      total + LOCAL_STR_10CT0 + command,
  ]);
}

function runCommand(command) {
  const result = spawnSync(command, {
    cwd: process.cwd(),
    env: process.env,
    shell: true,
    stdio: 'inherit',
  });
  if (result.error) {
    return {
      ok: false,
      exitCode: EXIT_CODE.FAILURE,
      signal: EMPTY,
      errorMessage: result.error.message,
    };
  }
  return {
    ok: result.status === EXIT_CODE.SUCCESS,
    exitCode: Number.isInteger(result.status) ? result.status : EXIT_CODE.FAILURE,
    signal: typeof result.signal === LOCAL_STR_STRING ? result.signal : EMPTY,
    errorMessage: EMPTY,
  };
}

function runStage(stageKind, commands) {
  for (let index = LOCAL_NUM_ZERO; index < commands.length; index += LOCAL_NUM_ONE) {
    const command = commands[index];
    printStageHeader(stageKind, index + LOCAL_NUM_ONE, commands.length, command);
    const result = runCommand(command);
    if (!result.ok) {
      return {
        ok: false,
        stageKind,
        command,
        exitCode: result.exitCode,
        signal: result.signal,
        errorMessage: result.errorMessage,
      };
    }
  }
  return {ok: true};
}

function printFailure(failure) {
  const detail = failure.errorMessage.length > 0 ?
    failure.errorMessage :
    (failure.signal.length > 0 ?
      'terminated by signal ' + failure.signal :
      'exit code ' + failure.exitCode);
  printLines([
    EMPTY,
    LOCAL_STR_JQB2A + failure.stageKind + LOCAL_STR_STAGE,
    LOCAL_STR_COMMAND + failure.command,
    LOCAL_STR_FAILURE + detail,
  ]);
  if (failure.stageKind === STAGE_KIND.OWNER) {
    printLines([
      LOCAL_STR_1FCL4,
    ]);
  } else if (failure.stageKind === STAGE_KIND.BOUNDARY) {
    printLines([
      LOCAL_STR_VFPMM,
    ]);
  } else {
    printLines(TRIAGE_HINT_LINES);
  }
}

function validateStages(parsed) {
  if (parsed.owners.length === LOCAL_NUM_ZERO ||
      parsed.boundaries.length === LOCAL_NUM_ZERO ||
      parsed.checkpoints.length === LOCAL_NUM_ZERO) {
    throw new Error(
      LOCAL_STR_1WXU5,
    );
  }
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(LOCAL_NUM_TWO));
    if (parsed.help) {
      printLines(USAGE_LINES);
      process.exit(EXIT_CODE.SUCCESS);
    }
    validateStages(parsed);
  } catch (error) {
    printLines([error.message, EMPTY, ...USAGE_LINES]);
    process.exit(EXIT_CODE.USAGE);
  }

  const stages = [
    [STAGE_KIND.OWNER, parsed.owners],
    [STAGE_KIND.BOUNDARY, parsed.boundaries],
    [STAGE_KIND.CHECKPOINT, parsed.checkpoints],
  ];
  for (const [stageKind, commands] of stages) {
    const result = runStage(stageKind, commands);
    if (!result.ok) {
      printFailure(result);
      process.exit(EXIT_CODE.FAILURE);
    }
  }

  printLines([
    EMPTY,
    LOCAL_STR_R6C2Y,
  ]);
}

const isDirectExecution = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main();
}

export {
  EXIT_CODE,
  OPTION,
  STAGE_KIND,
  TRIAGE_HINT_LINES,
  USAGE_LINES,
  parseArgs,
  runCommand,
  runStage,
  validateStages,
};
