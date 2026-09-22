// The Raft backend selection seam.
//
// This is the whole seam: one function that turns a configuration into a
// named backend, and one that turns a named backend into a provider. There is
// no registry, no plugin discovery and no dynamic import - the two backends
// are named in `raft-backend-constants.js` and both are imported here, so the
// set of reachable backends is readable in one place.
//
// The default is liferaft, and it is the default by construction rather than
// by a fallback: an absent selection resolves to the default name, and any
// other value that is not a known backend name is refused. The experimental
// backend is reached only by naming it.

import {
  RAFT_BACKEND,
  RAFT_BACKEND_DEFAULT,
  RAFT_BACKEND_ERROR_MSG,
  RAFT_BACKEND_NAMES,
  RAFT_BACKEND_OPTION,
  RAFT_BACKEND_SELECTION_SOURCE,
} from './raft-backend-constants.js';
import {LiferaftProvider} from './liferaft-provider.js';
import {RaftRsWasmProvider} from './raft-rs-provider.js';

const PROVIDER_BY_BACKEND = Object.freeze({
  [RAFT_BACKEND.LIFERAFT]: LiferaftProvider,
  [RAFT_BACKEND.RAFT_RS_WASM]: RaftRsWasmProvider,
});

/**
 * Resolve which backend a configuration selects.
 * @param {Object} [options] - The options the provider is constructed from.
 * @return {{backend: string, source: string}} The selected backend name and
 *   whether it was configured or defaulted.
 */
function selectRaftBackend(options = {}) {
  const requested = options?.[RAFT_BACKEND_OPTION];
  if (requested === undefined || requested === null) {
    return {
      backend: RAFT_BACKEND_DEFAULT,
      source: RAFT_BACKEND_SELECTION_SOURCE.DEFAULT,
    };
  }
  if (typeof requested !== 'string') {
    throw new Error(RAFT_BACKEND_ERROR_MSG.nonStringBackend(requested));
  }
  if (!RAFT_BACKEND_NAMES.includes(requested)) {
    throw new Error(RAFT_BACKEND_ERROR_MSG.unknownBackend(requested));
  }
  return {
    backend: requested,
    source: RAFT_BACKEND_SELECTION_SOURCE.CONFIGURED,
  };
}

/**
 * Construct the Raft provider the configuration selects.
 * @param {Object} [options] - The options the provider is constructed from.
 * @return {Object} A Raft provider.
 */
function createRaftProvider(options = {}) {
  const {backend} = selectRaftBackend(options);
  const ProviderClass = PROVIDER_BY_BACKEND[backend];
  return new ProviderClass(options);
}

export {createRaftProvider, selectRaftBackend};
