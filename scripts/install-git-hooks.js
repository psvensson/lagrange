#!/usr/bin/env node

import {spawnSync} from 'node:child_process';

const LOCAL_STR_GIT = 'git';
const LOCAL_STR_UTF8 = 'utf8';
const LOCAL_STR_IGNORE = 'ignore';
const LOCAL_STR_PIPE = 'pipe';
const LOCAL_STR_HOOKS_NOT_A_GIT_REPOSITORY_SKIPPING_HOOK = '[hooks] Not a git repository; skipping hook setup.';
const LOCAL_STR_HOOKS_INSTALLED_REPO_HOOKS_AT_GITHOOKS = '[hooks] Installed repo hooks at .githooks';

function runGit(args) {
  return spawnSync(LOCAL_STR_GIT, args, {
    encoding: LOCAL_STR_UTF8,
    stdio: [LOCAL_STR_IGNORE, LOCAL_STR_PIPE, LOCAL_STR_PIPE],
  });
}

function main() {
  const isGitRepo = runGit(['rev-parse', '--git-dir']);
  if (isGitRepo.status !== 0) {
    console.error(LOCAL_STR_HOOKS_NOT_A_GIT_REPOSITORY_SKIPPING_HOOK);
    process.exit(0);
  }

  const configureHooks = runGit(['config', 'core.hooksPath', '.githooks']);
  if (configureHooks.status !== 0) {
    const errorMessage = configureHooks.stderr?.trim() ||
      'Failed to configure core.hooksPath.';
    console.error(`[hooks] ${errorMessage}`);
    process.exit(1);
  }

  // stderr, not stdout: this runs as the npm `prepare` lifecycle, so anything
  // written to stdout lands inside `npm pack --json` output and breaks its
  // parse — which is exactly how the 0.2 package-npm release receipt failed
  // ("npm pack did not return one JSON artifact: Unexpected token 'h',
  // \"[hooks] Ins\"..."). The two failure paths above already use stderr.
  console.error(LOCAL_STR_HOOKS_INSTALLED_REPO_HOOKS_AT_GITHOOKS);
}

main();
