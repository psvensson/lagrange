#!/usr/bin/env node

import {spawnSync} from 'node:child_process';

const LOCAL_STR_GIT = 'git';
const LOCAL_STR_UTF8 = 'utf8';
const LOCAL_STR_IGNORE = 'ignore';
const LOCAL_STR_PIPE = 'pipe';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_1E2OT = '[hooks] Not a git repository; skipping hook setup.';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_E5MV2 = '[hooks] Installed repo hooks at .githooks';

function runGit(args) {
  return spawnSync(LOCAL_STR_GIT, args, {
    encoding: LOCAL_STR_UTF8,
    stdio: [LOCAL_STR_IGNORE, LOCAL_STR_PIPE, LOCAL_STR_PIPE],
  });
}

function main() {
  const isGitRepo = runGit(['rev-parse', '--git-dir']);
  if (isGitRepo.status !== LOCAL_NUM_ZERO) {
    console.error(LOCAL_STR_1E2OT);
    process.exit(LOCAL_NUM_ZERO);
  }

  const configureHooks = runGit(['config', 'core.hooksPath', '.githooks']);
  if (configureHooks.status !== LOCAL_NUM_ZERO) {
    const errorMessage = configureHooks.stderr?.trim() ||
      'Failed to configure core.hooksPath.';
    console.error(`[hooks] ${errorMessage}`);
    process.exit(LOCAL_NUM_ONE);
  }

  console.log(LOCAL_STR_E5MV2);
}

main();
