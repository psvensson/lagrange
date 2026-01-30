/**
 * Shared Raft packet utilities.
 * Used by both MessageGroupService and PartitionService for consistent
 * Raft packet detection without type conversion.
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import {TYPEOF} from '../constants/index.js';
import {RAFT_PACKET_TYPES} from './constants.js';

/**
 * Detect if a payload is a native liferaft Raft packet.
 * Checks for native liferaft type values: 'vote', 'voted', 'append', 'appended'.
 * This function is shared between MessageGroupService and PartitionService
 * to ensure consistent Raft packet detection.
 * Requirements: 2.1, 2.4, 9.1, 9.3
 * @param {Object} payload - Message payload to check.
 * @return {boolean} True if payload is a Raft packet.
 */
function isRaftPacket(payload) {
  return Boolean(
    payload &&
    typeof payload.type === TYPEOF.STRING &&
    RAFT_PACKET_TYPES.has(payload.type),
  );
}

export {
  RAFT_PACKET_TYPES,
  isRaftPacket,
};
