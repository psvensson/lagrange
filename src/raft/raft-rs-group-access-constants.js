// What a group of this backend may be READ for, by name.
//
// A closed set, because the alternative - handing a caller a function to run
// against the core and calling it a read - is the hole two verifications
// found. A read inspects this replica's own state and takes no part in the
// group, which is why it is admitted while the replica is retired; anything
// that could change what the core does is an active operation with its own
// name and its own gate.

const RAFT_RS_GROUP_READ = Object.freeze({
  STATUS: 'status',
  CONF_STATE: 'conf_state',
  HAS_READY: 'has_ready',
  PERSISTED_STATE: 'export_persisted_state',
});

const RAFT_RS_GROUP_READS = Object.freeze(Object.values(RAFT_RS_GROUP_READ));

const RAFT_RS_GROUP_ACCESS_ERROR_MSG = Object.freeze({
  notARead: (name, reads) =>
    `${JSON.stringify(String(name))} is not one of this group's reads ` +
    `(${reads.join(', ')}); an operation that is not a read has its own ` +
    'name and its own gate, and the core is never reached by handing this ' +
    'group a function to run',
});

export {
  RAFT_RS_GROUP_ACCESS_ERROR_MSG,
  RAFT_RS_GROUP_READ,
  RAFT_RS_GROUP_READS,
};
