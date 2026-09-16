// Owner passes on the hosted real owners, charged by real turn counts: each
// pass runs inside the production attribution seam (FormationTurnAttribution
// with an injected clock), the seam counts the event-loop turns the pass
// dispatched per owner, and those segments are charged to the node through
// the accumulator at the calibrated cost. The observations the signature
// needs are read from the owners' return values, never from logs:
// readiness from the planning gate's decision, spread from the census owner
// over the node's own rows, in-flight from the liveness summary.

import {FORMATION_OWNER} from '../../src/diagnostics/formation-diagnostics-contract.js';
import {
  FormationTurnAttribution,
  runFormationOwner,
  runOnExecutionNode,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {
  buildDerivedPriorityPartitionSummary,
} from '../../src/control-plane/membership-publication-priority-partition-summary.js';
import {
  summarizeReplicaOperationLiveness,
} from '../../src/rebalancer/replica-operation-liveness.js';
import {TABLES} from '../../src/constants/index.js';
import {guardedDispatch} from './formation-sim-guard.js';

const ZERO = 0;
const OWN_SEGMENT = 1;
const NODE_OWNER_SEPARATOR = '\u0000';

/**
 * Real turn counting for the simulator: one seam instance per run, its
 * clock the virtual one (segments are counted, not timed, here).
 */
class OwnerTurnMeter {
  constructor({network, charges}) {
    this.charges = charges;
    this.attribution = new FormationTurnAttribution({
      // Multi-node deterministic mode: an attributed segment with no
      // execution node is a forgotten scheduling seam, and it must be loud
      // rather than land in unattributed or on whichever node ran last.
      requireExecutionNode: true,
      captureUnboundProvenance: true,
      clock: () => Math.round(network.now()) * ZERO + this.ticks,
    });
    this.ticks = ZERO;
    this.attribution.start();
    this.counts = this.snapshotCounts();
  }

  // Counts keyed by the execution node the SCHEDULER bound to each segment,
  // not by whichever bracket is open. The counting convention itself is
  // untouched: a segment is still dispatchCount + handoffCount.
  snapshotCounts() {
    const snapshot = this.attribution.snapshot();
    const counts = new Map();
    for (const node of snapshot?.byExecutionNode || []) {
      for (const entry of node.owners) {
        counts.set(`${node.executionNodeId}${NODE_OWNER_SEPARATOR}${entry.owner}`,
          entry.dispatchCount + entry.handoffCount);
      }
    }
    return counts;
  }

  // Charge every per-node delta the seam recorded since the last snapshot.
  chargeDelta() {
    const after = this.snapshotCounts();
    for (const [key, count] of after) {
      const delta = count - (this.counts.get(key) || ZERO);
      if (delta <= ZERO) continue;
      const separator = key.indexOf(NODE_OWNER_SEPARATOR);
      this.charges.segment(key.slice(ZERO, separator),
        key.slice(separator + NODE_OWNER_SEPARATOR.length), delta);
    }
    this.counts = after;
  }

  /**
   * Run one owner pass on a node and charge the turns it dispatched.
   * @param {string} nodeId
   * @param {string} owner FORMATION_OWNER value
   * @param {Function} pass async body
   * @returns {Promise<*>} the pass result
   */
  pass(nodeId, owner, pass) {
    return runOnExecutionNode(nodeId, () => this.passOnNode(nodeId, owner, pass));
  }

  async passOnNode(nodeId, owner, pass) {
    this.ticks += 1;
    const result = await runFormationOwner(owner,
      () => guardedDispatch(owner, () => pass()));
    this.ticks += 1;
    this.chargeDelta();
    // The pass's own turn. The seam counts a handoff only inside an open
    // segment, so the outermost runFormationOwner - this dispatch - counts
    // neither a dispatch nor a handoff, and a synchronous pass with no
    // handoff used to cost nothing at all. The constraint is that every
    // exclusive segment is charged, and this dispatch is one.
    this.charges.segment(nodeId, owner, OWN_SEGMENT);
    return result;
  }

  /**
   * Charge one scheduled dispatch on a node WITHOUT naming an owner. The
   * simulator owns scheduling and charging only, so when a real initiator's
   * callback runs, the harness brackets it and charges whatever owners the
   * production seam reports from inside. Nothing here decides that readiness,
   * or any other owner, ran.
   * @param {string} nodeId
   * @param {Function} body
   * @returns {Promise<*>}
   */
  // Explicit scheduler work for node N executes on N. The ENTIRE async body
  // runs inside the frame, awaits included: entering it only around the
  // synchronous call would leave the promise this function awaits created
  // outside the frame, and its continuation unbound.
  dispatch(nodeId, body) {
    return runOnExecutionNode(nodeId, async () => {
      this.ticks += 1;
      const result = await guardedDispatch(FORMATION_OWNER.UNATTRIBUTED,
        () => body());
      this.ticks += 1;
      this.chargeDelta();
      return result;
    });
  }

  stop() {
    return this.attribution.stop();
  }
}

/**
 * The census owner over the node's own rows.
 * @param {object} hosts
 * @param {string[]} eligibleNodeIds
 * @returns {{prioritySpreadGap: number, inFlightCount: number, satisfied: boolean}}
 */
function spreadObservation(hosts, eligibleNodeIds) {
  const cache = hosts.cache;
  const summary = buildDerivedPriorityPartitionSummary({
    partitionRows: cache.getAll(TABLES.PARTITIONS),
    serviceRows: cache.getAll(TABLES.SERVICES),
    locallyEligibleNodeIds: eligibleNodeIds,
  });
  const liveness = summarizeReplicaOperationLiveness(
    cache.getAll(TABLES.REPLICA_OPERATIONS), {nowMs: hosts.now()});
  const blocked = summary?.blockedPartitions || [];
  return {
    prioritySpreadGap: blocked.reduce((sum, entry) => sum + (entry.spreadGap || ZERO), ZERO),
    inFlightCount: liveness?.inFlightCount ?? ZERO,
    satisfied: summary?.satisfied === true,
    blockedPartitionCount: blocked.length,
  };
}

export {OwnerTurnMeter, spreadObservation};
