/**
 * CacheHydrationGate - Phase gate that validates cache hydration completeness.
 * Ensures all partition and message group leaders have complete metadata
 * before allowing progression to the next bootstrap phase.
 *
 * @module bootstrap/cache-hydration-gate
 * @see Requirements 4.1, 4.2, 4.3, 4.4
 */

import {PhaseGate} from './phase-gate.js';
import {createSystemLeaderReadinessSnapshot} from './system-readiness-snapshot.js';

const LOCAL_STR_CACHE_HYDRATION_INCOMPLETE = 'Cache hydration incomplete';

/**
 * CacheHydrationGate - Validates cache hydration completeness.
 * Checks that all partitions and message groups have leader services
 * with complete metadata (including addresses) before allowing joins.
 */
class CacheHydrationGate extends PhaseGate {
  /**
   * Validate cache hydration completeness.
   * @param {Object} context - Bootstrap context.
   * @param {Object} context.systemTableCache - System table cache to validate.
   * @return {import('./phase-gate.js').PhaseGateResult} Validation result.
   */
  validate(context) {
    const {systemTableCache} = context;

    const readiness = createSystemLeaderReadinessSnapshot({
      systemTableCache,
      allowLeaderServiceFallback: true,
    });
    const missingLeaders = readiness.missingLeaders;
    const success = readiness.ready;

    return {
      success,
      errors: success ? [] : [LOCAL_STR_CACHE_HYDRATION_INCOMPLETE],
      diagnostics: {
        missingPartitionLeaders: missingLeaders.missingPartitionLeaders,
        missingMessageGroupLeaders: missingLeaders.missingMessageGroupLeaders,
        missingPartitionLeaderAddresses:
          missingLeaders.missingPartitionLeaderAddresses,
        missingMessageGroupLeaderAddresses:
          missingLeaders.missingMessageGroupLeaderAddresses,
      },
    };
  }
}

export {CacheHydrationGate};
