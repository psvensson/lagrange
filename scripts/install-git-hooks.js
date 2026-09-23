#!/usr/bin/env node

import {spawnSync} from 'node:child_process';

const LOCAL_STR_GIT = 'git';
const LOCAL_STR_UTF8 = 'utf8';
const LOCAL_STR_IGNORE = 'ignore';
const LOCAL_STR_PIPE = 'pipe';
const LOCAL_STR_HOOKS_NOT_A_GIT_REPOSITORY_SKIPPING_HOOK = '[hooks] Not a git repository; skipping hook setup.';
const LOCAL_STR_HOOKS_INSTALLED_REPO_HOOKS_AT_GITHOOKS = '[hooks] Installed repo hooks at .githooks';
// The merge driver .gitattributes names for the generated files. A driver runs
// before git writes the merged tree, so it cannot regenerate a file that is a
// function of that tree: it keeps ours, which ends the conflict, and names the
// regeneration the merged tree owes. The pre-commit hook performs it when a
// stopped merge is concluded by a commit that stages src/, scripts/ or test/;
// otherwise the gates refuse a stale shard manifest or seal by name.
const MERGE_DRIVER_NAME_KEY = 'merge.lagrange-generated.name';
const MERGE_DRIVER_NAME = 'keep ours; the merged tree regenerates generated metadata';
const MERGE_DRIVER_COMMAND_KEY = 'merge.lagrange-generated.driver';
const MERGE_DRIVER_COMMAND = 'sh -c \'echo "[merge] kept ours for $1; the merged tree owes: ' +
  'npm run -s test:metadata:refresh and node scripts/generate-global-owner-debt-inventory.js ' +
  '(--refresh when its inputs are absent), then commit" >&2\' lagrange-generated %P';
const LOCAL_STR_HOOKS_CONFIG_FAILED = 'Failed to configure ';
const HOOKS_PATH_KEY = 'core.hooksPath';
const HOOKS_PATH = '.githooks';

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

  for (const [key, value] of [[HOOKS_PATH_KEY, HOOKS_PATH],
    [MERGE_DRIVER_NAME_KEY, MERGE_DRIVER_NAME],
    [MERGE_DRIVER_COMMAND_KEY, MERGE_DRIVER_COMMAND]]) {
    const configured = runGit(['config', key, value]);
    if (configured.status !== 0) {
      const errorMessage = configured.stderr?.trim() ||
        `${LOCAL_STR_HOOKS_CONFIG_FAILED}${key}.`;
      console.error(`[hooks] ${errorMessage}`);
      process.exit(1);
    }
  }

  // stderr, not stdout: this runs as the npm `prepare` lifecycle, so anything
  // written to stdout lands inside `npm pack --json` output and breaks its
  // parse — which is exactly how the 0.2 package-npm release receipt failed
  // ("npm pack did not return one JSON artifact: Unexpected token 'h',
  // \"[hooks] Ins\"..."). The two failure paths above already use stderr.
  console.error(LOCAL_STR_HOOKS_INSTALLED_REPO_HOOKS_AT_GITHOOKS);
}

main();
