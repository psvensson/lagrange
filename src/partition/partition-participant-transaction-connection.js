// The partition connection as participant admission sees it (TX1 design
// revision 10, 0.0.14, the L6 clause; owner ruling 2026-10-11, boundary A):
// - the lifecycle owner's open stamps every connection: initialize runs the
//   participant store's open hook on each connection it opens, which records
//   the stamp here with its generation (opens counted in this process);
// - participant admission is enabled only on a connection with a proved clean
//   stamp. For any other connection the cutover reopens it through the
//   lifecycle owner (shutdown, then initialize on the same database) after
//   the drain.

// Per connection: its stamp, written by the open hook.
const STAMPS = new WeakMap();
// A connection the open hook never stamped: its history is unknown, so it
// counts as having served the legacy path.
const UNSTAMPED = Object.freeze({generation: null, servedLegacy: true});
let openedConnections = 0;

/**
 * Stamp a connection as the lifecycle owner opens it (the participant store's
 * open hook): a new generation that has served no legacy session yet.
 * @param {Object} db - The partition's newly opened connection.
 */
function stampParticipantConnection(db) {
  openedConnections += 1;
  STAMPS.set(db, {generation: openedConnections, servedLegacy: false});
}

/**
 * The connection's stamp: its generation, and whether a legacy session was
 * let onto it since its open (true for a connection never stamped).
 * @param {Object} db - The partition's connection.
 * @return {{generation: (number|null), servedLegacy: boolean}} The stamp.
 */
function participantConnectionStampOf(db) {
  const stamp = STAMPS.get(db);
  return stamp === undefined ? UNSTAMPED : Object.freeze({...stamp});
}

export {
  participantConnectionStampOf,
  stampParticipantConnection,
};
