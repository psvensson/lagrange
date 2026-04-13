#!/usr/bin/env node
// @ts-nocheck

import {spawnSync} from 'node:child_process';
import {
  EXIT_CODE,
  GUIDELINE_STAGED,
  SCRIPT_TEXT,
} from './guideline-check-constants.js';

function runGit(args) {
  return spawnSync(GUIDELINE_STAGED.GIT_BIN, args, {
    encoding: SCRIPT_TEXT.ENCODING_UTF8,
    stdio: GUIDELINE_STAGED.STDIO_GIT,
  });
}

function getStagedFiles() {
  const gitResult = runGit(GUIDELINE_STAGED.DIFF_ARGS);
  if (gitResult.status !== 0) {
    const errorMessage = gitResult.stderr?.trim() ||
      GUIDELINE_STAGED.GIT_READ_FAILED;
    throw new Error(errorMessage);
  }

  return gitResult.stdout
    .split(SCRIPT_TEXT.NEWLINE)
    .map((line) => line.trim())
    .filter(Boolean);
}

function runGuidelineCheck(files) {
  return spawnSync(
    process.execPath,
    [GUIDELINE_STAGED.CHECK_SCRIPT, ...files],
    {stdio: GUIDELINE_STAGED.STDIO_CHECK},
  );
}

function main() {
  let files;
  try {
    files = getStagedFiles();
  } catch (error) {
    console.error(`${GUIDELINE_STAGED.PRE_COMMIT_PREFIX}${error.message}`);
    process.exit(EXIT_CODE.USAGE);
  }

  if (files.length === 0) {
    process.exit(EXIT_CODE.SUCCESS);
  }

  const checkResult = runGuidelineCheck(files);
  if (checkResult.status !== 0) {
    process.exit(checkResult.status || EXIT_CODE.FAILURE);
  }
}

main();
