// Fixtures shared by the learner-promotion count-check witnesses
// (learner-promotion-count-check-inputs.test.js and
// learner-promotion-count-check-budget-walk.test.js).
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

// The live shape: schema_operations-p1 is both bootstrap-critical and a
// priority control-plane partition, so it is the partition whose learner the
// nightlies refuse.
export const CRITICAL_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS];
export const LEARNER_ROLE = 'learner';
export const FOLLOWER_ROLE = 'follower';
export const LEADER_ROLE = 'leader';
