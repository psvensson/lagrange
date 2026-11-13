// Shared placement execution policy and outcome vocabulary.
import {CHECK_BASE_ENV} from '../checks/change-selection-constants.js';
import {LAB_LOCK_EXIT, MS_PER_SECOND} from './machine-lock-constants.js';

const PLACEMENT_ENV = 'LAGRANGE_PLACEMENT';
const PLACEMENT_LOCAL = 'local';
// Bundle, fetch, worktree and nvm on a lab machine, charged before its files.
const PLACEMENT_REMOTE_SETUP_MS = 30 * MS_PER_SECOND;
const PLACEMENT_EXIT = Object.freeze({
  SETUP: LAB_LOCK_EXIT.SETUP, BUSY: LAB_LOCK_EXIT.BUSY, INTERRUPTED: 130,
  TERMINATED: LAB_LOCK_EXIT.TERMINATED, SSH: 255,
});
// What the controller's own run policy hands a lab machine's runner, and the
// base its history walks measure from: the controller's, resolved to a
// commit, since a lab checkout's own origin/main is whatever it last fetched.
const PLACEMENT_FORWARDED_ENV = Object.freeze({
  TAP_TIMEOUT: 'TAP_TIMEOUT',
  CHECK_BASE: CHECK_BASE_ENV,
});
const PLACEMENT_STDIO_PIPE = 'pipe';
const PLACEMENT_MACHINE_FACTOR_ENV = 'LAGRANGE_TEST_MACHINE_FACTOR';
const PLACEMENT_CREATE_FLAG = 'wx';
const PLACEMENT_REJECTED = 'rejected';
const PLACEMENT_STREAM = Object.freeze({OUT: 'out', ERR: 'err'});
const PLACEMENT_NEWLINE = '\n';
const PLACEMENT_RUN_SHA_CHARACTERS = 12;
const PLACEMENT_TEXT = Object.freeze({
  PREFIX: 'placement: ',
  LOCAL: 'placement: local - ',
  UNAVAILABLE: 'placement: unavailable - ',
  ATTEMPT_EXISTS: 'placement: unavailable - attempt already exists: ',
  NOT_A_COMMIT: 'the tree is not exactly a commit, and only a commit is sent',
  NO_MACHINE: 'no lab machine is ready',
  NO_GAIN: 'no lab machine would shorten this run',
  NO_HISTORY: 'shares no history with this commit',
  UNREPORTED: ' file(s) without a completed result: ',
  NO_INVENTORY: 'the lab inventory could not be read: ',
  NO_REQUIREMENT: 'the placed commit\'s requirement could not be read: ',
  NO_DISCOVERY: 'lab discovery failed: ',
  NO_CHECK_BASE: 'the check base a lab machine would be handed is unresolved: ',
  NO_CONTROLLER_CHILD: 'the parallel controller child executor is unavailable',
  RED_THERE: ' file(s) failed on their assigned host',
  FAIL_FAST: 'fail-fast asks for the first red, which a placed run cannot give',
  THERMAL_UNFIT: 'host-thermal-unfit ',
  HOST_BUSY: 'host-busy ',
  HELD_BY: ' held-by ',
  SINCE: ' since ',
  NO_HOLDER: ' held-by (no holder record)',
  REFUSED_BUSY: 'held by another agent',
  REFUSED_HOT: 'too hot to run',
  CLEANUP_INCOMPLETE: 'placement cleanup incomplete: ',
  DEADLINE: 'deadline',
  INTERRUPTED: 'interrupted',
});

const PLACEMENT_RESULTS_PREFIX = 'placement-results=';
const LAB_TEST_TEXT = Object.freeze({
  PREFIX: 'lab test: ',
  NAME_ONE: ': commit it, or name a commit with --sha',
  NOT_A_COMMIT: ' is not a commit here',
  NOT_READY: ' is not a ready lab machine this run: ',
  NOT_LISTED: 'not in the inventory',
  CONTROLLER_TREE: 'the controller runs its lanes in this tree, which is not exactly ',
  PLANNING_FAILED: 'the commit could not be checked out for planning: ',
  UNREPORTED: ' file(s) reported no result: ',
  COPIED: 'results copied to ',
  LANES: ', ',
  SKIPPED: 'skipped ',
  HOT: 'thermally held: ',
  LOADED: 'loaded: one-minute load ',
  NOT_NEEDED: 'not needed (its share would not outlast its setup, or nothing fits it)',
  GRAPH: 'generating the import graph the change selector reads (none yet) in ',
});

export {
  LAB_TEST_TEXT, PLACEMENT_CREATE_FLAG, PLACEMENT_ENV,
  PLACEMENT_EXIT, PLACEMENT_FORWARDED_ENV, PLACEMENT_LOCAL,
  PLACEMENT_MACHINE_FACTOR_ENV, PLACEMENT_NEWLINE, PLACEMENT_REJECTED,
  PLACEMENT_REMOTE_SETUP_MS, PLACEMENT_RESULTS_PREFIX, PLACEMENT_RUN_SHA_CHARACTERS,
  PLACEMENT_STDIO_PIPE, PLACEMENT_STREAM, PLACEMENT_TEXT,
};
