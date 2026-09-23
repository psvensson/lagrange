// The names the rs-raft proposal codec owns.

// A committed proposal whose bytes do not decode as the JSON a proposal was
// encoded to. Decoding fails closed with this code rather than handing raw
// bytes (or nothing) to a consumer of the committed log.
const RAFT_RS_PROPOSAL_CODEC_ERROR = Object.freeze({
  UNDECODABLE: 'committed_proposal_undecodable',
  UNENCODABLE: 'proposal_unencodable',
});

const RAFT_RS_PROPOSAL_CODEC_ERROR_MSG = Object.freeze({
  undecodable: (reason) =>
    `a committed raft-rs proposal is not decodable JSON: ${reason}`,
  unencodable: (kind) =>
    `a raft-rs proposal must be a JSON value, got ${kind}`,
});

// Proposals cross the core as UTF-8 JSON text.
const RAFT_RS_PROPOSAL_TEXT_ENCODING = 'utf-8';

export {
  RAFT_RS_PROPOSAL_CODEC_ERROR,
  RAFT_RS_PROPOSAL_CODEC_ERROR_MSG,
  RAFT_RS_PROPOSAL_TEXT_ENCODING,
};
