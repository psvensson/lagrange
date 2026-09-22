// The names of the Raft backends the provider seam can select between, and
// the one it selects when nothing says otherwise.
//
// `liferaft` is the production backend and the default. `raft-rs-wasm` is the
// experimental backend of the quest raft-rs-experimental-partition-backend: it
// is selected only when a configuration says its name, and it never becomes
// the default by omission, by absence, by a falsy value or by an error.

const RAFT_BACKEND = Object.freeze({
  LIFERAFT: 'liferaft',
  RAFT_RS_WASM: 'raft-rs-wasm',
});

const RAFT_BACKEND_NAMES = Object.freeze(Object.values(RAFT_BACKEND));

const RAFT_BACKEND_DEFAULT = RAFT_BACKEND.LIFERAFT;

// The configuration field the selection reads. One field, read from the same
// options object the provider was already constructed from.
const RAFT_BACKEND_OPTION = 'raftBackend';

// How a selection came about, as a named state rather than as the absence of
// one: `default` means nothing named a backend, `configured` means something
// did. A caller that must prove it did not get the experimental backend by
// accident reads this, not a truthiness.
const RAFT_BACKEND_SELECTION_SOURCE = Object.freeze({
  DEFAULT: 'default',
  CONFIGURED: 'configured',
});

const RAFT_BACKEND_ERROR_MSG = Object.freeze({
  unknownBackend: (name) =>
    `unknown raft backend ${JSON.stringify(name)}; ` +
    `known backends are ${RAFT_BACKEND_NAMES.join(', ')}`,
  nonStringBackend: (name) =>
    'raft backend must be a string naming one of ' +
    `${RAFT_BACKEND_NAMES.join(', ')}, got ${typeof name}`,
});

export {
  RAFT_BACKEND,
  RAFT_BACKEND_DEFAULT,
  RAFT_BACKEND_ERROR_MSG,
  RAFT_BACKEND_NAMES,
  RAFT_BACKEND_OPTION,
  RAFT_BACKEND_SELECTION_SOURCE,
};
