// The hostile message shapes driven against the ingress boundary, and the
// owner's own list of the shapes that must be driven.
//
// The list is READ out of §7 of the binding direction rather than copied
// here, so a shape the owner names and nobody drives is a failing test rather
// than an omission nobody notices. Each shape below says which sentence of §7
// it answers; two of them answer the same sentence, because the round-3
// verifier measured two different outcomes for it.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, '..', '..', '..');
const OWNER_DIRECTION_FILE = path.join(REPOSITORY_ROOT, 'solve', 'epics',
  'formation-seed-decoupling',
  'binding-direction-raft-rs-experimental-backend-2026-09-21.md');
const PROBE_FILE = path.join(HERE, 'hostile-message-probe.js');
const TEXT_ENCODING = 'utf8';
const OWNER_LIST_MARKER = 'Test at least:';
const LIST_SEPARATOR = ';';
const SENTENCE_END = '.';
const WHITESPACE = /\s+/gu;

/**
 * The shapes §7 names, normalized to one line each.
 * @return {Array<string>} The owner's own list.
 */
function readOwnerHostileShapes() {
  const document = fs.readFileSync(OWNER_DIRECTION_FILE, TEXT_ENCODING);
  const start = document.indexOf(OWNER_LIST_MARKER);
  if (start < 0) {
    throw new Error(
      `${OWNER_DIRECTION_FILE} no longer says "${OWNER_LIST_MARKER}"; the ` +
      'shapes to drive are the owner\'s list, not this file\'s');
  }
  const afterMarker = document.slice(start + OWNER_LIST_MARKER.length);
  const sentence = afterMarker.slice(0, afterMarker.indexOf(SENTENCE_END));
  return Object.freeze(sentence.split(LIST_SEPARATOR)
    .map((item) => item.replace(WHITESPACE, ' ').trim())
    .filter((item) => item.length > 0));
}

const OWNER_HOSTILE_SHAPE_TEXT = readOwnerHostileShapes();

const OWNER_SHAPE_AT = Object.freeze({
  MISROUTED_HEARTBEAT: 0,
  IMPOSSIBLE_COMMIT: 1,
  READ_INDEX: 2,
  NON_CONTIGUOUS_APPEND: 3,
  APPEND_RESPONSE_BEYOND_LOG: 4,
  TIMEOUT_NOW: 5,
  TRANSFER_LEADER: 6,
});

function shape(id, ownerIndex) {
  return Object.freeze({id, ownerText: OWNER_HOSTILE_SHAPE_TEXT[ownerIndex]});
}

// Each shape the probe can drive. Two answer §7's misrouted-heartbeat
// sentence, because the verifier found the group check fails open when the
// envelope carries no group id at all; two answer its ReadIndex sentence,
// because the verifier measured the empty request fatal on a follower as
// well as on a leader.
const HOSTILE_SHAPE = Object.freeze({
  MISROUTED_HEARTBEAT_WITH_GROUP_ID: shape(
    'misrouted-heartbeat-with-group-id', OWNER_SHAPE_AT.MISROUTED_HEARTBEAT),
  MISROUTED_HEARTBEAT_WITHOUT_GROUP_ID: shape(
    'misrouted-heartbeat-without-group-id',
    OWNER_SHAPE_AT.MISROUTED_HEARTBEAT),
  HEARTBEAT_WITH_IMPOSSIBLE_COMMIT: shape(
    'heartbeat-with-impossible-commit', OWNER_SHAPE_AT.IMPOSSIBLE_COMMIT),
  EMPTY_READ_INDEX_TO_LEADER: shape(
    'empty-read-index-to-leader', OWNER_SHAPE_AT.READ_INDEX),
  EMPTY_READ_INDEX_TO_FOLLOWER: shape(
    'empty-read-index-to-follower', OWNER_SHAPE_AT.READ_INDEX),
  NON_CONTIGUOUS_APPEND: shape(
    'non-contiguous-append', OWNER_SHAPE_AT.NON_CONTIGUOUS_APPEND),
  APPEND_RESPONSE_BEYOND_LEADER_LOG: shape(
    'append-response-beyond-leader-log',
    OWNER_SHAPE_AT.APPEND_RESPONSE_BEYOND_LOG),
  TIMEOUT_NOW_FROM_UNEXPECTED_SENDER: shape(
    'timeout-now-from-unexpected-sender', OWNER_SHAPE_AT.TIMEOUT_NOW),
  TRANSFER_LEADER_FROM_UNEXPECTED_SENDER: shape(
    'transfer-leader-from-unexpected-sender', OWNER_SHAPE_AT.TRANSFER_LEADER),
});

/**
 * Where the child-process probe lives. Each shape runs in its own process,
 * because a trap makes the runtime it happened in unusable.
 * @return {string} An absolute path.
 */
function hostileShapeProbePath() {
  return PROBE_FILE;
}

export {HOSTILE_SHAPE, OWNER_HOSTILE_SHAPE_TEXT, hostileShapeProbePath};
