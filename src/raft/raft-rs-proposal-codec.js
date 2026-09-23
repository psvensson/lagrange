// The proposal codec of the rs-raft partition port: the one owner of how a
// Lagrange command becomes the bytes a proposal carries and how a committed
// entry's bytes become that command again. The port that encodes is the one
// that decodes, so the two directions live together here.
//
// Lagrange proposals are JSON commands, so the codec is JSON over UTF-8 and
// nothing else: there is no byte pass-through, which makes decoding total.
// A committed entry whose bytes are not a JSON command is a typed failure,
// never a silently applied non-command.

import {TextDecoder, TextEncoder} from 'node:util';

const COMMITTED_PROPOSAL_UNDECODABLE = 'committed_proposal_undecodable';
const UNENCODABLE_PROPOSAL_MESSAGE =
  'a partition proposal must be a JSON-encodable command';
const UNDECODABLE_PROPOSAL_MESSAGE =
  'a committed partition entry does not carry a JSON command';
const PROPOSAL_TEXT_ENCODING = 'utf-8';

const PROPOSAL_ENCODER = new TextEncoder();
const PROPOSAL_DECODER = new TextDecoder(PROPOSAL_TEXT_ENCODING, {
  fatal: true,
});

/**
 * Encode one partition command as the bytes a proposal carries.
 * @param {*} value - A JSON-encodable command.
 * @return {Uint8Array} Its UTF-8 JSON bytes.
 */
function encodeProposal(value) {
  const text = JSON.stringify(value);
  if (typeof text !== 'string') {
    throw new TypeError(UNENCODABLE_PROPOSAL_MESSAGE);
  }
  return PROPOSAL_ENCODER.encode(text);
}

/**
 * Decode the bytes of one committed entry back into its command.
 * @param {Uint8Array} bytes - The committed entry's data.
 * @return {*} The command that was proposed.
 * @throws {Error} With `.code = 'committed_proposal_undecodable'` when the
 *   bytes are not UTF-8 JSON.
 */
function decodeCommittedProposal(bytes) {
  try {
    return JSON.parse(PROPOSAL_DECODER.decode(bytes));
  } catch (cause) {
    const error = new Error(`${UNDECODABLE_PROPOSAL_MESSAGE}: ${cause.message}`,
      {cause});
    error.code = COMMITTED_PROPOSAL_UNDECODABLE;
    throw error;
  }
}

export {decodeCommittedProposal, encodeProposal};
