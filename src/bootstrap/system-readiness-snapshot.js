import {
  getBlockingSystemServiceLeaders,
  getMissingSystemServiceLeaderCount,
  getMissingSystemServiceLeaders,
} from '../cache/leader-readiness-gate.js';


function createSystemLeaderReadinessSnapshot(options = {}) {
  const {
    systemTableCache = null,
    requiredTables = null,
    requireLeaderNodeId = false,
    isTableWriteSatisfied,
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
      },
    ) :
    getMissingSystemServiceLeaders(
      systemTableCache,
      {
        requireLeaderNodeId,
      },
    );
  const missingCount =
    getMissingSystemServiceLeaderCount(missingLeaders);

  return {
    ready: missingCount === 0,
    missingLeaders,
    missingCount,
  };
}

export {createSystemLeaderReadinessSnapshot};
