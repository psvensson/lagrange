// The rs-raft proposal codec: the one place a proposal becomes the bytes the
// core replicates, and committed bytes become a proposal again.
//
// JSON only. A Lagrange proposal is a JSON command; there is no byte
// pass-through, so every encoded proposal decodes and decoding is total over
// what was encoded. Bytes that do not decode (a corrupted entry, or bytes
// that were never a proposal) fail closed with a typed error rather than
// reaching a consumer as raw bytes.

import {TextDecoder, TextEncoder} from 'node:util';

import {
  RAFT_RS_PROPOSAL_CODEC_ERROR,
  RAFT_RS_PROPOSAL_CODEC_ERROR_MSG,
  RAFT_RS_PROPOSAL_TEXT_ENCODING,
} from './raft-rs-proposal-codec-constants.js';

const PROPOSAL_TEXT_ENCODER = new TextEncoder();
const PROPOSAL_TEXT_DECODER = new TextDecoder(
  RAFT_RS_PROPOSAL_TEXT_ENCODING, {fatal: true});

function codecError(code, message, cause) {
  const error = new Error(message, cause === undefined ? undefined : {cause});
  error.code = code;
  return error;
}

/**
 * Encode a proposal as the bytes the core replicates.
 * @param {*} value - A JSON value (a Lagrange command).
 * @return {Uint8Array} Its UTF-8 JSON text.
 */
function encodeProposal(value) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    throw codecError(RAFT_RS_PROPOSAL_CODEC_ERROR.UNENCODABLE,
      RAFT_RS_PROPOSAL_CODEC_ERROR_MSG.unencodable(error.message), error);
  }
  if (typeof text !== 'string') {
    throw codecError(RAFT_RS_PROPOSAL_CODEC_ERROR.UNENCODABLE,
      RAFT_RS_PROPOSAL_CODEC_ERROR_MSG.unencodable(typeof value));
  }
  return PROPOSAL_TEXT_ENCODER.encode(text);
}

/**
 * Decode the bytes of a committed proposal.
 * @param {Uint8Array} bytes - The committed entry's payload.
 * @return {*} The proposal that was encoded.
 */
function decodeCommittedProposal(bytes) {
  try {
    return JSON.parse(PROPOSAL_TEXT_DECODER.decode(bytes));
  } catch (error) {
    throw codecError(RAFT_RS_PROPOSAL_CODEC_ERROR.UNDECODABLE,
      RAFT_RS_PROPOSAL_CODEC_ERROR_MSG.undecodable(error.message), error);
  }
}

export {decodeCommittedProposal, encodeProposal};
