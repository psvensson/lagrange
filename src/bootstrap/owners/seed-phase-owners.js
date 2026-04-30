/**
 * Seed phase owner registry.
 *
 * Canonical owner call path for seed-bootstrap phases (D2.3).
 * The BootstrapService orchestration boundary executes through this
 * registry, which routes directly to extracted phase owner modules.
 */

import {assertCritical} from '../../utils/assert.js';

const LOCAL_STR_RGXNE = 'BootstrapService is required for seed phase owners';

const SEED_PHASE_OWNER = Object.freeze({
  INFRASTRUCTURE: 'infrastructure',
  MESSAGE_GROUPS: 'messageGroups',
  PARTITIONS: 'partitions',
  REGISTRATION: 'registration',
  CACHE_HYDRATION: 'cacheHydration',
});

const PHASE_OWNER_FIELD = Object.freeze({
  [SEED_PHASE_OWNER.INFRASTRUCTURE]:
    'seedInfrastructurePhase',
  [SEED_PHASE_OWNER.MESSAGE_GROUPS]:
    'seedMessageGroupsPhase',
  [SEED_PHASE_OWNER.PARTITIONS]:
    'seedPartitionsPhase',
  [SEED_PHASE_OWNER.REGISTRATION]:
    'seedRegistrationPhase',
  [SEED_PHASE_OWNER.CACHE_HYDRATION]:
    'seedCacheHydrationPhase',
});

const PHASE_METHOD = Object.freeze({
  [SEED_PHASE_OWNER.INFRASTRUCTURE]: 'phaseInfrastructure',
  [SEED_PHASE_OWNER.MESSAGE_GROUPS]: 'phaseMessageGroups',
  [SEED_PHASE_OWNER.PARTITIONS]: 'phasePartitions',
  [SEED_PHASE_OWNER.REGISTRATION]: 'phaseRegistration',
  [SEED_PHASE_OWNER.CACHE_HYDRATION]: 'phaseCacheHydration',
});

const OWNER_ERROR_MSG = Object.freeze({
  missingPhaseOwner: (ownerField) =>
    `Phase owner not initialized: ${ownerField}`,
});

/**
 * Create direct phase-owner invoker (D2.3).
 * Routes through the extracted phase owner module, not through
 * wrapper methods on BootstrapService.
 * @param {Object} service - Bootstrap service instance.
 * @param {string} ownerField - Phase owner field name on service.
 * @param {string} methodName - Phase method name on the owner.
 * @return {Function} Owner invoker.
 * @private
 */
function createPhaseInvoker(service, ownerField, methodName) {
  return async (...args) => {
    const owner = service[ownerField];
    assertCritical(
      owner,
      OWNER_ERROR_MSG.missingPhaseOwner(ownerField),
    );
    return owner[methodName](...args);
  };
}

/**
 * Create canonical seed phase owners.
 * @param {Object} service - Bootstrap service.
 * @return {Object<string, Function>} Seed phase owner registry.
 */
function createSeedPhaseOwners(service) {
  assertCritical(
    service,
    LOCAL_STR_RGXNE,
  );

  const owners = {};
  for (const key of Object.values(SEED_PHASE_OWNER)) {
    owners[key] = createPhaseInvoker(
      service,
      PHASE_OWNER_FIELD[key],
      PHASE_METHOD[key],
    );
  }
  return Object.freeze(owners);
}

export {SEED_PHASE_OWNER, createSeedPhaseOwners};
