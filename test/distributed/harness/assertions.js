import {ASSERTIONS_CONSISTENCY_CHECKS} from './assertions-consistency-checks.js';

const {
  waitForConvergence,
  assertConsistency,
  waitForConsistencyConvergence,
  assertConsistencyFromSnapshots,
  assertDataIntegrity,
  hasConflictingLeaders,
  isVoterReady,
  countVotersPerPartition,
  extractLeaders,
  updateOverTargetState,
  finalizeOverTargetState,
} = ASSERTIONS_CONSISTENCY_CHECKS;

export {
  waitForConvergence,
  assertConsistency,
  waitForConsistencyConvergence,
  assertConsistencyFromSnapshots,
  assertDataIntegrity,
  hasConflictingLeaders,
  isVoterReady,
  countVotersPerPartition,
  extractLeaders,
  updateOverTargetState,
  finalizeOverTargetState,
};
