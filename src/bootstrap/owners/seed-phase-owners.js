/**
 * Seed phase owner registry.
 *
 * Canonical owner call path for seed-bootstrap phases.
 * The BootstrapService orchestration boundary executes through this registry.
 */

import {assertCritical} from '../../utils/assert.js';
import {TYPEOF} from '../../constants/index.js';

const SEED_PHASE_OWNER = Object.freeze({
  INFRASTRUCTURE: 'infrastructure',
  MESSAGE_GROUPS: 'messageGroups',
  PARTITIONS: 'partitions',
  REGISTRATION: 'registration',
  CACHE_HYDRATION: 'cacheHydration',
});

const OWNER_ERROR_MSG = Object.freeze({
  missingMethod: (methodName) =>
    `BootstrapService owner method missing: ${methodName}`,
});

/**
 * Create dynamic owner invoker.
 * Looks up the method at execution time so tests can monkey-patch phase methods.
 * @param {Object} service - Bootstrap service instance.
 * @param {string} methodName - Method name.
 * @return {Function} Owner invoker.
 * @private
 */
function createOwnerInvoker(service, methodName) {
  return async (...args) => {
    const phaseFn = service[methodName];
    assertCritical(
      typeof phaseFn === TYPEOF.FUNCTION,
      OWNER_ERROR_MSG.missingMethod(methodName),
    );
    return phaseFn.apply(service, args);
  };
}

/**
 * Create canonical seed phase owners.
 * @param {Object} service - Bootstrap service.
 * @return {Object<string, Function>} Seed phase owner registry.
 */
function createSeedPhaseOwners(service) {
  assertCritical(service, 'BootstrapService is required for seed phase owners');

  return Object.freeze({
    [SEED_PHASE_OWNER.INFRASTRUCTURE]:
      createOwnerInvoker(service, 'phaseInfrastructure'),
    [SEED_PHASE_OWNER.MESSAGE_GROUPS]:
      createOwnerInvoker(service, 'phaseMessageGroups'),
    [SEED_PHASE_OWNER.PARTITIONS]:
      createOwnerInvoker(service, 'phasePartitions'),
    [SEED_PHASE_OWNER.REGISTRATION]:
      createOwnerInvoker(service, 'phaseRegistration'),
    [SEED_PHASE_OWNER.CACHE_HYDRATION]:
      createOwnerInvoker(service, 'phaseCacheHydration'),
  });
}

export {SEED_PHASE_OWNER, createSeedPhaseOwners};
