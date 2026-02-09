/**
 * CacheHydrationGate - Phase gate that validates cache hydration completeness.
 * Ensures all partition and message group leaders have complete metadata
 * before allowing progression to the next bootstrap phase.
 *
 * @module bootstrap/cache-hydration-gate
 * @see Requirements 4.1, 4.2, 4.3, 4.4
 */

import {PhaseGate} from './phase-gate.js';
import {getMissingSystemServiceLeaders} from '../cache/leader-readiness-gate.js';

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

    const missingLeaders = getMissingSystemServiceLeaders(systemTableCache);

    const hasAllPartitionLeaders =
      missingLeaders.missingPartitionLeaders.length === 0;
    const hasAllMessageGroupLeaders =
      missingLeaders.missingMessageGroupLeaders.length === 0;
    const hasAllAddresses =
      missingLeaders.missingPartitionLeaderAddresses.length === 0 &&
      missingLeaders.missingMessageGroupLeaderAddresses.length === 0;

    const success =
      hasAllPartitionLeaders && hasAllMessageGroupLeaders && hasAllAddresses;

    return {
      success,
      errors: success ? [] : ['Cache hydration incomplete'],
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
