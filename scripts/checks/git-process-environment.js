// Environment for git commands that must address the repository at their
// cwd/-C root, never one inherited from the environment.
//
// Git exports GIT_DIR (absolute, when the hook runs from a linked worktree),
// GIT_WORK_TREE, GIT_INDEX_FILE and friends to hooks. A fixture that inherits
// them runs `git init`, `git config user.*`, `git commit` and `git reset`
// against the REAL repository instead of its tmp directory: the pre-push test
// stage once reset a worktree to a fixture commit, set the fixture identity
// and core.bare=true in the shared config, and then failed its own corpus
// stage on the clobbered tree. The change-proof derivation reads the same
// pointers and would inspect the hook's repository instead of the root it
// was handed. Git here always addresses the directory it is given, never an
// inherited repository pointer.

import path from 'node:path';

const INHERITED_GIT_REPOSITORY_POINTERS = Object.freeze([
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_PREFIX',
]);

// Nor an ENCLOSING one (push-gate-integrity): a checkout made inside another
// repository - the gate's and the publisher's, under test-output/ - must never
// be answered for by that repository when its own .git link is gone. With the
// checkout named, discovery stops at it: its parent is the ceiling.
const DISCOVERY_CEILING = 'GIT_CEILING_DIRECTORIES';

/**
 * Copy `base` without any inherited git repository pointer and, given the
 * checkout git must address, with discovery stopped at that checkout.
 * @param {NodeJS.ProcessEnv} [base]
 * @param {string|null} [checkout] absolute path of the checkout
 * @return {NodeJS.ProcessEnv}
 */
export function gitProcessEnvironment(base = process.env, checkout = null) {
  const env = {...base};
  for (const name of INHERITED_GIT_REPOSITORY_POINTERS) {
    delete env[name];
  }
  if (checkout) env[DISCOVERY_CEILING] = path.dirname(checkout);
  return env;
}
