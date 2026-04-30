import {
  getBlockingSystemServiceLeaders,
  getMissingSystemServiceLeaderCount,
  getMissingSystemServiceLeaders,
} from '../cache/leader-readiness-gate.js';

const LOCAL_NUM_ZERO = 0;

function createSystemLeaderReadinessSnapshot(options = {}) {
  const {
    systemTableCache = null,
    requiredTables = null,
    requireLeaderNodeId = false,
    isTableWriteSatisfied,
    allowLeaderServiceFallback = false,
  } = options;

  const useBlockingTables =
    Array.isArray(requiredTables) &&
    requiredTables.length > 0;

  const missingLeaders = useBlockingTables ?
    getBlockingSystemServiceLeaders(
      systemTableCache,
      requiredTables,
      {
        requireLeaderNodeId,
        isTableWriteSatisfied,
        allowLeaderServiceFallback,
      },
    ) :
    getMissingSystemServiceLeaders(
      systemTableCache,
      {
        requireLeaderNodeId,
        allowLeaderServiceFallback,
      },
    );
  const missingCount =
    getMissingSystemServiceLeaderCount(missingLeaders);

  return {
    ready: missingCount === LOCAL_NUM_ZERO,
    missingLeaders,
    missingCount,
  };
}

export {createSystemLeaderReadinessSnapshot};
