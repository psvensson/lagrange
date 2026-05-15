#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import process from 'node:process';

const COMMAND_GIT = 'git';
const COMMAND_NODE = process.execPath;
const SCRIPT_SPRINT_REMAINING = 'scripts/work-sprint-remaining.js';
const PUSH_COMMAND = 'push';
const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;
const PROCESS_ARG_USER_START = 2;
const STDIO_INHERIT = 'inherit';
const SCRIPT_FILE_NAME = 'work-sprint-push.js';
const PROCESS_ARG_SCRIPT_INDEX = 1;

function statusFromResult(result) {
  if (typeof result.status === 'number') {
    return result.status;
  }
  return result.error ? EXIT_FAILURE : EXIT_SUCCESS;
}

function runCommand(command, args, runner) {
  return runner(command, args, {stdio: STDIO_INHERIT});
}

function runSprintPush(args = [], runner = spawnSync) {
  const pushResult = runCommand(
    COMMAND_GIT,
    [PUSH_COMMAND, ...args],
    runner,
  );
  const pushStatus = statusFromResult(pushResult);
  if (pushStatus !== EXIT_SUCCESS) {
    return pushStatus;
  }
  const remainingResult = runCommand(
    COMMAND_NODE,
    [SCRIPT_SPRINT_REMAINING],
    runner,
  );
  return statusFromResult(remainingResult);
}

function isDirectRun() {
  return process.argv[PROCESS_ARG_SCRIPT_INDEX] &&
    process.argv[PROCESS_ARG_SCRIPT_INDEX].endsWith(SCRIPT_FILE_NAME);
}

if (isDirectRun()) {
  process.exit(runSprintPush(process.argv.slice(PROCESS_ARG_USER_START)));
}

export {
  runSprintPush,
};
