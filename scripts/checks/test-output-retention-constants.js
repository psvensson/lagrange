import {TEST_OUTPUT_PATH} from '../../src/constants/index.js';
import {TEST_OUTPUT_PRUNE_RESERVED_TOP_LEVEL}
  from '../../src/constants/test-output-prune-values.js';

const TEST_OUTPUT_PRUNE_WORKSPACE_DIR = Object.freeze({
  TMP: '.tmp',
  TAP: '.tap',
  TEST_RESULTS: 'test-results',
  REUSE_CONTROL: 'reuse-control',
  REUSE_DATA: 'reuse-data',
});
const TEST_OUTPUT_PRUNE_TMP_RESERVED_TOP_LEVEL = Object.freeze([
  TEST_OUTPUT_PATH.PLAYBACK_DIR,
  TEST_OUTPUT_PRUNE_WORKSPACE_DIR.REUSE_CONTROL,
  TEST_OUTPUT_PRUNE_WORKSPACE_DIR.REUSE_DATA,
]);
const TEST_OUTPUT_PRUNE_PLAYBACK_RESERVED_TOP_LEVEL = Object.freeze([
  TEST_OUTPUT_PATH.PLAYBACK_DIR,
]);
// Parents of REGISTERED git worktrees: publication, placement and planning
// add one per run under these and remove it with `git worktree remove`. An
// rm -rf here would leave the worktree registered with its directory gone,
// so these are never age-pruned; their owners clean their own children.
const TEST_OUTPUT_PRUNE_WORKTREE_PARENTS = Object.freeze([
  'push-gate-worktrees',
  'publish-worktrees',
  'placement-worktrees',
  'lab-test-worktrees',
]);
const TEST_OUTPUT_PRUNE_ROOT_RESERVED_TOP_LEVEL = Object.freeze([
  ...TEST_OUTPUT_PRUNE_RESERVED_TOP_LEVEL,
  ...TEST_OUTPUT_PRUNE_WORKTREE_PARENTS,
  // The publication owner retains original failure evidence across attempts.
  'push-gate',
  // Each placement attempt retains its original controller stdout/stderr.
  'placement',
]);
const TEST_OUTPUT_PRUNE_PARTITION_LOG_SUFFIXES = Object.freeze([
  '.db-wal',
  '.db-shm',
  '.db',
]);

export {
  TEST_OUTPUT_PRUNE_PARTITION_LOG_SUFFIXES,
  TEST_OUTPUT_PRUNE_PLAYBACK_RESERVED_TOP_LEVEL,
  TEST_OUTPUT_PRUNE_ROOT_RESERVED_TOP_LEVEL,
  TEST_OUTPUT_PRUNE_TMP_RESERVED_TOP_LEVEL,
  TEST_OUTPUT_PRUNE_WORKSPACE_DIR,
};
