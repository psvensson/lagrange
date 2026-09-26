/**
 * A test's partition service founded the way production founds one
 * (verification V1a): the port opens a replica only from a stamp or the
 * durable-record bootstrap, never from an absent one. A test that builds a
 * PartitionService directly as a founder of its own group says so with the
 * GENESIS stamp of its founding list - the replica ids it was given, or
 * itself alone (the list PartitionService derives when none is given). An
 * explicit bootstrap membership is kept as given.
 */

import {genesisStamp} from '../../src/raft/raft-committed-membership-stamp.js';

/**
 * @param {Object} options - PartitionService options.
 * @return {Object} The options with a bootstrap membership.
 */
function withFoundingStamp(options) {
  if (options?.bootstrapMembership !== undefined &&
      options?.bootstrapMembership !== null) {
    return options;
  }
  const founders = Array.isArray(options?.replicaIds) ?
    options.replicaIds : [options?.replicaId];
  return {...options, bootstrapMembership: genesisStamp(founders)};
}

export {withFoundingStamp};
