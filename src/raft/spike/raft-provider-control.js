/**
 * Provider selection helpers for the raft-logic contained spike.
 */

import {
  resolveRaftProvider,
} from '../raft-provider-control.js';
import {
  RAFT_PROVIDER_CONTROL,
} from '../raft-provider-control-constants.js';

/**
 * Check whether raft-logic spike provider is enabled.
 * @param {Object<string, string|undefined>} [env=process.env]
 * @return {boolean}
 */
function isRaftLogicSpikeEnabled(env = process.env) {
  return resolveRaftProvider(env) === RAFT_PROVIDER_CONTROL.RAFT_LOGIC_SPIKE;
}

export {
  resolveRaftProvider,
  isRaftLogicSpikeEnabled,
};
