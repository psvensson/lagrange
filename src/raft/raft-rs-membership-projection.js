// Consensus membership under the raft-rs backend, and the one direction
// Lagrange rows move in.
//
// The core's committed configuration is the authority (binding direction §5).
// The two authority reads here take a core and a handle and nothing else:
// there is no row parameter, no cache parameter and no lifecycle parameter, so
// no cached answer can be substituted for the committed one. They add no
// judgment either - they hand back what `conf_state` returned, frozen.
//
// `LagrangeMembershipRows` is the outward projection (§17). It holds a
// membership column and a lifecycle column per member. It has no core, no
// handle and no Raft call: a row edit is a row edit, and there is no path
// from one to an active configuration. Editing a row is allowed and useless,
// which is exactly the property the liferaft part A case failed.

import {
  LAGRANGE_LIFECYCLE_UNKNOWN,
  LAGRANGE_MEMBERSHIP,
  LAGRANGE_MEMBERSHIP_ERROR_MSG,
  LAGRANGE_MEMBERSHIP_SOURCE,
} from './raft-rs-membership-projection-constants.js';

const MEMBERSHIP_VALUES = Object.freeze(Object.values(LAGRANGE_MEMBERSHIP));

/**
 * The committed configuration's member lists, exactly as the core reports
 * them. The only inputs are the core and the handle.
 * @param {Object} options - The read.
 * @param {Object} options.core - The raft-rs primitive facade.
 * @param {number} options.handle - This group's core handle.
 * @return {Object} The frozen ConfState the core returned.
 */
function readCommittedConfiguration({core, handle}) {
  const confState = core.conf_state(handle);
  return Object.freeze({
    voters: Object.freeze([...confState.voters]),
    learners: Object.freeze([...confState.learners]),
    votersOutgoing: Object.freeze([...confState.votersOutgoing]),
    learnersNext: Object.freeze([...confState.learnersNext]),
    autoLeave: confState.autoLeave,
  });
}

/**
 * The peers consensus membership is counted over: the committed
 * configuration's incoming and outgoing voter sets. Whether a given set of
 * them is a quorum is raft-rs's decision, not this module's.
 * @param {Object} options - The read.
 * @param {Object} options.core - The raft-rs primitive facade.
 * @param {number} options.handle - This group's core handle.
 * @return {Object} {voters, votersOutgoing}, frozen.
 */
function consensusMembership({core, handle}) {
  const committed = readCommittedConfiguration({core, handle});
  return Object.freeze({
    voters: committed.voters,
    votersOutgoing: committed.votersOutgoing,
  });
}

/**
 * The committed configuration as Lagrange membership rows. Derived from the
 * core's own read; a member appears once, under the list the configuration
 * put it in.
 * @param {Object} options - The read.
 * @param {Object} options.core - The raft-rs primitive facade.
 * @param {number} options.handle - This group's core handle.
 * @return {Array<Object>} Frozen {peerId, membership} rows.
 */
function membershipRowsFromConfState({core, handle}) {
  const committed = readCommittedConfiguration({core, handle});
  const projected = [];
  for (const source of LAGRANGE_MEMBERSHIP_SOURCE) {
    for (const peerId of committed[source.confStateField]) {
      projected.push(Object.freeze({
        peerId, membership: source.membership,
      }));
    }
  }
  return Object.freeze(projected);
}

/**
 * Lagrange's outward record of membership and operational lifecycle.
 *
 * It is a projection sink and a lifecycle store. It cannot reach a core, so
 * nothing written here changes what a quorum is.
 */
class LagrangeMembershipRows {
  /** Start with no rows. */
  constructor() {
    this.byPeerId = new Map();
  }

  /**
   * Record which membership a peer is held in. A caller may write anything;
   * the next projection overwrites it from the committed configuration.
   * @param {string} peerId - The raft peer id as a decimal string.
   * @param {string} membership - A LAGRANGE_MEMBERSHIP value.
   */
  declareMembership(peerId, membership) {
    if (!MEMBERSHIP_VALUES.includes(membership)) {
      throw new Error(
        LAGRANGE_MEMBERSHIP_ERROR_MSG.unknownMembership(membership));
    }
    const existing = this.byPeerId.get(peerId);
    this.byPeerId.set(peerId, {
      peerId,
      membership,
      lifecycle: existing ? existing.lifecycle : LAGRANGE_LIFECYCLE_UNKNOWN,
    });
  }

  /**
   * Record a peer's operational lifecycle. Lifecycle is not membership: a
   * peer catching up is still whatever the committed configuration says.
   * @param {string} peerId - The raft peer id as a decimal string.
   * @param {string} lifecycle - The lifecycle name Lagrange uses.
   */
  setLifecycle(peerId, lifecycle) {
    const existing = this.byPeerId.get(peerId);
    this.byPeerId.set(peerId, {
      peerId,
      membership: existing ? existing.membership : LAGRANGE_MEMBERSHIP.LEARNER,
      lifecycle,
    });
  }

  /**
   * Drop a peer's row.
   * @param {string} peerId - The raft peer id as a decimal string.
   */
  forget(peerId) {
    this.byPeerId.delete(peerId);
  }

  /**
   * The lifecycle a peer's row carries, or the named unknown state.
   * @param {string} peerId - The raft peer id as a decimal string.
   * @return {string} The lifecycle.
   */
  lifecycleOf(peerId) {
    const existing = this.byPeerId.get(peerId);
    return existing ? existing.lifecycle : LAGRANGE_LIFECYCLE_UNKNOWN;
  }

  /**
   * Every row, in the order the last projection wrote them.
   * @return {Array<Object>} Frozen rows.
   */
  read() {
    return Object.freeze([...this.byPeerId.values()].map(
      (row) => Object.freeze({...row})));
  }

  /**
   * Replace every membership row with the given ones, keeping each peer's
   * lifecycle. Rows for peers the configuration no longer names go away.
   * @param {Array<Object>} rows - {peerId, membership} from the core.
   */
  replaceMembership(rows) {
    const lifecycles = new Map(
      [...this.byPeerId.values()].map((row) => [row.peerId, row.lifecycle]));
    this.byPeerId = new Map(rows.map((row) => [row.peerId, {
      peerId: row.peerId,
      membership: row.membership,
      lifecycle: lifecycles.has(row.peerId) ?
        lifecycles.get(row.peerId) : LAGRANGE_LIFECYCLE_UNKNOWN,
    }]));
  }
}

/**
 * Project the committed configuration onto Lagrange rows. One direction only:
 * the core is read, the rows are written.
 * @param {Object} options - The projection.
 * @param {Object} options.core - The raft-rs primitive facade.
 * @param {number} options.handle - This group's core handle.
 * @param {LagrangeMembershipRows} options.rows - The sink.
 * @return {Array<Object>} The rows that were written.
 */
function projectMembershipOntoRows({core, handle, rows}) {
  const projected = membershipRowsFromConfState({core, handle});
  rows.replaceMembership(projected);
  return projected;
}

export {
  LAGRANGE_MEMBERSHIP,
  LagrangeMembershipRows,
  consensusMembership,
  membershipRowsFromConfState,
  projectMembershipOntoRows,
};
