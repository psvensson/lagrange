// The partition connection as participant admission sees it (TX1 design
// revision 10, 0.0.14, the L6 clause; owner ruling 2026-10-11, boundary A).
// The statement-admission owner now admits every legacy session statement
// before anything is prepared, which prevents new connection state, but it
// cleans nothing a connection already holds: a PRAGMA flag, a TEMP trigger or
// a TEMP table set on it stays until the connection closes. So:
// - the lifecycle owner's open stamps every connection: initialize runs the
//   participant store's open hook on each connection it opens, which records
//   the stamp here with its generation (opens counted in this process);
// - the L6 fence records on the stamp every legacy session it lets onto the
//   connection;
// - participant admission is enabled only on a connection that served no
//   legacy session since its open. For any other connection the cutover's
//   step is to reopen it through the lifecycle owner (shutdown, then
//   initialize on the same database) after the drain and the legacy path's
//   retirement.

// Per connection: its stamp, written by the open hook and the L6 fence.
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
 * Record that the L6 fence let a legacy session onto this connection: it
 * stays unclean for participant admission until it is reopened.
 * @param {Object} db - The partition's connection.
 */
function noteLegacySessionServed(db) {
  const stamp = STAMPS.get(db);
  if (stamp !== undefined) {
    stamp.servedLegacy = true;
  }
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
  noteLegacySessionServed,
  participantConnectionStampOf,
  stampParticipantConnection,
};
