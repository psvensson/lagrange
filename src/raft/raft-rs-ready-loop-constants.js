// Values the Ready loop needs that belong to raft-rs's own wire model.

// raft-rs eraftpb EntryType, as the binding's num_to_entry_type maps it.
const RAFT_RS_ENTRY_TYPE = Object.freeze({
  NORMAL: 0,
  CONF_CHANGE: 1,
  CONF_CHANGE_V2: 2,
});

const RAFT_RS_CONF_CHANGE_ENTRY_TYPES = Object.freeze([
  RAFT_RS_ENTRY_TYPE.CONF_CHANGE,
  RAFT_RS_ENTRY_TYPE.CONF_CHANGE_V2,
]);

// Which half of the cycle a committed entry was delivered in. The two halves
// are separate steps of the host contract, so the journal names them apart
// rather than leaving the reader to infer it from position.
const RAFT_RS_APPLY_PHASE = Object.freeze({
  READY: 'ready',
  LIGHT_READY: 'lightReady',
});

// Whether the core had a Ready for the cycle that was asked for. The absence
// of a cycle is a state the loop names, not an empty value the caller has to
// interpret (R07): a drain stops on NOTHING_READY, and every cycle it keeps
// carries CYCLE_RAN.
const RAFT_RS_CYCLE_OUTCOME = Object.freeze({
  CYCLE_RAN: 'cycle-ran',
  NOTHING_READY: 'nothing-ready',
});

const RAFT_RS_LOOP_ERROR_MSG = Object.freeze({
  unknownStep: (id) =>
    `the host contract names a step ${JSON.stringify(id)} the loop has no ` +
    'handler for; the contract and the loop must change together',
});

export {
  RAFT_RS_APPLY_PHASE,
  RAFT_RS_CONF_CHANGE_ENTRY_TYPES,
  RAFT_RS_CYCLE_OUTCOME,
  RAFT_RS_ENTRY_TYPE,
  RAFT_RS_LOOP_ERROR_MSG,
};
