/**
 * The single owner of the "does this partitions.leader_node_id publication
 * ride the critical delivery lane?" decision (quest
 * partition-leader-row-publication-integrity).
 *
 * A leader-row publication is causally critical whenever the durable row
 * does not already name the publishing leader: the REPLACE/handoff flows
 * that CREATE the divergence dispatch at CRITICAL priority, while the row
 * update that RECORDS their outcome previously rode the first-shed
 * BACKGROUND lane to the very node those flows were saturating (live
 * witnesses: runs user-table-leader-placement-spread-20260811T052645Z and
 * -20260811T054134Z). Divergence is therefore a first-class
 * initial-publication case, not a background refresh:
 *
 * - bootstrap-critical -p1 partitions publish critically (unchanged);
 * - an EMPTY observed row is the classic initial publication (unchanged);
 * - an observed row naming a node OTHER than the publishing leader is a
 *   divergence the reader surface is actively serving as truth — the
 *   correction is as critical as the handoff that caused it;
 * - no observation at all means divergence cannot be ruled out, so the
 *   publication fails toward the critical lane.
 *
 * Only an observed row already naming the publishing leader itself is a
 * routine background refresh.
 */

import {
  isBootstrapCriticalSystemPartitionId,
} from '../bootstrap/system-partition-classification.js';

const EMPTY_LENGTH = 0;

function readNodeId(value) {
  return typeof value === 'string' && value.length > EMPTY_LENGTH ?
    value :
    null;
}

/**
 * Decide whether a partitions.leader_node_id publication is critical.
 *
 * @param {Object} evidence
 * @param {string} evidence.partitionId - Partition whose row is published.
 * @param {string|null} evidence.observedLeaderNodeId - The leader the
 *   observed (authoritative preferred, else cached) row currently names;
 *   null when no observation is available.
 * @param {string|null} evidence.publishingNodeId - The node publishing
 *   itself as leader; null when unknown.
 * @return {boolean} True when the publication must ride the critical lane.
 */
function isCriticalLeaderPublication(evidence = {}) {
  if (isBootstrapCriticalSystemPartitionId(evidence.partitionId)) {
    return true;
  }
  const observedLeaderNodeId = readNodeId(evidence.observedLeaderNodeId);
  if (observedLeaderNodeId === null) {
    return true;
  }
  const publishingNodeId = readNodeId(evidence.publishingNodeId);
  if (publishingNodeId === null) {
    return true;
  }
  return observedLeaderNodeId !== publishingNodeId;
}

export {isCriticalLeaderPublication};
