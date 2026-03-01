#!/usr/bin/env node

import {spawnSync} from 'node:child_process';

function runGit(args) {
  return spawnSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function main() {
  const isGitRepo = runGit(['rev-parse', '--git-dir']);
  if (isGitRepo.status !== 0) {
    console.error('[hooks] Not a git repository; skipping hook setup.');
    process.exit(0);
  }

  const configureHooks = runGit(['config', 'core.hooksPath', '.githooks']);
  if (configureHooks.status !== 0) {
    const errorMessage = configureHooks.stderr?.trim() ||
      'Failed to configure core.hooksPath.';
    console.error(`[hooks] ${errorMessage}`);
    process.exit(1);
  }

  console.log('[hooks] Installed repo hooks at .githooks');
}

main();
