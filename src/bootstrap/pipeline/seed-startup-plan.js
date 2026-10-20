/**
 * Seed startup pipeline plan.
 */

import {
  BOOTSTRAP_PHASE as BootstrapPhase,
} from '../bootstrap-constants.js';

function createSeedStartupPlan(service) {
  return {
    phases: [
      {
        name: BootstrapPhase.INFRASTRUCTURE,
        run: () => service.executePhase(
          BootstrapPhase.INFRASTRUCTURE,
          () => service.seedPhaseOwners.infrastructure(),
        ),
      },
      {
        name: BootstrapPhase.MESSAGE_GROUPS,
        run: () => service.executePhase(
          BootstrapPhase.MESSAGE_GROUPS,
          () => service.seedPhaseOwners.messageGroups(),
        ),
      },
      {
        name: BootstrapPhase.PARTITIONS,
        run: () => service.executePhase(
          BootstrapPhase.PARTITIONS,
          () => service.seedPhaseOwners.partitions(),
        ),
      },
      {
        name: BootstrapPhase.REGISTRATION,
        run: () => service.executePhase(
          BootstrapPhase.REGISTRATION,
          () => service.seedPhaseOwners.registration(),
        ),
      },
      {
        name: BootstrapPhase.CACHE_HYDRATION,
        run: () => service.executePhase(
          BootstrapPhase.CACHE_HYDRATION,
          () => service.seedPhaseOwners.cacheHydration(),
        ),
      },
    ],
  };
}

export {createSeedStartupPlan};
