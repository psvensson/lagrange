// What building a real partition node on the experimental backend needs, and
// what it refuses.
//
// A partition group is not the message-group node `createNodeClass` builds.
// It runs on the replica's own durable storage, its peers are logical
// Lagrange replicas whose raft identities are registered rather than
// positional, and whether it may run at all is a durable fact read before
// anything ticks. Each of those is named here so no use site writes one
// inline.

// How often the host ticks the core when the group's timing does not say. A
// raft-rs tick is a logical unit and the core counts heartbeats in ticks, so
// the wall-clock period is DERIVED from the group's own heartbeat interval
// and the core's own heartbeat tick count rather than chosen here.
const RAFT_RS_TICK_FLOOR_MS = 1;

// How the binding writes an entry's bytes across the WASM boundary. A group
// proposes bytes and is told about bytes: the text encoding is the binding's
// transport detail and never reaches the group.
const RAFT_RS_ENTRY_DATA_ENCODING = 'base64';

// Whether the host is driving this node's core, by name. "Not scheduled" is a
// state with a reason, never an absent timer handle.
const RAFT_RS_TICK_SCHEDULING = Object.freeze({
  RUNNING: 'running',
  STOPPED: 'stopped',
  DEFERRED_BY_THE_GROUP: 'deferred-by-the-group',
  REFUSED_RETIRED: 'refused-the-replica-is-retired-in-its-durable-record',
});

const RAFT_RS_PARTITION_ERROR_MSG = Object.freeze({
  missingRequest: (field) =>
    `a raft-rs partition node needs ${field} in its request and the request ` +
    'does not carry it; the partition node request is the boundary, so a ' +
    'backend that needs something absent from it changes that boundary ' +
    'rather than reaching around it',
  notAPartitionNode: () =>
    'this node was not built by createPartitionNode(), so this backend holds ' +
    'no tick driver, no peer registry and no retirement record for it',
  unknownPeerIdentity: (raftPeerId) =>
    `no replica is registered for raft peer id ${JSON.stringify(raftPeerId)}` +
    '; an address is resolved from the registered identity, never from a ' +
    'position in a peer list',
});

export {
  RAFT_RS_ENTRY_DATA_ENCODING,
  RAFT_RS_PARTITION_ERROR_MSG,
  RAFT_RS_TICK_FLOOR_MS,
  RAFT_RS_TICK_SCHEDULING,
};
