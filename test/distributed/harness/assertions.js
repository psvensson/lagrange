import { ASSERTIONS_SEGMENT_3 } from './assertions-segment-3.js';

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
} = ASSERTIONS_SEGMENT_3;

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
