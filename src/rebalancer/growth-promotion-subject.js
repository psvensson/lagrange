import {OPERATION_METADATA_KEY} from './replica-operation-progress.js';

const COHORT = OPERATION_METADATA_KEY.PROMOTE_REPLICA_IDS;
const GROWTH_PROMOTION_COHORT_UNRESOLVED = 'growth_promotion_cohort_unresolved';

function isReplicaIdentity(value) {
  return typeof value === 'string' && value.length > 0;
}

// Only native intent construction derives the cohort from the admitted move.
function buildGrowthPromotionCohort(replicaId, sourceReplicaId) {
  if (!isReplicaIdentity(replicaId) ||
      !(sourceReplicaId === null ||
        (isReplicaIdentity(sourceReplicaId) && sourceReplicaId !== replicaId))) {
    return null;
  }
  return sourceReplicaId === null ? [replicaId] : [replicaId, sourceReplicaId];
}

function matchGrowthPromotionCohort(operation, promoted) {
  const {replicaId, sourceReplicaId} = operation;
  const cohort = buildGrowthPromotionCohort(replicaId, sourceReplicaId);
  return cohort !== null && Array.isArray(promoted) &&
    promoted.length === cohort.length &&
    cohort.every((id, index) => promoted[index] === id) ? promoted : null;
}

function readGrowthPromotionCohort(operation) {
  const history = operation?.stepsHistory;
  if (!Array.isArray(history)) return null;
  const cohort = matchGrowthPromotionCohort(operation, history[0]?.[COHORT]);
  if (cohort === null) return null;
  if (Object.hasOwn(operation, COHORT) &&
      matchGrowthPromotionCohort(operation, operation[COHORT]) === null) {
    return null;
  }
  for (const step of history.slice(1)) {
    if (step && Object.hasOwn(step, COHORT) &&
        matchGrowthPromotionCohort(operation, step[COHORT]) === null) {
      return null;
    }
  }
  return cohort;
}

export {
  GROWTH_PROMOTION_COHORT_UNRESOLVED,
  buildGrowthPromotionCohort,
  matchGrowthPromotionCohort,
  readGrowthPromotionCohort,
};
