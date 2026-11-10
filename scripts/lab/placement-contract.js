// Shared placement outcomes and diagnostic vocabulary; no execution policy.
import {LAB_LOCK_EXIT} from './machine-lock.js';

const PLACEMENT_EXIT = Object.freeze({
  SETUP: LAB_LOCK_EXIT.SETUP, BUSY: LAB_LOCK_EXIT.BUSY, INTERRUPTED: 130,
  TERMINATED: LAB_LOCK_EXIT.TERMINATED, SSH: 255,
});
// Why discovery for a placed run failed, as a code a caller can name.
const DISCOVERY_FAILURE = Object.freeze({
  REQUIREMENT_UNREADABLE: 'lab-requirement-unreadable',
  REQUIREMENT_TOO_LARGE: 'lab-requirement-too-large',
  INVENTORY_UNREADABLE: 'lab-inventory-unreadable',
});
const REQUIREMENT_FAILURES = new Set([DISCOVERY_FAILURE.REQUIREMENT_UNREADABLE,
  DISCOVERY_FAILURE.REQUIREMENT_TOO_LARGE]);
const PLACEMENT_TEXT = Object.freeze({
  PREFIX: 'placement: ',
  LOCAL: 'placement: local - ',
  NOT_A_COMMIT: 'the tree is not exactly a commit, and only a commit is sent',
  NO_MACHINE: 'no lab machine is ready',
  NO_GAIN: 'no lab machine would shorten this run',
  NO_HISTORY: 'shares no history with this commit',
  UNREPORTED: ' file(s) with no result from there run on the controller: ',
  NO_INVENTORY: 'the lab inventory could not be read: ',
  NO_REQUIREMENT: 'the placed commit\'s requirement could not be read: ',
  NO_DISCOVERY: 'lab discovery failed: ',
  NO_CHECK_BASE: 'the check base a lab machine would be handed is unresolved: ',
  RED_THERE: ' file(s) red there are decided on the controller',
  OVER_CAP: 'remote reds exceed the rerun cap: breakage, reported red without a rerun',
  MISS: ' passed on the controller: routed away from ',
  FAIL_FAST: 'fail-fast asks for the first red, which a placed run cannot give',
  THERMAL_UNFIT: 'host-thermal-unfit ',
  HOST_BUSY: 'host-busy ',
  HELD_BY: ' held-by ',
  SINCE: ' since ',
  NO_HOLDER: ' held-by (no holder record)',
  MOVED_FROM: ' (from ',
  MOVED_CLOSE: ')',
  REFUSED_BUSY: 'held by another agent',
  REFUSED_HOT: 'too hot to run',
  NO_NEXT_HOST: ', and no ready lab host is left',
  DEADLINE: 'deadline',
  INTERRUPTED: 'interrupted',
});
const LAB_TEST_FAILED = 1;
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

export {PLACEMENT_EXIT, DISCOVERY_FAILURE, REQUIREMENT_FAILURES, PLACEMENT_TEXT, LAB_TEST_FAILED,
  LAB_TEST_TEXT};
