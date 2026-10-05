// What a consensus group hands the rs-raft operation port when it opens the
// group it will run on. These are the group's own requirements, named once:
// who the group is, who this replica is and where it is reachable, the
// membership it starts from, the durable storage that holds its consensus
// record, how to reach a peer, what to do with a committed entry, what its
// timers are, and whether elections are deferred. Nothing here is a hidden
// global: a group that needs something absent from this list is a boundary
// change, not a lookup.
const RAFT_OPERATION_PORT_REQUEST = Object.freeze({
  GROUP_ID: 'groupId',
  PEER_ID: 'peerId',
  PEER_ADDRESS: 'peerAddress',
  BOOTSTRAP_PEER_IDS: 'bootstrapPeerIds',
  // What the group opens from when the replica holds no durable record: a
  // committed-membership stamp (COMMITTED, a join; GENESIS, a founder) or
  // the durable record alone (DURABLE_RECORD, a rejoin). Absent is refused
  // (owner decision O1).
  BOOTSTRAP_MEMBERSHIP: 'bootstrapMembership',
  // The replica joins a group that already exists. Under a GENESIS stamp
  // with no durable record that is a replica whose history is somewhere
  // else: it is refused DURABLE_RECORD_MISSING before the core is entered
  // (owner decision O4), never opened as a founder of an empty log.
  JOINING_EXISTING_GROUP: 'joiningExistingGroup',
  // The opening host's authoritative row proves this replica identity
  // existed before (an earlier incarnation opened its raft record): without
  // a durable record the opening is refused reseed-required and held, under
  // every bootstrap source (the open-time rule, 2026-10-05). Absent is no
  // such proof - a first opening.
  IDENTITY_EXISTED: 'identityExisted',
  // The acknowledgement that this opening's prior-existence fact is durable:
  // a promise the opening host settles once the fact it writes AFTER the
  // port opened (a CREATE_REPLICA target's SYNCING services row) is
  // durable. Present, the participation gate stays closed for everything -
  // no delivered envelope is stepped, no tick, proposal or campaign enters
  // the core - until it resolves (verifier N3: a crash before that write
  // leaves a core that never voted); a rejection never releases it. Absent,
  // the fact is already durable or not this opening's to write.
  IDENTITY_RECORDED: 'identityRecorded',
  // The replica's own durable storage handle. rs-raft keeps a hard state, an
  // applied position, a configuration state and a snapshot beside its
  // entries, so it needs the storage itself, inside whose transactions the
  // group's committed apply also runs.
  DURABLE_STORAGE: 'durableStorage',
  TIMING: 'timing',
  SUBSTRATE: 'substrate',
  DEFER_ELECTION: 'deferElection',
  SEND_TO_PEER: 'sendToPeer',
  RESOLVE_PEER_ADDRESS: 'resolvePeerAddress',
  APPLY_COMMITTED_ENTRY: 'applyCommittedEntry',
  SNAPSHOT_CATCHUP_NEEDED: 'snapshotCatchupNeeded',
  // A durable apply transaction did NOT commit, so any cached applied
  // progress is unreliable and must be re-read from the durable store. It
  // is the fact that crosses, never an event name.
  APPLY_TRANSACTION_ROLLED_BACK: 'applyTransactionRolledBack',
});

/**
 * The clock and randomness a hosted replica hands its consensus port (the
 * rs-raft runtime's timers and ticks run on the clock). Absent keys mean the
 * port resolves the host clock, so production is byte-identical.
 * @param {Object} replica - {providedTimeSource?, providedRandomSource?}.
 * @return {Object} The request's SUBSTRATE.
 */
function hostedConsensusSubstrate(replica) {
  const substrate = {};
  if (replica.providedTimeSource) {
    substrate.timeSource = replica.providedTimeSource;
  }
  if (replica.providedRandomSource) {
    substrate.randomSource = replica.providedRandomSource;
  }
  return substrate;
}

export {RAFT_OPERATION_PORT_REQUEST, hostedConsensusSubstrate};
